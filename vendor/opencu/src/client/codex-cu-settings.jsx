import { CodexCuI18nProvider, useCodexCuPlainText } from './codex-cu-i18n.jsx';
const CODEX_PLAIN_DISPLAY_IDS = Object.freeze({
  "Play sounds for foreground clicks": "settings.computerUse.sounds.foregroundClicks",
  "Play sounds for foreground and background clicks": "settings.computerUse.sounds.foregroundAndBackgroundClicks",
  "Don’t play sounds": "settings.computerUse.sounds.off",
  "Ask by default": "settings.computerUse.messages.readAccess.askPerChat",
  "Ask before reading chats without a saved choice": "settings.computerUse.messages.readAccess.askPerChatDescription",
  "Allow by default": "settings.computerUse.messages.readAccess.allowUnconfigured",
  "Allow reading chats without a saved choice": "settings.computerUse.messages.readAccess.allowUnconfiguredDescription",
  "Allow all chats": "settings.computerUse.messages.readAccess.allowAll",
  "Saved choices, including Never allow, don't apply": "settings.computerUse.messages.readAccess.allowAllDescription",
  "Microsoft Excel": "settings.computerUse.microsoftExcel.pluginTitle",
  "Microsoft PowerPoint": "settings.computerUse.microsoftPowerPoint.pluginTitle",
  "Microsoft Word": "settings.computerUse.microsoftWord.pluginTitle",
  "Allowed app removed": "settings.computerUse.allowedApps.saved",
  "Unable to save allowed apps": "settings.computerUse.allowedApps.saveError",
  "Locked use enabled": "settings.computerUse.backgroundAuth.enabled",
  "Locked use disabled": "settings.computerUse.backgroundAuth.disabled",
  "Unable to update Locked use": "settings.computerUse.backgroundAuth.saveError",
  "Unable to update read permission": "settings.computerUse.messages.readAccess.saveError",
  "Unable to remove read permission": "settings.computerUse.messages.readAccess.removeError",
  "Unable to update send permission": "settings.computerUse.messages.sendAccess.saveError",
  "Unable to remove send permission": "settings.computerUse.messages.allowedChats.removeError",
  "Any App": "settings.computerUse.anyApp.title",
  "Let ChatGPT control apps on your computer": "settings.computerUse.anyApp.description",
  "Messages": "settings.computerUse.messages.pluginTitle",
  "Let ChatGPT read and send messages": "settings.computerUse.messages.description",
  "Disable": "settings.browserUse.historyApproval.disabled.label",
  "Computer Use plugins unavailable": "settings.computerUse.install.empty",
  "Loading allowed apps…": "settings.computerUse.allowedApps.loading",
  "Unable to load allowed apps.": "settings.computerUse.allowedApps.loadError",
  "Locked use": "settings.computerUse.backgroundAuth.label",
  "Enable Locked use": "settings.computerUse.backgroundAuth.ariaLabel",
  "Manage how ChatGPT uses other applications on your computer": "settings.computerUse.subtitle",
  "Control": "settings.computerUse.install.title",
  "Always-allowed apps": "settings.computerUse.allowedApps.title",
  "ChatGPT asks before reading chats without a saved choice to answer your requests": "settings.computerUse.messages.readAccess.policyAskPerChatDescription",
  "ChatGPT can read chats without a saved choice to answer your requests": "settings.computerUse.messages.readAccess.policyDescription",
  "ChatGPT can read all chats to answer your requests": "settings.computerUse.messages.readAccess.policyOverridden",
  "Loading read permissions…": "settings.computerUse.messages.readAccess.loading",
  "Unable to load read permissions": "settings.computerUse.messages.readAccess.loadError",
  "Reading behavior": "settings.computerUse.messages.readAccess.policyLabel",
  "Per-chat permissions": "settings.computerUse.messages.readAccess.savedPermissions",
  "Loading allowed chats…": "settings.computerUse.messages.allowedChats.loading",
  "Unable to load allowed chats": "settings.computerUse.messages.allowedChats.loadError",
  "Always allow sending to all chats": "settings.computerUse.messages.sendAccess.allowAll",
  "When on, ChatGPT can send to any chat without asking you to approve the message or its recipients": "settings.computerUse.messages.sendAccess.allowAllDescription",
  "Per-chat approvals": "settings.computerUse.messages.allowedChats.savedApprovals",
  "Send access": "settings.computerUse.messages.sendAccess.title",
  "Loading Messages settings…": "settings.computerUse.messages.loading",
  "Searching chats…": "settings.computerUse.messages.chatSearch.searching",
  "Unable to search chats": "settings.computerUse.messages.chatSearch.error",
  "Finish Messages permission setup, then try again": "settings.computerUse.messages.chatSearch.permissionsPending",
  "Allow Messages permissions to search chats": "settings.computerUse.messages.chatSearch.permissionsRequired",
  "No chats found": "settings.computerUse.messages.chatSearch.empty",
  "Add a chat": "settings.computerUse.messages.readAccess.addDialog.title",
  "Choose whether ChatGPT can use messages from a specific chat to respond to your requests": "settings.computerUse.messages.readAccess.addDialog.description",
  "Search chats": "settings.computerUse.messages.chatSearch.placeholder"
});
import React from 'react'
import { CodexCuIcon, CodexStaticImageUrls } from './codex-cu-icons.jsx'
import {
  CodexCuButton, CodexCuToggle, CodexCuTooltip, CodexCuSpinner,
  CodexCuMenuSurface, CodexCuMenuItem, CodexCuMenuRadioGroup,
  CodexCuMenuRadioItem, CodexCuPopoverSurface,
} from './codex-cu-primitives.jsx'
import {
  CodexCuSettingsPage, CodexCuSettingsSection, CodexCuSettingsSectionHeader,
  CodexCuSettingsSectionContent, CodexCuSettingsGroup, CodexCuSettingsRow,
  CodexCuSettingsEmpty, CodexCuSettingsDropdownTrigger, CodexCuSettingsInput,
  CodexCuSettingsPanelLoading,
} from './codex-cu-settings-primitives.jsx'
import {
  CodexCuDialog, CodexCuDialogBody, CodexCuDialogSection, CodexCuDialogHeader,
  CodexCuDialogFooter, CodexCuDialogTitle, CodexCuDialogDescription,
} from './codex-cu-dialog.jsx'
import './codex-cu-settings.css'
import { CodexCuScope } from './codex-cu-scope.jsx';

