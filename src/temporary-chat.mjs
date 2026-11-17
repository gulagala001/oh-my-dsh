import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { randomUUID } from 'node:crypto';
import { parentAgentOptionsForDelegation } from '@deepseek-ai/dsh-subagent';
import { TemporarySessionStorage } from './temporary-session-storage.mjs';
import { readJsonBody, sendJson } from './http.mjs';

/** A native, independently prompted Session owned by one sidebar tab. */
export class TemporaryChats {
  constructor(ctx, { directory, cleanup = async () => {}, idleMs = 180000 } = {}) {
    this.ctx = ctx; this.chats = new Map(); this.idleMs = idleMs; this.closed = false;
    this.storage = new TemporarySessionStorage(ctx, directory, cleanup);
    this.timer = setInterval(() => {
      for (const chat of this.chats.values()) if (Date.now() - chat.touched > idleMs)
        void this.close(chat.id).catch(error => ctx.logger?.warn?.(error.message));
    }, Math.min(idleMs, 30000));
    this.timer.unref?.();
  }
  async open(parentId) {
    if (this.closed) throw Error('侧栏聊天已停止');
    const parent = this.ctx.agents.get(parentId), session = parent?.session ?? this.ctx.sessions.get(parentId);
    const selected = session && this.ctx.sessionProjections.stateOf(session, 'modelSelection');
    const inherited = parent ? parentAgentOptionsForDelegation(parent) : {};
    const selection = selected?.pending ?? session?.requestHeader()?.config
      ?? (inherited.provider && inherited.model ? inherited : this.ctx.get('agentDefaultModel')?.currentSelection());
    if (!selection?.provider || !selection?.model) throw Error('请先选择聊天模型。');
    const currentDirectory = session && this.ctx.get('workingDirectory').get(session);
    const id = `omd-sidebar-${randomUUID()}`, owner = this.storage.create(id);
    const chat = { id, owner, touched: Date.now(), closed: false };
    this.chats.set(id, chat);
    const presets = this.ctx.get('agentPresets');
    const preset = parent ? presets?.composedPreset(parent.ctx) : session?.header.agentPreset;
    const permission = parent?.ctx.get('permissionPresets')?.current(session);
    const sandbox = parent?.ctx.get('sandboxPolicy')?.overrideOf(session);
    const options = { ...inherited, provider: selection.provider, model: selection.model };
    if (selection.reasoningEffort === undefined) delete options.reasoningEffort; else options.reasoningEffort = selection.reasoningEffort;
    try {
      await owner.ready;
      owner.abort.signal.throwIfAborted();
      // This is user-operated, not a delegated activation: normal native prompt
      // routing, approvals and composer stay available. No automatic first turn.
      await this.ctx.agents.create({ sessionId: id, signal: owner.abort.signal, agentOptions: options,
        meta: { ...(session?.header.cwd ? { cwd: session.header.cwd } : {}), ...(preset ? { agentPreset: preset } : {}) },
        setup: async (agentCtx, agent) => {
          installModelSelection(agentCtx);
          if (parent) await presets?.composeFrom(agentCtx, parent.ctx);
          else if (presets) await presets.mount(agentCtx, (await presets.resolve(preset)).id);
          if (sandbox !== undefined) agent.session.append('sandbox/mode', { mode: sandbox, source: 'user' });
          if (permission !== undefined) agent.session.append('permission/preset', { preset: permission });
          // The header keeps the original permission root. The native directory
          // projection carries the parent's current folder independently.
          if (currentDirectory) await agentCtx.get('workingDirectory').set(agent, currentDirectory, owner.abort.signal);
        },
      });
      owner.abort.signal.throwIfAborted();
      return { id, model: selection.model };
    } catch (error) {
      try { await this.close(id); } catch (cleanup) { throw new AggregateError([error, cleanup], '侧栏聊天创建与清理失败'); }
      throw error;
    }
  }
  get(id) {
    const chat = this.chats.get(id);
    if (!chat || chat.closed) throw Object.assign(Error('侧栏聊天已关闭，请重新打开。'), { statusCode: 410 });
    chat.touched = Date.now(); return chat;
  }
  async close(id) {
    const chat = this.chats.get(id);
    if (!chat) return;
    chat.closed = true;
    await this.storage.close(chat.owner);
    this.chats.delete(id);
  }
  async dispose() {
    this.closed = true; clearInterval(this.timer);
    await this.storage.dispose(); this.chats.clear();
  }
}

export async function handleTemporaryChatApi({ service, req, res, url }) {
  if (!url.pathname.startsWith('/oh-my-dsh/api/temporary-chat/')) return false;
  if (req.method !== 'POST') { sendJson(res, 405, { error: '请使用 POST' }); return true; }
  const input = await readJsonBody(req), action = url.pathname.split('/').at(-1);
  if (action === 'open') sendJson(res, 200, await service.open(input.parentId));
  else if (action === 'close') { await service.close(input.id); sendJson(res, 200, { closed: true }); }
  else if (action === 'touch') { service.get(input.id); sendJson(res, 200, { alive: true }); }
  else sendJson(res, 404, { error: '未知操作' });
  return true;
}
