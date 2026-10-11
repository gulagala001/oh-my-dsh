import { createChat } from '../../lib/chat.factory.mjs';
export * as codexCuSurfaces from './codex-cu-surfaces.jsx';
import { createChatSettings } from './chat-settings.mjs';
import { createComputerStatePool } from './state-pool.mjs';
import { HOST_BROWSER_ID } from './host-browser.mjs';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import css from './computer-use.css';
import codexCuStyles from './codex-cu-styles.mjs';
import { CodexCuScope } from './codex-cu-scope.jsx';
import { formatCodexCuMessage } from './codex-cu-i18n.mjs';
import { BrowserPreview } from './browser-preview.jsx';
import { NativePreview } from './native-preview.jsx';
import { BrowserControls } from './browser-controls.jsx';
import { installComputerReferenceMessages } from './computer-reference.jsx';
import { buildCodexTargetCandidates, createCodexTargetCandidateIcon } from './codex-target-adapter.jsx';
import { computerGroupPresentation } from './computer-groups.jsx';
import { ComputerSetup } from './computer-setup.jsx';
import { WindowShare, installWindowShareDraftAttachments } from './window-share.jsx';
import { installCodexAppshotCommand } from './codex-appshot-command.jsx';
import {CodexBrowserTabTransfer, CodexBrowserDetachedTab} from './codex-browser-tab-transfer.jsx';
import { CodexBrowserOwnedChatLinkConsumer } from './codex-browser-link-preferences.jsx';
import { createBrowserWorkspaceTabs } from './browser-workspace-tabs.mjs';
import { installBrowserWorkspaceTransferMenu } from './browser-workspace-transfer.jsx';
import {FloatingPreview} from './floating-preview.jsx';
import { usePreviewPaneVisible, usePreviewPanePresence } from './preview-presence.mjs';
import { PageAnnotation } from './page-annotation.jsx';
import { submitScopedAnnotation } from './codex-annotation-direct-submit.mjs';
import { ComputerIcon } from './computer-icons.jsx';
import { ComputerCard } from './computer-card.jsx';
import { nativePresentationOwnerInput } from './codex-native-layout.mjs';
import { CodexCuNativePipSection } from './codex-cu-summary.jsx';
import { CodexCuOverlay } from './codex-cu-overlay.jsx';
import { CodexCuMenuItem, CodexCuMenuSurface } from './codex-cu-primitives.jsx';

const base='trisoul-x/computer-use/';
const computerKind='trisoul-x-computer-use',browserKind='browser',legacyBrowserKind='opencu-browser',browserResourceKind='opencu-browser-resource';
const url=(op,id)=>base+op+(id==null?'':'?session='+encodeURIComponent(id));
async function api(op,id,value,signal){const r=await fetch(url(op,id),value===undefined?{signal}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal});const body=await r.json();if(!r.ok)throw Object.assign(new Error(body.error??'Computer Use 请求失败'),{code:body.code});if(value!==undefined&&body.status)window.dispatchEvent(new CustomEvent('trisoul-cu-state',{detail:{id,state:body}}));return body;}
const statePoolKey = Symbol.for('opencu.state-pool.v1');
const statePool = globalThis[statePoolKey] ||= createComputerStatePool({ read: (id, signal) => api('state', id, undefined, signal) });
function useStateView(id, visible = true) {
  const subscribe = useCallback(listener => id && visible ? statePool.subscribe(id, listener) : () => {}, [id, visible]);
  const snapshot = useCallback(() => statePool.snapshot(visible ? id : null), [id, visible]);
  const { state, error: connectionError, eventRevision } = useSyncExternalStore(subscribe, snapshot);
  const [error, setError] = useState('');
  const setState = useCallback(value => { statePool.publish(id, value); setError(''); }, [id]);
  useEffect(() => { setError(''); }, [id, visible, eventRevision]);
  return { state, error: error || connectionError, setState, setError };
}

function useBrowserWorkspaceRevision(workspace, sessionId) {
  const subscribe=useCallback(listener=>workspace&&sessionId?workspace.subscribe(sessionId,listener):()=>{},[workspace,sessionId]);
  const snapshot=useCallback(()=>workspace&&sessionId?workspace.snapshot(sessionId):0,[workspace,sessionId]);
  return useSyncExternalStore(subscribe,snapshot);
}

