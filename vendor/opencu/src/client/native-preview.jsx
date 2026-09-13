import React, { useEffect, useRef, useState } from 'react';
import {AssistantCursor} from './assistant-cursor.jsx';

export function NativePreview({sessionId,targetId,targetKind='app',stacked=false,visible,state,url,onError,onFrameSize,onConnection}){
  const [frame,setFrame]=useState(null),[connection,setConnection]=useState('connecting'),[reconnect,setReconnect]=useState(0);
  const [cursor,setCursor]=useState(null);
  const [displayed,setDisplayed]=useState(null);
  const error=useRef(onError);error.current=onError;
  const connectionCallback=useRef(onConnection);connectionCallback.current=onConnection;
  useEffect(()=>{connectionCallback.current?.(connection);},[connection]);
  useEffect(()=>{
    setFrame(null);setDisplayed(null);setCursor(null);if(!visible||state?.enabled===false){setConnection('disabled');return;}
    let active=true,control={};const stream=new EventSource(url('stream',sessionId)+'&'+(targetKind==='tab'?'tab':'app')+'='+encodeURIComponent(targetId)+(stacked?'&stack=1':''));setConnection('connecting');
    stream.addEventListener('frame',event=>{if(active){const next=JSON.parse(event.data);control=next;if(next.stopped||next.transitioning)setCursor(null);setFrame(next);setConnection('live');}});
    stream.addEventListener('cursor',event=>{if(active){const next=JSON.parse(event.data);if(!next||targetKind!=='tab'||(next.tabId===targetId&&next.controlEpoch===control.controlEpoch&&!control.stopped&&!control.transitioning))setCursor(next);}});
    stream.addEventListener('control',event=>{if(active){const value=JSON.parse(event.data);if(value.controlEpoch!==control.controlEpoch)setCursor(null);Object.assign(control,value);if(value.stopped||value.transitioning)setCursor(null);}});
    stream.addEventListener('navigation',event=>{if(active){setCursor(null);const next=JSON.parse(event.data);if(control.loaderId&&next.loaderId!==control.loaderId){control={};setConnection('connecting');}}});
    stream.addEventListener('capture',event=>{if(active){const {status}=JSON.parse(event.data);if(status!=='live')setConnection(status==='paused'?'paused':'connecting');}});
    stream.addEventListener('failure',event=>{if(active){error.current(JSON.parse(event.data).message);setConnection('error');stream.close();}});
    stream.addEventListener('closed',event=>{if(active){const value=JSON.parse(event.data);if(value.reason!=='target-changed')error.current(value.message);setConnection('closed');stream.close();}});
    stream.onerror=()=>{if(active){setCursor(null);control={};setConnection('connecting');}};
    return()=>{active=false;stream.close();};
  },[sessionId,targetId,targetKind,stacked,visible,reconnect,state?.enabled]);
  useEffect(()=>{if(['stopped','stopping'].includes(state?.status))setCursor(null);},[state?.status]);
  useEffect(()=>{if(frame?.data===displayed?.data&&frame!==displayed)setDisplayed(frame);},[frame,displayed]);
  const label=connection==='live'?'实时画面':connection==='connecting'?'正在连接画面…':connection==='paused'?'应用画面已暂停':connection==='disabled'?'Computer Use 已关闭':'画面已断开';
  return <div className="tx-cu-live tx-cu-native-preview" data-connection={connection} aria-label={targetKind==='tab'?'网页悬浮实时画面':'应用实时画面'}>
    <div className="tx-cu-live-meta"><span className={connection==='live'?'tx-cu-live-dot':''}>{label}</span><span>{state?.status==='running'?'助手正在操作':'只读预览'}</span></div>
    <div className="tx-cu-live-surface">
      <div className="tx-cu-observed-image">{frame?<img src={'data:'+frame.mediaType+';base64,'+frame.data} alt={targetKind==='app'?'当前应用窗口的实时画面':'当前网页的实时画面'} draggable={false} onError={()=>{setConnection('error');error.current('画面加载失败，请重连');}} onLoad={event=>{if(event.currentTarget.src==='data:'+frame.mediaType+';base64,'+frame.data){setDisplayed(frame);onFrameSize?.({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight});}}}/>:<div className="tx-cu-live-placeholder" role="status">{['disabled','closed','error','paused'].includes(connection)?label:targetKind==='tab'?'正在获取网页画面…':'正在获取应用窗口…'}</div>}
      {visible&&state?.enabled&&connection==='live'&&!['stopped','stopping'].includes(state?.status)&&<AssistantCursor cursor={cursor} frame={displayed}/>}</div>
      {connection!=='live'&&frame&&<div className="tx-cu-live-overlay">{label}</div>}
    </div>
    {['closed','error'].includes(connection)&&<button className="tx-cu-reconnect" onClick={()=>{error.current('');setReconnect(value=>value+1);}}>重连画面</button>}
  </div>;
}
