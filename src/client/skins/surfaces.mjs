// rc.2 desktop and npm builds use different CSS module hashes. The public
// right-column and overlay markers identify the same three-column structure.
// Add owned visual hooks; never reparent or replace host-owned nodes.
export function createSurfaceMarkers(doc = document) {
  const attribute = 'data-omd-surface', owned = new Map();
  const release = (element, record) => {
    if (element.getAttribute(attribute) !== record.value) return;
    if (record.previous === null) element.removeAttribute(attribute);
    else element.setAttribute(attribute, record.previous);
  };
  const contentChild = parent => [...parent?.children || []].find(el => !el.hasAttribute('data-omd-background-layer'));
  return {
    refresh() {
      const next = new Map();
      const mark = (element, value) => { if (element) next.set(element, value); };
      const right = doc.querySelector('[data-rightbar-col]'), frame = right?.parentElement;
      const center = right?.previousElementSibling, sidebar = center?.previousElementSibling;
      if (sidebar && frame?.querySelector(':scope > [data-shell-overlay]')) {
        mark(frame, 'frame'); mark(sidebar, 'sidebar-column'); mark(center, 'conversation'); mark(right, 'workbench-column');
        let root = contentChild(sidebar);
        if (root?.getAttribute('data-slot') === 'sidebar') root = contentChild(root);
        mark(root, 'sidebar');
      }
      for (const panel of doc.querySelectorAll('[data-sidebar-right-panel]')) {
        mark(panel, 'workbench'); mark(contentChild(panel), 'workbench-body');
      }
      for (const [element, record] of owned) if (!next.has(element)) { release(element, record); owned.delete(element); }
      for (const [element, value] of next) {
        if (!owned.has(element)) owned.set(element, { previous: element.getAttribute(attribute), value });
        else owned.get(element).value = value;
        if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
      }
      return { sidebar: sidebar && next.has(sidebar) ? sidebar : null, conversation: center && next.has(center) ? center : null };
    },
    dispose() { for (const [element, record] of owned) release(element, record); owned.clear(); },
  };
}
