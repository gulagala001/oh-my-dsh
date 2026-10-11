import { spawnSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { signNativeCode } from './computer-use-signing.mjs';

export const SCREEN_UNLOCK_PLUGIN_NAME = 'OhMyDSHScreenUnlock';
export const SCREEN_UNLOCK_PLUGIN_IDENTIFIER = 'ai.trisoul.computer-use.screen-unlock.authorization-plugin';
export const SCREEN_UNLOCK_INSTALLER_NAME = 'OhMyDSHScreenUnlockInstaller';
export const SCREEN_UNLOCK_INSTALLER_IDENTIFIER = 'ai.trisoul.computer-use.screen-unlock.installer';
export const SCREEN_UNLOCK_CONFIGURATION_DIRECTORY = '/Library/Application Support/Oh My DSH/ScreenUnlock';
export const SCREEN_UNLOCK_CONFIGURATION_PATH = join(SCREEN_UNLOCK_CONFIGURATION_DIRECTORY, 'provider.plist');
export const SCREEN_UNLOCK_PLUGIN_PATH = `/Library/Security/SecurityAgentPlugins/${SCREEN_UNLOCK_PLUGIN_NAME}.bundle`;
export const SCREEN_UNLOCK_MECHANISM = `${SCREEN_UNLOCK_PLUGIN_NAME}:screen-unlock,privileged`;
const root = fileURLToPath(new URL('../', import.meta.url));
const screensaverRight = 'system.login.screensaver';
const remoteRight = 'ai.trisoul.computer-use.screen-unlock.allow';
const manifestPath = join(SCREEN_UNLOCK_CONFIGURATION_DIRECTORY, 'installation.json');

function run(program, args, input) {
  const result = spawnSync(program, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.error) throw new Error(`${program} could not start: ${result.error.code ?? 'unknown'}`);
  if (result.status !== 0) { const failure = new Error(`${program} failed: ${String(result.stderr || 'no diagnostic').slice(-1600)}`); failure.stderr = result.stderr; throw failure; }
  return { stdout: result.stdout, stderr: result.stderr };
}
function xmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
export function plistXML(value) {
  const encode = entry => {
    if (typeof entry === 'boolean') return entry ? '<true/>' : '<false/>';
    if (typeof entry === 'number' && Number.isSafeInteger(entry)) return `<integer>${entry}</integer>`;
    if (typeof entry === 'number' && Number.isFinite(entry)) return `<real>${entry}</real>`;
    if (typeof entry === 'string') return `<string>${xmlEscape(entry)}</string>`;
    if (Array.isArray(entry)) return `<array>${entry.map(encode).join('')}</array>`;
    if (entry && typeof entry === 'object') return `<dict>${Object.entries(entry).map(([key, child]) => `<key>${xmlEscape(key)}</key>${encode(child)}`).join('')}</dict>`;
    throw new Error('Unsupported provider property-list value.');
  };
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0">${encode(value)}</plist>\n`;
}
function signingRequirement(identifier, certificateSHA1) {
  if (!/^[A-Za-z0-9.-]+$/.test(identifier) || identifier.startsWith('com.openai.') || !/^[a-f0-9]{40}$/i.test(certificateSHA1)) throw new Error('A separate certificate-backed signing identity is required.');
  return `identifier "${identifier}" and certificate leaf = H"${certificateSHA1.toLowerCase()}"`;
}
export async function screenUnlockAssetSHA256(path) {
  const hash = createHash('sha256'); let count = 0;
  const scan = async (entryPath, relative) => {
    const entry = await lstat(entryPath);
    if (++count > 4096 || entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error('The signed screen-unlock asset tree is unsupported.');
    hash.update(entry.isDirectory() ? 'D\0' : 'F\0').update(relative).update('\0');
    if (entry.isFile()) { if (entry.size > 64 * 1024 * 1024) throw new Error('A signed screen-unlock asset is too large.'); const content = await readFile(entryPath); if (content.length > 64 * 1024 * 1024) throw new Error('A signed screen-unlock asset is too large.'); hash.update(String(content.length)).update('\0').update(content); }
    else for (const child of (await readdir(entryPath)).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))) await scan(join(entryPath, child), relative ? `${relative}/${child}` : child);
  };
  await scan(path, ''); return hash.digest('hex');
}
async function protectedDirectory(path) {
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink() || entry.uid !== 0 || (entry.mode & 0o022) || await realpath(path) !== path) throw new Error(`Provider installation directory is not protected: ${path}`);
}
async function requireRootAndExplicitOptIn(options) {
  if (options.allowSystemInstall !== true) throw new Error('System changes require explicit allowSystemInstall opt-in.');
  if (process.getuid?.() !== 0) throw new Error('System installation requires an already-authorized root installer; this script does not request privileges.');
}
async function readRight(name, optional = false) {
  let stdout;
  try { ({ stdout } = run('/usr/bin/security', ['authorizationdb', 'read', name])); }
  catch (error) { if (optional && /\(-60005\)/.test(error.stderr ?? '')) return null; throw error; }
  const temporary = await mkdtemp(join(tmpdir(), 'omd-screen-unlock-right-'));
  try {
    const path = join(temporary, 'right.plist'); await writeFile(path, stdout, { mode: 0o600 });
    return JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path]).stdout);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
