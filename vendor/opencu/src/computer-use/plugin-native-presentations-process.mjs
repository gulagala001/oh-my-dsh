import { app, BrowserWindow, screen } from 'electron';
import { Socket } from 'node:net';
import { isAbsolute } from 'node:path';
import { createPresentationChannel, DEFAULT_TIMEOUT_MS, MAX_PENDING_REQUESTS, METHODS, PRESENTATIONS_PROTOCOL,
  deferred, errorValue, fail, nonempty, record } from '../../native/desktop-presentations/ipc.mjs';
import { PluginNativePresentationBroker } from '../../native/desktop-presentations/broker.mjs';
import { loadPluginNativePresentations } from '../../native/desktop-presentations/loader.mjs';

const directoryFlag = process.argv.indexOf('--opencu-native-directory');
const directory = directoryFlag >= 0 ? process.argv[directoryFlag + 1] : undefined;
if (process.type !== 'browser' || !directory || !isAbsolute(directory)) throw new Error('The plugin presentation process requires its own official Electron main runtime and data directory');
app.setName('OpenCU Native Presentations');
app.setPath('userData', directory);
app.setPath('sessionData', directory);
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');

const initialize = deferred(), pending = new Map(), writes = new Set();
let epoch, nonce, window, broker, releasing, quitting = false, channelFailure;
const stream = new Socket({ fd: 3, readable: true, writable: true });
const send = message => {
  const promise = channel.send({ ...message, epoch });
  writes.add(promise);
  void promise.then(() => writes.delete(promise), error => { writes.delete(promise); channelLost(error); });
  return promise;
};
const channelLost = error => {
  if (channelFailure) return;
  channelFailure = error; initialize.reject(error);
  void shutdown(undefined, true);
};
const channel = createPresentationChannel(stream, message => {
  if (epoch === undefined) {
    if (message.type !== 'initialize' || message.protocol !== PRESENTATIONS_PROTOCOL || !nonempty(message.epoch) || !nonempty(message.nonce)) throw fail('Invalid plugin native presentation initialization', 'INVALID_MESSAGE');
    epoch = message.epoch; nonce = message.nonce; initialize.resolve(); return;
  }
  if (message.epoch !== epoch) throw fail('The native presentation channel generation changed', 'HOST_GENERATION_CHANGED');
  if (message.type === 'release') {
    if (!nonempty(message.requestId)) throw fail('Invalid native presentation release request', 'INVALID_MESSAGE');
    void shutdown(message.requestId); return;
  }
  if (message.type === 'cancel') {
    if (!nonempty(message.requestId)) throw fail('Invalid native presentation cancellation', 'INVALID_MESSAGE');
    pending.get(message.requestId)?.controller.abort(fail('The native request was cancelled', 'CANCELLED')); return;
  }
  if (message.type !== 'request' || !nonempty(message.requestId) || !METHODS.has(message.method) || !record(message.params)) throw fail('Invalid native presentation request', 'INVALID_MESSAGE');
  if (!broker || releasing || quitting) {
    void send({ type: 'response', requestId: message.requestId, ok: false,
      error: errorValue(fail('The plugin native presentation provider is closing or not ready', 'PROVIDER_CLOSED')) }); return;
  }
  if (pending.has(message.requestId) || pending.size >= MAX_PENDING_REQUESTS) {
    void send({ type: 'response', requestId: message.requestId, ok: false, error: errorValue(fail('The native provider request capacity was reached', 'BUSY')) }); return;
  }
  const controller = new AbortController(), request = { controller, task: undefined };
  pending.set(message.requestId, request);
  request.task = Promise.resolve().then(() => broker.handle(message.method, message.params, { signal: controller.signal }))
    .then(result => send({ type: 'response', requestId: message.requestId, ok: true, result }),
      error => send({ type: 'response', requestId: message.requestId, ok: false, error: errorValue(error) }))
    .finally(() => pending.delete(message.requestId));
  void request.task.catch(channelLost);
}, channelLost);

function getWindow() {
  if (window && !window.isDestroyed()) return window;
  const loaded = loadPluginNativePresentations(app);
  if (loaded.kind !== 'available') return undefined;
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(448, area.width), height = Math.min(448, area.height);
  window = new BrowserWindow({ x: area.x + area.width - width, y: area.y + 24, width, height,
    show: false, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    focusable: false, skipTaskbar: true, resizable: false, minimizable: false, maximizable: false,
    fullscreenable: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false } });
  window.setIgnoreMouseEvents(true);
  window.showInactive();
  window.once('closed', () => { if (!quitting) void shutdown(undefined, true); });
  return window;
}

async function shutdown(requestId, lost = false) {
  if (releasing) {
    if (requestId) {
      try { await releasing; } catch (error) {
        if (!channel.closed) await send({ type: 'release-failed', requestId, error: errorValue(error) });
      }
    }
    return;
  }
  const task = (async () => {
    for (const request of pending.values()) request.controller.abort(fail('The native provider is releasing', 'PROVIDER_CLOSED'));
    const result = await broker?.dispose();
    await Promise.allSettled([...pending.values()].map(request => request.task));
    // Native hostClosed follows its flushed detach events; socket writes preserve that order.
    await Promise.all([...writes]);
    if (window && !window.isDestroyed()) window.destroy();
    quitting = true;
    if (requestId && !channel.closed) await send({ type: 'released', requestId, released: true,
      providerClosed: true, nativeHostClosed: result?.nativeHostClosed === true || broker === undefined,
      nativeHostCreated: result?.nativeHostCreated === true, nativeTerminalDelivered: result?.nativeTerminalDelivered === true });
    app.quit();
  })();
  releasing = task;
  try { await task; } catch (error) {
    releasing = undefined;
    if (requestId && !channel.closed) {
      try { await send({ type: 'release-failed', requestId, error: errorValue(error) }); } catch {}
    }
    // If the only trusted channel is lost, OS-observed exit is the parent's destruction proof.
    if (lost || channel.closed) { quitting = true; app.exit(1); }
  }
}

app.on('before-quit', event => { if (!quitting) { event.preventDefault(); void shutdown(undefined, true); } });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { void shutdown(undefined, true); });
process.on('uncaughtException', error => { channelLost(error); });
process.on('unhandledRejection', error => { channelLost(error instanceof Error ? error : new Error(String(error))); });

// Electron emits ready after its main module finishes loading; do not block that with top-level await.
void (async () => {
  let timer;
  try {
    await Promise.race([initialize.promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(fail('The parent did not initialize the native presentation socket', 'TIMEOUT')), DEFAULT_TIMEOUT_MS);
    })]);
    await app.whenReady();
    if (channelFailure || quitting) throw channelFailure ?? fail('The native provider closed before startup', 'PROVIDER_CLOSED');
    app.dock?.hide();
    broker = new PluginNativePresentationBroker({ load: () => loadPluginNativePresentations(app), getWindow,
      onEvent: (event, params) => { void send({ type: 'event', event, params }).catch(channelLost); },
      onError: error => {
        void send({ type: 'failure', error: errorValue(error) }).catch(channelLost);
        void shutdown(undefined, true);
      } });
    await send({ type: 'ready', protocol: PRESENTATIONS_PROTOCOL, nonce, pid: process.pid, capabilities: broker.capabilities() });
  } catch (error) {
    if (epoch && !channel.closed) { try { await send({ type: 'failure', error: errorValue(error) }); } catch {} }
    await shutdown(undefined, true);
  } finally { clearTimeout(timer); }
})();
