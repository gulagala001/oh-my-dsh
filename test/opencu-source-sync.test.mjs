import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm, chmod, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const exec = promisify(execFile), hash = value => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const parent = new URL('../../.local/', import.meta.url); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(new URL('opencu-source-sync-', parent).pathname); t.after(() => rm(root, { recursive: true, force: true }));
  const host = join(root, 'omd'), source = join(root, 'opencu'), bundled = join(host, 'vendor/opencu');
  for (const path of [join(host, 'scripts'), join(source, 'src/dsh'), join(bundled, 'src/dsh'), join(bundled, 'lib')]) await mkdir(path, { recursive: true });
  await copyFile(new URL('../scripts/sync-opencu.mjs', import.meta.url), join(host, 'scripts/sync-opencu.mjs'));
  await writeFile(join(host, 'scripts/build-credits.mjs'), '');
  const pkg = { name: 'opencu', version: 'fixture', opencu: { host: 'fixture-host' } };
  await writeFile(join(source, 'package.json'), JSON.stringify(pkg));
  await writeFile(join(source, 'src/dsh/downloads.mjs'), 'export const current = true;\n');
  await writeFile(join(bundled, 'src/dsh/downloads.mjs'), 'export const previous = true;\n');
  await chmod(join(bundled, 'src/dsh/downloads.mjs'), 0o755);
  await writeFile(join(bundled, 'lib/client.js'), 'existing host-specific client\n');
  const manifest = { name: pkg.name, version: pkg.version, hostVersion: pkg.opencu.host, archiveSha256: 'previous-archive',
    files: { 'src/dsh/downloads.mjs': hash(await readFile(join(bundled, 'src/dsh/downloads.mjs'))), 'lib/client.js': hash(await readFile(join(bundled, 'lib/client.js'))) } };
  await writeFile(join(host, 'vendor/opencu.json'), JSON.stringify(manifest));
  await exec('git', ['init', '-q'], { cwd: source }); await exec('git', ['add', '.'], { cwd: source });
  await exec('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture'], { cwd: source });
  return { host, source, bundled, manifest, sync: names => exec(process.execPath, [join(host, 'scripts/sync-opencu.mjs'), source, '--files', ...names]) };
}

test('source sync changes committed files and digests while preserving generated output bytes', async t => {
  const f = await fixture(t); await f.sync(['src/dsh/downloads.mjs']);
  assert.equal(await readFile(join(f.bundled, 'src/dsh/downloads.mjs'), 'utf8'), 'export const current = true;\n');
  assert.equal((await stat(join(f.bundled, 'src/dsh/downloads.mjs'))).mode & 0o777, 0o755);
  assert.equal(await readFile(join(f.bundled, 'lib/client.js'), 'utf8'), 'existing host-specific client\n');
  const manifest = JSON.parse(await readFile(join(f.host, 'vendor/opencu.json'), 'utf8'));
  assert.equal(manifest.files['src/dsh/downloads.mjs'], hash(await readFile(join(f.source, 'src/dsh/downloads.mjs'))));
  assert.equal(manifest.files['lib/client.js'], f.manifest.files['lib/client.js']);
  assert.equal(manifest.archiveSha256, undefined);
  assert.equal(manifest.sourceCommit, (await exec('git', ['rev-parse', 'HEAD'], { cwd: f.source })).stdout.trim());
});

test('source sync refuses dirty source, changed baseline, generated files and new package membership before writes', async t => {
  const f = await fixture(t), original = await readFile(join(f.bundled, 'src/dsh/downloads.mjs'));
  for (const names of [[], ['lib/client.js'], ['src/dsh/downloads.mjs', 'src/new.mjs'], ['../private.md']]) await assert.rejects(f.sync(names));
  await writeFile(join(f.source, 'src/dsh/downloads.mjs'), 'uncommitted'); await assert.rejects(f.sync(['src/dsh/downloads.mjs']), /Commit the source/);
  await writeFile(join(f.source, 'src/dsh/downloads.mjs'), 'export const current = true;\n');
  assert((await readFile(join(f.bundled, 'src/dsh/downloads.mjs'))).equals(original));
  await writeFile(join(f.bundled, 'src/dsh/downloads.mjs'), 'existing local edit'); await assert.rejects(f.sync(['src/dsh/downloads.mjs']), /differs from its manifest/);
  assert.equal(await readFile(join(f.bundled, 'src/dsh/downloads.mjs'), 'utf8'), 'existing local edit');
});