function writeRight(name, right) { run('/usr/bin/security', ['authorizationdb', 'write', name], plistXML(right)); }
function equivalent(left, right) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

// Preparation reads public certificates only; explicit signing uses the existing own signer.
export async function prepareScreenUnlockProvider({ helperApp, output, userID, sign = false } = {}) {
  if (process.platform !== 'darwin') throw new Error('The screen-unlock authorization plugin is a macOS target.');
  const helper = await realpath(resolve(helperApp ?? join(root, 'dist', 'Oh My DSH Computer Use.app')));
  const targetUID = userID ?? process.getuid?.();
  if (!Number.isSafeInteger(targetUID) || targetUID <= 0) throw new Error('The target helper user must be an explicit non-root UID.');
  run('/usr/bin/codesign', ['--verify', '--strict', helper]);
  const details = run('/usr/bin/codesign', ['-d', '--verbose=4', helper]).stderr;
  const identifier = /^Identifier=(.+)$/m.exec(details)?.[1];
  const team = /^TeamIdentifier=(.+)$/m.exec(details)?.[1];
  if (identifier !== 'ai.trisoul.computer-use' || team === '2DC432GLL2') throw new Error('The helper must use the existing own Computer Use signing identifier.');
  const stage = resolve(output ?? join(root, 'work', 'rea-backend', 'screen-lock', 'prepared-provider'));
  await mkdir(stage, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(join(stage, '.certificate-'));
  let certificateSHA1;
  try {
    run('/usr/bin/codesign', ['-d', '--extract-certificates', join(temporary, 'certificate'), helper]);
    const certificate = new X509Certificate(await readFile(join(temporary, 'certificate0')));
    certificateSHA1 = certificate.fingerprint.replaceAll(':', '').toLowerCase();
  } catch (error) { throw new Error(`A real certificate-backed helper signature is required: ${error.message}`); }
  finally { await rm(temporary, { recursive: true, force: true }); }
  const helperRequirement = signingRequirement(identifier, certificateSHA1);
  const plugin = join(stage, `${SCREEN_UNLOCK_PLUGIN_NAME}.bundle`);
  const executable = join(plugin, 'Contents', 'MacOS', SCREEN_UNLOCK_PLUGIN_NAME);
  await mkdir(dirname(executable), { recursive: true, mode: 0o700 });
  const socketDirectory = `/private/tmp/ai.trisoul.computer-use-screen-unlock-${targetUID}`;
  const socketPath = `${socketDirectory}/LoginAuthorization.sock`;
  const definitions = {
    CU_SCREEN_UNLOCK_SERVICE_IDENTIFIER: identifier,
    CU_SCREEN_UNLOCK_CERTIFICATE_SHA1: certificateSHA1,
    CU_SCREEN_UNLOCK_SOCKET_PATH: socketPath,
  };
  run('/usr/bin/clang', ['-fobjc-arc', '-bundle', '-O2', '-Wall', '-Wextra', '-Werror', '-mmacosx-version-min=14.0', '-framework', 'Foundation', '-framework', 'Security',
    ...Object.entries(definitions).map(([name, value]) => `-D${name}=${JSON.stringify(value)}`), `-DCU_SCREEN_UNLOCK_USER_ID=${targetUID}`,
    join(root, 'native/computer-use/ScreenLockIdentity.m'), join(root, 'native/screen-unlock-login-plugin/AuthorizationPlugin.m'), '-o', executable]);
  await writeFile(join(plugin, 'Contents', 'Info.plist'), plistXML({ CFBundleIdentifier: SCREEN_UNLOCK_PLUGIN_IDENTIFIER, CFBundleName: SCREEN_UNLOCK_PLUGIN_NAME, CFBundleExecutable: SCREEN_UNLOCK_PLUGIN_NAME, CFBundlePackageType: 'BNDL', CFBundleVersion: '1' }));
  const configuration = {
    format: 1, userID: targetUID, helperIdentifier: identifier, helperRequirement, certificateSHA1,
    pluginIdentifier: SCREEN_UNLOCK_PLUGIN_IDENTIFIER, installedPlugin: SCREEN_UNLOCK_PLUGIN_PATH, mechanism: SCREEN_UNLOCK_MECHANISM,
    socketDirectory, socketPath,
    OSAgentRequirement: 'anchor apple and (identifier "com.apple.authorizationhost" or identifier "com.apple.authorizationhosthelper.arm64" or identifier "com.apple.authorizationhosthelper.x86_64")',
  };
  await writeFile(join(stage, 'provider.plist'), plistXML(configuration), { mode: 0o600 });
  if (sign) {
    await signNativeCode(plugin, { lockHelper: join(helper, 'Contents', 'MacOS', 'trisoul-computer-use') });
    run('/usr/bin/codesign', ['--verify', '--strict', '-R', signingRequirement(SCREEN_UNLOCK_PLUGIN_IDENTIFIER, certificateSHA1), plugin]);
  }
  const pluginSHA256 = await screenUnlockAssetSHA256(plugin), helperSHA256 = await screenUnlockAssetSHA256(helper);
  const installer = join(stage, `${SCREEN_UNLOCK_INSTALLER_NAME}.app`), installerExecutable = join(installer, 'Contents', 'MacOS', SCREEN_UNLOCK_INSTALLER_NAME);
  try {
    const existing = await lstat(installer);
    if (!existing.isDirectory() || existing.isSymbolicLink() || await realpath(installer) !== installer) throw new Error('The installer staging path is occupied by an unknown object.');
    const info = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(installer, 'Contents', 'Info.plist')]).stdout);
    if (info.CFBundleIdentifier !== SCREEN_UNLOCK_INSTALLER_IDENTIFIER) throw new Error('The installer staging path does not belong to the own prepared installer.');
    await rm(installer, { recursive: true });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const resources = join(installer, 'Contents', 'Resources'); await mkdir(dirname(installerExecutable), { recursive: true, mode: 0o700 }); await mkdir(resources, { mode: 0o700 });
  await cp(plugin, join(resources, `${SCREEN_UNLOCK_PLUGIN_NAME}.bundle`), { recursive: true, errorOnExist: true, force: false });
  const configurationXML = plistXML(configuration); await writeFile(join(resources, 'provider.plist'), configurationXML, { mode: 0o600 });
  const installerDefinitions = {
    CU_INSTALLER_CERTIFICATE_SHA1: certificateSHA1, CU_INSTALLER_HELPER_APP: helper,
    CU_INSTALLER_HELPER_SHA256: helperSHA256, CU_INSTALLER_PLUGIN_SHA256: pluginSHA256,
    CU_INSTALLER_CONFIGURATION_SHA256: createHash('sha256').update(configurationXML).digest('hex'),
  };
  run('/usr/bin/clang', ['-fobjc-arc', '-O2', '-Wall', '-Wextra', '-Werror', '-mmacosx-version-min=14.0', '-framework', 'Foundation', '-framework', 'Security',
    ...Object.entries(installerDefinitions).map(([name, value]) => `-D${name}=${JSON.stringify(value)}`), `-DCU_INSTALLER_USER_ID=${targetUID}`,
    join(root, 'native/computer-use/ScreenLockIdentity.m'), join(root, 'native/screen-unlock-login-plugin/ProviderInstaller.m'), '-o', installerExecutable]);
  await writeFile(join(installer, 'Contents', 'Info.plist'), plistXML({ CFBundleIdentifier: SCREEN_UNLOCK_INSTALLER_IDENTIFIER, CFBundleName: SCREEN_UNLOCK_INSTALLER_NAME, CFBundleDisplayName: 'OpenCU Screen Unlock Installer', CFBundleExecutable: SCREEN_UNLOCK_INSTALLER_NAME, CFBundlePackageType: 'APPL', CFBundleVersion: '1', LSUIElement: true }));
  if (sign) { await signNativeCode(installer, { lockHelper: join(helper, 'Contents', 'MacOS', 'trisoul-computer-use') }); run('/usr/bin/codesign', ['--verify', '--strict', '-R', signingRequirement(SCREEN_UNLOCK_INSTALLER_IDENTIFIER, certificateSHA1), installer]); }
  await writeFile(join(stage, 'prepared.json'), `${JSON.stringify({ format: 1, plugin, installer, helperApp: helper, helperSHA256, pluginSHA256, configuration, signed: sign }, null, 2)}\n`, { mode: 0o600 });
  return { stage, plugin, installer, signed: sign, certificateSHA1, helperRequirement, helperSHA256, pluginSHA256, available: false, authorizationRequired: true, reason: 'Prepared artifacts require explicit user authorization, installation and runtime verification.' };
}

