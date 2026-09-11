import React, { useEffect, useRef, useState } from 'react';
import {ComputerIcon} from './computer-icons.jsx';

export function WindowShare({ sessionId, inputActions, conversation }) {
  const [open,setOpen]=useState(false),[windows,setWindows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const dialog=useRef(null),request=useRef(null),activeSession=useRef(sessionId);activeSession.current=sessionId;
  useEffect(()=>{setOpen(false);setBusy(false);setWindows([]);setError('');return()=>request.current?.abort();},[sessionId]);
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
  const post=async(op,value,signal)=>{
    const r=await fetch('/trisoul-x/computer-use/'+op+'?session='+encodeURIComponent(sessionId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal});
    const result=await r.json();if(!r.ok)throw new Error(result.error||'窗口分享失败');return result;
  };
  const list=async()=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;setOpen(true);setBusy(true);setError('');setWindows([]);
    try{const result=await post('share-windows',{},controller.signal);if(!controller.signal.aborted)setWindows(result.windows);}
    catch(e){if(!controller.signal.aborted)setError(e.message);}
    finally{if(!controller.signal.aborted)setBusy(false);}
  };
  const share=async window=>{
    const controller=new AbortController();request.current?.abort();request.current=controller;setBusy(true);setError('');
    try{
      const value=await post('share-window',window,controller.signal);
      if(controller.signal.aborted||activeSession.current!==sessionId)return;
      const name=(value.name||'窗口').replace(/[\\/:*?"<>|]/g,'_');
      const bytes=Uint8Array.from(atob(value.screenshot),c=>c.charCodeAt(0));
      const drafts=conversation.createDrafts(sessionId,[new File([bytes],name+'.png',{type:value.mediaType}),new File([value.text],name+'-窗口文字.txt',{type:'text/plain'})]);
      if(!inputActions.addAttachments(drafts.map(draft=>draft.id))){conversation.releaseDraftAttachments(drafts);throw new Error('输入区正在发送，请稍后再加入窗口快照');}
      setOpen(false);
    }catch(e){if(!controller.signal.aborted)setError(e.message);}
    finally{if(!controller.signal.aborted)setBusy(false);}
  };
  const close=()=>{request.current?.abort();setOpen(false);setBusy(false);};
  return <div className="tx-cu-share">
    <button type="button" className="tx-cu-share-entry" onClick={list} disabled={!sessionId||!inputActions} title="把所选窗口的截图和文字加入当前草稿" aria-label="分享窗口"><ComputerIcon name="share" size={14}/></button>
    <dialog ref={dialog} onCancel={close} className="tx-cu-share-dialog">
      <header><strong>分享窗口</strong><button type="button" onClick={close} aria-label="关闭窗口分享"><ComputerIcon name="close"/></button></header>
      <p>选择窗口，将截图和窗口文字加入输入框。你可以检查附件后再发送。</p>
      {error&&<p className="tx-cu-error" role="alert">{error}</p>}
      {busy&&<p role="status">正在读取窗口…</p>}
      {!busy&&!error&&!windows.length&&<p>当前没有可分享的应用窗口。</p>}
      <div className="tx-cu-share-list">{windows.map(window=><button key={window.pid+':'+window.window_id} type="button" disabled={busy} onClick={()=>share(window)}><span className="tx-cu-share-window-icon"><ComputerIcon/></span><span className="tx-cu-share-window-info"><strong>{window.app_name}</strong><span>{window.title||'未命名窗口'}</span></span>{window.active&&<small>当前前台</small>}</button>)}</div>
    </dialog>
  </div>;
}
