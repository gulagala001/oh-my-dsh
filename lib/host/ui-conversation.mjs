import { Config, apply as nativeApply } from '../../vendor/dsh/ui-conversation/lib/index.js';
import { legacySettings } from '#opencu/src/legacy-settings.mjs';
export { Config };
export const inject = ['settings'];
export async function apply(ctx) {
  nativeApply(ctx);
  const legacy = await legacySettings(ctx, 'omd-ui-conversation', Config, ['ui-conversation']);
  legacy.persist();
}
