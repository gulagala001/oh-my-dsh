import React, { useLayoutEffect, useRef, useState } from 'react';
import { codexCloudComputerBackground } from './codex-cu-assets.mjs';
import { CodexCuButton, CodexCuSpinner } from './codex-cu-primitives.jsx';
import { CODEX_CU_COPY } from './codex-cu-copy.mjs';

// Packed Codex cloud-browser-* modules, exact offsets/SHA: cloud-browser/manifest.json.
// Transport, account gates, screenshot resolution and peer control remain host inputs.
// CSS is injected with the host's combined Codex stylesheet; it has no side-effect import here.
const p = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `ccbru-${value}`).join(' ');
const join = (...values) => values.filter(Boolean).join(' ');
export const cloudBrowserDefaultLabels = {
  takeControl: 'Click anywhere to use the browser', ariaLabel: 'Live cloud browser',
  connecting: 'Connecting to cloud browser…', unavailable: 'Cloud browser is unavailable',
  retry: 'Retry', tabUnavailable: 'This browser tab is no longer available',
  timeline: 'Cloud browser activity timeline', sites: 'Sites',
  loading: 'Loading browser screenshot', loadFailed: 'Couldn’t load browser screenshot',
  open: 'Open cloud browser', live: 'LIVE',
};
export const cloudBrowserLabelIds = {
  takeControl: 'chatgptConversations.cloudBrowser.liveView.takeControl',
  ariaLabel: 'chatgptConversations.cloudBrowser.liveView.ariaLabel',
  connecting: 'chatgptConversations.cloudBrowser.liveView.connecting',
  unavailable: 'chatgptConversations.cloudBrowser.liveView.unavailable',
  retry: 'chatgptConversations.cloudBrowser.liveView.retry',
  tabUnavailable: 'chatgptConversations.cloudBrowser.liveView.tabUnavailable',
  timeline: 'chatgptConversations.cloudBrowser.preview.timeline',
  sites: 'chatgptConversations.cloudBrowser.preview.sites',
  loading: 'chatgptConversations.cloudBrowser.preview.loading',
  loadFailed: 'chatgptConversations.cloudBrowser.preview.loadFailed',
  open: 'chatgptConversations.cloudBrowser.preview.open',
  live: 'chatgptConversations.cloudBrowser.sidePanel.live',
};
export function getCodexCloudBrowserLabels(locale) {
  const field = locale === 'zh-CN' ? 'simplifiedChinese' : 'english';
  return Object.fromEntries(Object.entries(cloudBrowserLabelIds).map(([key, id]) => [key, CODEX_CU_COPY[id]?.[field] ?? cloudBrowserDefaultLabels[key]]));
}
const copy = labels => ({ ...cloudBrowserDefaultLabels, ...labels });
const assetPointer = screenshot => screenshot?.image_asset_pointer?.asset_pointer;
const hostname = screenshot => {
  if (screenshot?.page_url == null) return undefined;
  try { const url = new URL(screenshot.page_url); return ['http:', 'https:'].includes(url.protocol) ? url.hostname.replace(/^www\./, '') || undefined : undefined; }
  catch { return undefined; }
};
const screenshotLabel = screenshot => { const value = hostname(screenshot); return value === 'terminal.local' ? undefined : value; };
const isSites = screenshot => {
  if (screenshot?.page_url == null) return false;
  try { const url = new URL(screenshot.page_url); return ['http:', 'https:'].includes(url.protocol) && url.host === 'terminal.local:4173'; }
  catch { return false; }
};
export function cloudBrowserTimelineMarkers(screenshots) {
  if (screenshots.length <= 10) return screenshots.map((_, index) => index);
  const markers = [0]; let previous = hostname(screenshots[0]);
  for (let index = 1; index < screenshots.length; index += 1) { const value = hostname(screenshots[index]); if (value != null && value !== previous) { markers.push(index); previous = value; } }
  const last = screenshots.length - 1; if (markers.at(-1) !== last) markers.push(last); return markers;
}

export function CodexCloudBrowserControlOverlay({ onActivate, label, labels }) {
  return <button className={p('absolute inset-0 cursor-interaction bg-transparent')} type="button" onClick={onActivate}>
    <span className={p('pointer-events-none absolute inset-x-0 top-full flex h-12 items-center justify-center px-4 text-center text-sm select-none')}>
      <span className={p('rounded-md bg-media-background/50 px-2 py-1 text-media-foreground')}>{label ?? copy(labels).takeControl}</span>
    </span>
  </button>;
}

