import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, safeStorage, session, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { constants, accessSync, existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { Socket } from 'node:net';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDesktopComputerUseBrowserWithFilePolicy } from '../../native/plugin-browser/file-policy.mjs';
import { PluginTabDragPreview, TAB_DRAG_PREVIEW_METHODS } from '../../native/plugin-browser/tab-drag-preview.mjs';
import { BrowserAuthPromptHost } from '../../native/plugin-browser/auth-prompt.mjs';
import { PluginBrowserAuthService } from '../../native/plugin-browser/auth-service.mjs';
import { PluginBrowserCredentialStore } from '../../native/plugin-browser/credential-store.mjs';
import { BrowserProfileImporter, EngineNativeProfileImporter } from '../../native/plugin-browser/profile-import.mjs';
import { PasswordFileImporter } from '../../native/plugin-browser/password-file-import.mjs';
import { PluginBrowserPasswordStore } from '../../native/plugin-browser/password-store.mjs';
import { PluginBrowserSiteInformation } from '../../native/plugin-browser/site-information.mjs';
import { getPluginRuntimeExecutable } from '../../scripts/prepare-plugin-runtime.mjs';
import { BROWSER_PROTOCOL, DEFAULT_TIMEOUT_MS, MAX_PENDING_REQUESTS, METHODS, createBrowserChannel,
  deferred, errorValue, fail, jsonValue, nonempty, record } from '../../native/plugin-browser/ipc.mjs';

const argument = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const suppliedDirectory = argument('--opencu-browser-directory'), suppliedRuntimeDirectory = argument('--opencu-browser-runtime');
const rendererPath = argument('--opencu-browser-renderer');
if (process.type !== 'browser' || !isAbsolute(suppliedDirectory ?? '') || !isAbsolute(suppliedRuntimeDirectory ?? '')) throw new Error('OpenCU browser requires its private native browser main runtime');
if (rendererPath !== undefined && !isAbsolute(rendererPath)) throw new Error('The trusted browser renderer path must be absolute');
process.umask(0o077);
const privateDirectory = path => {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || process.getuid && info.uid !== process.getuid()) throw new Error('The browser data directory must be a real directory owned by this user');
  accessSync(path, constants.R_OK | constants.W_OK | constants.X_OK); return realpathSync(path);
};
const directory = privateDirectory(suppliedDirectory), runtimeDirectory = privateDirectory(suppliedRuntimeDirectory);
const applicationDirectory = privateDirectory(join(directory, 'application'));
privateDirectory(join(directory, 'profile'));
// Electron grants its network sandbox access only beneath sessionData. The explicit
// persistent profile must share this private root, not sit beside the granted path.
app.setName('OpenCU Browser'); app.setPath('userData', applicationDirectory); app.setPath('sessionData', directory);
// Leave engine security and site policies at the official runtime defaults.
if (process.argv.includes('--opencu-test-keychain')) {
  if (process.platform !== 'darwin') throw new Error('The isolated mock keychain option is only supported on macOS');
  app.commandLine.appendSwitch('use-mock-keychain');
}

