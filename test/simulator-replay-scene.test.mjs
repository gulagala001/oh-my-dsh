import test from 'node:test';
import assert from 'node:assert/strict';
import { replayWithScene } from '../scripts/simulator/replay-scene.mjs';
import { Gate } from '../scripts/simulator/scene.mjs';

test('strict frames wait for the original async scene gate without using its response', async () => {
  const gate = new Gate();
  const recorded = { chunks: [{ delta: { content: 'recorded only' }, finish_reason: 'stop' }] };
  const scene = { chunks: (async function* () { await gate.wait(); yield { delta: { content: 'must not escape' }, finish_reason: 'stop' }; })() };
  const replay = replayWithScene(recorded, scene).chunks;
  let finished = false;
  const next = replay.next().then(value => { finished = true; return value; });
  await gate.entered;
  assert.equal(finished, false);
  gate.release();
  assert.deepEqual(await next, { done: false, value: recorded.chunks[0] });
  assert.equal((await replay.next()).done, true);
});

test('causal stream count drift fails and closes the scene iterator', async () => {
  for (const count of [0, 2]) {
    let closed = false;
    const scene = { chunks: (async function* () { try { yield 'scene'; } finally { closed = true; } })() };
    await assert.rejects(async () => { for await (const _frame of replayWithScene({ chunks: Array(count).fill({ finish_reason: 'stop' }) }, scene).chunks) {} }, /more frames|fewer frames/);
    assert.equal(closed, true);
  }
});

test('scene errors and cancellation cleanup remain visible during strict replay', async () => {
  const broken = { chunks: (async function* () { throw Error('independent scene failure'); })() };
  await assert.rejects(replayWithScene({ chunks: [{}] }, broken).chunks.next(), /independent scene failure/);
  let closed = false;
  const scene = { chunks: (async function* () { try { yield {}; yield {}; } finally { closed = true; } })() };
  const replay = replayWithScene({ chunks: [{}, {}] }, scene).chunks;
  await replay.next(); await replay.return();
  assert.equal(closed, true);
});