export function CodexCloudBrowserUnavailable({ onRetry, labels }) {
  const text = copy(labels);
  return <div className={p('flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-surface text-sm text-secondary select-none')} role="status">
    {text.unavailable}{onRetry == null ? null : <CodexCuButton color="secondary" onClick={onRetry}>{text.retry}</CodexCuButton>}
  </div>;
}

// Local means a cloud handoff displayed in the desktop host, never the local Browser tool.
export function CodexLocalCloudBrowserLiveView({ targetTabId, identityAvailable,
  handoffSrc, isPending = true, isError = false, isLoaded = false, isControlActivated = false,
  onControlActivation, onRetry, onFrameLoad, fallback, backgroundSrc = codexCloudComputerBackground, renderFrame, labels }) {
  const text = copy(labels);
  if (targetTabId != null) return fallback ?? null;
  if (!identityAvailable) return <CodexCloudBrowserUnavailable labels={labels} />;
  if (isError) return <CodexCloudBrowserUnavailable labels={labels} onRetry={onRetry} />;
  if (!isPending && handoffSrc == null) return fallback ?? null;
  const frameProps = {
    ref: node => { if (isControlActivated) node?.focus(); }, className: p('size-full rounded-xl border-0'),
    'data-dd-privacy': 'hidden', inert: !isControlActivated ? '' : undefined, src: handoffSrc,
    tabIndex: isControlActivated ? undefined : -1, title: text.ariaLabel,
    allow: 'clipboard-read; clipboard-write', referrerPolicy: 'no-referrer', onLoad: onFrameLoad,
  };
  return <div className={p('relative flex min-h-0 flex-1 bg-surface px-4 py-12')} data-codex-cloud-browser="true">
    {backgroundSrc != null && <img aria-hidden="true" className={p('pointer-events-none absolute inset-0 size-full object-cover')} alt="" draggable={false} src={backgroundSrc} />}
    <div className={p('relative min-h-0 flex-1')}>
      {handoffSrc == null ? null : renderFrame ? renderFrame(frameProps) : <iframe {...frameProps} />}
      {(isPending || !isLoaded) && <>
        {backgroundSrc != null && <img alt="" className={p('pointer-events-none absolute inset-0 size-full rounded-xl object-cover')} draggable={false} src={backgroundSrc} />}
        <div className={p('pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-media-foreground/70')} role="status">
          <CodexCuSpinner className={p('icon-sm')} />{text.connecting}
        </div>
      </>}
      {handoffSrc != null && !isControlActivated && <CodexCloudBrowserControlOverlay labels={labels} onActivate={onControlActivation} />}
      <div aria-hidden="true" className={p('pointer-events-none absolute inset-0 rounded-xl ring-1 ring-border ring-inset')} />
    </div>
  </div>;
}

