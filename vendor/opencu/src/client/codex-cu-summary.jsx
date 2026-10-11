import React,{createContext,useContext,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState} from 'react';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {CodexCuButton,CodexCuTooltip,CodexCuMenuItem} from './codex-cu-primitives.jsx';
import {CODEX_CU_COPY} from './codex-cu-copy.mjs';
import summaryCss from './codex-cu-summary.css';

// Complete source declarations, maps and CSS rules are recorded in
// work/rea-reconstruction/native/summary-manifest.json. Runtime policy,
// persistence, native layout and popup placement belong to the caller.
const p=(...values)=>values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value=>'csu-'+value).join(' ');
const join=(...values)=>values.filter(Boolean).join(' ');
const styles=new WeakMap();
export function useCodexCuSummaryStyles(){
  useLayoutEffect(()=>{let owner=styles.get(document);if(!owner){const element=document.createElement('style');element.dataset.codexCuSummary='';element.textContent=summaryCss;document.head.append(element);owner={element,count:0};styles.set(document,owner);}owner.count++;return()=>{if(--owner.count===0){owner.element.remove();styles.delete(document);}};},[]);
}
const SummaryContext=createContext({fullWidth:false,isVisible:true,isAnimating:false,placement:'floating'});
const gatesAllow=gates=>gates==null||Object.values(gates).every(value=>value===true);
const message=(id,english,locale='en',values={},formatMessage)=>{
  if(formatMessage)return formatMessage({id,defaultMessage:english,values});
  const known=CODEX_CU_COPY[id],text=locale.startsWith('zh')?known?.simplifiedChinese??known?.english??english:known?.english??english;
  return text.replace(/\{(\w+), number\}/g,(_,key)=>new Intl.NumberFormat(locale).format(values[key]));
};

export function CodexCuSummaryContent({children,className,variant='summary',scrollable=true,
  fullWidth=false,isVisible=true,isAnimating=false,placement='floating',isHidden=false,
  renderSurface,onScroll,...props}){
  useCodexCuSummaryStyles();
  const scroll=useRef(null),lastScroll=useRef(0),visible=isVisible&&!isHidden;
  useLayoutEffect(()=>{if(!visible||!lastScroll.current||!scroll.current)return;const restore=()=>{if(scroll.current)scroll.current.scrollTop=lastScroll.current;};restore();const handle=requestAnimationFrame(restore);return()=>cancelAnimationFrame(handle);},[visible]);
  const classes=join('codex-cu-summary-content',p('group/summary-panel relative flex max-h-full min-h-0 flex-col overflow-hidden',!scrollable&&'isolate',fullWidth&&'bg-surface'),className);
  const body=scrollable?<div ref={scroll} className={p('flex h-fit max-h-full min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto')}
    onScroll={event=>{if(visible&&scroll.current)lastScroll.current=scroll.current.scrollTop;onScroll?.(event);}}><div className={p('flex flex-col',variant==='summary'&&'gap-2 py-2.5')}>{children}</div></div>:children;
  const surfaceProps={...props,className:classes,'data-codex-cu-summary':'','data-summary-panel-variant':variant,unstyled:fullWidth||placement==='docked',variant:'island',onScroll:scrollable?undefined:onScroll,children:body};
  return <SummaryContext.Provider value={{fullWidth,isVisible,isAnimating,placement}}>{renderSurface?renderSurface(surfaceProps):<CodexCuSummarySurface {...surfaceProps}/>}</SummaryContext.Provider>;
}

function SummaryAnimatedContent({children,className,sectionContentClassName,animateContentResize=false,
  collapsible=true,present=true,renderMotion}){
  const content=useRef(null),[height,setHeight]=useState(null);
  useLayoutEffect(()=>{if(!animateContentResize||!content.current)return;const node=content.current,update=()=>setHeight(node.getBoundingClientRect().height);update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();},[animateContentResize]);
  const body=<div ref={content} className={sectionContentClassName}>{children}</div>;
  const closed={height:0,opacity:0,marginTop:0},open={...(collapsible?{height:'auto',opacity:1,marginTop:2}:{}),height:animateContentResize?height??'auto':'auto'};
  const props={className,'aria-hidden':!present,inert:!present?'':undefined,initial:collapsible?closed:false,
    animate:open,exit:collapsible?closed:undefined,transition:{duration:.3,ease:[.19,1,.22,1]},children:body};
  return renderMotion?renderMotion(props):<div className={className} aria-hidden={!present} inert={!present?'':undefined} style={present?open:closed}>{body}</div>;
}

