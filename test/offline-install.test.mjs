import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareOffline } from '../scripts/prepare-offline.mjs';
import { checkLinks } from '../scripts/check-offline.mjs';
import { stopFixtureProcess } from './fixtures/process.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const cli = process.env.OMD_DSH_CLI || join(repo, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
async function until(fn, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Offline installation fixture timed out');
}

test('prepared directory relocates, installs through the native manager offline, runs tools and survives restart', { timeout: 300000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-offline-install-'));
  const pkg = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
  const artifacts = process.env.OMD_OFFLINE_ARTIFACTS;
  const prepared = join(root, 'prepared'), moved = artifacts
    ? join(artifacts, `oh-my-dsh-${pkg.version}-${process.platform}-${process.arch}`) : join(root, 'relocated');
  const home = join(root, 'home'), cwd = join(root, 'workspace');
  let ownsMoved = false;
  for (const path of [home, cwd]) await mkdir(path);
  let child, log = '', base, cookie;
  const registryRequests = [];
  const registry = createServer((req, res) => { registryRequests.push(req.url); res.writeHead(503); res.end('No network available'); });
  const provider = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    const delta = payload.messages.at(-1).role === 'tool' ? { content: 'Offline fixture complete.' } : {
      tool_calls: [{ index: 0, id: 'offline-task', type: 'function', function: { name: 'todo_write', arguments: JSON.stringify({
        op: 'excerpt', from: 'Keep the original requirement.', to: 'Keep the original requirement.',
        tasks: [{ title: 'Keep the original requirement.', anchor: { from: 'Keep the original requirement.', to: 'Keep the original requirement.' } }],
      }) } }],
    };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: ' + JSON.stringify({ id: 'offline', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', ...delta }, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n');
  });
  for (const server of [registry, provider]) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (child) await stopFixtureProcess(child);
    for (const server of [registry, provider]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (!t.passed) t.diagnostic(log.replace(/token=\S+/g, 'token=[redacted]'));
    if (ownsMoved && (!t.passed || !artifacts)) await rm(moved, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });
  await prepareOffline(prepared);
  if (artifacts) await mkdir(artifacts, { recursive: true });
  if (existsSync(moved)) throw new Error('Refusing to overwrite an existing offline artifact: ' + moved);
  ownsMoved = true;
  // CI prepares on C: and retains artifacts on D: on Windows. Copy instead
  // of rename, then remove the original before exercising the actual host.
  await cp(prepared, moved, { recursive: true, errorOnExist: true, force: false });
  await rm(prepared, { recursive: true, force: true });
  assert.deepEqual(checkLinks(moved, true), []);
  assert.equal(JSON.parse(await readFile(join(moved, 'offline-manifest.json'), 'utf8')).platform, process.platform);
  const env = { ...process.env, DSH_HOME: home, npm_config_offline: 'true', npm_config_fetch_retries: '0',
    npm_config_registry: `http://127.0.0.1:${registry.address().port}`, CODEGRAPH_NO_DOWNLOAD: '1' };
  delete env.DSH_PERMISSION_MODE;
  const runCli = args => execFileSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8', timeout: 120000 });
  execFileSync(process.execPath, ['scripts/check-offline.mjs'], { cwd: moved, env, stdio: 'pipe', timeout: 30000 });
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/c', 'check-offline.cmd'], { cwd: moved, env, stdio: 'pipe', timeout: 30000 });
  }
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({
    'trisoul-x': { componentAutoSetup: false, backgroundTasksEnabled: false },
    'agent-default-model': { provider: 'fixture', model: 'fixture' },
    'llm-pi-ai': { providers: { fixture: { api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'OFFLINE_FIXTURE', models: [{ id: 'fixture', contextWindow: 1000000, maxTokens: 1024, input: ['text'] }] } } },
  }));
  await writeFile(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { OFFLINE_FIXTURE: 'fixture-only' } }), { mode: 0o600 });
  runCli(['--profile', 'web', '--dump-config']);
  await writeFile(join(home, 'profiles/web/.npmrc'), `registry=http://127.0.0.1:${registry.address().port}\noffline=true\nfetch-retries=0\n`);
  const boot = async () => {
    log = '';
    child = spawn(process.execPath, [cli, '--profile', 'web', '--no-open', '--port', '0'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { log += chunk; }); child.stderr.on('data', chunk => { log += chunk; });
    const url = await until(() => {
      if (child.exitCode !== null) throw new Error(log.replace(/token=\S+/g, 'token=[redacted]'));
      return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];
    });
    base = new URL(url).origin;
    const response = await fetch(url, { redirect: 'manual' }); cookie = response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  };
  const rpc = async (method, args = {}) => {
    const response = await fetch(base + '/api/' + method, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }) });
    const result = await response.json(); assert.equal(result.result?.ok, true, JSON.stringify(result)); return result.result.value;
  };
  const state = async session => (await fetch(`${base}/trisoul-x/api/state?session=${session}`, { headers: { cookie } })).json();
  await boot();
  await until(async () => (await rpc('llm/listProviders')).some(p => p.id === 'fixture'));
  const installed = await rpc('pluginManager/installBundle', { spec: 'link:' + moved });
  assert.equal(installed.bundle, 'trisoul_x', JSON.stringify(installed));
  assert.ok(['applied', 'restart-required'].includes(installed.application), JSON.stringify(installed));
  await stopFixtureProcess(child); child = undefined;
  await boot();
  assert.doesNotMatch(log, /failed to import/);
  const { sessionId } = await rpc('session/create', { request: { cwd, agentPreset: 'trisoul-x' } });
  await rpc('session/prompt', { request: { sessionId, requestId: crypto.randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'Keep the original requirement.' }] } });
  const completed = await until(async () => { const value = await state(sessionId); return value.tasks?.length && value.running === 'idle' && value; });
  assert.equal(completed.tasks[0].source, 'Keep the original requirement');
  await stopFixtureProcess(child); child = undefined;
  await boot();
  await rpc('session/create', { request: { cwd, agentPreset: 'trisoul-x', sessionId } });
  assert.equal((await state(sessionId)).tasks[0].source, 'Keep the original requirement');
  assert.deepEqual(registryRequests, [], 'local linking and activation make no dependency registry requests');
});
