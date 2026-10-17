import { controlCapabilities } from './control-capabilities.mjs';

export const PROTOCOL_VERSION = 1;

// Backend methods return plain data; only the controller adds the public envelope.
export const BACKEND_CONTRACT = Object.freeze({
  listTargets: '() => Promise<Target[]>',
  select: '(reference) => Promise<Target>',
  observe: '(target, request) => Promise<JSONObject>',
  act: '(target, request) => Promise<JSONObject>',
  release: '({targets}) => Promise<{released:boolean, failures?:JSONObject[]}>',
  verify: '(target, {cold?}) => Promise<{valid:boolean, target?:Target, reason?:string}>',
  close: '() => Promise<void | JSONObject>',
});

export const BROWSER_ACTIONS = Object.freeze([
  'navigate', 'back', 'forward', 'reload', 'newTab', 'closeTab', 'activate',
  'click', 'doubleClick', 'move', 'mouseDown', 'mouseUp', 'scroll', 'drag',
  'keyDown', 'keyUp', 'press', 'type', 'fill', 'selectOption', 'upload', 'download',
  'cursor', 'hitTest', 'getDOM', 'setText', 'locator', 'domSnapshot',
]);

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

export function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_ARGUMENT', `${name} must be a finite number`);
  return value;
}
