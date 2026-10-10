import React,{useEffect,useRef,useState} from 'react';
import {ComputerIcon} from './computer-icons.jsx';
import {browserLabel} from './browser-tools.jsx';
import browserChromeCss from './browser-chrome.css';

export function BrowserHistoryPanel({sessionId,api,onOpen,onClose}){
  const[entries,setEntries]=useState(null),[query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[limit,setLimit]=useState(100);
  const root=useRef(null),search=useRef(null),active=useRef(true),request=useRef(null);
  const load=async(clear=false)=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);
    try{const result=await api(clear?'browser-history-clear':'browser-history',sessionId,clear?{}:undefined,controller.signal);if(active.current&&!controller.signal.aborted){setEntries(result.entries);setError(result.warning??'');}}
    catch(error){if(active.current&&!controller.signal.aborted)setError(error.message);}finally{if(active.current&&request.current===controller)setBusy(false);}
  };
  useEffect(()=>{
    active.current=true;setEntries(null);setQuery('');setLimit(100);setError('');search.current?.focus();void load();
    const outside=event=>{if(!root.current?.contains(event.target)&&!event.target.closest('.tx-cu-browser-options'))onClose(false);};document.addEventListener('pointerdown',outside);
    return()=>{active.current=false;request.current?.abort();document.removeEventListener('pointerdown',outside);};
  },[sessionId]);
  const filtered=(entries??[]).filter(entry=>(entry.title+' '+entry.url).toLocaleLowerCase().includes(query.toLocaleLowerCase())),shown=filtered.slice(0,limit);
  const open=async entry=>{setBusy(true);try{if(await onOpen(entry)!==false)onClose(false);else if(active.current)setError('页面未能打开，请检查浏览器连接后重试');}catch(error){if(active.current)setError(error.message);}finally{if(active.current)setBusy(false);}};
  let day;
  return <section ref={root} className="tx-cu-history-panel tx-cu-browser-popover tx-cu-record-panel" role="dialog" aria-label="浏览历史" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose(true);}}}>
    <style>{browserChromeCss}</style>
    <header><div><strong>浏览历史</strong>{entries&&<span className="tx-cu-record-count">{filtered.length} / {entries.length}</span>}</div><button type="button" aria-label="关闭浏览历史" onClick={()=>onClose(true)}><ComputerIcon name="close" size={14}/></button></header>
    <p className="tx-cu-record-scope">当前会话 · 按访问日期显示</p>
    <input ref={search} className="tx-cu-record-search" type="search" aria-label="搜索浏览历史" placeholder="搜索标题或网址" value={query} onChange={event=>{setQuery(event.target.value);setLimit(100);}}/>
    {error&&<p role="alert" className="tx-cu-error">{error}</p>}
    {!entries&&!error&&<p className="tx-cu-record-empty" role="status">正在读取…</p>}
    {entries&&shown.length===0&&<p className="tx-cu-record-empty">{query?'没有匹配的记录':'当前会话还没有浏览记录'}</p>}
    <div className="tx-cu-history-entries">{shown.map(entry=>{const date=new Date(entry.visitedAt),validDate=Number.isFinite(date.getTime()),label=validDate?date.toLocaleDateString():'日期未知',heading=day!==label;day=label;let host=entry.url;try{host=new URL(entry.url).host||entry.url;}catch{}
      return <React.Fragment key={entry.id}>{heading&&<h4>{label}</h4>}<button type="button" className="tx-cu-history-link" title={entry.url+' · '+browserLabel(entry)} disabled={busy} onClick={()=>void open(entry)}><ComputerIcon name="globe" size={15}/><span><strong>{entry.title||host}</strong><span className="tx-cu-history-source"><span>{host}</span><span>· {browserLabel(entry)}</span></span></span><time dateTime={validDate?date.toISOString():undefined}>{validDate?date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'—'}</time></button></React.Fragment>;
    })}</div>
    {filtered.length>limit&&<button type="button" className="tx-cu-history-more" onClick={()=>setLimit(value=>value+100)}>显示更多（{filtered.length-limit}）</button>}
    <footer><span>仅本会话接入后的记录；点击在原浏览器新建标签页</span><div><button type="button" disabled={busy} onClick={()=>void load()}>刷新</button><button type="button" disabled={busy||!entries?.length} title="只清除此处记录，不清理浏览器数据" onClick={()=>void load(true)}>清除本会话记录</button></div></footer>
  </section>;
}
