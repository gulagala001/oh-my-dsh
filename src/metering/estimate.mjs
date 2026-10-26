/** One estimator for model-visible content, shared by the host and plugins.
 * This is explicitly an estimate, never a provider receipt or a tokenizer.
 * ASCII and non-ASCII have different densities; transport/replay metadata is
 * excluded. Route-owned image/file projection supplies model-visible media.
 */
import { ESTIMATOR_VERSION } from '../../lib/host/metering-version.mjs';
export { ESTIMATOR_VERSION };
export const ROLE_OVERHEAD = 4;
export const BLOCK_OVERHEAD = 4;
export function estimateText(value) {
  const text = String(value ?? '');
  let ascii = 0, other = 0;
  for (const character of text) {
    if (character.codePointAt(0) < 128) ascii++;
    else other += /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u.test(character) ? 1 : Buffer.byteLength(character) / 2;
  }
  return Math.ceil(ascii / 4 + other);
}
export const textUpperBound = value => Buffer.byteLength(String(value ?? ''));
export function estimateStructuralBlock(block) {
  const { offloaded, ...reference } = block;
  return BLOCK_OVERHEAD + estimateText(JSON.stringify(block.type === 'image' ? reference : block));
}
export function estimateContent(blocks = [], { imagePricing, fileText } = {}) {
  const images = [];
  const collect = blocks => { for (const block of blocks) if (block.type === 'image') images.push(block); else if (block.type === 'tool-result') collect(block.content ?? []); };
  collect(blocks);
  const prices = imagePricing?.priceImages(images);
  if (prices && prices.length !== images.length) throw Error('Image pricing returned a mismatched occurrence count');
  let cursor = 0;
  const visit = blocks => blocks.reduce((total, block) => {
    if (block.type === 'text' || block.type === 'reasoning') return total + estimateText(block.text) + BLOCK_OVERHEAD;
    if (block.type === 'tool-call') return total + estimateText(block.name) + estimateText(typeof block.arguments === 'string' ? block.arguments : JSON.stringify(block.arguments)) + BLOCK_OVERHEAD;
    if (block.type === 'tool-result') return total + visit(block.content ?? []) + BLOCK_OVERHEAD;
    if (block.type === 'file' && fileText) return total + estimateText(fileText(block.attachment)) + BLOCK_OVERHEAD;
    if (block.type === 'image' && prices) { const price = prices[cursor++]; return total + price.visualTokens + estimateText(price.text) + BLOCK_OVERHEAD; }
    return total + estimateStructuralBlock(block);
  }, 0);
  return visit(blocks);
}
export function estimateSystemMessage(message) {
  if (!message?.content?.length) return 0;
  return estimateText(message.content.map(b => b.type === 'text' ? b.text : JSON.stringify(b)).join('')) + ROLE_OVERHEAD;
}
export function estimateMessage(message, pricing) {
  if (!message) return 0;
  return message.role === 'system' ? estimateSystemMessage(message) : estimateContent(message.content ?? [], pricing) + ROLE_OVERHEAD;
}
export function estimateToolsTokens(header) {
  return header?.tools?.length ? estimateText(JSON.stringify(header.tools)) + BLOCK_OVERHEAD : 0;
}
export function measureRequest(request, pricing = {}) {
  const system = typeof request.system === 'string' ? request.system : request.system ? JSON.stringify(request.system) : '';
  const systemTokens = system ? estimateText(system) + ROLE_OVERHEAD : 0;
  const toolsTokens = estimateToolsTokens(request);
  const messageTokens = (request.messages ?? []).reduce((n,m) => n + estimateMessage(m, pricing), 0);
  return Object.freeze({ unit: 'tokens', scope: 'request-input', precision: 'estimated', estimatorVersion: ESTIMATOR_VERSION,
    systemTokens, toolsTokens, messageTokens, tokens: systemTokens + toolsTokens + messageTokens });
}
export function requestPricing(llm, route) {
  return { imagePricing: route && llm?.imageRequestPricing?.(route.provider, route.model),
    fileText: llm?.fileRequestText ? ref => llm.fileRequestText(ref) : undefined };
}
export function inputBudget({ inputLimit = Infinity, contextWindow, maxTokens = 0, headroom = 0 } = {}) {
  for (const [key, value] of Object.entries({ inputLimit, contextWindow, maxTokens, headroom })) {
    if (value !== undefined && value !== Infinity && (!Number.isSafeInteger(value) || value < 0)) throw Error(`Invalid token budget: ${key}`);
  }
  return Math.max(0, Math.min(inputLimit, contextWindow == null ? Infinity : contextWindow - maxTokens - headroom));
}
export function assertRequestFits(request, limit, pricing) {
  const measurement = measureRequest(request, pricing);
  if (measurement.tokens > limit) throw Object.assign(Error(`完整请求预计 ${measurement.tokens} tokens，超过输入预算 ${limit}；原文保留`), { code: 'INPUT_BUDGET_EXCEEDED', measurement, limit });
  return measurement;
}

// Deliberately conservative reservation for text-only background jobs. This is
// a labelled upper estimate, separate from ordinary request measurement and
// from wire bytes. No replay state, event IDs or transport encoding is billed.
export function requestUpperBound(request) {
  const visible={system:request.system,tools:request.tools,messages:(request.messages??[]).map(m=>({role:m.role,content:m.content}))};
  return Object.freeze({unit:'tokens',scope:'request-input',precision:'upper-bound',estimatorVersion:ESTIMATOR_VERSION,
    tokens:textUpperBound(JSON.stringify(visible))+64});
}

// A replacement invalidates the provider prefix. Preview the newly estimated
// context, not the last measured total minus an unrelated local estimate.
export function replacementEstimate(measurement, removedTokens, addedTokens) {
  if(!Number.isFinite(measurement?.surfaceTokens))return null;
  return Math.max(0,measurement.surfaceTokens+(measurement.breakdown?.toolsTokens??0)-removedTokens+addedTokens);
}
