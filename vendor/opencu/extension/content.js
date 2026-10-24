export function installDocumentRuntime({trackActivity = true} = {}) {
  if (globalThis.__opencuDocument) return;
  const randomId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  const documentId = randomId();
  let revision = 0, activitySequence = 0, userActivity, textInput;
  const expected = [];
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
    return control?.tagName === 'INPUT' && ['checkbox','radio'].includes(control.type) ? control : null;
  };

  const automated = event => {
    const now = performance.now();
    for (let i = expected.length - 1; i >= 0; i--) if (expected[i].expires < now) expected.splice(i, 1);
    const target = event.composedPath?.()[0] ?? event.target;
    if (event.type === 'beforeinput') {
      const input = expected.find(input => input.target === editTarget(target) && (
        input.textInput && input.inputType === event.inputType && input.data === event.data ||
        input.keyboardInput && input.inputTypes.includes(event.inputType)));
      cancelTextInput();
      if (input) {
        textInput = {...input,inputType:event.inputType};
        const active = textInput;
        setTimeout(() => { if (textInput === active) textInput = undefined; }, 0);
      }
      return true;
    }
    if (event.type === 'pointerdown' || event.type === 'keydown' || event.type === 'wheel') cancelTextInput();
    if (event.type === 'input' && textInput) {
      if (textInput.target === editTarget(target) && (textInput.inputType === event.inputType || textInput.controlInput && textInput.inputTypes.includes(event.inputType ?? null))) {if (textInput.controlInput) textInput = undefined;return true;}
      cancelTextInput();
    }
    const index = expected.findIndex(item => item.type === event.type &&
      (item.key === undefined || item.key === event.key || item.key === event.code) &&
      (item.target === undefined || item.target === target) &&
      (item.type !== 'input' || item.inputTypes === undefined || item.inputTypes.includes(event.inputType ?? null)) && (item.x === undefined || Math.abs(item.x - event.clientX) <= 2 && Math.abs(item.y - event.clientY) <= 2) &&
      (item.deltaY === undefined || Math.abs(item.deltaX - event.deltaX) < 1 && Math.abs(item.deltaY - event.deltaY) < 1));
    if (index < 0) {
      if (['pointerdown','keydown'].includes(event.type)) for (let i=expected.length-1;i>=0;i--) if(expected[i].type==='click')expected.splice(i,1);
      return event.type === 'click';
    }
    const [input] = expected.splice(index,1);
    if (event.type === 'keydown') {
      const editor = textInputTarget();
      const native = keyboardControlInput(editor,event,input.inputTypes);
      if (native) {
        for (const target of native.targets) expected.push({type:'input',target,markerId:input.markerId,keyboardInput:true,controlInput:true,inputTypes:native.inputTypes,expires:input.expires});
      } else if (input.inputTypes?.length && editor?.tagName === 'INPUT' && ['checkbox','radio'].includes(editor.type)) {
        if ([' ','Enter'].includes(event.key)) expected.push({type:'click',target:editor,expires:input.expires});
      } else if (editor && input.inputTypes?.length) expected.push({type:'input',target:editor,markerId:input.markerId,keyboardInput:true,
        inputTypes:input.inputTypes,expires:input.expires});
    } else if (event.type === 'pointerdown' && event.button === 0) {
      const control = checkable(target);
      if (control) expected.push({type:'click',target:control,markerId:input.markerId,expires:input.expires});
    } else if (event.type === 'click') {
      const marker = {type:'input',target,expires:input.expires};expected.push(marker);
      setTimeout(() => {const index=expected.indexOf(marker);if(index!==-1)expected.splice(index,1);},0);
    }
    return true;
  };
  if (trackActivity) for (const type of ['pointerdown', 'keydown', 'beforeinput', 'input', 'wheel', 'click']) addEventListener(type, event => {
    if (!event.isTrusted || automated(event)) return;
    userActivity = { documentId, sequence: ++activitySequence, kind: type, at: new Date().toISOString() };
  }, true);
  const geometry = () => {
    const viewport = visualViewport;
    return { width: innerWidth, height: innerHeight, scrollX, scrollY, devicePixelRatio,
      visual: { x: viewport?.offsetLeft || 0, y: viewport?.offsetTop || 0, width: viewport?.width || innerWidth,
        height: viewport?.height || innerHeight, scale: viewport?.scale || 1 }, revision };
  };
  const cursorMutation = node => node.nodeType === 1 && (node.hasAttribute('data-opencu-cursor') || node.closest('[data-opencu-cursor]'));
  const mutation = new MutationObserver(records => {
    if (records.some(record => !cursorMutation(record.target) && (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node => !cursorMutation(node))))) revision++;
  });
  mutation.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  for (const event of ['scroll', 'resize']) addEventListener(event, () => revision++, true);
  visualViewport?.addEventListener('resize', () => revision++);
  globalThis.__opencuDocument = { run(method, input = {}) {
    if (input.documentId && input.documentId !== documentId) throw Object.assign(new Error('Document changed; select again.'), { code: 'STALE_DOCUMENT' });
    switch (method) {
      case 'identity': return { documentId, url: location.href, title: document.title, geometry: geometry(), userActivity };
      case 'expectInput': {
        const markerId = randomId();
        for (const event of input.events ?? []) expected.push({ ...event, ...(input.targetActive ? {target:textInputTarget()} : {}), markerId, expires: input.pending ? Infinity : performance.now() + 500 });
        return { expected: true, markerId, documentId };
      }
      case 'expectTextInput': {
        const target = textInputTarget(), markerId = randomId();
        if (target && typeof input.text === 'string') expected.push({type:'beforeinput',inputType:'insertText',data:input.text,target,textInput:true,markerId,expires:performance.now()+500});
        return {expected:true,markerId,documentId};
      }
      case 'finishInput':
        if (textInput?.markerId === input.markerId) textInput = undefined;
        for (let i = expected.length - 1; i >= 0; i--) if (expected[i].markerId === input.markerId) {
          if (input.dispatched && !expected[i].textInput && !expected[i].keyboardInput && expected[i].type !== 'keydown') expected[i].expires = performance.now() + 500;
          else expected.splice(i, 1);
        }
        return { finished: true };
      case 'cursor':
        if (!globalThis.__opencuCursor) throw Object.assign(new Error('The original REA cursor runtime did not load.'), { code: 'CURSOR_UNAVAILABLE' });
        return globalThis.__opencuCursor.update({ ...input, waitForArrival: true });
      case 'release': expected.length = 0; textInput = undefined; void globalThis.__opencuCursor?.update({ visible: false }); return { released: true };
      default: throw Object.assign(new Error('Unknown content operation.'), { code: 'UNSUPPORTED_OPERATION' });
    }
  } };
}
