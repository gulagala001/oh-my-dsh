const stale = message => Object.assign(new Error(message), {code:'STALE_OBSERVATION',details:{inputDispatched:false}});

/** A backend node belongs to one real frame document, never just a CDP number. */
export function axElementKey(backendNodeId, route) {
  return route ? `${route.frameId}:${route.documentId}:${backendNodeId}` : String(backendNodeId);
}

const ownersKey = owners => JSON.stringify(owners.map(owner=>[owner.backendNodeId,owner.frameId]).sort((a,b)=>a[0]-b[0]));

/** Read Chromium AX trees through the same document routes used for input.
 * Results are private until every frame and its owner has passed validation.
 */
export async function captureAXTree(send, router, check = () => {}) {
  // The standalone helper API also accepts a single-frame transport. Production
  // browser, extension and guest observations always supply their frame router.
  if (!router) {
    const {nodes} = await send('Accessibility.getFullAXTree');
    check();
    if (!Array.isArray(nodes)) throw new Error('Chromium returned no accessibility tree');
    return {nodes:nodes.filter(node=>!node.ignored).map(node=>({node,key:axElementKey(node.backendDOMNodeId)})),validate:async()=>{check();}};
  }
  const snapshots = [], visited = new Set();
  const readOwners = async route => {
    check();
    const reply = await route.send('Runtime.evaluate',{contextId:route.contextId,expression:'document'});
    if (reply.exceptionDetails || !reply.result?.objectId) throw stale('An observed frame document is no longer available');
    const objectId = reply.result.objectId;
    try {
      // Page.getFrameTree omits OOPIFs. Read actual DOM owners from this exact
      // document instead; ARIA can also change an iframe's AX role to button.
      const {node} = await route.send('DOM.describeNode',{objectId,depth:-1,pierce:true});
      check();
      const owners = [], pending = [node];
      while (pending.length) {
        const node = pending.pop(), frameId = node.frameId ?? node.contentDocument?.frameId;
        if (frameId && frameId !== route.frameId || /^(?:IFRAME|FRAME)$/u.test(node.nodeName)) {
          owners.push({backendNodeId:node.backendNodeId,frameId});
          continue; // Another document's owners belong to its own routed read.
        }
        const children = [...node.children ?? [],...node.shadowRoots ?? []];
        for (let index = children.length-1; index >= 0; index--) pending.push(children[index]);
      }
      return owners;
    } finally {await route.send('Runtime.releaseObject',{objectId}).catch(()=>{});}
  };
  const visit = async route => {
    check();
    if (visited.has(route.frameId)) throw stale('Frame ancestry changed during accessibility observation');
    visited.add(route.frameId);
    await router.validate(route);
    const frameOwners = await readOwners(route);
    snapshots.push({route,owners:ownersKey(frameOwners)});
    const reply = await route.send('Accessibility.getFullAXTree',{frameId:route.frameId});
    check();
    if (!Array.isArray(reply.nodes)) throw new Error('Chromium returned no accessibility tree');
    const prefix = `${route.frameId}:${route.documentId}:`;
    const nodes = reply.nodes.filter(node=>!node.ignored).map(node=>({
      node:{...node,nodeId:prefix+node.nodeId,childIds:(node.childIds ?? []).map(id=>prefix+id)},
      route,key:axElementKey(node.backendDOMNodeId,route),
    }));
    const owners = new Map(nodes.filter(entry=>entry.node.backendDOMNodeId).map(entry=>[entry.node.backendDOMNodeId,entry]));
    const root = nodes.find(entry=>entry.node.frameId === route.frameId && entry.node.role?.value === 'RootWebArea');
    if (!root) throw stale('Chromium returned no accessible root for a frame document; observe again');
    for (const {frameId,backendNodeId} of frameOwners) {
      if (!backendNodeId) throw stale('An observed frame has no live DOM owner; observe again');
      const accessibleOwner = owners.get(backendNodeId);
      // Chromium excludes aria-hidden/display:none frames from accessibility.
      // Their documents must not add controls absent from the parent's AX tree.
      if (!accessibleOwner) continue;
      if (!frameId) throw stale('An accessible frame has no live document; observe again');
      const {node:owner} = await route.send('DOM.describeNode',{backendNodeId});
      check();
      if ((owner.frameId ?? owner.contentDocument?.frameId) !== frameId) throw stale('Frame owner changed during accessibility observation');
      const descendants = await visit(await router.child(route,backendNodeId,frameId));
      accessibleOwner.node.childIds.push(descendants.rootId);
      nodes.push(...descendants.nodes);
    }
    return {nodes,rootId:root.node.nodeId};
  };
  const captured = await visit(await router.main());
  const validate = async () => {
    for (const snapshot of snapshots) {
      check();
      await router.validate(snapshot.route);
      if (ownersKey(await readOwners(snapshot.route)) !== snapshot.owners) throw stale('Frame owners changed during accessibility observation; observe again');
    }
    check();
  };
  return {nodes:captured.nodes,validate};
}
