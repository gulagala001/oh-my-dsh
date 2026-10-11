import {browserTabTransferInput, CODEX_BROWSER_TAB_DRAG_DISTANCE} from './codex-browser-tab-transfer.mjs';

// Source jFi -> app-shared Zpr/wnr, open-link-bold-16, unchanged SVG body.
const newWindowIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M6.66699 2.09961C7.1639 2.09979 7.56641 2.50305 7.56641 3C7.56628 3.49684 7.16382 3.90021 6.66699 3.90039H5.33301C4.54166 3.90057 3.90057 4.54166 3.90039 5.33301V10.667C3.9007 11.4582 4.54174 12.0994 5.33301 12.0996H10.667C11.4583 12.0994 12.0993 11.4582 12.0996 10.667V9.33301C12.0998 8.8361 12.5031 8.43359 13 8.43359C13.4969 8.43359 13.9002 8.8361 13.9004 9.33301V10.667C13.9001 12.4523 12.4524 13.9002 10.667 13.9004H5.33301C3.54763 13.9002 2.09992 12.4523 2.09961 10.667V5.33301C2.09979 3.54755 3.54755 2.09979 5.33301 2.09961H6.66699Z" fill="currentColor"/><path d="M13.4082 1.44238C14.043 1.44265 14.5575 1.95695 14.5576 2.5918V5.87598C14.5576 6.37303 14.1543 6.77637 13.6572 6.77637C13.1605 6.7761 12.758 6.37371 12.7578 5.87695V4.52051L9.47852 7.7998C9.12704 8.15128 8.55655 8.15128 8.20508 7.7998C7.85403 7.44841 7.85403 6.87873 8.20508 6.52734L11.4902 3.24219H10.123C9.62602 3.24216 9.22266 2.83883 9.22266 2.3418C9.22279 1.84487 9.6261 1.44144 10.123 1.44141L13.4082 1.44238Z" fill="currentColor"/></svg>';
const independentStyle = new Set(['app-region', 'direction', 'unicode-bidi', 'position', 'left', 'top', 'transform', 'translate']);
const finitePoint = value => value && Number.isFinite(value.x) && Number.isFinite(value.y);
const positive = value => Number.isSafeInteger(value) && value > 0;
const failure = message => new Error(message);

export function outsideBrowserPreviewRows(point, rows, prepared) {
  if (!finitePoint(point)) return false;
  const margin = prepared ? 0 : CODEX_BROWSER_TAB_DRAG_DISTANCE;
  return !rows.some(rect => rect.right > rect.left && rect.bottom > rect.top
    && point.x >= rect.left - margin && point.x <= rect.right + margin
    && point.y >= rect.top - margin && point.y <= rect.bottom + margin);
}

function cloneComputed(source, signal) {
  const clone = source.cloneNode(true), view = source.ownerDocument.defaultView;
  const properties = Array.from(view.getComputedStyle(source)).filter(key => !key.startsWith('--'));
  const stack = [{source, target: clone, parent: null}];
  while (stack.length) {
    signal.throwIfAborted();
    const item = stack.pop(), style = view.getComputedStyle(item.source);
    const values = properties.map(key => style.getPropertyValue(key));
    const cue = item.source.hasAttribute('data-app-shell-tab-drag-drop-cue');
    item.target.setAttribute('style', (item.parent && !cue ? 'all:inherit;' : '')
      + properties.map((key, index) => cue && key === 'display'
        || item.parent && !cue && values[index] === item.parent[index] && !independentStyle.has(key)
        ? '' : key + ':' + values[index] + ';').join(''));
    item.target.removeAttribute('id'); item.target.removeAttribute('tabindex');
    for (const key of item.target.getAttributeNames()) if (key.startsWith('on')) item.target.removeAttribute(key);
    if (item.source.tagName === 'IMG') {
      item.target.removeAttribute('srcset'); item.target.src = item.source.currentSrc || item.source.src;
      if (!/^data:image\/(png|jpeg|webp);base64,/u.test(item.target.src)) throw failure('Drag preview contains an image without owned captured pixels');
    }
    for (let index = 0; index < item.source.children.length; index++) {
      stack.push({source: item.source.children[index], target: item.target.children[index], parent: values});
    }
  }
  return clone;
}

