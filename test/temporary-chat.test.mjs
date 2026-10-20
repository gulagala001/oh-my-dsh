import test from 'node:test';
import assert from 'node:assert/strict';
import { TemporaryChats } from '../src/temporary-chat.mjs';
function fixture() {
  const calls = [];
  const service = new TemporaryChats({
    sessions: { get() { return null; } }, sessionProjections: {},
    get() { return { currentSelection: () => ({ provider: 'synthetic', model: 'local' }) }; },
    llm: { async prepareCall(route, signal) {
      return { config: route, async *stream(request) {
        calls.push(request);
        if (request.messages.at(-1).content[0].text === 'wait') await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text: 'synthetic reply' };
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'synthetic reply' } };
        yield { type: 'finish', reason: { kind: 'stop' } };
      } };
    } },
  });
  return { service, calls };
}
test('temporary messages are retained only in memory and never assigned a host session', async () => {
  const { service, calls } = fixture();
  try {
    const { id } = service.open('main'); await service.send(id, 'hello', () => {});
    assert.equal(service.chats.get(id).messages.length, 2);
    assert.equal(calls[0].sessionId, undefined); assert.deepEqual(calls[0].tools, []);
    await service.close(id); assert.equal(service.chats.size, 0); assert.throws(() => service.get(id), /已关闭/);
  } finally { await service.dispose(); }
});
test('closing while streaming aborts and erases only the temporary chat', async () => {
  const { service } = fixture();
  try {
    const first = service.open('main'), second = service.open('other');
    const running = service.send(first.id, 'wait', () => {}); running.catch(() => {});
    await new Promise(resolve => setImmediate(resolve)); await service.close(first.id);
    await assert.rejects(running, /已关闭/);
    assert.equal(service.chats.size, 1); assert.ok(service.get(second.id)); assert.deepEqual(service.get(second.id).messages, []);
  } finally { await service.dispose(); }
});
