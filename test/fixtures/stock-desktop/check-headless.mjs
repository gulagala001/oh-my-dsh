import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSimulationProvider } from '../../../scripts/simulator/provider.mjs';

const [cli, root] = process.argv.slice(2);
assert(cli && root);
const home = resolve(root, 'dsh-home'), cwd = resolve(root, 'workspace');
const profile = 'omd-unharnessed';
const windows = process.platform === 'win32';
assert.equal(process.env.DSH_HOME, home);
const env = { ...process.env, OMD_FIXTURE_API_KEY: 'stock-fixture-only' };
const finals = ['Python stored 37.', 'Python restored 42.'];
let mainRequests = 0;

const provider = await createSimulationProvider({ respond(body) {
  if (!body.tools?.length) {
    const context = body.messages.map(message => JSON.stringify(message.content).slice(0, 185)).join(' ');
    assert.match(context, /title|标题/i);
    return [{ delta: { role: 'assistant', content: 'Python checkpoint' } }, { finish_reason: 'stop' }];
  }
  assert.deepEqual(body.tools.map(tool => tool.function.name), ['ipython']);
  assert.match(JSON.stringify(body.messages[0]), /You are Unharnessed/);
  const step = mainRequests++;
  if (step % 2 === 0) {
    const code = step === 0 ? 'saved_value = 37\nprint(saved_value)' : 'print(saved_value + 5)';
    return [
      { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_fixture_' + step, type: 'function',
        function: { name: 'ipython', arguments: JSON.stringify({ code }) } }] } },
      { finish_reason: 'tool_calls' },
    ];
  }
  const tool = body.messages.findLast(message => message.role === 'tool');
  assert.match(JSON.stringify(tool), step === 1 ? /37/ : /42/);
  assert.doesNotMatch(JSON.stringify(tool), /NameError|PermissionError|POLICY_DENIED/);
  return [{ delta: { role: 'assistant', content: finals[(step - 1) / 2] } }, { finish_reason: 'stop' }];
} });
const pids = [];
try {
  await mkdir(cwd, { recursive: true });
  const profileDir = resolve(home, 'profiles', profile);
  const manifest = JSON.parse(await readFile(resolve(profileDir, 'package.json'), 'utf8'));
  assert(manifest.dsh.profile.bundles.includes('oh-my-dsh'));
  const installed = JSON.parse(await readFile(resolve(profileDir, 'node_modules/oh-my-dsh/package.json'), 'utf8'));
  assert.equal(installed.version, '0.2.2-rc.5.omd.1.9.4');
  await writeFile(resolve(profileDir, 'cordis.patch.yml'), JSON.stringify([
    { id: 'llm-pi-ai', config: { providers: { fixture: { api: 'openai-completions', baseURL: provider.baseURL,
      apiKeyEnv: 'OMD_FIXTURE_API_KEY', models: [{ id: 'fixture-model', name: 'Fixture', contextWindow: 100000, maxTokens: 4000, input: ['text', 'image'] }] } } } },
    { id: 'agent-default-model', config: { provider: 'fixture', model: 'fixture-model' } },
    { id: 'oh-my-dsh', config: { componentAutoSetup: false, computerUseEnabled: false, codegraphEnabled: false,
      backgroundTasksEnabled: false, dreamAutoEnabled: false, projectlessWorkspaceRoot: resolve(root, 'projectless') } },
  ]));
  async function run(mode, args) {
    const argv = ['--profile', profile, '--json', ...args];
    const options = { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] };
    if (windows) assert([cli, ...argv].every(arg => !/["%&|<>^!\r\n]/.test(arg)));
    const child = windows
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', '"' + [cli, ...argv].map(arg => '"' + arg + '"').join(' ') + '"'],
        { ...options, windowsVerbatimArguments: true, windowsHide: true })
      : spawn(cli, argv, options);
    pids.push(child.pid);
    const stdout = [], stderr = [];
    child.stdout.on('data', value => stdout.push(value));
    child.stderr.on('data', value => stderr.push(value));
    let forced;
    const timer = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      if (!windows) { child.kill('SIGINT'); return; }
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T'], { windowsHide: true, timeout: 5000 });
      forced = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null)
          spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
      }, 5000);
    }, 70000);
    let code;
    try { [code] = await once(child, 'close'); } finally { clearTimeout(timer); clearTimeout(forced); }
    const out = Buffer.concat(stdout).toString(), err = Buffer.concat(stderr).toString();
    await writeFile(resolve(root, mode + '.jsonl'), out);
    await writeFile(resolve(root, mode + '.stderr.log'), err);
    assert.equal(code, 0, err.split('\n').slice(-15).join('\n'));
    const events = out.trim().split(/\r?\n/).map(line => JSON.parse(line));
    assert.equal(events[0].type, 'session');
    assert.equal(events.at(-1).type, 'final');
    assert.ok(JSON.stringify(events.at(-1)).includes(finals[mode === 'first' ? 0 : 1]));
    return events[0].sessionId;
  }
  const sessionId = await run('first', ['Save 37 in a Python variable.']);
  assert.match(sessionId, /^session-[\w-]+$/);
  assert.equal(await run('resume', ['--session-id', sessionId, 'Print the saved Python variable plus five.']), sessionId);
  assert.equal(mainRequests, 4);
  provider.assertHealthy();
  console.log('Stock DSH headless installed the candidate, used only ipython, and restored the Python checkpoint across two processes.');
} finally {
  await provider.close();
  await writeFile(resolve(root, 'fixture-pids.json'), JSON.stringify(pids));
}