const processInstanceId = randomUUID(), initialize = deferred(), pending = new Map(), writes = new Set();
const detachedWindows = new Map(), chromeChannel = 'opencu:browser-detached';
let epoch, nonce, hostUrl, sourceWindow, browser, filePolicy, history, downloads, preferences, dragPreviews, authPrompts, authService, credentialStore, passwordStore, siteInformation, profileImporter, nativeProfileImporter, passwordFileImporter, releasing, quitting = false, failure;
const stream = new Socket({ fd: 3, readable: true, writable: true });
const validHostUrl = value => {
  if (value === null) return undefined;
  if (typeof value !== 'string' || !URL.canParse(value)) throw fail('Invalid trusted Host origin', 'INVALID_HOST_URL');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || value !== url.origin) throw fail('Invalid trusted Host origin', 'INVALID_HOST_URL');
  return value;
};
const send = message => {
  const work = channel.send({ ...message, epoch }); writes.add(work);
  void work.then(() => writes.delete(work), error => { writes.delete(work); channelLost(error); }); return work;
};
const channelLost = error => {
  if (failure) return;
  failure = error instanceof Error ? error : new Error(String(error)); initialize.reject(failure);
  void shutdown(undefined, true);
};
const channel = createBrowserChannel(stream, message => {
  if (epoch === undefined) {
    if (message.type !== 'initialize' || message.protocol !== BROWSER_PROTOCOL || !nonempty(message.epoch) || !nonempty(message.nonce)) throw fail('Invalid private browser initialization', 'INVALID_MESSAGE');
    hostUrl = validHostUrl(message.hostUrl); epoch = message.epoch; nonce = message.nonce; initialize.resolve(); return;
  }
  if (message.epoch !== epoch) throw fail('The browser generation changed', 'HOST_GENERATION_CHANGED');
  if (message.type === 'release') {
    if (!nonempty(message.requestId)) throw fail('Invalid browser release identity', 'INVALID_MESSAGE');
    void shutdown(message.requestId); return;
  }
  if (message.type === 'cancel') {
    if (!nonempty(message.requestId)) throw fail('Invalid browser cancellation', 'INVALID_MESSAGE');
    pending.get(message.requestId)?.controller.abort(fail('The parent cancelled this browser request', 'ABORTED')); return;
  }
  if (message.type !== 'request' || !nonempty(message.requestId) || !METHODS.has(message.method) || !record(message.params)
    || typeof message.trustedUserAction !== 'boolean' || typeof message.trustedAgentLifecycle !== 'boolean') throw fail('Invalid private browser request', 'INVALID_MESSAGE');
  if (message.method.startsWith('browser.authBroker.') && message.trustedBrowserAuth !== true) throw fail('Invalid private sign-in caller', 'INVALID_MESSAGE');
  hostUrl = validHostUrl(message.hostUrl);
  if (!browser || quitting || releasing && !['passwordFileImport.cancel', 'nativeProfileImport.cancel', 'profileImport.cancelSelection'].includes(message.method)
    && !(message.method === 'fileUpload.resolve' && message.params.decision === 'denied')) {
    void send({ type: 'response', requestId: message.requestId, ok: false, error: errorValue(fail('The browser is closing or not ready', 'PROVIDER_CLOSED')) }); return;
  }
  if (pending.has(message.requestId) || pending.size >= MAX_PENDING_REQUESTS) {
    void send({ type: 'response', requestId: message.requestId, ok: false, error: errorValue(fail('Browser request capacity reached', 'BUSY')) }); return;
  }
  const request = { controller: new AbortController(), task: undefined }; pending.set(message.requestId, request);
  request.task = Promise.resolve().then(() => message.method.startsWith('browser.authBroker.')
    ? authService.handle(message.method, message.params, { signal: request.controller.signal })
    : message.method.startsWith('profileImport.')
    ? profileImporter.handle(message.method, message.params, {signal:request.controller.signal,trustedUserAction:message.trustedUserAction})
    : message.method.startsWith('nativeProfileImport.')
    ? nativeProfileImporter.handle(message.method, message.params, {signal:request.controller.signal,trustedUserAction:message.trustedUserAction})
    : message.method.startsWith('passwordFileImport.')
    ? passwordFileImporter.handle(message.method, message.params, {signal:request.controller.signal,trustedUserAction:message.trustedUserAction})
    : message.method === 'fileUpload.resolve'
    ? filePolicy.handle(message.method, message.params, { signal: request.controller.signal })
    : TAB_DRAG_PREVIEW_METHODS.has(message.method)
      ? dragPreviews.handle(message.method, message.params, { signal: request.controller.signal, trustedUserAction: message.trustedUserAction })
    : browser.handle(message.method, message.params, { signal: request.controller.signal,
      trustedUserAction: message.trustedUserAction, trustedAgentLifecycle: message.trustedAgentLifecycle }))
    .then(result => {
      if (!jsonValue(result)) throw fail('Browser returned non-finite JSON', 'INVALID_RESULT');
      if (message.method === 'profileImport.import' && result.status === 'imported' && result.importedVisits > 0) {
        browser.emit('history-changed', { reason: 'profile-import', result });
      }
      if (message.method === 'nativeProfileImport.import') {
        browser.emit('history-changed', { reason: 'native-profile-import-finished' });
      }
      return send({ type: 'response', requestId: message.requestId, ok: true, result });
    }).catch(error => send({ type: 'response', requestId: message.requestId, ok: false, error: errorValue(error) }))
    .finally(() => pending.delete(message.requestId));
  void request.task.catch(channelLost);
}, channelLost);

