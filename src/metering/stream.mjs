import { randomUUID } from 'node:crypto';
import { USAGE_FIELDS, usageReceipt } from './usage.mjs';
export const USAGE_OWNER=Symbol.for('omd.usage-owner.v1');
export const ownedUsageRequest=(request,owner)=>({...request,[USAGE_OWNER]:owner});

// One receipt per actual stream attempt. Consumers receive cumulative samples,
// never a sum of samples; cancellation reports the last known receipt too.
export async function* receiptStream(stream, settle) {
  const id=randomUUID(),startedAt=Date.now();let hasOutput=false,usage,finish,error;
  try {
    for await (const chunk of stream) {
      hasOutput ||= chunk.type === 'text-delta' || chunk.type === 'reasoning-delta' ? Boolean(chunk.text)
        : chunk.type === 'tool-call-delta' ? Boolean(chunk.name || chunk.argumentsDelta || chunk.id) : chunk.type === 'block-end';
      if(chunk.type==='finish')finish=chunk.reason;
      if (chunk.type !== 'usage') { yield chunk; continue; }
      const receipt = usageReceipt(chunk.usage,{hasOutput});
      // An all-zero SDK initializer has no provider provenance. Explicit
      // measured zero is still valid; missing cache fields remain missing.
      if (receipt.inconsistent || receipt.knownTotalTokens === null
        || (receipt.knownTotalTokens === 0 && chunk.usage?.measurement !== 'reported')) continue;
      usage={...chunk.usage};
      for(const key of USAGE_FIELDS)if(receipt[key]===null)delete usage[key];else usage[key]=receipt[key];
      yield {...chunk,usage};
    }
  } catch(cause){error=cause;throw cause;}
  finally {settle?.({id,startedAt,durationMs:Date.now()-startedAt,hasOutput,usage,finish,error});}
}
