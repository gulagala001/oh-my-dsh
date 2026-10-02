import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime, createMessage, createToolResultMessage, markAgentLoopRequest, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { withoutDuplicateComputerImages, installComputerUseImageCompatibility } from '../src/computer-use-image-compat.mjs';

const image = id => ({ type: 'image', attachment: { attachmentId: id, mediaType: 'image/png', width: 100, height: 80, bytes: 24 } });
const text = { type: 'text', text: 'Exact tool output.' };
function request(name = 'computer_use', blocks = [image('same'), image('same')]) {
  return markAgentLoopRequest(Object.freeze({ provider: 'fixture', model: 'fixture', sessionId: 'one', messages: Object.freeze([
    createMessage({ role: 'assistant', source: { kind: 'model', provider: 'fixture', model: 'fixture' }, content: [{ type: 'tool-call', id: 'call1', name, arguments: '{}' }] }),
    createToolResultMessage({ callId: 'call1', content: blocks, isError: false }),
  ]) }));
}

test('projects adjacent duplicate screenshots without altering text, tool pairs or saved messages', () => {
  const options = request('computer_use', [text, image('same'), image('same'), image('next'), image('next'), text, image('same')]);
  const before = JSON.stringify(options), projected = withoutDuplicateComputerImages(options);
  assert.ok(isAgentLoopRequest(projected));assert.ok(Object.isFrozen(projected));
  assert.equal(projected.messages[0], options.messages[0]);
  assert.equal(projected.messages[1].id, options.messages[1].id);
  assert.equal(projected.messages[1].toolCallId, 'call1');
  assert.deepEqual(projected.messages[1].content, [text, image('same'), image('next'), text, image('same')]);
  assert.equal(JSON.stringify(options), before);
  assert.equal(withoutDuplicateComputerImages(projected), projected);
});

test('other tools, separated observations, changed metadata and offloaded images remain exact', () => {
  for (const options of [request('read'), request('computer_use', [image('a'), text, image('a')]),
    request('computer_use', [image('a'), image('b')]),
    request('computer_use', [image('a'), { ...image('a'), detail: 'original' }]),
    request('computer_use', [{ ...image('a'), offloaded: true }, { ...image('a'), offloaded: true }])]) {
    assert.equal(withoutDuplicateComputerImages(options), options);
  }
});

test('prepared and direct dispatch keep branding, middleware, session scope and unload behavior', async t => {
  const ctx = new Context(), runtime = new LlmRuntime(ctx), seen = [];
  let managed = true, dispose, middleware = 0;
  const registration = runtime.registerAdapter(['fixture'], { providerInfo: id => ({ id, name: id }), providerRetryPolicy() {}, async prepareCall() {
    return { model: { provider: 'fixture', id: 'fixture', name: 'fixture' }, async *stream(options) { seen.push(options); yield { type: 'finish', reason: { kind: 'stop' } }; } };
  } });t.after(registration);
  ctx.on('llm/stream', async function* (_options, next) { middleware++; yield* next(); });
  const originals = [runtime.stream, runtime.prepareCall];
  installComputerUseImageCompatibility({ llm: runtime, sessions: { get: id => id === 'one' ? {} : undefined }, effect(fn) { dispose = fn(); } }, () => managed);
  t.after(() => dispose());
  const options = request(), before = JSON.stringify(options);
  for (const prepared of [false, true]) {
    const target = prepared ? await runtime.prepareCall(options) : runtime;
    await Array.fromAsync(target.stream(options));
    assert.equal(seen.at(-1).messages[1].content.length, 1);
    assert.equal(isAgentLoopRequest(seen.at(-1)), true);
    if (prepared) assert.throws(() => target.stream(options), /only be dispatched once/);
  }
  managed = false;await Array.fromAsync(runtime.stream(options));assert.equal(seen.at(-1).messages[1].content.length, 2);
  managed = true;await Array.fromAsync(runtime.stream({ ...options }));assert.equal(seen.at(-1).messages[1].content.length, 2, 'background requests stay exact');
  const stale = await runtime.prepareCall(options);dispose();
  assert.equal(runtime.stream, originals[0]);assert.equal(runtime.prepareCall, originals[1]);
  await Array.fromAsync(stale.stream(options));assert.equal(seen.at(-1).messages[1].content.length, 2);
  assert.equal(middleware, 5);assert.equal(JSON.stringify(options), before);
});
