import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FACT_SUMMARY_RULES, PREPARE_SYSTEM, COORDINATE_SYSTEM, FULL_COMPACT_SYSTEM, PREPARE_TOOL, COORDINATE_TOOL, FULL_COMPACT_TOOL, SUMMARY_PROMPT_VERSION } from '../src/context/prompts.mjs';
import { candidateInput, coordinatorInput, newRecord } from '../src/context/core.mjs';
import { ContextPipeline, contextConfig } from '../src/context/pipeline.mjs';
import { FixtureSession, system, user, exchange, adapter } from './context-fixture.mjs';

test('every summary writer uses the same plain in-range factual contract', () => {
  for (const prompt of [PREPARE_SYSTEM, COORDINATE_SYSTEM, FULL_COMPACT_SYSTEM]) {
    assert.ok(prompt.includes(FACT_SUMMARY_RULES));
    assert.match(prompt, /actions taken, changes made, and observed results, including actual failures/);
    assert.match(prompt, /Do not write future plans, to-dos, unfinished-work lists/);
    assert.match(prompt, /No fixed sections, headings, bullet lists/);
    assert.doesNotMatch(prompt, /Carry existing unresolved requirements|Keep the user's effective requirements|next concrete work that remains/);
  }
  for (const description of [PREPARE_TOOL.parameters.properties.summary.description, COORDINATE_TOOL.parameters.properties.choices.items.properties.summary.description, FULL_COMPACT_TOOL.parameters.properties.summary.description]) {
    assert.match(description, /No .*future plans/);
    assert.match(description, /unfinished-work lists/);
  }
  assert.match(COORDINATE_SYSTEM, /They are not sources for merged text/);
  assert.match(COORDINATE_SYSTEM, /Do not update an old record with later work/);
});

test('preparation identifies selected events, not reference history, as summary sources', () => {
  const session = new FixtureSession(); system(session); user(session, 'Make a realistic model.');
  const earlier = exchange(session, 'Previously installed dependencies.');
  const current = exchange(session, 'Created styles.css.');
  const input = candidateInput(session, current, 8);
  assert.deepEqual(input.summary_scope.event_seqs, current.map(e => e.seq));
  assert.ok(input.reference.some(e => e.seq === earlier[1].seq));
  assert.deepEqual(input.summary_scope.reference_only_fields, ['reference', 'user_messages']);
  const record = newRecord(session, current, { summary: 'Created styles.css.', documents: [] }, { scope: 'session', project: 'test' });
  user(session, 'Later correction'); exchange(session, 'Later render result.');
  const state = { records: [record], review: {}, binding: { scope: 'session', project: 'test' } };
  const review = coordinatorInput(session, state, contextConfig({ coordinatorRecentEvents: 4 }));
  assert.equal(review.summary_scope.source, 'selected records only');
  assert.ok(review.summary_scope.reference_only_fields.includes('recent_events'));
  assert.ok(review.summary_scope.reference_only_fields.includes('user_messages'));
  assert.ok(review.recent_events.some(e => e.text.includes('Later render result.')));
  assert.deepEqual(review.records.map(r => r.id), [record.id]);
});

test('policy upgrade invalidates only pending generated merges, preserving archives and transactions', t => {
  const dir = mkdtempSync(join(tmpdir(), 'summary-policy-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = new FixtureSession(); system(session); user(session, 'Keep original requirements.');
  const hub = { store: { dir }, scope: () => ({ mode: 'session', project: 'test' }), config: () => ({}), ctx: {}, action() {}, call() { throw Error('No model should be called'); } };
  const pipeline = new ContextPipeline(hub, adapter); t.after(() => pipeline.dispose());
  const state = pipeline.state(session);
  state.records.push(newRecord(session, exchange(session), { summary: 'An existing archived record.', documents: [] }, state.binding));
  state.summaryPromptVersion = 2; state.pending = { id: 'old-plan', choices: [{ action: 'merge', summary: 'Old future plan.' }] };
  const transaction = { id: 'durable-in-flight', operations: [] }; state.transaction = transaction;
  const before = JSON.stringify(state.records), log = JSON.stringify(session.snapshotEvents());
  pipeline.state(session);
  assert.equal(state.summaryPromptVersion, SUMMARY_PROMPT_VERSION); assert.equal(state.pending, null);
  assert.equal(JSON.stringify(state.records), before); assert.equal(JSON.stringify(session.snapshotEvents()), log);
  assert.equal(state.transaction, transaction); assert.equal(pipeline.jobs.size, 0); assert.equal(pipeline.timers.size, 0);
  state.summaryPromptVersion = 2; state.pending = { id: 'existing-brief', choices: [{ action: 'brief' }] };
  pipeline.state(session); assert.equal(state.pending.id, 'existing-brief');
});
