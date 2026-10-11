import React, { useLayoutEffect, useRef } from 'react';
import { CodexCuButton, CodexCuMenuSurface, CodexCuMenuItem, CodexCuToggle, CodexCuTooltip, CodexCuSpinner } from './codex-cu-primitives.jsx';
import { CodexCuSettingsRow, CodexCuSettingsGroup, CodexCuSettingsDropdownTrigger, CodexCuSettingsCheckbox } from './codex-cu-settings-primitives.jsx';
import { CodexCuDialog, CodexCuDialogTitle, CodexCuDialogDescription, CodexCuDialogHeader, CodexCuDialogBody, CodexCuDialogSection, CodexCuDialogFooter } from './codex-cu-dialog.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';

// Exact source-only presentation. No profile query, filesystem access, mutation,
// telemetry, device approval or import service is invoked by these components.
// CSS is injected by the reconstruction root, not this module.
const atlasIconUrl = 'data:image/png;base64,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';
const importLabels = { passwords: 'Saved passwords', cookies: 'Cookies', history: 'Browsing history', extensions: 'Extensions' };
const importingLabels = { passwords: 'Importing saved passwords…', cookies: 'Importing cookies…', history: 'Importing browsing history…', extensions: 'Importing extensions…' };
const extensionReasons = {
  unsupported_installation: 'This type of extension installation isn’t supported',
  managed_extension: 'Managed extensions must be installed by your administrator',
  chrome_component: 'Built-in Chrome components can’t be imported',
  invalid_metadata: 'Chrome’s installation details are missing or invalid',
  missing_files: 'The extension’s files are missing from this Chrome profile',
  invalid_files: 'The extension’s files couldn’t be safely read',
  invalid_manifest: 'The extension’s manifest is invalid or doesn’t match its installation',
  invalid_permissions: 'The saved permissions or enabled state couldn’t be read safely',
  unsupported_permissions: 'The saved site-access restrictions can’t be preserved in Codex',
  copy_failed: 'The extension’s files couldn’t be copied. Check available disk space and try again.',
  blocked_by_policy: 'Blocked by your administrator',
  blocked_by_security: 'Blocked by browser security checks',
  unsupported_requirements: 'This extension requires features that aren’t available in Codex',
  dependency_failed: 'A required shared module is missing or incompatible',
  initialization_failed: 'Codex couldn’t start extension import. Restart Codex and try again.',
  profile_closed: 'The browser profile closed before import finished',
};

export function CodexBrowserImportSourceIcon({ source, className }) {
  if (source === 'atlas') return <img aria-hidden="true" alt="" className={className} src={atlasIconUrl} />;
  if (source === 'chrome') return <CodexCuIcon name="chrome:t" aria-hidden="true" className={className} />;
  return null;
}
export function CodexBrowserImportCategoryIcon({ kind, className = 'codex-browser-import-category-icon' }) {
  const names = { passwords: 'query:v', cookies: 'cookies:t', history: 'history:t', extensions: 'shared:fit' };
  if (kind === 'extensions') return <span className={className}><CodexCuIcon name={names[kind]} /></span>;
  return names[kind] ? <CodexCuIcon name={names[kind]} className={className} /> : null;
}
export function codexBrowserImportProfileKey(profile) { return `${profile.source}:${profile.profilePath}`; }
export function codexBrowserImportProfileLabel(profile) { return `${profile.appName} ${profile.profileName || profile.profileDirectoryName}`; }

export function CodexBrowserImportProfileLabel({ profile }) {
  return <span className="codex-browser-import-profile-label">
    <CodexBrowserImportSourceIcon source={profile.source} className={`codex-browser-import-source-icon${profile.source === 'atlas' ? ' is-atlas' : ''}`} />
    <span className="codex-browser-import-profile-app">{profile.appName}</span>
    <span className="codex-browser-import-profile-name" data-tooltip-overflow-target>{profile.profileName || profile.profileDirectoryName}</span>
  </span>;
}

