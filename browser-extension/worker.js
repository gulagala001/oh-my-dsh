const HOST = 'ai.trisoul.computer_use';
const controls = new Map(); let port, connecting, ready = false, error = '', detail = '', enabled = true;
const send = message => { try { port?.postMessage(message); } catch {} };
const failed = (message, code = 'EXTENSION_OPERATION_FAILED') => Object.assign(new Error(message), { code });
const describe = tab => ({ id: String(tab.id), title: tab.title ?? '', url: tab.url ?? '', windowId: tab.windowId });
async function cancelCreation(creation) {
  creation.cancelled = true;
  await creation.ready.catch(() => {});
  if (creation.tab && !creation.removed) {
    try { await chrome.tabs.remove(creation.tab.id); }
    catch (cause) { if (!/No tab with id/.test(cause.message)) throw cause; }
    creation.removed = true;
  }
  return { released: true };
}
async function releaseInput(control, actorId) {
  const errors=[];
  for(const [key,input] of control.held){
    if(actorId!==undefined&&input.actorId!==actorId)continue;
    try{await chrome.debugger.sendCommand({tabId:control.tabId,...(input.sessionId?{sessionId:input.sessionId}:{})},input.method,input.params);control.held.delete(key);}
    catch(cause){errors.push(cause.message);}
  }
  return errors;
}
async function stopActor(control, actorId) {
  if(typeof actorId!=='string'||!actorId)throw failed('Invalid protocol actor');
  if(control.actorStops.has(actorId))return control.actorStops.get(actorId);
  control.stoppedActors.add(actorId);
  void control.cursor?.stop(actorId);
  const stopping=(async()=>{
    const errors=await releaseInput(control,actorId);
    if(errors.length){control.actorErrors.set(actorId,errors.join('; '));throw failed('Input release was not confirmed: '+errors.join('; '),'INPUT_RELEASE_FAILED');}
    control.actorErrors.delete(actorId);return{released:true};
  })();
  control.actorStops.set(actorId,stopping);
  try{return await stopping;}finally{if(control.actorStops.get(actorId)===stopping)control.actorStops.delete(actorId);}
}
function lostControl(control, reason) {
  control.isAttached = false;
  if (control.stopped) return;
  control.stopped = true;
  void control.cursor?.stop();
  if (controls.get(control.tabId) === control) controls.delete(control.tabId);
  if (control.held.size) error = '浏览器已停止控制，部分按键的释放尚未确认。';
  control.transport.ended.set(control.leaseId, { tabId: control.tabId, released: control.held.size === 0 });
  send({ event: 'stopped', params: {tabId:control.tabId,leaseId:control.leaseId,reason,released:control.held.size === 0} });
}

async function stop(control, reason = 'released') {
  if (control.stopping) return control.stopping;
  control.stopped = true;
  void control.cursor?.stop();
  const stopping = (async () => {
    await control.attached.catch(() => {});
    const errors = [];
    if (control.isAttached) {
      errors.push(...await releaseInput(control));
      if (!errors.length) {
        try { await chrome.debugger.detach({ tabId: control.tabId }); control.isAttached = false; }
        catch (cause) { if (control.isAttached) errors.push(cause.message); }
      }
    }
    if (!control.isAttached) {
      if (control.held.size) errors.push('Debugger detached before input release was confirmed');
      if (controls.get(control.tabId) === control) controls.delete(control.tabId);
      control.transport.ended.set(control.leaseId, {tabId:control.tabId,released:errors.length===0});
    }
    control.stopError = errors.length ? errors.join('; ') : null;
    send({ event: 'stopped', params: { tabId: control.tabId, leaseId: control.leaseId, reason, released: errors.length === 0, errors } });
    if (errors.length) throw failed('Input release was not confirmed: ' + errors.join('; '), 'INPUT_RELEASE_FAILED');
    return { released: true };
  })();
  control.stopping = stopping;
  try { return await stopping; } finally { if (control.stopping === stopping) control.stopping = null; }
}
async function stopAll(reason) {
  const results = await Promise.allSettled([...controls.values()].map(control => stop(control, reason)));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) { error = '浏览器控制已断开，但部分按键的释放尚未确认。'; detail = failures.map(result => result.reason.message).join('\n'); }
  return failures.length === 0;
}

