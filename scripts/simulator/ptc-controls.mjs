import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ScriptedModel } from './scene.mjs';
import { until } from './host.mjs';
import { textReply, toolReply, toolNames, userText } from './replies.mjs';
import { assertToolPairs } from './assertions.mjs';

const controlNames = ['job_kill', 'job_list', 'job_output', 'run_code', 'runtime_status'];
const results = payload => payload.messages.filter(message => message.role === 'tool').map(message => message.content).join('\n');
const lastResult = payload => payload.messages.findLast(message => message.role === 'tool')?.content ?? '';
const wire = payload => assert.deepEqual(toolNames(payload).sort(), controlNames);
const step = (id, reply, expect) => ({ id, reply, expect });

// Registered in SCENARIOS so --all includes the real native loop, tool-owned
// outcomes, request-sampled controls and independently observed OS exit.
export const ptcControlsScenario = { id: 'ptc-background-controls', title: 'PTC 后台直控、真实输出、取消与请求设置快照', create({ trace }) {
  let host, jobId, disabledRequest, enabledRequest;
  const shell = process.platform === 'win32' ? 'pwsh' : 'bash';
  const model = new ScriptedModel({ trace, lanes: [
    { id: 'main', match: payload => payload.tools?.length > 0 && userText(payload).includes('SIM_PTC_CONTROLS'), steps: [
      step('start', () => {
        const file = join(host.workspace, 'ptc-background.cjs');
        const command = `${process.platform === 'win32' ? '& ' : ''}"${process.execPath}" "${file}"`;
        return toolReply('run_code', { description: 'Start one isolated background job', code: `return await tools.${shell}(${JSON.stringify({ command, description: 'PTC control lifecycle', run_in_background: true })})` }, 'ptc-start');
      }, wire),
      step('list', () => toolReply('job_list', {}, 'ptc-list'), async payload => {
        wire(payload); jobId = results(payload).match(new RegExp(shell + '-[a-z0-9-]+'))?.[0]; assert.ok(jobId);
        await until(async () => (await readFile(join(host.workspace, 'ptc-runs.txt'), 'utf8').catch(() => '')) === 'once\n', { signal: host.signal, description: 'native background command side effect' });
      }),
      step('read', () => toolReply('job_output', { job_id: jobId }, 'ptc-read'), payload => {
        wire(payload); assert.match(lastResult(payload), new RegExp(jobId + '.*running'));
      }),
      step('status', () => toolReply('runtime_status', {}, 'ptc-status'), payload => {
        wire(payload); assert.match(lastResult(payload), /PTC_CONTROL_STARTED/); assert.match(lastResult(payload), /\[status: running\]/);
      }),
      step('kill', () => toolReply('job_kill', { job_id: jobId, reason: 'PTC scenario cancellation' }, 'ptc-kill'), payload => {
        const state = JSON.parse(lastResult(payload));
        assert.ok(state.jobs.some(job => job.id === jobId && job.status === 'running'));
      }),
      step('terminal-output', () => toolReply('job_output', { job_id: jobId, wait: true }, 'ptc-terminal'), payload => {
        assert.match(lastResult(payload), /requested cancellation/); assert.doesNotMatch(lastResult(payload), /unknown tool/);
      }),
      step('finish', () => textReply('PTC control lifecycle completed.'), payload => {
        assert.match(lastResult(payload), /\[status: killed(?:,|\])/);
        assert.doesNotMatch(lastResult(payload), /PTC_MUST_NOT_FINISH/);
      }),
      step('disabled-direct-attempt', payload => { disabledRequest = payload; return toolReply('job_list', {}, 'ptc-disabled'); }, payload => assert.deepEqual(toolNames(payload), ['run_code'])),
      step('disabled-result', () => textReply('Disabled controls rejected.'), payload => assert.match(lastResult(payload), /unknown tool.*job_list/)),
      step('reenabled-list', payload => { enabledRequest = payload; return toolReply('job_list', {}, 'ptc-reenabled'); }, wire),
      step('reenabled-result', () => textReply('Re-enabled controls observed.'), payload => assert.match(lastResult(payload), new RegExp(jobId + '.*killed'))),
    ] },
    { id: 'title', match: payload => !payload.tools?.length && JSON.stringify(payload.messages[0]?.content).includes('Create a concise title'), steps: [
      { id: 'title-generation', optional: true, repeat: 10, reply: () => textReply('PTC 后台验收') },
    ] },
  ] });
  return { model, omd: { backgroundTasksEnabled: true, contextEnabled: false, stateHintsEnabled: true }, async run(input) {
    host = input.host; const { checks } = input;
    await writeFile(join(host.workspace, 'ptc-background.cjs'), 'const fs=require("node:fs");fs.writeFileSync("ptc-pid.txt",String(process.pid));fs.appendFileSync("ptc-runs.txt","once\\n");console.log("PTC_CONTROL_STARTED");setTimeout(()=>console.log("PTC_MUST_NOT_FINISH"),30000);');
    const sessionId = await host.createSession({ preset: 'omd-ptc' });
    await host.api('/better-todo?session=' + sessionId, { todo: false });
    await host.prompt(sessionId, 'SIM_PTC_CONTROLS'); await host.idle(sessionId);
    await checks.check('真实后台仅执行一次、查询真实状态与输出、取消后进程退出', async () => {
      assert.equal(await readFile(join(host.workspace, 'ptc-runs.txt'), 'utf8'), 'once\n');
      const pid = Number(await readFile(join(host.workspace, 'ptc-pid.txt'), 'utf8'));
      assert.ok(Number.isSafeInteger(pid) && pid > 1);
      await until(() => { try { process.kill(pid, 0); return false; } catch (error) { if (error.code !== 'ESRCH') throw error; return true; } },
        { signal: host.signal, description: 'cancelled native process has exited' });
      const snapshot = await host.control('/snapshot?session=' + sessionId);
      assertToolPairs(snapshot.events);
      for (const callId of ['ptc-list', 'ptc-read', 'ptc-status', 'ptc-kill', 'ptc-terminal']) {
        const result = snapshot.events.find(event => event.type === 'tool/result' && event.data.message.toolCallId === callId);
        assert.ok(result, 'native result event: ' + callId);
        assert.doesNotMatch(JSON.stringify(result.data.message), /unknown tool|UNKNOWN_TOOL/);
      }
      assert.equal(snapshot.events.filter(event => event.type === 'tool/ptc-dispatch' && event.data.name === shell).length, 1);
    });
    const disabledSettings = await host.api('/settings', { backgroundTasksEnabled: false });
    const currentSettings = await host.api('/settings');
    trace({ type: 'ptc-control/settings', saved: disabledSettings.backgroundTasksEnabled, effective: currentSettings.backgroundTasksEnabled });
    await checks.check('设置保存与当前读取均确认后台优化已关闭', () => {
      assert.equal(disabledSettings.backgroundTasksEnabled, false);
      assert.equal(currentSettings.backgroundTasksEnabled, false);
    });
    await host.prompt(sessionId, 'SIM_PTC_CONTROLS_DISABLED'); await host.idle(sessionId);
    await checks.check('下一请求关闭直控且拒绝旧控制能力', () => {
      assert.deepEqual(toolNames(disabledRequest), ['run_code']);
      assert.match(JSON.stringify(disabledRequest.messages), /`run_code` is the only tool you can call directly/);
    });
    await host.api('/settings', { backgroundTasksEnabled: true });
    await host.prompt(sessionId, 'SIM_PTC_CONTROLS_REENABLED'); await host.idle(sessionId);
    await checks.check('重新启用在下一请求恢复同一原生控制与已有作业状态', () => wire(enabledRequest));
    assertToolPairs((await host.durable(sessionId)).events);
    return { sessionId, jobId };
  } };
} };
