import {randomUUID} from 'node:crypto';
import {annotationDocuments} from './annotation-documents.mjs';
import {annotationSnapshotOptions} from './browser-annotation.mjs';
import {pointInPolygon} from './annotation-geometry.mjs';
import {readFrozenAnnotationElementAnchor} from './annotation-submit.mjs';
import {readFrozenAnnotationSiteControls,annotationSiteControlDefaultValue} from './annotation-site-controls.mjs';
import {readFrozenAnnotationVirtualControls,readAnnotationVirtualControlsProof} from './annotation-virtual-controls.mjs';
import {readAnnotationTextSelection} from './annotation-text-anchor.mjs';
import {isFrozenAnnotationSiteRequestPoint} from './annotation-site-request-capture.mjs';

const worlds=new WeakMap();
const changed=()=>Object.assign(new Error('批注编辑目标或冻结页面已经改变'),{code:'ANNOTATION_CHANGED'});
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_ANNOTATION_EDITOR_PLAN'});
const point=value=>value&&['x','y'].every(key=>Number.isFinite(value[key])&&value[key]>=0&&value[key]<=1);
const region=value=>value&&['x','y','width','height'].every(key=>Number.isFinite(value[key]))&&value.x>=0&&value.y>=0&&value.width>0&&value.height>0&&value.x+value.width<=1.000001&&value.y+value.height<=1.000001;

// Preload wx/$x: only the top head participates; unknown meta values are
// skipped and the first strictly matching value is returned unchanged.
function sourceEditorDefaultMode(){
  const entries=document.head?.querySelectorAll('meta[name="oai-annotation-editor-default-mode"]');
  if(entries!=null)for(const entry of entries)if(entry.getAttribute('content')==='advanced')return'advanced';
  return null;
}

async function isolatedWorld(views,view,entry,signal){
  let state=worlds.get(view);
  if(!state||state.document!==view.document||state.cdp!==entry.cdp||state.frameId!==entry.frameId){
    state={document:view.document,cdp:entry.cdp,frameId:entry.frameId};worlds.set(view,state);
    const worldName='trisoul-annotation-editor-plan-'+randomUUID(),contexts=new Map();
    const observe=({context})=>contexts.set(context.id,context);
    state.cdp.on('Runtime.executionContextCreated',observe);
    const lifetime=AbortSignal.any([state.document.signal,view.lifetime.signal]);
    state.ready=(async()=>{
      try{
        await views.read(view,state.cdp.send('Runtime.enable'),lifetime);
        const created=await views.read(view,state.cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName,grantUniveralAccess:false}),lifetime);
        const context=contexts.get(created.executionContextId);
        if(context?.name!==worldName||context.auxData?.frameId!==entry.frameId||context.auxData?.isDefault!==false||state.document!==view.document)throw changed();
        return created.executionContextId;
      }finally{state.cdp.off('Runtime.executionContextCreated',observe);}
    })();
    void state.ready.catch(()=>{if(worlds.get(view)===state)worlds.delete(view);});
  }
  return views.read(view,state.ready,signal);
}

async function pageDefaultMode(views,view,entry,signal){
  const contextId=await isolatedWorld(views,view,entry,signal);
  const response=await views.read(view,entry.cdp.send('Runtime.evaluate',{contextId,expression:'('+sourceEditorDefaultMode.toString()+')()',returnByValue:true}),signal);
  if(response.exceptionDetails||![null,'advanced'].includes(response.result?.value))throw changed();
  return response.result.value??undefined;
}

