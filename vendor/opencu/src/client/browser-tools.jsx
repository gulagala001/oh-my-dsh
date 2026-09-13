import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {ComputerIcon} from './computer-icons.jsx';
import {ImageDialog} from './tool-image.jsx';

const presets={phone:{width:390,height:844},tablet:{width:768,height:1024},desktop:{width:1280,height:800}};
export const BrowserTools=forwardRef(function BrowserTools({sessionId,target,frame,state,api,onState,onError,previewScale='1',onPreviewScale,onDeviceModeChange,popupOpen,onMenuOpen,onOpenHistory,onOpenDownloads},ref){
  const [menu,setMenu]=useState(false),[devices,setDevices]=useState(false),[width,setWidth]=useState(''),[height,setHeight]=useState(''),[busy,setBusy]=useState(false),[image,setImage]=useState(null);
  const anchor=useRef(null),trigger=useRef(null),request=useRef(null),generation=useRef(0),latest=useRef(null);
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
  useEffect(()=>{setMenu(false);setDevices(false);setImage(null);setBusy(false);return()=>{generation.current++;request.current?.abort();};},[sessionId,target?.id]);
  useEffect(()=>{setFinding(false);setQuery('');setFindResult(null);attempted.current=null;pendingFind.current=null;},[sessionId,target?.id]);
  useEffect(()=>{if(finding){findInput.current?.focus();findInput.current?.select();}},[finding]);
  const openFind=()=>{setFinding(true);findInput.current?.focus();findInput.current?.select();};
  const closeFind=()=>{if(request.current?.operation==='view-find')request.current.abort();setFinding(false);attempted.current=query;pendingFind.current=null;trigger.current?.focus();};
  useImperativeHandle(ref,()=>({openFind,focus:()=>trigger.current?.focus(),resizeViewport:size=>action('view-viewport',{size})}));
  useEffect(()=>{if(frame?.width&&frame?.height){setWidth(String(Math.round(frame.width)));setHeight(String(Math.round(frame.height)));}},[frame?.width,frame?.height]);
  useEffect(()=>{if(state?.viewViewport?.overridden)setDevices(true);},[target?.id,state?.viewViewport?.overridden]);
  useEffect(()=>{
    if(!menu)return;
    anchor.current?.querySelector('[role=menuitem]:not(:disabled)')?.focus();
    const outside=event=>{if(!anchor.current?.contains(event.target))setMenu(false);};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[menu]);
  const closeMenu=()=>{setMenu(false);trigger.current?.focus();};
  const action=async(op,value={})=>{
    if(request.current)return false;
    const current=latest.current,observed=current.frame,version=generation.current;
    if(!observed?.actor||observed.tabId!==current.target?.id){current.onError('等待当前网页画面就绪后重试');return false;}
    const controller=new AbortController();controller.operation=op;request.current=controller;setBusy(true);
    try{
      const result=await api(op,sessionId,{...value,actor:observed.actor,tabId:observed.tabId,controlEpoch:current.state.controlEpoch},controller.signal);
      if(version!==generation.current||latest.current.target?.id!==observed.tabId)return false;
      if(op==='view-screenshot')setImage('data:'+result.mediaType+';base64,'+result.data);else latest.current.onState(result);
      if(op==='view-find')setFindResult(result.find);
      latest.current.onError('');return true;
    }catch(error){if(!controller.signal.aborted&&version===generation.current)latest.current.onError(error.message);return false;}
    finally{if(request.current===controller)request.current=null;if(version===generation.current)setBusy(false);}
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
  const hideDevices=()=>{const close=()=>{setDevices(false);trigger.current?.focus();};if(state?.viewViewport?.overridden)void resize(null).then(ok=>{if(ok)close();});else close();};
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
  {devices&&<form className="tx-cu-device-toolbar" aria-label="设备工具栏" title="仅调整网页视口尺寸，不模拟设备型号、触摸或浏览器类型" onSubmit={event=>{event.preventDefault();void resize({width:Number(width),height:Number(height)});}}>
    <span>尺寸：</span><select className="tx-cu-device-preset" aria-label="视口尺寸预设" disabled={!ready} value={Object.keys(presets).find(key=>presets[key].width===Number(width)&&presets[key].height===Number(height))??'custom'} onChange={event=>{const value=presets[event.target.value];if(value)void resize(value);}}><option value="custom">响应式</option><option value="phone">手机尺寸</option><option value="tablet">平板尺寸</option><option value="desktop">桌面尺寸</option></select>
    <div className="tx-cu-device-dimensions"><input aria-label="视口宽度" type="number" min="1" max="10000000" required value={width} disabled={!ready} onChange={event=>setWidth(event.target.value)}/><span>×</span><input aria-label="视口高度" type="number" min="1" max="10000000" required value={height} disabled={!ready} onChange={event=>setHeight(event.target.value)}/></div>
    <button type="button" aria-label="旋转视口" title="交换宽高" disabled={!ready} onClick={()=>void resize({width:Number(height),height:Number(width)})}><ComputerIcon name="rotate" size={15}/></button><button type="submit" className="tx-cu-device-apply" title="应用尺寸（Enter）" aria-label="应用视口尺寸" disabled={!ready} hidden={Number(width)===Math.round(frame?.width)&&Number(height)===Math.round(frame?.height)}>↵</button>
    <select aria-label="设备预览缩放" title="仅缩放预览显示，不改变网页尺寸或接管控制" value={previewScale} onChange={event=>onPreviewScale?.(event.target.value)}><option value="fit">适应窗口</option>{[.25,.5,.75,1,1.25,1.5].map(scale=><option key={scale} value={String(scale)}>{scale*100}%</option>)}</select>
    <button type="button" aria-label="重置" title="重置尺寸" disabled={!ready} onClick={()=>void resize(null)}><ComputerIcon name="reset" size={13}/></button><button type="button" className="tx-cu-device-close" aria-label="关闭设备工具栏" title="关闭设备工具栏" disabled={!ready} onClick={hideDevices}><ComputerIcon name="close" size={12}/></button>
  </form>}
  {busy&&<span className="tx-cu-browser-tool-progress" role="status">正在处理…</span>}
  {image&&<ImageDialog src={image} onClose={()=>setImage(null)}/>}</>;
});
