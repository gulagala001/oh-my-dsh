import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const hostVersion = '0.2.1-alpha.2';
export const workspaceRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
export const inside = (root, path) => path === root || path.startsWith(root + sep);
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const sdkNames = ['@deepseek-ai/dsh', '@deepseek-ai/dsh-app-boot', '@deepseek-ai/dsh-plugin-manager',
  '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session-persistence-jsonl'];
export const peerNames = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-settings', '@deepseek-ai/dsh-web',
  '@deepseek-ai/dsh-attachment', '@deepseek-ai/dsh-home-paths'];

// Inspect frozen bytes only. Neither npm pack nor an old/source fallback is an input.
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
      assert(!files.has(name), 'Duplicate archive member: ' + name);
      files.set(name, tar.subarray(start, start + size));
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  return files;
}

export async function desktopInputs() {
  const keys = ['OMD_DESKTOP_EXECUTABLE', 'OMD_DESKTOP_APP_ROOT', 'OMD_PLUGIN_ARCHIVE'];
  const missing = keys.filter(key => !process.env[key]);
  if (missing.length) return { skip: 'Non-CU Desktop not tested: explicit isolated inputs missing: ' + missing.join(', ') };
  try {
    const paths = {};
    const boundary = await realpath(workspaceRoot);
    for (const key of keys) {
      assert(isAbsolute(process.env[key]), key + ' requires an explicit absolute path');
      const candidate = resolve(process.env[key]);
      // APP_ROOT may be an asar file, but never the user's running /Applications app.
      const path = await realpath(candidate);
      assert(inside(boundary, path), key + ' must be a prepared copy in the new OMD workspace, never a live app/old source');
      paths[key] = path;
    }
    assert((await stat(paths.OMD_DESKTOP_EXECUTABLE)).isFile(), 'Desktop executable must be a regular file');
    const appStat = await stat(paths.OMD_DESKTOP_APP_ROOT);
    assert(appStat.isDirectory() || appStat.isFile() && paths.OMD_DESKTOP_APP_ROOT.endsWith('.asar'), 'APP_ROOT must be the real official Electron app directory or app.asar');
    assert((await stat(paths.OMD_PLUGIN_ARCHIVE)).isFile(), 'Final OMD archive must be a regular file');
    const bytes = await readFile(paths.OMD_PLUGIN_ARCHIVE), files = archiveFiles(bytes);
    const manifest = JSON.parse(files.get('package/package.json').toString('utf8'));
    const source = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
    assert.equal(manifest.name, 'trisoul_x'); assert.equal(manifest.version, source.version, 'Archive must be the final current candidate');
    assert.match(manifest.version, /^0\.2\.1-alpha\.2\.omd\.\d+\.\d+\.\d+$/);
    assert.equal(manifest.private, true); assert.equal(manifest.unpublished, true);
    assert(manifest.dsh?.bundle?.patch?.length, 'Final archive must declare its native bundle');
    assert.deepEqual(manifest.dsh.client.inject, source.dsh.client.inject, 'Exact final public component contract');
    for (const [name, version] of Object.entries(manifest.peerDependencies ?? {})) {
      if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(version, hostVersion, 'Final SDK peer: ' + name);
    }
    assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-tools'], hostVersion);
    assert.equal(manifest.peerDependencies['@deepseek-ai/cordis'], source.peerDependencies['@deepseek-ai/cordis']);
    assert(files.get('package/lib/client.js')?.length, 'Use the final built client, not an unbuilt source archive');
    const releases = JSON.parse(files.get('package/release-manifest.json').toString('utf8'));
    const currentRelease = releases.releases.find(row => row.version === manifest.version);
    assert.equal(currentRelease?.unpublished, true, 'Final installed release remains unpublished');
    const sha256 = digest(bytes);
    if (process.env.OMD_PLUGIN_ARCHIVE_SHA256) assert.equal(sha256, process.env.OMD_PLUGIN_ARCHIVE_SHA256);
    return { executablePath: paths.OMD_DESKTOP_EXECUTABLE, appRoot: paths.OMD_DESKTOP_APP_ROOT,
      archive: paths.OMD_PLUGIN_ARCHIVE, sha256, executableSha256: digest(await readFile(paths.OMD_DESKTOP_EXECUTABLE)),
      clientSha256: digest(files.get('package/lib/client.js')), manifest, currentRelease, boundary,
      publicComponents: manifest.dsh.client.inject, sdkNames, peerNames, hostVersion };
  } catch (error) {
    return { skip: 'Non-CU Desktop not tested: no valid matching isolated inputs: ' + error.message };
  }
}

// Runs in the real Electron main process; ASAR-aware fs/module resolution belongs
// to that process. Read the actual boot distribution, never this checkout's SDK.
export async function desktopIdentity({ app }, expected) {
  const fs = await import('node:fs/promises'), path = await import('node:path'), module = await import('node:module');
  const appRoot = app.getAppPath();
  if (path.resolve(appRoot) !== path.resolve(expected.appRoot)) throw Error('Electron booted an unexpected app root: ' + appRoot);
  let anchor;
  for (const file of [path.join(appRoot, 'dsh/package.json'), path.join(appRoot, 'package.json')]) {
    try { await fs.readFile(file); anchor = module.createRequire(file); break; }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
  }
  if (!anchor) throw Error('Official Desktop boot package is missing');
  const manifests = {};
  for (const name of [...new Set([...expected.sdkNames, ...expected.publicComponents, '@deepseek-ai/cordis'])]) {
    let file;
    try { file = anchor.resolve(name + '/package.json'); }
    catch {
      let directory = path.dirname(anchor.resolve(name));
      for (;;) {
        const candidate = path.join(directory, 'package.json');
        try { if (JSON.parse(await fs.readFile(candidate, 'utf8')).name === name) { file = candidate; break; } }
        catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
        const parent = path.dirname(directory); if (parent === directory) throw Error('Actual package identity not found: ' + name);
        directory = parent;
      }
    }
    const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
    if (manifest.name !== name) throw Error('Actual package name mismatch: ' + name);
    const version = name === '@deepseek-ai/cordis' ? expected.cordisVersion : expected.hostVersion;
    if (manifest.version !== version) throw Error(name + ': actual ' + manifest.version + ', expected ' + version);
    const actualFile = await fs.realpath(file);
    if (!actualFile.startsWith(appRoot + path.sep)) throw Error('Actual SDK escaped the prepared official app: ' + actualFile);
    manifests[name] = { name, version: manifest.version, file: actualFile };
  }
  if (!process.versions.electron) throw Error('Not a real Electron Desktop boot');
  return { appRoot, executable: process.execPath, appVersion: app.getVersion(), electron: process.versions.electron,
    userData: app.getPath('userData'), home: app.getPath('home'), manifests };
}
