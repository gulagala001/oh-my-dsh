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

// vendor/dsh/tool-jobs/src/index.ts
var index_exports = {};
__export(index_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_schemastery = __toESM(require("@deepseek-ai/schemastery"), 1);
var import_dsh_llm = require("@deepseek-ai/dsh-llm");
var import_dsh_output_retention = require("@deepseek-ai/dsh-output-retention");
var import_dsh_tools = require("@deepseek-ai/dsh-tools");
var import_dsh_jobs = require("@deepseek-ai/dsh-jobs");

// vendor/dsh/tool-jobs/src/render.ts
function jobDetail(job) {
  return job.progress ?? job.detail;
}
function publicJob(job) {
  const detail = jobDetail(job);
  return {
    id: job.id,
    ...job.runId === void 0 ? {} : { runId: job.runId },
    kind: job.kind,
    label: job.label,
    status: job.status,
    ...detail !== void 0 ? { detail } : {},
    startedAt: job.startedAt,
    ...job.finishedAt !== void 0 ? { finishedAt: job.finishedAt } : {}
  };
}
function statusLine(snapshot) {
  return snapshot.detail !== void 0 ? `[status: ${snapshot.status}, ${snapshot.detail}]` : `[status: ${snapshot.status}]`;
}
function renderModelDelta(chunks, lossy, spillPaths) {
  const visible = chunks.filter((chunk) => chunk.channel !== "log");
  const out = visible.filter((chunk) => chunk.channel !== "stderr").map((chunk) => chunk.text).join("");
  const err = visible.filter((chunk) => chunk.channel === "stderr").map((chunk) => chunk.text).join("");
  const separator = out.length > 0 && !out.endsWith("\n") ? "\n" : "";
  const body = out + (err.length > 0 ? `${separator}[stderr]
${err}` : "");
  if (!lossy && !visible.some((chunk) => chunk.gapBefore === true)) return body;
  const notice = `[some output was dropped from memory; full output: ${spillPaths.length > 0 ? spillPaths.join(", ") : "(unavailable)"}]`;
  return `${body}${body.length > 0 && !body.endsWith("\n") ? "\n" : ""}${notice}`;
}

// vendor/dsh/tool-jobs/src/index.ts
var name = "tool-jobs";
var inject = ["tools", "jobs", "systemPrompt"];
var Config = import_schemastery.default.object({
  waitTimeoutMs: import_schemastery.default.number().min(1).default(3e4),
  maxWaitTimeoutMs: import_schemastery.default.number().min(1).default(6e5),
  completionDelivery: import_schemastery.default.union(["quiet", "wakeup"]).default("wakeup"),
  maxConsecutiveWakes: import_schemastery.default.number().min(1)
});
var PUBLIC_JOB_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    runId: { type: "string" },
    id: { type: "string", required: true },
    kind: { type: "string", required: true },
    label: { type: "string", required: true },
    status: {
      type: "string",
      required: true,
      enum: ["running", "stopping", "completed", "killed", "failed"]
    },
    detail: { type: "string" },
    startedAt: { type: "integer", required: true },
    finishedAt: { type: "integer" }
  }
};
var encoder = new TextEncoder();
function retainTail(text, maxBytes) {
  const retainer = new import_dsh_output_retention.TextRetainer({ kind: "tail", maxBytes });
  retainer.push(text);
  return retainer.finish().text;
}
function retainHead(text, maxBytes) {
  const retainer = new import_dsh_output_retention.TextRetainer({ kind: "head", maxBytes });
  retainer.push(text);
  return retainer.finish().text;
}
function fitWithSuffix(content, suffix, maxBytes, omitted) {
  const complete = `${content}${suffix}`;
  if (maxBytes === void 0 || encoder.encode(complete).byteLength <= maxBytes) return complete;
  const fixed = `${content.endsWith(omitted.trimStart()) ? "" : omitted}${suffix}`;
  const fixedBytes = encoder.encode(fixed).byteLength;
  if (fixedBytes >= maxBytes) return retainTail(fixed, maxBytes);
  return `${retainTail(content, maxBytes - fixedBytes)}${fixed}`;
}
function completionSummary(job) {
  return (0, import_dsh_llm.boundContextSummary)(`${job.kind} ${job.label} ${statusLine(publicJob(job))}`);
}
function fitCompletionNotice(job) {
  const prefix = `background job ${job.id}`;
  const detail = ` (${job.kind}: ${job.label}) finished ${statusLine(publicJob(job))}`;
  const action = "\nDone; job_output.";
  const complete = `${prefix}${detail}. Read its output with job_output.`;
  const maxBytes = job.outputLimitBytes;
  if (maxBytes === void 0 || encoder.encode(complete).byteLength <= maxBytes) return complete;
  const omitted = "\n[notice truncated]";
  const fixed = `${prefix}${omitted}${action}`;
  const fixedBytes = encoder.encode(fixed).byteLength;
  if (fixedBytes <= maxBytes) {
    return fixedBytes === maxBytes ? fixed : `${prefix}${retainHead(detail, maxBytes - fixedBytes)}${omitted}${action}`;
  }
  const compact = `${prefix}${action}`;
  const compactBytes = encoder.encode(compact).byteLength;
  if (compactBytes <= maxBytes) return compact;
  const actionBytes = encoder.encode(action).byteLength;
  if (actionBytes >= maxBytes) return retainTail(action, maxBytes);
  return `${retainHead(prefix, maxBytes - actionBytes)}${action}`;
}
function rawSingleText(content) {
  if (content.length !== 1) return void 0;
  const block = content[0];
  if (block?.type !== "text") return void 0;
  return block.text;
}
function boundSingleText(content, maxBytes) {
  const text = rawSingleText(content);
  if (text === void 0) return void 0;
  return [{
    type: "text",
    text: fitWithSuffix(text, "", maxBytes, "\n[result truncated]")
  }];
}
function visibleOutputLimit(ctx, exec) {
  if (exec.name !== "job_output" && exec.name !== "job_kill") return void 0;
  const jobId = exec.arguments?.job_id;
  if (typeof jobId !== "string" || jobId.length === 0) return void 0;
  return ctx.jobs.list(exec.agent?.id).find((job) => job.id === jobId)?.outputLimitBytes;
}
function validateJobId(value) {
  if (value.length === 0) {
    throw new Error(`invalid job_id: expected a non-empty string, got ${JSON.stringify(value)}`);
  }
  return (0, import_dsh_jobs.JobId)(value);
}
function presentJobCall(title, kind, rawInput) {
  return { card: "generic", title, kind, ...rawInput !== void 0 ? { rawInput } : {} };
}
function readBody(read) {
  const delta = renderModelDelta(read.chunks, read.lossy, read.job.output.spillPaths ?? []);
  const text = read.result === void 0 ? delta : `${delta}${delta.length > 0 && !delta.endsWith("\n") ? "\n" : ""}${read.result}`;
  return { text, job: publicJob(read.job) };
}
async function waitForEvent(ctx, exec, id, timeout) {
  const owner = exec.agent;
  const terminal = () => !["running", "stopping"].includes(ctx.jobs.get(id, owner?.id).status);
  if (terminal()) return "completed";
  exec.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = [];
    let finished = false;
    const finish = (reason) => {
      if (finished) return;
      finished = true;
      cleanup.forEach((dispose) => dispose());
      clearTimeout(timer);
      resolve(reason);
    };
    const abort = () => {
      if (finished) return;
      finished = true;
      cleanup.forEach((dispose) => dispose());
      clearTimeout(timer);
      reject(exec.signal.reason ?? new Error("wait aborted"));
    };
    cleanup.push(ctx.jobs.events.subscribe(owner ? { owner: owner.id } : { owners: "scope" }, (event) => {
      if (event.type === "settled") finish(event.job.id === id ? "completed" : "other_completion");
    }));
    cleanup.push(ctx.on("agent/inbox/inserted", ({ agent, message }) => {
      if (agent === owner && message.source.kind === "user" && agent.inbox.nextStep.some((m) => m.id === message.id)) finish("user_input");
    }));
    exec.signal.addEventListener("abort", abort, { once: true });
    cleanup.push(() => exec.signal.removeEventListener("abort", abort));
    if (timeout !== void 0) timer = setTimeout(() => finish("timeout"), timeout);
    if (exec.signal.aborted) abort();
    else if (terminal()) finish("completed");
    else if (owner?.inbox.nextStep.some((m) => m.source.kind === "user")) finish("user_input");
  });
}
function apply(ctx, config) {
  const waitDefault = config.waitTimeoutMs ?? 3e4;
  const waitCap = config.maxWaitTimeoutMs ?? 6e5;
  const delivery = config.completionDelivery ?? "wakeup";
  const wakeBudget = config.maxConsecutiveWakes;
  const spentWakes = /* @__PURE__ */ new WeakMap();
  if (waitDefault > waitCap) {
    throw new Error(`tool-jobs: waitTimeoutMs (${waitDefault}) exceeds maxWaitTimeoutMs (${waitCap})`);
  }
  if (wakeBudget !== void 0 && !Number.isSafeInteger(wakeBudget)) {
    throw new Error(`tool-jobs: maxConsecutiveWakes (${wakeBudget}) must be a whole number of turns`);
  }
  if (delivery === "wakeup" && wakeBudget !== void 0) {
    ctx.on("agent/inbox/claimed", ({ agent, message }) => {
      if (message.source.kind === "user") spentWakes.delete(agent);
    });
  }
  ctx.on("agent/pre-step", async ({ agent }, next) => {
    const decision = await next();
    const cap = ctx.jobs.ownerOptions(agent).completionBatchBytes;
    if (!cap || decision.kind !== "enter") return decision;
    let bytes = 0;
    const messages = decision.messages.filter((message) => {
      if (!message.jobReceipt) return true;
      const size = encoder.encode(message.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")).length;
      if (bytes && bytes + size > cap) {
        agent.inject(message);
        return false;
      }
      bytes += size;
      return true;
    });
    return { ...decision, messages };
  });
  const admittedThrough = /* @__PURE__ */ new WeakMap();
  ctx.on("agent/assistant-stream", ({ agent, frame }) => {
    if (frame.type !== "start") return;
    const events = agent.session.snapshotEvents(), after = admittedThrough.get(agent) ?? -1;
    const current = new Map(ctx.jobs.list(agent.id).map((job) => [job.id, job]));
    for (const event of events) {
      if (event.seq <= after) continue;
      const receipt = event.type === "user/message" ? event.data.jobReceipt : event.type === "tool/result" ? event.data.meta?.jobReceipt : void 0;
      if (!receipt) continue;
      const job = current.get(receipt.id);
      if (job?.runId === receipt.runId) ctx.jobs.markDelivered(job.id, receipt.delivery, agent.id);
    }
    admittedThrough.set(agent, events.at(-1)?.seq ?? -1);
  });
  const outputLimits = /* @__PURE__ */ new WeakMap();
  ctx.on("tools/pre-execute", (exec, next) => {
    const maxBytes = visibleOutputLimit(ctx, exec);
    if (maxBytes !== void 0) outputLimits.set(exec, maxBytes);
    return next();
  }, { prepend: true });
  const finalizeJobContent = (exec, result) => {
    const maxBytes = outputLimits.get(exec) ?? visibleOutputLimit(ctx, exec);
    outputLimits.delete(exec);
    if (maxBytes === void 0) return void 0;
    if (exec.name === "job_output" && !result.isError) {
      const value = result.value;
      const body = value.text.length > 0 ? value.text : "(no new output)";
      const content = body.endsWith("\n") ? body.slice(0, -1) : body;
      const suffix = `
${statusLine(value.job)}`;
      if (rawSingleText(result.content) === `${content}${suffix}`) {
        return [{
          type: "text",
          text: fitWithSuffix(content, suffix, maxBytes, "\n[output truncated]")
        }];
      }
    }
    return boundSingleText(result.content, maxBytes);
  };
  ctx.jobs.attachController("tool-jobs");
  ctx.systemPrompt.section({
    name: "tool:jobs",
    order: ctx.systemPrompt.getSectionOrder("TOOL_JOBS"),
    text: "Track every background job id you start. You are notified in-session when a job finishes \u2014 do not busy-poll or sleep on one; keep working on independent steps and do not duplicate a running job's work. Before giving a final answer, collect every still-relevant job with job_output (set wait: true only when you are genuinely blocked on it), and job_kill jobs that stopped mattering."
  });
  const killedByModel = /* @__PURE__ */ new Set();
  ctx.jobs.events.subscribe({ owners: "scope" }, (event) => {
    if (event.type === "removed") {
      killedByModel.delete(event.job.id);
      return;
    }
    if (event.type !== "settled") return;
    const delivered = killedByModel.delete(event.job.id) || event.awaited;
    if (delivered || event.cause === "teardown" || event.job.owner === void 0) return;
    const owner = ctx.get("agents")?.get(event.job.owner);
    if (owner === void 0) return;
    const snapshot = event.job;
    const options = ctx.jobs.ownerOptions(owner);
    const runId = snapshot.runId ?? snapshot.id;
    let text = fitCompletionNotice(snapshot);
    let supplied = "notice";
    if (options.completionPreviewBytes) {
      const maxBytes = Math.min(options.completionPreviewBytes, snapshot.outputLimitBytes ?? Infinity);
      const locator = `background job ${snapshot.id} ${statusLine(publicJob(snapshot))}
Read job_output({"job_id":${JSON.stringify(snapshot.id)}}) for remaining output.`;
      const prefix = `${locator}
[Retained output preview; may be truncated]
`;
      const room = maxBytes - encoder.encode(prefix).length;
      if (room > 0) {
        const preview = ctx.jobs.peekOutput(snapshot.id, room, owner.id);
        text = preview.available ? prefix + preview.text : locator;
        if (preview.available) supplied = !preview.truncated && !/truncat|spill|saved to/i.test(preview.text) ? "full" : "preview";
      } else {
        text = retainHead(fitCompletionNotice(snapshot), maxBytes);
      }
    }
    const message = (0, import_dsh_llm.createUserMessage)({
      content: [{ type: "text", text }],
      source: { kind: "tool-jobs", form: "notice", summary: completionSummary(snapshot) },
      ...options.completionPreviewBytes ? { jobReceipt: { id: snapshot.id, runId, delivery: supplied } } : {}
    });
    if (delivery === "wakeup" && owner.status === "idle") {
      if (wakeBudget === void 0) {
        owner.followup(message);
        return;
      }
      const spent = spentWakes.get(owner) ?? 0;
      if (spent < wakeBudget) {
        spentWakes.set(owner, spent + 1);
        owner.followup(message);
        return;
      }
    }
    owner.inject(message);
  });
  ctx.tools.register((0, import_dsh_tools.defineTool)({
    name: "job_output",
    description: "Read a background job. Stream jobs return only output since the previous read; final-output jobs return their result after settlement. Every response ends with `[status: ...]`. Reads are non-blocking unless `wait: true`, which waits up to the configured cap.",
    // A timed-out wait returns job state rather than a TOOL_TIMEOUT error, so
    // this tool owns its deadline instead of using ToolDefinition.timeoutMs.
    parameters: {
      job_id: { type: "string", required: true, description: "Job id returned by the tool that started the background work." },
      wait: { type: "boolean", description: "Block until the job reaches a terminal status or the timeout expires. A timed-out wait returns [status: running] and leaves the job alive." },
      timeout_ms: { type: "number", description: "Max wait in milliseconds (only meaningful with wait: true). For enabled top-level event waits, omission waits for completion or an actionable event. Other waits use the configured finite timeout; explicit values are capped." }
    },
    finalizeContent: finalizeJobContent,
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", required: true },
          job: { ...PUBLIC_JOB_SCHEMA, required: true },
          wakeReason: { type: "string", enum: ["completed", "user_input", "other_completion", "timeout"] }
        }
      },
      presentationMeta: (_args, value) => value.job.runId ? { jobReceipt: { id: value.job.id, runId: value.job.runId, delivery: value.text ? "preview" : "notice" } } : {},
      render: (_args, value) => {
        const body = value.text.length > 0 ? value.text : "(no new output)";
        const separator = body.endsWith("\n") ? "" : "\n";
        return [{ type: "text", text: `${body}${separator}${statusLine(value.job)}${value.wakeReason ? `
[wakeReason: ${value.wakeReason}]` : ""}` }];
      }
    },
    async execute(args, exec) {
      const id = validateJobId(args.job_id);
      let wakeReason;
      if (args.timeout_ms !== void 0 && (!Number.isFinite(args.timeout_ms) || args.timeout_ms <= 0)) throw new Error("timeout_ms must be positive");
      if (args.wait === true) {
        if (!exec.parent && ctx.jobs.ownerOptions(exec.agent).interruptibleWait) {
          wakeReason = await waitForEvent(ctx, exec, id, args.timeout_ms === void 0 ? void 0 : Math.min(args.timeout_ms, waitCap));
          if (wakeReason !== "completed") return { text: "", job: publicJob(ctx.jobs.get(id, exec.agent?.id)), wakeReason };
        } else {
          const timeout = Math.min(args.timeout_ms ?? waitDefault, waitCap);
          await ctx.jobs.wait(id, timeout, exec.agent?.id, exec.signal);
        }
      }
      const read = ctx.jobs.read(id, exec.agent?.id);
      return { ...readBody(read), ...wakeReason ? { wakeReason } : {} };
    },
    presentCall: (args) => presentJobCall(`Read output from background job ${args.job_id}`, "read", args.job_id)
  }));
  ctx.tools.register((0, import_dsh_tools.defineTool)({
    name: "job_list",
    description: "List your background jobs (running and finished) with their ids, kinds, and statuses.",
    parameters: {},
    output: {
      schema: { type: "array", items: PUBLIC_JOB_SCHEMA },
      render: (_args, jobs) => [{
        type: "text",
        text: jobs.length === 0 ? "(no background jobs)" : jobs.map((t) => `${t.id} [${t.kind}] ${t.status} \u2014 ${t.label}`).join("\n")
      }]
    },
    execute(_args, exec) {
      const jobs = ctx.jobs.list(exec.agent?.id);
      return Promise.resolve(jobs.map(publicJob));
    },
    presentCall: () => presentJobCall("List background jobs", "read")
  }));
  ctx.tools.register((0, import_dsh_tools.defineTool)({
    name: "job_kill",
    description: "Request cancellation of a running background job by job id. Returns immediately; the job settles as killed once its work actually stops.",
    parameters: {
      job_id: { type: "string", required: true, description: "Job id returned by the tool that started the background work." },
      reason: { type: "string", description: "Optional short reason, recorded in the log and forwarded to the job." }
    },
    finalizeContent: finalizeJobContent,
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          outcome: {
            type: "string",
            required: true,
            enum: ["cancellation-requested", "already-finished"]
          },
          job: { ...PUBLIC_JOB_SCHEMA, required: true }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: value.outcome === "already-finished" ? `job ${value.job.id} had already finished ${statusLine(value.job)}` : `requested cancellation of job ${value.job.id}`
      }]
    },
    execute(args, exec) {
      const id = validateJobId(args.job_id);
      const jobs = ctx.jobs;
      const result = jobs.kill(id, exec.agent?.id, args.reason);
      if (result === "requested") killedByModel.add(id);
      const job = publicJob(jobs.get(id, exec.agent?.id));
      return Promise.resolve({
        outcome: result === "already-finished" ? "already-finished" : "cancellation-requested",
        job
      });
    },
    presentCall: (args) => presentJobCall(`Kill background job ${args.job_id}`, "execute", args.job_id)
  }));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  inject,
  name
});
return module.exports; }
