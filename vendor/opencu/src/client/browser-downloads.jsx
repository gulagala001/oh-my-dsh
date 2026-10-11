import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {CodexBrowserDownloads,CodexBrowserDownloadHistory} from './codex-browser-downloads.jsx';
import {CodexCuButton} from './codex-cu-primitives.jsx';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {BrowserLayer} from './browser-layer.jsx';
import {createCodexBrowserBackend,codexProfileDownloadActions,codexCanRequestProfileAccess} from './codex-browser-backend.mjs';

function useProfileDownloads({sessionId,scope,api,enabled,history=false,query=''}){
  const[snapshot,setSnapshot]=useState(null),[liveSnapshot,setLiveSnapshot]=useState(null),[nextOffset,setNextOffset]=useState(0),[status,setStatus]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[authorizing,setAuthorizing]=useState(false),[pageError,setPageError]=useState(false);
  const lifetime=useRef(null),request=useRef(null),alive=useRef(false),authorizationPending=useRef(false);
  const backend=useMemo(()=>createCodexBrowserBackend(api,sessionId,scope),[api,sessionId,scope?.browserId,scope?.tabId,scope?.actor,scope?.controlEpoch]);
  const refresh=useCallback(async(offset=0)=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setBusy(true);setPageError(false);
    try{
      const available=await backend.call('profileStatus',{},controller.signal);
      if(!alive.current||controller.signal.aborted)return;
      setStatus(available);
      if(!available.downloads?.available){setSnapshot(null);setError(codexCanRequestProfileAccess(available,'downloads')?'请授权访问此浏览器的下载记录':'当前浏览器未提供下载记录');return;}
      if(history&&(available.downloads.historySearch!==true||available.downloads.persistentReady===false)){setSnapshot(null);setLiveSnapshot(null);setNextOffset(0);setError(available.downloads.persistentReady===false?'下载记录存储尚未就绪':'此浏览器尚未提供持久下载记录');return;}
      const result=await backend.call(history?'profileDownloadHistory':'profileDownloads',history?{options:{text:query,maxResults:100,offset}}:{},controller.signal);
      if(!alive.current||controller.signal.aborted)return;
      if(!Array.isArray(result?.downloads)||result.downloads.some(item=>!item||typeof item.id!=='string'||!item.id)||history&&typeof result.hasMore!=='boolean')throw new Error('浏览器没有返回有效的下载记录');
      setSnapshot(previous=>offset?{...result,downloads:[...new Map([...(previous?.downloads??[]),...result.downloads].map(item=>[item.id,item])).values()]}:result);if(history)setLiveSnapshot(null);setNextOffset(offset+result.downloads.length);setError('');
    }catch(error){if(alive.current&&!controller.signal.aborted){setError(error.message);if(offset)setPageError(true);}}
    finally{if(alive.current&&request.current===controller)setBusy(false);}
  },[backend,history,query]);
  useEffect(()=>{
    alive.current=true;const controller=new AbortController();lifetime.current=controller;setSnapshot(null);setLiveSnapshot(null);setNextOffset(0);setStatus(null);setError('');setBusy(false);setAuthorizing(false);
    if(!enabled)return()=>{alive.current=false;controller.abort();request.current?.abort();};
    let timer,initial=true;const poll=async()=>{
      if(!authorizationPending.current){
        if(!history||initial){initial=false;await refresh();}
        else try{const result=await backend.call('profileDownloads',{},controller.signal);if(alive.current&&!controller.signal.aborted)setLiveSnapshot(result);}
        catch(error){if(alive.current&&!controller.signal.aborted)setError(error.message);}
      }
      if(alive.current)timer=setTimeout(poll,1000);
    };
    timer=setTimeout(()=>void poll(),query?200:0);
    return()=>{alive.current=false;controller.abort();request.current?.abort();clearTimeout(timer);};
  },[refresh,enabled]);
  const grant=async()=>{
    const signal=lifetime.current?.signal;authorizationPending.current=true;setAuthorizing(true);setError('请在浏览器打开的授权页完成授权');
    try{await backend.requestAccess(['downloads'],signal);if(alive.current)await refresh();}
    catch(error){if(alive.current&&!signal?.aborted)setError(error.message);}
    finally{authorizationPending.current=false;if(alive.current)setAuthorizing(false);}
  };
  const actions=useMemo(()=>codexProfileDownloadActions(backend,status,()=>refresh(),lifetime.current?.signal,setError),[backend,status,refresh]);
  return{snapshot,liveSnapshot,nextOffset,status,error,setError,busy,authorizing,pageError,refresh,grant,actions,backend,lifetime};
}

