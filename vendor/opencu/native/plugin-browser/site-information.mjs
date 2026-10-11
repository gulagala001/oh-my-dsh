import { randomUUID, X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, ipcMain, session } from 'electron';
import { fail, record } from './ipc.mjs';
import { siteInformationDocument } from './site-information-renderer.mjs';

const PROVIDER = 'opencu-site-information';
const REQUEST = 'opencu-site-information:request';
const STATE = 'opencu-site-information:state';
const PRELOAD = fileURLToPath(new URL('./site-information-preload.cjs', import.meta.url));
const SERVICES = new Set();
const VIEWS = new Set(['overview', 'certificate', 'cookies', 'settings']);
const SECURITY_STATES = new Set(['unknown', 'neutral', 'insecure', 'secure', 'info', 'insecure-broken']);
const COMMANDS = new Set(['Security.enable', 'Network.getCertificate', 'Network.fetchSchemefulSite',
  'Network.getCookies', 'Storage.getCookies', 'Storage.getUsageAndQuota', 'Network.deleteCookies']);
const CLOSE_REASONS = { user: 0, navigation: 1, 'tab-closed': 2, canceled: 3, disposed: 4,
  'renderer-gone': 5, replaced: 6, 'owner-closed': 7, 'control-ended': 8, 'open-failed': 9 };
const STORES = ['filesystem', 'indexdb', 'localstorage', 'serviceworkers', 'cachestorage'];
const text = (value, maximum = 4096) => typeof value === 'string' ? value.slice(0, maximum) : '';
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const problem = (message, code = 'SITE_INFO_UNAVAILABLE') => fail(message, code);
const emptySecurity = () => ({ available: false, state: 'unknown', source: 'unavailable',
  certificateValidation: 'unknown', certificate: [], issues: [], connection: null });
const emptyStorage = entry => ({ available: false, origin: entry.selected.origin, usage: null, items: [],
  canClear: typeof entry.source.session.clearStorageData === 'function' });
const certificateHost = value => value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1).toLowerCase() : value.toLowerCase();

