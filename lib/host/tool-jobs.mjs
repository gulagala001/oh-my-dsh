import { createModule } from './tool-jobs.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const name = 'omd-host-tool-jobs';
export const inject = ['loader'];
export const apply = (ctx, config) => mountHostComponent(ctx, "tool-jobs", createModule, ["@deepseek-ai/schemastery","@deepseek-ai/dsh-llm","@deepseek-ai/dsh-output-retention","@deepseek-ai/dsh-tools","@deepseek-ai/dsh-jobs"], config);
