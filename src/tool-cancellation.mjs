export function cancellationMessage(reason) {
  try {
    if (reason instanceof Error || typeof reason?.message === 'string') return reason.message;
    if (reason?.kind === 'user') return 'tool call cancelled by user';
    if (reason?.kind === 'parent') return 'tool call cancelled by parent';
    if (reason?.kind === 'disposed') return 'tool call cancelled because its owner was disposed';
    if (reason?.kind === 'hook' && typeof reason.reason === 'string') return `tool call cancelled by hook: ${reason.reason}`;
    return typeof reason === 'object' && reason !== null ? JSON.stringify(reason) ?? String(reason) : String(reason);
  } catch { return '[unrenderable error]'; }
}

// Retain OMD's readable cancellation results through native extension points.
// The host continues to own dispatch, policies, signals and terminal outcomes.
export function installToolCancellationPresentation(ctx) {
  ctx.on('tools/execute', async (exec, next) => {
    const signal = exec.signal;
    const result = await next();
    if (!signal.aborted || !['ABORTED','ABORTED_BEFORE_DISPATCH'].includes(result.error?.info?.code)) return result;
    const message = cancellationMessage(signal.reason);
    return { ...result, error: { ...result.error, message },
      content: [{ type: 'text', text: `Error: ${message}` },
        ...result.content.filter(block => block.type !== 'text' || block.text !== `Error: ${result.error.message}`)] };
  }, { global: true, prepend: true });
}
