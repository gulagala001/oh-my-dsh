import {createStorage} from './storage.mjs';
import {createBrowserBackend} from '../browser/backend.mjs';
import {
  PROTOCOL_VERSION, assertBackend, assertTarget, checkExpected, errorJSON, fail, inputReleased,
  json, readOperation, referenceMatches, sameIdentity,
} from '../protocol.mjs';

/** All public methods resolve to {ok:true,...} or {ok:false,error,state}. */
export async function createController({dataDir, browser, native} = {}) {
  const storage = await createStorage(dataDir);
  const backends = new Map();
  let saved;
  try {
    saved = await storage.read('controller.json', null);
    if (saved && saved.version !== PROTOCOL_VERSION) fail('STATE_VERSION', 'Unsupported controller state version');
    if (browser !== false) {
      const backend = typeof browser?.listTargets === 'function'
        ? browser : await createBrowserBackend({...browser, dataDir: storage.directory});
      assertBackend(backend, 'browser');
      backends.set('browser', backend);
    }
    if (native) { assertBackend(native, 'native'); backends.set('native', native); }
  } catch (error) { await storage.close(); throw error; }

  const cleanShutdown = saved?.closed === true && saved.releasePending === false && !saved.releaseErrors?.length;
  const selected = new Map((saved?.targets ?? []).map(target => [target.id, {...target, verified: false, cold: true,
    releaseAcknowledged: cleanShutdown || target.releaseAcknowledged === true}]));
  const userActivity = new Map();
  const observedActivity = new Map();
  const previews = new Map();
  let mode = saved ? 'recovery_required' : 'active';
  let activeTargetId = saved?.activeTargetId ?? null;
  let releasePending = saved?.releasePending ?? false;
  let releaseErrors = saved?.releaseErrors ?? [];
  let closed = false;
  let closing;
  const closedBackends = new Set();
  let epoch = 0;
  let aborter = new AbortController();
  const recoveryOperations = new Set();
  let tail = Promise.resolve();

  function snapshot() {
    return json({version: PROTOCOL_VERSION, mode, activeTargetId, releasePending, releaseErrors,
      targets: [...selected.values()], userActivity: [...userActivity.values()], closed});
  }
  function forgetTarget(id) {
    selected.delete(id); userActivity.delete(id); observedActivity.delete(id); previews.delete(id);
    if (activeTargetId === id) activeTargetId = [...selected.keys()].at(-1) ?? null;
  }
  async function persist() { await storage.write('controller.json', snapshot()); }
  function response(work) {
    return Promise.resolve().then(work).then(result => json({ok: true, ...result}))
      .catch(error => ({ok: false, error: errorJSON(error), state: snapshot()}));
  }
  function serial(work) {
    const result = tail.then(work);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }
  function alive() {
    if (closed) fail('CONTROLLER_CLOSED', 'Controller is closed');
    if (mode === 'closing') fail('CONTROLLER_CLOSING', 'Controller is closing');
    if (mode === 'close_failed' || closedBackends.size) fail('CLOSE_FAILED', 'Retry close before using this controller');
  }
  function controlAllowed() {
    alive();
    if (mode !== 'active' || releasePending) fail('CONTROL_STOPPED', `Control is blocked (${mode})`);
  }
  function checkOperation(operationEpoch) {
    if (operationEpoch !== epoch) fail('CONTROL_STOPPED', 'Operation interrupted by cancellation or shutdown');
  }
  function targetFor(id = activeTargetId, identity) {
    const target = selected.get(id);
    if (!target) fail('TARGET_NOT_SELECTED', 'Select a target first', {targetId: id});
    if (identity !== undefined && !sameIdentity(target.identity, identity)) fail('TARGET_IDENTITY_CHANGED', 'The approved target occurrence changed', {targetId: id});
    const backend = backends.get(target.backend);
    if (!backend) fail('BACKEND_UNAVAILABLE', `Backend ${target.backend} is not configured`);
    return {target, backend};
  }
  async function verify(target, backend, cold = false, operationEpoch = epoch, signal) {
    checkOperation(operationEpoch);
    const recovery = signal === undefined && aborter.signal.aborted ? new AbortController() : null;
    if (recovery) recoveryOperations.add(recovery);
    signal ??= recovery?.signal ?? aborter.signal;
    try {
      const result = await readOperation(() => backend.verify(json(target), {cold, signal}), signal);
      checkOperation(operationEpoch);
      if (result?.valid !== true) {
        target.verified = false;
        fail('TARGET_IDENTITY_CHANGED', result?.reason ?? 'Target occurrence could not be verified', {targetId: target.id});
      }
      const current = assertTarget(result.target ?? target, target.backend);
      if (current.id !== target.id || !sameIdentity(current.identity, target.identity)) {
        target.verified = false;
        fail('TARGET_IDENTITY_CHANGED', 'Backend returned a different target occurrence', {targetId: target.id});
      }
      if (cold) checkExpected(current, {url: target.url, title: target.title});
      Object.assign(target, current);
      return target;
    } finally { if (recovery) recoveryOperations.delete(recovery); }
  }
  async function releaseAll({ dismissDialogs = false } = {}) {
    const failures = [];
    for (const [name, backend] of backends) {
      if (closedBackends.has(name)) continue;
      try {
        const result = await backend.release({targets: [...selected.values()].filter(target => target.backend === name).map(json), dismissDialogs});
        for (const id of result?.retiredTargetIds ?? []) {
          if (selected.get(id)?.backend !== name) continue;
          forgetTarget(id);
        }
        if (!inputReleased(result)) {
          failures.push({backend: name, ...result, released: false});
        }
      } catch (error) { failures.push({backend: name, ...errorJSON(error)}); }
    }
    releaseErrors = failures;
    releasePending = failures.length > 0;
    if (releasePending) mode = 'release_failed';
    let persistenceError;
    try { await persist(); } catch (error) { persistenceError = error; }
    if (releasePending) fail('RELEASE_FAILED', 'Input release failed; control remains blocked',
      persistenceError ? [...failures, {stage: 'persist-release', ...errorJSON(persistenceError)}] : failures);
    if (persistenceError) throw persistenceError;
  }
  function block(nextMode) {
    alive();
    mode = nextMode;
    releasePending = true;
    epoch++;
    aborter.abort();
    for (const recovery of recoveryOperations) recovery.abort();
    for (const target of selected.values()) target.verified = false;
  }
  async function inventory(operationEpoch = epoch, callerSignal) {
    alive();
    checkOperation(operationEpoch);
    // Inventory is read-only, including after stop. Keep its wait interruptible
    // so discovery cannot hold the input/release lane or publish a late result.
    const recovery = aborter.signal.aborted ? new AbortController() : null;
    if (recovery) recoveryOperations.add(recovery);
    const controlSignal = recovery?.signal ?? aborter.signal;
    const signal = callerSignal ? AbortSignal.any([controlSignal, callerSignal]) : controlSignal;
    try {
      const targets = [], errors = [];
      for (const [name, backend] of backends) {
        try { targets.push(...(await readOperation(() => backend.listTargets({signal}), signal)).map(target => assertTarget(target, name))); }
        catch (error) {
          checkOperation(operationEpoch);
          if (signal.aborted) throw error;
          errors.push({backend: name, ...errorJSON(error)});
        }
        checkOperation(operationEpoch);
      }
      let browsers = [];
      try { browsers = await readOperation(() => backends.get('browser')?.listBrowsers?.({signal}) ?? [], signal); }
      catch (error) {
        checkOperation(operationEpoch);
        if (signal.aborted) throw error;
        errors.push({backend: 'browser', ...errorJSON(error)});
      }
      checkOperation(operationEpoch);
      if (signal.aborted) fail('CONTROL_STOPPED', 'Read interrupted by cancellation or shutdown');
      return {targets, browsers, errors};
    } finally { if (recovery) recoveryOperations.delete(recovery); }
  }

  const controller = {
    listTargets: ({signal} = {}) => {
      const operationEpoch = epoch;
      return response(() => serial(() => inventory(operationEpoch, signal)));
    },
    openTarget: (request = {}) => response(() => serial(async () => {
      alive();
      // Recover cold state only for an explicit new tab after all prior release
      // obligations are acknowledged. An explicit stop remains stopped.
      if (mode === 'recovery_required' && request.backend !== 'native') {
        const operationEpoch = epoch, {browsers} = await inventory();
        if (!request.browserId || browsers.filter(item => item.id === request.browserId).length !== 1) fail('AMBIGUOUS_TARGET', 'Choose one connected browser ID');
        await releaseAll(); checkOperation(operationEpoch);
        aborter = new AbortController(); mode = 'active'; await persist();
      }
      controlAllowed();
      if (request.backend==='native') {
        const operationEpoch=epoch, backend=backends.get('native');
        if (request.launch!==true || ['id','targetId','identity','pid','windowId'].some(key=>request[key]!==undefined)) fail('INVALID_TARGET','Native launch requires a fresh app path or bundleId and launch:true');
        if (request.path!==undefined && !(typeof request.path==='string'&&request.path.startsWith('/')&&request.path.endsWith('.app')) || request.path===undefined && !(typeof request.bundleId==='string'&&request.bundleId)) fail('INVALID_TARGET','Native launch requires an absolute .app path or explicit bundleId');
        if (typeof backend?.openApplication!=='function') fail('UNSUPPORTED_OPERATION','This native backend cannot explicitly launch an application');
        let target;
        try {
          target=assertTarget(await backend.openApplication(request),'native');
          checkOperation(operationEpoch);
          await verify(target,backend,false,operationEpoch);
          checkOperation(operationEpoch);
          // Launch discovers a process; selection and application authorization
          // remain separate. Never activate, select, observe or persist it here.
          return {target,launched:true};
        } catch(error) {
          if(target)error.details={...error.details,launched:true,target,notice:'The app was launched. Rediscover its windows; do not automatically repeat launch.'};
          throw error;
        }
      }
      const operationEpoch = epoch, backend = backends.get('browser');
      if (typeof backend?.newTab !== 'function') fail('UNSUPPORTED_OPERATION', 'This browser cannot create a tab without an existing target');
      const {browsers} = await inventory();
      checkOperation(operationEpoch);
      if (!request.browserId || browsers.filter(item => item.id === request.browserId).length !== 1) fail('AMBIGUOUS_TARGET', 'Choose one connected browser ID');
      let target;
      try {
        target = assertTarget(await backend.newTab(request.browserId, request.url, {signal: aborter.signal, sessionId: request.sessionId}), 'browser');
        checkOperation(operationEpoch);
        if (target.browserId !== request.browserId) fail('TARGET_IDENTITY_CHANGED', 'Created tab belongs to another browser');
        const current = assertTarget(await backend.select(json(target), {signal: aborter.signal}), 'browser');
        checkOperation(operationEpoch);
        if (current.id !== target.id || current.browserId !== request.browserId || !sameIdentity(current.identity, target.identity)) fail('TARGET_IDENTITY_CHANGED', 'Selection changed the created tab occurrence');
        Object.assign(target, current);
        await verify(target, backend, false, operationEpoch);
        selected.set(target.id, {...target, verified: true, cold: false});
        activeTargetId = target.id;
        await persist();
        checkOperation(operationEpoch);
        return {target: selected.get(target.id)};
      } catch (error) {
        if (target) error.details = {...error.details, created: true, target,
          notice: 'A tab was created. Select this target after recovery; do not create another tab.'};
        if (operationEpoch === epoch) { block('faulted'); await releaseAll(); }
        throw error;
      }
    })),
    selectTarget: reference => response(() => serial(async () => {
      alive();
      const operationEpoch = epoch;
      const {targets, errors} = await inventory();
      checkOperation(operationEpoch);
      const matches = targets.filter(target => referenceMatches(target, reference));
      if (matches.length !== 1) fail(matches.length ? 'AMBIGUOUS_TARGET' : 'TARGET_NOT_FOUND',
        'Reference must match exactly one live target', {matches: matches.map(target => target.id), errors});
      const candidate = matches[0];
      const previous = selected.get(candidate.id);
      if (previous && !sameIdentity(previous.identity, candidate.identity)) fail('TARGET_IDENTITY_CHANGED', 'Target ID was reused');
      if (previous?.cold) checkExpected(candidate, {url: previous.url, title: previous.title});
      if (reference?.identity && !sameIdentity(reference.identity, candidate.identity)) fail('TARGET_IDENTITY_CHANGED', 'Reference identity does not match the live occurrence');
      checkExpected(candidate, reference?.expected);
      const backend = backends.get(candidate.backend);
      const controlling = mode === 'active' && !releasePending && !previous?.cold;
      try {
        const target = assertTarget(controlling ? await backend.select(candidate, {signal: aborter.signal}) : candidate, candidate.backend);
        checkOperation(operationEpoch);
        if (target.id !== candidate.id || !sameIdentity(target.identity, candidate.identity)) fail('TARGET_IDENTITY_CHANGED', 'Selection changed occurrence');
        await verify(target, backend, previous?.cold ?? false, operationEpoch);
        checkOperation(operationEpoch);
        // Selection cannot bypass cold recovery or a previous stop.
        Object.assign(target, {verified: mode === 'active' && !releasePending && !previous?.cold, cold: previous?.cold ?? false,
          releaseAcknowledged: previous?.releaseAcknowledged === true});
        selected.set(target.id, target);
        activeTargetId = target.id;
        await persist();
        return {target, state: snapshot()};
      } catch (error) {
        if (controlling && operationEpoch === epoch) { block('faulted'); await releaseAll(); }
        throw error;
      }
    })),
    observe: (request = {}) => {
      const operationEpoch = epoch;
      return response(() => serial(async () => {
        alive();
        checkOperation(operationEpoch);
        const {target, backend} = targetFor(request.targetId, request.targetIdentity);
        if (target.provider === 'extension' || target.backend === 'extension' || target.id.startsWith('extension:')) controlAllowed();
        if (target.cold) fail('RECOVERY_REQUIRED', 'Resume and verify the saved occurrence before observing');
        // Read-only observation remains available after stop on supported backends,
        // but a second stop/close must also cancel that recovery read.
        const recovery = aborter.signal.aborted ? new AbortController() : null;
        if (recovery) recoveryOperations.add(recovery);
        try {
          const signal = recovery?.signal ?? aborter.signal;
          await verify(target, backend, false, operationEpoch, signal);
          checkOperation(operationEpoch);
          const activitySequence = userActivity.get(target.id)?.sequence ?? 0;
          const observation = await readOperation(() => backend.observe(json(target), {...request, signal, format: request.format ?? 'both'}), signal);
          checkOperation(operationEpoch);
          const activity = observation.userActivity, previous = userActivity.get(target.id);
          if (activity?.sequence && (previous?.documentId !== activity.documentId || previous.sequence < activity.sequence)) {
            userActivity.set(target.id, { ...activity, targetId: target.id });
          }
          observedActivity.set(target.id, activity?.sequence ?? activitySequence);
          await persist();
          checkOperation(operationEpoch);
          return {targetId: target.id, observation, userActivity: userActivity.get(target.id) ?? null,
            observedUserActivitySequence: observedActivity.get(target.id) ?? 0};
        } finally { if (recovery) recoveryOperations.delete(recovery); }
      }));
    },
    act: (request = {}) => response(() => serial(async () => {
      const dialogAction = ['getDialog', 'handleDialog'].includes(request.action);
      if (dialogAction) alive(); else controlAllowed();
      const operationEpoch = epoch;
      const {target, backend} = targetFor(request.targetId, request.targetIdentity);
      if (target.cold || !dialogAction && !target.verified) fail('RECOVERY_REQUIRED', 'Resume this target before acting');
      // A clean shutdown receipt survives another restart, but never a new
      // dispatch. Persist invalidation first so a crash cannot reuse the receipt.
      if (target.releaseAcknowledged) { target.releaseAcknowledged = false; await persist(); checkOperation(operationEpoch); }
      let result;
      const recovery = dialogAction && aborter.signal.aborted ? new AbortController() : null;
      if (recovery) recoveryOperations.add(recovery);
      try {
        const signal = recovery?.signal ?? aborter.signal;
        await verify(target, backend, false, operationEpoch, signal);
        if (dialogAction) alive(); else controlAllowed();
        result = await backend.act(json(target), {...request, signal});
        if (operationEpoch !== epoch) fail('CONTROL_STOPPED', 'Action interrupted by cancellation or shutdown');
        if (result?.closedTargetId && (request.action !== 'closeTab' || result.closedTargetId !== target.id))
          fail('TARGET_IDENTITY_CHANGED', 'Action closed an unrelated target');
        if (result?.target) {
          const current = assertTarget(result.target, target.backend);
          if (current.id === target.id && !sameIdentity(current.identity, target.identity)) fail('TARGET_IDENTITY_CHANGED', 'Action changed occurrence');
          const navigation = ['navigate', 'back', 'forward', 'reload'].includes(request.action);
          const replaced = navigation && result.replacedTargetId === target.id && target.provider === 'extension' && current.provider === 'extension' &&
            ['instanceId', 'browserInstanceId', 'epoch', 'tabId'].every(key => current.identity[key] === target.identity[key]);
          if (current.id !== target.id && request.action !== 'newTab' && !replaced) fail('TARGET_IDENTITY_CHANGED', 'Action returned another target');
          const previous = selected.get(current.id);
          if (previous && !sameIdentity(previous.identity, current.identity)) fail('TARGET_IDENTITY_CHANGED', 'Action reused a selected target ID');
          if (current.id !== target.id) await verify(current, backend, false, operationEpoch, signal);
          if (operationEpoch !== epoch) fail('CONTROL_STOPPED', 'Action interrupted by cancellation or shutdown');
          if (replaced) forgetTarget(target.id);
          selected.set(current.id, {...current, verified: true, cold: false});
          activeTargetId = current.id;
        }
        if (result?.closedTargetId) forgetTarget(result.closedTargetId);
        await persist();
        checkOperation(operationEpoch);
        return {targetId: result?.target?.id ?? target.id, result: result ?? {}};
      }
      catch (error) {
        const unresolvedLocator = ['locator','domSnapshot'].includes(request.action) && error.details?.inputDispatched !== true && ['LOCATOR_NOT_FOUND', 'AMBIGUOUS_LOCATOR', 'UNSUPPORTED_LOCATOR', 'LOCATOR_NOT_ACTIONABLE', 'LOCATOR_NOT_STABLE', 'STALE_ELEMENT', 'STALE_OBSERVATION', 'FRAME_NOT_FOUND', 'FRAME_DETACHED'].includes(error.code);
        const rejectedEditing = ['selectText','paste'].includes(request.action) && error.details?.inputDispatched === false
          && ['INVALID_ARGUMENT','ELEMENT_NOT_EDITABLE','AMBIGUOUS_TEXT','TEXT_NOT_FOUND','UNSUPPORTED_PASTE_FORMAT','UNSUPPORTED_ACTION','STALE_ELEMENT','STALE_OBSERVATION','FRAME_NOT_FOUND','FRAME_DETACHED'].includes(error.code);
        const rejectedSecondary = request.action === 'performSecondaryAction' && error.details?.inputDispatched === false
          && ['INVALID_ARGUMENT','UNSUPPORTED_ACTION','ELEMENT_DISABLED','STALE_ELEMENT'].includes(error.code);
        const rejectedClick = ['click','doubleClick','double_click','rightClick','right_click'].includes(request.action) && error.details?.inputDispatched === false
          && ['INVALID_ARGUMENT','INPUT_ALREADY_HELD','RELEASE_REQUIRED','UNSUPPORTED_ACTION','STALE_ELEMENT','STALE_OBSERVATION','FOREGROUND_REQUIRED','TARGET_NOT_ACTIVE'].includes(error.code);
        const rejectedPress = ['press','pressKey','press_key','keypress','key','keyDown','keyUp','key_down','key_up'].includes(request.action) && error.details?.inputDispatched === false
          && ['INVALID_ARGUMENT','INVALID_ACTION','UNKNOWN_KEY','UNSUPPORTED_KEY','INPUT_ALREADY_HELD','RELEASE_REQUIRED','UNSUPPORTED_ACTION','STALE_ELEMENT','STALE_OBSERVATION','FOREGROUND_REQUIRED','TARGET_NOT_ACTIVE'].includes(error.code);
        const staleTextInput = ['fill','setValue','set_value','type','typeText','type_text','input','ax_press'].includes(request.action) && error.details?.inputDispatched === false
          && ['STALE_ELEMENT','STALE_OBSERVATION','FOREGROUND_REQUIRED','TARGET_NOT_ACTIVE','UNSUPPORTED_ACTION','INPUT_ALREADY_HELD'].includes(error.code);
        const rejectedPointer = ['scroll','drag','move','mouse_move','mouseDown','mouseUp','mouse_down','mouse_up','hitTest','hit_test','cursor'].includes(request.action) && error.details?.inputDispatched === false
          && ['INVALID_ARGUMENT','INPUT_ALREADY_HELD','RELEASE_REQUIRED','UNSUPPORTED_ACTION','STALE_ELEMENT','STALE_OBSERVATION','FOREGROUND_REQUIRED','TARGET_NOT_ACTIVE'].includes(error.code);
        const recoverableDialog = ['JS_DIALOG_OPEN', 'STALE_DIALOG'].includes(error.code);
        if (operationEpoch === epoch && !unresolvedLocator && !rejectedEditing && !rejectedSecondary && !rejectedClick && !rejectedPress && !staleTextInput && !rejectedPointer && !recoverableDialog) {
          block('faulted');
          await releaseAll();
        }
        throw error;
      }
      finally { if (recovery) recoveryOperations.delete(recovery); }

    })),
    stop: () => {
      try { block('stopped'); } catch (error) { return response(() => { throw error; }); }
      return response(() => serial(async () => { await releaseAll({dismissDialogs:true}); return {state: snapshot()}; }));
    },
    notifyUserActivity: (request = {}) => response(() => {
      alive();
      const {target} = targetFor(request.targetId);
      const previous = userActivity.get(target.id);
      const activity = {targetId: target.id, sequence: (previous?.sequence ?? 0) + 1, at: new Date().toISOString(), kind: request.kind ?? 'interaction'};
      userActivity.set(target.id, activity);
      return {activity, state: snapshot()};
    }),
    resume: (request = {}) => response(() => serial(async () => {
      alive();
      if (closedBackends.size) fail('CLOSE_FAILED', 'Some backends are already closed; retry close');
      const operationEpoch = epoch;
      const {target, backend} = targetFor(request.targetId, request.targetIdentity);
      let selecting = false;
      const recovery = aborter.signal.aborted ? new AbortController() : null;
      if (recovery) recoveryOperations.add(recovery);
      const signal = recovery?.signal ?? aborter.signal;
      try {
        if (releasePending || mode === 'recovery_required') {
          await releaseAll();
          checkOperation(operationEpoch);
        }
        await verify(target, backend, target.cold, operationEpoch, signal);
        checkOperation(operationEpoch);
        selecting = true;
        const current = await backend.select(json(target), {signal});
        checkOperation(operationEpoch);
        const resumed = assertTarget(current, target.backend);
        if (resumed.id !== target.id || !sameIdentity(resumed.identity, target.identity)) fail('TARGET_IDENTITY_CHANGED', 'Resume selection changed occurrence');
        if (target.cold) checkExpected(resumed, {url: target.url, title: target.title});
        await verify(resumed, backend, target.cold, operationEpoch, signal);
        checkOperation(operationEpoch);
        if (mode !== 'active') aborter = new AbortController();
        Object.assign(target, resumed, {verified: true, cold: false});
        activeTargetId = target.id;
        mode = 'active';
        await persist();
        checkOperation(operationEpoch);
        return {target, state: snapshot()};
      } catch (error) {
        if (selecting) {
          if (operationEpoch === epoch) block('faulted');
          const releaseEpoch = epoch;
          await releaseAll();
          checkOperation(releaseEpoch);
        }
        throw error;
      } finally { if (recovery) recoveryOperations.delete(recovery); }
    })),
    recoverClosedTargets: (request = {}) => response(() => serial(async () => {
      alive();
      if (!releasePending || JSON.stringify(releaseErrors) !== request.expectedReleaseErrors) fail('RECOVERY_CHANGED', 'Recovery state changed; review the current pending connections again');
      const ids = new Set(request.targetIds);
      if (!ids.size) fail('INVALID_ARGUMENT', 'Choose the exact closed browser connections');
      const targets = [...ids].map(id => targetFor(id).target);
      if (targets.some(target => target.backend !== 'browser' || !['extension', 'dsh'].includes(target.provider))) fail('INVALID_ARGUMENT', 'Only closed browser connections can be confirmed');
      const result = await backends.get('browser').confirmClosedTargets(targets);
      if (result?.released !== true) fail('RELEASE_FAILED', 'Closed connection confirmation was not persisted');
      block('stopped');
      for (const id of ids) forgetTarget(id);
      if (ids.has(activeTargetId)) activeTargetId = null;
      await releaseAll();
      mode = 'recovery_required'; await persist();
      return {state: snapshot()};
    })),
    getState: () => response(async () => ({state: snapshot()})),
    preview: (request = {}) => response(async () => {
      alive();
      const operationEpoch = epoch;
      const {target, backend} = targetFor(request.targetId, request.targetIdentity);
      if (target.cold) fail('RECOVERY_REQUIRED', 'The saved target has not been verified');
      if (typeof backend.preview !== 'function') fail('UNSUPPORTED_OPERATION', 'This backend does not provide monitor frames');
      let capture = previews.get(target.id);
      if (!capture) {
        // Capturing monitor frames must not occupy the serial input/recovery lane.
        capture = (async () => {
          const current = await backend.verify(json(target), {monitoring: true});
          checkOperation(operationEpoch);
          if (current?.valid !== true || current.target && (current.target.id !== target.id || !sameIdentity(current.target.identity, target.identity))) fail('TARGET_IDENTITY_CHANGED', current?.reason ?? 'Preview target is no longer available');
          const preview = await backend.preview(json(target));
          return { ...preview, active: preview.active ?? current.target?.active === true, isDetached: current.target?.isDetached === true };
        })().finally(() => { if (previews.get(target.id) === capture) previews.delete(target.id); });
        previews.set(target.id, capture);
      }
      let timer;
      const preview = await Promise.race([capture, new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('Monitor capture timed out; input remains available'), {code: 'PRESENTATION_TIMEOUT'})), 12000);
      })]).finally(() => clearTimeout(timer));
      checkOperation(operationEpoch);
      if (selected.get(target.id) !== target) fail('TARGET_IDENTITY_CHANGED', 'The monitored target changed');
      return {target, preview};
    }),
    stopPreview: (request = {}) => response(async () => {
      alive();
      const target = selected.get(request.targetId), backend = backends.get(target?.backend);
      if (typeof backend?.stopPreview === 'function') await backend.stopPreview(target.id);
      return {released: true};
    }),
    focus: (request = {}) => response(() => serial(async () => {
      alive();
      const operationEpoch = epoch;
      let target, backend;
      if (request.reference) {
        const reference = request.reference;
        if (!reference.identity || typeof reference.id !== 'string') fail('TARGET_IDENTITY_REQUIRED', 'Opening a target reference requires its original identity');
        const matches = (await inventory()).targets.filter(value => value.id === reference.id && sameIdentity(value.identity, reference.identity));
        if (matches.length !== 1) fail('TARGET_IDENTITY_CHANGED', 'The referenced application or browser occurrence is no longer available');
        target = matches[0]; backend = backends.get(target.backend);
        checkExpected(target, reference.expected);
      } else ({target, backend} = targetFor(request.targetId, request.targetIdentity));
      if (target.cold) fail('RECOVERY_REQUIRED', 'Resume and verify the saved target before opening it');
      const recovery = aborter.signal.aborted ? new AbortController() : null;
      if (recovery) recoveryOperations.add(recovery);
      const signal = recovery?.signal ?? aborter.signal;
      try {
        await verify(target, backend, false, operationEpoch, signal);
        if (typeof backend.focus !== 'function') fail('UNSUPPORTED_OPERATION', 'This backend cannot open the selected target');
        const result = await backend.focus(json(target), {signal});
        checkOperation(operationEpoch);
        await persist();
        return {targetId: target.id, result, state: snapshot()};
      } finally { if (recovery) recoveryOperations.delete(recovery); }
    })),
    // Hand the screen back while keeping the selection, so a model that stops to ask
    // the user something does not hold the monitor while it waits for the answer.
    away: (request = {}, {isCurrent} = {}) => response(() => serial(async () => {
      alive();
      if (isCurrent && !isCurrent()) return {away: false, state: snapshot()};
      if (!selected.size || !activeTargetId) return {away: false, state: snapshot()};
      const {target, backend} = request.targetId ? targetFor(request.targetId, request.targetIdentity) : targetFor();
      // Only the Hyprland helper ever takes the view away from the user. Elsewhere there is
      // nothing to give back, so the hand-back is a no-op rather than an error the caller
      // would report on every turn end.
      if (typeof backend.away !== 'function') return {away: false, state: snapshot()};
      const relinquish = request.relinquish === true;
      try {
        return {targetId: target.id, relinquish, away: await backend.away(json(target), {relinquish}), state: snapshot()};
      } catch (error) {
        block('faulted');
        await releaseAll();
        throw error;
      }
    })),
    permissions: () => response(() => serial(async () => {
      alive();
      const backend = backends.get('native');
      if (!backend || typeof backend.permissions !== 'function') return {permissions: {available: false, platform: process.platform}};
      return {permissions: {available: true, ...await backend.permissions()}};
    })),
    openPermissionSettings: (request = {}) => response(() => serial(async () => {
      alive();
      const backend = backends.get('native');
      if (!backend || typeof backend.openPermissionSettings !== 'function') fail('BACKEND_UNAVAILABLE', 'Native permission settings are unavailable');
      return {result: await backend.openPermissionSettings(request.permission)};
    })),
    deliveries: () => response(() => serial(async () => {
      alive();
      const records = [];
      for (const backend of backends.values()) {
        if (typeof backend.deliveries === 'function') records.push(...await backend.deliveries());
      }
      return {deliveries: records};
    })),
    close: () => {
      if (closed) return response(async () => ({state: snapshot()}));
      if (closing) return closing;
      mode = 'closing'; releasePending = true; epoch++; aborter.abort();
      for (const recovery of recoveryOperations) recovery.abort();
      for (const target of selected.values()) target.verified = false;
      closing = response(() => serial(async () => {
        await releaseAll({dismissDialogs:true});
        // Backend teardown cancels its captures; a missing monitor frame cannot hold shutdown hostage.
        const failures = [];
        for (const [name, backend] of backends) {
          if (closedBackends.has(name)) continue;
          try { await backend.close(); closedBackends.add(name); }
          catch (error) { failures.push({backend: name, ...errorJSON(error)}); }
        }
        if (failures.length) { mode = 'close_failed'; await persist(); fail('CLOSE_FAILED', 'Backend close failed', failures); }
        mode = 'closed'; closed = true;
        try { await persist(); await storage.close(); }
        catch (error) { closed = false; mode = 'close_failed'; throw error; }
        return {state: snapshot()};
      })).finally(() => { closing = undefined; });
      return closing;
    },
  };
  try { await persist(); }
  catch (error) { await storage.close(); throw error; }
  return controller;
}

export {PROTOCOL_VERSION, BACKEND_CONTRACT, BROWSER_ACTIONS, OpenCUError} from '../protocol.mjs';
