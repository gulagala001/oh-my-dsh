import { controlCapabilities } from './control-capabilities.mjs';

export const PROTOCOL_VERSION = 1;

// Backend methods return plain data; only the controller adds the public envelope.
export const BACKEND_CONTRACT = Object.freeze({
  listTargets: '({signal?}?) => Promise<Target[]>',
  select: '(reference, {signal?}?) => Promise<Target>',
  observe: '(target, request) => Promise<JSONObject>',
  act: '(target, request) => Promise<JSONObject>',
  release: '({targets}) => Promise<{released:boolean, failures?:JSONObject[], releasedTargetIds?:string[], retiredTargetIds?:string[]}>',
  verify: '(target, {cold?}) => Promise<{valid:boolean, target?:Target, reason?:string}>',
  close: '() => Promise<void | JSONObject>',
});

export const BROWSER_ACTIONS = Object.freeze([
  'navigate', 'back', 'forward', 'reload', 'newTab', 'closeTab', 'activate',
  'click', 'doubleClick', 'move', 'mouseDown', 'mouseUp', 'scroll', 'drag',
  'keyDown', 'keyUp', 'press', 'type', 'fill', 'selectText', 'paste', 'selectOption', 'upload', 'download',
  'cursor', 'hitTest', 'getDOM', 'setText', 'locator', 'domSnapshot', 'navigationState', 'getDialog', 'handleDialog',
  'fileChooserArm', 'fileChooserPoll', 'fileChooserCancel', 'fileChooserSetFiles',
  'clipboardRead', 'clipboardReadText', 'clipboardWrite', 'clipboardWriteText',
]);

// Canonical helper action names. These additions use macOS AX only; other
// native platforms must reject them before dispatch rather than use key events.
export const MACOS_AX_EXTENSIONS = Object.freeze(['select_text', 'paste', 'perform_secondary_action']);

export class OpenCUError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'OpenCUError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function fail(code, message, details) {
  throw new OpenCUError(code, message, details);
}

export function errorJSON(error) {
  return {
    code: error?.code ?? 'BACKEND_ERROR',
    message: error?.message ?? String(error),
    ...(error?.details === undefined ? {} : {details: json(error.details)}),
  };
}

export function inputReleased(result) {
  const empty = value => value == null || Array.isArray(value) && value.length === 0;
  const acknowledged = item => {
    if (!item || !empty(item.failures) || !empty(item.errors) || !empty(item.heldKeys) || !empty(item.heldButtons)) return false;
    if (item.tabs != null && (!Array.isArray(item.tabs) || !item.tabs.every(acknowledged))) return false;
    return Array.isArray(item.released)
      ? item.released.length > 0 && item.released.every(acknowledged)
      : item.released === true;
  };
  return acknowledged(result);
}

