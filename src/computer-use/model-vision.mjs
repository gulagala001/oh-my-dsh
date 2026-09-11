// Mirror DSH's pending selection -> last request -> default order. Do not
// rewrite model metadata or silently route a screenshot to another model.
export async function computerVision(ctx, session, route) {
  route ??= (session && ctx.sessionProjections?.stateOf(session, 'modelSelection')?.pending)
    ?? session?.requestHeader()?.config ?? ctx.get?.('agentDefaultModel')?.currentSelection();
  if (!route?.provider || !route?.model) return { input: 'unknown' };
  const selected = { provider: route.provider, model: route.model };
  try {
    const info = typeof ctx.llm.resolveModelInfo === 'function' ? await ctx.llm.resolveModelInfo(route.provider, route.model)
      : (await ctx.llm.listModels(route.provider)).find(model => model.id === route.model);
    return { ...selected, name: info?.name ?? route.model, input: Array.isArray(info?.inputModalities) ? info.inputModalities.includes('image') ? 'image' : 'text' : 'unknown' };
  } catch { return { ...selected, input: 'unknown' }; }
}
export const TEXT_ONLY_SCREENSHOT_NOTICE = 'Screenshot captured, but the current model configuration accepts text only: the host omits this image from model input. You have not seen its pixels. Use available accessibility text, or ask the user to select an image-capable model for visual work. Do not claim to have inspected this screenshot.';
