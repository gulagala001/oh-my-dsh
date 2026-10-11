import React from 'react';
import { CodexCuButton } from './codex-cu-primitives.jsx';
import { CODEX_COMPUTER_USE_APPROVAL_MESSAGES } from './codex-app-approval.jsx';
import './codex-cu-avatar-overlay.css';

// Rf -> Af -> waiting notification -> c_ -> ag(tool)/cg/dg.
// This is the compact CU waiting request, not the transcript approval card.
// Full sources, offsets and host boundaries: avatar-overlay/manifest.json.
const messages = Object.freeze({
  allow: { id: 'avatarOverlay.waitingRequest.allow', defaultMessage: 'Allow' },
  allowTarget: { id: 'avatarOverlay.waitingRequest.allowTarget', defaultMessage: 'Allow {target}' },
  cancel: { id: 'avatarOverlay.waitingRequest.cancel', defaultMessage: 'Cancel' },
  review: { id: 'avatarOverlay.waitingRequest.review', defaultMessage: 'Review' },
});
function message(formatMessage, descriptor, values) {
  if (formatMessage) return formatMessage(descriptor, values);
  return descriptor.defaultMessage.replace(/\{([^}]+)\}/g, (_, key) => values?.[key] ?? `{${key}}`);
}
const compactText = value => value?.replace(/\s+/g, ' ').trim() || null;

/** `appRequest` is already normalized by the host's Kr boundary. No permission
 * is granted here; returned actions describe the original notification intent. */
export function createCodexCuAvatarApprovalView({ appRequest, requestId, includeCancelAction = false, formatMessage }) {
  if (!appRequest) return null;
  const { connectorName, appDisplayName, subtitle, riskLevel } = appRequest;
  const ariaLabel = message(formatMessage, messages.allowTarget, { target: appDisplayName });
  const accept = { ariaLabel, intent: 'mcp-elicitation', label: message(formatMessage, messages.allow),
    mcpElicitationAction: 'accept', tone: 'primary' };
  return {
    kind: 'tool', requestId, operation: connectorName, target: appDisplayName,
    summary: compactText(subtitle) ?? message(formatMessage, CODEX_COMPUTER_USE_APPROVAL_MESSAGES.title, { appDisplayName }),
    notificationTitleSeparator: '•', title: connectorName,
    actions: riskLevel === 'high'
      ? [{ intent: 'open', label: message(formatMessage, messages.review), tone: 'primary' }]
      : includeCancelAction
        ? [{ intent: 'mcp-elicitation', label: message(formatMessage, messages.cancel), mcpElicitationAction: 'decline', tone: 'secondary' }, accept]
        : [accept],
  };
}

/** Exact CU branch of ag/cg/dg. Expansion is controlled; outer activity-pill
 * material, title, geometry and native measurement remain the host's surface. */
export function CodexCuAvatarApprovalBody({ request, isExpanded = false, onAction,
  subtitleOpacity, prefersReducedMotion = false, hasFixedPresentationHeight = false, style, className = '' }) {
  if (request?.kind !== 'tool') return null;
  const actions = [...request.actions.filter(action => action.tone !== 'primary'),
    ...request.actions.filter(action => action.tone === 'primary')];
  return <div className={`codex-cu-avatar-approval-body ${className}`.trim()}
    data-avatar-overlay-compact-waiting-request="tool" data-avatar-overlay-waiting-request-body="true"
    data-expanded={isExpanded} data-static-height={prefersReducedMotion || hasFixedPresentationHeight}
    style={{ maxHeight: isExpanded ? 180 : 62, opacity: subtitleOpacity, ...style }}>
    <div className="codex-cu-avatar-approval-summary" data-expanded={isExpanded}
      data-avatar-overlay-compact-waiting-summary-text="true" data-avatar-overlay-overflow-content="true">
      {request.summary ?? request.target}
    </div>
    <div className="codex-cu-avatar-approval-actions">
      {actions.map(action => <CodexCuButton key={action.ariaLabel ?? action.label}
        className={`codex-cu-avatar-approval-action${action.tone === 'primary' ? ' codex-cu-avatar-approval-action-primary' : ''}`}
        color={action.tone} size="activityOption" aria-label={action.ariaLabel ?? action.label}
        title={action.ariaLabel ?? action.label} onPointerDown={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); onAction?.(action); }}>
        <span className="codex-cu-avatar-approval-action-label">{action.label}</span>
      </CodexCuButton>)}
    </div>
  </div>;
}

/** CU content for the actual avatar activity surface. There is no fabricated
 * glass/floating fallback. `renderSurface` supplies source-derived native/React
 * material, title typography, positioning, expansion control and measurement. */
export function CodexCuAvatarOverlay({ appRequest, requestId, threadTitle, formatMessage,
  includeCancelAction = true, renderSurface, ...bodyProps }) {
  const request = createCodexCuAvatarApprovalView({ appRequest, requestId, includeCancelAction, formatMessage });
  if (!request || !renderSurface) return null;
  const notificationTitle = `${request.title} ${request.notificationTitleSeparator} ${threadTitle}`;
  return renderSurface({ request, notificationTitle,
    children: <CodexCuAvatarApprovalBody {...bodyProps} request={request} /> });
}
