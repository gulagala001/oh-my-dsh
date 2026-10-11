import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { BrowserActions } from './browser-actions.mjs';
import { ExtensionCdp } from './extension-cdp.mjs';
import { BrowserTransport } from './browser-transport.mjs';
import { createBrowserUploadProvider } from './browser-file-provider.mjs';

const disconnected = () => Object.assign(new Error('Chrome 连接已改变，请重新选择当前标签页。'), { code: 'EXTENSION_DISCONNECTED' });
const failures = (results, message) => {
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, message + ': ' + errors.map(error => error.message).join('; '));
};
const tabId = (tab, method) => {
  if (typeof tab === 'string' && tab) return tab;
  if (tab && typeof tab === 'object' && typeof tab.id === 'string' && tab.id) return tab.id;
  throw new Error('browser.user.' + method + ' expects a tab returned by browser.user.openTabs() or a tab id');
};
const zoomState = result => {
  if (!Number.isFinite(result?.zoomPercent) || result.zoomPercent <= 0 || !Number.isFinite(result.zoomFactor) || result.zoomFactor <= 0 || !result.zoomSettings || typeof result.zoomSettings !== 'object' || Array.isArray(result.zoomSettings)) throw Object.assign(new Error('The browser returned invalid tab zoom state'), { code: 'ZOOM_STATE_UNAVAILABLE' });
  return { zoomPercent: result.zoomPercent, zoomFactor: result.zoomFactor, zoomSettings: result.zoomSettings };
};

