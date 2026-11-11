export function createModule(require) { const module={exports:{}}; const exports=module.exports;
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

// ../../source-sdk/packages/core/tool-executor-ptc/lib/reviewed-ptc-executor.js
var reviewed_ptc_executor_exports = {};
__export(reviewed_ptc_executor_exports, {
  CodeResetFailedError: () => CodeResetFailedError,
  CodeRunFailedError: () => CodeRunFailedError,
  Config: () => Config,
  PtcExecutor: () => PtcExecutor,
  apply: () => apply,
  inject: () => inject,
  jsonSchemaToPy: () => jsonSchemaToPy,
  jsonSchemaToTs: () => jsonSchemaToTs,
  name: () => name,
  renderToolsSdk: () => renderToolsSdk,
  renderToolsSdkPy: () => renderToolsSdkPy
});
module.exports = __toCommonJS(reviewed_ptc_executor_exports);
var import_dsh_llm = require("@deepseek-ai/dsh-llm");
var import_dsh_tools = require("@deepseek-ai/dsh-tools");
var import_pipeline = require("@deepseek-ai/dsh-tools/pipeline");
var import_cordis = require("@deepseek-ai/cordis");
var import_dsh_brand = require("@deepseek-ai/dsh-brand");
var import_dsh_sandbox = require("@deepseek-ai/dsh-sandbox");
var import_dsh_util_values = require("@deepseek-ai/dsh-util-values");
var import_dsh_scope = require("@deepseek-ai/dsh-scope");
var import_schemastery = __toESM(require("@deepseek-ai/schemastery"));
var ToolCallLimitExceededError = class extends Error {
  /**
  * Describe the rejected call and how to correct the program.
  * @param limit - Timeout-derived maximum tool-call attempts for one run_code invocation.
  * @param callNumber - One-based attempt rejected without invoking the tool.
  * @param callsPerMinute - Attempts granted per minute of run_code timeout.
  */
  constructor(limit, callNumber, callsPerMinute) {
    super(`run_code exceeded its limit of ${limit} tool calls (${callsPerMinute} per minute of its timeout); call ${callNumber} was not dispatched. The run_code program may contain an infinite loop. Check loop termination or split the work into smaller run_code calls.`);
    this.name = "ToolCallLimitExceededError";
  }
};
var CodeRunFailedError = class extends import_dsh_llm.HarnessError {
  constructor(message) {
    super(message, "CODE_RUN_FAILED");
    this.name = "CodeRunFailedError";
  }
};
var CodeResetFailedError = class extends import_dsh_llm.HarnessError {
  constructor(message) {
    super(message, "CODE_RESET_FAILED");
    this.name = "CodeResetFailedError";
  }
};
function runCodeFlavor(language, execution = {
  programDescription: "the program to execute",
  outputInstruction: "Curate the program output.",
  codeDescription: `The ${language} program to execute, following this tool's execution instructions.`
}) {
  return {
    description: `Execute a ${language} program against the available tools. Takes two required arguments: \`code\`, ${execution.programDescription}, and \`description\`, a short summary of what the program does. Call tools as \`await tools.name(args)\` per the declarations in the system prompt. ${execution.outputInstruction} Image-bearing subtool results are attached after the run.`,
    codeDescription: execution.codeDescription
  };
}
var TYPESCRIPT_FLAVOR = runCodeFlavor("TypeScript");
var TYPESCRIPT_FUNCTION_FLAVOR = runCodeFlavor("TypeScript", {
  programDescription: "the BODY of an async function (erasable syntax only; top-level `await` and `return` work)",
  outputInstruction: "Only what you print or return is program output \u2014 curate it.",
  codeDescription: "The program: the body of an async TypeScript function."
});
var RUN_CODE_FLAVORS = {
  typescript: TYPESCRIPT_FLAVOR,
  python: runCodeFlavor("Python")
};
function requirePtcRuntime(ctx) {
  const runtime = ctx.get("ptcRuntime");
  if (runtime === void 0) throw new Error('dsh-tools: mode "ptc" requires a PTC runtime \u2014 load a ctx.ptcRuntime implementation (e.g. @deepseek-ai/dsh-ptc-runtime-node) or load @deepseek-ai/dsh-tool-executor-native');
  if (!Object.hasOwn(RUN_CODE_FLAVORS, runtime.language)) {
    const known = Object.keys(RUN_CODE_FLAVORS).map((name2) => JSON.stringify(name2)).join(", ");
    throw new Error(`dsh-tools: no SDK renderer registered for runtime language ${JSON.stringify(runtime.language)} (known: ${known})`);
  }
  return runtime;
}
var RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION = 'Clear, concise description of what this program does in active voice, 5-10 words (shown in the UI). Examples: "Count TODO markers across packages"; "Read failing test and its fixture"; "Rename config key in every cordis.yml".';
var RUN_CODE_CONTROLS = {
  timeoutMs: {
    type: "number",
    description: "Positive elapsed-time budget in milliseconds, capped by the deployment maximum."
  },
  sandbox_permissions: {
    type: "string",
    enum: [...import_dsh_sandbox.ESCALATION_TARGETS],
    description: "Wider sandbox mode for this complete program execution; requires justification and approval."
  },
  justification: {
    type: "string",
    description: "Reason this complete program needs wider access, shown to the user for approval. Use the language of the user\u2019s current request."
  }
};
function controlParameters(runtime) {
  return {
    ...runtime.timeout === void 0 ? {} : { timeoutMs: {
      ...RUN_CODE_CONTROLS.timeoutMs,
      description: `Positive elapsed-time budget in milliseconds, including nested tool and approval waits. Default ${runtime.timeout.defaultMs}; capped at ${runtime.timeout.maxMs}. Zero does not disable the deadline.`
    } },
    ...runtime.sandboxMode === void 0 ? {} : {
      sandbox_permissions: RUN_CODE_CONTROLS.sandbox_permissions,
      justification: RUN_CODE_CONTROLS.justification
    }
  };
}
function escalationGuidance(mode) {
  return mode === void 0 ? "" : " A sandbox escalation approves this complete program for one execution only. Nested tools retain their own policies and approvals. Request wider access only after evidence of a denial. Earlier effects may already have completed: inspect them before explicitly retrying. Programs are never replayed automatically.";
}
function resolveFlavor(runtime) {
  return runtime.language === "typescript" && runtime.programFormat === "function-body" ? TYPESCRIPT_FUNCTION_FLAVOR : RUN_CODE_FLAVORS[runtime.language];
}
function jsonNormalizeArgs(value) {
  let snapshot;
  try {
    snapshot = (0, import_dsh_util_values.snapshotJsonValue)(value);
  } catch (error) {
    throw new Error(`tool arguments must be lossless JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (snapshot === void 0) throw new Error("tool arguments must be lossless JSON (call the tool with an arguments object, e.g. `{}`)");
  const logged = (0, import_dsh_util_values.snapshotJsonValue)(snapshot);
  if (logged === void 0) throw new Error("tool arguments could not be detached for durable logging");
  return {
    dispatched: snapshot,
    logged
  };
}
var JSON_INDENT = "  ";
var MAX_JSON_INDENT_CHARS = 10;
function renderJsonValue(value) {
  const chunks = [];
  const tasks = [{
    kind: "value",
    value,
    depth: 0,
    compact: false
  }];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "text") {
      chunks.push(task.text);
      continue;
    }
    const current = task.value;
    if (current === null || typeof current === "boolean" || typeof current === "number") {
      chunks.push(String(current));
      continue;
    }
    if (typeof current === "string") {
      chunks.push(JSON.stringify(current));
      continue;
    }
    const compact = task.compact || (task.depth + 1) * 2 > MAX_JSON_INDENT_CHARS;
    const childDepth = task.depth + 1;
    if (Array.isArray(current)) {
      chunks.push("[");
      if (current.length === 0) {
        chunks.push("]");
        continue;
      }
      tasks.push({
        kind: "text",
        text: compact ? "]" : `
${JSON_INDENT.repeat(task.depth)}]`
      });
      for (let index = current.length - 1; index >= 0; index--) {
        const item = current[index];
        if (item === void 0) throw new Error("cannot render a sparse JSON array");
        tasks.push({
          kind: "value",
          value: item,
          depth: childDepth,
          compact
        });
        tasks.push({
          kind: "text",
          text: compact ? index === 0 ? "" : "," : `${index === 0 ? "\n" : ",\n"}${JSON_INDENT.repeat(childDepth)}`
        });
      }
      continue;
    }
    const keys = Object.keys(current);
    chunks.push("{");
    if (keys.length === 0) {
      chunks.push("}");
      continue;
    }
    tasks.push({
      kind: "text",
      text: compact ? "}" : `
${JSON_INDENT.repeat(task.depth)}}`
    });
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (key === void 0) throw new Error("cannot render a missing JSON object key");
      const item = current[key];
      if (item === void 0) throw new Error("cannot render an undefined JSON object property");
      tasks.push({
        kind: "value",
        value: item,
        depth: childDepth,
        compact
      });
      tasks.push({
        kind: "text",
        text: compact ? `${index === 0 ? "" : ","}${JSON.stringify(key)}:` : `${index === 0 ? "\n" : ",\n"}${JSON_INDENT.repeat(childDepth)}${JSON.stringify(key)}: `
      });
    }
  }
  return chunks.join("");
}
function renderValue(value) {
  return typeof value === "string" ? value : renderJsonValue(value);
}
async function resolveWorkingDirectory(ctx, exec) {
  if (exec.agent === void 0) return void 0;
  const directories = ctx.get("workingDirectory");
  if (directories === void 0) throw new Error("dsh-tools: run_code with an Agent requires workingDirectory");
  return directories.ensure(exec.agent, exec.signal);
}
function resolveSandboxPolicy(ctx, exec) {
  const policy = ctx.get("sandboxPolicy");
  if (policy === void 0) throw new Error("dsh-tools: confined PTC runtime requires sandboxPolicy");
  return policy.resolve(exec.agent === void 0 ? {} : { session: exec.agent.session });
}
function createRunCodeTool(ctx, executor, config, calls) {
  const { maxSubCallsPerMinute, maxParallelSubCalls: maxParallel } = config;
  const tools = ctx.tools;
  const logger = ctx.logger;
  async function shapeDispatchLog(dispatch) {
    try {
      return await ctx.waterfall((0, import_dsh_scope.scopeTarget)(tools, dispatch.agent), "tools/ptc-dispatch-log", dispatch, () => Promise.resolve(dispatch.content));
    } catch (error) {
      logger.warn(`tools: ptc-dispatch-log listener failed for ${dispatch.name}: ${(0, import_pipeline.toolErrorMessage)(error)}; logging the original settled content`);
      return dispatch.content;
    }
  }
  const stateOwners = /* @__PURE__ */ new WeakMap();
  const definition = (0, import_dsh_tools.defineTool)({
    name: import_dsh_tools.RUN_CODE_NAME,
    description: TYPESCRIPT_FLAVOR.description,
    parameters: {
      code: {
        type: "string",
        required: true,
        description: TYPESCRIPT_FLAVOR.codeDescription
      },
      description: {
        type: "string",
        required: true,
        description: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION
      },
      ...RUN_CODE_CONTROLS
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          logs: {
            type: "array",
            required: true,
            items: { type: "string" }
          },
          result: { type: "json" },
          sandbox: {
            type: "object",
            additionalProperties: false,
            properties: {
              mode: {
                type: "string",
                required: true,
                enum: [
                  "read-only",
                  "workspace-write",
                  "danger-full-access"
                ]
              },
              denied: {
                type: "boolean",
                required: true
              },
              enforcement: {
                type: "string",
                enum: ["full", "partial"]
              }
            }
          }
        }
      },
      render: (_args, value) => {
        const rendered = value.result === void 0 ? "" : renderValue(value.result);
        const parts = [value.logs.join("\n"), rendered].filter((part) => part.length > 0);
        if (value.sandbox?.enforcement === "partial") parts.push("File sandbox enforcement is partial on this host.");
        if (value.sandbox?.denied) parts.push(`The ${value.sandbox.mode} file sandbox denied an operation.${escalationGuidance(ctx.get("ptcRuntime")?.sandboxMode)}`);
        return [{
          type: "text",
          text: parts.length > 0 ? parts.join("\n") : "(run_code completed with no output)"
        }];
      }
    },
    async execute(args, exec) {
      if (args.description.trim().length === 0) throw new Error("invalid description: expected a non-empty string");
      const runtime = requirePtcRuntime(ctx);
      const run = async (callSignal) => {
        (0, import_dsh_sandbox.validateEscalationArgs)(args.sandbox_permissions, args.justification);
        if (args.timeoutMs !== void 0 && runtime.timeout === void 0) throw new Error("timeoutMs is not available for this PTC runtime");
        if (args.timeoutMs !== void 0 && (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0)) throw new Error("invalid timeoutMs: expected a positive finite number");
        const standingPolicy = runtime.sandboxMode === void 0 ? void 0 : resolveSandboxPolicy(ctx, exec);
        let policy = standingPolicy;
        if (args.sandbox_permissions !== void 0 && args.justification !== void 0) {
          if (standingPolicy === void 0) throw new Error("sandbox_permissions is not available for this PTC runtime");
          const approvedMode = await (0, import_dsh_sandbox.approveEscalation)({
            requestedMode: args.sandbox_permissions,
            justification: args.justification,
            effectiveMode: standingPolicy.mode,
            subject: "program"
          }, {
            approver: ctx.get("approval"),
            agent: exec.agent,
            callId: exec.callId,
            toolName: import_dsh_tools.RUN_CODE_NAME,
            signal: callSignal
          });
          policy = {
            ...standingPolicy,
            mode: approvedMode
          };
        }
        const cwd = await resolveWorkingDirectory(ctx, {
          ...exec,
          signal: callSignal
        });
        callSignal.throwIfAborted();
        const runController = new AbortController();
        const onOuterAbort = () => {
          runController.abort(callSignal.reason);
        };
        callSignal.addEventListener("abort", onOuterAbort, { once: true });
        let toolCallAttempts = 0;
        let maxSubCalls;
        const pendingQueue = [];
        const inFlight = /* @__PURE__ */ new Set();
        const logWork = /* @__PURE__ */ new Set();
        const commitQueue = [];
        let exclusiveActive = false;
        let driving = false;
        let driverRun = Promise.resolve();
        let wake;
        const wakeup = () => {
          const release = wake;
          wake = void 0;
          release?.();
        };
        const drive = () => {
          if (driving) return driverRun;
          driving = true;
          driverRun = (async () => {
            try {
              for (; ; ) {
                const signal = new Promise((resolve) => {
                  wake = resolve;
                });
                const commitHead = commitQueue[0];
                if (commitHead !== void 0 && commitHead.settled) {
                  commitQueue.shift();
                  await commitHead.commit();
                  if (commitHead.mode === "exclusive") exclusiveActive = false;
                  continue;
                }
                const head = pendingQueue[0];
                if (head !== void 0) {
                  if (runController.signal.aborted) {
                    pendingQueue.shift();
                    head.abandon();
                    continue;
                  }
                  const mode = head.classify();
                  if (!exclusiveActive && (mode === "exclusive" ? inFlight.size === 0 : inFlight.size < maxParallel)) {
                    if (mode === "exclusive") exclusiveActive = true;
                    head.mode = mode;
                    pendingQueue.shift();
                    commitQueue.push(head);
                    await head.start();
                    const flight = head.flight.finally(() => {
                      inFlight.delete(flight);
                      wakeup();
                    });
                    inFlight.add(flight);
                    continue;
                  }
                }
                if (pendingQueue.length === 0 && commitQueue.length === 0 && inFlight.size === 0) return;
                await signal;
              }
            } finally {
              driving = false;
              wake = void 0;
            }
          })();
          return driverRun;
        };
        const drainDispatches = async () => {
          await drive();
          while (logWork.size > 0) await Promise.allSettled([...logWork]);
        };
        const runOver = () => runController.signal.aborted;
        const binding = (schema) => async (rawArgs) => {
          const { name: name2 } = schema;
          if (runOver()) throw new Error(`run_code run is over (${String(runController.signal.reason)}); ${name2} not dispatched`);
          const n = ++toolCallAttempts;
          if (n > maxSubCalls) {
            const error = new ToolCallLimitExceededError(maxSubCalls, n, maxSubCallsPerMinute);
            runController.abort(error);
            throw error;
          }
          const normalized = jsonNormalizeArgs(rawArgs);
          const subCallId = (0, import_dsh_brand.brandString)(`${String(exec.callId)}:ptc:${n}`);
          const input = {
            callId: subCallId,
            rootCallId: exec.rootCallId,
            name: name2,
            schema,
            arguments: normalized.dispatched,
            ...exec.agent ? { agent: exec.agent } : {},
            ...exec.toolSet !== void 0 ? { toolSet: exec.toolSet } : {},
            parent: exec.token,
            signal: runController.signal
          };
          const outcome = await new Promise((resolve, reject) => {
            let parked;
            const settle = (result) => {
              resolve(result.isError ? {
                isError: true,
                message: result.error.message
              } : {
                isError: false,
                value: result.value
              });
              const agent = exec.agent;
              if (agent === void 0) return;
              const task = (async () => {
                const logged = await shapeDispatchLog({
                  exec,
                  agent,
                  subCallId,
                  name: name2,
                  isError: result.isError,
                  content: result.content
                });
                agent.session.append("tool/ptc-dispatch", {
                  rootCallId: exec.rootCallId,
                  parentCallId: exec.callId,
                  subCallId,
                  name: name2,
                  arguments: normalized.logged,
                  isError: result.isError,
                  ...result.error?.info === void 0 ? {} : { error: result.error.info },
                  content: logged,
                  ...result.meta === void 0 ? {} : { meta: result.meta }
                });
              })().finally(() => {
                logWork.delete(task);
              });
              logWork.add(task);
            };
            pendingQueue.push({
              flight: Promise.resolve(),
              settled: false,
              classify: () => executor.executionMode(input).kind,
              abandon: () => {
                reject(/* @__PURE__ */ new Error(`run_code run is over (${String(runController.signal.reason)}); ${name2} tool call abandoned`));
              },
              async start() {
                exec.agent?.session.append("tool/ptc-dispatch-start", {
                  rootCallId: exec.rootCallId,
                  parentCallId: exec.callId,
                  subCallId,
                  name: name2,
                  arguments: normalized.logged
                });
                const prepared = await executor.prepare(input);
                if (prepared.kind === "dispatch") {
                  this.flight = executor.dispatch(prepared.exec).then((dispatchOutcome) => {
                    parked = {
                      kind: dispatchOutcome.kind,
                      exec: prepared.exec,
                      result: dispatchOutcome.result
                    };
                    this.settled = true;
                  });
                  return;
                }
                parked = {
                  kind: prepared.kind,
                  exec: prepared.exec,
                  result: prepared.result
                };
                this.settled = true;
              },
              async commit() {
                if (parked === void 0) return;
                const result = await executor.complete(parked.exec, parked);
                if (!result.isError && result.content.some((block) => block.type === "image")) exec.deferContext((0, import_dsh_llm.createUserMessage)({
                  content: result.content,
                  source: { kind: "ptc-mode" }
                }));
                for (const context of result.additionalContexts ?? []) exec.deferContext(context);
                if (result.concludesTurn) exec.concludeTurn();
                settle(result);
                while (logWork.size > maxParallel) await Promise.race(logWork);
              }
            });
            wakeup();
            drive();
          });
          if (runOver()) throw new Error(`run_code run is over (${String(runController.signal.reason)}); ${name2} result discarded`);
          if (outcome.isError) throw new Error(outcome.message);
          return outcome.value;
        };
        const functions = /* @__PURE__ */ Object.create(null);
        for (const schema of tools.schemas(exec.agent, exec.toolSet)) Object.defineProperty(functions, schema.name, {
          enumerable: true,
          value: binding((0, import_dsh_util_values.deepFreeze)(schema))
        });
        try {
          let result;
          try {
            if (exec.agent !== void 0) {
              const agent = exec.agent;
              let runtimes = stateOwners.get(agent);
              if (runtimes === void 0) stateOwners.set(agent, runtimes = /* @__PURE__ */ new WeakSet());
              let provider = runtime;
              for (; ; ) {
                const original = provider[import_cordis.symbols.original];
                if (original === void 0) break;
                provider = original;
              }
              if (!runtimes.has(provider)) {
                agent.ctx.effect(() => () => runtime.release(agent), "PTC retained environment");
                runtimes.add(provider);
              }
            }
            const spec = runtime.resolve({
              program: args.code,
              ...exec.agent === void 0 || policy?.mode !== standingPolicy?.mode ? {} : { stateOwner: exec.agent },
              bindings: [{
                global: "tools",
                functions,
                errorClass: {
                  name: "ToolCallError",
                  memberNameProperty: "toolName"
                }
              }],
              signal: runController.signal,
              ...cwd !== void 0 ? { cwd } : {},
              ...policy !== void 0 ? { sandboxPolicy: policy } : {},
              ...args.timeoutMs !== void 0 ? { timeoutMs: args.timeoutMs } : {}
            });
            maxSubCalls = spec.timeoutMs === null ? Infinity : Math.floor(spec.timeoutMs / 6e4 * maxSubCallsPerMinute);
            result = await runtime.run(spec);
          } finally {
            runController.abort("run_code settled");
            await drainDispatches();
          }
          if (result.error) {
            const limitError = runController.signal.reason instanceof ToolCallLimitExceededError ? runController.signal.reason : void 0;
            if (result.error.kind === "abort" && exec.signal.aborted && limitError === void 0) {
              const error = new import_dsh_llm.HarnessError(runtime.retainsState ? `tool call aborted: ${result.error.message}` : "tool call aborted", import_dsh_tools.TOOL_ABORTED);
              error.name = "AbortError";
              throw error;
            }
            const logsText = result.logs.length > 0 ? `
Captured output:
${result.logs.join("\n")}` : "";
            const sandboxText = result.sandbox === void 0 ? "" : `
File sandbox: ${result.sandbox.mode}${result.sandbox.enforcement === void 0 ? "" : `; enforcement: ${result.sandbox.enforcement}`}${result.sandbox.denied ? "; operation denied" : ""}.`;
            const failureText = limitError === void 0 || limitError.message === result.error.message ? result.error.message : `${limitError.message}
${result.error.message}`;
            throw new CodeRunFailedError(`code run failed (${result.error.kind}): ${failureText}${logsText}${sandboxText}${result.sandbox?.denied ? escalationGuidance(runtime.sandboxMode) : ""}`);
          }
          return {
            logs: result.logs,
            ...result.sandbox === void 0 ? {} : { sandbox: result.sandbox },
            ...result.value !== void 0 ? { result: result.value } : {}
          };
        } finally {
          callSignal.removeEventListener("abort", onOuterAbort);
        }
      };
      return exec.agent === void 0 || runtime.sandboxMode === void 0 && !runtime.retainsState ? run(exec.signal) : calls.run(exec.agent.session.id, exec.signal, () => runtime.sandboxMode === void 0 ? void 0 : resolveSandboxPolicy(ctx, exec).mode, run);
    },
    presentCall: (args) => ({
      card: "generic",
      title: args.description,
      kind: "execute",
      rawInput: args.code
    })
  });
  Object.defineProperty(definition, "description", {
    enumerable: true,
    get: () => {
      const runtime = requirePtcRuntime(ctx);
      const instructions = runtime.executionInstructions;
      return resolveFlavor(runtime).description + (instructions ? ` ${instructions}` : "") + " Each program starts in the Session's current directory. Running programs keep their initial directory." + escalationGuidance(runtime.sandboxMode);
    }
  });
  Object.defineProperty(definition, "parameters", {
    enumerable: true,
    get: () => {
      const runtime = requirePtcRuntime(ctx);
      return (0, import_dsh_tools.parameterSchemaSpecToJsonSchema)({
        code: {
          type: "string",
          required: true,
          description: resolveFlavor(runtime).codeDescription
        },
        description: {
          type: "string",
          required: true,
          description: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION
        },
        ...controlParameters(runtime)
      });
    }
  });
  return definition;
}
var IDENTIFIER$1 = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function renderKey(name2) {
  return IDENTIFIER$1.test(name2) ? name2 : JSON.stringify(name2);
}
function pad$1(indent) {
  return "  ".repeat(indent);
}
function docLines$1(description, indent) {
  if (typeof description !== "string" || description.length === 0) return [];
  const collapsed = description.replace(/\s+/g, " ").trim();
  return [`${pad$1(indent)}/** ${collapsed.replaceAll("*/", String.raw`*\/`)} */`];
}
function renderScalar(value) {
  return JSON.stringify(value);
}
function renderConstrainedScalar$1(node, type) {
  const broad = type === "integer" ? "number" : type;
  if (Object.hasOwn(node, "const")) return renderScalar(node.const);
  if (Object.hasOwn(node, "enum")) return node.enum.map(renderScalar).join(" | ");
  return broad;
}
function typeDocumentFrom(parts) {
  return {
    parts,
    containsUnionOrIntersection: parts.some((part) => typeof part === "string" ? part.includes("|") || part.includes("&") : part.containsUnionOrIntersection)
  };
}
function typeDocument(...parts) {
  return typeDocumentFrom(parts);
}
function flattenTypeDocument(document) {
  const chunks = [];
  const tasks = [document];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (typeof task === "string") {
      chunks.push(task);
      continue;
    }
    for (let index = task.parts.length - 1; index >= 0; index--) {
      const part = task.parts[index];
      if (part !== void 0) tasks.push(part);
    }
  }
  return chunks.join("");
}
function schemaRenderFrame(node, indent) {
  return {
    node,
    indent,
    phase: "start",
    children: [],
    childIndex: 0,
    childDocuments: [],
    entries: []
  };
}
function renderSupportedSchema(schema, indent) {
  const frames = [schemaRenderFrame(schema, indent)];
  let rootDocument;
  const finish = (document) => {
    frames.pop();
    const parent = frames.at(-1);
    if (parent === void 0) rootDocument = document;
    else parent.childDocuments.push(document);
  };
  while (frames.length > 0) {
    const frame = frames.at(-1);
    if (frame === void 0) break;
    if (frame.phase === "children") {
      if (frame.childIndex < frame.children.length) {
        const child = frame.children[frame.childIndex];
        if (child === void 0) throw new Error("missing schema render child");
        frame.childIndex++;
        frames.push(schemaRenderFrame(child.node, child.indent));
        continue;
      }
      if (frame.kind === "oneOf") {
        const parts2 = [];
        for (let index = 0; index < frame.childDocuments.length; index++) {
          if (index > 0) parts2.push(" | ");
          const child = frame.childDocuments[index];
          if (child !== void 0) parts2.push(child);
        }
        finish(typeDocumentFrom(parts2));
        continue;
      }
      if (frame.kind === "array") {
        const child = frame.childDocuments[0];
        if (child === void 0) throw new Error("missing array item type");
        finish(child.containsUnionOrIntersection ? typeDocument("(", child, ")[]") : typeDocument(child, "[]"));
        continue;
      }
      const required = new Set(frame.node.required);
      const parts = ["{"];
      for (let index = 0; index < frame.entries.length; index++) {
        const entry = frame.entries[index];
        const child = frame.childDocuments[index];
        if (entry === void 0 || child === void 0) throw new Error("missing object property type");
        const [name2, prop] = entry;
        for (const line of docLines$1(prop.description, frame.indent + 1)) parts.push("\n", line);
        parts.push("\n", `${pad$1(frame.indent + 1)}${renderKey(name2)}${required.has(name2) ? "" : "?"}: `, child, ";");
      }
      parts.push("\n", `${pad$1(frame.indent)}}`);
      const declared = typeDocumentFrom(parts);
      finish(frame.node.additionalProperties === false ? declared : typeDocument(declared, " & Record<string, JsonValue>"));
      continue;
    }
    const node = frame.node;
    if (node.oneOf !== void 0) {
      frame.kind = "oneOf";
      frame.children = Array.from(node.oneOf, (child) => ({
        node: child,
        indent: frame.indent
      }));
      frame.childIndex = 0;
      frame.childDocuments = [];
      frame.phase = "children";
      continue;
    }
    if (node.type === void 0) {
      finish(typeDocument("JsonValue"));
      continue;
    }
    switch (node.type) {
      case "string":
      case "number":
      case "integer":
      case "boolean":
      case "null":
        finish(typeDocument(renderConstrainedScalar$1(node, node.type)));
        break;
      case "array":
        if (node.items === void 0) finish(typeDocument("JsonValue[]"));
        else {
          frame.kind = "array";
          frame.children = [{
            node: node.items,
            indent: frame.indent
          }];
          frame.childIndex = 0;
          frame.childDocuments = [];
          frame.phase = "children";
        }
        break;
      case "object": {
        const open = node.additionalProperties !== false;
        const entries = Object.entries(node.properties ?? {});
        if (entries.length === 0) finish(typeDocument(open ? "Record<string, JsonValue>" : "Record<string, never>"));
        else {
          frame.kind = "object";
          frame.entries = entries;
          frame.children = entries.map(([, child]) => ({
            node: child,
            indent: frame.indent + 1
          }));
          frame.childIndex = 0;
          frame.childDocuments = [];
          frame.phase = "children";
        }
        break;
      }
      /* v8 ignore next -- assertSupportedJsonSchema narrowed this closed type union. */
      default:
        finish(typeDocument("unknown"));
    }
  }
  return rootDocument ?? typeDocument("unknown");
}
function jsonSchemaToTs(schema, indent = 0) {
  try {
    (0, import_dsh_tools.assertSupportedJsonSchema)(schema);
    return flattenTypeDocument(renderSupportedSchema(schema, indent));
  } catch {
    return "unknown";
  }
}
function renderSdkInstructions(programFormat) {
  return `## Writing code for run_code

\`run_code\` takes two required arguments: \`code\`, ${programFormat === "function-body" ? "the body of an async TypeScript function (erasable syntax only \u2014 no `enum` or namespaces; type annotations are advisory, the code runs type-stripped)" : "the program to execute"}, and \`description\`, a short summary of what the program does. The declarations below are SDK bindings for this program. A declaration does not make its name a directly callable tool; only names supplied as separate tool schemas may be called directly.`;
}
function renderSdkProgramInstructions(programFormat) {
  return `Inside the program:

- Call tools as \`await tools.name(args)\` \u2014 quoted access for exotic names: \`tools["my-tool"](args)\`. Every call resolves to the tool's typed canonical JSON value. Tool arguments must be lossless JSON.
- A FAILED tool call rejects with \`ToolCallError\`, whose \`toolName\` identifies the failed tool and whose \`message\` is human-readable \u2014 \`try/catch\` it to handle and continue.
- Independent read-only calls MAY overlap under \`Promise.all\` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with \`await\`.
- ${programFormat === "function-body" ? "Emit results with `return` and/or `console.log(...)`. Only what you print or return is program output." : "Only values emitted as program output enter the conversation."} A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.

Program-only SDK bindings:`;
}
function acceptsExampleString(schema, value) {
  return schema?.type === "string" && (schema.const === void 0 || schema.const === value) && (schema.enum === void 0 || schema.enum.includes(value));
}
function renderBashExample(schemas, programFormat) {
  const bash = schemas.find((schema) => schema.name === "bash");
  if (bash === void 0) return "";
  const parameters = bash.parameters;
  if (parameters.type !== "object") return "";
  const required = parameters.required ?? [];
  if (required.some((name2) => name2 !== "command" && name2 !== "description")) return "";
  if (!acceptsExampleString(parameters.properties?.command, "pwd")) return "";
  const needsDescription = required.includes("description");
  if (needsDescription && !acceptsExampleString(parameters.properties?.description, "Show current directory")) return "";
  const description = needsDescription ? "description: 'Show current directory', " : "";
  return ` When no separate \`bash\` schema is supplied, invoke a declared \`bash\` binding inside \`run_code\`:

\`run_code({ code: "${programFormat === "function-body" ? `return await tools.bash({ ${description}command: 'pwd' })` : `console.log(await tools.bash({ ${description}command: 'pwd' }))`}", description: "Show current directory" })\``;
}
function renderToolsSdk(schemas, programFormat = "function-body") {
  const sorted = [...schemas].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const argsMembers = [];
  const outputMembers = [];
  for (const schema of sorted) {
    argsMembers.push(...docLines$1(schema.description, 1));
    argsMembers.push(`${pad$1(1)}${renderKey(schema.name)}: ${jsonSchemaToTs(schema.parameters, 1)};`);
    outputMembers.push(`${pad$1(1)}${renderKey(schema.name)}: ${jsonSchemaToTs(schema.output, 1)};`);
  }
  const declaration = [
    `interface ToolArgsMap {${argsMembers.length > 0 ? `
${argsMembers.join("\n")}
` : ""}}`,
    `interface ToolOutputMap {${outputMembers.length > 0 ? `
${outputMembers.join("\n")}
` : ""}}`,
    "type ToolName = keyof ToolOutputMap",
    [
      "declare class ToolCallError extends Error {",
      '  readonly name: "ToolCallError";',
      "  readonly toolName: ToolName;",
      "}"
    ].join("\n"),
    [
      "declare const tools: {",
      "  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;",
      "}"
    ].join("\n")
  ].join("\n\n");
  const jsonValue = "type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }";
  const instructions = renderSdkInstructions(programFormat);
  const programInstructions = renderSdkProgramInstructions(programFormat);
  return `${instructions}${renderBashExample(sorted, programFormat)}

${programInstructions}

\`\`\`ts
${jsonValue}

${declaration}
\`\`\``;
}
var IDENTIFIER = new RegExp("^[\\p{XID_Start}_]\\p{XID_Continue}*$", "u");
function isBareIdentifier(name2) {
  return IDENTIFIER.test(name2) && name2.normalize("NFKC") === name2;
}
var RESERVED = /* @__PURE__ */ new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
  "__debug__"
]);
var TYPING_ORDER = [
  "Any",
  "Literal",
  "NotRequired",
  "Protocol",
  "TypedDict"
];
function pad(indent) {
  return "    ".repeat(indent);
}
var UNPRINTABLE = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g;
var LONE_SURROGATE = /[\ud800-\udfff]/gu;
function describe(schema) {
  const description = schema.description;
  if (typeof description !== "string") return void 0;
  const collapsed = description.replace(/\s+/g, " ").replace(UNPRINTABLE, (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`).replace(LONE_SURROGATE, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`).trim();
  return collapsed.length === 0 ? void 0 : collapsed;
}
function docLines(description, indent) {
  const collapsed = describe({ description });
  if (collapsed === void 0) return [];
  const escaped = collapsed.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return [`${pad(indent)}"""${escaped}"""`];
}
function camelCase(raw) {
  const joined = raw.split(/[^\p{XID_Continue}]+|_+/u).filter((part) => part.length > 0).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join("").normalize("NFKC");
  return (new RegExp("^\\p{XID_Start}", "u").test(joined) ? joined : `Tool${joined}`).normalize("NFKC");
}
var MAX_CLASS_NAME_BASE = 120;
var MAX_LIST_NESTING = 180;
function capClassNameBase(base) {
  if (base.length <= MAX_CLASS_NAME_BASE) return base;
  const capped = base.slice(0, MAX_CLASS_NAME_BASE);
  return /[\uD800-\uDBFF]$/.test(capped) ? capped.slice(0, -1) : capped;
}
function allocateClassName(base, state) {
  const capped = capClassNameBase(base);
  let name2 = capped;
  if (state.usedClassNames.has(name2)) {
    let n = state.nextClassCounter.get(capped) ?? 2;
    while (state.usedClassNames.has(`${capped}${n}`)) n++;
    name2 = `${capped}${n}`;
    state.nextClassCounter.set(capped, n + 1);
  }
  state.usedClassNames.add(name2);
  return name2;
}
function childClassName(base, segment) {
  return capClassNameBase(`${base}${segment}`.normalize("NFKC"));
}
function pyScalar(value) {
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)) return BigInt(value).toString();
  return String(value);
}
function renderConstrainedScalar(node, broad, state) {
  if (node.const !== void 0) {
    state.typing.add("Literal");
    return `Literal[${pyScalar(node.const)}]`;
  }
  if (node.enum !== void 0) {
    state.typing.add("Literal");
    return `Literal[${node.enum.map(pyScalar).join(", ")}]`;
  }
  return broad;
}
function renderType(schema, className, state) {
  const newFrame = (schema2, className2, listDepth) => ({
    schema: schema2,
    className: className2,
    phase: "start",
    listDepth,
    children: [],
    childIndex: 0,
    childTypes: [],
    entries: []
  });
  try {
    (0, import_dsh_tools.assertSupportedJsonSchema)(schema);
    const frames = [newFrame(schema, className, 0)];
    let result;
    const finish = (type) => {
      frames.pop();
      const parent = frames.at(-1);
      if (parent === void 0) result = type;
      else parent.childTypes.push(type);
    };
    while (frames.length > 0) {
      const frame = frames.at(-1);
      if (frame === void 0) break;
      if (frame.phase === "children") {
        if (frame.childIndex < frame.children.length) {
          const child = frame.children[frame.childIndex];
          if (child === void 0) throw new Error("missing python render child");
          frame.childIndex++;
          frames.push(newFrame(child.schema, child.className, child.listDepth));
          continue;
        }
        if (frame.kind === "oneOf") {
          let union = "";
          for (const [index, childType] of frame.childTypes.entries()) union = index === 0 ? childType : `${union} | ${childType}`;
          finish(union);
          continue;
        }
        if (frame.kind === "array") {
          finish(`list[${frame.childTypes[0] ?? "Any"}]`);
          continue;
        }
        const node2 = frame.node;
        const name2 = frame.allocated;
        if (node2 === void 0 || name2 === void 0) throw new Error("missing typeddict frame state");
        const required = new Set(node2.required);
        const lines = [`class ${name2}(TypedDict):`];
        for (let index = 0; index < frame.entries.length; index++) {
          const entry = frame.entries[index];
          const fieldType = frame.childTypes[index];
          if (entry === void 0 || fieldType === void 0) throw new Error("missing typeddict field type");
          const [field, fieldSchema] = entry;
          const description = describe(fieldSchema);
          if (description !== void 0) lines.push(`${pad(1)}# ${description}`);
          if (required.has(field)) lines.push(`${pad(1)}${field}: ${fieldType}`);
          else {
            state.typing.add("NotRequired");
            lines.push(`${pad(1)}${field}: NotRequired[${fieldType}]`);
          }
        }
        if (node2.additionalProperties !== false) lines.push(`${pad(1)}# Additional keys beyond those declared are allowed.`);
        if (lines.length === 1) lines.push(`${pad(1)}pass`);
        state.classes.push(lines.join("\n"));
        finish(name2);
        continue;
      }
      frame.phase = "children";
      const node = frame.schema;
      if (node.oneOf !== void 0) {
        frame.kind = "oneOf";
        frame.children = node.oneOf.map((branch, index) => ({
          schema: branch,
          className: childClassName(frame.className, `${index + 1}`),
          listDepth: frame.listDepth
        }));
        continue;
      }
      if (node.type === void 0) {
        state.typing.add("Any");
        finish("Any");
        continue;
      }
      switch (node.type) {
        case "string":
          finish(renderConstrainedScalar(node, "str", state));
          break;
        case "number":
          finish(renderConstrainedScalar(node, "float", state));
          break;
        case "integer":
          finish(renderConstrainedScalar(node, "int", state));
          break;
        case "boolean":
          finish(renderConstrainedScalar(node, "bool", state));
          break;
        case "null":
          finish("None");
          break;
        case "array":
          if (node.items === void 0) {
            state.typing.add("Any");
            finish("list[Any]");
            break;
          }
          if (frame.listDepth >= MAX_LIST_NESTING) {
            state.typing.add("Any");
            finish("Any");
            break;
          }
          frame.kind = "array";
          frame.children = [{
            schema: node.items,
            className: frame.className,
            listDepth: frame.listDepth + 1
          }];
          break;
        case "object": {
          const entries = Object.entries(node.properties ?? {});
          if (className === "" || !entries.every(([name2]) => isBareIdentifier(name2) && !RESERVED.has(name2) && !(name2.startsWith("__") && !name2.endsWith("__")))) {
            state.typing.add("Any");
            finish("dict[str, Any]");
            break;
          }
          if (entries.length === 0 && node.additionalProperties !== false) {
            state.typing.add("Any");
            finish("dict[str, Any]");
            break;
          }
          frame.kind = "typeddict";
          frame.node = node;
          frame.allocated = allocateClassName(frame.className, state);
          state.typing.add("TypedDict");
          frame.entries = entries;
          frame.children = entries.map(([field, child]) => ({
            schema: child,
            className: childClassName(frame.allocated ?? "", camelCase(field)),
            listDepth: 1
          }));
          break;
        }
        /* v8 ignore next 4 -- assertSupportedJsonSchema narrowed this closed type union. */
        default:
          state.typing.add("Any");
          finish("Any");
      }
    }
    return result ?? "Any";
  } catch {
    state.typing.add("Any");
    return "Any";
  }
}
function jsonSchemaToPy(schema) {
  return renderType(schema, "", {
    classes: [],
    usedClassNames: /* @__PURE__ */ new Set(),
    nextClassCounter: /* @__PURE__ */ new Map(),
    typing: /* @__PURE__ */ new Set()
  });
}
var SDK_INSTRUCTIONS = `## Writing code for run_code

\`run_code\` takes two required arguments: \`code\`, the program to execute, and \`description\`, a short summary of what the program does. At run time exactly two of the names declared below are bound: \`tools\` and \`ToolCallError\`. Everything else is a STATIC STUB describing argument and return types \u2014 in particular the \`TypedDict\` classes do NOT exist at run time, so build arguments as plain \`dict\`/\`list\` JSON values: \`await tools.name({"field": 1})\`, never \`FooArgs(field=1)\`, which raises \`NameError\`. Inside the program:

- Call tools as \`await tools.name(args)\` \u2014 subscript access for exotic, reserved, or underscore-leading names: \`await tools["my-tool"](args)\`. Every call resolves to the tool's typed canonical JSON value (each method's return type below). Tool arguments must be lossless JSON.
- A FAILED tool call raises \`ToolCallError\`, whose \`toolName\` identifies the failed tool and whose message is human-readable \u2014 wrap in \`try/except\` to handle and continue.
- Independent read-only calls MAY overlap under \`asyncio.gather\` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with \`await\`.
- Only values emitted as program output enter the conversation. A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.

The available tools:`;
function renderToolsSdkPy(schemas) {
  const sorted = [...schemas].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const state = {
    classes: [],
    usedClassNames: /* @__PURE__ */ new Set(),
    nextClassCounter: /* @__PURE__ */ new Map(),
    typing: /* @__PURE__ */ new Set(["Protocol"])
  };
  const members = [];
  let statements = 0;
  for (const schema of sorted) {
    const argType = renderType(schema.parameters, `${camelCase(schema.name)}Args`, state);
    const outputType = renderType(schema.output, `${camelCase(schema.name)}Output`, state);
    if (isBareIdentifier(schema.name) && !RESERVED.has(schema.name) && !schema.name.startsWith("_")) {
      const doc = docLines(schema.description, 2);
      members.push(doc.length > 0 ? `${pad(1)}async def ${schema.name}(self, args: ${argType}) -> ${outputType}:` : `${pad(1)}async def ${schema.name}(self, args: ${argType}) -> ${outputType}: ...`);
      members.push(...doc);
      statements += 1;
    } else {
      members.push(`${pad(1)}# tools[${JSON.stringify(schema.name)}](args: ${argType}) -> ${outputType}`);
      const description = describe(schema);
      if (description !== void 0) members.push(`${pad(1)}#   ${description}`);
    }
  }
  const body = (statements > 0 ? members : [`${pad(1)}pass`, ...members]).join("\n");
  const imports = TYPING_ORDER.filter((symbol) => state.typing.has(symbol));
  const classBlock = state.classes.length > 0 ? `${state.classes.join("\n\n")}

` : "";
  return `${SDK_INSTRUCTIONS}

\`\`\`python
${`from typing import ${imports.join(", ")}

class ToolCallError(Exception):
    toolName: str

${classBlock}class Tools(Protocol):
${body}

tools: Tools`}
\`\`\``;
}
var Config = import_schemastery.default.object({
  maxSubCallsPerMinute: import_schemastery.default.natural().min(1).default(1024),
  maxParallelSubCalls: import_schemastery.default.natural().min(1).default(10)
});
var PtcCalls = class {
  calls = /* @__PURE__ */ new Map();
  resets = /* @__PURE__ */ new Map();
  disposed = false;
  /**
  * Observe policy changes for the owning executor.
  * @param ctx - Executor lifecycle and Session events.
  */
  constructor(ctx) {
    ctx.on("session/event", (session, event) => {
      if (event.type !== "sandbox/mode") return;
      for (const call of this.calls.get(session.id) ?? []) if (call.mode !== void 0 && call.mode !== event.data.mode) call.controller.abort(/* @__PURE__ */ new Error("sandbox mode changed"));
    }, { global: true });
    ctx.effect(() => async () => {
      this.disposed = true;
      const calls = [...this.calls.values()].flatMap((calls2) => [...calls2]);
      for (const call of calls) call.controller.abort(/* @__PURE__ */ new Error("PTC tool executor disposed"));
      await Promise.allSettled([...calls.map((call) => call.done), ...[...this.resets.values()].map((reset) => reset.done)]);
    }, "PTC calls");
  }
  /**
  * Await canceled predecessors before resolving authority and admitting a call.
  * @param sessionId - Calling Session.
  * @param signal - Caller cancellation.
  * @param mode - Current standing mode, if supported, read after preceding cleanup.
  * @param run - Complete call, including nested-tool cleanup.
  * @returns The call result.
  */
  async run(sessionId, signal, mode, run) {
    for (; ; ) {
      const reset = this.resets.get(sessionId);
      if (reset !== void 0) {
        try {
          await reset.done;
        } catch (error) {
          throw new CodeRunFailedError(`Program environment unavailable: ${(0, import_pipeline.toolErrorMessage)(error)}. Ask the host to reset it before running more code.`);
        }
        continue;
      }
      const pending = [...this.calls.get(sessionId) ?? []].filter((call2) => call2.signal.aborted);
      if (pending.length === 0) break;
      await Promise.all(pending.map((call2) => call2.done));
    }
    signal.throwIfAborted();
    if (this.disposed) throw new Error("PTC tool executor disposed");
    const controller = new AbortController();
    const done = Promise.withResolvers();
    const currentSignal = AbortSignal.any([signal, controller.signal]);
    const call = {
      mode: mode(),
      controller,
      signal: currentSignal,
      done: done.promise
    };
    let calls = this.calls.get(sessionId);
    if (calls === void 0) this.calls.set(sessionId, calls = /* @__PURE__ */ new Set());
    calls.add(call);
    try {
      return await run(currentSignal);
    } finally {
      calls.delete(call);
      if (calls.size === 0) this.calls.delete(sessionId);
      done.resolve(void 0);
    }
  }
  /**
  * Cancel calls and release their environment independently of program cooperation.
  * A failed release blocks new calls until a later reset succeeds.
  * @param sessionId - Calling Session.
  * @param release - Host operation that terminates and cleans the owned environment.
  * @param notify - Queue the state-loss notice after cleanup and before admitting new calls.
  * @returns Completion after release and all canceled calls settle; concurrent resets share it.
  */
  reset(sessionId, release, notify) {
    if (this.disposed) return Promise.reject(/* @__PURE__ */ new Error("PTC tool executor disposed"));
    const previous = this.resets.get(sessionId);
    if (previous !== void 0 && !previous.settled) return previous.done;
    const done = Promise.withResolvers();
    const reset = {
      done: done.promise,
      settled: false
    };
    this.resets.set(sessionId, reset);
    const calls = [...this.calls.get(sessionId) ?? []];
    for (const call of calls) call.controller.abort(/* @__PURE__ */ new Error("PTC environment reset"));
    Promise.allSettled([Promise.resolve().then(release), ...calls.map((call) => call.done)]).then((results) => {
      const failure = results.find((result) => result.status === "rejected");
      if (failure !== void 0) throw failure.reason;
      notify?.();
    }).then(() => {
      reset.settled = true;
      this.resets.delete(sessionId);
      done.resolve(void 0);
    }, (error) => {
      reset.settled = true;
      done.reject(error);
    });
    return reset.done;
  }
};
var PTC_ONLY_INSTRUCTION = `\`${import_dsh_tools.RUN_CODE_NAME}\` is the only tool you can call directly \u2014 a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.`;
var SDK_RENDERERS = {
  typescript: renderToolsSdk,
  python: renderToolsSdkPy
};
var PtcExecutor = class {
  ctx;
  maxParallel;
  sections;
  pipeline;
  config;
  ptcTransport;
  calls;
  constructor(ctx, config = {}, maxParallel = () => 10) {
    this.ctx = ctx;
    this.maxParallel = maxParallel;
    this.config = Config(config);
    this.calls = new PtcCalls(ctx);
    const tools = ctx.tools;
    this.sections = [{
      name: "tools:ptc-only",
      order: ctx.systemPrompt.getSectionOrder("PTC_ONLY"),
      text: PTC_ONLY_INSTRUCTION,
      interpolate: false
    }, {
      name: "tools:sdk",
      order: ctx.systemPrompt.getSectionOrder("TOOLS_SDK"),
      text: (tools2) => this.renderSdk(tools2),
      interpolate: false
    }];
    this.pipeline = new import_pipeline.ToolExecutionPipeline(ctx, {
      get: (name2, scope, toolSet) => name2 === import_dsh_tools.RUN_CODE_NAME ? this.requirePtcTransport() : tools.executable(name2, scope, toolSet),
      reject: (name2, nested) => !nested && name2 !== import_dsh_tools.RUN_CODE_NAME && !["job_output", "job_list", "job_kill", "runtime_status"].includes(name2) ? new import_dsh_tools.ToolNotFoundError(name2, `only \`${import_dsh_tools.RUN_CODE_NAME}\` is callable directly \u2014 call \`${name2}\` from inside a \`${import_dsh_tools.RUN_CODE_NAME}\` program instead`) : void 0
    });
  }
  describe(_tools) {
    return {
      schemas: [(0, import_dsh_tools.projectToolSchema)(this.requirePtcTransport(), false), ..._tools.filter((tool) => ["job_output", "job_list", "job_kill", "runtime_status"].includes(tool.name)).map((tool) => (0, import_dsh_tools.projectToolSchema)(tool, false))],
      knownNames: [import_dsh_tools.RUN_CODE_NAME, ..._tools.filter((tool) => ["job_output", "job_list", "job_kill", "runtime_status"].includes(tool.name)).map((tool) => tool.name)]
    };
  }
  renderSdk(tools) {
    const runtime = requirePtcRuntime(this.ctx);
    const render = SDK_RENDERERS[runtime.language];
    return render(tools.map((definition) => ({
      ...(0, import_dsh_tools.projectToolSchema)(definition, false),
      output: definition.output.schema
    })), runtime.programFormat);
  }
  execute(input) {
    return (0, import_pipeline.executeToolBatch)(input, this.pipeline, this.maxParallel);
  }
  /**
  * Clear one Agent's retained environment without executing program code.
  * Cancellation or Agent disposal can discard the queued notice after state is cleared.
  * @param agent - Exact owner supplied to program executions.
  * @returns After process and nested-call cleanup and a queued model-visible state-loss notice.
  * @throws Error if no supported runtime is available, without changing admission.
  * @throws CodeResetFailedError if the runtime does not retain state, without changing admission;
  * or if cleanup or notice admission fails, blocking programs until a reset retry succeeds.
  */
  async reset(agent) {
    const runtime = requirePtcRuntime(this.ctx);
    if (!runtime.retainsState) throw new CodeResetFailedError("The PTC runtime does not retain an environment");
    try {
      await this.calls.reset(agent.session.id, () => runtime.release(agent), () => {
        agent.inject((0, import_dsh_llm.createUserMessage)({
          content: [{
            type: "text",
            text: "Program environment reset; retained variables cleared. Completed tool effects remain."
          }],
          source: { kind: "ptc-mode" }
        }));
      });
    } catch (error) {
      throw new CodeResetFailedError(`Program environment reset failed: ${(0, import_pipeline.toolErrorMessage)(error)}. State may not be cleared; retry the host reset before running more code.`);
    }
  }
  /** Keep the reserved transport outside registered capabilities and their restrictions. */
  requirePtcTransport() {
    this.ptcTransport ??= createRunCodeTool(this.ctx, this.pipeline, this.config, this.calls);
    return this.ptcTransport;
  }
};
var name = "ptc-tool-executor";
var inject = [
  "tools",
  "systemPrompt",
  "ptcRuntime"
];
function apply(ctx, config) {
  ctx.tools.setExecutor(new PtcExecutor(ctx, config));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CodeResetFailedError,
  CodeRunFailedError,
  Config,
  PtcExecutor,
  apply,
  inject,
  jsonSchemaToPy,
  jsonSchemaToTs,
  name,
  renderToolsSdk,
  renderToolsSdkPy
});
return module.exports; }
