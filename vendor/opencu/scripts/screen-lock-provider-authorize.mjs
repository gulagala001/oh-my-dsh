import { spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { homedir, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  prepareScreenUnlockProvider, screenUnlockProviderStatus, screenUnlockAssetSHA256,
  SCREEN_UNLOCK_INSTALLER_NAME, SCREEN_UNLOCK_INSTALLER_IDENTIFIER,
} from './screen-lock-provider-setup.mjs';

const operations = new Set(['install', 'uninstall', 'recover']);
function requireUserClick(userInitiated) {
  if (userInitiated !== true) throw Object.assign(new Error('Screen-unlock installation requires an explicit settings action.'), { code: 'SCREEN_UNLOCK_USER_ACTION_REQUIRED' });
  if (process.platform !== 'darwin' || !process.getuid?.()) throw Object.assign(new Error('Screen-unlock preparation must run as the native helper user on macOS.'), { code: 'SCREEN_UNLOCK_PLATFORM_UNAVAILABLE' });
}
function runInstaller(executable, operation) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, ['authorize', operation], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: homedir(), TMPDIR: tmpdir(), LANG: 'en_US.UTF-8' },
    });
    let stdout = '', stderr = '', exceeded = false;
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { if (stdout.length + chunk.length > 1024 * 1024) exceeded = true; else stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < 32768) stderr += chunk.slice(0, 32768 - stderr.length); });
    child.once('error', () => reject(Object.assign(new Error('The prepared authorization installer could not start.'), { code: 'SCREEN_UNLOCK_INSTALLER_LAUNCH_FAILED' })));
    child.once('close', (code, signal) => {
      if (exceeded || signal) { reject(Object.assign(new Error('The authorization installer did not return a complete operation result.'), { code: 'SCREEN_UNLOCK_INSTALLER_RESULT_UNKNOWN' })); return; }
      let response;
      try { response = JSON.parse(stdout); } catch { reject(Object.assign(new Error('The authorization installer did not confirm its result.'), { code: 'SCREEN_UNLOCK_INSTALLER_PROTOCOL_ERROR' })); return; }
      if (response?.operation !== operation || typeof response.ok !== 'boolean' || (response.ok && (code !== 0 || !response.result || typeof response.result.installed !== 'boolean'))) {
        reject(Object.assign(new Error('The authorization installer returned an inconsistent result.'), { code: 'SCREEN_UNLOCK_INSTALLER_PROTOCOL_ERROR' })); return;
      }
      if (!response.ok) {
        const error = Object.assign(new Error(typeof response.error === 'string' ? response.error : 'The authorized installation failed.'), {
          code: response.cancelled ? 'SCREEN_UNLOCK_AUTHORIZATION_CANCELLED' : 'SCREEN_UNLOCK_INSTALLER_FAILED',
          cancelled: response.cancelled === true, recoveryRequired: response.recoveryRequired === true,
          authorizationStatus: Number.isInteger(response.authorizationStatus) ? response.authorizationStatus : null,
        }); reject(error); return;
      }
      resolvePromise(response.result);
    });
  });
}

