import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime, renderToolsSdk, renderToolsSdkPy } from '@deepseek-ai/dsh-tools';
import { LlmRuntime, LlmAdapter, createToolResultMessage, markAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { Session } from '@deepseek-ai/dsh-session';
import { installResultReduction, ResultReduction } from '../src/result-reduction/service.mjs';
import { MonitorLedger } from '../src/monitor-ledger.mjs';
import { installCatalog, selectCatalog, rememberCatalog, projectCatalogAssembly } from '../src/result-reduction/catalog.mjs';
import { registerContextViews } from '../src/result-reduction/views.mjs';
import { registerContextRecall } from '../src/context/recall.mjs';
import { transformAssembly } from '../src/cc-adaptation/adapter.mjs';
import { measureRequest } from '../src/metering/estimate.mjs';

const host = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
const { NodePtcRuntime } = await import(host.resolve('@deepseek-ai/dsh-ptc-runtime-node'));
const { LocalSubprocessRuntime } = await import(host.resolve('@deepseek-ai/dsh-subprocess-local'));
const text = value => [{ type: 'text', text: value }];
async function fixture(t, mode = 'ptc') {
  const dir = await mkdtemp(join(tmpdir(), 'omd-tool-paths-')), ctx = new Context(), session = Session.create('s1'), agent = { ctx, session };
  const append = session.append.bind(session);
  session.append = (...args) => { const event = append(...args); ctx.emit('session/event', session, event); return event; };
  ctx.reflect.provide('systemPrompt', { tools() {}, section() {}, getSectionOrder() { return 0; } });
  ctx.reflect.provide('sessions', { get: id => id === session.id ? session : undefined });
  ctx.reflect.provide('fs', { processPathFromHostPath: value => value });
  ctx.reflect.provide('workingDirectory', { ensure: async () => dir });
  ctx.reflect.provide('sandbox', { confine() { throw Error('Unexpected sandbox route'); } });
  ctx.reflect.provide('sandboxPolicy', { defaultMode: 'danger-full-access', resolve: () => ({ mode: 'danger-full-access', workspaceRoot: dir, sessionId: session.id }) });
  await ctx.plugin(LocalSubprocessRuntime);
  await ctx.plugin(NodePtcRuntime, { executionMode: 'per-call', timeoutMs: 3000, maxTimeoutMs: 5000, graceMs: 25 });
  await ctx.plugin(ToolRuntime, { mode });
  await ctx.plugin(LlmRuntime);
  const sent = []; let fail = false;
  class Adapter extends LlmAdapter { async *stream(options) { sent.push(options); yield { type: 'finish', reason: { kind: fail ? 'error' : 'stop' } }; } }
  ctx.llm.registerAdapter(['fixture'], new Adapter());
  const config = { contextOptimizationEnabled: true }; let bc = false;
  const hub = { store: { dir }, monitor: new MonitorLedger(dir), config: () => config, bc: { view: () => ({ backend: bc ? 'bc' : 'omd' }) } };
  const service = installResultReduction(ctx, hub, () => true), messages = [];
  let serial = 0;
  const call = async (name, args) => {
    const callId = 'path-' + ++serial;
    session.append('tool/call', { callId, name, arguments: JSON.stringify(args) });
    const result = await ctx.tools.execute({ name, arguments: args, callId, rootCallId: callId, agent, signal: new AbortController().signal });
    const message = createToolResultMessage({ callId, content: result.content, isError: result.isError });
    session.append('tool/result', { message }, { surfaceOp: 'append' }); await service.settled();
    messages.push({ id: 'assistant-' + callId, role: 'assistant', source: { kind: 'model', provider: 'fixture', model: 'fixture' }, content: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) }] }, message);
    return result;
  };
  const program = code => call('run_code', { code, description: 'Verify tool output contract' });
  const request = (rows = messages, extras = {}) => markAgentLoopRequest({ provider: 'fixture', model: 'fixture', sessionId: session.id, messages: rows, tools: [], ...extras });
  t.after(async () => { await service.settled(); await ctx.fiber.dispose(); hub.monitor.close(); await rm(dir, { recursive: true, force: true }); });
  return { ctx, hub, service, session, agent, dir, call, program, request, messages, config, sent, fail: value => { fail = value; }, bc: value => { bc = value; } };
}
const definition = (name, value, render = v => JSON.stringify(v, null, 2)) => ({ name, description: 'Authorized synthetic fixture', parameters: { type: 'object', properties: {}, additionalProperties: false },
  output: { schema: { type: 'object' }, render: (_args, value) => text(render(value)) }, execute: () => typeof value === 'function' ? value() : value });