/** Source KFi/IFi's bounded card and computed-style serialization, not a DOM drag ghost. */
export async function captureBrowserTabDragMarkup({node, pixels, grabOffset, cueLabel, signal}) {
  signal.throwIfAborted();
  if (!node?.isConnected || pixels?.mediaType !== 'image/png' || !positive(pixels.width) || !positive(pixels.height)
    || typeof pixels.data !== 'string' || pixels.data.length > 1900000 || !/^[A-Za-z0-9+/=]+$/u.test(pixels.data)
    || !finitePoint(grabOffset)) throw failure('The real browser drag snapshot is unavailable');
  const document = node.ownerDocument, view = document.defaultView, sourceRect = node.getBoundingClientRect();
  if (!(sourceRect.width > 0 && sourceRect.height > 0)) throw failure('The owned browser tab header is not visible');
  const width = Math.floor(Math.min(320, view.innerWidth - 16));
  const headerHeight = sourceRect.height, bodyHeight = Math.min(width * pixels.height / pixels.width, view.innerHeight - 16 - headerHeight);
  if (width <= 0 || bodyHeight <= 0) throw failure('The owned browser thumbnail has no visible area');
  const height = Math.round(headerHeight + bodyHeight), surface = document.createElement('div');
  surface.setAttribute('aria-hidden', 'true'); surface.inert = true;
  surface.style.cssText = 'position:fixed;left:-100000px;top:-100000px;pointer-events:none;contain:layout style;';
  const card = document.createElement('div');
  card.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;border-radius:var(--radius-xl);background:var(--color-surface-elevated-secondary);box-shadow:var(--shadow-xl-spread);color:var(--color-text);font-family:var(--font-sans);`;
  const header = cloneComputed(node, signal);
  Object.assign(header.style, {position: 'absolute', top: '0', left: '0', width: width + 'px', height: headerHeight + 'px',
    transform: 'none', translate: 'none', margin: '0', pointerEvents: 'none'});
  const body = document.createElement('div');
  body.setAttribute('data-app-shell-tab-drag-cue-region', '');
  body.style.cssText = `position:absolute;left:0;top:${headerHeight}px;width:${width}px;height:${bodyHeight}px;overflow:hidden;`;
  const image = document.createElement('img'); image.src = 'data:image/png;base64,' + pixels.data;
  image.style.cssText = `display:block;width:${width}px;height:${width * pixels.height / pixels.width}px;max-width:none;`;
  const cue = document.createElement('div'); cue.setAttribute('data-app-shell-tab-drag-drop-cue', 'content');
  cue.style.cssText = 'position:absolute;inset:0;z-index:10;pointer-events:none;display:flex;align-items:center;justify-content:center;background:color-mix(in oklab,var(--color-surface) 60%,transparent);';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border:1px solid var(--color-token-border-default);background:color-mix(in oklab,var(--color-codex-drop-overlay) 60%,transparent);padding:0 12px;text-align:center;font-size:var(--text-base);font-weight:600;color:var(--color-text);';
  const label = document.createElement('span'); label.setAttribute('data-cue-destination', 'new-window');
  label.style.cssText = 'display:flex;align-items:center;gap:8px;'; label.innerHTML = newWindowIcon;
  label.append(document.createTextNode(cueLabel)); overlay.append(label); cue.append(overlay); body.append(image, cue);
  card.append(body, header); surface.append(card); node.parentElement.append(surface);
  try {
    await image.decode(); signal.throwIfAborted();
    if (!node.isConnected || image.naturalWidth !== pixels.width || image.naturalHeight !== pixels.height) throw failure('The browser drag image did not decode to its actual pixel dimensions');
    const markup = cloneComputed(card, signal).outerHTML, borderRadius = Number.parseFloat(view.getComputedStyle(card).borderTopLeftRadius);
    if (markup.length > 2000000 || !Number.isFinite(borderRadius)) throw failure('The bounded browser drag snapshot could not be serialized');
    const offset = grabOffset.x > width - 16 ? {x: width - 16, y: headerHeight / 2} : {...grabOffset};
    return {size: {width, height}, grabOffset: offset, borderRadius, zoom: 1, markup};
  } finally {surface.remove();}
}

export function nativeDragPreviewReleased(result, browserEpoch) {
  return result?.ended === true && result.windowDestroyed === true && result.webContentsDestroyed === true
    || result?.providerReleaseProof?.epoch === browserEpoch && result.providerReleaseProof.released === true
      && result.providerReleaseProof.providerClosed === true;
}

/** Source BFi's asynchronous prepare/load/show/freeze/end owner. */
export class CodexBrowserTabNativePreview {
  constructor({api, sessionId, tab, controlEpoch, node, grabOffset, getPoint, getRows, cueLabel, onCleanupError}) {
    this.api = api; this.sessionId = sessionId; this.identity = browserTabTransferInput(tab, controlEpoch);
    this.node = node; this.grabOffset = grabOffset; this.getPoint = getPoint; this.getRows = getRows;
    this.cueLabel = cueLabel; this.onCleanupError = onCleanupError; this.resources = new Set();
    this.closed = false; this.retained = false; this.disabled = false; this.lastOutside = false;
    this.prepare(); this.frame = node.ownerDocument.defaultView.requestAnimationFrame(() => this.frameTick());
  }
  call(resource, action, payload = {}, signal) {
    return this.api('tab-drag-preview', this.sessionId,
      {...this.identity, action, previewId: resource?.previewId, ...payload}, signal);
  }
  prepare() {
    if (this.closed || this.disabled || this.current) return;
    const resource = {phase: 'preparing', controller: new AbortController(), gone: false};
    this.resources.add(resource); this.current = resource;
    // Preparation is not aborted before receiving its issued identity. A late
    // response still belongs to this owner and must receive an actual end ACK.
    resource.prepared = Promise.resolve().then(() => this.call(resource, 'prepare')).then(async result => {
      if (result?.available !== true) {resource.unavailable = true; throw failure('Native tab drag preview is unavailable');}
      if (typeof result.previewId === 'string' && result.previewId) resource.previewId = result.previewId;
      if (typeof result.previewId !== 'string' || !result.previewId || !positive(result.windowId)
        || result.capabilities?.nativeCursor !== true) throw failure('Native drag preview did not issue its real window identity');
      if (resource.gone || this.closed) return false;
      if (!await this.call(resource, 'ready', {}, resource.controller.signal)) throw failure('The native drag window was not prepared');
      if (resource.gone || this.closed) return false;
      resource.phase = 'window-ready'; this.tick(); return true;
    }).catch(error => {if (!resource.gone && !this.closed) this.failed(resource, error); return false;});
  }
  frameTick() {
    if (this.closed || this.retained) return;
    this.tick(); this.frame = this.node.ownerDocument.defaultView.requestAnimationFrame(() => this.frameTick());
  }
  tick() {
    if (this.closed || this.retained) return;
    if (!this.node.isConnected) {void this.dispose().catch(error => this.onCleanupError?.(error)); return;}
    const outside = outsideBrowserPreviewRows(this.getPoint(), this.getRows(), Boolean(this.current));
    if (!outside) {
      if (this.lastOutside) this.disabled = false;
      if (this.current && !['preparing', 'window-ready'].includes(this.current.phase)) this.retire(this.current);
    }
    this.lastOutside = outside;
    if (!this.current && !this.disabled) this.prepare();
    if (outside && this.current?.phase === 'window-ready') this.show(this.current);
  }
  show(resource) {
    if (resource.work || resource.gone) return;
    resource.work = (async () => {
      resource.phase = 'snapshotting';
      if (!await this.call(resource, 'updateCue', {cue: {destination: 'new-window'}}, resource.controller.signal)) throw failure('Native drag cue was not accepted');
      const pixels = await this.call(resource, 'snapshot', {}, resource.controller.signal);
      if (resource.gone || this.closed) return false;
      const snapshot = await captureBrowserTabDragMarkup({node: this.node, pixels, grabOffset: this.grabOffset,
        cueLabel: this.cueLabel, signal: resource.controller.signal});
      if (resource.gone || this.closed) return false;
      resource.phase = 'loading';
      if (!await this.call(resource, 'load', {snapshot}, resource.controller.signal)) throw failure('Native drag snapshot was not loaded');
      if (resource.gone || this.closed) return false;
      resource.phase = 'showing';
      if (!await this.call(resource, 'show', {}, resource.controller.signal)) throw failure('Native drag snapshot did not finish drawing');
      if (resource.gone || this.closed) return false;
      resource.phase = 'floating'; return true;
    })().catch(error => {if (!resource.gone && !this.closed) this.failed(resource, error); return false;});
  }
  failed(resource) {
    this.disabled = true; this.retire(resource);
  }
  retire(resource) {
    if (this.current === resource) this.current = null;
    resource.gone = true; resource.controller.abort();
    void this.endResource(resource).catch(error => this.onCleanupError?.(error));
  }
  async endResource(resource) {
    if (resource.ending) return resource.ending;
    resource.ending = (async () => {
      await resource.prepared;
      if (!resource.previewId) {this.resources.delete(resource); return;}
      const result = await this.call(resource, 'end');
      if (!nativeDragPreviewReleased(result, this.identity.browserEpoch)) throw failure('The native drag preview has not confirmed physical cleanup');
      this.resources.delete(resource);
    })();
    try {await resource.ending;} finally {resource.ending = undefined;}
  }
  async freezeAtDrop() {
    this.retained = true; this.node.ownerDocument.defaultView.cancelAnimationFrame(this.frame);
    const resource = this.current;
    if (!resource) return false;
    let timer;
    const work = (async () => {
      if (!await resource.prepared || resource.gone || this.closed) return false;
      if (!await this.call(resource, 'freeze', {}, resource.controller.signal)) return false;
      if (resource.phase === 'window-ready') this.show(resource);
      return resource.work ? await resource.work && !resource.gone && !this.closed : resource.phase === 'floating';
    })().catch(() => false);
    try {return await Promise.race([work, new Promise(resolve => {timer = setTimeout(() => resolve(false), 1500);})]);}
    finally {clearTimeout(timer);}
  }
  async dispose() {
    this.closed = true; this.node.ownerDocument.defaultView.cancelAnimationFrame(this.frame);
    this.current = null;
    const results = await Promise.allSettled([...this.resources].map(resource => {
      resource.gone = true; resource.controller.abort(); return this.endResource(resource);
    }));
    const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
    if (errors.length) throw new AggregateError(errors, 'Native tab drag preview cleanup remains unconfirmed');
  }
}
