import { appendPluginRecord,canonicalHeader } from '@deepseek-ai/dsh-session';
import { createRouteStamps } from './route-stamp.mjs';
import { receiptStream, USAGE_OWNER } from './stream.mjs';
import { Service } from '@deepseek-ai/cordis';
import { lastAssistantStreamChunk, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { z } from 'zod';
import { emptyContext, foldContext, measureContext, REQUEST_METER_RECORD } from './context.mjs';
import { estimateMessage, measureRequest, requestPricing, ESTIMATOR_VERSION } from './estimate.mjs';
import { usageReceipt, usageContribution, USAGE_TOTAL_KEYS, emptyUsageTotals, replaceUsageContribution, usageTotalsView } from './usage.mjs';

const count = z.number().int().nonnegative();
const node = z.object({ seq: count, heuristicTokens: count, imageStructuralTokens: count, fileStructuralTokens: count,
  images: z.array(z.unknown()), files: z.array(z.unknown()), role: z.string().nullable().optional() });
const contextState = z.object({ revision: count, header: z.unknown(), nodes: z.array(node), contextWindow: count.nullable(), requestStamp:z.string().nullable(),
  anchor: z.object({ header: z.unknown(), inputTokens: count, nodes: z.array(node), at: count,stamp:z.string().nullable() }).nullable() });
const contextView = (state, measurement) => {
  return { projectedTokens: measurement.totalTokens, ...(measurement.baseline.kind === 'usage' ? { pressureTokens: measurement.baseline.tokens } : {}),
    ...(state.contextWindow ? { contextWindow: state.contextWindow } : {}) };
};
const usageKeys = USAGE_TOTAL_KEYS;
const zeroUsage = emptyUsageTotals;
const usageSchema = z.object(Object.fromEntries(usageKeys.map(key => [key,count])));
export const usageProjection = {
  key: 'tokenUsage', stateVersion: ESTIMATOR_VERSION,
  stateSchema: z.object({ totals: usageSchema, last: z.object({ turn: count, step: count, buckets: usageSchema }).nullable() }),
  init: () => ({ totals: zeroUsage(), last: null }),
  apply(state,event) {
    if (event.type === 'llm/retry-started') return { ...state, last: null };
    if (!['assistant/message','assistant/attempt'].includes(event.type)) return state;
    const buckets=usageContribution(event.data.usage ?? lastAssistantStreamChunk(event.data.stream ?? [],'usage')?.usage,{hasOutput:Boolean(event.data.message?.content?.length)});
    const { turn, step } = event.data;
    const previous = state.last?.turn === turn && state.last?.step === step ? state.last.buckets : zeroUsage();
    return { totals: replaceUsageContribution(state.totals,previous,buckets), last: { turn,step,buckets } };
  },
  wire: { viewSchema: usageSchema.extend(Object.fromEntries(['knownTotalTokens','knownInputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens'].map(key=>[key,count.nullable()]))), view: state => usageTotalsView(state.totals) },
};
/** Mounted in place of the stock token-meter, using the same public service,
 * projection registry, native surface transitions and route image pricing.
 * There is no secondary session log, SDK instance or runtime method patch.
 */
export default class TokenMeter extends Service {
  static inject = ['sessionProjections'];
  constructor(ctx, config = {}) {
    super(ctx,'tokenMeter');
    if (Object.keys(config).length) throw Error('Token meter has no configurable density or byte/token conversion');
    this.routeStamp=createRouteStamps(ctx);
    this.receipts=new WeakMap();
    ctx.on('llm/stream', (request,next) => {
      const session=isAgentLoopRequest(request)&&request.sessionId?ctx.get('sessions')?.get?.(request.sessionId):null;
      if(session)appendPluginRecord(session,REQUEST_METER_RECORD,{stamp:this.routeStamp(request),estimatorVersion:ESTIMATOR_VERSION});
      const step=session?.snapshotEvents().findLast(event=>event.type==='step/start')?.data;
      return receiptStream(next(),receipt=>{
        if(session&&step)this.receipts.set(session,{...receipt,turn:step.turn,step:step.step});
        if(!request[USAGE_OWNER] && request.purpose==='compaction' && request.sessionId)
          ctx.emit('token-meter/receipt',{request,receipt});
      });
    }, {global:true});
    const reading = state => this.reading(state);
    ctx.sessionProjections.register({ key:'contextPressure',stateVersion:ESTIMATOR_VERSION,stateSchema:contextState,init:emptyContext,apply:foldContext,
      wire:{viewSchema:z.object({ projectedTokens:count,pressureTokens:count.optional(),contextWindow:count.optional() }),view:state=>contextView(state,reading(state))} });
    ctx.sessionProjections.register({ key:'contextBreakdown',stateVersion:ESTIMATOR_VERSION,stateSchema:contextState,init:emptyContext,apply:foldContext,
      wire:{viewSchema:z.object({systemTokens:count,toolsTokens:count,messageTokens:count}),view:state=>reading(state).breakdown} });
    ctx.sessionProjections.register(usageProjection);
  }
  measure(session, requestHeader) {
    const state = this.ctx.sessionProjections.stateOf(session,'contextPressure');
    const header = requestHeader===undefined?state.header:canonicalHeader(requestHeader);
    return Object.freeze(this.reading(state,header));
  }
  reading(state,header=state.header) {
    const stamp=this.routeStamp(header?.config);
    const current=state.anchor?.stamp===stamp?state:{...state,anchor:null};
    return measureContext(current,{header,pricing:requestPricing(this.ctx.get('llm'),header?.config)});
  }
  receiptFor(session,event) {
    const fact=this.receipts.get(session);
    if(!fact||fact.turn!==event.data.turn||fact.step!==event.data.step)return null;
    fact.eventSeq??=event.seq;return fact;
  }
  estimateMessage(message, pricing) { return estimateMessage(message,pricing); }
  measureRequest(request) { return measureRequest(request,requestPricing(this.ctx.get('llm'),request)); }
  receipt(usage, options) { return usageReceipt(usage,options); }
}
