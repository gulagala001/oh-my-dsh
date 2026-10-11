import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {CodexCuScope} from './codex-cu-scope.jsx';
import {CodexBrowserHistory} from './codex-browser-history.jsx';
import {CodexCuButton} from './codex-cu-primitives.jsx';
import {CodexCuIcon} from './codex-cu-icons.jsx';

import {createCodexBrowserBackend,codexCanRequestProfileAccess} from './codex-browser-backend.mjs';

export function BrowserHistoryPanel({sessionId,api,scope,onOpen,onClose,onClearBrowsingData,backSlot}){
  const[entries,setEntries]=useState(null),[query,setQuery]=useState(''),[resultQuery,setResultQuery]=useState(''),[visitSource,setVisitSource]=useState('all'),[error,setError]=useState(null),[busy,setBusy]=useState(false),[removing,setRemoving]=useState(false),[status,setStatus]=useState(null),[hasMore,setHasMore]=useState(false),[pageError,setPageError]=useState(false),[authorizing,setAuthorizing]=useState(false);
  const request=useRef(null),authorization=useRef(null),mutation=useRef(null),alive=useRef(false),pagination=useRef(null),generation=useRef(0),filters=useRef({query,visitSource});
  filters.current={query,visitSource};
  const backend=useMemo(()=>createCodexBrowserBackend(api,sessionId,scope),[api,sessionId,scope?.browserId,scope?.tabId,scope?.actor,scope?.controlEpoch]);
  const load=useCallback(async(text='',source='all',next=false)=>{
    if(next&&!pagination.current)return;
    const epoch=generation.current;
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setPageError(false);
    const current=()=>alive.current&&generation.current===epoch&&request.current===controller&&!controller.signal.aborted;
    try{
      const available=await backend.call('profileStatus',{},controller.signal);
      if(!current())return;
      setStatus(available);
      if(!available.history?.available||available.history.persistentReady===false){pagination.current=null;setEntries(null);setHasMore(false);setError(codexCanRequestProfileAccess(available,'history')?'请授权访问此浏览器的历史记录':available.history?.persistentReady===false?'浏览历史存储尚未就绪':'当前浏览器未提供全局历史记录');return;}
      if(!available.history.visitSource?.includes(source)){source='all';next=false;setVisitSource('all');}
      const previousPage=next?pagination.current:null;
      const options=previousPage?.options??{text,maxResults:100,offset:0,endTime:Date.now(),visitSource:source,deduplicateByDay:true};
      const pageOptions=previousPage?{...options,...(previousPage.cursorPaging?{cursor:previousPage.nextCursor,offset:0}:{offset:previousPage.nextOffset})}:options;
      const result=await backend.call('profileHistory',{options:pageOptions},controller.signal);
      if(!current())return;
      const cursorPaging=Object.hasOwn(result??{},'nextCursor');
      if(!Array.isArray(result?.entries)||typeof result.hasMore!=='boolean'||result.entries.some(entry=>!entry||!Number.isFinite(entry.visitTime)||!URL.canParse(entry.url))
        ||cursorPaging&&(result.hasMore?(typeof result.nextCursor!=='string'||!result.nextCursor||result.nextCursor===pageOptions.cursor):result.nextCursor!==null))
        throw new Error('浏览器没有返回有效的历史分页结果');
      const rows=result.entries.map(entry=>({...entry,browserId:scope.browserId}));
      setEntries(previous=>previousPage?[...new Map([...(previous??[]),...rows].map(entry=>[JSON.stringify([entry.url,entry.visitTime,entry.isActorVisit===true]),entry])).values()]:rows);
      setResultQuery(text);setHasMore(result.hasMore);
      pagination.current=result.hasMore?{options,cursorPaging,nextCursor:result.nextCursor,nextOffset:(previousPage?.nextOffset??pageOptions.offset??0)+result.entries.length}:null;
      setError(!result.hasMore&&result.complete===false?'结果过多，请缩小查询范围':null);
    }catch(error){if(current()){if(next&&error.code==='HISTORY_CURSOR_STALE'){pagination.current=null;setEntries(null);setHasMore(false);await load(text,source);return;}if(next)setPageError(true);if(error.code==='HISTORY_QUERY_LIMIT'){pagination.current=null;setHasMore(false);setPageError(false);}setError(error.code==='HISTORY_QUERY_LIMIT'?'结果过多，请缩小查询范围':error.message);}}
    finally{if(current()){request.current=null;setBusy(false);}}
  },[backend,scope?.browserId]);
  useEffect(()=>{
    alive.current=true;generation.current++;pagination.current=null;setEntries(null);setStatus(null);setError(null);setRemoving(false);setAuthorizing(false);
    return()=>{alive.current=false;generation.current++;request.current?.abort();authorization.current?.abort();mutation.current?.abort();request.current=null;authorization.current=null;mutation.current=null;};
  },[backend]);
  useEffect(()=>{
    request.current?.abort();pagination.current=null;setEntries(null);setHasMore(false);setError(null);setBusy(true);
    const timer=setTimeout(()=>void load(query,visitSource),query?200:0);
    return()=>{clearTimeout(timer);request.current?.abort();};
  },[load,query,visitSource]);
  useEffect(()=>{
    const refresh=()=>{if(alive.current&&!request.current&&!mutation.current&&!authorization.current&&document.visibilityState==='visible')void load(filters.current.query,filters.current.visitSource);};
    window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);
  },[load]);
  const grant=async()=>{
    if(authorization.current)return;
    const epoch=generation.current;
    const controller=new AbortController();authorization.current=controller;setAuthorizing(true);setError('请在浏览器打开的授权页完成授权');
    try{await backend.requestAccess(['history'],controller.signal);if(alive.current&&epoch===generation.current&&!controller.signal.aborted)await load(filters.current.query,filters.current.visitSource);}
    catch(error){if(alive.current&&epoch===generation.current&&!controller.signal.aborted)setError(error.message);}
    finally{if(alive.current&&epoch===generation.current&&authorization.current===controller){authorization.current=null;setAuthorizing(false);}}
  };
  const remove=async selected=>{
    if(mutation.current||!status?.history?.selectedEntryRemoval||!Array.isArray(selected)||!selected.length)return;
    const epoch=generation.current;
    const controller=new AbortController();mutation.current=controller;setRemoving(true);setError(null);
    try{const result=await backend.call('profileRemoveHistory',{entries:selected.map(entry=>({url:entry.url,visitTime:Number.isFinite(entry.selectedVisitTime)?entry.selectedVisitTime:entry.visitTime})),explicitUserCommand:true},controller.signal);if((status.history.persistentReady===true||result?.accepted!==undefined||result?.committed!==undefined)&&(result?.accepted!==true||result.committed!==true))throw new Error('历史记录删除未完成');if(alive.current&&epoch===generation.current&&!controller.signal.aborted){pagination.current=null;await load(filters.current.query,filters.current.visitSource);}}
    catch(error){if(alive.current&&epoch===generation.current&&!controller.signal.aborted)setError(error.message);}
    finally{if(alive.current&&epoch===generation.current&&mutation.current===controller){mutation.current=null;setRemoving(false);}}
  };
  const open=async entry=>{const epoch=generation.current;request.current?.abort();request.current=null;setBusy(true);try{if(await onOpen(entry)!==false){if(alive.current&&epoch===generation.current)onClose(false);}else if(alive.current&&epoch===generation.current)setError('页面未能打开，请检查浏览器连接后重试');}catch(error){if(alive.current&&epoch===generation.current)setError(error.message);}finally{if(alive.current&&epoch===generation.current)setBusy(false);}};
  return <CodexCuScope as="div" className="tx-cu-browser-session-history" style={{height:'100%',flexDirection:'column'}} aria-label="浏览器历史记录" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose(true);}}}>
    <CodexBrowserHistory key={JSON.stringify([sessionId,scope?.browserId,scope?.tabId,query,visitSource])} entries={entries} searchQuery={query} resultSearchQuery={resultQuery} visitSource={visitSource} onVisitSourceChange={value=>{if(!mutation.current)setVisitSource(value);}} onSearchQueryChange={value=>{if(!mutation.current)setQuery(value);}} isPending={busy&&entries==null} isFetching={busy} isFetchingNextPage={busy&&entries!=null} isFetchNextPageError={pageError} isRemoving={removing} error={error} onRetry={()=>void load(query,visitSource)} locale="zh-CN" visitSourceControlAvailable={status?.history?.available===true&&['all','agent','other'].every(source=>status.history.visitSource?.includes(source))} entriesSelectionAvailable={status?.history?.selectedEntryRemoval===true} dataRemovalPermitted={status?.history?.available===true&&status.history.selectedEntryRemoval===true} onRemoveEntries={selected=>void remove(selected)} browsingDataSettingsAvailable={status?.browsingData?.available===true&&!!onClearBrowsingData} onClearBrowsingData={onClearBrowsingData} hasNextPage={hasMore} onLoadNextPage={()=>{if(!request.current&&!mutation.current)void load(query,visitSource,true);}} onOpenEntry={entry=>void open(entry)} backSlot={<>{backSlot??<CodexCuButton size="toolbar" color="ghost" onClick={()=>onClose(true)}><CodexCuIcon name="shared:uht"/>浏览器</CodexCuButton>}{!status?.history?.available&&codexCanRequestProfileAccess(status,'history')&&<CodexCuButton size="toolbar" color="secondary" loading={authorizing} onClick={()=>void grant()}>授权历史记录</CodexCuButton>}</>}/>
    {error&&<span role="alert" className="tx-cu-error">{error}</span>}
  </CodexCuScope>;
}
