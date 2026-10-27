import { actualUser, textBlocks } from './context/core.mjs';

/** Complete a draft through the native cwd projection, never a second Session. */
export function installProjectlessDirectory(ctx, workspaces) {
  const completed = new WeakSet();
  const pending = new WeakMap();
  const claimed = new WeakMap();
  // The native loop claims inbox input before assembling its first request,
  // and commits user/message only afterwards. Capture, then await in assembly.
  ctx.on('agent/inbox/claimed', ({ agent, message }) => {
    if (!completed.has(agent.session) && !claimed.has(agent.session) && message.source?.kind === 'user') claimed.set(agent.session, message);
  }, { global: true });
  async function prepare(agent, signal) {
    const session = agent.session;
    if (completed.has(session)) return;
    const events = session.snapshotEvents();
    const first = events.find(actualUser)?.data ?? claimed.get(session);
    if (!first) return;
    // Native cwd events are durable. Respect explicit directory changes and
    // resumed sessions; naming must never reset a later user-selected cwd.
    if (session.header.origin === 'subagent' || events.some(e => e.type === 'working-directory/change')) {
      completed.add(session);
      claimed.delete(session);
      return;
    }
    signal?.throwIfAborted();
    const cwd = await workspaces.nameDraft({ requestId: session.id, cwd: session.header.cwd, prompt: textBlocks(first.content), firstSend: !events.some(actualUser) });
    if (cwd) await agent.ctx.get('workingDirectory').set(agent, cwd, signal);
    completed.add(session);
    claimed.delete(session);
  }
  ctx.on('system-prompt/assemble', async (_assembly, { agent, signal } = {}, next) => {
    if (agent) {
      let task = pending.get(agent.session);
      if (!task) {
        task = prepare(agent, signal);
        pending.set(agent.session, task);
      }
      try { await task; } finally { if (pending.get(agent.session) === task) pending.delete(agent.session); }
    }
    return next();
  }, { global: true, prepend: true });
}
