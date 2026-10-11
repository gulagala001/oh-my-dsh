import {BrowserWindow, screen} from 'electron';
import {randomUUID} from 'node:crypto';
import {parseDocument, DomUtils} from 'htmlparser2';
import {fail, nonempty, record} from './ipc.mjs';

export const TAB_DRAG_PREVIEW_METHODS = new Set(['tabDragPreview.capabilities', 'tabDragPreview.prepare',
  'tabDragPreview.ready', 'tabDragPreview.snapshot', 'tabDragPreview.updateCue', 'tabDragPreview.load',
  'tabDragPreview.show', 'tabDragPreview.freeze', 'tabDragPreview.end']);
const WORLD = 1001, DEADLINE = 3000;
const destinations = new Set(['new-window', 'left', 'right', 'bottom', 'pin', 'chat', 'new-chat']);
const page = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\';img-src data:;style-src \'unsafe-inline\';base-uri \'none\';form-action \'none\'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}#card{position:relative;width:100%;height:100%;overflow:hidden}#snapshot{transform-origin:top left}[data-app-shell-tab-drag-drop-cue]{display:none}[data-drop-cue="new-window"] [data-app-shell-tab-drag-drop-cue]{display:flex}</style><div id="card"><div id="snapshot"></div></div>';
const point = value => record(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
const positive = value => Number.isSafeInteger(value) && value > 0;
const fullyReleased = proof => proof?.ended === true && proof.windowDestroyed === true && proof.webContentsDestroyed === true;
const allowedTags = new Set(['div', 'span', 'p', 'button', 'img', 'svg', 'g', 'path', 'circle', 'rect', 'line',
  'polyline', 'polygon', 'ellipse', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'text', 'tspan']);

function snapshotMarkup(value) {
  if (typeof value !== 'string' || !value.length || value.length > 2000000) throw fail('Invalid drag snapshot markup', 'INVALID_ARGUMENT');
  const document = parseDocument(value, {decodeEntities: true});
  let count = 0;
  const walk = (node, depth = 0) => {
    if (++count > 4096 || depth > 64) throw fail('Drag snapshot markup is too complex', 'RESOURCE_LIMIT');
    if (node.type === 'text') return;
    if (node.type !== 'root' && (!allowedTags.has(node.name?.toLowerCase()) || node.type === 'script')) throw fail('Unsupported drag snapshot element', 'INVALID_ARGUMENT');
    for (const [key, content] of Object.entries(node.attribs ?? {})) {
      if (key.toLowerCase().startsWith('on') || ['srcdoc', 'srcset', 'formaction'].includes(key.toLowerCase())) delete node.attribs[key];
      if (['href', 'xlink:href'].includes(key.toLowerCase()) && !content.startsWith('#')) delete node.attribs[key];
      if (key.toLowerCase() === 'src' && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/u.test(content)) throw fail('Drag snapshot images must be inline captured pixels', 'INVALID_ARGUMENT');
    }
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  walk(document);
  return DomUtils.getOuterHTML(document);
}

/** Source Rqe/Hqe lifecycle, with only official Electron-owned windows. */
class TabDragPresentation {
  constructor(owner) {
    this.owner = owner; this.closed = false; this.phase = 'preparing'; this.cueVersion = 0;
    this.cueWork = Promise.resolve(true); this.cue = null; this.frozen = null;
    this.window = new BrowserWindow({title: '', width: 1, height: 1, frame: false, transparent: true,
      backgroundColor: '#00000000', alwaysOnTop: true, enableLargerThanScreen: process.platform === 'darwin',
      focusable: false, show: false, skipTaskbar: true, resizable: false, minimizable: false, maximizable: false,
      hasShadow: true, webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false,
        javascript: false, partition: 'opencu-tab-drag-' + randomUUID()}});
    this.contents = this.window.webContents;
    this.window.setOpacity(0); this.window.setIgnoreMouseEvents(true); this.window.setMenu(null);
    if (process.platform === 'darwin') this.window.setVisibleOnAllWorkspaces(true);
    this.window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    this.window.webContents.on('will-navigate', event => event.preventDefault());
    this.window.once('closed', () => {this.closed = true; if (this.phase !== 'ended') this.phase = 'window-closed'; this.stopFollowing();});
    this.prepared = this.window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page))
      .then(() => {if (this.closed) return false; this.phase = 'ready'; return true;}, async () => {await this.end(); return false;});
  }
  async bounded(work) {
    let timer;
    try {
      const result = await Promise.race([work(), new Promise(resolve => {timer = setTimeout(() => resolve(false), DEADLINE);})]);
      if (!result) await this.end(); return result;
    } catch {await this.end(); return false;} finally {clearTimeout(timer);}
  }
  async ready() {return await this.prepared && !this.closed;}
  async execute(code) {
    if (this.closed) throw fail('Drag preview has ended', 'PRESENTATION_CLOSED');
    return this.window.webContents.executeJavaScriptInIsolatedWorld(WORLD, [{code}]);
  }
  updateCue(cue) {
    if (cue !== null && (!record(cue) || !destinations.has(cue.destination) || Object.keys(cue).length !== 1)) {
      return this.end().then(() => false);
    }
    this.cue = cue; const version = ++this.cueVersion;
    this.cueWork = this.cueWork.then(async () => {
      if (this.closed) return false;
      if (version !== this.cueVersion) return true;
      if (!await this.ready()) return false;
      if (this.loaded) await this.applyCue(); return !this.closed;
    }).catch(async () => {await this.end(); return false;});
    return this.cueWork;
  }
  async applyCue() {
    await this.execute(`(() => {const region=document.querySelector('[data-app-shell-tab-drag-cue-region]');if(region){const destination=${JSON.stringify(this.cue?.destination ?? null)};if(destination===null)region.removeAttribute('data-drop-cue');else region.dataset.dropCue=destination;}})()`);
  }
  load(snapshot) {
    if (this.closed || this.loadWork) return Promise.resolve(false);
    this.loadWork = this.bounded(async () => {
      if (!await this.ready() || !record(snapshot) || !record(snapshot.size) || !positive(snapshot.size.width)
        || !positive(snapshot.size.height) || !point(snapshot.grabOffset) || !Number.isFinite(snapshot.borderRadius)
        || snapshot.borderRadius < 0 || !Number.isFinite(snapshot.zoom) || snapshot.zoom < .25 || snapshot.zoom > 4) return false;
      const pointer = screen.getCursorScreenPoint(), display = screen.getDisplayNearestPoint(pointer);
      if (snapshot.size.width > display.bounds.width || snapshot.size.height > display.bounds.height
        || Math.abs(snapshot.grabOffset.x) > display.bounds.width || Math.abs(snapshot.grabOffset.y) > display.bounds.height) return false;
      const markup = snapshotMarkup(snapshot.markup);
      this.grabOffset = {...snapshot.grabOffset}; this.window.setSize(snapshot.size.width, snapshot.size.height);
      const radius = Math.min(snapshot.borderRadius, snapshot.size.width / 2, snapshot.size.height / 2);
      await this.execute(`(async () => {const root=document.getElementById('snapshot');document.getElementById('card').style.borderRadius=${JSON.stringify(radius + 'px')};root.style.transform=${JSON.stringify('scale(' + snapshot.zoom + ')')};root.innerHTML=${JSON.stringify(markup)};const images=Array.from(root.querySelectorAll('img'));const decoded=await Promise.all(images.map(image=>image.decode().then(()=>image.naturalWidth>0&&image.naturalHeight>0,()=>false)));return decoded.every(Boolean);})()`)
        .then(decoded => {if (!decoded) throw fail('The drag snapshot did not decode', 'INVALID_IMAGE');});
      if (this.closed) return false; this.loaded = true; this.phase = 'loaded';
      if (!await this.cueWork || this.closed) return false;
      await this.applyCue(); this.follow(); return this.position();
    });
    return this.loadWork;
  }
  show() {
    return this.bounded(async () => {
      if (!this.loadWork || !await this.loadWork || this.closed) return false;
      let version;
      do {
        version = this.cueVersion;
        if (!await this.cueWork || this.closed) return false;
        const image = await this.window.webContents.capturePage();
        if (this.closed || image.isEmpty()) return false;
      } while (version !== this.cueVersion);
      if (!this.position()) return false;
      this.window.setOpacity(1); this.phase = this.frozen ? 'frozen' : 'floating';
      return this.window.isVisible() && this.window.getOpacity() === 1;
    });
  }
  follow() {
    if (!this.window.isVisible()) this.window.showInactive();
    if (!this.frozen && !this.following) this.following = setInterval(() => {try {this.position();} catch {void this.end();}}, 16);
  }
  stopFollowing() {if (this.following) clearInterval(this.following); this.following = undefined;}
  position() {
    if (this.closed || !this.grabOffset) return false;
    const cursor = this.frozen ?? screen.getCursorScreenPoint();
    if (!point(cursor)) return false;
    const next = {x: Math.round(cursor.x - this.grabOffset.x), y: Math.round(cursor.y - this.grabOffset.y)};
    if (!this.positioned || next.x !== this.positioned.x || next.y !== this.positioned.y) {
      this.window.setPosition(next.x, next.y); this.positioned = next;
    }
    return true;
  }
  async freeze() {
    if (this.closed) return false;
    const cursor = screen.getCursorScreenPoint(); if (!point(cursor)) {await this.end(); return false;}
    this.frozen ??= {...cursor}; this.stopFollowing(); if (this.grabOffset) this.position();
    this.phase = 'frozen'; return true;
  }
  async end() {
    if (this.endWork) return this.endWork;
    this.closed = true; this.phase = 'ending'; this.stopFollowing();
    const readback = () => {
      const windowDestroyed = this.window.isDestroyed(), webContentsDestroyed = this.contents.isDestroyed();
      return {ended: windowDestroyed && webContentsDestroyed, windowDestroyed, webContentsDestroyed};
    };
    if (fullyReleased(readback())) {this.phase = 'ended'; return readback();}
    // Electron's closed event can precede WebContents destruction. Keep the
    // nonce until both real objects report destroyed, including on retries.
    this.endWork = new Promise(resolve => {
      let timeout, poll, finished = false;
      const finish = () => {
        if (finished) return;
        finished = true; clearTimeout(timeout); clearInterval(poll);
        this.window.off('closed', check); this.contents.off('destroyed', check);
        const proof = readback(); this.phase = proof.ended ? 'ended' : 'cleanup-pending'; resolve(proof);
      };
      const check = () => {if (fullyReleased(readback())) finish();};
      this.window.on('closed', check); this.contents.on('destroyed', check);
      timeout = setTimeout(finish, DEADLINE); poll = setInterval(check, 16);
      try {if (!this.window.isDestroyed()) this.window.destroy();} catch {}
      check();
    });
    try {return await this.endWork;} finally {this.endWork = undefined;}
  }
}

