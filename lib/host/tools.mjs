import { createModule } from './tools.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const name = 'omd-host-tools';
export const inject = ['loader'];
export const apply = (ctx, config) => mountHostComponent(ctx, "tools", createModule, ["@deepseek-ai/cordis","@deepseek-ai/schemastery","@deepseek-ai/dsh-scope","@deepseek-ai/dsh-llm","@deepseek-ai/dsh-util-values","@deepseek-ai/dsh-brand","@deepseek-ai/dsh-sandbox"], config);
