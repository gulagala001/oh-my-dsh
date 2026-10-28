import React, { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createAttributeMarkers } from '../../attribute-markers.mjs';
import { acquireOverlayInert } from '../../overlay-inert.mjs';
import { ClaudeMediaControls } from './media.jsx';

const handles = '.pI_x6G_handle[data-side]';
const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
const focusables = element => [...element.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(visible);

// DSH's captured pointer stream, column solver and layout store remain the
// authority. CDS adds the 4px dead zone, cancellation and 50/50 shortcut.
export function bindClaudeResize(frame, store) {
  if (!store?.actions?.setRightbar || !store.actions.setSidebar) return () => {};
  const attributes = new Map(['role', 'tabindex', 'aria-label', 'aria-orientation', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax'].map(name => [name, createAttributeMarkers(name)]));
  let drag, pendingRestore, stopped = false, restoreFrame;
  const width = side => frame.querySelector(side === 'sidebar' ? '.pI_x6G_sidebarCol' : '[data-rightbar-col]')?.getBoundingClientRect().width ?? 0;
  const setWidth = (side, value) => side === 'sidebar' ? store.actions.setSidebar(value) : store.actions.setRightbar(value);
  const snap = side => setWidth(side, side === 'sidebar' ? 280 : (frame.clientWidth - width('sidebar')) / 2);
  const sync = () => {
    const elements = [...frame.querySelectorAll(handles)];
    for (const [name, marker] of attributes) marker.update(new Map(elements.map(el => [el, {
      role: 'separator', tabindex: '0', 'aria-label': el.dataset.side === 'sidebar' ? '调整侧栏宽度' : '调整预览宽度',
      'aria-orientation': 'vertical', 'aria-valuenow': String(Math.round(width(el.dataset.side))),
      'aria-valuemin': '0', 'aria-valuemax': String(frame.clientWidth),
    }[name]])));
  };
  const cancel = () => {
    if (!drag) return;
    const current = drag; drag = undefined;
    if (current.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
    // lostpointercapture ends the native rAF drag before restoring the width.
    cancelAnimationFrame(restoreFrame);
    pendingRestore = current;
    restoreFrame = requestAnimationFrame(() => { pendingRestore = undefined; if (!stopped) setWidth(current.side, current.width); });
  };
  const down = event => {
    const element = event.target instanceof Element && event.target.closest(handles);
    if (!element || event.button !== 0 || drag || !frame.contains(element)) return;
    cancelAnimationFrame(restoreFrame);
    if (pendingRestore) { setWidth(pendingRestore.side, pendingRestore.width); pendingRestore = undefined; }
    drag = { element, side: element.dataset.side, id: event.pointerId, x: event.clientX, width: width(element.dataset.side), moved: false };
  };
  const move = event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (Math.abs(event.clientX - drag.x) >= 4) drag.moved = true;
    if (!drag.moved) event.stopPropagation();
  };
  const up = event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved && Math.abs(event.clientX - drag.x) < 4) {
      event.stopPropagation(); cancel();
    } else drag = undefined;
  };
  const cancelled = event => { if (drag?.id === event.pointerId) cancel(); };
  const dblclick = event => {
    const element = event.target instanceof Element && event.target.closest(handles);
    if (!element || !frame.contains(element)) return;
    cancelAnimationFrame(restoreFrame); pendingRestore = undefined; snap(element.dataset.side);
  };
  const key = event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); cancel(); return; }
    const element = event.target instanceof Element && event.target.closest(handles);
    if (!element || !frame.contains(element)) return;
    const side = element.dataset.side;
    if (event.key === 'Enter' || event.key === 'Home') { event.preventDefault(); snap(side); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = (event.key === 'ArrowRight' ? 1 : -1) * (side === 'sidebar' ? 1 : -1) * (event.shiftKey ? 40 : 10);
      setWidth(side, width(side) + delta);
    }
  };
  const events = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancelled, dblclick, keydown: key };
  for (const [name, listener] of Object.entries(events)) frame.addEventListener(name, listener, true);
  const unsubscribe = store.subscribe(sync), observer = new MutationObserver(sync);
  const resize = new ResizeObserver(sync);
  for (const element of [frame, ...frame.querySelectorAll(':scope > .pI_x6G_sidebarCol,:scope > [data-rightbar-col]')]) resize.observe(element);
  observer.observe(frame, { childList: true }); sync();
  return () => {
    stopped = true; cancelAnimationFrame(restoreFrame);
    if (drag || pendingRestore) {
      const current = drag || pendingRestore; drag = pendingRestore = undefined;
      if (current.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
      setWidth(current.side, current.width);
    }
    for (const [name, listener] of Object.entries(events)) frame.removeEventListener(name, listener, true);
    unsubscribe(); observer.disconnect(); resize.disconnect(); for (const marker of attributes.values()) marker.dispose();
  };
}

