import { createModule } from '../lib/host/tool-workflow.factory.mjs';
import dependencies from '../lib/host/dependencies.json' with { type: 'json' };
import { mountHostComponent } from './host-component.mjs';
export const name = 'dsh-workflow-tool';
export const inject = ['loader', 'dshWorkflow'];
export const apply = (ctx, config) => mountHostComponent(ctx, 'tool-workflow', createModule, dependencies['tool-workflow'], config);
