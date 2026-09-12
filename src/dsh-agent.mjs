import { MAIN_PERSONA, NOTE_GUIDE } from './prompts.mjs';
import { Canvas } from './canvas.mjs';
import { eventText, sessionEvents, substantive } from './hub.mjs';
import { registerTasks } from './tasks.mjs';
import { registerComputerTools } from './computer-use/tools.mjs';

export const inject = ['trisoulX', 'systemPrompt', 'tools', 'llm', 'tokenMeter', 'sessions', 'sessionProjections'];
const result = { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] };
export function apply(ctx) {
  const hub = ctx.trisoulX;
  ctx.systemPrompt.section({ name: 'trisoul-x:persona', order: 0, text: ['You are Oh My DSH.', MAIN_PERSONA, "Respond in the user's language."].join('\n\n') });
  const canvas = new Canvas(ctx, hub);
  hub.canvas = canvas;
  ctx.effect(() => () => { if (hub.canvas === canvas) hub.canvas = undefined; });
  hub.todoStore = registerTasks(ctx, hub.todoStore);
  registerComputerTools(ctx, hub);
  ctx.tools.register({ name: 'note', description: NOTE_GUIDE,
    parameters: { type: 'object', properties: { text: { type: 'string', description: 'Note content' } }, required: ['text'] }, output: result,
    async execute({ text }, { agent }) { const state = hub.store.state(agent.session.id); state.notes.push({ text, at: Date.now() }); hub.store.save(state); return text; },
  });
  ctx.tools.register({ name: 'recall',
    description: 'Search your long-term memory, or retrieve the verbatim text behind a condensed work record. (1) Recall: pass query (natural language) to get related memories (scoped to this session’s selected memory range); optionally narrow with scope. (2) Retrieve originals: condensed records in the context are tagged with "seq a..b" — when you need the original content that was condensed away, pass {from:a,to:b} to get the raw event text of that span verbatim (no model rewriting).',
    parameters: { type: 'object', required: ['query'], properties: {
      query: { type: 'string', description: 'What to recall (natural language); when retrieving originals, state the purpose' },
      scope: { type: 'string', enum: ['all', 'global', 'cross', 'project'], description: 'Memory layer: all (default, everything visible to this session) / global / cross (cross-project) / project (this project)' },
      from: { type: 'integer', description: 'First event sequence to retrieve' }, to: { type: 'integer', description: 'Last event sequence to retrieve' },
    } }, output: result,
    async execute(a, { agent, signal }) {
      const session = agent.session;
      if (Number.isInteger(a.from) && Number.isInteger(a.to)) {
        const lo = Math.min(a.from, a.to), hi = Math.max(a.from, a.to);
        const events = sessionEvents(session).filter(e => e.seq >= lo && e.seq <= hi && substantive(e));
        hub.action(session, 'rawRecalls', 1, { query: a.query, from: a.from, to: a.to, items: events.length });
        return events.map(e => `[${e.seq} ${e.type}] ${eventText(session, e)}`).join('\n') || 'No messages in this range.';
      }
      const pool = hub.memories(session).filter(m => !a.scope || a.scope === 'all' || m.scope === a.scope);
      const { hits, mode } = await hub.memoryContext.pick(agent, a.query, pool, { signal });
      hub.store.touch(hits.map(m => m.id), 'recalled', session.id);
      hub.action(session, 'recalls', 1, { query: a.query, items: hits.length, mode });
      return hits.map(m => `[${m.scope} · ${m.key}] ${m.text}`).join('\n') || 'No related memories.';
    },
  });
}
