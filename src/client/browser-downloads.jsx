import React,{useEffect,useRef,useState} from 'react';
import {ComputerIcon} from './computer-icons.jsx';

const bytes=value=>value>=1048576?(value/1048576).toFixed(1)+' MB':value>=1024?(value/1024).toFixed(1)+' KB':Math.max(0,value||0)+' B';
export function BrowserDownloads({sessionId,visible,api,active,onActiveChange}){
  const[localOpen,setLocalOpen]=useState(false),[items,setItems]=useState(null),[error,setError]=useState('');
  const[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[reload,setReload]=useState(0),[clearing,setClearing]=useState(false),[mutationError,setMutationError]=useState('');
  const open=active??localOpen,setOpen=onActiveChange??setLocalOpen;
  const root=useRef(null),trigger=useRef(null),revision=useRef(0),mutating=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;revision.current++;};},[sessionId]);
  useEffect(()=>{setOpen(false);setItems(null);setError('');},[sessionId]);
  useEffect(()=>{
    if(!open||!visible)return;
    let active=true,timer;const controller=new AbortController();
    const refresh=async()=>{const generation=revision.current;try{if(mutating.current)return;const result=await api('downloads',sessionId,undefined,controller.signal);if(active&&generation===revision.current){setItems(result.downloads);setError('');}}catch(error){if(active)setError(error.message);}finally{if(active)timer=setTimeout(refresh,1000);}};
    void refresh();return()=>{active=false;controller.abort();clearTimeout(timer);};
  },[open,visible,sessionId,api,reload]);
  useEffect(()=>{
    if(!open)return;root.current?.querySelector('[aria-label="关闭下载记录"]')?.focus();
    const outside=event=>{if(!root.current?.contains(event.target))setOpen(false);};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  const close=()=>{setOpen(false);trigger.current?.focus();};
  const clear=async()=>{revision.current++;mutating.current=true;setClearing(true);setMutationError('');try{const result=await api('downloads-clear',sessionId,{});if(alive.current)setItems(result.downloads);}catch(error){if(alive.current)setMutationError(error.message);}finally{mutating.current=false;if(alive.current)setClearing(false);}};
  const filtered=(items??[]).filter(item=>(filter==='all'||filter==='active'&&['inProgress','unobserved'].includes(item.state)||filter===item.state)&&item.filename.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="tx-cu-downloads" ref={root} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}}}>
    <button type="button" ref={trigger} disabled={!visible} aria-label="下载记录" title="下载记录" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(!open)}><ComputerIcon name="download"/></button>
    {open&&visible&&<section className="tx-cu-download-panel" role="dialog" aria-label="当前会话下载记录">
      <header><strong>下载记录</strong><button type="button" aria-label="关闭下载记录" onClick={close}><ComputerIcon name="close" size={14}/></button></header>
      <div className="tx-cu-download-filters"><input type="search" aria-label="搜索下载文件" placeholder="搜索文件名" value={query} onChange={event=>setQuery(event.target.value)}/><select aria-label="筛选下载记录" value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">全部</option><option value="active">进行中</option><option value="completed">已完成</option><option value="canceled">已取消</option></select></div>
      {(error||mutationError)&&<p role="alert" className="tx-cu-error">{mutationError||error}</p>}
      {!items&&!error&&<p role="status">正在读取…</p>}
      {items?.length===0&&<p>当前会话还没有下载记录</p>}
      {!!items?.length&&filtered.length===0&&<p>没有匹配的下载记录</p>}
      {!!filtered.length&&<ul>{filtered.map(item=><li key={item.id}>
        <ComputerIcon name="download"/><div><strong title={item.filename}>{item.filename}</strong><small>{item.state==='completed'?'已完成':item.state==='canceled'?'已取消或中断':item.state==='unobserved'?'连接已断开，状态待确认':'下载中'} · {bytes(item.receivedBytes)}{item.totalBytes>0&&item.state==='inProgress'?' / '+bytes(item.totalBytes):''}</small>
          {item.state==='inProgress'&&<progress aria-label={item.filename+' 下载进度'} value={item.totalBytes>0?item.receivedBytes:undefined} max={item.totalBytes||1}/>}
          {item.source&&<small>{item.source}</small>}
          {item.canDownload?<a href={'/trisoul-x/computer-use/download-file?session='+encodeURIComponent(sessionId)+'&id='+encodeURIComponent(item.id)} download={item.filename}>保存文件</a>:item.state==='completed'&&<small>{item.browserId==='browser'?'文件暂不可读取':'文件保存在原浏览器的下载位置'}</small>}
        </div>
      </li>)}</ul>}
      <footer><span>仅显示当前会话接入后捕获的下载</span><div><button type="button" onClick={()=>setReload(value=>value+1)}>刷新</button><button type="button" title="移除已完成或取消的记录，不删除文件" disabled={clearing||!items?.some(item=>['completed','canceled'].includes(item.state))} onClick={()=>void clear()}>{clearing?'正在清除…':'清除已结束记录'}</button></div></footer>
    </section>}
  </div>;
}
