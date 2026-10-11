export const BROWSER_PROTOCOL = 1;
export const MAX_MESSAGE_BYTES = 24 * 1024 * 1024;
export const MAX_PENDING_REQUESTS = 128;
export const MAX_TIMEOUT_MS = 300000;
export const DEFAULT_TIMEOUT_MS = 30000;
export const METHODS = new Set(['browser.info', 'browser.nativeCapabilities', 'tabs.list', 'tabs.create',
  'tabs.cancelCreate', 'tabs.commitCreate', 'tabs.get', 'tabs.focus', 'tabs.presentation', 'tabs.zoom', 'tabs.agentActivity',
  'tabs.captureClipboard', 'tabs.pageInfo', 'annotation.preloadIdentity', 'attach', 'command', 'stop-actor', 'stop', 'detach', 'close',
  'permissions.list', 'permissions.respond', 'permissions.openSystemSettings', 'history.search', 'history.remove',
  'downloads.list', 'downloads.arm', 'downloads.disarm', 'downloads.wait', 'downloads.action',
  'downloads.getHistory', 'downloads.searchHistory', 'downloads.removeFromHistory', 'fileUpload.resolve', 'tabs.detach',
  'browserDetached.get', 'browserDetached.focus', 'browserDetached.focusSource', 'browserDetached.setAlwaysOnTop', 'browserDetached.restore']);
for (const method of ['browser.authNewTargetProtection', 'browser.authServiceWorkerProtection',
  'browser.authBroker.bind', 'browser.authBroker.register', 'browser.authBroker.wait', 'browser.authBroker.complete',
  'browser.authBroker.close', 'browser.authBroker.present', 'browser.authBroker.status', 'browser.authBroker.qrCodeSnapshot']) METHODS.add(method);
for (const method of ['history.query', 'history.clear', 'history.dateCounts', 'history.capabilities', 'downloads.getSnapshot', 'downloads.pause', 'downloads.resume',
  'downloads.cancel', 'downloads.removeFromHistory', 'downloads.open', 'downloads.showInFolder', 'downloads.acknowledge',
  'downloads.clearHistory', 'downloads.showDownloadsFolder', 'profile.downloads.getSnapshot', 'profile.downloads.searchHistory',
  'profile.downloads.pause', 'profile.downloads.resume', 'profile.downloads.cancel', 'profile.downloads.removeFromHistory',
  'profile.downloads.open', 'profile.downloads.showInFolder', 'profile.downloads.acknowledge', 'profile.downloads.clearHistory',
  'profile.downloads.showDownloadsFolder']) METHODS.add(method);
for (const method of ['preferences.get', 'preferences.set', 'preferences.chooseDownloadDirectory', 'preferences.resetDownloadDirectory',
  'browsingData.settings', 'browsingData.summary', 'browsingData.clear']) METHODS.add(method);
for (const method of ['profileImport.getSignals', 'profileImport.list', 'profileImport.chooseSource', 'profileImport.import', 'profileImport.cancelSelection']) METHODS.add(method);
for (const method of ['passwordFileImport.getSignals', 'passwordFileImport.chooseSource', 'passwordFileImport.import', 'passwordFileImport.cancel']) METHODS.add(method);
for (const method of ['nativeProfileImport.getSignals', 'nativeProfileImport.list', 'nativeProfileImport.grantSelection', 'nativeProfileImport.import', 'nativeProfileImport.cancel',
  'siteSettings.get', 'siteSettings.set', 'siteSettings.reset', 'siteSettings.clear', 'siteSettings.open']) METHODS.add(method);
for (const method of ['tabDragPreview.capabilities', 'tabDragPreview.prepare', 'tabDragPreview.ready', 'tabDragPreview.snapshot',
  'tabDragPreview.updateCue', 'tabDragPreview.load', 'tabDragPreview.show', 'tabDragPreview.freeze', 'tabDragPreview.end']) METHODS.add(method);
export const EVENTS = new Set(['cdp', 'stopped', 'actor-stopped', 'tab-updated', 'tabs-invalidated',
  'tab-zoom-changed', 'tab-presentation-changed', 'file-upload-requested', 'permission-prompt',
  'permission-prompt-closed', 'download-created', 'download-updated', 'download-done', 'download-permit-closed',
  'browser-detached-changed', 'history-changed', 'download-history-changed']);
