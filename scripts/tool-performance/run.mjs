import { createRequire } from 'node:module';
import { fork, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch, cpus } from 'node:os';
import { scenarioNames, hash } from './scenarios.mjs';
import { coverage } from './coverage.mjs';

const args = process.argv.slice(2), options = { root: resolve(fileURLToPath(new URL('../..', import.meta.url))), repeats: 7, size: 1200, idleMs: 1000, cases: scenarioNames };
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (key === '--help') {
    console.log('node scripts/tool-performance/run.mjs --out /absolute/.local/run.json [--root SOURCE_ROOT] [--baseline report.json] [--cases ' + scenarioNames.join(',') + '] [--repeats 7] [--size 1200] [--idle-ms 1000]\nTool-level end-to-end and local measurements; no external model requests or working DSH. Fresh process per case; first measured call follows module/fixture setup, not OS-cold. Reports and fixtures must stay in a .local directory.'); process.exit(0);
  }
  const value = args[++i]; if (!value) throw Error('Missing value for ' + key);
  if (['--root', '--out', '--baseline'].includes(key)) options[key.slice(2)] = resolve(value);
  else if (key === '--cases') options.cases = value.split(',');
  else if (['--repeats', '--size', '--idle-ms'].includes(key)) options[key === '--idle-ms' ? 'idleMs' : key.slice(2)] = Number(value);
  else throw Error('Unknown option ' + key);
}
if (!options.out || !options.out.split(/[\\/]/).includes('.local')) throw Error('--out must be inside a .local directory');
if (!Number.isSafeInteger(options.repeats) || options.repeats < 1 || options.repeats > 100 || !Number.isSafeInteger(options.size) || options.size < 200 || options.size > 20000
  || !Number.isSafeInteger(options.idleMs) || options.idleMs < 0 || options.idleMs > 60000 || options.cases.some(name => !scenarioNames.includes(name))) throw Error('Invalid benchmark options');
if (options.cases.includes('browser-image')) {
  const require = createRequire(join(options.root, 'package.json'));
  const { chromium } = require('playwright');
  options.browserExecutable = chromium.executablePath();
}
await mkdir(dirname(options.out), { recursive: true });
const scratch = await mkdtemp(join(dirname(options.out), 'tool-perf-'));
const git = (...args) => { try { return execFileSync('git', ['-C', options.root, ...args], { encoding: 'utf8' }).trim(); } catch { return null; } };
const quantiles = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? { n: sorted.length, min: sorted[0], p50: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) } : null;
};
function processRows() {
  if (process.platform === 'win32') return null;
  try {
    return execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,lstart='], { encoding: 'utf8' }).trim().split('\n').map(line => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      return match && { pid: Number(match[1]), parent: Number(match[2]), rss: Number(match[3]) * 1024, started: match[4] };
    }).filter(Boolean);
  } catch { return null; }
}
function processTree(pid) {
  const rows = processRows(); if (!rows) return null;
  const owned = new Set([pid]); let changed = true;
  while (changed) { changed = false; for (const row of rows) if (owned.has(row.parent) && !owned.has(row.pid)) { owned.add(row.pid); changed = true; } }
  const selected = rows.filter(row => owned.has(row.pid));
  return { processCount: selected.length, rssBytes: selected.reduce((sum, row) => sum + row.rss, 0), members: selected };
}
let stopCurrent, interrupted = false;
const interrupt = () => { interrupted = true; stopCurrent?.(); };
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);

