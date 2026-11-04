import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline';

// Programmatic child calls retain the native policy, cancellation, finalization
// and authoritative result hooks. The owning model batch remains unchanged.
export async function executeNativeTool(ctx, input) {
  const pipeline = new ToolExecutionPipeline(ctx);
  const prepared = await pipeline.prepare(input);
  const outcome = prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared;
  return pipeline.complete(prepared.exec, outcome);
}
