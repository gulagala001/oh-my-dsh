import {annotationDocuments} from './annotation-documents.mjs';
import {annotationSnapshotOptions,captureAnnotation} from './browser-annotation.mjs';

const controllers=new WeakMap();
const changed=()=>Object.assign(new Error('虚拟对象、注册表面或页面已经改变，请重新选择。'),{code:'ANNOTATION_CHANGED'});

// browser-page-preload Kg/Qg/Jg/Yg/$g. The registry lives in main world;
// these source events are observed in a private, document-scoped world.
function sourceSurfaceController(){
  const requestEvent='codex:annotation-surface-request',responseEvent='codex:annotation-surface-response',registrations=new Map(),selections=new Map(),leases=new Map();let disposed=false,pending=null,activeSelection=null,selectionEpoch=0,featuresEnabled=true;
  const validElement=node=>window===window.top&&globalThis.isSecureContext&&node instanceof HTMLElement&&!(node instanceof HTMLIFrameElement)&&node.isConnected&&node.ownerDocument===document&&node.getRootNode()===document;
  const validId=value=>typeof value==='string'&&value.length>0&&value.length<=128&&/^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(value);
  const dispatch=(node,value)=>node.dispatchEvent(new CustomEvent(requestEvent,{bubbles:true,detail:JSON.stringify(value)}));
  const hitAt=point=>{let node=document.elementFromPoint(point.x,point.y);while(node?.shadowRoot!=null){const child=node.shadowRoot.elementFromPoint(point.x,point.y);if(!(child instanceof HTMLElement)||child===node)break;node=child;}return node;};
  const clip=(node,rect)=>{const box=node.getBoundingClientRect(),x=Math.max(0,box.x,rect.x),y=Math.max(0,box.y,rect.y),right=Math.min(innerWidth,box.right,rect.x+rect.width),bottom=Math.min(innerHeight,box.bottom,rect.y+rect.height);return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;};
  const pointMatches=(node,point)=>{const rect=clip(node,node.getBoundingClientRect());return rect!=null&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=rect.x&&point.x<=rect.x+rect.width&&point.y>=rect.y&&point.y<=rect.y+rect.height&&hitAt(point)===node;};
  const sameBox=(a,b)=>['x','y','width','height'].every(key=>a[key]===b[key]);
  const metadata=value=>{
    if(typeof value!=='object'||!value)return undefined;
    try{
      const prototype=Object.getPrototypeOf(value),properties=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(properties);
      if(prototype!==Object.prototype&&prototype!==null||keys.length>6||keys.some(key=>typeof key!=='string'||key.length>64||['__proto__','constructor','prototype'].includes(key)||!/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z0-9_-]+)*$/.test(key)))return undefined;
      const result={};for(const [key,property]of Object.entries(properties)){const item=property.value;if(!property.enumerable||!Object.hasOwn(property,'value')||!(item===null||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item)||typeof item==='string'&&item.length<=256&&/^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(item)))return undefined;result[key]=item;}
      const serialized=JSON.stringify(result);return serialized.length<=2048&&new TextEncoder().encode(serialized).byteLength<=2048?result:undefined;
    }catch{return undefined;}
  };
  const cancel=()=>{if(pending==null)return;const previous=pending;pending=null;clearTimeout(previous.timer);previous.finish({status:'unavailable'});dispatch(document,{type:'cancel'});};
  const render=(node,id,selection)=>{const registration=registrations.get(node);if(disposed||!validElement(node)||registration?.id!==id||!registration.customRendering)return false;dispatch(node,{type:'render',registrationId:id,...selection});return registration.customRendering;};
  const clear=()=>{selectionEpoch++;cancel();if(!disposed)dispatch(document,{type:'clear'});activeSelection=null;selections.clear();};
  const visibility=()=>{if(document.visibilityState==='hidden')clear();};
  const observe=event=>{
    if(disposed||!(event instanceof CustomEvent)||typeof event.detail!=='string'||event.detail.length>8192||!validElement(event.target))return;
    let value;try{value=JSON.parse(event.detail);}catch{return;}
    if(!value||!['registered','invalidated','disposed','rendering-failed','result'].includes(value.type)||!validId(value.registrationId)||value.requestId!==undefined&&(typeof value.requestId!=='string'||value.requestId.length>128)||value.customRendering!==undefined&&typeof value.customRendering!=='boolean')return;
    const node=event.target,previous=registrations.get(node);
    if(value.type==='registered'){if(previous?.id===value.registrationId)previous.customRendering=value.customRendering===true;else registrations.set(node,{id:value.registrationId,customRendering:value.customRendering===true,version:0});return;}
    if(previous?.id!==value.registrationId)return;
    if(value.type==='rendering-failed'){previous.customRendering=false;return;}
    if(value.type==='invalidated'||value.type==='disposed'){previous.version++;if(value.type==='disposed')registrations.delete(node);if(pending?.node===node)cancel();return;}
    if(pending==null||pending.node!==node||pending.registrationId!==value.registrationId||pending.requestId!==value.requestId)return;
    const current=pending;pending=null;clearTimeout(current.timer);
    if(!sameBox(node.getBoundingClientRect(),current.box)||!pointMatches(node,current.point)){current.finish({status:'unavailable'});return;}
    if(value.hit==null){current.finish({status:value.hit===null?'empty':'unavailable'});return;}
    const hit=value.hit;if(!validId(hit.id)){current.finish({status:'unavailable'});return;}
    let rect;if(hit.rect!==undefined){if(!hit.rect||!['x','y','width','height'].every(key=>typeof hit.rect[key]==='number'&&Number.isFinite(hit.rect[key]))||hit.rect.width<=0||hit.rect.height<=0||(rect=clip(node,hit.rect))==null){current.finish({status:'unavailable'});return;}}
    const name=typeof hit.name==='string'&&hit.name.trim().length>0&&hit.name.length<=128&&/^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(hit.name)?hit.name:undefined;
    const role=typeof hit.role==='string'&&hit.role.length<=64&&/^[a-z][a-z0-9-]*(?![\s\S])/.test(hit.role)?hit.role:undefined;
    current.finish({status:'hit',hit:{registrationId:previous.id,id:hit.id,name,role,metadata:metadata(hit.metadata),rect,customRendering:previous.customRendering},version:previous.version});
  };
  const observer=new MutationObserver(()=>{for(const [node,registration]of registrations)if(!validElement(node)){registration.version++;registrations.delete(node);if(pending?.node===node)cancel();}});
  document.addEventListener(responseEvent,observe);document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',clear);observer.observe(document,{childList:true,subtree:true});dispatch(document,{type:'list'});
  return{
    async select(node,point,append){
      selectionEpoch++;const epoch=selectionEpoch;cancel();if(disposed||!featuresEnabled||document.visibilityState==='hidden'||!validElement(node)||!pointMatches(node,point))return{status:'unavailable'};
      dispatch(node,{type:'probe'});const registration=registrations.get(node);if(!registration)return{status:'not-registered'};
      if(append)return{status:'virtual-multi'};
      if(activeSelection!=null)render(activeSelection.node,activeSelection.surfaceId,{hoveredId:null,selectedId:null});
      const requestId=crypto.randomUUID(),response=await new Promise(finish=>{pending={node,point:{...point},registrationId:registration.id,requestId,box:node.getBoundingClientRect(),finish,timer:setTimeout(cancel,250)};dispatch(node,{type:'hit-test',registrationId:registration.id,requestId,x:point.x,y:point.y});});
      if(response.status!=='hit'||disposed||epoch!==selectionEpoch||registrations.get(node)!==registration||registration.version!==response.version||!pointMatches(node,point))return response.status==='empty'?response:{status:response.status==='not-registered'?'not-registered':'unavailable'};
      const hit=response.hit,customRendering=render(node,hit.registrationId,{hoveredId:null,selectedId:hit.id});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(disposed||epoch!==selectionEpoch||registrations.get(node)!==registration||registration.version!==response.version||!pointMatches(node,point))return{status:'unavailable'};
      const anchor={kind:'virtual',surfaceId:hit.registrationId,targetId:hit.id,elementName:hit.name,elementMetadata:hit.metadata,pageUrl:location.href,frameUrl:null,framePath:[],title:hit.name??document.title,elementPath:'virtual object',selector:null,role:hit.role??null,name:null,nearbyText:null,isFixed:true,point:{xPercent:point.x/innerWidth*100,y:point.y},rect:hit.rect??{x:point.x,y:point.y,width:1,height:1}};
      const key=crypto.randomUUID(),value={key,anchor,viewportRect:anchor.rect,viewportPoint:{...point},viewportSize:{width:innerWidth,height:innerHeight},themeVariant:matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light',customRendering};
      const saved={node,surfaceId:hit.registrationId,version:registration.version,value};selections.set(key,saved);while(selections.size>8)selections.delete(selections.keys().next().value);activeSelection=saved;return{status:'hit',selection:value};
    },
    inspect(key){const saved=selections.get(key),registration=saved&&registrations.get(saved.node);return !disposed&&featuresEnabled&&saved&&validElement(saved.node)&&registration?.id===saved.surfaceId&&registration.version===saved.version&&saved.value.anchor.pageUrl===location.href?saved.value:null;},
    selectionTarget(key){return this.inspect(key)?selections.get(key).node:null;},
    selectionProof(key){const saved=selections.get(key);return this.inspect(key)?{key,surfaceId:saved.surfaceId,targetId:saved.value.anchor.targetId,version:saved.version}:null;},
    retainSelection(key){const saved=selections.get(key);if(!this.inspect(key))return null;if(saved.leaseId&&leases.has(saved.leaseId))return saved.leaseId;const id=crypto.randomUUID();saved.leaseId=id;leases.set(id,{node:new WeakRef(saved.node),surfaceId:saved.surfaceId,version:saved.version,value:structuredClone(saved.value)});return id;},
    inspectLease(id){const lease=leases.get(id),node=lease?.node.deref(),registration=node&&registrations.get(node);return !disposed&&featuresEnabled&&lease&&validElement(node)&&registration?.id===lease.surfaceId&&registration.version===lease.version&&lease.value.anchor.pageUrl===location.href?{selection:lease.value,registration:{key:lease.value.key,surfaceId:lease.surfaceId,targetId:lease.value.anchor.targetId,version:lease.version}}:null;},
    leaseTarget(id){return this.inspectLease(id)?leases.get(id).node.deref():null;},
    releaseLease(id){return leases.delete(id);},
    renderSelection(key,selection){const saved=selections.get(key);if(!this.inspect(key)||!selection||['hoveredId','selectedId'].some(field=>selection[field]!==null&&selection[field]!==saved.value.anchor.targetId))return false;return render(saved.node,saved.surfaceId,{hoveredId:selection.hoveredId,selectedId:selection.selectedId});},
    getTargets(){return disposed?[]:[...registrations.keys()].filter(validElement);},
    setFeaturesEnabled(value){if(typeof value!=='boolean')throw TypeError('Invalid annotation feature state');if(featuresEnabled!==value){featuresEnabled=value;if(!value)clear();}return featuresEnabled;},
    cancel,clear,
    dispose(){clear();disposed=true;observer.disconnect();registrations.clear();leases.clear();document.removeEventListener(responseEvent,observe);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',clear);}
  };
}

async function controller(views,view,entry,signal){
  let state=controllers.get(view);if(state?.document===view.document){await views.read(view,state.ready,signal);return state;}
  state={document:view.document,cdp:entry.cdp,frameId:entry.frameId,contextId:null,objectId:null,disposed:false};controllers.set(view,state);
  const signals=[view.document.signal,view.lifetime.signal];
  const dispose=async()=>{state.disposed=true;for(const item of signals)item.removeEventListener('abort',dispose);if(controllers.get(view)===state)controllers.delete(view);await state.ready?.catch(()=>{});if(state.objectId){await state.cdp.send('Runtime.callFunctionOn',{objectId:state.objectId,functionDeclaration:'function(){this.dispose();}'}).catch(()=>{});await state.cdp.send('Runtime.releaseObject',{objectId:state.objectId}).catch(()=>{});state.objectId=null;}};
  for(const item of signals)item.addEventListener('abort',dispose,{once:true});
  state.ready=(async()=>{
    const world=await state.cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName:'trisoul-annotation-surfaces'});state.contextId=world.executionContextId;
    const result=await state.cdp.send('Runtime.evaluate',{contextId:state.contextId,expression:'('+sourceSurfaceController.toString()+')()',returnByValue:false});
    if(result.exceptionDetails||!result.result?.objectId)throw changed();state.objectId=result.result.objectId;
  })();
  try{await views.read(view,state.ready,signal);if(state.disposed||state.document!==view.document)throw changed();return state;}catch(error){await dispose();throw error;}
}

