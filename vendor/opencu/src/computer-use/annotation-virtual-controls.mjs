import {readFrozenAnnotationSurfaceTarget,readAnnotationSurfaceTargetLease,renderFrozenAnnotationSurfaceSelection} from './annotation-surface-controller.mjs';
import {readResolvedAnnotationSiteControls,rememberResolvedAnnotationSiteControlsTarget,readRememberedAnnotationSiteControlsTargetIdentity,reconcileQueuedAnnotationSiteControls} from './annotation-site-controls.mjs';

const proofs=new WeakMap(),bindings=new WeakMap();
const changed=()=>Object.assign(new Error('虚拟控件的真实对象、注册表面或原节点记忆已经改变'),{code:'ANNOTATION_CHANGED'});
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_ANNOTATION_VIRTUAL_CONTROLS'});
const lifetime=(view,signal)=>AbortSignal.any([signal,view.document.signal,view.lifetime.signal].filter(Boolean));
const sameIdentity=(left,right)=>['frameId','frameLoaderId','backendNodeId'].every(key=>left[key]===right[key]);
const sameRegistration=(left,right)=>['surfaceId','targetId','version'].every(key=>left[key]===right[key]);
const clone=value=>structuredClone(value);

function groupsFor(view){
  let state=bindings.get(view);if(state?.document===view.document)return state.groups;
  state={document:view.document,groups:new Map()};bindings.set(view,state);
  state.document.signal.addEventListener('abort',()=>{state.groups.clear();if(bindings.get(view)===state)bindings.delete(view);},{once:true});return state.groups;
}

function privateProof(view,proof){
  const data=proof&&proofs.get(proof);if(!data||data.view!==view||data.document!==view.document||data.document.signal.aborted||view.lifetime.signal.aborted)throw changed();return data;
}

function result(proof,data,actual){
  return{proof,selection:clone(actual.selection),identity:clone(actual.identity),registration:clone(actual.registration),annotationControls:clone(data.annotationControls),elementTagName:actual.elementTagName};
}

function savedSelection(data,actual){
  const anchor=data.savedAnchor,rect=anchor.rect,viewport=actual.viewport;
  if(!rect||!['x','y','width','height'].every(key=>Number.isFinite(rect[key]))||!viewport||anchor.framePath?.length||anchor.scrollContainers?.length||!Number.isFinite(anchor.point?.xPercent)||!Number.isFinite(anchor.point?.y))throw changed();
  const inset=29/data.zoomFactor,clamp=(value,min,max)=>Math.min(Math.max(value,min),max);
  const point={x:clamp(anchor.point.xPercent/100*viewport.width,inset,viewport.width-inset),y:clamp(anchor.point.y-(anchor.isFixed?0:viewport.scrollY),inset,viewport.height-inset)};
  const visible=rect.width>0&&rect.height>0&&rect.x<viewport.width&&rect.x+rect.width>0&&rect.y<viewport.height&&rect.y+rect.height>0;
  return{...clone(data.selection),anchor:clone(anchor),viewportRect:visible?clone(rect):null,viewportPoint:visible?point:{x:0,y:0},viewportSize:{width:viewport.width,height:viewport.height},geometrySource:'saved-virtual-anchor',...(visible?{}:{placement:'top-left'})};
}

// Source virtual-editor et -> Yb(surfaceElement, virtualAnchor, hf controls).
// The opaque handle is server-only; its node comes from the already accepted
// actual source hit, never from surfaceId/targetId strings or a selector.
export async function readFrozenAnnotationVirtualControls(views,view,input,signal){
  if(!input||typeof input.sourceFrameId!=='string'||typeof input.virtualSelectionKey!=='string')throw invalid('请选择真实冻结的虚拟批注对象');
  const scope=lifetime(view,signal);scope.throwIfAborted();if(view.siteAnnotationFeaturesEnabled!==true)throw changed();
  const baseline=view.annotations?.get(input.sourceFrameId);if(!baseline||baseline.virtualSelection?.key!==input.virtualSelectionKey)throw changed();
  const actual=await readFrozenAnnotationSurfaceTarget(views,view,baseline,input.virtualSelectionKey,scope);
  if(actual.selection.anchor.kind!=='virtual'||actual.registration.surfaceId!==actual.selection.anchor.surfaceId||actual.registration.targetId!==actual.selection.anchor.targetId)throw changed();
  const annotationControls=await readResolvedAnnotationSiteControls(views,view,actual.identity,scope);
  const current=await readAnnotationSurfaceTargetLease(views,view,actual.lease,scope);
  if(!sameIdentity(actual.identity,current.identity)||!sameRegistration(actual.registration,current.registration)||JSON.stringify(actual.selection)!==JSON.stringify(current.selection))throw changed();
  const proof=Object.freeze({}),data={view,document:view.document,baseline,key:input.virtualSelectionKey,lease:actual.lease,identity:clone(actual.identity),registration:clone(actual.registration),selection:clone(actual.selection),annotationControls:clone(annotationControls),elementTagName:actual.elementTagName};
  proofs.set(proof,data);return result(proof,data,current);
}

