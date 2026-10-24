const worldName = 'opencu-user-activity';

function installMonitor() {
  if (globalThis.opencuActivity) return;
  const documentId = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join(''), expected = [], listeners = [];
  let sequence = 0, activity, textInput, nextInput = 0;
  const cancelTextInput = () => {
    textInput = undefined;
    for (let i = expected.length - 1; i >= 0; i--) if (expected[i].textInput || expected[i].keyboardInput) expected.splice(i, 1);
  };
  const editTarget = target => {
    if (target?.isContentEditable) while (target.parentElement?.isContentEditable) target = target.parentElement;
    return target;
  };
  const textInputTarget = () => {
    let target = document.activeElement;
    while (target?.shadowRoot?.activeElement) target = target.shadowRoot.activeElement;
    target = editTarget(target);
    return target?.nodeType === 1 ? target : null;
  };
  // Native value controls emit plain input Events rather than text InputEvents.
  // Bind only controls selected by this confirmed physical key; radio navigation
  // may move to another enabled member of the same tree/form/name group.
  const keyboardControlInput = (control,event,inputTypes = []) => {
    if (!control || control.isConnected === false || control.matches?.(':disabled')) return {targets:[],inputTypes:[]};
    const code = event.code ?? '', navigation = /^(?:Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown|Space|Enter|NumpadEnter)$/u.test(code);
    const textKey = inputTypes.includes('insertText');
    if (control.tagName === 'SELECT') {
      const selectAll = control.multiple && code === 'KeyA' && (event.ctrlKey || event.metaKey);
      return {targets:navigation || textKey || selectAll ? [control] : [],inputTypes:[null]};
    }
    if (control.tagName !== 'INPUT') return;
    const type = control.type;
    if (type === 'radio' && /^Arrow(?:Up|Down|Left|Right)$/u.test(code)) {
      const root = control.getRootNode?.();
      const targets = !control.name || !root?.querySelectorAll ? [control] : [...root.querySelectorAll('input[type="radio"]')].filter(candidate =>
        candidate.type === 'radio' && candidate.name === control.name && candidate.form === control.form &&
        candidate.getRootNode() === root && candidate.isConnected !== false && !candidate.matches(':disabled'));
      return {targets,inputTypes:[null]};
    }
    const nativeTypes = ['range','number','date','datetime-local','month','time','week'];
    if (!nativeTypes.includes(type)) return;
    const changesValue = type === 'range' ? navigation : type === 'number' ? /^(?:ArrowUp|ArrowDown)$/u.test(code) || inputTypes.length > 0 : navigation || inputTypes.length > 0;
    // Native steppers may pair text beforeinput with a plain input Event.
    return {targets:changesValue ? [control] : [],inputTypes:[...inputTypes,...(type !== 'range' && navigation ? ['insertText'] : []),null]};
  };

  const checkable = target => {
    const control = target?.closest?.('label')?.control ?? target;
    return control?.tagName === 'INPUT' && ['checkbox', 'radio'].includes(control.type) ? control : null;
  };
  const matches = (item, event) => item.type === event.type &&
    (item.target === undefined || item.target === (event.composedPath?.()[0] ?? event.target)) &&
    (item.key === undefined || item.key === event.key || item.key === event.code) &&
    (item.type !== 'input' || item.inputTypes === undefined || item.inputTypes.includes(event.inputType ?? null)) &&
    (item.x === undefined || Math.abs(item.x - event.clientX) <= 2 && Math.abs(item.y - event.clientY) <= 2);
  for (const type of ['pointerdown', 'keydown', 'beforeinput', 'input', 'wheel', 'click']) {
    const listener = event => {
      if (!event.isTrusted) return;
      const now = performance.now();
      for (let i = expected.length - 1; i >= 0; i--) if (expected[i].expires < now) expected.splice(i, 1);
      const target = event.composedPath?.()[0] ?? event.target;
      if (type === 'beforeinput') {
        const input = expected.find(input => input.target === editTarget(target) && (
          input.textInput && input.inputType === event.inputType && input.data === event.data ||
          input.keyboardInput && input.inputTypes.includes(event.inputType)));
        cancelTextInput();
        if (input) {
          textInput = {...input,inputType:event.inputType};
          const active = textInput;
          setTimeout(() => { if (textInput === active) textInput = undefined; }, 0);
        }
        return;
      }
      if (type === 'pointerdown' || type === 'keydown' || type === 'wheel') cancelTextInput();
      if (type === 'input' && textInput) {
        if (textInput.target === editTarget(target) && (textInput.inputType === event.inputType || textInput.controlInput && textInput.inputTypes.includes(event.inputType ?? null))) {if (textInput.controlInput) textInput = undefined;return;}
        cancelTextInput();
      }
      const index = expected.findIndex(item => matches(item, event));
      if (index >= 0) {
        const [input] = expected.splice(index, 1);
        if (event.type === 'keydown') {
          const editor = textInputTarget();
          const native = keyboardControlInput(editor,event,input.inputTypes);
          if (native) {
            for (const target of native.targets) expected.push({type:'input',target,id:input.id,keyboardInput:true,controlInput:true,inputTypes:native.inputTypes,expires:input.expires});
          } else if (input.inputTypes?.length && checkable(editor)) {
            // Space activation completes on keyup; the existing click transaction
            // owns only that control's later default input, never arbitrary text.
            if ([' ','Enter'].includes(event.key)) expected.push({type:'click',target:editor,expires:input.expires});
          } else if (editor && input.inputTypes?.length) expected.push({type:'input',target:editor,id:input.id,keyboardInput:true,
            inputTypes:input.inputTypes,expires:input.expires});
        } else if (event.type === 'pointerdown' && event.button === 0) {
          const control = checkable(target);
          if (control) expected.push({type:'click', target:control, expires:input.expires});
        } else if (event.type === 'click') {
          const marker = {type:'input', target, expires:input.expires};
          expected.push(marker);
          setTimeout(() => { const index = expected.indexOf(marker); if (index !== -1) expected.splice(index, 1); }, 0);
        }
        return;
      }
      if (event.type === 'click') return;
      if (event.type === 'pointerdown' || event.type === 'keydown') {
        for (let i = expected.length - 1; i >= 0; i--) if (expected[i].type === 'click') expected.splice(i, 1);
      }
      activity = {documentId, sequence: ++sequence, kind: type, at: new Date().toISOString()};
    };
    addEventListener(type, listener, true); listeners.push([type, listener]);
  }
  globalThis.opencuActivity = {
    read: () => activity ?? null,
    expect(events) {
      const id = ++nextInput;
      let markedText = false;
      for (const event of events) {
        if (event.textInput) {
          const target = textInputTarget();
          if (!target) continue;
          expected.push({...event,target,id,expires:performance.now()+500}); markedText = true;
        } else {expected.push({...event,id,expires:performance.now()+500});if (event.type === 'keydown') markedText = true;}
      }
      return markedText ? {documentId,id} : undefined;
    },
    finish(marker) {
      if (marker?.documentId !== documentId) return;
      if (textInput?.id === marker.id) textInput = undefined;
      for (let i = expected.length - 1; i >= 0; i--) if (expected[i].id === marker.id) expected.splice(i, 1);
    },
    dispose() {
      for (const [type, listener] of listeners) removeEventListener(type, listener, true);
      expected.length = 0; textInput = undefined;
      delete globalThis.opencuActivity;
    },
  };
}

