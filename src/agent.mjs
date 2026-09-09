import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { callModel } from './llm.mjs';
import { TOOLS, executeTool } from './tools.mjs';
import { ContextHub, messagesFor } from './context.mjs';
import { MAIN_PERSONA, REPLY_GUIDE } from './prompts.mjs';

export const SYSTEM = ['You are trisoul_x.', MAIN_PERSONA, REPLY_GUIDE, "Respond in the user's language."].join('\n\n');

function instructions(cwd) {
  let dir = cwd;
  while (true) {
    for (const name of ['AGENTS.md', 'CLAUDE.md']) {
      if (existsSync(join(dir, name))) return `\n\nWorkspace instructions (${join(dir, name)}):\n${readFileSync(join(dir, name), 'utf8')}`;
    }
    const parent = dirname(dir);
    if (parent === dir) return '';
    dir = parent;
  }
}

export class Agent {
  constructor(store, { model = callModel, notify = () => {} } = {}) {
    this.store = store; this.model = model; this.notify = notify; this.running = new Map(); this.runs = new Map();
    this.context = new ContextHub(store, model, notify);
  }
  stop(id) { this.running.get(id)?.abort(); }
  start(session, text) {
    if (this.running.has(session.id)) throw new Error('这个对话还在执行中。');
    const controller = new AbortController();
    this.running.set(session.id, controller);
    const event = this.store.append(session, 'message', { message: { role: 'user', content: text, timestamp: Date.now() } });
    this.notify(session.id, { type: 'message', event });
    const promise = this.run(session, controller.signal).finally(() => { this.running.delete(session.id); this.runs.delete(session.id); });
    this.runs.set(session.id, promise);
    return promise;
  }
  async run(session, signal) {
    const emit = (event) => this.notify(session.id, event);
    emit({ type: 'status', state: 'running' });
    this.context.injectMemories(session);
    try {
      const system = `${SYSTEM}\n\n## Environment\nWorking directory: ${session.events[0].cwd}\nPlatform: ${process.platform === 'darwin' ? 'macOS (darwin)' : process.platform}\nToday: ${new Date().toISOString().slice(0, 10)}${instructions(session.events[0].cwd)}`;
      while (true) {
        signal.throwIfAborted();
        try { await this.context.compact(session, false, signal); }
        catch (error) { if (signal.aborted) throw error; emit({ type: 'maintenance', state: 'error', message: error.message }); }
        const route = this.store.settings().main;
        emit({ type: 'step' });
        let message = await this.model(route, { systemPrompt: system, messages: messagesFor(session), tools: TOOLS }, { signal, onEvent: emit, sessionId: session.id });
        if (message.stopReason === 'length') message = { ...message, content: message.content.filter(b => b.type !== 'toolCall') };
        const event = this.store.append(session, 'message', { message });
        emit({ type: 'message', event });
        if (message.stopReason === 'length') throw new Error('模型达到输出上限；已保留当前内容，可提高输出上限后继续。');
        const calls = message.content.filter(b => b.type === 'toolCall');
        for (const call of calls) {
          emit({ type: 'tool_start', call });
          let result;
          try {
            signal.throwIfAborted();
            result = await executeTool(call, { store: this.store, session, signal, onOutput: delta => emit({ type: 'tool_output', id: call.id, delta }) });
          } catch (error) { result = { text: signal.aborted ? 'Canceled before completion.' : error.message, isError: true }; }
          const toolMessage = { role: 'toolResult', toolCallId: call.id, toolName: call.name, content: [{ type: 'text', text: result.text }], isError: result.isError === true, timestamp: Date.now() };
          const e = this.store.append(session, 'message', { message: toolMessage });
          emit({ type: 'tool_end', call, event: e });
        }
        signal.throwIfAborted();
        void this.context.schedule(session, !calls.length);
        if (!calls.length) break;
      }
      emit({ type: 'status', state: 'done' });
    } catch (error) {
      if (error.partial) {
        // Interrupted text remains visible on resume; incomplete tool calls never run.
        const content = error.partial.content.filter(b => b.type === 'text' || b.type === 'thinking');
        if (content.length) {
          const event = this.store.append(session, 'message', { message: { ...error.partial, content }, interrupted: true });
          emit({ type: 'message', event });
        }
      }
      const state = signal.aborted ? 'stopped' : 'error';
      this.store.append(session, 'run-end', { state, ...(state === 'error' ? { error: error.message } : {}) });
      emit({ type: 'status', state, message: state === 'error' ? error.message : '已停止' });
    }
  }
}
