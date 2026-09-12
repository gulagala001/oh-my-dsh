import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ComputerIcon} from './computer-icons.jsx';

export function ImageDialog({src,onClose}){
  const dialog=useRef(null),canvas=useRef(null),drag=useRef(null),moved=useRef(false),[original,setOriginal]=useState(false),[size,setSize]=useState(null),[zoom,setZoom]=useState(1),[space,setSpace]=useState({width:0,height:0}),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[panning,setPanning]=useState(false);
  const fit=size&&space.width?Math.min(1,Math.max(1,space.width-32)/size.width,Math.max(1,space.height-32)/size.height):1;
  const scale=original?zoom:fit;
  const zoomBy=direction=>{const steps=[.1,.25,.5,.75,1,1.25,1.5,2,3,4],next=direction>0?steps.find(value=>value>scale+.001):steps.slice().reverse().find(value=>value<scale-.001);if(next){setOriginal(true);setZoom(next);}};
  const toggle=()=>{setOriginal(value=>!value);setZoom(1);};
  useLayoutEffect(()=>{
    const opener=document.activeElement,element=dialog.current;
    element.showModal();
    const observe=()=>setSpace({width:canvas.current.clientWidth,height:canvas.current.clientHeight}),observer=new ResizeObserver(observe);observer.observe(canvas.current);observe();
    return()=>{observer.disconnect();element.close();if(opener?.isConnected)opener.focus({preventScroll:true});};
  },[]);
  useLayoutEffect(()=>{if(!original&&canvas.current){canvas.current.scrollLeft=0;canvas.current.scrollTop=0;}},[original]);
  const release=event=>{if(drag.current){drag.current=null;setPanning(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}};
  return createPortal(<dialog ref={dialog} className="tx-cu-image-dialog" aria-label="截图预览" onCancel={event=>{event.preventDefault();onClose();}} onKeyDown={event=>{event.stopPropagation();if(['+','=','-','0'].includes(event.key)){event.preventDefault();if(event.key==='0'){setOriginal(false);setZoom(1);}else zoomBy(event.key==='-'?-1:1);}}}>
    <header><span>截图{size&&<small>{size.width} × {size.height}</small>}</span><div><button type="button" aria-label="缩小截图" title="缩小（−）" disabled={!size||scale<=.1} onClick={()=>zoomBy(-1)}><ComputerIcon name="minus" size={15}/></button><output aria-label="截图缩放比例">{Math.round(scale*100)}%</output><button type="button" aria-label="放大截图" title="放大（+）" disabled={!size||scale>=4} onClick={()=>zoomBy(1)}><ComputerIcon name="plus" size={15}/></button><button type="button" className="tx-cu-image-fit" onClick={toggle}>{original?'适应窗口':'实际大小'}</button><a href={src} download="computer-use-screenshot.png" title="下载截图"><ComputerIcon name="download" size={15}/><span>下载</span></a><button type="button" aria-label="关闭截图预览" title="关闭（Esc）" autoFocus onClick={onClose}><ComputerIcon name="close"/></button></div></header>
    <div ref={canvas} tabIndex={0} aria-label="截图画布" className={'tx-cu-image-canvas'+(original?' is-original':'')+(panning?' is-panning':'')} onDoubleClick={event=>{if(!event.target.closest('button,a')&&!failed)toggle();}} onClick={event=>{if(moved.current){moved.current=false;return;}if(!original&&(event.target===event.currentTarget||event.target.classList.contains('tx-cu-image-stage')))onClose();}} onPointerDown={event=>{moved.current=false;if(event.button!==0||!original)return;if(event.currentTarget.scrollWidth<=event.currentTarget.clientWidth&&event.currentTarget.scrollHeight<=event.currentTarget.clientHeight)return;event.preventDefault();event.currentTarget.focus({preventScroll:true});drag.current={x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,top:event.currentTarget.scrollTop};event.currentTarget.setPointerCapture(event.pointerId);setPanning(true);}} onPointerMove={event=>{const start=drag.current;if(start){moved.current||=Math.hypot(event.clientX-start.x,event.clientY-start.y)>3;event.currentTarget.scrollLeft=start.left+start.x-event.clientX;event.currentTarget.scrollTop=start.top+start.y-event.clientY;}}} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={()=>{drag.current=null;setPanning(false);}}>
      {failed?<div className="tx-cu-image-failure" role="alert">截图加载失败<button type="button" onClick={()=>{setFailed(false);setRetry(value=>value+1);}}>重试</button></div>:<div className="tx-cu-image-stage"><img key={retry} src={src} alt="Computer Use 截图大图" draggable={false} style={size?{width:size.width*scale,height:size.height*scale}:undefined} onError={()=>setFailed(true)} onLoad={event=>setSize({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})}/></div>}
    </div>
    <footer>双击切换实际大小 · 放大后拖动查看 · Esc 关闭</footer>
  </dialog>,document.body);
}

export function SavedImage({attachment,loadImage}){
  const[src,setSrc]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0),[open,setOpen]=useState(false);
  useEffect(()=>{let active=true;setSrc('');setError('');setOpen(false);
    if(loadImage)void loadImage(attachment).then(value=>{if(active)setSrc(value);}).catch(error=>{if(active)setError(error.message||'截图加载失败');});
    return()=>{active=false;};
  },[attachment,loadImage,retry]);
  if(error)return <button type="button" className="tx-cu-image-retry" onClick={()=>setRetry(value=>value+1)} title={error}>截图加载失败 · 重试</button>;
  return src?<><button type="button" className="tx-cu-image-button" aria-label="查看截图大图" onClick={()=>setOpen(true)}><img className="tx-cu-card-image" src={src} alt="Computer Use 截图" onError={()=>setError('截图无法显示，请重试')}/></button>{open&&<ImageDialog src={src} onClose={()=>setOpen(false)}/>}</>:<span className="tx-cu-image-loading" role="status">正在加载截图…</span>;
}
