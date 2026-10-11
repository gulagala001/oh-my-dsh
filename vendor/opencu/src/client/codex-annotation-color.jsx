import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CodexCuButton, CodexCuPopoverSurface, CodexCuTooltip } from './codex-cu-primitives.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';
import { CODEX_CU_COPY } from './codex-cu-copy.mjs';
import css from './codex-annotation-color.css';

export const codexAnnotationColorStyles = css;

// Codex 26.1007.21159, build 20052: Jn → le → V → HexColorPicker I.
// Complete packed source, function boundaries, CSS and limitations are recorded
// in work/rea-reconstruction/results-annotation/color/manifest.json.
const p = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cac-${value}`).join(' ');
const join = (...values) => values.filter(Boolean).join(' ');
const clamp = (value, min = 0, max = 1) => value > max ? max : value < min ? min : value;
const round = (value, precision = 0) => Math.round(10 ** precision * value) / 10 ** precision;
const useLatest = value => { const ref = useRef(value); ref.current = value; return ref; };
const same = (a, b) => Object.keys(a).every(key => a[key] === b[key]);
const sourceCopy = (id, english) => CODEX_CU_COPY[id]?.simplifiedChinese ?? CODEX_CU_COPY[id]?.english ?? english;

// Exact Nr normalization used by the annotation text field. Alpha in arbitrary
// text remains text; the shipped picker receives an opaque RGB swatch.
export function normalizeCodexAnnotationColor(value) {
  const text = value?.trim() ?? '';
  const hex = text.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) return hex[1].length === 3 ? '#' + hex[1].split('').map(value => value + value).join('') : '#' + hex[1];
  const rgb = text.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  return rgb ? '#' + rgb.slice(1, 4).map(value => Math.min(255, Number(value)).toString(16).padStart(2, '0')).join('') : '#000000';
}

function hexToRgba(hex) {
  const text = hex[0] === '#' ? hex.substring(1) : hex;
  return text.length < 6
    ? { r: parseInt(text[0] + text[0], 16), g: parseInt(text[1] + text[1], 16), b: parseInt(text[2] + text[2], 16), a: text.length === 4 ? round(parseInt(text[3] + text[3], 16) / 255, 2) : 1 }
    : { r: parseInt(text.substring(0, 2), 16), g: parseInt(text.substring(2, 4), 16), b: parseInt(text.substring(4, 6), 16), a: text.length === 8 ? round(parseInt(text.substring(6, 8), 16) / 255, 2) : 1 };
}
function hexToHsva(hex) {
  const { r, g, b, a } = hexToRgba(hex), max = Math.max(r, g, b), delta = max - Math.min(r, g, b);
  const hue = delta ? max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta : 0;
  return { h: round(60 * (hue < 0 ? hue + 6 : hue)), s: round(max ? delta / max * 100 : 0), v: round(max / 255 * 100), a };
}
function hsvaToHex({ h, s, v }) {
  const hue = h / 360 * 6, saturation = s / 100, brightness = v / 100, sector = Math.floor(hue), index = sector % 6;
  const low = brightness * (1 - saturation), falling = brightness * (1 - (hue - sector) * saturation), rising = brightness * (1 - (1 - hue + sector) * saturation);
  return '#' + [
    [brightness, falling, low, low, rising, brightness][index],
    [rising, brightness, brightness, falling, low, low][index],
    [low, low, rising, brightness, brightness, falling][index],
  ].map(value => round(255 * value).toString(16).padStart(2, '0')).join('');
}
function hsvaToHsl({ h, s, v }) {
  const lightness = (200 - s) * v / 100;
  return `hsl(${round(h)}, ${round(lightness > 0 && lightness < 200 ? s * v / 100 / (lightness <= 100 ? lightness : 200 - lightness) * 100 : 0)}%, ${round(lightness / 2)}%)`;
}
const equalHex = (a, b) => a.toLowerCase() === b.toLowerCase() || same(hexToRgba(a), hexToRgba(b));

// Mouse/touch coordinate and keyboard behavior retain react-colorful's shipped
// controls: arrows move 5%; hue arrows move 18°; only the outer V commits drag.
function ColorInteractive({ onMove, onKey, onEnd, readOnly, children, ...props }) {
  const nodeRef = useRef(null), moveRef = useLatest(onMove), keyRef = useLatest(onKey), endRef = useLatest(onEnd);
  const touchRef = useRef(false), touchIdRef = useRef(null), stopRef = useRef(null);
  useEffect(() => () => stopRef.current?.(), []);
  const coordinate = event => {
    const node = nodeRef.current, rect = node.getBoundingClientRect(), view = node.ownerDocument.defaultView;
    let point = event;
    if ('touches' in event) point = Array.from(event.touches).find(touch => touch.identifier === touchIdRef.current) ?? event.touches[0];
    return { left: clamp((point.pageX - (rect.left + view.pageXOffset)) / rect.width), top: clamp((point.pageY - (rect.top + view.pageYOffset)) / rect.height) };
  };
  const start = event => {
    if (readOnly) return;
    const native = event.nativeEvent, isTouch = 'touches' in native, node = nodeRef.current;
    if (!node || touchRef.current && !isTouch) return;
    if (!isTouch) native.preventDefault();
    if (isTouch) { touchRef.current = true; touchIdRef.current = (native.changedTouches ?? [])[0]?.identifier ?? null; }
    stopRef.current?.(); node.focus(); moveRef.current(coordinate(native));
    const view = node.ownerDocument.defaultView, moveName = touchRef.current ? 'touchmove' : 'mousemove', endName = touchRef.current ? 'touchend' : 'mouseup';
    const stop = () => { view.removeEventListener(moveName, move); view.removeEventListener(endName, end); stopRef.current = null; };
    const end = () => { stop(); endRef.current?.(); };
    const move = current => {
      if (!('touches' in current)) current.preventDefault();
      if (('touches' in current ? current.touches.length > 0 : current.buttons > 0) && nodeRef.current) moveRef.current(coordinate(current));
      else end();
    };
    stopRef.current = stop; view.addEventListener(moveName, move); view.addEventListener(endName, end);
  };
  return <div {...props} ref={nodeRef} role="slider" tabIndex={readOnly ? -1 : 0} aria-disabled={readOnly || undefined}
    className="react-colorful__interactive" onTouchStart={start} onMouseDown={start}
    onKeyDown={event => {
      if (readOnly || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); keyRef.current({ left: event.key === 'ArrowRight' ? .05 : event.key === 'ArrowLeft' ? -.05 : 0, top: event.key === 'ArrowDown' ? .05 : event.key === 'ArrowUp' ? -.05 : 0 });
    }} onKeyUp={event => { if (!readOnly && event.key.startsWith('Arrow')) endRef.current?.(); }}>{children}</div>;
}
function ColorPointer({ color, left, top = .5, className }) {
  return <div className={join('react-colorful__pointer', className)} style={{ top: `${100 * top}%`, left: `${100 * left}%` }}>
    <div className="react-colorful__pointer-fill" style={{ backgroundColor: color }} />
  </div>;
}
function HexColorPicker({ color, onChange, readOnly, className }) {
  const [hsva, setHsva] = useState(() => hexToHsva(color)), stateRef = useLatest(hsva);
  const cacheRef = useRef({ color, hsva }), callbackRef = useLatest(onChange);
  useEffect(() => { if (!equalHex(color, cacheRef.current.color)) { const next = hexToHsva(color); cacheRef.current = { color, hsva: next }; setHsva(next); } }, [color]);
  useEffect(() => {
    if (same(hsva, cacheRef.current.hsva)) return;
    const next = hsvaToHex(hsva);
    if (!equalHex(next, cacheRef.current.color)) { cacheRef.current = { color: next, hsva }; callbackRef.current?.(next); }
  }, [hsva]);
  const update = change => { if (!readOnly) setHsva(current => ({ ...current, ...change })); };
  return <div className={join('react-colorful', className)}>
    <div className="react-colorful__saturation" style={{ backgroundColor: hsvaToHsl({ h: hsva.h, s: 100, v: 100 }) }}>
      <ColorInteractive readOnly={readOnly} aria-label="Color" aria-valuetext={`Saturation ${round(hsva.s)}%, Brightness ${round(hsva.v)}%`}
        onMove={point => update({ s: 100 * point.left, v: 100 - 100 * point.top })}
        onKey={point => update({ s: clamp(stateRef.current.s + 100 * point.left, 0, 100), v: clamp(stateRef.current.v - 100 * point.top, 0, 100) })}>
        <ColorPointer className="react-colorful__saturation-pointer" top={1 - hsva.v / 100} left={hsva.s / 100} color={hsvaToHsl(hsva)} />
      </ColorInteractive>
    </div>
    <div className="react-colorful__hue react-colorful__last-control">
      <ColorInteractive readOnly={readOnly} aria-label="Hue" aria-valuenow={round(hsva.h)} aria-valuemax="360" aria-valuemin="0"
        onMove={point => update({ h: 360 * point.left })} onKey={point => update({ h: clamp(stateRef.current.h + 360 * point.left, 0, 360) })}>
        <ColorPointer className="react-colorful__hue-pointer" left={hsva.h / 360} color={hsvaToHsl({ h: hsva.h, s: 100, v: 100 })} />
      </ColorInteractive>
    </div>
  </div>;
}

export function CodexAnnotationColorPicker({ color, label, size = 'default', palette, allowCustom = true, collapseControlsWhileDragging = false,
  disabled = false, onChange, onPreviewChange, onDragControlChange, onEyeDropperActiveChange,
  pickScreenColorLabel = sourceCopy('presentationEditor.pickScreenColor', 'Pick color from screen'),
  screenColorFailedLabel = sourceCopy('presentationEditor.screenColorFailed', 'Could not pick a screen color') }) {
  const readOnly = disabled || typeof onChange !== 'function', [draft, setDraft] = useState({ baseColor: color, value: color ?? '' });
  const value = draft.baseColor === color ? draft.value : color ?? '', pickerColor = value || '#000000';
  const valueRef = useLatest(value), colorRef = useLatest(color), [screenFailed, setScreenFailed] = useState(false), [draggingSaturation, setDraggingSaturation] = useState(false);
  const abortRef = useRef(null), mountedRef = useRef(false), dragRef = useRef(null), keyboardRef = useRef(false), fieldRef = useRef(null);
  const eyeDropperActiveCallbackRef = useLatest(onEyeDropperActiveChange);
  const [eyeDropperAvailable, setEyeDropperAvailable] = useState(false), [tooltipOpen, setTooltipOpen] = useState(false);
  useLayoutEffect(() => { setEyeDropperAvailable(Boolean(fieldRef.current?.ownerDocument.defaultView?.EyeDropper)); }, []);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const controller = abortRef.current;
      controller?.abort();
      if (abortRef.current === controller) {
        abortRef.current = null;
        if (controller) eyeDropperActiveCallbackRef.current?.(false);
      }
    };
  }, []);
  useLayoutEffect(() => {
    if (!readOnly) return;
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    if (abortRef.current === controller) {
      abortRef.current = null;
      if (mountedRef.current) eyeDropperActiveCallbackRef.current?.(false);
    }
  }, [readOnly, onEyeDropperActiveChange]);
  useEffect(() => () => { dragRef.current?.stop(); }, []);
  const commit = useCallback(input => {
    if (readOnly) return;
    const text = input.trim().replace(/^#/, '');
    if (/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(text)) {
      const next = '#' + (text.length === 3 ? text.split('').map(value => value + value).join('') : text).toUpperCase();
      setDraft({ baseColor: color, value: next }); if (next !== color?.toUpperCase()) onChange(next);
    } else setDraft({ baseColor: color, value: color ?? '' });
  }, [color, onChange, readOnly]);
  const startDrag = event => {
    if (readOnly || event.button !== 0 || event.isPrimary === false) return;
    keyboardRef.current = false; event.currentTarget.setPointerCapture?.(event.pointerId); dragRef.current?.stop();
    const view = event.currentTarget.ownerDocument.defaultView;
    const stop = () => { dragRef.current = null; setDraggingSaturation(false); view?.removeEventListener('blur', stop); onDragControlChange?.(null); };
    dragRef.current = { pointerId: event.pointerId, stop };
    const hue = event.currentTarget.querySelector('.react-colorful__hue'), control = hue && event.nativeEvent.composedPath().includes(hue) ? 'hue' : 'saturation';
    setDraggingSaturation(collapseControlsWhileDragging && control === 'saturation'); view?.addEventListener('blur', stop); onDragControlChange?.(control);
  };
  const pickScreenColor = event => {
    const view = event.currentTarget.ownerDocument.defaultView; if (readOnly || !mountedRef.current || !view?.EyeDropper) return;
    abortRef.current?.abort();
    const controller = new view.AbortController(); abortRef.current = controller; setScreenFailed(false); onEyeDropperActiveChange?.(true);
    const isCurrent = () => mountedRef.current && !controller.signal.aborted && abortRef.current === controller;
    new view.EyeDropper().open({ signal: controller.signal }).then(result => {
      if (isCurrent()) onChange(result.sRGBHex);
    }, error => {
      if (!isCurrent()) return;
      if (!(error instanceof view.DOMException && error.name === 'AbortError')) setScreenFailed(true);
    }).finally(() => {
      if (abortRef.current !== controller) return;
      abortRef.current = null;
      if (!mountedRef.current || controller.signal.aborted) return;
      onEyeDropperActiveChange?.(false);
    });
  };
  return <div ref={fieldRef} className={join('codex-annotation-color-picker', p('flex w-62 flex-col gap-3 p-2'))}>
    {allowCustom && <>
      <div className={p('relative')}>
        <div role="group" aria-label={label} onPointerDown={startDrag}
          onPointerUp={event => { if (dragRef.current?.pointerId === event.pointerId) { commit(valueRef.current || '#000000'); dragRef.current.stop(); } }}
          onPointerCancel={event => { if (dragRef.current?.pointerId === event.pointerId) { setDraft({ baseColor: colorRef.current, value: colorRef.current ?? '' }); dragRef.current.stop(); } }}
          onLostPointerCapture={() => dragRef.current?.stop()} onKeyDownCapture={() => { keyboardRef.current = true; }}>
          <HexColorPicker color={pickerColor} readOnly={readOnly}
            className={p('_picker_1o7p4_2', size === 'compact' && '_compact_1o7p4_2', draggingSaturation && '_draggingSaturation_1o7p4_2')}
            onChange={next => { setDraft({ baseColor: color, value: next }); if (!keyboardRef.current) onPreviewChange?.(next); else if (next.toUpperCase() !== color?.toUpperCase()) onChange?.(next); }} />
        </div>
        <CodexCuTooltip tooltipContent={pickScreenColorLabel} open={tooltipOpen && !draggingSaturation} style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0 }}>
          <CodexCuButton className={p('absolute right-0 bottom-0 w-12.5 justify-center')} color="field" size="field" hidden={draggingSaturation}
            disabled={readOnly || !eyeDropperAvailable} aria-label={pickScreenColorLabel} onClick={pickScreenColor}
            onPointerEnter={() => setTooltipOpen(true)} onPointerLeave={() => setTooltipOpen(false)} onFocus={() => setTooltipOpen(true)} onBlur={() => setTooltipOpen(false)}>
            <CodexCuIcon name="shared:jg" />
          </CodexCuButton>
        </CodexCuTooltip>
      </div>
      <label className={p('flex flex-col gap-1.5 text-xs text-secondary')} hidden={draggingSaturation}>
        HEX
        <input className={p('min-w-0 border text-default outline-none placeholder:text-tertiary aria-invalid:border-text-danger aria-invalid:ring-2 aria-invalid:ring-text-danger/20 disabled:cursor-not-allowed disabled:text-secondary w-full h-8 rounded-lg bg-primary-soft px-2 text-sm focus-within:bg-primary-ghost-hover forced-colors:focus-within:outline-2 forced-colors:focus-within:outline-solid disabled:bg-text/5', disabled ? 'border-transparent' : 'border-default')}
          aria-label={label} value={value} spellCheck={false} readOnly={readOnly} disabled={disabled}
          onChange={event => { if (!readOnly) setDraft({ baseColor: color, value: event.currentTarget.value }); }} onBlur={() => commit(value)}
          onKeyDown={event => { if (event.key === 'Escape') setDraft({ baseColor: color, value: color ?? '' }); if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
      </label>
    </>}
    {palette?.length > 0 && <>
      {allowCustom && <div className={p('flex h-4 items-center')} hidden={draggingSaturation}><div className={p('h-px w-full bg-border-subtle')} /></div>}
      <div className={p('grid w-fit grid-cols-6 gap-2')} hidden={draggingSaturation}>
        {palette.map((preset, index) => <button type="button" key={index} className={p('size-7 cursor-interaction rounded-sm border border-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring')}
          style={{ backgroundColor: preset }} aria-label={`Preset color ${preset}`} disabled={readOnly} onClick={() => onChange?.(preset)} />)}
      </div>
    </>}
    {screenFailed && <p role="alert" className={p('text-base text-danger')} hidden={draggingSaturation}>{screenColorFailedLabel}</p>}
  </div>;
}

// The source uses Radix Popover and Motion. This local display adapter owns only
// the viewer's open state and placement. A host may supply renderPopover for its
// own provider; it is never presented as equivalent to the original provider.
export function CodexAnnotationColorControl({ ariaLabel, value = '', placeholderValue, isEdited = false, disabled = false,
  onValueChange, onEditingActiveChange, onDragActiveChange, portalContainer, renderPopover, styleEnabled = false }) {
  const [open, setOpen] = useState(false), [placement, setPlacement] = useState(null), [collapse, setCollapse] = useState(null);
  const swatchRef = useRef(null), popoverRef = useRef(null), eyeDropperRef = useRef(false), returnFocusRef = useRef(false);
  const readOnly = disabled || typeof onValueChange !== 'function', normalizedColor = normalizeCodexAnnotationColor(value || placeholderValue);
  const close = useCallback(() => { setOpen(false); setCollapse(null); onEditingActiveChange?.(eyeDropperRef.current); }, [onEditingActiveChange]);
  useLayoutEffect(() => {
    if (!open || renderPopover) return;
    const node = swatchRef.current, view = node?.ownerDocument.defaultView; if (!node || !view) return;
    const position = () => {
      const rect = node.getBoundingClientRect(), panel = popoverRef.current, panelHeight = panel?.getBoundingClientRect().height ?? 224;
      const width = panel?.getBoundingClientRect().width ?? 248, side = rect.bottom + 4 + panelHeight <= view.innerHeight - 8 ? 'bottom' : 'top';
      setPlacement({ left: clamp(rect.right - width, 8, Math.max(8, view.innerWidth - width - 8)), top: side === 'bottom' ? rect.bottom + 4 : Math.max(8, rect.top - panelHeight - 4), side });
    };
    const dismiss = event => { if (!node.contains(event.target) && !popoverRef.current?.contains(event.target) && !eyeDropperRef.current) close(); };
    const keydown = event => { if (event.key === 'Escape' && !eyeDropperRef.current) { event.preventDefault(); returnFocusRef.current = true; close(); } };
    position(); node.ownerDocument.addEventListener('pointerdown', dismiss); node.ownerDocument.addEventListener('keydown', keydown); view.addEventListener('resize', position); view.addEventListener('scroll', position, true);
    return () => { node.ownerDocument.removeEventListener('pointerdown', dismiss); node.ownerDocument.removeEventListener('keydown', keydown); view.removeEventListener('resize', position); view.removeEventListener('scroll', position, true); };
  }, [open, renderPopover, close]);
  useLayoutEffect(() => {
    if (!open && returnFocusRef.current) { returnFocusRef.current = false; swatchRef.current?.focus(); }
    if (open && !renderPopover) popoverRef.current?.querySelector('[role="slider"]')?.focus();
  }, [open, renderPopover]);
  const dragControlChange = control => {
    const panel = popoverRef.current, saturation = panel?.querySelector('.react-colorful__saturation');
    if (control === 'saturation' && collapse == null && panel && saturation) {
      const rect = panel.getBoundingClientRect(), sat = saturation.getBoundingClientRect(), expandedHeight = parseFloat(getComputedStyle(panel).height), scale = rect.height / expandedHeight;
      setCollapse({ anchor: new panel.ownerDocument.defaultView.DOMRect(rect.x, rect.y, rect.width, 0), expandedHeight, collapsedHeight: (sat.height + 2 * (sat.left - rect.left)) / scale, collapsed: true });
    } else setCollapse(current => current == null || control == null && panel?.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? null : { ...current, collapsed: control === 'saturation' });
    onDragActiveChange?.(control != null);
  };
  const picker = <CodexAnnotationColorPicker color={normalizedColor} label={ariaLabel} size="compact" collapseControlsWhileDragging disabled={disabled}
    onChange={readOnly ? undefined : onValueChange} onPreviewChange={readOnly ? undefined : onValueChange} onDragControlChange={dragControlChange}
    onEyeDropperActiveChange={active => { eyeDropperRef.current = active; onEditingActiveChange?.(active); }} />;
  const providerProps = { open, onOpenChange: next => { if (next) setOpen(true); else close(); }, anchorRef: swatchRef, contentRef: popoverRef,
    portalContainer, align: collapse == null ? 'end' : 'start', side: collapse == null ? undefined : 'bottom', sideOffset: collapse == null ? undefined : 0,
    avoidCollisions: collapse == null, collapse, children: picker, virtualAnchorRef: collapse ? { current: { getBoundingClientRect: () => collapse.anchor } } : undefined,
    disablePadding: true, initial: false, size: 'content', variant: 'menu',
    animate: { height: collapse ? collapse.collapsed ? collapse.collapsedHeight : collapse.expandedHeight : 'auto' },
    style: { height: collapse?.expandedHeight, overflow: collapse ? 'hidden' : undefined },
    transition: { duration: swatchRef.current?.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : .15, ease: [.23, 1, .32, 1] },
    onAnimationComplete: next => { if (typeof next === 'object' && 'height' in next) setCollapse(current => current?.collapsed === false && next.height === current.expandedHeight ? null : current); },
    onBlurCapture: () => onEditingActiveChange?.(eyeDropperRef.current),
    onKeyDownCapture: event => { if (event.key.startsWith('Arrow') && !readOnly) onEditingActiveChange?.(true); },
    onKeyUpCapture: event => { if (event.key.startsWith('Arrow')) onEditingActiveChange?.(eyeDropperRef.current); } };
  const localPanel = open && <CodexCuPopoverSurface ref={popoverRef} open align={providerProps.align} side={collapse ? 'bottom' : placement?.side} variant="menu" size="content" disablePadding
    role="dialog" aria-label={ariaLabel} className="codex-annotation-color-popup" onBlurCapture={providerProps.onBlurCapture} onKeyUpCapture={providerProps.onKeyUpCapture}
    onKeyDownCapture={event => {
      if (event.key === 'Escape' && !eyeDropperRef.current) {
        event.preventDefault(); event.stopPropagation(); returnFocusRef.current = true; close();
        return;
      }
      providerProps.onKeyDownCapture(event);
    }}
    style={{ position: 'fixed', left: collapse?.anchor.x ?? placement?.left, top: collapse?.anchor.y ?? placement?.top, visibility: placement || collapse ? 'visible' : 'hidden', maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)',
      height: collapse ? collapse.collapsed ? collapse.collapsedHeight : collapse.expandedHeight : undefined, overflow: collapse ? 'hidden' : undefined,
      transition: 'height 150ms cubic-bezier(.23,1,.32,1)' }}
    onTransitionEnd={event => { if (event.propertyName === 'height' && collapse?.collapsed === false) setCollapse(null); }}>{picker}</CodexCuPopoverSurface>;
  return <>
    {styleEnabled && <style>{css}</style>}
    <span className={join('codex-annotation-color-control', p('min-w-0 rounded-lg border border-primary-outline bg-primary-soft text-default shadow-sm outline-none transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring w-48 max-w-full flex min-h-7 items-center gap-2 px-2'))}>
      <button ref={swatchRef} type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} data-color-readonly={readOnly || undefined}
        className={p('h-5 w-5 shrink-0 cursor-interaction overflow-hidden rounded-md border border-default bg-transparent p-0')}
        style={{ backgroundColor: normalizedColor }} onClick={() => open ? close() : setOpen(true)} />
      <input aria-label={ariaLabel} dir="ltr" value={value} placeholder={placeholderValue} title={value} readOnly={readOnly} disabled={disabled}
        className={p('min-w-0 appearance-none border-0 bg-transparent font-mono text-default outline-none ring-0 placeholder:text-tertiary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 h-7 w-full truncate text-start text-xs', !isEdited && 'text-tertiary')}
        onChange={event => { if (!readOnly) onValueChange(event.target.value); }} />
    </span>
    {renderPopover ? renderPopover(providerProps) : portalContainer ? createPortal(<CodexCuScope forceScope>{localPanel}</CodexCuScope>, portalContainer) : localPanel}
  </>;
}

export default CodexAnnotationColorControl;
