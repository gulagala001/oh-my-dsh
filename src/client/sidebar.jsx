import css from './sidebar.css';
import { acquireOverlayInert } from './overlay-inert.mjs';
import { createAttributeMarkers } from './attribute-markers.mjs';

// Class suffixes are verified against the official browser/desktop modules.
// Keep styling hooks local to the native sidebar without owning its React tree.
const navParts = new Map([
  ['toggle', 'toggle'],
  ['logoRow', 'brand'], ['newSession', 'create'], ['newSessionContent', 'create-content'],
  ['panelList', 'panels'], ['panelRow', 'panel'], ['footArea', 'footer'],
  ['sectionHeader', 'header'], ['searchSlot', 'search-slot'], ['search', 'search'],
  ['searchButton', 'search-button'], ['sectionLabel', 'section-label'], ['headerActions', 'header-actions'],
  ['title', 'title'], ['time', 'time'], ['rowActions', 'row-actions'], ['iconButton', 'row-action'],
  ['pinIndicator', 'pin'], ['searchResultTitle', 'search-result-title'], ['searchResultRow', 'search-result-row'],
]);

function createNavMarkers() {
  const markers = createAttributeMarkers('data-omd-nav-part');
  return {
    refresh(sidebar) {
      const next = new Map();
      const prefix = token => token?.slice(0, token.lastIndexOf('_'));
      const rootToken = [...sidebar?.classList ?? []].find(token => token.endsWith('_root'));
      const header = sidebar?.querySelector('[class*="_sectionHeader"]');
      const row = sidebar?.querySelector('[role="treeitem"]');
      const prefixes = new Set([rootToken,
        [...header?.classList ?? []].find(token => token.endsWith('_sectionHeader')),
        [...row?.classList ?? []].find(token => /_(row|projectRow|sessionRow|searchResultRow)$/.test(token)),
      ].filter(Boolean).map(prefix));
      for (const element of sidebar?.querySelectorAll('[class]') ?? []) {
        const part = [...element.classList].filter(token => prefixes.has(prefix(token)))
          .map(token => navParts.get(token.slice(token.lastIndexOf('_') + 1))).find(Boolean);
        if (part) next.set(element, part);
      }
      markers.update(next);
    },
    dispose() { markers.dispose(); },
  };
}

function bindNarrowSidebar(ctx, frame, column) {
  if (!frame || !column) return () => {};
  const narrow = matchMedia('(max-width: 719px)');
  const scrim = document.createElement('button');
  scrim.className = 'omd-sidebar-scrim'; scrim.type = 'button'; scrim.tabIndex = -1;
  scrim.setAttribute('aria-label', '收起侧栏'); scrim.hidden = true; frame.append(scrim);
  let open = false, previousFocus, restore = () => {};
  const otherOverlay = () => [...document.querySelectorAll('[role="dialog"],[role="menu"]')].some(el => el !== column && el.getClientRects().length);
  const close = () => { if (open && frame.dataset.sidebarCollapsed !== 'true') ctx.layout.toggleSidebar(); };
  const sync = () => {
    const next = narrow.matches && !document.documentElement.hasAttribute('data-omd-layout')
      && frame.dataset.sidebarCollapsed !== 'true' && !frame.hasAttribute('data-rightbar-fullscreen');
    if (next) {
      const right = frame.style.gridTemplateColumns.match(/(\d+(?:\.\d+)?px)\s*$/)?.[1] || '0px';
      if (frame.style.getPropertyValue('--omd-sidebar-right-width') !== right) frame.style.setProperty('--omd-sidebar-right-width', right);
    }
    if (next === open) return;
    open = next; restore(); restore = () => {};
    scrim.hidden = !open; frame.toggleAttribute('data-omd-sidebar-overlay', open);
    if (open) {
      previousFocus = document.activeElement;
      const releaseInert = acquireOverlayInert(frame.querySelectorAll(':scope > [data-omd-surface="conversation"], :scope > [data-omd-surface="workbench-column"]'));
      const attrs = ['role', 'aria-label', 'aria-modal'].map(name => [name, column.getAttribute(name)]);
      column.setAttribute('role', 'dialog'); column.setAttribute('aria-label', '侧栏导航'); column.setAttribute('aria-modal', 'true');
      restore = () => {
        releaseInert();
        for (const [name, value] of attrs) { if (value === null) column.removeAttribute(name); else column.setAttribute(name, value); }
      };
      queueMicrotask(() => { if (open && !otherOverlay()) column.querySelector('[data-omd-nav-part="toggle"]')?.focus({ preventScroll: true }); });
    } else {
      frame.style.removeProperty('--omd-sidebar-right-width');
      if (frame.dataset.sidebarCollapsed === 'true' && previousFocus?.isConnected && !otherOverlay()) previousFocus.focus({ preventScroll: true });
    }
  };
  const onClick = event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!open || event.button !== 0 || !target || target.closest('[class*="_rowActions"]')) return;
    if (target.closest('[data-row-key^="session:"], [class*="_searchResultRow"], [data-omd-nav-part="create"], [data-omd-nav-part="panel"]')) queueMicrotask(close);
  };
  const onKey = event => {
    if (!open || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || otherOverlay()) return;
    if (event.key === 'Escape' && !event.target.matches('input,textarea,select,[contenteditable="true"]')) { event.preventDefault(); close(); }
    else if (event.key === 'Tab') {
      const items = [...column.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')]
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility === 'visible' && el.tabIndex >= 0 && !el.closest('[inert]'));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !column.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !column.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
  };
  const observer = new MutationObserver(sync);
  observer.observe(frame, { attributes: true, attributeFilter: ['data-sidebar-collapsed', 'data-rightbar-fullscreen', 'style'] });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-omd-layout'] });
  narrow.addEventListener('change', sync); scrim.addEventListener('click', close);
  column.addEventListener('click', onClick, true); document.addEventListener('keydown', onKey); sync();
  return () => {
    open = false; observer.disconnect(); narrow.removeEventListener('change', sync); scrim.removeEventListener('click', close);
    column.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey); restore(); scrim.remove();
    frame.removeAttribute('data-omd-sidebar-overlay'); frame.style.removeProperty('--omd-sidebar-right-width');
  };
}

