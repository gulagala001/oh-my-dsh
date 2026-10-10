import { catalogPage } from './catalog.mjs';
import { sendAttachment } from '../http.mjs';
import { compactionMessage } from './commands.mjs';
import { Config, contextConfig } from '../config.mjs';
import { normalizePersonalityPatch } from '../cc-adaptation/personality.mjs';
import { actualUser } from './core.mjs';

export async function handleContextApi({ hub, ctx, req, res, url, session, agent, inspection, archivedOnly, refreshSession, id, send, readBody }) {
  const path = url.pathname.replace('/trisoul-x/api', '');
  const needSession = () => { if (!session) throw new Error('请选择一个可读取的会话'); return session; };
  if (path === '/scope') {
    let state = id ? hub.store.peek(id) : null;
    const scopeLocked = target => {
      const saved = id ? hub.store.peek(id) : null;
      const preparedState = id ? hub.context.store.peek?.(id) : null;
      const currentAgent = id ? ctx.agents?.get(id) ?? target.agent : target.agent;
      const currentSession = currentAgent?.session ?? (id ? ctx.sessions?.get(id) : null) ?? target.session;
      return Boolean(target.archivedOnly || saved?.started || (currentAgent && currentAgent.status !== 'idle') || preparedState?.records?.length || Object.keys(preparedState?.publications?.catalog || {}).length || preparedState?.publications?.globalRevision != null || currentSession?.snapshotEvents().some(actualUser) || target.inspection?.events.some(actualUser));
    };
    const header=session?.header||inspection?.meta;
    let projectless=false,effectiveMode;
    if(id&&header&&hub.dream?.sources?.scopeFor) {
      try { const effective=await hub.dream.sources.scopeFor({...header,id});projectless=Boolean(effective.projectless);effectiveMode=effective.mode; }
      catch(error) { hub.dream.sources.lifecycle?.signal.throwIfAborted();projectless=true;hub.dream.notice(error); }
    }
    const locked = projectless||scopeLocked({ session, agent, inspection, archivedOnly });
    const scope = () => projectless||locked&&effectiveMode==='session'?'session':['session','global'].includes(state?.memoryScope || hub.config().memoryScope) ? state?.memoryScope || hub.config().memoryScope : 'project';
    if (req.method === 'POST') {
      if(projectless) { send(res,409,{error:'非工作区 Chat 保持会话隔离；请在工作区新建会话以使用共享范围'});return true; }
      if (locked) { send(res, 409, { error: '会话已开始，隔离范围不能中途扩大' }); return true; }
      const input = await readBody(req);
      if (!['session', 'project', 'global'].includes(input.scope)) throw new Error('范围只能是 session、project 或 global');
      const fresh = id && refreshSession ? await refreshSession() : { session, agent, inspection, archivedOnly };
      if (fresh.found === false) { send(res, 404, { error: '会话不存在' }); return true; }
      if (scopeLocked(fresh)) { send(res, 409, { error: '会话已开始，隔离范围不能中途扩大' }); return true; }
      state = id ? hub.store.peek(id) : null;
      if (id) { state ??= hub.store.state(id); state.memoryScope = input.scope; hub.store.save(state); }
      else await ctx.settings.update('trisoul-x', { memoryScope: input.scope });
    }
    send(res, 200, { scope: scope(), locked, default: ['session','global'].includes(hub.config().memoryScope) ? hub.config().memoryScope : 'project' }); return true;
  }
  if (path === '/context') { send(res, 200, hub.context.view(needSession())); return true; }
  if (path === '/context/mode') {
    if (req.method !== 'POST') { send(res, 405, { error: '请使用 POST' }); return true; }
    const { mode } = await readBody(req);
    send(res, 200, hub.context.setMode(needSession(), mode)); return true;
  }
  if (path === '/context/catalog') {
    const s = needSession(); hub.context.state(s);
    const history = url.searchParams.get('history') === 'true';
    const entries = hub.context.store.visible(s.id, { includeHistory: history }).map(({ sourceSeqs, sourceHash, documents, assets = [], userOriginals, originalSeqs, ...r }) => ({ ...r, documentCount: documents.length, assetCount: assets.length }));
    const page = catalogPage(entries, { query: url.searchParams.get('query') || '', cursor: url.searchParams.get('cursor') });
    send(res, 200, { scope: hub.context.state(s).binding, ...page, unreadableArchives: hub.context.store.readErrors?.size || 0 }); return true;
  }
  if (path === '/context/asset') {
    if (req.method !== 'GET') { send(res, 405, { error: '请使用 GET' }); return true; }
    const s = needSession(), asset = Number(url.searchParams.get('asset'));
    if (!Number.isSafeInteger(asset) || asset < 1) throw Error('附件编号从 1 开始');
    const item = hub.context.recallAssets(s, { id: url.searchParams.get('id') })[asset - 1];
    await sendAttachment(ctx, res, item?.block); return true;
  }
  if (path === '/context/document') {
    const s = needSession(); hub.context.state(s);
    const record = hub.context.store.get(s.id, url.searchParams.get('id'));
    send(res, 200, { ...record, requestSessionId: s.id }); return true;
  }
  if (path === '/context/review') {
    const state = hub.context.state(needSession());
    send(res, 200, { at: state.review.lastAt, input: state.review.lastInput || null, choices: state.review.lastChoices || [] }); return true;
  }
  if (path === '/context/global') {
    if (req.method === 'GET') send(res, 200, hub.context.store.global());
    else if (req.method === 'POST') {
      const { text, revision } = await readBody(req);
      try { send(res, 200, hub.context.store.setGlobal(text, revision)); }
      catch (error) { send(res, /其他窗口/.test(error.message) ? 409 : 400, { error: error.message }); }
    } else send(res, 405, { error: '仅支持读取与用户保存' });
    return true;
  }
  if (path === '/context/prepare' || path === '/context/coordinate') {
    if (req.method !== 'POST') { send(res, 405, { error: '请使用 POST' }); return true; }
    if (!agent) throw new Error('先继续一次会话以建立后台执行路由');
    if (path.endsWith('/prepare')) void hub.context.prepare(agent, true);
    else void hub.context.coordinate(agent, true);
    send(res, 202, { queued: true }); return true;
  }
  if (path === '/compact-p' || path === '/compact-f') {
    if (req.method !== 'POST') { send(res, 405, { error: '请使用 POST' }); return true; }
    needSession(); const args = await readBody(req);
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length) throw Error('该压缩命令不接受参数');
    if (hub.context.manualSessions?.has(session.id)) { send(res, 409, { error: '本会话正在压缩，请勿重复提交' }); return true; }
    const operation = path === '/compact-p' ? 'processed' : 'full';
    const outcome = await hub.context.requestCompaction(session, agent, operation);
    send(res, outcome.queued ? 202 : 200, { ...outcome, message: compactionMessage(operation, outcome) }); return true;
  }
  if (path === '/compact') {
    if (req.method !== 'POST') { send(res, 405, { error: '请使用 POST' }); return true; }
    needSession(); const args = await readBody(req);
    if (!agent || agent.status !== 'idle') send(res, 202, hub.context.queueManual(session, args));
    else {
      const run = signal => { signal?.throwIfAborted(); return hub.context.applyReady(agent, { manual: true, ids: args.ids, mode: args.mode || 'detail' }); };
      const result = agent.runMaintenance ? await agent.runMaintenance(run) : await run();
      send(res, 200, { changed: Boolean(result), queued: false, result, message: result ? '已应用预处理结果' : '没有可应用的已完成摘要；原文保留' });
    }
    return true;
  }
  if (path === '/settings' && req.method === 'GET') { send(res, 200, hub.config()); return true; }
  if (path === '/settings' && req.method === 'POST') {
    let patch = await readBody(req);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('设置必须是对象');
    delete patch.dataDir;
    const unknown = Object.keys(patch).filter(key => !Object.hasOwn(Config.dict, key));
    if (unknown.length) throw new Error('未知或已退役的设置：' + unknown.join(', '));
    contextConfig({ ...hub.config(), ...patch });
    patch = normalizePersonalityPatch(hub.config(), patch);
    if (patch.memoryScope !== undefined && !['session', 'project', 'global'].includes(patch.memoryScope)) throw new Error('旧 full 档不再参与跨项目记忆；全局模式使用 global');
    await ctx.settings.update('trisoul-x', patch);
    send(res, 200, hub.config()); return true;
  }
  if (path === '/memories') {
    // Historical automatic memories remain exportable, never re-injected or edited by an AI.
    if (req.method !== 'GET') { send(res, 410, { error: '旧自动记忆已归档。请使用摘要目录；全局背景在手动文本区维护。' }); return true; }
    const state = hub.context.state(needSession());
    const items = state.binding.scope === 'project' ? hub.store.memories(state.binding.project, 'project', true) : [];
    send(res, 200, { legacy: true, readOnly: true, items, scope: state.binding }); return true;
  }
  if (path === '/curate') { send(res, 410, { error: '旧分片整理已由摘要预处理与中枢表示选择接替，不再调用模型整理自动记忆库' }); return true; }
  return false;
}
