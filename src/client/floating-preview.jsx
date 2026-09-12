import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {NativePreview} from './native-preview.jsx';
import css from './computer-use.css';
import {ComputerIcon} from './computer-icons.jsx';

// A separate read-only observer: closing the window releases only its stream.
export function FloatingPreview({sessionId,state,url,api,onState,onError,anchor}){
  const [popup,setPopup]=useState(null),[opening,setOpening]=useState(false),[stopping,setStopping]=useState(false),[expanded,setExpanded]=useState(false),[zoomed,setZoomed]=useState(null),[localError,setLocalError]=useState('');
  const [shown,setShown]=useState(true),[position,setPosition]=useState({right:20,bottom:120});
  const [dragging,setDragging]=useState(false);
  const owned=useRef(null),generation=useRef(0),floating=useRef(null),manual=useRef(null),drag=useRef(null),layout=useRef(null);
  const target=state?.target,key=target?.viewId??target?.id;
  const targets=(state?.previewTargets??(target?[target]:[])).slice().reverse().sort((a,b)=>Number((b.viewId??b.id)===key)-Number((a.viewId??a.id)===key));
  useEffect(()=>()=>{generation.current++;owned.current?.close();owned.current=null;setPopup(null);},[sessionId,state?.enabled]);
  useEffect(()=>{setShown(true);setLocalError('');},[sessionId,key]);
  useEffect(()=>{manual.current=null;setZoomed(null);setExpanded(false);layout.current?.();},[sessionId]);
  const targetIds=targets.map(item=>item.viewId??item.id).join('|');
  useEffect(()=>{if(zoomed&&!targets.some(item=>(item.viewId??item.id)===zoomed))setZoomed(null);},[targetIds,zoomed]);
  const finishDrag=()=>{
    const active=drag.current;drag.current=null;setDragging(false);
    if(active?.element.hasPointerCapture(active.id))active.element.releasePointerCapture(active.id);
  };
  useEffect(()=>{finishDrag();return()=>{const active=drag.current;drag.current=null;if(active?.element.hasPointerCapture(active.id))active.element.releasePointerCapture(active.id);};},[sessionId,popup,shown]);
  useEffect(()=>{
    let observedInput;
    const update=()=>{
      let container=anchor?.current?.parentElement;while(container&&!container.querySelector('[contenteditable="true"]'))container=container.parentElement;
      const input=container?.querySelector('[contenteditable="true"]');
      if(input!==observedInput){if(observedInput)observer.unobserve(observedInput);if(input)observer.observe(input);observedInput=input;}
      const rect=(input??anchor?.current)?.getBoundingClientRect();if(!rect)return;
      const width=Math.min(zoomed?640:Math.min(320,Math.max(220,rect.width+24)),Math.max(1,window.innerWidth-24));
      const height=Math.min(zoomed?520:260,Math.max(1,window.innerHeight-24));
      const clamp=(value,max)=>Math.max(12,Math.min(value,Math.max(12,max)));
      const place=manual.current
        ?{left:clamp(manual.current.left,window.innerWidth-width-12),top:clamp(manual.current.top,window.innerHeight-height-12)}
        :{right:clamp(window.innerWidth-rect.right,window.innerWidth-width-12),bottom:clamp(window.innerHeight-rect.top+28,window.innerHeight-height-12)};
      setPosition({...place,width,height,'--cu-floating-height':height+'px'});
    };
    const observer=new ResizeObserver(update);layout.current=update;update();if(anchor?.current)observer.observe(anchor.current);window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return()=>{layout.current=null;observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[anchor,sessionId,shown,zoomed,popup]);
  const startDrag=event=>{
    if(popup||event.button!==0||event.isPrimary===false||event.target.closest('button'))return;
    const box=floating.current?.getBoundingClientRect();if(!box)return;
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={id:event.pointerId,element:event.currentTarget,x:event.clientX,y:event.clientY,left:box.left,top:box.top};
  };
  const moveDrag=event=>{
    const active=drag.current;if(!active||active.id!==event.pointerId)return;
    if(Math.hypot(event.clientX-active.x,event.clientY-active.y)<3&&!manual.current)return;
    manual.current={left:active.left+event.clientX-active.x,top:active.top+event.clientY-active.y};
    setDragging(true);layout.current?.();
  };
  useEffect(()=>{
    if(!popup)return;
    const sync=()=>{const source=getComputedStyle(anchor?.current??document.documentElement);for(const key of ['--dsw-alias-bg-base','--dsw-alias-label-primary','--dsw-alias-label-tertiary','--dsw-alias-state-error-primary'])popup.document.documentElement.style.setProperty(key,source.getPropertyValue(key));popup.document.documentElement.className=document.documentElement.className;popup.document.documentElement.dataset.theme=document.documentElement.dataset.theme??'';popup.document.documentElement.style.colorScheme=getComputedStyle(document.documentElement).colorScheme;};
    sync();const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true});observer.observe(document.body,{attributes:true});
    const theme=window.matchMedia('(prefers-color-scheme: dark)');theme.addEventListener('change',sync);
    return()=>{observer.disconnect();theme.removeEventListener('change',sync);};
  },[popup]);
  const open=async()=>{
    if(owned.current&&!owned.current.closed){owned.current.close();return;}
    if(!window.documentPictureInPicture){onError('当前浏览器不支持置顶悬浮预览，请用新版 Chrome 打开 Oh My DSH。');return;}
    const revision=generation.current;setOpening(true);
    try{
      const next=await window.documentPictureInPicture.requestWindow({width:zoomed?640:400,height:zoomed?520:320});
      if(revision!==generation.current){next.close();return;}
      next.document.title='Oh My DSH · 操控预览';
      const style=next.document.createElement('style');style.textContent=css;next.document.head.append(style);
      owned.current=next;
      next.addEventListener('pagehide',()=>{if(owned.current===next){owned.current=null;setPopup(null);}},{once:true});
      setPopup(next);
    }catch(error){onError('无法打开悬浮预览：'+error.message);}finally{setOpening(false);}
  };
  const stop=async()=>{setStopping(true);try{onState(await api('stop',sessionId,{}));}catch(error){onError(error.message);}finally{setStopping(false);}};
  const close=()=>{setShown(false);owned.current?.close();};
  return <>{!!targets.length&&<button type="button" disabled={state?.enabled===false} onClick={()=>setShown(true)} aria-label="悬浮预览" title="在对话中显示操控画面"><ComputerIcon name="preview" size={14}/></button>}
    {shown&&state?.enabled!==false&&targets.length>0&&createPortal(<div ref={popup?null:floating} className={'tx-cu-floating'+(popup?'':' tx-cu-floating-inline')+(zoomed?' is-zoomed':'')+(dragging?' is-dragging':'')} style={popup?undefined:position} aria-label="悬浮操控预览">
      <header onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag} onDoubleClick={event=>{if(!popup&&!event.target.closest('button')){manual.current=null;layout.current?.();}}} title={popup?undefined:'拖动移动预览，双击恢复默认位置'}><div><ComputerIcon name="screen" size={14}/><strong>操控预览</strong>{targets.length>1&&<span className="tx-cu-floating-count">{targets.length} 个窗口</span>}</div><div>{zoomed&&<button type="button" aria-label="缩小预览" title="缩小预览" onClick={()=>setZoomed(null)}><ComputerIcon name="shrink" size={13}/></button>}{popup?<button type="button" aria-label="返回对话" title="返回对话" onClick={()=>{window.focus();popup.close();}}><ComputerIcon name="return" size={13}/></button>:<button type="button" aria-label="弹出预览" title="弹出为独立窗口" disabled={opening} onClick={open}><ComputerIcon name="popout" size={13}/></button>}<button type="button" aria-label="关闭操控预览" title="关闭预览" onClick={close}><ComputerIcon name="close" size={14}/></button></div></header>
      <div className={'tx-cu-preview-stack'+(zoomed?' is-focused':expanded?' is-expanded':'')} style={{'--preview-count':zoomed?1:Math.max(1,targets.length)}} aria-label="窗口预览堆叠">
        {targets.map((item,index)=>{const id=item.viewId??item.id;return <div key={id} className="tx-cu-preview-card" style={{'--preview-depth':index,zIndex:targets.length-index}} data-target={id} data-focused={id===zoomed?true:undefined}>
          <NativePreview sessionId={sessionId} targetId={id} targetKind={item.kind} stacked visible state={state} url={url} onError={message=>setLocalError(message)}/>
          <button type="button" className="tx-cu-preview-open" aria-label={'放大预览：'+(item.name||item.title||'网页')} onClick={()=>setZoomed(id)}><span><ComputerIcon name={item.kind==='app'?'screen':'browser'} size={12}/><span className="tx-cu-preview-name">{item.name||item.title||'网页'}</span></span><span><ComputerIcon name="expand" size={12}/></span></button>
        </div>;})}
        {!targets.length&&<div className="tx-cu-live-placeholder">当前目标已关闭</div>}
      </div>
      {localError&&<p className="tx-cu-error" role="alert">{localError}</p>}
      <footer><span>{stopping||state?.status==='stopping'?'正在停止…':state?.status==='stopped'?'已停止 · 可手动操作':state?.status==='running'?'助手正在操作':'点击画面放大查看'}</span>{targets.length>1&&<button type="button" aria-expanded={expanded&&!zoomed} onClick={()=>{if(zoomed){setZoomed(null);setExpanded(true);}else setExpanded(value=>!value);}}><ComputerIcon name="stack" size={12}/>{zoomed?'查看全部':expanded?'堆叠':'展开'} {targets.length}</button>}<button className="tx-cu-stop" type="button" aria-label="停止操作" title="停止操作" disabled={stopping||['stopped','stopping'].includes(state?.status)} onClick={stop}><ComputerIcon name="stop" size={14}/></button></footer>
    </div>,popup?.document.body??document.body)}
  </>;
}
