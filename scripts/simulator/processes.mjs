import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpathSync, statSync } from 'node:fs';
import { writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout, clearTimeout, setImmediate } from 'node:timers';
import { performance } from 'node:perf_hooks';

const execute = promisify(execFile);
const validPid = value => Number.isSafeInteger(value) && value > 1;
const running = row => !row.stat.startsWith('Z') && !row.stat.startsWith('X');
const birthMillis = value => Date.parse(value.replace(/\s+/g, ' '));

/** External POSIX ownership monitor. Writable audit logs never authorize signals. */
export class ProcessMonitor {
  constructor({ ackDirectory, trace = () => {} }) {
    if (process.platform === 'win32') throw new Error('ProcessMonitor requires POSIX process groups and ps');
    this.ackDirectory = realpathSync(ackDirectory);
    if (!statSync(this.ackDirectory).isDirectory()) throw new TypeError('ackDirectory must be an existing trusted directory');
    if (typeof trace !== 'function') throw new TypeError('trace must be a function');
    this.bootId = randomUUID();
    this.trace = trace;
    this._records = new Map(); this._groups = new Map(); this._acks = new Map(); this._errors = []; this._events = [];
    this._osQueue = Promise.resolve(); this._queue = Promise.resolve(); this._buffer = '';
    this._attached = false; this._stopping = false; this._closed = false; this._pending = 0;
    const native = globalThis[Symbol.for('omd.simulation.clock')]?.realTimers;
    this._timeout = native?.setTimeout ?? setTimeout;
    this._clearTimeout = native?.clearTimeout ?? clearTimeout;
  }

  _event(event) {
    const item = { bootId: this.bootId, ...event };
    this._events.push(item);
    try { this.trace(item); } catch (error) { this._fail('SIM_PROCESS_TRACE', error.message); }
  }

  _fail(code, message) {
    if (!this._errors.some(error => error.code === code && error.message === message)) this._errors.push({ code, message });
  }

  assertHealthy() {
    if (this._errors.length) throw Object.assign(new Error(this._errors.map(error => error.message).join('; ')), {
      code: this._errors[0].code, errors: structuredClone(this._errors),
    });
    return true;
  }

