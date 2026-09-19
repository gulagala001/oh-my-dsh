import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../vendor/dsh/', import.meta.url);
test('shipped DSH sources, browser package and patch match the pinned distribution manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../vendor/dsh.json', import.meta.url)));
  assert.equal(manifest.commit, 'ddefc45fbc7f8e46dd73185e68295696d1297887');
  const files = {};
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await walk(new URL(entry.name + '/', directory), name + '/');
      else {
        assert.ok(entry.isFile(), 'no external source symlinks');
        assert.ok(!['AGENTS.md', 'PROMPT_CHANGES.md', '.env', '.credentials.yaml'].includes(entry.name));
        files[name] = createHash('sha256').update(await readFile(new URL(entry.name, directory))).digest('hex');
      }
    }
  }
  await walk(root); assert.deepEqual(files, manifest.files);
  const pkg = JSON.parse(await readFile(new URL('ui-conversation/package.json', root)));
  assert.equal(pkg.name, '@oh-my-dsh/ui-conversation');
  assert.match(await readFile(new URL('ui-conversation/lib/client.js', root), 'utf8'), /@oh-my-dsh\/ui-conversation/);
});
