import assert from 'node:assert/strict';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { clientComponents } from './client-identity.mjs';

// Deliberately narrower than the legacy non-CU fixture's parent-of-repo root.
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const hostVersion = '0.2.1-rc.2';
export const inside = (root, path) => path === root || path.startsWith(root + sep);
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const sdkNames = ['@deepseek-ai/dsh', '@deepseek-ai/dsh-desktop-host', '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/dsh-plugin-manager', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-tools'];

// Inspect frozen bytes without extracting or installing the archive locally.
export function archiveFiles(bytes) {
  const tar = gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 }), files = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const field = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
    const name = [field(345, 155), field(0, 100)].filter(Boolean).join('/').replace(/^\.\//, '');
    const sizeField = field(124, 12).trim(); assert.match(sizeField, /^[0-7]+$/, 'Malformed tar size');
    const size = Number.parseInt(sizeField, 8), start = offset + 512;
    assert(start + size <= tar.length, 'Truncated final archive');
    if (['\0', '0'].includes(String.fromCharCode(header[156]))) {
      assert(!files.has(name), 'Duplicate archive member: ' + name); files.set(name, tar.subarray(start, start + size));
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  return files;
}

export async function desktopInputs(env = process.env, platform = process.platform, arch = process.arch) {
  assert(platform === 'win32' && arch === 'x64' || platform === 'darwin' && arch === 'arm64',
    'Host boot requires the official Windows x64 or macOS arm64 runner; Linux UI launch is unsupported');
  assert(env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted',
    'Host boot is restricted to disposable GitHub-hosted CI runners');
  const keys = ['OMD_DESKTOP_TEST_ROOT', 'OMD_DESKTOP_EXECUTABLE', 'OMD_DESKTOP_APP_ROOT', 'OMD_PLUGIN_ARCHIVE', 'OMD_PLUGIN_ARCHIVE_SHA256'];
  for (const key of keys) assert(env[key], 'Missing required Desktop input: ' + key);
  assert(isAbsolute(env.OMD_DESKTOP_TEST_ROOT), 'Desktop root must be absolute');
  const cache = await realpath(join(repoRoot, '.cache'));
  assert.equal(cache, join(await realpath(repoRoot), '.cache'), 'Checkout cache cannot redirect outside the repository');
  const root = await realpath(env.OMD_DESKTOP_TEST_ROOT);
  assert(inside(cache, root) && root !== cache, 'Desktop root must be a fresh child of this checkout/.cache');
  const paths = {};
  for (const key of keys.slice(1, 4)) {
    assert(isAbsolute(env[key]), key + ' must be absolute');
    const path = await realpath(env[key]);
    assert(inside(root, path) && path !== root, key + ' must stay in the exclusive prepared tree');
    assert((await stat(path)).isFile(), key + ' must be a regular file');
    paths[key] = path;
  }
  const resources = platform === 'win32' ? join(root, 'windows-app', 'resources')
    : join(root, 'mac-app', 'DeepSeek Harness.app', 'Contents', 'Resources');
  const executable = platform === 'win32' ? join(root, 'windows-app', 'DeepSeek Harness.exe')
    : join(dirname(resources), 'MacOS', 'DeepSeek Harness');
  assert.equal(paths.OMD_DESKTOP_EXECUTABLE, await realpath(executable), 'Exact prepared official executable');
  assert.equal(paths.OMD_DESKTOP_APP_ROOT, await realpath(join(resources, 'app.asar')), 'Exact official app.asar');
  assert.match(env.OMD_PLUGIN_ARCHIVE_SHA256, /^[a-f0-9]{64}$/);
  const bytes = await readFile(paths.OMD_PLUGIN_ARCHIVE), sha256 = digest(bytes);
  assert.equal(sha256, env.OMD_PLUGIN_ARCHIVE_SHA256, 'Frozen tgz SHA-256');
  const files = archiveFiles(bytes);
  const manifest = JSON.parse(files.get('package/package.json'));
  const source = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url)));
  assert.equal(manifest.name, 'trisoul_x'); assert.equal(manifest.version, source.version);
  assert.match(manifest.version, /^0\.2\.1-rc\.2\.omd\.\d+\.\d+\.\d+$/);
  assert.equal(manifest.engines.dsh, hostVersion);
  assert.equal(manifest.devDependencies['@deepseek-ai/dsh'], hostVersion);
  assert.deepEqual(manifest.dsh.client.inject, source.dsh.client.inject);
  assert.deepEqual(manifest.dsh.bundle.patch, source.dsh.bundle.patch);
  for (const [name, version] of Object.entries(manifest.peerDependencies))
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(version, hostVersion, name);
  assert.equal(manifest.peerDependencies['@deepseek-ai/cordis'], source.peerDependencies['@deepseek-ai/cordis']);
  for (const file of ['lib/client.js', ...manifest.dsh.bundle.patch.map(path => path.replace(/^\.\//, ''))])
    assert(files.get('package/' + file)?.length, 'Missing frozen bundle member: ' + file);
  const releases = JSON.parse(files.get('package/release-manifest.json'));
  assert(releases.releases.some(row => row.version === manifest.version), 'Current rc.2 release identity');
  return { root, executablePath: paths.OMD_DESKTOP_EXECUTABLE, appRoot: paths.OMD_DESKTOP_APP_ROOT,
    archive: paths.OMD_PLUGIN_ARCHIVE, sha256, executableSha256: digest(await readFile(executable)), manifest,
    clientSha256: digest(files.get('package/lib/client.js')), sdkNames, hostVersion,
    clientComponents: clientComponents(manifest.dsh.client.inject) };
}

// Execute in Electron's ASAR-aware main process, never through checkout SDKs.
export async function desktopIdentity({ app }, expected) {
  // Playwright serializes this function into the main-process inspector realm,
  // which has no dynamic-import callback or lexical CommonJS require. Electron
  // patches the builtin fs object for ASAR at startup; read its promises face.
  if (typeof process.getBuiltinModule !== 'function') throw Error('Packaged Electron has no builtin module accessor');
  const fs = process.getBuiltinModule('fs').promises;
  const path = process.getBuiltinModule('path'), module = process.getBuiltinModule('module');
  const appRoot = app.getAppPath();
  if (!app.isPackaged || path.resolve(appRoot) !== path.resolve(expected.appRoot)) throw Error('Unexpected/unpackaged Electron app root');
  const anchor = module.createRequire(path.join(appRoot, 'dsh', 'package.json'));
  const manifests = {};
  for (const name of [...new Set([...expected.sdkNames, ...expected.clientComponents.dynamic, '@deepseek-ai/cordis'])]) {
    const file = anchor.resolve(name + '/package.json');
    const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
    const actual = await fs.realpath(file);
    if (![appRoot + path.sep, appRoot + '.unpacked' + path.sep].some(root => actual.startsWith(root))) throw Error('SDK outside official resources: ' + name);
    const version = name === '@deepseek-ai/cordis' ? expected.cordisVersion : expected.hostVersion;
    if (manifest.name !== name || manifest.version !== version) throw Error('Actual SDK identity mismatch: ' + name);
    manifests[name] = { version: manifest.version, file: actual };
  }
  return { executable: process.execPath, appRoot, appVersion: app.getVersion(), electron: process.versions.electron,
    home: app.getPath('home'), userData: app.getPath('userData'), manifests };
}
