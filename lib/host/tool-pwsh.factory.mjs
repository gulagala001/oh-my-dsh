export function createModule(require) { const module = { exports: {} }; const exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
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

// vendor/dsh/tool-pwsh/src/index.ts
var index_exports = {};
__export(index_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_node_path = require("node:path");
var import_cordis = require("@deepseek-ai/cordis");
var import_schemastery = __toESM(require("@deepseek-ai/schemastery"), 1);
var import_dsh_tools = require("@deepseek-ai/dsh-tools");
var import_dsh_llm = require("@deepseek-ai/dsh-llm");
var import_dsh_sandbox3 = require("@deepseek-ai/dsh-sandbox");
var import_dsh_shell = require("@deepseek-ai/dsh-shell");

// vendor/dsh/tool-pwsh/src/background.ts
var import_dsh_sandbox = require("@deepseek-ai/dsh-sandbox");
function sandboxNotes(sandbox, escalationModes) {
  if (sandbox?.runnerFailed) {
    return [`[sandbox: the sandbox runner itself failed under ${sandbox.mode} mode \u2014 the command did not run; this is a sandbox problem, not a command failure]`];
  }
  if (sandbox?.denied) {
    const notes = [(0, import_dsh_sandbox.sandboxDenialMarker)(sandbox.mode)];
    if (escalationModes.length > 0) notes.push((0, import_dsh_sandbox.escalationHintMarker)("command"));
    return notes;
  }
  return [];
}
function processOutcome(proc, escalationModes = []) {
  const base = proc.status === "killed" ? { status: "killed", detail: proc.signal !== null ? `signal: ${proc.signal}` : "killed before exit" } : { status: "completed", detail: `exit code: ${proc.exitCode ?? 0}` };
  const notes = sandboxNotes(proc.sandbox, escalationModes);
  return notes.length === 0 ? base : { ...base, detail: `${base.detail}; ${notes.join(" ")}` };
}
function processSources(proc) {
  const source = (channel) => ({
    channel,
    read: (fromByte) => {
      const live = proc();
      return live === void 0 ? { text: "", nextOffset: fromByte, lossy: false } : live.observed[channel].readFrom(fromByte);
    }
  });
  return [source("stdout"), source("stderr")];
}
function ringDelta(chunks) {
  const out = chunks.filter((chunk) => chunk.channel !== "stderr").map((chunk) => chunk.text).join("");
  const err = chunks.filter((chunk) => chunk.channel === "stderr").map((chunk) => chunk.text).join("");
  const separator = out.length > 0 && !out.endsWith("\n") ? "\n" : "";
  return out + (err.length > 0 ? `${separator}[stderr]
${err}` : "");
}
function processJob(start, outcome) {
  const controller = new AbortController();
  let process;
  const done = (async () => {
    try {
      process = await start(controller.signal);
      try {
        if (controller.signal.aborted) process.kill();
      } finally {
        await process.done;
      }
      return outcome(process);
    } catch (error) {
      return {
        status: controller.signal.aborted && process === void 0 ? "killed" : "failed",
        detail: error instanceof Error ? error.message : String(error)
      };
    }
  })();
  return {
    cancel: (reason) => {
      if (controller.signal.aborted) return;
      controller.abort(reason);
      process?.kill();
    },
    done
  };
}

// vendor/dsh/tool-pwsh/src/render.ts
var import_dsh_sandbox2 = require("@deepseek-ai/dsh-sandbox");
function streamText(output) {
  if (!output.truncated) return output.text;
  return `${output.text}
[output truncated; full output: ${output.spillPath ?? "(unavailable)"}]`;
}
function renderPwshResult(result, escalationModes = []) {
  const out = streamText(result.stdout);
  const err = streamText(result.stderr);
  let body = out;
  if (err.length > 0) {
    if (body.length > 0 && !body.endsWith("\n")) body += "\n";
    body += `[stderr]
${err}`;
  }
  if (body.length === 0) body = "(no output)";
  const markers = [];
  if (result.sandbox?.denied) {
    markers.push((0, import_dsh_sandbox2.sandboxDenialMarker)(result.sandbox.mode));
    if (escalationModes.length > 0) {
      markers.push((0, import_dsh_sandbox2.escalationHintMarker)("command"));
    }
  }
  if (result.timedOut) markers.push(`[timed out after ${result.timeoutMs}ms]`);
  if (result.stopped !== void 0) markers.push(`[stopped: ${result.stopped}]`);
  if (result.signal !== null) {
    markers.push(`[killed by signal: ${result.signal}]`);
  } else if (result.exitCode !== 0) {
    markers.push(`[exit code: ${result.exitCode}]`);
  }
  if (markers.length === 0) return body;
  if (!body.endsWith("\n")) body += "\n";
  return body + markers.join("\n");
}
function renderPwshPromoted(promoted) {
  const body = promoted.output.length > 0 ? promoted.output.endsWith("\n") ? promoted.output : `${promoted.output}
` : "";
  return `${body}[still running after ${promoted.timeoutMs}ms; moved to background job ${promoted.jobId}]
The command keeps running in the background. You will be notified when it finishes; read newer output with job_output, stop it with job_kill.`;
}
function renderPwshJobRead(delta, lossy, spillPaths, sandbox, escalationModes = []) {
  const notices = [];
  if (lossy) {
    notices.push(`[some output was dropped from memory; full output: ${spillPaths.length > 0 ? spillPaths.join(", ") : "(unavailable)"}]`);
  }
  if (sandbox?.runnerFailed) {
    notices.push(`[sandbox: the sandbox runner itself failed under ${sandbox.mode} mode \u2014 the command did not run; this is a sandbox problem, not a command failure]`);
  } else if (sandbox?.denied) {
    notices.push((0, import_dsh_sandbox2.sandboxDenialMarker)(sandbox.mode));
    if (escalationModes.length > 0) {
      notices.push((0, import_dsh_sandbox2.escalationHintMarker)("command"));
    }
  }
  if (notices.length === 0) return delta;
  return `${delta}${delta.length > 0 && !delta.endsWith("\n") ? "\n" : ""}${notices.join("\n")}`;
}

// vendor/dsh/tool-pwsh/src/index.ts
var name = "tool-pwsh";
var inject = ["tools", "shell", "systemPrompt", "shellEnv"];
var Config = import_schemastery.default.object({
  enableRunInBackground: import_schemastery.default.boolean().default(true),
  promoteOnTimeout: import_schemastery.default.boolean().default(true)
});
function validatePwshArgs(args) {
  if (args.command.trim().length === 0) {
    throw new Error("invalid command: expected a non-empty string");
  }
  if (args.description.trim().length === 0) {
    throw new Error("invalid description: expected a non-empty string");
  }
  if (args.timeoutMs !== void 0 && (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0)) {
    throw new Error(`invalid timeoutMs: expected a positive number, got ${JSON.stringify(args.timeoutMs)}`);
  }
  (0, import_dsh_sandbox3.validateEscalationArgs)(args.sandbox_permissions, args.justification);
}
function pwshDescription(backgroundEnabled, escalationModes, promoteOnTimeout) {
  const background = backgroundEnabled ? "Set `run_in_background: true` for long-running commands: the call returns a job id immediately; read its output with `job_output` and stop it with `job_kill`." + (promoteOnTimeout ? " A foreground command that reaches its timeout is not killed: it moves to the background the same way, returning its job id and the output so far." : "") : "Background execution is not available; long-running commands must finish within the timeout.";
  const base = "Execute a PowerShell command (`pwsh -Command`) and return its stdout/stderr. Each call runs in a fresh pwsh process: no state (cwd, variables, functions) persists between calls \u2014 pass `workdir` instead of using `cd`. Paths use native Windows form (`C:\\...`); read environment variables with `$env:NAME`. Non-zero exits are reported as `[exit code: N]`. Current harness environment facts are exposed through managed `$env:DSH_*` variables; inspect them when needed. Commands may run under a file sandbox; a blocked file operation is reported as `[sandbox: file access denied under <mode> mode]` \u2014 a policy denial, not a bug in the command; do not retry another way. Long output is truncated to its tail; the full output is saved to a file whose path is reported when available. On Windows a force-killed command settles as `[exit code: 1]` without a signal marker \u2014 treat it as an interruption, not a command failure. " + background;
  if (escalationModes.length === 0) return base;
  return base + " Under the Windows sandbox, read-only pwsh runs in PowerShell ConstrainedLanguage mode, while workspace-write stays in FullLanguage unless host policy says otherwise. In read-only, prefer cmdlets and core types (`[string]`, `[datetime]`, `[regex]`, `[guid]`); .NET static calls (`[System.IO.*]::`, `[math]::`), `Add-Type`, COM objects, and reflection fail with \"only core types\" errors. `-f` formatting, property access, and core cmdlets work. In both confined modes, programs cannot open named pipes, so a command that captures another program's output through piped stdio (Node.js `child_process.spawn`/`exec` with the default `stdio: 'pipe'`) fails with EPERM, while `stdio: 'inherit'` and `stdio: 'ignore'` spawns work and PowerShell's own pipelines are unaffected. That EPERM is the documented boundary: do not retry the command another way \u2014 escalate the exact command once or restructure it to avoid capturing output. Attempting a command the sandbox may deny is safe and expected: run it and read the marker rather than assuming the denial. When a command is denied and a wider mode would let it succeed, escalate immediately in the same turn \u2014 the one sanctioned exception to a denial: retry the exact same command once with `sandbox_permissions` (the narrowest wider mode that suffices) plus a one-sentence `justification`. Do not detour through chat to ask permission first \u2014 the approval prompt raised by that retry is how the user consents. If the session states approval prompts are disabled, there is no exception: a denial is final \u2014 do not set `sandbox_permissions`. Never escalate speculatively: ground the request in a real denial \u2014 normally the one this command just hit; escalating up front is fine only when this session already denied the same access. A rejected escalation is final for that command \u2014 stop and explain, never work around it \u2014 but it does not forbid attempting or escalating other commands later.";
}
function resolveWorkdir(modelWorkdir, exec) {
  const headerCwd = exec.agent?.session.header.cwd;
  if (modelWorkdir === void 0) return headerCwd;
  if (headerCwd !== void 0 && !(0, import_node_path.isAbsolute)(modelWorkdir)) {
    return (0, import_node_path.resolve)(headerCwd, modelWorkdir);
  }
  return modelWorkdir;
}
function canonicalPwshResult(result) {
  const output = (stream) => ({
    text: stream.text,
    truncated: stream.truncated,
    ...stream.spillPath !== void 0 ? { spillPath: stream.spillPath } : {}
  });
  return {
    kind: "foreground",
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    aborted: result.aborted,
    timeoutMs: result.timeoutMs,
    /* jscpd:ignore-start -- the canonical projection and background-handle shape mirror dsh-tool-bash's by design (Agent Note). */
    stdout: output(result.stdout),
    stderr: output(result.stderr),
    ...result.sandbox !== void 0 ? {
      sandbox: {
        mode: result.sandbox.mode,
        denied: result.sandbox.denied,
        ...result.sandbox.enforcement !== void 0 ? { enforcement: result.sandbox.enforcement } : {},
        ...result.sandbox.runnerFailed !== void 0 ? { runnerFailed: result.sandbox.runnerFailed } : {}
      }
    } : {}
  };
}
function toolAborted() {
  const error = new import_dsh_llm.HarnessError("tool call aborted", import_dsh_tools.TOOL_ABORTED);
  error.name = "AbortError";
  return error;
}
var BACKGROUND_OUTPUT_PROPERTIES = {
  kind: { type: "string", required: true, const: "background" },
  jobId: { type: "string", required: true }
};
function apply(ctx, config = {}) {
  const backgroundEnabled = config.enableRunInBackground ?? true;
  const promoteOnTimeout = (config.promoteOnTimeout ?? true) && backgroundEnabled;
  const defaultMode = ctx.shell.sandboxMode;
  const escalationModes = defaultMode === void 0 ? [] : import_dsh_sandbox3.ESCALATION_TARGETS;
  const sandboxPolicy = defaultMode === void 0 ? void 0 : ctx.get("sandboxPolicy");
  if (defaultMode !== void 0 && sandboxPolicy === void 0) {
    throw new Error("tool-pwsh: the mounted bash executor confines but ctx.sandboxPolicy is missing");
  }
  const resolveSandboxPolicy = (exec) => sandboxPolicy?.resolve(exec.agent === void 0 ? {} : { session: exec.agent.session });
  const approvePwshEscalation = (mode, justification, exec, standingPolicy) => {
    if (escalationModes.length === 0) {
      throw new Error("sandbox_permissions is not available in this composition (no sandboxing executor to escalate)");
    }
    const effectiveMode = standingPolicy.mode;
    return (0, import_dsh_sandbox3.approveEscalation)(
      { requestedMode: mode, justification, effectiveMode, subject: "command" },
      {
        approver: ctx.get("approval"),
        agent: exec.agent,
        callId: exec.callId,
        toolName: "pwsh",
        signal: exec.signal
      }
    );
  };
  ctx.systemPrompt.section({
    name: "tool:pwsh",
    order: ctx.systemPrompt.getSectionOrder("TOOL_PWSH"),
    text: "Non-zero exits are reported as `[exit code: N]` markers; investigate failures before moving on. On Windows a killed process settles as `[exit code: 1]` without a signal marker; treat a bare exit 1 after an interruption as a termination, not a command failure."
  });
  const pwshTool = (jobs) => {
    const background = jobs !== void 0;
    const promote = background && promoteOnTimeout;
    const startJob = (registry, args, exec, spec) => {
      let proc;
      let stopped;
      const id = registry.start({
        kind: "pwsh",
        label: args.command,
        ...exec.agent ? { owner: exec.agent.id } : {},
        output: processSources(() => proc),
        run: () => {
          const hooks = processJob(
            async (signal) => {
              proc = await ctx.shell.execute({ ...spec, signal });
              return proc;
            },
            (started) => processOutcome(started, escalationModes)
          );
          return {
            done: hooks.done,
            // A kill from outside this call (the human's, a parallel job_kill)
            // reaches the process here; its reason is what the model reads.
            cancel: (reason) => {
              stopped = reason;
              hooks.cancel(reason);
            }
          };
        }
      });
      return { id, process: () => proc, stopped: () => stopped };
    };
    const waitOnJob = async (registry, attached, exec, spec, waitMs = spec.timeoutMs, softYield = false) => {
      const owner = exec.agent?.id;
      const timeoutMs = waitMs;
      const stop = async (reason) => {
        registry.kill(attached.id, owner, reason);
        const settled = await registry.wait(attached.id, timeoutMs, owner);
        if (settled.status !== "running" && settled.status !== "stopping") registry.remove(attached.id, owner);
        return settled;
      };
      let view;
      try {
        view = await registry.wait(attached.id, timeoutMs, owner, exec.signal);
      } catch {
        await stop("tool call aborted");
        throw toolAborted();
      }
      if ((view.status === "running" || view.status === "stopping") && attached.process() === void 0 && !softYield) {
        await stop("timed out during preparation");
        return {
          kind: "foreground",
          exitCode: null,
          signal: null,
          timedOut: true,
          aborted: false,
          timeoutMs,
          stdout: { text: "", truncated: false },
          stderr: { text: "", truncated: false },
          ...spec.sandboxPolicy !== void 0 ? { sandbox: { mode: spec.sandboxPolicy.mode, denied: false } } : {}
        };
      }
      if (view.status === "running" || view.status === "stopping") {
        const read = registry.read(attached.id, owner);
        return {
          kind: "promoted",
          jobId: attached.id,
          timeoutMs,
          output: renderPwshJobRead(
            ringDelta(read.chunks),
            read.lossy,
            read.job.output.spillPaths ?? [],
            attached.process()?.sandbox,
            escalationModes
          )
        };
      }
      registry.remove(attached.id, owner);
      const process = attached.process();
      if (process === void 0) throw new Error(view.detail);
      const result = await process.result();
      const stopped = attached.stopped();
      return { ...canonicalPwshResult(result), ...stopped !== void 0 ? { stopped } : {} };
    };
    return (0, import_dsh_tools.defineTool)({
      name: "pwsh",
      description: pwshDescription(background, escalationModes, promote),
      /* jscpd:ignore-start -- deliberate mirror of dsh-tool-bash's parameter surface (pwsh-tool-and-executor Agent Note). */
      parameters: {
        command: { type: "string", required: true, description: "The PowerShell command to execute." },
        description: {
          type: "string",
          required: true,
          description: 'Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: "ls" \u2192 "List files in current directory"; "git status" \u2192 "Show working tree status"; "Get-Process" \u2192 "List running processes".'
        },
        timeoutMs: {
          type: "number",
          description: promote ? "Timeout in milliseconds. The executor applies its configured default and cap; on expiry the command moves to the background as a job instead of being killed." : "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
        },
        ...background ? { yieldMs: { type: "number", description: "Initial wait in milliseconds (250\u201330000) for enabled automatic background mode on top-level calls. The command keeps its original deadline; explicit foreground and nested calls wait for the final result." } } : {},
        workdir: { type: "string", description: "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it." },
        ...background ? {
          run_in_background: { type: "boolean", description: "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies." }
        } : {},
        ...escalationModes.length > 0 ? {
          sandbox_permissions: {
            type: "string",
            enum: [...escalationModes],
            description: "The wider sandbox mode this command needs. Only valid as a one-shot retry of a command the sandbox just denied; requires justification and user approval."
          },
          justification: {
            type: "string",
            description: "Required with sandbox_permissions: one sentence for the user explaining why this exact command needs the wider access."
          }
        } : {}
      },
      /* jscpd:ignore-end */
      output: {
        // The foreground result wire shape mirrors dsh-tool-bash's by contract —
        // consumers of one must accept the other (see the pwsh-tool-and-executor
        // Agent Note).
        /* jscpd:ignore-start -- deliberate result-schema symmetry with dsh-tool-bash. */
        schema: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: BACKGROUND_OUTPUT_PROPERTIES
            },
            {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: { type: "string", required: true, const: "promoted" },
                jobId: { type: "string", required: true },
                timeoutMs: { type: "number", required: true },
                output: { type: "string", required: true }
              }
            },
            {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: { type: "string", required: true, const: "foreground" },
                exitCode: { required: true, oneOf: [{ type: "integer" }, { type: "null" }] },
                signal: { required: true, oneOf: [{ type: "string" }, { type: "null" }] },
                timedOut: { type: "boolean", required: true },
                aborted: { type: "boolean", required: true },
                stopped: { type: "string" },
                timeoutMs: { type: "number", required: true },
                stdout: {
                  type: "object",
                  additionalProperties: false,
                  required: true,
                  properties: {
                    text: { type: "string", required: true },
                    truncated: { type: "boolean", required: true },
                    spillPath: { type: "string" }
                  }
                },
                stderr: {
                  type: "object",
                  additionalProperties: false,
                  required: true,
                  properties: {
                    text: { type: "string", required: true },
                    truncated: { type: "boolean", required: true },
                    spillPath: { type: "string" }
                  }
                },
                sandbox: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    mode: { type: "string", required: true },
                    denied: { type: "boolean", required: true },
                    enforcement: { type: "string" },
                    runnerFailed: { type: "boolean" }
                  }
                }
              }
            }
          ]
        },
        /* jscpd:ignore-end */
        render: (_args, value) => [{
          type: "text",
          text: value.kind === "background" ? `started background job ${value.jobId}` : value.kind === "promoted" ? renderPwshPromoted(value) : renderPwshResult(value, escalationModes)
        }]
      },
      /* jscpd:ignore-start -- the execute path mirrors dsh-tool-bash's by design (see the pwsh-tool-and-executor Agent Note). */
      async execute(args, exec) {
        validatePwshArgs(args);
        if (args.yieldMs !== void 0 && (!Number.isInteger(args.yieldMs) || args.yieldMs < 250 || args.yieldMs > 3e4)) throw new Error("yieldMs must be an integer from 250 to 30000");
        const standingPolicy = resolveSandboxPolicy(exec);
        const approvedMode = args.sandbox_permissions !== void 0 && args.justification !== void 0 ? await approvePwshEscalation(args.sandbox_permissions, args.justification, exec, standingPolicy) : void 0;
        const policy = approvedMode === void 0 ? standingPolicy : { ...standingPolicy, mode: approvedMode };
        const workdir = resolveWorkdir(args.workdir, exec);
        const request = {
          command: args.command,
          ...workdir !== void 0 ? { workdir } : {},
          ...args.timeoutMs !== void 0 ? { timeoutMs: args.timeoutMs } : {},
          dshEnv: ctx.shellEnv.collect(exec),
          ...policy !== void 0 ? { sandboxPolicy: policy } : {}
        };
        if (args.run_in_background === true) {
          if (!backgroundEnabled) {
            throw new Error("run_in_background is disabled for this deployment (enableRunInBackground: false)");
          }
          if (jobs === void 0) {
            throw new Error("background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs");
          }
          if (exec.signal.aborted) throw toolAborted();
          return { kind: "background", jobId: startJob(jobs, args, exec, ctx.shell.resolve({ ...request, onExpiry: "none" })).id };
        }
        const softYield = jobs?.ownerOptions(exec.agent).softYieldMs;
        if (jobs !== void 0 && softYield !== void 0 && !exec.parent && args.run_in_background === void 0) {
          const spec = ctx.shell.resolve({ ...request, onExpiry: "kill" });
          const attached = startJob(jobs, args, exec, spec);
          return waitOnJob(jobs, attached, exec, spec, args.yieldMs ?? softYield, true);
        }
        if (jobs !== void 0 && promote && softYield === void 0) {
          const spec = ctx.shell.resolve({ ...request, onExpiry: "none" });
          let attached;
          try {
            attached = startJob(jobs, args, exec, spec);
          } catch (error) {
            ctx.logger.warn(`pwsh: job registration refused, running in the foreground with the timeout kill instead: ${String(error)}`);
          }
          if (attached !== void 0) return waitOnJob(jobs, attached, exec, spec);
        }
        const foreground = await ctx.shell.execute(ctx.shell.resolve({ ...request, signal: exec.signal }));
        const result = await foreground.result();
        if (result.aborted) throw toolAborted();
        return canonicalPwshResult(result);
      },
      /* jscpd:ignore-end */
      /* jscpd:ignore-start -- the background call card mirrors presentBashCall's by design (Agent Note). */
      presentCall: (args) => {
        if (args.run_in_background === true) {
          return {
            card: "generic",
            title: args.command,
            kind: "execute",
            rawInput: args.command,
            content: [{ type: "text", text: args.description }]
          };
        }
        return {
          card: "terminal",
          title: args.command,
          description: args.description,
          ...args.workdir !== void 0 ? { cwd: args.workdir } : {}
        };
      },
      /* jscpd:ignore-end */
      /* jscpd:ignore-start -- the completed-result presentation mirrors presentBashResult's by design (Agent Note). */
      presentResult: (args, result) => {
        const block = result.content.length === 1 ? result.content[0] : void 0;
        if (block === void 0 || block.type !== "text") return void 0;
        const raw = block.text;
        const isBackground = typeof args === "object" && args !== null && args.run_in_background === true;
        const isPromoted = result.value?.kind === "promoted";
        if (isBackground || isPromoted || result.isError) {
          return { card: "generic", content: [{ type: "text", text: `\`\`\`console
${raw.replace(/\n+$/, "")}
\`\`\`` }] };
        }
        const { body, ...exit } = (0, import_dsh_shell.parseExitStatus)(raw);
        return { card: "terminal", output: body, ...exit };
      }
      /* jscpd:ignore-end */
    });
  };
  if (!backgroundEnabled) {
    ctx.tools.register(pwshTool(void 0));
    return;
  }
  let foregroundOnly = ctx.get("jobs") === void 0 ? ctx.tools.register(pwshTool(void 0)) : void 0;
  ctx.inject(["jobs"], (jobCtx) => {
    foregroundOnly?.();
    foregroundOnly = void 0;
    const unregister = ctx.tools.register(pwshTool(jobCtx.jobs));
    jobCtx.effect(() => () => {
      unregister();
      if (ctx.fiber.state === import_cordis.FiberState.ACTIVE) foregroundOnly = ctx.tools.register(pwshTool(void 0));
    });
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  inject,
  name
});
return module.exports; }
