import React, {useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {CodexCuButton, CodexCuMenuItem, CodexCuMenuSurface} from './codex-cu-primitives.jsx';
import {CodexCuSettingsDropdownTrigger, CodexCuSettingsGroup, CodexCuSettingsInput, CodexCuSettingsPanelLoading, CodexCuSettingsRow, CodexCuSettingsSection, CodexCuSettingsSectionContent, CodexCuSettingsSectionHeader} from './codex-cu-settings-primitives.jsx';
import {CodexCuDialog, CodexCuDialogBody, CodexCuDialogFooter, CodexCuDialogHeader, CodexCuDialogSection, CodexCuDialogTitle} from './codex-cu-dialog.jsx';
import cloudPolicyCss from './codex-cloud-browser-policy.css';
import { CodexCuScope } from './codex-cu-scope.jsx';

// Independent Cloud design from settings-4201f6c3f5e5.js Dt/ht/dt.
// No local-browser matrix, permission evaluation, parser, config query or mutation.
// Root installs CSS; controls and overlays remain explicit props/callbacks.
export const codexCloudBrowserPolicyCss=cloudPolicyCss;
export const CODEX_CLOUD_BROWSER_APPROVAL_MODES={
  always_ask:{label:'Always ask',description:'Ask before ChatGPT opens a website'},
  auto_approve:{label:'Auto approve',description:'Automatically approve or deny actions based on their risk'},
  always_allow:{label:'Always allow',description:'Let ChatGPT open websites without asking'},
};

function CloudPolicyMenu({open,triggerRef,onOpenChange,placement,children}) {
  const menuRef=useRef(null),[position,setPosition]=useState(null);
  useLayoutEffect(()=>{
    if(!open||!triggerRef.current)return;
    const update=()=>{const rect=triggerRef.current.getBoundingClientRect();setPosition({right:window.innerWidth-rect.right,top:rect.bottom+1});};
    update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    const outside=event=>{if(!triggerRef.current?.contains(event.target)&&!menuRef.current?.contains(event.target))onOpenChange?.(false);};
    document.addEventListener('pointerdown',outside);
    return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);document.removeEventListener('pointerdown',outside);};
  },[open,triggerRef,onOpenChange]);
  if(!open||!position||typeof document==='undefined')return null;
  const dialog=triggerRef.current?.closest('[role="dialog"]');
  const overlayOwner=placement?.overlayOwner??dialog?.getAttribute('data-overlay-owner')??dialog?.id??undefined;
  return createPortal(<CodexCuScope forceScope><div ref={menuRef} className="ccbp-menu-position" data-overlay-owner={overlayOwner} style={placement?.style??position} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onOpenChange?.(false);triggerRef.current?.focus();}}}><CodexCuMenuSurface align={placement?.align??'end'} side={placement?.side??'bottom'} style={{'--radix-dropdown-menu-content-available-width':`${window.innerWidth}px`,'--radix-dropdown-menu-content-available-height':`${window.innerHeight-position.top}px`,...placement?.surfaceStyle}}>{children}</CodexCuMenuSurface></div></CodexCuScope>,document.body);
}

// dt: block comes first; allow is a warning option with wrapped risk subtext.
export function CodexCloudBrowserSitePermissionSelect({decision='allow',disabled=false,open=false,onOpenChange,onSelect,menuPlacement,...triggerProps}) {
  const triggerRef=useRef(null),select=next=>{onSelect?.(next);onOpenChange?.(false);};
  return <><CodexCuSettingsDropdownTrigger {...triggerProps} ref={triggerRef} disabled={disabled} open={open} aria-haspopup="menu" onClick={()=>onOpenChange?.(!open)}>{decision==='allow'?'Always allow':'Always block'}</CodexCuSettingsDropdownTrigger><CloudPolicyMenu open={open} triggerRef={triggerRef} onOpenChange={onOpenChange} placement={menuPlacement}><CodexCuMenuItem rightIcon={decision==='deny'?<CodexCuIcon name="shared:N9"/>:undefined} onSelect={()=>select('deny')}>Always block</CodexCuMenuItem><CodexCuMenuItem subTextAllowWrap tone="warning" SubText="Elevated risk for your data" rightIcon={decision==='allow'?<CodexCuIcon name="shared:N9"/>:undefined} onSelect={()=>select('allow')}>Always allow</CodexCuMenuItem></CloudPolicyMenu></>;
}

