import { actualUser, textBlocks } from './context/core.mjs';
import { emitAgentEvent } from '@deepseek-ai/dsh-agent';

/** Complete a draft through the native cwd projection, never a second Session. */
export function installProjectlessDirectory(ctx, workspaces) {
  const completed = new WeakSet();
  const pending = new WeakMap();
  const claimed = new WeakMap();
  const notices = new WeakMap();
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
    if (cwd) {
      // Keep the native durable notice; identify only this initialization's
      // message so admission can include it in the already assembling step.
      // Never replace the live agent's inject or consume unrelated input.
      const initializingAgent = Object.create(agent);
      initializingAgent.inject = message => {
        const result = agent.inject(message);
        if (message.source?.kind === 'working-directory') notices.set(session, message.id);
        return result;
      };
      await agent.ctx.get('workingDirectory').set(initializingAgent, cwd, signal);
    }
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
  ctx.on('agent/pre-step', async ({ agent, turn, signal }, next) => {
    const decision = await next();
    if (decision.kind !== 'enter') return decision;
    const id = notices.get(agent.session);
    if (!id) return decision;
    signal?.throwIfAborted();
    const index = agent.inbox.nextStep.findIndex(message => message.id === id);
    notices.delete(agent.session);
    if (index < 0) return decision; // A native cancellation/claim already consumed it.
    const message = agent.inbox.nextStep[index];
    // Use the native durable claim event (no canceled outcome), followed by
    // its scoped notification. Inbox.remove/splice would report a discard.
    agent.session.append('agent/inbox/spliced', { target: 'next-step', start: index, removedCount: 1, inserted: [] });
    emitAgentEvent(agent.ctx, agent, 'agent/inbox/claimed', { message, turn });
    const messages = [...decision.messages];
    const contextIndex = messages.findIndex(item => item.source?.kind === 'runtime-context');
    messages.splice(contextIndex < 0 ? messages.length : contextIndex, 0, message);
    return { ...decision, messages };
  }, { global: true, prepend: true });
}
