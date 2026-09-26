import { createModule } from './workflow-spawn.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const name = 'omd-host-workflow-spawn';
export const inject = ['loader'];
export const apply = (ctx, config) => mountHostComponent(ctx, "subagent-spawn-in-process", createModule, ["node:fs/promises","node:path","node:crypto","@deepseek-ai/dsh-brand","@deepseek-ai/dsh-agent","@deepseek-ai/dsh-session","@deepseek-ai/dsh-llm","@deepseek-ai/dsh-subagent","@deepseek-ai/dsh-tools","node:child_process","@deepseek-ai/node-addon-system/flock","@deepseek-ai/dsh-session-persistence"], config);
