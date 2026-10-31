import { createModule } from './compaction.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const inject=['loader'];
export const apply=(ctx,config)=>mountHostComponent(ctx,"compaction-basic",createModule,["@deepseek-ai/dsh-compaction-basic","@deepseek-ai/dsh-llm","@deepseek-ai/dsh-util-values"],config);
