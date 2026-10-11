import {randomUUID} from 'node:crypto';
import {annotationSnapshotOptions,annotationStyleProperties,captureAnnotation} from './browser-annotation.mjs';
import {annotationDocuments} from './annotation-documents.mjs';
import {readAnnotationAnchorGeometry} from './annotation-anchor-geometry.mjs';
import {pointInPolygon} from './annotation-geometry.mjs';
import {readFrozenAnnotationElementAnchor} from './annotation-submit.mjs';
import {isFrozenAnnotationSiteRequestPoint} from './annotation-site-request-capture.mjs';
import {readAnnotationEditableText} from './annotation-text-changes.mjs';
import {styleChanges} from './browser-style-preview.mjs';
import {reconcileAnnotationStyleProjection,dropAnnotationActiveStyleProjection,restoreQueuedAnnotationStyles} from './queued-annotation-styles.mjs';
import {readFrozenAnnotationSiteControls,rememberAnnotationSiteControlsTarget,reconcileQueuedAnnotationSiteControls,restoreQueuedAnnotationSiteControls,initialAnnotationSiteControlChanges} from './annotation-site-controls.mjs';
import {updateAnnotationSiteControlChanges,annotationSiteControlDraftChanges} from './annotation-site-api.mjs';
import {readFrozenAnnotationVirtualControls,readAnnotationVirtualControlsProof,rememberAnnotationVirtualControlsTarget,readRememberedAnnotationVirtualControls,reopenSavedAnnotationVirtualControls} from './annotation-virtual-controls.mjs';

const fail=(message,code='INVALID_ANNOTATION_LIVE_EDITOR',details)=>Object.assign(new Error(message),{code,...(details?{details}:{})});
const changed=()=>fail('页面或实时编辑元素已改变，请重新打开批注。','ANNOTATION_CHANGED');
const clone=value=>structuredClone(value);
const groupOf=entry=>entry?.comment?.localBrowserDesignChange?.group;
const commentId=entry=>entry?.comment?.localBrowserCommentMetadata?.commentId;
const hasChanges=group=>group.declarations.length>0||group.text!=null||(group.annotationControlChanges?.length??0)>0;
const serialize=(state,work)=>{const next=state.tail.catch(()=>{}).then(work);state.tail=next.catch(()=>{});return next;};
const lifetime=(view,signal)=>AbortSignal.any([signal,view.lifetime.signal,view.document.signal].filter(Boolean));

function optionsFor(state,options={}){
  const entries=options.entries??state.entries,enabled=options.enabled??state.enabled,showOriginal=options.showOriginal??state.showOriginal,owner=options.owner;
  if(!Array.isArray(entries)||typeof enabled!=='boolean'||typeof showOriginal!=='boolean'||!owner||!['object','function'].includes(typeof owner))throw fail('实时编辑的后端队列、归属或显示状态无效');
  if(state.active&&state.active.owner!==owner)throw fail('此页面有其他会话的实时编辑正在进行','ANNOTATION_LIVE_EDITOR_BUSY');
  return{entries,enabled,showOriginal,owner};
}
function rememberOptions(state,options){state.entries=options.entries;state.enabled=options.enabled;state.showOriginal=options.showOriginal;state.projectionOwner=options.owner;}

