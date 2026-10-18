import { inspect } from 'node:util';

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