function useNativePresentationController({sessionId,state,active,setState,setError}) {
  const live=useRef({sessionId,state}),[owner,setOwner]=useState(null);
  live.current={sessionId,state};
  const available=state?.enabled!==false&&state?.nativePresentation?.capabilities?.available===true;
  const hostRequests=JSON.stringify(state?.nativePresentation?.needsHost??[]);
  const windowsSources=state?.nativePresentation?.producerKind==='windows-wgc-png'
    ? JSON.stringify((state.nativePresentation.presentations??[]).map(record=>[
      record.presentationID,record.sourceGeneration,record.published,record.cleanupPending]))
    : '';
  const action=useCallback(async(action,value={},signal)=>{
    const current=live.current;if(current.sessionId!==sessionId)return null;
    const result=await api('native-presentation',sessionId,{action,controlEpoch:current.state?.controlEpoch,...value},signal);
    if(live.current.sessionId===sessionId){
      if(result.state?.status)setState(result.state);
      else if(result.status)setState(result);
    }
    return result;
  },[sessionId,setState]);
  useEffect(()=>{
    setOwner(null);if(!available||!sessionId)return;
    const controller=new AbortController();
    void action('owner',{},controller.signal).then(value=>{if(!controller.signal.aborted)setOwner(value);},error=>{if(!controller.signal.aborted)setError(error.message);});
    return()=>controller.abort();
  },[sessionId,available,hostRequests,windowsSources,action,setError]);
  useEffect(()=>{
    const input=nativePresentationOwnerInput(owner,sessionId,active&&available);
    if(!input){if(owner?.available===true)setError('Native presentation owner identity is invalid');return;}
    input.layout.hideControlTitle=formatCodexCuMessage({id:'codex.localConversation.remoteHostedPip.hide',defaultMessage:'Hide'});
    input.layout.hideForTaskMenuTitle=formatCodexCuMessage({id:'codex.localConversation.remoteHostedPip.hideForTask',defaultMessage:'Hide for this task'});
    input.layout.hideForAllActiveTasksMenuTitle=formatCodexCuMessage({id:'codex.localConversation.remoteHostedPip.hideForAllActiveTasks',defaultMessage:'Hide for all active tasks'});
    input.layout.closeControlToolTip=formatCodexCuMessage({id:'codex.localConversation.remoteHostedPip.hidePictureInPicture',defaultMessage:'Hide Picture in Picture'});
    const controller=new AbortController();
    void action('configure',input,controller.signal).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    return()=>controller.abort();
  },[sessionId,available,active,owner,action,setError]);
  const perform=useCallback((kind,value)=>action(kind,value).catch(error=>{if(live.current.sessionId===sessionId)setError(error.message);}),[sessionId,action,setError]);
  const onReadyChange=useCallback((threadID,ready)=>threadID===sessionId?perform('ready',{ready}):undefined,[sessionId,perform]);
  const onInteractWithPresentation=useCallback((threadID,presentationID,isLead)=>threadID===sessionId?perform('interact',{presentationID,isLead}):undefined,[sessionId,perform]);
  const onDomHomeChange=useCallback((threadID,domHome)=>{
    if(threadID===live.current.sessionId)return perform('dom-home',{domHome});
    if(!domHome.available&&!domHome.visible&&!domHome.active&&!domHome.ready){
      // A removed surface may belong to the preceding conversation. Clear its
      // exact DOM identity without publishing the old response into the new UI.
      return api('state',threadID).then(previous=>api('native-presentation',threadID,
        {action:'dom-home',controlEpoch:previous.controlEpoch,domHome})).catch(()=>{});
    }
  },[perform]);
  return {available,owner,action:perform,onReadyChange,onInteractWithPresentation,onDomHomeChange};
}

