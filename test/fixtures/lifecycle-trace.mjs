// Test-only instrumentation. It is never included in the shipped plugin.
import { appendFileSync } from 'node:fs';
export const inject = ['loader'];
export function apply(ctx, config) {
  const relevant = entry => entry?.options?.name?.startsWith('trisoul_x');
  const row = entry => ({ id: entry.id, module: entry.options.name, disabled: entry.disabled,
    state: entry.fiber?.state ?? null, disposing: entry._disposing ?? 0 });
  const snapshot = () => [...ctx.loader.entries()].filter(relevant).map(row);
  const log = (event, entry, extra = {}) => appendFileSync(config.file,
    JSON.stringify({ at: Date.now(), event, entry: row(entry), snapshot: snapshot(), ...extra }) + '\n');
  const restored = [], patched = new Set();
  const patch = entry => {
    const prototype = Object.getPrototypeOf(entry);
    if (patched.has(prototype)) return;
    patched.add(prototype);
    for (const name of ['_dispose', 'update', '_init']) {
      const original = prototype[name];
      if (typeof original !== 'function') continue;
      const wrapped = async function (...args) {
        const tracked = relevant(this);
        if (tracked) log(name + ':start', this);
        try { const value = await original.apply(this, args); if (tracked) log(name + ':end', this); return value; }
        catch (error) { if (tracked) log(name + ':error', this, { error: error.stack }); throw error; }
      };
      prototype[name] = wrapped;
      restored.push(() => { if (prototype[name] === wrapped) prototype[name] = original; });
    }
  };
  for (const entry of ctx.loader.entries()) patch(entry);
  ctx.on('loader/entry-init', patch, { global: true });
  ctx.on('loader/partial-dispose', entry => { if (relevant(entry)) log('partial-dispose', entry); }, { global: true });
  ctx.effect(() => () => { for (const restore of restored.reverse()) restore(); });
}
