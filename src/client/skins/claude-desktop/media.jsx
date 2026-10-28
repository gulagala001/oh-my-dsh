import React, { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

// Affine anchor zoom, 4px drag threshold and scale constants adapted from
// open-claude-ui/MediaLightboxViewer.tsx (MIT). DSH still owns the image URL,
// loading, dialog, close action and return focus. Only its live image is used.
const clamp = (value, maximum) => Math.min(maximum, Math.max(-maximum, value));
const limit = (size, viewport, scale) => Math.max(0, (size * scale - viewport) / 2) * Math.min(1, Math.max(0, (scale - 1.05) / .95));
export function anchorZoom(fit, current, target, point = { x: 0, y: 0 }) {
  const scale = Math.min(fit.maxScale, Math.max(1, target));
  if (scale <= 1.05) return { scale: 1, x: 0, y: 0 };
  const ratio = scale / current.scale;
  return { scale, x: clamp(point.x - (point.x - current.x) * ratio, limit(fit.width, fit.viewportWidth, scale)),
    y: clamp(point.y - (point.y - current.y) * ratio, limit(fit.height, fit.viewportHeight, scale)) };
}

export function ClaudeMediaControls({ image }) {
  const controls = useRef(null), api = useRef(null), [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const stage = image.parentElement, dialog = image.closest('[role="dialog"]');
    if (!stage || !dialog) return;
    const previous = { draggable: image.getAttribute('draggable'), marker: image.getAttribute('data-omd-cds-media'), zoom: image.getAttribute('data-omd-cds-zoomed') };
    const properties = ['--omd-cds-media-scale','--omd-cds-media-x','--omd-cds-media-y'];
    const styles = properties.map(name => [name, image.style.getPropertyValue(name), image.style.getPropertyPriority(name)]);
    let state = { scale: 1, x: 0, y: 0 }, drag, moved = false;
    image.draggable = false; image.setAttribute('data-omd-cds-media', '');
    const geometry = () => {
      const rect = image.getBoundingClientRect(), viewport = stage.getBoundingClientRect(), style = getComputedStyle(stage);
      // Layout sizes are unaffected by our transform. Reading the transformed
      // bounding width here would compound scale on every wheel event.
      const width = image.clientWidth, height = image.clientHeight;
      return { width, height, maxScale: Math.max(2, image.naturalWidth / (width || 1)),
        viewportWidth: Math.max(1, viewport.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
        viewportHeight: Math.max(1, viewport.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)),
        cx: rect.left + rect.width / 2 - state.x, cy: rect.top + rect.height / 2 - state.y };
    };
    const render = next => {
      state = next; setScale(next.scale);
      image.style.setProperty(properties[0], String(next.scale));
      image.style.setProperty(properties[1], next.x + 'px'); image.style.setProperty(properties[2], next.y + 'px');
      image.toggleAttribute('data-omd-cds-zoomed', next.scale > 1);
    };
    const zoom = (target, event) => {
      const fit = geometry();
      if (!fit.width || !fit.height) return;
      render(anchorZoom(fit, state, target, event ? { x: event.clientX - fit.cx, y: event.clientY - fit.cy } : undefined));
    };
    const reset = () => { const active = drag; drag = undefined; if (active && image.hasPointerCapture(active.id)) image.releasePointerCapture(active.id); render({ scale: 1, x: 0, y: 0 }); };
    api.current = { zoom: factor => zoom(state.scale * factor), reset };
    const wheel = event => {
      if (event.ctrlKey) { event.preventDefault(); zoom(state.scale * Math.exp(-event.deltaY * .01), event); }
      else if (state.scale > 1) {
        event.preventDefault(); const fit = geometry();
        render({ ...state, x: clamp(state.x - event.deltaX, limit(fit.width, fit.viewportWidth, state.scale)), y: clamp(state.y - event.deltaY, limit(fit.height, fit.viewportHeight, state.scale)) });
      }
    };
    const down = event => {
      if (event.button !== 0 || state.scale <= 1 || drag) return;
      event.preventDefault(); moved = false;
      drag = { id: event.pointerId, px: event.clientX, py: event.clientY, x: state.x, y: state.y };
      image.setPointerCapture(event.pointerId);
    };
    const move = event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.px, dy = event.clientY - drag.py;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true; const fit = geometry();
      // Keep one pointer origin throughout the gesture; do not add the same
      // cumulative delta repeatedly to the previous frame's translation.
      render({ ...state, x: clamp(drag.x + dx, limit(fit.width, fit.viewportWidth, state.scale)), y: clamp(drag.y + dy, limit(fit.height, fit.viewportHeight, state.scale)) });
    };
    const end = event => { if (drag?.id !== event.pointerId) return; drag = undefined; if (image.hasPointerCapture(event.pointerId)) image.releasePointerCapture(event.pointerId); };
    const click = event => { if (moved) { event.preventDefault(); event.stopPropagation(); moved = false; } };
    const double = event => { event.preventDefault(); event.stopPropagation(); zoom(state.scale > 1 ? 1 : geometry().maxScale, event); };
    const key = event => {
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(state.scale * 1.25); }
      else if (event.key === '-') { event.preventDefault(); zoom(state.scale / 1.25); }
      else if (event.key === '0') { event.preventDefault(); reset(); }
      else if (event.key === 'Tab') {
        const items = [...dialog.querySelectorAll('button:not(:disabled)')].filter(el => el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const events = { pointerdown: down, pointermove: move, pointerup: end, pointercancel: end, lostpointercapture: end, click, dblclick: double };
    for (const [name, listener] of Object.entries(events)) image.addEventListener(name, listener);
    stage.addEventListener('wheel', wheel, { passive: false }); dialog.addEventListener('keydown', key);
    const resize = new ResizeObserver(reset); resize.observe(stage); image.addEventListener('load', reset); render(state);
    return () => {
      if (drag && image.hasPointerCapture(drag.id)) image.releasePointerCapture(drag.id);
      drag = undefined; api.current = null; resize.disconnect(); image.removeEventListener('load', reset);
      for (const [name, listener] of Object.entries(events)) image.removeEventListener(name, listener);
      stage.removeEventListener('wheel', wheel); dialog.removeEventListener('keydown', key);
      for (const [name, value, priority] of styles) value ? image.style.setProperty(name, value, priority) : image.style.removeProperty(name);
      for (const [name, value] of [['draggable',previous.draggable],['data-omd-cds-media',previous.marker],['data-omd-cds-zoomed',previous.zoom]]) value === null ? image.removeAttribute(name) : image.setAttribute(name, value);
    };
  }, [image]);
  return <div ref={controls} className="omd-cds-media-controls" role="toolbar" aria-label="图片缩放" onClick={event => event.stopPropagation()}>
    <Button size="sm" variant="ghost" aria-label="缩小图片" disabled={scale <= 1} onClick={() => api.current?.zoom(1 / 1.25)}>−</Button>
    <Button size="sm" variant="ghost" aria-label="适合窗口" onClick={() => api.current?.reset()}>{Math.round(scale * 100)}%</Button>
    <Button size="sm" variant="ghost" aria-label="放大图片" disabled={scale >= Math.max(2, image.naturalWidth / (image.clientWidth || 1))} onClick={() => api.current?.zoom(1.25)}>+</Button>
  </div>;
}
