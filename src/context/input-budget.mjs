import { prepareCandidate, candidateInput } from './core.mjs';
import { measureRequest, inputBudget } from '../metering/estimate.mjs';
import { PREPARE_SYSTEM, PREPARE_TOOL } from './prompts.mjs';

// Fit the complete request, including system, tools and framing. Only optional
// lookback is removed; the selected segment and protected evidence stay whole.
export function serializePreparationInput(input, maxTokens, { build = text => ({ messages: [{ role:'user',content:[{type:'text',text}] }] }), measure = measureRequest } = {}) {
  const reference = [...(input.reference ?? [])];
  for (;;) {
    const encoded = JSON.stringify({ ...input, reference });
    if (measure(build(encoded)).tokens <= maxTokens) return encoded;
    if (!reference.length) throw Object.assign(Error('整窗完整请求超过预处理输入预算，原文保留'), { code: 'INPUT_BUDGET_EXCEEDED' });
    reference.shift();
  }
}
export function preparationRequest(pipeline, agent, inputs, cfg = pipeline.config()) {
  const route = pipeline.hub.route?.(agent,'prepare') ?? agent.session.requestHeader?.()?.config ?? agent.options ?? {};
  const build = encoded => ({ ...route, system:PREPARE_SYSTEM, messages:[pipeline.adapter.message(encoded,'prepare-input')], tools:[PREPARE_TOOL],
    ...(cfg.digestMaxTokens > 0 ? {maxTokens:cfg.digestMaxTokens} : {}) });
  const limit = pipeline.adapter.inputLimit?.(agent.session,build(''),cfg.prepareInputTokens) ?? inputBudget({inputLimit:cfg.prepareInputTokens});
  const encoded = serializePreparationInput(inputs,limit,{build,measure:pipeline.adapter.measureRequest ?? measureRequest});
  return build(encoded);
}

// Window selection is structural; admission is performed against the finished
// request. Shrink only at native tool-pair/record boundaries, never by bytes.
export function preparationEvents(pipeline, agent, state, cfg, { minimumEvents = 0 } = {}) {
  let width = cfg.digestWindow, last = null;
  for (;;) {
    const events = prepareCandidate(agent.session,state,{...cfg,digestWindow:width},pipeline.adapter.pairing,{minimumEvents:last ? 0 : minimumEvents});
    if (!events) return null;
    const signature = events.map(e=>e.seq).join(',');
    if (signature === last) throw Object.assign(Error('一个完整工具往返或既有资料段超过完整请求预算，原文保留'), {code:'INPUT_BUDGET_EXCEEDED'});
    const inputs = candidateInput(agent.session,events,cfg.digestLookback);
    inputs.target_characters = cfg.summaryTargetChars;
    try { preparationRequest(pipeline,agent,inputs,cfg); if(last)events.inputLimited=true; return events; }
    catch(error) {
      if(error.code !== 'INPUT_BUDGET_EXCEEDED')throw error;
      if(width <= 1)throw error;
      last=signature; width=Math.max(1,Math.min(width-1,events.length-1));
    }
  }
}
