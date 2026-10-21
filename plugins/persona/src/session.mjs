import { personalityOptions, personalityPatch, personalityPreset, personalityProfile, resolvedPersonalityModules } from './shared/personality.mjs';

// Session choices reference the shared library. Disabling the feature leaves the
// choice saved; deleting a referenced preset falls back to the global selection.
export function sessionPersonality(hub, session) {
  if (hub.persona) return hub.persona.forSession(session);
  const config = hub.config(), global = personalityPreset(config);
  const stored = session?.id && config.sessionPersonalityEnabled === true
    ? hub.store?.peek(session.id)?.personalityPreset : undefined;
  const options = personalityOptions(config);
  const missing = typeof stored === 'string' && !options.some(option => option.value === stored);
  const preset = stored && !missing ? stored : global;
  const effective = preset === global ? config : { ...config, ...personalityPatch(config, preset) };
  return { preset: stored && !missing ? stored : 'inherit', effectivePreset: preset,
    effectiveName: personalityProfile(effective).name, missing, config: effective,
    modules: resolvedPersonalityModules(effective), options };
}

export async function handlePersonalityApi({ hub, ctx, req, res, session, inspection, archivedOnly, refreshSession, id, readBody, send }) {
  hub = hub.persona ?? hub;
  if (!id) { send(res, 400, { error: '请选择一个会话' }); return; }
  if (!['GET', 'POST'].includes(req.method)) { send(res, 405, { error: '仅支持 GET 或 POST' }); return; }
  const view = target => {
    const header = target.session?.header ?? target.inspection?.meta;
    const enabled = hub.config().sessionPersonalityEnabled === true && Boolean(header) && header?.origin !== 'subagent';
    const value = sessionPersonality(hub, { id, header });
    return { enabled, preset: value.preset, effectivePreset: value.effectivePreset, effectiveName: value.effectiveName,
      missing: value.missing, locked: Boolean(target.archivedOnly || !enabled),
      options: [{ value: 'inherit', label: '继承全局 · ' + personalityProfile(hub.config()).name }, ...value.options] };
  };
  let target = { session, inspection, archivedOnly };
  if (req.method === 'POST') {
    const input = await readBody(req);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.preset !== 'string')
      throw Error('会话人设仅接受 preset 字段');
    if (refreshSession) target = await refreshSession();
    if (target.found === false) { send(res, 404, { error: '会话不存在' }); return; }
    const current = view(target);
    if (current.locked) { send(res, 409, { error: current.enabled ? '该会话不可修改' : '当前会话未启用会话人设' }); return; }
    if (!current.options.some(option => option.value === input.preset)) throw Error('未知人格预设');
    const state = hub.store.state(id), next = { ...state };
    if (input.preset === 'inherit') delete next.personalityPreset;
    else next.personalityPreset = input.preset;
    // Save before changing the live object so failed storage cannot change prompts.
    hub.store.save(next);
    if (input.preset === 'inherit') delete state.personalityPreset;
    else state.personalityPreset = input.preset;
  }
  res.setHeader?.('Cache-Control', 'no-store');
  send(res, 200, view(target));
}
