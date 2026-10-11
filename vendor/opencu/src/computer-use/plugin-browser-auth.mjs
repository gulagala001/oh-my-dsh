import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { handleBrowserAuthHandoff } from './browser-auth-controller.mjs';
import { createBrowserAuthCdpAdapter, resolveBrowserAuthTabId } from './browser-auth-cdp.mjs';
import { BrowserAuthDocumentResponses } from './browser-auth-document-responses.mjs';
import { createBrowserAuthPlaywright } from './browser-auth-playwright.mjs';
import { createBrowserAuthObservationRegistry, CredentialObservationError } from './browser-auth-observation-gate.mjs';
import { decodeBrowserAuthQrCode, startBrowserAuthQrCodeWatch } from './browser-auth-qr.mjs';
import { browserAuthSessionEnvironment } from './browser-auth-session.mjs';

const json = value => JSON.parse(JSON.stringify(value));
const unavailable = () => Object.assign(new Error('Secure browser authentication is unavailable'), { code: 'CAPABILITY_UNAVAILABLE' });
const targetCommands = {
  'browserAuth.request': 'tab_browser_auth_handoff', screenshot: 'tab_screenshot',
  goto: 'navigate_tab_url', back: 'navigate_tab_back', forward: 'navigate_tab_forward', reload: 'navigate_tab_reload', close: 'close_tab',
  domSnapshot: 'playwright_dom_snapshot', 'playwright.domSnapshot': 'playwright_dom_snapshot', evaluate: 'playwright_evaluate',
  getScreenshot: 'tab_screenshot', getAXState: 'tab_ax_get_state', getAXStateAndScreenshot: 'tab_ax_get_state',
  click: 'cua_click', doubleClick: 'cua_double_click', move: 'cua_move', drag: 'cua_drag', scroll: 'cua_scroll',
  type: 'cua_type', typeText: 'cua_type', keypress: 'cua_keypress', pressKey: 'cua_keypress', 'dialog.accept': 'tab_handle_js_dialog', 'dialog.dismiss': 'tab_handle_js_dialog',
};

