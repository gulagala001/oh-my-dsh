const actions = new Set(['capabilities', 'prepare', 'ready', 'snapshot', 'updateCue', 'load', 'show', 'freeze', 'end']);
const requiredIdentity = ['title', 'url', 'providerTabId'];
const failure = (message, code = 'STALE_TARGET') => Object.assign(new Error(message), {code});
const windowReleased = result => result?.ended === true && result.windowDestroyed === true && result.webContentsDestroyed === true;
const physicallyReleased = (entry, proof) => proof?.epoch === entry.browserEpoch && proof.released === true && proof.providerClosed === true;

/** Authenticated UI adapter; it never claims, stops, or focuses the source page. */
export class PluginTabDragPreviewActions {
  constructor(manager) {this.manager = manager; this.previews = new Map(); this.closed = false;}
  async source(sessionId, input, signal) {
    const manager = this.manager;
    if (this.closed || manager.closed || !manager.enabled) throw failure('Computer Use is disabled', 'CONTROL_STOPPED');
    const state = manager.session(sessionId), browser = manager.browserFor(input.browserId), binding = manager.pluginBrowserBinding;
    if (browser.hub !== binding?.hub || browser.info.epoch !== input.browserEpoch) throw failure('The browser generation changed');
    if (input.controlEpoch !== state.controlEpoch || state.uiAction || state.resuming) throw failure('The conversation control state changed', 'CONTROL_CHANGED');
    const expected = input.expected;
    if (!expected || typeof expected !== 'object' || Array.isArray(expected)
      || requiredIdentity.some(key => typeof expected[key] !== 'string')) throw new TypeError('The actual displayed browser tab identity is required');
    signal?.throwIfAborted();
    const tab = (await manager.listUserTabs(sessionId)).find(tab => tab.id === input.tabId && tab.browserId === input.browserId);
    signal?.throwIfAborted();
    if (manager.pluginBrowserBinding !== binding || browser.info.epoch !== input.browserEpoch
      || state.controlEpoch !== input.controlEpoch || state.uiAction || state.resuming) throw failure('The browser or conversation changed while checking its page', 'CONTROL_CHANGED');
    if (!tab?.available || tab.detached || requiredIdentity.some(key => tab[key] !== expected[key])) throw failure('The browser page changed or belongs to another conversation');
    if (!Number.isSafeInteger(tab.nativeTabId) || tab.nativeTabId <= 0) throw failure('The browser page has no native identity');
    return {sessionId, browser, binding, browserEpoch: input.browserEpoch, tabId: tab.id, nativeTabId: tab.nativeTabId};
  }
  async call(entry, action, payload = {}, signal) {
    if (this.manager.pluginBrowserBinding !== entry.binding || entry.browser.info.epoch !== entry.browserEpoch) throw failure('The browser generation changed');
    return entry.browser.call('tabDragPreview.' + action, {tabId: entry.nativeTabId, previewId: entry.previewId, ...payload}, {signal, trustedUserAction: true});
  }
  async release(entry, signal) {
    const provider = entry.binding.provider;
    if (physicallyReleased(entry, provider.releaseProof)) return {providerReleaseProof: structuredClone(provider.releaseProof)};
    try {
      const result = await this.call(entry, 'end', {}, signal);
      if (windowReleased(result)) return result;
      throw failure('Native drag preview cleanup was not confirmed', 'PRESENTATION_CLEANUP_UNCONFIRMED');
    } catch (error) {
      let timer;
      const proof = physicallyReleased(entry, provider.releaseProof) ? provider.releaseProof
        : await Promise.race([provider.waitForRelease?.() ?? null,
          new Promise(resolve => {timer = setTimeout(() => resolve(null), 3000);})]).finally(() => clearTimeout(timer));
      if (physicallyReleased(entry, proof)) return {providerReleaseProof: structuredClone(proof)};
      throw error;
    }
  }
  async handle(sessionId, input, signal) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !actions.has(input.action)) throw new TypeError('A finite tab drag preview action is required');
    if (input.action === 'capabilities') {
      const browser = this.manager.extensionBrowsers.get('desktop-browser');
      if (!browser || this.closed || this.manager.closed || !this.manager.enabled) return {available: false};
      if (browser.hub !== this.manager.pluginBrowserBinding?.hub) return {available: false};
      return browser.call('tabDragPreview.capabilities', {}, {signal, trustedUserAction: true});
    }
    if (input.action === 'prepare') {
      const entry = await this.source(sessionId, input, signal);
      const prepared = await entry.browser.call('tabDragPreview.prepare', {tabId: entry.nativeTabId}, {signal, trustedUserAction: true});
      if (prepared.available !== true) return prepared;
      if (typeof prepared.previewId !== 'string' || !prepared.previewId || !Number.isSafeInteger(prepared.windowId) || prepared.windowId <= 0) throw failure('The native preview did not issue its identity', 'PRESENTATION_UNAVAILABLE');
      entry.previewId = prepared.previewId; this.previews.set(entry.previewId, entry);
      try {signal?.throwIfAborted(); await this.source(sessionId, input, signal);}
      catch (error) {
        try {await this.release(entry); this.previews.delete(entry.previewId);}
        catch (cleanupError) {throw new AggregateError([error, cleanupError], 'Drag preparation failed with retained native preview ownership');}
        throw error;
      }
      return prepared;
    }
    const entry = this.previews.get(input.previewId);
    if (!entry || entry.sessionId !== sessionId || input.browserId !== entry.browser.id || input.browserEpoch !== entry.browserEpoch || input.tabId !== entry.tabId) throw failure('Native drag preview ownership has ended');
    if (input.action === 'end') {
      const result = await this.release(entry, signal);
      this.previews.delete(entry.previewId);
      return result;
    }
    await this.source(sessionId, input, signal);
    const payload = input.action === 'load' ? {snapshot: input.snapshot} : input.action === 'updateCue' ? {cue: input.cue} : {};
    const result = await this.call(entry, input.action, payload, signal);
    await this.source(sessionId, input, signal);
    return result;
  }
  async dispose() {
    this.closed = true;
    const results = await Promise.allSettled([...this.previews.values()].map(async entry => {
      await this.release(entry); this.previews.delete(entry.previewId);
    }));
    const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
    if (failures.length) throw new AggregateError(failures, 'Native drag preview cleanup failed');
    this.previews.clear();
  }
}
