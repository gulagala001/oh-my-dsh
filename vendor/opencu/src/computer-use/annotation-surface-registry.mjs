// browser-page-preload Wd/zd. This function has no module dependencies so an
// owned browser preload can serialize it into the top document's main world.
export function installAnnotationSurfaceRegistry(){
  if(window!==window.top||!globalThis.isSecureContext)return false;
  const events={request:'codex:annotation-surface-request',response:'codex:annotation-surface-response',remove:'codex:annotation-surfaces-remove',available:'codex:annotation-surface-available'},busy=Symbol.for('codex:annotation-surface-pending');
  const surfaces=new Map(),documentId=crypto.randomUUID();let active=null,pending=null,disposed=false,nextId=0;
  let oai,annotation,ownOai=false,ownAnnotation=false;
  try{
    oai=Reflect.get(document,'oai');if(oai!=null&&typeof oai!=='object'&&typeof oai!=='function')return false;
    if(oai==null){oai={};if(!Reflect.defineProperty(document,'oai',{configurable:true,enumerable:false,value:oai}))return false;ownOai=true;}
    annotation=Reflect.get(oai,'annotation');if(annotation!=null&&(typeof annotation!=='object'||Reflect.has(annotation,'registerSurface')))return false;
    if(annotation==null){annotation={};if(!Reflect.defineProperty(oai,'annotation',{configurable:true,enumerable:false,value:annotation}))return false;ownAnnotation=true;}
  }catch{return false;}
  const validElement=node=>node instanceof HTMLElement&&!(node instanceof HTMLIFrameElement)&&node.isConnected&&node.ownerDocument===document&&node.getRootNode()===document;
  const validString=value=>typeof value==='string'&&value.length>0&&value.length<=128&&/^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(value);
  const validNullableId=value=>value===null||validString(value);
  const plain=(value,maxKeys)=>{
    if(typeof value!=='object'||!value)return null;const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)return null;
    const properties=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(properties);if(keys.length>maxKeys||keys.some(key=>typeof key!=='string'))return null;
    const result=Object.create(null);for(const [key,property]of Object.entries(properties)){if(!property.enumerable||!Object.hasOwn(property,'value')||['__proto__','constructor','prototype'].includes(key))return null;result[key]=property.value;}return result;
  };
  const sanitizeHit=value=>{
    if(value===null)return null;
    try{
      const input=plain(value,5);if(input==null||!validString(input.id))return undefined;const hit={id:input.id};
      if(typeof input.name==='string'&&input.name.trim().length>0&&input.name.length<=128&&/^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(input.name))hit.name=input.name;
      if(typeof input.role==='string'&&input.role.length<=64&&/^[a-z][a-z0-9-]*(?![\s\S])/.test(input.role))hit.role=input.role;
      if(input.rect!==undefined){const rect=plain(input.rect,4);if(rect==null||!['x','y','width','height'].every(key=>typeof rect[key]==='number'&&Number.isFinite(rect[key]))||rect.width<=0||rect.height<=0)return undefined;hit.rect={x:rect.x,y:rect.y,width:rect.width,height:rect.height};}
      const metadata=plain(input.metadata,6);
      if(metadata!=null&&Object.entries(metadata).every(([key,value])=>key.length<=64&&/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z0-9_-]+)*$/.test(key)&&(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.length<=256&&/^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(value)))){
        const serialized=JSON.stringify(metadata);if(new TextEncoder().encode(serialized).byteLength<=2048)hit.metadata=JSON.parse(serialized);
      }
      return hit;
    }catch{return undefined;}
  };
  const emit=(registration,type,requestId,hit)=>registration.options.element.dispatchEvent(new CustomEvent(events.response,{bubbles:true,detail:JSON.stringify({type,registrationId:registration.id,customRendering:registration.options.renderSelection!=null&&!registration.renderFailed,requestId,hit})}));
  const renderFailed=registration=>{if(!registration.renderFailed){registration.renderFailed=true;render(registration,{hoveredId:null,selectedId:null});emit(registration,'rendering-failed');}};
  const render=(registration,selection)=>{
    const callback=registration.options.renderSelection;
    if(callback==null||registration.renderFailed&&(selection.hoveredId!=null||selection.selectedId!=null)||registration.selection.hoveredId===selection.hoveredId&&registration.selection.selectedId===selection.selectedId)return;
    registration.selection=selection;try{const result=callback({...selection});if(result!=null)Promise.resolve(result).catch(()=>renderFailed(registration));}catch{renderFailed(registration);}
  };
  const cancelActive=()=>{if(active==null||active.answered)return;active.answered=true;clearTimeout(active.timer);active.controller.abort();emit(active.registration,'result',active.requestId);};
  const cancelPending=()=>{if(pending==null)return;const previous=pending;pending=null;clearTimeout(previous.timer);emit(previous.registration,'result',previous.requestId);};
  const disposeRegistration=registration=>{surfaces.delete(registration.options.element);if(active?.registration===registration)cancelActive();if(pending?.registration===registration)cancelPending();render(registration,{hoveredId:null,selectedId:null});emit(registration,'disposed');};
  const complete=(request,value)=>{
    clearTimeout(request.timer);if(active!==request)return;
    if(performance.now()>=request.deadline)cancelActive();active=null;
    if(Reflect.getOwnPropertyDescriptor(document,busy)?.value===documentId)Reflect.deleteProperty(document,busy);
    if(request.answered){if(pending==null){if(!disposed&&surfaces.get(request.registration.options.element)===request.registration)emit(request.registration,'invalidated');}else pump();}
    else{request.answered=true;emit(request.registration,'result',request.requestId,sanitizeHit(value));pump();}
    document.dispatchEvent(new Event(events.available));
  };
  const pump=()=>{
    if(active!=null||pending==null||Reflect.getOwnPropertyDescriptor(document,busy)!=null)return;
    const waiting=pending;pending=null;clearTimeout(waiting.timer);const remaining=waiting.deadline-performance.now();
    if(remaining<=0||!Reflect.defineProperty(document,busy,{configurable:true,value:documentId})){emit(waiting.registration,'result',waiting.requestId);return;}
    const request={registration:waiting.registration,requestId:waiting.requestId,controller:new AbortController(),timer:null,deadline:waiting.deadline,answered:false};
    request.timer=setTimeout(cancelActive,remaining);active=request;
    try{const result=waiting.registration.options.hitTest({clientX:waiting.x,clientY:waiting.y,signal:request.controller.signal});Promise.resolve(result).then(value=>complete(request,value),()=>complete(request,undefined));}catch{complete(request,undefined);}
  };
  const onRequest=event=>{
    if(!(event instanceof CustomEvent)||typeof event.detail!=='string'||event.detail.length>8192)return;
    let request;try{request=plain(JSON.parse(event.detail),6);}catch{return;}if(request==null||disposed)return;
    if(request.type==='list'){for(const registration of surfaces.values())if(validElement(registration.options.element))emit(registration,'registered');return;}
    if(request.type==='cancel'||request.type==='clear'){cancelActive();cancelPending();if(request.type==='clear')for(const registration of surfaces.values())render(registration,{hoveredId:null,selectedId:null});return;}
    const registration=event.target instanceof HTMLElement?surfaces.get(event.target):null;if(registration==null||!validElement(registration.options.element))return;
    if(request.type==='probe'){emit(registration,'registered');return;}if(request.registrationId!==registration.id)return;
    if(request.type==='render'){if(validNullableId(request.hoveredId)&&validNullableId(request.selectedId))render(registration,{hoveredId:request.hoveredId,selectedId:request.selectedId});return;}
    if(request.type!=='hit-test'||typeof request.requestId!=='string'||request.requestId.length>128||typeof request.x!=='number'||!Number.isFinite(request.x)||typeof request.y!=='number'||!Number.isFinite(request.y))return;
    cancelPending();pending={registration,requestId:request.requestId,x:request.x,y:request.y,deadline:performance.now()+250,timer:setTimeout(cancelPending,250)};pump();
  };
  const registerSurface=options=>{
    if(disposed||options==null||!(options.element instanceof HTMLElement)||!validElement(options.element)||typeof options.hitTest!=='function'||options.renderSelection!=null&&typeof options.renderSelection!=='function')throw TypeError('Annotation surfaces require a connected top-document element and hitTest callback.');
    const node=options.element,previous=surfaces.get(node);if(previous!=null)disposeRegistration(previous);
    const registration={id:documentId+'-'+(++nextId),options:{element:node,hitTest:options.hitTest,renderSelection:options.renderSelection},renderFailed:false,selection:{hoveredId:null,selectedId:null}};
    surfaces.set(node,registration);emit(registration,'registered');
    return{invalidate(){if(surfaces.get(node)===registration){if(active?.registration===registration)cancelActive();if(pending?.registration===registration)cancelPending();emit(registration,'invalidated');}},dispose(){if(surfaces.get(node)===registration)disposeRegistration(registration);}};
  };
  try{if(!Reflect.defineProperty(annotation,'registerSurface',{configurable:true,enumerable:false,value:registerSurface}))return false;}catch{return false;}
  const observer=new MutationObserver(()=>{for(const registration of surfaces.values())if(!validElement(registration.options.element))disposeRegistration(registration);});
  const remove=()=>{
    disposed=true;for(const registration of surfaces.values())disposeRegistration(registration);observer.disconnect();
    document.removeEventListener(events.request,onRequest);document.removeEventListener(events.remove,remove);document.removeEventListener(events.available,pump);
    if(Reflect.getOwnPropertyDescriptor(annotation,'registerSurface')?.value===registerSurface)Reflect.deleteProperty(annotation,'registerSurface');
    if(ownAnnotation&&Reflect.ownKeys(annotation).length===0&&Reflect.getOwnPropertyDescriptor(oai,'annotation')?.value===annotation)Reflect.deleteProperty(oai,'annotation');
    if(ownOai&&Reflect.ownKeys(oai).length===0&&Reflect.getOwnPropertyDescriptor(document,'oai')?.value===oai)Reflect.deleteProperty(document,'oai');
  };
  document.addEventListener(events.request,onRequest);document.addEventListener(events.remove,remove);document.addEventListener(events.available,pump);observer.observe(document,{childList:true,subtree:true});return true;
}
