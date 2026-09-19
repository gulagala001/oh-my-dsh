import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';
const toolReply = (name, args) => ({ delta: { role: 'assistant', tool_calls: [{ index: 0, id: crypto.randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' });
const say = text => ({ delta: { role: 'assistant', content: text }, finish_reason: 'stop' });
const flatten = p => JSON.stringify(p.messages);
for (const preset of ['trisoul-x', 'omd-ptc']) test(`background ${preset}: one execution, state, direct wait, user wake, previews, and actual outcome`, { timeout: 90000 }, async t => {
  const f = await frontendFixture(t, { headless: true, omdConfig: { backgroundTasksEnabled: true, stateHintsEnabled: true, codegraphEnabled: false, contextEnabled: false } });
  t.after(() => { const text = f.log(); if (/listener|TypeError|Error/.test(text)) console.error(text.slice(-4500)); });
  const requests = []; let phase = 0, jobId, start, yielded, wakeRequest, doneRequest;
  const { sessionId } = await f.rpc('session/create', { cwd: f.workspace, agentPreset: preset });
  await f.api(`/better-todo?session=${sessionId}`, { todo: false });
  const tool = process.platform === 'win32' ? 'pwsh' : 'bash';
  const code = 'const fs=require("node:fs");fs.appendFileSync("runs.txt","once\\n");setTimeout(()=>{console.log("JOB_ACTUAL_SUCCESS 汉字");process.exit(7)},' + (process.platform === 'win32' ? 5000 : 2200) + ')';
  const script = join(f.workspace, 'scenario.cjs'); await writeFile(script, code);
  const command = `${process.platform === 'win32' ? '& ' : ''}"${process.execPath}" "${script}"${process.platform === 'win32' ? '; exit $LASTEXITCODE' : ''}`;
  f.replyWith(payload => {
    if (!flatten(payload).includes('BACKGROUND_SCENARIO')) return;
    requests.push(payload);
    if (phase++ === 0) {
      start = Date.now();
      const args = { command, description: 'Run an isolated background fixture', yieldMs: 250 };
      return preset === 'omd-ptc' ? toolReply('run_code', { code: `return await tools.${tool}(${JSON.stringify({ ...args, run_in_background: true })})`, description: 'Start fixture' }) : toolReply(tool, args);
    }
    if (!jobId) {
      yielded = Date.now();
      jobId = flatten(payload).match(new RegExp(tool + '-[a-z0-9-]+'))?.[0];
      assert.ok(jobId, flatten(payload).slice(-3000));
      return toolReply('job_output', { job_id: jobId, wait: true });
    }
    if (flatten(payload).includes('STEER_THE_WAIT') && !wakeRequest) {
      wakeRequest = payload;
      return toolReply('job_output', { job_id: jobId, wait: true });
    }
    if (flatten(payload).includes('JOB_ACTUAL_SUCCESS') && /exit code: 7/.test(flatten(payload))) {
      doneRequest = payload; return say('Observed fixture exit 7.');
    }
    return say('Waiting fixture acknowledged.');
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'BACKGROUND_SCENARIO' }] });
  await until(async () => (await f.api(`/background-wait?session=${sessionId}`)).waiting);
  assert.ok(yielded - start < (process.platform === 'win32' ? 4000 : 1800), 'model regains control before the command finishes');
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'steer', content: [{ type: 'text', text: 'STEER_THE_WAIT' }] });
  await until(() => wakeRequest);
  assert.match(flatten(wakeRequest), /user_input/);
  await until(() => doneRequest);
  await until(async () => (await f.api(`/state?session=${sessionId}`)).running === 'idle');
  assert.equal(await readFile(join(f.workspace, 'runs.txt'), 'utf8'), 'once\n');
  const first = requests[0];
  assert.match(flatten(first), /runtime state · as of/);
  assert.match(flatten(first), /## Runtime state/);
  assert.ok(first.tools.some(t => t.function.name === 'runtime_status'));
  if (preset === 'omd-ptc') {
    assert.deepEqual(first.tools.map(t => t.function.name).sort(), ['job_kill', 'job_list', 'job_output', 'run_code', 'runtime_status']);
    assert.doesNotMatch(flatten(first), /`run_code` is the only tool you can call directly/);
  }
  assert.match(JSON.stringify(doneRequest.messages.filter(m => m.role !== 'system')), /Retained output preview/);
  assert.equal((await f.api(`/background-wait?session=${sessionId}`)).waiting, false);
  await f.api('/settings', { backgroundTasksEnabled: false, stateHintsEnabled: false });
  const previous = requests.length;
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'DISABLE_BACKGROUND' }] });
  await until(() => requests.length > previous);
  assert.doesNotMatch(flatten(requests.at(-1)), /runtime state · as of|## Background execution|## Runtime state/);
  if (preset === 'omd-ptc') assert.deepEqual(requests.at(-1).tools.map(t => t.function.name), ['run_code']);
});

test('composer Enter sends immediately during an event wait and preserves ordinary queue behavior afterward', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t, { omdConfig: { backgroundTasksEnabled: true, codegraphEnabled: false, contextEnabled: false } });
  const origin = new URL(f.page.url()).origin;
  await f.page.request.post(`${origin}/trisoul-x/api/better-todo?session=${f.sessionId}`, { data: { todo: false } });
  const tool = process.platform === 'win32' ? 'pwsh' : 'bash';
  const script = join(f.root, 'workspace', 'wait.cjs'); await writeFile(script, 'setTimeout(()=>console.log("finished"),30000)');
  const command = `${process.platform === 'win32' ? '& ' : ''}"${process.execPath}" "${script}"`;
  let phase = 0, id, steered;
  f.replyWith(p => {
    if (!flatten(p).includes('UI_WAIT_CASE')) return;
    if (phase++ === 0) return toolReply(tool, { command, description: 'Wait fixture', run_in_background: true });
    if (!id) { id = flatten(p).match(new RegExp(tool + '-[a-z0-9-]+'))?.[0]; return toolReply('job_output', { job_id: id, wait: true }); }
    if (flatten(p).includes('现在处理我的新输入') && !steered) { steered = p; return toolReply('job_kill', { job_id: id }); }
    return say('已响应新输入，停止等待任务。');
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: 'UI_WAIT_CASE' }] });
  await until(async () => (await (await f.page.request.get(`${origin}/trisoul-x/api/background-wait?session=${f.sessionId}`)).json()).waiting);
  const input = f.page.locator('[contenteditable="true"]').first();
  await input.fill('现在处理我的新输入');
  await f.page.getByRole('button', { name: '现在发送', exact: true }).waitFor();
  await input.press('Enter');
  await until(() => steered, 5000);
  assert.match(flatten(steered), /wakeReason: user_input/);
  await until(async () => !(await (await f.page.request.get(`${origin}/trisoul-x/api/background-wait?session=${f.sessionId}`)).json()).waiting);
  assert.equal(await f.page.getByRole('button', { name: '现在发送', exact: true }).count(), 0);
  assert.deepEqual(f.errors, []);
});
