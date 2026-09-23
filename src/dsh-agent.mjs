import { registerContextCommands } from './context/commands.mjs';
import { installPromptAdapter } from './cc-adaptation/adapter.mjs';
import { MAIN_PERSONA } from './prompts.mjs';
import { ReplacementCanvas } from './context/host.mjs';
import { registerContextRecall } from './context/recall.mjs';
import { NOTE_DESCRIPTION } from './context/prompts.mjs';
import { registerTasks } from './tasks.mjs';
import { registerRuntimeStatus } from './runtime-state.mjs';
import { registerBudgetCommand } from './task-budget.mjs';

export const inject = ['trisoulX', 'systemPrompt', 'tools', 'llm', 'tokenMeter', 'sessions', 'sessionProjections'];
const result = { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] };
export function apply(ctx) {
  const hub = ctx.trisoulX;
  ctx.systemPrompt.section({ name: 'trisoul-x:persona', order: 0, text: MAIN_PERSONA, interpolate: false });
  installPromptAdapter(ctx);
  new ReplacementCanvas(ctx, hub);
  hub.todoStore = registerTasks(ctx, hub.todoStore);
  ctx.tools.register({ name: 'note', description: NOTE_DESCRIPTION,
    parameters: { type: 'object', properties: { text: { type: 'string', description: 'Note content' } }, required: ['text'] }, output: result,
    async execute({ text }, { agent }) { const state = hub.store.state(agent.session.id); state.notes.push({ text, at: Date.now() }); hub.store.save(state); return text; },
  });
  registerContextRecall(ctx, hub);
  registerRuntimeStatus(ctx, hub);
  ctx.inject(['commands'], commandCtx => { registerContextCommands(commandCtx, hub); registerBudgetCommand(commandCtx, hub); });
}
