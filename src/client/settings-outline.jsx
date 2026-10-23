import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Menu, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { subscribeSettingsAnchor, takeSettingsAnchor } from './settings-nav.mjs';

export const SETTINGS_SECTIONS = [
  ['features', '功能'], ['personality', '人格'], ['context', '上下文与记忆'], ['models', '后台模型'],
  ['background', '全局背景'], ['agents', '智能体'], ['about', '关于'], ['advanced', '高级'],
].map(([id, label]) => ({ id, label }));

export function SettingsOutline({ active, navigate }) {
  const [open, setOpen] = useState(false), compact = useRef(null);
  // A portalled menu must close when its compact trigger disappears on resize.
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (!compact.current?.getClientRects().length) setOpen(false);
    });
    observer.observe(compact.current.parentElement);
    return () => observer.disconnect();
  }, []);
  return <>
    <nav className="omd-set-outline" aria-label="Oh My DSH 本页目录">
      <span className="omd-set-outline-label">本页目录</span>
      <div className="omd-set-outline-items">
        {SETTINGS_SECTIONS.map(({ id, label }) => <Button key={id} type="button" variant="ghost" size="sm"
          className="omd-set-outline-link" aria-current={active === id ? 'location' : undefined}
          onClick={() => navigate(id)}>{label}</Button>)}
      </div>
    </nav>
    <div className="omd-set-outline-compact" ref={compact}>
      <span className="omd-set-outline-label">本页目录</span>
      <Menu open={open} onClose={() => setOpen(false)} portal align="end" selectedId={active}
        items={SETTINGS_SECTIONS} onSelect={id => { setOpen(false); navigate(id); }}
        anchor={<Button type="button" variant="outline" size="sm" aria-label="跳转到设置分组"
          aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          {SETTINGS_SECTIONS.find(section => section.id === active)?.label}<IconChevronDownOutlineRegular/>
        </Button>}/>
    </div>
  </>;
}

export function useSettingsOutline(body, page, ready, setPage) {
  const [active, setActive] = useState('features'), [request, setRequest] = useState(null);
  const controller = useRef(null), enabled = ready && page === 'main';
  const navigate = useCallback(anchor => {
    if (anchor !== 'dream' && !SETTINGS_SECTIONS.some(section => section.id === anchor)) return;
    setRequest({ anchor }); setPage('main');
  }, [setPage]);

  // Keep a requested destination while data is loading or a subpage is mounted.
  useEffect(() => {
    const receive = () => { const anchor = takeSettingsAnchor(); if (anchor) navigate(anchor); };
    receive(); return subscribeSettingsAnchor(receive);
  }, [navigate]);

  useLayoutEffect(() => {
    if (!enabled || !body.current) return;
    const root = body.current, view = root.ownerDocument.defaultView;
    const sections = SETTINGS_SECTIONS.map(({ id }) => ({ id, node: root.querySelector(`[data-anchor="${id}"]`) })).filter(section => section.node);
    let frame = 0, jump = null;
    const offset = 12;
    const position = target => Math.max(0, Math.min(root.scrollHeight - root.clientHeight,
      root.scrollTop + target.getBoundingClientRect().top - root.getBoundingClientRect().top - offset));
    const update = () => {
      frame = 0;
      if (jump) {
        const reached = Math.abs(root.scrollTop - jump.top) < 2;
        if (reached) jump.settled = true;
        // Hold the clicked group at a clamped end position, but release as soon
        // as the user scrolls. Intermediate smooth-scroll sections never flash.
        if (reached || (!jump.settled && view.performance.now() - jump.started < 1500)) return;
        jump = null;
      }
      const top = root.getBoundingClientRect().top + offset + 2;
      let current = sections[0]?.id;
      for (const { id, node } of sections) if (node.getBoundingClientRect().top <= top) current = id;
      const max = root.scrollHeight - root.clientHeight;
      if (max > 2 && root.scrollTop >= max - 2) current = sections.at(-1)?.id;
      if (current) setActive(current);
    };
    const schedule = () => { if (!frame) frame = view.requestAnimationFrame(update); };
    const interrupt = () => {
      if (jump && !jump.settled) root.scrollTo({ top: root.scrollTop, behavior: 'instant' });
      jump = null; schedule();
    };
    const onKey = event => {
      if (event.target.closest('input, textarea, select, [contenteditable="true"], [role="menu"]')) return;
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) interrupt();
    };
    controller.current = anchor => {
      const target = root.querySelector(`[data-anchor="${anchor}"]`);
      if (!target) return;
      for (let ancestor = target; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
        if (ancestor.tagName === 'DETAILS') ancestor.open = true;
      }
      const section = sections.find(({ node }) => node === target || node.contains(target));
      if (!section) return;
      const top = position(target);
      jump = { target, top, started: view.performance.now(), settled: false };
      setActive(section.id);
      (target.querySelector('h3, summary') || section.node.querySelector('h3, summary'))?.focus({ preventScroll: true });
      root.scrollTo({ top, behavior: view.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      schedule();
    };
    root.addEventListener('scroll', schedule, { passive: true });
    for (const name of ['wheel', 'touchstart', 'pointerdown']) root.addEventListener(name, interrupt, { passive: true });
    root.addEventListener('keydown', onKey);
    const observer = new ResizeObserver(() => {
      // Persona/background reads and width changes can move the destination
      // after the initial jump. Keep it aligned until the user takes over.
      if (jump) {
        const top = position(jump.target);
        if (Math.abs(top - jump.top) >= 2) {
          jump.top = top; jump.started = view.performance.now(); jump.settled = false;
          root.scrollTo({ top, behavior: 'instant' });
        }
      }
      schedule();
    });
    observer.observe(root);
    for (const { node } of sections) observer.observe(node);
    update();
    return () => {
      controller.current = null;
      if (jump && !jump.settled) root.scrollTo({ top: root.scrollTop, behavior: 'instant' });
      view.cancelAnimationFrame(frame); observer.disconnect();
      root.removeEventListener('scroll', schedule);
      for (const name of ['wheel', 'touchstart', 'pointerdown']) root.removeEventListener(name, interrupt);
      root.removeEventListener('keydown', onKey);
    };
  }, [body, enabled]);

  useLayoutEffect(() => {
    if (!enabled || !request || !controller.current) return;
    controller.current(request.anchor); setRequest(null);
  }, [enabled, request]);
  return { active, navigate, enabled };
}
