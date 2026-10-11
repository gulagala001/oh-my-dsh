import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPluginRuntimeExecutable } from '../../scripts/prepare-plugin-runtime.mjs';
import { BROWSER_PROTOCOL, DEFAULT_TIMEOUT_MS, EVENTS, MAX_PENDING_REQUESTS, MAX_TIMEOUT_MS, METHODS,
  createBrowserChannel, deferred, fail, jsonValue, nonempty, record, remoteError } from '../../native/plugin-browser/ipc.mjs';

const processEntry = fileURLToPath(new URL('./plugin-browser-process.mjs', import.meta.url));
const rendererEntry = fileURLToPath(new URL('../../lib/plugin-browser/index.html', import.meta.url));
const privateBrowserAuth = Symbol('private-browser-auth');
const releaseMethod = (method, params) => ['stop', 'stop-actor', 'detach', 'tabs.cancelCreate', 'downloads.disarm',
  'passwordFileImport.cancel', 'nativeProfileImport.cancel', 'profileImport.cancelSelection'].includes(method)
  || method === 'fileUpload.resolve' && params.decision === 'denied';
const within = async (work, timeoutMs, message) => {
  let timer;
  try { return await Promise.race([work, new Promise((_, reject) => {
    timer = setTimeout(() => reject(fail(message, 'BROWSER_CLEANUP_UNCONFIRMED')), timeoutMs);
  })]); } finally { clearTimeout(timer); }
};

