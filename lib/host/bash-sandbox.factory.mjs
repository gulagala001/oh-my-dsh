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

// vendor/dsh/bash-sandbox/src/index.ts
var index_exports = {};
__export(index_exports, {
  SandboxBashExecutor: () => SandboxBashExecutor,
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);
var import_dsh_sandbox3 = require("@deepseek-ai/dsh-sandbox");

// vendor/dsh/bash-local/src/index.ts
var import_schemastery = __toESM(require("@deepseek-ai/schemastery"));
var import_dsh_shell = require("@deepseek-ai/dsh-shell");
var import_dsh_timeout = require("@deepseek-ai/dsh-timeout");
var ENV_OVERRIDES = {
  NO_COLOR: "1",
  TERM: "dumb",
  PAGER: "cat",
  GIT_PAGER: "cat"
};
var DEFAULT_GRACE_MS = 3e3;
var DEFAULT_MAX_SPILL_BYTES = 64 * 1024 * 1024;
function finalOutput(reader) {
  const read = reader.readFrom(0);
  return {
    text: read.text,
    truncated: read.lossy,
    ...read.spillPath !== void 0 ? { spillPath: read.spillPath } : {}
  };
}
function assertPositiveFinite(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`bash-local: ${name} must be a positive finite number`);
  }
}
function assertServiceableBashConfig(config) {
  const resolved = config;
  assertPositiveFinite("timeoutMs", resolved.timeoutMs);
  assertPositiveFinite("maxTimeoutMs", resolved.maxTimeoutMs);
  assertPositiveFinite("maxOutputBytes", resolved.maxOutputBytes);
  assertPositiveFinite("maxSpillBytes", resolved.maxSpillBytes);
  assertPositiveFinite("graceMs", resolved.graceMs);
  if (resolved.graceMs > import_dsh_timeout.MAX_TIMER_DELAY_MS) {
    throw new Error(`bash-local: graceMs must be no greater than ${import_dsh_timeout.MAX_TIMER_DELAY_MS}`);
  }
}
var LocalBashExecutor = class _LocalBashExecutor extends import_dsh_shell.ShellExecutor {
  static inject = ["subprocess"];
  static Config = import_schemastery.default.object({
    cwd: import_schemastery.default.string(),
    timeoutMs: import_schemastery.default.number().default(12e4),
    maxTimeoutMs: import_schemastery.default.number().default(6e5),
    maxOutputBytes: import_schemastery.default.number().default(64e3),
    maxSpillBytes: import_schemastery.default.number().default(DEFAULT_MAX_SPILL_BYTES),
    graceMs: import_schemastery.default.number().default(DEFAULT_GRACE_MS)
  });
  /** The currently authoritative config: the settings section, or the composition entry. */
  source;
  /** Validated config (schemastery applied the defaults before construction). */
  get config() {
    return this.source();
  }
  constructor(ctx, config) {
    super(ctx);
    const entry = config;
    assertServiceableBashConfig(entry);
    this.source = () => entry;
    ctx.inject(["settings"], (settingsCtx) => {
      settingsCtx.settings.installSection(ctx, import_dsh_shell.SHELL_SETTINGS_NAMESPACE, _LocalBashExecutor.Config, entry, {
        validate: assertServiceableBashConfig,
        setSource: (current) => {
          this.source = current;
        },
        // Every field is read through the getter at each command, so nothing
        // derived from the source needs rebuilding when the document changes.
        onChange: () => {
        }
      });
    });
  }
  /**
   * Resolve a request into a fully-specified spec: fill `workdir` from
   * `config.cwd` (else `process.cwd()`), and `timeoutMs` from
   * `config.timeoutMs`, capped at `config.maxTimeoutMs`. The tool layer calls
   * this before {@link run}/{@link start}, so those methods receive explicit
   * values and never re-default.
   */
  resolve(request) {
    const timeoutMs = (0, import_dsh_timeout.clampTimeout)(
      request.timeoutMs,
      this.config.timeoutMs,
      this.config.maxTimeoutMs,
      "bash-local: request.timeoutMs"
    );
    const stdoutMaxBytes = request.stdoutMaxBytes ?? this.config.maxOutputBytes;
    assertPositiveFinite("request.stdoutMaxBytes", stdoutMaxBytes);
    return {
      command: request.command,
      workdir: request.workdir ?? this.config.cwd ?? process.cwd(),
      timeoutMs,
      stdoutMaxBytes,
      ...request.signal ? { signal: request.signal } : {},
      // Carry stdin/ordinary env/trusted dshEnv through verbatim — optional,
      // no config default. The subprocess service owns the scrub and merge order.
      ...request.stdin !== void 0 ? { stdin: request.stdin } : {},
      ...request.env !== void 0 ? { env: request.env } : {},
      ...request.dshEnv !== void 0 ? { dshEnv: request.dshEnv } : {},
      // Carry a sandbox policy through verbatim: this executor never
      // confines, so the field is inert here (the seam contract) — a
      // sandboxing subclass overrides resolve() to stamp its default instead.
      sandboxPolicy: request.sandboxPolicy
    };
  }
  /** Map one resolved bash spec and explicit argv onto a fully-specified subprocess spawn. */
  // XXX(stateful-shell): evaluate persistent cwd or PTY sessions when workflows require shell state.
  spawnSpec(spec, argv, stdoutMaxBytes, signal) {
    const collect = (maxBytes) => ({ maxBytes, spill: { maxBytes: this.config.maxSpillBytes } });
    return {
      argv,
      cwd: spec.workdir,
      stdio: {
        stdin: spec.stdin !== void 0 ? { data: spec.stdin } : "ignore",
        stdout: collect(stdoutMaxBytes),
        stderr: collect(this.config.maxOutputBytes)
      },
      graceMs: this.config.graceMs,
      signal,
      // One explicit env map for the seam, layered so the trusted dshEnv
      // snapshot beats both the caller's env and the terminal overrides; the
      // subprocess service merges the whole map after its ambient scrub.
      env: { ...ENV_OVERRIDES, ...spec.env, ...spec.dshEnv }
    };
  }
  /** The collect-mode readers the executor itself requested (present by construction). */
  static collected(handle) {
    const { stdout, stderr } = handle.collected;
    if (stdout === void 0 || stderr === void 0) {
      throw new Error("bash-local: subprocess implementation dropped a requested collect stream");
    }
    return { stdout, stderr };
  }
  async run(spec) {
    return (await this.runArgv(spec, ["bash", "-c", spec.command])).result;
  }
  /**
   * Run an explicit argv with the foreground lifecycle, environment, output,
   * timeout, and cancellation semantics of this executor. Subclasses use this
   * after replacing the public command's shell argv at an execution boundary.
   * @param spec - resolved execution settings and caller-owned command metadata.
   * @param argvOrPrepare - exact argv, or preparation cancelled by the same deadline as execution.
   * @returns the foreground result and whether argv reached the subprocess provider.
   */
  async runArgv(spec, argvOrPrepare) {
    var _stack = [];
    try {
      const d = __using(_stack, (0, import_dsh_timeout.deadline)(spec.signal, spec.timeoutMs, "BASH_TIMEOUT"));
      let argv;
      if (typeof argvOrPrepare === "function") {
        const cancelled = Promise.withResolvers();
        const abort = () => {
          cancelled.reject(d.signal.reason);
        };
        d.signal.addEventListener("abort", abort, { once: true });
        try {
          argv = await Promise.race([
            Promise.resolve().then(() => {
              d.signal.throwIfAborted();
              return argvOrPrepare(d.signal);
            }),
            cancelled.promise
          ]);
          d.signal.throwIfAborted();
        } catch (error) {
          if ((0, import_dsh_timeout.timeoutOf)(d.signal, "BASH_TIMEOUT") === void 0) throw error;
          return {
            spawnRequested: false,
            result: {
              exitCode: null,
              signal: null,
              timedOut: true,
              aborted: false,
              timeoutMs: spec.timeoutMs,
              stdout: { text: "", truncated: false },
              stderr: { text: "", truncated: false }
            }
          };
        } finally {
          d.signal.removeEventListener("abort", abort);
        }
      } else {
        argv = argvOrPrepare;
      }
      const handle = this.ctx.subprocess.spawn(this.spawnSpec(spec, argv, spec.stdoutMaxBytes, d.signal));
      const outcome = await handle.done;
      const collected = _LocalBashExecutor.collected(handle);
      const timedOut = (0, import_dsh_timeout.timeoutOf)(d.signal, "BASH_TIMEOUT") !== void 0;
      const aborted = d.signal.aborted && !timedOut;
      return {
        spawnRequested: true,
        result: {
          ...outcome,
          timedOut,
          aborted,
          timeoutMs: spec.timeoutMs,
          stdout: finalOutput(collected.stdout),
          stderr: finalOutput(collected.stderr)
        }
      };
    } catch (_) {
      var _error = _, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  }
  async start(spec) {
    return Promise.resolve(this.startArgv(spec, ["bash", "-c", spec.command]));
  }
  /**
   * Start an explicit argv with the background lifecycle, environment, output,
   * cancellation, and managed-range ownership semantics of this executor.
   * Subclasses use this after replacing the public command's shell argv at an
   * execution boundary.
   * @param spec - resolved execution settings and caller-owned command metadata.
   * @param argv - exact executable and arguments to hand to `ctx.subprocess`.
   * @returns the live background handle; provider rejection settles it as killed.
   */
  startArgv(spec, argv) {
    spec.signal?.throwIfAborted();
    const running = this.ctx.subprocess.spawn(this.spawnSpec(spec, argv, this.config.maxOutputBytes, spec.signal));
    const collected = _LocalBashExecutor.collected(running);
    let providerFailureNote;
    const consumeProviderFailure = () => {
      const note = providerFailureNote ?? "";
      providerFailureNote = void 0;
      return note;
    };
    let stdoutOffset = 0;
    let stderrOffset = 0;
    const proc = {
      status: "running",
      exitCode: null,
      signal: null,
      done: running.done.then((outcome) => {
        if (proc.status === "running") {
          proc.status = spec.signal?.aborted === true || outcome.signal !== null ? "killed" : "completed";
        }
        proc.exitCode = outcome.exitCode;
        proc.signal = outcome.signal;
        this.onProcessDone(proc, collected.stderr.readFrom(0).text, false);
      }, (error) => {
        proc.status = "killed";
        let detail = "unprintable provider failure";
        try {
          detail = String(error);
        } catch {
        }
        providerFailureNote = `subprocess failed before reporting an outcome: ${detail}`;
        this.onProcessDone(proc, providerFailureNote, true, error);
      }),
      peekOutput: () => {
        const out = collected.stdout.readFrom(0);
        const err = collected.stderr.readFrom(0);
        const note = providerFailureNote ?? "";
        return {
          delta: out.text + (err.text || note ? `
[stderr]
${err.text}${note}` : ""),
          lossy: out.lossy || err.lossy,
          ...out.spillPath !== void 0 ? { stdoutSpillPath: out.spillPath } : {},
          ...err.spillPath !== void 0 ? { stderrSpillPath: err.spillPath } : {}
        };
      },
      readOutput: () => {
        const out = collected.stdout.readFrom(stdoutOffset);
        const err = collected.stderr.readFrom(stderrOffset);
        stdoutOffset = out.nextOffset;
        stderrOffset = err.nextOffset;
        const providerFailure = consumeProviderFailure();
        const failureSeparator = err.text.length > 0 && !err.text.endsWith("\n") ? "\n" : "";
        const errText = err.text + (providerFailure.length > 0 ? `${failureSeparator}${providerFailure}` : "");
        const separator = out.text.length > 0 && !out.text.endsWith("\n") ? "\n" : "";
        const delta = out.text + (errText.length > 0 ? `${separator}[stderr]
${errText}` : "");
        return {
          delta,
          lossy: out.lossy || err.lossy,
          ...out.spillPath !== void 0 ? { stdoutSpillPath: out.spillPath } : {},
          ...err.spillPath !== void 0 ? { stderrSpillPath: err.spillPath } : {}
        };
      },
      kill: () => {
        if (proc.status !== "running") return false;
        proc.status = "killed";
        running.terminate();
        return true;
      }
    };
    return proc;
  }
  /**
   * Settlement hook for subclasses that attach execution facts to a process.
   * Called after exit facts or provider-failure output are stamped and before
   * {@link ShellProcess.done} resolves. The base implementation is intentionally
   * empty.
   * @param _proc - the settled process handle.
   * @param _stderr - the process's retained stderr tail used by subclasses for settlement classification.
   * @param _providerRejected - whether the subprocess promise rejected without a direct outcome.
   * @param _providerError - the provider rejection reason, which may itself be undefined.
   */
  onProcessDone(_proc, _stderr, _providerRejected, _providerError) {
  }
};

// vendor/dsh/bash-sandbox/src/helpers.ts
var import_dsh_sandbox = require("@deepseek-ai/dsh-sandbox");
var import_dsh_sandbox2 = require("@deepseek-ai/dsh-sandbox");
function classifyDenial(result, signatures) {
  return (0, import_dsh_sandbox.matchesSignature)(result.exitCode, result.stderr.text, signatures);
}

// vendor/dsh/bash-sandbox/src/index.ts
var SandboxBashExecutor = class extends LocalBashExecutor {
  static inject = ["subprocess", "sandbox", "sandboxPolicy"];
  // No own Config: the sandbox default (mode + workspaceRoot) is owned by
  // ctx.sandboxPolicy, so this executor inherits LocalBashExecutor's Config
  // verbatim (the config catalog walks the inherited static).
  mode;
  /**
   * Per-process confinement facts retained until settlement. Providers may
   * vary enforcement and diagnostic dialect between overlapping calls, so a
   * shared latest-wrap value would classify a process against the wrong facts.
   * Unconfined processes have no entry.
   */
  processFacts = /* @__PURE__ */ new Map();
  constructor(ctx, config) {
    super(ctx, config);
    this.mode = ctx.sandboxPolicy.defaultMode;
  }
  /** The configured default mode — the capability fact the tool layer reads. */
  get sandboxMode() {
    return this.mode;
  }
  /**
   * Stamp a complete per-call policy onto the spec. Tool calls supply the
   * calling session's resolved mode and root; lower-level callers fall back to
   * the deployment policy.
   */
  resolve(request) {
    return { ...super.resolve(request), sandboxPolicy: request.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve() };
  }
  async run(spec) {
    const policy = spec.sandboxPolicy;
    const { mode } = policy;
    if (mode === "danger-full-access") {
      const result2 = await super.run(spec);
      return { ...result2, sandbox: { mode, denied: false } };
    }
    let confined;
    let result;
    let spawnRequested;
    try {
      ({ result, spawnRequested } = await this.runArgv(spec, async (signal) => {
        const prepared = await this.confine(spec.command, { ...policy, mode }, signal);
        signal.throwIfAborted();
        confined = prepared;
        return prepared.argv;
      }));
    } catch (error) {
      if (spec.signal?.aborted === true) spec.signal.throwIfAborted();
      if (confined !== void 0 && (0, import_dsh_sandbox2.isRunnerSpawnFailure)(error, confined.argv[0], spec.workdir)) {
        throw new import_dsh_sandbox3.SandboxUnavailableError(mode, String(error));
      }
      throw error;
    }
    if (!spawnRequested) return { ...result, sandbox: { mode, denied: false } };
    const facts = confined;
    const runnerFailure = (0, import_dsh_sandbox2.classifyRunnerFailure)(result.exitCode, result.stderr.text, facts.runnerFailureRules);
    if (runnerFailure !== void 0) {
      throw new import_dsh_sandbox3.SandboxUnavailableError(mode, runnerFailure.detail);
    }
    return { ...result, sandbox: { mode, denied: classifyDenial(result, facts.denialSignatures), enforcement: facts.enforcement } };
  }
  async start(spec) {
    const policy = spec.sandboxPolicy;
    const { mode } = policy;
    if (mode === "danger-full-access") return super.start(spec);
    const confined = await this.confine(spec.command, { ...policy, mode }, spec.signal);
    spec.signal?.throwIfAborted();
    let proc;
    try {
      proc = this.startArgv(spec, confined.argv);
    } catch (error) {
      if ((0, import_dsh_sandbox2.isRunnerSpawnFailure)(error, confined.argv[0], spec.workdir)) {
        throw new import_dsh_sandbox3.SandboxUnavailableError(mode, String(error));
      }
      throw error;
    }
    const { enforcement, denialSignatures, runnerFailureRules } = confined;
    this.processFacts.set(proc, {
      mode,
      enforcement,
      denialSignatures,
      runnerFailureRules,
      runnerProgram: confined.argv[0],
      workdir: spec.workdir
    });
    return proc;
  }
  /**
   * Stamp per-process sandbox facts before `done` settles. Full-access processes
   * have no facts; signal deaths are not denials.
   */
  onProcessDone(proc, stderr, providerRejected, providerError) {
    const facts = this.processFacts.get(proc);
    if (facts !== void 0) {
      this.processFacts.delete(proc);
      const runnerFailed = providerRejected ? (0, import_dsh_sandbox2.isRunnerSpawnFailure)(providerError, facts.runnerProgram, facts.workdir) : (0, import_dsh_sandbox2.classifyRunnerFailure)(proc.exitCode, stderr, facts.runnerFailureRules) !== void 0;
      proc.sandbox = {
        mode: facts.mode,
        denied: !runnerFailed && (0, import_dsh_sandbox2.matchesSignature)(proc.exitCode, stderr, facts.denialSignatures),
        enforcement: facts.enforcement,
        ...runnerFailed ? { runnerFailed } : {}
      };
    }
    super.onProcessDone(proc, stderr, providerRejected, providerError);
  }
  /**
   * Wrap one shell command via the `ctx.sandbox` provider. Provider errors
   * propagate unchanged; the returned argv is handed directly to the local
   * executor's subprocess path.
   * @param command - shell source for the confined inner `bash -c`.
   * @param policy - resolved confined execution policy.
   * @param signal - cancellation of confinement preparation.
   * @returns the provider's exact argv and settlement-classification facts.
   */
  confine(command, policy, signal) {
    return this.ctx.sandbox.confine(["bash", "-c", command], policy, signal);
  }
};
var index_default = SandboxBashExecutor;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SandboxBashExecutor
});
return module.exports; }