export function CodexBrowserImportProfilePicker({ disabled = false, isLoading = false, open = false, profiles, selectedProfile,
  onOpenChange, onSelectProfile, tooltipOpen = false, renderMenu }) {
  const oneProfile = profiles?.length === 1;
  const selectedKey = selectedProfile ? codexBrowserImportProfileKey(selectedProfile) : null;
  const label = selectedProfile ? codexBrowserImportProfileLabel(selectedProfile) : undefined;
  const pickerDisabled = !oneProfile && (disabled || !onOpenChange || !onSelectProfile);
  let placeholder = 'No profiles found';
  if (isLoading) placeholder = <><CodexCuSpinner className="codex-browser-import-loading-icon" />Loading profiles…</>;
  else if (selectedProfile) placeholder = <CodexBrowserImportProfileLabel profile={selectedProfile} />;
  const trigger = <CodexCuSettingsDropdownTrigger aria-disabled={oneProfile || undefined} aria-label={label}
    disabled={pickerDisabled} tabIndex={oneProfile ? -1 : undefined} open={open}
    className={`codex-browser-import-profile-trigger${oneProfile ? ' is-single' : ''}`}
    chevronClassName={oneProfile ? 'codex-browser-import-hidden' : undefined}
    onClick={oneProfile ? undefined : () => onOpenChange?.(!open)}>{placeholder}</CodexCuSettingsDropdownTrigger>;
  const menu = <CodexCuMenuSurface open={open && !oneProfile && !pickerDisabled} align="end" contentWidth="menuWide" className="codex-browser-import-profile-menu">
    <div className="codex-browser-import-profile-menu-section">{profiles?.map(profile => <CodexCuMenuItem
      key={codexBrowserImportProfileKey(profile)} aria-label={codexBrowserImportProfileLabel(profile)}
      rightIcon={codexBrowserImportProfileKey(profile) === selectedKey ? <CodexCuIcon name="shared:vpt" /> : undefined}
      onSelect={() => { onSelectProfile?.(profile); onOpenChange?.(false); }}><CodexBrowserImportProfileLabel profile={profile} /></CodexCuMenuItem>)}</div>
  </CodexCuMenuSurface>;
  return <div className="codex-browser-import-picker"><span className="codex-browser-import-from">From</span>
    <div className="codex-browser-import-picker-anchor">
      {oneProfile || disabled || isLoading || label == null ? trigger : <CodexCuTooltip tooltipContent={label} open={tooltipOpen && !open}>{trigger}</CodexCuTooltip>}
      {renderMenu ? renderMenu({ children: menu, align: 'end', contentWidth: 'menuWide', open, disabled: pickerDisabled }) : menu}
    </div>
  </div>;
}

function SelectionRow({ kind, checked, disabled, onChange }) {
  return <CodexCuSettingsRow icon={<CodexBrowserImportCategoryIcon kind={kind} />}
    label={<span className="codex-browser-import-select-none">{importLabels[kind]}</span>}
    control={controlProps => <CodexCuToggle {...controlProps} checked={checked === true}
      disabled={disabled || !onChange} onChange={onChange} />} />;
}

export function CodexBrowserImportElevatedConsent({ checked = false, disabled = false, onChange }) {
  return <div className="codex-browser-import-elevated-consent">
    <p className="codex-browser-import-consent-title">Administrator approval required</p>
    <p className="codex-browser-import-consent-description">Windows protects Chrome cookies and passwords with App-Bound Encryption, so ChatGPT also needs administrator approval</p>
    <label className="codex-browser-import-consent-label"><CodexCuSettingsCheckbox checked={checked} disabled={disabled || !onChange} onCheckedChange={onChange} />
      <span>I understand the app will request administrator approval to import this Chrome data</span>
    </label>
  </div>;
}

