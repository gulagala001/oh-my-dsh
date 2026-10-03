import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../vendor/dsh/', import.meta.url);
test('shipped DSH sources, browser package and patch match the pinned distribution manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../vendor/dsh.json', import.meta.url)));
  assert.equal(manifest.commit, '5badb15009ae1756c3afe0ae0cef1faafc290ccc');
  assert.equal(manifest.tag, 'dsh-v0.2.1-alpha.1', 'the snapshot uses the official release tag');
  assert.equal(manifest.version, '0.2.1-alpha.1');
  const chat = JSON.parse(await readFile(new URL('../vendor/opencu/vendor/dsh-chat.json', import.meta.url)));
  assert.equal(chat.commit, manifest.commit, 'conversation and shared Chat use one DSH source baseline');
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
  const computer = JSON.parse(await readFile(new URL('../vendor/opencu/package.json', import.meta.url)));
  assert.equal(pkg.peerDependencies['@deepseek-ai/cordis'], parent.peerDependencies['@deepseek-ai/cordis'], 'the browser factory and host use the same Cordis runtime');
  assert.equal(pkg.dependencies['@deepseek-ai/schemastery'], parent.peerDependencies['@deepseek-ai/schemastery']);
  for (const name of ['@deepseek-ai/cordis', '@deepseek-ai/schemastery']) {
    assert.equal(computer.peerDependencies[name], parent.peerDependencies[name], name + ': embedded Computer Use keeps the host SDK identity');
  }
  assert.equal(parent.dependencies['@oh-my-dsh/ui-conversation'], undefined, 'GitHub installs need no relative or exotic UI subdependency');
  const embedded = await readFile(new URL('../lib/host/ui-conversation.factory.mjs', import.meta.url), 'utf8');
  assert.match(embedded, /export function createConversation/);
  assert.ok(!embedded.includes('window.__ModuleLoader__.load('), 'the embedded factory belongs to the OMD client module');
});

test('published package excludes machine-local infill implementations, presets and generated bindings', async () => {
  const repository = new URL('../', import.meta.url);
  const [packed] = JSON.parse(execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: fileURLToPath(repository), encoding: 'utf8', shell: process.platform === 'win32',
    }));
  for (const { path } of packed.files) {
    assert.doesNotMatch(path, /(?:^|\/)(?:infill|data|work|\.context-upgrade|\.context-ui-upgrade)\//, path);
    assert.ok(!['AGENTS.md', 'COMPUTER_USE_HANDOFF.md', 'PROMPT_MAINTENANCE.md', 'PROMPT_CHANGES.md', 'WINDOWS_HANDOFF.md'].includes(path), path);
    if (/^(?:src|lib|scripts|presets)\//.test(path) && /\.(?:mjs|js|jsx|ts|json|yml)$/.test(path)) {
      assert.doesNotMatch(await readFile(new URL(path, repository), 'utf8'),
        /omd-infill|experimentalInfill|installInfillForHub/, path);
    }
  }
});
