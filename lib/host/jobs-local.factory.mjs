export function createModule(require) { const module = { exports: {} }; const exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function") __typeError("Object expected");
    var dispose, inner;
    if (async) dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0) {
      dispose = value[__knownSymbol("dispose")];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") __typeError("Object not disposable");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0]) return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError) throw error;
  };
  return next();
};

// vendor/dsh/jobs-local/src/index.ts
var index_exports = {};
__export(index_exports, {
  LocalJobRegistry: () => LocalJobRegistry,
  TASK_WAIT_TIMEOUT: () => TASK_WAIT_TIMEOUT,
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);
var import_node_crypto = require("node:crypto");
var import_schemastery = __toESM(require("@deepseek-ai/schemastery"), 1);
var import_dsh_scope2 = require("@deepseek-ai/dsh-scope");
var import_dsh_timeout = require("@deepseek-ai/dsh-timeout");
var import_dsh_jobs = require("@deepseek-ai/dsh-jobs");

// vendor/dsh/jobs-local/src/events.ts
var import_dsh_scope = require("@deepseek-ai/dsh-scope");
var JobLayer = class {
  /** Tokens of the job controllers attached from this scope. */
  controllers = new import_dsh_scope.AnonymousEntries();
  /** The `{ owners: 'scope' }` subscriptions registered from this scope. */
  scoped = new import_dsh_scope.AnonymousEntries();
  isEmpty() {
    return this.controllers.isEmpty() && this.scoped.isEmpty();
  }
};
var JobEventHub = class {
  /**
   * @param layers - the scope-layer table shared with the controller handshake.
   * @param warn - sink for a listener's contained failure.
   */
  constructor(layers, warn) {
    this.layers = layers;
    this.warn = warn;
  }
  unscoped = /* @__PURE__ */ new Set();
  /**
   * Register one listener as an effect of `ctx`.
   * @param ctx - the subscribing context; owns the effect and, for `'scope'`, names the scope.
   * @param filter - which owners' events to deliver.
   * @param listener - receives each matching event.
   * @returns disposer that unregisters the listener.
   */
  subscribe(ctx, filter, listener) {
    const subscription = { filter, listener };
    if ("owners" in filter && filter.owners === "scope") {
      return this.layers.effect(ctx, (layer) => layer.scoped.append(subscription), { label: "jobs.events.subscribe()" });
    }
    const dispose = ctx.effect(() => {
      this.unscoped.add(subscription);
      return () => {
        this.unscoped.delete(subscription);
      };
    }, "jobs.events.subscribe()");
    return dispose;
  }
  /**
   * Deliver one event to every matching subscription, containing each
   * listener so an observer cannot break the commit already made.
   * @param event - the event to deliver.
   * @param owner - the job's exact owner, or undefined for unowned work.
   */
  emit(event, owner) {
    const ownerId = owner?.id;
    for (const subscription of this.unscoped) {
      const { filter } = subscription;
      if ("owner" in filter && ownerId !== void 0 && ownerId !== filter.owner) continue;
      this.deliver(subscription, event);
    }
    for (const subscription of this.layers.global.scoped.values()) this.deliver(subscription, event);
    const scope = owner === void 0 ? void 0 : (0, import_dsh_scope.scopeOf)(owner.ctx);
    for (const layer of this.layers.chainLayers(scope)) {
      for (const subscription of layer.scoped.values()) this.deliver(subscription, event);
    }
  }
  deliver(subscription, event) {
    try {
      subscription.listener(event);
    } catch (error) {
      this.warn(`jobs: event listener threw on ${event.type}: ${String(error)}`);
    }
  }
};

// vendor/dsh/jobs-local/src/pump.ts
function startPump(sources, sink, pollMs, until) {
  if (!Number.isFinite(pollMs) || pollMs <= 0) {
    throw new Error(`invalid pump pollMs: expected a positive finite number of milliseconds, got ${JSON.stringify(pollMs)}`);
  }
  const states = sources.map((source) => ({ source, cursor: 0 }));
  const drain = () => {
    for (const [index, state] of states.entries()) {
      const { source } = state;
      const read = source.read(state.cursor);
      state.cursor = read.nextOffset;
      sink.spill(index, read.spillPath);
      if (read.text.length === 0) continue;
      if (source.channel === void 0 && !read.lossy) {
        sink.append(read.text);
      } else {
        sink.append(read.text, {
          ...source.channel !== void 0 ? { channel: source.channel } : {},
          ...read.lossy ? { gapBefore: true } : {}
        });
      }
    }
  };
  const done = (async () => {
    let settled = false;
    let timer;
    let wake;
    const finish = () => {
      settled = true;
      clearTimeout(timer);
      wake?.();
    };
    void until.then(finish, finish);
    while (!settled) {
      drain();
      await new Promise((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, pollMs);
      });
      wake = void 0;
      timer = void 0;
    }
    drain();
  })();
  return { done };
}

