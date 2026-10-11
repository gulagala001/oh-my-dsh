import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuMenuItem, CodexCuMenuSurface } from './codex-cu-primitives.jsx';
import { CODEX_CU_COPY } from './codex-cu-copy.mjs';
import { CodexAnnotationColorControl } from './codex-annotation-color.jsx';
import { CodexAnnotationLengthControl, CodexAnnotationOpacityControl } from './codex-annotation-number.jsx';

// gn/vn and yn/bn, annotation-comment-editor-card. These are source options,
// not an enumeration of the fonts installed on the host computer.
export const CODEX_ANNOTATION_FONT_OPTIONS = Object.freeze([
  { label: 'Inter', value: '"Inter Variable", Arial, sans-serif' },
  { label: 'System', value: 'system-ui, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' },
]);
export const CODEX_ANNOTATION_WEIGHT_OPTIONS = Object.freeze(['100', '200', '300', '400', '500', '600', '700', '800', '900'].map(value => ({ value })));
const message = (id, english, locale) => locale.startsWith('zh') ? CODEX_CU_COPY[id]?.simplifiedChinese ?? CODEX_CU_COPY[id]?.english ?? english : CODEX_CU_COPY[id]?.english ?? english;
const option = (id, english, value, locale) => ({ label: message('browserSidebarDesignEditor.' + id, english, locale), value });
const normalizeDefault = (value, defaultValue, options) => value === 'normal' ? options.map(item => item.value === defaultValue ? { ...item, value } : item) : options;
const addObserved = (observed, options) => {
  const known = new Set(options.map(item => item.value)), additional = observed.flatMap(value => typeof value !== 'string' || !value.trim() || known.has(value) ? [] : (known.add(value), [{ value }]));
  return additional.length ? [...additional, ...options] : options;
};
export function getCodexAnnotationSuggestions({ property, value = '', previousValue = '', locale = 'zh-CN' }) {
  if (property === 'font-family') return addObserved([value, previousValue], CODEX_ANNOTATION_FONT_OPTIONS);
  if (property === 'font-weight') return addObserved([value], CODEX_ANNOTATION_WEIGHT_OPTIONS);
  if (property === 'flex-direction') return addObserved([value], [option('horizontalFlexDirection', 'Horizontal', 'row', locale), option('horizontalReverseFlexDirection', 'Horizontal reverse', 'row-reverse', locale), option('verticalFlexDirection', 'Vertical', 'column', locale), option('verticalReverseFlexDirection', 'Vertical reverse', 'column-reverse', locale)]);
  if (property === 'justify-content') return addObserved([value], normalizeDefault(value, 'flex-start', [option('startDistribution', 'Start', 'flex-start', locale), option('centerDistribution', 'Center', 'center', locale), option('endDistribution', 'End', 'flex-end', locale), option('spaceBetweenDistribution', 'Space between', 'space-between', locale), option('spaceAroundDistribution', 'Space around', 'space-around', locale), option('spaceEvenlyDistribution', 'Space evenly', 'space-evenly', locale)]));
  if (property === 'align-items') return addObserved([value], normalizeDefault(value, 'stretch', [option('startAlignment', 'Start', 'flex-start', locale), option('centerAlignment', 'Center', 'center', locale), option('endAlignment', 'End', 'flex-end', locale), option('stretchAlignment', 'Stretch', 'stretch', locale), option('baselineAlignment', 'Baseline', 'baseline', locale)]));
  return [];
}

