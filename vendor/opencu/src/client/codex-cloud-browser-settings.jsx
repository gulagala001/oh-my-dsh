import React, { cloneElement, isValidElement, useId, useRef } from 'react';
import { CodexCuButton, CodexCuTooltip, CodexCuSpinner } from './codex-cu-primitives.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import {
  CodexCuSettingsPage, CodexCuSettingsSection, CodexCuSettingsSectionContent,
  CodexCuSettingsGroup, CodexCuSettingsRow, CodexCuSettingsActionRow,
  CodexCuSettingsEmpty, CodexCuSettingsSectionFooter, CodexCuSettingsSearch,
  CodexCuSettingsCallout, CodexCuSettingsDisclosureRow, CodexCuSettingsPanelLoading,
} from './codex-cu-settings-primitives.jsx';
import {
  CodexCuDialog, CodexCuDialogBody, CodexCuDialogSection, CodexCuDialogHeader,
  CodexCuDialogTitle, CodexCuDialogDescription, CodexCuDialogFooter,
} from './codex-cu-dialog.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';

// Source ids/defaultMessage strings and exact source spans are retained in
// work/rea-reconstruction/cloud-browser-settings/messages.json. Root injects CSS.
export const CODEX_CLOUD_SAVED_DATA_COPY = Object.freeze({
  "restricted.passwords.count": "Saved passwords ({count})",
  "restricted.passwords.saved": "Saved passwords",
  "restricted.passwords.refresh": "Refresh",
  "restricted.passwords.error": "We couldn’t confirm the latest saved passwords. Refresh to check.",
  "restricted.passwords.loading": "Loading saved passwords…",
  "restricted.passwords.noMatches": "No matching passwords",
  "restricted.passwords.empty": "No saved passwords",
  "restricted.passwords.remove": "Remove password for {site}, {account}",
  "restricted.passwords.searchMore": "Load more passwords to search the rest",
  "restricted.passwords.more": "Load more",
  "restricted.passwords.account": "Account",
  "restricted.passwords.website": "Website",
  "restricted.passwords.savedAt": "Saved",
  "restricted.passwords.delete": "Delete password",
  "restricted.passwords.confirmTitle": "Delete this password?",
  "restricted.passwords.confirmDescription": "This won’t sign you out of the website",
  "restricted.cloudComputer.description": "Manage cloud browsing settings and saved website cookies",
  "restricted.cloudComputer.general.title": "General",
  "restricted.cloudComputer.orbitCookies.dot": "Your dot's cookies",
  "restricted.cloudComputer.orbitCookies.description.dot": "Manage cookies saved by your dot",
  "settings.chatGpt.cloudBrowser.updateError": "Cloud browser settings couldn't be updated",
  "settings.chatGpt.cloudBrowser.permissionUnavailable": "Unavailable",
  "settings.chatGpt.cloudBrowser.permissionLoading": "Loading…",
  "settings.chatGpt.cloudComputer.loadError": "Cloud browser settings couldn't be loaded",
  "settings.chatGpt.cloudComputer.retry": "Retry",
  "settings.chatGpt.cloudBrowser.cookiesDeleteError": "Could not delete browser data",
  "settings.chatGpt.cloudBrowser.cookies.loadError": "Saved cookies couldn't be loaded",
  "settings.chatGpt.cloudBrowser.retry": "Retry",
  "settings.chatGpt.cloudBrowser.cookies.back": "Back",
  "settings.chatGpt.cloudBrowser.cookies.clearTitle": "Clear all cookies?",
  "settings.chatGpt.cloudBrowser.cookies.deleteTitle": "Delete cookies for {hostname}?",
  "settings.chatGpt.cloudBrowser.cookies.deleteDescription": "Cookies saved by the cloud browser will be permanently deleted. Cookies in the browser on your device won't be affected.",
  "settings.chatGpt.cloudBrowser.cookies.deleteSiteDescription": "Site data will be permanently deleted. You will be immediately logged out of all sessions, including those used by active conversations.",
  "settings.chatGpt.cloudBrowser.passkeys.deleteError": "Failed to delete passkey",
  "settings.chatGpt.cloudBrowser.passkeys.loadError": "Passkeys couldn't be loaded",
  "settings.chatGpt.cloudBrowser.passkeys.deleteTitle": "Delete passkey?",
  "settings.chatGpt.cloudBrowser.passkeys.deleteDescription": "Delete the passkey for {account} on {website}? You may lose access to this account.",
  "settings.chatGpt.cloudBrowser.cookies.empty": "No cookies saved",
  "settings.chatGpt.cloudBrowser.cookies": "Cookies",
  "settings.chatGpt.cloudBrowser.cookies.clearDescription": "Remove cookies saved by the cloud browser",
  "settings.chatGpt.cloudBrowser.cookies.clearAll": "Clear all",
  "settings.chatGpt.cloudBrowser.sites": "Sites",
  "settings.chatGpt.cloudBrowser.cookies.deleteSite": "Delete cookies for {site}",
  "settings.chatGpt.cloudBrowser.cookies.deleteHost": "Delete cookies for {hostname} only",
  "settings.chatGpt.cloudBrowser.cookiesCount": "{count, plural, one {# cookie} other {# cookies}}",
  "settings.chatGpt.cloudBrowser.cookies.toggleHosts": "Hosts for {site}",
  "settings.cloudComputer.orbitCookies.unavailable": "No dot found",
  "settings.cloudComputer.orbitCookies.unavailableDescription": "Your dot's cookies will appear here when a dot is available",
  "settings.cloudComputer.orbitCookies.refresh": "Refresh",
  "restricted.cloudComputer.orbitCookies.loadError.dot": "Your dot's cookies couldn't be loaded",
  "restricted.cloudComputer.orbitCookies.clearDescription.dot": "Remove cookies saved by your dot",
  "restricted.cloudComputer.orbitCookies.deleteWarning.dot": "Cookies saved by your dot will be permanently deleted. Your dot may need to sign in to affected websites again.",
  "restricted.cloudComputer.orbitCookies.deleteError.dot": "Your dot's cookies couldn't be deleted. Try again.",
  "restricted.cloudComputer.orbitCookies.clearTitle.dot": "Clear all of your dot's cookies?",
  "restricted.cloudComputer.orbitCookies.deleteTitle.dot": "Delete your dot's cookies for {hostname}?",
  "settings.chatGpt.cloudBrowser.passkeys.empty": "No passkeys saved",
  "settings.chatGpt.cloudBrowser.passkeys.deleteLabel": "Delete passkey for {account} on {website}",
  "settings.chatGpt.cloudBrowser.passkeys.delete": "Delete passkey",
  "settings.chatGpt.cloudBrowser.passkeys.title": "Passkeys",
  "settings.chatGpt.cloudBrowser.delete.cancel": "Cancel",
  "settings.chatGpt.cloudBrowser.delete.confirm": "Delete",
  "skills.pageSearchInput.clear": "Clear search",
  "restricted.passwords.title": "Passwords",
  "restricted.passwords.description": "Manage saved website logins",
  "restricted.passwords.search": "Search passwords",
  "restricted.cloudComputer.title": "Cloud computer",
  "restricted.cloudComputer.cookies": "ChatGPT Work cookies",
  "restricted.cloudComputer.cookies.description": "Manage cookies used by ChatGPT Work",
  "restricted.cloudComputer.approvals.description": "Choose whether ChatGPT Work asks before opening websites. Applies only to ChatGPT Work.",
  "restricted.cloudComputer.approvals": "ChatGPT Work website approvals",
  "settings.panel.loading": "Loading settings…"
});

