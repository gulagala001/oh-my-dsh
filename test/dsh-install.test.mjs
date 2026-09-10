import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import WebSocket from 'ws';

const repo = fileURLToPath(new URL('../', import.meta.url));
const cli = join(repo, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
async function until(fn, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await new Promise(r => setTimeout(r, 100)); }
  throw Error('Timed out waiting for stock installation fixture');
}

test('install into stock web, coexist with stock presets, switch both ways and resume', { timeout: 240000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'trisoul x stock-')), home = join(root, 'home'), cwd = join(root, 'workspace');
  const pkg = mkdtempSync(join(tmpdir(), 'trisoul-x-package-'));
  for (const path of [home, cwd]) mkdirSync(path);
  const manifest = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  for (const file of ['package.json', ...manifest.files]) cpSync(join(repo, file), join(pkg, file), { recursive: true });
  const env = { ...process.env, DSH_HOME: home }; delete env.DSH_PERMISSION_MODE;
  const runCli = args => execFileSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8', stdio: 'pipe', timeout: 120000 });
  const payloads = [];
  const provider = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    const p = JSON.parse(body); payloads.push(p);
    const todo = p.tools?.find(t => t.function.name === 'todo_write')?.function;
    const x = Boolean(todo?.parameters.properties.op);
    const tool = (name, args) => ({ tool_calls: [{ index: 0, id: 'call-' + payloads.length, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
    const last = p.messages.at(-1);
    const delta = !todo || last.role === 'tool' ? { content: 'Fixture complete.' }
      : x ? tool('todo_write', JSON.stringify(last).includes('Inspect retained tasks') ? { op: 'view' } : { op: 'excerpt', from: 'Keep the original requirement.', to: 'Keep the original requirement.', tasks: [{ title: 'Keep the original requirement.', anchor: { from: 'Keep the original requirement.', to: 'Keep the original requirement.' } }] })
      : tool('todo_write', { todos: [{ content: 'Stock fixture task', status: 'completed' }] });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', ...delta }, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: 'fixture', choices: [], usage: { prompt_tokens: 200, completion_tokens: 10, total_tokens: 210 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise(r => provider.listen(0, '127.0.0.1', r));
  const settings = JSON.stringify({ 'agent-default-model': { provider: 'fixture', model: 'fixture' }, 'llm-pi-ai': { providers: { fixture: { api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'FIXTURE_KEY', models: [{ id: 'fixture', name: 'fixture', contextWindow: 1000000, maxTokens: 1024, input: ['text'] }] } } } });
  const credentials = JSON.stringify({ version: 1, refs: { FIXTURE_KEY: 'fixture-only' } });
  writeFileSync(join(home, 'settings.yaml'), settings);
  writeFileSync(join(home, '.credentials.yaml'), credentials, { mode: 0o600 });
  let child, log = '', base, cookie, complete = false;
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    if (process.platform === 'win32') { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {} }
    else child.kill('SIGTERM');
    if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise(r => setTimeout(r, 5000).unref())]);
  };
  t.after(async () => {
    await stop(); provider.closeAllConnections(); await new Promise(r => provider.close(r));
    if (!complete) console.error(log.slice(-8000).replace(/token=\S+/g, 'token=[redacted]'));
    rmSync(root, { recursive: true, force: true });
    rmSync(pkg, { recursive: true, force: true });
  });
  const boot = async () => {
    log = '';
    child = spawn(process.execPath, [cli, 'web', '--no-open', '--port', '0'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', b => { log += b; }); child.stderr.on('data', b => { log += b; });
    const url = await until(() => {
      if (child.exitCode !== null) throw Error(log.replace(/token=\S+/g, 'token=[redacted]'));
      return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];
    }, process.platform === 'win32' ? 60000 : 30000);
    base = new URL(url).origin;
    const login = await fetch(url, { redirect: 'manual' }); cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  };
  const request = (method, args, signal) => fetch(`${base}/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }), signal });
  const rpc = async (method, args) => { const body = await (await request(method, args)).json(); assert.equal(body.result?.ok, true, JSON.stringify(body)); return body.result.value; };
  const create = (agentPreset, sessionId) => rpc('session/create', { request: { cwd, agentPreset, sessionId } });
  const select = (id, agentPreset) => rpc('agentPresets/select', { agentId: id, agentPreset });
  const snapshot = async id => {
    const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/remote.mux', { headers: { Cookie: cookie, Origin: base } });
    try {
      await once(socket, 'open');
      const incoming = once(socket, 'message');
      socket.send(JSON.stringify({ type: 'open', streamId: crypto.randomUUID(), endpoint: 'session/follow', payload: { args: { request: { address: { kind: 'session', sessionId: id }, maxMessages: 100 } } } }));
      const data = JSON.parse((await incoming)[0].toString());
      assert.equal(data.type, 'item', JSON.stringify(data));
      assert.equal(data.value.type, 'snapshot'); return data.value;
    } finally { socket.close(); }
  };
  const prompt = async (id, text, turn) => {
    await rpc('session/prompt', { request: { sessionId: id, requestId: crypto.randomUUID(), mode: 'queue', content: [{ type: 'text', text }] } });
    return until(async () => { const s = await snapshot(id); return s.records.some(r => r.event?.type === 'turn/end' && r.event.data.turn === turn) && s; });
  };
  const api = async (path, value) => (await fetch(base + '/trisoul-x/api' + path, value === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })).json();

  await boot();
  const old = await create('standard');
  const oldSnapshot = await prompt(old.sessionId, 'Run the stock todo fixture.', 1);
  assert.equal(oldSnapshot.projections.values.todos[0].status, 'completed');
  await stop();
  const settingsBefore = readFileSync(join(home, 'settings.yaml'), 'utf8'), credentialsBefore = readFileSync(join(home, '.credentials.yaml'), 'utf8');
  // CI exercises the public GitHub installation command at the exact tested
  // commit; local runs install the uncommitted package contents. Keep the local
  // source path space-free for DSH's Windows pnpm forwarder, while the profile
  // and installed package still live under the spaced test path.
  const source = process.env.GITHUB_REPOSITORY && process.env.GITHUB_SHA
    ? `github:${process.env.GITHUB_REPOSITORY}#${process.env.GITHUB_SHA}` : `file:${pkg}`;
  runCli(['plugin', '--profile', 'web', 'add', source]);
  assert.ok(readFileSync(join(home, 'settings.yaml'), 'utf8') === settingsBefore, 'installation preserves model settings');
  assert.ok(readFileSync(join(home, '.credentials.yaml'), 'utf8') === credentialsBefore, 'installation preserves credentials');

  await boot();
  await create('standard', old.sessionId); // Existing stock sessions mount first.
  const blank = await create('standard');
  for (const preset of ['trisoul-x', 'ptc', 'trisoul-x', 'cordis', 'trisoul-x', 'standard', 'trisoul-x']) assert.equal(await select(blank.sessionId, preset), preset);
  await api('/better-todo?session=' + blank.sessionId, { todo: false, verification: false });
  let xSnapshot = await prompt(blank.sessionId, 'Keep the original requirement.', 1);
  assert.equal(xSnapshot.projections.values.agentPreset, 'trisoul-x');
  assert.equal(xSnapshot.projections.values.todos[0].content, 'Keep the original requirement.');
  let state = await api('/state?session=' + blank.sessionId);
  assert.equal(state.tasks[0].source, 'Keep the original requirement');
  assert.ok(state.contextHistory.length, 'X monitoring follows the selected preset, not the original header');
  xSnapshot = await prompt(blank.sessionId, 'Inspect retained tasks.', 2);
  assert.equal(xSnapshot.projections.values.todos[0].content, 'Keep the original requirement.', 'task dock survives the next turn');
  const returned = await create('trisoul-x');
  await select(returned.sessionId, 'standard');
  await prompt(returned.sessionId, 'Run the stock todo fixture after switching back.', 1);
  state = await api('/state?session=' + returned.sessionId);
  assert.equal(state.contextHistory.length, 0, 'stock sessions do not run X hooks after switching back');
  const stockRequest = payloads.findLast(p => p.tools?.find(t => t.function.name === 'todo_write')?.function.parameters.properties.todos);
  assert.ok(stockRequest);
  assert.ok(!JSON.stringify(stockRequest.messages).includes('[todo list]'), 'X adds no task reminder to the stock session');
  assert.ok(payloads.some(p => p.tools?.find(t => t.function.name === 'todo_write')?.function.parameters.properties.op));
  const legacy = await snapshot(old.sessionId);
  assert.deepEqual(legacy.projections.values.todos, oldSnapshot.projections.values.todos);

  await stop(); await boot();
  await create('trisoul-x', blank.sessionId); // Reverse the standing-mount order after restart.
  const reverse = await create('trisoul-x');
  for (const preset of ['standard', 'trisoul-x', 'cordis', 'ptc', 'trisoul-x']) assert.equal(await select(reverse.sessionId, preset), preset);
  state = await api('/state?session=' + blank.sessionId);
  assert.equal(state.tasks[0].source, 'Keep the original requirement');
  assert.ok(!log.includes('refusing to share'), log.replace(/token=\S+/g, 'token=[redacted]'));
  await stop();
  runCli(['plugin', '--profile', 'web', 'remove', 'trisoul_x']);
  await boot();
  await create('standard', old.sessionId);
  assert.deepEqual((await snapshot(old.sessionId)).projections.values.todos, oldSnapshot.projections.values.todos, 'uninstall leaves stock history readable');
  complete = true;
});
