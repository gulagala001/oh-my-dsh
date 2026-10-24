import { Context, symbols } from '@deepseek-ai/cordis';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const host = createRequire(realpathSync(new URL('../../node_modules/@deepseek-ai/dsh/package.json', import.meta.url)));
const { Loader, Group } = await import(pathToFileURL(host.resolve('@deepseek-ai/cordis-plugin-loader')));
export async function nativeLoader(probe = { name: 'retention-probe', apply() {} }) {
  const ctx = new Context();
  await ctx.plugin(Loader);
  const loader = ctx.loader[symbols.original] ?? ctx.loader;
  loader.builtins.group = Group; loader.builtins.probe = probe;
  return { ctx, loader };
}
export async function collect() {
  for (let i = 0; i < 6; i++) { await new Promise(resolve => setImmediate(resolve)); global.gc(); }
  await new Promise(resolve => setImmediate(resolve));
}
export async function retiredGroup(loader, id) {
  await loader.create({ id, name: 'cordis:group', config: [{ id: id + '-leaf', name: 'cordis:probe' }] });
  await loader.await();
  const group = loader.resolve(id).subgroup, ref = new WeakRef(group);
  [...loader.entries()];
  await loader.root.remove(id); await loader.await();
  return ref;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { bindLiveLoaderEntries } = await import('../../src/loader-lifecycle-compat.mjs');
  const { ctx, loader } = await nativeLoader();
  const dispose = bindLiveLoaderEntries(loader), refs = [];
  try {
    for (let i = 0; i < 80; i++) refs.push(await retiredGroup(loader, 'retired-' + i));
    await collect();
    console.log(JSON.stringify({ retained: refs.filter(ref => ref.deref()).length, entries: [...loader.entries()].length }));
  } finally { dispose(); await ctx.fiber.dispose(); }
}