function message(formatMessage, id, values) {
  const defaultMessage = CODEX_CLOUD_SAVED_DATA_COPY[id];
  if (formatMessage) return formatMessage({ id, defaultMessage }, values);
  if (id === 'settings.chatGpt.cloudBrowser.cookiesCount') {
    const count = values.count;
    return `${new Intl.NumberFormat('en').format(count)} ${count === 1 ? 'cookie' : 'cookies'}`;
  }
  return defaultMessage.replace(/\{([^}]+)\}/g, (_, key) => values?.[key] ?? `{${key}}`);
}

function BackButton({ formatMessage, onBack }) {
  return <CodexCuButton color="ghost" size="toolbar" onClick={onBack}>
    <CodexCuIcon name="shared:p7" />
    {message(formatMessage, 'settings.chatGpt.cloudBrowser.cookies.back')}
  </CodexCuButton>;
}

/** Source delete-dialog y. Reports intent only; deletion and settled state are caller-owned. */
export function CodexCloudSavedDataDeleteDialog({ open = true, title, description, pending = false,
  disabled = false, error, onConfirm, onClose, formatMessage, ...dialogProps }) {
  const previousFocus = useRef(null);
  return <CodexCuDialog {...dialogProps} open={open} size="compact" showDialogClose={!pending}
    onOpenChange={next => { if (!next && !pending) onClose(); }}
    contentProps={{ ...dialogProps.contentProps,
      onOpenAutoFocus: () => { if (document.activeElement instanceof HTMLElement) previousFocus.current = document.activeElement; },
      onCloseAutoFocus: event => { if (previousFocus.current?.isConnected) { event.preventDefault(); previousFocus.current.focus(); } },
    }}>
    <CodexCuDialogBody as="form" onSubmit={event => { event.preventDefault(); if (!pending && !disabled) onConfirm(); }}>
      <CodexCuDialogSection><CodexCuDialogHeader
        title={<CodexCuDialogTitle>{title}</CodexCuDialogTitle>}
        subtitle={<CodexCuDialogDescription>{description}</CodexCuDialogDescription>} />
      </CodexCuDialogSection>
      {error == null ? null : <CodexCuDialogSection><CodexCuSettingsCallout type="error" variant="callout" role="alert" content={error} /></CodexCuDialogSection>}
      <CodexCuDialogSection><CodexCuDialogFooter>
        <CodexCuButton type="button" color="secondary" disabled={pending} onClick={onClose}>
          {message(formatMessage, 'settings.chatGpt.cloudBrowser.delete.cancel')}
        </CodexCuButton>
        <CodexCuButton type="submit" color="danger" loading={pending} disabled={pending || disabled}>
          {message(formatMessage, 'settings.chatGpt.cloudBrowser.delete.confirm')}
        </CodexCuButton>
      </CodexCuDialogFooter></CodexCuDialogSection>
    </CodexCuDialogBody>
  </CodexCuDialog>;
}

