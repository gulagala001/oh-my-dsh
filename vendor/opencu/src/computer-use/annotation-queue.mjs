import {randomUUID} from 'node:crypto';
import {submitAnnotation,submitPreparedAnnotation,readFrozenAnnotationAdditionalSelections,compactAnnotationComment,rerenderAnnotationComment} from './annotation-submit.mjs';
import {beginAnnotationLiveEditor,updateAnnotationLiveEditor,syncAnnotationLiveEditor,cancelAnnotationLiveEditor,prepareAnnotationLiveEditorSave,commitAnnotationLiveEditorSave} from './annotation-live-editor.mjs';
import {selectAnnotationSurface,clearAnnotationSurfaceSelection} from './annotation-surface-controller.mjs';
import {captureAnnotation,annotationSnapshotOptions} from './browser-annotation.mjs';
import {annotationDocuments} from './annotation-documents.mjs';
import {readAnnotationEditableText} from './annotation-text-changes.mjs';
import {readFrozenAnnotationVirtualControls} from './annotation-virtual-controls.mjs';
import {readAnnotationEditorPlanTarget} from './annotation-editor-plan.mjs';

const owners=new WeakMap();
const surfaceOwners=new WeakMap();
const pageDefaultTweaksEditorSenders=new WeakSet();
const fail=(message,code='INVALID_ANNOTATION_QUEUE')=>Object.assign(new Error(message),{code});
const clone=value=>structuredClone(value);
const id=value=>typeof value==='string'&&value.length>0&&value.length<1024;
const entryId=entry=>entry.comment.localBrowserCommentMetadata.commentId;
const hasTweaks=entry=>{const group=entry.comment.localBrowserDesignChange?.group;return group?.status==='queued'&&(group.declarations.some(value=>value.value!==value.previousValue)||group.text!=null&&group.text.value!==group.text.previousValue||(group.annotationControlChanges??[]).some(value=>value.value!==value.previousValue));};
const queueKey=(views,view)=>JSON.stringify([views.browser.id,view.tabId]);

function surfaceWork(state,work){const pending=state.tail.catch(()=>{}).then(work);state.tail=pending.catch(()=>{});return pending;}
function selectOwnedSurface(views,view,input,signal,owner){
  let state=surfaceOwners.get(view);if(!state){state={tail:Promise.resolve(),owner:null,document:null};surfaceOwners.set(view,state);}
  return surfaceWork(state,async()=>{
    const document=view.document;
    if(state.document!==document){state.owner=null;state.document=null;}
    const result=await selectAnnotationSurface(views,view,input,signal);
    if(result.status==='hit'&&document===view.document&&!document.signal.aborted){state.owner=owner;state.document=document;}
    return result;
  });
}
function clearOwnedSurface(views,view,signal,owner){
  const state=surfaceOwners.get(view);if(!state)return Promise.resolve(false);
  return surfaceWork(state,async()=>{
    if(state.owner!==owner||state.document!==view.document||view.closed||view.lifetime.signal.aborted||view.document.signal.aborted)return false;
    const document=state.document;await clearAnnotationSurfaceSelection(views,view,signal);
    if(state.owner===owner&&state.document===document){state.owner=null;state.document=null;}
    return true;
  });
}

