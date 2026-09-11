import test from 'node:test';
import assert from 'node:assert/strict';
import { zstdCompressSync } from 'node:zlib';
import { readComputerUseTrace, readOperationStats } from '../scripts/computer-use-trace.mjs';

test('operation audit preserves early input attempts and errors after history truncation', () => {
  const history = Array.from({ length: 60 }, () => ({ operation: 'getAXState', ok: true }));
  const operationStats = { total: 63, succeeded: 61, failed: 1, cancelled: 1, methods: { paste: 1, pressKey: 1, getScreenshot: 1, getAXState: 60 } };
  const audit = readOperationStats({ history, operationStats });
  assert.equal(audit.complete, true);
  assert.equal(audit.historyComplete, false);
  assert.equal(audit.failed, 1);
  assert.equal(audit.cancelled, 1);
  assert.equal(audit.methods.paste, 1, 'a keyboard-only test must still reject the early paste attempt');
  assert.equal(audit.methods.getScreenshot, 1, 'an early screenshot remains evidence');
  assert.equal(readOperationStats({ history }).complete, false, 'old capped records cannot prove zero errors');
  assert.equal(readOperationStats({ history: history.slice(0, 2) }).complete, true);
  assert.equal(readOperationStats({}).complete, false);
  assert.equal(readOperationStats({ history, operationStats: { ...operationStats, total: 64 } }).complete, false);
  assert.equal(readOperationStats({ history, operationStats: { ...operationStats, methods: {} } }).complete, false);
});

test('real-provider audit reads all compressed frames and includes worker and schema failures', () => {
  const events = [
    { type: 'session', version: 3 },
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'tool/call', data: { step: 1, name: 'bash', arguments: '{"command":"curl https://example.test"}' } },
    { type: 'tool/call', data: { step: 1, name: 'todo_write', arguments: '{}' } },
    { type: 'tool/call', data: { step: 3, name: 'verify_link', arguments: '{"op":"run"}' } },
    { type: 'tool/result', data: { step: 1, meta: { computerUseError: null } } },
    { type: 'tool/result', data: { step: 2, meta: { computerUseError: 'missing locator method' }, message: { content: [{ type: 'tool-result', isError: false }] } } },
    { type: 'tool/result', data: { step: 3, message: { content: [{ type: 'tool-result', isError: true, content: [{ type: 'text', text: 'invalid arguments' }] }] } } },
    { type: 'turn/end', data: { turn: 1 } },
  ];
  const bytes = Buffer.concat(events.map(event => zstdCompressSync(Buffer.from(JSON.stringify(event) + '\n'))));
  assert.deepEqual(readComputerUseTrace(bytes), { computerUseCalls: 2, completedTurns: 1, unexpectedTools: [{ step: 1, name: 'bash' }, { step: 3, name: 'verify_link', operation: 'run' }], toolFailures: [{ step: 2, tool: 'computer_use', message: 'missing locator method' }, { step: 3, tool: 'unknown', message: 'invalid arguments' }] });
  assert.throws(() => readComputerUseTrace(bytes.subarray(0, bytes.length - 3)), 'an incomplete trace must not produce a successful audit');
  assert.throws(() => readComputerUseTrace(Buffer.concat(events.slice(0, -1).map(event => zstdCompressSync(Buffer.from(JSON.stringify(event) + '\n'))))), /completed turn/);
});
