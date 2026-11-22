import { join } from 'node:path';
import * as unharnessed from './unharnessed-agent.mjs';
import { isUnharnessedHeadlessProfile } from './experimental-presets.mjs';

export const name = 'omd-unharnessed-headless';
export const inject = ['headlessStartup', 'profileContext'];

export function apply(ctx) {
  const profile = ctx.profileContext;
  if (!isUnharnessedHeadlessProfile(profile)) return;

  let ready = false;
  let failure;
  ctx.on('agent/created', () => {
    if (!ready) throw Error('Unharnessed 无头运行不可用：' + (failure?.message ?? '所需的 DSH 服务尚未加载'));
  }, { global: true, prepend: true });
  ctx.inject(unharnessed.inject, async scope => {
    try {
      await unharnessed.apply(scope, { stateDirectory: join(profile.dir, 'unharnessed-state') }, { agentScopedPersona: true });
      ready = true;
      scope.effect(() => () => { ready = false; });
    } catch (error) {
      failure = error;
      throw error;
    }
  });
}
