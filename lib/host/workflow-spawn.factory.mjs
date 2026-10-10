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
var import_node_crypto3 = require("node:crypto");
var import_promises2 = require("node:fs/promises");
var import_node_path2 = require("node:path");
var import_dsh_session = require("@deepseek-ai/dsh-session");

// vendor/dsh/workflow-ptc/src/worktree.ts
var import_node_child_process = require("node:child_process");
var import_promises = require("node:fs/promises");
var import_node_crypto = require("node:crypto");
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
    const id = (0, import_node_crypto.randomUUID)(), path = (0, import_node_path.join)(canonicalState, id), receiptPath = (0, import_node_path.join)(canonicalState, id + ".json");
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
      try {
        await worktree.save();
      } catch (receiptError) {
        throw new AggregateError([error, receiptError], "Worktree setup and receipt persistence failed", { cause: error });
      }
      throw new Error(`Worktree setup failed; inspect ${path}: ${String(error)}`, { cause: error });
    }
  }
  async save() {
    await (0, import_promises.writeFile)(this.receiptPath, JSON.stringify(this.artifact) + "\n", { mode: 384 });
  }
  /** Only the holder calls this, after native child disposal has completed. */
  retain(reason) {
    this.settlement ??= (async () => {
      this.artifact.retained = true;
      this.artifact.reason = reason;
      await this.save();
      return { ...this.artifact };
    })();
    return this.settlement;
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
var import_node_crypto2 = require("node:crypto");

// vendor/dsh/session-persistence-jsonl/src/lease.ts
var import_flock = require("@deepseek-ai/node-addon-system/flock");
var import_dsh_session_persistence = require("@deepseek-ai/dsh-session-persistence");

// vendor/dsh/workflow-ptc/src/journal.ts
function requestKey(value) {
  const canonical = (item) => Array.isArray(item) ? item.map(canonical) : item && typeof item === "object" ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonical(item[key])])) : item;
  return (0, import_node_crypto2.createHash)("sha256").update(JSON.stringify(canonical(value))).digest("hex");
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
  if (presets === void 0) throw new Error("Custom workflow agents require the native agent preset registry");
  const preset = await presets.resolve(id);
  if (preset.broken) throw new Error(`Workflow agent type ${id} is unavailable: ${preset.broken}`);
  return { id, fingerprint: requestKey(await presets.readDocument(id)) };
}
function apply(ctx) {
  const pending = /* @__PURE__ */ new Map();
  const activations = /* @__PURE__ */ new Set();
  const startups = /* @__PURE__ */ new Set();
  const startupCleanupErrors = [];
  const lifecycle = new AbortController();
  let providerDispose;
  let nativeProvider;
  const report = (record, artifact) => record.options.onWorktree?.({ ...artifact });
  async function prepareWorktree(record, signal) {
    const cwd = record.cwd;
    if (cwd === void 0) throw new Error("Native workflow directory was not prepared");
    const policy = record.policy;
    if (policy.mode === "read-only") throw new Error("Worktree isolation requires a writable workspace");
    const target = await ctx.fs.resolve(cwd, { signal });
    if (ctx.fs.processPathFromHostPath(cwd) === void 0) throw new Error("Worktree isolation requires a local filesystem");
    const localCwd = await (0, import_promises2.realpath)(ctx.fs.processPath(target));
    const root = await ctx.fs.resolve(policy.workspaceRoot, { signal });
    const stateTarget = await ctx.fs.resolve((0, import_node_path2.join)(localCwd, ".omd", "worktrees"), { signal });
    if (!ctx.fs.contains(target, stateTarget) || policy.mode === "workspace-write" && !ctx.fs.contains(root, stateTarget)) throw new Error("Worktree storage must stay inside the writable workspace");
    const state = ctx.fs.processPath(stateTarget);
    await (0, import_promises2.mkdir)(state, { recursive: true, mode: 448 });
    if (!inside(localCwd, await (0, import_promises2.realpath)(state))) throw new Error("Worktree storage changed outside the workspace");
    await (0, import_promises2.writeFile)((0, import_node_path2.join)(state, ".gitignore"), "*\n", { flag: "wx", mode: 384 }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    const sandbox = ctx.get("sandbox");
    record.worktree = await WorkflowWorktree.create(
      localCwd,
      state,
      policy,
      signal,
      sandbox === void 0 ? void 0 : (argv, confiningPolicy, control) => sandbox.confine(argv, confiningPolicy, control)
    );
    report(record, record.worktree.artifact);
  }
  async function configureChild(record, agent, creationSignal) {
    const signal = AbortSignal.any([record.signal, ...creationSignal === void 0 ? [] : [creationSignal]]);
    signal.throwIfAborted();
    if (ctx.subagents.getProvider("spawn") !== record.native) throw new Error("Native workflow provider changed during startup; retry the call");
    if (ctx.get("agents")?.get(record.parent.id) !== record.parent) throw new Error("Native workflow parent is no longer live");
    if (record.options.isolation === "worktree") await prepareWorktree(record, signal);
    signal.throwIfAborted();
    if (record.type?.id !== void 0) {
      const current = await workflowAgentType(ctx, record.type.id);
      if (current.fingerprint !== record.type.fingerprint) throw new Error("Workflow agent preset changed during startup; retry the call");
      await ctx.get("agentPresets").select(agent, record.type.id);
      signal.throwIfAborted();
      const selected = await workflowAgentType(ctx, record.type.id);
      if (selected.fingerprint !== record.type.fingerprint) throw new Error("Workflow agent preset changed during startup; retry the call");
    }
    if (record.worktree !== void 0) {
      const directory = agent.ctx.get("workingDirectory");
      if (directory === void 0) throw new Error("Workflow worktrees require the native working-directory service");
      await directory.set(agent, record.worktree.artifact.cwd, signal);
    }
    signal.throwIfAborted();
    if (ctx.subagents.getProvider("spawn") !== record.native) throw new Error("Native workflow provider changed during startup; retry the call");
    const hub = ctx.get("trisoulX");
    hub?.workflowBudget?.attach(agent.session, record.options.budgetOwner);
    if (hub !== void 0) {
      const state = hub.store.state(agent.id);
      state.parentSession = record.parent.id;
      if (record.worktree !== void 0) {
        const scope = hub.scope(record.parent.session);
        if (scope.mode !== "session" && scope.project !== void 0) state.workflowProject = scope.project;
      }
      hub.store.save(state);
    }
    agent.ctx.systemPrompt.context({
      name: "omd:workflow-return",
      order: agent.ctx.systemPrompt.getContextOrder("SUBAGENT_DELEGATION") + 1,
      text: "Your final text is the return value of a workflow agent() call, not a human-facing message. Return the requested data directly. When a structured-output tool is provided, use it to return the required value."
    });
  }
  function refreshProvider() {
    const native = ctx.subagents.getProvider("spawn");
    if (native === nativeProvider) return;
    providerDispose?.();
    providerDispose = void 0;
    nativeProvider = native;
    if (native?.prepareContinuable === void 0) return;
    const provider = {
      ...native,
      name: WORKFLOW_PROVIDER,
      async prepareContinuable(request) {
        const record = pending.get(request.sessionId);
        if (record !== void 0) {
          if (record.parent !== request.parent) throw new Error("Workflow child parent changed during admission");
          if (record.native !== native) throw new Error("Native workflow provider changed during startup; retry the call");
          record.cwd = request.cwd;
          const options = record.options;
          if (options.isolation !== void 0 && options.isolation !== "worktree") throw new Error("Unsupported workflow isolation");
          record.type = await workflowAgentType(ctx, options.agentType);
          if (options.presetFingerprint !== void 0 && options.presetFingerprint !== record.type.fingerprint) throw new Error("Workflow agent preset changed during startup; retry the call");
          request.signal.throwIfAborted();
        }
        const prepared = await native.prepareContinuable(request);
        if (record !== void 0) {
          request.signal.throwIfAborted();
          if (ctx.subagents.getProvider("spawn") !== record.native) throw new Error("Native workflow provider changed during startup; retry the call");
          record.creationDispose = ctx.on("agent/created", async ({ agent, signal }) => {
            if (agent.id !== request.sessionId || pending.get(agent.id) !== record) return;
            await configureChild(record, agent, signal);
          }, { global: true });
        }
        return prepared;
      },
      startWorkflow(request, options) {
        lifecycle.signal.throwIfAborted();
        const childId = (0, import_dsh_session.SessionId)((0, import_node_crypto3.randomUUID)());
        const signal = AbortSignal.any([request.signal, lifecycle.signal]);
        const captured = Object.freeze({ ...options, ...options.budgetOwner === void 0 ? {} : { budgetOwner: Object.freeze({ ...options.budgetOwner }) } });
        const record = { parent: request.parent, options: captured, signal, native, policy: ctx.sandboxPolicy.resolve({ session: request.parent.session }) };
        pending.set(childId, record);
        const operation = (async () => {
          try {
            const { signal: _signal, label, ...inputs } = request;
            const nativeActivation = await ctx.subagents.startActivation({
              provider: WORKFLOW_PROVIDER,
              childId,
              label: label ?? "Workflow child",
              request: inputs,
              signal,
              delivery: "caller"
            });
            let disposal;
            const activation = {
              childId: nativeActivation.childId,
              messageId: nativeActivation.messageId,
              result: nativeActivation.result,
              dispose() {
                disposal ??= (async () => {
                  const errors = [];
                  try {
                    await nativeActivation.dispose();
                  } catch (error) {
                    errors.push(error);
                  }
                  try {
                    if (record.worktree !== void 0) report(record, await (errors.length ? record.worktree.retain("Native child cleanup failed; checkout retained for inspection") : record.worktree.settle()));
                  } catch (error) {
                    errors.push(error);
                  } finally {
                    activations.delete(activation);
                  }
                  if (errors.length) throw new AggregateError(errors, "Workflow child cleanup failed", { cause: errors[0] });
                })();
                return disposal;
              }
            };
            activations.add(activation);
            return activation;
          } catch (error) {
            try {
              if (record.worktree !== void 0) report(record, await record.worktree.retain("Native workflow startup failed; checkout retained for inspection"));
            } catch (cleanupError) {
              const failure = new AggregateError([error, cleanupError], "Workflow startup and cleanup failed", { cause: error });
              startupCleanupErrors.push(failure);
              throw failure;
            }
            throw error;
          } finally {
            record.creationDispose?.();
            delete record.creationDispose;
            pending.delete(childId);
          }
        })();
        startups.add(operation);
        void operation.finally(() => startups.delete(operation)).catch(() => void 0);
        return operation;
      }
    };
    providerDispose = ctx.subagents.registerProvider(provider);
  }
  ctx.on("subagent/provider-added", (provider) => {
    if (provider.name === "spawn") refreshProvider();
  });
  ctx.on("subagent/provider-removed", (provider) => {
    if (provider === "spawn") refreshProvider();
  });
  ctx.effect(() => async () => {
    lifecycle.abort(new Error("OMD workflow provider disposed"));
    providerDispose?.();
    providerDispose = void 0;
    await Promise.allSettled([...startups]);
    const settled = await Promise.allSettled([...activations].map((activation) => activation.dispose()));
    const errors = [...startupCleanupErrors, ...settled.filter((row) => row.status === "rejected").map((row) => row.reason)];
    if (errors.length) throw new AggregateError(errors, "Workflow child cleanup failed");
  });
  refreshProvider();
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
