import { Config } from './config.mjs';
import { mountStartup } from './startup.mjs';

export { Config };
export const name = 'oh-my-dsh';
export const inject = ['loader', 'tools', 'llm', 'agents', 'sessions', 'settings', 'tokenMeter', 'sessionProjections', 'sessionPersistence'];

// Keep the client-owning entry importable when an enhancement's dependencies
// are damaged. Cordis tears down a failed child, retaining this entry and UI.
export async function apply(ctx, config) {
  const startup = mountStartup(ctx);
  try {
    ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber));
    await ctx.plugin({ name: 'omd-runtime', async apply(scope) {
      const runtime = await import('./runtime.mjs');
      scope.fiber.assertActive();
      await runtime.apply(scope, config);
    } });
    startup.ready();
  } catch (error) {
    if (startup.fail(error)) ctx.logger.error('Oh My DSH 增强功能启动失败；基础会话界面保留。完整退出 DSH，按原安装来源修复依赖后重启。%s', error?.stack ?? error);
  }
}
