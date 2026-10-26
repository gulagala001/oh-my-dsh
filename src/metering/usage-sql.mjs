import { USAGE_FIELDS } from './usage.mjs';
// SQL projection of the same receipt contract, including historic rows. Raw
// rows stay intact; inconsistent counters are excluded from derived totals.
export const validUsageSQL = USAGE_FIELDS.map(k=>`(${k} IS NULL OR (${k}>=0 AND ${k}<=9007199254740991 AND ${k}=CAST(${k} AS INTEGER)))`).join(' AND ')
  + ` AND (totalTokens IS NULL OR COALESCE(inputTokens,0)+COALESCE(cacheReadTokens,0)+COALESCE(cacheWriteTokens,0)+COALESCE(outputTokens,0)<=totalTokens)
  AND (totalTokens IS NULL OR outputTokens IS NULL OR inputTokens IS NULL OR cacheReadTokens IS NULL OR cacheWriteTokens IS NULL OR inputTokens+cacheReadTokens+cacheWriteTokens+outputTokens=totalTokens)
  AND (reasoningTokens IS NULL OR outputTokens IS NULL OR reasoningTokens<=outputTokens)`;
export const inputSQL = `CASE WHEN (${validUsageSQL}) THEN CASE WHEN totalTokens>=outputTokens THEN totalTokens-outputTokens
  ELSE inputTokens+cacheReadTokens+cacheWriteTokens END END`;
// Sum known disjoint buckets per call, not aggregate exact-call subtotals: the
// latter silently omit partial receipts and can mix cache numerator/denominator.
export const knownInputSQL = `CASE WHEN NOT (${validUsageSQL}) THEN NULL WHEN (${inputSQL}) IS NOT NULL THEN (${inputSQL})
  WHEN inputTokens IS NOT NULL OR cacheReadTokens IS NOT NULL OR cacheWriteTokens IS NOT NULL
  THEN COALESCE(inputTokens,0)+COALESCE(cacheReadTokens,0)+COALESCE(cacheWriteTokens,0) END`;
export const knownTotalSQL = `CASE WHEN NOT (${validUsageSQL}) THEN NULL WHEN totalTokens IS NOT NULL THEN totalTokens
  WHEN (${knownInputSQL}) IS NOT NULL OR outputTokens IS NOT NULL
  THEN COALESCE((${knownInputSQL}),0)+COALESCE(outputTokens,0) END`;
// Keep both sides of the hit rate on the same valid receipts. Missing writes
// are fine when the receipt independently establishes the exact input total.
export const cacheMeasuredSQL = `(${inputSQL})>0 AND cacheReadTokens IS NOT NULL AND cacheReadTokens<=(${inputSQL})
  AND COALESCE(inputTokens,0)+cacheReadTokens+COALESCE(cacheWriteTokens,0)<=(${inputSQL})
  AND (inputTokens IS NULL OR cacheWriteTokens IS NULL OR inputTokens+cacheReadTokens+cacheWriteTokens=(${inputSQL}))
  AND (totalTokens IS NULL OR outputTokens IS NULL OR totalTokens>=outputTokens)`;
