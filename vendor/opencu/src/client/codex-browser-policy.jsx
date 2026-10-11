import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {CodexCuButton, CodexCuMenuItem, CodexCuMenuSurface, CodexCuTooltip, CodexCuSpinner} from './codex-cu-primitives.jsx';
import policyCss from './codex-browser-policy.css';
import { CodexCuScope } from './codex-cu-scope.jsx';

// Visual reconstruction only. Policy evaluation, parsing, persistence, account
// rollout, and pending/error state remain supplied by the caller.
// Exact bundle symbols and CSS references: work/rea-reconstruction/browser-policy/.
export const codexBrowserPolicyCss = policyCss;
const OPTION_VALUES = ['default', 'ask', 'allowed', 'denied'];
const COLUMN_LABELS = {origin:'Browsing',download:'Downloads',upload:'Uploads',fullCdp:'Debug / CDP',webMcp:'Site tools'};
const FORM_LABELS = {origin:'Browse',download:'Download',upload:'Upload',fullCdp:'Debug / CDP',webMcp:'Site tools'};
const MANAGED = 'Managed by your enterprise admin';
const UNAVAILABLE = "Site tools aren't available for this account";
const APPROVAL_UNAVAILABLE = 'Change the default from Always allow before requiring approval for individual sites';
const INHERITED = 'Uses the default permission';
const cx = (...values) => values.filter(Boolean).join(' ');

export function codexBrowserPermissionLabel(value, resource, defaultApprovalMode) {
  if(resource==='webMcp'&&value==='allowed')return 'Enabled';
  if(resource==='webMcp'&&value==='denied')return 'Disabled';
  if(value==='ask'||value==='default'&&defaultApprovalMode==='alwaysAsk')return 'Requires approval';
  if(resource!=='fullCdp'&&(value==='allowed'||value==='default'&&defaultApprovalMode==='neverAsk'))return 'Always allow';
  return {default:'Use default',allowed:'Allow',denied:'Block'}[value]??null;
}

export function CodexBrowserManagedControl({reason,children,tooltipProps}) {
  if(reason==null)return children;
  const explanation=reason==='managed'?MANAGED:UNAVAILABLE;
  return <CodexCuTooltip {...tooltipProps} tooltipContent={explanation}><span className="cbp-managed" aria-disabled="true" aria-label={explanation} role="button" tabIndex={0}>{children}</span></CodexCuTooltip>;
}

function PortalScope({anchor,children}) {
  return <CodexCuScope forceScope>{children}</CodexCuScope>;
}

// GT/p7 uses a portalled dropdown. This small adapter owns visual placement and
// dismissal only; the caller owns the open state and selected permission.
function PermissionMenu({triggerRef,open,onOpenChange,children,small,placement}) {
  const menuRef=useRef(null),[position,setPosition]=useState(null);
  useLayoutEffect(()=>{
    if(!open||!triggerRef.current)return;
    const place=()=>{const rect=triggerRef.current.getBoundingClientRect();setPosition({right:window.innerWidth-rect.right,top:rect.bottom+1});};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open,triggerRef]);
  useEffect(()=>{
    if(!open)return;
    const outside=event=>{if(!triggerRef.current?.contains(event.target)&&!menuRef.current?.contains(event.target))onOpenChange?.(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[open,onOpenChange,triggerRef]);
  if(!open||!position||typeof document==='undefined')return null;
  return createPortal(<PortalScope anchor={triggerRef.current}><div ref={menuRef} className="cbp-menu-position" style={placement?.style??position} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();onOpenChange?.(false);triggerRef.current?.focus();}}}><CodexCuMenuSurface align={placement?.align??'end'} side={placement?.side??'bottom'} contentWidth={small?'sm':undefined} style={{'--radix-dropdown-menu-content-available-width':`${window.innerWidth}px`,'--radix-dropdown-menu-content-available-height':`${window.innerHeight-position.top}px`,...placement?.surfaceStyle}} role="menu">{children}</CodexCuMenuSurface></div></PortalScope>,document.body);
}

function DropdownButton({children,form,disabled,loading,description,labelledBy,open,onOpenChange,buttonRef}) {
  return <CodexCuButton ref={buttonRef} color="outline" size="toolbar" radius={form?'small':undefined} disabled={disabled} loading={loading} aria-description={description} aria-labelledby={labelledBy} aria-haspopup="menu" aria-expanded={!!open} className={cx('cbp-dropdown',form&&'cbp-dropdown-form')} onClick={()=>onOpenChange?.(!open)}><span className="cbp-dropdown-content">{children}</span><CodexCuIcon name="shared:_T" className="cbp-chevron"/></CodexCuButton>;
}

