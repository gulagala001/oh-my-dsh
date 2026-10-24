/** DOM hit testing takes page coordinates; input and element boxes use the viewport. */
export async function hitTestViewport(send, point) {
  const metrics = await send('Page.getLayoutMetrics');
  const viewport = metrics.cssLayoutViewport ?? metrics.layoutViewport;
  return send('DOM.getNodeForLocation', {x:Math.floor(point.x+viewport.pageX),y:Math.floor(point.y+viewport.pageY),includeUserAgentShadowDOM:false});
}

/** Enumerate real owners in one exact document; Page.getFrameTree omits OOPIFs. */
export async function readCDPFrameOwners(route, check = () => {}) {
  check();
  const reply = await route.send('Runtime.evaluate',{contextId:route.contextId,expression:'document'});
  const stale = message => Object.assign(new Error(message),{code:'STALE_OBSERVATION',details:{inputDispatched:false}});
  if (reply.exceptionDetails || !reply.result?.objectId) throw stale('An observed frame document is no longer available');
  const objectId = reply.result.objectId;
  try {
    const {node} = await route.send('DOM.describeNode',{objectId,depth:-1,pierce:true});
    check();
    const owners = [], pending = [node];
    while (pending.length) {
      const node = pending.pop(), frameId = node.frameId ?? node.contentDocument?.frameId;
      if (frameId && frameId !== route.frameId || /^(?:IFRAME|FRAME)$/u.test(node.nodeName)) {
        owners.push({backendNodeId:node.backendNodeId,frameId});
        continue;
      }
      const children = [...node.children ?? [],...node.shadowRoots ?? []];
      for (let index = children.length-1; index >= 0; index--) pending.push(children[index]);
    }
    return owners;
  } finally {await route.send('Runtime.releaseObject',{objectId}).catch(()=>{});}
}

/** Scope a live route to one action without storing that action's fence in IDs. */
export function withCDPFrameGuard(router, wrapSend = send => send, guard = work => work()) {
  if (!router) return router;
  const routes = new WeakMap(), originals = new WeakMap();
  const original = route => originals.get(route) ?? route;
  const route = source => {
    if (!source) return source;
    if (originals.has(source)) return source;
    if (routes.has(source)) return routes.get(source);
    const scoped = {...source,send:wrapSend(source.send,source),owners:[]};
    routes.set(source,scoped); originals.set(scoped,source);
    scoped.owners = (source.owners ?? []).map(owner=>({...owner,parent:route(owner.parent)}));
    return scoped;
  };
  const element = entry => ({...entry,route:route(entry.route)});
  return {
    route,original,
    main:()=>guard(async()=>route(await router.main())),
    child:(parent,node,frameId)=>guard(async()=>route(await router.child(original(parent),node,frameId))),
    validate:item=>guard(()=>router.validate(route(item))),
    remoteElement:(item,node)=>guard(()=>router.remoteElement(route(item),node)),
    point:entry=>guard(()=>router.point(element(entry))),
    checkPoint:(entry,point)=>guard(()=>router.checkPoint(element(entry),point)),
    focus:entry=>guard(()=>router.focus(element(entry))),
    focused:()=>guard(async()=>route(await router.focused())),
    atPoint:point=>guard(async()=>{const hit=await router.atPoint(point);return {...hit,route:route(hit.route)};}),
    close:()=>router.close(),
  };
}

