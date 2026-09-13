const rootStyle = 'all:initial!important;position:fixed!important;inset:0!important;width:auto!important;height:auto!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;pointer-events:none!important;overflow:hidden!important';

// Executed in our own isolated world. Only this inert, closed-shadow overlay
// is added to the document; website input handlers and page state are untouched.
export function createCursorLayer(style) {
  const root = document.createElement('div');
  root.setAttribute('data-trisoul-cursor', ''); root.setAttribute('aria-hidden', 'true'); root.inert = true;
  root.setAttribute('data-trisoul-cursor-hidden', '');
  root.setAttribute('popover', 'manual'); root.style.cssText = style;
  const shadow = root.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet(); sheet.replaceSync(`
    :host{visibility:visible!important}:host([data-trisoul-cursor-hidden]){visibility:hidden!important}
    :host::backdrop{background:transparent!important;pointer-events:none!important}
    .arrow,.pulse{position:absolute;pointer-events:none;transform-origin:0 0}
    .arrow{filter:drop-shadow(0 2px 3px #0005);transition:left 35ms linear,top 35ms linear;line-height:0}
    .arrow.down{transition:none}.arrow svg{display:block}
    .pulse{width:22px;height:22px;box-sizing:border-box;border:2px solid white;box-shadow:0 0 0 1px #377cdb99;border-radius:50%;animation:click .25s ease-out both}
    @keyframes click{from{opacity:.9}to{opacity:0}}
    @media(prefers-reduced-motion:reduce){.arrow{transition:none}}
  `); shadow.adoptedStyleSheets = [sheet];
  const arrow = document.createElement('span'); arrow.className = 'arrow';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  for (const [name,value] of Object.entries({ width: '22', height: '27', viewBox: '0 0 22 27', fill: 'none' })) svg.setAttribute(name, value);
  for (const [name,value] of Object.entries({ d: 'M2 2L19 14.5L11.6 15.5L7.7 22.5L2 2Z', fill: '#17191c', stroke: 'white', 'stroke-width': '2', 'stroke-linejoin': 'round' })) path.setAttribute(name, value);
  svg.append(path); arrow.append(svg); shadow.append(arrow);
  let pulse, press, listening = false; const observedViewport = visualViewport;
  const hide = () => {
    root.setAttribute('data-trisoul-cursor-hidden', ''); root.remove();
    removeEventListener('pagehide', hide); removeEventListener('scroll', hide);
    observedViewport?.removeEventListener('resize', hide); observedViewport?.removeEventListener('scroll', hide); listening = false;
  };
  return { root, apply(state) {
    if (state.serial < Number(root.getAttribute('data-trisoul-cursor-serial') ?? 0)) return false;
    root.setAttribute('data-trisoul-cursor-serial', state.serial);
    const p = state.pointer, viewport = visualViewport;
    if (!p || state.hidden || !viewport ||
      Math.abs(viewport.width - p.geometry.width) > 1 || Math.abs(viewport.height - p.geometry.height) > 1 ||
      Math.abs(viewport.pageLeft - p.geometry.pageX) > 1 || Math.abs(viewport.pageTop - p.geometry.pageY) > 1 ||
      Math.abs(viewport.scale - p.geometry.scale) > .001 || p.x < 0 || p.y < 0 || p.x >= viewport.width || p.y >= viewport.height) { hide(); return false; }
    if (!root.isConnected) document.documentElement.append(root);
    if (!listening) {
      addEventListener('pagehide', hide); addEventListener('scroll', hide, { passive: true });
      observedViewport?.addEventListener('resize', hide); observedViewport?.addEventListener('scroll', hide); listening = true;
    }
    if (!root.matches(':popover-open')) root.showPopover();
    const scale = 1 / (p.geometry.scale * p.geometry.zoom), x = p.x + viewport.offsetLeft, y = p.y + viewport.offsetTop;
    arrow.classList.toggle('down', p.buttons !== 0);
    arrow.style.left = x + 'px'; arrow.style.top = y + 'px';
    arrow.style.transform = `translate(${-2 * scale}px,${-2 * scale}px) scale(${scale})`;
    if (p.press && press !== p.source + ':' + p.press.sequence && Date.now() - p.press.at < 250) {
      press = p.source + ':' + p.press.sequence; pulse?.remove(); pulse = document.createElement('span'); pulse.className = 'pulse';
      pulse.style.left = p.press.x + viewport.offsetLeft + 'px'; pulse.style.top = p.press.y + viewport.offsetTop + 'px';
      pulse.style.transform = `translate(${-11 * scale}px,${-11 * scale}px) scale(${scale})`; shadow.append(pulse);
    }
    root.removeAttribute('data-trisoul-cursor-hidden');
    return true;
  } };
}

