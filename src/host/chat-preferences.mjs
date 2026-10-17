import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

const transcriptMigration = new Map([['compact', 'standard'], ['detailed', 'standard'], ['normal', 'standard'], ['expanded', 'detailed']]);
async function optionalText(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

// Only an explicit old replacement preference needs translation. The native
// ui-chat alias already uses DSH semantics, and defaults must remain defaults.
export async function prepareChatPreferenceMigration(ctx, namespace) {
  const profile = ctx.get('profileContext');
  if (!profile) return async () => {};
  const path = join(profile.dir, `.${namespace}-transcript-v2.json`);
  const text = await optionalText(path);
  let journal = text === undefined ? null : JSON.parse(text);
  if (text !== undefined && (journal === null || typeof journal !== 'object' || Array.isArray(journal) ||
      (journal.done !== undefined && typeof journal.done !== 'boolean') ||
      ((journal.done !== true || Object.hasOwn(journal, 'from') || Object.hasOwn(journal, 'to')) &&
        (!transcriptMigration.has(journal.from) || transcriptMigration.get(journal.from) !== journal.to)))) {
    throw Error('Invalid Chat preference migration journal');
  }
  if (journal?.done) return async () => {};
  const current = () => ctx.get('configEditor')?.configuration().find(row => row.entry.options.id === namespace)?.override?.transcriptView
    ?? ctx.settings?.describe().find(row => row.ns === namespace)?.user?.transcriptView;
  let previous = current();
  if (previous === undefined) {
    for (const name of ['settings.yaml', 'settings.yaml.imported']) {
      const retained = await optionalText(join(profile.home, name));
      if (retained === undefined) continue;
      previous = parse(retained)?.[namespace]?.transcriptView;
      break;
    }
  }
  const persist = async value => {
    await mkdir(profile.dir, { recursive: true });
    await writeFile(path + '.tmp', JSON.stringify(value) + '\n', { mode: 0o600 });
    await rename(path + '.tmp', path);
  };
  return async () => {
    await ctx.root.loader.await();
    if (!journal) {
      const to = transcriptMigration.get(previous);
      journal = to && current() === previous ? { from: previous, to } : { done: true };
      await persist(journal);
    }
    // Journal before settings.update: a crash after expanded→detailed must not
    // turn that detailed value into standard on the next activation.
    if (!journal.done && current() === journal.from) {
      await ctx.settings.update(namespace, { transcriptView: journal.to });
    }
    await persist({ ...journal, done: true });
  };
}
