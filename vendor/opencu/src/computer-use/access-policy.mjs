export const ACCESS_RESOURCES = Object.freeze(['app', 'origin', 'download', 'upload', 'fullCdp', 'webMcp']);
export const ACCESS_SCOPES = Object.freeze(['once', 'turn', 'conversation', 'global']);
export const HOST_APPROVAL_OUTCOMES = Object.freeze(['allowed-once', 'rejected', 'cancelled', 'unavailable']);

function dataObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const descriptors = Object.getOwnPropertyDescriptors(value), result = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!('value' in descriptor)) throw new TypeError(`${label}.${key} must be a data property`);
    Object.defineProperty(result, key, { value: descriptor.value, enumerable: true });
  }
  return result;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function choice(value, values, label) {
  if (!values.includes(value)) throw new TypeError(`${label} must be one of ${values.join(', ')}`);
  return value;
}

function accessIdentity(input) {
  const value = dataObject(input, 'Access identity');
  const result = {
    resource: choice(value.resource, ACCESS_RESOURCES, 'Access resource'),
    target: text(value.target, 'Access target'),
    scope: choice(value.scope, ACCESS_SCOPES, 'Access scope'),
  };
  if (result.scope !== 'global') result.sessionId = text(value.sessionId, 'Access sessionId');
  if (result.scope === 'turn') result.turnId = text(value.turnId, 'Access turnId');
  if (result.scope === 'once') result.callId = text(value.callId, 'Access callId');
  return result;
}

export function normalizeAccessDecision(input) {
  const value = dataObject(input, 'Access decision');
  return Object.freeze({
    ...accessIdentity(value),
    decision: choice(value.decision, ['approve', 'deny'], 'Access decision'),
    source: text(value.source, 'Access decision source'),
  });
}

export function accessDecisionKey(input) {
  const value = accessIdentity(input);
  return JSON.stringify([value.resource, value.target, value.scope, value.sessionId ?? null, value.turnId ?? null, value.callId ?? null]);
}

export function normalizeAccessRuleUpdate(input) {
  const value = dataObject(input, 'Access rule update');
  return Object.freeze({
    action: choice(value.action, ['add', 'remove'], 'Access rule action'),
    kind: choice(value.kind, ['allowed', 'denied'], 'Access rule kind'),
    origin: text(value.origin, 'Access rule origin'),
    resource: choice(value.resource, ACCESS_RESOURCES.filter(resource => resource !== 'app'), 'Access rule resource'),
  });
}

export function accessDecisionFromHostOutcome(outcome, input) {
  const normalized = HOST_APPROVAL_OUTCOMES.includes(outcome) ? outcome : 'unavailable';
  const value = dataObject(input, 'Host access identity');
  const identity = normalized === 'unavailable' ? {
    resource: choice(value.resource, ACCESS_RESOURCES, 'Access resource'),
    target: text(value.target, 'Access target'),
    scope: 'once',
    ...(value.sessionId === undefined ? {} : { sessionId: text(value.sessionId, 'Access sessionId') }),
    ...(value.callId === undefined ? {} : { callId: text(value.callId, 'Access callId') }),
  } : accessIdentity({ ...value, scope: 'once' });
  return Object.freeze({
    ...identity,
    outcome: normalized,
    decision: normalized === 'allowed-once' ? 'approve' : normalized === 'rejected' ? 'deny' : null,
    source: 'dsh-approval',
  });
}

// Called only for an operation already selected for approval by its owner.
// The host owns policy, audit events, cancellation and the available answerers.
export async function requestHostAccessApproval(ctx, exec, details) {
  const value = dataObject(details, 'Host access request');
  const identity = { resource: value.resource, target: value.target, sessionId: exec.agent?.session?.id, callId: exec.callId };
  const approval = ctx.get?.('approval');
  if (!exec.agent || typeof approval?.request !== 'function') return accessDecisionFromHostOutcome('unavailable', identity);
  accessIdentity({ ...identity, scope: 'once' });
  const toolName = text(exec.name, 'Host access toolName');
  const reason = text(value.reason, 'Host access reason');
  const outcome = await approval.request({
    agent: exec.agent,
    toolName,
    callId: exec.callId,
    reason,
    ...(value.displayReason === undefined ? {} : { displayReason: value.displayReason }),
    signal: exec.signal,
  });
  return accessDecisionFromHostOutcome(outcome, identity);
}

function records(input) {
  if (!Array.isArray(input)) throw new TypeError('Access decisions must be an array');
  return input.map(normalizeAccessDecision);
}

// Host allowed-once is never promoted into conversation or global approval.
export function recordAccessDecision(input, decision) {
  const current = records(input), next = normalizeAccessDecision(decision);
  if (next.scope === 'once' || next.source === 'dsh-approval') throw new TypeError('Host one-shot approval cannot be recorded as scoped access');
  const key = accessDecisionKey(next);
  return Object.freeze([...current.filter(item => accessDecisionKey(item) !== key), next]);
}

export function revokeAccessDecision(input, selector) {
  const current = records(input), key = accessDecisionKey(selector);
  return Object.freeze(current.filter(item => accessDecisionKey(item) !== key));
}

export function endAccessTurn(input, sessionId, turnId) {
  text(sessionId, 'Access sessionId'); text(turnId, 'Access turnId');
  return Object.freeze(records(input).filter(item => item.scope !== 'turn' || item.sessionId !== sessionId || item.turnId !== turnId));
}

export function endAccessSession(input, sessionId) {
  text(sessionId, 'Access sessionId');
  return Object.freeze(records(input).filter(item => item.scope === 'global' || item.sessionId !== sessionId));
}
