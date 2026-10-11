import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readExportForms, preserveExportForms } from './browser-form-export.mjs';

const exportable = new Set(['font', 'image', 'stylesheet', 'video']);
const assetStyles = ['background-image', 'border-image-source', 'cursor', 'list-style-image', 'mask-image'];
const stale = () => Object.assign(new Error('The page or asset inventory changed. List the current page assets again.'), { code: 'STALE_ASSET_INVENTORY' });
function check(record, generation, signal) {
  signal?.throwIfAborted();
  if (record.page.isClosed() || record.generation !== generation) throw stale();
}
const assetId = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
function pathnameOf(url) {
  try { return new URL(url, 'https://example.invalid').pathname; } catch { return url.split(/[?#]/, 1)[0] ?? url; }
}
function kindOf(url) {
  const path = pathnameOf(url).toLowerCase();
  if (/\.(avif|gif|ico|jpe?g|png|svg|webp)$/.test(path)) return 'image';
  if (/\.(mp4|mov|m4v|webm)$/.test(path)) return 'video';
  if (/\.(otf|ttf|woff2?)$/.test(path)) return 'font';
  if (/\.css$/.test(path)) return 'stylesheet';
  if (/\.m?js$/.test(path)) return 'script';
  return 'other';
}
function nameOf(url) {
  const name = pathnameOf(url).split('/').filter(Boolean).at(-1);
  if (!name) return url;
  let hash;
  try { hash = new URL(url, 'https://example.invalid').hash.slice(1); } catch { hash = url.split('#', 2)[1]; }
  return hash ? `${name}#${hash}` : name;
}
const absoluteUrl = (url, base) => { try { return new URL(url, base || undefined).toString(); } catch { return url; } };
const resourceKind = entry => kindOf(entry.name) !== 'other' ? kindOf(entry.name) : ({ css: 'stylesheet', font: 'font', img: 'image', script: 'script', video: 'video' }[entry.initiatorType] ?? 'other');
const snapshotString = (strings, index) => index == null || index < 0 ? '' : strings[index] ?? '';
function addAsset(assets, url, kind, source, observedOnly = false) {
  const current = assets.get(url);
  if (current) {
    current.sources.push(source);
    if (current.kind === 'other' && kind !== 'other') current.kind = kind;
  } else if (!observedOnly) assets.set(url, { id: assetId(url), kind: kind === 'other' ? kindOf(url) : kind, name: nameOf(url), sources: [source], url });
}
function annotateSnapshot(assets, snapshot) {
  const document = snapshot.documents[0];
  if (!document) return;
  const { strings } = snapshot, base = snapshotString(strings, document.documentURL);
  for (const [index, nodeId] of (document.nodes.backendNodeId ?? []).entries()) {
    if (nodeId <= 0) continue;
    const tag = snapshotString(strings, document.nodes.nodeName?.[index]).toLowerCase(), attributes = {};
    const pairs = document.nodes.attributes?.[index] ?? [];
    for (let offset = 0; offset < pairs.length; offset += 2) attributes[snapshotString(strings, pairs[offset])] = snapshotString(strings, pairs[offset + 1]);
    const add = (property, kind, srcset = false) => {
      const value = attributes[property];
      if (!value) return;
      const urls = srcset ? value.split(',').map(item => item.trim().split(/\s+/, 1)[0]).filter(Boolean) : [value];
      for (const url of urls) addAsset(assets, absoluteUrl(url, base), kind, { kind: 'attribute', nodeId, property }, true);
    };
    if (tag === 'img') { add('src', 'image'); add('srcset', 'image', true); }
    else if (tag === 'source') { add('src', 'video'); add('srcset', 'image', true); }
    else if (tag === 'video') { add('poster', 'image'); add('src', 'video'); }
    else if (tag === 'script') add('src', 'script');
    else if (tag === 'link') add('href', attributes.rel === 'stylesheet' ? 'stylesheet' : 'other');
    else if (tag === 'use') { add('href', 'image'); add('xlink:href', 'image'); }
  }
  for (const [index, nodeIndex] of (document.layout?.nodeIndex ?? []).entries()) {
    const nodeId = document.nodes.backendNodeId?.[nodeIndex];
    if (nodeId == null || nodeId <= 0) continue;
    for (const [styleIndex, property] of assetStyles.entries()) {
      const value = snapshotString(strings, document.layout.styles[index]?.[styleIndex]);
      for (const match of value.matchAll(/url\((["']?)(.*?)\1\)/g)) {
        const url = match[2]?.trim();
        if (url) addAsset(assets, absoluteUrl(url, base), 'image', { kind: 'computedStyle', nodeId, property }, true);
      }
    }
  }
}

export async function listPageAssets(record, signal) {
  const generation = record.generation;
  check(record, generation, signal);
  const pageUrl = record.page.url();
  const [snapshot, entries, svgs] = await Promise.all([
    record.cdp.send('DOMSnapshot.captureSnapshot', { computedStyles: [...assetStyles], includeDOMRects: false }),
    record.page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ name: entry.name, initiatorType: entry.initiatorType }))),
    record.page.evaluate(() => Array.from(document.querySelectorAll('svg')).map((svg, index) => ({ markup: svg.outerHTML, name: svg.getAttribute('aria-label') || svg.querySelector('title')?.textContent?.trim() || svg.id || `svg-${index + 1}` }))),
  ]);
  check(record, generation, signal);
  if (record.page.url() !== pageUrl) throw stale();
  const assets = new Map();
  for (const entry of entries ?? []) if (entry.name) addAsset(assets, entry.name, resourceKind(entry), { kind: 'resource', ...(entry.initiatorType === undefined ? {} : { property: entry.initiatorType }) });
  annotateSnapshot(assets, snapshot);
  const inlineSvgs = (svgs ?? []).flatMap((svg, index) => svg.markup ? [{ id: assetId(`${index}:${svg.markup}`), markup: svg.markup, name: svg.name || `svg-${index + 1}` }] : []);
  const byKind = { font: 0, image: 0, other: 0, script: 0, stylesheet: 0, video: 0 };
  for (const asset of assets.values()) byKind[asset.kind]++;
  const result = { id: randomUUID(), pageUrl, assets: [...assets.values()], inlineSvgs, summary: { byKind, inlineSvgCount: inlineSvgs.length, totalCount: assets.size } };
  const assetsById = new Map(result.assets.map(asset => [asset.id, { source: 'page-asset', asset }]));
  for (const asset of inlineSvgs) assetsById.set(asset.id, { source: 'inline-svg', asset });
  const inventory = { result, assetsById, generation };
  record.assetInventories ??= new Map();
  record.assetInventories.set(result.id, inventory);
  record.assetInventory = inventory;
  return result;
}

function contentTypeOf(tree, url) {
  if (!tree) return null;
  const type = tree.resources?.find(resource => resource.url === url)?.mimeType;
  if (type != null) return type;
  for (const child of tree.childFrames ?? []) { const result = contentTypeOf(child, url); if (result != null) return result; }
  return null;
}
function normalizedContentType(type) {
  const value = type?.split(';', 1)[0]?.trim().toLowerCase();
  return value ? /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(value) ? value : 'invalid' : null;
}
function validContentType(asset, type) {
  if (type === 'application/octet-stream') return kindOf(asset.url) === asset.kind;
  if (type == null) return asset.kind === 'stylesheet';
  if (asset.kind === 'font') return type.startsWith('font/') || ['application/font-woff', 'application/font-woff2', 'application/vnd.ms-fontobject', 'application/x-font-opentype', 'application/x-font-ttf'].includes(type);
  if (asset.kind === 'image') return type.startsWith('image/');
  if (asset.kind === 'stylesheet') return type === 'text/css';
  return asset.kind === 'video' && type.startsWith('video/');
}
function assetExtension(url) {
  const name = pathnameOf(url).split('/').at(-1) ?? '', dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).replace(/[^a-zA-Z0-9._%-]/g, '_') : '';
}
async function fetchPageAsset(url) {
  const response = await fetch(url, { credentials: 'include', method: 'GET' });
  if (!response.ok) throw new Error(`Asset request failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return { base64: btoa(binary), contentType: response.headers.get('content-type') };
}
async function readAsset(record, url, allowFallback, generation, signal) {
  let loadedError;
  try {
    const { frameTree } = await record.cdp.send('Page.getFrameTree');
    if (!frameTree?.frame?.id) throw new Error('Unable to determine frame id');
    await record.cdp.send('Page.enable');
    const [content, resources] = await Promise.all([
      record.cdp.send('Page.getResourceContent', { frameId: frameTree.frame.id, url }),
      record.cdp.send('Page.getResourceTree'),
    ]);
    check(record, generation, signal);
    return { data: Buffer.from(content.content, content.base64Encoded === true ? 'base64' : 'utf8'), contentType: contentTypeOf(resources.frameTree, url) };
  } catch (error) { check(record, generation, signal); loadedError = error; }
  await allowFallback(url);
  check(record, generation, signal);
  try {
    const response = await record.page.evaluate(fetchPageAsset, url);
    check(record, generation, signal);
    if (!response || typeof response.base64 !== 'string') throw new Error('Unable to bundle asset');
    return { data: Buffer.from(response.base64, 'base64'), contentType: response.contentType };
  } catch (error) {
    check(record, generation, signal);
    throw new Error(`Loaded resource fetch failed: ${loadedError?.message ?? 'Asset bundling failed'}; page fetch failed: ${error?.message ?? 'Asset bundling failed'}`, { cause: error });
  }
}

export async function bundlePageAssets(record, options, signal, { ensureDownloadAllowed, ensureAssetAllowed, ensureFallbackFetchAllowed } = {}) {
  const inventory = record.assetInventories?.get(options?.inventoryId) ?? (record.assetInventory?.result.id === options?.inventoryId ? record.assetInventory : null), started = performance.now();
  if (!inventory || inventory.result.pageUrl !== record.page.url()) throw stale();
  check(record, inventory.generation, signal);
  const { assetIds, kinds } = options;
  if (assetIds !== undefined && (!Array.isArray(assetIds) || assetIds.some(id => typeof id !== 'string'))) throw new TypeError('assetIds must be an array of IDs from list().');
  if (kinds !== undefined && (!Array.isArray(kinds) || kinds.some(kind => !exportable.has(kind)))) throw new TypeError('kinds supports font, image, stylesheet and video.');
  const available = inventory.assetsById;
  if (assetIds?.some(id => !available.has(id))) throw new Error('Asset bundle request included unknown asset ids');
  const selected = (assetIds ? [...new Set(assetIds)].map(id => available.get(id)) : [...available.values()]).filter(item => kinds == null || kinds.includes(item.source === 'inline-svg' ? 'image' : item.asset.kind));
  const supported = item => item.source === 'inline-svg' || exportable.has(item.asset.kind);
  if (assetIds != null && selected.some(item => !supported(item))) throw new Error('Asset bundle request included unsupported asset kinds');
  const requested = selected.filter(supported);
  if (!requested.length) throw new Error('Asset bundle request matched no discovered assets');
  await ensureDownloadAllowed?.(inventory.result.pageUrl);
  check(record, inventory.generation, signal);
  const directoryPath = await mkdtemp(join(tmpdir(), 'trisoul-cu-assets-')), assets = [], failures = [];
  let bytesWritten = 0, permissionError, approvalQueue = Promise.resolve();
  const approvals = new Map();
  const allowFallback = url => {
    if (typeof ensureFallbackFetchAllowed !== 'function') throw new Error('Loaded resource is unavailable and page asset fallback authorization is not configured');
    // A DSH file policy can distinguish paths on one origin. Reuse approval
    // only for the exact source passed to that policy.
    const key = url;
    if (approvals.has(key)) return approvals.get(key);
    const approval = approvalQueue.then(async () => {
      if (permissionError) throw permissionError;
      try { await ensureFallbackFetchAllowed(url, inventory.result.pageUrl); }
      catch (error) { permissionError = error instanceof Error ? error : new Error('Page asset fallback download approval failed'); throw permissionError; }
    });
    approvals.set(key, approval); approvalQueue = approval.catch(() => {});
    return approval;
  };
  try {
    for (const item of requested) {
      check(record, inventory.generation, signal);
      if (record.page.url() !== inventory.result.pageUrl) throw stale();
      const asset = item.asset, inlineSvg = item.source === 'inline-svg', url = inlineSvg ? `inline-svg:${asset.id}` : asset.url;
      await ensureAssetAllowed?.(inlineSvg ? inventory.result.pageUrl : url, inventory.result.pageUrl);
      check(record, inventory.generation, signal);
      try {
        const response = inlineSvg ? { data: Buffer.from(asset.markup, 'utf8'), contentType: 'image/svg+xml' } : await readAsset(record, url, allowFallback, inventory.generation, signal);
        const { data, contentType } = response, type = normalizedContentType(contentType);
        if (!inlineSvg && !validContentType(asset, type)) { failures.push({ contentType: type, id: asset.id, name: asset.name, reason: `Asset response type ${type ?? 'missing'} is not valid for ${asset.kind}`, url }); continue; }
        check(record, inventory.generation, signal);
        if (data.length > 32 * 1024 * 1024 || bytesWritten + data.length > 128 * 1024 * 1024) throw new Error('Asset export limit reached (32 MiB per file, 128 MiB per bundle).');
        const path = join(directoryPath, asset.id + (inlineSvg ? '.svg' : assetExtension(url)));
        await writeFile(path, data, { flag: 'wx', mode: 0o600 }); bytesWritten += data.length;
        assets.push({ contentType, id: asset.id, kind: inlineSvg ? 'image' : asset.kind, name: asset.name, path, url });
      } catch (error) {
        check(record, inventory.generation, signal);
        if (permissionError) throw permissionError;
        failures.push({ contentType: null, id: asset.id, name: asset.name, reason: error.message, url });
      }
    }
    check(record, inventory.generation, signal);
    const manifestPath = join(directoryPath, 'manifest.json');
    const result = { assets, directoryPath, failures, manifestPath, summary: { downloadedCount: assets.length, elapsedMs: performance.now() - started, failedCount: failures.length, requestedCount: requested.length } };
    await writeFile(manifestPath, JSON.stringify({ ...result, inventoryId: inventory.result.id, pageUrl: inventory.result.pageUrl }, null, 2), { flag: 'wx', mode: 0o600 });
    check(record, inventory.generation, signal);
    return result;
  } catch (error) { await rm(directoryPath, { recursive: true, force: true }); throw error; }
}

export async function exportPageContent(record, signal, frameBindings) {
  const generation = record.generation, bindings = await frameBindings();
  const before = await readExportForms(bindings);
  check(record, generation, signal);
  const { data } = await record.cdp.send('Page.captureSnapshot', { format: 'mhtml' });
  const after = await readExportForms(bindings);
  check(record, generation, signal);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Page form values changed while exporting. Try again when the page is stable.');
  const snapshot = preserveExportForms(data, before);
  const directory = await mkdtemp(join(tmpdir(), 'trisoul-cu-page-'));
  try {
    const path = join(directory, 'page.mhtml');
    await writeFile(path, snapshot, { flag: 'wx', mode: 0o600 });
    check(record, generation, signal);
    return path;
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}

const workspaceFormats = {
  document: new Set(['pdf', 'md', 'docx']),
  spreadsheets: new Set(['pdf', 'xlsx', 'csv']),
  presentation: new Set(['pdf', 'pptx']),
};
const allWorkspaceFormats = new Set(['pdf', 'md', 'xlsx', 'csv', 'docx', 'pptx']);
function workspaceDocument(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.host !== 'docs.google.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean), docType = parts[0];
  if (!Object.hasOwn(workspaceFormats, docType)) return null;
  const index = parts.indexOf('d', 1), docId = index < 0 ? null : parts[index + 1];
  return !docId || parts.at(-1) === 'pub' ? null : { docId, docType, url: parsed };
}
const cleanWorkspaceMarkdown = text => text.replace(/^\s*\[[^\]]+\]:\s*<data:[^>]+>\s*\n?/gm, '').trim();
function exportName(title, fallback = 'ExportedContent') {
  const parts = (title ?? 'Asset').split(' - ');
  const name = (parts.length > 1 && parts.at(-1)?.startsWith('Google') ? parts.slice(0, -1).join(' - ') : parts.join(' - ')).replaceAll(/[/\\?%*|"<>:]/g, '_').trim();
  return name || fallback;
}
async function fetchWorkspaceExport(url) {
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) throw new Error(`GSuite export request failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return { base64: btoa(binary) };
}
async function writeContentExport(record, generation, signal, name, data) {
  check(record, generation, signal);
  const directory = await mkdtemp(join(tmpdir(), 'trisoul-cu-export-'));
  try {
    const path = join(directory, name);
    await writeFile(path, data, { flag: 'wx', mode: 0o600 });
    check(record, generation, signal);
    return path;
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}

export async function exportGsuiteContent(record, format, signal) {
  if (typeof format !== 'string' || !allWorkspaceFormats.has(format)) throw new Error('tab_content_export_gsuite requires supported format');
  const generation = record.generation, pageUrl = record.page.url(), document = workspaceDocument(pageUrl);
  check(record, generation, signal);
  if (!document) throw new Error('Tab is not a Google Workspace document');
  if (!workspaceFormats[document.docType].has(format)) throw new Error('GSuite export type is not supported for this tab');
  const url = new URL(`https://docs.google.com/${document.docType}/d/${document.docId}/export`);
  url.searchParams.set('format', format);
  const tab = document.url.searchParams.get('tab');
  if (tab != null) url.searchParams.append('tab', tab);
  url.hash = document.url.hash;
  const title = await record.page.title(), result = await record.page.evaluate(fetchWorkspaceExport, url.toString());
  check(record, generation, signal);
  if (record.page.url() !== pageUrl) throw new Error('The selected tab changed while being read');
  if (!result || typeof result.base64 !== 'string') throw new Error('Unable to export GSuite content for this tab');
  const bytes = Buffer.from(result.base64, 'base64');
  const data = format === 'md' ? Buffer.from(cleanWorkspaceMarkdown(bytes.toString('utf8')), 'utf8') : bytes;
  if (!data.length) throw new Error('Unable to export GSuite content for this tab');
  return await writeContentExport(record, generation, signal, `${exportName(title)}-${randomUUID()}.${format}`, data);
}

const transcriptLimits = { fetchTimeoutMs: 8000, maxItems: 5000, maxJsonBytes: 5 * 1024 * 1024, maxTextBytes: 500000, observationTimeoutMs: 4000 };
function youtubeVideoId(url) {
  try {
    const parsed = new URL(url), id = parsed.searchParams.get('v');
    return parsed.protocol === 'https:' && ['www.youtube.com', 'youtube.com'].includes(parsed.hostname) && parsed.pathname === '/watch' && id != null && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

// The player triggers its own caption URL; restore its subtitle state before
// fetching that observed request. Do not derive a private endpoint from a video ID.
async function observeYoutubeTranscript({ videoId, limits }) {
  const call = (target, method) => {
    const fn = Reflect.get(target, method);
    return typeof fn === 'function' ? Reflect.apply(fn, target, []) : undefined;
  };
  const player = () => {
    const element = document.querySelector('ytd-player'), getPlayer = element == null ? null : Reflect.get(element, 'getPlayer');
    if (typeof getPlayer === 'function' && element != null) {
      const result = Reflect.apply(getPlayer, element, []);
      if (result != null && typeof result === 'object') return result;
    }
    return document.querySelector('#movie_player');
  };
  const state = () => {
    const current = player();
    let url;
    try { url = new URL(location.href); } catch { return { player: current, playerVideoId: null, urlVideoId: null }; }
    const data = current == null ? null : call(current, 'getVideoData'), id = data != null && typeof data === 'object' ? Reflect.get(data, 'video_id') : null;
    return { player: current, playerVideoId: typeof id === 'string' ? id : null, urlVideoId: url.searchParams.get('v') };
  };
  const matches = value => value.player != null && value.playerVideoId === videoId && value.urlVideoId === videoId;
  const before = state();
  if (!matches(before)) return null;
  const current = before.player;
  if (['getVideoData', 'isSubtitlesOn', 'toggleSubtitles', 'toggleSubtitlesOn'].some(method => typeof Reflect.get(current, method) !== 'function')) return null;
  const started = performance.now();
  let captionUrl = null;
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.startTime + 0.5 < started) continue;
      try {
        const url = new URL(entry.name);
        if (url.protocol === 'https:' && url.hostname === 'www.youtube.com' && url.pathname === '/api/timedtext' && url.searchParams.get('v') === videoId) captionUrl = entry.name;
      } catch {}
    }
  });
  observer.observe({ buffered: true, type: 'resource' });
  const subtitlesOn = !!call(current, 'isSubtitlesOn');
  try {
    if (subtitlesOn) call(current, 'toggleSubtitles');
    call(current, 'toggleSubtitlesOn');
    const deadline = Date.now() + limits.observationTimeoutMs;
    while (Date.now() < deadline && captionUrl == null) await new Promise(resolve => setTimeout(resolve, 150));
  } finally {
    try {
      const after = state();
      if (matches(after) && after.player === current) {
        const enabled = !!call(current, 'isSubtitlesOn');
        if (subtitlesOn && !enabled) call(current, 'toggleSubtitlesOn');
        else if (!subtitlesOn && enabled) call(current, 'toggleSubtitles');
      }
    } finally { observer.disconnect(); }
  }
  if (captionUrl == null || !matches(state())) return null;
  const url = new URL(captionUrl);
  url.searchParams.set('fmt', 'json3');
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), limits.fetchTimeoutMs);
  try {
    const response = await fetch(url.toString(), { credentials: 'include', signal: controller.signal });
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) return null;
    const length = Number(response.headers.get('content-length') ?? Number.NaN);
    if (Number.isFinite(length) && length > limits.maxJsonBytes) { controller.abort(); return null; }
    const reader = response.body?.getReader();
    let body;
    if (reader == null) {
      body = await response.text();
      if (new TextEncoder().encode(body).byteLength > limits.maxJsonBytes) return null;
    } else {
      const chunks = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value != null) {
          total += value.byteLength;
          if (total > limits.maxJsonBytes) { await reader.cancel(); return null; }
          chunks.push(new Uint8Array(value));
        }
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      body = new TextDecoder().decode(bytes);
    }
    return matches(state()) ? { body, captionKind: url.searchParams.get('kind'), captionLanguage: url.searchParams.get('lang'), pageUrl: location.href } : null;
  } catch { return null; } finally { clearTimeout(timeout); }
}

