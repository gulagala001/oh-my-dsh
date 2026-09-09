import { mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, renameSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const read = (file, fallback) => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
export const textOf = (message) => {
  const text = typeof message.content === 'string' ? message.content : (message.content ?? []).flatMap(b => b.type === 'text' ? [b.text] : b.type === 'toolCall' ? [`${b.name}(${JSON.stringify(b.arguments)})`] : []).join('\n');
  return message.role === 'toolResult' && message.isError ? `<tool-error>${text}` : text;
};
export function projectOf(cwd) {
  let dir = resolve(cwd);
  while (!existsSync(join(dir, '.git'))) {
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
  return dir;
}

export class Store {
  constructor(dir) {
    this.dir = resolve(dir);
    this.sessions = new Map();
    mkdirSync(join(this.dir, 'sessions'), { recursive: true });
  }
  write(name, value) {
    const file = join(this.dir, name);
    writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  }
  settings() {
    const saved = read(join(this.dir, 'settings.json'), {});
    return {
      cwd: process.cwd(),
      ...saved,
      main: {
        api: 'openai-completions', baseUrl: process.env.TRISOUL_X_BASE_URL ?? '',
        model: process.env.TRISOUL_X_MODEL ?? '', apiKey: process.env.TRISOUL_X_API_KEY ?? '',
        contextWindow: 128000, maxTokens: 16384, reasoning: '',
        ...saved.main,
      },
      background: saved.background ?? null,
    };
  }
  publicSettings() {
    const settings = this.settings();
    const mask = (route) => {
      if (!route) return null;
      const { apiKey, ...rest } = route;
      return { ...rest, hasKey: Boolean(apiKey) };
    };
    return { ...settings, main: mask(settings.main), background: mask(settings.background) };
  }
  saveSettings(patch) {
    const current = this.settings();
    for (const field of ['main', 'background']) {
      if (patch[field] === null && field === 'background') current.background = null;
      else if (patch[field]) {
        const { hasKey, ...route } = patch[field];
        const base = current[field] ?? current.main;
        const changedEndpoint = (route.baseUrl !== undefined && route.baseUrl !== base.baseUrl) || (route.api !== undefined && route.api !== base.api);
        const { apiKey, compat, ...defaults } = base;
        current[field] = { ...defaults, ...(!changedEndpoint ? { apiKey, compat } : { apiKey: '' }), ...route };
      }
    }
    if (typeof patch.cwd === 'string' && patch.cwd.trim()) current.cwd = resolve(patch.cwd);
    this.write('settings.json', current);
    return this.publicSettings();
  }
  create(cwd) {
    const session = { id: randomUUID(), events: [] };
    this.sessions.set(session.id, session);
    this.append(session, 'session', { cwd: resolve(cwd), project: projectOf(cwd), title: '新对话' });
    return session;
  }
  get(id) {
    if (this.sessions.has(id)) return this.sessions.get(id);
    if (!/^[a-f0-9-]+$/.test(id)) throw new Error('找不到对话');
    const file = join(this.dir, 'sessions', `${id}.jsonl`);
    if (!existsSync(file)) throw new Error('找不到对话');
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const session = { id, events: lines.map(line => JSON.parse(line)) };
    this.sessions.set(id, session);
    return session;
  }
  append(session, type, data) {
    const event = { seq: session.events.length, type, at: Date.now(), ...data };
    appendFileSync(join(this.dir, 'sessions', `${session.id}.jsonl`), JSON.stringify(event) + '\n', { mode: 0o600 });
    session.events.push(event);
    return event;
  }
  list() {
    return readdirSync(join(this.dir, 'sessions')).filter(n => n.endsWith('.jsonl')).map(n => this.info(this.get(n.slice(0, -6)))).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  info(session) {
    const header = session.events[0];
    const first = session.events.find(e => e.type === 'message' && e.message.role === 'user');
    const tasks = session.events.findLast(e => e.type === 'tasks')?.items ?? [];
    const context = session.events.findLast(e => e.type === 'context');
    const checkpoint = session.events.findLast(e => e.type === 'checkpoint');
    return {
      id: session.id, cwd: header.cwd, project: header.project,
      title: first ? textOf(first.message).slice(0, 44) : header.title,
      updatedAt: session.events.at(-1).at, tasks,
      context: context ? { pins: context.pins, status: context.status } : null,
      checkpoint: checkpoint ? { from: checkpoint.from, to: checkpoint.to, text: checkpoint.text } : null,
    };
  }
  memories(project) {
    return read(join(this.dir, 'memory.json'), []).filter(m => !m.retired && !m.supersededBy && (m.scope !== 'project' || m.project === project));
  }
  memoryOps(project, ops, source = 'agent') {
    const all = read(join(this.dir, 'memory.json'), []);
    for (const op of ops) {
      if (!['add', 'update', 'upsert', 'retire'].includes(op.op)) throw new Error('未知记忆操作');
      const scope = op.scope ?? 'project';
      if (!['project', 'cross', 'global'].includes(scope) || !op.key?.trim()) throw new Error('记忆需要有效的 scope 和 key');
      const old = all.findLast(m => !m.retired && !m.supersededBy && (op.target ? m.id === op.target || m.key === op.target : m.key === op.key) && m.scope === scope && (scope !== 'project' || m.project === project));
      if (op.op === 'retire') { if (old) { old.retired = Date.now(); old.retiredReason = op.text; } continue; }
      if (typeof op.text !== 'string' || !op.text.trim()) throw new Error('记忆内容不能为空');
      if (old?.text === op.text.trim()) continue;
      const next = { id: randomUUID(), key: op.key, scope, text: op.text.trim(), source, at: Date.now(), ...(scope === 'project' ? { project } : {}) };
      if (old) { old.supersededBy = next.id; next.previous = old.id; }
      all.push(next);
    }
    this.write('memory.json', all);
    return this.memories(project);
  }
}
