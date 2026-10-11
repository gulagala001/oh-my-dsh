import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BrowserHost, browserExecutablePath, BROWSER_STARTUP_TIMEOUT_MS } from './browser.mjs';
import { NativeHost } from './native.mjs';
import { WindowsNativeHost, windowsBridgeActive } from './windows-native.mjs';
import { NativeViews } from './native-view.mjs';
import { ComputerRuntime } from './runtime.mjs';
import { BrowserViews } from './browser-view.mjs';
import { addressToUrl } from './navigation.mjs';
import { ExtensionHub, extensionSocketPath } from './extension-hub.mjs';
import { ExtensionBrowser } from './extension-browser.mjs';
import { pluginCapabilities, pluginCapabilityError, unavailablePluginCapability } from './plugin-capabilities.mjs';
import { ExtensionInstaller } from './extension-install.mjs';
import { mapImagePoints, imageFrameFor } from './image-coordinates.mjs';
import { captureAnnotation } from './browser-annotation.mjs';
import { previewElementStyle, restoreStylePreview, styleChanges } from './browser-style-preview.mjs';
import { restoreAnnotationLiveEditor } from './annotation-live-editor.mjs';
import { SiteAnnotationSettings } from './site-annotation-settings.mjs';
import {AnnotationSiteCoordinator} from './annotation-site-coordinator.mjs';
import {clearSiteAnnotationFeaturePreview} from './site-annotation-features.mjs';
import {findInView} from './browser-find.mjs';
import {externalWebUrl,openExternalUrl} from './open-external.mjs';
import {BrowserHistory} from './browser-history.mjs';
import { installBrowser } from './browser-install.mjs';
import { normalizeBrowserUrl, parseTabMention, selectBrowserForUrl, selectTabReference } from './browser-selection.mjs';
import { BrowserManagement } from './browser-management.mjs';
import { DesktopNativePresentations } from './desktop-presentations.mjs';
import { browserProfileAction } from './browser-profile-ui.mjs';
import { DesktopBrowserHub } from './desktop-browser-hub.mjs';
import { createPluginBrowserFileProvider } from './browser-file-provider.mjs';
import { PluginTabDragPreviewActions } from './plugin-tab-drag-preview.mjs';
import { nativeBrowserAction as ownedBrowserAction, nativeBrowserEvent } from './desktop-browser-native.mjs';
import { getPluginRuntimeExecutable, preparePluginRuntime } from '../../scripts/prepare-plugin-runtime.mjs';
import { PluginBrowserAuthProvider } from './plugin-browser-auth.mjs';
import { createBrowserProfile } from './browser-profile.mjs';
import { openCodexOwnedChatBrowserLink } from './browser-link-preferences.mjs';
import { readBrowserTabInventory } from './browser-tab-inventory.mjs';