// Keep host rows, stores and actions. This adapter supplies the missing keyboard
// navigation for the maintained host's tree without owning its session data.
function bindTreeKeyboard(root) {
  const selector = '[role="treeitem"]', owned = new Map();
  let current, focusedRow, menuFrame, menuObserver, searchFrame;
  const rows = () => [...root.querySelectorAll(selector)].filter(row => row.getClientRects().length && !row.closest('[inert],[aria-hidden="true"]'));
  const write = (row, value) => {
    if (!owned.has(row)) owned.set(row, row.getAttribute('tabindex'));
    if (row.tabIndex !== value || !row.hasAttribute('tabindex')) row.tabIndex = value;
  };
  const sync = () => {
    if (focusedRow && !focusedRow.dataset.rowKey && !root.contains(focusedRow) && document.activeElement === document.body) {
      focusedRow = null;
      const search = root.querySelector('input[class*="_searchInput"]');
      if (search?.tabIndex >= 0 && search.getClientRects().length) search.focus({ preventScroll: true });
    }
    const items = rows(), focused = document.activeElement?.closest?.(selector);
    const active = items.find(row => row === focused) || items.find(row => row.getAttribute('aria-selected') === 'true')
      || items.find(row => row.dataset.rowKey === current) || items[0];
    if (active) current = active.dataset.rowKey;
    for (const row of items) write(row, row === active ? 0 : -1);
    for (const [row, previous] of owned) if (!root.contains(row)) {
      if (previous === null) row.removeAttribute('tabindex'); else row.setAttribute('tabindex', previous);
      owned.delete(row);
    }
  };
  const focus = row => { if (row) { current = row.dataset.rowKey; write(row, 0); row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'nearest', inline: 'nearest' }); sync(); } };
  const onFocus = event => {
    const row = event.target.closest?.(selector);
    focusedRow = row && root.contains(row) ? row : null;
    if (focusedRow) { current = row.dataset.rowKey; sync(); }
  };
  const onKey = event => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
    const search = root.querySelector('input[class*="_searchInput"]');
    if (event.target === search && event.key === 'Escape' && !event.shiftKey) {
      cancelAnimationFrame(searchFrame);
      searchFrame = requestAnimationFrame(() => {
        if (document.activeElement === search && search.tabIndex < 0) root.querySelector('button[class*="_searchButton"]')?.focus({ preventScroll: true });
      });
      return;
    }
    if (event.target === search && event.key === 'ArrowDown' && !event.shiftKey) {
      const first = rows()[0];
      if (first) { event.preventDefault(); focus(first); }
      return;
    }
    const row = event.target.closest?.(selector);
    if (!row || event.target !== row) return;
    const items = rows(), index = items.indexOf(row);
    let next;
    if (event.key === 'ArrowDown') next = items[Math.min(index + 1, items.length - 1)];
    else if (event.key === 'ArrowUp') next = items[Math.max(index - 1, 0)];
    else if (event.key === 'Home') next = items[0];
    else if (event.key === 'End') next = items.at(-1);
    else if (event.key === 'ArrowRight') {
      if (row.getAttribute('aria-expanded') === 'false') row.click();
      else if (row.getAttribute('aria-expanded') === 'true') {
        const group = row.closest('[class*="_groupSection"]');
        next = items.find(item => item !== row && group?.contains(item));
      }
    } else if (event.key === 'ArrowLeft') {
      if (row.getAttribute('aria-expanded') === 'true') row.click();
      else {
        let group = row.closest('[class*="_groupSection"]');
        if (row.dataset.rowKey?.startsWith('workspace:')) group = group?.parentElement.closest('[class*="_groupSection"]');
        next = group?.querySelector('[role="treeitem"][data-row-key^="workspace:"]');
      }
    } else if (event.key === 'Enter' || event.key === ' ') row.click();
    else if (event.key === 'Escape' && !row.dataset.rowKey && search) {
      search.focus({ preventScroll: true }); event.stopPropagation();
    }
    else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      // Menu owns a wrapper; bare inline actions (e.g. New Session for an
      // ungrouped bucket) must never be activated by the context-menu key.
      const trigger = row.querySelector('[class*="_rowActions"] > [class*="_root_"] > button');
      if (!trigger) return;
      const existing = new Set(document.querySelectorAll('[role="menu"]'));
      cancelAnimationFrame(menuFrame); menuObserver?.disconnect();
      let opened;
      const enter = () => {
        cancelAnimationFrame(menuFrame);
        opened ||= [...document.querySelectorAll('[role="menu"]')].find(menu => !existing.has(menu));
        if (!opened) return;
        if (!opened.isConnected) {
          menuObserver.disconnect();
          // Native dialogs and outside clicks keep their own focus. Pinning can
          // remount the row, so resolve its identity after native cleanup settles.
          menuFrame = requestAnimationFrame(() => {
            if (document.activeElement !== trigger && document.activeElement !== document.body) return;
            focus(row.isConnected ? row : rows().find(item => item.dataset.rowKey === row.dataset.rowKey));
          });
          return;
        }
        if (document.activeElement !== trigger) {
          if (document.activeElement !== document.body && !opened.contains(document.activeElement)) menuObserver.disconnect();
          return;
        }
        const first = opened.querySelector('[role="menuitem"]:not(:disabled)');
        if (first?.getClientRects().length && getComputedStyle(first).visibility === 'visible') first.focus();
        if (first && document.activeElement !== first) menuFrame = requestAnimationFrame(enter);
      };
      // Subscribe before opening: native/assistive focus can enter the menu
      // before our first frame, but that must not skip close observation.
      menuObserver = new MutationObserver(enter);
      menuObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      trigger.focus(); trigger.click(); enter();
    }
    else return;
    event.preventDefault();
    focus(next);
  };
  const observer = new MutationObserver(sync);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'aria-expanded', 'hidden', 'inert'] });
  root.addEventListener('keydown', onKey); document.addEventListener('focusin', onFocus); sync();
  return () => {
    observer.disconnect(); cancelAnimationFrame(menuFrame); cancelAnimationFrame(searchFrame); menuObserver?.disconnect(); root.removeEventListener('keydown', onKey); document.removeEventListener('focusin', onFocus);
    for (const [row, previous] of owned) {
      if (previous === null) row.removeAttribute('tabindex'); else row.setAttribute('tabindex', previous);
    }
  };
}

