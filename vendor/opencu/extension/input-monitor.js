/** Require occurrence evidence before treating a lost CDP context as a changed view. */
export async function inputFrameFailure(error, {documentChanged, validate} = {}) {
  const protocol=error?.code===undefined || typeof error.code==='number' || error.details?.cdpError;
  const unavailable=/Cannot find (?:execution )?context with (?:(?:the )?(?:given|specified) )?id|(?:No|Missing) execution context|Execution context (?:with (?:(?:the )?(?:given|specified) )?id )?(?:was )?(?:destroyed|not found)|Could not find object with given id|Cannot find object with (?:given|specified) id|No session with (?:(?:the )?(?:given|specified) )?id|Session with given id not found|Session closed(?:[.:]|$)|Target (?:closed|detached)|Inspected target navigated or closed/iu;
  if (!protocol || !unavailable.test(error?.message ?? '')) return error;
  let code;
  if (documentChanged?.()) code='STALE_ELEMENT';
  else if (validate) try { await validate(); }
  catch (confirmation) {
    if (['FRAME_DETACHED','STALE_ELEMENT','STALE_OBSERVATION'].includes(confirmation?.code)) code='FRAME_DETACHED';
  }
  if (!code) return error;
  return Object.assign(new Error('The input document or frame changed; observe again before continuing', {cause:error}), {code,details:{...error.details}});
}

