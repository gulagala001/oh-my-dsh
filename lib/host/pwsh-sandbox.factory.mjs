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
  const resolved = config;
  assertPositiveFinite("timeoutMs", resolved.timeoutMs);
  assertPositiveFinite("maxTimeoutMs", resolved.maxTimeoutMs);
  assertPositiveFinite("maxOutputBytes", resolved.maxOutputBytes);
  assertPositiveFinite("maxSpillBytes", resolved.maxSpillBytes);
  assertPositiveFinite("graceMs", resolved.graceMs);
  if (resolved.graceMs > import_dsh_timeout.MAX_TIMER_DELAY_MS) {
    throw new Error(`pwsh-local: graceMs must be no greater than ${import_dsh_timeout.MAX_TIMER_DELAY_MS}`);
  }
}
var PwshLocalExecutor = class _PwshLocalExecutor extends import_dsh_shell.ShellExecutor {
  static inject = ["subprocess"];
  static Config = import_schemastery.default.object({
    cwd: import_schemastery.default.string(),
    timeoutMs: import_schemastery.default.number().default(12e4),
    maxTimeoutMs: import_schemastery.default.number().default(6e5),
    maxOutputBytes: import_schemastery.default.number().default(64e3),
    maxSpillBytes: import_schemastery.default.number().default(DEFAULT_MAX_SPILL_BYTES),
    graceMs: import_schemastery.default.number().default(DEFAULT_GRACE_MS),
    pwshPath: import_schemastery.default.string()
  });
  /** The currently authoritative config: the settings section, or the composition entry. */
  source;
  /** The declared executable the current {@link pwshPath} was resolved from. */
  declaredPwshPath;
  /** The pwsh executable resolved from the current config. */
  resolvedPwshPath;
  /** Validated config (schemastery applied the defaults before construction). */
  get config() {
    return this.source();
  }
  /** The pwsh executable every command runs through. */
  get pwshPath() {
    return this.resolvedPwshPath;
  }
  constructor(ctx, config) {
    super(ctx);
    const entry = config;
    assertServiceablePwshConfig(entry);
    this.source = () => entry;
    this.declaredPwshPath = entry.pwshPath;
    this.resolvedPwshPath = resolvePwshPath(entry.pwshPath);
    ctx.inject(["settings"], (settingsCtx) => {
      settingsCtx.settings.installSection(ctx, import_dsh_shell.SHELL_SETTINGS_NAMESPACE, _PwshLocalExecutor.Config, entry, {
        validate: assertServiceablePwshConfig,
        setSource: (current) => {
          this.source = current;
        },
        // Probing the filesystem is the one fact derived from the source: every
        // other field is read through the getter at each command.
        onChange: () => {
          const declared = this.source().pwshPath;
          if (declared === this.declaredPwshPath) return;
          this.declaredPwshPath = declared;
          this.resolvedPwshPath = resolvePwshPath(declared);
        }
      });
    });
  }
  /**
   * Resolve a request into a fully-specified spec: fill `workdir` from
   * `config.cwd` (else `process.cwd()`), and `timeoutMs` from
   * `config.timeoutMs`, capped at `config.maxTimeoutMs`.
   */
  resolve(request) {
    const timeoutMs = (0, import_dsh_timeout.clampTimeout)(
      request.timeoutMs,
      this.config.timeoutMs,
      this.config.maxTimeoutMs,
      "pwsh-local: request.timeoutMs"
    );
    const stdoutMaxBytes = request.stdoutMaxBytes ?? this.config.maxOutputBytes;
    assertPositiveFinite("request.stdoutMaxBytes", stdoutMaxBytes);
    return {
      command: request.command,
      workdir: request.workdir ?? this.config.cwd ?? process.cwd(),
      timeoutMs,
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
   * `dsh-bash-local`'s `runArgv`/`startArgv` hooks; see
   * `@deepseek-ai/dsh-pwsh-sandbox`).
   */
  argv(spec) {
    return [this.pwshPath, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `${ENCODING_PREAMBLE}${spec.command}`];
  }
  /** Map one resolved spec plus its argv onto a fully-specified subprocess spawn. */
  spawnSpec(spec, stdoutMaxBytes, signal, argv) {
    const collect = (maxBytes) => ({ maxBytes, spill: { maxBytes: this.config.maxSpillBytes } });
    return {
      argv: [...argv],
      cwd: spec.workdir,
      stdio: {
        stdin: spec.stdin !== void 0 ? { data: spec.stdin } : "ignore",
        stdout: collect(stdoutMaxBytes),
        stderr: collect(this.config.maxOutputBytes)
      },
      graceMs: this.config.graceMs,
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
  async run(spec) {
    return (await this.runArgv(spec, this.argv(spec))).result;
  }
  /**
   * Run argv preparation and execution under one foreground deadline.
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
      const handle = this.ctx.subprocess.spawn(this.spawnSpec(spec, spec.stdoutMaxBytes, d.signal, argv));
      const outcome = await handle.done;
      const collected = _PwshLocalExecutor.collected(handle);
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
    return Promise.resolve(this.startArgv(spec, this.argv(spec)));
  }
  /** Background start of an exact argv (the confining subclass re-wraps it). */
  startArgv(spec, argv) {
    spec.signal?.throwIfAborted();
    const running = this.ctx.subprocess.spawn(this.spawnSpec(spec, this.config.maxOutputBytes, spec.signal, argv));
    const collected = _PwshLocalExecutor.collected(running);
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
var SandboxPwshExecutor = class extends PwshLocalExecutor {
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
        const prepared = await this.confine(spec, { ...policy, mode }, signal);
        signal.throwIfAborted();
        confined = prepared;
        return prepared.argv;
      }));
    } catch (error) {
      if (spec.signal?.aborted === true) spec.signal.throwIfAborted();
      if (confined !== void 0 && isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
        throw new import_dsh_sandbox.SandboxUnavailableError(mode, String(error));
      }
      throw error;
    }
    if (!spawnRequested) return { ...result, sandbox: { mode, denied: false } };
    const facts = confined;
    const runnerFailure = classifyRunnerFailure(result.exitCode, result.stderr.text, facts.runnerFailureRules);
    if (runnerFailure !== void 0) {
      throw new import_dsh_sandbox.SandboxUnavailableError(mode, runnerFailure.detail);
    }
    return { ...result, sandbox: { mode, denied: classifyDenial(result, facts.denialSignatures), enforcement: facts.enforcement } };
  }
  async start(spec) {
    const policy = spec.sandboxPolicy;
    const { mode } = policy;
    if (mode === "danger-full-access") return super.start(spec);
    const confined = await this.confine(spec, { ...policy, mode }, spec.signal);
    spec.signal?.throwIfAborted();
    let proc;
    try {
      proc = this.startArgv(spec, confined.argv);
    } catch (error) {
      if (isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
        throw new import_dsh_sandbox.SandboxUnavailableError(mode, String(error));
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
