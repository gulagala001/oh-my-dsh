import { isDeepStrictEqual } from 'node:util';
import { validateSessionId } from '../plugins/persona/src/store.mjs';

const conflict = message => Object.assign(Error(message + '；草稿已保留'), { statusCode: 409 });
function preferences(hub, id) {
  const state = hub.store.peek(id);
  const todo = Object.fromEntries(['todo', 'verificationMode', 'verification']
    .filter(key => state?.betterTodo?.[key] !== undefined).map(key => [key, state.betterTodo[key]]));
  // Copy stored choices, not their resolved global defaults. Disabled features
  // retain dormant choices, and a deleted custom persona still falls back normally.
  return { personalityPreset: hub.persona.store.choice(id) ?? null,
    promptStyle: state?.promptStyle ?? null, betterTodo: Object.keys(todo).length ? todo : null };
}
const empty = { personalityPreset: null, promptStyle: null, betterTodo: null };

// Projectless first send replaces the reusable native blank with a new Session.
// Persist its per-session choices before admitting that Session's first turn.
export function transferDraftPreferences(ctx, hub, input) {
  const { sourceSessionId: from, targetSessionId: to, requestId } = input ?? {};
  validateSessionId(from); validateSessionId(to); validateSessionId(requestId);
  if (from === to) throw conflict('源会话与目标会话必须不同');
  for (const id of [from, to]) {
    const agent = ctx.agents.get(id), session = agent?.session ?? ctx.sessions.get(id);
    if (!session || session.id !== id) throw conflict('会话尚未就绪，请重新发送');
    if (session.header.origin === 'subagent' || Number(session.header.delegationDepth) > 0
      || agent && agent.status !== 'idle'
      || session.snapshotEvents().some(event => ['user/message', 'turn/start'].includes(event.type)))
      throw conflict('仅可迁移尚未开始的主会话设置');
  }
  // No await between validation and the durable writes: another request cannot
  // start a turn or change either session's preferences halfway through copying.
  const desired = preferences(hub, from), before = preferences(hub, to);
  const state = hub.store.state(to), receipt = state.draftPreferenceTransfer;
  if (receipt ? receipt.sourceSessionId !== from || receipt.requestId !== requestId || !isDeepStrictEqual(before, receipt.preferences)
    : !isDeepStrictEqual(before, empty)) throw conflict('目标会话设置已在另一处更改，请先打开该会话');
  if (receipt && isDeepStrictEqual(before, desired)) return { transferred: true };
  const personaChanged = before.personalityPreset !== desired.personalityPreset;
  if (personaChanged) hub.persona.store.save({ id: to, personalityPreset: desired.personalityPreset ?? undefined });
  try {
    hub.store.update(state, { promptStyle: desired.promptStyle ?? undefined, betterTodo: desired.betterTodo ?? undefined,
      draftPreferenceTransfer: { sourceSessionId: from, requestId, preferences: desired } });
  } catch (error) {
    if (personaChanged) {
      try { hub.persona.store.save({ id: to, personalityPreset: before.personalityPreset ?? undefined }); }
      catch (rollback) { throw new AggregateError([error, rollback], '会话设置保存及恢复失败；草稿已保留，请先检查目标会话'); }
    }
    throw error;
  }
  return { transferred: true };
}
