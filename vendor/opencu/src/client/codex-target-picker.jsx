import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import './codex-cu-tokens.css';
import './codex-cu-typography.css';
import './codex-target-picker.css';
import { CodexCuScope } from './codex-cu-scope.jsx';

const join = (...values) => values.filter(Boolean).join(' ');
const OFFICE_DETAILS = {
  'microsoft-excel-plugin': 'Live workbook control',
  'microsoft-powerpoint-plugin': 'Live presentation control',
  'microsoft-word-plugin': 'Live document control',
};

function LoadedArtwork({ src, fallback, className }) {
  const [state, setState] = useState('loading');
  return <span className={join('codex-target-artwork', className)}>
    {state !== 'loaded' && fallback}
    {state !== 'failed' && <img alt="" src={src} decoding="async" draggable={false}
      referrerPolicy="no-referrer" data-loaded={state === 'loaded' || undefined}
      onLoad={() => setState('loaded')} onError={() => setState('failed')}/>}
  </span>;
}

// src is a resolved real app icon/favicon supplied by the existing host.
// The fallbacks are the original bundle's SVGs, never inferred app branding.
function TargetArtwork({ item, chip = false, className }) {
  const browser = item.kind === 'tab' || item.kind === 'browser-tab';
  const fallbackName = item.fallbackIconName ?? (browser ? chip ? 'shared:Dtt' : 'shared:OD'
    : item.iconSource === 'plugin' ? 'initial:_V' : 'shared:kw');
  const fallback = item.fallbackIcon ?? <CodexCuIcon name={fallbackName}/>;
  const src = item.iconUrl ?? (browser ? item.faviconUrl : undefined);
  if (item.iconElement != null) return <span className={join('codex-target-artwork', className)}>{item.iconElement}</span>;
  return src ? <LoadedArtwork key={src} src={src} fallback={fallback} className={className}/>
    : <span className={join('codex-target-artwork', className)}>{fallback}</span>;
}

export function CodexTargetMentionRow({ item, highlighted = false, iconSize, optionId,
  onHighlight, onSelect, useListbox = true }) {
  const detail = item.detail ?? OFFICE_DETAILS[item.kind];
  const shrinkTogether = item.allowLabelAndDetailToShrink === true && detail != null;
  const content = <span className="codex-target-row-content">
    <span className="codex-target-leading-icon"><TargetArtwork item={item} className={iconSize === 20 ? 'codex-target-artwork-large' : undefined}/></span>
    <span className={join('codex-target-row-text', shrinkTogether && 'codex-target-row-text-shrink')}>
      {shrinkTogether ? <>
        <span className="codex-target-label-and-detail"><span className="codex-target-label">{item.labelElement ?? item.label}</span>
          <span className="codex-target-detail">{item.detailElement ?? detail}</span></span>
        {item.detailSuffix != null && <span className="codex-target-detail-suffix">{item.detailSuffix}</span>}
      </> : <><span className={join('codex-target-label', detail != null && 'codex-target-label-fixed')}>{item.labelElement ?? item.label}</span>
        {detail != null && <span className="codex-target-detail codex-target-detail-grow">{item.detailElement ?? detail}</span>}</>}
    </span>
    {item.trailingContent ?? (item.trailingDetail == null ? null : <span className="codex-target-trailing-detail">{item.trailingDetail}</span>)}
  </span>;
  if (item.disabled) return <div className="codex-target-row codex-target-row-disabled" aria-disabled="true">{content}</div>;
  return <button type="button" id={optionId} role={useListbox ? 'option' : undefined}
    aria-label={item.ariaLabel} aria-selected={useListbox ? highlighted : undefined}
    aria-current={!useListbox && highlighted ? true : undefined}
    className="codex-target-row" data-highlighted={highlighted || undefined}
    data-list-navigation-item="true" title={item.tooltipText}
    onMouseDown={event => event.preventDefault()}
    onMouseMove={() => onHighlight?.(item)} onClick={() => { onHighlight?.(item); onSelect?.(item); }}>{content}</button>;
}

/** The caller supplies the original source-formatted label (tab labels: 60 symbols). */
export function CodexTargetReferenceChip({ reference, className, selected = false, onClick,
  theme, windowType = 'electron', ...props }) {
  const browser = reference.kind === 'tab' || reference.kind === 'browser-tab';
  const label = reference.label ?? reference.title ?? (reference.displayName || reference.name);
  const unavailable = reference.available === false;
  return <CodexCuScope as="span" {...props} theme={theme} referenceWindowType={windowType}
    data-appearance="inline-mention" data-layout="inline-flow" data-font-weight="medium" data-tone="accent"
    data-interactive="" data-underline-on-hover="" data-brand-color={reference.brandColor ? '' : undefined}
    data-inline-mention-interactive={onClick ? '' : undefined}
    data-unavailable={unavailable || undefined} data-composer-inline-atom-selected={selected || undefined}
    data-computer-use-reference={reference.kind} data-reference-path={reference.path}
    className={join('codex-target-chip', className)} style={reference.brandColor ? { '--inline-mention-base-color': reference.brandColor } : undefined}
    role={browser ? 'group' : undefined} tabIndex={browser ? 0 : undefined}
    aria-label={browser ? reference.ariaLabel ?? `${reference.title ?? label} ${reference.url ?? ''}`.trim() : undefined}
    title={reference.tooltipText} onClick={onClick}>
    <span className="codex-target-chip-icon-container" contentEditable={false}><span className="codex-target-chip-icon"><TargetArtwork item={reference} chip/></span></span>
    <span className={join('codex-target-chip-label', browser && 'codex-target-chip-label-truncate')}>{label}</span>
  </CodexCuScope>;
}

