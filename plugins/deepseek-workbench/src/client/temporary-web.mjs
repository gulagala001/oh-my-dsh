import { commandScript, statusScript } from './native-chat-bridge.mjs';

import { chatIdentity, holdTemporaryOwner, recordTemporary, forgetTemporary, liveTemporaryOwners, recoverOwners } from './temporary-ownership.mjs';
export { chatIdentity, liveTemporaryOwners };


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
      } finally { state.pending = null; }
    };
    service.createSession = wrapped;
    return { ready: true };
  }
  if (command.type !== 'delete' || !/^[a-zA-Z0-9_-]+$/.test(command.id || '')) throw Error('无效的临时会话标识。');
  const deleted = await controller.deleteSession(command.id);
  if (deleted !== true) throw Error('官网尚未确认删除临时对话，请保持登录并重试关闭。');
  return { deleted: true, id: command.id };
}
const temporaryPageSource = typeof __DSWB_TEMPORARY_SOURCE__ === 'string' ? __DSWB_TEMPORARY_SOURCE__ : temporaryPageCommand.toString();
export const temporaryScript = command => `(${temporaryPageSource})(${JSON.stringify(command)})`;

/** Holds only this guest's newly created conversation; normal web history is never claimed. */
export class TemporaryWebChat {
  constructor({ storage = localStorage, locks = globalThis.navigator?.locks, notify = () => {} } = {}) {
    this.storage = storage; this.locks = locks; this.notify = notify; this.token = crypto.randomUUID();
    this.owned = new Map(); this.adapter = null; this.pending = null; this.closing = false; this.closed = false;
    this.armed = false; this.syncWarning = ''; this.closeError = ''; this.listeners = new Set();
    liveTemporaryOwners.add(this.token);
  }
  subscribe = callback => { this.listeners.add(callback); return () => this.listeners.delete(callback); };
  get error() { return this.closeError || this.syncWarning; }
  warnSync(error) {
    if (this.closed || !this.armed || this.persisted) return;
    this.syncWarning = '临时聊天的归属尚未同步；关闭前会重新核对：' + error.message; this.publish();
  }
  publish() { for (const listener of this.listeners) listener(); }
  observe(url) {
    this.lastUrl = url;
    // A navigation is never ownership evidence. Only the official create receipt is.
    if (!this.closed && this.armed && !this.persisted && this.adapter) void this.capture().catch(() => {});
  }
  async capture(wait = false) {
    if (this.closed || !this.armed || this.persisted || !this.adapter) return;
    try {
      let identity = this.owned.values().next().value;
      if (!identity) {
        const receipt = await this.adapter.extract(temporaryScript({ type: 'owned', token: this.token, wait }));
        if (this.closed || this.persisted) return;
        if (!/^[a-zA-Z0-9_-]+$/.test(receipt?.id || '')) return;
        identity = { id: receipt.id, url: chatIdentity(this.lastUrl)?.id === receipt.id
          ? this.lastUrl : `https://chat.deepseek.com/a/chat/s/${receipt.id}` };
        this.owned.set(identity.id, identity);
      }
      recordTemporary(this.storage, identity, this.token, !!this.releaseOwner);
      this.persisted = true;
      if (this.syncWarning) { this.syncWarning = ''; this.publish(); }
    } catch (error) { this.warnSync(error); throw error; }
  }
  async run(type, extra = {}) {
    if (this.closing || this.closed || this.closeError || this.pending) throw Error('临时会话正在处理，请稍候。');
    if (!this.adapter) throw Error('网页尚未就绪。');
    if (!['send', 'think', 'search', 'upload', 'stop'].includes(type)) throw Error('临时会话不支持此操作。');
    const work = async () => {
      const status = await this.adapter.extract(statusScript);
      const current = chatIdentity(status.url);
      if (current ? !this.owned.has(current.id) : this.owned.size || new URL(status.url).pathname !== '/') {
        throw Error('临时聊天已离开自己的页面，请关闭后重新打开；现有历史不会被修改。');
      }
      await this.adapter.extract(temporaryScript({ type: 'probe' }));
      if (!this.recovered) { await recoverTemporaryChats(this.adapter, this.storage, liveTemporaryOwners, {locks:this.locks}); this.recovered = true; }
      if (type === 'send' && this.armed && !this.owned.size) {
        await this.capture(true);
        if (!this.owned.size && (await this.adapter.extract(temporaryScript({type:'owned',token:this.token}))).started)
          throw Error('上次创建结果尚未确认，请核对官网历史后再发送。');
      }
      if (type === 'send' && !this.owned.size) {
        this.releaseOwner ??= await holdTemporaryOwner(this.token, this.locks);
        await this.adapter.extract(temporaryScript({ type: 'arm', token: this.token }));
        this.armed = true;
        try { recordTemporary(this.storage, null, this.token, !!this.releaseOwner); }
        catch (error) { this.warnSync(error); }
      }
      try {
        const result = await this.adapter.extract(commandScript({ type, ...extra, expectedUrl: status.url }));
        // An unacknowledged dispatch stays fenced until its creation receipt is known.
        return result;
      }
      finally {
        try {
          const latest = await this.adapter.extract(statusScript);
          this.observe(latest.url);
          await this.capture();
        } catch (error) {
          this.warnSync(error);
        }
      }
    };
    this.pending = work();
    try { return await this.pending; } finally { this.pending = null; }
  }
  async close() {
    if (this.closed) return;
    if (this.cleanup) return this.cleanup;
    this.closing = true; this.closeError = ''; this.publish();
    this.cleanup = (async () => {
      try {
        await this.pending?.catch(() => {});
        await this.capture(true);
        if (this.armed && !this.owned.size) {
          const receipt = await this.adapter.extract(temporaryScript({ type: 'owned', token: this.token }));
          if (receipt.pending) throw Error('官网创建仍未结束，请等待后重试关闭。');
          if (receipt.started) throw Error('官网创建结果未知，请保留此页，在官网历史中核对本次会话；未执行删除。');
          forgetTemporary(this.storage, {id:null,owner:this.token});
        }
        if (this.owned.size && !this.adapter) throw Error('网页尚未就绪，无法确认删除；请重新加载后重试关闭。');
        for (const item of this.owned.values()) {
          if (!item.deleted) {
            const receipt = await this.adapter.extract(temporaryScript({ type: 'delete', id: item.id }));
            if (!receipt?.deleted || receipt.id !== item.id) throw Error('临时聊天删除回执不匹配。');
            item.deleted = true;
          }
          forgetTemporary(this.storage, {id:item.id, owner:this.token});
          this.owned.delete(item.id);
        }
        this.closed = true;
        await this.detachOwner();
      } catch (error) { this.closeError = error.message; throw error; }
      finally { this.closing = false; this.cleanup = null; this.publish(); }
    })();
    return this.cleanup;
  }
  async detachOwner() {
    liveTemporaryOwners.delete(this.token);
    await this.releaseOwner?.();
    this.releaseOwner = undefined;
  }
}

/** A live window and a recovery worker take the same origin-wide owner lock. */
export function recoverTemporaryChats(adapter, storage = localStorage, liveOwners = liveTemporaryOwners,
  { locks = globalThis.navigator?.locks, confirmed = [] } = {}) {
  return recoverOwners(storage, liveOwners, locks, confirmed, async row => {
    const result = await adapter.extract(temporaryScript({ type: 'delete', id: row.id }));
    if (!result?.deleted || result.id !== row.id) throw Error('上次临时聊天尚未清理，请重试。');
  });
}
