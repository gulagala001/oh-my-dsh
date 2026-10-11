import React, { forwardRef } from 'react';
import { CodexCuButton } from './codex-cu-primitives.jsx';
import { CodexCuIcon, CodexComputerUsePluginIconUrl } from './codex-cu-icons.jsx';
import './codex-cu-tokens.css';
import './codex-app-approval.css';
import { CodexCuScope } from './codex-cu-scope.jsx';

// Source: computer-use-app-approval-request-card E and app-initial Aml.
// Gate, submission, optimistic first-use state, and failure recovery belong to the caller.
export const CODEX_COMPUTER_USE_APPROVAL_MESSAGES = Object.freeze({
  disclosure: {
    id: 'composer.computerUseAppApproval.disclosure',
    defaultMessage: 'Computer Use lets ChatGPT use apps on your computer. It may take screenshots of app contents while working. You can choose which apps ChatGPT can access, stop actions at any time, and control whether screenshots are used for training.',
  },
  elevatedRisk: {
    id: 'composer.mcpToolCallApproval.elevatedRiskLabel',
    defaultMessage: 'Elevated Risk',
  },
  title: {
    id: 'composer.computerUseAppApproval.title.chatgpt',
    defaultMessage: 'Allow ChatGPT to use {appDisplayName}?',
  },
  alwaysAllow: {
    id: 'composer.computerUseAppApproval.action.alwaysApprove',
    defaultMessage: 'Always allow',
  },
  allowConversation: {
    id: 'composer.computerUseAppApproval.action.approve',
    defaultMessage: 'Allow this conversation',
  },
  allowOnce: {
    id: 'approvalRequestCard.allowOnce',
    defaultMessage: 'Allow once',
  },
  deny: {
    id: 'approvalRequestCard.deny',
    defaultMessage: 'Deny',
  },
});

function message(formatMessage, descriptor, values) {
  if (formatMessage) return formatMessage(descriptor, values);
  return descriptor.defaultMessage.replace(/\{([^}]+)\}/g, (_, name) => values?.[name] ?? `{${name}}`);
}

function ApprovalShortcut({ children, primary = false }) {
  if (children == null) return null;
  return (
    <span className="codex-cu-approval-shortcut">
      <kbd
        aria-hidden="true"
        className={`codex-cu-approval-key${primary ? ' codex-cu-approval-key--primary' : ''}`}
      >
        {children}
      </kbd>
    </span>
  );
}

/**
 * Presentation of the source Aml shell for simple approval actions.
 * The caller owns global shortcut registration and the Fqc focus gate.
 * `surface="avatar-overlay"` is only for the source /avatar-overlay route.
 * `details` accepts already-rendered source detail/Reason rows. Source split
 * approval adapters use renderApproveAction/approveAction in Aml's primary slot.
 * Their menu and external tooltip services remain caller-owned.
 */