export function BrowserDownloads({sessionId,scope,visible,observeSnapshot=false,api,active,onActiveChange,floating=false,onError}){
  const[localOpen,setLocalOpen]=useState(false);
  const open=active??localOpen,setOpen=onActiveChange??setLocalOpen;
  const model=useProfileDownloads({sessionId,scope,api,enabled:(open||observeSnapshot)&&visible&&!!scope?.tabId});
  useEffect(()=>{setOpen(false);},[sessionId,scope?.browserId]);
  const{snapshot,status,error,setError,actions}=model;
  const renderLayer=({anchorRef,open,children,onClose,sideOffset,collisionPadding,kind})=>{
    const content=kind==='downloads'&&React.isValidElement(children)?React.cloneElement(children,{children:<>{children.props.children}{!status?.downloads?.available&&codexCanRequestProfileAccess(status,'downloads')&&<CodexCuButton size="toolbar" color="secondary" loading={model.authorizing} onClick={()=>void model.grant()}>授权下载记录</CodexCuButton>}{error&&<span className="tx-cu-error" role="alert">{error}</span>}</>}):children;
    return <BrowserLayer open={open} type={kind==='download-peek'?'popover':'menu'} anchorRef={anchorRef} onClose={onClose} sideOffset={sideOffset??1} collisionPadding={collisionPadding??6} initialFocus={kind==='download-menu'}>{content}</BrowserLayer>;
  };
  return <CodexBrowserDownloads snapshot={snapshot} open={open} onOpenChange={setOpen} floating={floating} isVisible={visible} renderLayer={renderLayer} onError={message=>{setError(message);onError?.(message);}} actions={actions} browserTabId={scope?.tabId} conversationId={sessionId}/>;
}

export function BrowserDownloadHistoryPanel({sessionId,scope,api,onClose,backSlot}){
  const[query,setQuery]=useState(''),[clearing,setClearing]=useState(false);
  const model=useProfileDownloads({sessionId,scope,api,enabled:true,history:true,query});
  const clear=async()=>{
    setClearing(true);try{const result=await model.backend.downloadAction('clearHistory',{},model.lifetime.current?.signal);if(result?.ok===false)throw new Error(result.message??'清除下载记录失败');await model.refresh();}
    catch(error){if(!model.lifetime.current?.signal.aborted)model.setError(error.message);}finally{setClearing(false);}
  };
  return <div style={{height:'100%',display:'flex',flexDirection:'column',minHeight:0}}>
    <CodexBrowserDownloadHistory snapshot={model.snapshot} liveSnapshot={model.snapshot?model.liveSnapshot:null} unfilteredSnapshot={query?model.liveSnapshot:model.snapshot} searchQuery={query} onSearchQueryChange={setQuery} loading={model.busy&&model.snapshot==null} error={model.error} onRetry={()=>void model.refresh()} actions={model.actions} onError={model.setError} clearing={clearing} onClearAll={model.status?.downloads?.actions?.includes('clearHistory')?()=>void clear():undefined} hasMoreUnfiltered={(query?model.liveSnapshot:model.snapshot)?.hasMore===true} paginationError={model.pageError} onRetryNextPage={()=>void model.refresh(model.nextOffset)} paginationContent={model.snapshot?.hasMore?<CodexCuButton size="toolbar" color="secondary" loading={model.busy} onClick={()=>void model.refresh(model.nextOffset)}>加载更多</CodexCuButton>:null} backSlot={<>{backSlot??<CodexCuButton size="toolbar" color="ghost" onClick={onClose}><CodexCuIcon name="shared:uht"/>浏览器</CodexCuButton>}{!model.status?.downloads?.available&&codexCanRequestProfileAccess(model.status,'downloads')&&<CodexCuButton size="toolbar" color="secondary" loading={model.authorizing} onClick={()=>void model.grant()}>授权下载记录</CodexCuButton>}</>}/>
    {model.error&&<span className="tx-cu-error" role="alert">{model.error}</span>}
  </div>;
}
