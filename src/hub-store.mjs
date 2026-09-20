import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectKeyOf, sameProject } from './project.mjs';

const read = (path, fallback) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
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
    this.states = new Map(); this.monitorCache = new Map();
    mkdirSync(join(this.dir, 'sessions'), { recursive: true });
  }
  write(name, value) {
    const file = join(this.dir, name);
    writeFileSync(`${file}.tmp`, JSON.stringify(value, null, name.startsWith('sessions/') ? undefined : 2) + '\n', { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  }
  state(id) {
    validateSessionId(id);
    if (!this.states.has(id)) this.states.set(id, read(join(this.dir, 'sessions', `${id}.json`), {
      id, notes: [], metrics: {}, activity: [], actions: {},
    }));
    return this.states.get(id);
  }
  save(state) { validateSessionId(state.id); this.write(`sessions/${state.id}.json`, state); }
  // Statistics do not need to retain every archived conversation body in RAM.
  // Active mutable states take precedence over archived snapshots.
  monitorStates() {
    const project = value => ({ id: value.id, parentSession: value.parentSession,
      metrics: value.metrics || {}, actions: value.actions || {}, activity: value.activity || [] });
    const files = readdirSync(join(this.dir, 'sessions')).filter(n => n.endsWith('.json'));
    const present = new Set(files);
    for (const name of this.monitorCache.keys()) if (!present.has(name)) this.monitorCache.delete(name);
    return files.map(name => {
      const id = validateSessionId(name.slice(0, -5));
      if (this.states.has(id)) return project(this.states.get(id));
      const file = join(this.dir, 'sessions', name), stat = statSync(file, { bigint: true });
      const signature = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
      let cached = this.monitorCache.get(name);
      if (cached?.signature !== signature) {
        const value = read(file);
        if (value?.id !== id) throw Error('会话存档身份不匹配');
        cached = { signature, value: project(value) }; this.monitorCache.set(name, cached);
      }
      return cached.value;
    });
  }
  memories(project, mode = 'full', history = false) {
    return read(join(this.dir, 'memory.json'), []).filter(m => (history || (!m.retired && !m.supersededBy))
      && (m.scope === 'project' ? matchesProject(m.project, project) : mode === 'full'));
  }
}
