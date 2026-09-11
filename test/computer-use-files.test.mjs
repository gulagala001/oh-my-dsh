import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { registerComputerTools } from '../src/computer-use/tools.mjs';

test('export files stream into durable host attachments with reopenable metadata', async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-files-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'page.mhtml'), bytes = Buffer.from('MIME-Version: 1.0\r\n中文页面\0'); await writeFile(path, bytes);
  const tools = new Map(), saved = [];
  const attachments = {
    saveFileStream: async ({ data, name }) => {
      const chunks = []; for await (const chunk of data) chunks.push(chunk);
      saved.push(Buffer.concat(chunks)); return { attachmentId: 'stored-file', name, bytes: saved.at(-1).length };
    },
    fileHostPath: () => '/durable/attachments/page.mhtml',
  };
  const ctx = { tools: { register: tool => tools.set(tool.name, tool) }, get: () => attachments };
  registerComputerTools(ctx, { config: () => ({}), computerUse: { execute: async () => ({ blocks: [{ type: 'file', path }] }) } });
  const tool = tools.get('computer_use');
  const value = await tool.execute({ code: '' }, { agent: { session: { id: 'files' } } });
  assert.deepEqual(saved, [bytes]);
  assert.equal(JSON.parse(value).content[0].type, 'file');
  assert.equal(JSON.parse(value).error, null);
  assert.deepEqual(tool.output.presentationMeta({}, value).computerUseFiles, [{ name: 'page.mhtml', bytes: bytes.length, path: '/durable/attachments/page.mhtml' }]);
  attachments.saveFileStream = async () => { throw new Error('storage unavailable'); };
  const failed = JSON.parse(await tool.execute({ code: '' }, { agent: { session: { id: 'files' } } }));
  assert.match(failed.error, /attaching it failed: storage unavailable/);
  assert.deepEqual(failed.files, []);
  assert.ok(failed.content[0].text.includes(path), 'a failed attachment keeps the original completed export recoverable');
});
