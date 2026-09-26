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

// vendor/dsh/tool-workflow/src/index.ts
var index_exports = {};
__export(index_exports, {
  Config: () => Config,
  DESCRIPTION: () => DESCRIPTION,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_schemastery = __toESM(require("@deepseek-ai/schemastery"), 1);
var import_dsh_tools = require("@deepseek-ai/dsh-tools");

// vendor/dsh/tool-workflow/src/record.ts
function createWorkflowRecordMirror(ctx) {
  const active = /* @__PURE__ */ new Map();
  ctx.on("workflow/phase", (info, title) => {
    const job = active.get(info.id);
    if (job === void 0) return;
    job.updateProgress(title);
    job.append(`\u25B8 ${title}
`, { channel: "log" });
  });
  ctx.on("workflow/log", (info, message) => {
    active.get(info.id)?.append(`${message}
`, { channel: "log" });
  });
  ctx.on("workflow/agent-start", (info, agent) => {
    active.get(info.id)?.append(`agent #${agent.seq} ${agent.label} started
`, { channel: "log" });
  });
  ctx.on("workflow/agent-end", (info, agent) => {
    active.get(info.id)?.append(`agent #${agent.seq} ${agent.outcome}
`, { channel: "log" });
  });
  return {
    start(runId, job) {
      active.set(runId, job);
    },
    stop(runId) {
      active.delete(runId);
    }
  };
}

// vendor/dsh/tool-workflow/src/index.ts
var name = "tool-workflow";
var inject = ["tools", "workflowEngine", "systemPrompt"];
var Config = import_schemastery.default.object({
  toolName: import_schemastery.default.string().default("workflow"),
  maxResultChars: import_schemastery.default.natural().min(1).default(5e4),
  enableRunInBackground: import_schemastery.default.boolean().default(true)
});
function renderRecordingError(error) {
  try {
    return String(error);
  } catch {
    return "[unrenderable thrown value]";
  }
}
function createWorkflowRecorder(ctx) {
  const active = /* @__PURE__ */ new Map();
  const append = (session, type, data) => {
    const appendRecord = session.append.bind(session);
    try {
      appendRecord(type, data);
      return true;
    } catch (error) {
      ctx.logger.warn(`tool-workflow: disabled durable record after ${type} append failed: ${renderRecordingError(error)}`);
      return false;
    }
  };
  ctx.on("workflow/agent-start", (info, agent) => {
    const session = active.get(info.id);
    if (session === void 0) return;
    const data = {
      runId: info.id,
      seq: agent.seq,
      label: agent.label,
      ...agent.phase === void 0 ? {} : { phase: agent.phase },
      childId: agent.childId
    };
    if (!append(session, "tool-workflow/agent-start", data)) active.delete(info.id);
  });
  ctx.on("workflow/agent-end", (info, agent) => {
    const session = active.get(info.id);
    if (session === void 0) return;
    const data = {
      runId: info.id,
      seq: agent.seq,
      outcome: agent.outcome
    };
    if (!append(session, "tool-workflow/agent-end", data)) active.delete(info.id);
  });
  return {
    start(session, run) {
      if (append(session, "tool-workflow/run-start", { runId: run.id, name: run.meta.name })) {
        active.set(run.id, session);
      }
    },
    finish(runId, stopReason) {
      const session = active.get(runId);
      if (session !== void 0) append(session, "tool-workflow/run-end", { runId, stopReason });
      active.delete(runId);
    },
    abandon: (runId) => {
      active.delete(runId);
    }
  };
}
var DESCRIPTION = `Run a JavaScript workflow that coordinates subagents when the user has authorized multi-agent orchestration. An active Ultracode reminder supplies standing authorization for substantive tasks; when Ultracode is off, the ordinary opt-in rule applies.

Pass an inline plain JavaScript script beginning with \`export const meta = {...}\`. The metadata must be a pure literal with \`name\` and \`description\`, plus optional \`whenToUse\` and \`phases\`; no calls, variables, spreads, or interpolation. A separate \`meta\` object with a script body is also accepted. Top-level \`await\` is supported; finish with a JSON-serializable \`return\` value. Pass \`args\` as actual JSON values, including arrays, rather than JSON-encoded strings.

Each invocation saves its script and returns \`runId\`, \`scriptPath\`, and \`transcriptDir\`. Edit that script and invoke with \`scriptPath\`, or use \`name\` to load \`.omd/workflows/<name>.js\` in the workspace. Supply exactly one of \`script\`, \`scriptPath\`, or \`name\`. Foreground calls return when the workflow finishes. With \`run_in_background: true\`, the tool returns a native job id; collect the result with \`job_output\` and cancel with \`job_kill\`.

- \`agent(prompt, opts?)\`: run a child to completion. Without \`schema\`, returns final text; with a supported object-root schema, returns the validated object. A child failure returns \`null\`. Other options are \`label\`, \`phase\`, \`provider\`, \`model\`, \`effort\`, \`isolation\`, and \`agentType\`. Here \`provider\` and \`model\` are independent overrides; either may be supplied alone. Omit model and effort overrides to inherit the parent route; a changed model resolves its own default effort unless one is supplied. Effort values must be supported by the selected model. \`agentType\` selects a registered native agent preset id; \`general-purpose\` inherits the parent's preset. \`isolation: 'worktree'\` creates a separate Git checkout at HEAD. Use it when concurrent agents would otherwise conflict while editing files. Parent uncommitted changes are not copied. Unchanged checkouts are removed after the child stops; changes, new files, and commits are retained and their paths reported in \`worktrees\`. Confined modes keep their filesystem restrictions.
- \`pipeline(items, ...stages)\`: process each item across stages without a cross-item barrier. Each stage receives \`(prev, item, index)\`. An ordinary stage exception drops that item to \`null\` and skips its remaining stages.
- \`parallel(thunks)\`: wait for all independent functions at a barrier. A throwing function returns \`null\`.
- \`phase(title)\` and \`log(message)\`: report progress. \`args\` holds the tool's input value.
- \`workflow(nameOrRef, args?)\`: run a saved workflow by name or \`{scriptPath}\` as a sub-step. The child shares concurrency, total-agent limits, cancellation, and the token pool. Nesting is limited to one level.
- \`budget.total\`, \`budget.spent()\`, and \`budget.remaining()\`: the initiating turn's shared output-token target and reported usage across the main loop and delegated work. A human message ending with \`+500k\` sets a 500,000-output-token target; without a target, \`total\` is null and \`remaining()\` is Infinity. Once the target is reached, no further live agents start. Already-running calls may finish above the target. If a model call does not report usable usage, a set target blocks further dispatch instead of treating that call as free. Background workflows retain their initiating pool when a new human turn begins.

Only the documented JSON Schema subset is supported: type, properties, required, additionalProperties, items, enum, const, and oneOf. Invalid hooks, schemas, or caps fail the script rather than becoming per-item null results. Concurrency and agent-count limits still apply.

This engine runs the orchestration program in a fresh Node PTC process under the calling session's file policy. Its documented API is the helper set above; it is not a security boundary. The program-visible environment is empty, and the file policy does not restrict network access. The engine has no overall elapsed deadline, but its initial synchronous slice, process limits, caller cancellation, and enclosing tool deadlines still apply.

Use the helpers to coordinate work performed by agents. Do not infer arbitrary Node API support from the underlying process. Scripts must be deterministic: \`Date.now()\`, \`Math.random()\`, and argumentless \`new Date()\` are unavailable; pass time or randomness through \`args\`.

To resume after cancellation, failure, or script edits, pass \`resumeFromRunId\` with the saved script path. Only the longest unchanged completed prefix of agent calls, in their start order, returns cached results; the first changed, new, failed, or unfinished call and everything after it run live. A run cannot be resumed while it or another resume still owns its children. Read \`journal.jsonl\` under \`transcriptDir\` to inspect actual results, including empty strings and nulls. Inspect failures and coverage before reporting a complete result.`;
function details(run) {
  const extended = run;
  return { name: run.meta.name, runId: run.id, scriptPath: extended.scriptPath, transcriptDir: extended.transcriptDir, worktrees: extended.worktrees };
}
function locationText(run) {
  const value = details(run);
  return `Run ID: ${value.runId}
Script: ${value.scriptPath}
Journal: ${value.transcriptDir}/journal.jsonl` + (value.worktrees.length ? `
Worktrees: ${JSON.stringify(value.worktrees)}` : "");
}
function presentWorkflowCall(args) {
  return {
    card: "generic",
    title: `workflow: ${args.meta?.name ?? args.name ?? args.scriptPath ?? "script"}`,
    rawInput: args.script ?? args.scriptPath ?? args.name ?? ""
  };
}
function presentWorkflowResult(args, result) {
  void args;
  void result;
  return { card: "generic" };
}
function stopReasonError(result) {
  switch (result.stopReason) {
    case "completed":
      return void 0;
    case "cancelled":
      return `workflow run was cancelled${result.error !== void 0 ? ` (${result.error})` : ""}`;
    case "error":
      return `workflow run failed: ${result.error ?? "unknown error"}`;
    /* v8 ignore start -- defensive: WorkflowStopReason is a closed union, exhaustive by construction; a future variant fails here loudly */
    default:
      return `workflow run ended abnormally (${String(result.stopReason)})`;
  }
}
function jobOutcomeOf(result, run, maxChars) {
  switch (result.stopReason) {
    case "completed":
      return {
        status: "completed",
        detail: `${result.agentsStarted} agent${result.agentsStarted === 1 ? "" : "s"}`,
        result: renderResult(run.meta.name, result.agentsStarted, result.value, maxChars) + "\n" + locationText(run)
      };
    case "cancelled":
      return { status: "killed", detail: locationText(run) };
    case "error":
      return { status: "failed", detail: (result.error ?? "unknown error") + "\n" + locationText(run) };
    /* v8 ignore start -- defensive: WorkflowStopReason is a closed union, exhaustive by construction; a future variant fails here loudly */
    default:
      return { status: "failed", detail: `workflow run ended abnormally (${String(result.stopReason)})` };
  }
}
function renderResult(name2, agentsStarted, value, maxChars) {
  const rendered = JSON.stringify(value, null, 2);
  const clipped = rendered.length > maxChars ? `${rendered.slice(0, maxChars)}
\u2026 [truncated: ${rendered.length - maxChars} more characters]` : rendered;
  return `workflow "${name2}" completed (${agentsStarted} agent${agentsStarted === 1 ? "" : "s"}).
Return value:
${clipped}`;
}
async function startBackgroundRun(ctx, args, parent, recordsRun, deps) {
  const jobs = ctx.get("jobs");
  if (jobs === void 0) {
    throw new Error("background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs");
  }
  let run;
  const jobId = jobs.start({
    kind: "workflow",
    label: args.meta.name,
    owner: parent.id,
    run: (job) => {
      run = ctx.workflowEngine.start({
        script: args.script,
        meta: args.meta,
        ...args.args !== void 0 ? { args: args.args } : {},
        ...args.resumeFromRunId !== void 0 ? { resumeFromRunId: args.resumeFromRunId } : {},
        parent
      });
      deps.mirror.start(run.id, job);
      if (recordsRun) deps.recorder.start(parent.session, run);
      const done = run.result.then(async (result) => {
        try {
          await run.dispose();
        } catch (error) {
          ctx.logger.warn(`background workflow run ${run.id} dispose failed: ${String(error)}`);
        }
        deps.mirror.stop(run.id);
        if (recordsRun) {
          deps.recorder.finish(run.id, result.stopReason);
          deps.recorder.abandon(run.id);
        }
        return jobOutcomeOf(result, run, deps.maxResultChars);
      });
      return {
        cancel: (reason) => {
          run.cancel(reason ?? "background workflow job killed");
        },
        done
      };
    }
  });
  try {
    await run.ready;
  } catch (error) {
    throw new Error(`${String(error)}
${locationText(run)}`, { cause: error });
  }
  return { kind: "background", jobId, ...details(run) };
}
function apply(ctx, config) {
  const { toolName, maxResultChars, enableRunInBackground } = config;
  const recorder = createWorkflowRecorder(ctx);
  const mirror = createWorkflowRecordMirror(ctx);
  ctx.systemPrompt.section({
    name: `tool:${toolName}`,
    order: ctx.systemPrompt.getSectionOrder("TOOL_WORKFLOW"),
    text: `Use the ${toolName} tool ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration: you write a JavaScript script (the tool description documents the exact format) that fans work out across many subagents with phases and structured results. For one or two delegations, prefer plain subagent calls.`
  });
  ctx.tools.register((0, import_dsh_tools.defineTool)({
    name: toolName,
    description: enableRunInBackground ? DESCRIPTION : DESCRIPTION.replace(/ With `run_in_background: true`,[^\n]*?`job_kill`\./, ""),
    parameters: {
      script: {
        type: "string",
        description: "An inline plain JavaScript workflow beginning with `export const meta = {...}`; top-level await is allowed. Alternatively pass a body with the separate meta field. End with `return <value>`; the JSON-serializable value is this tool's result."
      },
      meta: {
        type: "object",
        additionalProperties: true,
        description: "Optional workflow identity for a script body without an inline meta declaration.",
        properties: {
          name: { type: "string", required: true, description: "Short kebab-case workflow name." },
          description: { type: "string", required: true, description: "One-line description of what the workflow does." },
          whenToUse: { type: "string", description: "Optional guidance on when this workflow applies." },
          phases: {
            type: "array",
            description: "Optional phase declarations matched by phase() calls.",
            items: {
              type: "object",
              additionalProperties: true,
              properties: {
                title: { type: "string", required: true, description: "The phase title phase() calls match by exact string." },
                detail: { type: "string", description: "Optional one-line description of the phase." },
                provider: { type: "string", description: "Optional provider override this phase is expected to use." },
                model: { type: "string", description: "Optional model override this phase is expected to use." }
              }
            }
          }
        }
      },
      args: {
        type: "json",
        description: "Optional JSON input exposed verbatim as args. Pass arrays and objects as JSON values, not JSON-encoded strings."
      },
      name: { type: "string", description: "Saved workflow name from .omd/workflows/<name>.js. Supply exactly one of name, script, or scriptPath." },
      scriptPath: { type: "string", description: "Path to a saved workflow script, including inline meta. Use the returned path to edit and rerun a workflow." },
      resumeFromRunId: { type: "string", description: "Resume a previous run in this session: reuse its longest unchanged completed prefix, then run the remaining calls live." },
      ...enableRunInBackground ? {
        run_in_background: {
          type: "boolean",
          description: "Run as a background job: return a job id immediately instead of waiting; the return value arrives with the completion notice."
        }
      } : {}
    },
    output: {
      schema: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", required: true, const: "background" },
              jobId: { type: "string", required: true },
              runId: { type: "string", required: true },
              name: { type: "string", required: true },
              scriptPath: { type: "string", required: true },
              transcriptDir: { type: "string", required: true },
              worktrees: { type: "json", required: true }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", required: true, const: "foreground" },
              runId: { type: "string", required: true },
              name: { type: "string", required: true },
              scriptPath: { type: "string", required: true },
              transcriptDir: { type: "string", required: true },
              worktrees: { type: "json", required: true },
              agentsStarted: { type: "integer", required: true },
              result: { type: "json", required: true }
            }
          }
        ]
      },
      render: (args, value) => [{
        type: "text",
        text: (value.kind === "background" ? `workflow "${value.name}" started in the background as job ${value.jobId}. Its return value arrives with the completion notice; check on it with job_output, stop it with job_kill.` : renderResult(value.name, value.agentsStarted, value.result, maxResultChars)) + `
Run ID: ${value.runId}
Script: ${value.scriptPath}
Journal: ${value.transcriptDir}/journal.jsonl` + (Array.isArray(value.worktrees) && value.worktrees.length ? `
Worktrees: ${JSON.stringify(value.worktrees)}` : "")
      }]
    },
    async execute(input, exec) {
      const parent = exec.agent;
      if (!parent) {
        throw new Error("workflow tool requires a calling agent (exec.agent was undefined)");
      }
      const prepared = await ctx.workflowEngine.prepare(input, parent, exec.signal);
      exec.signal.throwIfAborted();
      const args = { ...input, ...prepared };
      if (args.run_in_background === true) {
        if (!enableRunInBackground) {
          throw new Error("run_in_background is disabled for this tool");
        }
        return startBackgroundRun(ctx, args, parent, exec.parent === void 0, {
          recorder,
          mirror,
          maxResultChars
        });
      }
      const run = ctx.workflowEngine.start({
        script: args.script,
        meta: args.meta,
        ...args.args !== void 0 ? { args: args.args } : {},
        ...args.resumeFromRunId !== void 0 ? { resumeFromRunId: args.resumeFromRunId } : {},
        parent,
        signal: exec.signal
      });
      const recordsRun = exec.parent === void 0;
      if (recordsRun) recorder.start(parent.session, run);
      const onAbort = () => {
        run.cancel("parent step aborted");
      };
      exec.signal.addEventListener("abort", onAbort, { once: true });
      let result;
      try {
        result = await run.result;
        const error = stopReasonError(result);
        if (error !== void 0) {
          throw new Error(error + "\n" + locationText(run));
        }
        return {
          kind: "foreground",
          ...details(run),
          agentsStarted: result.agentsStarted,
          result: result.value
        };
      } finally {
        exec.signal.removeEventListener("abort", onAbort);
        try {
          await run.dispose();
          if (recordsRun) {
            if (result === void 0) throw new Error("workflow run settled without a result");
            recorder.finish(run.id, result.stopReason);
          }
        } finally {
          if (recordsRun) recorder.abandon(run.id);
        }
      }
    },
    presentCall: (args) => presentWorkflowCall(args),
    presentResult: (args, result) => presentWorkflowResult(args, result)
  }));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  DESCRIPTION,
  apply,
  inject,
  name
});
return module.exports; }
