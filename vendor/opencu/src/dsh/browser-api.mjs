/** Serializable locators; each retry resolves the current document, never replays uncertain input. */
export function createPlaywrightAPI(invoke, display, context = {}) {
  const string = (value, name) => {
    if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
    return value;
  };
  const matcher = (value, name) => {
    if (typeof value === 'string') return value;
    if (Object.prototype.toString.call(value) === '[object RegExp]') return {type: 'regex', source: value.source, flags: value.flags};
    throw new TypeError(`${name} must be a string or RegExp`);
  };
  const pause = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal?.addEventListener('abort', abort, {once: true});
  });
  const locator = (steps = []) => {
    const append = step => locator([...steps, step]);
    const run = async (method, options = {}) => {
      if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Locator options must be an object');
      const {timeoutMs = 10000, ...args} = options;
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 300000) throw new TypeError('timeoutMs must be an integer from 0 to 300000');
      const deadline = timeoutMs === 0 ? Infinity : Date.now() + timeoutMs;
      const immediate = ['count', 'allTextContents', 'isVisible'].includes(method);
      let lastError;
      for (;;) {
        const signal = context.signal?.(); signal?.throwIfAborted();
        try {
          const value = await invoke('locator', {locator: steps, method, args});
          if (method !== 'waitFor') return value;
          if (value === true) return;
          lastError = {code: 'LOCATOR_NOT_READY', message: `Element is not ${args.state ?? 'visible'}`};
        } catch (error) {
          if (immediate || error.details?.inputDispatched !== false || !['LOCATOR_NOT_FOUND','LOCATOR_NOT_ACTIONABLE','LOCATOR_NOT_STABLE','STALE_ELEMENT','STALE_OBSERVATION','FRAME_NOT_FOUND','FRAME_DETACHED'].includes(error.code)) throw error;
          lastError = {code: error.code, message: error.message};
        }
        if (Date.now() >= deadline) throw Object.assign(new Error(`Locator ${method} timed out after ${timeoutMs}ms: ${lastError.message}`),
          {code: 'LOCATOR_TIMEOUT', details: {timeoutMs, lastError, inputDispatched: false}});
        await pause(Math.min(100, Math.max(1, deadline - Date.now())), signal);
      }
    };
    const api = {
      domSnapshot: async (options = {}) => { const {emit, ...args} = options; const value = await invoke('domSnapshot', {locator:steps,args}); return display(value, emit !== false); },
      frameLocator: selector => append({kind: 'frame', value: string(selector, 'frame selector')}),
      getByRole: (role, options = {}) => append({...options, kind: 'role', value: string(role, 'role'), ...(options.name !== undefined ? {name: matcher(options.name, 'name')} : {})}),
      getByText: (value, options = {}) => append({...options, kind: 'text', value: matcher(value, 'text')}),
      getByLabel: (value, options = {}) => append({...options, kind: 'label', value: matcher(value, 'label')}),
      getByPlaceholder: (value, options = {}) => append({...options, kind: 'placeholder', value: matcher(value, 'placeholder')}),
      getByTestId: value => append({kind: 'testId', value: matcher(value, 'testId')}),
      locator: value => append({kind: 'css', value: string(value, 'selector')}),
      filter: (options = {}) => {
        for (const key of Object.keys(options)) if (!['hasText', 'hasNotText', 'visible'].includes(key)) throw new Error(`Unsupported locator filter: ${key}`);
        return append({kind: 'filter', ...options,
          ...(options.hasText !== undefined ? {hasText: matcher(options.hasText, 'hasText')} : {}),
          ...(options.hasNotText !== undefined ? {hasNotText: matcher(options.hasNotText, 'hasNotText')} : {})});
      },
      nth: index => { if (!Number.isSafeInteger(index) || index < 0) throw new TypeError('nth requires a non-negative integer'); return append({kind: 'nth', index}); },
      first: () => append({kind: 'nth', index: 0}),
      last: () => append({kind: 'nth', index: -1}),
      fill: (value, options = {}) => run('fill', {...options, value: string(value, 'value')}),
      press: (key, options = {}) => run('press', {...options, key: string(key, 'key')}),
      getAttribute: (name, options = {}) => run('getAttribute', {...options, name: string(name, 'name')}),
      setChecked: (checked, options = {}) => { if (typeof checked !== 'boolean') throw new TypeError('checked must be boolean'); return run('setChecked', {...options, checked}); },
      selectOption: (value, options = {}) => run('selectOption', {...options, value}),
      waitFor: (options = {}) => run('waitFor', {state: 'visible', ...options}),
    };
    for (const method of ['count', 'innerText', 'textContent', 'allTextContents', 'isVisible', 'isEnabled', 'click', 'dblclick', 'check', 'uncheck']) api[method] = (options = {}) => run(method, options);
    return api;
  };
  return locator();
}