async function call(views,view,state,method,args,signal){
  if(state.disposed||state.document!==view.document||!state.objectId)throw changed();
  const response=await views.read(view,state.cdp.send('Runtime.callFunctionOn',{objectId:state.objectId,functionDeclaration:'function(method,...args){return this[method](...args);}',arguments:[{value:method},...args],returnByValue:true,awaitPromise:true}),signal);
  if(response.exceptionDetails||state.disposed||state.document!==view.document)throw changed();return response.result?.value;
}

export async function selectAnnotationSurface(views,view,input,signal){
  const lifetime=AbortSignal.any([signal,view.document.signal,view.lifetime.signal].filter(Boolean));lifetime.throwIfAborted();
  if(view.siteAnnotationFeaturesEnabled===false)return{status:'not-registered'};
  const baseline=view.annotations?.get(input.sourceFrameId),original=baseline?.result.elements.find(value=>value.key===input.elementKey),point=input.selectionPoint;
  if(!baseline||view.annotationDocument!==view.document||baseline.result.frame.loaderId!==view.loaderId||!original||!point||!['x','y'].every(key=>Number.isFinite(point[key])&&point[key]>=0&&point[key]<=1))throw changed();
  const documents=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime),read=operation=>views.read(view,operation,lifetime);let state,objectId,resolving;
  try{
    if(JSON.stringify(documents.signature)!==JSON.stringify(baseline.dom))throw changed();
    const entry=documents.entries.get(original.frameId);if(!entry||entry.owner)return{status:'not-registered'};
    state=await controller(views,view,entry,lifetime);await call(views,view,state,'setFeaturesEnabled',[{value:view.siteAnnotationFeaturesEnabled!==false}],lifetime);resolving=entry.cdp.send('DOM.resolveNode',{backendNodeId:original.backendNodeId,executionContextId:state.contextId});
    objectId=(await read(resolving)).object?.objectId;if(!objectId)throw changed();const geometry=baseline.result.frame.geometry;
    const selected=await call(views,view,state,'select',[{objectId},{value:{x:geometry.offsetX+point.x*geometry.width,y:geometry.offsetY+point.y*geometry.height}},{value:input.append===true}],lifetime);
    if(selected?.status!=='hit')return selected?.status==='not-registered'||selected?.status==='virtual-multi'?selected:{...(selected??{status:'unavailable'}),snapshot:await captureAnnotation(views,view,lifetime)};
    const result=await captureAnnotation(views,view,lifetime);lifetime.throwIfAborted();
    const current=await call(views,view,state,'inspect',[{value:selected.selection.key}],lifetime);if(!current||JSON.stringify(current)!==JSON.stringify(selected.selection))throw changed();
    const frozen=view.annotations?.get(result.frame.id);if(!frozen)throw changed();frozen.virtualSelection=structuredClone(current);result.virtualSelection=structuredClone(current);
    return{status:'hit',snapshot:result};
  }catch(error){if(state?.objectId)void state.cdp.send('Runtime.callFunctionOn',{objectId:state.objectId,functionDeclaration:'function(){this.clear();}'}).catch(()=>{});throw error;}
  finally{if(objectId)await state.cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{});else if(resolving)void resolving.then(value=>value.object?.objectId&&state.cdp.send('Runtime.releaseObject',{objectId:value.object.objectId})).catch(()=>{});await documents.dispose();}
}

