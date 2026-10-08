import test from 'node:test';
import assert from 'node:assert/strict';
import { FixtureSession, user } from './context-fixture.mjs';
import { searchOriginal } from '../src/context/original-search.mjs';
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
