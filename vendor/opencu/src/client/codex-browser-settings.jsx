import { CodexCuI18nProvider, useCodexCuPlainText } from './codex-cu-i18n.jsx';
const CODEX_PLAIN_DISPLAY_IDS = Object.freeze({
  "Always include": "settings.browserUse.browser.annotationScreenshots.always.label",
  "Only on drag selection": "settings.browserUse.browser.annotationScreenshots.necessary.label",
  "Site data": "settings.browserUse.browser.siteData.label",
  "Delete cookies": "settings.browserUse.browser.clearCookies",
  "Delete site data": "settings.browserUse.browser.clearSiteData",
  "Delete cached images and files": "settings.browserUse.browser.clearCache",
  "Delete download history": "settings.browserUse.browser.clearDownloads",
  "Delete browsing history": "settings.browserUse.browser.clearHistory",
  "Browsing data": "settings.browserUse.browser.clearBrowsingData.label",
  "Clear browsing history, site data, cache, and download history from the in-app browser": "settings.browserUse.browser.clearBrowsingData.description",
  "Clear all browsing data": "settings.browserUse.browser.clearBrowsingData",
  "Hide individual browsing data options": "settings.browserUse.browser.hideClearOptions",
  "General": "settings.browserUse.general.title",
  "Import…": "settings.browserUse.profileImport.open",
  "Web URL and link open destination": "settings.general.openLinkInTargetPreference.label",
  "Local URL open destination": "settings.browserUse.localUrlOpenTarget.label",
  "Where local development sites open by default": "settings.browserUse.localUrlOpenTarget.description",
  "Show full URL": "settings.browserUse.showFullUrl.label",
  "Include the path, query, and fragment in the address bar": "settings.browserUse.showFullUrl.description",
  "View and manage pages visited in the built-in browser": "settings.browserUse.history.description",
  "Annotation screenshots": "settings.browserUse.browser.annotationScreenshots.label",
  "Screenshots help ChatGPT better understand and address comments, but increase plan usage": "settings.browserUse.browser.annotationScreenshots.description",
  "Autofill and passwords": "settings.browserUse.autofillAndPasswords.title",
  "Add, delete, and edit saved passwords": "settings.browserUse.passwordManager.description",
  "Add, delete, and edit saved addresses, phone numbers, and email addresses": "settings.browserUse.contactInfo.description",
  "System Downloads folder": "settings.browserUse.downloads.location.system",
  "Change": "settings.browserUse.downloads.location.change",
  "Ask where to save downloads": "settings.browserUse.downloads.prompt.label",
  "Show a save dialog for downloads you start in the built-in browser": "settings.browserUse.downloads.prompt.description",
  "View and manage files downloaded from the built-in browser": "settings.browserUse.downloads.history.description",
  "Manage download history": "settings.browserUse.downloads.history.manageAriaLabel",
  "Control camera and microphone permissions in the built-in browser": "settings.browserUse.siteSettings.description",
  "Last hour": "settings.browserUse.clearBrowsingData.lastHour",
  "Last 24 hours": "settings.browserUse.clearBrowsingData.lastDay",
  "Last 7 days": "settings.browserUse.clearBrowsingData.lastWeek",
  "Last 4 weeks": "settings.browserUse.clearBrowsingData.lastMonth",
  "All time": "settings.browserUse.clearBrowsingData.allTime",
  "Cookies and site data": "settings.browserUse.clearBrowsingData.siteData",
  "Autofill form data": "settings.browserUse.clearBrowsingData.formData",
  "Delete data": "settings.browserUse.clearBrowsingData.confirm",
  "Contact info settings": "settings.browserUse.contactInfo.webviewLabel",
  "Password manager settings": "settings.browserUse.passwordManager.webviewLabel",
  "Intrusive ads": "settings.browserUse.browserSettings.breadcrumb.siteSettings.ads",
  "Automatic downloads": "settings.browserUse.browserSettings.breadcrumb.siteSettings.automaticDownloads",
  "Background sync": "settings.browserUse.browserSettings.breadcrumb.siteSettings.backgroundSync",
  "Camera": "settings.browserUse.browserSettings.breadcrumb.siteSettings.camera",
  "Clipboard": "settings.browserUse.browserSettings.breadcrumb.siteSettings.clipboard",
  "Third-party cookies": "settings.browserUse.browserSettings.breadcrumb.siteSettings.cookies",
  "Embedded content": "settings.browserUse.browserSettings.breadcrumb.siteSettings.embeddedContent",
  "Images": "settings.browserUse.browserSettings.breadcrumb.siteSettings.images",
  "JavaScript": "settings.browserUse.browserSettings.breadcrumb.siteSettings.javascript",
  "Microphone": "settings.browserUse.browserSettings.breadcrumb.siteSettings.microphone",
  "Notifications": "settings.browserUse.browserSettings.breadcrumb.siteSettings.notifications",
  "Pop-ups and redirects": "settings.browserUse.browserSettings.breadcrumb.siteSettings.popups",
  "Protocol handlers": "settings.browserUse.browserSettings.breadcrumb.siteSettings.handlers",
  "Protected content IDs": "settings.browserUse.browserSettings.breadcrumb.siteSettings.protectedContent",
  "Sound": "settings.browserUse.browserSettings.breadcrumb.siteSettings.sound",
  "USB devices": "settings.browserUse.browserSettings.breadcrumb.siteSettings.usbDevices"
});
import React from 'react';
import { CodexCuButton, CodexCuMenuSurface, CodexCuMenuItem, CodexCuToggle, CodexCuTooltip } from './codex-cu-primitives.jsx';
import { CodexCuSettingsRow, CodexCuSettingsGroup, CodexCuSettingsSection, CodexCuSettingsDropdownTrigger, CodexCuSettingsCheckbox } from './codex-cu-settings-primitives.jsx';
import { CodexCuDialog, CodexCuDialogTitle, CodexCuDialogHeader, CodexCuDialogBody, CodexCuDialogSection, CodexCuDialogFooter } from './codex-cu-dialog.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import './codex-browser-settings.css';

