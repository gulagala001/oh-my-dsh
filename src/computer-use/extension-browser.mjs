import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { BrowserActions } from './browser-actions.mjs';
import { ExtensionCdp } from './extension-cdp.mjs';
import { BrowserTransport } from './browser-transport.mjs';
import { cancelWebMcp } from './browser-webmcp.mjs';

const disconnected = () => Object.assign(new Error('Chrome 连接已改变，请重新选择当前标签页。'), { code: 'EXTENSION_DISCONNECTED' });
const failures = (results, message) => {
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, message + ': ' + errors.map(error => error.message).join('; '));
};

// Existing Chrome has no process owned by this backend. Each selected tab has
// one extension lease and independent controller/preview CDP clients.
export class ExtensionBrowser extends BrowserActions {
  constructor(hub, info, options = {}) {
    super({ ...options, id: info.id });
    this.hub = hub; this.info = info; this.run = { id: info.epoch };
    this.windowCursor = info.capabilities?.includes('cursor-overlay') === true;
    this.tabs = new Map(); this.entries = new Map(); this.disconnecting = new Map(); this.pendingCreations = new Map();
    this.onControlLost = options.onControlLost;
    this.onDisconnect = browser => { if (browser.id === this.id && browser.epoch === this.info.epoch) this.invalidate(); };
    hub.on('disconnected', this.onDisconnect);
  }
  checkConnection(connection) {
    if (this.closing || this.run.lost || connection?.closing || this.hub.list().find(browser => browser.id === this.id)?.epoch !== this.info.epoch) throw disconnected();
  }
  recordId(connection) { return connection.tabId; }
  remember(tab) {
    const existing = this.tabs.get(tab.id);
    const info = { id: existing?.id ?? this.id + '/' + this.info.epoch + '/' + tab.id + '/' + randomUUID(), browserId: this.id, title: tab.title, url: tab.url, nativeTabId: Number(tab.id) };
    this.tabs.set(tab.id, info); this.records.set(info.id, info); return info;
  }
  async list(_sessionId, { signal } = {}) {
    this.checkConnection();
    const tabs = await this.hub.call(this.id, 'tabs.list', {}, { signal }); this.checkConnection();
    const live = new Set(tabs.map(tab => tab.id));
    for (const [nativeId, info] of this.tabs) if (!live.has(nativeId)) this.forget(info.id);
    return tabs.map(tab => { const info = this.remember(tab); return { ...info, owner: this.owners.get(info.id)?.sessionId ?? null }; });
  }
  forget(id, error) {
    const info = this.records.get(id); if (!info) return;
    this.records.delete(id); this.tabs.delete(String(info.nativeTabId)); this.owners.delete(id);
    if (error) this.onControlLost?.(id, error);
    this.onTabClosed?.(id);
  }
  invalidate() {
    if (this.run.lost) return; this.run.lost = true;
    const tabs = [...this.records.keys()]; this.records.clear(); this.tabs.clear(); this.owners.clear();
    this.onBrowserLost?.(tabs, disconnected(), this.run.id);
  }
  async connection(sessionId) {
    if (this.disconnecting.has(sessionId)) await this.disconnecting.get(sessionId);
    this.checkConnection();
    if (!this.connections.has(sessionId)) this.connections.set(sessionId, Promise.resolve({ pages: new Map(), links: new Map(), run: this.run }));
    return this.connections.get(sessionId);
  }
  async entry(info) {
    let entry = this.entries.get(info.id);
    if (entry?.closing) { await entry.closing; entry = this.entries.get(info.id); }
    if (!entry) {
      const gateway = new ExtensionCdp(this.hub, this.id, { id: String(info.nativeTabId), title: info.title, url: info.url, creationId: this.pendingCreations.get(info.id) });
      entry = { gateway, links: new Set(), tabId: info.id }; this.entries.set(info.id, entry);
      gateway.on('metadata', changed => {
        const current = this.records.get(info.id);
        if (current && !entry.closing) { const next = { ...current, title: changed.title, url: changed.url }; this.records.set(info.id, next); this.tabs.set(String(next.nativeTabId), next); }
      });
      gateway.on('lost', error => { if (!entry.closing && !this.closing) this.forget(info.id, error.tabClosed && error.released ? undefined : error); });
      entry.ready = gateway.start().catch(error => { if (this.entries.get(info.id) === entry) this.entries.delete(info.id); throw error; });
    }
    await entry.ready; this.checkConnection(); return entry;
  }
  async target(sessionId, id, { claim = true, signal } = {}) {
    signal?.throwIfAborted(); this.checkConnection();
    const info = this.records.get(id); if (!info) throw new Error('This tab control has ended. List tabs and explicitly select the current target.');
    const owned = this.owners.has(id);
    if (claim) this.claim(sessionId, id);
    const connection = await this.connection(sessionId); signal?.throwIfAborted(); this.checkConnection(connection);
    let link = connection.links.get(id);
    if (!link) {
      link = { clientId: randomUUID(), tabId: id, pages: connection.pages, closing: false };
      connection.links.set(id, link);
      link.ready = (async () => {
        const entry = await this.entry(info); link.entry = entry; entry.links.add(link);
        if (connection.closing) throw disconnected();
        const transport = new BrowserTransport(entry.gateway.endpointFor(link.clientId), this.onPointer && (event => {
          const accepted = this.onPointer({ ...event, sessionId, tabId: id });
          if (accepted && this.windowCursor) void entry.gateway.cursor(link.clientId, event).catch(error => { link.cursorError = error; });
        }), () => this.wantsPointer?.(sessionId, id) ?? true);
        try { link.browser = await chromium.connectOverCDP(transport, { isLocal: true, noDefaults: true, timeout: 15000 }); }
        catch (error) { transport.close(); throw error; }
        if (connection.closing) throw disconnected();
        link.context = link.browser.contexts()[0];
        link.context.on('dialog', () => {});
        link.context.setDefaultTimeout(8000); link.context.setDefaultNavigationTimeout(15000);
        const page = link.context.pages()[0]; if (!page) throw new Error('The selected Chrome tab closed while connecting');
        const record = await this.bind(link, page); this.checkConnection(connection); return record;
      })();
      void link.ready.catch(() => {});
    }
    try { const record = await link.ready; signal?.throwIfAborted(); this.checkConnection(connection); return record; }
    catch (error) {
      if (claim && !owned && this.owners.get(id)?.sessionId === sessionId) this.owners.delete(id);
      await this.closeLink(connection, link).catch(() => {}); throw error;
    }
  }
  async create(sessionId, url = 'about:blank', signal) {
    signal?.throwIfAborted(); this.checkConnection();
    const creationId = randomUUID(); let tab;
    try {
      const created = await this.hub.call(this.id, 'tabs.create', { creationId }, { signal });
      signal?.throwIfAborted(); tab = this.remember(created);
      this.pendingCreations.set(tab.id, creationId);
      this.claim(sessionId, tab.id, true);
      await this.target(sessionId, tab.id, { signal });
      await this.invoke(sessionId, tab.id, 'goto', [url], signal);
      signal?.throwIfAborted();
      await this.hub.call(this.id, 'tabs.commitCreate', { creationId });
      return { ...this.records.get(tab.id) };
    } catch (error) {
      try { await this.hub.call(this.id, 'tabs.cancelCreate', { creationId }); }
      catch (cleanup) { throw new AggregateError([error, cleanup], error.message + '; tab cleanup failed: ' + cleanup.message); }
      if (tab) this.forget(tab.id);
      throw error;
    } finally { if (tab) this.pendingCreations.delete(tab.id); }
  }
  async closeLink(connection, link) {
    if (link.cleanup) return link.cleanup;
    link.closing = true;
    const pending = (async () => {
      await link.ready?.catch(() => {});
      const record = connection.pages.get(link.tabId);
      if (record) await cancelWebMcp(record);
      const restoration = record ? await Promise.allSettled([this.resetViewport(record)]) : [];
      // Explicit navigations stop before severing the actor. Input cleanup is
      // authoritative in the extension, including Playwright's internal keys.
      if (record?.navigating && link.browser?.isConnected()) await record.cdp.send('Page.stopLoading');
      if (link.browser) await link.browser.close();
      if (link.entry && link.browser) await link.entry.gateway.closeClientById(link.clientId);
      if (link.entry) {
        link.entry.links.delete(link);
        if (!link.entry.links.size) await this.closeEntry(link.entry);
      }
      // Keep the link reachable until its final native acknowledgement, so a
      // failed detach is retried even after the WebSocket client has closed.
      connection.pages.delete(link.tabId); connection.links.delete(link.tabId);
      failures(restoration, 'Chrome viewport restoration failed after releasing control');
    })();
    link.cleanup = pending;
    try { await pending; } finally { if (link.cleanup === pending) link.cleanup = null; }
  }
  async closeEntry(entry) {
    if (entry.closing) return entry.closing;
    const pending = entry.gateway.close(); entry.closing = pending;
    try { await pending; if (this.entries.get(entry.tabId) === entry) this.entries.delete(entry.tabId); }
    finally { if (entry.closing === pending) entry.closing = null; }
  }
  async disconnect(sessionId) {
    this.viewportPresets.delete(sessionId);
    if (this.disconnecting.has(sessionId)) return this.disconnecting.get(sessionId);
    const active = this.connections.get(sessionId); if (!active) return;
    const pending = (async () => {
      const connection = await active; connection.closing = true;
      const results = await Promise.allSettled([...connection.links.values()].map(link => this.closeLink(connection, link)));
      if (!connection.links.size && this.connections.get(sessionId) === active) this.connections.delete(sessionId);
      failures(results, 'Chrome control cleanup failed');
    })();
    this.disconnecting.set(sessionId, pending);
    try { await pending; } finally { if (this.disconnecting.get(sessionId) === pending) this.disconnecting.delete(sessionId); }
  }
  async hideCursor(sessionId, tabId) {
    const connection = await this.connections.get(sessionId), link = connection?.links.get(tabId);
    if (this.windowCursor && link?.entry) await link.entry.gateway.cursor(link.clientId, null);
  }
  async endTurn(sessionId) {
    this.viewportPresets.delete(sessionId);
    for (const [id, owner] of this.owners) if (owner.sessionId === sessionId && owner.created && !owner.keep) {
      const record = await this.target(sessionId, id); await record.page.close();
    }
    await this.disconnect(sessionId);
    for (const [id, owner] of this.owners) if (owner.sessionId === sessionId) this.owners.delete(id);
  }
  async close() {
    this.closing = true;
    const clients = await Promise.allSettled([...this.connections.keys()].map(id => this.disconnect(id)));
    const entries = await Promise.allSettled([...this.entries.values()].map(entry => this.closeEntry(entry)));
    this.hub.off('disconnected', this.onDisconnect);
    failures([...clients, ...entries], 'Chrome extension cleanup failed');
  }
}