function getWindow() {
  if (sourceWindow && !sourceWindow.isDestroyed()) return sourceWindow;
  sourceWindow = new BrowserWindow({ width: 1280, height: 800, show: false, title: 'OpenCU Browser',
    webPreferences: { session: session.fromPartition(`opencu-browser-shell-${epoch}`), sandbox: true,
      contextIsolation: true, nodeIntegration: false, webviewTag: false, devTools: false } });
  const window = sourceWindow;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); browser?.hideSourceWindow(window); } });
  window.on('resize', () => browser?.resizeSourceWindow(window));
  window.once('closed', () => { if (sourceWindow === window) sourceWindow = undefined; });
  const active = () => browser?.listOwnedTabs().find(tab => tab.visible && tab.mounted === window);
  const invoke = work => { void Promise.resolve().then(work).catch(error => console.error('OpenCU browser menu:', error.message)); };
  window.setMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => invoke(async () => {
      const creationId = randomUUID();
      const created = await browser.handle('tabs.create', { creationId }, { trustedUserAction: true });
      await browser.handle('tabs.commitCreate', { creationId }); browser.showOwnedTab(browser.tab(created.id));
    }) }, { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => invoke(() => { const tab = active(); return tab && browser.closeTab(tab); }) }] },
    { label: 'Navigate', submenu: [{ label: 'Back', accelerator: 'Alt+Left', click: () => { const tab = active(); if (tab?.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack(); } },
      { label: 'Forward', accelerator: 'Alt+Right', click: () => { const tab = active(); if (tab?.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward(); } },
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => active()?.view.webContents.reload() }] },
    { role: 'editMenu' }, { role: 'windowMenu' },
  ]));
  return window;
}

async function createDetachedWindow(tab, identity) {
  if (!rendererPath || !existsSync(rendererPath)) throw fail('The packaged browser chrome has not been built', 'BROWSER_CHROME_UNAVAILABLE');
  const prepared = deferred(), window = new BrowserWindow({ width: 1000, height: 760, show: false,
    frame: false, title: tab.view.webContents.getTitle() || 'OpenCU Browser',
    webPreferences: { session: session.fromPartition(`opencu-browser-shell-${epoch}`), sandbox: true, contextIsolation: true,
      nodeIntegration: false, webviewTag: false, devTools: false,
      preload: fileURLToPath(new URL('../../native/plugin-browser/detached-preload.cjs', import.meta.url)) } });
  const entry = { window, tab, identity, prepared, rendererUrl: pathToFileURL(rendererPath).href };
  const chromeId = window.webContents.id;
  identity.window = window;
  detachedWindows.set(window.webContents.id, entry);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => {
    if (!quitting && tab.detached?.window === window && ['detached', 'preparing-restore'].includes(tab.detached.phase)) {
      event.preventDefault();
      if (tab.detached.phase === 'detached') void browser.restoreDetached(tab, identity.id).catch(error => console.error('OpenCU detached close:', error.message));
    }
  });
  window.once('closed', () => { detachedWindows.delete(chromeId); prepared.reject(fail('Browser chrome closed before presentation', 'PRESENTATION_CLOSED')); });
  try { await window.loadFile(rendererPath); return { window, prepared: prepared.promise }; }
  catch (error) { detachedWindows.delete(chromeId); if (!window.isDestroyed()) window.destroy(); throw error; }
}

ipcMain.handle(chromeChannel, async (event, message) => {
  const entry = detachedWindows.get(event.sender.id);
  if (!entry || entry.window.isDestroyed() || event.sender !== entry.window.webContents
    || event.senderFrame !== event.sender.mainFrame || event.sender.getURL() !== entry.rendererUrl
    || !record(message) || !jsonValue(message)) throw fail('Unknown browser chrome caller', 'INVALID_CALLER');
  const { tab, identity, window } = entry;
  if (message.method === 'getContentKind') return 'browser';
  if (message.method === 'getRequest') return browser.detachedRequest(tab, identity.id);
  if (message.method === 'setContentBounds') {
    const accepted = browser.setDetachedContentBounds(tab, identity.id, message.bounds, window.webContents.getZoomFactor());
    if (accepted) entry.prepared.resolve(); return accepted;
  }
  if (message.method === 'focusSource') return browser.focusDetachedSource(tab, identity.id);
  if (message.method === 'setAlwaysOnTop') return browser.setDetachedAlwaysOnTop(tab, identity.id, message.value);
  if (message.method === 'restore') return browser.restoreDetached(tab, identity.id);
  if (message.method === 'recordTitleBarAction' && ['focus_source', 'pin', 'unpin', 'restore'].includes(message.kind)) return null;
  throw fail('Unsupported browser chrome method', 'INVALID_METHOD');
});

