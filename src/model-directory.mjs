import { withRequestSignal } from './http.mjs';

// Provider discovery is local metadata. Network-backed model lists have their
// own request lifetime and must never delay settings reads or writes.
export async function readProviderModels(llm, provider, { signal, timeoutMs = 15000 } = {}) {
  signal?.throwIfAborted();
  if (!llm.listProviders().some(item => item.id === provider)) {
    throw Object.assign(Error('提供方不存在'), { statusCode: 404 });
  }
  let timer, cancel;
  const stopped = new Promise((_, reject) => {
    cancel = () => reject(signal.reason);
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => reject(Object.assign(Error('模型列表读取超时，请重试'), { statusCode: 504 })), timeoutMs);
    timer.unref?.();
  });
  try {
    // The host API does not accept a signal. Stop waiting on cancellation;
    // a late provider response is observed but cannot be delivered to the UI.
    const models = await Promise.race([Promise.resolve().then(() => {
      signal?.throwIfAborted();
      return llm.listModels(provider);
    }), stopped]);
    signal?.throwIfAborted();
    if (!Array.isArray(models)) throw Error('提供方返回的模型列表无效');
    return models;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw Object.assign(Error(error?.message || '无法读取模型列表'), { statusCode: error?.statusCode || 502 });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

export async function handleModelDirectoryApi({ ctx, req, res, url, send }) {
  if (url.pathname !== '/oh-my-dsh/api/model-directory') return false;
  if (req.method !== 'GET') { send(res, 405, { error: '不支持此方法' }); return true; }
  const provider = url.searchParams.get('provider');
  if (provider === null) {
    send(res, 200, { providers: ctx.llm.listProviders() });
  } else {
    await withRequestSignal(req, res, async signal => {
      const models = await readProviderModels(ctx.llm, provider, { signal });
      send(res, 200, { provider, models });
    });
  }
  return true;
}