function draftGroup(active){
  const group=active.group,saved=active.oldValueProof.savedGroup,previous=new Map((saved?.declarations??[]).map(value=>[value.property,value]));
  // Source editor card Yr/Qr/$r: only changed declarations are projected;
  // editing an existing group retains its saved original values.
  const declarations=group.declarations.flatMap(value=>{
    const old=previous.get(value.property),original=old?.previousValue??value.previousValue;
    return value.value===original?[]:[old?{...clone(old),value:value.value}:clone(value)];
  });
  const value=group.text,old=saved?.text,text=value==null?old:old==null?value.value===value.previousValue?undefined:value:value.value===old.previousValue?undefined:{...old,value:value.value};
  const provenance=new Map((saved?.provenance??[]).map(value=>[value.property,value]));for(const value of group.provenance??[])provenance.set(value.property,value);
  const result={...clone(group),declarations,provenance:declarations.flatMap(value=>provenance.has(value.property)?[clone(provenance.get(value.property))]:[])};
  const controls=annotationSiteControlDraftChanges(group,saved);
  if(controls.length)result.annotationControlChanges=controls;else delete result.annotationControlChanges;
  if(text)result.text=clone(text);else delete result.text;return result;
}
function entryFor(active){
  return{selection:active.selection,comment:{localBrowserCommentMetadata:{commentId:active.group.id},localBrowserDesignChange:{group:draftGroup(active)}}};
}
function publicState(state){
  const active=state.active;
  return{active:active?{editorId:active.editorId,revision:state.revision,sourceFrameId:active.selection.sourceFrameId,elementKey:active.selection.elementKey,
    ...(active.selection.virtualSelectionKey?{virtualSelectionKey:active.selection.virtualSelectionKey}:{}),
    group:draftGroup(active),editorState:clone(active.group),changed:hasChanges(draftGroup(active)),initialStyles:clone(active.initialStyles),initialText:clone(active.initialText),
    documentIdentity:clone(active.identity),canEditAnnotationControls:state.view.siteAnnotationFeaturesEnabled===true,...(active.additionalSelections.length?{additionalSelections:clone(active.additionalSelections)}:{})}:null,styleState:state.styleState?clone(state.styleState):null};
}
function assertActive(state,view,editorId,owner){
  const active=state.active;
  if(!active||typeof editorId!=='string'||active.editorId!==editorId)throw fail('实时编辑会话已经失效','ANNOTATION_CHANGED');
  if(active.owner!==owner)throw fail('此实时编辑属于其他会话','ANNOTATION_LIVE_EDITOR_BUSY');
  if(state.disposed||view.closed||active.document!==view.document||active.identity.loaderId!==view.loaderId||active.document.signal.aborted||view.lifetime.signal.aborted)throw changed();
  return active;
}
function stateFor(views,view){
  if(view.annotationLiveEditor){if(view.annotationLiveEditor.views!==views)throw changed();return view.annotationLiveEditor;}
  const state={views,view,active:null,prepared:null,revision:0,entries:[],enabled:true,showOriginal:false,projectionOwner:null,tail:Promise.resolve(),document:null,styleState:null,disposed:false,controlsUsed:false};
  state.abortDocument=()=>{
    void serialize(state,async()=>{
      state.active=null;state.prepared=null;state.revision++;
      try{
        await dropAnnotationActiveStyleProjection(view);await restoreQueuedAnnotationSiteControls(view);await restoreQueuedAnnotationStyles(view);
        // Reintroduce the saved group that an active edit had replaced. Only
        // the current, live document may receive the retained server queue.
        if(!view.closed&&!view.lifetime.signal.aborted&&!view.document.signal.aborted)await project(state,view,{entries:state.entries,enabled:state.enabled,showOriginal:state.showOriginal,owner:state.projectionOwner},view.lifetime.signal,null);
      }catch(error){view.publish?.('warning',{message:error.message});}
    });
  };
  state.abortLifetime=()=>{void restoreAnnotationLiveEditor(view).catch(error=>view.publish?.('warning',{message:error.message}));};
  view.lifetime.signal.addEventListener('abort',state.abortLifetime,{once:true});view.annotationLiveEditor=state;
  return state;
}
function attachDocument(state,document){
  if(state.document===document)return;
  state.document?.signal.removeEventListener('abort',state.abortDocument);state.document=document;
  document.signal.addEventListener('abort',state.abortDocument,{once:true});
}
async function project(state,view,options,signal,active=state.active){
  const result=await reconcileAnnotationStyleProjection(state.views,view,options.entries,signal,{enabled:options.enabled,showOriginal:options.showOriginal,activeEntry:active?entryFor(active):null});
  const groups=[...options.entries.map(groupOf),active?.group].filter(Boolean);
  if(state.controlsUsed||groups.some(group=>(group.annotationControls?.controls.length??0)>0)){
    state.controlsUsed=true;
    state.controlProjection=await reconcileQueuedAnnotationSiteControls(state.views,view,options.entries,signal,{enabled:options.enabled,showOriginal:options.showOriginal,activeEntry:active?entryFor(active):null,canUseSiteAnnotationApi:view.siteAnnotationFeaturesEnabled===true});
  }
  state.styleState=result;rememberOptions(state,options);return result;
}
function confirmActiveProjection(state,options){
  if(!state.active||!options.enabled||options.showOriginal)return;
  const status=state.styleState?.entries.find(entry=>entry.commentId===state.active.group.id),virtual=state.active.group.anchor.kind==='virtual';
  if(!virtual&&(!status||status.conflicts?.length))throw fail('实时编辑未能应用到所选元素','ANNOTATION_LIVE_PROJECTION_FAILED',{...publicState(state),conflicts:status?.conflicts??['element-unresolved']});
  const draft=draftGroup(state.active),css=draft.declarations.some(value=>value.value.trim()!==value.previousValue.trim()),text=draft.text;
  if(css&&!status.styleApplied||text&&text.value!==text.previousValue&&!status.textApplied)throw fail('实时编辑应用尚未确认','ANNOTATION_LIVE_PROJECTION_FAILED',publicState(state));
  const controls=state.controlProjection;
  if(draft.annotationControlChanges?.length&&(controls?.available!==true||controls.conflicts?.some(value=>value.groupId===draft.id)||controls.dispatched?.some(value=>value.groupId===draft.id&&value.dispatched===false)))throw fail('网站自定义控件变更尚未确认','ANNOTATION_LIVE_PROJECTION_FAILED',publicState(state));
}

function sourceTargetStatus(){
  const node=this,doc=node.ownerDocument,win=doc?.defaultView;
  if(node.nodeType!==1||!node.isConnected||!win)return{connected:false,resolvable:false};
  // Source cd/$u: visibility and the actual local border rect determine
  // whether the retained live target can supply screenshot geometry.
  for(let parent=node;parent;parent=parent.parentElement){const css=win.getComputedStyle(parent);if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||Number.parseFloat(css.opacity)===0)return{connected:true,resolvable:false};}
  if(typeof node.checkVisibility==='function'&&!node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return{connected:true,resolvable:false};
  const rect=node.getBoundingClientRect();return{connected:true,resolvable:rect.width>0&&rect.height>0};
}
function sourceDocsPage(value){
  let url;try{url=new URL(value);}catch{return false;}if(url.hostname!=='docs.google.com')return false;
  const parts=url.pathname.split('/').filter(Boolean),document=parts.indexOf('document'),docD=document===-1?-1:parts.indexOf('d',document+1),id=docD===-1?undefined:parts[docD+1],documentId=id==='e'&&parts[docD+3]==='pub'?parts[docD+2]:id;
  if(documentId!=null&&documentId.length)return true;const sheet=parts.indexOf('spreadsheets'),sheetD=sheet===-1?-1:parts.indexOf('d',sheet+1);return sheetD!==-1&&parts[sheetD+1]!=null;
}
async function readLiveTargetStatus(state,view,target,signal,documents,expectedIdentity=state.active?.identity){
  if(!target?.frameId||!Number.isSafeInteger(target.backendNodeId)||target.backendNodeId<=0)throw changed();
  const active=assertActive(state,view,state.active?.editorId,state.active?.owner),read=operation=>state.views.read(view,operation,signal);
  let objectId,resolving,cdp;
  try{
    const entry=documents.entries.get(target.frameId);
    if(!entry||entry.frameId!==expectedIdentity?.frameId||entry.loaderId!==expectedIdentity.frameLoaderId||entry.loaderId!==target.loaderId)throw changed();
    cdp=entry.cdp;const {executionContextId}=await read(cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName:'trisoul-annotation-live-target'}));
    resolving=cdp.send('DOM.resolveNode',{backendNodeId:target.backendNodeId,executionContextId});const response=await read(resolving);objectId=response.object?.objectId;if(!objectId)throw changed();
    const status=await read(cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:sourceTargetStatus.toString(),returnByValue:true}));
    if(status.exceptionDetails||typeof status.result?.value?.connected!=='boolean'||typeof status.result.value.resolvable!=='boolean')throw changed();
    assertActive(state,view,active.editorId,active.owner);
    return{...status.result.value,documentIdentity:{tabId:view.tabId,loaderId:view.loaderId,frameId:entry.frameId,frameLoaderId:entry.loaderId,backendNodeId:target.backendNodeId}};
  }finally{
    if(objectId)await cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{});
    else if(resolving)void resolving.then(response=>response.object?.objectId&&cdp.send('Runtime.releaseObject',{objectId:response.object.objectId})).catch(()=>{});
  }
}

