import { isAbsolute } from 'node:path';

const MAX_FILES = 128;
const REPLY_TIMEOUT_MS = 10000;
const TERMINAL_DECISIONS = new Set(['cancelled', 'denied', 'allowed-once', 'failed']);
const fail = (message, code = 'FILE_UPLOAD_UNAVAILABLE') => Object.assign(new Error(message), { code });

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(`${label} must be an object`, 'INVALID_FILE_UPLOAD');
  const result = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!('value' in descriptor)) throw fail(`${label}.${key} must be a data property`, 'INVALID_FILE_UPLOAD');
    Object.defineProperty(result, key, { value: descriptor.value, enumerable: true });
  }
  return result;
}

function text(value, label) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw fail(`Invalid ${label}`, 'INVALID_FILE_UPLOAD');
  return value;
}

function localPath(value, label) {
  const path = text(value, label);
  if (!isAbsolute(path)) throw fail(`${label} must be an absolute local path`, 'INVALID_FILE_UPLOAD');
  return path;
}

function nativeNodeId(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw fail(`Invalid ${label}`, 'INVALID_FILE_UPLOAD');
  return value;
}

function origin(value) {
  const url = new URL(text(value, 'browser URL'));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw fail('File uploads require an HTTP(S) browser origin', 'INVALID_FILE_UPLOAD');
  return url.origin;
}

function binding(value) {
  const input = object(value, 'Browser actor binding');
  if (!Number.isSafeInteger(input.tabId) || input.tabId <= 0) throw fail('Invalid browser tabId', 'INVALID_FILE_UPLOAD');
  return Object.freeze({ epoch: text(input.epoch, 'browser epoch'), tabId: input.tabId,
    leaseId: text(input.leaseId, 'browser leaseId'), actorId: text(input.actorId, 'browser actorId'),
    rootTargetId: text(input.rootTargetId, 'browser rootTargetId'), rootUrl: text(input.rootUrl, 'browser rootUrl') });
}

function bindingKey(value) { return JSON.stringify([value.epoch, value.tabId, value.leaseId, value.actorId]); }
function sameBinding(first, second) { return bindingKey(first) === bindingKey(second) && first.rootTargetId === second.rootTargetId && first.rootUrl === second.rootUrl; }

function uploadRequest(value, epoch) {
  const input = object(value, 'Native file upload request'), actor = binding({ ...input, epoch });
  if (!Array.isArray(input.files) || !input.files.length || input.files.length > MAX_FILES) throw fail('Invalid native upload file list', 'INVALID_FILE_UPLOAD');
  const files = input.files.map(value => {
    const file = object(value, 'Native upload file');
    return Object.freeze({ requestedPath: localPath(file.requestedPath, 'requestedPath'), canonicalPath: localPath(file.canonicalPath, 'canonicalPath') });
  });
  const url = text(input.url, 'receiving document URL'), destination = origin(url);
  if (text(input.origin, 'receiving document origin') !== destination) throw fail('Native upload origin does not match its receiving document URL', 'STALE_FILE_UPLOAD');
  origin(actor.rootUrl);
  return Object.freeze({ ...actor, requestId: text(input.requestId, 'native upload requestId'),
    targetId: text(input.targetId, 'browser targetId'), ...(input.sessionId === undefined ? {} : { sessionId: text(input.sessionId, 'browser target sessionId') }),
    frameId: text(input.frameId, 'receiving frameId'), loaderId: text(input.loaderId, 'receiving loaderId'),
    documentBackendNodeId: nativeNodeId(input.documentBackendNodeId, 'receiving documentBackendNodeId'),
    backendNodeId: nativeNodeId(input.backendNodeId, 'receiving backendNodeId'),
    url, origin: destination, files: Object.freeze(files) });
}

