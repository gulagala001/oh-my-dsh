// Recovered from Codex browser-service.mjs: F0, U0, BN, vi, and $N.
// A registry belongs to one browser runtime and is shared by all of its browsers.

export const browserAuthObservationLimits = Object.freeze({
  protectedDocuments: 64,
  nativeStatusTimeoutMs: 3500,
  documentTimeoutMs: 2000,
});

const observationMessages = Object.freeze({
  credential_delivery_in_progress: 'Browser observation is unavailable while credential delivery is in progress. Wait for credential delivery to finish, then retry the command.',
  credential_observation_restricted: 'Browser observation is unavailable for a document containing native credentials. Navigate to a new document to continue. If observation remains blocked, use Tab.requestManualHandoff() to let the user take over.',
  retained_data_restricted: 'Browser observation is unavailable because retained browser data remains restricted after native credential delivery. Create a new tab and navigate to a new document to continue.',
  credential_state_unavailable: 'Browser observation is unavailable because native credential state cannot be safely resumed. Start a new browser runtime to continue.',
  protected_command_failed: 'Browser observation is unavailable because protected document state could not be verified. The underlying error was withheld; this does not establish a credential-policy denial.',
});

const recoveryMessages = Object.freeze({
  credential_delivery_in_progress: 'Browser observation is unavailable while credential delivery is in progress.',
  credential_observation_restricted: 'Browser observation is unavailable because credential protection restricts this observation.',
  retained_data_restricted: 'Browser observation is unavailable because retained browser data remains restricted after native credential delivery.',
  credential_state_unavailable: 'Browser observation is unavailable because native credential state cannot be safely resumed.',
  protected_command_failed: 'Browser observation is unavailable because the browser command failed while credential protection was active. The underlying error was withheld because it may contain protected data; this does not establish a credential-policy denial.',
  browser_security_restricted: 'A browser security check prevented this command from completing.',
  browser_security_unavailable: 'A browser security check prevented this command from completing.',
});

const nextActionMessages = Object.freeze({
  retry_after_credential_delivery: 'Wait for credential delivery to finish, then retry the command.',
  navigate_to_new_document: 'Navigate to a new document to continue. If observation remains blocked, use Tab.requestManualHandoff() to let the user take over.',
  create_new_tab: 'Select a browser by ID and create a new tab with cua.createBrowserTab(), or use Browser.tabs.new() followed by Tab.goto(), to continue on a new document.',
  request_manual_handoff: 'Use Tab.requestManualHandoff() to let the user take over.',
  restart_browser_runtime: 'Start a new browser runtime to continue.',
  retry_after_resolution: 'Retry after the reported check is available.',
  stop: 'Stop this browser action and report the failure.',
});

export class CredentialObservationError extends Error {
  constructor(reason = 'credential_observation_restricted') {
    if (!Object.hasOwn(observationMessages, reason)) reason = 'protected_command_failed';
    super(observationMessages[reason]);
    this.name = 'CredentialObservationError';
    this.reason = reason;
  }
}

export class BrowserCredentialRecoveryError extends Error {
  constructor(details) {
    const message = recoveryMessages[details.reason] ?? recoveryMessages.protected_command_failed;
    const nextAction = nextActionMessages[details.next_action] ?? nextActionMessages.stop;
    super(`${message} ${nextAction} Recovery v1: command=${details.command}, phase=${details.phase}, reason=${details.reason}, next_action=${details.next_action}.`);
    this.name = 'BrowserCredentialRecoveryError';
    this.details = Object.freeze({
      schema_version: 1,
      command: details.command,
      phase: details.phase,
      reason: details.reason,
      next_action: details.next_action,
      security_reason: details.security_reason,
    });
  }
}