export async function screenUnlockProviderStatus() {
  let stat;
  try { stat = await lstat(SCREEN_UNLOCK_CONFIGURATION_PATH); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try { const transaction = await protectedJSON(manifestPath); validateInstallationBackup(transaction); return { installed: false, available: false, transaction: transaction.state, reason: 'Provider transaction requires explicit recovery.' }; }
    catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
    return { installed: false, available: false, reason: 'ownScreenUnlockProviderNotInstalled' };
  }
  await protectedDirectory(SCREEN_UNLOCK_CONFIGURATION_DIRECTORY);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) || stat.size > 65536) throw new Error('The provider configuration is not a protected root-owned file.');
  const configuration = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', SCREEN_UNLOCK_CONFIGURATION_PATH]).stdout);
  if (configuration.installedPlugin !== SCREEN_UNLOCK_PLUGIN_PATH || configuration.mechanism !== SCREEN_UNLOCK_MECHANISM) throw new Error('The installed provider configuration does not match the fixed own plugin.');
  const transaction = await protectedJSON(manifestPath); validateInstallationBackup(transaction);
  if (!equivalent(transaction.configuration, configuration)) throw new Error('The provider configuration differs from its recorded transaction.');
  if (transaction.state !== 'installed') return { installed: false, available: false, transaction: transaction.state, reason: 'Provider transaction requires explicit recovery.' };
  run('/usr/bin/codesign', ['--verify', '--strict', '-R', signingRequirement(SCREEN_UNLOCK_PLUGIN_IDENTIFIER, configuration.certificateSHA1), SCREEN_UNLOCK_PLUGIN_PATH]);
  const right = await readRight(screensaverRight);
  return { installed: true, available: false, configuration, registered: containsOwnRule(right), reason: 'Runtime helper, peer authorization, input permissions and guardian resources require verification.' };
}

