import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { createToolResultMessage, markAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { FixtureSession } from './context-fixture.mjs';
import { installResultReduction } from '../src/result-reduction/service.mjs';
import { EvidenceStore, hash } from '../src/result-reduction/evidence.mjs';
import { minifyJson, reduceText, dataView } from '../src/result-reduction/reducers.mjs';
import { structuralSearch, astRuntime, languages } from '../src/result-reduction/ast.mjs';
import { articleView, registerContextViews } from '../src/result-reduction/views.mjs';
import { codegraphEnvironment, CodegraphRuntime } from '../src/codegraph.mjs';

const text = value => [{ type: 'text', text: value }];
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'omd-optimization-'));
  const ctx = new Context(), session = new FixtureSession(), agent = { session, ctx };
  const settings = { contextOptimizationEnabled: true }; let bc = 'omd';
  ctx.reflect.provide('systemPrompt', { tools() {}, section() {}, getSectionOrder() { return 0; } });
  ctx.reflect.provide('sessions', { get: id => id === session.id ? session : undefined });
  ctx.reflect.provide('llm', { async *stream() {}, async prepareCall() { return { stream: this.stream }; } });
  await ctx.plugin(ToolRuntime);
  const hub = { store: { dir: directory }, config: () => settings, bc: { view: () => ({ backend: bc }) } };
  const service = installResultReduction(ctx, hub, () => true), messages = [];
  let serial = 0;
  async function call(name, args = {}, extras = {}) {
    const callId = 'call-' + ++serial;
    session.append('tool/call', { callId, name, arguments: JSON.stringify(args) });
    const assistant = { id: 'a' + callId, role: 'assistant', content: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) }] };
    const result = await ctx.tools.execute({ name, arguments: args, agent, callId, signal: new AbortController().signal, ...extras });
    const message = createToolResultMessage({ callId, content: result.content, isError: result.isError });
    const event = session.append('tool/result', { message }, { surfaceOp: 'append' });
    ctx.emit('session/event', session, event); await service.settled(); messages.push(assistant, message);
    return { result, message, event, callId };
  }
  const request = (rows = messages) => markAgentLoopRequest({ sessionId: session.id, messages: rows, tools: [], provider: 'fixture', model: 'fixture' });
  t.after(async () => { await service.settled(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  return { ctx, hub, service, session, agent, directory, call, messages, request, settings, bc: value => { bc = value; } };
}

test('real DSH registry without OPS: shorten a view, keep canonical values, recover after disable/restart/export/fork', async t => {
  const f = await fixture(t), value = Array.from({ length: 90 }, (_, i) => ({ file: 'some-path-' + i, line: i, enabled: true }));
  const original = JSON.stringify(value, null, 2);
  f.ctx.tools.register({ name: 'grep', description: 'fixture', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'array' }, render: () => text(original) }, execute: () => value });
  const { result } = await f.call('grep');
  assert.equal(result.isError, false); assert.deepEqual(result.value, value);
  const ref = result.content[0].text.match(/omd-raw:[a-f0-9-]{36}/)?.[0]; assert.ok(ref);
  assert.ok(result.content[0].text.length < original.length);
  f.settings.contextOptimizationEnabled = false;
  const raw = await f.service.recall(f.session, { rawRef: ref, maxChars: 48000, maxLines: 2000 }); assert.equal(raw.text, original);
  const reopened = new EvidenceStore(f.directory);
  assert.equal((await reopened.read(f.session, { rawRef: ref, maxChars: 48000, maxLines: 2000 })).text, original);
  const bundle = await reopened.export(f.session);
  const imported = new EvidenceStore(join(f.directory, 'import'));
  assert.deepEqual(await imported.import(bundle, f.session), { imported: 1 });
  assert.equal((await imported.read(f.session, { rawRef: ref, maxChars: 48000, maxLines: 2000 })).text, original);
  const restored = new FixtureSession('new-import-id', f.session.snapshotEvents());
  await imported.import(bundle, restored);
  assert.equal((await imported.read(restored, { rawRef: ref, maxChars: 48000, maxLines: 2000 })).text, original);
  const child = new FixtureSession('child', f.session.snapshotEvents(), [], { parentSession: f.session.id }); child.inheritedEventCount = f.session.events.length;
  assert.equal((await imported.read(child, { rawRef: ref, maxChars: 48000, maxLines: 2000 }, [f.session.id])).text, original);
  child.inheritedEventCount = 1; await assert.rejects(imported.read(child, { rawRef: ref }, [f.session.id]), /无权/);
  const other = new FixtureSession('other'); await assert.rejects(imported.read(other, { rawRef: ref }), /无权/);
  const nested = await f.call('grep', {}, { parent: Symbol('PTC'), rootCallId: 'program' });
  assert.deepEqual(nested.result.value, value); assert.deepEqual(nested.result.content, text(original));
});

