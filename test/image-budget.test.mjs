import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Session } from '@deepseek-ai/dsh-session';
import { Context } from '@deepseek-ai/cordis';
import { markAgentLoopRequest, LlmRuntime, LlmAdapter } from '@deepseek-ai/dsh-llm';
import { installImageBudget, IMAGE_REPAIR_CODE, IMAGE_LIMIT_CODE, requestImages } from '../src/image-budget.mjs';
import { contextConfig } from '../src/config.mjs';
import { DEFAULT_IMAGE_RULE } from '../src/image-rules.mjs';
import { RequestSnapshots } from '../src/context/request-snapshots.mjs';
import { newRecord, normalizeChoices, recordSnapshot, resolveTraceSlot } from '../src/context/core.mjs';
import { createTransaction, applyTransaction } from '../src/context/transactions.mjs';
import { createHostAdapter } from '../src/context/host.mjs';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { retainImageOffloads, imageSourceValue } from '../src/image-request-state.mjs';
import { BillionContext } from '../src/context/bc.mjs';

const host = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
const native = dirname(host.resolve('@deepseek-ai/dsh-compaction-image-offload'));
const { imageOffloadProjection } = await import(pathToFileURL(join(native, 'types/projection.js')));
const { offloadOldestImages } = await import(pathToFileURL(join(native, 'types/image-offload.js')));
const signal = () => new AbortController().signal;

function fixture(rule = DEFAULT_IMAGE_RULE, provider = 'cmdgoat-responses') {
  const session = Session.create('image-budget', [], undefined, 0, [imageOffloadProjection]);
  session.append('user/message', { id: 'user', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Inspect the synthetic UI.' }] }, { surfaceOp: 'append' });
  const config = { multiImageFixEnabled: true, multiImageFixRules: [{ provider, ...rule }] };
  const hooks = new Map(), profile = { maxRequestImageBytes: 20 * 1024 * 1024 }, stats = { sent: 0, reads: 0, flushes: 0 };
  const attachments = { async readImageRequest(ref) { stats.reads++; return { bytes: ref.bytes }; } };
  const ctx = { on(name, fn) { hooks.set(name, fn); }, get: name => name === 'attachments' ? attachments : undefined,
    settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { [provider]: profile } } }] },
    sessions: { get: id => id === session.id ? session : undefined, async flush() { stats.flushes++; } },
    llm: { async resolveModelInfo() { return { inputModalities: ['text', 'image'] }; },
      imageRequestTarget(_p, _m, ref) { return { width: ref.width, height: ref.height, maxBytes: profile.requestImageMaxBytes ?? 1048576 }; } } };
  const hub = { config: () => config }, service = installImageBudget(ctx, () => true, hub);
  hub.images = service;
  const request = (extra = {}, main = true) => {
    const value = Object.freeze({ provider, model: 'synthetic', sessionId: session.id, messages: Object.freeze(session.deriveMessages()), signal: signal(), ...extra });
    return main ? markAgentLoopRequest(value) : value;
  };
  async function send(options, observe) {
    const frames = [];
    const next = async function* () { stats.sent++; observe?.(options); yield { type: 'finish', reason: { kind: 'stop' } }; };
    for await (const frame of hooks.get('llm/stream')(options, next)) frames.push(frame);
    return frames.at(-1).reason;
  }
  const recover = (request, failure) => hooks.get('agent/request-error')({ agent: { session }, failure, signal: request.signal }, () => ({ kind: 'stop' }));
  let serial = 0;
  function append(bytes = 150 * 1024, attachmentId) {
    const id = ++serial;
    const assistant = session.append('assistant/message', { turn: 1, step: id, stream: [], message: { id: `a${id}`, role: 'assistant',
      source: { kind: 'model', provider, model: 'synthetic' }, content: [{ type: 'tool-call', name: 'computer_use', id: `c${id}`, arguments: '{}' }] } }, { surfaceOp: 'append' });
    const result = session.append('tool/result', { turn: 1, step: id, message: { id: `r${id}`, role: 'tool', toolCallId: `c${id}`,
      source: { kind: 'tool', callId: `c${id}` }, content: [{ type: 'text', text: `Observed frame ${id}.` },
        { type: 'image', attachment: { attachmentId: attachmentId ?? `image-${id}`, bytes, width: 1000, height: 600, mediaType: 'image/png' } }] } }, { surfaceOp: 'append' });
    return [assistant, result];
  }
  return { session, config, hooks, ctx, hub, service, profile, stats, request, send, recover, append };
}