async function shutdown(requestId, lost = false) {
  if (releasing) {
    if (requestId) { try { await releasing; if (!channel.closed) await send({ type: 'released', requestId, released: true,
      providerClosed: true, allTabsDestroyed: true, fileCopiesRemoved: true, pendingSettled: true }); }
      catch (error) { if (!channel.closed) await send({ type: 'release-failed', requestId, error: errorValue(error) }); } }
    return;
  }
  const task = (async () => {
    filePolicy?.beginDispose();
    for (const request of pending.values()) request.controller.abort(fail('The plugin browser is releasing', 'PROVIDER_CLOSED'));
    await profileImporter?.dispose();
    await nativeProfileImporter?.dispose();
    await passwordFileImporter?.dispose();
    await authService?.dispose(); await authPrompts?.dispose(); await credentialStore?.dispose();
    await passwordStore?.dispose(); await siteInformation?.dispose();
    await dragPreviews?.dispose();
    await browser?.dispose(); await filePolicy?.dispose();
    await Promise.allSettled([...pending.values()].map(request => request.task));
    await preferences?.dispose(); await downloads?.dispose(); await history?.close();
    await Promise.all([...writes]);
    quitting = true;
    for (const entry of detachedWindows.values()) if (!entry.window.isDestroyed()) entry.window.destroy();
    detachedWindows.clear(); if (sourceWindow && !sourceWindow.isDestroyed()) sourceWindow.destroy();
    if (requestId && !channel.closed) await send({ type: 'released', requestId, released: true, providerClosed: true,
      allTabsDestroyed: true, fileCopiesRemoved: true, pendingSettled: true });
    app.quit();
  })();
  releasing = task;
  try { await task; } catch (error) {
    releasing = undefined;
    if (requestId && !channel.closed) { try { await send({ type: 'release-failed', requestId, error: errorValue(error) }); } catch {} }
    if (lost || channel.closed) { quitting = true; app.exit(1); }
  }
}
app.on('before-quit', event => { if (!quitting) { event.preventDefault(); void shutdown(undefined, true); } });
app.on('window-all-closed', () => {});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { void shutdown(undefined, true); });
process.on('uncaughtException', channelLost); process.on('unhandledRejection', channelLost);

