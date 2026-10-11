import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CodexCuButton, CodexCuTooltip } from './codex-cu-primitives.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CODEX_CU_COPY } from './codex-cu-copy.mjs';
import { createCodexCuLayerRenderer } from './codex-cu-overlay.jsx';
import toolbarCss from './codex-annotation-toolbar.css';

// Ue / Bb(iWi → aWi → oWi), Codex 26.1007.21159 / 20052.
// Complete source spans, CSS and state contracts: results-annotation/layout/toolbar-manifest.json.
export const codexAnnotationToolbarCss = toolbarCss;
export const codexAnnotationToolbarUtilities = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cat-${value}`).join(' ');
const p = codexAnnotationToolbarUtilities;
const join = (...values) => values.filter(Boolean).join(' ');
const noSubscription = () => () => {};
const emptyObstacles = [];
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const copy = (key, locale = 'zh-CN', values = {}) => {
  const message = CODEX_CU_COPY[`thread.browser.tweaks.${key}`];
  let value = String(locale).toLowerCase().startsWith('zh') ? message.simplifiedChinese ?? message.english : message.english;
  value = value.replace(/\{count, plural, one \{([^{}]+)\} other \{([^{}]+)\}\}/g, (_, one, other) => (new Intl.PluralRules(locale).select(values.count) === 'one' ? one : other).replaceAll('#', new Intl.NumberFormat(locale).format(values.count)));
  return value.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
};
const normalizedOffset = (position, boundary) => position == null || boundary == null ? { x: 0, y: 0 } : { x: boundary.left + position.x * (boundary.right - boundary.left), y: boundary.top + position.y * (boundary.bottom - boundary.top) };
const constrainedOffset = (offset, boundary) => boundary == null ? offset : { x: clamp(offset.x, boundary.left, boundary.right), y: clamp(offset.y, boundary.top, boundary.bottom) };
const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// XUi/qUi/JUi: retain the original nearest clear candidate and restore preference.
export function resolveCodexAnnotationToolbarObstacles(toolbar, boundary, obstacles = [], restore) {
  if (!obstacles.some(obstacle => intersects(toolbar, obstacle))) return toolbar;
  const inside = point => point.x >= boundary.x && point.y >= boundary.y && point.x + toolbar.width <= boundary.x + boundary.width && point.y + toolbar.height <= boundary.y + boundary.height;
  if (restore && inside(restore) && !obstacles.some(obstacle => intersects(restore, obstacle))) return restore;
  let selected, distance = Infinity;
  const candidates = obstacles.flatMap(obstacle => [{ x: obstacle.x - toolbar.width, y: toolbar.y }, { x: obstacle.x + obstacle.width, y: toolbar.y }, { x: toolbar.x, y: obstacle.y - toolbar.height }, { x: toolbar.x, y: obstacle.y + obstacle.height }]).filter(inside);
  for (const candidate of candidates) {
    if (obstacles.some(obstacle => intersects({ ...toolbar, ...candidate }, obstacle))) continue;
    const squaredDistance = (candidate.x - toolbar.x) ** 2 + (candidate.y - toolbar.y) ** 2;
    if (squaredDistance < distance) { selected = candidate; distance = squaredDistance; }
  }
  return selected ?? toolbar;
}

// QUi: use only explicitly provided viewport obstacles, never host registries.
export function codexAnnotationToolbarVerticalAdjustment({ toolbar, obstacles = [], top, bottom, gap }) {
  const horizontal = obstacles.filter(obstacle => toolbar.left < obstacle.right && toolbar.right > obstacle.left);
  if (horizontal.every(obstacle => toolbar.bottom <= obstacle.top || toolbar.top >= obstacle.bottom)) return 0;
  const clear = y => y >= top && y + toolbar.height <= bottom && horizontal.every(obstacle => y + toolbar.height <= obstacle.top - gap || y >= obstacle.bottom + gap);
  const above = horizontal.map(obstacle => obstacle.top - gap - toolbar.height).filter(y => y < toolbar.top && clear(y));
  if (above.length) return Math.max(...above) - toolbar.top;
  const below = horizontal.map(obstacle => obstacle.bottom + gap).filter(y => y > toolbar.top && clear(y));
  return below.length ? Math.min(...below) - toolbar.top : 0;
}

const setRef = (ref, value) => { if (typeof ref === 'function') ref(value); else if (ref) ref.current = value; };

export function CodexAnnotationFloatingToolbar({ children, toolbarRef, tabIndex = -1, reducedMotion = false, attention = false,
  draggable = true, dragBoundary, obstacles, viewportObstacles = emptyObstacles, label, dragHandleDescription, dragHandleLabel,
  enterFromBottom = false, variant = 'annotation', focusOnDrag = true, position, onPositionChange,
  onDragActiveChange, renderMotion, renderDragHandle, resolvePosition, className, style, styleEnabled = false, ...toolbarProps }) {
  const containerRef = useRef(null), anchorRef = useRef(null), dragRef = useRef(null);
  const [geometry, setGeometry] = useState(null), [hasMoved, setHasMoved] = useState(false), [dragActive, setDragActive] = useState(false), [obstacleRevision, setObstacleRevision] = useState(0);
  const [correction, setCorrection] = useState({ x: 0, y: 0 });
  const offset = constrainedOffset(normalizedOffset(position, geometry?.drag), hasMoved ? geometry?.drag : geometry?.restore);
  let displayOffset = { x: offset.x + correction.x, y: offset.y + correction.y };
  if (obstacles == null && geometry) {
    const { anchor, drag, gap } = geometry;
    const toolbar = { x: anchor.x + displayOffset.x, y: anchor.y + displayOffset.y, width: anchor.width, height: anchor.height, left: anchor.x + displayOffset.x, right: anchor.x + displayOffset.x + anchor.width, top: anchor.y + displayOffset.y, bottom: anchor.y + displayOffset.y + anchor.height };
    displayOffset.y += codexAnnotationToolbarVerticalAdjustment({ toolbar, obstacles: geometry.obstacles, top: anchor.y + drag.top, bottom: anchor.y + anchor.height + drag.bottom, gap });
  }
  const latest = useRef(null);
  latest.current = { geometry, displayOffset, position, obstacles, resolvePosition, onPositionChange, hasMoved };

  function correctPosition(proposed, boundary, restoring = false) {
    if (!boundary) return proposed;
    const current = latest.current, root = containerRef.current, anchor = anchorRef.current;
    let adjusted = proposed;
    if (current.obstacles && root && anchor) {
      const rootBounds = root.getBoundingClientRect(), anchorBounds = anchor.getBoundingClientRect(), scaleX = rootBounds.width / root.clientWidth, scaleY = rootBounds.height / root.clientHeight;
      if (!(scaleX > 0 && scaleY > 0)) return proposed;
      const size = { width: anchorBounds.width / scaleX, height: anchorBounds.height / scaleY };
      const rects = current.obstacles.getRects().map(rect => ({ x: current.displayOffset.x + (rect.x - anchorBounds.x) / scaleX, y: current.displayOffset.y + (rect.y - anchorBounds.y) / scaleY, width: rect.width / scaleX, height: rect.height / scaleY }));
      adjusted = resolveCodexAnnotationToolbarObstacles({ ...proposed, ...size }, { x: boundary.left, y: boundary.top, width: boundary.right - boundary.left + size.width, height: boundary.bottom - boundary.top + size.height }, rects, restoring ? { ...current.displayOffset, ...size } : undefined);
    }
    adjusted = current.resolvePosition?.({ proposed, resolved: { x: adjusted.x, y: adjusted.y }, boundary, restoring, geometry: current.geometry }) ?? adjusted;
    setCorrection(previous => previous.x === adjusted.x - proposed.x && previous.y === adjusted.y - proposed.y ? previous : { x: adjusted.x - proposed.x, y: adjusted.y - proposed.y });
    return { x: adjusted.x, y: adjusted.y };
  }

  useEffect(() => (obstacles?.subscribe ?? noSubscription)(() => setObstacleRevision(value => value + 1)), [obstacles]);
  useLayoutEffect(() => {
    const root = containerRef.current, anchor = anchorRef.current;
    if (dragBoundary === null || !root || !anchor) return;
    const measure = () => {
      if (!root.clientWidth || !root.clientHeight) return;
      const margin = Math.max(0, (root.clientWidth - anchor.offsetWidth) / 2), full = { left: -margin, right: margin, top: -Math.max(0, root.clientHeight - anchor.offsetHeight), bottom: 0 }, drag = { ...full };
      const rootBounds = root.getBoundingClientRect(); if (!rootBounds.width || !rootBounds.height) return;
      const scaleX = rootBounds.width / root.clientWidth, scaleY = rootBounds.height / root.clientHeight, bounds = dragBoundary?.getBoundingClientRect() ?? rootBounds;
      if (dragBoundary) { drag.left += (bounds.left - rootBounds.left) / scaleX; drag.right += (bounds.right - rootBounds.right) / scaleX; drag.top += (bounds.top - rootBounds.top) / scaleY; drag.bottom = (bounds.bottom - rootBounds.bottom) / scaleY; }
      const next = { anchor: { x: (root.clientWidth - anchor.offsetWidth) / 2, y: root.clientHeight - anchor.offsetHeight, width: anchor.offsetWidth, height: anchor.offsetHeight }, obstacles: viewportObstacles.filter(rect => rect.left < bounds.right && rect.right > bounds.left && rect.top < bounds.bottom && rect.bottom > bounds.top).map(rect => ({ x: (rect.left - rootBounds.left) / scaleX, y: (rect.top - rootBounds.top) / scaleY, width: rect.width / scaleX, height: rect.height / scaleY, left: (rect.left - rootBounds.left) / scaleX, right: (rect.right - rootBounds.left) / scaleX, top: (rect.top - rootBounds.top) / scaleY, bottom: (rect.bottom - rootBounds.top) / scaleY })), gap: dragBoundary == null ? parseFloat(getComputedStyle(root).bottom) : 0, drag, restore: { left: Math.max(full.left, drag.left), right: Math.min(full.right, drag.right), top: drag.top, bottom: drag.bottom } };
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      correctPosition(constrainedOffset(normalizedOffset(latest.current.position, drag), latest.current.hasMoved ? drag : next.restore), drag, true);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(root); observer.observe(anchor); if (dragBoundary) observer.observe(dragBoundary);
    return () => observer.disconnect();
  }, [dragBoundary, obstacles, obstacleRevision, viewportObstacles, position, reducedMotion]);

  function move(proposed) {
    const { geometry: bounds, displayOffset: current, position: normalized } = latest.current;
    if (!bounds?.drag) return;
    const value = constrainedOffset(proposed, bounds.drag);
    if (value.x === current.x && value.y === current.y) return;
    correctPosition(value, bounds.drag); setHasMoved(true);
    onPositionChange?.({ x: bounds.drag.right === bounds.drag.left ? normalized?.x ?? .5 : (value.x - bounds.drag.left) / (bounds.drag.right - bounds.drag.left), y: bounds.drag.bottom === bounds.drag.top ? normalized?.y ?? 1 : (value.y - bounds.drag.top) / (bounds.drag.bottom - bounds.drag.top) });
  }
  function keyboardMove(event) {
    const current = latest.current.displayOffset;
    const positions = { ArrowLeft: { ...current, x: current.x - 10 }, ArrowRight: { ...current, x: current.x + 10 }, ArrowUp: { ...current, y: current.y - 10 }, ArrowDown: { ...current, y: current.y + 10 }, Home: { x: 0, y: 0 } };
    if (!positions[event.key]) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Home') { setHasMoved(false); correctPosition(constrainedOffset(positions.Home, latest.current.geometry?.restore), latest.current.geometry?.drag); if (latest.current.position != null) onPositionChange?.(null); }
    else move(positions[event.key]);
  }
  function pointerDown(event) {
    const root = containerRef.current; if (!event.isPrimary || event.button !== 0 || !root || !onPositionChange) return;
    const bounds = root.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
    event.preventDefault(); if (focusOnDrag ?? variant !== 'annotation') event.currentTarget.focus();
    dragRef.current = { pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, scaleX: bounds.width / root.clientWidth, scaleY: bounds.height / root.clientHeight, startOffset: latest.current.displayOffset };
    event.currentTarget.setPointerCapture?.(event.pointerId); setDragActive(true); onDragActiveChange?.(true);
  }
  function pointerMove(event) {
    const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); move({ x: drag.startOffset.x + (event.clientX - drag.startClientX) / drag.scaleX, y: drag.startOffset.y + (event.clientY - drag.startClientY) / drag.scaleY });
  }
  function pointerEnd(event) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null; setDragActive(false); onDragActiveChange?.(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const dragHandleProps = { className: p('cursor-grab touch-none active:cursor-grabbing'), 'aria-description': dragHandleDescription, 'aria-label': dragHandleLabel, color: 'ghostSecondary', size: 'dragHandle', onKeyDown: keyboardMove, onLostPointerCapture: pointerEnd, onPointerCancel: pointerEnd, onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerEnd };
  let content = typeof children === 'function' ? children(dragActive) : children;
  if (draggable) content = <div {...toolbarProps} ref={node => setRef(toolbarRef, node)} className={join(p('pointer-events-auto flex max-w-full items-center rounded-xl bg-surface-elevated-secondary text-default shadow-lg select-none', variant === 'annotation' ? 'p-1.5' : 'p-0.5', variant === 'annotation' && '_annotationTheme_7bp1p_6', attention && !reducedMotion && '_attention_7bp1p_11'), className)} aria-label={label} data-theme="dark" role="toolbar" tabIndex={tabIndex}>{renderDragHandle ? renderDragHandle(dragHandleProps) : <CodexCuButton {...dragHandleProps}><CodexCuIcon name="shared:wdr" /></CodexCuButton>}<div className={p('-m-0.5 flex min-w-0 items-center overflow-x-auto p-0.5')}>{content}</div></div>;
  const motion = renderMotion ? renderMotion({ children: content, enterFromBottom, reducedMotion, initial: enterFromBottom && position == null && !reducedMotion ? { opacity: 0 } : false, onFocusCapture: toolbarProps.onFocusCapture, onPointerDownCapture: toolbarProps.onPointerDownCapture, className: p('max-w-full') }) : <div className={p('max-w-full')}>{content}</div>;
  return <>{styleEnabled && <style>{toolbarCss}</style>}<div ref={containerRef} className={join('codex-annotation-floating-toolbar', p('pointer-events-none absolute inset-4 z-40 flex items-end justify-center', variant === 'annotation' && '_annotationAccent_7bp1p_1'))} style={style}><div ref={anchorRef} className={p('max-w-full')} style={{ transform: `translate(${displayOffset.x}px, ${displayOffset.y}px)` }}>{motion}</div></div></>;
}

export function CodexAnnotationToolbar({ toolbarRef, floating = true, displayUrl = '', reducedMotion = false,
  hasPendingAnnotations = false, hasQueuedTweaks = false, isAddModifierPressed = false, isOriginalViewEnabled = false,
  isSuspended = false, isSubmitAvailable, markersVisible = true, pendingAnnotationCount = 0, screenshotButton,
  onAddToComposer, onDiscard, onExit, onOriginalViewBlur, onOriginalViewKeyDown, onOriginalViewKeyUp,
  onOriginalViewPointerCancel, onOriginalViewPointerDown, onOriginalViewPointerUp, onSubmit, onToggleMarkers,
  loading, onLoadingChange, position, onPositionChange, floatingToolbarProps, tooltipProps, tooltipPortalContainer,
  locale = 'zh-CN', className, styleEnabled = false, ...props }) {
  const [submitting, setSubmitting] = useState(false), [localPosition, setLocalPosition] = useState(null);
  const renderTooltip = useMemo(() => tooltipProps?.renderLayer ?? (tooltipPortalContainer ? createCodexCuLayerRenderer({ portalContainer: tooltipPortalContainer }) : undefined), [tooltipProps?.renderLayer, tooltipPortalContainer]);
  const setLoading = value => { if (loading === undefined) setSubmitting(value); onLoadingChange?.(value); };
  const actualPosition = position === undefined ? localPosition : position;
  const updatePosition = value => { if (position === undefined) setLocalPosition(value); onPositionChange?.(value); };
  const exitLabel = copy('exitAnnotations', locale), discardLabel = copy('discardAnnotations', locale), markerLabel = copy(markersVisible ? 'hideMarkers' : 'showMarkers', locale), originalLabel = copy('holdToViewOriginal', locale);
  const tip = (label, child) => <CodexCuTooltip {...tooltipProps} renderLayer={renderTooltip} tooltipContent={label}>{child}</CodexCuTooltip>;
  const exit = tip(exitLabel, <CodexCuButton aria-label={exitLabel} color="ghostActive" size="toolbar" uniform onClick={onExit}><CodexCuIcon name="shared:Cot" /></CodexCuButton>);
  const discard = tip(discardLabel, <CodexCuButton aria-label={discardLabel} color={hasPendingAnnotations ? 'ghostActive' : 'ghost'} size="toolbar" uniform disabled={!hasPendingAnnotations} onClick={onDiscard}><CodexCuIcon name="shared:lot" /></CodexCuButton>);
  const markers = tip(markerLabel, <CodexCuButton aria-label={markerLabel} aria-pressed={markersVisible === false} color={markersVisible === false ? 'tinted' : 'ghostActive'} size="toolbar" uniform disabled={!hasPendingAnnotations} onClick={onToggleMarkers}><CodexCuIcon name="shared:mft" /></CodexCuButton>);
  const original = tip(originalLabel, <CodexCuButton aria-label={originalLabel} aria-pressed={isOriginalViewEnabled} color={hasQueuedTweaks ? 'ghostActive' : 'ghost'} size="toolbar" title={originalLabel} uniform disabled={!hasQueuedTweaks} onBlur={onOriginalViewBlur} onKeyDown={onOriginalViewKeyDown} onKeyUp={onOriginalViewKeyUp} onPointerCancel={onOriginalViewPointerCancel} onPointerDown={onOriginalViewPointerDown} onPointerUp={onOriginalViewPointerUp}><span className={p('inline-flex items-center justify-center transition-transform duration-basic motion-reduce:transition-none', isOriginalViewEnabled && 'scale-[0.8]')}><CodexCuIcon name={isOriginalViewEnabled ? 'tweaks:Re' : 'tweaks:Ve'} className={p('icon-sm')} /></span></CodexCuButton>);
  const sendLabel = pendingAnnotationCount ? copy('sendPendingAnnotationCount', locale, { count: pendingAnnotationCount }) : undefined;
  const send = <CodexCuButton aria-label={sendLabel} color={floating ? 'accent' : 'primary'} className={floating ? undefined : p('!border-transparent !bg-chart-blue !text-white enabled:hover:!bg-chart-blue/90 data-[state=open]:!bg-chart-blue/90')} size="toolbar" disabled={!hasPendingAnnotations || !isAddModifierPressed && isSubmitAvailable === false} loading={loading ?? submitting} onClick={() => { if (isAddModifierPressed) { onAddToComposer?.(); return; } const result = onSubmit?.(); if (result != null && typeof result.then === 'function') { setLoading(true); result.then(() => setLoading(false), () => setLoading(false)); } }}>{copy('send', locale)}{!floating && sendLabel && <span className={p('ms-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-black/25 px-1 disambiguated-digits text-[10px] leading-4 font-semibold')}>{pendingAnnotationCount}</span>}</CodexCuButton>;
  const suspended = <span aria-hidden={!isSuspended} className={p('inline-flex shrink-0 cursor-default items-center', floating ? 'col-start-1 row-start-1 justify-self-center text-default' : 'text-chart-blue transition-opacity duration-basic no-drag motion-reduce:transition-none', floating && !isSuspended && 'invisible', isSuspended ? 'opacity-100' : 'pointer-events-none opacity-0')}><CodexCuTooltip {...tooltipProps} renderLayer={renderTooltip} delayOpen disabled={!isSuspended} tooltipContent={copy('spaceHeldTooltip', locale)}><kbd className={p('inline-flex !border-0 !font-sans !shadow-none !rounded-md !bg-current/10 !text-xs !text-current !px-1.5 !py-0.5 !leading-none')}><span className={p('flex items-center gap-1')}><CodexCuIcon name="shared:Ud" />{copy('spaceHeld', locale)}</span></kbd></CodexCuTooltip></span>;
  if (!floating) {
    const title = isOriginalViewEnabled ? copy('originalTitle', locale, { url: displayUrl }) : copy('annotatingTitle', locale, { url: displayUrl });
    const match = title.match(/^(.*?)<status>(.*?)<\/status>(.*)$/s);
    return <>{styleEnabled && <style>{toolbarCss}</style>}<div {...props} ref={node => setRef(toolbarRef, node)} className={join('codex-annotation-toolbar', p('draggable grid h-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 text-default', isSuspended ? 'bg-surface-secondary' : 'bg-[color-mix(in_srgb,var(--color-surface)_82%,var(--color-chart-blue)_18%)]'), className)}><div className={p('flex items-center gap-1.5 no-drag')}>{exit}{discard}</div><div className={p('flex min-w-0 items-center justify-center gap-1.5 text-sm select-none')}>{suspended}<span className={p('min-w-0 truncate')}>{match ? <>{match[1]}<span className={isSuspended ? p('text-secondary') : undefined}>{match[2]}</span>{match[3]}</> : title}</span></div><div className={p('flex items-center gap-3 justify-self-end no-drag')}>{screenshotButton}{markers}{original}{send}</div></div></>;
  }
  return <>{styleEnabled && <style>{toolbarCss}</style>}<CodexAnnotationFloatingToolbar {...floatingToolbarProps} {...props} toolbarRef={toolbarRef} tabIndex={-1} focusOnDrag reducedMotion={reducedMotion} variant="annotation" label={copy('toolbarLabel', locale)} dragHandleLabel={copy('moveToolbar', locale)} dragHandleDescription={copy('moveToolbarDescription', locale)} position={actualPosition} onPositionChange={updatePosition} className={className}><div className={p('flex min-w-0 items-center gap-1.5 no-drag')}><div className={p('flex shrink-0 items-center px-2 text-sm select-none')}><span className={p('grid min-w-0 items-center')}>{suspended}<span aria-hidden={isSuspended} className={p('col-start-1 row-start-1 truncate', isSuspended && 'invisible')}>{pendingAnnotationCount ? copy('annotatingCount', locale, { count: pendingAnnotationCount }) : copy('annotatingStatus', locale)}</span></span></div><div className={p('flex shrink-0 items-center gap-1.5')}>{screenshotButton}{markers}{original}{discard}{send}{exit}</div></div></CodexAnnotationFloatingToolbar></>;
}

export default CodexAnnotationToolbar;
