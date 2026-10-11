import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {AssistantCursor} from './assistant-cursor.jsx';
import {CodexNativeVideo} from './codex-native-video.jsx';
import {nativePresentationForTarget, windowsNativePresentationKey} from './codex-native-layout.mjs';
import {useCodexNativeDomHome} from './codex-native-dom-home.jsx';
import previewCss from './preview-alignment.css';

// The preview components share one style owner, including standalone mounts.
const styleOwners = new WeakMap();
export function usePreviewAlignmentStyles() {
  useEffect(() => {
    let owner = styleOwners.get(document);
    if (!owner) {
      const element = document.createElement('style');
      element.dataset.opencuPreviewAlignment = ''; element.textContent = previewCss;
      document.head.append(element); owner = { element, count: 0 }; styleOwners.set(document, owner);
    }
    owner.count++;
    return () => { if (--owner.count === 0) { owner.element.remove(); styleOwners.delete(document); } };
  }, []);
}

export function NativePreview(props) {
  return props.targetKind === 'tab' ? <NativeRasterPreview {...props}/> : <NativeEncodedPreview {...props}/>;
}

function NativeEncodedPreview({sessionId,targetId,presentationID,visible,state,url,onError,onFrameSize,onConnection,onNativeReadyChange,onDomHomeChange,
  onActivate,minimalChrome=false,stacked=false,presentationLayout}) {
  usePreviewAlignmentStyles();
  const surface=useRef(null),[surfaceWidth,setSurfaceWidth]=useState(null),[connection,setConnection]=useState('connecting');
  const record=nativePresentationForTarget(state,sessionId,targetId,presentationID);
  const windowsSource=record?.producerKind==='windows-wgc-png'||state?.nativePresentation?.producerKind==='windows-wgc-png';
  const sourceKey=windowsNativePresentationKey(record);
  const [liveSourceKey,setLiveSourceKey]=useState(null);
  const layout=state?.nativePresentationLayout??state?.nativePresentation?.nativePresentationLayout;
  const sourceConnection=windowsSource&&connection==='live'&&(!sourceKey||liveSourceKey!==sourceKey)?'connecting':connection;
  const active=visible===true&&layout?.activeThreadID===sessionId;
  const canReady=windowsSource?sourceConnection==='live'&&active&&state?.enabled!==false:connection==='live';
  const [domReadiness,setDomReadiness]=useState(null);
  useLayoutEffect(()=>{
    const node=surface.current;if(!node)return;
    const measure=()=>setSurfaceWidth(node.getBoundingClientRect().width);
    measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
  },[sessionId,targetId]);
  useEffect(()=>{
    setDomReadiness(null);
    if(windowsSource)onNativeReadyChange?.(sessionId,false);
    if(!record?.presentationID)return;
    if(!canReady){if(!windowsSource)onNativeReadyChange?.(sessionId,false);return;}
    let handle=requestAnimationFrame(()=>{handle=requestAnimationFrame(()=>{
      setDomReadiness({sessionId,presentationID:record.presentationID,sourceKey});onNativeReadyChange?.(sessionId,true);
    });});
    return()=>{cancelAnimationFrame(handle);if(windowsSource)onNativeReadyChange?.(sessionId,false);};
  },[sessionId,record?.presentationID,sourceKey,windowsSource,canReady,onNativeReadyChange]);
  const domReady=canReady&&domReadiness?.sessionId===sessionId&&domReadiness?.presentationID===record?.presentationID
    &&(!windowsSource||domReadiness.sourceKey===sourceKey);
  useCodexNativeDomHome({sessionId,surfaceRef:surface,active,
    ready:domReady,
    orderedPresentationIDs:record?[record.presentationID]:[],onDomHomeChange,enabled:!stacked});
  const zoom=presentationLayout?.windowZoom??1,count=presentationLayout?.presentationCount??1;
  const measuredWidth=presentationLayout?.containerWidth??surfaceWidth;
  const maxDisplaySize=presentationLayout?.maxDisplaySize??(measuredWidth==null?null:Math.min(400,Math.max(1,measuredWidth*zoom-Math.max(0,count-1)*28))/zoom);
  const video=<CodexNativeVideo sessionId={sessionId} presentationID={record?.presentationID} presentationSource={record} visible={visible}
    enabled={state?.enabled!==false} url={url} style={maxDisplaySize==null?undefined:{maxWidth:maxDisplaySize,maxHeight:maxDisplaySize}}
    onError={onError} onFrameSize={(size,identity)=>{if(!windowsSource||identity?.sourceKey===sourceKey)onFrameSize?.(size);}}
    onConnection={(value,identity)=>{
      if(windowsSource&&value==='live'&&identity?.sourceKey!==sourceKey)return;
      setLiveSourceKey(value==='live'?identity?.sourceKey??null:null);setConnection(value);onConnection?.(value);
    }}/>;
  return <div ref={surface} className={'tx-cu-native-preview codex-cu-native-surface'+(minimalChrome?' is-content':'')+(stacked?' is-stacked':'')}
    data-connection={sourceConnection} data-preview-mode="app" data-native-ready={windowsSource?domReady:connection==='live'}
    data-native-transport={windowsSource?'png-frames':'encoded-video'} data-native-producer-kind={windowsSource?'windows-wgc-png':undefined} aria-label="Computer Use preview">
    {onActivate?<button type="button" className="codex-cu-native-presentation" data-pip-presentation-frame={record?.presentationID} onClick={onActivate}>{video}</button>:<div className="codex-cu-native-presentation" data-pip-presentation-frame={record?.presentationID}>{video}</div>}
  </div>;
}