export function CodexBrowserImportExtensionConfirmation({ profile, onCancel, onImport }) {
  const title = 'Import unverified extensions?';
  const description = `Codex can’t verify extensions or saved permissions from this ${profile.appName} profile “${profile.profileName}”. If imported, these extensions may run code or access data in Codex. Continue only if you trust the profile.`;
  return <CodexCuDialogBody as="form" onSubmit={event => { event.preventDefault(); onImport?.(); }}>
    <CodexCuDialogTitle className="codex-browser-import-sr-only">{title}</CodexCuDialogTitle>
    <CodexCuDialogDescription className="codex-browser-import-sr-only">{description}</CodexCuDialogDescription>
    <CodexCuDialogSection><CodexCuDialogHeader title={title} subtitle={description} /></CodexCuDialogSection>
    <CodexCuDialogSection><CodexCuDialogFooter>
      <CodexCuButton autoFocus color="secondary" disabled={!onCancel} onClick={onCancel}>Cancel</CodexCuButton>
      <CodexCuButton type="submit" disabled={!onImport}>Import extensions</CodexCuButton>
    </CodexCuDialogFooter></CodexCuDialogSection>
  </CodexCuDialogBody>;
}

export function CodexBrowserImportExtensionFailure({ result }) {
  if (result?.failures != null && result.failures.length > 0) return <ul className="codex-browser-import-extension-failures">
    {result.failures.map((failure, index) => <li key={failure.id ?? index} className="codex-browser-import-extension-failure">
      <div className="codex-browser-import-extension-name">{failure.name || failure.id || 'Unknown extension'}</div>
      {extensionReasons[failure.reason] ?? 'The extension couldn’t be installed'}
    </li>)}
  </ul>;
  if (result?.status === 'failed_to_read') return <>Chrome’s extension settings couldn’t be read. Close Chrome and try again.</>;
  if (result?.status === 'failed_to_copy') return <>{extensionReasons.copy_failed}</>;
  if (result?.status === 'failed_to_initialize') return <>{extensionReasons.initialization_failed}</>;
  return <>Some extensions couldn’t be imported</>;
}

// GHs / KHs / qHs are exact app-initial predicates, including skippedExisting.
function importHasFailure(value) { return (value?.failed ?? 0) > 0 || value?.error != null || value?.status != null && value.status !== 'success' && value.status !== 'missing'; }
function importHasSuccess(value) {
  if (value == null) return false;
  if ((value.imported ?? 0) > 0 || (value.skippedExisting ?? 0) > 0) return true;
  return value.imported == null ? value.status === 'partial-success' || value.status === 'success' && (value.failed ?? 0) === 0 : false;
}
function importResultHasSuccess(result) { return [result.cookies, result.passwords, result.passwords?.profile, result.passwords?.account, result.history, result.extensions].some(importHasSuccess); }
function passwordWarningPermitted(value) {
  return value?.error == null && (value?.status == null || ['success', 'missing', 'partial', 'partial-success'].includes(value.status)) && (value?.status !== 'missing' || (value.failed ?? 0) === 0);
}
function cookieFailure({ accessFailed, showCloseBrowserGuidance, message, partiallyFailed, source }) {
  if (accessFailed) {
    if (message != null) return message;
    if (!showCloseBrowserGuidance) return 'ChatGPT couldn’t access this profile’s cookies. A device security policy may be blocking access';
    if (source === 'chrome') return 'ChatGPT couldn’t access this profile’s cookies. Chrome may still be running in the background. Close Chrome completely and try again. A device security policy may also block access';
    if (source === 'atlas') return 'ChatGPT couldn’t access this profile’s cookies. Atlas may still be running in the background. Close Atlas completely and try again. A device security policy may also block access';
  }
  return partiallyFailed ? 'Some cookies couldn’t be imported' : 'Cookies couldn’t be imported';
}