export { CodexCuSettingsPanelLoading }

// These are display components. Every value, gate, pending result and mutation
// belongs to the caller. See work/rea-reconstruction/cu-settings/design-manifest.json.
const soundOptions = [
  { value: 'foregroundClicks', label: 'Play sounds for foreground clicks' },
  { value: 'foregroundAndBackgroundClicks', label: 'Play sounds for foreground and background clicks' },
  { value: 'off', label: 'Don’t play sounds' },
]
const readOptions = [
  { value: 'askPerChat', label: 'Ask by default', description: 'Ask before reading chats without a saved choice' },
  { value: 'allowUnconfiguredChats', label: 'Allow by default', description: 'Allow reading chats without a saved choice' },
  { value: 'allowAllChats', label: 'Allow all chats', description: "Saved choices, including Never allow, don't apply" },
]
const decisionOptions = [
  { value: 'alwaysAllow', label: 'Always allow' },
  { value: 'ask', label: 'Always ask' },
  { value: 'alwaysDeny', label: 'Never allow' },
]
const officeDefinitions = {
  excel: { title: 'Microsoft Excel', image: 'microsoft-excel-large', id: 'microsoft-excel-document-control-app' },
  powerpoint: { title: 'Microsoft PowerPoint', image: 'microsoft-powerpoint-large', id: 'microsoft-powerpoint-document-control-app' },
  word: { title: 'Microsoft Word', image: 'microsoft-word-large', id: 'microsoft-word-document-control-app' },
}

export const CODEX_CU_SETTINGS_GATES = Object.freeze({
  anyApp: 'Hr: computerUseAvailability.available && native Computer Use plugin exists',
  office: 'Hr: feature 1288674243 && platform in macOS/windows && matching plugin exists',
  powerpoint: 'Hr: feature 1623794951',
  word: 'Hr: feature 819296327',
  officeApp: 'Hr: installed && enabled plugin; enabled state from connector_openai_codex_document_control',
  messages: 'Hr/ei: matching Messages plugin installed',
  allowedAppsAndSounds: 'Vr: computerUseAvailability.available; ri additionally requires sound-mode data',
  lockedUse: 'Vr/ai: macOS && computerUseAvailability.available && hn capability && enabled state not null',
})

// Hand these descriptors to the existing host toast renderer after real results.
export const CODEX_CU_SETTINGS_RESULTS = Object.freeze({
  allowedAppRemoved: { tone: 'success', message: 'Allowed app removed', id: 'settings.computerUse.allowedApps.saved' },
  allowedAppSaveError: { tone: 'danger', message: 'Unable to save allowed apps', id: 'settings.computerUse.allowedApps.saveError' },
  lockedUseEnabled: { tone: 'success', message: 'Locked use enabled', id: 'settings.computerUse.backgroundAuth.enabled' },
  lockedUseDisabled: { tone: 'success', message: 'Locked use disabled', id: 'settings.computerUse.backgroundAuth.disabled' },
  lockedUseSaveError: { tone: 'danger', message: 'Unable to update Locked use', id: 'settings.computerUse.backgroundAuth.saveError' },
  readSaveError: { tone: 'danger', message: 'Unable to update read permission', id: 'settings.computerUse.messages.readAccess.saveError' },
  readRemoveError: { tone: 'danger', message: 'Unable to remove read permission', id: 'settings.computerUse.messages.readAccess.removeError' },
  sendSaveError: { tone: 'danger', message: 'Unable to update send permission', id: 'settings.computerUse.messages.sendAccess.saveError' },
  sendRemoveError: { tone: 'danger', message: 'Unable to remove send permission', id: 'settings.computerUse.messages.allowedChats.removeError' },
})

export function createCodexCuAnyAppItem({ computerUseAvailable, plugin }) {
  if (!computerUseAvailable || plugin == null) return null
  return { plugin, title: 'Any App', description: 'Let ChatGPT control apps on your computer', gate: CODEX_CU_SETTINGS_GATES.anyApp }
}