test('rules default to CMD, preserve an empty selection and reject invalid or duplicate rows', () => {
  const c = contextConfig(); assert.equal(c.multiImageFixEnabled, true); assert.equal(c.multiImageFixRules[0].provider, 'cmdgoat-responses');
  assert.deepEqual(contextConfig({ multiImageFixRules: [] }).multiImageFixRules, []);
  assert.throws(() => contextConfig({ multiImageFixRules: [{ provider: 'p', ...DEFAULT_IMAGE_RULE, keepImages: 20 }] }), /保留数量/);
  assert.throws(() => contextConfig({ multiImageFixRules: [{ provider: 'p', ...DEFAULT_IMAGE_RULE }, { provider: 'p', ...DEFAULT_IMAGE_RULE }] }), /同一渠道/);
  assert.throws(() => contextConfig({ multiImageFixRules: null }), /列表/);
});

test('50 small screenshots trim once, then keep an identical append-only prefix below the next limit', async () => {
  const f = fixture(); for (let i = 0; i < 50; i++) f.append();
  const original = structuredClone(f.session.snapshotEvents()), before = f.request(), failed = await f.send(before);
  assert.equal(failed.failure.code, IMAGE_REPAIR_CODE); assert.equal(f.stats.sent, 0);
  assert.equal((await f.recover(before, failed.failure)).kind, 'retry');
  assert.equal(requestImages(f.session.deriveMessages()).length, 10);
  assert.deepEqual(f.session.snapshotEvents().slice(0, original.length), original);
  const trimmed = f.request(); assert.equal((await f.send(trimmed)).kind, 'stop');
  for (let i = 0; i < 9; i++) { f.append(); assert.equal((await f.send(f.request())).kind, 'stop'); }
  assert.deepEqual(f.request().messages.slice(0, trimmed.messages.length), trimmed.messages);
  assert.equal(f.session.snapshotEvents().filter(e => e.type === 'image/offload').length, 1);
  assert.equal(f.stats.flushes, 1);
});

test('unselected and disabled channels keep their existing image behavior; renamed selected channels use the same rule', async () => {
  const f = fixture({ maxImages: 4, keepImages: 2, maxBytes: 10000000 }, 'my-relay'); for (let i = 0; i < 7; i++) f.append(100);
  f.config.multiImageFixEnabled = false; assert.equal((await f.send(f.request())).kind, 'stop');
  f.config.multiImageFixEnabled = true; f.config.multiImageFixRules = [];
  assert.equal((await f.send(f.request())).kind, 'stop');
  f.config.multiImageFixRules = [{ provider: 'my-relay', maxImages: 4, keepImages: 2, maxBytes: 10000000 }];
  const request = f.request(), failed = await f.send(request);
  assert.equal(failed.failure.code, IMAGE_REPAIR_CODE); await f.recover(request, failed.failure);
  assert.equal(requestImages(f.session.deriveMessages()).length, 2);
});

test('unseen batches stay intact and bytes can require fewer images than the count target', async () => {
  const f = fixture({ maxImages: 4, keepImages: 2, maxBytes: 10000000 });
  const images = Array.from({ length: 5 }, (_, i) => ({ type: 'image', attachment: { attachmentId: `new-${i}`, bytes: 100, width: 2, height: 2, mediaType: 'image/png' } }));
  f.session.append('user/message', { id: 'new', role: 'user', source: { kind: 'user' }, content: images }, { surfaceOp: 'append' });
  const original = structuredClone(f.session.snapshotEvents());
  assert.equal((await f.send(f.request())).failure.code, IMAGE_LIMIT_CODE);
  assert.deepEqual(f.session.snapshotEvents(), original); assert.equal(f.stats.sent, 0);
  const b = fixture({ maxImages: 20, keepImages: 10, maxBytes: 3000000 });
  for (let i = 0; i < 12; i++) b.append(1000000);
  const request = b.request(), failed = await b.send(request); assert.equal(failed.failure.code, IMAGE_REPAIR_CODE);
  await b.recover(request, failed.failure); assert.equal((await b.send(b.request())).kind, 'stop');
  assert(requestImages(b.session.deriveMessages()).length < 10);
});

