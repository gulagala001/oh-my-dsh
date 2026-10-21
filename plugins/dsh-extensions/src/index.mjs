import { Context } from '@deepseek-ai/cordis';
import { Extensions, VERSION } from './service.mjs';

export const name = 'dsh-extensions';
export const inject = ['webServer', 'connection'];
export { VERSION };

const ownership = Symbol.for('dsh.extensions.backend');
function reconcile(shared) {
  shared.pending = shared.pending.catch(() => {}).then(async () => {
    if (shared.owners.size && !shared.fiber) {
      const fiber = shared.host.plugin({ name: 'dsh-extensions-service', inject, apply: scope => { new Extensions(scope); } });
      shared.fiber = fiber;
      try { await fiber; }
      catch (error) { await fiber.dispose(); shared.fiber = null; throw error; }
    } else if (!shared.owners.size && shared.fiber) {
      await shared.fiber.dispose();
      shared.fiber = null;
    }
  });
  return shared.pending;
}

/** A standalone install and a bundled copy hold leases on one Host-owned service. */
export async function apply(ctx) {
  const root = ctx.root;
  root[Context.isolate].dshExtensions ??= Symbol('dshExtensions');
  const scopes = root[ownership] ??= new Map();
  const label = ctx[Context.isolate].dshExtensions;
  let shared = scopes.get(label);
  if (!shared) {
    shared = { host: root.extend({ [Context.isolate]: ctx[Context.isolate] }), owners: new Set(), fiber: null, pending: Promise.resolve() };
    scopes.set(label, shared);
  }
  const owner = ctx.fiber;
  if (shared.owners.has(owner)) { await shared.pending; return; }
  ctx.effect(() => {
    shared.owners.add(owner);
    return async () => {
      shared.owners.delete(owner);
      await reconcile(shared);
      if (!shared.owners.size && scopes.get(label) === shared) scopes.delete(label);
    };
  });
  await reconcile(shared);
}