// on: site dropdown and add-dialog dropdown share the same component.
export function CodexBrowserPermissionSelect({resource,value='default',displayValue=value,inherited,defaultApprovalMode,allowAllowed=true,allowRequiresApproval=true,supportsRequiresApproval=true,disabled=false,disabledReason,loading=false,description,labelId,contextId,valueId,variant='default',open=false,onOpenChange,onSelect,tooltipProps,managedTooltipProps,optionTooltipProps,menuPlacement}) {
  const triggerRef=useRef(null),usesDefault=disabledReason==null&&(inherited??value==='default');
  const detail=description??(usesDefault?INHERITED:undefined);
  const trigger=<DropdownButton buttonRef={triggerRef} form={variant==='form'} disabled={disabled} loading={loading} description={detail} labelledBy={[labelId,contextId,valueId].filter(Boolean).join(' ')} open={open} onOpenChange={onOpenChange}>{disabledReason!=null&&<CodexCuIcon name="shared:gnt" className="cbp-secondary"/>}<span id={valueId} className={cx('cbp-truncate',usesDefault&&'cbp-secondary')}>{codexBrowserPermissionLabel(displayValue,resource,inherited?defaultApprovalMode:undefined)}</span></DropdownButton>;
  return <CodexBrowserManagedControl reason={disabledReason} tooltipProps={managedTooltipProps}><>{detail?<CodexCuTooltip {...tooltipProps} tooltipContent={detail}>{trigger}</CodexCuTooltip>:trigger}<PermissionMenu triggerRef={triggerRef} open={open&&!disabled} onOpenChange={onOpenChange} placement={menuPlacement} small>{OPTION_VALUES.map(option=>{
    if(option==='ask'&&(!supportsRequiresApproval||resource==='webMcp'))return null;
    const managed=option==='allowed'&&!allowAllowed||option==='ask'&&!allowRequiresApproval;
    const approvalUnavailable=option==='ask'&&defaultApprovalMode==='neverAsk';
    const selected=option===(usesDefault?'default':value)&&(usesDefault||value!=='default');
    const item=<CodexCuMenuItem disabled={managed||approvalUnavailable} rightIcon={selected?<CodexCuIcon name="shared:vpt"/>:undefined} onSelect={()=>{onSelect?.(option);onOpenChange?.(false);}}><div className="cbp-menu-option"><span className="cbp-status-dot" data-value={option}/><span className="cbp-truncate">{codexBrowserPermissionLabel(option,resource)}</span></div></CodexCuMenuItem>;
    return managed||approvalUnavailable?<CodexCuTooltip key={option} {...optionTooltipProps?.[option]} side="right" tooltipContent={managed?MANAGED:APPROVAL_UNAVAILABLE}>{item}</CodexCuTooltip>:<React.Fragment key={option}>{item}</React.Fragment>;
  })}</PermissionMenu></></CodexBrowserManagedControl>;
}

function defaultLabel({allowed,approvalMode},resource) {
  if(resource==='webMcp')return allowed?'Enabled':'Disabled';
  if(!allowed)return 'Block';
  return {alwaysAsk:'Requires approval',neverAsk:'Always allow'}[approvalMode]??'Allow';
}

// Ct / wt. The supplied view model already reflects enterprise/account gates.
export function CodexBrowserDefaultPermissionSelect({resource,allowed,approvalMode,allowAlwaysAllow=true,showBlock=true,disabled,disabledReason,labelledBy,open=false,onOpenChange,onSelect,managedTooltipProps,optionTooltipProps,menuPlacement}) {
  const triggerRef=useRef(null),approvalResource=!['fullCdp','webMcp'].includes(resource);
  const options=[{allowed:true,...approvalResource?{approvalMode:'alwaysAsk'}:{}},...approvalResource?[{allowed:true,approvalMode:'neverAsk'}]:[],...showBlock?[{allowed:false}]:[]];
  return <CodexBrowserManagedControl reason={disabledReason} tooltipProps={managedTooltipProps}><DropdownButton buttonRef={triggerRef} disabled={disabled} labelledBy={labelledBy} open={open} onOpenChange={onOpenChange}>{disabledReason!=null&&<CodexCuIcon name="shared:gnt" className="cbp-secondary"/>}<span className="cbp-truncate">{defaultLabel({allowed,approvalMode},resource)}</span></DropdownButton><PermissionMenu triggerRef={triggerRef} open={open&&!disabled} onOpenChange={onOpenChange} placement={menuPlacement}>{options.map((option,index)=>{
    const selected=option.allowed===allowed&&(!option.allowed||!approvalResource||option.approvalMode===approvalMode);
    const unavailable=option.approvalMode==='neverAsk'&&!allowAlwaysAllow;
    const item=<CodexCuMenuItem disabled={unavailable} rightIcon={selected?<CodexCuIcon name="shared:N9"/>:undefined} onSelect={()=>{onSelect?.(option);onOpenChange?.(false);}}>{defaultLabel(option,resource)}</CodexCuMenuItem>;
    return unavailable?<CodexCuTooltip key={index} {...optionTooltipProps?.[index]} side="right" tooltipContent={MANAGED}>{item}</CodexCuTooltip>:<React.Fragment key={index}>{item}</React.Fragment>;
  })}</PermissionMenu></CodexBrowserManagedControl>;
}

