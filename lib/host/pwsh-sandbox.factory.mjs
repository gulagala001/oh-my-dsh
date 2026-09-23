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

// vendor/dsh/pwsh-sandbox/src/index.ts
var index_exports = {};
__export(index_exports, {
  SandboxPwshExecutor: () => SandboxPwshExecutor,
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);
var import_dsh_sandbox = require("@deepseek-ai/dsh-sandbox");

// vendor/dsh/pwsh-local/src/index.ts
var import_schemastery = __toESM(require("@deepseek-ai/schemastery"));
var import_dsh_shell = require("@deepseek-ai/dsh-shell");
var import_dsh_timeout = require("@deepseek-ai/dsh-timeout");

// vendor/dsh/pwsh-local/src/resolve.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
function candidatePwshPaths(env = process.env) {
  const programFiles = env.ProgramFiles ?? "C:\\Program Files";
  const systemRoot = env.SystemRoot ?? "C:\\Windows";
  const candidates = [
    (0, import_node_path.join)(programFiles, "PowerShell", "7", "pwsh.exe")
  ];
  for (const entry of (env.PATH ?? "").split(";")) {
    const trimmed = entry.trim().replace(/^"|"$/g, "");
    if (trimmed.length === 0) continue;
    candidates.push((0, import_node_path.join)(trimmed, "pwsh.exe"));
  }
  candidates.push((0, import_node_path.join)(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
  return candidates;
}
function candidateExists(candidate) {
  try {
    const stat = (0, import_node_fs.lstatSync)(candidate);
    return stat.isFile() || stat.isSymbolicLink();
  } catch {
    return false;
  }
}
function resolvePwshPath(configured, env = process.env, platform = process.platform) {
  if (configured !== void 0 && configured.length > 0) return configured;
  if (platform === "win32") {
    for (const candidate of candidatePwshPaths(env)) {
      if (candidateExists(candidate)) return candidate;
    }
  }
  return "pwsh";
}

// vendor/dsh/pwsh-local/src/index.ts
var ENV_OVERRIDES = {
  NO_COLOR: "1",
  PAGER: "cat",
  GIT_PAGER: "cat"
};
var ENCODING_PREAMBLE = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); ";
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
    throw new Error(`pwsh-local: ${name} must be a positive finite number`);
  }
}
function assertServiceablePwshConfig(config) {
  assertPositiveFinite("timeoutMs", config.timeoutMs.get());
  assertPositiveFinite("maxTimeoutMs", config.maxTimeoutMs.get());
  assertPositiveFinite("maxOutputBytes", config.maxOutputBytes.get());
  assertPositiveFinite("maxSpillBytes", config.maxSpillBytes.get());
  assertPositiveFinite("graceMs", config.graceMs.get());
  if (config.graceMs.get() > import_dsh_timeout.MAX_TIMER_DELAY_MS) {
    throw new Error(`pwsh-local: graceMs must be no greater than ${import_dsh_timeout.MAX_TIMER_DELAY_MS}`);
  }
}
var PwshLocalExecutor = class _PwshLocalExecutor extends import_dsh_shell.ShellExecutor {
  constructor(ctx, config) {
    super(ctx);
    this.config = config;
    this.declaredPwshPath = config.pwshPath.get();
    this.resolvedPwshPath = resolvePwshPath(this.declaredPwshPath);
  }
  static inject = ["subprocess"];
  static Config = import_schemastery.default.object({
    cwd: import_schemastery.default.string().volatile(),
    timeoutMs: import_schemastery.default.number().default(12e4).volatile(),
    maxTimeoutMs: import_schemastery.default.number().default(6e5).volatile(),
    maxOutputBytes: import_schemastery.default.number().default(64e3).volatile(),
    maxSpillBytes: import_schemastery.default.number().default(DEFAULT_MAX_SPILL_BYTES).volatile(),
    graceMs: import_schemastery.default.number().default(DEFAULT_GRACE_MS).volatile(),
    pwshPath: import_schemastery.default.string().volatile()
  });
  /** The declared executable the current {@link pwshPath} was resolved from. */
  declaredPwshPath;
  /** The pwsh executable resolved from the current config. */
  resolvedPwshPath;
  /** The pwsh executable every command runs through; a changed declared path is probed again on the next read. */
  get pwshPath() {
    const declared = this.config.pwshPath.get();
    if (declared !== this.declaredPwshPath) {
      this.resolvedPwshPath = resolvePwshPath(declared);
      this.declaredPwshPath = declared;
    }
    return this.resolvedPwshPath;
  }
  /**
   * Resolve a request into a fully-specified spec: fill `workdir` from
   * `config.cwd` (else `process.cwd()`), and `timeoutMs` from
   * `config.timeoutMs`, capped at `config.maxTimeoutMs`.
   */
  resolve(request) {
    assertServiceablePwshConfig(this.config);
    const timeoutMs = (0, import_dsh_timeout.clampTimeout)(
      request.timeoutMs,
      this.config.timeoutMs.get(),
      this.config.maxTimeoutMs.get(),
      "pwsh-local: request.timeoutMs"
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
      ...request.stdin !== void 0 ? { stdin: request.stdin } : {},
      ...request.env !== void 0 ? { env: request.env } : {},
      ...request.dshEnv !== void 0 ? { dshEnv: request.dshEnv } : {},
      sandboxPolicy: request.sandboxPolicy
    };
  }
  /**
   * The pwsh invocation argv for one resolved spec — the argv-level seam a
   * confining subclass wraps through `ctx.sandbox.confine` (the pwsh twin of
   * `dsh-bash-local`'s `executeArgv` hook; see
   * `@deepseek-ai/dsh-pwsh-sandbox`).
   */
  argv(spec) {
    return [this.pwshPath, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `${ENCODING_PREAMBLE}${spec.command}`];
  }
  /** Map one resolved spec plus its argv onto a fully-specified subprocess spawn. */
  spawnSpec(spec, stdoutMaxBytes, signal, argv) {
    const collect = (maxBytes) => ({ maxBytes, spill: { maxBytes: this.config.maxSpillBytes.get() } });
    return {
      argv: [...argv],
      cwd: spec.workdir,
      stdio: {
        stdin: spec.stdin !== void 0 ? { data: spec.stdin } : "ignore",
        stdout: collect(stdoutMaxBytes),
        stderr: collect(this.config.maxOutputBytes.get())
      },
      graceMs: this.config.graceMs.get(),
      signal,
      env: { ...ENV_OVERRIDES, ...spec.env, ...spec.dshEnv }
    };
  }
  /** The collect-mode readers the executor itself requested (present by construction). */
  static collected(handle) {
    const { stdout, stderr } = handle.collected;
    if (stdout === void 0 || stderr === void 0) {
      throw new Error("pwsh-local: subprocess implementation dropped a requested collect stream");
    }
    return { stdout, stderr };
  }
  async execute(spec) {
    return this.executeArgv(spec, this.argv(spec));
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
        running = this.ctx.subprocess.spawn(this.spawnSpec(spec, spec.stdoutMaxBytes, spawnSignal, argv));
      }
    } catch (error) {
      syncSpawnError = { error };
    }
    const emptyReader = {
      readFrom: () => ({ text: "", lossy: false, nextOffset: 0 })
    };
    const collected = running !== void 0 ? _PwshLocalExecutor.collected(running) : { stdout: emptyReader, stderr: emptyReader };
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
   * The base implementation is intentionally empty. Mirrored from
   * `dsh-bash-local` (whose sandboxing subclass consumes the same hook); the
   * pwsh-confining consumer is `@deepseek-ai/dsh-pwsh-sandbox`.
   * @param _proc - the settled process handle.
   * @param _stderr - the process's retained stderr tail used by subclasses for settlement classification.
   * @param _providerRejected - whether the subprocess promise rejected without a direct outcome.
   * @param _providerError - the provider rejection reason, which may itself be undefined.
   */
  onProcessDone(_proc, _stderr, _providerRejected, _providerError) {
  }
};

