const worldName = 'opencu-user-activity';

function installMonitor() {
  if (globalThis.opencuActivity) return;
  const documentId = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join(''), expected = [], listeners = [];
  let sequence = 0, activity, textInput, nextInput = 0;
  const cancelTextInput = () => {
    textInput = undefined;
    for (let i = expected.length - 1; i >= 0; i--) if (expected[i].textInput || expected[i].keyboardInput) expected.splice(i, 1);
  };
  const editTarget = target => {
    if (target?.isContentEditable) while (target.parentElement?.isContentEditable) target = target.parentElement;
    return target;
  };
  const textInputTarget = () => {
    let target = document.activeElement;
    while (target?.shadowRoot?.activeElement) target = target.shadowRoot.activeElement;
    target = editTarget(target);
    return target?.nodeType === 1 ? target : null;
  };
  // Native value controls emit plain input Events rather than text InputEvents.
  // Bind only controls selected by this confirmed physical key; radio navigation
  // may move to another enabled member of the same tree/form/name group.
  const keyboardControlInput = (control,event,inputTypes = []) => {
    if (!control || control.isConnected === false || control.matches?.(':disabled')) return {targets:[],inputTypes:[]};
    const code = event.code ?? '', navigation = /^(?:Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown|Space|Enter|NumpadEnter)$/u.test(code);
    const textKey = inputTypes.includes('insertText');
    if (control.tagName === 'SELECT') {
      const selectAll = control.multiple && code === 'KeyA' && (event.ctrlKey || event.metaKey);
      return {targets:navigation || textKey || selectAll ? [control] : [],inputTypes:[null]};
    }
    if (control.tagName !== 'INPUT') return;
    const type = control.type;
    if (type === 'radio' && /^Arrow(?:Up|Down|Left|Right)$/u.test(code)) {
      const root = control.getRootNode?.();
      const targets = !control.name || !root?.querySelectorAll ? [control] : [...root.querySelectorAll('input[type="radio"]')].filter(candidate =>
        candidate.type === 'radio' && candidate.name === control.name && candidate.form === control.form &&
        candidate.getRootNode() === root && candidate.isConnected !== false && !candidate.matches(':disabled'));
      return {targets,inputTypes:[null]};
    }
    const nativeTypes = ['range','number','date','datetime-local','month','time','week'];
    if (!nativeTypes.includes(type)) return;
    const changesValue = type === 'range' ? navigation : type === 'number' ? /^(?:ArrowUp|ArrowDown)$/u.test(code) || inputTypes.length > 0 : navigation || inputTypes.length > 0;
    // Native steppers may pair text beforeinput with a plain input Event.
    return {targets:changesValue ? [control] : [],inputTypes:[...inputTypes,...(type !== 'range' && navigation ? ['insertText'] : []),null]};
  };

  let pointerControl, pointerEffect;
  const pointerTarget = target => {
    const control=target?.closest?.('label')?.control ?? target?.closest?.('select') ?? target;
    if (control?.isConnected === false || control?.matches?.(':disabled')) return;
    return control?.tagName === 'SELECT' || control?.tagName === 'INPUT' && ['range','number','date','datetime-local','month','time','week','color'].includes(control.type) ? control : undefined;
  };
  const pointerDefault = (event,target,input) => {
    if (event.type === 'pointerdown') pointerControl=event.button === 0 ? {target:pointerTarget(target),pointerId:event.pointerId} : undefined;
    const control=pointerControl && pointerControl.pointerId === event.pointerId ? pointerControl.target : undefined;
    if (control && (event.type === 'pointerdown' || event.type === 'pointerup' || event.buttons & 1)) {
      const effect=pointerEffect={target:control,id:input.id,markerId:input.markerId,input:true,change:true};
      setTimeout(()=>{if(pointerEffect===effect)pointerEffect=undefined;},0);
    }
    if (event.type === 'pointerup') pointerControl=undefined;
  };
  const checkable = target => {
    const control = target?.closest?.('label')?.control ?? target;
    return control?.tagName === 'INPUT' && ['checkbox', 'radio'].includes(control.type) ? control : null;
  };
  const matches = (item, event) => item.type === event.type &&
    (item.target === undefined || item.target === (event.composedPath?.()[0] ?? event.target)) &&
    (item.key === undefined || item.key === event.key || item.key === event.code) &&
    (item.type !== 'input' || item.inputTypes === undefined || item.inputTypes.includes(event.inputType ?? null)) &&
    (item.x === undefined || Math.abs(item.x - event.clientX) <= 2 && Math.abs(item.y - event.clientY) <= 2) &&
    (item.deltaY === undefined || Math.abs(item.deltaX-event.deltaX)<1 && Math.abs(item.deltaY-event.deltaY)<1);
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'keydown', 'beforeinput', 'input', 'change', 'wheel', 'click']) {
    const listener = event => {
      if (!event.isTrusted) return;
      const now = performance.now();
      for (let i = expected.length - 1; i >= 0; i--) if (expected[i].expires < now) expected.splice(i, 1);
      const target = event.composedPath?.()[0] ?? event.target;
      if (['input','change'].includes(event.type) && pointerEffect && pointerEffect.target === pointerTarget(target) && pointerEffect[event.type] && (event.inputType == null || ['insertText','insertReplacementText'].includes(event.inputType))) {pointerEffect[event.type]=false;return;}
      if (type === 'beforeinput') {
        const input = expected.find(input => input.target === editTarget(target) && (
          input.textInput && input.inputType === event.inputType && input.data === event.data ||
          input.keyboardInput && input.inputTypes.includes(event.inputType)));
        cancelTextInput();
        if (input) {
          textInput = {...input,inputType:event.inputType};
          const active = textInput;
          setTimeout(() => { if (textInput === active) textInput = undefined; }, 0);
        }
        return;
      }
      if (type === 'pointerdown' || type === 'keydown' || type === 'wheel') cancelTextInput();
      if (type === 'input' && textInput) {
        if (textInput.target === editTarget(target) && (textInput.inputType === event.inputType || textInput.controlInput && textInput.inputTypes.includes(event.inputType ?? null))) {if (textInput.controlInput) textInput = undefined;return;}
        cancelTextInput();
      }
      const index = expected.findIndex(item => matches(item, event));
      if (index >= 0) {
        const [input] = expected.splice(index, 1);
        if (['pointerdown','pointermove','pointerup'].includes(event.type)) pointerDefault(event,target,input);
        if (event.type === 'keydown') {
          const editor = textInputTarget();
          const native = keyboardControlInput(editor,event,input.inputTypes);
          if (native) {
            for (const target of native.targets) expected.push({type:'input',target,id:input.id,keyboardInput:true,controlInput:true,inputTypes:native.inputTypes,expires:input.expires});
          } else if (input.inputTypes?.length && checkable(editor)) {
            // Space activation completes on keyup; the existing click transaction
            // owns only that control's later default input, never arbitrary text.
            if ([' ','Enter'].includes(event.key)) expected.push({type:'click',target:editor,expires:input.expires});
          } else if (editor && input.inputTypes?.length) expected.push({type:'input',target:editor,id:input.id,keyboardInput:true,
            inputTypes:input.inputTypes,expires:input.expires});
        } else if (event.type === 'pointerdown' && event.button === 0) {
          const control = checkable(target);
          if (control) expected.push({type:'click', target:control, expires:input.expires});
        } else if (event.type === 'click') {
          const marker = {type:'input', target, expires:input.expires};
          expected.push(marker);
          setTimeout(() => { const index = expected.indexOf(marker); if (index !== -1) expected.splice(index, 1); }, 0);
        }
        return;
      }
      if (['pointerdown','pointermove','pointerup','pointercancel','keydown','wheel'].includes(event.type)) {pointerControl=undefined;pointerEffect=undefined;}
      if (['click','change','pointermove','pointerup','pointercancel'].includes(event.type)) return;
      if (event.type === 'pointerdown' || event.type === 'keydown') {
        for (let i = expected.length - 1; i >= 0; i--) if (expected[i].type === 'click') expected.splice(i, 1);
      }
      activity = {documentId, sequence: ++sequence, kind: type, at: new Date().toISOString()};
    };
    addEventListener(type, listener, true); listeners.push([type, listener]);
  }
  globalThis.opencuActivity = {
    documentId,
    read: () => activity ?? null,
    expect(events) {
      const id = ++nextInput;
      for (const event of events) {
        if (event.textInput) {
          const target = textInputTarget();
          if (!target) continue;
          expected.push({...event,target,id,expires:performance.now()+500});
        } else expected.push({...event,id,expires:performance.now()+500});
      }
      return events.length ? {documentId,id,pointerDown:events.some(event=>event.type==='pointerdown'),wheel:events.some(event=>event.type==='wheel')} : undefined;
    },
    finish(marker,dispatched=false) {
      if (marker?.documentId !== documentId) return;
      if (pointerEffect?.id === marker.id) pointerEffect=undefined;
      if (textInput?.id === marker.id) textInput = undefined;
      for (let i = expected.length - 1; i >= 0; i--) if (expected[i].id === marker.id && !(marker.pointerDown && expected[i].type === 'click' || dispatched && marker.wheel && expected[i].type === 'wheel')) expected.splice(i, 1);
    },
    dispose() {
      for (const [type, listener] of listeners) removeEventListener(type, listener, true);
      expected.length = 0; textInput = undefined; pointerControl=undefined; pointerEffect=undefined;
      delete globalThis.opencuActivity;
    },
  };
}

