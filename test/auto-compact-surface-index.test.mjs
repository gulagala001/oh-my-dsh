import assert from 'node:assert/strict';
import test from 'node:test';
import { AutoCompaction } from '../src/context/auto-compact.mjs';
import { sourceHash } from '../src/context/core.mjs';
import { PREPARE_TOOL } from '../src/context/prompts.mjs';

// Real production modules, synthetic session/pipeline; no model or filesystem I/O.
function fixture(count = 12, recordCount = 4, mode = 'detail') {
  let maps = 0, tokens = 100;
  const selected = [], batchMaps = [];
  const nodes = Array.from({ length: count }, (_, seq) => seq);
  // createSurfaceIndex maps the surface. Count only up to applyReady, before
  // later backlog calculations, without instrumenting production source.
  Object.defineProperty(nodes, 'map', { value(...args) {
    maps++;
    return Array.prototype.map.apply(this, args);
  } });
  const events = Array.from(nodes, seq => ({ seq, type: 'assistant/message',
    data: { message: { role: 'assistant', content: [{ type: 'text', text: `message ${seq}` }] } } }));
  const session = { id: 'synthetic', header: {}, surface: { nodes },
    eventAt: seq => events.find(event => event.seq === seq),
    deriveEventMessage: event => event?.data?.message, snapshotEvents: () => events };
  const records = Array.from({ length: recordCount }, (_, seq) => ({
    id: `r${seq}`, version: 1, mode, sourceSeqs: [seq], carrierSeq: seq,
    sourceHash: sourceHash(session, [seq]), summary: 'summary', documents: [], assets: [], ranges: [],
  }));
  const state = { records, manualQueue: [], review: { newRecords: 0 },
    binding: { project: 'synthetic', scope: 'session' } };
  const agent = { session, status: 'idle' };
  const config = { autoCompactEnabled: true, autoCompactThreshold: 50, autoCompactMode: 'brief',
    contextEnabled: false, keepTailEvents: 0, traceEnabled: false, digestWindow: 1,
    prepareInputTokens: 10000, digestLookback: 0, summaryTargetChars: 1000 };
  const pipeline = {
    closed: false, agents: new Map([[session.id, agent]]), jobs: new Map(), controllers: new Map(),
    manualSessions: new Map(), reviewTimers: new Map(), adaptive: { isManaged: () => true },
    config: () => config, state: () => state, store: { save() {} }, releaseState() {},
    reportError(_agent, _kind, error) { throw error; },
    hub: { ctx: { tokenMeter: { measure: () => ({ totalTokens: tokens }) } }, action() {}, event() {} },
    adapter: { pairing: { before: () => true, after: () => true }, message: content => ({ content }) },
    async applyReady(_agent, { ids }) {
      selected.push(ids); batchMaps.push(maps); tokens = 0;
      return { changed: true };
    },
    call() { throw Error('Unexpected model request'); },
  };
  return { session, agent, state, pipeline, config, selected, batchMaps, events,
    get maps() { return maps; }, set tokens(value) { tokens = value; } };
}

function assertReleased(f) {
  assert.equal(f.pipeline.jobs.size, 0);
  assert.equal(f.pipeline.controllers.size, 0);
  assert.equal(f.pipeline.manualSessions.size, 0);
}

test('Auto Compact builds one surface index for a synchronous record batch', async () => {
  const f = fixture();
  await new AutoCompaction(f.pipeline).check(f.agent);
  assert.deepEqual(f.selected, [['r0', 'r1', 'r2', 'r3']]);
  assert.deepEqual(f.batchMaps, [1]);
  assertReleased(f);
});

test('Auto Compact adds no filter index work when there are no active records', async () => {
  for (const allMerged of [false, true]) {
    const f = fixture(12, allMerged ? 4 : 0);
    if (allMerged) f.state.records.forEach(record => { record.mergedInto = 'other'; });
    let reads = 0, filterMaps;
    // Fourth token read is immediately after the first filter, before backlog.
    f.pipeline.hub.ctx.tokenMeter.measure = () => {
      if (++reads === 4) filterMaps = f.maps;
      return { totalTokens: reads >= 4 ? 0 : 100 };
    };
    await new AutoCompaction(f.pipeline).check(f.agent);
    assert.equal(filterMaps, 0);
    assert.deepEqual(f.selected, []);
    assertReleased(f);
  }
});

for (const mode of ['raw', 'detail', 'brief']) {
  test(`Auto Compact preserves ${mode} record eligibility`, async () => {
    const f = fixture(12, 5, mode);
    f.state.records[1].mergedInto = 'other';
    f.state.records[2].carrierSeq = 99; f.state.records[2].sourceSeqs = [99];
    f.state.records[3].sourceHash = 'invalid';
    // A protected original stays protected even with a current source hash.
    f.events[4].type = 'user/message'; f.events[4].data.source = { kind: 'user' };
    f.state.records[4].sourceHash = sourceHash(f.session, [4]);
    if (mode === 'brief') {
      // All records are already brief. Avoid entering preparation afterward.
      let reads = 0;
      f.pipeline.hub.ctx.tokenMeter.measure = () => ({ totalTokens: ++reads >= 4 ? 0 : 100 });
    }
    await new AutoCompaction(f.pipeline).check(f.agent);
    assert.deepEqual(f.selected, mode === 'brief' ? [] : [mode === 'raw' ? ['r0'] : ['r0', 'r3']]);
    assertReleased(f);
  });
}

test('Auto Compact refreshes the next batch index after awaited preparation', async () => {
  const f = fixture(4, 1);
  let round = 0;
  f.pipeline.applyReady = async (_agent, { ids }) => {
    f.selected.push(ids);
    if (++round === 2) { f.tokens = 0; return { changed: true }; }
    return null;
  };
  f.pipeline.call = async () => {
    await Promise.resolve();
    // Preserve the prepared source, but move an existing live carrier.
    f.session.surface.nodes = [...f.session.surface.nodes.slice(1), 10];
    f.events.push({ seq: 10, type: 'assistant/message',
      data: { message: { role: 'assistant', content: [{ type: 'text', text: 'new carrier' }] } } });
    f.state.records[0].carrierSeq = 10;
    return { blocks: [{ type: 'tool-call', name: PREPARE_TOOL.name,
      arguments: { summary: 'prepared', documents: [] } }] };
  };
  await new AutoCompaction(f.pipeline).check(f.agent);
  assert.equal(f.selected.length, 2);
  assert.ok(f.selected[1].includes('r0'), 'resolve the new carrier after await');
  assert.equal(f.selected[1].length, 2);
  assertReleased(f);
});

test('Auto Compact releases ownership when cancelled during an awaited batch', async () => {
  const f = fixture(), controller = new AbortController(), reason = Error('cancelled');
  f.pipeline.applyReady = async () => {
    await Promise.resolve();
    controller.abort(reason);
    return null;
  };
  await assert.rejects(new AutoCompaction(f.pipeline).check(f.agent, controller.signal), error => error === reason);
  assertReleased(f);
  assert.equal(f.state.autoCompact.lastKey, undefined, 'cancelled work cannot suppress a retry');
});