test('read execution still runs; repeat and exact delta require a full baseline in the same request', async t => {
  const f = await fixture(t); let calls = 0, body = 'unchanged source line\n'.repeat(120);
  f.ctx.tools.register({ name: 'read', description: 'fixture read', parameters: { type: 'object', properties: { file_path: { type: 'string' } } },
    output: { schema: { type: 'object' }, render: () => text(body) }, execute: () => { calls++; return { path: '/project/file', offset: 1, totalLines: 120, lines: body.split('\n').slice(0, -1).map((text, i) => ({ number: i + 1, text })) }; } });
  await f.call('read', { file_path: 'file' }); await f.call('read', { file_path: 'file' });
  assert.equal(calls, 2);
  const input = f.request(), projected = f.service.project(input);
  assert.match(projected.messages[3].content[0].text, /Unchanged/); assert.equal(input.messages[3].content[0].text, body);
  assert.equal(f.service.project(f.request(f.messages.slice(2))).messages[1].content[0].text, body);
  body = body.replace('unchanged source line', 'new source line'); await f.call('read', { file_path: 'file' });
  const delta = f.service.project(f.request()); assert.match(delta.messages.at(-1).content[0].text, /\+new source line/);
  f.bc('bc'); assert.equal(f.service.project(f.request()).messages.at(-1).content[0].text, body);
  f.bc('omd'); f.settings.contextOptimizationEnabled = false; assert.equal(f.service.project(f.request()).messages.at(-1).content[0].text, body);
});

test('long single lines, true tail, search index and crash-between-event-and-commit recovery', async t => {
  const f = await fixture(t), source = 'x'.repeat(60000) + '\n' + 'row\n'.repeat(300) + '最后位置 END_OF_SOURCE';
  const record = await f.service.evidence.save({ sessionId: f.session.id, callId: 'large', tool: 'context_view', args: {}, text: source, rule: 'raw' });
  const content = text(JSON.stringify({ rawRef: record.ref, sourceHash: record.sourceHash }));
  await f.service.evidence.prepare(record.ref, content);
  f.session.append('tool/call', { callId: 'large', name: 'context_view', arguments: '{}' });
  f.session.append('tool/result', { message: createToolResultMessage({ callId: 'large', content, isError: false }) });
  const store = new EvidenceStore(f.directory);
  const tail = await store.read(f.session, { rawRef: record.ref, mode: 'tail' }); assert.ok(tail.text.endsWith('END_OF_SOURCE')); assert.equal(tail.hasMore, false);
  let cursor, restored = '';
  do { const page = await store.read(f.session, { rawRef: record.ref, maxChars: 12000, cursor }); restored += page.text; cursor = page.nextCursor; } while (cursor);
  assert.equal(restored, source);
  const found = await store.search(f.session, { query: 'END_OF_SOURCE' }); assert.equal(found.matchedRecords, 1);
  assert.equal((await store.search(f.session, { query: '不存在' })).matchedRecords, 0);
  const tampered = await store.export(f.session); tampered.objects[record.sourceHash] = 'different'; await assert.rejects(store.import(tampered, f.session), /不匹配/);
});

