import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MaterialIcon } from './appearance.jsx';

export const MATERIAL_LAYOUT = 'google-material-expressive';
const isMaterial = state => state.skins.find(s => s.id === state.selected)?.layout === MATERIAL_LAYOUT;
const focusables = root => [...root.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length && getComputedStyle(el).visibility === 'visible' && !el.closest('[inert]'));
function containTab(event, root) {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  const items = focusables(root), first = items[0], last = items.at(-1);
  if (!first) return;
  if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}

// Host actions own navigation. This mounted adapter adds modal focus handling
// and a scrim for small windows, and preserves the host's live right-pane width.
function Navigation({ ctx }) {
  const ref = useRef(null), [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const frame = ref.current?.closest('.pI_x6G_frame');
    if (!frame) return;
    const narrow = matchMedia('(max-width: 839px)'), sidebar = frame.querySelector('.pI_x6G_sidebarCol');
    let restoreInert = () => {}, modal = false, previousFocus;
    const close = () => { if (frame.dataset.sidebarCollapsed !== 'true') ctx.layout.toggleSidebar(); };
    const sync = () => {
      const right = frame.style.gridTemplateColumns.match(/(\d+(?:\.\d+)?px)\s*$/)?.[1] || '0px';
      if (frame.style.getPropertyValue('--gm-host-right-width') !== right) frame.style.setProperty('--gm-host-right-width', right);
      const open = narrow.matches && frame.dataset.sidebarCollapsed !== 'true';
      setExpanded(open);
      if (open === modal) return;
      modal = open;
      restoreInert(); restoreInert = () => {};
      if (open) {
        previousFocus = document.activeElement;
        const elements = [...frame.querySelectorAll(':scope > .pI_x6G_centerCol, :scope > .pI_x6G_rightbarCol')].map(el => [el, el.inert]);
        elements.forEach(([el]) => { el.inert = true; });
        restoreInert = () => elements.forEach(([el, value]) => { el.inert = value; });
        queueMicrotask(() => { if (modal && !document.querySelector('[role="dialog"]')) sidebar?.querySelector('.hHd-Xa_toggle')?.focus(); });
      } else if (previousFocus?.isConnected && !document.querySelector('[role="dialog"]')) previousFocus.focus();
    };
    const onClick = event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!modal || event.button !== 0 || !target || target.closest('.YDXeBa_rowActions')) return;
      if (target.closest('.YDXeBa_sessionRow, .hHd-Xa_newSession, .hHd-Xa_panelRow, .hHd-Xa_brand')) queueMicrotask(() => { if (modal && frame.isConnected) close(); });
    };
    const onKey = event => {
      if (event.defaultPrevented || !modal || document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (sidebar) containTab(event, sidebar);
    };
    const observer = new MutationObserver(sync);
    observer.observe(frame, { attributes: true, attributeFilter: ['data-sidebar-collapsed', 'style'] });
    narrow.addEventListener('change', sync); frame.addEventListener('click', onClick, true); document.addEventListener('keydown', onKey);
    sync();
    return () => { modal = false; observer.disconnect(); narrow.removeEventListener('change', sync); frame.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey); restoreInert(); frame.style.removeProperty('--gm-host-right-width'); };
  }, [ctx]);
  return <div ref={ref} className="gm-shell">{expanded && <button type="button" className="gm-nav-scrim" tabIndex={-1} aria-label="收起导航" onClick={() => ctx.layout.toggleSidebar()}/>}</div>;
}

function SettingsNavigation() {
  const ref = useRef(null), [overview, setOverview] = useState(false), [label, setLabel] = useState('设置');
  useEffect(() => {
    const panel = ref.current?.closest('.VOzbGW_panel'), nav = panel?.querySelector('.VOzbGW_nav');
    if (!panel || !nav) return;
    const sync = () => setLabel(nav.querySelector('[aria-current="true"]')?.textContent?.trim() || '设置');
    const onSelect = event => {
      if (!(event.target instanceof Element) || !event.target.closest('.VOzbGW_navCell')) return;
      setOverview(false);
      if (matchMedia('(max-width: 839px)').matches) queueMicrotask(() => ref.current?.focus());
    };
    const onKey = event => containTab(event, panel);
    const observer = new MutationObserver(sync);
    observer.observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-current'], childList: true, characterData: true });
    nav.addEventListener('click', onSelect); panel.addEventListener('keydown', onKey); sync();
    return () => { observer.disconnect(); nav.removeEventListener('click', onSelect); panel.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => {
    const panel = ref.current?.closest('.VOzbGW_panel');
    if (!overview || !panel) return;
    panel.querySelector('.VOzbGW_nav [aria-current="true"]')?.focus();
    const back = event => { if (event.key === 'Escape' && matchMedia('(max-width: 839px)').matches) { event.preventDefault(); event.stopPropagation(); setOverview(false); ref.current?.focus(); } };
    panel.addEventListener('keydown', back, true); return () => panel.removeEventListener('keydown', back, true);
  }, [overview]);
  return <button ref={ref} type="button" className="gm-settings-toggle" aria-label="设置分类" aria-expanded={overview} onClick={() => setOverview(value => !value)}><MaterialIcon name={overview ? 'arrow_back' : 'menu'}/><span>{overview ? '设置' : label}</span></button>;
}

export function applyMaterialIntegration(ctx, getRuntime) {
  function Shell() { const runtime = getRuntime(); const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot); return isMaterial(state) ? <Navigation ctx={ctx}/> : null; }
  function SettingsAction() { const runtime = getRuntime(); const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot); return isMaterial(state) ? <SettingsNavigation/> : null; }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'omd-material-navigation', order: 10 }, Shell));
  ctx.slots.inject('settings.action', () => ctx.slots.register({ name: 'settings.action', id: 'omd-material-settings-navigation', order: -10 }, SettingsAction));
}
