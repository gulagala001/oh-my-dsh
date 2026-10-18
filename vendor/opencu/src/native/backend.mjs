import {mkdir, readFile} from 'node:fs/promises';
import {AsyncLocalStorage} from 'node:async_hooks';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMacHelper} from './build.mjs';
import {createHelperTransport} from './transport.mjs';
import {NativeBackendError, nativeError, normalizeAction} from './protocol.mjs';
import {installMacHelper} from './macos-install.mjs';
import {checkMacHelperIdentity} from './macos-identity.mjs';
import {MACOS_AX_EXTENSIONS} from '../protocol.mjs';

/** Plain backend contract; the controller owns public ok/error envelopes. */
export async function createNativeBackend({dataDir, helperPath, compileHelper = false, onCursor} = {}) {
  if (typeof dataDir !== 'string' || !dataDir) throw new NativeBackendError('INVALID_DATA_DIR', 'Native backend requires a private dataDir.');
  if (!['darwin', 'win32', 'linux'].includes(process.platform)) {
    throw new NativeBackendError('UNSUPPORTED_PLATFORM', 'Native application control is not available on this platform.', { platform: process.platform });
  }
  const directory = resolve(dataDir, 'native');
  await mkdir(directory, {recursive: true, mode: 0o700});
  // The helper owns an OS flock; process death releases ownership, not its durable held-input journal.
  let transport, installationLease, macCommand, closed = false, closing, cursorTarget, cursorTimer, cursorVerifying = false, cursorError;
  let permissionProbe, refreshing;
  const inFlight = new Set();
  let cursorDispatch = value => onCursor?.(value), cursorPending, cursorWork, actionCursorTarget, actionCursorDispatch;
  function publishCursor(value) {
    if (!onCursor) return;
    cursorPending = { value, dispatch: cursorDispatch };
    if (!cursorWork) cursorWork = (async () => {
      while (cursorPending) {
        const {value, dispatch} = cursorPending; cursorPending = undefined;
        try { await dispatch(value); cursorError = undefined; }
        catch (error) { cursorError = error.message; }
      }
    })().finally(() => { cursorWork = undefined; });
  }
  function hideCursor() {
    clearInterval(cursorTimer); cursorTimer = undefined; cursorTarget = undefined;
    publishCursor({visible: false});
  }
  function cursorEvent(event) {
    if (event.type !== 'cursor' || !onCursor) return;
    if (event.visible === false) { hideCursor(); return; }
    if (!actionCursorTarget || event.targetId !== actionCursorTarget.id || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return;
    cursorTarget = actionCursorTarget; cursorDispatch = actionCursorDispatch;
    publishCursor({...event, target: cursorTarget});
    if (!cursorTimer) {
      cursorTimer = setInterval(async () => {
        if (cursorVerifying || !cursorTarget || closed) return;
        const target = cursorTarget;
        cursorVerifying = true;
        try {
          const result = await request('verify', {target, options: {monitoring: true}}, {monitoring: true, timeoutMs: 2000});
          if (cursorTarget === target && result.valid === false) hideCursor();
        } catch (error) { cursorError = error.message; }
        finally { cursorVerifying = false; }
      }, 500);
      cursorTimer.unref?.();
    }
  }
  const transportOptions = { onEvent: cursorEvent, onExit: hideCursor };
  try {
    if (process.platform === 'linux') {
      const helper = process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY ? 'wayland.py' : 'helper.py';
      transport = createHelperTransport(helperPath || '/usr/bin/python3', [fileURLToPath(new URL(`../../native/linux/${helper}`, import.meta.url)), '--data-dir', directory], transportOptions);
    } else if (process.platform === 'win32') {
      const script = fileURLToPath(new URL('../../native/windows/helper.ps1', import.meta.url));
      const literal = value => `'${value.replaceAll("'", "''")}'`;
      const command = helperPath || resolve(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
      transport = createHelperTransport(command, ['-NoProfile', '-NonInteractive', '-Command', `& { ${await readFile(script, 'utf8')} } -DataDir ${literal(directory)}`], { ...transportOptions, env: { ...process.env, OPENCU_HELPER_SOURCE: resolve(script, '..') } });
    } else {
      const packaged = await buildMacHelper(directory, {helperPath, compile: compileHelper});
      await checkMacHelperIdentity(resolve(packaged, '../../..'));
      installationLease = createHelperTransport(packaged, ['--installation-lock', directory]);
      await installationLease.request('hello');
      macCommand = await installMacHelper(packaged, directory);
      transport = createHelperTransport(macCommand, ['--data-dir', directory], transportOptions);
    }
    await transport.request('hello');
    if (process.platform === 'darwin') await transport.request('configureCursor', {path: fileURLToPath(new URL('../../lib/cursor.html', import.meta.url))});
  } catch (error) {
    if (transport) await transport.close().catch(() => {});
    await installationLease?.close().catch(() => {});
    throw nativeError(error, 'start');
  }
  const permissionNames = ['accessibility', 'screenCapture', 'postEvents', 'listenEvents'];
  // A new process sees grants that macOS cached as denied in the existing helper.
  async function currentPermissions() {
    if (permissionProbe) return permissionProbe;
    permissionProbe = (async () => {
      const current = await request('permissions');
      if (!macCommand) return current;
      const probe = createHelperTransport(macCommand, ['--permissions'], {timeout: 10000});
      let fresh;
      try { fresh = await probe.request('permissions'); }
      finally { await probe.close(); }
      if (fresh.permissionOwner !== 'helper') throw new NativeBackendError('NATIVE_PERMISSION_PROBE_FAILED', 'Could not read the helper permissions in a fresh macOS process.');
      if (!closing && !closed && permissionNames.some(name => fresh[name] === true && current[name] !== true)) {
        refreshing = (async () => {
          // Gate new work; never interrupt an active request or a held key/button sequence.
          if (inFlight.size) return;
          const status = await transport.request('hello');
          if (closing || closed || status.input?.heldKeys?.length || status.input?.heldButtons?.length || status.recoveryRequired) return;
          hideCursor();
          await transport.close();
          transport = createHelperTransport(macCommand, ['--data-dir', directory], transportOptions);
          await transport.request('hello');
          await transport.request('configureCursor', {path: fileURLToPath(new URL('../../lib/cursor.html', import.meta.url))});
        })();
        try { await refreshing; }
        finally { refreshing = undefined; }
      }
      return fresh;
    })().finally(() => { permissionProbe = undefined; });
    return permissionProbe;
  }
  const known = new Map();
  async function request(method, params, options) {
    if (refreshing) await refreshing;
    if (closed || closing) throw new NativeBackendError('NATIVE_CLOSED', 'Native backend is closed.');
    const work = transport.request(method, params, options);
    inFlight.add(work);
    try { return await work; }
    catch (error) { throw nativeError(error, method); }
    finally { inFlight.delete(work); }
  }
  function reference(value) {
    if (typeof value === 'string') return known.get(value) ?? {id: value.includes(':') ? value : undefined, bundleId: value.includes(':') ? undefined : value};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NativeBackendError('INVALID_TARGET', 'A target object, target ID or bundle ID is required.');
    return value;
  }
  const backend = {
    async listTargets() {
      const values = await request('listTargets');
      known.clear();
      for (const target of values) known.set(target.id, target);
      return values;
    },
    async select(value) {
      const target = await request('select', {reference: reference(value)});
      known.set(target.id, target);
      return target;
    },
    async openApplication(reference) {
      if (process.platform!=='darwin') throw new NativeBackendError('UNSUPPORTED_PLATFORM','Explicit application launch is currently supported only by the macOS helper.');
      if (!reference || typeof reference!=='object' || reference.launch!==true || ['id','targetId','identity','pid','windowId'].some(key=>reference[key]!==undefined)) throw new NativeBackendError('INVALID_TARGET','Launch requires a fresh explicit app path or bundleId, not a saved occurrence.');
      if (!(typeof reference.path==='string'&&reference.path.startsWith('/')&&reference.path.endsWith('.app')) && !(typeof reference.bundleId==='string'&&reference.bundleId)) throw new NativeBackendError('INVALID_TARGET','Specify an absolute .app path or bundleId to launch.');
      const target=await request('select',{reference:{...(reference.path?{path:reference.path}:{bundleId:reference.bundleId}),launch:true}});
      known.set(target.id,target);
      return target;
    },
    async focus(target) {
      const value = await request('focus', {reference: reference(target)});
      known.set(value.id, value);
      return {focused: true, target: value};
    },
    async permissions() { return {...await currentPermissions(), ...(onCursor ? {cursor: {host: process.platform === 'darwin' ? 'REA-native' : 'REA-desktop', error: cursorError ?? null}} : {})}; },
    async getPermissions() { return backend.permissions(); },
    async applicationMetadata(target) {
      if (process.platform !== 'darwin') return { displayName: target.name || target.title, iconDataURL: target.iconDataURL ?? null };
      return request('applicationMetadata', { target: reference(target) }, { monitoring: true });
    },
    async openPermissionSettings(permission = 'accessibility') { return request('openPermissionSettings', {permission}, {timeoutMs: 120000}); },
    async requestPermission(permission) { return request('requestPermission', {permission}, {timeoutMs: 120000}); },
    async revealPermissionHelper() { return request('revealPermissionHelper'); },
    async preview(target) { return request('preview', {target: reference(target)}, {monitoring: true}); },
    async stopPreview(targetId) { return request('stopPreview', {targetId}, {monitoring: true}); },
    async presentationContrast(args) {
      if (process.platform !== 'darwin') return { available: false };
      return request('presentationContrast', args, { monitoring: true, timeoutMs: 2000 });
    },
    async observe(target, options = {}) {
      const value = await request('observe', {target: reference(target), options});
      if (value.screenshot && options.includeBase64) value.screenshot.base64 = (await readFile(value.screenshot.path)).toString('base64');
      return value;
    },
    async act(target, action = {}) {
      if (action.signal?.aborted) throw new NativeBackendError('CONTROL_STOPPED', 'Control has been stopped.');
      const normalized = normalizeAction(action);
      if (process.platform !== 'darwin' && normalized.type === 'press_key' && normalized.durationMs !== undefined) {
        throw new NativeBackendError('UNSUPPORTED_ACTION', 'Timed native pressKey currently requires macOS; no input was dispatched.',
          {platform:process.platform,action:normalized.type,inputDispatched:false,retryable:false});
      }
      if (process.platform !== 'darwin' && ['click','double_click','right_click'].includes(normalized.type) && (normalized.key !== undefined || normalized.durationMs !== undefined)) {
        throw new NativeBackendError('UNSUPPORTED_ACTION', 'Modified and timed native clicks currently require macOS; no input was dispatched.',
          {platform:process.platform,action:normalized.type,inputDispatched:false,retryable:false});
      }
      if (process.platform !== 'darwin' && MACOS_AX_EXTENSIONS.includes(normalized.type)) {
        throw new NativeBackendError('UNSUPPORTED_ACTION', 'Native selectText, paste and performSecondaryAction currently require macOS accessibility; this platform has no equivalent route.',
          {platform: process.platform, action: normalized.type, inputDispatched: false, retryable: false});
      }
      if (normalized.type === 'permissions' || normalized.type === 'getPermissions') return backend.permissions();
      if (normalized.type === 'openPermissionSettings') return backend.openPermissionSettings(normalized.permission ?? 'accessibility');
      delete normalized.signal;
      let interruptedRelease;
      const abort = () => { actionCursorTarget = undefined; hideCursor(); interruptedRelease = request('release').catch(error => ({released: false, error: nativeError(error, 'release').toJSON()})); };
      action.signal?.addEventListener('abort', abort, {once: true});
      try {
        if (action.signal?.aborted) { abort(); throw new NativeBackendError('CONTROL_STOPPED', 'Native action cancelled before dispatch.'); }
        actionCursorTarget = reference(target);
        actionCursorDispatch = AsyncLocalStorage.bind(value => onCursor?.(value));
        const result = await request('act', {target: actionCursorTarget, action: normalized});
        if (action.signal?.aborted) throw new NativeBackendError('CONTROL_STOPPED', 'Native action interrupted by stop.', {release: await interruptedRelease});
        return result;
      } catch (error) {
        if (interruptedRelease) {
          const release = await interruptedRelease;
          const failure = nativeError(error, 'act');
          throw new NativeBackendError(failure.code, failure.message, {...failure.details, release});
        }
        throw error;
      } finally { actionCursorTarget = undefined; action.signal?.removeEventListener('abort', abort); }
    },
    async release() {
      actionCursorTarget = undefined; hideCursor();
      try { return await request('release'); }
      finally { await cursorWork; }
    },
    async verify(target, options = {}) { return request('verify', {target: reference(target), options}, {monitoring: options.monitoring === true}); },
    async close() {
      if (closed) return;
      actionCursorTarget = undefined; hideCursor();
      if (!closing) closing = (async () => {
        try {
          await permissionProbe?.catch(() => {});
          await transport.close();
          await installationLease?.close(); closed = true;
        } finally { await cursorWork; }
      })().finally(() => { closing = undefined; });
      return closing;
    },
  };
  return backend;
}

export {NativeBackendError, normalizeAction, mapScreenshotPoint} from './protocol.mjs';