function NativeRasterPreview({sessionId,targetId,targetKind='tab',mode,targetName,minimalChrome=false,actions,onActivate,stacked=false,visible,state,url,onError,onFrameSize,onConnection}){
  usePreviewAlignmentStyles();
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
    stream.addEventListener('failure',event=>{if(active){error.current?.(JSON.parse(event.data).message);setConnection('error');stream.close();}});
    stream.addEventListener('closed',event=>{if(active){const value=JSON.parse(event.data);if(value.reason!=='target-changed')error.current?.(value.message);setConnection('closed');stream.close();}});
    stream.onerror=()=>{if(active){setCursor(null);control={};setConnection('connecting');}};
    return()=>{active=false;stream.close();};
  },[sessionId,targetId,targetKind,stacked,visible,reconnect,state?.enabled]);
  useEffect(()=>{if(['stopped','stopping'].includes(state?.status))setCursor(null);},[state?.status]);
  useEffect(()=>{if(frame?.data===displayed?.data&&frame!==displayed)setDisplayed(frame);},[frame,displayed]);
  const label=connection==='live'?'实时画面':connection==='connecting'?'正在连接画面…':connection==='paused'?(targetKind==='tab'?'网页画面已暂停':'应用画面已暂停'):connection==='disabled'?'Computer Use 已关闭':'画面已断开';
  const controlled=[state?.target?.viewId,state?.target?.id].includes(targetId);
  const controlLabel=!controlled?'只读预览':state?.resuming?'正在恢复':state?.transitioning?'正在载入':state?.status==='stopping'?'正在停止':state?.status==='stopped'?'已停止 · 可手动操作':state?.status==='running'?'助手正在操作':'只读预览';
  return <div className={"tx-cu-live tx-cu-native-preview"+(minimalChrome?" is-content":"")} data-connection={connection} data-preview-mode={mode??(targetKind==='tab'?'browser':'app')} aria-label={targetKind==='tab'?'网页悬浮实时画面':'应用实时画面'}>
    {minimalChrome?<div className="tx-cu-native-actions"><span className="tx-cu-live-control">{controlLabel}</span>{actions}</div>:<div className="tx-cu-live-meta"><div className="tx-cu-live-heading">{targetName&&<strong title={targetName}>{targetName}</strong>}<span role="status" className={connection==='live'?'tx-cu-live-dot':''}>{label}</span></div><span className="tx-cu-live-control" title={controlLabel}>{controlLabel}</span></div>}
    <div className="tx-cu-live-surface" role={minimalChrome&&onActivate?'button':undefined} tabIndex={minimalChrome&&onActivate?0:undefined} aria-label={minimalChrome&&onActivate?'查看应用窗口':undefined} onClick={minimalChrome?onActivate:undefined} onKeyDown={event=>{if(minimalChrome&&onActivate&&['Enter',' '].includes(event.key)){event.preventDefault();onActivate();}}}>
      <div className="tx-cu-observed-image">{frame?<img src={'data:'+frame.mediaType+';base64,'+frame.data} alt={targetKind==='app'?'当前应用窗口的实时画面':'当前网页的实时画面'} draggable={false} onError={()=>{setConnection('error');error.current?.('画面加载失败，请重连');}} onLoad={event=>{if(event.currentTarget.src==='data:'+frame.mediaType+';base64,'+frame.data){setDisplayed(frame);onFrameSize?.({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight});}}}/>:<div className="tx-cu-live-placeholder" role="status">{['disabled','closed','error','paused'].includes(connection)?label:targetKind==='tab'?'正在获取网页画面…':'正在获取应用窗口…'}</div>}
      {visible&&state?.enabled&&connection==='live'&&!['stopped','stopping'].includes(state?.status)&&<AssistantCursor cursor={cursor} frame={displayed}/>}</div>
      {connection!=='live'&&frame&&<div className="tx-cu-live-overlay">{label}</div>}
    </div>
    {['closed','error'].includes(connection)&&<button type="button" className="tx-cu-reconnect" title="重新连接此窗口的画面" onClick={()=>{error.current?.('');setReconnect(value=>value+1);}}>重连画面</button>}
  </div>;
}