/** Exact trusted-input attribution shared by REA and native frame worlds. */
export function createPageInputMonitor(enqueue) {
  const expected = [];
  let pointerControl, pointerEffect;
  const pointerTarget = target => {
    const control=target?.closest?.('label')?.control ?? target?.closest?.('select') ?? target;
    if (control?.isConnected === false || control?.matches?.(':disabled')) return;
    return control?.tagName === 'SELECT' || control?.tagName === 'INPUT' && ['range','number','date','datetime-local','month','time','week','color'].includes(control.type) ? control : undefined;
  };
  const pointerDefault = (event,target,input) => {
    if (event.type === 'pointerdown') pointerControl=event.button === 0 ? {target:pointerTarget(target),pointerId:event.pointerId} : undefined;
    const control=pointerControl && pointerControl.pointerId === event.pointerId ? pointerControl.target : undefined;
    if (control && (event.type === 'pointerdown' || event.type === 'pointerup' || event.buttons & 1)) {
      const effect=pointerEffect={target:control,id:input.id,markerId:input.markerId,input:true,change:true};
      setTimeout(()=>{if(pointerEffect===effect)pointerEffect=undefined;},0);
    }
    if (event.type === 'pointerup') pointerControl=undefined;
  };
  const checkable = target => {
    const control = target?.closest?.('label')?.control ?? target;
    return control?.tagName === 'INPUT' && ['checkbox', 'radio'].includes(control.type) ? control : null;
  };
  let lastActivity = -Infinity, textInput;
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
    // Closed shadow editors expose their focused host to this event listener.
    // Bind that observable target; the exact beforeinput still proves the edit.
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

  const activity = event => {
    if (!event.isTrusted) return;
    const now = performance.now(), target = event.composedPath?.()[0] ?? event.target;
    for (let i = expected.length - 1; i >= 0; i--) if (expected[i].until < now) expected.splice(i, 1);
    if (['input','change'].includes(event.type) && pointerEffect && pointerEffect.target === pointerTarget(target) && pointerEffect[event.type] && (event.inputType == null || ['insertText','insertReplacementText'].includes(event.inputType))) {pointerEffect[event.type]=false;return;}
    if (event.type === 'beforeinput') {
      const input = expected.find(input => input.target === editTarget(target) && (
        input.textInput && input.inputType === event.inputType && input.data === event.data ||
        input.keyboardInput && input.inputTypes.includes(event.inputType)));
      // Every new edit starts a new transaction. An unmatched user beforeinput
      // must never inherit the previous native insertText's remaining events.
      cancelTextInput();
      if (input) {
        textInput = {...input,inputType:event.inputType};
        const active = textInput;
        // Chromium emits several input events for one multiline contenteditable
        // edit. They share this native task, even with microtasks between them.
        setTimeout(() => { if (textInput === active) textInput = undefined; }, 0);
      }
      return;
    }
    if (event.type === 'pointerdown' || event.type === 'keydown' || event.type === 'wheel') cancelTextInput();
    if (event.type === 'input' && textInput) {
      if (textInput.target === editTarget(target) && (textInput.inputType === event.inputType || textInput.controlInput && textInput.inputTypes.includes(event.inputType ?? null))) {if (textInput.controlInput) textInput = undefined;return;}
      cancelTextInput();
    }
    const index = expected.findIndex(input => input.type === event.type &&
      (input.target == null || input.target === target) &&
      (input.key == null || input.key === event.key || input.key === event.code) &&
      (input.type !== 'input' || input.inputTypes === undefined || input.inputTypes.includes(event.inputType ?? null)) &&
      (input.x == null || Math.abs(input.x - event.clientX) < 2 && Math.abs(input.y - event.clientY) < 2) &&
      (input.deltaY == null || Math.abs(input.deltaX - event.deltaX) < 1 && Math.abs(input.deltaY - event.deltaY) < 1));
    if (index !== -1) {
      const [input] = expected.splice(index, 1);
      if (['pointerdown','pointermove','pointerup'].includes(event.type)) pointerDefault(event,target,input);
      if (event.type === 'keydown') {
        const editor = textInputTarget();
        const native = keyboardControlInput(editor,event,input.inputTypes);
        if (native) {
          for (const target of native.targets) expected.push({type:'input',target,id:input.id,keyboardInput:true,controlInput:true,inputTypes:native.inputTypes,until:input.until});
        } else if (input.inputTypes?.length && checkable(editor)) {
          // Space activation completes on keyup; the existing click transaction
          // owns only that control's later default input, never arbitrary text.
          if ([' ','Enter'].includes(event.key)) expected.push({type:'click',target:editor,until:input.until});
        } else if (editor && input.inputTypes?.length) expected.push({type:'input',target:editor,id:input.id,keyboardInput:true,
          inputTypes:input.inputTypes,until:input.until});
      } else if (event.type === 'pointerdown' && event.button === 0) {
        const control = checkable(target);
        if (control) expected.push({type:'click', target:control, id:input.id, until:input.until});
      } else if (event.type === 'click') {
        // Checkbox/radio default activation emits trusted input after click, including labels.
        const marker = {type:'input', target, id:input.id, until:input.until};
        expected.push(marker);
        setTimeout(() => { const index = expected.indexOf(marker); if (index !== -1) expected.splice(index, 1); }, 0);
      }
      return;
    }
    if (['pointerdown','pointermove','pointerup','pointercancel','keydown','wheel'].includes(event.type)) {pointerControl=undefined;pointerEffect=undefined;}
    if (['click','change','pointermove','pointerup','pointercancel'].includes(event.type)) return;
    if (event.type === 'pointerdown' || event.type === 'keydown') {
      for (let i = expected.length - 1; i >= 0; i--) if (expected[i].type === 'click') expected.splice(i, 1);
    }
    if (now - lastActivity < 250) return;
    lastActivity = now;
    enqueue({ type: 'opencu-user-activity', kind: event.type });
  };
  const inputEvents = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'keydown', 'wheel', 'beforeinput', 'input', 'change', 'click'];
  for (const type of inputEvents) window.addEventListener(type, activity, true);
  return {
    expectInput(events, pending = false) {
      const id = crypto.randomUUID(), until = pending ? Infinity : performance.now() + 1500;
      expected.push(...events.map(event => ({ ...event, id, until })));
      return id;
    },
    expectTextInput(text) {
      const target = textInputTarget();
      if (!target || typeof text !== 'string') return;
      const id = crypto.randomUUID();
      expected.push({type:'beforeinput',inputType:'insertText',data:text,target,textInput:true,id,until:performance.now()+1500});
      return id;
    },
    clearInput() { expected.length = 0; textInput = undefined; pointerControl=undefined; pointerEffect=undefined; },
    finishInput(id, dispatched) {
      if (pointerEffect?.id === id) pointerEffect=undefined;
      if (textInput?.id === id) textInput = undefined;
      for (let i = expected.length - 1; i >= 0; i--) if (expected[i].id === id) {
        if (dispatched && !expected[i].textInput && !expected[i].keyboardInput && !['keydown','pointerdown','pointermove','pointerup'].includes(expected[i].type)) expected[i].until = performance.now() + 1500;
        else expected.splice(i, 1);
      }
    },
    dispose() {
      for (const type of inputEvents) window.removeEventListener(type, activity, true);
      expected.length = 0; textInput = undefined; pointerControl=undefined; pointerEffect=undefined;
    },
  };
}