/** A separate Chromium world observes real input without exposing hooks to the site. */
export async function createUserActivityMonitor(session, {onAcquire} = {}) {
  const source = `(${installMonitor.toString()})()`;
  const {identifier} = await session.send('Page.addScriptToEvaluateOnNewDocument', {source, worldName});
  async function evaluate(expression, install = true) {
    const {frameTree} = await session.send('Page.getFrameTree');
    const {executionContextId} = await session.send('Page.createIsolatedWorld', {frameId: frameTree.frame.id, worldName});
    async function run(expression) {
      const result = await session.send('Runtime.evaluate', {contextId: executionContextId, expression, returnByValue: true});
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    }
    if (!install) return run(expression);
    // The initial setup and new-document script normally own the monitor. Only
    // reinstall when this live world has none; the missing branch runs no work.
    const current = await run(`globalThis.opencuActivity ? {value:(${expression})} : null`);
    if (current === null) return run(`${source};${expression}`);
    return current?.value;
  }
  let scriptRemoved = false, disposed = false, disposing;
  const monitor = {
    read: () => evaluate('globalThis.opencuActivity.read()'),
    expect: events => evaluate(`globalThis.opencuActivity.expect(${JSON.stringify(events)})`),
    finish: marker => evaluate(`globalThis.opencuActivity.finish(${JSON.stringify(marker)})`),
    dispose() {
      if (disposed) return Promise.resolve();
      return disposing ??= (async () => {
        if (!scriptRemoved) {
          await session.send('Page.removeScriptToEvaluateOnNewDocument', {identifier});
          scriptRemoved = true;
        }
        await evaluate('globalThis.opencuActivity && globalThis.opencuActivity.dispose()', false);
        disposed = true;
      })().finally(() => { disposing = undefined; });
    },
  };
  // Registration must retain the cleanup handle before current-document setup can fail.
  onAcquire?.(monitor);
  await evaluate(`${source};null`, false);
  return monitor;
}
