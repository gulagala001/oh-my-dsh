import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { bindToolScheduler } from './tool-scheduler-compat.mjs';

// Host capability libraries carry private Symbols and WeakMaps. Resolve them
// through the same profile tree as DSH, not the plugin's separate node_modules.
export async function mountHostComponent(ctx, name, createModule, dependencies, config) {
  const specifier = '@deepseek-ai/dsh-' + name;
  const originalEntry = [...ctx.loader.entries()].find(entry => entry.options.name === specifier);
  if (!originalEntry) throw new Error(`The matching DSH component is missing: ${specifier}`);
  const tree = originalEntry.parent.tree;
  const profileRequire = createRequire(new URL('omd-resolve.cjs', tree.ctx.baseUrl));
  const original = profileRequire.resolve('@deepseek-ai/dsh-' + name);
  const hostRequire = createRequire(original);
  const modules = new Map(await Promise.all(dependencies.map(async specifier => [specifier,
    specifier.startsWith('node:') ? await import(specifier) : await import(pathToFileURL(hostRequire.resolve(specifier)).href)])));
  const component = createModule(specifier => {
    if (!modules.has(specifier)) throw new Error(`Unresolved host dependency: ${specifier}`);
    // Schemastery publishes its constructor as the CommonJS entry.
    if (specifier === '@deepseek-ai/schemastery') return modules.get(specifier).default;
    return { ...modules.get(specifier), __esModule: true };
  });
  const inherited = { tools: 'tools', 'jobs-local': 'jobs', 'bash-sandbox': 'bash-sandbox', 'pwsh-sandbox': 'pwsh-sandbox' }[name];
  let effective = config;
  if (inherited) {
    const entry = [...ctx.loader.entries()].find(e => e.options.id === inherited);
    const { interpolate } = await tree.import('@deepseek-ai/cordis-plugin-loader');
    effective = { ...interpolate(ctx, entry?.options.config ?? {}), ...config };
  }
  const fiber = ctx.plugin(component.default ?? component, effective);
  await fiber;
  if (name === 'tools') {
    const { TOOL_RUNTIME_SCHEDULER } = await import(pathToFileURL(original).href);
    ctx.effect(() => bindToolScheduler(ctx.get('tools'), TOOL_RUNTIME_SCHEDULER));
  }
}
