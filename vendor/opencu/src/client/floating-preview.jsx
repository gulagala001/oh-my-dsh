import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {NativePreview,usePreviewAlignmentStyles} from './native-preview.jsx';
import {nativeHomeMetrics} from './codex-native-layout.mjs';
import {useCodexNativeDomHome} from './codex-native-dom-home.jsx';

// The native host supplies its presentation order, stack bounds and placement.
// Capture geometry does not supply those values. In particular, document PiP
// is not the native pinned NSPanel and is not used to manufacture that branch.
export function NativePreviewStack({sessionId,state,url,onError,nativeLayout,
  windowZoom=1,enteringPresentationIDs=[],onReadyChange,onInteractWithPresentation,onDomHomeChange,active=true}){
  usePreviewAlignmentStyles();
  const surface=useRef(null),home=useRef(null),[width,setWidth]=useState(null);
  const [frames,setFrames]=useState({sessionId,loaded:[],errors:[]});
  const loaded=frames.sessionId===sessionId?frames.loaded:[];
  const errors=frames.sessionId===sessionId?frames.errors:[];
  const presentations=state?.nativePresentation?.presentations??[];
  useLayoutEffect(()=>{
    const node=surface.current;if(!node)return;
    const measure=()=>setWidth(node.getBoundingClientRect().width);
    measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
  },[sessionId,nativeLayout?.activeThreadID,nativeLayout?.placement,state?.nativePresentation?.domHome?.available,state?.nativePresentation?.domHome?.active]);
  const metrics=nativeHomeMetrics({layout:nativeLayout,domHome:state?.nativePresentation?.domHome,conversationId:sessionId,
    containerWidth:width,windowZoom,loadedIds:loaded,errorIds:errors,
    enteringIds:enteringPresentationIDs});
  const [domReadiness,setDomReadiness]=useState(null);
  const orderKey=JSON.stringify(metrics?.orderedIds??[]);
  const ownedOrder=metrics?.orderedIds?.every(id=>presentations.some(item=>item.presentationID===id&&item.threadID===sessionId&&item.published&&!item.cleanupPending))?metrics.orderedIds:[];
  const domReady=ownedOrder.length>0&&metrics?.ready===true&&domReadiness?.sessionId===sessionId&&domReadiness?.orderKey===orderKey;
  useEffect(()=>{
    setDomReadiness(null);if(!metrics?.ready)return;
    let handle=requestAnimationFrame(()=>{handle=requestAnimationFrame(()=>setDomReadiness({sessionId,orderKey}));});
    return()=>cancelAnimationFrame(handle);
  },[sessionId,metrics?.ready,orderKey]);
  useCodexNativeDomHome({sessionId,surfaceRef:home,active,ready:domReady,
    orderedPresentationIDs:ownedOrder,onDomHomeChange});
  const movingPinned=nativeLayout?.isMovingToAnchor===true&&nativeLayout?.placement==='pinned';
  useEffect(()=>{
    if(!metrics?.ready&&!movingPinned)return;
    let handle=requestAnimationFrame(()=>{handle=requestAnimationFrame(()=>onReadyChange?.(sessionId,metrics?.ready===true));});
    return()=>cancelAnimationFrame(handle);
  },[sessionId,metrics?.ready,movingPinned,onReadyChange]);
  useEffect(()=>()=>onReadyChange?.(sessionId,false),[sessionId,onReadyChange]);
  if(!metrics?.canRenderHome)return <div ref={home} className="codex-cu-native-home"/>;
  const markLoaded=id=>setFrames(previous=>{
    const next=previous.sessionId===sessionId?previous:{sessionId,loaded:[],errors:[]};
    if(next===previous&&next.loaded.includes(id)&&!next.errors.includes(id))return previous;
    return {...next,loaded:next.loaded.includes(id)?next.loaded:[...next.loaded,id],errors:next.errors.filter(value=>value!==id)};
  });
  const markError=(id,message)=>{
    setFrames(previous=>{
      const next=previous.sessionId===sessionId?previous:{sessionId,loaded:[],errors:[]};
      if(next===previous&&next.errors.includes(id))return previous;
      return {...next,loaded:next.loaded.filter(value=>value!==id),errors:next.errors.includes(id)?next.errors:[...next.errors,id]};
    });onReadyChange?.(sessionId,false);onError?.(message);
  };
  return <div ref={home} className="codex-cu-native-home" hidden={metrics.hidden}>
    <div ref={surface} className="codex-cu-native-stack" data-native-invisible={metrics.invisible}
      style={{height:metrics.reserveHeight}}>
      {width!=null&&metrics.maxDisplaySize!=null&&<div aria-hidden="true" className="codex-cu-native-home-anchor"
        data-pip-home-surface="thread-summary-panel-pip" style={{insetInline:metrics.surfaceInset}}/>}
      {width!=null&&metrics.maxDisplaySize!=null&&metrics.orderedIds.map((presentationID,index)=>{
        const target=presentations.find(item=>item.presentationID===presentationID&&item.threadID===sessionId&&item.published===true&&!item.cleanupPending);
        if(!target)return null;
        const point=metrics.frame(index),ready=loaded.includes(presentationID);
        const entering=enteringPresentationIDs.includes(presentationID);
        return <div key={presentationID} className="codex-cu-native-stack-frame"
          data-pip-presentation-frame={presentationID} data-native-entering={entering}
          data-native-ready={ready} style={{marginTop:point.marginTop,zIndex:point.zIndex,
            transform:`translateX(${point.x}px) scale(${entering&&!ready ? .72 : 1})`,
            opacity:ready?1:0,filter:entering&&!ready?'blur(18px)':'blur(0px)'}}>
          <NativePreview sessionId={sessionId} targetId={target.viewId} presentationID={presentationID} targetKind="app"
            stacked visible state={state} url={url}
            presentationLayout={{windowZoom,presentationCount:metrics.orderedIds.length,
              containerWidth:width,maxDisplaySize:metrics.maxDisplaySize}}
            onFrameSize={()=>markLoaded(presentationID)}
            onConnection={value=>{if(value!=='live')setFrames(previous=>previous.sessionId===sessionId&&previous.loaded.includes(presentationID)?{...previous,loaded:previous.loaded.filter(id=>id!==presentationID)}:previous);}}
            onError={message=>message?markError(presentationID,message):undefined}
            onActivate={onInteractWithPresentation?()=>onInteractWithPresentation(sessionId,presentationID,index===0):undefined}/>
        </div>;
      })}
    </div>
  </div>;
}

// Compatibility entry point for the existing chip. The main UI owns the
// sidebar section/Show-Hide controls; native host placement owns pinned PiP.
// With no authenticated native layout adapter there is no guessed compact dock.
export function FloatingPreview({sessionId,state,url,onError,paneVisible=false,
  nativeLayout=state?.nativePresentationLayout,windowZoom=1,enteringPresentationIDs=[],
  onReadyChange,onInteractWithPresentation,onDomHomeChange,active=true,homeContainer}){
  if(state?.enabled===false||paneVisible||!nativeLayout)return null;
  const content=<NativePreviewStack sessionId={sessionId} state={state} url={url}
    onError={onError} nativeLayout={nativeLayout} windowZoom={windowZoom}
    enteringPresentationIDs={enteringPresentationIDs} onReadyChange={onReadyChange}
    onInteractWithPresentation={onInteractWithPresentation} onDomHomeChange={onDomHomeChange} active={active}/>;
  return homeContainer?createPortal(content,homeContainer):content;
}
