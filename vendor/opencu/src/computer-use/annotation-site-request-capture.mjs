import {captureAnnotation} from './browser-annotation.mjs';

const bindings=new WeakMap();
const changed=()=>Object.assign(new Error('站点批注请求、目标或页面已改变。'),{code:'ANNOTATION_REQUEST_CHANGED'});
const clone=value=>structuredClone(value);

function plainTextSelection(value){
  if(!value)return value;
  const result=clone(value);delete result.anchor.annotationFeatures;delete result.anchor.annotationRequestIncludesPrompt;return result;
}
function assertPacket(view,packet){
  const target=packet?.target,request=packet?.request,admission=packet?.admission;
  if(!packet||packet.kind!=='request'||!Object.isFrozen(packet)||typeof packet.requestId!=='string'||typeof packet.frameId!=='string'||packet.loaderId!==view.loaderId||packet.pageUrl!==view.record.page.url()||
    !target||!Object.isFrozen(target)||!['element','text'].includes(target.kind)||!Number.isSafeInteger(target.backendNodeId)||target.backendNodeId<=0||
    !packet.viewportPoint||!['x','y'].every(key=>Number.isFinite(packet.viewportPoint[key]))||request?.siteInitiated!==true||
    request.initialComment!==undefined&&typeof request.initialComment!=='string'||admission?.userActivationIsActive!==true||admission.secureContext!==true||admission.topDocument!==true||
    admission.frameId!==packet.frameId||admission.loaderId!==packet.loaderId||!Array.isArray(packet.annotationFeatures)||packet.annotationFeatures.length!==1||packet.annotationFeatures[0]!=='requests'||
    packet.annotationRequestIncludesPrompt!==!!request.initialComment?.trim())throw changed();
  if(target.kind==='text'&&(!packet.textSelection||packet.textSelection.anchor?.kind!=='text'||!['startBackendNodeId','endBackendNodeId'].every(key=>Number.isSafeInteger(target[key])&&target[key]>0)||
    !['startOffset','endOffset'].every(key=>Number.isSafeInteger(target[key])&&target[key]>=0)))throw changed();
}
function samePacket(left,right){
  const fields=packet=>({requestId:packet.requestId,frameId:packet.frameId,loaderId:packet.loaderId,pageUrl:packet.pageUrl,target:packet.target,viewportPoint:packet.viewportPoint,
    request:packet.request,metadata:packet.metadata,textSelection:plainTextSelection(packet.textSelection),annotationFeatures:packet.annotationFeatures,annotationRequestIncludesPrompt:packet.annotationRequestIncludesPrompt});
  return JSON.stringify(fields(left))===JSON.stringify(fields(right));
}

