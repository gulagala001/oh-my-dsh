import { TOOL_RUNTIME_SCHEDULER } from '@deepseek-ai/dsh-tools';

// DSH alpha.2 source launches can load tools from both src and lib. Their
// module-private symbols differ even though the scheduler contract is identical.
// Reuse the existing scheduler; never rerun, substitute or approve a tool call.
export function bindToolScheduler(service, key = TOOL_RUNTIME_SCHEDULER) {
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
  return () => { if (Object.getOwnPropertyDescriptor(service, key)?.value === scheduler) delete service[key]; };
}

export function installToolSchedulerCompatibility(ctx) {
  ctx.effect(() => bindToolScheduler(ctx.tools));
}
