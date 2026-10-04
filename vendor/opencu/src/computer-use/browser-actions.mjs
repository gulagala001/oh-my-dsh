import { randomUUID } from 'node:crypto';
import { applyMetrics, validateEmulation, setEmulation, emulationSettings } from './browser-emulation.mjs';
import {basename} from 'node:path';
import {access} from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { point } from './coordinates.mjs';
import { observeNetwork, listNetwork, networkRequest, networkResponseBody } from './browser-network.mjs';
import { listPageAssets, bundlePageAssets, exportPageContent } from './browser-content.mjs';
import { fetchWebMcpTools, callWebMcpTool, cancelWebMcp, webMcpAvailable } from './browser-webmcp.mjs';
import { captureViewport, captureFullPage, observeScreenshot, withViewportTransaction, screenshotGeometry, sameScreenshotGeometry, staleScreenshot } from './browser-screenshot.mjs';

const stale = () => Object.assign(new Error('This element belongs to an old or detached page. Read the current state again.'), { code: 'STALE_ELEMENT' });
const keys = { cmd: 'Meta', super: 'Meta', ctrl: 'Control', control: 'Control', alt: 'Alt', option: 'Alt', shift: 'Shift', return: 'Enter', enter: 'Enter', esc: 'Escape', escape: 'Escape', backspace: 'Backspace', delete: 'Delete', tab: 'Tab', space: 'Space', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown' };
export const browserKey = value => String(value).split('+').map(k => keys[k.toLowerCase()] ?? k).join('+');
const text = node => node?.value === undefined ? '' : String(node.value);
const supportedLocator = new Set(['locator', 'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByTestId', 'getByAltText', 'getByTitle', 'frameLocator', 'filter', 'nth', 'first', 'last']);
const readMethods = new Set(['count', 'innerText', 'textContent', 'allInnerTexts', 'allTextContents', 'inputValue', 'getAttribute', 'isVisible', 'isEnabled', 'isChecked', 'boundingBox', 'ariaSnapshot', 'waitFor']);

export class BrowserActions {
  constructor({ id = 'browser', onTabClosed, onBrowserLost, onPointer, wantsPointer, onVisit } = {}) {
    this.id = id; this.connections = new Map(); this.owners = new Map(); this.records = new Map(); this.nextElementId = 0;
    this.onTabClosed = onTabClosed; this.onBrowserLost = onBrowserLost; this.onPointer = onPointer; this.wantsPointer = wantsPointer;
    this.onVisit=onVisit;
    this.viewportPresets=new Map();this.viewportOwners=new Map();this.emulationPresets=new Map();this.emulations=new Map();
    this.downloadHistory=new Map();this.downloadSessions=new Map();this.downloadObservers=new Map();
  }
  recordId(_connection, targetInfo) { return targetInfo.targetId; }
  async bind(connection, page) {
    this.checkConnection(connection);
    for (const r of connection.pages.values()) if (r.page === page) return r;
    const cdp = await connection.context.newCDPSession(page);
    const { targetInfo } = await cdp.send('Target.getTargetInfo');
    const id = this.recordId(connection, targetInfo);
    const record = { id, page, cdp, generation: 0, elements: new Map(), ids: new Map(), previous: new Map(), logs: [], downloads: new Map(), frames: new Map(), heldButtons: new Set(), heldKeys: new Set(), buttonReleases: new Map(), keyReleases: new Map(), pointer: { x: 0, y: 0 } };
    record.transport = connection.transport;
    record.coordinateId = randomUUID();
    record.frameGenerations = new WeakMap();
    observeNetwork(record);
    cdp.on('Page.downloadWillBegin',event=>{
      const owner=this.owners.get(id)?.sessionId??this.downloadSessions.get(id);if(!owner||this.downloadHistory.has(event.guid))return;
      this.downloadHistory.set(event.guid,{id:event.guid,sessionId:owner,tabId:id,browserId:this.id,filename:event.suggestedFilename,url:event.url,startedAt:Date.now(),state:'inProgress',receivedBytes:0,totalBytes:0});
    });
    cdp.on('Page.downloadProgress',event=>{
      const entry=this.downloadHistory.get(event.guid);if(!entry||!['inProgress','unobserved'].includes(entry.state))return;
      Object.assign(entry,{state:event.state,receivedBytes:event.receivedBytes,totalBytes:event.totalBytes});
    });
    cdp.on('Page.javascriptDialogOpening', value => { record.nativeDialog = value; });
    cdp.on('Page.javascriptDialogClosed', () => { record.dialog = null; record.nativeDialog = null; });
    await cdp.send('Page.enable');
    this.checkConnection(connection);
    connection.pages.set(id, record);
    if(!this.downloadObservers.has(id))this.downloadObservers.set(id,new Set());
    this.downloadObservers.get(id).add(record);
    const visit=()=>{
      const url=page.url();this.visit(id,url);
      void page.title().then(title=>{if(!page.isClosed()&&page.url()===url)this.visit(id,url,title);},()=>{});
    };
    page.on('framenavigated', frame => {
      record.generation++;
      const invalidated = new Set(), main = frame === page.mainFrame();
      const invalidate = changed => { if (!invalidated.has(changed)) { invalidated.add(changed); record.frameGenerations.set(changed, (record.frameGenerations.get(changed) ?? 0) + 1); } };
      invalidate(frame);
      for (const [id, ref] of record.elements) {
        let ancestor = ref.frame;
        while (ancestor && ancestor !== frame) ancestor = ancestor.parentFrame();
        if (main || ancestor === frame || ref.frame.isDetached()) { invalidate(ref.frame); record.elements.delete(id); }
      }
      if (main) { record.previous.clear(); visit(); }
    });
    page.on('domcontentloaded',visit);page.on('load',visit);
    page.on('close', () => {
      connection.pages.delete(id);
      const observers=this.downloadObservers.get(id);observers?.delete(record);
      if(observers?.size===0){
        this.downloadObservers.delete(id);
        for(const download of this.downloadHistory.values())if(download.tabId===id&&download.state==='inProgress')download.state='unobserved';
      }
      // Playwright emits Page.close for CDP disconnection as well as actual
      // tab closure. Only an actual tab close releases global ownership.
      setTimeout(() => {
        if (!connection.closing && connection.browser.isConnected()) {
          const known = this.records.delete(id); this.owners.delete(id);this.downloadSessions.delete(id);this.emulations.delete(id);this.viewportOwners.delete(id);
          if (known) this.onTabClosed?.(id);
        }
      }, 0);
    });
    page.on('console', message => { record.logs.push({ level: message.type(), text: message.text().slice(0,4000), at: Date.now() }); if (record.logs.length > 100) record.logs.shift(); });
    page.on('pageerror', error => { record.logs.push({ level: 'error', text: error.message.slice(0,4000), at: Date.now() }); if (record.logs.length > 100) record.logs.shift(); });
    page.on('dialog', dialog => { record.dialog = dialog; record.wake?.({ dialog: { type: dialog.type(), message: dialog.message(), defaultValue: dialog.defaultValue() } }); });
    page.on('filechooser', chooser => { record.filechooser = chooser; });
    page.on('download', download => {
      const downloadId=randomUUID();record.downloads.set(downloadId,download);
      // Public Playwright path() resolves only after completion. Chromium's
      // allowAndName path ends in its download GUID, shared with Page events.
      void download.path().then(async path=>{
        const entry=path&&this.downloadHistory.get(basename(path));if(!entry)return;
        // Every CDP observer receives the event, but only the connection that
        // configured Chromium's download directory owns the actual file.
        await access(path);entry.path=path;
      }).catch(()=>{});
    });
    this.records.set(id, { ...this.records.get(id), id, title: targetInfo.title, url: page.url(), browserId: this.id });
    return record;
  }
  claim(sessionId, id, created = false) {
    const owner = this.owners.get(id);
    if (owner && owner.sessionId !== sessionId) throw new Error('This tab is being controlled by another conversation.');
    if (!owner) this.owners.set(id, { sessionId, created, keep: false });
    // Download attribution outlives the model's turn-scoped input lease.
    // A later explicit selection transfers future downloads, never old ones.
    this.downloadSessions.set(id,sessionId);
    const known=this.records.get(id);if(known)this.visit(id,known.url,known.title);
  }
  visit(tabId,url,title=''){
    const sessionId=this.owners.get(tabId)?.sessionId??this.downloadSessions.get(tabId);
    if(sessionId)this.onVisit?.({sessionId,tabId,browserId:this.id,url,title});
  }
  keepForUser(sessionId, id) {
    const owner = this.owners.get(id);
    if (owner?.sessionId === sessionId) owner.keep = true;
  }
  async releaseInput(record) {
    await cancelWebMcp(record);
    // The AX CDP channel remains usable while a Playwright action is waiting.
    // Release buttons before disconnecting, rather than hoping a finally block
    // can deliver mouseUp through a connection that has already been closed.
    const results = await Promise.allSettled(this.queueInputRelease(record));
    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason);
    if (errors.length) throw new AggregateError(errors, 'Browser input release failed: ' + errors.map(e => e.message).join('; '));
  }
  releaseButton(record, button) {
    if (record.buttonReleases.has(button)) return record.buttonReleases.get(button);
    const pending = record.page.mouse.up({ button, clickCount: record.clickCounts?.[button] ?? 1 }).then(() => { record.heldButtons.delete(button); }).finally(() => { record.buttonReleases.delete(button); });
    record.buttonReleases.set(button, pending); void pending.catch(() => {}); return pending;
  }
  releaseKey(record, key) {
    if (record.keyReleases.has(key)) return record.keyReleases.get(key);
    const pending = record.page.keyboard.up(key).then(() => { record.heldKeys.delete(key); }).finally(() => { record.keyReleases.delete(key); });
    record.keyReleases.set(key, pending); void pending.catch(() => {}); return pending;
  }
  queueInputRelease(record) {
    return [...(record.heldTouch?[this.releaseTouch(record,true)]:[]), ...[...record.heldButtons].map(button => this.releaseButton(record, button)), ...[...record.heldKeys].map(key => this.releaseKey(record, key))];
  }
  async touch(record,type,position){
    if(type==='touchStart')record.heldTouch=true;
    const touchPoints=position?[{id:1,x:position.x,y:position.y}]:[];
    await record.cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
    if(type==='touchEnd'||type==='touchCancel')record.heldTouch=false;
  }
  async releaseTouch(record,cancel=false){
    if(record.touchRelease)return record.touchRelease;
    if(!record.heldTouch)return;
    const pending=this.touch(record,cancel?'touchCancel':'touchEnd');record.touchRelease=pending;
    try{await pending;}finally{if(record.touchRelease===pending)record.touchRelease=null;}
  }
  async tap(record,position,signal){
    signal?.throwIfAborted();
    try{await this.touch(record,'touchStart',position);signal?.throwIfAborted();}
    finally{await this.releaseTouch(record,!!signal?.aborted);}
  }
  async tapLocator(record,locator,options={},signal){
    // Let Playwright check strictness, visibility, stability and hit targeting
    // without dispatching mouse input; CDP touch does not require recreating
    // the persistent browser context with Playwright's hasTouch option.
    await locator.click({...options,trial:true});signal?.throwIfAborted();
    const box=await locator.boundingBox();if(!box)throw new Error('The touch target is no longer visible.');
    const position=options.position??{x:box.width/2,y:box.height/2};
    await this.tap(record,{x:box.x+position.x,y:box.y+position.y},signal);
  }
  async resolveElement(cdp, frame, backendNodeId) {
    const slot = '__trisoul_' + randomUUID().replaceAll('-', '');
    let objectId;
    try {
      const response = await cdp.send('DOM.resolveNode', { backendNodeId }); objectId = response.object.objectId;
      if (!objectId) throw stale();
      const stored = await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function(key) { if (!this.isConnected) throw new Error("Detached element"); Object.defineProperty(globalThis,key,{value:this,configurable:true}); }', arguments: [{ value: slot }] });
      if (stored.exceptionDetails) throw stale();
      const handle = await frame.evaluateHandle(key => { const element = globalThis[key]; delete globalThis[key]; return element; }, slot);
      if (!handle.asElement()) { await handle.dispose(); throw stale(); }
      return handle.asElement();
    } finally {
      await frame.evaluate(key => { delete globalThis[key]; }, slot).catch(() => {});
      if (objectId) await cdp.send('Runtime.releaseObject', { objectId }).catch(() => {});
    }
  }
  async frameBindings(record) {
    const bindings = [], visited = new Set(), { frameTree } = await record.cdp.send('Page.getFrameTree');
    const visit = async (tree, frame, cdp) => {
      if (visited.has(frame)) return;
      visited.add(frame);
      bindings.push({ frame, cdp, frameId: tree.frame.id });
      for (const child of tree.childFrames ?? []) {
        const { backendNodeId } = await cdp.send('DOM.getFrameOwner', { frameId: child.frame.id });
        const owner = await this.resolveElement(cdp, frame, backendNodeId);
        let inner;
        try { inner = await owner.contentFrame(); } finally { await owner.dispose(); }
        if (!inner) throw stale();
        let innerCdp = record.frames.get(inner);
        if (!innerCdp) {
          try { innerCdp = await record.page.context().newCDPSession(inner); }
          catch (error) { if (!error.message.includes('part of the parent frame')) throw error; innerCdp = cdp; }
          record.frames.set(inner, innerCdp);
        }
        await visit(child, inner, innerCdp);
      }
    };
    await visit(frameTree, record.page.mainFrame(), record.cdp);
    // A native target's frame tree can omit out-of-process children. Read
    // those through their own actual CDP sessions; URL matching is ambiguous
    // when several frames load the same document.
    for (const frame of record.page.frames()) {
      if (visited.has(frame)) continue;
      let cdp = record.frames.get(frame);
      if (!cdp) { cdp = await record.page.context().newCDPSession(frame); record.frames.set(frame, cdp); }
      const { frameTree: childTree } = await cdp.send('Page.getFrameTree');
      await visit(childTree, frame, cdp);
    }
    return bindings;
  }
  async snapshot(record, options, signal, includeScreenshot = false) {
    let deadline;
    while (true) {
      signal?.throwIfAborted(); const generation = record.generation;
      try { return await this.readSnapshot(record, options, signal, includeScreenshot); }
      catch (error) {
        signal?.throwIfAborted();
        if (record.page.isClosed() || (generation === record.generation && !['STALE_ELEMENT', 'STALE_SCREENSHOT'].includes(error.code))) throw error;
        // A slow initial observation still gets a fresh read after navigation.
        // Start this bounded retry window once; further changes never extend it.
        deadline ??= Date.now() + 2000;
        if (Date.now() >= deadline) throw error;
        // Retry observation only. An old action/element must still fail rather
        // than silently acquiring a different object after navigation.
        await delay(25, undefined, { signal });
      }
    }
  }
  async readSnapshot(record, { disableDiffing = false, maxElements = 2000 } = {}, signal, includeScreenshot) {
    if (record.dialog) return { state: JSON.stringify({ dialog: { type: record.dialog.type(), message: record.dialog.message() } }) };
    const generation = record.generation, elements = new Map(), lines = new Map(); let truncated = false;
    for (const { frame, cdp, frameId } of await this.frameBindings(record)) {
      const frameGeneration = record.frameGenerations.get(frame) ?? 0;
      const { nodes } = await cdp.send('Accessibility.getFullAXTree', { frameId });
      const byId = new Map(nodes.map(n => [n.nodeId, n]));
      const frameKey = frameId;
      // CDP returns breadth-first rows. Indenting those rows directly falsely
      // nests later siblings under earlier controls (especially iframes).
      const ordered = [], visited = new Set();
      const visit = node => { if (!node || visited.has(node.nodeId)) return; visited.add(node.nodeId); ordered.push(node); for (const id of node.childIds ?? []) visit(byId.get(id)); };
      for (const node of nodes) if (!node.parentId || !byId.has(node.parentId)) visit(node);
      for (const node of nodes) visit(node);
      for (const node of ordered) {
        if (node.ignored) continue;
        const role = text(node.role), name = text(node.name), value = text(node.value);
        if (!name && !value && ['none','generic','InlineTextBox'].includes(role)) continue;
        if (role === 'InlineTextBox') continue;
        if (lines.size >= maxElements) { truncated = true; break; }
        const key = `${record.frameGenerations.get(record.page.mainFrame()) ?? 0}:${frameGeneration}:${frameKey}:${node.backendDOMNodeId ?? node.nodeId}`;
        if (!record.ids.has(key)) record.ids.set(key, ++this.nextElementId);
        const id = record.ids.get(key); let depth = 0, parent = node.parentId;
        while (parent && depth < 25) { const p = byId.get(parent); if (!p) break; if (!p.ignored) depth++; parent = p.parentId; }
        const props = (node.properties ?? []).filter(p => ['checked','selected','expanded','disabled','required','readonly','focused','multiselectable'].includes(p.name)).map(p => `${p.name}=${text(p.value)}`);
        const frameLabel = role === 'RootWebArea' && frame !== record.page.mainFrame() ? ' [iframe ' + JSON.stringify(frame.url()) + ']' : '';
        const line = `${'  '.repeat(depth)}${id} ${role}${name ? ' ' + JSON.stringify(name) : ''}${value ? ' value=' + JSON.stringify(value) : ''}${props.length ? ' [' + props.join(', ') + ']' : ''}${frameLabel}`;
        lines.set(id, line);
        if (node.backendDOMNodeId) elements.set(id, { backendNodeId: node.backendDOMNodeId, frame, cdp, frameGeneration, role });
      }
    }
    const title = await record.page.title(), url = record.page.url();
    const captured = includeScreenshot ? await this.observeScreenshot(record, {}, signal) : undefined;
    signal?.throwIfAborted();
    if (generation !== record.generation) throw stale();
    let body;
    if (!disableDiffing && record.previous.size) {
      const removed = [...record.previous.keys()].filter(id => !lines.has(id));
      body = [...(removed.length ? ['Removed: ' + removed.join(', ')] : []), ...[...lines].filter(([id,line]) => record.previous.get(id) !== line).map(([id,line]) => (record.previous.has(id) ? '~ ' : '+ ') + line)].join('\n') || 'No accessibility changes.';
    } else body = [...lines.values()].join('\n');
    record.elements = elements; record.previous = lines;
    if (record.ids.size > 10000) record.ids = new Map([...record.ids].filter(([,id]) => lines.has(id)));
    return { state: `Tab ${record.id}: ${JSON.stringify(title)}\nURL: ${url}\n${body}${truncated ? '\n[Tree truncated at ' + maxElements + ' rows]' : ''}`, generation, ...captured };
  }
  async element(record, id) {
    const ref = record.elements.get(id);
    if (!ref || ref.frameGeneration !== (record.frameGenerations.get(ref.frame) ?? 0) || ref.frame.isDetached()) throw stale();
    try {
      const element = await this.resolveElement(ref.cdp, ref.frame, ref.backendNodeId);
      if (ref.frameGeneration !== (record.frameGenerations.get(ref.frame) ?? 0) || ref.frame.isDetached()) { await element.dispose(); throw stale(); }
      return element;
    } catch (error) { throw Object.assign(stale(), { cause: error }); }
  }
  locator(record, chain = []) {
    let locator = record.page;
    for (const { method, args = [] } of chain) {
      if (!supportedLocator.has(method)) throw new Error(`Unsupported locator method: ${method}`);
      const parameters = args.slice(), index = method === 'filter' ? 0 : method === 'locator' ? 1 : -1;
      if (index >= 0 && parameters[index]) {
        const options = { ...parameters[index] };
        for (const key of ['has', 'hasNot']) if (options[key] !== undefined) {
          const nested = options[key]?.$locator;
          if (!nested || nested.id !== record.id || !Array.isArray(nested.chain)) throw new Error('Nested locators must belong to the same browser tab.');
          options[key] = this.locator(record, nested.chain);
        }
        parameters[index] = options;
      }
      locator = locator[method](...parameters);
    }
    return locator;
  }
  async perform(record, operation) {
    if (record.dialog) throw new Error('A JavaScript dialog is open. Read and handle the dialog before another action.');
    let wake;
    const dialog = new Promise(resolve => { wake = resolve; record.wake = resolve; });
    const action = Promise.resolve().then(operation);
    // Dialogs intentionally interrupt the call so the model can answer them.
    // Keep the original action tracked until the dialog has been resolved.
    record.pendingAction = action;
    try { const result = await Promise.race([action, dialog]); return result ?? null; }
    finally { if (record.wake === wake) record.wake = null; if (!record.dialog) record.pendingAction = null; }
  }
  async capture(record, options = {}, geometry, signal) {
    if (options.fullPage) {
      const current = geometry ?? await screenshotGeometry(record);
      if (current.scale !== 1) throw new Error('Full-page capture is unavailable while pinch zoom is active. Use a viewport screenshot.');
      return captureFullPage(record);
    }
    return captureViewport(record, geometry ?? await screenshotGeometry(record), signal);
  }
  async observeScreenshot(record, options = {}, signal) {
    return observeScreenshot(record, options, signal, (settings, geometry) => this.capture(record, settings, geometry, signal));
  }
  validateViewport(size){if(!size||!['width','height'].every(key=>Number.isInteger(size[key])&&size[key]>0&&size[key]<=10000000))throw new Error('Viewport width and height must be positive integers within Chromium limits.');}
  async setViewport(record,size,mode='device'){
    this.validateViewport(size);
    record.pendingViewportSets=(record.pendingViewportSets??0)+1;
    try{return await withViewportTransaction(record,async()=>{
      if(record.dialog||record.nativeDialog)throw new Error('Answer the open JavaScript dialog before changing the viewport.');
      const geometry=await screenshotGeometry(record),existing=this.emulations.get(record.id);
      if(!record.viewportOverride){record.viewportNativeSize=existing?.nativeSize??{width:Math.round(geometry.width*geometry.scale),height:Math.round(geometry.height*geometry.scale)};record.viewportNativeDpr=existing?.nativeDpr??geometry.devicePixelRatio/geometry.zoom;}
      await applyMetrics(this,record,size);
      record.viewportOverride=true;record.viewportMode=mode;record.viewportSize={width:size.width,height:size.height};
      this.viewportOwners.set(record.id,record);record.screenshotFrame=null;
    });}finally{record.pendingViewportSets--;}
  }
  async resetViewport(record){
    // Observer teardown must not wait for an unrelated, possibly lost capture
    // reply. A queued resize still needs a reset after it actually applies.
    if(!record.viewportOverride&&!record.pendingViewportSets)return;
    return withViewportTransaction(record,async()=>{
      if(!record.viewportOverride)return;
      if(this.viewportOwners.get(record.id)===record){
        const emulation=this.emulations.get(record.id);
        if(!record.page.isClosed()){
          if(emulation&&('deviceScaleFactor' in emulation.settings||'isMobile' in emulation.settings))await applyMetrics(this,record,record.viewportNativeSize??emulation.nativeSize);
          else await record.cdp.send('Emulation.clearDeviceMetricsOverride');
        }
        this.viewportOwners.delete(record.id);
      }
      record.viewportOverride=false;record.viewportMode=null;record.viewportSize=null;record.screenshotFrame=null;
    });
  }
  async browserViewport(sessionId,size,signal){
    signal?.throwIfAborted();
    if(size)this.validateViewport(size);
    const preset=size?{size:{width:size.width,height:size.height},id:randomUUID()}:null;
    if(preset)this.viewportPresets.set(sessionId,preset);else this.viewportPresets.delete(sessionId);
    for(const [id,owner]of this.owners)if(owner.sessionId===sessionId){
      signal?.throwIfAborted();
      const record=await this.target(sessionId,id);
      signal?.throwIfAborted();
      if(preset){await this.setViewport(record,preset.size);record.viewportPreset=preset.id;}else await this.resetViewport(record);
    }
  }
  validateEmulation(settings){return validateEmulation(settings);}
  emulationSettings(id){return emulationSettings(this,id);}
  async setEmulation(record,settings,signal){return setEmulation(this,record,settings,signal);}
  async resetEmulation(record,{ownedOnly=false}={}){return setEmulation(this,record,null,undefined,{ownedOnly});}
  async restoreOverrides(record){await this.resetEmulation(record,{ownedOnly:true});await this.resetViewport(record);}
  async browserEmulation(sessionId,settings,signal){
    signal?.throwIfAborted();
    const normalized=settings===null?null:this.validateEmulation(settings);
    const preset=normalized&&Object.keys(normalized).length?{settings:normalized,id:randomUUID()}:null;
    const previousPreset=this.emulationPresets.get(sessionId),changed=[];
    try{
      for(const [id,owner]of this.owners)if(owner.sessionId===sessionId){
        signal?.throwIfAborted();const record=await this.target(sessionId,id);signal?.throwIfAborted();
        const previous=this.emulations.get(id),previousId=record.emulationPreset;
        await this.setEmulation(record,preset?.settings??null,signal);changed.push({record,previous,previousId});record.emulationPreset=preset?.id;
      }
      if(preset)this.emulationPresets.set(sessionId,preset);else this.emulationPresets.delete(sessionId);
    }catch(error){
      if(previousPreset)this.emulationPresets.set(sessionId,previousPreset);else this.emulationPresets.delete(sessionId);
      const errors=[error];
      for(const {record,previous,previousId}of changed.reverse())try{await this.setEmulation(previous?.record??record,previous?.settings??null);record.emulationPreset=previousId;}catch(cleanup){errors.push(cleanup);}
      if(errors.length>1)throw Object.assign(new AggregateError(errors,'Browser device emulation restoration failed: '+errors.map(error=>error.message).join('; ')),{code:'EMULATION_RESTORE_FAILED'});
      throw error;
    }
  }
  async screenshotPoints(record, values, frame = record.screenshotFrame) {
    const points = values.map(point);
    if (!frame) return points;
    const current = await screenshotGeometry(record);
    if (!sameScreenshotGeometry(frame, current)) throw staleScreenshot();
    // CDP already translates a visual-viewport coordinate by the pinch pan.
    // Adding offsetX/Y here would apply that translation a second time.
    return points.map(p => {
      const result=frame.fullPage?{x:p.x-frame.pageX,y:p.y-frame.pageY}:{x:p.x/(frame.region?.scale??frame.scale)+(frame.region?.x??0),y:p.y/(frame.region?.scale??frame.scale)+(frame.region?.y??0)};
      if(result.x<0||result.y<0||result.x>=current.width||result.y>=current.height)throw new Error('This screenshot point is outside the visible viewport. Scroll to that area and take a fresh screenshot before clicking.');
      return result;
    });
  }
  async invoke(sessionId, id, method, args = [], signal, screenshotFrame) {
    signal?.throwIfAborted();
    const record = await this.target(sessionId, id), page = record.page;
    const navigating = ['goto', 'back', 'forward', 'reload'].includes(method);
    const abort = () => { if (method !== 'webmcp.call') void this.disconnect(sessionId).catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      signal?.throwIfAborted();
      if (navigating) record.navigating = true;
      const preset=this.viewportPresets.get(sessionId);
      if(preset&&record.viewportPreset!==preset.id&&!method.startsWith('viewport.')){await this.setViewport(record,preset.size);record.viewportPreset=preset.id;}
      const emulation=this.emulationPresets.get(sessionId);
      if(emulation&&record.emulationPreset!==emulation.id&&!method.startsWith('emulation.')){await this.setEmulation(record,emulation.settings,signal);record.emulationPreset=emulation.id;}
      if (method === 'getAXState') return await this.snapshot(record, args[0], signal);
      if (method === 'getScreenshot'||method==='screenshot') return await this.observeScreenshot(record, args[0], signal);
      if (method === 'getAXStateAndScreenshot') return await this.snapshot(record, args[0], signal, true);
      if (method === 'pageAssets.list') return await listPageAssets(record, signal);
      if (method === 'network.list') return listNetwork(record, args[0]);
      if (method === 'network.request') return await networkRequest(record, args[0], signal);
      if (method === 'network.responseBody') return await networkResponseBody(record, args[0], signal);
      if (method === 'pageAssets.bundle') return await bundlePageAssets(record, args[0], signal);
      if (method === 'content.export') return await exportPageContent(record, signal, () => this.frameBindings(record));
      if (method === 'capabilities.list') return [{ id: 'pageAssets', description: 'Inventory and export assets already loaded by the current page.' }, ...(await webMcpAvailable(record, signal) ? [{ id: 'webmcp', description: 'Discover and invoke page-defined tools using the browser WebMCP protocol.' }] : [])];
      if (method === 'webmcp.fetchTools') return await fetchWebMcpTools(record, signal);
      if (method === 'webmcp.call') return await callWebMcpTool(record, args[0], args[1], args[2], signal);
      if (method === 'dialog.get') return record.dialog ? { type: record.dialog.type(), message: record.dialog.message(), defaultValue: record.dialog.defaultValue() } : null;
      if (method === 'dialog.accept' || method === 'dialog.dismiss') {
        if (!record.dialog) throw new Error('No dialog is open');
        const dialog = record.dialog, previous = record.pendingAction; record.dialog = null;
        return await this.perform(record, async () => {
          if (method.endsWith('accept')) await dialog.accept(args[0]); else await dialog.dismiss();
          try {
            const outcome = await previous;
            return outcome?.triggeringActionError ? outcome : null;
          } catch (error) {
            // Answering the dialog succeeded; the interrupted action has its
            // own outcome and must not be reported as an answer failure.
            return { dialogHandled: true, triggeringActionError: { name: error.name ?? 'Error', message: error.message ?? String(error) } };
          }
        });
      }
      if (method === 'downloads.list') return [...record.downloads].map(([id,d]) => ({ id, filename: d.suggestedFilename(), url: d.url() }));
      if (method === 'downloads.save') { const d = record.downloads.get(args[0]); if (!d) throw new Error('Unknown download'); await d.saveAs(args[1]); const failure = await d.failure(); if (failure) throw new Error(failure); return { path: args[1], filename: d.suggestedFilename() }; }
      if (method === 'filechooser.setFiles') {
        // The intercepted chooser event can arrive just after click resolves.
        // Wait for that in-flight event rather than requiring another model call.
        if (!record.filechooser) {
          try { await page.waitForEvent('filechooser', { timeout: 1000 }); }
          catch (error) { signal?.throwIfAborted(); if (error.name === 'TimeoutError') throw new Error('No file chooser is open'); throw error; }
        }
        signal?.throwIfAborted();
        if (!record.filechooser) throw new Error('No file chooser is open');
        const chooser = record.filechooser;
        await chooser.setFiles(args[0]);
        if (record.filechooser === chooser) record.filechooser = null;
        return null;
      }
      if (method === 'logs') return record.logs.slice();
      if (method === 'markDeliverable' || method === 'markHandoff') { this.owners.get(id).keep = true; return null; }
      if (method === 'viewport.set') {
        await this.setViewport(record,args[0]);return null;
      }
      if (method === 'viewport.reset') {await this.resetViewport(record);return null;}
      if (method === 'emulation.set') {await this.setEmulation(record,args[0],signal);return null;}
      if (method === 'emulation.reset') {await this.resetEmulation(record);return null;}
      if (method === 'close') { await page.close(); return null; }
      return await this.perform(record, async () => {
        if (method === 'goto') { await page.goto(args[0], { waitUntil: 'domcontentloaded' }); return null; }
        if (method === 'back' || method === 'forward') {
          // A BFCache restore has no new DOMContentLoaded event. Wait for the
          // actual history commit, then inspect the restored document's state.
          await page[method === 'back' ? 'goBack' : 'goForward']({ waitUntil: 'commit' });
          await page.waitForFunction(() => document.readyState !== 'loading'); return null;
        }
        if (method === 'reload') { await page.reload({ waitUntil: 'domcontentloaded' }); return null; }
        if (method === 'pressKey') { await page.keyboard.press(browserKey(args[0])); return null; }
        if (method === 'typeText' || method === 'paste') { await page.keyboard.insertText(args[0]); return null; }
        if (method === 'locator') {
          const [chain, action, actionArgs = []] = args;
          if (![...readMethods, 'evaluate','evaluateAll','click','dblclick','fill','press','type','pressSequentially','check','uncheck','setChecked','selectOption','setInputFiles','hover','scrollIntoViewIfNeeded','focus','blur'].includes(action)) throw new Error(`Unsupported locator action: ${action}`);
          const locator = this.locator(record, chain);
          if (['evaluate','evaluateAll'].includes(action) && actionArgs[0]?.$function) {
            return locator[action]((element,{source,arg}) => (0,eval)('(' + source + ')')(element,arg), {source:actionArgs[0].$function,arg:actionArgs[1]});
          }
          const options=actionArgs[0]??{};
          if(action==='click'&&this.emulationSettings(id)?.hasTouch&&(!options.button||options.button==='left')&&(!options.clickCount||options.clickCount===1)&&!options.trial&&!options.modifiers?.length){await this.tapLocator(record,locator,options,signal);return null;}
          const result = await locator[action](...actionArgs); return result ?? null;
        }
        if (method === 'evaluate') {
          if (args[0]?.$function) return page.evaluate(({source,arg}) => (0,eval)('(' + source + ')')(arg), {source:args[0].$function,arg:args[1]});
          return page.evaluate(args[0], args[1]);
        }
        if (method === 'waitForLoadState') { await page.waitForLoadState(...args); return null; }
        if (method === 'waitForURL') { await page.waitForURL(...args); return null; }
        if (method === 'url') return page.url();
        if (method === 'title') return page.title();
        if (method === 'drag') {
          const [from,to] = await this.screenshotPoints(record, args, screenshotFrame); signal?.throwIfAborted();
          if(this.emulationSettings(id)?.hasTouch){
            try{await this.touch(record,'touchStart',from);for(let step=1;step<=12;step++){signal?.throwIfAborted();await this.touch(record,'touchMove',{x:from.x+(to.x-from.x)*step/12,y:from.y+(to.y-from.y)*step/12});}}
            finally{await this.releaseTouch(record,!!signal?.aborted);}return null;
          }
          await page.mouse.move(from.x,from.y); signal?.throwIfAborted();
          record.pointer = from; record.heldButtons.add('left'); await page.mouse.down();
          try { record.pointer = to; await page.mouse.move(to.x,to.y,{ steps: 12 }); }
          finally { if (record.heldButtons.has('left')) await this.releaseButton(record, 'left'); }
          return null;
        }
        let handle;
        try {
          if (typeof args[0] === 'number') handle = await this.element(record,args[0]);
          if (method === 'click') {
            const options = { button: args[1]?.mouseButton ?? 'left', clickCount: args[1]?.clickCount ?? 1 };
            if(this.emulationSettings(id)?.hasTouch&&options.button==='left'&&options.clickCount===1){
              if(handle)await this.tapLocator(record,handle,{},signal);else{const [p]=await this.screenshotPoints(record,[args[0]],screenshotFrame);await this.tap(record,p,signal);}
            }else if (handle) await handle.click(options); else { const [p] = await this.screenshotPoints(record, [args[0]], screenshotFrame); signal?.throwIfAborted(); await page.mouse.click(p.x,p.y,options); }
          } else if (method === 'selectText') {
            if (!handle) throw new Error('selectText requires an observed element id');
            await handle.evaluate((element, { text, options }) => {
              const { prefix, suffix, selectionType = 'select' } = options;
              if (typeof text !== 'string' || !text.length) throw new Error('selectText requires non-empty text');
              if (!['select', 'before', 'after'].includes(selectionType)) throw new Error('selectionType must be select, before or after');
              if ((prefix !== undefined && typeof prefix !== 'string') || (suffix !== undefined && typeof suffix !== 'string')) throw new Error('prefix and suffix must be strings');
              const doc = element.ownerDocument;
              const input = element.localName === 'input' || element.localName === 'textarea';
              if (input && element.matches(':disabled')) throw new Error('Cannot select text in a disabled input');
              const segments = [];
              let value = input ? element.value : '';
              if (!input) {
                const append = (text, start, end) => { segments.push({ offset: value.length, text, start, end }); value += text; };
                const visit = node => {
                  if (node.nodeType === 3) { append(node.data, [node, 0], [node, node.data.length]); return; }
                  if (node.nodeType !== 1) return;
                  const style = doc.defaultView.getComputedStyle(node);
                  if (style.display === 'none' || style.visibility === 'hidden') return;
                  const parent = node.parentNode, index = Array.prototype.indexOf.call(parent.childNodes, node);
                  if (node.localName === 'br') { append('\n', [parent, index], [parent, index + 1]); return; }
                  const block = ['block', 'list-item', 'table-row'].includes(style.display);
                  if (block && value && !value.endsWith('\n')) append('\n', [parent, index], [node, 0]);
                  for (const child of node.childNodes) visit(child);
                  if (block && value && !value.endsWith('\n')) append('\n', [node, node.childNodes.length], [parent, index + 1]);
                };
                for (const child of element.childNodes) visit(child);
                // A final block separator is not part of the root's visible text.
                if (segments.at(-1)?.text === '\n' && segments.at(-1).start[0].nodeType !== 3 && !element.innerText?.endsWith('\n')) { value = value.slice(0, -1); segments.pop(); }
                if (typeof element.innerText === 'string' && value !== element.innerText) throw new Error('This rendered text layout cannot be mapped exactly for selection');
              }
              const matches = [];
              for (let at = value.indexOf(text); at !== -1; at = value.indexOf(text, at + 1)) {
                if ((prefix === undefined || value.slice(0, at).endsWith(prefix)) && (suffix === undefined || value.slice(at + text.length).startsWith(suffix))) matches.push(at);
              }
              if (matches.length !== 1) throw new Error('Selection must match exactly once; use prefix/suffix to disambiguate.');
              const start = matches[0] + (selectionType === 'after' ? text.length : 0);
              const end = matches[0] + (selectionType === 'before' ? 0 : text.length);
              if (input) {
                if (element.selectionStart === null) throw new Error('This input does not support text selection');
                element.focus(); element.setSelectionRange(start, end);
                if (element.getRootNode().activeElement !== element || element.selectionStart !== start || element.selectionEnd !== end) throw new Error('Text input did not accept focus and selection');
              } else {
                const point = position => {
                  const entry = segments.find(({ offset, text }) => position >= offset && position <= offset + text.length);
                  if (!entry) throw new Error('Text selection range is unavailable');
                  if (position === entry.offset) return entry.start;
                  if (position === entry.offset + entry.text.length) return entry.end;
                  return [entry.start[0], position - entry.offset];
                };
                const range = doc.createRange(); range.setStart(...point(start)); range.setEnd(...point(end));
                element.focus();
                const active = element.getRootNode().activeElement;
                if (element.isContentEditable && active !== element && !element.contains(active)) throw new Error('Editable text did not accept focus');
                if (active && active !== element && !element.contains(active)) active.blur?.();
                const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range);
              }
            }, { text: args[1], options: args[2] ?? {} });
          } else if (method === 'setValue') {
            if (!handle) throw new Error('setValue requires an observed element id');
            const kind = record.elements.get(args[0]).role;
            if (kind === 'checkbox' || kind === 'switch') await handle.setChecked(['1','true',true,1].includes(args[1]));
            else if (kind === 'combobox') await handle.selectOption(args[1]);
            else await handle.fill(String(args[1]));
          } else if (method === 'scroll') {
            const box = handle ? await handle.boundingBox() : null, p = handle ? box && { x:box.x+box.width/2,y:box.y+box.height/2 } : (await this.screenshotPoints(record, [args[0]], screenshotFrame))[0];
            if (!p) throw new Error('Scroll target has no visible bounds');
            signal?.throwIfAborted();
            await page.mouse.move(p.x,p.y);
            const size = page.viewportSize() ?? { width:1280,height:800 }, amount = args[2] ?? 1;
            await page.mouse.wheel(args[1] === 'left' ? -size.width*amount : args[1] === 'right' ? size.width*amount : 0,args[1] === 'up' ? -size.height*amount : args[1] === 'down' ? size.height*amount : 0);
          } else throw new Error(`Unsupported browser operation: ${method}`);
          return null;
        } finally { if (handle) await handle.dispose(); }
      });
    } finally { if (navigating) record.navigating = false; signal?.removeEventListener('abort', abort); }
  }
}
