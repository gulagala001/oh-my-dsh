import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native';
import { setPresentedExecutor } from './host/prompt-provider.mjs';
import { projectToolDeclarations } from './cc-adaptation/adapter.mjs';
export const inject = ['tools', 'systemPrompt', 'omd'];
export function apply(ctx) {
  setPresentedExecutor(ctx, new NativeToolExecutor(ctx), (model, definitions, context) => projectToolDeclarations(ctx, model, definitions, context));
}
