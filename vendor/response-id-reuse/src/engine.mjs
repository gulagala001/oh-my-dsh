import { createHash } from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
function normalized(item) {
  if (item.role) return { role: item.role, ...(item.phase === undefined ? {} : { phase: item.phase }), content: typeof item.content === 'string'
    ? [{ type: 'text', text: item.content }]
    : (item.content ?? []).map(b => ['text', 'input_text', 'output_text'].includes(b.type) ? { type: 'text', text: b.text ?? '' } : b) };
  if (item.type === 'reasoning') return { type: item.type, encrypted_content: item.encrypted_content,
    text: (item.content?.length ? item.content : item.summary ?? []).map(b => b.text ?? '').join('') };
  if (item.type === 'function_call') {
    let args = item.arguments; try { args = JSON.parse(args); } catch {}
    return { type: item.type, call_id: item.call_id, name: item.name, arguments: args };
  }
  const { id, status, ...rest } = item;
  return rest;
}
const hashes = items => items.map(x => sha(canonical(normalized(x))));
const isPrefix = (all, prefix) => all.length > prefix.length && prefix.every((h, i) => all[i] === h);
const textInput = text => [{ role: 'user', content: [{ type: 'input_text', text }] }];
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
  const text = [e.code, e.type, e.param, e.message].filter(x => typeof x === 'string').join(' ').toLowerCase();
  if (/(previous_response_id|previous response|response[_ -]?id|store)/.test(text)
      && /(unsupported|not supported|unrecognized|unknown parameter|not allowed|not permitted|not implemented|does not support|must be false|only false)/.test(text)) return 'unsupported';
  if (/(previous_response_id|previous response|response[_ -]?id)/.test(text)
      && /(not found|invalid|expired|does not exist|no longer|deleted|missing)/.test(text)) return 'invalid-id';
  return null;
}
export async function createResponsesAuto({ fetchImpl = fetch, now = Date.now,
  capabilityTtlMs = 86400000 } = {}) {
  const capabilities = new Map(), chains = new Map();
  const active = new Map(), generations = new Map();
  const stats = { requests: 0, full: 0, continued: 0, fallbacks: 0, probeRequests: 0, last: null };
  let closed = false, serial = 0;
  const prune = (map, limit) => {
    for (const [key, entry] of map) if (entry.expiresAt <= now()) map.delete(key);
    while (map.size > limit) map.delete(map.keys().next().value);
  };
  const inspect = () => ({ version: 1, mode: 'passive-no-probes', pid: process.pid, ...stats,
    capabilities: [...capabilities.values()].map(({ provider, model, state, reason, checkedAt, expiresAt }) =>
      ({ provider, model, state, reason, checkedAt, expiresAt })),
    activeChains: chains.size, updatedAt: new Date(now()).toISOString() });
  const persist = () => {
    prune(capabilities, 512); prune(chains, 256);
  };
  const capability = (scope, meta, state, reason, ttl = capabilityTtlMs) => {
    capabilities.set(scope, { provider: meta.provider, model: meta.model, state, reason,
      checkedAt: now(), expiresAt: now() + ttl }); persist();
  };
  const release = (chainKey, generation) => {
    if (active.get(chainKey) === generation) active.delete(chainKey);
    if (generations.get(chainKey) === generation) generations.delete(chainKey);
  };
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
            if (!sse) { try { commit(JSON.parse(buffer)); complete = true; } catch {} }
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
              if (event.type === 'response.completed') { commit(event.response); complete = true; }
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
      let body;
      try { body = JSON.parse(await request.clone().text()); } catch { return baseFetch(input, init); }
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
      const checked = capabilities.get(scope);
      const disabled = checked?.expiresAt > now() && checked.state === 'unsupported';
      stats.requests++;
      if (disabled) {
        stats.full++;
        const response = await baseFetch(input, init);
        stats.last = { provider: meta.provider, model: meta.model, mode: 'full', reason: checked.reason,
          inputItems: body.input.length, inputBytes: Buffer.byteLength(JSON.stringify(body)) };
        persist(); return response;
      }
      const vendor = policy(url);
      const { input: allInput, stream: _stream, store: _store, prompt_cache_key: _key, ...parameters } = body;
      const chainKey = sha(canonical({ scope, session, parameters }));
      const generation = ++serial; generations.set(chainKey, generation);
      const prior = chains.get(chainKey);
      const inputHashes = hashes(allInput);
      const useId = !active.has(chainKey) && prior?.expiresAt > now() && isPrefix(inputHashes, prior.prefix);
      active.set(chainKey, generation); chains.delete(chainKey);
      const wire = { ...body, store: true, ...(useId ? { input: allInput.slice(prior.prefix.length), previous_response_id: prior.id } : {}) };
      if (vendor.cmd) delete wire.prompt_cache_key;
      const h = new Headers(headers); h.delete('content-length');
      if (vendor.bailian) h.set('x-dashscope-session-cache', 'enable');
      const row = { provider: meta.provider, model: meta.model, mode: useId ? 'continued' : 'stored-full',
        inputItems: allInput.length, sentItems: wire.input.length, inputBytes: Buffer.byteLength(JSON.stringify(body)),
        sentBytes: Buffer.byteLength(JSON.stringify(wire)), fallback: null };
      let eligible = true, fallback = false;
      const finish = () => { release(chainKey, generation); stats.last = row; persist(); };
      const commit = output => {
        if (closed || !eligible || request.signal.aborted || generations.get(chainKey) !== generation
            || output?.status !== 'completed') return;
        if (typeof output.id !== 'string' || !output.id || output.id.length > 262144 || output.store !== true || !Array.isArray(output.output)) {
          capability(scope, meta, 'unsupported', 'normal-response-not-stored'); return;
        }
        chains.set(chainKey, { id: output.id, prefix: [...inputHashes, ...hashes(output.output)], expiresAt: now() + vendor.chainTtl });
        capability(scope, meta, useId && !fallback ? 'supported' : 'stored', useId && !fallback ? 'normal-continuation-accepted' : 'normal-response-storage-confirmed');
        row.committed = true; persist();
      };
      const send = (payload, outgoingHeaders) => baseFetch(new Request(request, { headers: outgoingHeaders,
        body: JSON.stringify(payload), redirect: 'error' }));
      try {
        let response = await send(wire, h);
        if (!response.ok) {
          let error; try { error = await response.clone().json(); } catch {}
          const why = rejection(response.status, error);
          if (why && (useId || why === 'unsupported')) {
            await response.body?.cancel();
            fallback = true; row.fallback = why; row.mode = 'full-fallback'; stats.fallbacks++;
            const payload = { ...originalBody, store: false };
            delete payload.previous_response_id;
            eligible = false;
            capability(scope, meta, 'unsupported', why === 'unsupported' ? 'provider-rejected-state' : 'provider-rejected-id', why === 'unsupported' ? capabilityTtlMs : 3600000);
            row.sentItems = allInput.length; row.sentBytes = Buffer.byteLength(JSON.stringify(payload));
            const retryHeaders = new Headers(headers); retryHeaders.delete('content-length');
            response = await send(payload, retryHeaders);
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
      closed = true; capabilities.clear(); chains.clear(); active.clear(); generations.clear();
    },
  };
}
