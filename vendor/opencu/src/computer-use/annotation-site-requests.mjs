import {randomUUID} from 'node:crypto';
import {sanitizeAnnotationSiteMetadata} from './annotation-site-metadata.mjs';
import {readAnnotationTextSelection} from './annotation-text-anchor.mjs';
import {annotationSiteControlsController} from './annotation-site-controls.mjs';

const changed=()=>Object.assign(new Error('站点批注请求或文档已经改变。'),{code:'ANNOTATION_CHANGED'});

// browser-page-preload _d/Cd/vd/Sd/J/yd/bd, with the source request event.
// The remote object keeps the real target/Range; the binding carries only IDs.
function siteRequestDocument(bindingName,nonce,initialState,connected,listen=true){
  const doc=document,win=window;let state=initialState,pending=null,hidden=false,closed=false,hostConnected=connected,nextId=0;
  const send=listen?globalThis[bindingName]:null;
  const emit=(type,id)=>{try{send(JSON.stringify({nonce,type,requestId:id}));return true;}catch{return false;}};
  const clear=()=>{const old=pending;pending=null;if(old!=null)emit('cancel',old.id);};
  const allowed=(kind='request',delivery=false)=>!closed&&!hidden&&hostConnected&&state.secureContext===true&&win.top===win&&state.canUseSiteAnnotationApi===true&&state.isAgentControllingBrowser===false&&(kind==='toggle'?state.toggleConnected===true:state.requestConnected===true&&(state.hasActiveEditor===false||delivery));
  const shadow=root=>root?.nodeType===11&&root.host instanceof HTMLElement&&root.host.shadowRoot===root;
  const parent=node=>node.assignedSlot??node.parentElement??(shadow(node.getRootNode())?node.getRootNode().host:null);
  const overlay=node=>node.id==='codex-browser-sidebar-comments-root'||node.closest('#codex-browser-sidebar-comments-root')!=null||node.getRootNode() instanceof ShadowRoot&&node.getRootNode().host.id==='codex-browser-sidebar-comments-root';
  const visible=node=>{
    const visibility=win.getComputedStyle(node).visibility;if(visibility==='hidden'||visibility==='collapse')return false;
    for(let current=node;current!=null;current=parent(current)){const css=win.getComputedStyle(current);if(css.display==='none'||css.contentVisibility==='hidden'||Number.parseFloat(css.opacity)===0)return false;}
    return true;
  };
  const elementRect=node=>{
    if(node.ownerDocument!==doc||!node.isConnected||overlay(node))return null;
    let selectable=null;
    for(let current=node;current?.ownerDocument===doc&&current!==doc.body&&current!==doc.documentElement;current=current.parentElement){
      const box=current.getBoundingClientRect();if(box.width<=0||box.height<=0)continue;selectable??=current;
      const ownText=(current.innerText||current.textContent||'').replace(/\s+/g,' ').trim();
      if(['a','button','input','textarea','select','label','img'].includes(current.tagName.toLowerCase())||current.getAttribute('role')!=null||ownText.length>0&&box.width>=24&&box.height>=16){selectable=current;break;}
      if(box.width>=48&&box.height>=24)selectable=current;
    }
    if(selectable==null)return null;
    for(let current=node;current!=null;current=current.parentElement){const css=win.getComputedStyle(current);if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||Number.parseFloat(css.opacity)===0)return null;}
    const rect=node.getBoundingClientRect();
    if(typeof node.checkVisibility==='function'&&!node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0||rect.x>=win.innerWidth||rect.x+rect.width<=0||rect.y>=win.innerHeight||rect.y+rect.height<=0)return null;
    return{x:rect.x+rect.width/2,y:rect.y+rect.height/2};
  };
  const selectorPart=(node,unique=false)=>{
    const parts=[];let current=node,depth=0;
    const matches=value=>{const found=node.getRootNode().querySelectorAll(value);return found.length===1&&found[0]===node;};
    const escape=value=>typeof win.CSS?.escape==='function'?win.CSS.escape(value):value.replace(/[^a-zA-Z0-9_-]/g,'\\$&');
    for(;current!=null&&(unique||depth<4);current=current.parentElement,depth++){
      let value=current.tagName.toLowerCase();if(current.id){value+='#'+escape(current.id);const candidate=[value,...parts].join(' > ');if(!unique||matches(candidate))return candidate;}
      const classes=Array.from(current.classList).filter(value=>/^[a-zA-Z0-9_-]+$/.test(value)).slice(0,2);if(classes.length)value+='.'+classes.map(escape).join('.');
      if(current.parentElement){const siblings=Array.from(current.parentElement.children).filter(value=>value.tagName===current.tagName);if(siblings.length>1)value+=':nth-of-type('+(siblings.indexOf(current)+1)+')';}
      parts.unshift(value);const candidate=parts.join(' > ');if(unique&&matches(candidate))return candidate;
    }
    return unique||parts.length===0?null:parts.join(' > ');
  };
  const rangeAnchor=range=>{
    if(range.collapsed||!range.startContainer.isConnected||!range.endContainer.isConnected||range.startContainer.ownerDocument!==doc||range.endContainer.ownerDocument!==doc)return null;
    const selectedText=range.toString();if(selectedText.trim().length===0||selectedText.length>20000)return null;
    let root=range.commonAncestorContainer;root=root.nodeType===1?root:root.parentElement;
    for(;root instanceof HTMLElement&&selectorPart(root)==null;root=root.parentElement){}
    if(!(root instanceof HTMLElement))return null;
    const selector=selectorPart(root,true);if(selector==null)return null;
    const shadowHosts=[];let scope=root.getRootNode();
    for(;scope!==doc;){if(!shadow(scope))return null;const part=selectorPart(scope.host,true);if(part==null)return null;shadowHosts.unshift(part);scope=scope.host.getRootNode();}
    const security=node=>{const value=win.getComputedStyle(node).getPropertyValue('-webkit-text-security');return value.length>0&&value!=='none';};
    const ancestor=range.commonAncestorContainer,walker=doc.createTreeWalker(ancestor,4);let node=ancestor.nodeType===3?ancestor:walker.nextNode();
    for(;node!=null;node=walker.nextNode()){
      const content=node.textContent??'',start=node===range.startContainer?range.startOffset:0,end=node===range.endContainer?range.endOffset:content.length;
      if(range.intersectsNode(node)&&node.parentElement!=null&&security(node.parentElement))return null;
      const owner=node instanceof Text?node.assignedSlot??node.parentElement:node.parentElement;
      if(end>start&&range.intersectsNode(node)&&(owner==null||!visible(owner)))return null;
    }
    const start=doc.createRange(),end=doc.createRange();let startOffset,endOffset;
    try{start.selectNodeContents(root);start.setEnd(range.startContainer,range.startOffset);startOffset=start.toString().length;end.selectNodeContents(root);end.setEnd(range.endContainer,range.endOffset);endOffset=end.toString().length;}catch{return null;}
    if(endOffset<=startOffset)return null;
    const boxes=range.getClientRects();if(boxes.length>1000)return null;
    const rects=Array.from(boxes).filter(rect=>rect.width>0&&rect.height>0);if(!rects.length||!rects.some(rect=>rect.x<win.innerWidth&&rect.x+rect.width>0&&rect.y<win.innerHeight&&rect.y+rect.height>0))return null;
    const last=rects.at(-1),point={x:last.left+last.width,y:last.top+last.height/2};
    return{viewportPoint:point,textAnchor:{kind:'text',framePath:[],frameUrl:null,selectedText,textLocator:{selector,shadowHosts,kind:'dom',direction:'forward',rangeText:selectedText,startOffset,endOffset}}};
  };
  const valid=record=>{
    if(!allowed(record.kind??'request',record.delivering===true))return null;
    if(record.kind==='toggle')return{};
    const target=record.target;
    if(target instanceof Range){const common=target.commonAncestorContainer,node=common instanceof HTMLElement?common:common.parentElement;if(record.request.openTweaks||node==null||overlay(node)||target.startContainer.ownerDocument!==doc||target.toString()!==record.rangeText)return null;return rangeAnchor(target);}
    const viewportPoint=elementRect(target);return viewportPoint==null?null:{viewportPoint};
  };
  const metadata=value=>{
    if(typeof value!=='object'||!value)return undefined;
    try{
      const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)return undefined;
      const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
      if(keys.length>6||keys.some(key=>typeof key!=='string'||key.length>64||!/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z0-9_-]+)*$/.test(key)||['__proto__','constructor','prototype'].includes(key))||Object.values(descriptors).some(value=>!value.enumerable||!Object.hasOwn(value,'value')))return undefined;
      const entries=Object.entries(descriptors).map(([key,value])=>[key,value.value]);
      if(entries.some(([,value])=>!(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.length<=256&&/^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(value))))return undefined;
      const result=Object.fromEntries(entries),json=JSON.stringify(result);return keys.length>0&&json.length<=2048&&new TextEncoder().encode(json).byteLength<=2048?result:undefined;
    }catch{return undefined;}
  };
  const detail=event=>{
    try{
      const value='detail'in event?event.detail??{}:{};if(typeof value!=='object'||value===null)return null;
      const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)return null;
      const own=key=>{try{const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor!=null&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined;}catch{return undefined;}};
      const initial=own('initialComment'),range=own('range');
      if(range!==undefined){if(range===null||typeof range!=='object'||!['startPath','endPath'].every(key=>Array.isArray(range[key])&&range[key].length<=128&&range[key].every(value=>Number.isInteger(value)&&value>=0))||!['startOffset','endOffset'].every(key=>Number.isInteger(range[key])&&range[key]>=0)||typeof range.rangeText!=='string'||range.rangeText.length<1||range.rangeText.length>20000)return null;}
      return{mode:own('mode')==='advanced'?'advanced':'default',enterAnnotationMode:own('enterAnnotationMode')===true,initialComment:typeof initial==='string'&&initial.length<=240?initial:undefined,metadata:metadata(own('metadata')),range:range===undefined?undefined:{startPath:[...range.startPath],endPath:[...range.endPath],startOffset:range.startOffset,endOffset:range.endOffset,rangeText:range.rangeText}};
    }catch{return null;}
  };
  const onRequest=event=>{
    // Main receives the actual CustomEvent detail. Native user activation is
    // checked by the host in the authenticated private realm before permission.
    if(pending!=null||!allowed())return;
    const data=detail(event),node=event.composedPath()[0]??event.target;if(data==null||!(node instanceof HTMLElement)||overlay(node))return;
    let target=node;
    if(data.range!==undefined){
      const descend=path=>{let result=node;for(const index of path){result=result.childNodes[index];if(result==null)return null;}return result;};
      const start=descend(data.range.startPath),end=descend(data.range.endPath);if(start==null||end==null)return;
      target=doc.createRange();try{target.setStart(start,data.range.startOffset);target.setEnd(end,data.range.endOffset);}catch{return;}
      if(target.collapsed||target.toString()!==data.range.rangeText)return;
    }
    const record={kind:'request',id:nonce+':'+(++nextId),target,rangeText:data.range?.rangeText,request:{initialComment:data.initialComment,siteInitiated:true,...(data.enterAnnotationMode?{enterAnnotationMode:true}:{}),...(data.mode==='advanced'?{openTweaks:true}:{})},metadata:data.range===undefined&&node.getRootNode()===doc?data.metadata:undefined,permissionGranted:false};
    if(valid(record)==null)return;pending=record;
    if(!emit('request',record.id)){pending=null;return;}
    // Mirrors _d's asynchronous permission branch: accepted means admitted
    // for permission, never that an editor was opened or a comment submitted.
    event.preventDefault();
  };
  const onToggle=event=>{
    if(!allowed('toggle')||typeof event.detail!=='string')return;
    let force;try{const value=JSON.parse(event.detail);if(!value||typeof value!=='object'||Object.keys(value).some(key=>key!=='force')||value.force!==undefined&&typeof value.force!=='boolean')return;force=value.force;}catch{return;}
    // Gd clears an existing site request unless the caller explicitly enters.
    if(force!==true)clear();
    if(pending!=null||!['browse','comment'].includes(state.interactionMode))return;
    const record={kind:'toggle',id:nonce+':'+(++nextId),force,interactionMode:(force??state.interactionMode!=='comment')?'comment':'browse',permissionGranted:false};pending=record;
    if(!emit('toggle',record.id)){pending=null;return;}event.preventDefault();
  };
  const pagehide=event=>{if(event.isTrusted){hidden=true;hostConnected=false;clear();if(!event.persisted)dispose();}};
  const pageshow=event=>{if(event.isTrusted)hidden=false;};
  const keydown=event=>{if(event.isTrusted&&event.key==='Escape')clear();};
  const dispose=()=>{if(closed)return true;closed=true;clear();doc.removeEventListener('codex:open-annotation',onRequest);win.removeEventListener('opencu:annotation-mode-request',onToggle);win.removeEventListener('pagehide',pagehide);win.removeEventListener('pageshow',pageshow);win.removeEventListener('keydown',keydown,true);return true;};
  if(listen){doc.addEventListener('codex:open-annotation',onRequest);win.addEventListener('opencu:annotation-mode-request',onToggle);win.addEventListener('pagehide',pagehide);win.addEventListener('pageshow',pageshow);win.addEventListener('keydown',keydown,true);}
  return{
    update(next){
      state=next;hostConnected=connected;
      if(!state.canUseSiteAnnotationApi||state.isAgentControllingBrowser||hidden||closed||state.hasActiveEditor&&pending?.kind!=='toggle'&&!pending?.delivering)clear();
      return!closed;
    },clear,dispose,
    read(id){if(pending?.id!==id)return null;const geometry=valid(pending);return geometry==null?null:pending.kind==='toggle'?{kind:'toggle',force:pending.force,interactionMode:pending.interactionMode,pageUrl:win.location.href}:{kind:pending.target instanceof Range?'text':'element',request:{...pending.request},metadata:pending.metadata,...geometry,pageUrl:win.location.href};},
    node(id,part){if(pending?.id!==id||valid(pending)==null)return null;const target=pending.target;if(!(target instanceof Range))return part==='target'?target:null;if(part==='start')return target.startContainer;if(part==='end')return target.endContainer;const common=target.commonAncestorContainer;return part==='target'?(common instanceof HTMLElement?common:common.parentElement):null;},
    proof(target,start,end,spec){
      if(listen||!allowed('request',spec.delivery===true)||!(target instanceof HTMLElement)||target.ownerDocument!==doc)return null;
      if(spec.kind==='element'){const viewportPoint=elementRect(target);return viewportPoint==null?null:{kind:'element',viewportPoint,pageUrl:win.location.href};}
      if(spec.kind!=='text'||spec.openTweaks||!start||!end||start.ownerDocument!==doc||end.ownerDocument!==doc)return null;
      const range=doc.createRange();try{range.setStart(start,spec.startOffset);range.setEnd(end,spec.endOffset);}catch{return null;}
      const common=range.commonAncestorContainer,owner=common instanceof HTMLElement?common:common.parentElement;
      if(owner!==target||overlay(owner)||range.toString()!==spec.rangeText)return null;
      const geometry=rangeAnchor(range);return geometry==null?null:{kind:'text',...geometry,pageUrl:win.location.href};
    },
    modeProof(){return!listen&&allowed('toggle')?{pageUrl:win.location.href}:null;},
    setMode(id,interactionMode){if(pending?.id!==id||pending.kind!=='toggle'||pending.permissionGranted||!['browse','comment'].includes(interactionMode))return false;pending.interactionMode=interactionMode;return true;},
    offsets(id){const target=pending?.id===id?pending.target:null;return target instanceof Range?{startOffset:target.startOffset,endOffset:target.endOffset}:null;},
    permission(id){if(pending?.id!==id||valid(pending)==null)return false;pending.permissionGranted=true;pending.delivering=true;return true;},
    finish(id,accepted){if(pending?.id!==id)return false;const result=accepted===true&&pending.permissionGranted;pending=null;return result;},
  };
}

