import test from 'node:test';
import assert from 'node:assert/strict';
import { markAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { imageOffloadPlan, installImageBudget } from '../src/image-budget.mjs';
const image = id => ({ type: 'image', attachment: { attachmentId: id, width: 100, height: 100 } });
const user = content => ({ role: 'user', content });
const assistant = () => ({ role: 'assistant', content: [{ type: 'text', text: 'Inspect next screenshots' }] });
const request = (n = 12) => [user(Array.from({ length: n - 2 }, (_, i) => image(String(i)))), assistant(), user([image(String(n - 2)), image(String(n - 1))])];
const collect = async stream => { const result = []; for await (const value of stream) result.push(value); return result; };
function fixture({ profile = {}, managed = true, vision = true, failure = false } = {}) {
  let listener, wireCalls = 0, reads = 0; const targets = [];
  const session = { id: 'session', header: { agentPreset: 'trisoul-x' } };
  const attachments = { async readImageRequest(_ref, target) { reads++; targets.push(target); if (failure) throw Error('missing source image'); return { bytes: 60 }; } };
  const ctx = {
    on(name, fn) { assert.equal(name, 'llm/stream'); listener = fn; },
    sessions: { get: id => id === session.id ? session : undefined },
    settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { fixture: { maxRequestImageBytes: 1000, ...profile } } } }] },
    get: () => attachments, llm: { resolveModelInfo: async () => ({ inputModalities: vision ? ['text', 'image'] : ['text'] }) },
    logger: { warn() {} },
  };
  installImageBudget(ctx, () => managed);
  const next = async function* () { wireCalls++; yield { type: 'finish', reason: { kind: 'stop' } }; };
  const options = messages => markAgentLoopRequest({ sessionId: 'session', provider: 'fixture', model: 'fixture', messages });
  return { run: (options, downstream = next) => collect(listener(options, downstream)), options, session, targets, reads: () => reads, wireCalls: () => wireCalls };
}

test('crossing 90% removes one oldest batch down to 60%, not just the excess', () => {
  const messages = request(); const original = JSON.stringify(messages);
  assert.deepEqual(imageOffloadPlan(messages, () => 60, 1000), { count: 5, totalBytes: 960, retainedBytes: 560 });
  assert.equal(JSON.stringify(messages), original);
  assert.equal(imageOffloadPlan(request(11), () => 60, 1000).count, 0);
});

test('newest screenshot batch and at least two newest images survive the soft budget', () => {
  const messages = [user([image('old')]), assistant(), user(Array.from({ length: 10 }, (_, i) => image(String(i))))];
  const plan = imageOffloadPlan(messages, () => 90, 1000); assert.equal(plan.count, 1); assert.equal(plan.retainedBytes, 1200);
  assert.equal(imageOffloadPlan(messages.slice(1), () => 90, 1000).count, 0, 'hard-limit fallback, not an endless soft retry');
  assert.equal(imageOffloadPlan([user([image('one'), image('two')]), assistant()], () => 600, 1000).count, 0);
});

test('occurrences count independently in tool results; existing offloads do not count', () => {
  const messages = [{ role: 'tool', toolCallId: 'screenshots', content: Array.from({ length: 10 }, () => image('same')) }, assistant(), user([image('a'), image('b'), { ...image('old'), offloaded: true }])];
  assert.equal(imageOffloadPlan(messages, () => 60, 1000).count, 5);
  assert.equal(imageOffloadPlan([{ role: 'system', content: [image('unsupported')] }], () => 60, 1).count, 0);
});

test('preflight prevents provider I/O, uses cached exact request byte sizes and keeps request immutable', async () => {
  const f = fixture(), messages = request(); const before = JSON.stringify(messages);
  const result = await f.run(f.options(messages));
  assert.equal(result[0].reason.failure.code, 'IMAGE_OFFLOAD_REQUIRED'); assert.equal(result[0].reason.failure.offloadImages, 5);
  assert.equal(f.wireCalls(), 0); assert.equal(f.reads(), 12); assert.equal(JSON.stringify(messages), before);
  await f.run(f.options(messages)); assert.equal(f.reads(), 12, 'cache only byte metadata, no repeated image processing');
  const reduced = structuredClone(messages); for (const block of reduced[0].content.slice(0, 5)) block.offloaded = true;
  await f.run(f.options(reduced)); assert.equal(f.wireCalls(), 1, 'retry reaches the provider once');
  const grown = structuredClone(reduced); grown.push(assistant(), user([image('new1'), image('new2')]));
  await f.run(f.options(grown)); assert.equal(f.wireCalls(), 2, 'new images use headroom instead of immediately evicting more history');
});

test('uses the route resize policy and resized byte count rather than original file length', async () => {
  const f = fixture({ profile: { requestImagePixelBudget: 2500, requestImageMaxBytes: 99 } });
  await f.run(f.options(request())); assert.deepEqual(f.targets[0], { width: 50, height: 50, maxBytes: 99 });
});

test('stock, background, subagent and text-only requests are not changed', async () => {
  for (const settings of [{ managed: false }, { vision: false }]) {
    const f = fixture(settings); await f.run(f.options(request())); assert.equal(f.wireCalls(), 1); assert.equal(f.reads(), 0);
  }
  const f = fixture(); const options = { ...f.options(request()) }; // copy has no loop marker
  await f.run(options); assert.equal(f.wireCalls(), 1); assert.equal(f.reads(), 0);
  f.session.header.origin = 'subagent'; await f.run(f.options(request())); assert.equal(f.wireCalls(), 2); assert.equal(f.reads(), 0);
});

test('preflight read failure preserves the original adapter error path without replaying it', async () => {
  const f = fixture({ failure: true }); await f.run(f.options(request())); assert.equal(f.wireCalls(), 1);
  let called = 0; const downstream = async function* () { called++; throw Error('upstream failed'); };
  await assert.rejects(f.run(f.options(request()), downstream), /upstream failed/); assert.equal(called, 1);
  const text = fixture({ vision: false });
  await assert.rejects(text.run(text.options(request()), downstream), /upstream failed/); assert.equal(called, 2);
});

test('cancellation prevents preflight from forwarding a request', async () => {
  const f = fixture(), options = f.options(request()); const controller = new AbortController(); controller.abort(Error('stopped'));
  await assert.rejects(f.run(markAgentLoopRequest({ ...options, signal: controller.signal })), /stopped/);
  assert.equal(f.wireCalls(), 0); assert.equal(f.reads(), 0);
});
