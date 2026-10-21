import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { TemporaryChats, handleTemporaryChatApi } from '../src/temporary-chat.mjs';
import { sendJson } from '../src/http.mjs';
import { recoverTemporaryChat, sendTemporaryChat } from '../src/client/temporary-chat-state.mjs';
function fixture() {
  const calls = [];
  const service = new TemporaryChats({
    sessions: { get() { return null; } }, sessionProjections: {},
    get() { return { currentSelection: () => ({ provider: 'synthetic', model: 'local' }) }; },
    llm: { async prepareCall(route, signal) {
      return { config: route, async *stream(request) {
        calls.push(request);
        if (request.messages.at(-1).content[0].text === 'wait') await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
        yield { type: 'block-start', index: 0, blockType: 'reasoning' };
        yield { type: 'reasoning-delta', index: 0, text: 'synthetic reasoning' };
        yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'synthetic reasoning' } };
        yield { type: 'block-start', index: 1, blockType: 'text' };
        yield { type: 'text-delta', index: 1, text: 'synthetic reply' };
        yield { type: 'block-end', index: 1, block: { type: 'text', text: 'synthetic reply' } };
        yield { type: 'finish', reason: { kind: 'stop' }, replayState: { response: { signature: 'synthetic' }, blocks: ['reasoning-replay', 'text-replay'] } };
      } };
    } },
  });
  return { service, calls };
}
test('temporary messages are retained only in memory and never assigned a host session', async () => {
  const { service, calls } = fixture();
  try {
    const { id } = service.open('main'); await service.send(id, 1, 'hello', () => {});
    assert.equal(service.chats.get(id).turns.length, 1);
    assert.equal(calls[0].sessionId, undefined); assert.deepEqual(calls[0].tools, []);
    await service.close(id); assert.equal(service.chats.size, 0); assert.throws(() => service.get(id), /已关闭/);
  } finally { await service.dispose(); }
});
test('closing while streaming aborts and erases only the temporary chat', async () => {
  const { service } = fixture();
  try {
    const first = service.open('main'), second = service.open('other');
    const running = service.send(first.id, 1, 'wait', () => {}); running.catch(() => {});
    await new Promise(resolve => setImmediate(resolve)); await service.close(first.id);
    await assert.rejects(running, /已关闭/);
    assert.equal(service.chats.size, 1); assert.ok(service.get(second.id)); assert.deepEqual(service.get(second.id).turns, []);
  } finally { await service.dispose(); }
});

test('committed requests replay their receipt without another model call or history entry', async t => {
  const { service, calls } = fixture(); t.after(() => service.dispose());
  const { id } = service.open('main'), requestId = 1, receipts = [];
  await service.send(id, requestId, 'hello', event => { if (event.type === 'done') receipts.push(event); });
  await service.send(id, requestId, 'hello', event => receipts.push(event));
  assert.equal(calls.length, 1); assert.equal(service.get(id).turns.length, 1);
  assert.deepEqual(receipts[1], receipts[0]); assert.equal(receipts[0].committed, true);
  assert.equal(receipts[0].messages[1].text, 'synthetic reply');
  assert.equal(receipts[0].messages[1].reasoning, 'synthetic reasoning');
  await assert.rejects(service.send(id, requestId, 'different', () => {}), /不同消息/);
  await service.send(id, 2, 'next', () => {});
  assert.equal(calls[1].messages.length, 3);
  assert.equal(calls[1].messages[0], service.get(id).turns[0].user);
  assert.equal(calls[1].messages[1], service.get(id).turns[0].assistant, 'native replay messages are preserved');
  assert.deepEqual(calls[1].messages[1].source.replayState,
    { response: { signature: 'synthetic' }, blocks: ['reasoning-replay', 'text-replay'] });
});

test('stopping an old request never cancels the next reply, and stop waits for cancellation', async t => {
  const { service, calls } = fixture(); t.after(() => service.dispose());
  const { id } = service.open('main'), old = 1, next = 2;
  await service.send(id, old, 'hello', () => {});
  const running = service.send(id, next, 'wait', () => {}), rejected = assert.rejects(running, /回复已停止/);
  await new Promise(setImmediate);
  assert.equal((await service.stop(id, old)).committed, true);
  assert.equal(service.get(id).active.abort.signal.aborted, false);
  await assert.rejects(service.stop(id), /请求编号/);
  assert.equal(service.get(id).active.id, next);
  assert.deepEqual(await service.stop(id, next), { requestId: next, committed: false });
  await rejected;
  assert.equal(service.get(id).active, null); assert.equal(service.get(id).turns.length, 1);
  assert.equal(calls.length, 2);
  assert.deepEqual(await service.stop(id, 3), { requestId: 3, committed: false });
  await assert.rejects(service.send(id, 3, 'late HTTP send', () => {}), /已结束/);
  assert.equal(calls.length, 2, 'stop-before-admission prevents late dispatch without a cancelled-request journal');
});