  async _readProcesses() {
    const { stdout } = await execute('ps', ['-A', '-o', 'pid=,ppid=,pgid=,lstart=,stat='], {
      env: { ...process.env, LANG: 'C', LC_ALL: 'C' }, timeout: 1000, maxBuffer: 4 * 1024 * 1024,
    });
    const rows = new Map();
    for (const line of stdout.split('\n').filter(line => line.trim())) {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s*$/);
      if (!match) throw new Error('Cannot parse external ps ownership snapshot');
      const row = { pid: +match[1], ppid: +match[2], pgid: +match[3], birth: match[4].replace(/\s+/g, ' '), stat: match[5] };
      if (!Number.isFinite(birthMillis(row.birth))) throw new Error('Invalid external ps birth time');
      rows.set(row.pid, row);
    }
    return rows;
  }

  _refresh(rows) {
    for (const record of this._records.values()) {
      const row = rows.get(record.pid);
      if (row && (row.birth !== record.birth || row.pgid !== record.pgid) || row && running(row) && record.retired) {
        record.unsafe = true;
        this._fail('SIM_PROCESS_IDENTITY', `Verified process ${record.pid} changed OS identity`);
        const group = this._groups.get(record.pgid); if (group) group.unsafe = true;
      } else if (!row || !running(row)) record.retired = true;
    }
    for (const group of this._groups.values()) {
      if (group.retired) continue;
      const leader = rows.get(group.pgid);
      if (leader && (leader.birth !== group.birth || leader.pgid !== group.pgid)) {
        group.unsafe = true;
        this._fail('SIM_PROCESS_IDENTITY', `Verified group ${group.pgid} has a different leader identity`);
      }
      const members = [...rows.values()].filter(row => row.pgid === group.pgid && running(row));
      if (!members.length) { group.retired = true; group.members = []; continue; }
      for (const row of members) {
        const previous = group.seen.get(row.pid);
        if (previous && (previous.birth !== row.birth || previous.retired)) {
          group.unsafe = true;
          this._fail('SIM_PROCESS_IDENTITY', `Group ${group.pgid} member ${row.pid} may have reused a PID`);
        }
        if (birthMillis(row.birth) < birthMillis(group.birth)) {
          group.unsafe = true;
          this._fail('SIM_PROCESS_IDENTITY', `Group ${group.pgid} contains an older unrelated process`);
        }
        group.seen.set(row.pid, { birth: row.birth, retired: false });
      }
      for (const [pid, member] of group.seen) if (!members.some(row => row.pid === pid)) member.retired = true;
      group.members = members.map(row => ({ pid: row.pid, birth: row.birth, stat: row.stat }));
    }
  }

  _withRows(fn) {
    const work = this._osQueue.then(async () => {
      const rows = await this._readProcesses();
      this._refresh(rows);
      return fn(rows);
    });
    this._osQueue = work.catch(() => {});
    return work;
  }

  _register(row, kind) {
    const record = { ...row, kind, retired: false, unsafe: false };
    this._records.set(row.pid, record);
    if (!this._groups.has(row.pgid)) {
      if (row.pgid !== row.pid) throw new Error('Cannot authorize a group without verifying its leader');
      this._groups.set(row.pgid, { pgid: row.pgid, birth: row.birth, retired: false, unsafe: false,
        seen: new Map([[row.pid, { birth: row.birth, retired: false }]]), members: [{ pid: row.pid, birth: row.birth, stat: row.stat }] });
    }
    this._event({ type: 'process/verified', pid: row.pid, parentPid: row.ppid, pgid: row.pgid, birth: row.birth, kind });
  }

  _signalPid(record, rows, signal) {
    const current = rows.get(record.pid);
    if (!current || !running(current)) return false;
    if (record.unsafe || record.retired || current.birth !== record.birth || current.pgid !== record.pgid) {
      this._fail('SIM_PROCESS_IDENTITY', `Refused ${signal} for process ${record.pid} with changed identity`);
      return false;
    }
    try { process.kill(record.pid, signal); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  }

  _signalGroup(group, rows, signal) {
    if (group.retired || group.unsafe) return false;
    const members = [...rows.values()].filter(row => row.pgid === group.pgid && running(row));
    if (!members.length) { group.retired = true; return false; }
    const leader = rows.get(group.pgid);
    if (leader && (leader.birth !== group.birth || leader.pgid !== group.pgid)) {
      group.unsafe = true;
      this._fail('SIM_PROCESS_IDENTITY', `Refused ${signal} for group ${group.pgid} with changed leader`);
      return false;
    }
    try { process.kill(-group.pgid, signal); return true; }
    catch (error) { if (error.code === 'ESRCH') { group.retired = true; return false; } throw error; }
  }

  async _ack(parentPid, pid, value) {
    if (!validPid(parentPid) || !validPid(pid)) return;
    const destination = join(this.ackDirectory, `${parentPid}-${pid}.json`);
    const temporary = join(this.ackDirectory, `.${parentPid}-${pid}-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
      await rename(temporary, destination);
      this._acks.set(pid, { parentPid, value: structuredClone(value) });
    } finally { await rm(temporary, { force: true }); }
  }

  async _gated(event) {
    let verified;
    try {
      await this._ready;
      if (!validPid(event.pid) || !validPid(event.parentPid)) throw new Error('Invalid gated process PID');
      const existing = this._records.get(event.pid);
      if (existing) {
        const ack = this._acks.get(event.pid);
        if (existing.kind !== 'gated' || !ack || ack.parentPid !== event.parentPid) throw new Error(`Duplicate gate ${event.pid} has no matching verified acknowledgement`);
        await this._withRows(rows => {
          const row = rows.get(event.pid);
          if (existing.unsafe || row && running(row) && (existing.retired || row.birth !== existing.birth || row.pgid !== existing.pgid)) {
            throw new Error(`Duplicate gate ${event.pid} has a changed OS identity`);
          }
        });
        existing.frameSeen = true;
        // Gate shell and Node sender both report the same child. Once verified,
        // replay its ACK without re-signaling it or requiring it still be T.
        await this._ack(event.parentPid, event.pid, ack.value);
        return;
      }
      const deadline = performance.now() + 1000;
      while (!verified && performance.now() < deadline) {
        verified = await this._withRows(rows => {
          const row = rows.get(event.pid);
          if (!row || !running(row)) throw new Error(`Gated process ${event.pid} disappeared before OS verification`);
          const parent = this._records.get(row.ppid), actualParent = rows.get(row.ppid);
          if (!parent || parent.retired || parent.unsafe || !actualParent || actualParent.birth !== parent.birth || actualParent.pgid !== parent.pgid) {
            throw new Error(`Gated process ${event.pid} has no verified current OS parent`);
          }
          if (event.parentPid !== row.ppid) throw new Error(`Gated process ${event.pid} claimed a false parent PID`);
          if (!row.stat.startsWith('T')) return null;
          if (row.pgid !== parent.pgid && row.pgid !== row.pid) throw new Error(`Gated process ${event.pid} joined an unverified group`);
          const group = this._groups.get(row.pgid);
          if (group?.retired || group?.unsafe) throw new Error(`Gated process ${event.pid} joined a retired or unsafe group`);
          this._register(row, 'gated');
          return this._records.get(row.pid);
        });
        if (!verified) await new Promise(resolve => this._timeout(resolve, 5));
      }
      if (!verified) throw new Error(`Gated process ${event.pid} never entered the stopped state`);
      await this._withRows(rows => {
        if (this._stopping || this._errors.length) {
          this._signalPid(verified, rows, 'SIGKILL');
          this._event({ type: 'process/blocked-during-stop', pid: verified.pid });
        } else if (!this._signalPid(verified, rows, 'SIGCONT')) throw new Error(`Could not resume verified process ${verified.pid}`);
      });
      if (this._stopping || this._errors.length) await this._ack(verified.ppid, verified.pid, { ok: false, error: 'Simulation is stopping; spawn refused' });
      else await this._ack(verified.ppid, verified.pid, { ok: true, pid: verified.pid });
    } catch (error) {
      this._fail('SIM_PROCESS_OWNERSHIP', error.message);
      // A number in a failed packet does not become kill authority. Only an
      // identity already registered from OS observations may receive a signal.
      if (verified) await this._withRows(rows => this._signalPid(verified, rows, 'SIGKILL')).catch(actual => this._fail('SIM_PROCESS_CLEANUP', actual.message));
      await this._ack(event.parentPid, event.pid, { ok: false, error: error.message }).catch(actual => this._fail('SIM_PROCESS_ACK', actual.message));
    }
  }

  _receive(chunk) {
    this._buffer += chunk;
    if (this._buffer.length > 262144) { this._fail('SIM_PROCESS_PROTOCOL', 'Process monitor channel exceeded its bounded frame size'); this._buffer = ''; return; }
    for (;;) {
      const newline = this._buffer.indexOf('\n');
      if (newline < 0) break;
      const line = this._buffer.slice(0, newline); this._buffer = this._buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); if (!event || typeof event.type !== 'string' || Array.isArray(event)) throw new Error('Invalid process event'); }
      catch { this._fail('SIM_PROCESS_PROTOCOL', 'Malformed JSON on trusted process monitor channel'); continue; }
      if (event.type !== 'process/gated') { this._event({ type: 'process/untrusted-trace', event }); continue; }
      this._pending++;
      this._queue = this._queue.then(() => this._gated(event)).catch(error => this._fail('SIM_PROCESS_PROTOCOL', error.message)).finally(() => { this._pending--; });
    }
  }

  async attach(child) {
    if (this._attached) throw new Error('A ProcessMonitor belongs to exactly one boot; create a new monitor and ACK directory');
    if (!validPid(child?.pid) || !child.stdio?.[9]?.on) throw new TypeError('Root child must expose a readable stdio[9] pipe');
    this._attached = true; this.child = child;
    const stream = this._stream = child.stdio[9];
    stream.setEncoding('utf8');
    this._onData = chunk => this._receive(chunk);
    this._onEnd = () => { if (this._buffer.trim()) this._fail('SIM_PROCESS_PROTOCOL', 'Truncated JSON on trusted process monitor channel'); };
    this._onError = error => this._fail('SIM_PROCESS_PROTOCOL', error.message);
    stream.on('data', this._onData); stream.on('end', this._onEnd); stream.on('error', this._onError);
    this._ready = this._withRows(rows => {
      const row = rows.get(child.pid);
      if (!row || !running(row) || row.ppid !== process.pid || row.pgid !== row.pid) throw new Error('Root process lacks a verified direct parent and dedicated group');
      this._register(row, 'root'); this._root = this._records.get(row.pid);
    });
    try { await this._ready; this._watch(); }
    catch (error) { this._fail('SIM_PROCESS_OWNERSHIP', error.message); throw error; }
    return this.snapshot();
  }

  _watch() {
    if (this._closed || this._stopping) return;
    this._watchTimer = this._timeout(async () => {
      await this._withRows(() => {}).catch(error => this._fail('SIM_PROCESS_OS', error.message));
      this._watch();
    }, 25);
    this._watchTimer.unref?.();
  }

  async _drain(deadline) {
    for (;;) {
      const queue = this._queue;
      let timer;
      try {
        await Promise.race([queue, new Promise((_, reject) => { timer = this._timeout(() => reject(new Error('Process gate queue exceeded shutdown deadline')), Math.max(1, deadline - performance.now())); })]);
      } finally { this._clearTimeout(timer); }
      await new Promise(resolve => setImmediate(resolve));
      if (queue === this._queue) return;
    }
  }

  async _recoverStopped(rows) {
    // A truncated frame may omit its child PID. While verified parents are
    // still alive, external PPID/birth plus T state provides ownership proof
    // for safely refusing these children too. Unrelated stopped PIDs never do.
    let progress;
    do {
      progress = false;
      for (const row of rows.values()) {
        if (!row.stat.startsWith('T') || this._records.has(row.pid)) continue;
        const parent = this._records.get(row.ppid), actual = rows.get(row.ppid);
        if (!parent || parent.retired || parent.unsafe || !actual || actual.birth !== parent.birth || actual.pgid !== parent.pgid) continue;
        if (row.pgid !== parent.pgid && row.pgid !== row.pid) continue;
        const group = this._groups.get(row.pgid);
        if (group?.retired || group?.unsafe) continue;
        this._register(row, 'gated');
        const record = this._records.get(row.pid);
        record.recovered = true; record.frameSeen = false;
        this._signalPid(record, rows, 'SIGKILL');
        await this._ack(record.ppid, record.pid, { ok: false, error: 'Simulation is stopping; stopped spawn refused' });
        this._event({ type: 'process/blocked-during-stop', pid: record.pid });
        progress = true;
      }
    } while (progress);
  }

  async stop({ crash = false } = {}) {
    if (this._stopPromise) return this._stopPromise;
    this._stopPromise = this._stop(crash);
    return this._stopPromise;
  }

  async _stop(crash) {
    if (!this._attached) throw new Error('No root process has been attached');
    this._stopping = true; this._clearTimeout(this._watchTimer);
    const deadline = performance.now() + 5000;
    try {
      await this._ready.catch(() => {});
      await this._withRows(rows => { if (this._root) this._signalPid(this._root, rows, 'SIGSTOP'); });
      await this._drain(deadline);
      await this._withRows(rows => this._recoverStopped(rows));
      if (!crash) await this._withRows(rows => {
        if (this._root) { this._signalPid(this._root, rows, 'SIGTERM'); this._signalPid(this._root, rows, 'SIGCONT'); }
      });
      let complete = false;
      while (performance.now() < deadline) {
        await this._drain(deadline);
        complete = await this._withRows(async rows => {
          await this._recoverStopped(rows);
          const root = this._root && rows.get(this._root.pid);
          for (const group of this._groups.values()) {
            const mainStillExiting = !crash && group.pgid === this._root?.pgid && root && running(root) && performance.now() < deadline - 200;
            if (!mainStillExiting) {
              if (!crash && group.pgid === this._root?.pgid && root && running(root) && !group.unsafe) {
                this._fail('SIM_PROCESS_TIMEOUT', 'Root process exceeded the graceful shutdown deadline');
              }
              this._signalGroup(group, rows, 'SIGKILL');
            }
          }
          return [...this._groups.values()].every(group => group.retired);
        });
        if (complete) break;
        if ([...this._groups.values()].filter(group => !group.retired).every(group => group.unsafe)) break;
        await new Promise(resolve => this._timeout(resolve, 15));
      }
      await this._drain(deadline);
      await this._withRows(rows => {
        for (const group of this._groups.values()) if (!group.retired && !group.unsafe) this._signalGroup(group, rows, 'SIGKILL');
      });
      // Observe the result of final signals, including already-exited leaders.
      while (performance.now() < deadline && ![...this._groups.values()].every(group => group.retired || group.unsafe)) {
        await new Promise(resolve => this._timeout(resolve, 10));
        await this._withRows(() => {});
      }
      if (![...this._groups.values()].every(group => group.retired)) this._fail('SIM_PROCESS_CLEANUP', 'Verified groups still have running or identity-unknown members after stop');
      if (this._pending || this._buffer.trim()) this._fail('SIM_PROCESS_PROTOCOL', 'Unreleased process gate or truncated JSON after stop');
      if ([...this._records.values()].some(record => record.recovered && !record.frameSeen)) this._fail('SIM_PROCESS_PROTOCOL', 'Stopped child lacked a complete process-gate frame');
    } catch (error) {
      this._fail('SIM_PROCESS_CLEANUP', error.message);
      // Failure must not leave the verified root frozen, nor authorize any
      // number from a bad frame. Recheck OS ownership before final cleanup.
      await this._withRows(async rows => {
        await this._recoverStopped(rows);
        for (const group of this._groups.values()) this._signalGroup(group, rows, 'SIGKILL');
      }).catch(actual => this._fail('SIM_PROCESS_CLEANUP', actual.message));
    }
    finally {
      this._closed = true;
      this._stream.off('data', this._onData); this._stream.off('end', this._onEnd); this._stream.off('error', this._onError);
      this._stream.destroy();
    }
    this.assertHealthy();
    return this.snapshot();
  }

  snapshot() {
    return structuredClone({ bootId: this.bootId, ackDirectory: this.ackDirectory, attached: this._attached, stopping: this._stopping,
      closed: this._closed, pending: this._pending, errors: this._errors, events: this._events,
      processes: [...this._records.values()], groups: [...this._groups.values()].map(({ seen, ...group }) => group),
      boundaries: ['POSIX external ps birth times have one-second precision; PID changes and retired IDs fail conservatively',
        'PTY ownership and arbitrary session/group escapes are not covered', 'Writable audit records provide no signal authority'],
    });
  }
}
