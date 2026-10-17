import {randomUUID, createHash} from 'node:crypto';
import {mkdir, readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {checkExpected, checkSignal, fail, referenceMatches, sameIdentity} from '../protocol.mjs';
import {createDeliveryStore} from './deliveries.mjs';
import {observePage} from './observation.mjs';
import {actOnPage, releasePage, normalizeBrowserAction} from './actions.mjs';
import {createInputState} from './input-state.mjs';
import {createUserActivityMonitor} from './user-activity.mjs';
import {createCDPFrameRouter} from '../../extension/frame-router.js';

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
  const pages = new WeakMap();
  const downloads = new WeakMap();
  let browser;
  let context;
  let connectionId, contextId;
  let initializing;
  let closed = false;
  let blocked = false;
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

  async function initialize() {
    if (closed) fail('BACKEND_CLOSED', 'Browser backend is closed');
    if (initializing) return initializing;
    if (context) return;
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
        context = await playwright.chromium.launchPersistentContext(profile, {
          headless,
          viewport: options.viewport !== undefined ? options.viewport : headless ? {width: 1280, height: 800} : null,
          acceptDownloads: true,
          ...options.launchOptions,
        });
        ownContext = true;
        browser = context.browser();
        connectionId = `owned:${randomUUID()}`;
      }
      listen(context, 'page', page => { void register(page).catch(error => backgroundErrors.push(error.message)); });
      await Promise.all(context.pages().map(register));
      if (context.pages().length === 0 && ownContext) await register(await context.newPage());
    })();
    try { await initializing; } catch (error) {
      for (const remove of listeners) remove();
      if (ownContext) await context?.close().catch(() => {});
      else if (connected) await browser?.close().catch(() => {});
      context = undefined; browser = undefined; initializing = undefined;
      records.clear();
      throw error;
    }
  }

  function capture(download, targetId) {
    let work = downloads.get(download);
    if (!work) { work = deliveryStore.capture(download, targetId); downloads.set(download, work); }
    return work;
  }
  function register(page) {
    let work = pages.get(page);
    if (work) return work;
    work = (async () => {
      const session = await context.newCDPSession(page);
      const {targetInfo} = await session.send('Target.getTargetInfo');
      contextId ??= targetInfo.browserContextId;
      const id = `tab:${createHash('sha256').update(`${browserId}\0${connectionId}\0${targetInfo.targetId}`).digest('hex').slice(0, 32)}`;
      const record = {
        id, page, session,
        identity: {browserId, connectionId, targetId: targetInfo.targetId, contextId: targetInfo.browserContextId ?? 'default'},
        keys: new Set(), buttons: new Set(), pending: new Set(), elements: new Map(), nextElementId: 0, documentGeneration: 0,
      };
      record.frameRouter = createCDPFrameRouter((method, params) => session.send(method, params), listener => {
        const received = params => listener('Target.receivedMessageFromTarget', params), detached = params => listener('Target.detachedFromTarget', params);
        session.on('Target.receivedMessageFromTarget', received); session.on('Target.detachedFromTarget', detached);
        return () => {session.off('Target.receivedMessageFromTarget', received); session.off('Target.detachedFromTarget', detached);};
      });
      page.setDefaultTimeout(timeoutMs);
      const removers = [
        listen(page, 'download', download => { void capture(download, id).catch(error => backgroundErrors.push(error.message)); }),
        listen(page, 'framenavigated', frame => { if (frame === page.mainFrame()) { record.documentGeneration++; record.elements.clear(); record.screenshot = undefined; } }),
        listen(page, 'domcontentloaded', () => {
          if (record.cursor && !closed) void updateCursor(record, {...record.cursor, animateMovement: false}).catch(error => backgroundErrors.push(error.message));
        }),
      ];
      try {
        record.activity = await createUserActivityMonitor(session);
        if (page.isClosed()) fail('TARGET_CLOSED', 'Browser tab closed during registration');
        inputState.adopt(record);
        records.set(id, record);
        removers.push(listen(page, 'close', () => {
          for (const remove of removers) remove();
          records.delete(id); pages.delete(page);
          void inputState.forget(record).catch(error => backgroundErrors.push(error.message));
        }));
      } catch (error) {
        for (const remove of removers) remove();
        throw error;
      }
      return record;
    })();
    pages.set(page, work);
    return work;
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
      if (request.url) await actOnPage(next, {...request, action: 'navigate'}, {timeoutMs, capture, persistInputs: inputState.persist});
      checkSignal(request.signal);
      return {action: 'newTab', target: await descriptor(next)};
    } catch (error) {
      if (creation) error.details = {...error.details, created: true, browserId, backendTargetId: creation.targetId,
        ...(next ? {target: await descriptor(next).catch(() => ({id: next.id, browserId, identity: next.identity}))} : {}),
        notice: 'A tab was created. Discover this browser before retrying; do not create another tab.'};
      throw error;
    } finally { if (!record) await session.detach().catch(() => {}); }
  }
  async function descriptor(record) {
    if (record.page.isClosed()) fail('TARGET_CLOSED', 'Browser tab is closed');
    return {
      id: record.id, backend: 'browser', kind: 'tab', browserId,
      title: await record.page.title(), url: record.page.url(), identity: record.identity,
      capabilities: ['ax', 'screenshot', 'navigation', 'tabs', 'focus', 'mouse', 'keyboard', 'uploads', 'downloads', 'hitTest', 'getDOM', 'designTweak'],
    };
  }
  async function recordFor(target) {
    await initialize();
    const record = records.get(target.id);
    if (!record || record.page.isClosed()) fail('TARGET_CLOSED', 'Browser tab occurrence is no longer available');
    if (!sameIdentity(record.identity, target.identity)) fail('TARGET_IDENTITY_CHANGED', 'Browser tab identity changed');
    return record;
  }
  async function verify(target) {
    await initialize();
    const record = records.get(target.id);
    if (!record || record.page.isClosed()) return {valid: false, reason: 'Browser tab occurrence is no longer available'};
    try {
      const {targetInfo} = await record.session.send('Target.getTargetInfo');
      if (targetInfo.targetId !== record.identity.targetId || !sameIdentity(record.identity, target.identity)) {
        return {valid: false, reason: 'Browser connection or target occurrence changed'};
      }
      return {valid: true, target: await descriptor(record)};
    } catch (error) { return {valid: false, reason: error.message}; }
  }
  async function release() {
    if (inputState.hasPending() && !context) await initialize();
    const failures = [];
    for (const record of records.values()) {
      record.cursor = undefined; record.cursorRevision = (record.cursorRevision ?? 0) + 1;
      if (!record.page.isClosed()) await record.page.evaluate(() => { void globalThis.__opencuCursor?.update({visible: false}); }).catch(error => backgroundErrors.push(error.message));
      failures.push(...await releasePage(record, releaseTimeoutMs));
    }
    const liveIds = new Set([...records.values()].filter(record => !record.page.isClosed()).map(record => record.id));
    failures.push(...await inputState.missing(connectionId ?? 'uninitialized', liveIds));
    if (inputState.hasForeign()) failures.push({error: 'Another browser identity has unreleased persisted input'});
    blocked = failures.length > 0;
    return {released: !blocked, failures};
  }
  return {
    async listBrowsers() { return context && !closed ? [{id: browserId, provider: 'browser', name: 'Chromium', connected: true}] : []; },
    async newTab(id, url, {signal} = {}) {
      if (id !== browserId) fail('TARGET_NOT_FOUND', 'Choose this connected browser ID');
      if (blocked) fail('RELEASE_FAILED', 'Browser remains blocked until input release succeeds');
      return (await newTab({url, signal})).target;
    },
    async listTargets() {
      await initialize();
      await Promise.all(context.pages().map(register));
      const targets = [];
      for (const record of records.values()) if (!record.page.isClosed()) targets.push(await descriptor(record));
      return targets;
    },
    async select(reference) {
      const targets = await this.listTargets();
      const matches = targets.filter(target => referenceMatches(target, reference));
      if (matches.length !== 1) fail(matches.length ? 'AMBIGUOUS_TARGET' : 'TARGET_NOT_FOUND', 'Reference must match one browser tab');
      checkExpected(matches[0], reference?.expected);
      return matches[0];
    },
    async focus(target) {
      const record = await recordFor(target);
      await record.page.bringToFront();
      return {focused: true, target: await descriptor(record)};
    },
    async preview(target) {
      const record = await recordFor(target);
      const bytes = await record.page.screenshot({ type: 'jpeg', quality: 65, timeout: timeoutMs });
      return { dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`, ...await record.page.evaluate(() => ({ width: innerWidth, height: innerHeight, active: document.hasFocus() })) };
    },
    async observe(target, request = {}) {
      const record = await recordFor(target);
      const observation = await observePage(record, request, {dataDir, sharp: options.sharp, timeoutMs});
      observation.identity = record.identity;
      observation.targetId = record.id;
      observation.userActivity = await record.activity.read();
      return observation;
    },
    async act(target, request) {
      request = normalizeBrowserAction(request);
      if (blocked) fail('RELEASE_FAILED', 'Browser remains blocked until input release succeeds');
      const record = await recordFor(target);
      const inputSequence = record.inputDispatchSequence ?? 0;
      checkSignal(request.signal);
      try {
        if (request.action === 'newTab') return await newTab(request, record);
        if (request.action === 'closeTab') {
          const failures = await releasePage(record, releaseTimeoutMs);
          if (failures.length) fail('RELEASE_FAILED', 'Cannot close tab before input release', failures);
          checkSignal(request.signal);
          await record.page.close();
          await inputState.persist();
          return {action: 'closeTab', closedTargetId: record.id};
        }
        const result = await actOnPage(record, request, {timeoutMs, capture, persistInputs: inputState.persist,
          cursor: cursor => updateCursor(record, cursor), expectInput: events => record.activity.expect(events)});
        await inputState.persist();
        return {...result, target: await descriptor(record)};
      } catch (error) {
        error.details = {...error.details, inputDispatched: error.details?.inputDispatched === true || (record.inputDispatchSequence ?? 0) !== inputSequence};
        if (request.action === 'locator' && error.details.inputDispatched !== true && ['FRAME_NOT_FOUND', 'FRAME_DETACHED', 'LOCATOR_NOT_STABLE', 'STALE_ELEMENT', 'STALE_OBSERVATION'].includes(error.code)) throw error;
        if (request.action === 'locator' && error.details.inputDispatched !== true && ['LOCATOR_NOT_FOUND', 'AMBIGUOUS_LOCATOR', 'UNSUPPORTED_LOCATOR', 'LOCATOR_NOT_ACTIONABLE'].includes(error.code)) throw error;
        blocked = true;
        const released = await release();
        if (!released.released) fail('RELEASE_FAILED', 'Action failed and input release is incomplete', {cause: error.message, failures: released.failures});
        throw error;
      }
    },
    release,
    verify,
    async deliveries() { return deliveryStore.list(); },
    async close() {
      if (closed) return;
      const result = await release();
      if (!result.released) fail('RELEASE_FAILED', 'Browser input is still held', result.failures);
      await deliveryStore.flush();
      for (const record of records.values()) {
        if (!record.page.isClosed() && !record.detached) { await record.activity.dispose(); await record.frameRouter.close(); await record.session.detach(); record.detached = true; }
      }
      if (ownContext) await context?.close();
      else if (connected) await browser?.close();
      for (const remove of listeners) remove();
      closed = true;
    },
    getDiagnostics() { return {backgroundErrors: [...backgroundErrors]}; },
  };
}
