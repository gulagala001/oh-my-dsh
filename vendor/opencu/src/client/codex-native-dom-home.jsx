import {useLayoutEffect,useRef,useState} from 'react';

// A DOM surface has its own mount identity. It never supplies a native owner,
// screen anchor, window handle, Host epoch or physical placement.
export function useCodexNativeDomHome({sessionId,surfaceRef,active,ready,orderedPresentationIDs=[],onDomHomeChange,enabled=true}) {
  const [surfaceID]=useState(()=>crypto.randomUUID());
  const revision=useRef(0),last=useRef(''),values=useRef(null),callback=useRef(onDomHomeChange);
  values.current={active,ready,orderedPresentationIDs};callback.current=onDomHomeChange;
  const key=JSON.stringify([active,ready,orderedPresentationIDs]);
  const publish=useRef(null);
  useLayoutEffect(()=>{
    const node=surfaceRef.current;if(!node||!enabled||!callback.current)return;
    const document=node.ownerDocument,view=document.defaultView;
    let disposed=false,handle;
    const send=value=>{
      const encoded=JSON.stringify(value);if(last.current===encoded)return;
      last.current=encoded;
      callback.current?.(sessionId,{surfaceID,revision:++revision.current,...value});
    };
    const measure=()=>{
      if(disposed)return;
      const input=values.current,rect=node.getBoundingClientRect(),style=view.getComputedStyle(node);
      const available=node.isConnected;
      const visible=available&&input.active&&document.visibilityState==='visible'&&node.getClientRects().length>0
        &&rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'
        &&!node.closest('[hidden],[inert]')&&(node.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})??true);
      send({available,visible,active:available&&input.active,ready:visible&&input.active&&input.ready,
        orderedPresentationIDs:input.orderedPresentationIDs});
    };
    const schedule=()=>{cancelAnimationFrame(handle);handle=requestAnimationFrame(measure);};
    publish.current=schedule;
    const resize=new ResizeObserver(schedule),mutation=new MutationObserver(schedule);
    resize.observe(node);
    for(let parent=node;parent;parent=parent.parentElement)mutation.observe(parent,{attributes:true,attributeFilter:['class','style','hidden','inert','aria-hidden']});
    document.addEventListener('visibilitychange',schedule);view.addEventListener('resize',schedule);
    measure();
    return()=>{
      disposed=true;publish.current=null;cancelAnimationFrame(handle);resize.disconnect();mutation.disconnect();
      document.removeEventListener('visibilitychange',schedule);view.removeEventListener('resize',schedule);
      send({available:false,visible:false,active:false,ready:false,orderedPresentationIDs:[]});
    };
  },[sessionId,surfaceID,surfaceRef,enabled]);
  useLayoutEffect(()=>publish.current?.(),[key]);
  return surfaceID;
}