export function CodexCuSummaryHeader({inset=true,surface='elevated',mode='accordion',sectionOptions,
  after,children,isExpanded=true,onToggle,onChange,shouldUseReducedMotion=false,titleSuffix,
  collapsedSummary,renderDropdown}){
  useCodexCuSummaryStyles();
  const hasOptions=sectionOptions!=null&&sectionOptions.length>1;
  const trigger=<button type="button" aria-expanded={isExpanded}
    className={p('group/section-toggle -ms-[3.5px] inline-flex min-w-0 flex-1 cursor-interaction items-center gap-1.5 rounded-xl py-0.5 ps-[3.5px] pe-1 text-start focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring')}
    onClick={mode==='accordion'?onToggle:undefined}>
    <span className={p('truncate')}>{children}</span>{!isExpanded&&titleSuffix}
    {(mode==='accordion'||hasOptions)&&<CodexCuIcon name="shared:_T" aria-hidden="true"
      className={p('icon-2xs shrink-0 group-hover/section-toggle:opacity-100 group-focus-visible/section-toggle:opacity-100',!shouldUseReducedMotion&&'transition-transform',isExpanded?'opacity-0':'opacity-100',isExpanded?'rotate-0':'-rotate-90')}/>}
    {!isExpanded&&collapsedSummary!=null&&<span className={p('ms-auto flex min-w-0 items-center')}>{collapsedSummary}</span>}
  </button>;
  const heading=mode==='heading'?<h3 className={p('min-w-0 truncate select-none')}>{children}</h3>:
    mode==='dropdown'&&hasOptions&&renderDropdown?renderDropdown({triggerButton:trigger,children:sectionOptions.map(option=><CodexCuMenuItem key={option} onSelect={()=>onChange?.(option)}>{option}</CodexCuMenuItem>)}):trigger;
  return <header className={p('sticky top-2 z-10 flex h-7 w-full min-w-0 items-center justify-start gap-2 pb-0.5 text-sm font-normal text-secondary before:pointer-events-none before:absolute before:inset-x-0 before:-top-2 before:h-2 before:content-[\'\'] group-data-[summary-panel-variant=dynamic-isle]/summary-panel:h-6 group-data-[summary-panel-variant=dynamic-isle]/summary-panel:pb-0 group-data-[summary-panel-variant=dynamic-isle]/summary-panel:text-dynamic-isle-row',
    surface==='panel'?'bg-[var(--app-shell-panel-background,var(--color-surface))] before:bg-[var(--app-shell-panel-background,var(--color-surface))]':'bg-surface-elevated-secondary before:bg-surface-elevated-secondary',
    inset&&'ps-5 pe-3.5 group-data-[summary-panel-variant=dynamic-isle]/summary-panel:ps-4')}>
    {heading}{after!=null&&<div className={p('relative flex',mode==='heading'?'min-w-0 flex-1':'shrink-0')}>{after}</div>}
  </header>;
}

export const CodexCuSummarySection=React.forwardRef(function CodexCuSummarySection({
  sectionKey,title,children,after,mode='accordion',inset=true,divider=true,surface='elevated',
  defaultCollapsed=false,expanded,onExpandedChange,persistedExpanded,persistExpansion=true,
  autoCollapse,autoCollapsePhase='pending',onAutoCollapseCancel,animateContentResize=false,
  titleSuffix,collapsedSummary,sectionOptions,onChange,shouldUseReducedMotion=false,
  renderDropdown,renderMotion,gates,visible=true,className,...props},ref){
  useCodexCuSummaryStyles();
  const [localExpanded,setLocalExpanded]=useState(!defaultCollapsed);
  const isExpanded=(autoCollapse!==true||autoCollapsePhase!=='collapsed')&&(expanded??(persistExpansion?persistedExpanded:undefined)??localExpanded);
  const setExpanded=value=>{if(expanded===undefined)setLocalExpanded(value);onExpandedChange?.(value,sectionKey);};
  useImperativeHandle(ref,()=>({collapse:()=>setExpanded(false),expand:()=>setExpanded(true)}),[isExpanded,sectionKey,onExpandedChange]);
  if(!visible||!gatesAllow(gates))return null;
  const showContent=mode==='headerless'||mode==='heading'||isExpanded||mode==='dropdown';
  const contentClasses=p('flex flex-col gap-0.5 group-data-[summary-panel-variant=dynamic-isle]/summary-panel:gap-0',inset?'px-5 group-data-[summary-panel-variant=dynamic-isle]/summary-panel:px-4':'px-2');
  const contentOuter=p('relative z-0',(mode!=='headerless'||animateContentResize)&&'overflow-hidden',!inset&&'-mx-2');
  const body=showContent?(shouldUseReducedMotion?<div className={join(contentOuter,p('mt-0.5'))}><div className={contentClasses}>{children}</div></div>:
    <SummaryAnimatedContent className={contentOuter} animateContentResize={animateContentResize} sectionContentClassName={contentClasses} renderMotion={renderMotion}>{children}</SummaryAnimatedContent>):null;
  if(mode==='row')return <section {...props} data-codex-cu-summary="" data-section-key={sectionKey} className={join(p('flex min-w-0 flex-col group-data-[summary-panel-variant=dynamic-isle]/summary-panel:py-4'),className)}>
    <div className={p('px-5')}><CodexCuSummaryItem interactive={children!=null}>{children==null?title:<CodexCuSummaryItemTrigger aria-expanded={isExpanded} className={p('select-none')} onClick={()=>setExpanded(!isExpanded)}>{title}</CodexCuSummaryItemTrigger>}{typeof after==='function'?after({isExpanded}):after}</CodexCuSummaryItem></div>{children!=null&&body}</section>;
  if(mode==='card'||mode==='plain')return <section {...props} data-codex-cu-summary="" data-section-key={sectionKey} className={join(p('flex min-w-0 flex-col group-data-[summary-panel-variant=dynamic-isle]/summary-panel:py-4',mode==='card'?'gap-1':'gap-2'),className)}>
    {(title!=null||after!=null)&&<header className={p('flex min-w-0 items-center justify-between gap-2 text-sm text-secondary select-none group-data-[summary-panel-variant=dynamic-isle]/summary-panel:text-dynamic-isle-row',mode==='card'&&'px-1')}>
      {title!=null&&<h3 className={p('truncate')}>{title}</h3>}{typeof after==='function'?after({isExpanded:true}):after}</header>}
    <div data-variant={mode==='card'?'card':undefined} className={p(mode==='card'?'group/summary-card overflow-hidden rounded-2xl border border-default':'flex min-w-0 flex-col')}>
      {animateContentResize&&!shouldUseReducedMotion?<SummaryAnimatedContent className={p('overflow-hidden')} animateContentResize collapsible={false} sectionContentClassName="" renderMotion={renderMotion}>{children}</SummaryAnimatedContent>:children}
    </div></section>;
  return <section {...props} role="presentation" data-codex-cu-summary="" data-section-key={sectionKey} className={join('codex-cu-summary-section',p('relative z-0 flex flex-col pb-2 group-data-[summary-panel-variant=dynamic-isle]/summary-panel:py-2 group-data-[summary-panel-variant=dynamic-isle]/summary-panel:first:pt-4 group-data-[summary-panel-variant=dynamic-isle]/summary-panel:last:pb-4',
    divider&&'after:absolute after:bottom-0 after:h-[0.5px] after:bg-border after:content-[\'\'] last:after:hidden',inset?'after:inset-x-5 group-data-[summary-panel-variant=dynamic-isle]/summary-panel:after:inset-x-4':'after:inset-x-0',mode==='accordion'&&!isExpanded?'last:pb-0.5':'last:pb-0'),className)}
    onClick={autoCollapse!=null&&autoCollapsePhase!=='canceled'?onAutoCollapseCancel:undefined}>
    {mode!=='headerless'&&<CodexCuSummaryHeader inset={inset} surface={surface} mode={mode} after={typeof after==='function'?after({isExpanded}):after} sectionOptions={sectionOptions} isExpanded={isExpanded} onToggle={()=>mode!=='dropdown'&&setExpanded(!isExpanded)} onChange={onChange} shouldUseReducedMotion={shouldUseReducedMotion} titleSuffix={titleSuffix} collapsedSummary={collapsedSummary} renderDropdown={renderDropdown}>{title}</CodexCuSummaryHeader>}
    {body}</section>;
});