test('offload selects actual request occurrences after projections and refuses stale or cancelled recovery', async () => {
  const f = fixture({ maxImages: 4, keepImages: 2, maxBytes: 10000000 });
  const rows = Array.from({ length: 7 }, () => f.append(100));
  const projected = f.request().messages.map(m => ['r1', 'r2'].includes(m.id) ? { ...m, content: m.content.filter(b => b.type !== 'image') } : m);
  const request = f.request({ messages: projected }), failed = await f.send(request);
  await f.recover(request, failed.failure);
  const targets = f.session.snapshotEvents().at(-1).data.targets;
  assert.deepEqual(targets.map(t => t.seq), rows.slice(2, 5).map(r => r[1].seq));
  assert.equal(f.session.deriveEventMessage(rows[0][1]).content[1].offloaded, undefined);
  const g = fixture({ maxImages: 4, keepImages: 2, maxBytes: 10000000 }); for (let i = 0; i < 7; i++) g.append(100);
  const controller = new AbortController(), cancelled = g.request({ signal: controller.signal }), reason = await g.send(cancelled);
  controller.abort(); assert.equal((await g.recover(cancelled, reason.failure)).kind, 'stop');
  assert.equal(g.session.snapshotEvents().filter(e => e.type === 'image/offload').length, 0);
  const changed = g.request(), changedFailure = await g.send(changed);
  g.config.multiImageFixEnabled = false;
  assert.equal((await g.recover(changed, changedFailure.failure)).kind, 'retry');
  assert.equal(requestImages(g.session.deriveMessages()).length, 7);
});

test('native prepared dispatch and error waterfall recover before adapter I/O and capture safe image metadata', async t => {
  const f = fixture({ maxImages: 4, keepImages: 2, maxBytes: 10000000 }); for (let i = 0; i < 7; i++) f.append(100);
  const ctx = new Context(), requests = [], saved = new RequestSnapshots();
  await ctx.plugin(LlmRuntime); t.after(() => ctx.fiber.dispose());
  class Adapter extends LlmAdapter {
    // Omitted modalities are unknown, not a declaration that images are absent.
    async *stream(options) { requests.push(options); yield { type: 'finish', reason: { kind: 'stop' } }; }
  }
  ctx.llm.registerAdapter(['cmdgoat-responses'], new Adapter());
  ctx.provide('sessions', f.ctx.sessions); ctx.provide('attachments', f.ctx.get('attachments'));
  const service = installImageBudget(ctx, () => true, f.hub); saved.imageCheck = s => service.snapshotReason(s);
  ctx.on('llm/stream', (options, next) => { saved.capture(f.session, options, 1000000); return next(); }, { global: true });
  const first = f.request({ tools: [] }), prepared = await ctx.llm.prepareCall(first, first.signal);
  const frames = []; for await (const frame of prepared.stream(first)) frames.push(frame);
  assert.equal(frames.at(-1).reason.failure.code, IMAGE_REPAIR_CODE); assert.equal(requests.length, 0);
  assert.equal(saved.pending.size, 0, 'capture runs only after budget preflight');
  const recovery = await ctx.waterfall('agent/request-error', { agent: { session: f.session }, failure: frames.at(-1).reason.failure, signal: first.signal }, () => ({ kind: 'stop' }));
  assert.equal(recovery.kind, 'retry');
  const retried = f.request({ tools: [] }), second = await ctx.llm.prepareCall(retried, retried.signal);
  for await (const frame of second.stream(retried)) assert.equal(frame.reason.kind, 'stop');
  assert.equal(requests.length, 1); assert.equal(requestImages(requests[0].messages).length, 2);
  saved.confirm(f.session, retried); assert.equal(saved.candidates(f.session)[0].images.images, 2);
});

test('background requests never rewrite a parent or change a borrowed prefix; safe smaller snapshots survive', async () => {
  const f = fixture({ maxImages: 6, keepImages: 2, maxBytes: 10000000 }); for (let i = 0; i < 3; i++) f.append(100);
  const snapshots = new RequestSnapshots(undefined, snapshot => f.service.snapshotReason(snapshot));
  const small = f.request(); await f.send(small, options => snapshots.capture(f.session, options, 1000000)); snapshots.confirm(f.session, small);
  f.append(100); f.append(100);
  const large = f.request(); await f.send(large, options => snapshots.capture(f.session, options, 1000000)); snapshots.confirm(f.session, large);
  f.config.multiImageFixRules[0].maxImages = 4;
  assert.equal(snapshots.candidates(f.session).length, 1); assert.deepEqual(snapshots.candidates(f.session)[0].request.messages, small.messages);
  const before = structuredClone(f.session.snapshotEvents()), aux = f.request({ messages: large.messages, purpose: 'compaction' }, false);
  assert.equal((await f.send(aux)).failure.code, IMAGE_LIMIT_CODE);
  assert.deepEqual(f.session.snapshotEvents(), before); assert.deepEqual(aux.messages, large.messages);
  const replay = f.request({ messages: small.messages, purpose: 'compaction' }, false);
  assert.equal((await f.send(replay)).kind, 'stop');
  f.profile.requestImageMaxBytes = 512000;
  assert.equal(snapshots.candidates(f.session).length, 0); assert.match(snapshots.waitingReason(f.session), /图片限制/);
});