test('PTC recall display unwraps only exact single-call text while preserving values, logs and mixed programs', async t => {
  const f = await fixture(t), payload = { rawRef: 'omd-raw:fixture', text: 'original "quoted" text\n'.repeat(50), hasMore: false };
  const content = text(JSON.stringify(payload)), value = JSON.stringify({ content });
  f.ctx.tools.register({ name: 'recall', description: 'Synthetic evidence recall', parameters: { type: 'object', properties: { rawRef: { type: 'string' } } },
    output: { schema: { type: 'string' }, render: () => content }, execute: () => value });
  f.ctx.tools.register(definition('read', { value: 1 }));
  const folded = await f.program('return await tools.recall({rawRef:"omd-raw:fixture"});');
  assert.equal(folded.isError, false); assert.equal(folded.value.result, value); assert.deepEqual(folded.content, content);
  const logs = await f.program('console.log("keep this log");return await tools.recall({rawRef:"omd-raw:fixture"});');
  assert.match(logs.content[0].text, /keep this log/); assert.ok(logs.content[0].text.includes(value));
  const mixed = await f.program('await tools.read({});return await tools.recall({rawRef:"omd-raw:fixture"});');
  assert.equal(mixed.content[0].text, value);
  f.config.contextOptimizationEnabled = false;
  assert.equal((await f.program('return await tools.recall({rawRef:"omd-raw:fixture"});')).content[0].text, value);
});

test('document views and original recall work through the real PTC pipeline without changing the string contract', async t => {
  const f = await fixture(t), bytes = Buffer.from('name,value\ninvoice,001\n');
  f.ctx.fs = { processPathFromHostPath: path => path, async resolve() { return { targetKey: '/approved/table.csv', displayPath: '/approved/table.csv' }; },
    processPath: t => t.displayPath, async stat() { return { type: 'file', size: bytes.length, version: 'v1' }; },
    async readBytes() { return bytes; }, async readText() { return bytes.toString(); }, async streamText() { return [bytes.toString()]; } };
  const native = await import(host.resolve('@deepseek-ai/dsh-tool-fs'));
  native.apply(f.ctx, native.Config({ readImage: false, write: false, edit: false }));
  registerContextViews(f.ctx, f.hub); registerContextRecall(f.ctx, f.hub);
  const r = await f.program('return await tools.context_view({file:"table.csv",view:"article"});');
  assert.equal(r.isError, false, JSON.stringify(r.content)); assert.equal(typeof r.value.result, 'string');
  const view = JSON.parse(r.value.result); assert.equal(view.document.format, 'csv'); assert.equal(view.rawComplete, false);
  const recalled = await f.program(`return await tools.recall({rawRef:${JSON.stringify(view.rawRef)},maxChars:48000});`);
  assert.equal(recalled.isError, false, JSON.stringify(recalled.content));
  assert.equal(typeof recalled.value.result, 'string'); assert.equal(JSON.parse(recalled.value.result).content[0].text, recalled.content[0].text);
  assert.deepEqual(JSON.parse(JSON.parse(recalled.content[0].text).text).rows[1], ['invoice', '001']);
  const raw = await f.program('return await tools.context_view({file:"table.csv",view:"raw"});');
  assert.equal(JSON.parse(raw.value.result).text, bytes.toString()); assert.equal(JSON.parse(raw.value.result).rawComplete, true);
});