export const CodexCuSummaryItem=React.forwardRef(function CodexCuSummaryItem({children,className,disabled=false,interactive=false,tone='default',...props},ref){
  useCodexCuSummaryStyles();return <div {...props} ref={ref} aria-disabled={disabled||undefined} data-slot="thread-summary-panel-item" className={join(p(itemBase,itemTone[tone],!disabled&&interactive&&itemInteractive,disabled&&'cursor-not-allowed text-tertiary'),className)}>{children}{interactive&&<CodexCuIcon name="shared:K9" className={p('hidden text-tertiary group-data-[variant=card]/summary-card:block')}/>}</div>;
});
export const CodexCuSummaryItemButton=React.forwardRef(function CodexCuSummaryItemButton({children,className,disabled=false,interaction='background',showChevron=true,tone='default',type='button',unread=false,unreadDescription='Unread updates',...props},ref){
  useCodexCuSummaryStyles();const unreadId=React.useId();return <button {...props} ref={ref} type={type} disabled={disabled} aria-describedby={unread?[props['aria-describedby'],unreadId].filter(Boolean).join(' '):props['aria-describedby']} data-slot="thread-summary-panel-item-button" className={join(p(itemBase,!disabled&&itemInteraction[interaction],itemFocus,'disabled:cursor-not-allowed disabled:text-tertiary',itemTone[tone]),className)}>{children}{unread&&<><span aria-hidden="true" className={p('h-1.5 w-1.5 shrink-0 rounded-full bg-blue')}/><span id={unreadId} className={p('sr-only')}>{unreadDescription}</span></>}{showChevron&&<CodexCuIcon name="shared:K9" className={p('hidden text-tertiary group-data-[variant=card]/summary-card:block')}/>}</button>;
});
export function CodexCuSummaryItemTrigger({children,className,type='button',...props}){return <button {...props} type={type} data-slot="thread-summary-panel-item-trigger" className={join(p('flex min-w-0 flex-1 self-stretch cursor-interaction items-center gap-token-button-composer-gap border-0 bg-transparent p-0 text-start text-inherit disabled:cursor-not-allowed after:absolute after:inset-y-0 after:-inset-x-2 after:-z-10 after:content-[\'\'] group-data-[variant=card]/summary-card:after:inset-x-0',itemFocus),className)}>{children}</button>;}
export function CodexCuSummaryItemGroup({children,className,...props}){return <div {...props} data-slot="thread-summary-panel-item-group" className={join(p('relative z-10 flex min-w-0 flex-col gap-0.5 group-data-[summary-panel-variant=dynamic-isle]/summary-panel:gap-0 group-data-[variant=card]/summary-card:mx-0 group-data-[variant=card]/summary-card:gap-0 group-data-[variant=card]/summary-card:px-0'),className)}>{children}</div>;}
export function CodexCuSummaryLeading({children,className,variant='glyph',...props}){return <span {...props} data-slot="thread-summary-panel-item-leading" className={join(p('me-2 flex shrink-0 items-center justify-center group-data-[variant=card]/summary-card:me-0 group-data-[variant=card]/summary-card:w-4',leadingOuter[variant]),className)}>{leadingInner[variant]==null?children:<span className={p('flex shrink-0 items-center justify-center',leadingInner[variant])}>{children}</span>}</span>;}
export function CodexCuSummaryLabel({children,className,description,truncate=true,renderTruncatedLabel,uiScale,shouldUseReducedMotion,...props}){
  const text=truncate?(renderTruncatedLabel?renderTruncatedLabel({children,animateOnGroupHover:true}):<CodexCuSummaryMarquee animateOnGroupHover uiScale={uiScale} shouldUseReducedMotion={shouldUseReducedMotion}>{children}</CodexCuSummaryMarquee>):children;
  const label=<span {...props} data-slot="thread-summary-panel-item-label" className={join(p('min-w-0 flex-1 text-sm group-data-[summary-panel-variant=dynamic-isle]/summary-panel:text-dynamic-isle-row'),className)}>{text}</span>;
  return description==null?label:<span className={p('flex min-w-0 flex-1 flex-col gap-0.5 group-data-[summary-panel-variant=dynamic-isle]/summary-panel:gap-0')}>{label}<CodexCuSummaryMeta><span className={p('text-fade-truncate')}>{description}</span></CodexCuSummaryMeta></span>;
}
export function CodexCuSummaryMeta({children,className,tone='muted',truncate=false,variant='text',visibility='always',...props}){return <span {...props} data-slot="thread-summary-panel-item-meta" className={join(p('flex items-center group-data-[summary-panel-variant=dynamic-isle]/summary-panel:text-dynamic-isle-row',truncate?'max-w-1/2 min-w-0 shrink':'shrink-0',metaTone[tone],metaVariant[variant],visibility==='interaction'&&'opacity-0 group-focus-visible/summary-panel-item:opacity-100 group-focus-within/summary-panel-item:opacity-100 group-hover/summary-panel-item:opacity-100 group-aria-expanded/summary-panel-item:opacity-100',visibility==='rest'&&'group-focus-within/summary-panel-item:opacity-0 group-hover/summary-panel-item:opacity-0 group-has-[[aria-expanded=true]]/summary-panel-item:opacity-0'),className)}>{truncate?<span className={p('text-fade-truncate')}>{children}</span>:children}</span>;}
export function CodexCuSummaryActions({children,className,align='content',placement='inline',visibility='always',onClick,onKeyDown,onPointerDown,...props}){return <span {...props} role="presentation" data-slot="thread-summary-panel-item-actions" className={join(p('flex h-5 shrink-0 items-center',align==='section-actions'&&'-me-1.5',align==='preview'&&'me-2 w-15 justify-center',placement==='overlay'&&'absolute inset-y-0 end-0 my-auto',visibility==='interaction'&&['pointer-events-none opacity-0 group-focus-within/summary-panel-item:pointer-events-auto group-focus-within/summary-panel-item:opacity-100 group-hover/summary-panel-item:pointer-events-auto group-hover/summary-panel-item:opacity-100 has-[[aria-expanded=true]]:pointer-events-auto has-[[aria-expanded=true]]:opacity-100',placement==='inline'&&'pointer-coarse:pointer-events-auto pointer-coarse:opacity-100']),className)} onClick={event=>{event.stopPropagation();onClick?.(event);}} onKeyDown={event=>{event.stopPropagation();onKeyDown?.(event);}} onPointerDown={event=>{event.stopPropagation();onPointerDown?.(event);}}>{children}</span>;}
export function CodexCuSummarySectionActions({children,className,...props}){return <span {...props} data-slot="thread-summary-panel-section-actions" className={join(p('ms-auto flex items-center gap-0.5'),className)}>{children}</span>;}
export function CodexCuSummaryIconButton({children,className,color='ghost',disableTooltip=false,label,shortcut,tooltipContent=label,tooltipOpen=false,...props}){return <CodexCuTooltip disabled={disableTooltip} open={tooltipOpen} tooltipContent={tooltipContent} shortcut={shortcut}><CodexCuButton {...props} aria-label={label} color={color} data-slot="thread-summary-panel-icon-button" focusRing="inset" size="icon" uniform className={join(p('size-6',itemFocus),className)}><span className={p(itemIcon)}>{children}</span></CodexCuButton></CodexCuTooltip>;}

