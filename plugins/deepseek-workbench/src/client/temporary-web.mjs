import { commandScript, statusScript } from './native-chat-bridge.mjs';

export function chatIdentity(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/a\/[^/]+\/s\/([a-zA-Z0-9_-]+)\/?$/);
    return url.origin === 'https://chat.deepseek.com' && match ? { id: match[1], url: url.origin + url.pathname } : null;
  } catch { return null; }
}

/** Runs inside the owned official page. Uses the site's own controller, never credentials. */
export async function temporaryPageCommand(command) {
  if (location.origin !== 'https://chat.deepseek.com') throw Error('请先完成 DeepSeek 登录。');
  const key = Symbol.for('dsh.deepseek-workbench.temporary-creation');
  if (command.type === 'owned') {
    const state = window[key];
    if (!state || state.token !== command.token) throw Error('临时对话创建回执不可用，请保持页面并重试。');
    if (command.wait && state.pending) {
      let timer;
      try { await Promise.race([state.pending, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('官网创建仍未结束，请稍后重试关闭。')), 15000); })]); }
      finally { clearTimeout(timer); }
    }
    return { id: state.id, started: state.started, pending: Boolean(state.pending) };
  }
  let controller;
  for (const node of [document.querySelector('textarea[name="search"]'), ...document.querySelectorAll('a[href],button')].filter(Boolean)) {
    const key = Object.keys(node).find(key => key.startsWith('__reactFiber$'));
    for (let fiber = node[key], depth = 0; fiber && depth++ < 160; fiber = fiber.return) {
      const candidates = [fiber.memoizedProps?.value];
      for (let item = fiber.dependencies?.firstContext; item; item = item.next) candidates.push(item.memoizedValue);
      controller = candidates.map(value => value?.chatController).find(value =>
        typeof value?.deleteSession === 'function' && typeof value?.abortCompletion === 'function'
        && typeof value?.createSessionAndStartCompletion === 'function');
      if (controller) break;
    }
    if (controller) break;
  }
  if (!controller) throw Error('当前官网页面不支持已核实的临时会话清理，请重新加载后重试。');
  if (command.type === 'probe') {
    if (typeof controller.sessionService?.createSession !== 'function') throw Error('官网临时对话创建接口已变化，请更新插件。');
    return { ready: true };
  }
  if (command.type === 'arm') {
    if (location.pathname !== '/') throw Error('临时聊天必须从空白页面开始。');
    const service = controller.sessionService, original = service?.createSession;
    if (typeof original !== 'function') throw Error('官网临时对话创建接口已变化，请更新插件。');
    if (window[key]?.token === command.token) return { ready: true };
    if (window[key]) throw Error('此网页已有临时对话，请关闭后重新打开。');
    const state = { token: command.token, started: false, pending: null, id: null };
    window[key] = state;
    const wrapped = async function (...args) {
      if (state.started) throw Error('临时页只允许创建一个对话。');
      state.started = true;
      state.pending = Promise.resolve().then(() => original.apply(this, args));
      try {
        const result = await state.pending;
        const id = result?.session?.id;
        if (typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id)
          && ['api', 'pre_create'].includes(result.source)) state.id = id;
        return result;
      } finally { state.pending = null; if (!state.id) state.started = false; }
    };
    service.createSession = wrapped;
    return { ready: true };
  }
  if (command.type !== 'delete' || !/^[a-zA-Z0-9_-]+$/.test(command.id || '')) throw Error('无效的临时会话标识。');
  const deleted = await controller.deleteSession(command.id);
  if (deleted !== true) throw Error('官网尚未确认删除临时对话，请保持登录并重试关闭。');
  return { deleted: true, id: command.id };
}
export const temporaryScript = command => `(()=>{const __name=fn=>fn;return (${temporaryPageCommand.toString()})(${JSON.stringify(command)})})()`;

const ledgerKey = 'dsh-deepseek-workbench.pending-temporary.v1';
export const liveTemporaryOwners = new Set();
function pending(storage) {
  try { return JSON.parse(storage.getItem(ledgerKey) || '[]').filter(item => chatIdentity(item.url)?.id === item.id); }
  catch { return []; }
}
function save(storage, rows) {
  if (rows.length) storage.setItem(ledgerKey, JSON.stringify(rows));
  else storage.removeItem(ledgerKey);
}

