import { observeAccessibility, elementOperation, locatorOperation, invalidateElements } from './accessibility.js';
import { createPairingClient } from './pairing.js';
import { createCDPFrameRouter } from './frame-router.js';
import { keyEventParameters } from './keyboard.js';
const PATH = '/opencu-extension/v1';
const attached = new Map(), observations = new Map(), documents = new Map(), releasing = new Set();
let connection, connecting = false, reconnectDisabled = false, running = false, controlEpoch = 0, commandChain = Promise.resolve(), downloadChain = Promise.resolve(), status = { connected: false };
const tabEpochs = new Map();
const controlToken = tabId => ({ connection, epoch: controlEpoch, tabId, tabEpoch: tabEpochs.get(tabId) ?? 0 });
function cancelControl(tabId) {
  if (tabId === undefined) controlEpoch++;
  else tabEpochs.set(tabId, (tabEpochs.get(tabId) ?? 0) + 1);
}
function checkControl(token) {
  if (token && (token.connection !== connection || token.epoch !== controlEpoch || token.tabEpoch !== (tabEpochs.get(token.tabId) ?? 0))) fail('CONTROL_STOPPED', 'Input sequence was cancelled.');
}
const fail = (code, message, details = {}) => { const error = new Error(message); Object.assign(error, { code, details }); throw error; };
const errorJSON = error => ({ code: error.code || 'BROWSER_FAILURE', message: error.message, details: error.details || {} });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function allowed(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) && !['chromewebstore.google.com', 'chrome.google.com', 'microsoftedge.microsoft.com'].includes(u.hostname);
  } catch { return false; }
}
function endpoint(port) {
  if (!Number.isInteger(Number(port)) || Number(port) < 1024 || Number(port) > 65535) fail('INVALID_PORT', 'Enter an explicit port from 1024 to 65535.');
  return `http://127.0.0.1:${Number(port)}${PATH}`;
}
async function api(path, value, c = connection) {
  if (!c) fail('DISCONNECTED', 'Connect explicitly in the extension options page.');
  const response = await fetch(c.endpoint + '/' + path, { method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...value, instanceId: c.instanceId, sessionId: c.sessionId, epoch: c.epoch }), signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok) fail(result.error?.code || 'BRIDGE_FAILURE', result.error?.message || `HTTP ${response.status}`);
  return result;
}
async function content(tabId, method, input = {}, expectedDocumentId) {
  const tab = await chrome.tabs.get(tabId);
  if (!allowed(tab.url)) fail('UNSUPPORTED_PAGE', 'Chrome/Edge internal pages, extension pages, browser stores and non-HTTP(S) URLs cannot be controlled.');
  const target = expectedDocumentId ? { tabId, documentIds: [expectedDocumentId] } : { tabId, frameIds: [0] };
  const probe = await chrome.scripting.executeScript({ target, world: 'ISOLATED', injectImmediately: true,
    func: () => Boolean(globalThis.__opencuDocument && globalThis.__opencuCursor) });
  if (probe.length !== 1 || probe[0].frameId !== 0) fail('STALE_DOCUMENT', 'Main document changed during initialization.');
  const currentTarget = { tabId, documentIds: [probe[0].documentId] };
  if (!probe[0].result) await chrome.scripting.executeScript({ target: currentTarget, files: ['page-cursor.js', 'content.js'], world: 'ISOLATED', injectImmediately: true });
  const result = await chrome.scripting.executeScript({ target: currentTarget,
    world: 'ISOLATED', injectImmediately: true, func: async (method, input) => {
      try { return { ok: true, result: await globalThis.__opencuDocument.run(method, input) }; }
      catch (error) { return { ok: false, error: { code: error.code || 'CONTENT_FAILURE', message: error.message } }; }
    }, args: [method, input] });
  if (result.length !== 1 || result[0].frameId !== 0) fail('STALE_DOCUMENT', 'Main document changed during operation.');
  const value = result[0].result;
  if (!value?.ok) fail(value?.error?.code || 'CONTENT_FAILURE', value?.error?.message || 'Content script returned no result.');
  return { ...value.result, browserDocumentId: result[0].documentId };
}
async function tabInfo(tab) {
  let identity;
  if (allowed(tab.url)) {
    if (tab.status !== 'complete') return { tabId: tab.id, documentId: documents.get(tab.id) || `loading-${tab.id}`, url: tab.url,
      title: tab.title, windowId: tab.windowId, active: tab.active, supported: false, error: { code: 'PAGE_LOADING', message: 'Page is loading; discover again after navigation completes.' } };
    try { identity = await content(tab.id, 'identity'); }
    catch (error) { return { tabId: tab.id, documentId: documents.get(tab.id) || `unavailable-${tab.id}`, url: tab.url, title: tab.title,
      windowId: tab.windowId, active: tab.active, supported: false, error: errorJSON(error) }; }
  } else identity = { documentId: documents.get(tab.id) || `restricted-${tab.id}` };
  return { tabId: tab.id, documentId: identity.documentId, browserDocumentId: identity.browserDocumentId, url: tab.url,
    title: tab.title, windowId: tab.windowId, active: tab.active, supported: allowed(tab.url), incognito: tab.incognito,
    ...(allowed(tab.url) ? {} : { error: { code: 'UNSUPPORTED_PAGE', message: 'Browser-internal/store/non-HTTP(S) page is discovery-only.' } }) };
}
async function verify(identity, selected = false) {
  if (!connection || identity.epoch !== connection.epoch || identity.instanceId !== connection.instanceId || identity.browserInstanceId !== connection.browserInstanceId) fail('STALE_CONNECTION', 'Connection identity changed; list tabs and select again.');
  const tab = await chrome.tabs.get(identity.tabId);
  if (!allowed(tab.url)) fail('UNSUPPORTED_PAGE', 'This page cannot be controlled.');
  const current = await content(identity.tabId, 'identity');
  if (current.documentId !== identity.documentId) fail('STALE_DOCUMENT', 'Document changed; list tabs and select again.');
  if (selected && (!attached.has(identity.tabId) || attached.get(identity.tabId).released)) fail('NOT_SELECTED', 'Select this tab before observing or acting.');
  return { verified: true, identity, ...current };
}
const cdp = (tabId, method, params = {}) => {
  if (method.startsWith('Input.') || method === 'DOM.setFileInputFiles') {const state = attached.get(tabId); if (state) state.inputSequence = (state.inputSequence ?? 0) + 1;}
  return chrome.debugger.sendCommand({tabId}, method, params);
};
async function attach(identity) {
  await verify(identity);
  if (attached.get(identity.tabId)?.released) await releaseTab(identity.tabId);
  if (attached.has(identity.tabId)) {
    const state = attached.get(identity.tabId);
    if (state.error) throw state.error;
    return;
  }
  const targets = await chrome.debugger.getTargets();
  if (targets.find(t => t.tabId === identity.tabId)?.attached) fail('TARGET_BUSY', 'Another debugger or Playwright owns this tab. OpenCU will not detach or steal it.');
  try { await chrome.debugger.attach({ tabId: identity.tabId }, '1.3'); }
  catch (error) { fail('DEBUGGER_ATTACH_FAILED', 'Chrome denied debugger access or another client owns this tab: ' + error.message); }
  const state = { keys: new Map(), buttons: new Set(), x: 0, y: 0 };
  attached.set(identity.tabId, state);
  state.frameRouter = createCDPFrameRouter((method, params) => cdp(identity.tabId, method, params), listener => {
    const receive = (source, method, params) => {if (source.tabId === identity.tabId && !source.sessionId) listener(method, params);};
    chrome.debugger.onEvent.addListener(receive); return () => chrome.debugger.onEvent.removeListener(receive);
  });
  try {
    await saveAttached();
    await cdp(identity.tabId, 'Page.enable'); await cdp(identity.tabId, 'Accessibility.enable');
  } catch (error) {
    state.error = error;
    try { await releaseTab(identity.tabId); }
    catch (cleanupError) { error.details = { ...error.details, cleanupError: errorJSON(cleanupError) }; }
    throw error;
  }
}
async function saveAttached() {
  const active = [...attached].filter(([, state]) => !state.released);
  await chrome.storage.session.set({ attachedTabs: active.map(([tabId]) => tabId), heldInputs: active.map(([tabId, state]) => ({ tabId,
    keys: [...state.keys.values()], buttons: [...state.buttons], x: state.x, y: state.y })) });
}
function keySpec(value) {
  const names = { CTRL: 'Control', CONTROL: 'Control', ALT: 'Alt', OPTION: 'Alt', SHIFT: 'Shift', META: 'Meta', CMD: 'Meta', COMMAND: 'Meta',
    ENTER: 'Enter', RETURN: 'Enter', TAB: 'Tab', ESC: 'Escape', ESCAPE: 'Escape', SPACE: ' ', BACKSPACE: 'Backspace', DELETE: 'Delete',
    UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', HOME: 'Home', END: 'End', PAGEUP: 'PageUp', PAGEDOWN: 'PageDown' };
  const key = names[String(value).toUpperCase()] || value;
  const codes = { Control: ['ControlLeft', 17], Alt: ['AltLeft', 18], Shift: ['ShiftLeft', 16], Meta: ['MetaLeft', 91],
    Enter: ['Enter', 13], Tab: ['Tab', 9], Escape: ['Escape', 27], ' ': ['Space', 32], Backspace: ['Backspace', 8], Delete: ['Delete', 46],
    ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40],
    Home: ['Home', 36], End: ['End', 35], PageUp: ['PageUp', 33], PageDown: ['PageDown', 34], '+': ['Equal', 187] };
  let code, vk;
  if (codes[key]) [code, vk] = codes[key];
  else if (/^[a-z]$/i.test(key)) { code = 'Key' + key.toUpperCase(); vk = key.toUpperCase().charCodeAt(0); }
  else if (/^\d$/.test(key)) { code = 'Digit' + key; vk = key.charCodeAt(0); }
  else if (/^F([1-9]|1[0-2])$/.test(key)) { code = key; vk = 111 + Number(key.slice(1)); }
  else fail('UNSUPPORTED_KEY', 'Use named keys, letters, digits or F1–F12; type_text handles other Unicode.');
  return { key, code, windowsVirtualKeyCode: vk };
}
const modifiers = state => [...state.keys.keys()].reduce((n, key) => n | ({ Alt: 1, Control: 2, Meta: 4, Shift: 8 }[key] || 0), 0);
async function keyEvent(tabId, spec, down, epoch, beforeDispatch) {
  checkControl(epoch);
  const state = attached.get(tabId);
  if (down) { state.keys.set(spec.key, spec); await saveAttached(); }
  checkControl(epoch);
  const event = keyEventParameters(spec, down, modifiers(state), /Mac/u.test(navigator.platform));
  if (down) await content(tabId, 'expectInput', { events: [{ type: 'keydown', key: event.key }, { type: 'input' }] });
  checkControl(epoch);
  if (down && beforeDispatch) { await beforeDispatch(); checkControl(epoch); }
  await cdp(tabId, 'Input.dispatchKeyEvent', event);
  if (!down) { state.keys.delete(spec.key); await saveAttached(); }
}
const buttonMask = state => [...state.buttons].reduce((n, button) => n | ({ left: 1, right: 2, middle: 4 }[button] || 0), 0);
async function mouse(tabId, type, point, button = 'none', count = 0, extra = {}, epoch, beforeDispatch) {
  checkControl(epoch);
  const state = attached.get(tabId);
  state.x = point.x; state.y = point.y;
  if (type === 'mousePressed') { state.buttons.add(button); await saveAttached(); }
  checkControl(epoch);
  let marker, submitted = false, failure;
  try {
    if (type === 'mousePressed' || type === 'mouseWheel') marker = await content(tabId, 'expectInput', { pending: type === 'mouseWheel',
      events: [{ type: type === 'mousePressed' ? 'pointerdown' : 'wheel', ...point, ...(type === 'mouseWheel' ? { deltaX: extra.deltaX ?? 0, deltaY: extra.deltaY ?? 0 } : {}) }] });
    checkControl(epoch);
    if (type === 'mousePressed' && beforeDispatch) { await beforeDispatch(); checkControl(epoch); }
    submitted = true;
    await cdp(tabId, 'Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button, buttons: buttonMask(state), clickCount: count, modifiers: modifiers(state), ...extra });
    if (type === 'mouseReleased') { state.buttons.delete(button); await saveAttached(); }
  } catch (error) { failure = error; throw error; }
  finally {
    if (type === 'mouseWheel' && marker) try { await content(tabId, 'finishInput', { markerId: marker.markerId, documentId: marker.documentId, dispatched: submitted }, marker.browserDocumentId); }
    catch (error) {
      if (!failure) { error.details = { ...error.details, inputDispatched: submitted }; throw error; }
      failure.details = { ...failure.details, inputMarkerError: errorJSON(error) };
    }
  }
}
async function releaseTab(tabId) {
  const state = attached.get(tabId); observations.delete(tabId); invalidateElements(tabId);
  if (!state) return { tabId, released: true };
  if (!state.released) {
    state.cursor = null;
    const errors = [];
    for (const button of [...state.buttons]) try { await mouse(tabId, 'mouseReleased', state, button, 1); } catch (error) { errors.push(errorJSON(error)); }
    for (const key of [...state.keys.values()].reverse()) try { await keyEvent(tabId, key, false); } catch (error) { errors.push(errorJSON(error)); }
    try { await content(tabId, 'release'); } catch (error) { if (allowed((await chrome.tabs.get(tabId).catch(() => ({}))).url)) errors.push(errorJSON(error)); }
    if (!errors.length) try { await cdp(tabId, 'Emulation.setFocusEmulationEnabled', { enabled: false }); } catch (error) { errors.push(errorJSON(error)); }
    if (!errors.length) {
      releasing.add(tabId);
      try { await state.frameRouter?.close(); await chrome.debugger.detach({ tabId }); }
      catch (error) { if ((await chrome.debugger.getTargets()).some(t => t.tabId === tabId && t.attached)) errors.push(errorJSON(error)); }
      finally { releasing.delete(tabId); }
    }
    if (errors.length) fail('RELEASE_FAILED', 'Input release could not be fully acknowledged; state is retained for retry.', { tabId, errors });
    state.released = true;
  }
  await saveAttached(); attached.delete(tabId); return { tabId, released: true };
}
async function releaseAll() {
  const results = [], errors = [];
  for (const tabId of [...attached.keys()]) try { results.push(await releaseTab(tabId)); } catch (error) { errors.push(errorJSON(error)); }
  if (errors.length) fail('RELEASE_FAILED', 'Some tabs did not release.', { results, errors });
  return { released: true, tabs: results };
}
function pngSize(base64) {
  const bytes = Uint8Array.from(atob(base64.slice(0, 64)), c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  if (view.getUint32(0) !== 0x89504e47) fail('SCREENSHOT_FAILURE', 'Expected a PNG screenshot.');
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
async function observe(identity, options = {}) {
  await attach(identity);
  const current = await verify(identity, true);
  const dom = await content(identity.tabId, 'identity', { documentId: identity.documentId }, current.browserDocumentId);
  const accessibility = await observeAccessibility(identity.tabId, (method, params) => cdp(identity.tabId, method, params), identity.documentId);
  let screenshot;
  if (options.screenshot !== false) {
    if (Math.abs(dom.geometry.visual.scale - 1) > 0.001) fail('UNSUPPORTED_PINCH_ZOOM', 'Reset pinch zoom before screenshot-coordinate actions. Browser page zoom is supported.');
    const image = await cdp(identity.tabId, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
    const after = await content(identity.tabId, 'identity', {}, current.browserDocumentId);
    if (JSON.stringify(after.geometry) !== JSON.stringify(dom.geometry)) fail('OBSERVATION_CHANGED', 'Page geometry changed during screenshot; observe again.');
    screenshot = { id: crypto.randomUUID(), mimeType: 'image/png', encoding: 'base64', data: image.data, ...pngSize(image.data),
      bounds: { x: dom.geometry.visual.x, y: dom.geometry.visual.y, width: dom.geometry.visual.width, height: dom.geometry.visual.height }, geometry: dom.geometry };
    observations.set(identity.tabId, screenshot);
  }
  await verify(identity, true);
  return { identity, ...dom, ...accessibility, ...(screenshot ? { screenshot } : {}) };
}
async function preview(identity) {
  await verify(identity, true);
  const image = await cdp(identity.tabId, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  await verify(identity, true);
  const tab = await chrome.tabs.get(identity.tabId), window = await chrome.windows.get(tab.windowId);
  return { dataUrl: `data:image/png;base64,${image.data}`, ...pngSize(image.data), active: tab.active && window.focused };
}
async function actionPoint(identity, action, current, from = false) {
  if (action.elementId != null) return elementOperation(identity.tabId, (method, params) => cdp(identity.tabId, method, params), 'point', action, attached.get(identity.tabId)?.frameRouter);
  const x = from ? action.fromX : action.x, y = from ? action.fromY : action.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) fail('INVALID_COORDINATES', 'Finite x/y coordinates are required.');
  if (action.coordinateSpace === 'css') {
    if (x < 0 || y < 0 || x >= current.geometry.width || y >= current.geometry.height) fail('INVALID_COORDINATES', 'Point is outside the viewport.');
    return { x, y };
  }
  const screenshot = observations.get(identity.tabId);
  if (!screenshot || action.screenshotId !== screenshot.id) fail('STALE_SCREENSHOT', 'Use the latest screenshotId for image coordinates.');
  if (JSON.stringify(current.geometry) !== JSON.stringify(screenshot.geometry)) fail('STALE_SCREENSHOT', 'Viewport, scroll, zoom or page changed; observe again.');
  const width = action.previewWidth ?? screenshot.width, height = action.previewHeight ?? screenshot.height;
  if (!(width > 0 && height > 0) || x < 0 || y < 0 || x >= width || y >= height) fail('INVALID_COORDINATES', 'Point is outside the displayed screenshot.');
  return { x: screenshot.bounds.x + x * screenshot.bounds.width / width, y: screenshot.bounds.y + y * screenshot.bounds.height / height };
}
async function act(identity, action, epoch = controlToken(identity.tabId)) {
  let inputState, inputStart = 0;
  try {
  checkControl(epoch);
  await attach(identity);
  inputState = attached.get(identity.tabId); inputStart = inputState.inputSequence ?? 0;
  const current = await verify(identity, true), tabId = identity.tabId;
  checkControl(epoch);
  const done = result => { checkControl(epoch); return { ...result, inputMode: 'background', delivery: 'target-cdp', effectVerified: false, identity }; };
  if (!['background', 'foreground'].includes(action.inputMode ?? 'background')) fail('INVALID_ACTION', 'inputMode must be background or foreground');
  if (['click', 'double_click', 'right_click', 'move', 'mouse_down', 'mouse_up', 'scroll', 'drag', 'type_text', 'press_key', 'key_down', 'key_up', 'fill', 'set_value'].includes(action.type)) {
    await cdp(tabId, 'Emulation.setFocusEmulationEnabled', { enabled: true });
    checkControl(epoch);
    await verify(identity, true);
    checkControl(epoch);
  }
  const verifyInputElement = async () => {
    if (action.elementId == null) return;
    await verify(identity, true);
    await elementOperation(tabId, (method, params) => cdp(tabId, method, params), 'verifyElement', action, attached.get(tabId)?.frameRouter);
    checkControl(epoch);
  };
  const send = async (method, params) => {
    checkControl(epoch);
    if (method === 'Input.insertText' || method === 'DOM.setFileInputFiles') {
      await content(tabId, 'expectInput', { events: [{ type: 'input' }] }, current.browserDocumentId);
      checkControl(epoch);
    }
    if (method === 'Input.insertText' && action.elementId != null) await verifyInputElement();
    const result = await cdp(tabId, method, params); checkControl(epoch); return result;
  };
  const inputKey = (spec, down) => keyEvent(tabId, spec, down, epoch, action.elementId != null ? verifyInputElement : undefined);
  const pointer = (type, point, button = 'none', count = 0, extra = {}) => mouse(tabId, type, point, button, count, extra, epoch,
    action.elementId != null ? () => element('checkPoint', {...action,...point}) : undefined);
  const element = (operation, args = action) => elementOperation(tabId, send, operation, args, attached.get(tabId)?.frameRouter);
  const step = async work => { checkControl(epoch); const result = await work(); checkControl(epoch); return result; };
  const invalidate = () => observations.delete(tabId);
  switch (action.type) {
    case 'navigate': {
      if (!allowed(action.url)) fail('UNSUPPORTED_URL', 'Navigation accepts only ordinary HTTP(S) pages.');
      await step(() => releaseTab(tabId));
      const page = await navigateTab(tabId, epoch, () => chrome.tabs.update(tabId, { url: action.url }));
      return done({ navigated: true, reselectRequired: true, tabId, documentId: page.documentId });
    }
    case 'back': case 'forward': {
      const history = await send('Page.getNavigationHistory');
      const entry = history.entries[history.currentIndex + (action.type === 'back' ? -1 : 1)];
      if (!entry) fail('NO_HISTORY_ENTRY', 'No navigation history entry in that direction.');
      if (!allowed(entry.url)) fail('UNSUPPORTED_URL', 'History destination is a restricted page.');
      const page = await navigateTab(tabId, epoch, () => send('Page.navigateToHistoryEntry', { entryId: entry.id }));
      await step(() => releaseTab(tabId));
      return done({ navigated: true, reselectRequired: true, tabId, documentId: page.documentId });
    }
    case 'reload': {
      await step(() => releaseTab(tabId));
      const page = await navigateTab(tabId, epoch, () => chrome.tabs.reload(tabId));
      return done({ reloaded: true, reselectRequired: true, tabId, documentId: page.documentId });
    }
    case 'new_tab': return newTab(action.url, epoch);
    case 'close_tab': await step(() => releaseTab(tabId)); await step(() => chrome.tabs.remove(tabId)); return done({ closed: true, tabId });
    case 'activate':
      await step(() => chrome.tabs.update(tabId, { active: true }));
      const tab = await step(() => chrome.tabs.get(tabId));
      await step(() => chrome.windows.update(tab.windowId, { focused: true }));
      return done({ focused: true });
    case 'domSnapshot': {
      const result = await locatorOperation(tabId, send, {operation:'domSnapshot', locator:action.locator ?? [], args:action.args ?? {}}, identity.documentId, attached.get(tabId)?.frameRouter);
      await step(() => verify(identity, true));
      return done(result);
    }
    case 'locator': {
      const result = await locatorOperation(tabId, send, action, identity.documentId, attached.get(tabId)?.frameRouter);
      await step(() => verify(identity, true));
      if (Object.hasOwn(result, 'value')) return done({value:result.value});
      const args = action.args ?? {}, method = action.method;
      const checking = ['check','uncheck','setChecked'].includes(method);
      const checked = method === 'setChecked' ? args.checked : method === 'check';
      if (!checking || result.checked !== checked) {
        const type = checking ? 'click' : ({dblclick:'double_click',press:'press_key'})[method] ?? method;
        await act(identity, {type,elementId:result.elementId,button:args.button,key:args.key,value:args.value,inputMode:action.inputMode}, epoch);
        if (checking && (await element('checked', {elementId:result.elementId})).checked !== checked) fail('LOCATOR_ACTION_FAILED', 'Click did not produce the requested checked state.');
      }
      return done({value:null});
    }
    case 'hitTest': {
      const point = await actionPoint(identity, action, current);
      return done({ element: await element('hitTest', point) });
    }
    case 'getDOM': return done({ element: await element('getDOM') });
    case 'setText': case 'setStyle': case 'designTweak': {
      const result = await element('patchDOM');
      invalidate();
      return done(result);
    }
    case 'upload': {
      if (!Array.isArray(action.files) || !action.files.length || action.files.some(file => typeof file !== 'string')) fail('INVALID_ARGUMENT', 'upload requires file paths');
      await element('upload');
      invalidate(); return done({ uploaded: true, files: action.files });
    }
    case 'fill': {
      await element('selectAll');
      invalidate();
      await send('Input.insertText', { text: String(action.text ?? action.value ?? '') }); return done({ filled: true });
    }
    case 'selectOption':
      await content(tabId, 'expectInput', {events:[{type:'input'}]}, current.browserDocumentId);
      checkControl(epoch);
      invalidate(); attached.get(tabId).inputSequence = (attached.get(tabId).inputSequence ?? 0) + 1; return done(await element('selectOption'));
    case 'set_value': invalidate(); return done(await element('setValue'));
    case 'type_text': {
      if (typeof action.text !== 'string' || action.text.length > 100000) fail('INVALID_TEXT', 'type_text requires text (maximum 100000 characters).');
      if (action.elementId != null) await element('focus');
      invalidate(); await send('Input.insertText', { text: action.text }); return done({ typed: true });
    }
    case 'press_key': {
      if (action.elementId != null) await element('focus');
      const keys = [];
      let token = '';
      for (const character of String(action.key || '')) {
        if (character === '+' && token) { keys.push(keySpec(token)); token = ''; }
        else token += character;
      }
      keys.push(keySpec(token));
      const state = attached.get(tabId);
      const added = keys.filter(k => !state.keys.has(k.key));
      invalidate();
      try { for (const key of added) await inputKey(key, true); }
      finally { for (const key of added.reverse()) if (attached.has(tabId)) await keyEvent(tabId, key, false); }
      return done({ pressed: true });
    }
    case 'key_down': invalidate(); await inputKey(keySpec(action.key), true); return done({ held: true });
    case 'key_up': invalidate(); await inputKey(keySpec(action.key), false); return done({ released: true });
    case 'cursor': {
      const point = action.visible === false ? { visible: false } : { ...await actionPoint(identity, action, current), visible: true };
      attached.get(tabId).cursor = point.visible ? point : null;
      return step(() => content(tabId, 'cursor', point, current.browserDocumentId));
    }
    case 'click': case 'double_click': case 'right_click': case 'move': case 'mouse_down': case 'mouse_up': case 'scroll': case 'drag': {
      const held = attached.get(tabId);
      const point = action.type === 'mouse_up' && action.x === undefined && action.elementId === undefined
        ? { x: held.x, y: held.y } : await step(() => actionPoint(identity, action, current));
      const button = action.type === 'right_click' ? 'right' : action.button || 'left';
      if (!['left', 'middle', 'right'].includes(button)) fail('INVALID_BUTTON', 'Use left, middle or right mouse button.');
      if (action.type === 'scroll' && (!Number.isFinite(action.deltaX ?? 0) || !Number.isFinite(action.deltaY ?? 0))) fail('INVALID_SCROLL', 'Finite wheel deltas are required.');
      let path;
      if (action.type === 'drag') {
        const samples = action.path ?? [{ x: action.fromX, y: action.fromY }, { x: action.x, y: action.y }];
        if (!Array.isArray(samples) || samples.length < 2) fail('INVALID_ACTION', 'Drag requires at least two points.');
        path = [];
        for (const sample of samples) path.push(await step(() => actionPoint(identity, { ...action, ...sample, elementId: undefined }, current)));
      }
      invalidate();
      const showCursor = point => {
        held.cursor = { ...point, visible: true };
        return step(() => content(tabId, 'cursor', held.cursor, current.browserDocumentId));
      };
      await showCursor(path?.[0] ?? point);
      if (action.type === 'move') await pointer('mouseMoved', point);
      else if (action.type === 'scroll') await pointer('mouseWheel', point, 'none', 0, { deltaX: action.deltaX || 0, deltaY: action.deltaY || 0 });
      else if (action.type === 'mouse_down') await pointer('mousePressed', point, button, 1);
      else if (action.type === 'mouse_up') await pointer('mouseReleased', point, button, 1);
      else if (path) {
        await pointer('mouseMoved', path[0]); await pointer('mousePressed', path[0], button, 1);
        const duration = Math.min(10000, Math.max(50, action.durationMs ?? 350));
        const segmentDuration = duration / (path.length - 1), count = Math.max(1, Math.ceil(segmentDuration / 16));
        try {
          for (let index = 1; index < path.length; index++) {
            const from = path[index - 1], to = path[index];
            await showCursor(to);
            for (let frame = 1; frame <= count; frame++) {
              await pointer('mouseMoved', { x: from.x + (to.x - from.x) * frame / count, y: from.y + (to.y - from.y) * frame / count }, button);
              await step(() => delay(segmentDuration / count));
            }
          }
        } finally { const state = attached.get(tabId); if (state?.buttons.has(button)) await mouse(tabId, 'mouseReleased', state, button, 1); }
      } else {
        const count = action.type === 'double_click' ? 2 : action.clickCount ?? 1;
        if (![1, 2, 3].includes(count)) fail('INVALID_CLICK_COUNT', 'clickCount must be 1, 2 or 3.');
        await pointer('mouseMoved', point);
        for (let i = 1; i <= count; i++) {
          await pointer('mousePressed', point, button, i); await pointer('mouseReleased', point, button, i);
        }
      }
      return done({ acted: true, point });
    }
    default: fail('UNSUPPORTED_ACTION', 'Unsupported browser action: ' + action.type);
  }
  } catch (error) {
    error.details = {...error.details,inputDispatched:error.details?.inputDispatched === true || (inputState?.inputSequence ?? 0) !== inputStart};
    throw error;
  }
}
async function navigateTab(tabId, token, action) {
  let committed = false;
  const changed = details => { if (details.tabId === tabId && details.frameId === 0) committed = true; };
  const events = [chrome.webNavigation.onCommitted, chrome.webNavigation.onHistoryStateUpdated, chrome.webNavigation.onReferenceFragmentUpdated];
  for (const event of events) event.addListener(changed);
  try {
    checkControl(token); await action();
    const deadline = Date.now() + 10000;
    do {
      checkControl(token);
      const tab = await chrome.tabs.get(tabId);
      if (committed && tab.status === 'complete') {
        const page = await tabInfo(tab); checkControl(token);
        if (!page.supported) fail(page.error?.code || 'UNSUPPORTED_PAGE', page.error?.message || 'The navigated page is unavailable.');
        return page;
      }
      await delay(50);
    } while (Date.now() < deadline);
    fail('NAVIGATION_TIMEOUT', 'Navigation has no completed document; discover the current tab before retrying.');
  } finally { for (const event of events) event.removeListener(changed); }
}
async function waitForTab(tabId, token) {
  const deadline = Date.now() + 10000;
  let tab;
  do {
    checkControl(token); tab = await chrome.tabs.get(tabId); checkControl(token);
    if (tab.status === 'complete') return tab;
    await delay(100);
  } while (Date.now() < deadline);
  fail('NAVIGATION_TIMEOUT', 'Navigation did not finish; list tabs to inspect the current page before retrying.');
}
async function newTab(url = 'https://example.com/', token) {
  if (!allowed(url)) fail('UNSUPPORTED_URL', 'New tabs require an ordinary HTTP(S) URL.');
  checkControl(token);
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    checkControl(token);
    const current = await tabInfo(await waitForTab(tab.id, token));
    checkControl(token);
    return { created: true, tabId: tab.id, reselectRequired: true, ...current };
  } catch (error) {
    error.details = { ...error.details, created: true, tabId: tab.id,
      notice: 'A tab was created. Discover this browser before retrying; do not create another tab.' };
    throw error;
  }
}
async function command(message, token) {
  if (!connection || message.epoch !== connection.epoch || Date.now() > message.deadline) fail('STALE_COMMAND', 'Command expired or belongs to an old connection.');
  if (message.method !== 'release') checkControl(token);
  const { identity, options, action } = message.params || {};
  switch (message.method) {
    case 'listTargets': return Promise.all((await chrome.tabs.query({})).filter(tab => !tab.incognito).map(tabInfo));
    case 'select': {
      const current = await verify(identity), expected = message.params.expected;
      if (expected && (expected.url != null && current.url !== expected.url || expected.title != null && current.title !== expected.title)) fail('STALE_TARGET', 'Tab URL/title changed since discovery.');
      checkControl(token); await attach(identity); checkControl(token);
      return { selected: true, identity, capabilities: ['native-ax', 'screenshot', 'trusted-input', 'cursor', 'persistent-download-events'] };
    }
    case 'focus': {
      await verify(identity); checkControl(token);
      await chrome.tabs.update(identity.tabId, { active: true }); checkControl(token);
      const tab = await chrome.tabs.get(identity.tabId); checkControl(token);
      await chrome.windows.update(tab.windowId, { focused: true }); checkControl(token);
      return { focused: true };
    }
    case 'verify': return verify(identity);
    case 'observe': return observe(identity, options);
    case 'preview': return preview(identity);
    case 'act': return act(identity, action, token);
    case 'openSettings': {
      const edge = /Edg\//.test(navigator.userAgent), section = message.params.section;
      const urls = edge ? { passwordManager: 'edge://wallet/passwords', contactInfo: 'edge://settings/personalinfo', extensions: 'edge://extensions/' }
        : { passwordManager: 'chrome://password-manager/passwords', contactInfo: 'chrome://settings/addresses', extensions: 'chrome://extensions/' };
      urls.connection = chrome.runtime.getURL('options.html');
      if (!Object.hasOwn(urls, section)) fail('UNSUPPORTED_OPERATION', 'Unknown browser settings section.');
      checkControl(token);
      const tab = await chrome.tabs.create({ url: urls[section], active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return { opened: true, tabId: tab.id, url: urls[section] };
    }
    case 'newTab': return newTab(message.params.url, token);
    case 'release': return identity ? releaseTab(identity.tabId) : releaseAll();
    default: fail('UNSUPPORTED_OPERATION', 'Unknown bridge method.');
  }
}
async function recordDownload(type, download) {
  if (reconnectDisabled) return;
  const owner = connection;
  const saved = await chrome.storage.session.get('authorization');
  if (reconnectDisabled || owner !== connection || (!owner && !saved.authorization)) return;
  const event = { eventId: crypto.randomUUID(), at: new Date().toISOString(), type,
    durableDownloadConsent: (owner ?? saved.authorization)?.durableDownloadConsent === true,
    download: { id: download.id, filename: download.filename,
    url: download.url, finalUrl: download.finalUrl, state: download.state, exists: download.exists, bytesReceived: download.bytesReceived,
    totalBytes: download.totalBytes, mime: download.mime, error: download.error, startTime: download.startTime, endTime: download.endTime } };
  const { downloadEvents = [] } = await chrome.storage.local.get('downloadEvents');
  if (reconnectDisabled || owner !== connection) return;
  downloadEvents.push(event); await chrome.storage.local.set({ downloadEvents });
}
function downloadEvent(type, item) {
  if (reconnectDisabled) return;
  const owner = connection;
  downloadChain = downloadChain.then(async () => {
    if (reconnectDisabled || owner !== connection) return;
    const download = type === 'created' || type === 'erased' ? item : (await chrome.downloads.search({ id: item.id }))[0];
    if (download && !reconnectDisabled && owner === connection) await recordDownload(type, download);
  }).catch(error => { status.downloadError = error.message; });
}
chrome.downloads.onCreated.addListener(item => downloadEvent('created', item));
chrome.downloads.onChanged.addListener(item => downloadEvent('changed', item));
chrome.downloads.onErased.addListener(id => downloadEvent('erased', { id }));
chrome.webNavigation.onCommitted.addListener(details => { if (details.frameId === 0) { documents.set(details.tabId, details.documentId || crypto.randomUUID()); observations.delete(details.tabId); invalidateElements(details.tabId); } });
chrome.webNavigation.onDOMContentLoaded.addListener(details => {
  if (details.frameId !== 0 || !allowed(details.url)) return;
  const state = attached.get(details.tabId), cursor = state?.cursor;
  if (!cursor || !connection) return;
  void content(details.tabId, 'cursor', {...cursor, animateMovement: false}, details.documentId).then(async () => {
    if (attached.get(details.tabId) !== state || !state.cursor) await content(details.tabId, 'release', {}, details.documentId);
  }).catch(error => { status.cursorError = errorJSON(error); });
});
chrome.tabs.onRemoved.addListener(tabId => { attached.delete(tabId); observations.delete(tabId); invalidateElements(tabId); documents.delete(tabId); void saveAttached(); });
chrome.debugger.onDetach.addListener(({ tabId }, reason) => {
  observations.delete(tabId); invalidateElements(tabId);
  if (releasing.has(tabId)) return;
  void content(tabId, 'release').catch(error => { status.cursorError = errorJSON(error); });
  attached.delete(tabId); void saveAttached();
  status.lastDetach = { tabId, reason, at: new Date().toISOString() };
  if (connection && reason === 'canceled_by_user') void disconnect('Chrome debugger control was canceled. Reconnect explicitly.').catch(error => { status.releaseError = errorJSON(error); });
});

function cleanupFailure(errors) {
  if (errors.length === 1) throw errors[0];
  if (errors.length) fail('DISCONNECT_FAILED', errors.map(error => error.message).join('; '), { errors: errors.map(errorJSON) });
}
async function disconnect(reason = 'User disconnected', cause, temporary = false) {
  const c = connection, errors = [];
  if (!temporary) { try { await pairing.pause(c?.hostId); } catch (error) { errors.push(error); } }
  cancelControl(); connection = null; reconnectDisabled = true;
  status = { connected: false, message: reason, ...(cause ? { error: errorJSON(cause) } : {}) };
  // Clear authorization first, but a storage failure must not skip input release.
  try { await chrome.storage.session.remove('authorization'); } catch (error) { errors.push(error); }
  try { await chrome.action.setBadgeText({ text: '' }); } catch (error) { errors.push(error); }
  await commandChain.catch(() => {});
  try { await releaseAll(); } catch (error) { status.releaseError = errorJSON(error); errors.push(error); }
  if (c) {
    try { const { downloadEvents = [] } = await chrome.storage.local.get('downloadEvents'); await api('disconnect', { events: downloadEvents.slice(0, 500) }, c); }
    catch (error) { if (temporary) status.transportError = errorJSON(error); else errors.push(error); }
  }
  try { cleanupFailure(errors); }
  catch (error) { status.releaseError = errorJSON(error); throw error; }
}
async function loop(c) {
  if (running) return;
  running = true;
  try {
    while (connection === c) {
      await downloadChain;
      const { downloadEvents = [] } = await chrome.storage.local.get('downloadEvents');
      const result = await api('poll', { events: downloadEvents.slice(0, 500) }, c);
      if (result.acknowledgedEvents?.length) {
        const work = downloadChain.then(async () => {
          const current = (await chrome.storage.local.get('downloadEvents')).downloadEvents || [];
          const ack = new Set(result.acknowledgedEvents);
          await chrome.storage.local.set({ downloadEvents: current.filter(e => !ack.has(e.eventId)) });
        });
        downloadChain = work.catch(error => { status.downloadError = error.message; });
        await work;
      }
      if (connection !== c) break;
      for (const message of result.commands || []) {
        if (message.epoch !== c.epoch || Date.now() > message.deadline) continue;
        let cursorRelease;
        if (message.method === 'release' || message.method === 'disconnect') {
          const tabId = message.params?.identity?.tabId;
          cancelControl(tabId);
          cursorRelease = Promise.allSettled((tabId === undefined ? [...attached.keys()] : [tabId]).map(id => content(id, 'release')));
        }
        const token = controlToken(message.params?.identity?.tabId);
        const lane = message.monitoring === true && ['preview', 'verify'].includes(message.method) ? Promise.resolve() : commandChain;
        const work = lane.then(async () => {
          if (connection !== c) return;
          if (cursorRelease) await cursorRelease;
          let result;
          try {
            if (message.method === 'disconnect') {
              reconnectDisabled = true;
              const errors = [];
              try { await pairing.pause(c.hostId); } catch (error) { errors.push(error); }
              try { await chrome.storage.session.remove('authorization'); } catch (error) { errors.push(error); }
              let released;
              try { released = await releaseAll(); } catch (error) { errors.push(error); }
              cleanupFailure(errors);
              result = { ok: true, result: released };
            } else result = { ok: true, result: await command(message, token) };
          } catch (error) { result = { ok: false, error: errorJSON(error) }; }
          if (connection === c) await api('result', { id: message.id, ...result }, c);
          if (message.method === 'disconnect' && result.ok && connection === c) {
            connection = null; status = { connected: false, message: '已从 OpenCU 断开；在此页重新连接才能继续控制。' };
            await chrome.action.setBadgeText({ text: '' });
          }
        });
        if (message.monitoring === true && ['preview', 'verify'].includes(message.method)) {
          void work.catch(error => { status.monitoringError = errorJSON(error); });
        } else commandChain = work.catch(error => {
          cancelControl();
          void disconnect(error.message, error, true).catch(releaseError => { status.releaseError = errorJSON(releaseError); });
        });
      }
      await delay(500);
    }
  } catch (error) {
    if (connection === c) {
      await disconnect(error.message, error, true).catch(releaseError => { status.releaseError = errorJSON(releaseError); });
      await chrome.action.setBadgeText({ text: '!' });
    }
  } finally {
    await commandChain.catch(() => {}); running = false; commandChain = Promise.resolve();
    if (connection && connection !== c) void loop(connection);
    else if (!connection && !status.releaseError) void watchPairing();
  }
}
async function connect(input, restoring = false) {
  if (connection || connecting) fail('ALREADY_CONNECTED', 'Disconnect before changing the connection.');
  if (!restoring && input.consent !== true) fail('CONSENT_REQUIRED', 'Confirm local connection and debugger control first.');
  if (typeof input.token !== 'string' || input.token.length < 24) fail('INVALID_TOKEN', 'Enter the local OpenCU token (at least 24 characters).');
  connecting = true;
  const epoch = controlEpoch;
  try {
    await releaseAll();
    const local = await chrome.storage.local.get('instanceId'), session = await chrome.storage.session.get('browserInstanceId');
    const instanceId = local.instanceId || crypto.randomUUID(), browserInstanceId = session.browserInstanceId || crypto.randomUUID();
    await chrome.storage.local.set({ instanceId, port: Number(input.port) }); await chrome.storage.session.set({ browserInstanceId });
    const c = { endpoint: endpoint(input.port), token: input.token, hostId: input.hostId, instanceId, browserInstanceId, epoch: crypto.randomUUID(),
      durableDownloadConsent: input.durableDownloadConsent === true };
    const result = await api('connect', { protocol: 1, authorized: true, debuggerConsent: true, durableDownloadConsent: c.durableDownloadConsent, instanceId, browserInstanceId, epoch: c.epoch,
      label: /Edg\//.test(navigator.userAgent) ? 'Microsoft Edge' : 'Google Chrome' }, c);
    c.sessionId = result.sessionId; connection = c;
    try {
      if (epoch !== controlEpoch) fail('CONTROL_STOPPED', 'Connection was cancelled.');
      await chrome.storage.session.set({ authorization: { port: Number(input.port), token: input.token, ...(input.hostId ? {hostId: input.hostId} : {}), consent: true, durableDownloadConsent: c.durableDownloadConsent } });
      await chrome.action.setBadgeBackgroundColor({ color: '#2477ff' }); await chrome.action.setBadgeText({ text: 'ON' });
      if (epoch !== controlEpoch) fail('CONTROL_STOPPED', 'Connection was cancelled.');
      reconnectDisabled = false;
      status = { connected: true, endpoint: c.endpoint, instanceId, browserInstanceId, epoch: c.epoch };
      void loop(c); return status;
    } catch (error) {
      try { await disconnect(error.message); }
      catch (cleanupError) { error.details = { ...error.details, cleanupError: errorJSON(cleanupError) }; }
      status.error = errorJSON(error); throw error;
    }
  } finally { connecting = false; }
}
let recovery, recoveryError;
function recover() {
  recovery ??= restore().then(() => {
    if (status.error === recoveryError) delete status.error;
    recoveryError = undefined;
  }, error => {
    recoveryError = errorJSON(error); status.error = recoveryError;
    throw error;
  }).finally(() => { recovery = undefined; });
  return recovery;
}
async function restore() {
  if (connection || connecting || reconnectDisabled) return;
  const saved = await chrome.storage.session.get(['authorization', 'attachedTabs', 'heldInputs']);
  // A terminated worker releases persisted inputs before detaching; it never restores control references.
  const releaseError = status.releaseError;
  for (const tabId of saved.attachedTabs || []) {
    if (attached.has(tabId)) continue;
    const held = (saved.heldInputs || []).find(state => state.tabId === tabId) || { keys: [], buttons: [], x: 0, y: 0 };
    attached.set(tabId, { keys: new Map(held.keys.map(key => [key.key, key])), buttons: new Set(held.buttons), x: held.x, y: held.y });
  }
  for (const tabId of [...attached.keys()]) {
    try { await releaseTab(tabId); }
    catch (error) { status.releaseError = errorJSON(error); await chrome.storage.session.remove('authorization'); return; }
  }
  await chrome.storage.session.set({ attachedTabs: [], heldInputs: [] });
  if (status.releaseError === releaseError) delete status.releaseError;
  if (saved.authorization && !saved.authorization.hostId) {
    try { await connect(saved.authorization, true); }
    catch (error) { await chrome.storage.session.remove('authorization'); status = { connected: false, error: errorJSON(error) }; }
  }
}
const pairing = createPairingClient({connect, connected: () => !!connection || connecting, error: error => {status.error = errorJSON(error);} });
let watchingPairing;
function watchPairing() {
  if (status.releaseError) return Promise.resolve();
  watchingPairing ??= pairing.start().catch(error => {status.pairingError = errorJSON(error);}).finally(() => {watchingPairing = undefined;});
  return watchingPairing;
}
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'opencu-authorized') void recover().then(() => {void watchPairing();}).catch(error => console.error('OpenCU alarm recovery', error));
});
chrome.runtime.onStartup.addListener(() => { void initialize().then(() => {void watchPairing();}); });
chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create('opencu-authorized', { periodInMinutes: 1 });
  void initialize().then(() => {void watchPairing();});
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('options.html')) { respond({ ok: false, error: { code: 'UNAUTHORIZED_UI', message: 'Only the extension connection page may authorize control.' } }); return; }
  (async () => {
    await initialize();
    await recovery;
    if (message.type === 'status') return { ...status, paired: !!(await chrome.storage.local.get('pairings')).pairings?.length, hosts: connection ? [] : await pairing.hosts(), extensionId: chrome.runtime.id };
    if (message.type === 'allow') return pairing.allow(message.hostId);
    if (message.type === 'decline') return pairing.decline();
    if (message.type === 'connect') return connect(message);
    if (message.type === 'disconnect') { await disconnect(); return status; }
    if (message.type === 'forget') {
      const c = connection;
      if (c?.hostId) { await disconnect(); await pairing.forget(c); }
      else {
        await disconnect();
        await chrome.storage.local.remove('pairings');
      }
      return status;
    }
    fail('UNSUPPORTED_OPERATION', 'Unknown options request.');
  })().then(result => respond({ ok: true, result }), error => respond({ ok: false, error: errorJSON(error) }));
  return true;
});
let startup, startupError;
function initialize() {
  startup ??= recover().then(() => {
    if (status.error === startupError) delete status.error;
    startupError = undefined;
  }, error => {
    startup = undefined; startupError = errorJSON(error); status.error = startupError;
    throw error;
  });
  return startup;
}
void initialize().then(() => {void watchPairing();}).catch(error => console.error('OpenCU startup recovery', error));