export function CodexCuSummaryList({children,items=[],getKey=(item,index)=>item.id??index,
  visibleItemLimit=6,visibleItemIncrement=50,visibleCount,onVisibleCountChange,isLoadingMore=false,
  onLoadMore,onVisibleItemsChange,renderFooter,renderPagination,presentation='summary',empty,
  listAriaLabel,listClassName,paginationButtonClassName,locale='en',formatMessage,
  renderPlainPagination,plainFooterVariant,plainFooterGhostGate,cardFooterIcon=<CodexCuIcon name="shared:jm"/>,preserveExpandedOrder=false,getNewItemPosition}){
  useCodexCuSummaryStyles();const [localCount,setLocalCount]=useState(visibleItemLimit),[expandedOrder,setExpandedOrder]=useState(null);
  let ordered=items,count=visibleCount??localCount;
  if(preserveExpandedOrder&&expandedOrder!=null){
    const records=items.map((item,index)=>({item,key:getKey(item,index)}));
    records.sort((a,b)=>(expandedOrder.get(a.key)??(getNewItemPosition?.(a.item)==='end'?Infinity:-1))-(expandedOrder.get(b.key)??(getNewItemPosition?.(b.item)==='end'?Infinity:-1)));
    ordered=records.map(record=>record.item);
    if(records.length!==expandedOrder.size||records.some(record=>!expandedOrder.has(record.key))){
      setExpandedOrder(new Map(records.map((record,index)=>[record.key,index])));
      const retained=records.findLastIndex(record=>(expandedOrder.get(record.key)??Infinity)<count)+1;
      count=Math.max(count,retained);if(visibleCount===undefined&&count!==localCount)setLocalCount(count);
    }
  }
  const shown=ordered.slice(0,count),remaining=items.length-shown.length;
  useEffect(()=>{onVisibleItemsChange?.(shown);},[items,count,expandedOrder,onVisibleItemsChange]);
  if(!items.length&&onLoadMore==null)return empty??null;
  const hasPagination=items.length>visibleItemLimit||onLoadMore!=null,expanded=remaining===0&&onLoadMore==null;
  const nextRevealCount=onLoadMore==null?Math.min(remaining,visibleItemIncrement):visibleItemIncrement;
  const toggle=()=>{if(isLoadingMore)return;if(preserveExpandedOrder)setExpandedOrder(expanded?null:new Map(ordered.map((item,index)=>[getKey(item,index),index])));const next=expanded?visibleItemLimit:onLoadMore==null?Math.min(items.length,count+visibleItemIncrement):count+visibleItemIncrement;if(visibleCount===undefined)setLocalCount(next);onVisibleCountChange?.(next);if(remaining<visibleItemIncrement)onLoadMore?.();};
  const paginationProps={nextRevealCount,isExpanded:expanded,isLoadingMore,onToggle:toggle};
  let pagination=null;
  if(hasPagination){if(renderPagination)pagination=renderPagination(paginationProps);
    else if(presentation==='plain'){const label=message(expanded?'sidebarElectron.showLess':'sidebarElectron.showMore',expanded?'Show less':'Show more',locale,{},formatMessage);pagination=renderPlainPagination?renderPlainPagination({...paginationProps,children:label}):<CodexCuSummaryPlainFooter><CodexCuSummaryPlainFooterButton alignment="content" disabled={isLoadingMore} onClick={toggle} variant={plainFooterVariant} ghostGate={plainFooterGhostGate}>{label}</CodexCuSummaryPlainFooterButton></CodexCuSummaryPlainFooter>;}
    else if(presentation==='card')pagination=<CodexCuSummaryItemButton disabled={isLoadingMore} onClick={toggle}><CodexCuSummaryLeading variant="custom">{cardFooterIcon}</CodexCuSummaryLeading><CodexCuSummaryLabel>{message(expanded?'codex.summaryPanel.card.showLess':'codex.summaryPanel.card.showMore',expanded?'Show less':'Show more',locale,{},formatMessage)}</CodexCuSummaryLabel></CodexCuSummaryItemButton>;
    else if(presentation==='summary')pagination=<CodexCuButton color="ghostMuted" size="default" disabled={isLoadingMore} onClick={toggle} className={join(p('!px-0 !py-0 text-tertiary hover:text-secondary'),paginationButtonClassName)}>{message(expanded?'codex.localConversation.summaryPanelExpandableList.showLess':'codex.localConversation.summaryPanelExpandableList.showMore',expanded?'Show less':'Show {count, number} more',locale,{count:nextRevealCount},formatMessage)}</CodexCuButton>;
  }
  return <><CodexCuSummaryItemGroup role={listAriaLabel?'list':undefined} aria-label={listAriaLabel} className={listClassName}>{shown.map((item,index)=>listAriaLabel?<div role="listitem" key={getKey(item,index)}>{children(item,index)}</div>:<React.Fragment key={getKey(item,index)}>{children(item,index)}</React.Fragment>)}</CodexCuSummaryItemGroup>{renderFooter?.(shown)}{pagination}</>;
}

