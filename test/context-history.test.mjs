import test from 'node:test';
import assert from 'node:assert/strict';
import { contextHistoryLayout } from '../src/client/context-history.mjs';

test('unchanged context blocks keep their width despite changing usage calibration', () => {
  const frames = [
    { totalTokens: 18721, cacheReadTokens: 11008, nodes: [{ seq: 10, tokens: 2806 }, { seq: 18, tokens: 6454 }, { seq: 20, tokens: 884 }] },
    { totalTokens: 21525, cacheReadTokens: 20736, nodes: [{ seq: 10, tokens: 2806 }, { seq: 18, tokens: 6454 }, { seq: 20, tokens: 2949 }] },
  ];
  const rows = contextHistoryLayout(frames);
  for (const index of [0, 1]) {
    const widths = rows.map(row => row.width * row.frame.nodes[index].tokens / row.tokens);
    assert.ok(Math.abs(widths[0] - widths[1]) < 1e-12);
  }
  assert.deepEqual(contextHistoryLayout(frames.map(f => ({ ...f, totalTokens: 999999 }))).map(r => r.width), rows.map(r => r.width), 'pressure is not used to rescale record estimates');
  assert.equal(rows[1].cacheWidth, 100, 'reported cache has its own track, not clamped to the estimated records');
});

test('input and cache use the common token scale, including empty and legacy frames', () => {
  const frames = [{ nodes: [], inputTokens: 1000, cacheReadTokens: 800 }, { nodes: [{ seq: 1, tokens: 500 }], inputTokens: 2000, cacheReadTokens: 1000 }, { nodes: [], totalTokens: 29 }];
  assert.deepEqual(contextHistoryLayout(frames).map(({ tokens, width, inputWidth, cacheWidth }) => ({ tokens, width, inputWidth, cacheWidth })), [
    { tokens: 0, width: 0, inputWidth: 50, cacheWidth: 40 },
    { tokens: 500, width: 25, inputWidth: 100, cacheWidth: 50 },
    { tokens: 0, width: 0, inputWidth: 0, cacheWidth: 0 },
  ]);
  assert.deepEqual(contextHistoryLayout([]), []);
});