function site(value) {
  if (typeof value !== 'string' || value.length > 32768) throw problem('站点地址无效。', 'INVALID_ARGUMENT');
  let url;
  try { url = new URL(value); } catch { throw problem('站点地址无效。', 'INVALID_ARGUMENT'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw problem('站点信息只支持当前 HTTP 或 HTTPS 页面。', 'UNSUPPORTED_OPERATION');
  }
  return url;
}

async function bounded(promise, signal, message = '站点信息操作超时。') {
  signal?.throwIfAborted();
  let timer, abort;
  const limit = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(problem(message, 'SITE_INFO_TIMEOUT')), 10000);
    abort = () => reject(signal.reason ?? problem('站点信息操作已取消。', 'CONTROL_STOPPED'));
    signal?.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([promise, limit]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

function destructionBarrier(target, event) {
  if (target.isDestroyed()) return { promise: Promise.resolve(), remove: () => {} };
  let finish;
  const promise = new Promise(resolve => { finish = resolve; });
  target.once(event, finish);
  return { promise, remove: () => target.removeListener(event, finish) };
}

function certificateDetails(encoded, hostname, index) {
  if (typeof encoded !== 'string' || encoded.length > 262144 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) return null;
  try {
    const certificate = new X509Certificate(Buffer.from(encoded, 'base64'));
    const host = certificateHost(hostname);
    const validFrom = Date.parse(certificate.validFrom), validTo = Date.parse(certificate.validTo);
    return { index, subject: text(certificate.subject, 16384), issuer: text(certificate.issuer, 16384),
      subjectAlternativeName: text(certificate.subjectAltName, 16384), serialNumber: text(certificate.serialNumber),
      fingerprint256: text(certificate.fingerprint256), fingerprint: text(certificate.fingerprint),
      validFrom: Number.isFinite(validFrom) ? validFrom : null, validTo: Number.isFinite(validTo) ? validTo : null,
      publicKeyType: text(certificate.publicKey.asymmetricKeyType, 128), ca: certificate.ca === true,
      ...(index === 0 ? { hostnameMatches: !!(isIP(host)
        ? certificate.checkIP(host) : certificate.checkHost(host)) } : {}) };
  } catch { return null; }
}

function chain(value, hostname) {
  return Array.isArray(value) ? value.slice(0, 16).map((encoded, index) => certificateDetails(encoded, hostname, index)).filter(Boolean) : [];
}

function visibleSecurity(value, hostname) {
  if (!record(value) || !SECURITY_STATES.has(value.securityState)) return null;
  const cert = record(value.certificateSecurityState) ? value.certificateSecurityState : null;
  const certificate = chain(cert?.certificate, hostname);
  const error = text(cert?.certificateNetworkError, 512);
  const warning = certificate[0]?.hostnameMatches === false || cert?.certificateHasWeakSignature === true
    || cert?.certificateHasSha1Signature === true || cert?.obsoleteSslProtocol === true
    || cert?.obsoleteSslKeyExchange === true || cert?.obsoleteSslCipher === true || cert?.obsoleteSslSignature === true;
  return { available: true, state: value.securityState, source: 'cdp-visible-security-state', certificate,
    certificateValidation: error || certificate[0]?.hostnameMatches === false ? 'failed'
      : cert && value.securityState === 'secure' && certificate.length ? 'verified' : 'unknown',
    issues: (Array.isArray(value.securityStateIssueIds) ? value.securityStateIssueIds : []).slice(0, 64)
      .filter(item => typeof item === 'string').map(item => text(item, 512)),
    ...(error ? { certificateError: error } : {}), certificateWarning: warning,
    connection: cert ? { protocol: text(cert.protocol, 256), cipher: text(cert.cipher, 256),
      keyExchange: text(cert.keyExchange, 256), keyExchangeGroup: text(cert.keyExchangeGroup, 256),
      mac: text(cert.mac, 256), modernSSL: cert.modernSSL === true } : null,
    ...(record(value.safetyTipInfo) ? { safetyTip: text(value.safetyTipInfo.safetyTipStatus, 256) } : {}) };
}

function cookieDomainMatches(cookie, hostname) {
  if (typeof cookie.domain !== 'string') return false;
  const domain = cookie.domain.toLowerCase().replace(/^\./u, '').replace(/\.+$/u, '');
  const host = hostname.toLowerCase().replace(/\.+$/u, '');
  return host === domain || cookie.domain.startsWith('.') && host.endsWith('.' + domain);
}

function partition(cookie) {
  if (cookie.partitionKeyOpaque === true) return null;
  if (cookie.partitionKey === undefined) return undefined;
  const value = cookie.partitionKey;
  if (!record(value) || typeof value.topLevelSite !== 'string' || value.topLevelSite.length > 4096
    || typeof value.hasCrossSiteAncestor !== 'boolean') return null;
  return { topLevelSite: value.topLevelSite, hasCrossSiteAncestor: value.hasCrossSiteAncestor };
}

function cookieKey(cookie) {
  return JSON.stringify([cookie.name, cookie.domain, cookie.path, partition(cookie) ?? null]);
}

function publicError(error) {
  const allowed = new Set(['STALE_TARGET', 'USER_ACTION_REQUIRED', 'SITE_INFO_PENDING', 'SITE_INFO_TIMEOUT',
    'SITE_INFO_UNAVAILABLE', 'INVALID_ARGUMENT', 'UNSUPPORTED_OPERATION', 'CONTROL_STOPPED', 'PROVIDER_CLOSED',
    'PERMISSION_WRITE_UNCONFIRMED', 'COOKIE_DELETE_UNCONFIRMED']);
  const code = allowed.has(error?.code) ? error.code : 'SITE_INFO_UNAVAILABLE';
  return { code, message: allowed.has(error?.code) ? text(error.message, 512) : '无法完成当前站点操作。请刷新后重试。' };
}

function installIpc() {
  if (SERVICES.size) return;
  ipcMain.handle(REQUEST, async (event, input) => {
    const service = [...SERVICES].find(item => item.owns(event.sender));
    if (!service) return { ok: false, error: { code: 'STALE_TARGET', message: '站点信息窗口已关闭。' } };
    try { return { ok: true, result: await service.request(event, input) }; }
    catch (error) { return { ok: false, error: publicError(error) }; }
  });
}

/** Plugin-owned UI backed by the owned Electron session. It is not a Chromium page-info provider. */
export class PluginBrowserSiteInformation {
  #entries = new Map();
  #opening = new Map();
  #verifications = new Map();
  #disposed = false;
  #disposePromise;
  #verificationInstalled = false;
  #cleanupFailures = new Set();

  constructor({ browser, permissions }) {
    if (!browser?.browserSession || !browser.tabs || typeof browser.emit !== 'function') {
      throw problem('站点信息需要真实的浏览器会话。', 'INVALID_ARGUMENT');
    }
    this.browser = browser;
    this.permissions = permissions;
    // -3 preserves Chromium's own result, including Certificate Transparency checks.
    if (typeof browser.browserSession.setCertificateVerifyProc === 'function') {
      browser.browserSession.setCertificateVerifyProc((request, callback) => {
        try {
          const certificate = new X509Certificate(request.certificate.data);
          const hostname = certificateHost(text(request.hostname));
          const key = hostname + '\0' + certificate.fingerprint256;
          this.#verifications.delete(key);
          this.#verifications.set(key, { hostname, fingerprint256: certificate.fingerprint256,
            errorCode: Number.isSafeInteger(request.errorCode) ? request.errorCode : null,
            result: text(request.verificationResult, 256), knownRoot: request.isIssuedByKnownRoot === true,
            observedAt: Date.now() });
          while (this.#verifications.size > 512) this.#verifications.delete(this.#verifications.keys().next().value);
        } catch {} finally { callback(-3); }
      });
      this.#verificationInstalled = true;
    }
    installIpc();
    SERVICES.add(this);
  }

  capabilities(tab) {
    const contents = tab?.view?.webContents;
    let url;
    try { url = site(contents?.getURL()); } catch {}
    const available = !this.#disposed && !this.browser.closing && !!contents && !contents.isDestroyed()
      && this.browser.tabs.get(tab.id) === tab && contents.session === this.browser.browserSession
      && !!url && typeof contents.debugger?.sendCommand === 'function';
    let permissionCapabilities;
    try { permissionCapabilities = this.permissions?.settingsCapabilities(); } catch {}
    const entry = this.#entries.get(tab?.id);
    return { available, provider: PROVIDER, nativeProvider: false, pluginOwnerReady: available,
      presentation: 'opencu-browser-window', security: available, certificateDetails: available,
      cookies: available, siteData: available && typeof this.browser.browserSession.clearStorageData === 'function',
      permissions: available && permissionCapabilities?.available === true,
      nativeSettingsPage: false, settingsPage: available && permissionCapabilities?.available === true,
      ...(tab ? { tabId: tab.id } : {}), ...(url ? { siteUrl: url.href } : {}),
      ...(entry?.opened && !entry.closing ? { activeDialogId: entry.id } : {}),
      ...(!available ? { reason: this.#disposed ? 'provider-closed' : 'owned-http-page-required' } : {}) };
  }

  owns(contents) { return [...this.#entries.values()].some(entry => entry.contents === contents); }

  async open(tab, input, options = {}) {
    if (!record(input) || input.explicitUserCommand !== true || options.trustedUserAction !== true
      || input.presentation !== 'opencu-browser-window' || input.anchorBounds !== undefined) {
      throw problem('打开站点信息需要可信的用户操作。', 'USER_ACTION_REQUIRED');
    }
    const selected = site(input.siteUrl), view = options.view ?? input.view ?? 'overview';
    if (!VIEWS.has(view)) throw problem('站点信息视图无效。', 'INVALID_ARGUMENT');
    if (!this.capabilities(tab).available) throw problem('当前页面的站点信息不可用。');
    if (tab.view.webContents.getURL() !== selected.href) throw problem('打开前页面已经改变。', 'STALE_TARGET');
    if (input.leaseId !== undefined || input.actorId !== undefined) {
      this.browser.assertControl(this.browser.control(tab, input), input.actorId);
    }
    options.signal?.throwIfAborted();
    if (this.#opening.has(tab.id)) throw problem('站点信息窗口正在打开。', 'SITE_INFO_PENDING');
    const previous = this.#entries.get(tab.id);
    if (previous && !previous.closing) {
      try {
        if (previous.leaseId !== input.leaseId || previous.actorId !== input.actorId) {
          throw problem('站点信息控制来源已经改变。', 'STALE_TARGET');
        }
        this.#assertCurrent(previous);
        previous.state.view = view;
        this.#publish(previous);
        previous.window.show(); previous.window.focus();
        return this.#receipt(previous);
      } catch { await this.#close(previous, 'replaced'); }
    } else if (previous) await previous.closing;
    const pending = this.#open(tab, selected, view, input, options);
    this.#opening.set(tab.id, pending);
    try { return await pending; }
    finally { if (this.#opening.get(tab.id) === pending) this.#opening.delete(tab.id); }
  }

  async #open(tab, selected, view, input, options) {
    const source = tab.view.webContents, frame = source.mainFrame;
    const owner = tab.detached?.window ?? tab.mounted;
    const actualOwner = owner && !owner.isDestroyed() && owner.isVisible() ? owner : null;
    const isolated = session.fromPartition('opencu-private-site-info-' + randomUUID(), { cache: false });
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.setDevicePermissionHandler?.(() => false);
    const page = 'data:text/html;charset=utf-8,' + encodeURIComponent(siteInformationDocument(randomUUID()));
    isolated.webRequest.onBeforeRequest((details, callback) => callback({
      cancel: details.url !== page || details.resourceType !== 'mainFrame'
    }));
    const window = new BrowserWindow({ show: false, width: 460, height: 620, minWidth: 360, minHeight: 440,
      ...(actualOwner ? { parent: actualOwner } : {}), title: '站点信息', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, session: isolated, sandbox: true, contextIsolation: true,
        nodeIntegration: false, webSecurity: true, devTools: false, webviewTag: false,
        allowRunningInsecureContent: false, navigateOnDragDrop: false } });
    window.setMenu(null);
    window.setContentProtection(true);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const entry = { id: randomUUID(), tab, source, selected, frame, tabGeneration: tab.generation,
      documentGeneration: tab.documentGeneration ?? 0, frameProcessId: frame.processId,
      frameRoutingId: frame.routingId, frameToken: frame.frameToken, frameTreeNodeId: frame.frameTreeNodeId,
      leaseId: input.leaseId, actorId: input.actorId, page, isolated, window, contents: window.webContents,
      controller, signal, opened: false, closedEvent: false, closing: null, operation: null,
      cookieIds: new Map(), cookies: new Map(), gestureSerial: 0, usedGesture: 0, gestureTime: 0,
      reloadPrompt: false, listeners: [], state: { dialogId: null, view, origin: selected.origin,
        siteUrl: selected.href, host: selected.host, loading: true, security: emptySecurity(),
        cookies: { available: false, count: null, items: [] }, storage: { available: false, usage: null, items: [] },
        permissions: { available: false, items: [] }, reloadPrompt: false } };
    entry.state.dialogId = entry.id;
    this.#entries.set(tab.id, entry);
    const on = (target, name, listener) => { target.on(name, listener); entry.listeners.push(() => target.removeListener(name, listener)); };
    const close = reason => { void this.#close(entry, reason).catch(error => this.#cleanupFailures.add(error)); };
    on(source, 'did-start-navigation', (details, _url, _sameDocument, mainFrame) => {
      if (details?.isMainFrame === true || mainFrame === true) close('navigation');
    });
    on(source, 'did-navigate', () => close('navigation'));
    on(source, 'did-navigate-in-page', (_event, _url, isMainFrame) => { if (isMainFrame) close('navigation'); });
    on(source, 'destroyed', () => close('tab-closed'));
    on(source, 'render-process-gone', () => close('renderer-gone'));
    on(window.webContents, 'render-process-gone', () => close('renderer-gone'));
    if (actualOwner) on(actualOwner, 'closed', () => close('owner-closed'));
    on(window, 'close', event => { event.preventDefault(); close('user'); });
    on(window, 'closed', () => { if (!entry.closing) close('user'); });
    const gesture = () => { entry.gestureTime = Date.now(); entry.gestureSerial++; };
    on(window.webContents, 'before-input-event', (_event, value) => { if (value.type === 'keyDown' && !value.isAutoRepeat) gesture(); });
    on(window.webContents, 'before-mouse-event', (_event, value) => { if (['mouseDown', 'mouseUp'].includes(value.type)) gesture(); });
    entry.abort = () => close('canceled');
    signal.addEventListener('abort', entry.abort, { once: true });
    entry.timer = setInterval(() => {
      try { this.#assertCurrent(entry); } catch { close('control-ended'); }
    }, 1000);
    try {
      await bounded(window.loadURL(page), signal);
      this.#assertCurrent(entry);
      const operation = this.#loadState(entry);
      entry.operation = operation;
      try { await operation; } finally { if (entry.operation === operation) entry.operation = null; }
      this.#assertCurrent(entry);
      window.show(); window.focus();
      if (!window.isVisible() || window.webContents.isDestroyed()) throw problem('站点信息窗口未能显示。');
      entry.opened = true;
      this.#publish(entry);
      return this.#receipt(entry);
    } catch (error) { await this.#close(entry, 'open-failed'); throw error; }
  }

  #receipt(entry) {
    return { accepted: true, opened: true, closed: false, tabId: entry.tab.id, siteUrl: entry.selected.href,
      origin: entry.selected.origin, dialogId: entry.id, presentation: 'opencu-browser-window',
      provider: PROVIDER, nativeProvider: false, ...(entry.state.view === 'settings' ? { source: PROVIDER } : {}) };
  }

  #assertSource(entry) {
    const source = entry.source, frame = source.isDestroyed() ? null : source.mainFrame;
    if (this.#disposed || this.browser.closing || source.isDestroyed() || this.browser.tabs.get(entry.tab.id) !== entry.tab
      || source.session !== this.browser.browserSession || entry.tab.generation !== entry.tabGeneration
      || (entry.tab.documentGeneration ?? 0) !== entry.documentGeneration || source.getURL() !== entry.selected.href
      || !frame || frame.isDestroyed() || frame.processId !== entry.frameProcessId || frame.routingId !== entry.frameRoutingId
      || frame.frameToken !== entry.frameToken || frame.frameTreeNodeId !== entry.frameTreeNodeId
      || frame.origin !== entry.selected.origin || frame.url !== entry.selected.href) {
      throw problem('当前页面或站点已经改变。', 'STALE_TARGET');
    }
    if (entry.leaseId !== undefined) {
      this.browser.assertControl(this.browser.control(entry.tab, { leaseId: entry.leaseId }), entry.actorId);
    }
  }

  #assertCurrent(entry) {
    entry.signal.throwIfAborted();
    if (entry.closing || this.#entries.get(entry.tab.id) !== entry || entry.window.isDestroyed() || entry.contents.isDestroyed()) {
      throw problem('站点信息窗口已经关闭。', 'STALE_TARGET');
    }
    this.#assertSource(entry);
  }

  #trustedGesture(entry) {
    this.#assertCurrent(entry);
    if (!entry.window.isVisible() || !entry.window.isFocused() || entry.gestureSerial <= entry.usedGesture
      || Date.now() - entry.gestureTime > 30000) throw problem('此操作需要在站点信息窗口中确认。', 'USER_ACTION_REQUIRED');
    entry.usedGesture = entry.gestureSerial;
  }

  #publish(entry) {
    entry.state.reloadPrompt = entry.reloadPrompt;
    if (!entry.contents.isDestroyed()) entry.contents.send(STATE, entry.state);
    return structuredClone(entry.state);
  }

  async #withDebugger(entry, operation) {
    this.#assertCurrent(entry);
    const debuggerApi = entry.source.debugger;
    let own = false, detached = false;
    const onDetached = () => { detached = true; };
    debuggerApi.on('detach', onDetached);
    const pending = new Set();
    try {
      if (!debuggerApi.isAttached()) { debuggerApi.attach('1.3'); own = true; }
      const command = async (method, params = {}) => {
        this.#assertCurrent(entry);
        if (!COMMANDS.has(method) || detached || !debuggerApi.isAttached()) throw problem('页面连接已经改变。', 'STALE_TARGET');
        const native = debuggerApi.sendCommand(method, params);
        pending.add(native);
        void native.finally(() => pending.delete(native)).catch(() => {});
        const result = await bounded(native, entry.signal);
        this.#assertCurrent(entry);
        if (detached) throw problem('页面连接已经改变。', 'STALE_TARGET');
        return result;
      };
      return await operation(command, debuggerApi);
    } finally {
      try { if (pending.size) await bounded(Promise.allSettled([...pending]), undefined); }
      finally {
        debuggerApi.removeListener('detach', onDetached);
        // A borrowed debugger belongs to the browser control lease and must stay attached.
        if (own && !detached && !entry.source.isDestroyed() && debuggerApi.isAttached()) debuggerApi.detach();
      }
    }
  }

  async #readSecurity(entry, command, debuggerApi) {
    let observed = null, resolveEvent, timer;
    const event = new Promise(resolve => { resolveEvent = resolve; timer = setTimeout(resolve, 400); });
    const listener = (_event, method, params, sessionId) => {
      if (sessionId || method !== 'Security.visibleSecurityStateChanged') return;
      try { this.#assertCurrent(entry); observed = visibleSecurity(params?.visibleSecurityState, entry.selected.hostname); }
      catch { return; }
      if (observed) resolveEvent();
    };
    debuggerApi.on('message', listener);
    try {
      try { await command('Security.enable'); await event; } catch {}
      let result = observed ?? emptySecurity();
      if (!result.certificate.length && entry.selected.protocol === 'https:') {
        try {
          const response = await command('Network.getCertificate', { origin: entry.selected.origin });
          result.certificate = chain(response?.tableNames, entry.selected.hostname);
        } catch {}
      }
      if (!observed && entry.selected.protocol === 'http:') {
        result = { ...result, available: true, state: 'insecure', source: 'current-http-document', transport: 'unencrypted' };
      }
      const leaf = result.certificate[0];
      const verified = leaf && this.#verifications.get(certificateHost(entry.selected.hostname) + '\0' + leaf.fingerprint256);
      if (verified) {
        result.verification = { errorCode: verified.errorCode, result: verified.result,
          knownRoot: verified.knownRoot, observedAt: verified.observedAt, source: 'electron-default-certificate-verifier' };
        result.certificateValidation = verified.errorCode === 0 && /^(?:net::)?OK$/u.test(verified.result)
          && leaf.hostnameMatches === true ? 'verified' : verified.errorCode !== null ? 'failed' : 'unknown';
      }
      if (leaf && (leaf.hostnameMatches === false || leaf.validTo !== null && leaf.validTo < Date.now()
        || leaf.validFrom !== null && leaf.validFrom > Date.now())) result.certificateValidation = 'failed';
      if (result.certificateValidation === 'failed') {
        result.state = 'insecure-broken'; result.available = true;
        if (!observed) result.source = verified ? 'electron-default-certificate-verifier' : 'connection-certificate';
      }
      this.#assertCurrent(entry);
      return result;
    } finally { clearTimeout(timer); debuggerApi.removeListener('message', listener); }
  }

  async #readCookies(entry, command) {
    let schemefulSite = null, currentKeys = null;
    try {
      const result = await command('Network.fetchSchemefulSite', { origin: entry.selected.origin });
      if (typeof result?.schemefulSite === 'string') schemefulSite = result.schemefulSite;
    } catch {}
    if (!schemefulSite) {
      try {
        const response = await command('Network.getCookies', { urls: [entry.selected.href, entry.selected.origin + '/'] });
        currentKeys = new Set();
        for (const cookie of response.cookies ?? []) {
          if (partition(cookie) && cookieDomainMatches(cookie, entry.selected.hostname)) currentKeys.add(cookieKey(cookie));
          delete cookie.value;
        }
      } catch {}
    }
    const response = await command('Storage.getCookies');
    if (!Array.isArray(response?.cookies) || response.cookies.length > 65536) throw problem('当前站点 Cookie 清单不可用。');
    const identities = new Map(), items = [];
    let total = 0, omittedPartitions = 0;
    try {
      for (const cookie of response.cookies) {
        delete cookie.value;
        if (!cookieDomainMatches(cookie, entry.selected.hostname)) continue;
        const cookiePartition = partition(cookie);
        if (cookiePartition === null || cookiePartition && (schemefulSite
          ? cookiePartition.topLevelSite !== schemefulSite || cookiePartition.hasCrossSiteAncestor
          : !currentKeys?.has(cookieKey(cookie)))) { omittedPartitions++; continue; }
        if (typeof cookie.name !== 'string' || cookie.name.length > 4096 || typeof cookie.path !== 'string'
          || !cookie.path.startsWith('/') || cookie.path.length > 4096 || cookie.domain.length > 4096) continue;
        total++;
        if (identities.size >= 4096) continue;
        const key = cookieKey(cookie), id = entry.cookieIds.get(key) ?? randomUUID();
        const identity = { id, name: cookie.name, domain: cookie.domain, path: cookie.path,
          ...(cookiePartition ? { partitionKey: cookiePartition } : {}) };
        identities.set(id, identity); entry.cookieIds.set(key, id);
        if (items.length < 1024) items.push({ ...identity, size: finite(cookie.size), secure: cookie.secure === true,
          httpOnly: cookie.httpOnly === true, session: cookie.session === true,
          expires: finite(cookie.expires), sameSite: text(cookie.sameSite, 32), partitioned: !!cookiePartition });
      }
    } finally { for (const cookie of response.cookies) delete cookie.value; }
    entry.cookies = identities;
    const present = new Set([...identities.values()].map(cookieKey));
    for (const key of entry.cookieIds.keys()) if (!present.has(key)) entry.cookieIds.delete(key);
    return { available: true, scope: 'current-host-and-top-level-site', count: total, items,
      truncated: total > items.length, clearAllAvailable: total <= identities.size,
      partitionScopeComplete: !!schemefulSite, omittedPartitions, source: 'electron-cdp-cookie-store' };
  }

  async #readStorage(entry, command) {
    const response = await command('Storage.getUsageAndQuota', { origin: entry.selected.origin });
    if (finite(response?.usage) === null || finite(response?.quota) === null || !Array.isArray(response?.usageBreakdown)) {
      throw problem('当前站点存储用量不可用。');
    }
    return { available: true, origin: entry.selected.origin, usage: response.usage, quota: response.quota,
      scope: 'quota-managed-storage', source: 'electron-cdp-storage',
      canClear: typeof this.browser.browserSession.clearStorageData === 'function',
      items: response.usageBreakdown.slice(0, 32).filter(item => typeof item.storageType === 'string' && finite(item.usage) !== null)
        .map(item => ({ type: text(item.storageType, 64), usage: item.usage })) };
  }

  #settingInput(entry, type, extra = {}) {
    return { tabId: entry.tab.id, ...(entry.leaseId !== undefined ? { leaseId: entry.leaseId } : {}),
      ...(entry.actorId !== undefined ? { actorId: entry.actorId } : {}), explicitUserCommand: true,
      siteUrl: entry.selected.href, origin: entry.selected.origin, scope: 'origin',
      requestingOrigin: entry.selected.origin, embeddingOrigin: entry.selected.origin,
      ...(type === undefined ? {} : { type }), ...extra };
  }

  async #readPermissions(entry) {
    this.#assertCurrent(entry);
    const capabilities = this.permissions?.settingsCapabilities();
    if (capabilities?.available !== true || !Array.isArray(capabilities.contentSettings)) {
      return { available: false, items: [], reason: '站点权限当前不可用。' };
    }
    const descriptors = capabilities.contentSettings.filter(item => Number.isSafeInteger(item.type)
      && item.settingKind === 'content-setting' && Array.isArray(item.settingValues)).slice(0, 64);
    const items = [];
    for (const descriptor of descriptors) {
      this.#assertCurrent(entry);
      try {
        const value = await bounded(this.permissions.settings('siteSettings.get', this.#settingInput(entry, descriptor.type),
          { signal: entry.signal, trustedUserAction: true }), entry.signal);
        this.#assertCurrent(entry);
        if (value?.type !== descriptor.type || value.scope !== 'origin'
          || value.requestingOrigin !== entry.selected.origin || value.embeddingOrigin !== entry.selected.origin) {
          throw problem('站点权限来源已经改变。', 'STALE_TARGET');
        }
        if (typeof value.setting !== 'string' || value.setting !== 'default' && !descriptor.settingValues.includes(value.setting)) {
          throw problem('站点权限值不可用。');
        }
        items.push({ type: descriptor.type, name: text(descriptor.name ?? descriptor.key, 128),
          label: text(descriptor.label ?? descriptor.title, 256), setting: text(value.setting, 64),
          effectiveSetting: text(value.effectiveSetting ?? value.setting, 64), defaultSetting: text(value.defaultSetting, 64),
          settingValues: descriptor.settingValues.filter(item => ['allow', 'block', 'ask', 'default'].includes(item)),
          inherited: value.inherited === true || value.usesDefault === true || value.settingSource === 'default' || value.setting === 'default',
          canModify: value.persistentReady === true && descriptor.settingValues.some(item => ['allow', 'block', 'ask'].includes(item)) });
      } catch (error) {
        if (entry.signal.aborted || ['STALE_TARGET', 'CONTROL_STOPPED'].includes(error?.code)) throw error;
        items.push({ type: descriptor.type, name: text(descriptor.name ?? descriptor.key, 128),
          label: text(descriptor.label ?? descriptor.title, 256), unavailable: true, canModify: false, settingValues: [] });
      }
    }
    return { available: true, source: 'opencu-permission-store', origin: entry.selected.origin,
      canReset: capabilities.perSiteReset === true, items };
  }

  async #loadState(entry) {
    this.#assertCurrent(entry);
    entry.state.loading = true; this.#publish(entry);
    const results = await Promise.allSettled([
      this.#withDebugger(entry, async (command, debuggerApi) => {
        const values = await Promise.allSettled([this.#readSecurity(entry, command, debuggerApi),
          this.#readCookies(entry, command), this.#readStorage(entry, command)]);
        return { security: values[0].status === 'fulfilled' ? values[0].value : emptySecurity(),
          cookies: values[1].status === 'fulfilled' ? values[1].value : { available: false, count: null, items: [] },
          storage: values[2].status === 'fulfilled' ? values[2].value : emptyStorage(entry) };
      }), this.#readPermissions(entry)
    ]);
    this.#assertCurrent(entry);
    if (results[0].status === 'fulfilled') Object.assign(entry.state, results[0].value);
    else Object.assign(entry.state, { security: emptySecurity(), cookies: { available: false, count: null, items: [] },
      storage: emptyStorage(entry) });
    entry.state.permissions = results[1].status === 'fulfilled' ? results[1].value
      : { available: false, items: [], reason: '无法读取当前站点权限。' };
    entry.state.loading = false;
    return this.#publish(entry);
  }

  async #deleteCookie(entry, command, selected) {
    this.#assertCurrent(entry);
    await command('Network.deleteCookies', { name: selected.name, domain: selected.domain, path: selected.path,
      ...(selected.partitionKey ? { partitionKey: selected.partitionKey } : {}) });
  }

  async #changePermissions(entry, input) {
    const current = entry.state.permissions;
    if (!current.available) throw problem('站点权限当前不可用。');
    const selected = current.items.find(item => item.type === input.type && item.canModify);
    if (input.op !== 'resetPermissions' && !selected) throw problem('该站点权限不可修改。', 'UNSUPPORTED_OPERATION');
    if (input.op === 'setPermission' && (!selected.settingValues.includes(input.setting) || input.setting === 'default')) {
      throw problem('该权限值不可用。', 'INVALID_ARGUMENT');
    }
    if (input.op === 'resetPermissions' && !current.canReset) throw problem('无法重置该站点权限。', 'UNSUPPORTED_OPERATION');
    const types = input.op === 'resetPermissions' ? current.items.filter(item => item.canModify).map(item => item.type) : [selected.type];
    if (!types.length) throw problem('当前没有可重置的站点权限。', 'UNSUPPORTED_OPERATION');
    this.#assertCurrent(entry);
    const method = input.op === 'setPermission' ? 'siteSettings.set' : 'siteSettings.reset';
    const batch = input.op === 'resetPermissions';
    const setting = batch ? this.#settingInput(entry, undefined, { types })
      : this.#settingInput(entry, selected.type, input.op === 'setPermission' ? { setting: input.setting } : {});
    // The service checks this signal and document before commit. Its own
    // post-commit reload can close our window before the durable receipt arrives.
    const response = await bounded(this.permissions.settings(method, setting,
      { signal: entry.signal, trustedUserAction: true }), undefined);
    const sameSelection = value => value?.scope === 'origin'
      && value.requestingOrigin === entry.selected.origin && value.embeddingOrigin === entry.selected.origin;
    const sameTypes = batch ? Array.isArray(response?.types) && response.types.length === types.length
      && new Set(response.types).size === types.length && response.types.every(type => types.includes(type))
      && Array.isArray(response.settings) && response.settings.length === types.length
      && response.settings.every(record)
      && new Set(response.settings.map(value => value.type)).size === types.length
      && response.settings.every(value => types.includes(value.type) && sameSelection(value))
      : response?.type === selected.type;
    if (response?.accepted !== true || response.prefWriteCompleted !== true
      || response.source !== 'opencu-permission-store' || !sameSelection(response) || !sameTypes) {
      throw problem('站点权限写入尚未确认。', 'PERMISSION_WRITE_UNCONFIRMED');
    }
    entry.permissionChange = structuredClone(response);
    entry.state.permissionChange = structuredClone(response);
    entry.reloadPrompt = !response.reloadRequestedTabIds?.includes(entry.tab.id);
    return response;
  }

  #permissionReceipt(entry, response, closed) {
    return { ...structuredClone(entry.state), accepted: response.accepted,
      prefWriteCompleted: response.prefWriteCompleted, source: response.source,
      permissionChange: structuredClone(response), closed, reloadPrompt: entry.reloadPrompt };
  }

  async request(event, input) {
    const entry = [...this.#entries.values()].find(item => item.contents === event.sender);
    if (!entry || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== entry.page
      || !record(input) || Object.keys(input).some(key => !['op', 'dialogId', 'view', 'cookieId', 'type', 'setting'].includes(key))
      || input.dialogId !== entry.id && input.op !== 'read') throw problem('站点信息目标无效。', 'STALE_TARGET');
    this.#assertCurrent(entry);
    const reads = ['read', 'refresh', 'view'];
    const changes = ['removeCookie', 'clearCookies', 'clearData', 'setPermission', 'resetPermission', 'resetPermissions', 'reload', 'close'];
    if (![...reads, ...changes].includes(input.op)) throw problem('站点信息操作无效。', 'INVALID_ARGUMENT');
    if (input.op === 'read') return structuredClone(entry.state);
    if (input.op === 'view') {
      if (!VIEWS.has(input.view)) throw problem('站点信息视图无效。', 'INVALID_ARGUMENT');
      entry.state.view = input.view; return this.#publish(entry);
    }
    if (changes.includes(input.op)) this.#trustedGesture(entry);
    if (input.op === 'close') { await this.#close(entry, 'user'); return { closed: true }; }
    if (entry.operation) throw problem('站点信息操作正在进行。', 'SITE_INFO_PENDING');
    if (input.op === 'reload') {
      this.#assertCurrent(entry);
      await this.#close(entry, 'user');
      this.#assertSource(entry); entry.source.reload();
      return { accepted: true, reloading: true };
    }
    const operation = (async () => {
      if (input.op === 'refresh') return this.#loadState(entry);
      if (['removeCookie', 'clearCookies'].includes(input.op)) {
        if (!entry.state.cookies.available || input.op === 'clearCookies' && !entry.state.cookies.clearAllAvailable) {
          throw problem('当前站点 Cookie 清单尚不完整，请刷新后重试。');
        }
        const selected = input.op === 'removeCookie' ? [entry.cookies.get(input.cookieId)] : [...entry.cookies.values()];
        if (selected.some(item => !item)) throw problem('该 Cookie 已经改变。', 'STALE_TARGET');
        await this.#withDebugger(entry, async command => {
          for (const cookie of selected) await this.#deleteCookie(entry, command, cookie);
          await bounded(this.browser.browserSession.cookies.flushStore(), entry.signal);
          const after = await this.#readCookies(entry, command);
          entry.state.cookies = after;
          if (selected.some(cookie => [...entry.cookies.values()].some(item => cookieKey(item) === cookieKey(cookie)))) {
            throw problem('Cookie 已执行删除，但页面仍在写入同名 Cookie。', 'COOKIE_DELETE_UNCONFIRMED');
          }
        });
        entry.reloadPrompt = true;
      } else if (input.op === 'clearData') {
        if (typeof this.browser.browserSession.clearStorageData !== 'function') throw problem('站点数据清理不可用。');
        this.#assertCurrent(entry);
        await bounded(this.browser.browserSession.clearStorageData({ origin: entry.selected.origin, storages: [...STORES] }), entry.signal);
        this.browser.browserSession.flushStorageData();
        entry.reloadPrompt = true;
      } else {
        const response = await this.#changePermissions(entry, input);
        if (response.reloadRequestedTabIds?.includes(entry.tab.id)) {
          void this.#close(entry, 'navigation').catch(error => this.#cleanupFailures.add(error));
          return this.#permissionReceipt(entry, response, true);
        }
        try {
          this.#assertCurrent(entry);
          const state = await this.#loadState(entry);
          return { ...state, accepted: response.accepted, prefWriteCompleted: response.prefWriteCompleted,
            source: response.source, permissionChange: structuredClone(response), closed: false };
        } catch (error) {
          const closed = !!entry.closing || entry.signal.aborted
            || ['STALE_TARGET', 'CONTROL_STOPPED', 'PROVIDER_CLOSED'].includes(error?.code);
          if (closed && !entry.closing) {
            void this.#close(entry, 'control-ended').catch(failure => this.#cleanupFailures.add(failure));
          }
          return { ...this.#permissionReceipt(entry, response, closed),
            ...(!closed ? { refreshError: publicError(error) } : {}) };
        }
      }
      this.#assertCurrent(entry);
      return this.#loadState(entry);
    })();
    entry.operation = operation;
    try { return await operation; }
    finally { if (entry.operation === operation) entry.operation = null; }
  }

  async #close(entry, reason) {
    if (entry.closing) return entry.closing;
    const pending = Promise.resolve().then(async () => {
      clearInterval(entry.timer);
      entry.signal.removeEventListener('abort', entry.abort);
      for (const remove of entry.listeners.splice(0)) remove();
      entry.controller.abort(problem('站点信息窗口已关闭。', 'CONTROL_STOPPED'));
      let operationError;
      try { if (entry.operation) await bounded(Promise.allSettled([entry.operation]), undefined); }
      catch (error) { operationError = error; }
      // BrowserWindow's closed event and its WebContents destruction are
      // separate notifications. Observe both before asking Electron to destroy.
      const destruction = [destructionBarrier(entry.window, 'closed'), destructionBarrier(entry.contents, 'destroyed')];
      try {
        if (!entry.window.isDestroyed()) entry.window.destroy();
        await bounded(Promise.all(destruction.map(value => value.promise)), undefined, '站点信息窗口关闭未确认。');
      } finally { for (const barrier of destruction) barrier.remove(); }
      if (!entry.window.isDestroyed() || !entry.contents.isDestroyed()) throw problem('站点信息窗口关闭未确认。');
      if (this.#entries.get(entry.tab.id) === entry) this.#entries.delete(entry.tab.id);
      entry.cookies.clear(); entry.cookieIds.clear();
      if (entry.opened && !entry.closedEvent) {
        entry.closedEvent = true;
        this.browser.emit('page-info-dialog-closed', { tabId: entry.tab.id, dialogId: entry.id, siteUrl: entry.selected.href,
          reason: CLOSE_REASONS[reason] ?? 0, closeReason: reason, reloadPrompt: entry.reloadPrompt,
          ...(entry.permissionChange ? { permissionChange: structuredClone(entry.permissionChange) } : {}),
          provider: PROVIDER, nativeProvider: false });
      }
      await bounded(entry.isolated.clearStorageData(), undefined);
      if (operationError) throw operationError;
    });
    entry.closing = pending;
    return pending;
  }

  dispose() {
    if (this.#disposePromise) return this.#disposePromise;
    this.#disposed = true;
    this.#disposePromise = (async () => {
      const results = await Promise.allSettled([...this.#entries.values()].map(entry => this.#close(entry, 'disposed')));
      const openings = await Promise.allSettled([...this.#opening.values()]);
      this.#verifications.clear();
      if (this.#verificationInstalled) this.browser.browserSession.setCertificateVerifyProc(null);
      this.#verificationInstalled = false;
      SERVICES.delete(this);
      if (!SERVICES.size) ipcMain.removeHandler(REQUEST);
      const errors = results.filter(value => value.status === 'rejected').map(value => value.reason);
      for (const value of openings) if (value.status === 'rejected' && !['CONTROL_STOPPED', 'STALE_TARGET'].includes(value.reason?.code)) errors.push(value.reason);
      errors.push(...this.#cleanupFailures);
      this.#cleanupFailures.clear();
      if (errors.length) throw new AggregateError(errors, '站点信息服务关闭未确认。');
    })();
    return this.#disposePromise;
  }
}