function queueFor(views,view,owner){
  if(!owner||typeof owner!=='object')throw fail('缺少批注会话归属');
  let queues=owners.get(owner);if(!queues){queues=new Map();owners.set(owner,queues);}
  const key=queueKey(views,view);
  let queue=queues.get(key);if(!queue){queue={revision:0,entries:[],batches:new Map(),directs:new Map(),interactionMode:'browse',annotationFlow:'batch',isOriginalViewEnabled:false,isTweaksEditorOpen:false,annotationEditorMode:'comment',tail:Promise.resolve()};queues.set(key,queue);}
  return queue;
}
function syncPageDefaultOpen(queue,view){
  const page=view.record.page,document=view.document;
  if(queue.planDocument!==document||queue.planPage!==page){
    if(queue.planPage&&pageDefaultTweaksEditorSenders.delete(queue.planPage)){queue.isTweaksEditorOpen=false;queue.revision++;}
    queue.planTarget=null;queue.planDocument=document;queue.planPage=page;
  }
  if(view.siteAnnotationFeaturesEnabled!==true&&pageDefaultTweaksEditorSenders.delete(page)){queue.isTweaksEditorOpen=false;queue.revision++;}
}
function finishEditor(queue,{exit=false}={}){
  queue.annotationEditorMode='comment';queue.planTarget=null;
  if(exit){queue.isTweaksEditorOpen=false;queue.interactionMode='browse';queue.annotationFlow='batch';queue.isOriginalViewEnabled=false;}
}
function snapshot(queue,view,owner){
  const entries=queue.entries.map((entry,index)=>({id:entryId(entry),version:entry.version,delivered:entry.deliveredVersion===entry.version,
    attachmentIds:[...entry.attachmentIds],selection:clone(entry.selection),comment:{...clone(entry.comment),position:{...entry.comment.position,line:index+1}}}));
  const active=view?.annotationLiveEditor?.active,cached=queue.liveEditor;
  const liveEditor=cached?.active&&(!active||active.owner!==owner||active.editorId!==cached.active.editorId||view.annotationLiveEditor.revision!==cached.active.revision||active.document!==view.document||active.document.signal.aborted)?{active:null,styleState:cached.styleState}:cached;
  return{revision:queue.revision,annotationFlow:queue.annotationFlow,interactionMode:queue.interactionMode,isOriginalViewEnabled:queue.isOriginalViewEnabled,isTweaksEditorOpen:queue.isTweaksEditorOpen,annotationEditorMode:queue.annotationEditorMode,
    ...(liveEditor?{liveEditor:clone(liveEditor)}:{}),
    ...(queue.styleState?{queuedStyleState:clone(queue.styleState)}:{}),comments:entries.map(entry=>entry.comment),entries,
    pendingAnnotationCount:entries.length,undeliveredCount:entries.filter(entry=>!entry.delivered).length,
    hasQueuedTweaks:entries.some(hasTweaks)};
}
function selectionFor(baseline,input){
  const geometry={...baseline.result.frame.geometry};
  if(input.virtualSelectionKey!==undefined){const selected=baseline.virtualSelection,rect=selected.viewportRect;return{sourceFrameId:input.sourceFrameId,virtualAnchor:clone(selected.anchor),region:{x:(rect.x-geometry.offsetX)/geometry.width,y:(rect.y-geometry.offsetY)/geometry.height,width:rect.width/geometry.width,height:rect.height/geometry.height},point:{x:(selected.viewportPoint.x-geometry.offsetX)/geometry.width,y:(selected.viewportPoint.y-geometry.offsetY)/geometry.height},pageUrl:baseline.result.frame.url,loaderId:baseline.result.frame.loaderId,geometry};}
  if(input.textSelectionKey!==undefined){const selected=baseline.result.textSelection,rect=selected.viewportRect;return{sourceFrameId:input.sourceFrameId,textAnchor:clone(selected.anchor),region:{x:(rect.x-geometry.offsetX)/geometry.width,y:(rect.y-geometry.offsetY)/geometry.height,width:rect.width/geometry.width,height:rect.height/geometry.height},point:{x:(selected.viewportPoint.x-geometry.offsetX)/geometry.width,y:(selected.viewportPoint.y-geometry.offsetY)/geometry.height},pageUrl:baseline.result.frame.url,loaderId:baseline.result.frame.loaderId,geometry};}
  const selected=value=>({...((value.elementKey??null)!==null?{elementKey:value.elementKey}:{}),region:clone(value.elementKey?baseline.result.elements.find(element=>element.key===value.elementKey).region:value.region),point:clone(value.selectionPoint)});
  return{sourceFrameId:input.sourceFrameId,...selected(input),pageUrl:baseline.result.frame.url,loaderId:baseline.result.frame.loaderId,geometry,
    ...((input.additionalSelections?.length??0)>0?{additional:input.additionalSelections.map(selected)}:{})};
}
function preparedSelection(packet){return{...clone(packet.selection),...(packet.additionalSelections?.length?{additional:packet.additionalSelections.map(value=>({...(value.selection.elementKey?{elementKey:value.selection.elementKey}:{}),region:clone(value.selection.region),point:clone(value.selection.point)}))}:{})};}
function find(queue,commentId){const entry=queue.entries.find(entry=>entryId(entry)===commentId);if(!entry)throw fail('批注已经移除','ANNOTATION_CHANGED');return entry;}
function bodyText(comment,body){
  const group=comment.localBrowserDesignChange?.group;if(!group)return body;
  const differences=[...(group.text!=null&&group.text.value!==group.text.previousValue?[`text: ${group.text.previousValue} -> ${group.text.value}`]:[]),...group.declarations.filter(value=>value.value!==value.previousValue).map(value=>`${value.property}: ${value.previousValue} -> ${value.value}`)].join('\n');
  return body?body+'\n'+differences:differences;
}

