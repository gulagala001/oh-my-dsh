import { randomUUID } from 'node:crypto';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { readModelReply } from './model-reply.mjs';
import { readJsonBody, sendJson } from './http.mjs';

/** Pure chat uses the host's model driver without creating a persistent Agent Session. */
export class TemporaryChats {
  constructor(ctx, { idleMs = 180000 } = {}) {
    this.ctx = ctx; this.chats = new Map(); this.idleMs = idleMs; this.closed = false;
    this.timer = setInterval(() => {
      for (const chat of this.chats.values()) if (Date.now() - chat.touched > idleMs) void this.close(chat.id).catch(error => this.ctx.logger?.warn?.(error.message));
    }, Math.min(idleMs, 30000));
    this.timer.unref?.();
  }
  open(parentId) {
    if (this.closed) throw Error('临时聊天已停止');
    const parent = this.ctx.sessions.get(parentId);
    const selected = parent && this.ctx.sessionProjections.stateOf(parent, 'modelSelection');
    const selection = selected?.pending ?? parent?.requestHeader()?.config ?? this.ctx.get('agentDefaultModel')?.currentSelection();
    if (!selection?.provider || !selection?.model) throw Error('请先选择聊天模型。');
    const route = { provider: selection.provider, model: selection.model,
      ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}) };
    const chat = { id: randomUUID(), route, messages: [], touched: Date.now(), active: null, closed: false };
    this.chats.set(chat.id, chat);
    return { id: chat.id, model: route.model };
  }
  get(id) {
    const chat = this.chats.get(id);
    if (!chat || chat.closed) throw Error('临时聊天已关闭，请重新打开。');
    chat.touched = Date.now();
    return chat;
  }
  async send(id, text, emit, signal) {
    const chat = this.get(id);
    if (chat.active) throw Error('正在回复，请等待或停止后再发送。');
    if (typeof text !== 'string' || !text.trim()) throw Error('请输入消息。');
    const abort = new AbortController();
    const combined = AbortSignal.any([abort.signal, ...(signal ? [signal] : [])]);
    const user = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin:temporary-sidebar' } });
    const operation = { abort, done: null }; chat.active = operation;
    operation.done = (async () => {
      try {
        const { assembler } = await readModelReply(() => this.ctx.llm.prepareCall(chat.route, combined), {
          messages: [...chat.messages, user], tools: [], system: '你正在与用户进行独立的临时聊天。根据用户的问题直接作答。',
        }, combined, { start: () => emit({ type: 'start' }), chunk: value => {
          if (value.type === 'text-delta' || value.type === 'reasoning-delta') emit(value);
        } });
        if (!assembler.blocks().some(block => block.type === 'text' && block.text.trim())) throw Error('模型没有返回聊天正文，请重试');
        const assistant = assembler.message({ provider: chat.route.provider, model: chat.route.model,
          ...(assembler.replayState ? { replayState: assembler.replayState } : {}) });
        if (!chat.closed) chat.messages.push(user, assistant);
        emit({ type: 'done' });
      } finally {
        if (chat.active === operation) chat.active = null;
      }
    })();
    return operation.done;
  }
  stop(id) { this.get(id).active?.abort.abort(Error('回复已停止')); }
  async close(id) {
    const chat = this.chats.get(id);
    if (!chat) return;
    chat.closed = true; chat.active?.abort.abort(Error('临时聊天已关闭'));
    try { await chat.active?.done?.catch(error => { if (error?.cleanup) throw error; }); }
    finally { chat.messages.length = 0; this.chats.delete(id); }
  }
  async dispose() {
    this.closed = true; clearInterval(this.timer);
    const results = await Promise.allSettled([...this.chats.keys()].map(id => this.close(id)));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, '临时聊天退出清理失败');
  }
}

export async function handleTemporaryChatApi({ service, req, res, url }) {
  if (!url.pathname.startsWith('/oh-my-dsh/api/temporary-chat/')) return false;
  if (req.method !== 'POST') { sendJson(res, 405, { error: '请使用 POST' }); return true; }
  const action = url.pathname.split('/').at(-1);
  const input = await readJsonBody(req);
  if (action === 'open') { sendJson(res, 200, service.open(input.parentId)); return true; }
  if (action === 'close') { await service.close(input.id); sendJson(res, 200, { closed: true }); return true; }
  if (action === 'touch') { service.get(input.id); sendJson(res, 200, { alive: true }); return true; }
  if (action === 'stop') { service.stop(input.id); sendJson(res, 200, { stopped: true }); return true; }
  if (action !== 'send') { sendJson(res, 404, { error: '未知操作' }); return true; }
  service.get(input.id);
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  const abort = new AbortController(), disconnect = () => { if (!res.writableEnded) abort.abort(Error('连接已断开')); };
  res.on('close', disconnect);
  const emit = value => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(value) + '\n'); };
  try { await service.send(input.id, input.text, emit, abort.signal); }
  catch (error) { emit({ type: 'error', error: error.message }); }
  finally { res.off('close', disconnect); if (!res.destroyed) res.end(); }
  return true;
}
