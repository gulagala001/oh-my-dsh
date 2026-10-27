import { createModule } from './pwsh-sandbox.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const name = 'omd-host-pwsh-sandbox';
export const inject = ['loader'];
export const apply = (ctx, config) => mountHostComponent(ctx, "pwsh-sandbox", createModule, ["@deepseek-ai/dsh-sandbox","@deepseek-ai/schemastery","@deepseek-ai/dsh-shell","@deepseek-ai/dsh-timeout","node:fs","node:path"], config);
