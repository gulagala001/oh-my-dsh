import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const cli = join(repo, 'scripts/simulate.mjs');
const secret = 'CLI_AUTH_SENTINEL_DO_NOT_RECORD_1298';
const fileDeadline = performance.now() + 55_000;

async function fixture(t, { retainOnFailure = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'simulator-cli-test-'));
  await mkdir(join(root, 'tmp'));
  t.after(async () => {
    if (retainOnFailure && await readFile(join(root, 'test-failed.txt'), 'utf8').then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) {
      t.diagnostic('Unexpected native failure reports retained at ' + root);
      return;
    }
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

function invoke(root, name, args, { timeoutMs = 20_000, preloads = [] } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [...preloads.flatMap(file => ['--import', file]), cli, ...args, '--report', join(root, name)], {
      cwd: repo,
      env: { ...process.env, NODE_OPTIONS: '',
        TMPDIR: join(root, 'tmp'), TMP: join(root, 'tmp'), TEMP: join(root, 'tmp'),
        OPENAI_API_KEY: secret,
        OMD_DSH_CLI: join(repo, 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '', forced;
    const timer = setTimeout(() => {
      child.kill('SIGINT');
      forced = setTimeout(() => child.kill('SIGKILL'), 4000);
    }, Math.max(1, Math.min(timeoutMs, fileDeadline - performance.now())));
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', part => { stdout += part; });
    child.stderr.on('data', part => { stderr += part; });
    child.once('error', error => { clearTimeout(timer); clearTimeout(forced); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer); clearTimeout(forced);
      resolveResult({ code, signal, stdout, stderr, reportRoot: join(root, name) });
    });
  });
}

async function reportFrom(result) {
  const runs = await readdir(result.reportRoot, { withFileTypes: true });
  assert.equal(runs.filter(entry => entry.isDirectory()).length, 1, 'each invocation gets one isolated report run');
  const directory = join(result.reportRoot, runs.find(entry => entry.isDirectory()).name);
  return { directory, report: JSON.parse(await readFile(join(directory, 'report.json'), 'utf8')) };
}

test('CLI help/list succeed without launching a host and include the documented entry points', { timeout: 5000 }, async t => {
  const root = await fixture(t);
  const help = await invoke(root, 'help', ['--help']);
  assert.equal(help.code, 0, help.stderr);
  for (const option of ['--scenario', '--ui', '--replay', '--transcript', '--explore', '--seed', '--cases', '--max-steps', '--budget-ms', '--minimize', '--self-test']) assert.ok(help.stdout.includes(option));
  assert.match(help.stdout, /process.*OS 沙箱/);
  const list = await invoke(root, 'list', ['--list']);
  assert.equal(list.code, 0, list.stderr);
  assert.deepEqual(list.stdout.trim().split('\n').map(line => line.split('\t')[0]), ['full-lifecycle', 'stream-cancel', 'background-timeout', 'todo-reminder', 'restart-checkpoint', 'storage-failure']);
  assert.deepEqual(await readdir(join(root, 'tmp')), []);
});

test('CLI rejects unknown/missing arguments, empty exploration and invalid finite limits', { timeout: 5000 }, async t => {
  const root = await fixture(t);
  const cases = [
    [['--unknown'], /Unknown option/], [['--scenario'], /Missing value/],
    [['--explore', '--cases', '0'], /at least one case/],
    [['--explore', '--cases', '-1'], /count must/],
    [['--explore', '--max-steps', '0'], /maxSteps must/],
    [['--explore', '--seed', 'NaN'], /seed must/],
    [['--explore', '--budget-ms', '0'], /deadlineMs must/],
    [['--transcript', 'missing.json'], /requires.*--replay/],
    [['--clock', 'nonsense'], /Unsupported clock/],
    [['--isolation', 'nonsense'], /isolation mode/],
    [['--all', '--scenario', 'storage-failure'], /Choose one/],
    [['--explore', '--self-test'], /Choose one/],
    [['--minimize'], /requires --explore/],
  ];
  for (const [index, [args, message]] of cases.entries()) {
    const result = await invoke(root, `invalid-${index}`, args);
    assert.equal(result.code, 1, JSON.stringify({ args, ...result }));
    assert.match(result.stderr, message);
  }
  assert.deepEqual(await readdir(join(root, 'tmp')), []);
});

test('CLI self-test writes independent negative-control reports with success exit status', { timeout: 5000 }, async t => {
  const root = await fixture(t);
  const result = await invoke(root, 'controls', ['--self-test']);
  assert.equal(result.code, 0, result.stderr);
  const { report, directory } = await reportFrom(result);
  assert.equal(report.kind, 'simulation-suite'); assert.equal(report.status, 'pass');
  assert.equal(report.results[0].kind, 'negative-controls');
  assert.deepEqual(report.results[0].checks.map(check => check.name), ['orphan tool result', 'unresolved tool call', 'wrong system position', 'private source contamination']);
  assert.ok(report.results[0].checks.every(check => check.status === 'pass' && check.expected === 'detected'));
  assert.match(await readFile(join(directory, 'report.html'), 'utf8'), /JSON 报告/);
  assert.equal(JSON.parse(await readFile(join(directory, 'negative-controls/report.json'), 'utf8')).status, 'pass');
  assert.deepEqual(await readdir(join(root, 'tmp')), []);
});

test('CLI reports an exhausted real exploration budget as incomplete with exit code 2', { timeout: 5000 }, async t => {
  const root = await fixture(t);
  const result = await invoke(root, 'budget', ['--explore', '--cases', '1', '--max-steps', '1', '--budget-ms', '1']);
  assert.equal(result.code, 2, result.stderr + result.stdout);
  const { report } = await reportFrom(result);
  assert.equal(report.status, 'incomplete');
  assert.notEqual(report.exploration.status, 'completed');
  assert.equal(report.exploration.truncated || report.exploration.results.some(item => item.status === 'timeout'), true);
});

test('CLI rejects unknown or incomplete transcript formats and preserves explicit failure reports', { timeout: 5000 }, async t => {
  const root = await fixture(t);
  const input = join(root, 'input.json');
  await writeFile(input, JSON.stringify({ version: 1, kind: 'omd-simulation-input', scenario: 'full-lifecycle', clock: 'virtual', isolation: 'native', ui: false, parameters: {} }));
  const validEntry = { request: { model: 'simulation', messages: [{ role: 'user', content: 'synthetic' }], stream: true }, response: { chunks: [{ finish_reason: 'stop' }] } };
  const values = [
    [{ version: 2, entries: [validEntry] }, /version 1/],
    [{ version: 1, entries: [] }, /entries/],
    [{ version: 1, entries: [{ ...validEntry, response: { chunks: [{ delta: { content: 'truncated' } }] } }] }, /finish_reason/],
    [{ version: 1, entries: [{ ...validEntry, response: { chunks: [{ finish_reason: 'stop' }], unknown: true } }] }, /unknown field/],
  ];
  for (const [index, [value, message]] of values.entries()) {
    const transcript = join(root, `bad-${index}.json`);
    await writeFile(transcript, JSON.stringify(value));
    const result = await invoke(root, `bad-${index}`, ['--replay', input, '--transcript', transcript]);
    assert.equal(result.code, 1, result.stderr + result.stdout);
    const { report, directory } = await reportFrom(result);
    assert.equal(report.status, 'fail');
    assert.equal(report.results[0].status, 'fail');
    assert.match(report.results[0].error.message, message);
    assert.equal(report.results[0].transcript.status, 'unavailable');
    assert.ok(report.results[0].retainedWorkspace.startsWith(resolve(root)) || report.results[0].retainedWorkspace.startsWith('/private' + resolve(root)));
    assert.equal(JSON.parse(await readFile(join(directory, 'scenario-0/input.json'), 'utf8')).scenario, 'full-lifecycle');
    await assertNoCredentials(directory);
  }
});

async function timeline(directory) {
  return (await readFile(join(directory, 'timeline.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

async function readRequests(directory) {
  return (await timeline(directory)).filter(event => event.type === 'model/request').map(event => event.payload);
}

function firstDifference(expected, actual, path = '') {
  if (Object.is(expected, actual)) return null;
  if (!expected || !actual || typeof expected !== 'object' || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) return { path: path || '/', expected, actual };
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  for (const key of keys) {
    if (!Object.hasOwn(expected, key) || !Object.hasOwn(actual, key)) return { path: `${path}/${key}`, expected: expected[key], actual: actual[key] };
    const difference = firstDifference(expected[key], actual[key], `${path}/${key}`);
    if (difference) return difference;
  }
  return null;
}

function literalRebind(value, recording, currentRecording, events) {
  const declared = events.filter(event => event.type === 'replay/literal-bindings').flatMap(event => event.substitutions ?? []);
  const pairs = (declared.length ? declared : Object.keys(recording).map(key => [recording[key], currentRecording[key]]))
    .filter(([from, to]) => typeof from === 'string' && from.length && typeof to === 'string').sort((a, b) => b[0].length - a[0].length);
  const replace = input => typeof input === 'string' ? pairs.reduce((text, [from, to]) => text.replaceAll(from, to), input)
    : Array.isArray(input) ? input.map(replace) : input && typeof input === 'object' ? Object.fromEntries(Object.entries(input).map(([key, child]) => [key, replace(child)])) : input;
  return replace(value);
}

function containsText(value, text) {
  if (typeof value === 'string') return value.includes(text);
  return value && typeof value === 'object' && Object.values(value).some(child => containsText(child, text));
}

function briefDifference(difference) {
  if (!difference || typeof difference.expected !== 'string' || typeof difference.actual !== 'string') return difference;
  let offset = 0;
  while (offset < Math.min(difference.expected.length, difference.actual.length) && difference.expected[offset] === difference.actual[offset]) offset++;
  return { path: difference.path, offset, expected: difference.expected.slice(Math.max(0, offset - 80), offset + 120), actual: difference.actual.slice(Math.max(0, offset - 80), offset + 120) };
}

async function assertNoCredentials(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) { await assertNoCredentials(file); continue; }
    if (!/\.(?:json|jsonl|html|log)$/.test(entry.name)) continue;
    const content = await readFile(file, 'utf8');
    assert.ok(!content.includes(secret), `${file} must not contain caller API credentials`);
    assert.ok(!/"(?:authorization|proxy-authorization)"\s*:/i.test(content), `${file} must not contain authentication headers`);
    assert.ok(!/Bearer\s+[A-Za-z0-9_-]{8,}/i.test(content), `${file} must not contain bearer credentials`);
  }
}

async function assertNativePrompt(directory, report, requests, originalInput) {
  assert.equal(report.kind, 'native-scenario');
  assert.equal(report.versions.dsh, JSON.parse(await readFile(join(repo, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version);
  assert.equal(report.platform, 'darwin');
  assert.equal(report.configuration.isolation, 'native');
  assert.equal(report.status, 'pass', JSON.stringify(report.error));
  assert.ok(report.checks.some(check => check.name === '生成场景：原生事件及实际工具结果' && check.status === 'pass'));
  assert.ok(report.requests.some(request => request.state === 'completed' && request.chunks > 0));
  const caseValue = originalInput.generatedCase;
  const actual = requests.find(request => request.tools?.some(tool => tool.function.name === 'todo_write'));
  assert.ok(actual, 'DSH must have issued a real native-tool-capable HTTP model request');
  assert.equal(actual.messages[0].role, 'system');
  assert.ok(actual.messages.some(message => message.role === 'user' && containsText(message.content, caseValue.parameters.text)));
  const audit = JSON.parse(await readFile(join(directory, 'host-events.json'), 'utf8'));
  assert.deepEqual(audit.network, []);
  assert.ok(audit.host.some(event => event.type === 'simulation/instrumented'));
  assert.ok(audit.host.some(event => event.type === 'model/route' && event.provider === 'simulation' && event.sessionId === report.result.sessionId));
  const events = audit.host.filter(event => event.type === 'session/event' && event.sessionId === report.result.sessionId).map(item => item.event);
  assert.ok(events.some(event => containsText(event, caseValue.parameters.text)), 'native user event must retain the generated prompt');
  assert.ok(events.some(event => event.type === 'assistant/message' && JSON.stringify(event).includes(`GENERATED_DONE_${caseValue.parameters.sourceSentinel}`)), 'native assistant event must contain the completed model response');
  assert.equal(report.result.actionCount, 1);
  assert.equal(report.transcript.status, 'complete');
  for (const file of ['report.json', 'report.html', 'timeline.jsonl', 'host.log', 'host-events.json', 'input.json', 'transcript.json']) {
    await readFile(join(directory, file), 'utf8');
  }
  await assertNoCredentials(directory);
}

test('macOS native CLI executes generated prompt, input replay and strict transcript replay with genuine DSH events', { timeout: 59_000, skip: process.platform !== 'darwin' }, async t => {
  const root = await fixture(t, { retainOnFailure: true });
  try {
    const generated = await invoke(root, 'generated', ['--explore', '--seed', '101', '--cases', '1', '--max-steps', '1', '--budget-ms', '20000']);
    assert.equal(generated.code, 0, generated.stdout + generated.stderr);
    const suite = await reportFrom(generated);
    const originalDirectory = join(suite.directory, 'case-1');
    const inputFile = join(originalDirectory, 'input.json');
    const transcriptFile = join(originalDirectory, 'transcript.json');
    const input = JSON.parse(await readFile(inputFile, 'utf8'));
    const transcript = JSON.parse(await readFile(transcriptFile, 'utf8'));
    const originalRequests = await readRequests(originalDirectory);
    await assertNativePrompt(originalDirectory, suite.report.results[0], originalRequests, input);
    assert.equal(input.generatedCase.actions.length, 1);
    t.diagnostic('generated prompt passed through real native macOS DSH, HTTP model request, durable-event assertion and shutdown');

    const replayed = await invoke(root, 'input-replay', ['--replay', inputFile]);
    assert.equal(replayed.code, 0, replayed.stdout + replayed.stderr);
    const replaySuite = await reportFrom(replayed);
    await assertNativePrompt(join(replaySuite.directory, 'scenario-0'), replaySuite.report.results[0], await readRequests(join(replaySuite.directory, 'scenario-0')), input);

    const strict = await invoke(root, 'strict-replay', ['--replay', inputFile, '--transcript', transcriptFile]);
    const strictSuite = await reportFrom(strict);
    const strictDirectory = join(strictSuite.directory, 'scenario-0');
    const strictInput = JSON.parse(await readFile(join(strictDirectory, 'input.json'), 'utf8'));
    const strictRequests = await readRequests(strictDirectory);
    if (strict.code !== 0) {
      const events = await timeline(strictDirectory);
      const expected = literalRebind(transcript, input.recording, strictInput.recording, events);
      const differences = strictRequests.map(actual => ({ model: actual.model, differences: expected.entries.map(recorded => ({ lane: recorded.lane, ...briefDifference(firstDifference(recorded.request, actual)) })) }));
      assert.fail('Strict transcript replay failed without loosening matching: ' + JSON.stringify({ error: strictSuite.report.results[0].error, differences }));
    }
    await assertNativePrompt(strictDirectory, strictSuite.report.results[0], strictRequests, input);
    assert.ok((await readFile(join(strictDirectory, 'timeline.jsonl'), 'utf8')).includes('replay/matched'));

    const malformedFile = join(root, 'incomplete-transcript.json');
    const malformed = structuredClone(transcript);
    malformed.entries[0].response.chunks = [{ delta: { content: 'cut-off' } }];
    await writeFile(malformedFile, JSON.stringify(malformed));
    const broken = await invoke(root, 'incomplete-transcript', ['--replay', inputFile, '--transcript', malformedFile]);
    assert.equal(broken.code, 1, broken.stdout + broken.stderr);
    const brokenSuite = await reportFrom(broken);
    const brokenReport = brokenSuite.report.results[0];
    assert.equal(brokenReport.status, 'fail');
    assert.match(brokenReport.error.message, /finish_reason/);
    assert.ok(brokenReport.retainedWorkspace.startsWith(resolve(root)) || brokenReport.retainedWorkspace.startsWith('/private' + resolve(root)));
    await readFile(join(brokenSuite.directory, 'scenario-0/report.html'), 'utf8');
    await assertNoCredentials(brokenSuite.directory);
    const brokenInput = JSON.parse(await readFile(join(brokenSuite.directory, 'scenario-0/input.json'), 'utf8'));
    assert.deepEqual(brokenInput.generatedCase, input.generatedCase, 'failed replay must preserve the explicit input plan');

    const driftFile = join(root, 'drift-transcript.json');
    const drift = structuredClone(transcript);
    for (const entry of drift.entries) entry.request.messages[0].content = 'DELIBERATE_SYSTEM_CONTRACT_DRIFT';
    await writeFile(driftFile, JSON.stringify(drift));
    const deviated = await invoke(root, 'drift', ['--replay', inputFile, '--transcript', driftFile]);
    assert.equal(deviated.code, 1, deviated.stdout + deviated.stderr);
    const driftSuite = await reportFrom(deviated);
    assert.equal(driftSuite.report.results[0].status, 'fail');
    assert.match(driftSuite.report.results[0].error.message, /contract|match/);
    await assertNoCredentials(driftSuite.directory);
    assert.ok((await readRequests(join(driftSuite.directory, 'scenario-0'))).some(request => request.messages[0].content !== 'DELIBERATE_SYSTEM_CONTRACT_DRIFT'));
  } catch (error) {
    await writeFile(join(root, 'test-failed.txt'), error.stack ?? String(error));
    throw error;
  }
});

test('final workspace cleanup failure leaves honest failed JSON/HTML after real native lifecycle completion', { timeout: 25_000, skip: process.platform !== 'darwin' }, async t => {
  const root = await fixture(t);
  const preload = join(root, 'reject-final-cleanup.mjs'), attempted = join(root, 'cleanup-attempt.json');
  // Only the outer CLI imports this preload. The actual host gets its own clean
  // environment and fault preload, so every tool/restart step runs normally.
  await writeFile(preload, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.promises.rm;
fs.promises.rm = async function(path, options) {
  if (typeof path === 'string' && /[\\/]omd-simulation-[A-Za-z0-9]{6}$/.test(path) && options?.recursive && options?.force) {
    fs.writeFileSync(${JSON.stringify(attempted)}, JSON.stringify({ path, exists: fs.existsSync(path), code: 'EACCES' }));
    throw Object.assign(new Error('INJECTED_FINAL_WORKSPACE_CLEANUP_FAILURE'), { code: 'EACCES' });
  }
  return original.call(this, path, options);
};
syncBuiltinESMExports();
`);
  const result = await invoke(root, 'cleanup-failure', ['--scenario', 'full-lifecycle'], { timeoutMs: 23_000, preloads: [preload] });
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.equal(result.signal, null);
  const { report, directory } = await reportFrom(result);
  assert.equal(report.status, 'fail'); assert.equal(report.results.length, 1);
  const scenario = report.results[0], scenarioDirectory = join(directory, 'scenario-0');
  const saved = JSON.parse(await readFile(join(scenarioDirectory, 'report.json'), 'utf8'));
  const attempt = JSON.parse(await readFile(attempted, 'utf8'));
  assert.equal(scenario.status, 'fail'); assert.equal(saved.status, 'fail');
  assert.equal(saved.error.code, 'EACCES'); assert.match(saved.error.message, /INJECTED_FINAL_WORKSPACE_CLEANUP_FAILURE/);
  assert.equal(attempt.exists, true); assert.equal(saved.retainedWorkspace, attempt.path);
  assert.equal((await stat(saved.retainedWorkspace)).isDirectory(), true, 'failed removal must leave the real isolated workspace');
  assert.equal(saved.timedOut, false); assert.equal(saved.transcript.status, 'complete');
  assert.ok(saved.checks.length > 5 && saved.checks.every(check => check.status === 'pass'), 'the failure must follow completed real scenario checks');
  assert.ok(saved.checks.some(check => check.name === '真实 SIGKILL 后原生恢复'));
  const audit = JSON.parse(await readFile(join(scenarioDirectory, 'host-events.json'), 'utf8'));
  assert.ok(audit.processMonitors.length >= 2, 'the actual host restarted with separate process ownership');
  for (const monitor of audit.processMonitors) {
    assert.equal(monitor.closed, true); assert.equal(monitor.pending, 0); assert.deepEqual(monitor.errors, []);
    assert.ok(monitor.groups.every(group => group.retired), 'cleanup fault must occur after owned host processes were reaped');
  }
  for (const html of [join(directory, 'report.html'), join(scenarioDirectory, 'report.html')]) {
    const text = await readFile(html, 'utf8');
    assert.match(text, /<p class="fail">fail/);
    assert.match(text, /INJECTED_FINAL_WORKSPACE_CLEANUP_FAILURE/);
  }
  await assertNoCredentials(directory);
});