function openTurn(session) {
  if (!Number.isSafeInteger(session?.seq) || typeof session.eventAt !== 'function') throw fail('File upload requires a live DSH session');
  for (let sequence = session.seq - 1; sequence >= 0; sequence--) {
    const type = session.eventAt(sequence)?.type;
    if (type === 'turn/end') throw fail('File upload execution turn has ended', 'STALE_FILE_UPLOAD');
    if (type === 'turn/start') return sequence;
  }
  throw fail('File upload requires an open DSH turn');
}

function filesystem(scope, fallback) {
  const fs = scope?.get?.('fs') ?? fallback.get?.('fs');
  if (!['resolve', 'stat', 'processPath', 'processPathFromHostPath'].every(method => typeof fs?.[method] === 'function')) throw fail('The DSH filesystem cannot authorize native uploads');
  return fs;
}

function joinedSignal(signals) { return AbortSignal.any(signals.filter(Boolean)); }

// Receives native requests only from the authenticated Desktop service. Real
// tool executions and actor associations stay in this process, outside REPL metadata.
export class DesktopFileUploadPolicy {
  #ctx; #service; #executions = new Map(); #actors = new Map(); #pending = new Map(); #seen = new Map();
  #unsubscribe; #cleanup; #closed = false; #closing;

  constructor(ctx, service) { this.#ctx = ctx; this.#service = service; }

  start() {
    if (this.#closed || this.#unsubscribe) throw fail('Native file upload policy is unavailable or already started');
    if (this.#service?.version !== 1 || typeof this.#service.request !== 'function' || typeof this.#service.subscribe !== 'function') throw fail('Native file upload requires the real Desktop service');
    const unsubscribe = this.#service.subscribe(event => this.#receive(event), error => {
      void this.close().catch(failure => this.#report(failure ?? error));
    });
    if (typeof unsubscribe !== 'function') throw fail('Desktop upload subscription did not return a disposer');
    this.#unsubscribe = unsubscribe;
    try {
      if (typeof this.#service.registerCleanup === 'function') this.#cleanup = this.#service.registerCleanup(() => this.close());
    } catch (error) { unsubscribe(); this.#unsubscribe = undefined; throw error; }
    return this;
  }

  registerExecution(exec, { cwd, signal } = {}) {
    if (this.#closed || !this.#unsubscribe) throw fail('Native upload policy is not listening');
    const session = exec?.agent?.session;
    const turn = openTurn(session);
    text(session.id, 'DSH sessionId'); text(exec.callId, 'DSH callId'); text(exec.name, 'DSH toolName');
    if (!exec.signal || typeof exec.signal.addEventListener !== 'function') throw fail('Native upload requires the actual tool cancellation signal');
    const controller = new AbortController(), token = Object.freeze({});
    const current = { token, exec, session, turn, cwd: localPath(cwd, 'DSH working directory'), fs: filesystem(exec.agent.ctx, this.#ctx),
      controller, signal: joinedSignal([exec.signal, signal, controller.signal]), actors: new Set() };
    current.signal.throwIfAborted();
    this.#executions.set(token, current);
    return token;
  }

  bindActor(token, value, { signal, inspect } = {}) {
    const input = object(value, 'Browser actor binding');
    const execution = this.#execution(token), current = binding(input), key = bindingKey(current);
    if (input.actionSignal !== undefined && !(input.actionSignal instanceof AbortSignal)) throw fail('Native upload requires the actual browser action signal', 'INVALID_FILE_UPLOAD');
    input.actionSignal?.throwIfAborted();
    if (typeof inspect !== 'function') throw fail('Native upload requires a current selected-tab inspector');
    if (this.#service.epoch !== current.epoch || this.#actors.has(key)) throw fail('Native browser actor changed or is already bound', 'STALE_FILE_UPLOAD');
    const controller = new AbortController(), actor = { ...current, key, execution, inspect, controller,
      signal: joinedSignal([execution.signal, signal, input.actionSignal, controller.signal]) };
    actor.signal.throwIfAborted();
    execution.actors.add(actor); this.#actors.set(key, actor);
    return async () => { this.#removeActor(actor); await this.#cancelPending(pending => pending.actor === actor); };
  }

  #execution(token) {
    const execution = this.#executions.get(token);
    if (this.#closed || !execution || execution.exec.agent.session !== execution.session || openTurn(execution.session) !== execution.turn) throw fail('Native upload execution is no longer active', 'STALE_FILE_UPLOAD');
    execution.signal.throwIfAborted();
    if (filesystem(execution.exec.agent.ctx, this.#ctx) !== execution.fs) throw fail('Native upload filesystem changed', 'STALE_FILE_UPLOAD');
    return execution;
  }

  async #assertCurrent(actor, request) {
    this.#execution(actor.execution.token); actor.signal.throwIfAborted();
    if (this.#service.epoch !== request.epoch || this.#actors.get(actor.key) !== actor || !sameBinding(actor, request)) throw fail('Native upload browser binding changed', 'STALE_FILE_UPLOAD');
    const inspected = binding(await actor.inspect(actor.signal));
    actor.signal.throwIfAborted(); this.#execution(actor.execution.token);
    if (!sameBinding(actor, inspected) || !sameBinding(inspected, request)) throw fail('The selected browser page changed during upload approval', 'STALE_FILE_UPLOAD');
  }

  async #resolveFiles(actor, request, previous) {
    const { fs, cwd } = actor.execution, result = [];
    for (let index = 0; index < request.files.length; index++) {
      actor.signal.throwIfAborted();
      const file = request.files[index], mapped = fs.processPathFromHostPath(file.requestedPath), mappedCanonical = fs.processPathFromHostPath(file.canonicalPath);
      if (typeof mapped !== 'string' || typeof mappedCanonical !== 'string') throw fail('The execution filesystem does not share this native Host file');
      localPath(mapped, 'mapped upload file'); localPath(mappedCanonical, 'mapped canonical upload file');
      const target = await fs.resolve(mapped, { cwd, signal: actor.signal });
      const canonicalTarget = await fs.resolve(mappedCanonical, { cwd, signal: actor.signal });
      const canonicalPath = localPath(fs.processPath(target), 'resolved upload file');
      if (canonicalPath !== file.canonicalPath || fs.processPath(canonicalTarget) !== file.canonicalPath || target.targetKey !== canonicalTarget.targetKey) throw fail('Native upload file alias changed or belongs to another execution world', 'STALE_FILE_UPLOAD');
      const info = await fs.stat(target, actor.signal);
      if (info?.type !== 'file') throw fail('Native uploads require existing regular files', 'INVALID_FILE_UPLOAD');
      const version = text(info.version, 'DSH file version');
      if (previous && (previous[index].targetKey !== target.targetKey || previous[index].version !== version)) throw fail('An upload file changed while waiting for approval', 'STALE_FILE_UPLOAD');
      result.push(Object.freeze({ requestedPath: file.requestedPath, canonicalPath, version, targetKey: target.targetKey }));
    }
    return Object.freeze(result);
  }

  #receive(event) {
    if (this.#closed || !event || event.epoch !== this.#service.epoch) return;
    if (event.event === 'actor-stopped' || event.event === 'stopped') {
      for (const actor of [...this.#actors.values()]) if (actor.epoch === event.epoch && actor.tabId === event.params?.tabId && actor.leaseId === event.params?.leaseId
        && (event.event !== 'actor-stopped' || actor.actorId === event.params?.actorId)) {
        this.#removeActor(actor); void this.#cancelPending(pending => pending.actor === actor).catch(error => this.#report(error));
      }
      return;
    }
    if (event.event !== 'file-upload-requested') return;
    let request;
    try { request = uploadRequest(event.params, event.epoch); }
    catch (error) {
      const requestId = typeof event.params?.requestId === 'string' ? event.params.requestId : null;
      if (requestId) void this.#reply(requestId, 'denied', [], undefined, event.epoch).catch(failure => this.#report(failure));
      this.#report(error); return;
    }
    const key = JSON.stringify([request.epoch, request.requestId]);
    if (this.#seen.has(key)) return;
    const actor = this.#actors.get(bindingKey(request));
    this.#seen.set(key, actor?.execution.token ?? null);
    const pending = { key, request, actor, replyStarted: false, allowedAttempted: false, decisionClosed: false, denialPromise: null, operationSettled: false, operation: null };
    this.#pending.set(key, pending);
    pending.operation = this.#authorize(pending).catch(error => this.#report(error)).finally(() => {
      pending.operationSettled = true;
      this.#retire(pending);
    });
  }

  async #authorize(pending) {
    const { actor, request } = pending;
    try {
      if (!actor) throw fail('No real active tool execution owns this native browser actor');
      await this.#assertCurrent(actor, request);
      const files = await this.#resolveFiles(actor, request);
      await this.#assertCurrent(actor, request);
      const approval = actor.execution.exec.agent.ctx?.get?.('approval') ?? this.#ctx.get?.('approval');
      if (typeof approval?.request !== 'function') throw fail('No DSH approval channel is composed');
      const list = files.map(file => file.canonicalPath).join('\n');
      const outcome = await approval.request({ agent: actor.execution.exec.agent, toolName: actor.execution.exec.name, callId: actor.execution.exec.callId,
        reason: `Upload these local files to the receiving document at ${request.origin}:\n${list}`,
        displayReason: { en: `Allow uploading these local files to the receiving document at ${request.origin}?\n${list}`, 'zh-CN': `\u5141\u8bb8\u5c06\u4ee5\u4e0b\u672c\u5730\u6587\u4ef6\u4e0a\u4f20\u5230\u63a5\u6536\u6587\u6863\u6240\u5728\u7684 ${request.origin}\uff1f\n${list}` },
        signal: actor.signal });
      if (outcome !== 'allowed-once') throw fail(`Native file upload was not approved (${typeof outcome === 'string' ? outcome : 'unavailable'})`, outcome === 'cancelled' ? 'FILE_UPLOAD_CANCELLED' : 'FILE_UPLOAD_DENIED');
      await this.#assertCurrent(actor, request);
      const fresh = await this.#resolveFiles(actor, request, files);
      await this.#assertCurrent(actor, request);
      if (pending.replyStarted) throw fail('Native file upload decision was already withdrawn', 'STALE_FILE_UPLOAD');
      pending.replyStarted = true; pending.allowedAttempted = true;
      await this.#reply(request.requestId, 'allowed-once', fresh.map(({ requestedPath, canonicalPath, version }) => ({ requestedPath, canonicalPath, version })), actor.signal, request.epoch);
    } catch (error) {
      if (!pending.replyStarted) await this.#deny(pending);
      throw error;
    }
  }

  #releasing() { return this.#service.draining === true || this.#service.hostClosing === true || this.#service.released === true; }

  async #released(epoch) {
    if (typeof epoch !== 'string' || !epoch || this.#service.epoch !== epoch || typeof this.#service.waitForRelease !== 'function') throw fail('Native upload cancellation has no matching provider release waiter', 'FILE_UPLOAD_RELEASE_UNCONFIRMED');
    const proof = await this.#service.waitForRelease();
    if (!proof || proof.epoch !== epoch || this.#service.epoch !== epoch || proof.released !== true || proof.providerClosed !== true) throw fail('Native upload cancellation has no matching physical release proof', 'FILE_UPLOAD_RELEASE_UNCONFIRMED');
  }

  async #reply(requestId, decision, files, signal, epoch) {
    // Physical release proves a cancellation only. It never grants an upload.
    if (decision === 'denied' && this.#releasing()) { await this.#released(epoch); return; }
    if (this.#service.epoch !== epoch) throw fail('Native upload Host generation changed before its decision', 'STALE_FILE_UPLOAD');
    try {
      const reply = await this.#service.request('fileUpload.resolve', { requestId, decision, files }, { signal, timeoutMs: REPLY_TIMEOUT_MS });
      if (!reply || reply.resolved !== true || reply.requestId !== requestId) throw fail('Native upload decision was not acknowledged', 'INVALID_FILE_UPLOAD_RESPONSE');
      if (reply.terminal !== undefined && !TERMINAL_DECISIONS.has(reply.terminal)) throw fail('Native upload decision returned an invalid terminal state', 'INVALID_FILE_UPLOAD_RESPONSE');
      if (this.#service.epoch !== epoch) throw fail('Native upload Host generation changed while acknowledging its decision', 'STALE_FILE_UPLOAD');
      if (decision === 'allowed-once') {
        signal?.throwIfAborted();
        if (this.#releasing() || reply.terminal !== undefined && reply.terminal !== 'allowed-once') throw fail('Native upload provider closed or rejected its decision', 'FILE_UPLOAD_CANCELLED');
      }
      // A closed nonce acknowledges its decision, not upload completion or revocation.
    } catch (error) {
      if (decision === 'denied' && this.#releasing()) { await this.#released(epoch); return; }
      throw error;
    }
  }

  #retire(pending) {
    if (!pending.operationSettled || !pending.allowedAttempted && !pending.decisionClosed) return;
    if (this.#pending.get(pending.key) === pending) this.#pending.delete(pending.key);
    if (this.#seen.get(pending.key) === null) this.#seen.delete(pending.key);
  }

  #deny(pending) {
    if (pending.decisionClosed) return Promise.resolve();
    if (pending.denialPromise) return pending.denialPromise;
    pending.replyStarted = true;
    const denial = this.#reply(pending.request.requestId, 'denied', [], undefined, pending.request.epoch).then(() => {
      pending.decisionClosed = true; this.#retire(pending);
    });
    pending.denialPromise = denial;
    void denial.finally(() => { if (pending.denialPromise === denial) pending.denialPromise = null; }).catch(() => {});
    return denial;
  }

  #removeActor(actor) {
    actor.controller.abort(fail('Native upload browser actor was released', 'FILE_UPLOAD_CANCELLED'));
    if (this.#actors.get(actor.key) === actor) this.#actors.delete(actor.key);
    actor.execution.actors.delete(actor);
  }

  async #cancelPending(matches) {
    const selected = [...this.#pending.values()].filter(matches), replies = [];
    for (const pending of selected) if (!pending.allowedAttempted && !pending.decisionClosed) replies.push(this.#deny(pending));
    const outcomes = await Promise.allSettled([...replies, ...selected.map(pending => pending.operation)]);
    const failures = outcomes.filter(outcome => outcome.status === 'rejected').map(outcome => outcome.reason);
    if (failures.length) throw new AggregateError(failures, 'Native upload policy cancellation was not acknowledged');
  }

  async endExecution(token) {
    const execution = this.#executions.get(token);
    if (!execution) return;
    execution.controller.abort(fail('Native upload tool execution ended', 'FILE_UPLOAD_CANCELLED'));
    for (const actor of [...execution.actors]) this.#removeActor(actor);
    await this.#cancelPending(pending => pending.actor?.execution === execution);
    this.#executions.delete(token);
    for (const [key, owner] of this.#seen) if (owner === token) this.#seen.delete(key);
  }

  close() {
    if (this.#closing) return this.#closing;
    this.#closed = true;
    this.#unsubscribe?.(); this.#unsubscribe = undefined;
    for (const execution of this.#executions.values()) execution.controller.abort(fail('Native upload policy closed', 'FILE_UPLOAD_CANCELLED'));
    for (const actor of [...this.#actors.values()]) this.#removeActor(actor);
    const closing = this.#cancelPending(() => true).then(() => { this.#executions.clear(); this.#seen.clear(); this.#cleanup?.(); this.#cleanup = undefined; });
    this.#closing = closing;
    void closing.finally(() => { if (this.#closing === closing) this.#closing = undefined; }).catch(() => {});
    return closing;
  }

  #report(error) { this.#ctx.logger?.warn?.(`Native upload policy: ${error?.code ?? 'FILE_UPLOAD_UNAVAILABLE'}: ${error?.message ?? String(error)}`); }
}
