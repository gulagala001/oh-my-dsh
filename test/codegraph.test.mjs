import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodegraphRuntime, codegraphCommand, projectDirectory } from '../src/codegraph.mjs';
import { apply, CODEGRAPH_GUIDE, CODEGRAPH_DISABLED_GUIDE } from '../src/codegraph-agent.mjs';

const text = result => result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(fn, timeout = 20_000, interval = 150) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, interval)); }
  throw new Error('CodeGraph condition did not settle');
}

test('bundled CodeGraph: native catalog, project isolation, indexing, live sync, crash recovery and disposal', { timeout: 120_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'oh my dsh codegraph '));
  const runtime = new CodegraphRuntime();
  t.after(async () => { await runtime.dispose(); await rm(root, { recursive: true, force: true }); });
  const a = join(root, 'project a'), b = join(root, '项目 b');
  await mkdir(a); await mkdir(b);
  await writeFile(join(a, 'entry.ts'), 'export function uniqueAlpha() { return "ALPHA_ONLY"; }\nexport function entry() { return uniqueAlpha(); }\n');
  await writeFile(join(a, 'AGENTS.md'), 'Keep this project instruction intact.\n');
  await writeFile(join(b, 'entry.ts'), 'export function uniqueBeta() { return "BETA_ONLY"; }\n');
  await access(codegraphCommand().command);

  const catalog = await runtime.catalog();
  assert.ok(catalog.tools.some(tool => tool.name === 'codegraph_explore'));
  assert.equal(runtime.processes.size, 0, 'catalog probe exits');
  const definitions = [], sections = [];
  await apply({ trisoulX: { codegraph: runtime }, tools: { register: definition => definitions.push(definition) }, systemPrompt: { section: section => sections.push(section) } });
  const explore = definitions.find(tool => tool.name === 'mcp__codegraph__codegraph_explore');
  assert.ok(explore);
  assert.ok(!explore.parameters.required.includes('projectPath'));
  assert.ok(sections.every(section => section.interpolate === false));

  const initial = await runtime.call('codegraph_explore', { query: 'uniqueAlpha' }, { cwd: a });
  assert.match(text(initial), /ALPHA_ONLY/);
  await access(join(a, '.codegraph'));
  assert.equal(await readFile(join(a, 'AGENTS.md'), 'utf8'), 'Keep this project instruction intact.\n');
  await definitions.find(tool => tool.name === 'codegraph_index').execute({}, { agent: { session: { header: { cwd: a } } } });
  await runtime.index({}, { cwd: b });
  await writeFile(join(b, 'sync.ts'), 'export function manualSyncSymbol() { return "MANUAL_SYNC"; }\n');
  await runtime.index({}, { cwd: b });
  await access(join(a, '.codegraph'));
  await access(join(b, '.codegraph'));

  const [alpha, beta] = await Promise.all([
    runtime.call('codegraph_explore', { query: 'uniqueAlpha' }, { cwd: a }),
    runtime.call('codegraph_explore', { query: 'uniqueBeta', projectPath: '../项目 b' }, { cwd: a }),
  ]);
  assert.ok(!alpha.isError, text(alpha)); assert.match(text(alpha), /ALPHA_ONLY/); assert.doesNotMatch(text(alpha), /BETA_ONLY/);
  assert.ok(!beta.isError, text(beta)); assert.match(text(beta), /BETA_ONLY/); assert.doesNotMatch(text(beta), /ALPHA_ONLY/);
  assert.equal(runtime.connections.size, 2);
  assert.match(text(await runtime.call('codegraph_explore', { query: 'manualSyncSymbol' }, { cwd: b })), /MANUAL_SYNC/);

  await mkdir(join(a, 'nested'));
  await runtime.call('codegraph_explore', { query: 'uniqueAlpha' }, { cwd: join(a, 'nested') });
  assert.equal(runtime.connections.size, 2, 'subdirectory uses nearest indexed project');
  await writeFile(join(a, 'added.ts'), 'export function newlyWatchedSymbol() { return "WATCHED_NEW_FILE"; }\n');
  await until(async () => text(await runtime.call('codegraph_explore', { query: 'newlyWatchedSymbol' }, { cwd: a })).includes('WATCHED_NEW_FILE'));

  const controller = new AbortController(); controller.abort(new Error('cancelled fixture'));
  await assert.rejects(runtime.call('codegraph_explore', { query: 'entry' }, { cwd: a, signal: controller.signal }), /cancelled fixture/);
  await assert.rejects(runtime.index({}, { cwd: a, signal: controller.signal }), /cancelled fixture/);
  assert.equal(runtime.connections.size, 2);

  const connection = await runtime.connections.get(await realpath(a)).ready;
  await connection.transport.close();
  await assert.rejects(runtime.call('codegraph_explore', { query: 'uniqueAlpha' }, { cwd: a }), /关闭|closed/i);
  const recovered = await runtime.call('codegraph_explore', { query: 'uniqueAlpha' }, { cwd: a });
  assert.match(text(recovered), /ALPHA_ONLY/);
  const pids = [...runtime.processes].map(connection => connection.transport.pid);
  await runtime.dispose();
  await until(() => pids.every(pid => !alive(pid)));
  assert.equal(runtime.connections.size, 0); assert.equal(runtime.processes.size, 0);
  await assert.rejects(runtime.call('codegraph_explore', { query: 'entry' }, { cwd: a }), /已停止/);
});

