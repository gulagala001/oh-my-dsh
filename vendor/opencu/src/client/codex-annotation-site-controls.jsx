import React, {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CodexCuButton,CodexCuMenuItem,CodexCuMenuSurface,CodexCuToggle,CodexCuTooltip} from './codex-cu-primitives.jsx';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {CodexAnnotationColorControl} from './codex-annotation-color.jsx';
import {CodexAnnotationValueCell} from './codex-annotation-layout.jsx';
import {CODEX_CU_COPY} from './codex-cu-copy.mjs';
import css from './codex-annotation-site-controls.css';

const copy=(key,values={})=>(CODEX_CU_COPY['browserSidebarDesignEditor.annotationControls.'+key]?.simplifiedChinese??CODEX_CU_COPY['browserSidebarDesignEditor.annotationControls.'+key]?.english??'').replace(/\{(\w+)\}/g,(value,name)=>Object.hasOwn(values,name)?String(values[name]):value);
const hex=/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const rangeKeys=new Set(['ArrowDown','ArrowLeft','ArrowRight','ArrowUp','End','Home','PageDown','PageUp']);

// Source qd/R and me/he/ge in design-editor-state-cbd8e3f3ac58.js.
export const codexAnnotationSiteDefaultValue=control=>control.defaultValue??control.currentValue??(control.type==='color'?'#ffffff':control.type==='select'?control.options[0].value:control.type==='range'?control.min:false);
export const codexAnnotationSiteChange=(editorState,control)=>editorState.annotationControlChanges?.find(value=>value.callback===control.callback)??{callback:control.callback,previousValue:control.currentValue,value:control.currentValue??codexAnnotationSiteDefaultValue(control)};
export const codexAnnotationSiteHeading=editorState=>editorState?.annotationControls?.controlsHeading??copy('heading');

function SiteSelect({control,value,previousValue,describedBy,disabled,portalContainer,onEditingChange,onValueChange}){
  const [open,setOpen]=useState(false),[position,setPosition]=useState(null);const anchor=useRef(null),panel=useRef(null),portal=useRef(null),callbacks=useRef(null);callbacks.current={onEditingChange};
  const changeOpen=next=>{setOpen(next);callbacks.current.onEditingChange?.(next);};
  useEffect(()=>()=>callbacks.current.onEditingChange?.(false),[]);
  useEffect(()=>{if(disabled&&open)changeOpen(false);},[disabled]);
  useLayoutEffect(()=>{
    if(!open||!anchor.current)return;
    const root=portalContainer??anchor.current.closest('[data-codex-cu-scope]')??anchor.current.parentElement;portal.current=root;
    const measure=()=>{const box=anchor.current.getBoundingClientRect(),bounds=root.getBoundingClientRect(),scaleX=bounds.width/root.clientWidth||1,scaleY=bounds.height/root.clientHeight||1,width=Math.min(220,Math.max(180,box.width/scaleX)),bottom=(box.bottom-bounds.top)/scaleY,below=root.clientHeight-bottom-8,top=below>=80?bottom+4:Math.max(8,(box.top-bounds.top)/scaleY-Math.min(220,control.options.length*32+8)-4),height=Math.max(40,Math.min(220,root.clientHeight-top-8));setPosition({position:'absolute',left:Math.max(8,Math.min(root.clientWidth-width-8,(box.right-bounds.left)/scaleX-width)),top,width,maxHeight:height,'--radix-dropdown-menu-content-available-width':`${root.clientWidth-16}px`,'--radix-dropdown-menu-content-available-height':`${height}px`});};
    const outside=event=>{if(!panel.current?.contains(event.target)&&!anchor.current?.contains(event.target))changeOpen(false);};
    measure();const observer=new ResizeObserver(measure);observer.observe(root);observer.observe(anchor.current);document.addEventListener('pointerdown',outside);root.addEventListener('scroll',measure,true);
    return()=>{observer.disconnect();document.removeEventListener('pointerdown',outside);root.removeEventListener('scroll',measure,true);};
  },[open,portalContainer,control.options.length]);
  useLayoutEffect(()=>{if(open&&position)(panel.current?.querySelector('[aria-checked=true]')??panel.current?.querySelector('[role=menuitemradio]'))?.focus();},[open,!!position]);
  const choose=next=>{if(!disabled)onValueChange(next);changeOpen(false);anchor.current?.focus();};
  const keydown=event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();changeOpen(false);anchor.current?.focus();return;}
    const items=[...panel.current.querySelectorAll('[role=menuitemradio]:not([aria-disabled=true])')],index=items.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}
    if((event.key==='Enter'||event.key===' ')&&document.activeElement?.getAttribute('role')==='menuitemradio'){event.preventDefault();document.activeElement.click();}
  };
  const label=control.options.find(option=>option.value===value)?.label??String(value);
  return <><button ref={anchor} type="button" className="codex-annotation-site-select" aria-label={control.label} aria-describedby={describedBy} aria-haspopup="menu" aria-expanded={open} disabled={disabled} title={disabled?label:undefined} data-edited={value!==previousValue||undefined} onClick={()=>changeOpen(!open)} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();changeOpen(true);}}}><span>{label}</span><CodexCuIcon name="shared:wE" size={14} style={{transform:'rotate(90deg)'}}/></button>
    {open&&position&&portal.current&&createPortal(<CodexCuMenuSurface ref={panel} size="select" width="sm" align="end" className="codex-annotation-site-select-menu" style={position} onKeyDown={keydown}>{control.options.map(option=><CodexCuMenuItem key={option.value} role="menuitemradio" aria-checked={option.value===value} allowWrap disabled={disabled} onSelect={()=>choose(option.value)} rightIcon={option.value===value?<CodexCuIcon name="shared:vpt" size={16}/>:undefined}>{option.label}</CodexCuMenuItem>)}</CodexCuMenuSurface>,portal.current)}
  </>;
}

