import { IMAGE_OFFLOAD_REQUIRED_CODE, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { requestImageDimensions } from '@deepseek-ai/dsh-attachment';

export const IMAGE_BATCH_POLICY = Object.freeze({ triggerRatio: 0.9, targetRatio: 0.6, keepNewest: 2 });
const DEFAULT_LIMIT = 20 * 1024 * 1024;
function images(blocks, output = []) {
  for (const block of blocks || []) {
    if (block.type === 'image' && !block.offloaded) output.push(block);
    else if (block.type === 'tool-result') images(block.content, output);
  }
  return output;
}

// Count occurrences, not unique files: reading the same picture twice consumes
// two wire payloads. Never edit messages or source attachments in this preflight.
export function imageOffloadPlan(messages, versionBytes, limit, policy = IMAGE_BATCH_POLICY) {
  const retained = [], latestBatch = [];
  for (const message of messages) {
    if (message.role === 'assistant') latestBatch.length = 0;
    const found = images(message.content);
    if (message.role !== 'user' && found.length) return { count: 0 };
    retained.push(...found); latestBatch.push(...found);
  }
  const lengths = retained.map(block => 4 * Math.ceil(versionBytes(block) / 3));
  const totalBytes = lengths.reduce((sum, value) => sum + value, 0);
  if (totalBytes <= limit * policy.triggerRatio) return { count: 0, totalBytes, retainedBytes: totalBytes };
  const removable = Math.max(0, lengths.length - Math.max(policy.keepNewest, latestBatch.length));
  let count = 0, retainedBytes = totalBytes;
  while (retainedBytes > limit * policy.targetRatio && count < removable) retainedBytes -= lengths[count++];
  // The stock hard-limit handler remains authoritative if even the protected
  // latest batch is too large. No retry loop just to achieve the soft target.
  return { count, totalBytes, retainedBytes };
}

export function installImageBudget(ctx, isManagedSession) {
  // Store byte counts only, never base64 images. Host readImageRequest already
  // caches immutable request versions; include the complete resize policy key.
  const caches = new WeakMap();
  ctx.on('llm/stream', async function* (options, next) {
    const session = options.sessionId && ctx.sessions.get(options.sessionId);
    const profile = ctx.settings.section('llm-pi-ai')?.providers?.[options.provider];
    const attachments = ctx.get('attachments');
    if (!isAgentLoopRequest(options) || !session || !isManagedSession(session)
      || session.header?.origin === 'subagent' || !profile || !attachments?.readImageRequest) {
      yield* next(); return;
    }
    const blocks = options.messages.flatMap(message => images(message.content));
    if (!blocks.length) { yield* next(); return; }
    let plan;
    try {
      options.signal?.throwIfAborted();
      const model = await ctx.llm.resolveModelInfo(options.provider, options.model, options.signal);
      if (model.inputModalities?.includes('image')) {
        const limit = profile.maxRequestImageBytes ?? DEFAULT_LIMIT;
        const maxPixels = profile.requestImagePixelBudget ?? 4194304;
        const maxBytes = profile.requestImageMaxBytes ?? 1048576;
        let cache = caches.get(attachments);
        if (!cache) { cache = new Map(); caches.set(attachments, cache); }
        const sizes = new Map(), unique = new Map(blocks.map(block => [block.attachment.attachmentId, block.attachment]));
        await Promise.all([...unique].map(async ([id, ref]) => {
          const target = { ...requestImageDimensions(ref.width, ref.height, maxPixels), maxBytes };
          const key = JSON.stringify([id, target.width, target.height, maxBytes]);
          let bytes = cache.get(key);
          if (bytes === undefined) {
            bytes = (await attachments.readImageRequest(ref, target, options.signal)).bytes;
            if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid request-image byte count');
            cache.set(key, bytes);
            if (cache.size > 512) cache.delete(cache.keys().next().value);
          }
          sizes.set(id, bytes);
        }));
        options.signal?.throwIfAborted();
        plan = imageOffloadPlan(options.messages, block => sizes.get(block.attachment.attachmentId), limit);
      }
    } catch (error) {
      options.signal?.throwIfAborted();
      // Let the original adapter report its own image/route errors; this
      // optimization must never make an otherwise valid request unusable.
      ctx.logger?.warn?.('图片批量预检未完成，沿用宿主限制：' + error.message);
    }
    if (plan?.count > 0) {
      // Use the existing durable image/offload recovery, so replay, image
      // indexes, cancellation and tool/result identities remain host-owned.
      yield { type: 'finish', reason: { kind: 'error', failure: {
        code: IMAGE_OFFLOAD_REQUIRED_CODE, offloadImages: plan.count,
        message: `Image budget preflight: offload ${plan.count} oldest image occurrence(s) in one batch; ${plan.totalBytes} -> ${plan.retainedBytes} base64 bytes. Original files are retained.`,
      } } };
      return;
    }
    yield* next();
  }, { global: true });
}