export function CodexAnnotationEnumControl({ ariaLabel, property, value = '', previousValue = '', placeholderValue,
  isEdited = false, disabled = false, suggestions: suppliedSuggestions, portalContainer, onOpenChange,
  onValueChange, locale = 'zh-CN', className = '' }) {
  const suggestions = suppliedSuggestions ?? getCodexAnnotationSuggestions({ property, value, previousValue, locale });
  const [open, setOpen] = useState(false), [position, setPosition] = useState(null);
  const anchor = useRef(null), panel = useRef(null), input = useRef(null), container = useRef(null);
  const updateOpen = next => { setOpen(next); onOpenChange?.(next); };
  const canWrite = !disabled && typeof onValueChange === 'function';
  const choose = next => { if (canWrite) onValueChange(next); updateOpen(false); (input.current ?? anchor.current)?.focus(); };
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const root = portalContainer ?? anchor.current.closest('[data-codex-cu-scope]') ?? anchor.current.parentElement;
    container.current = root;
    const measure = () => {
      const box = anchor.current.getBoundingClientRect(), bounds = root.getBoundingClientRect(), width = Math.min(220, Math.max(180, box.width));
      const below = root.clientHeight - (box.bottom - bounds.top) - 8, top = below >= 80 ? box.bottom - bounds.top + 4 : Math.max(8, box.top - bounds.top - Math.min(220, suggestions.length * 32 + 8) - 4);
      setPosition({ position: 'absolute', left: Math.max(8, Math.min(root.clientWidth - width - 8, box.right - bounds.left - width)), top, width, maxHeight: Math.max(40, Math.min(220, root.clientHeight - top - 8)), '--radix-dropdown-menu-content-available-width': root.clientWidth + 'px', '--radix-dropdown-menu-content-available-height': Math.max(40, root.clientHeight - top - 8) + 'px' });
    };
    measure(); const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure); observer?.observe(root); observer?.observe(anchor.current);
    const outside = event => { if (!panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) updateOpen(false); };
    document.addEventListener('pointerdown', outside); root.addEventListener('scroll', measure, true);
    return () => { observer?.disconnect(); document.removeEventListener('pointerdown', outside); root.removeEventListener('scroll', measure, true); };
  }, [open, portalContainer, suggestions.length]);
  useLayoutEffect(() => { if (open && position && panel.current) (panel.current.querySelector('[aria-checked=true]') ?? panel.current.querySelector('[role=menuitemradio]'))?.focus(); }, [open, !!position]);
  useEffect(() => { if (disabled && open) updateOpen(false); }, [disabled]);
  const menuKey = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); updateOpen(false); anchor.current?.focus(); return; }
    const items = [...panel.current.querySelectorAll('[role=menuitemradio]:not([aria-disabled=true])')], index = items.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[next]?.focus(); }
    if ((event.key === 'Enter' || event.key === ' ') && document.activeElement?.getAttribute('role') === 'menuitemradio') { event.preventDefault(); document.activeElement.click(); }
  };
  const current = suggestions.find(item => item.value === value), label = current?.label ?? (value || placeholderValue);
  const trigger = <button ref={anchor} type="button" className="codex-annotation-enum-trigger" data-browser-sidebar-design-no-drag aria-label={ariaLabel} title={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => updateOpen(!open)}><span>{label}</span><CodexCuIcon name="shared:wE" size={14} style={{ transform: 'rotate(90deg)' }}/></button>;
  const menu = open && position && container.current && createPortal(<CodexCuMenuSurface ref={panel} size="select" width="sm" side="bottom" align="end" className="codex-annotation-enum-menu" style={position} onKeyDown={menuKey}>{suggestions.map(item => <CodexCuMenuItem key={item.value} role="menuitemradio" aria-checked={item.value === value} disabled={!canWrite} onSelect={() => choose(item.value)} rightIcon={item.value === value ? <CodexCuIcon name="shared:vpt" size={16}/> : undefined}>{item.label ?? item.value}</CodexCuMenuItem>)}</CodexCuMenuSurface>, container.current);
  return <><span className={'codex-annotation-enum-control ' + className} data-edited={isEdited || undefined} data-kind={property==='font-family'?'font-family':suggestions.length?'enum':'text'}>
    {property === 'font-family' ? <><input ref={input} aria-label={ariaLabel} title={value} dir="ltr" value={value} placeholder={placeholderValue} readOnly={!canWrite} disabled={disabled} onChange={event => canWrite && onValueChange(event.target.value)}/>{trigger}</> : suggestions.length ? trigger : <input ref={input} aria-label={ariaLabel} title={value} dir="ltr" value={value} placeholder={placeholderValue} readOnly={!canWrite} disabled={disabled} onChange={event => canWrite && onValueChange(event.target.value)}/>}
  </span>{menu}</>;
}

const lengthProperty = property => property === 'font-size' || property === 'border-radius' || property === 'border-width' || property === 'column-gap' || property === 'gap' || property === 'height' || property === 'row-gap' || property === 'width' || property.startsWith('margin-') || property.startsWith('padding-');
const pixelValue = value => /^(-?\d+(?:\.\d+)?)px$/.test(String(value ?? '').trim());
export function CodexAnnotationDeclarationControl({ declaration, ariaLabel, isEdited = false, disabled = false,
  portalContainer, onValueChange, onControlDragActiveChange, onControlEditingActiveChange, onScrubActiveChange, locale = 'zh-CN' }) {
  const { property, value = '', previousValue = '' } = declaration;
  const placeholderValue = declaration.placeholderValue ?? (!value && previousValue ? previousValue : undefined);
  const common = { ariaLabel: ariaLabel ?? property, isEdited, disabled, placeholderValue, property, value, onValueChange };
  if (property === 'color' || property.endsWith('-color')) return <CodexAnnotationColorControl {...common} portalContainer={portalContainer} onDragActiveChange={onControlDragActiveChange} onEditingActiveChange={onControlEditingActiveChange}/>;
  if (property === 'opacity') return <CodexAnnotationOpacityControl {...common} onScrubActiveChange={onScrubActiveChange}/>;
  if (lengthProperty(property) && (!value || pixelValue(placeholderValue) || pixelValue(value) || (['gap', 'column-gap', 'row-gap'].includes(property) && [value, placeholderValue].includes('normal')))) return <CodexAnnotationLengthControl {...common} onScrubActiveChange={onScrubActiveChange}/>;
  return <CodexAnnotationEnumControl {...common} portalContainer={portalContainer} previousValue={previousValue} locale={locale} onOpenChange={onControlEditingActiveChange}/>;
}
