import { registerContextCommands } from './context/commands.mjs';
import { installPromptAdapter } from './cc-adaptation/adapter.mjs';
import { mainPrompt as MAIN_PERSONA } from './cc-adaptation/texts.mjs';
import { ReplacementCanvas } from './context/host.mjs';
import { registerContextRecall } from './context/recall.mjs';
import { installCatalog } from './result-reduction/catalog.mjs';
import { registerContextViews } from './result-reduction/views.mjs';
import { NOTE_DESCRIPTION } from './context/prompts.mjs';
import { registerTasks } from './tasks.mjs';
import { registerRuntimeStatus } from './runtime-state.mjs';
import { registerBudgetCommand } from './task-budget.mjs';

export const inject = ['omd', 'systemPrompt', 'tools', 'llm', 'tokenMeter', 'sessions', 'sessionProjections'];
const result = { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] };
export function apply(ctx) {
  const hub = ctx.omd;
  ctx.systemPrompt.section({ name: 'oh-my-dsh:persona', order: 0, text: MAIN_PERSONA, interpolate: false });
  installPromptAdapter(ctx);
  new ReplacementCanvas(ctx, hub);
  hub.todoStore = registerTasks(ctx, hub.todoStore);
  ctx.tools.register({ name: 'note', description: NOTE_DESCRIPTION,
    parameters: { type: 'object', properties: { text: { type: 'string', description: 'Note content' } }, required: ['text'] }, output: result,
    async execute({ text }, { agent }) { const state = hub.store.state(agent.session.id); hub.store.update(state, { notes: [...state.notes, { text, at: Date.now() }] }); return text; },
  });
  registerContextRecall(ctx, hub);
  installCatalog(ctx, hub);
  registerContextViews(ctx, hub);
  registerRuntimeStatus(ctx, hub);
  ctx.inject(['commands'], commandCtx => { registerContextCommands(commandCtx, hub); registerBudgetCommand(commandCtx, hub); });
}