function frozenAdditionalSelections(view,input,values){
  if(values===undefined){if(input.additionalSelections?.length)throw fail('附加选择尚未由后端冻结');return[];}
  if(!Array.isArray(values)||input.additionalSelections!==undefined&&(!Array.isArray(input.additionalSelections)||input.additionalSelections.length!==values.length))throw fail('后端附加选择材料无效');
  const selected=new Set([input.elementKey]);
  for(const value of values){
    const {anchor,selection,element,identity}=value??{};
    if(!anchor||!['element','region'].includes(anchor.kind)||selection?.sourceFrameId!==input.sourceFrameId||selection.loaderId!==view.loaderId||anchor.pageUrl!==selection.pageUrl||
      !selection.point||!['x','y'].every(key=>Number.isFinite(selection.point[key]))||!selection.geometry||!anchor.rect||!['x','y','width','height'].every(key=>Number.isFinite(anchor.rect[key])))throw fail('后端附加选择凭据已经失效','ANNOTATION_CHANGED');
    if(anchor.kind==='element'){
      if(!element||element.key!==selection.elementKey||selected.has(element.key)||identity?.frameId!==element.frameId||identity?.backendNodeId!==element.backendNodeId||typeof identity.frameLoaderId!=='string')throw changed();
      selected.add(element.key);
    }else if(element||identity||anchor.framePath?.length)throw changed();
  }
  return clone(values);
}

async function captureAdditionalSelections(state,view,documents,read,signal){
  const result=[],top=[...documents.entries.values()].find(value=>!value.owner);
  if(!top||!Number.isFinite(top.viewport.scrollY))throw changed();
  for(const value of state.active.additionalSelections){
    if(value.anchor.kind==='region'){
      result.push({...clone(value),viewportRect:{...value.anchor.rect,y:value.anchor.rect.y-top.viewport.scrollY},
        targetStatus:{kind:'region',resolvable:true,documentIdentity:{tabId:view.tabId,loaderId:view.loaderId,frameId:top.frameId,frameLoaderId:top.loaderId}}});continue;
    }
    const identity=value.identity,entry=documents.entries.get(identity.frameId);
    if(!entry||entry.loaderId!==identity.frameLoaderId)throw changed();
    const target={frameId:identity.frameId,loaderId:identity.frameLoaderId,backendNodeId:identity.backendNodeId};
    const targetStatus=entry.document.nodes.backendNodeId.includes(identity.backendNodeId)?await readLiveTargetStatus(state,view,target,signal,documents,identity):
      {connected:false,resolvable:false,documentIdentity:{tabId:view.tabId,loaderId:view.loaderId,...clone(identity)}};
    let viewportRect;
    if(targetStatus.connected&&targetStatus.resolvable){
      const geometry=await readAnnotationAnchorGeometry(read,entry,identity.backendNodeId,{entries:documents.entries},signal);
      viewportRect={...geometry.rect,y:geometry.rect.y-(geometry.isFixed?0:top.viewport.scrollY)};
    }
    result.push({...clone(value),targetStatus,...(viewportRect?{viewportRect}:{})});
  }
  return result;
}

