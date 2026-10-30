export function createModule(require) { const module={exports:{}}; const exports=module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/metering/compaction.mjs
var compaction_exports = {};
__export(compaction_exports, {
  default: () => Compaction
});
module.exports = __toCommonJS(compaction_exports);
var import_dsh_compaction_basic = require("@deepseek-ai/dsh-compaction-basic");
var import_dsh_llm2 = require("@deepseek-ai/dsh-llm");

// src/metering/native/summarizer.ts
var import_dsh_llm = require("@deepseek-ai/dsh-llm");
var import_dsh_util_values = require("@deepseek-ai/dsh-util-values");
var SUMMARY_OPEN_TAG = "<compacted-summary>";
var COMPACTION_INSTRUCTION = [
  "You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.",
  "",
  'Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section \u2014 never drop a section.',
  "",
  "## Primary Request and Intent",
  "- [the user's original and evolving goals; quote verbatim where the exact wording matters]",
  "",
  "## Key Technical Concepts",
  "- [technologies, frameworks, patterns, and conventions in play]",
  "",
  "## Files and Code",
  "- [exact path: why it matters, key changes or snippets]",
  "",
  "## Errors and Fixes",
  "- [error: how it was resolved, plus any related user feedback]",
  "",
  "## Pending Jobs",
  "- [explicitly requested work not yet completed]",
  "",
  "## Current Work",
  "- [precisely what was in progress at this checkpoint]",
  "",
  "## Next Step",
  '- [the single next action, directly in line with the most recent request, or "(none)"]',
  "",
  "## Critical Context",
  "- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]",
  "",
  "Rules:",
  "- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.",
  "- Capture user feedback and explicit instructions faithfully, especially corrections.",
  "- Do NOT mention this summarization request or that the context was compacted.",
  "- Output only the checkpoint text: do not call any tool or take any other action.",
  `- If the conversation already contains a ${SUMMARY_OPEN_TAG} block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.`
].join("\n");
async function summarizeWithLlm(ctx, config, input, agent, signal) {
  const latest = agent.session.requestHeader()?.config;
  const configured = config.summarizationProvider.length === 0 ? void 0 : { provider: config.summarizationProvider, model: config.summarizationModel };
  const agentTarget = agent.options.provider !== void 0 && agent.options.provider.length > 0 && agent.options.model !== void 0 && agent.options.model.length > 0 ? { provider: agent.options.provider, model: agent.options.model } : void 0;
  const target = configured ?? latest ?? agentTarget;
  if (target === void 0) {
    throw new Error(
      "no provider/model available for summarization: set both BasicCompactionConfig summarization fields, route one request, or set both AgentOptions fields"
    );
  }
  const assembler = new import_dsh_llm.BlockAssembler();
  const messages = [
    ...input.messages,
    (0, import_dsh_util_values.deepFreeze)({
      role: "user",
      content: [{ type: "text", text: COMPACTION_INSTRUCTION }]
    })
  ];
  const options = {
    provider: target.provider,
    model: target.model,
    messages,
    toolHistory: agent.session.toolHistory(),
    ...input.tools === void 0 ? {} : { tools: [...input.tools] },
    maxTokens: config.maxTokens,
    sessionId: agent.session.id,
    purpose: "compaction",
    ...signal === void 0 ? {} : { signal }
  };
  for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk);
  const error = finishError(assembler.finish);
  if (error !== void 0) throw error;
  const rawOutput = assembler.blocks();
  const summary = summaryText(rawOutput);
  if (!summary.some((block) => block.text.trim().length > 0)) {
    throw new Error("summarization produced no text summary content");
  }
  return {
    summary,
    rawOutput,
    llmStreamCall: true,
    provider: options.provider,
    model: options.model,
    maxTokens: config.maxTokens,
    ...assembler.usage === void 0 ? {} : { usage: assembler.usage }
  };
}
function finishError(finish) {
  switch (finish.kind) {
    case "error":
    case "aborted": {
      return new import_dsh_llm.LlmError(finish.failure.message, finish.failure.code, finish.failure);
    }
    case "max-tokens": {
      const error = new Error("summarization truncated at the token cap (incomplete checkpoint)");
      error.code = "MAX_TOKENS";
      return error;
    }
    default:
      return void 0;
  }
}
function summaryText(blocks) {
  if ((0, import_dsh_llm.contentHasImage)(blocks)) {
    throw new import_dsh_llm.LlmError("compaction summary cannot contain image output", "UNSUPPORTED_CONTENT");
  }
  return blocks.filter((block) => block.type === "text");
}

