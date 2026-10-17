import {stat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {checkSignal, fail, finite} from '../protocol.mjs';
import {elementFor, elementPoint, focusElement} from './observation.mjs';
import {hitTest, callElement, patchDOM, screenshotPoint} from './dom.mjs';
import {runCDPLocator} from '../../extension/cdp-locator.js';

export function normalizeBrowserAction(request = {}) {
  const aliases = {goto: 'navigate', new_tab: 'newTab', close_tab: 'closeTab', double_click: 'doubleClick',
    mouse_move: 'move', mouse_down: 'mouseDown', mouse_up: 'mouseUp', key_down: 'keyDown', key_up: 'keyUp',
    press_key: 'press', keypress: 'press', type_text: 'type', typeText: 'type', set_value: 'fill', setValue: 'fill',
    hit_test: 'hitTest', get_dom: 'getDOM', set_text: 'setText', set_style: 'setStyle', design_tweak: 'designTweak'};
  const name = request.action ?? request.type;
  const action = {...request, action: aliases[name] ?? name};
  if (Array.isArray(action.position ?? action.point)) [action.x, action.y] = action.position ?? action.point;
  action.elementId ??= action.element ?? action.runtimeElementId;
  action.text ??= action.action === 'type' || action.action === 'setText' ? action.value : undefined;
  action.key ??= action.combo;
  if (action.action === 'right_click' || action.action === 'rightClick') { action.action = 'click'; action.button = 'right'; }
  if (action.action === 'drag' && !action.path && Array.isArray(action.from) && Array.isArray(action.to)) {
    action.path = [action.from, action.to].map(([x, y]) => ({x, y}));
  }
  return action;
}

function keyName(value) {
  if (typeof value !== 'string' || !value) fail('INVALID_ARGUMENT', 'key must be a non-empty string');
  return value === 'ControlOrMeta' ? (process.platform === 'darwin' ? 'Meta' : 'Control') : value;
}
function buttonName(value = 'left') {
  if (!['left', 'middle', 'right'].includes(value)) fail('INVALID_ARGUMENT', 'button must be left, middle, or right');
  return value;
}

export async function actOnPage(record, request, options) {
  request = normalizeBrowserAction(request);
  const {page} = record;
  const signal = request.signal;
  const elementGeneration = ['type', 'press'].includes(request.action) && request.elementId != null ? record.documentGeneration : undefined;
  if (!['background', 'foreground'].includes(request.inputMode ?? 'background')) fail('INVALID_ARGUMENT', 'inputMode must be background or foreground');
  const step = async work => {
    checkSignal(signal);
    const pending = Promise.resolve().then(() => { checkSignal(signal); return work(); });
    record.pending.add(pending);
    pending.finally(() => record.pending.delete(pending)).catch(() => {});
    let listener;
    const aborted = new Promise((_, reject) => {
      listener = () => reject(Object.assign(new Error('Control has been stopped'), {code: 'CONTROL_STOPPED'}));
      signal?.addEventListener('abort', listener, {once: true});
    });
    try {
      const value = await Promise.race([pending, aborted]);
      checkSignal(signal);
      return value;
    } finally { signal?.removeEventListener('abort', listener); }
  };
  const navigate = async work => {
    let stopping;
    const stop = () => {
      stopping = record.session.send('Page.stopLoading');
      void stopping.catch(() => {});
    };
    signal?.addEventListener('abort', stop, {once: true});
    try { return await step(work); }
    finally { signal?.removeEventListener('abort', stop); if (stopping) await stopping; }
  };
  const input = (events, work, beforeDispatch) => step(async () => {
    if (request.locatorGeneration !== undefined && request.locatorGeneration !== record.documentGeneration) fail('STALE_ELEMENT', 'Document changed before locator input');
    await record.session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    record.focusEmulated = true;
    checkSignal(signal);
    await options.expectInput?.(events);
    checkSignal(signal);
    if (elementGeneration !== undefined) {
      if (elementGeneration !== record.documentGeneration) fail('STALE_ELEMENT', 'Document changed before element keyboard input');
      elementFor(record, request);
    }
    if (request.elementId != null) {const entry = elementFor(record, request); if (entry.route) await record.frameRouter.validate(entry.route);}
    await beforeDispatch?.();
    checkSignal(signal);
    record.inputDispatchSequence = (record.inputDispatchSequence ?? 0) + 1;
    return work();
  });
  const keyDown = async key => {
    key = keyName(key);
    record.keys.add(key);
    await options.persistInputs();
    const events = [{type: 'keydown', key: key === 'Space' ? ' ' : key}];
    if (!record.keys.has('Meta') && !record.keys.has('Control') && (key.length === 1 || ['Space', 'Backspace', 'Delete', 'Enter'].includes(key))) events.push({type: 'input'});
    await input(events, () => page.keyboard.down(key));
  };
  const keyUp = async key => {
    key = keyName(key);
    await step(() => page.keyboard.up(key));
    record.keys.delete(key);
  };
  const mouseDown = async button => {
    button = buttonName(button);
    record.buttons.add(button);
    await options.persistInputs();
    await input([{type: 'pointerdown', ...record.pointer}], () => page.mouse.down({button}), checkPointer);
  };
  const mouseUp = async button => {
    button = buttonName(button);
    await step(() => page.mouse.up({button}));
    record.buttons.delete(button);
  };
  const point = async value => {
    if (value.elementId !== undefined) return step(() => elementPoint(record, value));
    return step(() => screenshotPoint(record, {...request, ...value}));
  };
  const move = async value => {
    const location = await point(value);
    if (options.cursor) await step(() => options.cursor({...location, visible: true, animateMovement: true}));
    await input([], () => page.mouse.move(location.x, location.y));
    record.pointer = location;
    return location;
  };
  const checkPointer = async () => {
    if (request.elementId != null) {const entry = elementFor(record, request); if (entry.route) await record.frameRouter.checkPoint(entry,record.pointer);}
  };
  const click = async count => {
    await move(request);
    const button = buttonName(request.button);
    for (let index = 1; index <= count; index++) {
      record.buttons.add(button);
      await options.persistInputs();
      await input([{type: 'pointerdown', ...record.pointer}], () => page.mouse.down({button, clickCount: index}), checkPointer);
      await step(() => page.mouse.up({button, clickCount: index}));
      record.buttons.delete(button);
    }
  };
  const press = async value => {
    const keys = [];
    let token = '';
    for (const char of keyName(value)) {
      if (char === '+' && token) { keys.push(keyName(token)); token = ''; }
      else token += char;
    }
    keys.push(keyName(token));
    if (keys.some(key => record.keys.has(key))) fail('INVALID_ARGUMENT', 'press cannot reuse an explicitly held key');
    for (const key of keys) await keyDown(key);
    for (const key of [...keys].reverse()) await keyUp(key);
  };
  const invalidate = () => { record.elements.clear(); record.screenshot = undefined; };
  switch (request.action) {
    case 'domSnapshot': {
      const generation = record.documentGeneration;
      const result = await step(() => runCDPLocator((method, args) => record.session.send(method, args), {operation: 'domSnapshot', locator:request.locator ?? [], args: request.args ?? {}}, () => {}, record.frameRouter));
      if (generation !== record.documentGeneration) fail('STALE_OBSERVATION', 'Document changed during DOM snapshot');
      return {action: request.action, ...result};
    }
    case 'locator': {
      const generation = record.documentGeneration;
      const result = await step(() => runCDPLocator((method, args) => record.session.send(method, args), request, (backendNodeId, route) => {
        if (generation !== record.documentGeneration) fail('STALE_ELEMENT', 'Document changed while resolving the locator');
        let elementId = [...record.elements].find(([, entry]) => entry.backendNodeId === backendNodeId && ((!entry.route && !route.sessionId && route.frameId === route.sessionFrameId) || entry.route?.frameId === route.frameId && entry.route?.documentId === route.documentId))?.[0];
        if (elementId === undefined) elementId = ++record.nextElementId;
        record.elements.set(elementId, {backendNodeId, route, observationId: record.observationId});
        return elementId;
      }, record.frameRouter));
      if (generation !== record.documentGeneration) fail('STALE_ELEMENT', 'Document changed while resolving the locator');
      if (Object.hasOwn(result, 'value')) return {action: request.action, value: result.value};
      const args = request.args ?? {}, method = request.method;
      const checking = ['check', 'uncheck', 'setChecked'].includes(method);
      const checked = method === 'setChecked' ? args.checked : method === 'check';
      if (!checking || result.checked !== checked) {
        await actOnPage(record, {action: checking ? 'click' : method === 'dblclick' ? 'doubleClick' : method,
          elementId: result.elementId, locatorGeneration: generation, button: args.button, key: args.key, value: args.value,
          signal: request.signal, inputMode: request.inputMode}, options);
        if (checking && await step(() => callElement(record, {elementId: result.elementId}, 'checked')) !== checked) fail('LOCATOR_ACTION_FAILED', 'Click did not produce the requested checked state');
      }
      return {action: request.action, value: null};
    }
    case 'navigate': {
      let url;
      try { url = new URL(request.url); } catch { fail('INVALID_ARGUMENT', 'navigate requires an absolute URL'); }
      if (!['http:', 'https:', 'about:', 'file:'].includes(url.protocol)) fail('INVALID_ARGUMENT', 'Unsupported navigation protocol');
      await navigate(() => page.goto(url.href, {waitUntil: 'domcontentloaded', timeout: options.timeoutMs}));
      invalidate();
      break;
    }
    case 'back': await navigate(() => page.goBack({waitUntil: 'domcontentloaded', timeout: options.timeoutMs})); invalidate(); break;
    case 'forward': await navigate(() => page.goForward({waitUntil: 'domcontentloaded', timeout: options.timeoutMs})); invalidate(); break;
    case 'reload': await navigate(() => page.reload({waitUntil: 'domcontentloaded', timeout: options.timeoutMs})); invalidate(); break;
    case 'focus':
    case 'activate': await step(() => page.bringToFront()); break;
    case 'hitTest': return {action: request.action, element: await step(() => hitTest(record, request))};
    case 'getDOM': return {action: request.action, element: await step(() => callElement(record, request, 'describe'))};
    case 'setText':
    case 'setStyle':
    case 'designTweak': {
      const result = await step(() => patchDOM(record, request));
      record.screenshot = undefined;
      return {action: request.action, ...result};
    }
    case 'move': await move(request); break;
    case 'click': await click(1); break;
    case 'doubleClick': await click(2); break;
    case 'mouseDown': if (request.x !== undefined || request.elementId !== undefined) await move(request); await mouseDown(request.button); break;
    case 'mouseUp': await mouseUp(request.button); break;
    case 'scroll':
      if (request.x !== undefined || request.elementId !== undefined) await move(request);
      await input([{type: 'wheel'}], () => page.mouse.wheel(finite(request.deltaX ?? 0, 'deltaX'), finite(request.deltaY ?? 0, 'deltaY')));
      break;
    case 'drag': {
      if (!Array.isArray(request.path) || request.path.length < 2) fail('INVALID_ARGUMENT', 'drag requires at least two path points');
      const points = request.path.map(value => ({x: finite(value.x, 'x'), y: finite(value.y, 'y')}));
      await move(points[0]);
      await mouseDown(request.button);
      for (const value of points.slice(1)) await move(value);
      await mouseUp(request.button);
      break;
    }
    case 'keyDown': await keyDown(request.key); break;
    case 'keyUp': await keyUp(request.key); break;
    case 'press': if (request.elementId !== undefined) await step(() => focusElement(record, request)); await press(request.key); break;
    case 'type':
      if (typeof request.text !== 'string') fail('INVALID_ARGUMENT', 'type requires text');
      if (request.elementId !== undefined) await step(() => focusElement(record, request));
      await input([{type: 'input'}], () => page.keyboard.insertText(request.text));
      break;
    case 'fill':
      if (typeof request.value !== 'string') fail('INVALID_ARGUMENT', 'fill requires a string value');
      await step(() => focusElement(record, request));
      await press('ControlOrMeta+A');
      if (request.value === '') await press('Backspace');
      else await input([{type: 'input'}], () => page.keyboard.insertText(request.value));
      break;
    case 'selectOption': {
      const {elementFor} = await import('./observation.mjs');
      const entry = elementFor(record, request);
      const {object} = await step(() => (entry.route?.send ?? ((method, params) => record.session.send(method, params)))('DOM.resolveNode', {backendNodeId: entry.backendNodeId, ...(entry.route ? {executionContextId:entry.route.contextId} : {})}));
      try {
        const result = await input([{type: 'input'}], () => (entry.route?.send ?? ((method, params) => record.session.send(method, params)))('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration: 'function(values) { if (this.tagName !== "SELECT") throw new Error("Element is not a select"); for (const option of this.options) option.selected = values.includes(option.value); this.dispatchEvent(new Event("input", {bubbles:true})); this.dispatchEvent(new Event("change", {bubbles:true})); return [...this.selectedOptions].map(option => option.value); }',
          arguments: [{value: Array.isArray(request.value) ? request.value : [request.value]}], returnByValue: true,
        }));
        if (result.exceptionDetails) fail('INVALID_ARGUMENT', result.exceptionDetails.text);
      } finally { await (entry.route?.send ?? ((method, params) => record.session.send(method, params)))('Runtime.releaseObject', {objectId: object.objectId}); }
      break;
    }
    case 'upload': {
      const {elementFor} = await import('./observation.mjs');
      const entry = elementFor(record, request);
      if (!Array.isArray(request.files) || !request.files.length || request.files.some(file => typeof file !== 'string' || !isAbsolute(file))) fail('INVALID_ARGUMENT', 'upload requires absolute file paths');
      for (const file of request.files) if (!(await step(() => stat(file))).isFile()) fail('INVALID_ARGUMENT', 'Upload source must be a regular file');
      await input([{type: 'input'}], () => (entry.route?.send ?? ((method, params) => record.session.send(method, params)))('DOM.setFileInputFiles', {backendNodeId: entry.backendNodeId, files: request.files}));
      break;
    }
    case 'download': {
      const download = page.waitForEvent('download', {timeout: options.timeoutMs});
      download.catch(() => {});
      await click(1);
      const item = await step(() => download);
      const delivery = await step(() => options.capture(item, record.id));
      return {action: request.action, delivery};
    }
    default: fail('UNSUPPORTED_ACTION', `Unsupported browser action ${request.action}`);
  }
  return {action: request.action, inputMode: 'background', delivery: 'target-cdp', effectVerified: false};
}

export async function releasePage(record, timeoutMs) {
  if (record.page.isClosed()) {
    record.keys.clear(); record.buttons.clear();
    return [];
  }
  let timer;
  const settled = await Promise.race([
    Promise.allSettled([...record.pending]).then(() => true),
    new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
  if (!settled) return [{targetId: record.id, error: 'Input command is still in flight'}];
  const failures = [];
  for (const key of [...record.keys].reverse()) {
    try { await record.page.keyboard.up(key); record.keys.delete(key); }
    catch (error) {
      // Playwright rejects unknown keys before dispatching any input.
      if (error.message === `keyboard.up: Unknown key: "${key}"`) record.keys.delete(key);
      else failures.push({targetId: record.id, key, error: error.message});
    }
  }
  for (const button of [...record.buttons]) {
    try { await record.page.mouse.up({button}); record.buttons.delete(button); }
    catch (error) { failures.push({targetId: record.id, button, error: error.message}); }
  }
  if (record.focusEmulated && !record.keys.size && !record.buttons.size) {
    try { await record.session.send('Emulation.setFocusEmulationEnabled', { enabled: false }); record.focusEmulated = false; }
    catch (error) { failures.push({targetId: record.id, error: error.message}); }
  }
  return failures;
}
