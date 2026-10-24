import {stat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {checkSignal, fail, finite} from '../protocol.mjs';
import {elementFor, elementPoint, focusElement} from './observation.mjs';
import {hitTest, callElement, patchDOM, screenshotPoint, verifyScreenshot} from './dom.mjs';
import {runCDPLocator} from '../../extension/cdp-locator.js';
import {runTextEdit} from '../../extension/text-edit.js';
import {selectOptionsFunction, selectOptionsResult} from '../../extension/select-options.js';
import {clickParameters, checkClickHeld, holdClick} from '../../extension/click-options.js';
import {pressParameters, checkPressHeld} from '../../extension/key-options.js';
import {playwrightKeyIdentity} from './playwright-keyboard.mjs';
import {withCDPFrameGuard} from '../../extension/frame-router.js';

export function normalizeBrowserAction(request = {}) {
  const aliases = {goto: 'navigate', new_tab: 'newTab', close_tab: 'closeTab', double_click: 'doubleClick',
    mouse_move: 'move', mouse_down: 'mouseDown', mouse_up: 'mouseUp', key_down: 'keyDown', key_up: 'keyUp',
    press_key: 'press', pressKey: 'press', keypress: 'press', type_text: 'type', typeText: 'type', set_value: 'fill', setValue: 'fill',
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
  const check = () => { checkSignal(signal); options.actionGuard?.check(); };
  const screenshotInput = request.elementId == null && ['screenshot', 'screenshot-pixels', 'physical-screenshot-pixels'].includes(request.coordinateSpace);
  const inputScreenshot = record.screenshot;
  const checkScreenshot = async () => { if (screenshotInput) await verifyScreenshot(record, request, inputScreenshot); };
  const elementGeneration = ['type', 'press'].includes(request.action) && request.elementId != null ? record.documentGeneration : undefined;
  if (!['background', 'foreground'].includes(request.inputMode ?? 'background')) fail('INVALID_ARGUMENT', 'inputMode must be background or foreground');
  const step = async work => {
    check();
    const pending = Promise.resolve().then(() => { check(); return work(); });
    record.pending.add(pending);
    pending.finally(() => record.pending.delete(pending)).catch(() => {});
    let listener;
    const aborted = new Promise((_, reject) => {
      listener = () => reject(Object.assign(new Error('Control has been stopped'), {code: 'CONTROL_STOPPED'}));
      signal?.addEventListener('abort', listener, {once: true});
    });
    try {
      const work = Promise.race([pending, aborted]);
      const value = await (options.actionGuard ? options.actionGuard.wait(work) : work);
      check();
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
    try { return await step(() => { record.inputDispatchSequence = (record.inputDispatchSequence ?? 0) + 1; return work(); }); }
    finally { signal?.removeEventListener('abort', stop); if (stopping) await stopping; }
  };
  const frameOptions = {check,guard:step,wrapSend:transport=>(method,params)=>method === 'Runtime.releaseObject' ? transport(method,params) : step(()=>{
    if (['DOM.focus','DOM.scrollIntoViewIfNeeded','DOM.setFileInputFiles'].includes(method) || method === 'Runtime.callFunctionOn' &&
      (params?.arguments?.[0]?.value === 'patch' || params?.functionDeclaration?.includes('this.scrollIntoView('))) record.inputDispatchSequence = (record.inputDispatchSequence ?? 0)+1;
    return transport(method,params);
  })};
  const frameRouter = withCDPFrameGuard(record.frameRouter,frameOptions.wrapSend,step);
  const frameSend = frameOptions.wrapSend((method,params)=>record.session.send(method,params));
  const input = (events, work, beforeDispatch) => step(async () => {
    const textEdit = events.some(event => event.textInput);
    check();
    if (request.locatorGeneration !== undefined && request.locatorGeneration !== record.documentGeneration) fail('STALE_ELEMENT', 'Document changed before locator input');
    await record.session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    record.focusEmulated = true;
    check();
    const expected = await options.expectInput?.(events), marker = textEdit ? expected : undefined;
    let failure;
    try {
      check();
      if (elementGeneration !== undefined) {
        if (elementGeneration !== record.documentGeneration) fail('STALE_ELEMENT', 'Document changed before element keyboard input');
        elementFor(record, request);
      }
      if (request.elementId != null) {const entry = elementFor(record, request); if (entry.route) await frameRouter.validate(entry.route);}
      check();
      await beforeDispatch?.();
      check();
      record.inputDispatchSequence = (record.inputDispatchSequence ?? 0) + 1;
      return await work();
    } catch (error) { failure = error; throw error; }
    finally {
      if (marker) try { await options.finishInput?.(marker); }
      catch (error) { if (!failure) throw error; failure.details = {...failure.details,inputMarkerError:error.message}; }
    }
  });
  const insertText = (text, verify) => input([{type:'beforeinput',inputType:'insertText',data:text,textInput:true}], () => page.keyboard.insertText(text), verify);
  const keyDown = async key => {
    key = keyName(key);
    playwrightKeyIdentity(key);
    record.keys.add(key);
    await options.persistInputs();
    const events = [{type: 'keydown', key: key === 'Space' ? ' ' : key}];
    if (!record.keys.has('Meta') && !record.keys.has('Control') && (key.length === 1 || ['Space', 'Backspace', 'Delete', 'Enter'].includes(key))) events.push({type: 'input'});
    await input(events, () => page.keyboard.down(key));
  };
  const keyUp = async key => {
    key = keyName(key);
    playwrightKeyIdentity(key);
    await step(() => { record.inputDispatchSequence = (record.inputDispatchSequence ?? 0) + 1; return page.keyboard.up(key); });
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
    await step(() => { record.inputDispatchSequence = (record.inputDispatchSequence ?? 0) + 1; return page.mouse.up({button}); });
    record.buttons.delete(button);
  };
  const point = async value => {
    if (value.elementId !== undefined) return step(() => elementPoint(record, value,frameRouter,frameSend));
    return step(() => screenshotPoint(record, {...request, ...value}));
  };
  const move = async value => {
    const location = await point(value);
    if (options.cursor) await step(() => options.cursor({...location, visible: true, animateMovement: true}));
    await input([], () => page.mouse.move(location.x, location.y), checkScreenshot);
    record.pointer = location;
    return location;
  };
  const checkPointer = async () => {
    if (request.elementId != null) {const entry = elementFor(record, request); if (entry.route) await frameRouter.checkPoint(entry,record.pointer);}
    await checkScreenshot();
  };
  const click = async count => {
    const click = clickParameters(request, {mac:process.platform === 'darwin',count});
    checkClickHeld(record, click);
    await move(request);
    const {button} = click;
    for (const key of click.keys) await keyDown(key);
    for (let index = 1; index <= click.count; index++) {
      record.buttons.add(button);
      await options.persistInputs();
      await input([{type: 'pointerdown', ...record.pointer}], () => page.mouse.down({button, clickCount: index}), checkPointer);
      await step(() => holdClick(click.durationMs, check));
      await step(() => { record.inputDispatchSequence = (record.inputDispatchSequence ?? 0) + 1; return page.mouse.up({button, clickCount: index}); });
      record.buttons.delete(button);
    }
    for (const key of [...click.keys].reverse()) await keyUp(key);
  };
  const focusKeyboardElement = () => step(async () => {
    const entry = elementFor(record,request);
    if (entry.route) await frameRouter.validate(entry.route);
    check();
    // Missing observation IDs fail before this fence. Once focus is attempted,
    // its result may be unknown and must not be treated as an undispatched input.
    if (!entry.route) record.inputDispatchSequence = (record.inputDispatchSequence ?? 0) + 1;
    return focusElement(record,request,frameRouter);
  });
  const press = async (value = request.key, {durationMs:hold = request.durationMs, focus = true} = {}) => {
    const keyboard={mac:process.platform === 'darwin',identity:playwrightKeyIdentity};
    const {keys,durationMs} = pressParameters({key:value,durationMs:hold},keyboard);
    checkPressHeld(record,keys,keyboard);
    if (focus && request.elementId !== undefined) await focusKeyboardElement();
    for (const key of keys) await keyDown(key);
    await step(() => holdClick(durationMs, check));
    for (const key of [...keys].reverse()) await keyUp(key);
  };
  const invalidate = () => { record.elements.clear(); record.screenshot = undefined; };
  switch (request.action) {
    case 'domSnapshot': {
      const generation = record.documentGeneration;
      const result = await step(() => runCDPLocator(frameSend, {operation: 'domSnapshot', locator:request.locator ?? [], args: request.args ?? {}}, () => {}, frameRouter));
      if (generation !== record.documentGeneration) fail('STALE_OBSERVATION', 'Document changed during DOM snapshot');
      return {action: request.action, ...result};
    }
    case 'locator': {
      const generation = record.documentGeneration;
      const result = await step(() => runCDPLocator(frameSend, request, (backendNodeId, route) => {
        check();
        if (generation !== record.documentGeneration) fail('STALE_ELEMENT', 'Document changed while resolving the locator');
        let elementId = [...record.elements].find(([, entry]) => entry.backendNodeId === backendNodeId && ((!entry.route && !route.sessionId && route.frameId === route.sessionFrameId) || entry.route?.frameId === route.frameId && entry.route?.documentId === route.documentId))?.[0];
        if (elementId === undefined) elementId = ++record.nextElementId;
        record.elements.set(elementId, {backendNodeId, route:frameRouter.original(route), observationId: record.observationId});
        return elementId;
      }, frameRouter));
      if (generation !== record.documentGeneration) fail('STALE_ELEMENT', 'Document changed while resolving the locator');
      if (Object.hasOwn(result, 'value')) return {action: request.action, value: result.value};
      const args = request.args ?? {}, method = request.method;
      const checking = ['check', 'uncheck', 'setChecked'].includes(method);
      const checked = method === 'setChecked' ? args.checked : method === 'check';
      if (!checking || result.checked !== checked) {
        await actOnPage(record, {action: checking ? 'click' : method === 'dblclick' ? 'doubleClick' : method,
          elementId: result.elementId, locatorGeneration: generation, button: args.button, key: args.key, value: args.value,
          signal: request.signal, inputMode: request.inputMode}, options);
        if (checking && await step(() => callElement(record, {elementId: result.elementId}, 'checked',{},frameOptions)) !== checked) fail('LOCATOR_ACTION_FAILED', 'Click did not produce the requested checked state');
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
    case 'hitTest': return {action: request.action, element: await step(() => hitTest(record, request,frameOptions))};
    case 'getDOM': return {action: request.action, element: await step(() => callElement(record, request, 'describe',{},frameOptions))};
    case 'setText':
    case 'setStyle':
    case 'designTweak': {
      const result = await step(() => patchDOM(record, request,frameOptions));
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
      await input([{type: 'wheel'}], () => page.mouse.wheel(finite(request.deltaX ?? 0, 'deltaX'), finite(request.deltaY ?? 0, 'deltaY')), checkPointer);
      break;
    case 'drag': {
      if (!Array.isArray(request.path) || request.path.length < 2) fail('INVALID_ARGUMENT', 'drag requires at least two path points');
      const points = request.path.map(value => ({x: finite(value.x, 'x'), y: finite(value.y, 'y')}));
      // Reject an invalid later endpoint before any pointer input. move() still
      // resolves each point again so preflight does not replace freshness checks.
      for (const value of points) await point(value);
      await move(points[0]);
      await mouseDown(request.button);
      for (const value of points.slice(1)) await move(value);
      await mouseUp(request.button);
      break;
    }
    case 'keyDown': await keyDown(request.key); break;
    case 'keyUp': await keyUp(request.key); break;
    case 'press': await press(); break;
    case 'selectText':
    case 'paste': {
      const generation = record.documentGeneration;
      const entry = request.elementId != null ? elementFor(record, request) : undefined;
      const validate = async () => {
        check();
        if (generation !== record.documentGeneration || entry && elementFor(record,request) !== entry) fail('STALE_ELEMENT','The selected document or editable element changed');
        if (entry?.route) await step(() => frameRouter.validate(entry.route));
        check();
      };
      const send = (method,params) => step(() => (entry?.route?.send ?? ((method,params)=>record.session.send(method,params)))(method,params));
      const result = await runTextEdit(send,request.action,request,{
        backendNodeId:entry?.backendNodeId,contextId:entry?.route?.contextId,validate,
        onFocus:()=>{record.inputDispatchSequence=(record.inputDispatchSequence??0)+1;},
        beforeFocus:async()=>{await step(()=>record.session.send('Emulation.setFocusEmulationEnabled',{enabled:true}));record.focusEmulated=true;},
        insertText,
      });
      record.screenshot=undefined;
      return {action:request.action,...result};
    }
    case 'type':
      if (typeof request.text !== 'string') fail('INVALID_ARGUMENT', 'type requires text');
      if (request.elementId !== undefined) await focusKeyboardElement();
      await insertText(request.text);
      break;
    case 'fill':
      if (typeof request.value !== 'string') fail('INVALID_ARGUMENT', 'fill requires a string value');
      await focusKeyboardElement();
      await press('ControlOrMeta+A',{durationMs:0,focus:false});
      if (request.value === '') await press('Backspace',{durationMs:0,focus:false});
      else await insertText(request.value);
      break;
    case 'selectOption': {
      const {elementFor} = await import('./observation.mjs');
      const entry = elementFor(record, request);
      const {object} = await step(() => (entry.route?.send ?? ((method, params) => record.session.send(method, params)))('DOM.resolveNode', {backendNodeId: entry.backendNodeId, ...(entry.route ? {executionContextId:entry.route.contextId} : {})}));
      try {
        const inputSequence = record.inputDispatchSequence ?? 0;
        const result = await input([{type: 'input'}], () => (entry.route?.send ?? ((method, params) => record.session.send(method, params)))('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration: selectOptionsFunction,
          arguments: [{value: request.values ?? request.value}], returnByValue: true,
        }));
        if (result.exceptionDetails) fail('INVALID_ARGUMENT', result.exceptionDetails.text);
        if (result.result.value?.__opencuSelectError) record.inputDispatchSequence = inputSequence;
        selectOptionsResult(result.result.value);
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

export async function releasePage(record, timeoutMs, {dismissDialogs = true, persistInputs} = {}) {
  if (record.page.isClosed() || record.crashed) {
    record.keys.clear(); record.buttons.clear();
    return [];
  }
  const dialog = record.dialogs?.read();
  if (dialog && !dismissDialogs) return [{targetId:record.id,error:'A JavaScript dialog remains open; automatic cleanup did not dismiss it',dialog}];
  const deadline = Date.now() + timeoutMs;
  const guard = !dismissDialogs ? record.dialogs?.begin() : undefined;
  const releaseInput = (work, released) => {
    const pending = Promise.resolve().then(() => { guard?.check(); return work(); }).then(async value => {
      released();
      await persistInputs?.();
      return value;
    });
    record.pending.add(pending);
    pending.finally(() => record.pending.delete(pending)).catch(() => {});
    return pending;
  };
  const bounded = async work => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Input release deadline reached');
    let timer;
    try {
      const pending = Promise.race([Promise.resolve().then(() => { guard?.check(); return work(); }),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Input release is still in flight')),remaining);})]);
      return await (guard ? guard.wait(pending) : pending);
    }
    finally { clearTimeout(timer); }
  };
  let timer, dialogRelease;
  try { if (dismissDialogs) dialogRelease = await record.dialogs?.beginRelease(timeoutMs); }
  catch (error) { return [{targetId:record.id,error:error.message}]; }
  try {
    if (dialogRelease?.failures.length) return dialogRelease.failures.map(error => ({targetId:record.id,error}));
    const pending = Promise.race([
      Promise.allSettled([...record.pending]).then(() => true),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), Math.max(0,deadline-Date.now())); }),
    ]).finally(() => clearTimeout(timer));
    const settled = await (guard ? guard.wait(pending) : pending);
    if (!settled) return [{targetId: record.id, error: 'Input command is still in flight'}, ...(dialogRelease?.failures ?? []).map(error=>({targetId:record.id,error}))];
    const failures = [];
    for (const button of [...record.buttons]) {
      try { await bounded(() => releaseInput(() => record.page.mouse.up({button}), () => record.buttons.delete(button))); }
      catch (error) { guard?.check(); failures.push({targetId: record.id, button, error: error.message}); }
    }
    // Retain modifiers until every mouse-up is acknowledged, including retries.
    if (!record.buttons.size) for (const key of [...record.keys].reverse()) {
      try { await bounded(() => releaseInput(() => record.page.keyboard.up(key), () => record.keys.delete(key))); }
      catch (error) {
        guard?.check();
        // Playwright rejects unknown keys before dispatching any input.
        if (error.message === `keyboard.up: Unknown key: "${key}"`) record.keys.delete(key);
        else failures.push({targetId: record.id, key, error: error.message});
      }
    }
    if (record.focusEmulated && !record.keys.size && !record.buttons.size) {
      try { await bounded(() => record.session.send('Emulation.setFocusEmulationEnabled', { enabled: false })); record.focusEmulated = false; }
      catch (error) { guard?.check(); failures.push({targetId: record.id, error: error.message}); }
    }
    failures.push(...(dialogRelease?.failures ?? []).map(error=>({targetId:record.id,error})));
    return failures;
  } catch (error) {
    const dialog = guard?.dialog ?? record.dialogs?.read();
    return [{targetId:record.id,error:error.message,...(dialog ? {dialog} : {})}];
  } finally { clearTimeout(timer); guard?.finish(); dialogRelease?.finish(); }
}