async function captureActive(state,view,signal){
  const active=state.active;if(!active)return publicState(state);
  assertActive(state,view,active.editorId,active.owner);
  if(active.group.anchor.kind==='virtual'){
    const before=await readAnnotationVirtualControlsProof(state.views,view,active.virtualProof,signal,{render:true});
    const documents=await annotationDocuments(state.views,view,annotationSnapshotOptions,signal);let current;
    try{
      const capture=await captureAnnotation(state.views,view,signal,{remember:false});
      const after=await readAnnotationVirtualControlsProof(state.views,view,active.virtualProof,signal);
      current=await annotationDocuments(state.views,view,annotationSnapshotOptions,signal);
      assertActive(state,view,active.editorId,active.owner);
      if(JSON.stringify(documents.signature)!==JSON.stringify(current.signature)||JSON.stringify(before.selection)!==JSON.stringify(after.selection)||JSON.stringify(before.identity)!==JSON.stringify(after.identity))throw changed();
      state.captureProof={editorId:active.editorId,revision:state.revision,document:active.document,signature:clone(current.signature)};
      return{...publicState(state),frame:capture.frame,elements:capture.elements,truncated:capture.truncated,childFrames:capture.childFrames,element:null,
        virtualSelection:{...clone(after.selection),annotationControls:clone(active.group.annotationControls)},...(after.selection.viewportRect?{viewportRect:clone(after.selection.viewportRect)}:{}),
        targetStatus:{connected:true,resolvable:after.selection.viewportRect!==null,documentIdentity:clone(active.identity)}};
    }finally{await documents.dispose();await current?.dispose();}
  }
  const target=state.styleState?.entries.find(entry=>entry.commentId===active.group.id);
  if(!target||target.frameId!==active.identity.frameId||target.loaderId!==active.identity.frameLoaderId)throw changed();
  const read=operation=>state.views.read(view,operation,signal),documents=await annotationDocuments(state.views,view,annotationSnapshotOptions,signal);let current;
  try{
    const targetStatus=await readLiveTargetStatus(state,view,target,signal,documents);let viewportRect;
    if(targetStatus.connected&&targetStatus.resolvable){
      const entry=documents.entries.get(target.frameId),top=[...documents.entries.values()].find(value=>!value.owner);
      if(!top||!Number.isFinite(top.viewport.scrollY))throw changed();
      const geometry=await readAnnotationAnchorGeometry(read,entry,target.backendNodeId,{entries:documents.entries},signal);
      viewportRect={...geometry.rect,y:geometry.rect.y-(geometry.isFixed?0:top.viewport.scrollY)};
    }
    const additionalSelections=await captureAdditionalSelections(state,view,documents,read,signal);
    const capture=await captureAnnotation(state.views,view,signal,{remember:false});assertActive(state,view,active.editorId,active.owner);
    current=await annotationDocuments(state.views,view,annotationSnapshotOptions,signal);
    // The complete live BCR and changed pixels belong to the same document
    // state. Captured element.region remains clipped selection geometry.
    if(JSON.stringify(current.signature)!==JSON.stringify(documents.signature))throw changed();
    state.captureProof={editorId:active.editorId,revision:state.revision,document:active.document,signature:clone(current.signature)};
    const element=capture.elements.find(value=>value.frameId===target.frameId&&value.backendNodeId===target.backendNodeId)??null;
    for(const value of additionalSelections)if(value.identity)value.afterElement=capture.elements.find(element=>element.frameId===value.identity.frameId&&element.backendNodeId===value.identity.backendNodeId)??null;
    return{...publicState(state),frame:capture.frame,element,elements:capture.elements,truncated:capture.truncated,childFrames:capture.childFrames,targetStatus,...(viewportRect?{viewportRect}:{}),...(additionalSelections.length?{additionalSelections}:{})};
  }finally{await Promise.all([documents.dispose(),current?.dispose()]);}
}

async function initialText(views,view,sourceFrameId,element,signal){
  const baseline=view.annotations?.get(sourceFrameId),read=operation=>views.read(view,operation,signal),documents=await annotationDocuments(views,view,annotationSnapshotOptions,signal);
  try{
    if(!baseline||view.annotationDocument!==view.document||JSON.stringify(documents.signature)!==JSON.stringify(baseline.dom))throw changed();
    const entry=documents.entries.get(element.frameId);if(!entry)throw changed();
    const text=await readAnnotationEditableText(read,entry,element.backendNodeId,signal);
    const current=await annotationDocuments(views,view,annotationSnapshotOptions,signal);
    try{if(JSON.stringify(current.signature)!==JSON.stringify(baseline.dom))throw changed();}finally{await current.dispose();}
    if(view.annotations?.get(sourceFrameId)!==baseline||view.annotationDocument!==view.document)throw changed();return{text,frameId:entry.frameId,frameLoaderId:entry.loaderId};
  }finally{await documents.dispose();}
}

function initialGroup(element,anchor,text,existing,themeVariant,geometry){
  const previous=new Map((existing?.declarations??[]).map(value=>[value.property,value]));
  // Source qu/ns/rs/Yb: actual computed declarations, merged with server
  // saved declarations. Existing CSS keeps its original baseline and value.
  const properties=annotationStyleProperties.filter(property=>['flex','inline-flex'].includes(element.styles.display)||!['flex-direction','justify-content','align-items','gap','row-gap','column-gap'].includes(property));
  const declarations=properties.map(property=>{
    const value=element.styles[property];if(typeof value!=='string')throw changed();
    const saved=previous.get(property);if(saved&&(typeof saved.value!=='string'||typeof saved.previousValue!=='string'))throw changed();
    return saved?clone(saved):{property,value:value.trim(),previousValue:value.trim()};
  });
  const now=new Date().toISOString(),id=existing?.id??randomUUID();
  const editable=text==null?existing?.text:existing?.text==null?text:{previousValue:text.previousValue,value:existing.text.value};
  return{id,anchor:clone(anchor),status:'editing',draftAttribute:existing?.draftAttribute??id,targetLabel:anchor.title,elementTagName:element.tag,
    selector:anchor.selector,createdAt:existing?.createdAt??now,updatedAt:now,declarations,provenance:clone(existing?.provenance??declarations.map(value=>({property:value.property}))),
    ...(editable?{text:clone(editable)}:{}),viewportSize:{width:geometry.layoutWidth,height:geometry.layoutHeight},...(themeVariant?{themeVariant}:{})};
}
function existingFor(view,entries,input,element){
  if(input.commentId===undefined)return null;
  if(typeof input.commentId!=='string')throw fail('要编辑的批注标识无效');
  const existing=entries.find(entry=>commentId(entry)===input.commentId),group=groupOf(existing);
  if(!group||group.status!=='queued'||group.id!==input.commentId||group.anchor?.kind!=='element')throw changed();
  const binding=view.queuedAnnotationStyles?.bindings.get(input.commentId);
  if(existing.selection?.elementKey!==element.key&&!(binding?.mainLoaderId===view.loaderId&&binding.frameId===element.frameId&&binding.backendNodeId===element.backendNodeId))throw changed();
  return existing;
}

