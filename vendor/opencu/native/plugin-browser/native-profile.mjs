import { randomUUID } from 'node:crypto';
import { shell, systemPreferences, webFrameMain } from 'electron';
import { fail, jsonValue, record } from './ipc.mjs';
import { PermissionStore, deviceIdentity } from './permission-store.mjs';
import { DEVICE_TYPES, PERMISSION_DESCRIPTORS, PERMISSION_SOURCE, PERMISSION_TYPES, exactOrigin,
  onlyKeys, permissionType, permissionTypes, providedOrigin, requestedTypes, selection, typeSetting } from './permission-schema.mjs';

const clone = value => {
  if (!jsonValue(value)) throw fail('Invalid permission metadata', 'INVALID_RESPONSE');
  return structuredClone(value);
};
const sameFrame = (a, b) => a && b && a.processId === b.processId && a.routingId === b.routingId;
const frameKey = frame => `${frame.processId}:${frame.routingId}`;
const actions = ['allow', 'allow-this-time', 'deny', 'dismiss'];
const label = (value, fallback) => typeof value === 'string' && value ? value.slice(0, 256) : fallback;
const deviceGrantKey = (type, origin, key) => JSON.stringify(['opencu-device', type, origin, key]);
const transientPermissions = new Set(['fullscreen']);