// Only frozen server-owned DOM/selection evidence enters this result. Queue
// ownership, saved groups and host feature permissions stay with the caller.
export async function readAnnotationEditorPlanTarget(views,view,input,signal){
  if(!input||typeof input.sourceFrameId!=='string')throw invalid('缺少真实冻结的批注页面');
  const kinds=['elementKey','virtualSelectionKey','textSelectionKey','region'].filter(key=>input[key]!==undefined);
  if(kinds.length!==1||kinds[0]!=='region'&&(typeof input[kinds[0]]!=='string'||!input[kinds[0]]))throw invalid('请选择唯一的冻结批注目标');
  const kind=kinds[0],document=view.document,record=view.record,loaderId=view.loaderId,tabId=view.tabId,sessionId=view.sessionId;
  const lifetime=AbortSignal.any([signal,document.signal,view.lifetime.signal].filter(Boolean));lifetime.throwIfAborted();
  const baseline=view.annotations?.get(input.sourceFrameId),signature=JSON.stringify(baseline?.dom);
  const assert=()=>{
    lifetime.throwIfAborted();
    if(!baseline||view.closed||view.document!==document||view.annotationDocument!==document||view.record!==record||view.loaderId!==loaderId||view.tabId!==tabId||view.sessionId!==sessionId||view.annotations?.get(input.sourceFrameId)!==baseline||baseline.result.frame.id!==input.sourceFrameId||baseline.result.frame.loaderId!==loaderId||JSON.stringify(baseline.dom)!==signature)throw changed();
  };
  assert();
  const documents=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime);
  let canEditDesign=false,annotationControls,pageAnnotationEditorDefault,virtual;
  try{
    assert();if(JSON.stringify(documents.signature)!==signature)throw changed();
    const top=[...documents.entries.values()].find(entry=>!entry.owner);if(!top||top.loaderId!==loaderId)throw changed();
    if(kind==='elementKey'){
      const actual=await readFrozenAnnotationElementAnchor(views,view,input,lifetime),selected=actual.element,selectionPoint=input.selectionPoint;
      const requestPoint=isFrozenAnnotationSiteRequestPoint(view,baseline,{elementKey:input.elementKey},selectionPoint);
      if(!requestPoint&&(!point(selectionPoint)||(selected.polygon?!pointInPolygon(selectionPoint,selected.polygon):selectionPoint.x<selected.region.x||selectionPoint.x>selected.region.x+selected.region.width||selectionPoint.y<selected.region.y||selectionPoint.y>selected.region.y+selected.region.height)))throw invalid('选择位置与实际批注元素不一致');
      canEditDesign=true;
      annotationControls=await readFrozenAnnotationSiteControls(views,view,input.sourceFrameId,input.elementKey,lifetime);
      pageAnnotationEditorDefault=await pageDefaultMode(views,view,top,lifetime);
    }else if(kind==='virtualSelectionKey'){
      virtual=await readFrozenAnnotationVirtualControls(views,view,input,lifetime);
      const selected=virtual.selection,geometry=baseline.result.frame.geometry;
      if(!input.selectionPoint||!['x','y'].every(key=>Number.isFinite(input.selectionPoint[key])&&Math.abs((selected.viewportPoint[key]-geometry[key==='x'?'offsetX':'offsetY'])/geometry[key==='x'?'width':'height']-input.selectionPoint[key])<1e-9))throw invalid('虚拟对象的选择位置已经改变');
      annotationControls=virtual.annotationControls;canEditDesign=(annotationControls?.controls.length??0)>0;
    }else if(kind==='textSelectionKey'){
      const selected=baseline.result.textSelection;if(!selected||selected.key!==input.textSelectionKey)throw changed();
      const actual=await readAnnotationTextSelection(operation=>views.read(view,operation,lifetime),top,{anchor:selected.anchor},lifetime),{key,...frozen}=selected;
      if(!actual||JSON.stringify(actual)!==JSON.stringify(frozen))throw changed();
    }else if(!region(input.region)||!point(input.selectionPoint))throw invalid('批注区域或选择位置无效');
    assert();
    const current=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime);
    try{if(JSON.stringify(current.signature)!==signature)throw changed();}finally{await current.dispose();}
    if(virtual)await readAnnotationVirtualControlsProof(views,view,virtual.proof,lifetime);
    assert();
    const hasDefaultControlChanges=annotationControls?.controls.some(control=>annotationSiteControlDefaultValue(control)!==control.currentValue)??false;
    return{canEditDesign,hasDefaultControlChanges,...(pageAnnotationEditorDefault?{pageAnnotationEditorDefault}:{}),...(annotationControls?{annotationControls:structuredClone(annotationControls)}:{})};
  }finally{await documents.dispose();}
}
