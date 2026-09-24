import test from 'node:test';
import assert from 'node:assert/strict';
import { installFileUploadCompatibility } from '../src/file-upload-compat.mjs';

function setup(error, active = false, initialState = active ? 2 : 3) {
  const initial = () => 'old', next = () => 'new', effects = [], controllerEffects = [];
  const uploads = { agentResolver: initial, registerAgentResolver(resolve) {
    if (this.agentResolver) throw Error('file-upload: Agent resolver is already registered');
    this.agentResolver = resolve;
    return () => { if (this.agentResolver === resolve) this.agentResolver = undefined; };
  } };
  let restarted = 0, ready;
  const controller = { state: initialState, effect(fn) { controllerEffects.push(fn()); },
    async await() { if (error) throw error; },
    async restart() { restarted++; for (const dispose of controllerEffects) dispose(); uploads.registerAgentResolver(next); this.state = 2; },
  };
  const scope = { fileUploads: uploads, effect(fn) { effects.push(fn()); } };
  const root = { inject(_services, fn) { ready = fn(scope); }, effect(fn) { effects.push(fn()); } };
  const ctx = { root, loader: { *entries() { yield { options: { name: '@deepseek-ai/dsh-api-session-controller' }, fiber: controller }; } } };
  installFileUploadCompatibility(ctx);
  return { uploads, initial, next, ready, effects, restarted: () => restarted, ctx,
    activate() { controller.state = 1; uploads.registerAgentResolver(next); controller.state = 2; },
  };
}

test('a pending controller can activate after its prior traced resolver survived teardown', async () => {
  const f = setup(undefined, false, 0); await f.ready;
  assert.equal(f.restarted(), 0, 'pending services must resume through their own dependency lifecycle');
  assert.doesNotThrow(() => f.activate());
  assert.equal(f.uploads.agentResolver, f.next);
  for (const dispose of f.effects.reverse()) dispose();
});

test('first live install recovers only a failed stale upload resolver and binds future disposal', async () => {
  const f = setup(Error('file-upload: Agent resolver is already registered')); await f.ready;
  assert.equal(f.restarted(), 1); assert.equal(f.uploads.agentResolver, f.next);
  installFileUploadCompatibility(f.ctx); assert.equal(f.restarted(), 1);
  f.uploads.agentResolver = undefined;
  const unregister = f.uploads.registerAgentResolver(f.initial); unregister();
  assert.equal(f.uploads.agentResolver, undefined);
  for (const dispose of f.effects.reverse()) dispose();
  assert.equal(Object.hasOwn(f.ctx.root, Symbol.for('omd.file-upload-resolver-v017')), false);
});

test('an active resolver or unrelated controller error is never replaced or retried', async () => {
  for (const f of [setup(undefined, true), setup(Error('unrelated startup failure'))]) {
    await f.ready; assert.equal(f.restarted(), 0); assert.equal(f.uploads.agentResolver, f.initial);
    for (const dispose of f.effects.reverse()) dispose();
  }
});
