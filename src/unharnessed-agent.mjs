import * as runtime from '../vendor/unharnessed/index.js';

export const name = 'omd-unharnessed-agent';
export const Config = runtime.Config;
export const inject = runtime.inject;
export async function apply(ctx, config) {
  await runtime.apply(ctx, config, {
    projectionKey: 'omd-unharnessed-cancelled',
    delegationProjectionKey: 'omd-unharnessed-subagents',
    activity: view => ctx.provide('omdUnharnessedRuntime', view),
  });
}