// ht. Width measurement and horizontal pagination reproduce presentation only.
export function CodexBrowserPolicyMatrix({resources,defaults,rows,browserClientAllowed=true,disabled=false,reducedMotion=false,openMenu,onMenuOpenChange,onDefaultSelect,onSiteSelect,onRemoveRequest}) {
  const tableRef=useRef(null),headerRef=useRef(null),[width,setWidth]=useState(null),[scrollPage,setScrollPage]=useState(0);
  useLayoutEffect(()=>{
    const table=tableRef.current,header=headerRef.current;
    if(!table||!header||typeof ResizeObserver==='undefined')return;
    const tableObserver=new ResizeObserver(([entry])=>{setWidth(entry.contentRect.width);table.style.setProperty('--table-height',`${entry.contentRect.height}px`);});
    const headerObserver=new ResizeObserver(([entry])=>header.style.setProperty('--header-height',`${entry.contentRect.height}px`));
    tableObserver.observe(table);headerObserver.observe(header);
    return()=>{tableObserver.disconnect();headerObserver.disconnect();};
  },[]);
  const pageSize=width==null?3:Math.max(1,Math.min(3,Math.floor((width-248)/168)));
  const lastPage=Math.max(0,resources.length-pageSize),currentPage=Math.min(scrollPage,lastPage),visibleColumns=Math.min(pageSize,resources.length);
  const fixedWidth=`calc(var(--spacing) * ${pageSize===1?24:48})`;
  const page=direction=>{const table=tableRef.current;if(!table||lastPage===0)return;const next=Math.max(0,Math.min(lastPage,(direction===1?Math.floor(currentPage/pageSize)+1:Math.ceil(currentPage/pageSize)-1)*pageSize));table.scrollTo({left:(table.scrollWidth-table.clientWidth)/lastPage*next*(getComputedStyle(table).direction==='rtl'?-1:1),behavior:reducedMotion?'instant':'smooth'});};
  const menuProps=id=>({open:openMenu===id,onOpenChange:open=>onMenuOpenChange?.(open?id:null)});
  return <div className="cbp-viewport"><table ref={tableRef} className="cbp-table" data-page-size={pageSize} style={{gridTemplateColumns:`${fixedWidth} repeat(${resources.length}, calc((100% - ${fixedWidth} - calc(var(--spacing) * 14)) / ${visibleColumns})) calc(var(--spacing) * 14)`,scrollPaddingInline:`${fixedWidth} calc(var(--spacing) * 14)`}} onScroll={event=>{const element=event.currentTarget,extent=element.scrollWidth-element.clientWidth;setScrollPage(extent===0?0:Math.round(Math.abs(element.scrollLeft)/extent*lastPage));}}>
    <thead ref={headerRef} className="cbp-table-head"><tr className="cbp-secondary"><th className="cbp-site-heading">Site or pattern</th>{resources.map(resource=><th key={resource} id={`browser-use-site-permissions-column-${resource}`} className="cbp-permission-heading"><div className="cbp-cell-content">{COLUMN_LABELS[resource]}</div></th>)}<th className="cbp-action-heading">{lastPage>0&&<div className="cbp-page-controls"><CodexCuButton color="ghost" size="iconCircleSm" aria-label="Previous permissions" disabled={currentPage===0} onClick={()=>page(-1)}><CodexCuIcon name="shared:U9" className="cbp-direction-icon"/></CodexCuButton><CodexCuButton color="ghost" size="iconCircleSm" aria-label="Next permissions" disabled={currentPage===lastPage} onClick={()=>page(1)}><CodexCuIcon name="shared:K9" className="cbp-direction-icon"/></CodexCuButton></div>}<span className="cbp-sr-only">Actions</span></th></tr>
    <tr><td className="cbp-site-cell cbp-medium"><span id="browser-use-site-permissions-default">Default</span></td>{resources.map(resource=><td key={resource} className="cbp-permission-cell" aria-labelledby={`browser-use-site-permissions-default browser-use-site-permissions-column-${resource}`}><div className="cbp-cell-content">{defaults?.[resource]&&<CodexBrowserDefaultPermissionSelect {...defaults[resource]} resource={resource} disabled={disabled||defaults[resource].disabled} labelledBy={`browser-use-site-permissions-default browser-use-site-permissions-column-${resource}`} {...menuProps(`default:${resource}`)} onSelect={selection=>onDefaultSelect?.(resource,selection)}/>}</div></td>)}<td aria-hidden="true"/></tr></thead>
    <tbody>{rows.map((row,rowIndex)=>{const labelId=`browser-use-site-permissions-origin-${rowIndex}`,removeManaged=!row.hasUserPermissions&&(row.managedResources!=null||Object.values(row.inheritedRestrictions??{}).includes('organization'));return <tr key={row.origin}><td className="cbp-site-cell" aria-labelledby={labelId}><CodexCuTooltip tooltipContent={row.origin} openWhen="trigger-overflows"><span className="cbp-origin-wrap"><span id={labelId} className="cbp-origin" data-tooltip-overflow-target>{row.origin}</span></span></CodexCuTooltip>{row.networkBlocked&&<span className="cbp-network-note">Blocked by your network configuration</span>}</td>{resources.map(resource=><td key={resource} className="cbp-permission-cell"><div className="cbp-cell-content">{resource!=='origin'&&(!browserClientAllowed||row.values?.origin==='denied')?<span className="cbp-unavailable" aria-hidden="true">—</span>:row.cells?.[resource]?<CodexBrowserPermissionSelect {...row.cells[resource]} resource={resource} labelId={`browser-use-site-permissions-column-${resource}`} contextId={labelId} valueId={`browser-use-site-permissions-${rowIndex}-${resource}-value`} disabled={disabled||row.cells[resource].disabled} {...menuProps(`${row.origin}:${resource}`)} onSelect={value=>onSiteSelect?.(row.origin,resource,value)}/>:null}</div></td>)}<td className="cbp-permission-cell"><CodexBrowserManagedControl reason={removeManaged?'managed':null}><CodexCuButton color="ghost" size="icon" aria-label={`Remove custom permissions for ${row.origin}`} disabled={disabled||row.removing||!row.hasUserPermissions} onClick={()=>onRemoveRequest?.(row)}><CodexCuIcon name="primary:fm" className="cbp-small-icon"/></CodexCuButton></CodexBrowserManagedControl></td></tr>;})}</tbody>
  </table></div>;
}

