import { createModule } from './tool-bash.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const name = 'omd-host-tool-bash';
export const inject = ['loader'];
export const apply = (ctx, config) => mountHostComponent(ctx, "tool-bash", createModule, ["@deepseek-ai/cordis","@deepseek-ai/schemastery","node:path","@deepseek-ai/dsh-tools","@deepseek-ai/dsh-llm","@deepseek-ai/dsh-sandbox","@deepseek-ai/dsh-shell"], config);