function NativePipControls({sessionId,state,controller,preview,fallbackPreview=false}) {
  const [hideOpen,setHideOpen]=useState(false);
  useEffect(()=>setHideOpen(false),[sessionId]);
  const tasks=state?.nativePresentation?.taskState;
  const taskActive=tasks?.activeTaskIds?.includes(sessionId)===true;
  const shown=!tasks?.globalHidden&&tasks?.taskVisibilities?.[sessionId]!=='hidden';
  if(fallbackPreview&&(!controller.available||!taskActive||state?.target?.kind==='tab'))return preview;
  return <CodexCuNativePipSection gates={{'188145323':controller.available,'228020933':controller.available,
    taskActive,currentBrowserUseTab:state?.target?.kind==='tab'}} locale="zh-CN" shown={shown} preview={preview}
    onShow={()=>void controller.action('show')} onHideTask={()=>void controller.action('hide')}
    onHideAll={()=>void controller.action('hide-all')} hideMenu={{onOpen:()=>setHideOpen(true)}}
    renderHideMenu={({triggerButton,actions,align,contentWidth})=><CodexCuOverlay type="menu" kind="native-pip-hide"
      open={hideOpen} onOpenChange={setHideOpen} triggerButton={triggerButton} align={align}
      content={<CodexCuMenuSurface align={align} contentWidth={contentWidth}>{actions.map(item=><CodexCuMenuItem key={item.label}
        onSelect={()=>{setHideOpen(false);item.onSelect?.();}}>{item.label}</CodexCuMenuItem>)}</CodexCuMenuSurface>}/>}/>;
}
// This controller intentionally adds no OpenCU-specific composer toolbar.
// The host provides source-backed controls and native presentation geometry.
function ComputerController({sessionId,onOpen,onPresentation,inputActions,conversation,nativePresentation,nativePresentationActive=true,renderWindowShareAction,renderComputerControls,onOpenComputerSettings}){
  const {state,setState,setError,error}=useStateView(sessionId);
  const [pending,setPending]=useState(''),currentSession=useRef(sessionId);currentSession.current=sessionId;
  useEffect(()=>{setPending('');},[sessionId]);
  const control=async op=>{if(pending)return;setPending(op);try{const next=await api(op,sessionId,{});if(currentSession.current===sessionId)setState(next);}catch(error){if(currentSession.current===sessionId)setError(error.message);}finally{if(currentSession.current===sessionId)setPending('');}};
  const paneVisible=usePreviewPaneVisible(sessionId);
  const nativeController=useNativePresentationController({sessionId,state,active:nativePresentationActive,setState,setError});
  const open=()=>{const id=sessionId;return Promise.resolve(onOpen()).catch(error=>{if(currentSession.current===id)setError(error.message);});};
  const presentationHandler=useRef(onPresentation);presentationHandler.current=onPresentation;
  useEffect(()=>{
    const request=state?.presentationRequest;
    if(!request||request.sessionId!==sessionId)return;
    let live=true;
    void Promise.resolve().then(()=>{if(live)return presentationHandler.current(request);}).then(applied=>live&&applied!==false&&api('presentation-ack',sessionId,{id:request.id,visible:request.visible}),error=>live&&api('presentation-ack',sessionId,{id:request.id,visible:request.visible,error:error.message})).catch(error=>{if(live)setError(error.message);});
    return()=>{live=false;};
  },[sessionId,state?.presentationRequest?.id]);
  if(!sessionId)return null;
  const nativePreview=state?.enabled!==false?<FloatingPreview {...nativePresentation} sessionId={sessionId} state={state} url={url} onError={setError} paneVisible={paneVisible}
    onReadyChange={nativeController.onReadyChange} onInteractWithPresentation={nativeController.onInteractWithPresentation}
    onDomHomeChange={nativeController.onDomHomeChange} active={nativePresentationActive}/>:null;
  const nativeTaskState=state?.nativePresentation?.taskState;
  const controls=renderComputerControls?.({sessionId,state,pending,error,nativePreview,nativeTaskState,nativeOwner:nativeController.owner,
    onOpen:open,onStop:()=>control('stop'),onTakeOver:()=>control('stop'),onResume:()=>control('resume'),
    onShowNative:()=>nativeController.action('show'),onHideNative:()=>nativeController.action('hide'),onHideAllNative:()=>nativeController.action('hide-all'),
    onNativeReadyChange:nativeController.onReadyChange,onNativeDomHomeChange:nativeController.onDomHomeChange,
    onInteractWithPresentation:nativeController.onInteractWithPresentation,onOpenSettings:onOpenComputerSettings});
  return <CodexCuScope data-cu-session={sessionId} className="tx-cu-controller">
    {renderComputerControls?controls:<NativePipControls sessionId={sessionId} state={state} controller={nativeController} preview={nativePreview}/>}
    {state?.enabled!==false&&<WindowShare sessionId={sessionId} inputActions={inputActions} conversation={conversation} renderAction={renderWindowShareAction}/>}
  </CodexCuScope>;
}
function ComputerAnnotationInput({useInput,...props}){
  const inputState=useInput(state=>state);
  return <PageAnnotation {...props} inputState={inputState}/>;
}
function ComputerAnnotationSession({useSession,...props}){
  const submitAvailable=useSession(session=>session?!session.removed&&!(session.subagent?.address.mode==='continuable'&&session.subagent.parentAvailable!==true):undefined);
  return <ComputerAnnotationInput {...props} submitAvailable={submitAvailable}/>;
}
export function ComputerPane({sessionId,useTabInfo,useInput,useSession,inputActions,annotationInputState,annotationSubmitAvailable,submitDirectAnnotation,conversation,hostBrowserAvailable=false,nativeBrowserAvailable=false,browserOnly=false,browserWorkspace,renderBrowserTabs,renderBrowserAccessory,renderBrowserCursor,browserChromeVariant='floating',browserRowHeight,browserDeviceRowHeight,onOpenBrowserSettings,onOpenBrowserHistory,onOpenBrowserDownloads,onOpenSiteInformation,onCaptureScreenshot,pluginAddressInput,addressSuggestions,browserOptions}){
  const{tab,panel}=useTabInfo();const{state:baseState,error,setState,setError}=useStateView(sessionId,tab.visible);
  useBrowserWorkspaceRevision(browserWorkspace,sessionId);
  const binding=browserWorkspace&&tab.kind===browserResourceKind?browserWorkspace.parse(tab.contentId):null;
  const boundTarget=binding?.sessionId===sessionId?(browserWorkspace.inventory(sessionId).find(value=>value.id===binding.tabId&&value.browserId===binding.browserId)
    ??baseState?.previewTargets?.find(value=>value.kind==='tab'&&value.id===binding.tabId&&value.browserId===binding.browserId)):null;
  useEffect(()=>{
    if(binding?.sessionId===sessionId)browserWorkspace.rememberView(sessionId,tab.id,{paneId:panel.id});
  },[browserWorkspace,sessionId,tab.id,panel.id,binding?.tabId,binding?.browserId]);
  const isolatedBrowser=browserWorkspace&&browserOnly;
  const state=isolatedBrowser&&baseState?{...baseState,target:boundTarget?{...boundTarget,kind:'tab'}:null,viewTarget:boundTarget?{...boundTarget,kind:'tab'}:null,
    ...binding&&binding.tabId!==(baseState.viewTarget??baseState.target)?.id?{viewViewport:null,viewEmulation:null}:{}}:baseState;
  useEffect(()=>{
    if(!tab.visible||!binding||binding.sessionId!==sessionId||!baseState||baseState.previewTargets?.some(value=>value.id===binding.tabId&&value.browserId===binding.browserId))return;
    const controller=new AbortController();
    void api('view-tab',sessionId,{tabId:binding.tabId,browserId:binding.browserId},controller.signal).then(setState).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    return()=>controller.abort();
  },[sessionId,tab.visible,binding?.tabId,binding?.browserId,!!baseState]);
  const openBrowserTarget=useCallback(target=>{
    if(!browserWorkspace)return;
    try{browserWorkspace.open(sessionId,target,{paneId:panel.id,...binding?{}:{replaceTab:tab.id}});}catch(error){setError(error.message);}
  },[browserWorkspace,sessionId,panel.id,tab.id,binding?.tabId,setError]);
  useEffect(()=>{
    if(!browserWorkspace||!browserOnly||binding||!tab.visible||!tab.navigation?.params?.url)return;
    void browserWorkspace.openFromHost(sessionId,tab,{paneId:panel.id}).catch(error=>{
      if(!tab.signal?.aborted)setError(error.message);
    });
  },[browserWorkspace,browserOnly,sessionId,tab.id,tab.visible,tab.navigation?.revision,tab.navigation?.params?.url,tab.signal,panel.id,binding?.tabId,setError]);
  const syncBrowserTabs=useCallback(snapshot=>{
    try{browserWorkspace?.sync(sessionId,snapshot.tabs,{inventorySucceeded:true,successfulBrowserIds:snapshot.successfulBrowserIds});}catch(error){setError(error.message);}
  },[browserWorkspace,sessionId,setError]);
  useEffect(()=>{
    if(!browserWorkspace||!tab.visible||!binding||binding.sessionId!==sessionId||boundTarget)return;
    const controller=new AbortController();
    void api('tabs',sessionId,undefined,controller.signal).then(snapshot=>{if(!controller.signal.aborted)syncBrowserTabs(snapshot);})
      .catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    return()=>controller.abort();
  },[browserWorkspace,tab.visible,sessionId,binding?.tabId,binding?.browserId,!!boundTarget,syncBrowserTabs,setError]);
  useEffect(()=>{
    if(!browserWorkspace||!tab.visible||!baseState)return;
    const target=baseState.viewTarget??baseState.target;
    if(target?.kind==='tab'&&(tab.kind===computerKind||tab.contentId==='sidebar://'+legacyBrowserKind))openBrowserTarget(target);
  },[browserWorkspace,tab.visible,tab.kind,tab.contentId,baseState?.target?.id,baseState?.viewTarget?.id,openBrowserTarget]);
  usePreviewPanePresence(sessionId,tab.visible);
  const viewed=state?.viewTarget??state?.target;
  const target=browserOnly&&viewed?.kind!=='tab'?null:viewed;
  const route=!browserOnly&&state?(!target?legacyBrowserKind:tab.kind&&tab.kind!==computerKind?computerKind:null):null;
  useEffect(()=>{if(tab.visible&&route)tab.actions.openTab(route,{replaceTab:true});},[tab.visible,tab.actions,sessionId,route]);
  const[busy,setBusy]=useState(false),[navigation,setNavigation]=useState(null),[frame,setFrame]=useState(null),controls=useRef(null);
  useEffect(()=>tab.actions.bindCommands?.({refresh:()=>controls.current?.shortcut('reload')}),[tab.actions]);
  const[previewScale,setPreviewScale]=useState('1'),[deviceMode,setDeviceMode]=useState(false),[devicePreset,setDevicePreset]=useState('responsive');
  const currentSession=useRef(sessionId);currentSession.current=sessionId;
  useEffect(()=>{setNavigation(null);},[target?.id]);
  useEffect(()=>{setBusy(false);},[sessionId]);
  const act=async(op,value={})=>{if(busy)return;setBusy(true);try{const next=await api(op,sessionId,value);if(currentSession.current===sessionId){setState(next);setError('');}}catch(e){if(currentSession.current===sessionId)setError(e.message);}finally{if(currentSession.current===sessionId)setBusy(false);}};
  const nativeState=useRef(state);nativeState.current=state;
  const onNativeReadyChange=useCallback((threadID,ready)=>{
    if(threadID!==currentSession.current)return;
    void api('native-presentation',threadID,{action:'ready',controlEpoch:nativeState.current?.controlEpoch,ready})
      .catch(error=>{if(currentSession.current===threadID)setError(error.message);});
  },[setError]);
  const onNativeDomHomeChange=useCallback((threadID,domHome)=>{
    const current=threadID===currentSession.current;
    if(!current&&(domHome.available||domHome.visible||domHome.active||domHome.ready))return;
    const epoch=current?Promise.resolve(nativeState.current?.controlEpoch):api('state',threadID).then(value=>value.controlEpoch);
    void epoch.then(controlEpoch=>api('native-presentation',threadID,{action:'dom-home',controlEpoch,domHome}))
      .then(result=>{if(currentSession.current===threadID&&result.state?.status)setState(result.state);})
      .catch(error=>{if(currentSession.current===threadID)setError(error.message);});
  },[setState,setError]);
  const nativeAction=useCallback(async(action)=>{
    const id=sessionId;
    try{
      const result=await api('native-presentation',id,{action,controlEpoch:nativeState.current?.controlEpoch});
      if(currentSession.current===id&&result.state?.status)setState(result.state);
    }catch(error){if(currentSession.current===id)setError(error.message);}
  },[sessionId,setState,setError]);
  const nativeController={available:state?.enabled!==false&&state?.nativePresentation?.capabilities?.available===true,action:nativeAction};
  const renderTabs=node=>browserWorkspace?null:<CodexBrowserTabTransfer sessionId={sessionId} state={state} api={api} onState={setState} onError={setError}
    disabled={!tab.visible||state?.enabled===false||state?.transitioning||state?.resuming}>
    {typeof renderBrowserTabs==='function'?renderBrowserTabs(node):node}
  </CodexBrowserTabTransfer>;
  const AnnotationInput=typeof useInput==='function'?(typeof useSession==='function'?ComputerAnnotationSession:ComputerAnnotationInput):PageAnnotation;
  const annotationButton=target?.kind==='tab'?<AnnotationInput compact useInput={useInput} useSession={useSession} inputState={annotationInputState} submitAvailable={annotationSubmitAvailable} submitDirectAnnotation={submitDirectAnnotation} sessionId={sessionId} frame={state?.enabled?frame:null} target={target} inputActions={inputActions} conversation={conversation} api={api}/>:null;
  if(!browserOnly&&(!state||route))return error?<p className="tx-cu-error" role="alert">{error}</p>:!state?<span className="tx-cu-content-loading" role="status">正在连接…</span>:null;
  const isBrowser=browserOnly||target?.kind==='tab';
  const nativeError=target?.kind==='app'?state?.nativePresentationError:null;
  const previewError=error||browserWorkspace?.error(sessionId)?.message||state?.lastError?.message||(typeof nativeError==='string'?nativeError:nativeError?.message);
  return <CodexCuScope data-cu-session={sessionId} data-cu-target={target?.id} className={'tx-cu-pane'+(isBrowser?' tx-cu-pane-browser':' tx-cu-pane-app')}>
    {state?.vision?.input==='text'&&<p className="tx-cu-vision-warning" role="status">{state.vision.name} 当前仅接收文字，截图不会送入模型。需要看图时，请在输入区切换支持图片的模型；应用控件文字仍可读取。</p>}
    {isBrowser&&<BrowserControls ref={controls} sessionId={sessionId} state={state} visible={tab.visible} navigation={navigation} frame={frame} api={api} onState={setState} onError={setError} onTargetCreated={openBrowserTarget} onTabInventory={syncBrowserTabs} previewScale={previewScale} onPreviewScale={setPreviewScale} onDeviceModeChange={setDeviceMode} onDevicePresetChange={setDevicePreset} annotationButton={annotationButton} chromeVariant={browserChromeVariant} rowHeight={browserRowHeight} deviceRowHeight={browserDeviceRowHeight} pluginAddressInput={pluginAddressInput} addressSuggestions={addressSuggestions} browserOptions={browserOptions} onCaptureScreenshot={onCaptureScreenshot} renderTabs={renderTabs} renderAccessory={renderBrowserAccessory} onOpenHistory={onOpenBrowserHistory} onOpenDownloads={onOpenBrowserDownloads} onOpenBrowserSettings={onOpenBrowserSettings} onOpenSiteInformation={onOpenSiteInformation}/>}
    {previewError&&<p className="tx-cu-error" role="alert">{previewError}</p>}
    {target?.kind==='tab'?target.detached?<CodexBrowserDetachedTab key={target.id+':'+target.detached.id} sessionId={sessionId} target={target} state={state} api={api} onState={setState} onError={setError}/>:<BrowserPreview key={target.id} sessionId={sessionId} tabId={target.id} pageUrl={navigation?.tabId===target.id?navigation.url:target.url} visible={tab.visible} state={state} api={api} url={url} onState={setState} onError={setError} onNavigation={setNavigation} onFrame={setFrame} onBrowserShortcut={action=>controls.current?.shortcut(action)} onViewportResize={size=>controls.current?.resizeViewport(size)} renderBrowserCursor={renderBrowserCursor} deviceMode={deviceMode} devicePreset={devicePreset} previewScale={previewScale}/>:target?.kind==='app'?<NativePipControls sessionId={sessionId} state={state} controller={nativeController} fallbackPreview
      preview={<NativePreview key={target.viewId} sessionId={sessionId} targetId={target.viewId} visible={tab.visible} state={state} url={url} onError={setError} onNativeReadyChange={onNativeReadyChange} onDomHomeChange={onNativeDomHomeChange} minimalChrome onActivate={()=>void act('reveal-preview',{targetId:target.viewId,controlEpoch:state.controlEpoch})}/>}/>:null}
  </CodexCuScope>;
}
function installComputerUseClient(ctx, shared){
  const browserWorkspace=createBrowserWorkspaceTabs({sidebar:ctx.sidebarRight,kind:browserResourceKind,api,
    onState:(state,id)=>statePool.publish(id,state),onError:(error,id)=>window.dispatchEvent(new CustomEvent('opencu-browser-workspace-error',{detail:{id,message:error.message}}))});
  shared.browserWorkspace=browserWorkspace;
  installBrowserWorkspaceTransferMenu(ctx,{kind:browserResourceKind,workspace:browserWorkspace,api,
    onState:(state,id)=>statePool.publish(id,state),onError:(error,id)=>window.dispatchEvent(new CustomEvent('opencu-browser-workspace-error',{detail:{id,message:error.message}}))});
  ctx.effect(()=>ctx.sidebarRight.registerCloseHandler(browserResourceKind,browserWorkspace.closeHandler));
  ctx.effect(()=>()=>{if(shared.browserWorkspace===browserWorkspace)shared.browserWorkspace=null;return browserWorkspace.dispose();});
  const useOptions = () => useSyncExternalStore(shared.subscribe, shared.current);
  installComputerReferenceMessages(ctx);
  installWindowShareDraftAttachments(ctx);
  installCodexAppshotCommand(ctx, sessionId => {
    const {state}=useStateView(sessionId);
    return state?.enabled===true && state.nativeInstalled===true;
  });
  computerGroupPresentation(ctx);
  ctx.effect(()=>{const style=document.createElement('style');style.dataset.plugin='trisoul-x-computer-use';style.textContent=css+'\n'+codexCuStyles;document.head.append(style);return()=>style.remove();});
  const settingsSessionSubscribe=listener=>ctx.uiSession.adapter.current.subscribe(listener);
  const settingsSessionSnapshot=()=>ctx.uiSession.adapter.current.getSnapshot().key;
  function ComputerSettingsSection() {
    const sessionId=useSyncExternalStore(settingsSessionSubscribe,settingsSessionSnapshot);
    // Setup is global; retain the actual conversation when one exists, while
    // allowing the global setup endpoint to serve a projectless settings page.
    return <ComputerSetup sessionId={sessionId} visible api={api}/>;
  }
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'opencu-computer-use',order:19,label:()=>formatCodexCuMessage({id:'settings.nav.computer-use',defaultMessage:'Computer use'})},ComputerSettingsSection));
  const conversationVisible = sessionId => document.visibilityState==='visible' && ctx.layout.panelInfo.getSnapshot().activePanelId===null && ctx.uiSession.adapter.current.getSnapshot().key===sessionId;
  function ComputerEntry(props){
    const { presentation } = useOptions();
    const generation=useRef(0),currentSession=useRef(props.sessionId);currentSession.current=props.sessionId;
    const nativeSubscribe=useCallback(listener=>{
      const session=ctx.uiSession.adapter.current.subscribe(listener),panel=ctx.layout.panelInfo.subscribe(listener);
      document.addEventListener('visibilitychange',listener);
      return()=>{session();panel();document.removeEventListener('visibilitychange',listener);};
    },[]);
    const nativeSnapshot=useCallback(()=>conversationVisible(props.sessionId),[props.sessionId]);
    const nativePresentationActive=useSyncExternalStore(nativeSubscribe,nativeSnapshot);
    useEffect(()=>{generation.current++;return()=>{generation.current++;};},[props.sessionId]);
    const open=async()=>{
      const id=props.sessionId,stamp=generation.current;
      const current=await api('state',id);
      if(currentSession.current!==id||generation.current!==stamp||!conversationVisible(id))return false;
      const target=current.viewTarget??current.target;
      if(target?.kind==='tab')browserWorkspace.open(id,target);
      else ctx.sidebarRight.openTab(target?computerKind:ctx.sidebarRightTabs.get(browserKind)?.id==='opencu/managed-browser'?browserKind:legacyBrowserKind);
    };
    const present=async request=>{
      const id=props.sessionId,stamp=generation.current;
      const latest=await api('state',id);
      const active=()=>currentSession.current===id&&generation.current===stamp&&conversationVisible(id);
      if(latest.presentationRequest?.id!==request.id||Date.now()>=request.expiresAt||!active())return false;
      const visible=()=>[...document.querySelectorAll('.tx-cu-pane-browser')].some(node=>node.dataset.cuSession===props.sessionId&&node.dataset.cuTarget===request.tabId&&node.getClientRects().length>0&&node.getBoundingClientRect().width>0);
      if(request.visible){if(await open()===false)return false;}
      else if(visible()&&ctx.sidebarRight.isExpanded())ctx.sidebarRight.toggleExpanded();
      const end=Date.now()+1800;
      while(active()&&visible()!==request.visible&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,30));
      if(!active())return false;
      if(visible()!==request.visible)throw new Error('当前 DSH 页面未能切换浏览器预览显示状态。');
    };
    return <ComputerController {...presentation} {...props} nativePresentationActive={nativePresentationActive} conversation={ctx.get('conversation')} onOpen={open} onPresentation={present}/>;
  }
  function StandaloneEntry(props){const options=useOptions();return options.integrated?null:<ComputerEntry {...props}/>;}
  ctx.slots.inject('conversation.composer.dock',()=>ctx.slots.register({name:'conversation.composer.dock',id:'trisoul-computer-use',order:25},StandaloneEntry));
  const id='trisoul_x/trisoul-x-computer-use',managedId='opencu/managed-browser',legacyId='opencu/legacy-browser',resourceId='opencu/browser-resource';
  ctx.effect(()=>ctx.sidebarRightTabs.register({id,kind:computerKind,title:()=>'应用',guide:[]}));
  // The registry restores the builtin when this scoped extension leaves.
  // Keep the native command: it resolves the active browser kind at invocation.
  ctx.effect(()=>{
    let release,unsubscribeState,sessionId,enabled=false;
    const register=()=>{
      if(!enabled){const previous=release;release=undefined;previous?.();return;}
      if(release)return;
      const current=ctx.sidebarRightTabs.get(browserKind);
      if(current&&current.id!==HOST_BROWSER_ID)return;
      release=ctx.sidebarRightTabs.register({id:managedId,kind:browserKind,priority:'extension',multiple:true,keepMounted:true,title:()=>'新标签页',
        guide:[{id:'new',commandId:'browser.new',order:30,title:()=>'浏览器',icon:()=> <ComputerIcon name="browser" size={17}/>} ]});
    };
    const unsubscribe=ctx.sidebarRightTabs.subscribe(register);
    const readState=()=>{
      const state=sessionId?statePool.snapshot(sessionId).state:null;
      if(state?.enabled===true||state?.enabled===false){enabled=state.enabled;register();}
    };
    const changeSession=()=>{
      const nextSession=ctx.uiSession.adapter.current.getSnapshot().key;
      if(nextSession===sessionId)return;
      unsubscribeState?.();
      sessionId=nextSession;
      enabled=false;register();
      unsubscribeState=sessionId?statePool.subscribe(sessionId,readState):undefined;
      readState();
    };
    const unsubscribeSession=ctx.uiSession.adapter.current.subscribe(changeSession);
    changeSession();
    return()=>{unsubscribeSession();unsubscribeState?.();unsubscribe();release?.();};
  });
  // Restore old saved OpenCU pages without adding a second guide entry.
  ctx.effect(()=>ctx.sidebarRightTabs.register({id:legacyId,kind:legacyBrowserKind,multiple:true,keepMounted:true,title:()=>'新标签页',guide:[]}));
  ctx.effect(()=>ctx.sidebarRightTabs.register({id:resourceId,kind:browserResourceKind,patterns:['dsh-resource://opencu-tab/**'],keepMounted:true,title:()=>'浏览器'}));
  function PreviewTitle({sessionId,useTabInfo,browserOnly=false}) {
    const {tab}=useTabInfo();
    const {state}=useStateView(sessionId,tab.visible);
    useBrowserWorkspaceRevision(browserWorkspace,sessionId);
    const binding=tab.kind===browserResourceKind?browserWorkspace.parse(tab.contentId):null;
    const boundTarget=binding?.sessionId===sessionId?(browserWorkspace.inventory(sessionId).find(value=>value.id===binding.tabId&&value.browserId===binding.browserId)
      ??state?.previewTargets?.find(value=>value.id===binding.tabId&&value.browserId===binding.browserId)):null;
    const viewed=binding?boundTarget?{...boundTarget,kind:'tab'}:null:browserOnly?null:state?.viewTarget??state?.target;
    const target=browserOnly&&viewed?.kind!=='tab'?null:viewed;
    const title=target?.title||target?.name||(browserOnly?'新标签页':'应用');
    return <span className="tx-cu-content-title" title={title}><ComputerIcon name={browserOnly||target?.kind==='tab'?'browser':'screen'} size={14}/><span>{title}</span></span>;
  }
  ctx.slots.inject('sidebar.right.pane.tab.title',()=>ctx.slots.register({name:'sidebar.right.pane.tab.title',key:id},PreviewTitle));
  const browserSubscribe = listener => ctx.sidebarRightTabs.subscribe(listener);
  const browserSnapshot = () => ctx.sidebarRightTabs.get('browser')?.id ?? null;
  function HostComputerPane(props) {
    const { presentation } = useOptions();
    const available = useSyncExternalStore(browserSubscribe, browserSnapshot);
    const submitDirectAnnotation=useCallback(request=>submitScopedAnnotation(ctx,props.sessionId,request),[props.sessionId]);
    return <ComputerPane {...presentation} {...props} browserWorkspace={browserWorkspace} submitDirectAnnotation={submitDirectAnnotation} conversation={ctx.get('conversation')} nativeBrowserAvailable={!!available} hostBrowserAvailable={available===HOST_BROWSER_ID}/>;
  }
  function Pane(props){
    const {renderPane}=useOptions();
    const submitDirectAnnotation=useCallback(request=>submitScopedAnnotation(ctx,props.sessionId,request),[props.sessionId]);
    return renderPane?renderPane({...props,conversation:ctx.get('conversation'),submitDirectAnnotation}):<HostComputerPane {...props}/>;
  }
  ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:id},Pane));
  function ManagedBrowser(props){return <HostComputerPane {...props} browserOnly/>;}
  function ManagedTitle(props){return <PreviewTitle {...props} browserOnly/>;}
  ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:managedId},ManagedBrowser));
  ctx.slots.inject('sidebar.right.pane.tab.title',()=>ctx.slots.register({name:'sidebar.right.pane.tab.title',key:managedId},ManagedTitle));
  ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:legacyId},ManagedBrowser));
  ctx.slots.inject('sidebar.right.pane.tab.title',()=>ctx.slots.register({name:'sidebar.right.pane.tab.title',key:legacyId},ManagedTitle));
  ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:resourceId},ManagedBrowser));
  ctx.slots.inject('sidebar.right.pane.tab.title',()=>ctx.slots.register({name:'sidebar.right.pane.tab.title',key:resourceId},ManagedTitle));
  for(const key of ['computer_use','computer_use_reset'])ctx.slots.inject('tool.call.toolview',()=>ctx.slots.register({name:'tool.call.toolview',key},ComputerCard));
  ctx.inject(['inputTriggers'],scope=>{
    let inventoryCache,inventoryAt=0,inflight;
    const inventoryFor=async id=>{
      if(inventoryCache&&Date.now()-inventoryAt<4000)return inventoryCache;
      if(!inflight)inflight=api('inventory',id,{}).then(value=>{inventoryCache=value;inventoryAt=Date.now();return value;}).finally(()=>{inflight=null;});
      return inflight;
    };
    scope.effect(()=>scope.inputTriggers.registerSource({trigger:'@',name:'Computer Use',order:15,
      async candidates(session,request){
        const inventory=await inventoryFor(session.sessionId);if(request.signal.aborted)return[];
        return buildCodexTargetCandidates(inventory, request.query, { iconFor: createCodexTargetCandidateIcon });
      },
      onPick:({candidate})=>({insert:{source:'Computer Use',ref:candidate.value,label:candidate.name,appearance:'session',clipboardText:'@'+candidate.name}}),
      codec:{clipboardText:ref=>'@'+JSON.parse(ref).id,serialize:async ref=>'<computer-use-target>'+JSON.stringify(JSON.parse(ref)).replaceAll('<','\\u003c')+'</computer-use-target>'},
    }));
  });
  return { ComputerEntry, ComputerPane: HostComputerPane };
}

