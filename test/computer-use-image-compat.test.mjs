import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime, createMessage, createToolResultMessage, markAgentLoopRequest, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { withoutDuplicateComputerImages, withoutHistoricalCommandCodeImages, installComputerUseImageCompatibility } from '../src/computer-use-image-compat.mjs';

const image = id => ({ type: 'image', attachment: { attachmentId: id, mediaType: 'image/png', width: 100, height: 80, bytes: 24 } });
const text = { type: 'text', text: 'Exact tool output.' };
const responsesProfile = { api: 'openai-responses', baseURL: 'https://api.commandcode.ai/provider/v1' };
function historyRequest() {
  const user = content => createMessage({ role: 'user', source: { kind: 'user' }, content });
  return markAgentLoopRequest(Object.freeze({ provider: 'cmdgoat-responses', model: 'deepseek/deepseek-v4.1-flash', sessionId: 'one', messages: Object.freeze([
    user([image('old-upload')]),
    ...request('read', [text, image('old-tool')]).messages,
    user([text, image('new-upload')]),
    createMessage({ role: 'user', source: { kind: 'notice' }, content: [text] }),
    ...request('read', [text, image('new-tool')]).messages,
  ]) }));
}
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

test('cmdgoat-responses drops old images while preserving current uploads, tool observations, text and immutable history', () => {
  const options = historyRequest(), before = JSON.stringify(options);
  const projected = withoutHistoricalCommandCodeImages(options, responsesProfile);
  assert.deepEqual(projected.messages.flatMap(m => m.content.filter(b => b.type === 'image').map(b => b.attachment.attachmentId)), ['new-upload', 'new-tool']);
  assert.deepEqual(projected.messages[0].content, []);
  assert.deepEqual(projected.messages[2].content, [text]);
  assert.equal(projected.messages[2].toolCallId, options.messages[2].toolCallId);
  assert.equal(projected.messages[1], options.messages[1]);
  assert.equal(projected.messages[3], options.messages[3]);
  assert.ok(isAgentLoopRequest(projected));
  assert.equal(JSON.stringify(options), before);
  assert.equal(withoutHistoricalCommandCodeImages(projected, responsesProfile), projected);
  const next = markAgentLoopRequest({ ...options, messages: [...options.messages,
    createMessage({ role: 'user', source: { kind: 'user' }, content: [text] })] });
  assert.equal(withoutHistoricalCommandCodeImages(next, responsesProfile).messages.some(m => m.content.some(b => b.type === 'image')), false);
});

test('other channel IDs at the same gateway, Chat routes and requests without a user boundary retain history', () => {
  for (const provider of ['cmdgoat', 'cmdgoat-anthropic', 'other-responses']) {
    const options = { ...historyRequest(), provider };
    assert.equal(withoutHistoricalCommandCodeImages(options, responsesProfile), options);
  }
  for (const profile of [{ ...responsesProfile, api: 'openai-completions' },
    { ...responsesProfile, baseURL: 'https://api.openai.com/v1' }, { ...responsesProfile, baseURL: 'invalid' }]) {
    const options = historyRequest();
    assert.equal(withoutHistoricalCommandCodeImages(options, profile), options);
  }
  const options = markAgentLoopRequest({ ...request(), provider: 'cmdgoat-responses' });
  assert.equal(withoutHistoricalCommandCodeImages(options, responsesProfile), options);
});

test('historical image filtering reaches direct and prepared runtime dispatch only in managed agent loops, and unloads cleanly', async t => {
  const ctx = new Context(), runtime = new LlmRuntime(ctx), seen = [];
  let managed = true, dispose;
  t.after(runtime.registerAdapter(['cmdgoat-responses', 'other-responses'], {
    providerInfo: id => ({ id, name: id }), providerRetryPolicy() {}, async prepareCall(provider, model) {
      return { model: { provider, id: model, name: model },
        async *stream(request) { seen.push(request); yield { type: 'finish', reason: { kind: 'stop' } }; } };
    },
  }));
  const originals = [runtime.stream, runtime.prepareCall];
  installComputerUseImageCompatibility({ llm: runtime, sessions: { get: () => ({}) },
    settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { 'cmdgoat-responses': responsesProfile, 'other-responses': responsesProfile } } }] },
    effect(fn) { dispose = fn(); } }, () => managed);
  t.after(() => dispose());
  const options = historyRequest(), before = JSON.stringify(options);
  for (const prepared of [false, true]) {
    const target = prepared ? await runtime.prepareCall(options) : runtime;
    await Array.fromAsync(target.stream(options));
    assert.deepEqual(seen.at(-1).messages[0].content, []);
    assert.equal(seen.at(-1).messages[3].content[1].attachment.attachmentId, 'new-upload');
    assert.ok(isAgentLoopRequest(seen.at(-1)));
  }
  const other = markAgentLoopRequest({ ...options, provider: 'other-responses' });
  await Array.fromAsync(runtime.stream(other));assert.equal(seen.at(-1), other);
  managed = false;await Array.fromAsync(runtime.stream(options));assert.equal(seen.at(-1), options);
  managed = true;
  const background = { ...options };
  await Array.fromAsync(runtime.stream(background));assert.equal(seen.at(-1), background);
  const stale = await runtime.prepareCall(options);dispose();
  assert.equal(runtime.stream, originals[0]);assert.equal(runtime.prepareCall, originals[1]);
  await Array.fromAsync(stale.stream(options));assert.equal(seen.at(-1), options);
  assert.equal(JSON.stringify(options), before);
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
