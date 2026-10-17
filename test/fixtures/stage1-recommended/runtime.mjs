import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, readdir, lstat, realpath, rm } from 'node:fs/promises';
import { join, resolve, relative, sep, basename } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse, stringify } from 'yaml';
import { ecosystemFixture, until } from '../plugin-ecosystem.mjs';
import { launchFixtureBrowser } from '../browser.mjs';
import { cleanEnvironment } from '../../../scripts/simulator/host.mjs';
import { hash, run, projectSkill, hostVersion } from './inputs.mjs';

export { until };
const peers = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-settings', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-web', '@deepseek-ai/dsh-home-paths'];
export async function optionalBytes(path) {
  try { return await readFile(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function inventory(directory, prefix = '') {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
    const file = join(directory, entry.name), key = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(result, await inventory(file, key + '/'));
    else {
      const stat = await lstat(file);
      assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Preserved inventory cannot follow a foreign symlink: ' + file);
      const bytes = await readFile(file); result[key] = { sha256: hash(bytes), bytes: bytes.length, mode: stat.mode & 0o7777 };
    }
  }
  return result;
}
export function nativeOutcomes(result, name, args, { expectedError = false } = {}) {
  const events = result.observer.events, ptc = ['omd-ptc', 'ptc'].includes(result.preset);
  const calls = events.filter(event => {
    if (event.type !== 'tool/call' || event.data.name !== (ptc ? 'run_code' : name)) return false;
    const input = JSON.parse(event.data.arguments);
    return ptc ? typeof input.code === 'string' && input.code.includes('tools[' + JSON.stringify(name) + ']') && input.code.includes(JSON.stringify(args))
      : Object.entries(args).every(([key, value]) => input[key] === value);
  });
  return calls.map(call => {
    const matches = events.filter(event => event.type === 'tool/result' && event.data.message?.source?.callId === call.data.callId);
    assert.equal(matches.length, 1, 'Exactly one native result paired with ' + name + '/' + call.data.callId);
    assert.equal(Boolean(matches[0].data.message.isError || matches[0].data.error), expectedError, 'Actual native ' + name + (expectedError ? ' must explicitly refuse' : ' must succeed'));
    if (ptc && name === 'skill') {
      const dispatches = events.filter(event => event.type === 'tool/ptc-dispatch' && event.data.parentCallId === call.data.callId && event.data.name === name && Object.entries(args).every(([key, value]) => event.data.arguments[key] === value));
      assert.equal(dispatches.length, 1, 'PTC must dispatch the actual nested skill exactly once');
      assert.equal(dispatches[0].data.isError, expectedError, 'PTC nested skill policy outcome');
    }
    return matches[0].data.message;
  });
}
export function assertNativeRead(result) {
  assert.equal(typeof result.workspace, 'string', 'Native read expectation requires the actual owned workspace');
  const outcomes = nativeOutcomes(result, 'read', { file_path: join(result.workspace, 'probe.txt') });
  assert.equal(outcomes.length, 1, 'Exactly one actual native read operation must execute');
  assert.ok(JSON.stringify(outcomes[0].content).includes('ECO_NATIVE_FILE_READ'), 'Native read must return the actual owned source bytes');
  assert.equal(result.observer.agent?.status, 'idle');
  assert.ok(!result.observer.modelAttempts || result.observer.modelAttempts.every(request => request.provider === 'ecosystem' && request.model === 'ecosystem'), 'Native read observation includes no refused/unconfigured model attempt');
  assert.ok(result.requests.some(request => request.model === 'ecosystem' && request.tools?.length), 'Native read must traverse the actual owned model wire');
  if (result.observer.modelDenials) assert.deepEqual(result.observer.modelDenials, [], 'Shared native model guard denied no route');
}
export function assertPtc(result) {
  const wire = result.requests.filter(request => request.tools?.length);
  assert.ok(wire.every(request => request.model === 'ecosystem'), 'PTC must actually reach the guarded owned model');
  const allowed = new Set(['run_code', 'job_output', 'job_list', 'job_kill', 'runtime_status']);
  assert.ok(wire.length >= 2 && wire.every(request => request.tools.some(tool => tool.function.name === 'run_code') && request.tools.every(tool => allowed.has(tool.function.name))), 'Actual PTC wire must use run_code and its controls, not direct business tools');
  const calls = result.observer.events.filter(event => event.type === 'tool/call');
  assert.ok(calls.some(event => JSON.stringify(event.data).includes('run_code')), 'Native PTC execution event is required');
}
export function skillInvocationPlan(catalog, names = catalog.map(row => row.name)) {
  assert.equal(new Set(catalog.map(row => row.name)).size, catalog.length, 'Invocation-neutral registry has no duplicate names');
  assert.equal(new Set(names).size, names.length, 'Requested skill coverage has no duplicates');
  return names.map(name => {
    const row = catalog.find(row => row.name === name); assert.ok(row, 'Actual registry skill missing: ' + name);
    assert.equal(typeof row.provider, 'string');
    assert.equal(typeof row.invocation?.modelInvocable, 'boolean', 'Actual resolved model invocation metadata: ' + name);
    assert.equal(typeof row.invocation?.userInvocable, 'boolean', 'Actual resolved user invocation metadata: ' + name);
    return { name, provider: row.provider, modelInvocable: row.invocation.modelInvocable, userInvocable: row.invocation.userInvocable };
  });
}
const textContent = content => typeof content === 'string' ? content : (content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n');
const instructionMessages = result => result.observer.events.filter(event => event.type === 'user/message' && event.data.source?.kind === 'skill-invocation');
export function assertSkillResults(result, names = result.skillPlan?.map(row => row.name) ?? []) {
  skillInvocationPlan(result.observer.skills, names);
  const plan = skillInvocationPlan(result.observer.skills);
  assert.deepEqual(plan, result.skillPlan, 'Skill execution plan comes from the actual unchanged native registry');
  const catalog = result.skillCatalog;
  assert.ok(catalog, 'Actual native model-facing skill catalog event');
  assert.equal(catalog.data.source.kind, 'skill-catalog');
  assert.equal(catalog.data.source.form, 'catalog');
  assert.deepEqual(catalog.data.source.entries.map(row => row.name).sort(), result.observer.skills.filter(row => row.invocation.modelInvocable).map(row => row.name).sort(), 'Only model-invocable summaries reach the model catalog; the neutral directory remains complete');
  for (const row of plan) {
    const invocable = row.modelInvocable || row.userInvocable, definition = result.skillDefinitions[row.name];
    const operations = result.skillOperations.filter(operation => operation.name === row.name);
    const calls = nativeOutcomes(result, 'skill', { name: row.name }, { expectedError: !row.modelInvocable && invocable });
    assert.equal(calls.length, invocable ? 1 : 0, 'Exactly one native model invocation or expected refusal, neither-invocable directory entries are not executed: ' + row.name);
    if (!invocable) {
      assert.equal(definition, undefined, 'Neither-invocable skill is retained without loading a body');
      assert.deepEqual(operations, []); assert.ok(!instructionMessages(result).some(event => event.data.source.name === row.name)); continue;
    }
    assert.equal(definition.name, row.name); assert.equal(definition.provider, row.provider, 'Actual winning provider owns the loaded body');
    const summary = result.observer.skills.find(skill => skill.name === row.name);
    for (const key of ['source', 'path', 'resourceBase']) assert.deepEqual(definition[key], summary[key], 'Actual winning native definition identity: ' + key);
    assert.deepEqual(definition.invocation, { modelInvocable: row.modelInvocable, userInvocable: row.userInvocable });
    assert.ok(typeof definition.content === 'string' && definition.content.trim().length, 'Actual native skill instructions');
    assert.equal(operations.length, 2, 'One model boundary probe and one genuine user boundary probe per invocable skill');
    const modelOperation = operations.find(operation => operation.kind === 'model'); assert.ok(modelOperation);
    const text = textContent(calls[0].content);
    if (!row.modelInvocable) {
      assert.ok(text.includes(`skill "${row.name}" is not available for model invocation`), 'Expected native policy diagnostic, not unknown/other execution failure');
      assert.ok(!text.includes('<skill_content name="' + row.name + '">'), 'Refusal cannot expose skill instructions');
    } else if (['omd-ptc', 'ptc'].includes(result.preset)) {
      const value = JSON.parse(text.replace(/\nFile sandbox enforcement is partial on this host\.$/, ''));
      assert.deepEqual(value, { name: row.name, provider: row.provider, ...(definition.resourceBase ? { resourceBase: definition.resourceBase } : {}), content: definition.content }, 'PTC returns the actual native skill definition');
    } else assert.equal(text, definition.canonical, 'Native tool uses the SDK canonical renderer and actual winning body');
    const modelRequests = result.requests.slice(...modelOperation.requestRange);
    for (const request of modelRequests) assert.equal(request.model, 'ecosystem', 'Native skill tool-loop uses the actual isolated model');
    assert.ok(modelRequests.some(request => request.messages.some(message => message.role === 'tool' && message.tool_call_id === calls[0].source.callId && textContent(message.content).includes(text))), 'Actual native model tool loop receives its paired success/refusal');
    const userOperation = operations.find(operation => operation.kind === 'user'); assert.ok(userOperation);
    const userRequests = result.requests.slice(...userOperation.requestRange);
    assert.ok(userRequests.length, 'Slash probe reaches the actual provider');
    for (const request of userRequests) assert.equal(request.model, 'ecosystem', 'Native user injection uses the actual isolated model');
    const injected = instructionMessages(userOperation);
    assert.equal(injected.length, row.userInvocable ? 1 : 0, 'Native user slash injection respects userInvocable independently: ' + row.name);
    const directUsers = userOperation.observer.events.filter(event => event.type === 'user/message' && event.data.source?.kind === 'user');
    assert.equal(directUsers.length, 1, 'Slash originated from one actual native user message');
    assert.ok(textContent(directUsers[0].data.content).startsWith('/' + row.name + ' '), 'Native direct user slash gesture is retained');
    if (row.userInvocable) {
      assert.deepEqual(injected[0].data.source, { kind: 'skill-invocation', name: row.name, form: 'instructions' });
      assert.equal(textContent(injected[0].data.content), definition.canonical, 'Native slash injects canonical actual content/resources');
      assert.ok(userRequests.some(request => request.messages.some(message => message.role === 'user' && textContent(message.content) === definition.canonical)), 'Native user injection reaches the actual model wire');
    } else assert.ok(!userRequests.some(request => request.messages.some(message => message.role === 'user' && textContent(message.content) === definition.canonical)), 'User-prohibited skill is not injected');
    assert.equal(userOperation.observer.events.filter(event => event.type === 'tool/call').length, 0, 'Slash evidence is genuine native instruction injection, not a substitute model tool call');
    if (row.name === 'saas-landing' && definition.source === 'project-dsh') assert.ok(definition.content.includes('RECOMMENDED_PROJECT_SKILL_PRESERVED'), 'Actual project winner body');
  }
  assert.equal(result.observer.agent?.status, 'idle');
  assert.ok(result.observer.modelAttempts.every(row => row.provider === 'ecosystem' && row.model === 'ecosystem'), 'Skill paths reach only the isolated actual provider');
}
export async function exerciseSkillTurns(f, observe, result, requested = []) {
  const view = await observe(result.sessionId);
  skillInvocationPlan(view.skills, requested);
  // Exercise every actual entry without narrowing discovery to an advertised
  // model catalog, a declared subset or an arbitrary count limit.
  result.skillPlan = skillInvocationPlan(view.skills);
  result.skillCatalog = view.events.filter(event => event.type === 'user/message' && event.data.source?.kind === 'skill-catalog').at(-1);
  const loaded = await observe(result.sessionId, { definitions: JSON.stringify(result.skillPlan.map(row => row.name)) });
  result.skillDefinitions = loaded.skillDefinitions; result.skillOperations = [];
  const eventStart = result.observer.events.at(-1)?.seq ?? -1, wireStart = f.requests.length, wireOffset = result.requests.length;
  for (const row of result.skillPlan) {
    if (!row.modelInvocable && !row.userInvocable) continue;
    // The user probe runs first so a model-success history cannot masquerade as
    // native slash injection on the later wire request.
    for (const kind of ['user', 'model']) {
      const before = await observe(result.sessionId), seq = before.events.at(-1)?.seq ?? -1, requests = f.requests.length;
      const nonce = randomUUID(), text = kind === 'model' ? `ECO_CHECK:skill:${row.name}:${nonce}` : `/${row.name} ECO_USER_SKILL:${nonce}`;
      await f.rpc('session/prompt', { request: { sessionId: result.sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text }] } });
      const after = await until(async () => { assert.deepEqual(f.protocolErrors, []); const value = await observe(result.sessionId); return value.agent?.status === 'idle' && value.events.some(event => event.type === 'turn/end' && event.seq > seq) && value; }, result.preset + ' native ' + kind + ' skill ' + row.name, 45000);
      result.skillOperations.push({ name: row.name, kind, observer: { events: after.events.filter(event => event.seq > seq) }, requestRange: [wireOffset + requests - wireStart, wireOffset + f.requests.length - wireStart] });
    }
  }
  const after = await observe(result.sessionId);
  assert.deepEqual(after.skills, view.skills, 'Invocation probes cannot filter/change the complete neutral directory');
  result.observer = { ...result.observer, ...after, events: [...result.observer.events, ...after.events.filter(event => event.seq > eventStart)] };
  result.requests.push(...f.requests.slice(wireStart)); assertSkillResults(result); return result;
}
export async function mountSkillObserver(f, owners = [], services = ['tools', 'llm', 'skills', 'skill', 'pluginManager', 'trisoulX', 'omaa']) {
  const directory = join(f.root, 'stage1-observer'); await mkdir(directory);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'owned-stage1-recommended-observer', version: '1.0.0', type: 'module', exports: './index.mjs' }));
  await writeFile(join(directory, 'index.mjs'), await readFile(new URL('./observer.mjs', import.meta.url)));
  const patchPath = join(f.home, 'profiles', f.profile, 'cordis.patch.yml'), rows = parse(await readFile(patchPath, 'utf8'));
  rows.push({ insert: [{ id: 'owned-stage1-recommended-observer', name: pathToFileURL(join(directory, 'index.mjs')).href, config: { peers, services, owners } }] });
  await writeFile(patchPath, stringify(rows));
  return (id, query = {}) => f.request('/stage1-recommended-observer?' + new URLSearchParams({ ...(id ? { session: id } : {}), ...query }));
}
export function assertDirectory(actual, expected, description) {
  assert.equal(new Set(actual.map(row => row.name)).size, actual.length, description + ' has duplicate registrations');
  for (const previous of expected) assert.deepEqual(actual.find(row => row.name === previous.name), previous, description + ': ' + previous.name);
}
export function assertOwners(view, plugins) {
  assert.equal(view.nativeToolRuntime, true);
  for (const plugin of plugins) {
    const rows = view.owners[plugin.name]; assert.ok(rows?.length, 'Actual native loader owner missing: ' + plugin.name);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row.peers).sort(), [...peers].sort(), 'Every published SDK namespace must actually be compared');
      for (const [peer, value] of Object.entries(row.peers)) assert.equal(value.namespaceEqual, true, plugin.name + ' ' + peer + ': ' + JSON.stringify(value));
    }
  }
}
export async function install(f, artifact, { ci = false, approveBuild = false, timeoutMs = 600000 } = {}) {
  assert.equal(hash(await readFile(artifact.file)), artifact.sha256, 'Frozen asset before native install');
  let argv = ['plugin', '--profile', f.profile, 'add'];
  if (approveBuild) {
    const profile = await realpath(join(f.home, 'profiles', f.profile));
    const approval = artifact.name + '@file:' + relative(profile, artifact.file).replaceAll('\\', '/');
    argv.push('--allow-build=' + approval);
  }
  argv.push('file:' + artifact.file);
  let result;
  if (!ci) { result = await f.cliRun(argv); result.CI = false; }
  else {
    argv.push('--store-dir', join(f.root, 'public-store'));
    const env = { ...cleanEnvironment(f.root, f.home), CI: 'true' }; delete env.NODE_OPTIONS;
    try { result = { ok: true, exitCode: 0, argv, CI: true, ...await run(process.execPath, [f.cli, ...argv], { cwd: f.workspace, env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }) }; }
    catch (error) { result = { ok: false, exitCode: error.code, argv, CI: true, signal: error.signal, stdout: error.stdout ?? '', stderr: error.stderr ?? error.message }; }
  }
  assert.equal(hash(await readFile(artifact.file)), artifact.sha256, 'Frozen asset after native install'); return result;
}
export function assertPeerRefusal(result, artifact) {
  const diagnostic = result.stderr + result.stdout;
  assert.equal(result.ok, false, 'Original fixed asset must actually be refused');
  assert.equal(result.exitCode, 1, 'Actual peer refusal is a nonzero native CLI result, not a skip');
  assert.match(diagnostic, /dsh: installation rejected:/, 'Must reach the native compatibility transaction, not a network/download failure');
  assert.match(diagnostic, /incompatible with dsh 0\.2\.1-alpha\.2/, 'Must expose the actual matching-host peer rejection');
  assert.match(diagnostic, new RegExp(artifact.rejectionPattern), 'Explicit asset-specific refusal expectation');
}
export async function exemptions(f) {
  const result = await f.cliRun(['plugin', '--profile', f.profile, 'version-exemptions']);
  assert.equal(result.ok, true, result.stderr); const value = JSON.parse(result.stdout); assert.deepEqual(value, {}, 'No version exemptions are permitted'); return value;
}
const ownedRoots = new WeakSet();
const rootMarker = '.stage1-owned-root.json';
const statIdentity = stat => ({ dev: stat.dev.toString(), ino: stat.ino.toString(), birthtimeNs: stat.birthtimeNs.toString() });
async function directoryIdentity(path) {
  const stat = await lstat(path, { bigint: true });
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Owned root/parent must be a real directory: ' + path);
  assert.equal(await realpath(path), path, 'Owned root/parent cannot have a symlink ancestor');
  return statIdentity(stat);
}
export async function ownFixtureRoot(root, parent) {
  const work = await realpath(fileURLToPath(new URL('../../../work/', import.meta.url)));
  root = resolve(root); parent = resolve(parent);
  assert.ok(root.startsWith(work + sep) && parent.startsWith(work + sep), 'Only a new owned root in this checkout work directory may be removed');
  assert.equal(resolve(root, '..'), parent, 'Owned fixture root must be the immediate newly created child');
  assert.deepEqual(await readdir(root), [], 'Root identity is recorded at creation, before fixture writes');
  const identity = Object.freeze({ root, parent, rootStat: Object.freeze(await directoryIdentity(root)), parentStat: Object.freeze(await directoryIdentity(parent)), nonce: randomUUID() });
  await writeFile(join(root, rootMarker), JSON.stringify(identity) + '\n', { flag: 'wx', mode: 0o600 });
  ownedRoots.add(identity); return identity;
}
async function assertOwnedRoot(identity) {
  assert.ok(ownedRoots.has(identity), 'Deletion requires this process\'s actual creation identity, not a path/report/old fixture');
  assert.deepEqual(await directoryIdentity(identity.parent), identity.parentStat, 'Owned parent identity is unchanged');
  assert.deepEqual(await directoryIdentity(identity.root), identity.rootStat, 'Owned fixture root identity is unchanged');
  const marker = await lstat(join(identity.root, rootMarker)); assert.ok(marker.isFile() && !marker.isSymbolicLink());
  assert.deepEqual(JSON.parse(await readFile(join(identity.root, rootMarker), 'utf8')), identity, 'Owned root creation nonce is unchanged');
}
export async function removeOwnedFixtureRoot(identity) {
  await assertOwnedRoot(identity);
  // Verify the resolved absolute target and both creation identities immediately
  // before rm. Nested package symlinks are unlinked, never followed by rm.
  const target = await realpath(identity.root); assert.equal(target, identity.root);
  await rm(target, { recursive: true, force: false }); ownedRoots.delete(identity);
  await assert.rejects(lstat(target), error => error.code === 'ENOENT', 'Owned fixture root is actually absent');
  return { rootRemoved: true, root: target, identity, removedAt: new Date().toISOString() };
}
export async function closeOwnedFixture(f, identity, out) {
  const receipt = { status: 'pending', closed: false, rootRemoved: false, naturalNativeExit: null, nativeExitEvidence: 'not-attested-by-existing-close', identity, evidence: [] }, errors = [];
  const attempt = async action => { try { await action(); } catch (error) { errors.push(error); } };
  await attempt(async () => { await writeFile(join(out, 'host-last.log'), f?.log() ?? 'Fixture setup failed before a host handle was returned.\n'); });
  // Existing close owns process/provider disposal, not filesystem removal or
  // proof of natural appExit. Preserve an optional real receipt without inferring
  // graceful shutdown from a void return or a successful close.
  await attempt(async () => {
    const closed = await f.close(); receipt.closed = true; receipt.closeReceipt = closed ?? null;
    receipt.naturalNativeExit = closed?.naturalExit ?? null;
    receipt.nativeExitEvidence = closed ? 'fixture-close-receipt' : 'not-attested-by-existing-close';
  });
  await attempt(async () => {
    await assertOwnedRoot(identity);
    const directory = join(out, 'fixture-evidence'); await mkdir(directory, { recursive: true });
    const capture = async (path, key) => {
      const stat = await lstat(path); assert.ok(stat.isFile() && !stat.isSymbolicLink());
      assert.ok((await realpath(path)).startsWith(identity.root + sep), 'Evidence source stays within the actual owned root');
      const bytes = await readFile(path), target = join(directory, key); await mkdir(resolve(target, '..'), { recursive: true });
      await writeFile(target, bytes, { flag: 'wx' }); receipt.evidence.push({ source: path, path: target, sha256: hash(bytes), bytes: bytes.length });
    };
    for (const entry of await readdir(identity.root, { withFileTypes: true })) {
      if (entry.isFile() && entry.name !== rootMarker && /\.(?:log|json|jsonl|png)$/.test(entry.name)) await capture(join(identity.root, entry.name), basename(entry.name));
    }
    // Retain durable native/OMD log bytes as well as observer/model/process
    // evidence. Never traverse installed dependencies, workspace Git or symlinks,
    // and do not turn credentials/settings or an entire HOME copy into evidence.
    const logs = async (path, prefix = 'home') => {
      const stat = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (!stat) return;
      assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Native log capture does not traverse a symlink directory');
      assert.ok((await realpath(path)).startsWith(identity.root + sep), 'Native log directory stays in the owned root');
      for (const entry of await readdir(path, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
        if (entry.isSymbolicLink() || ['node_modules', '.git', 'cache', 'config', 'bin', 'pi-agent'].includes(entry.name)) continue;
        const file = join(path, entry.name), key = prefix + '/' + entry.name;
        if (entry.isDirectory()) await logs(file, key);
        else if (entry.isFile() && /\.(?:jsonl|log)$/.test(entry.name)) await capture(file, key);
      }
    };
    await logs(join(identity.root, 'home'));
    await writeFile(join(out, 'cleanup-receipt.json'), JSON.stringify({ ...receipt, captureComplete: true }, null, 2) + '\n');
    receipt.captureComplete = true;
  });
  // Failed close or failed evidence capture keeps the owned HOME for diagnosis;
  // neither state can be reported as rootRemoved or cleanup passed.
  if (!errors.length && receipt.closed && receipt.captureComplete) await attempt(async () => { Object.assign(receipt, await removeOwnedFixtureRoot(identity)); });
  receipt.status = errors.length || !receipt.rootRemoved ? 'failed' : 'passed';
  receipt.errors = errors.map(error => error.stack); await writeFile(join(out, 'cleanup-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (receipt.status !== 'passed') throw Object.assign(new AggregateError(errors, 'Owned fixture capture/close/root removal failed'), { receipt });
  return receipt;
}
export async function createCase(t, input, label, report) {
  const out = await mkdtemp(join(input.out, label + '-')), root = join(out, 'fixture-root'); await mkdir(root);
  const identity = await ownFixtureRoot(root, out);
  let f;
  report.root = root; report.output = out; report.startedAt = new Date().toISOString(); report.passed = false;
  input.caseReports?.push(report);
  const persist = () => writeFile(join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  t.after(async () => {
    try { report.cleanup = await closeOwnedFixture(f, identity, out); }
    catch (error) { report.cleanup = error.receipt ?? { status: 'failed', rootRemoved: false, error: error.stack }; report.passed = false; throw error; }
    finally { report.finishedAt = new Date().toISOString(); await persist(); }
  });
  f = await ecosystemFixture({ root, cli: input.cli, isolation: 'native', storeDir: join(root, 'public-store'), installTimeoutMs: input.installTimeoutMs });
  assert.equal(f.hostVersion, hostVersion);
  const directory = join(root, 'stage1-observer'); await mkdir(directory);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'owned-stage1-recommended-observer', version: '1.0.0', type: 'module', exports: './index.mjs' }));
  await writeFile(join(directory, 'index.mjs'), await readFile(new URL('./observer.mjs', import.meta.url)));
  const patchPath = join(f.home, 'profiles', f.profile, 'cordis.patch.yml'), rows = parse(await readFile(patchPath, 'utf8'));
  rows.push({ id: 'trisoul-x', config: { componentAutoSetup: false, computerUseEnabled: false, codegraphEnabled: false, dreamAutoEnabled: false,
    unifiedBackground: { provider: 'ecosystem', model: 'ecosystem', effort: 'off' }, dreamProvider: 'ecosystem', dreamModel: 'ecosystem' } },
  { insert: [{ id: 'owned-stage1-recommended-observer', name: pathToFileURL(join(directory, 'index.mjs')).href, config: {
    peers, services: ['tools', 'llm', 'skills', 'skill', 'pluginManager', 'trisoulX', ...input.plugins.flatMap(row => row.services ?? [])],
    owners: [{ name: 'trisoul_x' }, ...input.plugins.map(row => ({ name: row.name, entryIds: [...new Set([...(row.entryIds ?? []), ...(row.id === 'dsh-open-design' ? ['open-design-skill-filesystem'] : [])])] }))],
  } }] });
  await writeFile(patchPath, stringify(rows));
  const projectPath = join(f.workspace, '.dsh/skills/saas-landing/SKILL.md'); await mkdir(resolve(projectPath, '..'), { recursive: true }); await writeFile(projectPath, projectSkill);
  const observe = (id, query = {}) => f.request('/stage1-recommended-observer?' + new URLSearchParams({ ...(id ? { session: id } : {}), ...query }));
  // The public exercise intentionally activates its own newly created session.
  // Keep that live observer for warm business execution, never for cold reads.
  const exercise = f.exercise;
  f.exercise = async (preset, skills = []) => {
    const result = { ...await exercise(preset), workspace: f.workspace };
    result.observer = await observe(result.sessionId);
    return exerciseSkillTurns(f, observe, result, skills === true ? ['open-design'] : Array.isArray(skills) ? skills : []);
  };
  await persist(); return { f, out, root, patchPath, projectPath, observe, persist };
}
export async function ordinaryWithAttachment(f, observe) {
  const registered = await f.rpc('workspace/create', { request: { path: f.workspace } });
  const { sessionId } = await f.rpc('session/create', { request: { workspaceId: registered.workspace.workspaceId, agentPreset: 'standard' } });
  const selected = await f.rpc('session/selectModel', { request: { sessionId, provider: 'ecosystem', model: 'ecosystem' } });
  assert.equal(selected.selected?.provider, 'ecosystem'); assert.equal(selected.selected?.model, 'ecosystem');
  const { origin, cookie } = await f.request('/stage1-recommended-observer?browser=1');
  const bytes = Buffer.from('STAGE1_RECOMMENDED_COLD_ATTACHMENT\nOwned original native file bytes.\n');
  const response = await fetch(origin + '/api/session/uploadFileBinary?' + new URLSearchParams({ sessionId, name: 'recommended-cold-original.txt' }), {
    method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream' }, body: bytes, signal: AbortSignal.timeout(15000),
  });
  const upload = await response.json(); assert.equal(response.ok, true, JSON.stringify(upload)); assert.equal(upload.ok, true);
  assert.equal(upload.value.file.attachmentId, 'sha256:' + hash(bytes)); assert.equal(upload.value.file.bytes, bytes.length);
  const before = f.requests.length, ends = (await observe(sessionId)).events.filter(row => row.type === 'turn/end').length;
  await f.rpc('session/prompt', { request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [
    { type: 'text', text: 'ECO_CHECK:read:' + randomUUID() }, { type: 'file', receiptId: upload.value.receiptId },
  ] } });
  await until(async () => { assert.deepEqual(f.protocolErrors, []); const view = await observe(sessionId); return view.agent?.status === 'idle' && view.events.filter(row => row.type === 'turn/end').length > ends; }, 'Ordinary native read and attachment admission', 45000);
  const result = { preset: 'standard', sessionId, workspace: f.workspace, observer: await observe(sessionId), requests: f.requests.slice(before), attachment: upload.value.file, attachmentSha256: hash(bytes) };
  assertNativeRead(result); assert.ok(JSON.stringify(result.observer.events).includes(upload.value.file.attachmentId), 'Native event log contains the actual admitted attachment'); return result;
}
export async function exercisePro(f, observe, preset, existingSession, skills = ['open-design', 'saas-landing'], previous) {
  const workspace = await f.rpc('workspace/create', { request: { path: f.workspace } });
  const sessionId = existingSession ?? (await f.rpc('session/create', { request: { workspaceId: workspace.workspace.workspaceId, agentPreset: preset } })).sessionId;
  const mode = await f.request('/trisoul-x/api/model-mode?session=' + sessionId, existingSession ? undefined : { provider: 'ecosystem', model: 'ecosystem', mode: 'pro' });
  assert.equal(mode.eligible, true); assert.equal(mode.mode, 'pro');
  const before = f.requests.length, eventCount = previous?.observer.events.at(-1)?.seq ?? ((await observe(sessionId)).events.at(-1)?.seq ?? -1);

  if (previous) {
    const cold = await observe(sessionId, { residency: '1' });
    assert.equal(cold.agentAttached, false, 'Persisted Pro stays cold until the intentional prompt');
    assert.equal(cold.sessionAttached, false); assert.ok(!cold.created.includes(sessionId));
  }
  const ends = previous?.observer.events.filter(event => event.type === 'turn/end').at(-1)?.seq ?? (await observe(sessionId)).events.filter(row => row.type === 'turn/end').at(-1)?.seq ?? -1;
  await f.rpc('session/prompt', { request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: `ECO_CHECK:read:${randomUUID()}` }] } });
  await until(async () => { assert.deepEqual(f.protocolErrors, []); const view = await observe(sessionId); return view.agent?.status === 'idle' && view.events.some(row => row.type === 'turn/end' && row.seq > ends) && view; }, preset + ' persistent Pro read', 45000);
  const observer = await observe(sessionId); observer.events = observer.events.filter(event => event.seq > eventCount);
  const result = { preset, sessionId, workspace: f.workspace, mode, observer, requests: f.requests.slice(before) };
  await exerciseSkillTurns(f, observe, result, skills); assertNativeRead(result);
  if (preset === 'omd-ptc') assertPtc(result);
  else assert.ok(result.requests.some(row => row.tools?.some(tool => tool.function.name === 'workflow' && tool.function.parameters?.properties?.resumeFromRunId)), 'Persistent normal Pro keeps actual native Workflow resume capability');
  return result;
}
export async function realUi(f, input, out, sessionId, label, plugins, disabled = new Set()) {
  const { origin, cookie } = await f.request('/stage1-recommended-observer?browser=1');
  const env = cleanEnvironment(f.root, f.home); delete env.NODE_OPTIONS;
  const browser = await launchFixtureBrowser({ executablePath: input.browser, env });
  let page;
  const errors = [], consoleErrors = [], failed = [], httpErrors = [], interactions = [], probes = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
    await context.addCookies(cookie.split('; ').map(row => { const at = row.indexOf('='); return { name: row.slice(0, at), value: row.slice(at + 1), url: origin }; }));
    await context.route('**/*', async route => { const url = new URL(route.request().url()); if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) await route.continue(); else await route.abort(); });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', row => { if (row.type() === 'error') consoleErrors.push(row.text()); });
    page.on('requestfailed', row => failed.push({ path: new URL(row.url()).pathname, error: row.failure()?.errorText }));
    page.on('response', row => { if (row.status() >= 400) httpErrors.push({ path: new URL(row.url()).pathname, status: row.status() }); });
    const title = 'STAGE1_RECOMMENDED_' + label; await f.rpc('session/rename', { request: { sessionId, title } });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const welcome = page.getByRole('button', { name: /^(继续|Continue)$/, exact: true });
    if (await welcome.waitFor({ state: 'visible', timeout: label === 'installed' ? 30000 : 5000 }).then(() => true, () => false)) { await welcome.click(); await welcome.waitFor({ state: 'hidden' }); interactions.push('native-welcome-acknowledgement'); }
    const target = page.getByText(title, { exact: true }).first();
    if (!await target.isVisible()) { const workspace = page.getByText('workspace', { exact: true }).first(); if (await workspace.isVisible()) await workspace.click(); }
    const more = page.getByText(/展开其余 \d+ 个会话/).first(); if (!await target.isVisible() && await more.isVisible()) await more.click();
    await target.click(); await page.locator('.wSkVaW_header').waitFor();
    for (const plugin of plugins) for (const probe of plugin.ui ?? []) {
      const node = page.locator(probe.selector);
      if (disabled.has(plugin.name)) await node.waitFor({ state: 'hidden' });
      else { await node.first().waitFor({ state: 'visible' }); if (probe.text) assert.ok((await node.first().innerText()).includes(probe.text)); }
      probes.push({ name: plugin.name, ...probe, visible: !disabled.has(plugin.name) });
    }
    const iui = plugins.find(row => row.id === 'dsh-intelligent-ui');
    if (iui) {
      const entrance = page.getByRole('button', { name: '新建智能聊天', exact: true });
      if (disabled.has(iui.name)) assert.equal(await entrance.count(), 0, 'Disabled/uninstalled IUI entrance must disappear');
      else await entrance.first().waitFor({ state: 'visible' });
      probes.push({ name: iui.name, role: 'button', accessibleName: '新建智能聊天', visible: !disabled.has(iui.name) });
    }
    await page.screenshot({ path: join(out, label + '-conversation.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '设置', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: '设置', exact: true });
    if (!await dialog.waitFor({ timeout: 2000 }).then(() => true, () => false)) { await page.keyboard.press('Alt+Meta+Comma'); await dialog.waitFor(); interactions.push('native-settings-shortcut'); }
    const menuText = await dialog.innerText();
    for (const plugin of plugins) if (plugin.settingsText) assert.equal(menuText.includes(plugin.settingsText), !disabled.has(plugin.name), 'Actual settings contribution: ' + plugin.name);
    let savedIntervalRendered;
    const status = plugins.find(row => row.id === 'dsh-status-rotator');
    if (status && !disabled.has(status.name)) {
      await dialog.getByText(status.settingsText, { exact: true }).first().click();
      await dialog.locator('.dsh-sr-settings').waitFor({ state: 'visible' }); await dialog.getByRole('tab', { name: '行为', exact: true }).click();
      const interval = dialog.locator('label.dsh-sr-field').filter({ has: page.getByText('轮换间隔(毫秒)', { exact: true }) }).locator('input');
      await until(async () => await interval.inputValue() === '1377', 'Real native status settings retain the edited value'); savedIntervalRendered = await interval.inputValue();
    }
    await page.screenshot({ path: join(out, label + '-settings.png'), animations: 'disabled' }); assert.deepEqual(errors, []);
    return { menuText, settingsText: await dialog.innerText(), savedIntervalRendered, probes, errors, consoleErrors, failed, httpErrors, interactions };
  } catch (error) {
    await page?.screenshot({ path: join(out, label + '-first-failure.png') }).catch(() => {});
    await writeFile(join(out, label + '-first-failure.json'), JSON.stringify({ message: error.message, body: page ? await page.locator('body').innerText().catch(() => '') : '', errors, consoleErrors, failed, httpErrors, interactions }, null, 2)); throw error;
  } finally { await browser.close(); }
}

// Reuse the real public coexistence runner too, not a shadow Host/ToolRuntime.
// It supplies full invocation-neutral directories, policy-aware model/user
// paths, settings/services and install lifecycle evidence for the accepted subset; rejected stock assets remain separate gates.
export async function publicCoexistence(input, out, omd, order, controlReport) {
  // The public runner accepts npm-layout .tgz only. Source snapshots are
  // installed/exercised unchanged by the complete matrix, never repacked just
  // to fit this companion runner or silently treated as covered here.
  const plugins = input.plugins.filter(row => row.stockGate === 'accepted' && (!row.manifestMember || row.manifestMember === 'package/package.json'));
  assert.ok(plugins.length, 'At least one actual accepted npm-layout asset is required by the shared public runner');
  const excluded = input.plugins.filter(row => row.stockGate === 'accepted' && !plugins.includes(row)).map(row => ({ id: row.id, reason: 'Original source-snapshot layout; fully covered unchanged by the extended matrix, not the npm-layout public runner.' }));
  const packages = join(out, 'accepted-public-runner-inputs-' + order + '.json');
  // This companion runner observes preservation but does not seed settings via
  // plugin APIs. The extended matrix above owns those writes/byte assertions;
  // do not assert a config file exists before the actual product creates it.
  await writeFile(packages, JSON.stringify({ version: 1, plugins: plugins.map(row => ({ name: row.name, version: row.version, file: row.file, sha256: row.sha256,
    source: row.source, tools: row.tools, skills: row.skills, settingsText: row.settingsText, apiPath: row.apiPath })) }, null, 2));
  const evidence = join(out, 'public-coexist-' + order); const argv = [fileURLToPath(new URL('../../../scripts/check-plugin-coexist.mjs', import.meta.url)), '--host-cli', input.cli, '--packages', packages, '--out', evidence, '--isolation', 'native', '--install-timeout-ms', String(input.installTimeoutMs)];
  if (omd) argv.push('--omd-package', input.omd.file, '--order', order, '--control-report', controlReport);
  const runnerRoot = await mkdtemp(join(out, 'public-runner-' + order + '-')), runnerIdentity = await ownFixtureRoot(runnerRoot, out), runnerHome = join(runnerRoot, 'home');
  for (const directory of [join(runnerRoot, 'tmp'), runnerHome, join(runnerHome, 'config'), join(runnerHome, 'cache'), join(runnerHome, 'data'), join(runnerHome, 'state')]) await mkdir(directory, { recursive: true });
  const env = cleanEnvironment(runnerRoot, runnerHome); delete env.NODE_OPTIONS;
  // The sanitized child HOME must not silently change Playwright's registry.
  // Keep the explicitly supplied installed browser without installing anything.
  env.PLAYWRIGHT_BROWSERS_PATH = input.browserRegistry;
  let result; try { result = { ok: true, exitCode: 0, naturalExit: true, argv, ...await run(process.execPath, argv, { env, cwd: out, timeout: 10800000, maxBuffer: 16 * 1024 * 1024 }) }; }
  catch (error) { result = { ok: false, exitCode: error.code, signal: error.signal, naturalExit: !error.killed && !error.signal, killed: error.killed, argv, stdout: error.stdout ?? '', stderr: error.stderr ?? error.message }; }
  const resultPath = join(out, 'public-runner-result-' + order + '.json');
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  // The child launcher HOME is distinct from the host fixture root. Remove only
  // its own new identity after a naturally finished launcher; timed-out/killed
  // children retain their HOME rather than pretending descendant cleanup passed.
  result.launcherCleanup = result.naturalExit ? await removeOwnedFixtureRoot(runnerIdentity) : { rootRemoved: false, root: runnerRoot, reason: 'Launcher did not exit naturally; child ownership requires failure cleanup.' };
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  assert.equal(result.ok, true, 'Real public coexistence runner failed: ' + result.stdout + result.stderr);
  const path = join(evidence, 'report.json'), report = JSON.parse(await readFile(path)); assert.equal(report.completed, true); assert.equal(report.passed, true);
  assert.equal(report.cleanup?.rootRemoved, true, 'Public close success cannot replace owned root removal');
  await assert.rejects(lstat(report.root), error => error.code === 'ENOENT', 'Public fixture HOME/root is actually removed');
  assert.deepEqual(report.unsupportedPackages, []); assert.equal(report.hostVersion, hostVersion);
  return { path, sha256: hash(await readFile(path)), report, excluded };
}
