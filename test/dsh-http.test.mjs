import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';

async function until(fn, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await new Promise(done => setTimeout(done, 100)); }
  throw Error('Timed out waiting for integration result');
}

test('official DSH profile → plugin → native tools → memory → V3 canvas → raw recall', { timeout: 120000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'trisoul-x-dsh-')), home = join(root, 'home'), workspace = join(root, 'workspace');
  mkdirSync(home); mkdirSync(workspace); mkdirSync(join(workspace, '.agents', 'skills', 'test-skill'), { recursive: true });
  mkdirSync(join(home, 'trisoul-x'));
  writeFileSync(join(home, 'trisoul-x', 'memory.json'), JSON.stringify([
    { id: 'fixture-memory-kept', scope: 'project', project: workspace, key: 'fixture.result', text: 'Fixture result is 42.', source: 'scribe', at: 1 },
    { id: 'fixture-memory-duplicate', scope: 'project', project: workspace, key: 'fixture.duplicate', text: 'The fixture result equals 42.', source: 'scribe', at: 1 },
  ]));
  writeFileSync(join(workspace, '.agents', 'skills', 'test-skill', 'SKILL.md'), '---\nname: test-skill\ndescription: Verify a fixture.\n---\nInclude SKILL_FIXTURE in the result.\n');
  writeFileSync(join(workspace, 'verify.mjs'), 'import {readFileSync} from "node:fs";import assert from "node:assert/strict";assert.ok(readFileSync("fixture.txt","utf8").startsWith("ORIGINAL_FIXTURE_42"));console.log("VERIFIED_LEDGER_FIXTURE")');
  writeFileSync(join(workspace, 'AGENTS.md'), 'Project instruction marker: PROJECT_FIXTURE.\n');
  const payloads = [], content = 'ORIGINAL_FIXTURE_42\n' + 'source material '.repeat(600);
  let calls = 0, recallRange, recallReply, curationSignalled = false;
  const provider = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    const p = JSON.parse(body); payloads.push(p);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', created: 1, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    const tool = (name, args) => chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call-' + payloads.length, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, 'tool_calls');
    if (p.tools?.some(t => t.function.name === 'save_context')) {
      tool('save_context', { digest: 'Read the fixture. Fixture result is 42.', workdoc: JSON.stringify(p.messages).includes('Current task memo document') ? 'Fixture result is 42.' : '', phaseClosed: false, compactable: true, nowCompactable: [], signals: { overlap: !curationSignalled, conflict: false }, ops: [{ op: 'add', scope: 'project', key: 'fixture.result', text: 'Fixture result is 42.', target: '' }] });
      curationSignalled = true;
    } else if (p.tools?.some(t => t.function.name === 'save_state')) {
      tool('save_state', { pin: ['Keep the source fixture intact.'], status: 'Native tools completed.' });
    } else if (p.tools?.some(t => t.function.name === 'select_memories')) { tool('select_memories', { indexes: [0] });
    } else if (p.tools?.some(t => t.function.name === 'record_probe')) { tool('record_probe', { question: 'What is the fixture result?', expected: '42' });
    } else if (p.messages?.some(m => m.role === 'system' && m.content?.includes('You are the answerer'))) { chunk({ role: 'assistant', content: '42' }, 'stop');
    } else if (p.tools?.some(t => t.function.name === 'memory_curate')) {
      tool('memory_curate', { ops: [{ op: 'retire', scope: 'project', key: 'fixture.duplicate', target: 'fixture-memory-duplicate', text: 'Duplicate of fixture.result.' }] });
    } else if (!p.tools?.length) { chunk({ role: 'assistant', content: 'Done: inspected the fixture. Not yet done: report the result.' }, 'stop'); }
    else if (recallRange) {
      tool('recall', { query: 'original fixture', from: recallRange.from, to: recallRange.to }); recallRange = null; recallReply = true;
    } else if (recallReply) { chunk({ role: 'assistant', content: 'Original record retrieved.' }, 'stop'); }
    else if (calls++ === 0) tool('todo_write', { op: 'excerpt', from: 'Run native fixture tools.', to: 'Run native fixture tools.', tasks: [{ title: 'Write and verify the fixture.', anchor: { from: 'Run native fixture tools.', to: 'Run native fixture tools.' } }] });
    else if (calls === 2) tool('write', { file_path: 'fixture.txt', content });
    else if (calls <= 7) tool('read', { file_path: 'fixture.txt' });
    else if ([8, 10, 12].includes(calls)) chunk({ role: 'assistant', content: 'Trying to finish before the task ledger is ready.' }, 'stop');
    else if (calls === 9) tool('todo_write', { op: 'check', updates: [{ id: 'T1', done: true }] });
    else if (calls === 11) tool('verify_link', { op: 'link', links: [{ task: 'T1', kind: 'text', note: 'Read fixture.txt and observed ORIGINAL_FIXTURE_42.', reason: 'Assumed no test runner was available.' }] });
    else if (calls === 13) chunk({ role: 'assistant', content: 'Rechecked the recorded reason.' }, 'stop');
    else if (calls === 14) tool('verify_link', { op: 'link', links: [{ task: 'T1', kind: 'test', path: 'verify.mjs', cmd: 'node verify.mjs' }] });
    else if (calls === 15) tool('verify_link', { op: 'run', tasks: ['T1'] });
    else if (calls === 16) tool('present', { files: [{ path: 'fixture.txt', description: 'Verified fixture output.' }] });
    else { chunk({ role: 'assistant', content: 'Native tools completed.' }, 'stop'); }
    res.write(`data: ${JSON.stringify({ id: 'fixture', choices: [], usage: { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise(done => provider.listen(0, '127.0.0.1', done));
  const settings = { 'llm-pi-ai': { providers: { fixture: { api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'TRISOUL_X_FIXTURE_KEY', models: [{ id: 'fixture', name: 'fixture', contextWindow: 1000000, maxTokens: 16384, input: ['text'] }] } } }, 'agent-default-model': { provider: 'fixture', model: 'fixture' } };
  writeFileSync(join(home, 'settings.yaml'), JSON.stringify(settings));
  writeFileSync(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { TRISOUL_X_FIXTURE_KEY: 'fixture-key' } }), { mode: 0o600 });
  const child = spawn(process.execPath, ['scripts/start.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, DSH_HOME: home, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let complete = false;
  let log = ''; child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
  t.after(async () => {
    if (!complete) console.error('Integration diagnostics', { calls, payloads: payloads.length, log: log.slice(-7000).replace(/token=\S+/g, 'token=[redacted]') });
    if (child.exitCode === null) {
      if (process.platform === 'win32') { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {} }
      else child.kill('SIGTERM');
      if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise(r => setTimeout(r, 5000).unref())]);
    }
    provider.closeAllConnections(); await new Promise(done => provider.close(done)); rmSync(root, { recursive: true, force: true });
  });
  const bootstrap = await until(() => {
    if (child.exitCode !== null) throw Error(log.replace(/token=\S+/g, 'token=[redacted]'));
    return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];
  }, process.platform === 'win32' ? 60000 : 30000);
  const base = new URL(bootstrap).origin, login = await fetch(bootstrap, { redirect: 'manual' });
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const rpc = async (method, request) => {
    const response = await fetch(`${base}/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } } }) });
    const body = await response.json(); assert.equal(body.result?.ok, true, JSON.stringify(body)); return body.result.value;
  };
  const api = async (path, body) => { const r = await fetch(base + '/trisoul-x/api' + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const value = await r.json(); assert.ok(r.ok, JSON.stringify(value)); return value; };
  const created = await rpc('session/create', { cwd: workspace, agentPreset: 'trisoul-x' }), id = created.sessionId, q = '?session=' + id;
  const computerState = await fetch(base + '/trisoul-x/computer-use/state' + q, { headers: { cookie } });
  const computerBody = await computerState.text();
  assert.equal(computerState.status, 200, 'Computer Use routes reuse the host authenticated session: ' + computerBody);
  assert.equal(JSON.parse(computerBody).status, 'idle');
  assert.equal((await fetch(base + '/trisoul-x/computer-use/state' + q)).status, 401);
  assert.equal((await fetch(base + '/trisoul-x/computer-use/state' + q, { headers: { cookie, origin: 'https://unrelated.example' } })).status, 403);
  assert.equal((await fetch(base + '/trisoul-x/computer-use/stream' + q + '&tab=unknown')).status, 401);
  assert.equal((await fetch(base + '/trisoul-x/computer-use/stream' + q + '&tab=unknown', { headers: { cookie, origin: 'https://unrelated.example' } })).status, 403);
  assert.equal((await fetch(base + '/trisoul-x/computer-use/input' + q, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(base + '/trisoul-x/computer-use/setup' + q)).status, 401);
  assert.equal((await fetch(base + '/trisoul-x/computer-use/setup' + q, { method: 'POST', headers: { cookie, origin: 'https://unrelated.example', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'install-native' }) })).status, 403);
  const draftState = await fetch(base + '/trisoul-x/computer-use/state?session=draft-ui', { headers: { cookie } });
  assert.equal(draftState.status, 200, 'the pane can initialize before the first prompt');
  assert.deepEqual(await api('/better-todo' + q), { todo: true, verification: false });
  assert.deepEqual(await api('/better-todo' + q, { verification: true }), { todo: true, verification: true });
  const other = await rpc('session/create', { cwd: workspace, agentPreset: 'trisoul-x' });
  assert.deepEqual(await api('/better-todo?session=' + other.sessionId), { todo: true, verification: false });
  assert.equal(JSON.parse(readFileSync(join(home, 'trisoul-x', 'sessions', id + '.json'), 'utf8')).betterTodo.verification, true);
  assert.equal((await api('/scope' + q)).locked, false);
  await api('/scope' + q, { scope: 'project' });
  // This finite fixture uses short batches to exercise background work within its scripted turn.
  const updated = await api('/settings', { digestEvery: 8, stateEvery: 6, injectLimit: 1, supplementMinSteps: 1, shadowStale: 0, backgroundMode: 'unified', unifiedBackground: { provider: 'fixture', model: 'fixture', temperature: 0.2 } });
  assert.equal(updated.injectLimit, 1); assert.equal(updated.unifiedBackground.temperature, 0.2);
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: id, mode: 'queue', content: [{ type: 'text', text: 'Run native fixture tools.' }], clientTimeZone: 'Asia/Shanghai' });
  const reviewed = await until(async () => { const s = await api('/state' + q); return s.running === 'idle' && s.context?.digestCount && !s.live && s.metrics.main?.calls >= 13 && s.actions.curations && s; });
  assert.equal(reviewed.metrics.curation.calls, 1);
  assert.ok(reviewed.metrics.state.calls); assert.ok(reviewed.metrics.recall.calls);
  assert.match(reviewed.context.workdoc, /42/); assert.ok(reviewed.context.workdocVersion > 0);
  assert.ok(reviewed.contextHistory.length > 0);
  const firstFrame = reviewed.contextHistory[0];
  assert.ok(firstFrame.nodes.some(n => n.kind === '@deepseek-ai/dsh-system-prompt' && n.tokens > 0), 'request snapshot includes the committed system prompt');
  assert.ok(firstFrame.nodes.some(n => n.kind === 'user'), 'request snapshot includes the admitted user message');
  assert.equal(reviewed.contextHistory.length, payloads.filter(p => p.tools?.some(t => t.function.name === 'todo_write')).length, 'one snapshot per main request, excluding background calls');
  assert.equal(firstFrame.inputTokens, 200, 'reported input excludes response tokens');
  assert.ok(payloads.some(p => p.tools?.some(t => t.function.name === 'save_state') && p.temperature === 0.2));
  const memoryFile = JSON.parse(readFileSync(join(home, 'trisoul-x', 'memory.json'), 'utf8'));
  assert.equal(memoryFile.find(m => m.id === 'fixture-memory-duplicate').retiredReason, 'Duplicate of fixture.result.');
  assert.ok(payloads.some(p => p.tools?.some(t => t.function.name === 'memory_curate') && JSON.stringify(p.messages).includes('fixture-memory-duplicate')));
  assert.equal(reviewed.tasks[0].links[0].asked, true);
  assert.equal(reviewed.frame.filter(n => n.kind === 'trisoul-x:task-review').length, 1);
  const firstTurn = JSON.stringify(payloads.filter(p => p.tools?.some(t => t.function.name === 'verify_link')).map(p => p.messages));
  for (const reminder of ['[todo list] Unresolved tasks remain:', '[todo list] Every task is checked off, but these lack qualifying evidence:', '[todo list] Tasks whose only evidence is a text record:', 'Re-check each reason against what is actually available here.']) assert.ok(firstTurn.includes(reminder), reminder);
  assert.deepEqual(await api('/better-todo' + q, { verification: false }), { todo: true, verification: false });
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: id, mode: 'queue', content: [{ type: 'text', text: 'Run the real verification command now.' }], clientTimeZone: 'Asia/Shanghai' });
  const state = await until(async () => { const s = await api('/state' + q); return s.running === 'idle' && !s.live && s.tasks[0]?.links.some(l => l.kind === 'test' && l.lastRun?.pass) && s; });
  assert.equal(readFileSync(join(workspace, 'fixture.txt'), 'utf8'), content);
  assert.equal((await api('/scope' + q)).scope, 'project'); assert.equal((await api('/scope' + q)).locked, true);
  const locked = await fetch(base + '/trisoul-x/api/scope' + q, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope: 'full' }) }); assert.equal(locked.status, 409);
  await api('/settings', { memoryScope: 'full' }); assert.equal((await api('/scope' + q)).scope, 'project');
  assert.ok(state.actions.injections); assert.ok(state.metrics.background.calls);
  assert.equal(state.tasks.length, 1); assert.equal(state.tasks[0].status, 'completed');
  const testLink = state.tasks[0].links.find(l => l.kind === 'test');
  assert.equal(testLink.lastRun.pass, true); assert.match(testLink.lastRun.tail, /VERIFIED_LEDGER_FIXTURE/);
  assert.equal(state.tasks[0].id, 'T1'); assert.equal(state.tasks[0].source, 'Run native fixture tools');
  const names = payloads.find(p => p.tools?.some(t => t.function.name === 'read')).tools.map(t => t.function.name);
  const mainRequests = payloads.filter(p => p.tools?.some(t => t.function.name === 'todo_write'));
  assert.equal(mainRequests[0].messages[0].role, 'system', 'startup injections must follow the system prompt');
  assert.ok(mainRequests[0].messages[0].content.startsWith('You are trisoul_x.'));
  for (let i = 1; i < mainRequests.length; i++) {
    assert.equal(mainRequests[i].messages[0].role, 'system');
    assert.equal(mainRequests[i].messages[0].content, mainRequests[0].messages[0].content);
    assert.deepEqual(mainRequests[i].messages.slice(0, mainRequests[i - 1].messages.length), mainRequests[i - 1].messages, 'normal steps preserve the previous request prefix');
  }
  for (const name of ['read', 'write', 'edit', 'glob', 'grep', process.platform === 'win32' ? 'pwsh' : 'bash', 'skill', 'subagent', 'note', 'recall', 'todo_write', 'verify_link', 'web_fetch', 'present']) assert.ok(names.includes(name), 'missing tool ' + name);
  assert.ok(payloads.some(p => p.messages.some(m => m.role === 'tool' && typeof m.content === 'string' && m.content.includes('Presented fixture.txt'))));
  assert.ok(names.some(n => n.startsWith('job_'))); assert.ok(!names.some(n => /vote|submit_draft/.test(n)));
  assert.deepEqual(names.filter(n => ['todo_write', 'task_map', 'todo', 'verify_link', 'tasks'].includes(n)).sort(), ['todo_write', 'verify_link']);
  assert.ok(payloads.every(p => p.response_format === undefined));
  assert.ok(!JSON.stringify(payloads).includes('the default fs-observation-policy requires it'));
  assert.ok(JSON.stringify(payloads).includes('Never check off a task while its tests are failing'));
  assert.ok(JSON.stringify(payloads).includes('A test the implementation cannot fail proves nothing.'));
  assert.ok(JSON.stringify(payloads).includes('PROJECT_FIXTURE')); assert.ok(JSON.stringify(payloads).includes('test-skill'));
  const memories = await api('/memories' + q); assert.ok(memories.items.some(m => m.key === 'fixture.result'));
  const compact = await api('/compact' + q, {}); assert.equal(compact.changed, true);
  const after = await until(async () => { const s = await api('/state' + q); return s.context?.probe && !s.live && s; });
  assert.equal(after.context.probe.ok, true, JSON.stringify(after.context.probe)); assert.equal(after.actions.probePassed, 1); assert.ok(after.frame.some(n => n.checkpoint));
  assert.ok(after.actions.surgeries); assert.ok(after.frame.filter(n => n.kind === 'user').length >= 1);
  recallRange = after.context.checkpoint;
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: id, mode: 'queue', content: [{ type: 'text', text: 'Retrieve the original fixture.' }], clientTimeZone: 'Asia/Shanghai' });
  await until(async () => { const s = await api('/state' + q); return s.running === 'idle' && s.actions.rawRecalls && !s.live; });
  assert.ok(payloads.some(p => p.messages.some(m => m.role === 'tool' && typeof m.content === 'string' && m.content.includes('ORIGINAL_FIXTURE_42'))));
  assert.ok(payloads.some(p => JSON.stringify(p.messages).includes('Working state')));
  const continued = await api('/state' + q); assert.equal(continued.tasks[0].status, 'completed');
  for (const p of payloads.filter(p => p.tools?.some(t => t.function.name === 'todo_write'))) {
    assert.equal(p.messages[0].role, 'system', 'compaction keeps the system role');
    assert.equal(p.messages[0].content, mainRequests[0].messages[0].content, 'compaction does not rewrite the system text');
  }
  const continuedTest = continued.tasks[0].links.find(l => l.kind === 'test');
  assert.equal(continued.taskRelease.tested, 1);
  await api('/memories' + q, { op: 'add', scope: 'project', key: 'manual.test', text: 'User-created fact.' });
  let manual = (await api('/memories' + q)).items.find(m => m.key === 'manual.test');
  await api('/memories' + q, { op: 'update', target: manual.id, text: 'Edited fact.' });
  await api('/memories' + q, { op: 'delete', target: manual.id });
  const managed = await api('/memories' + q); assert.ok(!managed.items.some(m => m.id === manual.id)); assert.ok(managed.health.active > 0);
  assert.equal(continuedTest.lastRun.pass, true); assert.match(continuedTest.lastRun.tail, /VERIFIED_LEDGER_FIXTURE/);
  assert.ok(!log.includes('cannot get property'), log.replace(/token=\S+/g, 'token=[redacted]'));
  complete = true;
});