export function CodexCuNativePipSection({gates,shown,onShow,onHideTask,onHideAll,
  preview,hideMenu,renderHideMenu,locale='en',formatMessage,...sectionProps}){
  if(gates?.['188145323']!==true||gates?.['228020933']!==true||gates?.taskActive!==true||gates?.currentBrowserUseTab!==false)return null;
  const hideTrigger=<button type="button" aria-label={message('codex.localConversation.remoteHostedPip.hidePictureInPicture','Hide Picture in Picture',locale,{},formatMessage)} className={p('cursor-interaction rounded-md border-0 bg-transparent p-0 text-tertiary select-none hover:text-default focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring')} onClick={hideMenu?.onOpen}>{message('codex.localConversation.remoteHostedPip.hide','Hide',locale,{},formatMessage)}</button>;
  const actions=[{label:message('codex.localConversation.remoteHostedPip.hideForTask','Hide for this task',locale,{},formatMessage),onSelect:onHideTask},{label:message('codex.localConversation.remoteHostedPip.hideForAllActiveTasks','Hide for all active tasks',locale,{},formatMessage),onSelect:onHideAll},...(hideMenu?.placementActions??[])];
  const control=shown?(renderHideMenu?renderHideMenu({align:'end',contentWidth:'icon',triggerButton:hideTrigger,actions}):hideTrigger):<button type="button" aria-label={message('codex.localConversation.remoteHostedPip.showPictureInPicture','Show Picture in Picture',locale,{},formatMessage)} className={p('cursor-interaction rounded-md border-0 bg-transparent p-0 text-tertiary select-none hover:text-default focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring')} onClick={onShow}>{message('codex.localConversation.remoteHostedPip.show','Show',locale,{},formatMessage)}</button>;
  return <CodexCuSummarySection {...sectionProps} sectionKey="computer-use-pip" title={message('codex.localConversation.remoteHostedPip.computerUse','Computer Use',locale,{},formatMessage)}><CodexCuSummaryItem><CodexCuSummaryLeading><CodexCuIcon name="nativeThread:Dw"/></CodexCuSummaryLeading><CodexCuSummaryLabel>{message('codex.localConversation.remoteHostedPip.pictureInPicture','Picture in Picture',locale,{},formatMessage)}</CodexCuSummaryLabel><CodexCuSummaryMeta variant="text">{control}</CodexCuSummaryMeta></CodexCuSummaryItem>{shown&&preview}</CodexCuSummarySection>;
}

