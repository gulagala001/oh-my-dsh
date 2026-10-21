import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { freezeMessage } from '@deepseek-ai/dsh-llm';
import { hash, jsonBytes, requestBytes } from '../src/result-reduction/json-metrics.mjs';

test('cached native request accounting keeps the exact UTF-8 envelope and rounding', () => {
  const message = freezeMessage({ id: 'memo-fixture', role: 'tool', toolCallId: 'call', source: { kind: 'tool', callId: 'call' },
    content: [{ type: 'text', text: '中文😀\n"quoted"\\escaped\ud800' }, { type: 'tool-result', toolCallId: 'nested', content: [{ type: 'text', text: '9007199254740993' }] }] });
  const options = { messages: [message, message], tools: [{ name: 'fixture', parameters: { type: 'object' } }], system: '系统背景\n😀' };
  const exact = value => Buffer.byteLength(JSON.stringify({ messages: value.messages, tools: value.tools, system: value.system }));
  for (let i = 0; i < 3; i++) { assert.equal(requestBytes(options), exact(options)); assert.equal(Math.ceil(requestBytes(options) / 3), Math.ceil(exact(options) / 3)); }
  options.messages = [message]; assert.equal(requestBytes(options), exact(options));
  options.messages = []; delete options.system; assert.equal(requestBytes(options), exact(options));
  options.messages = [null, , undefined, message]; assert.equal(requestBytes(options), exact(options));
  options.messages = Object.assign([message], { toJSON: () => ['custom JSON'] }); assert.equal(requestBytes(options), exact(options));
  assert.equal(jsonBytes('中文😀'), Buffer.byteLength(JSON.stringify('中文😀')));
});

test('hash memoization never trusts shallow freezing, accessors or changed mutable content', () => {
  const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
  const content = [{ type: 'text', text: 'before' }], shallow = Object.freeze({ content });
  const first = hash(shallow); content[0].text = 'after';
  assert.notEqual(hash(shallow), first); assert.equal(hash(shallow), digest(shallow));
  let current = 'first'; const accessor = Object.freeze({ get value() { return current; } });
  assert.equal(hash(accessor), digest(accessor)); current = 'second'; assert.equal(hash(accessor), digest(accessor));
  const frozen = freezeMessage({ id: 'immutable-fixture', role: 'user', content: [{ type: 'text', text: '中文😀' }] });
  assert.equal(hash(frozen), digest(frozen)); assert.equal(hash(frozen), digest(frozen));
});