// lib/host/metering-version.mjs
var ESTIMATOR_VERSION = 188839391552970;

// src/metering/estimate.mjs
var ROLE_OVERHEAD = 4;
var BLOCK_OVERHEAD = 4;
function estimateText(value) {
  const text = String(value ?? "");
  let ascii = 0, other = 0;
  for (const character of text) {
    if (character.codePointAt(0) < 128) ascii++;
    else other += /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u.test(character) ? 1 : Buffer.byteLength(character) / 2;
  }
  return Math.ceil(ascii / 4 + other);
}
function estimateStructuralBlock(block) {
  const { offloaded, ...reference } = block;
  return BLOCK_OVERHEAD + estimateText(JSON.stringify(block.type === "image" ? reference : block));
}
function estimateContent(blocks = [], { imagePricing, fileText } = {}) {
  const images = [];
  const collect = (blocks2) => {
    for (const block of blocks2) if (block.type === "image") images.push(block);
    else if (block.type === "tool-result") collect(block.content ?? []);
  };
  collect(blocks);
  const prices = imagePricing?.priceImages(images);
  if (prices && prices.length !== images.length) throw Error("Image pricing returned a mismatched occurrence count");
  let cursor = 0;
  const visit = (blocks2) => blocks2.reduce((total, block) => {
    if (block.type === "text" || block.type === "reasoning") return total + estimateText(block.text) + BLOCK_OVERHEAD;
    if (block.type === "tool-call") return total + estimateText(block.name) + estimateText(typeof block.arguments === "string" ? block.arguments : JSON.stringify(block.arguments)) + BLOCK_OVERHEAD;
    if (block.type === "tool-result") return total + visit(block.content ?? []) + BLOCK_OVERHEAD;
    if (block.type === "file" && fileText) return total + estimateText(fileText(block.attachment)) + BLOCK_OVERHEAD;
    if (block.type === "image" && prices) {
      const price = prices[cursor++];
      return total + price.visualTokens + estimateText(price.text) + BLOCK_OVERHEAD;
    }
    return total + estimateStructuralBlock(block);
  }, 0);
  return visit(blocks);
}
function estimateSystemMessage(message2) {
  if (!message2?.content?.length) return 0;
  return estimateText(message2.content.map((b) => b.type === "text" ? b.text : JSON.stringify(b)).join("")) + ROLE_OVERHEAD;
}
function estimateMessage(message2, pricing) {
  if (!message2) return 0;
  return message2.role === "system" ? estimateSystemMessage(message2) : estimateContent(message2.content ?? [], pricing) + ROLE_OVERHEAD;
}
function estimateToolsTokens(header) {
  return header?.tools?.length ? estimateText(JSON.stringify(header.tools)) + BLOCK_OVERHEAD : 0;
}
function measureRequest(request, pricing = {}) {
  const system = typeof request.system === "string" ? request.system : request.system ? JSON.stringify(request.system) : "";
  const systemTokens = system ? estimateText(system) + ROLE_OVERHEAD : 0;
  const toolsTokens = estimateToolsTokens(request);
  const messageTokens = (request.messages ?? []).reduce((n, m) => n + estimateMessage(m, pricing), 0);
  return Object.freeze({
    unit: "tokens",
    scope: "request-input",
    precision: "estimated",
    estimatorVersion: ESTIMATOR_VERSION,
    systemTokens,
    toolsTokens,
    messageTokens,
    tokens: systemTokens + toolsTokens + messageTokens
  });
}
function requestPricing(llm, route) {
  return {
    imagePricing: route && llm?.imageRequestPricing?.(route.provider, route.model),
    fileText: llm?.fileRequestText ? (ref) => llm.fileRequestText(ref) : void 0
  };
}
function inputBudget({ inputLimit = Infinity, contextWindow, maxTokens = 0, headroom = 0 } = {}) {
  for (const [key, value] of Object.entries({ inputLimit, contextWindow, maxTokens, headroom })) {
    if (value !== void 0 && value !== Infinity && (!Number.isSafeInteger(value) || value < 0)) throw Error(`Invalid token budget: ${key}`);
  }
  return Math.max(0, Math.min(inputLimit, contextWindow == null ? Infinity : contextWindow - maxTokens - headroom));
}

