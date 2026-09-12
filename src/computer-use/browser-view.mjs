import { randomUUID } from 'node:crypto';
import { browserKey } from './browser.mjs';
import { viewportGeometry } from './browser-screenshot.mjs';
import {restoreStylePreview}from'./browser-style-preview.mjs';

// One screencast per tab, shared by visible panes. Observation has an independent
// CDP connection so stopping the model does not disconnect the user's picture.
export class BrowserViews {
  constructor(browser) { this.browser = browser; this.views = new Map(); this.frames = new Map(); this.observationTimeoutMs = 5000; }

  async read(view, operation, signal) {
    const lifetime = signal ? AbortSignal.any([view.lifetime.signal, signal]) : view.lifetime.signal;
    let timer, aborted;
    const stopped = new Promise((_, reject) => {
      aborted = () => reject(lifetime.reason);
      if (lifetime.aborted) aborted(); else lifetime.addEventListener('abort', aborted, { once: true });
      const expired = () => {
        if (lifetime.aborted) return;
        if (view.dialog) { timer = setTimeout(expired, this.observationTimeoutMs); return; }
        reject(new Error('页面观察超时，请重连画面'));
      };
      timer = setTimeout(expired, this.observationTimeoutMs);
    });
    try { return await Promise.race([operation, stopped]); }
    finally { clearTimeout(timer); lifetime.removeEventListener('abort', aborted); }
  }
  async snapshotRead(view,read){
    if(view.resizing)throw new Error('正在调整视口，请稍后截图');
    const pending=Promise.resolve().then(read);view.readers??=new Set();view.readers.add(pending);
    try{return await pending;}finally{view.readers.delete(pending);}
  }

  async subscribe(tabId, listener, signal) {
    signal?.throwIfAborted();
    let view = this.views.get(tabId);
    if (view?.closed) { await this.stop(view); view = this.views.get(tabId); }
    if (!view) {
      view = { tabId, sessionId: 'preview-' + randomUUID(), listeners: new Set(), frames: [], closed: false, lifetime: new AbortController() };
      this.views.set(tabId, view);
      view.ready = this.start(view);
    }
    view.listeners.add(listener);
    const close = async () => {
      signal?.removeEventListener('abort', aborted);
      view.listeners.delete(listener);
      // Chrome defers some renderer commands while a JavaScript dialog is
      // open. Keep its observation connection so reopening the pane can still
      // answer it; never dismiss a page dialog just to close our UI.
      if (!view.listeners.size && !view.dialog) await this.stop(view);
    };
    const aborted = () => { void close().catch(() => {}); };
    signal?.addEventListener('abort', aborted, { once: true });
    try {
      await view.ready; signal?.throwIfAborted();
      if (view.latest) listener('frame', view.latest);
      if (view.dialog) listener('dialog', view.dialog);
      if (view.navigation) listener('navigation', view.navigation);
      return close;
    } catch (error) { await close(); throw error; }
  }

