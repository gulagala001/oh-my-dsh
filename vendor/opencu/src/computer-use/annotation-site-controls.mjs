import {annotationDocuments} from './annotation-documents.mjs';
import {annotationSnapshotOptions} from './browser-annotation.mjs';
import {sanitizeAnnotationSiteControls} from './annotation-site-api.mjs';
import {annotationSiteControlDefaultValue} from './annotation-site-api.mjs';

export const ANNOTATION_SITE_CONTROLS_PRELOAD_SYMBOL='opencu.annotation.site-controls.preload';
const controllers=new WeakMap();
const acquisitions=new WeakMap();
const changed=()=>Object.assign(new Error('站点批注 controls 的真实页面身份已经改变'),{code:'ANNOTATION_SITE_CONTROLS_IDENTITY_CHANGED'});
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_ANNOTATION_SITE_CONTROLS'});
const scope=(view,signal)=>AbortSignal.any([signal,view.document.signal,view.lifetime.signal].filter(Boolean));
const release=(cdp,objectId)=>objectId?cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{}):Promise.resolve();

export {annotationSiteControlDefaultValue,annotationSiteControlValue,annotationSiteControlResetValue,annotationSiteControlDraftChanges,hasAnnotationSiteControlChanges,hasAnnotationSiteControlPreviewChanges,updateAnnotationSiteControlChanges} from './annotation-site-api.mjs';
export {installAnnotationSiteControlsReceiver} from './annotation-site-api.mjs';

// Yb seeds every new controls group with the site's defaults; an existing
// group retains its frozen originals and desired values unchanged.
export function initialAnnotationSiteControlChanges(annotationControls,existingGroup=null){
  return structuredClone(existingGroup==null?annotationControls?.controls.map(control=>({callback:control.callback,previousValue:control.currentValue,value:annotationSiteControlDefaultValue(control)})):existingGroup.annotationControlChanges);
}
async function remote(views,view,state,method,args,signal,returnByValue=true,registration=false){
  if(state.disposed||state.document!==view.document||state.document.signal.aborted||!state.objectId)throw changed();
  const operation=state.cdp.send('Runtime.callFunctionOn',{objectId:registration?state.registrationObjectId:state.objectId,functionDeclaration:'function(method,...args){return this[method](...args);}',arguments:[{value:method},...args],returnByValue,awaitPromise:true});
  const result=await views.read(view,operation,signal);if(result.exceptionDetails||state.disposed||state.document!==view.document)throw changed();return returnByValue?result.result?.value:result.result;
}

async function flushActions(views,view,state,result,signal,cleanup=false){
  const read=operation=>cleanup?operation:views.read(view,operation,signal),dispatched=[];
  for(const pending of result.dispatched??[]){
    if(!pending.pending){dispatched.push(pending);continue;}
    const {actionId,pending:unused,...record}=pending;let privateNodeId,registrationNodeId;
    try{
      if(!cleanup&&(state.disposed||state.document!==view.document))throw changed();
      const tree=await read(state.cdp.send('Page.getFrameTree'));if(tree.frameTree.frame.id!==state.frameId||tree.frameTree.frame.loaderId!==state.frameLoaderId)throw changed();
      const target=await read(state.cdp.send('Runtime.callFunctionOn',{objectId:state.objectId,functionDeclaration:'function(id){return this.getDispatchTarget(id);}',arguments:[{value:actionId}],returnByValue:false}));
      privateNodeId=target.result?.objectId;if(target.exceptionDetails||!privateNodeId)throw changed();
      const described=await read(state.cdp.send('DOM.describeNode',{objectId:privateNodeId})),backendNodeId=described.node?.backendNodeId;
      if(!Number.isSafeInteger(backendNodeId)||backendNodeId<=0)throw changed();
      const resolved=await read(state.cdp.send('DOM.resolveNode',{backendNodeId,executionContextId:state.registrationContextId}));registrationNodeId=resolved.object?.objectId;if(!registrationNodeId)throw changed();
      // Only the page callback contract enters main world. Group IDs,
      // comments, previous values and the private reset ledger stay here.
      const value={callback:record.callback,value:record.value,action:record.action,...record.virtualTarget?{virtualTarget:{surfaceId:record.virtualTarget.surfaceId,targetId:record.virtualTarget.targetId}}:{}};
      const delivered=await read(state.cdp.send('Runtime.callFunctionOn',{objectId:state.registrationObjectId,functionDeclaration:'function(node,value){return this.dispatchControlChange(node,value);}',arguments:[{objectId:registrationNodeId},{value}],returnByValue:true}));
      if(delivered.exceptionDetails||delivered.result?.value!==true)throw changed();
      dispatched.push({...record,dispatched:true});
    }catch(error){dispatched.push({...record,dispatched:false,conflict:'callback-dispatch-failed'});}
    finally{
      await release(state.cdp,privateNodeId);await release(state.cdp,registrationNodeId);
      await state.cdp.send('Runtime.callFunctionOn',{objectId:state.objectId,functionDeclaration:'function(id){return this.completeDispatch(id);}',arguments:[{value:actionId}],returnByValue:true}).catch(()=>{});
    }
  }
  return{...result,dispatched};
}

