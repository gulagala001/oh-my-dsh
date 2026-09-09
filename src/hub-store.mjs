import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const read = (path, fallback) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
export function projectOf(cwd) {
  let dir = resolve(cwd);
  while (!existsSync(join(dir, '.git'))) {
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
  return dir;
}

export class HubStore {
  constructor(dir) {
    this.dir = resolve(dir);
    this.states = new Map();
    mkdirSync(join(this.dir, 'sessions'), { recursive: true });
  }
  write(name, value) {
    const file = join(this.dir, name);
    writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  }
  state(id) {
    if (!this.states.has(id)) this.states.set(id, read(join(this.dir, 'sessions', `${id}.json`), {
      id, cursor: -1, pins: [], status: '', digests: [], notes: [], metrics: {}, activity: [], actions: {}, memoryTrace: [],
    }));
    return this.states.get(id);
  }
  save(state) { this.write(`sessions/${state.id}.json`, state); }
  allStates() {
    return readdirSync(join(this.dir, 'sessions')).filter(n => n.endsWith('.json')).map(n => this.state(n.slice(0, -5)));
  }
  memories(project, mode = 'full', history = false) {
    return read(join(this.dir, 'memory.json'), []).filter(m => (history || (!m.retired && !m.supersededBy))
      && (m.scope === 'project' ? m.project === project : mode === 'full'));
  }
  allMemories() { return read(join(this.dir, 'memory.json'), []); }
  touch(ids, kind, sessionId) {
    if (!ids.length) return;
    const all = this.allMemories();
    for (const m of all) if (ids.includes(m.id)) {
      m.usage ??= { injected: 0, recalled: 0 };
      m.usage[kind] = (m.usage[kind] || 0) + 1;
      m.usage[`${kind}At`] = Date.now(); m.usage.lastSessionId = sessionId;
      m.usage.sessions = [...new Set([...(m.usage.sessions || []), sessionId])];
    }
    this.write('memory.json', all);
  }
  restore(id) {
    const all = this.allMemories(), old = all.find(m => m.id === id);
    if (!old) throw new Error('找不到这条记忆');
    const active = all.find(m => m.key === old.key && m.scope === old.scope && m.project === old.project && !m.retired && !m.supersededBy);
    if (active?.id === old.id) return;
    if (active) return this.memoryOps(old.project, [{ op: 'update', scope: old.scope, key: old.key, text: old.text, target: active.id }], 'user');
    delete old.retired; delete old.supersededBy; old.restoredAt = Date.now();
    this.write('memory.json', all);
  }
  edit(id, patch) {
    const all = this.allMemories(), old = all.find(m => m.id === id);
    if (!old || old.retired || old.supersededBy) throw new Error('只能编辑当前有效版本');
    const { scope = old.scope, project = old.project, key = old.key, text = old.text } = patch;
    if (!['global', 'cross', 'project'].includes(scope) || !key.trim() || !text.trim() || (scope === 'project' && !project)) throw new Error('记忆需要正确的层级、名称、内容与所属项目');
    if (scope === old.scope && project === old.project && key === old.key && text.trim() === old.text) return;
    const next = { ...old, id: randomUUID(), scope, key, text: text.trim(), at: Date.now(), source: 'user', previous: old.id };
    if (scope === 'project') next.project = project; else delete next.project;
    const existing = all.find(m => m.id !== old.id && !m.retired && !m.supersededBy && m.scope === next.scope && m.key === next.key && m.project === next.project);
    if (existing) throw new Error('目标层级与项目已有同名记忆，请编辑该条记忆或更换名称');
    old.supersededBy = next.id; all.push(next); this.write('memory.json', all);
  }
  memoryOps(project, ops, source = 'scribe', mode = 'full') {
    const all = read(join(this.dir, 'memory.json'), []);
    for (const op of ops) {
      const scope = mode === 'full' ? (op.scope ?? 'project') : 'project';
      if (!['add', 'update', 'retire'].includes(op.op) || !['global', 'cross', 'project'].includes(scope)) throw new Error('记忆操作或范围无效');
      const old = all.findLast(m => !m.retired && !m.supersededBy
        && (op.target ? m.id === op.target || m.key === op.target : m.key === op.key)
        && m.scope === scope && (scope !== 'project' || m.project === project));
      if (op.op === 'retire') { if (old) { old.retired = Date.now(); old.retiredReason = op.text; } continue; }
      if (!op.key?.trim() || !op.text?.trim()) throw new Error('记忆需要名称和内容');
      if (old?.text === op.text.trim()) continue;
      const next = { id: randomUUID(), scope, key: op.key.trim(), text: op.text.trim(), source, at: Date.now(), ...(old?.usage ? { usage: { ...old.usage } } : {}), ...(scope === 'project' ? { project } : {}) };
      if (old) { old.supersededBy = next.id; next.previous = old.id; }
      all.push(next);
    }
    this.write('memory.json', all);
    return this.memories(project, mode);
  }
}
