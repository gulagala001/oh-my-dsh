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

// src/metering/service.mjs
var service_exports = {};
__export(service_exports, {
  default: () => TokenMeter,
  usageProjection: () => usageProjection
});
module.exports = __toCommonJS(service_exports);
var import_dsh_session3 = require("@deepseek-ai/dsh-session");

// src/metering/route-stamp.mjs
var import_node_crypto = require("node:crypto");

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
function estimateSystemMessage(message) {
  if (!message?.content?.length) return 0;
  return estimateText(message.content.map((b) => b.type === "text" ? b.text : JSON.stringify(b)).join("")) + ROLE_OVERHEAD;
}
function estimateMessage(message, pricing) {
  if (!message) return 0;
  return message.role === "system" ? estimateSystemMessage(message) : estimateContent(message.content ?? [], pricing) + ROLE_OVERHEAD;
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

// src/metering/route-stamp.mjs
function createRouteStamps(ctx) {
  const runtime = (0, import_node_crypto.randomUUID)(), cache = /* @__PURE__ */ new Map();
  let revision = 0;
  const invalidate = () => {
    revision++;
    cache.clear();
  };
  ctx.on("llm/adapters-updated", invalidate, { global: true, prepend: true });
  ctx.on("settings/document-updated", () => cache.clear(), { global: true, prepend: true });
  return (route) => {
    const llm = ctx.get("llm");
    if (!llm || !route) return null;
    const key = JSON.stringify([route.provider, route.model]);
    if (cache.has(key)) return cache.get(key);
    const entry = llm.listConfigurableProviders?.().find((p) => p.provider === route.provider);
    const settings = ctx.get("settings");
    let value = entry && settings?.describe?.().find((document) => document.ns === entry.settingsNs)?.value;
    for (const key2 of entry?.settingsPath ?? []) value = value?.[key2];
    const source = value === void 0 ? { runtime, revision } : { settingsNs: entry.settingsNs, settingsPath: entry.settingsPath, value };
    const stamp = (0, import_node_crypto.createHash)("sha256").update(JSON.stringify([ESTIMATOR_VERSION, route.provider, route.model, source])).digest("hex");
    cache.set(key, stamp);
    return stamp;
  };
}

// src/metering/stream.mjs
var import_node_crypto2 = require("node:crypto");

// src/metering/usage.mjs
var USAGE_FIELDS = Object.freeze(["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens", "totalTokens"]);
var tokenNumber = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
function reportedUsage(usage, hasOutput = false) {
  if (usage?.measurement === "unknown") return null;
  const values = USAGE_FIELDS.map((key) => tokenNumber(usage?.[key]));
  if (!values.some((value) => value !== null)) return null;
  if (usage?.measurement !== "reported" && hasOutput && values.every((value) => value === null || value === 0)) return null;
  if (usage?.measurement !== "reported" && hasOutput && usage?.outputTokens === 0)
    return { ...usage, outputTokens: void 0, totalTokens: void 0 };
  return usage;
}
function usageReceipt(raw, { hasOutput = false } = {}) {
  const usage = reportedUsage(raw, hasOutput);
  const buckets = Object.fromEntries(USAGE_FIELDS.map((key) => [key, tokenNumber(usage?.[key])]));
  const inputKeys = ["inputTokens", "cacheReadTokens", "cacheWriteTokens"];
  const knownInput = inputKeys.some((key) => buckets[key] !== null) ? inputKeys.reduce((n, key) => n + (buckets[key] ?? 0), 0) : null;
  const splitInput = inputKeys.every((key) => buckets[key] !== null) ? knownInput : null;
  const output = buckets.outputTokens, reportedTotal = buckets.totalTokens;
  const derivedInput = reportedTotal !== null && output !== null && reportedTotal >= output ? reportedTotal - output : null;
  const invalid = raw && raw.measurement !== "unknown" && USAGE_FIELDS.some((key) => raw[key] != null && tokenNumber(raw[key]) === null);
  const inconsistent = Boolean(invalid) || reportedTotal !== null && knownInput !== null && knownInput + (output ?? 0) > reportedTotal || reportedTotal !== null && output !== null && reportedTotal < output || derivedInput !== null && knownInput !== null && knownInput > derivedInput || derivedInput !== null && splitInput !== null && derivedInput !== splitInput || buckets.reasoningTokens !== null && output !== null && buckets.reasoningTokens > output;
  const input = inconsistent ? null : derivedInput ?? splitInput;
  const total = inconsistent ? null : reportedTotal ?? (input !== null && output !== null ? input + output : null);
  const knownTotal = total ?? (knownInput !== null || output !== null ? (knownInput ?? 0) + (output ?? 0) : null);
  const complete = total !== null && input !== null && output !== null;
  return Object.freeze({
    ...buckets,
    totalTokens: total,
    inputTotalTokens: input,
    knownInputTokens: inconsistent ? null : input ?? knownInput,
    knownTotalTokens: inconsistent ? null : knownTotal,
    complete,
    inconsistent,
    precision: inconsistent ? "inconsistent" : total !== null ? "reported" : knownTotal !== null ? "lower-bound" : "unknown"
  });
}
function usageContribution(raw, options) {
  const r = usageReceipt(raw, options);
  if (r.inconsistent) return usageContribution(null);
  const cacheMeasured = r.inputTotalTokens !== null && r.inputTotalTokens > 0 && r.cacheReadTokens !== null && !r.inconsistent;
  return {
    uncachedInputTokens: r.inputTokens ?? 0,
    outputTokens: r.outputTokens ?? 0,
    cacheReadTokens: r.cacheReadTokens ?? 0,
    cacheWriteTokens: r.cacheWriteTokens ?? 0,
    knownInputTokens: r.knownInputTokens ?? 0,
    knownTotalTokens: r.knownTotalTokens ?? 0,
    inputUnreported: Number(r.inputTotalTokens === null),
    totalUnreported: Number(r.totalTokens === null),
    inputBucketUnreported: Number(r.inputTokens === null),
    outputUnreported: Number(r.outputTokens === null),
    cacheUnreported: Number(r.cacheReadTokens === null),
    cacheWriteUnreported: Number(r.cacheWriteTokens === null),
    usageUnreported: Number(r.knownTotalTokens === null),
    inputKnownUnreported: Number(r.knownInputTokens === null),
    calls: 1,
    cacheMeasuredCalls: Number(cacheMeasured),
    cacheMeasuredInputTokens: cacheMeasured ? r.inputTotalTokens : 0,
    cacheMeasuredReadTokens: cacheMeasured ? r.cacheReadTokens : 0
  };
}
var USAGE_TOTAL_KEYS = Object.freeze(Object.keys(usageContribution(null)));
var emptyUsageTotals = () => Object.fromEntries(USAGE_TOTAL_KEYS.map((key) => [key, 0]));
function replaceUsageContribution(totals, previous, next) {
  return Object.fromEntries(USAGE_TOTAL_KEYS.map((key) => [key, (totals[key] ?? 0) - (previous?.[key] ?? 0) + (next?.[key] ?? 0)]));
}
function usageTotalsView(totals) {
  const view = { ...totals };
  if (totals.calls > 0) {
    for (const [field, missing] of Object.entries({ knownTotalTokens: "usageUnreported", knownInputTokens: "inputKnownUnreported" }))
      if (totals[missing] === totals.calls) view[field] = null;
  }
  return view;
}

// src/metering/stream.mjs
var USAGE_OWNER = Symbol.for("omd.usage-owner.v1");
async function* receiptStream(stream, settle) {
  const id = (0, import_node_crypto2.randomUUID)(), startedAt = Date.now();
  let hasOutput = false, usage, finish, error;
  try {
    for await (const chunk of stream) {
      hasOutput ||= chunk.type === "text-delta" || chunk.type === "reasoning-delta" ? Boolean(chunk.text) : chunk.type === "tool-call-delta" ? Boolean(chunk.name || chunk.argumentsDelta || chunk.id) : chunk.type === "block-end";
      if (chunk.type === "finish") finish = chunk.reason;
      if (chunk.type !== "usage") {
        yield chunk;
        continue;
      }
      const receipt = usageReceipt(chunk.usage, { hasOutput });
      if (receipt.inconsistent || receipt.knownTotalTokens === null || receipt.knownTotalTokens === 0 && chunk.usage?.measurement !== "reported") continue;
      usage = { ...chunk.usage };
      for (const key of USAGE_FIELDS) if (receipt[key] === null) delete usage[key];
      else usage[key] = receipt[key];
      yield { ...chunk, usage };
    }
  } catch (cause) {
    error = cause;
    throw cause;
  } finally {
    settle?.({ id, startedAt, durationMs: Date.now() - startedAt, hasOutput, usage, finish, error });
  }
}

// src/metering/service.mjs
var import_cordis = require("@deepseek-ai/cordis");
var import_dsh_llm2 = require("@deepseek-ai/dsh-llm");
var import_zod = require("zod");

// src/metering/context.mjs
var import_dsh_session2 = require("@deepseek-ai/dsh-session");
var import_dsh_llm = require("@deepseek-ai/dsh-llm");

// lib/host/token-meter-core.mjs
var import_dsh_session = require("@deepseek-ai/dsh-session");
var ROLE_OVERHEAD2 = 4;
var BLOCK_OVERHEAD2 = 4;
function estimateText2(value) {
  const text = String(value ?? "");
  let ascii = 0, other = 0;
  for (const character of text) {
    if (character.codePointAt(0) < 128) ascii++;
    else other += /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u.test(character) ? 1 : Buffer.byteLength(character) / 2;
  }
  return Math.ceil(ascii / 4 + other);
}
function estimateStructuralBlock2(block) {
  const { offloaded, ...reference } = block;
  return BLOCK_OVERHEAD2 + estimateText2(JSON.stringify(block.type === "image" ? reference : block));
}
function estimateContent2(blocks = [], { imagePricing, fileText } = {}) {
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
    if (block.type === "text" || block.type === "reasoning") return total + estimateText2(block.text) + BLOCK_OVERHEAD2;
    if (block.type === "tool-call") return total + estimateText2(block.name) + estimateText2(typeof block.arguments === "string" ? block.arguments : JSON.stringify(block.arguments)) + BLOCK_OVERHEAD2;
    if (block.type === "tool-result") return total + visit(block.content ?? []) + BLOCK_OVERHEAD2;
    if (block.type === "file" && fileText) return total + estimateText2(fileText(block.attachment)) + BLOCK_OVERHEAD2;
    if (block.type === "image" && prices) {
      const price = prices[cursor++];
      return total + price.visualTokens + estimateText2(price.text) + BLOCK_OVERHEAD2;
    }
    return total + estimateStructuralBlock2(block);
  }, 0);
  return visit(blocks);
}
function estimateSystemMessage2(message) {
  if (!message?.content?.length) return 0;
  return estimateText2(message.content.map((b) => b.type === "text" ? b.text : JSON.stringify(b)).join("")) + ROLE_OVERHEAD2;
}
function estimateMessage2(message, pricing) {
  if (!message) return 0;
  return message.role === "system" ? estimateSystemMessage2(message) : estimateContent2(message.content ?? [], pricing) + ROLE_OVERHEAD2;
}
function collectProjectedAttachments(blocks, images, files) {
  let imageTokens = 0;
  let fileTokens = 0;
  for (const block of blocks) {
    if (block.type === "image") {
      images.push(block);
      imageTokens += estimateStructuralBlock2(block);
    } else if (block.type === "file") {
      files.push(block.attachment);
      fileTokens += estimateStructuralBlock2(block);
    }
  }
  return { imageTokens, fileTokens };
}
function analyzeNode(seq, message) {
  if (message === null) {
    return {
      seq,
      heuristicTokens: 0,
      imageStructuralTokens: 0,
      fileStructuralTokens: 0,
      images: [],
      files: []
    };
  }
  const heuristicTokens = estimateMessage2(message);
  const images = [];
  const files = [];
  const structural = collectProjectedAttachments(message.content, images, files);
  return {
    seq,
    heuristicTokens,
    imageStructuralTokens: structural.imageTokens,
    fileStructuralTokens: structural.fileTokens,
    images,
    files
  };
}
function planSurfaceTokens(nodes, event) {
  const node2 = analyzeNode(event.seq, (0, import_dsh_session.deriveEventMessage)(event));
  const tokens = node2.heuristicTokens;
  const op = event.surfaceOp;
  if (op === "append") {
    return { tokens, deltaTokens: tokens, node: node2, target: "append" };
  }
  const startIdx = nodes.findIndex((candidate) => candidate.seq === op.startSeq);
  const endIdx = nodes.findIndex((candidate) => candidate.seq === op.endSeq);
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
    throw new Error(
      `token surface: replace at seq ${event.seq} has invalid current range ${op.startSeq}-${op.endSeq}`
    );
  }
  const removed = nodes.slice(startIdx, endIdx + 1).reduce((total, candidate) => total + candidate.heuristicTokens, 0);
  return { tokens, deltaTokens: tokens - removed, node: node2, target: { startIdx, endIdx } };
}
function commitSurfaceTokens(nodes, plan) {
  if (plan.target === "append") {
    nodes.push(plan.node);
    return;
  }
  nodes.splice(plan.target.startIdx, plan.target.endIdx - plan.target.startIdx + 1, plan.node);
}
function priceSurface(nodes, pricing, fileText) {
  const images = pricing === void 0 ? [] : nodes.flatMap((node2) => node2.images);
  const hasFiles = fileText !== void 0 && nodes.some((node2) => node2.files.length > 0);
  if ((pricing === void 0 || images.length === 0) && !hasFiles) {
    let surfaceTokens2 = 0;
    const publicNodes2 = nodes.map((node2) => {
      surfaceTokens2 += node2.heuristicTokens;
      return { seq: node2.seq, tokens: node2.heuristicTokens, heuristicTokens: node2.heuristicTokens };
    });
    return { nodes: publicNodes2, surfaceTokens: surfaceTokens2 };
  }
  const prices = pricing === void 0 ? [] : pricing.priceImages(images);
  if (pricing !== void 0 && prices.length !== images.length) {
    throw new Error(
      `token meter: route image pricing answered ${prices.length} prices for ${images.length} occurrences`
    );
  }
  let cursor = 0;
  let surfaceTokens = 0;
  const publicNodes = nodes.map((node2) => {
    let tokens = node2.heuristicTokens;
    if (fileText !== void 0 && node2.files.length > 0) {
      tokens -= node2.fileStructuralTokens;
      for (const file of node2.files) {
        tokens += estimateContent2([{ type: "text", text: fileText(file) }]);
      }
    }
    if (pricing !== void 0 && node2.images.length > 0) {
      tokens -= node2.imageStructuralTokens;
      for (let occurrence = 0; occurrence < node2.images.length; occurrence += 1) {
        const price = prices[cursor];
        cursor += 1;
        tokens += price.visualTokens + estimateContent2([{ type: "text", text: price.text }]);
      }
    }
    surfaceTokens += tokens;
    return { seq: node2.seq, tokens, heuristicTokens: node2.heuristicTokens };
  });
  return { nodes: publicNodes, surfaceTokens };
}