// Native snapshot.comments stays one ledger across save/edit/compose. DSH
// draft IDs are tracked separately and never supplied as comment evidence.
export async function handleAnnotationQueue(views,view,input,signal,owner,serverOptions={}){
  if(!input||typeof input.action!=='string')throw fail('批注队列请求无效');
  const queue=queueFor(views,view,owner);
  const state=()=>snapshot(queue,view,owner);
  const options=()=>({entries:queue.entries,enabled:queue.interactionMode==='comment',showOriginal:queue.isOriginalViewEnabled,owner});
  const rememberLive=value=>{queue.liveEditor=value;queue.styleState=value.styleState;return value;};
  const publish=async()=>{
    if(view.annotationLiveEditor||queue.styleState||queue.entries.some(entry=>entry.comment.localBrowserDesignChange))rememberLive(await syncAnnotationLiveEditor(views,view,signal,options()));
    return state();
  };
  const cancelLive=async(editorId)=>{
    const result=await cancelAnnotationLiveEditor(views,view,{...(editorId?{editorId}:{})},signal,options());
    const capture=await captureAnnotation(views,view,signal);rememberLive({...result,...capture,element:null});return state();
  };
  const execute=async()=>{
    signal?.throwIfAborted();
    syncPageDefaultOpen(queue,view);
    if(view.annotationLiveEditor?.active?.owner!==undefined&&view.annotationLiveEditor.active.owner!==owner&&['enter','exit','hold-original','save','direct','update','delete','discard','clear','save-direct-fallback','sync-composer','editor-open-plan','tweaks-open'].includes(input.action))throw fail('此页面有其他会话的实时编辑正在进行','ANNOTATION_LIVE_EDITOR_BUSY');
    switch(input.action){
      case 'snapshot': return state();
      case 'editor-open-plan': {
        const material=await readAnnotationEditorPlanTarget(views,view,input,signal);
        const siteRequest=serverOptions.siteRequest,site=siteRequest!=null;
        if(site&&(siteRequest.kind!=='request'||siteRequest.request?.siteInitiated!==true||view.siteAnnotationFeaturesEnabled!==true))throw fail('站点编辑器打开缺少当前启用的后端发行请求');
        const siteOpenTweaks=site&&siteRequest.request.openTweaks===true,oldOpen=queue.isTweaksEditorOpen;
        // main@1582990: h is page-default intent; g is a retained manual
        // preference. Only h needs site API permission and a sender mark.
        const h=material.canEditDesign&&view.siteAnnotationFeaturesEnabled===true&&(material.hasDefaultControlChanges||!site&&material.pageAnnotationEditorDefault==='advanced');
        const g=material.canEditDesign&&!site&&oldOpen&&!pageDefaultTweaksEditorSenders.has(view.record.page);
        const defaultDesignEditorOpen=material.canEditDesign&&(h||g||siteOpenTweaks);
        if(h){if(site?!siteOpenTweaks:!oldOpen)pageDefaultTweaksEditorSenders.add(view.record.page);}
        else pageDefaultTweaksEditorSenders.delete(view.record.page);
        queue.isTweaksEditorOpen=defaultDesignEditorOpen;
        if(site)queue.annotationEditorMode=siteOpenTweaks?'design':'comment';
        queue.planTarget=clone({sourceFrameId:input.sourceFrameId,selectionPoint:input.selectionPoint,
          ...(input.elementKey!==undefined?{elementKey:input.elementKey,...(input.siteAnnotationSourceKey!==undefined?{siteAnnotationSourceKey:input.siteAnnotationSourceKey}:{})}:{}),
          ...(input.virtualSelectionKey!==undefined?{virtualSelectionKey:input.virtualSelectionKey}:{}),
          ...(input.textSelectionKey!==undefined?{textSelectionKey:input.textSelectionKey}:{}),...(input.region!==undefined?{region:input.region}:{})});
        queue.revision++;
        return{...state(),editorOpenPlan:{canEditDesign:material.canEditDesign,defaultDesignEditorOpen,pageRequestedDesignEditor:h||siteOpenTweaks}};
      }
      case 'tweaks-open': {
        if(typeof input.open!=='boolean')throw fail('调整面板打开状态无效');
        if(input.open){
          const active=view.annotationLiveEditor?.active;
          const actualActive=active?.owner===owner&&active.document===view.document&&!active.document.signal.aborted&&active.identity.loaderId===view.loaderId&&
            (active.group.anchor.kind==='element'||active.group.anchor.kind==='virtual'&&view.siteAnnotationFeaturesEnabled===true&&(active.group.annotationControls?.controls.length??0)>0);
          if(!actualActive){
            const target=input.sourceFrameId!==undefined?input:queue.planTarget;
            if(!target||(await readAnnotationEditorPlanTarget(views,view,target,signal)).canEditDesign!==true)throw fail('当前没有可编辑的真实批注目标');
          }
        }
        pageDefaultTweaksEditorSenders.delete(view.record.page);
        queue.isTweaksEditorOpen=input.open;queue.annotationEditorMode=input.open?'design':'comment';queue.revision++;return state();
      }
      case 'design-begin': {
        if(input.commentId!==undefined&&input.sourceFrameId===undefined){
          if(!id(input.commentId)||['elementKey','virtualSelectionKey','textSelectionKey','region','selectionPoint','additionalSelections'].some(key=>input[key]!==undefined))throw fail('已保存批注的恢复请求无效');
          const savedEntry=find(queue,input.commentId),group=savedEntry.comment.localBrowserDesignChange?.group;
          if(group?.anchor?.kind!=='virtual'||group.id!==input.commentId||group.status!=='queued')throw fail('没有可恢复的后端虚拟控件组','ANNOTATION_CHANGED');
          rememberLive(await beginAnnotationLiveEditor(views,view,input,signal,{...options(),savedEntry}));
          queue.isTweaksEditorOpen=true;queue.annotationEditorMode='design';queue.revision++;return state();
        }
        const additionalSelections=await readFrozenAnnotationAdditionalSelections(views,view,input,signal);
        if(input.commentId!==undefined&&(find(queue,input.commentId).comment.localBrowserContext?.additionalSelections?.length??0)!==additionalSelections.length)throw fail('已保存的追加选择尚未完整映射，请保留正文编辑或重新选择','ANNOTATION_CHANGED');
        rememberLive(await beginAnnotationLiveEditor(views,view,input,signal,{...options(),additionalSelections}));queue.revision++;return state();
      }
      case 'design-update': {
        rememberLive(await updateAnnotationLiveEditor(views,view,input,signal,options()));queue.revision++;return state();
      }
      case 'design-cancel': {const virtual=view.annotationLiveEditor?.active?.group.anchor.kind==='virtual';await cancelLive(input.editorId);if(virtual)await clearOwnedSurface(views,view,signal,owner);finishEditor(queue);queue.revision++;return state();}
      case 'design-save':
      case 'design-direct': {
        if(typeof input.body!=='string'||input.body.length>100000)throw fail('批注编辑内容无效');
        const packet=await prepareAnnotationLiveEditorSave(views,view,input,signal,{...options(),allowUnchanged:input.body.trim().length>0});
        const existing=queue.entries.find(entry=>entryId(entry)===packet.group.id),direct=input.action==='design-direct';
        if(direct&&existing)throw fail('已保存的批注只能更新，不能再次直接发送');
        const number=direct?1:existing?queue.entries.indexOf(existing)+1:queue.entries.length+1;let screenshotPacket;
        const comment=await submitPreparedAnnotation(views,view,input,packet,signal,{commentNumber:number,compact:!direct&&queue.entries.length+(existing?0:1)>=10,onScreenshotPacket:value=>{screenshotPacket=value;}});
        if(direct){
          const directId=packet.group.id;queue.directs.set(directId,{comment,packet:screenshotPacket,geometry:{...packet.frame.geometry},selection:preparedSelection(packet)});
          while(queue.directs.size>8)queue.directs.delete(queue.directs.keys().next().value);
          await cancelLive(input.editorId);
          if(packet.group.anchor.kind==='virtual')await clearOwnedSurface(views,view,signal,owner);
          finishEditor(queue,{exit:queue.annotationFlow==='quick'});
          queue.revision++;return{...await publish(),directId,comment:clone(comment)};
        }
        let entries=existing?queue.entries.map(entry=>entry===existing?{...entry,comment,version:entry.version+1,geometry:{...packet.frame.geometry},selection:preparedSelection(packet)}:entry):[...queue.entries,{comment,version:1,deliveredVersion:0,attachmentIds:[],geometry:{...packet.frame.geometry},selection:preparedSelection(packet)}];
        if(entries.length>=10){const compacted=[];for(const entry of entries){const next=await compactAnnotationComment(entry.comment,entry.geometry,signal);compacted.push(next===entry.comment?entry:{...entry,comment:next,version:entry.version+1});}entries=compacted;}
        signal?.throwIfAborted();queue.entries=entries;queue.revision++;
        rememberLive(await commitAnnotationLiveEditorSave(views,view,{editorId:input.editorId,saveId:packet.saveId},signal,options()));
        if(packet.group.anchor.kind==='virtual')await clearOwnedSurface(views,view,signal,owner);
        const quick=queue.annotationFlow==='quick';finishEditor(queue,{exit:quick});if(quick)return publish();
        return state();
      }
      case 'editable-text': {
        const baseline=view.annotations?.get(input.sourceFrameId),element=baseline?.result.elements.find(value=>value.key===input.elementKey);
        if(!element||view.annotationDocument!==view.document||baseline.result.frame.loaderId!==view.loaderId)throw fail('批注冻结元素已经失效','ANNOTATION_CHANGED');
        const documents=await annotationDocuments(views,view,annotationSnapshotOptions,signal);
        try{
          if(JSON.stringify(documents.signature)!==JSON.stringify(baseline.dom))throw fail('页面在读取原文时已经改变','ANNOTATION_CHANGED');
          const entry=documents.entries.get(element.frameId);if(!entry)throw fail('所选框架已经改变','ANNOTATION_CHANGED');
          const text=await readAnnotationEditableText(operation=>views.read(view,operation,signal),entry,element.backendNodeId,signal);
          const current=await annotationDocuments(views,view,annotationSnapshotOptions,signal);try{if(JSON.stringify(current.signature)!==JSON.stringify(baseline.dom))throw fail('页面在读取原文时已经改变','ANNOTATION_CHANGED');}finally{await current.dispose();}
          if(view.annotations?.get(input.sourceFrameId)!==baseline)throw fail('批注冻结画面已经失效','ANNOTATION_CHANGED');return{...state(),text};
        }finally{await documents.dispose();}
      }
      case 'select-surface': {
        if(input.append!==undefined&&typeof input.append!=='boolean')throw fail('批注多选状态无效');
        const result=await selectOwnedSurface(views,view,input,signal,owner);
        if(result.status==='hit'&&result.snapshot?.virtualSelection){
          const selected=await readFrozenAnnotationVirtualControls(views,view,{sourceFrameId:result.snapshot.frame.id,virtualSelectionKey:result.snapshot.virtualSelection.key},signal);
          result.snapshot.virtualSelection.annotationControls=selected?.annotationControls??null;
        }
        return{...state(),...result};
      }
      case 'clear-surface': await clearOwnedSurface(views,view,signal,owner);return{...state(),snapshot:await captureAnnotation(views,view,signal)};
      case 'enter': {
        if(input.annotationFlow!==undefined&&!['batch','quick'].includes(input.annotationFlow))throw fail('批注流程无效');
        const flow=input.annotationFlow??'batch';
        if(queue.interactionMode==='comment'&&queue.annotationFlow===flow)return state();
        queue.annotationEditorMode='comment';queue.isTweaksEditorOpen=flow==='batch'&&queue.entries.at(-1)?.comment.localBrowserDesignChange?.group!=null;queue.planTarget=null;
        queue.annotationFlow=flow;queue.interactionMode='comment';queue.isOriginalViewEnabled=false;queue.revision++;return publish();
      }
      case 'exit': await clearOwnedSurface(views,view,signal,owner);finishEditor(queue,{exit:true});queue.revision++;return publish();
      case 'hold-original': {
        if(typeof input.enabled!=='boolean')throw fail('原始样式状态无效');
        queue.isOriginalViewEnabled=input.enabled&&queue.interactionMode==='comment'&&(queue.entries.some(hasTweaks)||state().liveEditor?.active?.changed===true);queue.revision++;return publish();
      }
      case 'direct': {
        const baseline=view.annotations?.get(input.sourceFrameId);let packet;
        const comment=await submitAnnotation(views,view,input,signal,{commentNumber:1,onScreenshotPacket:value=>{packet=value;}});
        const directId=comment.localBrowserCommentMetadata.commentId;
        queue.directs.set(directId,{comment,packet,geometry:{...packet.frame.geometry},selection:selectionFor(baseline,input)});
        if(input.virtualSelectionKey!==undefined)await clearOwnedSurface(views,view,signal,owner);
        while(queue.directs.size>8)queue.directs.delete(queue.directs.keys().next().value);
        finishEditor(queue,{exit:queue.annotationFlow==='quick'});queue.revision++;
        return{...await publish(),directId,comment:clone(comment)};
      }
      case 'complete-direct': queue.directs.delete(input.directId);return state();
      case 'save-direct-fallback': {
        const saved=queue.directs.get(input.directId);if(!saved)throw fail('直接批注已经失效','ANNOTATION_CHANGED');
        const number=queue.entries.length+1,comment=await rerenderAnnotationComment(saved.comment,saved.packet,number,number>=10,signal);
        queue.entries.push({comment,version:1,deliveredVersion:0,attachmentIds:[],geometry:saved.geometry,selection:saved.selection});
        queue.directs.delete(input.directId);queue.revision++;
        if(queue.entries.length>=10){for(const entry of queue.entries){const compact=await compactAnnotationComment(entry.comment,entry.geometry,signal);if(compact!==entry.comment){entry.comment=compact;entry.version++;}}}
        return publish();
      }
      case 'save': {
        const baseline=view.annotations?.get(input.sourceFrameId),number=queue.entries.length+1;
        const comment=await submitAnnotation(views,view,input,signal,{commentNumber:number,compact:number>=10});
        const frame=input.previewFrameId===undefined?baseline?.result.frame:baseline?.preview?.frame;
        if(!frame)throw fail('批注冻结画面已经失效','ANNOTATION_CHANGED');
        let entries=[...queue.entries,{comment,version:1,deliveredVersion:0,attachmentIds:[],geometry:{...frame.geometry},
          selection:selectionFor(baseline,input)}];
        if(entries.length>=10){
          const compacted=[];
          for(const entry of entries){const next=await compactAnnotationComment(entry.comment,entry.geometry,signal);compacted.push(next===entry.comment?entry:{...entry,comment:next,version:entry.version+1});}
          entries=compacted;
        }
        signal?.throwIfAborted();queue.entries=entries;
        if(input.virtualSelectionKey!==undefined)await clearOwnedSurface(views,view,signal,owner);
        finishEditor(queue,{exit:queue.annotationFlow==='quick'});
        queue.revision++;return publish();
      }
      case 'update': {
        if(!id(input.commentId)||typeof input.body!=='string'||input.body.length>100000)throw fail('批注编辑内容无效');
        const entry=find(queue,input.commentId),body=input.body.trim(),group=entry.comment.localBrowserDesignChange?.group;
        if(!body&&!group)throw fail('请填写批注说明');
        entry.comment={...entry.comment,content:[{content_type:'text',text:bodyText(entry.comment,body)}],...(group?{localBrowserDesignChange:{group:{...group,comment:body,updatedAt:new Date().toISOString()}}}:{})};
        entry.version++;finishEditor(queue);queue.revision++;return publish();
      }
      case 'delete': {
        if(!id(input.commentId))throw fail('批注标识无效');const entry=find(queue,input.commentId);
        if(view.annotationLiveEditor?.active?.owner===owner&&view.annotationLiveEditor.active.group.id===input.commentId)await cancelLive(view.annotationLiveEditor.active.editorId);
        const index=queue.entries.indexOf(entry);queue.entries=queue.entries.filter(value=>value!==entry);
        for(const remaining of queue.entries.slice(index))remaining.version++;
        queue.revision++;
        return{...await publish(),removedAttachmentIds:[...entry.attachmentIds]};
      }
      case 'clear':
      case 'discard': {
        const removedAttachmentIds=queue.entries.flatMap(entry=>entry.attachmentIds);
        if(view.annotationLiveEditor?.active)await cancelLive();
        await clearOwnedSurface(views,view,signal,owner);
        queue.entries=[];queue.isOriginalViewEnabled=false;queue.isTweaksEditorOpen=false;finishEditor(queue,{exit:input.action==='clear'});queue.revision++;return{...await publish(),removedAttachmentIds};
      }
      case 'prepare': {
        if(!queue.entries.length)throw fail('没有待提交的批注');
        const current=[...queue.batches.values()].find(batch=>batch.revision===queue.revision);
        if(current)return{...state(),batchId:current.id};
        const batch={id:randomUUID(),revision:queue.revision,versions:new Map(queue.entries.map(entry=>[entryId(entry),entry.version])),acked:false};
        queue.batches.set(batch.id,batch);while(queue.batches.size>8)queue.batches.delete(queue.batches.keys().next().value);
        return{...state(),batchId:batch.id};
      }
      case 'ack': {
        const batch=queue.batches.get(input.batchId);
        if(!batch)throw fail('批注移交请求已经失效','ANNOTATION_CHANGED');
        if(batch.acked)return state();
        if(!Array.isArray(input.attachments)||input.attachments.length!==batch.versions.size)throw fail('批注附件归属无效');
        const accepted=new Map(),allIds=new Set();
        for(const item of input.attachments){
          if(!item||!batch.versions.has(item.commentId)||accepted.has(item.commentId)||!Array.isArray(item.ids)||!item.ids.length||item.ids.length>2||item.ids.some(value=>!id(value)||allIds.has(value)))throw fail('批注附件归属无效');
          item.ids.forEach(value=>allIds.add(value));accepted.set(item.commentId,[...item.ids]);
        }
        const removedAttachmentIds=[];
        for(const [commentId,ids] of accepted){const entry=queue.entries.find(entry=>entryId(entry)===commentId);if(!entry){removedAttachmentIds.push(...ids);continue;}entry.attachmentIds=ids;entry.deliveredVersion=batch.versions.get(commentId);}
        batch.acked=true;queue.revision++;return{...state(),removedAttachmentIds};
      }
      case 'sync-composer': {
        if(!Array.isArray(input.attachmentIds)||input.attachmentIds.some(value=>!id(value)))throw fail('输入区附件状态无效');
        const present=new Set(input.attachmentIds);let changed=false,renumber=false;
        queue.entries=queue.entries.filter(entry=>{
          if(!entry.attachmentIds.length)return true;
          const retained=entry.attachmentIds.filter(value=>present.has(value));
          if(!retained.length){changed=true;if(entry.deliveredVersion!==entry.version){entry.attachmentIds=[];entry.deliveredVersion=0;return true;}renumber=true;return false;}
          if(retained.length!==entry.attachmentIds.length){entry.attachmentIds=retained;changed=true;}
          if(renumber)entry.version++;
          return true;
        });
        if(changed){if(!queue.entries.length)finishEditor(queue,{exit:true});queue.revision++;}return changed?publish():state();
      }
      default: throw fail('不支持的批注队列操作');
    }
  };
  const pending=queue.tail.catch(()=>{}).then(execute);queue.tail=pending.catch(()=>{});return pending;
}

