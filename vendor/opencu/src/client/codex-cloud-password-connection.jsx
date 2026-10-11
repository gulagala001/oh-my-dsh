import React from 'react';
import { CodexCuButton } from './codex-cu-primitives.jsx';
import { CodexOnePasswordIconUrl } from './codex-cu-icons.jsx';
import {
  CodexCuSettingsSection,
  CodexCuSettingsSectionHeader,
  CodexCuSettingsSectionContent,
  CodexCuSettingsGroup,
  CodexCuSettingsRow,
} from './codex-cu-settings-primitives.jsx';
import {
  CodexCuDialog,
  CodexCuDialogBody,
  CodexCuDialogHeader,
  CodexCuDialogTitle,
  CodexCuDialogDescription,
  CodexCuDialogSection,
  CodexCuDialogFooter,
} from './codex-cu-dialog.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';

// Root owns CSS loading. Source symbols: settings-62600a386571.js Ne/Pe/Fe.
const p = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `ccp-${value}`).join(' ');

export const CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES = Object.freeze({
  workspaceMismatch: { id: 'settings.chatGpt.cloudBrowser.credentials.workspaceMismatch', defaultMessage: 'Switch back to the workspace where you started connecting 1Password' },
  error: { id: 'settings.chatGpt.cloudBrowser.credentials.error', defaultMessage: 'We couldn’t confirm your connection. Refresh to try again' },
  loading: { id: 'settings.chatGpt.cloudBrowser.credentials.loading', defaultMessage: 'Checking connection…' },
  connected: { id: 'settings.chatGpt.cloudBrowser.credentials.connected', defaultMessage: 'Connected' },
  unavailable: { id: 'settings.chatGpt.cloudBrowser.credentials.unavailable', defaultMessage: '1Password setup isn’t available in this workspace yet' },
  callbackUnconfirmed: { id: 'settings.chatGpt.cloudBrowser.credentials.callbackUnconfirmed', defaultMessage: 'We couldn’t confirm your connection. Connect again to retry' },
  connecting: { id: 'settings.chatGpt.cloudBrowser.credentials.connecting', defaultMessage: 'Connecting… Complete authorization in your browser' },
  reconnect: { id: 'settings.chatGpt.cloudBrowser.credentials.reconnect', defaultMessage: 'Connection needs attention. Connect again to retry' },
  disconnected: { id: 'settings.chatGpt.cloudBrowser.credentials.disconnected', defaultMessage: 'Use selected logins from 1Password when ChatGPT asks you to sign in' },
  title: { id: 'settings.chatGpt.cloudBrowser.credentials.title', defaultMessage: 'Password manager' },
  provider: { id: 'settings.chatGpt.cloudBrowser.credentials.provider', defaultMessage: '1Password' },
  setUp: { id: 'settings.chatGpt.cloudBrowser.credentials.setUp', defaultMessage: 'Set up' },
  disconnect: { id: 'settings.chatGpt.cloudBrowser.credentials.disconnect', defaultMessage: 'Disconnect' },
  refresh: { id: 'settings.chatGpt.cloudBrowser.credentials.refresh', defaultMessage: 'Refresh' },
  choose: { id: 'settings.chatGpt.cloudBrowser.credentials.choose', defaultMessage: 'Set up 1Password?' },
  setupDescription: { id: 'settings.chatGpt.cloudBrowser.credentials.setupDescription', defaultMessage: 'Use selected logins from 1Password when ChatGPT asks you to sign in. You choose which login to share.' },
  popupBlocked: { id: 'settings.chatGpt.cloudBrowser.credentials.popupBlocked', defaultMessage: 'Allow popups to connect 1Password, then try again' },
  connectError: { id: 'settings.chatGpt.cloudBrowser.credentials.connectError', defaultMessage: 'We couldn’t start the connection. Try again' },
  cancelSetup: { id: 'settings.chatGpt.cloudBrowser.credentials.cancelSetup', defaultMessage: 'Cancel' },
  startSetup: { id: 'settings.chatGpt.cloudBrowser.credentials.startSetup', defaultMessage: 'Set up 1Password' },
});

function message(formatMessage, descriptor) {
  return formatMessage ? formatMessage(descriptor) : descriptor.defaultMessage;
}

