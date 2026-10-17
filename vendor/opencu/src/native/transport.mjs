import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { NativeBackendError } from './protocol.mjs';

export function createHelperTransport(command, args, { env, timeout = 30000, onEvent, onExit } = {}) {
  const child = spawn(command, args, { env: env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let nextId = 1, ended = false, stderr = '', terminalError, exitResult;
  const exited = new Promise(resolve => child.once('close', (code, signal) => {
    exitResult = {code, signal}; resolve(exitResult);
  }));
  async function waitForExit() {
    let timer;
    try {
      return await Promise.race([exited, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new NativeBackendError('HELPER_EXIT_TIMEOUT', 'Native helper has not exited; input recovery state is retained.', {stderr})), 5000);
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
  }
  child.on('error', error => fail(new NativeBackendError('HELPER_START_FAILED', error.message)));
  child.stdin.on('error', error => fail(new NativeBackendError('HELPER_WRITE_FAILED', error.message)));
  child.on('exit', (code, signal) => onExit?.({code, signal}));
  child.on('close', (code, signal) => {
    fail(new NativeBackendError('HELPER_EXITED', 'Native helper exited.', { code, signal, stderr }));
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    let value;
    try { value = JSON.parse(line); } catch { fail(new NativeBackendError('HELPER_PROTOCOL', 'Native helper returned invalid JSON.', { line })); child.stdin.end(); return; }
    if (value.event) { onEvent?.(value.event); return; }
    const entry = pending.get(value.id);
    if (!entry) {
      if (value.ok === false && value.id === 0) fail(new NativeBackendError(value.error?.code ?? 'HELPER_START_FAILED', value.error?.message ?? 'Native helper startup failed.', value.error?.details));
      return;
    }
    pending.delete(value.id); clearTimeout(entry.timer);
    if (value.ok) entry.resolve(value.result);
    else entry.reject(new NativeBackendError(value.error?.code ?? 'NATIVE_FAILURE', value.error?.message ?? 'Native operation failed.', value.error?.details));
  });
  function request(method, params = {}, { monitoring = false, timeoutMs = timeout } = {}) {
    if (ended) return Promise.reject(terminalError ?? new NativeBackendError('HELPER_EXITED', 'Native helper is not running.', { stderr }));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (monitoring) {
          pending.delete(id);
          reject(new NativeBackendError('PRESENTATION_TIMEOUT', `Native ${method} timed out; monitoring is unavailable.`, { method }));
          return;
        }
        fail(new NativeBackendError('HELPER_TIMEOUT', `Native ${method} timed out; input outcome is unknown and release was requested.`, { method }));
        // Closing stdin makes the helper release its journal before exiting, not SIGKILL.
        child.stdin.end();
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => {
        if (error) { pending.delete(id); clearTimeout(timer); reject(new NativeBackendError('HELPER_WRITE_FAILED', error.message)); }
      });
    });
  }
  return {
    request,
    get pid() { return child.pid; },
    async close() {
      if (ended) {
        child.stdin.end();
        const result = exitResult ?? await waitForExit();
        lines.close();
        if (result.code === 0 && !result.signal) return;
        throw terminalError ?? new NativeBackendError('HELPER_EXITED', 'Helper release could not be confirmed.', {...result, stderr});
      }
      try { await request('close'); }
      catch (error) {
        child.stdin.end();
        await waitForExit(); lines.close();
        throw error;
      }
      child.stdin.end();
      const result = await waitForExit();
      lines.close();
      if (result.code !== 0 || result.signal) throw new NativeBackendError('HELPER_EXITED', 'Native helper did not exit cleanly.', {...result, stderr});
    },
    async disconnect() {
      // Internal crash/EOF path, not a successful public release. The helper's journal survives failure.
      child.stdin.end();
      const result = await waitForExit();
      lines.close();
      return {...result, stderr};
    },
  };
}