// Source _d and qe/Je: a native-confirmed request opens an editor. It does not
// save a comment, submit its prompt or change the page's Selection object.
export async function captureAnnotationSiteRequest(views,view,packet,signal,{confirm}={}){
  if(typeof confirm!=='function')throw changed();
  const document=view.document,lifetime=AbortSignal.any([signal,view.lifetime.signal,document.signal].filter(Boolean));lifetime.throwIfAborted();
  const actual=await confirm(packet);lifetime.throwIfAborted();assertPacket(view,actual);
  const text=actual.target.kind==='text'?plainTextSelection(actual.textSelection):null;
  const snapshot=await captureAnnotation(views,view,lifetime,{...(text?{textAnchor:text.anchor}:{})});
  const confirmed=await confirm(actual);lifetime.throwIfAborted();assertPacket(view,confirmed);
  if(document!==view.document||!samePacket(actual,confirmed))throw changed();
  if(view.siteAnnotationFeaturesEnabled!==true)throw view.siteAnnotationFeaturesError??changed();
  const baseline=view.annotations?.get(snapshot.frame.id),frame=baseline?.dom.frames.find(value=>value.id===confirmed.frameId);
  if(!baseline||baseline.result!==snapshot||view.annotationDocument!==document||snapshot.frame.loaderId!==confirmed.loaderId||!frame||frame.owner)throw changed();
  const geometry=snapshot.frame.geometry,point={x:(confirmed.viewportPoint.x-geometry.offsetX)/geometry.width,y:(confirmed.viewportPoint.y-geometry.offsetY)/geometry.height};
  if(!['x','y'].every(key=>Number.isFinite(point[key])))throw changed();
  let selection;
  if(confirmed.target.kind==='element'){
    const element=snapshot.elements.find(value=>value.frameId===confirmed.frameId&&value.backendNodeId===confirmed.target.backendNodeId);
    if(!element)throw changed();
    selection={kind:'element',elementKey:element.key,point};
  }else{
    const selected=snapshot.textSelection;if(!selected)throw changed();
    const {key,...frozen}=selected;
    if(JSON.stringify(frozen)!==JSON.stringify(text)||JSON.stringify(frozen)!==JSON.stringify(plainTextSelection(confirmed.textSelection)))throw changed();
    selection={kind:'text',textSelectionKey:key,point};
  }
  // The issuer's reference stays private. Renderer IDs, request flags and
  // metadata are never accepted as a substitute for this captured binding.
  bindings.set(baseline,{view,document,loaderId:confirmed.loaderId,packet:confirmed,selection:clone(selection)});
  return{snapshot,selection,request:{kind:'annotation',requestId:confirmed.requestId,initialComment:confirmed.request.initialComment??'',
    siteInitiated:true,enterAnnotationMode:confirmed.request.enterAnnotationMode===true,openTweaks:confirmed.request.openTweaks===true}};
}

// vd -> Qe -> Ry preserves the actual request point even when the visible
// target is only partly on screen. This exception cannot be issued by the UI.
export function isFrozenAnnotationSiteRequestPoint(view,baseline,selected,point){
  const binding=bindings.get(baseline);
  if(!binding||binding.view!==view||view.siteAnnotationFeaturesEnabled!==true||binding.document!==view.document||binding.document.signal.aborted||view.lifetime.signal.aborted||
    binding.loaderId!==view.loaderId||view.annotationDocument!==view.document||view.annotations?.get(baseline.result.frame.id)!==baseline||!point)return false;
  const matches=binding.packet.target.kind==='element'?selected?.elementKey===binding.selection.elementKey:selected?.textSelectionKey===binding.selection.textSelectionKey;
  return matches&&['x','y'].every(key=>Number.isFinite(point[key])&&point[key]===binding.selection.point[key]);
}

// Only the final selected primary target receives the request's evidence.
// Ordinary captures and additional selections have no issuer binding.
export function bindAnnotationSiteRequestAnchor(view,baseline,selected,anchor){
  const binding=bindings.get(baseline);if(!binding||binding.view!==view||view.siteAnnotationFeaturesEnabled!==true)return anchor;
  if(binding.document!==view.document||binding.document.signal.aborted||view.lifetime.signal.aborted||binding.loaderId!==view.loaderId)throw changed();
  const packet=binding.packet,target=packet.target;
  const matches=target.kind==='element'?selected?.elementKey===binding.selection.elementKey&&selected.frameId===packet.frameId&&selected.backendNodeId===target.backendNodeId:
    selected?.textSelectionKey===binding.selection.textSelectionKey&&anchor.kind==='text';
  if(!matches)return anchor;
  const viewport=baseline.dom.frames.find(value=>value.id===packet.frameId)?.viewport;
  if(target.kind==='element'&&(!viewport||!Number.isFinite(viewport.width)||viewport.width<=0||!Number.isFinite(viewport.scrollY)))throw changed();
  return{...anchor,...(target.kind==='element'?{point:{xPercent:packet.viewportPoint.x/viewport.width*100,y:packet.viewportPoint.y+(anchor.isFixed?0:viewport.scrollY)}}:{}),
    ...(target.kind==='element'&&packet.metadata!==undefined?{elementMetadata:clone(packet.metadata)}:{}),
    annotationFeatures:[...new Set([...(anchor.annotationFeatures??[]),'requests'])],annotationRequestIncludesPrompt:packet.annotationRequestIncludesPrompt};
}
