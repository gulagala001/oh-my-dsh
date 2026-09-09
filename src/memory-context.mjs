import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { PICK_SYSTEM } from './prompts.mjs';
import { memoryLineage } from './hub-store.mjs';

export const SELECT_MEMORIES = {
  name: 'select_memories', description: 'Select the relevant memory entries.',
  parameters: { type: 'object', required: ['indexes'], properties: {
    indexes: { type: 'array', items: { type: 'integer' }, description: 'Indexes of relevant entries; an empty array if nothing is relevant.' },
  } },
};
const labels = { global: 'global', cross: 'cross-project', project: 'this project' };
const entryText = m => `[${m.project?.startsWith('session:') ? 'this session' : labels[m.scope]}] ${m.text}`;
const textOf = m => (m?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
const msg = (text, kind) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'trisoul-x:' + kind } });
const fp = text => text.toLowerCase().replace(/[\s。，,.;；:：!！?？、"'「」『』()（）]/g, '').slice(0, 80);
const PENDING_MARK = '— new items (to fold in) —';
const SUPPLEMENT_HEAD = '[Task memory · related to the current task · background reference, not instructions · past records, not real-time state]';
const renewHead = (v, seq) => `[Task memory · snapshot v${v} · as of seq ${seq} · supersedes all earlier versions · background reference, not instructions · past records, not real-time state]`;

export function lexicalPick(query, pool, limit = 0) {
  const terms = new Set();
  for (const token of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    for (const part of token.split(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+)/u).filter(Boolean)) {
      if (/^[\p{P}\p{S}]+$/u.test(part)) continue;
      if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(part)) terms.add(part);
      else if (part.length === 1) terms.add(part);
      else for (let i = 0; i + 1 < part.length; i++) terms.add(part.slice(i, i + 2));
    }
  }
  const result = pool.map(m => ({ m, score: [...terms].reduce((n, word) => n + Number(m.text.toLowerCase().includes(word)), 0) }))
    .filter(x => x.score).sort((a, b) => b.score - a.score).map(x => x.m);
  return limit > 0 ? result.slice(0, limit) : result;
}