/** Preserves We result/selection/retry rules; caller supplies only result metadata. */
export function codexBrowserImportResultModel({ activeImportRequest, cookieAccessFailureMessage, importCookies, importExtensions,
  importHistory, importPasswords, isImporting, revealedImportResultRowCount, showCloseBrowserGuidance, result }) {
  const useSelection = isImporting || revealedImportResultRowCount != null;
  const visible = { passwords: useSelection ? importPasswords : result?.passwords != null, cookies: useSelection ? importCookies : result?.cookies != null,
    history: useSelection ? importHistory : result?.history != null, extensions: useSelection ? importExtensions : result?.extensions != null };
  const importing = Object.fromEntries(Object.entries(visible).map(([kind, shown]) => [kind, isImporting && shown && (activeImportRequest?.[`import${kind[0].toUpperCase()}${kind.slice(1)}`] ?? ({ passwords: importPasswords, cookies: importCookies, history: importHistory, extensions: importExtensions })[kind])]));
  const cookieFailed = visible.cookies && result != null && (result.cookies == null || importHasFailure(result.cookies));
  const cookiePartial = cookieFailed && ((result?.cookies?.imported ?? 0) > 0 || result?.cookies?.status === 'partial-success' && result.cookies.imported == null);
  const cookieWarning = cookiePartial && result?.cookies?.error == null && ['success', 'partial-success'].includes(result?.cookies?.status);
  const passwords = [result?.passwords, result?.passwords?.profile, result?.passwords?.account];
  const passwordFailed = visible.passwords && result != null && (result.passwords == null || passwords.some(importHasFailure));
  const passwordAccessFailed = passwords.some(value => value?.status === 'failed_to_copy');
  const passwordPartial = passwordFailed && passwords.some(importHasSuccess);
  const passwordWarning = passwordPartial && (passwords.some(value => (value?.imported ?? 0) > 0) || passwords.some(value => value?.status === 'partial-success' && value.imported == null)) && passwords.every(passwordWarningPermitted);
  const historyFailed = visible.history && result != null && (result.history == null || importHasFailure(result.history));
  const historyWarning = historyFailed && (result?.history?.imported ?? 0) > 0 && result?.history?.status === 'success';
  const extensionsFailed = visible.extensions && result != null && (result.extensions == null || importHasFailure(result.extensions));
  const extensionsSkipped = visible.extensions && (result?.extensions?.skippedInvalid ?? 0) > 0;
  const anyFailed = cookieFailed || passwordFailed || historyFailed || extensionsFailed;
  const anySucceeded = result != null && importResultHasSuccess(result);
  const entirelyFailed = (anyFailed || extensionsSkipped) && !anySucceeded;
  const rows = [
    { kind: 'passwords', failureMessage: passwordFailed ? passwordPartial ? 'Some passwords couldn’t be imported' : passwordAccessFailed ? 'ChatGPT couldn’t access this profile’s passwords. A device security policy may be blocking access' : 'Passwords couldn’t be imported' : undefined,
      importing: importing.passwords, succeeded: passwords.some(importHasSuccess), visible: visible.passwords, warning: passwordWarning },
    { kind: 'cookies', failureMessage: result != null && cookieFailed ? cookieFailure({ accessFailed: result.cookies?.status === 'failed_to_copy', showCloseBrowserGuidance,
      message: cookieAccessFailureMessage, partiallyFailed: cookiePartial, source: result.source }) : undefined, importing: importing.cookies, succeeded: importHasSuccess(result?.cookies), visible: visible.cookies, warning: cookieWarning },
    { kind: 'history', failureMessage: historyFailed ? 'Make sure Chrome is fully closed' : undefined,
      importing: importing.history, succeeded: importHasSuccess(result?.history), visible: visible.history, warning: historyWarning },
    { kind: 'extensions', failureMessage: extensionsFailed || extensionsSkipped ? <CodexBrowserImportExtensionFailure result={result?.extensions} /> : undefined,
      importing: importing.extensions, succeeded: importHasSuccess(result?.extensions), visible: visible.extensions, warning: importHasSuccess(result?.extensions) },
  ].filter(row => row.visible);
  const importingRows = rows.filter(row => row.importing);
  const count = revealedImportResultRowCount ?? 0;
  const title = isImporting ? 'Import from your browser' : entirelyFailed ? 'Import failed' : 'Import complete';
  const description = isImporting ? importingLabels[importingRows[Math.min(count, importingRows.length - 1)]?.kind ?? 'passwords']
    : entirelyFailed ? 'We were unable to import your browsing data' : anySucceeded ? 'Your data is now available in the built-in browser' : 'No browser data was available to import';
  return { title, description, anyFailed, anySucceeded, entirelyFailed,
    hideVisibleDescription: !isImporting && anySucceeded && rows.some(row => row.failureMessage != null && !row.warning),
    rows: rows.map((row, index) => {
      const showSpinner = row.importing && count <= importingRows.indexOf(row);
      return { ...row, showSpinner, failureMessage: showSpinner ? undefined : row.failureMessage, animationDelay: revealedImportResultRowCount == null ? index * .25 : 0 };
    }) };
}