// Constructed by the backend with its actual native app and private data directory.
// Neither path nor the privileged program is accepted from a settings request.
export class ScreenUnlockProviderAuthorization {
  #helperApp;
  #directory;
  #prepared = null;
  #pending = null;
  #closed = false;
  #recoveryRequired = false;
  #lastError = null;
  constructor({ helperApp, directory }) {
    if (typeof helperApp !== 'string' || typeof directory !== 'string') throw new TypeError('The authorization adapter requires backend-owned helper and staging paths.');
    this.#helperApp = resolve(helperApp); this.#directory = resolve(directory);
  }
  async status() {
    const supported = process.platform === 'darwin' && Number(release().split('.')[0]) >= 23;
    let installation = { installed: false, available: false, reason: 'Screen-unlock authorization is a macOS 14+ capability.' }, error = null, helperPresent = false;
    if (supported) {
      try { installation = await screenUnlockProviderStatus(); } catch (failure) { error = { code: failure.code ?? 'SCREEN_UNLOCK_STATUS_UNAVAILABLE', message: failure.message }; installation = { installed: null, available: false, reason: error.message }; }
      try { const helper = await lstat(this.#helperApp); helperPresent = helper.isDirectory() && !helper.isSymbolicLink(); } catch (missing) { if (missing.code !== 'ENOENT') error ??= { code: missing.code, message: missing.message }; }
    }
    const prepared = this.#prepared?.signed === true, recoveryRequired = this.#recoveryRequired || Boolean(installation.transaction && installation.transaction !== 'installed');
    return { ...installation, supported, helperPresent, configured: installation.installed === true && installation.configuration?.userID === process.getuid?.(),
      prepared, installerReady: prepared, preparationRequired: !prepared, canInstall: supported && helperPresent && !this.#pending && !recoveryRequired,
      removable: installation.installed === true || Boolean(installation.transaction), authorizationRequired: true, requiresUserAction: true,
      installerIdentity: SCREEN_UNLOCK_INSTALLER_IDENTIFIER, busy: this.#pending !== null, recoveryRequired, recovery: recoveryRequired, lastError: this.#lastError, error };
  }
  async #prepare() {
    const helper = await realpath(this.#helperApp);
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const owner = await lstat(this.#directory);
    if (!owner.isDirectory() || owner.isSymbolicLink() || owner.uid !== process.getuid() || (owner.mode & 0o077) || await realpath(this.#directory) !== this.#directory) throw new Error('The installer staging directory must be canonical, private and owned by the helper user.');
    const stage = await mkdtemp(join(this.#directory, '.screen-unlock-'));
    const previous = this.#prepared;
    try { this.#prepared = Object.freeze(await prepareScreenUnlockProvider({ helperApp: helper, output: stage, userID: process.getuid(), sign: true })); }
    catch (error) { await rm(stage, { recursive: true, force: true }); throw error; }
    if (previous && !this.#recoveryRequired) await rm(previous.stage, { recursive: true, force: true });
    return { prepared: true, authorizationRequired: true, available: false };
  }
  prepareFromUserClick({ userInitiated = false } = {}) {
    requireUserClick(userInitiated);
    if (this.#closed) return Promise.reject(new Error('The screen-unlock authorization adapter is closed.'));
    if (this.#pending) return Promise.reject(Object.assign(new Error('A screen-unlock setup operation is already running.'), { code: 'SCREEN_UNLOCK_SETUP_BUSY' }));
    this.#lastError = null;
    this.#pending = this.#prepare().catch(error => { this.#lastError = { code: error.code ?? 'SCREEN_UNLOCK_PREPARATION_FAILED', message: error.message }; throw error; }).finally(() => { this.#pending = null; }); return this.#pending;
  }
  authorizeFromUserClick(operation, { userInitiated = false, beforeSystemChange, afterSystemChange } = {}) {
    requireUserClick(userInitiated);
    if (!operations.has(operation)) return Promise.reject(new Error('Only install, uninstall and recover are supported.'));
    if (typeof beforeSystemChange !== 'function' || typeof afterSystemChange !== 'function') return Promise.reject(new TypeError('System setup requires backend-owned native shutdown and restart hooks.'));
    if (this.#closed) return Promise.reject(new Error('The screen-unlock authorization adapter is closed.'));
    if (this.#pending) return Promise.reject(Object.assign(new Error('A screen-unlock setup operation is already running.'), { code: 'SCREEN_UNLOCK_SETUP_BUSY' }));
    this.#lastError = null;
    this.#pending = (async () => {
      if (!this.#prepared || await screenUnlockAssetSHA256(this.#helperApp) !== this.#prepared.helperSHA256) await this.#prepare();
      // The native executable verifies its own seal, actual helper and plugin hashes again.
      const executable = join(this.#prepared.installer, 'Contents', 'MacOS', SCREEN_UNLOCK_INSTALLER_NAME);
      let result = null, failure = null;
      await beforeSystemChange();
      try { result = await runInstaller(executable, operation); this.#recoveryRequired = false; return result; }
      catch (error) { failure = error; this.#recoveryRequired = error.recoveryRequired === true || ['SCREEN_UNLOCK_INSTALLER_RESULT_UNKNOWN', 'SCREEN_UNLOCK_INSTALLER_PROTOCOL_ERROR'].includes(error.code); throw error; }
      finally { await afterSystemChange({ operation, result, error: failure, restartRequired: true }); }
    })().catch(error => { this.#lastError = { code: error.code ?? 'SCREEN_UNLOCK_SETUP_FAILED', message: error.message, cancelled: error.cancelled === true }; throw error; }).finally(() => { this.#pending = null; }); return this.#pending;
  }
  async close() {
    this.#closed = true;
    try { await this.#pending; } catch { /* Retain failed setup artifacts when recovery is required. */ }
    if (this.#prepared && !this.#recoveryRequired) { await rm(this.#prepared.stage, { recursive: true, force: true }); this.#prepared = null; }
  }
}
