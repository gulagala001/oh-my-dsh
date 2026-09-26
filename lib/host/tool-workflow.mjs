import { createModule } from './tool-workflow.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const name = 'omd-host-tool-workflow';
export const inject = ['loader'];
export const apply = (ctx, config) => mountHostComponent(ctx, "tool-workflow", createModule, ["@deepseek-ai/schemastery","@deepseek-ai/dsh-tools"], config);
