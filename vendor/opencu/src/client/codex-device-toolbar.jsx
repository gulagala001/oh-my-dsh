import React from 'react';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuMenuItem, CodexCuMenuCheckboxItem, CodexCuTooltip } from './codex-cu-primitives.jsx';
import './codex-device-toolbar.css';

// Visual source: options-menu-view ii/ui/di/fi/pi; exact references are in
// work/rea-reconstruction/device-toolbar/source-index.json and manifest.json.
const p = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cdt-${value}`).join(' ');
const join = (...values) => values.filter(Boolean).join(' ');

// Kzi + g9 in app-shared; this is the shipped order and sizing metadata.
export const CODEX_DEVICE_PRESETS = Object.freeze([
  { id: 'responsive', label: 'Responsive', width: 390, height: 844 },
  { id: '4k', label: '4K', width: 2560, height: 1440 },
  { id: 'laptop-l', label: 'Laptop L', width: 1440, height: 900 },
  { id: 'laptop', label: 'Laptop', width: 1024, height: 768 },
  { id: 'surface-pro-7', label: 'Surface Pro 7', width: 912, height: 1368 },
  { id: 'ipad-air', label: 'iPad Air', width: 820, height: 1180 },
  { id: 'ipad-mini', label: 'iPad Mini', width: 768, height: 1024 },
  { id: 'surface-duo', label: 'Surface Duo', width: 540, height: 720 },
  { id: 'iphone-15-pro-max', label: 'iPhone 15 Pro Max', width: 430, height: 932 },
  { id: 'pixel-8', label: 'Pixel 8', width: 412, height: 915 },
  { id: 'iphone-15-pro', label: 'iPhone 15 Pro', width: 393, height: 852 },
  { id: 'samsung-galaxy-s24-ultra', label: 'Samsung Galaxy S24 Ultra', width: 384, height: 824 },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667 },
].map(Object.freeze));
export const CODEX_DEVICE_ZOOM_PERCENTAGES = Object.freeze([50, 75, 100, 125, 150, 200]);

const labels = {
  dimensions: 'Dimensions:', width: 'Viewport width', height: 'Viewport height',
  zoom: 'Browser zoom', rotate: 'Rotate viewport', close: 'Exit device toolbar mode',
  resizeLeft: 'Resize device viewport from the left edge',
  resizeRight: 'Resize device viewport from the right edge',
  resizeBottom: 'Resize device viewport from the bottom edge',
  resizeBottomLeft: 'Resize device viewport from the bottom-left corner',
  resizeBottomRight: 'Resize device viewport from the bottom-right corner',
};
const selectClass = 'h-7 cursor-interaction rounded-md border border-transparent bg-transparent px-1 text-sm font-medium text-codex-description outline-none [color-scheme:light] hover:bg-primary-ghost-hover focus:bg-primary-ghost-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0';
const iconButtonClass = 'flex size-7 shrink-0 cursor-interaction items-center justify-center rounded-md text-codex-description outline-none hover:bg-primary-ghost-hover hover:text-default focus:bg-primary-ghost-hover focus:text-default focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0';

function DimensionInput({ field, value, draft, label, min, disabled, onDraftChange, onFocus, onBlur, onKeyDown }) {
  return <input aria-label={label} min={min} max={4096} type="number" disabled={disabled} value={draft ?? String(value)}
    className={p('h-6 w-[72px] rounded-lg border border-transparent bg-text/5 px-2 text-center text-sm font-semibold text-default tabular-nums outline-none hover:bg-primary-ghost-hover focus:border-ring focus:bg-surface-secondary')}
    onChange={event => onDraftChange?.(field, event.currentTarget.value, event)}
    onFocus={event => onFocus?.(field, String(value), event)}
    onBlur={event => onBlur?.(field, event.currentTarget.value, event)}
    onKeyDown={event => { onKeyDown?.(field, event); if (!event.defaultPrevented && event.key === 'Enter') event.currentTarget.blur(); }} />;
}

/**
 * Pure controlled rendition of the shipped device row. The parent supplies
 * dimension drafts, width measurement, rotation phase and tooltip placement.
 * No viewport sizing, page zoom, storage or browser commands execute here.
 * `state.isEnabled` is the already-resolved host/page gate, as in original ii.
 * Native disabled attributes are an explicit host lease/busy adapter; original
 * ii has no separate disabled palette. `zoomControlAvailable=false` explicitly
 * omits native page zoom where a host cannot supply that capability. It must
 * never be mapped to screenshot preview scale. No zoom value is synthesized.
 */
export function CodexDeviceToolbar({ state, currentZoomPercent, toolbarWidth, zoomControlAvailable = true,
  disabled = false, inert = false,
  widthDraft, heightDraft, onPresetChange, onDimensionDraftChange, onDimensionFocus,
  onDimensionBlur, onDimensionKeyDown, onZoomPercentChange, onRotate, onClose,
  rotating = false, rotationKey = 0, reducedMotion = false, onRotationAnimationEnd,
  rotateButtonProps = {}, closeButtonProps = {}, rotateTooltipProps = {}, closeTooltipProps = {},
  presetId = 'browser-device-preset', presetLabels = {}, copy = {}, className, ...props }) {
  if (!state?.isEnabled) return null;
  const text = { ...labels, ...copy };
  const compact = (toolbarWidth ?? Infinity) < 600;
  const hideLabel = (toolbarWidth ?? Infinity) < 460;
  const hasZoomValue = Number.isFinite(currentZoomPercent);
  const zoomPercentages = !hasZoomValue || CODEX_DEVICE_ZOOM_PERCENTAGES.includes(currentZoomPercent)
    ? CODEX_DEVICE_ZOOM_PERCENTAGES : [...CODEX_DEVICE_ZOOM_PERCENTAGES, currentZoomPercent].sort((a, b) => a - b);
  return <div {...props} inert={inert ? '' : undefined} className={join('codex-device-toolbar', p('flex h-full min-w-0 items-center gap-1 px-2 text-codex-description'), className)}>
    <label htmlFor={presetId} className={p('max-w-28 shrink min-w-0 truncate text-sm font-medium', hideLabel && 'sr-only')}>{text.dimensions}</label>
    <select id={presetId} value={state.presetId} disabled={disabled} className={p(selectClass, 'min-w-[100px] truncate', compact ? 'w-[100px] max-w-[100px]' : 'max-w-44')}
      onChange={event => { onPresetChange?.(event.currentTarget.value, event); event.currentTarget.blur(); }}>
      {CODEX_DEVICE_PRESETS.map(preset => <option key={preset.id} value={preset.id} className={p('bg-[Canvas] text-[CanvasText]')}>{presetLabels[preset.id] ?? preset.label}</option>)}
    </select>
    <div className={p('flex shrink-0 items-center gap-1')}>
      <DimensionInput field="width" value={state.width} draft={widthDraft} label={text.width} min={240} disabled={disabled}
        onDraftChange={onDimensionDraftChange} onFocus={onDimensionFocus} onBlur={onDimensionBlur} onKeyDown={onDimensionKeyDown} />
      <span className={p('text-sm text-codex-description')}>×</span>
      <DimensionInput field="height" value={state.height} draft={heightDraft} label={text.height} min={160} disabled={disabled}
        onDraftChange={onDimensionDraftChange} onFocus={onDimensionFocus} onBlur={onDimensionBlur} onKeyDown={onDimensionKeyDown} />
    </div>
    <CodexCuTooltip tooltipContent={text.rotate} {...rotateTooltipProps}>
      <button {...rotateButtonProps} type="button" aria-label={text.rotate} disabled={disabled} className={join(p(iconButtonClass), rotateButtonProps.className)}
        onClick={event => { onRotate?.(event); event.currentTarget.blur(); }}>
        <span key={`rotate-device-icon-${rotationKey}`} className={p('_Rotate_rw7ci_1')} data-animating={rotating && !reducedMotion} onAnimationEnd={onRotationAnimationEnd}>
          <CodexCuIcon name="shared:Ed" aria-hidden={false} />
        </span>
      </button>
    </CodexCuTooltip>
    {!compact && zoomControlAvailable && hasZoomValue && <select aria-label={text.zoom} value={currentZoomPercent} disabled={disabled} className={p(selectClass, 'shrink-0')}
      onChange={event => { onZoomPercentChange?.(Number(event.currentTarget.value), event); event.currentTarget.blur(); }}>
      {zoomPercentages.map(percent => <option key={percent} value={percent} className={p('bg-[Canvas] text-[CanvasText]')}>{percent}%</option>)}
    </select>}
    <CodexCuTooltip tooltipContent={text.close} {...closeTooltipProps}>
      <button {...closeButtonProps} type="button" aria-label={text.close} disabled={disabled} className={join(p('ms-auto', iconButtonClass), closeButtonProps.className)}
        onClick={event => { onClose?.(event); event.currentTarget.blur(); }}><CodexCuIcon name="shared:Vot" aria-hidden={false} /></button>
    </CodexCuTooltip>
  </div>;
}

function ResizeHandle({ edge, label, style, disabled, onPointerDown, onPointerMove, onPointerUp }) {
  const bottom = edge === 'bottom', corner = edge === 'bottom-left' || edge === 'bottom-right';
  const edgeClasses = {
    left: '-left-5 w-5 cursor-ew-resize', right: '-right-5 w-5 cursor-ew-resize',
    bottom: 'top-full -right-5 -left-5 h-5 cursor-ns-resize',
    'bottom-left': 'top-full -left-5 cursor-nesw-resize',
    'bottom-right': 'top-full -right-5 cursor-nwse-resize',
  };
  return <button type="button" aria-label={label} tabIndex={-1} style={style} disabled={disabled}
    className={p('pointer-events-auto absolute flex cursor-interaction items-center justify-center bg-device-handle outline-none hover:bg-device-handle-hover', corner && 'z-10 size-5', edgeClasses[edge])}
    onPointerDown={event => onPointerDown?.(event, edge)} onPointerMove={onPointerMove}
    onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onLostPointerCapture={onPointerUp}>
    {corner ? <svg aria-hidden="true" className={p('size-5', edge === 'bottom-left' && '-scale-x-100')} fill="none" viewBox="0 0 20 20">
      <path d="M6 11.75L11.75 6" stroke="var(--color-device-handle-detail)" strokeLinecap="round" strokeWidth="2.4" />
      <path d="M7 15.5L15.5 7" stroke="var(--color-device-handle-detail)" strokeLinecap="round" strokeWidth="2.4" />
    </svg> : <span className={p('flex items-center justify-center gap-0.5', bottom ? 'h-5 w-9 flex-col' : 'h-9 w-5')}>
      <span className={p('rounded-full bg-device-handle-detail', bottom ? 'h-0.5 w-8' : 'h-8 w-0.5')} />
      <span className={p('rounded-full bg-device-handle-detail', bottom ? 'h-0.5 w-8' : 'h-8 w-0.5')} />
    </span>}
  </button>;
}

// Position coordinates are original visualBounds relative to panelBounds.
// All pointer signals pass through; the host owns pointer capture and resizing.
export function CodexDeviceResizeHandles({ state, layout, panelBounds, copy = {}, disabled = false, inert = false,
  onPointerDown, onPointerMove, onPointerUp, className, ...props }) {
  if (!state?.isEnabled || state.presetId !== 'responsive' || !layout || !panelBounds) return null;
  const text = { ...labels, ...copy }, bounds = layout.visualBounds;
  const position = { height: bounds.height, left: bounds.x - panelBounds.x, top: bounds.y - panelBounds.y, width: bounds.width };
  const sideStyle = { height: bounds.height, top: 0 };
  const pointerProps = { onPointerDown, onPointerMove, onPointerUp, disabled };
  return <div {...props} inert={inert ? '' : undefined} className={join('codex-device-resize-handles', p('pointer-events-none absolute z-40'), className)} style={position}>
    <ResizeHandle edge="left" label={text.resizeLeft} style={sideStyle} {...pointerProps} />
    <ResizeHandle edge="right" label={text.resizeRight} style={sideStyle} {...pointerProps} />
    <ResizeHandle edge="bottom" label={text.resizeBottom} {...pointerProps} />
    <ResizeHandle edge="bottom-left" label={text.resizeBottomLeft} {...pointerProps} />
    <ResizeHandle edge="bottom-right" label={text.resizeBottomRight} {...pointerProps} />
  </div>;
}

export const CODEX_DEVICE_TOOLBAR_MENU_LABEL = 'Device toolbar';

/** The exact two children of Xs's Device toolbar FlyoutSubmenuItem.
 * The existing menu host supplies its flyout surface, position and open state.
 * `showNewTabsPreference=false` is an explicit integration omission when the
 * host has no native preference service; it is not a Codex feature gate.
 */
export function CodexDeviceToolbarMenuRows({ isDeviceToolbarEnabled, isDeviceToolbarVisible = false,
  pageActionsDisabled = false, onToggleDeviceToolbar, showDeviceToolbarInNewTabs,
  onShowDeviceToolbarInNewTabsChange, showNewTabsPreference = true, copy = {} }) {
  if (!isDeviceToolbarEnabled || onToggleDeviceToolbar == null) return null;
  return <>
    <CodexCuMenuItem disabled={pageActionsDisabled} onSelect={onToggleDeviceToolbar}>
      {isDeviceToolbarVisible ? copy.hide ?? 'Hide device toolbar' : copy.show ?? 'Show device toolbar'}
    </CodexCuMenuItem>
    {showNewTabsPreference && <CodexCuMenuCheckboxItem checked={showDeviceToolbarInNewTabs}
      onCheckedChange={onShowDeviceToolbarInNewTabsChange}>{copy.newTabs ?? 'Always show in new tabs'}</CodexCuMenuCheckboxItem>}
  </>;
}
