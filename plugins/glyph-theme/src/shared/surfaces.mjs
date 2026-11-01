// Both appearance providers decorate the same host shell, including when they
// are loaded from separate client bundles.
import { createAttributeMarkers } from './attribute-markers.mjs';

const trackerKey = Symbol.for('dsh.appearance.surfaces.v1');
const shellParts = '[data-rightbar-col],[data-shell-overlay],[data-sidebar-right-panel]';
const containsPart = node => node.nodeType === 1 && (node.matches(shellParts) ||
  (node.firstElementChild && node.querySelector(shellParts)));
const contentChild = parent => [...parent?.children ?? []].find(el => !el.hasAttribute('data-omd-background-layer'));

function track(doc) {
  const markers = createAttributeMarkers('data-omd-surface');
  const listeners = new Set();
  let parents, expected, regions;
  function refresh() {
    const next = new Map();
    const mark = (element, value) => { if (element) next.set(element, value); };
    const right = doc.querySelector('[data-rightbar-col]'), frame = right?.parentElement;
    const center = right?.previousElementSibling, sidebar = center?.previousElementSibling;
    parents = new Set([doc.body, frame, sidebar, center]);
    if (sidebar && frame?.querySelector(':scope > [data-shell-overlay]')) {
      mark(frame, 'frame'); mark(sidebar, 'sidebar-column'); mark(center, 'conversation'); mark(right, 'workbench-column');
      let root = contentChild(sidebar);
      if (root?.getAttribute('data-slot') === 'sidebar') { parents.add(root); root = contentChild(root); }
      mark(root, 'sidebar');
    }
    for (const panel of doc.querySelectorAll('[data-sidebar-right-panel]')) {
      parents.add(panel); mark(panel, 'workbench'); mark(contentChild(panel), 'workbench-body');
    }
    markers.update(next);
    expected = next;
    regions = { sidebar: markers.owns(sidebar, 'sidebar-column') ? sidebar : null, conversation: markers.owns(center, 'conversation') ? center : null };
    return regions;
  }
  const observer = new MutationObserver(records => {
    const changed = records.some(record => {
      if (record.type === 'attributes') {
        if (record.attributeName === 'data-omd-surface') return expected.has(record.target) && record.target.getAttribute('data-omd-surface') !== expected.get(record.target);
        if (record.attributeName === 'data-slot') return parents.has(record.target.parentElement);
        return true;
      }
      return parents.has(record.target) || [...record.addedNodes, ...record.removedNodes].some(containsPart);
    });
    if (changed) { refresh(); for (const notify of listeners) notify(regions); }
  });
  refresh();
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-omd-surface', 'data-rightbar-col', 'data-shell-overlay', 'data-sidebar-right-panel', 'data-slot'] });
  return { listeners, current: () => regions, dispose() { observer.disconnect(); markers.dispose(); } };
}

export function observeSurfaces(notify = () => {}, doc = document) {
  const tracker = doc[trackerKey] ??= track(doc);
  // Separate subscriptions remain independent even when they use the same callback.
  const listener = regions => notify(regions);
  tracker.listeners.add(listener); listener(tracker.current());
  return () => {
    if (tracker.listeners.delete(listener) && !tracker.listeners.size) {
      tracker.dispose(); delete doc[trackerKey];
    }
  };
}