function SiteRange({control,value,describedBy,disabled,onEditingChange,onScrubChange,onValueChange}){
  const input=useRef(null),pointer=useRef(null),editing=useRef(false),callbacks=useRef(null);callbacks.current={onEditingChange,onScrubChange};
  const clear=()=>{if(pointer.current!=null){pointer.current=null;callbacks.current.onScrubChange?.(null);}if(editing.current){editing.current=false;callbacks.current.onEditingChange?.(false);}};
  useEffect(()=>{const view=input.current?.ownerDocument.defaultView;view?.addEventListener('blur',clear);return()=>{view?.removeEventListener('blur',clear);clear();};},[]);
  const end=event=>{if(pointer.current===event.pointerId){pointer.current=null;callbacks.current.onScrubChange?.(null);}};
  return <span className="codex-annotation-site-range-field"><input ref={input} className="codex-annotation-site-range" type="range" aria-label={control.label} aria-describedby={describedBy} disabled={disabled} min={control.min} max={control.max} step={control.step} value={value} onChange={event=>onValueChange(event.currentTarget.valueAsNumber)} onBlur={clear} onKeyDown={event=>{if(!event.defaultPrevented&&rangeKeys.has(event.key)){editing.current=true;callbacks.current.onEditingChange?.(true);}}} onKeyUp={event=>{if(rangeKeys.has(event.key)){editing.current=false;callbacks.current.onEditingChange?.(false);}}} onPointerDown={event=>{if(event.button===0&&event.isPrimary&&!disabled){pointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);callbacks.current.onScrubChange?.(control.callback,event.currentTarget);}}} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}/><span className="codex-annotation-site-range-value">{value}</span></span>;
}

function SiteColor({control,value,previousValue,describedBy,disabled,portalContainer,onDragChange,onEditingChange,onValueChange}){
  const [draft,setDraft]=useState(null),shown=draft?.value===value?draft.text:value;
  return <span className="codex-annotation-site-color" data-edited={value!==previousValue||undefined}>
    <span className="codex-annotation-site-color-picker" inert={disabled?'':undefined}><CodexAnnotationColorControl ariaLabel={control.label} value={value} disabled={disabled} portalContainer={portalContainer} onDragActiveChange={onDragChange} onEditingActiveChange={onEditingChange} onValueChange={next=>{if(hex.test(next)){setDraft(null);onValueChange(next);}}}/></span>
    <input aria-label={control.label} aria-describedby={describedBy} dir="ltr" disabled={disabled} maxLength={512} value={shown} title={value} onBlur={()=>setDraft(null)} onChange={event=>{const next=event.target.value;if(!hex.test(next)){setDraft({value,text:next});return;}setDraft(null);onValueChange(next);}}/>
  </span>;
}