// Existing Chrome has no process owned by this backend. Each selected tab has
// one extension lease and independent controller/preview CDP clients.
export class ExtensionBrowser extends BrowserActions {
  constructor(hub, info, options = {}) {
    super({ ...options, id: info.id });
    this.capabilityProviders = { ...this.capabilityProviders,
      downloadMedia: { ...this.capabilityProviders.downloadMedia, ...createBrowserUploadProvider(this, { filePolicy: options.filePolicy }) } };
    this.hub = hub; this.info = info; this.run = { id: info.epoch };
    this.windowCursor = info.capabilities?.includes('cursor-overlay') === true;
    this.tabs = new Map(); this.entries = new Map(); this.disconnecting = new Map(); this.pendingCreations = new Map();
    this.creationTransactions = new Map();
    this.handoffs = new Map(); this.resuming = new Map(); this.finalizing = new Map();
    this.onControlLost = options.onControlLost;
    this.onSessionUse = options.onSessionUse;
    this.getAgentActivity = options.getAgentActivity;
    this.onActorReady = options.onActorReady;
    this.getSessionTitle = options.getSessionTitle ?? (() => '');
    this.sessionTitles = new Map();
    this.sessionTabGroups = info.capabilities?.includes('session-tab-groups') === true;
    this.onDisconnect = (browser, error) => {
      if (browser.id !== this.id || browser.epoch !== this.info.epoch) return;
      const proof = error?.releaseProof;
      if (this.info.type === 'iab' && this.info.metadata?.backend === 'desktop' && browser.type === 'iab' && browser.metadata?.backend === 'desktop'
        && error?.providerClosed === true && proof?.epoch === this.info.epoch && proof.released === true && proof.providerClosed === true) this.providerReleaseProof = { epoch: proof.epoch, released: true, providerClosed: true };
      this.invalidate();
    };
    this.onInvalidation = event => {
      if (event.browser !== this.id || event.epoch !== this.info.epoch) return;
      if (event.event === 'browser-detached-changed') {
        const tab = this.tabs.get(String(event.params?.tabId));
        if (tab) {
          if (event.params.detached === null) delete tab.detached;
          else if (event.params.detached?.contentKind === 'browser') tab.detached = structuredClone(event.params.detached);
        }
        return;
      }
      if (event.event !== 'tabs-invalidated') return;
      if (['removed', 'replaced'].includes(event.params?.reason) && event.params.tabId !== undefined) {
        const info = this.tabs.get(String(event.params.tabId));
        if (info) this.forget(info.id);
      }
    };
    hub.on('disconnected', this.onDisconnect);
    hub.on('event', this.onInvalidation);
  }
  checkConnection(connection) {
    if (this.closing || this.run.lost || connection?.closing || this.hub.list().find(browser => browser.id === this.id)?.epoch !== this.info.epoch) throw disconnected();
  }
  recordId(connection) { return connection.tabId; }
  call(method, params = {}, options = {}) {
    this.checkConnection();
    return this.hub.call(this.id, method, params, { ...options, epoch: this.info.epoch });
  }
  async setAgentActivity(sessionId, active, { signal, tabId } = {}) {
    if (this.info.metadata?.runtime !== 'plugin-electron') return;
    if (typeof active !== 'boolean') throw new TypeError('Agent activity must come from an actual execution lifecycle');
    this.checkConnection();
    const ids = tabId === undefined ? [...this.owners].filter(([, owner]) => owner.sessionId === sessionId).map(([id]) => id) : [tabId];
    for (const id of ids) {
      signal?.throwIfAborted();
      const record = this.records.get(id);
      if (!record || this.owners.get(id)?.sessionId !== sessionId) continue;
      const result = await this.call('tabs.agentActivity', { tabId: record.nativeTabId, active }, { signal, trustedAgentLifecycle: true });
      if (result?.tabId !== record.nativeTabId || result.active !== active) throw Object.assign(new Error('The browser did not confirm agent lifecycle state'), { code: 'INVALID_AGENT_LIFECYCLE' });
    }
  }
  remember(tab) {
    const nativeId = String(tab.id), nativeTabId = Number(nativeId);
    if (!Number.isSafeInteger(nativeTabId) || nativeTabId <= 0) throw new Error('The browser returned an invalid tab identifier');
    const existing = this.tabs.get(nativeId);
    const info = { id: existing?.id ?? this.id + '/' + this.info.epoch + '/' + nativeId + '/' + randomUUID(), browserId: this.id, title: tab.title, url: tab.url, nativeTabId, providerTabId: typeof tab.providerTabId === 'string' ? tab.providerTabId : nativeId };
    for (const key of ['windowId', 'active', 'lastOpened', 'tabGroup', 'presentation', 'detached']) if (tab[key] !== undefined) info[key] = tab[key];
    this.tabs.set(nativeId, info); this.records.set(info.id, info); return info;
  }
  async list(_sessionId, { signal } = {}) {
    this.checkConnection();
    const tabs = await this.call('tabs.list', {}, { signal }); this.checkConnection();
    const live = new Set(tabs.map(tab => String(tab.id)));
    for (const [nativeId, info] of this.tabs) if (!live.has(nativeId)) this.forget(info.id);
    return tabs.map(tab => { const info = this.remember(tab); return { ...info, owner: this.owners.get(info.id)?.sessionId ?? null }; });
  }
  async openTabs(sessionId, options = {}) {
    return (await this.list(sessionId, options)).sort((left, right) => (Date.parse(right.lastOpened) || 0) - (Date.parse(left.lastOpened) || 0));
  }
  async ownedTabs(sessionId, options = {}) {
    await this.resume(sessionId, options);
    return (await this.list(sessionId, options)).filter(tab => tab.owner === sessionId);
  }
  async claimTab(sessionId, tab, { signal } = {}) {
    const id = tabId(tab, 'claimTab');
    const current = (await this.list(sessionId, { signal })).find(info => info.id === id);
    if (!current) throw new Error('This tab has closed or its browser connection changed. List user tabs and explicitly choose a current target.');
    if (tab && typeof tab === 'object' && ['title', 'url', 'providerTabId'].some(key => tab[key] !== undefined && tab[key] !== current[key])) throw new Error('The referenced tab changed. Inspect the current tab identity before claiming it.');
    await this.target(sessionId, id, { signal });
    return { ...this.records.get(id), owner: sessionId };
  }
  claim(sessionId, id, created = false) {
    this.onSessionUse?.(sessionId);
    super.claim(sessionId, id, created);
    const retained = this.handoffs.get(sessionId)?.get(id);
    if (retained?.created) this.owners.get(id).created = true;
  }
  markTab(sessionId, id, status) {
    this.checkConnection();
    if (!['handoff', 'deliverable'].includes(status)) throw new Error('Tab status must be handoff or deliverable');
    const owner = this.owners.get(id);
    if (!this.records.has(id) || owner?.sessionId !== sessionId) throw new Error('This tab is not controlled by the current conversation');
    owner.status = status;
  }
  async existingLink(sessionId, id, signal) {
    signal?.throwIfAborted(); this.checkConnection();
    const pending = this.connections.get(sessionId);
    if (!pending) throw disconnected();
    const connection = await pending;
    signal?.throwIfAborted(); this.checkConnection(connection);
    const link = connection?.links.get(id), record = connection?.pages.get(id), entry = link?.entry, gateway = entry?.gateway;
    const nativeTabId = this.records.get(id)?.nativeTabId;
    const assertBinding = () => {
      this.checkConnection(connection);
      if (this.connections.get(sessionId) !== pending || !link || connection.links.get(id) !== link || link.tabId !== id || link.closing
        || !record || connection.pages.get(id) !== record || record.page.isClosed() || !link.browser?.isConnected()
        || !entry || link.entry !== entry || this.entries.get(id) !== entry || entry.tabId !== id || entry.closing
        || !gateway || gateway.epoch !== this.info.epoch || Number(gateway.tab.id) !== nativeTabId
        || this.records.get(id)?.nativeTabId !== nativeTabId || this.tabs.get(String(nativeTabId))?.id !== id) throw disconnected();
      gateway.actor(link.clientId);
    };
    assertBinding();
    return { nativeTabId, gateway, link, record, assertBinding };
  }
  async readZoom(sessionId, id, signal) {
    signal?.throwIfAborted(); this.checkConnection();
    if (!this.info.capabilities?.includes('tab-zoom')) throw Object.assign(new Error('Native tab zoom is unavailable in this browser'), { code: 'ZOOM_UNAVAILABLE' });
    const { nativeTabId, gateway, link, assertBinding } = await this.existingLink(sessionId, id, signal);
    signal?.throwIfAborted(); assertBinding();
    const result = await this.call('tabs.zoom', { tabId: nativeTabId, leaseId: gateway.leaseId, actorId: link.clientId, action: 'get' }, { signal });
    signal?.throwIfAborted(); assertBinding();
    return zoomState(result);
  }
  requireDesktopUiCapability(capability) {
    this.checkConnection();
    if (this.info.type !== 'iab' || this.info.metadata?.backend !== 'desktop' || !this.info.capabilities?.includes(capability)) throw Object.assign(new Error('Desktop browser capability is unavailable: ' + capability), { code: 'CAPABILITY_UNAVAILABLE', capability });
  }
  async captureClipboard(sessionId, id, signal, { trustedUserAction = false } = {}) {
    signal?.throwIfAborted(); this.requireDesktopUiCapability('native-clipboard-image');
    const { nativeTabId, gateway, link, assertBinding } = await this.existingLink(sessionId, id, signal);
    signal?.throwIfAborted(); assertBinding();
    const result = await this.call('tabs.captureClipboard', { tabId: nativeTabId, leaseId: gateway.leaseId, actorId: link.clientId, explicitUserCommand: true }, { signal, trustedUserAction });
    signal?.throwIfAborted(); assertBinding();
    if (result?.copied !== true || ![result.width, result.height, result.pngBytes].every(value => Number.isSafeInteger(value) && value > 0)) throw Object.assign(new Error('The desktop browser did not confirm an image copied to the system clipboard'), { code: 'CAPTURE_UNAVAILABLE' });
    return { copied: true, width: result.width, height: result.height, pngBytes: result.pngBytes };
  }
  async presentation(sessionId, id, options, signal, { trustedUserAction = false } = {}) {
    signal?.throwIfAborted(); this.requireDesktopUiCapability('desktop-presentation');
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['visible', 'bounds'].includes(key)) || typeof options.visible !== 'boolean') throw Object.assign(new Error('Presentation requires an explicit visibility value'), { code: 'INVALID_PRESENTATION_ARGUMENT' });
    const visible = options.visible;
    let bounds;
    if (options.bounds != null) {
      const value = options.bounds;
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['x', 'y', 'width', 'height'].includes(key))
        || ![value.x, value.y, value.width, value.height].every(Number.isSafeInteger) || value.x < 0 || value.y < 0 || value.width <= 0 || value.height <= 0) throw Object.assign(new Error('Presentation requires explicit nonnegative bounds and positive dimensions'), { code: 'INVALID_PRESENTATION_ARGUMENT' });
      bounds = { x: value.x, y: value.y, width: value.width, height: value.height };
    }
    const assertOwned = () => {
      if (this.owners.get(id)?.sessionId !== sessionId) throw Object.assign(new Error('This tab is not controlled by the current conversation'), { code: 'TAB_NOT_OWNED' });
    };
    assertOwned();
    const { nativeTabId, gateway, link, assertBinding } = await this.existingLink(sessionId, id, signal);
    signal?.throwIfAborted(); assertBinding(); assertOwned();
    const result = await this.call('tabs.presentation', { tabId: nativeTabId, leaseId: gateway.leaseId, actorId: link.clientId, explicitUserCommand: true, visible, ...(bounds ? { bounds } : {}) }, { signal, trustedUserAction });
    signal?.throwIfAborted(); assertBinding(); assertOwned();
    const actual = result?.presentation;
    if (String(result?.id) !== String(nativeTabId) || actual?.visible !== visible || visible && (!actual.bounds
      || !['x', 'y', 'width', 'height'].every(key => Number.isSafeInteger(actual.bounds[key]))
      || actual.bounds.width <= 0 || actual.bounds.height <= 0
      || bounds && ['x', 'y', 'width', 'height'].some(key => actual.bounds[key] !== bounds[key]))
      || !visible && actual.bounds !== null) throw Object.assign(new Error('The desktop browser did not confirm the requested presentation'), { code: 'PRESENTATION_UNAVAILABLE' });
    this.remember(result);
    return { visible: actual.visible, bounds: visible ? { ...actual.bounds } : null };
  }
  async detachedWindow(sessionId, id, action, options, signal, { trustedUserAction = false } = {}) {
    signal?.throwIfAborted(); this.requireDesktopUiCapability('browser-detached-window');
    if (!['detach', 'get', 'focus', 'focusSource', 'setAlwaysOnTop', 'restore'].includes(action)) throw new TypeError('Invalid detached browser action');
    if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(key => !['detachedId', 'alwaysOnTop'].includes(key))) throw new TypeError('Invalid detached browser options');
    if (action !== 'detach' && (typeof options.detachedId !== 'string' || !options.detachedId)) throw new TypeError('The actual detached window identity is required');
    if (action === 'setAlwaysOnTop' && typeof options.alwaysOnTop !== 'boolean') throw new TypeError('Pinned state must be boolean');
    const assertOwned = () => {
      if (this.owners.get(id)?.sessionId !== sessionId) throw Object.assign(new Error('This tab is not controlled by the current conversation'), { code: 'TAB_NOT_OWNED' });
    };
    assertOwned();
    const { nativeTabId, gateway, link, assertBinding } = await this.existingLink(sessionId, id, signal);
    signal?.throwIfAborted(); assertBinding(); assertOwned();
    const result = await this.call(action === 'detach' ? 'tabs.detach' : 'browserDetached.' + action,
      { tabId: nativeTabId, leaseId: gateway.leaseId, actorId: link.clientId, explicitUserCommand: true, ...options }, { signal, trustedUserAction });
    signal?.throwIfAborted(); assertBinding(); assertOwned();
    if (action === 'detach') {
      const detached = result?.detached;
      if (String(result?.id) !== String(nativeTabId) || detached?.contentKind !== 'browser' || detached.phase !== 'detached'
        || typeof detached.id !== 'string' || !detached.id
        || ![detached.windowId, detached.sourceWindowId].every(value => Number.isSafeInteger(value) && value > 0)) throw Object.assign(new Error('The browser did not confirm the detached window'), { code: 'PRESENTATION_UNAVAILABLE' });
      this.remember(result); return { ...detached };
    }
    if (['focus', 'focusSource', 'setAlwaysOnTop'].includes(action) && typeof result !== 'boolean'
      || action === 'restore' && !['moved', 'closed', 'not-moved'].includes(result)) throw Object.assign(new Error('Invalid detached browser result'), { code: 'PRESENTATION_UNAVAILABLE' });
    return result;
  }
  async zoom(sessionId, id, options = {}, signal) {
    signal?.throwIfAborted(); this.checkConnection();
    if (!this.info.capabilities?.includes('tab-zoom')) throw Object.assign(new Error('Native tab zoom is unavailable in this browser'), { code: 'ZOOM_UNAVAILABLE' });
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['action', 'zoomPercent', 'delta'].includes(key))) throw Object.assign(new Error('Invalid tab zoom options'), { code: 'INVALID_ZOOM_ARGUMENT' });
    const action = options.action ?? 'get';
    if (!['get', 'set', 'step', 'reset'].includes(action) || action === 'set' && !Number.isFinite(options.zoomPercent) || action === 'step' && !Number.isFinite(options.delta)
      || action !== 'set' && options.zoomPercent !== undefined || action !== 'step' && options.delta !== undefined) throw Object.assign(new Error('Invalid tab zoom operation'), { code: 'INVALID_ZOOM_ARGUMENT' });
    const assertOwned = () => {
      this.checkConnection();
      if (!this.records.has(id) || this.owners.get(id)?.sessionId !== sessionId) throw Object.assign(new Error('This tab is not controlled by the current conversation'), { code: 'TAB_NOT_OWNED' });
    };
    assertOwned();
    const record = await this.target(sessionId, id, { claim: false, signal });
    signal?.throwIfAborted(); assertOwned();
    const connection = await this.connections.get(sessionId), link = connection?.links.get(id);
    this.checkConnection(connection);
    if (!link || link.closing || !link.entry || link.entry.closing || connection.pages.get(id) !== record || record.page.isClosed() || !link.browser?.isConnected()) throw disconnected();
    const gateway = link.entry.gateway;
    gateway.actor(link.clientId);
    const result = await this.call('tabs.zoom', { tabId: this.records.get(id).nativeTabId, leaseId: gateway.leaseId, actorId: link.clientId, action,
      ...(action === 'set' ? { zoomPercent: options.zoomPercent } : {}), ...(action === 'step' ? { delta: options.delta } : {}) }, { signal });
    signal?.throwIfAborted(); assertOwned();
    return zoomState(result);
  }
  async invoke(sessionId, id, method, args, signal, geometry, operationContext) {
    if (method === 'markHandoff' || method === 'markDeliverable') {
      signal?.throwIfAborted();
      await this.target(sessionId, id, { signal });
      this.markTab(sessionId, id, method === 'markHandoff' ? 'handoff' : 'deliverable');
      return null;
    }
    return super.invoke(sessionId, id, method, args, signal, geometry, operationContext);
  }
  async resume(sessionId, { signal } = {}) {
    signal?.throwIfAborted();
    if (this.finalizing.has(sessionId)) await this.finalizing.get(sessionId);
    signal?.throwIfAborted();
    if (this.resuming.has(sessionId)) {
      await this.resuming.get(sessionId);
      signal?.throwIfAborted();
      return;
    }
    const retained = this.handoffs.get(sessionId);
    if (!retained?.size) return;
    const pending = (async () => {
      const live = new Set((await this.list(sessionId, { signal })).map(tab => tab.id));
      signal?.throwIfAborted();
      for (const [id, previous] of retained) {
        signal?.throwIfAborted();
        const owner = this.owners.get(id);
        if (!live.has(id) || owner && owner.sessionId !== sessionId) { retained.delete(id); continue; }
        this.claim(sessionId, id, previous.created);
        signal?.throwIfAborted();
        delete this.owners.get(id).status;
        retained.delete(id);
      }
      if (!retained.size && this.handoffs.get(sessionId) === retained) this.handoffs.delete(sessionId);
    })();
    this.resuming.set(sessionId, pending);
    try { await pending; } finally { if (this.resuming.get(sessionId) === pending) this.resuming.delete(sessionId); }
  }
  forget(id, error) {
    const info = this.records.get(id); if (!info) return;
    if (!error) void this.filePolicy?.releaseTab({ id, browserId: this.id }).catch(cleanup => { this.fileCleanupError = cleanup; });
    this.emulations.delete(id);this.viewportOwners.delete(id);this.records.delete(id); this.tabs.delete(String(info.nativeTabId)); this.owners.delete(id);this.downloadSessions.delete(id);
    for (const [sessionId, tabs] of this.handoffs) { tabs.delete(id); if (!tabs.size) this.handoffs.delete(sessionId); }
    if (error) this.onControlLost?.(id, error);
    this.onTabClosed?.(id);
  }
  invalidate() {
    if (this.run.lost) return; this.run.lost = true;
    const tabs = [...this.records.keys()]; this.records.clear(); this.tabs.clear(); this.owners.clear();this.emulations.clear();this.viewportOwners.clear();this.handoffs.clear();this.downloadSessions.clear();
    this.onBrowserLost?.(tabs, disconnected(), this.run.id);
  }
  async connection(sessionId) {
    this.onSessionUse?.(sessionId);
    if (this.disconnecting.has(sessionId)) await this.disconnecting.get(sessionId);
    this.checkConnection();
    if (!this.connections.has(sessionId)) {
      const connection = { pages: new Map(), links: new Map(), run: this.run };
      Object.defineProperty(connection, 'sessionId', { value: sessionId, enumerable: true });
      this.connections.set(sessionId, Promise.resolve(connection));
    }
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
    if (claim) await this.resume(sessionId, { signal });
    const info = this.records.get(id); if (!info) throw new Error('This tab control has ended. List tabs and explicitly select the current target.');
    const owned = this.owners.has(id);
    if (claim) this.claim(sessionId, id);
    const connection = await this.connection(sessionId); signal?.throwIfAborted(); this.checkConnection(connection);
    let link = connection.links.get(id);
    if (!link) {
      link = { clientId: randomUUID(), tabId: id, pages: connection.pages, closing: false };
      Object.defineProperty(link, 'sessionId', { value: sessionId, enumerable: true });
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
        link.capabilityAdapter = entry.gateway.createAdapter(link.clientId);
        const record = await this.bind(link, page);
        link.record = record;
        record.capabilityAdapter = link.capabilityAdapter; record.cdpAdapter = link.capabilityAdapter;
        this.checkConnection(connection); return record;
      })();
      void link.ready.catch(() => {});
    }
    try {
      const record = await link.ready; signal?.throwIfAborted(); this.checkConnection(connection);
      if (claim) await this.groupSession(sessionId, link);
      const entry = link.entry, gateway = entry?.gateway, pending = this.connections.get(sessionId);
      const inspect = () => {
        this.checkConnection(connection);
        if (this.connections.get(sessionId) !== pending || connection.links.get(id) !== link || link.closing || connection.pages.get(id) !== record
          || record.page.isClosed() || !link.browser?.isConnected() || !entry || link.entry !== entry || this.entries.get(id) !== entry || entry.closing
          || !gateway || gateway.epoch !== this.info.epoch || Number(gateway.tab.id) !== this.records.get(id)?.nativeTabId) throw disconnected();
        const root = link.capabilityAdapter.resolveTarget(), rootTargetInfo = gateway.native.get('')?.info;
        if (!rootTargetInfo || root.targetId !== rootTargetInfo.targetId || root.targetId !== gateway.targetInfo?.targetId) throw disconnected();
        return { tabId: root.tabId, leaseId: gateway.leaseId, actorId: link.clientId, epoch: gateway.epoch, rootTargetId: root.targetId, rootUrl: root.url, rootTargetInfo: { ...rootTargetInfo } };
      };
      if (this.onActorReady) await this.onActorReady(sessionId, { ...inspect(), inspect, actionSignal: signal });
      if (claim && typeof this.getAgentActivity === 'function') await this.setAgentActivity(sessionId, this.getAgentActivity(sessionId), { signal, tabId: id });
      signal?.throwIfAborted(); inspect();
      signal?.throwIfAborted(); this.checkConnection(connection); return record;
    }
    catch (error) {
      if (claim && !owned && this.owners.get(id)?.sessionId === sessionId) this.owners.delete(id);
      await this.closeLink(connection, link).catch(() => {}); throw error;
    }
  }
  async groupSession(sessionId, link, title = this.sessionTitles.get(sessionId) ?? (this.getSessionTitle(sessionId) || '')) {
    if (!this.sessionTabGroups || link.closing) return;
    if (link.groupTitle === title) return;
    const result = await link.entry.gateway.setSession(link.clientId, { id: sessionId, title });
    if (result.grouped) link.groupTitle = title;
  }
  async renameSessionGroup(sessionId, title) {
    if (typeof title !== 'string' || !title.trim()) throw new TypeError('nameSession requires a nonempty name');
    title = title.trim();
    this.sessionTitles.set(sessionId, title);
    if (!this.sessionTabGroups || this.run.lost || this.closing) return;
    const result = await this.call('groups.rename', { conversation: { id: sessionId, title } });
    if (result?.updated !== true) return;
    const connection = await this.connections.get(sessionId);
    for (const link of connection?.links.values() ?? []) if (link.groupTitle !== undefined) link.groupTitle = title;
  }
  async create(sessionId, url = 'about:blank', signal) {
    this.onSessionUse?.(sessionId);
    signal?.throwIfAborted(); this.checkConnection();
    await this.resume(sessionId, { signal });
    const creationId = randomUUID(), creation = { creationId, sessionId, cancelRequested: false }; let tab;
    this.creationTransactions.set(creationId, creation);
    try {
      const created = await this.call('tabs.create', { creationId }, { signal });
      signal?.throwIfAborted();
      if (creation.cancelRequested || this.creationTransactions.get(creationId) !== creation) throw Object.assign(new Error('Tab creation cancelled'), { code: 'CONTROL_STOPPED' });
      tab = this.remember(created); creation.tabId = tab.id;
      this.pendingCreations.set(tab.id, creationId);
      this.claim(sessionId, tab.id, true);
      await this.target(sessionId, tab.id, { signal });
      await this.invoke(sessionId, tab.id, 'goto', [url], signal);
      signal?.throwIfAborted();
      if (creation.cancelRequested) throw Object.assign(new Error('Tab creation cancelled'), { code: 'CONTROL_STOPPED' });
      creation.committing = this.call('tabs.commitCreate', { creationId });
      const committed = await creation.committing;
      if (committed?.committed !== true) throw Object.assign(new Error('The browser did not confirm tab creation commit'), { code: 'INVALID_RESPONSE' });
      creation.committed = true; this.finishCreation(creation);
      return { ...this.records.get(tab.id) };
    } catch (error) {
      try { await this.cancelCreation(creation); }
      catch (cleanup) { throw Object.assign(new AggregateError([error, cleanup], error.message + '; tab cleanup failed: ' + cleanup.message), { code: 'INPUT_RELEASE_FAILED', epoch: this.info.epoch, creationId }); }
      throw error;
    }
  }
  finishCreation(creation) {
    if (this.creationTransactions.get(creation.creationId) === creation) this.creationTransactions.delete(creation.creationId);
    if (creation.tabId && this.pendingCreations.get(creation.tabId) === creation.creationId) this.pendingCreations.delete(creation.tabId);
  }
  async cancelCreation(creation) {
    if (creation.cancelPending) return creation.cancelPending;
    if (creation.committed || creation.cancelled) return;
    creation.cancelRequested = true;
    const pending = (async () => {
      if (creation.committing) {
        const committed = await creation.committing.catch(() => undefined);
        if (committed?.committed === true) { creation.committed = true; this.finishCreation(creation); return; }
      }
      const proof = this.providerReleaseProof;
      if (!(proof?.epoch === this.info.epoch && proof.released === true && proof.providerClosed === true)) {
        // Cleanup bypasses normal closing admission, never the epoch or the
        // native transport's release acknowledgement.
        const result = await this.hub.call(this.id, 'tabs.cancelCreate', { creationId: creation.creationId }, { epoch: this.info.epoch });
        if (result?.released !== true) throw Object.assign(new Error('Tab creation cancellation was not confirmed'), { code: 'INPUT_RELEASE_FAILED', creationId: creation.creationId, epoch: this.info.epoch });
      }
      creation.cancelled = true; this.finishCreation(creation);
      if (creation.tabId) this.forget(creation.tabId);
    })();
    creation.cancelPending = pending;
    try { await pending; } finally { if (creation.cancelPending === pending) creation.cancelPending = null; }
  }
  async cancelPendingCreations(sessionId) {
    return Promise.allSettled([...this.creationTransactions.values()].filter(creation => sessionId === undefined || creation.sessionId === sessionId).map(creation => this.cancelCreation(creation)));
  }
  async closeLink(connection, link) {
    if (link.cleanup) return link.cleanup;
    link.closing = true;
    const pending = (async () => {
      await link.ready?.catch(() => {});
      const releasedProvider = this.hasReleasedProvider(link.entry?.gateway);
      if (releasedProvider) await link.entry.gateway.drainLoss();
      const record = connection.pages.get(link.tabId) ?? (releasedProvider ? link.record : undefined);
      if (record && releasedProvider) {
        // The formal same-epoch provider proof includes native input cleanup
        // and destruction. Do not send restoration commands to that document.
        record.heldButtons.clear(); record.heldKeys.clear(); record.heldTextKey = null; record.heldTouch = false;
        record.buttonReleases.clear(); record.keyReleases.clear(); record.touchRelease = null;
        if (this.viewportOwners.get(record.id) === record) this.viewportOwners.delete(record.id);
        if (this.emulations.get(record.id)?.record === record) this.emulations.delete(record.id);
        record.viewportOverride = false; record.viewportMode = null; record.viewportSize = null; record.screenshotFrame = null;
        delete record.viewportNativeSize; delete record.viewportNativeDpr; delete record.viewportPreset; delete record.emulationPreset;
        record.navigating = false;
        record.webmcp?.active.clear(); record.webmcp?.snapshots.clear();
      } else if (record) await this.releaseInput(record);
      const restoration = record && !releasedProvider ? await Promise.allSettled([this.restoreOverrides(record)]) : [];
      if(!this.closing&&restoration.some(result=>result.status==='rejected')){link.closing=false;connection.closing=false;failures(restoration,'Chrome device settings restoration failed; retry stop');}
      // Explicit navigations stop before severing the actor. Input cleanup is
      // authoritative in the extension, including Playwright's internal keys.
      if (!releasedProvider && record?.navigating && link.browser?.isConnected()) await record.cdp.send('Page.stopLoading');
      if (record) await record.tabCapabilities?.dispose();
      if (link.browser) await link.browser.close();
      if (link.entry && link.browser) await link.entry.gateway.closeClientById(link.clientId);
      if (link.entry) {
        link.entry.links.delete(link);
        if (!link.entry.links.size) await this.closeEntry(link.entry);
      }
      if (record) { delete record.capabilityAdapter; delete record.cdpAdapter; }
      delete link.capabilityAdapter;
      delete link.record;
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
  hasReleasedProvider(gateway) {
    return this.info.type === 'iab' && this.info.metadata?.backend === 'desktop' && gateway?.epoch === this.info.epoch && gateway.hasReleasedProvider() === true;
  }
  async releaseClipboardSession(sessionId, options) {
    const gateways = [...this.entries.values()].map(entry => entry.gateway).filter(gateway => this.hasReleasedProvider(gateway));
    await Promise.all(gateways.map(gateway => gateway.drainLoss()));
    return super.releaseClipboardSession(sessionId, options);
  }
  async disconnect(sessionId) {
    this.viewportPresets.delete(sessionId);this.emulationPresets.delete(sessionId);
    if (this.disconnecting.has(sessionId)) return this.disconnecting.get(sessionId);
    const active = this.connections.get(sessionId);
    const pending = (async () => {
      const creations = await this.cancelPendingCreations(sessionId);
      const clipboard = await Promise.allSettled([this.releaseClipboardSession(sessionId)]);
      if (!active) { failures([...creations, ...clipboard], 'Chrome control cleanup failed'); return; }
      const connection = await active; connection.closing = true;
      const results = await Promise.allSettled([...connection.links.values()].map(link => this.closeLink(connection, link)));
      if (!connection.links.size && this.connections.get(sessionId) === active) this.connections.delete(sessionId);
      failures([...creations, ...clipboard, ...results], 'Chrome control cleanup failed');
    })();
    this.disconnecting.set(sessionId, pending);
    try { await pending; } finally { if (this.disconnecting.get(sessionId) === pending) this.disconnecting.delete(sessionId); }
  }
  async hideCursor(sessionId, tabId) {
    const connection = await this.connections.get(sessionId), link = connection?.links.get(tabId);
    if (this.windowCursor && link?.entry) await link.entry.gateway.cursor(link.clientId, null);
  }
  async finalize(sessionId) {
    if (this.finalizing.has(sessionId)) return this.finalizing.get(sessionId);
    const pending = (async () => {
      await this.resuming.get(sessionId);
      this.viewportPresets.delete(sessionId);this.emulationPresets.delete(sessionId);
      await this.releaseClipboardSession(sessionId);
      const owned = [...this.owners].filter(([, owner]) => owner.sessionId === sessionId);
      const closed = await Promise.allSettled(owned.filter(([, owner]) => owner.created && !owner.keep && !owner.status).map(async ([id]) => {
        if (!this.records.has(id)) return;
        const record = await this.target(sessionId, id, { claim: false });
        await record.page.close();
        this.forget(id);
      }));
      failures(closed, 'Could not close temporary Chrome tabs');
      await this.disconnect(sessionId);
      const retained = new Map(this.handoffs.get(sessionId));
      for (const [id, owner] of owned) {
        if (this.owners.get(id) !== owner) continue;
        retained.delete(id);
        if (owner.status === 'handoff' && this.records.has(id)) retained.set(id, { created: owner.created });
        this.owners.delete(id);
      }
      if (retained.size) this.handoffs.set(sessionId, retained);
      else this.handoffs.delete(sessionId);
    })();
    this.finalizing.set(sessionId, pending);
    try { await pending; } finally { if (this.finalizing.get(sessionId) === pending) this.finalizing.delete(sessionId); }
  }
  async endTurn(sessionId) { return this.finalize(sessionId); }
  async close() {
    this.closing = true;
    const creations = await this.cancelPendingCreations();
    const clients = await Promise.allSettled([...this.connections.keys()].map(id => this.disconnect(id)));
    const clipboards = await Promise.allSettled([...this.clipboardScopes.keys()].map(id => this.disposeClipboardSession(id)));
    // A failed actor cleanup still owns a path back to the real Chrome tab.
    // Keep its gateway alive until a later close confirms restoration.
    const entries = await Promise.allSettled([...this.entries.values()].filter(entry => !entry.links.size).map(entry => this.closeEntry(entry)));
    failures([...creations, ...clients, ...entries, ...clipboards], 'Chrome extension cleanup failed');
    this.hub.off('disconnected', this.onDisconnect);
    this.hub.off('event', this.onInvalidation);
    this.handoffs.clear();
    this.sessionTitles.clear();
  }
}
