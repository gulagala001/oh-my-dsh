import { CodexCuI18nProvider, useCodexCuPlainText } from './codex-cu-i18n.jsx';
const CODEX_PLAIN_DISPLAY_IDS = Object.freeze({
  "New chat": "codex.taskRow.title",
  "Focus chat": "appShell.detachedWindow.focusSource",
  "Couldn’t show task": "appShell.detachedWindow.focusSourceFailed",
  "Keep window on top": "appShell.detachedWindow.pin",
  "Stop keeping window on top": "appShell.detachedWindow.unpin",
  "Couldn’t change window order": "appShell.detachedWindow.pinFailed",
  "Restore to main window": "appShell.detachedWindow.restore",
  "Couldn’t return this tab to the main window": "appShell.detachedWindow.restoreFailed"
});
import React, {useEffect, useRef, useState} from 'react';
import { CodexCuScope } from './codex-cu-scope.jsx';
import { CodexCuButton, CodexCuTooltip } from './codex-cu-primitives.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import './codex-detached-window.css';

// entry-379a0807e3f8 F + app-shared CWi; source references and bridge gaps
// are recorded in work/rea-reconstruction/frontend-detached/manifest.json.
export const codexDetachedWindowChrome = Object.freeze({
  sourceTitle: 'New chat',
  focusSourceLabel: 'Focus chat',
  focusSourceFailedLabel: 'Couldn’t show task',
  pinLabel: 'Keep window on top',
  unpinLabel: 'Stop keeping window on top',
  pinFailedLabel: 'Couldn’t change window order',
  restoreLabel: 'Restore to main window',
  restoreFailedLabel: 'Couldn’t return this tab to the main window',
});

/** Browser detached entry F owns async pending/failure state; explicit owner
 * state can still be supplied by an embedding renderer. */
export function CodexDetachedWindowTitleBar({
  title, chrome = codexDetachedWindowChrome, alwaysOnTop = null,
  platform = 'unknown', titleBarPlatform = platform, controlsOverlayVisible = false,
  inset = true, separator = false, statusContent, pending, failureAction,
  tooltipProps = {}, onFocusSource, onSetAlwaysOnTop, onRestore, onAction,
formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });
  const [ownPending,setPending]=useState({focus:false,pin:false,restore:false});
  const [ownFailure,setFailure]=useState(null);
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const actionPending=Object.fromEntries(Object.keys(ownPending).map(action=>[action,ownPending[action]||pending?.[action]===true]));
  const failedAction=failureAction===undefined?ownFailure:failureAction;

  const labels = Object.fromEntries(Object.entries({ ...codexDetachedWindowChrome, ...chrome }).map(([key, value]) => [key, cuText(value)]));
  const failureLabel = failedAction == null ? null : {
    focus: labels.focusSourceFailedLabel,
    pin: labels.pinFailedLabel,
    restore: labels.restoreFailedLabel,
  }[failedAction];
  const invoke = async action => {
    if(actionPending[action])return;
    try { Promise.resolve(onAction?.(action === 'focus' ? 'focus_source' : action === 'restore' ? 'restore' : alwaysOnTop ? 'unpin' : 'pin')).catch(()=>{}); } catch {}
    setPending(value=>({...value,[action]:true}));setFailure(null);
    try {
      const handler={focus:onFocusSource,pin:()=>onSetAlwaysOnTop?.(!alwaysOnTop),restore:onRestore}[action];
      if(typeof handler!=='function'||action==='pin'&&typeof onSetAlwaysOnTop!=='function'||await handler()===false){if(mounted.current)setFailure(action);}
    } catch { if(mounted.current)setFailure(action); }
    finally { if(mounted.current)setPending(value=>({...value,[action]:false})); }
  };
  const windowActions = <>
    {cuText(alwaysOnTop != null && <CodexCuTooltip {...tooltipProps.pin} side="bottom" tooltipContent={cuText(alwaysOnTop ? labels.unpinLabel : labels.pinLabel)}>
      <CodexCuButton aria-label={cuText(labels.pinLabel)} aria-pressed={alwaysOnTop}
        color={alwaysOnTop ? 'ghostActive' : 'ghost'} data-state={alwaysOnTop ? 'open' : 'closed'}
        size="toolbar" uniform disabled={!!actionPending.pin} onClick={() => void invoke('pin')}>
        <CodexCuIcon name="shared:U_" className="codex-detached-window-icon" />
      </CodexCuButton>
    </CodexCuTooltip>)}
    <CodexCuTooltip {...tooltipProps.restore} side="bottom" tooltipContent={cuText(labels.restoreLabel)}>
      <CodexCuButton aria-label={cuText(labels.restoreLabel)} color="ghost" size="toolbar" uniform
        disabled={!!actionPending.restore} onClick={() => void invoke('restore')}>
        <CodexCuIcon name="shared:V_" className="codex-detached-window-icon" />
      </CodexCuButton>
    </CodexCuTooltip>
  </>;
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><header className={['codex-detached-window-titlebar', inset && 'codex-detached-window-titlebar-inset', separator && 'codex-detached-window-titlebar-separator'].filter(Boolean).join(' ')}
    data-controls-overlay-visible={controlsOverlayVisible} data-platform={titleBarPlatform}
    data-window-titlebar dir={labels.direction}>
    {cuText(platform === 'win32' && windowActions)}
    {cuText(title != null && <span className="codex-detached-window-title" title={cuText(title)}>{cuText(title)}</span>)}
    {cuText(statusContent)}
    {cuText(failureLabel != null && <span className="codex-detached-window-truncate" role="status" title={cuText(failureLabel)}>{cuText(failureLabel)}</span>)}
    <CodexCuTooltip {...tooltipProps.focus} side="bottom" tooltipContent={cuText(labels.focusSourceLabel)}>
      <CodexCuButton className="codex-detached-window-source" color="ghost" size="toolbar" allowShrink
        disabled={!!actionPending.focus || !!actionPending.restore} onClick={() => void invoke('focus')}>
        <CodexCuIcon name="shared:b9" />
        <span className="codex-detached-window-truncate">{cuText(labels.sourceTitle)}</span>
      </CodexCuButton>
    </CodexCuTooltip>
    {cuText(platform !== 'win32' && windowActions)}
  </header></CodexCuI18nProvider>;
}

/** Detached shell only: content is supplied by the existing browser frontend. */
export function CodexDetachedWindow({ children, className, style, theme, referenceWindowType,
  typographyPreset, windowZoom, formatMessage, locale, contentRef, ...titleBarProps }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuScope className={['codex-detached-window', className].filter(Boolean).join(' ')}
    theme={theme} referenceWindowType={referenceWindowType} typographyPreset={typographyPreset}
    windowZoom={windowZoom} style={style}>
    <div className="codex-detached-window-titlebar-host"><CodexDetachedWindowTitleBar {...titleBarProps} /></div>
    <div ref={contentRef} className="codex-detached-window-content">{cuText(children)}</div>
  </CodexCuScope></CodexCuI18nProvider>;
}
