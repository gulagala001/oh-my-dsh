import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

const fail = (message, code = 'PLUGIN_BROWSER_FILE_UNAVAILABLE') => Object.assign(new Error(message), { code });
const text = (value, label) => {
  if (typeof value !== 'string' || !value || value.length > 32768 || /[\x00-\x1f]/u.test(value)) throw fail(`Invalid ${label}`, 'INVALID_FILE_TRANSFER');
  return value;
};
const path = value => { text(value, 'file path'); if (!isAbsolute(value)) throw fail('File transfers require absolute local paths', 'INVALID_FILE_TRANSFER'); return value; };
const bindingKey = binding => JSON.stringify([binding.epoch, binding.tabId, binding.leaseId, binding.actorId, binding.rootTargetId, binding.rootUrl]);
const DOWNLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DOWNLOAD_STATES = new Set(['progressing', 'completed', 'cancelled', 'interrupted']);
const COPY_CHUNK_BYTES = 1024 * 1024;
const fileIdentity = info => ({ dev: String(info.dev), ino: String(info.ino), size: String(info.size), mtimeNs: String(info.mtimeNs) });
const sameFile = (first, second) => first != null && second != null
  && ['dev', 'ino', 'size', 'mtimeNs'].every(key => first[key] === second[key]);

function downloadSnapshot(value) {
  if (!value || typeof value.id !== 'string' || !DOWNLOAD_ID.test(value.id) || value.idSource !== 'provider-live-item'
    || !DOWNLOAD_STATES.has(value.state) || typeof value.filename !== 'string' || !value.filename
    || value.filename.length > 4096 || /[\x00-\x1f]/u.test(value.filename)
    || typeof value.sourceUrl !== 'string' || !value.sourceUrl || value.sourceUrl.length > 16384
    || typeof value.fileExists !== 'boolean' || !Number.isSafeInteger(value.receivedBytes) || value.receivedBytes < 0
    || !Number.isSafeInteger(value.totalBytes) || value.totalBytes < 0
    || !Number.isFinite(value.startedAtMs) || value.startedAtMs < 0
    || !Number.isFinite(value.updatedAtMs) || value.updatedAtMs < 0) {
    throw fail('The provider returned invalid download metadata', 'INVALID_DOWNLOAD_RECEIPT');
  }
  path(value.path);
  return structuredClone(value);
}
function binding(value, epoch) {
  if (!value || value.epoch !== epoch || !Number.isSafeInteger(value.tabId) || value.tabId <= 0) throw fail('The native file operation has no matching browser generation', 'STALE_FILE_TRANSFER');
  return Object.freeze({ epoch, tabId: value.tabId, leaseId: text(value.leaseId, 'browser lease'), actorId: text(value.actorId, 'browser actor'),
    rootTargetId: text(value.rootTargetId, 'root browser target'), rootUrl: text(value.rootUrl, 'root browser URL') });
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}

// The provider pipe is private. Tokens enter this registry only by consuming a
// real PluginFilePolicy receipt while its allowed-once commit is executing.
export class PluginBrowserFileAdapter {
  #policy; #epoch; #unsubscribe; #unregister; #cleanup; #closed = false; #closing;
  #uploads = new Map(); #downloads = new Map(); #recordDownloads = new WeakMap(); #seen = new Set(); #work = new Set(); #tabs = new Map();
  #observedDownloads = new Map();

  constructor(service, { filePolicy } = {}) {
    if (service?.version !== 1 || typeof service.request !== 'function' || typeof service.subscribe !== 'function'
      || typeof service.waitForRelease !== 'function' || typeof filePolicy?.consumeApprovedSubmission !== 'function') {
      throw fail('The plugin file adapter requires the real browser provider and DSH file policy');
    }
    this.service = service; this.#policy = filePolicy; this.#epoch = text(service.epoch, 'browser epoch');
  }

