import {checkSignal, fail, finite} from '../protocol.mjs';
import {elementFor, elementPoint, focusElement} from './observation.mjs';
import {hitTest, callElement, patchDOM, screenshotPoint, verifyScreenshot} from './dom.mjs';
import {runCDPLocator} from '../../extension/cdp-locator.js';
import {runTextEdit} from '../../extension/text-edit.js';
import {selectOptionsFunction, selectOptionsResult} from '../../extension/select-options.js';
import {validateFileInput,writeFileInput} from '../../extension/file-input.js';
import {uploadFiles} from './upload-files.mjs';
import {clickParameters, locatorClickParameters, checkClickHeld, holdClick} from '../../extension/click-options.js';
import {pressParameters, checkPressHeld} from '../../extension/key-options.js';
import {dragPath} from '../../extension/pointer-path.js';
import {scrollDeltas,readElementScrollGeometry,checkScrollGeometry} from '../../extension/scroll.js';
import {playwrightKeyIdentity} from './playwright-keyboard.mjs';
import {actOnClipboard,restoreClipboardPermissions} from './clipboard.mjs';
import {withCDPFrameGuard} from '../../extension/frame-router.js';
import {sequentialTextKey, checkSequentialDeadline, guestKeySpec, keyEventParameters, keyboardInputTypes} from '../../extension/keyboard.js';

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
  const inputOccurrence = ['click','doubleClick','move','mouseDown','scroll','drag','type','keyDown','press','paste','selectText','fill','selectOption'].includes(request.action) ? record.documentGeneration : undefined;
  const inputRoutes=new Set();
  const check = () => { checkSignal(signal); options.actionGuard?.check();
    if (inputOccurrence !== undefined && inputOccurrence !== record.documentGeneration) fail('STALE_ELEMENT','The document changed during input; observe again before continuing');
    if (request.action === 'fileChooserSetFiles' && request.deadline !== undefined && Date.now() >= request.deadline) fail('FILE_CHOOSER_TIMEOUT','Setting file chooser files timed out; observe before deciding another action');
  };
  const screenshotInput = request.elementId == null && ['screenshot', 'screenshot-pixels', 'physical-screenshot-pixels'].includes(request.coordinateSpace);
  const inputScreenshot = record.screenshot;
  const checkScreenshot = async () => { if (screenshotInput) await verifyScreenshot(record, request, inputScreenshot); };
  const elementGeneration = ['type', 'press'].includes(request.action) && request.elementId != null ? record.documentGeneration : undefined;
  if (!['background', 'foreground'].includes(request.inputMode ?? 'background')) fail('INVALID_ARGUMENT', 'inputMode must be background or foreground');
  const step = async (work, navigationAfter = false) => {
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
      if (navigationAfter) { checkSignal(signal); options.actionGuard?.check(); }
      else check();
      return value;
    } finally { signal?.removeEventListener('abort', listener); }
  };
  if (['clipboardRead','clipboardReadText','clipboardWrite','clipboardWriteText'].includes(request.action))
    return actOnClipboard(record,request,{step,check,onWrite:() => {record.inputDispatchSequence=(record.inputDispatchSequence??0)+1;}});
  const navigate = async work => {
    let stopping;
    const stop = () => {
      stopping = record.session.send('Page.stopLoading');
      void stopping.catch(() => {});
    };
    signal?.addEventListener('abort', stop, {once: true});
    try { return await step(() => { record.inputDispatchSequence = (record.inputDispatchSequence ?? 0) + 1; return work(); }); }
    catch (error) {
      if (error.name === 'TimeoutError' && !signal?.aborted) {
        error.code = 'NAVIGATION_TIMEOUT';
        error.message += '\nNavigation may still complete. Observe this same target; do not replay the trigger.';
        // This receipt settles this RPC; it says nothing about the page load.
        error.details = {...error.details,navigationSettled:true,effectVerified:false};
      }
      throw error;
    }
    finally { signal?.removeEventListener('abort', stop); if (stopping) await stopping; }
  };
  const frameOptions = {check,guard:step,wrapSend:transport=>(method,params)=>method === 'Runtime.releaseObject' ? transport(method,params) : step(()=>{
    if (['DOM.focus','DOM.scrollIntoViewIfNeeded','DOM.setFileInputFiles'].includes(method) || method === 'Runtime.callFunctionOn' &&
      (params?.arguments?.[0]?.value === 'patch' || params?.functionDeclaration?.includes('this.scrollIntoView(') || params?.functionDeclaration?.includes('__opencuClearFileInput'))) record.inputDispatchSequence = (record.inputDispatchSequence ?? 0)+1;
    return transport(method,params);
  })};
  const frameRouter = withCDPFrameGuard(record.frameRouter,frameOptions.wrapSend,step);
  const frameSend = frameOptions.wrapSend((method,params)=>record.session.send(method,params));
  const input = (events, work, beforeDispatch, navigationAfter = false) => step(async () => {
    const scopedInput = events.length > 0;
    check();
    if (request.locatorGeneration !== undefined && request.locatorGeneration !== record.documentGeneration) fail('STALE_ELEMENT', 'Document changed before locator input');
    await record.session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    record.focusEmulated = true;
    check();
    if (record.frameRouter) {
      for(const route of inputRoutes)await frameRouter.validate(route);
      const down=events.find(event=>event.type==='pointerdown');
      if(down && Number.isFinite(down.x) && Number.isFinite(down.y)) inputRoutes.add((await frameRouter.atPoint(down)).route);
    }
    const expected = await options.expectInput?.(events), marker = scopedInput ? expected : undefined;
    let failure,dispatched=false;
    try {
      check();
      if (elementGeneration !== undefined) {
        if (elementGeneration !== record.documentGeneration) fail('STALE_ELEMENT', 'Document changed before element keyboard input');
        elementFor(record, request);
      }
      if (request.elementId != null) {const entry = elementFor(record, request); if (entry.route) await frameRouter.validate(entry.route);}
      check();
      await beforeDispatch?.();
      if(record.frameRouter)for(const route of inputRoutes)await frameRouter.validate(route);
      check();
      record.inputDispatchSequence = (record.inputDispatchSequence ?? 0) + 1;
      const result=await work();dispatched=true;return result;
    } catch (error) { failure = error; throw error; }
    finally {
      if (marker) try { await options.finishInput?.(marker,dispatched); }
      catch (error) { if (!failure) throw error; failure.details = {...failure.details,inputMarkerError:error.message}; }
    }
  }, navigationAfter);
  const insertText = (text, verify) => input([{type:'beforeinput',inputType:'insertText',data:text,textInput:true}], () => page.keyboard.insertText(text), verify);
  const keyDown = async key => {
    key = keyName(key);
    playwrightKeyIdentity(key);
    record.keys.add(key);
    await options.persistInputs();
    const modifiers = [...record.keys].reduce((bits,value) => bits | ({'modifier:Alt':1,'modifier:Control':2,'modifier:Meta':4,'modifier:Shift':8}[playwrightKeyIdentity(value)] ?? 0),0);
    const inputTypes = keyboardInputTypes(playwrightKeyIdentity(key),modifiers,process.platform === 'darwin');
    const events = [{type:'keydown',key:key === 'Space' ? ' ' : key,...(inputTypes.length ? {inputTypes} : {})}];
    // Locator text editors normalize Home/End without changing page/body scrolling
    // or replacing the trusted End/Home event with a different shortcut.
    if (process.platform === 'darwin' && request.keyboardEditable && ['Home','End'].includes(key)) {
      const modifiers = [...record.keys].reduce((bits,value) => bits | ({'modifier:Alt':1,'modifier:Control':2,'modifier:Meta':4,'modifier:Shift':8}[playwrightKeyIdentity(value)] ?? 0),0);
      await input(events, () => record.session.send('Input.dispatchKeyEvent',keyEventParameters(guestKeySpec(key),true,modifiers,true,true)));
    } else await input(events, () => page.keyboard.down(key));
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
    await input([{type:'pointerup',...record.pointer}],() => page.mouse.up({button}));
    record.buttons.delete(button);
  };
  const point = async value => {
    if (value.elementId !== undefined) return step(() => elementPoint(record, value,frameRouter,frameSend));
    return step(() => screenshotPoint(record, {...request, ...value}));
  };
  const move = async (value, animateMovement = true, resolved = false) => {
    const location = resolved ? value : await point(value);
    if (options.cursor) await step(() => options.cursor({...location, visible: true, animateMovement}));
    await input([{type:'pointermove',...location}], () => page.mouse.move(location.x, location.y), checkScreenshot);
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
      // Only the terminal unmodified release may finish in a new document.
      await input([{type:'pointerup',...record.pointer}],() => page.mouse.up({button,clickCount:index}),undefined,!click.keys.length && index === click.count);
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
  switch (request.action) {
    case 'navigationState': {
      const generation = record.documentGeneration;
      let result;
      try { result = await step(() => record.session.send('Runtime.evaluate', {
        expression:'({url:location.href,readyState:document.readyState})',returnByValue:true,
      })); }
      catch (error) {
        check();
        if (generation !== record.documentGeneration || /Cannot find context|Execution context was destroyed|Inspected target navigated/u.test(error.message))
          return {action:request.action,value:{url:page.url(),documentId:String(record.documentGeneration),navigationId:String(record.navigationGeneration ?? 0),readyState:'loading'}};
        throw error;
      }
      if (generation !== record.documentGeneration) return {action:request.action,value:{url:page.url(),documentId:String(record.documentGeneration),navigationId:String(record.navigationGeneration ?? 0),readyState:'loading'}};
      return {action:request.action,value:{...result.result.value,documentId:String(generation),navigationId:String(record.navigationGeneration ?? 0)}};
    }
    case 'domSnapshot': {
      const generation = record.documentGeneration;
      const result = await step(() => runCDPLocator(frameSend, {operation: 'domSnapshot', locator:request.locator ?? [], args: request.args ?? {}}, () => {}, frameRouter));
      if (generation !== record.documentGeneration) fail('STALE_OBSERVATION', 'Document changed during DOM snapshot');
      return {action: request.action, ...result};
    }
    case 'locator': {
      const args = request.args ?? {}, method = request.method;
      const click = ['click','dblclick'].includes(method) ? locatorClickParameters(args, {mac:process.platform === 'darwin',count:method === 'dblclick' ? 2 : 1}) : undefined;
      if (click) checkClickHeld(record, click);
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
      const checking = ['check', 'uncheck', 'setChecked'].includes(method);
      const checked = method === 'setChecked' ? args.checked : method === 'check';
      let performed;
      if (!checking || result.checked !== checked) {
        performed = await actOnPage(record, {action: checking ? 'click' : method === 'dblclick' ? 'doubleClick' : method === 'pressSequentially' ? 'type' : method,
          elementId: result.elementId, locatorGeneration: generation, button: args.button, key: click?.keys.length ? click.keys.join('+') : args.key, value: args.value,
          sequential:method === 'pressSequentially', deadline:request.deadline,
          keyboardEditable:result.keyboardEditable,
          signal: request.signal, inputMode: request.inputMode}, options);
        if (checking && await step(() => callElement(record, {elementId: result.elementId}, 'checked',{},frameOptions)) !== checked) fail('LOCATOR_ACTION_FAILED', 'Click did not produce the requested checked state');
      }
      return {action: request.action, value: null,...(performed?.observationRequired ? {observationRequired:true} : {})};
    }
    case 'navigate': {
      let url;
      try { url = new URL(request.url); } catch { fail('INVALID_ARGUMENT', 'navigate requires an absolute URL'); }
      if (!['http:', 'https:', 'about:', 'file:'].includes(url.protocol)) fail('INVALID_ARGUMENT', 'Unsupported navigation protocol');
      await navigate(() => page.goto(url.href, {waitUntil: 'domcontentloaded', timeout: options.timeoutMs}));
      break;
    }
    case 'back': await navigate(() => page.goBack({waitUntil: 'domcontentloaded', timeout: options.timeoutMs})); break;
    case 'forward': await navigate(() => page.goForward({waitUntil: 'domcontentloaded', timeout: options.timeoutMs})); break;
    case 'reload': await navigate(() => page.reload({waitUntil: 'domcontentloaded', timeout: options.timeoutMs})); break;
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
    case 'scroll': {
      let deltas = scrollDeltas(request), geometry;
      if (request.x !== undefined || request.elementId !== undefined) await move(request);
      const dimensions = async () => {
        const entry = elementFor(record,request);
        if (entry.route) await frameRouter.validate(entry.route);
        return readElementScrollGeometry(entry.route ? frameRouter.route(entry.route).send : frameSend,{backendNodeId:entry.backendNodeId,contextId:entry.route?.contextId});
      };
      if (!deltas) {geometry = await step(dimensions);deltas = scrollDeltas(request,geometry);}
      await input([{type:'wheel',...(record.pointer??{x:0,y:0}),...deltas}], () => page.mouse.wheel(deltas.deltaX,deltas.deltaY), async () => {
        await checkPointer();
        if (geometry) checkScrollGeometry(geometry,await dimensions());
      });
      break;
    }
    case 'drag': {
      const plan=dragPath(request.path,request.durationMs), waypoints=[];
      const button = buttonName(request.button);
      // Validate every explicit endpoint before acquiring input, then interpolate
      // in CSS pixels. Each dispatch still checks the original screenshot.
      for (const value of plan.waypoints) waypoints.push(await point(value));
      if (record.buttons.has(button)) fail('INPUT_ALREADY_HELD','Drag cannot acquire an already held mouse button');
      const {points,intervalMs}=dragPath(waypoints,request.durationMs);
      await move(points[0],true,true);
      await mouseDown(button);
      for (const value of points.slice(1)) {
        await step(() => holdClick(intervalMs,check));
        await move(value,false,true);
      }
      await mouseUp(button);
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
      if (request.sequential) {
        checkSequentialDeadline(request.deadline);
        for (const character of request.text) {const key=sequentialTextKey(character); if (key) checkPressHeld(record,[key],{identity:playwrightKeyIdentity});}
      }
      if (request.elementId !== undefined) await focusKeyboardElement();
      if (request.sequential) for (const character of request.text) {
        checkSequentialDeadline(request.deadline);
        const key=sequentialTextKey(character);
        if (key) {await keyDown(key); await keyUp(key);}
        else await insertText(character);
      }
      else await insertText(request.text);
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
    case 'fileChooserSetFiles':
    case 'upload': {
      const chooser = request.action === 'fileChooserSetFiles' ? await step(() => record.fileChoosers.entry(request.fileChooserId)) : undefined;
      const entry = chooser ?? elementFor(record, request);
      const send = frameOptions.wrapSend(entry.route?.send ?? ((method, params) => record.session.send(method, params)));
      const files = await uploadFiles(request.files,{allowString:!!chooser,check,step});
      const validate = async () => {
        check();
        if (entry.route) await frameRouter.validate(entry.route);
        if (chooser) await record.fileChoosers.entry(request.fileChooserId);
        else if (elementFor(record,request) !== entry) fail('STALE_ELEMENT','The file input changed; observe again');
        return validateFileInput(send,{backendNodeId:entry.backendNodeId,contextId:entry.route?.contextId,files});
      };
      await validate();
      let consumed = false,receipt;
      try {
        receipt = await input(files.length ? [{type:'input'}] : [],async () => {
          if (chooser) {record.fileChoosers.consume(chooser);consumed=true;}
          else await record.fileChoosers?.explicitUpload(entry);
          return writeFileInput(send,{backendNodeId:entry.backendNodeId,contextId:entry.route?.contextId,files});
        },validate);
      } finally {if (consumed) await record.fileChoosers.finish(chooser);}
      return {action:request.action,inputMode:'background',delivery:'target-cdp',effectVerified:receipt.cleared === true,...receipt};
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
  return {action: request.action, inputMode: 'background', delivery: 'target-cdp', effectVerified: false,
    ...(inputOccurrence !== undefined && inputOccurrence !== record.documentGeneration ? {observationRequired:true} : {})};
}

export async function releasePage(record, timeoutMs, {dismissDialogs = true, persistInputs} = {}) {
  if (record.page.isClosed() || record.crashed) {
    // Closing a page does not revoke its origin's browser-context permission.
    // Its own session may be gone; the backend retains a browser-level sender.
    let timer;
    try {
      await Promise.race([(async () => {
        await Promise.allSettled([...record.pending]);
        await restoreClipboardPermissions(record);
        // Late work may have journaled another intent after the lifecycle
        // event. A confirmed closed/crashed page cannot retain page input.
        record.keys.clear(); record.buttons.clear(); record.focusEmulated = false;
        await persistInputs?.();
      })(),new Promise((_,reject) => {timer=setTimeout(() => reject(new Error('Clipboard permission release is still in flight')),timeoutMs);})]);
      return [];
    } catch (error) {return [{targetId:record.id,code:error.code,error:error.message}];}
    finally {clearTimeout(timer);}
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
    try {await bounded(() => restoreClipboardPermissions(record));}
    catch (error) {failures.push({targetId:record.id,code:error.code,error:error.message});}
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
    if (record.page.isClosed() || record.crashed) return releasePage(record, Math.max(1,deadline-Date.now()), {dismissDialogs,persistInputs});
    return failures;
  } catch (error) {
    if (record.page.isClosed() || record.crashed) return releasePage(record, Math.max(1,deadline-Date.now()), {dismissDialogs,persistInputs});
    const dialog = guard?.dialog ?? record.dialogs?.read();
    return [{targetId:record.id,error:error.message,...(dialog ? {dialog} : {})}];
  } finally { clearTimeout(timer); guard?.finish(); dialogRelease?.finish(); }
}
