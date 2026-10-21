import { existsSync, lstatSync, readFileSync, renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isMap, isScalar, isSeq, parseDocument, visit } from 'yaml';
import { symbols } from '@deepseek-ai/cordis';
import { LEGACY_ID, LEGACY_PACKAGE, OMD_ID, currentModuleName } from './legacy-identity.mjs';

const untrace = value => value?.[symbols.original] || value;
// Same tag handling as DSH's configuration editor, so `!!js` rows survive.
const yamlOptions = { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] };

function legacyEntries(ctx) {
  const loader = untrace(ctx.root.get('loader'));
  return [...(loader?.entries?.() ?? [])].filter(entry => entry?.options?.disabled !== true
    && currentModuleName(entry?.options?.name) !== entry?.options?.name);
}

// The earlier package and this one insert the same providers. Running both
// would split one data directory between two owners, so this one stays down
// until the earlier package is off. A bundle started with the profile cannot be
// removed while it runs, so it is only deselected here.
function refuseBesideLegacyPackage(ctx) {
  if (!legacyEntries(ctx).length) return;
  const manager = ctx.root.get('pluginManager');
  void Promise.resolve(manager?.listBundles?.())
    .then(rows => rows?.some(row => row.name === LEGACY_PACKAGE && row.enabled) ? manager.setBundleEnabled(LEGACY_PACKAGE, false) : undefined)
    .then(result => { if (result?.application === 'failed') throw new Error(result.error?.message ?? 'failed'); })
    .catch(error => ctx.logger.warn('Oh My DSH: could not disable the earlier package: %s', error?.message ?? error));
  throw new Error('旧版 Oh My DSH 仍在运行，已停用旧版（数据保留）。请完整重启 DSH 完成迁移，之后可在“插件”页面移除旧版；如仍看到此提示，请先在“插件”页面停用旧版。');
}

export function migrateLegacyDataDirectory(home, logger) {
  const legacy = join(home, LEGACY_ID), current = join(home, OMD_ID);
  let stat;
  try { stat = lstatSync(legacy); } catch (error) { if (error.code === 'ENOENT') return current; throw error; }
  if (!stat.isDirectory()) return current;
  if (existsSync(current)) {
    logger?.warn('Oh My DSH: both %s and %s exist; using %s', legacy, current, current);
    return current;
  }
  try { renameSync(legacy, current); } catch (error) {
    if (!['EBUSY', 'EPERM', 'EACCES', 'EXDEV'].includes(error.code)) throw error;
    logger?.warn('Oh My DSH: data directory stays at %s until it can be moved: %s', legacy, error.message);
    return legacy;
  }
  // Archive links, installer locks and browser profiles hold absolute paths
  // below the old directory; keep them resolvable.
  try {
    if (process.platform === 'win32') symlinkSync(current, legacy, 'junction');
    else symlinkSync(OMD_ID, legacy, 'dir');
  } catch (error) { logger?.warn('Oh My DSH: compatibility link %s was not created: %s', legacy, error.message); }
  return current;
}

function migratePatchDocument(text) {
  const document = parseDocument(text, yamlOptions);
  if (document.errors.length || !isSeq(document.contents)) return null;
  const rows = document.contents.items.filter(isMap);
  const ownRow = rows.some(row => !row.has('insert') && row.get('id') === OMD_ID);
  let edits = 0, config;
  for (const row of rows) {
    if (!ownRow && !row.has('insert') && row.get('id') === LEGACY_ID) {
      row.set('id', OMD_ID); config = row.get('config', true)?.toJSON?.(); edits++;
    }
    const registry = row.get('id') === 'agent-preset-registry' ? row.get('config', true) : null;
    if (isMap(registry)) for (const key of ['default', 'selectedDefault']) {
      if (registry.get(key) === LEGACY_ID) { registry.set(key, OMD_ID); edits++; }
    }
  }
  visit(document, { Pair(_, pair) {
    if (!isScalar(pair.key) || pair.key.value !== 'name' || !isScalar(pair.value)) return;
    const name = currentModuleName(pair.value.value);
    if (name !== pair.value.value) { pair.value.value = name; edits++; }
  } });
  return edits ? { text: String(document), config } : null;
}