async function nativeIdentity(views,view,signal){
  const browser=views.browser;if(typeof browser.existingLink!=='function'||typeof browser.call!=='function')return null;
  const binding=await browser.existingLink(view.sessionId,view.tabId,signal);binding.assertBinding();
  if(binding.gateway.desktopProvider!==true)return null;
  if(binding.record!==view.record)throw changed();
  const identity=await browser.call('annotation.preloadIdentity',{tabId:binding.nativeTabId,leaseId:binding.gateway.leaseId,actorId:binding.link.clientId,expectedLoaderId:view.loaderId},{signal});
  binding.assertBinding();if(typeof identity?.token!=='string'||!identity.token||typeof identity.registrationToken!=='string'||!identity.registrationToken||identity.registrationToken===identity.token||typeof identity.frameId!=='string'||identity.frameLoaderId!==view.loaderId||identity.siteUrl!==view.record.page.url())throw changed();return identity;
}

// The nonce is read through the private owned-browser transport, never from an
// unverified JavaScript context. Only then may CDP locate the preload realm.
async function acquireController(views,view,signal){
  const lifetime=scope(view,signal);lifetime.throwIfAborted();let state=controllers.get(view);
  if(state?.document===view.document&&!state.disposed){await views.read(view,state.ready,lifetime);return state;}
  const identity=await nativeIdentity(views,view,lifetime);if(identity===null)return null;
  state={document:view.document,cdp:view.record.cdp,frameId:identity.frameId,frameLoaderId:identity.frameLoaderId,contextId:null,objectId:null,registrationContextId:null,registrationObjectId:null,disposed:false,tail:Promise.resolve(),remembered:new Map()};controllers.set(view,state);
  const signals=[state.document.signal,view.lifetime.signal];
  const dispose=async()=>{if(state.disposed)return;state.disposed=true;for(const item of signals)item.removeEventListener('abort',dispose);await state.ready?.catch(()=>{});if(state.objectId){const result=await state.cdp.send('Runtime.callFunctionOn',{objectId:state.objectId,functionDeclaration:'function(){return this.clearProjection();}',returnByValue:true}).catch(()=>null);if(result&&!result.exceptionDetails)await flushActions(views,view,state,{dispatched:result.result?.value??[],conflicts:[]},undefined,true).catch(()=>{});await release(state.cdp,state.objectId);state.objectId=null;}await release(state.cdp,state.registrationObjectId);state.registrationObjectId=null;if(controllers.get(view)===state)controllers.delete(view);};state.dispose=dispose;
  for(const item of signals)item.addEventListener('abort',dispose,{once:true});
  state.ready=(async()=>{
    const contexts=new Map(),observe=event=>{const context=event.context;if(context?.auxData?.frameId===identity.frameId&&typeof context.auxData.isDefault==='boolean')contexts.set(context.id,context);};
    state.cdp.on('Runtime.executionContextCreated',observe);
    try{
      await views.read(view,state.cdp.send('Runtime.enable'),lifetime);
      const tree=await views.read(view,state.cdp.send('Page.getFrameTree'),lifetime);if(tree.frameTree.frame.id!==identity.frameId||tree.frameTree.frame.loaderId!==identity.frameLoaderId)throw changed();
      for(const context of contexts.values()){
        const registration=context.auxData.isDefault===true,token=registration?identity.registrationToken:identity.token,role=registration?'registration':'projection';
        const expression='(()=>{const handle=globalThis[Symbol.for('+JSON.stringify(ANNOTATION_SITE_CONTROLS_PRELOAD_SYMBOL)+')];return handle?.token==='+JSON.stringify(token)+'&&handle.document===document&&handle.role==='+JSON.stringify(role)+(registration?'':'&&handle.registrationToken==='+JSON.stringify(identity.registrationToken))+'?handle.controller:null;})()';
        const operation=state.cdp.send('Runtime.evaluate',{contextId:context.id,expression,returnByValue:false});let result;
        try{result=await views.read(view,operation,lifetime);}catch(error){void operation.then(value=>release(state.cdp,value.result?.objectId)).catch(()=>{});throw error;}
        if(result.exceptionDetails||!result.result?.objectId)continue;
        const objectKey=registration?'registrationObjectId':'objectId',contextKey=registration?'registrationContextId':'contextId';if(state[objectKey]){await release(state.cdp,result.result.objectId);throw changed();}state[contextKey]=context.id;state[objectKey]=result.result.objectId;
      }
      const current=await nativeIdentity(views,view,lifetime);if(!state.objectId||!state.registrationObjectId||current?.token!==identity.token||current.registrationToken!==identity.registrationToken||current.frameId!==identity.frameId||current.frameLoaderId!==identity.frameLoaderId||state.document!==view.document||state.disposed)throw changed();
    }finally{state.cdp.off('Runtime.executionContextCreated',observe);}
  })();
  try{await views.read(view,state.ready,lifetime);if(state.disposed||state.document!==view.document)throw changed();return state;}catch(error){await dispose();throw error;}
}

