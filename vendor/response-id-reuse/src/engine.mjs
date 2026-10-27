import { createHash } from 'node:crypto';
import { plainReasoning, replayInput, storedReplayMode } from './replay.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
function normalized(item) {
  if (!item || typeof item !== 'object') return item;
  if (item.role) {
    const { id, status, type, content, ...fields } = item;
    return { ...fields, ...(type && type !== 'message' ? { type } : {}), content: typeof content === 'string'
      ? [{ type: 'text', text: content }]
      : (content ?? []).map(b => ['text', 'input_text', 'output_text'].includes(b.type) ? { type: 'text', text: b.text ?? '' } : b) };
  }
  if (item.type === 'reasoning') return { type: item.type, encrypted_content: item.encrypted_content,
    text: (item.content?.length ? item.content : item.summary ?? []).map(b => b.text ?? '').join('') };
  if (item.type === 'function_call') {
    let args = item.arguments; try { args = JSON.parse(args); } catch {}
    return { type: item.type, call_id: item.call_id, name: item.name,
      ...(item.namespace === undefined ? {} : { namespace: item.namespace }), arguments: args };
  }
  const { id, status, ...rest } = item;
  return rest;
}
const hashes = items => items.map(x => sha(canonical(normalized(x))));
const isPrefix = (all, prefix) => all.length > prefix.length && prefix.every((h, i) => all[i] === h);
const textInput = text => [{ role: 'user', content: [{ type: 'input_text', text }] }];
function inputKinds(input) {
  const kinds = new Set();
  const visit = value => {
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (!value || typeof value !== 'object') return;
    if (['input_image', 'input_file', 'input_audio', 'audio'].includes(value.type)) kinds.add(value.type);
    if (Array.isArray(value.content)) visit(value.content);
    if (Array.isArray(value.output)) visit(value.output);
  };
  visit(input); return [...kinds].sort();
}
function policy(url) {
  const host = new URL(url).hostname;
  const bailian = host === 'cn-beijing.maas.qianwenaiapi.com' || host.endsWith('.maas.aliyuncs.com');
  return { bailian, cmd: host === 'api.commandcode.ai', chainTtl: bailian ? 6 * 86400000 : 6 * 3600000 };
}
function identityHeaders(headers) {
  return [...headers].filter(([name]) => !/^(accept|accept-encoding|content-type|content-length|user-agent|connection|host|date|traceparent|tracestate|x-request-id|http-referer|x-title)$/.test(name) && !name.startsWith('x-stainless-')).sort(([a], [b]) => a.localeCompare(b));
}
function privateOnly(headers) {
  return ['x-cmd-zdr', 'x-zdr', 'x-zero-data-retention'].some(k => /^(1|true|enabled?)$/i.test(headers.get(k) ?? ''));
}
function rejection(status, error) {
  if (![400, 404, 409, 422].includes(status)) return null;
  const e = error?.error ?? error ?? {};
  const text = [e.code, e.type, e.param, e.message, e.detail, error?.detail].filter(x => typeof x === 'string').join(' ').toLowerCase();
  if (/(previous_response_id|previous response|response[_ -]?id|store)/.test(text)
      && /(unsupported|not supported|unrecognized|unknown parameter|not allowed|not permitted|not implemented|does not support|must be (?:set to )?false|only false)/.test(text)) return 'unsupported';
  if (/(previous_response_id|previous response|response[_ -]?id)/.test(text)
      && /(not found|invalid|expired|does not exist|no longer|deleted|missing)/.test(text)) return 'invalid-id';
  return null;
}
export async function createResponsesAuto({ fetchImpl = fetch, now = Date.now,
  capabilityTtlMs = 86400000 } = {}) {
  const capabilities = new Map(), chains = new Map(), replayChecks = new Map();
  const stats = { requests: 0, full: 0, continued: 0, fallbacks: 0, probeRequests: 0, storageReads: 0, last: null };
  let closed = false;
  const prune = (map, limit) => {
    for (const [key, entry] of map) if (entry.expiresAt <= now()) map.delete(key);
    while (map.size > limit) map.delete(map.keys().next().value);
  };
  const inspect = () => ({ version: 1, mode: 'passive-no-probes', pid: process.pid, ...stats,
    capabilities: [...capabilities.values()].map(({ provider, model, state, reason, checkedAt, expiresAt, replayMode }) =>
      ({ provider, model, state, reason, checkedAt, expiresAt, replayMode })),
    activeChains: chains.size, updatedAt: new Date(now()).toISOString() });
  const persist = () => {
    prune(capabilities, 512); prune(chains, 256);
  };
  const capability = (scope, meta, state, reason, ttl = capabilityTtlMs) => {
    capabilities.set(scope, { ...capabilities.get(scope), provider: meta.provider, model: meta.model, state, reason,
      checkedAt: now(), expiresAt: now() + ttl }); persist();
  };
  async function resolveReplay(key, meta, request, sample, baseFetch) {
    const checked = capabilities.get(key);
    if (checked?.replayMode) return checked.replayMode;
    if (!sample || checked?.replayCheckedAt > now() - 60000) return null;
    if (replayChecks.has(key)) return replayChecks.get(key);
    const pending = (async () => {
      stats.storageReads++;
      const mode = await storedReplayMode(request, sample, baseFetch);
      if (!closed) {
        capability(key, meta, capabilities.get(key)?.state ?? 'unconfirmed', capabilities.get(key)?.reason ?? 'storage-readback');
        Object.assign(capabilities.get(key), { replayCheckedAt: now(), ...(mode ? { replayMode: mode } : {}) });
      }
      return mode;
    })();
    replayChecks.set(key, pending);
    try { return await pending; } finally { if (replayChecks.get(key) === pending) replayChecks.delete(key); }
  }
  function observe(response, commit, finish, onPartial) {
    const headers = new Headers(response.headers); headers.delete('content-length');
    const reader = response.body?.getReader();
    if (!reader) { finish(); return response; }
    const sse = headers.get('content-type')?.includes('text/event-stream');
    let buffer = '', complete = false; const decoder = new TextDecoder();
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { value, done } = await reader.read();
          if (done) {
            if (!sse) { try { await commit(JSON.parse(buffer)); complete = true; } catch {} }
            if (!complete) onPartial(); finish(); controller.close(); return;
          }
          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > 16 * 1024 * 1024) { onPartial(); buffer = ''; }
          if (sse) {
            let pos;
            while ((pos = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, pos); buffer = buffer.slice(pos + 1);
              if (!line.startsWith('data:')) continue;
              let event; try { event = JSON.parse(line.slice(5)); } catch { continue; }
              if (event.type === 'response.completed') { await commit(event.response); complete = true; }
              if (['response.failed', 'response.incomplete', 'error'].includes(event.type)) onPartial();
            }
          }
          controller.enqueue(value);
        } catch (error) { if (!complete) onPartial(); finish(); controller.error(error); }
      },
      async cancel(reason) { if (!complete) onPartial(); finish(); await reader.cancel(reason); },
    });
    return new Response(stream, { status: response.status, statusText: response.statusText, headers });
  }
  function fetchFor(meta, baseFetch = fetchImpl) {
    return async (input, init) => {
      if (closed) return baseFetch(input, init);
      const request = new Request(input instanceof Request ? input.clone() : input, init), url = request.url;
      if (request.method !== 'POST' || !new URL(url).pathname.endsWith('/responses')) return baseFetch(input, init);
      let body, originalText;
      try { originalText = await request.clone().text(); body = JSON.parse(originalText); } catch { return baseFetch(input, init); }
      const headers = new Headers(request.headers);
      if (!body || body.model !== meta.model || body.previous_response_id || body.conversation || body.background
        || privateOnly(headers)) return baseFetch(input, init);
      const session = meta.sessionId ?? body.prompt_cache_key;
      if (typeof session !== 'string' || !session.length) return baseFetch(input, init);
      const originalBody = body;
      body = { ...body };
      if (typeof body.input === 'string') body.input = textInput(body.input);
      if (!Array.isArray(body.input) || body.input.length > 8192) return baseFetch(input, init);
      const scope = sha(canonical({ url, provider: meta.provider, model: body.model, headers: identityHeaders(headers) }));
      const { input: allInput, stream: _stream, store: _store, prompt_cache_key: _key, ...parameters } = body;
      // Gate only the request shape that was explicitly rejected. Text-only
      // helpers and image histories can reach different storage implementations.
      const capabilityKey = sha(canonical({ scope, parameters, kinds: inputKinds(allInput) }));
      const checked = capabilities.get(capabilityKey);
      const disabled = checked?.expiresAt > now() && checked.state === 'unsupported';
      stats.requests++;
      let replayMode = await resolveReplay(capabilityKey, meta, request, meta.replayHistory?.sample, baseFetch);
      const effectiveInput = replayInput(allInput, meta.replayHistory, replayMode);
      const effectiveBody = effectiveInput === allInput ? originalBody : { ...originalBody, input: effectiveInput };
      if (disabled) {
        stats.full++;
        const fullHeaders = new Headers(headers); fullHeaders.delete('content-length');
        const response = effectiveBody === originalBody ? await baseFetch(input, init)
          : await baseFetch(new Request(request, { headers: fullHeaders, body: JSON.stringify(effectiveBody) }));
        stats.last = { provider: meta.provider, model: meta.model, mode: 'full', reason: checked.reason,
          inputItems: body.input.length, inputBytes: Buffer.byteLength(originalText) };
        persist(); return response;
      }
      const vendor = policy(url);
      const chainKey = sha(canonical({ scope, session, parameters }));
      const inputHashes = hashes(effectiveInput);
      persist();
      let prior, priorKey;
      for (const [key, candidate] of chains) {
        if (candidate.chainKey === chainKey && (!prior || candidate.prefix.length >= prior.prefix.length)
            && isPrefix(inputHashes, candidate.prefix)) { prior = candidate; priorKey = key; }
      }
      const useId = Boolean(prior);
      // Response IDs name immutable history, not single-use tokens. Retain the
      // confirmed parent across failed attempts and concurrent continuations.
      // Only a definitive provider rejection invalidates that parent.
      const wire = { ...body, input: effectiveInput, store: true,
        ...(useId ? { input: effectiveInput.slice(prior.prefix.length), previous_response_id: prior.id } : {}) };
      if (vendor.cmd) delete wire.prompt_cache_key;
      const h = new Headers(headers); h.delete('content-length');
      if (vendor.bailian) h.set('x-dashscope-session-cache', 'enable');
      const wireText = JSON.stringify(wire);
      const row = { provider: meta.provider, model: meta.model, mode: useId ? 'continued' : 'stored-full',
        inputItems: allInput.length, sentItems: wire.input.length, inputBytes: Buffer.byteLength(originalText),
        sentBytes: Buffer.byteLength(wireText), fallback: null };
      let eligible = true, fallback = false;
      const finish = () => { stats.last = row; persist(); };
      const commit = async output => {
        if (closed || !eligible || request.signal.aborted || row.committed
            || output?.status !== 'completed') return;
        if (typeof output.id !== 'string' || !output.id || output.id.length > 262144 || output.store !== true || !Array.isArray(output.output)) {
          // One unstored response cannot establish a chain, but it does not
          // reject storage for later requests or invalidate other chains.
          capability(capabilityKey, meta, 'unconfirmed', 'normal-response-not-stored'); return;
        }
        const reasoningIds = output.output.filter(plainReasoning).map(item => item.id).filter(id => typeof id === 'string');
        if (reasoningIds.length && output.output.some(item => item.type !== 'reasoning'))
          replayMode = await resolveReplay(capabilityKey, meta, request, { id: output.id, reasoningIds }, baseFetch);
        if (closed || !eligible || request.signal.aborted || row.committed) return;
        const replayedOutput = replayMode === 'omit-plain' ? output.output.filter(item => !plainReasoning(item)) : output.output;
        const prefix = [...hashes(replayInput(allInput, meta.replayHistory, replayMode)), ...hashes(replayedOutput)];
        const candidateKey = chainKey + ':' + sha(prefix.join(':'));
        chains.delete(candidateKey);
        chains.set(candidateKey, { chainKey, id: output.id, prefix, expiresAt: now() + vendor.chainTtl });
        capability(capabilityKey, meta, useId && !fallback ? 'supported' : 'stored', useId && !fallback ? 'normal-continuation-accepted' : 'normal-response-storage-confirmed');
        row.committed = true; persist();
      };
      const send = (text, outgoingHeaders) => baseFetch(new Request(request, { headers: outgoingHeaders,
        body: text, redirect: 'error' }));
      try {
        let response = await send(wireText, h);
        if (!response.ok) {
          let error; try { error = await response.clone().json(); } catch {}
          const why = rejection(response.status, error);
          if (why && (useId || why === 'unsupported')) {
            if (priorKey) for (const [key, candidate] of chains)
              if (candidate.chainKey === chainKey && candidate.id === prior.id) chains.delete(key);
            await response.body?.cancel();
            fallback = true; row.fallback = why; row.mode = 'full-fallback'; stats.fallbacks++;
            const payload = { ...effectiveBody, store: why === 'invalid-id' };
            delete payload.previous_response_id;
            eligible = why === 'invalid-id';
            // A stale ID only invalidates this chain. Cache a negative
            // capability solely when the provider explicitly rejects state.
            capability(capabilityKey, meta, why === 'unsupported' ? 'unsupported' : 'unconfirmed',
              why === 'unsupported' ? 'provider-rejected-state' : 'provider-rejected-id');
            if (eligible && vendor.cmd) delete payload.prompt_cache_key;
            const fallbackText = JSON.stringify(payload);
            row.sentItems = effectiveInput.length; row.sentBytes = Buffer.byteLength(fallbackText);
            const retryHeaders = eligible ? h : new Headers(headers); retryHeaders.delete('content-length');
            response = await send(fallbackText, retryHeaders);
          }
        }
        row.status = response.status;
        if (useId && !fallback && response.ok) stats.continued++; else stats.full++;
        if (!response.ok) { eligible = false; finish(); return response; }
        return observe(response, commit, finish, () => { eligible = false; });
      } catch (error) { eligible = false; row.error = request.signal.aborted ? 'cancelled' : 'network'; finish(); throw error; }
    };
  }
  persist();
  return { fetchFor, inspect,
    async flush() {},
    async close() {
      closed = true; capabilities.clear(); chains.clear(); replayChecks.clear();
    },
  };
}
