/** Resolve capability identities from the installed host's own Loader tree. */
export async function loadHostModule(ctx, name, factory, dependencies) {
  const entry = [...ctx.loader.entries()].find(row => row.options.name === `@deepseek-ai/dsh-${name}`);
  if (typeof entry?.parent?.tree?.import !== 'function') throw Error(`DSH Workflow requires the host's ${name} loader registration`);
  const tree = entry.parent.tree;
  const importHostModule = async specifier => specifier.startsWith('node:') ? import(specifier) : tree.import(specifier);
  const modules = new Map(await Promise.all(dependencies.map(async specifier =>
    [specifier, await importHostModule(specifier)])));
  return factory(specifier => {
    if (!modules.has(specifier)) throw Error(`Unresolved workflow dependency: ${specifier}`);
    if (specifier === '@deepseek-ai/schemastery' || specifier === 'koffi') return modules.get(specifier).default;
    return { ...modules.get(specifier), __esModule: true };
  }, importHostModule);
}

export async function mountHostComponent(ctx, name, factory, dependencies, config) {
  const component = await loadHostModule(ctx, name, factory, dependencies);
  await ctx.plugin(component.default ?? component, config);
}
