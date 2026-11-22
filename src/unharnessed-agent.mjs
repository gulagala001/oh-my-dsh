import * as runtime from '../vendor/unharnessed/index.js';

export const name = 'omd-unharnessed-agent';
export const Config = runtime.Config;
export const inject = runtime.inject;
export async function apply(ctx, config, { agentScopedPersona = false } = {}) {
  await runtime.apply(ctx, config, {
    projectionKey: 'omd-unharnessed-cancelled',
    delegationProjectionKey: 'omd-unharnessed-subagents',
    subagentsAllowed: () => ctx.get('omd')?.config().experimentalUnharnessedSubagentsEnabled !== false,
    activity: view => ctx.provide('omdUnharnessedRuntime', view),
    agentScopedPersona,
  });
}
