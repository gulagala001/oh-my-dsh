import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const digest = value => createHash('sha256').update(value).digest('hex');
export const MAX_IMPORT_BYTES = 48 * 1024 * 1024;
export const MAX_CONTENT_BYTES = 32 * 1024 * 1024;

/** Validate the webpage-to-Host boundary while retaining original message text. */
export function normalizeImport(input) {
  if (!input || typeof input !== 'object' || !/^[A-Za-z0-9_-]{8,100}$/.test(input.requestId ?? '')) throw Error('迁移请求编号无效');
  const source = input.conversation;
  if (!source || typeof source !== 'object') throw Error('没有可迁移的网页会话');
  let url;
  try { url = new URL(source.url); } catch { throw Error('网页会话地址无效'); }
  if (url.origin !== 'https://chat.deepseek.com' || url.username || url.password) throw Error('只能迁移 DeepSeek 官网聊天');
  if (!Array.isArray(source.messages) || !source.messages.length || source.messages.length > 10000) throw Error('网页会话没有消息，或消息数量超过限制');
  let bytes = 0;
  const messages = source.messages.map((message, index) => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string') throw Error(`第 ${index + 1} 条消息的角色或正文无效`);
    bytes += Buffer.byteLength(message.text);
    const attachments = message.attachments ?? [];
    if (!Array.isArray(attachments) || attachments.length > 64) throw Error('附件数量无效');
    const accepted = attachments.map(file => {
      if (!file || typeof file.name !== 'string' || !file.name || file.name.length > 255) throw Error('附件名称无效');
      const result = { name: file.name };
      if (file.url !== undefined) {
        let address;
        try { address = new URL(file.url); } catch { throw Error('附件地址无效'); }
        if (address.protocol !== 'https:' || address.username || address.password) throw Error('附件地址无效');
        result.url = address.href;
      }
      if (file.mediaType !== undefined) {
        if (typeof file.mediaType !== 'string' || file.mediaType.length > 100) throw Error('附件格式无效');
        result.mediaType = file.mediaType;
      }
      if (file.data !== undefined) {
        if (typeof file.data !== 'string' || file.data.length > Math.ceil(MAX_CONTENT_BYTES / 3) * 4) throw Error('附件编码无效或文件过大');
        const decoded = Buffer.from(file.data, 'base64');
        if (decoded.toString('base64') !== file.data) throw Error('附件编码无效');
        bytes += decoded.length; result.data = file.data;
      }
      return result;
    });
    if (!message.text.trim() && !accepted.length) throw Error(`第 ${index + 1} 条消息为空`);
    const result = { role: message.role, text: message.text, attachments: accepted };
    if (message.sourceMessageId !== undefined) {
      if (typeof message.sourceMessageId !== 'string' || message.sourceMessageId.length > 256) throw Error('原消息编号无效');
      result.sourceMessageId = message.sourceMessageId;
    }
    if (message.timestamp !== undefined) {
      if (!Number.isSafeInteger(message.timestamp) || message.timestamp < 0) throw Error('原消息时间无效');
      result.timestamp = message.timestamp;
    }
    return result;
  });
  if (bytes > MAX_CONTENT_BYTES) throw Error('网页会话及附件超过 32 MiB 迁移上限');
  if (messages[0].role !== 'user') throw Error('网页会话开头缺少用户消息，请加载完整历史后重试');
  if (source.title !== undefined && typeof source.title !== 'string') throw Error('会话标题无效');
  const title = (source.title || messages[0].text || 'DeepSeek 网页聊天').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) || 'DeepSeek 网页聊天';
  const warnings = source.warnings ?? [];
  if (!Array.isArray(warnings) || warnings.length > 64 || warnings.some(row => typeof row !== 'string' || row.length > 1000)) throw Error('迁移状态无效');
  if (input.cwd !== undefined && (typeof input.cwd !== 'string' || !isAbsolute(input.cwd) || input.cwd.includes('\0'))) throw Error('目标目录必须是绝对路径');
  if (input.agentPreset !== undefined && (typeof input.agentPreset !== 'string' || !input.agentPreset || input.agentPreset.length > 100)) throw Error('目标模式无效');
  return { requestId: input.requestId, conversation: { url: url.href, title, messages, warnings: [...warnings] }, ...(input.cwd === undefined ? {} : { cwd: input.cwd }), ...(input.agentPreset === undefined ? {} : { agentPreset: input.agentPreset }) };
}

/** Build ordinary closed DSH turns without replaying webpage text as tool execution. */
export function importSeed(conversation, key, selection, content, now = Date.now()) {
  const events = [];
  const append = (type, data, surfaceOp) => events.push({ type, data, seq: events.length, time: now, ...(surfaceOp ? { surfaceOp } : {}) });
  let turn = 0, step = 1, open = false, answered = false;
  const finish = () => {
    if (!open) return;
    append('step/end', { turn, step });
    append('turn/end', { turn, reason: { kind: answered ? 'completed' : 'interrupted' } });
    open = false;
  };
  conversation.messages.forEach((row, index) => {
    if (row.role === 'user') {
      finish(); turn++; step = 1; answered = false; open = true; append('turn/start', { turn }); append('step/start', { turn, step });
      if (index === 0) append('system/message', { turn, step, message: { id: `message-${key}-system`, role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: '' }] } }, 'append');
    }
    else if (answered) { append('step/end', { turn, step }); step++; append('step/start', { turn, step }); }
    const message = { id: `message-${key}-${index}`, role: row.role, source: row.role === 'user' ? { kind: 'user' } : { kind: 'model', provider: 'deepseek-web', model: 'website-history' }, content: content?.[index] ?? [{ type: 'text', text: row.text }] };
    if (row.role === 'user') append('user/message', message, 'append');
    else { append('assistant/message', { turn, step, message, stream: [] }, 'append'); answered = true; }
  });
  finish();
  append('model/selection', selection);
  return events;
}

