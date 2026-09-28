import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import * as installedSession from '@deepseek-ai/dsh-session';

test('master recovers a failed OMD tool finalization before step closure and preserves the result through fork', {
  skip: !process.env.OMD_DSH_CLI && typeof installedSession.ToolCallRecovery !== 'function' && 'Run with a host that includes ToolCallRecovery', timeout: 90000,
}, async t => {
  const f = await frontendFixture(t, {
    headless: true,
    async setupWorkspace({ root, home }) {
      const file = join(root, 'recovery-probe.mjs');
      await writeFile(file, `export const inject = ['tools', 'webServer'];
export async function apply(ctx) {
  const entry = [...ctx.loader.entries()].find(row => row.options.name === '@deepseek-ai/dsh-tools');
  const { TOOL_RUNTIME_SCHEDULER } = await entry.parent.tree.import('@deepseek-ai/dsh-tools');
  const { ToolCallRecovery } = await entry.parent.tree.import('@deepseek-ai/dsh-session');
  const scheduler = ctx.tools[TOOL_RUNTIME_SCHEDULER], finalize = scheduler.finalize;
  let failed = false;
  scheduler.finalize = async (exec, result) => {
    if (exec.callId === 'prep-write' && !failed) { failed = true; throw Error('PREP_TERMINAL_FINALIZER_FAILURE'); }
    return finalize(exec, result);
  };
  ctx.effect(() => () => { scheduler.finalize = finalize; });
  const sessions = new Map();
  ctx.on('agent/created', ({ agent }) => sessions.set(agent.session.id, agent.session), { global: true });
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/prep-recovery', handler(req, res) {
    const id = new URL(req.url, 'http://localhost').searchParams.get('session');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ supportsRecovery: typeof ToolCallRecovery === 'function', events: sessions.get(id)?.snapshotEvents() ?? [] }));
  } }));
}`);
      await writeFile(join(home, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'prep-recovery-probe', name: pathToFileURL(file).href }] }]));
    },
  });
  const probe = id => fetch(f.origin + '/prep-recovery?session=' + id).then(response => response.json());
  assert.equal((await probe(f.sessionId)).supportsRecovery, true, 'the test runs the new session recovery implementation');
  let requests = 0;
  const file = join(f.workspace, 'finalized-write.txt');
  f.replyWith(() => ++requests === 1
    ? { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'prep-write', type: 'function', function: { name: 'write', arguments: JSON.stringify({ file_path: file, content: 'SIDE_EFFECT_COMMITTED' }) } }] }, finish_reason: 'tool_calls' }
    : { delta: { role: 'assistant', content: '恢复后继续工作。' }, finish_reason: 'stop' });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: '写入测试文件并检查恢复' }] });
  const events = await until(async () => {
    const { events } = await probe(f.sessionId);
    return events.findLast(event => event.type === 'turn/end')?.data.reason.kind === 'error' && events;
  });
  assert.equal(await readFile(file, 'utf8'), 'SIDE_EFFECT_COMMITTED');
  const call = events.find(event => event.type === 'tool/call' && event.data.callId === 'prep-write');
  const results = events.filter(event => event.type === 'tool/result' && event.data.message.toolCallId === 'prep-write');
  assert.equal(results.length, 1);
  assert.equal(results[0].data.message.isError, true);
  assert.equal(results[0].data.error.code, 'TOOL_OUTCOME_UNKNOWN');
  assert.deepEqual(results[0].sourceEventSeqs, [call.seq]);
  const end = events.find(event => event.type === 'step/end' && event.data.turn === call.data.turn && event.data.step === call.data.step);
  assert.ok(call.seq < results[0].seq && results[0].seq < end.seq);
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: '继续检查已写入文件' }] });
  await until(async () => (await f.api('/state?session=' + f.sessionId)).running === 'idle' && requests >= 2);
  const fork = await f.rpc('session/fork', { sessionId: f.sessionId });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: fork.sessionId, mode: 'queue', content: [{ type: 'text', text: '检查继承的失败工具结果' }] });
  await until(async () => (await f.api('/state?session=' + fork.sessionId)).running === 'idle');
  const inherited = (await probe(fork.sessionId)).events.filter(event => event.type === 'tool/result' && event.data.message.toolCallId === 'prep-write');
  assert.equal(inherited.length, 1);
  assert.equal(inherited[0].data.message.isError, true);
});
