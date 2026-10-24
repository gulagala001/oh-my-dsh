import {createFileChooserWait} from './browser-file-chooser.mjs';
const invalid = message => Object.assign(new TypeError(message), {code:'INVALID_ARGUMENT',details:{inputDispatched:false}});
const failure = (code, message, details) => Object.assign(new Error(message), {code,details});
const isRegExp = value => Object.prototype.toString.call(value) === '[object RegExp]';

/** Wait on authoritative state and durable download records, never repeat an action. */
export function createBrowserWaits(context) {
  const options = (value = {}, allowed = []) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Reflect.ownKeys(value).some(key => !allowed.includes(key))) throw invalid(`Supported wait options: ${allowed.join(', ')}`);
    const timeoutMs = value.timeoutMs === undefined ? 10000 : value.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 300000) throw invalid('timeoutMs must be an integer from 0 to 300000');
    return {...value,timeoutMs};
  };
  const loadState = (value = 'load', commit = false) => {
    if (!(commit ? ['commit','domcontentloaded','load'] : ['domcontentloaded','load']).includes(value)) throw invalid(`Unsupported load state: ${value}`);
    return value;
  };
  const urlMatcher = value => {
    if (value === undefined) return () => true;
    if (typeof value === 'string') return url => url === value;
    if (isRegExp(value)) {
      const expression = new RegExp(value.source,value.flags);
      return url => { expression.lastIndex = 0; return expression.test(url); };
    }
    throw invalid('url must be a string or RegExp');
  };
  const ready = (state, until) => until === 'commit' || state.readyState === 'complete' || until === 'domcontentloaded' && state.readyState === 'interactive';
  const supported = () => {
    if (!context.supported()) throw failure('UNSUPPORTED','Navigation and download-event waits require a matching DSH in-app adapter or standalone browser. Extension targets retain document-scoped identity and browser-wide download history; use fresh inventory and cua.downloads.list() without repeating a dispatched trigger.',{inputDispatched:false});
  };
  const task = (name, timeoutMs, work) => context.track(async signal => {
    supported();
    const deadline = timeoutMs === 0 ? Infinity : Date.now() + timeoutMs;
    const check = () => {
      signal.throwIfAborted();
      if (Date.now() >= deadline) throw failure(name === 'download' ? 'DOWNLOAD_TIMEOUT' : 'NAVIGATION_TIMEOUT',`${name} timed out after ${timeoutMs}ms. Observe the original target before deciding another action; do not replay its trigger.`,{timeoutMs});
    };
    const pause = () => new Promise((resolve,reject) => {
      check();
      const finish = () => {signal.removeEventListener('abort',abort);resolve();};
      const timer = setTimeout(finish,Math.min(100,Math.max(1,deadline-Date.now())));
      const abort = () => {clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};
      signal.addEventListener('abort',abort,{once:true});
      if (signal.aborted) abort();
    });
    return work({check,pause,signal});
  });
  const wait = async (until, matches, initial, control) => {
    for (;;) {
      control.check();
      const state = await context.state();
      control.check();
      if ((!initial || state.documentId !== initial.documentId || state.url !== initial.url || state.navigationId !== undefined && initial.navigationId !== undefined && state.navigationId !== initial.navigationId) && matches(state.url) && ready(state,until)) return;
      await control.pause();
    }
  };
  const fileChooser = createFileChooserWait(context,options);
  return {
    expectNavigation(action, value) {
      if (typeof action !== 'function') throw invalid('expectNavigation requires one action callback');
      const {timeoutMs,url,waitUntil} = options(value,['timeoutMs','url','waitUntil']);
      const until = loadState(waitUntil,true), matches = urlMatcher(url);
      return task('navigation',timeoutMs,async control => {
        control.check();
        const initial = await context.state();
        control.check();
        const result = await action();
        control.check();
        await wait(until,matches,initial,control);
        return result;
      });
    },
    waitForURL(url,value) {
      if (url === undefined) throw invalid('waitForURL requires a URL string or RegExp');
      const {timeoutMs,waitUntil} = options(value,['timeoutMs','waitUntil']);
      const until = loadState(waitUntil,true), matches = urlMatcher(url);
      return task('URL wait',timeoutMs,control => wait(until,matches,null,control));
    },
    waitForLoadState(state = 'load',value) {
      if (state && typeof state === 'object') {
        if (value !== undefined) throw invalid('waitForLoadState takes one options object, or a state and options');
        const opts = options(state,['state','timeoutMs']); state = opts.state === undefined ? 'load' : opts.state; value = {timeoutMs:opts.timeoutMs};
      }
      const until = loadState(state), {timeoutMs} = options(value,['timeoutMs']);
      return task('load-state wait',timeoutMs,control => wait(until,() => true,null,control));
    },
    waitForEvent(event,value) {
      if (event === 'filechooser') return fileChooser(value);
      if (event !== 'download') throw invalid("waitForEvent supports only 'download' and 'filechooser'");
      const {timeoutMs} = options(value,['timeoutMs']);
      return task('download',timeoutMs,async control => {
        // Start this cursor read synchronously, before a following click can be
        // queued. Durable records retain even downloads completed between polls.
        const startedAt = Date.now();
        const baselineWork = context.downloads(false), scopeWork = context.state({downloadCursor:true});
        const [baseline,scope] = await Promise.all([baselineWork,scopeWork]);
        // History projection can finish after a queued click. Only the
        // target-owner cursor is a pre-action snapshot; a later history result
        // must not classify newly completed downloads as historical IDs.
        if (!Array.isArray(scope.downloadIds) || scope.downloadIds.some(id => typeof id !== 'string'))
          throw failure('UNSUPPORTED_ACTION','This browser adapter cannot establish a target-owned download cursor. Update the matching adapter; do not repeat a dispatched download trigger.',{inputDispatched:false});
        const seen = new Set([...baseline.filter(item => (item.startedAtMs ?? Date.parse(item.createdAt)) < startedAt).map(item => item.id),...scope.downloadIds]);
        control.check();
        let selected;
        for (;;) {
          control.check();
          const records = await context.downloads(false);
          control.check();
          selected ??= records.filter(item => !seen.has(item.id) && (item.startedAtMs ?? Date.parse(item.createdAt)) >= startedAt && context.ownsDownload(item,scope))
            .sort((a,b) => (a.startedAtMs ?? Date.parse(a.createdAt))-(b.startedAtMs ?? Date.parse(b.createdAt)) || a.id.localeCompare(b.id))[0]?.id;
          const record = records.find(item => item.id === selected);
          if (record && ['failed','canceled','cancelled','interrupted','missing','changed','invalid','unavailable'].includes(record.status)) throw failure('DOWNLOAD_FAILED',record.error ?? 'The new download failed or its retained file is unavailable',{download:record});
          if (record?.status === 'complete') {
            if (!record.fileExists) throw failure('DOWNLOAD_UNAVAILABLE','The new download completed but its retained file is unavailable',{download:record});
            const complete = (await context.downloads(true,selected)).find(item => item.id === selected);
            control.check();
            if (!complete?.fileExists || !complete.file) throw failure('DOWNLOAD_UNAVAILABLE','The new download has no verified file attachment',{download:complete ?? record});
            context.deliver(complete);
            return Object.freeze({...complete,
              path: async value => { options(value,['timeoutMs']); return null; },
              suggestedFilename: () => complete.name ?? complete.filename,
            });
          }
          await control.pause();
        }
      });
    },
  };
}
