import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, readFile, writeFile, rename, realpath, open, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime, DEFAULT_DATA_DIR } from '../runtime.mjs';
import { publicConfig } from './config.mjs';
import { modelResult } from './model-output.mjs';
import { createSidebarDownloads } from './downloads.mjs';
import { createBrowserResources } from '../browser/resources.mjs';
import { createDeliveryFiles } from './delivery-files.mjs';
import { createImageRegistry } from './image-registry.mjs';
import { createAppApprovals } from './app-approvals.mjs';
import { createBrowserPairing } from '../extension/pairing.mjs';
import { listenExtension } from '../extension/listen.mjs';
import { referenceMatches, sameIdentity, checkExpected, json } from '../protocol.mjs';

const methods = { state: 'getState', targets: 'listTargets', select: 'selectTarget', observe: 'observe', act: 'act', away: 'away', stop: 'stop', interrupt: 'interrupt', userActivity: 'notifyUserActivity', resume: 'resume', deliveries: 'deliveries', permissions: 'permissions', openPermissionSettings: 'openPermissionSettings', requestPermission: 'requestPermission', revealPermissionHelper: 'revealPermissionHelper' };
const active = new Set(['select', 'observe', 'act', 'focus', 'openTarget', 'stop', 'interrupt', 'resume']);

function error(code, message) { return Object.assign(new Error(message), { code }); }
function stripPaths(value) {
  if (Array.isArray(value)) return value.map(stripPaths);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const key of Object.keys(value)) {
    if (key === 'path' || key === 'dataDir' || key === 'base64' || key === 'dataUrl') continue;
    const child = stripPaths(value[key]);
    if (key === '__proto__') Object.defineProperty(result, key, { value: child, enumerable: true, writable: true, configurable: true });
    else result[key] = child;
  }
  return result;
}

