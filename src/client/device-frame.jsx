import React,{useEffect,useRef,useState} from 'react';

// Resize chrome lives outside the remote input surface. A drag only commits
// through the existing viewport action; canceling it never sends page input.
export function DeviceFrame({enabled,interactive,width,height,scale,onResize,onError,children}){
  const drag=useRef(null),revision=useRef(0),[preview,setPreview]=useState(null),[pending,setPending]=useState(false);
  const limit=value=>Math.max(1,Math.min(10000000,Math.round(value)));
  const cancel=()=>{const current=drag.current;drag.current=null;setPreview(null);if(current?.element.hasPointerCapture(current.id))current.element.releasePointerCapture(current.id);};
  useEffect(()=>{cancel();setPending(false);return()=>{revision.current++;const current=drag.current;drag.current=null;if(current?.element.hasPointerCapture(current.id))current.element.releasePointerCapture(current.id);};},[enabled,width,height,scale]);
  useEffect(()=>{if(!interactive)cancel();},[interactive]);
  const apply=async size=>{
    cancel();if(!interactive||pending||size.width===width&&size.height===height)return;
    const version=revision.current;setPending(true);
    try{await onResize(size);}catch(error){if(version===revision.current)onError?.(error.message);}
    finally{if(version===revision.current)setPending(false);}
  };
  const start=(event,x,y)=>{
    if(!interactive||pending||event.button!==0||event.isPrimary===false)return;
    event.preventDefault();event.stopPropagation();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={id:event.pointerId,element:event.currentTarget,startX:event.clientX,startY:event.clientY,x,y,size:{width,height}};
    setPreview({width,height});
  };
  const move=event=>{
    const current=drag.current;if(!current||current.id!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    // The page is centered: moving either edge changes both half-widths.
    current.size={width:current.x?limit(width+current.x*2*(event.clientX-current.startX)/scale):width,height:current.y?limit(height+(event.clientY-current.startY)/scale):height};
    setPreview(current.size);
  };
  const end=event=>{const current=drag.current;if(!current||current.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();move(event);void apply(current.size);};
  const key=(event,x,y)=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();return;}
    const step=event.shiftKey?10:1,delta=({ArrowLeft:-step,ArrowRight:step,ArrowUp:-step,ArrowDown:step})[event.key];
    if(!delta)return;event.preventDefault();event.stopPropagation();
    if(x&&['ArrowLeft','ArrowRight'].includes(event.key))void apply({width:limit(width+x*delta),height});
    else if(y&&['ArrowUp','ArrowDown'].includes(event.key))void apply({width,height:limit(height+delta)});
  };
  return <div className={'tx-cu-device-frame'+(enabled?' is-device':'')} aria-busy={pending||undefined}>
    {children}
    {enabled&&<>
      {[[1,0,'right','调整设备宽度（右）'],[-1,0,'left','调整设备宽度（左）'],[0,1,'bottom','调整设备高度'],[1,1,'bottom-right','调整设备尺寸（右下）'],[-1,1,'bottom-left','调整设备尺寸（左下）']].map(([x,y,position,label])=><button key={position} type="button" className={'tx-cu-device-handle is-'+position} aria-label={label} title={label+'；方向键微调，Shift 加速，Esc 取消拖动'} disabled={!interactive||pending} tabIndex={x&&y?-1:0} onPointerDown={event=>start(event,x,y)} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={event=>key(event,x,y)}/>)}
      {preview&&<div className="tx-cu-device-ghost-layer" aria-live="off"><div className="tx-cu-device-ghost" style={{left:20+(width-preview.width)*scale/2,width:preview.width*scale,height:preview.height*scale}}/><output>{preview.width} × {preview.height}</output></div>}
    </>}
  </div>;
}
