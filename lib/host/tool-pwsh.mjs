import { createModule } from './tool-pwsh.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const name = 'omd-host-tool-pwsh';
export const inject = ['loader'];
export const apply = (ctx, config) => mountHostComponent(ctx, "tool-pwsh", createModule, ["node:path","@deepseek-ai/schemastery","@deepseek-ai/dsh-tools","@deepseek-ai/dsh-llm","@deepseek-ai/dsh-sandbox","@deepseek-ai/dsh-shell"], config);
