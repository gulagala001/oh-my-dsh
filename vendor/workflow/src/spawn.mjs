import { createModule } from '../lib/host/workflow-spawn.factory.mjs';
import dependencies from '../lib/host/dependencies.json' with { type: 'json' };
import { loadHostModule } from './host-component.mjs';
import { acquireShared } from './shared.mjs';
export const name = 'dsh-workflow-spawn';
export const inject = ['loader', 'dshWorkflow'];
export async function apply(ctx) {
  const component = await loadHostModule(ctx, 'subagent-spawn-in-process', createModule, dependencies['workflow-spawn']);
  await acquireShared(ctx, 'spawn', component);
}