export async function readFrozenAnnotationSurface(views,view,baseline,key,signal){
  if(view.siteAnnotationFeaturesEnabled===false)throw changed();
  const saved=baseline.virtualSelection,state=controllers.get(view);if(!saved||saved.key!==key||!state||state.document!==view.document)throw changed();
  const current=await call(views,view,state,'inspect',[{value:key}],signal);if(!current||JSON.stringify(current)!==JSON.stringify(saved))throw changed();return saved;
}

// Private actual node access for the already frozen source hit. It does not
// search registered targets, re-hit a point, or accept a renderer node id.
export async function readFrozenAnnotationSurfaceTarget(views,view,baseline,key,signal){
  const lifetime=AbortSignal.any([signal,view.document.signal,view.lifetime.signal].filter(Boolean));lifetime.throwIfAborted();
  if(!baseline||view.annotationDocument!==view.document||baseline.result.frame.loaderId!==view.loaderId)throw changed();
  const selection=await readFrozenAnnotationSurface(views,view,baseline,key,lifetime),state=controllers.get(view);let objectId,resolving;
  try{
    const before=await call(views,view,state,'selectionProof',[{value:key}],lifetime);if(!before||before.surfaceId!==selection.anchor.surfaceId||before.targetId!==selection.anchor.targetId)throw changed();
    const tree=await views.read(view,state.cdp.send('Page.getFrameTree'),lifetime);if(tree.frameTree.frame.id!==state.frameId||tree.frameTree.frame.loaderId!==view.loaderId)throw changed();
    resolving=state.cdp.send('Runtime.callFunctionOn',{objectId:state.objectId,functionDeclaration:'function(key){return this.selectionTarget(key);}',arguments:[{value:key}],returnByValue:false});
    const target=await views.read(view,resolving,lifetime);objectId=target.result?.objectId;if(target.exceptionDetails||!objectId)throw changed();
    const description=await views.read(view,state.cdp.send('DOM.describeNode',{objectId}),lifetime),backendNodeId=description.node?.backendNodeId;
    if(!Number.isSafeInteger(backendNodeId)||backendNodeId<=0)throw changed();
    const details=await views.read(view,state.cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){return this.ownerDocument===document&&this.isConnected?{tag:this.tagName.toLowerCase()}:null;}',returnByValue:true}),lifetime);
    const after=await call(views,view,state,'selectionProof',[{value:key}],lifetime),current=await readFrozenAnnotationSurface(views,view,baseline,key,lifetime);
    const actualTree=await views.read(view,state.cdp.send('Page.getFrameTree'),lifetime);
    if(details.exceptionDetails||!details.result?.value||JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(current)!==JSON.stringify(selection)||actualTree.frameTree.frame.id!==state.frameId||actualTree.frameTree.frame.loaderId!==view.loaderId)throw changed();
    const lease=await call(views,view,state,'retainSelection',[{value:key}],lifetime);if(typeof lease!=='string'||!lease)throw changed();
    return{selection:structuredClone(selection),identity:{frameId:state.frameId,frameLoaderId:actualTree.frameTree.frame.loaderId,backendNodeId},elementTagName:details.result.value.tag,registration:structuredClone(before),lease};
  }finally{if(objectId)await state.cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{});else if(resolving)void resolving.then(value=>value.result?.objectId&&state.cdp.send('Runtime.releaseObject',{objectId:value.result.objectId})).catch(()=>{});}
}

