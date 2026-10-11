import React from 'react';
import { CodexCuButton, CodexCuSplitButton, CodexCuMenuSurface, CodexCuMenuItem, CodexCuSpinner } from './codex-cu-primitives.jsx';
import { CodexCuIcon, CodexCuBrowserLogoUrl } from './codex-cu-icons.jsx';
import { CodexCuSettingsPage } from './codex-cu-settings-primitives.jsx';
import { CodexCuApprovalCard } from './codex-app-approval.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';

const p = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cxe-${value}`).join(' ');

export const CODEX_BROWSER_EXTENSION_MESSAGES = Object.freeze({
  installed: { id: 'plugins.browserExtension.installed', defaultMessage: 'Browser extension installed' },
  notInstalled: { id: 'plugins.browserExtension.notInstalled', defaultMessage: 'Browser extension not installed' },
  loading: { id: 'plugins.browserExtension.loading', defaultMessage: 'Use the browser extension for additional control' },
  browserName: { id: 'plugins.browserExtension.name', defaultMessage: 'ChatGPT browser extension' },
  browserDescription: { id: 'plugins.installModal.browserExtension.description', defaultMessage: 'Install this extension to connect ChatGPT to your browser' },
  chromeName: { id: 'plugins.browserExtension.chrome.name', defaultMessage: 'ChatGPT for Chrome' },
  chromeDescription: { id: 'plugins.installModal.codexChrome.description', defaultMessage: 'Install this extension in Chrome to connect ChatGPT to your browser' },
  edgeName: { id: 'plugins.browserExtension.edge.name', defaultMessage: 'ChatGPT for Edge' },
  edgeDescription: { id: 'plugins.installModal.edgeBrowserExtension.description', defaultMessage: 'Install this extension in Edge to connect ChatGPT to your browser' },
  open: { id: 'plugins.installModal.openBrowserExtension', defaultMessage: 'Open' },
  settingsDescription: { id: 'settings.chromeExtension.description', defaultMessage: 'Manage per-site permissions, site tools, history, and CDP access for your browser' },
  settingsLoading: { id: 'settings.panel.loading', defaultMessage: 'Loading settings…' },
  loadError: { id: 'settings.chromeExtension.loadError', defaultMessage: 'Could not load browser extension settings' },
  saveError: { id: 'settings.chromeExtension.saveError', defaultMessage: 'Could not save your change. Check your settings and try again.' },
  conflict: { id: 'settings.chromeExtension.conflict', defaultMessage: 'Your browser settings changed elsewhere. Review the latest settings and try your change again.' },
  retry: { id: 'settings.chromeExtension.retry', defaultMessage: 'Retry' },
  consentAllow: { id: 'browser.controlConsent.allow', defaultMessage: 'Allow' },
  namedConsentTitle: { id: 'browser.controlConsent.namedBrowserTitle', defaultMessage: 'Allow ChatGPT to use your {browserName}?' },
  consentTitle: { id: 'browser.controlConsent.genericBrowserTitle', defaultMessage: 'Allow ChatGPT to use your browser?' },
  consentDescription: { id: 'browser.controlConsent.description', defaultMessage: 'ChatGPT can read your open tabs and take actions in them to help complete your tasks.' },
  reason: { id: 'approvalRequestCard.reasonLabel', defaultMessage: 'Reason' },
  approvalOptions: { id: 'approvalRequestCard.approvalOptions', defaultMessage: 'Approval options' },
  allowConversation: { id: 'approvalRequestCard.allowConversation', defaultMessage: 'Allow this conversation' },
  alwaysAllow: { id: 'approvalRequestCard.alwaysAllow', defaultMessage: 'Always allow' },
  elevatedRisk: { id: 'composer.mcpToolCallApproval.elevatedRiskLabel', defaultMessage: 'Elevated Risk' },
});

function message(formatMessage, descriptor, values) {
  if (formatMessage) return formatMessage(descriptor, values);
  return descriptor.defaultMessage.replace(/\{([^}]+)\}/g, (_, name) => values?.[name] ?? `{${name}}`);
}

export function codexBrowserExtensionSetupMessages(browserFamily) {
  const messages = CODEX_BROWSER_EXTENSION_MESSAGES;
  return browserFamily === 'chrome'
    ? { name: messages.chromeName, description: messages.chromeDescription }
    : browserFamily === 'edge'
      ? { name: messages.edgeName, description: messages.edgeDescription }
      : { name: messages.browserName, description: messages.browserDescription };
}

/** Source qK/EQr query projection. Querying and browser installation remain with the caller. */
export function codexBrowserExtensionStatusFromQuery(query) {
  const installedExtensionId = query?.data?.installedExtensionId ?? null;
  return {
    installUrl: query?.data?.installUrl ?? null,
    installedExtensionId,
    isInstalled: installedExtensionId != null,
    isLoading: query?.isLoading === true,
  };
}

/** Exact connection-status-description c; loading has no colored dot. */
export function CodexBrowserExtensionStatusDescription({ status, formatMessage }) {
  if (status.isLoading) return <>{message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.loading)}</>;
  return (
    <span className={p('inline-flex max-w-full items-center gap-2')}>
      <span className={p('h-2 w-2 shrink-0 rounded-full', status.isInstalled ? 'bg-[var(--app-color-icon-success)]' : 'bg-[var(--app-color-icon-error)]')} />
      <span className={p('min-w-0 truncate')}>
        {message(formatMessage, status.isInstalled ? CODEX_BROWSER_EXTENSION_MESSAGES.installed : CODEX_BROWSER_EXTENSION_MESSAGES.notInstalled)}
      </span>
    </span>
  );
}

/**
 * Source plugin-install-modal _n. `resolveIconUrl` corresponds to source zht/s$;
 * callers may provide the verified bundled logo map, or the extension's own iconUrl.
 */
export function CodexBrowserExtensionSetupIcon({ browserExtension, className, formatMessage, resolveIconUrl = CodexCuBrowserLogoUrl }) {
  const messages = codexBrowserExtensionSetupMessages(browserExtension.browserFamily);
  const iconUrl = browserExtension.iconUrl ?? resolveIconUrl?.(browserExtension.browserFamily);
  const classes = `${p('rounded-2xs')} ${className ?? ''}`.trim();
  const fallback = <CodexCuIcon name="browser:t" className={classes} />;
  if (iconUrl == null) return fallback;
  return <ExtensionLogoImage key={iconUrl} alt={message(formatMessage, messages.name)} className={classes} src={iconUrl} fallback={fallback} />;
}

// Source tK → VWi. Keyed URL changes remount the failed-image state.
function ExtensionLogoImage({ alt, className, src, fallback }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  if (imageFailed) return fallback;
  return <img alt={alt} className={className} src={src} onError={() => setImageFailed(true)} />;
}

/**
 * Controlled source hn. Each extension is { browserFamily, storeUrl, iconUrl? }.
 * `statuses` is the real Map<browserFamily, status> produced by the upstream query.
 * `onOpenStore({browserFamily,url,event})` owns the native/external opening decision.
 */
export function CodexBrowserExtensionSetupRows({
  requiredBrowserExtensions,
  showInstallationStatus,
  statuses = new Map(),
  resolveIconUrl,
  onOpenStore,
  formatMessage,
  className = '',
  theme,
  windowType,
}) {
  if (requiredBrowserExtensions.length === 0) return null;
  return (
    <CodexCuScope theme={theme} referenceWindowType={windowType} className={`${p('flex flex-col')} ${className}`.trim()}>
      {requiredBrowserExtensions.map(extension => {
        const status = showInstallationStatus ? statuses.get(extension.browserFamily) : undefined;
        const messages = codexBrowserExtensionSetupMessages(extension.browserFamily);
        return (
          <div key={extension.browserFamily} className={p('flex min-h-[72px] items-center justify-between gap-4 py-3')}>
            <div className={p('flex min-w-0 flex-1 items-center gap-4')}>
              <span className={p('flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-default bg-surface-secondary')}>
                <CodexBrowserExtensionSetupIcon browserExtension={extension} resolveIconUrl={resolveIconUrl} formatMessage={formatMessage} className={p('size-8 object-contain')} />
              </span>
              <div className={p('min-w-0 flex-1')}>
                <div className={p('truncate text-sm leading-6 font-medium text-default')}>{message(formatMessage, messages.name)}</div>
                <div className={p('truncate text-sm leading-5 text-tertiary')}>{message(formatMessage, messages.description)}</div>
              </div>
            </div>
            {status?.isInstalled === true ? (
              <CodexBrowserExtensionStatusDescription status={status} formatMessage={formatMessage} />
            ) : (
              <CodexCuButton as="a" href={extension.storeUrl ?? undefined} color="outline" size="toolbar" className={p('h-9 min-w-20 shrink-0 justify-center rounded-xl px-3 text-sm')} disabled={extension.storeUrl == null}
                onClick={event => {
                  if (extension.storeUrl == null || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  onOpenStore?.({ browserFamily: extension.browserFamily, url: extension.storeUrl, event });
                }}>
                {message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.open)}
              </CodexCuButton>
            )}
          </div>
        );
      })}
    </CodexCuScope>
  );
}

/** Source Me query gates. Identity is already validated upstream; no account access occurs here. */
export function codexBrowserExtensionSettingsState({ identity, accountsStatus, settingsQuery, requirementsQuery, mutationPending, saveError }) {
  return {
    isError: settingsQuery.isError || requirementsQuery.isError || accountsStatus === 'unavailable',
    isLoading: identity == null || settingsQuery.isPending || requirementsQuery.isPending || accountsStatus === 'loading',
    disabled: settingsQuery.isFetching || requirementsQuery.isFetching || mutationPending,
    retryDisabled: settingsQuery.isFetching || requirementsQuery.isFetching,
    retryAccounts: accountsStatus === 'unavailable',
    saveError,
  };
}

/** The default VV error branch used by Me, with source container 560px layout. */
export function CodexBrowserExtensionError({ children, retryLabel, retryDisabled, onRetry }) {
  return (
    <aside role="alert" className={p('relative isolate flex w-full overflow-hidden bg-surface border text-pretty text-sm shadow-[0_0_2px_0_rgb(0_0_0/5%),0_4px_6px_0_rgb(0_0_0/2%)] lg:mx-auto rounded-3xl electron:border-0 electron:ring-[0.5px] electron:ring-border-strong py-4 ps-5 pe-3 border-text-danger/20 text-danger @container items-start gap-4')}>
      <div aria-hidden="true" className={p('absolute inset-0 -z-10 bg-background-danger-surface/20')} />
      <div className={p('flex h-full w-full gap-3 items-start @min-[560px]:items-center')}>
        <div className={p('flex min-w-0 grow flex-col @min-[560px]:flex-row @min-[560px]:items-center @min-[560px]:justify-between @min-[560px]:gap-8')}>
          <div className={p('flex min-w-0 flex-col flex-1')}>
            <div className={p('flex min-w-0 flex-1 flex-col')}>
              <div className={p('min-w-0 flex-1 electron:leading-relaxed text-pretty')}>{children}</div>
            </div>
          </div>
          {retryLabel == null ? null : (
            <div className={p('flex gap-2 shrink-0 mt-2 min-w-fit @min-[560px]:mt-0')}>
              <CodexCuButton color="outline" className={p('shrink-0')} disabled={retryDisabled} onClick={onRetry}>{retryLabel}</CodexCuButton>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/** qA/QMs loading row. */
export function CodexBrowserExtensionSettingsLoading({ children, formatMessage }) {
  return (
    <div role="status" className={p('flex items-center gap-2 py-2 text-sm text-secondary')}>
      <CodexCuSpinner className={p('icon-xs shrink-0 text-secondary')} />
      <span className={p('text-balance')}>{children === undefined ? message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.settingsLoading) : children}</span>
    </div>
  );
}

/**
 * Source Me presentation gates. `title` is the PA/k6 extension title selected by the host.
 * Site permissions/history/WebMCP/CDP rows belong in children (or renderContent({disabled})).
 * `saveError` is null, 'conflict' or 'error'; the caller owns the original AFt/status-409 check.
 */
export function CodexBrowserExtensionSettings({ title, state, children, renderContent, onRetry, formatMessage, ...pageProps }) {
  return (
    <CodexCuSettingsPage {...pageProps} title={title} subtitle={message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.settingsDescription)}>
      {state.isError ? (
        <CodexBrowserExtensionError retryLabel={message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.retry)} retryDisabled={state.retryDisabled} onRetry={() => onRetry?.({ includeAccounts: state.retryAccounts })}>
          {message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.loadError)}
        </CodexBrowserExtensionError>
      ) : null}
      {!state.isError && state.isLoading ? <CodexBrowserExtensionSettingsLoading formatMessage={formatMessage} /> : null}
      {!state.isError && !state.isLoading ? (
        <>
          {state.saveError == null ? null : <CodexBrowserExtensionError>{message(formatMessage, state.saveError === 'conflict' ? CODEX_BROWSER_EXTENSION_MESSAGES.conflict : CODEX_BROWSER_EXTENSION_MESSAGES.saveError)}</CodexBrowserExtensionError>}
          {renderContent ? renderContent({ disabled: state.disabled }) : children}
        </>
      ) : null}
    </CodexCuSettingsPage>
  );
}

/** Exact source Yt gate; generic tool approvals return null. */
export function codexBrowserControlConsentPresentation(approval) {
  if (approval?.connector_id !== 'browser-use' || approval.tool_name !== 'allow_browser_control' || approval.browser_use_elicitation_id !== 'browser-use-first-time-control') return null;
  const browserName = typeof approval.browser_use_browser_name === 'string' ? approval.browser_use_browser_name.trim() : '';
  return {
    descriptor: browserName ? CODEX_BROWSER_EXTENSION_MESSAGES.namedConsentTitle : CODEX_BROWSER_EXTENSION_MESSAGES.consentTitle,
    description: CODEX_BROWSER_EXTENSION_MESSAGES.consentDescription,
    approveLabel: CODEX_BROWSER_EXTENSION_MESSAGES.consentAllow,
    ...(browserName ? { values: { browserName } } : {}),
  };
}

/** Source yml/hml reason row. The consent's source body contains no link markup. */
function BrowserConsentReason({ children, formatMessage }) {
  return (
    <dl className={p('@container')}>
      <div className={p('grid min-h-[var(--height-token-row)] gap-x-3 gap-y-0.5 py-row-y text-[length:var(--detail-row-font-size,var(--text-base))] leading-5 [@container_(min-width:24rem)]:grid-cols-[var(--detail-property-label-width,120px)_minmax(0,1fr)] grid-cols-1 items-start [@container_(min-width:24rem)]:items-center [--detail-row-font-size:var(--codex-chat-font-size)]')}>
        <dt className={p('flex min-w-0 items-center gap-2 wrap-anywhere text-codex-description')}>{message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.reason)}</dt>
        <dd className={p('m-0 flex min-w-0 items-center wrap-anywhere text-default')}><span className={p('min-w-0')}><span>{children}</span></span></dd>
      </div>
    </dl>
  );
}

/**
 * The source Aml→shared hw/PFi composer split branch. The host must supply its
 * real dropdown renderer: source PFi also has the explicit renderDropdown hook.
 * This component controls no overlay placement, focus service or persistence.
 */
export function CodexBrowserControlConsentSplitAction({
  children,
  onApprove,
  primaryDisabled = false,
  loading = false,
  autoFocus,
  renderDropdown,
  className = '',
  formatMessage,
  ...splitProps
}) {
  return (
    <CodexCuSplitButton {...splitProps} autoFocus={autoFocus} color="primary" size="composer" primaryDisabled={primaryDisabled} loading={loading} type="button" onClick={onApprove} dropdownAlign="end" secondaryAriaLabel={message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.approvalOptions)} className={`${p('min-w-0 @max-md/approval-card:w-full')} ${className}`.trim()} primaryClassName={p('min-w-0 overflow-hidden @max-md/approval-card:flex-1 @max-md/approval-card:justify-center @max-md/approval-card:ps-6')} renderDropdown={renderDropdown}>
      {children}
    </CodexCuSplitButton>
  );
}

/** Source Aml's two Pm.Item choices; caller supplies the original dropdown position/open state. */
export function CodexBrowserControlConsentScopeMenu({ open, onApprove, onAllowConversation, approveDisabled, approveLabel, formatMessage, ...surfaceProps }) {
  return (
    <CodexCuMenuSurface {...surfaceProps} open={open} surface="menu" align="end">
      <div className={p('flex min-w-[160px] flex-col gap-0.5')}>
        <CodexCuMenuItem disabled={approveDisabled} onSelect={onApprove}>{approveLabel ?? message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.consentAllow)}</CodexCuMenuItem>
        <CodexCuMenuItem onSelect={onAllowConversation}>{message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.allowConversation)}</CodexCuMenuItem>
      </div>
    </CodexCuMenuSurface>
  );
}

/**
 * Source Yt/ba → mcp-request-card be/ye → Aml. Header/logo and tool details remain
 * caller supplied. persistModes is source r4(approval.persist), not app request modes.
 * The session branch uses the source Aml primary slot and shared PFi split button.
 * The caller supplies real dropdown open state and positioning through the renderer.
 */
export function CodexBrowserControlConsent({
  approval,
  approvalPresentation,
  headerContent,
  riskLevel,
  subtitle,
  details,
  persistModes = [],
  approveDisabled = false,
  onRespond,
  scopeMenuOpen = false,
  onScopeMenuOpenChange,
  renderScopeLayer,
  renderScopeDropdown,
  ApprovalCard = CodexCuApprovalCard,
  formatMessage,
  ...cardProps
}) {
  // Source be only uses ba/Yt when no explicit approval presentation was supplied.
  if (approvalPresentation != null) return null;
  const presentation = codexBrowserControlConsentPresentation(approval);
  if (presentation == null) return null;
  const reason = message(formatMessage, presentation.description, presentation.values);
  const header = riskLevel === 'high' ? <><CodexCuIcon name="warning" className={p('shrink-0 text-warning')} aria-hidden={false} /><span className={p('font-medium text-warning')}>{message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.elevatedRisk)}</span></> : headerContent;
  const renderApproveAction = cardProps.renderApproveAction ?? (!approveDisabled && persistModes.includes('session') ? ({ children, buttonProps }) => (
    <CodexBrowserControlConsentSplitAction autoFocus={buttonProps.autoFocus} loading={buttonProps.loading} primaryDisabled={buttonProps.disabled} onApprove={() => onRespond('accept', null)} formatMessage={formatMessage} dropdownOpen={scopeMenuOpen} onDropdownOpenChange={onScopeMenuOpenChange} renderLayer={renderScopeLayer} renderDropdown={renderScopeDropdown}
      dropdownContent={<><CodexCuMenuItem disabled={approveDisabled} onSelect={() => onRespond('accept', null)}>{message(formatMessage, presentation.approveLabel, presentation.values)}</CodexCuMenuItem><CodexCuMenuItem onSelect={() => onRespond('accept', 'session')}>{message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.allowConversation)}</CodexCuMenuItem></>}>
      {children}
    </CodexBrowserControlConsentSplitAction>
  ) : undefined);
  return (
    <ApprovalCard {...cardProps} renderApproveAction={renderApproveAction} formatMessage={formatMessage} headerContent={header} title={message(formatMessage, presentation.descriptor, presentation.values)} subtitle={subtitle}
      details={<><BrowserConsentReason formatMessage={formatMessage}>{reason}</BrowserConsentReason>{details}</>}
      actions={{
        approveDisabled,
        approveLabel: message(formatMessage, presentation.approveLabel, presentation.values),
        leadingAction: !approveDisabled && persistModes.includes('always') ? { label: message(formatMessage, CODEX_BROWSER_EXTENSION_MESSAGES.alwaysAllow), onClick: () => onRespond('accept', 'always') } : undefined,
        scopedApproveAction: !approveDisabled && persistModes.includes('session') ? { onClick: () => onRespond('accept', 'session') } : undefined,
        onApprove: () => onRespond('accept', null),
        onDeny: () => onRespond('decline', null),
      }}
    />
  );
}