void (async () => {
  let timer;
  try {
    await Promise.race([initialize.promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(fail('Browser parent did not initialize its socket', 'TIMEOUT')), DEFAULT_TIMEOUT_MS);
    })]);
    await app.whenReady();
    if (failure || quitting) throw failure ?? fail('Browser closed before startup', 'PROVIDER_CLOSED');
    const runtimeExecutable = await getPluginRuntimeExecutable();
    if (realpathSync(process.execPath) !== realpathSync(runtimeExecutable)) throw fail('The browser process is not using its installed runtime', 'BROWSER_RUNTIME_MISMATCH');
    const onEvent = (event, params) => { void send({ type: 'event', event, params }).catch(channelLost); };
    const created = createDesktopComputerUseBrowserWithFilePolicy({ fileStorageDirectory: join(runtimeDirectory, 'uploads'),
      browser: { storageDirectory: join(directory, 'profile'), downloadDirectory: join(directory, 'downloads'),
        permissionStorageDirectory: join(directory, 'permissions'),
        processInstanceId, hostUrl: () => hostUrl, getWindow, createDetachedWindow,
        testKeychain: process.argv.includes('--opencu-test-keychain'),
        getLocale: () => app.getLocale(),
        getDirection: () => new Intl.Locale(app.getLocale()).textInfo?.direction ?? (/^(ar|fa|he|ur)(-|$)/u.test(app.getLocale()) ? 'rtl' : 'ltr'),
        getAppearance: () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
        detachedRendererReady: rendererPath !== undefined && existsSync(rendererPath), onEvent,
        publishDetachedChrome: tab => { const detached = tab.detached;
          if (detached && !detached.window.isDestroyed()) detached.window.webContents.send('opencu:browser-detached-state', browser.detachedRequest(tab, detached.id)); } } });
    browser = created.browser; filePolicy = created.filePolicy;
    await browser.nativeProfile.initialize();
    if (browser.nativeProfile.install() === false) throw fail('The browser permission service did not initialize', 'PERMISSIONS_UNAVAILABLE');
    browser.permissionHandlerInstalled = true;
    siteInformation = new PluginBrowserSiteInformation({ browser, permissions: browser.nativeProfile });
    browser.options.siteInformation = siteInformation;
    const History = (await import('../../native/plugin-browser/history.mjs')).BrowserHistory;
    history = new History({ path: join(directory, 'history', 'History.sqlite') });
    await history.ready(); browser.options.history = history;
    try{
      credentialStore=new PluginBrowserCredentialStore({directory:join(directory,'credentials'),safeStorage});
      await credentialStore.initialize();
    }catch{
      try{await credentialStore?.dispose();}catch{}
      credentialStore=undefined;
    }
    passwordStore = new PluginBrowserPasswordStore({ directory: join(directory, 'passwords'), safeStorage });
    try { await passwordStore.initialize(); }
    catch {
      await passwordStore.dispose(); passwordStore = undefined;
    }
    authPrompts = new BrowserAuthPromptHost(); authService = new PluginBrowserAuthService({ browser, prompts: authPrompts, credentialStore, passwordStore });
    nativeProfileImporter = new EngineNativeProfileImporter({ browserSession: browser.browserSession,
      history, passwordStore, storageDirectory: join(runtimeDirectory, 'profile-import'),
      chooseSource: async ({ signal, kind = 'directory' } = {}) => {
        signal?.throwIfAborted();
        const result = await dialog.showOpenDialog(getWindow(), { properties: [kind === 'directory' ? 'openDirectory' : 'openFile'] });
        signal?.throwIfAborted(); return result;
      } });
    browser.options.nativeProfileImporter = nativeProfileImporter;
    passwordFileImporter = new PasswordFileImporter({ passwordStore,
      chooseSource: async ({ signal } = {}) => {
        signal?.throwIfAborted();
        const result = await dialog.showOpenDialog(getWindow(), { properties: ['openFile'],
          filters: [{ name: '密码文件', extensions: ['csv'] }] });
        signal?.throwIfAborted(); return result;
      } });
    profileImporter=new BrowserProfileImporter({history,runHistoryJob:work=>browser.historyJob(work),
      chooseSource:async({signal,kind}={})=>{
        signal?.throwIfAborted();
        if (!['file', 'directory'].includes(kind)) throw fail('Choose a history file or directory', 'INVALID_ARGUMENT');
        const result=await dialog.showOpenDialog(getWindow(),{title:'导入浏览历史',buttonLabel:'选择',
          properties:kind==='directory'?['openDirectory']:['openFile'],
          filters:[{name:'浏览器历史',extensions:['json','sqlite','db','*']}]});
        signal?.throwIfAborted();return result;
      }});
    dragPreviews = new PluginTabDragPreview({ getOwnedContents: id => browser.getOwnedContents(id), getOwnedTab: id => browser.tab(id),
      captureOwnedContents: (id, options) => browser.captureTabPreview(id, options) });
    const Downloads = (await import('../../native/plugin-browser/downloads.mjs')).PluginBrowserDownloads;
    downloads = new Downloads({ storageDirectory: join(directory, 'downloads-state'), downloadDirectory: join(directory, 'downloads'), browserSession: browser.browserSession,
      onEvent, shell });
    browser.options.downloadStore = downloads; await downloads.initialize();
    const Preferences = (await import('../../native/plugin-browser/preferences.mjs')).PluginBrowserPreferences;
    preferences = new Preferences({ storageDirectory: join(directory, 'preferences'), browserSession: browser.browserSession,
      app, dialog, getDialogParent: getWindow, history, downloadStore: downloads, permissionStore: browser.nativeProfile,
      linkOpeningConsumer: { installed: true, scope: 'opencu-owned-chat' },
      onChange: snapshot => onEvent('preferences-changed', snapshot) });
    await preferences.initialize(); browser.options.preferences = preferences;
    downloads.options.getDownloadDirectory = () => preferences.getDownloadDirectory();
    ipcMain.on('opencu:browser-detached-state-request', event => {
      const entry = detachedWindows.get(event.sender.id);
      if (entry && event.senderFrame === event.sender.mainFrame && event.sender.getURL() === entry.rendererUrl)
        event.sender.send('opencu:browser-detached-state', browser.detachedRequest(entry.tab, entry.identity.id));
    });
    await send({ type: 'ready', protocol: BROWSER_PROTOCOL, nonce, pid: process.pid, info: await browser.handle('browser.info', {}) });
  } catch (error) {
    if (epoch && !channel.closed) { try { await send({ type: 'failure', error: errorValue(error) }); } catch {} }
    await shutdown(undefined, true);
  } finally { clearTimeout(timer); }
})();
