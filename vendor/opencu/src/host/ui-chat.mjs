import { Config, apply as nativeApply } from '../../vendor/dsh-chat/lib/index.js';
import { legacySettings } from '../legacy-settings.mjs';
export { Config };
export const inject = ['settings'];
export async function apply(ctx) {
  nativeApply(ctx);
  const namespace = ctx.fiber.entry.options.id;
  const legacy = await legacySettings(ctx, namespace, Config, ['ui-chat']);
  legacy.persist();
}
