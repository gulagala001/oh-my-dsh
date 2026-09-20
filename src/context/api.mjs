import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { compactionMessage } from './commands.mjs';
import { Config, contextConfig } from '../config.mjs';
import { userMessages } from './core.mjs';

export async function handleContextApi({ hub, ctx, req, res, url, session, agent, id, send, readBody }) {
  const path = url.pathname.replace('/trisoul-x/api', '');
  const needSession = () => { if (!session) throw new Error('请选择一个可读取的会话'); return session; };
  if (path === '/scope') {
    const state = id ? hub.store.state(id) : null;
    const preparedState = id ? hub.context.store.state?.(id) : null;
    const locked = Boolean(state?.started || (agent && agent.status !== 'idle') || preparedState?.records?.length || Object.keys(preparedState?.publications?.catalog || {}).length || preparedState?.publications?.globalRevision != null || (session && userMessages(session).length));
    const scope = () => (state?.memoryScope || hub.config().memoryScope) === 'session' ? 'session' : 'project';
    if (req.method === 'POST') {
      if (locked) { send(res, 409, { error: '会话已开始，隔离范围不能中途扩大' }); return true; }
      const input = await readBody(req);
      if (!['session', 'project'].includes(input.scope)) throw new Error('范围只能是 session 或 project');
      if (state) { state.memoryScope = input.scope; hub.store.save(state); }
      else await ctx.settings.update('trisoul-x', { memoryScope: input.scope });
    }
    send(res, 200, { scope: scope(), locked, default: hub.config().memoryScope === 'session' ? 'session' : 'project' }); return true;
  }
  if (path === '/context') { send(res, 200, hub.context.view(needSession())); return true; }
  if (path === '/context/catalog') {
    const s = needSession(); hub.context.state(s);
    const history = url.searchParams.get('history') === 'true';
    const entries = hub.context.store.visible(s.id, { includeHistory: history }).map(({ sourceSeqs, sourceHash, documents, assets = [], userOriginals, originalSeqs, ...r }) => ({ ...r, documentCount: documents.length, assetCount: assets.length }));
    send(res, 200, { scope: hub.context.state(s).binding, entries }); return true;
  }
  if (path === '/context/asset') {
    if (req.method !== 'GET') { send(res, 405, { error: '请使用 GET' }); return true; }
    const s = needSession(), asset = Number(url.searchParams.get('asset'));
    if (!Number.isSafeInteger(asset) || asset < 1) throw Error('附件编号从 1 开始');
    const item = hub.context.recallAssets(s, { id: url.searchParams.get('id') })[asset - 1];
    if (!item?.block?.attachment) throw Error('附件没有可读取的原始引用');
    const store = ctx.get?.('attachments') || ctx.attachments, ref = item.block.attachment;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (item.block.type === 'image') {
      if (!store?.readImage) throw Error('图片读取服务不可用');
      const image = await store.readImage(ref);
      res.setHeader('Content-Type', ref.mediaType || 'application/octet-stream');
      res.end(image.data); return true;
    }
    if (!store?.readFileStream) throw Error('附件读取服务不可用');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(ref.name || 'attachment'));
    await streamPipeline(Readable.from(store.readFileStream(ref)), res); return true;
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
  if (path === '/settings' && req.method === 'POST') {
    const patch = await readBody(req);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('设置必须是对象');
    delete patch.dataDir;
    const unknown = Object.keys(patch).filter(key => !Object.hasOwn(Config.dict, key));
    if (unknown.length) throw new Error('未知或已退役的设置：' + unknown.join(', '));
    contextConfig({ ...hub.config(), ...patch });
    if (patch.memoryScope !== undefined && !['session', 'project'].includes(patch.memoryScope)) throw new Error('旧 full 档不再参与跨项目记忆');
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
