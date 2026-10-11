import {CodexCuIcon} from './codex-cu-icons.jsx';
import {CodexCuButton,CodexCuSplitButton,CodexCuMenuItem} from './codex-cu-primitives.jsx';
import {CodexCuScope} from './codex-cu-scope.jsx';
import {CodexBrowserSelectionPointer} from './codex-assistant-cursor.jsx';
import {CodexAnnotationDeclarationControl} from './codex-annotation-controls.jsx';
import {CodexAnnotationControlsGrid,CodexAnnotationLayoutSections,CodexAnnotationSectionDivider,CodexAnnotationValueCell,codexAnnotationLayoutUtilities} from './codex-annotation-layout.jsx';
import {CodexAnnotationSiteControls,codexAnnotationSiteDefaultValue,codexAnnotationSiteChange,codexAnnotationSiteHeading} from './codex-annotation-site-controls.jsx';
import {CodexAnnotationToolbar} from './codex-annotation-toolbar.jsx';
import {CodexSiteAnnotationPermissionDialog,CodexSiteToolsStyles} from './codex-site-tools.jsx';
import {CODEX_CU_COPY} from './codex-cu-copy.mjs';
import {useCodexAnnotationSite} from './use-codex-annotation-site.mjs';
import {CodexCuDialog,CodexCuDialogTitle,CodexCuDialogBody,CodexCuDialogFooter} from './codex-cu-dialog.jsx';
import React, { useEffect, useRef, useState } from 'react';
import {createPortal} from 'react-dom';
import{pointInPolygon,compareAnnotationPaint}from'../computer-use/annotation-geometry.mjs';
import {resolveAnnotationSiteTarget} from '../computer-use/annotation-site-targets.mjs';
import {createCodexBrowserBackend} from './codex-browser-backend.mjs';
import {annotationNeedsRegionCrop,annotationDraftOwner,annotationComposerPresence,annotationUploadsPending,waitForAnnotationUploads,admitAnnotationBatch,removeAnnotationDraftsWhenReady,savedAnnotationProjection,toggleAnnotationSelection,annotationSelectionInput,annotationCommentFiles} from './codex-annotation-submission.mjs';
const supportedStyleProperties=new Set(['color','background-color','font-family','font-size','font-weight','line-height','width','height','opacity','border-radius','border-color','border-width','flex-direction','justify-content','align-items','gap','row-gap','column-gap','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius']);
const sitePermissionMessages=Object.fromEntries(['allow','block','enterTitleForSite','toggleTitleForSite','summaryWithDomain'].map(key=>[key,values=>(CODEX_CU_COPY['thread.browser.siteAnnotationPermission.'+key]?.simplifiedChinese??CODEX_CU_COPY['thread.browser.siteAnnotationPermission.'+key]?.english??'').replace(/\{(\w+)\}/g,(text,name)=>values?.[name]??text)]));
const sameVirtualAnchor=(actual,saved)=>!!actual&&!!saved&&actual.kind==='virtual'&&saved.kind==='virtual'&&actual.pageUrl===saved.pageUrl&&actual.surfaceId===saved.surfaceId&&actual.targetId===saved.targetId&&actual.frameUrl===saved.frameUrl&&JSON.stringify(actual.framePath)===JSON.stringify(saved.framePath);
const isVirtualEditor=active=>!!active&&(active.editorState?.anchor?.kind==='virtual'||!!active.virtualSelectionKey);

// Same snt/bi card chrome in the actual frozen editor and the isolated design
// example. Contents and draft/native lifecycle are supplied by their owner.
export const CodexAnnotationInspector=React.forwardRef(function CodexAnnotationInspector({styleOpen=false,className='',children,...props},ref){
  return <aside {...props} ref={ref} className={'tx-cu-annotation-inspector'+(styleOpen?' is-style-open':'')+(className?' '+className:'')}>{children}</aside>;
});

