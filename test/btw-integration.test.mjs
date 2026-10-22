import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime, LlmAdapter, createUserMessage, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import * as btw from '../vendor/btw/src/index.mjs';

test('bundled BTW serves a detached side reply with the parent prefix and no agent-loop request', async t => {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  await ctx.plugin(LlmRuntime);
  const prefix = Object.freeze([createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Main task' }] })]);
  let route, requests = 0, mainLoopCalls = 0;
  class Adapter extends LlmAdapter {
    async *stream(options) {
      requests++;
      assert.equal(options.sessionId, 'parent');
      assert.deepEqual(options.messages.slice(0, prefix.length), prefix);
      yield { type: 'text-delta', text: 'Side answer' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['fixture'], new Adapter());
  ctx.on('llm/stream', (options, next) => { if (isAgentLoopRequest(options)) mainLoopCalls++; return next(); }, { global: true });
  ctx.reflect.provide('sessions', { get: id => ({ id, requestHeader: () => ({ config: { provider: 'fixture', model: 'fixture' }, tools: [] }), toolHistory: () => ({ tools: [], updates: [] }), deriveMessages: () => prefix }) });
  ctx.reflect.provide('sessionController', {});
  ctx.reflect.provide('connection', { requestRejection: () => undefined });
  ctx.reflect.provide('webServer', { register(value) { assert.equal(route, undefined); route = value; return () => { route = undefined; }; } });
  const owner = ctx.plugin(btw); await owner;
  assert.equal(route.path, '/api/dsh-btw/ask');
  const req = new PassThrough(); req.method = 'POST';
  const chunks = [], res = new EventEmitter();
  Object.assign(res, { headersSent: false, writableEnded: false, writableLength: 0,
    writeHead(status) { assert.equal(status, 200); this.headersSent = true; }, flushHeaders() {},
    write(chunk) { chunks.push(chunk); }, end(chunk) { if (chunk) chunks.push(chunk); this.writableEnded = true; } });
  const pending = route.handler(req, res);
  req.end(JSON.stringify({ sessionId: 'parent', clientId: 'fixture', question: 'Why?', history: [] }));
  await pending;
  const events = chunks.join('').trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(events.find(event => event.type === 'text').text, 'Side answer');
  assert.equal(events.at(-1).type, 'done');
  assert.equal(requests, 1); assert.equal(mainLoopCalls, 0);
  assert.equal(prefix.length, 1);
  await owner.dispose(); assert.equal(route, undefined);
});

test('bundled BTW identity and source inventory match the standalone package', async () => {
  const manifest = JSON.parse(await readFile(new URL('../vendor/btw.json', import.meta.url)));
  assert.equal(manifest.package, '@gulagala001/dsh-btw');
  assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/);
  const pkg = JSON.parse(await readFile(new URL('../vendor/btw/package.json', import.meta.url)));
  assert.equal(pkg.engines.dsh, manifest.host); assert.equal(pkg.version, manifest.version);
  for (const [path, expected] of Object.entries(manifest.files)) {
    const bytes = await readFile(new URL('../vendor/btw/' + path, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, path);
  }
});