export function CodexCloudBrowserLiveView({ serverConversationId, connectionState = 'connecting',
  streamAspectRatio, frame, backgroundSrc = codexCloudComputerBackground, isControlActivated = false, onControlActivation,
  onRequestControlMode, controlLabel, connectionErrorLabel, labels, videoRef, videoProps, renderVideo }) {
  const text = copy(labels), localVideo = useRef(null);
  const unavailable = ['connection-error', 'handoff-error'].includes(connectionState) || serverConversationId == null;
  const streaming = connectionState === 'streaming';
  const aspectRatio = (streaming ? streamAspectRatio : null) ?? frame?.aspectRatio ?? streamAspectRatio ?? 4 / 3;
  const setVideo = node => { localVideo.current = node; if (typeof videoRef === 'function') videoRef(node); else if (videoRef) videoRef.current = node; };
  const sourceVideoProps = {
    ...videoProps, ref: setVideo, 'aria-label': text.ariaLabel,
    className: p('relative size-full rounded-xl object-contain transition-opacity duration-relaxed ease-enter focus-visible:outline-none motion-reduce:transition-none'),
    autoPlay: true, muted: true, playsInline: true, tabIndex: 0,
    onPointerDown: event => { event.currentTarget.focus(); videoProps?.onPointerDown?.(event); if (isControlActivated) onRequestControlMode?.(); },
  };
  const error = connectionState === 'handoff-error' ? text.tabUnavailable : connectionErrorLabel ?? text.unavailable;
  return <div className={join('ccbr-viewport', p('relative flex min-h-0 flex-1 items-center justify-center bg-surface px-4 py-12'))} data-codex-cloud-browser="true">
    {backgroundSrc != null && <img aria-hidden="true" className={p('pointer-events-none absolute inset-0 size-full object-cover')} alt="" draggable={false} src={backgroundSrc} />}
    <div className={join('ccbr-video-frame', p('relative'))} data-streaming={streaming || undefined}
      style={{ width: `min(100cqw, ${100 * aspectRatio}cqh)`, height: `min(100cqh, ${100 / aspectRatio}cqw)` }}>
      {frame == null ? null : <img aria-hidden="true" className={p('pointer-events-none absolute inset-0 size-full rounded-xl object-contain')} alt="" data-dd-privacy="hidden" draggable={false} src={frame.src} />}
      {renderVideo ? renderVideo(sourceVideoProps) : <video {...sourceVideoProps} />}
      {unavailable ? <div className={p('absolute inset-0 flex items-center justify-center rounded-xl text-sm', frame == null ? 'bg-surface text-secondary' : 'bg-media-background/50 text-media-foreground')}>{error}</div>
        : <div aria-hidden={streaming} className={join('ccbr-loading-overlay', p('absolute inset-0 flex items-center justify-center gap-2 rounded-xl text-sm text-media-foreground/70 duration-relaxed ease-enter motion-reduce:transition-none', frame != null && 'bg-media-background/50'))} role="status">
          <CodexCuSpinner className={p('icon-sm')} />{text.connecting}
        </div>}
      {!unavailable && !isControlActivated && <CodexCloudBrowserControlOverlay label={controlLabel} labels={labels} onActivate={() => { onControlActivation?.(); localVideo.current?.focus(); onRequestControlMode?.(); }} />}
    </div>
  </div>;
}