const harnessHash = hash(await Promise.all(['run.mjs', 'worker.mjs', 'scenarios.mjs', 'coverage.mjs', 'host-workflow.mjs'].map(file => readFile(new URL(file, import.meta.url), 'utf8'))));
const report = { schemaVersion: 1, harnessHash, kind: 'omd-tool-performance', source: { root: options.root, commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain'),
  hostVersion: JSON.parse(await readFile(join(options.root, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version },
  environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  workload: { version: 1, size: options.size, repeats: options.repeats, idleMs: options.idleMs }, startedAt: new Date().toISOString(), cases: [],
  interpretation: { scope: 'Direct cases: ToolRuntime entry to checked result. host-workflow: actual local protocol model, real main/child agents and complete goal/workflow turn. Neither measures external model or GUI latency.', cold: 'First measured operation after setup in a fresh process; setup imports modules and seeds state-tasks with a todo excerpt. Filesystem cache is uncontrolled.',
    firstStageResult: 'First completed named phase, not streamed model-visible output. firstEffectiveResultMs is the first top-level read/write receipt in Native compound workloads, host-workflow uses the first native tool-result event time; other cases use the complete non-streaming result. This is not GUI paint time.',
    stages: 'Nested inclusive spans; do not sum into total.', cpu: 'process.cpuUsage includes worker threads; descendant subprocess/browser CPU is unavailable (null).',
    memory: 'process resourceUsage high-water includes setup. Tree RSS is sampled every ~25ms; fast peaks/short-lived children can be missed, shared memory may be counted more than once.',
    equivalence: 'Full AST/article/search/MCP/image JSON hashes. Workflow normalizes workspace path, random evidence refs and receipt-dependent original-search through/cursor. AST archive hashes are verified against exact bytes, then recomputed with normalized paths. System/state cases hash explicitly asserted semantic fields, not volatile IDs/timestamps/versions.',
    unsupported: ['No external models, GUI or working DSH; detailed family limitations are in coverage.'], percentiles: 'Nearest-rank; small-sample p95 is descriptive only.' } };
try {
  for (const name of options.cases) {
    if (interrupted) throw Error('Benchmark interrupted');
    const begun = performance.now();
    const result = await new Promise((resolveCase, reject) => {
      const env = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'SystemRoot', 'WINDIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
      const directory = join(scratch, name); Object.assign(env, { HOME: directory, USERPROFILE: directory, TMPDIR: scratch, DSH_HOME: directory, DSH_TELEMETRY_DISABLED: '1' });
      const child = fork(fileURLToPath(new URL('./worker.mjs', import.meta.url)), [JSON.stringify({ ...options, name, directory })], { env, cwd: options.root,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'], detached: process.platform !== 'win32' });
      const observed = new Map();
      let value, failure, log = '', idle = false, peakTreeRssBytes = null, peakProcessCount = null, idleTree = null;
      const sample = () => { const tree = processTree(child.pid); if (!tree) return; for (const member of tree.members) if (member.pid !== child.pid) observed.set(member.pid, member.started); delete tree.members; peakTreeRssBytes = Math.max(peakTreeRssBytes ?? 0, tree.rssBytes); peakProcessCount = Math.max(peakProcessCount ?? 0, tree.processCount); if (idle) idleTree = tree; };
      const monitor = setInterval(sample, 25);
      const residues = () => (processRows() ?? []).filter(row => observed.get(row.pid) === row.started);
      const kill = () => { for (const row of residues()) { try { process.kill(row.pid, 'SIGKILL'); } catch {} } try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch {} };
      stopCurrent = () => { failure = Error('Benchmark interrupted'); kill(); };
      const watchdog = setTimeout(() => { failure = Error(`Case ${name} exceeded 180 seconds`); kill(); }, 180000);
      child.stdout.on('data', data => { log = (log + data).slice(-4000); }); child.stderr.on('data', data => { log = (log + data).slice(-4000); });
      child.on('message', message => { if (message.type === 'idle-start') idle = true; if (message.type === 'result') value = message.result; if (message.type === 'error') failure = Error(message.error); });
      child.on('error', error => { failure = error; });
      child.on('exit', (code, signal) => {
        clearInterval(monitor); clearTimeout(watchdog); stopCurrent = null;
        const residualDescendants = residues().map(row => row.pid); if (residualDescendants.length) kill();
        let residualGroup = null;
        if (process.platform !== 'win32') { try { process.kill(-child.pid, 0); residualGroup = true; kill(); } catch { residualGroup = false; } }
        if (failure || code !== 0 || !value || residualGroup || residualDescendants.length) reject(failure ?? Error(`${name}: exit=${code}/${signal}; residualGroup=${residualGroup}; descendants=${residualDescendants.length}; ${log}`));
        else resolveCase({ ...value, processWallMs: performance.now() - begun, resources: { peakTreeRssBytes, peakProcessCount, idleTree, residualGroup, residualDescendants }, log: log || null });
      });
    });
    const warm = result.samples.filter(sample => sample.mode === 'warm');
    result.summary = Object.fromEntries(['totalMs', 'firstEffectiveResultMs', 'firstStageResultMs', 'processCpuMs', 'treeCpuMs', 'eventLoopMaxDelayMs'].map(key => [key, quantiles(warm.map(sample => sample[key]))]));
    result.stableResults = new Set(result.samples.map(sample => sample.resultHash)).size === 1;
    if (!result.stableResults) process.exitCode = 1;
    report.cases.push(result); console.log(`${name}: warm p50 ${result.summary.totalMs.p50.toFixed(2)} ms, p95 ${result.summary.totalMs.p95.toFixed(2)} ms; stable=${result.stableResults}`);
  }
  if (options.baseline) {
    const before = JSON.parse(await readFile(options.baseline, 'utf8'));
    report.comparison = report.cases.map(after => {
      const baseline = before.cases.find(item => item.name === after.name);
      const compatible = baseline && before.harnessHash === report.harnessHash && before.workload.repeats === report.workload.repeats && baseline.fingerprint === after.fingerprint && before.workload.version === report.workload.version && before.workload.size === report.workload.size && before.workload.idleMs === report.workload.idleMs
        && JSON.stringify(before.environment) === JSON.stringify(report.environment) && before.source.hostVersion === report.source.hostVersion;
      const equivalent = compatible && baseline.stableResults && after.stableResults && baseline.samples[0].resultHash === after.samples[0].resultHash;
      return { name: after.name, comparable: Boolean(compatible), resultEquivalent: Boolean(equivalent), baselineCommit: before.source.commit,
        warmMedianRatio: equivalent ? after.summary.totalMs.p50 / baseline.summary.totalMs.p50 : null };
    });
    if (report.comparison.some(item => !item.resultEquivalent)) process.exitCode = 1;
  }
} catch (error) { report.error = error.stack ?? String(error); process.exitCode = 1; }
finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); report.coverage = coverage.map(row => ({ ...row, completedCases: row.cases.filter(name => report.cases.some(item => item.name === name)), status: row.cases.some(name => report.cases.some(item => item.name === name)) ? 'partial-measured' : 'not-measured' })); report.finishedAt = new Date().toISOString(); await writeFile(options.out, JSON.stringify(report, null, 2) + '\n'); await rm(scratch, { recursive: true, force: true }); }
if (report.error) console.error(report.error);
