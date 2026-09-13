import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
test('Oh My embeds an unmodified OpenCU release with every runtime dependency', async () => {
  const provenance = JSON.parse(await readFile(new URL('vendor/opencu.json', root)));
  const pkg = JSON.parse(await readFile(new URL('vendor/opencu/package.json', root)));
  const own = JSON.parse(await readFile(new URL('package.json', root)));
  assert.equal(pkg.name, 'opencu'); assert.equal(pkg.version, provenance.version);
  for (const [name, version] of Object.entries(pkg.dependencies)) assert.equal(own.dependencies[name], version, 'runtime dependency ' + name);
  const files = [];
  // These derived caches are excluded from both Git and the release package.
  const builds = new Set(['native/computer-use/windows/bin', 'native/computer-use/windows/obj', 'native/computer-use/windows/desktop/bin', 'native/computer-use/windows/desktop/obj']);
  const walk = async (directory, prefix = '') => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (builds.has(path)) continue;
      if (entry.isDirectory()) await walk(new URL(entry.name + '/', directory), path + '/');
      else { assert.ok(entry.isFile(), 'distribution contains no external symlink'); files.push(path); }
    }
  };
  const directory = new URL('vendor/opencu/', root); await walk(directory);
  assert.deepEqual(files.sort(), Object.keys(provenance.files).sort());
  for (const [path, expected] of Object.entries(provenance.files)) {
    assert.ok(!['AGENTS.md', 'COMPUTER_USE_HANDOFF.md', 'COMPUTER_USE_BASELINE.md', 'PROMPT_CHANGES.md', 'WINDOWS_HANDOFF.md'].includes(path.split('/').at(-1)));
    const actual = createHash('sha256').update(await readFile(new URL(path, directory))).digest('hex');
    assert.equal(actual, expected, path + ': update the upstream release instead of editing its distribution');
  }
});
