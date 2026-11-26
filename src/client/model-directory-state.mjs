// The directory owns only discovery. Settings writes and saved routes are
// owned elsewhere; refreshing discovery never edits either of them.
export function createModelDirectoryState({ readProviders, readModels, onChange, timeoutMs = 20000 }) {
  let view = { directory: [], ready: false, loading: false, error: '' }, closed = false, listing;
  const pending = new Map(), attempted = new Set();
  let selected = new Set(), active = 0;
  const publish = patch => { view = { ...view, ...patch }; if (!closed) onChange(view); };
  const update = (id, patch) => publish({ directory: view.directory.map(item => item.id === id ? { ...item, ...patch } : item) });
  async function read(controller, operation) {
    let timer, cancel;
    const stopped = new Promise((_, reject) => {
      cancel = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => controller.abort(Error('读取超时，请重试')), timeoutMs);
    });
    try { controller.signal.throwIfAborted(); return await Promise.race([Promise.resolve().then(() => {
      controller.signal.throwIfAborted(); return operation(controller.signal);
    }), stopped]); }
    finally { clearTimeout(timer); controller.signal.removeEventListener('abort', cancel); }
  }
  async function run(id, job) {
    active++;
    job.controller = new AbortController();
    try {
      const models = await read(job.controller, signal => readModels(id, signal));
      if (!Array.isArray(models)) throw Error('提供方返回的模型列表无效');
      if (pending.get(id) !== job) return;
      attempted.add(id);
      update(id, { models, loading: false, error: '' });
      job.resolve(true);
    } catch (error) {
      if (pending.get(id) !== job) return;
      attempted.add(id);
      update(id, { loading: false, error: error?.message || '无法读取模型列表' });
      job.resolve(false);
    } finally {
      if (pending.get(id) === job) pending.delete(id);
      active--;
      drain();
    }
  }
  function drain() {
    for (const [id, job] of pending) {
      if (active >= 2) break; // Leave same-origin connections available for settings and other services.
      if (!job.controller) void run(id, job);
    }
  }
  function cancel(id, job) {
    pending.delete(id);
    job.controller?.abort();
    job.resolve(false);
  }
  function retry(id) {
    if (closed || listing || !selected.has(id) || !view.directory.some(item => item.id === id)) return Promise.resolve(false);
    if (pending.has(id)) return pending.get(id).promise;
    const job = {};
    job.promise = new Promise(resolve => { job.resolve = resolve; });
    pending.set(id, job);
    update(id, { loading: true, error: '' });
    drain();
    return job.promise;
  }
  function schedule() {
    for (const id of selected) if (!attempted.has(id)) void retry(id);
  }
  function select(ids) {
    if (closed) return;
    const next = new Set(ids.filter(Boolean));
    for (const id of selected) if (!next.has(id)) {
      if (pending.has(id)) cancel(id, pending.get(id));
      const row = view.directory.find(item => item.id === id);
      if (row?.error || row?.loading) {
        attempted.delete(id);
        update(id, { loading: false, error: '' });
      }
    }
    selected = next;
    schedule();
  }
  async function load() {
    if (closed) return false;
    listing?.abort();
    for (const [id, job] of pending) cancel(id, job);
    const controller = new AbortController(); listing = controller;
    publish({ loading: true, error: '', directory: view.directory.map(item => ({ ...item, loading: false })) });
    try {
      const providers = await read(controller, readProviders);
      if (!Array.isArray(providers)) throw Error('提供方目录无效');
      if (closed || listing !== controller) return false;
      const previous = new Map(view.directory.map(item => [item.id, item]));
      attempted.clear();
      publish({ ready: true, loading: false, directory: providers.map(item => ({ ...item,
        models: previous.get(item.id)?.models || [], loading: false, error: '' })) });
      return true;
    } catch (error) {
      if (!closed && listing === controller) publish({ loading: false, error: error?.message || '无法读取提供方目录' });
      return false;
    } finally { if (listing === controller) { listing = undefined; schedule(); } }
  }
  return { load, select, retry, dispose() {
    closed = true; listing?.abort(); listing = undefined;
    for (const [id, job] of pending) cancel(id, job);
  } };
}
