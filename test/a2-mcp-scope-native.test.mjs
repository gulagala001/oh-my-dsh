import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, lstat, cp } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parse, stringify } from 'yaml';
import { ecosystemFixture } from './fixtures/plugin-ecosystem.mjs';

const enabled = process.env.OMD_MCP_NATIVE === '1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Uses only native scopes, native MCP and the actual ToolRuntime. The observer
// adds test-owned MCP servers and never replaces an existing host service.
async function observeMcp(ctx, config) {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/owned-mcp-check', async handler(req, res) {
    const rejected = ctx.connection.requestRejection(req);
    if (rejected !== undefined) { res.writeHead(rejected); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    const scopes = [];
    try {
      const entries = [...ctx.loader.entries()];
      const host = entries.find(row => row.options.name === '@deepseek-ai/dsh-tools');
      const owner = entries.find(row => row.options.name === 'trisoul_x/codegraph') ?? entries.find(row => row.options.name === 'trisoul_x') ?? host;
      const mcp = await owner.parent.tree.import('@deepseek-ai/dsh-mcp-client');
      const hostMcp = await host.parent.tree.import('@deepseek-ai/dsh-mcp-client');
      const scope = await host.parent.tree.import('@deepseek-ai/dsh-scope');
      const cordis = await host.parent.tree.import('@deepseek-ai/cordis');
      const tools = await host.parent.tree.import('@deepseek-ai/dsh-tools');
      const peers = {};
      for (const name of ['@deepseek-ai/cordis','@deepseek-ai/dsh-attachment','@deepseek-ai/dsh-llm','@deepseek-ai/dsh-scope','@deepseek-ai/dsh-subprocess','@deepseek-ai/dsh-timeout','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-mcp-resources','@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-util-values'])
        peers[name] = (await owner.parent.tree.import(name)) === (await host.parent.tree.import(name));
      const sessions = await Promise.all([ctx.sessionController.create({ cwd: config.workspace }),ctx.sessionController.create({ cwd: config.workspace })]);
      const agents = [];
      for (const value of sessions) {
        const found = await ctx.sessionController.resolveAgent(value.sessionId);
        if (found.error || !found.agent) throw Error('Native MCP fixture could not resolve its actual agent');
        agents.push(found.agent);
      }
      const configs = config.urls.map(url => ({ transport: 'streamable-http', serverName: 'owned_scope_probe', url, headers: {}, toolCallTimeoutMs: 10000, failOnStartupError: true, maxInstructionBytes: 4096, reconnect: { enabled: false } }));
      for (let i = 0; i < agents.length; i++) { const value = scope.createScope(ctx, agents[i]); scopes.push(value); await mcp.apply(value.ctx, configs[i]); }
      const name = 'mcp__owned_scope_probe__echo';
      const schemas = agents.map(agent => ctx.tools.schemas(agent).filter(tool => tool.name === name));
      const beforeRoot = ctx.tools.schemas().filter(tool => tool.name === name);
      const execute = agent => ctx.tools.execute({ callId: crypto.randomUUID(), name, arguments: { value: 'ACTUAL_NATIVE_MCP' }, agent, signal: AbortSignal.timeout(10000) });
      const results = await Promise.all(agents.map(execute));
      let duplicate;
      try { await mcp.apply(scopes[0].ctx, configs[0]); } catch (error) { duplicate = error.message; }
      await scopes[0].dispose();
      const afterDispose = agents.map(agent => ctx.tools.schemas(agent).filter(tool => tool.name === name));
      const survivor = await execute(agents[1]);
      const replacement = scope.createScope(ctx, agents[0]); scopes.push(replacement); await mcp.apply(replacement.ctx, configs[0]);
      const restored = await execute(agents[0]);
      await Promise.all(scopes.map(value => value.dispose()));
      const afterAll = agents.map(agent => ctx.tools.schemas(agent).filter(tool => tool.name === name));
      const body = { actualOwner: owner.options.name, mcpNamespaceEqual: mcp === hostMcp, peers,
        nativeToolRuntime: (ctx.tools[cordis.symbols.original] || ctx.tools) instanceof tools.ToolRuntime,
        actualAgentIds: agents.map(agent => agent.id), schemas, beforeRoot, results, duplicate, afterDispose, survivor, restored, afterAll };
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body));
    } catch (error) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.stack || error.message, cause: error.cause?.stack || error.cause?.message })); }
    finally { await Promise.all(scopes.map(value => value.dispose())); }
  } }));
}

