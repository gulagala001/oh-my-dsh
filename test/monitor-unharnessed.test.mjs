import test from 'node:test';
import assert from 'node:assert/strict';
import { importUnharnessedHistory } from '../src/monitor-history.mjs';
import { REQUEST_METER_RECORD } from '../src/metering/context.mjs';

for (const preset of ['unharnessed', 'omd-unharnessed']) test(preset + ' archive preserves preset switches, inheritance and measured timing', () => {
  const header = { id: 'example', agentPreset: 'standard' };
  const receipt = { turn: 1, step: 1, message: { source: { kind: 'model', provider: 'example', model: 'm' }, content: [] },
    stream: [{ type: 'chunk', time: 16, chunk: { type: 'text-delta', text: 'x', index: 0 } },
      { type: 'chunk', time: 19, chunk: { type: 'finish', reason: { kind: 'stop' } } }],
    usage: { inputTokens: 9, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1 } };
  const events = [['agent-preset/selected', { agentPreset: preset }, 1], ['assistant/message', receipt, 3],
    [REQUEST_METER_RECORD, {}, 10], ['assistant/message', receipt, 20],
    ['agent-preset/selected', { agentPreset: 'standard' }, 21], ['assistant/message', receipt, 22],
    ['agent-preset/selected', { agentPreset: preset }, 25], ['assistant/message', receipt, 30]]
    .map(([type, data, time], seq) => ({ type, data, time, seq }));
  const rows = [];
  importUnharnessedHistory({ append: row => rows.push(row) }, { header, events, inherited: 2 }, 30);
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.id, 'native:example:3');
  assert.equal(row.durationMs, 10);
  assert.equal(row.firstTokenMs, 6);
  assert.equal(row.usage.outputTokens, 1);
});