/** Exact source Pe description priority, derived only from caller-provided snapshots. */
export function codexCloudPasswordConnectionState({
  connection,
  workspaceMismatch = false,
  callbackUnconfirmed = false,
  hasAccountUserId = false,
  isFetching = false,
  queryError = false,
  disconnectPending = false,
  disconnectError = false,
  enrollmentPending = false,
  enrollmentError = false,
}) {
  let description;
  if (workspaceMismatch) description = 'workspaceMismatch';
  else if (queryError || disconnectError || enrollmentError) description = 'error';
  else if (connection == null) description = 'loading';
  else if (connection.state === 'connected') description = 'connected';
  else if (!connection.available || connection.enrollment_url == null) description = 'unavailable';
  else if (callbackUnconfirmed) description = 'callbackUnconfirmed';
  else if (connection.state === 'connecting') description = 'connecting';
  else if (connection.state === 'failed' || connection.state === 'reconnect_required') description = 'reconnect';
  else description = 'disconnected';
  const canEnroll = !workspaceMismatch && Boolean(connection?.available) && connection.enrollment_url != null && hasAccountUserId;
  return {
    description,
    canEnroll,
    showActions: !workspaceMismatch,
    showSetUp: canEnroll && connection?.state !== 'connected',
    showDisconnect: connection != null && connection.state !== 'disconnected',
    setUpDisabled: isFetching || disconnectPending || enrollmentPending,
    disconnectDisabled: disconnectPending || enrollmentPending,
    refreshDisabled: isFetching || disconnectPending || enrollmentPending,
    disconnectLoading: disconnectPending,
    refreshLoading: isFetching,
    submitDisabled: !canEnroll || isFetching || enrollmentPending,
  };
}

/** Source Pe returns Navigate instead of its section while these callback parameters are cleaned. */
export function codexCloudPasswordCallbackCleanup({ workspaceMismatch, callbackAccountPresent, callbackUnconfirmed, connection, isFetching, queryError, disconnectSucceeded }) {
  return !workspaceMismatch && (callbackAccountPresent || callbackUnconfirmed) && ((connection?.state === 'connected' && !isFetching && !queryError) || disconnectSucceeded);
}

// Source app-initial wkt/VWi: image failure renders the supplied empty Fragment.
function PasswordManagerImage({ src, className }) {
  const [failed, setFailed] = React.useState(false);
  if (failed || src == null) return <></>;
  return <img src={src} alt="" className={`${p('object-contain')} ${className ?? ''}`.trim()} onError={() => setFailed(true)} />;
}