// The default is the source Radix horizontal single-thumb DOM. Host callbacks drive replay.
// renderTimeline may supply the host's Radix implementation with these same visual props.
export function CodexCloudBrowserTimeline({ max, value, markers, variant, onSelect, labels, renderTimeline }) {
  const text = copy(labels), [pointerDown, setPointerDown] = useState(false), pointerStart = useRef(null), thumb = useRef(null);
  const [thumbSize, setThumbSize] = useState(0);
  useLayoutEffect(() => { const node = thumb.current; if (!node) return; const update = () => setThumbSize(node.offsetWidth); update(); if (typeof ResizeObserver === 'undefined') return; const observer = new ResizeObserver(update); observer.observe(node); return () => observer.disconnect(); }, []);
  const percent = Math.min(100, Math.max(0, 100 / max * value));
  const rootProps = { className: p('relative flex h-6 w-full touch-none items-center'), dir: 'ltr',
    max, min: 0, step: 1, value: [value],
    onBlur: () => setPointerDown(false), onKeyDown: () => setPointerDown(false),
    onPointerDown: () => setPointerDown(true), onValueChange: values => { if (values[0] != null) onSelect?.(values[0]); } };
  const trackProps = { className: p('relative h-2 grow cursor-interaction rounded-full', variant === 'compact' ? 'bg-media-foreground/40' : 'bg-border') };
  const rangeProps = { className: p('absolute h-full rounded-full', variant === 'compact' ? 'bg-media-foreground/90' : 'bg-text') };
  const thumbProps = { 'aria-label': text.timeline, className: p('block size-4 cursor-interaction rounded-full border border-default shadow-md transition-transform duration-basic focus-visible:outline-none active:scale-110 motion-reduce:transition-none', variant === 'compact' ? 'bg-media-foreground' : 'bg-surface', !pointerDown && 'focus-visible:ring-2 focus-visible:ring-ring') };
  const markerNodes = <span aria-hidden="true" className={p('pointer-events-none absolute inset-x-2 top-1/2')}>
    {markers.map(index => <span key={index} className={p('absolute size-1 -translate-x-1/2 -translate-y-1/2 rounded-full', variant === 'compact' ? 'bg-media-foreground/75' : 'bg-text/50')} style={{ left: `${index / max * 100}%` }} />)}
  </span>;
  if (renderTimeline) return renderTimeline({ rootProps, trackProps, rangeProps, thumbProps, markerNodes });
  const selectPointer = event => { const bounds = pointerStart.current; if (bounds) onSelect?.(Math.min(max, Math.max(0, Math.round((event.clientX - bounds.left) / bounds.width * max)))); };
  const inBoundsOffset = thumbSize / 2 - thumbSize * percent / 100;
  return <span className={rootProps.className} dir="ltr" data-orientation="horizontal" style={{ '--radix-slider-thumb-transform': 'translateX(-50%)' }}
    onBlur={rootProps.onBlur} onKeyDown={event => {
      rootProps.onKeyDown(); const key = event.key, backward = ['PageDown', 'ArrowDown', 'ArrowLeft'].includes(key), forward = ['PageUp', 'ArrowUp', 'ArrowRight'].includes(key);
      if (key === 'Home' || key === 'End' || backward || forward) { event.preventDefault(); const step = ['PageUp', 'PageDown'].includes(key) || event.shiftKey ? 10 : 1; onSelect?.(key === 'Home' ? 0 : key === 'End' ? max : Math.min(max, Math.max(0, value + (backward ? -step : step)))); }
    }} onPointerDown={event => {
      rootProps.onPointerDown(); event.target.setPointerCapture(event.pointerId); event.preventDefault(); pointerStart.current = event.currentTarget.getBoundingClientRect();
      if (event.target === thumb.current) thumb.current.focus({ preventScroll: true }); else selectPointer(event);
    }} onPointerMove={event => { if (event.target.hasPointerCapture(event.pointerId)) selectPointer(event); }}
    onPointerUp={event => { if (event.target.hasPointerCapture(event.pointerId)) { event.target.releasePointerCapture(event.pointerId); pointerStart.current = null; } }}>
    <span {...trackProps} data-orientation="horizontal">{markerNodes}<span {...rangeProps} data-orientation="horizontal" style={{ left: '0%', right: `${100 - percent}%` }} /></span>
    <span style={{ transform: 'var(--radix-slider-thumb-transform)', position: 'absolute', left: `calc(${percent}% + ${inBoundsOffset}px)` }}>
      <span {...thumbProps} ref={thumb} role="slider" aria-valuemin={0} aria-valuenow={value} aria-valuemax={max} aria-orientation="horizontal" data-orientation="horizontal" tabIndex={0} />
    </span>
  </span>;
}

