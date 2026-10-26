/** Canonical disjoint usage receipts. Unknown is never a measured zero.
 * Reasoning is a subset of output. A provider total can be exact while its
 * billing buckets are incomplete; consumers must choose the required scope.
 */
export const USAGE_FIELDS = Object.freeze(['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'totalTokens']);
export const tokenNumber = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function reportedUsage(usage, hasOutput = false) {
  if (usage?.measurement === 'unknown') return null;
  const values = USAGE_FIELDS.map(key => tokenNumber(usage?.[key]));
  if (!values.some(value => value !== null)) return null;
  // Legacy pi-ai initializes all counters before receiving a provider receipt.
  // Explicit measured metadata takes precedence, including a genuine zero.
  if (usage?.measurement !== 'reported' && hasOutput && values.every(value => value === null || value === 0)) return null;
  // A nonempty response cannot prove the SDK's zero output initializer. Its
  // derived total cannot prove a complete charge either; retain known input.
  if(usage?.measurement!=='reported'&&hasOutput&&usage?.outputTokens===0)
    return {...usage,outputTokens:undefined,totalTokens:undefined};
  return usage;
}
export function usageReceipt(raw, { hasOutput = false } = {}) {
  const usage = reportedUsage(raw, hasOutput);
  const buckets = Object.fromEntries(USAGE_FIELDS.map(key => [key, tokenNumber(usage?.[key])]));
  const inputKeys = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens'];
  const knownInput = inputKeys.some(key => buckets[key] !== null) ? inputKeys.reduce((n,key) => n + (buckets[key] ?? 0), 0) : null;
  const splitInput = inputKeys.every(key => buckets[key] !== null) ? knownInput : null;
  const output = buckets.outputTokens, reportedTotal = buckets.totalTokens;
  const derivedInput = reportedTotal !== null && output !== null && reportedTotal >= output ? reportedTotal - output : null;
  const invalid = raw && raw.measurement !== 'unknown' && USAGE_FIELDS.some(key=>raw[key]!=null&&tokenNumber(raw[key])===null);
  const inconsistent = Boolean(invalid) || (reportedTotal !== null && knownInput !== null && knownInput + (output ?? 0) > reportedTotal) || (reportedTotal !== null && output !== null && reportedTotal < output)
    || (derivedInput !== null && knownInput !== null && knownInput > derivedInput)
    || (derivedInput !== null && splitInput !== null && derivedInput !== splitInput)
    || (buckets.reasoningTokens !== null && output !== null && buckets.reasoningTokens > output);
  const input = inconsistent ? null : derivedInput ?? splitInput;
  const total = inconsistent ? null : reportedTotal ?? (input !== null && output !== null ? input + output : null);
  const knownTotal = total ?? (knownInput !== null || output !== null ? (knownInput ?? 0) + (output ?? 0) : null);
  const complete = total !== null && input !== null && output !== null;
  return Object.freeze({ ...buckets, totalTokens: total, inputTotalTokens: input,
    knownInputTokens: inconsistent ? null : input ?? knownInput, knownTotalTokens: inconsistent ? null : knownTotal,
    complete, inconsistent, precision: inconsistent ? 'inconsistent' : total !== null ? 'reported' : knownTotal !== null ? 'lower-bound' : 'unknown' });
}
export const usageFields = usage => {
  const receipt = usageReceipt(usage);
  if(receipt.inconsistent)return Object.fromEntries(USAGE_FIELDS.map(key=>[key,null]));
  return Object.fromEntries(USAGE_FIELDS.map(key => [key, key === 'totalTokens' ? tokenNumber(usage?.totalTokens) ?? receipt.totalTokens : tokenNumber(usage?.[key])]));
};

// Additive projection of one receipt. Unknown buckets contribute a known
// subtotal and an uncovered-call count; cache numerator/denominator always
// come from the same complete input measurement.
export function usageContribution(raw, options) {
  const r=usageReceipt(raw,options);
  if(r.inconsistent)return usageContribution(null);
  const cacheMeasured=r.inputTotalTokens !== null && r.inputTotalTokens>0 && r.cacheReadTokens !== null && !r.inconsistent;
  return {
    uncachedInputTokens:r.inputTokens??0,outputTokens:r.outputTokens??0,cacheReadTokens:r.cacheReadTokens??0,cacheWriteTokens:r.cacheWriteTokens??0,
    knownInputTokens:r.knownInputTokens??0,knownTotalTokens:r.knownTotalTokens??0,
    inputUnreported:Number(r.inputTotalTokens===null),totalUnreported:Number(r.totalTokens===null),
    inputBucketUnreported:Number(r.inputTokens===null),outputUnreported:Number(r.outputTokens===null),
    cacheUnreported:Number(r.cacheReadTokens===null),cacheWriteUnreported:Number(r.cacheWriteTokens===null),
    usageUnreported:Number(r.knownTotalTokens===null),inputKnownUnreported:Number(r.knownInputTokens===null),
    calls:1,cacheMeasuredCalls:Number(cacheMeasured),cacheMeasuredInputTokens:cacheMeasured?r.inputTotalTokens:0,
    cacheMeasuredReadTokens:cacheMeasured?r.cacheReadTokens:0,
  };
}
export const USAGE_TOTAL_KEYS=Object.freeze(Object.keys(usageContribution(null)));
export const emptyUsageTotals=()=>Object.fromEntries(USAGE_TOTAL_KEYS.map(key=>[key,0]));
export function replaceUsageContribution(totals,previous,next) {
  return Object.fromEntries(USAGE_TOTAL_KEYS.map(key=>[key,(totals[key]??0)-(previous?.[key]??0)+(next?.[key]??0)]));
}

export function usageTotalsView(totals) {
  const view={...totals};
  if(totals.calls>0){
    for(const [field,missing] of Object.entries({knownTotalTokens:'usageUnreported',knownInputTokens:'inputKnownUnreported'}))
      if(totals[missing]===totals.calls)view[field]=null;
  }
  return view;
}
