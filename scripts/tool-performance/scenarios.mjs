import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const scenarioNames = ['ast', 'article', 'original-search', 'original-search-mutable', 'native-workflow', 'ptc-workflow', 'native-system', 'browser-image', 'mcp-local', 'state-tasks'];
const deepFreeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export async function scenario({ root, directory, name, phase, size = 1200, browserExecutable }) {
  const load = file => import(pathToFileURL(join(root, file)).href);
  const source = Array.from({ length: size }, (_, i) => `export function item${i}(value) { console.log("item-${i}", value); return value + ${i}; }`).join('\n');
  const history = Array.from({ length: size }, (_, seq) => ({ seq, timestamp: seq + 1000, type: 'user/message', data: {
    id: `message-${seq}`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: `${seq % 17 === 0 ? 'needle-lookup 中文短词' : 'ordinary source'} ${seq} ${'Synthetic source text. '.repeat(25)}` }],
  } }));
  const immutable = name !== 'original-search-mutable';
  if (immutable) history.forEach(deepFreeze);
  // Read-only facades use the same documented snapshot interface as archived sessions.
  const session = { id: 'performance-session', header: { id: 'performance-session', version: 1, createdAt: 1000 },
    get seq() { return history.length; },
    snapshotEvents: () => immutable ? Object.freeze([...history]) : [...history], eventAt: seq => history[seq], requestContext: () => ({ contextWindow: 1000000 }),
    append(type, data, options = {}) { const event = { seq: history.length, timestamp: 1000 + history.length, type, data, ...options }; history.push(immutable ? deepFreeze(event) : event); return event; } };
  const fingerprint = hash({ version: 1, name, source, history });
  const stats = { sourceBytes: Buffer.byteLength(source), functions: size, originalEvents: size, originalTextBytes: Buffer.byteLength(JSON.stringify(history)) };
  if (name === 'article') {
    const { articleView } = await load('src/result-reduction/views.mjs');
    const html = '<html><head><title>Synthetic article</title></head><body><article><h1>Synthetic article</h1>' +
      Array.from({ length: size }, (_, i) => `<p>Paragraph ${i}. ${'This is deterministic source material for article extraction, with complete sentences and useful detail. '.repeat(4)}</p>`).join('') + '</article></body></html>';
    return { fingerprint: hash({ name, html }), stats: { htmlBytes: Buffer.byteLength(html), paragraphs: size }, async run(signal) {
      const result = await phase('article.parse', () => articleView(html, 'https://article.invalid/', signal));
      assert.equal(result.title, 'Synthetic article'); assert.ok(result.text.includes(`Paragraph ${size - 1}.`));
      return result;
    }, cancel: null, async close() {} };
  }
  if (name === 'ast') {
    const { structuralSearch } = await load('src/result-reduction/ast.mjs');
    return { fingerprint, stats, async run(signal) {
      const result = await phase('structuralSearch', () => structuralSearch(source, 'javascript', 'console.log($$$ARGS)', signal));
      assert.equal(result.parseError, false); assert.equal(result.matches.length, size);
      assert.equal(result.matches[0].text, 'console.log("item-0", value)');
      return result;
    }, async cancel(signal) { return structuralSearch(source.repeat(8), 'javascript', 'console.log($$$ARGS)', signal); }, async close() {} };
  }
  if (name.startsWith('original-search')) {
    const { searchOriginal } = await load('src/context/original-search.mjs');
    return { fingerprint, stats, async run(signal) {
      const first = await phase('search.firstPage', () => searchOriginal(session, { query: 'needle-lookup', limit: 5 }, { signal }));
      assert.equal(first.totalMatches, Math.ceil(size / 17)); assert.equal(first.results.length, 5);
      const second = await phase('search.secondPage', () => searchOriginal(session, { query: 'needle-lookup', limit: 5, cursor: first.nextCursor }, { signal }));
      const chinese = await phase('search.chinese', () => searchOriginal(session, { query: '短词', limit: 5 }, { signal }));
      assert.equal(chinese.totalMatches, first.totalMatches);
      assert.equal(new Set([...first.results, ...second.results].map(row => row.seq)).size, 10);
      return { first, second, chinese };
    }, cancel: signal => searchOriginal(session, { query: 'needle-lookup', limit: 5 }, { signal }), async close() {} };
  }
  const require = createRequire(join(root, 'package.json'));
  const host = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
  const native = async name => import(pathToFileURL(host.resolve('@deepseek-ai/dsh-' + name)).href);
  const { Context } = await import(pathToFileURL(host.resolve('@deepseek-ai/cordis')).href);
  const [{ ToolRuntime }, { LocalFileSystem }, fsTool, { LocalSubprocessRuntime }, { NodePtcRuntime }] = await Promise.all([
    native('tools'), native('fs-local'), native('tool-fs'), native('subprocess-local'), native('ptc-runtime-node'),
  ]);
  const [{ installResultReduction }, { registerContextViews }, { registerContextRecall }] = await Promise.all([
    load('src/result-reduction/service.mjs'), load('src/result-reduction/views.mjs'), load('src/context/recall.mjs'),
  ]);
  const ctx = new Context(), agent = { id: session.id, ctx, session };
  const append = session.append.bind(session);
  session.append = (...args) => { const event = append(...args); ctx.emit('session/event', session, event); return event; };
  ctx.reflect.provide('systemPrompt', { tools() {}, section() {}, getSectionOrder() { return 0; } });
  ctx.reflect.provide('agents', { get: id => id === agent.id ? agent : undefined, isLive: value => value === agent });
  ctx.reflect.provide('sessions', { get: id => id === session.id ? session : undefined });
  ctx.reflect.provide('workingDirectory', { ensure: async () => directory });
  ctx.reflect.provide('sandbox', { confine() { throw Error('Unexpected sandbox route'); } });
  ctx.reflect.provide('sandboxPolicy', { defaultMode: 'danger-full-access', resolve: () => ({ mode: 'danger-full-access', workspaceRoot: directory, sessionId: session.id }) });
  await ctx.plugin(LocalFileSystem, { cwd: directory });
  await ctx.plugin(LocalSubprocessRuntime);
  await ctx.plugin(NodePtcRuntime, { executionMode: 'per-call', timeoutMs: 30000, maxTimeoutMs: 30000, graceMs: 50 });
  await ctx.plugin(ToolRuntime, { mode: name === 'ptc-workflow' ? 'ptc' : 'native' });
  const { LlmRuntime } = await native('llm'); await ctx.plugin(LlmRuntime);
  fsTool.apply(ctx, fsTool.Config({ readImage: false }));
  const hub = { store: { dir: directory }, config: () => ({ contextOptimizationEnabled: true }) };
  const service = installResultReduction(ctx, hub, () => true);
  registerContextViews(ctx, hub); registerContextRecall(ctx, hub);
  await writeFile(join(directory, 'fixture.js'), source);
  await new Promise(resolve => setImmediate(resolve));
  // Wrappers observe existing public methods only; product modules and contracts stay intact.
  for (const method of ['archive', 'finish', 'recall']) {
    const original = service[method].bind(service);
    service[method] = (...args) => phase(`evidence.${method}`, () => original(...args));
  }
  const execute = ctx.tools.execute.bind(ctx.tools);
  ctx.tools.execute = args => phase(`tool.${args.name}`, () => execute(args));
  let serial = 0;
  const call = async (name, args, signal) => {
    const callId = `perf-${++serial}`;
    session.append('tool/call', { callId, name, arguments: JSON.stringify(args) });
    const result = await ctx.tools.execute({ name, arguments: args, callId, rootCallId: callId, agent, signal });
    const message = { id: 'result-' + callId, role: 'tool', toolCallId: callId, content: result.content, isError: result.isError };
    session.append('tool/result', { message }, { surfaceOp: 'append' }); await service.settled();
    assert.equal(result.isError, false, JSON.stringify(result.content));
    return result.value;
  };
  const normalize = value => JSON.parse(JSON.stringify(value).replaceAll(directory, '<workspace>').replace(/omd-raw:[a-f0-9-]{36}/g, 'omd-raw:<reference>'));
  if (name === 'state-tasks') {
    const { SessionProjectionRegistry } = await native('session-projection');
    const { GoalService } = await native('goal');
    await ctx.plugin(SessionProjectionRegistry); await ctx.plugin(GoalService);
    const { registerTasks } = await load('src/tasks.mjs');
    const { installCatalog } = await load('src/result-reduction/catalog.mjs');
    const { readTaskSnapshot } = await load('src/task-ledger.mjs');
    registerTasks(ctx); installCatalog(ctx, hub);
    const quote = 'Verify the generated source fixture completely.';
    session.append('user/message', { id: 'task-source', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: quote }] });
    await call('todo_write', { op: 'excerpt', from: quote, to: quote, tasks: [{ title: 'Verify fixture', anchor: { from: quote, to: quote } }] }, new AbortController().signal);
    return { fingerprint, stats, async run(signal) {
      const goal = await phase('goal.create', () => ctx.goals.create(agent, { objective: quote, maxGoalRounds: 3 }));
      const active = await phase('goal.get', () => ctx.goals.get(agent));
      assert.equal(active.phase, 'active');
      const completed = await phase('goal.complete', () => ctx.goals.complete(agent, { id: goal.id, revision: goal.revision }));
      const before = readTaskSnapshot(session).record.tasks;
      if (before.length) await call('todo_write', { op: 'remove', ids: before.map(task => task.id) }, signal);
      await call('todo_write', { op: 'add', tasks: [{ title: 'Verify fixture', anchor: { from: quote, to: quote } }] }, signal);
      const snapshot = await phase('task.snapshot', () => readTaskSnapshot(session));
      assert.equal(snapshot.record.tasks.length, 1);
      const viewed = await call('todo_write', { op: 'view' }, signal); assert.ok(viewed.includes('Verify fixture'));
      const found = JSON.parse(await call('tool_find', { query: '', limit: 3 }, signal));
      assert.equal(found.available, 0);
      return { goal: { phase: completed.phase, objective: completed.objective }, tasks: snapshot.record.tasks.map(({ title, done }) => ({ title, done })),
        foundTools: found.tools.map(({ name, parameters }) => ({ name, parameters })) };
    }, cancel: null, async close() { service.release(); await service.settled(); await ctx.fiber.dispose(); } };
  }
  if (name === 'mcp-local') {
    const { Client, InMemoryTransport } = require('@modelcontextprotocol/client');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'tool-performance', version: '1' }, { capabilities: {} });
    serverTransport.onmessage = async request => {
      if (request.id === undefined) return;
      let result;
      if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'synthetic-file-server', version: '1' } };
      else if (request.method === 'tools/call') {
        const body = await phase('mcp.serverRead', () => readFile(join(directory, 'fixture.js'), 'utf8'));
        const lines = body.split('\n').filter(line => line.includes(request.params.arguments.query));
        result = { content: [{ type: 'text', text: JSON.stringify({ lines }) }], structuredContent: { lines } };
      } else throw Error('Unexpected fixture MCP method: ' + request.method);
      await serverTransport.send({ jsonrpc: '2.0', id: request.id, result });
    };
    await serverTransport.start(); await client.connect(clientTransport);
    const { createMcpToolDefinition } = await native('mcp-client');
    ctx.tools.register(createMcpToolDefinition(ctx, { name: 'mcp__fixture__lookup', rawName: 'lookup', description: 'Search generated fixture file',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
      outputSchema: { type: 'object', properties: { lines: { type: 'array', items: { type: 'string' } } }, required: ['lines'] },
      call: (args, exec) => phase('mcp.protocol', () => client.callTool({ name: 'lookup', arguments: args }, undefined, { signal: exec.signal })) }));
    const { installCatalog } = await load('src/result-reduction/catalog.mjs'); installCatalog(ctx, hub);
    return { fingerprint, stats, async run(signal) {
      const found = JSON.parse(await call('tool_find', { query: 'fixture lookup', limit: 3 }, signal));
      assert.equal(found.tools[0].name, 'mcp__fixture__lookup');
      const result = await call('mcp__fixture__lookup', { query: 'console.log(' }, signal);
      assert.equal(result.structuredContent.lines.length, size);
      return result;
    }, cancel: null, async close() { await client.close(); await serverTransport.close(); service.release(); await service.settled(); await ctx.fiber.dispose(); } };
  }
  if (name === 'browser-image') {
    const { chromium } = require('playwright');
    const { LocalAttachmentStore } = await native('attachment-local');
    await ctx.plugin(LocalAttachmentStore, { dshHome: directory });
    const { observePage } = await load('vendor/opencu/src/browser/observation.mjs');
    const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort());
    await page.setContent('<html><title>Tool performance fixture</title><body style="margin:0;background:#123456">' +
      Array.from({ length: 60 }, (_, i) => `<div style="height:12px;width:${100 + i * 13}px;background:rgb(${i * 3},110,180)"></div>`).join('') + '</body></html>');
    const record = { page, documentGeneration: 1, elements: new Map(), id: 'fixture-tab' };
    const screenshot = page.screenshot.bind(page); page.screenshot = (...args) => phase('browser.capture', () => screenshot(...args));
    return { fingerprint: hash({ version: 1, name, viewport: [1280, 960], bars: 60 }), stats: { viewportPixels: 1280 * 960, bars: 60 }, async run(signal) {
      const observed = await phase('browser.observe', () => observePage(record, { format: 'screenshot', maxWidth: 640, signal }, { dataDir: directory, timeoutMs: 10000 }));
      const bytes = await phase('image.read', () => readFile(observed.screenshot.path));
      const ref = await phase('attachment.saveImage', () => ctx.attachments.saveImage({ data: bytes, mediaType: 'image/png', name: 'fixture.png' }));
      const saved = await phase('attachment.readImage', () => ctx.attachments.readImage(ref, signal));
      assert.equal(observed.screenshot.width, 640); assert.equal(observed.screenshot.height, 480);
      assert.equal(ref.width, 640); assert.equal(ref.height, 480);
      assert.ok(saved.data.length > 0);
      return { screenshot: { ...observed.screenshot, path: '<ephemeral>' }, pngHash: hash(bytes), storedHash: hash(Buffer.from(saved.data)), ref };
    }, cancel: null, async close() { await browser.close(); service.release(); await service.settled(); await ctx.fiber.dispose(); } };
  }
  if (name === 'native-system') {
    const [search, { LocalBashExecutor }, shellEnv, { LocalJobRegistry }, jobsTool, { SessionProjectionRegistry }, todo] = await Promise.all([
      native('tool-fs-search'), native('bash-local'), native('shell-env'), native('jobs-local'), native('tool-jobs'), native('session-projection'), native('tool-todo'),
    ]);
    await ctx.plugin(SessionProjectionRegistry);
    await ctx.plugin(LocalBashExecutor, { cwd: directory });
    shellEnv.apply(ctx, shellEnv.Config({ dshHome: directory }));
    await ctx.plugin(LocalJobRegistry);
    jobsTool.apply(ctx, jobsTool.Config({ completionDelivery: 'quiet' }));
    const bashTool = await native('tool-bash'); bashTool.apply(ctx, bashTool.Config({ promoteOnTimeout: false }));
    todo.apply(ctx, todo.Config({ allowParallelInProgress: false }));
    await search.apply(ctx, search.Config({ sampleOverCapGlobResults: false }));
    await new Promise(resolve => setImmediate(resolve));
    let runIndex = 0;
    return { fingerprint, stats, async run(signal) {
      const file = `written-${++runIndex}.txt`, body = 'Synthetic file body\nneedle-one\n' + 'record\n'.repeat(size);
      const written = await call('write', { file_path: file, content: body }, signal);
      const initial = await call('read', { file_path: file, limit: 10 }, signal);
      await call('edit', { file_path: file, old_string: 'needle-one', new_string: 'needle-two' }, signal);
      const edited = await call('read', { file_path: file, offset: 2, limit: 1 }, signal);
      const glob = await call('glob', { pattern: 'fixture.js' }, signal);
      const grep = await call('grep', { pattern: 'item-(?:1|2)"', include: 'fixture.js' }, signal);
      const command = 'wc -l < fixture.js';
      const foreground = await call('bash', { command, description: 'Count synthetic source lines' }, signal);
      const background = await call('bash', { command, description: 'Count synthetic source lines in background', run_in_background: true }, signal);
      const output = await call('job_output', { job_id: background.jobId, wait: true, timeout_ms: 10000 }, signal);
      const jobs = await call('job_list', {}, signal);
      const todos = await call('todo_write', { todos: [{ content: 'Check generated source', status: 'completed' }, { content: 'Inspect local result', status: 'in_progress' }] }, signal);
      assert.equal(edited.lines[0].text, 'needle-two'); assert.equal(initial.lines[1].text, 'needle-one');
      assert.equal(glob.paths.length, 1); assert.equal(grep.matches.length, 2); assert.equal(output.job.status, 'completed');
      assert.ok(output.text.includes(String(size - 1))); assert.equal(todos.counts.completed, 1);
      assert.ok(jobs.some(job => job.id === background.jobId));
      // Receipts include per-run IDs, paths, versions and timestamps. Preserve
      // the asserted semantic workload and full read/grep output separately.
      return { written: written.operation ?? true, initial: initial.lines, edited: edited.lines, glob: glob.paths.map(path => path.replaceAll(directory, '<workspace>')),
        grep: normalize(grep), foreground: { exitCode: foreground.exitCode, stdout: foreground.stdout, kind: foreground.kind },
        background: { status: output.job.status, text: output.text }, todos };
    }, cancel: null, async close() { service.release(); await service.settled(); await ctx.fiber.dispose(); } };
  }
  const readArgs = { file_path: 'fixture.js', offset: 1, limit: 40 };
  const viewArgs = { file: 'fixture.js', view: 'outline', maxChars: 12000 };
  const astArgs = { paths: ['fixture.js'], language: 'javascript', pattern: 'console.log($$$ARGS)', limit: 20 };
  const recallArgs = { search: 'original', query: 'needle-lookup', limit: 5 };
  return { fingerprint, stats, async run(signal) {
    let values;
    if (name === 'ptc-workflow') {
      const result = await call('run_code', { description: 'Read, inspect and search synthetic sources', code: `
        const read = await tools.read(${JSON.stringify(readArgs)});
        const view = JSON.parse(await tools.context_view(${JSON.stringify(viewArgs)}));
        const ast = JSON.parse(await tools.code_search(${JSON.stringify(astArgs)}));
        const recall = JSON.parse(await tools.recall(${JSON.stringify(recallArgs)}));
        return {read,view,ast,recall};` }, signal);
      values = result.result;
    } else values = { read: await call('read', readArgs, signal), view: JSON.parse(await call('context_view', viewArgs, signal)),
      ast: JSON.parse(await call('code_search', astArgs, signal)), recall: JSON.parse(await call('recall', recallArgs, signal)) };
    assert.equal(values.read.lines.length, 40); assert.equal(values.ast.totalMatches, size);
    const recalled = JSON.parse(values.recall.content[0].text); assert.equal(recalled.totalMatches, Math.ceil(size / 17));
    // A fresh immutable evidence ID and appended execution receipts vary by run. Keep all
    // actual file/search values; only the known source prefix/cursor depend on receipt count.
    delete recalled.nextCursor; delete recalled.through;
    const archived = await service.evidence.text(await service.evidence.meta(values.ast.rawRef), signal);
    assert.equal(hash(archived), values.ast.sourceHash);
    const canonicalArchiveHash = hash(normalize(JSON.parse(archived)));
    return normalize({ ...values, ast: { ...values.ast, sourceHash: canonicalArchiveHash }, recall: recalled });
  }, cancel: null, async close() { service.release(); await service.settled(); await ctx.fiber.dispose(); } };
}