  async start(view) {
    try {
      const record = await this.read(view, this.browser.target(view.sessionId, view.tabId, { claim: false }));
      if (view.closed) return;
      view.record = record;
      const cdp = record.cdp; view.cdp = cdp;
      view.document = new AbortController();
      const publish = (event, value) => { for (const listener of view.listeners) { try { listener(event, value); } catch {} } };
      view.publish = publish;
      const navigation = () => { void this.navigation(view); };
      cdp.on('Page.frameNavigated', ({ frame }) => { if (!frame.parentId) {
        view.document.abort(Object.assign(new Error('The preview document changed'), { code: 'VIEW_NAVIGATED' })); view.document = new AbortController();
        view.loaderId = frame.loaderId; navigation();
      } });
      cdp.on('Page.navigatedWithinDocument', navigation);
      record.page.on('domcontentloaded', navigation); record.page.on('load', navigation);
      const loadingFrames = new Set();
      cdp.on('Page.frameStartedLoading', ({ frameId }) => { loadingFrames.add(frameId); view.loading = true; navigation(); });
      const stoppedLoading = ({ frameId }) => { loadingFrames.delete(frameId); view.loading = !!loadingFrames.size; navigation(); };
      cdp.on('Page.frameStoppedLoading', stoppedLoading); cdp.on('Page.frameDetached', stoppedLoading);
      cdp.on('Page.javascriptDialogOpening', dialog => { view.dialog = { ...dialog, id: randomUUID() }; publish('dialog', view.dialog); });
      cdp.on('Page.javascriptDialogClosed', () => {
        view.dialog = null; publish('dialog', null);
        if(view.initialGeometry&&view.listeners.size)this.queueFrame(view,{loaderId:view.loaderId,captureOnly:true});
        if (!view.listeners.size) void this.stop(view).catch(() => {});
      });
      if (record.nativeDialog) { view.dialog = { ...record.nativeDialog, id: randomUUID() }; publish('dialog', view.dialog); }
      cdp.on('Page.screencastFrame', event => {
        void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
        if (!view.listeners.size || view.dialog) return;
        this.queueFrame(view,{event,loaderId:view.loaderId});
      });
      cdp.on('Page.frameResized',()=>{
        if(view.initialGeometry&&view.listeners.size&&!view.dialog)this.queueFrame(view,{loaderId:view.loaderId,captureOnly:true});
      });
      await this.read(view, cdp.send('Page.enable'));
      const { frameTree } = await this.read(view, cdp.send('Page.getFrameTree')); view.loaderId = frameTree.frame.loaderId;
      view.initialGeometry = viewportGeometry(await this.read(view, cdp.send('Page.getLayoutMetrics')));
      await this.read(view, cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1600, maxHeight: 1200, everyNthFrame: 1 }));
      await this.navigation(view);
      record.page.once('close', () => { publish('closed', { reason: 'tab-closed', message: '标签页已关闭' }); void this.stop(view).catch(() => {}); });
    } catch (error) { if (!view.closed) throw error; }
  }

  async navigation(view) {
    view.navigationRevision = (view.navigationRevision ?? 0) + 1;
    view.navigationPending = true;
    if (view.refreshingNavigation) return view.refreshingNavigation;
    view.refreshingNavigation = (async () => {
      let retryAt = 0;
      while (view.navigationPending && !view.closed) {
        view.navigationPending = false;
        try {
          const revision = view.navigationRevision, observedAt = performance.now();
          const [history, { targetInfo }] = await this.read(view, Promise.all([view.cdp.send('Page.getNavigationHistory'), view.cdp.send('Target.getTargetInfo')]));
          const entry = history.entries[history.currentIndex];
          if (view.closed) return;
          if (revision !== view.navigationRevision) continue;
          view.navigation = { tabId: view.tabId, loaderId: view.loaderId, observedAt, url: entry?.url ?? view.record.page.url(), title: targetInfo.title || entry?.title || '', canGoBack: history.currentIndex > 0, canGoForward: history.currentIndex < history.entries.length - 1, loading: view.loading === true };
          const info = this.browser.records.get(view.tabId);
          if (info) this.browser.records.set(view.tabId, { ...info, url: view.navigation.url, title: view.navigation.title });
          this.browser.visit(view.tabId,view.navigation.url,view.navigation.title);
          view.publish('navigation', view.navigation);
          retryAt = 0;
        } catch (error) {
          if (!view.closed && /Not attached to an active page/.test(error.message)) {
            retryAt ||= Date.now();
            if (Date.now() - retryAt < this.observationTimeoutMs) { view.navigationPending = true; await new Promise(resolve => setTimeout(resolve, 50)); continue; }
          }
          if (!view.closed) { view.publish('failure', { message: error.message }); void this.stop(view).catch(() => {}); }
        }
      }
    })().finally(() => { view.refreshingNavigation = null; });
    return view.refreshingNavigation;
  }

  queueFrame(view,pending){
    if(view.closed)return;
    view.pending={...pending,captureOnly:pending.captureOnly||view.pending?.captureOnly};
    if(!view.flushing&&!view.resizing)view.flushing=this.flush(view).finally(()=>{
      view.flushing=null;
      if(view.pending&&!view.closed)this.queueFrame(view,view.pending);
    });
  }

  async flush(view) {
    let retryAt = 0;
    while (view.pending && !view.closed && !view.resizing) {
      const { event, loaderId, captureOnly } = view.pending; view.pending = null;
      try {
        if (!captureOnly&&event?.metadata.timestamp && event.metadata.timestamp < (view.screencastAfter ?? 0)) continue;
        const metrics = await this.read(view, view.cdp.send('Page.getLayoutMetrics'));
        if (view.closed || loaderId !== view.loaderId) continue;
        let geometry = viewportGeometry(metrics);
        // Frame metadata has no browser-zoom or emulated-layout identity.
        // Establish a fresh screenshot baseline when those values change,
        // instead of labelling a queued pre-resize JPEG with newer dimensions.
        const previous = view.latest?.geometry ?? view.initialGeometry;
        const changed=['zoom','layoutWidth','layoutHeight'].some(key=>previous?.[key]!==geometry[key]);
        const resized=captureOnly&&Object.keys(geometry).some(key=>previous?.[key]!==geometry[key]);
        if(!event&&!changed&&!resized)continue;
        let width,height,data,mediaType;
        if (changed||resized) {
          view.screencastAfter = Date.now() / 1000;
          const signal = AbortSignal.any([view.document.signal, view.lifetime.signal]);
          const captured = await this.read(view, this.browser.observeScreenshot(view.record, {}, signal), signal);
          if (view.closed || loaderId !== view.loaderId) continue;
          const { source, generation, fullPage, ...current } = captured.screenshotFrame;
          geometry = current; data = captured.screenshot; mediaType = 'image/png';
          const png = Buffer.from(data, 'base64');
          width = png.readUInt32BE(16) / geometry.scale; height = png.readUInt32BE(20) / geometry.scale;
        }else{
          const metadata=event.metadata;
          // A queued image may precede the geometry query. It must not acquire
          // the scale/scroll of a newer frame while retaining the old pixels.
          const scrollX=metadata.scrollOffsetX/geometry.zoom,scrollY=metadata.scrollOffsetY/geometry.zoom;
          if(Math.abs(metadata.pageScaleFactor-geometry.scale)>.0001||Math.abs(scrollX-geometry.pageX)>1||Math.abs(scrollY-geometry.pageY)>1)continue;
          const scale=metadata.pageScaleFactor*geometry.zoom;
          width=metadata.deviceWidth/scale;height=metadata.deviceHeight/scale;data=event.data;mediaType='image/jpeg';
        }
        const frame = { id: randomUUID(), tabId: view.tabId, loaderId, width, height, geometry, browserCursor: this.browser.windowCursor === true && mediaType === 'image/jpeg', scrollX: geometry.pageX, scrollY: geometry.pageY, data, mediaType, at: Date.now(), url: view.record.page.url() };
        view.latest = frame; view.frames.push(frame.id); this.frames.set(frame.id, frame);
        while (view.frames.length > 24) this.frames.delete(view.frames.shift());
        view.publish('frame', frame);
        retryAt = 0;
      } catch (error) {
        if (!view.closed && ['VIEW_NAVIGATED', 'STALE_SCREENSHOT'].includes(error.code)) continue;
        if (!view.closed && /Not attached to an active page/.test(error.message)) {
          retryAt ||= Date.now();
          if (Date.now() - retryAt < this.observationTimeoutMs) { view.pending ??= { event, loaderId, captureOnly }; await new Promise(resolve => setTimeout(resolve, 50)); continue; }
        }
        if (!view.closed) { view.publish('failure', { message: error.message }); void this.stop(view).catch(() => {}); }
      }
    }
  }

  async stop(view) {
    if (view.stopping) return view.stopping;
    view.closed = true;
    view.lifetime.abort(new Error('Browser observation closed'));
    view.stopping = (async () => {
      await view.ready?.catch(() => {});
      await view.layoutPending?.catch(() => {});
      await restoreStylePreview(view);
      // Dialog-closed can precede the reply to the user's answer. Disabling
      // control must not detach this channel while that answer is returning.
      if (view.dialogReplies?.size) {
        let timer;
        try { await Promise.race([Promise.allSettled([...view.dialogReplies]),new Promise(resolve=>{timer=setTimeout(resolve,this.observationTimeoutMs);})]); }
        finally { clearTimeout(timer); }
      }
      // Disconnecting removes the screencast's CDP session. Screencast replies
      // can be lost during page closure; they must not gate observer teardown.
      if (!view.dialog) void view.cdp?.send('Page.stopScreencast').catch(() => {});
      try { await this.browser.disconnect(view.sessionId); }
      finally {
        if (this.views.get(view.tabId) === view) this.views.delete(view.tabId);
        for (const id of view.frames) this.frames.delete(id);
      }
    })();
    try{return await view.stopping;}catch(error){view.stopping=null;throw error;}
  }

  async input(sessionId, tabId, input) {
    if (!input || typeof input.type !== 'string') throw new Error('浏览器操作无效');
    if (input.type === 'dialog') {
      const view = this.views.get(tabId);
      if (!view?.dialog || view.dialog.id !== input.dialogId) throw Object.assign(new Error('网页对话框已经改变，请根据当前提示操作'), { code: 'STALE_DIALOG' });
      this.browser.claim(sessionId, tabId);
      // An open dialog can prevent a new Playwright connection from becoming
      // ready. Answer through the already-enabled observation CDP channel.
      const pending = this.browser.connections.get(sessionId), connection = pending ? await pending : null;
      const record = connection?.pages.get(tabId);
      const previous = record?.pendingAction;
      const answer = async () => {
        const reply=view.cdp.send('Page.handleJavaScriptDialog', { accept: input.accept === true, ...(typeof input.text === 'string' ? { promptText: input.text } : {}) });
        (view.dialogReplies??=new Set()).add(reply);
        try { await reply; } finally { view.dialogReplies.delete(reply); }
        await previous;
      };
      if (record) { record.dialog = null; return this.browser.perform(record, answer); }
      await answer();
      return;
    }
    const modal = this.views.get(tabId)?.dialog;
    if (modal && !['release', 'pointerup', 'keyup'].includes(input.type)) throw Object.assign(new Error('请先处理网页提示，再操作页面'), { code: 'DIALOG_OPEN' });
    const connection = modal ? await this.browser.connections.get(sessionId) : null;
    const record = modal ? connection?.pages.get(tabId) : await this.browser.target(sessionId, tabId);
    if (!record) return;
    if (modal || record.dialog || record.nativeDialog) {
      const failed = error => this.views.get(tabId)?.publish('warning', { message: error.message });
      if (input.type === 'release') { for (const pending of this.browser.queueInputRelease(record)) void pending.catch(failed); return; }
      if (input.type === 'pointerup') {
        const button = ['left', 'middle', 'right'][input.button ?? 0]; if (!button) throw new Error('鼠标按键无效');
        if (record.heldButtons.has(button)) void this.browser.releaseButton(record, button).catch(failed); return;
      }
      if (input.type === 'keyup') {
        if (typeof input.key !== 'string' || input.key.length > 64) throw new Error('按键无效');
        const key = browserKey(input.key); if (record.heldKeys.has(key)) void this.browser.releaseKey(record, key).catch(failed); return;
      }
      throw Object.assign(new Error('请先处理网页提示，再操作页面'), { code: 'DIALOG_OPEN' });
    }
    if (input.type === 'release') { await this.browser.releaseInput(record); return; }
    return this.browser.perform(record, () => this.performInput(record, tabId, input));
  }

  async performInput(record, tabId, input) {
    // Releases must remain possible after navigation or frame expiry. Never
    // move the pointer across a newly loaded document just to release a button.
    if (input.type === 'pointerup') {
      const button = ['left', 'middle', 'right'][input.button ?? 0];
      if (!button) throw new Error('鼠标按键无效');
      if (record.heldButtons.has(button)) {
        await this.browser.releaseButton(record, button);
      }
      return;
    }
    if (input.type === 'keyup') {
      if (typeof input.key !== 'string' || input.key.length > 64) throw new Error('按键无效');
      const key = browserKey(input.key);
      if (record.heldKeys.has(key)) await this.browser.releaseKey(record, key);
      return;
    }
    const frame = this.frames.get(input.frameId);
    if (!frame || frame.tabId !== tabId) throw new Error('画面已失效，请等待最新画面后再操作。');
    const { frameTree } = await record.cdp.send('Page.getFrameTree');
    if (frame.loaderId !== frameTree.frame.loaderId) throw new Error('页面已经跳转，请根据新画面操作。');
    if (input.type.startsWith('pointer') || input.type === 'wheel') {
      if (!Number.isFinite(input.x) || !Number.isFinite(input.y) || input.x < 0 || input.y < 0 || input.x > 1 || input.y > 1) throw new Error('指针位置无效');
      const current = viewportGeometry(await record.cdp.send('Page.getLayoutMetrics'));
      if (['width', 'height', 'layoutWidth', 'layoutHeight', 'scale', 'zoom', 'rasterScale'].some(key => current[key] !== frame.geometry[key])) throw new Error('窗口大小或缩放已改变，请等待最新画面。');
      if (Math.abs(current.pageX - frame.scrollX) > 1 || Math.abs(current.pageY - frame.scrollY) > 1) throw new Error('页面已滚动，请根据最新画面操作。');
      const p = { x: Math.min(frame.width - 1, input.x * frame.width), y: Math.min(frame.height - 1, input.y * frame.height) };
      record.pointer = p;
      const button = ['left', 'middle', 'right'][input.button ?? 0];
      if (!button) throw new Error('鼠标按键无效');
      await record.page.mouse.move(p.x, p.y);
      if (input.type === 'pointerdown') {
        const clickCount = input.clickCount ?? 1;
        if (!Number.isInteger(clickCount) || clickCount < 1 || clickCount > 3) throw new Error('点击次数无效');
        record.clickCounts ??= {}; record.clickCounts[button] = clickCount;
        record.heldButtons.add(button);
        await record.page.mouse.down({ button, clickCount });
      } else if (input.type === 'wheel') {
        if (![input.deltaX, input.deltaY].every(n => Number.isFinite(n) && Math.abs(n) <= 10000)) throw new Error('滚动距离无效');
        await record.page.mouse.wheel(input.deltaX, input.deltaY);
      } else if (input.type !== 'pointermove') throw new Error('未知指针操作');
      return;
    }
    if (input.type === 'keydown') {
      if (typeof input.key !== 'string' || input.key.length > 64) throw new Error('按键无效');
      const key = browserKey(input.key);
      record.heldKeys.add(key); await record.page.keyboard.down(key);
      return;
    }
    if (input.type === 'text') {
      if (typeof input.text !== 'string' || input.text.length > 60000) throw new Error('粘贴文本过长或无效');
      await record.page.keyboard.insertText(input.text); return;
    }
    throw new Error('未知浏览器操作');
  }

  async close() { const results=await Promise.allSettled([...this.views.values()].map(view=>this.stop(view)));const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);if(errors.length)throw new AggregateError(errors,'浏览器预览清理尚未确认'); }
}
