import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {NativePreview} from './native-preview.jsx';
import css from './computer-use.css';
import {ComputerIcon} from './computer-icons.jsx';

// A separate read-only observer: closing the window releases only its stream.
export function FloatingPreview({sessionId,state,url,api,onState,onError,anchor,onOpen}){
  const [popup,setPopup]=useState(null),[opening,setOpening]=useState(false),[stopping,setStopping]=useState(false),[expanded,setExpanded]=useState(false),[zoomed,setZoomed]=useState(null),[localError,setLocalError]=useState('');
  const [shown,setShown]=useState(true),[position,setPosition]=useState({right:20,bottom:120});
  const [dragging,setDragging]=useState(false);
  const [frameSizes,setFrameSizes]=useState({});
  const [front,setFront]=useState(null),[entering,setEntering]=useState(false);
  const [query,setQuery]=useState(''),[resuming,setResuming]=useState(false),[connections,setConnections]=useState({}),[targetErrors,setTargetErrors]=useState({});
  const keyboardTarget=useRef(null);
  const owned=useRef(null),generation=useRef(0),floating=useRef(null),manual=useRef(null),drag=useRef(null),layout=useRef(null);
  const target=state?.target,key=target?.viewId??target?.id;
  const orderedTargets=(state?.previewTargets??(target?[target]:[])).slice().reverse();
  const targets=orderedTargets.slice().sort((a,b)=>Number((b.viewId??b.id)===(front??key))-Number((a.viewId??a.id)===(front??key)));
  useEffect(()=>()=>{generation.current++;owned.current?.close();owned.current=null;setPopup(null);},[sessionId,state?.enabled]);
  useEffect(()=>{setShown(true);setLocalError('');setFront(null);},[sessionId,key]);
  useEffect(()=>{manual.current=null;setZoomed(null);setExpanded(false);layout.current?.();},[sessionId]);
  const targetIds=targets.map(item=>item.viewId??item.id).join('|');
  const leading=targets.find(item=>(item.viewId??item.id)===zoomed)??targets[0];
  const leadingId=leading?.viewId??leading?.id;
  const matches=item=>(item.name||item.title||item.url||'').toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const visibleError=localError||targetErrors[leadingId];
  useEffect(()=>{if(!expanded)setQuery('');},[expanded]);
  useEffect(()=>{setConnections({});setTargetErrors({});setQuery('');setResuming(false);setStopping(false);},[sessionId]);
  useLayoutEffect(()=>{if(!keyboardTarget.current)return;const root=popup?.document??document;[...root.querySelectorAll('.tx-cu-preview-card')].find(element=>element.dataset.target===keyboardTarget.current)?.querySelector('.tx-cu-preview-open')?.focus({preventScroll:true});keyboardTarget.current=null;},[front,zoomed,popup]);
  const depth=zoomed||expanded?0:Math.max(0,Math.min(4,targets.length-1));
  const sizeKey=targets.map(item=>{const size=frameSizes[item.viewId??item.id];return size?`${size.width}:${size.height}`:'16:9';}).join('|');
  useEffect(()=>{if(zoomed&&!targets.some(item=>(item.viewId??item.id)===zoomed))setZoomed(null);},[targetIds,zoomed]);
  const finishDrag=()=>{
    const active=drag.current;drag.current=null;setDragging(false);
    if(active?.element.hasPointerCapture(active.id))active.element.releasePointerCapture(active.id);
  };
  useEffect(()=>{finishDrag();return()=>{const active=drag.current;drag.current=null;if(active?.element.hasPointerCapture(active.id))active.element.releasePointerCapture(active.id);};},[sessionId,popup,shown]);
  useLayoutEffect(()=>{
    let observedInput;
    const update=()=>{
      let container=anchor?.current?.parentElement;while(container&&!container.querySelector('[contenteditable="true"]'))container=container.parentElement;
      const input=container?.querySelector('[contenteditable="true"]');
      if(input!==observedInput){if(observedInput)observer.unobserve(observedInput);if(input)observer.observe(input);observedInput=input;}
      const rect=(input??anchor?.current)?.getBoundingClientRect();if(!rect)return;
      const viewport=popup??window;
      const availableWidth=popup?viewport.innerWidth-12:Math.min(zoomed?640:Math.max(240,rect.width+24),viewport.innerWidth-24);
      const availableHeight=popup?viewport.innerHeight-12:Math.min(viewport.innerHeight-24,manual.current?viewport.innerHeight:Math.max(180,rect.top-40));
      const maxWidth=Math.max(1,Math.min(zoomed?640:400,availableWidth-depth*28));
      const maxHeight=Math.max(1,Math.min(zoomed?560:400,availableHeight-64-depth*22));
      const visibleTargets=zoomed?targets.filter(item=>(item.viewId??item.id)===zoomed):targets.slice(0,5);
      const sizes=visibleTargets.map((item,index)=>{const size=frameSizes[item.viewId??item.id]??{width:16,height:9};const scale=Math.min(maxWidth/size.width,maxHeight/size.height);return {width:size.width*scale+depth*28,height:size.height*scale+index*22};});
      const width=Math.min(availableWidth,Math.max(240,...sizes.map(size=>size.width)));
      const height=expanded?Math.min(440,availableHeight):Math.max(1,...sizes.map(size=>size.height))+64;
      const clamp=(value,max)=>Math.max(12,Math.min(value,Math.max(12,max)));
      const place=manual.current
        ?{left:clamp(manual.current.left,window.innerWidth-width-12),top:clamp(manual.current.top,window.innerHeight-height-12)}
        :{right:clamp(window.innerWidth-rect.right,window.innerWidth-width-12),bottom:clamp(window.innerHeight-rect.top+28,window.innerHeight-height-12)};
      setPosition({...place,width,height,'--cu-card-max-width':maxWidth+'px','--cu-card-max-height':maxHeight+'px'});
    };
    const observer=new ResizeObserver(update);layout.current=update;update();if(anchor?.current)observer.observe(anchor.current);window.addEventListener('resize',update);popup?.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return()=>{layout.current=null;observer.disconnect();window.removeEventListener('resize',update);popup?.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[anchor,sessionId,shown,zoomed,popup,expanded,depth,targetIds,sizeKey]);
  const frameSize=(id,size)=>setFrameSizes(previous=>previous[id]?.width===size.width&&previous[id]?.height===size.height?previous:{...previous,[id]:size});
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
  const stop=async()=>{const revision=generation.current;setStopping(true);try{const next=await api('stop',sessionId,{});if(revision===generation.current)onState(next);}catch(error){if(revision===generation.current)setLocalError(error.message);}finally{if(revision===generation.current)setStopping(false);}};
  const resume=async()=>{const revision=generation.current;setResuming(true);setLocalError('');try{const next=await api('resume',sessionId,{});if(revision===generation.current)onState(next);}catch(error){if(revision===generation.current)setLocalError(error.message);}finally{if(revision===generation.current)setResuming(false);}};
  const close=()=>{setShown(false);owned.current?.close();};
  const resetPosition=()=>{manual.current=null;layout.current?.();};
  const previewKey=event=>{
    if(event.target.closest('input,textarea,select')||event.metaKey||event.ctrlKey||event.altKey)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(zoomed)setZoomed(null);else if(expanded)setExpanded(false);else close();return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)||targets.length<2)return;
    event.preventDefault();event.stopPropagation();const index=Math.max(0,orderedTargets.findIndex(item=>(item.viewId??item.id)===(zoomed??front??key)));
    const next=orderedTargets[event.key==='Home'?0:event.key==='End'?orderedTargets.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+orderedTargets.length)%orderedTargets.length],id=next.viewId??next.id;
    keyboardTarget.current=id;setFront(id);if(zoomed)setZoomed(id);
  };
  const selectPreview=async(item,index)=>{
    const id=item.viewId??item.id;
    if(index>0&&!zoomed){setFront(id);setExpanded(false);return;}
    if(item.kind!=='tab'){setZoomed(id);return;}
    const revision=generation.current;setEntering(true);setLocalError('');
    try{
      const next=await api('view-tab',sessionId,{tabId:item.id,browserId:item.browserId});if(revision!==generation.current)return;onState(next);
      if(revision!==generation.current)return;
      await onOpen?.();close();
    }catch(error){if(revision===generation.current)setLocalError(error.message);}finally{if(revision===generation.current)setEntering(false);}
  };
  return <>{!!targets.length&&<button type="button" disabled={state?.enabled===false} onClick={()=>setShown(true)} aria-label="悬浮预览" aria-expanded={shown} title="在对话中显示操控画面"><ComputerIcon name="preview" size={14}/></button>}
    {shown&&state?.enabled!==false&&targets.length>0&&createPortal(<div ref={popup?null:floating} className={'tx-cu-floating'+(popup?'':' tx-cu-floating-inline')+(zoomed?' is-zoomed':'')+(dragging?' is-dragging':'')+(expanded&&!zoomed?' is-list':'')} style={popup?{'--cu-card-max-width':position['--cu-card-max-width'],'--cu-card-max-height':position['--cu-card-max-height']}:position} aria-label="悬浮操控预览" onKeyDown={previewKey}>
      <header onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag} onDoubleClick={event=>{if(!popup&&!event.target.closest('button'))resetPosition();}} title={popup?undefined:'拖动移动预览，双击恢复默认位置'}><div><ComputerIcon name={leading?.kind==='app'?'screen':'browser'} size={14}/><strong title={leading?.name||leading?.title}>{leading?.name||leading?.title||'操控预览'}</strong>{targets.length>1&&<span className="tx-cu-floating-count">{targets.length}</span>}</div><div>{!popup&&manual.current&&<button type="button" aria-label="重置预览位置" title="重置位置" onClick={resetPosition}><ComputerIcon name="reset" size={13}/></button>}{zoomed&&<button type="button" aria-label="缩小预览" title="缩小预览" onClick={()=>setZoomed(null)}><ComputerIcon name="shrink" size={13}/></button>}{popup?<button type="button" aria-label="返回对话" title="返回对话" onClick={()=>{window.focus();popup.close();}}><ComputerIcon name="return" size={13}/></button>:<button type="button" aria-label="弹出预览" title="弹出为独立窗口" disabled={opening} onClick={open}><ComputerIcon name="popout" size={13}/></button>}<button type="button" aria-label="关闭操控预览" title="关闭预览" onClick={close}><ComputerIcon name="close" size={14}/></button></div></header>
      {expanded&&!zoomed&&<div className="tx-cu-preview-search"><ComputerIcon name="search" size={13}/><input type="search" aria-label="筛选预览目标" placeholder="搜索窗口或网页" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(query)setQuery('');else setExpanded(false);}}}/></div>}
      <div className={'tx-cu-preview-stack'+(zoomed?' is-focused':expanded?' is-expanded':'')} style={{'--preview-count':zoomed?1:Math.max(1,targets.length)}} aria-label="窗口预览堆叠">
        {targets.map((item,index)=>{const id=item.viewId??item.id,size=frameSizes[id]??{width:16,height:9};return <div key={id} className="tx-cu-preview-card" style={{'--preview-depth':index,'--preview-ratio':size.width/size.height,zIndex:targets.length-index,display:expanded&&!zoomed&&!matches(item)?'none':undefined}} data-target={id} data-focused={id===zoomed?true:undefined} data-connection={connections[id]}>
          <NativePreview sessionId={sessionId} targetId={id} targetKind={item.kind} stacked visible state={state} url={url} onError={message=>setTargetErrors(previous=>previous[id]===message?previous:{...previous,[id]:message})} onConnection={connection=>{setConnections(previous=>previous[id]===connection?previous:{...previous,[id]:connection});if(connection==='live')setTargetErrors(previous=>previous[id]?{...previous,[id]:null}:previous);}} onFrameSize={size=>frameSize(id,size)}/>
          <button type="button" className="tx-cu-preview-open" disabled={entering} aria-label={(index>0&&!zoomed?'置于最前：':item.kind==='tab'?'打开网页：':'放大预览：')+(item.name||item.title||'网页')} onClick={()=>selectPreview(item,index)}><span><ComputerIcon name={item.kind==='app'?'screen':'browser'} size={12}/><span className="tx-cu-preview-name">{item.name||item.title||'网页'}</span></span><span><ComputerIcon name={item.kind==='tab'?'popout':'expand'} size={12}/></span></button>
        </div>;})}
        {expanded&&!zoomed&&!targets.some(matches)&&<p className="tx-cu-preview-empty">没有匹配的窗口或网页</p>}
      </div>
      {visibleError&&<p className="tx-cu-error" role="alert">{visibleError}</p>}
      <footer><span>{entering?'正在打开…':resuming||state?.resuming?'正在恢复…':stopping||state?.status==='stopping'?'正在停止…':state?.status==='stopped'?'已停止 · 可手动操作':connections[leadingId]==='error'||connections[leadingId]==='closed'?'画面已断开':state?.status==='running'?'助手正在操作':'只读预览'}</span>{!zoomed&&<button type="button" aria-label="放大预览" title="仅放大查看" onClick={()=>setZoomed(leading.viewId??leading.id)}><ComputerIcon name="expand" size={12}/></button>}{targets.length>1&&<button type="button" aria-expanded={expanded&&!zoomed} onClick={()=>{if(zoomed){setZoomed(null);setExpanded(true);}else setExpanded(value=>!value);}}><ComputerIcon name="stack" size={12}/>{zoomed?'查看全部':expanded?'堆叠':'展开'} {targets.length}</button>}{state?.status==='stopped'?<button className="tx-cu-resume" type="button" aria-label="从预览恢复助手" title="恢复助手控制" disabled={resuming||state?.resuming||state?.transitioning} onClick={resume}><ComputerIcon name="play" size={14}/></button>:<button className="tx-cu-stop" type="button" aria-label="停止操作" title="停止操作" disabled={stopping||state?.status==='stopping'} onClick={stop}><ComputerIcon name="stop" size={14}/></button>}</footer>
    </div>,popup?.document.body??document.body)}
  </>;
}