// All queue options and edit-existing entries are supplied by the server.
// Renderer inputs contain only frozen keys and desired CSS/text values.
export async function beginAnnotationLiveEditor(views,view,input,signal,options={}){
  if(options.savedEntry!==undefined){
    const state=stateFor(views,view);
    return serialize(state,()=>reopenVirtualEditor(state,view,input,signal,options));
  }
  if(input?.virtualSelectionKey!==undefined){
    const state=stateFor(views,view);
    return serialize(state,()=>beginVirtualEditor(state,view,input,signal,options));
  }
  if(!input||typeof input.sourceFrameId!=='string'||typeof input.elementKey!=='string')throw fail('请选择真实冻结的批注元素');
  const point=input.selectionPoint;
  const requestPoint=()=>isFrozenAnnotationSiteRequestPoint(view,view.annotations?.get(input.sourceFrameId),input,point);
  if(!point||!['x','y'].every(key=>Number.isFinite(point[key]))||!requestPoint()&&!['x','y'].every(key=>point[key]>=0&&point[key]<=1))throw fail('实时编辑的选择位置无效');
  const state=stateFor(views,view);
  return serialize(state,async()=>{
    const display=optionsFor(state,options),scope=lifetime(view,signal);scope.throwIfAborted();
    if(state.disposed||!display.enabled||display.showOriginal)throw fail('请先进入批注模式并松开原始视图');
    if(state.active)throw fail('已有未结束的实时编辑，请先保存或取消');
    const document=view.document,actual=await readFrozenAnnotationElementAnchor(views,view,input,scope),region=actual.element.region;
    if(!requestPoint()&&(actual.element.polygon?!pointInPolygon(point,actual.element.polygon):point.x<region.x||point.x>region.x+region.width||point.y<region.y||point.y>region.y+region.height))throw fail('选择位置与实际批注元素不一致');
    const originalText=await initialText(views,view,input.sourceFrameId,actual.element,scope),text=originalText.text;
    if(document!==view.document)throw changed();
    const existing=existingFor(view,display.entries,input,actual.element),group=initialGroup(actual.element,actual.anchor,text,groupOf(existing),actual.themeVariant,actual.selection.geometry);
    const annotationControls=await readFrozenAnnotationSiteControls(views,view,input.sourceFrameId,input.elementKey,scope);
    if(groupOf(existing)?.annotationControls?.controls.length){
      if(!annotationControls||existing.selection.loaderId!==view.loaderId||existing.selection.elementKey!==actual.element.key)throw changed();
    }
    if(annotationControls?.controls.length){
      group.annotationControls=clone(annotationControls);group.annotationControlChanges=initialAnnotationSiteControlChanges(annotationControls,groupOf(existing));
      if(await rememberAnnotationSiteControlsTarget(views,view,group.id,input,scope)!==true)throw changed();
    }
    const selection={...actual.selection,point:{x:point.x,y:point.y},frameId:originalText.frameId,frameLoaderId:originalText.frameLoaderId};
    group.markerViewportPoint={x:selection.geometry.offsetX+point.x*selection.geometry.width,y:selection.geometry.offsetY+point.y*selection.geometry.height};
    const additionalSelections=frozenAdditionalSelections(view,input,options.additionalSelections);
    if(existing&&(existing.comment.localBrowserContext?.additionalSelections?.length??0)!==additionalSelections.length)throw fail('已保存批注的附加选择尚未完整恢复','ANNOTATION_CHANGED');
    const active={editorId:randomUUID(),owner:display.owner,document,group,selection,additionalSelections,baselineElement:actual.element,initialStyles:clone(actual.element.styles),initialText:clone(text),
      identity:{tabId:view.tabId,loaderId:view.loaderId,frameId:actual.element.frameId,frameLoaderId:originalText.frameLoaderId,backendNodeId:actual.element.backendNodeId},
      oldValueProof:{sourceFrameId:input.sourceFrameId,elementKey:input.elementKey,computedStyles:clone(actual.element.styles),text:clone(text),...(additionalSelections.length?{additionalSelections:clone(additionalSelections)}:{}),...(existing?{savedGroup:clone(groupOf(existing))}:{})}};
    attachDocument(state,document);
    await project(state,view,display,scope,active);state.active=active;state.prepared=null;state.revision++;
    confirmActiveProjection(state,display);return captureActive(state,view,scope);
  });
}

async function reopenVirtualEditor(state,view,input,signal,options){
  const views=state.views,display=optionsFor(state,options),scope=lifetime(view,signal),entry=options.savedEntry,previous=groupOf(entry);scope.throwIfAborted();
  if(input?.commentId!==commentId(entry)||previous?.anchor.kind!=='virtual'||previous.status!=='queued'||!display.entries.includes(entry)||
    input.sourceFrameId!==undefined||input.elementKey!==undefined||input.virtualSelectionKey!==undefined||input.additionalSelections?.length)throw changed();
  if(state.disposed||!display.enabled||display.showOriginal||state.active)throw fail('当前不能恢复虚拟对象编辑');
  if(typeof views.browser.readZoom!=='function')throw fail('当前浏览器没有提供真实缩放状态');
  const document=view.document,zoom=await views.browser.readZoom(view.sessionId,view.tabId,scope);
  if(!Number.isFinite(zoom?.zoomFactor)||zoom.zoomFactor<=0||document!==view.document)throw changed();
  const actual=await reopenSavedAnnotationVirtualControls(views,view,previous.id,previous,scope,{zoomFactor:zoom.zoomFactor});
  const frozen=await captureAnnotation(views,view,scope),geometry=frozen.frame.geometry,selected=actual.selection;
  if(document!==view.document)throw changed();
  const rect=selected.viewportRect??selected.anchor.rect,point={x:(selected.viewportPoint.x-geometry.offsetX)/geometry.width,y:(selected.viewportPoint.y-geometry.offsetY)/geometry.height};
  const selection={sourceFrameId:frozen.frame.id,virtualSelectionKey:selected.key,virtualAnchor:clone(previous.anchor),
    region:{x:(rect.x-geometry.offsetX)/geometry.width,y:(rect.y-geometry.offsetY)/geometry.height,width:rect.width/geometry.width,height:rect.height/geometry.height},point,
    pageUrl:previous.anchor.pageUrl,loaderId:view.loaderId,geometry:clone(geometry),frameId:actual.identity.frameId,frameLoaderId:actual.identity.frameLoaderId,geometrySource:'saved-virtual-anchor'};
  const group={...clone(previous),status:'editing',updatedAt:new Date().toISOString(),markerViewportPoint:clone(selected.viewportPoint),viewportSize:clone(selected.viewportSize)};
  const active={editorId:randomUUID(),owner:display.owner,document,group,selection,additionalSelections:[],virtualProof:actual.proof,initialStyles:{},initialText:null,
    identity:{tabId:view.tabId,loaderId:view.loaderId,...actual.identity},oldValueProof:{sourceFrameId:frozen.frame.id,virtualSelectionKey:selected.key,savedGroup:clone(previous)}};
  attachDocument(state,document);await project(state,view,display,scope,active);state.active=active;state.prepared=null;state.revision++;
  confirmActiveProjection(state,display);return captureActive(state,view,scope);
}

