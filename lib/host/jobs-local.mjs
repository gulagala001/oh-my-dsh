import { createModule } from './jobs-local.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const name = 'omd-host-jobs-local';
export const inject = ['loader'];
export const apply = (ctx, config) => mountHostComponent(ctx, "jobs-local", createModule, ["node:crypto","@deepseek-ai/schemastery","@deepseek-ai/dsh-scope","@deepseek-ai/dsh-timeout","@deepseek-ai/dsh-jobs"], config);
