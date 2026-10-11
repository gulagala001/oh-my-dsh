import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPluginRuntimeExecutable } from '../../scripts/prepare-plugin-runtime.mjs';
import { createPresentationChannel, DEFAULT_TIMEOUT_MS, MAX_PENDING_REQUESTS, MAX_TIMEOUT_MS,
  METHODS, OWNER_KIND, PRESENTATIONS_PROTOCOL, deferred, fail, jsonValue, nonempty, record,
  remoteError } from '../../native/desktop-presentations/ipc.mjs';

const processEntry = fileURLToPath(new URL('./plugin-native-presentations-process.mjs', import.meta.url));
const bounded = async (promise, timeoutMs, message) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(fail(message, 'NATIVE_PRESENTATION_TIMEOUT')), timeoutMs);
  })]); } finally { clearTimeout(timer); }
};

/** Plugin-owned service for the existing DesktopNativePresentations consumer. */
export class PluginNativePresentationsProvider {
  constructor({ directory = join(homedir(), 'Library', 'Application Support', 'OpenCU', 'native-presentations') } = {}) {
    if (!isAbsolute(directory)) throw new TypeError('Native presentation runtime directory must be absolute');
    this.directory = directory; this.version = 1; this.epoch = randomUUID(); this.nonce = randomUUID();
    this.listeners = new Set(); this.pending = new Map(); this.sequence = 0;
    this.child = undefined; this.channel = undefined; this.runtimeDirectory = undefined;
    this.ready = deferred(); this.releaseWait = deferred(); this.processExit = deferred();
    this.started = false; this.starting = undefined; this.closing = undefined; this.hostClosing = false;
    this.failure = undefined; this.releaseProof = undefined; this.releaseReceipt = undefined; this.closeRequest = undefined;
    this.capabilitiesValue = undefined; this.diagnostic = '';
  }

  get released() { return this.releaseProof !== undefined; }

  start() {
    if (this.hostClosing || this.released) return Promise.reject(fail('The plugin presentation provider is closing', 'PROVIDER_CLOSED'));
    if (this.failure) return Promise.reject(this.failure);
    if (this.started) return Promise.resolve(this);
    if (this.starting) return this.starting;
    const pending = this.startProcess();
    this.starting = pending;
    void pending.finally(() => { if (this.starting === pending) this.starting = undefined; }).catch(() => {});
    return pending;
  }