// vendor/dsh/jobs-local/src/ring.ts
function utf8Tail(text, maxBytes) {
  const raw = Buffer.from(text, "utf8");
  let start = raw.length - maxBytes;
  while (start < raw.length && (raw[start] & 192) === 128) start += 1;
  const tail = raw.subarray(start);
  return { text: tail.toString("utf8"), bytes: tail.length };
}
var OutputRing = class {
  /** Retained chunks in offset order. */
  chunks = [];
  /** Sum of the retained chunks' byte lengths. */
  retainedBytes = 0;
  /** Total UTF-8 bytes ever appended — the offset the next chunk starts at. */
  total = 0;
  /** Offset of the oldest retained byte (equals {@link total} when nothing is retained). */
  earliest = 0;
  /**
   * Append one chunk and trim the head to `cap`.
   * @param text - the chunk text, exactly as produced.
   * @param options - stream label and gap marker.
   * @param cap - retention cap in UTF-8 bytes after this append.
   * @returns false when the chunk was empty and nothing changed.
   */
  append(text, options, cap) {
    if (text.length === 0) return false;
    const bytes = Buffer.byteLength(text, "utf8");
    this.chunks.push({
      at: this.total,
      text,
      bytes,
      ...options?.channel !== void 0 ? { channel: options.channel } : {},
      ...options?.gapBefore !== void 0 ? { gapBefore: options.gapBefore } : {}
    });
    this.total += bytes;
    this.retainedBytes += bytes;
    this.trim(cap);
    return true;
  }
  /**
   * Drop retained head chunks until the ring fits `cap`; a single oversized
   * chunk keeps only its UTF-8-safe tail with a `gapBefore` marker.
   * @param cap - retention cap in UTF-8 bytes.
   */
  trim(cap) {
    while (this.retainedBytes > cap && this.chunks.length > 1) {
      const dropped = this.chunks.shift();
      if (dropped === void 0) break;
      this.retainedBytes -= dropped.bytes;
    }
    const single = this.chunks.length === 1 ? this.chunks[0] : void 0;
    if (single !== void 0 && single.bytes > cap) {
      const tail = utf8Tail(single.text, cap);
      single.at += single.bytes - tail.bytes;
      single.text = tail.text;
      single.bytes = tail.bytes;
      single.gapBefore = true;
      this.retainedBytes = tail.bytes;
    }
    this.earliest = this.chunks[0]?.at ?? this.total;
  }
  /**
   * Retained chunks overlapping `[from, total)` as fresh wire chunks.
   * @param from - absolute byte offset to read from.
   * @returns the chunks, the resume offset, and whether bytes before them were evicted.
   */
  readFrom(from) {
    const chunks = [];
    for (const chunk of this.chunks) {
      if (chunk.at + chunk.bytes <= from) continue;
      chunks.push({
        at: chunk.at,
        text: chunk.text,
        ...chunk.channel !== void 0 ? { channel: chunk.channel } : {},
        ...chunk.gapBefore !== void 0 ? { gapBefore: chunk.gapBefore } : {}
      });
    }
    return { chunks, next: this.total, lossy: from < this.earliest };
  }
};

