async function nativeNotFound(ctx, error) {
  const entry = [...ctx.loader?.entries?.() ?? []].find(row => row.options.name === '@deepseek-ai/dsh-api-session-controller');
  if (!entry) return false;
  try {
    const native = await entry.parent.tree.import('@deepseek-ai/dsh-api-session-controller');
    return typeof native.ApiSessionNotFound === 'function' && error instanceof native.ApiSessionNotFound;
  } catch { return false; }
}

// Read a cold native Session without activating its Agent or creating an OMD
// state. The inspection is data, never a replacement Session implementation.
export async function apiSessionTarget(ctx, store, id, signal) {
  signal?.throwIfAborted();
  const agent = id ? ctx.agents.get(id) : undefined;
  const session = agent?.session ?? (id ? ctx.sessions.get(id) : undefined);
  const stored = id ? store.peek(id) : undefined;
  let inspection;
  if (id && !session) {
    const controller = ctx.get('sessionController');
    if (typeof controller?.inspect === 'function') {
      try {
        inspection = await controller.inspect(id, signal);
        signal?.throwIfAborted();
        if (inspection?.meta?.id !== id || !Array.isArray(inspection.events)) throw Error('原生会话查询身份或记录无效');
      } catch (error) {
        if (!await nativeNotFound(ctx, error)) throw error;
      }
    }
  }
  signal?.throwIfAborted();
  return { agent, session, stored, inspection,
    found: !id || Boolean(session || stored || inspection),
    archivedOnly: Boolean(id && !session && stored && !inspection) };
}
