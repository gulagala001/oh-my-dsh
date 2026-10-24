import {randomUUID, createHash} from 'node:crypto';
import {mkdir, readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {checkExpected, checkSignal, errorJSON, fail, readOperation, recoverableActionError, referenceMatches, sameIdentity} from '../protocol.mjs';
import {createDeliveryStore} from './deliveries.mjs';
import {observePage} from './observation.mjs';
import {actOnPage, releasePage, normalizeBrowserAction} from './actions.mjs';
import {createInputState} from './input-state.mjs';
import {createUserActivityMonitor} from './user-activity.mjs';
import {createPageDialogs} from './dialogs.mjs';
import {createCDPFrameRouter} from '../../extension/frame-router.js';
import {isolatedLaunchOptions} from './automation.mjs';
export {withIsolatedBrowser} from './automation.mjs';

/** A lazy Chromium backend. Existing contexts/CDP browsers are never shut down as owned browsers. */
export async function createBrowserBackend(options = {}) {
  if (!options.dataDir) fail('INVALID_ARGUMENT', 'Browser dataDir is required');
  const dataDir = resolve(options.dataDir);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const releaseTimeoutMs = options.releaseTimeoutMs ?? 2_000;
  const browserId = options.browserId ?? (options.cdpEndpoint
    ? `browser:cdp:${createHash('sha256').update(options.cdpEndpoint).digest('hex').slice(0, 16)}`
    : 'browser:local');
  const deliveryStore = await createDeliveryStore(dataDir);
  const inputState = await createInputState(dataDir, browserId);
  const records = new Map();
  const recordReleases = new WeakMap();
  const pages = new Map();
  const downloads = new WeakMap();
  let browser;
  let context;
  let connectionId, contextId;
  let initializing;
  let closed = false, closing = false, closingWork;
  let retiring = false, retiringWork, releasing, rootClosed = false, removePageListener;
  let releaseFailures = [];
  let ownContext = false;
  let connected = false;
  const listeners = new Set();
  const backgroundErrors = [];
  let cursorSource;
  async function updateCursor(record, cursor) {
    const revision = record.cursorRevision ?? 0;
    record.cursor = cursor.visible === false ? undefined : {...cursor};
    if (!await record.page.evaluate(() => Boolean(globalThis.__opencuCursor))) {
      cursorSource ??= readFile(new URL('../../lib/page-cursor.js', import.meta.url), 'utf8');
      await record.page.evaluate(await cursorSource);
    }
    if (revision !== (record.cursorRevision ?? 0)) return;
    await record.page.evaluate(cursor => globalThis.__opencuCursor.update({ ...cursor, waitForArrival: true }), cursor);
    if (revision !== (record.cursorRevision ?? 0) && !record.page.isClosed()) await record.page.evaluate(() => { void globalThis.__opencuCursor?.update({visible: false}); });
  }
  function listen(emitter, event, listener) {
    emitter.on(event, listener);
    const remove = () => { emitter.off(event, listener); listeners.delete(remove); };
    listeners.add(remove);
    return remove;
  }

  async function initialize(internal = false) {
    if (closed) fail('BACKEND_CLOSED', 'Browser backend is closed');
    if (closing && !internal) fail('BACKEND_CLOSING', 'Browser backend is closing');
    if (initializing) return initializing;
    if (context) return;
    let registrationStarted = false;
    initializing = (async () => {
      const playwright = options.context ? undefined : options.playwright ?? await import('playwright');
      if (options.context) {
        context = options.context;
        browser = context.browser();
        connectionId = `context:${options.instanceId ?? randomUUID()}`;
      } else if (options.cdpEndpoint) {
        let endpoint = options.cdpEndpoint;
        if (/^https?:/u.test(endpoint)) {
          const response = await fetch(`${endpoint.replace(/\/$/u, '')}/json/version`, {signal: AbortSignal.timeout(timeoutMs)});
          if (!response.ok) fail('CONNECTION_FAILED', `CDP discovery returned ${response.status}`);
          endpoint = (await response.json()).webSocketDebuggerUrl;
          if (!endpoint) fail('CONNECTION_FAILED', 'CDP discovery did not return a browser websocket URL');
        }
        connectionId = `cdp:${createHash('sha256').update(endpoint).digest('hex')}`;
        browser = await playwright.chromium.connectOverCDP(endpoint, {timeout: timeoutMs});
        connected = true;
        context = browser.contexts()[0];
        if (!context) fail('CONNECTION_FAILED', 'CDP browser has no context');
      } else {
        const profile = join(dataDir, 'browser-profile');
        await mkdir(profile, {recursive: true});
        const headless = options.launchOptions?.headless ?? options.headless ?? true;
        // Emulated DPR makes headed Retina Chromium zoom back and forth during captures.
        context = await playwright.chromium.launchPersistentContext(profile, isolatedLaunchOptions({
          headless,
          viewport: options.viewport !== undefined ? options.viewport : headless ? {width: 1280, height: 800} : null,
          acceptDownloads: true,
          ...options.launchOptions,
        }));
        ownContext = true;
        browser = context.browser();
        connectionId = `owned:${randomUUID()}`;
      }
      removePageListener = listen(context, 'page', page => { void register(page).catch(error => backgroundErrors.push(error.message)); });
      registrationStarted = true;
      await registerPages(context.pages(), internal);
      if (context.pages().length === 0 && ownContext) await register(await context.newPage(), internal);
    })().catch(async error => {
      if (options.context && registrationStarted) {
        // The caller owns this context. Keep healthy siblings and their adopted input.
        initializing = undefined;
        throw error;
      }
      retiring = true;
      removePageListener?.();
      try { await retireInitialization(); }
      catch (cleanupError) {
        error.details = {...error.details, cleanup: errorJSON(cleanupError)};
        throw error;
      }
      throw error;
    });
    return initializing;
  }

  function capture(download, targetId) {
    let work = downloads.get(download);
    if (!work) { work = deliveryStore.capture(download, targetId); downloads.set(download, work); }
    return work;
  }
  async function registerPages(currentPages, internal = false) {
    const results = await Promise.allSettled(currentPages.map(page => register(page, internal)));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
  async function drainRegistrations() {
    // Admission is closed before this is called, so no new attempt can escape this set.
    await Promise.allSettled([...pages.values()].map(attempt => attempt.recovery ?? attempt.work));
  }
  function cleanupRegistration(attempt) {
    if (attempt.cleaned) return Promise.resolve();
    return attempt.cleaning ??= (async () => {
      for (const remove of attempt.removers) remove();
      if (attempt.record?.activity && !attempt.activityDisposed) {
        await attempt.record.activity.dispose(); attempt.activityDisposed = true;
      }
      if (attempt.record?.frameRouter && !attempt.routerClosed) {
        await attempt.record.frameRouter.close(); attempt.routerClosed = true;
      }
      if (attempt.session && !attempt.detached) {
        await attempt.session.detach(); attempt.detached = true;
        if (attempt.record) attempt.record.detached = true;
      }
      attempt.cleaned = true;
    })().finally(() => { attempt.cleaning = undefined; });
  }
  function releaseRecord(record, {dismissDialogs = true} = {}) {
    let work = recordReleases.get(record);
    if (!work) {
      work = releasePage(record, releaseTimeoutMs, {dismissDialogs, persistInputs: inputState.persist}).finally(() => { recordReleases.delete(record); });
      recordReleases.set(record, work);
    }
    return work;
  }
  async function releaseTarget(target, {dismissDialogs = false} = {}) {
    await initialize();
    const record = records.get(target.id);
    if (!record || !sameIdentity(record.identity,target.identity)) {
      if (!record && target.cold && target.releaseAcknowledged === true) return {released:true,retired:true};
      fail('TARGET_IDENTITY_CHANGED','Release requires the original browser occurrence');
    }
    record.cursor = undefined; record.cursorRevision = (record.cursorRevision ?? 0) + 1;
    const failures = await releaseRecord(record, {dismissDialogs});
    await inputState.persist();
    releaseFailures = [...releaseFailures.filter(failure => failure.targetId !== record.id), ...failures];
    if (!record.page.isClosed() && !record.crashed && !record.dialogs.read())
      await record.dialogs.guard(() => record.page.evaluate(() => { void globalThis.__opencuCursor?.update({visible: false}); })).catch(error => backgroundErrors.push(error.message));
    return {released: !failures.length, failures,...(!failures.length && record.page.isClosed() ? {retired:true} : {})};
  }
  function retireInitialization() {
    return retiringWork ??= (async () => {
      await drainRegistrations();
      const failures = [];
      for (const record of records.values()) failures.push(...await releaseRecord(record));
      // An incomplete inventory is not evidence that an unresolved target disappeared.
      await inputState.persist();
      if (failures.length) fail('RELEASE_FAILED', 'Initialization cleanup could not release input', failures);
      for (const attempt of pages.values()) await cleanupRegistration(attempt);
      if (!rootClosed) {
        if (ownContext) await context?.close();
        else if (connected) await browser?.close();
        rootClosed = true;
      }
      for (const record of records.values()) await inputState.forget(record);
      for (const remove of listeners) remove();
      records.clear(); pages.clear();
      context = undefined; browser = undefined; initializing = undefined;
      ownContext = false; connected = false; contextId = undefined;
      retiring = false; rootClosed = false;
    })().finally(() => { retiringWork = undefined; });
  }
  function register(page, internal = false) {
    if (closed || retiring || closing && !internal) return Promise.reject(Object.assign(new Error('Browser registration is stopping'), {code: 'BACKEND_CLOSING'}));
    const previous = pages.get(page);
    if (previous) {
      if (!previous.failed) return previous.work;
      return previous.recovery ??= cleanupRegistration(previous).catch(cleanupError => {
        previous.error.details = {...previous.error.details, cleanup: errorJSON(cleanupError)};
        throw previous.error;
      }).then(() => {
        if (pages.get(page) === previous) pages.delete(page);
        return register(page, internal);
      }).finally(() => { previous.recovery = undefined; });
    }
    const attempt = {page, removers: []};
    attempt.dialogs = createPageDialogs(page, () => attempt.record?.documentGeneration ?? 0);
    attempt.removers.push(() => attempt.dialogs.dispose());
    pages.set(page, attempt);
    attempt.work = (async () => {
      const session = attempt.session = await context.newCDPSession(page);
      const {targetInfo} = await session.send('Target.getTargetInfo');
      contextId ??= targetInfo.browserContextId;
      const id = `tab:${createHash('sha256').update(`${browserId}\0${connectionId}\0${targetInfo.targetId}`).digest('hex').slice(0, 32)}`;
      const record = attempt.record = {
        id, page, session, dialogs: attempt.dialogs,
        identity: {browserId, connectionId, targetId: targetInfo.targetId, contextId: targetInfo.browserContextId ?? 'default'},
        keys: new Set(), buttons: new Set(), pending: new Set(), elements: new Map(), nextElementId: 0, documentGeneration: 0,
      };
      record.frameRouter = createCDPFrameRouter((method, params) => session.send(method, params), listener => {
        const received = params => listener('Target.receivedMessageFromTarget', params), detached = params => listener('Target.detachedFromTarget', params);
        session.on('Target.receivedMessageFromTarget', received); session.on('Target.detachedFromTarget', detached);
        return () => {session.off('Target.receivedMessageFromTarget', received); session.off('Target.detachedFromTarget', detached);};
      });
      page.setDefaultTimeout(timeoutMs);
      attempt.removers.push(
        listen(page, 'download', download => { void capture(download, id).catch(error => backgroundErrors.push(error.message)); }),
        listen(page, 'framenavigated', frame => { if (frame === page.mainFrame()) { record.documentGeneration++; record.elements.clear(); record.screenshot = undefined; } }),
        listen(page, 'crash', () => { record.crashed = true; record.elements.clear(); record.screenshot = undefined; record.keys.clear(); record.buttons.clear(); void inputState.persist().catch(error=>backgroundErrors.push(error.message)); }),
        listen(page, 'domcontentloaded', () => {
          if (record.cursor && !closed) void updateCursor(record, {...record.cursor, animateMovement: false}).catch(error => backgroundErrors.push(error.message));
        }),
      );
      await record.dialogs.attach(session);
      await record.dialogs.guard(() => activityFor(record)).catch(error => { if (error.code !== 'JS_DIALOG_OPEN') throw error; });
      if (page.isClosed()) fail('TARGET_CLOSED', 'Browser tab closed during registration');
      if (retiring || closing && !internal) fail('BACKEND_CLOSING', 'Browser registration is stopping');
      inputState.adopt(record);
      records.set(id, record);
      attempt.removers.push(listen(page, 'close', () => {
        for (const remove of attempt.removers) remove();
        records.delete(id); pages.delete(page);
        void inputState.forget(record).catch(error => backgroundErrors.push(error.message));
      }));
      return record;
    })().catch(async error => {
      try {
        await cleanupRegistration(attempt);
        if (pages.get(page) === attempt) pages.delete(page);
      }
      catch (cleanupError) { error.details = {...error.details, cleanup: errorJSON(cleanupError)}; }
      attempt.error = error; attempt.failed = true;
      throw error;
    });
    return attempt.work;
  }
  async function activityFor(record) {
    record.activityPromise ??= createUserActivityMonitor(record.session, {onAcquire: monitor => { record.activity = monitor; }}).then(activity => (record.activity = activity)).catch(error => { delete record.activityPromise; throw error; });
    return record.activityPromise;
  }
  async function newTab(request, record) {
    await initialize();
    checkSignal(request.signal);
    const session = record?.session ?? await browser.newBrowserCDPSession();
    let creation, next;
    try {
      const created = session.send('Target.createTarget', {url: 'about:blank', background: true,
        ...(contextId ? {browserContextId: contextId} : {})});
      const opened = context.waitForEvent('page', {timeout: timeoutMs, predicate: async page =>
        (await register(page)).identity.targetId === (await created).targetId});
      const results = await Promise.allSettled([created, opened]);
      if (results[0].status === 'rejected') throw results[0].reason;
      creation = results[0].value;
      if (results[1].status === 'rejected') throw results[1].reason;
      next = await register(results[1].value);
      checkSignal(request.signal);
      if (request.url) {
        const guard = next.dialogs.begin();
        try { await guard.wait(actOnPage(next, {...request, action: 'navigate'}, {timeoutMs, capture, persistInputs: inputState.persist, actionGuard:guard})); }
        catch (error) { if (error.code !== 'JS_DIALOG_OPEN') throw error; }
        finally { guard.finish(); }
      }
      checkSignal(request.signal);
      return {action: 'newTab', target: await descriptor(next)};
    } catch (error) {
      if (creation) error.details = {...error.details, created: true, browserId, backendTargetId: creation.targetId,
        ...(next ? {target: await descriptor(next).catch(() => ({id: next.id, browserId, identity: next.identity}))} : {}),
        notice: 'A tab was created. Discover this browser before retrying; do not create another tab.'};
      throw error;
    } finally { if (!record) await session.detach().catch(() => {}); }
  }
  async function descriptor(record, targetInfo) {
    if (record.page.isClosed()) fail('TARGET_CLOSED', 'Browser tab is closed');
    targetInfo ??= (await record.session.send('Target.getTargetInfo')).targetInfo;
    return {
      id: record.id, backend: 'browser', kind: 'tab', browserId,
      title: targetInfo.title, url: targetInfo.url, identity: record.identity,
      capabilities: ['ax', 'screenshot', 'navigation', 'tabs', 'focus', 'mouse', 'keyboard', 'uploads', 'downloads', 'hitTest', 'getDOM', 'designTweak', 'dialogs'],
    };
  }
  async function recordFor(target) {
    await initialize();
    const record = records.get(target.id);
    if (!record || record.page.isClosed()) fail('TARGET_CLOSED', 'Browser tab occurrence is no longer available');
    if (record.crashed) fail('TARGET_CRASHED', 'Browser tab process exited; old dialog tokens and observations are invalid');
    if (!sameIdentity(record.identity, target.identity)) fail('TARGET_IDENTITY_CHANGED', 'Browser tab identity changed');
    return record;
  }
  async function verify(target) {
    await initialize();
    const record = records.get(target.id);
    if (!record || record.page.isClosed() || record.crashed) return {valid: false, reason: 'Browser tab occurrence is no longer available'};
    try {
      const {targetInfo} = await record.session.send('Target.getTargetInfo');
      if (targetInfo.targetId !== record.identity.targetId || !sameIdentity(record.identity, target.identity)) {
        return {valid: false, reason: 'Browser connection or target occurrence changed'};
      }
      return {valid: true, target: await descriptor(record, targetInfo)};
    } catch (error) { return {valid: false, reason: error.message}; }
  }
  function release({internal = false, dismissDialogs = true} = {}) {
    return releasing ??= (async () => {
      if (retiring) await retireInitialization();
      if (inputState.hasPending() && !context) await initialize(internal || closing);
      const failures = [], releasedTargetIds = [], retiredTargetIds = [];
      if (!retiring && inputState.hasPending() && context) {
        try { await registerPages(context.pages(), internal || closing); }
        catch (error) { failures.push({error: error.message}); }
      }
      for (const record of records.values()) {
        record.cursor = undefined; record.cursorRevision = (record.cursorRevision ?? 0) + 1;
        const released = await releaseRecord(record, {dismissDialogs});
        failures.push(...released);
        if (!released.length) {
          releasedTargetIds.push(record.id);
          if (record.page.isClosed()) retiredTargetIds.push(record.id);
        }
        if (!record.page.isClosed() && !record.crashed && !record.dialogs.read()) await record.dialogs.guard(() => record.page.evaluate(() => { void globalThis.__opencuCursor?.update({visible: false}); })).catch(error => backgroundErrors.push(error.message));
      }
      const liveIds = new Set([...records.values()].filter(record => !record.page.isClosed()).map(record => record.id));
      const complete = !retiring && context && context.pages().every(page => {
        const attempt = pages.get(page);
        return attempt?.record && records.get(attempt.record.id) === attempt.record && !attempt.detached;
      });
      if (complete) failures.push(...await inputState.missing(connectionId ?? 'uninitialized', liveIds));
      else {
        await inputState.persist();
        if (inputState.hasPending()) failures.push({error: 'Held input cannot be verified against incomplete browser inventory'});
      }
      if (inputState.hasForeign()) failures.push({error: 'Another browser identity has unreleased persisted input'});
      releaseFailures = failures;
      return {released: !failures.length, failures, releasedTargetIds, retiredTargetIds};
    })().finally(() => { releasing = undefined; });
  }
  return {
    async listBrowsers() { return context && !closed ? [{id: browserId, provider: 'browser', name: 'Chromium', connected: true}] : []; },
    async newTab(id, url, {signal} = {}) {
      if (id !== browserId) fail('TARGET_NOT_FOUND', 'Choose this connected browser ID');
      if (releaseFailures.some(failure => !failure.targetId)) fail('RELEASE_FAILED', 'Browser connection input release remains unconfirmed');
      return (await newTab({url, signal})).target;
    },
    async listTargets({signal} = {}) {
      checkSignal(signal);
      await initialize();
      checkSignal(signal);
      await registerPages(context.pages());
      checkSignal(signal);
      const targets = await Promise.all([...records.values()].filter(record => !record.page.isClosed()).map(record => {
        checkSignal(signal);
        return descriptor(record);
      }));
      checkSignal(signal);
      return targets;
    },
    async select(reference, {signal} = {}) {
      const id = reference?.targetId ?? reference?.id;
      if (typeof id === 'string' && reference.identity && typeof reference.identity === 'object' && Object.keys(reference.identity).length) {
        // An exact occurrence needs live verification, not another inventory of
        // unrelated tabs. Keep generic references on the discovery path below.
        const record = await readOperation(() => recordFor({...reference, id}), signal);
        const {targetInfo} = await readOperation(() => record.session.send('Target.getTargetInfo'), signal);
        checkSignal(signal);
        if (targetInfo.targetId !== record.identity.targetId) fail('TARGET_IDENTITY_CHANGED', 'Browser target occurrence changed');
        const target = await descriptor(record, targetInfo);
        checkSignal(signal);
        if (!referenceMatches(target, reference)) fail('TARGET_NOT_FOUND', 'Reference does not match the live browser tab');
        checkExpected(target, reference.expected);
        return target;
      }
      const targets = await readOperation(() => this.listTargets({signal}), signal);
      checkSignal(signal);
      const matches = targets.filter(target => referenceMatches(target, reference));
      if (matches.length !== 1) fail(matches.length ? 'AMBIGUOUS_TARGET' : 'TARGET_NOT_FOUND', 'Reference must match one browser tab');
      checkExpected(matches[0], reference?.expected);
      return matches[0];
    },
    async focus(target) {
      const record = await recordFor(target);
      await record.dialogs.guard(() => record.page.bringToFront());
      return {focused: true, target: await descriptor(record)};
    },
    async preview(target) {
      const record = await recordFor(target);
      return record.dialogs.guard(async () => {
        const bytes = await record.page.screenshot({ type: 'jpeg', quality: 65, timeout: timeoutMs });
        record.dialogs.assertClosed();
        return { dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`, ...await record.page.evaluate(() => ({ width: innerWidth, height: innerHeight, active: document.hasFocus() })) };
      });
    },
    async observe(target, request = {}) {
      checkSignal(request.signal);
      const record = await recordFor(target);
      checkSignal(request.signal);
      return record.dialogs.guard(async () => {
        const observation = await observePage(record, request, {dataDir, sharp: options.sharp, timeoutMs});
        checkSignal(request.signal);
        record.dialogs.assertClosed();
        observation.identity = record.identity;
        observation.targetId = record.id;
        observation.userActivity = await (await activityFor(record)).read();
        checkSignal(request.signal);
        return observation;
      });
    },
    async act(target, request) {
      request = normalizeBrowserAction(request);
      checkSignal(request.signal);
      const record = await recordFor(target);
      checkSignal(request.signal);
      if (request.action === 'getDialog') return {dialog:record.dialogs.read()};
      if (request.action === 'handleDialog') {
        const result = await record.dialogs.handle(request);
        // Ending a modal interruption releases this page's held input. A new
        // website dialog is preserved and reported after the old response succeeded.
        let failures;
        try {
          failures = await releasePage(record, releaseTimeoutMs, {dismissDialogs:false,persistInputs:inputState.persist});
          await inputState.persist();
        } catch (error) { failures = [...(failures ?? []),{targetId:record.id,error:error.message}]; }
        releaseFailures = [...releaseFailures.filter(failure => failure.targetId !== record.id),...failures];
        const pendingDialog = record.dialogs.read();
        return {...result,...(pendingDialog ? {pendingDialog} : {}),...(failures.length ? {releasePending:true,releaseFailures:failures} : {})};
      }
      record.dialogs.assertClosed();
      if (releaseFailures.some(failure => !failure.targetId || failure.targetId === record.id)) fail('RELEASE_FAILED', 'This browser target remains blocked until input release succeeds');
      const inputSequence = record.inputDispatchSequence ?? 0;
      const heldKeys = new Set(record.keys), heldButtons = new Set(record.buttons);
      checkSignal(request.signal);
      const guard = record.dialogs.begin();
      try {
        if (request.action === 'newTab') return await newTab(request, record);
        if (request.action === 'closeTab') {
          const failures = await releaseRecord(record);
          if (failures.length) fail('RELEASE_FAILED', 'Cannot close tab before input release', failures);
          checkSignal(request.signal);
          await record.page.close();
          await inputState.persist();
          return {action: 'closeTab', closedTargetId: record.id};
        }
        const result = await guard.wait(actOnPage(record, request, {timeoutMs, capture, persistInputs: inputState.persist, actionGuard:guard,
          cursor: cursor => updateCursor(record, cursor), expectInput: async events => { const activity = await activityFor(record); guard.check(); return activity.expect(events); },
          finishInput: async marker => {
            if (guard.dialog || record.dialogs.read()) return;
            const activity = await activityFor(record); guard.check();
            return guard.wait(activity.finish(marker));
          }}));
        await inputState.persist();
        return {...result, target: await descriptor(record),...(!record.keys.size && !record.buttons.size ? {release:{released:true}} : {})};
      } catch (error) {
        error.details = {...error.details, inputDispatched: error.details?.inputDispatched === true || (record.inputDispatchSequence ?? 0) !== inputSequence};
        const dialog = guard.dialog ?? record.dialogs.read();
        if (dialog) {
          if (error.details.inputDispatched) return {action:request.action,pendingDialog:dialog,inputDispatched:true,effectVerified:false,target:await descriptor(record)};
          throw record.dialogs.openError(dialog);
        }
        if (['JS_DIALOG_OPEN','STALE_DIALOG'].includes(error.code)) throw error;
        if (recoverableActionError(error, request.action)) {
          // A preflight can fail after journaling intent but before sending input.
          // Discard only this attempt's intent; never release another held chord.
          let changed = false;
          for (const key of record.keys) if (!heldKeys.has(key)) { record.keys.delete(key); changed = true; }
          for (const button of record.buttons) if (!heldButtons.has(button)) { record.buttons.delete(button); changed = true; }
          if (changed) await inputState.persist();
          throw error;
        }
        if (request.action === 'locator' && error.details.inputDispatched !== true && ['FRAME_NOT_FOUND', 'FRAME_DETACHED', 'LOCATOR_NOT_STABLE', 'STALE_ELEMENT', 'STALE_OBSERVATION'].includes(error.code)) throw error;
        if (request.action === 'locator' && error.details.inputDispatched !== true && ['LOCATOR_NOT_FOUND', 'AMBIGUOUS_LOCATOR', 'UNSUPPORTED_LOCATOR', 'LOCATOR_NOT_ACTIONABLE'].includes(error.code)) throw error;
        releaseFailures = [...releaseFailures.filter(failure => failure.targetId !== record.id),{targetId:record.id,error:'Action failed before input release completed'}];
        const released = await releaseTarget(target, {dismissDialogs:false});
        if (!released.released) fail('RELEASE_FAILED', 'Action failed and input release is incomplete', {cause: error.message, failures: released.failures});
        error.details.release = released;
        throw error;
      } finally { guard.finish(); }
    },
    release,
    releaseTarget,
    verify,
    async deliveries() { return deliveryStore.list(); },
    close() {
      if (closed) return Promise.resolve();
      closing = true;
      return closingWork ??= (async () => {
        await initializing?.catch(() => {});
        if (retiring) await retireInitialization();
        removePageListener?.();
        await drainRegistrations();
        const result = await release({internal: true});
        if (!result.released) fail('RELEASE_FAILED', 'Browser input is still held', result.failures);
        await deliveryStore.flush();
        for (const attempt of pages.values()) await cleanupRegistration(attempt);
        if (!rootClosed) {
          if (ownContext) await context?.close();
          else if (connected) await browser?.close();
          rootClosed = true;
        }
        for (const remove of listeners) remove();
        closed = true;
      })().finally(() => { closingWork = undefined; });
    },
    getDiagnostics() { return {backgroundErrors: [...backgroundErrors]}; },
  };
}