async function beginVirtualEditor(state,view,input,signal,options){
  const views=state.views,display=optionsFor(state,options),scope=lifetime(view,signal);scope.throwIfAborted();
  if(typeof input.sourceFrameId!=='string'||typeof input.virtualSelectionKey!=='string'||input.elementKey!==undefined||input.additionalSelections?.length)throw fail('请选择真实冻结的虚拟批注对象');
  if(state.disposed||!display.enabled||display.showOriginal||state.active)throw fail('当前不能开始虚拟对象编辑');
  const document=view.document,actual=await readFrozenAnnotationVirtualControls(views,view,input,scope);
  if(!actual)throw fail('当前浏览器没有提供真实的虚拟对象控件');
  const selected=actual.selection;
  const baseline=view.annotations?.get(input.sourceFrameId),geometry=baseline?.result.frame.geometry;
  if(!geometry||document!==view.document)throw changed();
  const point={x:(selected.viewportPoint.x-geometry.offsetX)/geometry.width,y:(selected.viewportPoint.y-geometry.offsetY)/geometry.height};
  if(!input.selectionPoint||!['x','y'].every(key=>Number.isFinite(input.selectionPoint[key])&&Math.abs(point[key]-input.selectionPoint[key])<1e-9))throw fail('虚拟对象的选择位置已改变');
  let existing;
  if(input.commentId!==undefined){
    existing=display.entries.find(entry=>commentId(entry)===input.commentId);
    const previous=groupOf(existing),anchor=previous?.anchor;
    if(previous?.status!=='queued'||anchor?.kind!=='virtual'||anchor.pageUrl!==selected.anchor.pageUrl||anchor.surfaceId!==selected.anchor.surfaceId||anchor.targetId!==selected.anchor.targetId||existing.selection.loaderId!==view.loaderId)throw changed();
    const remembered=await readRememberedAnnotationVirtualControls(views,view,previous.id,scope);
    if(!remembered||JSON.stringify(remembered.identity)!==JSON.stringify(actual.identity)||remembered.registration.surfaceId!==actual.registration.surfaceId||remembered.registration.targetId!==actual.registration.targetId||remembered.registration.version!==actual.registration.version)throw changed();
  }
  const previous=groupOf(existing),id=previous?.id??randomUUID(),now=new Date().toISOString();
  const definition=previous?.annotationControls??actual.annotationControls;
  if(!definition?.controls.length)throw fail('这个虚拟对象没有提供自定义控件');
  const group={id,anchor:clone(selected.anchor),status:'editing',draftAttribute:previous?.draftAttribute??id,targetLabel:selected.anchor.elementName??selected.anchor.targetId,
    elementTagName:actual.elementTagName,selector:null,createdAt:previous?.createdAt??now,updatedAt:now,declarations:[],provenance:[],
    annotationControls:clone(definition),annotationControlChanges:initialAnnotationSiteControlChanges(definition,previous),
    viewportSize:clone(selected.viewportSize),themeVariant:selected.themeVariant,markerViewportPoint:clone(selected.viewportPoint)};
  if(!existing)await rememberAnnotationVirtualControlsTarget(views,view,id,actual.proof,scope);
  const rect=selected.viewportRect,selection={sourceFrameId:input.sourceFrameId,virtualSelectionKey:input.virtualSelectionKey,virtualAnchor:clone(selected.anchor),
    region:{x:(rect.x-geometry.offsetX)/geometry.width,y:(rect.y-geometry.offsetY)/geometry.height,width:rect.width/geometry.width,height:rect.height/geometry.height},point,
    pageUrl:selected.anchor.pageUrl,loaderId:view.loaderId,geometry:clone(geometry),frameId:actual.identity.frameId,frameLoaderId:actual.identity.frameLoaderId};
  const active={editorId:randomUUID(),owner:display.owner,document,group,selection,additionalSelections:[],virtualProof:actual.proof,initialStyles:{},initialText:null,
    identity:{tabId:view.tabId,loaderId:view.loaderId,...actual.identity},oldValueProof:{sourceFrameId:input.sourceFrameId,virtualSelectionKey:input.virtualSelectionKey,...(previous?{savedGroup:clone(previous)}:{})}};
  attachDocument(state,document);await project(state,view,display,scope,active);state.active=active;state.prepared=null;state.revision++;
  confirmActiveProjection(state,display);return captureActive(state,view,scope);
}