function containsOwnRule(right) {
  return Array.isArray(right.rule) && right.rule.includes(remoteRight);
}

function comparableRight(right) {
  if (!right) return right;
  const { created, modified, ...policy } = right;
  return policy;
}
function samePolicy(left, right) { return equivalent(comparableRight(left), comparableRight(right)); }
export function buildScreenUnlockRights(current) {
  if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('The current screensaver right must be a complete dictionary.');
  const remote = { class: 'evaluate-mechanisms', mechanisms: [SCREEN_UNLOCK_MECHANISM], tries: 1, version: 1, comment: 'Own screen-unlock branch consumes one authorized Computer Use login attempt.' };
  const top = { ...current, class: 'rule', 'k-of-n': 1, rule: [remoteRight, 'use-login-window-ui'], tries: 1 };
  delete top.mechanisms;
  return { remote, top };
}
async function rejectSymlinks(path) {
  const entry = await lstat(path); if (entry.isSymbolicLink()) throw new Error('The staged authorization plugin cannot contain symbolic links.');
  if (entry.isDirectory()) for (const child of await readdir(path)) await rejectSymlinks(join(path, child));
}
async function protectedJSON(path) {
  const entry = await lstat(path);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.uid !== 0 || (entry.mode & 0o022) || entry.size > 1048576) throw new Error('The installation manifest is not a protected root-owned regular file.');
  return JSON.parse(await readFile(path, 'utf8'));
}
async function atomicRootFile(path, contents, mode = 0o600) {
  const temporary = await mkdtemp(join(dirname(path), '.screen-unlock-write-'));
  try { const file = join(temporary, 'file'); await writeFile(file, contents, { mode }); await rename(file, path); }
  finally { await rm(temporary, { recursive: true, force: true }); }
}
async function createProtectedDirectories() {
  await protectedDirectory('/Library'); await protectedDirectory('/Library/Application Support');
  for (const path of ['/Library/Application Support/Oh My DSH', SCREEN_UNLOCK_CONFIGURATION_DIRECTORY, '/Library/Security', '/Library/Security/SecurityAgentPlugins']) {
    try { await mkdir(path, { mode: 0o755 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await protectedDirectory(path);
  }
}

function validateInstallationBackup(manifest) {
  const configuration = manifest?.configuration;
  if (manifest?.format !== 1 || !['installed', 'installing', 'rollback-required', 'uninstalling'].includes(manifest.state) || !manifest.beforeTop || configuration?.installedPlugin !== SCREEN_UNLOCK_PLUGIN_PATH || configuration.pluginIdentifier !== SCREEN_UNLOCK_PLUGIN_IDENTIFIER || configuration.mechanism !== SCREEN_UNLOCK_MECHANISM || configuration.helperIdentifier !== 'ai.trisoul.computer-use' || manifest.beforeRemote !== null) throw new Error('A complete own installation transaction and original policy backup are required for recovery.');
  signingRequirement(SCREEN_UNLOCK_PLUGIN_IDENTIFIER, configuration.certificateSHA1);
  const intended = buildScreenUnlockRights(manifest.beforeTop);
  if (!samePolicy(manifest.installedTop, intended.top) || !samePolicy(manifest.installedRemote, intended.remote)) throw new Error('The recorded installed policy does not match the own transaction.');
}
async function knownConfigurationPresent(configuration) {
  let entry;
  try { entry = await lstat(SCREEN_UNLOCK_CONFIGURATION_PATH); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (!entry.isFile() || entry.isSymbolicLink() || entry.uid !== 0 || (entry.mode & 0o022) || entry.size > 65536) throw new Error('Recovery refused to remove an unknown provider configuration object.');
  const current = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', SCREEN_UNLOCK_CONFIGURATION_PATH]).stdout);
  if (!equivalent(current, configuration)) throw new Error('The provider configuration changed; recovery refused to delete it.');
  return true;
}
async function bundleRemovalInventory() {
  const entries = [];
  const scan = async (path, relative) => {
    const stat = await lstat(path);
    if (entries.length >= 512 || relative.length > 1024 || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) || !Number.isSafeInteger(stat.ino) || (!stat.isDirectory() && !stat.isFile())) throw new Error('The bundle removal inventory contains an unsupported or insecure object.');
    const record = { path: relative, device: stat.dev, inode: stat.ino, mode: stat.mode, uid: stat.uid, kind: stat.isDirectory() ? 'directory' : 'file' };
    if (stat.isFile()) {
      if (stat.size > 16 * 1024 * 1024 || stat.nlink !== 1) throw new Error('The bundle removal inventory contains an unexpected file.');
      record.sha256 = createHash('sha256').update(await readFile(path)).digest('hex');
    }
    entries.push(record);
    if (stat.isDirectory()) for (const child of (await readdir(path)).sort()) await scan(join(path, child), relative ? `${relative}/${child}` : child);
  };
  await scan(SCREEN_UNLOCK_PLUGIN_PATH, '');
  return entries;
}
async function knownBundlePresent(configuration, recovery, installedSHA256) {
  try { await lstat(SCREEN_UNLOCK_PLUGIN_PATH); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  await protectedDirectory(SCREEN_UNLOCK_PLUGIN_PATH); await rejectSymlinks(SCREEN_UNLOCK_PLUGIN_PATH);
  if (recovery?.completed?.bundleRemovalStarted) {
    const recorded = recovery.bundleRemovalInventory;
    if (!Array.isArray(recorded) || !recorded.length || recorded[0].path !== '' || recorded[0].kind !== 'directory') throw new Error('A complete bundle removal identity is required to resume partial deletion.');
    const expected = new Map(recorded.map(entry => [entry.path, entry]));
    for (const remaining of await bundleRemovalInventory()) if (!equivalent(remaining, expected.get(remaining.path))) throw new Error('The partially removed bundle contains an unknown or changed object; recovery refused to delete it.');
    return true;
  }
  run('/usr/bin/codesign', ['--verify', '--strict', '-R', signingRequirement(SCREEN_UNLOCK_PLUGIN_IDENTIFIER, configuration.certificateSHA1), SCREEN_UNLOCK_PLUGIN_PATH]);
  if (installedSHA256 && await screenUnlockAssetSHA256(SCREEN_UNLOCK_PLUGIN_PATH) !== installedSHA256) throw new Error('The installed plugin changed outside its recorded transaction.');
  return true;
}
async function restoreRecordedInstallation(manifest, mode) {
  validateInstallationBackup(manifest);
  const { configuration, beforeTop, beforeRemote, installedTop, installedRemote } = manifest;
  let top = await readRight(screensaverRight), remote = await readRight(remoteRight, true);
  if ((!samePolicy(top, beforeTop) && !samePolicy(top, installedTop)) || (!samePolicy(remote, beforeRemote) && !samePolicy(remote, installedRemote))) throw new Error('An authorization policy is outside the recorded before/installed states; recovery refused to overwrite a third-party change.');
  await knownConfigurationPresent(configuration); await knownBundlePresent(configuration, manifest.recovery, manifest.installedPluginSHA256);
  manifest.state = mode === 'uninstall' ? 'uninstalling' : 'rollback-required';
  manifest.recovery = { mode, completed: { ...manifest.recovery?.completed }, ...(manifest.recovery?.bundleRemovalInventory ? { bundleRemovalInventory: manifest.recovery.bundleRemovalInventory } : {}) };
  const checkpoint = async step => { if (step) manifest.recovery.completed[step] = true; await atomicRootFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 0o644); };
  await checkpoint();
  top = await readRight(screensaverRight);
  if (samePolicy(top, installedTop)) writeRight(screensaverRight, beforeTop);
  else if (!samePolicy(top, beforeTop)) throw new Error('The screensaver policy changed during recovery.');
  if (!samePolicy(await readRight(screensaverRight), beforeTop)) throw new Error('The OS did not restore the complete original screensaver policy.');
  await checkpoint('topRestored');
  if (await knownConfigurationPresent(configuration)) await rm(SCREEN_UNLOCK_CONFIGURATION_PATH);
  await checkpoint('configurationRemoved');
  remote = await readRight(remoteRight, true);
  if (samePolicy(remote, installedRemote)) {
    if (beforeRemote) writeRight(remoteRight, beforeRemote); else run('/usr/bin/security', ['authorizationdb', 'remove', remoteRight]);
  } else if (!samePolicy(remote, beforeRemote)) throw new Error('The remote policy changed during recovery.');
  if (!samePolicy(await readRight(remoteRight, true), beforeRemote)) throw new Error('The OS did not restore the recorded remote policy state.');
  await checkpoint('remoteRestored');
  if (await knownBundlePresent(configuration, manifest.recovery, manifest.installedPluginSHA256)) {
    if (!manifest.recovery.completed.bundleRemovalStarted) {
      manifest.recovery.bundleRemovalInventory = await bundleRemovalInventory();
      await checkpoint('bundleRemovalStarted');
    }
    await rm(SCREEN_UNLOCK_PLUGIN_PATH, { recursive: true });
  }
  await checkpoint('bundleRemoved');
  if (!samePolicy(await readRight(screensaverRight), beforeTop) || !samePolicy(await readRight(remoteRight, true), beforeRemote)) throw new Error('An authorization policy changed before recovery completed; the backup is retained.');
  await rm(manifestPath);
  return { installed: false, available: false, originalPolicyRestored: true, recovered: mode === 'rollback' };
}

export async function installScreenUnlockProvider({ stage, allowSystemInstall = false } = {}) {
  await requireRootAndExplicitOptIn({ allowSystemInstall });
  const source = await realpath(resolve(stage ?? join(root, 'work/rea-backend/screen-lock/prepared-provider')));
  const prepared = JSON.parse(await readFile(join(source, 'prepared.json'), 'utf8'));
  const configuration = prepared.configuration;
  const plugin = join(source, `${SCREEN_UNLOCK_PLUGIN_NAME}.bundle`);
  if (!prepared.signed || prepared.plugin !== plugin || configuration?.format !== 1 || configuration.installedPlugin !== SCREEN_UNLOCK_PLUGIN_PATH || configuration.mechanism !== SCREEN_UNLOCK_MECHANISM || configuration.pluginIdentifier !== SCREEN_UNLOCK_PLUGIN_IDENTIFIER) throw new Error('The staged own plugin and setup configuration are invalid or unsigned.');
  const expectedSocketDirectory = `/private/tmp/ai.trisoul.computer-use-screen-unlock-${configuration.userID}`;
  if (!Number.isSafeInteger(configuration.userID) || configuration.userID <= 0 || configuration.helperIdentifier !== 'ai.trisoul.computer-use' || configuration.socketDirectory !== expectedSocketDirectory || configuration.socketPath !== `${expectedSocketDirectory}/LoginAuthorization.sock` || configuration.helperRequirement !== signingRequirement(configuration.helperIdentifier, configuration.certificateSHA1)) throw new Error('The staged own helper identity or fixed socket configuration is invalid.');
  await rejectSymlinks(plugin);
  const pluginRequirement = signingRequirement(SCREEN_UNLOCK_PLUGIN_IDENTIFIER, configuration.certificateSHA1);
  run('/usr/bin/codesign', ['--verify', '--strict', '-R', pluginRequirement, plugin]);
  await createProtectedDirectories();
  let existingManifest;
  try { existingManifest = await protectedJSON(manifestPath); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existingManifest) {
    if (existingManifest.format !== 1 || existingManifest.state !== 'installed') throw new Error('A previous provider transaction is incomplete; resolve or recover its saved policy before installing again.');
    const current = await readRight(screensaverRight), remote = await readRight(remoteRight, true);
    if (!samePolicy(current, existingManifest.installedTop) || !samePolicy(remote, existingManifest.installedRemote) || !equivalent(existingManifest.configuration, configuration)) throw new Error('Existing provider policy differs from this installation. Preserve it and explicitly uninstall or resolve the change first.');
    if (existingManifest.installedPluginSHA256 !== await screenUnlockAssetSHA256(plugin)) throw new Error('The prepared plugin differs from the existing installation; explicitly uninstall it before installing the new payload.');
    run('/usr/bin/codesign', ['--verify', '--strict', '-R', pluginRequirement, SCREEN_UNLOCK_PLUGIN_PATH]);
    if (await screenUnlockAssetSHA256(SCREEN_UNLOCK_PLUGIN_PATH) !== existingManifest.installedPluginSHA256) throw new Error('The installed plugin changed outside its recorded transaction.');
    return { installed: true, unchanged: true, available: false, runtimeVerified: false };
  }
  try { await lstat(SCREEN_UNLOCK_PLUGIN_PATH); throw new Error('The fixed plugin destination is occupied without an own installation manifest.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await lstat(SCREEN_UNLOCK_CONFIGURATION_PATH); throw new Error('The fixed provider configuration is occupied without an own installation manifest.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const beforeTop = await readRight(screensaverRight), beforeRemote = await readRight(remoteRight, true);
  if (beforeRemote) throw new Error('The own remote right already exists without its installation manifest.');
  const policy = buildScreenUnlockRights(beforeTop);
  const manifest = { format: 1, state: 'installing', configuration, beforeTop, beforeRemote, installedTop: policy.top, installedRemote: policy.remote, installedPluginSHA256: await screenUnlockAssetSHA256(plugin) };
  await atomicRootFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 0o644);
  try {
    const temporary = await mkdtemp(join(dirname(SCREEN_UNLOCK_PLUGIN_PATH), '.screen-unlock-install-'));
    try {
      const copy = join(temporary, `${SCREEN_UNLOCK_PLUGIN_NAME}.bundle`); await cp(plugin, copy, { recursive: true, errorOnExist: true, force: false });
      await rejectSymlinks(copy);
      run('/usr/sbin/chown', ['-R', 'root:wheel', copy]); run('/bin/chmod', ['-R', 'u+rwX,go+rX,go-w', copy]);
      run('/usr/bin/codesign', ['--verify', '--strict', '-R', pluginRequirement, copy]); await rename(copy, SCREEN_UNLOCK_PLUGIN_PATH);
    } finally { await rm(temporary, { recursive: true, force: true }); }
    if (!samePolicy(await readRight(screensaverRight), beforeTop)) throw new Error('The screensaver policy changed during staging.');
    writeRight(remoteRight, policy.remote); writeRight(screensaverRight, policy.top);
    if (!samePolicy(await readRight(screensaverRight), policy.top) || !samePolicy(await readRight(remoteRight), policy.remote)) throw new Error('The OS did not retain the intended own authorization policy.');
    await atomicRootFile(SCREEN_UNLOCK_CONFIGURATION_PATH, plistXML(configuration), 0o644);
    manifest.state = 'installed'; await atomicRootFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 0o644);
    return { installed: true, available: false, runtimeVerified: false, manualFallback: 'use-login-window-ui' };
  } catch (failure) {
    try {
      manifest.state = 'rollback-required'; await atomicRootFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 0o644);
      await restoreRecordedInstallation(manifest, 'rollback');
    } catch (cleanup) { throw new AggregateError([failure, cleanup], 'Provider installation failed; the recorded transaction is retained for explicit recover or uninstall.'); }
    throw failure;
  }
}

export async function uninstallScreenUnlockProvider({ allowSystemInstall = false } = {}) {
  await requireRootAndExplicitOptIn({ allowSystemInstall }); await protectedDirectory(SCREEN_UNLOCK_CONFIGURATION_DIRECTORY);
  const manifest = await protectedJSON(manifestPath);
  return restoreRecordedInstallation(manifest, 'uninstall');
}
export async function recoverScreenUnlockProvider({ allowSystemInstall = false } = {}) {
  await requireRootAndExplicitOptIn({ allowSystemInstall }); await protectedDirectory(SCREEN_UNLOCK_CONFIGURATION_DIRECTORY);
  return restoreRecordedInstallation(await protectedJSON(manifestPath), 'rollback');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command = 'status', ...args] = process.argv.slice(2); const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--allow-system-install') options.allowSystemInstall = true;
    else if (flag === '--sign') options.sign = true;
    else if (['--helper-app', '--output', '--user-id', '--stage'].includes(flag)) {
      const value = args[++index]; if (!value) throw new Error(`${flag} requires a value.`);
      options[{ '--helper-app': 'helperApp', '--output': 'output', '--user-id': 'userID', '--stage': 'stage' }[flag]] = flag === '--user-id' ? Number(value) : value;
    } else throw new Error(`Unknown setup argument: ${flag}`);
  }
  const actions = { status: screenUnlockProviderStatus, prepare: prepareScreenUnlockProvider, install: installScreenUnlockProvider, uninstall: uninstallScreenUnlockProvider, recover: recoverScreenUnlockProvider };
  if (!actions[command]) throw new Error(`Unknown screen-unlock setup command: ${command}`);
  process.stdout.write(`${JSON.stringify(await actions[command](options), null, 2)}\n`);
}
