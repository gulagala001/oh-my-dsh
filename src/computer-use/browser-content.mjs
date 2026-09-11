import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exportable = new Set(['font', 'image', 'stylesheet', 'video']);
const stale = () => Object.assign(new Error('The page or asset inventory changed. List the current page assets again.'), { code: 'STALE_ASSET_INVENTORY' });
function check(record, generation, signal) {
  signal?.throwIfAborted();
  if (record.page.isClosed() || record.generation !== generation) throw stale();
}
function nameOf(url) {
  try { return decodeURIComponent(new URL(url).pathname.split('/').at(-1)) || 'asset'; } catch { return 'asset'; }
}
const fileName = name => name.replace(/[^\p{L}\p{N}._-]/gu, '_').replace(/^\.+/, '').slice(0, 100) || 'asset';
const kindOf = resource => ({ Image: 'image', Font: 'font', Stylesheet: 'stylesheet', Script: 'script', Media: resource.mimeType?.startsWith('video/') ? 'video' : 'other' }[resource.type] ?? 'other');

// This runs in the document. Read the current rendered DOM, including open
// shadow roots; never navigate to resource URLs or invoke page application APIs.
function renderedAssets() {
  const assets = [], inlineSvgs = [], loadErrors = [], roots = [document]; let scanned = 0, truncated = false;
  const add = (url, kind, property, source = 'attribute') => {
    if (!url || assets.length >= 5000) { if (url) truncated = true; return; }
    try { assets.push({ url: new URL(url, document.baseURI).href, kind, source: { kind: source, property } }); } catch {}
  };
  for (const root of roots) for (const el of root.querySelectorAll('*')) {
    if (++scanned > 20000) { truncated = true; break; }
    if (el.shadowRoot) roots.push(el.shadowRoot);
    const tag = el.localName;
    if (tag === 'link' && el.relList.contains('stylesheet')) add(el.href, 'stylesheet', 'href');
    if (tag === 'script') add(el.src, 'script', 'src');
    if (!el.getClientRects().length) continue;
    if (tag === 'img') {
      const url = el.currentSrc || el.src;
      add(url, 'image', 'src');
      if (url && el.complete && !el.naturalWidth) loadErrors.push(url);
    }
    if (tag === 'video') { add(el.currentSrc || el.src, 'video', 'src'); add(el.poster, 'image', 'poster'); }
    if (tag === 'svg' && !el.parentElement?.closest('svg')) {
      if (inlineSvgs.length < 500) inlineSvgs.push({ markup: el.outerHTML, name: el.getAttribute('aria-label') || el.id || 'inline-svg' });
      else truncated = true;
    }
    for (const pseudo of [null, '::before', '::after']) {
      const style = getComputedStyle(el, pseudo);
      for (const property of ['background-image', 'mask-image', 'list-style-image']) {
        for (const match of style.getPropertyValue(property).matchAll(/url\(\s*["']?(.*?)["']?\s*\)/g)) add(match[1], 'image', (pseudo || '') + property, 'computedStyle');
      }
    }
  }
  return { assets, inlineSvgs, loadErrors, truncated };
}

export async function listPageAssets(record, signal) {
  const generation = record.generation;
  const [dom, tree] = await Promise.all([record.page.evaluate(renderedAssets), record.cdp.send('Page.getResourceTree')]);
  check(record, generation, signal);
  const assets = new Map(), resources = new Map();
  const add = (url, kind, source) => {
    let asset = assets.get(url);
    if (!asset) { asset = { id: randomUUID(), kind, name: nameOf(url), sources: [], url }; assets.set(url, asset); }
    if (asset.kind === 'other') asset.kind = kind;
    if (!asset.sources.some(value => JSON.stringify(value) === JSON.stringify(source))) asset.sources.push(source);
  };
  const walk = node => {
    for (const resource of node.resources ?? []) {
      resources.set(resource.url, { ...resource, frameId: node.frame.id });
      add(resource.url, kindOf(resource), { kind: 'resource' });
    }
    for (const child of node.childFrames ?? []) walk(child);
  };
  walk(tree.frameTree);
  for (const asset of dom.assets) add(asset.url, asset.kind, asset.source);
  const byKind = {};
  for (const asset of assets.values()) byKind[asset.kind] = (byKind[asset.kind] ?? 0) + 1;
  const result = { id: randomUUID(), pageUrl: record.page.url(), assets: [...assets.values()], inlineSvgs: dom.inlineSvgs.map(svg => ({ id: randomUUID(), ...svg })), summary: { byKind, inlineSvgCount: dom.inlineSvgs.length, totalCount: assets.size }, truncated: dom.truncated };
  record.assetInventory = { result, resources, generation, loadErrors: new Set(dom.loadErrors), frameId: tree.frameTree.frame.id };
  return result;
}

export async function bundlePageAssets(record, options, signal) {
  const inventory = record.assetInventory, started = performance.now();
  if (!inventory || options?.inventoryId !== inventory.result.id) throw stale();
  check(record, inventory.generation, signal);
  const { assetIds, kinds } = options;
  if (assetIds !== undefined && (!Array.isArray(assetIds) || assetIds.some(id => typeof id !== 'string'))) throw new TypeError('assetIds must be an array of IDs from list().');
  if (kinds !== undefined && (!Array.isArray(kinds) || kinds.some(kind => !exportable.has(kind)))) throw new TypeError('kinds supports font, image, stylesheet and video.');
  const available = new Map(inventory.result.assets.map(asset => [asset.id, asset]));
  if (assetIds?.some(id => !available.has(id))) throw new Error('An asset ID is absent from this inventory.');
  const selected = (assetIds ? [...new Set(assetIds)].map(id => available.get(id)) : inventory.result.assets).filter(asset => kinds ? kinds.includes(asset.kind) : assetIds || exportable.has(asset.kind));
  const directoryPath = await mkdtemp(join(tmpdir(), 'trisoul-cu-assets-')), assets = [], failures = [];
  let bytesWritten = 0;
  try {
    for (const asset of selected) {
      check(record, inventory.generation, signal);
      if (record.assetInventory !== inventory) throw stale();
      const resource = inventory.resources.get(asset.url);
      const contentType = resource?.mimeType ?? (asset.url.startsWith('data:') ? asset.url.slice(5).split(/[;,]/)[0] || 'text/plain' : null);
      try {
        if (!exportable.has(asset.kind)) throw new Error('This asset kind is inventory-only; scripts are not bundled.');
        if (resource?.failed || resource?.canceled || inventory.loadErrors.has(asset.url)) throw new Error('This asset failed to load in the observed page.');
        let data;
        if (asset.url.startsWith('data:')) {
          const comma = asset.url.indexOf(',');
          if (comma < 0) throw new Error('Invalid data URL');
          data = /;base64$/i.test(asset.url.slice(0, comma)) ? Buffer.from(asset.url.slice(comma + 1), 'base64') : Buffer.from(decodeURIComponent(asset.url.slice(comma + 1)));
        } else {
          const response = await record.cdp.send('Page.getResourceContent', { frameId: resource?.frameId ?? inventory.frameId, url: asset.url });
          data = Buffer.from(response.content, response.base64Encoded ? 'base64' : 'utf8');
        }
        check(record, inventory.generation, signal);
        if (data.length > 32 * 1024 * 1024 || bytesWritten + data.length > 128 * 1024 * 1024) throw new Error('Asset export limit reached (32 MiB per file, 128 MiB per bundle).');
        const path = join(directoryPath, `${assets.length + 1}-${fileName(asset.name)}`);
        await writeFile(path, data, { flag: 'wx', mode: 0o600 }); bytesWritten += data.length;
        assets.push({ contentType, id: asset.id, kind: asset.kind, name: asset.name, path, url: asset.url });
      } catch (error) {
        check(record, inventory.generation, signal);
        failures.push({ contentType, id: asset.id, name: asset.name, reason: error.message, url: asset.url });
      }
    }
    check(record, inventory.generation, signal);
    const manifestPath = join(directoryPath, 'manifest.json');
    const result = { assets, directoryPath, failures, manifestPath, summary: { downloadedCount: assets.length, elapsedMs: Math.round(performance.now() - started), failedCount: failures.length, requestedCount: selected.length } };
    await writeFile(manifestPath, JSON.stringify({ ...result, inventoryId: inventory.result.id, pageUrl: inventory.result.pageUrl }, null, 2), { flag: 'wx', mode: 0o600 });
    check(record, inventory.generation, signal);
    return result;
  } catch (error) { await rm(directoryPath, { recursive: true, force: true }); throw error; }
}

export async function exportPageContent(record, signal) {
  const generation = record.generation;
  const { data } = await record.cdp.send('Page.captureSnapshot', { format: 'mhtml' });
  check(record, generation, signal);
  const directory = await mkdtemp(join(tmpdir(), 'trisoul-cu-page-'));
  try {
    const path = join(directory, 'page.mhtml');
    await writeFile(path, data, { flag: 'wx', mode: 0o600 });
    check(record, generation, signal);
    return path;
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}
