// Content is not chrome. In particular, SVG also carries chart labels, math,
// hit targets and live scenes; it is not an icon merely because it is an SVG.
export const NATIVE_CONTENT = '[data-glyph-external], [data-message-attachments], iframe, [data-document-preview], [data-file-preview], .monaco-editor, .cm-editor, .katex, .MathJax, mjx-container, math, .mermaid, .iui-chart, .iui-diagram, .iui-figure-content, .omc-chart, .omc-hbars, .omc-stackbar, .omc-strip, .omc-ring';
const ICON_HOST = 'button, summary, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="treeitem"]';
const CONTENT_NODE = 'text, foreignObject, image, a, [tabindex], [role], animate, animateTransform, animateMotion, set';

export function isChromeIcon(svg, rect) {
  if (svg.closest(NATIVE_CONTENT) || svg.parentElement?.closest('svg')) return false;
  if (rect.width > 48 || rect.height > 48 || rect.width / rect.height > 2.5 || rect.height / rect.width > 2.5) return false;
  if (svg.hasAttribute('tabindex') || ![null, 'img', 'presentation', 'none'].includes(svg.getAttribute('role'))) return false;
  // Ignore our generated glyph text, but never native text or interactive SVG.
  if ([...svg.querySelectorAll(CONTENT_NODE)].some(node => !node.closest('[data-glyph-content]'))) return false;
  return svg.getAttribute('aria-hidden') === 'true' || !!svg.closest(ICON_HOST);
}

export function isBareToggle(el) {
  if (el.tagName === 'INPUT') return true;
  // Labelled switches and rich radio cards own their text and native visuals.
  // Only replace the small, text-free visual primitive, never the whole card.
  const copy = el.cloneNode(true);
  for (const node of copy.querySelectorAll('svg, .omd-glyph-chrome')) node.remove();
  return !copy.textContent.trim() && !el.querySelector('input, select, textarea');
}

export function inClosedDetails(el) {
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName !== 'DETAILS' || parent.open) continue;
    const summary = [...parent.children].find(child => child.tagName === 'SUMMARY');
    if (!summary?.contains(el)) return true;
  }
  return false;
}

// Share ancestor classification only during one synchronous geometry read.
// Scrolling and native mutations get a fresh check on the next measurement.
export function createContentExclusion(selector) {
  const cache = new Map();
  return el => {
    const pending = [];
    let parent = el;
    while (parent && !cache.has(parent)) { pending.push(parent); parent = parent.parentElement; }
    let excluded = parent ? cache.get(parent) : false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const node = pending[i], owner = node.parentElement;
      excluded = excluded || node.matches(selector) || owner?.tagName === 'DETAILS' && !owner.open
        && ![...owner.children].find(child => child.tagName === 'SUMMARY')?.contains(node);
      cache.set(node, excluded);
    }
    return excluded;
  };
}
