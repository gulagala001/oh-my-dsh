import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { verificationFixture } from './fixtures/verification.mjs';
import { createTodoStore } from '../src/todolist.mjs';

const quote = 'Verify the fixture and preserve its evidence.';
async function link(f, files) {
  f.user(quote);
  await f.call({ op: 'excerpt', from: quote, to: quote, tasks: [{ title: 'Verify fixture', anchor: { from: quote, to: quote } }] });
  await f.verify({ op: 'link', links: files.map(path => ({ task: 'T1', kind: 'test', path })) });
}
const results = f => f.store.snapshot(f.session).tasks[0].links.map(item => item.lastRun);
function replaceShell(f, execute) {
  f.agent.ctx.tools.register({ name: f.shellName, parameters: { type: 'object', additionalProperties: true },
    output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'controlled native result' }] }, execute });
}
const completed = patch => ({ kind: 'foreground', exitCode: 0, signal: null, timedOut: false, aborted: false,
  timeoutMs: 300000, stdout: { text: 'CONTROLLED_RESULT', truncated: false }, stderr: { text: '', truncated: false }, ...patch });

test('verification uses the shipped native shell and preserves its execution identity and quoting', async t => {
  const f = verificationFixture(t), path = "check ' 中文.mjs";
  writeFileSync(join(f.dir, path), 'console.log("NATIVE_VERIFICATION_PASS")'); await link(f, [path]);
  const before = Date.now();
  assert.match(await f.verify({ op: 'run' }), /PASS.*NATIVE_VERIFICATION_PASS/);
  const outer = f.dispatches.findLast(exec => exec.name === 'verify_link'), shell = f.dispatches.findLast(exec => exec.name === f.shellName);
  assert.equal(shell.agent, outer.agent); assert.equal(shell.parent, outer.token);
  assert.equal(shell.rootCallId, outer.rootCallId); assert.notEqual(shell.callId, outer.callId);
  assert.equal(shell.arguments.timeoutMs, 300000); assert.equal(shell.arguments.run_in_background, false);
  assert.equal(shell.arguments.workdir, f.dir); assert.equal(shell.arguments.sandbox_permissions, undefined);
  const record = results(f)[0];
  assert.equal(record.pass, true);
  assert.equal(record.execution.tool, f.shellName);
  assert.equal(record.execution.callId, shell.callId);
  assert.equal(record.execution.rootCallId, shell.rootCallId);
  assert.equal(record.execution.command, shell.arguments.command);
  assert.equal(record.execution.workdir, shell.arguments.workdir);
  assert.equal(record.execution.exitCode, 0);
  assert.equal(record.execution.signal, null);
  assert.equal(record.execution.timeoutMs, shell.arguments.timeoutMs);
  assert.ok(record.startedAt >= before && record.finishedAt <= Date.now());
  assert.ok(record.finishedAt >= record.startedAt && record.durationMs >= 0);
  assert.deepEqual(createTodoStore().snapshot(f.session).tasks[0].links[0].lastRun, record, 'native execution provenance survives ledger recovery');
});