const recoverableActionErrors = new Set([
  'STALE_SCREENSHOT', 'STALE_OBSERVATION', 'STALE_ELEMENT', 'OBSERVATION_REQUIRED', 'OBSERVATION_CHANGED', 'RECOVERY_REQUIRED',
  'FRAME_NOT_FOUND', 'FRAME_DETACHED', 'TARGET_NOT_ACTIVE', 'TARGET_WINDOW_NOT_ACTIVE', 'FOREGROUND_REQUIRED',
  'INVALID_ARGUMENT', 'INVALID_ACTION', 'INVALID_COORDINATES', 'INVALID_KEY', 'UNKNOWN_KEY', 'UNSUPPORTED_KEY',
  'INVALID_BUTTON', 'INVALID_SCROLL', 'INVALID_TEXT', 'SCROLL_POINT_REQUIRED',
  'INPUT_ALREADY_HELD', 'RELEASE_REQUIRED', 'UNSUPPORTED_ACTION', 'UNSUPPORTED_OPERATION', 'UNSUPPORTED_COORDINATE_SPACE',
  'UNSUPPORTED_PINCH_ZOOM', 'UNSUPPORTED_URL', 'NO_HISTORY_ENTRY',
  'STALE_FILE_CHOOSER', 'FILE_CHOOSER_BUSY', 'FILE_CHOOSER_NOT_READY', 'FILE_CHOOSER_TIMEOUT', 'UNSUPPORTED_UPLOAD_DIRECTORY', 'UPLOAD_SOURCE_UNAVAILABLE',
  'UNSUPPORTED_CLIPBOARD', 'UNSUPPORTED_CLIPBOARD_FORMAT', 'STALE_CLIPBOARD_DOCUMENT', 'INVALID_CLIPBOARD_STATE',
  'CLIPBOARD_TOO_LARGE', 'CLIPBOARD_ACCESS_FAILED', 'STALE_SITE_TOOL', 'SITE_TOOL_CANCELLED',
  'LOCATOR_NOT_FOUND', 'AMBIGUOUS_LOCATOR', 'UNSUPPORTED_LOCATOR', 'LOCATOR_NOT_ACTIONABLE', 'LOCATOR_NOT_STABLE',
  'ELEMENT_NOT_EDITABLE', 'ELEMENT_NOT_FOUND', 'ELEMENT_DISABLED', 'ELEMENT_NOT_VISIBLE', 'AMBIGUOUS_TEXT', 'TEXT_NOT_FOUND',
  'UNSUPPORTED_PASTE_FORMAT', 'BACKGROUND_SELECTION_UNAVAILABLE', 'BACKGROUND_ACTION_UNAVAILABLE',
  'BACKGROUND_KEYBOARD_UNAVAILABLE', 'BACKGROUND_HIT_TEST_UNAVAILABLE', 'ACTION_UNAVAILABLE', 'VALUE_NOT_SETTABLE',
  'AX_VALUE_NOT_SETTABLE', 'WINDOW_REQUIRED',
  'MODAL_BLOCKED', 'MODAL_STATE_UNAVAILABLE', 'MODAL_POINTER_UNAVAILABLE', 'MODAL_CAPTURE_UNAVAILABLE',
]);

const changedViewErrors = new Set(['STALE_SCREENSHOT', 'STALE_OBSERVATION', 'STALE_ELEMENT', 'OBSERVATION_CHANGED',
  'TARGET_NOT_ACTIVE', 'TARGET_WINDOW_NOT_ACTIVE', 'FRAME_NOT_FOUND', 'FRAME_DETACHED', 'LOCATOR_NOT_STABLE',
  'ELEMENT_NOT_FOUND', 'ELEMENT_NOT_VISIBLE', 'SITE_TOOL_CONTEXT_CHANGED']);
export const changedViewError = error => changedViewErrors.has(error?.code);

/** Only explicit dispatch/terminal receipts can distinguish a recoverable action from unknown input. */
export function recoverableActionError(error, action) {
  const uploadFile = ['upload','fileChooserSetFiles'].includes(action) && ['ENOENT', 'ENOTDIR', 'EISDIR', 'EACCES'].includes(error?.code);
  const siteToolResponded = action === 'invokeSiteTool' && ['SITE_TOOL_ERROR','SITE_TOOL_CANCELLED'].includes(error?.code)
    && error.details?.siteToolResponded === true && error.details.inputDispatched === true;
  const navigationTimedOut = ['navigate','back','forward','reload'].includes(action) && error?.code === 'NAVIGATION_TIMEOUT'
    && error.details?.navigationSettled === true && error.details.inputDispatched === true && inputReleased(error.details.release);
  return (navigationTimedOut || siteToolResponded || error?.details?.inputDispatched === false && (recoverableActionErrors.has(error.code) || uploadFile))
    && (error.details.release === undefined || inputReleased(error.details.release));
}

