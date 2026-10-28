import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { NativeBackendError } from './protocol.mjs';

export function createHelperTransport(command, args, { env, timeout = 30000, exitTimeout = 5000, onEvent, onExit } = {}) {
  const child = spawn(command, args, { env: env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let nextId = 1, ended = false, stderr = '', terminalError, exitResult, closing, closeRequested = false;
  const exited = new Promise(resolve => child.once('close', (code, signal) => {
    exitResult = {code, signal}; resolve(exitResult);
  }));
  async function waitForExit() {
    let timer;
    try {
      return await Promise.race([exited, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new NativeBackendError('HELPER_EXIT_TIMEOUT', 'Native helper has not exited; input recovery state is retained.', {stderr})), exitTimeout);
      })]);
    } finally { clearTimeout(timer); }
  }
  const pending = new Map();
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
  function fail(error) {
    ended = true;
    terminalError ??= error;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    pending.clear();
    // Every terminal stream failure asks the helper to drain its held-input journal.
    // Process death is not a substitute for a confirmed release.
    child.stdin.end();
  }
  function notify(callback, value) {
    // Presentation/activity consumers are advisory and never own input completion.
    try { Promise.resolve(callback?.(value)).catch(() => {}); } catch {}
  }
  child.on('error', error => fail(new NativeBackendError('HELPER_START_FAILED', error.message)));
  child.stdin.on('error', error => fail(new NativeBackendError('HELPER_WRITE_FAILED', error.message)));
  child.on('exit', (code, signal) => notify(onExit, {code, signal}));
  child.on('close', (code, signal) => {
    fail(new NativeBackendError('HELPER_EXITED', 'Native helper exited.', { code, signal, stderr }));
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('close', () => {
    if (!ended) fail(new NativeBackendError('HELPER_EOF', 'Native helper closed its response stream; pending input outcome is unknown.', {stderr}));
  });
  child.stdout.on('error', error => fail(new NativeBackendError('HELPER_READ_FAILED', error.message)));
  lines.on('line', line => {
    if (ended) return;
    let value;
    try { value = JSON.parse(line); } catch { fail(new NativeBackendError('HELPER_PROTOCOL', 'Native helper returned invalid JSON.', { line })); return; }
    const object = value && typeof value === 'object' && !Array.isArray(value);
    const event = object && Object.hasOwn(value, 'event');
    if (!object || (event ? !value.event || typeof value.event !== 'object' || Array.isArray(value.event) : !Number.isSafeInteger(value.id) || typeof value.ok !== 'boolean')) {
      fail(new NativeBackendError('HELPER_PROTOCOL', 'Native helper returned an invalid response envelope.', {line})); return;
    }
    if (event) { notify(onEvent, value.event); return; }
    const entry = pending.get(value.id);
    if (!entry) {
      if (value.ok === false && value.id === 0) fail(new NativeBackendError(value.error?.code ?? 'HELPER_START_FAILED', value.error?.message ?? 'Native helper startup failed.', value.error?.details));
      return;
    }
    pending.delete(value.id); clearTimeout(entry.timer);
    if (value.ok) entry.resolve(value.result);
    else entry.reject(new NativeBackendError(value.error?.code ?? 'NATIVE_FAILURE', value.error?.message ?? 'Native operation failed.', value.error?.details));
  });
  function request(method, params = {}, { monitoring = false, timeoutMs = timeout } = {}, internalClose = false) {
    if (closeRequested && !internalClose) return Promise.reject(new NativeBackendError('HELPER_CLOSING', 'Native helper is closing; no new request was dispatched.', {inputDispatched: false}));
    if (ended) return Promise.reject(terminalError ?? new NativeBackendError('HELPER_EXITED', 'Native helper is not running.', { stderr }));
    const id = nextId++;
    let payload;
    try { payload = JSON.stringify({id, method, params}) + '\n'; }
    catch (error) { return Promise.reject(new NativeBackendError('INVALID_REQUEST', error.message, {inputDispatched: false})); }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (monitoring) {
          pending.delete(id);
          reject(new NativeBackendError('PRESENTATION_TIMEOUT', `Native ${method} timed out; monitoring is unavailable.`, { method }));
          return;
        }
        fail(new NativeBackendError('HELPER_TIMEOUT', `Native ${method} timed out; input outcome is unknown and release was requested.`, { method }));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        child.stdin.write(payload, error => {
          if (error) fail(new NativeBackendError('HELPER_WRITE_FAILED', error.message));
        });
      } catch (error) { fail(new NativeBackendError('HELPER_WRITE_FAILED', error.message)); }
    });
  }
  return {
    request,
    get pid() { return child.pid; },
    get ended() { return ended; },
    close() {
      if (closing) return closing;
      closeRequested = true;
      closing = (async () => {
        let failure;
        if (!ended) {
          try { await request('close', {}, {}, true); }
          catch (error) { failure = error; }
        }
        child.stdin.end();
        const result = exitResult ?? await waitForExit();
        lines.close();
        if (result.code !== 0 || result.signal) throw failure ?? new NativeBackendError('HELPER_EXITED', 'Helper release could not be confirmed.', {...result, stderr, cause: terminalError?.toJSON()});
        if (failure) throw failure;
      })().finally(() => { closing = undefined; });
      return closing;
    },
    async disconnect() {
      // Internal crash/EOF path, not a successful public release. The helper's journal survives failure.
      closeRequested = true;
      child.stdin.end();
      const result = await waitForExit();
      lines.close();
      return {...result, stderr};
    },
  };
}