function transcriptText(response, videoId) {
  if (!response || typeof response !== 'object' || Array.isArray(response) || Object.keys(response).length !== 4 || typeof response.body !== 'string' || typeof response.pageUrl !== 'string' || [response.captionKind, response.captionLanguage].some(value => value !== null && (typeof value !== 'string' || value.length > 100)) || Buffer.byteLength(response.body) > transcriptLimits.maxJsonBytes) return null;
  let events;
  try { events = JSON.parse(response.body)?.events; } catch { return null; }
  if (!Array.isArray(events)) return null;
  const lines = ['YouTube transcript', `Video ID: ${videoId}`, `Language: ${response.captionLanguage ?? 'unknown'}`, `Captions: ${response.captionKind === 'asr' ? 'auto-generated' : 'authored or unspecified'}`, ''];
  let count = 0, bytes = Buffer.byteLength(lines.join('\n')), truncated = false;
  for (const event of events) {
    if (count >= transcriptLimits.maxItems) { truncated = true; break; }
    if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.tStartMs !== 'number' || !Number.isFinite(event.tStartMs) || event.tStartMs < 0 || !Array.isArray(event.segs) || !event.segs.every(segment => segment != null && typeof segment === 'object' && !Array.isArray(segment) && (segment.utf8 === undefined || typeof segment.utf8 === 'string'))) continue;
    const text = event.segs.map(segment => segment.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const seconds = Math.floor(event.tStartMs / 1000), hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), remainder = seconds % 60;
    const time = hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
    const line = `[${time}] ${text}`, length = Buffer.byteLength('\n' + line);
    if (bytes + length > transcriptLimits.maxTextBytes) { truncated = true; break; }
    lines.push(line); bytes += length; count++;
  }
  if (!count) return null;
  if (truncated) lines.push('', '[Transcript truncated]');
  return { pageUrl: response.pageUrl, text: lines.join('\n'), truncated };
}

export async function exportYouTubeTranscript(record, signal) {
  const generation = record.generation, videoId = youtubeVideoId(record.page.url());
  check(record, generation, signal);
  if (videoId == null) throw new Error('Tab is not a supported YouTube watch page');
  const response = await record.page.evaluate(observeYoutubeTranscript, { videoId, limits: transcriptLimits });
  check(record, generation, signal);
  const transcript = transcriptText(response, videoId);
  if (transcript == null || youtubeVideoId(transcript.pageUrl) !== videoId) throw new Error('No transcript is available for this YouTube video');
  if (youtubeVideoId(record.page.url()) !== videoId) throw new Error('YouTube video changed before its transcript was exported');
  return await writeContentExport(record, generation, signal, `youtube-${videoId}-${randomUUID()}.txt`, Buffer.from(transcript.text, 'utf8'));
}
