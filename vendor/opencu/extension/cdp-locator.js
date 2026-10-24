import { runDOMLocator } from './dom-locator.js';
import {selectOptionsDOMSource} from './select-options.js';
import {readCDPFrameOwners} from './frame-router.js';
import {clickModifierKeys} from './click-options.js';

export const domLocatorSource = `(request => (${runDOMLocator.toString()})(request,${selectOptionsDOMSource},${clickModifierKeys.toString()}))`;
const writes = new Set(['click','dblclick','fill','type','pressSequentially','press','check','uncheck','setChecked','selectOption']);
const pointerWrites = new Set(['click','dblclick','check','uncheck','setChecked','selectOption']);
export function locatorError(value) {
  const error = value?.__opencuLocatorError;
  if (error) throw Object.assign(new Error(error.message), { code: error.code, details:{inputDispatched:false} });
  return value;
}

/** Capture visible frame documents through their actual sessions, then validate the complete topology. */
async function captureDOMSnapshot(initial, request, router) {
  const snapshots = [], visited = new Set(), lines = [];
  const maxNodes = request.args?.maxNodes ?? 500, maxChars = request.args?.maxChars ?? 60000;
  let nodes = 0, characters = 0, truncated = false, full = false;
  const stale = message => Object.assign(new Error(message),{code:'STALE_OBSERVATION',details:{inputDispatched:false}});
  const ownersKey = owners => JSON.stringify(owners.map(owner=>[owner.backendNodeId,owner.frameId]).sort((a,b)=>a[0]-b[0]));
  const unwrap = reply => {
    if (reply.exceptionDetails) throw stale(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
    return locatorError(reply.result?.value);
  };
  const append = (line, node) => {
    const size = line.length + (lines.length ? 1 : 0);
    if ((node && nodes >= maxNodes) || characters + size > maxChars) {truncated = full = true;return false;}
    lines.push(line);characters += size;if(node)nodes++;
    return true;
  };
  const visit = async (route, indent = '') => {
    if (visited.has(route.frameId)) throw stale('Frame ancestry changed during DOM snapshot');
    visited.add(route.frameId);
    await router.validate(route);
    const owners = await readCDPFrameOwners(route);
    snapshots.push({route,owners:ownersKey(owners)});
    const input = {...request,operation:'domSnapshot',snapshotDetails:true,locator:[]};
    const reply = await route.send('Runtime.evaluate',{expression:`(() => { try { return ${domLocatorSource}(${JSON.stringify(input)}); } catch(error) { return {__opencuLocatorError:{code:error.code || 'UNSUPPORTED_LOCATOR',message:error.message}}; } })()`,contextId:route.contextId});
    if (reply.exceptionDetails || !reply.result?.objectId) throw stale('DOM snapshot document is unavailable');
    const objectId = reply.result.objectId;
    let snapshot;
    const frames = new Map();
    try {
      snapshot = unwrap(await route.send('Runtime.callFunctionOn',{objectId,returnByValue:true,
        functionDeclaration:'function() { return this.__opencuLocatorError ? this : {lines:this.lines,truncated:this.truncated,frames:this.frames.map(frame => ({line:frame.line,depth:frame.depth}))}; }'}));
      for (let index = 0; index < snapshot.frames.length; index++) {
        const owner = await route.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(index) { return this.frames[index].element; }',arguments:[{value:index}]});
        if (owner.exceptionDetails || !owner.result?.objectId) throw stale('A DOM snapshot frame owner is unavailable');
        try {
          const {node} = await route.send('DOM.describeNode',{objectId:owner.result.objectId});
          const frameId = node.frameId ?? node.contentDocument?.frameId;
          if (!owners.some(item=>item.backendNodeId === node.backendNodeId && item.frameId === frameId)) throw stale('Frame owner changed during DOM snapshot');
          frames.set(snapshot.frames[index].line,{backendNodeId:node.backendNodeId,frameId,depth:snapshot.frames[index].depth});
        } finally {await route.send('Runtime.releaseObject',{objectId:owner.result.objectId}).catch(()=>{});}
      }
    } finally {await route.send('Runtime.releaseObject',{objectId}).catch(()=>{});}
    await router.validate(route);
    for (let index = 0; index < snapshot.lines.length; index++) {
      if (!append(indent+snapshot.lines[index],index !== 0)) break;
      const frame = frames.get(index);
      if (frame) {
        if (nodes >= maxNodes) {truncated = full = true;break;}
        if (!frame.frameId) throw stale('A visible frame has no live document');
        await visit(await router.child(route,frame.backendNodeId,frame.frameId),indent+'  '.repeat(frame.depth+1));
        if (full) break;
      }
    }
    truncated ||= snapshot.truncated;
  };
  await visit(initial);
  for (const snapshot of snapshots) {
    await router.validate(snapshot.route);
    if (ownersKey(await readCDPFrameOwners(snapshot.route)) !== snapshot.owners) throw stale('Frame owners changed during DOM snapshot; observe again');
  }
  if (truncated) lines.push(`[truncated: maxNodes=${maxNodes}, maxChars=${maxChars}]`);
  return {value:lines.join('\n')};
}
/** Resolve in the actual selected frame session; never fall back to a different document. */
export async function runCDPLocator(send, request, register, router) {
  try {
  let route = router ? await router.main() : {send};
  const evaluate = async (input, resolve) => {
    if (router) await router.validate(route);
    const expression = `(() => { try { return ${domLocatorSource}(${JSON.stringify(input)}); } catch(error) { return {__opencuLocatorError:{code:error.code || 'UNSUPPORTED_LOCATOR',message:error.message}}; } })()`;
    const reply = await route.send('Runtime.evaluate', {expression,returnByValue:!resolve,...(route.contextId ? {contextId:route.contextId} : {})});
    if (reply.exceptionDetails) throw Object.assign(new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text), {code:'STALE_ELEMENT',details:{inputDispatched:false}});
    if (!resolve) return {value:locatorError(reply.result.value)};
    const objectId = reply.result.objectId;
    if (!objectId) {locatorError(reply.result.value); throw Object.assign(new Error('Locator element is unavailable'),{code:'STALE_ELEMENT',details:{inputDispatched:false}});}
    try {
      if (reply.result.subtype !== 'node') {
        const failure = await route.send('Runtime.callFunctionOn',{objectId,returnByValue:true,functionDeclaration:'function() { return this; }'});
        locatorError(failure.result.value);
        throw Object.assign(new Error('Locator did not resolve to a DOM element'),{code:'UNSUPPORTED_LOCATOR',details:{inputDispatched:false}});
      }
      const {node} = await route.send('DOM.describeNode',{objectId});
      if (router) await router.validate(route);
      if (input.method === 'resolveFrame') return {backendNodeId:node.backendNodeId,frameId:node.frameId ?? node.contentDocument?.frameId};
      if (pointerWrites.has(input.method)) {
        const before = await route.send('DOM.getBoxModel',{backendNodeId:node.backendNodeId});
        // Page timers do not run in script-disabled sandbox frames. Keep the wait in the host.
        await new Promise(resolve => setTimeout(resolve,16));
        if (router) await router.validate(route);
        const after = await route.send('DOM.getBoxModel',{backendNodeId:node.backendNodeId});
        if (before.model.content.some((value,index) => Math.abs(value-after.model.content[index]) > 0.5)) throw Object.assign(new Error('Locator element is still moving'),{code:'LOCATOR_NOT_STABLE',details:{inputDispatched:false}});
        const checked = await route.send('Runtime.callFunctionOn',{objectId,returnByValue:true,
          functionDeclaration:`function(input) { try { return ${domLocatorSource}(input) === this; } catch(error) { return {__opencuLocatorError:{code:error.code || 'UNSUPPORTED_LOCATOR',message:error.message}}; } }`,
          arguments:[{value:input}]});
        if (checked.exceptionDetails) throw Object.assign(new Error('Locator element was detached before input'),{code:'STALE_ELEMENT',details:{inputDispatched:false}});
        if (!locatorError(checked.result.value)) throw Object.assign(new Error('Locator resolved to a different element before input'),{code:'STALE_ELEMENT',details:{inputDispatched:false}});
        if (router) await router.validate(route);
      }
      const state = await route.send('Runtime.callFunctionOn',{objectId,returnByValue:true,functionDeclaration:'function() { if (!this.isConnected) throw new Error("Locator element was detached"); return {checked:this.checked,keyboardEditable:this.isContentEditable || this.matches("textarea") || this.tagName === "INPUT" && ["text","email","password","search","tel","url","number"].includes(this.type)}; }'});
      if (state.exceptionDetails) throw Object.assign(new Error('Locator element was detached'),{code:'STALE_ELEMENT',details:{inputDispatched:false}});
      return {elementId:register(node.backendNodeId,route),checked:state.result.value.checked,keyboardEditable:state.result.value.keyboardEditable};
    } finally {await route.send('Runtime.releaseObject',{objectId}).catch(()=>{});}
  };
  let segment = [];
  for (const step of request.locator ?? []) {
    if (step?.kind !== 'frame') {segment.push(step); continue;}
    if (!router) throw Object.assign(new Error('This backend has no frame-session router'),{code:'UNSUPPORTED_LOCATOR',details:{inputDispatched:false}});
    const frame = await evaluate({...request,operation:'locator',method:'resolveFrame',args:{},locator:[...segment,{kind:'css',value:step.value}]},true);
    route = await router.child(route,frame.backendNodeId,frame.frameId); segment = [];
  }
  if (request.operation === 'domSnapshot' && router) return await captureDOMSnapshot(route,request,router);
  return await evaluate({...request,locator:request.operation==='domSnapshot'?[]:segment},request.operation!=='domSnapshot' && writes.has(request.method));
  } catch (error) {
    error.code ??= 'STALE_ELEMENT';
    error.details = {...error.details,inputDispatched:false};
    throw error;
  }
}
