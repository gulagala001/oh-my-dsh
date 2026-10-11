import React,{useLayoutEffect,useRef,useState} from 'react';
import {CodexCuOverlay} from './codex-cu-overlay.jsx';

// Source Hji desktop submenu offsets over the shared overlay host. This wrapper
// does not duplicate menu focus, typeahead, dismissal, theme or loop behavior.
export function BrowserLayer({anchorRef,open=true,onClose,children,sideOffset=1,collisionPadding=6,initialFocus=false,openIntent='pointer',flyout=false,parentMenuRef,zoom=1,type='menu'}){
  const content=useRef(null),[flyoutGeometry,setFlyoutGeometry]=useState({sideOffset:4,alignOffset:0});
  useLayoutEffect(()=>{
    if(!open||!flyout)return;
    const measure=()=>{
      const trigger=anchorRef.current?.getBoundingClientRect(),parent=parentMenuRef?.current?.getBoundingClientRect(),surface=content.current?.matches('[role=menu]')?content.current:content.current?.querySelector('[role=menu]'),style=surface?getComputedStyle(surface):null;
      if(!trigger||!parent)return;
      setFlyoutGeometry({sideOffset:4+Math.max(trigger.left-parent.left,parent.right-trigger.right,0)/zoom,alignOffset:-(parseFloat(style?.paddingTop)||0)-(parseFloat(style?.marginTop)||0)});
    };
    measure();const observer=new ResizeObserver(measure);if(content.current)observer.observe(content.current);if(anchorRef.current)observer.observe(anchorRef.current);if(parentMenuRef?.current)observer.observe(parentMenuRef.current);return()=>observer.disconnect();
  },[open,flyout,zoom]);
  return <CodexCuOverlay type={type} open={open} anchorRef={anchorRef} contentRef={content} onClose={onClose} manageTrigger={false} autoFocus={initialFocus} openIntent={openIntent} loop={false} align={flyout?'start':'end'} side={flyout?(anchorRef.current&&getComputedStyle(anchorRef.current).direction==='rtl'?'left':'right'):'bottom'} sideOffset={flyout?flyoutGeometry.sideOffset:sideOffset} alignOffset={flyout?flyoutGeometry.alignOffset:0} collisionPadding={collisionPadding} content={children}/>;
}