/** The exact VV(type=error,variant=callout) branch used inside Pe's chooser. */
function PasswordManagerCallout({ children }) {
  return (
    <aside role="alert" className={p('relative isolate flex w-full overflow-hidden bg-surface border text-pretty text-sm rounded-md px-4 py-3 border-text-danger/20 text-danger @container items-start gap-4')}>
      <div aria-hidden="true" className={p('absolute inset-0 -z-10 bg-background-danger-surface/20')} />
      <div className={p('flex h-full w-full gap-3 items-start @min-[560px]:items-center')}>
        <div className={p('flex min-w-0 grow flex-col @min-[560px]:flex-row @min-[560px]:items-center @min-[560px]:justify-between @min-[560px]:gap-8')}>
          <div className={p('flex min-w-0 flex-col flex-1')}>
            <div className={p('flex min-w-0 flex-1 flex-col')}><div className={p('min-w-0 flex-1')}>{children}</div></div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Source Pe's compact setup dialog. Cancel remains available while authorization starts. */
export function CodexCloudPasswordConnectionSetupDialog({
  open,
  onOpenChange,
  canEnroll,
  isFetching = false,
  enrollmentPending = false,
  enrollmentErrorKind,
  iconUrl = CodexOnePasswordIconUrl,
  onStartSetup,
  onClearUnconfirmedCallback,
  callbackUnconfirmed = false,
  formatMessage,
  ...dialogProps
}) {
  return (
    <CodexCuDialog {...dialogProps} open={open} onOpenChange={onOpenChange} size="compact">
      <CodexCuDialogBody as="form" onSubmit={event => {
        event.preventDefault();
        if (!canEnroll) return;
        if (callbackUnconfirmed) onClearUnconfirmedCallback?.();
        onStartSetup?.();
      }}>
        <CodexCuDialogSection>
          <CodexCuDialogHeader icon={<PasswordManagerImage key={iconUrl} src={iconUrl} className={p('size-full rounded')} />}
            title={<CodexCuDialogTitle>{message(formatMessage, CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES.choose)}</CodexCuDialogTitle>}
            subtitle={<CodexCuDialogDescription>{message(formatMessage, CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES.setupDescription)}</CodexCuDialogDescription>} />
        </CodexCuDialogSection>
        {enrollmentErrorKind == null ? null : <CodexCuDialogSection><PasswordManagerCallout>{message(formatMessage, enrollmentErrorKind === 'popup-blocked' ? CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES.popupBlocked : CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES.connectError)}</PasswordManagerCallout></CodexCuDialogSection>}
        <CodexCuDialogFooter>
          <CodexCuButton type="button" color="secondary" onClick={() => onOpenChange?.(false)}>{message(formatMessage, CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES.cancelSetup)}</CodexCuButton>
          <CodexCuButton type="submit" color="primary" disabled={!canEnroll || isFetching || enrollmentPending} loading={enrollmentPending}>{message(formatMessage, CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES.startSetup)}</CodexCuButton>
        </CodexCuDialogFooter>
      </CodexCuDialogBody>
    </CodexCuDialog>
  );
}

/**
 * Source Ne flag 2244853012 → Pe. Mount at saved-passwords Je's original Ne slot.
 * All snapshots and callbacks come from the host. This component never reads an
 * account, opens authorization, disconnects a provider, or sends credentials.
 * enrollmentErrorKind is the host's source check: L.isError && L.variables===null
 * yields 'popup-blocked'; other L.isError yields 'start-error'.
 */
export function CodexCloudPasswordConnection({
  featureEnabled,
  connection,
  workspaceMismatch = false,
  callbackAccountPresent = false,
  callbackUnconfirmed = false,
  hasAccountUserId = false,
  isFetching = false,
  queryError = false,
  disconnectPending = false,
  disconnectError = false,
  disconnectSucceeded = false,
  enrollmentPending = false,
  enrollmentErrorKind,
  setupOpen = false,
  onSetupOpenChange,
  onResetEnrollment,
  onResetDisconnect,
  onRefresh,
  onDisconnect,
  onStartSetup,
  onClearUnconfirmedCallback,
  callbackCleanupContent = null,
  iconUrl = CodexOnePasswordIconUrl,
  dialogProps,
  formatMessage,
  className,
  theme,
  windowType,
}) {
  if (!featureEnabled) return null;
  if (codexCloudPasswordCallbackCleanup({ workspaceMismatch, callbackAccountPresent, callbackUnconfirmed, connection, isFetching, queryError, disconnectSucceeded })) return callbackCleanupContent;
  const state = codexCloudPasswordConnectionState({ connection, workspaceMismatch, callbackUnconfirmed, hasAccountUserId, isFetching, queryError, disconnectPending, disconnectError, enrollmentPending, enrollmentError: enrollmentErrorKind != null });
  const control = state.showActions ? <div className={p('flex flex-wrap items-center gap-2')}>
    {state.showSetUp ? <CodexCuButton color="secondary" size="toolbar" disabled={state.setUpDisabled} onClick={() => { onResetEnrollment?.(); onSetupOpenChange?.(true); }}>{message(formatMessage, CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES.setUp)}</CodexCuButton> : null}
    {state.showDisconnect ? <CodexCuButton color="secondary" size="toolbar" disabled={state.disconnectDisabled} loading={state.disconnectLoading} onClick={() => onDisconnect?.()}>{message(formatMessage, CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES.disconnect)}</CodexCuButton> : null}
    <CodexCuButton color="secondary" size="toolbar" disabled={state.refreshDisabled} loading={state.refreshLoading} onClick={() => { onResetDisconnect?.(); onResetEnrollment?.(); onRefresh?.(); }}>{message(formatMessage, CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES.refresh)}</CodexCuButton>
  </div> : undefined;
  return (
    <CodexCuScope as={CodexCuSettingsSection} theme={theme} referenceWindowType={windowType} className={className}>
      <CodexCuSettingsSectionHeader title={message(formatMessage, CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES.title)} />
      <CodexCuSettingsSectionContent>
        <CodexCuSettingsGroup><CodexCuSettingsRow icon={<PasswordManagerImage key={iconUrl} src={iconUrl} className={p('size-8 rounded-md')} />} label={message(formatMessage, CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES.provider)} description={message(formatMessage, CODEX_CLOUD_PASSWORD_CONNECTION_MESSAGES[state.description])} control={control} /></CodexCuSettingsGroup>
      </CodexCuSettingsSectionContent>
      <CodexCloudPasswordConnectionSetupDialog {...dialogProps} open={setupOpen} onOpenChange={onSetupOpenChange} canEnroll={state.canEnroll} isFetching={isFetching} enrollmentPending={enrollmentPending} enrollmentErrorKind={enrollmentErrorKind} iconUrl={iconUrl} onStartSetup={onStartSetup} onClearUnconfirmedCallback={onClearUnconfirmedCallback} callbackUnconfirmed={callbackUnconfirmed} formatMessage={formatMessage} />
    </CodexCuScope>
  );
}
