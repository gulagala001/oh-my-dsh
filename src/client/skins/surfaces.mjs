// rc.2 desktop and npm builds use different CSS module hashes. The public
// right-column and overlay markers identify the same three-column structure.
// Add owned visual hooks; never reparent or replace host-owned nodes.
import { createAttributeMarkers } from '../attribute-markers.mjs';

export function createSurfaceMarkers(doc = document) {
  const markers = createAttributeMarkers('data-omd-surface');
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
      markers.update(next);
      return { sidebar: markers.owns(sidebar, 'sidebar-column') ? sidebar : null, conversation: markers.owns(center, 'conversation') ? center : null };
    },
    dispose() { markers.dispose(); },
  };
}
