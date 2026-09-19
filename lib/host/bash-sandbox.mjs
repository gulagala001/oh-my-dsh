import { createModule } from './bash-sandbox.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const name = 'omd-host-bash-sandbox';
export const inject = ['loader'];
export const apply = (ctx, config) => mountHostComponent(ctx, "bash-sandbox", createModule, ["@deepseek-ai/dsh-sandbox","@deepseek-ai/schemastery","@deepseek-ai/dsh-shell","@deepseek-ai/dsh-timeout"], config);