/** Source ze; only the masked saved-login summary is accepted, never a password secret. */
export function CodexCloudSavedPasswordDetails({ password, onClose, onRemove, formatMessage,
  formatDate, locale = 'en', ...dialogProps }) {
  const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  const timestamp = password.created_at * 1000;
  const saved = formatDate ? formatDate(timestamp, dateOptions) : new Intl.DateTimeFormat(locale, dateOptions).format(timestamp);
  return <CodexCuDialog {...dialogProps} open size="compact"
    contentProps={{ ...dialogProps.contentProps, 'aria-describedby': undefined }}
    onOpenChange={next => { if (!next) onClose(); }}>
    <CodexCuDialogBody data-dd-privacy="mask">
      <CodexCuDialogSection><CodexCuDialogHeader
        icon={<CodexCuIcon name="shared:z" />}
        title={<CodexCuDialogTitle>{new URL(password.origin).hostname}</CodexCuDialogTitle>} />
      </CodexCuDialogSection>
      <CodexCuDialogSection><CodexCuSettingsGroup>
        <CodexCuSettingsRow label={message(formatMessage, 'restricted.passwords.account')} controlSizing="content"
          control={<span className="codex-cloud-saved-data-select-text">{password.account_label}</span>} />
        <CodexCuSettingsRow label={message(formatMessage, 'restricted.passwords.website')} controlSizing="content"
          control={<span className="codex-cloud-saved-data-break-all codex-cloud-saved-data-select-text">{password.origin}</span>} />
        <CodexCuSettingsRow label={message(formatMessage, 'restricted.passwords.savedAt')} controlSizing="content" control={saved} />
      </CodexCuSettingsGroup></CodexCuDialogSection>
      <CodexCuDialogSection><CodexCuDialogFooter>
        <CodexCuButton color="danger" size="toolbar" onClick={onRemove}>
          {message(formatMessage, 'restricted.passwords.delete')}
        </CodexCuButton>
      </CodexCuDialogFooter></CodexCuDialogSection>
    </CodexCuDialogBody>
  </CodexCuDialog>;
}

