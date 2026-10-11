import { randomUUID } from "node:crypto";
import { chmodSync, constants, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { lstat, mkdir, mkdtemp, open, realpath, rm, rmdir, stat, unlink } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { DesktopComputerUseBrowser } from "./browser.mjs";
function fail(message, code = "FILE_UPLOAD_UNAVAILABLE") {
  return Object.assign(new Error(`desktop file policy: ${message}`), { code });
}
function cleanupFailure(errors) {
  return Object.assign(new AggregateError(errors, "desktop file policy: cleanup did not complete"), { code: "FILE_GRANT_CLEANUP_FAILED", released: false });
}
function object(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw fail("expected a data object", "INVALID_FILE_UPLOAD");
  return value;
}
function text(value, maximum) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.includes("\0")) throw fail("invalid grant field", "INVALID_FILE_UPLOAD");
  return value;
}
function localPath(value) {
  const path = text(value, 32768);
  if (!isAbsolute(path)) throw fail("only absolute files on this Host can be granted", "INVALID_FILE_UPLOAD");
  return path;
}
function exactKeys(value, keys) {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) throw fail("unexpected grant fields", "INVALID_FILE_UPLOAD");
}
function decision(value) {
  const input = object(value);
  exactKeys(input, ["requestId", "decision", "files"]);
  if (input.decision !== "allowed-once" && input.decision !== "denied") throw fail("invalid grant decision", "INVALID_FILE_UPLOAD");
  if (!Array.isArray(input.files) || input.files.length > 128) throw fail("grant file list exceeds the protocol limit", "INVALID_FILE_UPLOAD");
  return { requestId: text(input.requestId, 128), decision: input.decision, files: input.files.map((value2) => {
    const file = object(value2);
    exactKeys(file, ["requestedPath", "canonicalPath", "version"]);
    return { requestedPath: localPath(file.requestedPath), canonicalPath: localPath(file.canonicalPath), version: text(file.version, 4096) };
  }) };
}
function sameFile(first, second) {
  return first.isFile() && second.isFile() && first.dev === second.dev && first.ino === second.ino && first.size === second.size && first.mtimeNs === second.mtimeNs && first.ctimeNs === second.ctimeNs;
}
function codeOf(error) {
  return error instanceof Error && "code" in error ? error.code : void 0;
}
class DesktopComputerUseFilePolicy {
  /** @param options - native identity checks, private storage, and the trusted Host event route. */
  constructor(options) {
    this.options = options;
    if (!isAbsolute(options.storageDirectory)) throw fail("storage directory must be absolute");
    mkdirSync(options.storageDirectory, { recursive: true, mode: 448 });
    const info = lstatSync(options.storageDirectory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw fail("storage directory must be a real private directory");
    if (process.getuid !== void 0 && info.uid !== process.getuid()) throw fail("storage directory must belong to this Host user");
    this.directory = realpathSync(resolve(options.storageDirectory));
    chmodSync(this.directory, 448);
  }
  directory;
  pending = /* @__PURE__ */ new Map();
  terminals = /* @__PURE__ */ new Map();
  stages = /* @__PURE__ */ new Map();
  authorizations = /* @__PURE__ */ new Set();
  resolutions = /* @__PURE__ */ new Set();
  closingController = new AbortController();
  closing = false;
  disposed = false;
  disposal;
  /**
   * Request one Agent-audited grant before any file bytes are read.
   * @param request - native browser-issued identities and source paths.
   * @param signal - cancels the pending approval or immutable-copy preparation.
   * @returns private approved copies; generic model decisions and arbitrary paths never grant access.
   */
  authorize(request, signal) {
    const work = this.performAuthorization(request, signal);
    this.authorizations.add(work);
    void work.finally(() => {
      this.authorizations.delete(work);
    }).catch((_error) => {
    });
    return work;
  }
  /**
   * Consume a main-issued nonce from the private, authenticated Node Host RPC only.
   * @param method - must be fileUpload.resolve; renderer invoke routes must reject it.
   * @param params - exact Node policy decision and filesystem-mapped file versions.
   * @param options - cancellation of this resolution RPC.
   * @returns the actual terminal nonce decision, never website-upload or file-cleanup completion.
   */
  handle(method, params, options = {}) {
    if (method !== "fileUpload.resolve") return Promise.reject(fail("unsupported private file operation", "UNSUPPORTED_OPERATION"));
    const work = this.resolveDecision(decision(params), options.signal);
    this.resolutions.add(work);
    void work.finally(() => {
      this.resolutions.delete(work);
    }).catch((_error) => {
    });
    return work;
  }
  /** Cancel approvals before the browser begins stopping; already dispatched copies stay intact. */
  beginDispose() {
    this.closing = true;
    this.closingController.abort(fail("provider is stopping", "FILE_UPLOAD_CANCELLED"));
  }
  /**
   * Remove copies only after authoritative native tab destruction.
   * @param tabId - a real tab whose destroyed event was observed by the provider.
   * @returns after every private directory for that tab was removed; failures stay registered for retry.
   */
  async releaseTab(tabId) {
    if (!this.options.isTabDestroyed(tabId)) throw fail("private copies remain while their tab is alive", "FILE_GRANT_STILL_IN_USE");
    const results = await Promise.allSettled([...this.stages.values()].filter((stage) => stage.tabId === tabId).map((stage) => this.removeStage(stage)));
    const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (errors.length) throw cleanupFailure(errors);
  }
  /**
   * Reach quiescence after the browser physically destroys all owned tabs.
   * @returns after approval jobs, file descriptors, and private directories are gone.
   */
  async dispose() {
    if (this.disposed) return;
    if (this.disposal !== void 0) return this.disposal;
    this.beginDispose();
    const work = this.disposeOwned();
    this.disposal = work;
    try {
      await work;
    } finally {
      if (this.disposal === work) this.disposal = void 0;
    }
  }
  async disposeOwned() {
    await Promise.allSettled([...this.authorizations, ...this.resolutions]);
    const results = await Promise.allSettled([...this.stages.values()].map(async (stage) => {
      if (stage.dispatched && !this.options.isTabDestroyed(stage.tabId)) throw fail("a browser tab still owns approved copies", "FILE_GRANT_STILL_IN_USE");
      await this.removeStage(stage);
    }));
    const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (errors.length) throw cleanupFailure(errors);
    this.disposed = true;
  }
  async performAuthorization(request, signal) {
    if (this.closing) throw fail("provider is stopping", "FILE_UPLOAD_CANCELLED");
    const joined = AbortSignal.any([this.closingController.signal, ...signal === void 0 ? [] : [signal]]);
    joined.throwIfAborted();
    if (!request.files.length || request.files.length > 128) throw fail("approval requires one to 128 files", "INVALID_FILE_UPLOAD");
    await this.options.validateRequest(request, joined);
    const files = [];
    for (const path of request.files) {
      joined.throwIfAborted();
      const requestedPath = localPath(path), canonicalPath = localPath(await realpath(requestedPath));
      const snapshot = await stat(canonicalPath, { bigint: true });
      if (!snapshot.isFile()) throw fail("uploads require regular files", "INVALID_FILE_UPLOAD");
      files.push({ requestedPath, canonicalPath, snapshot });
    }
    joined.throwIfAborted();
    await this.options.validateRequest(request, joined);
    let accept;
    let reject;
    const approved = new Promise((resolveGrant, rejectGrant) => {
      accept = resolveGrant;
      reject = rejectGrant;
    });
    void approved.catch((_error) => {
    });
    const controller = new AbortController();
    const pending = {
      id: randomUUID(),
      request,
      files,
      signal: AbortSignal.any([joined, controller.signal]),
      controller,
      state: "waiting",
      resolve: accept,
      reject
    };
    this.pending.set(pending.id, pending);
    const abort = () => {
      this.rejectPending(pending, fail("approval was cancelled", "FILE_UPLOAD_CANCELLED"), "cancelled");
    };
    pending.signal.addEventListener("abort", abort, { once: true });
    try {
      pending.signal.throwIfAborted();
      this.options.onEvent("file-upload-requested", {
        requestId: pending.id,
        ...(request.transferId === undefined ? {} : { transferId: request.transferId }),
        tabId: request.tabId,
        leaseId: request.leaseId,
        actorId: request.actorId,
        rootTargetId: request.rootTargetId,
        rootUrl: request.rootUrl,
        targetId: request.targetId,
        ...request.sessionId === void 0 ? {} : { sessionId: request.sessionId },
        frameId: request.frameId,
        loaderId: request.loaderId,
        documentBackendNodeId: request.documentBackendNodeId,
        backendNodeId: request.backendNodeId,
        url: request.url,
        origin: request.origin,
        files: files.map((file) => ({ requestedPath: file.requestedPath, canonicalPath: file.canonicalPath }))
      });
      return await approved;
    } catch (error) {
      this.rejectPending(pending, error, pending.signal.aborted ? "cancelled" : "failed");
      throw error;
    } finally {
      pending.signal.removeEventListener("abort", abort);
    }
  }
  rejectPending(pending, error, terminal) {
    if (pending.state === "settled") return;
    pending.state = "settled";
    this.terminals.set(pending.id, terminal);
    if (this.pending.get(pending.id) === pending) this.pending.delete(pending.id);
    pending.controller.abort(error);
    pending.reject(error);
  }
  async resolveDecision(value, signal) {
    signal?.throwIfAborted();
    const pending = this.pending.get(value.requestId);
    const terminal = this.terminals.get(value.requestId);
    if (pending === void 0 && value.decision === "denied" && terminal !== void 0) return { resolved: true, requestId: value.requestId, terminal };
    if (this.closing || pending === void 0 || pending.state === "settled") throw fail("grant nonce was withdrawn or already consumed", "STALE_FILE_GRANT");
    if (value.decision === "denied") {
      this.rejectPending(pending, fail("the Agent did not approve these files", "FILE_UPLOAD_DENIED"), "denied");
      return { resolved: true, requestId: pending.id, terminal: "denied" };
    }
    if (pending.state !== "waiting") throw fail("grant nonce is already resolving", "STALE_FILE_GRANT");
    pending.state = "resolving";
    const joined = AbortSignal.any([pending.signal, ...signal === void 0 ? [] : [signal]]);
    let stage;
    try {
      joined.throwIfAborted();
      if (value.files.length !== pending.files.length || value.files.some((file, index) => file.requestedPath !== pending.files[index]?.requestedPath || file.canonicalPath !== pending.files[index]?.canonicalPath)) throw fail("approved files do not match the native request", "STALE_FILE_GRANT");
      await this.options.validateRequest(pending.request, joined);
      for (const file of pending.files) await this.assertSource(file, joined);
      stage = await this.copyApprovedFiles(pending, joined);
      joined.throwIfAborted();
      await this.options.validateRequest(pending.request, joined);
      joined.throwIfAborted();
      if (pending.state !== "resolving" || this.pending.get(pending.id) !== pending || this.closing) throw fail("grant was cancelled while preparing copies", "STALE_FILE_GRANT");
      const grant = this.grant(stage);
      pending.state = "settled";
      this.terminals.set(pending.id, "allowed-once");
      this.pending.delete(pending.id);
      pending.resolve(grant);
      return { resolved: true, requestId: pending.id, terminal: "allowed-once" };
    } catch (error) {
      this.rejectPending(pending, error, joined.aborted ? "cancelled" : "failed");
      if (stage !== void 0) {
        try {
          await this.removeStage(stage);
        } catch (cleanupError) {
          throw cleanupFailure([error, cleanupError]);
        }
      }
      throw error;
    }
  }
  async assertSource(file, signal) {
    signal.throwIfAborted();
    if (await realpath(file.requestedPath) !== file.canonicalPath || !sameFile(file.snapshot, await stat(file.canonicalPath, { bigint: true }))) throw fail("an approved file changed", "STALE_FILE_GRANT");
    signal.throwIfAborted();
  }
  async copyApprovedFiles(pending, signal) {
    const path = await mkdtemp(join(this.directory, "grant-"));
    const stage = { path, tabId: pending.request.tabId, identity: void 0, files: [], handles: /* @__PURE__ */ new Set(), copying: Promise.resolve(), dispatched: false, released: false };
    this.stages.set(path, stage);
    stage.copying = (async () => {
      stage.identity = await lstat(path, { bigint: true });
      if (!stage.identity.isDirectory() || stage.identity.isSymbolicLink()) throw fail("private copy directory changed after allocation", "FILE_GRANT_IO_FAILED");
      for (const [index, file] of pending.files.entries()) {
        signal.throwIfAborted();
        const directory = join(path, String(index));
        await mkdir(directory, { mode: 448 });
        const target = join(directory, basename(file.requestedPath));
        await this.copyFile(stage, file, target, signal);
        stage.files.push(target);
      }
    })();
    try {
      await stage.copying;
      return stage;
    } catch (error) {
      try {
        await this.removeStage(stage);
      } catch (cleanupError) {
        throw cleanupFailure([error, cleanupError]);
      }
      throw error;
    }
  }
  async copyFile(stage, file, destination, signal) {
    const handles = [];
    let failure;
    try {
      await this.assertSource(file, signal);
      const source = await open(file.canonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      handles.push(source);
      stage.handles.add(source);
      if (!sameFile(file.snapshot, await source.stat({ bigint: true }))) throw fail("approved file identity changed before reading", "STALE_FILE_GRANT");
      const target = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 384);
      handles.push(target);
      stage.handles.add(target);
      const buffer = Buffer.allocUnsafe(256 * 1024);
      let total = 0n;
      while (true) {
        signal.throwIfAborted();
        const { bytesRead } = await source.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        total += BigInt(bytesRead);
        if (total > file.snapshot.size) throw fail("approved file grew during copying", "STALE_FILE_GRANT");
        let offset = 0;
        while (offset < bytesRead) {
          signal.throwIfAborted();
          const { bytesWritten } = await target.write(buffer, offset, bytesRead - offset, null);
          if (bytesWritten === 0) throw fail("private copy did not advance", "FILE_GRANT_IO_FAILED");
          offset += bytesWritten;
        }
      }
      if (total !== file.snapshot.size || !sameFile(file.snapshot, await source.stat({ bigint: true }))) throw fail("approved file changed while copying", "STALE_FILE_GRANT");
      await target.sync();
      await target.chmod(256);
      signal.throwIfAborted();
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      const results = await Promise.allSettled(handles.map((handle) => this.closeHandle(stage, handle)));
      const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
      if (errors.length) throw cleanupFailure(failure === void 0 ? errors : [failure, ...errors]);
    }
  }
  async closeHandle(stage, handle) {
    try {
      await handle.close();
    } catch (error) {
      if (codeOf(error) !== "EBADF") throw error;
    }
    stage.handles.delete(handle);
  }
  grant(stage) {
    return { files: Object.freeze([...stage.files]), markDispatched: () => {
      if (this.closing || stage.released || this.stages.get(stage.path) !== stage || this.options.isTabDestroyed(stage.tabId)) throw fail("approved copy is no longer available", "STALE_FILE_GRANT");
      stage.dispatched = true;
    }, release: async () => {
      stage.released = true;
      if (!stage.dispatched) await this.removeStage(stage);
    } };
  }
  removeStage(stage) {
    if (stage.cleanup !== void 0) return stage.cleanup;
    if (this.stages.get(stage.path) !== stage) return Promise.resolve();
    const work = (async () => {
      await Promise.allSettled([stage.copying]);
      const handles = await Promise.allSettled([...stage.handles].map((handle) => this.closeHandle(stage, handle)));
      const errors = handles.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
      if (errors.length) throw cleanupFailure(errors);
      let current;
      try {
        current = await lstat(stage.path, { bigint: true });
      } catch (error) {
        if (codeOf(error) !== "ENOENT") throw error;
        this.stages.delete(stage.path);
        return;
      }
      if (current.isSymbolicLink()) await unlink(stage.path);
      else {
        if (!current.isDirectory()) throw fail("private copy directory changed before cleanup", "FILE_GRANT_CLEANUP_FAILED");
        if (stage.identity === void 0) await rmdir(stage.path);
        else {
          if (current.dev !== stage.identity.dev || current.ino !== stage.identity.ino) throw fail("private copy directory changed before cleanup", "FILE_GRANT_CLEANUP_FAILED");
          await rm(stage.path, { recursive: true });
        }
      }
      if (this.stages.get(stage.path) === stage) this.stages.delete(stage.path);
    })();
    stage.cleanup = work;
    void work.finally(() => {
      if (stage.cleanup === work) stage.cleanup = void 0;
    }).catch((_error) => {
    });
    return work;
  }
}
function createDesktopComputerUseBrowserWithFilePolicy(options) {
  let browser;
  const filePolicy = new DesktopComputerUseFilePolicy({
    storageDirectory: options.fileStorageDirectory,
    onEvent: options.browser.onEvent,
    validateRequest: (request, signal) => browser.assertFileUploadRequest(request, signal),
    isTabDestroyed: (tabId) => browser.isTabDestroyed(tabId)
  });
  browser = new DesktopComputerUseBrowser({
    ...options.browser,
    authorizeFileUpload: (request, signal) => filePolicy.authorize(request, signal),
    releaseFileUploadsForTab: (tabId) => filePolicy.releaseTab(tabId)
  });
  return { browser, filePolicy };
}
export {
  DesktopComputerUseFilePolicy,
  createDesktopComputerUseBrowserWithFilePolicy
};