async function httpFixture(t) {
  const f = fixture(), faults = { receipt: null, stop: false, deltas: false }, actions = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), action = url.pathname.split('/').at(-1);
    actions.push(action);
    if (action === 'stop' && faults.stop) { sendJson(res, 503, { error: 'synthetic offline' }); return; }
    const write = res.write.bind(res);
    res.write = value => {
      const event = JSON.parse(value);
      if (faults.deltas && event.type === 'text-delta') return true;
      if (faults.receipt && event.type === 'done') {
        const fault = faults.receipt; faults.receipt = null;
        if (fault === 'disconnect') res.destroy();
        else if (fault === 'invalid') return write(JSON.stringify({ ...event, requestId: 'wrong' }) + '\n');
        return true;
      }
      return write(value);
    };
    try { await handleTemporaryChatApi({ service: f.service, req, res, url }); }
    catch (error) { sendJson(res, error.statusCode || 400, { error: error.message }); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await f.service.dispose(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const request = async (action, data, signal) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/oh-my-dsh/api/temporary-chat/${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data), signal,
    });
    if (action === 'send' && response.ok) return response;
    const value = await response.json();
    if (!response.ok) throw Error(value.error);
    return value;
  };
  const entry = { messages: [], draft: 'hello', created: request('open', { parentId: 'main' }), busy: false, turn: null };
  return { ...f, faults, actions, request, entry };
}

test('HTTP lost or invalid receipts recover the committed reply without repeating the model call', async t => {
  for (const fault of ['truncate', 'disconnect', 'invalid']) await t.test(fault, async t => {
    const f = await httpFixture(t); f.faults.receipt = fault;
    await sendTemporaryChat(f.entry, f.request);
    assert.equal(f.entry.turn, null); assert.equal(f.entry.draft, ''); assert.equal(f.entry.error, '');
    assert.equal(f.entry.messages[1].text, 'synthetic reply'); assert.equal(f.calls.length, 1);
    assert.equal(f.actions.filter(action => action === 'stop').length, 1);
    f.entry.draft = 'next'; await sendTemporaryChat(f.entry, f.request);
    assert.equal(f.calls.length, 2); assert.equal(f.calls[1].messages.length, 3);
    assert.deepEqual(f.calls[1].messages.map(message => message.role), ['user', 'assistant', 'user']);
  });
});

test('unconfirmed HTTP delivery blocks another send until explicit recovery succeeds', async t => {
  const f = await httpFixture(t); f.faults.receipt = 'truncate'; f.faults.stop = true;
  await sendTemporaryChat(f.entry, f.request);
  assert.ok(f.entry.turn); assert.equal(f.entry.busy, false); assert.equal(f.entry.draft, 'hello');
  assert.match(f.entry.error, /尚未确认/);
  await sendTemporaryChat(f.entry, f.request); assert.equal(f.calls.length, 1);
  f.faults.stop = false; await recoverTemporaryChat(f.entry, f.request);
  assert.equal(f.entry.turn, null); assert.equal(f.entry.messages.length, 2); assert.equal(f.entry.error, '');
  assert.equal(f.calls.length, 1);
});

test('HTTP cancellation restores the draft after the producer retires and allows a fresh send', async t => {
  const f = await httpFixture(t); f.entry.draft = 'wait';
  const started = Promise.withResolvers();
  f.entry.refresh = () => { if (f.calls.length) started.resolve(); };
  const sending = sendTemporaryChat(f.entry, f.request); await started.promise;
  const requestId = f.entry.turn.id;
  // Busy and request ownership live on the entry, so a replacement Panel sees them too.
  assert.equal(f.entry.busy, true); await sendTemporaryChat(f.entry, f.request); assert.equal(f.calls.length, 1);
  f.entry.turn.abort.abort(); await sending;
  assert.equal(f.entry.turn, null); assert.equal(f.entry.draft, 'wait'); assert.equal(f.entry.messages.length, 0);
  const { id } = await f.entry.created; assert.equal(f.service.get(id).active, null);
  f.entry.draft = 'next'; await sendTemporaryChat(f.entry, f.request);
  assert.equal(f.entry.messages.length, 2); assert.equal(f.calls[1].messages.length, 1);
  assert.deepEqual(await f.request('stop', { id, requestId }), { requestId, committed: false });
});

test('the done receipt supplies canonical blocks even when no text deltas were delivered', async t => {
  const f = await httpFixture(t); f.faults.deltas = true;
  await sendTemporaryChat(f.entry, f.request);
  assert.equal(f.entry.messages[1].text, 'synthetic reply'); assert.equal(f.entry.draft, '');
  assert.equal(f.entry.messages[1].reasoning, 'synthetic reasoning');
  assert.equal(f.actions.filter(action => action === 'stop').length, 0, 'healthy sends need no reconciliation request');
});

test('a late reconciliation failure cannot repopulate a chat closed in the meantime', async t => {
  const f = await httpFixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  f.faults.receipt = 'truncate';
  const sending = sendTemporaryChat(f.entry, async (action, ...args) => {
    if (action === 'stop') { entered.resolve(); await release.promise; }
    return f.request(action, ...args);
  });
  await entered.promise;
  f.entry.closing = f.entry.created.then(({ id }) => f.request('close', { id }));
  await f.entry.closing;
  Object.assign(f.entry, { closed: true, closing: null, turn: null, draft: '', messages: [], error: '' });
  release.resolve(); await sending;
  assert.equal(f.entry.error, ''); assert.equal(f.entry.draft, ''); assert.deepEqual(f.entry.messages, []);
});