test('real PTC preserves intermediate values, reduces only emitted JSON, and leaves suppressed output and failed/write receipts intact', async t => {
  const f = await fixture(t), rows = Array.from({ length: 90 }, (_, n) => ({ name: 'resource-' + n, ready: true })), value = { rows };
  const original = JSON.stringify(value, null, 2);
  f.ctx.tools.register(definition('read', value));
  const r = await f.program('const v = await tools.read({}); if (v.rows.length !== 90 || v.rows[89].name !== "resource-89") throw Error("changed value"); console.log(JSON.stringify(v, null, 2)); return 7;');
  assert.equal(r.isError, false, JSON.stringify(r.content)); assert.equal(r.value.result, 7); assert.equal(r.value.logs[0], original);
  // Mixed logs/return are not guessed into JSON; exact repeat folding still stays lossless.
  const compact = await f.program('return await tools.read({});');
  assert.equal(compact.isError, false); assert.deepEqual(compact.value.result, value);
  assert.ok(compact.content[0].text.length < original.length);
  const ref = compact.content[0].text.match(/omd-raw:[\w-]+/)[0];
  assert.equal((await f.service.recall(f.session, { rawRef: ref, maxChars: 48000, maxLines: 2000 })).text, original);
  const nested = f.session.snapshotEvents().filter(e=>e.type==='tool/ptc-dispatch' && e.data.name==='read');
  assert.ok(nested.every(e=>e.data.content[0].text===original));
  const suppressed = await f.program('await tools.read({}); return "done";'); assert.equal(suppressed.content[0].text, 'done');
  f.ctx.tools.register(definition('write', value));
  const receipt = await f.program('return await tools.write({});'); assert.equal(receipt.content[0].text, original);
  const failed = await f.program('await tools.read({}); throw Error("task failure");'); assert.equal(failed.isError, true);
});

test('complete PTC output baselines survive restart; differences, missing history, BC and disable keep their boundaries', async t => {
  const f = await fixture(t); let body = Array.from({ length: 140 }, (_, i) => `line ${i}: exact source ${i*i}`).join('\n');
  f.ctx.tools.register(definition('read', () => ({ body })));
  const code = 'return (await tools.read({})).body;';
  await f.program(code); await f.program(code);
  assert.match(f.service.project(f.request()).messages.at(-1).content[0].text, /Unchanged output/);
  assert.equal(f.service.project(f.request(f.messages.slice(2))).messages.at(-1).content[0].text, body);
  body = body.replace('line 50:', 'changed 50:'); await f.program(code);
  assert.match(f.service.project(f.request()).messages.at(-1).content[0].text, /\+changed 50/);
  const restarted = new ResultReduction(f.ctx, f.hub, () => true); await restarted.restore(f.session);
  assert.match(restarted.project(f.request()).messages.at(-1).content[0].text, /\+changed 50/);
  f.bc(true); assert.equal(restarted.project(f.request()).messages.at(-1).content[0].text, body);
  f.bc(false); f.config.contextOptimizationEnabled = false;
  assert.equal(restarted.project(f.request()).messages.at(-1).content[0].text, body);
  restarted.release(); await restarted.settled();
});