export function createCodexCuMessagesControlItem({ plugin, onManage }) {
  if (plugin?.installed !== true) return null
  return { plugin, title: 'Messages', description: 'Let ChatGPT read and send messages', gate: CODEX_CU_SETTINGS_GATES.messages, action: <CodexCuButton color="secondary" disabled={!onManage} onClick={onManage} size="toolbar">Manage</CodexCuButton> }
}

/** Apply only the source office gates to caller-provided plugin/app state. */
export function createCodexCuOfficeItem({ family, platform, officeEnabled, powerpointEnabled, wordEnabled, plugin, appEnabled, isPending, onToggleEnabled }) {
  const definition = officeDefinitions[family]
  if (!definition || !officeEnabled || !['macOS', 'windows'].includes(platform) || plugin == null) return null
  if (family === 'powerpoint' && !powerpointEnabled || family === 'word' && !wordEnabled) return null
  const icon = <img alt="" className="codex-cu-settings-full-image" src={CodexStaticImageUrls[definition.image]} />
  const common = { id: definition.id, title: definition.title, description: `Let ChatGPT use ${definition.title} add-in for additional control`, icon, gate: CODEX_CU_SETTINGS_GATES.office }
  if (plugin.installed && plugin.enabled) {
    // Unknown local data is an input gap, not a pretend on/off state.
    if (typeof appEnabled !== 'boolean') return null
    return { ...common, kind: 'app', enabled: appEnabled, isPending, onToggleEnabled, toggleAriaLabel: `Toggle ${definition.title} live control`, toggleTooltip: `${appEnabled ? 'Disable' : 'Enable'} ${definition.title} live control` }
  }
  return { ...common, plugin, displayName: definition.title }
}

