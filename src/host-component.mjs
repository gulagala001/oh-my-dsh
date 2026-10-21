import { isDeepStrictEqual } from 'node:util';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { symbols } from '@deepseek-ai/cordis';
import pluginPackage from '../package.json' with { type: 'json' };

async function privateComponentPath(candidate, specifier) {
  if (typeof candidate !== 'string' || !candidate.startsWith('file:')) return null;
  try {
    const url = new URL(candidate);
    if (url.search || url.hash) return null;
    const file = await realpath(fileURLToPath(url));
    if (!(await stat(file)).isFile()) return null;
    for (let directory = dirname(file);;) {
      let metadata;
      try { metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') return null; }
      if (metadata) {
        if (metadata.name !== specifier || metadata.version !== pluginPackage.engines.dsh || typeof metadata.main !== 'string') return null;
        // The configured file must be the real entry of the matching package,
        // not just a similarly named directory or an arbitrary submodule.
        return await realpath(join(directory, metadata.main)) === file ? file : null;
      }
      const parent = dirname(directory);
      if (parent === directory) return null;
      directory = parent;
    }
  } catch { return null; }
}

async function requireHostEntry(ctx, name) {
  const specifier = '@deepseek-ai/dsh-' + name;
  const entries = [...ctx.loader.entries()];
  const entry = entries.find(row => row.options.name === specifier);
  if (entry) return entry;
  // Purge replaces these two registrations with private file URLs. Keep the
  // Loader's own dependency tree; never resolve a second copy via Node here.
  if (name === 'tool-bash' || name === 'tool-pwsh') {
    const matches = [];
    for (const row of entries) {
      const file = await privateComponentPath(row.options.name, specifier);
      if (file && typeof row.parent?.tree?.import === 'function') matches.push({ row, file });
    }
    if (matches.length) {
      const first = matches[0];
      if (matches.every(match => match.file === first.file && match.row.parent.tree === first.row.parent.tree)) return first.row;
      throw Object.assign(new Error(`Multiple private registrations match ${specifier}; OMD cannot choose a component dependency tree.`), {
        code: 'OMD_HOST_COMPONENT_AMBIGUOUS', details: { component: specifier },
      });
    }
  }
  if (!entry) throw Object.assign(new Error(`The matching DSH component is missing: ${specifier}. Another plugin may have replaced its registration; restore the original component registration or use a compatible plugin version. OMD cannot safely infer a private replacement's ownership and dependencies.`), {
    code: 'OMD_HOST_COMPONENT_MISSING', details: { component: specifier },
  });
  return entry;
}

// Host capability libraries carry private Symbols and WeakMaps. Resolve them
// through the host Loader's resolver. Node's ordinary require.resolve can
// select a stale hoisted package after an in-place host upgrade.
export async function loadHostModule(ctx, name, createModule, dependencies) {
  return createHostModule(await requireHostEntry(ctx, name), createModule, dependencies);
}

async function createHostModule(originalEntry, createModule, dependencies) {
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
  const originalEntry = await requireHostEntry(ctx, name);
  const component = await createHostModule(originalEntry, createModule, dependencies);
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
    let reloading = Promise.resolve();
    ctx.on('app-boot/config-reload', () => reloading = reloading.catch(() => {}).then(async () => {
      if (ctx.fiber?.uid === null || ![1, 2].includes(ctx.fiber?.state)) return;
      const next = inheritedConfig();
      if (!next || isDeepStrictEqual(next, effective)) return;
      // Cordis update() returns void. The native lifecycle is the acknowledgement,
      // so a failed activation must not become our remembered applied config.
      // Observe the existing waterfall, including asynchronous update hooks.
      // Its rejected restart would otherwise be detached by update() itself.
      let updating;
      const release = ctx.on('internal/update', function (_config, _noSave, proceed) {
        if ((this?.[symbols.original] ?? this) !== (fiber[symbols.original] ?? fiber)) return proceed();
        updating = Promise.resolve().then(proceed);
        return updating.catch(() => {}); // The caller below owns the failure.
      }, { global: true, prepend: true });
      try {
        fiber.update(next, true);
        await updating;
        await fiber.await();
        effective = next;
      } finally { release(); }
    }));
  }
}