test('Native and PTC share discovery, exact contracts and revocation; all four formerly unknown tools have real SDK arguments', async t => {
  const f = await fixture(t, 'native'); installCatalog(f.ctx, f.hub); registerContextViews(f.ctx, f.hub); registerContextRecall(f.ctx, f.hub);
  const original = definition('mcp__demo__lookup', { value: 42 }); original.description = 'Lookup documents. '.repeat(200);
  const dispose = f.ctx.tools.register(original);
  const make = ptc => {
    const schemas = f.ctx.tools.schemas(f.agent), assembly = { sections: [{ name: 'oh-my-dsh:persona', text: 'owner' }, ...(ptc ? [{ name: 'tools:sdk', text: renderToolsSdk(schemas.map(s=>({ ...s, output:f.ctx.tools.get(s.name,f.agent).output.schema }))) }] : [])], tools: ptc ? [] : schemas };
    const transformed = transformAssembly(assembly, { agent: f.agent }, { promptStyle: 'dsh', schemas }).assembly;
    return projectCatalogAssembly(transformed, { enabled: true, renderSdk: renderToolsSdk,
      schemas: schemas.map(s=>({ ...s, output:f.ctx.tools.get(s.name,f.agent).output.schema })),
      select: tools=>selectCatalog(f.ctx,f.hub,f.agent,tools), remember: plan=>rememberCatalog(f.hub,plan) });
  };
  const native = make(false), ptc = make(true);
  assert.ok(!native.tools.some(t=>t.name===original.name));
  assert.ok(!ptc.sections.find(s=>s.name==='tools:sdk').text.includes(original.name + ':'));
  for (const assembly of [native, ptc]) {
    const system = { id: 'catalog-system', role: 'system', source: { kind: 'system-prompt' }, content: text(assembly.sections.map(s=>s.text).join('\n\n')) };
    for await (const _ of f.ctx.llm.stream(f.request([system], { tools: assembly.tools }))) {}
    const stats = f.service.snapshot(f.session);
    assert.ok(stats.lastRequest.beforeTokens > stats.lastRequest.afterTokens);
    assert.ok(stats.lastRequest.rules.some(r=>r.rule==='scoped-tool-discovery'));
  }
  const schemas = f.ctx.tools.schemas(f.agent).map(s=>({ ...s, output:f.ctx.tools.get(s.name,f.agent).output.schema }));
  for (const name of ['tool_find','context_view','code_search','recall']) {
    assert.ok(!renderToolsSdk(schemas).includes(name + ': unknown;'));
    assert.ok(!renderToolsSdkPy(schemas).includes(`async def ${name}(self, args: Any)`));
  }
  const found = await f.call('tool_find', { query: 'demo lookup' }); assert.equal(found.isError,false);
  assert.deepEqual(JSON.parse(found.value).tools[0].parameters, original.parameters);
  assert.ok(make(false).tools.some(t=>t.name===original.name));
  assert.ok(make(true).sections.find(s=>s.name==='tools:sdk').text.includes(original.name+':'));
  dispose(); assert.ok(!make(false).tools.some(t=>t.name===original.name));
  for (const [name,args] of [['tool_find',{query:'',limit:0}],['code_search',{paths:[],language:'javascript',pattern:'x'}],['context_view',{file:'a',url:'x',view:'raw'}],['recall',{from:1}],['recall',{id:'x',asset:0}]]) assert.equal((await f.call(name,args)).isError,true,name);
});

test('native LlmRuntime sends projected requests, preserves accounting across restart and never credits failed attempts', async t => {
  const f = await fixture(t), value = { rows: Array.from({ length: 100 }, (_, n) => ({ n, source: 'synthetic' })) };
  f.ctx.tools.register(definition('read', value)); await f.program('return await tools.read({});');
  const input = f.request(), frames = []; for await (const frame of f.ctx.llm.stream(input)) frames.push(frame);
  const first = f.service.snapshot(f.session);
  assert.equal(first.requests,1,JSON.stringify({first,sent:f.sent.length,frames})); assert.ok(first.estimatedSavedTokens>0);
  assert.equal(first.lastRequest.afterTokens,measureRequest(f.sent[0]).tokens);
  assert.equal(first.lastRequest.beforeTokens-first.lastRequest.afterTokens,first.estimatedSavedTokens);
  f.fail(true); for await (const _ of f.ctx.llm.stream(f.request())) {}
  const after = f.service.snapshot(f.session); assert.equal(after.failures,1); assert.equal(after.estimatedSavedTokens,first.estimatedSavedTokens);
  const reopened = new MonitorLedger(f.dir); t.after(()=>reopened.close());
  const saved = reopened.optimizationSnapshot(f.session.id); assert.equal(saved.requests,1); assert.equal(saved.failures,1); assert.equal(saved.estimatedNetTokens,first.estimatedNetTokens);
  assert.ok(saved.lastRequest.beforeTokens > saved.lastRequest.afterTokens);
  reopened.db.prepare("DELETE FROM events WHERE kind='toolOptimization'").run();
  const restarted = new ResultReduction(f.ctx, { ...f.hub, monitor: reopened }, () => true);
  await restarted.restore(f.session); assert.equal(restarted.snapshot(f.session).requests,1);
  assert.equal(reopened.optimizationSnapshot(f.session.id).attempts,2);
  restarted.release(); await restarted.settled();
});

