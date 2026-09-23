import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../vendor/dsh/', import.meta.url);
test('shipped DSH sources, browser package and patch match the pinned distribution manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../vendor/dsh.json', import.meta.url)));
  assert.equal(manifest.commit, 'c36a83ff6bb95e3f82cf79f9be7c724270a8aa61');
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
  const browser = await readFile(new URL('ui-conversation/lib/client.js', root), 'utf8');
  assert.match(browser.slice(0, 150), /id: "@deepseek-ai\/dsh-client-ui-conversation"/, 'the copied source artifact keeps its native module id; the embedded factory owns no loader entry');
  const parent = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(parent.dependencies['@oh-my-dsh/ui-conversation'], undefined, 'GitHub installs need no relative or exotic UI subdependency');
  const embedded = await readFile(new URL('../lib/host/ui-conversation.factory.mjs', import.meta.url), 'utf8');
  assert.match(embedded, /export function createConversation/);
  assert.ok(!embedded.includes('window.__ModuleLoader__.load('), 'the embedded factory belongs to the OMD client module');
});
