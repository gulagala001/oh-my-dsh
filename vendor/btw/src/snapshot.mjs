import { Session } from '@deepseek-ai/dsh-session';

export async function readSnapshot(ctx, id, signal) {
  let session = ctx.sessions.get(id);
  if (!session) {
    const inspected = await ctx.sessionController.inspect(id, signal);
    signal.throwIfAborted();
    session = Session.create(id, inspected.events, inspected.meta,
      inspected.inheritedEventCount, ctx.sessions.messageProjections);
  }
  // No await between these reads: all values describe the same log boundary.
  const header = session.requestHeader();
  if (!header) throw Error('请先在主会话发送一条消息，再使用 /btw');
  return {
    config: { ...header.config },
    tools: header.tools,
    toolHistory: session.toolHistory(),
    sessionId: session.id,
    messages: session.deriveMessages(),
  };
}
