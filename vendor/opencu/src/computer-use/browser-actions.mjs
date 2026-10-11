import { randomUUID } from 'node:crypto';
import { applyMetrics, validateEmulation, setEmulation, emulationSettings } from './browser-emulation.mjs';
import {basename} from 'node:path';
import {access} from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { point } from './coordinates.mjs';
import { observeNetwork, listNetwork, networkRequest, networkResponseBody, observeConsole, listConsole, waitForBrowser } from './browser-network.mjs';
import { listPageAssets, bundlePageAssets, exportPageContent, exportGsuiteContent, exportYouTubeTranscript } from './browser-content.mjs';
import { fetchWebMcpTools, callWebMcpTool, cancelWebMcp, webMcpAvailable } from './browser-webmcp.mjs';
import { captureViewport, captureFullPage, observeScreenshot, withViewportTransaction, screenshotGeometry, sameScreenshotGeometry, screenshotPointToViewport, staleScreenshot } from './browser-screenshot.mjs';
import { snapshotFrameContexts } from './snapshot-context.mjs';
import { browserClipboardReadText, browserClipboardWriteText, browserClipboardRead, browserClipboardWrite, browserClipboardPaste, browserClipboardShortcutAction, browserClipboardShortcut, cleanupBrowserClipboard } from './paste.mjs';
import { evaluateReadonly } from './browser-evaluate.mjs';
import { createTabCapabilities } from './browser-capabilities.mjs';
import { downloadLocatorMedia, downloadMediaAtPoint, downloadMediaForDomNode, waitForBrowserEvent, downloadPath, setFileChooserFiles, setLocatorInputFiles } from './browser-download-media.mjs';
import { browserDomSnapshot } from './browser-dom-snapshot.mjs';

const stale = () => Object.assign(new Error('This element belongs to an old or detached page. Read the current state again.'), { code: 'STALE_ELEMENT' });
const keys = { cmd: 'Meta', command: 'Meta', meta: 'Meta', win: 'Meta', super: 'Meta', ctrl: 'ControlOrMeta', controlormeta: 'ControlOrMeta', control: 'Control', alt: 'Alt', option: 'Alt', shift: 'Shift', return: 'Enter', enter: 'Enter', esc: 'Escape', escape: 'Escape', backspace: 'Backspace', delete: 'Delete', tab: 'Tab', space: 'Space', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown' };
export const browserKey = value => String(value).split('+').map(k => keys[k.toLowerCase()] ?? k).join('+');
const text = node => node?.value === undefined ? '' : String(node.value);
const supportedLocator = new Set(['locator', 'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByTestId', 'getByAltText', 'getByTitle', 'frameLocator', 'filter', 'nth', 'first', 'last', 'and', 'or']);
const readMethods = new Set(['count', 'innerText', 'textContent', 'allInnerTexts', 'allTextContents', 'inputValue', 'getAttribute', 'isVisible', 'isEnabled', 'isChecked', 'boundingBox', 'ariaSnapshot', 'waitFor']);
const collectionMethods = new Set(['count', 'allInnerTexts', 'allTextContents', 'evaluateAll']);
const firstMatchMethods = new Set(['isVisible', 'isEnabled', 'waitFor']);
const valueOptionMethods = new Set(['fill', 'press', 'type', 'pressSequentially', 'setChecked', 'selectOption', 'setInputFiles', 'getAttribute']);
const noOptionMethods = new Set(['count', 'allInnerTexts', 'allTextContents', 'evaluateAll']);

function locatorArguments(action, args) {
  const parameters = args.slice(), index = ['evaluate', 'evaluateAll'].includes(action) ? 2 : valueOptionMethods.has(action) ? 1 : 0;
  const options = { ...parameters[index] }, maximum = action === 'downloadMedia' ? 120000 : action === 'pressSequentially' ? 5000 : 3000;
  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) throw new Error('timeoutMs must be a positive integer');
  const timeout = options.timeoutMs === undefined ? options.timeout ?? maximum : Math.min(maximum, Math.max(0, options.timeoutMs));
  delete options.timeoutMs;
  options.timeout = timeout;
  if (!noOptionMethods.has(action)) parameters[index] = options;
  return { parameters, timeout };
}

function selectOptions(value) {
  const selections = Array.isArray(value) ? value : [value];
  if (!selections.length) throw new Error('locator.selectOption requires at least one value');
  return selections.map(selection => {
    if (typeof selection === 'string') return { value: selection };
    if (!selection || typeof selection !== 'object') throw new Error('locator.selectOption requires a string or { value?, label?, index? }');
    const result = {};
    for (const key of ['value', 'label']) if (selection[key] !== undefined) {
      if (typeof selection[key] !== 'string') throw new Error(`locator.selectOption ${key} must be a string`);
      result[key] = selection[key];
    }
    if (selection.index !== undefined) {
      if (!Number.isInteger(selection.index) || selection.index < 0) throw new Error('locator.selectOption index must be a non-negative integer');
      result.index = selection.index;
    }
    if (!Object.keys(result).length) throw new Error('locator.selectOption requires value, label, or index for each selection');
    return result;
  });
}

function inputDuration(options = {}) {
  options ??= {};
  if (options.durationMs !== undefined) {
    if (!Number.isSafeInteger(options.durationMs) || options.durationMs < 0 || options.durationMs > 30000) throw new Error('durationMs must be an integer from 0 to 30000 milliseconds.');
    return options.durationMs;
  }
  if (options.duration === undefined) return 0;
  if (!Number.isFinite(options.duration) || options.duration < 0 || options.duration > 30) throw new Error('duration must be between 0 and 30 seconds.');
  return options.duration * 1000;
}

