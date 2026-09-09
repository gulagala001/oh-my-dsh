import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';

async function until(fn, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await new Promise(done => setTimeout(done, 100)); }
  throw Error('Timed out waiting for integration result');
}

test('official DSH profile → plugin → native tools → memory → V3 canvas → raw recall', { timeout: 90000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'trisoul-x-dsh-')), home = join(root, 'home'), workspace = join(root, 'workspace');
  mkdirSync(home); mkdirSync(workspace); mkdirSync(join(workspace, '.agents', 'skills', 'test-skill'), { recursive: true });
  writeFileSync(join(workspace, '.agents', 'skills', 'test-skill', 'SKILL.md'), '---\nname: test-skill\ndescription: Verify a fixture.\n---\nInclude SKILL_FIXTURE in the result.\n');
  writeFileSync(join(workspace, 'AGENTS.md'), 'Project instruction marker: PROJECT_FIXTURE.\n');
  const payloads = [], content = 'ORIGINAL_FIXTURE_42\n' + 'source material '.repeat(600);
  let calls = 0, recallRange, recallReply;
  const provider = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    const p = JSON.parse(body); payloads.push(p);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', created: 1, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    const tool = (name, args) => chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call-' + payloads.length, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, 'tool_calls');
    if (p.tools?.some(t => t.function.name === 'save_context')) {
      tool('save_context', { digest: 'Read the fixture.', pin: ['Keep the source fixture intact.'], status: 'Native tools completed.', compactable: true, nowCompactable: [], ops: [{ op: 'add', scope: 'project', key: 'fixture.result', text: 'Fixture result is 42.', target: '' }] });
    } else if (!p.tools?.length) { chunk({ role: 'assistant', content: 'Done: inspected the fixture. Not yet done: report the result.' }, 'stop'); }
    else if (recallRange) {
      tool('recall', { query: 'original fixture', from: recallRange.from, to: recallRange.to }); recallRange = null; recallReply = true;
    } else if (recallReply) { chunk({ role: 'assistant', content: 'Original record retrieved.' }, 'stop'); }
    else if (calls++ === 0) tool('todo_write', { todos: [{ content: 'Write and verify the fixture.', status: 'in_progress', source: 'Run native fixture tools.', verification: { method: 'Read fixture.txt and check ORIGINAL_FIXTURE_42.' } }] });
    else if (calls === 2) tool('write', { file_path: 'fixture.txt', content });
    else if (calls <= 7) tool('read', { file_path: 'fixture.txt' });
    else if (calls === 8) tool('todo_write', { todos: [{ content: 'Write and verify the fixture.', status: 'completed', source: 'Run native fixture tools.', verification: { method: 'Read fixture.txt and check ORIGINAL_FIXTURE_42.', result: 'Read the actual fixture.txt; ORIGINAL_FIXTURE_42 is present.' } }] });
    else { chunk({ role: 'assistant', content: 'Native tools completed.' }, 'stop'); }
    res.write(`data: ${JSON.stringify({ id: 'fixture', choices: [], usage: { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise(done => provider.listen(0, '127.0.0.1', done));
  const settings = { 'llm-pi-ai': { providers: { fixture: { api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'TRISOUL_X_FIXTURE_KEY', models: [{ id: 'fixture', name: 'fixture', contextWindow: 1000000, maxTokens: 16384, input: ['text'] }] } } }, 'agent-default-model': { provider: 'fixture', model: 'fixture' } };
  writeFileSync(join(home, 'settings.yaml'), JSON.stringify(settings));
  writeFileSync(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { TRISOUL_X_FIXTURE_KEY: 'fixture-key' } }), { mode: 0o600 });
  const child = spawn(process.execPath, ['scripts/start.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, DSH_HOME: home, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill('SIGTERM'); await Promise.race([once(child, 'exit'), new Promise(r => setTimeout(r, 5000).unref())]); }
    provider.closeAllConnections(); await new Promise(done => provider.close(done)); rmSync(root, { recursive: true, force: true });
  });
  const bootstrap = await until(() => {
    if (child.exitCode !== null) throw Error(log.replace(/token=\S+/g, 'token=[redacted]'));
    return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];
  });
  const base = new URL(bootstrap).origin, login = await fetch(bootstrap, { redirect: 'manual' });
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const rpc = async (method, request) => {
    const response = await fetch(`${base}/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } } }) });
    const body = await response.json(); assert.equal(body.result?.ok, true, JSON.stringify(body)); return body.result.value;
  };
  const api = async (path, body) => { const r = await fetch(base + '/trisoul-x/api' + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const value = await r.json(); assert.ok(r.ok, JSON.stringify(value)); return value; };
  const created = await rpc('session/create', { cwd: workspace, agentPreset: 'trisoul-x' }), id = created.sessionId, q = '?session=' + id;
  assert.equal((await api('/scope' + q)).locked, false);
  await api('/scope' + q, { scope: 'project' });
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: id, mode: 'queue', content: [{ type: 'text', text: 'Run native fixture tools.' }], clientTimeZone: 'Asia/Shanghai' });
  const state = await until(async () => { const s = await api('/state' + q); return s.running === 'idle' && s.context?.digestCount && !s.live && s.metrics.main?.calls >= 9 && s; });
  assert.equal(readFileSync(join(workspace, 'fixture.txt'), 'utf8'), content);
  assert.equal((await api('/scope' + q)).scope, 'project'); assert.equal((await api('/scope' + q)).locked, true);
  const locked = await fetch(base + '/trisoul-x/api/scope' + q, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope: 'full' }) }); assert.equal(locked.status, 409);
  await api('/settings', { memoryScope: 'full' }); assert.equal((await api('/scope' + q)).scope, 'project');
  assert.ok(state.actions.injections); assert.ok(state.metrics.background.calls);
  assert.equal(state.tasks.length, 1); assert.equal(state.tasks[0].status, 'completed');
  assert.match(state.tasks[0].verification.result, /actual fixture.txt/);
  const names = payloads.find(p => p.tools?.some(t => t.function.name === 'read')).tools.map(t => t.function.name);
  for (const name of ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'skill', 'subagent', 'note', 'recall', 'todo_write', 'web_fetch']) assert.ok(names.includes(name), 'missing tool ' + name);
  assert.ok(names.some(n => n.startsWith('job_'))); assert.ok(!names.some(n => /vote|submit_draft/.test(n)));
  assert.equal(names.filter(n => ['todo_write', 'task_map', 'todo', 'verify_link', 'tasks'].includes(n)).length, 1);
  assert.ok(payloads.every(p => p.response_format === undefined));
  assert.ok(!JSON.stringify(payloads).includes('the default fs-observation-policy requires it'));
  assert.ok(JSON.stringify(payloads).includes('Never check off a task while its tests are failing'));
  assert.ok(JSON.stringify(payloads).includes('A test the implementation cannot fail proves nothing.'));
  assert.ok(JSON.stringify(payloads).includes('PROJECT_FIXTURE')); assert.ok(JSON.stringify(payloads).includes('test-skill'));
  const memories = await api('/memories' + q); assert.ok(memories.items.some(m => m.key === 'fixture.result'));
  const compact = await api('/compact' + q, {}); assert.equal(compact.changed, true);
  const after = await api('/state' + q); assert.ok(after.frame.some(n => n.checkpoint));
  assert.ok(after.actions.surgeries); assert.ok(after.frame.filter(n => n.kind === 'user').length >= 1);
  recallRange = after.context.checkpoint;
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: id, mode: 'queue', content: [{ type: 'text', text: 'Retrieve the original fixture.' }], clientTimeZone: 'Asia/Shanghai' });
  await until(async () => { const s = await api('/state' + q); return s.running === 'idle' && s.actions.rawRecalls && !s.live; });
  assert.ok(payloads.some(p => p.messages.some(m => m.role === 'tool' && typeof m.content === 'string' && m.content.includes('ORIGINAL_FIXTURE_42'))));
  assert.ok(payloads.some(p => JSON.stringify(p.messages).includes('Working state')));
  const continued = await api('/state' + q); assert.equal(continued.tasks[0].status, 'completed');
  assert.match(continued.tasks[0].verification.result, /actual fixture.txt/);
  assert.ok(!log.includes('cannot get property'), log.replace(/token=\S+/g, 'token=[redacted]'));
});