export function CodexCloudSavedPasswordDeleteDialog({ password, isPending, onClose, onConfirm, formatMessage, ...dialogProps }) {
  return <CodexCloudSavedDataDeleteDialog {...dialogProps} formatMessage={formatMessage} pending={isPending}
    onClose={onClose} onConfirm={onConfirm}
    title={message(formatMessage, 'restricted.passwords.confirmTitle')}
    description={<span className="codex-cloud-saved-data-break-all" data-dd-privacy="mask">
      {password.origin}<br />{password.account_label}<br />{message(formatMessage, 'restricted.passwords.confirmDescription')}
    </span>} />;
}

/** Source qe/Je. Query, pagination, selection and deletion state are all controlled. */
export function CodexCloudSavedPasswordsSettings({ passwords, identityPending = false, isPending = false,
  isFetching = false, loadError = false, deletePending = false, deleteError = false, hasNextPage = false,
  searchQuery = '', onSearchQueryChange, onRefresh, onLoadMore, onSelectPassword, onRequestDelete,
  selectedPassword, deleteTarget, onCloseDetails, onCloseDelete, onConfirmDelete, passwordManagerSlot,
  formatMessage, formatDate, locale, theme, windowType, dialogProps, ...pageProps }) {
  if (identityPending) return <CodexCuSpinner />;
  const query = searchQuery.trim().toLocaleLowerCase();
  const visiblePasswords = passwords?.filter(item => `${item.origin} ${item.account_label}`.toLocaleLowerCase().includes(query));
  const title = passwords != null && !hasNextPage
    ? message(formatMessage, 'restricted.passwords.count', { count: passwords.length })
    : message(formatMessage, 'restricted.passwords.saved');
  const searchLabel = message(formatMessage, 'restricted.passwords.search');
  return <CodexCuScope as={CodexCuSettingsPage} {...pageProps} theme={theme}
    referenceWindowType={windowType} data-codex-cu-cloud-surface="saved-passwords"
    className={`codex-cloud-saved-passwords ${pageProps.className ?? ''}`.trim()}
    title={message(formatMessage, 'restricted.passwords.title')}
    subtitle={message(formatMessage, 'restricted.passwords.description')}
    stickyControls={<CodexCuSettingsSearch id="saved-password-search" autoFocus={false} inputRole="searchbox"
      label={searchLabel} placeholder={searchLabel} searchQuery={searchQuery} onSearchQueryChange={onSearchQueryChange}
      clearLabel={message(formatMessage, 'skills.pageSearchInput.clear')} />}>
    {passwordManagerSlot}
    <CodexCuSettingsSection title={title} actions={<CodexCuButton color="secondary" size="toolbar"
      disabled={isFetching || deletePending} onClick={onRefresh}>{message(formatMessage, 'restricted.passwords.refresh')}</CodexCuButton>}>
      <CodexCuSettingsSectionContent>
        {loadError || deleteError ? <CodexCuSettingsCallout type="error" variant="callout" role="alert"
          content={message(formatMessage, 'restricted.passwords.error')} /> : null}
        {isFetching ? <div role="status" className="codex-cloud-saved-data-loading-status">
          <CodexCuSpinner />{message(formatMessage, 'restricted.passwords.loading')}
        </div> : null}
        {!isPending && !loadError && visiblePasswords?.length === 0 ? <p className="codex-cloud-saved-data-empty-text">
          {message(formatMessage, query ? 'restricted.passwords.noMatches' : 'restricted.passwords.empty')}
        </p> : null}
        {visiblePasswords?.length > 0 ? <div data-dd-privacy="mask"><CodexCuSettingsGroup>
          {visiblePasswords.map(password => <CodexCuSettingsActionRow key={password.credential_id} edgeRounding="surface"
            icon={<CodexCuIcon name="shared:z" />} label={new URL(password.origin).hostname} description={password.account_label}
            onClick={() => onSelectPassword(password)} trailing={<CodexCuIcon name="shared:K9" />}
            actions={<CodexCuButton color="ghost" size="toolbar" disabled={deletePending} onClick={() => onRequestDelete(password)}
              aria-label={message(formatMessage, 'restricted.passwords.remove', { site: password.origin, account: password.account_label })}>
              <CodexCuIcon name="shared:lot" />
            </CodexCuButton>} />)}
        </CodexCuSettingsGroup></div> : null}
      </CodexCuSettingsSectionContent>
      {hasNextPage ? <CodexCuSettingsSectionFooter>
        {query ? message(formatMessage, 'restricted.passwords.searchMore') : null}
        <CodexCuButton color="secondary" size="toolbar" disabled={isFetching || deletePending} onClick={onLoadMore}>
          {message(formatMessage, 'restricted.passwords.more')}
        </CodexCuButton>
      </CodexCuSettingsSectionFooter> : null}
    </CodexCuSettingsSection>
    {selectedPassword != null && deleteTarget == null ? <CodexCloudSavedPasswordDetails {...dialogProps}
      password={selectedPassword} onClose={onCloseDetails} onRemove={() => onRequestDelete(selectedPassword)}
      formatMessage={formatMessage} formatDate={formatDate} locale={locale} /> : null}
    {deleteTarget == null ? null : <CodexCloudSavedPasswordDeleteDialog {...dialogProps} password={deleteTarget}
      isPending={deletePending} onClose={onCloseDelete} onConfirm={() => onConfirmDelete(deleteTarget.credential_id)} formatMessage={formatMessage} />}
  </CodexCuScope>;
}

