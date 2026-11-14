import { useLayoutEffect, useState } from 'react';

// Position our interactive portals independently of the host's private hooks.
// Controls and dismissal still use the public DSH primitives.
export function useAnchoredPosition({ open, anchorRef, panelRef, side = 'bottom', gap = 8, margin = 12 }) {
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    const anchor = anchorRef.current, panel = panelRef.current;
    if (!anchor || !panel) { setPosition(null); return; }
    const view = anchor.ownerDocument.defaultView, viewport = view.visualViewport;
    const place = () => {
      const a = anchor.getBoundingClientRect(), p = panel.getBoundingClientRect();
      const x = (viewport?.offsetLeft ?? 0) + margin, y = (viewport?.offsetTop ?? 0) + margin;
      const width = Math.max(0, (viewport?.width ?? view.innerWidth) - 2 * margin);
      const height = Math.max(0, (viewport?.height ?? view.innerHeight) - 2 * margin);
      const w = Math.min(p.width, width), h = Math.min(p.height, height);
      const above = a.top - gap - y, below = y + height - a.bottom - gap;
      const topSide = side === 'top' ? above >= h || above >= below : below < h && above > below;
      const next = {
        left: Math.max(x, Math.min(a.right - w, x + width - w)),
        top: Math.max(y, Math.min(topSide ? a.top - gap - h : a.bottom + gap, y + height - h)),
        maxWidth: width, maxHeight: height, overflowY: 'auto',
      };
      setPosition(old => old && Object.keys(next).every(key => old[key] === next[key]) ? old : next);
    };
    place();
    const observer = new view.ResizeObserver(place);
    observer.observe(anchor); observer.observe(panel);
    view.addEventListener('resize', place);
    view.addEventListener('scroll', place, true);
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    return () => {
      observer.disconnect();
      view.removeEventListener('resize', place);
      view.removeEventListener('scroll', place, true);
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
    };
  }, [open, anchorRef, panelRef, side, gap, margin]);
  return open ? position : null;
}