export function applySidebarPresentation(ctx) {
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.omdSidebarStyle = ''; style.textContent = css; document.head.append(style);
    const navMarkers = createNavMarkers();
    const owned = new Map();
    const restore = (root, record) => {
      record.dispose();
      for (const [name, value] of record.attributes) {
        if (value === null) root.removeAttribute(name); else root.setAttribute(name, value);
      }
    };
    const sync = () => {
      // Header class suffixes identify the host-owned workspace browser across
      // npm/desktop hash variants. Never replace its child-slot declarations.
      const sidebar = document.querySelector('[data-omd-surface="sidebar"]');
      navMarkers.refresh(sidebar);
      const root = sidebar?.querySelector('[class*="_sectionHeader"]')?.parentElement;
      for (const [element, record] of owned) if (element !== root) { restore(element, record); owned.delete(element); }
      if (!root) return;
      if (!owned.has(root)) {
        const attributes = ['data-omd-sidebar-browser', 'data-wide'].map(name => [name, root.getAttribute(name)]);
        root.setAttribute('data-omd-sidebar-browser', '');
        const keyboard = bindTreeKeyboard(root);
        const record = { attributes, frame: null, column: null, overlay: () => {} };
        record.dispose = () => { keyboard(); record.overlay(); };
        owned.set(root, record);
      }
      const record = owned.get(root), frame = sidebar.closest('[data-omd-surface="frame"]');
      const column = frame?.querySelector('[data-omd-surface="sidebar-column"]') ?? null;
      if (record.frame !== frame || record.column !== column) {
        record.overlay(); record.frame = frame; record.column = column;
        record.overlay = bindNarrowSidebar(ctx, frame, column);
      }
      const wide = [...root.classList].some(name => name.endsWith('_rail')) ? 'false' : 'true';
      if (root.getAttribute('data-wide') !== wide) root.setAttribute('data-wide', wide);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-omd-surface'] });
    sync();
    return () => { observer.disconnect(); for (const [root, record] of owned) restore(root, record); owned.clear(); navMarkers.dispose(); style.remove(); };
  });
}
