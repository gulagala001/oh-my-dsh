import metadata from '../package.json' with { type: 'json' };
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

/** Resolve capability identities from the installed host's own Loader tree. */
export async function loadHostModule(ctx, name, factory, dependencies) {
  const entry = [...ctx.loader.entries()].find(row => row.options.name === `@deepseek-ai/dsh-${name}`);
  if (!entry?.parent?.tree?.import) throw Error(`DSH Workflow requires the original ${name} registration from DSH ${metadata.engines.dsh}`);
  const tree = entry.parent.tree;
  const specifier = `@deepseek-ai/dsh-${name}/package.json`;
  // Tree.import does not forward JSON import attributes. Use its exact
  // resolver/base for metadata too; runtime modules still go through the tree.
  const pkg = tree.ctx.loader.internal
    ? await tree.ctx.loader.internal.import(specifier, tree.ctx.baseUrl, { type: 'json' })
    : JSON.parse(await readFile(createRequire(tree.ctx.baseUrl).resolve(specifier), 'utf8'));
  if ((pkg.default ?? pkg).version !== metadata.engines.dsh) throw Error(`DSH Workflow requires exactly DSH ${metadata.engines.dsh}`);
  const modules = new Map(await Promise.all(dependencies.map(async specifier =>
    [specifier, specifier.startsWith('node:') ? await import(specifier) : await tree.import(specifier)])));
  return factory(specifier => {
    if (!modules.has(specifier)) throw Error(`Unresolved workflow dependency: ${specifier}`);
    if (specifier === '@deepseek-ai/schemastery' || specifier === 'koffi') return modules.get(specifier).default;
    return { ...modules.get(specifier), __esModule: true };
  });
}

export async function mountHostComponent(ctx, name, factory, dependencies, config) {
  const component = await loadHostModule(ctx, name, factory, dependencies);
  await ctx.plugin(component.default ?? component, config);
}
