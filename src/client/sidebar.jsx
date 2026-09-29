import css from './sidebar.css';

function bindNarrowSidebar(ctx, frame) {
  const column = frame.querySelector('[data-omd-surface="sidebar-column"]');
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
      const covered = [...frame.querySelectorAll(':scope > [data-omd-surface="conversation"], :scope > [data-omd-surface="workbench-column"]')].map(el => [el, el.inert]);
      const attrs = ['role', 'aria-label', 'aria-modal'].map(name => [name, column.getAttribute(name)]);
      covered.forEach(([el]) => { el.inert = true; });
      column.setAttribute('role', 'dialog'); column.setAttribute('aria-label', '侧栏导航'); column.setAttribute('aria-modal', 'true');
      restore = () => {
        covered.forEach(([el, inert]) => { el.inert = inert; });
        for (const [name, value] of attrs) { if (value === null) column.removeAttribute(name); else column.setAttribute(name, value); }
      };
      queueMicrotask(() => { if (open && !otherOverlay()) column.querySelector('.hHd-Xa_toggle')?.focus({ preventScroll: true }); });
    } else {
      frame.style.removeProperty('--omd-sidebar-right-width');
      if (frame.dataset.sidebarCollapsed === 'true' && previousFocus?.isConnected && !otherOverlay()) previousFocus.focus({ preventScroll: true });
    }
  };
  const onClick = event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!open || event.button !== 0 || !target || target.closest('[class*="_rowActions"]')) return;
    if (target.closest('[data-row-key^="session:"], [class*="_searchResultRow"], .hHd-Xa_newSession, .hHd-Xa_panelRow')) queueMicrotask(close);
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
  const focus = row => { if (row) { current = row.dataset.rowKey; row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'nearest', inline: 'nearest' }); sync(); } };
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
      const visibleMenu = menu => menu.getClientRects().length && getComputedStyle(menu).visibility !== 'hidden' && !menu.closest('[hidden],[aria-hidden="true"]');
      const existing = new Set([...document.querySelectorAll('[role="menu"]')].filter(visibleMenu));
      trigger?.focus(); trigger?.click();
      cancelAnimationFrame(menuFrame); menuObserver?.disconnect();
      menuFrame = requestAnimationFrame(() => {
        if (document.activeElement !== trigger || !root.contains(trigger)) return;
        const opened = [...document.querySelectorAll('[role="menu"]')].find(menu => !existing.has(menu) && visibleMenu(menu));
        if (!opened) return;
        // Slot-backed menu rows can mount after the portal itself. Wait for
        // that actual row, and never reclaim focus after the user moves away.
        const enter = () => {
          cancelAnimationFrame(menuFrame);
          if (!opened.isConnected) {
            menuObserver?.disconnect();
            // The native Menu returns to its button. A keyboard context menu
            // started on the tree row. Pinning can also remount that row; wait
            // for native dialog/selection focus before finding its new node.
            menuFrame = requestAnimationFrame(() => {
              if (document.activeElement !== trigger && document.activeElement !== document.body) return;
              const target = row.isConnected ? row : rows().find(item => item.dataset.rowKey === row.dataset.rowKey);
              focus(target);
            });
            return;
          }
          if (document.activeElement !== trigger) {
            if (!opened.contains(document.activeElement)) menuObserver?.disconnect();
            return;
          }
          const first = opened.querySelector('[role="menuitem"]:not(:disabled)');
          if (first?.getClientRects().length && getComputedStyle(first).visibility !== 'hidden') first.focus();
          // Keep observing removal while focus remains in this menu. Dialogs
          // and outside clicks retain the focus chosen by their native owner.
          // The host temporarily hides menu rows while placing a portal.
          // CSS visibility can settle without a DOM mutation.
          if (first && document.activeElement !== first) menuFrame = requestAnimationFrame(enter);
        };
        menuObserver = new MutationObserver(enter);
        menuObserver.observe(opened, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
        if (opened.parentElement) menuObserver.observe(opened.parentElement, { childList: true });
        enter();
      });
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
      const root = sidebar?.querySelector('[class*="_sectionHeader"]')?.parentElement;
      for (const [element, record] of owned) if (element !== root) { restore(element, record); owned.delete(element); }
      if (!root) return;
      if (!owned.has(root)) {
        const attributes = ['data-omd-sidebar-browser', 'data-wide'].map(name => [name, root.getAttribute(name)]);
        root.setAttribute('data-omd-sidebar-browser', '');
        const keyboard = bindTreeKeyboard(root), frame = sidebar.closest('[data-omd-surface="frame"]');
        const overlay = frame ? bindNarrowSidebar(ctx, frame) : () => {};
        owned.set(root, { attributes, dispose: () => { keyboard(); overlay(); } });
      }
      const wide = [...root.classList].some(name => name.endsWith('_rail')) ? 'false' : 'true';
      if (root.getAttribute('data-wide') !== wide) root.setAttribute('data-wide', wide);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-omd-surface'] });
    sync();
    return () => { observer.disconnect(); for (const [root, record] of owned) restore(root, record); owned.clear(); style.remove(); };
  });
}
