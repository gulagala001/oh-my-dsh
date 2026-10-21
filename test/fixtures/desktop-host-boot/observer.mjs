import { appendFileSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

// Test-only plugin, copied to an exclusive package in the temporary home. It
// observes actual services; the sole interceptor refuses every model stream.
export const inject = ['webServer', 'connection', 'loader', 'pluginPackages'];
export function apply(ctx, config) {
  // Recomposition may reactivate an observer within the same Host PID.
  const bootId = randomUUID(), modelCalls = [];
  const record = event => appendFileSync(config.trace, JSON.stringify({ bootId, pid: process.pid, ...event }) + '\n');
  const contained = path => typeof path === 'string' && resolve(path).startsWith(config.root + sep);
  for (const key of ['HOME', 'USERPROFILE', 'DSH_HOME', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME',
    'XDG_STATE_HOME', 'TEMP', 'TMP', 'TMPDIR', 'npm_config_cache', 'npm_config_userconfig'])
    if (!contained(process.env[key])) throw Error('Host environment escaped the fixture: ' + key);
  if (!contained(homedir())) throw Error('Host Node home escaped the fixture');
  for (const key of ['GITHUB_TOKEN', 'GH_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'NODE_OPTIONS'])
    if (process.env[key] !== undefined) throw Error('Forbidden inherited Host variable: ' + key);
  if (process.env.DESKTOP_HOST_FIXTURE !== 'local-test-only') throw Error('Missing synthetic credential marker');
  ctx.on('llm/stream', options => {
    modelCalls.push({ provider: options.provider, model: options.model });
    record({ event: 'model-call', calls: modelCalls.length });
    throw Error('Desktop boot acceptance forbids all model calls');
  }, { global: true, prepend: true });
  record({ event: 'ready', home: process.env.DSH_HOME, environmentHome: process.env.HOME, nodeHome: homedir(), profile: ctx.profileContext.dir });
  ctx.effect(() => () => record({ event: 'disposed', modelCalls: modelCalls.length }));
  // The CLI's bounded forceExit(0) skips beforeExit. Require this event to
  // distinguish natural quiescence from a timeout that happens to exit 0.
  // Cordis keeps the root fiber uid at 0 after disposal; use the unloaded
  // Loader service as the root-teardown evidence instead of a child-fiber uid.
  process.once('beforeExit', code => record({ event: 'before-exit', code, rootDisposed: ctx.get('loader') === undefined,
    modelCalls: modelCalls.length }));
  process.once('exit', code => record({ event: 'exit', code, modelCalls: modelCalls.length }));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => record({ event: 'termination-signal', signal }));
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/__desktop-host-boot', handler(req, res) {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    const sdk = Object.fromEntries(config.sdkNames.map(name => {
      const pkg = ctx.pluginPackages.packageOf(name, pathToFileURL(ctx.profileContext.installAnchor).href);
      return [name, pkg && { version: pkg.version, dir: pkg.dir }];
    }));
    // Cordis 4.0.5 FiberState.ACTIVE is 2; this const enum is erased from its
    // public JS exports. Source: deepseek-harness@687f282 vendor/cordis/src/fiber.ts.
    if (ctx.fiber.state !== 2) throw Error('Host observer is not active');
    const entries = [...ctx.loader.entries()].map(row => {
      let source, moduleCallbackMatches = false;
      if (['oh-my-dsh', 'oh-my-dsh/host/ui-conversation', 'oh-my-dsh/host/ui-chat'].includes(row.options.name) && row.fiber?.state === 2) {
        const pkg = ctx.pluginPackages.packageOf(row.options.name, row.parent.tree.ctx.baseUrl);
        if (!pkg) throw Error('Loaded OMD Host entry has no package source: ' + row.options.name);
        source = { name: pkg.name, dir: realpathSync(pkg.dir), version: pkg.version };
        moduleCallbackMatches = row.fiber.runtime.callback === ctx.registry.resolve(ctx.loader.unwrapExports(row.moduleNamespace));
      }
      return { id: row.options.id, name: row.options.name, disabled: row.disabled,
        active: row.fiber?.state === 2, state: row.fiber?.state, source, moduleCallbackMatches };
    });
    const settings = ctx.get('settings')?.describe({ redactSecrets: true }) ?? [];
    const opencu = settings.find(row => row.ns === 'omd-opencu')?.value;
    const value = { bootId, pid: process.pid, sdk, entries, modelCalls, profile: ctx.profileContext.dir,
      environmentHome: process.env.HOME, nodeHome: homedir(), dshHome: process.env.DSH_HOME, profileHome: ctx.profileContext.home,
      shellVersion: process.env.DSH_CLIENT_VERSION,
      sandbox: ctx.get('sandboxPolicy')?.resolve(), approval: ctx.get('approval')?.config?.policy,
      opencu: opencu && Object.fromEntries(['browserEnabled', 'nativeEnabled', 'extensionEnabled'].map(key => [key, opencu[key]])) };
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value));
  } }));
}
