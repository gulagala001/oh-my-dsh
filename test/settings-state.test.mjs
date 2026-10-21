import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsState } from '../src/client/settings-state.mjs';
import { scaledSettingValue, savedBackground } from '../src/client/settings-values.mjs';

test('a stale reload cannot overwrite a newer edit while its write is queued', async () => {
  let view, count = 0;
  const reload = Promise.withResolvers(), saved = Promise.withResolvers();
  const state = createSettingsState({ read: () => ++count === 1 ? { config: { enabled: false } } : reload.promise,
    write: () => saved.promise, onChange: next => { view = next; } });
  await state.load();
  const reading = state.load(), writing = state.commit({ enabled: true });
  reload.resolve({ config: { enabled: false } }); await reading;
  assert.equal(view.config.enabled, true);
  saved.resolve({ enabled: true }); assert.equal(await writing, true);
  assert.equal(view.config.enabled, true);
});

test('failed edits roll back independently without hiding newer queued choices', async () => {
  let view, calls = 0;
  const first = Promise.withResolvers(), second = Promise.withResolvers(), errors = [];
  const state = createSettingsState({ read: () => ({ config: { enabled: false, limit: 10 } }),
    write: () => ++calls === 1 ? first.promise : second.promise,
    onChange: next => { view = next; }, onError: error => errors.push(error) });
  await state.load();
  const failed = state.commit({ enabled: true }), successful = state.commit({ limit: 20 });
  first.reject(Error('save rejected')); assert.equal(await failed, false);
  assert.deepEqual(view.config, { enabled: false, limit: 20 });
  second.resolve({ enabled: false, limit: 20 }); assert.equal(await successful, true);
  assert.deepEqual(view.config, { enabled: false, limit: 20 }); assert.equal(errors.length, 1);
});

test('an unreadable server state stays visible as an error and the next save can recover', async () => {
  let view, reads = 0, writes = 0;
  const state = createSettingsState({ read() { if (++reads > 1) throw Error('offline'); return { config: { limit: 10 } }; },
    write(patch) { if (++writes === 1) throw Error('lost response'); return patch; }, onChange: next => { view = next; } });
  await state.load(); assert.equal(await state.commit({ limit: 20 }), false);
  assert.equal(view.config.limit, 10); assert.equal(view.error, 'offline');
  assert.equal(await state.commit({ limit: 30 }), true); assert.equal(view.error, '');
  assert.equal(view.config.limit, 30);
});

test('closing a settings owner preserves accepted writes without late view delivery', async () => {
  const gate = Promise.withResolvers(); let deliveries = 0, saved;
  const state = createSettingsState({ read: () => ({ config: {} }), write: () => gate.promise,
    onChange: () => deliveries++, onSaved: value => { saved = value; } });
  await state.load(); const writing = state.commit({ limit: 20 }); state.dispose();
  const before = deliveries; gate.resolve({ limit: 20 });
  assert.equal(await writing, true); assert.equal(deliveries, before); assert.deepEqual(saved, { limit: 20 });
  assert.equal(await state.commit({ limit: 30 }), false);
});

test('time settings accept exact seconds, minutes and days without fractional milliseconds', () => {
  for (const [raw, scale, value] of [['1.001', 1000, 1001], ['0.001', 60000, 60], ['1.5', 60000, 90000],
    ['0.001', 86400000, 86400], ['1.25', 86400000, 108000000], ['1e-3', 60000, 60], ['1.', 60000, 60000]]) {
    assert.equal(scaledSettingValue(raw, scale), value, raw + ' × ' + scale);
  }
  for (const raw of ['1.0001', '1e999999', '1e-999999', 'Infinity', '0x10', '']) assert.ok(Number.isNaN(scaledSettingValue(raw, 1000)), raw);
  assert.ok(Number.isNaN(scaledSettingValue('9007199254740992')));
  assert.equal(scaledSettingValue('0.7', 1, false), 0.7);
});

test('saving global background preserves text edited after submitting the request', () => {
  const next = savedBackground({ text: 'new draft', busy: true }, { text: 'submitted', revision: 2 }, 'submitted');
  assert.equal(next.text, 'new draft'); assert.equal(next.saved, 'submitted'); assert.equal(next.revision, 2); assert.equal(next.busy, false);
  const unchanged = savedBackground({ text: 'submitted' }, { text: 'submitted', revision: 2 }, 'submitted');
  assert.equal(unchanged.text, unchanged.saved);
});