export async function readAnnotationSurfaceTargetLease(views,view,lease,signal){
  const lifetime=AbortSignal.any([signal,view.document.signal,view.lifetime.signal].filter(Boolean));lifetime.throwIfAborted();
  const state=controllers.get(view);if(typeof lease!=='string'||!lease||!state||state.document!==view.document||state.disposed)throw changed();let objectId,resolving;
  try{
    const before=await call(views,view,state,'inspectLease',[{value:lease}],lifetime);if(!before)throw changed();
    const tree=await views.read(view,state.cdp.send('Page.getFrameTree'),lifetime);if(tree.frameTree.frame.id!==state.frameId||tree.frameTree.frame.loaderId!==view.loaderId)throw changed();
    resolving=state.cdp.send('Runtime.callFunctionOn',{objectId:state.objectId,functionDeclaration:'function(id){return this.leaseTarget(id);}',arguments:[{value:lease}],returnByValue:false});
    const target=await views.read(view,resolving,lifetime);objectId=target.result?.objectId;if(target.exceptionDetails||!objectId)throw changed();
    const description=await views.read(view,state.cdp.send('DOM.describeNode',{objectId}),lifetime),backendNodeId=description.node?.backendNodeId;if(!Number.isSafeInteger(backendNodeId)||backendNodeId<=0)throw changed();
    const details=await views.read(view,state.cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){if(this.ownerDocument!==document||!this.isConnected)return null;const rect=this.getBoundingClientRect(),visual=window.visualViewport;return{tag:this.tagName.toLowerCase(),surfaceRect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},viewport:{width:innerWidth,height:innerHeight,scrollY,...visual&&(visual.offsetLeft!==0||visual.offsetTop!==0||visual.scale!==1)?{visualViewport:{offsetLeft:visual.offsetLeft,offsetTop:visual.offsetTop,scale:visual.scale}}:{}}};}',returnByValue:true}),lifetime);
    const after=await call(views,view,state,'inspectLease',[{value:lease}],lifetime),actualTree=await views.read(view,state.cdp.send('Page.getFrameTree'),lifetime),value=details.result?.value;
    if(details.exceptionDetails||!value||!['x','y','width','height'].every(key=>Number.isFinite(value.surfaceRect?.[key]))||!['width','height','scrollY'].every(key=>Number.isFinite(value.viewport?.[key]))||value.viewport.width<=0||value.viewport.height<=0||JSON.stringify(before)!==JSON.stringify(after)||actualTree.frameTree.frame.id!==state.frameId||actualTree.frameTree.frame.loaderId!==view.loaderId)throw changed();
    return{...structuredClone(before),identity:{frameId:state.frameId,frameLoaderId:actualTree.frameTree.frame.loaderId,backendNodeId},elementTagName:value.tag,surfaceRect:value.surfaceRect,viewport:value.viewport,lease};
  }finally{if(objectId)await state.cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{});else if(resolving)void resolving.then(value=>value.result?.objectId&&state.cdp.send('Runtime.releaseObject',{objectId:value.result.objectId})).catch(()=>{});}
}