export function CodexBrowserImportResultRow({ animationDelay = 0, failureMessage, kind, succeeded, showSpinner, warning, reducedMotion = false, renderAnimatedStatus }) {
  const labelId = `browser-profile-import-${kind}-result-label`, descriptionId = `browser-profile-import-${kind}-result-description`;
  let name = succeeded ? 'shared:db' : 'shared:EC';
  let tone = succeeded ? 'is-success' : 'is-empty';
  if (failureMessage != null) { name = warning ? 'primary:Ay' : 'shared:Hv'; tone = warning ? 'is-warning' : 'is-failure'; }
  const icon = <CodexCuIcon name={name} className={`codex-browser-import-result-icon ${tone}`} />;
  const rotate = succeeded || failureMessage != null;
  let status = renderAnimatedStatus ? renderAnimatedStatus({ children: icon, animationDelay, rotate,
    reducedMotion, transform: rotate ? ['scale(0.9) rotate(-14deg)', 'scale(1.16) rotate(6deg)', 'scale(0.94) rotate(-3deg)', 'scale(1.04) rotate(1deg)', 'scale(1) rotate(0deg)'] : ['scale(0.9)', 'scale(1.16)', 'scale(0.94)', 'scale(1.04)', 'scale(1)'], times: [0, .38, .62, .82, 1], transformDuration: .5, opacityDuration: .18, ease: 'easeInOut' })
    : <CodexBrowserImportResultAnimation animationDelay={animationDelay} rotate={rotate} reducedMotion={reducedMotion}>{icon}</CodexBrowserImportResultAnimation>;
  if (showSpinner) status = <span className="codex-browser-import-result-status" aria-labelledby={labelId} role="status"><CodexCuSpinner className="codex-browser-import-result-icon" /></span>;
  else if (!succeeded && failureMessage == null) status = <span className="codex-browser-import-result-status" aria-labelledby={labelId} aria-describedby={descriptionId} role="status">{status}</span>;
  let description;
  if (failureMessage != null) description = <div className={warning ? 'codex-browser-import-warning' : 'codex-browser-import-danger'} role={warning ? 'status' : 'alert'}>{failureMessage}</div>;
  else if (!succeeded && !showSpinner) description = <span id={descriptionId} className="codex-browser-import-tertiary">No data was found to import</span>;
  return <div>
    <CodexCuSettingsRow control={status} icon={<CodexBrowserImportCategoryIcon kind={kind} />} label={<span id={labelId}>{importLabels[kind]}</span>} />
    {description != null && <div className="codex-browser-import-result-description">{description}</div>}
  </div>;
}

function CodexBrowserImportResultAnimation({ children, animationDelay, rotate, reducedMotion }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const media = node.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
    let animations = [];
    const update = () => {
      animations.forEach(animation => animation.cancel());
      animations = [];
      node.style.opacity = '1';
      node.style.transform = 'scale(1) rotate(0deg)';
      if (reducedMotion || media?.matches || typeof node.animate !== 'function') return;
      const transform = rotate ? ['scale(0.9) rotate(-14deg)', 'scale(1.16) rotate(6deg)', 'scale(0.94) rotate(-3deg)', 'scale(1.04) rotate(1deg)', 'scale(1) rotate(0deg)']
        : ['scale(0.9)', 'scale(1.16)', 'scale(0.94)', 'scale(1.04)', 'scale(1)'];
      // nt supplies these values; uKe/pKe resolve the unspecified opacity ease
      // to easeOut. Use the same native animation offsets/easing, not a guessed
      // CSS keyframe curve that would apply easing separately per segment.
      animations = [node.animate({ transform, offset: [0, .38, .62, .82, 1] }, { duration: 500, delay: animationDelay * 1000, easing: 'ease-in-out', fill: 'both' }),
        node.animate({ opacity: [0, 1] }, { duration: 180, delay: animationDelay * 1000, easing: 'ease-out', fill: 'both' })];
    };
    update();
    media?.addEventListener?.('change', update);
    return () => { media?.removeEventListener?.('change', update); animations.forEach(animation => animation.cancel()); };
  }, [animationDelay, rotate, reducedMotion]);
  return <span ref={ref} aria-hidden="true" className="codex-browser-import-result-animation">{children}</span>;
}

