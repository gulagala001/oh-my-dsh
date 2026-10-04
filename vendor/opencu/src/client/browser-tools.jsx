import React,{forwardRef,useEffect,useImperativeHandle,useId,useRef,useState} from 'react';
import {ComputerIcon} from './computer-icons.jsx';
import {ImageDialog} from './tool-image.jsx';

const presets={phone:{width:390,height:844},tablet:{width:768,height:1024},desktop:{width:1280,height:800}};
export const BrowserTools=forwardRef(function BrowserTools({sessionId,target,frame,state,api,onState,onError,previewScale='1',onPreviewScale,onDeviceModeChange,popupOpen,onMenuOpen,onOpenHistory,onOpenDownloads},ref){
  const [menu,setMenu]=useState(false),[devices,setDevices]=useState(false),[width,setWidth]=useState(''),[height,setHeight]=useState(''),[busy,setBusy]=useState(false),[image,setImage]=useState(null),[simulation,setSimulation]=useState(false),[dpr,setDpr]=useState(''),[userAgent,setUserAgent]=useState(''),[hasTouch,setHasTouch]=useState('default'),[isMobile,setIsMobile]=useState('default');
  const simulationId=useId();
  const anchor=useRef(null),trigger=useRef(null),request=useRef(null),resetting=useRef(false),generation=useRef(0),latest=useRef(null);
  const [finding,setFinding]=useState(false),[query,setQuery]=useState(''),[findResult,setFindResult]=useState(null),[composing,setComposing]=useState(false);
  const findInput=useRef(null),attempted=useRef(null),pendingFind=useRef(null);
  const findDocument=useRef(null);
  useEffect(()=>{if(popupOpen)setMenu(false);},[popupOpen]);
  useEffect(()=>{
    if(!frame?.loaderId)return;
    if(findDocument.current&&findDocument.current!==frame.loaderId){setFindResult(null);attempted.current=query;pendingFind.current=null;}
    findDocument.current=frame.loaderId;
  },[frame?.loaderId]);
  useEffect(()=>{onDeviceModeChange?.(devices);},[devices,onDeviceModeChange]);
  latest.current={frame,state,target,onState,onError};
  useEffect(()=>{setMenu(false);setDevices(false);setSimulation(false);setImage(null);setBusy(false);resetting.current=false;return()=>{generation.current++;request.current?.abort();};},[sessionId,target?.id]);
  useEffect(()=>{setFinding(false);setQuery('');setFindResult(null);attempted.current=null;pendingFind.current=null;},[sessionId,target?.id]);
  useEffect(()=>{if(finding){findInput.current?.focus();findInput.current?.select();}},[finding]);
  const openFind=()=>{setFinding(true);findInput.current?.focus();findInput.current?.select();};
  const closeFind=()=>{if(request.current?.operation==='view-find')request.current.abort();setFinding(false);attempted.current=query;pendingFind.current=null;trigger.current?.focus();};
  useImperativeHandle(ref,()=>({openFind,focus:()=>trigger.current?.focus(),resizeViewport:size=>action('view-viewport',{size})}));
  useEffect(()=>{if(frame?.width&&frame?.height){setWidth(String(Math.round(frame.width)));setHeight(String(Math.round(frame.height)));}},[frame?.width,frame?.height]);
  useEffect(()=>{if(state?.viewViewport?.overridden||state?.viewEmulation)setDevices(true);},[target?.id,state?.viewViewport?.overridden,!!state?.viewEmulation]);
  const emulationKey=JSON.stringify(state?.viewEmulation?.settings??null);
  useEffect(()=>{const settings=JSON.parse(emulationKey);setDpr(settings?.deviceScaleFactor===undefined?'':String(settings.deviceScaleFactor));setUserAgent(settings?.userAgent??'');setHasTouch(settings?.hasTouch===undefined?'default':String(settings.hasTouch));setIsMobile(settings?.isMobile===undefined?'default':String(settings.isMobile));if(settings)setSimulation(true);},[sessionId,target?.id,emulationKey]);
  useEffect(()=>{
    if(!menu)return;
    anchor.current?.querySelector('[role=menuitem]:not(:disabled)')?.focus();
    const outside=event=>{if(!anchor.current?.contains(event.target))setMenu(false);};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[menu]);
  const closeMenu=()=>{setMenu(false);trigger.current?.focus();};
  const action=async(op,value={},options={})=>{
    if(request.current||(resetting.current&&!options.batch))return false;
    const current=latest.current,observed=options.scope?.frame??current.frame,version=options.scope?.version??generation.current;
    if(version!==generation.current||observed?.tabId!==current.target?.id)return false;
    if(!observed?.actor||observed.tabId!==current.target?.id){current.onError('等待当前网页画面就绪后重试');return false;}
    const controller=new AbortController();controller.operation=op;request.current=controller;setBusy(true);
    try{
      const result=await api(op,sessionId,{...value,actor:observed.actor,tabId:observed.tabId,controlEpoch:options.controlEpoch??current.state.controlEpoch},controller.signal);
      if(version!==generation.current||latest.current.target?.id!==observed.tabId)return false;
      if(op==='view-screenshot')setImage('data:'+result.mediaType+';base64,'+result.data);else latest.current.onState(result);
      if(op==='view-find')setFindResult(result.find);
      latest.current.onError('');return result;
    }catch(error){if(!controller.signal.aborted&&version===generation.current)latest.current.onError(error.message);return false;}
    finally{if(request.current===controller)request.current=null;if(version===generation.current&&!options.batch)setBusy(false);}
  };
  const ready=!!frame?.actor&&frame.tabId===target?.id&&target?.url!=='about:blank'&&state?.enabled!==false&&!state?.transitioning&&!busy;
  const find=(backward=false)=>{if(query&&!composing){if(request.current){pendingFind.current={query,backward};return;}attempted.current=query;void action('view-find',{query,backward});}};
  useEffect(()=>{
    if(!finding||!query||composing||!ready)return;
    const queued=pendingFind.current?.query===query?pendingFind.current:null;
    if(attempted.current===query&&!queued)return;
    const timer=setTimeout(()=>{pendingFind.current=null;attempted.current=query;void action('view-find',queued??{query});},queued?0:200);return()=>clearTimeout(timer);
  },[finding,query,composing,ready]);
  const resize=size=>action('view-viewport',{size});
  const resetDevices=async(close=false)=>{
    if(request.current||resetting.current)return false;
    const scope={frame:latest.current.frame,version:generation.current};resetting.current=true;setBusy(true);
    try{
      const emulation=await action('view-emulation',{settings:null},{batch:true,scope});
      if(!emulation)return false;
      const viewport=await action('view-viewport',{size:null},{batch:true,scope,controlEpoch:emulation.controlEpoch});
      if(!viewport)return false;
      if(close){setDevices(false);setSimulation(false);trigger.current?.focus();}return true;
    }finally{if(scope.version===generation.current){resetting.current=false;setBusy(false);}}
  };
  const hideDevices=()=>{if(!state?.viewViewport?.overridden&&!state?.viewEmulation){setDevices(false);setSimulation(false);trigger.current?.focus();}else void resetDevices(true);};
  const emulate=()=>{if(dpr!==''&&(!Number.isFinite(Number(dpr))||Number(dpr)<.1||Number(dpr)>10)){onError('设备像素比应为 0.1–10');return;}const settings={};if(dpr!=='')settings.deviceScaleFactor=Number(dpr);if(userAgent.trim())settings.userAgent=userAgent.trim();if(hasTouch!=='default')settings.hasTouch=hasTouch==='true';if(isMobile!=='default')settings.isMobile=isMobile==='true';void action('view-emulation',{settings:Object.keys(settings).length?settings:null});};
  const menuKey=event=>{
    if(!menu){if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();onMenuOpen?.();setMenu(true);}return;}
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu();}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();const items=[...anchor.current.querySelectorAll('[role=menuitem]:not(:disabled)')],at=items.indexOf(document.activeElement);
      items[event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
    }
  };
  return <><div ref={anchor} className="tx-cu-browser-tools" onKeyDown={menuKey}>
    <button ref={trigger} type="button" className="tx-cu-browser-options" aria-label="浏览器选项" title="浏览器选项" aria-haspopup="menu" aria-expanded={menu} onClick={()=>{if(!menu)onMenuOpen?.();setMenu(value=>!value);}}>⋮</button>
    {menu&&<div className="tx-cu-browser-menu" role="menu" aria-label="浏览器选项">
      <button type="button" role="menuitem" disabled={!ready} onClick={()=>{closeMenu();openFind();}}><span>在页面中查找</span><kbd aria-hidden="true">⌘/Ctrl F</kbd></button>
      <hr/>
      <button type="button" role="menuitem" disabled={!ready} onClick={()=>{closeMenu();if(devices)hideDevices();else setDevices(true);}}>{devices?'隐藏设备工具栏':'显示设备工具栏'}</button>
      <button type="button" role="menuitem" disabled={!ready} onClick={()=>{closeMenu();void action('view-screenshot');}}>截取屏幕截图</button>
      <hr/>
      <button type="button" role="menuitem" disabled={!onOpenDownloads} onClick={()=>{closeMenu();onOpenDownloads?.();}}><span>下载</span><kbd aria-hidden="true">⌘/Ctrl J</kbd></button>
      <button type="button" role="menuitem" disabled={!onOpenHistory} onClick={()=>{closeMenu();onOpenHistory?.();}}><span>历史记录</span></button>
    </div>}
  </div>
  {finding&&<form role="search" aria-label="页面内查找" className="tx-cu-find" onSubmit={event=>{event.preventDefault();find();}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeFind();}else if(event.key==='Enter'&&event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();find(true);}}}>
    <input ref={findInput} aria-label="查找文字" type="search" placeholder="在页面中查找" value={query} onChange={event=>setQuery(event.target.value)} onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)}/>
    <span role="status" className={findResult?.query===query&&!findResult.found?'is-missing':''}>{request.current?.operation==='view-find'?'正在查找…':findResult?.query===query?(findResult.found?(findResult.wrapped?'已回到起点':'已找到'):'未找到'):query?'按 Enter 查找':''}</span>
    <button type="button" aria-label="上一处" title="上一处（Shift+Enter）" disabled={!ready||!query||composing} onClick={()=>find(true)}>↑</button><button type="submit" aria-label="下一处" title="下一处（Enter）" disabled={!ready||!query||composing}>↓</button><button type="button" aria-label="关闭页面查找" title="关闭（Esc）" onClick={closeFind}><ComputerIcon name="close" size={12}/></button>
  </form>}
  {devices&&<div className="tx-cu-device-toolbar" role="group" aria-label="设备工具栏" title="尺寸只调整网页宽高；设备模拟需单独应用">
    <form className="tx-cu-device-sizing" aria-label="视口尺寸设置" onSubmit={event=>{event.preventDefault();void resize({width:Number(width),height:Number(height)});}}>
    <span>尺寸：</span><select className="tx-cu-device-preset" aria-label="视口尺寸预设" disabled={!ready} value={Object.keys(presets).find(key=>presets[key].width===Number(width)&&presets[key].height===Number(height))??'custom'} onChange={event=>{const value=presets[event.target.value];if(value)void resize(value);}}><option value="custom">响应式</option><option value="phone">手机尺寸</option><option value="tablet">平板尺寸</option><option value="desktop">桌面尺寸</option></select>
    <div className="tx-cu-device-dimensions"><input aria-label="视口宽度" type="number" min="1" max="10000000" required value={width} disabled={!ready} onChange={event=>setWidth(event.target.value)}/><span>×</span><input aria-label="视口高度" type="number" min="1" max="10000000" required value={height} disabled={!ready} onChange={event=>setHeight(event.target.value)}/></div>
    <button type="button" aria-label="旋转视口" title="交换宽高" disabled={!ready} onClick={()=>void resize({width:Number(height),height:Number(width)})}><ComputerIcon name="rotate" size={15}/></button><button type="submit" className="tx-cu-device-apply" title="应用尺寸（Enter）" aria-label="应用视口尺寸" disabled={!ready} hidden={Number(width)===Math.round(frame?.width)&&Number(height)===Math.round(frame?.height)}>↵</button>
    <select aria-label="设备预览缩放" title="仅缩放预览显示，不改变网页尺寸或接管控制" value={previewScale} onChange={event=>onPreviewScale?.(event.target.value)}><option value="fit">适应窗口</option>{[.25,.5,.75,1,1.25,1.5].map(scale=><option key={scale} value={String(scale)}>{scale*100}%</option>)}</select>
    <button type="button" className="tx-cu-device-simulation-toggle" aria-label="设备模拟" aria-expanded={simulation} aria-controls={simulationId} title={state?.viewEmulation?'设备模拟已应用':'可选设备模拟；默认只调整尺寸'} onClick={()=>setSimulation(value=>!value)}>模拟{state?.viewEmulation?' · 已应用':''}</button>
    <button type="button" aria-label="重置" title="恢复默认尺寸和设备模拟" disabled={!ready} onClick={()=>void resetDevices()}><ComputerIcon name="reset" size={13}/></button><button type="button" className="tx-cu-device-close" aria-label="关闭设备工具栏" title="关闭设备工具栏" disabled={!ready} onClick={hideDevices}><ComputerIcon name="close" size={12}/></button>
    </form>
    {simulation&&<form id={simulationId} className="tx-cu-device-simulation" aria-label="设备模拟设置" onSubmit={event=>{event.preventDefault();if(ready)emulate();}}>
      <span>设备模拟：</span><label>触摸<select aria-label="模拟触摸" value={hasTouch} disabled={!ready} onChange={event=>setHasTouch(event.target.value)}><option value="default">默认</option><option value="true">开启</option><option value="false">关闭</option></select></label>
      <label>移动布局<select aria-label="模拟移动布局" value={isMobile} disabled={!ready} onChange={event=>setIsMobile(event.target.value)}><option value="default">默认</option><option value="true">开启</option><option value="false">关闭</option></select></label>
      <label>DPR<input aria-label="模拟设备像素比" type="number" min="0.1" max="10" step="any" placeholder="默认" value={dpr} disabled={!ready} onChange={event=>setDpr(event.target.value)}/></label>
      <label className="tx-cu-device-ua">UA<input aria-label="模拟 User Agent" type="text" maxLength="2048" placeholder="默认浏览器" value={userAgent} disabled={!ready} onChange={event=>setUserAgent(event.target.value)}/></label>
      <button type="submit" aria-label="应用设备模拟" disabled={!ready||dpr!==''&&(!Number.isFinite(Number(dpr))||Number(dpr)<.1||Number(dpr)>10)}>应用模拟</button>
      <small>可选；尺寸预设不自动启用模拟。UA 不改变浏览器内核。</small>
    </form>}
  </div>}
  {busy&&<span className="tx-cu-browser-tool-progress" role="status">正在处理…</span>}
  {image&&<ImageDialog src={image} onClose={()=>setImage(null)}/>}</>;
});
