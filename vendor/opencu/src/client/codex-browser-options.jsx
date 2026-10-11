import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CodexCuScope, useCodexCuAppearance } from './codex-cu-scope.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuButton, CodexCuTooltip, CodexCuMenuSurface, CodexCuMenuItem,
  CodexCuMenuSeparator, CodexCuMenuFlyoutTrigger } from './codex-cu-primitives.jsx';
import { useCodexCuLayerRenderer } from './codex-cu-overlay.jsx';
import { formatCodexCuMessage } from './codex-cu-i18n.mjs';
import { CodexDeviceToolbarMenuRows } from './codex-device-toolbar.jsx';

// Full Xs/Qs and shared Hji references: browser-options/manifest.json.
// CSS is aggregated once by the root; this component never renders a style tag.
const p = (...values) => values.filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cbo-${value}`).join(' ');
const textFor = (id, locale, copy, values) => copy?.[id] ?? formatCodexCuMessage({ id }, values, locale);
const stopAndRun = (event, callback) => { event.preventDefault(); event.stopPropagation(); callback(); };

export const CODEX_BROWSER_OPTIONS_SUBMENUS = Object.freeze({
  deviceToolbar: 'device-toolbar', passwordsAndAutofill: 'passwords-autofill', clearBrowsingData: 'clear-browsing-data',
});

/** Hji's active desktop branch (NSi('not all') is false). The shared host layer
 * supplies portals, focus, dismissal and keyboard selection. Source hover200,
 * measured offsets, Floating UI positioning and submenu grace are retained.
 * All submenu open state remains controlled by the caller. */
function OptionsFlyout({ name, label, disabled = false, open, onOpenChange, onRootOpenChange,
  direction, sourceMenuRenderer, children }) {
  const appearance = useCodexCuAppearance(), triggerRef = useRef(null), contentRef = useRef(null);
  const timerRef = useRef(null), abortRef = useRef(null), openingIntentRef = useRef('pointer'), suppressNextOpenRef = useRef(false);
  const [geometry, setGeometry] = useState({ sideOffset: 4, alignOffset: 0 });
  const cancelHover = () => { if (timerRef.current != null) clearTimeout(timerRef.current); timerRef.current = null; abortRef.current?.abort(); abortRef.current = null; };
  useEffect(() => () => cancelHover(), [open, disabled]);
  useLayoutEffect(() => {
    if (!open || disabled) return;
    const trigger = triggerRef.current, surface = contentRef.current;
    const parent = trigger?.closest('[role="menu"]');
    if (!trigger || !surface || !parent) return;
    const measure = () => {
      const triggerBounds = trigger.getBoundingClientRect(), parentBounds = parent.getBoundingClientRect();
      const style = getComputedStyle(surface);
      const next = {
        sideOffset: 4 + Math.max(triggerBounds.left - parentBounds.left, parentBounds.right - triggerBounds.right, 0) / appearance.windowZoom,
        alignOffset: -parseFloat(style.paddingTop) - parseFloat(style.marginTop),
      };
      setGeometry(previous => previous.sideOffset === next.sideOffset && previous.alignOffset === next.alignOffset ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(surface); observer.observe(trigger); observer.observe(parent);
    return () => observer.disconnect();
  }, [open, disabled, appearance.windowZoom]);
  const changeOpen = (next, metadata) => {
    // Hji De/Ee: native100 may request opening while the outer200 is pending.
    // Reject before Te/cancelHover so that request cannot clear the source timer.
    if (next && (disabled || timerRef.current != null)) return;
    cancelHover();
    if (next && suppressNextOpenRef.current) { suppressNextOpenRef.current = false; return; }
    suppressNextOpenRef.current = !next;
    onOpenChange?.(next ? name : null, metadata);
    if (!next && metadata?.reason === 'selection') onRootOpenChange?.(false, metadata);
  };
  const hover = event => {
    if (disabled || open || event.pointerType !== 'mouse') return;
    if (timerRef.current == null) {
      const trigger = event.currentTarget, abort = new AbortController(); abortRef.current = abort;
      trigger.ownerDocument.addEventListener('keydown', () => { cancelHover(); suppressNextOpenRef.current = true; }, { capture: true, signal: abort.signal });
      timerRef.current = setTimeout(() => {
        cancelHover(); trigger.focus({ preventScroll: true }); suppressNextOpenRef.current = false; openingIntentRef.current = 'pointer';
        changeOpen(true, { reason: 'hover' });
      }, 200);
    }
    const currentTimer = timerRef.current;
    queueMicrotask(() => { if (event.defaultPrevented && timerRef.current === currentTimer) { cancelHover(); suppressNextOpenRef.current = true; } });
  };
  const openKey = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const closeKey = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
  const trigger = <CodexCuMenuFlyoutTrigger ref={triggerRef} label={label} disabled={disabled} open={open && !disabled}
    onPointerEnter={hover} onPointerMove={hover} onPointerLeave={cancelHover}
    onKeyDown={event => {
      cancelHover(); suppressNextOpenRef.current = true;
      if (disabled || ![openKey, 'Enter', ' '].includes(event.key)) return;
      suppressNextOpenRef.current = false;
      event.preventDefault(); event.stopPropagation(); openingIntentRef.current = 'keyboard'; changeOpen(true, { reason: 'keyboard', originalEvent: event });
    }}
    onClick={event => {
      cancelHover(); suppressNextOpenRef.current = false;
      if (disabled) return;
      event.preventDefault(); event.stopPropagation(); openingIntentRef.current = event.detail === 0 ? 'keyboard' : 'pointer';
      changeOpen(true, { reason: 'trigger', originalEvent: event });
    }} />;
  return sourceMenuRenderer({
    type: 'menu', kind: name, submenu: true, open: open && !disabled, onOpenChange: changeOpen,
    onSubmenuOpenRequest: next => { openingIntentRef.current = 'pointer'; changeOpen(next, { reason: 'submenu-pointer' }); },
    triggerButton: trigger, triggerRef, contentRef, manageTrigger: false,
    side: direction === 'rtl' ? 'left' : 'right', align: 'start', dir: direction,
    sideOffset: geometry.sideOffset, alignOffset: geometry.alignOffset, collisionPadding: 6,
    autoFocus: true, restoreFocus: true, openIntent: openingIntentRef.current, loop: false,
    content: <CodexCuMenuSurface contentWidth="sm" dir={direction} aria-label={label}
      onKeyDown={event => { if (event.key === closeKey) { event.preventDefault(); event.stopPropagation(); changeOpen(false, { reason: 'submenu-back', originalEvent: event }); } }}>
      <div>{children}</div>
    </CodexCuMenuSurface>,
  });
}

/** Pure props rendition of the full Browser options Xs content and gates.
 * The caller owns native actions, availability, menus, busy/lease state and the
 * toolbar trigger. Optional callbacks preserve their source presence gates.
 * `zoomControlsAvailable=false` and `showNewTabsPreference=false` are explicit
 * host omissions, not Codex gates. Never pass screenshot scale as page zoom.
 * When zoom is available, a real finite currentZoomPercent is required.
 */
export function CodexBrowserOptionsMenu({
  currentZoomPercent, direction, onOpenChange, triggerRef, triggerButton, open = false,
  pageActionsDisabled = false, isDeviceToolbarEnabled, isDeviceToolbarVisible = false,
  isFloatingComposerMenuItemVisible = false, isFloatingComposerVisible = true,
  isPrintMenuItemVisible = false, isScreenshotCaptureEnabled, onCaptureScreenshot,
  onOpenFindInPage, onPrint, onResetZoom, onToggleFloatingComposer, onToggleDeviceToolbar,
  showDeviceToolbarInNewTabs, onShowDeviceToolbarInNewTabsChange, onZoomIn, onZoomOut,
  showExtensionsOverflow, onOpenExtensions, onImportBrowserProfile, onOpenPasswordManager,
  onOpenContactInfo, onOpenDownloads, onOpenHistory, onOpenBrowserSettings, clearBrowsingData,
  zoomControlsAvailable = true, showNewTabsPreference = true,
  openSubmenu = null, onSubmenuOpenChange, sourceMenuRenderer, manageTrigger = false,
  openIntent = 'pointer', locale = 'zh-CN', copy, scopeProps, contentRef,
  onCloseAutoFocus, onOpenAutoFocus,
}) {
  const defaultRenderer = useCodexCuLayerRenderer(), pendingExtensions = useRef(false);
  const renderer = sourceMenuRenderer ?? defaultRenderer;
  if (zoomControlsAvailable && !Number.isFinite(currentZoomPercent)) {
    throw new TypeError('CodexBrowserOptionsMenu requires a finite native currentZoomPercent when zoomControlsAvailable is true.');
  }
  const text = (id, values) => textFor(id, locale, copy, values);
  const managers = onImportBrowserProfile != null || onOpenPasswordManager != null || onOpenContactInfo != null || onOpenDownloads != null || onOpenHistory != null || clearBrowsingData != null;
  const composer = isFloatingComposerMenuItemVisible && onToggleFloatingComposer != null;
  const devices = isDeviceToolbarEnabled && onToggleDeviceToolbar != null;
  const screenshot = isScreenshotCaptureEnabled && onCaptureScreenshot != null;
  const afterZoom = composer || devices || screenshot || managers || onOpenBrowserSettings != null;
  const flyout = (name, label, children, disabled = false) => <OptionsFlyout key={name} name={name} label={label} disabled={disabled}
    open={open && openSubmenu === name} onOpenChange={onSubmenuOpenChange} onRootOpenChange={onOpenChange}
    direction={direction} sourceMenuRenderer={renderer}>{children}</OptionsFlyout>;
  const zoomOut = text('browserSidebar.zoomBanner.zoomOut'), zoomIn = text('browserSidebar.zoomBanner.zoomIn'), reset = text('browserSidebar.zoomBanner.reset');
  const content = <CodexCuMenuSurface contentWidth="menuWide" align="end" dir={direction} ref={contentRef}
    aria-label={text('thread.browser.options')} className="codex-browser-options-menu">
    {showExtensionsOverflow && onOpenExtensions != null && <CodexCuMenuItem onSelect={() => { pendingExtensions.current = true; onOpenChange(false); }}>{text('thread.browser.extensions.overflow')}</CodexCuMenuItem>}
    <CodexCuMenuItem disabled={pageActionsDisabled} onSelect={onOpenFindInPage}>{text('thread.browser.findInPage')}</CodexCuMenuItem>
    {isPrintMenuItemVisible && onPrint != null && <CodexCuMenuItem disabled={pageActionsDisabled} onSelect={onPrint}>{text('thread.browser.print')}</CodexCuMenuItem>}
    {zoomControlsAvailable && <><CodexCuMenuSeparator /><div role="group" aria-label={text('thread.browser.zoom')} className={p('flex items-center gap-1 rounded-lg px-[var(--padding-row-x)] py-0.5 text-sm')}>
      <span className={p('min-w-0 flex-1 truncate')}>{text('thread.browser.zoom')}</span>
      <div className={p('flex shrink-0 items-center overflow-hidden rounded-md border border-default bg-text/5 text-xs')}>
        <CodexCuTooltip tooltipContent={zoomOut} side="bottom" renderLayer={renderer}>
          <CodexCuButton className={p('h-6 w-6 justify-center')} type="button" aria-label={zoomOut} color="ghost" focusRing="inset" size="inline" disabled={pageActionsDisabled}
            onClick={event => stopAndRun(event, onZoomOut)}><CodexCuIcon name="shared:Ry" aria-hidden={false} /></CodexCuButton>
        </CodexCuTooltip>
        <div className={p('w-11 border-x border-default py-0.5 text-center tabular-nums')}>{text('thread.browser.zoomPercent', { zoomPercent: currentZoomPercent })}</div>
        <CodexCuTooltip tooltipContent={zoomIn} side="bottom" renderLayer={renderer}>
          <CodexCuButton className={p('h-6 w-6 justify-center')} type="button" aria-label={zoomIn} color="ghost" focusRing="inset" size="inline" disabled={pageActionsDisabled}
            onClick={event => stopAndRun(event, onZoomIn)}><CodexCuIcon name="shared:$ct" aria-hidden={false} /></CodexCuButton>
        </CodexCuTooltip>
      </div>
      <CodexCuTooltip tooltipContent={reset} side="bottom" renderLayer={renderer}>
        <CodexCuButton aria-label={reset} color="ghost" radius="small" size="compact" uniform disabled={pageActionsDisabled || currentZoomPercent === 100}
          onClick={event => stopAndRun(event, onResetZoom)}><CodexCuIcon name="shared:Emt" aria-hidden={false} /></CodexCuButton>
      </CodexCuTooltip>
    </div></>}
    {afterZoom && <CodexCuMenuSeparator />}
    {composer && <>
      <CodexCuMenuItem onSelect={onToggleFloatingComposer}>{text(isFloatingComposerVisible ? 'thread.browser.options.hideFloatingComposer' : 'thread.browser.options.showFloatingComposer')}</CodexCuMenuItem>
      {(devices || screenshot || managers || onOpenBrowserSettings != null) && <CodexCuMenuSeparator />}
    </>}
    {devices && flyout(CODEX_BROWSER_OPTIONS_SUBMENUS.deviceToolbar, text('thread.browser.options.deviceToolbar'),
      <CodexDeviceToolbarMenuRows isDeviceToolbarEnabled={isDeviceToolbarEnabled} isDeviceToolbarVisible={isDeviceToolbarVisible}
        pageActionsDisabled={pageActionsDisabled} onToggleDeviceToolbar={onToggleDeviceToolbar}
        showDeviceToolbarInNewTabs={showDeviceToolbarInNewTabs} onShowDeviceToolbarInNewTabsChange={onShowDeviceToolbarInNewTabsChange}
        showNewTabsPreference={showNewTabsPreference} copy={{ hide: text('thread.browser.options.hideDeviceToolbar'), show: text('thread.browser.options.showDeviceToolbar'), newTabs: text('thread.browser.options.showDeviceToolbarInNewTabs') }} />)}
    {screenshot && <CodexCuMenuItem disabled={pageActionsDisabled} onSelect={onCaptureScreenshot}>{text('thread.browser.captureScreenshot')}</CodexCuMenuItem>}
    {(devices || screenshot) && (managers || onOpenBrowserSettings != null) && <CodexCuMenuSeparator />}
    {onImportBrowserProfile != null && <CodexCuMenuItem onSelect={onImportBrowserProfile}>{text('thread.browser.importCookiesAndPasswords')}</CodexCuMenuItem>}
    {(onOpenPasswordManager != null || onOpenContactInfo != null) && flyout(CODEX_BROWSER_OPTIONS_SUBMENUS.passwordsAndAutofill, text('thread.browser.passwordsAndAutofill'), <>
      {onOpenPasswordManager != null && <CodexCuMenuItem onSelect={onOpenPasswordManager}>{text('thread.browser.passwordManager')}</CodexCuMenuItem>}
      {onOpenContactInfo != null && <CodexCuMenuItem onSelect={onOpenContactInfo}>{text('thread.browser.contactInfo')}</CodexCuMenuItem>}
    </>)}
    {onOpenDownloads != null && <CodexCuMenuItem onSelect={onOpenDownloads}>{text('thread.browser.downloads')}</CodexCuMenuItem>}
    {onOpenHistory != null && <CodexCuMenuItem onSelect={onOpenHistory}>{text('thread.browser.history')}</CodexCuMenuItem>}
    {clearBrowsingData?.kind === 'dialog' && <CodexCuMenuItem disabled={clearBrowsingData.isOpening} onSelect={clearBrowsingData.onOpen}>{text('thread.browser.clearBrowsingData')}</CodexCuMenuItem>}
    {clearBrowsingData?.kind === 'submenu' && flyout(CODEX_BROWSER_OPTIONS_SUBMENUS.clearBrowsingData, text('thread.browser.clearBrowsingData'), <>
      <CodexCuMenuItem disabled={clearBrowsingData.isClearing} onSelect={() => clearBrowsingData.onClear('cookies')}>{text('thread.browser.clearCookies')}</CodexCuMenuItem>
      <CodexCuMenuItem disabled={clearBrowsingData.isClearing} onSelect={() => clearBrowsingData.onClear('cache')}>{text('thread.browser.clearCache')}</CodexCuMenuItem>
      <CodexCuMenuItem disabled={clearBrowsingData.isClearing} onSelect={() => clearBrowsingData.onClear('downloads')}>{text('settings.browserUse.browser.clearDownloads')}</CodexCuMenuItem>
    </>, clearBrowsingData.isClearing)}
    {onOpenBrowserSettings != null && <>{managers && <CodexCuMenuSeparator />}<CodexCuMenuItem onSelect={onOpenBrowserSettings}>{text('thread.browser.browserSettings')}</CodexCuMenuItem></>}
  </CodexCuMenuSurface>;
  return <CodexCuScope {...scopeProps}>{renderer({
    type: 'menu', kind: 'browser-options', open, onOpenChange, triggerButton, triggerRef,
    manageTrigger, openIntent, content, side: 'bottom', align: 'end', dir: direction,
    sideOffset: 1, collisionPadding: 6, loop: false, autoFocus: true, restoreFocus: true,
    onOpenAutoFocus,
    onCloseAutoFocus: event => {
      if (pendingExtensions.current) { pendingExtensions.current = false; event.preventDefault(); triggerRef?.current?.focus(); onOpenExtensions?.(); }
      onCloseAutoFocus?.(event);
    },
  })}</CodexCuScope>;
}