function setAccessibilityValue(element, value) {
  const view = element.ownerDocument.defaultView;
  const { HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement, HTMLOptionElement, HTMLOptGroupElement, HTMLElement, Event, InputEvent } = view;
  const role = element.getAttribute('role');
  const ensureWritable = (name, text = false) => {
    if (!element.isConnected) throw new Error(`${name} is no longer connected`);
    if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') throw new Error(`${name} is disabled`);
    if (text && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.readOnly) throw new Error(`${name} is read-only`);
  };
  const changed = () => {
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
    const name = element.type === 'radio' ? 'Radio button' : role === 'switch' ? 'Switch' : 'Checkbox';
    if (!['0', '1', 'false', 'true'].includes(value)) throw new Error(`${name} value must be 0, 1, false, or true`);
    ensureWritable(name);
    const requested = value === '1' || value === 'true', differs = element.checked !== requested || element.type === 'checkbox' && element.indeterminate;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
    if (!setter) throw new Error(`${name} native setter is unavailable`);
    element.focus(); setter.call(element, requested);
    if (element.type === 'checkbox') {
      const indeterminate = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'indeterminate')?.set;
      if (!indeterminate) throw new Error(`${name} indeterminate setter is unavailable`);
      indeterminate.call(element, false);
    }
    if (differs) changed();
    if (!element.isConnected || element.checked !== requested || element.type === 'checkbox' && element.indeterminate) throw new Error(`${name} did not retain the requested state`);
    return 'done';
  }
  if (element instanceof HTMLSelectElement) {
    ensureWritable('Select');
    if (element.multiple) throw new Error('Multi-select controls are not supported');
    const options = [...element.options];
    let option = options.find(option => option.value === value);
    if (!option) {
      const matches = options.filter(option => option.label === value || option.text === value);
      if (matches.length !== 1) throw new Error(matches.length ? `Select option label ${JSON.stringify(value)} is ambiguous` : `Select option ${JSON.stringify(value)} was not found`);
      option = matches[0];
    }
    if (option.disabled || option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled) throw new Error(`Select option ${JSON.stringify(value)} is disabled`);
    const setter = Object.getOwnPropertyDescriptor(HTMLOptionElement.prototype, 'selected')?.set;
    if (!setter) throw new Error('Select native option setter is unavailable');
    const differs = !option.selected;
    element.focus();
    if (!element.isConnected || ![...element.options].includes(option)) throw new Error(`Select rejected option ${JSON.stringify(value)}`);
    setter.call(option, true);
    if (differs) changed();
    if (!element.isConnected || element.selectedOptions[0] !== option) throw new Error('Select did not retain the requested option');
    return 'done';
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const name = element instanceof HTMLTextAreaElement ? 'Text area' : 'Input';
    if (element instanceof HTMLInputElement && element.type === 'file') throw new Error('File inputs cannot be set programmatically');
    ensureWritable(name, true); element.focus();
    let requested = value;
    if (element instanceof HTMLInputElement && element.type === 'color') {
      if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Color value must use #rrggbb');
      requested = value.toLowerCase();
    }
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) throw new Error(`${name} native value setter is unavailable`);
    const previous = element.value;
    setter.call(element, requested);
    if (element.value !== requested) { setter.call(element, previous); throw new Error(`${name} rejected value ${JSON.stringify(value)}`); }
    if (previous !== requested) changed();
    return 'done';
  }
  if (role === 'tab') {
    if (!['1', 'true'].includes(value)) throw new Error('Tab value must be 1 or true');
    ensureWritable('Tab');
    return element.getAttribute('aria-selected') === 'true' ? 'done' : 'needs-click';
  }
  if (['checkbox', 'radio', 'switch', 'combobox', 'listbox', 'slider', 'spinbutton'].includes(role) || element.hasAttribute('aria-pressed')) throw new Error('Custom ARIA controls do not expose a standard value setter');
  if (element instanceof HTMLElement && element.isContentEditable) {
    ensureWritable('Editable element'); element.focus();
    const previous = element.textContent ?? '';
    element.textContent = value;
    if (previous !== value) {
      element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: value, inputType: 'insertText' }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return 'done';
  }
  throw new Error('Accessibility element does not expose a standard value setter');
}