test('cancelling a running index reaps its process and permits retry', { timeout: 40_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'codegraph-cancel-'));
  const runtime = new CodegraphRuntime();
  t.after(async () => { await runtime.dispose(); await rm(directory, { recursive: true, force: true }); });
  await writeFile(join(directory, 'file.ts'), 'export function retrySymbol() { return "RETRIED_INDEX"; }');
  const controller = new AbortController();
  const indexing = runtime.index({}, { cwd: directory, signal: controller.signal });
  const cancelled = assert.rejects(indexing, /cancel index/);
  await until(() => [...runtime.processes].some(job => job.child), 20_000, 5);
  const pid = [...runtime.processes].find(job => job.child).child.pid;
  controller.abort(new Error('cancel index'));
  await cancelled;
  await until(() => !alive(pid));
  await runtime.index({}, { cwd: directory });
  assert.match(text(await runtime.call('codegraph_explore', { query: 'retrySymbol' }, { cwd: directory })), /RETRIED_INDEX/);
});

test('CodeGraph path validation and idle release', { timeout: 40_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'codegraph-idle-'));
  const runtime = new CodegraphRuntime({ idleMs: 50 });
  t.after(async () => { await runtime.dispose(); await rm(directory, { recursive: true, force: true }); });
  await writeFile(join(directory, 'file.ts'), 'export const x = 1;');
  await assert.rejects(projectDirectory('', '.'), /工作目录/);
  await assert.rejects(projectDirectory(directory, 'file.ts'), /不是目录/);
  await runtime.call('codegraph_explore', { query: 'x' }, { cwd: directory });
  const pid = [...runtime.processes][0].transport.pid;
  await until(() => runtime.connections.size === 0 && runtime.processes.size === 0 && !alive(pid));
});

test('automatic project preparation is shared and component toggles can restart it', { timeout: 40000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'codegraph-auto-')), runtime = new CodegraphRuntime();
  t.after(async () => { await runtime.dispose(); await rm(root, { recursive: true, force: true }); });
  await writeFile(join(root, 'source.ts'), 'export const automaticallyIndexed = 73;');
  let builds = 0; const build = runtime.buildIndex.bind(runtime);
  runtime.buildIndex = (...args) => { builds++; return build(...args); };
  await Promise.all([runtime.ensureProject(root), runtime.ensureProject(root), runtime.ensureProject(root)]);
  assert.equal(builds, 1); assert.equal(runtime.status().projects[0].status, 'ready');
  assert.match(text(await runtime.call('codegraph_explore', { query: 'automaticallyIndexed' }, { cwd: root })), /73/);
  await runtime.setEnabled(false);
  await assert.rejects(runtime.call('codegraph_explore', { query: 'automaticallyIndexed' }, { cwd: root }), /已关闭/);
  assert.ok((await runtime.catalog()).tools.length, 'disabling execution does not break preset catalog registration');
  await runtime.setEnabled(true); await runtime.ensureProject(root);
  assert.equal(runtime.status().projects[0].status, 'ready');
});