export async function annotationSiteControlsController(views,view,signal){
  const lifetime=scope(view,signal);lifetime.throwIfAborted();let acquisition=acquisitions.get(view);
  if(!acquisition||acquisition.document!==view.document){
    acquisition={document:view.document};acquisitions.set(view,acquisition);
    acquisition.ready=acquireController(views,view,scope(view)).finally(()=>{if(acquisitions.get(view)===acquisition)acquisitions.delete(view);});
  }
  return views.read(view,acquisition.ready,lifetime);
}

async function frozenTarget(views,view,sourceFrameId,elementKey,signal,work,registration=false){
  const lifetime=scope(view,signal);lifetime.throwIfAborted();const baseline=view.annotations?.get(sourceFrameId),original=baseline?.result.elements.find(element=>element.key===elementKey);
  if(!baseline||view.annotationDocument!==view.document||baseline.result.frame.loaderId!==view.loaderId||!original)throw changed();
  const state=await annotationSiteControlsController(views,view,lifetime);if(state===null)return null;
  const documents=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime);let objectId,resolving;
  try{
    if(JSON.stringify(documents.signature)!==JSON.stringify(baseline.dom))throw changed();const entry=documents.entries.get(original.frameId);
    if(!entry||entry.owner||entry.frameId!==state.frameId||entry.loaderId!==state.frameLoaderId)return null;
    resolving=state.cdp.send('DOM.resolveNode',{backendNodeId:original.backendNodeId,executionContextId:registration?state.registrationContextId:state.contextId});objectId=(await views.read(view,resolving,lifetime)).object?.objectId;if(!objectId)throw changed();
    return await work(state,objectId,lifetime);
  }finally{if(objectId)await release(state.cdp,objectId);else if(resolving)void resolving.then(result=>release(state.cdp,result.object?.objectId)).catch(()=>{});await documents.dispose();}
}

async function readRegistration(views,view,state,objectId,signal){
  const json=await remote(views,view,state,'getControlsJSON',[{objectId}],signal,true,true);if(json===null)return null;
  if(typeof json!=='string'||json.length>16384)throw invalid('页面 controls schema 不是实际有效注册数据');
  try{return sanitizeAnnotationSiteControls(JSON.parse(json));}catch{throw invalid('页面 controls schema 不是实际有效注册数据');}
}

export async function readFrozenAnnotationSiteControls(views,view,sourceFrameId,elementKey,signal){
  if(view.siteAnnotationFeaturesEnabled===false)return null;
  return frozenTarget(views,view,sourceFrameId,elementKey,signal,(state,objectId,lifetime)=>readRegistration(views,view,state,objectId,lifetime),true);
}

export async function rememberAnnotationSiteControlsTarget(views,view,groupId,{sourceFrameId,elementKey},signal){
  if(typeof groupId!=='string'||!groupId)throw invalid('缺少后端 controls 变化组归属');
  return frozenTarget(views,view,sourceFrameId,elementKey,signal,(state,objectId,lifetime)=>{
    const original=view.annotations.get(sourceFrameId).result.elements.find(element=>element.key===elementKey);
    return rememberTarget(views,view,state,groupId,{frameId:state.frameId,frameLoaderId:state.frameLoaderId,backendNodeId:original.backendNodeId},objectId,lifetime);
  });
}

async function rememberTarget(views,view,state,groupId,identity,objectId,signal){
  const previous=state.remembered.get(groupId);if(previous&&['frameId','frameLoaderId','backendNodeId'].some(key=>previous[key]!==identity[key]))throw changed();
  const remembered=await remote(views,view,state,'rememberTarget',[{value:groupId},{objectId}],signal);if(remembered===true)state.remembered.set(groupId,structuredClone(identity));return remembered;
}

export function readRememberedAnnotationSiteControlsTargetIdentity(view,groupId){
  const state=controllers.get(view),identity=state?.document===view.document&&!state.disposed?state.remembered.get(groupId):null;return identity?structuredClone(identity):null;
}