/** A separate Chromium world observes real input without exposing hooks to the site. */
export async function createUserActivityMonitor(session, {onAcquire, frameRouter} = {}) {
  const source = `(${installMonitor.toString()})()`;
  const {identifier} = await session.send('Page.addScriptToEvaluateOnNewDocument', {source, worldName});
  async function evaluate(expression, install = true) {
    const {frameTree} = await session.send('Page.getFrameTree');
    const {executionContextId} = await session.send('Page.createIsolatedWorld', {frameId: frameTree.frame.id, worldName});
    async function run(expression) {
      const result = await session.send('Runtime.evaluate', {contextId: executionContextId, expression, returnByValue: true});
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    }
    if (!install) return run(expression);
    // The initial setup and new-document script normally own the monitor. Only
    // reinstall when this live world has none; the missing branch runs no work.
    const current = await run(`globalThis.opencuActivity ? {value:(${expression})} : null`);
    if (current === null) return run(`${source};${expression}`);
    return current?.value;
  }
  const routes=new Map(),seen=new Map(),routeDocuments=new Map();
  let pointerRoute,sequence=0,activity,rootDocument;
  const stale=error=>['FRAME_DETACHED','STALE_ELEMENT','STALE_DOCUMENT','STALE_OBSERVATION'].includes(error.code) || /Cannot find context|Execution context was destroyed|No session with given id|Session with given id not found|Session closed|Target closed|No frame with given id/iu.test(error.message);
  const routed=async(route,expression,install=true)=>{
    await frameRouter.validate(route);
    const response=await route.send('Runtime.evaluate',{contextId:route.contextId,expression:install ? `${source};${expression}` : expression,returnByValue:true});
    if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);
    routes.set(route.frameId,route);
    return response.result.value;
  };
  const forgetRoute=route=>{routes.delete(route.frameId);const documentId=routeDocuments.get(route.frameId);if(documentId)seen.delete(documentId);routeDocuments.delete(route.frameId);if(pointerRoute===route)pointerRoute=undefined;};
  const rememberDocument=(route,documentId)=>{const previous=routeDocuments.get(route.frameId);if(previous&&previous!==documentId)seen.delete(previous);routeDocuments.set(route.frameId,documentId);};
  const inFrame=route=>route?.owners?.length>0;
  const markerFor=async(route,events,node)=>{
    if(!inFrame(route))return {marker:await evaluate(`globalThis.opencuActivity.expect(${JSON.stringify(events)})`)};
    await routed(route,'null');
    let marker;
    if(node!==undefined){
      const objectId=await frameRouter.remoteElement(route,node);
      try{
        const response=await route.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(events){const target=this.nodeType===3?this.parentElement:this;return globalThis.opencuActivity.expect(events.map(event=>({...event,target,x:undefined,y:undefined})));}',arguments:[{value:events}],returnByValue:true});
        if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);
        marker=response.result.value;
      }finally{await route.send('Runtime.releaseObject',{objectId}).catch(()=>{});}
    }else marker=await routed(route,`globalThis.opencuActivity.expect(${JSON.stringify(events.map(({x,y,...event})=>event))})`);
    if(marker?.documentId)rememberDocument(route,marker.documentId);
    return {route,marker};
  };
  let scriptRemoved = false, disposed = false, disposing;
  const monitor = {
    async read(){
      const root=await evaluate('({documentId:globalThis.opencuActivity.documentId,activity:globalThis.opencuActivity.read()})');
      if(rootDocument!==root.documentId){rootDocument=root.documentId;sequence=0;activity=undefined;seen.clear();pointerRoute=undefined;}
      const rows=[root.activity];
      for(const route of [...routes.values()])try{
        const state=await routed(route,'({documentId:globalThis.opencuActivity.documentId,activity:globalThis.opencuActivity.read()})');
        rememberDocument(route,state.documentId);rows.push(state.activity);
      }catch(error){if(!stale(error))throw error;forgetRoute(route);}
      for(const current of rows)if(current && (seen.get(current.documentId)??0)<current.sequence){
        sequence+=current.sequence-(seen.get(current.documentId)??0);seen.set(current.documentId,current.sequence);
        if(!activity || current.at>=activity.at)activity={...current,frameDocumentId:current.documentId};
      }
      return activity ? {...activity,documentId:rootDocument,sequence} : null;
    },
    async expect(events){
      if(!events.length)return;
      if(!frameRouter)return {markers:[await markerFor(undefined,events)]};
      const event=events[0],pointer=event.type.startsWith('pointer'),atPointer=pointer||event.type==='wheel',point=Number.isFinite(event.x)&&Number.isFinite(event.y);
      const hit=atPointer&&point ? await frameRouter.atPoint(event) : undefined;
      const route=hit?.route ?? await frameRouter.focused();
      const previous=pointerRoute;
      if(event.type==='pointerdown')pointerRoute=route;
      const markers=[await markerFor(route,events,['pointerdown','wheel'].includes(event.type)?hit?.backendNodeId:undefined)];
      if(pointer && event.type!=='pointerdown' && previous && (previous.frameId!==route.frameId || previous.documentId!==route.documentId)) {
        try{markers.push(await markerFor(previous,events));}
        catch(error){await monitor.finish({markers});throw error;}
      }
      if(event.type==='pointerup')pointerRoute=undefined;
      return {markers};
    },
    async finish(value,dispatched=false){
      for(const {route,marker} of value?.markers??[])if(marker)try{
        if(route)await routed(route,`globalThis.opencuActivity.finish(${JSON.stringify(marker)},${dispatched})`);
        else await evaluate(`globalThis.opencuActivity.finish(${JSON.stringify(marker)},${dispatched})`);
      }catch(error){if(!route||!stale(error))throw error;forgetRoute(route);}
    },
    dispose() {
      if (disposed) return Promise.resolve();
      return disposing ??= (async () => {
        if (!scriptRemoved) {
          await session.send('Page.removeScriptToEvaluateOnNewDocument', {identifier});
          scriptRemoved = true;
        }
        await evaluate('globalThis.opencuActivity && globalThis.opencuActivity.dispose()', false);
        for(const route of [...routes.values()])try{await routed(route,'globalThis.opencuActivity && globalThis.opencuActivity.dispose()',false);}
        catch(error){if(!stale(error))throw error;}
        routes.clear();seen.clear();routeDocuments.clear();pointerRoute=undefined;
        disposed = true;
      })().finally(() => { disposing = undefined; });
    },
  };
  // Registration must retain the cleanup handle before current-document setup can fail.
  onAcquire?.(monitor);
  rootDocument=await evaluate(`${source};globalThis.opencuActivity.documentId`, false);
  return monitor;
}
