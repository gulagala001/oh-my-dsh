import { createChat } from '../../lib/chat.factory.mjs';
import { createChatSettings } from './chat-settings.mjs';
import { createComputerStatePool } from './state-pool.mjs';
import { HOST_BROWSER_ID, hostPreviewUrl, openHostBrowserPreview } from './host-browser.mjs';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import css from './computer-use.css';
import { BrowserPreview } from './browser-preview.jsx';
import { NativePreview } from './native-preview.jsx';
import { BrowserControls } from './browser-controls.jsx';
import { installComputerReferenceMessages } from './computer-reference.jsx';
import { computerGroupPresentation } from './computer-groups.jsx';
import { ComputerSetup } from './computer-setup.jsx';
import { WindowShare } from './window-share.jsx';
import {FloatingPreview} from './floating-preview.jsx';
import { usePreviewPaneVisible, usePreviewPanePresence } from './preview-presence.mjs';
import { PageAnnotation } from './page-annotation.jsx';
import { ComputerIcon } from './computer-icons.jsx';
import { ComputerCard } from './computer-card.jsx';
import { computerActivity, computerOperationLabel } from './computer-activity.mjs';

const base='trisoul-x/computer-use/';
const url=(op,id)=>base+op+'?session='+encodeURIComponent(id);
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
const ScreenIcon=()=> <ComputerIcon name="screen" size={17}/>;
const names={running:'正在操作',idle:'就绪',stopped:'已停止',stopping:'正在停止',error:'需要处理'};
function ComputerChip({sessionId,onOpen,onPresentation,inputActions,conversation}){
  const{state,setState,setError,error}=useStateView(sessionId);const previewAnchor=useRef(null);
  const [pending,setPending]=useState(''),currentSession=useRef(sessionId);currentSession.current=sessionId;
  useEffect(()=>{setPending('');},[sessionId]);
  const control=async op=>{if(pending)return;setPending(op);try{const next=await api(op,sessionId,{});if(currentSession.current===sessionId)setState(next);}catch(error){if(currentSession.current===sessionId)setError(error.message);}finally{if(currentSession.current===sessionId)setPending('');}};
  const paneVisible=usePreviewPaneVisible(sessionId);
  const presentationHandler=useRef(onPresentation);presentationHandler.current=onPresentation;
  useEffect(()=>{
    const request=state?.presentationRequest;
    if(!request||request.sessionId!==sessionId)return;
    let live=true;
    void Promise.resolve().then(()=>{if(live)return presentationHandler.current(request);}).then(applied=>live&&applied!==false&&api('presentation-ack',sessionId,{id:request.id,visible:request.visible}),error=>live&&api('presentation-ack',sessionId,{id:request.id,visible:request.visible,error:error.message})).catch(error=>{if(live)setError(error.message);});
    return()=>{live=false;};
  },[sessionId,state?.presentationRequest?.id]);
  if(!sessionId||state?.enabled===false)return null;
  const active=!!state?.target&&(state.status==='running'||state.status==='stopping'||state.status==='error'||state.transitioning);
  return <div ref={previewAnchor} data-cu-session={sessionId} className="tx-cu-chip" title={error||undefined}>
    <button type="button" className="tx-cu-entry" aria-label="打开 Computer Use" title="查看和操作应用、网页" onClick={onOpen}><ScreenIcon/><span>电脑</span></button>
    <FloatingPreview sessionId={sessionId} state={state} url={url} api={api} onState={setState} onError={setError} anchor={previewAnchor} onOpen={onOpen} paneVisible={paneVisible}/>
    <WindowShare sessionId={sessionId} inputActions={inputActions} conversation={conversation}/>
    {state?.vision?.input==='text'&&<span className="tx-cu-vision-warning" title="当前模型仅接收文字，截图不会送入模型。">仅文本模型</span>}
    {state?.target&&<span className="tx-cu-chip-status" role="status">{pending==='stop'?'正在停止':pending==='resume'||state.resuming?'正在恢复':state.transitioning?'正在载入':names[state.status]}</span>}
    {active&&<button type="button" title="停止操作" aria-label="停止操作" disabled={!!pending||state.status==='stopping'} onClick={()=>void control('stop')}><ComputerIcon name="stop" size={13}/></button>}
    {state?.status==='stopped'&&!state.transitioning&&<button type="button" className="tx-cu-chip-resume" disabled={!!pending||state.resuming} onClick={()=>void control('resume')}><ComputerIcon name="play" size={12}/>恢复控制</button>}
    {error&&<span className="tx-cu-chip-error tx-cu-error" role="alert">{error}</span>}
  </div>;
}
export function ComputerPane({sessionId,useTabInfo,inputActions,conversation,hostBrowserAvailable=false}){
  const{tab}=useTabInfo();const{state,error,setState,setError}=useStateView(sessionId,tab.visible);
  usePreviewPanePresence(sessionId,tab.visible);
  const target=state?.viewTarget??state?.target;
  const[busy,setBusy]=useState(false),[navigation,setNavigation]=useState(null),[frame,setFrame]=useState(null),controls=useRef(null);
  const [supportOpen,setSupportOpen]=useState(false);
  const[previewScale,setPreviewScale]=useState('1'),[deviceMode,setDeviceMode]=useState(false);
  const currentSession=useRef(sessionId);currentSession.current=sessionId;
  useEffect(()=>{setNavigation(null);},[target?.id]);
  useEffect(()=>{setBusy(false);},[sessionId]);
  const act=async(op,value={})=>{if(busy)return;setBusy(true);try{const next=await api(op,sessionId,value);if(currentSession.current===sessionId){setState(next);setError('');}}catch(e){if(currentSession.current===sessionId)setError(e.message);}finally{if(currentSession.current===sessionId)setBusy(false);}};
  const previewUrl = hostPreviewUrl(target, navigation);
  const browserActions=target?.kind==='tab'?<>
    {hostBrowserAvailable && previewUrl && <button type="button" aria-label="在官方浏览器中预览" title="用官方浏览器打开独立预览；不会改变助手控制的网页" onClick={() => { try { openHostBrowserPreview(tab.actions, previewUrl); } catch (error) { setError(error.message); } }}><ComputerIcon name="browser" size={15}/></button>}
    <PageAnnotation compact sessionId={sessionId} frame={state.enabled?frame:null} target={target} inputActions={inputActions} conversation={conversation} api={api}/>
    {state?.target&&target.id!==state.target.id&&<button type="button" aria-label="查看助手当前画面" title="查看助手当前画面" onClick={()=>act('view-tab',{current:true})}><ComputerIcon name="return" size={15}/></button>}
    {state?.status==='stopped'&&!state?.transitioning?<button type="button" className="is-resume" aria-label="恢复助手控制" title="恢复助手控制" disabled={busy} onClick={()=>act('resume')}><ComputerIcon name="play" size={14}/></button>:<button type="button" aria-label="停止并接管" title="停止并接管" disabled={busy||state?.status==='stopping'} onClick={()=>act('stop')}><ComputerIcon name="stop" size={14}/></button>}
  </>:null;
  return <div data-cu-session={sessionId} data-cu-target={target?.id} className={'tx-cu-pane'+(target?.kind==='tab'?' tx-cu-pane-browser':'')}>{target?.kind!=='tab'&&<header>
    <div className="tx-cu-pane-heading"><ScreenIcon/><div><strong title={target?.name}>{target?.name??'应用预览'}</strong><span className={'tx-cu-status '+(state?.status==='running'?'is-running':'')}>{computerActivity(state)}</span></div></div>
    {state?.target&&target?.id!==state.target.id&&<button type="button" onClick={()=>act('view-tab',{current:true})}>查看助手当前画面</button>}
    <div className="tx-cu-toolbar">
      {target?.kind==='app'&&<button type="button" title="显示应用窗口" aria-label="显示应用窗口" disabled={busy} onClick={()=>act('reveal-preview',{targetId:target.viewId,controlEpoch:state.controlEpoch})}><ComputerIcon name="popout" size={15}/></button>}
      {state?.status==='stopped'&&!state?.transitioning?<button type="button" className="tx-cu-primary" aria-label="恢复助手控制" disabled={busy||state.resuming} onClick={()=>act('resume')}><ComputerIcon name="play" size={12}/>恢复控制</button>:target&&<button type="button" className="tx-cu-stop" aria-label="停止并接管" disabled={busy||state?.status==='stopping'} onClick={()=>act('stop')}><ComputerIcon name="stop" size={12}/>停止</button>}
    </div>
    </header>}
    {state?.vision?.input==='text'&&<p className="tx-cu-vision-warning" role="status">{state.vision.name} 当前仅接收文字，截图不会送入模型。需要看图时，请在输入区切换支持图片的模型；应用控件文字仍可读取。</p>}
    {!target&&<div className="tx-cu-empty"><ScreenIcon/><h3>应用和网页</h3><p>在对话中 @ 选择应用或网页，画面会显示在这里。</p></div>}
    <BrowserControls ref={controls} sessionId={sessionId} state={state} visible={tab.visible} navigation={navigation} frame={frame} api={api} onState={setState} onError={setError} previewScale={previewScale} onPreviewScale={setPreviewScale} onDeviceModeChange={setDeviceMode} actions={browserActions}/>
    {(error||state?.lastError)&&<p className="tx-cu-error" role="alert">{error||state.lastError.message}</p>}
    {target?.kind==='tab'?<BrowserPreview key={target.id} sessionId={sessionId} tabId={target.id} pageUrl={navigation?.tabId===target.id?navigation.url:target.url} visible={tab.visible} state={state} api={api} url={url} onState={setState} onError={setError} onNavigation={setNavigation} onFrame={setFrame} onBrowserShortcut={action=>controls.current?.shortcut(action)} onViewportResize={size=>controls.current?.resizeViewport(size)} deviceMode={deviceMode} previewScale={previewScale}/>:target?.kind==='app'?<NativePreview key={target.viewId} sessionId={sessionId} targetId={target.viewId} visible={tab.visible} state={state} url={url} onError={setError}/>:null}
    <details className="tx-cu-pane-support" open={supportOpen} onToggle={event=>setSupportOpen(event.currentTarget.open)}>
      <summary><ComputerIcon name="settings" size={14}/>设置与操作记录<ComputerIcon name="chevron" size={13}/></summary>
      <ComputerSetup sessionId={sessionId} visible={tab.visible&&supportOpen} api={api}/>
      {!!state?.history?.length&&<details className="tx-cu-history"><summary>最近操作 · {state.history.length}</summary>{state.history.slice().reverse().map((h,i)=><div key={i}><span title={h.operation} className={h.ok||h.cancelled?'':'tx-cu-error'}>{computerOperationLabel(h.operation)}{h.cancelled?' · 已取消':!h.ok?' · 失败':''}</span><span>{(h.elapsedMs/1000).toFixed(1)} 秒</span>{h.error&&<small>{h.error}</small>}</div>)}</details>}
    </details>
  </div>;
}
function installComputerUseClient(ctx, shared){
  const useOptions = () => useSyncExternalStore(shared.subscribe, shared.current);
  installComputerReferenceMessages(ctx);
  computerGroupPresentation(ctx);
  ctx.effect(()=>{const style=document.createElement('style');style.dataset.plugin='trisoul-x-computer-use';style.textContent=css;document.head.append(style);return()=>style.remove();});
  function ComputerEntry(props){
    const { openPanel } = useOptions();
    const open=()=>openPanel?openPanel('computer'):ctx.sidebarRight.openTab('trisoul-x-computer-use');
    const present=async request=>{
      const latest=await api('state',props.sessionId);
      const active=()=>document.visibilityState==='visible'&&[...document.querySelectorAll('.tx-cu-chip')].some(node=>node.dataset.cuSession===props.sessionId&&node.getClientRects().length>0);
      if(latest.presentationRequest?.id!==request.id||Date.now()>=request.expiresAt||!active())return false;
      const visible=()=>[...document.querySelectorAll('.tx-cu-pane-browser')].some(node=>node.dataset.cuSession===props.sessionId&&node.dataset.cuTarget===request.tabId&&node.getClientRects().length>0&&node.getBoundingClientRect().width>0);
      if(request.visible)open();
      else if(visible()&&ctx.sidebarRight.isExpanded())ctx.sidebarRight.toggleExpanded();
      const end=Date.now()+1800;
      while(active()&&visible()!==request.visible&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,30));
      if(!active())return false;
      if(visible()!==request.visible)throw new Error('当前 DSH 页面未能切换浏览器预览显示状态。');
    };
    return <ComputerChip {...props} conversation={ctx.get('conversation')} onOpen={open} onPresentation={present}/>;
  }
  function StandaloneEntry(props){const options=useOptions();return options.integrated?null:<ComputerEntry {...props}/>;}
  ctx.slots.inject('conversation.composer.dock',()=>ctx.slots.register({name:'conversation.composer.dock',id:'trisoul-computer-use',order:25},StandaloneEntry));
  const id='trisoul_x/trisoul-x-computer-use';
  ctx.effect(()=>{
    let dispose;
    const register=()=>{dispose?.();dispose=ctx.sidebarRightTabs.register({id,kind:'trisoul-x-computer-use',title:()=>shared.current().guideTitle??'Computer Use',guide:[{id:'opencu-preview',order:shared.current().guideOrder??6,title:()=>shared.current().guideTitle??'Computer Use',description:()=>'查看应用与网页画面',icon:ScreenIcon}]});};
    register();const unsubscribe=shared.subscribe(register);
    return()=>{unsubscribe();dispose?.();};
  });
  function PreviewTitle({sessionId,useTabInfo}) {
    const {tab}=useTabInfo();
    const {state}=useStateView(sessionId,tab.visible);
    const options=useOptions(),target=state?.viewTarget??state?.target;
    const title=target?.title||target?.name||options.guideTitle||'Computer Use';
    return <span className="tx-cu-content-title" title={title}><ComputerIcon name={target?.kind==='tab'?'browser':'screen'} size={14}/><span>{title}</span></span>;
  }
  ctx.slots.inject('sidebar.right.pane.tab.title',()=>ctx.slots.register({name:'sidebar.right.pane.tab.title',key:id},PreviewTitle));
  const browserSubscribe = listener => ctx.sidebarRightTabs.subscribe(listener);
  const browserSnapshot = () => ctx.sidebarRightTabs.get('browser')?.id === HOST_BROWSER_ID;
  function HostComputerPane(props) {
    const available = useSyncExternalStore(browserSubscribe, browserSnapshot);
    return <ComputerPane {...props} conversation={ctx.get('conversation')} hostBrowserAvailable={available}/>;
  }
  function Pane(props){const {renderPane}=useOptions();return renderPane?renderPane(props):<HostComputerPane {...props}/>;}
  ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:id},Pane));
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
        const entries=[...inventory.browsers.map(b=>({name:b.type==='managed'?'Browser':b.name,description:b.type==='managed'?'内置浏览器 · 独立工作配置':'浏览器 · '+b.name,ref:{kind:'browser',id:b.id}})),...inventory.browsers.flatMap(b=>b.tabs.map(t=>({name:t.title||t.url,description:'网页 · '+t.url,ref:{kind:'tab',id:t.id,browser:b.id,url:t.url,title:t.title}}))),...inventory.apps.map(a=>({name:a.displayName??a.id,description:a.isRunning?'桌面应用 · 正在运行':'桌面应用',ref:{kind:'app',id:a.id}}))];
        return entries.filter(e=>(e.name+' '+e.description).toLowerCase().includes(request.query.toLowerCase())).slice(0,30).map(e=>({name:e.name,description:e.description,icon:'session',value:JSON.stringify({...e.ref,label:e.name})}));
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
    // The shared Chat lifetime owns its styles across both OMD and OpenCU.
    // Native module removal must not remove this replacement's styles.
    const nativeChat = createChat(require);
    const owners = new Map(), listeners = new Set(), empty = {};
    shared = { owners, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      current: () => [...owners.values()].find(value => value.integrated) ?? owners.values().next().value ?? empty,
      changed: () => { for (const listener of listeners) listener(); } };
    root[sharedKey] = shared;
    shared.fiber = root.plugin({ name: 'opencu-ui', inject: ['slots', 'sidebarRightTabs', 'sidebarRight', ...nativeChat.inject], async apply(scope) {
      scope.effect(() => () => document.querySelectorAll('style[data-plugin="opencu-shared-chat"]').forEach(tag => tag.remove()));
      const currentForm = () => scope.configForms.get(shared.current().integrated ? 'omd-ui-chat' : 'opencu-ui-chat');
      // The native Chat keeps one store; only its preference owner changes
      // when the standalone and integrated packages are loaded together.
      const settings = createChatSettings(currentForm, shared.subscribe);
      scope.effect(() => () => settings.dispose());
      await scope.plugin(nativeChat, { settings });
      const installed = installComputerUseClient(scope, shared);
      shared.entry = installed.ComputerEntry; shared.pane = installed.ComputerPane;
      shared.changed();
    } });
  }
  const owner = Symbol(); shared.owners.set(owner, options); shared.changed();
  ctx.effect(() => () => {
    shared.owners.delete(owner); shared.changed();
    if (shared.owners.size) return;
    if (root[sharedKey] === shared) delete root[sharedKey];
    return shared.fiber.dispose();
  });
  function ComputerEntry(props) {
    useSyncExternalStore(shared.subscribe, () => shared.entry);
    const Entry = shared.entry;
    return Entry ? <Entry {...props}/> : null;
  }
  const fallbackSubscribe = listener => ctx.sidebarRightTabs.subscribe(listener);
  const fallbackSnapshot = () => ctx.sidebarRightTabs.get('browser')?.id === HOST_BROWSER_ID;
  function FallbackPane(props) {
    const available = useSyncExternalStore(fallbackSubscribe, fallbackSnapshot);
    return <ComputerPane {...props} conversation={ctx.get('conversation')} hostBrowserAvailable={available}/>;
  }
  function PaneEntry(props) {
    useSyncExternalStore(shared.subscribe, () => shared.pane);
    const Pane = shared.pane || FallbackPane;
    return <Pane {...props}/>;
  }
  return { ComputerEntry, ComputerPane: PaneEntry };
}
