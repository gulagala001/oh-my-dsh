import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareEnvironment } from './desktop-test-environment.mjs';
import { assertRunner, inside, pins, repoRoot, verifyPublishedPackage } from '../test/fixtures/desktop-rc1-slots/inputs.mjs';

// No feed retry, guessed URL, alternate domain, local rc2 build or adapter zip.
assertRunner();
const cache = await realpath(join(repoRoot, '.cache')), root = await realpath(process.env.OMD_RC1_ROOT);
assert.equal(cache, join(await realpath(repoRoot), '.cache'));
assert(inside(cache, root) && root !== cache);
const downloads = [];
async function download(input, filename, algorithm, expected) {
  const response = await fetch(input.url, { signal: AbortSignal.timeout(15 * 60_000) });
  assert(response.ok && response.body, `${input.url}: HTTP ${response.status}; stop without fallback`);
  const file = join(root, filename), part = file + '.part';
  // A fresh CI tree owns these paths. Never overwrite a previous preparation.
  const handle = await import('node:fs/promises').then(fs => fs.open(part, 'wx', 0o600));
  const hash = createHash(algorithm); let size = 0;
  try {
    for await (const chunk of response.body) { size += chunk.length; assert(size <= input.size, 'Download exceeds pinned size'); hash.update(chunk); await handle.writeFile(chunk); }
  } finally { await handle.close(); }
  const actual = hash.digest(algorithm === 'sha512' ? 'base64' : 'hex');
  assert.equal(size, input.size, 'Downloaded size mismatch'); assert.equal(actual, expected, 'Downloaded hash mismatch');
  await rename(part, file);
  downloads.push({ url: input.url, filename, size, algorithm, digest: actual, status: 'hash-verified' });
  // Persist the successful downloads before parsing, so a later format/mode
  // failure cannot erase or misclassify their independently verified identity.
  await writeFile(join(root, 'verified-downloads.json'), JSON.stringify({ schema: 1, downloads }, null, 2) + '\n');
  return file;
}
const archive = await download(pins.desktop, 'official-rc1-mac-x64.zip', 'sha512', pins.desktop.sha512);
const plugin = await download(pins.plugin, 'published-omd-rc1.tgz', 'sha256', pins.plugin.sha256);
try {
  const parsed = verifyPublishedPackage(await readFile(plugin));
  await writeFile(join(root, 'published-package-verification.json'), JSON.stringify({ status: 'parsed',
    sha256: pins.plugin.sha256, tar: parsed.tarSummary, helperModes: parsed.helperModes }, null, 2) + '\n');
} catch (error) {
  await writeFile(join(root, 'published-package-verification.json'), JSON.stringify({ status: 'failed',
    sha256: pins.plugin.sha256, error: error.message }, null, 2) + '\n');
  throw error;
}
const preparation = join(root, 'prepare-home'); await mkdir(preparation);
const env = await prepareEnvironment(preparation), app = join(root, 'mac-app'); await mkdir(app);
execFileSync('/usr/bin/ditto', ['-x', '-k', archive, app], { cwd: preparation, env, stdio: 'inherit' });
const contents = join(app, 'DeepSeek Harness.app', 'Contents');
const executable = await realpath(join(contents, 'MacOS', 'DeepSeek Harness'));
const appRoot = await realpath(join(contents, 'Resources', 'app.asar'));
assert(inside(root, executable) && inside(root, appRoot));
await writeFile(join(root, 'verified-inputs.json'), JSON.stringify(pins, null, 2) + '\n');
await appendFile(process.env.GITHUB_ENV, `OMD_RC1_EXECUTABLE=${executable}\nOMD_RC1_APP_ROOT=${appRoot}\nOMD_RC1_PLUGIN_ARCHIVE=${plugin}\n`);