function LoadingRows({ icons, label }) {
  return <div role="status"><span className="codex-target-sr-only">{label}</span>
    {(icons ?? [null]).map((icon, index) => <div key={index} aria-hidden="true" className="codex-target-loading-row">
      <span className="codex-target-row-content"><span className="codex-target-leading-icon">{icon ?? <span className="codex-target-loading-icon"/>}</span>
        <span className="codex-target-loading-text"><span className="codex-target-loading-bar" data-width={index % 3}/></span>
      </span>
    </div>)}
  </div>;
}

function SectionTitle({ children, first, sticky = false, fixed = false }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current, parent = node?.parentElement;
    if (!sticky || !node || !parent) return;
    const update = () => parent.style.setProperty('--mention-list-sticky-header-height', `${node.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node, { box: 'border-box' });
    return () => { observer.disconnect(); parent.style.removeProperty('--mention-list-sticky-header-height'); };
  }, [sticky]);
  return <div ref={ref} className={join('codex-target-section-title', fixed && 'codex-target-fixed-title')}
    data-sticky={sticky || undefined} data-first={first || undefined}>{children}</div>;
}

/**
 * Visual @mention list. The host supplies ranked sections, query, gates, labels,
 * selection and real icon URLs. This component never discovers or filters apps.
 * A single section hides its heading unless section.showTitle is supplied.
 */
export function CodexTargetPicker({ sections = [], query = '', open = true, header, footer,
  highlightedKey, onHighlight, onSelect, onRequestClose, onKeyDown, iconSize,
  keyboardVariant = 'default', selectOnTab = false, keyboardEventTarget,
  loadingIcons, noResults = 'No results', loadingLabel = 'Loading suggestions',
  listboxId, fixedSectionHeaders = false, chromeVariant = 'default',
  isHomeMenu = false, autoHighlightFirst = true, captureKeyboard = false, macKeyboard = false,
  className, style, theme, windowType = 'electron', ...props }) {
  const scrollRef = useRef(null), sectionRefs = useRef(new Map()), mouseHighlight = useRef(null), headerRef = useRef(null), previousItemKeys = useRef(null);
  const [stickySectionId, setStickySectionId] = useState(null);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [localHighlightedKey, setLocalHighlightedKey] = useState(() => autoHighlightFirst
    ? sections.flatMap(section => section.items ?? []).find(item => !item.disabled)?.key ?? null : null);
  const visibleSections = sections.filter(section => section.items?.length > 0 || section.emptyState != null);
  const items = visibleSections.flatMap(section => section.items ?? []).filter(item => !item.disabled);
  const selectedKey = highlightedKey === undefined ? localHighlightedKey : highlightedKey;
  const selectedIndex = items.findIndex(item => item.key === selectedKey);
  const selectedItem = items[selectedIndex];
  const loading = sections.some(section => section.isLoading);
  const showTitles = section => section.title != null && (section.showTitle ?? visibleSections.length > 1);
  const fixedTitle = fixedSectionHeaders && visibleSections.some(showTitles);
  const currentSection = visibleSections.find(section => section.id === stickySectionId) ?? visibleSections[0];
  const currentTitle = currentSection && showTitles(currentSection) ? currentSection.title : null;
  const itemKeys = JSON.stringify(items.map(item => item.key));
  useEffect(() => {
    const changed = previousItemKeys.current !== null && previousItemKeys.current !== itemKeys;
    previousItemKeys.current = itemKeys;
    if (highlightedKey !== undefined) return;
    setLocalHighlightedKey(key => open && !(keyboardVariant === 'chatgpt' && changed) && items.some(item => item.key === key) ? key : open && autoHighlightFirst ? items[0]?.key ?? null : null);
  }, [open, highlightedKey, autoHighlightFirst, itemKeys, keyboardVariant]);
  const highlight = item => {
    if (highlightedKey === undefined) setLocalHighlightedKey(item?.key ?? null);
    onHighlight?.(item);
  };

  const handleKeyDown = event => {
    onKeyDown?.(event);
    const nativeEvent = event.nativeEvent ?? event;
    if (event.defaultPrevented || nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
    if (headerRef.current && Array.from(headerRef.current.querySelectorAll('button')).some(button => nativeEvent.composedPath().includes(button))) return;
    let handled = false;
    if (items.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || macKeyboard && event.ctrlKey && (event.key === 'n' || event.key === 'p'))) {
      const step = event.key === 'ArrowDown' || event.key === 'n' ? 1 : -1;
      const index = selectedIndex < 0 ? step > 0 ? 0 : items.length - 1
        : (selectedIndex + step + items.length) % items.length;
      mouseHighlight.current = null; highlight(items[index]); handled = true;
    } else if (event.key === 'Escape' && onRequestClose) {
      onRequestClose(); handled = true;
    } else if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && selectedItem
      && (event.key === 'Enter' || event.key === 'Tab' && (selectOnTab || keyboardVariant === 'chatgpt')
        || event.key === ' ' && keyboardVariant === 'chatgpt' && query.trim().length > 0
          && [selectedItem.label, ...(selectedItem.searchTerms ?? [])].some(alias => typeof alias === 'string' && alias.toLocaleLowerCase() === query.toLocaleLowerCase()))) {
      onSelect?.(selectedItem); handled = true;
    }
    if (handled) { event.preventDefault(); event.stopPropagation(); }
  };

  useEffect(() => {
    if (!open || !captureKeyboard) return;
    const target = keyboardEventTarget ?? window;
    target.addEventListener('keydown', handleKeyDown, true);
    return () => target.removeEventListener('keydown', handleKeyDown, true);
  });
  useEffect(() => {
    if (!open || !selectedItem || mouseHighlight.current === selectedItem.key) return;
    Array.from(scrollRef.current?.querySelectorAll('[data-target-option-key]') ?? [])
      .find(node => node.dataset.targetOptionKey === String(selectedItem.key))?.scrollIntoView({ block: 'nearest' });
  }, [open, selectedItem?.key]);

  if (!open) return null;
  const expanded = chromeVariant === 'expandedTopTray' || chromeVariant === 'embeddedExpandedTopTray';
  return <CodexCuScope {...props} theme={theme} referenceWindowType={windowType}
    data-composer-expanded-top-tray={expanded ? '' : undefined}
    data-composer-top-tray-embedded={chromeVariant === 'embeddedExpandedTopTray' ? '' : undefined}
    data-chrome-variant={chromeVariant} data-home-menu={isHomeMenu || undefined}
    className={join('codex-target-picker', className)} style={style}
    onKeyDown={captureKeyboard ? undefined : handleKeyDown}>
    {header != null && <div ref={headerRef} className="codex-target-picker-header" data-scrolled={headerScrolled || undefined}>{header}</div>}
    {fixedTitle && <SectionTitle first fixed>{currentTitle}</SectionTitle>}
    <div id={listboxId} ref={scrollRef} role={listboxId && items.length ? 'listbox' : undefined}
      data-mention-list-scroll-area="" data-fade={chromeVariant === 'default' && !fixedTitle ? 'both' : 'bottom'}
      className="codex-target-picker-scroll" onScroll={event => {
        setHeaderScrolled(event.currentTarget.scrollTop > 0);
        if (!fixedTitle) return;
        const top = event.currentTarget.getBoundingClientRect().top;
        let id = visibleSections[0]?.id ?? null;
        for (const section of visibleSections) {
          const rows = sectionRefs.current.get(section.id);
          if (rows && rows.getBoundingClientRect().top <= top) id = section.id;
        }
        setStickySectionId(id);
      }}>
      {visibleSections.map((section, sectionIndex) => <div key={section.id} data-mention-section-id={section.id}>
        {showTitles(section) && !(fixedTitle && sectionIndex === 0) && <SectionTitle sticky={!fixedTitle && !expanded} first={sectionIndex === 0}>{section.title}</SectionTitle>}
        <div data-mention-section-items="" ref={node => { if (node) sectionRefs.current.set(section.id, node); else sectionRefs.current.delete(section.id); }}>
          {(section.items ?? []).map(item => <div key={item.key} data-target-option-key={item.key}>
            <CodexTargetMentionRow item={item} iconSize={iconSize} highlighted={item.key === selectedKey}
              optionId={listboxId ? `${listboxId}-option-${items.indexOf(item)}` : undefined}
              useListbox={Boolean(listboxId && items.length)} onHighlight={entry => { mouseHighlight.current = entry.key; highlight(entry); }} onSelect={onSelect}/>
          </div>)}
          {!section.items?.length && section.emptyState != null && !(section.isLoading && (header != null || loadingIcons != null))
            && <div className="codex-target-empty-state">{section.emptyState}</div>}
        </div>
      </div>)}
      {!visibleSections.length && (loading ? <LoadingRows icons={loadingIcons} label={loadingLabel}/>
        : <div className="codex-target-empty-state">{noResults}</div>)}
      {keyboardVariant === 'chatgpt' && footer != null && <div className="codex-target-empty-state">{footer}</div>}
    </div>
    {keyboardVariant !== 'chatgpt' && footer}
  </CodexCuScope>;
}