// Compatibility name retained for the existing plugin browser integration.
export class NativeBrowserProfile {
  constructor(browser) {
    this.browser = browser; this.session = browser.browserSession;
    this.store = new PermissionStore(browser.options.permissionStorageDirectory);
    this.installed = false; this.closing = false;
    this.watches = new Map(); this.deviceContexts = new Map(); this.revokedDevices = new Set();
    this.listeners = []; this.jobs = new Set();
  }
  initialize() { return this.store.initialize(); }
  capabilities() {
    const ready = this.store.ready && !this.closing;
    return { schemaVersion: 1, available: ready && this.installed, ready: ready && this.installed,
      provider: PERMISSION_SOURCE, source: PERMISSION_SOURCE, nativeProvider: false,
      mode: 'plugin-managed', browserMode: false, persistentReady: ready, persistentSettings: ready,
      managerReady: this.installed && !this.closing, promptHandlerReady: this.installed && !this.closing,
      nativeSettings: false, nativeDefaults: false, defaults: ready,
      promptActions: [...actions], actions: [...actions], temporaryGrants: true,
      temporaryGrantLifetime: 'document-and-control-lease', iframeRequests: 'uniquely-identified-frame',
      workerChecks: 'explicit-origin-pair-persistent-settings-only', geolocationAccuracy: false,
      statusSemantics: 'electron-boolean-check', liveRevocation: 'reload-affected-documents',
      supportedContentSettings: [...PERMISSION_TYPES.keys()], contentSettings: clone(PERMISSION_DESCRIPTORS),
      temporaryOnlyPermissions: [...transientPermissions],
      devicePermissions: { available: ready && this.installed, provider: 'electron-device-permission-handler',
        selection: true, supportedTypes: [...DEVICE_TYPES.keys()], grantScope: 'requesting-origin-and-selected-device',
        persistentIdentity: 'serial-number-or-os-device-instance', sessionIdentity: 'electron-device-id',
        serialFrameIdentity: 'unique-prior-permission-check' } };
  }
  settingsCapabilities() {
    const result = this.capabilities(), settingsPage = typeof this.browser.options.siteInformation?.open === 'function';
    return { ...result, available: this.store.ready && !this.closing, perSiteReset: true,
      nativeSettingsPage: false, settingsPage, pluginSettings: true, pluginDefaults: true, source: PERMISSION_SOURCE };
  }
  install() {
    if (this.installed) return true;
    if (!this.store.ready || this.closing) throw fail('Initialize the permission store before installing handlers', 'PERMISSION_STORAGE_UNAVAILABLE');
    const methods = ['setPermissionRequestHandler', 'setPermissionCheckHandler', 'setDevicePermissionHandler'];
    if (!methods.every(method => typeof this.session[method] === 'function')) throw fail('Electron permission handlers are unavailable', 'PERMISSION_UNAVAILABLE');
    try {
      this.session.setPermissionRequestHandler(this.receive);
      this.session.setPermissionCheckHandler(this.check);
      this.session.setDevicePermissionHandler(this.checkDevice);
      this.listen('select-usb-device', (event, details, callback) => this.selectDevice('usb', event, details, callback));
      this.listen('select-hid-device', (event, details, callback) => this.selectDevice('hid', event, details, callback));
      this.listen('select-serial-port', (event, devices, contents, callback) => this.selectDevice('serial', event, { deviceList: devices, webContents: contents }, callback));
      for (const type of DEVICE_TYPES.keys()) this.listen(type === 'serial' ? 'serial-port-revoked' : `${type}-device-revoked`,
        (_event, details) => this.deviceRevoked(type, details));
      this.installed = true;
      return true;
    } catch (error) { this.detachHandlers(); throw error; }
  }
  listen(name, handler) { this.session.on(name, handler); this.listeners.push([name, handler]); }
  usable() { return this.installed && this.store.ready && !this.closing && !this.browser.closing; }
  ownedTab(contents) {
    const tab = contents && !contents.isDestroyed() ? this.browser.tabs.get(contents.id) : undefined;
    if (!this.usable() || !tab || tab.view.webContents !== contents) throw fail('The requesting browser document is unavailable', 'STALE_TARGET');
    return tab;
  }
  watch(tab) {
    if (this.watches.has(tab.id)) return this.watches.get(tab.id);
    const contents = tab.view.webContents, generations = new Map();
    const navigation = details => {
      if (details.isSameDocument) return;
      const affected = frame => details.isMainFrame || details.frame && sameFrame(details.frame, frame);
      if (details.frame) generations.set(frameKey(details.frame), (generations.get(frameKey(details.frame)) ?? 0) + 1);
      for (const binding of [...this.browser.permissionPrompts.values()]) if (binding.pluginPermission && binding.tab === tab && affected(binding.frame)) this.dismiss(binding);
      for (const [key, grant] of this.browser.permissionGrants) if (grant.pluginPermission && grant.tab === tab && affected(grant.frame)) this.browser.permissionGrants.delete(key);
      for (const [key, context] of this.deviceContexts) if (context.tab === tab && affected(context.frame)) this.deviceContexts.delete(key);
    };
    const gone = () => this.releaseTab(tab);
    contents.on('did-start-navigation', navigation); contents.on('render-process-gone', gone); contents.once('destroyed', gone);
    const watch = { tab, contents, generations, navigation, gone };
    this.watches.set(tab.id, watch);
    return watch;
  }
  releaseTab(tab) {
    for (const binding of [...this.browser.permissionPrompts.values()]) if (binding.pluginPermission && binding.tab === tab) this.dismiss(binding);
    for (const [key, grant] of this.browser.permissionGrants) if (grant.pluginPermission && grant.tab === tab) this.browser.permissionGrants.delete(key);
    for (const [key, context] of this.deviceContexts) if (context.tab === tab) this.deviceContexts.delete(key);
    const watch = this.watches.get(tab.id);
    if (watch) {
      watch.contents.removeListener('did-start-navigation', watch.navigation);
      watch.contents.removeListener('render-process-gone', watch.gone); watch.contents.removeListener('destroyed', watch.gone);
      this.watches.delete(tab.id);
    }
  }
  document(contents, details, suppliedOrigin) {
    const tab = this.ownedTab(contents), top = contents.mainFrame;
    if (!record(details) || typeof details.isMainFrame !== 'boolean' || typeof details.requestingUrl !== 'string'
      || top.isDestroyed()) throw fail('Electron did not identify the permission document', 'PERMISSION_IDENTITY_UNAVAILABLE');
    const url = new URL(details.requestingUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !this.browser.allowedNavigation(url.href))
      throw fail('The permission request has no allowed website document', 'PERMISSION_IDENTITY_UNAVAILABLE');
    const requestingOrigin = suppliedOrigin === undefined ? url.origin : providedOrigin(suppliedOrigin);
    if (requestingOrigin !== url.origin || details.securityOrigin !== undefined && providedOrigin(details.securityOrigin) !== requestingOrigin)
      throw fail('The permission origin does not match its document', 'PERMISSION_IDENTITY_UNAVAILABLE');
    const embeddingOrigin = providedOrigin(top.origin);
    if (details.embeddingOrigin !== undefined && providedOrigin(details.embeddingOrigin) !== embeddingOrigin)
      throw fail('The embedding permission document changed', 'STALE_TARGET');
    let frame;
    const identity = details.requestingFrame ?? details.frame;
    if (identity && Number.isInteger(identity.processId) && Number.isInteger(identity.routingId)) frame = webFrameMain.fromId(identity.processId, identity.routingId);
    else {
      const candidates = details.isMainFrame ? [top] : top.framesInSubtree.filter(item => !sameFrame(item, top));
      const matching = candidates.filter(item => !item.isDestroyed() && item.url === url.href && item.origin === requestingOrigin);
      if (matching.length !== 1) throw fail('The requesting frame identity is ambiguous', 'PERMISSION_IDENTITY_UNAVAILABLE');
      [frame] = matching;
    }
    if (!frame || frame.isDestroyed() || !sameFrame(frame.top, top) || frame.url !== url.href || frame.origin !== requestingOrigin
      || details.isMainFrame !== sameFrame(frame, top)) throw fail('The requesting permission frame changed', 'STALE_TARGET');
    return this.bindDocument(tab, frame, requestingOrigin, embeddingOrigin);
  }
  bindDocument(tab, frame, requestingOrigin, embeddingOrigin) {
    const actors = [...(tab.control?.activeActors ?? [])];
    if (tab.control) {
      if (actors.length !== 1) throw fail('The permission actor is ambiguous', 'CONTROL_STOPPED');
      this.browser.assertControl(tab.control, actors[0]);
    }
    const watch = this.watch(tab);
    return { pluginPermission: true, tab, frame, frameUrl: frame.url, frameOrigin: requestingOrigin,
      requestingOrigin, embeddingOrigin, documentGeneration: tab.documentGeneration ?? 0,
      frameGeneration: watch.generations.get(frameKey(frame)) ?? 0,
      leaseId: tab.control?.leaseId, actorId: actors[0] };
  }
  assertDocument(binding) {
    const { browser } = this, contents = binding.tab.view.webContents, frame = binding.frame;
    if (!this.usable() || contents.isDestroyed() || browser.tabs.get(binding.tab.id) !== binding.tab || frame.isDestroyed()
      || !sameFrame(frame.top, contents.mainFrame) || frame.url !== binding.frameUrl || frame.origin !== binding.requestingOrigin
      || contents.mainFrame.origin !== binding.embeddingOrigin || (binding.tab.documentGeneration ?? 0) !== binding.documentGeneration
      || (this.watches.get(binding.tab.id)?.generations.get(frameKey(frame)) ?? 0) !== binding.frameGeneration
      || binding.tab.control?.leaseId !== binding.leaseId || binding.actorId !== undefined && binding.tab.control?.stoppedActors.has(binding.actorId))
      throw fail('The permission document or control lease changed', 'STALE_TARGET');
    if (binding.tab.control) this.browser.assertControl(binding.tab.control, binding.actorId);
  }
  assertCurrent(binding) {
    this.assertDocument(binding);
    if (binding.closed || this.browser.permissionPrompts.get(binding.id) !== binding) throw fail('The permission prompt ended', 'STALE_TARGET');
  }
  temporary(type, document) {
    for (const [key, grant] of this.browser.permissionGrants) {
      if (!grant.pluginPermission || grant.deviceType || grant.type !== type || grant.tab !== document.tab
        || !sameFrame(grant.frame, document.frame)) continue;
      try { this.assertDocument(grant); } catch { this.browser.permissionGrants.delete(key); continue; }
      if (grant.requestingOrigin === document.requestingOrigin && grant.embeddingOrigin === document.embeddingOrigin) return true;
    }
    return false;
  }
  policy(type, document) {
    const setting = this.store.setting(type, document.requestingOrigin, document.embeddingOrigin);
    return setting === 'block' ? 'block' : this.temporary(type, document) ? 'allow' : setting;
  }
  receive = (contents, permission, callback, details) => {
    let settled = false;
    const finish = allowed => { if (!settled) { settled = true; callback(allowed === true); } };
    try {
      const document = this.document(contents, details);
      if (transientPermissions.has(permission)) {
        if (this.temporary(permission, document)) { finish(true); return; }
        this.prompt({ ...document, permission, types: [], callback: finish, transient: true }); return;
      }
      const types = requestedTypes(permission, details), settings = types.map(type => this.policy(type, document));
      if (settings.includes('block')) { finish(false); return; }
      if (settings.every(setting => setting === 'allow')) { finish(true); return; }
      this.prompt({ ...document, permission, types, callback: finish,
        ...(permission === 'media' ? { mediaTypes: [...details.mediaTypes] } : {}) });
    } catch { finish(false); }
  };
  check = (contents, permission, requestingOrigin, details) => {
    try {
      if (!this.usable()) return false;
      if (transientPermissions.has(permission)) return contents ? this.temporary(permission, this.document(contents, details, requestingOrigin)) : false;
      const types = requestedTypes(permission, details, { check: true });
      if (!contents) {
        // Context-free checks carry an explicit pair, including worker origin
        // pairs. They cannot consume a document-bound temporary authorization.
        const requesting = providedOrigin(requestingOrigin), embedding = providedOrigin(details?.embeddingOrigin);
        if (!this.browser.allowedNavigation(requesting) || !this.browser.allowedNavigation(embedding) || DEVICE_TYPES.has(permission)) return false;
        return types.every(type => this.store.setting(type, requesting, embedding) === 'allow');
      }
      const document = this.document(contents, details, requestingOrigin);
      if (DEVICE_TYPES.has(permission)) {
        if (this.policy(types[0], document) === 'block') return false;
        const key = JSON.stringify([document.tab.id, permission, frameKey(document.frame)]);
        this.deviceContexts.set(key, { ...document, deviceType: permission, createdAt: Date.now() });
        return true; // This permits a chooser, not device access.
      }
      return types.every(type => this.policy(type, document) === 'allow');
    } catch { return false; }
  };
  checkDevice = details => {
    try {
      if (!this.usable() || !record(details) || !DEVICE_TYPES.has(details.deviceType)) return false;
      const origin = providedOrigin(details.origin), identity = deviceIdentity(details.deviceType, details.device);
      if (!this.browser.allowedNavigation(origin) || this.revokedDevices.has(`${details.deviceType}:*`)
        || this.revokedDevices.has(deviceGrantKey(details.deviceType, origin, identity.key))) return false;
      const type = DEVICE_TYPES.get(details.deviceType);
      // Electron supplies no embedding identity here. Any explicit block for
      // this origin takes precedence over an origin-and-device authorization.
      if (this.store.state.sites.some(item => item.type === type
        && item.requestingOrigin === origin && item.setting === 'block')) return false;
      if (identity.persistent && this.store.device(details.deviceType, origin, identity.key)) return true;
      for (const [key, grant] of this.browser.permissionGrants) if (grant.pluginPermission && grant.deviceType === details.deviceType
        && grant.requestingOrigin === origin && grant.deviceKey === identity.key) {
        try { this.assertDocument(grant); return true; } catch { this.browser.permissionGrants.delete(key); }
      }
      return false;
    } catch { return false; }
  };
  selectDevice(type, event, details, callback) {
    event.preventDefault();
    let settled = false;
    const finish = id => { if (!settled) { settled = true; callback(type === 'serial' ? id ?? '' : id); } };
    try {
      let document;
      if (type === 'serial') {
        const tab = this.ownedTab(details.webContents);
        const contexts = [...this.deviceContexts.values()].filter(value => value.tab === tab && value.deviceType === type
          && Date.now() - value.createdAt < 30000).filter(value => { try { this.assertDocument(value); return true; } catch { return false; } });
        if (contexts.length !== 1) throw fail('The serial chooser frame is ambiguous', 'PERMISSION_IDENTITY_UNAVAILABLE');
        [document] = contexts;
      } else {
        const frame = details.frame;
        if (!frame || frame.isDestroyed()) throw fail('The device chooser document ended', 'STALE_TARGET');
        const tab = [...this.browser.tabs.values()].find(value => !value.view.webContents.isDestroyed() && sameFrame(value.view.webContents.mainFrame, frame.top));
        if (!tab) throw fail('The device chooser does not belong to an owned tab', 'STALE_TARGET');
        this.ownedTab(tab.view.webContents);
        document = this.bindDocument(tab, frame, providedOrigin(frame.origin), providedOrigin(frame.top.origin));
        this.assertDocument(document);
      }
      for (const [key, value] of this.deviceContexts) if (value.tab === document.tab && value.deviceType === type) this.deviceContexts.delete(key);
      if (this.policy(DEVICE_TYPES.get(type), document) === 'block') { finish(); return; }
      const devices = details.deviceList;
      if (!Array.isArray(devices) || !devices.length || devices.length > 256) { finish(); return; }
      const choices = devices.map(device => {
        const id = type === 'serial' ? device.portId : device.deviceId;
        if (typeof id !== 'string' || !id || id.length > 8192) throw fail('Invalid selectable device identity', 'PERMISSION_IDENTITY_UNAVAILABLE');
        return { id, identity: deviceIdentity(type, device), device };
      });
      if (new Set(choices.map(value => value.id)).size !== choices.length) throw fail('Ambiguous device selection identity', 'PERMISSION_IDENTITY_UNAVAILABLE');
      this.prompt({ ...document, permission: type, types: [DEVICE_TYPES.get(type)], deviceType: type,
        choices, callback: finish, variant: 'device-selection' });
    } catch { finish(); }
  }
  prompt(binding) {
    if (this.browser.permissionPrompts.size >= 128) { binding.callback(binding.deviceType ? undefined : false); return; }
    const id = randomUUID(), generation = ++this.browser.promptGeneration;
    Object.assign(binding, { id, generation, closed: false });
    const permissions = binding.transient ? [{ name: binding.permission, systemPermission: 'unknown' }]
      : binding.types.map(type => ({ name: PERMISSION_TYPES.get(type).permissionKey, contentSettingType: type, systemPermission: this.systemPermission(type) }));
    const availableActions = binding.transient ? ['allow-this-time', 'deny', 'dismiss'] : [...actions];
    if (binding.deviceType && !binding.choices.some(choice => choice.identity.persistent)) availableActions.splice(availableActions.indexOf('allow'), 1);
    const systemSettingsAvailable = binding.types.some(type => this.systemSettingsUrl(type) !== undefined);
    const systemBlocked = permissions.some(permission => ['denied', 'restricted'].includes(permission.systemPermission)
      && this.systemSettingsUrl(permission.contentSettingType) !== undefined);
    const variant = binding.deviceType ? 'device-selection' : systemBlocked ? 'os-system-settings' : 'ask';
    binding.snapshot = { promptId: id, promptGeneration: generation, tabId: binding.tab.id, tabGeneration: binding.tab.generation,
      ...(binding.leaseId === undefined ? {} : { leaseId: binding.leaseId }), ...(binding.actorId === undefined ? {} : { actorId: binding.actorId }),
      rootUrl: binding.tab.view.webContents.getURL(), frameUrl: binding.frameUrl, requestingOrigin: binding.requestingOrigin,
      embeddingOrigin: binding.embeddingOrigin, requestingFrame: { processId: binding.frame.processId, routingId: binding.frame.routingId },
      permissions, ...(binding.mediaTypes ? { mediaTypes: binding.mediaTypes } : {}), presentation: 'normal',
      variant, availableActions, provider: PERMISSION_SOURCE, nativeProvider: false,
      ...(binding.deviceType ? { deviceType: binding.deviceType, devices: binding.choices.map(choice => ({ deviceId: choice.id,
        name: label(choice.device.productName ?? choice.device.displayName ?? choice.device.portName, binding.deviceType),
        persistentGrantAvailable: choice.identity.persistent })) } : {}),
      systemSettingsAvailable };
    clone(binding.snapshot);
    this.browser.permissionPrompts.set(id, binding);
    try { this.browser.emit('permission-prompt', binding.snapshot); } catch (error) { this.dismiss(binding); throw error; }
  }
  closed(binding, value) {
    if (binding.closed) return;
    binding.closed = true;
    try { binding.callback(value); }
    finally {
      if (this.browser.permissionPrompts.get(binding.id) === binding) this.browser.permissionPrompts.delete(binding.id);
      this.browser.emit('permission-prompt-closed', { tabId: binding.tab.id, promptId: binding.id, promptGeneration: binding.generation });
    }
  }
  dismiss(binding) { this.closed(binding, binding.deviceType ? undefined : false); }
  track(promise, binding) {
    const job = Promise.resolve(promise); this.jobs.add(job);
    const life = { tab: binding.tab, leaseId: binding.leaseId, promise: job };
    this.browser.permissionLifecycles.add(life);
    void job.finally(() => { this.jobs.delete(job); this.browser.permissionLifecycles.delete(life); }).catch(() => {});
    return job;
  }
  respond(binding, value, signal) {
    this.assertCurrent(binding); signal?.throwIfAborted();
    if (binding.responding) throw fail('This permission prompt is already being answered', 'TARGET_BUSY');
    if (value.method === 'permissions.openSystemSettings') return this.track(this.openSystemSettings(binding, signal), binding);
    onlyKeys(value.response, ['action', 'deviceId']);
    if (!binding.snapshot.availableActions.includes(value.response.action) || !binding.deviceType && value.response.deviceId !== undefined)
      throw fail('Unsupported website permission response', 'INVALID_ARGUMENT');
    binding.responding = true;
    return this.track(this.respondOwned(binding, value.response, signal).finally(() => { binding.responding = false; }), binding);
  }
  async respondOwned(binding, response, signal) {
    const allow = response.action === 'allow' || response.action === 'allow-this-time';
    let selected;
    if (allow && binding.deviceType) {
      selected = response.deviceId === undefined && binding.choices.length === 1 ? binding.choices[0]
        : binding.choices.find(choice => choice.id === response.deviceId);
      if (!selected) throw fail('Select an actual device from this permission prompt', 'INVALID_ARGUMENT');
      if (response.action === 'allow' && !selected.identity.persistent) throw fail('This device has no persistent identity; use a temporary grant', 'INVALID_ARGUMENT');
    }
    const persistent = !binding.transient && ['allow', 'deny'].includes(response.action);
    const selectedOrigins = { requestingOrigin: binding.requestingOrigin, embeddingOrigin: binding.embeddingOrigin };
    const candidates = response.action === 'deny' && !binding.transient ? this.revocationTargets(binding.types, selectedOrigins) : new Set();
    let removedDevices = false;
    if (persistent) {
      await this.store.mutate(next => {
        const now = Date.now();
        if (allow && binding.deviceType) {
          next.devices = next.devices.filter(item => !(item.deviceType === binding.deviceType && item.origin === binding.requestingOrigin && item.deviceKey === selected.identity.key));
          next.devices.push({ deviceType: binding.deviceType, origin: binding.requestingOrigin, deviceKey: selected.identity.key, updatedAt: now });
        } else {
          for (const type of binding.types) {
            next.sites = next.sites.filter(item => !(item.type === type && item.requestingOrigin === binding.requestingOrigin && item.embeddingOrigin === binding.embeddingOrigin));
            next.sites.push({ type, requestingOrigin: binding.requestingOrigin, embeddingOrigin: binding.embeddingOrigin,
              setting: allow ? 'allow' : 'block', updatedAt: now });
          }
          if (!allow) {
            const before = next.devices.length;
            next.devices = next.devices.filter(item => !binding.types.includes(DEVICE_TYPES.get(item.deviceType)) || item.origin !== binding.requestingOrigin);
            removedDevices = next.devices.length !== before;
          }
        }
      }, { signal, assertCurrent: () => this.assertCurrent(binding) });
    }
    signal?.throwIfAborted(); this.assertCurrent(binding);
    if (allow) {
      if (binding.deviceType) {
        this.revokedDevices.delete(deviceGrantKey(binding.deviceType, binding.requestingOrigin, selected.identity.key));
        if (response.action === 'allow-this-time') this.browser.permissionGrants.set(deviceGrantKey(binding.deviceType, binding.requestingOrigin, selected.identity.key),
          { ...binding, deviceKey: selected.identity.key, choices: undefined, snapshot: undefined, callback: undefined });
      } else if (response.action === 'allow-this-time') for (const type of binding.transient ? [binding.permission] : binding.types) this.browser.permissionGrants.set(
        JSON.stringify(['opencu-permission', binding.tab.id, type, frameKey(binding.frame)]), { ...binding, type, snapshot: undefined, callback: undefined });
    }
    const result = { accepted: true, closed: true, promptId: binding.id, promptGeneration: binding.generation,
      source: PERMISSION_SOURCE, persistent, prefWriteCompleted: persistent };
    this.closed(binding, binding.deviceType ? allow ? selected.id : undefined : allow);
    if (response.action === 'deny' && !binding.transient) Object.assign(result, this.revoke(binding.types, selectedOrigins, candidates, removedDevices));
    return result;
  }
  systemPermission(type) {
    const kind = type === 9 ? 'microphone' : type === 10 ? 'camera' : undefined;
    if (!kind || !['darwin', 'win32'].includes(process.platform) || typeof systemPreferences.getMediaAccessStatus !== 'function') return 'unknown';
    try { return systemPreferences.getMediaAccessStatus(kind); } catch { return 'unknown'; }
  }
  systemSettingsUrl(type) {
    if (![9, 10].includes(type)) return undefined;
    if (process.platform === 'darwin') return `x-apple.systempreferences:com.apple.preference.security?Privacy_${type === 9 ? 'Microphone' : 'Camera'}`;
    if (process.platform === 'win32') return `ms-settings:privacy-${type === 9 ? 'microphone' : 'webcam'}`;
    return undefined;
  }
  async openSystemSettings(binding, signal) {
    const urls = [...new Set(binding.types.map(type => this.systemSettingsUrl(type)).filter(Boolean))];
    if (!urls.length) throw fail('System settings are unavailable for this permission', 'UNSUPPORTED_OPERATION');
    this.assertCurrent(binding); signal?.throwIfAborted();
    await shell.openExternal(urls[0]);
    signal?.throwIfAborted(); this.assertCurrent(binding);
    return { accepted: true, opened: true, closed: false, promptId: binding.id, promptGeneration: binding.generation, source: 'operating-system-settings' };
  }
  describe(type, selected, document) {
    const descriptor = PERMISSION_TYPES.get(type), defaults = this.store.default(type);
    const site = selected.scope === 'origin' ? this.store.site(type, selected.requestingOrigin, selected.embeddingOrigin) : undefined;
    const temporary = selected.scope === 'origin' && document && document.requestingOrigin === selected.requestingOrigin
      && document.embeddingOrigin === selected.embeddingOrigin && this.temporary(type, document);
    const customDefault = this.store.state.defaults.some(item => item.type === type);
    const result = { type, name: descriptor.name, permissionKey: descriptor.permissionKey, ...selected,
      source: PERMISSION_SOURCE, schemaVersion: 1, settingKind: 'content-setting', defaultSetting: defaults,
      defaultProvider: customDefault ? 'user' : 'builtin', persistentReady: this.store.ready,
      setting: temporary && (site?.setting ?? defaults) !== 'block' ? 'allow' : site?.setting ?? defaults,
      settingSource: temporary ? 'temporary-document' : site || selected.scope === 'default' && customDefault ? 'user' : 'default',
      managed: false, isOneTime: temporary === true, systemPermission: this.systemPermission(type) };
    if (selected.scope === 'origin') Object.assign(result, { primaryPattern: site || temporary ? selected.requestingOrigin : '*',
      secondaryPattern: site || temporary ? selected.embeddingOrigin : '*', usesDefault: !site && !temporary });
    return result;
  }
  settingsDocument(tab, input) {
    if (input.leaseId !== undefined || input.actorId !== undefined) this.browser.assertControl(this.browser.control(tab, input), input.actorId);
    const contents = tab.view.webContents;
    this.ownedTab(contents);
    return this.bindDocument(tab, contents.mainFrame, providedOrigin(contents.mainFrame.origin), providedOrigin(contents.mainFrame.origin));
  }
  async settings(method, input, options = {}) {
    if (!this.settingsCapabilities().available) throw fail('Website permission settings are unavailable', 'PERMISSION_STORAGE_UNAVAILABLE');
    if (method !== 'siteSettings.get' && options.trustedUserAction !== true) throw fail('Website permission changes require a trusted user action', 'USER_ACTION_REQUIRED');
    const tab = this.browser.tab(input.tabId), document = this.settingsDocument(tab, input);
    const { tabId, leaseId, actorId, explicitUserCommand, siteUrl, origin, ...setting } = input;
    const assertCurrent = () => this.assertDocument(document);
    assertCurrent(); options.signal?.throwIfAborted();
    if (method === 'siteSettings.open') {
      onlyKeys(setting, []);
      const url = tab.view.webContents.getURL();
      if (siteUrl !== url || exactOrigin(origin) !== document.requestingOrigin) throw fail('The website settings source changed', 'STALE_TARGET');
      if (typeof this.browser.options.siteInformation?.open !== 'function') throw fail('The website settings window is unavailable', 'UNSUPPORTED_OPERATION');
      return this.browser.options.siteInformation.open(tab, { ...input, explicitUserCommand: true, presentation: 'opencu-browser-window', view: 'settings' }, options);
    }
    if (method === 'siteSettings.clear') {
      onlyKeys(setting, ['types', 'allOrigins', 'requestingOrigin', 'embeddingOrigin']);
      const types = permissionTypes(setting.types), allOrigins = setting.allOrigins === true;
      if (setting.allOrigins !== undefined && !allOrigins || allOrigins && (setting.requestingOrigin !== undefined || setting.embeddingOrigin !== undefined))
        throw fail('Invalid website permission clear scope', 'INVALID_ARGUMENT');
      const selected = allOrigins ? undefined : selection({ scope: 'origin', ...setting });
      const candidates = this.revocationTargets(types, selected);
      let removedDevices = false;
      const result = await this.store.mutate(next => {
        const before = next.sites.length + next.devices.length, devicesBefore = next.devices.length;
        next.sites = next.sites.filter(item => !types.includes(item.type) || !allOrigins
          && (item.requestingOrigin !== selected.requestingOrigin || item.embeddingOrigin !== selected.embeddingOrigin));
        next.devices = next.devices.filter(item => !types.includes(DEVICE_TYPES.get(item.deviceType)) || !allOrigins && item.origin !== selected.requestingOrigin);
        removedDevices = next.devices.length !== devicesBefore;
        return { removedCount: before - next.sites.length - next.devices.length };
      }, { signal: options.signal, assertCurrent });
      const revocation = this.revoke(types, selected, candidates, removedDevices);
      return { ...result, accepted: true, prefWriteCompleted: true, persistentReady: true, source: PERMISSION_SOURCE,
        types, allOrigins, defaultsCleared: false, ...(selected ? { requestingOrigin: selected.requestingOrigin, embeddingOrigin: selected.embeddingOrigin } : {}), ...revocation };
    }
    if (method === 'siteSettings.reset' && setting.types !== undefined) {
      onlyKeys(setting, ['types', 'scope', 'requestingOrigin', 'embeddingOrigin']);
      const types = permissionTypes(setting.types), selected = selection(setting);
      const revokeSelection = selected.scope === 'origin' ? selected : undefined;
      const candidates = this.revocationTargets(types, revokeSelection);
      let removedDevices = false;
      await this.store.mutate(next => {
        if (selected.scope === 'default') next.defaults = next.defaults.filter(item => !types.includes(item.type));
        else next.sites = next.sites.filter(item => !types.includes(item.type)
          || item.requestingOrigin !== selected.requestingOrigin || item.embeddingOrigin !== selected.embeddingOrigin);
        const before = next.devices.length;
        next.devices = next.devices.filter(item => !types.includes(DEVICE_TYPES.get(item.deviceType))
          || selected.scope !== 'default' && item.origin !== selected.requestingOrigin);
        removedDevices = next.devices.length !== before;
      }, { signal: options.signal, assertCurrent });
      const revocation = this.revoke(types, revokeSelection, candidates, removedDevices);
      return { accepted: true, prefWriteCompleted: true, persistentReady: true, source: PERMISSION_SOURCE,
        ...selected, types, settings: types.map(type => this.describe(type, selected)), ...revocation };
    }
    if (!['siteSettings.get', 'siteSettings.set', 'siteSettings.reset'].includes(method)) throw fail('Unsupported website permission operation', 'UNSUPPORTED_OPERATION');
    onlyKeys(setting, method === 'siteSettings.set' ? ['type', 'scope', 'requestingOrigin', 'embeddingOrigin', 'setting', 'oneTime']
      : ['type', 'scope', 'requestingOrigin', 'embeddingOrigin']);
    const type = permissionType(setting.type), selected = selection(setting);
    if (method === 'siteSettings.get') return clone(this.describe(type, selected, document));
    if (method === 'siteSettings.set' && setting.oneTime !== undefined && typeof setting.oneTime !== 'boolean') throw fail('Invalid temporary permission option', 'INVALID_ARGUMENT');
    const value = method === 'siteSettings.set' ? typeSetting(type, setting.setting) : undefined;
    if (setting.oneTime === true) {
      if (selected.scope !== 'origin' || value !== 'allow' || !PERMISSION_TYPES.get(type).supportsTemporaryGrant
        || selected.requestingOrigin !== document.requestingOrigin || selected.embeddingOrigin !== document.embeddingOrigin
        || this.store.setting(type, selected.requestingOrigin, selected.embeddingOrigin) === 'block')
        throw fail('A temporary permission must address this actual unblocked document', 'INVALID_ARGUMENT');
      this.browser.permissionGrants.set(JSON.stringify(['opencu-permission', tab.id, type, frameKey(document.frame)]), { ...document, type });
      return { ...this.describe(type, selected, document), accepted: true, prefWriteCompleted: false, temporaryGrantApplied: true };
    }
    const revokeSelection = selected.scope === 'origin' ? selected : undefined;
    const candidates = this.revocationTargets([type], revokeSelection);
    let removedDevices = false;
    await this.store.mutate(next => {
      if (selected.scope === 'default') {
        next.defaults = next.defaults.filter(item => item.type !== type);
        if (method === 'siteSettings.set') next.defaults.push({ type, setting: value, updatedAt: Date.now() });
      } else {
        next.sites = next.sites.filter(item => !(item.type === type && item.requestingOrigin === selected.requestingOrigin && item.embeddingOrigin === selected.embeddingOrigin));
        if (method === 'siteSettings.set') next.sites.push({ type, requestingOrigin: selected.requestingOrigin,
          embeddingOrigin: selected.embeddingOrigin, setting: value, updatedAt: Date.now() });
      }
      if (DEVICE_TYPES.has(PERMISSION_TYPES.get(type).permissionKey) && (method === 'siteSettings.reset' || value !== 'allow')) {
        const before = next.devices.length;
        next.devices = next.devices.filter(item => DEVICE_TYPES.get(item.deviceType) !== type || selected.scope !== 'default' && item.origin !== selected.requestingOrigin);
        removedDevices = next.devices.length !== before;
      }
    }, { signal: options.signal, assertCurrent });
    const revocation = this.revoke([type], revokeSelection, candidates, removedDevices);
    return { ...this.describe(type, selected), accepted: true, prefWriteCompleted: true, ...revocation };
  }
  matchingFrames(tab, selected) {
    const contents = tab.view.webContents;
    if (contents.isDestroyed()) return [];
    const top = contents.mainFrame;
    if (top.isDestroyed() || selected?.embeddingOrigin !== undefined && top.origin !== selected.embeddingOrigin) return [];
    return top.framesInSubtree.filter(frame => !frame.isDestroyed() && (!selected || frame.origin === selected.requestingOrigin));
  }
  revocationTargets(types, selected) {
    const tabs = new Set();
    for (const tab of this.browser.tabs.values()) {
      if (tab.view.webContents.isDestroyed()) continue;
      const frames = this.matchingFrames(tab, selected), top = tab.view.webContents.mainFrame;
      if (frames.some(frame => types.some(type => this.store.setting(type, frame.origin, top.origin) === 'allow'
        || this.store.state.devices.some(item => DEVICE_TYPES.get(item.deviceType) === type && item.origin === frame.origin)))) tabs.add(tab.id);
    }
    for (const grant of this.browser.permissionGrants.values()) if (grant.pluginPermission && this.matchesPermission(grant, types, selected)) tabs.add(grant.tab.id);
    return tabs;
  }
  matchesPermission(binding, types, selected) {
    return types.some(type => binding.type === type || binding.types?.includes(type) || DEVICE_TYPES.get(binding.deviceType) === type)
      && (!selected || binding.requestingOrigin === selected.requestingOrigin
        && (selected.embeddingOrigin === undefined || binding.embeddingOrigin === selected.embeddingOrigin));
  }
  revoke(types, selected, candidates = new Set(), deviceRemoved = false) {
    for (const binding of [...this.browser.permissionPrompts.values()]) if (binding.pluginPermission && this.matchesPermission(binding, types, selected)) this.dismiss(binding);
    for (const [key, grant] of this.browser.permissionGrants) if (grant.pluginPermission && (this.matchesPermission(grant, types, selected)
      || deviceRemoved && grant.deviceType && types.includes(DEVICE_TYPES.get(grant.deviceType))
        && (!selected || grant.requestingOrigin === selected.requestingOrigin))) this.browser.permissionGrants.delete(key);
    if (deviceRemoved) {
      candidates = new Set(candidates);
      for (const tab of this.browser.tabs.values()) if (this.matchingFrames(tab, selected ? { requestingOrigin: selected.requestingOrigin } : undefined).length) candidates.add(tab.id);
    }
    const reloadRequestedTabIds = [], reloadFailedTabIds = [];
    for (const id of candidates) {
      const tab = this.browser.tabs.get(id);
      if (!tab || tab.view.webContents.isDestroyed()) continue;
      const top = tab.view.webContents.mainFrame, frames = this.matchingFrames(tab, selected);
      if (!deviceRemoved && !frames.some(frame => types.some(type => this.store.setting(type, frame.origin, top.origin) !== 'allow'))) continue;
      // Unload active operations; Electron has no public per-stream revocation
      // API. Report the real reload request, not an assumed completed reload.
      try { tab.view.webContents.reload(); reloadRequestedTabIds.push(id); } catch { reloadFailedTabIds.push(id); }
    }
    return { policyApplied: true, reloadRequestedTabIds, reloadFailedTabIds };
  }
  deviceRevoked(type, details) {
    let origin, identity;
    try { if (details.origin !== undefined) origin = providedOrigin(details.origin); } catch {}
    try { identity = deviceIdentity(type, details.device ?? details.port); } catch {}
    if (origin && identity) this.revokedDevices.add(deviceGrantKey(type, origin, identity.key));
    else this.revokedDevices.add(`${type}:*`);
    const matches = item => item.deviceType === type && (!origin || (item.origin ?? item.requestingOrigin) === origin)
      && (!identity || item.deviceKey === identity.key);
    for (const [key, grant] of this.browser.permissionGrants) if (grant.pluginPermission && matches(grant)) this.browser.permissionGrants.delete(key);
    const job = this.store.mutate(next => { next.devices = next.devices.filter(item => !matches(item)); });
    this.jobs.add(job);
    void job.then(() => { if (!origin || !identity) this.revokedDevices.delete(`${type}:*`); })
      .finally(() => this.jobs.delete(job)).catch(() => {});
  }
  summary() { return this.store.summary(); }
  async clearData({ since = 0, until = Number.MAX_SAFE_INTEGER, signal } = {}) {
    if (!Number.isSafeInteger(since) || since < 0 || !Number.isSafeInteger(until) || until < since) throw fail('Invalid permission removal time range', 'INVALID_ARGUMENT');
    const selectedRecords = [];
    const allTime = since === 0 && until === Number.MAX_SAFE_INTEGER;
    const temporaryTypes = [...PERMISSION_TYPES.keys(), ...transientPermissions];
    const temporaryCandidates = allTime ? this.revocationTargets(temporaryTypes) : undefined;
    const result = await this.store.mutate(next => {
      const selected = item => item.updatedAt >= since && item.updatedAt < until;
      selectedRecords.push(...next.sites.filter(selected).map(item => ({ type: item.type, requestingOrigin: item.requestingOrigin, embeddingOrigin: item.embeddingOrigin })),
        ...next.devices.filter(selected).map(item => ({ type: DEVICE_TYPES.get(item.deviceType), requestingOrigin: item.origin, device: true })));
      const before = next.sites.length + next.devices.length;
      next.sites = next.sites.filter(item => !selected(item)); next.devices = next.devices.filter(item => !selected(item));
      return { removedCount: before - next.sites.length - next.devices.length };
    }, { signal });
    const reloadRequestedTabIds = new Set(), reloadFailedTabIds = new Set();
    for (const item of selectedRecords) {
      const selected = { requestingOrigin: item.requestingOrigin, ...(item.device ? {} : { embeddingOrigin: item.embeddingOrigin }) };
      const candidates = new Set([...this.browser.tabs.values()].filter(tab => this.matchingFrames(tab, selected)
        .some(frame => frame.origin === item.requestingOrigin) && !reloadRequestedTabIds.has(tab.id)).map(tab => tab.id));
      const revoked = this.revoke([item.type], selected, candidates, item.device === true);
      revoked.reloadRequestedTabIds.forEach(id => reloadRequestedTabIds.add(id)); revoked.reloadFailedTabIds.forEach(id => reloadFailedTabIds.add(id));
    }
    if (allTime) {
      const candidates = new Set([...temporaryCandidates].filter(id => !reloadRequestedTabIds.has(id)));
      const revoked = this.revoke(temporaryTypes, undefined, candidates);
      revoked.reloadRequestedTabIds.forEach(id => reloadRequestedTabIds.add(id)); revoked.reloadFailedTabIds.forEach(id => reloadFailedTabIds.add(id));
    }
    return { ...result, accepted: true, committed: true, prefWriteCompleted: true, source: PERMISSION_SOURCE,
      defaultsCleared: false, since, until, policyApplied: true,
      reloadRequestedTabIds: [...reloadRequestedTabIds], reloadFailedTabIds: [...reloadFailedTabIds] };
  }
  pageInfoCapabilities(tab) { return this.browser.options.siteInformation?.capabilities(tab) ?? { available: false, nativeProvider: false, reason: 'site-information-unavailable' }; }
  pageInfo(tab, value, options) {
    if (!this.browser.options.siteInformation) throw fail('Website information is unavailable', 'SITE_INFO_UNAVAILABLE');
    return this.browser.options.siteInformation.open(tab, value, options);
  }
  detachHandlers() {
    // Null restores Electron's permissive defaults. Keep explicit deny handlers
    // in this isolated session after shutdown or a partial installation.
    this.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    this.session.setPermissionCheckHandler(() => false); this.session.setDevicePermissionHandler(() => false);
    for (const [name, handler] of this.listeners) this.session.removeListener(name, handler);
    this.listeners = []; this.installed = false;
  }
  dispose() {
    if (this.disposal) return this.disposal;
    this.closing = true;
    this.detachHandlers();
    for (const watch of [...this.watches.values()]) this.releaseTab(watch.tab);
    for (const binding of [...this.browser.permissionPrompts.values()]) if (binding.pluginPermission) this.dismiss(binding);
    this.deviceContexts.clear(); this.revokedDevices.clear();
    this.disposal = Promise.allSettled([...this.jobs]).then(async results => {
      await this.store.close();
      const rejected = results.find(result => result.status === 'rejected'
        && !['AbortError', 'STALE_TARGET', 'CONTROL_STOPPED'].includes(result.reason?.name ?? '')
        && !['STALE_TARGET', 'CONTROL_STOPPED'].includes(result.reason?.code));
      if (rejected) throw rejected.reason;
    });
    return this.disposal;
  }
}
