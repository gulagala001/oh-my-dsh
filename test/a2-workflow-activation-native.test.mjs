import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { SimulationHost, cleanEnvironment, repoRoot, until } from '../scripts/simulator/host.mjs';
import { closeFixtureServer } from './fixtures/process.mjs';

const execute = promisify(execFile);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const schema = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false };

// Serialized into the isolated profile and loaded by the actual native Loader.
// Only the FS wait gate is instrumentation; it delegates to the original FS.
function activationDriver(ctx, config) {
  // Profile HMR may replace this observation entry. Preserve capabilities and
  // observations in this isolated host process without cancelling the caller
  // or disposing Native children as an instrumentation side effect.
  const key = Symbol.for('omd.a2.workflow-activation-fixture');
  const shared = globalThis[key] ??= { operations: new Map(), firstSteps: new Map(), created: new Map(), toolResults: [], failures: [], gates: [] };
  const { operations, firstSteps, created, toolResults, failures, gates } = shared;
  const hub = () => ctx.get('trisoulX');
  let gate;
  const errorData = error => ({ name: error?.name, message: String(error?.message ?? error), stack: error?.stack,
    ...(error?.cause ? { cause: errorData(error.cause) } : {}),
    ...(error instanceof AggregateError ? { errors: [...error.errors].map(errorData) } : {}) });
  const view = agent => ({ id: agent.id, status: agent.status, header: agent.session.header,
    currentPreset: ctx.sessionProjections.stateOf(agent.session, 'agentPreset'),
    cwd: ctx.workingDirectory.get(agent.session), policy: ctx.sandboxPolicy.resolve({ session: agent.session }),
    approval: agent.session.snapshotEvents().findLast(event => event.type === 'approval/policy')?.data,
    selected: agent.session.snapshotEvents().filter(event => event.type === 'agent-preset/selected').map(event => event.data),
    tools: ['read', 'write', 'structured_output', 'a2_custom_marker'].filter(name => ctx.tools.get(name, agent)),
    budgetOwner: hub()?.store.peek(agent.id)?.workflowBudgetOwner,
    workflowProject: hub()?.store.peek(agent.id)?.workflowProject });
  const publicOperation = op => ({ id: op.id, childId: op.childId, done: op.done, result: op.result,
    error: op.error, cleanupError: op.cleanupError, artifacts: op.artifacts,
    callerAborted: op.controller.signal.aborted, accepted: op.accepted,
    scriptPath: op.run?.scriptPath, transcriptDir: op.run?.transcriptDir,
    childFailures: op.run?.childFailures, worktrees: op.run?.worktrees });
  const begin = input => {
    const parent = ctx.agents.get(input.parentId);
    if (!parent) throw Error('Fixture requires the exact live native parent');
    const op = { id: input.id, controller: new AbortController(), artifacts: [], done: false };
    if (operations.has(op.id)) throw Error('Duplicate fixture operation');
    operations.set(op.id, op);
    op.task = (async () => {
      try {
        if (input.kind === 'workflow') {
          const engine = ctx.agentPresets.serviceFor(parent, 'workflowEngine') ?? parent.ctx.get('workflowEngine');
          if (!engine) throw Error('Native scoped workflow engine is unavailable');
          op.run = engine.start({ parent, signal: op.controller.signal,
            meta: { name: input.id, description: 'Native activation regression' }, script: input.script });
          op.accepted = true;
          op.result = await op.run.result;
        } else {
          const provider = ctx.subagents.getProvider('omd-workflow');
          if (typeof provider?.startWorkflow !== 'function') throw Error('Actual OMD workflow provider is unavailable');
          op.activation = await provider.startWorkflow({ parent, prompt: [{ type: 'text', text: input.prompt }],
            label: input.id, signal: op.controller.signal,
            agentOptions: { provider: 'simulation', model: 'simulation' },
            ...(input.schema ? { outputSchema: input.schema } : {}),
            ...(input.toolFilter ? { toolFilter: input.toolFilter } : {}) },
          { ...input.options,
            ...(input.budget ? { budgetOwner: hub()?.workflowBudget.capture(parent.session).owner } : {}),
            onWorktree: artifact => {
              op.artifacts.push({ ...artifact });
              if (input.failWorktreeReport && artifact.reason === 'running') throw Error('Fixture worktree observer failed');
            } });
          op.childId = op.activation.childId; op.accepted = true;
          op.result = await op.activation.result;
        }
      } catch (error) { op.error = errorData(error); }
      finally {
        try { await op.activation?.dispose(); }
        catch (error) { op.cleanupError = errorData(error); }
        op.done = true;
      }
    })();
    void op.task.catch(error => failures.push(errorData(error)));
    return { id: op.id };
  };
  ctx.on('agent/created', ({ agent }) => { if (agent.session.header.parentSession) created.set(agent.id, view(agent)); }, { global: true });
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'step/start' || firstSteps.has(session.id)) return;
    const agent = ctx.agents.get(session.id);
    if (agent?.session.header.parentSession) firstSteps.set(session.id, view(agent));
  }, { global: true });
  ctx.on('tools/result', (exec, result) => {
    if (exec.agent?.session.header.parentSession) toolResults.push({ sessionId: exec.agent.id, name: exec.name,
      isError: result.isError === true, error: result.error, content: result.content });
  }, { global: true });
  const original = ctx.fs.resolve;
  const intercepted = async function (path, options) {
    if (gate && path.endsWith('/.omd/worktrees')) {
      const current = gate; gate = undefined; gates.push(current); current.entered = true;
      current.hadSignal = Boolean(options?.signal);
      await new Promise((resolve, reject) => {
        const aborted = () => { current.aborted = true; reject(options.signal.reason); };
        const timer = setTimeout(() => { current.timeout = true; reject(Error('Native creation gate did not receive cancellation')); }, 5000);
        const finish = callback => value => { clearTimeout(timer); options?.signal?.removeEventListener('abort', aborted); callback(value); };
        current.release = finish(resolve);
        const onAbort = finish(aborted);
        options?.signal?.addEventListener('abort', onAbort, { once: true });
        // Keep the matching callback for cleanup; remove both on settlement.
        current.abortListener = onAbort;
        if (options?.signal?.aborted) onAbort();
      }).finally(() => options?.signal?.removeEventListener('abort', current.abortListener));
    }
    return Reflect.apply(original, this, [path, options]);
  };
  ctx.fs.resolve = intercepted;
  ctx.effect(() => async () => {
    if (ctx.fs.resolve === intercepted) ctx.fs.resolve = original;
  });
  ctx.inject(['webServer'], web => web.effect(() => web.webServer.register({ kind: 'prefix', path: '/__activation', async handler(req, res) {
    if (rejectUntrusted(ctx, req, res)) return;
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const input = req.method === 'POST' ? await readJsonBody(req) : {};
      if (path === '/__activation/start') { sendJson(res, 200, begin(input)); return; }
      if (path === '/__activation/gate') { gate = { id: input.id, entered: false, aborted: false }; sendJson(res, 200, { armed: true }); return; }
      if (path === '/__activation/abort') {
        const op = operations.get(input.id); if (!op) throw Error('Missing fixture operation');
        op.controller.abort(Error('Fixture caller cancelled')); op.run?.cancel('Fixture caller cancelled');
        sendJson(res, 200, { aborted: true }); return;
      }
      if (path === '/__activation/drain') {
        const parent = ctx.agents.get(input.parentId); if (!parent) throw Error('Missing fixture parent');
        await ctx.subagents.drainDescendants([parent]); sendJson(res, 200, { drained: true }); return;
      }
      if (path === '/__activation/state') {
        const boot = await import(config.bootURL), compatibility = boot.readProfileCompatibility(config.profile);
        const manifest = JSON.parse(readFileSync(config.manifestPath, 'utf8'));
        const peers = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-tools'];
        const sdk = await Promise.all(peers.map(async name => {
          const owner = ctx.pluginPackages.packageOf(name, config.ownerURL), native = ctx.pluginPackages.packageOf(name, config.anchorURL);
          const ownerEntry = createRequire(config.ownerURL).resolve(name), nativeEntry = createRequire(config.anchorURL).resolve(name);
          const [ownerModule, nativeModule] = await Promise.all([import(pathToFileURL(ownerEntry).href), import(pathToFileURL(nativeEntry).href)]);
          return { name, ownerVersion: owner?.version, nativeVersion: native?.version, ownerPath: owner?.dir, nativePath: native?.dir,
            ownerPhysicalPath: owner ? realpathSync(owner.dir) : null, nativePhysicalPath: native ? realpathSync(native.dir) : null, ownerEntry, nativeEntry, sameNamespace: ownerModule === nativeModule };
        }));
        sendJson(res, 200, { exemptions: compatibility.exemptions, nativeGateIssue: boot.evaluatePluginCompatibility(manifest, compatibility.exemptions) ?? null, operations: [...operations.values()].map(publicOperation),
          agents: ctx.agents.list().map(view), firstSteps: Object.fromEntries(firstSteps), created: Object.fromEntries(created),
          gates: gates.map(({ id, entered, aborted, timeout, hadSignal }) => ({ id, entered, aborted, timeout, hadSignal })),
          toolResults, failures, providers: ctx.subagents.list(),
          sdk,
          budgets: Object.fromEntries(ctx.agents.list().map(agent => [agent.id, hub()?.workflowBudget.snapshot(agent.session)])) }); return;
      }
      sendJson(res, 404, { error: 'Unknown native activation fixture route' });
    } catch (error) { sendJson(res, 500, { error: errorData(error) }); }
  } })));
}