export function CodexCuSettingsLoading({ children , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><div role="status"><CodexCuSettingsRow label={cuText(<span className="codex-cu-settings-loading"><CodexCuSpinner className="codex-cu-settings-loading-icon" /><span>{cuText(children)}</span></span>)} control={null} /></div></CodexCuI18nProvider>
}

export function CodexCuBrowserControlIcon({ imageUrl, safariIcon , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  if (safariIcon != null) return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}>{safariIcon}</CodexCuI18nProvider>
  if (imageUrl == null) return null
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><span className="codex-cu-settings-browser-icon"><img alt="" className="codex-cu-settings-full-image" src={imageUrl} /><CodexCuIcon name="cuSettings:Gn" className="codex-cu-settings-browser-puzzle" /></span></CodexCuI18nProvider>
}

export function CodexCuMoreBrowsersIcon({ imageUrls = [] , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const urls = imageUrls.slice(0, 3)
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><span aria-hidden="true" className="codex-cu-settings-browser-icon">{urls.map((url, index) => <img alt="" key={`${url}-${index}`} src={url} className={urls.length === 1 ? 'codex-cu-settings-full-image' : `codex-cu-settings-browser-stack codex-cu-settings-browser-stack-${index} codex-cu-settings-browser-stack-count-${urls.length}`} />)}</span></CodexCuI18nProvider>
}

function ControlIcon({ item, theme , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const logo = theme === 'dark' ? item.plugin?.logoDarkUrl ?? item.plugin?.logoUrl : item.plugin?.logoUrl
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><span className={`codex-cu-settings-control-icon${item.showIconBorder === false ? ' codex-cu-settings-control-icon-borderless' : ''}`}>
    {cuText(item.icon ?? (logo ? <img alt={cuText(item.displayName ?? item.title ?? '')} className="codex-cu-settings-full-image" src={logo} /> : <CodexCuIcon name={item.kind ? 'shared:SS' : 'shared:kw'} className="codex-cu-settings-secondary" />))}
  </span></CodexCuI18nProvider>
}

export function CodexCuControlItem({ item, theme, pending = false, onInstall, onOpenPluginDetails, onTogglePluginEnabled, manageMenu , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const icon = <ControlIcon item={item} theme={theme} />
  if (item.kind === 'disclosure') return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><button className="codex-cu-settings-disclosure" type="button" aria-expanded={item.expanded} onClick={item.onToggleExpanded} disabled={!item.onToggleExpanded}>
    <CodexCuSettingsRow className="codex-cu-settings-control-row" icon={icon} label={cuText(item.title)} description={cuText(item.description)} control={<CodexCuIcon name="shared:L" className={`codex-cu-settings-secondary${item.expanded ? ' codex-cu-settings-expanded' : ''}`} />} />
  </button></CodexCuI18nProvider>
  if (item.kind === 'app' || item.kind === 'unavailable') {
    const unavailable = item.kind === 'unavailable'
    const knownState = typeof item.enabled === 'boolean'
    const control = !unavailable && item.action == null && item.showEnableToggle === false ? null : <div className="codex-cu-settings-inline-controls">
      {cuText(item.action)}
      {cuText(item.showEnableToggle === false ? null : <CodexCuTooltip tooltipContent={cuText(item.toggleTooltip)}><CodexCuToggle ariaLabel={cuText(item.toggleAriaLabel)} checked={!unavailable && knownState && item.enabled} disabled={unavailable || !knownState || item.isPending === true || !item.onToggleEnabled} onChange={item.onToggleEnabled} /></CodexCuTooltip>)}
    </div>
    return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuSettingsRow className={`codex-cu-settings-control-row${unavailable ? ' codex-cu-settings-unavailable' : ''}`} icon={icon} label={cuText(item.title)} description={cuText(item.description)} control={control} /></CodexCuI18nProvider>
  }
  if (!item.plugin || typeof item.plugin.installed !== 'boolean') return null
  const plugin = item.plugin
  const name = item.displayName ?? plugin.displayName ?? item.title
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><div className="codex-cu-settings-plugin-row" data-codex-cu-gate={item.gate}>
    <button className="codex-cu-settings-plugin-details" type="button" disabled={!onOpenPluginDetails} onClick={() => onOpenPluginDetails?.(plugin)}>
      {cuText(icon)}<div className="codex-cu-settings-plugin-copy"><div className="codex-cu-settings-plugin-title">{cuText(item.title)}</div>{cuText(item.description == null ? null : <div className="codex-cu-settings-plugin-description">{cuText(item.descriptionIndicator ? <span className="codex-cu-settings-indicator-description"><span className={`codex-cu-settings-status-dot codex-cu-settings-status-${item.descriptionIndicator}`} /><span>{cuText(item.description)}</span></span> : item.description)}</div>)}</div>
    </button>
    <div className="codex-cu-settings-inline-controls">{cuText(item.action)}{cuText(plugin.installed ? <>
      {cuText(item.showManageActions === true ? <div className="codex-cu-settings-manage-actions">{cuText(manageMenu)}</div> : null)}
      {cuText(item.showEnableToggle === false ? null : <CodexCuTooltip tooltipContent={cuText(`${plugin.enabled ? 'Disable' : 'Enable'} ${name}`)}><CodexCuToggle checked={plugin.enabled === true} disabled={pending || typeof plugin.enabled !== 'boolean' || !onTogglePluginEnabled} ariaLabel={cuText(`Toggle ${name}`)} onChange={value => onTogglePluginEnabled?.(plugin, value)} /></CodexCuTooltip>)}
    </> : <CodexCuTooltip tooltipContent={cuText(`Install ${name}`)}><span><CodexCuButton aria-label={cuText(`Install ${name}`)} color="secondary" disabled={pending || !onInstall} loading={pending} onClick={() => onInstall?.(plugin, item.browserFamily)} size="toolbar">Install</CodexCuButton></span></CodexCuTooltip>)}</div>
  </div></CodexCuI18nProvider>
}

/** items are the source Hr result: plugin/app/unavailable/disclosure branches. */
export function CodexCuControlList({ items = [], isLoading, errorMessage, onRetry, pendingPluginId, theme, onInstall, onOpenPluginDetails, onTogglePluginEnabled, renderManageMenu , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  let content
  if (isLoading && items.length === 0) content = <CodexCuSettingsLoading>Loading plugins…</CodexCuSettingsLoading>
  else if (errorMessage != null) content = onRetry ? <CodexCuSettingsRow label={cuText(<span role="alert">{cuText(errorMessage)}</span>)} control={<CodexCuButton color="secondary" size="toolbar" onClick={onRetry}>Retry</CodexCuButton>} /> : <CodexCuSettingsEmpty layout="settings-row">{cuText(errorMessage)}</CodexCuSettingsEmpty>
  else if (items.length === 0) content = <CodexCuSettingsEmpty layout="settings-row">{cuText("Computer Use plugins unavailable")}</CodexCuSettingsEmpty>
  else content = items.map(item => <CodexCuControlItem key={item.id ?? item.plugin?.id} item={item} theme={theme} pending={pendingPluginId != null && pendingPluginId === item.plugin?.id} onInstall={onInstall} onOpenPluginDetails={onOpenPluginDetails} onTogglePluginEnabled={onTogglePluginEnabled} manageMenu={renderManageMenu?.(item)} />)
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuSettingsGroup className="codex-cu-settings-control-list">{cuText(content)}</CodexCuSettingsGroup></CodexCuI18nProvider>
}

function AllowedAppIcon({ app , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}>{app.iconDataURL != null ? <img alt="" className="codex-cu-settings-approved-app-icon" draggable={false} src={app.iconDataURL} /> : <div className="codex-cu-settings-approved-app-letter">{app.displayName.slice(0, 1).toUpperCase()}</div>}</CodexCuI18nProvider>
}

export function CodexCuAllowedApps({ status, approvedApps, isSaving = false, onRequestRemoval , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  if (status === 'loading') return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuSettingsLoading>{cuText("Loading allowed apps…")}</CodexCuSettingsLoading></CodexCuI18nProvider>
  if (status === 'error') return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><div className="codex-cu-settings-allowed-error">{cuText("Unable to load allowed apps.")}</div></CodexCuI18nProvider>
  if (status !== 'ready' || !Array.isArray(approvedApps)) return null
  if (approvedApps.length === 0) return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuSettingsEmpty layout="settings-row">None yet</CodexCuSettingsEmpty></CodexCuI18nProvider>
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}>{approvedApps.map(app => <CodexCuSettingsRow key={app.bundleIdentifier} icon={<AllowedAppIcon app={app} />} label={cuText(<span className="codex-cu-settings-medium">{app.displayName}</span>)} description={cuText(null)} control={<CodexCuButton aria-label={cuText(`Remove ${app.displayName}`)} color="danger" disabled={isSaving || !onRequestRemoval} onClick={() => onRequestRemoval?.(app)} size="icon"><CodexCuIcon name="primary:fm" /></CodexCuButton>} />)}</CodexCuI18nProvider>
}

export function CodexCuAllowedAppRemovalDialog({ app, isRemoving, onClose, onRemove, formatMessage, locale, ...dialogProps }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const displayName = app?.displayName ?? ''
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuDialog {...dialogProps} open={app != null} onOpenChange={open => !open && onClose?.()} size="compact"><CodexCuDialogBody>
    <CodexCuDialogSection><CodexCuDialogHeader title={cuText(<CodexCuDialogTitle>Remove “{cuText(displayName)}” from always allowed apps?</CodexCuDialogTitle>)} subtitle={cuText(<CodexCuDialogDescription>ChatGPT will ask to use “{cuText(displayName)}” in the next computer use session.</CodexCuDialogDescription>)} /></CodexCuDialogSection>
    <CodexCuDialogSection><CodexCuDialogFooter><CodexCuButton color="ghost" disabled={isRemoving || !onClose} onClick={onClose}>Cancel</CodexCuButton><CodexCuButton color="danger" loading={isRemoving} disabled={!onRemove} onClick={() => app != null && onRemove?.(app.bundleIdentifier)}>Remove</CodexCuButton></CodexCuDialogFooter></CodexCuDialogSection>
  </CodexCuDialogBody></CodexCuDialog></CodexCuI18nProvider>
}

function ControlledMenu({ options, value, open, onOpenChange, onChange, disabled, className, width, menuStyle, contentWidth, radio = true, formatMessage, locale, ...triggerProps }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const option = options.find(option => option.value === value)
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><><CodexCuSettingsDropdownTrigger {...triggerProps} className={className} width={width} disabled={disabled || !onOpenChange} open={open} onClick={() => onOpenChange?.(!open)}>{cuText(radio ? <span className="codex-cu-settings-truncate">{cuText(option?.label)}</span> : option?.label)}</CodexCuSettingsDropdownTrigger>
    <CodexCuMenuSurface open={open === true} className={radio ? undefined : 'codex-cu-settings-menu'} contentWidth={contentWidth} style={menuStyle} role="menu">{cuText(radio ? <CodexCuMenuRadioGroup value={value}>{options.map(option => <CodexCuMenuRadioItem key={option.value} value={option.value} disabled={disabled || !onChange} SubText={cuText(option.description)} onSelect={() => onChange?.(option.value)}>{cuText(option.label)}</CodexCuMenuRadioItem>)}</CodexCuMenuRadioGroup> : options.map(option => <CodexCuMenuItem key={option.value} disabled={disabled || !onChange} rightIcon={value === option.value ? <CodexCuIcon name="shared:vpt" /> : null} onSelect={() => onChange?.(option.value)}><span className="codex-cu-settings-sound-option">{cuText(option.label)}</span></CodexCuMenuItem>))}</CodexCuMenuSurface>
  </></CodexCuI18nProvider>
}

export function CodexCuSoundSetting({ value, isLoading, isPending, open, onOpenChange, onChange, menuStyle , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  if (value == null) return null
  const supported = soundOptions.some(option => option.value === value) ? value : 'foregroundClicks'
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><ControlledMenu radio={false} options={soundOptions} value={supported} disabled={isLoading || isPending} open={open} onOpenChange={onOpenChange} onChange={onChange} menuStyle={menuStyle} className="codex-cu-settings-sound-trigger" contentClassName="codex-cu-settings-flex-none" /></CodexCuI18nProvider>
}

export function CodexCuLockedUseIcon({ computerImageDataUrl, lockImageDataUrl , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  if (!computerImageDataUrl || !lockImageDataUrl) return null
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><span className="codex-cu-settings-locked-icon-frame"><span className="codex-cu-settings-locked-icon-scale"><span className="codex-cu-settings-locked-icon"><img alt="" className="codex-cu-settings-locked-computer" draggable={false} src={computerImageDataUrl} /><img alt="" className="codex-cu-settings-locked-lock" draggable={false} src={lockImageDataUrl} /></span></span></span></CodexCuI18nProvider>
}

export function CodexCuLockedUse({ enabled, isLoading, isPending, computerIconDataURL, lockIconDataURL, onChange , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  if (typeof enabled !== 'boolean') return null
  const icon = computerIconDataURL != null && lockIconDataURL != null ? <CodexCuLockedUseIcon computerImageDataUrl={computerIconDataURL} lockImageDataUrl={lockIconDataURL} /> : null
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuSettingsGroup><CodexCuSettingsRow icon={icon} label={cuText("Locked use")} description={cuText(<>Let ChatGPT use your Mac when it's locked. <a className="codex-cu-settings-info-link" href="https://developers.openai.com/codex/app/computer-use#locked-use" target="_blank" rel="noreferrer">Learn more</a></>)} control={<CodexCuToggle ariaLabel={cuText("Enable Locked use")} checked={enabled} disabled={isLoading || isPending || !onChange} onChange={onChange} />} /></CodexCuSettingsGroup></CodexCuI18nProvider>
}

/** The source main route; browser and Messages routes remain separate inputs. */
export function CodexCuSettings({ title, theme, windowType, control, computerUseAvailable, platform, lockedUseAllowed, lockedUse, allowedApps, allowedAppRemoval, sound, className , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuScope theme={theme} referenceWindowType={windowType} className={className}><CodexCuSettingsPage title={cuText(title)} subtitle={cuText("Manage how ChatGPT uses other applications on your computer")}>
    <CodexCuSettingsSection><CodexCuSettingsSectionHeader title={cuText("Control")} /><CodexCuSettingsSectionContent>{cuText(control ? <CodexCuControlList {...control} theme={theme} /> : null)}{cuText(platform === 'macOS' && computerUseAvailable && lockedUseAllowed && lockedUse ? <CodexCuLockedUse {...lockedUse} /> : null)}</CodexCuSettingsSectionContent></CodexCuSettingsSection>
    {cuText(computerUseAvailable ? <><CodexCuSettingsSection><CodexCuSettingsSectionHeader title={cuText("Always-allowed apps")} /><CodexCuSettingsSectionContent><CodexCuSettingsGroup>{cuText(allowedApps ? <CodexCuAllowedApps {...allowedApps} /> : null)}</CodexCuSettingsGroup></CodexCuSettingsSectionContent></CodexCuSettingsSection>{cuText(sound ? <CodexCuSoundSetting {...sound} /> : null)}</> : null)}
    {cuText(allowedAppRemoval ? <CodexCuAllowedAppRemovalDialog {...allowedAppRemoval} /> : null)}
  </CodexCuSettingsPage></CodexCuScope></CodexCuI18nProvider>
}

const readPolicyDescriptions = {
  askPerChat: 'ChatGPT asks before reading chats without a saved choice to answer your requests',
  allowUnconfiguredChats: 'ChatGPT can read chats without a saved choice to answer your requests',
  allowAllChats: 'ChatGPT can read all chats to answer your requests',
}

export function CodexCuMessagesRemovalDialog({ chat, permission, readAccessPolicy = 'askPerChat', isRemoving, onClose, onRemove, formatMessage, locale, ...dialogProps }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const name = chat?.displayName ?? ''
  const subtitle = permission === 'read' ? readAccessPolicy === 'askPerChat' ? 'ChatGPT will ask before using messages from this chat' : 'ChatGPT will be able to read this chat without asking' : 'ChatGPT will ask before sending messages to this chat'
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuDialog {...dialogProps} open={chat != null} onOpenChange={open => !open && onClose?.()} size="compact"><CodexCuDialogBody as="form" onSubmit={event => { event.preventDefault(); if (chat != null && !isRemoving) onRemove?.(chat.chatGUID) }}>
    <CodexCuDialogSection><CodexCuDialogHeader titleClassName="codex-cu-settings-chat-removal-title" title={cuText(<CodexCuDialogTitle asChild><span>Remove saved {cuText(permission === 'read' ? 'read' : 'send')} permission for “{cuText(name)}”?</span></CodexCuDialogTitle>)} subtitle={cuText(<CodexCuDialogDescription asChild><span>{cuText(subtitle)}</span></CodexCuDialogDescription>)} /></CodexCuDialogSection>
    <CodexCuDialogSection><CodexCuDialogFooter><CodexCuButton color="ghost" disabled={isRemoving || !onClose} onClick={onClose} type="button">Cancel</CodexCuButton><CodexCuButton color="danger" loading={isRemoving} disabled={!onRemove} type="submit">Remove</CodexCuButton></CodexCuDialogFooter></CodexCuDialogSection>
  </CodexCuDialogBody></CodexCuDialog></CodexCuI18nProvider>
}

function MessagesRead({ state , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  if (!state) return null
  const { status, readAccessPolicy, chats, isSaving, onPolicyChange, policyMenuOpen, policyMenuStyle, onPolicyMenuOpenChange, openChatMenuId, chatMenuStyles, onChatMenuOpenChange, onDecisionChange, onRequestRemoval, onAdd } = state
  const ready = status === 'ready' && Array.isArray(chats)
  const policy = readAccessPolicy ?? 'askPerChat'
  let content
  if (status === 'loading') content = <CodexCuSettingsLoading>{cuText("Loading read permissions…")}</CodexCuSettingsLoading>
  else if (!ready) content = <CodexCuSettingsEmpty layout="settings-row">{cuText("Unable to load read permissions")}</CodexCuSettingsEmpty>
  else if (chats.length === 0) content = <CodexCuSettingsEmpty layout="settings-row">None yet</CodexCuSettingsEmpty>
  else content = chats.map(chat => <CodexCuSettingsRow key={chat.chatGUID} label={cuText(<span className="codex-cu-settings-medium">{chat.displayName}</span>)} control={controlProps => <div className="codex-cu-settings-inline-controls"><ControlledMenu {...controlProps} options={decisionOptions} value={chat.decision} width="136px" menuStyle={chatMenuStyles?.[chat.chatGUID]} disabled={isSaving || !onDecisionChange || !onChatMenuOpenChange} open={openChatMenuId === chat.chatGUID} onOpenChange={open => onChatMenuOpenChange?.(open ? chat.chatGUID : null)} onChange={value => value !== chat.decision && onDecisionChange?.(chat, value)} /><CodexCuButton aria-label={cuText(`Remove read permission for ${chat.displayName}`)} color="ghost" disabled={isSaving || !onRequestRemoval} onClick={() => onRequestRemoval?.(chat)} size="icon"><CodexCuIcon name="shared:lot" /></CodexCuButton></div>} />)
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuSettingsSection><CodexCuSettingsSectionHeader title="Read access" /><CodexCuSettingsSectionContent className="codex-cu-settings-gap-3">
    {cuText(ready ? <CodexCuSettingsGroup><CodexCuSettingsRow label={cuText("Reading behavior")} description={cuText(readPolicyDescriptions[policy])} control={controlProps => <ControlledMenu {...controlProps} options={readOptions} value={policy} disabled={isSaving || !onPolicyChange} contentWidth="menuWide" menuStyle={policyMenuStyle} open={policyMenuOpen} onOpenChange={onPolicyMenuOpenChange} onChange={value => value !== policy && onPolicyChange?.(value)} className="codex-cu-settings-max-trigger" />} /></CodexCuSettingsGroup> : null)}
    {cuText(policy !== 'allowAllChats' ? <div className="codex-cu-settings-stack"><CodexCuSettingsSectionHeader size="compact" title={cuText(<span className="codex-cu-settings-secondary">{cuText("Per-chat permissions")}</span>)} actions={<CodexCuButton color="secondary" disabled={!ready || isSaving || !onAdd} size="toolbar" onClick={onAdd}><CodexCuIcon name="shared:Zrt" />Add</CodexCuButton>} /><CodexCuSettingsGroup>{cuText(content)}</CodexCuSettingsGroup></div> : null)}
  </CodexCuSettingsSectionContent></CodexCuSettingsSection></CodexCuI18nProvider>
}

function MessagesSend({ state , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  if (!state) return null
  const { status, approvedChats, allowAllChats, isSaving, onAllowAllChange, onRequestRemoval } = state
  let content
  if (status === 'loading') content = <CodexCuSettingsGroup><CodexCuSettingsLoading>{cuText("Loading allowed chats…")}</CodexCuSettingsLoading></CodexCuSettingsGroup>
  else if (status !== 'ready' || !Array.isArray(approvedChats) || typeof allowAllChats !== 'boolean') content = <CodexCuSettingsGroup><CodexCuSettingsEmpty layout="settings-row">{cuText("Unable to load allowed chats")}</CodexCuSettingsEmpty></CodexCuSettingsGroup>
  else content = <><CodexCuSettingsGroup><CodexCuSettingsRow label={cuText(<span id="messages-send-allow-all">{cuText("Always allow sending to all chats")}</span>)} description={cuText("When on, ChatGPT can send to any chat without asking you to approve the message or its recipients")} control={<CodexCuToggle aria-labelledby="messages-send-allow-all" checked={allowAllChats} disabled={isSaving || !onAllowAllChange} onChange={onAllowAllChange} />} /></CodexCuSettingsGroup>{cuText(!allowAllChats ? <div className="codex-cu-settings-stack"><CodexCuSettingsSectionHeader size="compact" title={cuText(<span className="codex-cu-settings-secondary">{cuText("Per-chat approvals")}</span>)} /><CodexCuSettingsGroup>{cuText(approvedChats.length === 0 ? <CodexCuSettingsEmpty layout="settings-row">None yet</CodexCuSettingsEmpty> : approvedChats.map(chat => <CodexCuSettingsRow key={chat.chatGUID} label={cuText(<span className="codex-cu-settings-medium">{chat.displayName}</span>)} control={<CodexCuButton aria-label={cuText(`Remove ${chat.displayName}`)} color="ghost" disabled={isSaving || !onRequestRemoval} onClick={() => onRequestRemoval?.(chat)} size="icon"><CodexCuIcon name="shared:lot" /></CodexCuButton>} />))}</CodexCuSettingsGroup></div> : null)}</>
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuSettingsSection><CodexCuSettingsSectionHeader title={cuText("Send access")} /><CodexCuSettingsSectionContent className="codex-cu-settings-gap-3">{cuText(content)}</CodexCuSettingsSectionContent></CodexCuSettingsSection></CodexCuI18nProvider>
}

export function CodexCuMessagesSettings({ installed, isLoading, backSlot, read, send, removal, addChat, formatMessage, locale, ...pageProps }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  if (!installed && !isLoading) return null
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuSettingsPage {...pageProps} backSlot={backSlot} title={cuText("Messages")}>{cuText(isLoading && !installed ? <CodexCuSettingsPanelLoading>{cuText("Loading Messages settings…")}</CodexCuSettingsPanelLoading> : <><MessagesSend state={send} /><MessagesRead state={read} /></>)}{cuText(removal ? <CodexCuMessagesRemovalDialog {...removal} /> : null)}{cuText(addChat ? <CodexCuMessagesAddDialog {...addChat} /> : null)}</CodexCuSettingsPage></CodexCuI18nProvider>
}

const searchMessages = {
  loading: 'Searching chats…', error: 'Unable to search chats',
  permissions_pending: 'Finish Messages permission setup, then try again',
  permissions_required: 'Allow Messages permissions to search chats', empty: 'No chats found',
}

function MessagesSearchItem({ chat, disabled, onSelect , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuTooltip tooltipContent={cuText(<div className="codex-cu-settings-search-tooltip">{chat.displayName}</div>)} side="right"><div cmdk-item="" role="option" aria-disabled={disabled || undefined} className={`codex-cu-settings-search-item${disabled ? ' codex-cu-settings-search-disabled' : ''}`} tabIndex={disabled ? undefined : -1} onMouseDown={event => event.preventDefault()} onClick={() => !disabled && onSelect?.(chat)}><div className="codex-cu-settings-search-content"><div className="codex-cu-settings-truncate">{chat.displayName}</div></div></div></CodexCuTooltip></CodexCuI18nProvider>
}

function MessagesSearchRetry({ disabled, onClick , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><button cmdk-item="" type="button" className="codex-cu-settings-search-item codex-cu-settings-search-action" disabled={disabled} onClick={onClick}><span className="codex-cu-settings-search-content"><span className="codex-cu-settings-truncate">Try again</span></span></button></CodexCuI18nProvider>
}

export function CodexCuMessagesAddDialog({ open, onOpenChange, selectedChat, searchValue = '', onSearchChange, onSelectChat, searchOpen, onSearchOpenChange, searchStatus, searchChats, searchMenuStyle, isFetching, onRetrySearch, decision = 'ask', decisionMenuOpen, decisionMenuStyle, onDecisionMenuOpenChange, onDecisionChange, isSaving, onCancel, onAdd, formatMessage, locale, ...dialogProps }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const showSearch = searchOpen && selectedChat == null && searchValue.trim() !== ''
  const error = ['error', 'permissions_pending', 'permissions_required'].includes(searchStatus)
  const message = searchMessages[searchStatus] ?? (searchStatus === 'ready' && searchChats?.length === 0 ? searchMessages.empty : null)
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuDialog {...dialogProps} open={open} onOpenChange={onOpenChange} contentOverflow="visible" size="compact"><CodexCuDialogBody as="form" onSubmit={event => { event.preventDefault(); if (selectedChat != null && !isSaving) onAdd?.(selectedChat, decision) }}>
    <CodexCuDialogSection><CodexCuDialogHeader className="codex-cu-settings-select-none" title={cuText(<CodexCuDialogTitle asChild><span>{cuText("Add a chat")}</span></CodexCuDialogTitle>)} subtitle={cuText(<CodexCuDialogDescription asChild><span>{cuText("Choose whether ChatGPT can use messages from a specific chat to respond to your requests")}</span></CodexCuDialogDescription>)} /></CodexCuDialogSection>
    <CodexCuDialogSection className="codex-cu-settings-gap-3"><div className="codex-cu-settings-stack"><span className="codex-cu-settings-field-label">Chat</span><div className="codex-cu-settings-search-anchor"><CodexCuSettingsInput aria-label="Chat" aria-expanded={showSearch} autoFocus disabled={isSaving} placeholder={cuText("Search chats")} value={selectedChat?.displayName ?? searchValue} onValueChange={onSearchChange} onClick={() => onSearchOpenChange?.(true)} onFocus={() => onSearchOpenChange?.(true)} />{cuText(showSearch ? <CodexCuPopoverSurface open size="anchor" variant="menu" style={{ maxHeight: 'min(250px, var(--radix-popover-content-available-height))', ...searchMenuStyle }} role="presentation"><div role="listbox" aria-busy={isFetching}>{cuText(searchStatus === 'ready' ? searchChats?.map(chat => <MessagesSearchItem key={chat.chatGUID} chat={chat} disabled={isSaving || !onSelectChat} onSelect={onSelectChat} />) : null)}{cuText(message ? <div className="codex-cu-settings-search-message" role="status">{cuText(message)}</div> : null)}{cuText(error && !isFetching ? <MessagesSearchRetry disabled={!onRetrySearch} onClick={onRetrySearch} /> : null)}</div></CodexCuPopoverSurface> : null)}</div></div><div className="codex-cu-settings-stack"><span className="codex-cu-settings-field-label">Read access</span><ControlledMenu aria-label="Read access" options={decisionOptions} value={decision} className="codex-cu-settings-full-trigger" disabled={isSaving} open={decisionMenuOpen} menuStyle={decisionMenuStyle} onOpenChange={onDecisionMenuOpenChange} onChange={onDecisionChange} /></div></CodexCuDialogSection>
    <CodexCuDialogSection><CodexCuDialogFooter><CodexCuButton color="outline" disabled={isSaving || !onCancel} onClick={onCancel} type="button">Cancel</CodexCuButton><CodexCuButton color="primary" disabled={selectedChat == null || isSaving || !onAdd} loading={isSaving} type="submit">Add</CodexCuButton></CodexCuDialogFooter></CodexCuDialogSection>
  </CodexCuDialogBody></CodexCuDialog></CodexCuI18nProvider>
}