function SiteControlRow({editorState,control,disabled,portalContainer,onChange,onReset,onEditingChange,onDragChange,onScrubChange}){
  const referenceId=useId(),change=codexAnnotationSiteChange(editorState,control),edited=change.previousValue!=null&&change.value!==change.previousValue,describedBy=control.reference?referenceId:undefined;
  const common={control,describedBy,disabled,portalContainer,onEditingChange,onValueChange:value=>onChange(control.callback,value)};
  let field;
  if(control.type==='select')field=<SiteSelect {...common} value={change.value} previousValue={change.previousValue}/>;
  else if(control.type==='toggle')field=<CodexCuToggle ariaLabel={control.label} aria-describedby={describedBy} checked={change.value===true} disabled={disabled} onChange={common.onValueChange}/>;
  else if(control.type==='color')field=<SiteColor {...common} value={typeof change.value==='string'?change.value:codexAnnotationSiteDefaultValue(control)} previousValue={change.previousValue} onDragChange={onDragChange}/>;
  else field=<SiteRange {...common} value={typeof change.value==='number'?change.value:codexAnnotationSiteDefaultValue(control)} onScrubChange={onScrubChange}/>;
  return <div className="codex-annotation-site-row">
    <span className="codex-annotation-site-label"><CodexCuTooltip delayOpen openWhen="trigger-overflows" tooltipContent={control.label} portalContainer={portalContainer}><span className="codex-annotation-site-label-text">{control.label}</span></CodexCuTooltip>{control.reference&&<><span id={referenceId} className="tx-cu-annotation-sr-only" dir="ltr">{control.reference}</span><CodexCuTooltip delayOpen interactive selectable tooltipContent={<span className="codex-annotation-site-reference" dir="ltr">{control.reference}</span>} portalContainer={portalContainer}><CodexCuButton color="secondary" size="iconSm" radius="full" uniform aria-label={copy('reference',{property:control.label})}><CodexCuIcon name="shared:b$" size={16}/></CodexCuButton></CodexCuTooltip></>}</span>
    <CodexAnnotationValueCell dropdownPortalContainer={portalContainer} showReset={!disabled&&edited} resetLabel={'重置 '+control.label} onReset={()=>onReset(control.callback)}><span className={'codex-annotation-site-value'+(control.type==='toggle'?' is-toggle':'')}>{field}</span></CodexAnnotationValueCell>
  </div>;
}

export function CodexAnnotationSiteControls({editorState,disabled=false,portalContainer,onChange,onReset,onEditingChange,onDragChange,onScrubChange}){
  const headingId=useId(),definitions=editorState?.annotationControls;if(!definitions?.controls.length)return null;
  const replace=definitions.controlsMode==='replace';let url;
  try{url=new URL(editorState.anchor.frameUrl??'');}catch{}
  if(!url?.hostname)try{url=new URL(editorState.anchor.pageUrl);}catch{}
  const website=url?.hostname==='localhost'?url.host:url?.hostname||editorState.anchor.pageUrl;
  return <section className={'codex-annotation-site-controls'+(replace?' is-replace':'')} aria-labelledby={replace?undefined:headingId} aria-label={replace?codexAnnotationSiteHeading(editorState):undefined}>
    <style>{css}</style>
    <div className="codex-annotation-site-header">{!replace&&<h3 id={headingId}><bdi>{codexAnnotationSiteHeading(editorState)}</bdi></h3>}<div className="codex-annotation-site-attribution"><p>{copy('websiteDomainAttribution',{websiteDomain:website})}</p><CodexCuTooltip variant="rich" tooltipContent={<p className="codex-annotation-site-sharing-note">{copy('previewSharingWithWebsiteDomain',{websiteDomain:website})}</p>} portalContainer={portalContainer} side="top"><CodexCuButton color="ghostTertiary" size="inline" aria-label={copy('previewSharingLabel')}><CodexCuIcon name="shared:ozi" size={16}/></CodexCuButton></CodexCuTooltip></div></div>
    {definitions.controls.map(control=><SiteControlRow key={control.callback} {...{editorState,control,disabled,portalContainer,onChange,onReset,onEditingChange,onDragChange,onScrubChange}}/>)}
  </section>;
}
