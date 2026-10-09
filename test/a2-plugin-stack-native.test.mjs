import test from 'node:test';
import assert from 'node:assert/strict';
import { access, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { parse, stringify } from 'yaml';
import { downloadDeliveryFixture } from './fixtures/computer-use/download-delivery.mjs';

const exec = promisify(execFile);
const enabled = process.env.OMD_A2_PLUGIN_STACK_NATIVE === '1';
const mode = process.env.OMD_A2_PLUGIN_STACK_MODE ?? 'full';
const output = resolve(process.env.OMD_A2_PLUGIN_STACK_EVIDENCE ?? 'work/a2-compat/plugin-stack-native');
const omaaRepo = process.env.OMD_A2_OMAA_REPO ?? '/Users/mac/Projects/omaa-dsh-a2-compat';
const { installedHost, packageEvidence, textReply, toolReply, until, fixtureEnvironment } = await import(pathToFileURL(join(omaaRepo, 'test/fixtures/installed-host.mjs')).href);
const cli = resolve(process.env.OMD_DSH_CLI ?? 'node_modules/@deepseek-ai/dsh/lib/bin.js');
const artifacts = {
  omd: { path: resolve('work/a2-compat/formal-candidate-a2/trisoul_x-0.2.1-alpha.2.omd.0.12.1.tgz'), sha256: 'c96fdf9051039b0f775526de6e3fa46476077174246358e3c4f70f15e932f5f6' },
  omaa: { path: join(omaaRepo, 'work/a2-compat/formal-candidate-a2/oh-my-agents-above-all-0.2.1-alpha.2.omaa.0.14.2.tgz'), sha256: 'b8acefe5475a88d868e00a3dc10b9fe593e8caaf486e57da8218b30f97256023' },
  iui: { path: '/Users/mac/Projects/iui-dsh-a2-compat/work/a2-compat/after-final/dsh-intelligent-ui-0.2.1-alpha.2.iui.1.0.1.tgz', sha256: 'a2a29990409a6aac3fe4c6446927a2ad58ae6da0de2c7e8c8234cab84d5279b1' },
  subscriptions: { path: '/Users/mac/Projects/subscriptions-dsh-a2-compat/work/a2-compat/artifacts/dsh-plugin-subscriptions-0.9.9-omd.2.tgz', sha256: 'b8376b7f92e996cc3486398b6c4fbbebb754a2bf2b3fc2b37ca18cc0b0a7c3f7' },
  market: { path: '/Users/mac/.local/share/omd-rea-deploy-20261009-0a81df68/artifacts/dshmarket-1.66.14.tgz', sha256: '598b1e94be1278f93cd0b344612b701b4de7e04e8c4ffce05fec25ea62828279' },
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const cft = join(output, 'browser/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const cuExecutable = join(output, 'browser/owned-cft-exec.sh');
const products = ['codex', 'grok', 'cursor', 'pi', 'zcode'].map(id => ({ id, preset: 'omaa-' + id }));
const formSource = 'root = Form("组合验收",' + JSON.stringify([{ name: 'place', label: '地点', type: 'text', value: '初始', required: true }, { name: 'count', label: '数量', type: 'number', value: 0, min: 0, max: 10 }, { name: 'enabled', label: '启用', type: 'checkbox', value: false }]) + ',[Text("组合验收")],"提交表单","IUI_SUBMIT_STACK")';
async function request(f, path, body) {
  const r = await fetch(f.origin + path, { headers: { cookie: f.cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
  const value = await r.json(); assert.equal(r.status, 200, path + ': ' + JSON.stringify(value)); return value;
}
async function subscriptions(f, endpoint, payload = {}) {
  const method = 'subscriptions-auth.' + endpoint;
  const value = await request(f, '/api/' + method, { type: 'client-request', rpcId: crypto.randomUUID(), method, payload });
  assert.equal(value.result?.ok, true, JSON.stringify(value)); return value.result.value;
}

async function fixture(t, label, full = false) {
  const out = join(output, label); await mkdir(out, { recursive: true });
  const f = await installedHost(t, { cliPath: cli, expectedHostVersion: '0.2.1-alpha.2', packagePath: artifacts.omaa.path,
    ...(full ? { omdPackagePath: artifacts.omd.path } : {}), safeEnvironment: true, isolatedHome: true, piResources: true,
    storeDir: join(output, 'public-store'), installTimeoutMs: 600000 });
  await writeFile(join(out, 'fixture.json'), JSON.stringify(f.evidence, null, 2) + '\n');
  t.after(async () => {
    await assert.rejects(access(f.root), { code: 'ENOENT' });
    const processes = (await exec('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })).stdout.split('\n').filter(row => row.includes(f.root));
    assert.deepEqual(processes, []);
    const bridgeDirectory = join('/private/tmp', 'trisoul-cu-' + hash(join(f.home, 'trisoul-x/computer-use')).slice(0, 24)); let bridgeExisted = false;
    try { const stat = await lstat(bridgeDirectory); assert(stat.isDirectory() && !stat.isSymbolicLink()); assert.equal(stat.uid, process.getuid()); bridgeExisted = true; await rm(bridgeDirectory, { recursive: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await assert.rejects(access(bridgeDirectory), { code: 'ENOENT' });
    await writeFile(join(out, 'cleanup.json'), JSON.stringify({ root: f.root, removed: true, ownedProcessesRemaining: processes, bridgeDirectory, bridgeExisted, bridgeRemoved: true }, null, 2) + '\n');
  });
  return { f, out };
}

if (mode === 'market-stock') test('official a2 native Market installation and API control', { timeout: 700000, skip: !enabled }, async t => {
  const { f, out } = await fixture(t, 'market-stock');
  const artifact = await packageEvidence(artifacts.market.path); assert.equal(artifact.sha256, artifacts.market.sha256);
  const report = { startedAt: new Date().toISOString(), artifact, hostVersion: f.evidence.version, supported: false, nativeCompatibilityExemptions: {} };
  await f.boot();
  const { sessionId } = await f.create('standard');
  f.replyWith(() => textReply('STOCK_A2_MARKET_CONTROL'));
  await f.prompt(sessionId, 'Stock host Market control.');
  await f.stop();
  try {
    const result = await f.command(['plugin', '--profile', 'omaa-fixture', 'add', 'file:' + artifact.path]);
    report.install = { ok: true, stdout: result.stdout, stderr: result.stderr }; report.supported = true;
  } catch (error) { report.install = { ok: false, error: error.message }; }
  assert.deepEqual(await f.exemptions(), {});
  await f.boot();
  report.bundles = await f.call('pluginManager/listBundles', {});
  if (report.supported) {
    report.installed = await f.installedEvidence('dshmarket');
    report.capabilities = await request(f, '/dsh-market/api/v1/capabilities');
    assert.equal(report.capabilities.schema, 'dsh-market/update-api/v1');
    assert.equal(report.capabilities.marketVersion, '1.66.14');
    for (const key of ['check', 'update', 'progress', 'rollback', 'updatesSummary']) assert.equal(report.capabilities.features[key], true);
  }
  assert.equal(report.supported, true, 'Stock Market installation failure is evidence of a compatibility boundary, not a pass');
  report.finishedAt = new Date().toISOString();
  await writeFile(join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  t.diagnostic(JSON.stringify({ hostVersion: report.hostVersion, supported: report.supported, install: report.install }));
});

// This is an observational Cordis plugin plus one independent foreign tool.
// It does not create an Agent, provider, workflow or UI implementation.
async function probeApply(ctx, config) {
  const fs = await import('node:fs/promises');
  ctx.tools.register({ name: 'stack_foreign_probe', description: 'Independent plugin writes exactly one owned audit line.',
    parameters: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute({ file }) { if (!file.startsWith(config.workspace + '/')) throw Error('Probe path outside owned workspace'); await fs.appendFile(file, 'once\n'); return 'STACK_FOREIGN_EXECUTED'; },
  });
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/stack-observer', async handler(req, res) {
    const rejected = ctx.connection.requestRejection(req); if (rejected !== undefined) { res.writeHead(rejected); res.end(); return; }
    try {
      const id = new URL(req.url, 'http://localhost').searchParams.get('session');
      const resolved = id && await ctx.get('sessionController')?.resolveAgent(id); if (resolved?.error) throw resolved.error;
      const agent = resolved?.agent ?? ctx.agents.get(id); const session = agent?.session ?? ctx.sessions.get(id);
      const entries = [...ctx.loader.entries()];
      const nativeEntry = entries.find(row => row.options.name === '@deepseek-ai/dsh-tools');
      const native = await nativeEntry.parent.tree.import('@deepseek-ai/dsh-tools');
      const cordis = await nativeEntry.parent.tree.import('@deepseek-ai/cordis');
      const owners = {};
      for (const owner of ['trisoul_x', 'oh-my-agents-above-all', 'dsh-intelligent-ui', 'dsh-plugin-subscriptions', 'dshmarket']) {
        const entry = entries.find(row => row.options.name === owner) ?? entries.find(row => row.options.name?.startsWith(owner + '/'));
        if (!entry) continue;
        const row = owners[owner] = { entry: entry.options.name, peers: {} };
        for (const peer of ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-settings', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-web', '@deepseek-ai/dsh-attachment', '@deepseek-ai/dsh-home-paths']) {
          try { const fromOwner = await entry.parent.tree.import(peer), fromHost = await nativeEntry.parent.tree.import(peer); row.peers[peer] = { namespaceEqual: fromOwner === fromHost }; }
          catch (error) { row.peers[peer] = { error: error.message }; }
        }
      }
      const skills = ctx.get('skills') ?? ctx.get('skill');
      const catalog = skills?.list ? await skills.list({ cwd: session?.header.cwd, scope: agent }) : [];
      const value = { agent: agent && { id: agent.id, status: agent.status }, header: session?.header,
        entries: entries.map(row => row.options.name), owners,
        nativeToolRuntime: (ctx.tools[cordis.symbols.original] || ctx.tools) instanceof native.ToolRuntime,
        tools: ctx.tools.schemas(agent), skills: catalog.map(row => ({ name: row.name, provider: row.provider })),
        events: session?.snapshotEvents() ?? [] };
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
    } catch (error) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  } }));
}

async function installProbe(f, offlineOrigin) {
  await writeFile(cuExecutable, "#!/bin/sh\nexec '" + cft.replaceAll("'", "'\\''") + "' --use-mock-keychain --password-store=basic \"$@\"\n", { mode: 0o700 });
  const directory = join(f.root, 'stack-observer'); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'owned-stack-audit-observer', version: '1.0.0', type: 'module', exports: './index.mjs' }));
  const guard = `const fetchBefore = globalThis.fetch; globalThis.fetch = (input, init) => { const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url); if (['127.0.0.1','localhost','[::1]'].includes(url.hostname)) return fetchBefore(input, init); return fetchBefore(${JSON.stringify(offlineOrigin)} + '/?target=' + encodeURIComponent(url.href), init); };`;
  await writeFile(join(directory, 'index.mjs'), guard + '\nexport const inject = ["loader","tools","webServer","connection","agents","sessions"];\nexport const apply = ' + probeApply.toString() + ';\n');
  const patch = [{ id: 'locale', config: { preference: 'zh' } }, { id: 'sandbox-policy', config: { mode: 'danger-full-access', workspaceRoot: f.workspace } }, { id: 'approval', config: { policy: 'never' } },
    { id: 'llm-subscriptions', config: { providers: ['codex', 'grok'], codexClientVersion: '0.134.0' } },
    { id: 'trisoul-x', config: { componentAutoSetup: false, computerUseNativeBinary: join(f.root, 'missing-native-driver'), computerUseNativeSocket: join(f.root, 'missing-native.sock'), computerUseChromeUserDataDir: join(f.root, 'isolated-chrome-profile'), computerUseBrowserExecutable: cuExecutable, unifiedBackground: { provider: 'fixture', model: 'fixture', effort: 'off' }, dreamProvider: 'fixture', dreamModel: 'fixture' } },
    { insert: [{ id: 'owned-stack-observer', name: pathToFileURL(join(directory, 'index.mjs')).href, config: { workspace: f.workspace } }] }];
  const patchPath = join(f.home, 'profiles/omaa-fixture/cordis.patch.yml');
  let existing = [];
  try { existing = parse(await readFile(patchPath, 'utf8')); assert(Array.isArray(existing)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const replaceIds = new Set(patch.map(row => row.id).filter(Boolean));
  const preserved = existing.filter(row => !replaceIds.has(row.id) && !row.insert?.some(entry => entry.id === 'owned-stack-observer'));
  await writeFile(patchPath, stringify([...preserved, ...patch]));
  // The official host migrates settings.yaml once and removes that source.
  // Keep its native migrated layer; only adjust the legacy file before stock boot.
  try {
    const settings = JSON.parse(await readFile(join(f.home, 'settings.yaml'), 'utf8'));
    Object.assign(settings['trisoul-x'], { computerUseBrowserExecutable: cuExecutable, unifiedBackground: { provider: 'fixture', model: 'fixture', effort: 'off' }, dreamProvider: 'fixture', dreamModel: 'fixture' });
    await writeFile(join(f.home, 'settings.yaml'), JSON.stringify(settings));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const skillDirectory = join(f.workspace, '.agents/skills/stack-native-skill'); await mkdir(skillDirectory, { recursive: true });
  await writeFile(join(skillDirectory, 'SKILL.md'), '---\nname: stack-native-skill\ndescription: Owned native skill catalog and byte preservation probe.\n---\nSTACK_NATIVE_SKILL_BYTES\n');
  await writeFile(join(f.workspace, 'native-fixture.txt'), 'SUBSCRIPTIONS_STACK_NATIVE_BYTES\n');
  const authDirectory = join(f.home, 'plugins/subscriptions'); await mkdir(authDirectory, { recursive: true });
  await writeFile(join(authDirectory, 'auth.json'), JSON.stringify({ codex: { default: 'fixture', accounts: { fixture: { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: Date.now() + 3600000, accountId: 'fixture', emailAddress: 'fixture@example.invalid', planType: 'pro' } } }, grok: { default: 'fixture', accounts: { fixture: { accessToken: 'synthetic-grok-access', refreshToken: 'synthetic-grok-refresh', expiresAt: Date.now() + 3600000, tokenEndpoint: 'https://auth.example.invalid/token', account: 'fixture@example.invalid' } } } }));
}

async function offlineSubscriptions(f, report) {
  let modelCalls = 0;
  const server = createServer(async (req, res) => {
    try {
      const target = new URL(new URL(req.url, 'http://localhost').searchParams.get('target'));
      const row = { host: target.hostname, path: target.pathname }; report.network.push(row);
      if (target.hostname === 'chatgpt.com' && target.pathname.endsWith('/models')) {
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ models: [{ slug: 'a2-fast', display_name: 'A2 Fast Fixture', context_window: 32000, max_context_window: 64000, priority: 0, service_tiers: [{ id: 'priority' }], supported_reasoning_levels: [{ effort: 'medium' }], default_reasoning_level: 'medium' }, { slug: 'a2-standard', display_name: 'A2 Standard Fixture', priority: 1 }] }));
      } else if (['api.x.ai', 'cli-chat-proxy.grok.com'].includes(target.hostname) && target.pathname === '/v1/models') {
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'grok-fixture', name: 'Grok media fixture', context_window: 32768 }] }));
      } else if (target.hostname === 'chatgpt.com' && target.pathname === '/backend-api/codex/images/generations') {
        let bytes = ''; for await (const chunk of req) bytes += chunk; row.imageBody = JSON.parse(bytes); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ b64_json: report.mediaFixtures.pngBase64 }] }));
      } else if (target.hostname === 'api.x.ai' && target.pathname === '/v1/videos/generations') {
        let bytes = ''; for await (const chunk of req) bytes += chunk; row.videoBody = JSON.parse(bytes); res.setHeader('content-type', 'application/json'); res.end('{"request_id":"stack-video"}');
      } else if (target.hostname === 'api.x.ai' && target.pathname === '/v1/videos/stack-video') {
        res.setHeader('content-type', 'application/json'); res.end('{"status":"done","video":{"url":"https://owned-media.example.invalid/stack.mp4","duration":1}}');
      } else if (target.hostname === 'owned-media.example.invalid' && target.pathname === '/stack.mp4') {
        res.setHeader('content-type', 'video/mp4'); res.end(await readFile(report.mediaFixtures.videoPath));
      } else if (target.hostname === 'chatgpt.com' && target.pathname.endsWith('/responses')) {
        let bytes = ''; for await (const chunk of req) bytes += chunk; const body = JSON.parse(bytes);
        const tools = (body.tools ?? []).map(tool => tool.name), main = tools.includes('read');
        row.wire = { model: body.model, fast: body.service_tier === 'priority', main, system: typeof body.instructions === 'string' && body.instructions.length > 0, tools,
          correlatedToolResult: body.input.some(item => item.type === 'function_call_output' && item.call_id === 'stack-native-call' && item.output.includes('SUBSCRIPTIONS_STACK_NATIVE_BYTES')) };
        const args = JSON.stringify({ file_path: join(f.workspace, 'native-fixture.txt') });
        const events = main && ++modelCalls === 1 ? [
          { type: 'response.output_item.added', item: { type: 'function_call', id: 'fc-stack', call_id: 'stack-native-call', name: 'read' } },
          { type: 'response.function_call_arguments.delta', item_id: 'fc-stack', delta: args },
          { type: 'response.output_item.done', item: { type: 'function_call', id: 'fc-stack', call_id: 'stack-native-call', name: 'read', arguments: args } },
        ] : [{ type: 'response.output_item.added', item: { type: 'message', id: 'msg-stack' } }, { type: 'response.output_text.delta', item_id: 'msg-stack', content_index: 0, delta: main ? 'SUBSCRIPTIONS_STACK_LOOP_OK' : 'Offline title' }, { type: 'response.output_item.done', item: { type: 'message', id: 'msg-stack' } }];
        events.push({ type: 'response.completed', response: { usage: { input_tokens: 100, output_tokens: 20 } } });
        res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('') + 'data: [DONE]\n\n');
      } else { row.unsupported = true; res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"owned offline fixture: unsupported endpoint"}'); }
    } catch (error) { report.networkErrors.push(error.message); res.writeHead(500); res.end(error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

const orders = [['omd', 'omaa', 'iui', 'subscriptions', 'market'], ['market', 'subscriptions', 'iui', 'omaa', 'omd']];
if (mode === 'full') for (const [orderIndex, order] of orders.entries()) test('official a2 full plugin coexistence, order ' + order.join(' → '), { timeout: 1400000, skip: !enabled }, async t => {
  assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
  const report = { startedAt: new Date().toISOString(), order, platform: process.platform, arch: process.arch, passed: false, phase: 'preparation', checks: [], network: [], networkErrors: [], uiErrors: [], uiWarnings: [], nativeSubmissions: [], sessions: [], limits: ['Darwin arm64 only; owned headless CFT and local synthetic model/Responses account.', 'No real login, paid model, OS desktop interaction, remote Market update, or live external media backend.'] };
  let f, out, context, page, offline;
  t.after(async () => {
    try {
      if (page && !page.isClosed()) { await page.screenshot({ path: join(out, report.passed ? 'final.png' : 'failure.png'), animations: 'disabled' }); await writeFile(join(out, 'page.txt'), await page.locator('body').innerText()); await writeFile(join(out, 'page.html'), await page.content()); }
      if (f?.origin) for (const session of report.sessions) { try { await writeFile(join(out, 'session-' + session.id + '.json'), JSON.stringify(await f.snapshot(session.sessionId), null, 2)); } catch (error) { session.captureError = error.message; } }
      if (out) { await writeFile(join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n'); if (f) await writeFile(join(out, 'model-requests.json'), JSON.stringify(f.requests, null, 2) + '\n'); }
    } finally { await context?.close(); await offline?.close(); }
  });
  ({ f, out } = await fixture(t, 'order-' + (orderIndex + 1), true));
  await writeFile(join(out, 'test-source-at-execution.mjs'), await readFile(new URL(import.meta.url)));
  assert.equal(f.evidence.artifact.sha256, artifacts.omaa.sha256); assert.equal(f.evidence.omdArtifact.sha256, artifacts.omd.sha256);
  report.browser = { executable: cft, sha256: hash(await readFile(cft)), ownedProfile: true, mockKeychain: true };
  offline = await offlineSubscriptions(f, report); await installProbe(f, offline.origin);
  report.browser.cuLauncher = { path: cuExecutable, sha256: hash(await readFile(cuExecutable)), mockKeychain: true, passwordStore: 'basic' };
  const videoPath = join(out, 'synthetic.mp4'); await exec('/Users/mac/.local/bin/ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=16x16:d=1', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath], { env: fixtureEnvironment(f.home, true) });
  const pngPath = join(out, 'synthetic.png'); await exec('/Users/mac/.local/bin/ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', videoPath, '-frames:v', '1', pngPath], { env: fixtureEnvironment(f.home, true) });
  const pngBase64 = (await readFile(pngPath)).toString('base64');
  report.mediaFixtures = { pngBase64, pngSha256: hash(Buffer.from(pngBase64, 'base64')), videoPath, videoSha256: hash(await readFile(videoPath)), synthetic: true };
  const observe = id => request(f, '/stack-observer?session=' + encodeURIComponent(id));
  const checkpoint = async phase => { report.phase = phase; await writeFile(join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n'); };
  await f.boot(); const stock = await f.create('standard'); report.stock = await observe(stock.sessionId);
  assert.equal(report.stock.nativeToolRuntime, true); assert(report.stock.skills.some(row => row.name === 'stack-native-skill'));
  await f.stop();
  report.installs = [];
  for (const key of order) {
    const artifact = await packageEvidence(artifacts[key].path); assert.equal(artifact.sha256, artifacts[key].sha256);
    const result = await f.command(['plugin', '--profile', 'omaa-fixture', 'add', 'file:' + artifact.path]);
    report.installs.push({ key, path: artifact.path, name: artifact.name, version: artifact.version, sha256: artifact.sha256, peers: artifact.manifest.peerDependencies, peerMetadata: artifact.manifest.peerDependenciesMeta, stdout: result.stdout, stderr: result.stderr });
    assert.equal(hash(await readFile(artifact.path)), artifact.sha256); await checkpoint('installed-' + key);
  }
  // Native installation materializes composition. Apply the documented owned
  // provider config afterwards, just as the standalone native Subs fixture does.
  await installProbe(f, offline.origin);
  const effective = await f.command(['--profile', 'omaa-fixture', '--dump-config']); await writeFile(join(out, 'effective-installed.yml'), effective.stdout);
  assert.match(effective.stdout, /codexClientVersion: ['"]?0\.134\.0/);
  assert.match(effective.stdout, /providers:\s*\n\s*- codex\s*\n\s*- grok/);
  const userLayerPath = join(f.home, 'profiles/omaa-fixture/cordis.yml'), userLayerBytes = await readFile(userLayerPath); report.userLayerBaselineSha256 = hash(userLayerBytes); report.userLayerChecks = [];
  const checkUserLayer = async stage => {
    const actual = await readFile(userLayerPath), sha256 = hash(actual); report.userLayerChecks.push({ stage, sha256, bytesEqual: actual.equals(userLayerBytes) });
    await writeFile(join(out, 'user-layer-' + stage + '.yml'), actual); assert.equal(sha256, report.userLayerBaselineSha256, 'Native user layer materialized or changed at ' + stage); assert(actual.equals(userLayerBytes));
  };
  await writeFile(join(out, 'user-layer-installed-baseline.yml'), userLayerBytes);
  assert.deepEqual(await f.exemptions(), {}); await f.boot();
  report.market = await request(f, '/dsh-market/api/v1/capabilities'); assert.equal(report.market.marketVersion, '1.66.14'); assert.equal(report.market.features.update, true);
  report.iuiHealth = await request(f, '/intelligent-ui/api/health'); assert.equal(report.iuiHealth.hostVersion, '0.2.1-alpha.2'); assert.equal(report.iuiHealth.sdkVersion, '0.2.1-alpha.2');
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const standard = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'standard' });
  report.standard = await observe(standard.sessionId); assert.equal(report.standard.nativeToolRuntime, true);
  for (const owner of ['trisoul_x', 'oh-my-agents-above-all', 'dsh-intelligent-ui', 'dsh-plugin-subscriptions', 'dshmarket']) {
    const row = report.standard.owners[owner]; assert(row, 'Actual NativeLoader owner entry missing: ' + owner);
    for (const [peer, actual] of Object.entries(row.peers)) assert.equal(actual.namespaceEqual, true, owner + ' actual NativeLoader ' + peer + ': ' + JSON.stringify(actual));
  }
  const baselineNames = report.stock.tools.map(row => row.name), fullNames = new Set(report.standard.tools.map(row => row.name));
  report.nativeToolsRetained = baselineNames.filter(name => fullNames.has(name)); report.nativeToolsMissing = baselineNames.filter(name => !fullNames.has(name));
  assert(report.nativeToolsRetained.length >= baselineNames.length * 0.8, JSON.stringify(report.nativeToolsMissing));
  for (const name of ['read', 'write', 'edit', 'bash', 'skill', 'stack_foreign_probe']) assert.deepEqual(report.standard.tools.find(row => row.name === name), report.stock.tools.find(row => row.name === name), name + ' preserves exact native metadata');
  assert(report.standard.skills.some(row => row.name === 'stack-native-skill'));
  const issued = new Set();
  f.replyWith(payload => {
    if (!payload.tools?.length) return textReply('Owned auxiliary fixture');
    const user = payload.messages.filter(row => row.role === 'user').map(textOf).findLast(text => text.startsWith('STACK_') || text.includes('IUI_SUBMIT_STACK')) ?? '';
    if (user.startsWith('STACK_FORM_')) return textReply(user + '\n\n```openui\n' + formSource + '\n```');
    if (user.includes('IUI_SUBMIT_STACK')) { const match = user.match(/所选设置：\s*(\{[\s\S]*\})/); assert(match); report.nativeSubmissions.push({ user, state: JSON.parse(match[1]) }); return textReply('IUI_STACK_ACCEPTED'); }
    if (user.startsWith('STACK_PROBE_') && !issued.has(user)) { issued.add(user); const id = user.slice('STACK_PROBE_'.length); const args = { file: join(f.workspace, id + '-foreign.txt') }; const ptc = payload.tools.some(row => row.function.name === 'run_code'); return toolReply(ptc ? 'run_code' : 'stack_foreign_probe', ptc ? { code: 'return await tools.stack_foreign_probe(' + JSON.stringify(args) + ')', description: 'Run independent plugin through native SDK' } : args); }
    if (user.startsWith('STACK_CU_') && !issued.has(user)) { issued.add(user); const args = report.cuStages[user]; const ptc = payload.tools.some(row => row.function.name === 'run_code'); return toolReply(ptc ? 'run_code' : 'computer_use', ptc ? { code: 'return await tools.computer_use(' + JSON.stringify(args) + ')', description: args.title } : args); }
    if (user.startsWith('STACK_MEDIA_') && !issued.has(user)) { issued.add(user); return user === 'STACK_MEDIA_IMAGE' ? toolReply('image_generate', { prompt: 'Synthetic blue square', provider: 'gpt' }) : toolReply('video_generate', { prompt: 'Synthetic blue clip', duration: 1 }); }
    if (user === 'STACK_CANCEL_LATE') return textReply('STACK_CANCEL_LATE_RESULT_MUST_NOT_PUBLISH');
    return textReply('STACK_TURN_COMPLETED');
  });
  for (const product of products) {
    const created = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: product.preset });
    await until(async () => (await f.api(created.sessionId)).value.omdAvailable === true);
    assert.equal((await f.api(created.sessionId, { enhancement: true })).value.enhancementActive, true);
    const session = { ...product, sessionId: created.sessionId, title: 'Stack ' + orderIndex + ' ' + product.id, expected: { place: '组合-' + product.id, count: 0, enabled: false } }; report.sessions.push(session);
    const observed = await observe(session.sessionId); assert.equal(observed.nativeToolRuntime, true); for (const name of ['computer_use', 'computer_use_reset', 'codegraph_index', 'stack_foreign_probe']) assert(observed.tools.some(row => row.name === name), product.id + ' enhanced tool ' + name);
    await f.prompt(session.sessionId, 'STACK_PROBE_' + product.id); assert.equal(await readFile(join(f.workspace, product.id + '-foreign.txt'), 'utf8'), 'once\n');
    await f.prompt(session.sessionId, 'STACK_FORM_' + product.id); await f.rpc('session/rename', { sessionId: session.sessionId, title: session.title });
    report.checks.push({ action: 'enhanced-native-foreign-and-form-generation', product: product.id, sessionId: session.sessionId });
  }
  for (const preset of ['trisoul-x', 'omd-ptc']) {
    const created = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: preset });
    const pro = await request(f, '/trisoul-x/api/model-mode?session=' + created.sessionId, { provider: 'fixture', model: 'fixture', mode: 'pro' });
    assert.equal(pro.eligible, true); assert.equal(pro.mode, 'pro');
    const session = { id: preset, preset, sessionId: created.sessionId, title: 'Stack ' + orderIndex + ' ' + preset, pro }; report.sessions.push(session);
    await f.prompt(session.sessionId, 'STACK_PROBE_' + preset); assert.equal(await readFile(join(f.workspace, preset + '-foreign.txt'), 'utf8'), 'once\n');
    await f.rpc('session/rename', { sessionId: session.sessionId, title: session.title });
    report.checks.push({ action: 'Pro-native-foreign-exactly-once', preset, sessionId: session.sessionId });
  }
  await checkpoint('native-enhanced-seven-presets');
  const browser = async () => {
    await context?.close(); context = await chromium.launchPersistentContext(join(f.root, 'stack-cft'), { executablePath: cft, headless: true, args: ['--use-mock-keychain', '--password-store=basic'], viewport: { width: 1440, height: 1050 }, env: { ...fixtureEnvironment(f.home, true), HOME: f.userHome, USERPROFILE: f.userHome } });
    await context.addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
    page = context.pages()[0] ?? await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.uiErrors.push({ phase: report.phase, error: error.message })); page.on('console', row => { if (['warning', 'error'].includes(row.type())) report.uiWarnings.push({ phase: report.phase, type: row.type(), text: row.text() }); });
    await page.goto(f.origin); const welcome = page.getByRole('button', { name: /^(Continue|继续)$/, exact: true });
    await page.getByText('workspace', { exact: true }).first().waitFor();
    await welcome.waitFor({ state: 'visible', timeout: 2000 }).catch(error => { if (error.name !== 'TimeoutError') throw error; });
    if (await welcome.isVisible()) { await welcome.click(); await welcome.waitFor({ state: 'hidden' }); }
  };
  const select = async session => {
    const title = page.getByText(session.title, { exact: true }).first(); const more = page.getByText(/展开其余 \d+ 个会话/).first();
    await title.waitFor({ state: 'visible', timeout: 2000 }).catch(error => { if (error.name !== 'TimeoutError') throw error; });
    if (!await title.isVisible() && !await more.isVisible()) await page.getByText('workspace', { exact: true }).first().click();
    if (!await title.isVisible() && await more.isVisible()) await more.click();
    await title.click(); await page.locator('.wSkVaW_header').waitFor();
  };
  const form = async session => { await select(session); const surface = page.locator('.iui-surface').first(); const view = surface.getByRole('form', { name: '组合验收', exact: true }); await view.waitFor(); await until(async () => view.getByRole('textbox', { name: '地点', exact: true }).isEnabled()); const block = await surface.getAttribute('data-iui-block'); assert.match(block, /^\d+:\d+:\d+:\d+$/); if (session.blockId) assert.equal(block, session.blockId); else session.blockId = block; return view; };
  const formState = session => request(f, '/intelligent-ui/api/state?' + new URLSearchParams({ session: session.sessionId, block: session.blockId }));
  await browser();
  for (const session of report.sessions.filter(row => row.expected)) {
    const view = await form(session); const before = (await f.snapshot(session.sessionId)).records.filter(row => row.event?.type === 'user/message' && row.event.data.source?.kind === 'user').length;
    await view.getByRole('textbox', { name: '地点', exact: true }).fill(session.expected.place); await view.getByRole('spinbutton', { name: '数量', exact: true }).fill('7'); await view.getByRole('spinbutton', { name: '数量', exact: true }).fill('0'); await view.getByRole('checkbox', { name: '启用', exact: true }).check(); await view.getByRole('checkbox', { name: '启用', exact: true }).uncheck();
    await until(async () => JSON.stringify((await formState(session)).state) === JSON.stringify(session.expected));
    const edited = await f.snapshot(session.sessionId); assert.equal(edited.records.filter(row => row.event?.type === 'user/message' && row.event.data.source?.kind === 'user').length, before);
    const submissions = report.nativeSubmissions.length, seq = edited.projections.asOfSeq;
    await view.getByRole('button', { name: '提交表单', exact: true }).click(); await until(async () => (await f.snapshot(session.sessionId)).records.some(row => row.event?.type === 'turn/end' && row.event.seq > seq));
    assert.equal(report.nativeSubmissions.length, submissions + 1); assert.deepEqual(report.nativeSubmissions.at(-1).state, session.expected);
    const submitted = await f.snapshot(session.sessionId); assert.equal(submitted.records.filter(row => row.event?.type === 'user/message' && row.event.data.source?.kind === 'user').length, before + 1);
    session.savedForm = await formState(session); assert.equal(session.savedForm.source.trimEnd(), formSource); await page.screenshot({ path: join(out, session.id + '-form.png'), animations: 'disabled' });
  }
  await checkpoint('five-actual-Forms-submitted');
  const status = await subscriptions(f, 'status'); report.subscriptionStatus = status; assert.equal(status.providers.codex.accounts.length, 1); assert.equal(status.providers.grok.accounts.length, 1);
  assert.deepEqual(status.providers.codex.clientVersion, { version: '0.134.0', source: 'config' }); assert.deepEqual(status.providers.claude.accounts, []); assert.equal(status.providers.claude.clientVersion, undefined);
  const subsSession = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'trisoul-x' });
  const subs = { id: 'subscriptions', preset: 'trisoul-x', sessionId: subsSession.sessionId, title: 'Stack ' + orderIndex + ' subscriptions' }; report.sessions.push(subs);
  // Stock sidebars deliberately omit unsent sessions. Persist one actual
  // localhost turn before selecting the named session through the visible UI.
  await f.prompt(subs.sessionId, 'STACK_SUBSCRIPTIONS_BOOTSTRAP'); await f.rpc('session/rename', { sessionId: subs.sessionId, title: subs.title }); await page.reload();
  await select(subs); await page.getByRole('button', { name: '模型与思考强度', exact: true }).click(); const modelDialog = page.getByRole('dialog', { name: '模型与思考强度', exact: true });
  await modelDialog.getByRole('button', { name: 'Local installation fixture', exact: true }).click(); await modelDialog.getByRole('option', { name: 'A2 Fast Fixture', exact: true }).first().click();
  const fast = page.getByRole('button', { name: 'Fast 模式', exact: true }); await fast.waitFor(); assert.equal(await fast.getAttribute('aria-pressed'), 'false'); await fast.click(); await until(async () => await fast.getAttribute('aria-pressed') === 'true');
  await page.locator('[data-composer-input]').fill('Run the owned Responses native read fixture.'); await page.locator('[data-composer-input]').press('Enter'); await page.getByText('SUBSCRIPTIONS_STACK_LOOP_OK', { exact: true }).waitFor({ timeout: 45000 });
  const wires = report.network.filter(row => row.wire?.main).map(row => row.wire); assert.equal(wires.length, 2); assert(wires.every(row => row.fast && row.system && row.model === 'a2-fast')); assert.equal(wires[1].correlatedToolResult, true);
  assert.equal((await subscriptions(f, 'speed', { sessionId: subs.sessionId })).tier, 'fast'); report.subscriptions = { status, wires }; await page.screenshot({ path: join(out, 'subscriptions-fast.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '设置', exact: true }).click(); const settingsDialog = page.getByRole('dialog', { name: '设置', exact: true });
  await settingsDialog.getByRole('button', { name: '订阅', exact: true }).click(); await settingsDialog.getByText('CLI 0.134.0', { exact: false }).waitFor();
  await settingsDialog.getByRole('button', { name: '管理', exact: true }).first().click(); const manage = page.getByRole('dialog', { name: '管理 Codex (ChatGPT)', exact: true });
  const displayName = '组合订阅-' + orderIndex; await manage.getByLabel('订阅显示名', { exact: true }).fill(displayName); await manage.getByRole('button', { name: '保存更改', exact: true }).click(); await manage.waitFor({ state: 'detached' });
  assert.equal((await subscriptions(f, 'providerSettings', { provider: 'codex' })).settings.displayName, displayName); report.subscriptions.displayName = displayName; await page.keyboard.press('Escape');
  await checkpoint('actual-Responses-fast-native-loop');
  const download = await downloadDeliveryFixture(); t.after(() => download.close()); report.cuStages = {};
  const cu = report.sessions.find(row => row.id === 'trisoul-x');
  await f.prompt(cu.sessionId, 'STACK_MEDIA_IMAGE', { timeout: 45000 }); await f.prompt(cu.sessionId, 'STACK_MEDIA_VIDEO', { timeout: 45000 });
  const mediaSnapshot = await f.snapshot(cu.sessionId), mediaCalls = mediaSnapshot.records.filter(row => row.event?.type === 'tool/call' && ['image_generate', 'video_generate'].includes(row.event.data.name)).map(row => row.event.data);
  assert.equal(mediaCalls.length, 2); report.mediaCalls = mediaCalls.map(call => ({ ...call, result: mediaSnapshot.records.find(row => row.event?.type === 'tool/result' && row.event.data.message.toolCallId === call.callId)?.event.data }));
  for (const call of report.mediaCalls) { assert(call.result); assert.equal(call.result.message.isError, false, call.name + ': ' + JSON.stringify(call.result)); }
  const imageDirectory = join(f.home, 'plugins/subscriptions/images'), videoDirectory = join(f.home, 'plugins/subscriptions/videos');
  const images = await readdir(imageDirectory), videos = await readdir(videoDirectory); assert.equal(images.length, 1); assert.equal(videos.length, 1);
  assert.equal(hash(await readFile(join(imageDirectory, images[0]))), report.mediaFixtures.pngSha256); assert.equal(hash(await readFile(join(videoDirectory, videos[0]))), report.mediaFixtures.videoSha256);
  await select(cu); for (const call of mediaCalls) { const process = page.locator('[data-turn-process="' + call.turn + '"]'); if (await process.getAttribute('aria-expanded') === 'false') await process.click(); }
  await page.waitForFunction(() => [...document.querySelectorAll('img')].some(img => img.complete && img.naturalWidth === 16));
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1); assert.equal(await page.locator('video').first().evaluate(video => video.videoWidth), 16);
  const servedVideo = await subscriptions(f, 'video', { name: videos[0] }); assert.equal(hash(Buffer.from(servedVideo.dataBase64, 'base64')), report.mediaFixtures.videoSha256);
  report.media = { images, videos, exactBytes: true, originalToolviewsRendered: true }; await page.screenshot({ path: join(out, 'subscriptions-actual-media.png'), animations: 'disabled' }); await checkpoint('actual-image-video-wire-bytes-UI');
  report.cuStages.STACK_CU_OPEN = { title: '打开组合下载页面', code: `var stackDelivery = await cua.createBrowserTab('browser', ${JSON.stringify(download.url)}); await stackDelivery.markHandoff();` };
  await f.prompt(cu.sessionId, 'STACK_CU_OPEN', { timeout: 60000 });
  const savedPath = join(f.workspace, 'stack-delivery.txt');
  report.cuStages.STACK_CU_SAVE = { title: '保存组合下载交付', code: `await stackDelivery.playwright.getByRole('link', {name:'下载交付样本'}).click(); var stackDownload; for (var attempt=0;attempt<50&&!stackDownload;attempt++){stackDownload=(await stackDelivery.downloads.list()).find(row=>row.url===${JSON.stringify(download.url + '/download')});if(!stackDownload)await new Promise(resolve=>setTimeout(resolve,40));} if(!stackDownload)throw Error('Missing real download'); await stackDelivery.downloads.save(stackDownload.id,${JSON.stringify(savedPath)}); nodeRepl.write('组合下载交付完成');` };
  const delivered = await f.prompt(cu.sessionId, 'STACK_CU_SAVE', { timeout: 60000 }); assert.deepEqual(await readFile(savedPath), download.bytes);
  const deliveryResults = delivered.records.filter(row => row.event?.type === 'tool/result' && row.event.data.message?.content?.some(block => block.type === 'file'));
  assert.equal(deliveryResults.length, 1); const attachment = deliveryResults[0].event.data.message.content.find(block => block.type === 'file').attachment; assert.equal(attachment.attachmentId, 'sha256:' + hash(download.bytes));
  const deliveredFile = deliveryResults[0].event.data.meta.computerUseFiles[0]; assert.equal(deliveredFile.bytes, download.bytes.length); assert.deepEqual(await readFile(deliveredFile.path), download.bytes);
  const fileResponse = await fetch(f.origin + '/api/file?path=' + encodeURIComponent(deliveredFile.path), { headers: { cookie: f.cookie } }); assert.equal(fileResponse.status, 200); assert.deepEqual(Buffer.from(await fileResponse.arrayBuffer()), download.bytes);
  await select(cu);
  const deliveryCall = deliveryResults[0].event.data.message.toolCallId;
  const deliveryTurn = delivered.records.find(row => row.event?.type === 'tool/call' && row.event.data.callId === deliveryCall).event.data.turn;
  const turnProcess = page.locator('[data-turn-process="' + deliveryTurn + '"]'); await turnProcess.scrollIntoViewIfNeeded();
  const floating = page.getByLabel('悬浮操控预览'); await floating.waitFor({ state: 'visible', timeout: 2000 }).catch(error => { if (error.name !== 'TimeoutError') throw error; });
  const targetRect = await turnProcess.boundingBox(), floatingRect = await floating.boundingBox(), composerRect = await page.locator('[data-conversation-region="composer"]').boundingBox();
  const hit = targetRect && await page.evaluate(point => { const node = document.elementFromPoint(point.x, point.y); return node && { tag: node.tagName, class: node.className, ariaLabel: node.getAttribute('aria-label'), floatingAncestor: Boolean(node.closest('[aria-label="悬浮操控预览"]')), composerAncestor: Boolean(node.closest('[data-conversation-region="composer"]')) }; }, { x: targetRect.x + targetRect.width / 2, y: targetRect.y + targetRect.height / 2 });
  report.cuCardOverlay = { targetRect, floatingRect, composerRect, centerHit: hit, publicCloseActionUsed: false }; await page.screenshot({ path: join(out, 'cu-floating-before-close.png'), animations: 'disabled' });
  if (await floating.isVisible()) { await floating.hover(); await page.getByRole('button', { name: '关闭操控预览', exact: true }).click(); await floating.waitFor({ state: 'hidden' }); report.cuCardOverlay.publicCloseActionUsed = true; }
  if (await turnProcess.getAttribute('aria-expanded') === 'false') await turnProcess.click();
  const group = page.locator('[data-cu-group][data-chat-turn="' + deliveryTurn + '"] .tx-cu-group-toggle'); if (await group.getAttribute('aria-expanded') === 'false') await group.click();
  const card = page.locator('.tx-cu-card').filter({ hasText: '保存组合下载交付' }); const heading = card.locator('.tx-cu-card-heading'); if (await heading.getAttribute('aria-expanded') === 'false') await heading.click();
  const files = card.locator('.tx-cu-export-files button'); await files.first().waitFor(); assert.equal(await files.count(), 1); assert.equal(await files.first().isEnabled(), true);
  await files.first().click(); await page.getByText('OMD_DOWNLOAD_DELIVERY', { exact: false }).first().waitFor(); await page.screenshot({ path: join(out, 'cu-download-card.png'), animations: 'disabled' });
  report.computerUse = { savedPath, sha256: hash(await readFile(savedPath)), attachment, history: (await request(f, '/trisoul-x/computer-use/state?session=' + cu.sessionId)).history };
  await page.getByRole('button', { name: '打开 Computer Use', exact: true }).click(); const pane = page.locator('.tx-cu-pane');
  await until(async () => pane.locator('.tx-cu-live img').first().evaluate(image => image.complete && image.naturalWidth > 0));
  await pane.getByRole('button', { name: '停止并接管', exact: true }).last().click(); await until(async () => (await request(f, '/trisoul-x/computer-use/state?session=' + cu.sessionId)).status === 'stopped');
  await page.screenshot({ path: join(out, 'cu-user-takeover.png'), animations: 'disabled' }); await pane.getByRole('button', { name: '恢复助手控制', exact: true }).last().click();
  await until(async () => (await request(f, '/trisoul-x/computer-use/state?session=' + cu.sessionId)).status === 'idle'); report.computerUse.nativeWebStopTakeoverResume = true;
  await checkpoint('actual-CU-native-download-card');
  const release = f.holdNextReply(); const beforeRequests = f.requests.length, beforeSeq = (await f.snapshot(cu.sessionId)).projections.asOfSeq;
  await f.send(cu.sessionId, 'STACK_CANCEL_LATE'); await until(() => f.requests.slice(beforeRequests).some(row => row.tools?.length && row.messages.some(message => textOf(message) === 'STACK_CANCEL_LATE'))); await f.rpc('session/cancel', { sessionId: cu.sessionId }); release();
  const cancelled = await until(async () => { const snapshot = await f.snapshot(cu.sessionId); return snapshot.records.some(row => row.event?.type === 'turn/end' && row.event.seq > beforeSeq) && snapshot; });
  const cancelEnd = cancelled.records.findLast(row => row.event?.type === 'turn/end').event; assert.deepEqual(cancelEnd.data.reason, { kind: 'aborted', reason: { kind: 'user' } });
  assert(!cancelled.records.filter(row => row.event?.seq > beforeSeq).some(row => JSON.stringify(row.event).includes('STACK_CANCEL_LATE_RESULT_MUST_NOT_PUBLISH')));
  await f.prompt(cu.sessionId, 'STACK_AFTER_CANCEL'); report.checks.push({ action: 'native-stop-and-next-turn', end: cancelEnd });
  await context.close(); context = undefined; await f.stop(); await f.boot(); await checkpoint('cold-restart');
  await checkUserLayer('cold-restart');
  report.coldReadiness = [];
  for (const session of report.sessions.filter(row => row.expected)) {
    assert.deepEqual(await formState(session), session.savedForm);
    await until(async () => {
      const current = (await f.api(session.sessionId)).value; assert.equal(current.enhancement, true, 'Cold saved enhancement preference must remain true without another POST');
      const previous = report.coldReadiness.at(-1); if (previous?.sessionId !== session.sessionId || previous.omdAvailable !== current.omdAvailable || previous.enhancementActive !== current.enhancementActive) report.coldReadiness.push({ sessionId: session.sessionId, omdAvailable: current.omdAvailable, enhancement: current.enhancement, enhancementActive: current.enhancementActive });
      return current.omdAvailable === true && current.enhancementActive === true;
    });
  }
  for (const session of report.sessions.filter(row => row.pro)) { await observe(session.sessionId); assert.equal((await request(f, '/trisoul-x/api/model-mode?session=' + session.sessionId)).mode, 'pro'); }
  assert.equal((await subscriptions(f, 'providerSettings', { provider: 'codex' })).settings.displayName, report.subscriptions.displayName);
  await browser(); for (const session of report.sessions.filter(row => row.expected)) { const view = await form(session); assert.equal(await view.getByRole('textbox', { name: '地点', exact: true }).inputValue(), session.expected.place); assert.equal(await view.getByRole('spinbutton', { name: '数量', exact: true }).inputValue(), '0'); assert.equal(await view.getByRole('checkbox', { name: '启用', exact: true }).isChecked(), false); }
  const stateDirectory = join(f.home, 'intelligent-ui/state'), stateNames = (await readdir(stateDirectory)).sort(), stateHashes = Object.fromEntries(await Promise.all(stateNames.map(async name => [name, hash(await readFile(join(stateDirectory, name)))])));
  await context.close(); context = undefined;
  report.lifecycle = [];
  for (const name of ['dsh-intelligent-ui', 'dshmarket', 'dsh-plugin-subscriptions', 'oh-my-agents-above-all', 'trisoul_x']) {
    for (const enabled of [false, true]) { const mutation = await f.call('pluginManager/setBundleEnabled', { name, enabled }); assert(['applied', 'restart-required'].includes(mutation.application), JSON.stringify(mutation)); await f.stop(); await f.boot(); await checkUserLayer(name + '-' + enabled); const check = await f.create('standard'); const actual = await observe(check.sessionId); assert.equal(actual.nativeToolRuntime, true); assert.deepEqual(actual.tools.find(row => row.name === 'read'), report.stock.tools.find(row => row.name === 'read')); report.lifecycle.push({ name, enabled, mutation }); }
  }
  await checkpoint('all-five-bundle-disable-enable-restart');
  await f.stop(); for (const name of [...order].reverse().map(key => ({ omd: 'trisoul_x', omaa: 'oh-my-agents-above-all', iui: 'dsh-intelligent-ui', subscriptions: 'dsh-plugin-subscriptions', market: 'dshmarket' })[key])) await f.command(['plugin', '--profile', 'omaa-fixture', 'remove', name]);
  await f.boot(); const restored = await f.create('standard'); const original = await observe(restored.sessionId); assert.equal(original.nativeToolRuntime, true);
  await checkUserLayer('all-uninstalled');
  for (const name of ['read', 'write', 'edit', 'bash', 'skill', 'stack_foreign_probe']) assert.deepEqual(original.tools.find(row => row.name === name), report.stock.tools.find(row => row.name === name));
  assert.deepEqual((await readdir(stateDirectory)).sort(), stateNames); for (const name of stateNames) assert.equal(hash(await readFile(join(stateDirectory, name))), stateHashes[name]);
  report.restored = { sessionId: restored.sessionId, stateHashes, tools: original.tools, skills: original.skills, bundles: await f.call('pluginManager/listBundles', {}) }; assert.deepEqual(await f.exemptions(), {});
  assert.deepEqual(report.networkErrors, []); assert.deepEqual(f.errors, []); assert.deepEqual(report.uiErrors, []); assert.deepEqual(report.uiWarnings, []); report.nativeErrors = f.errors;
  report.passed = true; report.finishedAt = new Date().toISOString(); await checkpoint('complete');
});
