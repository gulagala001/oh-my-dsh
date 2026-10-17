/** DOM hit testing takes page coordinates; input and element boxes use the viewport. */
export async function hitTestViewport(send, point) {
  const metrics = await send('Page.getLayoutMetrics');
  const viewport = metrics.cssLayoutViewport ?? metrics.layoutViewport;
  return send('DOM.getNodeForLocation', {x:Math.floor(point.x+viewport.pageX),y:Math.floor(point.y+viewport.pageY),includeUserAgentShadowDOM:false});
}

/** CDP sessions for real frame documents, including out-of-process iframes. */
export function createCDPFrameRouter(sendRoot, subscribe) {
  const sessions = new Map(), pending = new Map();
  let sequence = 0, closed = false;
  const failure = (message, code = 'STALE_ELEMENT') => Object.assign(new Error(message), {code, details:{inputDispatched:false}});
  const unwrap = reply => {
    if (reply.exceptionDetails) throw failure(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
    return reply.result.value;
  };
  const listen = (method, params) => {
    if (method === 'Target.receivedMessageFromTarget') {
      let reply; try { reply = JSON.parse(params.message); } catch { return; }
      if (reply.id) {
        const key = `${params.sessionId}:${reply.id}`, task = pending.get(key);
        if (!task) return;
        pending.delete(key); clearTimeout(task.timer);
        reply.error ? task.reject(failure(reply.error.message)) : task.resolve(reply.result);
      }
    }
    if (method === 'Target.detachedFromTarget') {
      for (const session of sessions.values()) if (session.id === params.sessionId) session.valid = false;
      for (const [key, task] of pending) if (key.startsWith(`${params.sessionId}:`)) { pending.delete(key); clearTimeout(task.timer); task.reject(failure('Frame target detached', 'FRAME_DETACHED')); }
    }
  };
  const unsubscribe = subscribe(listen);
  const childSend = session => (method, params = {}) => {
    if (closed || !session.valid) return Promise.reject(failure('Frame CDP session is detached', 'FRAME_DETACHED'));
    const id = ++sequence, key = `${session.id}:${id}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {pending.delete(key); reject(failure('Frame CDP command timed out', 'FRAME_DETACHED'));}, 10000);
      pending.set(key, {resolve,reject,timer});
      Promise.resolve(sendRoot('Target.sendMessageToTarget', {sessionId:session.id,message:JSON.stringify({id,method,params})})).catch(error => {
        const task = pending.get(key); if (!task) return;
        pending.delete(key); clearTimeout(timer); reject(error);
      });
    });
  };
  const makeRoute = async (send, frameId, sessionId, sessionFrameId, owners) => {
    const {executionContextId} = await send('Page.createIsolatedWorld', {frameId,worldName:'opencu-frame-locators',grantUniveralAccess:false});
    const token = unwrap(await send('Runtime.evaluate', {contextId:executionContextId,returnByValue:true,expression:`globalThis.__opencuFrameDocument ??= ${JSON.stringify(globalThis.crypto.randomUUID())}`}));
    return {send,frameId,sessionId,sessionFrameId,contextId:executionContextId,documentId:token,owners};
  };
  const validateDocument = async route => {
    if (closed) throw failure('Frame router is closed', 'FRAME_DETACHED');
    const token = unwrap(await route.send('Runtime.evaluate', {contextId:route.contextId,returnByValue:true,expression:'globalThis.__opencuFrameDocument'}));
    if (token !== route.documentId) throw failure('Frame document changed', 'FRAME_DETACHED');
  };
  const validate = async route => {
    for (const owner of route.owners) {
      await validateDocument(owner.parent);
      const {node} = await owner.parent.send('DOM.describeNode', {backendNodeId:owner.backendNodeId});
      if ((node.frameId ?? node.contentDocument?.frameId) !== owner.frameId) throw failure('Frame element was removed or replaced', 'FRAME_DETACHED');
    }
    await validateDocument(route);
  };
  const main = async () => {
    if (closed) throw failure('Frame router is closed', 'FRAME_DETACHED');
    const {frameTree} = await sendRoot('Page.getFrameTree');
    return makeRoute(sendRoot,frameTree.frame.id,'',frameTree.frame.id,[]);
  };
  const child = async (parent, backendNodeId, frameId) => {
    await validate(parent);
    if (!frameId) throw failure('The selected frame has no live document', 'FRAME_NOT_FOUND');
    const owner = {parent,backendNodeId,frameId};
    try {
      const route = await makeRoute(parent.send,frameId,parent.sessionId,parent.sessionFrameId,[...parent.owners,owner]);
      owner.childSessionId = route.sessionId;
      return route;
    } catch (sameProcessError) {
      let session = sessions.get(frameId);
      if (!session?.valid) {
        let attached;
        try { attached = await sendRoot('Target.attachToTarget', {targetId:frameId,flatten:false}); }
        catch (error) { throw failure(`Frame document is unavailable: ${error.message}`, 'FRAME_DETACHED'); }
        session = {id:attached.sessionId,valid:true}; session.send = childSend(session); sessions.set(frameId,session);
      }
      try {
        const route = await makeRoute(session.send,frameId,session.id,frameId,[...parent.owners,owner]);
        owner.childSessionId = route.sessionId;
        return route;
      } catch (error) { throw failure(`Cannot access the selected frame document: ${error.message}`, 'FRAME_DETACHED'); }
    }
  };
  const remoteElement = async (route, backendNodeId) => {
    await validate(route);
    const {object} = await route.send('DOM.resolveNode', {backendNodeId,executionContextId:route.contextId});
    if (!object.objectId) throw failure('Frame element is no longer connected');
    return object.objectId;
  };
  const hit = async (entry, route, point) => {
    let expected = {route:entry.route,backendNodeId:entry.backendNodeId};
    if (route.sessionId !== entry.route.sessionId) {
      const crossing = entry.route.owners.find(owner => owner.parent.sessionId === route.sessionId && owner.childSessionId !== route.sessionId);
      if (!crossing) throw failure('Frame coordinate route is unavailable', 'FRAME_DETACHED');
      expected = {route:crossing.parent,backendNodeId:crossing.backendNodeId};
    }
    const target = await hitTestViewport(route.send,point);
    let expectedId, actualId;
    try {
      expectedId = await remoteElement(expected.route,expected.backendNodeId);
      ({object:{objectId:actualId}} = await route.send('DOM.resolveNode', {backendNodeId:target.backendNodeId,executionContextId:expected.route.contextId}));
      if (!actualId || !unwrap(await route.send('Runtime.callFunctionOn', {objectId:expectedId,functionDeclaration:'function(actual) { return this === actual || this.contains(actual); }',arguments:[{objectId:actualId}],returnByValue:true}))) throw failure('Another element covers the selected frame or control', 'LOCATOR_NOT_ACTIONABLE');
    } finally {
      for (const objectId of [expectedId,actualId]) if (objectId) await route.send('Runtime.releaseObject',{objectId}).catch(()=>{});
    }
  };
  const stable = async entry => {
    const elements = [...entry.route.owners.map(owner => ({route:owner.parent,backendNodeId:owner.backendNodeId})),entry];
    let previous, unchanged = 0;
    // Scrolling can reflow the host card and its frame owners after CDP acknowledges it.
    for (let sample = 0; sample < 30; sample++) {
      await validate(entry.route);
      const boxes = [];
      for (const element of elements) boxes.push((await element.route.send('DOM.getBoxModel', {backendNodeId:element.backendNodeId})).model.content);
      unchanged = previous && boxes.every((box,index) => box.every((value,corner) => Math.abs(value-previous[index][corner]) < 0.5)) ? unchanged+1 : 0;
      if (unchanged >= 3) return;
      previous = boxes;
      await new Promise(resolve => setTimeout(resolve,16));
    }
    throw failure('Element or parent frame layout is moving', 'LOCATOR_NOT_STABLE');
  };
  const currentPoint = async entry => {
    await validate(entry.route);
    const {model} = await entry.route.send('DOM.getBoxModel', {backendNodeId:entry.backendNodeId});
    const quad = model.content;
    let point = {x:(quad[0]+quad[2]+quad[4]+quad[6])/4,y:(quad[1]+quad[3]+quad[5]+quad[7])/4}, current = entry.route;
    await hit(entry,current,point);
    while (current.sessionId) {
      const crossing = entry.route.owners.find(owner => owner.frameId === current.sessionFrameId && owner.childSessionId === current.sessionId);
      if (!crossing) throw failure('Parent frame route is detached', 'FRAME_DETACHED');
      const viewport = unwrap(await current.send('Runtime.evaluate', {expression:'({width:innerWidth,height:innerHeight})',returnByValue:true}));
      const {model:ownerBox} = await crossing.parent.send('DOM.getBoxModel', {backendNodeId:crossing.backendNodeId});
      const q = ownerBox.content, u = point.x/viewport.width, v = point.y/viewport.height;
      point = {x:(1-u)*(1-v)*q[0]+u*(1-v)*q[2]+u*v*q[4]+(1-u)*v*q[6],y:(1-u)*(1-v)*q[1]+u*(1-v)*q[3]+u*v*q[5]+(1-u)*v*q[7]};
      current = crossing.parent;
      await hit(entry,current,point);
    }
    await validate(entry.route);
    return point;
  };
  const point = async entry => {
    await validate(entry.route);
    for (const owner of entry.route.owners) await owner.parent.send('DOM.scrollIntoViewIfNeeded', {backendNodeId:owner.backendNodeId});
    await entry.route.send('DOM.scrollIntoViewIfNeeded', {backendNodeId:entry.backendNodeId});
    await stable(entry);
    return currentPoint(entry);
  };
  const checkPoint = async (entry, point) => {
    const current = await currentPoint(entry);
    if (Math.abs(current.x-point.x) > 0.5 || Math.abs(current.y-point.y) > 0.5) throw failure('Element moved before pointer input', 'LOCATOR_NOT_STABLE');
  };
  const focus = async entry => {await validate(entry.route); await entry.route.send('DOM.focus',{backendNodeId:entry.backendNodeId}); await validate(entry.route);};
  const close = async () => {
    if (closed) return; closed = true; unsubscribe?.();
    for (const task of pending.values()) {clearTimeout(task.timer); task.reject(failure('Frame router closed', 'FRAME_DETACHED'));} pending.clear();
    const results = await Promise.allSettled([...sessions.values()].filter(session=>session.valid).map(session=>sendRoot('Target.detachFromTarget',{sessionId:session.id})));
    sessions.clear();
    const rejected = results.filter(result=>result.status==='rejected');
    if (rejected.length) throw new AggregateError(rejected.map(result=>result.reason),'Frame sessions could not be detached');
  };
  return {main,child,validate,remoteElement,point,checkPoint,focus,close};
}
