import { createModule } from '../lib/host/workflow-ptc.factory.mjs';
import dependencies from '../lib/host/dependencies.json' with { type: 'json' };
import { mountHostComponent } from './host-component.mjs';
export const name = 'dsh-workflow-engine';
export const inject = ['loader', 'dshWorkflow'];
export const apply = (ctx, config) => mountHostComponent(ctx, 'workflow-ptc', createModule, dependencies['workflow-ptc'], { ...config, provider: 'dsh-workflow' });