const nativeAuthCommand = 'tab_browser_auth_handoff';
const navigationCommands = new Set([
  'navigate_tab_url', 'navigate_tab_back', 'navigate_tab_forward', 'navigate_tab_reload', 'close_tab',
]);
const documentationCommands = new Set(['get_documentation', 'get_browser_documentation']);
const browserSelectionCommands = new Set(['get_browser', 'get_default_browser', 'list_browsers']);
const nonobservingCommands = new Set(['name_session', 'browser_visibility_set', 'mark_tab']);
const documentCommands = new Set([
  'get_tab', 'tab_screenshot', 'tab_handle_js_dialog',
  'cua_click', 'cua_double_click', 'cua_drag', 'cua_keypress', 'cua_move', 'cua_scroll', 'cua_type',
  'dom_cua_click', 'dom_cua_double_click', 'dom_cua_get_visible_dom', 'dom_cua_keypress', 'dom_cua_scroll', 'dom_cua_type',
  'tab_ax_action', 'tab_ax_get_state',
  'playwright_dom_snapshot', 'playwright_evaluate', 'playwright_locator_all_text_contents',
  'playwright_locator_click', 'playwright_locator_count', 'playwright_locator_dblclick',
  'playwright_locator_fill', 'playwright_locator_get_attribute', 'playwright_locator_inner_text',
  'playwright_locator_is_enabled', 'playwright_locator_is_visible', 'playwright_locator_press',
  'playwright_locator_press_sequentially', 'playwright_locator_read_all', 'playwright_locator_select_option',
  'playwright_locator_set_checked', 'playwright_locator_text_content', 'playwright_locator_wait_for',
  'playwright_wait_for_load_state', 'playwright_wait_for_timeout', 'playwright_wait_for_url',
]);
const recoveryCommands = new Set([
  nativeAuthCommand, ...navigationCommands, ...documentationCommands,
  ...browserSelectionCommands, ...nonobservingCommands, ...documentCommands,
  'create_tab', 'tab_manual_handoff_request',
]);

export const browserAuthObservationCommandTypes = Object.freeze({
  nativeAuth: nativeAuthCommand,
  navigation: Object.freeze([...navigationCommands]),
  documentation: Object.freeze([...documentationCommands]),
  browserSelection: Object.freeze([...browserSelectionCommands]),
  nonobserving: Object.freeze([...nonobservingCommands]),
  document: Object.freeze([...documentCommands]),
});

function observationError(reason) {
  return new CredentialObservationError(reason);
}

function requireFunction(value) {
  if (typeof value !== 'function') throw observationError('protected_command_failed');
  return value;
}

function requireCdp(cdp) {
  if (cdp == null || typeof cdp.call !== 'function' || typeof cdp.on !== 'function' || typeof cdp.removeListener !== 'function') {
    throw observationError('protected_command_failed');
  }
  return cdp;
}

function validTabId(tabId) {
  return Number.isSafeInteger(tabId) && tabId > 0;
}

function securityErrorDetails(error, classify) {
  if (typeof classify !== 'function') return undefined;
  try {
    const details = classify(error);
    if (details == null || typeof details !== 'object' || typeof details.retryable !== 'boolean'
      || typeof details.reason !== 'string' || !/^[a-z][a-z0-9_]{0,127}$/.test(details.reason)) return undefined;
    return { retryable: details.retryable, reason: details.reason };
  } catch {
    return undefined;
  }
}

export function createBrowserAuthObservationRegistry(options = {}) {
  return new BrowserAuthObservationRegistry(options);
}

export class BrowserAuthObservationRegistry {
  #gates = new Map();
  #activeObservations = new Set();
  #observationWaiters = new Set();
  #nativeInitialization;
  #nativeInitialized = false;
  #readNativeStatus;
  #unavailable = false;
  #disposed = false;
  #nativeCommandTail = Promise.resolve();
  #nativeCredentialObservationRequired;

  constructor({ nativeCredentialObservationRequired = true } = {}) {
    this.#nativeCredentialObservationRequired = nativeCredentialObservationRequired !== false;
  }

