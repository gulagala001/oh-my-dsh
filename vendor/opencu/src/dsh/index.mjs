import { join } from 'node:path';
import { acquireOpenCU, installTools } from './shared.mjs';
import { Config } from './config.mjs';

export const name = 'opencu';
export const inject = [];
export { Config, acquireOpenCU, installTools };
export { renderResult } from './tools.mjs';

/** Standalone installation exposes tools; integrations may install them in a narrower scope. */
export async function apply(ctx, config = {}) {
  if (config.origin || config.token) throw new Error('OpenCU is plugin-managed; external service origin/token are not supported');
  ctx.inject(['settings'], child => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)));
  const options = { namespace: ctx.fiber.entry?.options.id === 'omd-opencu' ? 'omd-opencu' : 'opencu', getConfig: () => ({
    ...Object.fromEntries(Object.entries(config).map(([key, value]) => [key, typeof value?.get === 'function' ? value.get() : value])),
    dataDir: config.dataDir || (process.env.DSH_HOME ? join(process.env.DSH_HOME, 'opencu') : undefined),
  }) };
  const lease = acquireOpenCU(ctx, options);
  for (const key of ['browserEnabled', 'nativeEnabled', 'extensionEnabled', 'managedHeadless']) {
    if (typeof config[key]?.subscribe === 'function') ctx.effect(() => config[key].subscribe(() => {
      void lease.request('reconfigure').catch(error => ctx.logger.error(error));
    }));
  }
  if (config.registerTools !== false) await installTools(ctx, options).ready;
}

export default { name, inject, Config, apply };