// vendor/dsh/jobs-local/src/index.ts
var TASK_WAIT_TIMEOUT = "TASK_WAIT_TIMEOUT";
var DEFAULT_MAX_CONCURRENT_JOBS_PER_OWNER = 10;
var DEFAULT_RETAIN_BYTES = 256 * 1024;
var DEFAULT_SETTLED_RETAIN_BYTES = 16 * 1024;
var DEFAULT_PUMP_POLL_MS = 150;
function isTerminal(status) {
  return status === "completed" || status === "killed" || status === "failed";
}
var LocalJobRegistry = class extends import_dsh_jobs.JobRegistry {
  static Config = import_schemastery.default.object({
    maxConcurrentJobsPerOwner: import_schemastery.default.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_CONCURRENT_JOBS_PER_OWNER),
    retainBytes: import_schemastery.default.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_RETAIN_BYTES),
    settledRetainBytes: import_schemastery.default.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_SETTLED_RETAIN_BYTES),
    pumpPollMs: import_schemastery.default.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_PUMP_POLL_MS)
  });
  /** Schemastery-defaulted active-job limit. */
  maxConcurrentJobsPerOwner;
  /** Schemastery-defaulted live ring retention cap. */
  retainBytes;
  /** Schemastery-defaulted settled ring retention cap. */
  settledRetainBytes;
  /** Schemastery-defaulted pull-source poll interval. */
  pumpPollMs;
  store = /* @__PURE__ */ new Map();
  counters = /* @__PURE__ */ new Map();
  epoch = (0, import_node_crypto.randomUUID)();
  options = /* @__PURE__ */ new WeakMap();
  deliveries = /* @__PURE__ */ new Map();
  /**
   * Controllers and scoped subscriptions layered by the scope that registered
   * them, in the tools-registry shape: a contribution files into its
   * registering context's scope, and a read unions the global layer with the
   * owner's scope chain.
   *
   * The registry is one process-wide instance serving every composition, so a
   * flat table would answer a per-owner question process-wide: one preset's
   * job controls would hold `start()` open for an agent whose own composition
   * loads none, and one settlement would reach every preset's notice listener.
   * Layers make both reads owner-relative. Nothing derives a cache from a
   * layer, so change notification is a no-op.
   */
  layers = new import_dsh_scope2.ScopedLayers(() => new JobLayer(), () => {
  });
  hub;
  /** Owner agents with attached scope cleanup, mapped to the exact disposer. */
  ownerCleanups = /* @__PURE__ */ new Map();
  /** Service context used by detached settlement continuations and teardown. */
  selfCtx;
  constructor(ctx, config) {
    super(ctx);
    const resolved = config;
    this.maxConcurrentJobsPerOwner = resolved.maxConcurrentJobsPerOwner;
    this.retainBytes = resolved.retainBytes;
    this.settledRetainBytes = resolved.settledRetainBytes;
    this.pumpPollMs = resolved.pumpPollMs;
    this.selfCtx = ctx;
    this.hub = new JobEventHub(this.layers, (message) => {
      ctx.logger.warn(message);
    });
    ctx.effect(() => () => this.disposeAll(), "jobs teardown");
  }
  setOwnerOptions(owner, read) {
    this.options.set(owner, read);
    return () => {
      if (this.options.get(owner) === read) this.options.delete(owner);
    };
  }
  ownerOptions(owner) {
    return owner === void 0 ? {} : this.options.get(owner)?.() ?? {};
  }
  peekOutput(id, maxBytes, caller) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("preview byte limit must be a non-negative integer");
    const job = this.expect(id, caller);
    const read = job.ring.readFrom(0);
    const stream = read.chunks.map((chunk) => chunk.text).join("");
    const text = stream + (stream && job.result ? "\n" : "") + (job.result ?? "");
    const tail = [];
    let bytes = 0;
    for (const point of [...text].reverse()) {
      const size = Buffer.byteLength(point);
      if (bytes + size > maxBytes) break;
      bytes += size;
      tail.push(point);
    }
    const retained = tail.reverse().join("");
    return { text: retained, available: Boolean(text), truncated: read.lossy || read.chunks.some((chunk) => chunk.gapBefore) || retained !== text };
  }
  markDelivered(id, kind, caller) {
    this.expect(id, caller);
    const rank = { notice: 0, preview: 1, full: 2 };
    const previous = this.deliveries.get(id);
    if (previous === void 0 || rank[kind] > rank[previous]) this.deliveries.set(id, kind);
  }
  /**
   * The event stream bound to the accessing context: a subscription is an
   * effect of that context, and `{ owners: 'scope' }` names its scope.
   */
  get events() {
    const registrar = this.ctx;
    return {
      subscribe: (filter, listener) => this.hub.subscribe(registrar, filter, listener)
    };
  }
  start(spec) {
    const owner = this.resolveOwner(spec.owner);
    if (!this.servesOwner(owner)) {
      throw new Error("background jobs unavailable: no job controller serves this agent (load @deepseek-ai/dsh-tool-jobs in its composition)");
    }
    if (spec.kind.length === 0) throw new Error("invalid job kind: expected a non-empty string");
    if (spec.label.length === 0) throw new Error("invalid job label: expected a non-empty string");
    if (spec.outputLimitBytes !== void 0 && (!Number.isSafeInteger(spec.outputLimitBytes) || spec.outputLimitBytes <= 0)) {
      throw new Error(`invalid outputLimitBytes: expected a positive safe integer, got ${JSON.stringify(spec.outputLimitBytes)}`);
    }
    if (owner !== void 0) this.ensureOwnerCleanup(owner);
    const active = this.activeJobCount(owner);
    if (active >= this.maxConcurrentJobsPerOwner) {
      throw new Error(
        `background job limit reached for this owner (limit: ${this.maxConcurrentJobsPerOwner}); use job_kill to stop an unneeded job, wait for it to finish, then retry`
      );
    }
    const count = (this.counters.get(spec.kind) ?? 0) + 1;
    this.counters.set(spec.kind, count);
    const id = (0, import_dsh_jobs.JobId)(this.ownerOptions(owner).interruptibleWait ? `${spec.kind}-${this.epoch}-${count}` : `${spec.kind}-${count}`);
    const ring = new OutputRing();
    const state = { progress: void 0, job: void 0 };
    const handle = {
      id,
      append: (text, options) => {
        this.appendRing(state, ring, text, options, "producer");
      },
      updateProgress: (line) => {
        this.updateProgress(state, line);
      }
    };
    const hooks = spec.run(handle);
    let markSettled;
    const settled = new Promise((resolve) => {
      markSettled = resolve;
    });
    const job = {
      id,
      kind: spec.kind,
      label: spec.label,
      outputLimitBytes: spec.outputLimitBytes,
      owner,
      cancel: hooks.cancel.bind(hooks),
      status: "running",
      ring,
      modelCursor: 0,
      resultDelivered: false,
      state,
      detail: void 0,
      result: void 0,
      startedAt: Date.now(),
      finishedAt: void 0,
      killReason: void 0,
      settleCause: void 0,
      settled,
      markSettled,
      waitResolvers: /* @__PURE__ */ new Set(),
      pump: void 0,
      spillPaths: []
    };
    state.job = job;
    this.store.set(id, job);
    this.emit({ type: "registered", job: this.view(job) }, owner);
    const producerDone = hooks.done.then(
      (outcome) => outcome,
      (error) => {
        this.selfCtx.logger.warn(`jobs: job ${job.id} producer done promise rejected (producer contract violation): ${String(error)}`);
        return { status: "failed", detail: String(error) };
      }
    );
    if (spec.output !== void 0 && spec.output.length > 0) {
      job.pump = startPump(
        spec.output.map((source) => this.guardSource(job, source)),
        {
          append: (text, options) => {
            this.appendRing(state, ring, text, options, "pump");
          },
          spill: (index, path) => {
            job.spillPaths[index] = path;
          }
        },
        this.pumpPollMs,
        Promise.race([producerDone, settled])
      );
    }
    void producerDone.then(async (outcome) => {
      if (job.pump !== void 0) await job.pump.done;
      this.settle(job, outcome, job.settleCause ?? "producer");
    });
    return id;
  }
  list(caller) {
    return [...this.store.values()].filter((job) => job.owner === void 0 || job.owner.id === caller).map((job) => this.view(job));
  }
  get(id, caller) {
    return this.view(this.expect(id, caller));
  }
  read(id, caller) {
    return this.readJob(this.expect(id, caller));
  }
  readAt(id, from, caller) {
    const job = this.expect(id, caller);
    if (!Number.isSafeInteger(from) || from < 0) {
      throw new Error(`invalid output read offset: expected a non-negative safe integer, got ${JSON.stringify(from)}`);
    }
    return job.ring.readFrom(from);
  }
  kill(id, caller, reason) {
    return this.killJob(this.expect(id, caller), reason);
  }
  async wait(id, timeoutMs, caller, signal) {
    return this.waitJob(this.expect(id, caller), timeoutMs, signal);
  }
  remove(id, caller) {
    const job = this.expect(id, caller);
    if (!isTerminal(job.status)) throw new Error(`job ${id} is still ${job.status}; kill it and wait for settlement before removing it`);
    this.drop([job]);
  }
  attachController(name) {
    const token = Symbol(name);
    return this.layers.effect(
      this.ctx,
      (layer) => layer.controllers.append(token),
      { label: "jobs.attachController()" }
    );
  }
  /**
   * Resolve a spec's owner session to its live Agent. An owned registration
   * needs the agent registry, and the session must currently have a live
   * instance: that instance's disposal is what cancels and drops the job.
   */
  resolveOwner(session) {
    if (session === void 0) return void 0;
    const agents = this.selfCtx.get("agents");
    if (agents === void 0) {
      throw new Error("background job ownership requires the agent registry (load @deepseek-ai/dsh-agent)");
    }
    const owner = agents.get(session);
    if (owner === void 0) {
      throw new Error(`session "${session}" has no live agent (background job owner must be live)`);
    }
    return owner;
  }
  /**
   * Whether an attached job controller can collect and stop work owned by
   * `owner`. The global layer holds every controller attached from an unscoped
   * context — a host composition's own controls — and therefore serves every
   * owner; a scoped controller serves exactly the agents composed under it.
   * @param owner - the job's owner, or undefined for unowned work.
   * @returns whether some reachable controller serves the owner.
   */
  servesOwner(owner) {
    if (!this.layers.global.controllers.isEmpty()) return true;
    return this.layers.chainLayers(owner === void 0 ? void 0 : (0, import_dsh_scope2.scopeOf)(owner.ctx)).some((layer) => !layer.controllers.isEmpty());
  }
  /** Count authoritative active records for one exact owner or the shared unowned bucket. */
  activeJobCount(owner) {
    let count = 0;
    for (const job of this.store.values()) {
      if (job.owner === owner && (job.status === "running" || job.status === "stopping")) count += 1;
    }
    return count;
  }
  /** Look up a job and enforce caller access. */
  expect(id, caller) {
    const job = this.store.get(id);
    if (job === void 0) throw new Error(`unknown job ${id}`);
    this.assertAccess(job, caller);
    return job;
  }
  /**
   * The isolation fence: a job with an owner is reachable only by callers
   * whose session id matches (`!== undefined` semantics — an unowned job is
   * open, and a caller-less view can never match an owned one).
   */
  assertAccess(job, caller) {
    if (job.owner !== void 0 && job.owner.id !== caller) {
      throw new Error(`job ${job.id} belongs to another session`);
    }
  }
  /** Project a fresh read-only view from the mutable record. */
  view(job) {
    const owner = job.owner?.id;
    const spillPaths = [...new Set(job.spillPaths.filter((path) => path !== void 0))];
    return {
      id: job.id,
      ...this.ownerOptions(job.owner).interruptibleWait ? { runId: job.id, resultDelivery: this.deliveries.get(job.id) ?? "none" } : {},
      kind: job.kind,
      label: job.label,
      ...owner !== void 0 ? { owner } : {},
      ...job.outputLimitBytes !== void 0 ? { outputLimitBytes: job.outputLimitBytes } : {},
      status: job.status,
      ...job.state.progress !== void 0 ? { progress: job.state.progress } : {},
      ...job.detail !== void 0 ? { detail: job.detail } : {},
      startedAt: job.startedAt,
      ...job.finishedAt !== void 0 ? { finishedAt: job.finishedAt } : {},
      output: {
        total: job.ring.total,
        earliest: job.ring.earliest,
        ...spillPaths.length > 0 ? { spillPaths } : {}
      }
    };
  }
  emit(event, owner) {
    this.hub.emit(event, owner);
    if (event.type === "removed") this.deliveries.delete(event.job.id);
  }
  /**
   * Consume the ring from the model cursor; the result rides the first read
   * after settlement. A terminal read is the point the settled stream drops
   * to the settled cap: settlement kept every unconsumed byte for it.
   */
  readJob(job) {
    const read = job.ring.readFrom(job.modelCursor);
    job.modelCursor = job.ring.total;
    const result = isTerminal(job.status) && !job.resultDelivered ? job.result : void 0;
    if (result !== void 0) job.resultDelivered = true;
    if (isTerminal(job.status)) job.ring.trim(this.settledRetainBytes);
    return {
      chunks: read.chunks,
      lossy: read.lossy,
      ...result !== void 0 ? { result } : {},
      job: this.view(job)
    };
  }
  killJob(job, reason) {
    if (isTerminal(job.status)) return "already-finished";
    job.cancel(reason);
    job.status = "stopping";
    if (reason !== void 0) job.killReason = reason;
    job.settleCause = "kill";
    this.emit({ type: "stopping", job: this.view(job) }, job.owner);
    return "requested";
  }
  async waitJob(job, timeoutMs, signal) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`invalid wait timeout: expected a positive number of milliseconds, got ${JSON.stringify(timeoutMs)}`);
    }
    if (!isTerminal(job.status)) {
      var _stack = [];
      try {
        if (signal?.aborted) throw new Error("wait aborted");
        const d = __using(_stack, (0, import_dsh_timeout.deadline)(signal, timeoutMs, TASK_WAIT_TIMEOUT));
        await new Promise((resolve, reject) => {
          const onSettled = () => {
            job.waitResolvers.delete(onSettled);
            d.signal.removeEventListener("abort", onAbort);
            resolve();
          };
          const onAbort = () => {
            job.waitResolvers.delete(onSettled);
            if ((0, import_dsh_timeout.timeoutOf)(d.signal, TASK_WAIT_TIMEOUT) !== void 0) {
              resolve();
            } else {
              reject(new Error("wait aborted"));
            }
          };
          job.waitResolvers.add(onSettled);
          d.signal.addEventListener("abort", onAbort, { once: true });
        });
      } catch (_) {
        var _error = _, _hasError = true;
      } finally {
        __callDispose(_stack, _error, _hasError);
      }
    }
    return this.view(job);
  }
  /**
   * Append one chunk to the ring. A producer chunk against a settled job is
   * logged and dropped; the registry's own pump drains silently after
   * settlement (a forced settlement may precede the producer's). A chunk
   * staged inside the starter call is retained and signals no observer — the
   * registration commit publishes it.
   */
  appendRing(state, ring, text, options, writer) {
    const job = state.job;
    if (job !== void 0 && isTerminal(job.status)) {
      if (writer === "producer") this.selfCtx.logger.warn(`jobs: append to settled job ${job.id} dropped`);
      return;
    }
    if (!ring.append(text, options, this.retainBytes)) return;
    if (job !== void 0) this.emitOutput(job);
  }
  /**
   * Contain a failing pull source: the first throw is logged, and the source
   * reads as exhausted from then on, so the job runs to its own settlement
   * with whatever the ring holds instead of freezing on a pump failure.
   */
  guardSource(job, source) {
    let failed = false;
    return {
      ...source.channel !== void 0 ? { channel: source.channel } : {},
      read: (fromByte) => {
        if (failed) return { text: "", nextOffset: fromByte, lossy: false };
        try {
          return source.read(fromByte);
        } catch (error) {
          failed = true;
          this.selfCtx.logger.warn(`jobs: output source for ${job.id} failed; its stream stops here: ${String(error)}`);
          return { text: "", nextOffset: fromByte, lossy: false };
        }
      }
    };
  }
  /** Announce that one job's ring advanced (append or settlement). */
  emitOutput(job) {
    const owner = job.owner?.id;
    this.emit({ type: "output", id: job.id, ...owner !== void 0 ? { owner } : {}, total: job.ring.total }, job.owner);
  }
  /**
   * Replace the live progress line through a producer face; a write against a
   * settled job is logged and dropped. A write staged inside the starter call
   * seeds the registered projection and signals no observer.
   */
  updateProgress(state, line) {
    const job = state.job;
    if (job !== void 0 && isTerminal(job.status)) {
      this.selfCtx.logger.warn(`jobs: progress update on settled job ${job.id} dropped`);
      return;
    }
    state.progress = line;
    if (job !== void 0) this.emit({ type: "progress", job: this.view(job) }, job.owner);
  }
  /**
   * Record the first terminal outcome, release waiters, then announce the
   * settlement. First-wins preserves a teardown force-failure against late
   * producer settlement. The settled event follows every released waiter and
   * reports whether it released one: a timed-out or aborted wait has already
   * left the set, so only a wait still owed the projection counts.
   */
  settle(job, outcome, cause) {
    if (isTerminal(job.status)) return;
    job.status = outcome.status;
    if (outcome.status === "killed" && job.killReason !== void 0) {
      job.detail = outcome.detail !== void 0 ? `${outcome.detail}; ${job.killReason}` : job.killReason;
    } else if (outcome.detail !== void 0) {
      job.detail = outcome.detail;
    }
    job.state.progress = void 0;
    job.result = outcome.result;
    job.finishedAt = Date.now();
    job.ring.trim(Math.max(this.settledRetainBytes, job.ring.total - job.modelCursor));
    const waitResolvers = [...job.waitResolvers];
    job.waitResolvers.clear();
    for (const resolveWait of waitResolvers) resolveWait();
    job.markSettled();
    this.emit({ type: "settled", job: this.view(job), cause, awaited: waitResolvers.length > 0 }, job.owner);
    this.emitOutput(job);
  }
  /**
   * Attach one awaited cleanup through the exact owner's scope. This survives
   * producer reloads and joins agent quiescence; the retained disposer lets
   * service teardown detach the cross-fiber effect.
   */
  ensureOwnerCleanup(owner) {
    if (this.ownerCleanups.has(owner)) return;
    const detach = owner.ctx.effect(() => async () => {
      this.ownerCleanups.delete(owner);
      await this.disposeOwned(owner);
    }, "jobs.ownerCleanup()");
    this.ownerCleanups.set(owner, detach);
  }
  /** Cancel, await terminal records, and drop every job owned by one exact agent lifecycle. */
  async disposeOwned(owner) {
    const owned = [...this.store.values()].filter((job) => job.owner === owner);
    this.cancelForTeardown(owned, "owner disposed");
    await Promise.all(owned.map((job) => job.settled));
    this.drop(owned);
  }
  /** Drop settled records and announce each removal, the one visible-set change no per-job record carries. */
  drop(jobs) {
    for (const job of jobs) {
      this.store.delete(job.id);
      this.emit({ type: "removed", job: this.view(job) }, job.owner);
    }
  }
  /**
   * Cancel live jobs, await settlement, drop every record, and detach owner
   * effects. Throwing cancels are force-failed to avoid teardown deadlock.
   */
  async disposeAll() {
    const all = [...this.store.values()];
    this.cancelForTeardown(all, "jobs service disposed");
    await Promise.all(all.map((job) => job.settled));
    this.drop(all);
    const ownerCleanups = [...this.ownerCleanups.values()];
    this.ownerCleanups.clear();
    await Promise.all(ownerCleanups.map((cleanup) => Promise.resolve(cleanup())));
  }
  /**
   * Cancel jobs during teardown with per-job containment. A throwing cancel
   * force-fails the record and reports a possible orphan; a cancel that returns
   * without settling remains indistinguishable from a slow stop and may stall.
   */
  cancelForTeardown(jobs, reason) {
    for (const job of jobs) {
      if (isTerminal(job.status)) continue;
      job.settleCause = "teardown";
      try {
        job.cancel(reason);
        job.status = "stopping";
        this.emit({ type: "stopping", job: this.view(job) }, job.owner);
      } catch (error) {
        const detail = `cancel threw during teardown; work may be orphaned: ${String(error)}`;
        this.selfCtx.logger.warn(`jobs: cancel of ${job.id} threw during teardown; job record forced failed and work may be orphaned: ${String(error)}`);
        this.settle(job, { status: "failed", detail }, "teardown");
      }
    }
  }
};
var index_default = LocalJobRegistry;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LocalJobRegistry,
  TASK_WAIT_TIMEOUT
});
return module.exports; }
