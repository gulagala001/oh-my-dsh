import { randomUUID } from 'node:crypto';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { readModelReply } from './model-reply.mjs';
import { readJsonBody, sendJson } from './http.mjs';

const validateRequestId = id => {
  if (!Number.isSafeInteger(id) || id < 1) throw Error('临时聊天请求编号无效');
};
const visibleMessage = message => ({ role: message.role,
  text: message.content.filter(block => block.type === 'text').map(block => block.text).join(''),
  reasoning: message.content.filter(block => block.type === 'reasoning').map(block => block.text).join('') });
function receipt(chat, requestId) {
  const turn = chat.turns.find(turn => turn.id === requestId);
  return { requestId, committed: Boolean(turn),
    ...(turn ? { messages: [turn.user, turn.assistant].map(visibleMessage) } : {}) };
}

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
    const chat = { id: randomUUID(), route, turns: [], lastRequestId: 0, touched: Date.now(), active: null, closed: false };
    this.chats.set(chat.id, chat);
    return { id: chat.id, model: route.model };
  }
  get(id) {
    const chat = this.chats.get(id);
    if (!chat || chat.closed) throw Error('临时聊天已关闭，请重新打开。');
    chat.touched = Date.now();
    return chat;
  }
  async send(id, requestId, text, emit, signal) {
    const chat = this.get(id);
    validateRequestId(requestId);
    if (typeof text !== 'string' || !text.trim()) throw Error('请输入消息。');
    const previous = receipt(chat, requestId);
    if (previous.committed) {
      if (previous.messages[0].text !== text) throw Error('同一请求编号不能用于不同消息。');
      emit({ type: 'done', ...previous }); return;
    }
    if (requestId <= chat.lastRequestId) throw Error('此请求已结束，请确认结果后重新发送。');
    if (chat.active) throw Error('正在回复，请等待或停止后再发送。');
    chat.lastRequestId = requestId;
    const abort = new AbortController();
    const combined = AbortSignal.any([abort.signal, ...(signal ? [signal] : [])]);
    const user = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin:temporary-sidebar' } });
    const operation = { id: requestId, abort, done: null }; chat.active = operation;
    operation.done = (async () => {
      try {
        const { assembler } = await readModelReply(() => this.ctx.llm.prepareCall(chat.route, combined), {
          messages: [...chat.turns.flatMap(turn => [turn.user, turn.assistant]), user], tools: [], system: '你正在与用户进行独立的临时聊天。根据用户的问题直接作答。',
        }, combined, { start: () => emit({ type: 'start', requestId }), chunk: value => {
          if (value.type === 'text-delta' || value.type === 'reasoning-delta') emit(value);
        } });
        if (!assembler.blocks().some(block => block.type === 'text' && block.text.trim())) throw Error('模型没有返回聊天正文，请重试');
        const assistant = assembler.message({ provider: chat.route.provider, model: chat.route.model,
          ...(assembler.replayState ? { replayState: assembler.replayState } : {}) });
        combined.throwIfAborted();
        chat.turns.push({ id: requestId, user, assistant });
        emit({ type: 'done', ...receipt(chat, requestId) });
      } finally {
        if (chat.active === operation) chat.active = null;
      }
    })();
    return operation.done;
  }
  async stop(id, requestId) {
    validateRequestId(requestId);
    const chat = this.get(id), operation = chat.active;
    // Fence even a send whose HTTP body has not arrived yet. Ordered request
    // IDs need only one high-water mark; cancelled turns retain no transcript.
    chat.lastRequestId = Math.max(chat.lastRequestId, requestId);
    // A delayed stop owns only its original reply. Await its real producer
    // before confirming whether that reply entered the model's history.
    if (operation?.id === requestId) {
      operation.abort.abort(Error('回复已停止'));
      await operation.done.catch(error => { if (error?.cleanup) throw error; });
    }
    return receipt(this.get(id), requestId);
  }
  async close(id) {
    const chat = this.chats.get(id);
    if (!chat) return;
    chat.closed = true; chat.active?.abort.abort(Error('临时聊天已关闭'));
    try { await chat.active?.done?.catch(error => { if (error?.cleanup) throw error; }); }
    finally { chat.turns.length = 0; this.chats.delete(id); }
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
  if (action === 'stop') { sendJson(res, 200, await service.stop(input.id, input.requestId)); return true; }
  if (action !== 'send') { sendJson(res, 404, { error: '未知操作' }); return true; }
  if (req.aborted || res.destroyed) return true;
  service.get(input.id);
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  const abort = new AbortController(), disconnect = () => { if (!res.writableEnded) abort.abort(Error('连接已断开')); };
  res.on('close', disconnect);
  const emit = value => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(value) + '\n'); };
  try { await service.send(input.id, input.requestId, input.text, emit, abort.signal); }
  catch (error) { emit({ type: 'error', error: error.message }); }
  finally { res.off('close', disconnect); if (!res.destroyed) res.end(); }
  return true;
}