// Dt / Nt: this row belongs in Ge's General group beside its cookie rows.
export function CodexCloudBrowserDefaultPermissions({mode='auto_approve',available=true,loading=false,error=false,pending=false,disabled=false,open=false,onOpenChange,onSelect,menuPlacement}) {
  const triggerRef=useRef(null),blocked=disabled||!available||loading||pending;
  const label=available?CODEX_CLOUD_BROWSER_APPROVAL_MODES[mode]?.label:error?'Unavailable':'Loading…';
  return <CodexCuSettingsRow label="ChatGPT Work website approvals" description="Choose whether ChatGPT Work asks before opening websites. Applies only to ChatGPT Work." control={attributes=><><CodexCuSettingsDropdownTrigger {...attributes} ref={triggerRef} disabled={blocked} open={open} aria-haspopup="menu" onClick={()=>onOpenChange?.(!open)}>{label}</CodexCuSettingsDropdownTrigger><CloudPolicyMenu open={open} triggerRef={triggerRef} onOpenChange={onOpenChange} placement={menuPlacement}>{Object.entries(CODEX_CLOUD_BROWSER_APPROVAL_MODES).map(([value,option])=><CodexCuMenuItem key={value} subTextAllowWrap SubText={option.description} tone={value==='always_allow'?'warning':'default'} rightIcon={mode===value?<CodexCuIcon name="shared:N9"/>:undefined} onSelect={()=>{onSelect?.(value);onOpenChange?.(false);}}>{option.label}</CodexCuMenuItem>)}</CloudPolicyMenu></>}/>;
}

// Only VV's actual {type:error,variant:callout,content,role:alert} branch used
// by ht is rendered here. Shared SettingsCallout currently covers a different
// VV branch, so Cloud's source-specific rounded-md layout is kept independent.
function CloudPolicySaveError() {
  return <aside className="ccbp-error-callout" role="alert"><div className="ccbp-error-backdrop" aria-hidden="true"/><div className="ccbp-error-inner"><div className="ccbp-error-copy"><div className="ccbp-error-column"><div className="ccbp-error-column"><div className="ccbp-error-text">Cloud browser settings couldn't be updated</div></div></div></div></div></aside>;
}