export async function updateAnnotationLiveEditor(views,view,input,signal,options={}){
  const state=stateFor(views,view);
  return serialize(state,async()=>{
    const display=optionsFor(state,options),active=assertActive(state,view,input?.editorId,display.owner),scope=lifetime(view,signal);scope.throwIfAborted();
    if(input.changes===undefined&&input.textValue===undefined&&input.annotationControlChanges===undefined)throw fail('没有实时编辑值');
    const group=clone(active.group);
    if(group.anchor.kind==='virtual'&&(input.textValue!==undefined||input.changes!==undefined&&Object.keys(input.changes??{}).length))throw fail('虚拟对象只能编辑网站声明的控件');
    if(input.changes!==undefined){
      const changes=input.changes;
      if(!changes||typeof changes!=='object'||Array.isArray(changes))throw fail('实时样式值无效');
      if(Object.keys(changes).length)styleChanges(changes);
      const declarations=new Map(group.declarations.map(value=>[value.property,{...value,value:value.previousValue}]));
      for(const [property,value]of Object.entries(changes)){
        const declaration=declarations.get(property),previousValue=active.initialStyles[property];
        if(!declaration&&typeof previousValue!=='string')throw changed();
        declarations.set(property,{property,value,previousValue:declaration?.previousValue??previousValue.trim()});
      }
      group.declarations=[...declarations.values()];
    }
    if(input.textValue!==undefined){
      if(typeof input.textValue!=='string')throw fail('批注新文字必须是字符串');
      if(!group.text)throw fail('所选元素没有可编辑的直接文字');
      group.text={value:input.textValue,previousValue:group.text.previousValue};
    }
    if(input.annotationControlChanges!==undefined){
      if(view.siteAnnotationFeaturesEnabled!==true||!group.annotationControls||!Array.isArray(input.annotationControlChanges)||input.annotationControlChanges.length>12)throw fail('网站自定义控件当前不可编辑');
      const desired=new Set();group.annotationControlChanges=[];
      for(const item of input.annotationControlChanges){
        const control=group.annotationControls.controls.find(value=>value.callback===item?.callback);
        if(!control||Object.keys(item).some(key=>!['callback','value'].includes(key))||desired.has(item.callback))throw fail('网站自定义控件标识无效');
        const value=item.value,valid=control.type==='toggle'?typeof value==='boolean':control.type==='range'?typeof value==='number'&&Number.isFinite(value)&&value>=control.min&&value<=control.max:control.type==='select'?control.options.some(option=>option.value===value):typeof value==='string'&&/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
        if(!valid)throw fail('网站自定义控件值无效');desired.add(item.callback);
        const previous=active.group.annotationControlChanges?.find(change=>change.callback===item.callback);
        if(previous)group.annotationControlChanges.push(clone(previous));
        group.annotationControlChanges=updateAnnotationSiteControlChanges(group,item.callback,value).annotationControlChanges;
      }
    }
    group.updatedAt=new Date().toISOString();const next={...active,group};
    await project(state,view,display,scope,next);state.active=next;state.prepared=null;state.revision++;
    confirmActiveProjection(state,display);return captureActive(state,view,scope);
  });
}

export async function syncAnnotationLiveEditor(views,view,signal,options={}){
  const state=stateFor(views,view);
  return serialize(state,async()=>{
    if(options.onlyProjectionOwner===true){
      if(!options.owner||!['object','function'].includes(typeof options.owner))throw fail('缺少真实投影归属');
      if(state.active&&state.active.owner!==options.owner||state.projectionOwner!==options.owner)return{active:null,styleState:null,physicalSkipped:true};
    }
    const display=optionsFor(state,options),scope=lifetime(view,signal);scope.throwIfAborted();
    if(state.active&&(state.active.document!==view.document||!display.enabled)){state.active=null;state.prepared=null;state.revision++;}
    await project(state,view,display,scope);confirmActiveProjection(state,display);return state.active?captureActive(state,view,scope):publicState(state);
  });
}

export async function cancelAnnotationLiveEditor(views,view,input={},signal,options={}){
  const state=stateFor(views,view);
  return serialize(state,async()=>{
    const display=optionsFor(state,options),scope=lifetime(view,signal);scope.throwIfAborted();
    if(input.editorId!==undefined)assertActive(state,view,input.editorId,display.owner);
    await project(state,view,display,scope,null);state.active=null;state.prepared=null;state.revision++;
    return publicState(state);
  });
}

export async function prepareAnnotationLiveEditorSave(views,view,input,signal,options={}){
  const state=stateFor(views,view);
  return serialize(state,async()=>{
    const display=optionsFor(state,options),active=assertActive(state,view,input?.editorId,display.owner),scope=lifetime(view,signal);scope.throwIfAborted();
    if(!display.enabled||display.showOriginal)throw fail('请松开原始视图后保存实时编辑');
    if(options.allowUnchanged!==undefined&&typeof options.allowUnchanged!=='boolean')throw fail('实时编辑保存选项无效');
    if(!hasChanges(draftGroup(active))&&options.allowUnchanged!==true)throw fail('没有可保存的实际样式或文字变更');
    await project(state,view,display,scope);confirmActiveProjection(state,display);
    const capture=await captureActive(state,view,scope);
    const additionalSelections=capture.additionalSelections??[],allUnresolvable=capture.targetStatus?.resolvable===false&&additionalSelections.every(value=>value.targetStatus?.resolvable===false);
    const virtual=active.group.anchor.kind==='virtual';
    const skipScreenshot=virtual||!capture.element&&capture.targetStatus?.connected===true&&allUnresolvable&&!capture.truncated&&!sourceDocsPage(active.group.anchor.pageUrl);
    if(!capture.viewportRect&&!additionalSelections.some(value=>value.viewportRect)&&!skipScreenshot)throw fail('实时编辑元素的实际几何尚未确认，请调整样式后保存','ANNOTATION_CHANGED');
    const status=virtual?{frameId:active.identity.frameId,loaderId:active.identity.frameLoaderId,backendNodeId:active.identity.backendNodeId}:state.styleState.entries.find(entry=>entry.commentId===active.group.id),saveId=randomUUID(),group={...draftGroup(active),status:'queued',updatedAt:new Date().toISOString()};
    const packet={saveId,editorId:active.editorId,revision:state.revision,group,selection:clone(active.selection),baselineElement:clone(active.baselineElement),
      frame:capture.frame,element:capture.element,elements:capture.elements,truncated:capture.truncated,...(capture.viewportRect?{viewportRect:clone(capture.viewportRect)}:{}),...(additionalSelections.length?{additionalSelections:clone(additionalSelections)}:{}),...(skipScreenshot?{skipScreenshot:true}:{}),proof:{...clone(active.oldValueProof),...(capture.virtualSelection?.geometrySource?{geometrySource:capture.virtualSelection.geometrySource}:{}),targetStatus:clone(capture.targetStatus),documentIdentity:{tabId:view.tabId,loaderId:view.loaderId,frameId:status.frameId,frameLoaderId:status.loaderId,backendNodeId:status.backendNodeId}}};
    const captureProof=state.captureProof;
    if(!captureProof||captureProof.editorId!==active.editorId||captureProof.revision!==state.revision||captureProof.document!==active.document)throw changed();
    state.prepared={saveId,revision:state.revision,document:active.document,group:clone(group),packet:clone(packet),signature:clone(captureProof.signature)};return packet;
  });
}

