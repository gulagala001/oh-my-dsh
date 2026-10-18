import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

import { syntheticBackend, acquireBeforeStart, warmTargets, createModelGuard, credentialFiles } from './protocol.mjs';

// Test-only plugin, copied to an exclusive package in the temporary home. It
// observes actual services and allows only two armed Agent-loop requests through
// the official adapter. Only the physical backend is synthetic.
export const inject = ['webServer', 'connection', 'loader', 'pluginPackages', 'tools', 'agents', 'sessions'];
export async function apply(ctx, config) {
  // Recomposition may reactivate an observer within the same Host PID.
  const bootId = randomUUID();
  const nativeEntry = [...ctx.loader.entries()].find(row => row.options.name === '@deepseek-ai/dsh-tools' && row.fiber?.state === 2);
  if (!nativeEntry) throw Error('Actual official tools entry is unavailable');
  const native = await nativeEntry.parent.tree.import('@deepseek-ai/dsh-tools');
  const cordis = await nativeEntry.parent.tree.import('@deepseek-ai/cordis');
  const agentSdk = await nativeEntry.parent.tree.import('@deepseek-ai/dsh-agent');
  const llm = await nativeEntry.parent.tree.import('@deepseek-ai/dsh-llm');
  const readSession = () => {
    if (!existsSync(config.arm)) return undefined;
    const value = JSON.parse(readFileSync(config.arm, 'utf8'));
    if (typeof value.sessionId !== 'string' || !value.sessionId || Object.keys(value).length !== 1) throw Error('Invalid Deny fixture arming');
    return value.sessionId;
  };
  const guard = createModelGuard(readSession, llm.isAgentLoopRequest), modelCalls = guard.attempts;
  let synthetic, lease, warmed, injectionFailure;
  const record = event => appendFileSync(config.trace, JSON.stringify({ bootId, pid: process.pid, ...event }) + '\n');
  const contained = path => typeof path === 'string' && resolve(path).startsWith(config.root + sep);
  for (const key of ['HOME', 'USERPROFILE', 'DSH_HOME', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME',
    'XDG_STATE_HOME', 'TEMP', 'TMP', 'TMPDIR', 'npm_config_cache', 'npm_config_userconfig'])
    if (!contained(process.env[key])) throw Error('Host environment escaped the fixture: ' + key);
  for (const path of [config.trace, config.arm, config.dataDir])
    if (!contained(path)) throw Error('Fixture path escaped the exclusive root');
  if (!contained(homedir())) throw Error('Host Node home escaped the fixture');
  for (const key of ['GITHUB_TOKEN', 'GH_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'NODE_OPTIONS'])
    if (process.env[key] !== undefined) throw Error('Forbidden inherited Host variable: ' + key);
  if (process.env.DESKTOP_HOST_FIXTURE !== 'local-test-only') throw Error('Missing synthetic credential marker');
  ctx.on('llm/stream', (options, next) => {
    const result = guard.intercept(options, next);
    record({ event: 'model-call', calls: modelCalls.length });
    return result;
  }, { global: true, prepend: true });
  ctx.inject(['opencu'], async child => {
    try {
      synthetic = syntheticBackend(config.root);
      lease = acquireBeforeStart(child, { dataDir: config.dataDir }, synthetic);
      warmed = await warmTargets(lease, synthetic);
    } catch (error) { injectionFailure = error.message; throw error; }
  });
  record({ event: 'ready', home: process.env.DSH_HOME, environmentHome: process.env.HOME, nodeHome: homedir(), profile: ctx.profileContext.dir });
  ctx.effect(() => () => record({ event: 'disposed', modelCalls: modelCalls.length }));
  // The CLI's bounded forceExit(0) skips beforeExit. Require this event to
  // distinguish natural quiescence from a timeout that happens to exit 0.
  // Cordis keeps the root fiber uid at 0 after disposal; use the unloaded
  // Loader service as the root-teardown evidence instead of a child-fiber uid.
  process.once('beforeExit', code => record({ event: 'before-exit', code, rootDisposed: ctx.get('loader') === undefined,
    modelCalls: modelCalls.length, backendCalls: synthetic && { ...synthetic.calls }, credentialFiles: credentialFiles(config.dataDir) }));
  process.once('exit', code => record({ event: 'exit', code, modelCalls: modelCalls.length, backendCalls: synthetic && { ...synthetic.calls }, credentialFiles: credentialFiles(config.dataDir) }));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => record({ event: 'termination-signal', signal }));
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/__desktop-deny', async handler(req, res) {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    try {
      if (injectionFailure) throw Error('Synthetic injection failed: ' + injectionFailure);
      const sessionId = readSession(), agent = sessionId && ctx.agents.get(sessionId), session = sessionId && ctx.sessions.get(sessionId);
      let deny;
      if (lease && warmed) {
        const pending = await lease.request('appApprovals/pending', { conversationId: sessionId });
        const approvals = await lease.request('appApprovals/read');
        const state = await lease.request('state');
        const activity = await lease.request('events');
        if (!pending.ok || !approvals.ok || !state.ok || !activity.ok) throw Error('Public OpenCU inspection failed');
        deny = { pending: pending.requests, approvals: approvals.approvals, selected: state.state.targets,
          activity: activity.sessions.find(row => row.sessionId === sessionId),
          calls: { ...synthetic.calls }, credentialFiles: credentialFiles(config.dataDir), warmed, target: synthetic.target, injected: true,
          authorizationFiles: { persisted: existsSync(join(config.dataDir, 'app-approvals.json')), pending: existsSync(join(config.dataDir, 'app-approvals.json.pending')) },
          nativeToolRuntime: (ctx.tools[cordis.symbols.original] || ctx.tools) instanceof native.ToolRuntime,
          nativeAgentRegistry: (ctx.agents[cordis.symbols.original] || ctx.agents) instanceof agentSdk.AgentRegistry,
          agentOwnsSession: Boolean(agent && agent.session === session),
          agent: agent && { id: agent.id, status: agent.status }, header: session?.header,
          events: session?.snapshotEvents().filter(row => ['turn/start', 'turn/end', 'tool/call', 'tool/result', 'assistant/message'].includes(row.type)) ?? [] };
      }
      const sdk = Object.fromEntries(config.sdkNames.map(name => {
        const pkg = ctx.pluginPackages.packageOf(name, pathToFileURL(ctx.profileContext.installAnchor).href);
        return [name, pkg && { version: pkg.version, dir: pkg.dir }];
      }));
      // Cordis 4.0.5 FiberState.ACTIVE is 2; this const enum is erased from its
      // public JS exports. Source: deepseek-harness@687f282 vendor/cordis/src/fiber.ts.
      if (ctx.fiber.state !== 2) throw Error('Host observer is not active');
      const entries = [...ctx.loader.entries()].map(row => {
        let source, moduleCallbackMatches = false;
        if (['trisoul_x', 'trisoul_x/host/ui-conversation', 'trisoul_x/host/ui-chat'].includes(row.options.name) && row.fiber?.state === 2) {
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
      const value = { bootId, pid: process.pid, sdk, entries, modelCalls, rejectedModels: guard.rejected, deny, profile: ctx.profileContext.dir,
        environmentHome: process.env.HOME, nodeHome: homedir(), dshHome: process.env.DSH_HOME, profileHome: ctx.profileContext.home,
        shellVersion: process.env.DSH_CLIENT_VERSION,
        sandbox: ctx.get('sandboxPolicy')?.resolve(), approval: ctx.get('approval')?.config?.policy,
        opencu: opencu && Object.fromEntries(['browserEnabled', 'nativeEnabled', 'extensionEnabled'].map(key => [key, opencu[key]])) };
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value));
    } catch (error) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  } }));
}
