import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';

async function until(fn, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await fn(); if (result) return result; await new Promise(r => setTimeout(r, 100)); }
  throw Error('Timed out waiting for neutral environment fixture');
}
const redactLog = value => value.replace(/token=\S+/g, 'token=[redacted]');
const forbidden = /powered by DeepSeek Harness|through the DeepSeek Harness Web GUI|The DeepSeek Harness implementation checkout|Current DSH file policy:|[Tt]he DSH file sandbox|TriSoulX conversation interface|only dsh web injects window\.__DSH_BOOT__/;
for (const mode of ['native', 'ptc', 'both']) test(`actual provider payloads: neutral environment in ${mode} mode`, { timeout: 180000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'neutral-env-')), home = join(root, 'home'), workspace = join(root, 'workspace');
  mkdirSync(home); mkdirSync(workspace);
  writeFileSync(join(workspace, 'AGENTS.md'), 'PROJECT_LITERAL: Keep the text DeepSeek Harness and DSH unchanged.\n');
  writeFileSync(join(workspace, 'ptc-input.txt'), 'PTC_TYPED_READ\n');
  const payloads = [], delegated = new Set(); let child, log = '', complete = false, failureDiagnostics = false;
  let ptcIssued = false, bothNativeIssued = false;
  const provider = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    const p = JSON.parse(body); payloads.push(p);
    const user = p.messages.filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
    const childCall = user.includes('NEUTRAL_CHILD_ONLY');
    const marker = user.includes('NEUTRAL_FORK_MAIN') ? 'fork' : user.includes('NEUTRAL_SPAWN_MAIN') ? 'spawn' : null;
    const name = marker === 'fork' ? 'subagent_fork' : 'subagent';
    let delta = { role: 'assistant', content: 'Fixture finished.' }, finish = 'stop';
    if (mode !== 'native' && p.tools?.length && user.includes('NEUTRAL_MAIN') && !ptcIssued) {
      ptcIssued = true; finish = 'tool_calls';
      const shell = process.platform === 'win32' ? 'pwsh' : 'bash';
      const shellCommand = process.platform === 'win32' ? "[Console]::Out.Write('PTC_EXECUTED'); exit 7" : 'printf PTC_EXECUTED; exit 7';
      const code = `const file = await tools.read({ file_path: ${JSON.stringify(join(workspace, 'ptc-input.txt'))} });
        const command = await tools.${shell}({ command: ${JSON.stringify(shellCommand)}, description: 'Check structured process outcome', workdir: ${JSON.stringify(workspace)} });
        let missingToolName;
        try { await tools.read({ file_path: ${JSON.stringify(join(workspace, 'missing.txt'))} }); }
        catch (error) { if (!(error instanceof ToolCallError)) throw error; missingToolName = error.toolName; }
        return { text: file.lines.map(line => line.text).join(''), exitCode: command.exitCode,
          stdout: command.stdout.text, missingToolName };`;
      delta = { role: 'assistant', tool_calls: [{ index: 0, id: 'ptc-fixture', type: 'function', function: { name: 'run_code', arguments: JSON.stringify({ code, description: 'Verify PTC calls and canonical results' }) } }] };
    } else if (mode === 'both' && p.tools?.length && user.includes('NEUTRAL_MAIN') && !bothNativeIssued) {
      bothNativeIssued = true; finish = 'tool_calls';
      delta = { role: 'assistant', tool_calls: [{ index: 0, id: 'native-fixture', type: 'function', function: { name: 'read', arguments: JSON.stringify({ file_path: join(workspace, 'ptc-input.txt') }) } }] };
    }
    if (mode === 'native' && p.tools?.length && marker && !childCall && !delegated.has(marker)) {
      assert.ok(p.tools.some(t => t.function.name === name), 'delegation tool missing');
      delegated.add(marker); finish = 'tool_calls';
      delta = { role: 'assistant', tool_calls: [{ index: 0, id: 'neutral-' + payloads.length, type: 'function', function: { name, arguments: JSON.stringify({ description: 'Verify neutral child environment', prompt: 'NEUTRAL_CHILD_ONLY ' + marker + '. Read the supplied context; do not use tools.', description: 'Inspect the isolated environment fixture', run_in_background: false }) } }] };
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta, finish_reason: finish }] })}