export function PageAnnotation({ sessionId, frame, target, inputActions, inputState, submitAvailable, submitDirectAnnotation, conversation, api, compact=false }) {
  const [snapshot,setSnapshot]=useState(null),[region,setRegion]=useState(null),[comment,setComment]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [mode,setMode]=useState('region'),[element,setElement]=useState(null),[loading,setLoading]=useState(false);
  const [textSelection,setTextSelection]=useState(null);
  const [virtualSelection,setVirtualSelection]=useState(null);
  const [hovered,setHovered]=useState(null),[busyAction,setBusyAction]=useState(''),[hoverPoint,setHoverPoint]=useState(null);
  const [annotationFlow,setAnnotationFlow]=useState('batch'),[additionalSelections,setAdditionalSelections]=useState([]),[dragSelection,setDragSelection]=useState(null),[selectionModifier,setSelectionModifier]=useState(false),[linkedSelection,setLinkedSelection]=useState(null);
  const [entryMenuOpen,setEntryMenuOpen]=useState(false),[saveMenuOpen,setSaveMenuOpen]=useState(false);const entryButton=useRef(null),originalRequest=useRef(Promise.resolve()),originalRevision=useRef(0),originalHeld=useRef(false);
  const [liveEditor,setLiveEditor]=useState(null),[editorControls,setEditorControls]=useState(null),[selectionPoint,setSelectionPoint]=useState(null);const controlEpoch=useRef(0),controlActor=useRef(null);
  const [editorOpenPlan,setEditorOpenPlan]=useState(null),openPlanRevision=useRef(0),focusedOpenPlan=useRef(null);
  const editor=useRef(null),controls=useRef(null),designPending=useRef(null),designRequest=useRef(null),designRevision=useRef(0),queueSequence=useRef(Promise.resolve());
  const [holdingOriginal,setHoldingOriginal]=useState(false),[styleOpen,setStyleOpen]=useState(false),[cardPosition,setCardPosition]=useState(null),[controlEditing,setControlEditing]=useState(false);
  const card=useRef(null),cardDrag=useRef(null);const [toolbarPosition,setToolbarPosition]=useState(null);
  const [readyImageSource,setReadyImageSource]=useState('');
  const [contentHost,setContentHost]=useState(null),[contentSize,setContentSize]=useState({width:0,height:0});
  const [queue,setQueueState]=useState({entries:[],comments:[],pendingAnnotationCount:0,undeliveredCount:0}),[editingId,setEditingId]=useState(null),[markersVisible,setMarkersVisible]=useState(true),[addModifier,setAddModifier]=useState(false),[discardOpen,setDiscardOpen]=useState(false),[savedListOpen,setSavedListOpen]=useState(false),[draftRegistryRevision,setDraftRegistryRevision]=useState(0);
  const currentInput=useRef(inputState);currentInput.current=inputState;
  const currentFrame=useRef(frame);currentFrame.current=frame;
  const currentSubmitAvailable=useRef(submitAvailable);currentSubmitAvailable.current=submitAvailable;
  const [composerBlock,setComposerBlock]=useState();
  const [recoveryNeeded,setRecoveryNeeded]=useState(false);
  const [siteOpening,setSiteOpening]=useState(false),[siteRequestRevision,setSiteRequestRevision]=useState(0);
  const siteDelivery=useRef(null),siteEditorOwner=useRef(null),siteHandled=useRef(null),siteUi=useRef(null);
  const composerBusy=inputState?.phase==='adjudicating'||inputState?.phase==='submitting';
  const uploadsPending=!!conversation&&!!inputState&&annotationUploadsPending(conversation,inputState.attachmentIds);
  const draftOwner=conversation?annotationDraftOwner(conversation,sessionId,target?.browserId,target?.id):null;
  const synchronized=useRef(null),syncRequest=useRef(null);
  const busyRef=useRef(busy);busyRef.current=busy;
  const dialog=useRef(null),image=useRef(null),drag=useRef(null),opener=useRef(null),epoch=useRef(0),request=useRef(null),activeSession=useRef(sessionId);activeSession.current=sessionId;
  const setQueue=result=>{setQueueState(result);if(typeof result.isTweaksEditorOpen==='boolean'){setStyleOpen(result.isTweaksEditorOpen);if(!result.isTweaksEditorOpen)setControlEditing(false);}};
  useEffect(()=>{epoch.current++;request.current?.abort();syncRequest.current?.abort();synchronized.current=null;editor.current=null;controls.current=null;designPending.current=null;designRevision.current++;controlActor.current=null;controlEpoch.current=0;setLiveEditor(null);setEditorControls(null);setSnapshot(null);setContentHost(null);setBusy(false);setBusyAction('');setLoading(false);setError('');setRegion(null);setEditingId(null);setDiscardOpen(false);setQueue({entries:[],comments:[],pendingAnnotationCount:0});setControlEditing(false);drag.current=null;return()=>{epoch.current++;request.current?.abort();syncRequest.current?.abort();};},[sessionId,target?.id,target?.browserId]);
  const scope=()=>{const actual=currentFrame.current?.tabId===target?.id?currentFrame.current:frame;return{browserId:target?.browserId,actor:actual?.actor&&(actual.controlEpoch??0)>=controlEpoch.current?actual.actor:controlActor.current??actual?.actor,tabId:target?.id,controlEpoch:Math.max(controlEpoch.current,actual?.controlEpoch??0)};};
  const acceptControl=result=>{if(result.actor!=null)controlActor.current=result.actor;if(result.controlEpoch!=null)controlEpoch.current=result.controlEpoch;};
  const siteTransitionOwner=siteDelivery.current??siteEditorOwner.current,ownSiteTransition=siteTransitionOwner?.ownDesignTransition;
  // userBrowserAction advances exactly one epoch for this dispatched begin.
  // Its HTTP completion can precede the stream's matching non-transition frame.
  const ownSiteDesignTransition=!!ownSiteTransition&&siteTransitionOwner.epoch===epoch.current&&!siteTransitionOwner.controller.signal.aborted
    &&siteTransitionOwner.request.kind==='annotation'&&siteTransitionOwner.editorOpenPlan?.canEditDesign===true&&siteTransitionOwner.editorOpenPlan.defaultDesignEditorOpen===true
    &&siteTransitionOwner.identity===JSON.stringify([sessionId,target?.browserId,target?.id,frame?.loaderId])
    &&siteTransitionOwner.loaderId===frame?.loaderId&&frame?.tabId===target?.id&&frame?.actor===ownSiteTransition.actor
    &&Number.isSafeInteger(ownSiteTransition.controlEpoch)&&frame?.controlEpoch===ownSiteTransition.controlEpoch+1;
  const siteAvailable=!!api&&!!conversation&&typeof inputActions?.addAttachments==='function'&&typeof inputActions?.removeAttachment==='function'&&!!inputState&&submitAvailable!==false&&!composerBusy&&!!target?.browserId&&!target?.detached&&frame?.tabId===target?.id&&!!frame?.loaderId&&!!frame?.actor&&frame?.browserUseActive!==true&&frame?.resuming!==true&&(!frame?.transitioning||ownSiteDesignTransition);
  const siteBridge=useCodexAnnotationSite({api,sessionId,frame,browserId:target?.browserId,tabId:target?.id,scope,available:siteAvailable,editorOpen:!!snapshot,hasActiveEditor:!!region||editingId!=null||!!liveEditor?.active||busy||loading||siteOpening,onControl:acceptControl,onError:setError});
  siteUi.current={bridge:siteBridge,available:siteAvailable,snapshot,region,busy,loading,imageReady:false};
  const rejectSiteDelivery=(token=siteDelivery.current,{closeEditor=true}={})=>{
    if(!token||siteDelivery.current!==token)return;
    siteDelivery.current=null;token.controller.abort();setSiteOpening(false);setSiteRequestRevision(value=>value+1);
    if(token.ownsBusy&&token.epoch===epoch.current){busyRef.current=false;setBusy(false);setBusyAction('');setLoading(false);}
    const actual=siteUi.current.bridge.identity===token.identity?scope():token.scope;
    void api('annotation-site',token.sessionId,{...actual,loaderId:token.loaderId,action:'ack',id:token.id,accepted:false}).catch(()=>{});
    if(closeEditor&&token.opened&&siteEditorOwner.current===token)close();
  };
  const queueRequest=(action,value={},signal)=>{
    const revision=epoch.current;
    const work=queueSequence.current.catch(()=>{}).then(async()=>{
      if(revision!==epoch.current||signal?.aborted||activeSession.current!==sessionId)throw new DOMException('批注请求已经失效','AbortError');
      const result=await api('annotation-queue',sessionId,{...scope(),...value,action},signal);
      if(revision!==epoch.current||signal?.aborted||activeSession.current!==sessionId)throw new DOMException('批注请求已经失效','AbortError');
      acceptControl(result);return result;
    });queueSequence.current=work.catch(()=>{});return work;
  };
  const acceptLiveEditor=(result,{syncControls=true}={})=>{
    const live=result.liveEditor;if(live===undefined)return;
    editor.current=live;setLiveEditor(live);
    if(syncControls){controls.current=live.active?.editorState??null;setEditorControls(controls.current);}
    if(live.frame)setSnapshot(previous=>({...previous,sessionId,frame:live.frame,elements:live.elements??[],truncated:live.truncated,browserId:target.browserId,...(live.virtualSelection!==undefined?{virtualSelection:live.virtualSelection}:{})}));
    if(live.virtualSelection!==undefined){setVirtualSelection(live.virtualSelection);if(live.virtualSelection&&live.frame)applyFrozenVirtual(live.virtualSelection,live.frame);}
    if(isVirtualEditor(live.active))setElement(null);
    if(live.element){setElement(live.element);if(live.element.region)setRegion(live.element.region);}
  };
  const drainDesignUpdates=()=>{
    if(designRequest.current)return designRequest.current;
    const revision=epoch.current;
    const work=(async()=>{
      while(designPending.current&&revision===epoch.current){
        const pending=designPending.current;designPending.current=null;
        const active=editor.current?.active;if(!active||active.editorId!==pending.editorId)continue;
        const result=await queueRequest('design-update',{editorId:active.editorId,...(pending.changes!==undefined?{changes:pending.changes}:{}),...(pending.textValue!==undefined?{textValue:pending.textValue}:{}),...(pending.annotationControlChanges!==undefined?{annotationControlChanges:pending.annotationControlChanges}:{})});
        if(pending.revision===designRevision.current&&editor.current?.active?.editorId===pending.editorId){setQueue(result);acceptLiveEditor(result);}
        else if(editor.current?.active?.editorId===pending.editorId)editor.current={...editor.current,active:result.liveEditor?.active??editor.current.active};
      }
    })();const tracked=work.finally(()=>{if(designRequest.current===tracked){designRequest.current=null;if(designPending.current&&revision===epoch.current)void drainDesignUpdates();}});designRequest.current=tracked;
    void tracked.catch(e=>{if(revision===epoch.current&&e.name!=='AbortError')setError(e.message);});return tracked;
  };
  const flushDesignUpdates=async()=>{while(designRequest.current||designPending.current)await drainDesignUpdates();};
  const updateDesignControls=next=>{
    const active=editor.current?.active;if(!active||busyRef.current||active.editorId!==liveEditor?.active?.editorId||editorRevision!==epoch.current||activeSession.current!==snapshot?.sessionId)return;
    controls.current=next;setEditorControls(next);setError('');
    const isVirtual=isVirtualEditor(active),changes=isVirtual?undefined:Object.fromEntries(next.declarations.filter(value=>supportedStyleProperties.has(value.property)&&value.value.trim()&&value.value.trim()!==value.previousValue.trim()).map(value=>[value.property,value.value.trim()]));
    designPending.current={editorId:active.editorId,revision:++designRevision.current,...(!isVirtual?{changes,...(next.text?{textValue:next.text.value}:{})}:{}),...(next.annotationControls&&active.canEditAnnotationControls===true?{annotationControlChanges:(next.annotationControlChanges??[]).map(({callback,value})=>({callback,value}))}:{})};
    void drainDesignUpdates();
  };
  useEffect(()=>conversation?.fileUploads?.subscribe(()=>setDraftRegistryRevision(value=>value+1)),[conversation]);
  useEffect(()=>{const store=conversation?.blocks?.storeFor(sessionId),update=()=>setComposerBlock(store?.getSnapshot());update();return store?.subscribe(update);},[conversation,sessionId]);
  useEffect(()=>{
    if(!snapshot)return;
    const update=event=>{setAddModifier(/Mac|iPhone|iPad/.test(navigator.platform)?event.metaKey:event.ctrlKey);setSelectionModifier(event.shiftKey);},reset=()=>{setAddModifier(false);setSelectionModifier(false);};
    window.addEventListener('keydown',update,true);window.addEventListener('keyup',update,true);window.addEventListener('blur',reset);
    return()=>{window.removeEventListener('keydown',update,true);window.removeEventListener('keyup',update,true);window.removeEventListener('blur',reset);};
  },[!!snapshot]);
  useEffect(()=>{
    if(!api||!inputActions||!draftOwner||!frame?.actor||frame.tabId!==target?.id||!inputState||busy||loading||composerBusy||draftOwner.pendingAck)return;
    removeAnnotationDraftsWhenReady(draftOwner,[],inputActions,conversation);
    if(!queue.entries.some(entry=>entry.attachmentIds.length))return;
    const presence=annotationComposerPresence(draftOwner,queue.entries,inputState,conversation);
    const key=JSON.stringify([sessionId,target.browserId,target.id,queue.revision,presence.attachmentIds]);if(synchronized.current===key)return;synchronized.current=key;
    const controller=new AbortController(),revision=epoch.current;syncRequest.current?.abort();syncRequest.current=controller;
    void queueRequest('sync-composer',{attachmentIds:presence.attachmentIds},controller.signal).then(result=>{
      if(controller.signal.aborted||revision!==epoch.current||activeSession.current!==sessionId)return;
      setQueue(result);setRecoveryNeeded(presence.needsMirror);
      if(presence.needsMirror)void recoverAnnotations(result);
    }).catch(()=>{if(!controller.signal.aborted)synchronized.current=null;});
    return()=>controller.abort();
  },[api,inputActions,conversation,inputState?.attachmentIds,inputState?.phase,draftRegistryRevision,busy,loading,queue.revision,sessionId,target?.id,target?.browserId,frame?.actor,frame?.controlEpoch]);
  useEffect(()=>{
    if(!contentHost||!snapshot)return;
    const measure=()=>setContentSize({width:contentHost.clientWidth,height:contentHost.clientHeight});
    const observer=new ResizeObserver(measure);observer.observe(contentHost);measure();
    dialog.current?.querySelector('button')?.focus({preventScroll:true});
    return()=>observer.disconnect();
  },[contentHost,!!snapshot]);
  const close=()=>{const pending=siteDelivery.current;if(pending&&!(pending.request.kind==='mode'&&pending.request.interactionMode==='browse'))rejectSiteDelivery(pending,{closeEditor:false});siteEditorOwner.current=null;epoch.current++;openPlanRevision.current++;setEditorOpenPlan(null);request.current?.abort();editor.current=null;controls.current=null;designPending.current=null;designRevision.current++;setLiveEditor(null);setEditorControls(null);setSnapshot(null);setContentHost(null);setBusy(false);setBusyAction('');setLoading(false);setHovered(null);setControlEditing(false);setSavedListOpen(false);drag.current=null;if(opener.current?.isConnected)opener.current.focus({preventScroll:true});};
  const initializeEditor=(host,flow,actor)=>{
    openPlanRevision.current++;setEditorOpenPlan(null);
    setEntryMenuOpen(false);setContentHost(host);setSavedListOpen(false);setAnnotationFlow(flow);setAdditionalSelections([]);setDragSelection(null);setSelectionModifier(false);setLinkedSelection(null);
    const revision=++epoch.current;editor.current=null;controls.current=null;designPending.current=null;designRevision.current++;originalHeld.current=false;originalRevision.current++;setLiveEditor(null);setEditorControls(null);setRegion(null);setSelectionPoint(null);setElement(null);setTextSelection(null);setVirtualSelection(null);setEditingId(null);setHovered(null);setHoverPoint(null);setReadyImageSource('');controlEpoch.current=0;controlActor.current=actor;setMode('region');setComment('');setError('');setStyleOpen(false);setCardPosition(null);setHoldingOriginal(false);setControlEditing(false);setToolbarPosition(null);setAddModifier(false);
    return revision;
  };
  const open=async(event,flow='batch')=>{
    if(!frame||frame.tabId!==target?.id||siteDelivery.current)return;
    const host=(entryButton.current??event.currentTarget).closest('.tx-cu-pane-browser')?.querySelector('.tx-cu-live');
    if(!host){setError('请先打开对应网页画面，再进行批注。');return;}
    opener.current=entryButton.current?.querySelector('button')??event.currentTarget;siteEditorOwner.current=null;
    const revision=initializeEditor(host,flow,frame.actor);
    setSnapshot({sessionId,frame:{...frame},browserId:target.browserId});
    if(api){
      request.current?.abort();const controller=new AbortController();request.current=controller;setLoading(true);
      try{const result=await api('annotation',sessionId,scope(),controller.signal);if(revision!==epoch.current||controller.signal.aborted)return;acceptControl(result);setSnapshot({sessionId,...result,browserId:target.browserId});
        if(draftOwner.pendingAck){const accepted=await queueRequest('ack',draftOwner.pendingAck,controller.signal);if(revision!==epoch.current||controller.signal.aborted)return;removeAnnotationDraftsWhenReady(draftOwner,accepted.removedAttachmentIds??[],inputActions,conversation);draftOwner.pendingAck=null;}
        const saved=await queueRequest('enter',{annotationFlow:flow},controller.signal);if(revision===epoch.current&&!controller.signal.aborted){setQueue(saved);acceptLiveEditor(saved);const actual=saved.hasQueuedTweaks?await refreshFrozenView(controller):result;if(actual.textSelection)selectFrozenText(actual);}
      }
      catch(e){if(revision===epoch.current&&!controller.signal.aborted)setError(e.message);}
      finally{if(revision===epoch.current)setLoading(false);}
    }
  };
  const point=event=>{const box=event.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))};};
  const select=event=>{if(!drag.current)return null;const end=point(event),start=drag.current.start;const next={kind:'region',point:end,region:{x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(start.x-end.x),height:Math.abs(start.y-end.y)}};setDragSelection(next);return next;};
  const editingEntry=queue.entries.find(entry=>entry.id===editingId);
  const savedScreenshot=editingEntry&&!liveEditor?.active&&!savedAnnotationProjection(editingEntry,snapshot)?editingEntry.comment.localBrowserScreenshot:null;
  const displayedFrame=savedScreenshot?{mediaType:'image/png',data:savedScreenshot.dataUrl.slice('data:image/png;base64,'.length)}:snapshot?.frame;
  const imageSource=displayedFrame?'data:'+displayedFrame.mediaType+';base64,'+displayedFrame.data:'';
  const imageReady=!!imageSource&&readyImageSource===imageSource;
  siteUi.current.imageReady=imageReady;
  const focusEditorIfExternal=()=>{
    const root=dialog.current;if(!root||root.contains(root.ownerDocument.activeElement))return;
    const field=root.querySelector('.tx-cu-annotation-comment textarea:not(:disabled)')??root.querySelector('button:not(:disabled)');field?.focus({preventScroll:true});
  };
  useEffect(()=>{
    if(!editorOpenPlan||busy||loading||!imageReady||!region||!card.current||focusedOpenPlan.current===openPlanRevision.current)return;
    focusedOpenPlan.current=openPlanRevision.current;focusEditorIfExternal();
  },[editorOpenPlan,busy,loading,imageReady,!!region]);
  const activeTargetMissing=!!liveEditor?.active&&(isVirtualEditor(liveEditor.active)?!liveEditor.virtualSelection?.viewportRect||!liveEditor.virtualSelection?.viewportPoint:!liveEditor.element);
  const selectedPolygon=savedScreenshot||activeTargetMissing?null:element?.polygon;
  const displayedAdditional=additionalSelections.map(selection=>{
    if(!liveEditor?.active||!selection.element)return selection;
    const actual=snapshot?.elements?.find(value=>value.key===selection.element.key);return actual?{...selection,element:actual,region:actual.region}:null;
  });
  const textChanged=!!editorControls?.text&&editorControls.text.value!==editorControls.text.previousValue;
  const designChanged=!!editorControls&&(editorControls.declarations.some(value=>supportedStyleProperties.has(value.property)&&value.value.trim()&&value.value.trim()!==value.previousValue.trim())||textChanged||(editorControls.annotationControlChanges??[]).some(value=>value.value!==value.previousValue));
  const resolvePickedElement=(raw,start,frozen)=>{
    if(!raw)return null;
    const geometry=frozen?.frame?.geometry;
    if(raw.siteAnnotationTarget&&start&&(!geometry||!Number.isFinite(geometry.width)||!Number.isFinite(geometry.height)||!Number.isFinite(geometry.offsetX)||!Number.isFinite(geometry.offsetY)))return null;
    const plan=raw.siteAnnotationTarget,mappedKey=resolveAnnotationSiteTarget(plan,start&&geometry?{x:geometry.offsetX+start.x*geometry.width,y:geometry.offsetY+start.y*geometry.height}:undefined);
    if(mappedKey===undefined)return raw;if(mappedKey===null)return null;
    const actual=frozen?.elements?.find(value=>value.key===mappedKey);if(!actual)return null;
    return plan.kind!=='ordinary'||plan.usesSelectableContainer||mappedKey!==raw.key?{...actual,siteAnnotationSourceKey:raw.key}:actual;
  };
  const pick=start=>{
    const raw=(snapshot?.elements??[]).filter(e=>e.polygon?pointInPolygon(start,e.polygon):start.x>=e.region.x&&start.x<=e.region.x+e.region.width&&start.y>=e.region.y&&start.y<=e.region.y+e.region.height).sort(compareAnnotationPaint)[0]??null;
    const selected=resolvePickedElement(raw,start,snapshot);return selected?{element:selected,sourceKey:raw.key}:null;
  };
  const clearSelection=()=>{openPlanRevision.current++;setEditorOpenPlan(null);drag.current=null;setDragSelection(null);setAdditionalSelections([]);setLinkedSelection(null);setRegion(null);setSelectionPoint(null);setElement(null);setTextSelection(null);setVirtualSelection(null);setEditingId(null);setComment('');setHovered(null);controls.current=null;setEditorControls(null);setStyleOpen(false);setCardPosition(null);setControlEditing(false);};
  const primarySelection=region&&selectionPoint?{kind:virtualSelection?'virtual':textSelection?'text':element?'element':'region',virtualSelection,textSelection,element,region,point:selectionPoint}:null;
  const selectFrozenText=(frozen,{plan=true}={})=>{
    const selected=frozen.textSelection;if(!selected)return;const geometry=frozen.frame.geometry,rect=selected.viewportRect;
    const region={x:(rect.x-geometry.offsetX)/geometry.width,y:(rect.y-geometry.offsetY)/geometry.height,width:rect.width/geometry.width,height:rect.height/geometry.height},point={x:(selected.viewportPoint.x-geometry.offsetX)/geometry.width,y:(selected.viewportPoint.y-geometry.offsetY)/geometry.height};
    clearSelection();setTextSelection(selected);setRegion(region);setSelectionPoint(point);
    if(plan)void applySelectionOpenPlan(frozen,{primary:{kind:'text',textSelection:selected,region,point},additional:[]}).catch(()=>{});
  };
  const applyFrozenVirtual=(selected,actualFrame)=>{
    const geometry=actualFrame.geometry,rect=selected.viewportRect,point=selected.viewportPoint;
    if(!rect||!point)return;
    setElement(null);setTextSelection(null);setVirtualSelection(selected);setRegion({x:(rect.x-geometry.offsetX)/geometry.width,y:(rect.y-geometry.offsetY)/geometry.height,width:rect.width/geometry.width,height:rect.height/geometry.height});setSelectionPoint({x:(point.x-geometry.offsetX)/geometry.width,y:(point.y-geometry.offsetY)/geometry.height});
  };
  const setSelections=result=>{
    if(!result){clearSelection();return;}
    openPlanRevision.current++;setEditorOpenPlan(null);
    if(result.primary.element?.key!==element?.key||result.primary.kind!==primarySelection?.kind){controls.current=null;setEditorControls(null);setStyleOpen(false);}
    setElement(result.primary.element??null);setTextSelection(result.primary.textSelection??null);setVirtualSelection(result.primary.virtualSelection??null);setRegion(result.primary.region);setSelectionPoint(result.primary.point);setAdditionalSelections(result.additional);setEditingId(null);setLinkedSelection(null);
  };
  const chooseSelection=(next,append,{plan=true}={})=>{if(!append)clearSelection();const selected=toggleAnnotationSelection(append?primarySelection:null,append?additionalSelections:[],next,append);setSelections(selected);if(plan&&selected)void applySelectionOpenPlan(snapshot,selected).catch(()=>{});return selected;};
  const cancelActiveEditor=async(controller,{preserveSelection=false}={})=>{
    const active=editor.current?.active;if(!active)return null;
    designPending.current=null;designRevision.current++;await designRequest.current?.catch(()=>{});await originalRequest.current.catch(()=>{});
    if(originalHeld.current){originalHeld.current=false;setHoldingOriginal(false);const unheld=await queueRequest('hold-original',{enabled:false},controller.signal);setQueue(unheld);acceptLiveEditor(unheld,{syncControls:false});}
    const result=await queueRequest('design-cancel',{editorId:active.editorId},controller.signal);setQueue(result);acceptLiveEditor(result);
    if(result.liveEditor?.frame&&!preserveSelection)return{frame:result.liveEditor.frame,elements:result.liveEditor.elements??[],truncated:result.liveEditor.truncated,textSelection:result.liveEditor.textSelection,virtualSelection:result.liveEditor.virtualSelection};
    return refreshFrozenView(controller,{preserveSelection});
  };
  const beginDesign=async(controller,{frozen=snapshot,selected=element,virtual=null,point=selectionPoint,commentId=editingId,additional=additionalSelections}={})=>{
    const result=await queueRequest('design-begin',{sourceFrameId:frozen.frame.id,selectionPoint:point,
      ...(virtual?{virtualSelectionKey:virtual.key}:{elementKey:selected.key,...(selected.siteAnnotationSourceKey?{siteAnnotationSourceKey:selected.siteAnnotationSourceKey}:{})}),
      ...(commentId?{commentId}:{}),...(additional.length?{additionalSelections:additional.map(annotationSelectionInput)}:{})},controller.signal);
    if(!result.liveEditor?.active)throw new Error('网页没有建立实时编辑会话');
    setQueue(result);acceptLiveEditor(result);setHovered(null);return result;
  };
  const restoreSavedVirtualDesign=async(controller,commentId)=>{
    const result=await queueRequest('design-begin',{commentId},controller.signal);
    if(!isVirtualEditor(result.liveEditor?.active)||result.liveEditor.virtualSelection?.geometrySource!=='saved-virtual-anchor')throw new Error('图形批注没有恢复原始编辑记忆');
    setQueue(result);acceptLiveEditor(result);setHovered(null);return result;
  };
  const acceptOpenPlan=result=>{
    const plan=result.editorOpenPlan;
    if(!plan||!['canEditDesign','defaultDesignEditorOpen','pageRequestedDesignEditor'].every(key=>typeof plan[key]==='boolean'))throw new Error('浏览器没有返回真实编辑器打开状态');
    setQueue(result);setEditorOpenPlan(plan);return plan;
  };
  const applySelectionOpenPlan=async(frozen,chosen,controller=new AbortController())=>{
    const revision=epoch.current,selectionRevision=++openPlanRevision.current,primary=chosen.primary;
    try{
      const result=await queueRequest('editor-open-plan',{sourceFrameId:frozen.frame.id,selectionPoint:primary.point,
        ...(primary.virtualSelection?{virtualSelectionKey:primary.virtualSelection.key}:primary.textSelection?{textSelectionKey:primary.textSelection.key}:primary.element?{elementKey:primary.element.key,...(primary.element.siteAnnotationSourceKey?{siteAnnotationSourceKey:primary.element.siteAnnotationSourceKey}:{})}:{region:primary.region}),
        ...(chosen.additional.length?{additionalSelections:chosen.additional.map(annotationSelectionInput)}:{})},controller.signal);
      if(revision!==epoch.current||selectionRevision!==openPlanRevision.current||controller.signal.aborted)return;
      const plan=acceptOpenPlan(result);
      if(!plan.canEditDesign||!plan.defaultDesignEditorOpen){setStyleOpen(false);return;}
      if(!primary.element&&!primary.virtualSelection?.key)throw new Error('当前批注目标没有真实设计控件');
      await beginDesign(controller,{frozen,selected:primary.element??null,virtual:primary.virtualSelection??null,point:primary.point,commentId:null,additional:chosen.additional});
    }catch(error){if(revision===epoch.current&&selectionRevision===openPlanRevision.current&&!controller.signal.aborted&&error.name!=='AbortError')setError(error.message);throw error;}
  };
  const toggleDesignPanel=async()=>{
    if(busyRef.current)return;
    if(styleOpen||editor.current?.active){
      const revision=epoch.current,open=!styleOpen;
      try{const result=await queueRequest('tweaks-open',{open});if(revision!==epoch.current)return;if(typeof result.isTweaksEditorOpen!=='boolean')throw new Error('浏览器没有返回真实调整面板状态');setQueue(result);}
      catch(error){if(revision===epoch.current&&error.name!=='AbortError')setError(error.message);}
      return;
    }
    if(!element&&(!virtualSelection?.key||!virtualSelection.annotationControls?.controls.length))return;
    const revision=epoch.current,controller=new AbortController();request.current?.abort();request.current=controller;busyRef.current=true;setBusy(true);setBusyAction('design-begin');setError('');
    try{await beginDesign(controller,{virtual:virtualSelection});const result=await queueRequest('tweaks-open',{open:true},controller.signal);if(typeof result.isTweaksEditorOpen!=='boolean')throw new Error('浏览器没有返回真实调整面板状态');setQueue(result);}
    catch(e){if(revision===epoch.current&&!controller.signal.aborted)setError(e.message);}
    finally{if(revision===epoch.current){busyRef.current=false;setBusy(false);setBusyAction('');}}
  };
  const cancelSelection=async()=>{
    if(busyRef.current)return;
    if(!editor.current?.active){if(virtualSelection&&!editingId)await clearVirtualSurface();else clearSelection();return;}
    const revision=epoch.current,controller=new AbortController();request.current?.abort();request.current=controller;busyRef.current=true;setBusy(true);setBusyAction('design-cancel');setError('');
    try{const fresh=await cancelActiveEditor(controller);clearSelection();return fresh;}
    catch(e){if(revision===epoch.current&&!controller.signal.aborted)setError(e.message);}
    finally{if(revision===epoch.current){busyRef.current=false;setBusy(false);setBusyAction('');}}
  };
  const clearVirtualSurface=async()=>{
    if(!virtualSelection||busyRef.current)return;
    const revision=epoch.current,controller=new AbortController();request.current?.abort();request.current=controller;busyRef.current=true;setBusy(true);setBusyAction('select');setError('');
    try{const result=await queueRequest('clear-surface',{},controller.signal);if(revision!==epoch.current||controller.signal.aborted)return;setQueue(result);setSnapshot({sessionId,...result.snapshot,browserId:target.browserId});clearSelection();return result.snapshot;}
    catch(e){if(revision===epoch.current&&!controller.signal.aborted)setError(e.message);}
    finally{if(revision===epoch.current){busyRef.current=false;setBusy(false);setBusyAction('');}}
  };
  const chooseMode=async next=>{if(editor.current?.active){await cancelSelection();if(editor.current?.active)return;}else if(virtualSelection){const fresh=await clearVirtualSurface();if(!fresh)return;}else if(textSelection||editingId)clearSelection();setMode(next);};
  const chooseFrozenText=async()=>{if(editor.current?.active){const fresh=await cancelSelection();if(fresh?.textSelection)selectFrozenText(fresh);else if(fresh)setError('文字选择已经改变，请重新选择');}else if(virtualSelection){const fresh=await clearVirtualSurface();if(fresh)selectFrozenText(fresh);}else selectFrozenText(snapshot);};
  const selectElement=async(selected,start,append,sourceKey=selected.key)=>{
    if(!api||busyRef.current||append&&(textSelection||virtualSelection))return;
    const revision=epoch.current,controller=new AbortController();request.current?.abort();request.current=controller;busyRef.current=true;setBusy(true);setBusyAction('select');setError('');
    try{
      const relative={x:(start.x-selected.region.x)/selected.region.width,y:(start.y-selected.region.y)/selected.region.height};
      const restored=await cancelActiveEditor(controller);
      if(restored){
        const previous=restored.elements.find(value=>value.key===selected.key);append=false;clearSelection();if(!previous)throw new Error('所选元素已经离开页面，请重新选择');
        start={x:previous.region.x+relative.x*previous.region.width,y:previous.region.y+relative.y*previous.region.height};
        selected=resolvePickedElement(restored.elements.find(value=>value.key===sourceKey),start,restored);if(!selected)throw new Error('当前目标不可批注，请重新选择');
      }
      const result=await queueRequest('select-surface',{sourceFrameId:restored?.frame.id??snapshot.frame.id,elementKey:selected.key,selectionPoint:start,append},controller.signal);if(revision!==epoch.current||controller.signal.aborted)return;
      if(result.status==='virtual-multi')return;
      let fresh=result.snapshot;
      if(result.status==='not-registered'&&virtualSelection){const cleared=await queueRequest('clear-surface',{},controller.signal);setQueue(cleared);fresh=cleared.snapshot;}
      if(fresh)setSnapshot({sessionId,...fresh,browserId:target.browserId});
      if(result.status==='hit'){
        const actual=fresh.virtualSelection,geometry=fresh.frame.geometry;clearSelection();applyFrozenVirtual(actual,fresh.frame);
        await applySelectionOpenPlan(fresh,{primary:{kind:'virtual',virtualSelection:actual,point:{x:(actual.viewportPoint.x-geometry.offsetX)/geometry.width,y:(actual.viewportPoint.y-geometry.offsetY)/geometry.height}},additional:[]},controller);
        return;
      }
      if(result.status==='empty'){clearSelection();return;}
      const actual=fresh?resolvePickedElement(fresh.elements.find(value=>value.key===sourceKey),start,fresh):selected;if(!actual)throw new Error('所选元素已经离开页面或不可批注，请重新选择');
      const next={kind:'element',element:actual,region:actual.region,point:start};
      let chosen;if(virtualSelection){clearSelection();chosen={primary:next,additional:[]};setSelections(chosen);}else chosen=chooseSelection(next,append,{plan:false});
      if(!chosen)clearSelection();else await applySelectionOpenPlan(fresh??restored??snapshot,chosen,controller);
    }catch(e){if(revision===epoch.current&&!controller.signal.aborted)setError(e.message);}
    finally{if(revision===epoch.current){busyRef.current=false;setBusy(false);setBusyAction('');}}
  };
  const removeSelection=index=>{const selection=[primarySelection,...additionalSelections][index];if(editor.current?.active){if(index===0)void cancelSelection();return;}if(selection&&!editingId){if(selection.kind==='virtual'){void clearVirtualSurface();return;}if(selection.kind==='text'){clearSelection();return;}const chosen=toggleAnnotationSelection(primarySelection,additionalSelections,selection,true);setSelections(chosen);if(chosen)void applySelectionOpenPlan(snapshot,chosen).catch(()=>{});}};
  const updateSiteControl=(callback,value)=>{
    const current=controls.current,control=current?.annotationControls?.controls.find(control=>control.callback===callback);if(!control||editor.current?.active?.canEditAnnotationControls!==true)return;
    const existing=current.annotationControlChanges?.find(change=>change.callback===callback),change={callback,previousValue:existing?existing.previousValue:control.currentValue,value};
    updateDesignControls({...current,annotationControlChanges:existing?current.annotationControlChanges.map(previous=>previous.callback===callback?change:previous):[...(current.annotationControlChanges??[]),change]});
  };
  const resetSiteControl=callback=>{const current=controls.current,control=current?.annotationControls?.controls.find(control=>control.callback===callback);if(control){const change=codexAnnotationSiteChange(current,control);updateSiteControl(callback,change.previousValue??codexAnnotationSiteDefaultValue(control));}};
  const resetStyles=()=>{
    const current=controls.current;if(!current)return;
    const resetChanges=(current.annotationControlChanges??[]).map(change=>{const control=current.annotationControls?.controls.find(value=>value.callback===change.callback);return control&&editor.current?.active?.canEditAnnotationControls===true?{...change,value:change.previousValue??codexAnnotationSiteDefaultValue(control)}:change;});
    updateDesignControls({...current,declarations:current.declarations.map(value=>({...value,value:value.previousValue})),...(current.text?{text:{...current.text,value:current.text.previousValue}}:{}),...(current.annotationControls?{annotationControlChanges:resetChanges}:{})});
  };
  const refreshFrozenView=async(controller,{preserveSelection=false}={})=>{
    const revision=epoch.current,fresh=await api('annotation',sessionId,scope(),controller.signal);
    if(revision!==epoch.current||controller.signal.aborted)throw new DOMException('批注画面已经失效','AbortError');
    acceptControl(fresh);
    setSnapshot({sessionId,...fresh,browserId:target.browserId});
    if(!preserveSelection||!primarySelection)return fresh;
    if(textSelection){
      const actual=fresh.textSelection?.anchor,saved=textSelection.anchor;if(!actual||actual.selectedText!==saved.selectedText||JSON.stringify(actual.textLocator)!==JSON.stringify(saved.textLocator)||JSON.stringify(actual.framePath)!==JSON.stringify(saved.framePath))throw new Error('文字选择已经改变，请重新选择');
      const body=comment;selectFrozenText(fresh,{plan:false});setComment(body);if(editingId)setEditingId(editingId);return fresh;
    }
    if(virtualSelection){
      if(!fresh.virtualSelection||!sameVirtualAnchor(fresh.virtualSelection.anchor,virtualSelection.anchor))throw new Error('图形批注目标已经改变，请重新选择');
      applyFrozenVirtual(fresh.virtualSelection,fresh.frame);return fresh;
    }
    const remap=selection=>{
      if(!selection.element){const before=snapshot.frame.geometry,after=fresh.frame.geometry;return{...selection,region:{x:(selection.region.x*before.width+before.offsetX-after.offsetX)/after.width,y:(selection.region.y*before.height+before.pageY-after.pageY)/after.height,width:selection.region.width*before.width/after.width,height:selection.region.height*before.height/after.height},point:{x:(selection.point.x*before.width+before.offsetX-after.offsetX)/after.width,y:(selection.point.y*before.height+before.pageY-after.pageY)/after.height}};}
      const selected=fresh.elements.find(value=>value.key===selection.element.key);if(!selected)throw new Error('所选元素已经离开页面，请重新选择');
      const x=(selection.point.x-selection.region.x)/selection.region.width,y=(selection.point.y-selection.region.y)/selection.region.height;
      return{...selection,element:selected,region:selected.region,point:{x:selected.region.x+x*selected.region.width,y:selected.region.y+y*selected.region.height}};
    };
    const selected=remap(primarySelection),additional=additionalSelections.map(remap);setSelections({primary:selected,additional});if(editingId)setEditingId(editingId);
    return fresh;
  };
  useEffect(()=>{
    if(!snapshot||!editor.current?.active||busyRef.current||loading||frame?.tabId!==target?.id||(frame?.controlEpoch??0)<=controlEpoch.current)return;
    const revision=epoch.current,editorId=editor.current.active.editorId,controller=new AbortController();
    void queueRequest('snapshot',{},controller.signal).then(async result=>{
      if(revision!==epoch.current||controller.signal.aborted||editor.current?.active?.editorId!==editorId||result.liveEditor?.active!==null)return;
      designPending.current=null;designRevision.current++;setQueue(result);acceptLiveEditor(result);setError('');setStyleOpen(false);setControlEditing(false);await refreshFrozenView(controller,{preserveSelection:true});
    }).catch(e=>{if(revision===epoch.current&&!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[frame?.controlEpoch,frame?.tabId,busy,loading,!!snapshot,sessionId,target?.id,target?.browserId]);
  const mirrorAnnotations=async(saved,controller)=>{
    let current=saved;
    if(draftOwner.pendingAck){current=await queueRequest('ack',draftOwner.pendingAck,controller.signal);draftOwner.pendingAck=null;removeAnnotationDraftsWhenReady(draftOwner,current.removedAttachmentIds??[],inputActions,conversation);setQueue(current);}
    if(!current.entries.length)return current;
    if(!currentInput.current)throw new Error('宿主尚未提供输入区状态，批注已经保存');
    const presence=annotationComposerPresence(draftOwner,current.entries,currentInput.current,conversation);
    if(!current.undeliveredCount&&!presence?.needsMirror)return current;
    const batch=await queueRequest('prepare',{},controller.signal);
    const acknowledgement=admitAnnotationBatch(draftOwner,batch,sessionId,inputActions,currentInput.current,conversation);
    const accepted=await queueRequest('ack',acknowledgement,controller.signal);draftOwner.pendingAck=null;
    removeAnnotationDraftsWhenReady(draftOwner,accepted.removedAttachmentIds??[],inputActions,conversation);setRecoveryNeeded(false);setQueue(accepted);return accepted;
  };
  const recoverAnnotations=async saved=>{
    if(busyRef.current||composerBusy||loading)return;
    const revision=epoch.current,controller=new AbortController();request.current?.abort();request.current=controller;busyRef.current=true;setBusy(true);setBusyAction('recover');
    try{await mirrorAnnotations(saved,controller);}
    catch(e){if(revision===epoch.current&&!controller.signal.aborted)setError(e.message);}
    finally{if(revision===epoch.current){busyRef.current=false;setBusy(false);setBusyAction('');}}
  };
  const saveAnnotation=async(direct=annotationFlow==='quick'&&!editingId)=>{
    if(!api||!snapshot||!region||!selectionPoint||!imageReady||!image.current?.complete||!image.current.naturalWidth||busyRef.current)return;
    const revision=epoch.current,controller=new AbortController();request.current?.abort();request.current=controller;busyRef.current=true;setBusy(true);setBusyAction('attach');setError('');
    try{
      let result;
      await flushDesignUpdates();await originalRequest.current.catch(()=>{});
      const active=editor.current?.active;
      if(editingId&&!active)result=await queueRequest('update',{commentId:editingId,body:comment},controller.signal);
      else{
        const backend=createCodexBrowserBackend(api,snapshot.sessionId,scope());let preferences;
        try{preferences=await backend.call('profilePreferences',{},controller.signal);}catch(e){if(e.code!=='BROWSER_PROFILE_UNAVAILABLE')throw e;}
        if(revision!==epoch.current||controller.signal.aborted||activeSession.current!==snapshot.sessionId)return;
        const crop=!isVirtualEditor(active)&&!virtualSelection&&annotationNeedsRegionCrop(textSelection?'text':element?'element':'region',additionalSelections,preferences?.values?.annotationScreenshotsMode??'always');
        const submission=active?{editorId:active.editorId,body:comment,...(crop?{cropScreenshotToRegion:true}:{})}:{sourceFrameId:snapshot.frame.id,body:comment,selectionPoint,
          ...(virtualSelection?{virtualSelectionKey:virtualSelection.key}:textSelection?{textSelectionKey:textSelection.key}:element?{elementKey:element.key,...(element.siteAnnotationSourceKey?{siteAnnotationSourceKey:element.siteAnnotationSourceKey}:{})}:{region}),
          ...(additionalSelections.length?{additionalSelections:additionalSelections.map(annotationSelectionInput)}:{}),...(crop?{cropScreenshotToRegion:true}:{})};
        if(direct){
          const prepared=await queueRequest(active?'design-direct':'direct',submission,controller.signal);acceptLiveEditor(prepared);let drafts=[],fallback,delivered=false;
          try{
            const exited=await queueRequest('exit',{},controller.signal);setQueue(exited);acceptLiveEditor(exited);
            if(typeof submitDirectAnnotation!=='function'||currentSubmitAvailable.current!==true||conversation.blocks?.storeFor(sessionId).getSnapshot()!==undefined)throw new Error('当前无法直接发送，批注已保存到输入区');
            drafts=conversation.createDrafts(sessionId,annotationCommentFiles(prepared.comment,1));
            await waitForAnnotationUploads(conversation,drafts.map(draft=>draft.id),controller.signal);
            const outcome=await submitDirectAnnotation({attachmentIds:drafts.map(draft=>draft.id),signal:controller.signal});
            if(outcome?.kind!=='success')throw new Error('直接发送未被接纳，批注已保存到输入区');
            delivered=true;
            conversation.releaseDraftAttachments(drafts);
            await queueRequest('complete-direct',{directId:prepared.directId},controller.signal).catch(()=>{});close();return;
          }catch(e){
            if(controller.signal.aborted){conversation.releaseDraftAttachments(drafts);throw e;}
            if(delivered){clearSelection();throw e;}
            try{fallback=await queueRequest('save-direct-fallback',{directId:prepared.directId},controller.signal);}finally{conversation.releaseDraftAttachments(drafts);}
            setError(e.message);result=annotationFlow==='batch'?await queueRequest('enter',{annotationFlow:'batch'},controller.signal):fallback;
          }
        }else result=await queueRequest(active?'design-save':'save',submission,controller.signal);
      }
      if(revision!==epoch.current||controller.signal.aborted||activeSession.current!==snapshot.sessionId)return;
      setQueue(result);acceptLiveEditor(result);clearSelection();await mirrorAnnotations(result,controller);
      if(annotationFlow==='quick'){const exited=await queueRequest('exit',{},controller.signal);setQueue(exited);acceptLiveEditor(exited);close();}else if(active||result.hasQueuedTweaks||virtualSelection)await refreshFrozenView(controller);
    }catch(e){if(revision===epoch.current&&!controller.signal.aborted)setError(e.message);}
    finally{if(revision===epoch.current){busyRef.current=false;setBusy(false);setBusyAction('');}}
  };
  const mutateQueue=async(action,value={})=>{
    if(busyRef.current||composerBusy)return;
    const revision=epoch.current,controller=new AbortController();request.current?.abort();request.current=controller;busyRef.current=true;setBusy(true);setBusyAction(action);setError('');
    try{const hadStyles=queue.hasQueuedTweaks;await cancelActiveEditor(controller);const result=await queueRequest(action,value,controller.signal);if(revision!==epoch.current||controller.signal.aborted)return;removeAnnotationDraftsWhenReady(draftOwner,result.removedAttachmentIds??[],inputActions,conversation);setQueue(result);acceptLiveEditor(result);clearSelection();await mirrorAnnotations(result,controller);if(hadStyles||result.hasQueuedTweaks)await refreshFrozenView(controller);}
    catch(e){if(revision===epoch.current&&!controller.signal.aborted)setError(e.message);}
    finally{if(revision===epoch.current){busyRef.current=false;setBusy(false);setBusyAction('');}}
  };
  const handoff=async(send=false,saved=queue)=>{
    if(busyRef.current||loading||composerBusy||!saved.entries.length)return false;
    if(region){setError('请先保存或取消当前批注');return false;}
    const revision=epoch.current,controller=new AbortController();request.current?.abort();request.current=controller;busyRef.current=true;setBusy(true);setBusyAction('handoff');setError('');
    try{
      const accepted=await mirrorAnnotations(saved,controller);
      const presence=annotationComposerPresence(draftOwner,accepted.entries,currentInput.current,conversation);
      if(presence.inFlight)throw new Error('批注附件正在发送，请等待发送结果');
      const retained=await queueRequest('sync-composer',{attachmentIds:presence.attachmentIds},controller.signal);setQueue(retained);
      const mirrored=await mirrorAnnotations(retained,controller);
      const shouldSubmit=send&&mirrored.entries.length>0;
      if(shouldSubmit){
        if(conversation.blocks?.storeFor(sessionId).getSnapshot()!==undefined||currentSubmitAvailable.current!==true)throw new Error('输入区当前不可发送，批注已保留');
        await waitForAnnotationUploads(conversation,[...new Set([...currentInput.current.attachmentIds,...mirrored.entries.flatMap(entry=>entry.attachmentIds)])],controller.signal);
        if(conversation.blocks?.storeFor(sessionId).getSnapshot()!==undefined||currentSubmitAvailable.current!==true||['adjudicating','submitting'].includes(currentInput.current.phase))throw new Error('输入区当前不可发送，批注已保留');
        if(annotationComposerPresence(draftOwner,mirrored.entries,currentInput.current,conversation).inFlight)throw new Error('批注附件正在发送，请等待发送结果');
      }
      const exited=await queueRequest('exit',{},controller.signal);setQueue(exited);acceptLiveEditor(exited);if(shouldSubmit)inputActions.submit();close();return true;
    }catch(e){if(revision===epoch.current&&!controller.signal.aborted)setError(e.message);return false;}
    finally{if(revision===epoch.current){busyRef.current=false;setBusy(false);setBusyAction('');}}
  };
  const exitAnnotations=async(saved=queue)=>{if(busyRef.current)return false;if(region){await cancelSelection();if(editor.current?.active||annotationFlow!=='quick')return false;}const actual=saved?.entries?saved:queue;if(actual.pendingAnnotationCount)return handoff(false,actual);try{const result=await queueRequest('exit');setQueue(result);acceptLiveEditor(result);close();return true;}catch(e){setError(e.message);return false;}};
  useEffect(()=>{
    const identity=siteBridge.identity;
    return()=>{
      if(siteDelivery.current?.identity===identity)rejectSiteDelivery(siteDelivery.current);
      if(siteEditorOwner.current?.identity===identity)close();
    };
  },[siteBridge.identity]);
  useEffect(()=>{
    const token=siteDelivery.current??siteEditorOwner.current,own=token?.ownDesignTransition;
    if(own?.settled&&frame?.actor===own.actor&&frame?.controlEpoch===own.controlEpoch+1&&!frame?.transitioning){token.ownDesignTransition=null;setSiteRequestRevision(value=>value+1);}
  },[frame?.actor,frame?.controlEpoch,frame?.transitioning,siteRequestRevision]);
  useEffect(()=>{
    const token=siteDelivery.current,actual=siteBridge.state?.request;
    if(token&&(!siteAvailable||token.identity!==siteBridge.identity||(token.phase!=='acknowledging'&&actual?.id!==token.id)))rejectSiteDelivery(token);
  },[siteAvailable,siteBridge.identity,siteBridge.state?.revision,siteBridge.state?.request?.id]);
  useEffect(()=>{
    const desired=siteBridge.state?.request;
    if(!siteAvailable||!desired||siteBridge.permission||siteDelivery.current)return;
    const key=siteBridge.identity+':'+desired.id;if(siteHandled.current===key)return;siteHandled.current=key;
    const controller=new AbortController(),token={id:desired.id,identity:siteBridge.identity,loaderId:frame.loaderId,sessionId,scope:scope(),controller,request:desired,phase:'opening',epoch:epoch.current,opened:false,ownsBusy:false};
    siteDelivery.current=token;setSiteOpening(true);setSiteRequestRevision(value=>value+1);
    const valid=()=>siteDelivery.current===token&&!controller.signal.aborted&&siteUi.current.available&&siteUi.current.bridge.identity===token.identity&&siteUi.current.bridge.state?.request?.id===token.id&&token.epoch===epoch.current;
    const run=async()=>{
      try{
        if(busyRef.current||region||editingId!=null||editor.current?.active)throw new Error('当前批注尚未结束，请先保存或取消。');
        token.ownsBusy=true;busyRef.current=true;setBusy(true);setBusyAction('site-open');setLoading(true);setError('');
        const result=await siteUi.current.bridge.call('open',{id:desired.id},controller.signal);
        if(!valid()){rejectSiteDelivery(token);return;}
        if(result.request?.id!==desired.id||result.request.kind!==desired.kind||!result.queue)throw new Error('网页批注请求没有返回实际编辑状态');
        token.request=result.request;token.scope=scope();
        if(result.request.kind==='mode'&&result.request.interactionMode==='browse'){
          setQueue(result.queue);token.ownsBusy=false;busyRef.current=false;setBusy(false);setBusyAction('');setLoading(false);
          if(region||editingId!=null||editor.current?.active)throw new Error('当前批注尚未结束，请先保存或取消。');
          const exited=await exitAnnotations(result.queue);if(exited===false)throw new Error('当前无法退出批注模式');
          token.epoch=epoch.current;token.phase='rendering';setSiteRequestRevision(value=>value+1);return;
        }
        const frozen=result.snapshot,selection=result.selection;
        if(!frozen?.frame?.geometry||frozen.frame.loaderId!==token.loaderId)throw new Error('网页批注画面已经失效');
        if(result.request.kind==='annotation'&&!selection)throw new Error('网页批注目标已经离开页面');
        const host=contentHost??entryButton.current?.closest('.tx-cu-pane-browser')?.querySelector('.tx-cu-live');
        if(!host?.isConnected)throw new Error('请先打开对应网页画面，再进行批注。');
        const flow=result.request.enterAnnotationMode===true||result.request.kind==='mode'?'batch':'quick';
        opener.current=entryButton.current?.querySelector('button');token.epoch=initializeEditor(host,flow,result.actor??frame.actor);acceptControl(result);request.current=controller;
        token.opened=true;siteEditorOwner.current=token;setSnapshot({sessionId,...frozen,browserId:target.browserId});setQueue(result.queue);
        if(result.request.kind==='annotation')token.editorOpenPlan=acceptOpenPlan({...result.queue,editorOpenPlan:result.editorOpenPlan});
        if(draftOwner.pendingAck){const accepted=await queueRequest('ack',draftOwner.pendingAck,controller.signal);if(!valid()){rejectSiteDelivery(token);return;}removeAnnotationDraftsWhenReady(draftOwner,accepted.removedAttachmentIds??[],inputActions,conversation);draftOwner.pendingAck=null;setQueue(accepted);}
        if(selection?.kind==='element'){
          const selected=frozen.elements?.find(value=>value.key===selection.elementKey);
          if(!selected?.region||!selection.point)throw new Error('网页批注目标已经失效');
          setMode('element');setElement(selected);setRegion(selected.region);setSelectionPoint(selection.point);
          if(token.editorOpenPlan?.canEditDesign===true&&token.editorOpenPlan.defaultDesignEditorOpen===true){
            const own=scope();token.ownDesignTransition={actor:own.actor,controlEpoch:own.controlEpoch,settled:false};setSiteRequestRevision(value=>value+1);
            try{
              const begun=await beginDesign(controller,{frozen,selected,point:selection.point,commentId:null,additional:[]});
              if(begun.actor!==own.actor||begun.controlEpoch!==own.controlEpoch+1)token.ownDesignTransition=null;
              else token.ownDesignTransition.settled=true;
            }catch(error){token.ownDesignTransition=null;throw error;}
            finally{setSiteRequestRevision(value=>value+1);}
          }
        }else if(selection?.kind==='text'){
          if(frozen.textSelection?.key!==selection.textSelectionKey||!selection.point||result.request.openTweaks===true)throw new Error('网页文字批注目标已经失效');
          selectFrozenText(frozen,{plan:false});setSelectionPoint(selection.point);
        }else if(selection)throw new Error('网页批注选择类型不可用');
        if(!valid()){rejectSiteDelivery(token);return;}
        setComment(typeof result.request.initialComment==='string'?result.request.initialComment:'');token.scope=scope();token.phase='rendering';setSiteRequestRevision(value=>value+1);
      }catch(e){if(siteDelivery.current===token){if(!controller.signal.aborted&&e.name!=='AbortError')setError(e.message);rejectSiteDelivery(token);}}
      finally{if(siteDelivery.current===token&&token.ownsBusy){token.ownsBusy=false;busyRef.current=false;setBusy(false);setBusyAction('');setLoading(false);}}
    };
    void run();
  },[siteAvailable,siteBridge.identity,siteBridge.state?.request?.id,siteBridge.permission?.id]);
  useEffect(()=>{
    const token=siteDelivery.current;
    if(!token||token.phase!=='rendering'||busy||loading||!siteAvailable||siteBridge.identity!==token.identity)return;
    const browsing=token.request.kind==='mode'&&token.request.interactionMode==='browse';
    if(browsing?!!snapshot:!snapshot||!dialog.current||!contentHost?.isConnected||!imageReady||!image.current?.complete||!image.current.naturalWidth||token.request.kind==='annotation'&&(!region||!card.current))return;
    if(!browsing)focusEditorIfExternal();
    token.phase='acknowledging';
    void siteUi.current.bridge.sync().then(async result=>{
      if(siteDelivery.current!==token||token.controller.signal.aborted||!siteUi.current.available||siteUi.current.bridge.identity!==token.identity||token.epoch!==epoch.current)throw new DOMException('网页批注打开已经失效','AbortError');
      if(result?.available!==true)throw new Error('当前网页批注不可用');
      await siteUi.current.bridge.call('ack',{id:token.id,accepted:true},token.controller.signal);
      if(siteDelivery.current===token){siteDelivery.current=null;setSiteOpening(false);setSiteRequestRevision(value=>value+1);}
    }).catch(error=>{if(siteDelivery.current===token){if(error.name!=='AbortError')setError(error.message);rejectSiteDelivery(token);}});
  },[siteRequestRevision,siteAvailable,siteBridge.identity,!!snapshot,imageReady,busy,loading,!!region,contentHost]);
  const editSaved=async entry=>{
    if(busyRef.current)return;
    const revision=epoch.current,controller=new AbortController();request.current?.abort();request.current=controller;busyRef.current=true;setBusy(true);setBusyAction('design-begin');setError('');
    try{
      const restored=await cancelActiveEditor(controller),fresh=restored??await refreshFrozenView(controller),frozen={sessionId,...fresh,browserId:target.browserId},projected=savedAnnotationProjection(entry,frozen);
      const selected=projected&&entry.selection.elementKey?fresh.elements.find(value=>value.key===entry.selection.elementKey):null;
      clearSelection();setSavedListOpen(false);setEditingId(entry.id);setRegion(projected?.region??entry.selection.region);setSelectionPoint(projected?.point??entry.selection.point);setElement(selected);
      if(entry.selection.textAnchor)setTextSelection(projected?fresh.textSelection:{anchor:entry.selection.textAnchor});
      if(entry.selection.virtualAnchor)setVirtualSelection({anchor:entry.selection.virtualAnchor});
      setComment(entry.comment.localBrowserDesignChange?.group.comment??entry.comment.content.map(value=>value.content_type==='text'?value.text:'').join(''));
      const additional=(entry.selection.additional??[]).map((selection,index)=>{const actual=savedAnnotationProjection(entry,frozen,index+1),value=selection.elementKey?fresh.elements.find(element=>element.key===selection.elementKey):null;return actual?{kind:value?'element':'region',element:value,region:actual.region,point:actual.point}:null;});setAdditionalSelections(additional.filter(Boolean));
      if(selected&&entry.comment.localBrowserDesignChange?.group){if(additional.some(value=>!value)){setElement(null);setError('部分批注目标不在当前画面中，当前只能修改批注说明。');}else{setMode('element');await beginDesign(controller,{frozen,selected,point:projected.point,commentId:entry.id,additional});}}
      if(entry.selection.virtualAnchor&&entry.comment.localBrowserDesignChange?.group.annotationControls?.controls.length&&!additional.length){
        try{await restoreSavedVirtualDesign(controller,entry.id);}
        catch(error){if(controller.signal.aborted||error.name==='AbortError')throw error;controls.current=null;setEditorControls(null);setStyleOpen(false);setVirtualSelection({anchor:entry.selection.virtualAnchor});setError('图形批注目标尚未恢复，当前只能修改批注说明。');}
      }else if(entry.selection.virtualAnchor&&entry.comment.localBrowserDesignChange?.group)setError('图形批注目标尚未恢复，当前只能修改批注说明。');
    }catch(e){if(revision===epoch.current&&!controller.signal.aborted)setError(e.message);}
    finally{if(revision===epoch.current){busyRef.current=false;setBusy(false);setBusyAction('');}}
  };
  const editorState=editorControls;
  const hasSiteControls=(editorState?.annotationControls?.controls.length??0)>0,replaceBuiltinControls=hasSiteControls&&editorState.annotationControls.controlsMode==='replace';
  const virtualDesign=isVirtualEditor(liveEditor?.active),virtualControlsReady=!!virtualSelection?.key&&(virtualSelection.annotationControls?.controls.length??0)>0;
  const canAdjustTarget=editorOpenPlan?.canEditDesign===true||!!liveEditor?.active;
  const designTargetKey=liveEditor?.active?.editorId??element?.key??virtualSelection?.key;
  const designTargetLabel=virtualDesign?editorState?.targetLabel??virtualSelection?.anchor.elementName??virtualSelection?.anchor.title??virtualSelection?.anchor.targetId:element?'<'+element.tag+'>':'';
  const canAttach=!!api&&!!snapshot?.frame.geometry&&!!selectionPoint&&!dragSelection&&!!(comment.trim()||designChanged||editingId&&queue.entries.find(entry=>entry.id===editingId)?.comment.localBrowserDesignChange)&&imageReady&&region?.width>0&&region?.height>0;
  const editorRevision=epoch.current;
  const updateEditorState=next=>{
    if(busyRef.current||editorRevision!==epoch.current||activeSession.current!==snapshot?.sessionId||!controls.current)return;
    const changes=new Map(next.declarations.filter(value=>value.value!==editorState?.declarations.find(previous=>previous.property===value.property)?.value).map(value=>[value.property,value.value]));
    updateDesignControls({...controls.current,declarations:controls.current.declarations.map(value=>changes.has(value.property)?{...value,value:changes.get(value.property)}:value)});
  };
  const holdOriginal=value=>{
    if(value&&busyRef.current||value&&!queue.hasQueuedTweaks&&!designChanged||originalHeld.current===value)return;
    originalHeld.current=value;setHoldingOriginal(value);
    const revision=epoch.current,original=++originalRevision.current;
    originalRequest.current=originalRequest.current.catch(()=>{}).then(async()=>{
      if(revision!==epoch.current)return;
      const controller=new AbortController();
      try{await flushDesignUpdates();if(revision!==epoch.current)return;const result=await queueRequest('hold-original',{enabled:value},controller.signal);setQueue(result);if(original===originalRevision.current){acceptLiveEditor(result,{syncControls:false});setHoldingOriginal(result.isOriginalViewEnabled);originalHeld.current=result.isOriginalViewEnabled;if(!result.liveEditor?.frame)await refreshFrozenView(controller,{preserveSelection:true});}}
      catch(e){if(revision===epoch.current&&!controller.signal.aborted)setError(e.message);}
    });
  };
  const startCardDrag=event=>{if(event.button!==0||event.target.closest('button,input,textarea,summary'))return;const rootBox=dialog.current.getBoundingClientRect(),box=card.current.getBoundingClientRect();const scaleX=rootBox.width/dialog.current.clientWidth||1,scaleY=rootBox.height/dialog.current.clientHeight||1;cardDrag.current={x:event.clientX,y:event.clientY,left:(box.left-rootBox.left)/scaleX,top:(box.top-rootBox.top)/scaleY,scaleX,scaleY};event.currentTarget.setPointerCapture(event.pointerId);};
  const moveCard=event=>{const start=cardDrag.current;if(!start||!card.current)return;setCardPosition({left:Math.max(0,Math.min(contentSize.width-card.current.offsetWidth,start.left+(event.clientX-start.x)/start.scaleX)),top:Math.max(0,Math.min(contentSize.height-card.current.offsetHeight,start.top+(event.clientY-start.y)/start.scaleY))});};
  const endCardDrag=event=>{cardDrag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);};
  return <>
    <CodexCuSplitButton ref={entryButton} color="ghost" size={compact?'toolbar':'compact'} primaryAriaLabel="批注页面" tooltipContent="批注页面" disabled={!conversation||!inputActions||!frame||frame.tabId!==target?.id||siteOpening||!!siteBridge.permission} onClick={event=>open(event)} secondaryAriaLabel="批注方式" dropdownOpen={entryMenuOpen} onDropdownOpenChange={setEntryMenuOpen} dropdownContent={<><CodexCuMenuItem onClick={event=>open(event,'quick')}>快速批注</CodexCuMenuItem><CodexCuMenuItem onClick={event=>open(event,'batch')}>批注</CodexCuMenuItem></>}><CodexCuIcon name="annotate" size={compact?16:13}/>{!compact&&'批注页面'}</CodexCuSplitButton>
    {siteBridge.permission&&<><CodexSiteToolsStyles/><CodexSiteAnnotationPermissionDialog key={siteBridge.identity+':'+siteBridge.permission.id} hostname={siteBridge.permission.hostname} isExitingAnnotationMode={siteBridge.permission.requestedInteractionMode==='browse'} busy={siteBridge.permissionBusy} onRespond={siteBridge.respond} messages={sitePermissionMessages} portalContainer={entryButton.current?.closest('.tx-cu-pane-browser')} onCloseAutoFocus={()=>entryButton.current?.closest('.tx-cu-pane-browser')?.querySelector('.tx-cu-keyboard')?.focus({preventScroll:true})}/></>}
    {!snapshot&&error&&<span className="tx-cu-error" role="alert">{error}</span>}
    {snapshot&&contentHost&&createPortal(<CodexCuScope forceScope ref={dialog} role="dialog" aria-modal="false" aria-label="批注页面" data-browser-comment-control-editing={controlEditing||undefined} onKeyDown={event=>{if(event.defaultPrevented||discardOpen)return;event.stopPropagation();if(event.key==='Escape'){event.preventDefault();if(savedListOpen)setSavedListOpen(false);else exitAnnotations();return;}if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!event.nativeEvent.isComposing&&!busy&&!loading&&!savedListOpen&&canAttach){event.preventDefault();void saveAnnotation();}}} className={'tx-cu-annotation-editor'+(contentSize.width<640||contentSize.height<420?' is-sheet':'')} style={{'--cu-annotation-height':contentSize.height+'px'}}>
      <div className="tx-cu-annotation-workspace"><div className="tx-cu-annotation-viewport" data-view={holdingOriginal?'original':liveEditor?.active?'design':'frozen'}>
        <div className="tx-cu-annotation-surface" onPointerDown={event=>{
          if(savedScreenshot||holdingOriginal||loading||busy||event.button!==0||!imageReady||!image.current?.complete)return;
          event.preventDefault();const start=point(event),append=event.shiftKey&&!editingId&&!liveEditor?.active;
          setHovered(null);setHoverPoint(null);setCardPosition(null);
          if(mode==='element'){const selected=pick(start);if(selected)void selectElement(selected.element,start,append,selected.sourceKey);return;}
          if(liveEditor?.active){void cancelSelection();return;}if(!append)clearSelection();drag.current={start,append};setDragSelection({kind:'region',point:start,region:{x:start.x,y:start.y,width:0,height:0}});event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={event=>{
          if(savedScreenshot)return;const bounds=event.currentTarget.getBoundingClientRect();setHoverPoint(event.pointerType==='touch'?null:{x:(event.clientX-bounds.left)/(bounds.width/event.currentTarget.clientWidth||1),y:(event.clientY-bounds.top)/(bounds.height/event.currentTarget.clientHeight||1)});
          if(mode==='element'&&!busy&&!loading&&!holdingOriginal){const next=pick(point(event))?.element??null;setHovered(previous=>previous===next||previous?.key===next?.key&&previous?.siteAnnotationSourceKey===next?.siteAnnotationSourceKey&&previous?.region===next?.region&&previous?.polygon===next?.polygon?previous:next);}else select(event);
        }} onPointerLeave={()=>{setHovered(null);setHoverPoint(null);}} onPointerUp={event=>{
          const next=select(event),append=drag.current?.append;drag.current=null;setDragSelection(null);
          if(next?.region.width>0&&next.region.height>0)chooseSelection(next,append);
          if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
        }} onPointerCancel={()=>{drag.current=null;setDragSelection(null);}}>
          <img ref={image} draggable={false} src={imageSource} alt="待批注的冻结页面" onLoad={event=>setReadyImageSource(event.currentTarget.src)} onError={()=>{setReadyImageSource('');setError('冻结画面无法显示，请重新打开批注。');if(siteDelivery.current?.opened)rejectSiteDelivery(siteDelivery.current);}}/>
          <CodexBrowserSelectionPointer point={hoverPoint} mode={textSelection?'text':selectionModifier&&primarySelection&&!editingId&&!liveEditor?.active?'add':'comment'} isVisible={!savedScreenshot&&!busy&&!loading&&!holdingOriginal&&!drag.current}/>
          {textSelection&&!savedScreenshot?textSelection.viewportSelectionRects?.map((rect,index)=>{const geometry=snapshot.frame.geometry;return<div key={index} className="tx-cu-annotation-text-highlight" style={{left:(rect.x-geometry.offsetX)/geometry.width*100+'%',top:(rect.y-geometry.offsetY)/geometry.height*100+'%',width:rect.width/geometry.width*100+'%',height:rect.height/geometry.height*100+'%'}}/>;}):selectedPolygon?<svg className="tx-cu-annotation-outline" viewBox="0 0 1 1" preserveAspectRatio="none"><polygon points={selectedPolygon.map(p=>p.x+','+p.y).join(' ')} vectorEffect="non-scaling-stroke"/></svg>:region&&!savedScreenshot&&!activeTargetMissing&&!virtualSelection?.customRendering&&<div className={'tx-cu-annotation-region'+(element?' is-element':'')} style={{left:region.x*100+'%',top:region.y*100+'%',width:region.width*100+'%',height:region.height*100+'%'}}/>}
          {hovered&&hovered.key!==element?.key&&<>{hovered.polygon?<svg className="tx-cu-annotation-outline is-hover" viewBox="0 0 1 1" preserveAspectRatio="none"><polygon points={hovered.polygon.map(p=>p.x+','+p.y).join(' ')} vectorEffect="non-scaling-stroke"/></svg>:<div className="tx-cu-annotation-region is-element is-hover" style={{left:hovered.region.x*100+'%',top:hovered.region.y*100+'%',width:hovered.region.width*100+'%',height:hovered.region.height*100+'%'}}/>}<span className="tx-cu-annotation-hover-label">{'<'+hovered.tag+'>'}{hovered.id?' #'+hovered.id:''}</span></>}
          {!savedScreenshot&&displayedAdditional.map((selection,index)=>!selection?null:selection.element?.polygon?<svg key={index} className={'tx-cu-annotation-outline'+(linkedSelection===index+1?' is-linked':'')} viewBox="0 0 1 1" preserveAspectRatio="none"><polygon points={selection.element.polygon.map(p=>p.x+','+p.y).join(' ')} vectorEffect="non-scaling-stroke"/></svg>:<div key={index} className={'tx-cu-annotation-region'+(selection.element?' is-element':'')+(linkedSelection===index+1?' is-linked':'')} style={{left:selection.region.x*100+'%',top:selection.region.y*100+'%',width:selection.region.width*100+'%',height:selection.region.height*100+'%'}}/>)}
          {dragSelection&&<div className="tx-cu-annotation-region" style={{left:dragSelection.region.x*100+'%',top:dragSelection.region.y*100+'%',width:dragSelection.region.width*100+'%',height:dragSelection.region.height*100+'%'}}/>}
          {markersVisible&&!savedScreenshot&&queue.entries.flatMap((entry,index)=>Array.from({length:1+(entry.selection.additional?.length??0)},(_,selectionIndex)=>{if(editingId===entry.id&&activeTargetMissing)return null;const projected=savedAnnotationProjection(entry,snapshot,selectionIndex);return projected&&<button key={entry.id+':'+selectionIndex} type="button" className="tx-cu-annotation-saved-marker" aria-label={'编辑批注 '+(index+1)} title={entry.comment.localBrowserContext.selectedText??entry.comment.localBrowserContext.targetDescription} aria-pressed={editingId===entry.id} disabled={busy} style={{left:projected.point.x*100+'%',top:projected.point.y*100+'%'}} onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();void editSaved(entry);}}>{index+1}</button>;}))}
        </div>
        <div className="tx-cu-annotation-viewbar" title={savedScreenshot?editingEntry.comment.localBrowserContext.pageUrl:snapshot?.frame.url}><CodexCuIcon name="image" size={16}/><span>{savedScreenshot?'已保存截图':holdingOriginal?'原始页面':liveEditor?.active?'实时调整':'冻结画面'}</span></div>
      </div></div>
      <div className="tx-cu-annotation-palette tx-cu-annotation-selection-tools">
          <CodexCuButton color="ghostActive" size="toolbar" uniform disabled={busy} aria-label="圈选区域" title="圈选区域" aria-pressed={mode==='region'} onClick={()=>void chooseMode('region')}><CodexCuIcon name="annotation-20" size={20}/></CodexCuButton>
          <CodexCuButton color="ghostActive" size="toolbar" uniform disabled={busy||loading||!snapshot?.elements} aria-label="选择元素" title="选择元素" aria-pressed={mode==='element'} onClick={()=>void chooseMode('element')}><CodexCuIcon name="pointer" size={20}/></CodexCuButton>
          {snapshot.textSelection&&<CodexCuButton color="ghostActive" size="toolbar" uniform disabled={busy||loading} aria-label="批注选中文字" title="批注选中文字" aria-pressed={!!textSelection} onClick={()=>void chooseFrozenText()}><CodexCuIcon name="annotation-20" size={20}/></CodexCuButton>}
          <CodexCuButton color="ghostActive" size="toolbar" uniform disabled={busy||!queue.entries.length} aria-label="已保存批注" title="已保存批注" aria-pressed={savedListOpen} onClick={()=>setSavedListOpen(value=>!value)}><CodexCuIcon name="annotate" size={20}/></CodexCuButton>
          {annotationFlow==='quick'&&<CodexCuButton color="ghostActive" size="toolbar" uniform aria-label="退出批注" title="退出批注" disabled={busy} onClick={exitAnnotations}><CodexCuIcon name="shared:Cot" size={20}/></CodexCuButton>}
      </div>
      {savedListOpen&&<aside className="tx-cu-annotation-saved-list" aria-label="已保存批注"><div className="tx-cu-annotation-saved-list-header"><strong>已保存批注 · {queue.pendingAnnotationCount}</strong><CodexCuButton color="ghost" size="compact" uniform aria-label="关闭已保存批注" onClick={()=>setSavedListOpen(false)}><CodexCuIcon name="shared:VT" size={16}/></CodexCuButton></div><div className="tx-cu-annotation-saved-list-items">{queue.entries.map((entry,index)=><div key={entry.id} className="tx-cu-annotation-saved-row"><button type="button" className="tx-cu-annotation-saved-item" disabled={busy} onClick={()=>editSaved(entry)} title={entry.comment.localBrowserContext.pageUrl}>{entry.comment.localBrowserScreenshot&&<img src={entry.comment.localBrowserScreenshot.dataUrl} alt=""/>}<span><strong>{index+1}. {entry.comment.localBrowserContext.selectedText??entry.comment.localBrowserContext.targetDescription}</strong><span>{entry.comment.localBrowserDesignChange?.group.comment??entry.comment.content.map(value=>value.content_type==='text'?value.text:'').join('')}</span></span></button><CodexCuButton color="ghostMuted" size="compact" uniform aria-label={'删除批注 '+(index+1)} disabled={busy||composerBusy} onClick={()=>mutateQueue('delete',{commentId:entry.id})}><CodexCuIcon name="shared:lot" size={16}/></CodexCuButton></div>)}</div></aside>}
      {annotationFlow==='batch'&&<CodexAnnotationToolbar position={toolbarPosition} onPositionChange={setToolbarPosition} displayUrl={snapshot.frame.url}
        hasPendingAnnotations={queue.pendingAnnotationCount>0} pendingAnnotationCount={queue.pendingAnnotationCount} hasQueuedTweaks={queue.hasQueuedTweaks||designChanged}
        isAddModifierPressed={addModifier} isOriginalViewEnabled={holdingOriginal} isSubmitAvailable={!busy&&!loading&&!composerBusy&&!uploadsPending&&composerBlock===undefined&&submitAvailable===true&&!region&&typeof inputActions?.submit==='function'}
        markersVisible={markersVisible} onToggleMarkers={()=>setMarkersVisible(value=>!value)} onDiscard={()=>setDiscardOpen(true)} onExit={exitAnnotations}
        onAddToComposer={()=>handoff(false)} onSubmit={()=>handoff(true)} loading={busyAction==='handoff'}
        onOriginalViewPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);holdOriginal(true);}}
        onOriginalViewPointerUp={()=>holdOriginal(false)} onOriginalViewPointerCancel={()=>holdOriginal(false)} onOriginalViewBlur={()=>holdOriginal(false)}
        onOriginalViewKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();holdOriginal(true);}}}
        onOriginalViewKeyUp={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();holdOriginal(false);}}} tooltipPortalContainer={dialog.current}/>}
      {!region&&<div className="tx-cu-annotation-hint">{mode==='region'?'拖动圈选要讨论的区域':'移入查看元素，点击选中'} · 冻结截图不会点击网页</div>}
      {region&&!savedListOpen&&<CodexAnnotationInspector ref={card} styleOpen={styleOpen} className={selectionModifier&&!editingId&&!liveEditor?.active?'is-selecting':''} style={cardPosition?{left:cardPosition.left,top:cardPosition.top,right:'auto',bottom:'auto'}:undefined}>
        <div className="tx-cu-annotation-card-header" onPointerDown={startCardDrag} onPointerMove={moveCard} onPointerUp={endCardDrag} onPointerCancel={endCardDrag}>
          <div className="tx-cu-selection-chips">{[primarySelection,...additionalSelections].filter(Boolean).map((selection,index)=><div key={index} className={'tx-cu-selection-chip'+(selection.kind==='region'?' is-region':'')} onMouseEnter={()=>setLinkedSelection(index)} onMouseLeave={()=>setLinkedSelection(null)}><code>{editingEntry&&index===0?(editingEntry.comment.localBrowserContext.selectedText??editingEntry.comment.localBrowserContext.targetDescription):selection.virtualSelection?selection.virtualSelection.anchor.title:selection.textSelection?'选中文字':selection.element?'<'+selection.element.tag+'>':'区域 '+(index+1)}</code>{selection.element?.id&&<span>#{selection.element.id}</span>}<button type="button" aria-label={'移除选择 '+(index+1)} disabled={busy||!!liveEditor?.active&&index>0||!!editingId&&index>0} onClick={()=>editingId?void cancelSelection():removeSelection(index)}><CodexCuIcon name="shared:VT" size={14}/></button></div>)}</div>
          {canAdjustTarget&&(element||virtualControlsReady||virtualDesign&&hasSiteControls)&&api&&(!editingId||editingEntry?.comment.localBrowserDesignChange)&&<CodexCuButton color="ghost" size="composer" uniform aria-label={styleOpen?'返回批注':'调整样式'} title={styleOpen?'返回批注':'调整样式'} aria-pressed={styleOpen} disabled={busy} onClick={()=>void toggleDesignPanel()}><CodexCuIcon name="settings" size={20}/></CodexCuButton>}
        </div>
        <div className="tx-cu-annotation-inspector-body">
          {styleOpen&&(element||virtualDesign)&&api&&<div className="tx-cu-style-editor">
            <div className="tx-cu-style-drag-heading" onPointerDown={startCardDrag} onPointerMove={moveCard} onPointerUp={endCardDrag} onPointerCancel={endCardDrag}><strong>{replaceBuiltinControls?codexAnnotationSiteHeading(editorState):designTargetLabel}</strong><CodexCuIcon name="shared:Met" size={16} style={{transform:'rotate(90deg)'}}/></div>
            <div className="tx-cu-style-groups" data-browser-sidebar-design-scroll-container><CodexAnnotationControlsGrid styleEnabled={false}>
              {hasSiteControls&&<CodexAnnotationSiteControls key={designTargetKey} editorState={editorState} disabled={busy||liveEditor?.active?.canEditAnnotationControls!==true} portalContainer={dialog.current} onChange={updateSiteControl} onReset={resetSiteControl} onEditingChange={setControlEditing} onDragChange={setControlEditing} onScrubChange={property=>setControlEditing(property!=null)}/>}
              {hasSiteControls&&!replaceBuiltinControls&&!virtualDesign&&<CodexAnnotationSectionDivider variant="section"/>}
              {!virtualDesign&&!replaceBuiltinControls&&editorState?.text&&<div className={codexAnnotationLayoutUtilities('contents')}><span className={codexAnnotationLayoutUtilities('flex min-h-7 min-w-0 items-center truncate overflow-hidden text-sm text-secondary')}>文本</span><CodexAnnotationValueCell dropdownPortalContainer={dialog.current} showReset={textChanged} resetLabel="重置文本" onReset={()=>{const current=controls.current;if(current?.text)updateDesignControls({...current,text:{...current.text,value:current.text.previousValue}});}}><span className={codexAnnotationLayoutUtilities('min-w-0 rounded-lg border border-primary-outline bg-primary-soft text-default shadow-sm outline-none transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring w-48 max-w-full flex min-h-7 min-w-0 items-center px-3')}><input aria-label="文本" data-browser-sidebar-design-content-input className={codexAnnotationLayoutUtilities('min-w-0 appearance-none border-0 bg-transparent font-mono text-default outline-none ring-0 placeholder:text-tertiary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 h-7 w-full text-start text-xs')} disabled={busy} value={editorState.text.value} onChange={event=>{const current=controls.current;if(current?.text)updateDesignControls({...current,text:{...current.text,value:event.target.value}});}}/></span></CodexAnnotationValueCell></div>}
              {!virtualDesign&&<CodexAnnotationLayoutSections key={designTargetKey} editorState={editorState} styleEnabled={false} isEditable={!busy} showInitialDivider={!!editorState?.text} onUpdate={updateEditorState} onControlEditingActiveChange={setControlEditing} onControlDragActiveChange={setControlEditing} onScrubActiveChange={property=>setControlEditing(property!=null)} dropdownPortalContainer={dialog.current} renderDeclarationControl={props=><CodexAnnotationDeclarationControl {...props} disabled={busy||!supportedStyleProperties.has(props.declaration.property)} onValueChange={supportedStyleProperties.has(props.declaration.property)?props.onValueChange:undefined} portalContainer={dialog.current}/>}/>}
            </CodexAnnotationControlsGrid></div>
            <div className="tx-cu-style-actions"><CodexCuButton color="ghost" size="compact" disabled={busy||!designChanged} onClick={resetStyles}>重置全部</CodexCuButton></div>
          </div>}
          <label className="tx-cu-annotation-comment"><span className="tx-cu-annotation-sr-only">批注说明</span><textarea aria-label="批注说明" placeholder="希望这里怎么改？" disabled={busy} value={comment} onChange={event=>setComment(event.target.value)}/></label>
          {snapshot?.truncated&&<p className="tx-cu-style-preview-note">元素清单已达显示上限，可用圈选补充。</p>}
          {error&&<p className="tx-cu-error" role="alert">{error}</p>}
        </div>
        <footer>{editingId?<CodexCuButton color="ghostMuted" size="composer" uniform aria-label="删除批注" title="删除批注" disabled={busy||composerBusy} onClick={()=>mutateQueue('delete',{commentId:editingId})}><CodexCuIcon name="shared:lot" size={20}/></CodexCuButton>:<span/>}{editingId?<CodexCuButton color="primary" size="composer" title="保存批注" disabled={loading||busy||!canAttach} loading={busyAction==='attach'} onClick={()=>saveAnnotation(false)}>保存</CodexCuButton>:<CodexCuSplitButton color="primary" size="composer" disabled={loading||busy||!canAttach} loading={busyAction==='attach'} onClick={()=>saveAnnotation()} primaryAriaLabel={annotationFlow==='quick'?'发送批注':'保存批注'} secondaryAriaLabel="批注提交方式" dropdownOpen={saveMenuOpen} onDropdownOpenChange={setSaveMenuOpen} dropdownContent={<CodexCuMenuItem onClick={()=>{setSaveMenuOpen(false);void saveAnnotation(annotationFlow!=='quick');}}>{annotationFlow==='quick'?'保存':'发送'}</CodexCuMenuItem>}>{annotationFlow==='quick'?'发送':'保存'}</CodexCuSplitButton>}</footer>
      </CodexAnnotationInspector>}
      {!region&&error&&<div className="tx-cu-annotation-status-error tx-cu-error" role="alert">{error}{(queue.undeliveredCount>0||recoveryNeeded)&&<CodexCuButton color="ghost" size="compact" disabled={busy||composerBusy} onClick={()=>handoff(false)}>重试加入输入区</CodexCuButton>}</div>}
      <CodexCuDialog open={discardOpen} onOpenChange={setDiscardOpen} showDialogClose={false} size="compact" portalContainer={dialog.current}>
        <CodexCuDialogBody as="form" onSubmit={event=>{event.preventDefault();setDiscardOpen(false);void mutateQueue('discard');}}>
          <CodexCuDialogTitle>丢弃所有待处理的批注？</CodexCuDialogTitle>
          <CodexCuDialogFooter><CodexCuButton color="secondary" onClick={()=>setDiscardOpen(false)}>取消</CodexCuButton><CodexCuButton color="danger" type="submit" disabled={busy||composerBusy}>丢弃</CodexCuButton></CodexCuDialogFooter>
        </CodexCuDialogBody>
      </CodexCuDialog>
    </CodexCuScope>,contentHost)}
  </>;
}