// src/context/materials.mjs
function materialText(blocks, seq) {
  return (blocks || []).map((b) => {
    if (b.type === "text") return b.text || "";
    if (b.type === "reasoning") return "[Earlier analysis; not verified facts]\n" + (b.text || "");
    if (b.type === "tool-call") return `${b.name}(${typeof b.arguments === "string" ? b.arguments : JSON.stringify(b.arguments)})`;
    if (b.type === "tool-result") return (b.isError ? "[error] " : "") + materialText(b.content, seq);
    return `[${b.type} attachment at event ${seq}${b.attachment?.name || b.name ? "; " + (b.attachment?.name || b.name) : ""}; content not supplied. The host retains the original.]`;
  }).join("\n");
}

// src/metering/compaction.mjs
var message = (text) => (0, import_dsh_llm2.createUserMessage)({ source: { kind: "plugin:oh-my-dsh:summary-material" }, content: [{ type: "text", text }] });
var Compaction = class extends import_dsh_compaction_basic.BasicCompactionEngine {
  constructor(ctx, config = {}) {
    super(ctx, { headroomTokens: 0, maxTokens: 65536, ...Object.fromEntries(Object.entries(config).filter(([, value]) => value !== void 0)) });
  }
  async summarize(input, agent, signal) {
    const latest = agent.session.requestHeader()?.config ?? agent.options;
    const override = this.config.modelPolicies.find((p) => p.provider === latest.provider && p.model === latest.model);
    const config = { ...this.config, ...override };
    const route = config.summarizationProvider ? { provider: config.summarizationProvider, model: config.summarizationModel } : latest;
    const info = await this.ctx.llm.resolveModelInfo(route.provider, route.model, signal);
    const capacity = info.context?.contextWindow;
    if (!capacity) throw Error("\u6458\u8981\u6A21\u578B\u6CA1\u6709\u53EF\u6838\u9A8C\u7684\u4E0A\u4E0B\u6587\u7A97\u53E3");
    const pricing = requestPricing(this.ctx.llm, route);
    const instruction = message(COMPACTION_INSTRUCTION);
    const measure = (messages, tools) => measureRequest({ ...route, messages: [...messages, instruction], tools }, pricing).tokens;
    const reserve = Math.max(1, Math.min(config.maxTokens, Math.floor(capacity / 8)));
    const limit = inputBudget({ contextWindow: capacity, maxTokens: reserve });
    const run = async (messages, tools) => {
      signal?.throwIfAborted();
      if (measure(messages, tools) > limit) throw Error("\u6458\u8981\u5B8C\u6574\u8BF7\u6C42\u8D85\u8FC7\u6A21\u578B\u8F93\u5165\u9884\u7B97");
      return summarizeWithLlm(this.ctx, { ...config, maxTokens: reserve }, { ...input, messages, tools }, agent, signal);
    };
    if (measure(input.messages, input.tools) <= limit) return run(input.messages, input.tools);
    let records = input.messages.map((m, index) => `[Conversation record ${index}; role ${m.role}]
${materialText(m.content, index)}`);
    let before = Infinity;
    for (; ; ) {
      const batches = [];
      let batch = [];
      for (const record of records) {
        let rest = record;
        while (rest) {
          if (measure([...batch, message(rest)]) <= limit) {
            batch.push(message(rest));
            break;
          }
          if (batch.length) {
            batches.push(batch);
            batch = [];
            continue;
          }
          let low = 0, high = rest.length;
          while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (measure([message(rest.slice(0, mid))]) <= limit) low = mid;
            else high = mid - 1;
          }
          if (low > 0 && /[\uD800-\uDBFF]/.test(rest[low - 1])) low--;
          if (!low) throw Error("\u6458\u8981\u6307\u4EE4\u672C\u8EAB\u8D85\u8FC7\u6A21\u578B\u8F93\u5165\u9884\u7B97");
          batches.push([message(rest.slice(0, low))]);
          rest = rest.slice(low);
        }
      }
      if (batch.length) batches.push(batch);
      const summaries = [];
      for (const batch2 of batches) {
        const result = await run(batch2);
        summaries.push(result.summary.map((b) => b.text ?? "").join("\n"));
      }
      const combined = summaries.map((text, i) => message(`[Partial checkpoint ${i + 1}/${summaries.length}]
${text}`));
      const size = measure(combined);
      if (size <= limit) return run(combined);
      if (size >= before) throw Error("\u5206\u6BB5\u6458\u8981\u672A\u6536\u655B\uFF0C\u4FDD\u7559\u539F\u6587");
      before = size;
      records = combined.map((m) => m.content[0].text);
    }
  }
};
return module.exports; }