/** Lazy shared controller. Only the extension transport owns a loopback listener. */
export function createPluginRuntime(options = {}) {
  const getConfig = options.getConfig || (() => options);
  const browserResources = createBrowserResources();
  const cursorContext = new AsyncLocalStorage();
  let dataDir, starting, controller, bridge, connection, browserPairing, closing, disposed = false;
  let annotations = [], annotationTail = Promise.resolve(), lastObservation = null, revision = 0, activity = null;
  const files = new Map(), imageRefs = new Map();
  const sidebarDownloads = createSidebarDownloads(() => dataDir ?? resolve(getConfig().dataDir || DEFAULT_DATA_DIR));
  const deliveryFiles = createDeliveryFiles(() => dataDir ?? resolve(getConfig().dataDir || DEFAULT_DATA_DIR));
  const appApprovals = createAppApprovals(() => dataDir ?? resolve(getConfig().dataDir || DEFAULT_DATA_DIR), () => options.onAppApprovalsChanged?.());
  let imageRegistry, startedConfig, reconfiguring, recoveryOffer;
  const configurationKey = config => JSON.stringify([config.browserEnabled, config.nativeEnabled, config.extensionEnabled, config.managedHeadless === true]);
  async function start() {
    if (disposed) throw new Error('OpenCU plugin is unloading');
    if (reconfiguring) { await reconfiguring; return start(); }
    const config = getConfig();
    const nextConfig = configurationKey(config);
    if (starting && startedConfig !== nextConfig) {
      reconfiguring = (async () => {
        const previous = await starting;
        const result = await previous.close();
        if (result.ok === false) throw Object.assign(new Error(result.error.message), result.error);
        await Promise.all([annotationTail, imageRegistry?.close()]);
        if (bridge?.listening) await new Promise((done, reject) => bridge.close(error => error ? reject(error) : done()));
        browserPairing?.close(); browserPairing = undefined;
        starting = undefined; controller = undefined; bridge = undefined; connection = undefined;
      })().finally(() => { reconfiguring = undefined; });
      await reconfiguring;
      return start();
    }
    if (!starting) { startedConfig = nextConfig; starting = (async () => {
      dataDir = resolve(config.dataDir || DEFAULT_DATA_DIR);
      await mkdir(dataDir, { recursive: true, mode: 0o700 });
      if (disposed) throw new Error('OpenCU plugin is unloading');
      const token = randomBytes(32).toString('base64url');
      if (config.extensionEnabled !== false) {
        browserPairing = createBrowserPairing(join(dataDir, 'extension'));
        await browserPairing.ready;
      }
      controller = await createRuntime({ ...config, dataDir, token, browserPairing, dshBrowser: options.dshBrowser, nativeOptions: { ...config.nativeOptions, onCursor: cursor => options.onCursor?.(cursor, cursorContext.getStore()) } });
      try {
        try { annotations = JSON.parse(await readFile(join(dataDir, 'annotations.json'), 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (!Array.isArray(annotations)) throw new Error('Invalid persisted annotations');
        imageRegistry = createImageRegistry(() => dataDir);
        await imageRegistry.ready();
        if (controller.extensionRequest) {
          bridge = createServer((req, res) => {
            if (controller.extensionRequest(req, res)) return;
            res.writeHead(404); res.end();
          });
          await listenExtension(bridge);
          connection = { origin: `http://127.0.0.1:${bridge.address().port}`, token };
          await writeFile(join(dataDir, 'extension-connection.json'), JSON.stringify(connection), { mode: 0o600 });
        }
        if (disposed) throw new Error('OpenCU plugin is unloading');
        return controller;
      } catch (error) {
        const result = await controller.close();
        if (bridge?.listening) await new Promise((done, reject) => bridge.close(error => error ? reject(error) : done()));
        if (result.ok === false) throw Object.assign(new Error(result.error.message), result.error);
        browserPairing?.close(); browserPairing = undefined;
        controller = undefined; bridge = undefined; connection = undefined;
        throw error;
      }
    })().catch(error => {
      if (!controller) { starting = undefined; startedConfig = undefined; }
      throw error;
    }); }
    return starting;
  }
  async function privateFile(path, maximum) {
    const root = await realpath(dataDir), actual = await realpath(path);
    if (!actual.startsWith(`${root}${sep}`)) throw error('INVALID_FILE', 'File is outside the plugin data directory');
    const file = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || (maximum && info.size > maximum)) throw error('INVALID_FILE', 'Invalid OpenCU file');
      return file;
    } catch (error) { await file.close(); throw error; }
  }
  async function discardScreenshot(path) {
    if (typeof path !== 'string') return;
    try {
      const root = await realpath(dataDir), source = resolve(path), actual = await realpath(path);
      const expected = source.startsWith(`${dataDir}${sep}`) ? root + source.slice(dataDir.length) : source;
      // Permit the configured root's alias, never links inside a backend capture directory.
      if (actual !== expected || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.png$/i.test(basename(actual))) return;
      if (!['browser/observations', 'extension/observations', 'native/native/screenshots', 'native/native'].some(directory => dirname(actual) === join(root, directory))) return;
      await unlink(actual);
    } catch (failure) { if (failure.code !== 'ENOENT') console.warn('OpenCU screenshot cleanup', failure); }
  }
  async function attachScreenshot(result, attachments, captures) {
    const screenshot = result.observation?.screenshot;
    if (!screenshot) return result;
    if (!attachments?.saveImage) throw error('ATTACHMENTS_UNAVAILABLE', 'Image attachment storage is required for screenshot observations');
    let mediaType = screenshot.mimeType || screenshot.mediaType || 'image/png';
    let base64 = screenshot.base64 || screenshot.data;
    if (!base64 && typeof screenshot.dataUrl === 'string') {
      const match = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(screenshot.dataUrl);
      if (match) { mediaType = match[1]; base64 = match[2]; }
    }
    let bytes;
    if (screenshot.captureId !== undefined) {
      bytes = captures?.get(screenshot.captureId);
      if (!bytes) throw error('INVALID_SCREENSHOT', 'Screenshot has no owned encoded bytes');
      captures.delete(screenshot.captureId);
    } else if (typeof base64 === 'string') bytes = Buffer.from(base64, 'base64');
    else if (screenshot.path) {
      const file = await privateFile(screenshot.path, 32 * 1024 * 1024);
      try { bytes = await file.readFile(); } finally { await file.close(); }
    }
    if (!bytes?.length) throw error('INVALID_SCREENSHOT', 'Screenshot has no encoded bytes');
    const digest = createHash('sha256').update(bytes).digest('hex');
    let image = imageRefs.get(digest);
    if (!image) { image = await attachments.saveImage({ data: bytes, mediaType, name: `opencu-${result.targetId || 'observation'}.png` }); imageRefs.set(digest, image); }
    await imageRegistry.retain(image);
    await discardScreenshot(screenshot.path);
    const { path, captureId, base64: ignored, data, dataUrl, ...metadata } = screenshot;
    return { ...result, observation: { ...result.observation, screenshot: { ...metadata, image } }, image };
  }
  async function deliveries(runtime, attachments, signal, { emit = true, id } = {}) {
    const result = await runtime.deliveries();
    if (result.ok === false) return result;
    const records = [];
    try {
      for (const item of [...result.deliveries, ...await sidebarDownloads.list({ maxResults: 1000 })]) {
        if (id !== undefined && item.id !== id) continue;
        signal?.throwIfAborted();
        const { path, filename, file: ignoredFile, deliverable: ignoredDeliverable, fileExists: ignoredExists, fileError: retainedError, ...metadata } = item;
        let file, fileExists = false, fileError = item.fileExists === false ? retainedError : undefined, source;
        if (item.status === 'complete' && path && item.fileExists !== false) {
          try {
            try {
              source = await privateFile(path);
              if ((await source.stat()).size !== item.bytes) throw error('DELIVERY_CHANGED', 'Delivery bytes changed');
              fileExists = true;
            } catch (failure) {
              if (!['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP', 'INVALID_FILE', 'DELIVERY_CHANGED'].includes(failure.code)) throw failure;
              fileError = { code: failure.code, message: 'The retained download file is missing, changed, or unavailable' };
            }
            if (fileExists && emit !== false) {
              file = files.get(`${item.id}:${item.sha256}`);
              if (!file) {
                if (!attachments?.saveFileStream) throw error('ATTACHMENTS_UNAVAILABLE', 'File attachment storage is required for deliveries');
                const hash = createHash('sha256');
                async function* chunks() {
                  for await (const chunk of source.createReadStream({ autoClose: false })) { signal?.throwIfAborted(); hash.update(chunk); yield chunk; }
                  if (item.sha256 && hash.digest('hex') !== item.sha256) throw error('DELIVERY_CHANGED', 'Delivery digest changed');
                }
                try {
                  file = await attachments.saveFileStream({ data: chunks(), name: item.name, signal });
                  files.set(`${item.id}:${item.sha256}`, file);
                } catch (failure) {
                  if (failure.code !== 'DELIVERY_CHANGED') throw failure;
                  fileExists = false;
                  fileError = { code: failure.code, message: 'The retained download file changed before delivery' };
                }
              }
            }
          } finally { await source?.close(); }
        }
        records.push({ ...stripPaths(metadata), fileExists, ...(fileError ? { fileError } : {}), deliverable: !!file, ...(file ? { file } : {}) });
      }
    } finally { await deliveryFiles.retainAll(records.flatMap(record => record.file ? [record.file] : [])); }
    return { ok: true, deliveries: records };
  }
  async function authorizeApplication(runtime, endpoint, args, sessionKey, signal, onApprovalWait) {
    if (!['select', 'observe', 'act', 'focus', 'resume', 'preview'].includes(endpoint)) return {args};
    if (endpoint === 'resume' && args.browserId !== undefined) return {args};
    const bindingReference = endpoint === 'select' || endpoint === 'focus' && args.reference !== undefined;
    let target;
    if (bindingReference) {
      const inventory = await runtime.listTargets({signal});
      if (inventory.ok === false) throw Object.assign(new Error(inventory.error.message), inventory.error);
      const matches = inventory.targets.filter(value => referenceMatches(value, args.reference));
      if (matches.length !== 1) throw error(matches.length ? 'AMBIGUOUS_TARGET' : 'TARGET_NOT_FOUND', 'Reference must match exactly one live target');
      target = matches[0];
      if (args.reference?.identity && !sameIdentity(target.identity, args.reference.identity)) throw error('TARGET_IDENTITY_CHANGED', 'Reference identity does not match the live application');
      checkExpected(target, args.reference?.expected);
    } else {
      const current = await runtime.getState();
      if (current.ok === false) throw Object.assign(new Error(current.error.message), current.error);
      target = current.state.targets.find(value => value.id === (args.targetId ?? current.state.activeTargetId));
      if (target && args.targetIdentity !== undefined && !sameIdentity(target.identity, args.targetIdentity))
        throw error('TARGET_IDENTITY_CHANGED', 'The bound target occurrence changed; select the live target again');
    }
    if (!target) throw error('TARGET_NOT_SELECTED', 'Select a target first');
    // Keep the selected occurrence across approval and controller queue waits.
    // Neither a peer's selection nor a reused ID can change the approved target.
    const identity = json(target.identity);
    const bound = bindingReference
      ? {...args, reference: {...(typeof args.reference === 'object' ? args.reference : {}), id: target.id, targetId: target.id, identity}}
      : {...args, targetId: target.id, targetIdentity: identity};
    if (target?.backend === 'native') await appApprovals.authorize(target, sessionKey, signal, () => runtime.applicationMetadata(target), onApprovalWait);
    return {args: bound, target};
  }
  async function request(endpoint, args = {}, { attachments, signal, sessionKey, modelProjection = false, onApprovalWait, handBackGuard, onControlStart } = {}) {
    const captures = new Map();
    let acceptingCaptures = true;
    if (disposed) throw new Error('OpenCU plugin is unloading');
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw error('INVALID_ARGUMENT', 'OpenCU payload must be an object');
    if (endpoint === 'appApprovals/read') return { ok: true, approvals: await appApprovals.read() };
    if (endpoint === 'appApprovals/remove') return { ok: true, approvals: await appApprovals.remove(args.bundleIdentifier) };
    if (endpoint === 'appApprovals/pending') return { ok: true, requests: appApprovals.pending(args.conversationId) };
    if (endpoint === 'appApprovals/respond') return { ok: true, ...await appApprovals.respond(args) };
    if (endpoint === 'stop' || endpoint === 'interrupt') appApprovals.cancel(sessionKey);
    if (endpoint === 'browserSettings/status') return { ok: true, connections: controller?.extensionConnections() ?? [] };
    if (endpoint === 'extensionFiles') return { ok: true, path: fileURLToPath(new URL('../../extension/', import.meta.url)) };
    if (endpoint === 'browserResources/status') return { ok: true, resources: await browserResources.status() };
    if (endpoint === 'browserResources/install') return { ok: true, resources: await browserResources.install(signal) };
    if (endpoint === 'downloads/configure') return { ok: true, directory: await sidebarDownloads.location() };
    if (endpoint === 'downloads/update') return { ok: true, download: stripPaths(await sidebarDownloads.update(args.download)) };
    if (endpoint === 'downloads/history') {
      const downloads = stripPaths(await sidebarDownloads.list(args));
      const revision = args.conditional === true ? createHash('sha256').update(JSON.stringify(downloads)).digest('hex') : undefined;
      if (revision && args.after === revision) return { ok: true, revision, unchanged: true };
      return { ok: true, ...(revision ? { revision } : {}), value: { capturedAtMs: Date.now(), downloads, unacknowledgedIds: [] } };
    }
    if (endpoint === 'downloads/remove') return sidebarDownloads.remove(args.id, args.since);
    if (endpoint === 'files/resolve') return deliveryFiles.resolve(args, attachments, signal);
    if (endpoint === 'sources/resolve') {
      if (args.kind === 'file') return deliveryFiles.resolveAttachment(args.attachment, attachments, signal);
      if (args.kind !== 'image') throw error('INVALID_ARGUMENT', 'A source image or file attachment is required');
      const stored = await attachments.readImage(args.attachment, signal);
      signal?.throwIfAborted();
      const ref = stored.ref;
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[ref.mediaType];
      if (!extension) throw error('INVALID_IMAGE', 'Unsupported stored image format');
      const name = ref.name || `image-${ref.attachmentId.slice(7, 19)}`;
      const file = await attachments.saveFileStream({ data: (async function* () { yield stored.data; })(),
        name: /\.(png|jpe?g|webp|gif)$/i.test(name) ? name : `${name}.${extension}`, signal });
      return deliveryFiles.resolveAttachment(file, attachments, signal);
    }
    if (endpoint === 'reconfigure' && !starting) return { ok: true, config: publicConfig(getConfig()) };
    const runtime = await start();
    signal?.throwIfAborted();
    if (endpoint === 'reconfigure') return { ok: true, config: publicConfig(getConfig()) };
    if (endpoint === 'presentationContrast') return { ok: true, ...await runtime.presentationContrast(args) };
    if (endpoint === 'capabilities') return { ok: true, ...runtime.runtimeInfo, config: publicConfig(getConfig()),
      native: await runtime.permissions(), browserResources: await browserResources.status(), connections: runtime.extensionConnections(), pairings: await runtime.browserPairings() };
    if (endpoint === 'connectBrowser') {
      const requested = await runtime.connectBrowser({...args, signal, onApprovalWait});
      return {ok: true, ...requested, browsers: [...runtime.extensionConnections().map(item => ({id: 'extension:' + item.instanceId, name: item.label, provider: 'extension', connected: true})), ...(requested.browsers ?? [])]};
    }
    let browserConnection = null, targetInventory;
    if (endpoint === 'targets') {
      targetInventory = await runtime.listTargets({signal});
      signal?.throwIfAborted();
      // Inventory is not a browser choice. Preserve an explicit ID, existing
      // targets/connections and backend errors without unrelated pairing.
      if (targetInventory.ok !== false && !args.browserId && !targetInventory.targets.length
        && !targetInventory.browsers?.some(browser => browser.connected && !browser.pairingRequired)
        && !targetInventory.errors?.length && sessionKey && runtime.runtimeInfo.backends.extension) {
        browserConnection = await runtime.connectBrowser({signal, onApprovalWait});
        signal?.throwIfAborted();
        targetInventory = await runtime.listTargets({signal});
        signal?.throwIfAborted();
      }
    }
    if (endpoint === 'browserSettings/forget') return {ok: true, ...await runtime.forgetBrowser(args)};
    if (endpoint === 'browserSettings/open') return { ok: true, ...await runtime.openBrowserSettings(args) };
    if (endpoint === 'browserSettings/disconnect') return { ok: true, ...await runtime.disconnectBrowser(args) };
    if (endpoint === 'extensionConnection') {
      if (!connection) throw error('EXTENSION_UNAVAILABLE', 'Browser extension connections are disabled');
      return { ok: true, connection };
    }
    if (endpoint === 'image/resolve') {
      const ref = imageRegistry.get(args.attachmentId);
      if (!ref) throw error('IMAGE_NOT_FOUND', 'Image is not in this OpenCU image registry');
      const stored = await attachments.readImage(ref, signal);
      signal?.throwIfAborted();
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[ref.mediaType];
      if (!extension) throw error('INVALID_IMAGE', 'Unsupported stored image format');
      const file = await attachments.saveFileStream({ data: (async function* () { yield Buffer.from(stored.data); })(),
        name: `image-${ref.attachmentId.slice(7, 19)}.${extension}`, signal });
      await deliveryFiles.retain(file);
      return deliveryFiles.resolve(file, attachments, signal);
    }
    if (endpoint === 'image/save') {
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(args.mediaType) || typeof args.data !== 'string' || args.data.length > 44 * 1024 * 1024) throw error('INVALID_IMAGE', 'An encoded image up to 32 MiB is required');
      const data = Buffer.from(args.data, 'base64');
      if (data.length > 32 * 1024 * 1024) throw error('INVALID_IMAGE', 'Image exceeds 32 MiB');
      const image = await attachments.saveImage({ data, mediaType: args.mediaType, name: args.name });
      await imageRegistry.retain(image);
      return { ok: true, image };
    }
    const authorized = await authorizeApplication(runtime, endpoint, args, sessionKey, signal, onApprovalWait);
    args = authorized.args;
    signal?.throwIfAborted();
    onControlStart?.(authorized.target);
    if (active.has(endpoint)) { revision++; activity = { endpoint, targetId: args.targetId ?? null, at: new Date().toISOString(), status: 'running' }; }
    try {
      let result;
      if (endpoint === 'preview') return runtime.preview(args);
      if (endpoint === 'stopPreview') return runtime.stopPreview(args);
      if (endpoint === 'away') return runtime.away(args, {isCurrent: handBackGuard});
      if (endpoint === 'image') {
        const ref = imageRegistry.get(args.attachmentId);
        if (!ref) throw error('IMAGE_NOT_FOUND', 'Image is not in this OpenCU image registry');
        const stored = await attachments.readImage(ref, signal);
        result = { ok: true, mediaType: ref.mediaType, data: Buffer.from(stored.data).toString('base64') };
      } else if (endpoint === 'annotate') {
        const current = await runtime.getState();
        if (current.ok === false) return current;
        if (!current.state.targets.some(target => target.id === args.targetId)) throw error('TARGET_NOT_SELECTED', 'Select the annotation target first');
        if (!Array.isArray(args.annotations) || args.annotations.length > 100 || args.annotations.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw error('INVALID_ARGUMENT', 'annotations must be at most 100 JSON objects');
        const record = { id: randomUUID(), targetId: args.targetId, observationId: args.observationId ?? null, annotations: args.annotations, note: typeof args.note === 'string' ? args.note.slice(0, 10000) : '', createdAt: new Date().toISOString() };
        const work = annotationTail.then(async () => {
          const next = [...annotations, record].slice(-500), temporary = join(dataDir, 'annotations.json.tmp');
          try {
            await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
            await rename(temporary, join(dataDir, 'annotations.json'));
            annotations = next; return { ok: true, annotation: record };
          } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
        });
        annotationTail = work.catch(() => {});
        result = await work;
      } else if (endpoint === 'focus') result = await runtime.focus(args);
      else if (endpoint === 'openTarget') {
        if (args.backend === 'native') {
          // Only return the launched process identity. The following ordinary
          // select/observe still goes through authorizeApplication above.
          result = await runtime.openTarget(args);
        } else {
          if (args.bundleId || args.path) throw error('INVALID_TARGET', 'Native launch requires backend:native and launch:true');
          const inventory = await runtime.listTargets({signal});
          if (inventory.ok === false) return inventory;
          const matches = inventory.targets.filter(target => target.backend === 'browser' && (!args.browserId || target.browserId === args.browserId) && (!args.targetId || target.id === args.targetId));
          const ids = new Set(matches.map(target => target.browserId));
          if (args.browserId && !args.targetId) {
            result = await runtime.openTarget(args);
          } else {
            if (!matches.length || ids.size !== 1) throw error('AMBIGUOUS_TARGET', 'Choose one real browser inventory ID before opening a tab');
            if (args.targetIdentity !== undefined && !sameIdentity(matches[0].identity, args.targetIdentity))
              throw error('TARGET_IDENTITY_CHANGED', 'The bound target occurrence changed; select the live target again');
            let selected = await runtime.selectTarget(matches[0]);
            if (selected.ok !== false && !selected.target.verified) selected = await runtime.resume({ targetId: selected.target.id, targetIdentity: selected.target.identity });
            if (selected.ok === false) return selected;
            result = await runtime.act({ targetId: selected.target.id, targetIdentity: selected.target.identity, action: 'newTab', url: args.url });
            if (result.ok !== false) result = { ...result, target: result.result?.target };
          }
        }
      } else if (endpoint === 'deliveries') result = await deliveries(runtime, attachments, signal, args);
      else {
        const method = methods[endpoint];
        if (!method || typeof runtime[method] !== 'function') throw error('UNSUPPORTED_METHOD', 'Unknown or unsupported OpenCU operation');
        result = targetInventory ?? await runtime[method](endpoint === 'select' ? args.reference : endpoint === 'observe' ? { ...args, signal, includeBase64: false,
          captureImage(bytes) {
            signal?.throwIfAborted();
            if (!acceptingCaptures) throw error('INVALID_SCREENSHOT', 'Screenshot delivery is no longer active');
            if (!Buffer.isBuffer(bytes) || !bytes.length) throw error('INVALID_SCREENSHOT', 'Screenshot encoded bytes are invalid');
            const id = randomUUID(); captures.set(id, bytes); return id;
          } } : args);
      }
      if (result.ok === false) return stripPaths(result);
      if (endpoint === 'targets' || endpoint === 'state') result.browsers = [...new Map([...(result.browsers ?? []), ...runtime.extensionConnections().map(item => ({id: 'extension:' + item.instanceId, name: item.label, provider: 'extension', connected: true})), ...(browserConnection?.browsers ?? [])].map(item => [item.id, item])).values()];
      if (endpoint === 'targets' || endpoint === 'state') result.browserProviders = runtime.runtimeInfo.browserProviders;
      if (result.observation) { result = await attachScreenshot(result, attachments, captures); lastObservation = { targetId: result.targetId, observation: stripPaths(result.observation), image: result.image ?? null }; }
      if (result.state) result = { ...result, state: { ...result.state, status: result.state.mode, selectedTarget: result.state.targets.find(target => target.id === result.state.activeTargetId) ?? null, annotations, lastObservation, revision, activity }, service: { name: 'OpenCU', ...runtime.runtimeInfo }, config: publicConfig(getConfig()) };
      // The worker still needs raw AX nodes for diffing and details:true. Omit
      // duplicate text/history before cloning them across the worker boundary.
      return stripPaths(modelProjection ? modelResult(result, {...args, ...(endpoint === 'observe' ? {details:true} : {})}) : result);
    } finally {
      acceptingCaptures = false;
      captures.clear();
      if (active.has(endpoint)) { revision++; activity = { ...activity, status: 'settled', finishedAt: new Date().toISOString() }; }
    }
  }
  return {
    // Called only by the authenticated settings HTTP handler, never the model dispatcher.
    async uiRecovery(method, args = {}) {
      const runtime = await start();
      if (method === 'prepare') {
        const current = await runtime.getState();
        if (current.ok === false) throw Object.assign(new Error(current.error.message), current.error);
        const state = current.state, connected = runtime.extensionConnections();
        const sidebar = await options.dshBrowser?.listTargets() ?? [];
        const failed = new Set();
        const collect = item => {
          if (item.code === 'STALE_TARGET') failed.add(item.targetId);
          for (const failure of item.failures ?? []) collect(failure);
          if (item.result) collect(item.result);
        };
        for (const failure of state.releaseErrors ?? []) collect(failure);
        const targets = state.targets.filter(target => failed.has(target.id) && (target.provider === 'extension'
          ? !connected.some(item => item.instanceId === target.identity.instanceId && item.browserInstanceId === target.identity.browserInstanceId)
          : target.provider === 'dsh' && !sidebar.some(item => item.id === target.id && sameIdentity(item.identity, target.identity))));
        if (!state.releasePending || !targets.length) throw error('NO_ORPHANED_CONNECTIONS', 'No offline browser connection needs manual recovery. Reconnect the original browser and retry release.');
        recoveryOffer = { nonce: randomUUID(), expires: Date.now() + 60000, targetIds: targets.map(target => target.id), expectedReleaseErrors: JSON.stringify(state.releaseErrors) };
        return { ok: true, nonce: recoveryOffer.nonce, targets: targets.map(target => ({ id: target.id, title: target.title })) };
      }
      const offer = recoveryOffer; recoveryOffer = undefined;
      if (method !== 'confirm' || args.confirmedClosed !== true || !offer || offer.nonce !== args.nonce || Date.now() > offer.expires) throw error('RECOVERY_CONFIRMATION_REQUIRED', 'Review and confirm the closed browser connections in settings');
      return runtime.recoverClosedTargets(offer);
    },
    pendingAppApprovals: () => appApprovals.snapshot(),
    forgetSession: sessionId => appApprovals.forgetSession(sessionId),
    /** Whether a controller already exists; asking before start() keeps idle sessions from spawning one. */
    started: () => Boolean(controller) && !disposed,
    get dataDir() { return dataDir ?? resolve(getConfig().dataDir || DEFAULT_DATA_DIR); },
    request: (endpoint, args, context = {}) => cursorContext.run(context.sessionKey, () => request(endpoint, args, context)),
    async close() {
      disposed = true; browserPairing?.close();
      if (!closing) closing = (async () => {
        const failures = [];
        const settle = async work => { try { return await work(); } catch (error) { failures.push(error); } };
        const pending = [appApprovals, browserResources, sidebarDownloads, deliveryFiles].map(service => settle(() => service.close()));
        if (reconfiguring) await settle(() => reconfiguring);
        let result = { ok: true }, coreFailure;
        try {
          if (starting) {
            let runtime;
            try { runtime = await starting; }
            catch (error) { runtime = controller; }
            if (runtime) {
              result = await runtime.close();
              if (result.ok === false) throw Object.assign(new Error(result.error.message), { ...result.error, state: result.state });
            }
          }
        } catch (error) { coreFailure = error; failures.push(error); }
        await settle(() => Promise.all([annotationTail, imageRegistry?.close()]));
        // A failed core close retains its release channel for retry.
        if (!coreFailure && bridge?.listening) await settle(() => new Promise((done, reject) => bridge.close(error => error ? reject(error) : done())));
        await Promise.all(pending);
        if (failures.length === 1) throw failures[0];
        if (failures.length > 1) {
          const primary = coreFailure ?? failures[0];
          throw Object.assign(new AggregateError(failures, primary.message, { cause: primary }), primary);
        }
        return result;
      })().catch(error => { closing = undefined; throw error; });
      return closing;
    },
  };
}