function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}

// Install only in a protocol-authenticated top document. onRequest must return
// true after the real viewer opened the editor; no callback defaults to success.
export async function installAnnotationSiteRequestReceiver(views,view,topEntry,callbacks={},signal){
  if(!topEntry?.cdp||!topEntry.frameId||topEntry.owner)throw changed();
  const document=view.document,lifetime=AbortSignal.any([signal,view.lifetime.signal,document.signal].filter(Boolean));lifetime.throwIfAborted();
  const read=operation=>views.read(view,operation,lifetime),controls=await annotationSiteControlsController(views,view,lifetime);
  if(controls===null)return null;
  if(controls.document!==document||controls.disposed||controls.frameId!==topEntry.frameId||controls.frameLoaderId!==topEntry.loaderId||!controls.registrationObjectId||!controls.objectId||!Number.isSafeInteger(controls.registrationContextId)||!Number.isSafeInteger(controls.contextId)||controls.registrationContextId===controls.contextId)throw changed();
  const cdp=controls.cdp,frameId=controls.frameId,loaderId=controls.frameLoaderId,contextId=controls.registrationContextId,privateContextId=controls.contextId;
  const registrationObjectId=controls.registrationObjectId,projectionObjectId=controls.objectId;
  const nonce=randomUUID(),bindingName='__trisoul_annotation_request_'+randomUUID().replaceAll('-','');
  const baseConnected=typeof callbacks.getState==='function'&&typeof callbacks.requestPermission==='function';
  const requestConnected=baseConnected&&typeof callbacks.onRequest==='function',toggleConnected=baseConnected&&typeof callbacks.onToggle==='function',connected=requestConnected||toggleConnected;
  const issued=new WeakMap();let objectId,privateObjectId,closed=false,pending=null,disposing,secureContext=false;
  const policy=()=>{
    let state;try{state=callbacks.getState?.();}catch{state=null;}
    const valid=state&&['canUseSiteAnnotationApi','hasActiveEditor','isAgentControllingBrowser'].every(key=>typeof state[key]==='boolean');
    return{canUseSiteAnnotationApi:!!(connected&&valid&&view.siteAnnotationFeaturesEnabled===true&&state.canUseSiteAnnotationApi),hasActiveEditor:valid?state.hasActiveEditor:false,isAgentControllingBrowser:valid?state.isAgentControllingBrowser:false,secureContext,requestConnected,toggleConnected:toggleConnected&&valid&&['browse','comment'].includes(state.interactionMode),interactionMode:valid&&['browse','comment'].includes(state.interactionMode)?state.interactionMode:null};
  };
  const remote=async(fn,args=[],byValue=true,guard=true)=>{
    const operation=cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:fn.toString(),arguments:args.map(value=>({value})),returnByValue:byValue});
    try{const response=guard?await read(operation):await operation;if(response.exceptionDetails)throw changed();return response.result;}
    catch(error){if(!byValue)void operation.then(response=>response.result?.objectId&&cdp.send('Runtime.releaseObject',{objectId:response.result.objectId})).catch(()=>{});throw error;}
  };
  const checkDocument=async()=>{
    lifetime.throwIfAborted();if(closed||view.document!==document)throw changed();
    const current=await annotationSiteControlsController(views,view,lifetime);
    if(current!==controls||controls.disposed||controls.registrationObjectId!==registrationObjectId||controls.objectId!==projectionObjectId||controls.registrationContextId!==contextId||controls.contextId!==privateContextId)throw changed();
    const {frameTree}=await read(cdp.send('Page.getFrameTree'));
    if(frameTree.frame.id!==frameId||frameTree.frame.loaderId!==loaderId)throw changed();
  };
  const nativeState=async()=>{
    const response=await read(cdp.send('Runtime.evaluate',{contextId:privateContextId,expression:'({active:navigator.userActivation?.isActive===true,secure:globalThis.isSecureContext===true,top:window.top===window})',returnByValue:true}));
    const value=response.result?.value;if(response.exceptionDetails||!value||!['active','secure','top'].every(key=>typeof value[key]==='boolean'))throw changed();return value;
  };
  const privateRemote=async(fn,args=[])=>{
    const response=await read(cdp.send('Runtime.callFunctionOn',{objectId:privateObjectId,functionDeclaration:fn.toString(),arguments:args,returnByValue:true}));
    if(response.exceptionDetails)throw changed();return response.result?.value;
  };
  const projectHostState=async(next,guard=true)=>{
    const state={canUseSiteAnnotationApi:next.canUseSiteAnnotationApi===true,isAgentControllingBrowser:next.isAgentControllingBrowser===true,interactionMode:next.interactionMode==='comment'?'comment':'browse',connected:next.toggleConnected===true};
    const operation=cdp.send('Runtime.callFunctionOn',{objectId:projectionObjectId,functionDeclaration:'function(value){return this.setHostAnnotationState(value);}',arguments:[{value:state}],returnByValue:true});
    const response=guard?await read(operation):await operation;
    if(response.exceptionDetails||response.result?.value!==true)throw changed();
  };
  const privateProof=async(target,value,delivery)=>{
    const ids=[];
    const resolve=async backendNodeId=>{
      const operation=cdp.send('DOM.resolveNode',{backendNodeId,executionContextId:privateContextId});
      let response;try{response=await read(operation);}catch(error){void operation.then(value=>value.object?.objectId&&cdp.send('Runtime.releaseObject',{objectId:value.object.objectId})).catch(()=>{});throw error;}
      const id=response.object?.objectId;if(!id)throw changed();ids.push(id);return{objectId:id};
    };
    try{
      await privateRemote(function(next){return this.update(next);},[{value:policy()}]);
      const element=await resolve(target.backendNodeId),start=target.kind==='text'?await resolve(target.startBackendNodeId):{value:null},end=target.kind==='text'?await resolve(target.endBackendNodeId):{value:null};
      const spec={kind:target.kind,delivery,...(target.kind==='text'?{startOffset:target.startOffset,endOffset:target.endOffset,rangeText:value.textAnchor?.selectedText,openTweaks:value.request.openTweaks===true}:{})};
      const proof=await privateRemote(function(target,start,end,spec){return this.proof(target,start,end,spec);},[element,start,end,{value:spec}]);
      if(!proof||proof.kind!==target.kind)throw changed();return proof;
    }finally{await Promise.allSettled(ids.map(objectId=>cdp.send('Runtime.releaseObject',{objectId})));}
  };
  const nodeId=async(id,part)=>{
    const operation=remote(function(id,part){return this.node(id,part);},[id,part],false);let node;
    try{node=await operation;if(!node?.objectId)throw changed();return(await read(cdp.send('DOM.describeNode',{objectId:node.objectId}))).node.backendNodeId;}
    finally{if(node?.objectId)await cdp.send('Runtime.releaseObject',{objectId:node.objectId}).catch(()=>{});else void operation.then(value=>value?.objectId&&cdp.send('Runtime.releaseObject',{objectId:value.objectId})).catch(()=>{});}
  };
  const packetFor=async(id,expected,admission)=>{
    if(!admission?.userActivationIsActive||admission.frameId!==frameId||admission.loaderId!==loaderId||pending?.id!==id||pending.controller.signal.aborted)throw changed();
    await checkDocument();await remote(function(next){return this.update(next);},[policy()]);
    const value=(await remote(function(id){return this.read(id);},[id]))?.value;if(!value||!['element','text','toggle'].includes(value.kind))throw changed();
    if(value.kind==='toggle'){
      if(!expected){const current=policy();if(!current.toggleConnected||!['browse','comment'].includes(current.interactionMode))throw changed();value.interactionMode=(value.force??current.interactionMode!=='comment')?'comment':'browse';if((await remote(function(id,mode){return this.setMode(id,mode);},[id,value.interactionMode]))?.value!==true)throw changed();}
      const target={kind:'toggle',interactionMode:value.interactionMode,...(value.force===undefined?{}:{force:value.force})};
      if(!['browse','comment'].includes(target.interactionMode)||expected&&JSON.stringify(target)!==JSON.stringify(expected))throw changed();
      await privateRemote(function(next){return this.update(next);},[{value:policy()}]);
      const proof=await privateRemote(function(){return this.modeProof();});if(!proof)throw changed();
      const packet=freeze({kind:'toggle',requestId:id,frameId,loaderId,pageUrl:proof.pageUrl,interactionMode:target.interactionMode,...(target.force===undefined?{}:{force:target.force}),admission});
      issued.set(packet,{id,target,admission});await checkDocument();if(pending?.id!==id||pending.controller.signal.aborted)throw changed();return packet;
    }
    const backendNodeId=await nodeId(id,'target'),target={kind:value.kind,backendNodeId};
    if(value.kind==='text'){
      const offsets=(await remote(function(id){return this.offsets(id);},[id]))?.value;if(!offsets)throw changed();
      target.startBackendNodeId=await nodeId(id,'start');target.endBackendNodeId=await nodeId(id,'end');Object.assign(target,offsets);
    }
    if(expected&&JSON.stringify(target)!==JSON.stringify(expected))throw changed();
    const proof=await privateProof(target,value,pending?.id===id&&pending.phase==='delivery');
    const textSelection=value.kind==='text'?await readAnnotationTextSelection(read,topEntry,{anchor:proof.textAnchor},lifetime):undefined;
    if(value.kind==='text'&&!textSelection)throw changed();
    const includesPrompt=!!value.request.initialComment?.trim();
    if(textSelection)textSelection.anchor={...textSelection.anchor,annotationFeatures:['requests'],annotationRequestIncludesPrompt:includesPrompt};
    const metadata=value.kind==='element'?sanitizeAnnotationSiteMetadata(value.metadata):undefined;
    const packet=freeze({kind:'request',requestId:id,frameId,loaderId,pageUrl:proof.pageUrl,target,viewportPoint:proof.viewportPoint,request:value.request,admission,
      annotationFeatures:['requests'],annotationRequestIncludesPrompt:includesPrompt,...(metadata===undefined?{}:{metadata}),...(textSelection?{textSelection}:{})});
    issued.set(packet,{id,target,admission});await checkDocument();if(pending?.id!==id||pending.controller.signal.aborted)throw changed();return packet;
  };
  const confirm=async packet=>{const value=issued.get(packet);if(!value)throw changed();return packetFor(value.id,value.target,value.admission);};
  const cancelLocal=()=>{pending?.controller.abort(changed());if(pending?.timer)clearTimeout(pending.timer);pending=null;};
  const abortable=(operation,requestSignal)=>{
    requestSignal.throwIfAborted();let abort;
    const cancelled=new Promise((_,reject)=>{abort=()=>reject(requestSignal.reason);requestSignal.addEventListener('abort',abort,{once:true});if(requestSignal.aborted)abort();});
    return Promise.race([operation,cancelled]).finally(()=>requestSignal.removeEventListener('abort',abort));
  };
  const handle=async id=>{
    if(closed||pending)return;
    const controller=new AbortController(),requestSignal=AbortSignal.any([lifetime,controller.signal]),job={id,controller,phase:'permission'};pending=job;
    if(Number.isFinite(callbacks.timeoutMs)&&callbacks.timeoutMs>0)job.timer=setTimeout(()=>controller.abort(Object.assign(new Error('站点批注权限等待已超时。'),{code:'ANNOTATION_REQUEST_TIMEOUT'})),callbacks.timeoutMs);
    let accepted=false;
    try{
      const native=await nativeState();requestSignal.throwIfAborted();
      if(!native.active||!native.secure||!native.top)return;
      const admission=freeze({userActivationIsActive:true,secureContext:true,topDocument:true,frameId,loaderId,observedAt:Date.now(),ownerState:policy()});
      const packet=await packetFor(id,undefined,admission);requestSignal.throwIfAborted();
      const allowed=await abortable(Promise.resolve(callbacks.requestPermission(packet,{signal:requestSignal})),requestSignal);
      if(allowed!==true)return;
      const actual=await confirm(packet);requestSignal.throwIfAborted();
      if((await remote(function(id){return this.permission(id);},[id]))?.value!==true)return;
      job.phase='delivery';
      requestSignal.throwIfAborted();
      const deliver=actual.kind==='toggle'?callbacks.onToggle:callbacks.onRequest;
      accepted=await abortable(Promise.resolve(deliver(actual,{signal:requestSignal,confirm})),requestSignal)===true;
      requestSignal.throwIfAborted();await checkDocument();
    }catch(error){accepted=false;throw error;
    }finally{
      if(job.timer)clearTimeout(job.timer);
      if(pending===job)pending=null;
      if(objectId&&!closed)await remote(function(id,accepted){return this.finish(id,accepted);},[id,accepted],true,false).catch(error=>callbacks.onError?.(error));
    }
  };
  const binding=event=>{
    if(closed||event.name!==bindingName||event.executionContextId!==contextId||typeof event.payload!=='string'||event.payload.length>1024)return;
    let message;try{message=JSON.parse(event.payload);}catch{return;}
    if(message.nonce!==nonce||typeof message.requestId!=='string')return;
    if(message.type==='cancel'){if(pending?.id===message.requestId)cancelLocal();return;}
    if(message.type==='request'||message.type==='toggle')void handle(message.requestId).catch(error=>{if(!lifetime.aborted)callbacks.onError?.(error);});
  };
  const dispose=()=>disposing??=(async()=>{
    closed=true;cancelLocal();lifetime.removeEventListener('abort',onAbort);cdp.off('Runtime.bindingCalled',binding);
    let failure;
    try{if(objectId&&(await remote(function(){return this.dispose();},[],true,false))?.value!==true)throw changed();}catch(error){
      let gone=false;try{const {frameTree}=await cdp.send('Page.getFrameTree');gone=frameTree.frame.id!==frameId||frameTree.frame.loaderId!==loaderId;}catch{gone=view.closed||view.record.page.isClosed();}
      if(!gone)failure=error;
    }finally{
      await projectHostState({canUseSiteAnnotationApi:false,isAgentControllingBrowser:false,interactionMode:'browse',toggleConnected:false},false).catch(()=>{});
      if(privateObjectId){await cdp.send('Runtime.callFunctionOn',{objectId:privateObjectId,functionDeclaration:'function(){return this.dispose();}',returnByValue:true}).catch(()=>{});await cdp.send('Runtime.releaseObject',{objectId:privateObjectId}).catch(()=>{});privateObjectId=null;}
      if(objectId)await cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{});await cdp.send('Runtime.removeBinding',{name:bindingName}).catch(()=>{});objectId=null;
    }
    if(failure)throw failure;return{disposed:true};
  })();
  const onAbort=()=>{void dispose().catch(error=>callbacks.onError?.(error));};
  try{
    await checkDocument();const native=await nativeState();secureContext=native.secure&&native.top;
    cdp.on('Runtime.bindingCalled',binding);await read(cdp.send('Runtime.addBinding',{name:bindingName,executionContextId:contextId}));
    const create=async(owner,args)=>{
      const installing=cdp.send('Runtime.callFunctionOn',{objectId:owner,functionDeclaration:'function(...args){return ('+siteRequestDocument.toString()+')(...args);}',arguments:args.map(value=>({value})),returnByValue:false});
      try{const result=await read(installing);const id=result.result?.objectId;if(result.exceptionDetails||!id)throw changed();return id;}
      catch(error){void installing.then(async result=>{const id=result.result?.objectId;if(id){await cdp.send('Runtime.callFunctionOn',{objectId:id,functionDeclaration:'function(){return this.dispose();}',returnByValue:true}).catch(()=>{});await cdp.send('Runtime.releaseObject',{objectId:id}).catch(()=>{});}}).catch(()=>{});throw error;}
    };
    privateObjectId=await create(projectionObjectId,[null,null,policy(),true,false]);
    objectId=await create(registrationObjectId,[bindingName,nonce,policy(),connected,true]);
    await projectHostState(policy());
    lifetime.addEventListener('abort',onAbort,{once:true});lifetime.throwIfAborted();await checkDocument();
    return{frameId,loaderId,confirm,readPacket:confirm,
      sync:async()=>{await checkDocument();const next=policy();await projectHostState(next);await privateRemote(function(next){return this.update(next);},[{value:next}]);const result=await remote(function(next){return this.update(next);},[next]);return{connected,result:result?.value===true};},
      clear:async()=>{cancelLocal();if(!closed)await remote(function(){this.clear();return true;});return{cleared:true};},dispose};
  }catch(error){await dispose().catch(()=>{});throw error;}
}
