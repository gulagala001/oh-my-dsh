import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('../scripts/prepare-desktop-test.mjs', import.meta.url));

test('future desktop versions require verified metadata before any download', () => {
  assert.throws(() => execFileSync(process.execPath, [script, 'mac-arm64', '--version', '99.0.0', '--verify-only', '--archive', '/missing'], { stdio: 'pipe' }), error => /No verified desktop release metadata/.test(error.stderr.toString()));
});

test('desktop archives are checked by size and SHA-512, including paths with spaces', async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd desktop release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = join(root, 'local archive.zip'), manifestFile = join(root, 'release.json');
  const bytes = Buffer.from('isolated desktop archive fixture');
  await writeFile(archive, bytes);
  const record = { platform: 'darwin', arch: 'arm64', extension: 'zip', size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') };
  const save = value => writeFile(manifestFile, JSON.stringify({ schema: 1, releases: { '0.2.0': { 'mac-arm64': value } } }));
  const run = () => execFileSync(process.execPath, [script, 'mac-arm64', '--version', '0.2.0', '--release-manifest', manifestFile, '--archive', archive, '--verify-only'], { encoding: 'utf8', stdio: 'pipe' });
  await save(record);
  assert.match(run(), /Verified desktop deepseek-harness-0\.2\.0-mac-arm64\.zip/);
  await writeFile(archive, Buffer.alloc(bytes.length));
  assert.throws(run, error => /SHA-512 mismatch/.test(error.stderr.toString()));
  await writeFile(archive, bytes.subarray(1));
  assert.throws(run, error => /expected .* bytes, got/.test(error.stderr.toString()));
  await save({ ...record, platform: 'win32' });
  assert.throws(run, error => /Invalid desktop release metadata/.test(error.stderr.toString()));
});