export const CodexCuApprovalCard = forwardRef(function CodexCuApprovalCard({
  headerContent,
  title,
  subtitle,
  details,
  body,
  actions,
  renderApproveAction,
  approveAction,
  formatMessage,
  hotkeysEnabled = false,
  approveShortcut,
  denyShortcut,
  focusAllowed = false,
  surface = 'standard',
  theme,
  windowType,
  className = '',
  ...surfaceProps
}, ref) {
  const loading = actions.isLoading === true;
  const showShortcuts = hotkeysEnabled && actions.disableHotkeys !== true && !loading;
  const approveLabel = actions.approveLabel ?? message(formatMessage, CODEX_COMPUTER_USE_APPROVAL_MESSAGES.allowOnce);
  const denyLabel = actions.denyLabel ?? message(formatMessage, CODEX_COMPUTER_USE_APPROVAL_MESSAGES.deny);
  const approveChildren = <>
    <span className="codex-cu-approval-action-label">{approveLabel}</span>
    {showShortcuts && actions.approveDisabled !== true ? (
      <ApprovalShortcut primary>{approveShortcut}</ApprovalShortcut>
    ) : null}
  </>;
  const approveButtonProps = {
    autoFocus: focusAllowed,
    allowShrink: true,
    className: 'codex-cu-approval-action codex-cu-approval-action--shrink',
    color: 'primary',
    disabled: actions.approveDisabled,
    loading,
    size: 'composer',
    type: 'submit',
  };
  const sourceApproveAction = approveAction ?? (renderApproveAction
    ? renderApproveAction({ children: approveChildren, buttonProps: approveButtonProps, scopedApproveAction: actions.scopedApproveAction })
    : <CodexCuButton {...approveButtonProps}>{approveChildren}</CodexCuButton>);

  return (
    <CodexCuScope
      {...surfaceProps}
      ref={ref}
      referenceWindowType={windowType}
      theme={theme}
      data-codex-approval-surface="true"
      data-codex-cu-approval-surface={surface}
      data-avatar-overlay-material={surface === 'avatar-overlay' ? 'css' : undefined}
      data-avatar-overlay-material-variant={surface === 'avatar-overlay' ? 'transcript-card' : undefined}
      className={`codex-cu-approval-card ${className}`.trim()}
    >
      <div className="codex-cu-approval-content">
        <div aria-atomic="true" role="alert">
          <div className="codex-cu-approval-heading">
            {headerContent == null ? null : (
              <div className="codex-cu-approval-header">{headerContent}</div>
            )}
            <div className="codex-cu-approval-copy">
              <div className="codex-cu-approval-title">{title}</div>
              {subtitle == null ? null : (
                <div className="codex-cu-approval-subtitle">{subtitle}</div>
              )}
            </div>
          </div>
        </div>
        {details == null ? null : <div className="codex-cu-approval-details">{details}</div>}
      </div>
      {body}
      <form
        className="codex-cu-approval-actions"
        onSubmit={event => {
          event.preventDefault();
          if (!loading && actions.approveDisabled !== true) actions.onApprove(event.timeStamp);
        }}
      >
        {actions.leadingAction == null ? null : (
          <CodexCuButton
            allowShrink
            className="codex-cu-approval-action codex-cu-approval-action--shrink"
            color="outline"
            disabled={loading}
            size="composer"
            onClick={event => actions.leadingAction.onClick(event.timeStamp)}
          >
            <span className="codex-cu-approval-action-label">
              {actions.leadingAction.label ?? message(formatMessage, CODEX_COMPUTER_USE_APPROVAL_MESSAGES.alwaysAllow)}
            </span>
          </CodexCuButton>
        )}
        <div className="codex-cu-approval-trailing-actions">
          <CodexCuButton
            className="codex-cu-approval-action"
            color="outline"
            disabled={loading}
            size="composer"
            onClick={event => actions.onDeny(event.timeStamp)}
          >
            {denyLabel}
            {showShortcuts ? <ApprovalShortcut>{denyShortcut}</ApprovalShortcut> : null}
          </CodexCuButton>
          {sourceApproveAction}
        </div>
      </form>
    </CodexCuScope>
  );
});

/**
 * Controlled reconstruction of E. `request` must be the source normalized app
 * request: { appDisplayName, connectorName, persistModes, riskLevel, subtitle }.
 * `onRespond(action, persist)` reports intent only; it does not grant permission.
 * The original failure state clears isLoading and does not render an error banner.
 */
export function CodexComputerUseAppApproval({
  request,
  hasApprovedApp = false,
  isLoading = false,
  onRespond,
  formatMessage,
  ...cardProps
}) {
  const elevatedRisk = request.riskLevel === 'high';
  const subtitle = [
    hasApprovedApp === false ? message(formatMessage, CODEX_COMPUTER_USE_APPROVAL_MESSAGES.disclosure) : undefined,
    request.subtitle,
  ].filter(Boolean).join('\n\n') || undefined;
  const headerContent = elevatedRisk ? (
    <>
      <CodexCuIcon name="warning" className="codex-cu-approval-warning-icon" aria-hidden={false} />
      <span className="codex-cu-approval-risk-label">
        {message(formatMessage, CODEX_COMPUTER_USE_APPROVAL_MESSAGES.elevatedRisk)}
      </span>
    </>
  ) : (
    <>
      <img
        alt=""
        className="codex-cu-approval-app-icon"
        draggable={false}
        src={CodexComputerUsePluginIconUrl}
      />
      <span>{request.connectorName}</span>
    </>
  );

  return (
    <CodexCuApprovalCard
      {...cardProps}
      formatMessage={formatMessage}
      headerContent={headerContent}
      title={message(formatMessage, CODEX_COMPUTER_USE_APPROVAL_MESSAGES.title, { appDisplayName: request.appDisplayName })}
      subtitle={subtitle ? <span className="codex-cu-approval-disclosure">{subtitle}</span> : undefined}
      actions={{
        isLoading,
        leadingAction: request.persistModes.includes('always') ? {
          label: message(formatMessage, CODEX_COMPUTER_USE_APPROVAL_MESSAGES.alwaysAllow),
          onClick: () => onRespond('accept', 'always'),
        } : undefined,
        approveLabel: message(formatMessage, CODEX_COMPUTER_USE_APPROVAL_MESSAGES.allowConversation),
        onApprove: () => onRespond('accept', request.persistModes.includes('session') ? 'session' : null),
        onDeny: () => onRespond('decline', null),
      }}
    />
  );
}
