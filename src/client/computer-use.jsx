import React, { useEffect, useId, useRef, useState } from 'react';
import css from './computer-use.css';
import { BrowserPreview } from './browser-preview.jsx';
import { NativePreview } from './native-preview.jsx';
import { BrowserControls } from './browser-controls.jsx';
import { installComputerReferenceMessages } from './computer-reference.jsx';
import { computerGroupPresentation } from './computer-groups.jsx';
import { ComputerSetup } from './computer-setup.jsx';
import { WindowShare } from './window-share.jsx';
import {FloatingPreview} from './floating-preview.jsx';
import { PageAnnotation } from './page-annotation.jsx';
import { ComputerIcon } from './computer-icons.jsx';
import {SavedImage} from './tool-image.jsx';

const base='/trisoul-x/computer-use/';
const url=(op,id)=>base+op+'?session='+encodeURIComponent(id);
async function api(op,id,value,signal){const r=await fetch(url(op,id),value===undefined?{signal}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal});const body=await r.json();if(!r.ok)throw Object.assign(new Error(body.error??'Computer Use 请求失败'),{code:body.code});if(value!==undefined&&body.status)window.dispatchEvent(new CustomEvent('trisoul-cu-state',{detail:{id,state:body}}));return body;}
function useStateView(id,visible=true){
  const[state,setState]=useState(null),[error,setError]=useState(''),[connectionError,setConnectionError]=useState('');
  useEffect(()=>{setState(null);setError('');if(!id||!visible)return;let live=true,timer,revision=0;const update=next=>setState(previous=>previous&&((next.controlEpoch??0)<(previous.controlEpoch??0)||(next.navigationRevision??0)<(previous.navigationRevision??0)||(next.viewRevision??0)<(previous.viewRevision??0))?previous:next);const changed=e=>{if(e.detail.id===id){revision++;update(e.detail.state);setError('');}};window.addEventListener('trisoul-cu-state',changed);const tick=async()=>{const before=revision;try{const s=await api('state',id);if(live&&revision===before){update(s);setConnectionError('');}}catch(e){if(live)setConnectionError(e.message);}if(live)timer=setTimeout(tick,800);};void tick();return()=>{live=false;clearTimeout(timer);window.removeEventListener('trisoul-cu-state',changed);};},[id,visible]);
  return{state,error:error||connectionError,setState,setError};
}
const ScreenIcon=()=> <ComputerIcon name="screen" size={17}/>;
const names={running:'正在操作',idle:'就绪',stopped:'已停止',stopping:'正在停止',error:'需要处理'};
function ComputerChip({sessionId,onOpen,inputActions,conversation}){
  const{state,setState,setError,error}=useStateView(sessionId);const previewAnchor=useRef(null);
  if(!sessionId||state?.enabled===false)return null;
  const active=!!state?.target&&(state.status==='running'||state.status==='stopping'||state.status==='error'||state.transitioning);
  return <div ref={previewAnchor} className="tx-cu-chip" title={error||undefined}>
    <button type="button" className="tx-cu-entry" aria-label="打开 Computer Use" title="查看和操作应用、网页" onClick={onOpen}><ScreenIcon/><span>电脑</span></button>
    <FloatingPreview sessionId={sessionId} state={state} url={url} api={api} onState={setState} onError={setError} anchor={previewAnchor} onOpen={onOpen}/>
    <WindowShare sessionId={sessionId} inputActions={inputActions} conversation={conversation}/>
    {state?.vision?.input==='text'&&<span className="tx-cu-vision-warning" title="当前模型仅接收文字，截图不会送入模型。">仅文本模型</span>}
    {state?.target&&<span className="tx-cu-chip-status">{state.resuming?'正在恢复':state.transitioning?'正在载入':names[state.status]}</span>}
    {active&&<button type="button" title="停止操作" aria-label="停止操作" disabled={state.status==='stopping'} onClick={()=>api('stop',sessionId,{}).then(setState).catch(e=>setError(e.message))}><ComputerIcon name="stop" size={13}/></button>}
    {state?.status==='stopped'&&!state.transitioning&&<button type="button" className="tx-cu-chip-resume" onClick={()=>api('resume',sessionId,{}).then(setState).catch(e=>setError(e.message))}><ComputerIcon name="play" size={12}/>恢复控制</button>}
  </div>;
}
export function ComputerPane({sessionId,useTabInfo,inputActions,conversation}){
  const{tab}=useTabInfo();const{state,error,setState,setError}=useStateView(sessionId,tab.visible);
  const target=state?.viewTarget??state?.target;
  const[busy,setBusy]=useState(false),[navigation,setNavigation]=useState(null),[frame,setFrame]=useState(null),controls=useRef(null);
  const[previewScale,setPreviewScale]=useState('1'),[deviceMode,setDeviceMode]=useState(false);
  useEffect(()=>{setNavigation(null);},[target?.id]);
  const act=async(op,value={})=>{setBusy(true);try{setState(await api(op,sessionId,value));setError('');}catch(e){setError(e.message);}finally{setBusy(false);}};
  const browserActions=target?.kind==='tab'?<>
    <PageAnnotation compact sessionId={sessionId} frame={state.enabled?frame:null} target={target} inputActions={inputActions} conversation={conversation} api={api}/>
    {state?.target&&target.id!==state.target.id&&<button type="button" aria-label="查看助手当前画面" title="查看助手当前画面" onClick={()=>act('view-tab',{current:true})}><ComputerIcon name="return" size={15}/></button>}
    {state?.status==='stopped'&&!state?.transitioning?<button type="button" className="is-resume" aria-label="恢复助手控制" title="恢复助手控制" disabled={busy} onClick={()=>act('resume')}><ComputerIcon name="play" size={14}/></button>:<button type="button" aria-label="停止并接管" title="停止并接管" disabled={busy||state?.status==='stopping'} onClick={()=>act('stop')}><ComputerIcon name="stop" size={14}/></button>}
  </>:null;
  return <div className={'tx-cu-pane'+(target?.kind==='tab'?' tx-cu-pane-browser':'')}>{target?.kind!=='tab'&&<header>
    <div className="tx-cu-pane-heading"><ScreenIcon/><div><strong>Computer Use</strong><span className={'tx-cu-status '+(state?.status==='running'?'is-running':'')}>{state?.resuming?'正在恢复':state?.transitioning?'正在载入':names[state?.status]??'连接中'}</span></div></div>
    {state?.target&&target?.id!==state.target.id&&<button type="button" onClick={()=>act('view-tab',{current:true})}>查看助手当前画面</button>}
    <div className="tx-cu-toolbar">{target?.kind==='tab'&&<PageAnnotation sessionId={sessionId} frame={state.enabled?frame:null} target={target} inputActions={inputActions} conversation={conversation} api={api}/>} {state?.status==='stopped'&&!state?.transitioning?<button className="tx-cu-primary" onClick={()=>act('resume')}><ComputerIcon name="play" size={12}/>恢复助手控制</button>:target&&<button className="tx-cu-stop" disabled={busy} onClick={()=>act('stop')}><ComputerIcon name="stop" size={12}/>停止并接管</button>}</div>
    </header>}
    {state?.vision?.input==='text'&&<p className="tx-cu-vision-warning" role="status">{state.vision.name} 当前仅接收文字，截图不会送入模型。需要看图时，请在输入区切换支持图片的模型；应用控件文字仍可读取。</p>}
    {!target&&<div className="tx-cu-empty"><ScreenIcon/><h3>让助手操作应用和网页</h3><p>在对话中用 @ 选择应用或网页，<br/>也可以打开浏览器开始工作。</p></div>}
    <BrowserControls ref={controls} sessionId={sessionId} state={state} visible={tab.visible} navigation={navigation} frame={frame} api={api} onState={setState} onError={setError} previewScale={previewScale} onPreviewScale={setPreviewScale} onDeviceModeChange={setDeviceMode} actions={browserActions}/>
    {target&&target.kind!=='tab'&&<p className="tx-cu-target"><ComputerIcon/>{target.name??'当前应用'}</p>}
    {(error||state?.lastError)&&<p className="tx-cu-error" role="alert">{error||state.lastError.message}</p>}
    {target?.kind==='tab'?<BrowserPreview key={target.id} sessionId={sessionId} tabId={target.id} pageUrl={navigation?.tabId===target.id?navigation.url:target.url} visible={tab.visible} state={state} api={api} url={url} onState={setState} onError={setError} onNavigation={setNavigation} onFrame={setFrame} onBrowserShortcut={action=>controls.current?.shortcut(action)} onViewportResize={size=>controls.current?.resizeViewport(size)} deviceMode={deviceMode} previewScale={previewScale}/>:target?.kind==='app'?<NativePreview key={target.viewId} sessionId={sessionId} targetId={target.viewId} visible={tab.visible} state={state} url={url} onError={setError}/>:null}
    <div className="tx-cu-pane-support">
    <ComputerSetup sessionId={sessionId} visible={tab.visible} api={api}/>
    {!!state?.history?.length&&<details className="tx-cu-history"><summary>最近操作 · {state.history.length}</summary>{state.history.slice().reverse().map((h,i)=><div key={i}><span className={h.ok||h.cancelled?'':'tx-cu-error'}>{h.operation}{h.cancelled?' · 已取消':''}</span><span>{h.elapsedMs} ms</span>{h.error&&<small>{h.error}</small>}</div>)}</details>}
    </div>
  </div>;
}
function ComputerCard({block,loadImage,toolName,openFile}){
  const [open,setOpen]=useState(false),bodyId=useId();
  let args={};try{args=JSON.parse(block.call?.argsRaw??block.argsRaw??'{}');}catch{}
  const settled=block.kind==='tool-result',failure=block.isError||block.meta?.computerUseError;
  const content=block.content??[],message=content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
  const images=content.filter(c=>c.type==='image');
  const files=block.meta?.computerUseFiles??[];
  const stopped=failure&&/tool call aborted|COMPUTER_USE_STOPPED|Computer Use (?:was |is )?stopped|execution (?:was )?cancelled/i.test(message);
  const status=!settled?'执行中':stopped?'已停止':failure?'执行失败':'已执行';
  return <div className="tx-cu-card" data-state={!settled?'running':stopped?'stopped':failure?'error':'idle'}>
    <button type="button" className="tx-cu-card-heading" aria-expanded={open} aria-controls={bodyId} onClick={()=>setOpen(value=>!value)}>
      <span className="tx-cu-card-leading"><ComputerIcon name="screen" size={16}/><ComputerIcon className="tx-cu-card-chevron" name="chevron" size={14}/></span>
      <span className="tx-cu-card-title">{args.title??(toolName==='computer_use_reset'?'重置 Computer Use':'Computer Use')}</span>
      {!!images.length&&<span className="tx-cu-card-count">{images.length} 张截图</span>}
      {!!files.length&&<span className="tx-cu-card-count">{files.length} 个文件</span>}
      <small className={failure&&!stopped?'tx-cu-error':settled&&!stopped?'tx-cu-visually-hidden':''}>{status}</small>
    </button>
    {open&&<div className="tx-cu-card-body" id={bodyId}>
      {!!images.length&&<div className="tx-cu-result-images">{images.map((c,i)=><SavedImage key={i} attachment={c.attachment} loadImage={loadImage}/>)}</div>}
      {!!files.length&&<div className="tx-cu-export-files">{files.map((file,i)=><button key={i} type="button" onClick={()=>openFile?.(file.path)} disabled={!openFile} title={file.path}>{file.name}<small>{Math.ceil(file.bytes/1024)} KB</small></button>)}</div>}
      {failure&&<p className="tx-cu-error">{message.split('\n').find(line=>line.trim())||String(block.meta?.computerUseError||status)}</p>}
      {!images.length&&message&&<pre>{message}</pre>}
      <details><summary>查看操作与结果</summary>{args.code&&<pre>{args.code}</pre>}{message&&<pre>{message}</pre>}</details>
    </div>}
  </div>;
}
export function applyComputerUseClient(ctx, { openPanel, renderPane, integrated = false } = {}){
  installComputerReferenceMessages(ctx);
  computerGroupPresentation(ctx);
  ctx.effect(()=>{const style=document.createElement('style');style.dataset.plugin='trisoul-x-computer-use';style.textContent=css;document.head.append(style);return()=>style.remove();});
  function ComputerEntry(props){return <ComputerChip {...props} conversation={ctx.get('conversation')} onOpen={()=>openPanel?openPanel('computer'):ctx.sidebarRight.openTab('trisoul-x-computer-use')}/>;}
  if(!integrated)ctx.slots.inject('conversation.composer.dock',()=>ctx.slots.register({name:'conversation.composer.dock',id:'trisoul-computer-use',order:25},ComputerEntry));
  const id='trisoul_x/trisoul-x-computer-use';
  ctx.effect(()=>ctx.sidebarRightTabs.register({id,kind:'trisoul-x-computer-use',title:()=>'Computer Use',guide:integrated?[]:[{order:6,title:()=>'Computer Use',description:()=>'查看画面、停止操作与接管控制',icon:ScreenIcon}]}));
  ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:id},props=>renderPane?renderPane(props):<ComputerPane {...props} conversation={ctx.get('conversation')}/>));
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
  return { ComputerEntry };
}
