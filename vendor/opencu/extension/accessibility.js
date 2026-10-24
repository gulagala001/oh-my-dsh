import { runCDPLocator } from './cdp-locator.js';
import { hitTestViewport, withCDPFrameGuard } from './frame-router.js';
import { runTextEdit } from './text-edit.js';
import {selectOptionsFunction, selectOptionsResult} from './select-options.js';
import {captureAXTree, axElementKey} from './ax-tree.js';
import {filePaths,validateFileInput,writeFileInput} from './file-input.js';
const states = new Map();
const fail = message => { throw Object.assign(new Error(message), { code: 'STALE_ELEMENT' }); };
function result(reply) {
  if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
  return reply.result.value;
}
export function invalidateElements(tabId) { states.delete(tabId); }
export async function observeAccessibility(tabId, send, documentId, check = () => {}, {format, deferCommit} = {}, router) {
  const observationId = crypto.randomUUID(), elements = new Map();
  const previous = states.get(tabId);
  const identityScope = previous && previous.documentId === documentId ? previous.identityScope : crypto.randomUUID();
  let captured;
  const state = {elements,observationId,identityScope,documentId};
  const commit = async () => {
    await captured?.validate();
    check();
    if (states.get(tabId) !== previous) fail('Element observation changed during accessibility capture; observe again.');
    states.set(tabId,state);
  };
  if (format === 'screenshot') {
    state.deferredAX = true;
    if (!deferCommit) await commit();
    return {observationId,...(deferCommit ? {commit} : {})};
  }
  captured = await captureAXTree(send,router,check);
  check();
  const visible = captured.nodes.map(({node,route,key}) => {
    const elementId = node.backendDOMNodeId ? `${identityScope}:${key}` : undefined;
    if (elementId) elements.set(elementId, {backendNodeId:node.backendDOMNodeId,route});
    return { ...(elementId ? { elementId } : {}), nodeId: node.nodeId, role: node.role?.value ?? '', name: node.name?.value ?? '',
      ...(node.value ? { value: node.value.value } : {}), children: node.childIds ?? [],
      properties: Object.fromEntries((node.properties ?? []).map(item => [item.name, item.value.value ?? item.value.relatedNodes?.map(node => node.text ?? node.idref) ?? null])) };
  });
  if (!deferCommit) await commit();
  return { observationId, ...(deferCommit ? {commit} : {}), ax: { nodes: visible, source: 'chromium-accessibility-tree', stableIds: true, identityScope },
    text: visible.map(node => `${node.elementId ? `[${node.elementId}] ` : ''}${node.role} ${JSON.stringify(node.name)}${node.value !== undefined ? ` value=${JSON.stringify(node.value)}` : ''}`).join('\n') };
}
export async function elementOperation(tabId, send, operation, args, router, editOptions = {}) {
  editOptions.check?.();
  router = withCDPFrameGuard(router,editOptions.wrapSend,editOptions.guard);
  const state = states.get(tabId), elements = state?.elements;
  if (args.observationId !== undefined && args.observationId !== state?.observationId) fail('Element observation has expired; observe again.');
  // A screenshot has no AX payload. A later element action still receives the
  // current index, built with that action's guarded CDP transport.
  if (state?.deferredAX && typeof args.elementId === 'string' && !elements.has(args.elementId)) {
    const captured = await captureAXTree(send,router);
    const next = new Map();
    for (const {node,route,key} of captured.nodes) if (node.backendDOMNodeId) next.set(`${state.identityScope}:${key}`,{backendNodeId:node.backendDOMNodeId,route:router?.original(route) ?? route});
    await captured.validate();
    editOptions.check?.();
    if (states.get(tabId) !== state) fail('Element observation has expired; observe again.');
    for (const [id,entry] of next) elements.set(id,entry);
    delete state.deferredAX;
  }
  const entry = elements?.get(args.elementId);
  const route = router?.route(entry?.route) ?? entry?.route;
  let backendNodeId = entry?.backendNodeId, elementId = args.elementId;
  if (route) {await router.validate(route); send = route.send;}
  if (operation === 'hitTest') {
    const hit = await hitTestViewport(send,args);
    backendNodeId = hit.backendNodeId; elementId = `${crypto.randomUUID()}:hit`;
    const next = elements ?? new Map(); next.set(elementId, {backendNodeId});
    if (!state) states.set(tabId, {elements:next,identityScope:crypto.randomUUID()});
  }
  if (operation === 'selectText' || operation === 'paste') {
    if (args.elementId != null && !backendNodeId) fail('Use an element ID from the current Chromium observation.');
    return runTextEdit(send,operation,args,{...editOptions,backendNodeId,contextId:route?.contextId,validate:async()=>{
      if (entry && states.get(tabId)?.elements.get(args.elementId)!==entry) fail('The selected editable element changed.');
      if (route) await router.validate(route);
      await editOptions.validate?.();
    }});
  }
  if (!backendNodeId) fail('Use an element ID from the latest Chromium accessibility observation.');
  if (operation === 'verifyElement') return {valid:true};
  if (operation === 'upload') {
    const files = filePaths(args.files);
    await validateFileInput(send,{backendNodeId,contextId:route?.contextId,files});
    if (route) await router.validate(route);
    editOptions.check?.();
    const receipt = await writeFileInput(send,{backendNodeId,contextId:route?.contextId,files});
    return {uploaded:true,...receipt};
  }
  if (operation === 'focus') { if (route) await router.focus(entry); else await send('DOM.focus', { backendNodeId }); return { focused: true }; }
  if (operation === 'point' && route) return router.point(entry);
  if (operation === 'checkPoint' && route) {await router.checkPoint(entry,args); return {valid:true};}
  const { object } = await send('DOM.resolveNode', { backendNodeId, ...(route ? {executionContextId:route.contextId} : {}) });
  if (!object.objectId) fail('The selected DOM node is no longer available.');
  try {
    if (operation === 'selectOption') {
      const value = selectOptionsResult(result(await send('Runtime.callFunctionOn', {objectId:object.objectId,returnByValue:true,
        functionDeclaration:selectOptionsFunction,arguments:[{value:args.values ?? args.value}]})));
      return {...value,elementId};
    }
    const value = result(await send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true,
      functionDeclaration: `function(operation, args) {
        if (!this.isConnected || this.nodeType !== 1) throw new Error('The selected element is no longer connected');
        if (operation === 'checked') return {checked:this.checked};
        if (operation === 'point') {
          this.scrollIntoView({behavior:'instant',block:'center',inline:'center'});
          const box = this.getBoundingClientRect();
          if (!(box.width > 0 && box.height > 0)) throw new Error('Element has no actionable box');
          return {x:box.x + box.width/2,y:box.y + box.height/2};
        }
        if (operation === 'selectAll') {
          this.focus();
          if (typeof this.select === 'function') this.select();
          else if (this.isContentEditable) { const range = document.createRange();range.selectNodeContents(this);const selection=getSelection();selection.removeAllRanges();selection.addRange(range); }
          else throw new Error('Element is not an editable text control');
          return {selected:true};
        }
        if (operation === 'setValue') {
          const prototype = this instanceof HTMLSelectElement ? HTMLSelectElement.prototype : this instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : this instanceof HTMLInputElement ? HTMLInputElement.prototype : null;
          const checkbox = ['checkbox','radio'].includes(this.type), property = checkbox ? 'checked' : 'value';
          const setter = prototype && Object.getOwnPropertyDescriptor(prototype, property)?.set;
          if (!setter || ['file','hidden'].includes(this.type)) throw new Error('Element has no supported value setter');
          setter.call(this, checkbox ? ['true','1'].includes(String(args.value)) : String(args.value));
          this.dispatchEvent(new Event('input',{bubbles:true,composed:true}));this.dispatchEvent(new Event('change',{bubbles:true}));
          return {changed:true,inputMode:'synthetic-dom'};
        }
        const editableText = this.children.length === 0 && !['INPUT','TEXTAREA','SELECT','SCRIPT','STYLE'].includes(this.tagName);
        if (operation === 'patchDOM') {
          if (args.annotationControlChanges?.length) throw new Error('Website-provided controls require the annotation bridge');
          const declarations = args.declarations ?? Object.entries(args.styles ?? {}).map(([property,value]) => ({property,value}));
          if (!Array.isArray(declarations) || declarations.length > 100) throw new Error('Invalid CSS declarations');
          for (const item of declarations) if (!item || typeof item.property !== 'string' || !/^(--[\\w-]+|[a-zA-Z][a-zA-Z-]*)$/.test(item.property) || typeof item.value !== 'string' || !['','important'].includes(item.priority || '') || item.value && !CSS.supports(item.property,item.value)) throw new Error('Invalid CSS declaration');
          if (args.text !== undefined && (typeof args.text !== 'string' || !editableText)) throw new Error('Text adjustment requires a leaf text element');
          for (const item of declarations) { if (item.value) this.style.setProperty(item.property,item.value,item.priority || ''); else this.style.removeProperty(item.property); }
          if (args.text !== undefined) this.textContent = args.text;
        }
        const box=this.getBoundingClientRect(),style=getComputedStyle(this),rect={x:box.x,y:box.y,width:box.width,height:box.height};
        return {kind:'element',tag:this.tagName.toLowerCase(),tagName:this.tagName.toLowerCase(),name:this.getAttribute('aria-label') || this.textContent?.trim().slice(0,500),text:this.textContent?.slice(0,8000),rect,bounds:rect,attributes:Object.fromEntries([...this.attributes].map(item=>[item.name,item.value])),inlineStyle:this.getAttribute('style') || '',editableText,computedStyle:Object.fromEntries(['color','background-color','font-family','font-size','font-weight','line-height','display','width','height','padding','margin'].map(key=>[key,style.getPropertyValue(key)])),url:location.href};
      }`, arguments: [{ value: operation }, { value: args }] }));
    return { ...value, elementId };
  } finally { await send('Runtime.releaseObject', { objectId: object.objectId }); }
}

export async function locatorOperation(tabId, send, request, documentId, router, options = {}) {
  router = withCDPFrameGuard(router,options.wrapSend,options.guard);
  let state = states.get(tabId);
  if (!state || state.documentId !== documentId) {
    state = {elements:new Map(),identityScope:crypto.randomUUID(),documentId};
    states.set(tabId, state);
  }
  return runCDPLocator(send, request, (backendNodeId, route) => {
    options.check?.();
    if (states.get(tabId) !== state) fail('Document changed while resolving locator.');
    const elementId = `${state.identityScope}:${axElementKey(backendNodeId,route)}`;
    state.elements.set(elementId, {backendNodeId,route:router?.original(route) ?? route});
    return elementId;
  }, router);
}