export function CodexBrowserImportResultBody({ onDone, onRetry, reducedMotion, renderAnimatedStatus, ...props }) {
  const model = codexBrowserImportResultModel(props);
  const { isImporting } = props;
  return <CodexCuDialogBody>
    <CodexCuDialogSection>
      <CodexCuDialogTitle asChild><h2 className="codex-browser-import-sr-only">{model.title}</h2></CodexCuDialogTitle>
      {model.hideVisibleDescription && <CodexCuDialogDescription asChild><div className="codex-browser-import-sr-only">{model.description}</div></CodexCuDialogDescription>}
      <CodexCuDialogHeader title={model.title} subtitle={model.hideVisibleDescription ? undefined : <CodexCuDialogDescription asChild><div>{model.description}</div></CodexCuDialogDescription>} />
    </CodexCuDialogSection>
    <CodexCuDialogSection className="codex-browser-import-result-list"><CodexCuSettingsGroup className="codex-browser-import-no-shrink">
      {model.rows.map(row => <CodexBrowserImportResultRow key={row.kind} {...row} reducedMotion={reducedMotion} renderAnimatedStatus={renderAnimatedStatus} />)}
    </CodexCuSettingsGroup></CodexCuDialogSection>
    <CodexCuDialogSection><CodexCuDialogFooter className="codex-browser-import-footer" expandSingleButton={false}>
      {isImporting && <CodexCuButton color="secondary" disabled onClick={onDone}>Cancel</CodexCuButton>}
      {!isImporting && model.anyFailed && onRetry != null && <CodexCuButton color="secondary" onClick={onRetry}>Retry</CodexCuButton>}
      <CodexCuButton color="primary" disabled={isImporting || !onDone} loading={isImporting} onClick={onDone}>{isImporting ? 'Import' : 'Done'}</CodexCuButton>
    </CodexCuDialogFooter></CodexCuDialogSection>
  </CodexCuDialogBody>;
}

