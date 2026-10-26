import test from 'node:test';
import assert from 'node:assert/strict';
import { structuralSearch } from '../src/result-reduction/ast.mjs';
import { structuralSearch as directSearch } from '../src/result-reduction/ast-engine.mjs';
import { articleView } from '../src/result-reduction/views.mjs';
import { articleView as directArticle } from '../src/result-reduction/article.mjs';
import { closeToolComputations } from '../src/compute.mjs';
import { searchOriginal, clearOriginalSearchCache } from '../src/context/original-search.mjs';
import { FixtureSession, user } from './context-fixture.mjs';

test('large pure computations preserve parser output and release a cancelled worker', async () => {
  const text = 'console.log("😀");\n'.repeat(2000);
  try {
    assert.deepEqual(await structuralSearch(text, 'javascript', 'console.log($A)'), await directSearch(text, 'javascript', 'console.log($A)'));
    const html = '<html><title>Source</title><article>' + '<p>Complete original article with clear meaningful paragraphs.</p>'.repeat(1000) + '</article></html>';
    assert.deepEqual(await articleView(html), await directArticle(html));
    const small = '<html><article><p>' + 'Complete source paragraph. '.repeat(20) + '</p></article></html>';
    assert.deepEqual(await articleView(small), await directArticle(small));
    const aborter = new AbortController(), reason = Error('cancel pure computation');
    const pending = structuralSearch(text.repeat(30), 'javascript', 'console.log($A)', aborter.signal);
    aborter.abort(reason);
    await assert.rejects(pending, error => error === reason);
    assert.equal((await structuralSearch(text, 'javascript', 'console.log($A)')).matches.length, 2000);
    const zero = new AbortController();
    const cancelled = structuralSearch(text, 'javascript', 'console.log($A)', zero.signal);
    zero.abort(0);
    await assert.rejects(cancelled, error => error === 0);
  } finally { await closeToolComputations(); }
});

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
test('immutable prefix index preserves scan results, frozen cursors and append visibility', async () => {
  const session = new FixtureSession('indexed');
  for (let i = 0; i < 90; i++) user(session, `${i} 文件工具 RUN_CODE ${'source '.repeat(100)} 😀`);
  const plain = query => searchOriginal(session, query);
  let events = freeze(structuredClone(session.snapshotEvents()));
  const indexed = { id: session.id, header: session.header, inheritedEventCount: 0, snapshotEvents: () => events };
  try {
    for (const query of ['文件工具', '文件', 'run_code', 'missing']) {
      const first = await searchOriginal(indexed, { query, limit: 2 });
      assert.deepEqual(first, await plain({ query, limit: 2 }));
      assert.deepEqual(await searchOriginal(indexed, { query, limit: 2 }), first);
      if (first.nextCursor) assert.deepEqual(await searchOriginal(indexed, { query, limit: 2, cursor: first.nextCursor }), await plain({ query, limit: 2, cursor: first.nextCursor }));
    }
    const first = await searchOriginal(indexed, { query: '文件', limit: 2 });
    const pristine = structuredClone(first);
    first.results[0].snippets[0].path.push('caller mutation');
    assert.deepEqual(await searchOriginal(indexed, { query: '文件', limit: 2 }), pristine, 'returned paths do not mutate the private index');
    user(session, '文件 after cursor');
    events = Object.freeze([...events, freeze(structuredClone(session.snapshotEvents().at(-1)))]);
    assert.deepEqual(await searchOriginal(indexed, { query: '文件', limit: 2, cursor: first.nextCursor }), await plain({ query: '文件', limit: 2, cursor: first.nextCursor }));
    assert.deepEqual(await searchOriginal(indexed, { query: '文件', limit: 2 }), await plain({ query: '文件', limit: 2 }));
    const changed = structuredClone(events); changed[0].data.content[0].text += ' changed'; events = freeze(changed);
    await assert.rejects(searchOriginal(indexed, { query: '文件', limit: 2, cursor: first.nextCursor }), /快照已变化/);
  } finally { clearOriginalSearchCache(); }
});
