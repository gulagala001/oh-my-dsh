import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, realpath, rm } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import { symbols } from '@deepseek-ai/cordis';
import { requestHostAccessApproval } from './access-policy.mjs';

const MAX_FILES = 128;
const COPY_CHUNK_BYTES = 1024 * 1024;
const failure = (message, code = 'FILE_UPLOAD_UNAVAILABLE') => Object.assign(new Error(message), { code });
const requiredText = (value, label) => {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw failure(`Invalid ${label}`, 'INVALID_FILE_UPLOAD');
  return value;
};
const absolutePath = (value, label) => {
  const result = requiredText(value, label);
  if (!isAbsolute(result)) throw failure(`${label} must be an absolute path`, 'INVALID_FILE_UPLOAD');
  return result;
};

function openTurn(session) {
  if (!Number.isSafeInteger(session?.seq) || typeof session.eventAt !== 'function') throw failure('File upload requires a live DSH session');
  for (let sequence = session.seq - 1; sequence >= 0; sequence--) {
    const type = session.eventAt(sequence)?.type;
    if (type === 'turn/end') throw failure('The file upload execution turn has ended', 'STALE_FILE_UPLOAD');
    if (type === 'turn/start') return sequence;
  }
  throw failure('File upload requires an open DSH turn');
}

function filesystem(exec, ctx) {
  const fs = exec.agent?.ctx?.get?.('fs') ?? ctx?.get?.('fs');
  if (!['resolve', 'stat', 'processPath', 'processPathFromHostPath', 'readBytes'].every(method => typeof fs?.[method] === 'function')) {
    throw failure('The current DSH filesystem cannot authorize browser uploads');
  }
  return fs;
}

const filesystemIdentity = fs => fs[symbols.original] ?? fs;

function receiverKey(target) {
  if (!target || typeof target !== 'object') throw failure('File upload requires an inspected receiving document', 'INVALID_FILE_UPLOAD');
  for (const name of ['targetId', 'frameId', 'loaderId', 'url', 'origin']) requiredText(target[name], `receiving ${name}`);
  for (const name of ['backendNodeId', 'documentBackendNodeId']) {
    if (!Number.isSafeInteger(target[name]) || target[name] <= 0) throw failure(`Invalid receiving ${name}`, 'INVALID_FILE_UPLOAD');
  }
  const url = new URL(target.url), destination = new URL(target.origin);
  const inherited = url.protocol === 'about:' && ['blank', 'srcdoc'].includes(url.pathname);
  if (!['http:', 'https:'].includes(destination.protocol) || target.origin !== destination.origin || destination.href !== destination.origin + '/'
    || destination.username || destination.password || url.username || url.password
    || !inherited && (!['http:', 'https:'].includes(url.protocol) || target.origin !== url.origin)) {
    throw failure('File uploads require a real HTTP(S) receiving document', 'INVALID_FILE_UPLOAD');
  }
  if (typeof target.sessionIdentity?.send !== 'function' || typeof target.frameIdentity?.isDetached !== 'function') {
    throw failure('File upload requires an actual receiving frame and CDP session', 'INVALID_FILE_UPLOAD');
  }
  return JSON.stringify([target.targetId, target.frameId, target.loaderId, target.documentBackendNodeId,
    target.backendNodeId, target.url, target.origin, target.isMultiple === true]);
}

function tabKey(record) {
  return JSON.stringify([requiredText(record?.browserId, 'browser identity'), requiredText(record?.id, 'tab identity')]);
}

function checkOperation(context) {
  context.signal?.throwIfAborted();
  if (context.isActive?.() === false) throw failure('The browser file operation is no longer active', 'STALE_FILE_UPLOAD');
  if (context.record?.page?.isClosed?.() !== false) throw failure('The browser tab is no longer available', 'STALE_FILE_UPLOAD');
}

function accessUrl(value) {
  const url = new URL(requiredText(value, 'browser access URL'));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw failure('Browser access requires a real HTTP(S) URL without user information', 'INVALID_BROWSER_ACCESS');
  }
  return url;
}

// Execution and tab identities enter through trusted host callbacks, never REPL metadata.
export class PluginFilePolicy {
  #ctx; #directory; #root; #executions = new Map(); #stages = new Set(); #busy = new WeakSet(); #closed = false;
  #browserAdapters = new Map(); #approvalReceipts = new WeakMap(); #accessBindings = new WeakMap();

