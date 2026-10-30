import { inspect } from 'node:util';

function releaseDiagnostic(errors) {
  const failures = new Map(), seen = new Set();
  const visit = (value, inherited = {}) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) { let found = false; for (const item of value) found = visit(item, inherited) || found; return found; }
    const context = {...inherited, ...Object.fromEntries(['backend','targetId'].filter(key => typeof value[key] === 'string').map(key => [key,value[key]]))};
    const children = ['failures','errors','result','error','details','cause'].filter(key => value[key] && typeof value[key] === 'object');
    let childFailure = false;
    for (const key of children) childFailure = visit(value[key], context) || childFailure;
    if (childFailure) return true;
    if (typeof value.code !== 'string' && typeof value.message !== 'string') return false;
    const failure = {...context, ...(typeof value.code === 'string' ? {code:value.code} : {}),
      ...(typeof value.message === 'string' ? {message:value.message.slice(0,240)} : {})};
    failures.set(JSON.stringify(failure), failure);
    return true;
  };
  visit(errors);
  const all = [...failures.values()];
  return {releaseFailureCount:all.length || errors.length, releaseFailures:all.slice(0,6),
    ...(all.length > 6 ? {releaseFailuresOmitted:all.length - 6} : {})};
}

// Structured-cloned Errors omit custom fields such as code, details and cause.
export function serializeReplError(error, depth = 0) {
  return { name: error?.name, message: error?.message ?? String(error), code: error?.code, details: error?.details,
    ...(error?.cause && depth < 8 ? { cause: serializeReplError(error.cause, depth + 1) } : {}) };
}
export function deserializeReplError(value) {
  const constructors = { Error, TypeError, RangeError, ReferenceError, SyntaxError, EvalError, URIError };
  const Constructor = Object.hasOwn(constructors, value.name) ? constructors[value.name] : Error;
  const error = new Constructor(value.message);
  return Object.assign(error, value, value.cause ? { cause: deserializeReplError(value.cause) } : {});
}

/** The native tools/PTC error channel renders only message, not custom fields. */
export function toolReplError(error) {
  const details = error?.details ?? {}, control = details.control;
  const diagnostic = Object.fromEntries(['targetId', 'inputDispatched', 'observationRequired', 'recoveryRequired', 'created', 'launched', 'stage', 'notice']
    .filter(key => details[key] !== undefined).map(key => [key, details[key]]));
  if (details.target?.id) diagnostic.targetId = details.target.id;
  if (details.pendingRequests) diagnostic.pendingRequests = details.pendingRequests.slice(0, 8);
  if (control) {
    const {releaseErrors, ...state} = control;
    diagnostic.control = state;
    if (releaseErrors?.length) Object.assign(diagnostic.control, releaseDiagnostic(releaseErrors));
  }
  if (!error?.code && !Object.keys(diagnostic).length) return error;
  const message = `${error?.code ? `[${error.code}] ` : ''}${error?.message ?? String(error)}${Object.keys(diagnostic).length
    ? `\nOpenCU diagnostics: ${JSON.stringify(diagnostic)}` : ''}`;
  const failure = new Error(message, {cause:error});
  if (error && typeof error === 'object') { Object.setPrototypeOf(failure, Object.getPrototypeOf(error)); Object.assign(failure, error); }
  failure.message = message;
  return failure;
}

/** Display text only: API values stay unchanged, and every outputs entry is a string. */
export function replOutput(value) {
  if (typeof value === 'string') return value;
  const describe = () => inspect(value, { customInspect: false, getters: false });
  if (value === undefined || ['bigint', 'function', 'symbol'].includes(typeof value)
    || typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) return describe();
  const nonJSON = Symbol('non-JSON display value');
  try {
    const text = JSON.stringify(value, (_key, item) => {
      if (typeof item === 'bigint' || typeof item === 'number' && (!Number.isFinite(item) || Object.is(item, -0))) throw nonJSON;
      return item;
    });
    return text === undefined ? describe() : text;
  } catch (error) {
    if (error !== nonJSON && !(error instanceof TypeError)) throw error;
    return describe();
  }
}

/** Keep the SDK's error channel while exposing observations produced before the failure. */
export function partialReplError(error, { outputs, images, deliveries, documentation = [] }) {
  const text = outputs.filter(value => !documentation.includes(value));
  if (!text.length && !images.length && !deliveries.length) return error;
  const message = error?.message ?? String(error);
  const partialResult = { ok: false, error: { code: error?.code ?? 'OPENCU_ERROR', message },
    outputs: [...outputs], images: [...images], deliveries: [...deliveries] };
  const attachmentNotice = images.length || deliveries.length
    ? `\nPartial attachments: ${replOutput({ images, deliveries })}` : '';
  const outputMessage = `${message}\n\nPartial output produced before this failure (the call failed; actions were not rolled back, so inspect current state before repeating input):\n${text.join('\n')}${attachmentNotice}`;
  const failure = new Error(outputMessage, { cause: error });
  if (error && typeof error === 'object') {
    Object.setPrototypeOf(failure, Object.getPrototypeOf(error));
    Object.assign(failure, error);
    failure.message = outputMessage;
  }
  failure.details = { ...error?.details, partialResult };
  return failure;
}