// One UI registration set per DSH client, regardless of package load order.
const sharedKey = Symbol.for('opencu.client.v1');
export function applyComputerUseClient(ctx, options = {}) {
  const root = ctx.root;
  let shared = root[sharedKey];
  if (!shared) {
    const owners = new Map(), listeners = new Set(), empty = {};
    shared = { owners, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      current: () => [...owners.values()].find(value => value.integrated) ?? owners.values().next().value ?? empty,
      changed: () => {
        for (const listener of listeners) {
          try { listener(); } catch (error) { console.error('Computer Use subscriber failed:', error); }
        }
      } };
    root[sharedKey] = shared;
    shared.start = () => {
      // Chat's factory owns its styles, so a new lifetime starts only after
      // the previous shared scope has finished removing its registrations.
      let pendingChat = createChat(require);
      const inject = [...new Set(['slots', 'sidebarRightTabs', 'sidebarRight', 'layout', 'uiSession', ...pendingChat.inject])];
      shared.fiber = root.plugin({ name: 'opencu-ui', inject, async apply(scope) {
        // Reacquire factory styles when a host service restarts this scope.
        const nativeChat = pendingChat ?? createChat(require); pendingChat = null;
        scope.effect(() => () => document.querySelectorAll('style[data-plugin="opencu-shared-chat"]').forEach(tag => tag.remove()));
        const currentForm = () => scope.configForms.get(shared.current().integrated ? 'omd-ui-chat' : 'opencu-ui-chat');
        // The native Chat keeps one store; only its preference owner changes
        // when the standalone and integrated packages are loaded together.
        const settings = createChatSettings(currentForm, shared.subscribe);
        scope.effect(() => () => settings.dispose());
        const onOpenInAppBrowser = (result, sessionId) => {
          if (scope.uiSession.adapter.current.getSnapshot().key !== sessionId
            || scope.layout.panelInfo.getSnapshot().activePanelId !== null || document.visibilityState !== 'visible') {
            throw new Error('当前会话已改变，浏览器标签页已保留在原会话。');
          }
          const state = result.state;
          const target = state?.viewTarget ?? state?.target;
          if (target?.kind !== 'tab') throw new Error('浏览器没有返回可显示的标签页。');
          statePool.publish(sessionId, state);
          if(shared.browserWorkspace)shared.browserWorkspace.open(sessionId,target);
          else scope.sidebarRight.openTab(computerKind);
        };
        await scope.plugin(nativeChat, { settings, renderChatView: (children, props) =>
          <CodexBrowserOwnedChatLinkConsumer sessionId={props.sessionId} api={api} onOpenInAppBrowser={onOpenInAppBrowser}>
            {children}
          </CodexBrowserOwnedChatLinkConsumer> });
        if (!shared.owners.size || shared.stopping) return;
        const installed = installComputerUseClient(scope, shared);
        scope.effect(() => () => {
          if (shared.entry !== installed.ComputerEntry) return;
          shared.entry = undefined; shared.pane = undefined; shared.changed();
        });
        shared.entry = installed.ComputerEntry; shared.pane = installed.ComputerPane;
        shared.changed();
      } });
    };
  }
  const owner = Symbol();
  ctx.effect(() => {
    shared.owners.set(owner, options);
    return () => {
      shared.owners.delete(owner);
      if (shared.owners.size) { shared.changed(); return; }
      if (shared.stopping) return shared.stopping;
      const fiber = shared.fiber;
      shared.fiber = null;
      const stopping = Promise.resolve().then(() => fiber?.dispose()).finally(() => {
        if (shared.stopping !== stopping) return;
        document.querySelectorAll('style[data-plugin="opencu-shared-chat"]').forEach(tag => tag.remove());
        shared.stopping = null;
        if (shared.owners.size) shared.start();
        else if (root[sharedKey] === shared) delete root[sharedKey];
      });
      shared.stopping = stopping;
      shared.entry = undefined; shared.pane = undefined; shared.changed();
      return stopping;
    };
  });
  shared.changed();
  if (shared.owners.size && !shared.fiber && !shared.stopping) shared.start();
  function ComputerEntry(props) {
    useSyncExternalStore(shared.subscribe, () => shared.entry);
    const Entry = shared.entry;
    return Entry ? <Entry {...props}/> : null;
  }
  function PaneEntry(props) {
    useSyncExternalStore(shared.subscribe, () => shared.pane);
    const Pane = shared.pane;
    return Pane ? <Pane {...props}/> : null;
  }
  return { ComputerEntry, ComputerPane: PaneEntry };
}
