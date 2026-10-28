// Drive the actual web host through its public session API, with no UI automation.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { verifyCode } from './verify-code.mjs';

const root = '/opt/omd', logs = '/logs/agent';
await mkdir(logs, { recursive: true });
const selection = JSON.parse(await readFile(root + '/selection.json', 'utf8'));
const expected = JSON.parse(await readFile(root + '/expected-config.json', 'utf8'));
const verifiedPluginFiles = await verifyCode(root + '/code-manifest.json', root + '/runtime/node_modules');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let bootstrap, output = '', exited = false, sessionId, cookie, origin;
const host = spawn(root + '/bin/node', [root + '/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js',
  '--profile', 'eval', '--no-open', '--port', '0'], {
  cwd: '/app', detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PATH: `${root}/bin:${root}/runtime/node_modules/.bin:${process.env.PATH}`,
    DSH_HOME: root + '/home', OMD_DEEPSWE: '1', NODE_USE_ENV_PROXY: '1' },
});
const redact = text => text.replace(/token=[\w-]+/g, 'token=[redacted]');
const collect = chunk => {
  const raw = String(chunk);
  output += redact(raw);
  appendFileSync(logs + '/host.log', redact(raw));
  bootstrap ??= raw.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];
};
host.stdout.on('data', collect); host.stderr.on('data', collect);
host.on('exit', () => { exited = true; });
host.on('error', error => { output += String(error); exited = true; });
const check = () => { if (exited) throw Error('DSH exited: ' + output.slice(-5000)); };
async function request(path, body) {
  check();
  let response;
  try {
    response = await fetch(origin + path, { headers: { cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), signal: AbortSignal.timeout(180000) });
  } catch (error) { throw Error(path + ': ' + error.message, { cause: error }); }
  const text = await response.text();
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}: ${text.slice(0,1000)}`);
  return JSON.parse(text);
}
async function rpc(method, payload) {
  const result = await request('/api/' + method, { type: 'client-request', rpcId: randomUUID(), method, payload: { args: { request: payload } } });
  if (!result.result?.ok) throw Error(method + ': ' + JSON.stringify(result));
  return result.result.value;
}
async function stop() {
  if (!exited) { try { process.kill(-host.pid, 'SIGTERM'); } catch {} }
  for (let i = 0; i < 30 && !exited; i++) await sleep(100);
  // Kill the process group as well: tools can outlive the host process.
  try { process.kill(-host.pid, 'SIGKILL'); } catch {}
  await writeFile(logs + '/host.log', output);
}
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  if (stopping) return; stopping = true; await stop(); process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
});
try {
  for (let i = 0; i < 1200 && !bootstrap; i++) { check(); await sleep(100); }
  if (!bootstrap) throw Error('DSH bootstrap timed out: ' + output.slice(-5000));
  origin = new URL(bootstrap).origin;
  const login = await fetch(bootstrap, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  if (!cookie) throw Error('DSH authentication cookie missing');
  console.log('Authenticated isolated DSH');
  const workspace = await rpc('workspace/create', { path: '/app' });
  console.log('Workspace registered');
  const session = await rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: selection.preset });
  console.log('Session created with preset ' + session.agentPreset);
  sessionId = session.sessionId;
  if (session.agentPreset !== selection.preset) throw Error('Incorrect agent preset: ' + JSON.stringify(session));
  await rpc('session/selectModel', { sessionId, ...selection.model });
  console.log('Model selected');
  const state = await request('/oh-my-dsh/api/state?session=' + sessionId);
  await writeFile(logs + '/effective-config.json', JSON.stringify(state.config, null, 2));
  if (!isDeepStrictEqual(state.config, expected)) throw Error('OMD effective configuration differs from the captured desktop configuration');
  await writeFile(logs + '/selection.json', JSON.stringify({ ...selection, sessionId, configurationVerified: true, verifiedPluginFiles }, null, 2));
  const prompt = await readFile(root + '/instruction.md', 'utf8');
  await rpc('session/prompt', { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: prompt }], clientTimeZone: 'UTC' });
  const deadline = Date.now() + Number(process.env.OMD_EVAL_TIMEOUT_SEC || 10800) * 1000;
  let active = false, settled = 0;
  while (Date.now() < deadline) {
    await sleep(1000);
    const snapshot = await request('/oh-my-dsh/api/state?session=' + sessionId + '&view=summary');
    active ||= snapshot.running !== 'idle';
    if (!active) active = (await readFile(logs + '/events.jsonl', 'utf8').catch(() => '')).includes('model/route');
    settled = active && snapshot.running === 'idle' && !snapshot.liveCalls?.length ? settled + 1 : 0;
    if (settled >= 3) {
      const events = await readFile(logs + '/events.jsonl', 'utf8');
      const records = events.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      const routes = records.filter(r => r.type === 'model/route');
      if (routes.some(r => r.provider !== selection.model.provider || r.model !== selection.model.model)) {
        throw Error('Unexpected model route in evaluation (see events.jsonl)');
      }
      if (records.some(r => r.type === 'agent/error')) throw Error('DSH agent failed (see events.jsonl)');
      const finalState = await request('/oh-my-dsh/api/state?session=' + sessionId);
      if (!isDeepStrictEqual(finalState.config, expected)) throw Error('OMD configuration changed during the evaluation');
      await verifyCode(root + '/code-manifest.json', root + '/runtime/node_modules');
      const usage = await request('/oh-my-dsh/api/monitor?session=' + sessionId + '&range=all&view=usage');
      await writeFile(logs + '/summary.json', JSON.stringify({ sessionId, snapshot, usage, modelCalls: routes.length, completed: true }, null, 2));
      console.log(JSON.stringify({ completed: true, sessionId, modelCalls: routes.length }));
      break;
    }
  }
  if (settled < 3) { await rpc('session/cancel', { sessionId }).catch(() => {}); throw Error('OMD agent timeout'); }
} finally { await stop(); }