// src/metering/context.mjs
var REQUEST_METER_RECORD = "plugin:oh-my-dsh/request-meter";
var emptyContext = () => ({ revision: 0, header: null, nodes: [], anchor: null, contextWindow: null, requestStamp: null });
var sameHeader = (a, b) => a === null || b === null ? a === b : (0, import_dsh_session2.headerEquals)(a, b);
function foldContext(state, event) {
  let next = state;
  if (event.type === REQUEST_METER_RECORD && (typeof event.data.stamp === "string" || event.data.stamp === null)) {
    next = { ...state, requestStamp: event.data.stamp, anchor: state.anchor?.stamp === event.data.stamp ? state.anchor : null };
  } else if (event.type === "request/header") {
    const header = (0, import_dsh_session2.canonicalHeader)(event.data.header);
    next = { ...state, header, anchor: sameHeader(state.header, header) ? state.anchor : null };
  } else if (event.type === "request/context") next = { ...state, contextWindow: event.data.contextWindow ?? null };
  else if (event.type === "image/offload") {
    const targets = new Map(event.data.targets.map((t) => [t.seq, new Set(t.imageIndexes)]));
    next = { ...state, anchor: null, nodes: state.nodes.map((node2) => !targets.has(node2.seq) ? node2 : {
      ...node2,
      images: node2.images.map((image, index) => targets.get(node2.seq).has(index) ? { ...image, offloaded: true } : image)
    }) };
  }
  if ((0, import_dsh_session2.isSurfaceEvent)(event)) {
    const plan = planSurfaceTokens(next.nodes, event);
    const nodes = [...next.nodes];
    commitSurfaceTokens(nodes, plan);
    const message = (0, import_dsh_session2.deriveEventMessage)(event);
    const node2 = nodes.find((n) => n.seq === event.seq);
    node2.role = message?.role ?? null;
    let anchor = event.surfaceOp === "append" ? next.anchor : null;
    if (event.type === "assistant/message" && event.data.message?.source?.kind === "model") {
      const receipt = usageReceipt(
        event.data.usage ?? (0, import_dsh_llm.lastAssistantStreamChunk)(event.data.stream, "usage")?.usage,
        { hasOutput: Boolean(message?.content?.length) }
      );
      anchor = receipt.inputTotalTokens === null ? null : {
        header: next.header,
        inputTokens: receipt.inputTotalTokens,
        nodes: next.nodes,
        at: event.seq,
        stamp: next.requestStamp
      };
    }
    next = { ...next, nodes, anchor };
  }
  return next === state ? state : { ...next, revision: event.seq + 1 };
}
function measureContext(state, { header = state.header, pricing } = {}) {
  const surface = priceSurface(state.nodes, pricing?.imagePricing, pricing?.fileText);
  const toolsTokens = estimateToolsTokens(header);
  const anchor = state.anchor;
  const anchored = anchor && sameHeader(anchor.header, header);
  const anchorSurface = anchored ? priceSurface(anchor.nodes, pricing?.imagePricing, pricing?.fileText).surfaceTokens : 0;
  const baseline = anchored ? { kind: "usage", tokens: anchor.inputTokens } : { kind: state.nodes.length || header ? "estimated" : "none", tokens: surface.surfaceTokens + toolsTokens };
  const surfaceDeltaTokens = anchored ? surface.surfaceTokens - anchorSurface : 0;
  const totalTokens = Math.max(0, baseline.tokens + surfaceDeltaTokens);
  const systemNode = [...state.nodes].reverse().find((node2) => node2.role === "system" && node2.heuristicTokens > 0);
  const systemTokens = systemNode ? surface.nodes.find((node2) => node2.seq === systemNode.seq).tokens : 0;
  const breakdown = { systemTokens, toolsTokens, messageTokens: surface.surfaceTokens - systemTokens };
  return {
    unit: "tokens",
    scope: "retained-context",
    precision: anchored ? "reported-prefix+estimated-tail" : "estimated",
    estimatorVersion: ESTIMATOR_VERSION,
    logRevision: state.revision,
    baseline,
    surfaceDeltaTokens,
    totalTokens,
    surfaceTokens: surface.surfaceTokens,
    nodes: surface.nodes,
    breakdown,
    unallocatedTokens: totalTokens - surface.surfaceTokens - toolsTokens
  };
}

