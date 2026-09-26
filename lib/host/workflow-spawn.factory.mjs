export function createModule(require) { const module = { exports: {} }; const exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// vendor/dsh/workflow-ptc/src/spawn.ts
var spawn_exports = {};
__export(spawn_exports, {
  WORKFLOW_PROVIDER: () => WORKFLOW_PROVIDER,
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  workflowAgentType: () => workflowAgentType
});
module.exports = __toCommonJS(spawn_exports);
var import_promises2 = require("node:fs/promises");
var import_node_path2 = require("node:path");

// vendor/dsh/subagent-in-process-driver/src/index.ts
var import_node_crypto = require("node:crypto");
var import_dsh_brand = require("@deepseek-ai/dsh-brand");
var import_dsh_agent = require("@deepseek-ai/dsh-agent");
var import_dsh_session = require("@deepseek-ai/dsh-session");
var import_dsh_llm = require("@deepseek-ai/dsh-llm");
var import_dsh_subagent = require("@deepseek-ai/dsh-subagent");

// vendor/dsh/subagent-in-process-driver/src/structured.ts
var import_dsh_tools = require("@deepseek-ai/dsh-tools");
var STRUCTURED_OUTPUT_TOOL = "structured_output";
var STRUCTURED_OUTPUT_INSTRUCTION = `When you have your final answer, you MUST report it by calling the \`${STRUCTURED_OUTPUT_TOOL}\` tool with arguments matching its parameter schema exactly. Do not finish with a plain text answer: only the tool call counts as your result.`;
function attachStructuredRuntime(childCtx, schema) {
  const staged = /* @__PURE__ */ new WeakMap();
  let pending;
  let captured;
  const schemaEntry = {
    name: STRUCTURED_OUTPUT_TOOL,
    description: "Report your final structured result. Call this exactly once, when your answer is complete; the arguments must match this tool's parameter schema exactly.",
    // ToolSchema.parameters is the wire-level JSON Schema object; the
    // asserted subset type is structurally exactly that.
    parameters: schema
  };
  childCtx.tools.register({
    ...schemaEntry,
    output: {
      schema: {
        type: "object",
        properties: { recorded: { type: "boolean", const: true } },
        required: ["recorded"],
        additionalProperties: false
      },
      render: () => [{ type: "text", text: "Structured output recorded." }]
    },
    execute(args, exec) {
      const violations = (0, import_dsh_tools.validateJsonSchemaValue)(schema, args);
      if (violations.length > 0) throw new import_dsh_tools.ToolArgsError(violations);
      staged.set(exec, { value: args });
      exec.concludeTurn();
      return Promise.resolve({ recorded: true });
    }
  });
  childCtx.systemPrompt.section({
    name: `tool:${STRUCTURED_OUTPUT_TOOL}`,
    order: childCtx.systemPrompt.getSectionOrder("STRUCTURED_OUTPUT"),
    text: STRUCTURED_OUTPUT_INSTRUCTION
  });
  childCtx.tools.guard((exec) => captured === void 0 && pending === void 0 ? void 0 : `structured output already recorded: the run is complete, so \`${exec.name}\` is not executed`);
  childCtx.on("tools/result", function(exec, result) {
    if (exec.name === STRUCTURED_OUTPUT_TOOL) {
      const entry2 = staged.get(exec);
      if (entry2 === void 0) return;
      staged.delete(exec);
      if (result.isError) return;
      if (exec.parent === void 0) {
        if (captured === void 0) captured = { value: entry2.value };
      } else {
        if (captured === void 0 && pending === void 0) {
          pending = { parent: exec.parent, value: entry2.value };
        }
      }
      return;
    }
    if (pending?.parent !== exec.token) return;
    const entry = pending;
    pending = void 0;
    if (result.isError) return;
    if (captured === void 0) captured = { value: entry.value };
  });
  return { captured: () => captured };
}

// vendor/dsh/subagent-in-process-driver/src/index.ts
function toStopReason(reason) {
  switch (reason?.kind) {
    case "completed":
      return "completed";
    case "max-tokens":
      return "max-tokens";
    case "aborted":
      return "aborted";
    // A pre-step rejection discarded the claimed prompt: the task was
    // declined, and the caller must not read the run as done.
    case "blocked":
      return "refusal";
    case "error":
    case "interrupted":
    default:
      return "error";
  }
}
function prePublicationAbort() {
  return new Error("subagent request was aborted before child publication");
}
function attachDescriptorAppend(childCtx, descriptor) {
  let appended = false;
  childCtx.on("agent/pre-step", async ({ agent }, next) => {
    const decision = await next();
    if (!appended && decision.kind === "enter") {
      appended = true;
      agent.session.append("subagent/descriptor", descriptor);
    }
    return decision;
  });
}
async function startInProcessRun(request, options) {
  (0, import_dsh_subagent.assertSubagentMaxDepth)(request.maxDepth);
  if (request.signal.aborted) throw prePublicationAbort();
  const parent = request.parent;
  const childDepth = (0, import_dsh_subagent.resolveChildDepth)(parent, request.maxDepth);
  const childId = (0, import_dsh_brand.brandString)((0, import_node_crypto.randomUUID)());
  const seed = options.seed;
  const activationBoundary = (0, import_dsh_session.SessionLogOffset)(seed?.length ?? 0);
  const inherited = options.delegatedPolicy ?? (0, import_dsh_subagent.captureDelegatedPolicyOverrides)(parent);
  let structured;
  const setup = async (childCtx, child) => {
    options.setupChild?.(child);
    (0, import_dsh_subagent.appendDelegatedPolicyOverrides)(child.session, inherited);
    (0, import_dsh_subagent.applyChildComposition)(childCtx, parent, {
      persona: request.persona,
      toolFilter: request.toolFilter
    });
    if (options.agentPreset !== void 0) {
      const presets = childCtx.get("agentPresets");
      if (presets === void 0) throw new Error("Custom workflow agents require the native preset registry");
      await presets.recompose(childCtx, options.agentPreset);
    }
    if (request.outputSchema !== void 0) {
      structured = attachStructuredRuntime(childCtx, request.outputSchema);
    }
    attachDescriptorAppend(childCtx, request.descriptor);
  };
  const handle = await parent.ctx.agents.create({
    sessionId: childId,
    parentAgent: parent,
    meta: {
      ...(0, import_dsh_subagent.childSessionMeta)(parent, childDepth, seed !== void 0),
      ...options.cwd === void 0 ? {} : { cwd: options.cwd },
      ...options.agentPreset === void 0 ? {} : { agentPreset: options.agentPreset }
    },
    ...seed !== void 0 ? { seed } : {},
    ...seed === void 0 ? {} : { inheritedEventCount: activationBoundary },
    agentOptions: (0, import_dsh_subagent.resolveChildAgentOptions)(parent, request.agentOptions, childDepth),
    signal: request.signal,
    setup
  });
  return drivePublishedRun(
    handle,
    request.signal,
    request.prompt,
    childId,
    activationBoundary,
    structured
  );
}
function drivePublishedRun(handle, signal, prompt, childId, boundary, structured) {
  const child = handle.agent;
  const flags = { cancelled: false };
  const onAbort = () => {
    flags.cancelled = true;
    child.cancel({ kind: "parent" });
  };
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) onAbort();
  const result = (async () => {
    try {
      if (!flags.cancelled) {
        child.followup((0, import_dsh_llm.createUserMessage)({ content: prompt, source: { kind: "user" } }));
        await child.whenIdle();
      }
      return readResult(
        child,
        boundary,
        flags.cancelled,
        structured ? { captured: structured.captured() } : void 0
      );
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  })();
  return {
    id: childId,
    localAgent: child,
    result,
    async dispose() {
      signal.removeEventListener("abort", onAbort);
      flags.cancelled = true;
      const settlements = await Promise.allSettled([handle.dispose(), result]);
      const disposal = settlements[0];
      if (disposal.status === "rejected") throw disposal.reason;
    }
  };
}
function readResult(child, boundary, cancelled, structured) {
  const own = child.session.snapshotEvents(boundary);
  const lastEnd = (0, import_dsh_agent.foldConsumedWork)(own).end;
  const output = (0, import_dsh_subagent.finalAssistantOutput)(own) ?? [];
  const recorded = toStopReason(lastEnd?.data.reason);
  const stopReason = cancelled && recorded !== "completed" ? "aborted" : recorded;
  if (structured !== void 0) {
    if (structured.captured !== void 0) {
      return { output, structured: structured.captured.value, stopReason };
    }
    if (stopReason === "completed") return { output, stopReason: cancelled ? "aborted" : "error" };
  }
  return { output, stopReason };
}

// vendor/dsh/workflow-ptc/src/spawn.ts
var import_dsh_subagent2 = require("@deepseek-ai/dsh-subagent");

// vendor/dsh/workflow-ptc/src/worktree.ts
var import_node_child_process = require("node:child_process");
var import_promises = require("node:fs/promises");
var import_node_crypto2 = require("node:crypto");
var import_node_path = require("node:path");
async function git(cwd, args, policy, confine, overrides, signal) {
  const original = ["git", "-c", "core.hooksPath=", "-c", "core.fsmonitor=false", ...overrides, ...args];
  if (policy.mode !== "danger-full-access" && !confine) throw new Error("Worktree operations require the native sandbox provider in confined mode");
  const argv = policy.mode === "danger-full-access" ? original : (await confine(original, { ...policy, mode: policy.mode }, signal)).argv;
  signal?.throwIfAborted();
  return new Promise((accept, reject) => {
    (0, import_node_child_process.execFile)(argv[0], argv.slice(1), {
      cwd,
      signal,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 12e4,
      windowsHide: true,
      // Inherited GIT_DIR/INDEX_FILE/config injections must not redirect an
      // operation away from the caller's validated checkout.
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_"))), GIT_TERMINAL_PROMPT: "0" }
    }, (error, stdout, stderr) => error ? reject(new Error(`git ${args[0]} failed: ${stderr.trim() || error.message}`, { cause: error })) : accept(stdout.replace(/\r?\n$/, "")));
  });
}
var WorkflowWorktree = class _WorkflowWorktree {
  constructor(artifact, receiptPath, git2) {
    this.artifact = artifact;
    this.receiptPath = receiptPath;
    this.git = git2;
  }
  settlement;
  static async create(cwd, stateDirectory, policy, signal, confine) {
    signal?.throwIfAborted();
    if (policy.mode === "read-only") throw new Error("Worktree isolation requires a writable workspace");
    const overrides = [];
    const runGit = (cwd2, args, signal2) => git(cwd2, args, policy, confine, overrides, signal2);
    const repository = await (0, import_promises.realpath)(await runGit(cwd, ["rev-parse", "--show-toplevel"], signal));
    let filterKeys = "";
    try {
      filterKeys = await runGit(cwd, ["config", "--null", "--name-only", "--get-regexp", "^filter\\..*\\.(smudge|process|required)$"], signal);
    } catch (error) {
      if (error.cause?.code !== 1) throw error;
    }
    for (const key of filterKeys.split("\0").filter(Boolean)) overrides.push("-c", key + (key.endsWith(".required") ? "=false" : "="));
    const sourceCwd = await (0, import_promises.realpath)(cwd);
    const subdirectory = (0, import_node_path.relative)(repository, sourceCwd);
    if (subdirectory === ".." || subdirectory.startsWith(".." + import_node_path.sep) || (0, import_node_path.isAbsolute)(subdirectory) || (0, import_node_path.resolve)(repository, subdirectory) !== sourceCwd) throw new Error("Workflow cwd is not inside the repository");
    const base = await runGit(repository, ["rev-parse", "--verify", "HEAD^{commit}"], signal);
    await (0, import_promises.mkdir)(stateDirectory, { recursive: true, mode: 448 });
    const canonicalState = await (0, import_promises.realpath)(stateDirectory);
    const id = (0, import_node_crypto2.randomUUID)(), path = (0, import_node_path.join)(canonicalState, id), receiptPath = (0, import_node_path.join)(canonicalState, id + ".json");
    const artifact = { path, cwd: (0, import_node_path.join)(path, subdirectory), repository, base, retained: true, reason: "starting" };
    await (0, import_promises.writeFile)(receiptPath, JSON.stringify(artifact) + "\n", { flag: "wx", mode: 384 });
    const worktree = new _WorkflowWorktree(artifact, receiptPath, runGit);
    try {
      await runGit(repository, ["worktree", "add", "--detach", "--", path, base], signal);
      signal?.throwIfAborted();
      artifact.reason = "running";
      await worktree.save();
      return worktree;
    } catch (error) {
      artifact.reason = `setup failed: ${String(error)}`;
      await worktree.save();
      throw new Error(`Worktree setup failed; inspect ${path}: ${String(error)}`, { cause: error });
    }
  }
  async save() {
    await (0, import_promises.writeFile)(this.receiptPath, JSON.stringify(this.artifact) + "\n", { mode: 384 });
  }
  /** Only the holder calls this, after native child disposal has completed. */
  settle() {
    this.settlement ??= (async () => {
      try {
        const head = await this.git(this.artifact.path, ["rev-parse", "--verify", "HEAD^{commit}"]);
        this.artifact.head = head;
        const status = await this.git(this.artifact.path, ["status", "--porcelain=v1", "--untracked-files=all", "--ignored", "--ignore-submodules=none"]);
        if (head !== this.artifact.base) this.artifact.reason = "contains new commits";
        else if (status) this.artifact.reason = "contains changed, untracked, or ignored files";
        else {
          await this.git(this.artifact.repository, ["worktree", "remove", "--", this.artifact.path]);
          this.artifact.retained = false;
          this.artifact.reason = "unchanged";
        }
      } catch (error) {
        this.artifact.reason = `cleanup could not prove the checkout unchanged: ${String(error)}`;
      }
      await this.save();
      return { ...this.artifact };
    })();
    return this.settlement;
  }
};

// vendor/dsh/workflow-ptc/src/journal.ts
var import_node_crypto3 = require("node:crypto");

// vendor/dsh/session-persistence-jsonl/src/lease.ts
var import_flock = require("@deepseek-ai/node-addon-system/flock");
var import_dsh_session_persistence = require("@deepseek-ai/dsh-session-persistence");

// vendor/dsh/workflow-ptc/src/journal.ts
function requestKey(value) {
  const canonical = (item) => Array.isArray(item) ? item.map(canonical) : item && typeof item === "object" ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonical(item[key])])) : item;
  return (0, import_node_crypto3.createHash)("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

// vendor/dsh/workflow-ptc/src/spawn.ts
var name = "omd-workflow-spawn";
var inject = ["subagents", "sandboxPolicy", "fs"];
var WORKFLOW_PROVIDER = "omd-workflow";
function inside(root, candidate) {
  const rel = (0, import_node_path2.relative)(root, candidate);
  return rel !== ".." && !rel.startsWith(".." + import_node_path2.sep) && !(0, import_node_path2.isAbsolute)(rel);
}
async function workflowAgentType(ctx, id) {
  if (id === void 0 || id === "general-purpose") return {};
  const presets = ctx.get("agentPresets");
  if (!presets) throw new Error("Custom workflow agents require the native agent preset registry");
  const preset = await presets.resolve(id);
  if (preset.broken) throw new Error(`Workflow agent type ${id} is unavailable: ${preset.broken}`);
  return { id, fingerprint: requestKey(await presets.readDocument(id)) };
}
async function start(ctx, request) {
  const options = request.workflow ?? {};
  if (options.isolation !== void 0 && options.isolation !== "worktree") throw new Error("Unsupported workflow isolation");
  const inherited = (0, import_dsh_subagent2.captureDelegatedPolicyOverrides)(request.parent);
  const policy = ctx.sandboxPolicy.resolve({ session: request.parent.session });
  const type = await workflowAgentType(ctx, options.agentType);
  if (options.presetFingerprint !== void 0 && options.presetFingerprint !== type.fingerprint) throw new Error("Workflow agent preset changed during startup; retry the call");
  request.signal.throwIfAborted();
  let worktree;
  const report = (artifact) => {
    options.onWorktree?.({ ...artifact });
  };
  try {
    if (options.isolation === "worktree") {
      if (policy.mode === "read-only") throw new Error("Worktree isolation requires a writable workspace");
      const fs = ctx.fs;
      const cwd = request.parent.session.header.cwd ?? policy.workspaceRoot;
      const target = await fs.resolve(cwd, { signal: request.signal });
      if (fs.processPathFromHostPath(cwd) === void 0) throw new Error("Worktree isolation requires a local filesystem");
      const localCwd = await (0, import_promises2.realpath)(fs.processPath(target));
      const root = await fs.resolve(policy.workspaceRoot, { signal: request.signal });
      const stateTarget = await fs.resolve((0, import_node_path2.join)(localCwd, ".omd", "worktrees"), { signal: request.signal });
      if (!fs.contains(target, stateTarget) || policy.mode === "workspace-write" && !fs.contains(root, stateTarget)) throw new Error("Worktree storage must stay inside the writable workspace");
      const state = fs.processPath(stateTarget);
      await (0, import_promises2.mkdir)(state, { recursive: true, mode: 448 });
      if (!inside(localCwd, await (0, import_promises2.realpath)(state))) throw new Error("Worktree storage changed outside the workspace");
      await (0, import_promises2.writeFile)((0, import_node_path2.join)(state, ".gitignore"), "*\n", { flag: "wx", mode: 384 }).catch((error) => {
        if (error.code !== "EEXIST") throw error;
      });
      const sandbox = ctx.get("sandbox");
      worktree = await WorkflowWorktree.create(
        localCwd,
        state,
        policy,
        request.signal,
        sandbox ? (argv, policy2, signal) => sandbox.confine(argv, policy2, signal) : void 0
      );
      report(worktree.artifact);
    }
    const hub = ctx.get("trisoulX");
    const budget = hub?.workflowBudget;
    const run = await startInProcessRun(request, {
      cwd: worktree?.artifact.cwd,
      agentPreset: type.id,
      delegatedPolicy: inherited,
      setupChild: (child) => {
        budget?.attach(child.session, options.budgetOwner);
        if (hub) {
          const state = hub.store.state(child.session.id);
          state.parentSession = request.parent.session.id;
          if (worktree) {
            const scope = hub.scope(request.parent.session);
            if (scope.mode !== "session") state.workflowProject = scope.project;
          }
          hub.store.save(state);
        }
        child.ctx.systemPrompt.context({
          name: "omd:workflow-return",
          order: child.ctx.systemPrompt.getContextOrder("SUBAGENT_DELEGATION") + 1,
          text: "Your final text is the return value of a workflow agent() call, not a human-facing message. Return the requested data directly. When a structured-output tool is provided, use it to return the required value."
        });
      }
    });
    let disposal;
    return {
      id: run.id,
      localAgent: run.localAgent,
      result: run.result,
      dispose() {
        disposal ??= (async () => {
          await run.dispose();
          if (worktree) report(await worktree.settle());
        })();
        return disposal;
      }
    };
  } catch (error) {
    if (worktree) report(await worktree.settle());
    throw error;
  }
}
function apply(ctx) {
  ctx.subagents.registerProvider({
    name: WORKFLOW_PROVIDER,
    capabilities: { agentOptions: true, outputSchema: true, depthLimit: true, toolFilter: true, persona: true },
    inheritsParentContext: false,
    start: (request) => start(ctx, request)
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WORKFLOW_PROVIDER,
  apply,
  inject,
  name,
  workflowAgentType
});
return module.exports; }