export class PluginTabDragPreview {
  constructor({getOwnedContents, getOwnedTab, captureOwnedContents} = {}) {
    if (typeof getOwnedContents !== 'function' || typeof getOwnedTab !== 'function'
      || typeof captureOwnedContents !== 'function') throw new TypeError('Drag preview requires the real owned browser registry and compositor capture');
    this.getOwnedContents = getOwnedContents; this.getOwnedTab = getOwnedTab;
    this.captureOwnedContents = captureOwnedContents; this.previews = new Map(); this.closed = false;
  }
  capabilities() {
    let cursor = false;
    if (process.platform === 'darwin' || process.platform === 'win32' || process.platform === 'linux' && process.env.XDG_SESSION_TYPE !== 'wayland') {
      try {cursor = point(screen.getCursorScreenPoint());} catch {}
    }
    return {available: !this.closed && cursor, ownerKind: 'plugin-companion', nativeCursor: cursor,
      webOriginOwnerMapping: false, webOriginZoomVerified: false, freezeOrigin: 'native-cursor-at-request',
      sizeLimit: 'actual-display-bounds', snapshot: 'owned-webcontents-pixels-and-dom', isolatedWorld: WORLD};
  }
  entry(params) {
    const entry = this.previews.get(params.previewId);
    if (!entry || params.tabId !== entry.tabId) throw fail('Drag preview ownership has ended', 'STALE_TARGET');
    return entry;
  }
  live(entry) {
    if (this.closed || this.getOwnedTab(entry.tabId) !== entry.tab || this.getOwnedContents(entry.tabId) !== entry.contents
      || entry.contents.isDestroyed() || entry.tab.detached) throw fail('The preview browser page changed', 'STALE_TARGET');
  }
  async handle(method, params, {signal, trustedUserAction = false} = {}) {
    if (!TAB_DRAG_PREVIEW_METHODS.has(method) || !record(params)) throw fail('Invalid drag preview method', 'INVALID_METHOD');
    if (!trustedUserAction) throw fail('Drag preview requires the trusted user-action route', 'USER_ACTION_REQUIRED');
    signal?.throwIfAborted();
    if (method === 'tabDragPreview.capabilities') return this.capabilities();
    if (method === 'tabDragPreview.prepare') {
      if (!this.capabilities().available || !positive(params.tabId)) return {available: false};
      if (this.previews.size >= 128) throw fail('Native drag previews reached their ownership limit', 'RESOURCE_LIMIT');
      const tab = this.getOwnedTab(params.tabId), contents = this.getOwnedContents(params.tabId);
      if (tab.detached || contents.isDestroyed()) return {available: false};
      const id = randomUUID(), presentation = new TabDragPresentation(tab);
      const entry = {id, tabId: params.tabId, tab, contents, presentation}; this.previews.set(id, entry);
      if (signal?.aborted) {
        if (fullyReleased(await presentation.end())) this.previews.delete(id);
        signal.throwIfAborted();
      }
      return {available: true, previewId: id, windowId: presentation.window.id, capabilities: this.capabilities()};
    }
    if (!nonempty(params.previewId)) throw fail('A real preview identity is required', 'INVALID_ARGUMENT');
    const entry = this.entry(params);
    if (method === 'tabDragPreview.end') {
      const result = await entry.presentation.end();
      if (fullyReleased(result)) this.previews.delete(entry.id);
      return result;
    }
    this.live(entry);
    const abort = () => {void entry.presentation.end();}; signal?.addEventListener('abort', abort, {once: true});
    try {
      let result;
      if (method === 'tabDragPreview.ready') result = await entry.presentation.ready();
      else if (method === 'tabDragPreview.updateCue') result = await entry.presentation.updateCue(params.cue);
      else if (method === 'tabDragPreview.load') result = await entry.presentation.load(params.snapshot);
      else if (method === 'tabDragPreview.show') result = await entry.presentation.show();
      else if (method === 'tabDragPreview.freeze') result = await entry.presentation.freeze();
      else if (method === 'tabDragPreview.snapshot') {
        const image = await this.captureOwnedContents(entry.tabId, {signal}); this.live(entry);
        if (image.isEmpty()) throw fail('The browser did not capture thumbnail pixels', 'CAPTURE_UNAVAILABLE');
        const resized = image.resize({width: Math.min(320, image.getSize().width), quality: 'good'}), bytes = resized.toPNG();
        if (bytes.length < 24 || bytes.length > 1400000) throw fail('The captured browser thumbnail is invalid or too large', 'RESOURCE_LIMIT');
        result = {mediaType: 'image/png', data: bytes.toString('base64'), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
      }
      signal?.throwIfAborted(); return result;
    } catch (error) {await entry.presentation.end(); throw error;} finally {signal?.removeEventListener('abort', abort);}
  }
  async dispose() {
    this.closed = true;
    const results = await Promise.allSettled([...this.previews.values()].map(async entry => {
      const proof = await entry.presentation.end();
      if (!fullyReleased(proof)) throw fail('A native drag preview has not confirmed window and WebContents destruction', 'PRESENTATION_CLEANUP_UNCONFIRMED');
      this.previews.delete(entry.id); return proof;
    }));
    const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
    if (errors.length) throw new AggregateError(errors, 'Native drag preview physical cleanup remains unconfirmed');
    return {ended: true, previewCount: results.length};
  }
}