function CompactDialog({open,onOpenChange,title,subtitle,children,footer,onSubmit}) {
  const dialogRef=useRef(null);
  useEffect(()=>{if(open)dialogRef.current?.querySelector('input,[data-cbp-autofocus]')?.focus();},[open]);
  if(!open)return null;
  return <div className="cbp-dialog-overlay" onPointerDown={event=>{if(event.target===event.currentTarget)onOpenChange?.(false);}}><div ref={dialogRef} className="cbp-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();onOpenChange?.(false);}}}><form className="cbp-dialog-body" onSubmit={event=>{event.preventDefault();onSubmit?.();}}><div className="cbp-dialog-section"><div className="cbp-dialog-header"><div className="cbp-dialog-heading">{title}</div><div className="cbp-dialog-subtitle">{subtitle}</div></div></div>{children&&<div className="cbp-dialog-section cbp-dialog-fields">{children}</div>}<div className="cbp-dialog-section"><div className="cbp-dialog-footer">{footer}</div></div></form><button type="button" className="cbp-dialog-close" aria-label="Close" onClick={()=>onOpenChange?.(false)}><CodexCuIcon name="shared:VT" className="cbp-close-icon"/></button></div></div>;
}

// ln. Caller supplies parsed/validated origin and effective gate results.
export function CodexBrowserAddPermissionDialog({open,onOpenChange,site='',onSiteChange,invalidOrigin=false,validOrigin=false,matchesDefaults=false,showMoreOptions=false,onMoreOptions,resources,fields,disabled=false,saving=false,addDisabled=true,managedAdd=false,openMenu,onMenuOpenChange,onPermissionSelect,onAdd,onCancel}) {
  const field=resource=>{const model=fields?.[resource];if(!model)return null;return <div key={resource} className="cbp-field"><span id={`browser-use-add-${resource}-label`} className="cbp-field-label">{FORM_LABELS[resource]}</span><CodexBrowserPermissionSelect {...model} resource={resource} variant="form" labelId={`browser-use-add-${resource}-label`} valueId={`browser-use-add-${resource}-value`} disabled={disabled||saving||model.disabled} open={openMenu===resource} onOpenChange={next=>onMenuOpenChange?.(next?resource:null)} onSelect={value=>onPermissionSelect?.(resource,value)}/></div>;};
  return <CompactDialog open={open} onOpenChange={onOpenChange} title="Add site permission" subtitle="Choose what access ChatGPT has on a site" onSubmit={onAdd} footer={<>{!showMoreOptions&&resources.length>1&&<CodexCuButton color="ghost" size="medium" className="cbp-more-options" disabled={saving} onClick={onMoreOptions}>More options</CodexCuButton>}<CodexCuButton color="outline" size="medium" disabled={saving} onClick={()=>{onCancel?.();onOpenChange?.(false);}}>Cancel</CodexCuButton><CodexBrowserManagedControl reason={managedAdd?'managed':null}><CodexCuButton color="primary" size="medium" disabled={addDisabled} loading={saving} type="submit">Add</CodexCuButton></CodexBrowserManagedControl></>}><label className="cbp-field"><span className="cbp-field-label">Site</span><input autoFocus className="cbp-input" aria-label="Site" aria-invalid={invalidOrigin} aria-describedby={invalidOrigin?'browser-use-add-origin-error':undefined} disabled={disabled||saving} placeholder="https://example.com" value={site} onChange={event=>onSiteChange?.(event.currentTarget.value)}/>{invalidOrigin&&<span className="cbp-input-error" id="browser-use-add-origin-error" role="alert">Enter a valid origin, such as https://example.com or https://*.example.com</span>}</label>{field('origin')}{showMoreOptions&&resources.filter(resource=>resource!=='origin').map(field)}{validOrigin&&matchesDefaults&&<span className="cbp-defaults-note" role="status">These permissions match the defaults, so adding this site would not change anything</span>}</CompactDialog>;
}

export function CodexBrowserRemovePermissionDialog({open,onOpenChange,origin,disabled=false,removing=false,onRemove}) {
  return <CompactDialog open={open} onOpenChange={onOpenChange} title={`Remove custom permissions for ${origin}?`} subtitle="This resets this site's custom permissions to their defaults" onSubmit={onRemove} footer={<><CodexCuButton color="ghost" size="medium" data-cbp-autofocus disabled={removing} onClick={()=>onOpenChange?.(false)}>Cancel</CodexCuButton><CodexCuButton color="danger" size="medium" disabled={disabled} loading={removing} type="submit">Remove</CodexCuButton></>}/>;
}

export function CodexBrowserPolicy({resources,defaults,rows,loading=false,error=false,disabled=false,addManaged=false,addDisabled=false,showManagedLegend=false,theme,windowType,density,onAddRequest,addDialog,removeDialog,...matrixProps}) {
  const loaded=!loading&&!error&&rows!=null;
  return <CodexCuScope as="section" className="cbp-policy" theme={theme} referenceWindowType={windowType} data-density={density}><header className="cbp-section-header"><div className="cbp-section-heading"><div className="cbp-section-title">Agent permissions</div><div className="cbp-section-subtitle">Choose default permissions and add exceptions for specific sites</div></div><div className="cbp-section-actions"><CodexBrowserManagedControl reason={addManaged?'managed':null}><CodexCuButton color="secondary" size="toolbar" disabled={disabled||error||loading||!loaded||addDisabled||addManaged} onClick={onAddRequest}><CodexCuIcon name={addManaged?'shared:gnt':'shared:$ct'}/>Add</CodexCuButton></CodexBrowserManagedControl></div></header><div className="cbp-section-content">{error?<div className="cbp-state-card"><div className="cbp-load-error">Unable to load site permissions</div></div>:!loaded?<div className="cbp-state-card"><div className="cbp-loading-row" role="status"><span className="cbp-loading-label"><CodexCuSpinner className="cbp-loading-icon"/><span>Loading websites…</span></span></div></div>:<CodexBrowserPolicyMatrix {...matrixProps} resources={resources} defaults={defaults} rows={rows} disabled={disabled}/>}</div>{loaded&&<div className="cbp-section-footer">Only sites with custom permissions appear here</div>}{loaded&&showManagedLegend&&<div className="cbp-section-footer"><span className="cbp-legend"><CodexCuIcon name="shared:gnt"/>Managed by your organization</span></div>}{addDialog&&<CodexBrowserAddPermissionDialog {...addDialog} resources={resources}/>}{removeDialog&&<CodexBrowserRemovePermissionDialog {...removeDialog}/>}</CodexCuScope>;
}