export const CodexCuSummaryItemLink=React.forwardRef(function CodexCuSummaryItemLink({className,tone='default',renderLink,children,...props},ref){
  useCodexCuSummaryStyles();const linkProps={...props,ref,className:join(p(itemBase,itemInteractive,itemFocus,itemTone[tone],'no-underline'),className),'data-slot':'thread-summary-panel-item-link',children};return renderLink?renderLink(linkProps):<a {...linkProps}/>;
});
export const CodexCuSummaryAvatarButton=React.forwardRef(function CodexCuSummaryAvatarButton({children,className,type='button',...props},ref){return <button {...props} ref={ref} type={type} data-slot="thread-summary-panel-item-avatar-button" className={join(p('flex size-4 cursor-interaction items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring [&>img]:size-4 [&>svg]:size-4'),className)}>{children}</button>;});
export function CodexCuSummaryAvatarGroup({children,className,...props}){return <span {...props} data-slot="thread-summary-panel-item-avatar-group" className={join(p('flex shrink-0 items-center gap-token-button-composer-gap [&_img]:size-4 [&_svg]:size-4'),className)}>{children}</span>;}
export function CodexCuSummaryChevron(){return <CodexCuSummaryMeta variant="icon"><CodexCuIcon name="shared:_T"/></CodexCuSummaryMeta>;}
export function CodexCuSummaryActionButton({className,...props}){return <CodexCuSummaryIconButton {...props} className={join(p('-me-1.5'),className)}/>;}
export function CodexCuSummaryActionLink({children,className,label,tooltipOpen=false,renderLink,...props}){
  const linkProps={...props,'aria-label':label,'data-slot':'thread-summary-panel-item-action-link',className:join(p('-me-2 size-token-button-composer flex cursor-interaction items-center justify-center rounded-sm text-tertiary hover:text-default',itemFocus),className),children:<span className={p(itemIcon)}>{children}</span>};
  return <CodexCuTooltip open={tooltipOpen} tooltipContent={label}>{renderLink?renderLink(linkProps):<a {...linkProps}/>}</CodexCuTooltip>;
}

export function CodexCuSummarySurface({asChild=false,children,className,radius,unstyled=false,variant='default',...props}){
  useCodexCuSummaryStyles();
  const classes=join(p(!unstyled&&(variant==='island'?[radius!=='composer'&&'rounded-2xl','bg-surface-elevated-secondary electron:elevation-prominent extension:border extension:border-default extension:shadow-md']:
    ['_floatingSurface_1bdwx_1',(variant==='single-line'||variant==='notice')&&'_singleLineSurface_1bdwx_10',variant==='canvas'&&'_canvasSurface_1bdwx_16',variant==='canvas'?'bg-surface-canvas':'bg-surface-elevated-secondary','ring-[0.5px] ring-border',variant==='notice'?'shadow-[0_0_2px_0_rgb(0_0_0/5%),0_4px_6px_0_rgb(0_0_0/2%)]':'shadow-2xl']),!unstyled&&radius==='composer'&&'_composerRadius_1bdwx_20'),className);
  return asChild?React.cloneElement(children,{className:join(classes,children.props.className)}):<div {...props} className={classes}>{children}</div>;
}

function marqueeStyle(distance,speed,mode){
  const travel=distance/speed,duration=.35+travel+(mode==='loop'?1.85:0);
  const point=(value,time)=>`${value.toFixed(4)} ${(time/duration*100).toFixed(4)}%`;
  const samples=Array.from({length:33},(_,index)=>{const fraction=index/32,inverse=1-fraction,a=3*inverse**2*fraction,b=3*inverse*fraction**2,c=fraction**3;return point(a*.6+b+c,.35+travel*(a*.49+b*.7+c));});
  return {'--marquee-duration':duration.toFixed(3)+'s','--marquee-scroll-distance':distance+'px','--marquee-scroll-timing':`linear(${[point(0,0),...samples,...mode==='loop'?[point(1,duration)]:[]].join(', ')})`};
}