/** Source p2c/Ljs loadRemote=false. Unknown registration state is not a globe. */
export function CodexCloudSavedDataFavicon({ hasRegisteredAppIcon, registeredIcon, className = '' }) {
  const classes = `codex-cloud-cookie-icon ${className}`.trim();
  if (hasRegisteredAppIcon === true) return isValidElement(registeredIcon)
    ? cloneElement(registeredIcon, { 'aria-hidden': true, className: `${classes} ${registeredIcon.props.className ?? ''}`.trim() })
    : null;
  if (hasRegisteredAppIcon !== false) return null;
  return <span className={`${classes} codex-cloud-cookie-favicon`}>
    <span className="codex-cloud-cookie-favicon-globe"><CodexCuIcon name="shared:Dtt" /></span>
  </span>;
}

function CookieDomain({ domain, hosts, pending, expanded, onExpandedChange, onRequestDelete,
  renderFavicon, faviconStates, formatMessage, tooltipTarget, tooltipProps }) {
  const contentId = useId();
  const canExpand = hosts.length > 1 || hosts[0]?.hostname !== domain;
  const row = (hostname, count, includeSubdomains) => {
    const tooltip = message(formatMessage, includeSubdomains
      ? 'settings.chatGpt.cloudBrowser.cookies.deleteSite' : 'settings.chatGpt.cloudBrowser.cookies.deleteHost',
    includeSubdomains ? { site: hostname } : { hostname });
    const target = { hostname, includeSubdomains };
    return <CodexCuSettingsRow key={hostname} variant={includeSubdomains ? 'default' : 'nested'} label={hostname}
      icon={renderFavicon ? renderFavicon({ href: `https://${hostname}`, className: 'codex-cloud-cookie-icon', size: 16 })
        : <CodexCloudSavedDataFavicon {...faviconStates?.[hostname]} />}
      description={message(formatMessage, 'settings.chatGpt.cloudBrowser.cookiesCount', { count })}
      control={<>
        {includeSubdomains && canExpand ? <CodexCuButton color="ghost" size="toolbar" aria-controls={contentId}
          aria-expanded={expanded} aria-label={message(formatMessage, 'settings.chatGpt.cloudBrowser.cookies.toggleHosts', { site: domain })}
          onClick={() => onExpandedChange(domain, !expanded)}><CodexCuIcon name={expanded ? 'shared:z9' : 'shared:K9'} /></CodexCuButton> : null}
        <CodexCuTooltip {...tooltipProps} open={tooltipTarget?.hostname === hostname && tooltipTarget?.includeSubdomains === includeSubdomains}
          tooltipContent={tooltip}>
          <CodexCuButton color="ghost" size="toolbar" disabled={pending} aria-label={tooltip} onClick={() => onRequestDelete(target)}>
            <CodexCuIcon name="shared:lot" />
          </CodexCuButton>
        </CodexCuTooltip>
      </>} />;
  };
  return <CodexCuSettingsDisclosureRow contentId={contentId} expanded={canExpand && expanded}
    content={hosts.map(host => row(host.hostname, host.cookie_count, false))}>
    {row(domain, hosts.reduce((total, host) => total + host.cookie_count, 0), true)}
  </CodexCuSettingsDisclosureRow>;
}

