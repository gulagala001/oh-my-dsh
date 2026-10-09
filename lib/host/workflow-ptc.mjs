import { createModule } from './workflow-ptc.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const name = 'omd-host-workflow-ptc';
export const inject = ['loader'];
export const apply = (ctx, config) => mountHostComponent(ctx, "workflow-ptc", createModule, ["node:crypto","node:os","node:path","node:vm","@deepseek-ai/schemastery","@deepseek-ai/dsh-workflow","node:fs","@deepseek-ai/dsh-llm","@deepseek-ai/dsh-session","@deepseek-ai/dsh-tools","@deepseek-ai/dsh-util-values","node:fs/promises","@deepseek-ai/node-addon-system/flock","@deepseek-ai/dsh-session-persistence","koffi","node:child_process","@deepseek-ai/dsh-brand"], config);
