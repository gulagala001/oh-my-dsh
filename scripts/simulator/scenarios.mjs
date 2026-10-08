import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ScriptedModel, Gate } from './scene.mjs';
import { until } from './host.mjs';
import { assertToolPairs, assertNoLeak } from './assertions.mjs';

const usage = { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 };
export const textReply = text => ({ chunks: [{ delta: { role: 'assistant', content: text }, finish_reason: 'stop', usage }] });
export function toolReply(name, args, id, { split = 0 } = {}) {
  const json = JSON.stringify(args);
  if (!split) return { chunks: [{ delta: { role: 'assistant', tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: json } }] }, finish_reason: 'tool_calls', usage }] };
  const at = Math.max(1, Math.min(json.length - 1, split));
  return { chunks: [
    { delta: { role: 'assistant', tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: json.slice(0, at) } }] }, finish_reason: null },
    { delta: { tool_calls: [{ index: 0, function: { arguments: json.slice(at) } }] }, finish_reason: 'tool_calls', usage },
  ] };
}
export const toolNames = payload => (payload.tools ?? []).map(tool => tool.function.name);
export const userText = payload => payload.messages.filter(message => message.role === 'user').map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).join('\n');
const toolResults = payload => payload.messages.filter(message => message.role === 'tool').map(message => message.content).join('\n');
const containsTool = name => payload => toolNames(payload).includes(name);
const mainMatch = payload => containsTool('todo_write')(payload) && !userText(payload).includes('SIM_CHILD_') && !userText(payload).includes('PRIVATE_SIM_');
function auxiliary() {
  return { id: 'title', match: payload => !payload.tools?.length && JSON.stringify(payload.messages[0]?.content).includes('Create a concise title for an AI coding-assistant session'),
    steps: [{ id: 'title-generation', optional: true, repeat: 20, reply: () => textReply('离线会话验收') }] };
}
function jsonInput(payload) {
  for (const message of payload.messages.filter(message => message.role === 'user').reverse()) {
    try { return JSON.parse(typeof message.content === 'string' ? message.content : message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')); } catch {}
  }
  throw Error('Missing structured background input');
}
const step = (id, reply, expect) => ({ id, reply, expect });

export const SCENARIOS = [
  { id: 'full-lifecycle', title: '原生工具、任务证据、压缩回查、Dream、子会话与重启恢复', create: fullLifecycle },
  { id: 'stream-cancel', title: '真实流式取消、迟到结果与继续', create: cancellation },
  { id: 'background-timeout', title: '虚拟时间触发真实后台超时及清理', create: backgroundTimeout },
  { id: 'todo-reminder', title: '提前结束时待办提醒、pause_turn及有限收尾', create: todoReminder },
  { id: 'restart-checkpoint', title: '实际工具执行边界崩溃与原生恢复', create: restartCheckpoint },
  { id: 'storage-failure', title: '真实原生文件工具遇到 I/O 错误后继续修复', create: storageFailure },
];

function fullLifecycle({ trace }) {
  const prompt = '模拟完整会话：写入 source.txt 并验证交付。用户决定：保留中文、😀、数字9007199254740993和原话。';
  const source = 'SOURCE_ORIGINAL_9007199254740993 中文😀\n' + 'Source detail retained. '.repeat(600);
  let recallRange, publicId;
  const main = [
    step('task', () => toolReply('todo_write', { op: 'excerpt', from: prompt, to: prompt, tasks: [{ title: '写入并验证 source.txt', anchor: { from: prompt, to: prompt } }] }, 'full-task')),
    step('write', () => toolReply('write', { file_path: 'source.txt', content: source }, 'full-write', { split: 71 })),
    step('read', () => toolReply('read', { file_path: 'source.txt' }, 'full-read')),
    step('evidence', () => toolReply('verify_link', { op: 'link', links: [{ task: 'T1', kind: 'test', path: 'verify.mjs', cmd: 'node verify.mjs' }] }, 'full-link'), payload => assert.match(toolResults(payload), /SOURCE_ORIGINAL_9007199254740993/)),
    step('verify', () => toolReply('verify_link', { op: 'run', tasks: ['T1'] }, 'full-verify')),
    step('complete-task', () => toolReply('todo_write', { op: 'check', updates: [{ id: 'T1', done: true }] }, 'full-check'), payload => assert.match(toolResults(payload), /SIMULATION_VERIFIED/)),
    step('present', () => toolReply('present', { files: [{ path: 'source.txt', description: '已核验模拟材料' }] }, 'full-present')),
    step('finish', () => textReply('完整会话工具与证据已完成。')),
    step('recall', () => toolReply('recall', { query: 'SOURCE_ORIGINAL', from: recallRange.from, to: recallRange.to }, 'full-recall'), payload => assert.ok(JSON.stringify(payload.messages).includes('保留中文、😀、数字9007199254740993和原话'), 'compaction lost the user decision in the next real model request')),
    step('recall-confirm', () => textReply('原文回查已完成。'), payload => assert.match(toolResults(payload), /SOURCE_ORIGINAL_9007199254740993/)),
    step('workflow', () => toolReply('workflow', { meta: { name: 'simulation-children', description: 'Verify native child lifecycle' }, script: "return await parallel([() => agent('SIM_CHILD_ALPHA'), () => agent('SIM_CHILD_BETA')])" }, 'full-workflow')),
    step('workflow-confirm', () => textReply('子会话已完成。'), payload => { assert.match(toolResults(payload), /CHILD_ALPHA_DONE/); assert.match(toolResults(payload), /CHILD_BETA_DONE/); }),
    step('resume-after-restart', () => textReply('重启后继续完成。'), payload => assert.match(JSON.stringify(payload.messages), /完整会话|原文回查/)),
  ];
  const model = new ScriptedModel({ trace, lanes: [
    { id: 'main', match: mainMatch, steps: main },
    { id: 'prepare', match: containsTool('prepare_segment'), steps: [step('prepare-public', payload => {
      const input = jsonInput(payload), decision = input.decision_sources?.find(item => item.text.includes('保留中文'));
      assert.ok(decision, 'preprocessing input lost the original user decision');
      assert.ok(input.user_messages?.some(item => item.text === prompt), 'preprocessing input lost the verbatim user message');
      assert.ok(input.segment?.some(item => item.type === 'tool/result' && item.text.includes('SOURCE_ORIGINAL_9007199254740993')), 'preprocessing input lost the actual tool material');
      return toolReply('prepare_segment', { summary: '已写入、读取和验证 source.txt。', documents: [{ title: '模拟原始资料', text: source }],
        decisions: [{ seq: decision.seq, text: '保留中文、😀、数字9007199254740993和原话。', quote: '保留中文、😀、数字9007199254740993和原话' }] }, 'full-prepare');
    })] },
    { id: 'dream', match: containsTool('save_memory'), steps: ['session', 'project', 'global'].map(kind => step('dream-' + kind, payload => {
      const input = jsonInput(payload); assert.equal(input.kind, kind); assertNoLeak(input, 'PRIVATE_SIM_');
      return toolReply('save_memory', { summary: kind + '：source.txt 已完成真实工具和证据验收。', references: input.sources.map(item => item.id) }, 'dream-' + kind);
    })) },
    { id: 'private', match: payload => containsTool('todo_write')(payload) && userText(payload).includes('PRIVATE_SIM_'), steps: [step('private-message', () => textReply('独立会话仅本地保留。'))] },
    ...['ALPHA', 'BETA'].map(kind => ({ id: 'child-' + kind, match: payload => containsTool('todo_write')(payload) && userText(payload).includes('SIM_CHILD_' + kind),
      steps: [step('child-response', () => textReply('CHILD_' + kind + '_DONE'))] })), auxiliary(),
  ] });
  return { model, omd: { keepTailEvents: 0, prepareContinueTokens: 1, automaticReplace: false }, async run({ host, checks, provider }) {
    await writeFile(join(host.workspace, 'verify.mjs'), "import{readFileSync}from'node:fs';import assert from'node:assert/strict';assert.ok(readFileSync('source.txt','utf8').startsWith('SOURCE_ORIGINAL_9007199254740993 中文😀'));console.log('SIMULATION_VERIFIED');");
    publicId = await host.createSession(); await host.prompt(publicId, prompt);
    const state = await host.idle(publicId, state => state.tasks[0]?.status === 'completed');
    await checks.check('真实文件、任务与测试证据', async () => {
      assert.equal(await readFile(join(host.workspace, 'source.txt'), 'utf8'), source);
      assert.equal(state.tasks[0].status, 'completed'); assert.ok(state.tasks[0].links.some(link => link.lastRun?.pass && link.lastRun.tail.includes('SIMULATION_VERIFIED')));
    });
    const before = await host.control('/snapshot?session=' + publicId);
    const sourceEvent = before.events.find(event => event.type === 'tool/result' && JSON.stringify(event.data).includes('SOURCE_ORIGINAL_9007199254740993'));
    assert.ok(sourceEvent); recallRange = { from: sourceEvent.seq, to: sourceEvent.seq };
    await host.api('/context/prepare?session=' + publicId, {});
    await until(async () => (await host.api('/state?session=' + publicId)).actions.preparedSegments, { signal: host.signal, description: 'prepared context' });
    const records = (await host.api('/context?session=' + publicId)).records.filter(record => record.live && !record.mergedInto && record.mode === 'raw').map(record => record.id);
    const compact = await host.api('/compact?session=' + publicId, { ids: records, mode: 'detail' });
    await checks.check('真实预处理与上下文替换', () => { assert.ok(records.length); assert.equal(compact.changed, true); });
    await host.prompt(publicId, '回查原始 source.txt 资料。'); await host.idle(publicId);
    const privateId = await host.createSession(); await host.api('/scope?session=' + privateId, { scope: 'session' });
    await host.prompt(privateId, 'PRIVATE_SIM_ 隔离材料禁止传播。'); await host.idle(privateId);
    await host.api('/dream/refresh', {});
    const job = await host.api('/dream/run?session=' + publicId, { scope: 'global' });
    await until(async () => { const status = await host.api('/dream?session=' + publicId), found = status.jobs.find(item => item.id === job.id);
      if (found?.state === 'failed') throw Error(found.error); return found?.state === 'complete' && status; }, { signal: host.signal, description: 'Dream publication' });
    await checks.check('Dream 三级发布及独立会话隔离', async () => {
      const status = await host.api('/dream?session=' + publicId); assert.ok(status.globalMemory?.summary.includes('global'));
      assertNoLeak(status.globalMemory, 'PRIVATE_SIM_'); assert.equal((await host.api('/dream?session=' + privateId)).session.shared, false);
    });
    await host.prompt(publicId, '运行两个模拟子会话。'); await host.idle(publicId);
    const journals = await readdir(join(host.home, 'trisoul-x/workflows'));
    await checks.check('原生 workflow 与两个子会话', () => { assert.ok(journals.length); assert.equal(provider.requests.filter(request => userText(request.payload ?? { messages: [] }).includes('SIM_CHILD_ALPHA')).length, 1); });
    const checkpoint = await host.control('/snapshot?session=' + publicId);
    await host.restart({ crash: true }); await host.createSession({ id: publicId });
    const restored = await host.control('/snapshot?session=' + publicId);
    await checks.check('真实 SIGKILL 后原生恢复', async () => {
      const native = await host.durable(publicId); assert.deepEqual(restored.events.slice(0, checkpoint.events.length), checkpoint.events); assertToolPairs(native.events);
    });
    await host.prompt(publicId, '重启后继续。'); await host.idle(publicId);
    return { sessionId: publicId, privateSessionId: privateId };
  } };
}

function cancellation({ trace, parameters = {} } = {}) {
  const gate = new Gate(), prefix = 'STREAM_PREFIX_' + (parameters.text ?? '中文😀'), late = 'LATE_RESULT_MUST_NOT_COMMIT';
  let generatedLate = false;
  const model = new ScriptedModel({ trace, lanes: [{ id: 'main', match: mainMatch, steps: [
    step('partial-stream', (_payload, { signal }) => ({ chunks: (async function* () {
      yield { delta: { role: 'assistant', content: prefix }, finish_reason: null };
      // Deliberately ignore cancellation for this bounded producer. Its late
      // continuation actually runs; the closed transport must discard it.
      await gate.wait(); generatedLate = true; trace({ type: 'fault/late-generated', text: late, signalAborted: signal.aborted });
      yield { delta: { content: late }, finish_reason: 'stop', usage };
    })() })), step('resume', () => textReply('RESUMED_STREAM_DONE')),
  ] }, auxiliary()] });
  return { model, gates: [gate], async run({ host, checks }) {
    const id = await host.createSession(); await host.prompt(id, '模拟慢速流式输出。'); await gate.entered;
    await host.rpc('session/cancel', { sessionId: id }); await host.idle(id);
    gate.release();
    await until(() => generatedLate, { signal: host.signal, description: 'bounded late producer' });
    await checks.check('实际生成的迟到内容不提交', async () => { const snapshot = await host.control('/snapshot?session=' + id); assertNoLeak(snapshot.events, late); });
    await host.prompt(id, '继续已停止的会话。'); await host.idle(id);
    await checks.check('停止后真实会话继续', async () => { const native = await host.durable(id); assert.match(JSON.stringify(native.events), /RESUMED_STREAM_DONE/); });
    return { sessionId: id };
  } };
}

function backgroundTimeout({ trace }) {
  let gate = new Gate(); const gates = [gate];
  const model = new ScriptedModel({ trace, lanes: [
    { id: 'main', match: mainMatch, steps: [step('write-material', () => toolReply('write', { file_path: 'large.txt', content: 'TIMEOUT_SOURCE '.repeat(1000) }, 'timeout-write')), step('finish', () => textReply('超时测试材料已写入。'))] },
    { id: 'prepare', match: containsTool('prepare_segment'), steps: [step('never-complete', (_payload, { signal }) => ({ chunks: (async function* () {
      yield { delta: { role: 'assistant', content: 'PREPARE_WAITING' }, finish_reason: null };
      while (true) { await gate.wait(signal); gate = new Gate(); gates.push(gate); yield { delta: { content: '' }, finish_reason: null }; }
    })() }))] }, auxiliary(),
  ] });
  return { model, gates, requiresVirtual: true, omd: { keepTailEvents: 0, prepareContinueTokens: 1, jobTimeoutMs: 600000, backgroundMaxRetries: 0 }, async run({ host, checks, provider }) {
    const id = await host.createSession(); await host.prompt(id, '写入材料后模拟后台超时。'); await host.idle(id);
    await host.api('/context/prepare?session=' + id, {}); await gate.entered;
    const start = (await host.control('/clock')).now;
    // Keep the transport alive with actual SSE chunks while exploring the
    // separate total-job deadline. Otherwise undici's body idle timeout would
    // correctly win first and this would test a different mechanism.
    for (const advance of [200000, 200000, 199999]) {
      const request = provider.requests.find(item => item.payload?.tools?.some(tool => tool.function.name === 'prepare_segment'));
      const count = request.chunks.length; gate.release();
      await until(() => request.chunks.length > count, { signal: host.signal, description: 'transport heartbeat' });
      await host.control('/clock', { advance });
    }
    await checks.check('十分钟期限前不提前取消', async () => assert.ok((await host.api('/state?session=' + id)).live));
    await host.control('/clock', { advance: 1 });
    const state = await until(async () => { const value = await host.api('/state?session=' + id); return !value.live && value.metrics.prepare?.errors && value; }, { signal: host.signal, description: 'background timeout cleanup' });
    await checks.check('推进十分钟触发真实超时并清理', async () => {
      assert.equal((await host.control('/clock')).now - start, 600000); assert.match(JSON.stringify(state.activity), /后台作业超时/);
    });
    return { sessionId: id, virtualElapsedMs: 600000 };
  } };
}

function storageFailure({ trace }) {
  const expected = 'STORAGE_RECOVERED 中文😀';
  const model = new ScriptedModel({ trace, lanes: [{ id: 'main', match: mainMatch, steps: [
    step('failed-write', () => toolReply('write', { file_path: 'fault.txt', content: 'SHOULD_FAIL' }, 'fault-write')),
    step('repair-write', () => toolReply('write', { file_path: 'fault.txt', content: expected }, 'fault-repair'), payload => assert.match(toolResults(payload), /EIO|injected/i)),
    step('verify-read', () => toolReply('read', { file_path: 'fault.txt' }, 'fault-read')),
    step('finish', () => textReply('真实文件工具故障已恢复。'), payload => assert.ok(toolResults(payload).includes(expected))),
  ] }, auxiliary()] });
  return { model, async run({ host, checks }) {
    const id = await host.createSession();
    await host.control('/fault', { operation: 'write', path: join(host.workspace, 'fault.txt'), count: 1, code: 'EIO' });
    await host.prompt(id, '模拟文件写入错误，然后修复并核验。'); await host.idle(id);
    await checks.check('原生文件写入故障确实触发且恢复', async () => {
      const fault = await host.control('/fault'); assert.equal(fault.remaining, 0); assert.ok(fault.matches?.length || fault.events?.length);
      assert.equal(await readFile(join(host.workspace, 'fault.txt'), 'utf8'), expected);
      const native = await host.durable(id); assertToolPairs(native.events);
    });
    return { sessionId: id, fault: await host.control('/fault') };
  } };
}

function todoReminder({ trace }) {
  const prompt = 'SIM_PENDING_TASK：完成待办机制验收。';
  const model = new ScriptedModel({ trace, lanes: [{ id: 'main', match: mainMatch, steps: [
    step('task', () => toolReply('todo_write', { op: 'excerpt', from: prompt, to: prompt, tasks: [{ title: '完成待办机制验收', anchor: { from: prompt, to: prompt } }] }, 'reminder-task')),
    step('premature-finish', () => textReply('尝试提前结束。')),
    step('pause', () => toolReply('todo_write', { op: 'pause_turn', reason: '模拟外部条件未满足，暂时暂停。' }, 'reminder-pause'), payload => assert.match(JSON.stringify(payload.messages), /Unresolved tasks remain/)),
    step('final', () => textReply('已说明暂停原因，等待条件满足。')),
  ] }, auxiliary()] });
  return { model, async run({ host, checks }) {
    const id = await host.createSession(); await host.prompt(id, prompt); const state = await host.idle(id, state => state.metrics.main?.calls >= 4);
    await checks.check('真实收尾提醒与pause_turn', () => { assert.equal(state.tasks[0].status, 'pending'); assert.equal(state.metrics.main.calls, 4); });
    return { sessionId: id };
  } };
}

function restartCheckpoint({ trace, parameters = {} }) {
  const gate = new Gate(), material = parameters.text ?? 'CHECKPOINT_SOURCE 中文😀';
  const model = new ScriptedModel({ trace, lanes: [{ id: 'main', match: mainMatch, steps: [
    step('write', () => toolReply('write', { file_path: 'checkpoint.txt', content: material }, 'checkpoint-write')),
    step('hold-after-write', (_payload, { signal }) => ({ chunks: (async function* () { await gate.wait(signal); yield { delta: { role: 'assistant', content: 'OLD_EXECUTOR_LATE' }, finish_reason: 'stop' }; })() })),
    step('read-after-restart', () => toolReply('read', { file_path: 'checkpoint.txt' }, 'checkpoint-read')),
    step('finish', () => textReply('CHECKPOINT_RECOVERED'), payload => assert.ok(toolResults(payload).includes(material))),
  ] }, auxiliary()] });
  return { model, gates: [gate], async run({ host, checks }) {
    const id = await host.createSession(); await host.prompt(id, '执行到写入检查点后崩溃。'); await gate.entered;
    await host.control('/snapshot?session=' + id); await host.restart({ crash: true }); gate.release(); await host.createSession({ id });
    await host.prompt(id, '从真实持久化状态恢复并读取。'); await host.idle(id);
    await checks.check('工具副作用与检查点恢复', async () => { assert.equal(await readFile(join(host.workspace, 'checkpoint.txt'), 'utf8'), material); const native = await host.durable(id); assertNoLeak(native.events, 'OLD_EXECUTOR_LATE'); assert.match(JSON.stringify(native.events), /CHECKPOINT_RECOVERED/); });
    return { sessionId: id };
  } };
}