export function CodexCuSummaryMarquee({id,className,animate=false,animateOnGroupHover=false,
  scrollMode='stop-at-end',children,style,uiScale=1,shouldUseReducedMotion,...props}){
  useCodexCuSummaryStyles();
  const root=useRef(null),[metrics,setMetrics]=useState(null);
  useLayoutEffect(()=>{
    const node=root.current;if(!node)return;let handle;
    const measure=()=>{
      handle=undefined;if(node.checkVisibility?.({contentVisibilityAuto:true})===false)return;
      const content=node.querySelector('[data-marquee-content]');if(!content)return;
      const rect=content.getBoundingClientRect(),scaledContent=rect.width/uiScale,width=scaledContent>0?scaledContent:content.scrollWidth;
      const scaledViewport=node.getBoundingClientRect().width/uiScale,viewport=scaledViewport>0?scaledViewport:node.clientWidth;
      if(viewport<=0||width-viewport<1){setMetrics(null);return;}
      const computed=getComputedStyle(content),parsedFont=Number.parseFloat(computed.fontSize),fontSize=Number.isFinite(parsedFont)?parsedFont:13;
      const parsedSpeed=Number.parseFloat(computed.getPropertyValue('--marquee-speed-em-per-second')),speedEm=Number.isFinite(parsedSpeed)&&parsedSpeed>0?parsedSpeed:2;
      let distance=width-viewport;
      if(scrollMode==='loop'){distance=width+fontSize*1.15;const copy=node.querySelector('[data-marquee-copy]');if(copy){const offset=Math.abs(copy.getBoundingClientRect().left-rect.left)/uiScale;if(offset>0)distance=offset;}}
      const speed=fontSize*speedEm;setMetrics(previous=>previous?.contentWidth===width&&previous.scrollDistance===distance&&previous.speedPxPerSecond===speed?previous:{contentWidth:width,scrollDistance:distance,speedPxPerSecond:speed});
    };
    const schedule=()=>{if(handle===undefined)handle=requestAnimationFrame(measure);};
    measure();const observer=new ResizeObserver(schedule);observer.observe(node);
    for(const element of node.querySelectorAll('[data-marquee-content],[data-marquee-track],[data-marquee-copy]'))observer.observe(element);
    return()=>{observer.disconnect();if(handle!==undefined)cancelAnimationFrame(handle);};
  },[children,uiScale,scrollMode,shouldUseReducedMotion,metrics!=null]);
  const overflowing=metrics!=null;
  // Reduced-motion preference is a caller input; unknown does not select an
  // animated branch. The recovered application evaluates on/off/system itself.
  const animated=overflowing&&shouldUseReducedMotion===false;
  const clipStyle=animated?marqueeStyle(metrics.scrollDistance,metrics.speedPxPerSecond,scrollMode):undefined;
  return <span {...props} id={id} ref={root} className={join(p('_viewport_a3okg_1',animate&&'_animate_a3okg_66',animateOnGroupHover&&'_animateOnGroupHover_a3okg_67',scrollMode==='stop-at-end'&&'_stopAtEnd_a3okg_73'),className)} style={style} data-marquee-text={true} data-marquee-overflowing={overflowing||undefined} data-marquee-animatable={animated||undefined} draggable={false}>
    <span className={p('_clipViewport_a3okg_20',overflowing&&'_overflowingViewport_a3okg_40')} style={clipStyle}>
      <span className={p('_track_a3okg_28',animated&&'_scrolling_a3okg_66')} data-marquee-track="">
        <span className={p('_content_a3okg_35')} data-marquee-content={true}>{children}</span>
        {scrollMode==='loop'&&animated&&<span className={p('_content_a3okg_35')} aria-hidden="true" data-marquee-copy={true} inert="">{children}</span>}
      </span>
    </span>
  </span>;
}

export function CodexCuSummaryPlainFooter({children,className,alignment='edge',variant='default',hasLoadingRows,...props}){
  return <div {...props} data-codex-cu-summary="" className={join(p('flex gap-1 py-1',alignment==='nested'&&(variant==='tableRow'?'ps-[40px]':'px-8')),className)}>{children}</div>;
}
export function CodexCuSummaryPlainFooterButton({children,className,alignment='edge',variant,ghostGate,disabled=false,onClick,...props}){
  useCodexCuSummaryStyles();
  const chosen=variant??(typeof ghostGate==='boolean'?(ghostGate?'ghost':'transparent'):null);
  if(chosen!=='ghost'&&chosen!=='transparent')return null;
  return <button type="button" className={join(p('_Button_eg66f_2 [--button-font-weight:var(--font-weight-normal)] [--color-text-secondary-ghost:var(--color-text-tertiary)]'),className)} data-color="secondary" data-variant={chosen} data-squircle="" data-size="xs" data-optically-align={alignment==='edge'?undefined:'start'} disabled={disabled} aria-disabled={disabled} tabIndex={disabled?-1:undefined} data-disabled={disabled?'':undefined} onClick={event=>{if(!disabled)onClick?.(event);}} {...props}>
    <span className={p('_ButtonInner_eg66f_2')}><span className={p('text-base')}>{children}</span></span>
  </button>;
}