export class BrowserActions {
  constructor({ id = 'browser', onTabClosed, onBrowserLost, onPointer, wantsPointer, onVisit, capabilities = {}, clipboardPages, filePolicy } = {}) {
    this.id = id; this.connections = new Map(); this.owners = new Map(); this.records = new Map(); this.nextElementId = 0;
    this.onTabClosed = onTabClosed; this.onBrowserLost = onBrowserLost; this.onPointer = onPointer; this.wantsPointer = wantsPointer;
    this.onVisit=onVisit;
    this.capabilityProviders = capabilities;
    this.filePolicy = filePolicy;
    this.clipboardScopes = new Map();
    this.clipboardPages = clipboardPages ?? new Set();
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
    this.clipboardPages.add(page);
    page.once('close', () => this.clipboardPages.delete(page));
    const record = { id, page, cdp, generation: 0, elements: new Map(), ids: new Map(), previous: new Map(), logs: [], downloads: new Map(), frames: new Map(), heldButtons: new Set(), heldKeys: new Set(), buttonReleases: new Map(), keyReleases: new Map(), pointer: { x: 0, y: 0 } };
    Object.defineProperties(record, {
      sessionId: { value: connection.sessionId, enumerable: true },
      browserId: { value: this.id, enumerable: true },
      assertFileAccess: { value: () => {
        this.checkConnection(connection);
        if (!connection.sessionId || connection.pages.get(id) !== record || page.isClosed() || !connection.browser.isConnected()
          || this.owners.get(id)?.sessionId !== connection.sessionId) throw Object.assign(new Error('The upload tab execution or owner changed'), { code: 'STALE_FILE_UPLOAD' });
        return true;
      } },
    });
    record.transport = connection.transport;
    record.capabilityAdapter = connection.capabilityAdapter;
    record.tabCapabilities = createTabCapabilities(record, this.capabilityProviders, { browserId: this.id, resolveSelector: (marker, signal) => this.locator(record, marker.chain, { signal }) });
    record.coordinateId = randomUUID();
    record.frameGenerations = new WeakMap();
    record.frameBindingEpoch = 0;
    record.frameBindingIds = new Map();
    record.frameBindingSessions = new Map();
    record.frameBindingCleanup = new Set();
    this.observeFrameSession(record, cdp);
    observeNetwork(record);
    cdp.on('Page.downloadWillBegin',event=>{
      if(this.capabilityProviders.downloadMedia?.nativeDownloadIdentity===true)return;
      const owner=this.owners.get(id)?.sessionId??this.downloadSessions.get(id);if(!owner||this.downloadHistory.has(event.guid))return;
      this.downloadHistory.set(event.guid,{id:event.guid,sessionId:owner,tabId:id,browserId:this.id,filename:event.suggestedFilename,url:event.url,startedAt:Date.now(),state:'inProgress',receivedBytes:0,totalBytes:0});
    });
    cdp.on('Page.downloadProgress',event=>{
      if(this.capabilityProviders.downloadMedia?.nativeDownloadIdentity===true)return;
      const entry=this.downloadHistory.get(event.guid);if(!entry||!['inProgress','unobserved'].includes(entry.state))return;
      Object.assign(entry,{state:event.state,receivedBytes:event.receivedBytes,totalBytes:event.totalBytes});
      // Managed profiles also retain downloads completed by the human in a
      // live preview after the model controller has stopped. External browser
      // connections keep their existing path-availability boundary.
      void this.rememberManagedDownload?.(entry);
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
      const main = frame === page.mainFrame();
      this.invalidateFrameBindings(record, frame);
      if (main) { record.previous.clear(); visit(); }
    });
    page.on('framedetached', frame => { record.generation++; this.invalidateFrameBindings(record, frame); });
    page.on('domcontentloaded',visit);page.on('load',visit);
    page.on('close', () => {
      this.invalidateFrameBindings(record);
      void record.tabCapabilities.dispose().catch(() => {});
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
          void this.filePolicy?.releaseTab(record).catch(error => { this.fileCleanupError = error; });
          const known = this.records.delete(id); this.owners.delete(id);this.downloadSessions.delete(id);this.emulations.delete(id);this.viewportOwners.delete(id);
          if (known) this.onTabClosed?.(id);
        }
      }, 0);
    });
    observeConsole(record);
    page.on('dialog', dialog => { record.dialog = dialog; record.wake?.({ dialog: { type: dialog.type(), message: dialog.message(), defaultValue: dialog.defaultValue() } }); });
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
  async releaseHeldKeys(record, chord) {
    const errors = [];
    for (const key of chord.slice().reverse()) if (record.heldKeys.has(key)) {
      try { await this.releaseKey(record, key); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Browser key release failed: ' + errors.map(error => error.message).join('; '));
  }
  queueInputRelease(record) {
    return [...(record.heldTextKey?[this.releaseTextKey(record)]:[]), ...(record.heldTouch?[this.releaseTouch(record,true)]:[]), ...[...record.heldButtons].map(button => this.releaseButton(record, button)), ...[...record.heldKeys].map(key => this.releaseKey(record, key))];
  }
  async releaseTextKey(record) {
    const held = record.heldTextKey;
    if (!held) return;
    if (!held.release) {
      const pending = held.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...held.params }).then(() => { if (record.heldTextKey === held) record.heldTextKey = null; }).finally(() => { if (held.release === pending) held.release = null; });
      held.release = pending; void pending.catch(() => {});
    }
    return held.release;
  }
  async typeAccessibilityText(record, value, cdp = record.cdp, signal) {
    if (typeof value !== 'string') throw new TypeError('AX typeText requires text');
    for (const character of value) if (character < ' ' && !['\t', '\n', '\r'].includes(character)) throw new Error('AX typeText does not support control characters other than tab and newline');
    let first = true;
    for (const character of value.replaceAll(/\r\n?/g, '\n')) {
      signal?.throwIfAborted();
      const command = character === '\n' || character === '\t', held = first || command;
      first = false;
      const params = { key: command ? 'Unidentified' : character, windowsVirtualKeyCode: 0 };
      try {
        if (held) {
          record.heldTextKey = { cdp, params };
          await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params, ...(command ? { commands: [character === '\n' ? 'insertParagraph' : 'insertTab'] } : {}) });
          signal?.throwIfAborted();
        }
        if (!command) await cdp.send('Input.dispatchKeyEvent', { type: 'char', key: character, text: character, unmodifiedText: character });
        signal?.throwIfAborted();
      } finally { if (held) await this.releaseTextKey(record); }
    }
    signal?.throwIfAborted();
  }
  async pressBrowserKey(record, value, options = {}, signal) {
    if (typeof value !== 'string' || !value) throw new Error('keypress requires at least one key');
    const duration = inputDuration(options), chord = browserKey(value).split('+');
    if (!duration) { await record.page.keyboard.press(chord.join('+')); return; }
    try {
      for (const key of chord) { signal?.throwIfAborted(); record.heldKeys.add(key); await record.page.keyboard.down(key); }
      await delay(duration, undefined, { signal });
    } finally { await this.releaseHeldKeys(record, chord); }
  }
  async clickBrowserTarget(record, handle, target, options = {}, signal, screenshotFrame) {
    options ??= {};
    if (options.key !== undefined && browserClipboardShortcutAction(options.key) !== null) throw new Error('Clipboard shortcuts cannot be held during a click. Use pressKey instead.');
    const duration = inputDuration(options), button = ({ l: 'left', r: 'right', m: 'middle' })[options.mouseButton] ?? options.mouseButton ?? 'left';
    const count = options.clickCount ?? 1, chord = options.key === undefined ? [] : browserKey(options.key).split('+');
    if (!['left', 'right', 'middle'].includes(button)) throw new Error('mouseButton must be left, right or middle');
    if (!Number.isInteger(count) || count <= 0) throw new Error('clickCount must be a positive integer');
    if (!duration && !chord.length) {
      if (this.emulationSettings(record.id)?.hasTouch && button === 'left' && count === 1) {
        if (handle) await this.tapLocator(record, handle, {}, signal);
        else { const [position] = await this.screenshotPoints(record, [target], screenshotFrame); await this.tap(record, position, signal); }
      } else if (handle) await handle.click({ button, clickCount: count });
      else { const [position] = await this.screenshotPoints(record, [target], screenshotFrame); signal?.throwIfAborted(); await record.page.mouse.click(position.x, position.y, { button, clickCount: count }); }
      return;
    }
    let position;
    if (handle) {
      await handle.click({ button, trial: true });
      const box = await handle.boundingBox();
      if (!box) throw new Error('Click target has no visible bounds');
      position = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    } else [position] = await this.screenshotPoints(record, [target], screenshotFrame);
    try {
      for (const key of chord) { signal?.throwIfAborted(); record.heldKeys.add(key); await record.page.keyboard.down(key); }
      await record.page.mouse.move(position.x, position.y); record.pointer = position;
      for (let clickCount = 1; clickCount <= count; clickCount++) {
        signal?.throwIfAborted();
        record.clickCounts ??= {}; record.clickCounts[button] = clickCount;
        record.heldButtons.add(button);
        try { await record.page.mouse.down({ button, clickCount }); if (duration) await delay(duration, undefined, { signal }); signal?.throwIfAborted(); }
        finally { if (record.heldButtons.has(button)) await this.releaseButton(record, button); }
      }
    } finally { await this.releaseHeldKeys(record, chord); }
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
  queueFrameSessionDetach(record, cdp) {
    if (cdp === record.cdp) return;
    record.frameBindingSessions?.get(cdp)?.();
    record.frameBindingSessions?.delete(cdp);
    const pending = cdp.detach().catch(() => {}).finally(() => record.frameBindingCleanup.delete(pending));
    record.frameBindingCleanup.add(pending);
    return pending;
  }
  invalidateFrameBindings(record, changed, session) {
    record.frameBindingEpoch = (record.frameBindingEpoch ?? 0) + 1;
    const seeds = session ? [...record.frames].filter(([, cdp]) => cdp === session).map(([frame]) => frame) : changed ? [changed] : [];
    const all = !changed && !session || changed === record.page.mainFrame() || session === record.cdp;
    const affected = frame => {
      if (all || frame.isDetached()) return true;
      for (let ancestor = frame; ancestor; ancestor = ancestor.parentFrame()) if (seeds.includes(ancestor)) return true;
      return false;
    };
    const frames = new Set([...seeds, ...record.frames.keys(), ...record.frameBindingIds.keys(), ...record.page.frames(), ...[...record.elements.values()].map(ref => ref.frame)]);
    const sessions = new Set();
    for (const frame of frames) if (affected(frame)) {
      const cdp = record.frames.get(frame);
      if (cdp) sessions.add(cdp);
      record.frames.delete(frame); record.frameBindingIds.delete(frame);
      record.frameGenerations.set(frame, (record.frameGenerations.get(frame) ?? 0) + 1);
    }
    for (const [id, ref] of record.elements) if (affected(ref.frame)) record.elements.delete(id);
    for (const cdp of sessions) if (cdp !== record.cdp && ![...record.frames.values()].includes(cdp)) this.queueFrameSessionDetach(record, cdp);
  }
  observeFrameSession(record, cdp) {
    if (record.frameBindingSessions.has(cdp)) return;
    const detached = event => {
      const frame = [...record.frameBindingIds].find(([, id]) => id === event.frameId)?.[0];
      record.generation++;
      // A swap can happen before discovery has assigned a frame ID. A full
      // invalidation prevents that in-flight discovery from caching old CDP.
      this.invalidateFrameBindings(record, frame);
    };
    const disconnected = () => {
      record.generation++;
      cleanup(); record.frameBindingSessions.delete(cdp);
      this.invalidateFrameBindings(record, undefined, cdp);
    };
    const cleanup = () => { cdp.removeListener('Page.frameDetached', detached); cdp.removeListener('close', disconnected); };
    cdp.on('Page.frameDetached', detached); cdp.on('close', disconnected);
    record.frameBindingSessions.set(cdp, cleanup);
  }
  async frameBindings(record) {
    const epoch = record.frameBindingEpoch ?? 0;
    const current = frame => { if (epoch !== (record.frameBindingEpoch ?? 0) || frame?.isDetached()) throw stale(); };
    const remember = async (frame, cdp, owned = false) => {
      try { current(frame); }
      catch (error) { if (owned) await this.queueFrameSessionDetach(record, cdp); throw error; }
      record.frames.set(frame, cdp);
      if (owned) {
        this.observeFrameSession(record, cdp);
        try { await cdp.send('Page.enable'); current(frame); }
        catch (error) {
          if (record.frames.get(frame) === cdp) record.frames.delete(frame);
          await this.queueFrameSessionDetach(record, cdp);
          throw error;
        }
      }
    };
    const bindings = [], visited = new Set(), { frameTree } = await record.cdp.send('Page.getFrameTree');
    current();
    const visit = async (tree, frame, cdp) => {
      current(frame);
      if (visited.has(frame)) return;
      visited.add(frame);
      record.frameBindingIds.set(frame, tree.frame.id);
      bindings.push({ frame, cdp, frameId: tree.frame.id });
      for (const child of tree.childFrames ?? []) {
        const { backendNodeId } = await cdp.send('DOM.getFrameOwner', { frameId: child.frame.id });
        current(frame);
        const owner = await this.resolveElement(cdp, frame, backendNodeId);
        let inner;
        try { inner = await owner.contentFrame(); current(frame); } finally { await owner.dispose(); }
        if (!inner) throw stale();
        let innerCdp = record.frames.get(inner);
        if (!innerCdp) {
          let owned = false;
          try { innerCdp = await record.page.context().newCDPSession(inner); owned = true; }
          catch (error) { if (!error.message.includes('part of the parent frame')) throw error; innerCdp = cdp; }
          await remember(inner, innerCdp, owned);
        }
        current(inner);
        let innerTree = child;
        if (innerCdp !== cdp) {
          // Parent targets can expose only a shallow OOPIF descriptor. Its own
          // session has the complete subtree, including same-process children.
          const subtree = await innerCdp.send('Page.getFrameTree');
          current(inner);
          if (subtree.frameTree.frame.id !== child.frame.id) throw stale();
          innerTree = subtree.frameTree;
        }
        await visit(innerTree, inner, innerCdp);
      }
    };
    await visit(frameTree, record.page.mainFrame(), record.cdp);
    // A native target's frame tree can omit out-of-process children. Read
    // those through their own actual CDP sessions; URL matching is ambiguous
    // when several frames load the same document.
    for (const frame of record.page.frames()) {
      current(frame);
      if (visited.has(frame)) continue;
      let cdp = record.frames.get(frame);
      if (!cdp) {
        try { cdp = await record.page.context().newCDPSession(frame); }
        catch (error) {
          // A same-process child can appear after the earlier frame-tree read.
          // Retry discovery with fresh ownership instead of treating it as OOPIF.
          if (error.message.includes('part of the parent frame')) throw Object.assign(stale(), { cause: error });
          throw error;
        }
        await remember(frame, cdp, true);
      }
      current(frame);
      // A cached shared session still belongs to its ancestor. Its root tree
      // cannot be bound to this child; refresh discovery instead of assigning
      // parent AX nodes and opaque IDs to the wrong frame.
      if (bindings.some(binding => binding.cdp === cdp)) throw stale();
      const { frameTree: childTree } = await cdp.send('Page.getFrameTree');
      current(frame);
      await visit(childTree, frame, cdp);
    }
    current();
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
    const generation = record.generation, elements = new Map(), lines = new Map(), frames = []; let truncated = false, rowCount = 0;
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
      const rows = [], entries = [];
      for (const node of ordered) {
        if (node.ignored) continue;
        const role = text(node.role), name = text(node.name), value = text(node.value);
        if (!name && !value && ['none','generic','InlineTextBox'].includes(role)) continue;
        if (role === 'InlineTextBox') continue;
        if (rowCount >= maxElements) { truncated = true; break; }
        const key = `${record.frameGenerations.get(record.page.mainFrame()) ?? 0}:${frameGeneration}:${frameKey}:${node.backendDOMNodeId ?? node.nodeId}`;
        if (!record.ids.has(key)) record.ids.set(key, ++this.nextElementId);
        const id = record.ids.get(key); let depth = 0, parent = node.parentId;
        while (parent && depth < 25) { const p = byId.get(parent); if (!p) break; if (!p.ignored) depth++; parent = p.parentId; }
        const props = (node.properties ?? []).filter(p => ['checked','selected','expanded','disabled','required','readonly','focused','multiselectable'].includes(p.name)).map(p => `${p.name}=${text(p.value)}`);
        const frameLabel = role === 'RootWebArea' && frame !== record.page.mainFrame() ? ' [iframe ' + JSON.stringify(frame.url()) + ']' : '';
        entries.push({ id, depth, role, name, value, props, frameLabel, node });
        rows.push({ id, node, role, name }); rowCount++;
        if (node.backendDOMNodeId) elements.set(id, { backendNodeId: node.backendDOMNodeId, frame, cdp, frameGeneration, role });
      }
      frames.push({ rows, entries, byId });
    }
    const title = await record.page.title(), url = record.page.url();
    const heading = `Tab ${record.id}: ${JSON.stringify(title)}\nURL: ${url}\n`;
    const footer = truncated ? '\n[Tree truncated at ' + maxElements + ' rows]' : '';
    const format = ({ id, depth, role, name, value, props, frameLabel }, context) =>
      `${'  '.repeat(depth)}${id} ${role}${name ? ' ' + JSON.stringify(name) : ''}${value ? ' value=' + JSON.stringify(value) : ''}${context ? ' [ctx: ' + JSON.stringify(context) + ']' : ''}${props.length ? ' [' + props.join(', ') + ']' : ''}${frameLabel}`;
    const entries = frames.flatMap(frame => frame.entries);
    const baseBytes = Buffer.byteLength(heading + entries.map(entry => format(entry)).join('\n') + footer);
    // Extra context must not push an otherwise complete observation past the
    // runtime's 48 KB text budget. Fair shares also bound each untrusted label.
    const contexts = snapshotFrameContexts(frames, { maxBytes: Math.min(8192, Math.max(0, 48000 - baseBytes - 320)) });
    for (const entry of entries) lines.set(entry.id, format(entry, contexts.get(entry.id)));
    const captured = includeScreenshot ? await this.observeScreenshot(record, {}, signal) : undefined;
    signal?.throwIfAborted();
    if (generation !== record.generation) throw stale();
    let body;
    if (!disableDiffing && record.previous.size) {
      const removed = [...record.previous.keys()].filter(id => !lines.has(id));
      body = [...(removed.length ? ['Removed: ' + removed.join(', ')] : []), ...[...lines].filter(([id,line]) => record.previous.get(id) !== line).map(([id,line]) => (record.previous.has(id) ? '~ ' : '+ ') + line)].join('\n') || 'No accessibility changes.';
    } else body = [...lines.values()].join('\n');
    // A replacement diff can be larger than its complete tree (removed IDs and
    // per-row prefixes). Emit the complete current tree when that fits better,
    // retaining stable contexts and all actions rather than clipping the diff.
    if (Buffer.byteLength(heading + body + footer) > 48000) {
      const full = [...lines.values()].join('\n');
      if (Buffer.byteLength(heading + full + footer) <= 48000 - 80) body = '[Full accessibility tree; change list exceeded the output budget.]\n' + full;
    }
    record.elements = elements; record.previous = lines;
    if (record.ids.size > 10000) record.ids = new Map([...record.ids].filter(([,id]) => lines.has(id)));
    return { state: heading + body + footer, generation, ...captured };
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
  async visibleLocator(locator) {
    if (await locator.count() <= 1) return locator;
    const visible = locator.filter({ visible: true });
    return await visible.count() === 1 ? visible : locator;
  }
  async prepareInput(handle, { editable = false, remaining = () => 3000, signal } = {}) {
    for (const state of ['visible', 'enabled', ...(editable ? ['editable'] : [])]) {
      signal?.throwIfAborted();
      await handle.waitForElementState(state, { timeout: remaining() });
    }
    await handle.scrollIntoViewIfNeeded({ timeout: remaining() });
    await handle.focus();
    if (!await handle.evaluate(element => element.getRootNode().activeElement === element)) throw new Error('Element is not focused');
    signal?.throwIfAborted();
  }
  async clipboardInputToken(handle) {
    const token = randomUUID();
    await handle.evaluate((element, token) => {
      let active = element.ownerDocument.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      if (active !== element) throw new Error('Element is not focused');
      Object.defineProperty(element, '__opencuClipboardInputTargetToken', { configurable: true, writable: true, value: token });
    }, token);
    return token;
  }
  async ensureClipboardFrameFocus(page, frame, signal) {
    const main = page.mainFrame();
    for (let current = frame; current !== main;) {
      signal?.throwIfAborted();
      if (!current || current.isDetached()) throw stale();
      const parent = current.parentFrame();
      if (!parent || parent.isDetached()) throw stale();
      const owner = await current.frameElement();
      try {
        const focused = await owner.evaluate(element => {
          let active = element.ownerDocument.activeElement;
          while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
          return element.isConnected && active === element;
        });
        if (!focused) throw new Error('Clipboard target frame is no longer focused');
        if (current.isDetached() || current.parentFrame() !== parent) throw stale();
      } finally { await owner.dispose(); }
      current = parent;
    }
    signal?.throwIfAborted();
    if (main.isDetached() || page.isClosed()) throw stale();
  }
  clipboardScope(sessionId) {
    if (!this.clipboardScopes.has(sessionId)) this.clipboardScopes.set(sessionId, {});
    return this.clipboardScopes.get(sessionId);
  }
  async releaseClipboardSession(sessionId, { dispose = false } = {}) {
    const scope = this.clipboardScopes.get(sessionId);
    if (!scope) return;
    await cleanupBrowserClipboard(scope, { dispose, pages: [...this.clipboardPages] });
    if (dispose && this.clipboardScopes.get(sessionId) === scope) this.clipboardScopes.delete(sessionId);
  }
  async disposeClipboardSession(sessionId) { return this.releaseClipboardSession(sessionId, { dispose: true }); }
  pageAssetAuthorization(record, sessionId, signal) {
    const generation = record.generation, pageUrl = record.page.url();
    const provider = this.capabilityProviders.pageAssets ?? this.capabilityProviders.downloadMedia;
    const isActive = () => !this.closing && !record.page.isClosed() && record.generation === generation && record.page.url() === pageUrl;
    const authorize = async source => {
      signal?.throwIfAborted();
      if (!isActive()) throw stale();
      // DSH authorizes the containing tool call. An installed file policy may
      // narrow that grant; no Codex per-origin approval is implied here.
      if (provider) {
        if (typeof provider.ensureDownloadSourcePolicyAllowed !== 'function') throw new Error('The configured page asset policy cannot authorize downloads');
        const result = await provider.ensureDownloadSourcePolicyAllowed({ record, sessionId, source, pageUrl, signal, isActive });
        if (result === false || result?.allowed === false) throw Object.assign(new Error('The configured file policy denied this page asset export'), { code: 'FILE_POLICY_DENIED' });
      }
      signal?.throwIfAborted();
      if (!isActive()) throw stale();
    };
    return { ensureDownloadAllowed: authorize, ensureAssetAllowed: authorize, ensureFallbackFetchAllowed: authorize };
  }
  async focusedFrame(page) {
    let frame = page.mainFrame();
    for (;;) {
      const handle = await frame.evaluateHandle(() => {
        let element = document.activeElement;
        while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
        return element;
      });
      try {
        const child = await handle.asElement()?.contentFrame();
        if (!child) return frame;
        frame = child;
      } finally { await handle.dispose(); }
    }
  }
  async locator(record, chain = [], { resolveFrames = false, remaining = () => 3000, signal, scope } = {}) {
    let locator = record.page;
    const nestedLocator = async value => {
      const nested = value?.$locator;
      if (!nested || nested.id !== record.id || nested.browserId !== undefined && nested.browserId !== this.id || !Array.isArray(nested.chain)) throw new Error('Nested locators must belong to the same browser tab.');
      return this.locator(record, nested.chain, { resolveFrames, remaining, signal, scope: { frame: record.page.mainFrame() } });
    };
    for (let step = 0; step < chain.length; step++) {
      signal?.throwIfAborted();
      const { method, args = [] } = chain[step];
      if (!supportedLocator.has(method)) throw new Error(`Unsupported locator method: ${method}`);
      const parameters = args.slice(), index = method === 'filter' ? 0 : method === 'locator' ? 1 : -1;
      if (index >= 0 && parameters[index]) {
        const options = { ...parameters[index] };
        for (const key of ['has', 'hasNot']) if (options[key] !== undefined) {
          options[key] = await nestedLocator(options[key]);
        }
        if (options.visible !== undefined && typeof options.visible !== 'boolean') throw new Error('locator.filter visible must be a boolean');
        parameters[index] = options;
      }
      if (method === 'and' || method === 'or') parameters[0] = await nestedLocator(parameters[0]);
      if (method === 'frameLocator' && resolveFrames) {
        let frame = locator.locator(parameters[0]);
        while (['nth', 'first', 'last'].includes(chain[step + 1]?.method)) {
          const next = chain[++step];
          frame = frame[next.method](...(next.args ?? []));
        }
        // Resolve every iframe boundary by identity and visibility. Matching
        // frames can share a URL; Playwright carries their actual frame route.
        if (!await frame.count()) await frame.first().waitFor({ state: 'attached', timeout: remaining() });
        frame = await this.visibleLocator(frame);
        await frame.waitFor({ state: 'visible', timeout: remaining() });
        await frame.scrollIntoViewIfNeeded({ timeout: remaining() });
        const handle = await frame.elementHandle({ timeout: remaining() });
        try {
          const inner = handle && await handle.contentFrame();
          if (!inner) throw new Error('Frame is not connected');
          locator = inner;
          if (scope) scope.frame = inner;
        } finally { await handle?.dispose(); }
      } else if (method === 'locator' && parameters[1]) locator = locator.locator(parameters[0]).filter(parameters[1]);
      else locator = locator[method](...parameters);
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
      return captureFullPage(record, current, signal);
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
      await applyMetrics(this,record,size,undefined,{mode});
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
          if(emulation&&('deviceScaleFactor' in emulation.settings||'isMobile' in emulation.settings))await applyMetrics(this,record,record.viewportNativeSize??emulation.nativeSize,undefined,{mode:null});
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
    return points.map(p => {
      const result=screenshotPointToViewport(p,frame);
      if(result.x<0||result.y<0||result.x>=current.width||result.y>=current.height)throw new Error('This screenshot point is outside the visible viewport. Scroll to that area and take a fresh screenshot before clicking.');
      return result;
    });
  }
  async invoke(sessionId, id, method, args = [], signal, screenshotFrame, operationContext) {
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
      if (method === 'playwright.domSnapshot' || method === 'domSnapshot') return await browserDomSnapshot(record, signal, { isIabBackend: this.id === 'browser' || this.info?.type === 'iab' });
      if (method === 'getScreenshot'||method==='screenshot') return await this.observeScreenshot(record, args[0], signal);
      if (method === 'getAXStateAndScreenshot') return await this.snapshot(record, args[0], signal, true);
      if (method === 'pageAssets.list') return await listPageAssets(record, signal);
      if (method === 'network.list') return listNetwork(record, args[0]);
      if (method === 'network.request') return await networkRequest(record, args[0], signal);
      if (method === 'network.responseBody') return await networkResponseBody(record, args[0], signal);
      if (method === 'waitForEvent') return await waitForBrowserEvent(record, args[0], args[1], signal, this.capabilityProviders.downloadMedia, operationContext?.onReady);
      if (method === 'download.path') return downloadPath(record, args[0]);
      if (method === 'cua.downloadMedia') return await downloadMediaAtPoint(record, args[0], signal, this.capabilityProviders.downloadMedia);
      if (method === 'dom_cua.downloadMedia') return await downloadMediaForDomNode(record, args[0], signal, this.capabilityProviders.downloadMedia);
      if (method === 'fileChooser.setFiles') { await setFileChooserFiles(record, args[0], args[1], args[2], signal, this.capabilityProviders.downloadMedia); return null; }
      if (method === 'pageAssets.bundle') return await bundlePageAssets(record, args[0], signal, this.pageAssetAuthorization(record, sessionId, signal));
      if (method === 'content.export') return await exportPageContent(record, signal, () => this.frameBindings(record));
      if (method === 'content.exportGsuite' || method === 'exportGsuite') return await exportGsuiteContent(record, args[0], signal);
      if (method === 'content.exportYouTubeTranscript' || method === 'exportYouTubeTranscript') return await exportYouTubeTranscript(record, signal);
      if (method === 'capabilities.list') return [{ id: 'pageAssets', description: 'Inventory and export assets already loaded by the current page.' }, ...(await webMcpAvailable(record, signal) ? [{ id: 'webmcp', description: 'Discover and invoke page-defined tools using the browser WebMCP protocol.' }] : []), ...await record.tabCapabilities.list()];
      if (['cdp.send', 'cdp.readEvents', 'browserAuth.request', 'botDetection.report'].includes(method)) return await record.tabCapabilities.dispatch(method, args, signal);
      if (method === 'webmcp.fetchTools') return await fetchWebMcpTools(record, signal);
      if (method === 'webmcp.call') return await callWebMcpTool(record, args[0], args[1], args[2], signal, args[3]);
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
      if (method === 'downloads.list' && typeof this.capabilityProviders.downloadMedia?.listDownloads === 'function')
        return await this.capabilityProviders.downloadMedia.listDownloads({ record, signal });
      if (method === 'downloads.save' && typeof this.capabilityProviders.downloadMedia?.saveDownload === 'function')
        return await this.capabilityProviders.downloadMedia.saveDownload({ record, id: args[0], path: args[1], signal });
      if (method === 'downloads.list') return [...record.downloads].map(([id,d]) => ({ id, filename: d.suggestedFilename(), url: d.url() }));
      if (method === 'downloads.save') {
        const d = record.downloads.get(args[0]); if (!d) throw new Error('Unknown download');
        const failure = await d.failure(); signal?.throwIfAborted();
        if (failure) throw new Error(failure);
        await d.saveAs(args[1]);
        signal?.throwIfAborted();
        return { path: args[1], filename: d.suggestedFilename() };
      }
      if (method === 'filechooser.setFiles') {
        // The intercepted chooser event can arrive just after click resolves.
        // Wait for that in-flight event rather than requiring another model call.
        if (!record.filechooser) {
          try { record.filechooser = await page.waitForEvent('filechooser', { timeout: 1000 }); }
          catch (error) { signal?.throwIfAborted(); if (error.name === 'TimeoutError') throw new Error('No file chooser is open'); throw error; }
        }
        signal?.throwIfAborted();
        if (!record.filechooser) throw new Error('No file chooser is open');
        const chooser = record.filechooser;
        await setLocatorInputFiles(record, chooser.element(), args[0], {}, signal, this.capabilityProviders.downloadMedia);
        if (record.filechooser === chooser) record.filechooser = null;
        return null;
      }
      if (method === 'logs' || method === 'dev.logs') return await listConsole(record, args[0]);
      if (method === 'clipboard.readText') return await browserClipboardReadText(page, this.clipboardScope(sessionId), signal);
      if (method === 'clipboard.writeText') { await browserClipboardWriteText(page, args[0], this.clipboardScope(sessionId), signal); return null; }
      if (method === 'clipboard.read') return await browserClipboardRead(page, this.clipboardScope(sessionId), signal);
      if (method === 'clipboard.write') { await browserClipboardWrite(page, args[0], this.clipboardScope(sessionId), signal); return null; }
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
        if (method === 'pressKey') {
          const hasTarget = args.length > 1 && (args[0] === null || typeof args[0] === 'number');
          const handle = hasTarget && args[0] !== null ? await this.element(record, args[0]) : null;
          const options = (hasTarget ? args[2] : args[1]) ?? {};
          const key = hasTarget ? args[1] : args[0];
          try {
            const durationMs = inputDuration(options);
            if (handle) await this.prepareInput(handle, { signal });
            if (browserClipboardShortcutAction(key) !== null) {
              const frame = handle ? await handle.ownerFrame() : await this.focusedFrame(page);
              if (!frame || frame.isDetached()) throw stale();
              const inputTargetToken = handle ? await this.clipboardInputToken(handle) : undefined;
              const ensureFocus = () => this.ensureClipboardFrameFocus(page, frame, signal);
              if (await browserClipboardShortcut(frame, key, this.clipboardScope(sessionId), signal, { durationMs, inputTargetToken, ensureFocus })) return null;
            }
            await this.pressBrowserKey(record, key, options, signal); return null;
          }
          finally { await handle?.dispose(); }
        }
        if (method === 'typeText') {
          const hasTarget = args.length > 1 && (args[0] === null || typeof args[0] === 'number');
          const handle = hasTarget && args[0] !== null ? await this.element(record, args[0]) : null;
          const ref = hasTarget && args[0] !== null ? record.elements.get(args[0]) : null;
          try { if (handle) await this.prepareInput(handle, { editable: true, signal }); await this.typeAccessibilityText(record, hasTarget ? args[1] : args[0], ref?.cdp ?? record.cdp, signal); return null; }
          finally { await handle?.dispose(); }
        }
        if (method === 'paste') {
          const hasTarget = args.length > 1 && (args[0] === null || typeof args[0] === 'number');
          const value = hasTarget ? args[1] : args[0], options = (hasTarget ? args[2] : args[1]) ?? {};
          const handle = hasTarget && args[0] !== null ? await this.element(record, args[0]) : null;
          try {
            if (handle) await this.prepareInput(handle, { editable: true, signal });
            const frame = handle ? await handle.ownerFrame() : await this.focusedFrame(page);
            if (!frame || frame.isDetached()) throw stale();
            const inputTargetToken = handle ? await this.clipboardInputToken(handle) : undefined;
            const ensureFocus = () => this.ensureClipboardFrameFocus(page, frame, signal);
            await browserClipboardPaste(frame, value, { ...options, inputTargetToken, ensureFocus }, this.clipboardScope(sessionId), signal);
            return null;
          } finally { await handle?.dispose(); }
        }
        if (method === 'locator') {
          const [chain, action, actionArgs = []] = args;
          if (![...readMethods, 'evaluate','evaluateAll','click','dblclick','fill','press','type','pressSequentially','check','uncheck','setChecked','selectOption','setInputFiles','hover','scrollIntoViewIfNeeded','focus','blur','downloadMedia'].includes(action)) throw new Error(`Unsupported locator action: ${action}`);
          const { parameters, timeout } = locatorArguments(action, actionArgs), deadline = timeout > 0 ? Date.now() + timeout : null;
          const remaining = () => {
            if (deadline === null) return 0;
            const duration = deadline - Date.now();
            if (duration <= 0) throw new Error(`Timed out after ${timeout}ms while resolving locator`);
            return duration;
          };
          const scope = { frame: page.mainFrame() };
          let locator = await this.locator(record, chain, { resolveFrames: true, remaining, signal, scope });
          if (firstMatchMethods.has(action)) {
            if (action !== 'waitFor' && !await locator.count()) return false;
            locator = locator.first();
          } else if (!collectionMethods.has(action)) locator = await this.visibleLocator(locator);
          if (!noOptionMethods.has(action)) {
            const index = ['evaluate', 'evaluateAll'].includes(action) ? 2 : valueOptionMethods.has(action) ? 1 : 0;
            parameters[index].timeout = remaining();
          }
          if (action === 'selectOption') parameters[0] = selectOptions(parameters[0]);
          if (action === 'setChecked' && typeof parameters[0] !== 'boolean') throw new Error('locator.setChecked requires a boolean');
          if (action === 'downloadMedia') {
            const element = await locator.elementHandle({ timeout: remaining() });
            if (!element) throw new Error('No element matched selector');
            try {
              const frame = await element.ownerFrame(), binding = (await this.frameBindings(record)).find(binding => binding.frame === frame);
              if (!binding) throw new Error('Could not determine the media frame');
              return await downloadLocatorMedia(record, element, { frameId: binding.frameId, timeoutMs: remaining() || 120000 }, signal, this.capabilityProviders.downloadMedia);
            } finally { await element.dispose(); }
          }
          if (['type', 'press', 'pressSequentially'].includes(action)) {
            if (typeof parameters[0] !== 'string' || action === 'press' && !parameters[0]) throw new Error(`locator.${action} requires a string value`);
            const handle = await locator.elementHandle({ timeout: remaining() });
            if (!handle) throw new Error('No element matched selector');
            try {
              await this.prepareInput(handle, { editable: action !== 'press', remaining, signal });
              if (action === 'type') await page.keyboard.insertText(parameters[0]);
              else if (action === 'press') {
                let shortcut = false;
                if (browserClipboardShortcutAction(parameters[0]) !== null) {
                  const frame = await handle.ownerFrame();
                  if (!frame || frame.isDetached()) throw stale();
                  const inputTargetToken = await this.clipboardInputToken(handle);
                  const ensureFocus = () => this.ensureClipboardFrameFocus(page, frame, signal);
                  shortcut = await browserClipboardShortcut(frame, parameters[0], this.clipboardScope(sessionId), signal, { inputTargetToken, ensureFocus });
                }
                if (!shortcut) await handle.press(browserKey(parameters[0]), parameters[1]);
              }
              else await handle.type(parameters[0], { ...parameters[1], delay: parameters[1]?.delay ?? 50 });
              return null;
            } finally { await handle.dispose(); }
          }
          if (action === 'setInputFiles') {
            const element = await locator.elementHandle({ timeout: remaining() });
            if (!element) throw new Error('No file input matched the selector');
            try { await setLocatorInputFiles(record, element, parameters[0], { ...parameters[1], timeoutMs: remaining() }, signal, this.capabilityProviders.downloadMedia); }
            finally { await element.dispose(); }
            return null;
          }
          if (['evaluate','evaluateAll'].includes(action)) return await evaluateReadonly(record, actionArgs[0], actionArgs[1], { ...actionArgs[2], timeoutMs: remaining() || 3000 }, { locator, all: action === 'evaluateAll', frame: scope.frame, frameBindings: () => this.frameBindings(record), signal });
          const options=parameters[0]??{};
          if(action==='click'&&this.emulationSettings(id)?.hasTouch&&(!options.button||options.button==='left')&&(!options.clickCount||options.clickCount===1)&&!options.trial&&!options.modifiers?.length){await this.tapLocator(record,locator,options,signal);return null;}
          const result = await locator[action](...parameters); return action === 'selectOption' ? null : result ?? null;
        }
        if (method === 'evaluate') {
          return await evaluateReadonly(record, args[0], args[1], args[2], { signal });
        }
        if (['waitForLoadState', 'waitForURL', 'waitForTimeout'].includes(method)) { await waitForBrowser(record, method, args, signal); return null; }
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
            await this.clickBrowserTarget(record, handle, args[0], args[1], signal, screenshotFrame);
          } else if (method === 'selectText') {
            if (!handle) throw new Error('selectText requires an observed element id');
            await handle.evaluate((element, { text, options }) => {
              const { prefix, suffix } = options;
              const selectionType = ({ text: 'select', cursor_before: 'before', cursor_after: 'after' })[options.selectionType] ?? options.selectionType ?? 'select';
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
            const value = String(args[1]);
            if (await handle.evaluate(setAccessibilityValue, value) === 'needs-click') {
              await handle.click({ timeout: 3000 });
              if (await handle.evaluate(setAccessibilityValue, value) !== 'done') throw new Error('Tab did not become selected');
            }
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