export class CursorOverlay {
  constructor(send, active) { this.send = send; this.active = active; this.serial = 0; this.suppressed = 0; this.dialogWaiters = new Set(); }
  setDialog(value) { this.dialog = value; if (value) for (const reject of this.dialogWaiters) reject(new Error('Handle the current JavaScript dialog before capturing the page.')); }
  invalidate() { this.remote = null; this.pointer = null; this.dirty = false; this.serial++; }
  async ensure(loaderId) {
    if (this.remote?.loaderId === loaderId) return this.remote;
    if (this.creating) { await this.creating; return this.remote?.loaderId === loaderId ? this.remote : null; }
    this.creating = (async () => {
      const { frameTree } = await this.send('Page.getFrameTree');
      if (frameTree.frame.loaderId !== loaderId) return null;
      const { executionContextId } = await this.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'trisoul-assistant-cursor' });
      const result = await this.send('Runtime.evaluate', { expression: '(' + createCursorLayer.toString() + ')(' + JSON.stringify(rootStyle) + ')', contextId: executionContextId });
      if (result.exceptionDetails || !result.result?.objectId) throw new Error('Could not create the assistant cursor');
      const objectId = result.result.objectId;
      const root = await this.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function(){return this.root;}' });
      await this.send('DOM.getDocument', { depth: 0 });
      const { nodeId } = await this.send('DOM.requestNode', { objectId: root.result.objectId });
      if (!nodeId) throw new Error('Could not bind the assistant cursor layer');
      return this.remote = { objectId, nodeId, loaderId };
    })().finally(() => { this.creating = null; });
    return this.creating;
  }
  snapshot() { return { serial: this.serial, pointer: this.pointer, hidden: this.suppressed > 0 || !this.active(this.actorId) }; }
  async update(actorId, pointer) {
    if (!this.active(actorId) || !pointer) return;
    if (this.pointer?.source === pointer.source && this.pointer.sequence >= pointer.sequence) return;
    this.actorId = actorId; this.pointer = pointer; this.serial++; this.dirty = true;
    return this.paint();
  }
  paint() {
    if (this.painting) return this.painting;
    this.painting = (async () => {
      while (this.dirty && this.pointer) {
        this.dirty = false; const pointer = this.pointer;
        const remote = await this.ensure(pointer.loaderId);
        if (!remote || !this.active(this.actorId) || this.pointer?.loaderId !== remote.loaderId) continue;
        const response = await this.send('Runtime.callFunctionOn', { objectId: remote.objectId, functionDeclaration: 'function(state){return this.apply(state);}', arguments: [{ value: this.snapshot() }], returnByValue: true });
        if (response.exceptionDetails) throw new Error('The assistant cursor could not be displayed');
      }
    })().finally(() => { this.painting = null; if (this.dirty && this.pointer) void this.paint().catch(() => {}); });
    return this.painting;
  }
  async conceal() {
    const remote = this.remote; if (!remote) return;
    // Change the serial and visibility atomically, so an older queued render
    // cannot revive it and an old hide cannot race a fresh actor's update.
    await this.send('DOM.setAttributesAsText', { nodeId: remote.nodeId, text: 'data-trisoul-cursor-serial="' + this.serial + '" data-trisoul-cursor-hidden=""' });
  }
  async stop(actorId) {
    if (actorId !== undefined && actorId !== this.actorId) return;
    this.pointer = null; this.dirty = false; this.serial++;
    // Chromium can pause DOM operations behind a dialog opened concurrently
    // with Stop. Queue cleanup immediately, but never gate input release on it.
    this.hiding = this.conceal().catch(error => { this.lastError = error; });
  }
  async capture(capture) {
    if (this.dialog && this.remote) throw new Error('Handle the current JavaScript dialog before capturing the page.');
    this.suppressed++; this.serial++;
    let interrupted;
    const dialog = new Promise((_, reject) => { interrupted = reject; this.dialogWaiters.add(reject); });
    try { await Promise.race([this.conceal(), dialog]); return await capture(); }
    finally { this.dialogWaiters.delete(interrupted); this.suppressed--; this.serial++; if (this.pointer && this.active(this.actorId)) { this.dirty = true; void this.paint().catch(() => {}); } }
  }
}