/** CDP sessions for real frame documents, including out-of-process iframes. */
export function createCDPFrameRouter(sendRoot, subscribe, {sendSession,prepareRoute,discardRoute} = {}) {
  const sessions = new Map(), pending = new Map(), knownRoutes = new Map();
  let sequence = 0, closed = false, initializing;
  const autoAttach = enabled => ({autoAttach:enabled,waitForDebuggerOnStart:false,flatten:true,...(enabled ? {filter:[{type:'iframe',exclude:false}]} : {})});
  const failure = (message, code = 'STALE_ELEMENT') => Object.assign(new Error(message), {code, details:{inputDispatched:false}});
  const errorInfo = error => ({message:error.message ?? String(error),...(error.code === undefined ? {} : {code:error.code}),...(error.details === undefined ? {} : {details:error.details})});
  const routeError = (source, method, frameId, sessionId) => {
    const error = Object.assign(new Error(`Frame route ${method} failed: ${source.message ?? String(source)}`, {cause:source}), source);
    error.message = `Frame route ${method} failed: ${source.message ?? String(source)}`;
    error.details = {...source.details,frameRouting:{...source.details?.frameRouting,method,frameId,sessionId}};
    return error;
  };
  const canAttachFrame = error => {
    // Only protocol evidence that this session cannot address the child permits
    // trying a separate target. Page exceptions and identity/dialog fences are not
    // evidence of an out-of-process frame, even when their default code is STALE_ELEMENT.
    const method = error.details?.frameRouting?.method;
    const protocol = error.code === undefined || typeof error.code === 'number' || error.code === 'STALE_ELEMENT' && error.details?.cdpError;
    return protocol && error.details?.inputDispatched !== true && ['Page.createIsolatedWorld','Runtime.evaluate'].includes(method) &&
      /No frame (?:for|with) (?:the )?(?:given|specified) id|Frame with (?:the )?(?:given|specified) id (?:was )?not found|frame is not (?:a )?local frame|frame.*(?:out-of-process|another process)|Cannot find (?:execution )?context with (?:(?:the )?(?:given|specified) )?id|(?:No|Missing) execution context|Execution context with (?:the )?(?:given|specified) id (?:was )?not found/iu.test(error.message);
  };
  const fallbackError = (first, second, method, frameId, sessionId) => {
    const error = routeError(second, method, frameId, sessionId);
    error.code ??= 'FRAME_DETACHED';
    error.message = `Frame document is unavailable. Same-session route: ${first.message}. Fallback: ${error.message}`;
    error.details = {...error.details,frameRouting:{...error.details.frameRouting,sameProcessError:errorInfo(first),fallbackError:errorInfo(second)}};
    return error;
  };
  const unwrap = reply => {
    if (reply.exceptionDetails) throw failure(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
    return reply.result.value;
  };
  const discard = matches => {
    for(const[frameId,route]of knownRoutes)if(matches(route)){knownRoutes.delete(frameId);discardRoute?.(route);}
  };
  const listen = (method, params, parentSessionId) => {
    if (sendSession && method === 'Target.attachedToTarget' && params.targetInfo?.type === 'iframe') {
      const session = {id:params.sessionId,valid:true,parentSessionId};
      session.send = (method, args = {}) => closed || !session.valid
        ? Promise.reject(failure('Frame CDP session is detached','FRAME_DETACHED')) : sendSession(session.id,method,args);
      sessions.set(params.targetInfo.targetId,session);
      // Auto-attach is not recursive. Each OOPIF owns its own descendant targets.
      session.ready = session.send('Page.enable').then(()=>session.send('Target.setAutoAttach',autoAttach(true)));
      session.ready.catch(()=>{});
    }
    if (method === 'Target.receivedMessageFromTarget') {
      let reply; try { reply = JSON.parse(params.message); } catch { return; }
      if (reply.id) {
        const key = `${params.sessionId}:${reply.id}`, task = pending.get(key);
        if (!task) return;
        pending.delete(key); clearTimeout(task.timer);
        if (reply.error) {
          const error = failure(reply.error.message);
          error.details.cdpError = reply.error;
          task.reject(error);
        } else task.resolve(reply.result);
      }
    }
    if (method === 'Target.detachedFromTarget') {
      for (const[frameId,session]of sessions) if (session.id === params.sessionId) {session.valid = false;sessions.delete(frameId);}
      discard(route=>route.sessionId===params.sessionId||route.owners.some(owner=>owner.parent.sessionId===params.sessionId||owner.childSessionId===params.sessionId));
      for (const [key, task] of pending) if (key.startsWith(`${params.sessionId}:`)) { pending.delete(key); clearTimeout(task.timer); task.reject(failure('Frame target detached', 'FRAME_DETACHED')); }
    }
    if(method==='Page.frameNavigated'){
      const source=parentSessionId??'',frameId=params.frame?.id;
      discard(route=>route.frameId===frameId&&route.sessionId===source||route.owners.some(owner=>owner.parent.frameId===frameId&&owner.parent.sessionId===source));
    }
    if(method==='Page.frameDetached'){
      const source=parentSessionId??'';
      discard(route=>route.frameId===params.frameId&&route.sessionId===source||route.owners.some(owner=>owner.frameId===params.frameId&&owner.childSessionId===source));
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
    let executionContextId, token;
    try {
      ({executionContextId} = await send('Page.createIsolatedWorld', {frameId,worldName:'opencu-frame-locators',grantUniveralAccess:false}));
      if (!Number.isSafeInteger(executionContextId) || executionContextId <= 0) throw Object.assign(new Error('Missing execution context in Page.createIsolatedWorld reply'), {details:{inputDispatched:false}});
    } catch (error) { throw routeError(error,'Page.createIsolatedWorld',frameId,sessionId); }
    try {
      token = unwrap(await send('Runtime.evaluate', {contextId:executionContextId,returnByValue:true,expression:`globalThis.__opencuFrameDocument ??= ${JSON.stringify(globalThis.crypto.randomUUID())}`}));
    } catch (error) { throw routeError(error,'Runtime.evaluate',frameId,sessionId); }
    const route = {send,frameId,sessionId,sessionFrameId,contextId:executionContextId,documentId:token,owners};
    await prepareRoute?.(route);
    knownRoutes.set(frameId,route);
    return route;
  };
  const validateDocument = async route => {
    if (closed) throw failure('Frame router is closed', 'FRAME_DETACHED');
    let reply;
    try {reply = await route.send('Runtime.evaluate', {contextId:route.contextId,returnByValue:true,expression:'globalThis.__opencuFrameDocument'});}
    catch (error) {
      const protocol = error.code === undefined || typeof error.code === 'number' || error.code === 'STALE_ELEMENT' && error.details?.cdpError;
      if (protocol && /Cannot find (?:execution )?context with (?:(?:the )?(?:given|specified) )?id|(?:No|Missing) execution context|Execution context (?:with (?:(?:the )?(?:given|specified) )?id )?(?:was )?(?:destroyed|not found)|No session with (?:(?:the )?(?:given|specified) )?id|Session closed(?:[.:]|$)|Target (?:closed|detached)|Inspected target navigated or closed/iu.test(error.message)) {
        const detached = failure('Frame document is no longer available; observe again', 'FRAME_DETACHED');
        detached.cause = error;
        detached.details = {...error.details,inputDispatched:false};
        throw detached;
      }
      throw error;
    }
    const token = unwrap(reply);
    if (token !== route.documentId) throw failure('Frame document changed', 'FRAME_DETACHED');
  };
  const validate = async route => {try {
    for (const owner of route.owners) {
      await validateDocument(owner.parent);
      let node;
      try {({node}=await owner.parent.send('DOM.describeNode', {backendNodeId:owner.backendNodeId}));}
      catch(error){
        const protocol=error.code===undefined||typeof error.code==='number'||error.details?.cdpError;
        if(protocol&&/Could not find node with given id|No node with (?:the )?(?:given|specified) id|Node.*(?:not found|no longer exists)/iu.test(error.message))throw failure('Frame element was removed or replaced','FRAME_DETACHED');
        throw error;
      }
      if ((node.frameId ?? node.contentDocument?.frameId) !== owner.frameId) throw failure('Frame element was removed or replaced', 'FRAME_DETACHED');
    }
    await validateDocument(route);
  }catch(error){
    if(error.code==='FRAME_DETACHED')discard(item=>item===route||item.owners.some(owner=>owner.parent.frameId===route.frameId&&owner.parent.documentId===route.documentId));
    throw error;
  }};
  const main = async () => {
    if (closed) throw failure('Frame router is closed', 'FRAME_DETACHED');
    // chrome.debugger restricts Target.attachToTarget and nested protocol messages.
    // Its flat session transport receives existing children before this ACK.
    if (sendSession) await (initializing ??= sendRoot('Target.setAutoAttach',autoAttach(true)));
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
      if (!canAttachFrame(sameProcessError)) throw sameProcessError;
      let session = sessions.get(frameId);
      if (sendSession) {
        if (!session?.valid) throw fallbackError(sameProcessError,failure('Related frame debugger session is unavailable','FRAME_DETACHED'),'Target.setAutoAttach',frameId,parent.sessionId);
        try {await session.ready;}
        catch (error) {throw fallbackError(sameProcessError,error,'Target.setAutoAttach',frameId,session.id);}
      }
      if (!session?.valid) {
        let attached;
        try {
          try { attached = await sendRoot('Target.attachToTarget', {targetId:frameId,flatten:false}); }
          catch (error) {
            if (!/^No target with given id found\.?$/u.test(error.message) || error.code && typeof error.code !== 'number') throw error;
            // Electron can defer creating the OOPIF DevTools target until discovery.
            // Discover once, then attach only the exact frame already read from its owner.
            let targetInfos;
            try { ({targetInfos} = await sendRoot('Target.getTargets')); }
            catch (discoveryError) { throw routeError(discoveryError,'Target.getTargets',frameId,parent.sessionId); }
            if (!targetInfos?.some(target => target.targetId === frameId && target.type === 'iframe')) throw error;
            await validate(parent);
            const {node} = await parent.send('DOM.describeNode', {backendNodeId});
            if ((node.frameId ?? node.contentDocument?.frameId) !== frameId) throw failure('Frame element was removed or replaced', 'FRAME_DETACHED');
            attached = await sendRoot('Target.attachToTarget', {targetId:frameId,flatten:false});
          }
        } catch (error) { throw fallbackError(sameProcessError,error,error.details?.frameRouting?.method ?? 'Target.attachToTarget',frameId,parent.sessionId); }
        session = {id:attached.sessionId,valid:true}; session.send = childSend(session); sessions.set(frameId,session);
      }
      try {
        const route = await makeRoute(session.send,frameId,session.id,frameId,[...parent.owners,owner]);
        owner.childSessionId = route.sessionId;
        return route;
      } catch (error) { throw fallbackError(sameProcessError,error,error.details?.frameRouting?.method ?? 'makeRoute',frameId,session.id); }
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
  const focused = async () => {
    let route = await main();
    for (let depth=0;depth<32;depth++) {
      await validate(route);
      const reply = await route.send('Runtime.evaluate',{contextId:route.contextId,expression:'(()=>{let e=document.activeElement;while(e?.shadowRoot?.activeElement)e=e.shadowRoot.activeElement;return e;})()'});
      const objectId = reply.result?.objectId;
      if (!objectId) return route;
      let node;
      try {({node}=await route.send('DOM.describeNode',{objectId}));}
      finally {await route.send('Runtime.releaseObject',{objectId}).catch(()=>{});}
      const frameId=node.frameId??node.contentDocument?.frameId;
      if (!frameId || frameId===route.frameId) return route;
      route=await child(route,node.backendNodeId,frameId);
    }
    throw failure('Focused frame nesting exceeds the supported depth','FRAME_DETACHED');
  };
  const atPoint = async point => {
    const root=await main();let route=root,local={...point};
    const find=async(frameId,parent=root,depth=0,budget={count:0})=>{
      if(parent.frameId===frameId)return parent;
      if(depth>=32||++budget.count>500)throw failure('Frame topology exceeds the supported input lookup limit','FRAME_DETACHED');
      for(const owner of await readCDPFrameOwners(parent)){
        const current=await child(parent,owner.backendNodeId,owner.frameId);
        const found=await find(frameId,current,depth+1,budget);if(found)return found;
      }
    };
    for(let depth=0;depth<32;depth++){
      await validate(route);
      const hit=await hitTestViewport(route.send,local),frameId=hit.frameId??route.frameId;
      const ownerRoute=frameId===route.frameId?route:knownRoutes.get(frameId)??await find(frameId);
      if(!ownerRoute||ownerRoute.sessionId!==route.sessionId)throw failure('Pointer frame route changed; observe again','FRAME_DETACHED');
      await validate(ownerRoute);
      const {node}=await ownerRoute.send('DOM.describeNode',{backendNodeId:hit.backendNodeId});
      const childId=node.frameId??node.contentDocument?.frameId;
      if(!childId||childId===ownerRoute.frameId)return {...hit,route:ownerRoute};
      const {model}=await ownerRoute.send('DOM.getBoxModel',{backendNodeId:hit.backendNodeId}),q=model.content;
      let u=.5,v=.5;
      for(let iteration=0;iteration<12;iteration++){
        const x=(1-u)*(1-v)*q[0]+u*(1-v)*q[2]+u*v*q[4]+(1-u)*v*q[6]-local.x;
        const y=(1-u)*(1-v)*q[1]+u*(1-v)*q[3]+u*v*q[5]+(1-u)*v*q[7]-local.y;
        const xu=(1-v)*(q[2]-q[0])+v*(q[4]-q[6]),xv=(1-u)*(q[6]-q[0])+u*(q[4]-q[2]);
        const yu=(1-v)*(q[3]-q[1])+v*(q[5]-q[7]),yv=(1-u)*(q[7]-q[1])+u*(q[5]-q[3]),det=xu*yv-xv*yu;
        if(Math.abs(det)<1e-8)throw failure('Pointer frame has no invertible visible box','LOCATOR_NOT_ACTIONABLE');
        u-=(x*yv-y*xv)/det;v-=(y*xu-x*yu)/det;
        if(Math.abs(x)+Math.abs(y)<.01)break;
      }
      // An iframe border belongs to its owner document, not its child viewport.
      if(u<0||u>1||v<0||v>1)return {...hit,route:ownerRoute};
      const next=await child(ownerRoute,hit.backendNodeId,childId);
      if(next.sessionId!==ownerRoute.sessionId){
        const viewport=unwrap(await next.send('Runtime.evaluate',{contextId:next.contextId,expression:'({width:innerWidth,height:innerHeight})',returnByValue:true}));
        local={x:Math.round(u*viewport.width*1e8)/1e8,y:Math.round(v*viewport.height*1e8)/1e8};
      }
      route=next;
    }
    throw failure('Pointer frame nesting exceeds the supported depth','FRAME_DETACHED');
  };
  const close = async () => {
    if (closed) return; closed = true; unsubscribe?.();
    for (const task of pending.values()) {clearTimeout(task.timer); task.reject(failure('Frame router closed', 'FRAME_DETACHED'));} pending.clear();
    const results = await Promise.allSettled(sendSession
      ? initializing ? [sendRoot('Target.setAutoAttach',autoAttach(false))] : []
      : [...sessions.values()].filter(session=>session.valid).map(session=>sendRoot('Target.detachFromTarget',{sessionId:session.id})));
    sessions.clear();knownRoutes.clear();
    const rejected = results.filter(result=>result.status==='rejected');
    if (rejected.length) throw Object.assign(new AggregateError(rejected.map(result=>result.reason),'Frame sessions could not be detached'),{details:{errors:rejected.map(result=>errorInfo(result.reason))}});
  };
  return {main,child,validate,remoteElement,point,checkPoint,focus,focused,atPoint,close};
}
