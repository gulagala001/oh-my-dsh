import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { SimulationHost, cleanEnvironment } from '../scripts/simulator/host.mjs';
import { ProcessMonitor } from '../scripts/simulator/processes.mjs';

const execute = promisify(execFile);
const clockPreload = new URL('../scripts/simulator/clock-preload.mjs', import.meta.url).href;
const faultPreload = new URL('../scripts/simulator/fault-preload.mjs', import.meta.url).href;
const processGate = new URL('../scripts/simulator/process-gate.sh', import.meta.url).pathname;
const windowsSkip = process.platform === 'win32' ? 'These checks require POSIX process groups and ps; Windows taskkill/PTY behavior is not verified here.' : false;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

async function poll(fn, description, timeout = 3000) {
  const deadline = performance.now() + timeout;
  do {
    const value = await fn();
    if (value) return value;
    await sleep(15);
  } while (performance.now() < deadline);
  throw new Error('Timed out: ' + description);
}

async function processRows() {
  const { stdout } = await execute('ps', ['-axo', 'pid=,ppid=,pgid=,stat=,command=']);
  return stdout.trim().split('\n').map(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    return match && { pid: +match[1], ppid: +match[2], pgid: +match[3], stat: match[4], command: match[5] };
  }).filter(Boolean);
}

