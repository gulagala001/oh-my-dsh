import { start } from 'node:repl';
import { PassThrough } from 'node:stream';
import { AsyncLocalStorage } from 'node:async_hooks';
import { computerDocumentation } from './computer-docs.mjs';
import { modelResult } from './model-output.mjs';
import { createObservationProjector } from './observation-output.mjs';
import { createPlaywrightAPI } from './browser-api.mjs';

function checked(result) {
  if (result?.ok === false) throw Object.assign(new Error(result.error.message), result.error);
  return result;
}

/** A fresh Node REPL context gives persistent lexical bindings and native top-level await. */
export function createComputerSession(request) {
  let repl, current, closing, closed = false, releaseOnClose = false, generation = 0, tail = Promise.resolve();
  const pending = new Set(), heldInputs = new Set(), execution = new AsyncLocalStorage();
  const outputs = [], images = [], deliveries = [];
  const returned = new Set(), documentationSeen = new Set(), documentationInCell = new Set();
  const observations = createObservationProjector();
  const displayed = value => { returned.add(value); return value; };
  function activeExecution() {
    const run = execution.getStore();
    if (!current || run !== current) throw new Error('Computer API calls must be awaited inside the active computer_use call');
    run.signal.throwIfAborted();
    return run;
  }
  async function call(endpoint, args) {
    const run = activeExecution();
    const action = endpoint === 'act' ? args.action : null;
    const key = ['keyDown', 'key_down', 'keyUp', 'key_up'].includes(action) ? JSON.stringify([args.targetId, 'key', args.key])
      : ['mouseDown', 'mouse_down', 'mouseUp', 'mouse_up'].includes(action) ? JSON.stringify([args.targetId, 'button', args.button ?? 'left']) : null;
    if (['keyDown', 'key_down', 'mouseDown', 'mouse_down'].includes(action)) heldInputs.add(key);
    const work = request(endpoint, args).then(checked).then(result => {
      if (['keyUp', 'key_up', 'mouseUp', 'mouse_up'].includes(action)) heldInputs.delete(key);
      if (endpoint === 'stop') heldInputs.clear();
      return endpoint === 'observe' ? result : modelResult(result, args);
    });
    pending.add(work);
    try { const result = await work; run.signal.throwIfAborted(); return result; }
    finally { pending.delete(work); }
  }
  function emit(value) { activeExecution(); outputs.push(typeof value === 'string' ? value : JSON.stringify(value)); }
  function documentation(topic, force = false) {
    const text = computerDocumentation(topic);
    if ((force || !documentationSeen.has(topic)) && !documentationInCell.has(topic)) { emit(text); documentationSeen.add(topic); documentationInCell.add(topic); }
    return displayed(text);
  }
  function targetAPI(target) {
    let last, api;
    const observe = async (format, options = {}) => {
      const raw = await call('observe', { targetId: target.id, format });
      const { id, observationId, coordinateSpace, screenshot } = raw.observation;
      last = { id, observationId, coordinateSpace, screenshot };
      const result = modelResult(observations.project(raw, { ...options, targetId: target.id, format }), { ...options, format });
      if (options.emit !== false) {
        if (result.userActivity) emit({ userActivity: result.userActivity, observedUserActivitySequence: result.observedUserActivitySequence,
          notice: 'The user interacted with this target. This is information, not a takeover or a stop; use the fresh observation before continuing.' });
        if (raw.observation.userActivityMonitoring?.available === false) emit({ userActivityMonitoring: raw.observation.userActivityMonitoring,
          notice: 'User activity monitoring is unavailable for this target; see the reported backend reason. This is not a control lock; observe the current window before continuing.' });
        if (format !== 'screenshot' && result.observation.ax) emit(result.observation.ax);
        if (result.image) images.push(result.image);
      }
      return result;
    };
    const act = async (action, args = {}) => {
      const shot = last?.screenshot, image = shot?.image;
      const payload = { targetId: target.id, action, observationId: last?.id ?? last?.observationId,
        screenshotId: shot?.id, mappingId: shot?.mappingId,
        coordinateSpace: shot ? 'screenshot-pixels' : last?.coordinateSpace,
        previewWidth: image?.width ?? shot?.width, previewHeight: image?.height ?? shot?.height, ...args };
      if (target.backend === 'native' && shot && image) {
        for (const key of ['x', 'fromX']) if (payload[key] != null) payload[key] *= shot.width / image.width;
        for (const key of ['y', 'fromY']) if (payload[key] != null) payload[key] *= shot.height / image.height;
        if (payload.path) payload.path = payload.path.map(point => ({ x: point.x * shot.width / image.width, y: point.y * shot.height / image.height }));
      }
      const result = await call('act', payload);
      if (result.result?.target) {
        target = result.result.target; api.id = target.id; api.target = target;
      }
      if (['navigate', 'back', 'forward', 'reload', 'closeTab'].includes(action)) { observations.reset(); last = undefined; }
      return result;
    };
    const point = value => Array.isArray(value) ? { x: value[0], y: value[1] } : { elementId: value };
    const clickOptions = (options = {}) => {
      if (options.key !== undefined || options.durationMs !== undefined) throw new Error('This backend wrapper does not support held click modifiers/duration; inspect control capabilities');
      return {...options, ...(options.mouseButton ? {button: options.mouseButton} : {})};
    };
    const input = (action, value, second) => {
      if (target.backend === 'native' && second !== undefined) throw new TypeError('Native typeText/pressKey take one text/chord argument; use setValue for a specific element');
      return second === undefined ? act(action, action === 'press' ? {key: value} : {text: value})
        : act(action, {...(value == null ? {} : {elementId: value}), ...(action === 'press' ? {key: second} : {text: second})});
    };
    return api = {
      id: target.id, target,
      capabilities: { list: () => target.capabilities ?? [], control: () => target.control },
      getAXState: async options => { const result = await observe('ax', options); return displayed(typeof result.observation.ax === 'string' ? result.observation.ax : JSON.stringify(result.observation.ax)); },
      getScreenshot: async options => displayed((await observe('screenshot', options)).image),
      getAXStateAndScreenshot: async options => { const result = await observe('both', options); return displayed({ state: typeof result.observation.ax === 'string' ? result.observation.ax : JSON.stringify(result.observation.ax), screenshot: result.image }); },
      click: async (value, options) => { const opts = clickOptions(options); if (opts.clickCount != null && ![1, 2].includes(opts.clickCount)) throw new Error('Only single and double clicks are supported'); return act(opts.clickCount === 2 ? 'doubleClick' : 'click', {...point(value), ...opts}); },
      doubleClick: async (value, options) => act('doubleClick', { ...point(value), ...clickOptions(options) }),
      move: async value => act('move', point(value)),
      setValue: async (id, value) => act(target.backend === 'native' ? 'set_value' : 'fill', { elementId: id, value }),
      type: async text => act('type', { text }),
      typeText: async (value, text) => input('type', value, text),
      upload: async (elementId, files) => act('upload', { elementId, files }),
      pressKey: async (value, key) => input('press', value, key),
      keyDown: async key => act('keyDown', { key }),
      keyUp: async key => act('keyUp', { key }),
      scroll: async (value = {}, direction, distance) => {
        if (direction === undefined) return act('scroll', value);
        const directions = {up: [0,-1], u: [0,-1], down: [0,1], d: [0,1], left: [-1,0], l: [-1,0], right: [1,0], r: [1,0]};
        const vector = directions[direction];
        if (!vector) throw new TypeError('Unknown scroll direction');
        let pixels;
        if (distance && typeof distance === 'object') pixels = distance.pixels;
        else {
          const shot = last?.screenshot, viewport = shot?.viewport;
          const dimension = vector[0] ? viewport?.width ?? shot?.image?.width ?? shot?.width : viewport?.height ?? shot?.image?.height ?? shot?.height;
          if (!dimension) throw new Error('Page-distance scrolling needs a current screenshot; use {pixels} or scroll({deltaX,deltaY})');
          pixels = dimension * (distance ?? 1);
        }
        if (typeof pixels !== 'number' || !Number.isFinite(pixels) || pixels < 0) throw new TypeError('Scroll distance must be non-negative');
        return act('scroll', {...point(value), deltaX: vector[0]*pixels, deltaY: vector[1]*pixels});
      },
      drag: async (path, to) => act('drag', { path: to ? [path, to].map(p => ({x:p[0], y:p[1]})) : path.map(p => Array.isArray(p) ? {x:p[0],y:p[1]} : p) }),
      navigate: async url => act('navigate', { url }),
      goto: async url => act('navigate', { url }),
      back: async () => act('back'), forward: async () => act('forward'), reload: async () => act('reload'),
      close: async () => act('closeTab'), focus: async () => call('focus', { targetId: target.id }),
      webmcp: {
        listTools: async () => { const result = (await act('siteTools')).result; emit(result); return displayed(result.tools); },
        invokeTool: async (registrationId, input) => { const result = (await act('invokeSiteTool', { registrationId, input })).result; emit(result); return displayed(result); },
      },
      ...(target.backend !== 'native' ? {playwright: createPlaywrightAPI(async (action, args) => { const result = await act(action, args); return result.result?.value; }, (value, show) => { observations.reset(); if (show) emit(value); return displayed(value); }, {signal: () => activeExecution().signal})} : {}),
      act: async args => act(args.action, args),
    };
  }
  async function select(reference) {
    let result = await call('select', { reference });
    if (!result.target.verified) result = await call('resume', { targetId: result.target.id });
    documentation(result.target.backend === 'native' ? 'native' : 'browser');
    const target = targetAPI(result.target);
    emit({target: Object.fromEntries(['id','backend','provider','browserId','title','url','control'].filter(key => result.target[key] !== undefined).map(key => [key, result.target[key]]))});
    observations.reset();
    try { await target.getAXState(); }
    catch (error) {
      activeExecution();
      emit({initialObservationError: {code: error.code, message: error.message}, targetId: target.id,
        notice: 'Binding retained. Obtain a fresh observation before input; do not create another target.'});
    }
    return displayed(target);
  }
  async function createTab(browserId, url) {
    const opened = await call('openTarget', { browserId, url });
    try { return await select({ id: opened.target.id }); }
    catch (cause) {
      const details = { created: true, target: opened.target, stage: 'select', cause: { code: cause.code, message: cause.message, details: cause.details } };
      emit(details);
      throw Object.assign(new Error(`Tab ${opened.target.id} was created, but control could not be recovered: ${cause.message}. Do not create another tab; select this target after recovery.`),
        { code: cause.code ?? 'TARGET_SELECTION_FAILED', details });
    }
  }
  function initialize() {
    const input = new PassThrough(), output = new PassThrough();
    output.on('data', () => {});
    repl = start({ input, output, terminal: false, prompt: '', useGlobal: false, ignoreUndefined: true });
    for (const key of ['require', 'module', 'exports', 'process']) delete repl.context[key];
    const inventory = async () => (await call('targets')).targets;
    const browserAPI = browserId => ({ id: browserId, browserId, capabilities: { list: () => ['tabs'] },
      documentation: () => documentation('browser', true),
      tabs: { list: async () => (await inventory()).filter(target => target.browserId === browserId), get: async id => select({id, browserId}), new: async url => createTab(browserId, url) },
      getTab: async reference => select(typeof reference === 'string' ? { id: reference, browserId } : { ...reference, browserId }),
      newTab: async url => createTab(browserId, url),
    });
    repl.context.cua = {
      getState: async (options = {}) => { const result = await call('state', options); const live = await call('targets'); const state = { ...result.state, targets: live.targets, browsers: live.browsers ?? result.browsers ?? [], ...(live.errors?.length ? { errors: live.errors } : {}) }; if (options.emit !== false) emit(state); return displayed(state); },
      getTab: async (reference, options = {}) => select(typeof reference === 'string' ? { id: reference, browserId: options.browser, expected: options.expected } : { ...reference, browserId: options.browser ?? reference.browserId }),
      getApp: async reference => {
        if (typeof reference === 'string') {
          const matches = (await inventory()).filter(target => target.backend === 'native' && [target.id, target.bundleId, target.title, target.appName, target.name].includes(reference));
          if (matches.length !== 1) throw new Error('Application name must identify exactly one live window; use its inventory ID');
          return select(matches[0]);
        }
        return select({ ...reference, backend: 'native' });
      },
      connectBrowser: async (browser = 'external') => { const result = await call('connectBrowser', {browser}); emit(result); return displayed(result); },
      getBrowser: async reference => {
        if (reference?.browser) await call('connectBrowser', {browser: reference.browser});
        if (String(reference?.id).startsWith('extension:')) await call('connectBrowser', {browser: reference.id});
        const inventory = await call('targets');
        const list = inventory.targets.filter(target => target.backend === 'browser' && (!reference?.browser || target.provider === 'extension' && (reference.browser === 'external' || (inventory.browsers ?? []).some(browser => browser.id === target.browserId && browser.name.toLowerCase().includes(reference.browser.toLowerCase())))));
        const matches = reference?.id ? list.filter(target => target.browserId === reference.id) : reference?.url ? list.filter(target => target.url === reference.url) : list;
        const connected = (inventory.browsers ?? []).filter(browser => !browser.pairingRequired && !reference?.url && (!reference?.id || browser.id === reference.id) && (!reference?.browser || browser.provider === 'extension' && (reference.browser === 'external' || browser.name.toLowerCase().includes(reference.browser.toLowerCase()))));
        const ids = [...new Set([...matches.map(target => target.browserId), ...connected.map(browser => browser.id)])];
        if (ids.length !== 1) throw new Error('Browser must identify exactly one connected inventory browser');
        documentation('browser');
        return displayed(browserAPI(ids[0]));
      },
      createBrowserTab: createTab,
      downloads: { list: async (options = {}) => {
        const result = await call('deliveries');
        if (options.emit !== false) { emit(result.deliveries); deliveries.push(...result.deliveries.filter(item => item.file?.attachmentId)); }
        return displayed(result.deliveries);
      } },
      stop: async () => { observations.reset(); return call('stop'); }, resume: async targetId => { observations.reset(); return call('resume', { targetId }); },
      documentation: (topic = 'core') => documentation(topic, true),
      rewriteDocumentation: () => { observations.reset(); const topics = [...documentationSeen]; for (const topic of topics.length ? topics : ['core']) documentation(topic, true); },
    };
    repl.context.nodeRepl = { write: emit, emitImage: async image => {
      activeExecution();
      if (!image?.attachmentId) throw new Error('emitImage expects a screenshot attachment returned by OpenCU');
      images.push(image);
    } };
    repl.context.console = { log: (...values) => emit(values.join(' ')), error: (...values) => emit(values.join(' ')), warn: (...values) => emit(values.join(' ')) };
  }
  function clearContext() {
    repl?.close(); repl = undefined;
    outputs.length = 0; images.length = 0; deliveries.length = 0; returned.clear();
    documentationSeen.clear(); documentationInCell.clear(); observations.reset();
  }
  async function reset() {
    generation++;
    current?.aborter.abort(new Error('Computer session reset'));
    const stopping = request('stop').then(checked).then(result => { heldInputs.clear(); return result; });
    const results = await Promise.allSettled([...pending, stopping]);
    clearContext();
    if (results.some(result => result.status === 'rejected' && result.reason?.code === 'RELEASE_FAILED')) throw results.find(result => result.status === 'rejected' && result.reason?.code === 'RELEASE_FAILED').reason;
    return { ok: true, reset: true };
  }
  const session = {
    get signal() { return current?.signal; }, reset,
    close() {
      if (closing) return closing;
      closed = true; generation++;
      releaseOnClose ||= Boolean(current || pending.size || heldInputs.size);
      current?.aborter.abort(new Error('Computer session disposed'));
      closing = (async () => {
        const results = await Promise.allSettled([...(releaseOnClose ? [request('stop').then(checked)] : []), ...pending]);
        await tail;
        clearContext(); execution.disable(); session.attachments = undefined;
        const failure = releaseOnClose && results[0]?.status === 'rejected' ? results[0]
          : results.find(result => result.status === 'rejected' && result.reason?.code === 'RELEASE_FAILED');
        if (failure) throw failure.reason;
        releaseOnClose = false; heldInputs.clear();
      })().catch(error => { closing = undefined; throw error; });
      return closing;
    },
    run(args = {}, signal) {
      const work = tail.then(async () => {
        if (closed) throw new Error('Computer session is disposed');
        if (typeof args.code !== 'string') throw new Error('code is required');
        signal?.throwIfAborted();
        if (!repl) initialize();
        outputs.length = 0; images.length = 0; deliveries.length = 0; returned.clear(); documentationInCell.clear();
        const runGeneration = generation;
        const timeoutMs = Math.min(300000, Math.max(1, args.timeoutMs ?? 30000));
        const aborter = new AbortController();
        current = { aborter, signal: signal ? AbortSignal.any([signal, aborter.signal]) : aborter.signal };
        const onAbort = () => aborter.abort(signal.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        let timer, cancel;
        const evaluationRepl = repl;
        let rejectEvaluation;
        // Node's native REPL reports thrown/rejected evaluations through its domain,
        // not through eval's callback; keep the original error instead of a timeout.
        const evaluationError = error => rejectEvaluation?.(error);
        evaluationRepl._domain.on('error', evaluationError);
        try {
          execution.run(current, () => { if (args.restoreDocumentation) { observations.reset(); for (const topic of [...documentationSeen]) documentation(topic, true); } documentation('core'); });
          const interrupted = new Promise((_, reject) => {
            cancel = () => reject(current.signal.reason ?? new Error('Computer use cancelled'));
            current.signal.addEventListener('abort', cancel, { once: true });
            if (current.signal.aborted) cancel();
          });
          const evaluation = new Promise((resolve, reject) => {
            rejectEvaluation = reject;
            execution.run(current, () => evaluationRepl.eval(`${args.code}\n`, evaluationRepl.context, 'opencu-computer-use', (error, value) => error ? reject(error) : resolve(value)));
          });
          timer = setTimeout(() => aborter.abort(Object.assign(new Error('Computer JavaScript timed out; bindings were reset'), { code: 'COMPUTER_TIMEOUT' })), timeoutMs);
          const value = await Promise.race([evaluation, interrupted]);
          await Promise.all([...pending]);
          current.signal.throwIfAborted();
          if (generation !== runGeneration) throw new Error('Computer session reset');
          // Auto-displayed (or explicitly suppressed) API returns are not a second REPL output.
          if (value !== undefined && !returned.has(value)) outputs.push(typeof value === 'string' ? value : JSON.stringify(value));
          return { ok: true, title: args.title ?? 'Computer use', outputs: [...outputs], images: [...new Map(images.map(image => [image.attachmentId, image])).values()],
            deliveries: [...new Map(deliveries.map(item => [item.file.attachmentId, item])).values()] };
        } catch (error) {
          documentationSeen.clear(); observations.reset();
          if (aborter.signal.aborted && !closed) { checked(await request('stop')); await reset(); }
          throw error;
        } finally {
          clearTimeout(timer); evaluationRepl._domain.removeListener('error', evaluationError); current?.signal.removeEventListener('abort', cancel); signal?.removeEventListener('abort', onAbort); current = undefined;
          outputs.length = 0; images.length = 0; deliveries.length = 0; returned.clear(); documentationInCell.clear();
        }
      });
      tail = work.then(() => {}, () => {});
      return work;
    },
  };
  return session;
}
