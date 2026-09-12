import React, { useEffect, useRef, useState } from 'react';
import {ComputerIcon} from './computer-icons.jsx';

export function WindowShare({ sessionId, inputActions, conversation }) {
  const [open,setOpen]=useState(false),[windows,setWindows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [query,setQuery]=useState(''),[sharing,setSharing]=useState(null);
  const dialog=useRef(null),request=useRef(null),search=useRef(null),opener=useRef(null),activeSession=useRef(sessionId);activeSession.current=sessionId;
  useEffect(()=>{setOpen(false);setBusy(false);setWindows([]);setError('');return()=>request.current?.abort();},[sessionId]);
  useEffect(()=>{if(open){dialog.current?.showModal();search.current?.focus();}else dialog.current?.close();},[open]);
  const post=async(op,value,signal)=>{
    const r=await fetch('/trisoul-x/computer-use/'+op+'?session='+encodeURIComponent(sessionId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal});
    const result=await r.json();if(!r.ok)throw new Error(result.error||'窗口分享失败');return result;
  };
  const list=async(refresh=false)=>{
    if(!open){opener.current=document.activeElement;setQuery('');}
    request.current?.abort();const controller=new AbortController();request.current=controller;setOpen(true);setBusy(true);setSharing(null);setError('');if(!refresh)setWindows([]);
    try{const result=await post('share-windows',{},controller.signal);if(!controller.signal.aborted)setWindows(result.windows);}
    catch(e){if(!controller.signal.aborted)setError(e.message);}
    finally{if(!controller.signal.aborted)setBusy(false);}
  };
  const share=async window=>{
    const controller=new AbortController();request.current?.abort();request.current=controller;setBusy(true);setSharing(window.pid+':'+window.window_id);setError('');
    try{
      const value=await post('share-window',window,controller.signal);
      if(controller.signal.aborted||activeSession.current!==sessionId)return;
      const name=(value.name||'窗口').replace(/[\\/:*?"<>|]/g,'_');
      const bytes=Uint8Array.from(atob(value.screenshot),c=>c.charCodeAt(0));
      const drafts=conversation.createDrafts(sessionId,[new File([bytes],name+'.png',{type:value.mediaType}),new File([value.text],name+'-窗口文字.txt',{type:'text/plain'})]);
      if(!inputActions.addAttachments(drafts.map(draft=>draft.id))){conversation.releaseDraftAttachments(drafts);throw new Error('输入区正在发送，请稍后再加入窗口快照');}
      close();
    }catch(e){if(!controller.signal.aborted)setError(e.message);}
    finally{if(!controller.signal.aborted)setBusy(false);}
  };
  const close=()=>{request.current?.abort();dialog.current?.close();setOpen(false);setBusy(false);setSharing(null);opener.current?.focus({preventScroll:true});};
  const filtered=windows.filter(window=>(window.app_name+' '+(window.title??'')).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="tx-cu-share">
    <button type="button" className="tx-cu-share-entry" onClick={()=>void list()} disabled={!sessionId||!inputActions||!conversation} title="把所选窗口的截图和文字加入当前草稿" aria-label="分享窗口"><ComputerIcon name="share" size={14}/></button>
    <dialog ref={dialog} aria-label="分享窗口" onCancel={event=>{event.preventDefault();close();}} onKeyDown={event=>event.stopPropagation()} className="tx-cu-share-dialog tx-cu-window-picker">
      <header><strong>分享窗口</strong><button type="button" onClick={close} aria-label="关闭窗口分享"><ComputerIcon name="close"/></button></header>
      <p>选择要分享的窗口，截图和文字会加入草稿。</p>
      <div className="tx-cu-window-search"><ComputerIcon name="search" size={15}/><input ref={search} type="search" aria-label="搜索应用或窗口" placeholder="搜索应用或窗口" value={query} onChange={event=>setQuery(event.target.value)}/><button type="button" aria-label="刷新窗口列表" title="刷新窗口列表" disabled={busy} onClick={()=>void list(true)}><ComputerIcon name="reset" size={15}/></button></div>
      {error&&<p className="tx-cu-error" role="alert">{error}</p>}
      {busy&&<p role="status">{sharing?'正在加入窗口快照…':windows.length?'正在刷新窗口…':'正在读取窗口…'}</p>}
      {!busy&&!error&&!windows.length&&<p>当前没有可分享的应用窗口。</p>}
      {!busy&&windows.length>0&&!filtered.length&&<p>没有匹配的窗口，试试应用名称。</p>}
      <div className="tx-cu-share-list">{filtered.map(window=><button key={window.pid+':'+window.window_id} type="button" disabled={busy} className={sharing===window.pid+':'+window.window_id?'is-selected':undefined} onClick={()=>share(window)}><span className="tx-cu-share-window-icon"><ComputerIcon/></span><span className="tx-cu-share-window-info"><strong>{window.app_name}</strong><span>{window.title||'未命名窗口'}</span></span>{window.active&&<small>当前前台</small>}<ComputerIcon name="chevron" size={12}/></button>)}</div>
      <footer><small>{windows.length} 个窗口 · 选择后不会自动发送</small><button type="button" onClick={close}>取消</button></footer>
    </dialog>
  </div>;
}