/** Source Qe/Ye/st. `surface` distinguishes Work from the user's dot; no device data is read. */
export function CodexCloudBrowserCookiesSettings({ surface = 'work', hosts, isPending = false,
  loadError, canDelete = false, deletePending = false, deleteFailed = false, deleteTarget,
  dotTargetUnavailable = false, isFetching = false, expandedDomains = [], onExpandedChange,
  onBack, onRetry, onRequestDelete, onCloseDelete, onConfirmDelete, renderFavicon, faviconStates,
  formatMessage, tooltipTarget, tooltipProps, dialogProps, theme, windowType, ...pageProps }) {
  const dot = surface === 'dot';
  const title = message(formatMessage, dot ? 'restricted.cloudComputer.orbitCookies.dot' : 'settings.chatGpt.cloudBrowser.cookies');
  const backSlot = <BackButton formatMessage={formatMessage} onBack={onBack} />;
  if (dot && dotTargetUnavailable) return <CodexCuScope as={CodexCuSettingsPage} {...pageProps}
    theme={theme} referenceWindowType={windowType} data-codex-cu-cloud-surface="dot-cookies-unavailable"
    title={title} backSlot={backSlot}>
    <CodexCuSettingsSection><CodexCuSettingsSectionContent><CodexCuSettingsGroup>
      <CodexCuSettingsRow label={message(formatMessage, 'settings.cloudComputer.orbitCookies.unavailable')}
        description={message(formatMessage, 'settings.cloudComputer.orbitCookies.unavailableDescription')}
        control={<CodexCuButton color="secondary" size="toolbar" disabled={isFetching} onClick={onRetry}>
          {message(formatMessage, 'settings.cloudComputer.orbitCookies.refresh')}
        </CodexCuButton>} />
    </CodexCuSettingsGroup></CodexCuSettingsSectionContent></CodexCuSettingsSection>
  </CodexCuScope>;
  const groups = Object.create(null);
  for (const host of hosts ?? []) (groups[host.registrable_domain] ??= []).push(host);
  const pending = !canDelete || deletePending;
  const failure = loadError === true ? message(formatMessage, dot ? 'restricted.cloudComputer.orbitCookies.loadError.dot' : 'settings.chatGpt.cloudBrowser.cookies.loadError') : loadError;
  let content;
  if (isPending) content = <CodexCuSettingsPanelLoading>{message(formatMessage, 'settings.panel.loading')}</CodexCuSettingsPanelLoading>;
  else if (failure != null && failure !== false) content = <CodexCuSettingsRow label={<span role="alert">{failure}</span>}
    control={<CodexCuButton color="secondary" size="toolbar" onClick={onRetry}>{message(formatMessage, 'settings.chatGpt.cloudBrowser.retry')}</CodexCuButton>} />;
  else if (hosts?.length === 0) content = <CodexCuSettingsEmpty align="start" layout="settings-row">{message(formatMessage, 'settings.chatGpt.cloudBrowser.cookies.empty')}</CodexCuSettingsEmpty>;
  else content = <CodexCuSettingsGroup>{Object.entries(groups).map(([domain, items]) => <CookieDomain key={domain}
    domain={domain} hosts={items} pending={pending} expanded={expandedDomains.includes(domain)} onExpandedChange={onExpandedChange}
    onRequestDelete={onRequestDelete} renderFavicon={renderFavicon} faviconStates={faviconStates} formatMessage={formatMessage} tooltipTarget={tooltipTarget} tooltipProps={tooltipProps} />)}</CodexCuSettingsGroup>;
  const description = message(formatMessage, dot ? 'restricted.cloudComputer.orbitCookies.clearDescription.dot' : 'settings.chatGpt.cloudBrowser.cookies.clearDescription');
  const all = deleteTarget === 'all';
  const confirmationTitle = deleteTarget == null ? undefined : message(formatMessage,
    dot ? all ? 'restricted.cloudComputer.orbitCookies.clearTitle.dot' : 'restricted.cloudComputer.orbitCookies.deleteTitle.dot'
      : all ? 'settings.chatGpt.cloudBrowser.cookies.clearTitle' : 'settings.chatGpt.cloudBrowser.cookies.deleteTitle',
    all ? undefined : { hostname: deleteTarget.hostname });
  const confirmationDescription = message(formatMessage, dot ? 'restricted.cloudComputer.orbitCookies.deleteWarning.dot'
    : all ? 'settings.chatGpt.cloudBrowser.cookies.deleteDescription' : 'settings.chatGpt.cloudBrowser.cookies.deleteSiteDescription');
  return <CodexCuScope as={CodexCuSettingsPage} {...pageProps} theme={theme} referenceWindowType={windowType}
    data-codex-cu-cloud-surface={dot ? 'dot-cookies' : 'work-cookies'} backSlot={backSlot} title={title}
    subtitle={dot ? message(formatMessage, 'restricted.cloudComputer.orbitCookies.description.dot') : undefined}>
    <CodexCuSettingsSection><CodexCuSettingsSectionContent><CodexCuSettingsGroup>
      <CodexCuSettingsRow label={title} description={description} control={<CodexCuButton color="danger" size="toolbar"
        disabled={pending} onClick={() => onRequestDelete('all')}>{message(formatMessage, 'settings.chatGpt.cloudBrowser.cookies.clearAll')}</CodexCuButton>} />
    </CodexCuSettingsGroup></CodexCuSettingsSectionContent></CodexCuSettingsSection>
    <CodexCuSettingsSection title={message(formatMessage, 'settings.chatGpt.cloudBrowser.sites')}>
      <CodexCuSettingsSectionContent>{content}</CodexCuSettingsSectionContent>
    </CodexCuSettingsSection>
    {deleteTarget == null ? null : <CodexCloudSavedDataDeleteDialog {...dialogProps} formatMessage={formatMessage}
      title={confirmationTitle} description={confirmationDescription} pending={deletePending} disabled={!canDelete}
      error={dot && deleteFailed ? message(formatMessage, 'restricted.cloudComputer.orbitCookies.deleteError.dot') : undefined}
      onClose={onCloseDelete} onConfirm={() => onConfirmDelete(deleteTarget)} />}
  </CodexCuScope>;
}