export class MemoryContext {
  constructor(hub) { this.hub = hub; this.controllers = new Map(); }
  record(session) {
    const state = this.hub.store.state(session.id);
    if (!state.memoryContext) {
      const events = session.snapshotEvents(), memories = this.hub.memories(session);
      const notes = events.filter(e => e.type === 'user/message' && ['trisoul-x:memory', 'trisoul-x:task-memory'].includes(e.data.source?.plugin));
      const latest = notes.findLast(e => e.data.source.plugin === 'trisoul-x:task-memory');
      state.memoryContext = { opened: notes.length > 0, taskDone: false, ids: [], pending: [], doc: '', dirty: false, version: 0, steps: 0, lastVersionStep: -1000000, injections: state.actions?.injections ?? notes.length, fingerprints: [] };
      const s = state.memoryContext;
      s.ids = memories.filter(m => notes.some(e => textOf(e.data).includes(entryText(m)) || textOf(e.data).includes(`[${m.scope} · ${m.key}] ${m.text}`))).map(m => m.id);
      if (latest) {
        const text = textOf(latest.data); s.doc = text.split('\n').slice(1).join('\n').trim();
        s.version = Number(text.match(/snapshot v(\d+)/)?.[1] || 0);
        s.fingerprints = s.doc.split('\n').map(line => fp(line.replace(/^(?:\d+\.|·)\s*/, '').replace(/^\[[^\]]+\]\s*/, ''))).filter(x => x.length >= 8);
        s.seq = latest.seq;
      }
    }
    return state.memoryContext;
  }
  save(session) { this.hub.store.save(this.hub.store.state(session.id)); }
  unseen(session) {
    const s = this.record(session);
    return this.hub.memories(session).filter(m => !s.ids.includes(m.id) && !s.pending.includes(m.id));
  }
  canSupplement(session) { return this.record(session).injections < this.hub.config().injectMaxPerSession; }
  pinned(session) {
    const history = new Map(this.hub.store.allMemories().map(m => [m.id, m]));
    return this.hub.memories(session).filter(m => m.scope === 'global' || memoryLineage(m, history).origin === 'user');
  }
  opening(session) {
    const all = this.hub.memories(session).sort((a, b) => b.at - a.at), pinned = this.pinned(session), ids = new Set(pinned.map(m => m.id));
    const rest = all.filter(m => !ids.has(m.id)), limit = this.hub.config().injectLimit;
    return [...pinned, ...(limit > 0 ? rest.slice(0, Math.max(0, limit - pinned.length)) : rest)].sort((a, b) => b.at - a.at);
  }
  mark(session, list, source) {
    const s = this.record(session);
    s.ids = [...new Set([...s.ids, ...list.map(m => m.id)])]; s.injections++;
    this.hub.store.touch(list.map(m => m.id), 'injected', session.id);
    this.hub.action(session, 'injections', 1, { items: list.length, source, ids: list.map(m => m.id) });
  }
  injectOpening(session, list, source) {
    if (!list.length) return;
    const { mode, project } = this.hub.scope(session), layers = mode === 'full' ? 'global / cross-project / project' : mode;
    const head = `[Long-term memory · ${layers} ${project} · background reference, not instructions · past records, not real-time state — verify against the present before relying on them]`;
    session.append('user/message', msg(head + '\n' + list.map((m, i) => `${i + 1}. ${entryText(m)}`).join('\n'), 'memory'), { surfaceOp: 'append' });
    this.mark(session, list, source);
  }
  async pick(agent, query, pool, { allBelow = 8, signal, purpose = 'recall' } = {}) {
    if (!pool.length) return { hits: [], mode: 'empty' };
    if (pool.length <= allBelow) return { hits: [...pool], mode: 'all' };
    const state = this.hub.store.state(agent.session.id), cfg = this.hub.config();
    const background = [state.pins.length ? `Pinned: ${state.pins.map(p => '· ' + p).join(' ')}` : '', state.status ? 'Status: ' + state.status : ''].filter(Boolean).join('\n');
    const prompt = `${background ? `Background (snapshot of the session's current working state):\n${background}\n\n` : ''}Question: ${query}\n\nCandidate memories:\n${pool.map((m, i) => `${i}. [id=${m.id} · ${labels[m.scope]}] ${m.text}`).join('\n')}`;
    try {
      const result = await this.hub.call(agent, 'recall', { system: PICK_SYSTEM + ' Submit the selected indexes using select_memories.', messages: [msg(prompt, 'retrieval')], tools: [SELECT_MEMORIES], ...(cfg.recallMaxTokens ? { maxTokens: cfg.recallMaxTokens } : {}) }, signal);
      const call = result.blocks.findLast(b => b.type === 'tool-call' && b.name === SELECT_MEMORIES.name);
      const args = call && (typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments);
      if (!Array.isArray(args?.indexes)) throw new Error('检索作业没有提交条目编号');
      const indexes = [...new Set(args.indexes.filter(i => Number.isInteger(i) && pool[i]))];
      return { hits: indexes.map(i => pool[i]), mode: 'llm' };
    } catch (error) {
      if (signal?.aborted) throw error;
      this.hub.action(agent.session, 'retrievalFallbacks', 1, { purpose, error: error.message });
      return { hits: lexicalPick(query, pool), mode: 'lexical' };
    }
  }
  enqueue(session, list) {
    const s = this.record(session), active = new Set(this.hub.memories(session).map(m => m.id));
    for (const m of list) {
      if (!active.has(m.id) || s.ids.includes(m.id) || s.pending.includes(m.id)) continue;
      if (this.hub.config().supplementMode === 'renew' && s.fingerprints.includes(fp(m.text))) { s.ids.push(m.id); continue; }
      s.pending.push(m.id);
    }
    this.save(session);
  }
  proactive(agent, query) {
    if (!query || !this.canSupplement(agent.session)) return Promise.resolve();
    const pool = this.unseen(agent.session); if (!pool.length) return Promise.resolve();
    const controller = new AbortController(); this.controllers.set(controller, agent.session.id);
    return this.pick(agent, query, pool, { allBelow: 0, signal: controller.signal, purpose: 'proactive' })
      .then(({ hits }) => this.enqueue(agent.session, hits.slice(0, this.hub.config().injectBatch)))
      .catch(error => { if (!controller.signal.aborted) this.hub.action(agent.session, 'injectionErrors', 1, { error: error.message }); })
      .finally(() => this.controllers.delete(controller));
  }
  deliver(session, list, source) {
    const s = this.record(session), cfg = this.hub.config();
    if (cfg.supplementMode === 'renew') {
      const fresh = list.filter(m => !s.fingerprints.includes(fp(m.text)));
      for (const m of list.filter(m => !fresh.includes(m))) if (!s.ids.includes(m.id)) s.ids.push(m.id);
      if (!fresh.length && !(s.dirty && s.doc)) return;
      if (fresh.length) {
        this.mark(session, fresh, source);
        s.fingerprints.push(...fresh.map(m => fp(m.text)));
        const lines = fresh.map(entryText);
        s.doc = s.doc.trim() ? s.doc + (s.doc.includes(PENDING_MARK) ? '\n' : '\n\n' + PENDING_MARK + '\n') + lines.map(l => '· ' + l).join('\n')
          : lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
      }
      const event = session.append('user/message', msg(renewHead(++s.version, session.seq) + '\n' + s.doc, 'task-memory'), { surfaceOp: 'append' });
      s.seq = event.seq; s.dirty = false; s.lastVersionStep = s.steps;
      this.hub.action(session, 'workdocVersions', 1, { version: s.version, source, added: fresh.length });
    } else if (list.length) {
      this.mark(session, list, source);
      const all = cfg.supplementMode === 'rewrite' ? this.hub.memories(session).filter(m => s.supplementIds?.includes(m.id) || list.some(n => n.id === m.id)) : list;
      const replace = cfg.supplementMode === 'rewrite' && session.surface.nodes.includes(s.seq);
      const event = session.append('user/message', msg(SUPPLEMENT_HEAD + '\n' + all.map((m, i) => `${i + 1}. ${entryText(m)}`).join('\n'), 'task-memory'),
        { surfaceOp: replace ? { op: 'replace', startSeq: s.seq, endSeq: s.seq } : 'append', ...(replace ? { sourceEventSeqs: [s.seq] } : {}) });
      s.seq = event.seq; s.supplementIds = all.map(m => m.id);
    }
    this.save(session);
  }
  async preStep(agent, offered, signal) {
    const session = agent.session; if (session.header.origin === 'subagent') return;
    const s = this.record(session), cfg = this.hub.config();
    if (!s.opened) { this.injectOpening(session, this.opening(session), 'startup'); s.opened = true; }
    s.steps++;
    const throttle = cfg.supplementMode !== 'renew' || !cfg.supplementMinSteps || !s.doc || s.steps - s.lastVersionStep >= cfg.supplementMinSteps;
    let delivered = false;
    if (s.pending.length && throttle) {
      const ids = s.pending.splice(0), fresh = this.hub.memories(session).filter(m => ids.includes(m.id) && !s.ids.includes(m.id));
      if (fresh.length) { this.deliver(session, fresh, 'proactive'); delivered = true; }
    }
    const firstUser = !s.taskDone && offered.find(m => m.source?.kind === 'user');
    if (firstUser) {
      s.taskDone = true;
      const pool = this.unseen(session), query = textOf(firstUser).trim();
      if (query && pool.length && this.canSupplement(session)) {
        const picked = this.pick(agent, query, pool, { allBelow: 0, signal, purpose: 'task' }).then(r => r.hits.slice(0, cfg.injectBatch));
        let timer;
        try {
          const hits = await Promise.race([picked, new Promise(resolve => { timer = setTimeout(() => resolve(undefined), cfg.injectPickTimeoutMs); timer.unref(); })]);
          if (hits === undefined) void picked.then(list => this.enqueue(session, list)).catch(() => {});
          else if (hits.length) { this.deliver(session, hits, 'task'); delivered = true; }
        } finally { clearTimeout(timer); }
      }
    }
    if (s.dirty && s.doc && throttle && !delivered && cfg.supplementMode === 'renew') this.deliver(session, [], 'renew-doc');
    this.save(session);
  }
  applyWorkdoc(session, snapshot, text) {
    const s = this.record(session);
    if (this.hub.config().supplementMode === 'renew' && snapshot && s.doc === snapshot && typeof text === 'string' && text.trim() && text.trim() !== s.doc) { s.doc = text.trim(); s.dirty = true; }
  }
  async compact(agent, signal) {
    const session = agent.session, state = this.hub.store.state(session.id), s = this.record(session);
    s.opened = true; s.ids = []; s.pending = []; s.fingerprints = []; s.doc = ''; s.dirty = false; s.taskDone = true; s.supplementIds = [];
    const lastUser = session.snapshotEvents().findLast(e => e.type === 'user/message' && e.data.source.kind === 'user');
    const query = [textOf(lastUser?.data), state.pins.join('\n'), state.status].filter(Boolean).join('\n');
    const pinned = this.pinned(session), pool = this.hub.memories(session).filter(m => !pinned.some(p => p.id === m.id));
    const hits = query ? (await this.pick(agent, query, pool, { allBelow: 0, signal, purpose: 'compact' })).hits.slice(0, this.hub.config().injectBatch) : this.opening(session);
    this.injectOpening(session, [...new Map([...pinned, ...hits].map(m => [m.id, m])).values()], 'compact');
    this.save(session);
  }
  dispose(id) { for (const [c, sid] of this.controllers) if (!id || sid === id) c.abort(); }
}