for (const mode of ['read-only', 'workspace-write']) test(`verification reaches the ${mode} policy boundary and cannot bypass a refusing sandbox`, async t => {
  const outside = mkdtempSync(join(tmpdir(), 'omd-verification-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const marker = join(outside, 'forbidden-write');
  const f = verificationFixture(t, { confine(_argv, policy) { throw Error('POLICY_FIXTURE_DENIED:' + policy.mode); } });
  writeFileSync(join(f.dir, 'check.mjs'), 'console.log("PRIOR_PASS")'); await link(f, ['check.mjs']);
  await f.verify({ op: 'run' }); const before = results(f);
  writeFileSync(join(f.dir, 'check.mjs'), `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'must not execute');`);
  f.session.append('sandbox/mode', { mode });
  assert.equal(f.policy.resolve({ session: f.session }).mode, mode);
  await assert.rejects(f.verify({ op: 'run' }), /POLICY_FIXTURE_DENIED/);
  assert.equal(f.confinements.length, 1); assert.equal(f.confinements[0].policy.mode, mode);
  assert.equal(f.confinements[0].policy.workspaceRoot, f.dir);
  assert.equal(existsSync(marker), false); assert.deepEqual(results(f), before);
});

test('native shell gate denial retains earlier evidence and completed tests before the denial', async t => {
  const f = verificationFixture(t);
  writeFileSync(join(f.dir, 'first.mjs'), 'console.log("FIRST_ORIGINAL")');
  writeFileSync(join(f.dir, 'policy-block.mjs'), 'console.log("SECOND_ORIGINAL")');
  await link(f, ['first.mjs', 'policy-block.mjs']); await f.verify({ op: 'run' }); const priorSecond = results(f)[1];
  writeFileSync(join(f.dir, 'first.mjs'), 'console.log("FIRST_UPDATED")');
  f.ctx.on('tools/pre-execute', (exec, next) => exec.name === f.shellName && exec.arguments.command.includes('policy-block.mjs')
    ? { kind: 'deny', reason: 'NATIVE_GATE_REJECTED' } : next(), { global: true });
  await assert.rejects(f.verify({ op: 'run' }), /NATIVE_GATE_REJECTED/);
  assert.match(results(f)[0].tail, /FIRST_UPDATED/); assert.deepEqual(results(f)[1], priorSecond);
});

test('PTC visibility permits verification only as a nested call and keeps the shell parent token', async t => {
  const f = verificationFixture(t);
  writeFileSync(join(f.dir, 'check.mjs'), 'console.log("PTC_NESTED_PASS")'); await link(f, ['check.mjs']);
  f.agent.ctx.tools.register({ name: 'verification_test_entry', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    async execute(_args, exec) {
      const result = await f.ctx.tools.execute({ name: 'verify_link', arguments: { op: 'run' }, agent: exec.agent, signal: exec.signal,
        callId: 'ptc-verification-child', rootCallId: exec.rootCallId, parent: exec.token });
      if (result.isError) throw Error(result.error.message);
      return result.value;
    } });
  // This test exercises the real PTC visibility/parent-token policy, not the
  // run_code language worker. Sample the allowlist as prompt assembly does.
  f.ctx.provide('ptcRuntime', { language: 'typescript', timeout: { defaultMs: 30000, maxMs: 30000 } });
  const { installPtcPresentation } = await import('../src/ptc.mjs');
  installPtcPresentation(f.agent.ctx, () => ['verification_test_entry']).sample(f.agent);
  f.refreshTools();
  const direct = await f.invoke('verify_link', { op: 'run' }); assert.equal(direct.isError, true);
  assert.equal(direct.error.info.code, 'UNKNOWN_TOOL');
  const result = await f.invoke('verification_test_entry', {}); assert.equal(result.isError, false, JSON.stringify(result));
  assert.match(result.value, /PTC_NESTED_PASS/);
  const outer = f.dispatches.findLast(exec => exec.name === 'verify_link'), shell = f.dispatches.findLast(exec => exec.name === f.shellName);
  assert.ok(outer.parent); assert.equal(shell.parent, outer.token); assert.equal(shell.rootCallId, outer.rootCallId);
});

test('a ledger run without the native runner refuses execution and leaves evidence unchanged', async t => {
  const f = verificationFixture(t);
  writeFileSync(join(f.dir, 'check.mjs'), 'console.log("PRIOR_PASS")'); await link(f, ['check.mjs']); await f.verify({ op: 'run' });
  const before = results(f), answer = await f.store.execVerifyLink(f.session, { op: 'run' }, f.dir, new AbortController().signal);
  assert.equal(answer.isError, true); assert.match(answer.text, /Native shell execution is unavailable/); assert.deepEqual(results(f), before);
});

test('sandbox result markers never become passing evidence even with exit code zero', async t => {
  for (const field of ['denied', 'runnerFailed']) await t.test(field, async t => {
    const f = verificationFixture(t); writeFileSync(join(f.dir, 'check.mjs'), 'console.log("PRIOR_PASS")');
    await link(f, ['check.mjs']); await f.verify({ op: 'run' }); const before = results(f);
    replaceShell(f, () => completed({ sandbox: { mode: 'read-only', [field]: true } }));
    await assert.rejects(f.verify({ op: 'run' }), /sandbox blocked|could not start/i); assert.deepEqual(results(f), before);
  });
});

test('unexpected promoted jobs are stopped by their exact native job id and never counted as success', async t => {
  const f = verificationFixture(t), stopped = [];
  writeFileSync(join(f.dir, 'check.mjs'), 'console.log("PRIOR_PASS")'); await link(f, ['check.mjs']); await f.verify({ op: 'run' }); const before = results(f);
  replaceShell(f, () => ({ kind: 'promoted', jobId: 'exact-verification-job', timeoutMs: 300000, output: 'still running' }));
  f.agent.ctx.tools.register({ name: 'job_kill', parameters: { type: 'object', additionalProperties: true },
    output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'stopped' }] },
    execute(args, exec) { stopped.push({ args, exec }); return { stopped: true }; } });
  await assert.rejects(f.verify({ op: 'run' }), /no completed foreground result/);
  assert.equal(stopped.length, 1); assert.equal(stopped[0].args.job_id, 'exact-verification-job');
  const outer = f.dispatches.findLast(exec => exec.name === 'verify_link');
  assert.equal(stopped[0].exec.parent, outer.token); assert.deepEqual(results(f), before);
});

test('native deferred context from verification is forwarded to its outer result', async t => {
  const f = verificationFixture(t), context = createUserMessage({ content: [{ type: 'text', text: 'NATIVE_DEFERRED_CONTEXT' }], source: { kind: 'plugin:verification-test' } });
  writeFileSync(join(f.dir, 'check.mjs'), 'unused'); await link(f, ['check.mjs']);
  replaceShell(f, (_args, exec) => { exec.deferContext(context); return completed(); });
  const result = await f.invoke('verify_link', { op: 'run' });
  assert.equal(result.isError, false); assert.deepEqual(result.additionalContexts, [context]);
});
