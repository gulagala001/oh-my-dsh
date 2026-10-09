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
const adaptiveMarker = '[OMD independent asynchronous context check]';
const contentText = content => typeof content === 'string' ? content : (content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n');
const adaptiveMatch = payload => contentText(payload.messages.at(-1)?.content).includes(adaptiveMarker);
const mainMatch = payload => containsTool('todo_write')(payload) && !adaptiveMatch(payload) && !userText(payload).includes('SIM_CHILD_') && !userText(payload).includes('PRIVATE_SIM_');
const adaptiveInput = payload => {
  const tail = contentText(payload.messages.at(-1).content);
  return JSON.parse(tail.slice(tail.lastIndexOf('\n\n') + 2));
};
function assertAdaptivePrefix(main, background) {
  assert.ok(main, 'background check requires a completed native main request');
  assert.equal(background.messages.length, main.messages.length + 1, 'only one independent task may be appended');
  assert.deepEqual(background.messages.slice(0, -1), main.messages, 'background wire history must exactly equal the main wire prefix');
  const { messages: _mainMessages, ...mainEnvelope } = main;
  const { messages: _backgroundMessages, ...backgroundEnvelope } = background;
  assert.deepEqual(backgroundEnvelope, mainEnvelope, 'model, tools and all provider wire parameters must be unchanged');
  assert.ok(toolNames(background).includes('write'), 'background must preserve the original main tool schema');
}
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
  { id: 'context-enhancement', title: '独立主动异步压缩、请求前缀、模式切换与原文搜索', create: contextEnhancement },
  { id: 'context-adaptive-auto', title: '真实主请求成功后自动调度主动异步压缩及缓存用量传递', create: contextAdaptiveAuto },
];

function fullLifecycle({ trace }) {
  const prompt = '模拟完整会话：写入 source.txt 并验证交付。用户决定：保留中文、😀、数字9007199254740993和原话。';
  const source = 'SOURCE_ORIGINAL_9007199254740993 中文😀\n' + 'Source detail retained. '.repeat(600);
  let recallRange, publicId, verificationRun;
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
      verificationRun = state.tasks[0].links.find(link => link.kind === 'test').lastRun;
      assert.equal(verificationRun.execution.tool, process.platform === 'win32' ? 'pwsh' : 'bash');
      assert.equal(verificationRun.execution.command, process.platform === 'win32'
        ? "$ErrorActionPreference = 'Stop'\n& {\nnode verify.mjs\n}\nif ($LASTEXITCODE -ne $null) { exit $LASTEXITCODE }"
        : 'node verify.mjs');
      assert.equal(verificationRun.execution.workdir, host.workspace);
      assert.equal(verificationRun.execution.rootCallId, 'full-verify');
      assert.ok(verificationRun.execution.callId && verificationRun.execution.callId !== 'full-verify');
      assert.equal(verificationRun.execution.exitCode, 0);
      assert.equal(verificationRun.execution.signal, null);
      assert.ok(verificationRun.startedAt <= verificationRun.finishedAt);
      assert.ok(Number.isFinite(verificationRun.durationMs) && verificationRun.durationMs >= 0);
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
      const recovered = await host.api('/state?session=' + publicId);
      assert.deepEqual(recovered.tasks[0].links.find(link => link.kind === 'test').lastRun, verificationRun);
    });
    await host.prompt(publicId, '重启后继续。'); await host.idle(publicId);
    return { sessionId: publicId, privateSessionId: privateId };
  } };
}

