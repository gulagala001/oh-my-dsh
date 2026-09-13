import { randomUUID } from 'node:crypto';

const maximumEntries = 200, maximumBody = 1024 * 1024;

// Observe the selected page's existing traffic. Never replay a request to obtain
// its body: authenticated POSTs and downloads may have non-repeatable effects.
export function observeNetwork(record) {
  const entries = new Map(), requests = new WeakMap();
  record.network = { entries, dropped: 0, observedSince: Date.now() };
  record.page.on('request', request => {
    const id = randomUUID(), redirectedFrom = requests.get(request.redirectedFrom());
    requests.set(request, id);
    entries.set(id, { request, summary: { id, url: request.url(), method: request.method(), resourceType: request.resourceType(), startedAt: Date.now(), state: 'pending', ...(redirectedFrom ? { redirectedFrom } : {}) } });
    while (entries.size > maximumEntries) { entries.delete(entries.keys().next().value); record.network.dropped++; }
  });
  record.page.on('response', response => {
    const entry = entries.get(requests.get(response.request()));
    if (entry) { entry.response = response; Object.assign(entry.summary, { status: response.status(), statusText: response.statusText() }); }
  });
  record.page.on('requestfinished', request => {
    const entry = entries.get(requests.get(request));
    if (entry) Object.assign(entry.summary, { state: 'finished', finishedAt: Date.now() });
  });
  record.page.on('requestfailed', request => {
    const entry = entries.get(requests.get(request));
    if (entry) Object.assign(entry.summary, { state: 'failed', finishedAt: Date.now(), failure: request.failure()?.errorText ?? 'Request failed' });
  });
}

export function listNetwork(record, { limit = 50, url } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > maximumEntries) throw new TypeError('limit must be an integer from 1 to 200.');
  if (url !== undefined && typeof url !== 'string') throw new TypeError('url must be a substring filter.');
  const state = record.network;
  const matches = [...state.entries.values()].map(entry => entry.summary).filter(entry => !url || entry.url.includes(url));
  return { requests: matches.slice(-limit).map(entry => ({ ...entry })), observedSince: state.observedSince, dropped: state.dropped, hasMore: matches.length > limit };
}

function entryFor(record, id) {
  const entry = record.network.entries.get(id);
  if (!entry) throw new Error('Unknown or expired request ID. Read the current network request list.');
  return entry;
}
function bodyContent(bytes, contentType = '') {
  const truncated = bytes.length > maximumBody, shown = bytes.subarray(0, maximumBody);
  const mime = contentType.split(';')[0].trim().toLowerCase();
  let binary = !(mime.startsWith('text/') || ['application/json','application/xml','application/javascript','application/x-javascript','application/x-www-form-urlencoded'].includes(mime) || mime.endsWith('+json') || mime.endsWith('+xml'));
  let decoded;
  if (!binary) try { decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(shown); } catch { binary = true; }
  return { encoding: binary ? 'base64' : 'utf8', content: binary ? shown.toString('base64') : decoded, bytes: bytes.length, truncated, contentType };
}
export async function networkRequest(record, id, signal) {
  const entry = entryFor(record, id); signal?.throwIfAborted();
  const [requestHeaders, responseHeaders] = await Promise.all([entry.request.allHeaders(), entry.response?.allHeaders() ?? null]);
  signal?.throwIfAborted();
  const body = entry.request.postDataBuffer();
  return { ...entry.summary, requestHeaders, responseHeaders, requestBody: body ? bodyContent(body, requestHeaders['content-type']) : null };
}
export async function networkResponseBody(record, id, signal) {
  const entry = entryFor(record, id); signal?.throwIfAborted();
  if (!entry.response || entry.summary.state !== 'finished') throw new Error('The response has not completed successfully; inspect its request state first.');
  const headers = await entry.response.allHeaders();
  const sizes = await entry.response.request().sizes();
  if (sizes.responseBodySize > maximumBody) throw new Error('Response exceeds the 1 MiB diagnostic body limit. Metadata remains available.');
  signal?.throwIfAborted();
  const bytes = await entry.response.body();
  signal?.throwIfAborted();
  if (bytes.length > maximumBody) throw new Error('Decoded response exceeds the 1 MiB diagnostic body limit. Metadata remains available.');
  return { id, ...bodyContent(bytes, headers['content-type']) };
}