/** Serialize one migration request, including recovery after a lost HTTP reply or restart. */
export class ConversationImporter {
  constructor({ ctx, directory }) { this.ctx = ctx; this.directory = directory; this.pending = new Map(); }
  import(input) {
    const accepted = normalizeImport(input), key = digest(accepted.requestId), fingerprint = digest(JSON.stringify(accepted));
    const previous = this.pending.get(key);
    if (previous) { if (previous.fingerprint !== fingerprint) return Promise.reject(Error('同一个迁移请求的内容已改变')); return previous.promise; }
    const promise = this.perform(accepted, key, fingerprint).finally(() => this.pending.delete(key));
    this.pending.set(key, { fingerprint, promise }); return promise;
  }
  async perform(input, key, fingerprint) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = join(this.directory, `${key}.json`);
    let record;
    try { record = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (record && record.fingerprint !== fingerprint) throw Error('同一个迁移请求的内容已改变');
    const sessionId = `session-deepseek-${key}`;
    let cwd = record?.cwd ?? input.cwd;
    if (!cwd) {
      const projectless = this.ctx.get('trisoulX')?.projectless;
      cwd = projectless ? (await projectless.prepare({ requestId: `deepseek-${key}`, prompt: input.conversation.title })).cwd : join(this.directory, 'chats', key);
    }
    const save = async value => { const temporary = `${path}.tmp`; await writeFile(temporary, JSON.stringify(value), { mode: 0o600 }); await rename(temporary, path); record = value; };
    if (!record) await save({ fingerprint, sessionId, cwd, title: input.conversation.title, warnings: input.conversation.warnings,
      sourceUrl: input.conversation.url, sourceMessages: input.conversation.messages.map((row, index) => ({ index, ...(row.sourceMessageId === undefined ? {} : { id: row.sourceMessageId }), ...(row.timestamp === undefined ? {} : { timestamp: row.timestamp }) })), complete: false });
    let session = this.ctx.sessions.get(sessionId);
    if (!session) {
      const query = this.ctx.get('sessionQuery');
      try { if (query) session = await query.readSession(sessionId); }
      catch (error) { if (error.code !== 'SESSION_QUERY_SESSION_NOT_FOUND') throw error; }
    }
    if (record.complete) {
      if (!session) throw Error('迁移后的 DSH 会话已被删除，请重新发起迁移');
      return { sessionId, title: record.title, warnings: record.warnings };
    }
    if (!session) {
      const defaultModel = this.ctx.get('agentDefaultModel');
      const selection = defaultModel?.currentSelection();
      if (!selection?.provider || !selection.model) throw Error('请先在 DSH 设置中选择用于续聊的模型');
      const resolved = await this.ctx.llm.resolveCallConfig(selection);
      const continuation = { provider: resolved.provider, model: resolved.model, ...(resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort }) };
      const presets = this.ctx.get('agentPresets');
      const preset = presets ? await presets.resolve(input.agentPreset) : undefined;
      if (preset?.error) throw Error(`目标模式不可用：${preset.error}`);
      await mkdir(cwd, { recursive: true });
      const warnings = [...input.conversation.warnings];
      if (input.conversation.messages.at(-1).role === 'user') warnings.push('原网页最后一条用户消息尚未回答，已保留；迁移不会自动发送。');
      const content = await this.materializeAttachments(input.conversation.messages, warnings);
      await save({ ...record, warnings });
      const handle = await this.ctx.agents.create({ sessionId, meta: { cwd, ...(preset ? { agentPreset: preset.id } : {}) }, agentOptions: continuation,
        seed: importSeed(input.conversation, key, continuation, content), setup: async agentCtx => { if (presets) await presets.mount(agentCtx, preset.id); } });
      session = handle.agent.session;
    }
    const controller = this.ctx.get('sessionController');
    if (controller?.rename) await controller.rename({ sessionId, title: record.title });
    const live = this.ctx.sessions.get(sessionId);
    if (live && !await this.ctx.sessions.flush(live)) throw Error('DSH 会话持久化不可用，迁移尚未完成，请启用会话存储后重试');
    const registry = this.ctx.get('workspaceRegistry');
    if (registry && input.cwd) { const workspace = await registry.create(cwd, record.title); await workspace.attachSession(sessionId); }
    await save({ ...record, complete: true });
    return { sessionId, title: record.title, warnings: record.warnings };
  }
  async materializeAttachments(messages, warnings) {
    const store = this.ctx.get('attachments');
    return Promise.all(messages.map(async row => {
      const content = row.text ? [{ type: 'text', text: row.text }] : [];
      for (const file of row.attachments) {
        if (file.data !== undefined && store) {
          const data = Buffer.from(file.data, 'base64');
          if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mediaType)) content.push({ type: 'image', attachment: await store.saveImage({ data, mediaType: file.mediaType, name: file.name }) });
          else content.push({ type: 'file', attachment: await store.saveFile({ data, name: file.name }) });
        } else {
          content.push({ type: 'text', text: `\n[原网页附件：${file.name}]${file.url ? `(${file.url})` : ''}` });
          warnings.push(`附件“${file.name}”未取得原始文件，保留了名称${file.url ? '和链接' : ''}。`);
        }
      }
      return content;
    }));
  }
}
