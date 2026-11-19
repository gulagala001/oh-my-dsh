import { createModule } from './token-meter.factory.mjs';
import { mountHostComponent } from '../../src/host-component.mjs';
export const inject=['loader'];
export const apply=(ctx,config)=>mountHostComponent(ctx,"token-meter",createModule,["@deepseek-ai/dsh-session","node:crypto","@deepseek-ai/cordis","@deepseek-ai/dsh-llm","zod"],config);