async function connect() {
  if (port) return; if (connecting) return connecting;
  connecting = (async () => {
    const settings = await chrome.storage.local.get(['instanceId', 'enabled']);
    enabled = settings.enabled !== false; if (!enabled) return;
    const instanceId = settings.instanceId ?? crypto.randomUUID();
    if (!settings.instanceId) await chrome.storage.local.set({ instanceId });
    error = ''; detail = ''; ready = false;
    const current = chrome.runtime.connectNative(HOST), transport = { ended: new Map(), creations: new Map() }; port = current;
    current.onMessage.addListener(message => {
      if (port !== current) return;
      if (!ready && message?.type === 'ready' && message.protocol === 2) { ready = true; return; }
      if (!ready || !Number.isSafeInteger(message?.id) || typeof message.method !== 'string') { current.disconnect(); return; }
      void dispatch(message.method, message.params ?? {}, transport).then(result => {
        if (port === current) send({ id: message.id, result });
      }, cause => { if (port === current) send({ id: message.id, error: { message: cause.message, code: cause.code } }); });
    });
    current.onDisconnect.addListener(() => {
      if (port !== current) return;
      detail = chrome.runtime.lastError?.message ?? ''; error = enabled ? '与 trisoul-x 的连接已断开。启动连接服务后可重新连接。' : '';
      ready = false; port = null;
      void stopAll('connection-lost');
      for (const creation of transport.creations.values()) void cancelCreation(creation).catch(cause => { error = '取消新标签页失败'; detail = cause.message; });
    });
    current.postMessage({ type: 'hello', protocol: 2, instanceId, name: 'Chrome', userAgent: navigator.userAgent, capabilities: ['cursor-overlay'], version: chrome.runtime.getManifest().version, build: typeof TRISOUL_BUNDLE_ID === 'string' ? TRISOUL_BUNDLE_ID : null });
  })().finally(() => { connecting = null; });
  return connecting;
}

