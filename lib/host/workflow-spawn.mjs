import { createModule } from './workflow-spawn.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const name = 'omd-host-workflow-spawn';
export const inject = ['loader'];
export const apply = (ctx, config) => mountHostComponent(ctx, "subagent-spawn-in-process", createModule, ["node:crypto","node:fs/promises","node:path","@deepseek-ai/dsh-session","node:child_process","@deepseek-ai/node-addon-system/flock","@deepseek-ai/dsh-session-persistence"], config);