// Closing a viewer must not require its retired actor or recreate a queue.
// Its ledger survives, while physical changes owned by this session stop.
export async function closeAnnotationQueueForOwner(views,view,owner){
  const queue=owner&&owners.get(owner)?.get(queueKey(views,view));if(!queue)return null;
  const execute=async()=>{
    finishEditor(queue,{exit:true});queue.revision++;
    await clearOwnedSurface(views,view,undefined,owner);
    const state=view.annotationLiveEditor,active=state?.active;
    if(active&&active.owner!==owner||!active&&state?.projectionOwner&&state.projectionOwner!==owner){queue.liveEditor=null;queue.styleState=null;return snapshot(queue,view,owner);}
    if(!view.closed&&!view.lifetime.signal.aborted&&!view.document.signal.aborted){
      const options={entries:queue.entries,enabled:false,showOriginal:false,owner,onlyProjectionOwner:true};
      const liveEditor=await syncAnnotationLiveEditor(views,view,undefined,options);
      queue.liveEditor=liveEditor;queue.styleState=liveEditor.styleState;
    }else{queue.liveEditor=null;queue.styleState=null;}
    return snapshot(queue,view,owner);
  };
  const pending=queue.tail.catch(()=>{}).then(execute);queue.tail=pending.catch(()=>{});return pending;
}