function contextEnhancement({ trace }) {
  const blocked = new Gate(), late = new Gate();
  const longId = 'ADAPTIVE_ORIGINAL_900719925474099312345678901234567890';
  const chinese = '原文搜索可以找到被摘要省略的中文材料';
  const privateKey = 'ADAPTIVE_PRIVATE_SESSION_KEY_123456789';
  const source = `${longId}\n${chinese}\n` + '真实工具资料只归档，不写入本次摘要。'.repeat(900);
  const quote = '工具材料保留原文供明确回查';
  const prompt = '模拟主动异步整理：写入并读取 adaptive.txt。用户决定：' + quote + '。';
  const summary = '真实工具已写入并读取 adaptive.txt。';
  let latestMain, prefixChecks = 0, lateProduced = false, privateId, publicId, sourceSeq;
  const contextPath = () => '/context?session=' + publicId;
  const readSearch = (payload, id) => {
    const message = payload.messages.findLast(message => message.role === 'tool' && message.tool_call_id === id);
    assert.ok(message, 'missing actual native recall result ' + id);
    return JSON.parse(contentText(message.content));
  };
  const prepared = (payload, text = summary, invalidQuote = false) => {
    const input = adaptiveInput(payload);
    const candidate = input.candidates.find(candidate => candidate.id === 'new-window');
    assert.ok(candidate, 'adaptive check must expose an original window');
    const decision = candidate.decision_sources.find(item => contentText(payload.messages[item.index]?.content).includes(quote));
    assert.ok(decision, 'decision seq must be mapped from the real candidate and original request message');
    assert.ok(candidate.messages.some(item => JSON.stringify(payload.messages[item.index]).includes(longId)), 'candidate must include the actual original tool material');
    return { action: 'compress', reason: '工具资料足以整理。', choices: [{ id: candidate.id, action: 'brief' }],
      prepared: { summary: text, documents: [], decisions: [{ seq: decision.seq, quote: invalidQuote ? '并非用户说过的决定' : quote, text: quote }] } };
  };
  const remember = payload => { latestMain = structuredClone(payload); };
  const assertPrefix = payload => {
    assertAdaptivePrefix(latestMain, payload);
    prefixChecks++;
  };
  const expectSearch = (payload, id, query, sessionId, found) => {
    const result = readSearch(payload, id);
    assert.equal(result.search, 'original'); assert.equal(result.query, query); assert.equal(result.sessionId, sessionId);
    assert.equal(result.results.length > 0, found, 'original search must respect the requested session boundary');
    for (const hit of result.results) {
      assert.ok(Number.isSafeInteger(hit.seq)); assert.equal(hit.sessionId, sessionId);
      assert.equal(hit.recall.from, hit.seq); assert.equal(hit.recall.to, hit.seq);
      assert.ok(hit.snippets.length); assert.ok(JSON.stringify(hit.snippets).includes(query));
    }
  };
  const model = new ScriptedModel({ trace, lanes: [
    { id: 'main', match: mainMatch, steps: [
      step('write-original', () => toolReply('write', { file_path: 'adaptive.txt', content: source }, 'adaptive-write'), remember),
      step('read-original', () => toolReply('read', { file_path: 'adaptive.txt' }, 'adaptive-read'), remember),
      step('material-ready', () => textReply('ADAPTIVE_MATERIAL_READY'), payload => { remember(payload); assert.ok(toolResults(payload).includes(longId)); }),
      step('after-skip', () => textReply('ADAPTIVE_SKIP_CONTINUED'), remember),
      step('while-background-blocked', () => textReply('ADAPTIVE_MAIN_CONTINUED_WITH_BACKGROUND_BLOCKED'), remember),
      step('capture-after-mode-switch', () => textReply('ADAPTIVE_MAIN_RECAPTURED'), remember),
      step('search-long-id', () => toolReply('recall', { search: 'original', query: longId }, 'adaptive-search-id'), payload => {
        remember(payload); assert.ok(JSON.stringify(payload.messages).includes(summary), 'pending compression must apply at the next real request boundary');
        assert.ok(!JSON.stringify(payload.messages).includes(longId), 'long original identifier must actually leave the visible request');
        assert.ok(!JSON.stringify(payload.messages).includes(chinese), 'Chinese original material must actually leave the visible request');
        assert.ok(JSON.stringify(payload.messages).includes(quote), 'compression must retain the grounded user decision');
      }),
      step('search-chinese', () => toolReply('recall', { search: 'original', query: chinese }, 'adaptive-search-chinese'), payload => { remember(payload); expectSearch(payload, 'adaptive-search-id', longId, publicId, true); }),
      step('search-default-isolation', () => toolReply('recall', { search: 'original', query: privateKey }, 'adaptive-search-private-default'), payload => { remember(payload); expectSearch(payload, 'adaptive-search-chinese', chinese, publicId, true); }),
      step('search-explicit-session', () => toolReply('recall', { search: 'original', query: privateKey, sessionId: privateId }, 'adaptive-search-private-explicit'), payload => { remember(payload); expectSearch(payload, 'adaptive-search-private-default', privateKey, publicId, false); }),
      step('legacy-range-recall', () => toolReply('recall', { query: 'adaptive.txt', from: sourceSeq, to: sourceSeq }, 'adaptive-legacy-recall'), payload => { remember(payload); expectSearch(payload, 'adaptive-search-private-explicit', privateKey, privateId, true); }),
      step('search-complete', () => textReply('ADAPTIVE_ORIGINAL_SEARCH_COMPLETE'), payload => { remember(payload); assert.match(toolResults(payload), new RegExp(longId)); }),
      step('after-restart', () => textReply('ADAPTIVE_RESTART_COMPLETE'), remember),
    ] },
    { id: 'adaptive', match: adaptiveMatch, steps: [
      step('skip', () => textReply(JSON.stringify({ action: 'skip', reason: '本次保留原文。' })), assertPrefix),
      step('nonblocking-skip', (_payload, { signal }) => ({ chunks: (async function* () {
        await blocked.wait(signal); yield textReply(JSON.stringify({ action: 'skip', reason: '后台完成，仍保留原文。' })).chunks[0];
      })() }), assertPrefix),
      step('reject-main-tool', () => toolReply('write', { file_path: 'adaptive-background-side-effect.txt', content: 'MUST_NOT_EXECUTE' }, 'adaptive-background-write'), assertPrefix),
      step('reject-ungrounded-decision', payload => textReply(JSON.stringify(prepared(payload, summary, true))), assertPrefix),
      step('mode-switch-late-compress', payload => {
        const reply = JSON.stringify(prepared(payload, 'ADAPTIVE_LATE_RESULT_MUST_NOT_PUBLISH'));
        return { chunks: (async function* () {
          // Deliberately produce a bounded late result after transport cancellation.
          await late.wait(); lateProduced = true; trace({ type: 'fault/adaptive-late-generated' });
          yield textReply(reply).chunks[0];
        })() };
      }, assertPrefix),
      step('valid-compression', payload => textReply(JSON.stringify(prepared(payload))), assertPrefix),
    ] },
    { id: 'private', match: payload => containsTool('todo_write')(payload) && !adaptiveMatch(payload) && userText(payload).includes('PRIVATE_SIM_CONTEXT_ONLY'),
      steps: [step('private-source', () => textReply('独立会话材料：' + privateKey))] }, auxiliary(),
  ] });
  return { model, gates: [blocked, late], omd: { keepTailEvents: 1, digestWindow: 6, prepareContinueTokens: 1, automaticReplace: true, surgeryCooldownSteps: 0, backgroundMaxRetries: 0 }, async run({ host, checks, provider }) {
    publicId = await host.createSession();
    await checks.check('默认原版异步及主动模式设置', async () => {
      assert.equal((await host.api(contextPath())).compressionMode, 'pipeline');
      assert.equal((await host.api('/context/mode?session=' + publicId, { mode: 'adaptive' })).compressionMode, 'adaptive');
    });
    await host.prompt(publicId, prompt); await host.idle(publicId);
    const original = await host.control('/snapshot?session=' + publicId);
    const sourceEvent = original.events.find(event => event.type === 'tool/result' && event.data.message.toolCallId === 'adaptive-read');
    assert.ok(sourceEvent, 'native read result must exist before testing compression'); sourceSeq = sourceEvent.seq;
    const waitContext = (predicate, description) => until(async () => { const view = await host.api(contextPath()); return !view.adaptive.running && predicate(view) && view; }, { signal: host.signal, description });
    const prepare = () => host.api('/context/prepare?session=' + publicId, {});
    await prepare(); await waitContext(view => view.adaptive.lastDecision === 'skip', 'adaptive skip');
    await checks.check('后台skip不发布摘要或替换', async () => {
      const view = await host.api(contextPath()); assert.equal(view.records.length, 0); assert.equal(view.pending, null);
      assert.deepEqual((await host.control('/snapshot?session=' + publicId)).messages, original.messages);
    });
    await host.prompt(publicId, '保持现状继续。'); await host.idle(publicId);
    await prepare(); await blocked.entered;
    await host.prompt(publicId, '后台尚未结束时继续主回合。');
    await until(async () => {
      const state = await host.api('/state?session=' + publicId), snapshot = await host.control('/snapshot?session=' + publicId);
      return state.running === 'idle' && JSON.stringify(snapshot.events).includes('ADAPTIVE_MAIN_CONTINUED_WITH_BACKGROUND_BLOCKED');
    }, { signal: host.signal, description: 'main continues while adaptive producer remains blocked' });
    await checks.check('独立后台Gate挂住时主回合真实完成', async () => {
      assert.equal(blocked.snapshot().state, 'waiting'); assert.equal((await host.api(contextPath())).adaptive.running, true);
      assert.equal((await host.api('/state?session=' + publicId)).running, 'idle');
    });
    blocked.release(); await waitContext(view => ['skip', 'stale'].includes(view.adaptive.lastDecision), 'nonblocking adaptive cleanup');
    await prepare(); await waitContext(view => /工具/.test(view.adaptive.error ?? ''), 'reject background native tool call');
    await checks.check('后台主工具调用被拒且无真实副作用', async () => {
      await assert.rejects(readFile(join(host.workspace, 'adaptive-background-side-effect.txt')), { code: 'ENOENT' });
      assertNoLeak((await host.control('/snapshot?session=' + publicId)).events, 'adaptive-background-write');
      const view = await host.api(contextPath()); assert.equal(view.records.length, 0); assert.equal(view.pending, null);
      assert.equal(provider.requests.filter(request => adaptiveMatch(request.payload)).length, 3);
    });
    await prepare(); await waitContext(view => /原话/.test(view.adaptive.error ?? ''), 'reject invented decision quote');
    await checks.check('非法用户决定引用保留原文', async () => {
      const view = await host.api(contextPath()); assert.equal(view.records.length, 0); assert.equal(view.pending, null);
      assert.ok(JSON.stringify((await host.control('/snapshot?session=' + publicId)).messages).includes(longId));
    });
    await prepare(); await late.entered;
    await host.api('/context/mode?session=' + publicId, { mode: 'pipeline' }); late.release();
    await until(() => lateProduced, { signal: host.signal, description: 'actual adaptive result generated after switching mode' });
    await host.idle(publicId);
    await checks.check('模式切回后真实迟到压缩结果不发布', async () => {
      const view = await host.api(contextPath()); assert.equal(view.compressionMode, 'pipeline'); assert.equal(view.records.length, 0); assert.equal(view.pending, null);
      assertNoLeak(view, 'ADAPTIVE_LATE_RESULT_MUST_NOT_PUBLISH');
      assertNoLeak((await host.control('/snapshot?session=' + publicId)).events, 'ADAPTIVE_LATE_RESULT_MUST_NOT_PUBLISH');
    });
    await host.api('/context/mode?session=' + publicId, { mode: 'adaptive' });
    await host.prompt(publicId, '重新建立主请求路由后继续。'); await host.idle(publicId);
    await prepare(); const staged = await waitContext(view => view.pending?.source === 'adaptive', 'adaptive pending compression');
    await checks.check('成功结果仅准备摘要并等待安全边界', () => {
      assert.equal(staged.records.length, 1); assert.equal(staged.records[0].mode, 'raw'); assert.equal(staged.lastReplacement, null);
      assert.equal(staged.adaptive.lastDecision, 'compress'); assert.equal(prefixChecks, 6);
    });
    privateId = await host.createSession(); await host.api('/scope?session=' + privateId, { scope: 'session' });
    await host.prompt(privateId, 'PRIVATE_SIM_CONTEXT_ONLY 独立会话保存一条查询材料。'); await host.idle(privateId);
    await host.prompt(publicId, '应用已准备的压缩，执行原文回查。'); await host.idle(publicId);
    await checks.check('安全边界应用及省略材料的原文搜索和会话隔离', async () => {
      const view = await host.api(contextPath()); assert.equal(view.pending, null); assert.equal(view.records[0].mode, 'brief'); assert.ok(view.lastReplacement);
      assert.equal(await readFile(join(host.workspace, 'adaptive.txt'), 'utf8'), source);
      const native = await host.durable(publicId); assertToolPairs(native.events); assert.match(JSON.stringify(native.events), /ADAPTIVE_ORIGINAL_SEARCH_COMPLETE/);
      assert.equal(provider.requests.filter(request => adaptiveMatch(request.payload)).length, 6);
    });
    await host.restart({ crash: true }); await host.createSession({ id: publicId });
    await checks.check('重启恢复主动模式、摘要表示和原始事件', async () => {
      const view = await host.api(contextPath()); assert.equal(view.compressionMode, 'adaptive'); assert.equal(view.records[0].mode, 'brief'); assert.ok(view.lastReplacement);
      const native = await host.durable(publicId); assert.ok(JSON.stringify(native.events).includes(longId)); assertToolPairs(native.events);
    });
    await host.prompt(publicId, '重启后继续。'); await host.idle(publicId);
    return { sessionId: publicId, privateSessionId: privateId, prefixChecks, originalSourceSeq: sourceSeq, lateProduced };
  } };
}

