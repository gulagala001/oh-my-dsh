import { createRequire } from 'node:module';
import { executeNativeTool } from '../../src/host/native-tool-call.mjs';
const host = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
export const { NativeToolExecutor } = await import(host.resolve('@deepseek-ai/dsh-tool-executor-native'));
export async function installTools(ctx, mode = 'native') {
  await ctx.plugin((await import(host.resolve('@deepseek-ai/dsh-tools'))).ToolRuntime);
  await ctx.plugin(await import(host.resolve('@deepseek-ai/dsh-tool-executor-' + mode)));
}
export async function executeTool(ctx, input) {
  if (input.parent !== undefined) return executeNativeTool(ctx, input);
  const { name, arguments: args, callId, ...context } = input;
  const result = await ctx.tools.execute({ ...context, calls: [{ type: 'tool-call', name, id: callId, arguments: JSON.stringify(args) }] });
  return result.results[0].result;
}
