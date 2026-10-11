import React,{useEffect,useRef,useState} from 'react';
import {CodexDeviceResizeHandles} from './codex-device-toolbar.jsx';

// Screenshot-host bounds adapter. The source handle renderer gets real displayed
// viewport bounds; it is not an Electron webview or native adoption lease.
export function BrowserDeviceFrame({enabled,interactive,width,height,scale,presetId='responsive',onResize,onError,children}){
  const drag=useRef(null),revision=useRef(0),[pending,setPending]=useState(false);
  const cancel=()=>{const current=drag.current;drag.current=null;if(current?.element.hasPointerCapture(current.id))current.element.releasePointerCapture(current.id);};
  useEffect(()=>{cancel();setPending(false);return()=>{revision.current++;cancel();};},[enabled,width,height,scale]);
  useEffect(()=>{if(!interactive)cancel();},[interactive]);
  const apply=async size=>{cancel();if(!interactive||pending||size.width===width&&size.height===height)return;const version=revision.current;setPending(true);try{await onResize(size);}catch(error){if(version===revision.current)onError?.(error.message);}finally{if(version===revision.current)setPending(false);}};
  const start=(event,edge)=>{if(!interactive||pending||event.button!==0||event.isPrimary===false)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,element:event.currentTarget,startX:event.clientX,startY:event.clientY,x:edge.includes('left')?-1:edge.includes('right')?1:0,y:edge.includes('bottom')?1:0,size:{width,height}};};
  const move=event=>{const current=drag.current;if(!current||current.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();current.size={width:current.x?Math.max(240,Math.min(4096,Math.round(width+current.x*2*(event.clientX-current.startX)/scale))):width,height:current.y?Math.max(160,Math.min(4096,Math.round(height+(event.clientY-current.startY)/scale))):height};};
  const end=event=>{const current=drag.current;if(!current||current.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(['pointercancel','lostpointercapture'].includes(event.type)){cancel();return;}move(event);void apply(current.size);};
  const bounds={x:20,y:0,width:width*scale,height:height*scale};
  return <div className={'tx-cu-browser-device-frame'+(enabled?' is-device':'')} aria-busy={pending||undefined}>{children}
    <CodexDeviceResizeHandles state={{isEnabled:enabled,presetId}} layout={{visualBounds:bounds}} panelBounds={{x:0,y:0}} disabled={!interactive||pending} onPointerDown={start} onPointerMove={move} onPointerUp={end}/>
  </div>;
}
