import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash } from './scenarios.mjs';

// Reuse the existing strict protocol model and isolated real DSH launcher.
// No product scheduler, loop, stop/resume or tool contract is replaced.
export async function hostWorkflow({ root, directory, phase, repeats, size }) {
  const load = file => import(pathToFileURL(join(root, 'scripts/simulator', file)).href);
  const [{ SimulationHost }, { createSimulationProvider }, { ScriptedModel }, replies] = await Promise.all([
    load('host.mjs'), load('provider.mjs'), load('scene.mjs'), load('replies.mjs'),
  ]);
  const { toolReply, textReply, userText, toolNames } = replies;
  const lastGoal = payload => {
    for (const message of payload.messages.filter(item => item.role === 'tool').reverse()) {
      try { const value = JSON.parse(typeof message.content === 'string' ? message.content : message.content.map(item => item.text ?? '').join('\n')); if (value.goal?.id) return value.goal; } catch {}
    }
    throw Error('Native goal receipt missing');
  };
  const main = [], children = { A: [], B: [] };
  for (let index = 0; index <= repeats; index++) {
    main.push(
      { id: `goal-${index}`, reply: () => toolReply('create_goal', { objective: 'Verify the synthetic source with two workflow readers', max_goal_rounds: 2 }, `goal-${index}`) },
      { id: `get-${index}`, reply: () => toolReply('get_goal', {}, `get-${index}`) },
      { id: `workflow-${index}`, reply: () => toolReply('workflow', { meta: { name: 'performance-readers', description: 'Read the same synthetic file in two real child agents' },
        script: "return await parallel([() => agent('PERF_CHILD_A read fixture.js'), () => agent('PERF_CHILD_B read fixture.js')])" }, `workflow-${index}`) },
      { id: `complete-${index}`, reply: payload => { const goal = lastGoal(payload); return toolReply('update_goal', { goal_id: goal.id, revision: goal.revision, action: 'complete' }, `complete-${index}`); } },
      { id: `done-${index}`, reply: () => textReply('PERF_WORKFLOW_DONE') },
    );
    for (const kind of ['A', 'B']) children[kind].push(
      { id: `read-${index}`, reply: () => toolReply('read', { file_path: 'fixture.js', limit: 40 }, `child-${kind}-${index}`) },
      { id: `done-${index}`, expect: payload => assert.ok(payload.messages.some(item => item.role === 'tool' && JSON.stringify(item.content).includes('synthetic-line-39'))), reply: () => textReply(`PERF_CHILD_${kind}_DONE`) },
    );
  }
  const trace = [];
  const model = new ScriptedModel({ trace: entry => trace.push(entry), lanes: [
    { id: 'main', match: payload => toolNames(payload).includes('workflow') && !userText(payload).includes('PERF_CHILD_'), steps: main },
    ...['A', 'B'].map(kind => ({ id: 'child-' + kind, match: payload => toolNames(payload).includes('read') && userText(payload).includes(`PERF_CHILD_${kind} read`), steps: children[kind] })),
    { id: 'title', match: payload => !payload.tools?.length && JSON.stringify(payload.messages[0]?.content).includes('Create a concise title for an AI coding-assistant session'),
      steps: [{ id: 'title', repeat: 100, optional: true, reply: () => textReply('Synthetic workflow benchmark') }] },
  ] });
  const provider = await createSimulationProvider({ respond: (payload, context) => model.respond(payload, context) });
  const hostRoot = join(directory, 'host'); await mkdir(hostRoot, { recursive: true });
  const host = new SimulationHost({ root: hostRoot, provider, clock: 'real', isolation: 'process', trace: entry => trace.push(entry),
    omd: { adaptiveAutoEnabled: false, automaticReplace: false, dreamAutoEnabled: false } });
  try { await host.prepare(); await host.start(); }
  catch (error) { await host.close(); await provider.close(); throw error; }
  const body = Array.from({ length: size }, (_, i) => `synthetic-line-${i}`).join('\n');
  await writeFile(join(host.workspace, 'fixture.js'), body);
  let serial = 0, diagnostics;
  return { fingerprint: hash({ version: 1, name: 'host-workflow', body, children: 2 }), stats: { fileBytes: Buffer.byteLength(body), children: 2, readsPerChild: 1 }, async run(signal) {
    signal.throwIfAborted(); const start = performance.now(), wallStart = Date.now();
    const sessionId = await phase('host.createSession', () => host.createSession());
    await phase('host.prompt', () => host.prompt(sessionId, `PERF_PARENT_${serial++}. Create a goal to verify the source, run two workflow readers and complete the goal.`));
    await phase('host.waitForIdle', () => host.idle(sessionId));
    const snapshot = await phase('host.readEvents', () => host.control('/snapshot?session=' + sessionId));
    const results = snapshot.events.filter(event => event.type === 'tool/result');
    assert.equal(results.length, 4); assert.ok(results.every(event => !event.data.message.isError), JSON.stringify(results));
    const workflow = results.find(event => event.data.message.toolCallId.startsWith('workflow-'));
    assert.ok(JSON.stringify(workflow).includes('PERF_CHILD_A_DONE')); assert.ok(JSON.stringify(workflow).includes('PERF_CHILD_B_DONE'));
    const completed = results.find(event => event.data.message.toolCallId.startsWith('complete-'));
    assert.ok(JSON.stringify(completed).includes('complete'));
    const callTimes = new Map(snapshot.events.filter(event => event.type === 'tool/call').map(event => [event.data.callId, event]));
    const nativeStages = results.map(event => { const call = callTimes.get(event.data.message.toolCallId); return { tool: call?.data.name, elapsedMs: call && event.time - call.time }; });
    diagnostics = { nativeFirstResultMs: Number.isFinite(results[0]?.time) ? Math.max(0, results[0].time - wallStart) : null, nativeStages, completedToolCalls: results.length, childReadCount: 2, promptToCheckedResultMs: performance.now() - start };
    return { workflowChildren: 2, childResults: ['PERF_CHILD_A_DONE', 'PERF_CHILD_B_DONE'], goal: 'complete', sourceHash: hash(body) };
  }, diagnostics: () => diagnostics, cancel: null, async close() {
    try { model.assertComplete(); provider.assertHealthy(); }
    finally { await host.close(); await provider.close(); }
  } };
}
