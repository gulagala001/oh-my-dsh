import { BlockAssembler, isHarnessError } from '@deepseek-ai/dsh-llm';

// Text-only auxiliary calls share completion and cancellation ownership. The
// caller owns its route, UI and accounting; the SDK owns preparation/dispatch.
export async function readModelReply(prepare, request, signal, { start = () => {}, chunk = () => {} } = {}) {
  const assembler = new BlockAssembler();
  let preparing, prepared, iterator, pendingNext, onAbort, failure, complete = false, finished = false;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason || Error('模型调用已取消'));
    if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true });
  });
  cancelled.catch(() => {});
  try {
    signal?.throwIfAborted();
    preparing = Promise.resolve().then(() => { signal?.throwIfAborted(); return prepare(); });
    prepared = await Promise.race([preparing, cancelled]);
    signal?.throwIfAborted(); start(prepared, assembler);
    iterator = prepared.stream({ ...prepared.config, ...request, signal })[Symbol.asyncIterator]();
    for (;;) {
      pendingNext = iterator.next();
      const part = await Promise.race([pendingNext, cancelled]);
      signal?.throwIfAborted(); pendingNext = null;
      if (part.done) { complete = true; break; }
      assembler.push(part.value); finished ||= part.value.type === 'finish'; chunk(part.value);
    }
    if (!finished) throw Error('模型流结束但未报告完成状态');
    if (['error', 'aborted', 'max-tokens'].includes(assembler.finish.kind)) throw Object.assign(
      Error(assembler.finish.failure?.message || `模型没有完整输出：${assembler.finish.kind}`),
      assembler.finish.failure ? { ...assembler.finish.failure, failure: assembler.finish.failure } : {});
    if (assembler.blocks().some(block => block.type === 'tool-call')) throw Error('此调用不执行工具，模型回复包含工具调用');
    return { prepared, assembler };
  } catch (error) { failure = error; throw error; }
  finally {
    signal?.removeEventListener('abort', onAbort);
    const errors = [], collect = part => {
      const reason = !part?.done && part?.value?.type === 'finish' ? part.value.reason : null;
      if (reason?.failure && ['error', 'aborted'].includes(reason.kind) && reason.failure.code !== 'ABORTED'
        && !(reason.failure.message === signal?.reason?.message && reason.failure.code === (isHarnessError(signal?.reason) ? signal.reason.code : 'UNKNOWN')))
        errors.push(Object.assign(Error(reason.failure.message), { ...reason.failure, failure: reason.failure }));
    };
    // A raced preparation/next still owns a real producer. Await both it and
    // return(), including generators that yield during finally, before release.
    try { await preparing; } catch (error) { if (error !== failure && error !== signal?.reason) errors.push(error); }
    const returning = !complete && iterator ? (async () => {
      for (let part = await iterator.return?.(); part && !part.done; part = await iterator.next()) collect(part);
    })() : Promise.resolve();
    for (const result of await Promise.allSettled([returning, ...(pendingNext ? [pendingNext] : [])])) {
      if (result.status === 'rejected') { if (result.reason !== failure && result.reason !== signal?.reason) errors.push(result.reason); }
      else collect(result.value);
    }
    if (errors.length) throw Object.assign(new AggregateError([...(failure ? [failure] : []), ...new Set(errors)], '模型调用清理失败', { cause: failure }), { cleanup: true });
    if (!failure) signal?.throwIfAborted();
  }
}