export class ComputerUseManager {
  constructor(directory, options = {}) {
    mkdirSync(directory, { recursive: true, mode: 0o700 }); this.directory = directory;
    this.openExternal=options.openExternal??openExternalUrl;
    this.preferredExtensionInstanceId = options.preferredExtensionInstanceId;
    this.browsingHistory=new BrowserHistory(join(directory,'browser-history.json'));
    this.siteAnnotationSettings=new SiteAnnotationSettings(join(directory,'site-annotation-settings.json'));
    this.browserAuth = new PluginBrowserAuthProvider(this);
    const callbacks = { capabilities: { ...options.capabilities, browserAuth: options.capabilities?.browserAuth ?? this.browserAuth }, getSessionTitle: options.getSessionTitle, onVisit:visit=>this.browsingHistory.remember(visit), wantsPointer: (id, tabId) => !!this.pointerActive(id, tabId), onPointer: event => this.pointer(event), onTabClosed: tabId => {
      for (const state of this.sessions.values()) { state.previewTargets?.delete(tabId); if (state.target?.kind === 'tab' && state.target.id === tabId) {
        this.setTarget(state, null); this.preview.delete(state.id);
      }}
    }, onBrowserLost: (tabs, error, runId) => {
      const lost = new Set(tabs);
      for (const state of this.sessions.values()) {
        for (const id of lost) { state.userTabs.delete(id); state.closingTabs.delete(id); state.previewTargets?.delete(id); }
        if (state.browserRun !== runId || state.target?.kind === 'app') continue;
        // A graceful browser quit closes pages before the process exits. The
        // connection identity still identifies the affected pane after its
        // final tab-close event has already cleared the selected target.
        state.browserError = { operation: 'browser', code: error.code, message: error.message, at: Date.now() };
        state.controlEpoch++; state.manualActor = null;
        state.uiAction?.abort(error);
        this.setTarget(state, null); this.publishControl(state);
      }
    }, onControlLost: (tabId, error) => {
      for (const state of this.sessions.values()) if (state.target?.id === tabId) {
        state.stopped = true; state.controlEpoch++; state.browserError = { operation: 'browser', code: error.code, message: error.message, at: Date.now() };
        state.uiAction?.abort(error);
        void state.runtime.stop(error).catch(cleanup => { state.stopError = { operation: 'stop', message: cleanup.message, at: Date.now() }; });
        this.publishControl(state);
      }
    } };
    this.browser = new BrowserHost(join(directory, 'browser-profile'), { ...options.browser, ...callbacks, filePolicy: options.filePolicy });
    this.browser.authObservation = this.browserAuth;
    this.browserViews = new BrowserViews(this.browser);
    this.browserViews.siteAnnotationSettings=this.siteAnnotationSettings;
    const windowsBridge = !!options.native?.binary && windowsBridgeActive(options.native);
    this.native = (options.native?.platform ?? process.platform) === 'win32' || windowsBridge ? new WindowsNativeHost(directory, options.native) : new NativeHost(directory, options.native);
    this.nativeViews = new NativeViews(this.native);
    this.sessions = new Map(); this.preview = new Map(); this.sharing = new Map(); this.closed = false; this.enabled = options.enabled !== false;
    this.siteAnnotationRequests=new AnnotationSiteCoordinator(this);
    this.tabDragPreviews = new PluginTabDragPreviewActions(this);
    this.extensionBrowsers = new Map(); this.extensionViews = new Map(); this.retiredExtensions = new Set();
    this.extensionInstaller = new ExtensionInstaller(directory, options.extensionHub?.socketPath ?? extensionSocketPath(directory), options.extension);
    this.extensionHub = options.extensionHub ?? new ExtensionHub(this.extensionInstaller.socketPath, { windowsRuntime: this.extensionInstaller.windows });
    this.ownsExtensionHub = !options.extensionHub;
    this.connectBrowser = (hub, info) => {
      const previous = this.extensionBrowsers.get(info.id);
      if (previous?.hub === hub && previous.info.epoch === info.epoch) return;
      const instanceId = info.extensionInstanceId ?? info.metadata?.extensionInstanceId;
      const sameProfile = typeof instanceId === 'string' && instanceId.length > 0 && instanceId === (previous?.info.extensionInstanceId ?? previous?.info.metadata?.extensionInstanceId);
      const browser = new ExtensionBrowser(hub, info, { ...callbacks, filePolicy: options.filePolicy,
        onSessionUse: id => { if (this.pluginBrowserBinding?.hub === hub) this.pluginBrowserBinding.participants.add(id); },
        getAgentActivity: id => {
          const state = this.sessions.get(id);
          return this.browserAgentActive(state);
        },
        ...(sameProfile ? { clipboardPages: previous.clipboardPages } : {}) });
      browser.authObservation = this.browserAuth;
      if (this.pluginBrowserBinding?.hub === hub && this.pluginBrowserBinding.fileAdapter) {
        browser.capabilityProviders.downloadMedia = { ...browser.capabilityProviders.downloadMedia,
          ...createPluginBrowserFileProvider(browser, { filePolicy: this.filePolicy, adapter: this.pluginBrowserBinding.fileAdapter }) };
      }
      if (previous) { this.retiredExtensions.add(previous); void previous.close().catch(() => {}); }
      this.extensionBrowsers.set(info.id, browser);
    };
    this.extensionConnected = info => this.connectBrowser(this.extensionHub, info);
    this.extensionHub.on('connected', this.extensionConnected);
    this.extensionReady = (this.ownsExtensionHub ? this.extensionHub.start() : Promise.resolve()).then(() => { for (const info of this.extensionHub.list()) this.extensionConnected(info); }).catch(error => { this.extensionError = error.message; });
    this.filePolicy = options.filePolicy;
    this.presentationProviderFactory = options.presentationProviderFactory;
    this.pluginBrowserEnabled = options.pluginBrowser !== false;
    this.pluginBrowserProviderFactory = options.pluginBrowserProviderFactory;
    this.getHostUrl = options.getHostUrl;
  }
  async ensurePluginBrowser({ required = true } = {}) {
    if (!this.pluginBrowserEnabled) return this.browser;
    if (this.closed || !this.enabled) throw new Error('Computer Use is disabled');
    const current = this.extensionBrowsers.get('desktop-browser');
    if (current && !current.run.lost && !current.closing) return current;
    if (!this.pluginBrowserStarting) {
      const pending = (async () => {
        if (this.pluginBrowserBinding) {
          const old = this.pluginBrowserBinding, browser = this.extensionBrowsers.get('desktop-browser');
          await this.tabDragPreviews.dispose();
          await old.provider.close();
          if (browser?.hub === old.hub) {
            await this.extensionViews.get(browser)?.close();
            await browser.close(); this.extensionBrowsers.delete(browser.id); this.extensionViews.delete(browser);
          }
          await old.hub.close(); this.pluginBrowserBinding = null;
          this.tabDragPreviews = new PluginTabDragPreviewActions(this);
          if (this.closed || !this.enabled) throw new Error('Computer Use is disabled');
        }
        const parameters = { directory: join(this.directory, 'plugin-browser'), getHostUrl: this.getHostUrl };
        const provider = this.pluginBrowserProviderFactory ? await this.pluginBrowserProviderFactory(parameters)
          : new (await import('./plugin-browser-provider.mjs')).PluginBrowserProvider(parameters);
        const hub = new DesktopBrowserHub(provider);
        const binding = { provider, service: provider, hub, participants: new Set() };
        this.pluginBrowserBinding = binding;
        if (this.filePolicy) {
          const { PluginBrowserFileAdapter } = await import('./plugin-browser-file-adapter.mjs');
          binding.fileAdapter = new PluginBrowserFileAdapter(provider, { filePolicy: this.filePolicy }).start();
        }
        hub.on('event', event => nativeBrowserEvent(this, binding, event));
        await provider.start();
        if (this.closed || !this.enabled) throw new Error('Computer Use is disabled');
        await hub.start();
        for (const info of hub.list()) this.connectBrowser(hub, info);
        this.pluginBrowserError = null;
        return this.extensionBrowsers.get('desktop-browser');
      })();
      this.pluginBrowserStarting = pending;
      void pending.catch(error => { this.pluginBrowserError = error; }).finally(() => {
        if (this.pluginBrowserStarting === pending) this.pluginBrowserStarting = null;
      });
    }
    try { return await this.pluginBrowserStarting; }
    catch (error) { if (required) throw error; return null; }
  }
  async nativePresentations() {
    if (this.closed || !this.enabled) throw new Error('Computer Use is disabled');
    const platform=this.native.platform??process.platform;
    if (!['darwin','win32'].includes(platform)) throw Object.assign(new Error('Native presentations are not available on this platform'), { code: 'NATIVE_PRESENTATION_UNAVAILABLE' });
    if (this.presentationClosing) await this.presentationClosing;
    if (this.presentationStarting) return this.presentationStarting;
    const pending = (async () => {
      if (!this.presentationBinding) {
        const provider = this.presentationProviderFactory
          ? await this.presentationProviderFactory({ directory: join(this.directory, 'native-presentations') })
          : platform==='win32'
            ? new (await import('./windows-native-presentations.mjs')).WindowsNativePresentationProvider({native:this.native})
            : new (await import('./plugin-native-presentations-provider.mjs')).PluginNativePresentationsProvider({ directory: join(this.directory, 'native-presentations') });
        const changed = threadID => {
          for (const state of this.sessions.values()) if (threadID === undefined || state.id === threadID) this.publishControl(state);
        };
        const presentations = new DesktopNativePresentations({ service: provider, native: this.native, nativeViews: this.nativeViews,
          onChanged: changed, onError: (error, threadID) => {
            const value = { code: error.code ?? 'NATIVE_PRESENTATION_ERROR', message: error.message, at: Date.now() };
            if (threadID && this.sessions.has(threadID)) this.sessions.get(threadID).nativePresentationError = value;
            else this.nativePresentationError = value;
            changed(threadID);
          }, onReveal: async (threadID, target) => {
            if (this.closed || !this.enabled || !this.sessions.get(threadID)?.previewTargets.has(target.viewId)) throw new Error('The native preview is no longer available');
            await this.native.revealWindow(target);
          } });
        this.presentationBinding = { provider, presentations };
      }
      const binding = this.presentationBinding;
      await binding.provider.start();
      if (this.closed || !this.enabled) throw new Error('Computer Use is disabled');
      await binding.presentations.start();
      this.nativePresentationError = null;
      return binding.presentations;
    })();
    this.presentationStarting = pending;
    try { return await pending; }
    finally { if (this.presentationStarting === pending) this.presentationStarting = null; }
  }
  ensureNativePresentation(state) {
    if (!state.currentTurnID || state.turnEnded || state.stopped || state.runtime.stopping || !state.nativeTarget || this.closed || !this.enabled) return;
    const turnID = state.currentTurnID, target = { ...state.nativeTarget };
    const current = () => !this.closed && this.enabled && !state.stopped && !state.turnEnded && !state.runtime.stopping
      && state.currentTurnID === turnID && state.nativeTarget?.viewId === target.viewId;
    const pending = (async () => {
      const presentationTarget = this.native.presentationTarget ? await this.native.presentationTarget(state.id, turnID, target) : target;
      if (!presentationTarget || !current()) return;
      const presentations = await this.nativePresentations();
      if (!current()) return;
      await presentations.ensureTarget(state.id, turnID, presentationTarget);
      if (!current()) return;
      state.nativePresentationError = null;
      this.publishControl(state);
    })();
    state.nativePresentationPending ??= new Set(); state.nativePresentationPending.add(pending);
    void pending.catch(error => {
      if (!current()) return;
      state.nativePresentationError = { code: error.code ?? 'NATIVE_PRESENTATION_ERROR', message: error.message, at: Date.now() };
      this.publishControl(state);
    }).finally(() => state.nativePresentationPending.delete(pending));
  }
  async closeNativePresentations() {
    if (this.presentationClosing) return this.presentationClosing;
    const pending = (async () => {
      await this.presentationStarting?.catch(() => {});
      await Promise.allSettled([...this.sessions.values()].flatMap(state => [...(state.nativePresentationPending ?? [])]));
      const binding = this.presentationBinding;
      if (!binding) return;
      await binding.presentations.close();
      await binding.provider.close();
      if (this.presentationBinding === binding) this.presentationBinding = null;
    })();
    this.presentationClosing = pending;
    try { await pending; }
    finally { if (this.presentationClosing === pending) this.presentationClosing = null; }
  }
  async setEnabled(enabled) {
    const changed = this.enabled !== enabled; this.enabled = enabled;
    if (enabled || !changed) {
      if (this.disabling) await this.disabling;
      if (enabled && this.tabDragPreviews.closed) {
        await this.tabDragPreviews.dispose();
        this.tabDragPreviews = new PluginTabDragPreviewActions(this);
      }
      if (enabled) for (const state of this.sessions.values()) this.ensureNativePresentation(state);
      return;
    }
    const pending = Promise.allSettled([this.stopSharing(), this.tabDragPreviews.dispose(), ...[...this.sessions.values()].map(async state => {
      state.controlEpoch++;
      this.publishControl(state);
      state.uiAction?.abort(new Error('Computer Use disabled in settings'));
      try { await state.runtime.stop(new Error('Computer Use disabled in settings')); await state.uiActionPending?.catch(() => {}); state.status = state.stopped ? 'stopped' : 'idle'; }
      catch (error) { state.status = 'error'; state.stopError = { operation: 'disable', message: error.message, at: Date.now() }; throw error; }
    }), this.closeNativePresentations()]).then(results => {
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason);
      if (errors.length) throw new AggregateError(errors, 'Computer Use disable cleanup failed: ' + errors.map(e => e.message).join('; '));
    });
    this.disabling = pending;
    try { await pending; } finally { await Promise.all([this.nativeViews.close(),this.browserViews.close(), ...[...this.extensionViews.values()].map(views => views.close())]); if (this.disabling === pending) this.disabling = null; }
  }
  session(id) {
    if (this.closed) throw new Error('Computer Use plugin is disabled.');
    if (!this.sessions.has(id)) {
      const state = { id, status: 'idle', target: null, previewTargets: new Map(), history: [], stopped: false, queues: new Map(), viewers: new Map(), userTabs: new Set(), closingTabs: new Map(), controlEpoch: 0, navigationRevision: 0, navigationIntents: new Map() };
      state.operationStats = { total: 0, succeeded: 0, failed: 0, cancelled: 0, methods: Object.create(null) };
      state.runtime = new ComputerRuntime((method, args, signal, frames) => this.dispatch(id, method, args, signal, frames), {
        nativePlatform: this.native.platform ?? process.platform,
        onStop: async () => {
          const results = await Promise.allSettled([...this.browsers().map(async browser => {
            try { if (!this.closed && !browser.run?.lost && !browser.closing) await browser.setAgentActivity?.(id, false); }
            finally { await browser.disconnect(id); }
          }), this.native.release(id)]);
          const failures = results.filter(r => r.status === 'rejected').map(r => r.reason);
          if (failures.length){
            const error=new AggregateError(failures,'Stop cleanup failed: '+failures.map(e=>e.message).join('; '));
            state.stopped=true;state.status='error';state.stopError={operation:'stop',message:error.message,at:Date.now()};this.publishControl(state);throw error;
          }
        },
      });
      this.sessions.set(id, state);
    }
    return this.sessions.get(id);
  }
  async readWindowShare(window, signal) {
    if (this.closed || !this.enabled) throw new Error('Computer Use 已关闭');
    if (this.screenLockSetup) throw new Error('Desktop system configuration is in progress');
    const controller = new AbortController(), combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    combined.throwIfAborted();
    const pending = Promise.resolve().then(() => { combined.throwIfAborted(); return window ? this.native.shareWindow(window, combined) : this.native.shareWindows(combined); });
    this.sharing.set(controller, pending);
    try { return await pending; } finally { this.sharing.delete(controller); }
  }
  async stopSharing() {
    const active = [...this.sharing];
    for (const [controller] of active) controller.abort(new Error('窗口分享已取消'));
    await Promise.allSettled(active.map(([, pending]) => pending));
    await this.native.releaseShares();
  }
  browsers() { return [...(this.pluginBrowserEnabled ? [] : [this.browser]), ...this.extensionBrowsers.values()]; }
  browserFor(value) {
    if (!value || value === 'iab' || value === 'browser') {
      if (!this.pluginBrowserEnabled) return this.browser;
      const browser = this.extensionBrowsers.get('desktop-browser');
      if (!browser || browser.run.lost || browser.closing) throw this.pluginBrowserError ?? new Error('The OpenCU browser has not connected');
      return browser;
    }
    let browser = this.extensionBrowsers.get(value);
    if (!browser && /^(chrome|edge)$/i.test(value)) {
      const matches = [...this.extensionBrowsers.values()].filter(backend => !backend.run.lost && backend.info.name.toLowerCase() === value.toLowerCase());
      if (matches.length > 1) throw new Error('Several browser profiles are connected. Use cua.listBrowsers() and select its exact id.');
      browser = matches[0];
    }
    if (!browser || browser.run.lost || browser.closing) throw new Error('The requested browser is not connected. Use cua.listBrowsers() to select an available browser.');
    return browser;
  }
  browserForTab(id, browserId) {
    if (browserId) return this.browserFor(browserId);
    const backend = this.browsers().find(browser => browser.records.has(id));
    if (!backend) throw new Error('That tab is no longer known. List tabs and choose the current target.');
    return backend;
  }
  viewsFor(target) {
    const browser = this.browserForTab(target.id, target.browserId);
    if (browser === this.browser) return this.browserViews;
    if (!this.extensionViews.has(browser)) {
      const views=new BrowserViews(browser);views.siteAnnotationSettings=this.siteAnnotationSettings;
      this.extensionViews.set(browser,views);
    }
    return this.extensionViews.get(browser);
  }
  browserInfo(browser) {
    return browser === this.browser ? { id: 'browser', name: 'Managed Browser', type: 'managed', profile: 'Computer Use' } : { ...browser.info };
  }
  async selectBrowser(id, options = {}, signal) {
    if (options.extensionInstanceId === undefined && (options.id === undefined || ['iab', 'browser', 'desktop-browser'].includes(options.id))) await this.ensurePluginBrowser();
    if (options.extensionInstanceId !== undefined) {
      if (options.id !== undefined) throw new Error('Specify either id or extensionInstanceId, not both.');
      const matches = [...this.extensionBrowsers.values()].filter(browser => !browser.run.lost && (browser.info.extensionInstanceId ?? browser.info.metadata?.extensionInstanceId) === options.extensionInstanceId);
      if (matches.length !== 1) throw new Error(matches.length ? 'Multiple browsers match this browser profile.' : 'The browser profile is unavailable.');
      return matches[0];
    }
    if (options.id !== undefined) return this.browserFor(options.id);
    const candidates = this.browsers().filter(browser => !browser.run?.lost && !browser.closing).sort((a, b) => Number(b.info?.type === 'iab') - Number(a.info?.type === 'iab')).map(browser => ({ ...this.browserInfo(browser), type: browser === this.browser || browser.info?.type === 'iab' ? 'iab' : 'extension', metadata: { ...browser.info?.metadata, extensionInstanceId: browser.info?.extensionInstanceId ?? browser.info?.metadata?.extensionInstanceId } }));
    const selected = await selectBrowserForUrl(candidates, options.url === undefined ? undefined : normalizeBrowserUrl(options.url), {
      signal, preferredExtensionInstanceId: this.preferredExtensionInstanceId,
      listTabs: (candidate, options) => this.browserFor(candidate.id).openTabs(id, options),
    });
    return this.browserFor(selected.id);
  }
  setTarget(state, target) {
    const previous = state.target;
    const nativeTarget=target?.kind==='app'?this.native.targets.get(target.id):null;
    if(nativeTarget)target={...target,viewId:nativeTarget.viewId};
    state.target=target;
    if(nativeTarget){const {id,viewId,pid,windowId,processIdentity,bundleId,name,sessionId}=nativeTarget;state.nativeTarget={id,viewId,pid,windowId,processIdentity,bundleId,name,sessionId};}
    else if(target?.kind!=='app'||state.nativeTarget?.id!==target.id)state.nativeTarget=null;
    if(target){state.previewTargets??=new Map();state.previewTargets.set(target.viewId??target.id,{target:{...target},native:state.nativeTarget});}
    if (target) { state.browserError = null; state.browserRun = target.kind === 'tab' ? this.browserForTab(target.id, target.browserId).run?.id : null; }
    if (previous?.id !== target?.id || previous?.viewId !== target?.viewId) {
      this.clearPointer(state);
      this.preview.delete(state.id);
      const viewId=target?.kind==='app'?target.viewId:target?.id;
      for (const viewer of state.viewers.values()) if (!viewer.stacked&&!viewer.independent&&(viewer.tabId??viewer.targetId) !== viewId) {
        try { viewer.send('closed', { reason: 'target-changed', message: '当前操作目标已改变' }); } catch {}
      }
      const view=previous?.kind==='app'&&previous.viewId!==viewId&&this.nativeViews.views.get(previous.viewId);if(view&&!this.presentationBinding?.presentations.ownsView(previous.viewId)&&![...state.viewers.values()].some(v=>v.stacked&&v.targetId===previous.viewId))void this.nativeViews.stop(view).catch(()=>{});
    }
    this.invalidateViewReads(state);
    if(target?.kind==='app')this.ensureNativePresentation(state);
    return target;
  }
  async dispatch(id, method, args = [], signal, coordinateFrames) {
    return this.browserAuth.dispatch(id, method, args, () => this.dispatchAuthorized(id, method, args, signal, coordinateFrames));
  }
  async dispatchAuthorized(id, method, args = [], signal, coordinateFrames) {
    if (!this.enabled) throw new Error('Computer Use is disabled in settings.');
    if (this.screenLockSetup && (['getApp', 'listApps', 'listWindows'].includes(method) || method === 'target' && args[0]?.kind === 'app')) throw new Error('Desktop system configuration is in progress');
    await this.extensionReady;
    if (['listBrowsers', 'getState'].includes(method) || method === 'listTabs' && args[0]?.browser === undefined) await this.ensurePluginBrowser({ required: false });
    if (method === 'createBrowserTab' && ['iab', 'browser', 'desktop-browser'].includes(args[0])
      || ['ownedTabs', 'openTabs', 'listTabs'].includes(method) && [undefined, 'iab', 'browser', 'desktop-browser'].includes(args[0]?.browser)) await this.ensurePluginBrowser();
    const session = this.session(id); signal?.throwIfAborted();
    if (session.ending) { await session.ending; signal?.throwIfAborted(); }
    if (session.turnEnded) {
      session.turnResuming ??= Promise.all(this.browsers().filter(browser => !browser.run?.lost).map(browser => browser.resume(id, { signal }))).then(() => {
        signal?.throwIfAborted(); session.turnEnded = false;
      }).finally(() => { session.turnResuming = null; });
      await session.turnResuming; signal?.throwIfAborted();
    }
    if (method === 'listBrowsers') return this.browsers().filter(browser => !browser.run?.lost).map(browser => this.browserInfo(browser));
    if (method === 'browserCapabilities') {
      const browser = this.browserFor(args[0]), management = new BrowserManagement(browser);
      return [
        { id: 'viewport', description: 'Temporary viewport size for controlled tabs.' },
        { id: 'emulation', description: 'Temporary device scale, user agent and touch/mobile settings.' },
        { id: 'visibility', description: 'Show or hide the selected tab preview.' },
        ...(management.available() ? [{ id: 'management', description: 'Organize browser windows, tabs and tab groups.', managementStatus: management.status() }] : []),
      ];
    }
    if (method === 'browserManagement') return new BrowserManagement(this.browserFor(args[0])).invoke(args[1], args[2], args[3], { signal });
    if (method === 'browserManagementAudit') return new BrowserManagement(this.browserFor(args[0])).getAuditTrail({ signal });
    if (method === 'browserVisibility') return this.presentBrowser(id, args[0], args[1], signal);
    if (method === 'browserVisibilityGet') {
      const browser = this.browserFor(args[0]);
      return session.presentationCompleted?.browserId === browser.id ? session.presentationCompleted.visible : false;
    }
    if (method === 'browserNameSession') {
      if (typeof args[1] !== 'string' || !args[1].trim()) throw new TypeError('nameSession requires a nonempty name.');
      const browser = this.browserFor(args[0]);
      if (typeof browser.renameSessionGroup !== 'function') throw Object.assign(new Error('This browser does not support sessionName.'), { code: 'UNSUPPORTED_CAPABILITY' });
      await browser.renameSessionGroup(id, args[1]); return null;
    }
    if(method==='browserViewport'){const browser=this.browserFor(args[0]);await Promise.all([...this.viewsFor({kind:'tab',browserId:browser.id}).views.values()].map(view=>view.layoutPending?.catch(()=>{})));signal?.throwIfAborted();await browser.browserViewport(id,args[1],signal);return null;}
    if(method==='browserEmulation'){const browser=this.browserFor(args[0]);try{await browser.browserEmulation(id,args[1],signal);}catch(error){if(error.code==='EMULATION_RESTORE_FAILED'){session.stopped=true;session.status='error';session.stopError={operation:'emulation',message:error.message,at:Date.now()};this.publishControl(session);}throw error;}return null;}
    if (method === 'getBrowser') {
      const browser = await this.selectBrowser(id, args[0], signal);
      return { ...this.browserInfo(browser), capabilities: ['accessibility', 'screenshots', 'playwright', 'dialogs', 'viewport', 'emulation', 'visibility', ...(browser === this.browser ? ['files'] : [])] };
    }
    if (method === 'listApps') return this.native.available() ? this.native.list(id, signal) : [];
    if (method === 'listWindows') {
      if (this.native.platform !== 'win32') throw Object.assign(new Error('Native window inventory is unavailable on this provider.'), { code: 'UNSUPPORTED_CAPABILITY' });
      return (await this.native.windows(id, undefined, signal)).map(window => ({ id: window.window_id, app: window.app_id, title: window.title }));
    }
    if (method === 'listTabs') {
      const browsers = args[0]?.browser !== undefined ? [this.browserFor(args[0].browser)] : this.browsers().filter(browser => !browser.run?.lost);
      return (await Promise.all(browsers.map(browser => browser.openTabs(id, { signal })))).flat();
    }
    if (method === 'ownedTabs' || method === 'openTabs') return this.browserFor(args[0]?.browser)[method](id, { signal });
    if (method === 'claimTab') {
      const browser = this.browserFor(args[0]);
      const tab = await browser.claimTab(id, args[1], { signal });
      return this.setTarget(session, { ...tab, kind: 'tab' });
    }
    if (method === 'getState') {
      const backends = this.browsers().filter(browser => !browser.run?.lost);
      const [apps, ...tabs] = await Promise.allSettled([this.native.available() ? this.native.list(id) : Promise.resolve([]), ...backends.map(browser => browser.list(id, { signal }))]);
      return { apps: apps.status === 'fulfilled' ? apps.value : [], browsers: backends.map((browser, index) => ({ ...this.browserInfo(browser), tabs: tabs[index].status === 'fulfilled' ? tabs[index].value : [] })), errors: [apps, ...tabs].filter(result => result.status === 'rejected').map(result => result.reason.message), nativeInstalled: this.native.available() };
    }
    if (method === 'createBrowserTab') {
      if (typeof args[0] !== 'string' || !args[0].trim()) throw new TypeError('createBrowserTab requires an explicit browser id.');
      const browser = this.browserFor(args[0]), options = args[2] ?? {};
      if (options.visible !== undefined && typeof options.visible !== 'boolean') throw new TypeError('visible must be a boolean.');
      if (options.sessionName !== undefined) await this.dispatch(id, 'browserNameSession', [args[0], options.sessionName], signal);
      const tab = await browser.create(id, args[1] === undefined ? 'about:blank' : normalizeBrowserUrl(args[1]), signal);
      const target = this.setTarget(session, { ...tab, kind: 'tab' });
      if (options.visible !== undefined) await this.presentBrowser(id, browser.id, options.visible, signal);
      return target;
    }
    if (method === 'getTab') {
      const reference = args[0]; let browser, mention;
      if (reference && typeof reference === 'object' && 'mention' in reference) {
        mention = parseTabMention(reference.mention);
        const matches = this.browsers().filter(candidate => !candidate.run?.lost && !candidate.closing && (mention.source === 'iab'
          ? (candidate === this.browser || candidate.info?.type === 'iab') && (candidate.id === mention.browser_id || mention.browser_id === 'iab' && candidate === this.browserFor('iab'))
          : candidate !== this.browser && candidate.info?.type !== 'iab' && (candidate.info.extensionInstanceId ?? candidate.info.metadata?.extensionInstanceId) === mention.browser_id));
        if (matches.length !== 1) throw new Error('The browser/profile referenced by the tab mention is unavailable or ambiguous.');
        browser = matches[0];
        if (args[1]?.browser !== undefined && this.browserFor(args[1].browser) !== browser) throw new Error('The requested browser does not match the tab mention.');
      } else {
        if (reference && typeof reference === 'object' && 'url' in reference && !args[1]?.browser) throw new Error('getTab({ url }) requires an explicit browser.');
        browser = args[1]?.browser ? this.browserFor(args[1].browser) : await this.selectBrowser(id, {}, signal);
      }
      const managed = await browser.ownedTabs(id, { signal }), user = await browser.openTabs(id, { signal });
      const tab = selectTabReference(managed, user, reference);
      if (mention && (tab.title !== mention.title || tab.url !== mention.url)) throw new Error('Stale tab mention: the title or URL has changed.');
      const expected = args[1]?.expected;
      if (expected && (expected.url !== tab.url || expected.title !== tab.title)) throw new Error('The referenced tab changed. Inspect the current tab identity before claiming it.');
      await browser.claimTab(id, tab, { signal }); signal?.throwIfAborted(); return this.setTarget(session, { ...tab, kind: 'tab' });
    }
    if (method === 'getApp') {
      try { const app = await this.native.bind(id, args[0], signal); signal?.throwIfAborted(); return this.setTarget(session, app); }
      catch (error) {
        if (['USER_INTERVENTION', 'FOREGROUND_LOST', 'INPUT_MONITOR_LOST'].includes(error?.code)) {
          session.stopped = true; session.controlEpoch++; session.lastError = { operation: 'getApp', message: error.message, at: Date.now() }; this.publishControl(session);
          void this.stop(id).catch(cleanup => { session.stopError = { operation: 'stop', message: cleanup.message, at: Date.now() }; });
        }
        throw error;
      }
    }
    if (method === 'target') {
      const [target, operation, input = []] = args;
      if (!target || !['app', 'tab'].includes(target.kind) || typeof target.id !== 'string') throw new Error('Invalid Computer Use target');
      const parameters = mapImagePoints(coordinateFrames, target, operation, input);
      const prior = session.queues.get(target.id); let release;
      const slot = new Promise(resolve => { release = resolve; }); session.queues.set(target.id, slot);
      if (prior) await prior;
      const started = performance.now();
      try {
        signal?.throwIfAborted();
        if (target.kind === 'tab') { await this.viewsFor(target).views.get(target.id)?.layoutPending?.catch(()=>{});signal?.throwIfAborted();await this.browserForTab(target.id, target.browserId).target(id, target.id, { signal }); signal?.throwIfAborted(); }
        this.setTarget(session, target); session.operation = operation;
        const result = await (target.kind === 'tab' ? this.browserForTab(target.id, target.browserId).invoke(id, target.id, operation, parameters, signal, imageFrameFor(coordinateFrames, target)?.geometry, { onReady: operation === 'waitForEvent' ? release : undefined }) : this.native.invoke(id, target.id, operation, parameters, signal));
        if (target.kind === 'app') { this.setTarget(session,target);this.ensureNativePresentation(session); }
        if (operation === 'downloads.save') signal?.throwIfAborted();
        const triggeringFailure = ['dialog.accept', 'dialog.dismiss'].includes(operation) && result?.dialogHandled && result?.triggeringActionError;
        const partialFailure = triggeringFailure ? 'Dialog handled successfully; the triggering action failed: ' + triggeringFailure.message : null;
        session.lastError = partialFailure ? { operation, message: partialFailure, at: Date.now() } : null;
        if (target.kind === 'tab' && result?.screenshot) {
          const owner = this.browserForTab(target.id, target.browserId).owners.get(target.id);
          if (owner?.created && !owner.keep) result.retention = 'temporary';
        }
        if (result?.screenshot && session.target?.kind === target.kind && session.target?.id === target.id) this.preview.set(id, { target:session.target, data: result.screenshot, mediaType: result.mediaType ?? 'image/png', at: Date.now() });
        const artifactPath = ['content.export', 'content.exportGsuite', 'content.exportYouTubeTranscript'].includes(operation) && typeof result === 'string' ? result : operation === 'pageAssets.bundle' ? result?.manifestPath : operation === 'downloads.save' && typeof result?.path === 'string' ? result.path : undefined;
        this.recordOperation(session, { target: target.id, kind: target.kind, operation, elapsedMs: Math.round(performance.now() - started), at: Date.now(), ok: !partialFailure, ...(partialFailure ? { error: partialFailure, dialogHandled: true } : {}), ...(artifactPath ? { artifactPath } : {}) });
        return result;
      } catch (error) {
        const failure = signal?.aborted ? signal.reason : error;
        if(error.code==='EMULATION_RESTORE_FAILED'){session.stopped=true;session.status='error';session.stopError={operation:'emulation',message:error.message,at:Date.now()};this.publishControl(session);}
        if (target.kind === 'app' && ['USER_INTERVENTION', 'FOREGROUND_LOST', 'INPUT_MONITOR_LOST'].includes(failure?.code)) {
          session.stopped = true; session.controlEpoch++; this.publishControl(session);
          void this.stop(id).catch(cleanup => { session.stopError = { operation: 'stop', message: cleanup.message, at: Date.now() }; });
        }
        const cancelled = ['NAVIGATION_SUPERSEDED', 'COMPUTER_USE_STOPPED'].includes(failure?.code);
        if (!cancelled) session.lastError = { operation, message: failure.message, at: Date.now() };
        this.recordOperation(session, { target: target.id, kind: target.kind, operation, elapsedMs: Math.round(performance.now() - started), at: Date.now(), ok: false, cancelled, error: failure.message }); throw failure;
      } finally { release(); if (session.queues.get(target.id) === slot) session.queues.delete(target.id); session.operation = null; }
    }
    throw new Error('Unknown Computer Use operation: ' + method);
  }
  recordOperation(state, entry) {
    const stats = state.operationStats;
    stats.total++; stats[entry.ok ? 'succeeded' : entry.cancelled ? 'cancelled' : 'failed']++;
    stats.methods[entry.operation] = (stats.methods[entry.operation] ?? 0) + 1;
    state.history.push(entry);
    if (state.history.length > 60) state.history.splice(0, state.history.length - 60);
  }
  async execute(id, code, options) {
    if (!this.enabled) throw new Error('Computer Use is disabled in settings.');
    if (this.disabling) await this.disabling;
    if (!this.enabled) throw new Error('Computer Use is disabled in settings.');
    const state = this.session(id);
    if (state.ending) await state.ending;
    if (state.stopped) throw Object.assign(new Error('Computer Use was stopped by the user. Resume control in the Computer Use panel before another action.'), { code: 'COMPUTER_USE_STOPPED' });
    const { toolExecution, turnNumber, ...runtimeOptions } = options ?? {};
    if (turnNumber !== undefined) this.beginTurn(id, turnNumber);
    let releaseFileExecution;
    if (this.filePolicy && toolExecution) {
      try {
        const signal = AbortSignal.any([toolExecution.signal, runtimeOptions.signal].filter(Boolean));
        releaseFileExecution = this.filePolicy.registerExecution(toolExecution, { cwd: runtimeOptions.cwd, signal });
        state.fileUploadError = null;
      } catch (error) { state.fileUploadError = { code: error.code, message: error.message }; }
    }
    state.status = 'running'; state.startedAt = Date.now();
    try {
      this.publishControl(state);
      await this.clearSiteAnnotationPreviews(state);
      return await state.runtime.execute(code, runtimeOptions);
    }
    finally {
      try { await releaseFileExecution?.(); }
      catch (error) {
        state.fileUploadError = { code: error.code, message: error.message };
        state.stopError = { operation: 'file-upload-cleanup', message: error.message, at: Date.now() };
        throw error;
      } finally {
        state.status = state.stopError ? 'error' : state.stopped ? (state.runtime.stopping ? 'stopping' : 'stopped') : state.runtime.current ? 'running' : 'idle';
        if (!state.runtime.current) {
          state.operation = null;
          if (!this.closed && (!state.currentTurnID || state.turnEnded)) {
            const results = await Promise.allSettled(this.browsers().map(browser => !browser.run?.lost && !browser.closing ? browser.setAgentActivity?.(id, false) : undefined));
            const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
            if (errors.length) {
              state.stopError = { operation: 'agent-activity', message: errors.map(error => error.message).join('; '), at: Date.now() };
              state.stopped = true; state.status = 'error'; this.publishControl(state);
              throw new AggregateError(errors, 'Browser agent activity cleanup was not confirmed');
            }
          }
        }
      }
    }
  }
  async stop(id, ownAction) {
    const state = this.session(id); state.stopped = true; state.status = 'stopping';
    this.clearPointer(state);
    if (!ownAction) { state.navigationRevision++; state.currentNavigation = null; }
    if (state.resuming) { state.controlEpoch++; this.publishControl(state); }
    if (state.uiAction && state.uiAction !== ownAction) state.uiAction.abort(Object.assign(new Error('Stopped by user'), { code: 'COMPUTER_USE_STOPPED' }));
    if (state.target?.kind === 'tab') this.browserForTab(state.target.id, state.target.browserId).keepForUser(id, state.target.id);
    try {
      await state.runtime.stop(Object.assign(new Error('Computer Use was stopped by the user.'), { code: 'COMPUTER_USE_STOPPED' }));
      if (!ownAction) await state.uiActionPending?.catch(() => {});
      if(!ownAction&&state.target?.kind==='tab'){const view=this.viewsFor(state.target).views.get(state.target.id);if(view)await restoreStylePreview(view);}
      state.status = 'stopped'; state.stopError = null; state.lastError = null;
    }
    catch (error) { state.status = 'error'; state.stopError = { operation: 'stop', message: error.message, at: Date.now() }; throw error; }
    finally { state.operation = null; this.publishControl(state); }
  }
  async resume(id) {
    const state = this.session(id);
    if (state.uiAction) throw new Error('浏览器正在切换，请稍后恢复助手控制');
    if (state.resuming) return state.resumePending;
    if (state.stopError || state.runtime.stopping) throw new Error('Stopping has not been confirmed. Retry stop before resuming control.');
    if(state.target?.kind==='tab'&&this.viewsFor(state.target).views.get(state.target.id)?.stylePreview)throw new Error('临时样式恢复尚未确认，请重试停止');
    if (!state.stopped) return;
    state.resuming = true; const epoch = ++state.controlEpoch; this.publishControl(state);
    state.resumePending = (async () => {
      await state.manualTail?.catch(() => {});
      await this.clearSiteAnnotationPreviews(state);
      for(const views of [this.browserViews,...this.extensionViews.values()])for(const view of views.views.values()){
        const active=view.annotationLiveEditor?.active;
        if(active?.owner!==state)continue;
        const {handleAnnotationQueue}=await import('./annotation-queue.mjs');
        await views.snapshotRead(view,()=>handleAnnotationQueue(views,view,{action:'design-cancel',editorId:active.editorId},undefined,state));
      }
      await this.releaseManualInput(id);
      if (state.controlEpoch === epoch) { state.stopped = false; state.status = 'idle'; }
    })().finally(() => { state.resuming = false; state.resumePending = null; this.publishControl(state); });
    return state.resumePending;
  }
  publishControl(state) {
    this.invalidateViewReads(state);
    if (!this.enabled || state.stopped || state.uiAction || state.resuming) this.clearPointer(state);
    for (const viewer of state.viewers.values()) { try { viewer.send('control', { controlEpoch: state.controlEpoch, stopped: state.stopped, transitioning: !!state.uiAction || state.resuming === true, browserUseActive:this.browserAgentActive(state) }); } catch {} }
  }
  invalidateViewReads(state) {
    for (const read of state.viewReads ?? []) if (!read.valid()) read.controller.abort(Object.assign(new Error('当前查看的网页或控制权已改变'), { code: 'VIEW_CHANGED' }));
    void this.siteAnnotationRequests.syncSession(state).catch(error=>{
      for(const viewer of state.viewers.values())try{viewer.send('warning',{message:error.message});}catch{}
    });
  }
  browserAgentActive(state) {
    return Boolean(state && !this.closed && this.enabled && !state.stopped && !state.turnEnded && !state.uiAction
      && (state.runtime.current || state.status === 'running' || state.currentTurnID));
  }
  async clearSiteAnnotationPreviews(state) {
    await this.siteAnnotationRequests.syncSession(state);
    for(const views of [this.browserViews,...this.extensionViews.values()])for(const view of views.views.values()){
      for(const viewer of state.viewers.values())if(viewer.tabId===view.tabId)await clearSiteAnnotationFeaturePreview(view,{owner:viewer});
    }
  }
  async presentBrowser(id, browserId, visible, signal) {
    if (typeof visible !== 'boolean') throw new TypeError('visibility.set requires a boolean.');
    const state = this.session(id), browser = this.browserFor(browserId), target = state.target;
    if (target?.kind !== 'tab' || this.browserForTab(target.id, target.browserId) !== browser) throw new Error('Select a tab in this browser before changing its preview visibility.');
    if (state.presentationPending) throw new Error('A browser presentation request is already pending.');
    if (visible) { state.viewTarget = target; state.viewRevision = (state.viewRevision ?? 0) + 1; this.invalidateViewReads(state); }
    const request = { id: randomUUID(), sessionId: id, visible, tabId: target.id, browserId: browser.id, expiresAt: Date.now() + 5000 };
    state.presentationRequest = request;
    try {
      return await new Promise((resolve, reject) => {
        const cancel = () => reject(signal.reason ?? new Error('Browser presentation cancelled.'));
        const timer = setTimeout(() => reject(state.presentationPending?.error ?? new Error('No active conversation client confirmed browser visibility. Open this conversation in the application and try again.')), 5000);
        state.presentationPending = { request, resolve, reject, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); } };
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) cancel();
      });
    } finally {
      state.presentationPending?.cleanup(); state.presentationPending = null;
      if (state.presentationRequest?.id === request.id) state.presentationRequest = null;
    }
  }
  acknowledgePresentation(id, input) {
    const state = this.session(id), pending = state.presentationPending;
    if (!pending && state.presentationCompleted?.id === input.id && state.presentationCompleted.visible === input.visible) return { acknowledged: true };
    if (!pending || input.id !== pending.request.id) throw new Error('This browser presentation request has expired.');
    if (input.visible !== pending.request.visible) throw new Error('Browser visibility acknowledgement does not match the request.');
    if (input.error) pending.error = new Error(String(input.error).slice(0, 1000));
    else { state.presentationCompleted = { id: input.id, browserId: pending.request.browserId, visible: input.visible }; pending.resolve({ visible: input.visible, surface: 'dsh-preview', tabId: pending.request.tabId }); }
    return { acknowledged: true };
  }
  clearPointer(state) {
    this.nativeViews.clearRetainedCursor(state.id);
    state.pointerAfter = performance.now();
    state.nativePointerAfter = Date.now();
    if (state.pointer) {
      const browser = this.browsers().find(browser => browser.records.has(state.pointer.tabId));
      void browser?.hideCursor?.(state.id, state.pointer.tabId).catch(() => {});
    }
    state.pointer = null; state.cursorRetained = false;
    for (const viewer of state.viewers.values()) { try { viewer.send('cursor', null); } catch {} }
  }
  pointerActive(id, tabId) {
    const state = this.sessions.get(id);
    return state && !this.closed && this.enabled && !state.stopped && !state.uiAction && !state.resuming && !state.ending && state.target?.kind === 'tab' && state.target.id === tabId ? state : null;
  }
  pointer(event) {
    const state = this.sessions.get(event.sessionId);
    if (!state) return;
    if (event.hidden) { if (!state.ending && state.pointer?.source === event.source) this.clearPointer(state); return; }
    if (!this.pointerActive(event.sessionId, event.tabId)) return;
    if (!(event.issuedAt > (state.pointerAfter ?? 0))) return;
    if (state.pointer?.source === event.source && state.pointer.sequence >= event.sequence) return;
    if (Date.now() - event.at > 1500) return;
    const { sessionId, targetId, ...pointer } = event;
    state.cursorRetained = false;
    state.pointer = { ...pointer, controlEpoch: state.controlEpoch };
    for (const viewer of state.viewers.values()) if (viewer.tabId === event.tabId) { try { viewer.send('cursor', state.pointer); } catch {} }
    return true;
  }
  async watchNative(id,targetId,send,signal,stacked=false){
    if(this.closed||!this.enabled)throw new Error('Computer Use 已关闭');
    const state=this.session(id);
    const entry=stacked?state.previewTargets.get(targetId):{target:state.target,native:state.nativeTarget};
    if(entry?.target?.kind!=='app'||![entry.target.id,entry.target.viewId].includes(targetId)||!entry.native)throw new Error('当前会话没有选择这个应用窗口');
    targetId=entry.target.viewId;
    const actor=randomUUID();state.viewers.set(actor,{targetId,send,stacked,readOnly:stacked});
    send('ready',{controlEpoch:state.controlEpoch});
    let unsubscribe;
    try{
      unsubscribe=await this.nativeViews.subscribe(id,targetId,(event,value)=>{
        if(!stacked&&state.target?.viewId!==targetId){send('closed',{reason:'target-changed',message:'当前操作目标已改变'});return;}
        send(event,event==='frame'?{...value,controlEpoch:state.controlEpoch,stopped:state.stopped}:event==='cursor'&&(state.target?.viewId!==targetId||state.stopped||value?.at<=(state.nativePointerAfter??0))?null:value);
        if(event==='closed'){state.previewTargets.delete(targetId);if(state.target?.viewId===targetId){this.setTarget(state,null);state.lastError=value.reason==='runtime-update'?null:{operation:'preview',message:'应用窗口已关闭，请重新选择应用',at:Date.now()};}}
        if(value?.userStopped)void this.stop(id).catch(error=>{state.stopError={operation:'stop',message:error.message,at:Date.now()};});
      },signal,entry.native);
      return async()=>{state.viewers.delete(actor);await unsubscribe();};
    }catch(error){state.viewers.delete(actor);await unsubscribe?.().catch(()=>{});throw error;}
  }
  async watchBrowser(id, tabId, send, signal, stacked=false, independent=false) {
    if(this.closed||!this.enabled)throw new Error('Computer Use 已关闭');
    const state = this.session(id);
    const target=stacked||independent?state.previewTargets.get(tabId)?.target:state.target;
    if (target?.kind !== 'tab' || target.id !== tabId) throw new Error('当前会话没有选择这个浏览器标签页');
    const browser=this.browserForTab(target.id,target.browserId);
    const belongs=()=>{const owner=browser.owners.get(tabId);return !owner||owner.sessionId===id;};
    if(!belongs())throw new Error('这个标签页正在被其他对话使用');
    state.userTabs.add(tabId);
    const actor = randomUUID(),viewer={tabId,send,stacked,independent,readOnly:stacked};state.viewers.set(actor,viewer);
    send('ready', { actor, controlEpoch: state.controlEpoch });
    if (state.pointer?.tabId===tabId) send('cursor', state.pointer);
    const views=this.viewsFor(target);
    const subscription = views.subscribe(tabId, (type, value) => {
      if(!belongs()){send('closed',{reason:'owner-changed',message:'标签页控制权已改变'});return;}
      if (!stacked&&(independent?state.previewTargets.get(tabId)?.target:state.target)?.id !== tabId) { send('closed', { reason: 'target-changed', message: '当前查看的标签页已改变' }); return; }
      send(type, type === 'frame' ? { ...value, browserCursor: value.browserCursor && !state.cursorRetained, actor, controlEpoch: state.controlEpoch, stopped: state.stopped, transitioning: !!state.uiAction || state.resuming === true, browserUseActive:this.browserAgentActive(state) } : value);
    }, signal);
    let closing;
    const close = () => closing ??= (async () => {
      state.viewers.delete(actor); this.invalidateViewReads(state); signal?.removeEventListener('abort', aborted);
      await state.manualTail?.catch(() => {});
      try {
        await this.siteAnnotationRequests.closeViewer(viewer);
        if (state.manualActor === actor) await this.releaseManualInput(id);
        const view=views.views.get(tabId),hasWritableViewer=()=>[...state.viewers.values()].some(value=>value.tabId===tabId&&!value.readOnly);
        if(view)await clearSiteAnnotationFeaturePreview(view,{owner:viewer});
        if(view&&!hasWritableViewer()){
          const leave=async()=>{
            if(hasWritableViewer())return;
            const {closeAnnotationQueueForOwner}=await import('./annotation-queue.mjs');
            await closeAnnotationQueueForOwner(views,view,state);
          };
          if(view.closed||view.lifetime.signal.aborted)await leave();else await views.snapshotRead(view,leave);
        }
      }catch(error){state.stopError={operation:'annotation-cleanup',message:error.message,at:Date.now()};state.status='error';throw error;}
      finally { const unsubscribe = await subscription.catch(() => null); await unsubscribe?.(); }
    })();
    const aborted = () => { void close().catch(() => {}); };
    signal?.addEventListener('abort', aborted, { once: true });
    try {
      await subscription; signal?.throwIfAborted(); return close;
    } catch (error) { await close(); throw error; }
  }
  async manualInput(id, input) {
    const state = this.session(id);
    const action = async () => {
      if (!this.enabled && !['dialog', 'release', 'pointerup', 'keyup'].includes(input.type)) throw new Error('Computer Use 已关闭');
      const viewer = state.viewers.get(input.actor);
      const target=this.viewerTarget(state,input);
      if (!target) throw new Error('当前画面已断开或操作目标已改变');
      if (input.controlEpoch !== state.controlEpoch) throw new Error('控制权已经改变，旧操作已取消');
      if ((state.uiAction || state.resuming) && input.type !== 'dialog') throw new Error('控制权正在切换，请等待新画面');
      if (input.type === 'release' && state.manualActor !== input.actor) return this.status(id);
      if (!state.stopped) {
        const stopping = this.stop(id);
        if (input.type === 'dialog') void stopping.catch(() => {}); else await stopping;
      }
      if (state.stopError) throw new Error(state.stopError.message);
      if(viewer.independent&&state.target?.id!==input.tabId){
        if(!this.enabled||state.controlEpoch!==input.controlEpoch||state.viewers.get(input.actor)!==viewer||!this.viewerTarget(state,input))throw new Error('查看的网页或控制权已改变，请重试');
        this.adoptViewedTab(state,target);
      }
      if (state.target?.id !== input.tabId) throw new Error('操作目标已改变，请根据最新画面重试');
      if (state.manualActor && state.manualActor !== input.actor && input.type !== 'dialog') await this.releaseManualInput(id);
      state.manualActor = input.actor;
      const closing = input.type === 'dialog' ? state.closingTabs.get(input.tabId) : null;
      try { await this.viewsFor(state.target).input(id, input.tabId, input); }
      catch (error) {
        if (['STALE_DIALOG', 'DIALOG_OPEN'].includes(error.code)) throw error;
        try { await this.releaseManualInput(id); }
        catch (cleanup) { state.stopError = { operation: 'release', message: cleanup.message, at: Date.now() }; state.status = 'error'; throw new AggregateError([error, cleanup], cleanup.message); }
        throw error;
      }
      if (closing) {
        state.closingTabs.delete(input.tabId);
        if (input.accept) {
          if (!closing.isClosed()) await closing.waitForEvent('close', { timeout: 8000 });
          if (state.target?.id === input.tabId) this.setTarget(state, null);
          await this.selectPreviousUserTab(id);
        }
      }
      state.lastError = null;
      this.publishControl(state);
      return this.status(id);
    };
    const perform=async()=>{state.manualBusy=true;try{const target=this.viewerTarget(state,input);if(target)await this.viewsFor(target).views.get(target.id)?.layoutPending?.catch(()=>{});return await action();}finally{state.manualBusy=false;}};
    const pending = (state.manualTail ?? Promise.resolve()).then(perform, perform);
    state.manualTail = pending.catch(() => {});
    return pending;
  }
  async annotationSnapshot(id,input,signal){
    if(this.closed||!this.enabled)throw new Error('Computer Use 已关闭');
    const state=this.sessions.get(id),viewer=state?.viewers.get(input.actor);
    const valid=()=>this.enabled&&this.viewerTarget(state,input)&&state.viewers.get(input.actor)===viewer&&input.controlEpoch===state.controlEpoch;
    if(!valid())throw new Error('当前画面或控制权已改变，请重新打开批注');
    const views=this.viewsFor(this.viewerTarget(state,input)),view=views.views.get(input.tabId);
    if(!view||view.closed)throw new Error('当前浏览器画面已断开');
    await clearSiteAnnotationFeaturePreview(view,{owner:viewer});
    const result=await views.snapshotRead(view,()=>captureAnnotation(views,view,signal));
    signal?.throwIfAborted();if(!valid())throw new Error('当前画面或控制权已改变，请重新打开批注');
    return result;
  }
  async annotationSite(id,input,signal){return this.siteAnnotationRequests.action(id,input,signal);}
  async submitAnnotation(id, input, signal) {
    return this.readAnnotationSubmission(id, input, signal, async (views, view, lifetime) => {
      const { submitAnnotation } = await import('./annotation-submit.mjs');
      return { comment: await submitAnnotation(views, view, input, lifetime) };
    });
  }
  async annotationQueue(id, input, signal) {
    if(input.action?.startsWith('design-')){
      const state=this.sessions.get(id),viewer=state?.viewers.get(input.actor),target=this.viewerTarget(state,input);
      if(!viewer||viewer.readOnly||target?.kind!=='tab'||target.id!==input.tabId||viewer.tabId!==input.tabId)throw new Error('当前画面不能进行实时编辑，请重新选择网页');
      if(input.action==='design-begin'){
        const savedVirtual=typeof input.commentId==='string'&&input.commentId&&input.sourceFrameId===undefined&&input.elementKey===undefined&&input.virtualSelectionKey===undefined;
        if(!savedVirtual&&(typeof input.sourceFrameId!=='string'||!input.sourceFrameId||
          !((typeof input.elementKey==='string'&&input.elementKey&&input.virtualSelectionKey===undefined)||
            (typeof input.virtualSelectionKey==='string'&&input.virtualSelectionKey&&input.elementKey===undefined))))throw new TypeError('实时编辑需要当前冻结画面中的实际目标');
        const views=this.viewsFor(target),view=views.views.get(target.id);
        if(!view||view.closed)throw new Error('当前浏览器画面已断开');
        return this.userBrowserAction(id,input,async actionSignal=>{
          if(state.viewers.get(input.actor)!==viewer||!this.viewerTarget(state,input))throw new Error('当前画面已改变，请重新选择网页');
          if(viewer.independent&&state.target?.id!==target.id)this.adoptViewedTab(state,target);
          if(state.target?.id!==target.id)throw new Error('当前操作目标已改变');
          views.browser.claim(id,target.id);
          return this.readAnnotationSubmission(id,{...input,controlEpoch:state.controlEpoch},AbortSignal.any([actionSignal,signal].filter(Boolean)),async(activeViews,activeView,lifetime,owner)=>{
            const {handleAnnotationQueue}=await import('./annotation-queue.mjs');
            return handleAnnotationQueue(activeViews,activeView,{...input,controlEpoch:state.controlEpoch},lifetime,owner);
          });
        });
      }
    }
    return this.readAnnotationSubmission(id, input, signal, async (views, view, lifetime, state) => {
      const { handleAnnotationQueue } = await import('./annotation-queue.mjs');
      return handleAnnotationQueue(views, view, input, lifetime, state);
    });
  }
  async readAnnotationSubmission(id, input, signal, action) {
    signal?.throwIfAborted();
    const state = this.sessions.get(id), viewer = state?.viewers.get(input.actor), target = this.viewerTarget(state, input);
    const valid = () => !this.closed && this.enabled && viewer && state.viewers.get(input.actor) === viewer
      && target?.kind === 'tab' && this.viewerTarget(state, input)?.id === target.id && input.controlEpoch === state.controlEpoch;
    if (!valid()) throw Object.assign(new Error('当前画面或控制权已改变，请重新打开批注'), { code: 'ANNOTATION_CHANGED' });
    const views = this.viewsFor(target), view = views.views.get(target.id);
    if (!view || view.closed) throw Object.assign(new Error('当前网页画面已断开'), { code: 'ANNOTATION_CHANGED' });
    if (input.browserId !== undefined && input.browserId !== views.browser.id) throw Object.assign(new Error('批注的浏览器已改变'), { code: 'ANNOTATION_CHANGED' });
    const read = { controller: new AbortController(), valid };
    state.viewReads ??= new Set(); state.viewReads.add(read);
    const lifetime = AbortSignal.any([view.lifetime.signal, view.document.signal, read.controller.signal, signal].filter(Boolean));
    try {
      const result = await views.snapshotRead(view, () => action(views, view, lifetime, state));
      lifetime.throwIfAborted();
      if (!valid()) throw Object.assign(new Error('当前画面或控制权已改变，请重新打开批注'), { code: 'ANNOTATION_CHANGED' });
      return { ...result, actor: input.actor, controlEpoch: state.controlEpoch };
    } finally { state.viewReads.delete(read); }
  }
  async viewScreenshot(id,input,signal){
    const state=this.sessions.get(id),viewer=state?.viewers.get(input.actor),target=this.viewerTarget(state,input);
    const valid=()=>this.enabled&&!this.closed&&target&&this.viewerTarget(state,input)&&state.viewers.get(input.actor)===viewer&&input.controlEpoch===state.controlEpoch;
    if(!valid())throw new Error('当前画面已改变，请重新截图');
    const views=this.viewsFor(target),view=views.views.get(target.id);
    if(!view||view.closed)throw new Error('当前浏览器画面已断开');
    const lifetime=AbortSignal.any([view.lifetime.signal,signal].filter(Boolean));
    const captured=await views.snapshotRead(view,()=>views.browser.observeScreenshot(view.record,{},lifetime));
    lifetime.throwIfAborted();if(!valid())throw new Error('当前画面已改变，请重新截图');
    return{data:captured.screenshot,mediaType:'image/png'};
  }
  async zoomViewedTab(id, input, signal) {
    signal?.throwIfAborted();
    const state = this.sessions.get(id), viewer = state?.viewers.get(input.actor), target = this.viewerTarget(state, input);
    const valid = () => !this.closed && this.enabled && target && this.viewerTarget(state, input)?.id === target.id && state.viewers.get(input.actor) === viewer;
    if (!valid() || state.controlEpoch !== input.controlEpoch) throw Object.assign(new Error('当前查看的网页或控制权已改变'), { code: 'VIEW_CHANGED' });
    const views = this.viewsFor(target), browser = views.browser, view = views.views.get(target.id);
    if (!view || view.closed) throw new Error('当前浏览器画面已断开');
    const action = input.action ?? 'get';
    if (!['get', 'set', 'step', 'reset'].includes(action) || action === 'set' && !Number.isFinite(input.zoomPercent) || action === 'step' && !Number.isFinite(input.delta)) throw new TypeError('Invalid page zoom operation');
    if (typeof browser.readZoom !== 'function' || typeof browser.zoom !== 'function' || !browser.info?.capabilities?.includes('tab-zoom')) {
      if (action === 'get') return { available: false, code: 'ZOOM_UNAVAILABLE', controlEpoch: state.controlEpoch };
      throw Object.assign(new Error('当前浏览器没有提供真实页面缩放'), { code: 'ZOOM_UNAVAILABLE' });
    }
    if (action === 'get') {
      const lifetime = AbortSignal.any([view.lifetime.signal, signal].filter(Boolean));
      const zoom = await browser.readZoom(view.sessionId, target.id, lifetime);
      lifetime.throwIfAborted();
      if (!valid() || state.controlEpoch !== input.controlEpoch) throw Object.assign(new Error('当前查看的网页或控制权已改变'), { code: 'VIEW_CHANGED' });
      return { available: true, ...zoom, controlEpoch: state.controlEpoch };
    }
    const zoom = await this.userBrowserAction(id, input, async actionSignal => {
      const lifetime = AbortSignal.any([actionSignal, view.lifetime.signal, signal].filter(Boolean));
      lifetime.throwIfAborted();
      if (!valid()) throw Object.assign(new Error('当前查看的网页已改变'), { code: 'VIEW_CHANGED' });
      if (state.target?.id !== target.id) this.adoptViewedTab(state, target);
      browser.claim(id, target.id);
      const result = await browser.zoom(id, target.id, { action, ...(action === 'set' ? { zoomPercent: input.zoomPercent } : {}), ...(action === 'step' ? { delta: input.delta } : {}) }, lifetime);
      lifetime.throwIfAborted();
      if (!valid()) throw Object.assign(new Error('当前查看的网页已改变'), { code: 'VIEW_CHANGED' });
      view.record.screenshotFrame = null;
      if (!view.dialog) views.queueFrame(view, { loaderId: view.loaderId, captureOnly: true });
      return result;
    });
    return { available: true, ...zoom, controlEpoch: state.controlEpoch, state: this.status(id) };
  }
  async copyViewedScreenshot(id, input, signal) {
    signal?.throwIfAborted();
    const state = this.sessions.get(id), viewer = state?.viewers.get(input.actor), target = this.viewerTarget(state, input);
    const valid = () => !this.closed && this.enabled && target?.kind === 'tab' && this.viewerTarget(state, input)?.id === target.id && state.viewers.get(input.actor) === viewer && state.controlEpoch === input.controlEpoch;
    if (!valid()) throw Object.assign(new Error('当前查看的网页或控制权已改变'), { code: 'VIEW_CHANGED' });
    const views = this.viewsFor(target), view = views.views.get(target.id), browser = views.browser;
    if (!view || view.closed) throw new Error('当前浏览器画面已断开');
    const ownClipboard = browser.hub === this.pluginBrowserBinding?.hub && browser.info?.capabilities?.includes('native-clipboard-image');
    if (!ownClipboard && typeof this.native.copyImageToClipboard !== 'function') throw Object.assign(new Error('当前平台没有提供原生图片剪贴板'), { code: 'NATIVE_CLIPBOARD_UNAVAILABLE' });
    const read = { controller: new AbortController(), valid };
    state.viewReads ??= new Set(); state.viewReads.add(read);
    const lifetime = AbortSignal.any([view.lifetime.signal, read.controller.signal, signal].filter(Boolean));
    try {
      const captured = await views.snapshotRead(view, () => {
        lifetime.throwIfAborted();
        if (!valid()) throw Object.assign(new Error('当前查看的网页或控制权已改变'), { code: 'VIEW_CHANGED' });
        return ownClipboard ? browser.captureClipboard(view.sessionId, target.id, lifetime, { trustedUserAction: true })
          : browser.observeScreenshot(view.record, {}, lifetime);
      });
      lifetime.throwIfAborted();
      if (!valid()) throw Object.assign(new Error('当前查看的网页或控制权已改变'), { code: 'VIEW_CHANGED' });
      const result = ownClipboard ? captured : await this.native.copyImageToClipboard(id, captured.screenshot, lifetime);
      return { ...result, controlEpoch: state.controlEpoch };
    } finally { state.viewReads.delete(read); }
  }
  async presentViewedTab(id, input, signal) {
    signal?.throwIfAborted();
    if (this.closed || !this.enabled) throw new Error('Computer Use is disabled');
    const state = this.sessions.get(id), viewer = state?.viewers.get(input.actor), target = this.viewerTarget(state, input);
    const valid = () => !this.closed && this.enabled && viewer && state.viewers.get(input.actor) === viewer
      && target?.kind === 'tab' && this.viewerTarget(state, input)?.id === target.id;
    if (!valid() || input.controlEpoch !== state.controlEpoch) throw Object.assign(new Error('当前查看的网页或控制权已改变'), { code: 'VIEW_CHANGED' });
    const browser = this.browserForTab(target.id, target.browserId), view = this.viewsFor(target).views.get(target.id);
    if (browser.hub !== this.pluginBrowserBinding?.hub) throw Object.assign(new Error('该操作仅适用于 OpenCU 自有浏览器'), { code: 'PRESENTATION_UNAVAILABLE' });
    if (!view || view.closed) throw Object.assign(new Error('当前网页画面已断开'), { code: 'VIEW_CHANGED' });
    const action = input.action ?? 'presentation';
    if (!['presentation', 'detach', 'get', 'focusSource', 'setAlwaysOnTop', 'restore'].includes(action)) throw new TypeError('Invalid browser window operation');
    const result = await this.userBrowserAction(id, input, async actionSignal => {
      const lifetime = AbortSignal.any([actionSignal, view.lifetime.signal, signal].filter(Boolean));
      lifetime.throwIfAborted();
      if (!valid()) throw Object.assign(new Error('当前查看的网页已改变'), { code: 'VIEW_CHANGED' });
      if (state.target?.id !== target.id) this.adoptViewedTab(state, target);
      await browser.target(id, target.id, { signal: lifetime });
      const value = action === 'presentation'
        ? await browser.presentation(id, target.id, { visible: input.visible, ...(input.bounds === undefined ? {} : { bounds: input.bounds }) }, lifetime, { trustedUserAction: true })
        : await browser.detachedWindow(id, target.id, action, {
          ...(input.detachedId === undefined ? {} : { detachedId: input.detachedId }),
          ...(input.alwaysOnTop === undefined ? {} : { alwaysOnTop: input.alwaysOnTop }),
        }, lifetime, { trustedUserAction: true });
      lifetime.throwIfAborted();
      if (!valid()) throw Object.assign(new Error('当前查看的网页已改变'), { code: 'VIEW_CHANGED' });
      return value;
    });
    return { result, surface: 'opencu-browser-window', browserId: browser.id, browserEpoch: browser.info.epoch, state: this.status(id) };
  }
  async nativeBrowserAction(id, input, signal) {
    signal?.throwIfAborted();
    if (this.closed || !this.enabled) throw new Error('Computer Use is disabled');
    if (input?.action === 'capabilities' && !this.viewTarget(this.sessions.get(id))) {
      const browser = await this.ensurePluginBrowser({ required: false });
      if (!browser) return { available: false, browserId: null, browserEpoch: null, reason: this.pluginBrowserError?.message ?? 'The OpenCU browser is unavailable' };
    }
    if (input?.action?.startsWith('profile') || ['siteTools', 'siteToolsRefresh', 'siteAnnotationFeatures', 'siteAnnotationFeaturesSetEnabled', 'siteAnnotationFeaturePreview'].includes(input?.action)) return browserProfileAction(this, id, input, signal);
    const target = this.viewTarget(this.sessions.get(id));
    const browser = input.browserId ? this.browserFor(input.browserId) : target?.kind === 'tab' ? this.browserForTab(target.id, target.browserId) : this.browserFor('iab');
    if (browser?.hub === this.pluginBrowserBinding?.hub) {
      const result = await ownedBrowserAction(this, id, input, signal);
      if (input.action === 'capabilities') {
        const profile = await browserProfileAction(this, id, { ...input, browserId: browser.id }, signal);
        return { ...result, profile: profile.profile };
      }
      return result;
    }
    if (input.action === 'capabilities') return browserProfileAction(this, id, input, signal);
    const capability = input?.action?.startsWith('history.') ? 'browserHistory'
      : input?.action?.startsWith('downloads.') ? 'downloadHistory'
      : input?.action?.startsWith('permissions.') ? 'browserPermissions'
      : input?.action === 'tabs.pageInfo' ? 'siteInformation' : 'embeddedBrowser';
    throw pluginCapabilityError(capability);
  }
  listDownloads(id){
    if(!this.enabled||this.closed)throw new Error('Computer Use 已关闭');
    return this.browsers().flatMap(browser=>[...browser.downloadHistory.values()].filter(item=>item.sessionId===id).map(({sessionId,path,url,...item})=>({...item,source:(()=>{try{return new URL(url).host;}catch{return '';}})(),canDownload:!!path&&existsSync(path)}))).sort((a,b)=>b.startedAt-a.startedAt);
  }
  clearDownloads(id){
    if(!this.enabled||this.closed)throw new Error('Computer Use 已关闭');
    for(const browser of this.browsers())for(const [key,item] of browser.downloadHistory)if(item.sessionId===id&&!['inProgress','unobserved'].includes(item.state))browser.downloadHistory.delete(key);
    return{downloads:this.listDownloads(id)};
  }
  downloadFile(id,downloadId){
    if(!this.enabled||this.closed)throw new Error('Computer Use 已关闭');
    for(const browser of this.browsers()){
      const item=browser.downloadHistory.get(downloadId);
      if(item?.sessionId===id&&item.state==='completed'&&item.path&&existsSync(item.path))return{path:item.path,filename:item.filename};
    }
    throw new Error('文件尚未就绪、已不可用，或不属于当前会话');
  }
  async findViewedText(id,input,signal){
    signal?.throwIfAborted();
    if(typeof input.query!=='string')throw new Error('请输入要查找的文字');
    const state=this.sessions.get(id),viewer=state?.viewers.get(input.actor),target=this.viewerTarget(state,input);
    if(!target)throw new Error('当前画面已改变，请重新选择网页');
    const views=this.viewsFor(target),view=views.views.get(target.id);
    if(!view||view.closed)throw new Error('当前浏览器画面已断开');
    const result=await this.userBrowserAction(id,input,async actionSignal=>{
      const lifetime=AbortSignal.any([actionSignal,view.lifetime.signal,view.document.signal,signal].filter(Boolean));lifetime.throwIfAborted();
      if(state.viewers.get(input.actor)!==viewer||!this.viewerTarget(state,input))throw new Error('当前画面已改变，请重新选择网页');
      if(state.target?.id!==target.id)this.adoptViewedTab(state,target);
      views.browser.claim(id,target.id);
      return findInView(view,{query:input.query,backward:input.backward===true},lifetime);
    });
    return{...this.status(id),find:result};
  }
  async layoutViewedTab(id,input,signal){
    const state=this.sessions.get(id),viewer=state?.viewers.get(input.actor),target=this.viewerTarget(state,input);
    const valid=()=>!this.closed&&this.enabled&&this.viewerTarget(state,input)&&state.viewers.get(input.actor)===viewer&&state.controlEpoch===input.controlEpoch;
    if(!target||!valid())throw Object.assign(new Error('当前查看的网页已改变'),{code:'VIEW_CHANGED'});
    const views=this.viewsFor(target),browser=views.browser,view=views.views.get(target.id);
    // This is the embedded browser's layout, never a resize of a user's
    // existing desktop Chrome window or a floating observer's thumbnail.
    if(browser!==this.browser&&(!this.pluginBrowserBinding||browser.hub!==this.pluginBrowserBinding.hub))return{layout:'fixed'};
    browser.validateViewport(input.size);
    if(!view||view.closed)throw new Error('当前浏览器画面已断开');
    const records=()=>[...browser.connections.values()].flatMap(connection=>{const record=connection.pages?.get(target.id);return record?[record]:[];});
    const fixed=()=>browser.viewportPresets.has(id)||records().some(record=>record.viewportOverride&&record.viewportMode!=='layout');
    const busy=()=>state.uiAction||state.resuming||state.manualBusy||state.queues.has(target.id)||view.resizing||view.dialog||records().some(record=>record.pendingAction||record.heldButtons?.size||record.heldKeys?.size)||(browser.owners.get(target.id)&&browser.owners.get(target.id).sessionId!==id);
    if(fixed())return{layout:'fixed'};
    if(busy()||view.layoutPending)return{layout:'deferred'};
    if(view.layoutSize?.width===input.size.width&&view.layoutSize?.height===input.size.height&&view.latest?.width===input.size.width&&view.latest?.height===input.size.height)return{layout:'applied'};
    const lifetime=AbortSignal.any([view.lifetime.signal,signal].filter(Boolean)),previous=view.record.viewportOverride?view.layoutSize:null;
    let changed=false;
    const pending=(async()=>{
      view.resizing=true;
      try{
        await Promise.allSettled([view.flushing,...(view.readers??[])]);lifetime.throwIfAborted();
        if(!valid())throw Object.assign(new Error('当前查看的网页已改变'),{code:'VIEW_CHANGED'});
        if(fixed())return{layout:'fixed'};
        if(state.uiAction||state.resuming||state.manualBusy||state.queues.has(target.id)||view.dialog||records().some(record=>record.pendingAction||record.heldButtons?.size||record.heldKeys?.size))return{layout:'deferred'};
        changed=true;await browser.setViewport(view.record,input.size,'layout');lifetime.throwIfAborted();
        if(!valid())throw Object.assign(new Error('当前查看的网页已改变'),{code:'VIEW_CHANGED'});
        view.layoutSize={...input.size};return{layout:'applied'};
      }catch(error){
        if(changed&&!view.closed){if(previous)await browser.setViewport(view.record,previous,'layout');else await browser.resetViewport(view.record);}
        throw error;
      }finally{view.resizing=false;if(!view.closed)views.queueFrame(view,{loaderId:view.loaderId,captureOnly:true});}
    })();
    view.layoutPending=pending;
    try{return await pending;}finally{if(view.layoutPending===pending)view.layoutPending=null;}
  }
  async resizeViewedTab(id,input,signal){
    const state=this.sessions.get(id),viewer=state?.viewers.get(input.actor),target=this.viewerTarget(state,input);
    if(!target)throw new Error('当前画面已改变，请重新选择网页');
    const views=this.viewsFor(target),view=views.views.get(target.id);
    if(!view||view.closed)throw new Error('当前浏览器画面已断开');
    if(input.size!==null)views.browser.validateViewport(input.size);
    await this.userBrowserAction(id,input,async actionSignal=>{
      await view.layoutPending?.catch(()=>{});
      const lifetime=AbortSignal.any([actionSignal,view.lifetime.signal,signal].filter(Boolean));lifetime.throwIfAborted();
      if(state.viewers.get(input.actor)!==viewer||!this.viewerTarget(state,input))throw new Error('当前画面已改变，请重新选择网页');
      if(state.target?.id!==target.id)this.adoptViewedTab(state,target);
      views.browser.claim(id,target.id);
      // The observer owns the override, so ordinary navigation / stopping the
      // model cannot accidentally restore the desktop width underneath it.
      view.resizing=true;
      let previous,previousMode,changed=false;
      try{
        await Promise.allSettled([view.flushing,...(view.readers??[])]);lifetime.throwIfAborted();
        if(state.viewers.get(input.actor)!==viewer||!this.viewerTarget(state,input))throw new Error('当前画面已改变，请重新选择网页');
        previous=view.record.viewportOverride&&view.latest?{width:Math.round(view.latest.width),height:Math.round(view.latest.height)}:null;
        previousMode=view.record.viewportMode;
        changed=true;
        if(input.size===null)await views.browser.resetViewport(view.record);else await views.browser.setViewport(view.record,input.size);
        lifetime.throwIfAborted();
      }catch(error){
        if(lifetime.aborted&&changed){
          try{if(previous)await views.browser.setViewport(view.record,previous,previousMode);else await views.browser.resetViewport(view.record);}
          catch(cleanup){state.stopError={operation:'viewport',message:cleanup.message,at:Date.now()};state.status='error';throw new AggregateError([error,cleanup],'视口恢复失败：'+cleanup.message);}
        }
        throw error;
      }finally{view.resizing=false;views.queueFrame(view,{loaderId:view.loaderId,captureOnly:true});}
    });
    return this.status(id);
  }
  async emulateViewedTab(id,input,signal){
    const state=this.sessions.get(id),viewer=state?.viewers.get(input.actor),target=this.viewerTarget(state,input);
    if(!target)throw new Error('当前画面已改变，请重新选择网页');
    const views=this.viewsFor(target),view=views.views.get(target.id);
    if(!view||view.closed)throw new Error('当前浏览器画面已断开');
    if(input.settings!==null)views.browser.validateEmulation(input.settings);
    await this.userBrowserAction(id,input,async actionSignal=>{
      await view.layoutPending?.catch(()=>{});
      const lifetime=AbortSignal.any([actionSignal,view.lifetime.signal,signal].filter(Boolean));lifetime.throwIfAborted();
      if(state.viewers.get(input.actor)!==viewer||!this.viewerTarget(state,input))throw new Error('当前画面已改变，请重新选择网页');
      if(state.target?.id!==target.id)this.adoptViewedTab(state,target);
      views.browser.claim(id,target.id);view.resizing=true;
      try{
        await Promise.allSettled([view.flushing,...(view.readers??[])]);lifetime.throwIfAborted();
        if(state.viewers.get(input.actor)!==viewer||!this.viewerTarget(state,input))throw new Error('当前画面已改变，请重新选择网页');
        await views.browser.setEmulation(view.record,input.settings,lifetime);
      }catch(error){
        if(error instanceof AggregateError){state.stopError={operation:'emulation',message:error.message,at:Date.now()};state.status='error';}
        throw error;
      }finally{view.resizing=false;views.queueFrame(view,{loaderId:view.loaderId,captureOnly:true});}
    });
    return this.status(id);
  }
  async userBrowserAction(id, input, action, navigation, timeoutMs = 15000) {
    if (!this.enabled) throw new Error('Computer Use 已关闭');
    const state = this.session(id);
    if (state.uiAction || state.resuming) throw new Error('控制权正在切换，请稍后重试');
    if (input.controlEpoch !== state.controlEpoch) throw new Error('控制权已经改变，请根据最新状态重试');
    const controller = new AbortController(); state.uiAction = controller; state.controlEpoch++;
    if (navigation) { controller.navigation = navigation; state.currentNavigation = { ...navigation, epoch: state.controlEpoch }; }
    this.publishControl(state);
    const pending = (async () => {
      await state.manualTail?.catch(() => {});
      const viewed=this.viewerTarget(state,input);if(viewed)await this.viewsFor(viewed).views.get(viewed.id)?.layoutPending?.catch(()=>{});
      await this.stop(id, controller); controller.signal.throwIfAborted();
      if (!this.enabled) throw new Error('Computer Use 已关闭');
      return action(AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]));
    })();
    state.uiActionPending = pending;
    try { return await pending; }
    finally {
      if (state.uiAction === controller) { state.uiAction = null; state.uiActionPending = null; this.publishControl(state); }
    }
  }
  async annotationStylePreview(id,input,signal){
    if(input.textValue!==undefined&&typeof input.textValue!=='string')throw new TypeError('批注新文字必须是字符串');
    if(input.textValue===undefined||input.changes!==undefined&&(!input.changes||typeof input.changes!=='object'||Array.isArray(input.changes)||Object.keys(input.changes).length))styleChanges(input.changes);
    const state=this.sessions.get(id),viewer=state?.viewers.get(input.actor),target=this.viewerTarget(state,input);
    if(viewer?.readOnly||target?.kind!=='tab'||target.id!==input.tabId||viewer?.tabId!==input.tabId)throw new Error('当前画面已改变，请重新打开批注');
    const views=this.viewsFor(target),view=views.views.get(target.id);if(!view||view.closed)throw new Error('当前画面已断开');
    state.stylePreviewActive=true;
    try{
      const result=await this.userBrowserAction(id,input,async actionSignal=>{
        if(state.viewers.get(input.actor)!==viewer||!this.viewerTarget(state,input))throw new Error('当前画面已改变，请重新打开批注');
        if(viewer.independent&&state.target?.id!==target.id)this.adoptViewedTab(state,target);
        if(state.target?.id!==target.id)throw new Error('当前目标已改变');
        views.browser.claim(id,target.id);
        return previewElementStyle(views,view,input,AbortSignal.any([actionSignal,signal].filter(Boolean)));
      });
      return{...result,controlEpoch:state.controlEpoch};
    }catch(error){if(view.stylePreview){state.stopError={operation:'style-preview',message:error.message,at:Date.now()};state.status='error';}throw error;}
    finally{state.stylePreviewActive=false;}
  }
  async navigate(id, input) {
    const state = this.session(id), target = state.previewTargets.get(input.tabId)?.target ?? state.target;
    if (!target || target.kind !== 'tab' || target.id !== input.tabId) throw new Error('操作目标已改变，请根据最新画面重试');
    const operation = input.action ?? 'goto';
    if (!['goto', 'back', 'forward', 'reload'].includes(operation)) throw new Error('未知导航操作');
    const destination = operation === 'goto' ? addressToUrl(input.url) : null;
    let navigation, controlEpoch = input.controlEpoch;
    if (input.navigationClient !== undefined) {
      const client = input.navigationClient, sequence = input.navigationSequence;
      if (typeof client !== 'string' || !/^[\w-]{1,80}$/.test(client) || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error('导航请求标识无效');
      const superseded = () => Object.assign(new Error('这次导航已被更新的操作取消'), { code: 'NAVIGATION_SUPERSEDED' });
      if (input.navigationRevision !== state.navigationRevision) throw superseded();
      if (sequence <= (state.navigationIntents.get(client) ?? 0)) throw superseded();
      const current = state.currentNavigation;
      const ownChain = current?.client === client && current.tabId === target.id && current.revision === state.navigationRevision && current.epoch === state.controlEpoch;
      if (controlEpoch !== state.controlEpoch && !(ownChain && controlEpoch >= current.baseEpoch && controlEpoch <= current.epoch)) throw new Error('控制权已经改变，请根据最新状态重试');
      if (state.resuming || (state.uiAction && state.uiAction.navigation?.client !== client)) throw new Error('控制权正在切换，请稍后重试');
      navigation = { client, sequence, tabId: target.id, revision: state.navigationRevision, baseEpoch: ownChain ? current.baseEpoch : state.controlEpoch };
      state.navigationIntents.set(client, sequence);
      const epoch = state.controlEpoch;
      if (state.uiAction) {
        const previous = state.uiActionPending;
        state.uiAction.abort(superseded());
        await previous?.catch(() => {});
      }
      // Several quick submissions may be waiting for the same cancelled load.
      // Only the latest one can start; a later explicit Stop invalidates all.
      if (state.navigationIntents.get(client) !== sequence || state.navigationRevision !== navigation.revision || state.controlEpoch !== epoch || (state.target?.id !== target.id&&this.viewTarget(state)?.id!==target.id)) throw superseded();
      controlEpoch = state.controlEpoch;
    }
    await this.userBrowserAction(id, { ...input, controlEpoch }, async signal => {
      if(state.target?.id!==target.id)this.adoptViewedTab(state,target);
      if (state.target?.id !== target.id) throw new Error('操作目标已改变，请重试');
      await this.dispatch(id, 'target', [target, operation, destination ? [destination] : []], signal);
    }, navigation);
  }
  async listUserTabs(id) {
    return (await this.userTabInventory(id)).tabs;
  }
  async userTabInventory(id, options) { return readBrowserTabInventory(this,id,options); }
  async transferUserTab(id, input, signal) {
    signal?.throwIfAborted();
    if (this.closed || !this.enabled) throw new Error('Computer Use 已关闭');
    const action = input.action ?? 'detach';
    if (!['detach', 'get', 'focus', 'restore'].includes(action)) throw new TypeError('Invalid browser tab transfer operation');
    if (action !== 'detach' && (typeof input.detachedId !== 'string' || !input.detachedId)) throw new TypeError('The actual detached window identity is required');
    const state = this.session(id), browser = this.browserFor(input.browserId), binding = this.pluginBrowserBinding;
    if (browser.hub !== binding?.hub || input.browserEpoch !== browser.info.epoch
      || !browser.info.capabilities?.includes('browser-detached-window')) throw Object.assign(new Error('浏览器窗口连接已改变'), { code: 'STALE_TARGET' });
    const expected = input.expected;
    if (!expected || typeof expected !== 'object' || Array.isArray(expected)
      || ['title', 'url', 'providerTabId'].some(key => typeof expected[key] !== 'string')) throw new TypeError('The displayed tab identity is required');
    const current = async lifetime => {
      lifetime?.throwIfAborted();
      if (this.closed || !this.enabled || this.pluginBrowserBinding !== binding || input.browserEpoch !== browser.info.epoch) throw Object.assign(new Error('浏览器窗口连接已改变'), { code: 'STALE_TARGET' });
      const tab = (await browser.list(id, { signal: lifetime })).find(tab => tab.id === input.tabId);
      if (!tab || (action === 'detach' ? Boolean(tab.detached) : tab.detached?.id !== input.detachedId) || tab.owner && tab.owner !== id
        || ['title', 'url', 'providerTabId'].some(key => expected[key] !== tab[key])) throw Object.assign(new Error('标签页已改变或由其他会话控制，请重新拖动当前标签页'), { code: 'STALE_TARGET' });
      return tab;
    };
    await current(signal);
    const perform = async actionSignal => {
      const lifetime = AbortSignal.any([actionSignal, signal].filter(Boolean));
      const tab = await current(lifetime);
      await browser.claimTab(id, tab, { signal: lifetime });
      await current(lifetime);
      browser.keepForUser(id, tab.id); state.userTabs.add(tab.id);
      const value = await browser.detachedWindow(id, tab.id, action, action === 'detach' ? {} : { detachedId: input.detachedId }, lifetime, { trustedUserAction: true });
      if (action === 'restore') await browser.list(id, { signal: lifetime });
      return value;
    };
    if (input.controlEpoch !== state.controlEpoch || state.uiAction || state.resuming) throw Object.assign(new Error('控制权已改变，请根据当前标签页重试'), { code: 'CONTROL_CHANGED' });
    const result = await perform(signal);
    return { result, browserId: browser.id, browserEpoch: browser.info.epoch, state: this.status(id) };
  }
  async openBrowserLink(id, input, signal) {
    const state = this.session(id);
    const assertSessionCurrent = (_id, epoch) => !this.closed && this.enabled
      && this.sessions.get(id) === state && state.controlEpoch === epoch && !state.uiAction && !state.resuming;
    const opened = await openCodexOwnedChatBrowserLink(id, input, {
      signal, assertSessionCurrent,
      readPreferences: async () => {
        const browser = await this.ensurePluginBrowser();
        signal?.throwIfAborted();
        return createBrowserProfile(browser).getPreferences({ signal, sessionId: id });
      },
      openInAppBrowser: async (_id, request) => {
        signal?.throwIfAborted();
        await this.changeUserTab(id, { action: 'new', browserId: 'iab', url: request.url, controlEpoch: request.controlEpoch }, signal);
        return { tabId: this.viewTarget(state)?.id };
      },
      openExternalBrowser: async (_id, request) => {
        await this.openExternal(externalWebUrl(request.url), { signal });
        return { opened: true };
      },
    });
    return { ...opened, state: this.status(id) };
  }
  async changeUserTab(id, input, requestSignal) {
    if (!['new', 'select', 'close'].includes(input.action)) throw new Error('未知标签页操作');
    const destination = input.action === 'new' ? addressToUrl(input.url ?? '') : null;
    const browserId = input.browserId ?? this.sessions.get(id)?.target?.browserId ?? 'iab';
    // Launch already has its own bounded budget; do not cancel a cold start
    // before that deadline. Warm navigation keeps the original 15 seconds.
    const cold = input.action === 'new' && ['browser', 'iab', 'desktop-browser'].includes(browserId) && (this.pluginBrowserEnabled ? !this.extensionBrowsers.get('desktop-browser') : !this.browser.run?.ready || this.browser.run?.lost);
    const timeoutMs = 15000 + (cold ? BROWSER_STARTUP_TIMEOUT_MS : 0);
    await this.userBrowserAction(id, input, async actionSignal => {
      const signal = AbortSignal.any([actionSignal, requestSignal].filter(Boolean));
      signal.throwIfAborted();
      const state = this.session(id);
      if (input.action === 'new') {
        const target = await this.dispatch(id, 'createBrowserTab', [browserId, destination], signal);
        state.viewTarget=target;state.viewRevision=(state.viewRevision??0)+1;this.invalidateViewReads(state);
        state.userTabs.add(target.id);
        this.browserForTab(target.id, target.browserId).keepForUser(id, target.id); return;
      }
      const target = await this.dispatch(id, 'getTab', [input.tabId, { browser: this.browserForTab(input.tabId, input.browserId).id, expected: input.expected }], signal);
      state.viewTarget=target;state.viewRevision=(state.viewRevision??0)+1;this.invalidateViewReads(state);
      state.userTabs.delete(target.id); state.userTabs.add(target.id);
      this.browserForTab(target.id, target.browserId).keepForUser(id, target.id);
      if (input.action === 'close') {
        const record = await this.browserForTab(target.id, target.browserId).target(id, target.id);
        signal.throwIfAborted();
        state.closingTabs.set(target.id, record.page);
        // Keep a page with a beforeunload prompt selected until the user has
        // answered. Actual closure is observed through onTabClosed.
        let closed, dialog;
        const outcome = new Promise(resolve => {
          closed = () => resolve('closed'); dialog = () => resolve('dialog');
          record.page.once('close', closed); record.page.once('dialog', dialog);
        });
        try {
          await record.page.close({ runBeforeUnload: true });
          const result = await outcome; signal.throwIfAborted();
          if (result === 'closed') { state.closingTabs.delete(target.id); this.setTarget(state, null); await this.selectPreviousUserTab(id, signal); }
        } finally { record.page.off('close', closed); record.page.off('dialog', dialog); }
      }
    }, undefined, timeoutMs);
  }
  viewTarget(state){
    return state?.viewTarget&&state.previewTargets.has(state.viewTarget.id)?state.viewTarget:state?.target??null;
  }
  viewerTarget(state,input){
    const viewer=state?.viewers.get(input.actor),target=viewer?.independent?state.previewTargets.get(viewer.tabId)?.target:state?.target;
    return viewer&&!viewer.readOnly&&viewer.tabId===input.tabId&&target?.kind==='tab'&&target.id===input.tabId?target:null;
  }
  adoptViewedTab(state,target){
    const browser=this.browserForTab(target.id,target.browserId),owner=browser.owners.get(target.id);
    if(state.previewTargets.get(target.id)?.target?.browserId!==target.browserId||!browser.records.has(target.id)||owner&&owner.sessionId!==state.id)throw new Error('查看的网页已改变，请重新选择');
    browser.claim(state.id,target.id);
    state.viewTarget=target;
    this.setTarget(state,target);
  }
  async viewTab(id,input){
    if(this.closed||!this.enabled)throw new Error('Computer Use 已关闭');
    const state=this.session(id),revision=state.viewRevision=(state.viewRevision??0)+1;
    if(input.current===true){state.viewTarget=null;this.invalidateViewReads(state);return this.status(id);}
    const tab=(await this.listUserTabs(id)).find(tab=>tab.id===input.tabId&&(!input.browserId||tab.browserId===input.browserId));
    if(this.closed||!this.enabled)throw new Error('Computer Use 已关闭');
    if(revision!==state.viewRevision)return this.status(id);
    if(!tab||!tab.available)throw new Error('这个标签页已关闭或正在被其他对话使用');
    const browser=this.browserForTab(tab.id,tab.browserId);
    // Validate/reconnect through the inventory observer, never the model's
    // channel. This also permits recovery after the extension ends control.
    await browser.target('ui-tabs',tab.id,{claim:false,signal:AbortSignal.timeout(10000)});
    if(this.closed||!this.enabled)throw new Error('Computer Use 已关闭');
    if(revision!==state.viewRevision)return this.status(id);
    if(!browser.records.has(tab.id))throw new Error('这个标签页已关闭');
    browser.claim(id,tab.id);browser.keepForUser(id,tab.id);state.userTabs.delete(tab.id);state.userTabs.add(tab.id);
    state.viewTarget={...tab,kind:'tab'};state.previewTargets.set(tab.id,{target:state.viewTarget});
    this.invalidateViewReads(state);
    if(!state.target&&state.browserError){state.browserError=null;if(!state.stopError)state.status=state.stopped?'stopped':'idle';}
    return this.status(id);
  }
  async openViewedExternally(id,input,signal){
    if(this.closed||!this.enabled)throw new Error('Computer Use 已关闭');
    signal?.throwIfAborted();
    const state=this.sessions.get(id),target=state?.previewTargets.get(input.tabId)?.target;
    if(target?.kind!=='tab'||target.id!==input.tabId)throw new Error('当前查看的网页已改变，请重试');
    const browser=this.browserForTab(target.id,target.browserId),record=browser.records.get(target.id),owner=browser.owners.get(target.id);
    if(!record||owner&&owner.sessionId!==id)throw new Error('这个标签页已关闭或正在被其他对话使用');
    const url=externalWebUrl(record.url);
    if(externalWebUrl(input.expectedUrl)!==url)throw new Error('页面地址已改变，请根据最新地址重试');
    await this.openExternal(url,{signal});
    return this.status(id);
  }
  async selectPreviousUserTab(id, signal) {
    const state = this.session(id), tabs = await this.listUserTabs(id);
    const available = tabs.filter(tab => tab.available && state.userTabs.has(tab.id));
    const previous = [...state.userTabs].reverse().find(tabId => available.some(tab => tab.id === tabId));
    if (previous) await this.dispatch(id, 'getTab', [previous, { browser: this.browserForTab(previous).id }], signal);
    state.viewTarget=state.target;state.viewRevision=(state.viewRevision??0)+1;this.invalidateViewReads(state);
    for (const tabId of state.userTabs) if (!tabs.some(tab => tab.id === tabId)) state.userTabs.delete(tabId);
  }
  async releaseManualInput(id) {
    const state = this.sessions.get(id); if (!state?.manualActor) return;
    const actor = state.manualActor;
    const results = await Promise.allSettled(this.browsers().map(async browser => {
      const pending = browser.connections.get(id), connection = pending ? await pending.catch(() => null) : null;
      if (connection) await Promise.all([...connection.pages.values()].map(record => browser.releaseInput(record)));
    }));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) {
      const error = new AggregateError(errors, 'Input release failed: ' + errors.map(error => error.message).join('; '));
      state.stopError = { operation: 'release', message: error.message, at: Date.now() }; state.status = 'error'; throw error;
    }
    if (state.manualActor === actor) state.manualActor = null;
  }
  async reset(id) { await this.session(id).runtime.reset(); }
  beginTurn(id,turnNumber){
    if(!Number.isSafeInteger(turnNumber)||turnNumber<=0)throw new TypeError('Computer Use requires an actual DSH turn number');
    const state=this.session(id);state.currentTurnID=String(turnNumber);state.turnEnded=false;this.ensureNativePresentation(state);this.publishControl(state);
  }
  async endTurn(id,turnNumber,reason) {
    const state = this.sessions.get(id); if (!state) return;
    const turnID=Number.isSafeInteger(turnNumber)&&turnNumber>0?String(turnNumber):state.currentTurnID;
    if(turnNumber!==undefined&&state.currentTurnID&&turnID!==state.currentTurnID)return;
    await Promise.allSettled([...(state.nativePresentationPending??[])]);
    if(turnNumber!==undefined&&state.currentTurnID&&turnID!==state.currentTurnID)return;
    if(turnID&&this.presentationBinding)await this.presentationBinding.presentations.completeTurn(id,turnID,reason);
    if(turnID)await this.native.endPresentationTurn?.(id,turnID);
    // Keep the last observed location in the preview while releasing control.
    // A turn boundary still rejects delayed input observations from that turn.
    state.pointerAfter = performance.now();
    state.cursorRetained = !!state.pointer;
    this.nativeViews.retainCursor(id);
    if (!state.ending) state.ending = Promise.allSettled([Promise.all(this.browsers().map(async browser => {
      if (!this.closed && !browser.run?.lost && !browser.closing) await browser.setAgentActivity?.(id, false);
      if (!(state.stopped && state.viewers.size)) await browser.endTurn(id);
    })), this.native.release(id)]).then(results=>{
      const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);
      if(errors.length){const error=new AggregateError(errors,'Turn cleanup failed: '+errors.map(error=>error.message).join('; '));state.stopped=true;state.status='error';state.stopError={operation:'endTurn',message:error.message,at:Date.now()};this.publishControl(state);throw error;}
      state.turnEnded = true;
      this.publishControl(state);
    }).finally(() => { state.ending = null; });
    await state.ending;
  }
  status(id) {
    const state = this.sessions.get(id);
    const browsers = this.browsers();
    const describe = target => {
      if (target?.kind !== 'tab') return target ?? null;
      const browser = browsers.find(browser => browser.records.has(target.id));
      return { ...target, ...browser?.records.get(target.id),
        ...(browser ? { browserId: browser.id, browserEpoch: browser.info?.epoch ?? browser.run?.id } : {}) };
    };
    const target = describe(state?.target);
    const viewed = this.viewTarget(state), viewTarget = describe(viewed);
    const view=viewed?.kind==='tab'?(this.browserViews.views.get(viewed.id)??[...this.extensionViews.values()].map(views=>views.views.get(viewed.id)).find(Boolean)):null;
    const ownedPluginView=!!this.pluginBrowserBinding&&browsers.some(browser=>browser.hub===this.pluginBrowserBinding.hub&&browser.records.has(viewed?.id));
    const viewViewport=view?{overridden:!!view.record?.viewportOverride&&view.record.viewportMode!=='layout',layoutSupported:this.browserViews.views.get(viewed.id)===view||ownedPluginView,width:view.latest?.width,height:view.latest?.height}:null;
    const simulated=viewed?.kind==='tab'?browsers.find(browser=>browser.id===viewed.browserId||browser.records.has(viewed.id))?.emulationSettings(viewed.id):null;
    const viewEmulation=simulated?{settings:{...simulated}}:null;
    const nativePresentation=this.presentationBinding?.presentations.snapshot(id);
    return {
      ...(nativePresentation?.nativePresentationLayout ? { nativePresentationLayout: nativePresentation.nativePresentationLayout } : {}),
      nativePresentation: nativePresentation ?? null,
      nativePresentationError: state?.nativePresentationError ?? this.nativePresentationError ?? null,
      viewEmulation, presentationRequest: state?.presentationRequest ?? null, observedAt: performance.now(),
      enabled: !this.closed && this.enabled, nativeInstalled: this.native.available(), stopped: state?.stopped === true,
      browserUseActive:this.browserAgentActive(state),
      status: state?.browserError && !target ? 'error' : state?.status ?? 'idle', target, viewTarget, viewViewport,
      viewRevision: state?.viewRevision ?? 0, previewTargets: [...(state?.previewTargets?.values() ?? [])].map(({ target }) => describe(target)),
      controlEpoch: state?.controlEpoch ?? 0, navigationRevision: state?.navigationRevision ?? 0,
      transitioning: !!state?.uiAction || state?.resuming === true, resuming: state?.resuming === true,
      operation: state?.operation ?? null, lastError: state?.stopError ?? state?.browserError ?? state?.lastError ?? null,
      startedAt: state?.startedAt ?? null, previewAt: this.preview.get(id)?.at ?? null, history: state?.history ?? [],
      operationStats: state ? structuredClone(state.operationStats) : { total: 0, succeeded: 0, failed: 0, cancelled: 0, methods: {} },
    };
  }
  async nativePresentationAction(id, input) {
    if (this.closed || !this.enabled) throw new Error('Computer Use is disabled');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('A native presentation action is required');
    const state = this.session(id), presentations = await this.nativePresentations();
    if (input.action === 'owner') return this.presentationBinding.provider.request('nativePresentation.owner', {});
    const retiringDOM = input.action === 'dom-home' && input.domHome?.available === false;
    if (!retiringDOM && input.controlEpoch !== state.controlEpoch) throw Object.assign(new Error('The conversation control state changed'), { code: 'CONTROL_CHANGED' });
    let result;
    switch (input.action) {
      case 'configure': case 'configureHost':
        if (input.layout?.activeThreadID !== null && input.layout?.activeThreadID !== id) throw new Error('The native layout belongs to another conversation');
        result = await presentations.configureHost({ host: input.host, layout: input.layout }); break;
      case 'dom-home': result = await presentations.configureDOMHome(id, input.domHome); break;
      case 'ready': result = await presentations.setVideoReady(id, input.ready); break;
      case 'interact': result = await presentations.interact(id, input.presentationID, input.isLead); break;
      case 'hide': result = await presentations.hideTask(id); break;
      case 'show': result = await presentations.showTask(id); break;
      case 'hide-all': result = await presentations.hideAll([...this.sessions.keys()]); break;
      default: throw Object.assign(new Error('Unknown native presentation action'), { code: 'UNSUPPORTED_OPERATION' });
    }
    return { result, state: this.status(id) };
  }
  async watchNativeVideo(id, send, signal) {
    signal?.throwIfAborted();
    this.session(id);
    const presentations = await this.nativePresentations();
    signal?.throwIfAborted();
    return presentations.subscribeVideo(id, frame => send('native-video', frame), signal);
  }
  async revealPreview(id,input){
    if(!this.enabled||this.closed)throw new Error('Computer Use 已关闭');
    const state=this.session(id),entry=state.previewTargets.get(input.targetId);
    if(!entry)throw new Error('该预览已失效，请重新选择目标');
    if(entry.target.kind==='app')await this.native.revealWindow(entry.native);
    else{
      const browser=this.browserForTab(entry.target.id,entry.target.browserId);
      await this.changeUserTab(id,{action:'select',tabId:entry.target.id,browserId:entry.target.browserId,controlEpoch:input.controlEpoch});
      if(browser!==this.browser||!browser.headless){const record=await browser.target(id,entry.target.id);await record.cdp.send('Page.bringToFront');}
    }
    return this.status(id);
  }
  async setupStatus() {
    await this.extensionReady;
    const ownBrowser = this.extensionBrowsers.get('desktop-browser');
    const browser = { installed: null, name: this.pluginBrowserEnabled ? 'OpenCU Browser' : 'Chrome / Chromium', path: null,
      running: this.pluginBrowserEnabled ? !!ownBrowser && !ownBrowser.run.lost && !ownBrowser.closing : !!this.browser.endpoint && !this.browser.closing };
    try {
      const executable = this.pluginBrowserEnabled ? await getPluginRuntimeExecutable() : this.browser.runtimePath ?? browserExecutablePath(this.browser.executablePath);
      Object.assign(browser, { installed: existsSync(executable), name: this.pluginBrowserEnabled ? 'OpenCU Browser' : executable.includes('ms-playwright') ? 'Chromium · Playwright 固定版本' : 'Chrome / Chromium', path: executable });
    } catch (error) { browser.installed = false; browser.error = error.message; }
    const native = { platform: this.native.platform ?? process.platform, bridge: !!this.native.bridge, external: !!this.native.externalBinary, supported: this.native.supported(), installed: null, installing: !!this.native.installing, removing: !!this.native.removing, removable: typeof this.native.uninstall === 'function' && !this.native.externalBinary, accessibility: null, screenRecording: null };
    try {
      native.installed = this.native.available();
      if (native.installed) {
        Object.assign(native, await this.native.installationStatus());
        const permissions = await this.native.permissions('ui-permissions');
        if (permissions.platform === 'win32') { native.interactive = permissions.interactive; native.captureSupported = permissions.capture_supported; }
        else { native.accessibility = permissions.accessibility; native.screenRecording = permissions.screen_recording; native.screenLock = permissions.screen_lock??null; }
      }
    } catch (error) { native.error = error.message; if (native.platform === 'win32') native.repairRequired = true; }
    if (native.platform === 'darwin') {
      try { native.screenLockInstallation = { ...await (await this.screenLockController()).status(), busy: !!this.screenLockSetup }; }
      catch (error) { native.screenLockInstallation = { installed: null, available: false, busy: !!this.screenLockSetup, error: error.message }; }
    }
    const browsers = this.extensionHub.list();
    let installation;
    try { installation = await this.extensionInstaller.status(browsers); }
    catch (error) {
      // Unknown is not uninstalled. Retain successful checks and live connections.
      installation = { supported: this.extensionInstaller.supported(), platform: this.extensionInstaller.platform,
        preparing: !!this.extensionInstaller.preparing, prepared: null, error: error.message,
        extensionPath: this.extensionInstaller.extensionPath, browserProfile: this.extensionInstaller.profile };
    }
    const desktopBrowser = { available: !!ownBrowser && !ownBrowser.run.lost && !ownBrowser.closing, owner: 'opencu-plugin', embeddedInDsh: false,
      ...(ownBrowser ? { id: ownBrowser.id, name: ownBrowser.info.name, capabilities: [...ownBrowser.info.capabilities] } : {}),
      error: this.pluginBrowserError?.message ?? null };
    return { browser, desktopBrowser, plugin: pluginCapabilities(), extension: { ready: !!this.extensionHub.server && !this.extensionHub.server.failure, browsers,
      error: [this.extensionError ?? this.extensionHub.server?.failure?.message, installation.error].filter(Boolean).join('；') || null, installation }, native };
  }
  async installExtension({ takeover = true } = {}) {
    return this.configureExtension('install', async () => {
    await this.extensionInstaller.prepare({ takeover });
    if (this.closed) throw new Error('当前应用已关闭，请重新启动后连接 Chrome');
    const command = this.extensionInstaller.windows ? (await this.extensionInstaller.windows.command()).command : null;
    if (this.ownsExtensionHub && (!this.extensionHub.server || this.extensionHub.server.failure || (command && command !== this.extensionHub.server.command))) {
      await this.extensionHub.close();
      await this.extensionHub.start(); this.extensionError = null;
    }
    });
  }
  async installBrowser({ signal } = {}) {
    if (this.closed) throw new Error('当前应用已关闭');
    this.browserInstallController ??= new AbortController();
    return this.browserInstalling ??= (this.pluginBrowserEnabled ? preparePluginRuntime() : installBrowser({ executablePath: this.browser.executablePath, signal: signal ? AbortSignal.any([signal, this.browserInstallController.signal]) : this.browserInstallController.signal }))
      .finally(() => { this.browserInstalling = null; });
  }
  async removeExtension() {
    return this.configureExtension('remove', async () => {
    await this.extensionReady;
    const extensions = [...this.extensionBrowsers.values()].filter(browser => browser.hub === this.extensionHub);
    const extensionIds = new Set(extensions.map(browser => browser.id));
    const views = extensions.map(browser => this.extensionViews.get(browser)).filter(Boolean);
    for (const browser of extensions) browser.closing = true;
    for (const state of this.sessions.values()) if (state.target?.kind === 'tab' && extensionIds.has(state.target.browserId)) await this.stop(state.id);
    // Just like plugin disposal, never cut the last CDP connection before an
    // uncertain temporary page style has actually been restored.
    await Promise.all(views.flatMap(group => [...group.views.values()].map(async view => {await clearSiteAnnotationFeaturePreview(view);await restoreStylePreview(view);await restoreAnnotationLiveEditor(view);} )));
    for (const group of views) await group.close();
    for (const browser of extensions) { await browser.close(); browser.invalidate(); }
    if (this.ownsExtensionHub) await this.extensionHub.close();
    await this.extensionInstaller.unregister(); this.extensionError = null;
    });
  }
  async configureExtension(action, work) {
    if (this.closed) throw new Error('当前应用已关闭');
    if (this.extensionSetup) {
      if (this.extensionSetup.action !== action) throw new Error('Chrome 连接正在配置，请等待当前操作完成');
      return this.extensionSetup.promise;
    }
    const operation = { action };
    operation.promise = Promise.resolve().then(work).finally(() => { if (this.extensionSetup === operation) this.extensionSetup = null; });
    this.extensionSetup = operation; return operation.promise;
  }
  async installNative() {
    if (this.screenLockSetup) throw new Error('Screen-lock system configuration is in progress');
    await this.screenLockAuthorization?.close(); this.screenLockAuthorization = null;
    await this.native.install({ beforeReplace: () => this.prepareNativeChange('update') });
  }
  async screenLockController() {
    if ((this.native.platform ?? process.platform) !== 'darwin') throw new Error('Screen-lock authorization is only available on macOS');
    if (this.screenLockAuthorization) return this.screenLockAuthorization;
    const suffix = '/Contents/MacOS/trisoul-computer-use';
    if (!this.native.binary?.endsWith('.app' + suffix)) throw new Error('The configured native helper is not an OpenCU application bundle');
    const { ScreenUnlockProviderAuthorization } = await import('../../scripts/screen-lock-provider-authorize.mjs');
    return this.screenLockAuthorization ??= new ScreenUnlockProviderAuthorization({
      helperApp: this.native.binary.slice(0, -suffix.length), directory: join(this.directory, 'screen-unlock-installer'),
    });
  }
  async configureScreenLock(operation) {
    if (this.closed || !this.enabled) throw new Error('Computer Use is disabled');
    if (!['install', 'uninstall', 'recover'].includes(operation)) throw new TypeError('Invalid screen-lock setup operation');
    if (this.screenLockSetup || this.native.installing || this.native.removing) throw new Error('Desktop system configuration is already in progress');
    const work = (async () => {
      const installed = await this.native.installedInfo(), expected = await this.native.expectedBuild();
      if (!installed || installed.build !== expected.build) throw Object.assign(new Error('Install the current desktop control helper before configuring screen-lock access'), { code: 'NATIVE_UPDATE_REQUIRED' });
      const controller = await this.screenLockController();
      return controller.authorizeFromUserClick(operation, { userInitiated: true,
        beforeSystemChange: async () => {
          await this.prepareNativeChange('update');
          await Promise.all([...this.native.connections.keys()].map(id => this.native.release(id)));
          await this.native.stopDaemon();
        }, afterSystemChange: async () => { if (!this.closed) await this.native.launch(); },
      });
    })();
    this.screenLockSetup = work;
    try { return await work; }
    finally { if (this.screenLockSetup === work) this.screenLockSetup = null; }
  }
  async removeNative() {
    if (this.closed || !this.enabled) throw new Error('Computer Use is disabled');
    if (this.screenLockSetup || this.native.installing || this.native.removing) throw new Error('Desktop system configuration is already in progress');
    if (typeof this.native.uninstall !== 'function') throw new Error('当前平台尚未提供桌面运行时卸载');
    const beforeRemove = async () => {
      if ((this.native.platform ?? process.platform) === 'darwin') {
        const status = await (await this.screenLockController()).status();
        if (status.installed === true || status.registered === true || status.transaction || status.recoveryRequired) {
          throw Object.assign(new Error('请先移除锁屏组件并恢复系统登录配置，再移除桌面控制程序'), { code: 'SCREEN_UNLOCK_PROVIDER_INSTALLED' });
        }
        if (status.installed !== false || status.error) {
          throw Object.assign(new Error('无法确认锁屏系统配置已移除；请重新检查设置后再卸载桌面控制程序'), { code: 'SCREEN_UNLOCK_STATUS_UNAVAILABLE' });
        }
      }
      await this.screenLockAuthorization?.close(); this.screenLockAuthorization = null;
      await this.prepareNativeChange('remove');
    };
    return this.native.uninstall({ beforeRemove });
  }
  async prepareNativeChange(action) {
      await this.closeNativePresentations();
      const message = action === 'remove' ? '桌面控制正在移除；重新安装后可再次选择应用' : '桌面控制正在更新，完成后请重新选择应用';
      const ids=new Set([...this.native.targets.values()].map(target=>target.sessionId));
      for(const state of this.sessions.values())if(state.target?.kind==='app')ids.add(state.id);
      for(const view of this.nativeViews.views.values())this.nativeViews.publish(view,'closed',{reason:'runtime-'+action,message});
      await this.nativeViews.close();
      for(const id of ids){
        const state=this.sessions.get(id);if(!state)continue;
        for(const [key,entry]of state.previewTargets)if(entry.target.kind==='app')state.previewTargets.delete(key);
        await state.runtime.stop(new Error(message));
        this.clearPointer(state);
        if(state.target?.kind==='app'){state.target=null;state.nativeTarget=null;this.preview.delete(id);}
        state.status=state.stopped?'stopped':'idle';this.publishControl(state);
      }
  }
  async close() {
    this.closed = true;
    await this.screenLockSetup?.catch(() => {});
    await this.screenLockAuthorization?.close();
    for (const state of this.sessions.values()) this.invalidateViewReads(state);
    const preliminaryErrors = [];
    try { await this.siteAnnotationRequests.close(); }
    catch (error) { preliminaryErrors.push(error); }
    try { await this.tabDragPreviews.dispose(); }
    catch (error) { preliminaryErrors.push(error); }
    try { await this.closeNativePresentations(); }
    catch (error) { preliminaryErrors.push(error); }
    this.browserInstallController?.abort(new Error('当前应用已关闭'));
    await this.browserInstalling?.catch(() => {});
    await this.extensionSetup?.promise.catch(() => {});
    for (const state of this.sessions.values()) state.uiAction?.abort(new Error('Computer Use plugin unloaded'));
    const stopping = [this.stopSharing(), ...[...this.sessions.values()].map(async state => { await state.runtime.stop(new Error('Computer Use plugin unloaded')); await state.uiActionPending?.catch(() => {}); })];
    const stopped=Promise.allSettled(stopping);
    // Keep the observation connection until temporary page styles are restored.
    // Other teardown retains its existing concurrent dialog handling.
    await Promise.allSettled([...this.sessions.values()].filter(state=>state.stylePreviewActive).map(state=>state.uiActionPending));
    await Promise.all([this.browserViews,...this.extensionViews.values()].flatMap(views=>[...views.views.values()].map(async view=>{await clearSiteAnnotationFeaturePreview(view);await restoreStylePreview(view);await restoreAnnotationLiveEditor(view);} )));
    await this.siteAnnotationSettings.pending;
    // A webpage dialog must not hold plugin unloading hostage. Terminating our
    // owned browser also settles renderer commands waiting behind that dialog.
    await this.extensionReady;
    await this.pluginBrowserStarting?.catch(() => {});
    try { await this.browserAuth.dispose(); } catch (error) { preliminaryErrors.push(error); }
    if (this.pluginBrowserBinding) {
      try { await this.pluginBrowserBinding.provider.close(); }
      catch (error) { preliminaryErrors.push(error); }
    }
    const cleanup = await Promise.allSettled([this.nativeViews.close(),this.browserViews.close(), ...[...this.extensionViews.values()].map(views => views.close()), ...this.browsers().map(browser => browser.close()), ...[...this.retiredExtensions].map(browser => browser.close())]);
    const errors = [...preliminaryErrors, ...[...cleanup, ...await stopped].filter(result => result.status === 'rejected').map(result => result.reason)];
    try { await this.native.close(); } catch (error) { errors.push(error); }
    try { await this.filePolicy?.close(); } catch (error) { errors.push(error); }
    // Failed external-tab restoration retains its gateway and browser leases
    // for a later close. Destroying the hub here would make retry impossible.
    if (errors.length) throw new AggregateError(errors, 'Computer Use cleanup failed; retained resources require another close attempt: ' + errors.map(error => error.message).join('; '));
    if (this.pluginBrowserBinding) { await this.pluginBrowserBinding.hub.close(); this.pluginBrowserBinding = null; }
    this.extensionHub.off('connected', this.extensionConnected);
    if (this.ownsExtensionHub) await this.extensionHub.close();
    this.sessions.clear(); this.preview.clear();
  }
}