test('identical immutable images are folded at the final message boundary including PTC contextual delivery', async t => {
  const f = await fixture(t), image = { type:'image',attachment:{attachmentId:'same-immutable-image',mediaType:'image/png',bytes:50000,width:100,height:100} };
  const messages = [{ id:'first',role:'user',content:[...text('First observation'),image] },{id:'second',role:'user',content:[...text('Fresh observation'),image]}];
  const projected=f.service.project(f.request(messages));
  assert.equal(projected.messages[0].content[1].type,'image'); assert.equal(projected.messages[1].content[1].type,'text');
  assert.equal(projected.messages[1].content[0].text,'Fresh observation');assert.equal(messages[1].content[1].type,'image');
  assert.equal(f.service.project(f.request(messages.slice(1))).messages[0].content[1].type,'image');
  f.bc(true);assert.equal(f.service.project(f.request(messages)).messages[1].content[1].type,'image');
});

test('native fs write-intent prevents incomplete PTC reconstruction and accepts complete ranged reads', async t => {
  const { installFileReadIntegrity } = await import('../src/file-read-integrity.mjs');
  const native = await import(host.resolve('@deepseek-ai/dsh-tool-fs'));
  const f = await fixture(t);
  let body = Array.from({length:1200},(_,i)=>String(i).padStart(5,'0') + 'x'.repeat(90)).join('\n'), version = 'v1', writes = 0;
  const fs = { processPathFromHostPath: path=>path, async resolve(path) { return { targetKey: '/authorized/file', displayPath: path }; }, processPath: t=>t.displayPath,
    async stat() { return { type:'file',size:Buffer.byteLength(body),version }; }, async readText() { return body; }, async streamText() { return [body]; },
    async writeText(_target,text) { writes++;const before=body;body=text;version='v'+(writes+1);return {operation:'update',before,after:body,version};} };
  f.ctx.fs = fs;
  native.apply(f.ctx,native.Config({ readImage:false, edit:false }));
  installFileReadIntegrity(f.ctx,()=>true);
  const truncated = await f.program('const r=await tools.read({file_path:"file"}); await tools.write({file_path:"file",content:r.lines.map(l=>l.text).join("\\n")});');
  assert.equal(truncated.isError,true);assert.match(JSON.stringify(truncated),/incomplete read window/);assert.equal(writes,0);assert.equal(body.split('\n').length,1200);
  const full = await f.program('const lines=[];let offset=1,total;do {const r=await tools.read({file_path:"file",offset});lines.push(...r.lines);total=r.totalLines;offset=r.lines.at(-1).number+1;}while(offset<=total);return await tools.write({file_path:"file",content:lines.map(l=>l.text).join("\\n")});');
  assert.equal(full.isError,false,JSON.stringify(full.content));assert.equal(writes,1);assert.equal(body.split('\n').length,1200);
  body = 'one=' + 'x'.repeat(6000); version = 'external-long-line';
  const longLine = await f.program('const r=await tools.read({file_path:"alias"});await tools.write({file_path:"file",content:r.lines[0].text});');
  assert.equal(longLine.isError,true);assert.equal(writes,1);assert.equal(body.length,6004);
  registerContextViews(f.ctx,f.hub); registerContextRecall(f.ctx,f.hub);
  const snapshot = await f.program('const r=JSON.parse(await tools.context_view({file:"alias",view:"raw"}));if(r.partial)throw Error("partial"); const restored=JSON.parse(await tools.recall({rawRef:r.rawRef,maxChars:48000}));if(!restored.content[0].text.includes("one="))throw Error("recall");await tools.write({file_path:"file",content:r.text});');
  assert.equal(snapshot.isError,false,JSON.stringify(snapshot.content));assert.equal(writes,2);assert.equal(body.length,6004);
  body = 'console.log(123);\nfunction check() {}'; version = 'external-javascript';
  const ast = await f.program('return JSON.parse(await tools.code_search({paths:["file"],language:"javascript",pattern:"console.log($A)"})).totalMatches;');
  assert.equal(ast.isError,false,JSON.stringify(ast.content));assert.equal(ast.value.result,1);

});
