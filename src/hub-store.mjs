import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectKeyOf, sameProject } from './project.mjs';
import { readonlyMonitorActivity } from './monitor-activity.mjs';
import { setImmediate as yieldToIO } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';

const read = (path, fallback) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
const monitorState = value => ({ id: value.id, parentSession: value.parentSession,
  ...(value.origin === undefined ? {} : { origin: value.origin }),
  metrics: value.metrics || {}, actions: value.actions || {}, activity: value.activity || [],
  ...(value.budget === undefined ? {} : { budget: value.budget }) });
const fileSignature = stat => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
function archivedMonitorState(value, id) {
  if (value?.id !== id) throw Error('会话存档身份不匹配');
  const snapshot = monitorState(value);
  snapshot.activity = readonlyMonitorActivity(snapshot.activity);
  return snapshot;
}
export const projectOf = cwd => projectKeyOf(cwd) ?? process.cwd();
// Session keys are identities, not filesystem paths.
export const matchesProject = (memory, current) => memory?.startsWith('session:') || current?.startsWith('session:') ? memory === current : sameProject(memory, current);

export function validateSessionId(id) {
  if (typeof id !== 'string' || !id || id === '.' || id === '..' || /[\\/\0]/.test(id)) throw Error('会话编号无效');
  return id;
}

export class HubStore {
  constructor(dir) {
    this.dir = resolve(dir);
    this.states = new Map(); this.monitorCache = new Map(); this.monitorErrors = new Map();
    this.monitorPending = new Map();
    mkdirSync(join(this.dir, 'sessions'), { recursive: true });
  }
  write(name, value) {
    const file = join(this.dir, name);
    writeFileSync(`${file}.tmp`, JSON.stringify(value, null, name.startsWith('sessions/') ? undefined : 2) + '\n', { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  }
  peek(id) {
    validateSessionId(id);
    const value = this.states.get(id) ?? read(join(this.dir, 'sessions', `${id}.json`));
    if (value && value.id !== id) throw Error('会话存档身份不匹配');
    return value;
  }
  release(id) { this.states.delete(id); }
  state(id) {
    validateSessionId(id);
    const cached = this.states.has(id);
    const value = cached ? this.states.get(id) : read(join(this.dir, 'sessions', `${id}.json`), {
      id, notes: [], metrics: {}, activity: [], actions: {},
    });
    if (value?.id !== id) throw Error('会话存档身份不匹配');
    if (!cached) this.states.set(id, value);
    return value;
  }
  save(state) { validateSessionId(state.id); this.write(`sessions/${state.id}.json`, state); }
  update(state, patch) {
    this.save({ ...state, ...patch });
    Object.assign(state, patch); this.states.set(state.id, state);
    return state;
  }
  // Statistics do not need to retain every archived conversation body in RAM.
  // Active mutable states take precedence over archived snapshots.
  monitorState(id) {
    validateSessionId(id);
    const live = this.states.get(id);
    if (live) {
      if (live.id !== id) throw Error('会话存档身份不匹配');
      return monitorState(live);
    }
    const name = `${id}.json`, file = join(this.dir, 'sessions', name);
    try {
      const signature = fileSignature(statSync(file, { bigint: true }));
      let cached = this.monitorCache.get(name);
      if (cached?.signature !== signature) {
        const snapshot = archivedMonitorState(read(file), id);
        cached = { signature, value: snapshot }; this.monitorCache.set(name, cached);
      }
      return cached.value;
    } catch (error) {
      this.monitorCache.delete(name);
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
  }
  monitorFiles() {
    const files = readdirSync(join(this.dir, 'sessions')).filter(n => n.endsWith('.json'));
    const present = new Set(files);
    for (const name of this.monitorCache.keys()) if (!present.has(name)) this.monitorCache.delete(name);
    return files;
  }
  *monitorEntries(errors) {
    for (const name of this.monitorFiles()) {
      let value;
      try {
        value = this.monitorState(name.slice(0, -5));
      } catch (error) {
        this.monitorCache.delete(name); errors.set(name, error.message);
      }
      yield value;
    }
  }
  monitorStates() {
    const errors = new Map(), states = [...this.monitorEntries(errors)].filter(Boolean);
    this.monitorErrors = errors;
    return states;
  }
  async readMonitorState(id) {
    validateSessionId(id);
    if (this.states.has(id)) return this.monitorState(id);
    const name = `${id}.json`, file = join(this.dir, 'sessions', name);
    let signature;
    try {
      signature = fileSignature(statSync(file, { bigint: true }));
      const cached = this.monitorCache.get(name);
      if (cached?.signature === signature) return cached.value;
      this.monitorCache.delete(name);
      let pending = this.monitorPending.get(name);
      if (pending?.signature !== signature) {
        pending = { signature };
        // Concurrent panels share only this in-flight file read. A cancelled
        // caller finishes the current file without cancelling another caller.
        const current = pending;
        pending.promise = readFile(file, 'utf8').then(raw => {
          // Async I/O can overlap activation, replacement or deletion. Never
          // publish old bytes under a newer file's identity or over live state.
          if (this.states.has(id) || fileSignature(statSync(file, { bigint: true })) !== signature) return this.monitorState(id);
          const value = archivedMonitorState(JSON.parse(raw), id);
          this.monitorCache.set(name, { signature, value });
          return value;
        }).finally(() => { if (this.monitorPending.get(name) === current) this.monitorPending.delete(name); });
        this.monitorPending.set(name, pending);
      }
      return await pending.promise;
    } catch (error) {
      if (signature === undefined || this.monitorCache.get(name)?.signature === signature) this.monitorCache.delete(name);
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
  }
  async readMonitorSnapshot(signal) {
    signal?.throwIfAborted();
    const errors = new Map(), states = [];
    let deadline = performance.now() + 8;
    for (const name of this.monitorFiles()) {
      let state;
      try { state = await this.readMonitorState(name.slice(0, -5)); }
      catch (error) { errors.set(name, error.message); }
      signal?.throwIfAborted();
      if (state) states.push(state);
      // A cold corpus can contain hundreds of large archives. Finish each
      // file read, but let unrelated requests and cancellation run
      // between slices. No timer, worker or scan remains after this request.
      if (performance.now() >= deadline) {
        await yieldToIO(undefined, { signal });
        deadline = performance.now() + 8;
      }
    }
    signal?.throwIfAborted();
    this.monitorErrors = errors;
    // A session may have become active while disk archives were being read.
    // Its current mutable state still owns the final projection.
    return { states: states.map(state => this.states.has(state.id) ? this.monitorState(state.id) : state), errors };
  }
  memories(project, mode = 'full', history = false) {
    return read(join(this.dir, 'memory.json'), []).filter(m => (history || (!m.retired && !m.supersededBy))
      && (m.scope === 'project' ? matchesProject(m.project, project) : mode === 'full'));
  }
}
