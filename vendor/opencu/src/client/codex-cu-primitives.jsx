import React, { createContext, useContext, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { useCodexCuLayerRenderer } from './codex-cu-overlay.jsx';
import { useCodexCuAppearance } from './codex-cu-scope.jsx';
import { resolveCodexCuTooltipPointerPolicy } from './codex-cu-tooltip-pointer.mjs';
import tokenCss from './codex-cu-tokens.css';
import primitiveCss from './codex-cu-primitives.css';

// The root's codex-cu-styles.mjs injects the shared CSS once.
export const codexCuPrimitiveStyles = tokenCss + '\n' + primitiveCss;

// Class strings and variant tables retain the shipped Codex component decisions.
// Their CSS is extracted and locally prefixed; see primitives/manifest.json.
const p = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cuc-${value}`).join(' ');
const join = (...values) => values.filter(Boolean).join(' ');
const MenuContext = createContext({ surface: 'menu' });

export const CodexCuButton = React.forwardRef(function CodexCuButton({
  color = 'primary', size = 'default', radius = 'default', contentLayout = 'default',
  uniform = false, uniformAtMobile = false, unstyled = false, allowShrink = false,
  focusRing, disabled = false, disabledAppearance = 'dimmed', loading = false,
  spinnerVariant = 'default', sizingLabels, as, renderLink, type = 'button',
  className, children, ...props
}, ref) {
  const isDisabled = disabled || loading;
  const shape = uniform && ['toolbar', 'compact', 'medium', 'dialogGhost'].includes(size) ? 'rounded-lg' : buttonRadius[size];
  const classes = join('codex-cu-button', p(
    'no-drag cursor-interaction items-center select-none disabled:cursor-default aria-disabled:cursor-default',
    focusRing === 'surface' && 'focus:outline-none focus-visible:bg-primary-ghost-hover forced-colors:focus-visible:bg-[Highlight] forced-colors:focus-visible:text-[HighlightText] forced-colors:focus-visible:forced-color-adjust-none',
    focusRing === 'native' && 'focus-visible:outline-auto',
    !['surface', 'native'].includes(focusRing) && color !== 'chatgptPrimary' && 'focus:outline-hidden',
    disabledAppearance === 'dimmed' && (color === 'cardAction' ? 'disabled:opacity-50 aria-disabled:opacity-50' : 'disabled:opacity-40 aria-disabled:opacity-40'),
    !['none', 'surface', 'native'].includes(focusRing) && 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
    ['auth', 'surveyOption', 'surveyCard', 'selectionTile', 'settingsOption'].includes(size) ? 'whitespace-normal' : 'whitespace-nowrap',
    contentLayout === 'balanced' ? 'grid grid-cols-[1fr_auto_1fr]' : 'flex',
    !unstyled && [
      size === 'composerPill' ? 'gap-1.5 border-0' : 'border',
      !['composerPill', 'headerUpsell', 'entityRowAction', 'conversationPill', 'actionChip', 'actionChipWithIcon', 'surveyCard', 'settingsOption'].includes(size) && spinnerVariant !== 'rays' && 'gap-1',
      size === 'headerUpsell' && 'gap-0.75', spinnerVariant === 'rays' && 'gap-1.5',
      radius === 'default' ? shape : buttonRadiusOverride[radius],
      buttonColor[color === 'segmentedInsetSelected' && size === 'fieldSegment' ? 'segmentedFieldSelected' : color], buttonSize[size],
      contentLayout === 'dropdown' && 'pe-1',
    ],
    (size === 'fieldSegment' || focusRing === 'inset' || focusRing == null && ['inputSegment', 'fieldControl'].includes(size)) && 'focus-visible:ring-inset',
    allowShrink && 'min-w-0', sizingLabels != null && 'min-w-0 max-w-full',
    uniform && 'aspect-square shrink-0 items-center justify-center !px-0',
    uniformAtMobile && 'browser:max-md:aspect-square browser:max-md:shrink-0 browser:max-md:justify-center browser:max-md:!px-0',
  ), className);
  const spinner = <CodexCuSpinner variant={spinnerVariant} className={p(['imageActionIcon', 'floatingAction'].includes(size) ? 'icon' : 'icon-xxs')} />;
  const content = <>{loading && spinner}{children}</>;
  const body = sizingLabels == null ? content : <span className={p('grid min-w-0 text-center whitespace-normal')}>
    {React.Children.map(sizingLabels, label => <span aria-hidden="true" className={p('invisible col-start-1 row-start-1 flex min-w-0 items-center justify-center gap-1')}>{spinner}<span className={p('min-w-0 break-words')}>{label}</span></span>)}
    <span className={p('col-start-1 row-start-1 flex min-w-0 items-center justify-center gap-1')}>{content}</span>
  </span>;
  if (as === 'a') {
    const { href, onClick, onAuxClick, onKeyDown, tabIndex, ...rest } = props;
    const linkProps = { ...rest, ref, className: join(classes, p('button-link')), href: isDisabled ? undefined : href,
      role: isDisabled ? 'link' : rest.role, 'aria-disabled': isDisabled || rest['aria-disabled'], tabIndex: isDisabled ? -1 : tabIndex,
      onClick: event => isDisabled ? event.preventDefault() : onClick?.(event),
      onAuxClick: event => isDisabled ? event.preventDefault() : onAuxClick?.(event),
      onKeyDown: event => { if (isDisabled && ['Enter', ' '].includes(event.key)) event.preventDefault(); else onKeyDown?.(event); }, children: body };
    return renderLink && !isDisabled ? renderLink(linkProps) : <a {...linkProps} />;
  }
  return <button ref={ref} type={type} className={classes} disabled={isDisabled} {...props}>{body}</button>;
});

export const CodexCuToggle = React.forwardRef(function CodexCuToggle({ checked, onChange, disabled = false,
  ariaLabel, size = 'default', tone = 'accent', trackClassName, thumbClassName, className, onClick, ...props }, ref) {
  const state = checked ? 'checked' : 'unchecked';
  return <button ref={ref} type="button" role="switch" aria-checked={checked} aria-label={ariaLabel}
    data-state={state} disabled={disabled} {...props}
    className={join('codex-cu-toggle', p('inline-flex items-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-full', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-interaction'), className)}
    onClick={event => { onClick?.(event); if (!event.defaultPrevented && !disabled) onChange?.(!checked); }}>
    <span aria-hidden="true" data-state={state} className={join(p('relative inline-flex shrink-0 items-center rounded-full transition-colors duration-basic ease-out', checked ? tone === 'neutral' ? 'bg-text' : 'bg-chart-blue' : 'bg-text/10', size === 'sm' ? 'h-4 w-7' : 'h-5 w-8'), trackClassName)}>
      <span data-state={state} className={join(p('rounded-full border shadow-sm transition-transform duration-basic ease-out data-[state=unchecked]:translate-x-0', tone === 'neutral' && checked ? 'border-transparent bg-surface' : 'border-control-thumb-on-accent bg-control-thumb-on-accent', size === 'sm' ? 'h-3 w-3' : 'h-4 w-4', 'data-[state=unchecked]:translate-x-[2px] data-[state=checked]:translate-x-[14px] rtl:data-[state=unchecked]:-translate-x-[2px] rtl:data-[state=checked]:-translate-x-[14px]'), thumbClassName)} />
    </span>
  </button>;
});

// Source BO/aSi hover state uses the shared layer renderer; explicit open remains controlled.
export const CodexCuTooltip = React.forwardRef(function CodexCuTooltip({ open, onOpenChange, forceMount = false,
  disabled = false, tooltipContent, children, variant = 'tooltip', color = 'default', disablePadding = false,
  selectable = false, scrollable = false, interactive: interactiveInput, side, shortcut,
  tooltipClassName, tooltipBodyClassName, className, tooltipMaxWidth, style, dialogLabel, id,
  renderLayer, anchorRef, triggerRef, align = 'center', alignOffset, sideOffset, delayDuration = 200, delayOpen = false,
  followPointer = false, positioningElement, flipAlignment = true, scaleAvailableSizeWithZoom = false, portalContainer,
  openOnClick = false, openOnFocusWithin = false, triggerPopupOpen = false, isHoverOpenBlocked,
  openWhen = 'always', onBeforeOpen, closeOnTriggerBlur = true, closeOnTriggerClick, closeOnPointerLeave = true,
  closeOnWindowBlur = true, disableHoverOpen = false, keyboardNavigation = false, ...props }, ref) {
  const [localOpen, setLocalOpen] = useState(false), defaultRenderer = useCodexCuLayerRenderer();
  const pointerPolicy = resolveCodexCuTooltipPointerPolicy({ followPointer, selectable, interactive: interactiveInput, variant, open, closeOnTriggerClick, triggerPopupOpen });
  const interactive = pointerPolicy.interactive;
  const isOpen = !pointerPolicy.triggerPopupBlocksOpen && (open ?? localOpen);
  useLayoutEffect(() => { if (pointerPolicy.triggerPopupBlocksOpen && open === undefined) setLocalOpen(false); }, [pointerPolicy.triggerPopupBlocksOpen, open]);
  const changeOpen = next => { if (open === undefined) setLocalOpen(next); onOpenChange?.(next); };
  if (disabled || tooltipContent == null) return children ?? null;
  const visible = isOpen || forceMount;
  const pad = ['surface', 'inverse'].includes(color) ? 'px-2 py-1.5' : 'px-3 py-1.25';
  const surface = visible ? <div {...props} ref={ref} id={id} data-side={side} role={dialogLabel ? 'dialog' : 'tooltip'} aria-label={dialogLabel}
    aria-hidden={isOpen ? undefined : true} hidden={!isOpen && variant !== 'unstyled'}
    className={join('codex-cu-tooltip', p('w-fit text-sm whitespace-normal break-words', variant === 'tooltip' && !scrollable && 'min-h-min', scrollable && 'overflow-y-auto', selectable ? 'select-text' : 'select-none',
      variant === 'floating-navigation-rail' ? 'z-20 flex flex-col' : ['z-50', variant !== 'tooltip' && 'flex flex-col', !['tooltip', 'coachmark'].includes(variant) && 'm-px'],
      ['rich', 'entityPreview'].includes(variant) && 'bg-surface-elevated-secondary text-default ring-border shadow-xl-spread ring-[0.5px]',
      variant === 'rich' && 'rounded-xl', variant === 'entityPreview' && 'rounded-3xl',
      variant === 'tooltip' && color === 'default' && '_textTheme_8iuk0_2 text-center',
      variant === 'tooltip' && color === 'classicLight' && 'text-center rounded-full border border-(color:--color-border-tooltip-classic) bg-(--color-background-tooltip-classic) text-(color:--color-text-tooltip-classic) text-[14px] leading-[18px] font-semibold tracking-(--tracking-tooltip) shadow-(--shadow-tooltip)',
      variant === 'tooltip' && color === 'surface' && 'rounded-md bg-surface-elevated-secondary text-secondary ring-border shadow-xl-spread ring-[0.5px]',
      variant === 'tooltip' && !['surface', 'classicLight'].includes(color) && (color === 'inverse' ? 'border-text bg-primary-solid text-primary-solid rounded-2xl border' : 'rounded-2xl border border-(color:--color-border-tooltip) bg-(--color-background-tooltip) text-(color:--color-text-tooltip) leading-4.5 font-(weight:--tooltip-compact-font-weight) tracking-(--tracking-tooltip) shadow-(--shadow-tooltip)'),
      variant === 'tooltip' && !disablePadding && pad, isOpen && interactive ? 'pointer-events-auto' : 'pointer-events-none'), tooltipClassName, className)}
    style={{ maxWidth: tooltipMaxWidth ?? 'min(20rem, var(--radix-tooltip-content-available-width), calc(100vw - 16px))', maxHeight: 'min(var(--radix-tooltip-content-available-height), calc(100vh - 16px))', ...style }}>
      <div className={p('flex gap-2', variant === 'tooltip' ? 'items-center' : 'items-stretch', variant !== 'tooltip' && 'min-h-0 flex-1')}>
        <div className={join(p('min-w-0', variant !== 'tooltip' && 'flex min-h-0 w-full'), tooltipBodyClassName)}>{tooltipContent}</div>{shortcut}
      </div>
    </div> : null;
  if (children == null && !anchorRef && !triggerRef) return surface;
  return (renderLayer ?? defaultRenderer)({ type: 'tooltip', open: isOpen, forceMount, onOpenChange: changeOpen,
    triggerButton: children, anchorRef, triggerRef, content: surface, side, align, alignOffset,
    sideOffset, collisionPadding: 8, autoFocus: false, restoreFocus: false, portalContainer,
    followPointer: pointerPolicy.followPointer, positioningElement, tooltipVariant: variant, flipAlignment, scaleAvailableSizeWithZoom,
    openOnClick, openOnFocusWithin, triggerPopupBlocksOpen: pointerPolicy.triggerPopupBlocksOpen, isHoverOpenBlocked,
    delayDuration, delayOpen, openWhen, onBeforeOpen, interactive, keyboardNavigation,
    closeOnTriggerBlur, closeOnTriggerClick: pointerPolicy.closeOnTriggerClick, closeOnPointerLeave, closeOnWindowBlur, disableHoverOpen,
    preferTooltipCssSide: variant === 'tooltip' && ['default', 'classicLight'].includes(color) && side == null,
  });
});

const menuRows = { large: '_largeRows_14z1j_2', descriptive: '_descriptiveRows_14z1j_2', select: '_selectRows_14z1j_2', inset: '_insetRows_14z1j_2', action: '_actionRows_14z1j_2' };
const menuWidths = { icon: 'min-w-[120px]', xs: 'min-w-[160px]', sm: 'min-w-[180px]', menuNarrow: 'w-52', menu: 'min-w-[var(--app-menu-min-width,220px)]', menuFixed: 'w-[220px]', menuBounded: 'min-w-[200px] max-w-[320px]', menuWide: 'w-[240px]', railMenu: 'w-57', sidebar: 'min-w-[172px] max-w-[240px]', workspace: 'min-w-[260px]', panel: 'w-[280px]', panelWide: 'w-[360px]', panelExtraWide: 'w-[408px]' };
export const CodexCuMenuSurface = React.forwardRef(function CodexCuMenuSurface({ open = true, forceMount = false,
  state, side, align = 'start', size = 'default', rowLayout, surface = 'menu', variant = 'default',
  contentWidth, width = contentWidth, maxWidth = 'default', maxHeight, className, style, children, ...props }, ref) {
  if (!open && !forceMount) return null;
  const palette = surface === 'opaque' ? 'bg-surface-elevated-secondary text-default shadow-(--shadow-dropdown-overlay)' : 'bg-surface-elevated-secondary/90 text-default ring-(--color-border-overlay) ring-(length:--dropdown-overlay-ring-width) shadow-(--shadow-dropdown-overlay) backdrop-blur-sm';
  const surfaceClasses = surface === 'chatgpt' ? 'min-w-40 bg-surface-elevated-secondary text-default rounded-3xl py-2.5 shadow-(--shadow-dropdown-overlay)' : [palette, surface === 'panel' ? 'rounded-2xl p-4 shadow-2xl backdrop-blur-lg' : 'rounded-2xl p-[var(--app-menu-gutter,var(--spacing))]'];
  const maxW = maxWidth === 'wide' ? 'min(var(--container-sm), var(--radix-dropdown-menu-content-available-width), calc(100vw - 16px))' : surface === 'chatgpt' ? 'min(var(--container-xs), var(--radix-dropdown-menu-content-available-width), calc(100vw - 16px))' : 'min(var(--radix-dropdown-menu-content-available-width), calc(100vw - 16px))';
  return <MenuContext.Provider value={{ surface }}><div {...props} ref={ref} role={props.role ?? 'menu'} data-state={state ?? (open ? 'open' : 'closed')} data-side={side} data-align={align} hidden={!open}
    className={join('codex-cu-menu', p('no-drag z-50 m-px flex select-none flex-col overflow-y-auto', variant === 'picker' && 'w-65 [--app-menu-gutter:0px]', surface === 'panel' && 'px-1 py-1', surfaceClasses,
      variant === 'inset' && 'px-2.5', surface === 'glass' && '_glassSurface_14z1j_2', menuRows[size], rowLayout === 'single-line' && '_singleLineRows_14z1j_2', menuWidths[width]), className)}
    style={{ maxWidth: maxW, maxHeight: maxHeight ?? 'min(var(--radix-dropdown-menu-content-available-height), calc(100vh - 16px))', ...style }}>{children}</div></MenuContext.Provider>;
});
CodexCuMenuSurface.codexCuSurface = 'menu';

export const CodexCuMenuItem = React.forwardRef(function CodexCuMenuItem({ children, SubText, leftIcon, rightIcon, LeftIcon, RightIcon,
  keyboardShortcut, rightText, tone = 'default', variant = 'default', allowWrap = false, subTextAllowWrap = false,
  textOverflow = 'ellipsis', disabled = false, focusableWhenDisabled = false, isActive = false,
  href, onClick, onSelect, className, role = 'menuitem', ...props }, ref) {
  const display = variant === 'display', surfaceRow = display || variant === 'detail';
  const interactive = !['label', 'display'].includes(variant) && !disabled && Boolean(href || onClick || onSelect);
  const destructive = ['danger', 'destructive'].includes(tone);
  const leading = leftIcon ?? (LeftIcon ? <LeftIcon /> : null), trailing = rightIcon ?? (RightIcon ? <RightIcon /> : null);
  const classes = join('codex-cu-menu-item', p('no-drag', variant !== 'unstyled' && ['_itemBase_14z1j_2', surfaceRow ? 'rounded-md' : 'rounded-xl'],
    variant === 'label' && 'cursor-default select-text text-codex-description',
    surfaceRow && ['select-none text-default', interactive ? 'cursor-interaction' : 'cursor-default', !disabled && 'hover:bg-primary-ghost-hover focus:bg-primary-ghost-hover'],
    ['default', 'hint'].includes(variant) && [destructive && 'text-danger', tone === 'warning' && 'text-warning', tone === 'default' && (variant === 'hint' ? 'text-tertiary' : 'text-default'),
      isActive && 'bg-primary-ghost-hover', disabled ? 'cursor-default opacity-50' : interactive && (tone === 'destructive' ? 'group hover:bg-danger-soft-alpha focus:bg-danger-soft-alpha cursor-interaction' : 'group _itemInteractive_14z1j_2')],
    variant === 'hint' && '_hintRow_14z1j_2 select-none', variant === 'unstyled' && (disabled ? 'cursor-default' : interactive && 'group cursor-interaction'),
    ['default', 'hint'].includes(variant) && 'flex flex-col'), className);
  const Element = href ? 'a' : 'div';
  return <Element {...props} ref={ref} href={href} role={role} tabIndex={disabled && !focusableWhenDisabled ? undefined : -1}
    data-disabled={disabled && !focusableWhenDisabled ? '' : undefined} aria-disabled={disabled || display || undefined} aria-current={isActive ? 'true' : undefined}
    className={classes} onClick={event => { if (disabled || display || variant === 'label') { event.preventDefault(); return; } onClick?.(event); if (!event.defaultPrevented) onSelect?.(event); }}>
    <div data-menu-row-content className={p('flex w-full min-w-0 items-center gap-[var(--spacing-menu-item-content,calc(var(--spacing)*1.5))]')}>
      {leading != null && <span className={p('_leadingIcon_14z1j_2')}>{leading}</span>}
      <div className={p('flex min-w-0 flex-1 flex-col')}>
        <span className={p('min-w-0', allowWrap ? 'whitespace-normal' : textOverflow === 'fade' ? 'text-fade-truncate' : 'truncate')}>{children}</span>
        {SubText != null && <span className={p('min-w-0 text-xs leading-dense text-tertiary', subTextAllowWrap ? 'whitespace-normal' : 'truncate')}>{SubText}</span>}
      </div>
      {keyboardShortcut && <span className={p('ms-2 shrink-0 text-xs text-codex-description')}>{keyboardShortcut}</span>}
      {rightText != null && <span className={p('shrink-0', !trailing && 'pe-1')}>{rightText}</span>}{trailing}
    </div>
  </Element>;
});

export function CodexCuMenuSeparator({ className, variant, ...props }) {
  const { surface } = useContext(MenuContext); const chatgpt = (variant ?? surface) === 'chatgpt';
  return <div {...props} role="separator" className={join(p('w-full', chatgpt ? 'px-4 py-1' : 'px-[var(--app-menu-separator-inset,var(--padding-row-x))] py-[var(--app-menu-separator-gutter,var(--spacing))]'), className)}><div className={p('h-px w-full', chatgpt ? 'bg-border-subtle' : 'bg-border')} /></div>;
}
export function CodexCuMenuSectionLabel({ className, children, ...props }) { return <div {...props} data-menu-section-label className={join(p('_sectionLabel_14z1j_2'), className)}>{children}</div>; }

const popoverSizes = { anchor: 'w-[var(--radix-popover-trigger-width)]', content: 'w-fit', default: 'w-72', extraLarge: 'w-[408px]', large: 'w-96', menuWide: 'w-60', railMenu: 'w-57', workspace: 'w-65' };
export const CodexCuPopoverSurface = React.forwardRef(function CodexCuPopoverSurface({ open = true, forceMount = false,
  align = 'start', side, size = 'default', contentOverflow = 'auto', disablePadding = false,
  animation, opaque = true, unstyled = false, variant = 'default', zoom: zoomOverride, portalScaled = false, className, style, children, ...props }, ref) {
  const appearance = useCodexCuAppearance(), zoom = zoomOverride ?? appearance.windowZoom ?? 1;
  if (!open && !forceMount) return null;
  const menu = 'bg-surface-elevated-secondary text-default shadow-(--shadow-dropdown-overlay) rounded-2xl p-[var(--app-menu-gutter,var(--spacing))]';
  return <div {...props} ref={ref} data-slot="popover-content" data-state={open ? 'open' : 'closed'} data-side={side} data-align={align} hidden={!open && animation !== 'slide-from-left'}
    className={join('codex-cu-popover', p(animation === 'slide-from-left' && '_slideFromLeft_1ny4d_2', !unstyled && [
      'text-default z-50 flex origin-[var(--radix-popover-content-transform-origin)] flex-col outline-hidden', contentOverflow === 'auto' ? 'overflow-y-auto' : 'overflow-visible',
      variant === 'menu' ? [menu, !disablePadding && 'p-2'] : [variant === 'comment' ? 'ring-border-subtle rounded-2xl shadow-lg-stronger ring-1' : 'ring-(--color-border-overlay) rounded-xl shadow-(--shadow-popover-overlay) ring-(length:--popover-overlay-ring-width)', !disablePadding && 'px-1 py-1', opaque ? 'bg-surface-elevated-secondary' : 'bg-surface-elevated-secondary/90'], popoverSizes[size]]), className)}
    style={{ zoom: !portalScaled && zoom !== 1 ? zoom : undefined, maxWidth: `min(calc(var(--radix-popover-content-available-width) / ${zoom}), calc((100vw - 16px) / ${zoom}))`, maxHeight: `min(${size === 'railMenu' ? '400px, ' : ''}calc(var(--radix-popover-content-available-height) / ${zoom}), calc((100vh - 16px) / ${zoom}))`, ...style }}>{children}</div>;
});
CodexCuPopoverSurface.codexCuSurface = 'popover';

export const CodexCuLegacyPopoverSurface = React.forwardRef(function CodexCuLegacyPopoverSurface({ open = true, forceMount = false,
  transition, interrupted = false, shake = false, translucent = false, width, minWidth, maxWidth, theme,
  side, className, style, children, ...props }, ref) {
  if (!open && !forceMount && !transition?.startsWith('exiting')) return null;
  const phase = transition ? { [`data-${transition}`]: '', ...(interrupted ? { 'data-interrupted': '' } : {}) } : {};
  return <div className={p('_Transition_oe2a7_2')} {...phase}><div {...props} ref={ref} tabIndex={props.tabIndex ?? -1}
    data-side={side} data-theme={theme ?? props['data-theme']} data-translucent={translucent ? 'true' : undefined} data-animate={shake ? 'shake' : undefined}
    className={join('codex-cu-popover', p('_Popover_oe2a7_2'), className)} style={{ '--popover-width': width, '--popover-min-width': minWidth, '--popover-max-width': maxWidth, ...style }}>{children}</div></div>;
});

export const CodexCuSegmentedControl = React.forwardRef(function CodexCuSegmentedControl({ value, onChange, children,
  block = false, pill = false, variant, size = 'md', gutterSize, disabled = false, className, onClick, ...props }, forwardedRef) {
  const trackRef = useRef(null), thumbRef = useRef(null);
  const updateThumb = (smooth = false) => {
    const track = trackRef.current, thumb = thumbRef.current, selected = track?.querySelector('[data-state="on"]');
    if (!track || !thumb || !selected) return;
    let width = Math.floor(selected.clientWidth); const left = selected.offsetLeft, padding = parseFloat(getComputedStyle(track).paddingRight) || 0;
    if (track.clientWidth - (width + left) < padding) width -= 1;
    thumb.style.width = `${Math.floor(width)}px`; thumb.style.transform = `translateX(${left}px)`;
    if (track.scrollWidth > track.clientWidth) { const margin = track.clientWidth * .15, bounds = track.getBoundingClientRect(), selectedBounds = selected.getBoundingClientRect();
      if (selectedBounds.left < bounds.left + margin || selectedBounds.right > bounds.right - margin) track.scrollBy({ left: selectedBounds.left + selectedBounds.width / 2 - (bounds.left + bounds.width / 2), behavior: smooth ? 'smooth' : 'instant' }); }
  };
  useLayoutEffect(() => { const thumb = thumbRef.current; if (!thumb) return; updateThumb(Boolean(thumb.style.transition));
    const frame = requestAnimationFrame(() => { thumb.style.transition = 'width 300ms var(--cubic-enter), transform 300ms var(--cubic-enter)'; });
    return () => cancelAnimationFrame(frame); }, [value, size, gutterSize, pill, variant]);
  useLayoutEffect(() => { const track = trackRef.current; if (!track || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { const thumb = thumbRef.current; if (!thumb) return; const transition = thumb.style.transition; thumb.style.transition = ''; updateThumb(); thumb.style.transition = transition; });
    observer.observe(track); return () => observer.disconnect(); }, []);
  const setRef = node => { trackRef.current = node; if (typeof forwardedRef === 'function') forwardedRef(node); else if (forwardedRef) forwardedRef.current = node; };
  return <div {...props} ref={setRef} role="group" data-block={block ? '' : undefined} data-pill={pill ? '' : undefined} data-variant={variant} data-size={size} data-gutter-size={gutterSize}
    className={join('codex-cu-segmented', p('_SegmentedControl_1is40_1'), className)} onClick={onClick}>
    <div ref={thumbRef} className={p('_SegmentedControlThumb_1is40_265')} />
    {React.Children.map(children, child => React.isValidElement(child) ? React.cloneElement(child, { selected: child.props.value === value, disabled: disabled || child.props.disabled, onSelect: onChange }) : child)}
  </div>;
});
export function CodexCuSegmentedControlOption({ value, selected = false, disabled = false, onSelect, onClick, className, children, ...props }) {
  return <button {...props} type="button" data-state={selected ? 'on' : 'off'} aria-pressed={selected} disabled={disabled}
    className={join('codex-cu-segmented-option', p('_SegmentedControlOption_1is40_152'), className)} onClick={event => { onClick?.(event); if (!event.defaultPrevented && !disabled) onSelect?.(value); }}><span className={p('relative')}>{children}</span></button>;
}
CodexCuSegmentedControl.Option = CodexCuSegmentedControlOption;
const buttonRadius = {
  "onboardingAction": "rounded-full",
  "activityOption": "rounded-full",
  "auth": "rounded-full",
  "giftCard": "rounded-full",
  "compact": "rounded-button-action",
  "cardAction": "rounded-full",
  "default": "rounded-full",
  "actionSm": "rounded-full",
  "sidebarOffer": "rounded-full",
  "dialog": "rounded-full",
  "dialogAction": "rounded-full",
  "responsiveDialogAction": "rounded-full",
  "modalPrimary": "rounded-full",
  "pageAction": "rounded-full",
  "formDisclosure": "rounded-xl",
  "formValue": "rounded-md",
  "recoveryAction": "rounded-full",
  "panelAction": "rounded-full",
  "detailAction": "rounded-full",
  "beaconAction": "rounded-full",
  "expressiveBeaconAction": "rounded-full",
  "takeoverHeroAction": "rounded-full",
  "promotionalAction": "rounded-full",
  "promotionalLink": "rounded-full",
  "workNux": "rounded-full",
  "workPopover": "rounded-full",
  "beaconCarousel": "rounded-full",
  "conversationFollowup": "rounded-full",
  "conversationPill": "rounded-full",
  "conversationPillAction": "rounded-full",
  "actionChip": "rounded-full",
  "actionChipWithIcon": "rounded-full",
  "paginationDot": "rounded-full",
  "dialogGhost": "rounded-button-action",
  "messageChip": "rounded-button-action",
  "avatarGroup": "rounded-full",
  "avatarGroupAction": "rounded-full",
  "entityHeader": "rounded-xl",
  "entityRowAction": "rounded-full",
  "dragHandle": "rounded-lg",
  "formatToolbar": "rounded-md",
  "formatToolbarIcon": "rounded-md",
  "field": "rounded-lg",
  "fieldControl": "rounded-none",
  "fieldSegment": "rounded-lg",
  "icon": "rounded-full electron:rounded-md",
  "iconCircle": "rounded-full",
  "iconCircleLg": "rounded-full",
  "iconTouch": "rounded-full",
  "iconCircleSm": "rounded-full",
  "iconLarge": "rounded-2xl",
  "iconMd": "rounded-md",
  "iconSm": "rounded-md",
  "inputSegment": "rounded-none",
  "inputSelect": "rounded-none",
  "inputControl": "rounded-xl",
  "imageToolbar": "rounded-full",
  "imageAction": "rounded-lg",
  "imageActionIcon": "rounded-full",
  "floatingAction": "rounded-full",
  "inline": "rounded-none",
  "inputIcon": "rounded-s-lg rounded-e-none",
  "large": "rounded-full",
  "medium": "rounded-button-action",
  "menuRow": "rounded-lg",
  "settingsSelect": "rounded-md",
  "settingsOption": "rounded-lg",
  "settingsAction": "rounded-button-action",
  "composer": "rounded-full",
  "composerWithBadge": "rounded-full",
  "composerPill": "rounded-full",
  "composerAuxiliary": "rounded-full",
  "composerPermissions": "rounded-full",
  "composerSm": "rounded-full",
  "composerSmLabel": "rounded-full",
  "shareDestination": "rounded-full",
  "surveyOption": "rounded-lg",
  "surveyCard": "rounded-xl",
  "selectionTile": "rounded-xl",
  "imageTile": "rounded-xl",
  "tabStripAction": "rounded-lg",
  "toolbar": "rounded-button-toolbar",
  "toolbarLabel": "rounded-lg",
  "headerUpsell": "rounded-lg"
};

const buttonRadiusOverride = {
  "full": "rounded-full",
  "messageBubble": "rounded-[var(--message-bubble-radius,var(--radius-full))]",
  "extraLarge": "rounded-2xl",
  "large": "rounded-lg",
  "small": "rounded-md"
};

const buttonColor = {
  "activity": "border-transparent bg-activity-control text-activity-control not-disabled:not-aria-disabled:hover:bg-activity-control-hover not-disabled:not-aria-disabled:hover:text-activity-control-active not-disabled:not-aria-disabled:data-[native-hovered=true]:bg-activity-control-hover not-disabled:not-aria-disabled:data-[native-hovered=true]:text-activity-control-active aria-pressed:bg-activity-control-hover aria-pressed:text-activity-control-active",
  "activityStop": "border-transparent bg-activity-control text-activity-control not-disabled:not-aria-disabled:hover:bg-activity-stop-hover not-disabled:not-aria-disabled:hover:text-activity-control-active not-disabled:not-aria-disabled:data-[native-hovered=true]:bg-activity-stop-hover not-disabled:not-aria-disabled:data-[native-hovered=true]:text-activity-control-active",
  "activitySuccess": "border-transparent bg-[light-dark(var(--green-50),var(--green-900))] text-[color:light-dark(var(--green-400),var(--green-300))] not-disabled:not-aria-disabled:hover:bg-[light-dark(var(--green-300),var(--green-500))] not-disabled:not-aria-disabled:hover:text-white not-disabled:not-aria-disabled:data-[native-hovered=true]:bg-[light-dark(var(--green-300),var(--green-500))] not-disabled:not-aria-disabled:data-[native-hovered=true]:text-white",
  "accent": "bg-info-solid not-disabled:not-aria-disabled:hover:bg-info-solid/90 data-[state=open]:bg-info-solid/90 text-info-solid border-transparent",
  "accentInverse": "bg-info-solid not-disabled:not-aria-disabled:hover:bg-info-solid/90 data-[state=open]:bg-info-solid/90 text-inverse border-transparent",
  "accentSubtle": "bg-text-info/10 not-disabled:not-aria-disabled:hover:bg-text-info/15 data-[state=open]:bg-text-info/15 text-info border-transparent",
  "conversationAccentSubtle": "bg-[var(--conversation-accent,var(--color-text-info))]/10 not-disabled:not-aria-disabled:hover:bg-[var(--conversation-accent,var(--color-text-info))]/15 data-[state=open]:bg-[var(--conversation-accent,var(--color-text-info))]/15 text-[color:var(--conversation-accent-text,var(--color-text-info))] border-transparent",
  "headerUpgrade": "border-transparent bg-transparent text-text-header-upgrade not-disabled:not-aria-disabled:hover:bg-background-header-upgrade-hover focus-visible:bg-background-header-upgrade-hover data-[state=open]:bg-background-header-upgrade-hover",
  "upgrade": "border-transparent bg-[light-dark(var(--blue-a25),--alpha(var(--blue-100)/15%))] text-[color:light-dark(var(--blue-500),var(--blue-50))] not-disabled:not-aria-disabled:hover:bg-[light-dark(--alpha(var(--blue-400)/9%),--alpha(var(--blue-100)/20%))] data-[state=open]:bg-[light-dark(--alpha(var(--blue-400)/9%),--alpha(var(--blue-100)/20%))]",
  "composerPrimary": "bg-composer-primary not-disabled:not-aria-disabled:hover:bg-composer-primary/90 data-[state=open]:bg-composer-primary/90 text-composer-primary border-transparent",
  "composerSurface": "border-transparent bg-(--color-background-primary-soft)/90 text-default shadow-(--elevation-composer) dark:bg-surface-elevated dark:shadow-(--elevation-composer-dark) not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover light:[:where(:root[data-codex-os=win32].electron-opaque)_&]:bg-(--color-background-primary-soft) forced-colors:shadow-none forced-colors:outline forced-colors:outline-[CanvasText]",
  "cardAction": "border-subtle bg-surface-card text-default not-disabled:not-aria-disabled:active:opacity-80",
  "successOutline": "border-text-success-solid/20 bg-transparent text-success-solid not-disabled:not-aria-disabled:hover:bg-text-success-solid/10",
  "successSolid": "bg-success-solid not-disabled:not-aria-disabled:hover:bg-success-solid-hover data-[state=open]:bg-success-solid-hover text-success-solid border-transparent",
  "danger": "bg-chart-red/10 not-disabled:not-aria-disabled:hover:bg-chart-red/20 text-chart-red border-transparent",
  "dangerSolid": "bg-danger-solid not-disabled:not-aria-disabled:hover:bg-danger-solid/90 text-danger-solid border-transparent",
  "dangerOutline": "border-danger bg-transparent text-danger not-disabled:not-aria-disabled:hover:bg-danger-solid/10",
  "ghost": "text-tertiary not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover border-transparent",
  "disclosure": "border-transparent bg-transparent text-tertiary",
  "blockAction": "text-tertiary not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover not-disabled:not-aria-disabled:hover:text-default data-[state=open]:bg-primary-ghost-hover border-transparent",
  "ghostAccent": "text-info not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover border-transparent",
  "ghostSubtle": "text-default not-disabled:not-aria-disabled:hover:bg-primary-soft-alpha data-[state=open]:bg-primary-soft-alpha border-0",
  "ghostAccentSubtle": "text-info not-disabled:not-aria-disabled:hover:bg-primary-soft-alpha data-[state=open]:bg-primary-soft-alpha border-0",
  "ghostOutline": "border-transparent text-tertiary not-disabled:not-aria-disabled:hover:border-default not-disabled:not-aria-disabled:hover:bg-surface not-disabled:not-aria-disabled:hover:text-default not-disabled:not-aria-disabled:hover:shadow-sm data-[state=open]:border-default data-[state=open]:bg-surface data-[state=open]:text-default data-[state=open]:shadow-sm",
  "ghostSecondary": "text-secondary not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover border-transparent",
  "ghostDanger": "border-transparent text-default not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover not-disabled:not-aria-disabled:hover:text-danger focus-visible:bg-primary-ghost-hover focus-visible:text-danger",
  "outlineActive": "border-default bg-text/10 not-disabled:not-aria-disabled:hover:bg-text/15 data-[state=open]:bg-text/15 border",
  "ghostActive": "text-default not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover border-transparent",
  "toolbar": "text-(--color-text-toolbar-action) not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover border-transparent",
  "ghostMuted": "not-disabled:not-aria-disabled:hover:bg-transparent data-[state=open]:bg-transparent hover:text-default border-transparent",
  "ghostUserMessage": "text-user-message not-disabled:not-aria-disabled:hover:bg-transparent data-[state=open]:bg-transparent border-transparent",
  "ghostTertiary": "text-tertiary not-disabled:not-aria-disabled:hover:bg-transparent data-[state=open]:bg-transparent not-disabled:not-aria-disabled:hover:text-default border-transparent",
  "mediaSolid": "border-transparent bg-media-foreground text-media-background not-disabled:not-aria-disabled:hover:bg-media-foreground/90 data-[state=open]:bg-media-foreground/90",
  "mediaSubtle": "border-media-foreground/20 bg-media-control-background text-media-foreground not-disabled:not-aria-disabled:hover:bg-media-control-hover data-[state=open]:bg-media-control-hover",
  "mediaOverlay": "border-transparent bg-media-control-background text-media-foreground not-disabled:not-aria-disabled:hover:bg-media-control-hover focus:bg-media-control-hover data-[state=open]:bg-media-control-hover",
  "mediaTranslucent": "border-transparent bg-media-background/20 text-media-foreground backdrop-blur-md backdrop-brightness-75 not-disabled:not-aria-disabled:hover:bg-media-background/30 focus-visible:bg-media-background/30 data-[state=open]:bg-media-background/30",
  "imageSurface": "border-transparent bg-surface text-default not-disabled:not-aria-disabled:hover:bg-surface focus-visible:bg-surface data-[state=open]:bg-surface",
  "outline": "border-default bg-primary-soft-alpha not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover border",
  "field": "border-default bg-primary-soft text-default not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover",
  "mapSurface": "relative isolate border-transparent bg-surface text-default ring-1 ring-border after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-[inherit] not-disabled:not-aria-disabled:hover:after:bg-primary-ghost-hover data-[state=open]:after:bg-primary-ghost-hover not-disabled:not-aria-disabled:aria-pressed:hover:after:bg-current/10 aria-pressed:bg-primary-solid aria-pressed:text-primary-solid",
  "outlineSurface": "border-default bg-surface not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover border",
  "outlineSurfaceRaised": "button-surface-tint border-default bg-surface text-default shadow-sm border-hairline",
  "outlineCard": "border-button-outline bg-surface-card text-button-outline not-disabled:not-aria-disabled:hover:bg-button-outline-hover data-[state=open]:bg-button-outline-hover not-disabled:not-aria-disabled:active:opacity-80",
  "conversationFollowup": "border-default bg-surface text-default shadow-sm not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover border",
  "conversationPill": "border-default bg-surface-card text-default shadow-card not-disabled:not-aria-disabled:hover:border-transparent not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:border-transparent data-[state=open]:bg-primary-ghost-hover dark:border-transparent dark:shadow-none",
  "selectTrigger": "border-default bg-surface not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-surface-elevated-secondary data-[state=open]:rounded-t-2xl data-[state=open]:rounded-b-none data-[state=open]:border-b-transparent border",
  "outlineGhost": "border-default bg-transparent text-default not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover",
  "outlineGhostMuted": "border-default bg-transparent text-tertiary not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover",
  "outlineSubtle": "border-subtle bg-transparent text-secondary not-disabled:not-aria-disabled:hover:bg-secondary-soft data-[state=open]:bg-secondary-soft",
  "surveyCard": "border-subtle bg-transparent text-default not-disabled:not-aria-disabled:not-aria-pressed:hover:bg-secondary-soft aria-pressed:bg-primary-ghost-hover",
  "selectionTile": "relative border-default bg-surface text-default not-disabled:not-aria-disabled:hover:bg-primary-ghost-hover after:pointer-events-none after:absolute after:-inset-px after:rounded-[inherit] aria-pressed:border-text aria-pressed:after:inset-ring-2 aria-pressed:after:inset-ring-text",
  "primary": "border-default bg-primary-solid not-disabled:not-aria-disabled:hover:bg-text/80 data-[state=open]:bg-text/80 text-primary-solid",
  "chatgptPrimary": "border-transparent bg-primary-solid bg-clip-padding text-primary-solid not-disabled:not-aria-disabled:hover:bg-primary-solid-hover focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-text",
  "shareDestination": "border-transparent bg-transparent text-secondary not-disabled:not-aria-disabled:hover:bg-transparent [&>.share-destination-icon]:bg-text/5 [&>.share-destination-icon]:text-default not-disabled:not-aria-disabled:hover:[&>.share-destination-icon]:bg-text/10 not-disabled:not-aria-disabled:active:[&>.share-destination-icon]:bg-text/10",
  "secondary": "text-default bg-text/5 not-disabled:not-aria-disabled:hover:bg-text/10 data-[state=open]:bg-text/10 border-transparent",
  "secondarySurface": "button-surface-tint border-default bg-surface text-default",
  "tinted": "bg-current/10 not-disabled:not-aria-disabled:hover:bg-current/15 data-[state=open]:bg-current/15 border-transparent",
  "segmentedSelected": "text-default bg-segmented-selected not-disabled:not-aria-disabled:hover:bg-segmented-selected-hover data-[state=open]:bg-segmented-selected-hover border-transparent",
  "segmentedInsetSelected": "border-transparent bg-surface text-default shadow-sm not-disabled:not-aria-disabled:hover:bg-surface not-disabled:not-aria-disabled:active:bg-surface data-[state=open]:bg-surface",
  "segmentedFormSelected": "border-transparent bg-transparent text-default forced-colors:z-20 forced-colors:outline forced-colors:outline-[Highlight]",
  "segmentedFormUnselected": "border-transparent bg-transparent text-secondary not-disabled:not-aria-disabled:hover:text-default data-[state=open]:text-default",
  "segmentedFieldSelected": "border-transparent bg-surface text-default inset-ring-1 inset-ring-(--color-border) not-disabled:not-aria-disabled:hover:bg-surface not-disabled:not-aria-disabled:active:bg-surface data-[state=open]:bg-surface dark:border-default dark:bg-surface-elevated-secondary dark:bg-clip-padding dark:inset-ring-0 dark:not-disabled:not-aria-disabled:hover:bg-surface-elevated-secondary dark:not-disabled:not-aria-disabled:active:bg-surface-elevated-secondary dark:data-[state=open]:bg-surface-elevated-secondary"
};

const buttonSize = {
  "onboardingAction": "h-11.5 justify-center px-4 py-2 text-onboarding-body leading-4 font-medium",
  "activityOption": "px-4 py-2 text-[14px] leading-4 font-medium",
  "auth": "min-h-13 justify-center gap-2 px-5 py-3 text-base leading-6 font-medium",
  "giftCard": "h-12 justify-center px-6 text-base leading-[26px] font-medium",
  "compact": "h-6 px-2 py-0 text-xs leading-4",
  "cardAction": "h-7 min-h-7 shrink-0 justify-center px-3 py-0 text-sm leading-5 font-medium pointer-coarse:min-h-10",
  "composer": "h-token-button-composer px-(--padding-button-composer-inline,calc(var(--spacing)*2)) py-0 text-(length:--text-button-composer,var(--text-sm)) leading-(--line-height-button-composer,18px)",
  "composerWithBadge": "h-token-button-composer ps-2 pe-[calc((var(--spacing-token-button-composer)-var(--spacing)*5)/2-1px)] py-0 text-sm leading-[18px]",
  "composerPill": "h-(--spacing-token-button-composer) py-0 ps-3 pe-3.5 text-base leading-relaxed",
  "composerAuxiliary": "h-token-button-composer px-2 py-0 text-sm leading-[18px]",
  "composerPermissions": "h-token-button-composer min-w-token-button-composer justify-center px-1.5 py-0 text-sm leading-[18px]",
  "composerSm": "h-token-button-composer-sm px-1.5 py-0 text-sm leading-[18px]",
  "composerSmLabel": "h-token-button-composer-sm px-2.5 py-0 text-sm leading-[18px]",
  "default": "px-2 py-0.5 text-sm leading-[18px]",
  "actionSm": "min-h-7 shrink-0 justify-center px-2.5 py-0 text-xs leading-4 font-medium pointer-coarse:min-h-10",
  "sidebarOffer": "min-h-9 shrink-0 justify-center px-4 py-0 text-xs leading-5 font-medium pointer-coarse:min-h-10",
  "dialog": "min-h-9 px-3 text-sm font-medium",
  "dialogAction": "min-h-9 shrink-0 px-4 text-sm font-medium",
  "responsiveDialogAction": "min-h-12 w-full shrink-0 justify-center px-6 py-3 text-base leading-6 font-medium sm:min-h-9 sm:w-auto sm:px-4 sm:py-0 sm:text-sm sm:leading-normal",
  "modalPrimary": "min-h-12 justify-center border-0 px-6 py-3 text-[17px] leading-6 font-medium tracking-[-0.44px]",
  "pageAction": "h-8 shrink-0 px-4 py-0 text-sm font-medium browser:h-9",
  "formDisclosure": "min-h-12 justify-start gap-1 border-0 px-3.5 py-0 text-form-body font-normal motion-safe:transition-[min-height] motion-safe:duration-relaxed motion-safe:ease-enter-snappy aria-expanded:min-h-10.5",
  "formValue": "min-h-10 gap-2 border-0 px-0 py-0 text-form-body font-normal",
  "entityRowAction": "min-h-9 shrink-0 justify-center gap-1.5 px-3 py-0 text-onboarding-body font-medium",
  "recoveryAction": "min-h-9 shrink-0 justify-center px-3 text-sm leading-5 font-medium",
  "panelAction": "min-h-12 shrink-0 justify-center px-8 text-sm leading-5 font-medium",
  "detailAction": "min-h-10 justify-center px-4 text-base font-medium",
  "beaconAction": "min-h-11 justify-center px-4 text-sm font-medium",
  "takeoverHeroAction": "min-h-11 justify-center px-4 text-document leading-5 font-medium",
  "expressiveBeaconAction": "min-h-9 justify-center px-5 text-document leading-5 font-medium",
  "promotionalAction": "min-h-11.5 justify-center border-0 px-4 py-3.25 text-onboarding-body font-medium",
  "promotionalLink": "min-h-9 justify-center border-0 px-0 py-2 text-onboarding-body font-semibold tracking-announcement-body underline decoration-from-font [text-underline-position:from-font]",
  "workNux": "min-h-11 min-w-29 justify-center px-6 text-sm font-medium",
  "workPopover": "min-h-8 justify-center px-3 text-sm font-normal",
  "beaconCarousel": "h-9 min-w-30 justify-center px-4 text-sm font-medium",
  "conversationFollowup": "h-10 shrink-0 px-4 py-0 text-sm leading-5",
  "conversationPill": "min-h-12 gap-1.5 px-4 py-3 text-base leading-5.5 font-medium",
  "conversationPillAction": "min-h-9 px-3 py-0 text-base leading-5.5 font-medium",
  "actionChip": "min-h-9 gap-1.5 border-0 py-2 ps-4 pe-2.5 text-[14px] leading-5 font-normal tracking-[-0.14px]",
  "actionChipWithIcon": "min-h-11 gap-2 border-0 py-2 ps-2 pe-7 text-[14px] leading-5 font-normal tracking-[-0.14px] has-[>svg:last-child]:pe-2",
  "paginationDot": "h-6 w-3.5 shrink-0 justify-center border-0 p-0",
  "dialogGhost": "min-h-9 gap-1.5 px-3 text-sm leading-5",
  "messageChip": "min-h-(--height-token-message) gap-1.5 px-3 text-sm leading-5",
  "avatarGroup": "h-full border-0 px-1 text-sm leading-5",
  "avatarGroupAction": "h-full border-0 ps-0 pe-3 text-sm leading-5",
  "entityHeader": "size-9 shrink-0 justify-center border-0 p-0 pointer-coarse:min-h-10 pointer-coarse:min-w-10",
  "dragHandle": "h-7 w-6 shrink-0 justify-center p-0",
  "formatToolbar": "h-7 border-0 px-1.5 py-0 text-sm leading-5",
  "formatToolbarIcon": "size-7 shrink-0 justify-center border-0 p-0",
  "field": "h-8 min-w-0 px-2 py-0 text-sm leading-4.5",
  "fieldControl": "h-full w-8 shrink-0 justify-center border-0 p-0",
  "fieldSegment": "h-8 min-w-0 justify-center border-0 px-2 py-0 text-sm leading-4.5 dark:border",
  "icon": "electron:p-1 electron:[&>svg]:icon-sm flex items-center justify-center p-0.5",
  "iconCircle": "flex size-8 items-center justify-center p-0",
  "iconCircleLg": "flex size-9 items-center justify-center p-0",
  "iconTouch": "flex size-11 shrink-0 items-center justify-center p-0",
  "iconCircleSm": "flex size-5 items-center justify-center p-0",
  "iconLarge": "flex size-16 items-center justify-center p-0",
  "iconMd": "flex size-5 items-center justify-center p-0.5 [&>svg]:icon-2xs",
  "iconSm": "flex h-4 w-4 items-center justify-center p-0.5 [&>svg]:icon-2xs",
  "imageToolbar": "h-9 gap-1.5 border-0 px-2 py-0 text-sm leading-5",
  "imageAction": "h-9 justify-center border-0 px-3 py-0 text-sm leading-4.5 font-medium",
  "imageActionIcon": "size-7 justify-center border-0 p-1",
  "floatingAction": "h-14 justify-center overflow-clip border-0 px-6 py-0 text-sm leading-5 font-medium shadow-widget-inline",
  "inline": "border-0 p-0",
  "inputIcon": "size-9 justify-center border-0 p-0",
  "inputSegment": "h-full w-10 shrink-0 justify-center border-e-border p-0",
  "inputSelect": "h-full min-w-28 shrink-0 gap-2 border-0 px-3 text-sm",
  "inputControl": "h-10 shrink-0 px-4 py-0 text-sm leading-5",
  "large": "px-5 py-2 text-base leading-[18px]",
  "medium": "px-4 py-1.5 text-base leading-[18px]",
  "menuRow": "h-7 px-2 py-0 text-xs leading-4",
  "settingsSelect": "h-9 px-2 py-1 text-sm leading-none",
  "settingsOption": "min-h-9 gap-2 px-2 py-2 text-sm leading-5",
  "settingsAction": "h-7 px-2 py-0 text-base leading-5",
  "shareDestination": "min-w-20 flex-col gap-3 border-0 p-0 text-xs max-sm:min-w-0",
  "surveyOption": "gap-3 border-0 p-4 text-base leading-6 font-normal",
  "surveyCard": "gap-3 p-4 text-sm leading-5 font-normal",
  "selectionTile": "h-16 min-w-0 flex-col justify-center px-2 py-2 text-xs leading-4 font-normal",
  "imageTile": "relative h-16 min-w-0 w-full justify-center overflow-hidden p-0",
  "tabStripAction": "h-[calc(var(--spacing-token-button-composer)+6px)] px-2 py-0 text-base leading-[18px]",
  "toolbar": "button-toolbar py-0 text-sm leading-[18px]",
  "toolbarLabel": "button-toolbar py-0 text-sm leading-[18px]",
  "headerUpsell": "h-8.5 px-3 py-0 text-sm leading-5 font-medium pointer-coarse:h-10"
};

// Menu selection rows retain their distinct source structures and indicators.
const MenuRadioContext = createContext({});
export function CodexCuMenuRadioGroup({ value, onValueChange, children, ...props }) {
  return <MenuRadioContext.Provider value={{ value, onValueChange }}><div {...props} role="group">{children}</div></MenuRadioContext.Provider>;
}
export function CodexCuMenuCheckboxItem({ checked = false, onCheckedChange, indicator = 'checkmark', children,
  SubText, leftIcon, disabled = false, closeOnSelect = false, href, onSelect, className, ...props }) {
  const mark = indicator === 'switch' ? <CodexCuToggleTrack checked={checked === true} size="sm" /> : <span className={p('icon-xs shrink-0')}>{checked && <CodexCuIcon name="menu-check" className={p('icon-xs')} />}</span>;
  return <CodexCuMenuItem {...props} href={href} role="menuitemcheckbox" aria-checked={checked} disabled={disabled}
    className={className} leftIcon={leftIcon} SubText={SubText} rightIcon={mark} subTextAllowWrap
    onSelect={event => { if (href == null && !closeOnSelect) event.preventDefault(); onSelect?.(event); onCheckedChange?.(!checked); }}>{children}</CodexCuMenuItem>;
}
export function CodexCuMenuRadioItem({ value, checked, children, SubText, icon, variant = 'default', disabled = false,
  href, onSelect, onClick, className, ...props }) {
  const group = useContext(MenuRadioContext), selected = checked ?? (value === group.value), compact = ['icon', 'swatch'].includes(variant);
  const classes = join('codex-cu-menu-item', p(compact ? ['no-drag flex size-9 items-center justify-center rounded-full p-0 text-default outline-hidden focus-visible:ring-2 focus-visible:ring-ring', disabled ? 'cursor-default opacity-50' : 'cursor-interaction', variant === 'icon' && 'data-highlighted:bg-primary-ghost-hover data-[state=checked]:bg-primary-ghost-hover data-[state=checked]:ring-1 data-[state=checked]:ring-border'] : ['no-drag', variant === 'chatgpt' ? 'mx-1.5 rounded-lg px-2.5 py-2 text-sm leading-5 outline-none' : '_itemBase_14z1j_2 rounded-xl', 'text-default', disabled && 'cursor-default opacity-50', !disabled && (variant === 'chatgpt' ? 'cursor-interaction data-[highlighted]:bg-primary-ghost-hover' : 'group _itemInteractive_14z1j_2')]), className);
  const row = compact ? children : <div className={p(variant === 'chatgpt' ? 'flex items-center gap-1.5' : 'flex w-full items-center gap-[var(--spacing-menu-item-content,calc(var(--spacing)*1.5))]')}>
    {icon}<div className={p('flex min-w-0 flex-1 flex-col', variant === 'default' && 'gap-1')}><span className={p('whitespace-normal', variant === 'default' && 'font-medium')}>{children}</span>
      {SubText != null && variant !== 'descriptive' && <span className={p('text-xs whitespace-normal', variant === 'chatgpt' ? 'leading-4 text-secondary' : 'leading-dense text-tertiary')}>{SubText}</span>}</div>
    <span className={p(variant === 'chatgpt' ? 'size-4 shrink-0' : 'icon-sm shrink-0')}>{selected && <CodexCuIcon name={variant === 'chatgpt' ? 'shared:N9' : 'menu-check'} className={p(variant === 'chatgpt' ? 'icon-xs' : 'icon-sm')} />}</span>
  </div>;
  const Element = href ? 'a' : 'div';
  return <Element {...props} href={href} role="menuitemradio" aria-checked={selected} aria-disabled={disabled || undefined} data-disabled={disabled ? '' : undefined} data-state={selected ? 'checked' : 'unchecked'} tabIndex={disabled ? undefined : -1}
    className={classes} onClick={event => { if (disabled) { event.preventDefault(); return; } onClick?.(event); if (!event.defaultPrevented) { onSelect?.(event); group.onValueChange?.(value); } }}>
    {variant === 'descriptive' ? <div className={p('flex w-full min-w-0 flex-col gap-1')}>{row}{SubText != null && <span className={p('text-xs leading-dense whitespace-normal text-tertiary')}>{SubText}</span>}</div> : row}
  </Element>;
}
export function CodexCuMenuSection({ children, className, size, ...props }) {
  return <div {...props} className={join(p(size != null && 'flex min-h-0 flex-col overflow-y-auto text-sm _scrollSection_1ebbz_12', size === 'five-rows' && '_fixedSection_1ebbz_26'), className)}>{children}</div>;
}
export function CodexCuToggleTrack({ checked, size = 'default', tone = 'accent', trackClassName, thumbClassName }) {
  const state = checked ? 'checked' : 'unchecked';
  return <span aria-hidden="true" data-state={state} className={join(p('relative inline-flex shrink-0 items-center rounded-full transition-colors duration-basic ease-out', checked ? tone === 'neutral' ? 'bg-text' : 'bg-chart-blue' : 'bg-text/10', size === 'sm' ? 'h-4 w-7' : 'h-5 w-8'), trackClassName)}>
    <span data-state={state} className={join(p('rounded-full border shadow-sm transition-transform duration-basic ease-out data-[state=unchecked]:translate-x-0', tone === 'neutral' && checked ? 'border-transparent bg-surface' : 'border-control-thumb-on-accent bg-control-thumb-on-accent', size === 'sm' ? 'h-3 w-3' : 'h-4 w-4', 'data-[state=unchecked]:translate-x-[2px] data-[state=checked]:translate-x-[14px] rtl:data-[state=unchecked]:-translate-x-[2px] rtl:data-[state=checked]:-translate-x-[14px]'), thumbClassName)} />
  </span>;
}

export function CodexCuSpinner({ as: Element = 'div', Icon, variant = 'default', className, containerClassName }) {
  return <Element className={join(p('inline-flex h-fit w-fit items-center justify-center leading-none contain-layout contain-paint contain-style motion-safe:animate-spin'), containerClassName)}
    onAnimationStart={event => { for (const animation of event.currentTarget.getAnimations()) animation.startTime = 0; }}>
    {Icon ? <Icon className={className} /> : <CodexCuIcon name={variant === 'rays' ? 'spinner-rays' : 'shared:Dk'} className={join(p(variant === 'rays' && 'shrink-0 _rays_va20p_2'), className)} />}
  </Element>;
}
export function CodexCuMenuMessage({ children, className, tone = 'muted', compact = false, centered = false, role, variant = 'default' }) {
  return <div role={role} className={join(p(variant === 'inset' && 'm-1 flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-default p-3 text-center text-sm',
    variant === 'chatgpt' && 'mx-1.5 px-2.5 py-2.5 text-xs leading-4', variant === 'default' && ['px-row-x text-sm', compact ? 'py-2' : 'py-3'],
    tone === 'error' && 'text-danger', tone === 'muted' && (variant === 'chatgpt' ? 'text-tertiary' : 'text-codex-description'), centered && 'self-center text-center'), className)}>{children}</div>;
}
export const CodexCuMenuFlyoutTrigger = React.forwardRef(function CodexCuMenuFlyoutTrigger({ label, triggerContent,
  leftIcon, LeftIcon, rightIcon, allowWrap = false, disabled = false, open = false, variant = 'default',
  ariaLabel, onSelect, onClick, className, ...props }, ref) {
  const leading = leftIcon ?? (LeftIcon ? <LeftIcon className={p('icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100')} /> : null);
  return <div {...props} ref={ref} role="menuitem" aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel} aria-disabled={disabled || undefined} tabIndex={disabled ? undefined : -1} data-state={open ? 'open' : 'closed'} data-disabled={disabled ? '' : undefined}
    className={join(p(variant === 'default' ? '_itemBase_14z1j_2 flex w-full items-center rounded-xl text-default' : 'no-drag outline-hidden', disabled ? 'cursor-default opacity-50' : 'group cursor-interaction', !disabled && variant === 'default' && 'data-[highlighted]:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover focus-visible:bg-primary-ghost-hover'), className)}
    onClick={event => { if (disabled) { event.preventDefault(); return; } onClick?.(event); if (!event.defaultPrevented && onSelect) { event.preventDefault(); event.stopPropagation(); onSelect(); } }}>
    {triggerContent ?? <div data-menu-row-content className={p('flex w-full items-center gap-[var(--spacing-menu-item-content,calc(var(--spacing)*1.5))]')}>
      {leading != null && <span className={p('_leadingIcon_14z1j_2')}>{leading}</span>}<span className={p('min-w-0 flex-1', allowWrap ? 'whitespace-normal' : 'truncate')}>{label}</span>{rightIcon}<CodexCuIcon name="shared:K9" className={p('text-tertiary')} data-rtl-flip="" />
    </div>}
  </div>;
});

// app-shared hw/PFi. The layer adapter supplies the original p7/Radix placement
// lifecycle; this component owns the complete compound button and menu visuals.
export const CodexCuSplitButton = React.forwardRef(function CodexCuSplitButton({ children, onClick, autoFocus,
  color = 'primary', size = 'default', radius = 'default', separated = false, disabled = false,
  primaryDisabled = false, dropdownDisabled, loading = false, className, primaryClassName, dropdownButtonClassName,
  secondaryAriaLabel = 'Secondary action', secondaryIcon: SecondaryIcon, type, dropdownContent, renderDropdown,
  renderLayer, dropdownButtonRef, dropdownAlign = 'start', dropdownDir, dropdownSide = 'bottom',
  dropdownSurface = 'menu', dropdownContentMaxHeight, dropdownContentWidth, dropdownContentLayout = 'menu',
  dropdownContentClassName, primaryAriaLabel, formatMessage, dropdownOpen = false, onDropdownOpenChange,
  tooltipContent, tooltipSide, tooltipAlign, tooltipSideOffset, tooltipDelayOpen, primaryTooltipProps,
  secondaryTooltipContent, secondaryTooltipDisabled = false, secondaryTooltipProps, ...props }, ref) {
  const defaultRenderer = useCodexCuLayerRenderer(), localDropdownRef = useRef(null);
  const attachDropdown = useCallback(node => { localDropdownRef.current = node; if (typeof dropdownButtonRef === 'function') dropdownButtonRef(node); else if (dropdownButtonRef) dropdownButtonRef.current = node; }, [dropdownButtonRef]);
  const layerRenderer = renderLayer ?? defaultRenderer;
  const combinedDisabled = disabled || loading, primaryIsDisabled = combinedDisabled || primaryDisabled === true;
  const dropdownIsDisabled = dropdownDisabled ?? combinedDisabled, allDisabled = primaryIsDisabled && dropdownIsDisabled;
  const dimPrimaryContent = color === 'outline' && primaryIsDisabled && !dropdownIsDisabled;
  const primaryLabel = typeof primaryAriaLabel === 'string' ? primaryAriaLabel : primaryAriaLabel != null ? formatMessage?.(primaryAriaLabel) : undefined;
  const primary = <CodexCuButton autoFocus={autoFocus} color={color} size={size} radius={radius}
    disabled={primaryIsDisabled} focusRing="inset" loading={loading} aria-label={primaryLabel} type={type}
    className={join(p('rounded-e-none border-e-0', separated ? 'pe-3' : 'pe-1', separated && radius === 'full' && 'ps-4',
      color === 'outline' && primaryIsDisabled && 'disabled:opacity-100', dimPrimaryContent && 'disabled:[&>*]:opacity-40'), primaryClassName)}
    onClick={event => { if (primaryIsDisabled) return; if (onClick) { onClick(event); return; } onDropdownOpenChange?.(!dropdownOpen); }}>
    {dimPrimaryContent && ['string', 'number'].includes(typeof children) ? <span>{children}</span> : children}
  </CodexCuButton>;
  const markOpacity = color === 'outline' && dropdownIsDisabled && !primaryIsDisabled ? 'opacity-20' : 'opacity-50';
  const secondaryMark = SecondaryIcon ? <SecondaryIcon className={p('icon-2xs', markOpacity)} /> : ['toolbar', 'pageAction'].includes(size) ? <>
    <span className={p('_CompactSource_ym4jk_2')} aria-hidden="true"><CodexCuIcon name="shared:cpr" className={p(markOpacity)} /></span>
    <span className={p('_LeadingSource_ym4jk_6')} aria-hidden="true"><CodexCuIcon name="shared:lpr" className={p(markOpacity)} /></span>
  </> : <CodexCuIcon name="shared:_T" className={p('icon-2xs', markOpacity)} />;
  const secondary = <CodexCuButton ref={attachDropdown} aria-label={secondaryAriaLabel} color={color} size={size}
    radius={radius} disabled={dropdownIsDisabled} focusRing="inset" type="button"
    className={join(p('gap-0 rounded-s-none border-s-0', separated ? 'relative ps-2 pe-2 before:pointer-events-none before:absolute before:inset-y-2 before:start-0 before:w-px before:bg-current/25' : 'ps-0.5 pe-1.5',
      color === 'outline' && dropdownIsDisabled && 'disabled:opacity-100'), dropdownButtonClassName)}
    onMouseDown={event => event.preventDefault()}>{secondaryMark}</CodexCuButton>;
  const secondaryTrigger = secondaryTooltipContent == null || secondaryTooltipDisabled ? secondary : <CodexCuTooltip
    tooltipContent={secondaryTooltipContent} {...secondaryTooltipProps}><span className={p('inline-flex')}>{secondary}</span></CodexCuTooltip>;
  const primaryTrigger = tooltipContent == null ? primary : <CodexCuTooltip tooltipContent={tooltipContent}
    side={tooltipSide} {...primaryTooltipProps}><span className={p('inline-flex min-w-0')}>{primary}</span></CodexCuTooltip>;
  const content = dropdownContentLayout === 'menu' ? <div className={p('flex min-w-[160px] flex-col gap-0.5')}>{dropdownContent}</div> : dropdownContent;
  const menu = <CodexCuMenuSurface open={!dropdownIsDisabled && dropdownOpen} surface={dropdownSurface}
    side={dropdownSide} align={dropdownAlign} contentWidth={dropdownContentWidth} maxHeight={getCodexCuMenuMaxHeight(dropdownContentMaxHeight)}
    className={dropdownContentClassName} dir={dropdownDir}>{content}</CodexCuMenuSurface>;
  const changeOpen = next => { if (!dropdownIsDisabled) onDropdownOpenChange?.(next); };
  const dropdown = renderDropdown ? renderDropdown(secondaryTrigger) : layerRenderer({
    type: 'menu', open: !dropdownIsDisabled && dropdownOpen, onOpenChange: changeOpen,
    triggerButton: secondaryTrigger, triggerRef: localDropdownRef, content: menu,
    dir: dropdownDir, side: dropdownSide, align: dropdownAlign, sideOffset: 1, collisionPadding: 6,
    modal: false, surface: dropdownSurface, contentWidth: dropdownContentWidth,
    contentMaxHeight: dropdownContentMaxHeight, contentClassName: dropdownContentClassName,
  });
  return <div ref={ref} {...props} className={join(p('inline-flex self-start items-stretch overflow-hidden', radius === 'full' ? 'rounded-full' : buttonRadius[size], color === 'outline' && allDisabled && 'opacity-40'), className)}>
    {primaryTrigger}{dropdown}
  </div>;
});

const menuHeightPresets = { available: 'calc(100vh - 16px)', compact: '200px', list: '250px', tall: '350px', composerPlugins: 'var(--height-composer-plugins-menu, 250px)' };
export function getCodexCuMenuMaxHeight(value, availableHeight = 'var(--radix-dropdown-menu-content-available-height)') {
  if (value != null) return `min(${menuHeightPresets[value]}, ${availableHeight}, calc(100vh - 16px))`;
}
