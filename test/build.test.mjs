import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, symlinkSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('UI builds from a checkout whose path contains spaces', t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'trisoul x build-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'scripts'));
  for (const script of ['build.mjs', 'build-host.mjs', 'pack-skin.mjs']) cpSync(join(root, 'scripts', script), join(dir, 'scripts', script));
  cpSync(join(root, 'src'), join(dir, 'src'), { recursive: true });
  cpSync(join(root, 'package.json'), join(dir, 'package.json'));
  cpSync(join(root, 'presets'), join(dir, 'presets'), { recursive: true });
  cpSync(join(root, 'vendor'), join(dir, 'vendor'), { recursive: true });
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: dir, stdio: 'pipe' });
  assert.match(readFileSync(join(dir, 'lib', 'client.js'), 'utf8'), /window\.__ModuleLoader__\.load/);
  const first = readFileSync(join(dir, 'lib', 'client.js'), 'utf8');
  assert.match(first, /return module.exports;}}\);/);
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: dir, stdio: 'pipe' });
  assert.equal(readFileSync(join(dir, 'lib', 'client.js'), 'utf8'), first, 'repeated builds are byte-identical');
});