// Pure presentation. Feature/account gates and saved values are supplied by the
// host adapter; no browser service, persistence or native settings is fabricated.
const destinationOptions = [
  { id: 'in-app-browser', label: 'ChatGPT' },
  { id: 'external-browser', label: 'Default browser' },
];
const annotationOptions = [
  { id: 'always', label: 'Always include' },
  { id: 'necessary', label: 'Only on drag selection' },
];
const legacyTypes = ['cookies', 'siteData', 'cache', 'downloads'];
const legacyLabels = { cookies: 'Cookies', siteData: 'Site data', cache: 'Cached images and files', downloads: 'Download history', history: 'Browsing history' };
const legacyActions = { cookies: 'Delete cookies', siteData: 'Delete site data', cache: 'Delete cached images and files', downloads: 'Delete download history', history: 'Delete browsing history' };
export const CODEX_BROWSER_SETTINGS_ROUTES = Object.freeze({
  history: '/settings/browser-use/history', downloads: '/settings/browser-use/downloads',
  passwordManager: '/settings/browser-use/passwords', contactInfo: '/settings/browser-use/contact-info',
  siteSettings: '/settings/browser-use/site-settings',
});

export function CodexBrowserPreferenceMenu({ value, options = destinationOptions, width = 'menuFixed', triggerWidth, open = false, disabled = false, onOpenChange, onChange, label , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const selected = options.find(option => option.id === value);
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><div className="codex-browser-settings-menu-anchor">
    <CodexCuSettingsDropdownTrigger aria-label={cuText(label)} aria-haspopup="menu" aria-expanded={open}
      disabled={disabled || !onChange || !onOpenChange} data-state={open ? 'open' : 'closed'}
      className={triggerWidth === 168 ? 'codex-browser-settings-annotation-trigger' : undefined}
      onClick={() => onOpenChange?.(!open)}>
      <span className="codex-browser-settings-truncate">{cuText(selected?.label ?? (options === annotationOptions ? options[0].label : null))}</span>
    </CodexCuSettingsDropdownTrigger>
    <CodexCuMenuSurface open={open} align="end" contentWidth={width} className="codex-browser-settings-menu">
      {options.map(option => <CodexCuMenuItem key={option.id} allowWrap={options === annotationOptions}
        disabled={disabled || !onChange} rightIcon={value === option.id ? <CodexCuIcon name="shared:vpt" /> : undefined}
        onSelect={() => { onChange?.(option.id); onOpenChange?.(false); }}>
        <span className={options === annotationOptions ? 'codex-browser-settings-truncate' : 'codex-browser-settings-menu-label'}>{cuText(option.label)}</span>
      </CodexCuMenuItem>)}
    </CodexCuMenuSurface>
  </div></CodexCuI18nProvider>;
}

function ManageRow({ label, description, kind, onNavigate, ariaLabel , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuSettingsRow label={cuText(label)} description={cuText(description)}
    control={<CodexCuButton color="secondary" size="toolbar" aria-label={cuText(ariaLabel)}
      disabled={!onNavigate} onClick={() => onNavigate?.(CODEX_BROWSER_SETTINGS_ROUTES[kind], kind)}>Manage</CodexCuButton>} /></CodexCuI18nProvider>;
}

export function CodexBrowserBrowsingDataRow({ mode, includeHistory = false, expanded = false, pendingType = null, opening = false, onExpandedChange, onOpenDialog, onClear , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  // Oa selects this branch on browsingHistory service presence, not account type.
  if (mode !== 'dialog' && mode !== 'individual') return null;
  const pending = pendingType != null;
  const types = includeHistory ? [...legacyTypes, 'history'] : legacyTypes;
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><div className="codex-browser-settings-disclosure">
    <CodexCuSettingsRow className="codex-browser-settings-data-row" label={cuText("Browsing data")}
      description={cuText("Clear browsing history, site data, cache, and download history from the in-app browser")}
      control={mode === 'dialog'
        ? <CodexCuButton color="secondary" size="toolbar" loading={opening} disabled={!onOpenDialog} onClick={onOpenDialog}>Clear browsing data</CodexCuButton>
        : <div className="codex-browser-settings-clear-actions">
          <CodexCuButton color="secondary" size="toolbar" loading={pendingType === 'all'} disabled={!onClear || pending && pendingType !== 'all'} onClick={() => onClear?.('all', [...legacyTypes, 'history'])}>{cuText("Clear all browsing data")}</CodexCuButton>
          <CodexCuButton color="ghost" size="icon" aria-controls="browser-browsing-data-options" aria-expanded={expanded}
            disabled={pending || !onExpandedChange} aria-label={cuText(expanded ? 'Hide individual browsing data options' : 'Show individual browsing data clearing options')}
            onClick={() => onExpandedChange?.(!expanded)}><CodexCuIcon name="shared:_T" className={`codex-browser-settings-disclosure-icon${expanded ? ' is-expanded' : ''}`} /></CodexCuButton>
        </div>} />
    {cuText(mode === 'individual' && expanded && <div id="browser-browsing-data-options" className="codex-browser-settings-disclosure">
      {types.map(type => <div key={type} className="codex-browser-settings-individual-row">
        <div className="codex-browser-settings-individual-label">{cuText(legacyLabels[type])}</div>
        <CodexCuButton color="ghost" size="toolbar" className="codex-browser-settings-individual-action"
          disabled={!onClear || pending && pendingType !== type} loading={pendingType === type}
          onClick={() => onClear?.(type, [type])}>{cuText(legacyActions[type])}</CodexCuButton>
      </div>)}
    </div>)}
  </div></CodexCuI18nProvider>;
}

export function CodexBrowserSettings({ visibility = {}, values = {}, onPreferenceChange, onNavigate,
  openMenu = null, onOpenMenuChange, importVisible = false, onImport,
  downloadDirectoryChanging = false, onChooseDownloadDirectory, onResetDownloadDirectory,
  browsingData, pluginControl, extensionSection, siteAccessSection, supportedPreferences, supportedNavigationKinds, disabled = false , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });
  const canOpenCodeReview = !!onNavigate && (supportedNavigationKinds == null || supportedNavigationKinds.includes('codeReview'));
  const supportsPreference = key => supportedPreferences == null || supportedPreferences.includes(key);

  const preference = (key, label, options, width, triggerWidth) => <CodexBrowserPreferenceMenu label={cuText(label)} value={values[key]}
    options={options} width={width} triggerWidth={triggerWidth} open={openMenu === key} disabled={disabled || supportedPreferences != null && !supportedPreferences.includes(key)}
    onOpenChange={onOpenMenuChange ? open => onOpenMenuChange(open ? key : null) : undefined}
    onChange={onPreferenceChange ? value => onPreferenceChange(key, value) : undefined} />;
  const toggle = key => controlProps => <CodexCuToggle {...controlProps} checked={values[key] === true}
    disabled={disabled || typeof values[key] !== 'boolean' || !onPreferenceChange || supportedPreferences != null && !supportedPreferences.includes(key)}
    onChange={value => onPreferenceChange?.(key, value)} />;
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><>
    {cuText(pluginControl != null && <CodexCuSettingsSection>{cuText(pluginControl)}</CodexCuSettingsSection>)}
    {cuText(visibility.general === true && <CodexCuSettingsSection title={cuText("General")} actions={importVisible ? <CodexCuButton color="secondary" size="toolbar" disabled={!onImport || disabled} onClick={onImport}>{cuText("Import…")}</CodexCuButton> : undefined}>
      <CodexCuSettingsGroup>
        {supportsPreference('openLinkInTargetPreference') && <CodexCuSettingsRow label={cuText("Web URL and link open destination")} description={canOpenCodeReview ? cuText(<p className="codex-browser-settings-review-link">Manage Codex pull request links in <a role="link" href="/settings/code-review?tab=app" onClick={event => { event.preventDefault(); onNavigate('/settings/code-review?tab=app', 'codeReview'); }}>Code Review settings</a></p>) : undefined}
          control={preference('openLinkInTargetPreference', 'Web URL and link open destination', destinationOptions, 'menuFixed')} />}
        {supportsPreference('openLocalUrlInTargetPreference') && <CodexCuSettingsRow label={cuText("Local URL open destination")} description={cuText("Where local development sites open by default")}
          control={preference('openLocalUrlInTargetPreference', 'Local URL open destination', destinationOptions, 'menuFixed')} />}
        {supportsPreference('showFullUrl') && <CodexCuSettingsRow label={cuText("Show full URL")} description={cuText("Include the path, query, and fragment in the address bar")} control={toggle('showFullUrl')} />}
        <CodexBrowserBrowsingDataRow includeHistory={visibility.history === true} {...browsingData} />
        {cuText(visibility.history === true && <ManageRow kind="history" label="Browsing history" description={cuText("View and manage pages visited in the built-in browser")} onNavigate={onNavigate} />)}
        {supportsPreference('annotationScreenshotsMode') && <CodexCuSettingsRow label={cuText("Annotation screenshots")} description={cuText("Screenshots help ChatGPT better understand and address comments, but increase plan usage")}
          control={preference('annotationScreenshotsMode', 'Annotation screenshots', annotationOptions, 'menuWide', 168)} />}
      </CodexCuSettingsGroup>
    </CodexCuSettingsSection>)}
    {cuText((visibility.passwordManager === true || visibility.contactInfo === true) && <CodexCuSettingsSection title={cuText("Autofill and passwords")}>
      <CodexCuSettingsGroup>
        {cuText(visibility.passwordManager === true && <ManageRow kind="passwordManager" label="Password manager" description={cuText("Add, delete, and edit saved passwords")} onNavigate={onNavigate} />)}
        {cuText(visibility.contactInfo === true && <ManageRow kind="contactInfo" label="Contact info" description={cuText("Add, delete, and edit saved addresses, phone numbers, and email addresses")} onNavigate={onNavigate} />)}
      </CodexCuSettingsGroup>
    </CodexCuSettingsSection>)}
    {cuText(extensionSection)}
    {cuText(visibility.downloads === true && visibility.downloadsService === true && <CodexCuSettingsSection title="Downloads">
      <CodexCuSettingsGroup>
        <CodexCuSettingsRow label="Location" description={cuText(values.downloadDirectory == null ? 'System Downloads folder' : <span className="codex-browser-settings-download-path">{cuText(values.downloadDirectory)}</span>)}
          control={<div className="codex-browser-settings-location-actions"><CodexCuButton color="secondary" size="toolbar" loading={downloadDirectoryChanging} disabled={disabled || !onChooseDownloadDirectory} onClick={onChooseDownloadDirectory}>{cuText("Change")}</CodexCuButton>
            {cuText(values.downloadDirectory != null && <CodexCuButton color="ghost" size="toolbar" disabled={disabled || !onResetDownloadDirectory} onClick={onResetDownloadDirectory}>Reset</CodexCuButton>)}</div>} />
        {supportsPreference('promptForDownloadLocation') && <CodexCuSettingsRow label={cuText("Ask where to save downloads")} description={cuText("Show a save dialog for downloads you start in the built-in browser")} control={toggle('promptForDownloadLocation')} />}
        <ManageRow kind="downloads" label="Download history" description={cuText("View and manage files downloaded from the built-in browser")} ariaLabel={cuText("Manage download history")} onNavigate={onNavigate} />
      </CodexCuSettingsGroup>
    </CodexCuSettingsSection>)}
    {cuText(siteAccessSection)}
  </></CodexCuI18nProvider>;
}

export function CodexBrowserSiteSettingsRow({ onNavigate , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><ManageRow kind="siteSettings" label="Site settings" description={cuText("Control camera and microphone permissions in the built-in browser")} onNavigate={onNavigate} /></CodexCuI18nProvider>;
}

export const CODEX_BROWSER_CLEAR_DATA_TYPES = Object.freeze(['history', 'siteData', 'cache', 'downloads', 'formData', 'siteSettings']);
export const CODEX_BROWSER_CLEAR_TIME_RANGES = Object.freeze([
  { id: 'lastHour', label: 'Last hour' }, { id: 'lastDay', label: 'Last 24 hours' },
  { id: 'lastWeek', label: 'Last 7 days' }, { id: 'lastMonth', label: 'Last 4 weeks' }, { id: 'allTime', label: 'All time' },
]);
const clearLabels = { history: 'Browsing history', siteData: 'Cookies and site data', cache: 'Cached images and files', downloads: 'Download history', formData: 'Autofill form data', siteSettings: 'Site settings' };
const clearIcons = { history: 'shared:OD', siteData: 'cookies:t', cache: 'shared:ED', downloads: 'shared:hb', formData: 'shared:jw', siteSettings: 'shared:zE' };
export function isCodexBrowserDataRemovalPermitted(type, settings, timeRange) {
  if (settings?.supportedDataTypes != null && !settings.supportedDataTypes.includes(type)) return false;
  if (timeRange != null && settings?.dataTypeTimeRanges?.[type] != null && !settings.dataTypeTimeRanges[type].includes(timeRange)) return false;
  if (settings?.supportedDataTypes != null) return settings?.dataRemovalPermitted?.[type] === true;
  if (type === 'history' || type === 'downloads') return settings?.dataRemovalPermitted?.[type] === true;
  return ['siteData', 'cache', 'formData', 'siteSettings'].includes(type);
}
export function createCodexBrowserClearDataSelection(settings, timeRange) {
  return new Set(['history', 'siteData', 'cache', 'downloads'].filter(type => isCodexBrowserDataRemovalPermitted(type, settings, timeRange)));
}
function formatBrowserCacheSize(bytes, locale) {
  if (bytes < 1024) return new Intl.NumberFormat(locale, { style: 'unit', unit: 'byte', unitDisplay: 'long' }).format(bytes);
  const units = ['kilobyte', 'megabyte', 'gigabyte', 'terabyte'];
  let value = bytes / 1024, index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, style: 'unit', unit: units[index], unitDisplay: 'short' }).format(value);
}
function browserDataSummary(type, summary, locale) {
  if (type === 'history') {
    if (summary?.history == null) return undefined;
    const count = summary.history.siteCount;
    return count === 0 ? 'No sites visited' : count === 1 ? `From ${summary.history.firstSite}` : `From ${summary.history.firstSite} + ${count - 1} ${count === 2 ? 'site' : 'sites'}`;
  }
  if (type === 'siteData') return summary?.siteData == null ? undefined : `Cookies currently stored for ${summary.siteData.siteCount === 0 ? 'no sites' : `${summary.siteData.siteCount} ${summary.siteData.siteCount === 1 ? 'site' : 'sites'}`}`;
  if (type === 'cache') return summary?.cache == null ? undefined : `Current cache size: ${formatBrowserCacheSize(summary.cache.sizeBytes, locale)}`;
  if (type === 'downloads') return summary?.downloads == null ? undefined : summary.downloads.count === 0 ? 'No downloads' : `${summary.downloads.count} ${summary.downloads.count === 1 ? 'download' : 'downloads'}`;
  return type === 'formData' ? 'Saved names, addresses, and other form entries' : 'Website permissions and preferences';
}

export function CodexBrowserClearDataDialog({ open = false, browsingDataSettings, summary, timeRange = 'lastHour', selectedTypes, clearing = false,
  onTimeRangeChange, onTypeChange, onClose, onDelete, locale, renderDialogSurface , formatMessage, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  if (!open || !browsingDataSettings) return null;
  const selected = selectedTypes == null ? createCodexBrowserClearDataSelection(browsingDataSettings, timeRange) : new Set(selectedTypes);
  const dataTypes = CODEX_BROWSER_CLEAR_DATA_TYPES.filter(type => selected.has(type) && isCodexBrowserDataRemovalPermitted(type, browsingDataSettings, timeRange));
  const body = <CodexCuDialogBody as="form" onSubmit={event => { event.preventDefault(); if (!clearing && dataTypes.length) onDelete?.({ dataTypes, timeRange }); }}>
    <CodexCuDialogSection><CodexCuDialogTitle asChild><h2 className="codex-browser-settings-sr-only">Clear browsing data</h2></CodexCuDialogTitle><CodexCuDialogHeader title="Clear browsing data" /></CodexCuDialogSection>
    <CodexCuDialogSection className="codex-browser-settings-dialog-options">
      <div className="codex-browser-settings-time-ranges">{CODEX_BROWSER_CLEAR_TIME_RANGES.map(range => <CodexCuButton key={range.id} size="toolbar"
        color={timeRange === range.id ? 'primary' : 'outline'} aria-pressed={timeRange === range.id}
        disabled={clearing || !onTimeRangeChange || browsingDataSettings.supportedTimeRanges != null && !browsingDataSettings.supportedTimeRanges.includes(range.id)} onClick={() => onTimeRangeChange?.(range.id)}>{cuText(range.label)}</CodexCuButton>)}</div>
      <CodexCuSettingsGroup>{CODEX_BROWSER_CLEAR_DATA_TYPES.map(type => {
        const permitted = isCodexBrowserDataRemovalPermitted(type, browsingDataSettings, timeRange);
        const rowDisabled = clearing || !permitted || !onTypeChange;
        const id = `browser-clear-browsing-data-${type}`;
        return <label key={type} htmlFor={id} className={rowDisabled ? undefined : 'codex-browser-settings-check-label'}>
          <CodexCuSettingsRow label={cuText(clearLabels[type])} description={cuText(browserDataSummary(type, summary, locale))}
            icon={<CodexCuIcon name={clearIcons[type]} className="codex-browser-settings-icon-sm" />}
            control={controlProps => <div className="codex-browser-settings-check-control"><CodexCuSettingsCheckbox {...controlProps} id={id} checked={permitted && selected.has(type)} disabled={rowDisabled} onCheckedChange={checked => onTypeChange?.(type, checked)} /></div>} />
        </label>;
      })}</CodexCuSettingsGroup>
    </CodexCuDialogSection>
    <CodexCuDialogSection><CodexCuDialogFooter>
      <CodexCuButton color="outline" disabled={clearing || !onClose} onClick={onClose}>Cancel</CodexCuButton>
      <CodexCuButton type="submit" loading={clearing} disabled={dataTypes.length === 0 || !onDelete}>{cuText("Delete data")}</CodexCuButton>
    </CodexCuDialogFooter></CodexCuDialogSection>
  </CodexCuDialogBody>;
  if (renderDialogSurface) return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}>{renderDialogSurface({ children: body, open: true, size: 'xwide', showDialogClose: false, onOpenChange: nextOpen => { if (!nextOpen && !clearing) onClose?.(); } })}</CodexCuI18nProvider>;
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuDialog open size="xwide" showDialogClose={false} onOpenChange={nextOpen => { if (!nextOpen && !clearing) onClose?.(); }}>{cuText(body)}</CodexCuDialog></CodexCuI18nProvider>;
}

const embeddedKinds = {
  contactInfo: { title: 'Contact info', label: 'Contact info settings', rootUrl: 'chrome://settings/addresses', rootUrls: ['chrome://settings/addresses', 'chrome://settings/contactInfo'], partition: 'persist:codex-contact-info-settings' },
  passwordManager: { title: 'Password manager', label: 'Password manager settings', rootUrl: 'chrome://password-manager/passwords', rootUrls: ['chrome://password-manager/passwords', 'chrome://password-manager/'], partition: 'persist:codex-password-manager-settings' },
  siteSettings: { title: 'Site settings', label: 'Site settings', rootUrl: 'chrome://settings/content', rootUrls: ['chrome://settings/content'], partition: 'persist:codex-site-settings' },
};
export const CODEX_BROWSER_SITE_SUBPAGES = Object.freeze({ ads: 'Intrusive ads', automaticDownloads: 'Automatic downloads', backgroundSync: 'Background sync', camera: 'Camera', clipboard: 'Clipboard', cookies: 'Third-party cookies', federatedIdentityApi: 'Embedded content', location: 'Location', images: 'Images', javascript: 'JavaScript', microphone: 'Microphone', notifications: 'Notifications', popups: 'Pop-ups and redirects', handlers: 'Protocol handlers', protectedContent: 'Protected content IDs', sound: 'Sound', usbDevices: 'USB devices' });
function siteSubpage(url) {
  try { const parsed = new URL(url); if (parsed.protocol !== 'chrome:' || parsed.host !== 'settings') return null;
    const [section, page] = parsed.pathname.split('/').filter(Boolean);
    return section === 'cookies' ? 'cookies' : section === 'handlers' ? 'handlers' : section === 'content' ? page ?? null : null;
  } catch { return null; }
}
export function codexBrowserSiteSubpageLabel(page) {
  const name = page === 'geolocation' ? 'location' : page === 'embeddedContent' ? 'federatedIdentityApi' : page;
  return CODEX_BROWSER_SITE_SUBPAGES[name] ?? null;
}
export function codexBrowserSiteSettingsUrl(page) {
  if (!page) return 'chrome://settings/content';
  if (page === 'cookies' || page === 'third-party-cookies') return 'chrome://settings/cookies';
  if (page === 'handlers' || page === 'protocol-handlers') return 'chrome://settings/handlers';
  return /^[A-Za-z0-9-]+$/.test(page) ? `chrome://settings/content/${page}` : null;
}
export function codexBrowserSettingsDescriptor(kind) {
  const descriptor = embeddedKinds[kind];
  return descriptor ? { ...descriptor, path: CODEX_BROWSER_SETTINGS_ROUTES[kind] } : null;
}
export function codexBrowserSettingsCurrentPage({ kind, currentUrl, currentPageTitle }) {
  const descriptor = embeddedKinds[kind];
  if (!descriptor) return null;
  const trim = url => url.endsWith('/') ? url.slice(0, -1) : url;
  if (descriptor.rootUrls.some(root => trim(root) === trim(currentUrl ?? descriptor.rootUrl))) return null;
  if (kind !== 'siteSettings') return currentPageTitle ?? null;
  const page = siteSubpage(currentUrl);
  if (page === 'siteDetails') {
    if (currentPageTitle != null) return currentPageTitle;
    try { const site = new URL(currentUrl).searchParams.get('site'); return site == null ? 'Site settings' : new URL(site).host; } catch { return 'Site settings'; }
  }
  if (page == null) return currentPageTitle ?? null;
  return currentPageTitle ?? codexBrowserSiteSubpageLabel(page) ?? page.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim().split(/\s+/).map((word, index) => index === 0 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word.toLowerCase()).join(' ');
}

export function CodexBrowserEmbeddedSettings({ kind, currentUrl, currentPageTitle, canGoBack = false, canGoForward = false,
  onBack, onForward, onNavigate, onCurrentSectionClick, content, renderContent, windows = false, navigationTooltip = null , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const descriptor = codexBrowserSettingsDescriptor(kind);
  if (!descriptor) return null;
  const url = currentUrl ?? descriptor.rootUrl;
  const currentPage = codexBrowserSettingsCurrentPage({ kind, currentUrl: url, currentPageTitle });
  const ancestors = [{ id: 'settings', label: 'Settings', path: '/settings/general-settings' }, { id: 'browser', label: 'Browser', path: '/settings/browser-use' }];
  if (currentPage != null) ancestors.push({ id: kind, label: descriptor.title, path: descriptor.path, onClick: onCurrentSectionClick });
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><div className={`codex-browser-settings-embedded${windows ? ' is-windows' : ''}`}>
    <div className="codex-browser-settings-embedded-toolbar">
      <div aria-hidden="true" className="codex-browser-settings-drag-area" />
      <div className="codex-browser-settings-navigation">
        <CodexCuTooltip open={navigationTooltip === 'back'} tooltipContent="Back" side="bottom"><CodexCuButton color="ghost" size="toolbar" uniform disabled={!canGoBack || !onBack} aria-label="Back" onClick={onBack}><CodexCuIcon name="back" aria-hidden={false} /></CodexCuButton></CodexCuTooltip>
        <CodexCuTooltip open={navigationTooltip === 'forward'} tooltipContent="Forward" side="bottom"><CodexCuButton color="ghost" size="toolbar" uniform disabled={!canGoForward || !onForward} aria-label="Forward" onClick={onForward}><CodexCuIcon name="back" className="codex-browser-settings-forward-icon" aria-hidden={false} /></CodexCuButton></CodexCuTooltip>
      </div>
      <div className="codex-browser-settings-breadcrumb-wrap"><nav aria-label="Breadcrumb" className="codex-browser-settings-breadcrumb">
        {ancestors.map((ancestor, index) => <React.Fragment key={ancestor.id}>
          {cuText(index > 0 && <CodexCuIcon name="shared:Jw" className="codex-browser-settings-breadcrumb-separator" />)}
          <CodexCuButton color="ghost" size="toolbar" className="codex-browser-settings-breadcrumb-button"
            disabled={!ancestor.onClick && !onNavigate} onClick={ancestor.onClick ?? (() => onNavigate?.(ancestor.path, ancestor.id))}><span className="codex-browser-settings-truncate">{cuText(ancestor.label)}</span></CodexCuButton>
        </React.Fragment>)}
        <CodexCuIcon name="shared:Jw" className="codex-browser-settings-breadcrumb-separator" />
        <span aria-current="page" className="codex-browser-settings-breadcrumb-current">{cuText(currentPage ?? descriptor.title)}</span>
      </nav></div>
    </div>
    <div className="codex-browser-settings-embedded-content" aria-label={cuText(descriptor.label)}>{cuText(renderContent ? renderContent({ ...descriptor, kind, currentUrl: url }) : content)}</div>
  </div></CodexCuI18nProvider>;
}
