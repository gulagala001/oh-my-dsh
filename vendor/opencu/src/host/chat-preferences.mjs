import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

const oldModes = { compact: 'standard', detailed: 'standard', normal: 'standard', expanded: 'detailed' };
const readOptional = async path => {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
};

// Capture the old owner's explicit preference before legacy import creates
// its marker. Native ui-chat preferences already follow the host's semantics.
export async function prepareChatPreferenceMigration(ctx, namespace) {
  const profile = ctx.get('profileContext');
  if (!profile) return async () => {};
  const file = join(profile.dir, `.${namespace}-transcript-v2.json`);
  const raw = await readOptional(file);
  let journal = raw === undefined ? null : JSON.parse(raw);
  if (journal?.done) return async () => {};
  const current = () => ctx.get('configEditor')?.configuration().find(row => row.entry.options.id === namespace)?.override?.transcriptView;
  let previous = current();
  const oldOwner = await readOptional(join(profile.dir, `.${namespace}-settings-v4.json`));
  if (previous === undefined && oldOwner !== undefined) {
    for (const name of ['settings.yaml', 'settings.yaml.imported']) {
      const text = await readOptional(join(profile.home, name));
      if (text === undefined) continue;
      previous = parse(text)?.[namespace]?.transcriptView;
      break;
    }
  }
  const save = async value => {
    await mkdir(profile.dir, { recursive: true });
    await writeFile(file + '.tmp', JSON.stringify(value) + '\n', { mode: 0o600 });
    await rename(file + '.tmp', file);
  };
  return async () => {
    await ctx.root.loader.await();
    // The saved pair makes a crash after settings.update safe: a resumed
    // expanded→detailed migration must never remap detailed a second time.
    if (!journal) {
      const to = Object.hasOwn(oldModes, previous) ? oldModes[previous] : undefined;
      journal = to && current() === previous ? { from: previous, to } : { done: true };
      await save(journal);
    }
    if (!journal.done && current() === journal.from) {
      await ctx.settings.update(namespace, { transcriptView: journal.to });
    }
    await save({ ...journal, done: true });
  };
}