// A lease remains a WeakRef to the original group node when current selection
// is cleared on save. Rendering, however, requires a current selected key.
export async function readAnnotationVirtualControlsProof(views,view,proof,signal,{render=false}={}){
  if(typeof render!=='boolean')throw invalid('虚拟选择渲染状态无效');
  const scope=lifetime(view,signal);scope.throwIfAborted();if(view.siteAnnotationFeaturesEnabled!==true)throw changed();const data=privateProof(view,proof);
  const actual=await readAnnotationSurfaceTargetLease(views,view,data.lease,scope);
  if(!sameIdentity(actual.identity,data.identity)||!sameRegistration(actual.registration,data.registration)||JSON.stringify(actual.selection)!==JSON.stringify(data.selection)||actual.elementTagName!==data.elementTagName)throw changed();
  if(data.reopened){
    const identity=readRememberedAnnotationSiteControlsTargetIdentity(view,data.groupId);if(!identity||!sameIdentity(identity,data.identity))throw changed();
    // Ye -> Qu(virtual)=null -> Xb(savedGroup); By/Vy do not render or hit
    // the registry. This is a saved-anchor projection, not a fresh selection.
    return{...result(proof,data,{...actual,selection:savedSelection(data,actual)}),restored:true,geometrySource:'saved-virtual-anchor',viewport:clone(actual.viewport),surfaceRect:clone(actual.surfaceRect),...(render?{rendered:false}:{})};
  }
  let rendered;if(render){
    const current=await readFrozenAnnotationSurfaceTarget(views,view,data.baseline,data.key,scope);
    if(!sameIdentity(current.identity,data.identity)||!sameRegistration(current.registration,data.registration))throw changed();
    const rendering=await renderFrozenAnnotationSurfaceSelection(views,view,data.baseline,data.key,scope);rendered=rendering.rendered;
    const after=await readAnnotationSurfaceTargetLease(views,view,data.lease,scope);if(!sameIdentity(after.identity,data.identity)||!sameRegistration(after.registration,data.registration))throw changed();
  }
  return{...result(proof,data,actual),...(render?{rendered}:{})};
}

export async function rememberAnnotationVirtualControlsTarget(views,view,groupId,proof,signal){
  if(typeof groupId!=='string'||!groupId)throw invalid('缺少后端虚拟控件变化组');
  const groups=groupsFor(view);if(groups.has(groupId))throw invalid('已有虚拟组只能使用原私有节点记忆');
  const scope=lifetime(view,signal),actual=await readAnnotationVirtualControlsProof(views,view,proof,scope);
  if(!actual.annotationControls?.controls.length)return false;
  if(await rememberResolvedAnnotationSiteControlsTarget(views,view,groupId,actual.identity,scope)!==true)throw changed();
  await readAnnotationVirtualControlsProof(views,view,proof,scope);groups.set(groupId,proof);return true;
}

// Source edit-existing does not remember a new node for a virtual group.
// Only the original group WeakRef and same registration/document may survive.
export async function readRememberedAnnotationVirtualControls(views,view,groupId,signal){
  const proof=groupsFor(view).get(groupId);if(!proof)throw changed();const data=privateProof(view,proof),identity=readRememberedAnnotationSiteControlsTargetIdentity(view,groupId);
  if(!identity||!sameIdentity(identity,data.identity))throw changed();return readAnnotationVirtualControlsProof(views,view,proof,signal);
}

// savedGroup is obtained by the server from its own queue, never supplied by
// the renderer. Source Ye/Xb reuse its controls and anchor, with the original
// jg WeakRef. There is no current virtual-object rect lookup in that path.
export async function reopenSavedAnnotationVirtualControls(views,view,groupId,savedGroup,signal,{zoomFactor}={}){
  if(typeof groupId!=='string'||!groupId||savedGroup?.id!==groupId||savedGroup.anchor?.kind!=='virtual'||!savedGroup.annotationControls?.controls.length||savedGroup.declarations?.length||savedGroup.text!=null)throw invalid('没有可恢复的后端虚拟控件组');
  if(!Number.isFinite(zoomFactor)||zoomFactor<=0)throw invalid('恢复虚拟编辑需要真实的界面缩放因子');
  const scope=lifetime(view,signal),remembered=await readRememberedAnnotationVirtualControls(views,view,groupId,scope),original=privateProof(view,remembered.proof),anchor=savedGroup.anchor;
  if(anchor.pageUrl!==remembered.selection.anchor.pageUrl||anchor.surfaceId!==remembered.registration.surfaceId||anchor.targetId!==remembered.registration.targetId)throw changed();
  const proof=Object.freeze({}),data={...original,reopened:true,groupId,savedAnchor:clone(anchor),annotationControls:clone(savedGroup.annotationControls),zoomFactor};proofs.set(proof,data);
  return readAnnotationVirtualControlsProof(views,view,proof,scope);
}

export function forgetAnnotationVirtualControlsTarget(view,groupId){return bindings.get(view)?.groups.delete(groupId)??false;}

// This delegates the complete ordered list to the one existing controls
// engine. Passing virtual-only entries would wrongly reset ordinary groups.
export async function reconcileAnnotationVirtualControls(views,view,entries,signal,options={}){
  const group=options.activeEntry?.comment?.localBrowserDesignChange?.group;
  if(group?.anchor?.kind==='virtual'){
    const remembered=await readRememberedAnnotationVirtualControls(views,view,group.id,signal);
    if(group.anchor.surfaceId!==remembered.registration.surfaceId||group.anchor.targetId!==remembered.registration.targetId||group.declarations?.length||group.text!=null)throw changed();
  }
  return reconcileQueuedAnnotationSiteControls(views,view,entries,signal,options);
}