export function CodexBrowserProfileImportBody({ activeImportRequest, cookieAccessFailureMessage, confirmExtensionImport = false,
  elevatedChromeConsent = false, extensionsAvailable = false, importCookies = true, importExtensions = false, importHistory = true,
  importPasswords = true, isImporting = false, isLoadingProfiles = false, showCloseBrowserGuidance = false, profilePickerOpen = false,
  profiles, profilesHaveError = false, revealedImportResultRowCount, requiresElevatedChromeConsent = false, result,
  selectedProfile = profiles?.[0] ?? null, onCancel, onElevatedChromeConsentChange, onImport,
  onImportCookiesChange, onImportExtensionsChange, onImportHistoryChange, onImportPasswordsChange,
  onProfilePickerOpenChange, onRetry, onSelectProfile, profileTooltipOpen, renderProfileMenu, reducedMotion, renderAnimatedStatus }) {
  if (confirmExtensionImport && selectedProfile != null) return <CodexBrowserImportExtensionConfirmation profile={selectedProfile} onCancel={onCancel} onImport={onImport} />;
  const cookies = selectedProfile != null && importCookies, passwords = selectedProfile != null && importPasswords;
  const history = selectedProfile?.source === 'chrome' && importHistory, extensions = extensionsAvailable && importExtensions;
  if (isImporting || result != null) return <CodexBrowserImportResultBody activeImportRequest={activeImportRequest}
    cookieAccessFailureMessage={cookieAccessFailureMessage} importCookies={cookies} importHistory={history} importPasswords={passwords}
    importExtensions={result?.extensions != null || (activeImportRequest?.importExtensions ?? extensions)} isImporting={isImporting}
    revealedImportResultRowCount={revealedImportResultRowCount} showCloseBrowserGuidance={showCloseBrowserGuidance}
    result={result} onDone={onCancel} onRetry={onRetry} reducedMotion={reducedMotion} renderAnimatedStatus={renderAnimatedStatus} />;
  const importDisabled = selectedProfile == null || !cookies && !passwords && !history && !extensions || requiresElevatedChromeConsent && !elevatedChromeConsent;
  return <CodexCuDialogBody as="form" onSubmit={event => { event.preventDefault(); if (!isImporting && !importDisabled) onImport?.(); }}>
    <CodexCuDialogSection><CodexCuDialogTitle asChild><h2 className="codex-browser-import-sr-only">Import from your browser</h2></CodexCuDialogTitle>
      <CodexCuDialogHeader title="Import from your browser" subtitle={<CodexCuDialogDescription asChild><div>Choose data to bring over to the built-in browser</div></CodexCuDialogDescription>} />
    </CodexCuDialogSection>
    <CodexCuDialogSection className="codex-browser-import-selection">
      <CodexBrowserImportProfilePicker disabled={isImporting || !profiles?.length} isLoading={isLoadingProfiles} open={profilePickerOpen}
        profiles={profiles} selectedProfile={selectedProfile} onOpenChange={onProfilePickerOpenChange} onSelectProfile={onSelectProfile}
        tooltipOpen={profileTooltipOpen} renderMenu={renderProfileMenu} />
      {profiles?.length === 0 && <p className="codex-browser-import-guidance">No Chrome or Atlas profiles were found on this device</p>}
      {showCloseBrowserGuidance && selectedProfile != null && <p className="codex-browser-import-guidance">Close {selectedProfile.appName} completely before importing</p>}
      {selectedProfile != null && <CodexCuSettingsGroup>
        <SelectionRow kind="passwords" checked={passwords} disabled={isImporting} onChange={onImportPasswordsChange} />
        <SelectionRow kind="cookies" checked={cookies} disabled={isImporting} onChange={onImportCookiesChange} />
        {selectedProfile.source === 'chrome' && <SelectionRow kind="history" checked={history} disabled={isImporting} onChange={onImportHistoryChange} />}
        {extensionsAvailable && <SelectionRow kind="extensions" checked={extensions} disabled={isImporting} onChange={onImportExtensionsChange} />}
      </CodexCuSettingsGroup>}
      {requiresElevatedChromeConsent && <CodexBrowserImportElevatedConsent checked={elevatedChromeConsent} disabled={isImporting} onChange={onElevatedChromeConsentChange} />}
      {profilesHaveError && <p className="codex-browser-import-profile-error" role="alert">We couldn't load browser profiles. Close and reopen this dialog to try again</p>}
    </CodexCuDialogSection>
    <CodexCuDialogSection><CodexCuDialogFooter className="codex-browser-import-footer">
      <CodexCuButton color="secondary" disabled={isImporting || !onCancel} onClick={onCancel}>Cancel</CodexCuButton>
      <CodexCuButton color="primary" disabled={importDisabled || !onImport} loading={isImporting} type="submit">Import</CodexCuButton>
    </CodexCuDialogFooter></CodexCuDialogSection>
  </CodexCuDialogBody>;
}

export function CodexBrowserProfileImportDialog({ open = false, onClose, dialogProps, ...props }) {
  return <CodexCuDialog {...dialogProps} open={open} size="default" showDialogClose={!props.isImporting && props.result == null}
    onOpenChange={nextOpen => { if (!nextOpen && !props.isImporting) onClose?.(); }}>
    <CodexBrowserProfileImportBody {...props} />
  </CodexCuDialog>;
}