async function dispatch(method, params, transport) {
  if (method === 'tabs.list') return (await chrome.tabs.query({})).filter(tab => !tab.url?.startsWith('chrome-extension://')).map(describe);
  if (['tabs.create', 'tabs.cancelCreate', 'tabs.commitCreate'].includes(method)) {
    if (typeof params.creationId !== 'string' || !/^[a-z0-9-]{1,100}$/i.test(params.creationId)) throw failed('Invalid tab creation ID');
    let creation = transport.creations.get(params.creationId);
    if (method === 'tabs.create') {
      if (creation) throw failed('This tab creation was already requested');
      creation = { cancelled: false }; transport.creations.set(params.creationId, creation);
      creation.ready = chrome.tabs.create({ url: 'about:blank', active: false }).then(tab => { creation.tab = tab; return tab; });
      const tab = await creation.ready;
      if (creation.cancelled) { await cancelCreation(creation); throw failed('Tab creation cancelled', 'CONTROL_STOPPED'); }
      return describe(tab);
    }
    if (method === 'tabs.cancelCreate') return creation ? cancelCreation(creation) : { released: true };
    if (!creation || creation.cancelled) throw failed('This tab creation has ended', 'CONTROL_STOPPED');
    await creation.ready;
    if (creation.cancelled) throw failed('This tab creation has ended', 'CONTROL_STOPPED');
    transport.creations.delete(params.creationId); return { committed: true };
  }
  if(!Number.isSafeInteger(params.tabId)||params.tabId<0)throw failed('tabId must be a numeric Chrome tab ID');
  if(params.actorId!==undefined&&(typeof params.actorId!=='string'||!params.actorId||params.actorId.length>128))throw failed('Invalid protocol actor');
  if(params.sessionId!==undefined&&(typeof params.sessionId!=='string'||!params.sessionId))throw failed('Invalid child session ID');
  if (method === 'attach') {
    const tabId = Number(params.tabId);
    if (!Number.isSafeInteger(tabId) || typeof params.leaseId !== 'string' || !params.leaseId) throw failed('Invalid tab lease');
    if (transport.ended.has(params.leaseId)) throw failed('This lease has already ended; create a fresh binding', 'CONTROL_STOPPED');
    if (controls.has(tabId)) throw failed('This tab already has an active controller', 'TAB_BUSY');
    const control = { tabId, leaseId: params.leaseId, transport, held: new Map(), children: new Map(), stoppedActors:new Set(),actorStops:new Map(),actorErrors:new Map(),stopped: false };
    control.cursor = new CursorOverlay((method, value) => chrome.debugger.sendCommand({ tabId }, method, value), actorId => control.isAttached && !control.stopped && typeof actorId === 'string' && !control.stoppedActors.has(actorId));
    controls.set(tabId, control);
    let tab;
    // Reserve before the first await so stop/disconnect cancels an attachment
    // still waiting on the browser's tab lookup, not just an active debugger.
    control.attached = (async () => {
      tab = await chrome.tabs.get(tabId);
      if (control.stopped) throw failed('Control was stopped while selecting the tab', 'CONTROL_STOPPED');
      if (params.creationId !== undefined) {
        const creation = transport.creations.get(params.creationId);
        if (!creation || creation.cancelled || creation.tab?.id !== tabId) throw failed('The new tab no longer belongs to this creation', 'STALE_TAB');
      }
      if (params.expected && (params.expected.url !== tab.url || params.expected.title !== tab.title)) throw failed('The referenced tab has changed', 'STALE_TAB');
      await chrome.debugger.attach({ tabId }, '1.3'); control.isAttached = true;
    })();
    try {
      await control.attached;
      if (control.stopped) throw failed('Control was stopped while attaching', 'CONTROL_STOPPED');
      const { targetInfo } = await chrome.debugger.sendCommand({ tabId }, 'Target.getTargetInfo');
      if (control.stopped) throw failed('Control was stopped while attaching', 'CONTROL_STOPPED');
      control.targetId = targetInfo.targetId; return { ...describe(tab), targetId: control.targetId, targetInfo, leaseId: control.leaseId };
    } catch (cause) { await stop(control, 'attach-failed').catch(() => {}); throw cause; }
  }
  const control = controls.get(Number(params.tabId));
  const belongs = control?.leaseId === params.leaseId && control.transport === transport;
  if (method === 'detach' || method === 'stop-actor') {
    if (belongs) return method==='detach'?stop(control):stopActor(control,params.actorId);
    const ended = transport.ended.get(params.leaseId);
    if (ended?.tabId === Number(params.tabId)) {
      if (!ended.released) throw failed('Input release was not confirmed for this ended lease', 'INPUT_RELEASE_FAILED');
      return { released: true };
    }
  }
  if (!belongs || control.stopped) throw failed('This tab lease has ended; explicitly select it again', 'CONTROL_STOPPED');
  if (method === 'cursor') {
    if (typeof params.actorId !== 'string' || control.stoppedActors.has(params.actorId)) return { queued: false };
    const p = params.pointer;
    if (p === null) { void control.cursor.stop(params.actorId); return { queued: true }; }
    if (!p || typeof p.source !== 'string' || typeof p.loaderId !== 'string' || !Number.isSafeInteger(p.sequence) || ![p.x,p.y,p.at,p.geometry?.width,p.geometry?.height,p.geometry?.pageX,p.geometry?.pageY,p.geometry?.scale,p.geometry?.zoom].every(Number.isFinite) || p.geometry.scale <= 0 || p.geometry.zoom <= 0) throw failed('Invalid cursor observation');
    void control.cursor.update(params.actorId, p).then(() => { control.cursorError = null; }, cause => { control.cursorError = cause.message; });
    return { queued: true };
  }
  if (method === 'close') {
    await stop(control, 'tab-closed');
    await chrome.tabs.remove(control.tabId); return { success: true };
  }
  if (method !== 'command') throw failed('Unknown extension operation: ' + method);
  const action = async () => {
    if (control.stopped || control.stoppedActors.has(params.actorId)) throw failed('Control stopped; queued command cancelled', 'CONTROL_STOPPED');
    if (params.sessionId && !control.children.has(params.sessionId)) throw failed('Unknown child target session', 'STALE_TARGET');
    const command = params.method, value = params.params ?? {};
    if (typeof command !== 'string') throw failed('Missing CDP command');
    if (command.startsWith('Target.')) {
      if (!['Target.getTargetInfo', 'Target.setAutoAttach', 'Target.attachToTarget', 'Target.detachFromTarget'].includes(command)) throw failed('Target management must use an explicit tab lease');
      if (command === 'Target.setAutoAttach' && value.flatten !== true) throw failed('Only flat child sessions are supported');
      if (value.targetId && value.targetId !== control.targetId && ![...control.children.values()].includes(value.targetId)) throw failed('Target belongs to another tab', 'STALE_TARGET');
      if (command === 'Target.detachFromTarget' && !control.children.has(value.sessionId)) throw failed('Unknown child target session', 'STALE_TARGET');
    }
    const session = { tabId: control.tabId, ...(params.sessionId ? {sessionId:params.sessionId} : {}) };
    const prefix = JSON.stringify([params.actorId??null,params.sessionId??null]);
    let released;
    if (command === 'Input.dispatchMouseEvent' && value.type === 'mouseMoved' && Number.isFinite(value.x) && Number.isFinite(value.y)) {
      for (const [key, input] of control.held) if (key.startsWith(prefix + ':mouse:')) input.params = {...input.params,x:value.x,y:value.y};
    }
    if (command === 'Input.dispatchMouseEvent' && value.button && value.button !== 'none') {
      const key = prefix + ':mouse:' + value.button;
      if (value.type === 'mousePressed') control.held.set(key, { actorId:params.actorId,sessionId: params.sessionId, method: command, params: { ...value, type: 'mouseReleased', buttons: 0 } });
      if (value.type === 'mouseReleased') released = key;
    }
    if (command === 'Input.dispatchKeyEvent') {
      const key = prefix + ':key:' + (value.code ?? value.windowsVirtualKeyCode ?? value.key);
      if (['keyDown', 'rawKeyDown'].includes(value.type)) control.held.set(key, { actorId:params.actorId,sessionId: params.sessionId, method: command, params: { ...value, type: 'keyUp', text: undefined, unmodifiedText: undefined, modifiers: 0 } });
      if (value.type === 'keyUp') released = key;
    }
    let result;
    try { result = await (command === 'Page.captureScreenshot' ? control.cursor.capture(() => chrome.debugger.sendCommand(session, command, value)) : chrome.debugger.sendCommand(session, command, value)); }
    catch (cause) {
      if (/Debugger is not attached to the tab|No tab with id/.test(cause.message)) {
        lostControl(control, 'debugger-disconnected');
        throw failed('Browser control has ended; explicitly select the tab again', 'CONTROL_STOPPED');
      }
      throw cause;
    }
    if (released) control.held.delete(released);
    return result ?? {};
  };
  // CDP is concurrent: a pending Runtime evaluation may need a dialog reply,
  // frame resume, or input release before it can finish. The caller/manager
  // orders UI actions; the transport must not serialize protocol responses.
  return action();
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  const control = controls.get(source.tabId); if (!control || control.stopped) return;
  if (!source.sessionId && method === 'Page.frameNavigated' && !params.frame.parentId) { control.cursor.invalidate(); control.cursorError = null; }
  if (!source.sessionId && method === 'Page.javascriptDialogOpening') control.cursor.setDialog(true);
  if (!source.sessionId && method === 'Page.javascriptDialogClosed') control.cursor.setDialog(false);
  if (method === 'Target.attachedToTarget') control.children.set(params.sessionId, params.targetInfo.targetId);
  if (method === 'Target.detachedFromTarget') control.children.delete(params.sessionId);
  send({ event: 'cdp', params: { tabId: source.tabId, leaseId: control.leaseId, ...(source.sessionId ? {sessionId:source.sessionId} : {}), method, params } });
});
chrome.debugger.onDetach.addListener((source, reason) => {
  const control = controls.get(source.tabId); if (!control) return;
  lostControl(control, reason);
});
chrome.tabs.onUpdated.addListener((tabId,change,tab)=>{const control=controls.get(tabId);if(control&&!control.stopped&&(change.url!==undefined||change.title!==undefined))send({event:'tab-updated',params:{...describe(tab),tabId,leaseId:control.leaseId}});});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
  const run = async () => {
    if (message.action === 'connect') { enabled = true; await chrome.storage.local.set({enabled}); await connect(); }
    if (message.action === 'disconnect') { enabled = false; await chrome.storage.local.set({enabled}); const released = await stopAll('user-disconnected'); port?.disconnect(); port = null; ready = false; if (released) { error = ''; detail = ''; } }
    if (message.action === 'stop') {
      const control = controls.get(message.tabId); if (control) await stop(control, 'user-stopped');
    }
    const releaseErrors = [...controls.values()].flatMap(control=>[control.stopError,...control.actorErrors.values()]).filter(Boolean);
    const cursorErrors = [...controls.values()].filter(control=>!control.stopped&&control.cursorError).map(control=>control.cursorError);
    return { connected: ready, connecting: !!port && !ready, error: error || (releaseErrors.length ? '部分按键尚未确认释放，请重试停止。' : cursorErrors.length ? '小鼠标显示暂不可用，网页操作仍可继续。' : ''), detail: detail || [...releaseErrors,...cursorErrors].join('\n'), controls: await Promise.all([...controls.values()].map(async control => ({...describe(await chrome.tabs.get(control.tabId)),stopped:control.stopped,stopping:!!control.stopping||control.actorStops.size>0,stopError:control.stopError||[...control.actorErrors.values()][0],cursorError:control.cursorError??null}))) };
  };
  void run().then(respond, cause => respond({error:cause.message,connected:ready,controls:[]})); return true;
});
chrome.runtime.onStartup.addListener(() => { void connect(); });
chrome.runtime.onInstalled.addListener(() => { void connect(); });
void connect();
import { CursorOverlay } from './cursor.js';