function kill(pid, group = false) {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return;
  try { process.kill(group ? -pid : pid, 'SIGKILL'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

async function fixture(t) {
  const container = realpathSync(await fs.mkdtemp(join(tmpdir(), 'omd-process-test-')));
  const root = join(container, 'root');
  const outside = join(container, 'outside');
  await fs.mkdir(root); await fs.mkdir(outside);
  const host = new SimulationHost({ root, provider: { baseURL: 'http://127.0.0.1:1/v1', errors: [] }, clock: 'real', isolation: 'process' });
  for (const directory of [host.home, host.workspace, join(root, 'tmp')]) await fs.mkdir(directory);
  await fs.writeFile(host.hostTrace, '');
  await fs.writeFile(join(root, 'network.jsonl'), '');
  const state = { host, root, outside, groups: new Set(), pids: new Set(), children: [] };
  t.after(async () => {
    // Never rely on the method under test to clean up a failed assertion. The
    // fixture path in each owned command also finds an unrecorded orphan.
    if (host.child?.pid) state.groups.add(host.child.pid);
    for (const row of await processRows()) if (row.command.includes(root) && row.pid !== process.pid) {
      state.pids.add(row.pid);
      if (row.pgid === row.pid) state.groups.add(row.pgid);
    }
    for (const group of state.groups) kill(group, true);
    for (const pid of state.pids) kill(pid);
    for (const child of state.children) {
      child.stdout?.destroy(); child.stderr?.destroy(); child.stdio?.[9]?.destroy(); child.unref();
    }
    if (host.child) {
      host.child.stdout?.destroy(); host.child.stderr?.destroy(); host.child.unref();
    }
    try {
      await poll(async () => !(await processRows()).some(row => !row.stat.startsWith('Z')
        && (state.pids.has(row.pid) || state.groups.has(row.pgid) || row.command.includes(root))), 'fixture process cleanup');
    } finally {
      await host.monitor?.stop({ crash: true }).catch(() => {});
      await host.close().catch(() => {});
      if (host.extensionDirectory) await fs.rm(host.extensionDirectory, { recursive: true, force: true });
      await fs.rm(container, { recursive: true, force: true });
    }
  });
  return state;
}

async function runningOwned(state) {
  // Do not print unrelated ps command lines: they may contain user material.
  return (await processRows()).filter(row => !row.stat.startsWith('Z')
    && (state.pids.has(row.pid) || state.groups.has(row.pgid) || row.command.includes(state.root)))
    .map(({ pid, ppid, pgid, stat }) => ({ pid, ppid, pgid, stat }));
}

async function noRunning(state) {
  let rows;
  try { await poll(async () => (rows = await runningOwned(state)).length === 0, 'stop reaps every running owned process', 2000); }
  catch { assert.deepEqual(rows, [], 'Running descendants remain after stop'); }
}

function managed(state, source, { command = process.execPath, prefix = [], gatePath = processGate } = {}) {
  const args = [...prefix, '--import', clockPreload, '--import', faultPreload, '--input-type=module', '--eval', source, state.root];
  const child = spawn(command, args, { cwd: state.host.workspace,
    env: { ...cleanEnvironment(state.root, state.host.home), ...(state.ackDirectory ? {
      OMD_SIM_PROCESS_GATE: gatePath, OMD_SIM_ACK_DIR: state.ackDirectory, OMD_SIM_MONITOR_FD: '9',
    } : {}) }, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'pipe'] });
  state.children.push(child);
  if (child.pid) { state.pids.add(child.pid); state.groups.add(child.pid); }
  let stdout = '', stderr = '';
  child.stdout.on('data', bytes => { stdout += String(bytes); });
  child.stderr.on('data', bytes => { stderr = (stderr + String(bytes)).slice(-3000); });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  return { child, done };
}

function leaf(role) {
  return `import fs from 'node:fs';
    const root = process.argv.at(-1);
    process.on('SIGTERM', () => fs.appendFileSync(root + '/ignored-term.jsonl', JSON.stringify({ pid: process.pid }) + '\\n'));
    setInterval(() => {}, 1000);
    fs.writeFileSync(root + '/${role}.json', JSON.stringify({ pid: process.pid, parentPid: process.ppid }));`;
}

function controller(mode) {
  const leafSource = leaf('leaf');
  const shell = `${shellQuote(process.execPath)} --input-type=module --eval ${shellQuote(leafSource)} "$1" >/dev/null 2>&1 &
    while [ ! -f "$1/leaf.json" ]; do sleep 0.01; done`;
  return `import fs from 'node:fs'; import { spawn } from 'node:child_process';
    const root = process.argv.at(-1);
    const launch = detached => spawn(process.execPath, ['--input-type=module', '--eval', ${JSON.stringify(leafSource)}, root], { detached, stdio: 'ignore' });
    const ready = extra => fs.writeFileSync(root + '/leader.json', JSON.stringify({ pid: process.pid, clock: globalThis[Symbol.for('omd.simulation.clock')].snapshot().mode,
      faultRoot: globalThis[Symbol.for('omd.simulation.faults')].snapshot().root, ...extra }));
    const waitLeaf = async () => { while (!fs.existsSync(root + '/leaf.json')) await new Promise(resolve => setTimeout(resolve, 5)); };
    if (${JSON.stringify(mode)} === 'late-detached') {
      process.on('SIGTERM', () => { try { launch(true); } catch (error) {
        fs.writeFileSync(root + '/shutdown-refused.json', JSON.stringify({ message: error.message })); }
        process.exit(0); });
      ready({});
    } else {
      process.on('SIGTERM', () => process.exit(0));
      if (${JSON.stringify(mode)} === 'detached-exited') {
        const tool = spawn('/bin/sh', ['-c', ${JSON.stringify(shell)}, 'simulation-tool', root], { detached: true, stdio: 'ignore' });
        await new Promise(resolve => tool.once('exit', resolve));
        ready({ toolPid: tool.pid });
      } else {
        const descendant = launch(${JSON.stringify(mode === 'detached')});
        await waitLeaf();
        ready({ childPid: descendant.pid });
        if (${JSON.stringify(mode)} === 'leader-exited') { descendant.unref(); process.exit(0); }
      }
    }
    setInterval(() => {}, 1000);`;
}

async function topology(t, mode) {
  const state = await fixture(t);
  const monitor = await monitorFor(state, t);
  const run = managed(state, controller(mode));
  state.host.child = run.child;
  state.host.boots = 1;
  await monitor.attach(run.child);
  const leader = await poll(async () => {
    try { return JSON.parse(await fs.readFile(join(state.root, 'leader.json'), 'utf8')); }
    catch (error) { if (!['ENOENT', 'SyntaxError'].includes(error.code ?? error.name)) throw error; }
  }, 'controller boot');
  assert.equal(leader.clock, 'real');
  assert.equal(leader.faultRoot, state.root);
  if (leader.toolPid) state.groups.add(leader.toolPid);
  if (mode !== 'late-detached') {
    const descendant = JSON.parse(await fs.readFile(join(state.root, 'leaf.json'), 'utf8'));
    state.pids.add(descendant.pid);
    if (mode === 'detached') state.groups.add(descendant.pid);
    assert.ok((await runningOwned(state)).some(row => row.pid === descendant.pid));
  }
  if (mode === 'leader-exited') assert.equal((await run.done).code, 0);
  return { ...state, run, leader };
}

async function monitorFor(state, t) {
  state.ackDirectory = await fs.mkdtemp(join(tmpdir(), 'omd-trusted-acks-'));
  t.after(async () => { await fs.rm(state.ackDirectory, { recursive: true, force: true }); });
  const monitor = new ProcessMonitor({ ackDirectory: state.ackDirectory });
  state.host.monitor = monitor;
  return monitor;
}

for (const crash of [false, true]) {
  for (const mode of ['same-group', 'leader-exited', 'detached', 'detached-exited']) {
    test(`stop ${crash ? 'crash' : 'graceful'} reaps ${mode} SIGTERM-ignoring descendants`, { skip: windowsSkip, timeout: 12000 }, async t => {
      const state = await topology(t, mode);
      const audit = await state.host.audit();
      assert.ok(audit.processes.some(event => event.type === 'process/spawn'));
      if (mode === 'detached-exited') assert.ok(audit.processes.some(event => event.type === 'process/exit' && event.pid === state.leader.toolPid));
      await state.host.stop({ crash });
      await noRunning(state);
      assert.equal(state.host.child, null);
    });
  }
}

test('graceful stop refuses and reaps a gated child spawned by the SIGTERM shutdown handler', { skip: windowsSkip, timeout: 12000 }, async t => {
  const state = await topology(t, 'late-detached');
  assert.deepEqual((await state.host.audit()).processes, []);
  await state.host.stop();
  const refusal = JSON.parse(await fs.readFile(join(state.root, 'shutdown-refused.json'), 'utf8'));
  assert.match(refusal.message, /stopping|refused/i);
  assert.ok(state.host.monitor.snapshot().events.some(event => event.type === 'process/blocked-during-stop'));
  await assert.rejects(fs.stat(join(state.root, 'leaf.json')), { code: 'ENOENT' });
  await noRunning(state);
});

test('a pending gate recognizes shutdown recovery ACK after its first OS observation and child exit', { skip: windowsSkip, timeout: 12000 }, async t => {
  const state = await fixture(t), monitor = await monitorFor(state, t);
  const gatePath = join(state.root, 'delayed-process-gate.sh');
  const release = join(state.root, 'allow-gate-stop');
  await fs.writeFile(gatePath, `#!/bin/sh
printf '{"type":"process/gated","pid":%s,"parentPid":%s,"file":"gate","detached":false}\\n' "$$" "$PPID" >&9
while [ ! -f "$OMD_SIM_ROOT/allow-gate-stop" ]; do sleep 0.01; done
kill -STOP "$$"
exec "$@"
`, { mode: 0o700 });
  const run = managed(state, controller('late-detached'), { gatePath });
  state.host.child = run.child; state.host.boots = 1;
  await monitor.attach(run.child);
  await poll(async () => {
    try { return JSON.parse(await fs.readFile(join(state.root, 'leader.json'), 'utf8')); }
    catch (error) { if (!['ENOENT', 'SyntaxError'].includes(error.code ?? error.name)) throw error; }
  }, 'controller boot');

  const actualRead = monitor._readProcesses.bind(monitor), actualTimeout = monitor._timeout;
  let targetPid, interleaved = false, interleaveError;
  monitor._readProcesses = async () => {
    const rows = await actualRead();
    if (monitor._stopping && !targetPid) {
      const row = [...rows.values()].find(row => row.ppid === run.child.pid && !row.stat.startsWith('T') && !monitor._records.has(row.pid));
      if (row) { targetPid = row.pid; state.pids.add(row.pid); state.groups.add(row.pgid); }
    }
    return rows;
  };
  monitor._timeout = (callback, delay, ...args) => {
    if (delay !== 5 || !targetPid || interleaved) return actualTimeout(callback, delay, ...args);
    interleaved = true;
    // Hold only _gated's retry: all snapshots and signals remain real. Recovery
    // takes another serialized OS observation before the queued frame retries.
    return actualTimeout(async () => {
      try {
        assert.equal(monitor._records.has(targetPid), false);
        await fs.writeFile(release, 'stop');
        await poll(async () => (await actualRead()).get(targetPid)?.stat.startsWith('T'), 'actual child SIGSTOP');
        await monitor._withRows(rows => monitor._recoverStopped(rows));
        const recovered = monitor._records.get(targetPid), ack = monitor._acks.get(targetPid);
        assert.equal(recovered.kind, 'gated'); assert.equal(recovered.recovered, true); assert.equal(recovered.frameSeen, false);
        assert.equal(ack.parentPid, run.child.pid); assert.equal(ack.value.ok, false);
        await poll(async () => {
          const row = (await actualRead()).get(targetPid);
          return !row || /^[ZX]/.test(row.stat);
        }, 'recovered child exit before gate retry');
      } catch (error) { interleaveError = error; }
      finally { callback(...args); }
    }, delay);
  };
  try { await state.host.stop(); }
  finally { monitor._readProcesses = actualRead; monitor._timeout = actualTimeout; }
  assert.ifError(interleaveError);
  assert.equal(interleaved, true, 'the real child was observed before SIGSTOP and recovered before retry');
  assert.equal(monitor._records.get(targetPid).frameSeen, true);
  assert.equal(monitor._acks.get(targetPid).value.ok, false, 'ACK replay cannot turn shutdown refusal into spawn permission');
  assert.equal(monitor.assertHealthy(), true);
  assert.ok(monitor.snapshot().groups.every(group => group.retired));
  const refusal = JSON.parse(await fs.readFile(join(state.root, 'shutdown-refused.json'), 'utf8'));
  assert.match(refusal.message, /stopping|refused/i);
  await assert.rejects(fs.stat(join(state.root, 'leaf.json')), { code: 'ENOENT' });
  await noRunning(state);
});

test('macOS stale live-group snapshot survives actual EPERM after only its zombie leader remains', {
  skip: process.platform !== 'darwin' ? 'The zombie-only negative-PGID EPERM mechanism is verified on macOS only.' : false,
  timeout: 12000,
}, async t => {
  const state = await fixture(t), monitor = await monitorFor(state, t);
  const release = join(state.root, 'release-owned-group');
  const child = spawn('/bin/sh', ['-c', 'printf ready; while [ ! -f "$1" ]; do sleep 0.01; done', 'owned-group', release], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  state.children.push(child); state.pids.add(child.pid); state.groups.add(child.pid);
  const exited = once(child, 'exit');
  await once(child.stdout, 'data');
  const stale = await monitor._readProcesses(), row = stale.get(child.pid);
  assert.equal(row.ppid, process.pid); assert.equal(row.pgid, child.pid); assert.ok(!/^[ZX]/.test(row.stat));
  monitor._register(row, 'root');
  const group = monitor._groups.get(child.pid);
  // Keep this parent's event loop blocked until ps observes the real zombie:
  // an asynchronous wait would let libuv reap it and turn EPERM into ESRCH.
  writeFileSync(release, 'exit');
  const deadline = performance.now() + 3000;
  let status = '';
  do {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    status = execFileSync('ps', ['-p', String(child.pid), '-o', 'stat='], { encoding: 'utf8' }).trim();
  } while (!status.startsWith('Z') && performance.now() < deadline);
  assert.match(status, /^Z/, 'the owned group leader actually exited but has not been reaped');
  assert.throws(() => process.kill(-child.pid, 'SIGKILL'), { code: 'EPERM' });
  let freshReads = 0;
  const actualRead = monitor._readProcesses.bind(monitor);
  monitor._readProcesses = async () => { freshReads++; return actualRead(); };
  assert.equal(await monitor._signalGroup(group, stale, 'SIGKILL'), false);
  assert.equal(freshReads, 1, 'EPERM requires a new external OS observation');
  assert.equal(group.retired, true); assert.deepEqual(group.members, []);
  assert.equal(monitor.assertHealthy(), true);
  await exited; await noRunning(state);
});

async function ownedSignalGroup(t) {
  const state = await fixture(t), monitor = await monitorFor(state, t);
  const child = await sentinel(t, state.root);
  state.pids.add(child.pid); state.groups.add(child.pid);
  const rows = await monitor._readProcesses(), row = rows.get(child.pid);
  assert.equal(row.ppid, process.pid); assert.equal(row.pgid, child.pid);
  monitor._register(row, 'root');
  return { state, monitor, child, rows, group: monitor._groups.get(child.pid) };
}

async function rejectOwnedGroupSignal(monitor, group, rows) {
  const originalKill = process.kill;
  const denied = Object.assign(new Error('fixture signal permission denied'), { code: 'EPERM' });
  let attempts = 0;
  process.kill = function (pid, signal) {
    if (pid === -group.pgid && signal === 'SIGKILL') { attempts++; throw denied; }
    return originalKill.call(this, pid, signal);
  };
  try {
    await assert.rejects(monitor._signalGroup(group, rows, 'SIGKILL'), error => {
      assert.equal(error.code, 'EPERM'); assert.equal(error.cause, denied);
      assert.ok(error.message.includes('SIGKILL')); assert.ok(error.message.includes(String(group.pgid)));
      return true;
    });
  } finally { process.kill = originalKill; }
  assert.equal(attempts, 1, 'only the owned group signal was denied, without retrying');
}

test('EPERM remains a failure when a fresh real OS snapshot still has live owned-group members', { skip: windowsSkip, timeout: 12000 }, async t => {
  const { monitor, child, rows, group } = await ownedSignalGroup(t);
  const actualRead = monitor._readProcesses.bind(monitor);
  let freshReads = 0;
  monitor._readProcesses = async () => { freshReads++; return actualRead(); };
  await rejectOwnedGroupSignal(monitor, group, rows);
  assert.equal(freshReads, 1); assert.equal(group.retired, false); assert.equal(group.unsafe, false);
  assert.ok((await processRows()).some(row => row.pid === child.pid && !row.stat.startsWith('Z')));
});

test('EPERM still rejects a group whose fresh leader identity changed even with no reported live members', { skip: windowsSkip, timeout: 12000 }, async t => {
  const { monitor, child, rows, group } = await ownedSignalGroup(t);
  const actualRead = monitor._readProcesses.bind(monitor);
  let freshReads = 0;
  // The child remains genuinely alive. Only its fresh reported birth and state
  // are corrupted to check that a no-live observation cannot bypass identity.
  monitor._readProcesses = async () => {
    freshReads++;
    const fresh = await actualRead(), row = fresh.get(child.pid);
    fresh.set(child.pid, { ...row, birth: 'Thu Jan 1 00:00:00 1970', stat: 'Z' });
    return fresh;
  };
  await rejectOwnedGroupSignal(monitor, group, rows);
  assert.equal(freshReads, 1); assert.equal(group.unsafe, true);
  assert.throws(() => monitor.assertHealthy(), /identity/);
  assert.ok((await processRows()).some(row => row.pid === child.pid && !row.stat.startsWith('Z')));
});

test('stop surfaces a damaged spawn audit instead of silently claiming successful cleanup', { skip: windowsSkip, timeout: 12000 }, async t => {
  const state = await topology(t, 'detached');
  await fs.appendFile(join(state.root, 'network.jsonl'), '{"type":');
  await assert.rejects(state.host.audit(), SyntaxError);
  await assert.rejects(state.host.stop({ crash: true }), /audit|JSON|Unexpected|position/i);
  await noRunning(state);
  assert.equal(state.host.monitor.assertHealthy(), true);
});

test('a failed spawn-audit append cannot leave an unreturned detached child running', { skip: windowsSkip, timeout: 12000 }, async t => {
  const state = await fixture(t);
  const monitor = await monitorFor(state, t);
  const source = `import assert from 'node:assert/strict'; import fs from 'node:fs'; import { spawn } from 'node:child_process';
    const root = process.argv.at(-1);
    fs.rmSync(root + '/network.jsonl'); fs.mkdirSync(root + '/network.jsonl');
    assert.throws(() => spawn(process.execPath, ['--input-type=module', '--eval', ${JSON.stringify(leaf('leaf'))}, root],
      { detached: true, stdio: 'ignore' }), { code: 'EISDIR' });
    console.log(JSON.stringify({ rejected: true })); process.exit(0);`;
  const run = managed(state, source);
  await monitor.attach(run.child);
  const result = await run.done;
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { rejected: true });
  await monitor.stop({ crash: true });
  await noRunning(state);
});

async function sentinel(t, marker) {
  const child = spawn(process.execPath, ['--input-type=module', '--eval', "console.log('ready'); setInterval(() => {}, 1000);", marker], {
    detached: true, env: { PATH: process.env.PATH, LANG: 'C', NODE_OPTIONS: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { kill(child.pid, true); child.stdout.destroy(); child.stderr.destroy(); child.unref(); });
  await once(child.stdout, 'data');
  return child;
}

test('forged writable audit and non-gated channel events cannot kill an independent sentinel', { skip: windowsSkip, timeout: 12000 }, async t => {
  const state = await topology(t, 'same-group');
  const independent = await sentinel(t, state.outside);
  const forged = { type: 'process/spawn', pid: independent.pid, parentPid: state.run.child.pid, detached: true, file: 'forged' };
  await fs.appendFile(join(state.root, 'network.jsonl'), JSON.stringify(forged) + '\n');
  await fs.appendFile(state.host.hostTrace, JSON.stringify({ ...forged, type: 'process/pty-spawn' }) + '\n');
  await state.host.stop({ crash: true });
  assert.ok((await processRows()).some(row => row.pid === independent.pid && !row.stat.startsWith('Z')));
  assert.ok(!state.host.monitor.snapshot().processes.some(row => row.pid === independent.pid));
  await noRunning(state);
});

test('a forged gated PID is rejected by actual PPID without signaling an unrelated sentinel', { skip: windowsSkip, timeout: 12000 }, async t => {
  const state = await fixture(t);
  const independent = await sentinel(t, state.outside);
  const monitor = await monitorFor(state, t);
  const run = managed(state, `import fs from 'node:fs';
    fs.writeSync(9, JSON.stringify({ type: 'process/gated', pid: ${independent.pid}, parentPid: process.pid, detached: true }) + '\\n');
    setInterval(() => {}, 1000);`);
  await monitor.attach(run.child);
  await poll(() => monitor.snapshot().errors.length, 'forged gate rejection');
  assert.throws(() => monitor.assertHealthy(), /verified current OS parent/);
  await assert.rejects(monitor.stop({ crash: true }), /verified current OS parent/);
  assert.ok((await processRows()).some(row => row.pid === independent.pid && !row.stat.startsWith('Z')));
  assert.ok(!monitor.snapshot().processes.some(row => row.pid === independent.pid));
  await noRunning(state);
});

test('a truncated trusted-channel frame causes explicit failure and still cleans verified groups', { skip: windowsSkip, timeout: 12000 }, async t => {
  const state = await fixture(t);
  const monitor = await monitorFor(state, t);
  const run = managed(state, `import fs from 'node:fs'; fs.writeSync(9, '{"type":"process/gated"'); setInterval(() => {}, 1000);`);
  await monitor.attach(run.child);
  await sleep(50);
  await assert.rejects(monitor.stop(), /truncated|JSON/i);
  await noRunning(state);
});

test('OS birth-identity mismatch negative control refuses signals and reports failure', { skip: windowsSkip, timeout: 12000 }, async t => {
  const state = await topology(t, 'same-group');
  const independent = await sentinel(t, state.outside);
  const monitor = state.host.monitor;
  const actualRead = monitor._readProcesses.bind(monitor);
  // Real processes and signals; only the reported OS birth is deliberately
  // changed. This does not claim the kernel actually reused a PID in the test.
  monitor._readProcesses = async () => {
    const rows = await actualRead();
    const root = rows.get(state.run.child.pid);
    if (root) rows.set(root.pid, { ...root, birth: 'Thu Jan 1 00:00:00 1970' });
    return rows;
  };
  await assert.rejects(state.host.stop({ crash: true }), /identity|unknown/i);
  const rows = await processRows();
  assert.ok(rows.some(row => row.pid === state.run.child.pid && !row.stat.startsWith('Z')));
  assert.ok(rows.some(row => row.pid === independent.pid && !row.stat.startsWith('Z')));
});

test('spawnSync/execFileSync/execSync children are externally gated and duplicate frames are idempotent', { skip: windowsSkip, timeout: 12000 }, async t => {
  const state = await fixture(t);
  const monitor = await monitorFor(state, t);
  const run = managed(state, `import assert from 'node:assert/strict'; import { spawnSync, execFileSync, execSync } from 'node:child_process';
    const a = spawnSync('/bin/echo', ['sync-spawn'], { encoding: 'utf8' }); assert.equal(a.status, 0); assert.equal(a.stdout.trim(), 'sync-spawn');
    assert.equal(execFileSync('/bin/echo', ['sync-file'], { encoding: 'utf8' }).trim(), 'sync-file');
    assert.equal(execSync('printf sync-shell', { encoding: 'utf8' }), 'sync-shell');
    console.log(JSON.stringify({ sync: true })); process.exit(0);`);
  await monitor.attach(run.child);
  const result = await run.done;
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { sync: true });
  await monitor.stop({ crash: true });
  assert.equal(monitor.snapshot().processes.filter(row => row.kind === 'gated').length, 3);
  assert.equal(monitor.assertHealthy(), true);
  await noRunning(state);
});

test('spawnSync and execFileSync shell:true detached commands retain real shell semantics behind one verified gate', { skip: windowsSkip, timeout: 12000 }, async t => {
  const state = await fixture(t);
  const monitor = await monitorFor(state, t);
  const run = managed(state, `import assert from 'node:assert/strict'; import { spawnSync, execFileSync } from 'node:child_process';
    const args = ['first; /bin/echo second'];
    const a = spawnSync('/bin/echo', args, { shell: true, detached: true, encoding: 'utf8' });
    assert.equal(a.status, 0); assert.equal(a.stdout, 'first\\nsecond\\n');
    assert.equal(execFileSync('/bin/echo', args, { shell: true, detached: true, encoding: 'utf8' }), 'first\\nsecond\\n');
    console.log(JSON.stringify({ shell: true })); process.exit(0);`);
  await monitor.attach(run.child);
  const result = await run.done;
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { shell: true });
  await monitor.stop({ crash: true });
  assert.equal(monitor.snapshot().processes.filter(row => row.kind === 'gated').length, 2);
  assert.equal(monitor.snapshot().groups.length, 3);
  assert.equal(monitor.assertHealthy(), true);
  await noRunning(state);
});

test('rapid asynchronous zero-duration commands preserve duplicate ACKs through exit/zombie races', { skip: windowsSkip, timeout: 20000 }, async t => {
  const state = await fixture(t);
  const monitor = await monitorFor(state, t);
  const run = managed(state, `import assert from 'node:assert/strict'; import { spawn } from 'node:child_process';
    for (let index = 0; index < 24; index++) await new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/true', [], { detached: index % 2 === 0, stdio: 'ignore' });
      child.once('error', reject); child.once('exit', code => { assert.equal(code, 0); resolve(); });
    }); console.log(JSON.stringify({ count: 24 })); process.exit(0);`);
  await monitor.attach(run.child);
  const result = await run.done;
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { count: 24 });
  await monitor.stop({ crash: true });
  assert.equal(monitor.snapshot().processes.filter(row => row.kind === 'gated').length, 24);
  assert.equal(monitor.assertHealthy(), true);
  assert.ok(monitor.snapshot().groups.every(group => group.retired));
  await noRunning(state);
});

test('cleanEnvironment removes fake credentials and uses only independent simulation paths', { skip: windowsSkip }, async t => {
  const state = await fixture(t);
  const names = ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'OMD_SIM_TEST_FAKE_KEY'];
  const prior = names.map(name => [name, process.env[name]]);
  try {
    for (const name of names) process.env[name] = 'fake-test-only';
    const env = cleanEnvironment(state.root, state.host.home);
    for (const name of names) assert.ok(!Object.hasOwn(env, name));
    assert.equal(env.HOME, state.host.home);
    assert.equal(env.DSH_HOME, state.host.home);
    assert.equal(env.OMD_SIM_ROOT, state.root);
    assert.equal(env.OMD_SIM_AUDIT, join(state.root, 'network.jsonl'));
    assert.ok(env.NODE_OPTIONS.includes('network-guard.mjs'));
  } finally {
    for (const [name, value] of prior) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

async function localHttp(t) {
  let providerRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/v1')) providerRequests++;
    response.end('loopback verified');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { url: 'http://127.0.0.1:' + server.address().port, providerRequests: () => providerRequests };
}

test('preloaded standard fetch/net reject reserved external destinations and permit actual loopback traffic', { skip: windowsSkip, timeout: 12000 }, async t => {
  const state = await fixture(t);
  const local = await localHttp(t);
  const tcp = net.createServer(socket => socket.end('local tcp'));
  tcp.listen(0, '127.0.0.1'); await once(tcp, 'listening');
  t.after(async () => { await new Promise(resolve => tcp.close(resolve)); });
  const run = managed(state, `import assert from 'node:assert/strict'; import net from 'node:net';
    for (const key of ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'OMD_SIM_TEST_FAKE_KEY']) assert.ok(!Object.hasOwn(process.env, key));
    for (const url of ['https://203.0.113.1/test', 'https://example.invalid/test']) await assert.rejects(fetch(url), { code: 'OMD_SIM_NETWORK_DENIED' });
    for (const host of ['198.51.100.1', 'example.invalid']) assert.throws(() => net.createConnection({ host, port: 443 }), { code: 'OMD_SIM_NETWORK_DENIED' });
    assert.equal(await (await fetch(${JSON.stringify(local.url)})).text(), 'loopback verified');
    const text = await new Promise((resolve, reject) => { let value = ''; const socket = net.createConnection({ host: '127.0.0.1', port: ${tcp.address().port} });
      socket.on('data', bytes => { value += bytes; }); socket.on('end', () => resolve(value)); socket.on('error', reject); });
    assert.equal(text, 'local tcp'); console.log(JSON.stringify({ loopback: true })); process.exit(0);`);
  const result = await run.done;
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { loopback: true });
  const audit = await state.host.audit();
  assert.equal(audit.network.length, 4);
  assert.ok(audit.network.every(event => event.type === 'network/denied' && event.pid === run.child.pid));
  await noRunning(state);
});

test('actual DSH native startup policy permits in-root writes/loopback and denies independent out-of-root writes without a model request',
  { skip: process.platform !== 'darwin' ? 'Native isolation here is the real macOS sandbox-exec policy; other OS and PTY coverage are not claimed.' : false, timeout: 60000 }, async t => {
    const state = await fixture(t);
    const local = await localHttp(t);
    state.host.provider.baseURL = local.url + '/v1';
    state.host.isolation = 'native';
    await state.host.prepare();
    await state.host.start();
    state.groups.add(state.host.child.pid); state.pids.add(state.host.child.pid);
    assert.equal((await state.host.control('/clock')).mode, 'real');
    assert.ok((await state.host.audit()).host.some(event => event.type === 'simulation/instrumented'));
    const witness = join(state.outside, 'witness');
    const forbiddenNew = join(state.outside, 'forbidden-new');
    await fs.writeFile(witness, 'outside unchanged');
    // Reuse the exact profile passed by SimulationHost.start, rather than a
    // second test-only sandbox profile that might conceal a runner defect.
    const profile = state.host.child.spawnargs[2];
    assert.equal(state.host.child.spawnargs[1], '-p');
    const run = managed(state, `import assert from 'node:assert/strict'; import fs from 'node:fs';
      fs.writeFileSync(${JSON.stringify(join(state.host.workspace, 'native-proof'))}, 'native write verified');
      for (const path of [${JSON.stringify(witness)}, ${JSON.stringify(forbiddenNew)}]) assert.throws(() => fs.writeFileSync(path, 'blocked'), error => ['EPERM', 'EACCES'].includes(error.code));
      assert.equal(await (await fetch(${JSON.stringify(local.url + '/proof')})).text(), 'loopback verified');
      console.log(JSON.stringify({ nativeWrites: true })); process.exit(0);`, { command: '/usr/bin/sandbox-exec', prefix: ['-p', profile, process.execPath] });
    const result = await run.done;
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { nativeWrites: true });
    assert.equal(await fs.readFile(witness, 'utf8'), 'outside unchanged');
    assert.equal(await fs.readFile(join(state.host.workspace, 'native-proof'), 'utf8'), 'native write verified');
    await assert.rejects(fs.stat(forbiddenNew), { code: 'ENOENT' });
    assert.equal(local.providerRequests(), 0);
    await state.host.stop();
    await noRunning(state);
  });
