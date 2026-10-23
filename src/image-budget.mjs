import { IMAGE_OFFLOAD_REQUIRED_CODE, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { requestImageDimensions } from '@deepseek-ai/dsh-attachment';
import { providerProfile } from './llm-request-projection.mjs';
import { imageRule } from './image-rules.mjs';
import { imageSourceValue, rememberRequestImages } from './image-request-state.mjs';

export const IMAGE_BATCH_POLICY = Object.freeze({ triggerRatio: 0.9, targetRatio: 0.6, keepNewest: 2 });
export const IMAGE_REPAIR_CODE = 'OMD_IMAGE_OFFLOAD_REQUIRED';
export const IMAGE_LIMIT_CODE = 'OMD_IMAGE_LIMIT_EXCEEDED';
const DEFAULT_LIMIT = 20 * 1024 * 1024;
const REPLAY_WAIT = '图片限制或编码设置已变化，等待符合限制的成功主请求；缓存前缀和原图保留';
const identity = block => JSON.stringify(imageSourceValue(block));
export function requestImages(messages) {
  const result = [];
  const visit = (blocks, message, path = []) => (blocks || []).forEach((block, index) => {
    if (block.type === 'image' && !block.offloaded) result.push({ block, message, path: [...path, index] });
    else if (block.type === 'tool-result') visit(block.content, message, [...path, index, 'content']);
  });
  for (const message of messages) visit(message.content, message);
  return result;
}

// Count occurrences, not unique files; byte lengths are the actual request versions.
export function imageOffloadPlan(messages, versionBytes, limit, policy = IMAGE_BATCH_POLICY) {
  const entries = requestImages(messages);
  const lengths = entries.map(({ block }) => 4 * Math.ceil(versionBytes(block) / 3));
  const totalBytes = lengths.reduce((a, b) => a + b, 0);
  const latestAssistant = messages.findLastIndex(message => message.role === 'assistant');
  const latestBatch = entries.filter(entry => messages.indexOf(entry.message) > latestAssistant).length;
  const maxImages = policy.maxImages ?? Infinity;
  if (totalBytes <= limit * policy.triggerRatio && entries.length <= maxImages)
    return { count: 0, totalBytes, retainedBytes: totalBytes, images: entries.length, selected: [] };
  const protectedCount = Math.max(policy.keepNewest, latestBatch);
  const removable = Math.max(0, entries.length - protectedCount);
  let count = 0, retainedBytes = totalBytes;
  const targetCount = Number.isFinite(maxImages) ? Math.max(protectedCount, policy.targetImages ?? policy.keepNewest) : Infinity;
  while (count < removable && (retainedBytes > limit * policy.targetRatio || entries.length - count > targetCount)) {
    const entry = entries[count];
    // The native durable projection accepts input images, never assistant output.
    if (!['user', 'tool'].includes(entry.message.role) || entry.path.length !== 1) break;
    retainedBytes -= lengths[count++];
  }
  return { count, totalBytes, retainedBytes, images: entries.length, selected: entries.slice(0, count),
    blocked: retainedBytes > limit || entries.length - count > maxImages };
}

// Resolve exact source occurrences after request projections have removed duplicates
// or adapted tool results. Never use a count against a different source history.
export function imageOffloadTargets(session, selected) {
  const sources = session.surface.nodes.flatMap(seq => {
    const event = session.eventAt(seq);
    if (!['user/message', 'tool/result'].includes(event.type)) return [];
    const message = session.deriveEventMessage(event); let imageIndex = 0;
    return (message?.content || []).flatMap(block => block.type !== 'image' ? []
      : [{ seq, imageIndex: imageIndex++, messageId: message.id, block }]).filter(item => !item.block.offloaded);
  });
  const used = new Set(), targets = new Map();
  for (const entry of selected) {
    const matching = sources.filter(item => !used.has(item) && identity(item.block) === identity(entry.block));
    const exact = matching.filter(item => item.messageId === entry.message.id);
    const source = exact[0] ?? (matching.length === 1 ? matching[0] : null);
    if (!source) return null;
    used.add(source);
    const indexes = targets.get(source.seq) || []; indexes.push(source.imageIndex); targets.set(source.seq, indexes);
  }
  return [...targets].map(([seq, imageIndexes]) => ({ seq, imageIndexes: imageIndexes.sort((a, b) => a - b) }));
}

export function installImageBudget(ctx, isManagedSession, hub) {
  const caches = new WeakMap(), pending = new Map();
  const config = () => hub?.config() ?? { multiImageFixEnabled: false };
  const target = (options, ref) => {
    if (ctx.llm.imageRequestTarget) return ctx.llm.imageRequestTarget(options.provider, options.model, ref);
    const profile = providerProfile(ctx, options.provider);
    return { ...requestImageDimensions(ref.width, ref.height, profile?.requestImagePixelBudget ?? 4194304),
      maxBytes: profile?.requestImageMaxBytes ?? 1048576 };
  };
  const encoding = options => JSON.stringify([...new Map(requestImages(options.messages)
    .map(({ block }) => [block.attachment.attachmentId, block.attachment])).values()]
    .map(ref => [ref.attachmentId, target(options, ref)]));
  const limitFor = (options, rule) => Math.min(rule.maxBytes, providerProfile(ctx, options.provider)?.maxRequestImageBytes ?? Infinity);
  const service = {
    snapshotReason(snapshot) {
      const request = snapshot.request, rule = imageRule(config(), snapshot.provider);
      if (!rule || !request || !requestImages(request.messages).length) return null;
      const info = snapshot.images;
      if (info?.textOnly) return null;
      try {
        if (!info || info.images > rule.maxImages || info.bytes > limitFor(request, rule) || info.encoding !== encoding(request)) return REPLAY_WAIT;
      } catch { return REPLAY_WAIT; }
      return null;
    },
  };
  ctx.on('agent/request-error', async ({ agent, failure, signal }, next) => {
    if (failure.code !== IMAGE_REPAIR_CODE) return next();
    const item = pending.get(agent.session.id); pending.delete(agent.session.id);
    if (!item || item.session !== agent.session || item.signal !== signal || signal.aborted) return next();
    if (item.rule !== JSON.stringify(imageRule(config(), item.provider))) return { kind: 'retry' };
    // Summary replacement already finished before this frozen request was built.
    // A new concurrent replacement must never receive this request's selections.
    const targets = imageOffloadTargets(agent.session, item.selected);
    if (!targets?.length || JSON.stringify(targets) !== JSON.stringify(item.targets)) return next();
    agent.session.append('image/offload', { targets });
    await ctx.sessions.flush?.(agent.session);
    return { kind: 'retry' };
  }, { global: true, prepend: true });
  ctx.on('session/disposed', session => pending.delete(session.id), { global: true });
  ctx.on('agent/disposed', ({ agent }) => pending.delete(agent.session.id), { global: true });
  ctx.on('llm/stream', async function* (options, next) {
    const main = isAgentLoopRequest(options), session = options.sessionId && ctx.sessions.get(options.sessionId);
    if (!session || !isManagedSession(session)) { yield* next(); return; }
    if (main) pending.delete(session.id);
    const rule = imageRule(config(), options.provider);
    const entries = requestImages(options.messages);
    if (!entries.length) { rememberRequestImages(options, { images: 0, bytes: 0, encoding: '[]' }); yield* next(); return; }
    const profile = providerProfile(ctx, options.provider);
    const legacy = !rule && main && session.header?.origin !== 'subagent' && profile;
    if (!rule && !legacy) { yield* next(); return; }
    let plan, measured;
    try {
      options.signal?.throwIfAborted();
      const model = await ctx.llm.resolveModelInfo(options.provider, options.model, options.signal);
      if (model.inputModalities && !model.inputModalities.includes('image')) { measured = { images: 0, bytes: 0, encoding: '[]', textOnly: true }; }
      else {
        const attachments = ctx.get('attachments');
        if (!attachments?.readImageRequest) throw Error('图片附件服务不可用');
        let cache = caches.get(attachments);
        if (!cache) { cache = new Map(); caches.set(attachments, cache); }
        const sizes = new Map(), unique = new Map(entries.map(({ block }) => [block.attachment.attachmentId, block.attachment]));
        const encodingBefore = encoding(options);
        await Promise.all([...unique].map(async ([id, ref]) => {
          const destination = target(options, ref), key = JSON.stringify([id, destination]);
          let bytes = cache.get(key);
          if (bytes === undefined) {
            bytes = (await attachments.readImageRequest(ref, destination, options.signal)).bytes;
            if (!Number.isSafeInteger(bytes) || bytes < 0) throw Error('Invalid request-image byte count');
            cache.set(key, bytes); if (cache.size > 512) cache.delete(cache.keys().next().value);
          }
          sizes.set(id, bytes);
        }));
        options.signal?.throwIfAborted();
        if (encodingBefore !== encoding(options) || JSON.stringify(rule) !== JSON.stringify(imageRule(config(), options.provider))) throw Error('图片设置在预检期间已变化，请重试');
        const limit = rule ? limitFor(options, rule) : profile.maxRequestImageBytes ?? DEFAULT_LIMIT;
        plan = imageOffloadPlan(options.messages, block => sizes.get(block.attachment.attachmentId), limit,
          rule ? { triggerRatio: 1, targetRatio: 0.6, keepNewest: 1, targetImages: rule.keepImages, maxImages: rule.maxImages } : IMAGE_BATCH_POLICY);
        measured = { images: entries.length, bytes: plan.totalBytes, encoding: encodingBefore };
      }
    } catch (error) {
      options.signal?.throwIfAborted();
      if (rule) {
        yield { type: 'finish', reason: { kind: 'error', failure: { code: IMAGE_LIMIT_CODE, message: `多图请求修复预检失败：${error.message}；原图保留。` } } }; return;
      }
      ctx.logger?.warn?.('图片批量预检未完成，沿用宿主限制：' + error.message);
    }
    if (rule && plan?.blocked) {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: IMAGE_LIMIT_CODE,
        message: '最新未读图片或无法安全卸载的图片超过渠道上限；请分批读取或提高该渠道的图片限制。原图未删除。' } } }; return;
    }
    if (plan?.count > 0) {
      if (rule && !main) {
        // A detached background/side request has no authority to alter the parent
        // surface or an already successful cache prefix. Never silently reproject it.
        yield { type: 'finish', reason: { kind: 'error', failure: { code: IMAGE_LIMIT_CODE, message: REPLAY_WAIT } } }; return;
      }
      if (rule) {
        const targets = imageOffloadTargets(session, plan.selected);
        if (!targets?.length) {
          yield { type: 'finish', reason: { kind: 'error', failure: { code: IMAGE_LIMIT_CODE, message: '无法定位待整理图片的原始消息，未更改历史或重发超限请求。' } } }; return;
        }
        pending.set(session.id, { session, signal: options.signal, provider: options.provider,
          rule: JSON.stringify(rule), targets, selected: plan.selected });
      }
      yield { type: 'finish', reason: { kind: 'error', failure: {
        code: rule ? IMAGE_REPAIR_CODE : IMAGE_OFFLOAD_REQUIRED_CODE,
        ...(rule ? {} : { offloadImages: plan.count }),
        message: `Image budget preflight: offload ${plan.count} oldest image occurrence(s); ${plan.totalBytes} -> ${plan.retainedBytes} base64 bytes. Original files are retained.`,
      } } }; return;
    }
    if (measured) rememberRequestImages(options, measured);
    yield* next();
  }, { global: true });
  return service;
}
