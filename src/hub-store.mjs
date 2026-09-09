import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const read = (path, fallback) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
export function memoryLineage(entry, history) {
  let first = entry, depth = 1, origin = entry.origin || entry.source;
  const seen = new Set();
  while (first && !seen.has(first.id)) {
    seen.add(first.id);
    if (first.source === 'user' || first.origin === 'user') origin = 'user';
    if (!history.has(first.previous) || seen.has(first.previous)) break;
    first = history.get(first.previous); depth++;
  }
  return { at: first.at, depth, origin };
}
export function projectOf(cwd) {
  let dir = resolve(cwd);
  while (!existsSync(join(dir, '.git'))) {
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
  return dir;
}

export const activeMemory = m => !m.retired && !m.supersededBy;
const publicProject = m => m.scope === 'project' && m.project && !m.project.startsWith('session:');
const byAge = (a, b) => a.at - b.at || a.id.localeCompare(b.id);
const normText = t => String(t ?? '').toLowerCase().replace(/[\s\p{P}]+/gu, '');
const bigrams = t => { const s = new Set(); for (let i = 0; i + 1 < t.length; i++) s.add(t.slice(i, i + 2)); return s; };
export function textSimilarity(a, b) {
  const A = bigrams(normText(a)), B = bigrams(normText(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
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
  curationState() { return read(join(this.dir, 'curation.json'), { cursors: {}, lastAt: {} }); }
  shardEntries(shard) {
    return this.allMemories().filter(m => activeMemory(m) && (shard.startsWith('project:') ? publicProject(m) && m.project === shard.slice(8) : m.scope === shard)).sort(byAge);
  }
  crossCandidates() {
    const list = this.allMemories().filter(m => activeMemory(m) && publicProject(m)).sort(byAge), used = new Set(), groups = [];
    for (let i = 0; i < list.length; i++) {
      const a = list[i]; if (used.has(a.id)) continue;
      const entries = [a];
      for (const b of list.slice(i + 1)) if (!used.has(b.id) && b.project !== a.project && (a.key === b.key || textSimilarity(a.text, b.text) >= 0.6)) entries.push(b);
      if (new Set(entries.map(m => m.project)).size >= 2) { for (const m of entries) used.add(m.id); groups.push({ key: a.key, entries }); }
    }
    return groups;
  }
  curateWindow(shard, limit = 0) {
    const all = this.shardEntries(shard), total = all.length, cur = this.curationState().cursors[shard];
    const cursor = Number.isInteger(cur) && cur > 0 && cur < total ? cur : 0;
    const entries = all.slice(cursor, cursor + (limit || total || 1)), end = cursor + entries.length;
    return { entries, total, cursor, next: end >= total ? 0 : end };
  }
  markCurated(shard, next) {
    const s = this.curationState(); s.cursors[shard] = next; s.lastAt[shard] = Date.now(); this.write('curation.json', s);
  }
  pickShard(preferred, { mode = 'full', project } = {}) {
    if (mode === 'session') return;
    const all = this.allMemories().filter(activeMemory), cross = mode === 'full' ? this.crossCandidates() : [], state = this.curationState();
    const shards = mode === 'project' ? [`project:${project}`] : [...new Set([...all.filter(m => m.scope !== 'project').map(m => m.scope), ...(cross.length ? ['cross'] : []), ...all.filter(publicProject).map(m => `project:${m.project}`)])];
    const dirty = shard => {
      const entries = this.shardEntries(shard), last = state.lastAt[shard];
      if (shard === 'cross' && cross.length && (!Number.isFinite(last) || cross.some(g => g.entries.some(m => m.at > last)))) return true;
      return entries.length >= 2 && (!Number.isFinite(last) || state.cursors[shard] > 0 || entries.some(m => m.at > last));
    };
    if (preferred && shards.includes(preferred) && dirty(preferred)) return preferred;
    return shards.filter(dirty).sort((a, b) => (state.lastAt[a] || 0) - (state.lastAt[b] || 0))[0];
  }
  deleteMemory(id) {
    const all = this.allMemories(); if (!all.some(m => m.id === id)) throw new Error('找不到这条记忆');
    for (const m of all) { if (m.previous === id) delete m.previous; if (m.supersededBy === id) m.retired ??= Date.now(); }
    this.write('memory.json', all.filter(m => m.id !== id));
  }
  health(project, mode = 'full') {
    const all = this.allMemories(), visible = this.memories(project, mode), history = new Map(all.map(m => [m.id, m]));
    const unused = visible.filter(m => !(m.usage?.injected || m.usage?.recalled)).length;
    const oldestAt = visible.length ? Math.min(...visible.map(m => memoryLineage(m, history).at)) : null;
    return { total: all.length, active: all.filter(activeMemory).length, visible: visible.length, retired: all.filter(m => m.retired).length, versions: all.filter(m => m.supersededBy).length, unused, oldestAt, chars: visible.reduce((n, m) => n + m.text.length, 0), shards: this.curationState(), promotionGroups: mode === 'full' ? this.crossCandidates().length : 0 };
  }
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
    delete old.retired; delete old.supersededBy; old.restoredAt = Date.now(); old.origin = 'user';
    this.write('memory.json', all);
  }
  edit(id, patch) {
    const all = this.allMemories(), old = all.find(m => m.id === id);
    if (!old || old.retired || old.supersededBy) throw new Error('只能编辑当前有效版本');
    const { scope = old.scope, project = old.project, key = old.key, text = old.text } = patch;
    if (!['global', 'cross', 'project'].includes(scope) || !key.trim() || !text.trim() || (scope === 'project' && !project)) throw new Error('记忆需要正确的层级、名称、内容与所属项目');
    if (scope === old.scope && project === old.project && key === old.key && text.trim() === old.text) return;
    const next = { ...old, id: randomUUID(), scope, key, text: text.trim(), at: Date.now(), source: 'user', origin: 'user', previous: old.id };
    if (scope === 'project') next.project = project; else delete next.project;
    const existing = all.find(m => m.id !== old.id && !m.retired && !m.supersededBy && m.scope === next.scope && m.key === next.key && m.project === next.project);
    if (existing) throw new Error('目标层级与项目已有同名记忆，请编辑该条记忆或更换名称');
    old.supersededBy = next.id; all.push(next); this.write('memory.json', all);
  }
  memoryOps(project, ops, source = 'scribe', mode = 'full', observed) {
    const all = read(join(this.dir, 'memory.json'), []), history = new Map(all.map(m => [m.id, m]));
    for (const op of ops) {
      const scope = mode === 'full' ? (op.scope ?? 'project') : 'project';
      if (!['add', 'update', 'retire'].includes(op.op) || !['global', 'cross', 'project'].includes(scope)) throw new Error('记忆操作或范围无效');
      const old = all.findLast(m => !m.retired && !m.supersededBy
        && (op.target ? m.id === op.target || m.key === op.target : m.key === op.key)
        && (source === 'curate' && op.op !== 'add' ? (observed?.has(m.id) && (m.scope === 'project' ? (!m.project?.startsWith('session:') && (mode === 'full' || m.project === project)) : mode === 'full')) : m.scope === scope && (scope !== 'project' || m.project === project)));
      const origin = old ? memoryLineage(old, history).origin : source;
      if (source === 'curate' && old && !observed?.has(old.id)) throw new Error('整理目标已变化，本批保留原记忆等待重试');
      if (source === 'curate' && op.op !== 'add') {
        if (!old || !observed?.has(old.id)) throw new Error('整理目标已变化，本批保留原记忆等待重试');
        if (op.op === 'retire' && (old.scope === 'global' || origin === 'user')) continue;
        if (old.scope === 'global' && scope !== 'global') continue;
      }
      const targetProject = scope === 'project' ? (source === 'curate' && old?.scope === 'project' ? old.project : project) : undefined;
      if (scope === 'project' && !targetProject) throw new Error('项目记忆需要所属项目');
      if (op.op === 'retire') { if (old) { old.retired = Date.now(); old.retiredReason = op.text; } continue; }
      if (!op.key?.trim() || !op.text?.trim()) throw new Error('记忆需要名称和内容');
      if (source === 'curate' && all.some(m => m.id !== old?.id && !m.retired && !m.supersededBy && m.key === op.key.trim() && m.scope === scope && (scope !== 'project' || m.project === targetProject))) throw new Error('整理目标名称已有其他记忆，请合并到现有条目');
      if (old?.text === op.text.trim() && old.scope === scope && old.key === op.key.trim()) continue;
      const next = { id: randomUUID(), scope, key: op.key.trim(), text: op.text.trim(), source, origin: source === 'user' ? 'user' : origin, at: Date.now(), ...(old?.usage ? { usage: { ...old.usage } } : {}), ...(scope === 'project' ? { project: targetProject } : {}) };
      if (old) { old.supersededBy = next.id; next.previous = old.id; }
      all.push(next); history.set(next.id, next);
    }
    this.write('memory.json', all);
    return this.memories(project, mode);
  }
}