// One registry spans every model command, including native commands that could
// otherwise observe the private sign-in window through a second CU backend.
export class PluginBrowserAuthProvider {
  #manager; #registry; #context = new AsyncLocalStorage(); #connections = new Map(); #active = new Set(); #permitted = new Map(); #closed = false;
  constructor(manager) {
    this.#manager = manager;
    // This runtime has no native credential broker until the owned service is bound.
    this.#registry = createBrowserAuthObservationRegistry({ nativeCredentialObservationRequired: false });
  }
  get enabled() { return !this.#closed; }
  get secure() { return true; }
  isAvailable(record) {
    const binding = this.#manager.pluginBrowserBinding;
    const browser = this.#manager.extensionBrowsers.get(record.browserId);
    return !this.#closed && binding?.hub === browser?.hub && typeof binding?.provider?.requestBrowserAuth === 'function'
      && typeof this.#manager.filePolicy?.assertExecution === 'function';
  }
  canObserve() { return this.#active.size === 0 && this.#registry.canObserveRetainedData(); }
  canPreview(browser, view) {
    if (this.#active.size) return false;
    return this.#registry.canObserveRetainedData()
      || !!view?.loaderId && this.#permitted.get(browser.id + ':' + view.tabId) === view.loaderId;
  }
  #command(method, args) {
    const command = { type: 'other' };
    if (method === 'target' && args[0]?.kind === 'tab') {
      const [target, operation, parameters = []] = args;
      const browser = this.#manager.browserForTab(target.id, target.browserId);
      const nativeId = browser.records.get(target.id)?.nativeTabId;
      command.browser_id = browser.id; command.tab_id = String(nativeId);
      command.type = targetCommands[operation] ?? 'other';
      if (operation === 'locator' && Array.isArray(parameters)) {
        const action = parameters[1];
        const names = { click: 'click', dblclick: 'dblclick', fill: 'fill', count: 'count', innerText: 'inner_text',
          textContent: 'text_content', allTextContents: 'all_text_contents', getAttribute: 'get_attribute',
          isVisible: 'is_visible', isEnabled: 'is_enabled', press: 'press', pressSequentially: 'press_sequentially',
          selectOption: 'select_option', setChecked: 'set_checked', waitFor: 'wait_for' };
        if (names[action]) command.type = 'playwright_locator_' + names[action];
      }
    } else if (method === 'listBrowsers') command.type = 'list_browsers';
    else if (method === 'getBrowser') command.type = 'get_browser';
    else if (method === 'createBrowserTab' && this.#manager.pluginBrowserEnabled) { command.type = 'create_tab'; command.browser_id = args[0]; }
    else if (method === 'browserNameSession') command.type = 'name_session';
    else if (method === 'browserVisibility') command.type = 'browser_visibility_set';
    return command;
  }
  async dispatch(sessionId, method, args, execute) {
    if (this.#closed) throw unavailable();
    if (this.#active.size) throw new CredentialObservationError('credential_delivery_in_progress');
    const command = this.#command(method, args);
    let created;
    const guarded = this.#registry.guardModelCommand(async (_command, finish) => this.#context.run({ sessionId, finish }, async () => {
      let navigation;
      if (['navigate_tab_url', 'navigate_tab_back', 'navigate_tab_forward', 'navigate_tab_reload'].includes(command.type)) {
        const browser = this.#manager.browserFor(command.browser_id), connection = this.#connections.get(browser);
        if (connection?.gate.usedNativeCredentials) {
          const target = args[0], record = await browser.target(sessionId, target.id);
          await connection.cdp.registerRecord(record);
          const tabId = resolveBrowserAuthTabId({ browser, record });
          navigation = { connection, browser, record, tabId, epoch: connection.gate.epoch,
            loaderId: await connection.gate.readLoader(tabId) };
          this.#permitted.delete(browser.id + ':' + target.id);
        }
      }
      const result = await execute();
      if (navigation) {
        const { connection, browser, record, tabId, epoch, loaderId } = navigation;
        const actual = await connection.gate.readLoader(tabId);
        if (actual !== loaderId && epoch === connection.gate.epoch) {
          connection.gate.permitNavigatedDocument(tabId, actual, epoch);
          this.#permitted.set(browser.id + ':' + record.id, actual);
        }
      }
      if (command.type === 'create_tab') {
        created = result;
        return { id: String(this.#manager.browserFor(result.browserId).records.get(result.id)?.nativeTabId) };
      }
      return result;
    }), {
      resolveBrowserId: id => this.#manager.browserFor(id).id,
      parseRestrictedBrowserResult: (_type, result) => {
        const limited = value => ({ id: value.id, name: value.name, family: value.family,
          type: value.type, capabilities: value.capabilities });
        return Array.isArray(result) ? result.map(limited) : limited(result);
      },
    });
    const result = await guarded(command);
    if (created) return this.#registry.canObserveRetainedData() ? created : { ...created, title: '', url: '' };
    return result;
  }
  async #connection(browser, record, signal) {
    let current = this.#connections.get(browser);
    if (!current) {
      const cdp = await createBrowserAuthCdpAdapter({ browser });
      const gate = this.#registry.forBrowser(browser.id, cdp);
      const requests = new BrowserAuthDocumentResponses(cdp);
      current = { cdp, gate, requests, unbind: gate.bindNavigationEvents(cdp) };
      this.#connections.set(browser, current);
    }
    await current.cdp.registerRecord(record, { signal });
    return current;
  }
  async request(input, { record, signal }) {
    if (!this.isAvailable(record)) throw unavailable();
    this.#manager.filePolicy.assertExecution(record);
    const execution = this.#context.getStore();
    if (execution?.sessionId !== record.sessionId || typeof execution.finish !== 'function') throw unavailable();
    if (input.otpHandle !== undefined) return { status: 'unavailable' };
    const manager = this.#manager, browser = manager.browserFor(record.browserId), native = manager.pluginBrowserBinding.provider;
    const link = await browser.existingLink(record.sessionId, record.id, signal);
    if (link.record !== record) throw unavailable();
    const binding = { tabId: link.nativeTabId, leaseId: link.gateway.leaseId, actorId: link.link.clientId };
    const call = (method, params, options = {}) => native.requestBrowserAuth('browser.authBroker.' + method,
      json(params), { timeoutMs: 300000, ...options });
    const bound = await call('bind', { ...binding, sessionId: record.sessionId }, { signal });
    if (bound?.bound !== true || bound.sessionId !== record.sessionId) throw unavailable();
    await this.#registry.initializeNativeCredentialObservation({
      assertBinding: () => manager.pluginBrowserBinding?.provider === native && !native.released,
      readStatus: async () => {
        const result = await call('status', { session_id: record.sessionId });
        if (result?.type !== 'native_observation_status' || typeof result.used !== 'boolean') throw unavailable();
        return result.used;
      },
    });
    const active = { record, controller: new AbortController() };
    const operationSignal = AbortSignal.any([signal, active.controller.signal].filter(Boolean));
    const { cdp, gate, requests } = await this.#connection(browser, record, operationSignal);
    const tabId = resolveBrowserAuthTabId({ browser, record });
    const playwright = createBrowserAuthPlaywright({ browser, record, signal: operationSignal });
    const prototype = Object.getPrototypeOf(record.page.locator(''));
    const selector = value => {
      if (typeof value === 'string') return value;
      if (!value || Object.getPrototypeOf(value) !== prototype || value.page() !== record.page
        || value._frame !== record.page.mainFrame() || typeof value._selector !== 'string') throw unavailable();
      return value._selector;
    };
    const params = { ...input, fields: (input.fields ?? []).map(field => ({ ...field, selector: selector(field.selector) })),
      ...(input.options ? { options: input.options.map(option => ({ ...option, ...(option.selector !== undefined ? { selector: selector(option.selector) } : {}) })) } : {}),
      ...(input.submit ? { submit: { ...input.submit, selector: selector(input.submit.selector) } } : {}) };
    const protectionId = randomUUID(), transports = new Set();
    const protection = { ...binding, protectionId };
    let protectedInput = false, credentialsProtected = false, nativeProtected = false, nativeWorkersProtected = false, releaseRaw, releaseBypass;
    const ensureProtected = async () => {
      if (protectedInput) return;
      this.#active.add(active);
      execution.finish();
      await this.#registry.waitForObservations();
      operationSignal.throwIfAborted();
      releaseRaw = cdp.suppressRawNetworkEvents(tabId);
      releaseBypass = await cdp.protectBrowserAuthServiceWorkerBypass(tabId);
      const popup = await browser.call('browser.authNewTargetProtection', { ...protection, action: 'acquire' }, { signal: operationSignal });
      if (popup?.protected !== true) throw unavailable();
      nativeProtected = true;
      const workers = await browser.call('browser.authServiceWorkerProtection', { ...protection, action: 'acquire' }, { signal: operationSignal });
      if (workers?.protected !== true) throw unavailable();
      nativeWorkersProtected = true; protectedInput = true;
      manager.preview.clear();
      for (const views of [manager.browserViews, ...manager.extensionViews.values()]) {
        views.frames.clear();
        for (const view of views.views.values()) { view.latest = undefined; view.frames = []; }
      }
    };
    const createTransport = async () => {
      await ensureProtected();
      let callback, challengeId, closed = false, closing, registration;
      const listeners = new Set(), tasks = new Set();
      const notify = message => { if (!closed) callback?.(message); };
      const track = task => { tasks.add(task); void task.finally(() => tasks.delete(task)).catch(() => {}); return task; };
      const transport = {
        setMessageCallback(value) { callback = value; }, addCloseListener(value) { listeners.add(value); },
        sendMessage(message) {
          if (closed) throw unavailable();
          const task = (async () => {
            if (message.type === 'register') {
              if (registration) throw unavailable();
              registration = call('register', { ...protection, sessionId: record.sessionId, registration: message }, { signal: operationSignal });
              const registered = await registration; challengeId = registered.challenge_id;
              if (closed) { await call('close', { challenge_id: challengeId }); return; }
              notify(registered);
              void track(call('wait', { challenge_id: challengeId }, { signal: operationSignal }).then(async message => {
                if (message.type === 'submission' && (Object.values(message.fields ?? {}).some(value => typeof value === 'string' && value.length > 0)
                  || message.native_credential_delivery === true || message.ordinary_credential_delivery === true
                  || message.manual_credential_save === true || message.email_otp_delivery === true) && !credentialsProtected) {
                  await gate.protect(tabId, execution.finish);
                  this.#permitted.clear();
                  cdp.protectBrowserAuthCredentialDiagnostics(tabId);
                  credentialsProtected = true;
                }
                notify(message);
              }).catch(error => transport.close(error)));
            } else if (message.type === 'qr_code_snapshot' && message.challenge_id === challengeId) {
              await call('qrCodeSnapshot', message, { signal: operationSignal });
            } else if (message.type === 'result' && message.challenge_id === challengeId) {
              notify(await call('complete', message, { signal: operationSignal }));
            } else throw unavailable();
          })();
          void track(task).catch(error => transport.close(error));
        },
        close(error) {
          if (closed) return;
          closed = true;
          closing = (async () => {
            await registration?.catch(() => {});
            if (challengeId) await call('close', { challenge_id: challengeId });
            await Promise.allSettled([...tasks]);
          })();
          void closing.catch(() => {});
          if (error) for (const listener of listeners) listener(error);
        },
        async settled() { transport.close(); await closing; },
      };
      transports.add(transport); return transport;
    };
    try {
      const privateCdp = new Proxy(cdp, { get(target, key) {
        if (key === 'call') return (id, method, params, options = {}) => target.call(id, method, params,
          { ...options, signal: AbortSignal.any([operationSignal, options.signal].filter(Boolean)) });
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      const context = {
        clientInfo: { id: browser.id, name: browser.info?.name ?? 'OpenCU', type: browser.info?.type ?? 'iab', capabilities: { tab: [{ id: 'browserAuth' }] } },
        cdp: privateCdp, playwright, documentResponses: requests, credentialObservationGate: gate,
        finishNativeCredentialModelCommand: execution.finish, createBrowserAuthBrokerTransport: createTransport,
        commandTiming: { trackElicitation: value => value },
        runtime: { env: browserAuthSessionEnvironment(bound.capabilities), requestMeta: { 'x-codex-turn-metadata': { session_id: record.sessionId } },
          createElicitation: async request => {
            if (!protectedInput || request.meta?.codex_approval_kind !== 'browser_auth') throw unavailable();
            const result = await call('present', { ...request.meta, challenge_id: request.meta.browser_auth_challenge_id }, { signal: operationSignal });
            if (result.action !== 'accept') active.controller.abort(unavailable());
            return result;
          } },
        browserAuth: {
          // This plugin's explicit policy is a private user prompt, not an automated reviewer.
          getAutomatedSafetyPrecheck: () => null,
          decodeQrCode: decodeBrowserAuthQrCode,
          startQrCodeWatch: startBrowserAuthQrCodeWatch,
          pressLocator: (locator, actual) => actual.playwright.pressLocator(locator),
          captureScreenshot: async () => ({ browserId: browser.id, tabId: String(tabId), pageUrl: record.page.url(),
            url: 'data:image/png;base64,' + await browser.capture(record, {}, undefined, operationSignal) }),
        },
      };
      return await handleBrowserAuthHandoff({ ...params, browser_id: browser.id, tab_id: String(tabId) }, context);
    } finally {
      active.controller.abort(unavailable());
      const cleanup = await Promise.allSettled([...transports].map(value => value.settled()));
      if (nativeWorkersProtected) cleanup.push(await Promise.resolve(browser.call('browser.authServiceWorkerProtection', { ...protection, action: 'release' })).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason })));
      if (nativeProtected) cleanup.push(await Promise.resolve(browser.call('browser.authNewTargetProtection', { ...protection, action: 'release' })).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason })));
      if (releaseBypass) cleanup.push(await Promise.resolve().then(releaseBypass).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason })));
      if (releaseRaw) cleanup.push(await Promise.resolve().then(releaseRaw).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason })));
      const failures = cleanup.filter(value => value.status === 'rejected').map(value => value.reason);
      if (failures.length) throw new AggregateError(failures, 'Secure browser sign-in cleanup is unconfirmed');
      this.#active.delete(active);
    }
  }
  async dispose() {
    this.#closed = true;
    for (const active of this.#active) active.controller.abort(unavailable());
    this.#registry.dispose();
    const results = await Promise.allSettled([...this.#connections.values()].map(async value => {
      value.unbind?.(); await value.requests.dispose(); await value.cdp.dispose();
    }));
    const errors = results.filter(value => value.status === 'rejected').map(value => value.reason);
    if (errors.length) throw new AggregateError(errors, 'Browser credential protection cleanup is unconfirmed');
  }
}