/** Holds only this guest's newly created conversation; normal web history is never claimed. */
export class TemporaryWebChat {
  constructor({ storage = localStorage, notify = () => {} } = {}) {
    this.storage = storage; this.notify = notify; this.token = crypto.randomUUID();
    this.owned = new Map(); this.adapter = null; this.pending = null; this.closing = false; this.closed = false;
    this.armed = false; this.error = ''; this.listeners = new Set();
    liveTemporaryOwners.add(this.token);
  }
  subscribe = callback => { this.listeners.add(callback); return () => this.listeners.delete(callback); };
  publish() { for (const listener of this.listeners) listener(); }
  observe(url) {
    this.lastUrl = url;
    // A navigation is never ownership evidence. Only the official create receipt is.
    if (!this.closed && this.armed && !this.owned.size && this.adapter) void this.capture().catch(() => {});
  }
  async capture(wait = false) {
    if (this.closed || !this.armed || this.owned.size || !this.adapter) return;
    const receipt = await this.adapter.extract(temporaryScript({ type: 'owned', token: this.token, wait }));
    if (this.closed) return;
    if (!/^[a-zA-Z0-9_-]+$/.test(receipt?.id || '')) return;
    const identity = { id: receipt.id, url: chatIdentity(this.lastUrl)?.id === receipt.id
      ? this.lastUrl : `https://chat.deepseek.com/a/chat/s/${receipt.id}` };
    this.owned.set(identity.id, identity);
    const rows = pending(this.storage);
    save(this.storage, [...rows.filter(row => row.id !== identity.id), { ...identity, owner: this.token }]);
  }
  async run(type, extra = {}) {
    if (this.closing || this.closed || this.pending) throw Error('临时会话正在处理，请稍候。');
    if (!this.adapter) throw Error('网页尚未就绪。');
    if (!['send', 'think', 'search', 'upload'].includes(type)) throw Error('临时会话不支持此操作。');
    const work = async () => {
      const status = await this.adapter.extract(statusScript);
      const current = chatIdentity(status.url);
      if (current ? !this.owned.has(current.id) : this.owned.size || new URL(status.url).pathname !== '/') {
        throw Error('临时聊天已离开自己的页面，请关闭后重新打开；现有历史不会被修改。');
      }
      await this.adapter.extract(temporaryScript({ type: 'probe' }));
      if (!this.recovered) { await recoverTemporaryChats(this.adapter, this.storage, liveTemporaryOwners); this.recovered = true; }
      if (type === 'send' && !this.owned.size) {
        await this.adapter.extract(temporaryScript({ type: 'arm', token: this.token }));
        this.armed = true;
      }
      try {
        const result = await this.adapter.extract(commandScript({ type, ...extra }));
        // An unacknowledged dispatch stays fenced until its creation receipt is known.
        return result;
      }
      finally {
        const latest = await this.adapter.extract(statusScript);
        this.observe(latest.url);
        await this.capture();
      }
    };
    this.pending = work();
    try { return await this.pending; } finally { this.pending = null; }
  }
  async close() {
    if (this.closed) return;
    if (this.cleanup) return this.cleanup;
    this.closing = true; this.error = ''; this.publish();
    this.cleanup = (async () => {
      try {
        await this.pending?.catch(() => {});
        await this.capture(true);
        if (this.armed && !this.owned.size) {
          const receipt = await this.adapter.extract(temporaryScript({ type: 'owned', token: this.token }));
          if (receipt.pending) throw Error('本次发送结果尚未确认，请等待官网完成后重试关闭。');
          // No successful official creation means there is nothing owned to delete.
        }
        if (this.owned.size && !this.adapter) throw Error('网页尚未就绪，无法确认删除；请重新加载后重试关闭。');
        for (const item of this.owned.values()) {
          const receipt = await this.adapter.extract(temporaryScript({ type: 'delete', id: item.id }));
          if (!receipt?.deleted || receipt.id !== item.id) throw Error('临时聊天删除回执不匹配。');
          save(this.storage, pending(this.storage).filter(row => row.id !== item.id));
          this.owned.delete(item.id);
        }
        this.closed = true;
        liveTemporaryOwners.delete(this.token);
      } catch (error) { this.error = error.message; throw error; }
      finally { this.closing = false; this.cleanup = null; this.publish(); }
    })();
    return this.cleanup;
  }
}

/** Crash recovery contains IDs only, never messages, prompts or attachment contents. */
export async function recoverTemporaryChats(adapter, storage = localStorage, liveOwners = new Set()) {
  for (const row of pending(storage).filter(row => !liveOwners.has(row.owner))) {
    const result = await adapter.extract(temporaryScript({ type: 'delete', id: row.id }));
    if (!result?.deleted || result.id !== row.id) throw Error('上次临时聊天尚未清理，请重试。');
    save(storage, pending(storage).filter(item => item.id !== row.id));
  }
}