`);
    res.write(`data: ${JSON.stringify({ id: 'fixture', choices: [], usage: { prompt_tokens: 200, completion_tokens: 10, total_tokens: 210 } })}

`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise(r => provider.listen(0, '127.0.0.1', r));
  const identity = 'You are zcode\n\nYou are an interactive agent that helps users with software engineering tasks.';
  const settings = { 'llm-pi-ai': { providers: { fixture: { api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'NEUTRAL_FIXTURE_KEY', models: [{ id: 'fixture', name: 'fixture', contextWindow: 1000000, maxTokens: 4096, input: ['text'] }] } } }, 'agent-default-model': { provider: 'fixture', model: 'fixture' }, 'trisoul-x': { componentAutoSetup: false, identityPrompt: identity, contextEnabled: false, computerUseEnabled: false } };
  writeFileSync(join(home, 'settings.yaml'), JSON.stringify(settings));
  writeFileSync(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { NEUTRAL_FIXTURE_KEY: 'test-only' } }), { mode: 0o600 });
  t.after(async () => {
    if (child && child.exitCode === null) {
      if (process.platform === 'win32') { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
      else child.kill('SIGTERM');
      if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise(r => setTimeout(r, 5000).unref())]);
    }
    provider.closeAllConnections(); await new Promise(r => provider.close(r));
    if (process.env.OMD_NEUTRAL_EVIDENCE_DIR) {
      writeFileSync(join(process.env.OMD_NEUTRAL_EVIDENCE_DIR, mode + '-fixture-payloads.json'), JSON.stringify(payloads, null, 2));
      writeFileSync(join(process.env.OMD_NEUTRAL_EVIDENCE_DIR, mode + '-fixture.log'), redactLog(log));
    }
    if (!complete && !failureDiagnostics) console.error('Neutral fixture diagnostics', { mode, payloads: payloads.length, log: redactLog(log.slice(-3000)) });
    rmSync(root, { recursive: true, force: true });
  });
  child = spawn(process.execPath, ['scripts/start.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, DSH_HOME: home, PORT: '0', DSH_TOOLS_MODE: mode }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
  const bootstrap = await until(() => {
    if (child.exitCode !== null) throw Error(redactLog(log));
    return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];
  }, 90000);
  const base = new URL(bootstrap).origin, login = await fetch(bootstrap, { redirect: 'manual' });
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const rpc = async (method, request) => {
    const r = await fetch(`${base}/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: request === undefined ? {} : { request } } }) });
    const result = await r.json(); assert.equal(result.result?.ok, true, JSON.stringify(result)); return result.result.value;
  };
  const state = async id => (await fetch(base + '/trisoul-x/api/state?session=' + id, { headers: { cookie } })).json();
  const sessionSummary = async id => {
    const response = await fetch(`${base}/api/session/list`, { method: 'POST', signal: AbortSignal.timeout(3000),
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'session/list', payload: { args: { _request: {} } } }) });
    const body = await response.json();
    if (!body.result?.ok) return { error: body.result?.error ?? body };
    const items = body.result.value?.items;
    return { count: items?.length ?? null, summary: items?.find(item => item.sessionId === id) ?? null };
  };
  const run = async (preset, text) => {
    const created = await rpc('session/create', { cwd: workspace, agentPreset: preset });
    const selection = await fetch(`${base}/api/agentPresets/select`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'agentPresets/select', payload: { args: { agentId: created.sessionId, agentPreset: preset } } }) });
    const selected = await selection.json(); assert.equal(selected.result?.ok, true, JSON.stringify(selected)); assert.equal(selected.result.value, preset);
    const start = payloads.length;
    const requestId = crypto.randomUUID(); let promptResult;
    try {
      promptResult = await rpc('session/prompt', { requestId, sessionId: created.sessionId, mode: 'queue', content: [{ type: 'text', text }] });
      await until(async () => {
        if (payloads.length <= start) return false;
        if (preset === 'standard') return true;
        const s = await state(created.sessionId); return s.running === 'idle' && !s.live;
      });
    } catch (error) {
      let listed;
      try { listed = await sessionSummary(created.sessionId); }
      catch (listError) { listed = { error: String(listError) }; }
      failureDiagnostics = true;
      console.error('Neutral fixture diagnostics', JSON.stringify({ mode, preset, sessionId: created.sessionId, requestId,
        promptResult: promptResult ?? null, payloads: payloads.length, sessionList: listed,
        child: { exitCode: child?.exitCode, signalCode: child?.signalCode, killed: child?.killed },
        log: redactLog(log.slice(-5000)), error: String(error) }));
      throw error;
    }
    return payloads.slice(start).filter(p => p.tools?.length);
  };
  await until(async () => (await rpc('llm/listProviders')).some(p => p.id === 'fixture'));
  const stock = await run('standard', 'NEUTRAL_STOCK: read the supplied context.');
  const stockText = JSON.stringify(stock[0].messages);
  assert.match(stock[0].messages[0].content, /^You are a coding agent powered by the fixture model\./);
  for (const literal of ['The DeepSeek Harness implementation checkout', 'through the DeepSeek Harness Web GUI', 'Current DSH file policy:']) assert.ok(stockText.includes(literal), 'stock preset must retain ' + literal);
  assert.ok(stock.some(p => JSON.stringify(p.messages).includes('through the DeepSeek Harness Web GUI')), 'stock environment must not be rebranded');
  assert.ok(stock.every(p => !JSON.stringify(p.messages).includes('You are zcode')), 'custom identity stays inside the selected preset');
  const main = await run('trisoul-x', 'NEUTRAL_MAIN: USER_LITERAL DeepSeek Harness and DSH must remain literal.');
  const first = main[0]; assert.equal(first.messages[0].role, 'system');
  assert.ok(first.messages[0].content.startsWith(identity));
  assert.match(first.messages[0].content, /current web interface/); assert.match(first.messages[0].content, /existing host process/);
  assert.match(JSON.stringify(first.messages), /PROJECT_LITERAL.*DeepSeek Harness/);
  assert.match(JSON.stringify(first.messages), /USER_LITERAL DeepSeek Harness/);
  for (const p of main) assert.doesNotMatch(JSON.stringify(p.messages), forbidden);
  assert.equal(first.tools.some(t => t.function.name === 'run_code'), mode !== 'native');
  if (mode !== 'native') {
    assert.match(first.messages[0].content, /tools\./);
    assert.match(first.messages[0].content, /Read saved context documents/);
    assert.match(first.messages[0].content, /## Programmatic tool use/);
    const sdk = first.messages[0].content.split('## Writing code for run_code')[1];
    assert.ok(sdk.includes(process.platform === 'win32' ? 'Inspect the returned process status and output fields in the current SDK return type.' : 'For foreground results, inspect `exitCode`'));
    assert.ok(sdk.includes('Inspect `job.status`'));
    if (mode === 'ptc') {
      assert.deepEqual(first.tools.map(t => t.function.name), ['run_code']);
      assert.doesNotMatch(first.messages[0].content, /Independent tool calls can run in parallel in one response/);
    } else assert.ok(first.tools.some(t => t.function.name === 'read'));
    const ptcResult = main.flatMap(p => p.messages).find(m => m.role === 'tool' && m.tool_call_id === 'ptc-fixture');
    assert.ok(ptcResult, 'actual PTC execution must return a result to the model');
    assert.doesNotMatch(ptcResult.content, /^Error:/, ptcResult.content);
    assert.deepEqual(JSON.parse(ptcResult.content), { text: 'PTC_TYPED_READ', exitCode: 7, stdout: 'PTC_EXECUTED', missingToolName: 'read' });
    if (mode === 'both') assert.ok(main.some(p => p.messages.some(m => m.role === 'tool' && m.tool_call_id === 'native-fixture' && m.content.includes('PTC_TYPED_READ'))));
  } else {
    for (const marker of ['NEUTRAL_SPAWN_MAIN', 'NEUTRAL_FORK_MAIN']) {
      const requests = await run('trisoul-x', marker + ': delegate the isolated test.');
      const children = requests.filter(p => p.messages.some(m => m.role === 'user' && JSON.stringify(m.content).includes('NEUTRAL_CHILD_ONLY')));
      assert.ok(children.length > 0, marker + ' must actually invoke a child');
      for (const p of requests) assert.doesNotMatch(JSON.stringify(p.messages), forbidden);
      assert.ok(requests.some(p => p.messages.some(m => m.role === 'tool')), 'parent receives the actual child result');
    }
  }
  complete = true;
});
