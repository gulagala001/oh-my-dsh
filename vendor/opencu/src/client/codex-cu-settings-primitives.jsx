import React, { useId, useRef } from 'react';
import { CodexCuButton, CodexCuSpinner } from './codex-cu-primitives.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import './codex-cu-tokens.css';
import './codex-cu-typography.css';
import './codex-cu-settings-primitives.css';

// Exact source class decisions, locally prefixed. See settings-primitives/manifest.json.
const p = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cus-${value}`).join(' ');
const join = (...values) => values.filter(Boolean).join(' ');
// Keep custom consumer classes and the corresponding isolated source utilities.
const extra = className => className ? join(className, p(className)) : undefined;

export function CodexCuSettingsLabel({ label, labelId, labelSizing = 'grow', labelWeight = 'medium',
  description, descriptionId, icon, variant, verticalAlignment = 'center', className }) {
  return <div className={join('codex-cu-settings-label', p('flex min-w-0 gap-3',
    verticalAlignment === 'start' ? 'items-start' : 'items-center', labelSizing === 'grow' && 'flex-1'), extra(className))}>
    {icon == null ? null : <span className={p('flex shrink-0')}>{icon}</span>}
    <div className={p('flex min-w-0 flex-1 flex-col gap-0.5')}>
      <div id={labelId} className={p('min-w-0 break-words text-default group-data-[density=compact]/settings:leading-4.5',
        variant === 'featured' && 'text-base', variant === 'recommendation' && 'text-[13px] leading-[18.571429px]',
        variant !== 'featured' && variant !== 'recommendation' && 'text-sm', variant !== 'nested' && labelWeight === 'medium' && 'font-medium')}>{label}</div>
      {description ? <div id={descriptionId} className={p('min-w-0 text-xs leading-4 text-wrap break-words text-secondary')}>{description}</div> : null}
    </div>
  </div>;
}

export function CodexCuSettingsRow({ label, labelSizing = 'grow', labelWeight = 'medium', layout = 'default',
  description, control, controlSizing = 'minimum', icon, className, id, inset = true, size = 'default',
  variant = 'default', verticalAlignment = 'center', ...props }) {
  const generatedId = useId();
  const renderControl = typeof control === 'function';
  const labelId = renderControl && label != null ? `${generatedId}-label` : undefined;
  const descriptionId = renderControl && description ? `${generatedId}-description` : undefined;
  const classes = p('@container/settings-row', inset && (layout !== 'split' || variant !== 'default') && 'px-4',
    inset && variant === 'nested' && 'group-data-[density=form]/settings:px-5',
    variant === 'stacked' && 'flex flex-col items-stretch gap-1 py-3 group-data-[density=compact]/settings:gap-0.5 group-data-[density=compact]/settings:py-2.5 group-data-[density=compact]/settings:first:pt-3.5 group-data-[density=compact]/settings:last:pb-4',
    variant === 'nested' && 'flex min-h-10 justify-between gap-3 py-2 max-sm:min-h-0 max-sm:flex-col max-sm:items-stretch group-data-[density=form]/settings:min-h-12 sm:group-data-[density=form]/settings:py-0',
    variant !== 'stacked' && (verticalAlignment === 'start' ? 'items-start' : 'items-center'),
    layout === 'split' && variant === 'default' && 'grid grid-cols-1 gap-2 px-0 py-4 sm:grid-cols-3',
    layout === 'default' && ['default', 'featured', 'recommendation'].includes(variant) && ['flex justify-between',
      variant === 'featured' && ['gap-6', size === 'compact' ? 'min-h-11 py-2' : 'py-4'],
      variant !== 'featured' && (size === 'compact' ? 'gap-4 py-2' : 'gap-6 py-3')],
    variant === 'recommendation' && 'dark:bg-primary-ghost-hover');
  const controlClasses = p(variant === 'stacked' && 'w-full',
    variant === 'nested' && 'flex min-w-0 flex-1 items-center justify-end max-sm:justify-stretch',
    layout === 'split' && variant === 'default' && ['flex min-w-0 max-w-full items-center justify-end gap-2 sm:col-span-2', controlSizing === 'grow' && 'w-full'],
    layout === 'default' && ['default', 'featured', 'recommendation'].includes(variant) && ['flex max-w-full items-center justify-end gap-2',
      controlSizing === 'grow' ? 'min-w-0 flex-1' : 'shrink-0', controlSizing === 'minimum' && 'min-w-[min(--spacing(40),40cqw)] empty:min-w-0']);
  return <div {...props} id={id} className={join('codex-cu-settings-row', classes, extra(className))}>
    {label != null || description != null || icon != null ? <CodexCuSettingsLabel label={label} labelId={labelId}
      labelSizing={labelSizing} labelWeight={labelWeight} description={description} descriptionId={descriptionId}
      icon={icon} variant={variant} verticalAlignment={verticalAlignment} /> : null}
    <div className={controlClasses}>{renderControl ? control({ 'aria-labelledby': labelId, 'aria-describedby': descriptionId }) : control}</div>
  </div>;
}

export const CodexCuSettingsActionRow = React.forwardRef(function CodexCuSettingsActionRow({
  actions, ariaLabel, className, description, disabled = false, edgeRounding = 'row', icon, label,
  onClick, onFocus, onPointerEnter, trailing, variant = 'default', ...props
}, ref) {
  return <div className={join('codex-cu-settings-action-row', p('group flex w-full items-center',
    edgeRounding === 'row' && 'first:rounded-t-2xl last:rounded-b-2xl', variant === 'recommendation' && 'dark:bg-primary-ghost-hover',
    !disabled && 'hover:bg-primary-ghost-hover focus-within:bg-primary-ghost-hover',
    !disabled && variant === 'recommendation' && 'dark:hover:bg-background-secondary-soft-alpha dark:focus-within:bg-background-secondary-soft-alpha'))}>
    <button {...props} ref={ref} type="button" aria-label={ariaLabel} disabled={disabled}
      onClick={onClick} onFocus={onFocus} onPointerEnter={onPointerEnter}
      className={join(p('flex min-w-0 flex-1 cursor-interaction items-center rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:cursor-default disabled:opacity-60',
        variant === 'empty' ? 'flex-col justify-center gap-4 px-6 py-10 text-center text-base text-tertiary select-none' :
          ['px-4 text-start', variant === 'nested' ? 'min-h-10 gap-3 py-0.5' : 'gap-6 py-3']), extra(className))}>
      {variant === 'empty' ? <>{icon}{label}</> : <CodexCuSettingsLabel label={label} description={description} icon={icon} variant={variant} />}
      {trailing == null ? null : <div className={p('flex shrink-0 items-center gap-2')}>{trailing}</div>}
    </button>
    {!disabled && actions != null ? <div className={p('flex shrink-0 items-center gap-1 pe-4')}>{actions}</div> : null}
  </div>;
});

const groupDividers = 'flex flex-col [&>*:not(:last-child)]:relative [&>*:not(:last-child)]:after:pointer-events-none [&>*:not(:last-child)]:after:absolute [&>*:not(:last-child)]:after:inset-x-4 [&>*:not(:last-child)]:after:bottom-0 [&>*:not(:last-child)]:after:h-px [&>*:not(:last-child)]:after:bg-border [&>*:not(:last-child)]:after:content-[\'\']';
const groupFlatDividers = 'flex flex-col [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-border';
export function CodexCuSettingsGroup({ children, className, contentOverflow = 'hidden', dividers = true,
  variant = 'default', decoration, style, ...props }) {
  return <div {...props} className={join('codex-cu-settings-group', p(dividers ? variant === 'flat' ? groupFlatDividers : groupDividers : 'flex flex-col',
    variant === 'recommendation' && 'rounded-[20px]', !['recommendation', 'flat'].includes(variant) && 'rounded-2xl',
    decoration === 'daybreak' && '_daybreak_vyuj8_1', contentOverflow === 'visible' ? 'overflow-visible' : 'overflow-hidden',
    variant === 'default' && 'border border-default group-data-[density=compact]/settings:border-0 group-data-[density=compact]/settings:ring-1 group-data-[density=compact]/settings:ring-inset group-data-[density=compact]/settings:ring-border',
    variant === 'metered' && 'ring-1 ring-inset ring-border-subtle', variant === 'secondary' && 'bg-surface-secondary/92',
    variant === 'muted' && 'bg-(--color-background-primary-soft-alpha)/50 dark:bg-primary-soft-alpha',
    variant === 'form' && 'border border-subtle bg-surface dark:bg-surface-secondary/92 group-data-[density=form]/settings:border-default group-data-[density=form]/settings:bg-transparent dark:group-data-[density=form]/settings:bg-transparent group-data-[density=form]/settings:[&>*:not(:last-child)]:after:inset-x-5 group-data-[density=form]/settings:[&>*:not(:last-child)]:after:h-px group-data-[density=form]/settings:[&>*:not(:last-child)]:after:bg-border-subtle',
    variant === 'outlined' && 'border border-subtle bg-transparent',
    variant === 'flat' && 'relative bg-transparent before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-border before:content-[\'\'] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:content-[\'\']',
    variant === 'input' && 'border border-primary-outline bg-primary-soft', variant === 'recommendation' && 'border border-default bg-secondary-soft dark:bg-transparent'), extra(className))}
    style={{ ...(variant === 'default' || variant === 'metered' ? { backgroundColor: 'var(--color-background-panel, var(--color-background-primary-soft-alpha))' } : null), ...style }}>{children}</div>;
}

export function CodexCuSettingsSectionHeader({ title, subtitle, actions, actionsAlignment, className,
  size = 'default', titleGap = 'default', spacing = 'default', subtitlePlacement = 'below-title', subtitleWrap = 'balance' }) {
  if (title == null && subtitle == null && actions == null) return null;
  const compact = size === 'compact';
  const description = subtitle ? <div className={p('font-normal text-secondary group-data-[density=compact]/settings:text-wrap',
    subtitleWrap === 'balance' ? 'text-balance' : 'text-wrap', compact ? 'text-xs leading-4' : 'text-sm leading-[18px]',
    subtitlePlacement === 'below-header' && 'w-full')}>{subtitle}</div> : null;
  return <div className={join('codex-cu-settings-section-header', p('flex justify-between group-data-[density=compact]/settings:min-h-0 group-data-[density=compact]/settings:pb-3',
    subtitlePlacement === 'below-header' ? 'flex-wrap gap-x-4 gap-y-0.5' : 'gap-4',
    subtitle != null && (spacing === 'compact' ? 'pb-2' : 'pb-3'),
    subtitle == null && ['items-center pb-1.5', spacing === 'compact' ? 'min-h-8' : 'min-h-toolbar'],
    subtitle != null && (compact ? 'items-center' : 'items-start')), extra(className))}>
    <div className={p('flex min-w-0 flex-1 flex-col', titleGap === 'none' ? 'gap-0' : 'gap-0.5 group-data-[density=compact]/settings:gap-0.75')}>
      {title ? <div className={p('font-medium text-default group-data-[density=compact]/settings:text-lg group-data-[density=compact]/settings:leading-5',
        size === 'compact' && 'text-sm leading-[18px]', (size === 'large' || size === 'default' && subtitle != null) && 'text-lg',
        (size === 'base' || size === 'default' && subtitle == null) && 'text-base')}>{title}</div> : null}
      {subtitlePlacement === 'below-title' ? description : null}
    </div>
    {actions ? <div className={p('flex items-center gap-2', actionsAlignment === 'end' && 'self-end')}>{actions}</div> : null}
    {subtitlePlacement === 'below-header' ? description : null}
  </div>;
}

export function CodexCuSettingsSectionContent({ children, className, ...props }) {
  return <div {...props} className={join('codex-cu-settings-section-content', p('flex flex-col gap-1.5'), extra(className))}>{children}</div>;
}

export function CodexCuSettingsSectionFooter({ children, className, variant = 'description' }) {
  return <div className={join('codex-cu-settings-section-footer', p('text-balance text-secondary',
    variant === 'action' ? 'pt-4 text-sm leading-5' : 'px-4 pt-1.5 text-xs leading-4'), extra(className))}>{children}</div>;
}

export function CodexCuSettingsDisclosureRow({ children, content, contentId, expanded = false }) {
  return <div className={join('codex-cu-settings-disclosure-row', p(groupDividers))}>
    {children}{expanded ? <div id={contentId} className={p(groupDividers)}>{content}</div> : null}
  </div>;
}

export function CodexCuSettingsSection({ children, id, className, title, subtitle, actions, headerProps, ...props }) {
  return <section {...props} id={id} className={join('codex-cu-settings-section', p('flex flex-col'), extra(className))}>
    {title != null || subtitle != null || actions != null ? <CodexCuSettingsSectionHeader {...headerProps} title={title} subtitle={subtitle} actions={actions} /> : null}
    {children}
  </section>;
}

export function CodexCuSettingsPageHeading({ actions, asset, subtitle, subtitleClassName, title, variant = 'default' }) {
  return <header className={join('codex-cu-settings-page-heading', p('flex flex-col gap-4 px-[var(--detail-page-inline-inset,0px)]'))}>
    {asset == null ? null : <div className={p('flex')}>{asset}</div>}
    <div className={p('flex min-w-0 items-start justify-between gap-4', variant === 'page' ? 'flex-nowrap' : 'flex-wrap')}>
      <div className={p('flex min-w-0 flex-1 basis-64 flex-col', variant === 'settingsCompact' ? 'gap-1.25' : 'gap-1.5')}>
        <h1 className={p('min-w-0 break-words text-default', variant === 'settings' && 'heading-lg font-normal',
          variant === 'settingsCompact' && 'heading-lg font-semibold leading-7', variant === 'page' && 'heading-lg electron:heading-xl',
          variant === 'default' && 'heading-base electron:heading-lg')}>{title}</h1>
        {subtitle == null ? null : <div className={join(p('text-base text-secondary'), extra(subtitleClassName))}>{subtitle}</div>}
      </div>
      {actions == null ? null : <div className={p('flex max-w-full shrink-0 items-center gap-2')}>{actions}</div>}
    </div>
  </header>;
}

export function CodexCuSettingsStickyControls({ children, className, fadeSize = 'default', showScrollFade = true, sticky = true }) {
  return <div className={join('codex-cu-settings-sticky-controls', p('bg-surface',
    sticky && 'sticky z-30 after:pointer-events-none after:absolute after:top-full after:right-0 after:left-0 after:bg-linear-to-b after:from-surface after:to-transparent after:content-[\'\']',
    sticky && (fadeSize === 'compact' ? 'after:h-2' : 'after:h-8'), sticky && !showScrollFade && 'after:hidden'), extra(className))}>{children}</div>;
}

const slateHeaderClasses = {
  shell: '_shell_bomwa_2', content: '_content_bomwa_2', headerRow: '_headerRow_bomwa_2', title: '_title_bomwa_2',
  titleContent: '_titleContent_bomwa_2', actions: '_actions_bomwa_2', search: '_search_bomwa_2', navigation: '_navigation_bomwa_2',
  toolbar: '_toolbar_bomwa_2', filterTags: '_filterTags_bomwa_2', filterTagsContent: '_filterTagsContent_bomwa_2',
  viewControls: '_viewControls_bomwa_2', pageActions: '_pageActions_bomwa_2',
};
// qMs uses QJa with sticky=false and showDivider=false; its resize/collapse behavior is inactive.
export function CodexCuSettingsSlateHeader({ title, subtitle, asset, actions, compact = false, fullWidth = false,
  titleBarLeftInset = 0, subtitleClassName }) {
  return <div className={join('codex-cu-settings-slate-header', p(slateHeaderClasses.shell, 'border-transparent'))}
    style={{ '--app-shell-titlebar-left-inset': `${titleBarLeftInset}px` }}>
    <div className={p(slateHeaderClasses.content, 'mx-auto w-full px-panel', !fullWidth && 'max-w-3xl')}>
      <div className={p(slateHeaderClasses.headerRow)}>
        <div className={p(slateHeaderClasses.title)}><div className={p(slateHeaderClasses.titleContent)}>
          {asset == null ? null : <div className={p('flex')}>{asset}</div>}
          <h1 className={p('text-default', compact ? 'heading-lg' : 'heading-xl')}>{title}</h1>
          {subtitle == null ? null : <div className={join(p('text-base leading-6 text-balance text-secondary'), extra(subtitleClassName))}>{subtitle}</div>}
        </div></div>
        <div className={p(slateHeaderClasses.actions)}>{actions == null ? null : <div className={p(slateHeaderClasses.toolbar)}>
          <div className={p(slateHeaderClasses.filterTags)}><div className={p(slateHeaderClasses.filterTagsContent)} /></div>
          <div className={p(slateHeaderClasses.viewControls)} />
          <div className={p(slateHeaderClasses.pageActions)}>{actions}</div>
        </div>}</div>
      </div>
      <div className={p(slateHeaderClasses.navigation)} />
    </div>
  </div>;
}

// qMs's target navigation, search highlighting and scroll reset remain host concerns.
export const CodexCuSettingsPage = React.forwardRef(function CodexCuSettingsPage({ title, asset, backSlot, subtitle,
  children, fullWidth = false, contentClassName, subtitleClassName, action, toolbarActions, stickyControls, footer,
  embedded = false, density = 'default', slateLayout = false, slateHeader, titleBarLeftInset, className, scrollResetKey, ...props }, ref) {
  const slate = slateLayout && !embedded;
  const toolbar = <>{backSlot}{toolbarActions == null ? null : <div className={p('ms-auto flex min-w-0 items-center justify-end gap-2 no-drag')}>{toolbarActions}</div>}</>;
  const content = <div data-density={density} className={join(p('group/settings mx-auto flex w-full flex-col',
    density === 'compact' && '[--settings-section-gap:--spacing(5.5)]',
    density === 'default' && (embedded && !fullWidth ? '[--settings-section-gap:var(--padding-panel)]' : '[--settings-section-gap:--spacing(10)]'),
    !fullWidth && (embedded ? 'max-w-2xl' : 'max-w-3xl electron:min-w-[min(100%,calc(320px*var(--codex-window-zoom)))]'),
    slate && ['px-panel pb-panel', stickyControls == null && 'pt-panel']), extra(contentClassName))}>
    {title == null || slate ? null : <div className={p(density === 'compact' ? 'pb-5.5' : embedded ? 'pb-panel' : 'pb-8')}>
      <CodexCuSettingsPageHeading actions={action} asset={asset} subtitle={subtitle}
        subtitleClassName={join('text-balance', subtitleClassName)} title={title}
        variant={density === 'compact' ? 'settingsCompact' : embedded ? 'default' : 'settings'} />
    </div>}
    {stickyControls == null ? null : <CodexCuSettingsStickyControls className="top-0 pt-panel pb-2">{stickyControls}</CodexCuSettingsStickyControls>}
    <div className={p('flex flex-col', embedded && !fullWidth ? 'gap-[var(--settings-section-gap,var(--padding-panel))]' : 'gap-[var(--settings-section-gap,--spacing(10))]',
      stickyControls != null && 'pt-5')}>{children}</div>
  </div>;
  if (embedded) return <div {...props} ref={ref} className={join('codex-cu-settings-page', p('flex min-h-0 flex-col'), extra(className))}>
    {backSlot != null || toolbarActions != null ? <div className={p('flex items-center pb-panel')}>{toolbar}</div> : null}{content}
  </div>;
  return <div {...props} ref={ref} className={join('codex-cu-settings-page', p('flex h-full min-h-0 flex-col electron:overflow-hidden electron:bg-surface windows:rounded-tl-lg'), extra(className))}>
    <div className={p('flex items-center px-panel draggable electron:h-toolbar extension:h-toolbar-sm')}>{toolbar}</div>
    <div className={p('flex-1 scrollbar-stable overflow-y-auto', !slate && 'p-panel')}>{slate && title != null ? slateHeader ??
      <CodexCuSettingsSlateHeader title={title} subtitle={subtitle} asset={asset} actions={action} compact={density === 'compact'}
        fullWidth={fullWidth} titleBarLeftInset={titleBarLeftInset} subtitleClassName={subtitleClassName} /> : null}{content}</div>
    {footer == null ? null : <div className={p('flex flex-wrap items-center justify-end gap-2 border-t border-primary-outline bg-surface px-panel py-3')}>{footer}</div>}
  </div>;
});

export function CodexCuSettingsEmpty({ className, align = 'center', children, layout = 'default', ...props }) {
  return <div {...props} className={join('codex-cu-settings-empty', p('flex items-center px-4 text-sm text-secondary',
    layout === 'settings-row' && 'min-h-[var(--height-token-settings-row)]', align === 'center' ? 'justify-center text-center' : 'justify-start text-start'), extra(className))}>{children}</div>;
}

export function CodexCuSettingsPanelLoading({ children = 'Loading settings…', className }) {
  return <div role="status" className={join('codex-cu-settings-panel-loading', p('flex items-center gap-2 py-2 text-sm text-secondary'), extra(className))}>
    <CodexCuSpinner className={p('icon-xs shrink-0 text-secondary')} /><span className={p('text-balance')}>{children}</span>
  </div>;
}

export const CodexCuSettingsDropdownTrigger = React.forwardRef(function CodexCuSettingsDropdownTrigger({
  children, className, contentClassName, chevronClassName, leadingVisual, color = 'outline', size = 'toolbar',
  width, open, style, ...props
}, ref) {
  return <CodexCuButton {...props} ref={ref} color={color} size={size} aria-expanded={open ?? props['aria-expanded']}
    className={join('codex-cu-settings-dropdown', p('max-w-full justify-between', size === 'toolbar' &&
      (leadingVisual == null ? 'px-3' : 'pe-3 ps-[calc((var(--spacing-token-button-composer)-var(--spacing)*5)/2-1px)]')), extra(className))}
    style={{ ...(width != null ? { width } : null), ...style }}>
    <span className={join(p('flex min-w-0 flex-1 items-center gap-1.5'), extra(contentClassName))}>{leadingVisual}{children}</span>
    <CodexCuIcon name="shared:_T" className={join(p('icon-2xs shrink-0 text-tertiary'), extra(chevronClassName))} />
  </CodexCuButton>;
});

export function CodexCuSettingsSearch({ id, inputRef, className, autoFocus, clearLabel = 'Clear search', disabled,
  inputKey, inputRole, isClearable = true, label, maxLength, onFocus, onKeyDown, onSearchQueryChange,
  placeholder, readOnly, searchQuery = '', trailingControl, variant = 'default', leadingVisual }) {
  const localRef = useRef(null);
  const ref = inputRef ?? localRef;
  const toolbar = ['toolbar', 'toolbar-action', 'toolbar-compact'].includes(variant);
  const knownSearchIcon = ['default', 'settings', 'catalog', 'catalog-filter'].includes(variant);
  return <div data-sidebar-header-search={variant === 'sidebar-header' || undefined}
    className={join('codex-cu-settings-search', p('no-drag flex items-center py-0 text-base leading-[18px]',
      ['default', 'settings'].includes(variant) && 'h-page-search gap-2 border border-primary-outline bg-page-search px-2.5',
      variant === 'default' && 'rounded-full', variant === 'settings' && 'rounded-button-toolbar',
      toolbar && 'gap-2 rounded-full border border-primary-outline bg-transparent px-3 text-sm leading-5',
      variant === 'toolbar' && 'h-9', variant === 'toolbar-action' && 'h-token-button-composer',
      variant === 'toolbar-compact' && 'h-8 browser:h-9',
      variant === 'sidebar' && 'sidebar-item h-[var(--height-token-row)] bg-background-secondary-soft-alpha pe-[var(--padding-row-cell-x,var(--padding-row-x))]',
      variant === 'sidebar-header' && 'h-9 shrink-0 gap-2 rounded-full bg-background-secondary-soft-alpha px-3',
      variant === 'catalog' && 'h-14 gap-3 rounded-xl border border-primary-outline bg-surface px-5',
      variant === 'catalog-filter' && 'h-12 gap-3 rounded-xl border border-primary-outline bg-surface-secondary px-4'), extra(className))}>
    <span className={p('flex shrink-0 items-center justify-center')}>{leadingVisual ?? (knownSearchIcon ?
      <CodexCuIcon name="shared:gE" className={p('icon-sm text-secondary')} /> : null)}</span>
    <label className={p('sr-only')} htmlFor={id}>{label}</label>
    <input key={inputKey} autoFocus={autoFocus} id={id} ref={ref} autoComplete="off" disabled={disabled} maxLength={maxLength}
      readOnly={readOnly} role={inputRole} type="text" value={searchQuery} onChange={event => onSearchQueryChange?.(event.target.value)}
      onFocus={onFocus} onKeyDown={onKeyDown} placeholder={placeholder}
      className={p('min-w-0 flex-1 bg-transparent text-default outline-none select-text placeholder:text-tertiary [&::placeholder]:select-none',
        toolbar ? 'text-sm leading-5' : 'text-base leading-[18px]')} />
    {isClearable && searchQuery.length > 0 ? <button disabled={disabled} aria-label={clearLabel} type="button"
      className={p('flex shrink-0 cursor-interaction items-center justify-center text-secondary hover:text-default', variant === 'sidebar' && 'size-6')}
      onClick={() => { ref.current?.focus(); onSearchQueryChange?.(''); }}><CodexCuIcon name="shared:bot" /></button> : null}
    {trailingControl == null ? null : <div className={p('flex shrink-0 items-center')}>{trailingControl}</div>}
  </div>;
}

// The CU cloud settings import VV's default/callout horizontal branches. Other product variants
// (beacon, announcement, recovery, privacy notices) are outside this settings API.
export function CodexCuSettingsCallout({ title, content, customCtas, density = 'default', onPrimaryCtaClick,
  primaryCtaText, primaryCtaColor = 'outline', secondaryCtaColor = 'ghost', onSecondaryCtaClick, onDangerCtaClick,
  secondaryCtaText, dangerCtaText, icon, Icon, iconClassName, isPrimaryCtaDisabled = false,
  isSecondaryCtaDisabled = false, isDangerCtaDisabled = false, type = 'normal', variant = 'default', ariaLive, role, trailingAction,
  attachedToComposer = false, className }) {
  const callout = variant === 'callout';
  const border = { caution: 'border-default text-default', error: 'border-text-danger/20 text-danger',
    infoAccent: 'border-text-info/40 text-default', normal: callout ? 'text-default border-strong' : 'text-default border-primary-outline',
    success: 'border-chart-green/30 text-chart-green', warning: 'border-text-warning/30 text-default' }[type];
  const backdrop = { caution: 'bg-background-caution-solid/15', error: 'bg-background-danger-surface/20',
    infoAccent: 'bg-primary-soft', normal: callout ? 'bg-callout-surface' : attachedToComposer ? 'bg-surface-tertiary' : 'bg-transparent',
    success: 'bg-chart-green/15', warning: 'bg-background-warning-surface/30' }[type];
  const tone = type === 'error' ? 'text-danger' : type === 'success' ? 'text-chart-green' : callout || attachedToComposer ? 'text-secondary' : 'text-codex-description';
  const iconNode = icon ?? (Icon ? <Icon className={join(p(!callout && 'icon-sm shrink-0', type === 'infoAccent' && 'text-info',
    type === 'success' && 'text-chart-green', type === 'warning' && 'text-warning'), extra(iconClassName))} /> : null);
  const ctas = customCtas || primaryCtaText || secondaryCtaText || dangerCtaText ? <div className={p('flex gap-2 shrink-0',
    attachedToComposer ? 'mt-0 min-w-fit' : 'mt-2 min-w-fit @min-[560px]:mt-0')}>
    {customCtas ? customCtas : <>
      {primaryCtaText ? <CodexCuButton onClick={onPrimaryCtaClick} color={primaryCtaColor} className={p('shrink-0')} disabled={isPrimaryCtaDisabled}>{primaryCtaText}</CodexCuButton> : null}
      {secondaryCtaText ? <CodexCuButton onClick={onSecondaryCtaClick} color={secondaryCtaColor} className={p('shrink-0')} disabled={isSecondaryCtaDisabled}>{secondaryCtaText}</CodexCuButton> : null}
      {dangerCtaText ? <CodexCuButton onClick={onDangerCtaClick} color="danger" className={p('shrink-0')} disabled={isDangerCtaDisabled}>{dangerCtaText}</CodexCuButton> : null}
    </>}
  </div> : null;
  return <aside aria-live={ariaLive} role={role} className={join('codex-cu-settings-callout', p('relative isolate flex w-full overflow-hidden bg-surface border text-pretty text-sm',
    callout ? 'rounded-md px-4 py-3' : ['shadow-[0_0_2px_0_rgb(0_0_0/5%),0_4px_6px_0_rgb(0_0_0/2%)] lg:mx-auto',
    attachedToComposer ? '-mb-9 rounded-t-[32px] rounded-b-none border-b-0 ps-4 pe-2.5 pt-2.5 pb-9 electron:border electron:border-b-0' :
      ['rounded-3xl electron:border-0 electron:ring-[0.5px] electron:ring-border-strong', density === 'compact' ? 'py-2 ps-3 pe-2' : 'py-4 ps-5 pe-3'],
    ],
    border, '@container items-start gap-4'), extra(className))}>
    <div aria-hidden="true" className={p('absolute inset-0 -z-10', backdrop)} />
    <div className={p('flex h-full w-full gap-3 items-start @min-[560px]:items-center')}>
      {iconNode == null ? null : <div className={p('flex items-start pt-0.5')}>{iconNode}</div>}
      <div className={p('flex min-w-0 grow flex-col', attachedToComposer ?
        '@min-[400px]:flex-row @min-[400px]:items-start @min-[400px]:justify-between @min-[400px]:gap-3' :
        '@min-[560px]:flex-row @min-[560px]:items-center @min-[560px]:justify-between @min-[560px]:gap-8')}>
        <div className={p('flex min-w-0 flex-col flex-1')}>
          {title ? <h3 className={p(callout ? 'text-sm font-medium' : 'text-sm font-bold')}>{title}</h3> : null}
          <div className={p('flex min-w-0 flex-1 flex-col')}><div className={p('min-w-0 flex-1', !callout && 'electron:leading-relaxed text-pretty',
            (title || attachedToComposer) && tone)}>{content}</div></div>
        </div>{ctas}
      </div>
    </div>
    {trailingAction ? <div className={p('flex shrink-0 items-start @min-[560px]:self-center')}>{trailingAction}</div> : null}
  </aside>;
}

const inputBase = 'min-w-0 border text-default outline-none placeholder:text-tertiary aria-invalid:border-text-danger aria-invalid:ring-2 aria-invalid:ring-text-danger/20 disabled:cursor-not-allowed disabled:text-secondary';
const inputForcedFocus = 'forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText] forced-colors:focus:forced-color-adjust-none forced-colors:focus:placeholder:text-[HighlightText]';
const inputGhost = 'border-transparent enabled:hover:bg-primary-ghost-hover focus:bg-primary-ghost-hover';
const inputVariants = {
  amount: 'h-10 rounded-lg bg-surface px-3 text-sm font-normal tabular-nums',
  auth: 'h-14 rounded-full bg-transparent px-5 text-base focus:ring-1 focus:ring-ring',
  code: 'h-9 rounded-md bg-primary-soft px-2.5 font-mono text-sm',
  compact: 'h-7 rounded-md bg-primary-soft px-2 text-sm',
  plain: 'h-7 rounded-md border-transparent bg-transparent p-0 text-sm',
  default: 'h-9 rounded-md bg-primary-soft px-2.5 text-sm',
  field: 'h-8 rounded-lg bg-primary-soft px-2 text-sm focus-within:bg-primary-ghost-hover forced-colors:focus-within:outline-2 forced-colors:focus-within:outline-solid',
  form: 'h-12 rounded-2xl border-default bg-transparent px-5 text-form-body font-normal',
  grouped: 'h-10 rounded-[inherit] border-transparent bg-transparent px-3 text-sm',
  ghost: 'h-token-button-composer rounded-md bg-transparent px-2 text-sm',
  heading: 'h-9 rounded-sm bg-surface px-2 text-lg font-medium',
  display: 'heading-3xl h-14 rounded-sm border-transparent bg-transparent px-2 text-center font-semibold focus:ring-1 focus:ring-ring',
  settings: 'rounded-2xl border-default bg-transparent px-4 py-2 text-base',
  inline: 'h-11 rounded-xl bg-surface px-3 py-2 text-heading-lg leading-7 font-medium',
  rounded: 'h-12 rounded-2xl bg-surface px-4 text-base dark:bg-surface-secondary/92',
  segmented: 'h-10 overflow-hidden rounded-xl bg-primary-soft text-sm',
  tags: 'min-h-9 max-h-40 overflow-y-auto rounded-md bg-primary-soft px-2 py-1 text-sm',
  transparent: 'h-token-button-composer rounded-md border-transparent bg-transparent px-2 text-sm focus:ring-1 focus:ring-ring',
};

export const CodexCuSettingsInput = React.forwardRef(function CodexCuSettingsInput({ autoSize = false, id, type,
  leadingControl, valueSuffix, trailingInlineControl, trailingControl, variant = 'default', focusRing,
  className, wrapperClassName, value, onChange, onValueChange, disabled = false, ...props }, ref) {
  const ring = focusRing ?? variant !== 'field';
  const grouped = leadingControl != null || valueSuffix != null || trailingInlineControl != null || trailingControl != null;
  const base = p(inputBase, autoSize ? 'field-sizing-content max-w-full' : 'w-full', inputVariants[variant],
    variant === 'ghost' && inputGhost, ring && variant === 'form' && !grouped && ['focus:bg-primary-ghost-hover', inputForcedFocus],
    ring && (variant === 'plain' ? 'focus-visible:ring-1 focus-visible:ring-ring' : variant !== 'ghost' && 'focus:border-ring'),
    !['ghost', 'plain', 'transparent', 'grouped'].includes(variant) && 'disabled:bg-text/5', variant === 'rounded' && 'border-subtle',
    !['ghost', 'plain', 'rounded', 'field', 'form', 'settings', 'segmented', 'grouped', 'transparent', 'display'].includes(variant) && 'border-primary-outline',
    variant === 'field' && (disabled ? 'border-transparent' : 'border-default'), variant === 'segmented' && 'border-default',
    variant === 'segmented' && (leadingControl == null ? 'ps-3' : 'ps-0'), variant === 'segmented' && (trailingControl == null ? 'pe-3' : 'pe-0'),
    variant === 'field' && trailingControl != null && 'overflow-hidden pe-0', ['compact', 'field'].includes(variant) && type === 'number' && 'tabular-nums');
  const input = <input {...props} id={id} ref={ref} type={type} value={value} disabled={disabled}
    onChange={event => { onChange?.(event); onValueChange?.(event.target.value); }}
    className={join('codex-cu-settings-input', variant === 'field' && type === 'number' && p('_numberField_1jhuu_11'),
      grouped ? p('min-w-0 bg-transparent outline-none placeholder:text-tertiary focus:!outline-none disabled:cursor-not-allowed disabled:text-secondary',
        valueSuffix == null ? 'flex-1' : 'field-sizing-content flex-initial', variant === 'tags' ? 'h-6 basis-32' : 'h-full',
        variant === 'segmented' && 'placeholder:text-codex-description', ring && variant === 'form' && inputForcedFocus) :
        join(base, p(variant === 'segmented' && 'focus:!outline-none')), extra(className))} />;
  if (!grouped) return input;
  return <div aria-invalid={props['aria-invalid']} className={join('codex-cu-settings-input-wrapper', base,
    p('flex items-center', ring && 'focus-within:border-ring', variant === 'form' ? ring && 'focus-within:bg-primary-ghost-hover' :
      'forced-colors:focus-within:outline-2 forced-colors:focus-within:outline-solid', variant === 'tags' ? 'flex-wrap gap-1' : 'gap-2',
      variant === 'auth' && 'focus-within:ring-1 focus-within:ring-ring', disabled && variant !== 'grouped' && 'bg-text/5'), extra(wrapperClassName))}>
    {leadingControl}{valueSuffix == null ? input : <label className={p('flex h-full min-w-0 flex-1 cursor-text items-center gap-0.5')}>{input}{valueSuffix}</label>}
    {trailingInlineControl}{['segmented', 'field'].includes(variant) && trailingControl != null ?
      <div className={p('flex h-full shrink-0 items-center', variant === 'segmented' && 'border-s border-default')}>{trailingControl}</div> : trailingControl}
  </div>;
});

const checkboxVariants = {
  default: 'icon-2xs rounded-xs data-[state=checked]:bg-primary-soft data-[state=indeterminate]:bg-primary-soft',
  accent: 'icon-2xs rounded-xs data-[state=checked]:bg-info-solid data-[state=indeterminate]:bg-info-solid data-[state=checked]:border-transparent data-[state=indeterminate]:border-transparent data-[state=checked]:text-control-thumb-on-accent data-[state=indeterminate]:text-control-thumb-on-accent disabled:opacity-50',
  secondary: 'rounded-xs flex size-4 items-center justify-center text-tertiary data-[state=indeterminate]:text-default',
  overlay: 'size-5 rounded-full bg-surface disabled:bg-surface-secondary',
  choice: 'size-5 rounded-xs border-default bg-surface data-[state=checked]:border-transparent data-[state=checked]:bg-primary-solid data-[state=checked]:text-primary-solid data-[state=indeterminate]:border-transparent data-[state=indeterminate]:bg-primary-solid data-[state=indeterminate]:text-primary-solid',
  task: 'grid size-6 place-items-center rounded-full data-[state=checked]:bg-primary-solid data-[state=checked]:text-primary-solid data-[state=indeterminate]:bg-primary-solid data-[state=indeterminate]:text-primary-solid disabled:opacity-50',
  checklist: 'relative grid size-5 place-items-center rounded-xs text-tertiary',
};
// Special source indicators can be supplied for secondary/choice/checklist variants.
export const CodexCuSettingsCheckbox = React.forwardRef(function CodexCuSettingsCheckbox({ checked = false,
  onCheckedChange, disabled = false, variant = 'default', className, indicator, uncheckedIndicator, outline,
  onClick, onKeyDown, required, ...props }, ref) {
  const state = checked === 'indeterminate' ? 'indeterminate' : checked ? 'checked' : 'unchecked';
  const special = variant === 'secondary' || variant === 'checklist';
  const opacity = p('opacity-75', !disabled && 'group-hover:opacity-100 group-focus-visible:opacity-100');
  return <button {...props} ref={ref} type="button" role="checkbox" aria-checked={checked === 'indeterminate' ? 'mixed' : !!checked}
    aria-required={required} data-state={state} data-disabled={disabled ? '' : undefined} disabled={disabled}
    onKeyDown={event => { onKeyDown?.(event); if (!event.defaultPrevented && event.key === 'Enter') event.preventDefault(); }}
    className={join('codex-cu-settings-checkbox', p('group peer shrink-0 outline-none',
      variant === 'checklist' ? '_checklist_1crq2_2' : 'transition-[background-color,border-color,box-shadow]', checkboxVariants[variant],
      !special && (variant === 'choice' ? 'border' : 'border border-strong shadow-sm'),
      !special && !['accent', 'choice', 'task'].includes(variant) && 'data-[state=checked]:text-default data-[state=indeterminate]:text-default',
      variant !== 'choice' && 'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
      'aria-invalid:ring-2 aria-invalid:ring-text-danger/20 aria-invalid:border-text-danger disabled:cursor-not-allowed',
      !disabled && !special && variant === 'task' && 'data-[state=unchecked]:hover:bg-surface-tertiary',
      !disabled && !special && !['task', 'choice'].includes(variant) && (variant === 'accent' ?
        'data-[state=unchecked]:hover:bg-surface-tertiary data-[state=checked]:hover:bg-info-solid/90 data-[state=indeterminate]:hover:bg-info-solid/90' : 'hover:bg-surface-tertiary')), extra(className))}
    onClick={event => { onClick?.(event); if (!event.defaultPrevented && !disabled) onCheckedChange?.(checked === 'indeterminate' ? true : !checked); }}>
    {variant === 'checklist' ? <span className={join(opacity, p('group-data-[state=checked]:opacity-100 group-data-[state=indeterminate]:opacity-100 _outline_1crq2_2'))}>{outline}</span> : null}
    {variant === 'secondary' ? <span className={join(p('hidden group-data-[state=unchecked]:block'), opacity)}>{uncheckedIndicator}</span> : null}
    {state !== 'unchecked' || variant === 'checklist' ? <span data-state={state} data-disabled={disabled ? '' : undefined}
      style={{ pointerEvents: 'none' }} className={join(p(variant === 'checklist' ?
      'absolute inset-0 grid place-items-center _indicator_1crq2_2' : 'flex h-full w-full items-center justify-center text-current'), variant === 'secondary' && opacity)}>
      {indicator ?? (!special && variant !== 'choice' ? <CodexCuIcon name={checked === 'indeterminate' ? 'checkbox-indeterminate' : 'menu-check'}
        className={p(checked === 'indeterminate' ? 'icon-2xs flex-shrink-0' : 'icon-xxs flex-shrink-0')} /> : null)}
    </span> : null}
  </button>;
});

// Known source overrides used by CU and browser settings consumers.
const sourceOverrides = 'w-max max-w-full flex-none w-34 w-full justify-between gap-3 py-0 ps-0 pe-0 flex-wrap min-w-0';
void sourceOverrides;
