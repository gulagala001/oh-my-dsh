import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScenario, runControls } from '../scripts/simulator/run.mjs';
import { ScriptedModel } from '../scripts/simulator/scene.mjs';
import { assertToolPairs } from '../scripts/simulator/assertions.mjs';

test('independent oracles reject deliberate defects and persist their evidence', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-sim-controls-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await runControls(directory); assert.equal(result.status, 'pass'); assert.equal(result.checks.length, 4);
  const saved = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8')); assert.ok(saved.checks.every(check => check.expected === 'detected'));
  assert.doesNotThrow(() => assertToolPairs([{ type: 'assistant/message', data: { message: { content: [{ type: 'tool-call', id: 'good', name: 'read' }] } } }, { type: 'tool/result', data: { message: { toolCallId: 'good' } } }]));
});

test('real isolated DSH completes tools, context, Dream, children and crash recovery', { timeout: 60000, skip: process.platform !== 'darwin' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-sim-native-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const report = await runScenario('full-lifecycle', { directory });
  assert.equal(report.status, 'pass', JSON.stringify(report.error));
  assert.ok(report.checks.some(check => check.name === '真实 SIGKILL 后原生恢复'));
  assert.ok(report.transcript.status === 'complete');
  const timeline = await readFile(join(directory, 'timeline.jsonl'), 'utf8'); assert.match(timeline, /prepare-public/); assert.match(timeline, /dream-global/);
  assert.doesNotMatch(await readFile(join(directory, 'host.log'), 'utf8'), /token=(?!\[redacted\])[\w-]+/);
});

test('unexpected model requests fail promptly rather than hanging at an unentered gate', { timeout: 15000, skip: process.platform !== 'darwin' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-sim-negative-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const definition = { id: 'unexpected-request', title: 'negative model route control', create({ trace }) {
    return { model: new ScriptedModel({ trace, lanes: [{ id: 'reject', match: () => false, steps: [] }] }), async run({ host }) {
      const id = await host.createSession(); await host.prompt(id, 'This request must be rejected.'); await new Promise(() => {});
    } };
  } };
  const report = await runScenario(definition, { directory, timeoutMs: 10000 });
  assert.equal(report.status, 'fail'); assert.equal(report.error.code, 'SIM_PROTOCOL'); assert.equal(report.timedOut, false);
  assert.ok(report.elapsedMs < 8000); assert.equal(report.transcript.status, 'unavailable');
  if (report.retainedWorkspace) t.after(() => rm(report.retainedWorkspace, { recursive: true, force: true }));
});

test('real watchdog expiry never becomes a successful report after late completion', { timeout: 15000, skip: process.platform !== 'darwin' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-sim-watchdog-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const definition = { id: 'watchdog-control', title: 'negative real deadline control', create({ trace }) {
    return { model: new ScriptedModel({ trace, lanes: [{ id: 'unused', match: () => false, steps: [] }] }), async run() { await new Promise(resolve => setTimeout(resolve, 300)); return {}; } };
  } };
  const report = await runScenario(definition, { directory, timeoutMs: 50 });
  assert.equal(report.status, 'fail'); assert.equal(report.timedOut, true); assert.equal(report.error.code, 'SIMULATION_DEADLINE');
  if (report.retainedWorkspace) t.after(() => rm(report.retainedWorkspace, { recursive: true, force: true }));
});