/** Owns the official Electron process; consumers only receive finite scoped JSON. */
export class PluginBrowserProvider {
  constructor({ directory, getHostUrl, useTestKeychain = false } = {}) {
    if (!isAbsolute(directory ?? '') || typeof getHostUrl !== 'function') throw new TypeError('Plugin browser requires an absolute directory and trusted Host URL getter');
    if (typeof useTestKeychain !== 'boolean' || useTestKeychain && process.platform !== 'darwin') throw new TypeError('The isolated mock keychain option is a macOS-only boolean');
    this.useTestKeychain = useTestKeychain;
    this.directory = directory; this.getHostUrl = getHostUrl; this.version = BROWSER_PROTOCOL;
    this.epoch = randomUUID(); this.nonce = randomUUID(); this.sequence = 0;
    this.listeners = new Set(); this.pending = new Map(); this.cleanups = new Set();
    this.ready = deferred(); this.processExit = deferred(); this.releaseWait = deferred();
    this.started = false; this.hostClosing = false; this.draining = false;
    this.diagnostic = ''; this.releaseProof = undefined; this.releaseReceipt = undefined;
  }
  get released() { return this.releaseProof !== undefined; }
  trustedHostUrl() {
    const value = this.getHostUrl();
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || !URL.canParse(value)) throw fail('The configured Host URL is invalid', 'INVALID_HOST_URL');
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw fail('The configured Host URL is invalid', 'INVALID_HOST_URL');
    return url.origin;
  }
  start() {
    if (this.hostClosing || this.released) return Promise.reject(fail('The plugin browser is closing', 'PROVIDER_CLOSED'));
    if (this.failure) return Promise.reject(this.failure);
    if (this.started) return Promise.resolve(this);
    if (this.starting) return this.starting;
    const task = this.startProcess(); this.starting = task;
    void task.finally(() => { if (this.starting === task) this.starting = undefined; }).catch(() => {});
    return task;
  }
  async startProcess() {
    const executable = await getPluginRuntimeExecutable();
    if (this.hostClosing) throw fail('The plugin browser closed before startup', 'PROVIDER_CLOSED');
    this.runtimeDirectory = join(this.directory, 'runtime', this.epoch);
    await mkdir(this.runtimeDirectory, { recursive: true, mode: 0o700 });
    if (this.hostClosing) { await this.removeRuntimeDirectory(); throw fail('The plugin browser closed before startup', 'PROVIDER_CLOSED'); }
    const env = { ...process.env };
    for (const key of ['ELECTRON_RUN_AS_NODE', 'NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', 'NODE_OPTIONS', 'ELECTRON_EXTRA_LAUNCH_ARGS']) delete env[key];
    const child = spawn(executable, [processEntry, '--opencu-browser-directory', this.directory,
      '--opencu-browser-runtime', this.runtimeDirectory, '--opencu-browser-renderer', rendererEntry,
      ...(this.useTestKeychain ? ['--opencu-test-keychain'] : [])], {
      env, stdio: ['ignore', 'pipe', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32',
    });
    this.child = child;
    const log = bytes => { this.diagnostic = (this.diagnostic + bytes.toString('utf8')).slice(-8192); };
    child.stdout.on('data', log); child.stderr.on('data', log);
    child.once('error', error => this.channelFailed(error));
    child.once('close', (code, signal) => { void this.exited(child, { code, signal }); });
    if (!child.stdio[3]) throw fail('Electron did not create its private browser socket', 'UNAVAILABLE');
    this.channel = createBrowserChannel(child.stdio[3], message => this.receive(message), error => this.channelFailed(error));
    try {
      await this.channel.send({ type: 'initialize', protocol: BROWSER_PROTOCOL, epoch: this.epoch, nonce: this.nonce, hostUrl: this.trustedHostUrl() });
      await within(this.ready.promise, DEFAULT_TIMEOUT_MS, 'The plugin browser did not initialize');
      if (this.failure) throw this.failure;
      this.started = true; return this;
    } catch (error) {
      this.channelFailed(error); this.terminate();
      try { await within(this.processExit.promise, DEFAULT_TIMEOUT_MS, 'Browser process startup cleanup is unconfirmed'); }
      catch (cleanup) { throw new AggregateError([error, cleanup], 'Browser startup and physical process cleanup failed'); }
      throw error;
    }
  }
  terminate() {
    if (!this.child?.pid || this.child.exitCode !== null || this.child.signalCode !== null) return;
    try { if (process.platform !== 'win32') process.kill(-this.child.pid, 'SIGTERM'); else this.child.kill('SIGTERM'); }
    catch (error) { if (error.code !== 'ESRCH') this.terminationFailure = error; }
  }
  async removeRuntimeDirectory() {
    if (!this.runtimeDirectory) return;
    await rm(this.runtimeDirectory, { recursive: true, force: true }); this.runtimeDirectory = undefined;
  }
  async finalizeRelease() {
    if (this.releaseProof) return this.releaseProof;
    if (this.child?.pid && !this.exitObserved) throw fail('Browser process destruction is not confirmed', 'BROWSER_CLEANUP_UNCONFIRMED');
    if (this.child?.pid && process.platform !== 'win32') {
      // The dedicated process group also owns Chromium helper processes.
      let timer;
      const deadline = Date.now() + 10000;
      try {
        while (true) {
          try { process.kill(-this.child.pid, 0); }
          catch (error) { if (error.code === 'ESRCH') break; throw error; }
          try { process.kill(-this.child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
          if (Date.now() >= deadline) throw fail('Chromium helper process destruction is not confirmed', 'BROWSER_CLEANUP_UNCONFIRMED');
          await new Promise(resolve => { timer = setTimeout(resolve, 50); });
        }
      } finally { clearTimeout(timer); }
    } else if (this.child?.pid && !this.releaseReceipt) {
      throw fail('Abrupt browser process-tree destruction cannot be confirmed on this platform', 'BROWSER_CLEANUP_UNCONFIRMED');
    }
    await this.removeRuntimeDirectory();
    const proof = { epoch: this.epoch, released: true, providerClosed: true, kind: this.child ? 'process-exit' : 'not-started',
      ...(this.child?.pid ? { pid: this.child.pid } : {}) };
    this.releaseProof = proof; this.releaseWait.resolve(structuredClone(proof));
    const error = Object.assign(fail('The plugin-owned browser closed', 'PROVIDER_CLOSED'), {
      released: true, providerClosed: true, releaseProof: structuredClone(proof), ...(this.hostClosing ? { hostClosing: true } : {}),
    });
    this.notifyClosed(error); return proof;
  }
  async exited(child, exit) {
    if (this.child !== child) return;
    this.exitObserved = exit; this.processExit.resolve(exit);
    const error = this.failure ?? fail(`The plugin browser exited (${exit.signal ?? exit.code})`, 'BROWSER_PROCESS_CLOSED');
    this.ready.reject(error);
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(error); }
    this.pending.clear();
    try { await this.finalizeRelease(); }
    catch (cleanup) { this.cleanupFailure = cleanup; this.notifyClosed(Object.assign(cleanup, { hostClosing: true, released: false })); }
  }
  receive(message) {
    if (message.epoch !== this.epoch) throw fail('Browser process generation changed', 'HOST_GENERATION_CHANGED');
    if (message.type === 'ready') {
      if (message.protocol !== BROWSER_PROTOCOL || message.nonce !== this.nonce || message.pid !== this.child?.pid
        || this.started || this.infoValue || !record(message.info)) throw fail('Invalid browser startup receipt', 'INVALID_RESPONSE');
      this.infoValue = message.info; this.ready.resolve(); return;
    }
    if (message.type === 'response') {
      if (!nonempty(message.requestId) || typeof message.ok !== 'boolean') throw fail('Invalid browser response', 'INVALID_RESPONSE');
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId); pending.cleanup();
      if (message.ok && 'result' in message && jsonValue(message.result)) pending.resolve(message.result);
      else pending.reject(message.ok ? fail('Invalid finite browser result', 'INVALID_RESPONSE') : remoteError(message.error));
      return;
    }
    if (message.type === 'event') {
      if (!EVENTS.has(message.event) || !record(message.params)) throw fail('Invalid browser event', 'INVALID_RESPONSE');
      const event = { epoch: this.epoch, event: message.event, params: message.params };
      for (const subscription of this.listeners) { try { subscription.listener(structuredClone(event)); } catch {} }
      return;
    }
    if (message.type === 'released') {
      if (message.requestId !== this.closeRequest?.id || message.released !== true || message.providerClosed !== true
        || message.allTabsDestroyed !== true || message.fileCopiesRemoved !== true || message.pendingSettled !== true) {
        throw fail('Invalid browser release receipt', 'BROWSER_CLEANUP_UNCONFIRMED');
      }
      this.releaseReceipt = message; this.closeRequest.done.resolve(message); return;
    }
    if (message.type === 'release-failed') {
      if (message.requestId !== this.closeRequest?.id) throw fail('Invalid browser release response', 'INVALID_RESPONSE');
      this.closeRequest.failed = true; this.closeRequest.done.reject(remoteError(message.error)); return;
    }
    if (message.type === 'failure') { this.channelFailed(remoteError(message.error)); return; }
    throw fail('Unknown browser process message', 'INVALID_MESSAGE');
  }
  notifyClosed(error) { for (const subscription of this.listeners) { try { subscription.onClosed?.(error); } catch {} } }
  channelFailed(error) {
    if (this.releaseReceipt || this.released || this.failure) return;
    this.failure = error instanceof Error ? error : fail(String(error), 'DISCONNECTED');
    this.ready.reject(this.failure); this.closeRequest?.done.reject(this.failure);
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(this.failure); }
    this.pending.clear();
    this.notifyClosed(Object.assign(this.failure, { hostClosing: true, released: false }));
    this.terminate();
  }
  subscribe(listener, onClosed) {
    if (typeof listener !== 'function' || onClosed !== undefined && typeof onClosed !== 'function') throw new TypeError('Browser subscription requires functions');
    const subscription = { listener, onClosed }; this.listeners.add(subscription);
    if (this.releaseProof) queueMicrotask(() => { if (this.listeners.has(subscription)) this.notifyClosed(Object.assign(fail('The browser closed', 'PROVIDER_CLOSED'), { released: true, providerClosed: true, releaseProof: structuredClone(this.releaseProof) })); });
    return () => this.listeners.delete(subscription);
  }
  registerCleanup(callback) {
    if (typeof callback !== 'function' || this.hostClosing) throw new TypeError('Browser cleanup registration requires a live provider');
    this.cleanups.add(callback); return () => this.cleanups.delete(callback);
  }
  requestBrowserAuth(method, params, options = {}) {
    if (!method.startsWith('browser.authBroker.')) throw fail('Invalid private sign-in method', 'INVALID_REQUEST');
    return this.request(method, params, { ...options, privateBrowserAuth });
  }
  async request(method, params = {}, { signal, timeoutMs = DEFAULT_TIMEOUT_MS, trustedUserAction = false, trustedAgentLifecycle = false, privateBrowserAuth: authorization } = {}) {
    if (!METHODS.has(method) || !record(params) || !jsonValue(params)) throw fail('Invalid plugin browser request', 'INVALID_REQUEST');
    if (method.startsWith('browser.authBroker.') && authorization !== privateBrowserAuth) throw fail('Private sign-in requires its authenticated controller', 'INVALID_REQUEST');
    if (['passwordFileImport.chooseSource', 'passwordFileImport.import', 'passwordFileImport.cancel'].includes(method) && trustedUserAction !== true)
      throw fail('Password file import requires an authenticated user action', 'PASSWORD_FILE_IMPORT_USER_ACTION_REQUIRED');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) throw fail('Invalid browser deadline', 'INVALID_REQUEST');
    signal?.throwIfAborted();
    if (!this.started) await this.start();
    signal?.throwIfAborted();
    if (this.released || this.failure) throw this.failure ?? fail('The browser closed', 'PROVIDER_CLOSED');
    if (this.hostClosing && !releaseMethod(method, params)) throw Object.assign(fail('The browser is closing', 'HOST_CLOSING'), { hostClosing: true });
    if (this.pending.size >= MAX_PENDING_REQUESTS || ++this.sequence > Number.MAX_SAFE_INTEGER) throw fail('Browser request capacity reached', 'BUSY');
    const requestId = `${this.epoch}:${this.sequence}`, hostUrl = this.trustedHostUrl();
    return new Promise((resolve, reject) => {
      const preserveOutcome = ['passwordFileImport.chooseSource', 'passwordFileImport.import', 'passwordFileImport.cancel',
        'nativeProfileImport.import', 'nativeProfileImport.cancel', 'profileImport.import',
        'siteSettings.set', 'siteSettings.reset', 'siteSettings.clear'].includes(method);
      let sent = false, timer;
      const cancel = error => {
        const pending = this.pending.get(requestId); if (!pending) return;
        if (preserveOutcome && sent) {
          if (pending.cancellationRequested) return;
          pending.cancellationRequested = true; clearTimeout(timer);
          // A canceled write must settle its real outcome before replying.
          timer = setTimeout(() => {
            if (this.pending.get(requestId) !== pending) return;
            this.pending.delete(requestId); pending.cleanup();
            reject(fail('The operation did not confirm its terminal outcome', method.startsWith('passwordFileImport.')
              ? 'PASSWORD_FILE_IMPORT_OUTCOME_UNCONFIRMED' : method.startsWith('siteSettings.')
                ? 'PERMISSION_WRITE_UNCONFIRMED' : 'PROFILE_IMPORT_OUTCOME_UNCONFIRMED'));
          }, DEFAULT_TIMEOUT_MS);
          void this.channel.send({ type: 'cancel', epoch: this.epoch, requestId }).catch(cause => this.channelFailed(cause));
          return;
        }
        this.pending.delete(requestId); pending.cleanup(); reject(error);
        if (sent) void this.channel.send({ type: 'cancel', epoch: this.epoch, requestId }).catch(cause => this.channelFailed(cause));
      };
      const aborted = () => cancel(signal.reason ?? fail('Browser request aborted', 'ABORTED'));
      timer = setTimeout(() => cancel(fail('Browser request deadline reached; mutation outcome is not replayed', 'TIMEOUT')), timeoutMs);
      this.pending.set(requestId, { resolve, reject, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); } });
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) { aborted(); return; }
      sent = true;
      void this.channel.send({ type: 'request', epoch: this.epoch, requestId, method, params, hostUrl,
        trustedUserAction: trustedUserAction === true, trustedAgentLifecycle: trustedAgentLifecycle === true,
        trustedBrowserAuth: authorization === privateBrowserAuth }).catch(error => this.channelFailed(error));
    });
  }
  waitForRelease() { return this.releaseProof ? Promise.resolve(structuredClone(this.releaseProof)) : this.releaseWait.promise; }
  close() {
    if (this.closing) return this.closing;
    this.hostClosing = true; this.draining = true;
    this.cleanupTasks ??= [...this.cleanups].map(callback => Promise.resolve().then(callback));
    for (const task of this.cleanupTasks) void task.catch(() => {});
    const task = this.closeProcess(); this.closing = task;
    void task.finally(() => { if (this.closing === task) this.closing = undefined; }).catch(() => {});
    return task;
  }
  async closeProcess() {
    await this.starting?.catch(() => {});
    if (!this.child) await this.finalizeRelease();
    else if (!this.exitObserved) {
      if (!this.failure) {
        const request = this.closeRequest && !this.closeRequest.failed ? this.closeRequest : { id: `${this.epoch}:release:${randomUUID()}`, done: deferred() };
        this.closeRequest = request;
        await this.channel.send({ type: 'release', epoch: this.epoch, requestId: request.id });
        await within(request.done.promise, DEFAULT_TIMEOUT_MS, 'Browser release did not finish; resources are retained for retry');
      } else this.terminate();
      await within(this.processExit.promise, DEFAULT_TIMEOUT_MS, 'Browser physical process exit is unconfirmed');
    }
    await this.finalizeRelease();
    const results = await Promise.allSettled(this.cleanupTasks ?? []), errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
    if (errors.length) { this.cleanupTasks = undefined; throw new AggregateError(errors, 'Browser caller cleanup failed after physical browser release'); }
    this.draining = false; return structuredClone(this.releaseProof);
  }
}