// ht: parsing is supplied by caller; no local validation or login operations.
export function CodexCloudBrowserAddWebsiteDialog({open=false,onOpenChange,trigger,pending=false,failed=false,site='',decision='allow',invalid=false,canonicalPattern=null,onSiteChange,onDecisionSelect,onReset,onSubmit,permissionMenuOpen=false,onPermissionMenuOpenChange,menuPlacement,...dialogProps}) {
  const inputId=useId(),errorId=useId(),permissionId=useId();
  const changeOpen=next=>{if(pending)return;onReset?.();onOpenChange?.(next);};
  const submit=event=>{event.preventDefault();if(canonicalPattern!=null&&!pending)onSubmit?.({pattern:canonicalPattern,decision});};
  return <CodexCuDialog {...dialogProps} open={open} triggerContent={trigger} size="compact" showDialogClose={!pending} onOpenChange={changeOpen} contentProps={{...dialogProps.contentProps,'aria-describedby':undefined}}><CodexCuDialogBody as="form" onSubmit={submit}><CodexCuDialogSection><CodexCuDialogHeader title={<CodexCuDialogTitle>Add website</CodexCuDialogTitle>}/></CodexCuDialogSection><CodexCuDialogSection spacing="large"><div className="ccbp-field-stack"><label htmlFor={inputId} className="ccbp-field-label">Site or pattern</label><CodexCuSettingsInput id={inputId} autoFocus autoCapitalize="off" autoComplete="off" spellCheck={false} inputMode="url" maxLength={4096} required disabled={pending} value={site} placeholder="https://example.com" aria-invalid={invalid} aria-describedby={invalid?errorId:undefined} onValueChange={onSiteChange}/>{invalid&&<span className="ccbp-input-error" id={errorId} role="alert">Enter a valid website address</span>}</div></CodexCuDialogSection><CodexCuDialogSection spacing="large"><div className="ccbp-field-stack"><span id={permissionId} className="ccbp-field-label">Browsing</span><CodexCloudBrowserSitePermissionSelect aria-labelledby={permissionId} decision={decision} disabled={pending} open={permissionMenuOpen} onOpenChange={onPermissionMenuOpenChange} onSelect={onDecisionSelect} menuPlacement={menuPlacement}/></div></CodexCuDialogSection>{failed&&<CodexCuDialogSection><CloudPolicySaveError/></CodexCuDialogSection>}<CodexCuDialogSection spacing="large"><CodexCuDialogFooter><CodexCuButton type="button" color="secondary" disabled={pending} onClick={()=>changeOpen(false)}>Cancel</CodexCuButton><CodexCuButton type="submit" color="primary" disabled={canonicalPattern==null||pending} loading={pending}>Add website</CodexCuButton></CodexCuDialogFooter></CodexCuDialogSection></CodexCuDialogBody></CodexCuDialog>;
}

// Dt: origins are ordinary settings rows. Deletion is a direct callback in this
// source branch, with no confirmation dialog. Loading/error may coexist with a
// retained origins snapshot; no source-less empty-state card is introduced.
export function CodexCloudBrowserWebsitePermissions({origins,available=true,loading=false,error=false,pending=false,disabled=false,openMenu,onMenuOpenChange,onSiteDecisionSelect,onRemoveRule,onRetry,onAddRequest,addDialog,menuPlacements}) {
  const blocked=disabled||!available||loading||pending;
  const trigger=<CodexCuButton color="secondary" size="toolbar" disabled={blocked} onClick={addDialog?undefined:onAddRequest}>Add website</CodexCuButton>;
  const actions=addDialog?<CodexCloudBrowserAddWebsiteDialog {...addDialog} pending={pending} trigger={trigger}/>:trigger;
  return <CodexCuSettingsSection><CodexCuSettingsSectionHeader title="Website permissions" subtitle="Add sites to override the default permission" actions={actions}/><CodexCuSettingsSectionContent>{loading&&<CodexCuSettingsPanelLoading/>}{origins?.length>0&&<CodexCuSettingsGroup>{origins.map(origin=><CodexCuSettingsRow key={origin.pattern} label={<span className="ccbp-site-pattern" title={origin.pattern}>{origin.pattern}</span>} icon={<CodexCuIcon name="shared:Dtt"/>} control={attributes=><><CodexCloudBrowserSitePermissionSelect {...attributes} decision={origin.decision} disabled={blocked} open={openMenu===origin.pattern} onOpenChange={next=>onMenuOpenChange?.(next?origin.pattern:null)} onSelect={decision=>onSiteDecisionSelect?.(origin.pattern,decision)} menuPlacement={menuPlacements?.[origin.pattern]}/><CodexCuButton color="ghost" size="toolbar" disabled={blocked} aria-label={`Remove permission for ${origin.pattern}`} onClick={()=>onRemoveRule?.(origin.pattern)}><CodexCuIcon name="shared:lot"/></CodexCuButton></>}/>)}</CodexCuSettingsGroup>}{error&&<CodexCuSettingsRow label="Cloud browser settings couldn't be loaded" control={<CodexCuButton color="secondary" size="toolbar" onClick={onRetry}>Retry</CodexCuButton>}/>}</CodexCuSettingsSectionContent></CodexCuSettingsSection>;
}