// Rows saved by earlier releases name the old entry, module paths and default
// preset. Rewrite only those values; the host reads the file on its next
// configuration reload or start.
export function migrateLegacyProfilePatches(profile, home, logger) {
  let changed = false, config;
  for (const path of new Set([profile?.patchPath, home && join(home, 'cordis.patch.yml')].filter(Boolean))) {
    let before;
    try { before = readFileSync(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!before.includes(LEGACY_ID) && !before.includes(LEGACY_PACKAGE)) continue;
    const next = migratePatchDocument(before);
    if (!next) continue;
    if (readFileSync(path, 'utf8') !== before) {
      logger?.warn('Oh My DSH: %s changed during migration; retrying on the next start', path);
      continue;
    }
    const temp = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temp, next.text, { mode: statSync(path).mode & 0o777 });
    renameSync(temp, path);
    changed = true; config ??= next.config;
  }
  // legacy-settings.mjs receipt: the import already happened under the old id.
  if (profile?.dir) {
    const from = join(profile.dir, `.${LEGACY_ID}-settings-v4.json`), to = join(profile.dir, `.${OMD_ID}-settings-v4.json`);
    if (existsSync(from) && !existsSync(to)) renameSync(from, to);
  }
  return { changed, config };
}

// Sessions created before the rename record the earlier preset id. The
// registry resolves it to this preset, and clients receive the current id.
export function installLegacyPresetAlias(ctx) {
  ctx.inject(['agentPresets', 'sessionProjections'], scope => {
    const definitions = untrace(scope.agentPresets)?.definitions;
    if (definitions instanceof Map) {
      const get = definitions.get, own = Object.getOwnPropertyDescriptor(definitions, 'get');
      const alias = function (id) { return get.call(this, id) ?? (id === LEGACY_ID ? get.call(this, OMD_ID) : undefined); };
      Object.defineProperty(definitions, 'get', { value: alias, configurable: true, writable: true });
      scope.effect(() => () => {
        if (definitions.get !== alias) return;
        if (own) Object.defineProperty(definitions, 'get', own); else delete definitions.get;
      });
    }
    const wire = untrace(scope.sessionProjections)?.registrations?.get?.('agentPreset')?.def?.wire;
    if (typeof wire?.view === 'function') {
      const view = wire.view, alias = state => { const value = view(state); return value === LEGACY_ID ? OMD_ID : value; };
      wire.view = alias;
      scope.effect(() => () => { if (wire.view === alias) wire.view = view; });
    }
  });
}

// A rewritten profile patch reaches the running tree through the editor's own
// reload. Nudge it once after start-up so this run already uses the saved rows.
function reloadProfileOnce(ctx) {
  const owner = ctx.fiber;
  void (async () => {
    await owner.await?.();
    const loader = untrace(ctx.root.get('loader'));
    await loader?.await?.();
    const editor = ctx.get('configEditor'), row = editor?.configuration?.().find(row => row.entry.options.id === 'agent-preset-registry');
    if (row) await editor.edit(row.entry, current => current);
  })().catch(error => ctx.logger.warn('Oh My DSH: configuration reload after migration failed: %s', error?.message ?? error));
}

export function migrateLegacyInstallation(ctx, { home, dataDir }) {
  refuseBesideLegacyPackage(ctx);
  installLegacyPresetAlias(ctx);
  const profile = ctx.get('profileContext');
  const patches = migrateLegacyProfilePatches(profile, profile?.home ?? home, ctx.logger);
  if (patches.changed) reloadProfileOnce(ctx);
  const configured = dataDir || patches.config?.dataDir;
  return configured || migrateLegacyDataDirectory(home, ctx.logger);
}