export async function renderFrozenAnnotationSurfaceSelection(views,view,baseline,key,signal,{selected=true,hovered=false}={}){
  if(typeof selected!=='boolean'||typeof hovered!=='boolean')throw TypeError('Invalid frozen surface rendering state');
  const actual=await readFrozenAnnotationSurface(views,view,baseline,key,signal),state=controllers.get(view);
  const rendered=await call(views,view,state,'renderSelection',[{value:key},{value:{selectedId:selected?actual.anchor.targetId:null,hoveredId:hovered?actual.anchor.targetId:null}}],signal);
  const current=await readFrozenAnnotationSurface(views,view,baseline,key,signal);if(JSON.stringify(current)!==JSON.stringify(actual))throw changed();return{rendered:rendered===true,selection:current};
}

export async function clearAnnotationSurfaceSelection(views,view,signal){
  const state=controllers.get(view);if(state?.document===view.document&&!state.disposed)await call(views,view,state,'clear',[],signal);
}

// Shared private handle: site inspection and previews reuse the actual
// registered surface map rather than installing a competing registry.
export async function annotationSurfaceController(views,view,signal){
  const lifetime=AbortSignal.any([signal,view.document.signal,view.lifetime.signal].filter(Boolean));lifetime.throwIfAborted();
  const documents=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime);
  try{
    const top=[...documents.entries.values()].find(entry=>!entry.owner);if(!top)throw changed();
    const state=await controller(views,view,top,lifetime);await call(views,view,state,'setFeaturesEnabled',[{value:view.siteAnnotationFeaturesEnabled!==false}],lifetime);return state;
  }finally{await documents.dispose();}
}

export async function applyAnnotationSurfaceFeaturesEnabled(views,view,enabled,signal){
  if(typeof enabled!=='boolean')throw TypeError('Invalid annotation feature state');
  const state=controllers.get(view);if(state?.document===view.document&&!state.disposed)await call(views,view,state,'setFeaturesEnabled',[{value:enabled}],signal);
}
