import { createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm';

export const MAX_QUESTION = 16000;
export const MAX_ANSWER = 64000;
export const MAX_HISTORY = 20;

export function validateQuestion(value) {
  if (typeof value !== 'string' || !value.trim()) throw Error('请输入旁聊问题');
  if (value.length > MAX_QUESTION) throw Error('问题过长，请控制在 16000 字符内');
  return value.trim();
}

/** A detached request projection. Frozen source messages are never edited. */
export function sideMessages(source, question, history = [], config = { provider: 'side-chat', model: 'side-chat' }) {
  if (!Array.isArray(history) || history.length > MAX_HISTORY) throw Error('旁聊记录无效');
  // Preserve the complete cached prefix, including developer tool updates,
  // reasoning signatures and stable message identities. Only append below it.
  const messages = [...source];
  const pending = new Map();
  for (const message of source) {
    if (message.role === 'tool') pending.delete(message.toolCallId);
    if (message.role === 'assistant') for (const block of message.content) {
      if (block.type === 'tool-call') pending.set(block.id, block.name);
    }
  }
  for (const [callId, name] of pending) messages.push(createToolResultMessage({
    callId, isError: false,
    content: [{ type: 'text', text: `${name}: the main conversation has not supplied a result in this snapshot. It may still be running. This is a temporary side-question placeholder, not evidence of success, failure, or cancellation.` }],
  }));
  messages.push({
    role: 'user',
    content: [{ type: 'text', text: 'The following is a separate side conversation. Use the main conversation above as context, but answer only the side question. Be concise and start directly with the answer; do not repeat the question as a heading or add introductory explanations. The main task continues independently. Answer in text only. Do not call tools, invent tool results, or claim to have changed files. If information is missing, say so. These side exchanges will not be added to the main conversation.' }],
  });
  for (const exchange of history) {
    if (typeof exchange?.question !== 'string' || typeof exchange?.answer !== 'string'
      || exchange.question.length > MAX_QUESTION || exchange.answer.length > MAX_ANSWER) throw Error('旁聊记录无效');
    messages.push({ role: 'user', content: [{ type: 'text', text: exchange.question }] });
    messages.push(createAssistantMessage({
      source: {
        provider: typeof exchange.provider === 'string' ? exchange.provider : config.provider,
        model: typeof exchange.model === 'string' ? exchange.model : config.model,
      },
      content: [{ type: 'text', text: exchange.answer }],
    }));
  }
  messages.push({ role: 'user', content: [{ type: 'text', text: validateQuestion(question) }] });
  return messages;
}

/** Consume the independent LLM stream; completion must be explicit. */
export async function answer(llm, snapshot, messages, signal, emit) {
  let terminal, length = 0, hasText = false;
  // Match the main request's provider projection and cache affinity. Schemas
  // remain cache material; this one-shot consumer has no tool executor.
  for await (const chunk of llm.stream({
    ...snapshot.config, messages, tools: snapshot.tools,
    toolHistory: snapshot.toolHistory, sessionId: snapshot.sessionId, signal,
  })) {
    signal.throwIfAborted();
    if (chunk.type === 'text-delta') {
      length += chunk.text.length;
      if (length > MAX_ANSWER) throw Error('回答达到长度上限；已保留已收到的内容');
      hasText ||= !!chunk.text;
      emit({ type: 'text', text: chunk.text });
    } else if (chunk.type === 'reasoning-delta') {
      emit({ type: 'thinking' });
    } else if (chunk.type === 'usage') {
      emit({ type: 'usage', usage: chunk.usage });
    } else if (chunk.type === 'finish') {
      terminal = chunk.reason;
    }
  }
  signal.throwIfAborted();
  if (!terminal) throw Error('连接提前结束，回答可能不完整');
  if (terminal.kind === 'error' || terminal.kind === 'aborted') throw Error(terminal.failure?.message || '模型请求未完成');
  if (terminal.kind === 'tool-calls') throw Error('模型请求了工具；旁聊没有执行任何工具');
  if (terminal.kind !== 'stop' && terminal.kind !== 'max-tokens') throw Error('模型返回了未知的结束状态');
  if (!hasText) throw Error('模型没有返回文字回答');
  emit({ type: 'done', truncated: terminal.kind === 'max-tokens' });
}