test('client sync validates built chunks, replaces obsolete output and retains unrelated source', async t => {
  const f = await fixture(t), oldChunk = 'lib/rea-assets/opencu-chunk-AAAAAAAA.js', newChunk = 'lib/rea-assets/opencu-chunk-BBBBBBBB.js';
  const files = ['lib/client.js', 'lib/browser-surface.js', 'lib/presentation.js', 'lib/page-cursor.js',
    'lib/page-annotations.js', 'lib/extension.zip', 'lib/rea-assets/manifest.json', 'extension/page-cursor.js', 'src/extension/distribution.json'];
  for (const name of [...files, oldChunk, newChunk]) {
    await mkdir(join(f.source, name, '..'), { recursive: true });
    await mkdir(join(f.bundled, name, '..'), { recursive: true });
    if (name === newChunk) continue;
    await writeFile(join(f.bundled, name), `old ${name}`);
    f.manifest.files[name] = hash(`old ${name}`);
    if (name !== oldChunk) await writeFile(join(f.source, name), `new ${name}`);
  }
  const nextBytes = 'export const fresh = true;';
  await writeFile(join(f.source, newChunk), nextBytes);
  await writeFile(join(f.source, 'extension/page-cursor.js'), await readFile(join(f.source, 'lib/page-cursor.js')));
  await writeFile(join(f.source, 'lib/rea-assets/manifest.json'), JSON.stringify([
    { file: 'opencu-chunk-BBBBBBBB.js', sha256: hash(nextBytes), source: 'opencu-client-build' },
  ]));
  await writeFile(join(f.host, 'vendor/opencu.json'), JSON.stringify(f.manifest));
  await mkdir(join(f.source, 'scripts'));
  // The real extension-byte contract is covered by the distribution check;
  // this fixture isolates sync preflight and file replacement behavior.
  await writeFile(join(f.source, 'scripts/check-extension-distribution.mjs'), '');
  await writeFile(join(f.source, '.gitignore'), 'lib/\n');
  await exec('git', ['add', '.'], { cwd: f.source });
  await exec('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'client source'], { cwd: f.source });
  const sync = () => exec(process.execPath, [join(f.host, 'scripts/sync-opencu.mjs'), f.source, '--client']);
  await writeFile(join(f.source, newChunk), 'tampered output');
  await assert.rejects(sync(), /Invalid built client resource/);
  assert.equal(await readFile(join(f.bundled, 'lib/client.js'), 'utf8'), 'old lib/client.js');
  await writeFile(join(f.source, newChunk), nextBytes);
  await writeFile(join(f.bundled, newChunk), 'untracked local file');
  await assert.rejects(sync(), /untracked destination/);
  assert.equal(await readFile(join(f.bundled, newChunk), 'utf8'), 'untracked local file');
  await rm(join(f.bundled, newChunk));
  await sync();
  await assert.rejects(readFile(join(f.bundled, oldChunk)), { code: 'ENOENT' });
  const manifest = JSON.parse(await readFile(join(f.host, 'vendor/opencu.json')));
  for (const name of [...files, newChunk]) {
    const bytes = await readFile(join(f.bundled, name));
    assert(bytes.equals(await readFile(join(f.source, name))));
    assert.equal(manifest.files[name], hash(bytes));
  }
  assert.equal(manifest.files[oldChunk], undefined);
  assert.equal(manifest.archiveSha256, undefined);
  assert.equal(await readFile(join(f.bundled, 'src/dsh/downloads.mjs'), 'utf8'), 'export const previous = true;\n');
  await sync(); // Repeated synchronization keeps the same runtime bytes.
});
