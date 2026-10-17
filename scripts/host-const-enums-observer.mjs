import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Loaded only by the isolated native regression's owned profile overlay.
export const inject = ['loader', 'tools', 'webServer', 'connection', 'profileContext'];
export async function apply(ctx, config) {
  const owned = await realpath(config.root);
  if (owned !== process.env.OMD_FIXTURE_ROOT || await realpath(ctx.profileContext.home) !== join(owned, 'home')) throw Error('Enum lifecycle observer requires its owned native fixture');
  const rows = () => [...ctx.loader.entries()];
  const native = rows().find(row => row.options.name === '@deepseek-ai/dsh-tools');
  if (!native) throw Error('Actual native tools Loader entry is missing');
  const tree = native.parent.tree;
  const cordis = await tree.import('@deepseek-ai/cordis'), tools = await tree.import('@deepseek-ai/dsh-tools');
  const ToolRuntime = tools.ToolRuntime ?? tools.default;
  const assert = (value, message) => { if (!value) throw Error(message); };
  const wait = async predicate => {
    const deadline = Date.now() + 10000;
    do { if (predicate()) return; await delay(10); } while (Date.now() < deadline);
    throw Error('Actual Loader lifecycle did not settle');
  };
  const errors = [];
  ctx.logger.exporter({ levels: { default: 3 }, export(message) { if (message.type === 'error') errors.push(message.args.map(String).join(' ')); } });
  let running = false;
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/__omd-enum-lifecycle', async handler(req, res) {
    const rejected = ctx.connection.requestRejection(req);
    if (rejected !== undefined) { res.writeHead(rejected); res.end(); return; }
    if (req.method !== 'POST' || running) { res.writeHead(409); res.end(); return; }
    running = true;
    try {
      assert((ctx.tools[cordis.symbols.original] ?? ctx.tools) instanceof ToolRuntime, 'Native ToolRuntime identity changed');
      assert(cordis.FiberState === undefined, 'Native Cordis unexpectedly exports FiberState');
      const jobs = rows().find(row => row.options.name === 'trisoul_x/host/jobs-local');
      const shell = rows().find(row => /^trisoul_x\/host\/(bash|pwsh)-sandbox$/.test(row.options.name) && row.fiber);
      assert(jobs?.fiber && shell?.fiber, 'Actual OMD jobs and shell providers are required');
      const observations = [], mounted = [];
      const disabled = async (entry, value) => {
        const old = entry.fiber;
        await entry.update({ disabled: value });
        if (value) await old?.await();
        else await entry.fiber?.await();
      };
      for (const name of ['bash', 'pwsh']) {
        const original = rows().find(row => row.options.name === '@deepseek-ai/dsh-tool-' + name);
        assert(original, 'Missing original tool entry: ' + name);
        await disabled(original, true);
        const module = await tree.import('trisoul_x/host/tool-' + name);
        const owner = rows().find(row => row.options.name === 'trisoul_x');
        assert(owner && await owner.parent.tree.import('@deepseek-ai/cordis') === cordis && await owner.parent.tree.import('@deepseek-ai/dsh-tools') === tools, 'OMD and native resolver namespaces must be equal');
        mounted.push({ name, module, fiber: await ctx.plugin(module) });
      }
      const background = name => Object.hasOwn(ctx.tools.get(name)?.parameters?.properties ?? {}, 'run_in_background');
      const observe = phase => {
        for (const { name } of mounted) {
          const count = ctx.tools.schemas().filter(row => row.name === name).length;
          observations.push({ phase, name, count, background: background(name) });
          assert(count === 1, 'Exactly one native registration is required: ' + phase + ':' + name);
        }
        assert(errors.length === 0, 'Native lifecycle errors: ' + errors.join('\n'));
      };
      await wait(() => mounted.every(({ name }) => background(name))); observe('jobs-active');
      await disabled(jobs, true);
      await wait(() => mounted.every(({ name }) => ctx.tools.get(name) && !background(name))); observe('jobs-disabled');
      await disabled(jobs, false);
      await wait(() => mounted.every(({ name }) => background(name))); observe('jobs-reenabled');
      for (const item of mounted) await item.fiber.dispose();
      await wait(() => mounted.every(({ name }) => !ctx.tools.get(name)));
      for (const item of mounted) item.fiber = await ctx.plugin(item.module);
      await wait(() => mounted.every(({ name }) => background(name))); observe('tools-reenabled');
      await disabled(shell, true);
      await wait(() => mounted.every(({ name }) => !ctx.tools.get(name)));
      await disabled(shell, false);
      await wait(() => mounted.every(({ name }) => background(name))); observe('pending-shell-reenabled');
      // Leave both rebuilt tools and jobs mounted for actual CLI appExit/root
      // disposal; the existing graceful fixture records final native errors.
      assert(errors.length === 0, errors.join('\n'));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ nativeToolRuntime: true, namespaceEqual: true, runtimeEnumExport: false, observations, nativeErrors: errors }));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.stack, nativeErrors: errors }));
    }
  } }));
}