function contextAdaptiveAuto({ trace }) {
  const sourceId = 'AUTO_ORIGINAL_900719925474099312345678901234567890';
  const source = sourceId + ' 自动检查中文原文\n' + '自动调度场景中的真实长工具资料。'.repeat(800);
  const quote = '自动检查保留原文回查', summary = '真实工具完成 auto.txt 的写入与读取。';
  let latestMain, mainCalls = 0, backgroundCalls = 0, prefixChecks = 0;
  const remember = payload => { latestMain = structuredClone(payload); mainCalls++; };
  const model = new ScriptedModel({ trace, lanes: [
    { id: 'main', match: mainMatch, steps: [
      step('auto-write', () => toolReply('write', { file_path: 'auto.txt', content: source }, 'auto-write'), payload => {
        assert.equal(backgroundCalls, 0, 'automatic check must wait for sufficient material'); remember(payload);
      }),
      step('auto-read', () => toolReply('read', { file_path: 'auto.txt' }, 'auto-read'), payload => {
        assert.equal(backgroundCalls, 0, 'a partial tool history must not trigger a background check'); remember(payload);
      }),
      step('auto-material-ready', () => textReply('AUTO_MATERIAL_READY'), payload => {
        assert.equal(backgroundCalls, 0, 'background check must wait for the successful request containing complete tool material');
        assert.ok(toolResults(payload).includes(sourceId)); remember(payload);
      }),
      step('auto-after-apply', () => textReply('AUTO_COMPRESSION_APPLIED'), payload => {
        remember(payload); assert.ok(JSON.stringify(payload.messages).includes(summary));
        assert.ok(!JSON.stringify(payload.messages).includes(sourceId), 'explicit apply must remove the original tool payload from the next native model request');
        assert.ok(JSON.stringify(payload.messages).includes(quote)); assert.equal(backgroundCalls, 1);
      }),
    ] },
    { id: 'adaptive', match: adaptiveMatch, steps: [step('automatically-compress', payload => {
      const candidate = adaptiveInput(payload).candidates.find(candidate => candidate.id === 'new-window');
      assert.ok(candidate, 'automatic check must offer an actual original window');
      assert.ok(candidate.messages.some(item => payload.messages[item.index]?.role === 'tool' && contentText(payload.messages[item.index].content).includes(sourceId)), 'automatic candidate must cover the actual read result');
      const decision = candidate.decision_sources.find(item => contentText(payload.messages[item.index]?.content).includes(quote));
      assert.ok(decision, 'automatic decision source must map to the original user message');
      backgroundCalls++;
      const reply = textReply(JSON.stringify({ action: 'compress', reason: '工具往返已完整，可以整理。', choices: [{ id: candidate.id, action: 'brief' }],
        prepared: { summary, documents: [], decisions: [{ seq: decision.seq, quote, text: quote }] } }));
      // A declared fixture value only checks the actual provider→host→OMD path.
      // It does not establish cache behavior at any external model provider.
      reply.chunks[0].usage = { ...usage, prompt_tokens_details: { cached_tokens: 123 } };
      return reply;
    }, payload => {
      assert.equal(mainCalls, 3, 'automatic background request must follow the complete successful main request');
      assertAdaptivePrefix(latestMain, payload); prefixChecks++;
    })] }, auxiliary(),
  ] });
  return { model, omd: { digestEvery: 6, digestWindow: 6, keepTailEvents: 1, prepareContinueTokens: 1, coordinatorMinGapMs: 0,
    traceEnabled: false, automaticReplace: false, backgroundMaxRetries: 0 }, async run({ host, checks, provider }) {
    const id = await host.createSession(), contextPath = '/context?session=' + id;
    await host.api('/context/mode?session=' + id, { mode: 'adaptive' });
    await host.prompt(id, '自动检查场景：写入并读取 auto.txt。用户决定：' + quote + '。');
    const staged = await until(async () => {
      const view = await host.api(contextPath);
      if (view.adaptive.error) throw Error('automatic adaptive check failed: ' + view.adaptive.error);
      return !view.adaptive.running && view.pending?.source === 'adaptive' && view;
    }, { signal: host.signal, description: 'automatic adaptive pending plan without preparation API' });
    await host.idle(id);
    await checks.check('无需预处理接口由完整主请求自动产生压缩计划', async () => {
      assert.equal(mainCalls, 3); assert.equal(backgroundCalls, 1); assert.equal(prefixChecks, 1);
      assert.equal(staged.records.length, 1); assert.equal(staged.records[0].mode, 'raw'); assert.equal(staged.adaptive.lastDecision, 'compress');
      assert.equal(staged.lastReplacement, null); assert.equal(staged.preparing, false); assert.equal(staged.coordinating, false);
      assert.equal(await readFile(join(host.workspace, 'auto.txt'), 'utf8'), source);
      const snapshot = await host.control('/snapshot?session=' + id); assertToolPairs(snapshot.events);
      assert.match(JSON.stringify(snapshot.events), /AUTO_MATERIAL_READY/);
    });
    await checks.check('模拟缓存用量经过真实响应链路进入上下文和指标', async () => {
      assert.equal(staged.adaptive.cacheReadTokens, 123);
      const state = await host.api('/state?session=' + id); assert.equal(state.metrics.adaptive.calls, 1); assert.equal(state.metrics.adaptive.cacheReadTokens, 123);
      const request = provider.requests.find(request => adaptiveMatch(request.payload));
      assert.equal(request.chunks.at(-1).usage.prompt_tokens_details.cached_tokens, 123);
    });
    if (host.clockMode === 'virtual') await host.control('/clock', { advance: 60000 });
    await host.idle(id);
    await checks.check('已准备且没有新增材料时不重复后台调度', async () => {
      const view = await host.api(contextPath); assert.equal(view.pending.id, staged.pending.id); assert.equal(view.records.length, 1);
      assert.equal(provider.requests.filter(request => adaptiveMatch(request.payload)).length, 1); assert.equal(view.adaptive.running, false);
    });
    const applied = await host.api('/compact?session=' + id, {});
    await checks.check('明确应用自动生成的计划后摘要表示生效', async () => {
      assert.equal(applied.changed, true);
      const view = await host.api(contextPath); assert.equal(view.records[0].mode, 'brief'); assert.equal(view.pending, null); assert.ok(view.lastReplacement);
      assert.ok(JSON.stringify((await host.control('/snapshot?session=' + id)).messages).includes(summary));
    });
    await host.prompt(id, '核验已应用的自动压缩结果。'); await host.idle(id);
    await checks.check('自动压缩后的真实主请求继续且没有重复调用', async () => {
      assert.equal(mainCalls, 4); assert.equal(backgroundCalls, 1); assert.equal(provider.requests.filter(request => adaptiveMatch(request.payload)).length, 1);
      const native = await host.durable(id); assertToolPairs(native.events); assert.match(JSON.stringify(native.events), /AUTO_COMPRESSION_APPLIED/);
    });
    return { sessionId: id, automaticBackgroundCalls: backgroundCalls, prefixChecks, simulatedCacheReadTokens: 123 };
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
