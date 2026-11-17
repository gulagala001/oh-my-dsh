export const OVERVIEW_WIDTH_KEY = 'omd.overview.width.v1';
export const OVERVIEW_DEFAULT_WIDTH = 280;
const MIN = 200, MAX = 480;

export function readOverviewWidth(storage) {
  try {
    const value = Number((storage ?? globalThis.localStorage)?.getItem(OVERVIEW_WIDTH_KEY));
    return Number.isFinite(value) && value >= MIN && value <= MAX ? value : OVERVIEW_DEFAULT_WIDTH;
  } catch { return OVERVIEW_DEFAULT_WIDTH; }
}

export function overviewWidthLimits(available, floating = false) {
  const max = Math.max(0, Math.min(MAX, floating ? available - 16 : available * .45));
  return { min: Math.min(MIN, max), max };
}

/** Pointer capture owns a single gesture; only a completed drag is persisted. */
export function bindOverviewResize({ root, handle, preference, commit }) {
  const view = root.ownerDocument.defaultView;
  let drag = null, frame = null;
  const limits = () => overviewWidthLimits(root.clientWidth, root.hasAttribute('data-overview-floating'));
  const clamp = width => { const { min, max } = limits(); return Math.min(max, Math.max(min, width)); };
  const paint = width => {
    root.style.setProperty('--omd-overview-preferred-width', `${width}px`);
    refresh(width);
  };
  function refresh(width = drag?.width ?? preference()) {
    const { min, max } = limits();
    handle.setAttribute('aria-valuemin', String(Math.round(min)));
    handle.setAttribute('aria-valuemax', String(Math.round(max)));
    handle.setAttribute('aria-valuenow', String(Math.round(clamp(width))));
  }
  const flush = () => {
    if (frame !== null) { view.cancelAnimationFrame(frame); frame = null; }
    if (drag) { drag.width = clamp(drag.startWidth + drag.startX - drag.x); paint(drag.width); }
  };
  const finish = save => {
    if (!drag) return;
    flush(); const ended = drag; drag = null;
    if (handle.hasPointerCapture(ended.id)) handle.releasePointerCapture(ended.id);
    root.removeAttribute('data-overview-resizing');
    if (save && ended.x !== ended.startX) commit(ended.width);
    paint(preference());
  };
  const down = event => {
    if (event.button !== 0 || event.isPrimary === false || drag || !root.hasAttribute('data-overview-open')) return;
    event.preventDefault(); handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, startX: event.clientX, x: event.clientX, startWidth: clamp(preference()), width: clamp(preference()) };
    root.removeAttribute('data-overview-animating'); root.setAttribute('data-overview-resizing', '');
  };
  const move = event => {
    if (drag?.id !== event.pointerId) return;
    drag.x = event.clientX;
    frame ??= view.requestAnimationFrame(() => { frame = null; flush(); });
  };
  const up = event => { if (drag?.id === event.pointerId) { drag.x = event.clientX; finish(true); } };
  const cancel = event => { if (event?.pointerId !== undefined && event.pointerId !== drag?.id) return; finish(false); };
  const reset = () => { cancel(); commit(OVERVIEW_DEFAULT_WIDTH); paint(preference()); };
  const key = event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); cancel(); return; }
    if (!root.hasAttribute('data-overview-open') || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(event.key)) return;
    event.preventDefault(); cancel(); root.removeAttribute('data-overview-animating');
    const { min, max } = limits(), step = event.shiftKey ? 40 : 16;
    const value = event.key === 'Home' ? min : event.key === 'End' ? max : event.key === 'Enter' ? OVERVIEW_DEFAULT_WIDTH
      : clamp(preference()) + (event.key === 'ArrowLeft' ? step : -step);
    commit(clamp(value)); paint(preference());
  };
  const handlers = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancel, lostpointercapture: cancel, dblclick: reset, keydown: key };
  for (const [type, listener] of Object.entries(handlers)) handle.addEventListener(type, listener);
  view.addEventListener('blur', cancel);
  const observer = view.ResizeObserver ? new view.ResizeObserver(() => refresh()) : null; observer?.observe(root); refresh();
  return { cancel, refresh, dispose() {
    cancel(); observer?.disconnect(); view.removeEventListener('blur', cancel);
    for (const [type, listener] of Object.entries(handlers)) handle.removeEventListener(type, listener);
  } };
}
