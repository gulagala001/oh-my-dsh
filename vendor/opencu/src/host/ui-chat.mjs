import { Config, apply as nativeApply } from '../../vendor/dsh-chat/lib/index.js';
import { legacySettings } from '../legacy-settings.mjs';
import { prepareChatPreferenceMigration } from './chat-preferences.mjs';
export { Config };
export const inject = ['settings'];
export async function apply(ctx) {
  nativeApply(ctx);
  const namespace = ctx.fiber.entry.options.id;
  const migrate = await prepareChatPreferenceMigration(ctx, namespace);
  const legacy = await legacySettings(ctx, namespace, Config, ['ui-chat']);
  legacy.persist(() => migrate().catch(error => ctx.logger.error('Chat preference migration failed: %s', error.message)));
}