export const renderCodexCuSummarySection=props=><CodexCuSummarySection {...props}/>;
export const CodexCuSummary={Content:CodexCuSummaryContent,Section:CodexCuSummarySection,Header:CodexCuSummaryHeader,Surface:CodexCuSummarySurface,Marquee:CodexCuSummaryMarquee,
  Item:CodexCuSummaryItem,ItemButton:CodexCuSummaryItemButton,ItemTrigger:CodexCuSummaryItemTrigger,ItemLink:CodexCuSummaryItemLink,
  ItemGroup:CodexCuSummaryItemGroup,ItemLeading:CodexCuSummaryLeading,ItemLabel:CodexCuSummaryLabel,
  ItemMeta:CodexCuSummaryMeta,ItemActions:CodexCuSummaryActions,SectionActions:CodexCuSummarySectionActions,
  IconButton:CodexCuSummaryIconButton,ItemChevron:CodexCuSummaryChevron,ItemAvatarButton:CodexCuSummaryAvatarButton,ItemAvatarGroup:CodexCuSummaryAvatarGroup,ItemActionButton:CodexCuSummaryActionButton,ItemActionLink:CodexCuSummaryActionLink,List:CodexCuSummaryList};

// Original oe initializer variant tables; no style values inferred.
const itemBase="group group/summary-panel-item relative isolate flex min-h-token-button-composer w-full min-w-0 items-center gap-token-button-composer-gap rounded-sm border-0 bg-transparent px-0 py-1 text-start group-data-[summary-panel-variant=dynamic-isle]/summary-panel:min-h-0 group-data-[summary-panel-variant=dynamic-isle]/summary-panel:text-dynamic-isle-row group-data-[variant=card]/summary-card:min-h-10 group-data-[variant=card]/summary-card:gap-3 group-data-[variant=card]/summary-card:rounded-none group-data-[variant=card]/summary-card:px-3 group-data-[variant=card]/summary-card:py-2 group-data-[variant=card]/summary-card:after:pointer-events-none group-data-[variant=card]/summary-card:after:absolute group-data-[variant=card]/summary-card:after:end-0 group-data-[variant=card]/summary-card:after:start-10 group-data-[variant=card]/summary-card:after:top-full group-data-[variant=card]/summary-card:after:h-px group-data-[variant=card]/summary-card:after:bg-border";
const itemInteractive="cursor-interaction before:absolute before:inset-y-0 before:-inset-x-2 before:-z-10 before:rounded-sm before:content-[''] hover:before:bg-primary-ghost-hover group-data-[variant=card]/summary-card:before:inset-x-0 group-data-[variant=card]/summary-card:before:rounded-none";
const itemInteraction={
  "background": "cursor-interaction before:absolute before:inset-y-0 before:-inset-x-2 before:-z-10 before:rounded-sm before:content-[''] hover:before:bg-primary-ghost-hover group-data-[variant=card]/summary-card:before:inset-x-0 group-data-[variant=card]/summary-card:before:rounded-none",
  "foreground": "cursor-interaction hover:text-default"
};
const itemFocus="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";
const itemIcon="icon-sm flex items-center justify-center browser:group-data-[summary-panel-variant=dynamic-isle]/summary-panel:size-4 [&_svg]:size-full";
const itemTone={
  "conversation-summary": "text-text/40",
  "critical": "text-chart-red",
  "default": "text-default",
  "muted": "text-secondary",
  "tertiary": "text-tertiary"
};
const leadingOuter={
  "intrinsic": null,
  "custom": "w-[18px] group-data-[summary-panel-variant=dynamic-isle]/summary-panel:w-4",
  "glyph": "w-[18px] browser:group-data-[summary-panel-variant=dynamic-isle]/summary-panel:w-4",
  "preview": "icon-sm overflow-hidden rounded-sm browser:group-data-[summary-panel-variant=dynamic-isle]/summary-panel:size-4 browser:group-data-[summary-panel-variant=dynamic-isle]/summary-panel:[&>svg]:size-full",
  "status": "w-[18px] group-data-[summary-panel-variant=dynamic-isle]/summary-panel:w-4",
  "thumbnail": null
};
const leadingInner={
  "intrinsic": null,
  "custom": null,
  "glyph": "icon-sm browser:group-data-[summary-panel-variant=dynamic-isle]/summary-panel:size-4 [&>*]:size-full [&_svg]:size-full",
  "preview": null,
  "status": "icon-xs [&>*]:size-full [&_svg]:size-full",
  "thumbnail": "relative size-12 overflow-hidden rounded-xl bg-surface-secondary text-default"
};
const metaTone={
  "critical": "text-chart-red",
  "default": "text-default",
  "muted": "text-tertiary"
};
const metaVariant={
  "action-preview": "min-w-token-button-composer justify-end overflow-hidden text-sm group-focus-within/summary-panel-item:w-token-button-composer group-hover/summary-panel-item:w-token-button-composer group-has-[[aria-expanded=true]]/summary-panel-item:w-token-button-composer",
  "icon": "icon-xs [&>*]:size-full [&_svg]:size-full",
  "text": "text-sm"
};
