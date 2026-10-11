import { CodexCuI18nProvider, useCodexCuPlainText } from './codex-cu-i18n.jsx';
const CODEX_PLAIN_DISPLAY_IDS = Object.freeze({
  "Use default": "settings.browserUse.sitePermissions.value.useDefault"
});
import React from 'react';
import { CodexCuMenuItem, CodexCuMenuSurface } from './codex-cu-primitives.jsx';
import { CodexCuSettingsDropdownTrigger, CodexCuSettingsRow } from './codex-cu-settings-primitives.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';

const p = (...values) => values.filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cwbp-${value}`).join(' ');

export const codexWorkBrowserPreferenceDefinition = Object.freeze({
  key: 'localBrowserUse', label: 'Local browser use', defaultLabel: 'Use default',
  offLabel: 'Off', onLabel: 'On', loadingLabel: 'Loading…', unavailableLabel: 'Unavailable',
});

/** Source panel.B is a plain menu, including null reset, with no selected check.
 * The caller owns saved preferences, open state, and the menu positioning layer.
 * renderMenuLayer may place the supplied surface in the caller's existing portal.
 */
export function CodexWorkBrowserPreference({
  value = null, disabled = false, isLoading = false, reducedMotion = false,
  menuOpen = false, onMenuOpenChange, onChange, menuStyle, renderMenuLayer,
  label = codexWorkBrowserPreferenceDefinition.label,
  defaultLabel = codexWorkBrowserPreferenceDefinition.defaultLabel,
  offLabel = codexWorkBrowserPreferenceDefinition.offLabel,
  onLabel = codexWorkBrowserPreferenceDefinition.onLabel,
  loadingLabel = codexWorkBrowserPreferenceDefinition.loadingLabel,
  unavailableLabel = codexWorkBrowserPreferenceDefinition.unavailableLabel,
  className,
formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const display = isLoading ? <span role="status">
    <span className={p('sr-only')}>{cuText(loadingLabel)}</span>
    <span aria-hidden="true" data-size="sm" data-reduced-motion={reducedMotion || undefined}
      className={p('_LoadingResultsShimmer_1a4hf_2 block w-24')} />
  </span> : value == null ? defaultLabel : value === false ? offLabel : value === true ? onLabel : unavailableLabel;
  const select = next => { if (!disabled) { onChange?.(next); onMenuOpenChange?.(false); } };
  const menu = <CodexCuMenuSurface open={menuOpen} align="end" role="menu" style={menuStyle}>
    <CodexCuMenuItem disabled={disabled} onSelect={() => select(null)}>{cuText(defaultLabel)}</CodexCuMenuItem>
    <CodexCuMenuItem disabled={disabled} onSelect={() => select(false)}>{cuText(offLabel)}</CodexCuMenuItem>
    <CodexCuMenuItem disabled={disabled} onSelect={() => select(true)}>{cuText(onLabel)}</CodexCuMenuItem>
  </CodexCuMenuSurface>;
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuScope className={className}>
    <CodexCuSettingsRow label={cuText(label)} control={triggerProps => <>
      <CodexCuSettingsDropdownTrigger {...triggerProps} aria-busy={isLoading || undefined}
        aria-haspopup="menu" open={menuOpen} data-state={menuOpen ? 'open' : 'closed'} disabled={disabled}
        onClick={() => { if (!disabled) onMenuOpenChange?.(!menuOpen); }}>{cuText(display)}</CodexCuSettingsDropdownTrigger>
      {cuText(renderMenuLayer ? renderMenuLayer(menu) : menu)}
    </>} />
  </CodexCuScope></CodexCuI18nProvider>;
}
