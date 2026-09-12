import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BrowserHost, browserExecutablePath } from './browser.mjs';
import { NativeHost } from './native.mjs';
import { WindowsNativeHost } from './windows-native.mjs';
import { NativeViews } from './native-view.mjs';
import { ComputerRuntime } from './runtime.mjs';
import { BrowserViews } from './browser-view.mjs';
import { addressToUrl } from './navigation.mjs';
import { ExtensionHub, extensionSocketPath } from './extension-hub.mjs';
import { ExtensionBrowser } from './extension-browser.mjs';
import { ExtensionInstaller } from './extension-install.mjs';
import { mapImagePoints, imageFrameFor } from './image-coordinates.mjs';
import { captureAnnotation } from './browser-annotation.mjs';
import { previewElementStyle, restoreStylePreview, styleChanges } from './browser-style-preview.mjs';

export class ComputerUseManager {
  constructor(directory, options = {}) {
    mkdirSync(directory, { recursive: true, mode: 0o700 }); this.directory = directory;
    const callbacks = { wantsPointer: (id, tabId) => !!this.pointerActive(id, tabId), onPointer: event => this.pointer(event), onTabClosed: tabId => {
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
    this.browser = new BrowserHost(join(directory, 'browser-profile'), { ...options.browser, ...callbacks });
    this.browserViews = new BrowserViews(this.browser);
    this.native = process.platform === 'win32' ? new WindowsNativeHost(directory, options.native) : new NativeHost(directory, options.native);
    this.nativeViews = new NativeViews(this.native);
    this.sessions = new Map(); this.preview = new Map(); this.sharing = new Map(); this.closed = false; this.enabled = options.enabled !== false;
    this.extensionBrowsers = new Map(); this.extensionViews = new Map(); this.retiredExtensions = new Set();
    this.extensionInstaller = new ExtensionInstaller(directory, options.extensionHub?.socketPath ?? extensionSocketPath(directory), options.extension);
    this.extensionHub = options.extensionHub ?? new ExtensionHub(this.extensionInstaller.socketPath, { windowsRuntime: this.extensionInstaller.windows });
    this.ownsExtensionHub = !options.extensionHub;
    this.extensionConnected = info => {
      const previous = this.extensionBrowsers.get(info.id);
      if (previous?.info.epoch === info.epoch) return;
      if (previous) { this.retiredExtensions.add(previous); void previous.close().catch(() => {}); }
      this.extensionBrowsers.set(info.id, new ExtensionBrowser(this.extensionHub, info, callbacks));
    };
    this.extensionHub.on('connected', this.extensionConnected);
    this.extensionReady = (this.ownsExtensionHub ? this.extensionHub.start() : Promise.resolve()).then(() => { for (const info of this.extensionHub.list()) this.extensionConnected(info); }).catch(error => { this.extensionError = error.message; });
  }
  async setEnabled(enabled) {
    const changed = this.enabled !== enabled; this.enabled = enabled;
    if (enabled || !changed) { if (this.disabling) await this.disabling; return; }
    const pending = Promise.allSettled([this.stopSharing(), ...[...this.sessions.values()].map(async state => {
      state.controlEpoch++;
      this.publishControl(state);
      state.uiAction?.abort(new Error('Computer Use disabled in settings'));
      try { await state.runtime.stop(new Error('Computer Use disabled in settings')); await state.uiActionPending?.catch(() => {}); state.status = state.stopped ? 'stopped' : 'idle'; }
      catch (error) { state.status = 'error'; state.stopError = { operation: 'disable', message: error.message, at: Date.now() }; throw error; }
    })]).then(results => {
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
        onStop: async () => {
          const results = await Promise.allSettled([...this.browsers().map(browser => browser.disconnect(id)), this.native.release(id)]);
          const failures = results.filter(r => r.status === 'rejected').map(r => r.reason);
          if (failures.length) throw new AggregateError(failures, 'Stop cleanup failed: ' + failures.map(e => e.message).join('; '));
        },
      });
      this.sessions.set(id, state);
    }
    return this.sessions.get(id);
  }
  async readWindowShare(window, signal) {
    if (this.closed || !this.enabled) throw new Error('Computer Use 已关闭');
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
  browsers() { return [this.browser, ...this.extensionBrowsers.values()]; }
  browserFor(value) {
    if (!value || value === 'browser' || value === 'iab') return this.browser;
    let browser = this.extensionBrowsers.get(value);
    if (!browser && /^(chrome|edge)$/i.test(value)) {
      const matches = [...this.extensionBrowsers.values()].filter(backend => !backend.run.lost && backend.info.name.toLowerCase() === value.toLowerCase());
      if (matches.length > 1) throw new Error('Several browser profiles are connected. Use cua.listBrowsers() and select its exact id.');
      browser = matches[0];
    }
    if (!browser || browser.run.lost) throw new Error('The requested browser is not connected. Use cua.listBrowsers() to select an available browser.');
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
    if (!this.extensionViews.has(browser)) this.extensionViews.set(browser, new BrowserViews(browser));
    return this.extensionViews.get(browser);
  }
  browserInfo(browser) {
    return browser === this.browser ? { id: 'browser', name: 'Oh My DSH Browser', type: 'managed', profile: 'Computer Use' } : { ...browser.info };
  }
  setTarget(state, target) {
    const previous = state.target; state.target = target;
    const nativeTarget=target?.kind==='app'?this.native.targets.get(target.id):null;
    if(nativeTarget){const {id,viewId,pid,windowId,processIdentity,bundleId,name,sessionId}=nativeTarget;state.nativeTarget={id,viewId,pid,windowId,processIdentity,bundleId,name,sessionId};}
    else if(target?.kind!=='app'||state.nativeTarget?.id!==target.id)state.nativeTarget=null;
    if(target){state.previewTargets??=new Map();state.previewTargets.set(target.viewId??target.id,{target:{...target},native:state.nativeTarget});}
    if (target) { state.browserError = null; state.browserRun = target.kind === 'tab' ? this.browserForTab(target.id, target.browserId).run?.id : null; }
    if (previous?.id !== target?.id) {
      this.clearPointer(state);
      this.preview.delete(state.id);
      const viewId=target?.kind==='app'?target.viewId:target?.id;
      for (const viewer of state.viewers.values()) if (!viewer.stacked&&(viewer.tabId??viewer.targetId) !== viewId) {
        try { viewer.send('closed', { reason: 'target-changed', message: '当前操作目标已改变' }); } catch {}
      }
      const view=previous?.kind==='app'&&previous.viewId!==viewId&&this.nativeViews.views.get(previous.viewId);if(view&&![...state.viewers.values()].some(v=>v.stacked&&v.targetId===previous.viewId))void this.nativeViews.stop(view).catch(()=>{});
    }
    return target;
  }
  async dispatch(id, method, args = [], signal, coordinateFrames) {
    if (!this.enabled) throw new Error('Computer Use is disabled in settings.');
    await this.extensionReady;
    const session = this.session(id); signal?.throwIfAborted();
    if (session.ending) { await session.ending; signal?.throwIfAborted(); }
    if (method === 'listBrowsers') return this.browsers().filter(browser => !browser.run?.lost).map(browser => this.browserInfo(browser));
    if(method==='browserViewport'){await this.browserFor(args[0]).browserViewport(id,args[1],signal);return null;}
    if (method === 'getBrowser') {
      const browser = this.browserFor(args[0]?.id);
      return { ...this.browserInfo(browser), capabilities: ['accessibility', 'screenshots', 'playwright', 'dialogs', 'viewport', ...(browser === this.browser ? ['files'] : [])] };
    }
    if (method === 'listApps') return this.native.available() ? this.native.list(id) : [];
    if (method === 'listTabs') return this.browserFor(args[0]?.browser).list(id, { signal });
    if (method === 'getState') {
      const backends = this.browsers().filter(browser => !browser.run?.lost);
      const [apps, ...tabs] = await Promise.allSettled([this.native.available() ? this.native.list(id) : Promise.resolve([]), ...backends.map(browser => browser.list(id, { signal }))]);
      return { apps: apps.status === 'fulfilled' ? apps.value : [], browsers: backends.map((browser, index) => ({ ...this.browserInfo(browser), tabs: tabs[index].status === 'fulfilled' ? tabs[index].value : [] })), errors: [apps, ...tabs].filter(result => result.status === 'rejected').map(result => result.reason.message), nativeInstalled: this.native.available() };
    }
    if (method === 'createBrowserTab') {
      const tab = await this.browserFor(args[0]).create(id, args[1], signal); return this.setTarget(session, { ...tab, kind: 'tab' });
    }
    if (method === 'getTab') {
      const browser = this.browserFor(args[1]?.browser), tab = (await browser.list(id, { signal })).find(t => t.id === args[0]);
      if (!tab) throw new Error('That tab no longer exists. List tabs again.');
      const expected = args[1]?.expected;
      if (expected && (expected.url !== tab.url || expected.title !== tab.title)) throw new Error('The referenced tab changed. Inspect the current tab identity before claiming it.');
      await browser.target(id, tab.id, { signal }); signal?.throwIfAborted(); return this.setTarget(session, { ...tab, kind: 'tab' });
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
        if (target.kind === 'tab') { await this.browserForTab(target.id, target.browserId).target(id, target.id, { signal }); signal?.throwIfAborted(); }
        this.setTarget(session, target); session.operation = operation;
        const result = await (target.kind === 'tab' ? this.browserForTab(target.id, target.browserId).invoke(id, target.id, operation, parameters, signal, imageFrameFor(coordinateFrames, target)?.geometry) : this.native.invoke(id, target.id, operation, parameters, signal));
        session.lastError = null;
        if (target.kind === 'tab' && result?.screenshot) {
          const owner = this.browserForTab(target.id, target.browserId).owners.get(target.id);
          if (owner?.created && !owner.keep) result.retention = 'temporary';
        }
        if (result?.screenshot && session.target?.kind === target.kind && session.target?.id === target.id) this.preview.set(id, { target, data: result.screenshot, at: Date.now() });
        const artifactPath = operation === 'content.export' && typeof result === 'string' ? result : operation === 'pageAssets.bundle' ? result?.manifestPath : undefined;
        this.recordOperation(session, { target: target.id, kind: target.kind, operation, elapsedMs: Math.round(performance.now() - started), at: Date.now(), ok: true, ...(artifactPath ? { artifactPath } : {}) });
        return result;
      } catch (error) {
        const failure = signal?.aborted ? signal.reason : error;
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
    state.status = 'running'; state.startedAt = Date.now();
    try { return await state.runtime.execute(code, options); }
    finally { state.status = state.stopError ? 'error' : state.stopped ? (state.runtime.stopping ? 'stopping' : 'stopped') : state.runtime.current ? 'running' : 'idle'; if (!state.runtime.current) state.operation = null; }
  }
  async stop(id, ownAction) {
    const state = this.session(id); state.stopped = true; state.status = 'stopping';
    this.clearPointer(state);
    if (!ownAction) { state.navigationRevision++; state.currentNavigation = null; }
    if (state.resuming) { state.controlEpoch++; this.publishControl(state); }
    if (state.uiAction && state.uiAction !== ownAction) state.uiAction.abort(Object.assign(new Error('Stopped by user'), { code: 'COMPUTER_USE_STOPPED' }));
    if (state.target?.kind === 'tab') this.browserForTab(state.target.id, state.target.browserId).keepForUser(id, state.target.id);
    try {
      await state.runtime.stop(new Error('Stopped by user'));
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
      await this.releaseManualInput(id);
      if (state.controlEpoch === epoch) { state.stopped = false; state.status = 'idle'; }
    })().finally(() => { state.resuming = false; state.resumePending = null; this.publishControl(state); });
    return state.resumePending;
  }
  publishControl(state) {
    if (!this.enabled || state.stopped || state.uiAction || state.resuming) this.clearPointer(state);
    for (const viewer of state.viewers.values()) { try { viewer.send('control', { controlEpoch: state.controlEpoch, stopped: state.stopped, transitioning: !!state.uiAction || state.resuming === true }); } catch {} }
  }
  clearPointer(state) {
    state.pointerAfter = performance.now();
    state.nativePointerAfter = Date.now();
    if (state.pointer) {
      const browser = this.browsers().find(browser => browser.records.has(state.pointer.tabId));
      void browser?.hideCursor?.(state.id, state.pointer.tabId).catch(() => {});
    }
    state.pointer = null;
    for (const viewer of state.viewers.values()) { try { viewer.send('cursor', null); } catch {} }
  }
  pointerActive(id, tabId) {
    const state = this.sessions.get(id);
    return state && !this.closed && this.enabled && !state.stopped && !state.uiAction && !state.resuming && !state.ending && state.target?.kind === 'tab' && state.target.id === tabId ? state : null;
  }
  pointer(event) {
    const state = this.sessions.get(event.sessionId);
    if (!state) return;
    if (event.hidden) { if (state.pointer?.source === event.source) this.clearPointer(state); return; }
    if (!this.pointerActive(event.sessionId, event.tabId)) return;
    if (!(event.issuedAt > (state.pointerAfter ?? 0))) return;
    if (state.pointer?.source === event.source && state.pointer.sequence >= event.sequence) return;
    if (Date.now() - event.at > 1500) return;
    const { sessionId, targetId, ...pointer } = event;
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
  async watchBrowser(id, tabId, send, signal, stacked=false) {
    if(this.closed||!this.enabled)throw new Error('Computer Use 已关闭');
    const state = this.session(id);
    const target=stacked?state.previewTargets.get(tabId)?.target:state.target;
    if (target?.kind !== 'tab' || target.id !== tabId) throw new Error('当前会话没有选择这个浏览器标签页');
    state.userTabs.add(tabId);
    const actor = randomUUID(); state.viewers.set(actor, { tabId, send, stacked, readOnly:stacked });
    send('ready', { actor, controlEpoch: state.controlEpoch });
    if (state.pointer?.tabId===tabId && Date.now() - state.pointer.at < 1500) send('cursor', state.pointer);
    const subscription = this.viewsFor(target).subscribe(tabId, (type, value) => {
      if (!stacked&&state.target?.id !== tabId) { send('closed', { reason: 'target-changed', message: '当前操作目标已改变' }); return; }
      send(type, type === 'frame' ? { ...value, actor, controlEpoch: state.controlEpoch, stopped: state.stopped, transitioning: !!state.uiAction || state.resuming === true } : value);
    }, signal);
    let closing;
    const close = () => closing ??= (async () => {
      state.viewers.delete(actor); signal?.removeEventListener('abort', aborted);
      await state.manualTail?.catch(() => {});
      try { if (state.manualActor === actor) await this.releaseManualInput(id); }
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
      if (!viewer || viewer.readOnly || viewer.tabId !== input.tabId || state.target?.id !== input.tabId) throw new Error('当前画面已断开或操作目标已改变');
      if (input.controlEpoch !== state.controlEpoch) throw new Error('控制权已经改变，旧操作已取消');
      if ((state.uiAction || state.resuming) && input.type !== 'dialog') throw new Error('控制权正在切换，请等待新画面');
      if (input.type === 'release' && state.manualActor !== input.actor) return this.status(id);
      if (!state.stopped) {
        const stopping = this.stop(id);
        if (input.type === 'dialog') void stopping.catch(() => {}); else await stopping;
      }
      if (state.stopError) throw new Error(state.stopError.message);
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
    const pending = (state.manualTail ?? Promise.resolve()).then(action, action);
    state.manualTail = pending.catch(() => {});
    return pending;
  }
  async annotationSnapshot(id,input,signal){
    if(this.closed||!this.enabled)throw new Error('Computer Use 已关闭');
    const state=this.sessions.get(id),viewer=state?.viewers.get(input.actor);
    const valid=()=>this.enabled&&state?.target?.kind==='tab'&&state.target.id===input.tabId&&state.viewers.get(input.actor)===viewer&&!viewer?.readOnly&&viewer?.tabId===input.tabId&&input.controlEpoch===state.controlEpoch;
    if(!valid())throw new Error('当前画面或控制权已改变，请重新打开批注');
    const views=this.viewsFor(state.target),view=views.views.get(input.tabId);
    if(!view||view.closed)throw new Error('当前浏览器画面已断开');
    const result=await captureAnnotation(views,view,signal);
    signal?.throwIfAborted();if(!valid())throw new Error('当前画面或控制权已改变，请重新打开批注');
    return result;
  }
  async userBrowserAction(id, input, action, navigation) {
    if (!this.enabled) throw new Error('Computer Use 已关闭');
    const state = this.session(id);
    if (state.uiAction || state.resuming) throw new Error('控制权正在切换，请稍后重试');
    if (input.controlEpoch !== state.controlEpoch) throw new Error('控制权已经改变，请根据最新状态重试');
    const controller = new AbortController(); state.uiAction = controller; state.controlEpoch++;
    if (navigation) { controller.navigation = navigation; state.currentNavigation = { ...navigation, epoch: state.controlEpoch }; }
    this.publishControl(state);
    const pending = (async () => {
      await state.manualTail?.catch(() => {});
      await this.stop(id, controller); controller.signal.throwIfAborted();
      if (!this.enabled) throw new Error('Computer Use 已关闭');
      return action(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
    })();
    state.uiActionPending = pending;
    try { return await pending; }
    finally {
      if (state.uiAction === controller) { state.uiAction = null; state.uiActionPending = null; this.publishControl(state); }
    }
  }
  async annotationStylePreview(id,input,signal){
    styleChanges(input.changes);
    const state=this.sessions.get(id),viewer=state?.viewers.get(input.actor),target=state?.target;
    if(viewer?.readOnly||target?.kind!=='tab'||target.id!==input.tabId||viewer?.tabId!==input.tabId)throw new Error('当前画面已改变，请重新打开批注');
    const views=this.viewsFor(target),view=views.views.get(target.id);if(!view||view.closed)throw new Error('当前画面已断开');
    state.stylePreviewActive=true;
    try{
      const result=await this.userBrowserAction(id,input,async actionSignal=>{
        if(state.target?.id!==target.id)throw new Error('当前目标已改变');
        views.browser.claim(id,target.id);
        return previewElementStyle(views,view,input,AbortSignal.any([actionSignal,signal].filter(Boolean)));
      });
      return{...result,controlEpoch:state.controlEpoch};
    }catch(error){if(view.stylePreview){state.stopError={operation:'style-preview',message:error.message,at:Date.now()};state.status='error';}throw error;}
    finally{state.stylePreviewActive=false;}
  }
  async navigate(id, input) {
    const state = this.session(id), target = state.target;
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
      if (state.navigationIntents.get(client) !== sequence || state.navigationRevision !== navigation.revision || state.controlEpoch !== epoch || state.target?.id !== target.id) throw superseded();
      controlEpoch = state.controlEpoch;
    }
    await this.userBrowserAction(id, { ...input, controlEpoch }, async signal => {
      if (state.target?.id !== target.id) throw new Error('操作目标已改变，请重试');
      await this.dispatch(id, 'target', [target, operation, destination ? [destination] : []], signal);
    }, navigation);
  }
  async listUserTabs(id) {
    if (!this.enabled) throw new Error('Computer Use 已关闭');
    await this.extensionReady;
    const results = await Promise.allSettled(this.browsers().filter(browser => !browser.run?.lost).map(browser => browser.list('ui-tabs')));
    const tabs = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value);
    return tabs.map(({ owner, ...tab }) => ({ ...tab, active: this.sessions.get(id)?.target?.id === tab.id, available: !owner || owner === id }));
  }
  async changeUserTab(id, input) {
    if (!['new', 'select', 'close'].includes(input.action)) throw new Error('未知标签页操作');
    const destination = input.action === 'new' ? addressToUrl(input.url ?? '') : null;
    await this.userBrowserAction(id, input, async signal => {
      const state = this.session(id);
      if (input.action === 'new') {
        const target = await this.dispatch(id, 'createBrowserTab', [input.browserId ?? state.target?.browserId ?? 'browser', destination], signal);
        state.userTabs.add(target.id);
        this.browserForTab(target.id, target.browserId).keepForUser(id, target.id); return;
      }
      const target = await this.dispatch(id, 'getTab', [input.tabId, { browser: this.browserForTab(input.tabId, input.browserId).id, expected: input.expected }], signal);
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
    });
  }
  async selectPreviousUserTab(id, signal) {
    const state = this.session(id), tabs = await this.listUserTabs(id);
    const available = tabs.filter(tab => tab.available && state.userTabs.has(tab.id));
    const previous = [...state.userTabs].reverse().find(tabId => available.some(tab => tab.id === tabId));
    if (previous) await this.dispatch(id, 'getTab', [previous, { browser: this.browserForTab(previous).id }], signal);
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
  async endTurn(id) {
    const state = this.sessions.get(id); if (!state) return;
    this.clearPointer(state);
    if (!state.ending) state.ending = Promise.allSettled([state.stopped && state.viewers.size ? Promise.resolve() : Promise.all(this.browsers().map(browser => browser.endTurn(id))), this.native.release(id)]).finally(() => { state.ending = null; });
    await state.ending;
  }
  status(id) {
    const state = this.sessions.get(id);
    const target = state?.target?.kind === 'tab' ? { ...state.target, ...this.browsers().find(browser => browser.records.has(state.target.id))?.records.get(state.target.id) } : state?.target ?? null;
    return { observedAt: performance.now(), enabled: !this.closed && this.enabled, nativeInstalled: this.native.available(), status: state?.browserError && !target ? 'error' : state?.status ?? 'idle', target, previewTargets:[...(state?.previewTargets?.values()??[])].map(({target})=>target.kind==='tab'?{...target,...this.browsers().find(browser=>browser.records.has(target.id))?.records.get(target.id)}:target), controlEpoch: state?.controlEpoch ?? 0, navigationRevision: state?.navigationRevision ?? 0, transitioning: !!state?.uiAction || state?.resuming === true, resuming: state?.resuming === true, operation: state?.operation ?? null, lastError: state?.stopError ?? state?.browserError ?? state?.lastError ?? null, startedAt: state?.startedAt ?? null, previewAt: this.preview.get(id)?.at ?? null, history: state?.history ?? [], operationStats: state ? structuredClone(state.operationStats) : { total: 0, succeeded: 0, failed: 0, cancelled: 0, methods: {} } };
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
    const executable = this.browser.runtimePath ?? browserExecutablePath(this.browser.executablePath);
    const native = { platform: process.platform, supported: this.native.supported(), installed: this.native.available(), installing: !!this.native.installing, removing: !!this.native.removing, removable: typeof this.native.uninstall === 'function' && !this.native.externalBinary, accessibility: null, screenRecording: null };
    if (native.installed) {
      try { Object.assign(native,await this.native.installationStatus());const permissions = await this.native.permissions('ui-permissions'); if (permissions.platform === 'win32') { native.interactive = permissions.interactive; native.captureSupported = permissions.capture_supported; } else { native.accessibility = permissions.accessibility; native.screenRecording = permissions.screen_recording; } }
      catch (error) { native.error = error.message; if (native.platform === 'win32') native.repairRequired = true; }
    }
    const browsers = this.extensionHub.list();
    return { browser: { installed: existsSync(executable), name: executable.includes('ms-playwright') ? 'Chromium · Playwright 固定版本' : 'Chrome / Chromium', path: executable, running: !!this.browser.endpoint && !this.browser.closing }, extension: { ready: !!this.extensionHub.server && !this.extensionHub.server.failure, browsers, error: this.extensionError ?? this.extensionHub.server?.failure?.message ?? null, installation: await this.extensionInstaller.status(browsers) }, native };
  }
  async installExtension() {
    return this.configureExtension('install', async () => {
    await this.extensionInstaller.prepare();
    if (this.closed) throw new Error('Oh My DSH 已关闭，请重新启动后连接 Chrome');
    const command = this.extensionInstaller.windows ? (await this.extensionInstaller.windows.command()).command : null;
    if (this.ownsExtensionHub && (!this.extensionHub.server || this.extensionHub.server.failure || (command && command !== this.extensionHub.server.command))) {
      await this.extensionHub.close();
      await this.extensionHub.start(); this.extensionError = null;
    }
    });
  }
  async removeExtension() {
    return this.configureExtension('remove', async () => {
    await this.extensionReady;
    for (const browser of this.extensionBrowsers.values()) browser.closing = true;
    for (const state of this.sessions.values()) if (state.target?.kind === 'tab' && this.extensionBrowsers.has(state.target.browserId)) await this.stop(state.id);
    // Just like plugin disposal, never cut the last CDP connection before an
    // uncertain temporary page style has actually been restored.
    await Promise.all([...this.extensionViews.values()].flatMap(views => [...views.views.values()].filter(view => view.stylePreview).map(view => restoreStylePreview(view))));
    for (const views of this.extensionViews.values()) await views.close();
    for (const browser of this.extensionBrowsers.values()) { await browser.close(); browser.invalidate(); }
    if (this.ownsExtensionHub) await this.extensionHub.close();
    await this.extensionInstaller.unregister(); this.extensionError = null;
    });
  }
  async configureExtension(action, work) {
    if (this.closed) throw new Error('Oh My DSH 已关闭');
    if (this.extensionSetup) {
      if (this.extensionSetup.action !== action) throw new Error('Chrome 连接正在配置，请等待当前操作完成');
      return this.extensionSetup.promise;
    }
    const operation = { action };
    operation.promise = Promise.resolve().then(work).finally(() => { if (this.extensionSetup === operation) this.extensionSetup = null; });
    this.extensionSetup = operation; return operation.promise;
  }
  async installNative() {
    await this.native.install({ beforeReplace: () => this.prepareNativeChange('update') });
  }
  async removeNative() {
    if (typeof this.native.uninstall !== 'function') throw new Error('当前平台尚未提供桌面运行时卸载');
    return this.native.uninstall({ beforeRemove: () => this.prepareNativeChange('remove') });
  }
  async prepareNativeChange(action) {
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
    await this.extensionSetup?.promise.catch(() => {});
    for (const state of this.sessions.values()) state.uiAction?.abort(new Error('Computer Use plugin unloaded'));
    const stopping = [this.stopSharing(), ...[...this.sessions.values()].map(async state => { await state.runtime.stop(new Error('Computer Use plugin unloaded')); await state.uiActionPending?.catch(() => {}); })];
    const stopped=Promise.allSettled(stopping);
    // Keep the observation connection until temporary page styles are restored.
    // Other teardown retains its existing concurrent dialog handling.
    await Promise.allSettled([...this.sessions.values()].filter(state=>state.stylePreviewActive).map(state=>state.uiActionPending));
    await Promise.all([this.browserViews,...this.extensionViews.values()].flatMap(views=>[...views.views.values()].filter(view=>view.stylePreview).map(view=>restoreStylePreview(view))));
    // A webpage dialog must not hold plugin unloading hostage. Terminating our
    // owned browser also settles renderer commands waiting behind that dialog.
    await this.extensionReady;
    this.extensionHub.off('connected', this.extensionConnected);
    await Promise.allSettled([this.nativeViews.close(),this.browserViews.close(), ...[...this.extensionViews.values()].map(views => views.close()), ...this.browsers().map(browser => browser.close()), ...[...this.retiredExtensions].map(browser => browser.close()), stopped]);
    if (this.ownsExtensionHub) await this.extensionHub.close();
    await this.native.close(); this.sessions.clear(); this.preview.clear();
  }
}