  constructor(ctx, { directory } = {}) {
    this.#ctx = ctx;
    this.#directory = absolutePath(directory, 'File staging directory');
  }

  registerBrowserAdapter(service, adapter) {
    if (this.#closed || !service || adapter?.service !== service || typeof adapter.submitApprovedUpload !== 'function'
      || this.#browserAdapters.has(service)) throw failure('The plugin browser file adapter is unavailable or already registered');
    this.#browserAdapters.set(service, adapter);
    return () => { if (this.#browserAdapters.get(service) === adapter) this.#browserAdapters.delete(service); };
  }

  assertExecution(record) { this.#execution(record); return true; }

  isAccessApprovalAvailable(record) {
    if (this.#closed) return false;
    const current = record && this.#executions.get(record.sessionId);
    const approval = (!current?.ended && current?.agent.ctx?.get?.('approval')) ?? this.#ctx?.get?.('approval');
    return typeof approval?.request === 'function';
  }

  requestAccessApproval(record, { resource, target, reason, signal: requestedSignal } = {}) {
    const current = this.#execution(record);
    if (!['fullCdp', 'origin'].includes(resource)) throw failure('Unsupported browser access resource', 'INVALID_BROWSER_ACCESS');
    const destination = accessUrl(target);
    if (target !== destination.origin) throw failure('Browser access requires a canonical HTTP(S) origin', 'INVALID_BROWSER_ACCESS');
    requiredText(reason, 'browser access reason');
    if (requestedSignal !== undefined && !(requestedSignal instanceof AbortSignal)) throw failure('Invalid browser access cancellation signal', 'INVALID_BROWSER_ACCESS');
    const pageUrl = accessUrl(record.page?.url?.());
    if (!Number.isSafeInteger(record.generation) || record.generation < 0 || !record.capabilityAdapter) {
      throw failure('The browser has no current scoped CDP binding', 'CAPABILITY_UNAVAILABLE');
    }
    if (resource === 'fullCdp' && target !== pageUrl.origin) throw failure('Raw CDP approval must belong to the current tab origin', 'INVALID_BROWSER_ACCESS');
    const signal = AbortSignal.any([current.signal, requestedSignal].filter(Boolean));
    const context = { record, signal };
    this.#accessBindings.set(context, Object.freeze({ page: record.page, pageUrl: pageUrl.href,
      origin: pageUrl.origin, generation: record.generation, adapter: record.capabilityAdapter, key: tabKey(record) }));
    return this.#track(current, async () => {
      try {
        await this.#assertCurrent(current, context);
        const scope = { get: name => current.agent.ctx?.get?.(name) ?? this.#ctx?.get?.(name) };
        const decision = await requestHostAccessApproval(scope, { agent: current.agent, name: current.toolName, callId: current.callId, signal }, {
          resource, target, reason,
        });
        await this.#assertCurrent(current, context);
        if (decision.outcome !== 'allowed-once') {
          throw failure(`Browser access was not approved (${decision.outcome})`, decision.outcome === 'cancelled' ? 'CAPABILITY_CANCELLED'
            : decision.outcome === 'unavailable' ? 'CAPABILITY_UNAVAILABLE' : 'CAPABILITY_PERMISSION_DENIED');
        }
        return decision;
      } finally { this.#accessBindings.delete(context); }
    });
  }

  // The bridge can consume only the actual receipt while its private commit
  // closure is executing. A JSON object or model-supplied approval never matches.
  consumeApprovedSubmission(receipt, adapter) {
    const entry = this.#approvalReceipts.get(receipt);
    if (!entry || !entry.committing || entry.claimed || this.#browserAdapters.get(entry.context.browserService) !== adapter
      || adapter.service !== entry.context.browserService || entry.stage.closed || !entry.stage.consumed) {
      throw failure('No real one-use upload approval belongs to this browser submission', 'STALE_FILE_UPLOAD');
    }
    this.#execution(entry.context.record, entry.current);
    if (typeof entry.context.inspectBrowserBinding !== 'function') throw failure('The upload has no trusted native browser binding inspector');
    entry.claimed = true;
    const { current, stage, context, targetKey } = entry;
    return Object.freeze({ record: context.record, target: receipt.target, signal: stage.signal,
      execution: current.exec, sessionId: current.sessionId, callId: current.callId, toolName: current.toolName,
      files: Object.freeze(stage.files.map((file, index) => Object.freeze({ ...file, version: stage.sources[index].version }))),
      inspectBrowserBinding: context.inspectBrowserBinding,
      assertCurrent: async () => { await this.#assertCurrent(current, context, targetKey); await this.#checkStaging(stage); this.#execution(context.record, current); },
      markSubmitted: () => {
        if (!entry.committing || stage.closed || stage.submitted) throw failure('The native upload submission is no longer prepared', 'STALE_FILE_UPLOAD');
        this.#execution(context.record, current); stage.signal.throwIfAborted(); stage.submitted = true;
      },
    });
  }

  registerExecution(exec, { cwd, signal } = {}) {
    if (this.#closed) throw failure('The plugin file policy has closed');
    const session = exec?.agent?.session, turn = openTurn(session);
    const sessionId = requiredText(session.id, 'DSH sessionId');
    requiredText(exec.callId, 'DSH callId'); requiredText(exec.name, 'DSH toolName');
    if (!(exec.signal instanceof AbortSignal)) throw failure('File upload requires the actual tool execution cancellation signal');
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw failure('Invalid file execution cancellation signal');
    if (this.#executions.has(sessionId)) throw failure('More than one active tool execution owns this DSH session');
    const controller = new AbortController();
    const fs = filesystem(exec, this.#ctx);
    const current = { exec, agent: exec.agent, callId: exec.callId, toolName: exec.name, toolSignal: exec.signal,
      session, sessionId, turn, cwd: absolutePath(cwd, 'DSH working directory'), fs, fsIdentity: filesystemIdentity(fs),
      controller, signal: AbortSignal.any([exec.signal, signal, controller.signal].filter(Boolean)), pending: new Set(), ended: false, ending: null };
    current.signal.throwIfAborted();
    this.#executions.set(sessionId, current);
    return () => {
      if (current.ending) return current.ending;
      current.ended = true;
      if (this.#executions.get(sessionId) === current) this.#executions.delete(sessionId);
      controller.abort(failure('The file upload tool execution has ended', 'STALE_FILE_UPLOAD'));
      const pending = (async () => {
        await Promise.allSettled([...current.pending]);
        await this.#cleanupWhere(stage => stage.execution === current && !stage.submitted);
        for (const stage of this.#stages) if (stage.execution === current && stage.submitted) { stage.execution = null; stage.sources = []; }
      })().finally(() => { if (current.ending === pending) current.ending = null; });
      current.ending = pending;
      return pending;
    };
  }

  #execution(record, expected) {
    const sessionId = requiredText(record?.sessionId, 'browser execution sessionId');
    const current = this.#executions.get(sessionId);
    if (this.#closed || !current || current.ended || expected && current !== expected
      || current.exec.agent !== current.agent || current.exec.callId !== current.callId || current.exec.name !== current.toolName || current.exec.signal !== current.toolSignal
      || current.agent.session !== current.session || current.session.id !== sessionId || openTurn(current.session) !== current.turn) {
      throw failure('No real active DSH tool execution owns this browser upload', 'STALE_FILE_UPLOAD');
    }
    current.signal.throwIfAborted();
    if (filesystemIdentity(filesystem(current.exec, this.#ctx)) !== current.fsIdentity) throw failure('The upload execution filesystem changed', 'STALE_FILE_UPLOAD');
    return current;
  }

  async #assertCurrent(current, context, targetKey) {
    this.#execution(context.record, current); checkOperation(context);
    const binding = this.#accessBindings.get(context);
    if (binding) {
      const check = () => {
        this.#execution(context.record, current); checkOperation(context);
        const url = accessUrl(context.record.page.url());
        if (context.record.page !== binding.page || context.record.generation !== binding.generation
          || context.record.capabilityAdapter !== binding.adapter || tabKey(context.record) !== binding.key
          || url.href !== binding.pageUrl || url.origin !== binding.origin) {
          throw failure('The browser page, origin or scoped CDP binding changed during approval', 'STALE_BROWSER_ACCESS');
        }
      };
      if (typeof context.record.assertFileAccess !== 'function') throw failure('Browser access requires a trusted current tab ownership inspector', 'CAPABILITY_UNAVAILABLE');
      check();
      if (await context.record.assertFileAccess() === false) throw failure('The browser tab ownership changed', 'STALE_BROWSER_ACCESS');
      check();
      return;
    }
    if (typeof context.record.assertFileAccess !== 'function' || typeof context.inspectTarget !== 'function') {
      throw failure('File upload requires the current browser ownership and document inspectors');
    }
    if (await context.record.assertFileAccess() === false) throw failure('The browser tab ownership changed', 'STALE_FILE_UPLOAD');
    const target = await context.inspectTarget();
    this.#execution(context.record, current); checkOperation(context);
    if (receiverKey(target) !== targetKey || target.sessionIdentity !== context.target.sessionIdentity || target.frameIdentity !== context.target.frameIdentity) {
      throw failure('The receiving frame, document, CDP session or file input changed during upload approval', 'STALE_FILE_UPLOAD');
    }
    if (await context.record.assertFileAccess() === false) throw failure('The browser tab ownership changed', 'STALE_FILE_UPLOAD');
    this.#execution(context.record, current); checkOperation(context);
  }

  async #resolveFile(current, requestedPath, signal, previous) {
    signal.throwIfAborted();
    const { fs, cwd } = current, mapped = fs.processPathFromHostPath(requestedPath);
    if (typeof mapped !== 'string') throw failure('The execution filesystem does not share the requested host file');
    const target = await fs.resolve(absolutePath(mapped, 'Mapped upload path'), { cwd, signal });
    const canonicalPath = await realpath(requestedPath);
    const mappedCanonical = fs.processPathFromHostPath(canonicalPath);
    if (typeof mappedCanonical !== 'string') throw failure('The execution filesystem does not share the canonical host file');
    const canonicalTarget = await fs.resolve(absolutePath(mappedCanonical, 'Mapped canonical upload path'), { cwd, signal });
    requiredText(target?.targetKey, 'DSH file identity'); absolutePath(fs.processPath(target), 'DSH upload process path');
    if (target.targetKey !== canonicalTarget.targetKey || fs.processPath(target) !== fs.processPath(canonicalTarget)) {
      throw failure('The upload file belongs to another execution world or its alias changed', 'STALE_FILE_UPLOAD');
    }
    const info = await fs.stat(target, signal);
    if (info?.type !== 'file' || !Number.isSafeInteger(info.size) || info.size < 0) {
      throw failure('File uploads require an existing regular file with a known size', 'INVALID_FILE_UPLOAD');
    }
    const version = requiredText(info.version, 'DSH file version');
    if (previous && (previous.canonicalPath !== canonicalPath || previous.targetKey !== target.targetKey || previous.version !== version || previous.size !== info.size)) {
      throw failure('An upload file changed while waiting for approval', 'STALE_FILE_UPLOAD');
    }
    signal.throwIfAborted();
    return Object.freeze({ requestedPath, canonicalPath, target, targetKey: target.targetKey, version, size: info.size });
  }

  async #stagingRoot() {
    if (!this.#root) {
      const pending = (async () => {
        await mkdir(this.#directory, { recursive: true, mode: 0o700 });
        const parent = await realpath(this.#directory), root = join(parent, 'file-uploads');
        await mkdir(root, { recursive: true, mode: 0o700 });
        const info = await lstat(root);
        if (!info.isDirectory() || info.isSymbolicLink() || await realpath(root) !== root) throw failure('The private upload staging directory changed');
        await chmod(root, 0o700);
        return root;
      })();
      this.#root = pending;
      pending.catch(() => { if (this.#root === pending) this.#root = undefined; });
    }
    return await this.#root;
  }

  async #copyFile(current, source, directory, index, signal) {
    const container = join(directory, String(index));
    await mkdir(container, { mode: 0o700 });
    const path = join(container, basename(source.requestedPath)), output = await open(path, 'wx', 0o600), digest = createHash('sha256');
    try {
      if (typeof current.fs.readByteRange === 'function') {
        for (let offset = 0; offset < source.size;) {
          signal.throwIfAborted();
          const length = Math.min(COPY_CHUNK_BYTES, source.size - offset);
          const bytes = await current.fs.readByteRange(source.target, { offset, length }, signal);
          if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length) throw failure('The upload file changed during its private snapshot', 'STALE_FILE_UPLOAD');
          digest.update(bytes); await output.writeFile(bytes); offset += bytes.byteLength;
        }
      } else {
        const bytes = await current.fs.readBytes(source.target, signal, Math.max(1, source.size));
        if (!(bytes instanceof Uint8Array) || bytes.byteLength !== source.size) throw failure('The upload file changed during its private snapshot', 'STALE_FILE_UPLOAD');
        digest.update(bytes); await output.writeFile(bytes);
      }
      signal.throwIfAborted();
      await this.#resolveFile(current, source.requestedPath, signal, source);
      await output.sync(); await output.chmod(0o400);
      const info = await output.stat();
      return Object.freeze({ path, digest: digest.digest('hex'), size: info.size, device: info.dev, inode: info.ino });
    } finally { await output.close(); }
  }

  async #checkStaging(stage) {
    for (const file of stage.files) {
      stage.signal.throwIfAborted();
      const info = await lstat(file.path);
      if (!info.isFile() || info.isSymbolicLink() || await realpath(file.path) !== file.path) throw failure('An approved upload snapshot changed', 'STALE_FILE_UPLOAD');
      const handle = await open(file.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const before = await handle.stat(), digest = createHash('sha256'), buffer = Buffer.alloc(COPY_CHUNK_BYTES);
        if (before.dev !== file.device || before.ino !== file.inode || before.size !== file.size) throw failure('An approved upload snapshot was replaced', 'STALE_FILE_UPLOAD');
        for (;;) {
          stage.signal.throwIfAborted();
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
          if (!bytesRead) break;
          digest.update(buffer.subarray(0, bytesRead));
        }
        const after = await handle.stat();
        if (digest.digest('hex') !== file.digest || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
          throw failure('An approved upload snapshot changed', 'STALE_FILE_UPLOAD');
        }
      } finally { await handle.close(); }
    }
  }

  #track(current, operation) {
    const pending = Promise.resolve().then(operation);
    current.pending.add(pending);
    pending.then(() => current.pending.delete(pending), () => current.pending.delete(pending));
    return pending;
  }

  async ensureFileUploadAllowed(context) {
    const record = context?.record, current = this.#execution(record), key = tabKey(record);
    if (this.#busy.has(record)) throw failure('A file upload is already being prepared in this tab');
    if (!Array.isArray(context.files) || !context.files.length || context.files.length > MAX_FILES) throw failure('Invalid upload file list', 'INVALID_FILE_UPLOAD');
    const paths = context.files.slice();
    paths.forEach(path => absolutePath(path, 'Upload file path'));
    const target = Object.freeze({ ...context.target }), targetKey = receiverKey(target);
    if (!target.isMultiple && paths.length > 1) throw failure('The receiving file input does not accept multiple files', 'INVALID_FILE_UPLOAD');
    const controller = new AbortController();
    const signal = AbortSignal.any([current.signal, context.signal, controller.signal].filter(Boolean));
    const operationContext = { ...context, target, signal }, stage = { execution: current, key, record: Object.freeze({ id: record.id, browserId: record.browserId }),
      signal, controller, directory: null, files: [], sources: [], submitted: false, consumed: false, closed: false, cleanup: null };
    this.#busy.add(record); this.#stages.add(stage);
    return await this.#track(current, async () => {
      try {
        await this.#assertCurrent(current, operationContext, targetKey);
        for (const path of paths) stage.sources.push(await this.#resolveFile(current, path, signal));
        stage.directory = await mkdtemp(join(await this.#stagingRoot(), 'upload-'));
        for (let index = 0; index < stage.sources.length; index++) stage.files.push(await this.#copyFile(current, stage.sources[index], stage.directory, index, signal));
        await this.#assertCurrent(current, operationContext, targetKey);
        const list = stage.sources.map(file => file.canonicalPath).join('\n'), destination = target.origin;
        const scope = { get: name => current.exec.agent.ctx?.get?.(name) ?? this.#ctx?.get?.(name) };
        const decision = await requestHostAccessApproval(scope, { agent: current.agent, name: current.toolName, callId: current.callId, signal }, {
          resource: 'upload', target: destination,
          reason: `Upload these local files to the receiving document at ${destination}:\n${list}`,
          displayReason: { en: `Allow uploading these local files to the receiving document at ${destination}?\n${list}`,
            'zh-CN': `\u5141\u8bb8\u5c06\u4ee5\u4e0b\u672c\u5730\u6587\u4ef6\u4e0a\u4f20\u5230\u63a5\u6536\u6587\u6863\u6240\u5728\u7684 ${destination}\uff1f\n${list}` },
        });
        if (decision.outcome !== 'allowed-once') throw failure(`File upload was not approved (${decision.outcome})`, decision.outcome === 'cancelled' ? 'FILE_UPLOAD_CANCELLED' : 'FILE_UPLOAD_DENIED');
        await this.#assertCurrent(current, operationContext, targetKey);
        for (const source of stage.sources) await this.#resolveFile(current, source.requestedPath, signal, source);
        await this.#checkStaging(stage);
        await this.#assertCurrent(current, operationContext, targetKey);
        const files = Object.freeze(stage.files.map(file => file.path));
        const entry = { current, stage, context: operationContext, targetKey, committing: false, claimed: false };
        const receipt = Object.freeze({ allowed: true, files, target,
          commit: action => this.#track(current, async () => {
            if (typeof action !== 'function' || stage.consumed || stage.closed) throw failure('The file upload approval was already consumed', 'STALE_FILE_UPLOAD');
            stage.consumed = true;
            await this.#assertCurrent(current, operationContext, targetKey);
            for (const source of stage.sources) await this.#resolveFile(current, source.requestedPath, signal, source);
            await this.#checkStaging(stage);
            await this.#assertCurrent(current, operationContext, targetKey);
            // Once paths enter Chromium, neither ACK nor a disconnected CDP
            // channel proves that the receiving document has finished reading.
            const adapter = operationContext.browserService && this.#browserAdapters.get(operationContext.browserService);
            if (operationContext.browserService && !adapter) throw failure('The native browser has no trusted approved-file submission bridge');
            entry.committing = true;
            try {
              if (adapter) return await adapter.submitApprovedUpload(receipt, action);
              stage.submitted = true;
              return await action(files);
            }
            finally { entry.committing = false; }
          }),
          dispose: () => { this.#approvalReceipts.delete(receipt); return this.#cleanupStage(stage, false); },
        });
        this.#approvalReceipts.set(receipt, entry);
        return receipt;
      } catch (error) {
        try { await this.#cleanupStage(stage, false); }
        catch (cleanup) { throw new AggregateError([error, cleanup], 'File upload authorization and staging cleanup failed', { cause: error }); }
        throw error;
      } finally { this.#busy.delete(record); }
    });
  }

  // Download source policy remains optional; upload approval adds no download gate.
  ensureDownloadSourcePolicyAllowed(context) { checkOperation(context); return true; }

  #cleanupStage(stage, physicallyClosed) {
    if (stage.submitted && !physicallyClosed) return Promise.resolve();
    if (stage.cleanup) return stage.cleanup;
    stage.closed = true; stage.controller.abort(failure('The file upload snapshot has been released', 'STALE_FILE_UPLOAD'));
    const pending = (async () => {
      if (stage.directory) await rm(stage.directory, { recursive: true, force: true });
      this.#stages.delete(stage);
    })().finally(() => { if (stage.cleanup === pending) stage.cleanup = null; });
    stage.cleanup = pending;
    return pending;
  }

  async #cleanupWhere(predicate) {
    const results = await Promise.allSettled([...this.#stages].filter(predicate).map(stage => this.#cleanupStage(stage, true)));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Private upload staging cleanup failed');
  }

  // Called by the browser owner only after actual tab closure, never Page.close
  // alone: Playwright also emits that event for a controller disconnection.
  async releaseTab(record) {
    const key = tabKey(record);
    await this.#cleanupWhere(stage => stage.key === key);
  }

  retainedUploads() {
    return [...this.#stages].filter(stage => stage.submitted).map(stage => ({ browserId: stage.record.browserId, tabId: stage.record.id,
      directory: stage.directory, reason: 'Waiting for actual tab closure before deleting files exposed to its document' }));
  }

  async close() {
    this.#closed = true;
    for (const current of this.#executions.values()) { current.ended = true; current.controller.abort(failure('The plugin file policy has closed')); }
    await Promise.allSettled([...this.#executions.values()].flatMap(current => [...current.pending]));
    this.#executions.clear();
    await this.#cleanupWhere(stage => !stage.submitted);
  }
}
