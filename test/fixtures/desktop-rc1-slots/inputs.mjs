import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { digest, inside, desktopIdentity, assertDesktopPaths } from '../desktop-host-boot/inputs.mjs';
import { clientComponents } from '../desktop-host-boot/client-identity.mjs';

export { digest, inside, desktopIdentity, assertDesktopPaths };
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const pins = JSON.parse(await readFile(new URL('../../../scripts/desktop-rc1-slot-inputs.json', import.meta.url)));
export const sdkNames = ['@deepseek-ai/dsh', '@deepseek-ai/dsh-desktop-host', '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/dsh-plugin-manager', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-tools'];

export function assertRunner(env = process.env, platform = process.platform, arch = process.arch) {
  assert(platform === 'darwin' && arch === 'x64', 'rc1 slots require the official macOS x64 runner; no Linux GUI or Windows fallback');
  assert(env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted', 'Disposable GitHub-hosted CI only');
}

export function verifyPublishedPackage(bytes, expected = pins.plugin) {
  assert.equal(bytes.length, expected.size, 'Published OMD size mismatch');
  assert.equal(digest(bytes), expected.sha256, 'Published OMD SHA-256 mismatch');
  const tar = gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 }), files = new Map(), helperModes = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512); if (header.every(byte => byte === 0)) break;
    const field = (start, length) => header.subarray(start, start + length).toString().replace(/\0.*$/s, '');
    const name = [field(345, 155), field(0, 100)].filter(Boolean).join('/');
    const numeric = field(124, 12).trim(); assert.match(numeric, /^[0-7]+$/);
    const size = Number.parseInt(numeric, 8), start = offset + 512;
    assert(Number.isSafeInteger(size) && start + size <= tar.length, 'Truncated published archive');
    assert(name.startsWith('package/') && !name.includes('\\') && !name.split('/').includes('..'), 'Invalid published member');
    assert([0, 48].includes(header[156]), 'Published members must be regular files');
    assert(!files.has(name), 'Duplicate published member'); files.set(name, tar.subarray(start, start + size));
    if (/^package\/vendor\/opencu\/native\/bin\/darwin-(?:x64|arm64)\/OpenCU Helper\.app\/Contents\/MacOS\/opencu-native$/.test(name)) {
      const mode = Number.parseInt(field(100, 8).trim(), 8);
      assert.equal(mode, 0o755, `Published helper mode ${mode.toString(8).padStart(4, '0')} is not 0755; do not rewrite the verified release: ${name}`);
      helperModes.push({ file: name, mode: '0755' });
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  assert(helperModes.length > 0, 'Published macOS helper mode evidence missing');
  const manifest = JSON.parse(files.get('package/package.json'));
  assert.equal(manifest.name, pins.plugin.name); assert.equal(manifest.version, pins.plugin.version, 'Exact released rc1 OMD version');
  assert.equal(manifest.engines.dsh, pins.desktop.version, 'Published package/host pairing');
  assert.equal(manifest.devDependencies['@deepseek-ai/dsh'], pins.desktop.version, 'Published SDK pairing');
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies'])
    for (const [name, version] of Object.entries(manifest[section] ?? {}))
      if (/^@deepseek-ai\/dsh(?:-|$)/.test(name)) assert.equal(version, pins.desktop.version, 'Published SDK: ' + name);
  assert.equal(manifest.peerDependencies['@deepseek-ai/cordis'], '4.0.5');
  const source = JSON.parse(files.get('package/vendor/dsh.json'));
  assert.equal(source.commit, pins.desktop.sourceCommit, 'Official rc1 source pin');
  assert.equal(source.version, pins.desktop.version);
  for (const file of ['lib/client.js', ...manifest.dsh.bundle.patch.map(path => path.replace(/^\.\//, ''))])
    assert(files.get('package/' + file)?.length, 'Missing released bundle member: ' + file);
  return { manifest, helperModes, clientSha256: digest(files.get('package/lib/client.js')) };
}

export async function rc1Inputs(env = process.env, platform = process.platform, arch = process.arch) {
  assertRunner(env, platform, arch);
  for (const key of ['OMD_RC1_ROOT', 'OMD_RC1_EXECUTABLE', 'OMD_RC1_APP_ROOT', 'OMD_RC1_PLUGIN_ARCHIVE'])
    assert(env[key] && isAbsolute(env[key]), 'Missing absolute rc1 input: ' + key);
  const cache = await realpath(join(repoRoot, '.cache'));
  assert.equal(cache, join(await realpath(repoRoot), '.cache'), 'Checkout cache cannot redirect');
  const root = await realpath(env.OMD_RC1_ROOT);
  assert(inside(cache, root) && root !== cache, 'Exclusive checkout/.cache child required');
  const resources = join(root, 'mac-app', 'DeepSeek Harness.app', 'Contents', 'Resources');
  const expected = { OMD_RC1_EXECUTABLE: join(resources, '..', 'MacOS', 'DeepSeek Harness'),
    OMD_RC1_APP_ROOT: join(resources, 'app.asar'), OMD_RC1_PLUGIN_ARCHIVE: join(root, 'published-omd-rc1.tgz') };
  const paths = {};
  for (const [key, file] of Object.entries(expected)) {
    paths[key] = await realpath(env[key]);
    assert.equal(paths[key], await realpath(file), 'Exact prepared rc1 path: ' + key);
    assert(inside(root, paths[key]) && (await stat(paths[key])).isFile(), 'Owned regular input: ' + key);
  }
  // Recheck the downloaded zip, not just an author-written preparation receipt.
  const zip = await readFile(join(root, 'official-rc1-mac-x64.zip'));
  assert.equal(zip.length, pins.desktop.size, 'Official zip size');
  assert.equal(createHash('sha512').update(zip).digest('base64'), pins.desktop.sha512, 'Official zip SHA-512');
  const published = verifyPublishedPackage(await readFile(paths.OMD_RC1_PLUGIN_ARCHIVE));
  return { root, executablePath: paths.OMD_RC1_EXECUTABLE, appRoot: paths.OMD_RC1_APP_ROOT,
    archive: paths.OMD_RC1_PLUGIN_ARCHIVE, sha256: pins.plugin.sha256, ...published,
    executableSha256: digest(await readFile(paths.OMD_RC1_EXECUTABLE)), sdkNames, hostVersion: pins.desktop.version,
    clientComponents: clientComponents(published.manifest.dsh.client.inject) };
}
