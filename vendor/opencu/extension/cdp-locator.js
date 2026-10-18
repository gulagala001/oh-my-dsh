import { runDOMLocator } from './dom-locator.js';
import {selectOptionsDOMSource} from './select-options.js';

export const domLocatorSource = `(request => (${runDOMLocator.toString()})(request,${selectOptionsDOMSource}))`;
const writes = new Set(['click','dblclick','fill','press','check','uncheck','setChecked','selectOption']);
const pointerWrites = new Set(['click','dblclick','check','uncheck','setChecked','selectOption']);
export function locatorError(value) {
  const error = value?.__opencuLocatorError;
  if (error) throw Object.assign(new Error(error.message), { code: error.code, details:{inputDispatched:false} });
  return value;
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
      const state = await route.send('Runtime.callFunctionOn',{objectId,returnByValue:true,functionDeclaration:'function() { if (!this.isConnected) throw new Error("Locator element was detached"); return {checked:this.checked}; }'});
      if (state.exceptionDetails) throw Object.assign(new Error('Locator element was detached'),{code:'STALE_ELEMENT',details:{inputDispatched:false}});
      return {elementId:register(node.backendNodeId,route),checked:state.result.value.checked};
    } finally {await route.send('Runtime.releaseObject',{objectId}).catch(()=>{});}
  };
  let segment = [];
  for (const step of request.locator ?? []) {
    if (step?.kind !== 'frame') {segment.push(step); continue;}
    if (!router) throw Object.assign(new Error('This backend has no frame-session router'),{code:'UNSUPPORTED_LOCATOR',details:{inputDispatched:false}});
    const frame = await evaluate({...request,operation:'locator',method:'resolveFrame',args:{},locator:[...segment,{kind:'css',value:step.value}]},true);
    route = await router.child(route,frame.backendNodeId,frame.frameId); segment = [];
  }
  return await evaluate({...request,locator:request.operation==='domSnapshot'?[]:segment},request.operation!=='domSnapshot' && writes.has(request.method));
  } catch (error) {
    error.code ??= 'STALE_ELEMENT';
    error.details = {...error.details,inputDispatched:false};
    throw error;
  }
}