/** Source bt. Caller applies the source webauthn_enabled gate and external error toast. */
export function CodexCloudBrowserPasskeysSettings({ passkeys, isPending = false, loadError = false,
  deletePending = false, deleteTarget, onRetry, onRequestDelete, onCloseDelete, onConfirmDelete,
  formatMessage, dialogProps }) {
  let content;
  if (isPending) content = <CodexCuSettingsPanelLoading>{message(formatMessage, 'settings.panel.loading')}</CodexCuSettingsPanelLoading>;
  else if (loadError) content = <CodexCuSettingsRow label={<span role="alert">{message(formatMessage, 'settings.chatGpt.cloudBrowser.passkeys.loadError')}</span>}
    control={<CodexCuButton color="secondary" size="toolbar" onClick={onRetry}>{message(formatMessage, 'settings.chatGpt.cloudBrowser.retry')}</CodexCuButton>} />;
  else if (passkeys?.length === 0) content = <CodexCuSettingsEmpty align="start" layout="settings-row">{message(formatMessage, 'settings.chatGpt.cloudBrowser.passkeys.empty')}</CodexCuSettingsEmpty>;
  else content = <CodexCuSettingsGroup>{passkeys?.map(passkey => {
    const account = passkey.user_display_name || passkey.user_name;
    return <CodexCuSettingsRow key={passkey.credential_id} label={passkey.relying_party_id} description={account}
      control={<CodexCuButton color="danger" size="toolbar" disabled={deletePending} onClick={() => onRequestDelete(passkey)}
        aria-label={message(formatMessage, 'settings.chatGpt.cloudBrowser.passkeys.deleteLabel', { account, website: passkey.relying_party_id })}>
        {message(formatMessage, 'settings.chatGpt.cloudBrowser.passkeys.delete')}
      </CodexCuButton>} />;
  })}</CodexCuSettingsGroup>;
  return <CodexCuSettingsSection title={message(formatMessage, 'settings.chatGpt.cloudBrowser.passkeys.title')}>
    <CodexCuSettingsSectionContent>{content}</CodexCuSettingsSectionContent>
    {deleteTarget == null ? null : <CodexCloudSavedDataDeleteDialog {...dialogProps} formatMessage={formatMessage}
      pending={deletePending} title={message(formatMessage, 'settings.chatGpt.cloudBrowser.passkeys.deleteTitle')}
      description={message(formatMessage, 'settings.chatGpt.cloudBrowser.passkeys.deleteDescription', {
        account: deleteTarget.user_display_name || deleteTarget.user_name, website: deleteTarget.relying_party_id,
      })} onClose={onCloseDelete} onConfirm={() => onConfirmDelete(deleteTarget.credential_id)} />}
  </CodexCuSettingsSection>;
}