test('native image offload preserves a prepared decision, detailed assets, explicit recall and cold replay', async () => {
  const f = fixture(), events = f.append(100), record = newRecord(f.session, events, { summary: 'Observed UI.', documents: [] }, { scope: 'session', project: 'test' });
  const state = { records: [record], transaction: null, pending: null, traceSlot: null, steps: 1, manualQueue: [] };
  const store = { save() {}, update(s, patch) { Object.assign(s, patch); } };
  const adapter = createHostAdapter({ ctx: { sessions: { async flush() {} }, tokenMeter: { measure: () => ({ nodes: [], totalTokens: 100 }) } } });
  const cfg = { traceEnabled: false, requireShorter: false, contextOptimizationEnabled: false };
  const plan = action => ({ id: action, source: 'manual', choices: normalizeChoices({ choices: [{ action, ids: [record.id] }] }, state, f.session) });
  const before = recordSnapshot(f.session, record), pending = plan('detail');
  offloadOldestImages(f.session, [events[1].seq], 1);
  assert.equal(recordSnapshot(f.session, record), before, 'delivery marks do not invalidate source facts');
  await applyTransaction(f.session, state, createTransaction(f.session, state, pending, cfg, adapter.pairing), store, adapter);
  for (const mode of ['brief', 'detail']) await applyTransaction(f.session, state, createTransaction(f.session, state, plan(mode), cfg, adapter.pairing), store, adapter);
  assert.equal(requestImages(f.session.deriveMessages()).length, 0);
  assert.equal(state.records[0].assets[0].block.offloaded, true);
  const reopened = ContextPipeline.prototype.recallContent.call({ recallAssets: () => state.records[0].assets, hub: { action() {} } }, f.session, { id: record.id, asset: 1 });
  assert.equal(reopened[1].offloaded, undefined); assert.equal(state.records[0].assets[0].block.offloaded, true);
  const restored = Session.create(f.session.id, structuredClone(f.session.snapshotEvents()), f.session.header, 0, [imageOffloadProjection]);
  assert.deepEqual(restored.deriveMessages(), f.session.deriveMessages());
});

test('Trace refresh retains offload flags without erasing factual image/tool changes', () => {
  const picture = { type: 'image', attachment: { attachmentId: 'img', bytes: 1 } };
  const original = { id: 'u', content: [picture] }, current = { content: [{ type: 'text', text: 'Trace' }, { ...picture, offloaded: true }] };
  assert.equal(retainImageOffloads(original, current).content[0].offloaded, true);
  assert.equal(original.content[0].offloaded, undefined);
  const session = { surface: { nodes: [7] }, eventAt: () => ({}), deriveEventMessage: () => ({ source: { kind: 'plugin:oh-my-dsh:trace' }, ...current }) };
  assert(resolveTraceSlot(session, { carrierSeq: 7, original }));
  assert.notDeepEqual(imageSourceValue({ type: 'tool-call', arguments: { type: 'image', attachment: {}, offloaded: true } }),
    imageSourceValue({ type: 'tool-call', arguments: { type: 'image', attachment: {}, offloaded: false } }));
});

test('BC preserves append-only image history and rebases once when retained image delivery changes', () => {
  const f = fixture(); const first = f.append(100), state = { contextBackend: 'bc' };
  const hub = { context: { state: () => state, store: { peek: () => state, save() {}, update(s, patch) { Object.assign(s, patch); } } } };
  const bc = new BillionContext(hub);
  bc.reconcile(f.session); assert.equal(state.bc.revision, 0);
  f.append(100); bc.reconcile(f.session); assert.equal(state.bc.revision, 0);
  offloadOldestImages(f.session, [first[1].seq], 1); bc.reconcile(f.session);
  assert.equal(state.bc.revision, 1); assert.equal(state.bc.needsBoundary, true);
  bc.reconcile(f.session); assert.equal(state.bc.revision, 1);
});