function ClaudeShell({ ctx }) {
  const ref = useRef(null), [indicators, setIndicators] = useState([]), [images, setImages] = useState([]);
  const entry = useSyncExternalStore(fn => ctx.slots.subscribe('root', fn), () => ctx.slots.entriesOfSlot('root')[0]);
  useLayoutEffect(() => {
    const frame = ref.current?.closest('[data-shell-overlay]')?.parentElement;
    if (!frame) return;
    const releaseResize = bindClaudeResize(frame, entry?.store?.create?.());
    const narrow = matchMedia('(max-width: 600px)'), column = frame.querySelector('.pI_x6G_sidebarCol');
    const roles = new Map(['role','aria-modal','aria-label'].map(name => [name, createAttributeMarkers(name)]));
    let modal = false, previousFocus, releaseInert = () => {}, raf, disposed = false;
    const otherOverlay = () => [...document.querySelectorAll('[role="dialog"],[role="menu"]')].some(el => el !== column && visible(el));
    const sync = () => {
      raf = undefined;
      const next = [...frame.querySelectorAll('[data-chat-running] [class$="_runningIcon"]')];
      setIndicators(previous => previous.length === next.length && previous.every((el,i) => el === next[i]) ? previous : next);
      const media = [...document.querySelectorAll('._backdrop_19zw2_2[role="dialog"] > ._stage_19zw2_9 > img._image_19zw2_26')];
      setImages(previous => previous.length === media.length && previous.every((el,i) => el === media[i]) ? previous : media);
      const open = Boolean(column && narrow.matches && frame.dataset.sidebarCollapsed !== 'true' && !frame.hasAttribute('data-rightbar-fullscreen'));
      if (open === modal) return;
      modal = open; releaseInert(); releaseInert = () => {};
      for (const [name, marker] of roles) marker.update(new Map(open ? [[column, { role: 'dialog', 'aria-modal': 'true', 'aria-label': '侧栏导航' }[name]]] : []));
      if (open) {
        previousFocus = document.activeElement;
        releaseInert = acquireOverlayInert([...frame.querySelectorAll(':scope > .pI_x6G_centerCol,:scope > .pI_x6G_rightbarCol')]);
        if (!otherOverlay()) column.querySelector('[data-omd-nav-part="toggle"]')?.focus({ preventScroll: true });
      } else if (previousFocus?.isConnected && !otherOverlay()) previousFocus.focus({ preventScroll: true });
    };
    const schedule = () => { if (!disposed && raf === undefined) raf = requestAnimationFrame(sync); };
    const key = event => {
      if (!modal || event.defaultPrevented || otherOverlay()) return;
      if (event.key === 'Escape') { event.preventDefault(); ctx.layout.toggleSidebar(); }
      if (event.key === 'Tab') {
        const items = focusables(column), first = items[0], last = items.at(-1);
        if (!first) return;
        if (event.shiftKey && (document.activeElement === first || !column.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !column.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sidebar-collapsed','data-rightbar-fullscreen'] });
    narrow.addEventListener('change', schedule); document.addEventListener('keydown', key); sync();
    return () => {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect(); narrow.removeEventListener('change', schedule);
      document.removeEventListener('keydown', key); releaseInert(); for (const marker of roles.values()) marker.dispose(); releaseResize();
    };
  }, [ctx, entry]);
  return <><span ref={ref} hidden/>{indicators.map((element, index) => createPortal(
    <span className="omd-cds-quiet-dots" aria-hidden="true"><span/><span/><span/></span>, element, String(index),
  ))}{images.map((element,index) => createPortal(<ClaudeMediaControls image={element}/>, element.parentElement, 'image-' + index))}</>;
}

export function applyClaudeIntegration(ctx, getRuntime, { priority = 0 } = {}) {
  function Shell() {
    const runtime = getRuntime(), state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
    return state.active !== false && state.skins.find(skin => skin.id === state.selected)?.layout === 'claude-desktop'
      ? <ClaudeShell ctx={ctx}/> : null;
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'omd-claude-desktop', order: 10, priority }, Shell));
}