// src/metering/service.mjs
var count = import_zod.z.number().int().nonnegative();
var node = import_zod.z.object({
  seq: count,
  heuristicTokens: count,
  imageStructuralTokens: count,
  fileStructuralTokens: count,
  images: import_zod.z.array(import_zod.z.unknown()),
  files: import_zod.z.array(import_zod.z.unknown()),
  role: import_zod.z.string().nullable().optional()
});
var contextState = import_zod.z.object({
  revision: count,
  header: import_zod.z.unknown(),
  nodes: import_zod.z.array(node),
  contextWindow: count.nullable(),
  requestStamp: import_zod.z.string().nullable(),
  anchor: import_zod.z.object({ header: import_zod.z.unknown(), inputTokens: count, nodes: import_zod.z.array(node), at: count, stamp: import_zod.z.string().nullable() }).nullable()
});
var contextView = (state, measurement) => {
  return {
    projectedTokens: measurement.totalTokens,
    ...measurement.baseline.kind === "usage" ? { pressureTokens: measurement.baseline.tokens } : {},
    ...state.contextWindow ? { contextWindow: state.contextWindow } : {}
  };
};
var usageKeys = USAGE_TOTAL_KEYS;
var zeroUsage = emptyUsageTotals;
var usageSchema = import_zod.z.object(Object.fromEntries(usageKeys.map((key) => [key, count])));
var usageProjection = {
  key: "tokenUsage",
  stateVersion: ESTIMATOR_VERSION,
  stateSchema: import_zod.z.object({ totals: usageSchema, last: import_zod.z.object({ turn: count, step: count, buckets: usageSchema }).nullable() }),
  init: () => ({ totals: zeroUsage(), last: null }),
  apply(state, event) {
    if (event.type === "llm/retry-started") return { ...state, last: null };
    if (!["assistant/message", "assistant/attempt"].includes(event.type)) return state;
    const buckets = usageContribution(event.data.usage ?? (0, import_dsh_llm2.lastAssistantStreamChunk)(event.data.stream ?? [], "usage")?.usage, { hasOutput: Boolean(event.data.message?.content?.length) });
    const { turn, step } = event.data;
    const previous = state.last?.turn === turn && state.last?.step === step ? state.last.buckets : zeroUsage();
    return { totals: replaceUsageContribution(state.totals, previous, buckets), last: { turn, step, buckets } };
  },
  wire: { viewSchema: usageSchema.extend(Object.fromEntries(["knownTotalTokens", "knownInputTokens", "uncachedInputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"].map((key) => [key, count.nullable()]))), view: (state) => usageTotalsView(state.totals) }
};
var TokenMeter = class extends import_cordis.Service {
  static inject = ["sessionProjections"];
  constructor(ctx, config = {}) {
    super(ctx, "tokenMeter");
    if (Object.keys(config).length) throw Error("Token meter has no configurable density or byte/token conversion");
    this.routeStamp = createRouteStamps(ctx);
    this.receipts = /* @__PURE__ */ new WeakMap();
    ctx.on("llm/stream", (request, next) => {
      const session = (0, import_dsh_llm2.isAgentLoopRequest)(request) && request.sessionId ? ctx.get("sessions")?.get?.(request.sessionId) : null;
      if (session) (0, import_dsh_session3.appendPluginRecord)(session, REQUEST_METER_RECORD, { stamp: this.routeStamp(request), estimatorVersion: ESTIMATOR_VERSION });
      const step = session?.snapshotEvents().findLast((event) => event.type === "step/start")?.data;
      return receiptStream(next(), (receipt) => {
        if (session && step) this.receipts.set(session, { ...receipt, turn: step.turn, step: step.step });
        if (!request[USAGE_OWNER] && request.purpose === "compaction" && request.sessionId)
          ctx.emit("token-meter/receipt", { request, receipt });
      });
    }, { global: true });
    const reading = (state) => this.reading(state);
    ctx.sessionProjections.register({
      key: "contextPressure",
      stateVersion: ESTIMATOR_VERSION,
      stateSchema: contextState,
      init: emptyContext,
      apply: foldContext,
      wire: { viewSchema: import_zod.z.object({ projectedTokens: count, pressureTokens: count.optional(), contextWindow: count.optional() }), view: (state) => contextView(state, reading(state)) }
    });
    ctx.sessionProjections.register({
      key: "contextBreakdown",
      stateVersion: ESTIMATOR_VERSION,
      stateSchema: contextState,
      init: emptyContext,
      apply: foldContext,
      wire: { viewSchema: import_zod.z.object({ systemTokens: count, toolsTokens: count, messageTokens: count }), view: (state) => reading(state).breakdown }
    });
    ctx.sessionProjections.register(usageProjection);
  }
  measure(session, requestHeader) {
    const state = this.ctx.sessionProjections.stateOf(session, "contextPressure");
    const header = requestHeader === void 0 ? state.header : (0, import_dsh_session3.canonicalHeader)(requestHeader);
    return Object.freeze(this.reading(state, header));
  }
  reading(state, header = state.header) {
    const stamp = this.routeStamp(header?.config);
    const current = state.anchor?.stamp === stamp ? state : { ...state, anchor: null };
    return measureContext(current, { header, pricing: requestPricing(this.ctx.get("llm"), header?.config) });
  }
  receiptFor(session, event) {
    const fact = this.receipts.get(session);
    if (!fact || fact.turn !== event.data.turn || fact.step !== event.data.step) return null;
    fact.eventSeq ??= event.seq;
    return fact;
  }
  estimateMessage(message, pricing) {
    return estimateMessage(message, pricing);
  }
  measureRequest(request) {
    return measureRequest(request, requestPricing(this.ctx.get("llm"), request));
  }
  receipt(usage, options) {
    return usageReceipt(usage, options);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  usageProjection
});
return module.exports; }
