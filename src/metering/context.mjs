import { canonicalHeader, deriveEventMessage, isSurfaceEvent, headerEquals } from '@deepseek-ai/dsh-session';
import { lastAssistantStreamChunk } from '@deepseek-ai/dsh-llm';
import { planSurfaceTokens, commitSurfaceTokens, priceSurface } from '../../lib/host/token-meter-core.mjs';
import { estimateToolsTokens, ESTIMATOR_VERSION } from './estimate.mjs';
import { usageReceipt } from './usage.mjs';

export const REQUEST_METER_RECORD='plugin:oh-my-dsh/request-meter';
export const emptyContext = () => ({ revision: 0, header: null, nodes: [], anchor: null, contextWindow: null, requestStamp:null });
const sameHeader = (a,b) => a === null || b === null ? a === b : headerEquals(a,b);
export function foldContext(state, event) {
  let next = state;
  if(event.type===REQUEST_METER_RECORD && (typeof event.data.stamp==='string'||event.data.stamp===null)) {
    next={...state,requestStamp:event.data.stamp,anchor:state.anchor?.stamp===event.data.stamp?state.anchor:null};
  } else if (event.type === 'request/header') {
    const header = canonicalHeader(event.data.header);
    next = { ...state, header, anchor: sameHeader(state.header, header) ? state.anchor : null };
  } else if (event.type === 'request/context') next = { ...state, contextWindow: event.data.contextWindow ?? null };
  else if (event.type === 'image/offload') {
    const targets = new Map(event.data.targets.map(t => [t.seq, new Set(t.imageIndexes)]));
    next = { ...state, anchor: null, nodes: state.nodes.map(node => !targets.has(node.seq) ? node : {
      ...node, images: node.images.map((image,index) => targets.get(node.seq).has(index) ? { ...image, offloaded: true } : image) }) };
  }
  if (isSurfaceEvent(event)) {
    const plan = planSurfaceTokens(next.nodes, event);
    const nodes = [...next.nodes]; commitSurfaceTokens(nodes, plan);
    const message = deriveEventMessage(event);
    const node = nodes.find(n => n.seq === event.seq);
    node.role = message?.role ?? null;
    let anchor = event.surfaceOp === 'append' ? next.anchor : null;
    if (event.type === 'assistant/message' && event.data.message?.source?.kind === 'model') {
      const receipt = usageReceipt(event.data.usage ?? lastAssistantStreamChunk(event.data.stream, 'usage')?.usage,
        { hasOutput: Boolean(message?.content?.length) });
      // Only the measured INPUT is reusable. Generated output need not be
      // replayed verbatim (reasoning, signatures and tool conversion differ).
      anchor = receipt.inputTotalTokens === null ? null : { header: next.header, inputTokens: receipt.inputTotalTokens,
        nodes: next.nodes, at: event.seq, stamp:next.requestStamp };
    }
    next = { ...next, nodes, anchor };
  }
  return next === state ? state : { ...next, revision: event.seq + 1 };
}
export function measureContext(state, { header = state.header, pricing } = {}) {
  const surface = priceSurface(state.nodes, pricing?.imagePricing, pricing?.fileText);
  const toolsTokens = estimateToolsTokens(header);
  const anchor = state.anchor;
  const anchored = anchor && sameHeader(anchor.header, header);
  const anchorSurface = anchored ? priceSurface(anchor.nodes, pricing?.imagePricing, pricing?.fileText).surfaceTokens : 0;
  const baseline = anchored ? { kind: 'usage', tokens: anchor.inputTokens } : { kind: state.nodes.length || header ? 'estimated' : 'none', tokens: surface.surfaceTokens + toolsTokens };
  const surfaceDeltaTokens = anchored ? surface.surfaceTokens - anchorSurface : 0;
  const totalTokens = Math.max(0, baseline.tokens + surfaceDeltaTokens);
  const systemNode = [...state.nodes].reverse().find(node => node.role === 'system' && node.heuristicTokens > 0);
  const systemTokens = systemNode ? surface.nodes.find(node => node.seq === systemNode.seq).tokens : 0;
  const breakdown = { systemTokens, toolsTokens, messageTokens: surface.surfaceTokens - systemTokens };
  return { unit: 'tokens', scope: 'retained-context', precision: anchored ? 'reported-prefix+estimated-tail' : 'estimated',
    estimatorVersion: ESTIMATOR_VERSION, logRevision: state.revision, baseline, surfaceDeltaTokens, totalTokens,
    surfaceTokens: surface.surfaceTokens, nodes: surface.nodes, breakdown,
    unallocatedTokens: totalTokens - surface.surfaceTokens - toolsTokens };
}