  async startProcess() {
    if (process.platform !== 'darwin') {
      this.capabilitiesValue = { available: false, reason: 'platform' }; this.started = true;
      return this;
    }
    const executable = await getPluginRuntimeExecutable();
    if (this.hostClosing) throw fail('The presentation provider closed before process startup', 'PROVIDER_CLOSED');
    this.runtimeDirectory = join(this.directory, this.epoch);
    await mkdir(this.runtimeDirectory, { recursive: true, mode: 0o700 });
    if (this.hostClosing) { await this.removeRuntimeDirectory(); throw fail('The presentation provider closed before process startup', 'PROVIDER_CLOSED'); }
    const environment = { ...process.env };
    for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_OVERRIDE_DIST_PATH', 'NODE_CHANNEL_FD',
      'NODE_CHANNEL_SERIALIZATION_MODE', 'NODE_OPTIONS', 'ELECTRON_EXTRA_LAUNCH_ARGS']) delete environment[key];
    const child = spawn(executable, [processEntry, '--opencu-native-directory', this.runtimeDirectory], {
      env: environment, stdio: ['ignore', 'pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    this.child = child;
    const log = bytes => { this.diagnostic = (this.diagnostic + bytes.toString('utf8')).slice(-4096); };
    child.stdout.on('data', log); child.stderr.on('data', log);
    child.once('error', error => this.channelFailed(error));
    let exit;
    child.once('exit', (code, signal) => { exit = { code, signal }; });
    child.once('close', (code, signal) => { void this.exited(child, exit ?? { code, signal }); });
    const stream = child.stdio[3];
    if (!stream) throw fail('The plugin runtime did not provide the private presentation socket', 'UNAVAILABLE');
    this.channel = createPresentationChannel(stream, message => this.receive(message), error => this.channelFailed(error));
    try {
      await this.channel.send({ type: 'initialize', protocol: PRESENTATIONS_PROTOCOL, epoch: this.epoch, nonce: this.nonce });
      await bounded(this.ready.promise, DEFAULT_TIMEOUT_MS, 'The plugin native presentation process did not initialize');
      if (this.failure) throw this.failure;
      this.started = true;
      return this;
    } catch (error) {
      this.channelFailed(error);
      child.kill('SIGTERM');
      try { await bounded(this.processExit.promise, DEFAULT_TIMEOUT_MS, 'The native presentation process exit is unconfirmed'); }
      catch (cleanup) { throw new AggregateError([error, cleanup], 'Native presentation startup failed and its process requires cleanup'); }
      throw error;
    }
  }

  async removeRuntimeDirectory() {
    if (!this.runtimeDirectory) return;
    await rm(this.runtimeDirectory, { recursive: true, force: true });
    this.runtimeDirectory = undefined;
  }

  async exited(child, exit) {
    if (this.child !== child) return;
    if (Number.isSafeInteger(child.pid) && child.pid > 0) {
      // OS-observed process exit destroys this process's AppKit owner and remote contexts.
      // It is distinct from an individual surface-detach receipt and never replaces one while alive.
      const proof = { epoch: this.epoch, released: true, providerClosed: true,
        ownerKind: OWNER_KIND, kind: 'process-exit', pid: child.pid, exitCode: exit.code, signal: exit.signal,
        ...(this.releaseReceipt ? { nativeHostCreated: this.releaseReceipt.nativeHostCreated } : {}),
        nativeTerminalDelivered: this.releaseReceipt?.nativeTerminalDelivered === true };
      this.releaseProof = proof; this.releaseWait.resolve(structuredClone(proof));
    }
    if (!this.releaseProof) this.releaseWait.reject(this.failure ?? fail('The native process was not started', 'UNAVAILABLE'));
    this.processExit.resolve(exit);
    const failure = this.failure ?? fail(`The native presentation process exited${exit.signal ? ` (${exit.signal})` : ` (${exit.code})`}`, 'NATIVE_HOST_CLOSED');
    this.ready.reject(failure);
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(failure); }
    this.pending.clear();
    if (!this.hostClosing && !this.failure) this.notifyClosed(failure);
    try { await this.removeRuntimeDirectory(); } catch (error) { this.cleanupFailure = error; }
  }

  receive(message) {
    if (message.epoch !== this.epoch) throw fail('The native presentation process generation changed', 'HOST_GENERATION_CHANGED');
    if (message.type === 'ready') {
      if (this.started || this.capabilitiesValue || message.protocol !== PRESENTATIONS_PROTOCOL || message.nonce !== this.nonce
        || message.pid !== this.child?.pid || !record(message.capabilities) || typeof message.capabilities.available !== 'boolean') {
        throw fail('Invalid plugin native presentation startup response', 'INVALID_RESPONSE');
      }
      this.capabilitiesValue = message.capabilities; this.ready.resolve(); return;
    }
    if (message.type === 'event') {
      if (!['native-presentation', 'native-video'].includes(message.event) || !record(message.params)) throw fail('Invalid plugin native presentation event', 'INVALID_RESPONSE');
      const event = { epoch: this.epoch, event: message.event, params: message.params };
      for (const subscription of this.listeners) { try { subscription.listener(structuredClone(event)); } catch {} }
      return;
    }
    if (message.type === 'response') {
      if (!nonempty(message.requestId) || typeof message.ok !== 'boolean') throw fail('Invalid native presentation response', 'INVALID_RESPONSE');
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId); pending.cleanup();
      if (message.ok) {
        if (!('result' in message) || !jsonValue(message.result)) { pending.reject(fail('Invalid native presentation result', 'INVALID_RESPONSE')); return; }
        pending.resolve(message.result);
      } else pending.reject(remoteError(message.error));
      return;
    }
    if (message.type === 'released') {
      if (message.requestId !== this.closeRequest?.id || message.released !== true || message.providerClosed !== true
        || message.nativeHostClosed !== true || typeof message.nativeHostCreated !== 'boolean'
        || typeof message.nativeTerminalDelivered !== 'boolean' || message.nativeTerminalDelivered !== message.nativeHostCreated) {
        throw fail('Invalid native provider release receipt', 'NATIVE_CLEANUP_UNCONFIRMED');
      }
      this.releaseReceipt = message; this.closeRequest.done.resolve(message); return;
    }
    if (message.type === 'release-failed') {
      if (message.requestId !== this.closeRequest?.id) throw fail('Invalid native provider release response', 'INVALID_RESPONSE');
      this.closeRequest.failed = true;
      this.closeRequest.done.reject(remoteError(message.error)); return;
    }
    if (message.type === 'failure') { this.channelFailed(remoteError(message.error)); return; }
    throw fail('Unknown native presentation process message', 'INVALID_MESSAGE');
  }

  notifyClosed(error) {
    for (const subscription of this.listeners) { try { subscription.onClosed?.(error); } catch {} }
  }

  channelFailed(error) {
    if (this.releaseProof || this.releaseReceipt) return;
    if (this.failure) return;
    this.failure = error instanceof Error ? error : fail(String(error), 'DISCONNECTED');
    this.ready.reject(this.failure);
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(this.failure); }
    this.pending.clear(); this.closeRequest?.done.reject(this.failure);
    this.notifyClosed(this.failure);
    // A lost channel asks the owned child to dispose; only its later OS exit proves destruction.
    if (this.child?.pid && this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGTERM');
  }

  subscribe(listener, onClosed) {
    if (typeof listener !== 'function' || onClosed !== undefined && typeof onClosed !== 'function') throw new TypeError('Native presentation subscription requires functions');
    const subscription = { listener, onClosed };
    this.listeners.add(subscription);
    if (this.failure) queueMicrotask(() => { if (this.listeners.has(subscription)) { try { onClosed?.(this.failure); } catch {} } });
    return () => this.listeners.delete(subscription);
  }

  async request(method, params = {}, options = {}) {
    if (!METHODS.has(method) || !jsonValue(params)) throw fail('Invalid native presentation request', 'INVALID_REQUEST');
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) throw fail('Invalid native presentation deadline', 'INVALID_REQUEST');
    options.signal?.throwIfAborted();
    await this.start();
    if (this.hostClosing || this.released) throw fail('The plugin presentation provider is closing', 'PROVIDER_CLOSED');
    if (!this.child) {
      if (method === 'nativePresentation.capabilities' || method === 'nativePresentation.owner') return structuredClone(this.capabilitiesValue);
      throw fail(`Native presentations are unavailable: ${this.capabilitiesValue.reason}`);
    }
    if (this.failure) throw this.failure;
    if (this.pending.size >= MAX_PENDING_REQUESTS) throw fail('Native presentation request capacity was reached', 'BUSY');
    if (++this.sequence > Number.MAX_SAFE_INTEGER) throw fail('Native presentation request sequence was exhausted', 'RESOURCE_LIMIT');
    const requestId = `${this.epoch}:${this.sequence}`;
    return new Promise((resolve, reject) => {
      const cancel = error => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId); pending.cleanup(); reject(error);
        void this.channel.send({ type: 'cancel', epoch: this.epoch, requestId }).catch(cause => this.channelFailed(cause));
      };
      const aborted = () => cancel(fail('Native presentation request was aborted', 'ABORTED'));
      const timer = setTimeout(() => cancel(fail('Native presentation request timed out', 'TIMEOUT')), timeoutMs);
      this.pending.set(requestId, { resolve, reject, cleanup: () => { clearTimeout(timer); options.signal?.removeEventListener('abort', aborted); } });
      options.signal?.addEventListener('abort', aborted, { once: true });
      if (options.signal?.aborted) { aborted(); return; }
      void this.channel.send({ type: 'request', epoch: this.epoch, requestId, method, params })
        .catch(error => this.channelFailed(error));
    });
  }

  waitForRelease() { return this.releaseProof ? Promise.resolve(structuredClone(this.releaseProof)) : this.releaseWait.promise; }

  close() {
    if (this.closing) return this.closing;
    this.hostClosing = true;
    const pending = this.closeProcess(); this.closing = pending;
    void pending.finally(() => { if (this.closing === pending) this.closing = undefined; }).catch(() => {});
    return pending;
  }

  async closeProcess() {
    await this.starting?.catch(() => {});
    if (!this.child) {
      await this.removeRuntimeDirectory();
      this.releaseProof ??= { epoch: this.epoch, released: true, providerClosed: true, ownerKind: OWNER_KIND, kind: 'not-started' };
      this.releaseWait.resolve(structuredClone(this.releaseProof));
      return structuredClone(this.releaseProof);
    }
    if (!this.releaseProof && !this.failure) {
      const request = this.closeRequest && !this.closeRequest.failed ? this.closeRequest
        : { id: `${this.epoch}:release:${randomUUID()}`, done: deferred() };
      this.closeRequest = request;
      await this.channel.send({ type: 'release', epoch: this.epoch, requestId: request.id });
      await bounded(request.done.promise, DEFAULT_TIMEOUT_MS, 'The native provider did not confirm host closure');
    }
    await bounded(this.processExit.promise, DEFAULT_TIMEOUT_MS, 'The native provider process exit is unconfirmed');
    if (!this.releaseProof) throw fail('The provider has no actual process destruction receipt', 'NATIVE_CLEANUP_UNCONFIRMED');
    await this.removeRuntimeDirectory(); this.cleanupFailure = undefined;
    return structuredClone(this.releaseProof);
  }
}
