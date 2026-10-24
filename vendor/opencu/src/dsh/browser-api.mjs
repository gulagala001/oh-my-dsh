import {validateSelectOptions} from '../../extension/select-options.js';

/** Serializable locators; each retry resolves the current document, never replays uncertain input. */
export function createPlaywrightAPI(invoke, display, context = {}) {
  const locators = new WeakMap();
  const optionsObject = (value, booleanKeys = []) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Locator options must be an object');
    for (const key of booleanKeys) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new TypeError(`${key} must be a boolean`);
    return value;
  };
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
    const relative = (other, name) => {
      const inner = other && typeof other === 'object' && locators.get(other);
      if (!inner) throw new TypeError(`${name} requires a Locator from the same target`);
      const frameEnd = chain => chain.findLastIndex(step => step.kind === 'frame') + 1;
      const outerEnd = frameEnd(steps), innerEnd = frameEnd(inner);
      if (JSON.stringify(steps.slice(0, outerEnd)) !== JSON.stringify(inner.slice(0, innerEnd))) throw new TypeError(`${name} requires Locators in the same frame`);
      return inner.slice(innerEnd);
    };
    const run = async (method, options = {}) => {
      optionsObject(options);
      const {timeoutMs = 10000, ...args} = options;
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 300000) throw new TypeError('timeoutMs must be an integer from 0 to 300000');
      if (['click', 'dblclick'].includes(method) && args.button !== undefined && !['left', 'middle', 'right'].includes(args.button)) throw new TypeError('click button must be left, middle, or right');
      if (method === 'waitFor' && args.state !== undefined && !['attached', 'detached', 'visible', 'hidden'].includes(args.state)) throw new TypeError('waitFor state must be attached, detached, visible, or hidden');
      const deadline = timeoutMs === 0 ? Infinity : Date.now() + timeoutMs;
      const immediate = ['count', 'allTextContents', 'isVisible'].includes(method);
      let lastError;
      const checkDeadline = () => {
        if (lastError && Date.now() >= deadline) throw Object.assign(new Error(`Locator ${method} timed out after ${timeoutMs}ms: ${lastError.message}`),
          {code: 'LOCATOR_TIMEOUT', details: {timeoutMs, lastError, inputDispatched: false}});
      };
      for (;;) {
        const signal = context.signal?.(); signal?.throwIfAborted();
        checkDeadline();
        try {
          const value = await invoke('locator', {locator: steps, method, args,
            ...(method === 'pressSequentially' && Number.isFinite(deadline) ? {deadline} : {})});
          if (method !== 'waitFor') return value;
          if (value === true) return;
          lastError = {code: 'LOCATOR_NOT_READY', message: `Element is not ${args.state ?? 'visible'}`};
        } catch (error) {
          if (immediate || error.details?.inputDispatched !== false || !['LOCATOR_NOT_FOUND','LOCATOR_NOT_ACTIONABLE','LOCATOR_NOT_STABLE','STALE_ELEMENT','STALE_OBSERVATION','FRAME_NOT_FOUND','FRAME_DETACHED'].includes(error.code)) throw error;
          lastError = {code: error.code, message: error.message};
        }
        checkDeadline();
        await pause(Math.min(100, Math.max(1, deadline - Date.now())), signal);
      }
    };
    const api = {
      domSnapshot: async (options = {}) => { const {emit, ...args} = optionsObject(options); const value = await invoke('domSnapshot', {locator:steps,args}); return display(value, emit !== false); },
      frameLocator: selector => append({kind: 'frame', value: string(selector, 'frame selector')}),
      getByRole: (role, options = {}) => append({...optionsObject(options, ['exact']), kind: 'role', value: string(role, 'role'), ...(options.name !== undefined ? {name: matcher(options.name, 'name')} : {})}),
      getByText: (value, options = {}) => append({...optionsObject(options, ['exact']), kind: 'text', value: matcher(value, 'text')}),
      getByLabel: (value, options = {}) => append({...optionsObject(options, ['exact']), kind: 'label', value: matcher(value, 'label')}),
      getByPlaceholder: (value, options = {}) => append({...optionsObject(options, ['exact']), kind: 'placeholder', value: matcher(value, 'placeholder')}),
      getByTestId: value => append({kind: 'testId', value: matcher(value, 'testId')}),
      locator: (value, options) => {
        if (options !== undefined) throw new TypeError('locator supports only a CSS selector; use .locator(css).filter({has, hasNot, hasText, hasNotText, visible}) for filters');
        return append({kind: 'css', value: string(value, 'selector')});
      },
      filter: (options = {}) => {
        optionsObject(options, ['visible']);
        for (const key of Object.keys(options)) if (!['has', 'hasNot', 'hasText', 'hasNotText', 'visible'].includes(key)) throw new Error(`Unsupported locator filter: ${key}`);
        return append({kind: 'filter', ...options,
          ...(options.has !== undefined ? {has: relative(options.has, 'has')} : {}),
          ...(options.hasNot !== undefined ? {hasNot: relative(options.hasNot, 'hasNot')} : {}),
          ...(options.hasText !== undefined ? {hasText: matcher(options.hasText, 'hasText')} : {}),
          ...(options.hasNotText !== undefined ? {hasNotText: matcher(options.hasNotText, 'hasNotText')} : {})});
      },
      and: other => append({kind:'and', locator:relative(other, 'and')}),
      or: other => append({kind:'or', locator:relative(other, 'or')}),
      all: async () => Array.from({length:await run('count')}, (_,index) => append({kind:'nth',index})),
      nth: index => { if (!Number.isSafeInteger(index) || index < 0) throw new TypeError('nth requires a non-negative integer'); return append({kind: 'nth', index}); },
      first: () => append({kind: 'nth', index: 0}),
      last: () => append({kind: 'nth', index: -1}),
      fill: (value, options = {}) => run('fill', {...optionsObject(options), value: string(value, 'value')}),
      type: (value, options = {}) => run('type', {...optionsObject(options), value: string(value, 'value')}),
      pressSequentially: (value, options = {}) => run('pressSequentially', {...optionsObject(options), value: string(value, 'value')}),
      press: (key, options = {}) => run('press', {...optionsObject(options), key: string(key, 'key')}),
      getAttribute: (name, options = {}) => run('getAttribute', {...optionsObject(options), name: string(name, 'name')}),
      setChecked: (checked, options = {}) => { if (typeof checked !== 'boolean') throw new TypeError('checked must be boolean'); return run('setChecked', {...optionsObject(options), checked}); },
      selectOption: (value, options = {}) => run('selectOption', {...optionsObject(options), value:validateSelectOptions(value)}),
      waitFor: (options = {}) => run('waitFor', {state: 'visible', ...optionsObject(options)}),
    };
    for (const method of ['count', 'innerText', 'textContent', 'allTextContents', 'isVisible', 'isEnabled', 'click', 'dblclick', 'check', 'uncheck']) api[method] = (options = {}) => run(method, options);
    locators.set(api, steps);
    if (!steps.length && context.navigation) for (const name of ['expectNavigation','waitForURL','waitForLoadState','waitForEvent']) {
      if (typeof context.navigation[name] === 'function') api[name] = context.navigation[name];
    }
    return api;
  };
  return locator();
}
