import {readCDPFrameOwners} from '../../extension/frame-router.js';
const failure = (code,message) => Object.assign(new Error(message),{code,details:{inputDispatched:false}});

/** A real, target-owned CDP chooser subscription. No trigger is replayed. */
export function createFileChoosers(record) {
  let current, closed = false;
  const cleanup = task => {
    if (task.cleaned) return Promise.resolve();
    return task.cleanup ??= (async () => {
      clearTimeout(task.timer);
      for (const remove of task.removers) remove();
      const entries = [...task.sessions],results = await Promise.allSettled(entries.map(([,route]) => route.send('Page.setInterceptFileChooserDialog',{enabled:false})));
      const failures = [];
      for (let index = 0; index < results.length; index++) {
        const result = results[index];
        if (result.status === 'fulfilled' || /(?:Target (?:closed|detached)|Session (?:closed|is closed)|No session with|No target with|No frame (?:with|for)|Frame (?:with .* not found|CDP session is detached)|Frame router is closed)/iu.test(result.reason.message)) task.sessions.delete(entries[index][0]);
        else failures.push(result.reason);
      }
      // Keep failed sessions owned until an actual retry acknowledges disabling.
      if (failures.length) throw new AggregateError(failures,'File chooser interception cleanup failed');
      task.cleaned = true;
    })().finally(() => {task.cleanup = undefined;});
  };
  const stale = (task,message) => {
    task.status = 'stale';task.error = failure('STALE_FILE_CHOOSER',message);
    void cleanup(task).catch(error => {task.cleanupError = error;});
  };
  const checkId = id => {
    if (!current || current.id !== id) throw failure('STALE_FILE_CHOOSER','The file chooser is no longer active; subscribe before a new trigger');
    if (current.status === 'stale') throw current.error;
    if (closed) throw failure('TARGET_CLOSED','The browser tab is closed');
    return current;
  };
  const descriptor = task => ({id:task.id,status:task.status,...(task.status === 'ready' ? {multiple:task.multiple} : {})});
  const collect = async check => {
    const routes = [], main = await record.frameRouter.main();
    const visit = async route => {
      check();routes.push(route);
      for (const owner of await readCDPFrameOwners(route,check)) {
        const child = await record.frameRouter.child(route,owner.backendNodeId,owner.frameId);
        if (child) await visit(child);
      }
    };
    await visit(main);return routes;
  };
  return {
    async arm(id,timeoutMs,check = () => {},signal) {
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/u.test(id)) throw failure('INVALID_ARGUMENT','A unique file chooser subscription ID is required');
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 300000) throw failure('INVALID_ARGUMENT','Invalid file chooser timeout');
      if (closed) throw failure('TARGET_CLOSED','The browser tab is closed');
      if (current && ['arming','waiting','ready','using'].includes(current.status)) throw failure('FILE_CHOOSER_BUSY','This tab already has an active file chooser subscription or handle');
      if (current) await cleanup(current);
      const task = current = {id,status:'arming',generation:record.documentGeneration,removers:[],sessions:new Map(),routes:[]};
      const live = () => {check();if (current !== task || task.status === 'stale' || task.generation !== record.documentGeneration) throw failure('STALE_FILE_CHOOSER','The document changed while preparing the file chooser');};
      const opened = (event,sessionId) => {
        if (current !== task || task.status === 'stale') return;
        if (task.status !== 'waiting') {stale(task,'Another file chooser superseded this handle; subscribe before a new trigger');return;}
        const route = task.routes.find(route => route.frameId === event.frameId && (route.sessionId || '') === (sessionId || ''));
        if (!route || !Number.isSafeInteger(event.backendNodeId) || !['selectSingle','selectMultiple'].includes(event.mode)) {
          stale(task,'The file chooser belongs to an unprepared frame; observe the target before a new subscription');return;
        }
        clearTimeout(task.timer);
        task.route = route;task.backendNodeId = event.backendNodeId;task.multiple = event.mode === 'selectMultiple';task.status = 'ready';
      };
      try {
        if (signal) {
          const abort = () => stale(task,'The file chooser subscription was cancelled');
          signal.addEventListener('abort',abort,{once:true});task.removers.push(() => signal.removeEventListener('abort',abort));
          if (signal.aborted) abort();
        }
        task.routes = await collect(live);live();
        const root = event => opened(event,undefined);
        const child = event => {let message;try {message=JSON.parse(event.message);}catch{return;}if (message.method === 'Page.fileChooserOpened') opened(message.params,event.sessionId);};
        record.session.on('Page.fileChooserOpened',root);record.session.on('Target.receivedMessageFromTarget',child);
        task.removers.push(() => record.session.off('Page.fileChooserOpened',root),() => record.session.off('Target.receivedMessageFromTarget',child));
        for (const route of task.routes) if (!task.sessions.has(route.sessionId ?? 'root')) {
          task.sessions.set(route.sessionId ?? 'root',route);
          await route.send('Page.enable');live();
          await route.send('Page.setInterceptFileChooserDialog',{enabled:true});live();
        }
        task.status = 'waiting';
        if (timeoutMs) {task.timer = setTimeout(() => stale(task,'The file chooser subscription expired; subscribe before a new trigger'),timeoutMs);task.timer.unref?.();}
        return descriptor(task);
      } catch (error) {stale(task,'The file chooser subscription could not be prepared');await cleanup(task);throw error;}
    },
    async poll(id) {
      const task = checkId(id);
      if (task.status === 'ready') await record.frameRouter.validate(task.route);
      if (task.generation !== record.documentGeneration) throw failure('STALE_FILE_CHOOSER','The document changed after the file chooser subscription');
      return descriptor(task);
    },
    async entry(id) {
      const task = checkId(id);
      if (task.status !== 'ready') throw failure('FILE_CHOOSER_NOT_READY','No file chooser has opened for this subscription');
      await record.frameRouter.validate(task.route);
      if (task.generation !== record.documentGeneration) throw failure('STALE_FILE_CHOOSER','The document changed after the file chooser opened');
      return task;
    },
    async explicitUpload(entry) {
      const task = current;
      if (task?.status === 'ready' && task.backendNodeId === entry.backendNodeId && (task.route.sessionId || '') === (entry.route?.sessionId || '') && (!entry.route || task.route.documentId === entry.route.documentId && task.route.frameId === entry.route.frameId)) {
        stale(task,'This file chooser was resolved by an explicit upload; subscribe before a new trigger');await cleanup(task);
      }
    },
    consume(task) {if (current !== task || task.status !== 'ready') throw failure('STALE_FILE_CHOOSER','The file chooser is no longer active');task.status='using';},
    async finish(task) {stale(task,'The file chooser was consumed; subscribe before a new trigger');await cleanup(task);},
    async cancel(id) {
      if (!current || current.id !== id) return {cancelled:true};
      stale(current,'The file chooser subscription was cancelled');await cleanup(current);return {cancelled:true};
    },
    async release() {if (current) {stale(current,'The browser target was released');await cleanup(current);}},
    navigated() {if (current) stale(current,'The document changed after the file chooser subscription');},
    async dispose() {closed=true;if (current) {stale(current,'The browser target was closed or released');await cleanup(current);}},
  };
}