async function resolvedTarget(views,view,identity,signal,work,registration=false){
  const lifetime=scope(view,signal);lifetime.throwIfAborted();const state=await annotationSiteControlsController(views,view,lifetime);if(!state)return null;
  const loaderId=identity?.loaderId??identity?.frameLoaderId;
  if(identity?.frameId!==state.frameId||loaderId!==state.frameLoaderId||!Number.isSafeInteger(identity.backendNodeId)||identity.backendNodeId<=0)throw changed();
  const matches=tree=>tree.frameTree.frame.id===identity.frameId&&tree.frameTree.frame.loaderId===loaderId;
  if(!matches(await views.read(view,state.cdp.send('Page.getFrameTree'),lifetime)))throw changed();let objectId,resolving;
  try{
    resolving=state.cdp.send('DOM.resolveNode',{backendNodeId:identity.backendNodeId,executionContextId:registration?state.registrationContextId:state.contextId});objectId=(await views.read(view,resolving,lifetime)).object?.objectId;if(!objectId)throw changed();
    const verified=await views.read(view,state.cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){return this instanceof Element&&this.ownerDocument===document&&this.isConnected;}',returnByValue:true}),lifetime);
    if(verified.exceptionDetails||verified.result?.value!==true)throw changed();const result=await work(state,objectId,lifetime);
    if(!matches(await views.read(view,state.cdp.send('Page.getFrameTree'),lifetime))||state.document!==view.document)throw changed();return result;
  }finally{if(objectId)await release(state.cdp,objectId);else if(resolving)void resolving.then(result=>release(state.cdp,result.object?.objectId)).catch(()=>{});}
}

// Private backend-only entry points for an already verified, actually opened
// editor target. Source jg does not automatically rebind saved control groups
// to a new selector match or to a CSS ledger's navigation replacement.
export async function readResolvedAnnotationSiteControls(views,view,identity,signal){
  if(view.siteAnnotationFeaturesEnabled===false)return null;
  return resolvedTarget(views,view,identity,signal,(state,objectId,lifetime)=>readRegistration(views,view,state,objectId,lifetime),true);
}

export async function rememberResolvedAnnotationSiteControlsTarget(views,view,groupId,identity,signal){
  if(typeof groupId!=='string'||!groupId)throw invalid('缺少后端 controls 变化组归属');
  return resolvedTarget(views,view,identity,signal,(state,objectId,lifetime)=>rememberTarget(views,view,state,groupId,{frameId:identity.frameId,frameLoaderId:identity.frameLoaderId??identity.loaderId,backendNodeId:identity.backendNodeId},objectId,lifetime));
}

export async function reconcileQueuedAnnotationSiteControls(views,view,entries,signal,{enabled=true,showOriginal=false,activeEntry=null,canUseSiteAnnotationApi=view.siteAnnotationFeaturesEnabled!==false,isAgentControllingBrowser=false}={}){
  if(!Array.isArray(entries)||typeof enabled!=='boolean'||typeof showOriginal!=='boolean'||typeof canUseSiteAnnotationApi!=='boolean'||typeof isAgentControllingBrowser!=='boolean')throw invalid('缺少后端 controls 投影状态');
  const state=await annotationSiteControlsController(views,view,signal);if(!state)return{available:false,dispatched:[],conflicts:[]};
  const active=activeEntry?.comment?.localBrowserDesignChange?.group;if(activeEntry&&(!active||active.status!=='editing'))throw invalid('缺少后端活动 controls 变化组');
  const groups=entries.flatMap(entry=>{const group=entry?.comment?.localBrowserDesignChange?.group;return group?.status==='queued'&&group.id!==active?.id?[group]:[];});if(active)groups.push(active);
  const work=async()=>{const result=await remote(views,view,state,'syncProjection',[{value:groups},{value:{enabled,showOriginal,canUseSiteAnnotationApi,isAgentControllingBrowser}}],signal);if(!canUseSiteAnnotationApi||isAgentControllingBrowser)state.remembered.clear();return flushActions(views,view,state,result,signal);};
  const pending=state.tail.catch(()=>{}).then(work);state.tail=pending.catch(()=>{});return{available:true,documentIdentity:{tabId:view.tabId,frameId:state.frameId,frameLoaderId:state.frameLoaderId},...await pending};
}

export async function restoreQueuedAnnotationSiteControls(view){
  const state=controllers.get(view);if(!state||state.disposed||state.document!==view.document)return{dispatched:[],conflicts:[]};
  const work=async()=>{if(state.disposed||state.document!==view.document)return{dispatched:[],conflicts:[]};const result=await state.cdp.send('Runtime.callFunctionOn',{objectId:state.objectId,functionDeclaration:'function(){return this.clearProjection();}',returnByValue:true});if(result.exceptionDetails)throw changed();state.remembered.clear();return flushActions(null,view,state,{dispatched:result.result?.value??[],conflicts:[]},undefined,true);};
  const pending=state.tail.catch(()=>{}).then(work);state.tail=pending.catch(()=>{});return pending;
}

export async function disposeAnnotationSiteControlsController(view){await controllers.get(view)?.dispose();}
