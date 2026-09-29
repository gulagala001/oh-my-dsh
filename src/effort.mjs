// Cache model capabilities, not selected effort levels. Adapter changes invalidate
// successful lookups; failed lookups remain retryable and preserve the requested effort.

/**
 * @param ctx cordis 上下文（需要 ctx.llm，可选 ctx.on 订阅失效事件）
 * @param opts.effort 'off' | 'inherit' | 其它档位 id；'inherit' = 不传档位；默认 'off'
 */
export function createEffortResolver(ctx, { effort = 'off' } = {}) {
  /** `${provider}/${model}` -> Promise<Set<string>> 支持的档位 id 集合（空集 = 无推理元数据 / 查询失败） */
  const cache = new Map()
  const invalidate = () => cache.clear()
  try { ctx.on?.('llm/adapters-updated', invalidate, { global: true }) } catch {}

  // A failed lookup is not evidence that the model lacks reasoning controls.
  const lookup = async (provider, model) => {
    const llm = ctx.llm
    let failure = null
    if (llm && typeof llm.resolveModelInfo === 'function') {
      try {
        const info = await llm.resolveModelInfo(provider, model)
        const efforts = info?.reasoning?.efforts
        if (Array.isArray(efforts)) return new Set(efforts.map(e => e?.id).filter(Boolean))
        return new Set()
      } catch (e) { failure = e /* 退化到 listModels */ }
    }
    if (llm && typeof llm.listModels === 'function') {
      try {
        const models = await llm.listModels(provider)
        const m = Array.isArray(models) ? models.find(x => x?.id === model) : undefined
        const efforts = m?.reasoning?.efforts
        if (Array.isArray(efforts)) return new Set(efforts.map(e => e?.id).filter(Boolean))
        if (!failure) return new Set()
      } catch (e) { failure = failure ?? e }
    }
    if (failure) throw failure
    return new Set()
  }

  /** 该路由声明支持的档位集合（带缓存；查询失败不缓存——下次再问）。 */
  const supported = (provider, model) => {
    const key = `${provider}/${model}`
    let p = cache.get(key)
    if (!p) { p = lookup(provider, model).catch(e => { if (cache.get(key) === p) cache.delete(key); throw e }); cache.set(key, p) }
    return p
  }

  /** 解析实际要传的 reasoningEffort：'inherit' → undefined；声明支持才传，未声明 → undefined；查询失败 → 乐观按请求档发 + warn（不缓存）。 */
  const resolve = async (provider, model, requested = effort) => {
    if (!requested || requested === 'inherit') return undefined
    try {
      const set = await supported(provider, model)
      return set.has(requested) ? requested : undefined
    } catch (e) {
      ctx.logger?.warn(`trisoul-memory: 档位能力查询失败（${provider}/${model}），本次按 '${requested}' 乐观派发且不缓存: ${String(e?.message ?? e)}`)
      return requested
    }
  }

  return { effort, resolve, supported, invalidate }
}