  get recoveryRequired() {
    return this.#unavailable || this.#disposed
      || ((this.#nativeCredentialObservationRequired || this.#nativeInitialization != null) && !this.#nativeInitialized);
  }

  get guardState() {
    if (this.recoveryRequired) return 'recovery_required';
    const gates = this.gates();
    if (gates.some(gate => gate.protectionPending)) return 'pending';
    return gates.some(gate => gate.usedNativeCredentials) ? 'protected' : 'inactive';
  }

  gates() {
    return [...this.#gates.values()];
  }

  forBrowser(browserId, cdp) {
    if (this.#disposed) throw observationError('credential_state_unavailable');
    if (typeof browserId !== 'string' || browserId.length === 0) throw observationError('protected_command_failed');
    const transport = requireCdp(cdp);
    let gate = this.#gates.get(browserId);
    if (gate == null) {
      gate = new BrowserAuthObservationGate(this, browserId, transport);
      this.#gates.set(browserId, gate);
    } else gate.rebind(transport);
    return gate;
  }

  assertAvailable() {
    if (this.recoveryRequired) {
      this.#unavailable = true;
      throw observationError('credential_state_unavailable');
    }
  }

  // Binding verification is supplied by the host. No broker path or session scope is inferred.
  async initializeNativeCredentialObservation({ assertBinding, readStatus } = {}) {
    if (this.#disposed || this.#unavailable) throw observationError('credential_state_unavailable');
    this.#nativeInitialization ??= (async () => {
      try {
        if (typeof assertBinding !== 'function' || typeof readStatus !== 'function'
          || await assertBinding() !== true) throw observationError('credential_state_unavailable');
        this.#readNativeStatus = readStatus;
        await this.#verifyNativeStatus();
        if (this.#unavailable || this.#disposed) throw observationError('credential_state_unavailable');
        this.#nativeInitialized = true;
      } catch {
        this.#unavailable = true;
        throw observationError('credential_state_unavailable');
      }
    })();
    await this.#nativeInitialization;
  }

  async #verifyNativeStatus() {
    let timeout;
    try {
      if (this.#unavailable || this.#disposed || typeof this.#readNativeStatus !== 'function') throw observationError('credential_state_unavailable');
      const status = await Promise.race([
        this.#readNativeStatus(),
        new Promise(resolve => { timeout = setTimeout(resolve, browserAuthObservationLimits.nativeStatusTimeoutMs); }),
      ]);
      if (status !== false || this.#unavailable || this.#disposed) throw observationError('credential_state_unavailable');
    } catch {
      this.#unavailable = true;
      throw observationError('credential_state_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  async verifyNativeCredentialObservationState() {
    this.assertAvailable();
    if (this.#nativeInitialization != null) {
      await this.#nativeInitialization;
      if (!this.gates().some(gate => gate.usedNativeCredentials)) await this.#verifyNativeStatus();
    }
    this.assertAvailable();
  }

  async requireNativeCredentialObservation() {
    if (this.#nativeInitialization == null) {
      this.#unavailable = true;
      throw observationError('credential_state_unavailable');
    }
    await this.verifyNativeCredentialObservationState();
  }

  canObserveRetainedData(gate) {
    return !this.recoveryRequired && !gate?.usedNativeCredentials
      && this.gates().every(item => !item.usedNativeCredentials);
  }

  async canObserveRetainedDataAfterNativeStatus(gate) {
    if (!this.canObserveRetainedData(gate)) return false;
    try {
      await this.verifyNativeCredentialObservationState();
      return this.canObserveRetainedData(gate);
    } catch {
      return false;
    }
  }

  beginObservation() {
    this.assertAvailable();
    if (this.gates().some(gate => gate.protectionPending)) throw observationError('credential_delivery_in_progress');
    const observation = Symbol();
    this.#activeObservations.add(observation);
    return () => {
      this.#activeObservations.delete(observation);
      if (this.#activeObservations.size === 0) {
        for (const finish of [...this.#observationWaiters]) finish();
      }
    };
  }

  async waitForObservations() {
    this.assertAvailable();
    if (this.#activeObservations.size === 0) return;
    await new Promise(resolve => {
      const finish = () => {
        this.#observationWaiters.delete(finish);
        resolve();
      };
      this.#observationWaiters.add(finish);
    });
    this.assertAvailable();
  }

  invalidateForCredentialProtection(protectedGate) {
    for (const gate of this.gates()) {
      if (gate !== protectedGate) gate.invalidateForOtherBrowserProtection();
    }
  }

  async #serializeNativeCommand() {
    const previous = this.#nativeCommandTail;
    let finish;
    this.#nativeCommandTail = new Promise(resolve => { finish = resolve; });
    await previous;
    return finish;
  }

  guardModelCommand(execute, dependencies = {}) {
    requireFunction(execute);
    const { resolveBrowserId, parseRestrictedBrowserResult, classifyBrowserSecurityError, onRecovery } = dependencies;
    return async originalCommand => {
      const { type } = originalCommand;
      const nativeAuth = type === nativeAuthCommand;
      const manualHandoff = type === 'tab_manual_handoff_request';
      const navigation = navigationCommands.has(type);
      const createTab = type === 'create_tab';
      const documentation = documentationCommands.has(type);
      const browserSelection = browserSelectionCommands.has(type);
      const nonobserving = nonobservingCommands.has(type);
      const finishNativeCommand = nativeAuth ? await this.#serializeNativeCommand() : undefined;
      let finishObservation;
      let command = originalCommand;
      let resolvingBrowserId = false;
      let phase = 'before_command';
      const guardStateBefore = this.guardState;
      const observationEpochs = new Map(this.gates().map(gate => [gate, gate.observationEpoch]));
      const assertCommandObservationAllowed = async afterCommand => {
        if (documentation || browserSelection || nonobserving || navigation || createTab || manualHandoff || (nativeAuth && afterCommand)) return;
        const gates = this.gates();
        const protectedGate = gates.find(gate => gate.usedNativeCredentials);
        const browserId = 'browser_id' in command ? command.browser_id : undefined;
        const tabId = 'tab_id' in command ? Number(command.tab_id) : NaN;
        const targetGate = gates.find(gate => gate.browserId === browserId);
        if (protectedGate != null && ((!nativeAuth && !documentCommands.has(type)) || targetGate == null || !validTabId(tabId))) {
          protectedGate.assertRetainedObservationAllowed();
        }
        for (const gate of gates) {
          await gate.assertObservationAllowed(tabId, afterCommand ? observationEpochs.get(gate) ?? 0 : undefined,
            protectedGate != null && gate === targetGate);
        }
      };
      try {
        this.assertAvailable();
        finishObservation = this.beginObservation();
        if ('browser_id' in originalCommand && this.gates().some(gate => gate.usedNativeCredentials)) {
          resolvingBrowserId = true;
          const browserId = await requireFunction(resolveBrowserId)(originalCommand.browser_id);
          if (typeof browserId !== 'string' || browserId.length === 0) throw observationError('protected_command_failed');
          command = { ...originalCommand, browser_id: browserId };
          resolvingBrowserId = false;
        }
        if (navigation && 'browser_id' in command && 'tab_id' in command) {
          this.#gates.get(command.browser_id)?.invalidateDocuments(Number(command.tab_id));
        }
        await assertCommandObservationAllowed(false);
        await this.verifyNativeCredentialObservationState();
        phase = 'command';
        const result = await execute(command, nativeAuth ? finishObservation : undefined);
        phase = 'after_command';
        await assertCommandObservationAllowed(true);
        await this.verifyNativeCredentialObservationState();
        if (createTab) {
          if (result == null || typeof result !== 'object' || typeof result.id !== 'string'
            || !/^[1-9]\d*$/.test(result.id) || !Number.isSafeInteger(Number(result.id))) {
            throw new Error('Browser returned an invalid new tab identifier');
          }
          return { id: result.id };
        }
        if (browserSelection && !this.canObserveRetainedData()) {
          return await requireFunction(parseRestrictedBrowserResult)(type, result);
        }
        if ((navigation || manualHandoff || nonobserving) && !this.canObserveRetainedData()) return {};
        return result;
      } catch (error) {
        let recheckError;
        let restrictedDuringRecheck = false;
        try {
          await assertCommandObservationAllowed(true);
          await this.verifyNativeCredentialObservationState();
          if (navigation || createTab || browserSelection || nonobserving || nativeAuth || manualHandoff || resolvingBrowserId) {
            for (const gate of this.gates()) gate.assertRetainedObservationAllowed();
          }
        } catch (restricted) {
          restrictedDuringRecheck = true;
          recheckError = restricted;
        }
        let reason;
        let nextAction;
        let securityReason;
        if (recheckError instanceof CredentialObservationError && recheckError.reason === 'credential_state_unavailable'
          && !(error instanceof CredentialObservationError && error.reason === 'credential_state_unavailable')) {
          phase = 'error_recheck';
          reason = recheckError.reason;
          nextAction = 'restart_browser_runtime';
        } else if (error instanceof CredentialObservationError) {
          reason = error.reason;
          switch (reason) {
            case 'credential_state_unavailable': nextAction = 'restart_browser_runtime'; break;
            case 'credential_delivery_in_progress': nextAction = 'retry_after_credential_delivery'; break;
            case 'protected_command_failed': nextAction = manualHandoff || createTab || browserSelection || nonobserving ? 'stop' : 'request_manual_handoff'; break;
            case 'retained_data_restricted': nextAction = 'create_new_tab'; break;
            case 'credential_observation_restricted': nextAction = 'navigate_to_new_document'; break;
          }
        } else if (restrictedDuringRecheck) {
          const security = securityErrorDetails(error, classifyBrowserSecurityError);
          if (security != null) {
            reason = security.retryable ? 'browser_security_unavailable' : 'browser_security_restricted';
            nextAction = security.retryable ? 'retry_after_resolution' : 'stop';
            securityReason = security.reason;
          } else {
            reason = 'protected_command_failed';
            nextAction = manualHandoff || createTab || browserSelection || nonobserving ? 'stop' : 'request_manual_handoff';
          }
        } else throw error;
        const details = {
          schema_version: 1,
          command: recoveryCommands.has(type) ? type : 'other',
          phase,
          reason,
          next_action: nextAction,
          security_reason: securityReason,
        };
        try {
          onRecovery?.({
            ...details,
            guard_state_before: guardStateBefore,
            guard_state_after: this.guardState,
            observation_changed: this.gates().some(gate => (observationEpochs.get(gate) ?? 0) !== gate.observationEpoch),
          });
        } catch {
          // Recovery reporting cannot release a protected result or replace its error.
        }
        throw new BrowserCredentialRecoveryError(details);
      } finally {
        finishObservation?.();
        finishNativeCommand?.();
      }
    };
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unavailable = true;
    for (const gate of this.gates()) gate.dispose();
    this.#activeObservations.clear();
    for (const finish of [...this.#observationWaiters]) finish();
  }
}

export class BrowserAuthObservationGate {
  #registry;
  #cdp;
  #revision = 0;
  #observationRevision = 0;
  #used = false;
  #pending = false;
  #manualSavingTabs = new Set();
  #ordinaryInteractionTabs = new Set();
  #documents = new Map();
  #permittedDocuments = new Map();
  #mainFrameIds = new Map();
  #navigationCleanups = new Set();

  constructor(registry, browserId, cdp) {
    this.#registry = registry;
    this.browserId = browserId;
    this.#cdp = requireCdp(cdp);
  }

  get epoch() { return this.#revision; }
  get observationEpoch() { return this.#observationRevision; }
  get usedNativeCredentials() { return this.#used; }
  get protectionPending() { return this.#pending; }

  rebind(cdp) {
    requireCdp(cdp);
    if (this.#cdp === cdp) return;
    this.#revision += 1;
    this.invalidateDocuments();
    this.#mainFrameIds.clear();
    this.#cdp = cdp;
  }

  invalidateForOtherBrowserProtection() {
    this.#revision += 1;
    this.invalidateDocuments();
  }

  invalidateDocuments(tabId) {
    if (tabId == null) {
      this.#permittedDocuments.clear();
      this.#ordinaryInteractionTabs.clear();
    } else this.#permittedDocuments.delete(tabId);
    this.invalidateObservations(tabId);
  }

  invalidateObservations(tabId) {
    if ((tabId == null || !this.#ordinaryInteractionTabs.has(tabId))
      && this.#registry.gates().some(gate => gate.usedNativeCredentials)) this.#observationRevision += 1;
  }

  bindNavigationEvents(cdp = this.#cdp) {
    requireCdp(cdp);
    const onEvent = event => {
      if (cdp !== this.#cdp || event.source?.sessionId != null || event.source?.targetId != null) return;
      const tabId = event.source?.tabId;
      if (event.method === 'Page.frameNavigated' && event.params.frame.parentId == null) {
        this.#mainFrameIds.set(tabId, event.params.frame.id);
        this.invalidateDocuments(tabId);
      } else if (event.method === 'Page.frameStartedNavigating' && this.#mainFrameIds.get(tabId) === event.params.frameId) {
        if (event.params.navigationType === 'sameDocument' || event.params.navigationType === 'historySameDocument') this.invalidateObservations(tabId);
        else this.invalidateDocuments(tabId);
      } else if (event.method === 'Page.navigatedWithinDocument'
        && (this.#mainFrameIds.get(tabId) == null || this.#mainFrameIds.get(tabId) === event.params.frameId)) this.invalidateObservations(tabId);
    };
    const onTabDetached = (tabId, reason) => {
      if (cdp !== this.#cdp) return;
      this.#revision += 1;
      this.#mainFrameIds.delete(tabId);
      const ordinary = this.#ordinaryInteractionTabs.delete(tabId);
      this.invalidateDocuments(tabId);
      if (reason === 'turnEnded' && ordinary) this.#ordinaryInteractionTabs.add(tabId);
    };
    cdp.on('event', onEvent);
    cdp.on('tabDetached', onTabDetached);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.#navigationCleanups.delete(cleanup);
      if (cdp === this.#cdp) {
        this.#revision += 1;
        this.invalidateDocuments();
        this.#mainFrameIds.clear();
      }
      cdp.removeListener('event', onEvent);
      cdp.removeListener('tabDetached', onTabDetached);
    };
    this.#navigationCleanups.add(cleanup);
    return cleanup;
  }

  async protect(tabId, finishModelCommand) {
    await this.#protectDocument(tabId, finishModelCommand);
  }

  async protectManualSaving(tabId, finishModelCommand) {
    await this.#protectDocument(tabId, finishModelCommand);
    this.#manualSavingTabs.add(tabId);
  }

  hasManualSavingTab(tabId) {
    return this.#manualSavingTabs.has(tabId);
  }

  allowOrdinaryInteraction(tabId, epoch) {
    this.#registry.assertAvailable();
    if (this.#pending || this.#revision !== epoch || !validTabId(tabId) || !this.#manualSavingTabs.has(tabId)) throw observationError();
    this.invalidateDocuments(tabId);
    this.#manualSavingTabs.delete(tabId);
    this.#ordinaryInteractionTabs.add(tabId);
  }

  async #protectDocument(tabId, finishModelCommand) {
    if (this.#pending) throw observationError('credential_delivery_in_progress');
    this.#pending = true;
    this.#used = true;
    this.#revision += 1;
    this.invalidateDocuments();
    this.#registry.invalidateForCredentialProtection(this);
    try {
      requireFunction(finishModelCommand)();
      await this.#registry.requireNativeCredentialObservation();
      await this.#registry.waitForObservations();
      const loaderId = await this.readLoader(tabId);
      const protectedDocumentCount = [...this.#documents.values()].reduce((count, documents) => count + documents.size, 0);
      if (protectedDocumentCount >= browserAuthObservationLimits.protectedDocuments) throw observationError();
      const documents = this.#documents.get(tabId) ?? new Set();
      documents.add(loaderId);
      this.#documents.set(tabId, documents);
    } catch (error) {
      throw error instanceof CredentialObservationError ? error : observationError('protected_command_failed');
    } finally {
      this.#pending = false;
    }
  }

  permitNavigatedDocument(tabId, loaderId, epoch) {
    this.#registry.assertAvailable();
    if (!this.#used && !this.#registry.gates().some(gate => gate.usedNativeCredentials)) return;
    if (this.#pending || this.#revision !== epoch || !validTabId(tabId) || typeof loaderId !== 'string'
      || !loaderId || this.#documents.get(tabId)?.has(loaderId) === true) throw observationError();
    this.invalidateDocuments(tabId);
    this.#permittedDocuments.set(tabId, loaderId);
  }

  async assertObservationAllowed(tabId, observationEpoch, needsDocumentPermission = this.#used) {
    this.#registry.assertAvailable();
    const epoch = this.#observationRevision;
    const assertEpoch = () => {
      this.#registry.assertAvailable();
      if (this.#pending) throw observationError('credential_delivery_in_progress');
      if (this.#observationRevision !== epoch || (observationEpoch !== undefined && observationEpoch !== this.#observationRevision)) throw observationError();
    };
    assertEpoch();
    if (needsDocumentPermission && !this.#ordinaryInteractionTabs.has(tabId)) {
      const permittedLoaderId = this.#permittedDocuments.get(tabId);
      if (permittedLoaderId == null) throw observationError();
      const loaderId = await this.readLoader(tabId);
      if (loaderId !== permittedLoaderId || this.#documents.get(tabId)?.has(loaderId) === true) throw observationError();
    }
    assertEpoch();
  }

  assertRetainedObservationAllowed() {
    this.#registry.assertAvailable();
    if (this.#used) throw observationError('retained_data_restricted');
  }

  async observe(observe, tabId) {
    const finish = this.#registry.beginObservation();
    const observationEpoch = this.observationEpoch;
    try {
      await this.assertObservationAllowed(tabId, observationEpoch);
      let result;
      try {
        result = await requireFunction(observe)();
      } catch (error) {
        await this.assertObservationAllowed(tabId, observationEpoch);
        throw error;
      }
      await this.assertObservationAllowed(tabId, observationEpoch);
      return result;
    } finally {
      finish();
    }
  }

  async readLoader(tabId, timeoutMs = browserAuthObservationLimits.documentTimeoutMs) {
    this.#registry.assertAvailable();
    if (!validTabId(tabId)) throw observationError();
    try {
      const { frameTree } = await this.#cdp.call(tabId, 'Page.getFrameTree', undefined, { timeoutMs });
      this.#registry.assertAvailable();
      const { id, loaderId } = frameTree.frame;
      if (typeof id !== 'string' || !id || typeof loaderId !== 'string' || !loaderId) throw observationError('protected_command_failed');
      this.#mainFrameIds.set(tabId, id);
      return loaderId;
    } catch (error) {
      throw error instanceof CredentialObservationError ? error : observationError('protected_command_failed');
    }
  }

  dispose() {
    for (const cleanup of [...this.#navigationCleanups]) cleanup();
  }
}
