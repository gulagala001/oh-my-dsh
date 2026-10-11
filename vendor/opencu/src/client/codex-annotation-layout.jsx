import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CodexCuButton, CodexCuTooltip } from './codex-cu-primitives.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CODEX_CU_COPY } from './codex-cu-copy.mjs';
import { CodexAnnotationLengthControl, CodexAnnotationNumberControl, CodexAnnotationOpacityControl } from './codex-annotation-number.jsx';
import layoutCss from './codex-annotation-layout.css';

// Codex 26.1007.21159 / 20052. Exact source nodes, offsets, CSS and gates:
// work/rea-reconstruction/results-annotation/layout/manifest.json.
export const codexAnnotationLayoutCss = layoutCss;
export const codexAnnotationLayoutUtilities = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cal-${value}`).join(' ');
const p = codexAnnotationLayoutUtilities;
const join = (...values) => values.filter(Boolean).join(' ');
const shell = 'min-w-0 rounded-lg border border-primary-outline bg-primary-soft text-default shadow-sm outline-none transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring';
const input = 'min-w-0 appearance-none border-0 bg-transparent font-mono text-default outline-none ring-0 placeholder:text-tertiary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0';
const sideOrder = ['top', 'bottom', 'left', 'right'];
const compactSideOrder = ['top', 'right', 'bottom', 'left'];
const declarationOrder = ['color', 'background-color', 'opacity', 'font-family', 'font-size', 'font-weight', 'border-radius', 'border-color', 'border-width', 'flex-direction', 'justify-content', 'align-items', 'gap', 'column-gap', 'row-gap'];
const labels = {
  color: 'textColorProperty', 'background-color': 'backgroundProperty', 'font-family': 'fontProperty', 'font-size': 'fontSizeProperty',
  'font-weight': 'fontWeightProperty', 'border-radius': 'borderRadiusProperty', 'border-color': 'borderColorProperty', 'border-width': 'borderWidthProperty',
  width: 'widthProperty', height: 'heightProperty', 'flex-direction': 'flexDirectionProperty', 'justify-content': 'justifyContentProperty',
  'align-items': 'alignItemsProperty', gap: 'gapProperty', 'row-gap': 'rowGapProperty', 'column-gap': 'columnGapProperty', padding: 'paddingProperty', margin: 'marginProperty',
};
const chinese = locale => String(locale).toLowerCase().startsWith('zh');
const message = (key, locale, values = {}) => {
  const copy = CODEX_CU_COPY[`browserSidebarDesignEditor.${key}`];
  const source = chinese(locale) ? copy.simplifiedChinese ?? copy.english : copy.english;
  return source.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
};
const pxNumber = value => String(value ?? '').trim().match(/^(-?\d+(?:\.\d+)?)px$/)?.[1] ?? null;
const parsedPx = value => { const found = pxNumber(value); return found == null ? null : Number(found); };
const formatPx = value => String(Number.isInteger(value) ? value : Number(value.toFixed(2)));
const spacingProperty = property => property.startsWith('padding-') ? 'padding' : property.startsWith('margin-') ? 'margin' : null;
const isGap = property => ['column-gap', 'gap', 'row-gap'].includes(property);
const normalGap = (property, value) => isGap(property) && String(value).trim() === 'normal' ? '0' : null;
const findSide = (declarations, property, side) => declarations.find(declaration => declaration.property === `${property}-${side}`);
const axisProperties = (property, axis) => axis === 'vertical' ? [`${property}-top`, `${property}-bottom`] : [`${property}-left`, `${property}-right`];
const peerProperty = (property, field) => {
  if (field === `${property}-top`) return `${property}-bottom`;
  if (field === `${property}-bottom`) return `${property}-top`;
  if (field === `${property}-left`) return `${property}-right`;
  if (field === `${property}-right`) return `${property}-left`;
  return null;
};
const isSpacingLocked = (relationships, property, field) => relationships[`${property}-${field.endsWith('-top') || field.endsWith('-bottom') ? 'vertical' : 'horizontal'}`] === true;
const placeholderFor = declaration => declaration.placeholderValue ?? (declaration.value.length === 0 && declaration.previousValue.length > 0 ? declaration.previousValue : undefined);

export function codexAnnotationPropertyLabel(property, { spacingAxisOnly = false, locale = 'zh-CN' } = {}) {
  if (spacingAxisOnly && spacingProperty(property)) {
    const axis = property.slice(property.lastIndexOf('-') + 1);
    if (['top', 'bottom', 'left', 'right'].includes(axis)) return message(`${axis}SpacingProperty`, locale);
  }
  if (labels[property]) return message(labels[property], locale);
  const value = property.replaceAll('-', ' ');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function codexAnnotationFlexSuggestions(declaration, locale = 'zh-CN') {
  const property = declaration.property, value = declaration.value;
  let options = property === 'flex-direction' ? [
    ['horizontalFlexDirection', 'row'], ['horizontalReverseFlexDirection', 'row-reverse'], ['verticalFlexDirection', 'column'], ['verticalReverseFlexDirection', 'column-reverse'],
  ] : property === 'justify-content' ? [
    ['startDistribution', 'flex-start'], ['centerDistribution', 'center'], ['endDistribution', 'flex-end'], ['spaceBetweenDistribution', 'space-between'], ['spaceAroundDistribution', 'space-around'], ['spaceEvenlyDistribution', 'space-evenly'],
  ] : property === 'align-items' ? [
    ['startAlignment', 'flex-start'], ['centerAlignment', 'center'], ['endAlignment', 'flex-end'], ['stretchAlignment', 'stretch'], ['baselineAlignment', 'baseline'],
  ] : [];
  options = options.map(([key, option]) => ({ label: message(key, locale), value: option }));
  if (value === 'normal') options = options.map(option => option.value === (property === 'justify-content' ? 'flex-start' : 'stretch') ? { ...option, value: 'normal' } : option);
  return value.trim().length === 0 || options.some(option => option.value === value) ? options : [{ value }, ...options];
}

// ar + cr: no synthetic computed values. Pairing and sorting retain source order.
export function groupCodexAnnotationSections(declarations = []) {
  const byProperty = new Map(declarations.map(declaration => [declaration.property, declaration])), seen = new Set(), sections = [];
  for (const declaration of declarations) {
    if (seen.has(declaration.property)) continue;
    if (isGap(declaration.property)) {
      const rowGap = byProperty.get('row-gap'), columnGap = byProperty.get('column-gap');
      if (rowGap && columnGap) { ['gap', 'row-gap', 'column-gap'].forEach(property => seen.add(property)); sections.push({ kind: 'flex-spacing', columnGap, rowGap }); continue; }
    }
    const property = spacingProperty(declaration.property);
    if (property) {
      const values = sideOrder.flatMap(side => { const value = byProperty.get(`${property}-${side}`); if (!value) return []; seen.add(value.property); return [value]; });
      sections.push({ kind: 'spacing', declarations: values, property }); continue;
    }
    if (declaration.property === 'width' || declaration.property === 'height') {
      const width = byProperty.get('width'), height = byProperty.get('height');
      if (width && height) { seen.add('width'); seen.add('height'); sections.push({ kind: 'dimensions', width, height }); continue; }
    }
    seen.add(declaration.property); sections.push({ kind: 'declaration', declaration });
  }
  const group = section => {
    if (section.kind !== 'declaration') return 'layout';
    const property = section.declaration.property;
    if (['color', 'background-color', 'opacity'].includes(property)) return 'color';
    if (property.startsWith('font-')) return 'font';
    if (property.startsWith('border-')) return 'border';
    return ['align-items', 'flex-direction', 'justify-content'].includes(property) ? 'layout' : 'other';
  };
  const order = section => {
    if (section.kind === 'dimensions') return 0;
    if (section.kind === 'spacing') return section.property === 'padding' ? 1 : 2;
    if (section.kind === 'flex-spacing') return declarationOrder.indexOf('gap');
    const index = declarationOrder.indexOf(section.declaration.property); return index < 0 ? declarationOrder.length : index;
  };
  return ['color', 'font', 'border', 'layout', 'other'].flatMap(id => {
    const values = sections.filter(section => group(section) === id).sort((a, b) => order(a) - order(b));
    return values.length ? [{ id, sections: values }] : [];
  });
}

export function codexAnnotationInitialRelationships(declarations = []) {
  const locked = (property, axis) => {
    const [firstProperty, secondProperty] = axisProperties(property, axis), first = declarations.find(value => value.property === firstProperty), second = declarations.find(value => value.property === secondProperty);
    if (!first || !second || first.value.trim() === '0' || parsedPx(first.value) === 0) return false;
    const firstNumber = parsedPx(first.value), secondNumber = parsedPx(second.value);
    return first.value.trim() === second.value.trim() || firstNumber != null && secondNumber != null && firstNumber === secondNumber;
  };
  return { dimensions: false, 'margin-horizontal': locked('margin', 'horizontal'), 'margin-vertical': locked('margin', 'vertical'), 'padding-horizontal': locked('padding', 'horizontal'), 'padding-vertical': locked('padding', 'vertical') };
}

export function CodexAnnotationControlsGrid({ children, className, styleEnabled = false, ...props }) {
  return <>{styleEnabled && <style>{layoutCss}</style>}<div {...props} className={join('codex-annotation-layout', p('grid grid-cols-[minmax(0,--spacing(30))_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 px-4 py-2'), className)}>{children}</div></>;
}

export function CodexAnnotationSectionDivider({ variant = 'row' }) {
  return <span aria-hidden="true" className={p('col-span-2 border-t', variant === 'section' ? '-mx-4 my-1 border-default' : 'my-0.5 border-subtle')} />;
}

// Original BO tooltip behavior: labels reveal only when their trigger overflows.
function AnnotationTooltip({ children, label, portalContainer, onlyOnOverflow = false }) {
  const [anchor, setAnchor] = useState(null);
  const reveal = event => {
    const node = event.currentTarget;
    if (onlyOnOverflow && node.scrollWidth <= node.clientWidth) return;
    const bounds = node.getBoundingClientRect(); setAnchor({ left: bounds.x + bounds.width / 2, top: bounds.y });
  };
  const trigger = React.cloneElement(children, { onMouseEnter: reveal, onMouseLeave: () => setAnchor(null), onFocus: onlyOnOverflow ? undefined : reveal, onBlur: () => setAnchor(null) });
  const tip = anchor && <CodexCuTooltip open tooltipContent={label} side="top" style={{ position: 'fixed', left: anchor.left, top: anchor.top - 4, transform: 'translate(-50%,-100%)' }} />;
  return <>{trigger}{tip && (portalContainer ? createPortal(tip, portalContainer) : tip)}</>;
}

export function CodexAnnotationResetIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 1.22461C8.63715 1.22462 10.7754 3.36284 10.7754 6C10.7754 8.63716 8.63715 10.7754 6 10.7754C3.72703 10.7754 1.82628 9.18706 1.34375 7.06055C1.29494 6.84524 1.4293 6.63105 1.64453 6.58203C1.85996 6.53315 2.07415 6.66836 2.12305 6.88379C2.52471 8.65392 4.10877 9.97461 6 9.97461C8.19533 9.9746 9.97461 8.19533 9.97461 6C9.97461 3.80467 8.19533 2.0254 6 2.02539C4.47703 2.02539 3.15503 2.8824 2.4873 4.1416H3.56934C3.79025 4.1416 3.96973 4.32108 3.96973 4.54199C3.96973 4.76291 3.79025 4.94238 3.56934 4.94238H1.625C1.40409 4.94238 1.22461 4.76291 1.22461 4.54199V2.35449C1.22461 2.13358 1.40409 1.9541 1.625 1.9541C1.84591 1.9541 2.02539 2.13358 2.02539 2.35449V3.35547C2.88092 2.07214 4.34082 1.22461 6 1.22461Z" fill="currentColor" /></svg>;
}

function AnnotationLinkIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={p('icon-3xs')}><path fillRule="evenodd" clipRule="evenodd" d="M18.2929 5.70711C16.4743 3.88849 13.5257 3.88849 11.7071 5.7071L10.7071 6.70711C10.3166 7.09763 9.68341 7.09763 9.29289 6.70711C8.90236 6.31658 8.90236 5.68342 9.29289 5.29289L10.2929 4.29289C12.8926 1.69323 17.1074 1.69323 19.7071 4.29289C22.3068 6.89256 22.3068 11.1074 19.7071 13.7071L18.7071 14.7071C18.3166 15.0976 17.6834 15.0976 17.2929 14.7071C16.9024 14.3166 16.9024 13.6834 17.2929 13.2929L18.2929 12.2929C20.1115 10.4743 20.1115 7.52572 18.2929 5.70711ZM15.7071 8.29289C16.0976 8.68342 16.0976 9.31658 15.7071 9.70711L9.7071 15.7071C9.31658 16.0976 8.68341 16.0976 8.29289 15.7071C7.90236 15.3166 7.90236 14.6834 8.29289 14.2929L14.2929 8.29289C14.6834 7.90237 15.3166 7.90237 15.7071 8.29289ZM6.7071 9.29289C7.09763 9.68342 7.09763 10.3166 6.7071 10.7071L5.7071 11.7071C3.88849 13.5257 3.88849 16.4743 5.7071 18.2929C7.52572 20.1115 10.4743 20.1115 12.2929 18.2929L13.2929 17.2929C13.6834 16.9024 14.3166 16.9024 14.7071 17.2929C15.0976 17.6834 15.0976 18.3166 14.7071 18.7071L13.7071 19.7071C11.1074 22.3068 6.89255 22.3068 4.29289 19.7071C1.69322 17.1074 1.69322 12.8926 4.29289 10.2929L5.29289 9.29289C5.68341 8.90237 6.31658 8.90237 6.7071 9.29289Z" fill="currentColor" /></svg>;
}

export function CodexAnnotationValueCell({ children, dropdownPortalContainer, isScrubbable = false, scrubPeerProperty, scrubProperty, showReset = false, resetLabel, onReset }) {
  return <span className={p('flex min-w-0 justify-end ps-6')} data-browser-sidebar-design-scrub-value-cell={isScrubbable ? '' : undefined} data-browser-sidebar-design-scrub-peer-property={scrubPeerProperty} data-browser-sidebar-design-scrub-property={scrubProperty}>
    <span className={p('relative inline-flex max-w-full justify-end')}>
      {showReset && <AnnotationTooltip label={resetLabel} portalContainer={dropdownPortalContainer}><CodexCuButton aria-label={resetLabel} className={p('absolute end-full top-1/2 me-1 h-5 w-5 shrink-0 -translate-y-1/2')} color="ghost" size="iconSm" uniform onClick={onReset}><span className={p('inline-flex')}><CodexAnnotationResetIcon /></span></CodexCuButton></AnnotationTooltip>}
      <span className={p('flex max-w-full min-w-0 justify-end')}>{children}</span>
    </span>
  </span>;
}

function DefaultDeclarationControl({ declaration, isEdited, isEditable, onValueChange, onScrubActiveChange, locale }) {
  const property = declaration.property, value = declaration.value, placeholderValue = placeholderFor(declaration);
  if (property === 'opacity') return <CodexAnnotationOpacityControl styleEnabled={false} ariaLabel={codexAnnotationPropertyLabel(property, { locale })} property={property} value={value} placeholderValue={placeholderValue} isEdited={isEdited} onValueChange={isEditable ? onValueChange : undefined} onScrubActiveChange={onScrubActiveChange} />;
  const isLength = ['font-size', 'border-radius', 'border-width', 'column-gap', 'gap', 'height', 'row-gap', 'width'].includes(property) || spacingProperty(property) != null;
  if (isLength && (value.length === 0 || pxNumber(placeholderValue) != null || pxNumber(value) != null || normalGap(property, value) != null || normalGap(property, placeholderValue) != null)) {
    return <CodexAnnotationLengthControl styleEnabled={false} ariaLabel={codexAnnotationPropertyLabel(property, { locale })} property={property} value={value} placeholderValue={placeholderValue} isEdited={isEdited} onValueChange={isEditable ? onValueChange : undefined} onScrubActiveChange={onScrubActiveChange} />;
  }
  return <span className={p(shell, 'w-48 max-w-full flex min-h-7 min-w-0 items-center px-3')}><input aria-label={codexAnnotationPropertyLabel(property, { locale })} className={p(input, 'h-7 w-full truncate text-start text-xs', !isEdited && 'text-tertiary')} dir="ltr" value={value} placeholder={placeholderValue} title={value} readOnly={!isEditable || !onValueChange} onChange={event => onValueChange?.(event.target.value)} /></span>;
}

export function CodexAnnotationDeclarationRow({ connector, declaration, dropdownPortalContainer, isNested = false, isEditable = true, onControlDragActiveChange, onControlEditingActiveChange, onReset, scrubPeerProperty, onScrubActiveChange, showsRelationshipConnector = false, onValueChange, renderDeclarationControl, locale = 'zh-CN' }) {
  const label = codexAnnotationPropertyLabel(declaration.property, { locale }), isEdited = declaration.value !== declaration.previousValue;
  const controlProps = { declaration, ariaLabel: label, dropdownPortalContainer, portalContainer: dropdownPortalContainer, isEdited, isEditable, placeholderValue: placeholderFor(declaration), onControlDragActiveChange, onControlEditingActiveChange, onScrubActiveChange, onValueChange, locale };
  return <div className={p('contents')}>
    <span className={p('relative flex min-h-7 min-w-0 items-center text-sm text-secondary', showsRelationshipConnector ? 'w-full pe-9' : isNested && 'ms-1 ps-3')} data-browser-sidebar-design-scrub-label data-browser-sidebar-design-scrub-clone-label={label}>{connector}<AnnotationTooltip label={label} portalContainer={dropdownPortalContainer} onlyOnOverflow><span className={p('block truncate')}>{codexAnnotationPropertyLabel(declaration.property, { locale, spacingAxisOnly: isNested })}</span></AnnotationTooltip></span>
    <CodexAnnotationValueCell dropdownPortalContainer={dropdownPortalContainer} isScrubbable={isEditable} scrubPeerProperty={scrubPeerProperty} scrubProperty={declaration.property} showReset={isEditable && isEdited} resetLabel={message('resetProperty', locale, { property: label })} onReset={onReset}>
      {isEditable ? renderDeclarationControl ? renderDeclarationControl(controlProps) : <DefaultDeclarationControl {...controlProps} /> : <span className={p(shell, 'block min-h-7 w-full truncate px-3 py-1 text-end font-mono text-xs text-default')} dir="ltr" title={declaration.value}>{declaration.value}</span>}
    </CodexAnnotationValueCell>
  </div>;
}

function RelationshipConnector({ dropdownPortalContainer, isLocked, label, onClick }) {
  return <span className={p('absolute top-0 -right-1.5 z-10 h-[62px] w-9')}>
    <svg aria-hidden="true" className={p('pointer-events-none absolute inset-0 h-full w-full text-tertiary')} fill="none" viewBox="0 0 36 62"><path d="M28 14H2M28 14V48M28 48H2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" /></svg>
    <AnnotationTooltip label={label} portalContainer={dropdownPortalContainer}><CodexCuButton aria-label={label} className={p('absolute top-1/2 right-0 z-10 h-3.5 w-3.5 -translate-y-1/2 !rounded-full p-0', isLocked ? '!border-transparent !bg-[color-mix(in_srgb,var(--color-surface)_86%,var(--color-text-info)_14%)] !text-info shadow-sm enabled:hover:!bg-[color-mix(in_srgb,var(--color-surface)_80%,var(--color-text-info)_20%)] enabled:active:!bg-[color-mix(in_srgb,var(--color-surface)_76%,var(--color-text-info)_24%)] data-[state=open]:!bg-[color-mix(in_srgb,var(--color-surface)_80%,var(--color-text-info)_20%)] [&_svg]:!text-info' : '!border-transparent !bg-surface !text-secondary shadow-sm enabled:hover:!bg-[color-mix(in_srgb,var(--color-surface)_92%,var(--color-text))] enabled:hover:!text-default enabled:active:!bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-text)_12%)] enabled:active:!text-default data-[state=open]:!bg-[color-mix(in_srgb,var(--color-surface)_92%,var(--color-text))] data-[state=open]:!text-default')} color="ghost" size="iconSm" uniform onClick={onClick}><AnnotationLinkIcon /></CodexCuButton></AnnotationTooltip>
  </span>;
}

function LinkedDeclarationRows({ first, second, dropdownPortalContainer, isEditable, isLocked, isNested = false, lockLabel, onLockToggle, onReset, onScrubActiveChange, onValueChange, renderDeclarationControl, locale }) {
  if (first == null || second == null) return null;
  const common = { dropdownPortalContainer, isEditable, isNested, onScrubActiveChange, renderDeclarationControl, locale, showsRelationshipConnector: true };
  return <><CodexAnnotationDeclarationRow {...common} connector={<RelationshipConnector dropdownPortalContainer={dropdownPortalContainer} isLocked={isLocked} label={lockLabel} onClick={onLockToggle} />} declaration={first} onReset={() => onReset?.(first.property)} onValueChange={onValueChange && (value => onValueChange(first.property, value))} scrubPeerProperty={isLocked && isNested ? second.property : undefined} /><CodexAnnotationDeclarationRow {...common} declaration={second} onReset={() => onReset?.(second.property)} onValueChange={onValueChange && (value => onValueChange(second.property, value))} scrubPeerProperty={isLocked && isNested ? first.property : undefined} /></>;
}

export function CodexAnnotationDimensions({ width, height, isLocked = false, locale = 'zh-CN', ...props }) {
  return <LinkedDeclarationRows {...props} locale={locale} first={width} second={height} isLocked={isLocked} lockLabel={message(isLocked ? 'unlockDimensionRatio' : 'lockDimensionRatio', locale)} />;
}

function CompactInput({ declaration, index, allowNormal = false, onValueChange, onScrubActiveChange, locale }) {
  if (!declaration) return <span className={p('flex min-h-7 items-center justify-center font-mono text-xs text-tertiary', index > 0 && 'border-l border-subtle')} />;
  const value = pxNumber(declaration.value), numeric = declaration.value.length === 0 || value != null || allowNormal && normalGap(declaration.property, declaration.value) != null;
  const placeholder = pxNumber(declaration.placeholderValue) ?? normalGap(declaration.property, declaration.placeholderValue ?? declaration.value) ?? undefined;
  return <CodexAnnotationNumberControl styleEnabled={false} ariaLabel={codexAnnotationPropertyLabel(declaration.property, { locale })} className={p(input, numeric && '_numericInput_1hft5_1', 'min-h-7 w-full px-1 text-center text-xs', index > 0 && 'border-l border-subtle', declaration.value === declaration.previousValue && 'text-tertiary')} inputMode={numeric ? 'decimal' : undefined} property={declaration.property} formatScrubValue={formatPx} scrubStep={numeric ? 1 : undefined} scrubValue={numeric ? parsedPx(declaration.value) ?? parsedPx(declaration.placeholderValue) ?? (allowNormal ? Number(normalGap(declaration.property, declaration.placeholderValue ?? declaration.value) ?? '0') : 0) : null} step={numeric ? 'any' : undefined} title={declaration.value} type={numeric ? 'number' : undefined} placeholder={placeholder} value={numeric ? value ?? '' : declaration.value} onScrubActiveChange={onScrubActiveChange} onValueChange={onValueChange && (next => onValueChange(declaration.property, numeric && next.length > 0 ? `${next}px` : next))} />;
}

function ExpandableSectionLabel({ property, isExpanded, onExpandToggle, locale, label }) {
  const propertyLabel = codexAnnotationPropertyLabel(property, { locale });
  return <span className={p('flex min-h-7 min-w-0 items-center pe-2')} data-browser-sidebar-design-scrub-label><button aria-label={label ?? message(isExpanded ? 'collapseSpacing' : 'expandSpacing', locale, { property })} className={p('-ms-1 inline-flex min-w-0 cursor-interaction items-center gap-1 rounded px-1 py-0.5 text-start text-sm text-secondary hover:bg-primary-ghost-hover')} type="button" onClick={onExpandToggle}><span className={p('truncate')}>{propertyLabel}</span><CodexCuIcon name="chevron" className={p('icon-2xs shrink-0 text-tertiary transition-transform', isExpanded && 'rotate-90')} /></button></span>;
}

export function CodexAnnotationSpacing({ declarations, dropdownPortalContainer, isEditable = true, isExpanded = false, lockedRelationships = {}, property, onDeclarationReset, onExpandToggle, onLockToggle, onScrubActiveChange, onValueChange, renderDeclarationControl, locale = 'zh-CN' }) {
  const values = declarations.map(declaration => declaration.value), sharedValue = values.length > 0 && values.every(value => value === values[0]) ? values[0] : null;
  const common = { dropdownPortalContainer, isEditable, isNested: true, onReset: onDeclarationReset, onScrubActiveChange, onValueChange, renderDeclarationControl, locale };
  const lockLabel = axis => message(`${lockedRelationships[`${property}-${axis}`] ? 'unlock' : 'lock'}Spacing${axis === 'vertical' ? 'Vertical' : 'Horizontal'}`, locale, { property });
  return <><div className={p('contents')}><ExpandableSectionLabel property={property} isExpanded={isExpanded} onExpandToggle={onExpandToggle} locale={locale} />{isExpanded ? <span aria-hidden="true" /> : isEditable ? <span className={p(shell, '-ms-6 grid min-h-7 w-[calc(100%+1.5rem)] grid-cols-4 overflow-hidden')} data-browser-sidebar-design-scrub-value-cell>{compactSideOrder.map((side, index) => <CompactInput key={`${property}-${side}`} declaration={findSide(declarations, property, side)} index={index} onValueChange={onValueChange} onScrubActiveChange={onScrubActiveChange} locale={locale} />)}</span> : <span className={p(shell, 'block min-h-7 w-full truncate px-3 py-1 text-end font-mono text-xs text-default')} dir="ltr" title={sharedValue ?? values.join(' ')}>{sharedValue ?? values.join(' ')}</span>}</div>
    {isExpanded && <><LinkedDeclarationRows {...common} first={findSide(declarations, property, 'top')} second={findSide(declarations, property, 'bottom')} isLocked={lockedRelationships[`${property}-vertical`]} lockLabel={lockLabel('vertical')} onLockToggle={() => onLockToggle?.('vertical')} /><LinkedDeclarationRows {...common} first={findSide(declarations, property, 'left')} second={findSide(declarations, property, 'right')} isLocked={lockedRelationships[`${property}-horizontal`]} lockLabel={lockLabel('horizontal')} onLockToggle={() => onLockToggle?.('horizontal')} /></>}
  </>;
}

export function CodexAnnotationFlexGap({ columnGap, rowGap, dropdownPortalContainer, isEditable = true, isExpanded = false, onDeclarationReset, onExpandToggle, onScrubActiveChange, onValueChange, renderDeclarationControl, locale = 'zh-CN' }) {
  return <><div className={p('contents')}><ExpandableSectionLabel property="gap" isExpanded={isExpanded} onExpandToggle={onExpandToggle} locale={locale} label={message(isExpanded ? 'collapseFlexSpacing' : 'expandFlexSpacing', locale)} />{isExpanded ? <span aria-hidden="true" /> : isEditable ? <span className={p(shell, 'grid min-h-7 w-full grid-cols-2 overflow-hidden')} data-browser-sidebar-design-scrub-value-cell>{[columnGap, rowGap].map((declaration, index) => <CompactInput key={declaration.property} declaration={declaration} index={index} allowNormal onValueChange={onValueChange} onScrubActiveChange={onScrubActiveChange} locale={locale} />)}</span> : <span className={p(shell, 'block min-h-7 w-full truncate px-3 py-1 text-end font-mono text-xs text-default')} dir="ltr">{columnGap.value} {rowGap.value}</span>}</div>
    {isExpanded && [columnGap, rowGap].map(declaration => <CodexAnnotationDeclarationRow key={declaration.property} declaration={declaration} dropdownPortalContainer={dropdownPortalContainer} isEditable={isEditable} onReset={() => onDeclarationReset?.(declaration.property)} onScrubActiveChange={onScrubActiveChange} onValueChange={onValueChange && (value => onValueChange(declaration.property, value))} renderDeclarationControl={renderDeclarationControl} locale={locale} />)}
  </>;
}

const sectionKey = section => section.kind === 'declaration' ? section.declaration.property : section.kind === 'spacing' ? section.property : section.kind;
const isFlexSection = section => section?.kind === 'flex-spacing' || section?.kind === 'declaration' && ['align-items', 'flex-direction', 'justify-content'].includes(section.declaration.property);

export function CodexAnnotationLayoutSections({ editorState, isEditable = true, canEditAnnotationControls = true, defaultExpandedSpacingGroups, expandedSpacingGroups, onExpandedSpacingGroupsChange, isFlexSpacingExpanded, onFlexSpacingExpandedChange, lockedRelationships, onLockedRelationshipsChange, onUpdate, onDeclarationValueChange, onDeclarationReset, onControlEditingActiveChange, onControlDragActiveChange, onScrubActiveChange, dropdownPortalContainer, renderDeclarationControl, showInitialDivider = false, locale = 'zh-CN', styleEnabled = false }) {
  const [localExpanded, setLocalExpanded] = useState(() => ({ margin: defaultExpandedSpacingGroups?.margin === true, padding: defaultExpandedSpacingGroups?.padding === true }));
  const [localFlexExpanded, setLocalFlexExpanded] = useState(false);
  const [localRelationships, setLocalRelationships] = useState(() => codexAnnotationInitialRelationships(editorState?.declarations));
  const expanded = expandedSpacingGroups ?? localExpanded, flexExpanded = isFlexSpacingExpanded ?? localFlexExpanded, relationships = lockedRelationships ?? localRelationships;
  const hasCustomControls = (editorState?.annotationControls?.controls?.length ?? 0) > 0;
  // Tn: canEditAnnotationControls applies to custom controls, not built-in declarations.
  void canEditAnnotationControls;
  if (!editorState || editorState.anchor?.kind === 'virtual' || hasCustomControls && editorState.annotationControls.controlsMode === 'replace') return null;
  const groups = groupCodexAnnotationSections(editorState.declarations);
  const commit = updates => {
    if (!isEditable) return;
    if (onUpdate) onUpdate({ ...editorState, declarations: editorState.declarations.map(declaration => { const update = updates.find(value => value.property === declaration.property); return update ? { ...declaration, value: update.value } : declaration; }) });
    else updates.forEach(update => onDeclarationValueChange?.(update.property, update.value));
  };
  const canWrite = isEditable && Boolean(onUpdate || onDeclarationValueChange);
  const change = canWrite ? (property, value) => commit([{ property, value }]) : undefined;
  const reset = property => {
    const declaration = editorState.declarations.find(value => value.property === property); if (!declaration) return;
    if (onDeclarationReset) { onDeclarationReset(property); return; }
    const spacing = spacingProperty(property), peer = spacing && isSpacingLocked(relationships, spacing, property) ? peerProperty(spacing, property) : null;
    commit([{ property, value: declaration.previousValue }, ...(peer ? [{ property: peer, value: declaration.previousValue }] : [])]);
  };
  const setRelationships = value => { if (lockedRelationships === undefined) setLocalRelationships(value); onLockedRelationshipsChange?.(value); };
  const spacingChange = canWrite ? (property, field, value) => { const peer = isSpacingLocked(relationships, property, field) ? peerProperty(property, field) : null; commit([{ property: field, value }, ...(peer ? [{ property: peer, value }] : [])]); } : undefined;
  const dimensionChange = canWrite ? (property, value) => {
    if (!relationships.dimensions) { change(property, value); return; }
    const peer = property === 'width' ? 'height' : 'width', current = parsedPx(editorState.declarations.find(declaration => declaration.property === property)?.value), next = parsedPx(value), peerValue = parsedPx(editorState.declarations.find(declaration => declaration.property === peer)?.value);
    commit([{ property, value }, ...(current == null || peerValue == null || next == null || current === 0 ? [] : [{ property: peer, value: `${formatPx(peerValue / current * next)}px` }])]);
  } : undefined;
  const common = { dropdownPortalContainer, isEditable, onControlDragActiveChange, onControlEditingActiveChange, onScrubActiveChange, renderDeclarationControl, locale };
  const renderSection = section => {
    if (section.kind === 'declaration') return <CodexAnnotationDeclarationRow {...common} declaration={section.declaration} onReset={() => reset(section.declaration.property)} onValueChange={change && (value => change(section.declaration.property, value))} />;
    if (section.kind === 'dimensions') return <CodexAnnotationDimensions {...common} width={section.width} height={section.height} isLocked={relationships.dimensions} onLockToggle={() => setRelationships({ ...relationships, dimensions: !relationships.dimensions })} onReset={reset} onValueChange={dimensionChange} />;
    if (section.kind === 'spacing') return <CodexAnnotationSpacing {...common} declarations={section.declarations} property={section.property} isExpanded={expanded[section.property]} lockedRelationships={relationships} onDeclarationReset={reset} onExpandToggle={() => { const value = { ...expanded, [section.property]: !expanded[section.property] }; if (expandedSpacingGroups === undefined) setLocalExpanded(value); onExpandedSpacingGroupsChange?.(value); }} onLockToggle={axis => { const key = `${section.property}-${axis}`, locked = !relationships[key]; setRelationships({ ...relationships, [key]: locked }); if (locked && canWrite) { const [first, second] = axisProperties(section.property, axis), declaration = editorState.declarations.find(value => value.property === first); if (declaration) commit([{ property: first, value: declaration.value }, { property: second, value: declaration.value }]); } }} onValueChange={spacingChange && ((field, value) => spacingChange(section.property, field, value))} />;
    if (section.kind === 'flex-spacing') return <CodexAnnotationFlexGap {...common} columnGap={section.columnGap} rowGap={section.rowGap} isExpanded={flexExpanded} onDeclarationReset={reset} onExpandToggle={() => { if (isFlexSpacingExpanded === undefined) setLocalFlexExpanded(!flexExpanded); onFlexSpacingExpandedChange?.(!flexExpanded); }} onValueChange={change} />;
    return null;
  };
  return <>{styleEnabled && <style>{layoutCss}</style>}{groups.map((group, groupIndex) => <React.Fragment key={group.id}>{groupIndex > 0 || showInitialDivider ? <CodexAnnotationSectionDivider /> : null}{group.sections.map((section, sectionIndex) => <div className={p('contents')} key={sectionKey(section)}>{sectionIndex > 0 && isFlexSection(section) && !isFlexSection(group.sections[sectionIndex - 1]) ? <CodexAnnotationSectionDivider /> : null}{renderSection(section)}</div>)}</React.Fragment>)}</>;
}

export default CodexAnnotationLayoutSections;