EVENTS.add('download-store-error');
EVENTS.add('preferences-changed');
EVENTS.add('page-info-dialog-closed');
export const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const nonempty = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
export const fail = (message, code = 'BROWSER_UNAVAILABLE') => Object.assign(new Error(message), { code });
export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => {});
  return { promise, resolve, reject };
};
export function jsonValue(value, depth = 0, budget = { entries: 0 }) {
  if (++budget.entries > 1048576 || depth > 64) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= MAX_MESSAGE_BYTES;
  if (Array.isArray(value)) return value.length <= 262144 && value.every(item => jsonValue(item, depth + 1, budget));
  if (!record(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  const entries = Object.entries(value);
  return entries.length <= 4096 && entries.every(([key, item]) => key.length <= 4096 && jsonValue(item, depth + 1, budget));
}
export function errorValue(error) {
  return { message: error instanceof Error ? error.message : String(error),
    code: typeof error?.code === 'string' ? error.code : 'PROVIDER_ERROR',
    ...(Number.isSafeInteger(error?.cdpCode) ? { cdpCode: error.cdpCode } : {}),
    ...(typeof error?.released === 'boolean' ? { released: error.released } : {}) };
}
export function remoteError(value) {
  if (!record(value) || typeof value.message !== 'string' || typeof value.code !== 'string') return fail('Invalid browser provider error', 'INVALID_RESPONSE');
  return Object.assign(fail(value.message, value.code),
    Number.isSafeInteger(value.cdpCode) ? { cdpCode: value.cdpCode } : {},
    typeof value.released === 'boolean' ? { released: value.released } : {});
}

// Private inherited parent/main socket, never a renderer or public debugging endpoint.
export function createBrowserChannel(stream, onMessage, onClosed) {
  let buffered = Buffer.alloc(0), closed = false, queuedBytes = 0;
  const stop = error => {
    if (closed) return;
    closed = true;
    onClosed(error ?? fail('The plugin browser channel closed', 'DISCONNECTED'));
  };
  stream.on('data', chunk => {
    if (closed) return;
    buffered = Buffer.concat([buffered, chunk]);
    while (true) {
      const index = buffered.indexOf(10);
      if (index < 0) break;
      if (index + 1 > MAX_MESSAGE_BYTES) { stop(fail('Browser message exceeds its byte limit', 'RESOURCE_LIMIT')); stream.destroy(); return; }
      const line = buffered.subarray(0, index); buffered = buffered.subarray(index + 1);
      try {
        const message = JSON.parse(line.toString('utf8'));
        if (!record(message) || !jsonValue(message)) throw fail('Invalid browser message', 'INVALID_MESSAGE');
        onMessage(message);
      } catch (error) { stop(error); stream.destroy(); return; }
    }
    if (buffered.length > MAX_MESSAGE_BYTES) { stop(fail('Browser message exceeds its byte limit', 'RESOURCE_LIMIT')); stream.destroy(); }
  });
  stream.on('error', stop);
  stream.on('end', () => stop(buffered.length ? fail('Browser message was truncated', 'INVALID_MESSAGE') : undefined));
  stream.on('close', () => stop());
  return {
    get closed() { return closed; },
    send(message) {
      if (closed || stream.destroyed || !stream.writable) return Promise.reject(fail('Browser channel is unavailable', 'DISCONNECTED'));
      if (!jsonValue(message)) return Promise.reject(fail('Browser payload is not finite JSON', 'INVALID_ARGUMENT'));
      const line = JSON.stringify(message) + '\n', bytes = Buffer.byteLength(line);
      if (bytes > MAX_MESSAGE_BYTES || queuedBytes + bytes > MAX_MESSAGE_BYTES * 2) return Promise.reject(fail('Browser channel reached its byte limit', 'RESOURCE_LIMIT'));
      queuedBytes += bytes;
      return new Promise((resolve, reject) => stream.write(line, error => {
        queuedBytes -= bytes;
        if (error) { stop(error); reject(error); } else resolve();
      }));
    },
    destroy() { stream.destroy(); },
  };
}
