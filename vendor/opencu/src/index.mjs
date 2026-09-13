import { Config } from './config.mjs';
import { acquireComputerUse } from './integration.mjs';
export { Config };
export const name = 'opencu';
export const inject = ['llm', 'agents', 'sessions', 'settings', 'sessionProjections', 'tools'];
export function apply(ctx, config) { acquireComputerUse(ctx, { config }); }
