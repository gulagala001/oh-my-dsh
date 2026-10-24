import test from 'node:test';
import assert from 'node:assert/strict';
import { FixtureSession, user } from './context-fixture.mjs';
import { searchOriginal, originalEvent } from '../src/context/original-search.mjs';
import { DreamSources } from '../src/dream/sources.mjs';

test('reasoning-only originals never return search references that cannot reopen their full text', async () => {
  const session = new FixtureSession();
  session.append('assistant/message', { message: { id: 'thinking-only', role: 'assistant',
    source: { kind: 'model', model: 'fixture' }, content: [{ type: 'reasoning', text: '早期思考 REASONING_ONLY_41' }] } }, { surfaceOp: 'append' });
  const before = structuredClone(session.snapshotEvents());
  const page = await searchOriginal(session, { query: 'REASONING_ONLY_41' });
  assert.equal(page.totalMatches, 0);
  assert.deepEqual(page.results, []); assert.equal(page.nextCursor, null);
  assert.deepEqual(session.snapshotEvents(), before);
});

test('mixed assistant messages search their recorded body and reopen it through the existing original reader', async () => {
  const session = new FixtureSession();
  const event = session.append('assistant/message', { message: { id: 'mixed-body', role: 'assistant',
    source: { kind: 'model', model: 'fixture' }, content: [
      { type: 'reasoning', text: '早期思考 REASONING_ONLY_42' },
      { type: 'text', text: '已读取并核对实际结果 ORIGINAL_BODY_42。' },
    ] } }, { surfaceOp: 'append' });
  user(session, '用户原话 ORIGINAL_USER_42。');
  assert.equal((await searchOriginal(session, { query: 'REASONING_ONLY_42' })).totalMatches, 0);
  const page = await searchOriginal(session, { query: 'ORIGINAL_BODY_42' });
  assert.deepEqual(page.results.map(r => r.seq), [event.seq]);
  assert.equal(page.results[0].snippets[0].kind, 'text');
  const { sessionId, from, to } = page.results[0].recall;
  const reopened = await DreamSources.prototype.original.call({ async read() { return { events: session.snapshotEvents() }; } }, sessionId, from, to);
  assert.equal(reopened[0].text, '已读取并核对实际结果 ORIGINAL_BODY_42。');
  assert.equal((await searchOriginal(session, { query: 'ORIGINAL_USER_42' })).totalMatches, 1);
});

test('PTC source validation keeps prior call identities and local overrides isolated until success', () => {
  const event = content => ({ type: 'tool/ptc-dispatch', data: { rootCallId: 'root', parentCallId: 'root', subCallId: 'root:ptc:1',
    name: 'read', arguments: {}, isError: false, content } });
  const prior = [['root', 'run_code'], ['echo', 'recall']];
  const echo = { type: 'tool-result', toolCallId: 'echo', content: [{ type: 'not-source-material' }] };
  const known = new Map(prior);
  assert.ok(originalEvent(event([echo]), known), 'an earlier recall echo must remain excluded from validation and source text');
  assert.equal(known.get('echo'), 'recall');
  const override = { type: 'tool-call', id: 'echo', name: 'read', arguments: {} };
  const rejected = new Map(prior);
  assert.equal(originalEvent(event([override, echo]), rejected), null, 'the new local identity requires valid read content');
  assert.deepEqual([...rejected], prior, 'invalid content cannot publish a local override or a dispatch identity');
  const accepted = new Map(prior);
  const result = originalEvent(event([override, { ...echo, content: [{ type: 'text', text: '完整结果 😀 9007199254740993' }] }]), accepted);
  assert.ok(result.text.includes('完整结果 😀 9007199254740993'));
  assert.equal(accepted.get('echo'), 'read'); assert.equal(accepted.get('root:ptc:1'), 'read');
});

test('original search folds ASCII only and preserves exact-match ranking', async () => {
  const session = new FixtureSession();
  user(session, 'K ſ İ ı');
  user(session, 'k s i');
  user(session, 'K S I');
  const page = await searchOriginal(session, { query: 'K S I' });
  assert.equal(page.totalMatches, 2);
  assert.deepEqual(page.results.map(({ seq, score }) => [seq, score]), [[2, 400000], [1, 390000]]);
  assert.equal((await searchOriginal(session, { query: 'K' })).totalMatches, 1);
});

test('original search treats punctuation as literals in folded phrases', async () => {
  const session = new FixtureSession();
  const query = '[Foo]+(bar)?.*\\path^$';
  user(session, '[foo]+(BAR)?.*\\PATH^$');
  user(session, query);
  user(session, 'FOO BAR PATH');
  const page = await searchOriginal(session, { query });
  assert.deepEqual(page.results.slice(0, 2).map(({ seq, score }) => [seq, score]), [[1, 400000], [0, 390000]]);
  assert.equal(page.results[1].snippets[0].text, '[foo]+(BAR)?.*\\PATH^$');
  user(session, '_A/A/A');
  assert.equal((await searchOriginal(session, { query: 'a/a' })).results[0].score, 390000,
    'rejecting a word boundary must still consider the next overlapping literal match');
});

test('original search preserves chunk boundaries, overlapping matches and UTF-16 cursors', async () => {
  const session = new FixtureSession();
  user(session, 'x'.repeat(32766) + ' RUN_CODE 😀 \ud800');
  user(session, '_run_code run_code_extra RUN_CODE \udc00');
  user(session, 'run_code');
  const first = await searchOriginal(session, { query: 'run_code', limit: 1 });
  assert.equal(first.totalMatches, 3); assert.equal(first.results[0].seq, 2);
  const next = await searchOriginal(session, { query: 'run_code', limit: 1, cursor: first.nextCursor });
  assert.equal(next.results[0].seq, 0);
  assert.ok(next.results[0].snippets[0].text.includes('RUN_CODE 😀 \ud800'));
  user(session, 'new run_code');
  const last = await searchOriginal(session, { query: 'run_code', limit: 1, cursor: next.nextCursor });
  assert.equal(last.totalMatches, 3); assert.equal(last.results[0].seq, 1); assert.equal(last.nextCursor, null);
  session.events[0].data.content[0].text += 'changed';
  await assert.rejects(searchOriginal(session, { query: 'run_code', limit: 1, cursor: first.nextCursor }), /快照已变化/);
});

test('original search cancellation discards partial work and permits a complete retry', async () => {
  const session = new FixtureSession();
  for (let index = 0; index < 80; index++) user(session, 'a'.repeat(32768) + ' RUN_CODE');
  const controller = new AbortController(), reason = Error('cancel search');
  setImmediate(() => controller.abort(reason));
  await assert.rejects(searchOriginal(session, { query: 'run_code' }, { signal: controller.signal }), error => error === reason);
  assert.equal((await searchOriginal(session, { query: 'run_code' })).totalMatches, 80);
});
