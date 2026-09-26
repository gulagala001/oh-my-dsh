import test from 'node:test';
import assert from 'node:assert/strict';
import { Context, symbols } from '@deepseek-ai/cordis';
import { TOOL_RUNTIME_SCHEDULER } from '@deepseek-ai/dsh-tools';
import { bindToolScheduler } from '../src/tool-scheduler-compat.mjs';
import { mountHostComponent } from '../src/host-component.mjs';

const scheduler = () => ({ prepare: async value => ({ value }), dispatch: async value => value,
  finalize: async (_, value) => value, finish: (_, value) => value });

test('two real DSH module instances share the original scheduler without duplicate execution', async () => {
  const other = await import(import.meta.resolve('@deepseek-ai/dsh-tools') + '?omd-duplicate-test');
  assert.notEqual(other.TOOL_RUNTIME_SCHEDULER, TOOL_RUNTIME_SCHEDULER);
  assert.equal(other.TOOL_RUNTIME_SCHEDULER.description, TOOL_RUNTIME_SCHEDULER.description);
  let calls = 0;
  const original = scheduler(); original.prepare = async value => { calls++; return { value }; };
  const service = { [other.TOOL_RUNTIME_SCHEDULER]: original };
  assert.equal(service[TOOL_RUNTIME_SCHEDULER], undefined);
  const dispose = bindToolScheduler(service);
  assert.equal(service[TOOL_RUNTIME_SCHEDULER], original);
  const input = { name: 'read', args: { file_path: 'fixture.txt' } };
  assert.deepEqual(await service[TOOL_RUNTIME_SCHEDULER].prepare(input), { value: input });
  assert.equal(calls, 1);
  dispose(); assert.equal(service[TOOL_RUNTIME_SCHEDULER], undefined);
  assert.equal(service[other.TOOL_RUNTIME_SCHEDULER], original);
});

test('healthy tools stay byte-identical and cleanup cannot remove a replacement', () => {
  const original = scheduler(), service = { [TOOL_RUNTIME_SCHEDULER]: original };
  const before = Object.getOwnPropertyDescriptors(service);
  bindToolScheduler(service)(); assert.deepEqual(Object.getOwnPropertyDescriptors(service), before);
  const alternate = Symbol(TOOL_RUNTIME_SCHEDULER.description), missing = { [alternate]: original };
  const dispose = bindToolScheduler(missing), replacement = scheduler();
  Object.defineProperty(missing, TOOL_RUNTIME_SCHEDULER, { configurable: true, value: replacement });
  dispose(); assert.equal(missing[TOOL_RUNTIME_SCHEDULER], replacement);
});

test('ambiguous or incomplete schedulers fail before tools or filesystem operations start', () => {
  const a = Symbol(TOOL_RUNTIME_SCHEDULER.description), b = Symbol(TOOL_RUNTIME_SCHEDULER.description);
  for (const service of [{}, { [a]: { prepare() { assert.fail('not executed'); } } }, { [a]: scheduler(), [b]: scheduler() }]) {
    const before = Object.getOwnPropertyDescriptors(service);
    assert.throws(() => bindToolScheduler(service), /identity mismatch/);
    assert.deepEqual(Object.getOwnPropertyDescriptors(service), before);
  }
});

test('scheduler errors pass through once with their original error identity', async () => {
  const failure = new Error('original rejection'), value = scheduler(); let calls = 0;
  value.prepare = async () => { calls++; throw failure; };
  const service = { [Symbol(TOOL_RUNTIME_SCHEDULER.description)]: value }, dispose = bindToolScheduler(service);
  await assert.rejects(service[TOOL_RUNTIME_SCHEDULER].prepare({}), error => error === failure);
  assert.equal(calls, 1); dispose();
});


test('overlapping compatibility owners release only their last alias and dispose idempotently', () => {
  const value = scheduler(), foreign = Symbol(TOOL_RUNTIME_SCHEDULER.description);
  const service = { [foreign]: value };
  const first = bindToolScheduler(service), second = bindToolScheduler(service);
  first(); first();
  assert.equal(service[TOOL_RUNTIME_SCHEDULER], value, 'the second owner still needs the scheduler');
  second(); second();
  assert.equal(service[TOOL_RUNTIME_SCHEDULER], undefined);
  assert.equal(service[foreign], value, 'the host scheduler is never removed');
});

test('host scheduler binding follows delayed tools availability and service replacement', async t => {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  const other = await import(import.meta.resolve('@deepseek-ai/dsh-tools') + '?omd-delayed-tools');
  const tree = { async import(name) {
    if (name === '@deepseek-ai/cordis-plugin-loader') return { interpolate: (_, value) => value };
    return import(name);
  } };
  ctx.provide('loader', { *entries() { yield { options: { id: 'tools', name: '@deepseek-ai/dsh-tools' }, parent: { tree } }; } });
  const mounted = ctx.plugin(parent => mountHostComponent(parent, 'tools', () => other, [], {}));
  await mounted;
  assert.equal(ctx.get('tools'), undefined, 'a pending dependency is not a started service');
  const settle = async () => {
    for (;;) {
      const pending = [...ctx.registry.values()].flatMap(runtime => [...runtime.fibers]).filter(fiber => fiber.inertia);
      if (!pending.length) return;
      await Promise.all(pending.map(fiber => fiber.await()));
    }
  };
  const providePrompt = () => ctx.plugin(child => { child.provide('systemPrompt', { tools() {}, section() {} }); });
  let prompt = providePrompt(); await prompt; await settle();
  const first = ctx.get('tools')[symbols.original];
  assert.equal(first[TOOL_RUNTIME_SCHEDULER], first[other.TOOL_RUNTIME_SCHEDULER]);
  assert.ok(first[TOOL_RUNTIME_SCHEDULER]);
  await prompt.dispose(); await settle();
  assert.equal(ctx.get('tools'), undefined);
  assert.equal(first[TOOL_RUNTIME_SCHEDULER], undefined, 'retired service loses only the compatibility alias');
  prompt = providePrompt(); await prompt; await settle();
  const second = ctx.get('tools')[symbols.original];
  assert.notEqual(first, second);
  assert.equal(second[TOOL_RUNTIME_SCHEDULER], second[other.TOOL_RUNTIME_SCHEDULER]);
  assert.ok(second[TOOL_RUNTIME_SCHEDULER]);
  await mounted.dispose(); await settle();
  assert.equal(ctx.get('tools'), undefined);
  assert.equal(second[TOOL_RUNTIME_SCHEDULER], undefined);
});