/** Source Ge; website policy and 1Password implementations have separate owners. */
export function CodexCloudBrowserSettingsShell({ sitePermissions, cookies, onOpenDotCookies,
  defaultPermissions, passkeys, formatMessage, theme, windowType, ...pageProps }) {
  return <CodexCuScope as={CodexCuSettingsPage} {...pageProps} theme={theme} referenceWindowType={windowType}
    data-codex-cu-cloud-surface="settings" title={message(formatMessage, 'restricted.cloudComputer.title')}
    subtitle={message(formatMessage, 'restricted.cloudComputer.description')}>
    <CodexCuSettingsSection title={message(formatMessage, 'restricted.cloudComputer.general.title')}>
      <CodexCuSettingsSectionContent><CodexCuSettingsGroup>
        {cookies}
        {onOpenDotCookies == null ? null : <CodexCuSettingsActionRow edgeRounding="surface"
          label={message(formatMessage, 'restricted.cloudComputer.orbitCookies.dot')}
          description={message(formatMessage, 'restricted.cloudComputer.orbitCookies.description.dot')}
          onClick={onOpenDotCookies} trailing={<CodexCuIcon name="shared:K9" className="codex-cloud-saved-data-tertiary" />} />}
        {defaultPermissions}
      </CodexCuSettingsGroup></CodexCuSettingsSectionContent>
    </CodexCuSettingsSection>
    {sitePermissions}{passkeys}
  </CodexCuScope>;
}

export function CodexCloudBrowserWorkCookiesSetting({ onOpen, formatMessage }) {
  return <CodexCuSettingsActionRow edgeRounding="surface" onClick={onOpen}
    label={message(formatMessage, 'restricted.cloudComputer.cookies')}
    description={message(formatMessage, 'restricted.cloudComputer.cookies.description')}
    trailing={<CodexCuIcon name="shared:K9" className="codex-cloud-saved-data-tertiary" />} />;
}
