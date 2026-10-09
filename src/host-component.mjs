import { isDeepStrictEqual } from 'node:util';

// Host capability libraries carry private Symbols and WeakMaps. Resolve them
// through the host Loader's resolver. Node's ordinary require.resolve can
// select a stale hoisted package after an in-place host upgrade.
export async function loadHostModule(ctx, name, createModule, dependencies) {
  const specifier = '@deepseek-ai/dsh-' + name;
  const originalEntry = [...ctx.loader.entries()].find(entry => entry.options.name === specifier);
  if (!originalEntry) throw new Error(`The matching DSH component is missing: ${specifier}`);
  const tree = originalEntry.parent.tree;
  const modules = new Map(await Promise.all(dependencies.map(async specifier => [specifier,
    specifier.startsWith('node:') ? await import(specifier) : await tree.import(specifier)])));
  const component = createModule(specifier => {
    if (!modules.has(specifier)) throw new Error(`Unresolved host dependency: ${specifier}`);
    // CommonJS entries keep their default value through the factory's ESM interop.
    if (specifier === '@deepseek-ai/schemastery' || specifier === 'koffi') return modules.get(specifier).default;
    return { ...modules.get(specifier), __esModule: true };
  });
  return component;
}

export async function mountHostComponent(ctx, name, createModule, dependencies, config) {
  const component = await loadHostModule(ctx, name, createModule, dependencies);
  const originalEntry = [...ctx.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-' + name);
  const tree = originalEntry.parent.tree;
  const inherited = ['jobs-local', 'bash-sandbox', 'pwsh-sandbox'].includes(name);
  let effective = config;
  let inheritedConfig;
  if (inherited) {
    const { interpolate } = await tree.import('@deepseek-ai/cordis-plugin-loader');
    inheritedConfig = () => {
      const entry = [...ctx.loader.entries()].find(row => row.options.name === '@deepseek-ai/dsh-' + name);
      return entry ? { ...interpolate(ctx, entry.options.config ?? {}), ...config } : undefined;
    };
    effective = inheritedConfig();
  }
  const fiber = ctx.plugin(component.default ?? component, effective);
  await fiber;
  if (inheritedConfig) {
    ctx.on('app-boot/config-reload', async () => {
      if (ctx.fiber?.uid === null) return;
      const next = inheritedConfig();
      if (!next || isDeepStrictEqual(next, effective)) return;
      await fiber.update(next, true);
      effective = next;
    });
  }
}