test('missing platform bundles use the pinned installer only when automatic or explicit preparation permits it', async t => {
  const root = await mkdtemp(join(tmpdir(), 'codegraph-prepare-'));
  let available = false, installs = 0;
  const runtime = new CodegraphRuntime({ cacheDir: root, autoInstall: false, resolveCommand: () => {
    if (!available) throw Error('missing platform bundle');
    return { command: 'prepared-node', args: ['entry.js'] };
  } });
  t.after(async () => { await runtime.dispose(); await rm(root, { recursive: true, force: true }); });
  runtime.run = async (command, args, options) => {
    installs++; assert.equal(command, process.execPath); assert.ok(args[0].endsWith('npm-shim.js'));
    assert.deepEqual(args.slice(1), ['--version']); assert.equal(options.env.CODEGRAPH_INSTALL_DIR, root);
    assert.equal(options.env.CODEGRAPH_NO_DOWNLOAD, undefined);
    await new Promise(resolve => setTimeout(resolve, 10)); available = true;
  };
  await assert.rejects(runtime.prepare(), /自动准备已关闭/); assert.equal(installs, 0);
  const prepared = await Promise.all([runtime.prepare({ allowDownload: true }), runtime.prepare({ allowDownload: true })]);
  assert.equal(installs, 1); assert.equal(prepared[0].command, 'prepared-node');
  assert.equal((await runtime.prepare()).command, 'prepared-node'); assert.equal(installs, 1);
});

test('catalog failure leaves ordinary tools usable and an explicit retry registers the repaired catalog', async () => {
  const definitions = [], sections = []; let hook, assemble, reads = 0;
  const runtime = { catalogRevision: 0, status: () => ({ installed: true }), catalog: async () => { reads++; throw Error('catalog unavailable'); } };
  await apply({ trisoulX: { codegraph: runtime }, tools: { register: value => definitions.push(value) }, systemPrompt: { section: value => sections.push(value) }, on: (name, value) => { if (name === 'agent/pre-step') hook = value; else assemble = value; } });
  assert.deepEqual(definitions.map(x => x.name), ['codegraph_index']);
  assert.equal(await hook({}, async () => 'normal request'), 'normal request'); assert.equal(reads, 1);
  runtime.catalogRevision++;
  runtime.catalog = async () => ({ tools: [{ name: 'codegraph_explore', description: 'fixture', inputSchema: { type: 'object', properties: {} } }] });
  await hook({}, async () => {});
  assert.ok(definitions.some(x => x.name === 'mcp__codegraph__codegraph_explore'));
  assert.equal(sections.length, 1);
  const assembly = { sections: [{ name: 'trisoul-x:codegraph', text: CODEGRAPH_GUIDE }, { name: 'other', text: 'preserve' }] };
  runtime.enabled = false;
  const disabled = await assemble(null, {}, async () => assembly);
  assert.equal(disabled.sections[0].text, CODEGRAPH_DISABLED_GUIDE);
  assert.equal(disabled.sections[1], assembly.sections[1]);
  runtime.enabled = true;
  assert.equal(await assemble(null, {}, async () => assembly), assembly);
});

test('manual indexing clears an earlier automatic preparation failure', { timeout: 40000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'codegraph-retry-')), runtime = new CodegraphRuntime();
  t.after(async () => { await runtime.dispose(); await rm(root, { recursive: true, force: true }); });
  await writeFile(join(root, 'source.ts'), 'export const afterRecovery = 96;');
  const run = runtime.run.bind(runtime);
  runtime.run = async () => { throw Error('temporarily unavailable'); };
  await assert.rejects(runtime.ensureProject(root), /temporarily unavailable/);
  assert.equal(runtime.status().projects[0].status, 'error');
  runtime.run = run;
  await runtime.index({}, { cwd: root });
  assert.equal(runtime.status().projects[0].status, 'ready');
  assert.match(text(await runtime.call('codegraph_explore', { query: 'afterRecovery' }, { cwd: root })), /96/);
});

test('an ancestor runtime cache is not mistaken for a project index', { timeout: 40000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'codegraph-cache-parent-')), directory = join(root, 'project'), runtime = new CodegraphRuntime();
  t.after(async () => { await runtime.dispose(); await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, '.codegraph', 'bundles'), { recursive: true }); await mkdir(directory);
  await writeFile(join(directory, 'entry.ts'), 'export const onlyThisProject = 71;');
  assert.equal(await runtime.ensureProject(directory), await realpath(directory));
  await access(join(directory, '.codegraph', 'codegraph.db'));
  await assert.rejects(access(join(root, '.codegraph', 'codegraph.db')));
});
