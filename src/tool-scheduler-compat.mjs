import { TOOL_RUNTIME_SCHEDULER } from '@deepseek-ai/dsh-tools';

const aliases = new WeakMap();

// DSH alpha.2 source launches can load tools from both src and lib. Their
// module-private symbols differ even though the scheduler contract is identical.
// Reuse the existing scheduler; never rerun, substitute or approve a tool call.
export function bindToolScheduler(service, key = TOOL_RUNTIME_SCHEDULER) {
  const owned = aliases.get(service)?.get(key);
  if (owned && Object.getOwnPropertyDescriptor(service, key)?.value === owned.scheduler) {
    owned.owners++;
    return releaseAlias(service, key, owned);
  }
  if (service[key]) return () => {};
  const candidates = new Set(), seen = new Set();
  for (let object = service; object && !seen.has(object); object = Object.getPrototypeOf(object)) {
    seen.add(object);
    for (const symbol of Object.getOwnPropertySymbols(object)) {
      if (symbol.description !== key.description) continue;
      const scheduler = service[symbol];
      if (scheduler && ['prepare', 'dispatch', 'finalize', 'finish'].every(name => typeof scheduler[name] === 'function')) candidates.add(scheduler);
    }
  }
  if (candidates.size !== 1) throw new Error('Tool scheduler identity mismatch: use one matching DSH runtime; no tool call was started.');
  const scheduler = candidates.values().next().value;
  Object.defineProperty(service, key, { configurable: true, enumerable: false, value: scheduler });
  const ownedKeys = aliases.get(service) || new Map();
  const receipt = { scheduler, owners: 1 };
  ownedKeys.set(key, receipt); aliases.set(service, ownedKeys);
  return releaseAlias(service, key, receipt);
}

function releaseAlias(service, key, receipt) {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--receipt.owners > 0) return;
    if (Object.getOwnPropertyDescriptor(service, key)?.value === receipt.scheduler) delete service[key];
    if (aliases.get(service)?.get(key) === receipt) aliases.get(service).delete(key);
  };
}

export function installToolSchedulerCompatibility(ctx) {
  ctx.effect(() => bindToolScheduler(ctx.tools));
}
