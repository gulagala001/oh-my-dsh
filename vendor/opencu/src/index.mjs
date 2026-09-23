import { legacySettings } from './legacy-settings.mjs';
import { Config } from './config.mjs';
import { acquireComputerUse } from './integration.mjs';
export { Config };
export const name = 'opencu';
export const inject = ['llm', 'agents', 'sessions', 'settings', 'sessionProjections', 'tools'];
export async function apply(ctx, config) {
  const legacy = await legacySettings(ctx, 'opencu', Config);
  let overlay = legacy.value;
  await acquireComputerUse(ctx, { config, getConfig: () => overlay, namespace: 'opencu' });
  legacy.persist(() => { overlay = {}; });
}
