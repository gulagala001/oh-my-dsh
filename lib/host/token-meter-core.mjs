// src/metering/native/surface-fold.ts
import { deriveEventMessage } from "@deepseek-ai/dsh-session";

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

// src/metering/native/surface-fold.ts
function collectProjectedAttachments(blocks, images, files) {
  let imageTokens = 0;
  let fileTokens = 0;
  for (const block of blocks) {
    if (block.type === "image") {
      images.push(block);
      imageTokens += estimateStructuralBlock(block);
    } else if (block.type === "file") {
      files.push(block.attachment);
      fileTokens += estimateStructuralBlock(block);
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
  const heuristicTokens = estimateMessage(message);
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
  const node = analyzeNode(event.seq, deriveEventMessage(event));
  const tokens = node.heuristicTokens;
  const op = event.surfaceOp;
  if (op === "append") {
    return { tokens, deltaTokens: tokens, node, target: "append" };
  }
  const startIdx = nodes.findIndex((candidate) => candidate.seq === op.startSeq);
  const endIdx = nodes.findIndex((candidate) => candidate.seq === op.endSeq);
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
    throw new Error(
      `token surface: replace at seq ${event.seq} has invalid current range ${op.startSeq}-${op.endSeq}`
    );
  }
  const removed = nodes.slice(startIdx, endIdx + 1).reduce((total, candidate) => total + candidate.heuristicTokens, 0);
  return { tokens, deltaTokens: tokens - removed, node, target: { startIdx, endIdx } };
}
function commitSurfaceTokens(nodes, plan) {
  if (plan.target === "append") {
    nodes.push(plan.node);
    return;
  }
  nodes.splice(plan.target.startIdx, plan.target.endIdx - plan.target.startIdx + 1, plan.node);
}

// src/metering/native/route-pricing.ts
function priceSurface(nodes, pricing, fileText) {
  const images = pricing === void 0 ? [] : nodes.flatMap((node) => node.images);
  const hasFiles = fileText !== void 0 && nodes.some((node) => node.files.length > 0);
  if ((pricing === void 0 || images.length === 0) && !hasFiles) {
    let surfaceTokens2 = 0;
    const publicNodes2 = nodes.map((node) => {
      surfaceTokens2 += node.heuristicTokens;
      return { seq: node.seq, tokens: node.heuristicTokens, heuristicTokens: node.heuristicTokens };
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
  const publicNodes = nodes.map((node) => {
    let tokens = node.heuristicTokens;
    if (fileText !== void 0 && node.files.length > 0) {
      tokens -= node.fileStructuralTokens;
      for (const file of node.files) {
        tokens += estimateContent([{ type: "text", text: fileText(file) }]);
      }
    }
    if (pricing !== void 0 && node.images.length > 0) {
      tokens -= node.imageStructuralTokens;
      for (let occurrence = 0; occurrence < node.images.length; occurrence += 1) {
        const price = prices[cursor];
        cursor += 1;
        tokens += price.visualTokens + estimateContent([{ type: "text", text: price.text }]);
      }
    }
    surfaceTokens += tokens;
    return { seq: node.seq, tokens, heuristicTokens: node.heuristicTokens };
  });
  return { nodes: publicNodes, surfaceTokens };
}
export {
  commitSurfaceTokens,
  planSurfaceTokens,
  priceSurface
};