test('numeric precision, protected receipts/errors and real bundled AST/Readability', async () => {
  assert.equal(minifyJson('{ "big": 9007199254740993, "x": 1e20, "x": -0 }'), '{"big":9007199254740993,"x":1e20,"x":-0}');
  assert.equal(dataView('[9007199254740993, 1e20, -0]').rule, 'json-whitespace');
  for (const name of ['edit', 'write', 'apply_patch', 'mcp__server__delete_file']) assert.equal(reduceText({ name }, { value: {} }, 'receipt\n'.repeat(200)), null);
  assert.equal(reduceText({ name: 'grep' }, { isError: true }, 'error\n'.repeat(200)), null);
  for (const language of languages) await astRuntime(language);
  const ast = await structuralSearch('console.log(1); console.warn(2);', 'javascript', 'console.log($A)');
  assert.equal(ast.matches.length, 1); assert.equal(ast.matches[0].text, 'console.log(1)');
  const html = '<html><head><title>Source</title></head><body><nav>menu</nav><article><h1>Source</h1><p>' + 'A complete sentence about source code. '.repeat(40) + '</p><script>throw Error("should never run")</script></article></body></html>';
  const article = await articleView(html); assert.equal(article.title, 'Source'); assert.ok(!article.text.includes('should never run'));
});

test('CodeGraph keeps its index but no connection visibility leaks between chats', async t => {
  assert.equal(codegraphEnvironment().CODEGRAPH_EXPLORE_DEDUP, '0');
  const runtime = new CodegraphRuntime({ autoIndex: false }); runtime.autoIndex = false;
  const connections = []; runtime.connect = async () => { const c = { client: { async callTool() { return { content: [] }; } } }; connections.push(c); return c; };
  runtime.close = async () => {};
  t.after(() => runtime.dispose());
  const cwd = new URL('../', import.meta.url).pathname;
  await runtime.call('codegraph_explore', {}, { cwd, sessionKey: 'chat-a' });
  await runtime.call('codegraph_explore', {}, { cwd, sessionKey: 'chat-b' });
  await runtime.call('codegraph_explore', {}, { cwd, sessionKey: 'chat-a' });
  assert.equal(connections.length, 2);
});

test('native view/AST tools save complete evidence; denied underlying reads never reach the filesystem', async t => {
  const f = await fixture(t), source = 'console.log(123);\n' + 'let identifier = 1;\n'.repeat(200);
  let reads = 0, denied = false;
  f.ctx.reflect.provide('fs', { async resolve(path) { return { path }; }, processPath: target => target.path,
    async stat() { return { type: 'file', size: source.length, version: 'v1' }; },
    async streamText() { reads++; return [source]; } });
  f.ctx.tools.register({ name: 'read', description: 'authorized read', parameters: { type: 'object', properties: { file_path: { type: 'string' }, limit: { type: 'number' } } },
    output: { schema: { type: 'object' }, render: () => text('line 1') }, execute: () => ({ path: '/project/file.js', lines: [{ number: 1, text: 'console.log(123);' }], totalLines: 201 }) });
  f.ctx.on('tools/pre-execute', (exec, next) => denied && exec.name === 'read' ? { kind: 'deny', reason: 'policy denied file' } : next(), { global: true });
  registerContextViews(f.ctx, f.hub);
  const raw = await f.call('context_view', { file: '/project/file.js', view: 'raw', maxChars: 256 });
  assert.equal(raw.result.isError, false, JSON.stringify(raw.result.content));
  const page = JSON.parse(raw.result.value); assert.equal(page.partial, true);
  assert.equal((await f.service.recall(f.session, { rawRef: page.rawRef, maxLines: 2000 })).text, source);
  const search = await f.call('code_search', { paths: ['/project/file.js'], language: 'javascript', pattern: 'console.log($A)' });
  assert.equal(search.result.isError, false, JSON.stringify(search.result.content));
  const found = JSON.parse(search.result.value); assert.equal(found.totalMatches, 1); assert.deepEqual(found.matches[0].range.start, { line: 0, column: 0, index: 0 });
  const before = reads; denied = true;
  const rejected = await f.call('context_view', { file: '/private/secret', view: 'raw' }); assert.equal(rejected.result.isError, true); assert.equal(reads, before);
});
