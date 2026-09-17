// One in-flight read per observer; no hidden-tab polling or stale deliveries.
// Mutation requests are deliberately outside this cancellable read lifecycle.
export function createPoller({ read, onData, onError = () => {}, interval = 2500,
  visibility = globalThis.document, timeout = 30000 }) {
  let active = false, generation = 0, timer, controller;
  const visible = () => visibility?.visibilityState !== 'hidden';
  const cancel = () => { generation++; clearTimeout(timer); timer = undefined; controller?.abort(); controller = undefined; };
  async function refresh() {
    cancel();
    if (!active || !visible()) return;
    const ticket = generation, own = controller = new AbortController();
    const deadline = setTimeout(() => own.abort(new Error('读取超时，请重试')), timeout);
    let onAbort;
    const aborted = new Promise((_, reject) => { onAbort = () => reject(own.signal.reason); own.signal.addEventListener('abort', onAbort, { once: true }); });
    try {
      const data = await Promise.race([read(own.signal), aborted]);
      if (active && ticket === generation && !own.signal.aborted) onData(data);
    } catch (error) {
      if (active && ticket === generation) onError(own.signal.aborted ? own.signal.reason : error);
    } finally {
      clearTimeout(deadline); own.signal.removeEventListener('abort', onAbort);
      if (ticket === generation) {
        controller = undefined;
        if (active && visible()) timer = setTimeout(refresh, interval);
      }
    }
  }
  const onVisibility = () => { if (visible()) void refresh(); else cancel(); };
  return {
    start() { if (active) return; active = true; visibility?.addEventListener('visibilitychange', onVisibility); void refresh(); },
    stop() { active = false; cancel(); visibility?.removeEventListener('visibilitychange', onVisibility); },
    refresh,
  };
}