function sameSavedGroup(group,prepared,siteEnabled){
  let anchor=prepared.anchor;
  if(siteEnabled!==true&&anchor?.kind==='element'){const{elementName,elementMetadata,annotationFeatures,...ordinary}=anchor;anchor=ordinary;}
  return group?.status==='queued'&&group.id===prepared.id&&JSON.stringify(group.anchor)===JSON.stringify(anchor)&&
    JSON.stringify(group.declarations)===JSON.stringify(prepared.declarations)&&JSON.stringify(group.text??null)===JSON.stringify(prepared.text??null)&&JSON.stringify(group.annotationControls??null)===JSON.stringify(prepared.annotationControls??null)&&JSON.stringify(group.annotationControlChanges??null)===JSON.stringify(prepared.annotationControlChanges??null);
}

// Server-only packet consumers must check the private retained preparation;
// a renderer's copies of saveId, previous values or screenshot are not proof.
export function assertPreparedAnnotationLiveEditorSavePacket(view,packet){
  const state=view.annotationLiveEditor,prepared=state?.prepared,active=state?.active;
  if(!prepared||!active||packet?.saveId!==prepared.saveId||packet.editorId!==active.editorId||packet.revision!==state.revision||prepared.document!==view.document||
    active.document.signal.aborted||view.lifetime.signal.aborted||active.identity.loaderId!==view.loaderId||JSON.stringify(packet)!==JSON.stringify(prepared.packet))throw fail('实时编辑保存材料不匹配后端凭据','ANNOTATION_CHANGED');
}

export async function validatePreparedAnnotationLiveEditorSavePacket(views,view,packet,signal){
  assertPreparedAnnotationLiveEditorSavePacket(view,packet);
  const state=view.annotationLiveEditor,prepared=state.prepared,scope=lifetime(view,signal);scope.throwIfAborted();
  if(state.views!==views)throw changed();
  const current=await annotationDocuments(views,view,annotationSnapshotOptions,scope);
  try{
    if(JSON.stringify(current.signature)!==JSON.stringify(prepared.signature))throw changed();
    if(state.active.group.anchor.kind==='virtual')await readAnnotationVirtualControlsProof(views,view,state.active.virtualProof,scope);
    scope.throwIfAborted();assertPreparedAnnotationLiveEditorSavePacket(view,packet);
  }finally{await current.dispose();}
}

function sameSavedAdditionalSelections(saved,prepared){
  const actual=saved?.comment?.localBrowserContext?.additionalSelections??[],expected=prepared.packet.additionalSelections??[];
  return actual.length===expected.length&&actual.every((value,index)=>{
    const anchor=expected[index].anchor;
    return value.kind===anchor.kind&&value.pageUrl===anchor.pageUrl&&JSON.stringify(value.framePath)===JSON.stringify(anchor.framePath)&&
      (value.frameUrl??null)===(anchor.frameUrl??null)&&value.targetPath===anchor.elementPath&&
      (anchor.kind==='element'?value.targetSelector===anchor.selector:JSON.stringify(value.rect)===JSON.stringify(anchor.rect));
  });
}

export async function commitAnnotationLiveEditorSave(views,view,input,signal,options={}){
  const state=stateFor(views,view);
  return serialize(state,async()=>{
    const display=optionsFor(state,options),active=assertActive(state,view,input?.editorId,display.owner),prepared=state.prepared,scope=lifetime(view,signal);scope.throwIfAborted();
    if(!prepared||input.saveId!==prepared.saveId||prepared.revision!==state.revision||prepared.document!==view.document)throw fail('实时编辑保存凭据已经失效','ANNOTATION_CHANGED');
    const saved=display.entries.find(entry=>commentId(entry)===active.group.id);
    const groupCommitted=hasChanges(prepared.group)?sameSavedGroup(groupOf(saved),prepared.group,view.siteAnnotationFeaturesEnabled):saved!=null&&groupOf(saved)==null;
    if(!groupCommitted||saved.selection?.elementKey!==active.selection.elementKey||saved.selection?.sourceFrameId!==active.selection.sourceFrameId||!sameSavedAdditionalSelections(saved,prepared))throw fail('后端队列尚未接管同一实时设计组及完整选择','ANNOTATION_LIVE_SAVE_NOT_COMMITTED');
    // Source handleDesignOverlayAdd: queue takes over the same group before
    // dismissing its active editor, without an intervening restore.
    await project(state,view,display,scope,null);state.active=null;state.prepared=null;state.revision++;
    return{...publicState(state),savedCommentId:active.group.id};
  });
}

export async function restoreAnnotationLiveEditor(view){
  const state=view.annotationLiveEditor;
  if(!state){await restoreQueuedAnnotationSiteControls(view);return restoreQueuedAnnotationStyles(view);}
  return serialize(state,async()=>{
    await dropAnnotationActiveStyleProjection(view);await restoreQueuedAnnotationSiteControls(view);const restored=await restoreQueuedAnnotationStyles(view);
    state.active=null;state.prepared=null;state.captureProof=null;state.revision++;state.disposed=true;state.entries=[];state.styleState=null;state.projectionOwner=null;
    state.document?.signal.removeEventListener('abort',state.abortDocument);view.lifetime.signal.removeEventListener('abort',state.abortLifetime);
    if(view.annotationLiveEditor===state)view.annotationLiveEditor=null;return restored;
  });
}