test('a2 native workflow activation preserves composition, permissions, cancellation and durable cleanup', { timeout: 360000 }, async t => {
  const root = realpathSync(await mkdtemp(join(tmpdir(), 'omd-a2-activation-')));
  const evidence = process.env.OMD_A2_ACTIVATION_EVIDENCE;
  if (evidence) await mkdir(evidence, { recursive: true, mode: 0o700 });
  const requests = [], providerErrors = [], stages = [];
  let snapshotNative;
  const provider = createServer(async (req, res) => {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body), user = JSON.stringify(payload.messages.filter(message => message.role === 'user'));
      requests.push({ payload, closed: false }); const request = requests.at(-1);
      res.on('close', () => { request.closed = true; });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const frame = choice => res.write('data: ' + JSON.stringify({ id: 'a2-fixture', object: 'chat.completion.chunk', model: 'simulation', choices: [{ index: 0, ...choice }], usage: { prompt_tokens: 2, completion_tokens: 5, total_tokens: 7 } }) + '\n\n');
      const call = (name, args) => ({ delta: { role: 'assistant', tool_calls: [{ index: 0, id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' });
      if (user.includes('A2_NATIVE_HOLD')) {
        frame({ delta: { role: 'assistant', content: '' }, finish_reason: null });
        while (!res.destroyed) { await delay(50); if (!res.destroyed) res.write(': heartbeat\n\n'); }
        return;
      }
      const tools = payload.messages.filter(message => message.role === 'tool');
      if (user.includes('A2_NATIVE_READONLY')) {
        if (tools.length === 0) frame(call('write', { file_path: 'readonly-probe.txt', content: 'must be refused' }));
        else if (tools.length === 1) frame(call('read', { file_path: 'baseline.txt' }));
        else frame(call('structured_output', { answer: 'safe' }));
      } else if (user.includes('A2_NATIVE_WORKTREE') && tools.length === 0) {
        frame(call('write', { file_path: 'child-change.txt', content: 'native worktree write' }));
      } else {
        const usage = user.includes('A2_PARENT') ? 3 : 5;
        res.write('data: ' + JSON.stringify({ id: 'a2-fixture', object: 'chat.completion.chunk', model: 'simulation', choices: [{ index: 0, delta: { role: 'assistant', content: user.includes('A2_NATIVE_WORKTREE') ? 'worktree-complete' : 'parent-ready' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: usage, total_tokens: usage + 2 } }) + '\n\n');
      }
      res.end('data: [DONE]\n\n');
    } catch (error) { providerErrors.push(error.message); if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  const host = new SimulationHost({ root, provider: { baseURL: `http://127.0.0.1:${provider.address().port}/v1`, errors: providerErrors },
    clock: 'real', isolation: process.platform === 'darwin' ? 'native' : 'process', omd: { memoryScope: 'project' } });
  t.after(async () => {
    const errors = [];
    if (evidence && snapshotNative) {
      try {
        const terminal = await snapshotNative();
        await writeFile(join(evidence, 'terminal-state.json'), JSON.stringify(terminal, null, 2));
        for (const op of terminal.operations) {
          for (const artifact of [...op.artifacts, ...(op.worktrees ?? [])]) {
            const receipt = join(host.workspace, '.omd/worktrees', basename(artifact.path) + '.json');
            await readFile(receipt).then(bytes => writeFile(join(evidence, 'receipt-' + basename(receipt)), bytes)).catch(error => { if (error.code !== 'ENOENT') throw error; });
          }
          if (op.transcriptDir?.startsWith(root + '/')) await readFile(join(op.transcriptDir, 'journal.jsonl')).then(bytes => writeFile(join(evidence, 'journal-' + op.id + '.jsonl'), bytes)).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
      } catch (error) { errors.push(error); }
    }
    try { await host.close(); for (const monitor of host.monitors) { const snapshot = monitor.snapshot(); assert.equal(snapshot.closed, true); assert.equal(snapshot.pending, 0); assert.ok(snapshot.groups.every(group => group.retired && group.members.length === 0), 'Owned fixture process group remains live'); } } catch (error) { errors.push(error); }
    try { await closeFixtureServer(provider); } catch (error) { errors.push(error); }
    if (evidence) {
      await writeFile(join(evidence, 'execution.json'), JSON.stringify({ hostVersion: host.version, stages, requests, providerErrors,
        cleanup: { errors: errors.map(error => error.message), monitors: host.monitors.map(monitor => monitor.snapshot()) }, log: host.log }, null, 2));
      for (const file of ['host.jsonl', 'network.jsonl', 'faults.jsonl']) await readFile(join(root, file)).then(data => writeFile(join(evidence, file), data)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    await rm(root, { recursive: true, force: true });
    if (evidence) await writeFile(join(evidence, 'cleanup.json'), JSON.stringify({ rootRemoved: await stat(root).then(() => false, error => error.code === 'ENOENT'), errors: errors.map(error => error.message) }));
    if (errors.length) throw new AggregateError(errors, 'Native activation fixture cleanup failed');
  });
  await host.prepare(); assert.equal(host.version, '0.2.1-alpha.2', 'This regression must use the actual a2 SDK');
  await rm(join(host.workspace, '.git'), { recursive: true, force: true });
  const git = (...args) => execute('git', ['-c', 'core.hooksPath=', '-c', 'core.fsmonitor=false', ...args], { cwd: host.workspace, env: cleanEnvironment(root, host.home) });
  await git('init', '-q'); await git('config', 'user.name', 'Native Fixture'); await git('config', 'user.email', 'fixture@example.invalid');
  await writeFile(join(host.workspace, 'baseline.txt'), 'baseline\n'); await git('add', '.'); await git('commit', '-qm', 'fixture baseline');
  const profile = join(host.home, 'profiles/simulation'), driver = join(profile, 'activation-driver.mjs'), custom = join(profile, 'activation-preset.mjs');
  await writeFile(custom, `export const inject=['tools']; export function apply(ctx){ctx.tools.register({name:'a2_custom_marker',description:'Identify the custom fixture preset',parameters:{type:'object',properties:{},additionalProperties:false},output:{schema:{type:'object',properties:{custom:{type:'boolean'}},required:['custom'],additionalProperties:false},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},execute:async()=>({custom:true})});}`);
  const http = pathToFileURL(join(repoRoot, 'src/http.mjs')).href;
  await writeFile(driver, `import {readFileSync,realpathSync} from 'node:fs';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {readJsonBody,sendJson,rejectUntrusted} from ${JSON.stringify(http)};export const inject=['agents','subagents','tools','agentPresets','sandboxPolicy','workingDirectory','fs','sessionProjections','loader','pluginPackages'];export const apply=${activationDriver.toString()};`);
  const patchPath = join(profile, 'cordis.patch.yml'), patch = JSON.parse(await readFile(patchPath, 'utf8'));
  // The simulator explicitly supplies its preset table. Add a restrictive
  // native preset here so the public /permission command has a real target.
  patch.find(row => row.id === 'permission').config.presets['read-only'] = {
    sandbox: 'read-only', approval: 'never', name: 'read-only',
  };
  // The guard observes native services and must remain mounted while the OMD
  // owner is absent. Its existing extra OMD routes are unused during unload.
  const instrumentation = join(profile, 'native-instrumentation.mjs');
  const original = await readFile(join(repoRoot, 'scripts/simulator/host-plugin.mjs'), 'utf8');
  await writeFile(instrumentation, original.replace("'trisoulX'", '').replace("from '../../src/http.mjs'", 'from ' + JSON.stringify(http)));
  patch.find(row => row.insert?.some(plugin => plugin.id === 'omd-simulation')).insert.find(plugin => plugin.id === 'omd-simulation').name = pathToFileURL(instrumentation).href;
  if (process.env.OMD_A2_ACTIVATION_CONTROL_ONLY === '1') {
    const manifestPath = join(profile, 'package.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => name !== 'trisoul_x');
    await writeFile(manifestPath, JSON.stringify(manifest));
  }
  patch.push({ insert: [{ id: 'a2-review-preset', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'a2-review', plugins: [{ name: '@deepseek-ai/dsh-tool-fs' }, { name: pathToFileURL(custom).href }] } },
    { id: 'a2-native-driver', name: pathToFileURL(driver).href, config: { ownerURL: pathToFileURL(join(repoRoot, 'lib/host/workflow-spawn.mjs')).href,
      anchorURL: pathToFileURL(host.anchor.resolve('@deepseek-ai/dsh/package.json')).href, bootURL: pathToFileURL(host.anchor.resolve('@deepseek-ai/dsh-app-boot')).href, profile, manifestPath: join(profile, 'node_modules/trisoul_x/package.json') } }] });
  await writeFile(patchPath, JSON.stringify(patch));
  const bundleFiles = ['workflow-spawn.factory.mjs', 'workflow-ptc.factory.mjs', 'tool-workflow.factory.mjs', 'workflow-spawn.mjs', 'workflow-ptc.mjs'];
  const bundleBefore = Object.fromEntries(await Promise.all(bundleFiles.map(async name => [name, digest(await readFile(join(repoRoot, 'lib/host', name)))])));
  if (evidence) await writeFile(join(evidence, 'inputs.json'), JSON.stringify({ bundles: bundleBefore, cli: host.cli, version: host.version, testSha256: digest(await readFile(new URL(import.meta.url))) }, null, 2));
  await host.start();
  const api = (path, body) => host.request('/__activation' + path, body);
  const state = () => api('/state');
  snapshotNative = state;
  const completed = id => until(async () => { const op = (await state()).operations.find(row => row.id === id); return op?.done && op; }, { timeout: 30000, check: () => host.check(), description: 'native operation ' + id });
  const parent = async () => { const id = await host.createSession(); await host.prompt(id, 'A2_PARENT +100'); await host.idle(id); return id; };
  const record = async (name, data) => { stages.push({ name, ...data }); if (evidence) await writeFile(join(evidence, name + '.json'), JSON.stringify(data, null, 2)); };
  const identity = await state();
  assert.deepEqual(identity.failures, []); assert.deepEqual(identity.exemptions, {}); assert.equal(identity.nativeGateIssue, null);
  await record('sdk-inputs', { sdk: identity.sdk, exemptions: identity.exemptions, nativeGateIssue: identity.nativeGateIssue, bundles: bundleBefore });
  for (const peer of identity.sdk) { assert.ok(peer.ownerPath && peer.nativePath, JSON.stringify(peer)); assert.equal(peer.ownerPhysicalPath, peer.nativePhysicalPath, JSON.stringify(peer)); assert.equal(peer.ownerVersion, peer.nativeVersion); assert.equal(peer.ownerEntry, peer.nativeEntry); assert.equal(peer.sameNamespace, true); }

  if (process.env.OMD_A2_ACTIVATION_CONTROL_ONLY === '1') {
    assert.ok(!identity.providers.includes('omd-workflow'), 'Pure native profile must not activate OMD workflow');
    const parentId = await host.createSession({ preset: 'standard' });
    let selection, selectionError;
    try { selection = await host.rpc('agentPresets/select', undefined, { agentId: parentId, agentPreset: 'a2-review' }); }
    catch (error) { selectionError = { name: error.name, message: error.message, stack: error.stack }; }
    await record('native-blank-select-control', { selectedBundles: JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')).dsh.profile.bundles, parentId, selection, selectionError, snapshot: await state() });
    assert.equal(selectionError, undefined, JSON.stringify(selectionError));
    await host.prompt(parentId, 'A2_NATIVE_CONTROL');
    const selected = await until(async () => {
      const agent = (await state()).agents.find(agent => agent.id === parentId);
      return agent?.status === 'idle' && requests.some(row => row.closed && JSON.stringify(row.payload.messages).includes('A2_NATIVE_CONTROL')) && agent;
    }, { timeout: 15000, check: () => host.check(), description: 'native control request and idle' });
    assert.equal(selected.currentPreset, 'a2-review'); assert.ok(selected.tools.includes('a2_custom_marker'));
    await record('native-blank-select-control-executed', { selected });
    return;
  }

  await t.test('custom preset and structured output keep native readonly policy and toolFilter enforcement', async () => {
    const parentId = await parent();
    const permission = await host.rpc('commands/execute', undefined, { agentId: parentId, line: '/permission read-only', submittedAttachments: [] });
    assert.equal(permission.result.kind, 'success', JSON.stringify(permission));
    await api('/start', { id: 'readonly', parentId, prompt: 'A2_NATIVE_READONLY', schema, toolFilter: { deny: ['read'] }, options: { agentType: 'a2-review' } });
    const op = await completed('readonly'), snapshot = await state();
    assert.equal(op.error, undefined, JSON.stringify(op)); assert.equal(op.cleanupError, undefined); assert.equal(op.result.stopReason, 'completed'); assert.deepEqual(op.result.structured, { answer: 'safe' });
    const first = snapshot.firstSteps[op.childId]; assert.equal(first.currentPreset, 'a2-review'); assert.equal(first.header.agentPreset, 'trisoul-x');
    assert.equal(first.cwd, host.workspace); assert.equal(first.policy.mode, 'read-only'); assert.equal(first.policy.workspaceRoot, host.workspace); assert.equal(first.approval.policy, 'never');
    assert.ok(first.tools.includes('structured_output')); assert.ok(first.tools.includes('a2_custom_marker')); assert.ok(first.tools.includes('write')); assert.ok(!first.tools.includes('read'));
    const results = snapshot.toolResults.filter(row => row.sessionId === op.childId);
    assert.equal(results.find(row => row.name === 'write')?.isError, true); assert.equal(results.find(row => row.name === 'write')?.error?.info?.code, 'FS_SANDBOX_DENIED', JSON.stringify(results));
    assert.equal(results.find(row => row.name === 'read')?.isError, true); assert.equal(results.find(row => row.name === 'read')?.error?.info?.code, 'UNKNOWN_TOOL', JSON.stringify(results));
    await assert.rejects(stat(join(host.workspace, 'readonly-probe.txt')), /ENOENT/);
    const request = requests.find(row => JSON.stringify(row.payload.messages).includes('A2_NATIVE_READONLY'));
    assert.ok(request.payload.tools.some(row => row.function?.name === 'structured_output')); assert.ok(!request.payload.tools.some(row => row.function?.name === 'read'));
    assert.ok(!snapshot.agents.some(agent => agent.id === op.childId)); await record('readonly', { op, first, results });
  });
  let retained, persistedBudget;
  await t.test('actual workflow guest produces durable journal, worktree and shared budget receipts', async () => {
    const parentId = await parent();
    await api('/start', { id: 'worktree-budget', kind: 'workflow', parentId,
      script: `return await agent('A2_NATIVE_WORKTREE',{isolation:'worktree',agentType:'a2-review'});` });
    const op = await completed('worktree-budget'); assert.equal(op.error, undefined, JSON.stringify(op)); assert.equal(op.result.stopReason, 'completed', JSON.stringify(op));
    assert.equal(op.result.value, 'worktree-complete'); assert.equal(op.worktrees.length, 1); retained = op.worktrees[0];
    assert.equal(retained.retained, true); assert.match(retained.reason, /changed/); assert.equal(await readFile(join(retained.cwd, 'child-change.txt'), 'utf8'), 'native worktree write');
    await assert.rejects(stat(join(host.workspace, 'child-change.txt')), /ENOENT/); assert.equal(await readFile(join(host.workspace, 'baseline.txt'), 'utf8'), 'baseline\n');
    const journal = (await readFile(join(op.transcriptDir, 'journal.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(journal.filter(row => row.type === 'result').length, 1); assert.equal(journal.at(-1).outcome, 'completed');
    const childId = journal.find(row => row.type === 'result').result.childId, snapshot = await state(), first = snapshot.firstSteps[childId];
    assert.equal(first.currentPreset, 'a2-review'); assert.equal(first.cwd, retained.cwd); assert.equal(first.policy.workspaceRoot, host.workspace);
    assert.ok(first.budgetOwner?.poolId); assert.equal(first.budgetOwner.sessionId, parentId); assert.ok(first.workflowProject);
    assert.equal(snapshot.budgets[parentId].spent, 13, 'Root 3 plus two native child requests at 5 each');
    const stateFile = JSON.parse(await readFile(join(host.home, 'trisoul-x/sessions', childId + '.json'), 'utf8'));
    assert.deepEqual(stateFile.workflowBudgetOwner, first.budgetOwner); assert.equal(stateFile.workflowProject, first.workflowProject);
    const parentState = JSON.parse(await readFile(join(host.home, 'trisoul-x/sessions', parentId + '.json'), 'utf8'));
    persistedBudget = { childId, owner: first.budgetOwner, project: first.workflowProject, pool: parentState.workflowBudget.pools[first.budgetOwner.poolId] };
    const receipts = (await readdir(join(host.workspace, '.omd/worktrees'))).filter(name => name.endsWith('.json'));
    const receipt = (await Promise.all(receipts.map(name => readFile(join(host.workspace, '.omd/worktrees', name), 'utf8').then(JSON.parse)))).find(row => row.path === retained.path);
    assert.deepEqual(receipt, retained); await record('worktree-budget', { op, first, journal, receipt, budget: snapshot.budgets[parentId] });
  });
  for (const kind of ['caller', 'native-parent']) await t.test(kind + ' cancellation reaches the real native creation FS await before queued input', async () => {
    const parentId = await parent(), id = 'cancel-' + kind;
    await api('/gate', { id }); await api('/start', { id, parentId, prompt: 'A2_NEVER_MODELED_' + kind, options: { isolation: 'worktree' } });
    const entered = await until(async () => { const snapshot = await state(); return snapshot.gates.find(row => row.id === id)?.entered && snapshot; }, { timeout: 10000, description: 'creation FS gate' });
    const pendingChildren = entered.agents.filter(agent => agent.header.parentSession === parentId).map(agent => agent.id); assert.equal(pendingChildren.length, 1);
    if (kind === 'caller') await api('/abort', { id }); else await api('/drain', { parentId });
    const op = await completed(id), snapshot = await state(), gate = snapshot.gates.find(row => row.id === id);
    assert.equal(gate.hadSignal, true); assert.equal(gate.aborted, true); assert.equal(gate.timeout, undefined); assert.equal(op.accepted, undefined);
    assert.equal(op.callerAborted, kind === 'caller'); assert.match(JSON.stringify(op.error), /abort|cancel|drain/i); assert.equal(op.cleanupError, undefined);
    assert.ok(pendingChildren.every(id => !snapshot.agents.some(agent => agent.id === id))); assert.ok(pendingChildren.every(id => !snapshot.firstSteps[id]));
    assert.ok(!requests.some(row => JSON.stringify(row.payload.messages).includes('A2_NEVER_MODELED_' + kind)));
    await record(id, { op, gate, pendingChildren });
  });
  await t.test('throwing worktree observer preserves the primary error and retained receipt before input', async () => {
    const parentId = await parent();
    await api('/start', { id: 'observer-failure', parentId, prompt: 'A2_NEVER_MODELED_OBSERVER', failWorktreeReport: true, options: { isolation: 'worktree', agentType: 'a2-review' } });
    const op = await completed('observer-failure'), snapshot = await state();
    assert.equal(op.accepted, undefined); assert.equal(op.error.message, 'Fixture worktree observer failed', JSON.stringify(op)); assert.equal(op.cleanupError, undefined);
    const terminal = op.artifacts.at(-1); assert.equal(terminal.retained, true); assert.match(terminal.reason, /startup failed/);
    assert.equal(await readFile(join(terminal.cwd, 'baseline.txt'), 'utf8'), 'baseline\n');
    const receipt = JSON.parse(await readFile(join(host.workspace, '.omd/worktrees', basename(terminal.path) + '.json'), 'utf8')); assert.deepEqual(receipt, terminal);
    const childIds = Object.keys(snapshot.created).filter(id => snapshot.created[id].header.parentSession === parentId); assert.equal(childIds.length, 1);
    assert.ok(childIds.every(id => !snapshot.agents.some(agent => agent.id === id) && !snapshot.firstSteps[id]));
    assert.ok(!requests.some(row => JSON.stringify(row.payload.messages).includes('A2_NEVER_MODELED_OBSERVER')));
    await record('observer-failure', { op, receipt, childIds });
  });
  await t.test('owner unload interrupts native creation without fixture caller cancellation and reenables', async () => {
    const parentId = await parent(), id = 'startup-owner-unload';
    await api('/gate', { id }); await api('/start', { id, parentId, prompt: 'A2_NEVER_MODELED_OWNER', options: { isolation: 'worktree' } });
    const entered = await until(async () => { const snapshot = await state(); return snapshot.gates.find(row => row.id === id)?.entered && snapshot; }, { timeout: 10000, description: 'owner creation FS gate' });
    const pendingChildren = entered.agents.filter(agent => agent.header.parentSession === parentId).map(agent => agent.id); assert.equal(pendingChildren.length, 1);
    const disabled = await host.rpc('pluginManager/setBundleEnabled', undefined, { name: 'trisoul_x', enabled: false }); await record('startup-owner-disable', { disabled }); assert.equal(disabled.application, 'applied', JSON.stringify(disabled));
    const op = await completed(id), snapshot = await state(), gate = snapshot.gates.find(row => row.id === id);
    assert.equal(gate.hadSignal, true); assert.equal(gate.aborted, true); assert.equal(gate.timeout, undefined);
    assert.equal(op.callerAborted, false); assert.equal(op.accepted, undefined); assert.match(JSON.stringify(op.error), /abort|cancel|dispose|drain/i); assert.equal(op.cleanupError, undefined);
    assert.ok(pendingChildren.every(id => !snapshot.agents.some(agent => agent.id === id) && !snapshot.firstSteps[id])); assert.ok(snapshot.providers.includes('spawn')); assert.ok(!snapshot.providers.includes('omd-workflow'));
    assert.ok(!requests.some(row => JSON.stringify(row.payload.messages).includes('A2_NEVER_MODELED_OWNER')));
    const enabled = await host.rpc('pluginManager/setBundleEnabled', undefined, { name: 'trisoul_x', enabled: true }); assert.equal(enabled.application, 'applied', JSON.stringify(enabled));
    await until(async () => (await state()).providers.includes('omd-workflow'), { timeout: 15000 });
    const fresh = await parent(); await api('/start', { id: 'post-startup-unload', parentId: fresh, prompt: 'A2_POST_STARTUP_UNLOAD', options: { agentType: 'a2-review' } });
    const after = await completed('post-startup-unload'); assert.equal(after.result.stopReason, 'completed'); assert.equal(after.error, undefined); assert.equal(after.cleanupError, undefined);
    await record(id, { op, gate, pendingChildren, disabled, enabled, after });
  });
  await t.test('active provider unload stops a published native child, reenables cleanly and survives host restart', async () => {
    const parentId = await parent(); await api('/start', { id: 'unload', parentId, prompt: 'A2_NATIVE_HOLD', options: { agentType: 'a2-review' } });
    await until(async () => (await state()).operations.find(row => row.id === 'unload')?.accepted && requests.some(row => JSON.stringify(row.payload.messages).includes('A2_NATIVE_HOLD')), { timeout: 15000, description: 'native child model request' });
    const disabled = await host.rpc('pluginManager/setBundleEnabled', undefined, { name: 'trisoul_x', enabled: false }); await record('bundle-disable', { disabled }); assert.equal(disabled.application, 'applied', JSON.stringify(disabled));
    const op = await completed('unload'), snapshot = await state(); assert.equal(op.callerAborted, false, 'Owner unload must complete without fixture caller cancellation'); assert.equal(op.cleanupError, undefined, JSON.stringify(op)); assert.equal(op.error, undefined, JSON.stringify(op)); assert.equal(op.result.stopReason, 'aborted');
    assert.ok(!snapshot.agents.some(agent => agent.id === op.childId)); assert.ok(!snapshot.providers.includes('omd-workflow')); assert.ok(snapshot.providers.includes('spawn'));
    const enabled = await host.rpc('pluginManager/setBundleEnabled', undefined, { name: 'trisoul_x', enabled: true }); assert.equal(enabled.application, 'applied');
    await until(async () => (await state()).providers.includes('omd-workflow'), { timeout: 15000 });
    await host.restart(); const restarted = await state(); assert.ok(restarted.providers.includes('omd-workflow')); assert.deepEqual(restarted.failures, []);
    assert.equal(await readFile(join(retained.cwd, 'child-change.txt'), 'utf8'), 'native worktree write');
    const coldChildState = JSON.parse(await readFile(join(host.home, 'trisoul-x/sessions', persistedBudget.childId + '.json'), 'utf8'));
    const coldParentState = JSON.parse(await readFile(join(host.home, 'trisoul-x/sessions', persistedBudget.owner.sessionId + '.json'), 'utf8'));
    assert.deepEqual(coldChildState.workflowBudgetOwner, persistedBudget.owner); assert.equal(coldChildState.workflowProject, persistedBudget.project);
    assert.deepEqual(coldParentState.workflowBudget.pools[persistedBudget.owner.poolId], persistedBudget.pool, 'Originating token receipt survives restart even if active selection retires');
    const durable = await host.durable(persistedBudget.childId);
    assert.ok(durable.events.some(event => event.type === 'agent-preset/selected' && event.data.agentPreset === 'a2-review'));
    assert.ok(durable.events.some(event => event.type === 'working-directory/change' && event.data.cwd === retained.cwd));
    const fresh = await parent(); await api('/start', { id: 'restarted', parentId: fresh, prompt: 'A2_RESTARTED', options: { agentType: 'a2-review' } });
    const after = await completed('restarted'); assert.equal(after.result.stopReason, 'completed'); assert.equal(after.error, undefined); assert.equal(after.cleanupError, undefined);
    await record('unload-restart', { op, after, retained, disabled, enabled, budget: persistedBudget, durable });
  });
  assert.deepEqual(providerErrors, []);
  for (const name of bundleFiles) assert.equal(digest(await readFile(join(repoRoot, 'lib/host', name))), bundleBefore[name], name + ' changed during native execution');
  const audit = await host.audit(); assert.deepEqual(audit.modelDenials, []); assert.ok(audit.processMonitors.every(monitor => monitor.errors?.length === 0 || !monitor.errors));
});
