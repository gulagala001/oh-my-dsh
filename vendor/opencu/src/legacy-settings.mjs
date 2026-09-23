import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

// DSH may import settings.yaml before this bundle is installed. Recover only
// our schema's fields from the retained file; explicit profile edits win.
export async function legacySettings(ctx, namespace, schema, aliases = []) {
  const profile = ctx.get('profileContext');
  if (!profile) return { value: {}, persist(done = () => {}) { return done(); } };
  const marker = join(profile.dir, `.${namespace}-settings-v4.json`);
  try { await readFile(marker); return { value: {}, persist(done = () => {}) { return done(); } }; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let legacy;
  for (const file of ['settings.yaml', 'settings.yaml.imported']) {
    try { legacy = parse(await readFile(join(profile.home, file), 'utf8')); break; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  const entries = ctx.get('configEditor')?.configuration() ?? [];
  const fields = Object.assign({}, legacy?.[namespace], ...aliases.filter(name => !entries.some(row => row.entry.options.id === name && !row.entry.disabled)).map(name => {
    // Aliases share feature preferences, never the owning plugin's data root.
    const { dataDir, ...fields } = { ...legacy?.[name], ...entries.find(row => row.entry.options.id === name)?.override };
    return fields;
  }));
  const user = entries.find(row => row.entry.options.id === namespace)?.override ?? {};
  const value = {};
  for (const [key, field] of Object.entries(schema.dict)) {
    if (!Object.hasOwn(fields, key) || Object.hasOwn(user, key)) continue;
    const parsed = field(fields[key]);
    value[key] = parsed && typeof parsed.get === 'function' ? parsed.get() : parsed;
  }
  return { value, persist(done = () => {}) {
    // No dependency cycle: perform the write after this plugin becomes active.
    void ctx.root.loader.await().then(async () => {
      const row = ctx.get('configEditor')?.configuration().find(row => row.entry.options.id === namespace);
      const latest = row?.override ?? ctx.settings.describe().find(row => row.ns === namespace)?.user ?? {};
      const patch = Object.fromEntries(Object.entries(value).filter(([key]) => !Object.hasOwn(latest, key)));
      if (Object.hasOwn(patch, 'dataDir')) {
        await ctx.configEditor.edit(row.entry, current => ({ ...current, ...patch }));
      } else if (Object.keys(patch).length) await ctx.settings.update(namespace, patch);
      await mkdir(profile.dir, { recursive: true });
      await writeFile(marker + '.tmp', JSON.stringify({ imported: Object.keys(patch) }) + '\n', { mode: 0o600 });
      await rename(marker + '.tmp', marker);
      await done();
    }).catch(error => ctx.logger.error('Legacy settings import failed: %s', error.message));
  } };
}
