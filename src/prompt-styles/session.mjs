import { PROMPT_STYLES, isPromptStyle, promptStyle } from './options.mjs';
import { isOmdPreset } from '../legacy-identity.mjs';
import { validateSessionId } from '../hub-store.mjs';
import { symbols } from '@deepseek-ai/cordis';

export function sessionPromptStyle(hub, session) {
  if (session?.header?.origin === 'subagent') return session.header.isSeeded === true
    ? hub.store?.peek(session.id)?.forkPromptStyle ?? 'omd' : 'omd';
  const config = hub.config();
  const saved = config.sessionPromptStyleEnabled === true && session?.id
    ? hub.store?.peek(session.id)?.promptStyle : undefined;
  return isPromptStyle(saved) ? saved : promptStyle(config.promptStyle);
}

// Keep a running turn stable; settings and session choices take effect together
// at the next native turn, including a resumed session.
const turns = new WeakMap(), completed = new WeakMap();
export function capturePromptStyle(hub, agent, turn) {
  agent = agent[symbols.original] ?? agent;
  // A native clear/rewind can reuse a turn number on the same live Agent.
  turns.set(agent, { turn, style: sessionPromptStyle(hub, agent.session) });
}
export const agentPromptStyle = (hub, agent) => turns.get(agent?.[symbols.original] ?? agent)?.style ?? sessionPromptStyle(hub, agent?.session);

export function completePromptStyle(agent, event) {
  agent = agent[symbols.original] ?? agent;
  const active = turns.get(agent);
  if (active?.turn !== event.data.turn) return;
  let snapshots = completed.get(agent);
  if (!snapshots) completed.set(agent, snapshots = new Map());
  snapshots.set(event.seq, active.style);
  if (snapshots.size > 8) snapshots.delete(snapshots.keys().next().value);
}

export function inheritForkPromptStyle(hub, agents, agent, source) {
  const { session } = agent, { header } = session;
  if (header.origin !== 'subagent' || header.isSeeded !== true || !header.parentSession || source !== 'startup') return;
  const state = hub.store.state(session.id);
  if (state.forkPromptStyle !== undefined) return;
  const parent = agents.get(header.parentSession);
  const style = parent ? completed.get(parent[symbols.original] ?? parent)?.get(session.inheritedEventCount - 1) : undefined;
  if (style !== undefined) hub.store.update(state, { forkPromptStyle: style });
}

function eligible(ctx, target, id) {
  const header = target.session?.header ?? target.inspection?.meta;
  if (!header || header.origin === 'subagent' || target.archivedOnly) return false;
  if (target.session && target.session.id !== id || target.inspection && target.inspection.meta.id !== id) throw Error('会话身份不匹配');
  let preset = target.session && ctx.sessionProjections?.stateOf(target.session, 'agentPreset');
  if (preset === undefined || preset === null) {
    preset = header.agentPreset;
    for (const event of target.inspection?.events ?? target.session?.snapshotEvents?.() ?? []) {
      if (event.type === 'agent-preset/selected') preset = event.data?.agentPreset;
    }
  }
  return isOmdPreset(preset);
}

export async function handlePromptStyleApi({ hub, ctx, req, res, session, inspection, archivedOnly, refreshSession, id, readBody, send }) {
  if (!id) { send(res, 400, { error: '请选择一个会话' }); return; }
  validateSessionId(id);
  if (!['GET', 'POST'].includes(req.method)) { send(res, 405, { error: '仅支持 GET 或 POST' }); return; }
  const view = target => {
    const enabled = hub.config().sessionPromptStyleEnabled === true && eligible(ctx, target, id);
    return { enabled, locked: !enabled, style: sessionPromptStyle(hub, { id }), options: PROMPT_STYLES };
  };
  let target = { session, inspection, archivedOnly };
  if (req.method === 'POST') {
    const input = await readBody(req);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !isPromptStyle(input.style)) {
      send(res, 400, { error: '请选择有效的系统提示词风格' }); return;
    }
    if (refreshSession) target = await refreshSession();
    if (target.found === false) { send(res, 404, { error: '会话不存在' }); return; }
    if (!view(target).enabled) { send(res, 409, { error: '当前会话未启用会话提示词风格' }); return; }
    hub.store.update(hub.store.state(id), { promptStyle: input.style });
  }
  res.setHeader?.('Cache-Control', 'no-store');
  send(res, 200, view(target));
}