for (const variant of ['stock', 'omd']) test('official a2 MCP namespaces, transport and scope lifecycle: ' + variant, { timeout: 750000, skip: !enabled }, async t => {
  const output = resolve(process.env.OMD_MCP_EVIDENCE ?? 'work/a2-compat/mcp-scopes'), root = await mkdtemp(join(tmpdir(), 'omd-mcp-native-'));
  await mkdir(output, { recursive: true });
  const requests = [], servers = [];
  for (const label of ['A', 'B']) {
    const server = createServer(async (req, res) => {
      if (req.method === 'GET') { res.writeHead(405); res.end(); return; }
      if (req.method === 'DELETE') { res.writeHead(200); res.end(); return; }
      let raw = ''; for await (const chunk of req) raw += chunk;
      const request = JSON.parse(raw); requests.push({ label, method: request.method, id: request.id });
      if (request.id === undefined) { res.writeHead(202); res.end(); return; }
      const result = request.method === 'initialize' ? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'owned-native-' + label, version: '1.0.0' } }
        : request.method === 'tools/list' ? { tools: [{ name: 'echo', description: 'Return the owned fixture marker.', inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } }] }
        : request.method === 'tools/call' ? { content: [{ type: 'text', text: label + ':' + request.params.arguments.value }] } : {};
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); servers.push(server);
  }
  let f;
  t.after(async () => {
    await writeFile(join(output, variant + '-transport-requests.json'), JSON.stringify(requests, null, 2));
    if (f) await writeFile(join(output, variant + '-host.log'), f.log());
    try { await f?.close(); } finally {
      for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      const cleanup = [];
      for (const file of (await readdir(root)).filter(name => /^processes-\d+\.json$/.test(name))) {
        const audit = JSON.parse(await readFile(join(root, file))), directory = audit.ackDirectory;
        assert.equal(audit.closed, true); assert.match(basename(directory), /^ecosystem-process-monitor-[a-zA-Z0-9]+$/);
        assert.ok(directory.startsWith('/private/tmp/') || directory.startsWith('/private/var/folders/') || directory.startsWith('/tmp/'));
        const info = await lstat(directory); assert.ok(info.isDirectory() && !info.isSymbolicLink()); assert.equal(info.uid, process.getuid());
        const processes = (await promisify(execFile)('ps', ['-axo', 'pid=,ppid=,command='])).stdout.split('\n').filter(line => line.includes(directory) || line.includes(root));
        assert.deepEqual(processes, []);
        await cp(directory, join(output, variant + '-monitor-' + audit.bootId), { recursive: true, errorOnExist: true, force: false });
        await writeFile(join(output, variant + '-' + file), JSON.stringify(audit, null, 2)); await rm(directory, { recursive: true });
        cleanup.push({ file, closed: true, directoryRemoved: true, ownedProcessesRemaining: processes });
      }
      await rm(root, { recursive: true, force: true });
      await writeFile(join(output, variant + '-cleanup.json'), JSON.stringify({ rootRemoved: true, monitor: cleanup }, null, 2));
    }
  });
  f = await ecosystemFixture({ root, cli: process.env.OMD_DSH_CLI ?? 'node_modules/@deepseek-ai/dsh/lib/bin.js', isolation: 'native', storeDir: join(output, 'public-store'), installTimeoutMs: 600000, extraLoopbackPorts: servers.map(server => server.address().port) });
  assert.equal(f.hostVersion, '0.2.1-alpha.2');
  let artifact;
  if (variant === 'omd') {
    const file = resolve(process.env.OMD_MCP_ARCHIVE ?? 'work/a2-compat/formal-candidate-a2-0122/trisoul_x-0.2.1-alpha.2.omd.0.12.2.tgz');
    artifact = { file, sha256: hash(await readFile(file)) };
    const result = await f.cliRun(['plugin', '--profile', f.profile, 'add', 'file:' + file]); assert.equal(result.ok, true, result.stderr);
  }
  const directory = join(root, 'mcp-observer'); await mkdir(directory);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'owned-mcp-observer', version: '1.0.0', type: 'module', exports: './index.mjs' }));
  await writeFile(join(directory, 'index.mjs'), 'export const inject = ["loader","tools","webServer","connection","sessionController"];\nexport const apply = ' + observeMcp.toString() + ';\n');
  const patch = join(f.home, 'profiles', f.profile, 'cordis.patch.yml'), rows = parse(await readFile(patch, 'utf8'));
  rows.push({ id: 'trisoul-x', config: { computerUseNativeBinary: join(root, 'missing-native'), computerUseChromeUserDataDir: join(root, 'owned-chrome'), unifiedBackground: { provider: 'ecosystem', model: 'ecosystem' }, dreamProvider: 'ecosystem', dreamModel: 'ecosystem' } },
    { insert: [{ id: 'owned-mcp-check', name: pathToFileURL(join(directory, 'index.mjs')).href, config: { workspace: f.workspace, urls: servers.map(server => 'http://127.0.0.1:' + server.address().port + '/mcp') } }] });
  await writeFile(patch, stringify(rows));
  await f.start();
  const report = await f.request('/owned-mcp-check', {});
  await writeFile(join(output, variant + '.json'), JSON.stringify({ hostVersion: f.hostVersion, artifact, ...report, requests, scope: 'Actual native ModuleLoader namespace, localhost MCP Streamable HTTP, two real native Agent scopes, duplicate rejection, disposal and re-registration; no personal MCP or external server execution.' }, null, 2) + '\n');
  assert.equal(report.mcpNamespaceEqual, true); assert.equal(report.nativeToolRuntime, true);
  for (const [name, equal] of Object.entries(report.peers)) assert.equal(equal, true, name);
  assert.equal(new Set(report.actualAgentIds).size, 2);
  assert.deepEqual(report.schemas.map(rows => rows.length), [1, 1]); assert.deepEqual(report.beforeRoot, []);
  assert.match(JSON.stringify(report.results[0]), /A:ACTUAL_NATIVE_MCP/); assert.match(JSON.stringify(report.results[1]), /B:ACTUAL_NATIVE_MCP/);
  assert.match(report.duplicate, /already in use/); assert.deepEqual(report.afterDispose.map(rows => rows.length), [0, 1]);
  assert.match(JSON.stringify(report.survivor), /B:ACTUAL_NATIVE_MCP/); assert.match(JSON.stringify(report.restored), /A:ACTUAL_NATIVE_MCP/);
  assert.deepEqual(report.afterAll, [[], []]); assert.deepEqual(f.protocolErrors, []);
  await f.stop();
  await writeFile(join(output, variant + '-host.log'), f.log());
});
