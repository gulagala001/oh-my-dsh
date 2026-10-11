export const PRESENTATIONS_PROTOCOL = 1;
export const MAX_MESSAGE_BYTES = 24 * 1024 * 1024;
export const MAX_PENDING_REQUESTS = 256;
export const MAX_TIMEOUT_MS = 300000;
export const DEFAULT_TIMEOUT_MS = 15000;
export const OWNER_KIND = 'plugin-companion';
export const FLOATING_HOST_ID = 'opencu-native-floating';
export const METHODS = new Set(['nativePresentation.capabilities', 'nativePresentation.owner',
  'nativePresentation.configureOwner', 'nativePresentation.openProducer', 'nativePresentation.retireExitedProducer',
  'nativePresentation.cancelProducer', 'nativePresentation.releaseProducer', 'nativePresentation.producerStatus',
  'nativePresentation.frame', 'nativePresentation.command']);

export const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const nonempty = value => typeof value === 'string' && value.length > 0;
export const positive = value => Number.isSafeInteger(value) && value > 0;
export const fail = (message, code = 'NATIVE_PRESENTATION_UNAVAILABLE') => Object.assign(new Error(message), { code });
export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => {});
  return { promise, resolve, reject };
};

export function jsonValue(value, depth = 0, budget = { entries: 0 }) {
  if (++budget.entries > 65536 || depth > 24) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= MAX_MESSAGE_BYTES;
  if (Array.isArray(value)) return value.length <= 16384 && value.every(item => jsonValue(item, depth + 1, budget));
  if (!record(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  const entries = Object.entries(value);
  return entries.length <= 256 && entries.every(([key, item]) => key.length <= 4096 && jsonValue(item, depth + 1, budget));
}

export function errorValue(error) {
  return { message: error instanceof Error ? error.message : String(error),
    code: typeof error?.code === 'string' ? error.code : 'PROVIDER_ERROR' };
}

export function remoteError(value) {
  if (!record(value) || !nonempty(value.message) || !nonempty(value.code)) return fail('Invalid native provider error', 'INVALID_RESPONSE');
  return fail(value.message, value.code);
}

// The parent owns this inherited socket. No pathname, listener or renderer token is used.
export function createPresentationChannel(stream, onMessage, onClosed) {
  let buffered = Buffer.alloc(0), closed = false, queuedBytes = 0;
  const stop = error => {
    if (closed) return;
    closed = true;
    onClosed(error ?? fail('The native presentation channel closed', 'DISCONNECTED'));
  };
  stream.on('data', chunk => {
    if (closed) return;
    buffered = Buffer.concat([buffered, chunk]);
    while (true) {
      const index = buffered.indexOf(10);
      if (index < 0) break;
      if (index + 1 > MAX_MESSAGE_BYTES) { stop(fail('Native presentation message exceeds its byte limit', 'RESOURCE_LIMIT')); stream.destroy(); return; }
      const line = buffered.subarray(0, index);
      buffered = buffered.subarray(index + 1);
      try {
        const message = JSON.parse(line.toString('utf8'));
        if (!record(message) || !jsonValue(message)) throw fail('Invalid native presentation message', 'INVALID_MESSAGE');
        onMessage(message);
      } catch (error) { stop(error); stream.destroy(); return; }
    }
    if (buffered.length > MAX_MESSAGE_BYTES) { stop(fail('Native presentation message exceeds its byte limit', 'RESOURCE_LIMIT')); stream.destroy(); }
  });
  stream.on('error', stop);
  stream.on('end', () => stop(buffered.length ? fail('The native presentation message was truncated', 'INVALID_MESSAGE') : undefined));
  stream.on('close', () => stop());
  return {
    get closed() { return closed; },
    send(message) {
      if (closed || stream.destroyed || !stream.writable) return Promise.reject(fail('The native presentation channel is unavailable', 'DISCONNECTED'));
      if (!jsonValue(message)) return Promise.reject(fail('The native presentation payload is invalid', 'INVALID_ARGUMENT'));
      const line = JSON.stringify(message) + '\n', bytes = Buffer.byteLength(line);
      if (bytes > MAX_MESSAGE_BYTES || queuedBytes + bytes > MAX_MESSAGE_BYTES * 2) return Promise.reject(fail('The native presentation channel reached its byte limit', 'RESOURCE_LIMIT'));
      queuedBytes += bytes;
      return new Promise((resolve, reject) => {
        stream.write(line, error => {
          queuedBytes -= bytes;
          if (error) { stop(error); reject(error); } else resolve();
        });
      });
    },
    destroy() { stream.destroy(); },
  };
}