// vendor/dsh/pwsh-sandbox/src/helpers.ts
var import_node_fs2 = require("node:fs");
var EXECUTABLE_SPAWN_CODES = /* @__PURE__ */ new Set(["EACCES", "ENOENT"]);
function isUsableWorkdir(path) {
  try {
    if (!(0, import_node_fs2.statSync)(path).isDirectory()) return false;
    (0, import_node_fs2.accessSync)(path, import_node_fs2.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function isRunnerSpawnFailure(error, runnerProgram, workdir) {
  if (runnerProgram === void 0 || !isUsableWorkdir(workdir)) return false;
  if (typeof error !== "object" || error === null) return false;
  const { code, path, syscall } = error;
  if (typeof code !== "string" || !EXECUTABLE_SPAWN_CODES.has(code)) return false;
  if (typeof syscall !== "string") return false;
  const exactSyscall = `spawn ${runnerProgram}`;
  if (path === void 0) return syscall === exactSyscall;
  if (typeof path !== "string" || path.length === 0 || path !== runnerProgram) return false;
  return syscall === "spawn" || syscall === exactSyscall;
}
function classifyDenial(result, signatures) {
  return matchesSignature(result.exitCode, result.stderr.text, signatures);
}
function classifyRunnerFailure(exitCode, stderr, rules) {
  if (exitCode === null || exitCode === 0) return void 0;
  const lines = stderr.split(/\r?\n/);
  for (const rule of rules) {
    if (rule.allowedExitCodes !== void 0 && !rule.allowedExitCodes.includes(exitCode)) continue;
    const informationalLines = new Set((rule.informationalLines ?? []).map((line) => line.toLowerCase()));
    const fatalSignatures = rule.fatalSignatures.filter((signature) => signature.trim().length > 0).map((signature) => signature.toLowerCase());
    for (const line of lines) {
      const lowered = line.toLowerCase();
      if (informationalLines.has(lowered)) continue;
      if (fatalSignatures.some((signature) => lowered.includes(signature))) return { detail: line };
    }
  }
  return void 0;
}
function matchesSignature(exitCode, stderr, signatures) {
  if (exitCode === null || exitCode === 0) return false;
  const lowered = stderr.toLowerCase();
  return signatures.some((signature) => lowered.includes(signature.toLowerCase()));
}

// vendor/dsh/pwsh-sandbox/src/index.ts
var SandboxPwshExecutor = class _SandboxPwshExecutor extends PwshLocalExecutor {
  static inject = ["subprocess", "sandbox", "sandboxPolicy"];
  // No own Config: the sandbox default (mode + workspaceRoot) moved to
  // ctx.sandboxPolicy, so this executor inherits PwshLocalExecutor's Config
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
      return _SandboxPwshExecutor.decorateResult(
        await super.execute(spec),
        (result) => ({ ...result, sandbox: { mode, denied: false } })
      );
    }
    let confined;
    const ex = await this.executeArgv(spec, async (signal) => {
      const prepared = await this.confine(spec, { ...policy, mode }, signal);
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
    return _SandboxPwshExecutor.decorateResult(ex, (result) => {
      if (confined === void 0) return { ...result, sandbox: { mode, denied: false } };
      const { enforcement, denialSignatures, runnerFailureRules } = confined;
      const runnerFailure = classifyRunnerFailure(result.exitCode, result.stderr.text, runnerFailureRules);
      if (runnerFailure !== void 0) {
        throw new import_dsh_sandbox.SandboxUnavailableError(mode, runnerFailure.detail);
      }
      return { ...result, sandbox: { mode, denied: classifyDenial(result, denialSignatures), enforcement } };
    }, (error) => {
      if (spec.signal?.aborted === true) spec.signal.throwIfAborted();
      if (confined !== void 0 && isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
        throw new import_dsh_sandbox.SandboxUnavailableError(mode, String(error));
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
   * Stamp per-process sandbox facts before `done` settles. Full-access
   * processes have no facts; signal deaths are not denials.
   */
  onProcessDone(proc, stderr, providerRejected, providerError) {
    const facts = this.processFacts.get(proc);
    if (facts !== void 0) {
      this.processFacts.delete(proc);
      const runnerFailed = providerRejected ? isRunnerSpawnFailure(providerError, facts.runnerProgram, facts.workdir) : classifyRunnerFailure(proc.exitCode, stderr, facts.runnerFailureRules) !== void 0;
      proc.sandbox = {
        mode: facts.mode,
        denied: !runnerFailed && matchesSignature(proc.exitCode, stderr, facts.denialSignatures),
        enforcement: facts.enforcement,
        ...runnerFailed ? { runnerFailed } : {}
      };
    }
    super.onProcessDone(proc, stderr, providerRejected, providerError);
  }
  /**
   * Wrap one pwsh invocation via the `ctx.sandbox` provider. Provider errors
   * propagate unchanged; the returned argv is handed directly to the local
   * executor's subprocess path.
   * @param spec - resolved execution spec whose pwsh argv is confined.
   * @param policy - resolved confined execution policy.
   * @param signal - cancellation of confinement preparation.
   * @returns the provider's exact argv and settlement-classification facts.
   */
  confine(spec, policy, signal) {
    return this.ctx.sandbox.confine(this.argv(spec), policy, signal);
  }
};
var index_default = SandboxPwshExecutor;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SandboxPwshExecutor
});
return module.exports; }