/** Preserve recovery facts without copying the controller's full target/history snapshot. */
export function controlFailure(result) {
  const error = result.error, state = result.state;
  return Object.assign(new Error(error.message), error, state ? {details: {...error.details, control: {
    mode: state.mode, activeTargetId: state.activeTargetId, releasePending: state.releasePending, explicitlyStopped: state.explicitlyStopped === true,
    ...(state.recoveryIsolated ? {recoveryIsolated:true} : {}),
    ...(state.releaseErrors?.length ? {releaseErrors: state.releaseErrors} : {}),
    recovery: state.explicitlyStopped || state.mode === 'stopped'
      ? 'Explicitly stopped. When the user requests continuation, use cua.resume(targetId) for a verified live target, or cua.resume({browserId}) for a connected browser even when it has no tabs. Then observe before input; never replay uncertain actions.'
      : state.mode === 'active' ? error.details?.recoveryRequired
      ? 'This target is quarantined; other verified browser targets remain usable. Rebind the live target or use cua.resume(targetId), then observe it before continuing. Do not replay uncertain input.'
      : error.details?.observationRequired
      ? 'The view changed and the same binding is retained. Observe the current UI before continuing; do not replay uncertain input.'
      : ['RECOVERY_REQUIRED','RELEASE_FAILED'].includes(error.code)
      ? 'Keep the existing binding. Reconnect and verify this same target with cua.resume(targetId) before continuing.'
      : 'Keep the existing binding. Refresh the relevant observation or correct the rejected action.'
      : state.releasePending ? 'Input release is unconfirmed for the recorded targets. Resume a live target with cua.resume(targetId), or a connected empty browser with cua.resume({browserId}); old browser targets remain quarantined and native input must release. Never replay uncertain input.'
      : 'Inspect the current target, then use cua.resume(targetId), or cua.resume({browserId}) for a connected browser. Automatic cleanup requires recovery, not user-stop approval. Do not replay uncertain input.',
  }}} : {});
}

export function json(value) {
  return JSON.parse(JSON.stringify(value));
}

export function assertBackend(backend, name) {
  for (const method of Object.keys(BACKEND_CONTRACT)) {
    if (typeof backend?.[method] !== 'function') {
      fail('INVALID_BACKEND', `${name}.${method} must be a function`);
    }
  }
}

export function assertTarget(target, backend) {
  if (!target || typeof target.id !== 'string' || !target.id ||
      !target.identity || typeof target.identity !== 'object' ||
      Object.keys(target.identity).length === 0) {
    fail('INVALID_TARGET', `${backend} must provide an id and an occurrence identity`);
  }
  const value = {...target, kind: target.kind ?? backend, backend};
  return json({...value, control: controlCapabilities(value) ?? target.control});
}

export function sameIdentity(left, right) {
  const stable = value => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    }
    return value;
  };
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export function referenceMatches(target, reference) {
  if (typeof reference === 'string') return target.id === reference;
  if (!reference || typeof reference !== 'object') return false;
  const id = reference.targetId ?? reference.id;
  if (id !== undefined && target.id !== id) return false;
  if (reference.kind !== undefined && reference.kind !== target.kind) return false;
  if (reference.backend !== undefined && reference.backend !== target.backend) return false;
  if (reference.url !== undefined && target.url !== reference.url) return false;
  if (reference.title !== undefined && target.title !== reference.title) return false;
  if (reference.browserId !== undefined && target.browserId !== reference.browserId) return false;
  if (reference.bundleId !== undefined && target.bundleId !== reference.bundleId) return false;
  if (reference.windowId !== undefined && String(target.windowId) !== String(reference.windowId)) return false;
  if (reference.provider !== undefined && target.provider !== reference.provider) return false;
  return id !== undefined || reference.url !== undefined || reference.title !== undefined || reference.kind !== undefined || reference.bundleId !== undefined || reference.windowId !== undefined || reference.browserId !== undefined;
}

export function checkExpected(target, expected) {
  if (!expected) return;
  for (const key of ['url', 'title', 'kind', 'identity']) {
    if (expected[key] !== undefined && !sameIdentity(target[key], expected[key])) {
      fail('TARGET_IDENTITY_CHANGED', `Target ${key} does not match the reference`, {expected: expected[key], actual: target[key]});
    }
  }
}

export function checkSignal(signal) {
  if (signal?.aborted) fail('CONTROL_STOPPED', 'Control has been stopped');
}

// Only abandon read-only waits. Input, selection side effects and release must
// still settle before their caller can report an outcome.
export async function readOperation(work, signal) {
  checkSignal(signal);
  let interrupt;
  const interrupted = signal && new Promise((_, reject) => {
    interrupt = () => reject(new OpenCUError('CONTROL_STOPPED', 'Read interrupted by cancellation or shutdown'));
    signal.addEventListener('abort', interrupt, {once: true});
    if (signal.aborted) interrupt();
  });
  try {
    const pending = Promise.resolve().then(() => { checkSignal(signal); return work(); });
    return await (interrupted ? Promise.race([pending, interrupted]) : pending);
  } finally { if (interrupt) signal.removeEventListener('abort', interrupt); }
}

export function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_ARGUMENT', `${name} must be a finite number`);
  return value;
}