  start() {
    if (this.#closed || this.#unsubscribe) throw fail('The plugin browser file adapter has closed or already started');
    this.#unregister = this.#policy.registerBrowserAdapter(this.service, this);
    try {
      this.#unsubscribe = this.service.subscribe(event => this.#receive(event), error => {
        if (error?.released === true && error.providerClosed === true) this.#track(() => this.releaseProvider(error.releaseProof));
        else { this.#cancelAll(error); if (this.service.hostClosing || this.service.failure) void this.close().catch(failure => { this.lastError = failure; }); }
      });
      if (typeof this.#unsubscribe !== 'function') throw fail('The browser file subscription did not return a disposer');
      this.#cleanup = this.service.registerCleanup?.(() => this.close());
      return this;
    } catch (error) { this.#unsubscribe?.(); this.#unregister?.(); this.#unsubscribe = undefined; this.#unregister = undefined; throw error; }
  }

  #available() {
    if (this.#closed || !this.#unsubscribe || this.service.epoch !== this.#epoch || this.service.released
      || this.service.hostClosing || this.service.draining || this.service.failure) throw fail('The plugin file provider is no longer available', 'STALE_FILE_TRANSFER');
  }

  #track(action) {
    const task = Promise.resolve().then(action); this.#work.add(task);
    task.then(() => this.#work.delete(task), error => { this.#work.delete(task); this.lastError = error; });
    return task;
  }

  #remember(native, record) {
    let records = this.#tabs.get(native.tabId);
    if (!records) { records = new Map(); this.#tabs.set(native.tabId, records); }
    const identity = { id: text(record.id, 'logical tab'), browserId: text(record.browserId, 'logical browser') };
    records.set(JSON.stringify([identity.browserId, identity.id]), identity);
  }

  async #assertUpload(transfer) {
    this.#available(); transfer.signal.throwIfAborted();
    await transfer.proof.assertCurrent();
    if (bindingKey(binding(await transfer.proof.inspectBrowserBinding(), this.#epoch)) !== bindingKey(transfer.binding)) throw fail('The native upload browser actor changed', 'STALE_FILE_TRANSFER');
    if (transfer.proof.execution.agent?.session?.id !== transfer.proof.sessionId || transfer.proof.execution.callId !== transfer.proof.callId
      || transfer.proof.execution.name !== transfer.proof.toolName) throw fail('The native upload real tool execution changed', 'STALE_FILE_TRANSFER');
    this.#available(); transfer.signal.throwIfAborted();
  }

  async submitApprovedUpload(receipt, action) {
    this.#available();
    const proof = this.#policy.consumeApprovedSubmission(receipt, this);
    const native = binding(await proof.inspectBrowserBinding(), this.#epoch);
    if (proof.target.targetId !== native.rootTargetId) throw fail('File uploads in out-of-process frames are not supported.', 'UNSUPPORTED_FILE_UPLOAD_FRAME');
    const controller = new AbortController(), transferId = randomUUID();
    const transfer = { id: transferId, proof, binding: native, controller, signal: AbortSignal.any([proof.signal, controller.signal]),
      requestId: null, allowed: false, replies: new Set(), authorization: deferred() };
    await this.#assertUpload(transfer); this.#remember(native, proof.record);
    const cancelled = () => transfer.authorization.reject(transfer.signal.reason ?? fail('The upload submission was cancelled', 'FILE_UPLOAD_CANCELLED'));
    transfer.signal.addEventListener('abort', cancelled, { once: true });
    this.#uploads.set(transferId, transfer);
    try {
      proof.markSubmitted();
      const result = await action(Object.freeze(proof.files.map(file => file.path)), Object.freeze({ opencuTransferId: transferId }));
      await transfer.authorization.promise;
      if (!transfer.allowed || !transfer.requestId) throw fail('The native browser did not consume this upload approval', 'INVALID_FILE_TRANSFER_RECEIPT');
      transfer.signal.throwIfAborted();
      return result;
    } finally {
      controller.abort(fail('The one-use upload submission has ended', 'STALE_FILE_TRANSFER'));
      transfer.signal.removeEventListener('abort', cancelled);
      if (this.#uploads.get(transferId) === transfer) this.#uploads.delete(transferId);
      const results = await Promise.allSettled([...transfer.replies]);
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (errors.length) throw new AggregateError(errors, 'The native upload decision did not settle');
    }
  }

  #matchesUpload(transfer, request) {
    const { binding: native, proof } = transfer, target = proof.target;
    return request.transferId === transfer.id && request.tabId === native.tabId && request.leaseId === native.leaseId && request.actorId === native.actorId
      && request.rootTargetId === native.rootTargetId && request.rootUrl === native.rootUrl && request.targetId === target.targetId && request.sessionId === undefined
      && request.frameId === target.frameId && request.loaderId === target.loaderId && request.documentBackendNodeId === target.documentBackendNodeId
      && request.backendNodeId === target.backendNodeId && request.url === target.url && request.origin === target.origin
      && Array.isArray(request.files) && request.files.length === proof.files.length
      && request.files.every((file, index) => file.requestedPath === proof.files[index].path && file.canonicalPath === proof.files[index].path);
  }

  async #reply(requestId, decision, files = [], signal) {
    if (this.service.epoch !== this.#epoch) throw fail('The upload provider generation changed', 'STALE_FILE_TRANSFER');
    try {
      const reply = await this.service.request('fileUpload.resolve', { requestId, decision, files }, { signal, timeoutMs: 10000 });
      if (reply?.resolved !== true || reply.requestId !== requestId || decision === 'allowed-once' && reply.terminal !== 'allowed-once') {
        throw fail('The native upload did not acknowledge the matching one-use decision', 'INVALID_FILE_TRANSFER_RECEIPT');
      }
      if (decision === 'denied' && reply.terminal === 'allowed-once') throw fail('The native upload decision was already consumed and cannot be withdrawn', 'FILE_UPLOAD_DECISION_ALREADY_CONSUMED');
      return reply;
    } catch (error) {
      if (decision === 'denied' && (this.service.hostClosing || this.service.released || this.service.failure)) {
        await this.releaseProvider(await this.service.waitForRelease()); return;
      }
      throw error;
    }
  }

  #uploadRequested(request) {
    if (typeof request?.requestId !== 'string' || !request.requestId || this.#seen.has(request.requestId)) return;
    this.#seen.add(request.requestId);
    const transfer = this.#uploads.get(request.transferId);
    const operation = this.#track(async () => {
      try {
        if (!transfer || transfer.requestId || !this.#matchesUpload(transfer, request)) throw fail('No real approved upload receipt matches the native request', 'FILE_UPLOAD_DENIED');
        transfer.requestId = request.requestId;
        await this.#assertUpload(transfer);
        const files = transfer.proof.files.map(file => ({ requestedPath: file.path, canonicalPath: file.path, version: file.version }));
        await this.#reply(request.requestId, 'allowed-once', files, transfer.signal);
        transfer.allowed = true;
        transfer.authorization.resolve();
      } catch (error) {
        transfer?.authorization.reject(error);
        await this.#reply(request.requestId, 'denied');
        throw error;
      }
    });
    if (transfer) { transfer.replies.add(operation); operation.finally(() => transfer.replies.delete(operation)).catch(() => {}); }
  }

  async #assertDownload(state) {
    this.#available(); state.signal.throwIfAborted();
    if (state.context.isActive?.() === false || state.context.record.page.isClosed() || state.closed) throw fail('The native download intent has ended', 'STALE_DOWNLOAD');
    this.#policy.assertExecution(state.context.record);
    if (await state.context.record.assertFileAccess() === false || bindingKey(binding(await state.context.inspectBrowserBinding(), this.#epoch)) !== bindingKey(state.binding)) {
      throw fail('The native download actor or document changed', 'STALE_DOWNLOAD');
    }
    this.#available(); state.signal.throwIfAborted();
  }

  async enableDownload(context) {
    this.#available();
    if (this.#recordDownloads.has(context.record)) throw fail('A native download is already active in this tab', 'DOWNLOAD_BUSY');
    const native = binding(await context.inspectBrowserBinding(), this.#epoch), controller = new AbortController();
    const state = { id: randomUUID(), context, binding: native, controller, signal: AbortSignal.any([context.signal, controller.signal].filter(Boolean)),
      closed: false, closing: null, armed: false, released: false, snapshot: null, done: deferred(), cancelled: null };
    await this.#assertDownload(state);
    if (this.#recordDownloads.has(context.record)) throw fail('A native download is already active in this tab', 'DOWNLOAD_BUSY');
    this.#recordDownloads.set(context.record, state); this.#downloads.set(state.id, state); this.#remember(native, context.record);
    state.cancelled = () => state.done.reject(state.signal.reason ?? fail('The native download wait was cancelled', 'DOWNLOAD_CANCELLED'));
    state.signal.addEventListener('abort', state.cancelled, { once: true });
    try {
      const result = await this.service.request('downloads.arm', { ...this.#downloadParams(state), ...(context.source === undefined ? {} : { url: context.source }) }, { signal: state.signal, timeoutMs: 10000 });
      if (result?.armed !== true || result.permitId !== state.id) throw fail('The native browser did not arm this download intent', 'INVALID_DOWNLOAD_RECEIPT');
      state.armed = true; await this.#assertDownload(state);
      return () => this.#disarm(state);
    } catch (error) {
      try { await this.#disarm(state); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Native download setup and cleanup failed', { cause: error }); }
      throw error;
    }
  }

  #downloadParams(state) { return { tabId: state.binding.tabId, leaseId: state.binding.leaseId, actorId: state.binding.actorId, permitId: state.id }; }

  async waitForDownload(context) {
    const state = this.#recordDownloads.get(context.record);
    if (!state || !state.armed) throw fail('No native download intent is active in this tab', 'STALE_DOWNLOAD');
    await this.#assertDownload(state);
    // The helper owns a deadline that pauses for source-policy prompts. Wait on
    // the actual native done event, then confirm it with a short scoped RPC.
    await state.done.promise;
    await this.#assertDownload(state);
    const snapshot = await this.service.request('downloads.wait', this.#downloadParams(state), { signal: state.signal, timeoutMs: 10000 });
    await this.#assertDownload(state);
    if (!this.#matchesDownload(state, snapshot) || snapshot.state !== 'completed' || snapshot.fileExists !== true) throw fail('The native browser did not return a completed owned download', 'INVALID_DOWNLOAD_RECEIPT');
    const actual = downloadSnapshot(snapshot), file = await this.#ownedDownloadFile(actual);
    await this.#assertDownload(state);
    state.snapshot = actual;
    this.#rememberDownload(state, actual, file);
    context.onDownloadSnapshot?.({ ...actual, path: file.path });
    return { id: actual.id, path: file.path };
  }

  #matchesDownload(state, snapshot) {
    return snapshot && typeof snapshot.id === 'string' && snapshot.id && snapshot.permitId === state.id
      && snapshot.tabId === state.binding.tabId && snapshot.leaseId === state.binding.leaseId && snapshot.actorId === state.binding.actorId;
  }

  #rememberDownload(state, snapshot, file) {
    const existing = this.#observedDownloads.get(snapshot.id);
    if (existing && (existing.record !== state.context.record || existing.permitId !== state.id
      || bindingKey(existing.binding) !== bindingKey(state.binding))) {
      throw fail('The provider reused another download identity', 'INVALID_DOWNLOAD_RECEIPT');
    }
    if (existing?.file && file && (existing.file.path !== file.path || !sameFile(existing.file.identity, file.identity)))
      throw fail('The completed provider download changed', 'STALE_DOWNLOAD');
    const entry = existing ?? { id: snapshot.id, record: state.context.record, permitId: state.id,
      binding: state.binding, completion: state.done.promise, snapshot: null, file: null };
    entry.snapshot = snapshot;
    if (file) entry.file = file;
    this.#observedDownloads.set(snapshot.id, entry);
    return entry;
  }

  async #ownedDownloadFile(snapshot) {
    if (snapshot.state !== 'completed' || snapshot.fileExists !== true)
      throw fail('The download is not a completed local file', 'DOWNLOAD_NOT_COMPLETE');
    const downloaded = path(snapshot.path), directory = await realpath(join(this.service.directory, 'downloads'));
    const info = await lstat(downloaded, { bigint: true }), canonical = await realpath(downloaded), child = relative(directory, canonical);
    if (!info.isFile() || info.isSymbolicLink() || !child || child === '..' || child.startsWith('..' + sep)
      || isAbsolute(child) || info.size !== BigInt(snapshot.receivedBytes)) {
      throw fail('The completed download is outside the provider-owned directory or changed', 'INVALID_DOWNLOAD_RECEIPT');
    }
    return Object.freeze({ path: canonical, identity: Object.freeze(fileIdentity(info)) });
  }

  async #downloadBinding(context, expected) {
    this.#available(); context.signal?.throwIfAborted();
    if (!context.record || context.record.page.isClosed() || context.isActive?.() === false
      || typeof context.record.assertFileAccess !== 'function' || typeof context.inspectBrowserBinding !== 'function')
      throw fail('The download has no current owned browser actor', 'STALE_DOWNLOAD');
    this.#policy.assertExecution(context.record);
    if (await context.record.assertFileAccess() === false) throw fail('The download tab ownership changed', 'STALE_DOWNLOAD');
    const native = binding(await context.inspectBrowserBinding(), this.#epoch);
    this.#available(); context.signal?.throwIfAborted(); this.#policy.assertExecution(context.record);
    if (expected && (expected.record !== context.record || bindingKey(native) !== bindingKey(expected.binding)))
      throw fail('The download belongs to another browser actor or document', 'STALE_DOWNLOAD');
    return native;
  }

  async #readObservedDownloads(context, native) {
    const rows = await this.service.request('downloads.list', { tabId: native.tabId }, { signal: context.signal, timeoutMs: 10000 });
    if (!Array.isArray(rows) || rows.length > 1024) throw fail('Invalid observed provider download list', 'INVALID_DOWNLOAD_RECEIPT');
    const current = await this.#downloadBinding(context);
    if (bindingKey(current) !== bindingKey(native)) throw fail('The download browser actor changed', 'STALE_DOWNLOAD');
    const ids = new Set(), downloads = [];
    for (const row of rows) {
      const entry = this.#observedDownloads.get(row?.id);
      if (!entry || entry.record !== context.record || bindingKey(entry.binding) !== bindingKey(native)) continue;
      if (row.permitId !== entry.permitId || row.tabId !== native.tabId || row.leaseId !== native.leaseId
        || row.actorId !== native.actorId || ids.has(row.id)) throw fail('The observed download binding changed', 'INVALID_DOWNLOAD_RECEIPT');
      const actual = downloadSnapshot(row);
      if (actual.path !== entry.snapshot.path || actual.sourceUrl !== entry.snapshot.sourceUrl
        || actual.filename !== entry.snapshot.filename || actual.startedAtMs !== entry.snapshot.startedAtMs)
        throw fail('The observed download identity changed', 'INVALID_DOWNLOAD_RECEIPT');
      entry.snapshot = actual;
      ids.add(actual.id); downloads.push(entry);
    }
    return downloads;
  }

  async listDownloads(context) {
    const native = await this.#downloadBinding(context), entries = await this.#readObservedDownloads(context, native);
    return entries.map(({ snapshot }) => ({ id: snapshot.id, filename: snapshot.filename, url: snapshot.sourceUrl }));
  }

  async #waitObservedDownload(context, entry) {
    if (entry.snapshot.state !== 'progressing') return;
    const aborted = deferred(), cancel = () => aborted.reject(context.signal.reason ?? fail('Download saving was canceled', 'DOWNLOAD_CANCELLED'));
    context.signal?.addEventListener('abort', cancel, { once: true });
    try {
      context.signal?.throwIfAborted();
      await Promise.race([entry.completion, aborted.promise]);
      const native = await this.#downloadBinding(context, entry);
      if (!(await this.#readObservedDownloads(context, native)).includes(entry))
        throw fail('The provider download is no longer available', 'STALE_DOWNLOAD');
    } finally { context.signal?.removeEventListener('abort', cancel); }
  }

  async saveDownload(context) {
    if (typeof context?.id !== 'string' || !DOWNLOAD_ID.test(context.id))
      throw fail('A real observed download ID is required', 'INVALID_FILE_TRANSFER');
    const destination = path(context.path), filename = basename(destination);
    if (!filename || filename === '.' || filename === '..' || filename === sep)
      throw fail('The save destination must name a file', 'INVALID_FILE_TRANSFER');
    const native = await this.#downloadBinding(context);
    const entry = (await this.#readObservedDownloads(context, native)).find(value => value.id === context.id);
    if (!entry) throw fail('The download is not owned by this browser actor', 'STALE_DOWNLOAD');
    await this.#waitObservedDownload(context, entry);
    await this.#downloadBinding(context, entry);
    if (typeof context.authorizeSource !== 'function') throw fail('The download has no source policy inspector', 'DOWNLOAD_SOURCE_DENIED');
    await context.authorizeSource(entry.snapshot.sourceUrl);
    await this.#downloadBinding(context, entry);
    const file = await this.#ownedDownloadFile(entry.snapshot);
    if (entry.file && (file.path !== entry.file.path || !sameFile(file.identity, entry.file.identity)))
      throw fail('The completed provider download changed', 'STALE_DOWNLOAD');
    entry.file ??= file;
    const task = this.#track(() => this.#saveDownloadFile(context, entry, file, destination, filename));
    return task;
  }

  async #saveDownloadFile(context, entry, file, destination, filename) {
    let source, temporary, temporaryPath, failure, created = false;
    try {
      await this.#downloadBinding(context, entry);
      source = await open(file.path, constants.O_RDONLY | constants.O_NOFOLLOW);
      if (!sameFile(file.identity, fileIdentity(await source.stat({ bigint: true }))))
        throw fail('The provider download changed before saving', 'STALE_DOWNLOAD');
      await this.#downloadBinding(context, entry);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      const directory = await realpath(dirname(destination)), output = join(directory, filename);
      let previous = null;
      try {
        const info = await lstat(output, { bigint: true });
        if (!info.isFile() || info.isSymbolicLink()) throw fail('The save destination is not a regular file', 'INVALID_FILE_TRANSFER');
        previous = fileIdentity(info);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (output === file.path || previous && previous.dev === file.identity.dev && previous.ino === file.identity.ino) {
        if (!sameFile(previous, file.identity)) throw fail('The provider download changed before saving', 'STALE_DOWNLOAD');
        await this.#downloadBinding(context, entry);
        return { path: destination, filename: entry.snapshot.filename };
      }
      await this.#downloadBinding(context, entry);
      temporaryPath = join(directory, `.opencu-download-${randomUUID()}.tmp`);
      temporary = await open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      created = true;
      const buffer = Buffer.allocUnsafe(COPY_CHUNK_BYTES);
      let position = 0;
      for (;;) {
        await this.#downloadBinding(context, entry);
        const { bytesRead } = await source.read(buffer, 0, buffer.length, position);
        if (!bytesRead) break;
        let written = 0;
        while (written < bytesRead) {
          await this.#downloadBinding(context, entry);
          const { bytesWritten } = await temporary.write(buffer, written, bytesRead - written, position + written);
          if (bytesWritten <= 0) throw fail('The save destination stopped accepting data', 'DOWNLOAD_SAVE_FAILED');
          written += bytesWritten;
        }
        position += bytesRead;
        if (BigInt(position) > BigInt(file.identity.size)) throw fail('The provider download changed while saving', 'STALE_DOWNLOAD');
      }
      if (BigInt(position) !== BigInt(file.identity.size)
        || !sameFile(file.identity, fileIdentity(await source.stat({ bigint: true })))
        || !sameFile(file.identity, (await this.#ownedDownloadFile(entry.snapshot)).identity))
        throw fail('The provider download changed while saving', 'STALE_DOWNLOAD');
      await temporary.sync(); await temporary.close(); temporary = undefined;
      await this.#downloadBinding(context, entry);
      if (await realpath(dirname(destination)) !== directory) throw fail('The save destination directory changed', 'STALE_DOWNLOAD');
      if (previous) {
        const info = await lstat(output, { bigint: true });
        if (!info.isFile() || info.isSymbolicLink() || !sameFile(previous, fileIdentity(info)))
          throw fail('The save destination changed while saving', 'STALE_DOWNLOAD');
        await rename(temporaryPath, output); created = false;
      } else {
        // link commits a new file without overwriting a concurrent destination.
        await link(temporaryPath, output);
        await unlink(temporaryPath); created = false;
      }
      let parent;
      try { parent = await open(directory, constants.O_RDONLY); await parent.sync(); }
      catch (error) { if (process.platform !== 'win32' || !['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes(error.code)) throw error; }
      finally { await parent?.close(); }
      await this.#downloadBinding(context, entry);
      return { path: destination, filename: entry.snapshot.filename };
    } catch (error) {
      failure = error; throw error;
    } finally {
      const cleanup = await Promise.allSettled([source?.close(), temporary?.close()]);
      if (created) {
        try { await unlink(temporaryPath); }
        catch (error) { if (error.code !== 'ENOENT') cleanup.push({ status: 'rejected', reason: error }); }
      }
      const errors = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);
      if (errors.length) throw new AggregateError([...(failure ? [failure] : []), ...errors], 'Download save cleanup did not complete');
    }
  }

  #disarm(state) {
    if (state.released) return Promise.resolve();
    if (state.closing) return state.closing;
    state.closed = true; state.controller.abort(fail('The native download intent has ended', 'DOWNLOAD_CANCELLED'));
    const task = (async () => {
      try {
        const result = await this.service.request('downloads.disarm', this.#downloadParams(state), { timeoutMs: 15000 });
        if (result?.released !== true || result.permitId !== state.id) throw fail('Native download cancellation was not confirmed', 'DOWNLOAD_CLEANUP_UNCONFIRMED');
      } catch (error) {
        if (this.service.hostClosing || this.service.released || this.service.failure) await this.releaseProvider(await this.service.waitForRelease());
        else if (!state.armed && error.code === 'STALE_DOWNLOAD') { /* The failed arm created no permit in this same provider epoch. */ }
        else throw error;
      }
      state.released = true;
      state.signal.removeEventListener('abort', state.cancelled);
      this.#downloads.delete(state.id);
      if (this.#recordDownloads.get(state.context.record) === state) this.#recordDownloads.delete(state.context.record);
    })().finally(() => { if (state.closing === task) state.closing = null; });
    state.closing = task; return task;
  }

  async disableDownload({ record }) { const state = this.#recordDownloads.get(record); if (state) await this.#disarm(state); }

  #receive(event) {
    if (event?.epoch !== this.#epoch || this.service.epoch !== this.#epoch) return;
    const value = event.params;
    if (event.event === 'file-upload-requested') { this.#uploadRequested(value); return; }
    if (['download-created', 'download-updated', 'download-done'].includes(event.event)) {
      const state = this.#downloads.get(value?.permitId);
      if (!state || !this.#matchesDownload(state, value) || state.snapshot?.id && state.snapshot.id !== value.id) return;
      try {
        const actual = downloadSnapshot(value);
        state.snapshot = actual;
        this.#rememberDownload(state, actual);
        if (event.event === 'download-done') state.done.resolve(actual);
        state.context.onDownloadSnapshot?.(actual);
      } catch (error) { state.done.reject(error); this.lastError = error; }
      return;
    }
    if (event.event === 'tabs-invalidated' && ['removed', 'replaced'].includes(value?.reason)) this.#track(() => this.releaseTab(value.tabId, event));
    if (['actor-stopped', 'stopped'].includes(event.event)) {
      for (const transfer of this.#uploads.values()) if (transfer.binding.tabId === value?.tabId && transfer.binding.leaseId === value.leaseId
        && (event.event === 'stopped' || transfer.binding.actorId === value.actorId)) transfer.controller.abort(fail('The native upload actor stopped', 'FILE_UPLOAD_CANCELLED'));
      for (const state of this.#downloads.values()) if (state.binding.tabId === value?.tabId && state.binding.leaseId === value.leaseId
        && (event.event === 'stopped' || state.binding.actorId === value.actorId)) this.#track(() => this.#disarm(state));
    }
  }

  async releaseTab(nativeTabId, event) {
    if (event?.epoch !== this.#epoch || event.event !== 'tabs-invalidated' || !['removed', 'replaced'].includes(event.params?.reason)
      || event.params.tabId !== nativeTabId) throw fail('The tab has no matching native destruction event', 'FILE_TRANSFER_RELEASE_UNCONFIRMED');
    await this.#releaseTabRecords(nativeTabId);
  }

  async #releaseTabRecords(nativeTabId) {
    const records = this.#tabs.get(nativeTabId);
    if (!records) return;
    const results = await Promise.allSettled([...records.values()].map(record => this.#policy.releaseTab(record)));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Native tab destruction staging cleanup failed');
    this.#tabs.delete(nativeTabId);
    for (const [id, entry] of this.#observedDownloads) if (entry.binding.tabId === nativeTabId) this.#observedDownloads.delete(id);
  }

  async releaseProvider(proof) {
    if (!proof || this.service.released !== true || proof.epoch !== this.#epoch || this.service.epoch !== this.#epoch || proof.released !== true || proof.providerClosed !== true
      || !['process-exit', 'not-started'].includes(proof.kind)) throw fail('The provider has no matching physical browser release proof', 'FILE_TRANSFER_RELEASE_UNCONFIRMED');
    const results = await Promise.allSettled([...this.#tabs.keys()].map(tabId => this.#releaseTabRecords(tabId)));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Physical browser release staging cleanup failed');
  }

  #cancelAll(reason) {
    for (const transfer of this.#uploads.values()) transfer.controller.abort(reason ?? fail('The native browser disconnected'));
    for (const state of this.#downloads.values()) state.controller.abort(reason ?? fail('The native browser disconnected'));
  }

  close() {
    if (this.#closing) return this.#closing;
    this.#closed = true; this.#cancelAll(fail('The plugin browser file adapter has closed'));
    const task = (async () => {
      const results = await Promise.allSettled([...this.#downloads.values()].map(state => this.#disarm(state)));
      if (this.service.hostClosing || this.service.released || this.service.failure) await this.releaseProvider(await this.service.waitForRelease());
      await Promise.allSettled([...this.#work]);
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (errors.length) throw new AggregateError(errors, 'Native file operation cleanup failed');
      this.#observedDownloads.clear();
      this.#unsubscribe?.(); this.#unregister?.(); this.#cleanup?.();
      this.#unsubscribe = undefined; this.#unregister = undefined; this.#cleanup = undefined;
    })().finally(() => { if (this.#closing === task) this.#closing = null; });
    this.#closing = task; return task;
  }
}