// decodedFrames retains the prior screenshot until the selected asset has decoded.
// It has the original shape { current: { screenshot, src }, previous: { screenshot, src } }.
export function CodexCloudBrowserPreview({ screenshots = [], selection = { mode: 'live' },
  browserOwnerConversationId, decodedFrames, imageError = false, liveView, onOpen,
  onSelectionChange, variant = 'compact', labels, renderTimeline }) {
  const text = copy(labels);
  const selectedIndex = selection.mode === 'live' ? screenshots.length - 1 : screenshots.findIndex(screenshot => assetPointer(screenshot) === selection.selectedAssetPointer);
  const activeIndex = selectedIndex < 0 ? screenshots.length - 1 : selectedIndex;
  const activeScreenshot = screenshots[activeIndex], owner = activeScreenshot?.browser_conversation_id ?? browserOwnerConversationId;
  const hasScreenshot = activeScreenshot != null && owner != null, isLive = selection.mode === 'live';
  const liveButton = variant === 'expanded' ? <CodexCuButton className={p('relative')} aria-pressed={isLive} color={isLive ? 'primary' : 'secondary'} size="compact" onClick={() => onSelectionChange?.({ mode: 'live' })}>{text.live}</CodexCuButton> : null;
  if ((!hasScreenshot || screenshots.length === 0) && variant === 'compact') return liveView ?? liveButton;
  const snapshot = liveView == null ? decodedFrames?.current?.screenshot : activeScreenshot;
  const domain = screenshotLabel(snapshot), sites = isSites(snapshot), summary = variant === 'expanded' ? snapshot?.tool_summary : undefined;
  const imageLoading = !imageError && assetPointer(snapshot) !== assetPointer(activeScreenshot);
  const max = screenshots.length - Number(variant === 'compact');
  const timeline = hasScreenshot && max > 0 ? <CodexCloudBrowserTimeline max={max} value={variant === 'expanded' && isLive ? max : activeIndex} markers={cloudBrowserTimelineMarkers(screenshots)} variant={variant} labels={labels} renderTimeline={renderTimeline}
    onSelect={index => { if (index === screenshots.length || variant === 'compact' && index === screenshots.length - 1) onSelectionChange?.({ mode: 'live' }); else if (screenshots[index] != null) onSelectionChange?.({ mode: 'replay', selectedAssetPointer: assetPointer(screenshots[index]) }); }} /> : null;
  const meta = hasScreenshot && !(variant === 'expanded' && isLive) && (domain != null || sites || summary != null) ?
    <div className={join('ccbr-hostname', p('pointer-events-none absolute start-2 end-2 bottom-2 flex min-w-0 transition-transform duration-relaxed ease-enter motion-reduce:transition-none'))}>
      <span className={p('flex min-w-0 items-center rounded-md bg-media-background/50 px-2 py-1 text-xs font-medium text-media-foreground/70 shadow-sm')}>
        <span className={p('flex min-w-0 items-center gap-2')}>
          {domain != null || sites ? <span className={p('truncate')}>{sites ? text.sites : domain}</span> : null}
          {summary == null ? null : <>{domain != null || sites ? <span aria-hidden="true" className={p("before:content-['·']")} /> : null}<span className={p('truncate text-media-foreground')}>{summary}</span></>}
        </span>
        {imageLoading ? <span key={assetPointer(activeScreenshot)} aria-label={text.loading} className={join('ccbr-loading', p('flex w-0 shrink-0 overflow-hidden text-media-foreground'))} role="status"><CodexCuSpinner className={p('icon-2xs')} /></span> : null}
      </span>
    </div> : null;
  return <div className={join('ccbr-preview', p('relative flex min-h-0 min-w-0 flex-col select-none', variant === 'compact' ? 'w-full rounded-xl' : 'h-full'))} data-has-timeline={timeline != null || undefined} data-variant={variant}>
    <div className={join('ccbr-surface', p('relative flex min-h-0 flex-1 flex-col overflow-clip bg-surface', variant === 'compact' && 'border border-default'))}>
      <div className={p(variant === 'compact' ? 'absolute inset-0' : ['relative flex min-h-0 flex-1', liveView == null && 'm-4 overflow-hidden rounded-xl'])}>
        {liveView ?? (hasScreenshot && (decodedFrames == null ? <div className={p('absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-secondary')} role="status">{imageError ? text.loadFailed : <CodexCuSpinner className={p('icon-sm')} />}</div>
          : [decodedFrames.previous, decodedFrames.current].map(frame => frame == null ? null : <img key={assetPointer(frame.screenshot)} alt="" className={p('absolute inset-0 size-full', variant === 'compact' ? 'object-cover object-top' : 'bg-surface object-contain')} decoding="async" draggable={false} src={frame.src} />)))}
        {onOpen == null || liveView != null ? null : <button aria-label={text.open} className={p('absolute inset-0 cursor-interaction focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset')} type="button" onClick={() => { if (activeIndex === screenshots.length - 1) onSelectionChange?.({ mode: 'live' }); onOpen(); }} />}
        {variant === 'expanded' && liveView == null ? <div aria-hidden="true" className={p('pointer-events-none absolute inset-0 rounded-xl ring-1 ring-border ring-inset')} /> : null}
      </div>
      <div className={p(variant === 'expanded' ? ['relative shrink-0', hasScreenshot && 'h-16'] : 'contents')}>
        {(hasScreenshot || liveView == null) && (timeline == null ? liveButton : <div className={join(variant === 'compact' && 'ccbr-controls', p('absolute inset-x-0 bottom-0 flex min-w-0 items-center gap-2 px-4 pb-2', variant === 'compact' ? 'text-media-foreground' : 'text-default'))}>
          <div className={p('min-w-0 flex-1')}>{timeline}</div>{liveButton}
        </div>)}{meta}
      </div>
    </div>
  </div>;
}

export function CodexCloudBrowserSidePanel({ renderSlots, ...props }) {
  const content = <CodexCloudBrowserPreview {...props} variant="expanded" />;
  return renderSlots ? renderSlots({ headerRows: [], content }) : content;
}
