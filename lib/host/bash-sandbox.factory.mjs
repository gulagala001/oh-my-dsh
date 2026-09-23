export function createModule(require) { const module = { exports: {} }; const exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
  assertPositiveFinite("timeoutMs", config.timeoutMs.get());
  assertPositiveFinite("maxTimeoutMs", config.maxTimeoutMs.get());
  assertPositiveFinite("maxOutputBytes", config.maxOutputBytes.get());
  assertPositiveFinite("maxSpillBytes", config.maxSpillBytes.get());
  assertPositiveFinite("graceMs", config.graceMs.get());
  if (config.graceMs.get() > import_dsh_timeout.MAX_TIMER_DELAY_MS) {
    throw new Error(`bash-local: graceMs must be no greater than ${import_dsh_timeout.MAX_TIMER_DELAY_MS}`);
  }
}
var LocalBashExecutor = class _LocalBashExecutor extends import_dsh_shell.ShellExecutor {
  constructor(ctx, config) {
    super(ctx);
    this.config = config;
  }
  static inject = ["subprocess"];
  static Config = import_schemastery.default.object({
    cwd: import_schemastery.default.string().volatile(),
    timeoutMs: import_schemastery.default.number().default(12e4).volatile(),
    maxTimeoutMs: import_schemastery.default.number().default(6e5).volatile(),
    maxOutputBytes: import_schemastery.default.number().default(64e3).volatile(),
    maxSpillBytes: import_schemastery.default.number().default(DEFAULT_MAX_SPILL_BYTES).volatile(),
    graceMs: import_schemastery.default.number().default(DEFAULT_GRACE_MS).volatile()
  });
  /**
   * Resolve a request into a fully-specified spec: fill `workdir` from
   * `config.cwd` (else `process.cwd()`), and `timeoutMs` from
   * `config.timeoutMs`, capped at `config.maxTimeoutMs`. The tool layer calls
   * this before {@link execute}, so it receives explicit values and never
   * re-defaults.
   */
  resolve(request) {
    assertServiceableBashConfig(this.config);
    const timeoutMs = (0, import_dsh_timeout.clampTimeout)(
      request.timeoutMs,
      this.config.timeoutMs.get(),
      this.config.maxTimeoutMs.get(),
      "bash-local: request.timeoutMs"
    );
    const stdoutMaxBytes = request.stdoutMaxBytes ?? this.config.maxOutputBytes.get();
    assertPositiveFinite("request.stdoutMaxBytes", stdoutMaxBytes);
    return {
      command: request.command,
      workdir: request.workdir ?? this.config.cwd.get() ?? process.cwd(),
      timeoutMs,
      onExpiry: request.onExpiry ?? "kill",
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
    const collect = (maxBytes) => ({ maxBytes, spill: { maxBytes: this.config.maxSpillBytes.get() } });
    return {
      argv,
      cwd: spec.workdir,
      stdio: {
        stdin: spec.stdin !== void 0 ? { data: spec.stdin } : "ignore",
        stdout: collect(stdoutMaxBytes),
        stderr: collect(this.config.maxOutputBytes.get())
      },
      graceMs: this.config.graceMs.get(),
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
  async execute(spec) {
    return this.executeArgv(spec, ["bash", "-c", spec.command]);
  }
  /**
   * Execute an explicit argv with the lifecycle, environment, output,
   * deadline, and cancellation semantics of this executor. Subclasses use this
   * after replacing the public command's shell argv at an execution boundary.
   * @param spec - resolved execution settings and caller-owned command metadata.
   * @param argvOrPrepare - exact argv, or preparation using the execution cancellation signal.
   * @param onStarted - installs provider facts synchronously before the handle can settle.
   * @returns the live execution handle; spawn rejection settles the handle as
   *   killed while `result()` carries the same failure as its rejection.
   */
  async executeArgv(spec, argvOrPrepare, onStarted) {
    let spawnSignal;
    let classify;
    let disarm = () => {
    };
    if (spec.onExpiry === "kill") {
      const d = (0, import_dsh_timeout.deadline)(spec.signal, spec.timeoutMs, "BASH_TIMEOUT");
      spawnSignal = d.signal;
      classify = () => {
        const timedOut = (0, import_dsh_timeout.timeoutOf)(d.signal, "BASH_TIMEOUT") !== void 0;
        return { timedOut, aborted: d.signal.aborted && !timedOut };
      };
      disarm = () => {
        d[Symbol.dispose]();
      };
    } else {
      spawnSignal = spec.signal;
      classify = () => ({ timedOut: false, aborted: spec.signal?.aborted === true });
    }
    let argv = [];
    let preparationTimedOut = false;
    if (typeof argvOrPrepare === "function") {
      const signal = spawnSignal ?? new AbortController().signal;
      const cancelled = Promise.withResolvers();
      const abort = () => {
        cancelled.reject(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        argv = await Promise.race([
          Promise.resolve().then(() => {
            signal.throwIfAborted();
            return argvOrPrepare(signal);
          }),
          cancelled.promise
        ]);
        signal.throwIfAborted();
      } catch (error) {
        if (!classify().timedOut) {
          disarm();
          throw error;
        }
        preparationTimedOut = true;
      } finally {
        signal.removeEventListener("abort", abort);
      }
    } else {
      argv = argvOrPrepare;
    }
    let running;
    let syncSpawnError;
    try {
      if (!preparationTimedOut) {
        running = this.ctx.subprocess.spawn(this.spawnSpec(spec, argv, spec.stdoutMaxBytes, spawnSignal));
      }
    } catch (error) {
      syncSpawnError = { error };
    }
    const emptyReader = {
      readFrom: () => ({ text: "", lossy: false, nextOffset: 0 })
    };
    const collected = running !== void 0 ? _LocalBashExecutor.collected(running) : { stdout: emptyReader, stderr: emptyReader };
    const spawnThrow = () => syncSpawnError.error;
    const spawned = preparationTimedOut ? Promise.resolve({ exitCode: null, signal: null }) : running !== void 0 ? running.done : Promise.reject(spawnThrow());
    let providerFailure;
    let providerFailureReported = false;
    const consumeProviderFailure = () => {
      if (providerFailure === void 0 || providerFailureReported) return "";
      providerFailureReported = true;
      return providerFailure.note;
    };
    const observedStderr = {
      readFrom: (fromByte) => {
        if (providerFailure === void 0) return collected.stderr.readFrom(fromByte);
        const note = Buffer.from(providerFailure.note, "utf8");
        return { text: note.subarray(Math.min(fromByte, note.length)).toString("utf8"), nextOffset: note.length, lossy: false };
      }
    };
    let stdoutOffset = 0;
    let stderrOffset = 0;
    let resultPromise;
    const proc = {
      status: "running",
      exitCode: null,
      signal: null,
      observed: { stdout: collected.stdout, stderr: observedStderr },
      done: spawned.then((outcome) => {
        if (proc.status === "running") {
          proc.status = spawnSignal?.aborted === true || outcome.signal !== null ? "killed" : "completed";
        }
        proc.exitCode = outcome.exitCode;
        proc.signal = outcome.signal;
        this.onProcessDone(proc, collected.stderr.readFrom(0).text, false);
        disarm();
      }, (error) => {
        if (running !== void 0 && (proc.status === "killed" || spawnSignal?.aborted === true)) {
          proc.status = "killed";
          this.onProcessDone(proc, collected.stderr.readFrom(0).text, false);
          disarm();
          return;
        }
        proc.status = "killed";
        let detail = "unprintable provider failure";
        try {
          detail = String(error);
        } catch {
        }
        providerFailure = { error, note: `subprocess failed before reporting an outcome: ${detail}` };
        this.onProcessDone(proc, providerFailure.note, true, error);
        disarm();
      }),
      readOutput: () => {
        const out = collected.stdout.readFrom(stdoutOffset);
        const err = collected.stderr.readFrom(stderrOffset);
        stdoutOffset = out.nextOffset;
        stderrOffset = err.nextOffset;
        const providerFailure2 = consumeProviderFailure();
        const failureSeparator = err.text.length > 0 && !err.text.endsWith("\n") ? "\n" : "";
        const errText = err.text + (providerFailure2.length > 0 ? `${failureSeparator}${providerFailure2}` : "");
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
        running?.terminate();
        return true;
      },
      result: () => {
        resultPromise ??= proc.done.then(() => {
          if (providerFailure !== void 0) throw providerFailure.error;
          return {
            exitCode: proc.exitCode,
            signal: proc.signal,
            ...classify(),
            timeoutMs: spec.timeoutMs,
            stdout: finalOutput(collected.stdout),
            stderr: finalOutput(collected.stderr)
          };
        });
        return resultPromise;
      }
    };
    if (!preparationTimedOut) onStarted?.(proc);
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
var SandboxBashExecutor = class _SandboxBashExecutor extends LocalBashExecutor {
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
  async execute(spec) {
    const policy = spec.sandboxPolicy;
    const { mode } = policy;
    if (mode === "danger-full-access") {
      return _SandboxBashExecutor.decorateResult(
        await super.execute(spec),
        (result) => ({ ...result, sandbox: { mode, denied: false } })
      );
    }
    let confined;
    const ex = await this.executeArgv(spec, async (signal) => {
      const prepared = await this.confine(spec.command, { ...policy, mode }, signal);
      signal.throwIfAborted();
      confined = prepared;
      return prepared.argv;
    }, (process2) => {
      const facts = confined;
      this.processFacts.set(process2, {
        mode,
        enforcement: facts.enforcement,
        denialSignatures: facts.denialSignatures,
        runnerFailureRules: facts.runnerFailureRules,
        runnerProgram: facts.argv[0],
        workdir: spec.workdir
      });
    });
    return _SandboxBashExecutor.decorateResult(ex, (result) => {
      if (confined === void 0) return { ...result, sandbox: { mode, denied: false } };
      const { enforcement, denialSignatures, runnerFailureRules } = confined;
      const runnerFailure = (0, import_dsh_sandbox2.classifyRunnerFailure)(result.exitCode, result.stderr.text, runnerFailureRules);
      if (runnerFailure !== void 0) {
        throw new import_dsh_sandbox3.SandboxUnavailableError(mode, runnerFailure.detail);
      }
      return { ...result, sandbox: { mode, denied: classifyDenial(result, denialSignatures), enforcement } };
    }, (error) => {
      if (spec.signal?.aborted === true) spec.signal.throwIfAborted();
      if (confined !== void 0 && (0, import_dsh_sandbox2.isRunnerSpawnFailure)(error, confined.argv[0], spec.workdir)) {
        throw new import_dsh_sandbox3.SandboxUnavailableError(mode, String(error));
      }
      throw error;
    });
  }
  /**
   * Decorate the handle's foreground projection in place, memoized once. The
   * handle keeps its identity (never wrapped in a second object) because the
   * per-process facts and `onProcessDone` key on the exact instance.
   */
  static decorateResult(ex, map, mapError) {
    const base = ex.result.bind(ex);
    let decorated;
    ex.result = () => {
      decorated ??= base().then(map, mapError);
      return decorated;
    };
    return ex;
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
