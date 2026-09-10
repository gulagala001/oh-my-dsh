export const frameTokens = (nodes = []) => nodes.reduce((sum, node) => sum + (node.tokens || 0), 0);

export function contextHistoryLayout(frames) {
  // Record estimates and reported usage share a fixed scale. Pressure estimates
  // include the request envelope and must not stretch each row's record blocks.
  const max = Math.max(1, ...frames.flatMap(frame => [frameTokens(frame.nodes), frame.inputTokens || 0, frame.cacheReadTokens || 0]));
  return frames.map(frame => ({
    frame,
    tokens: frameTokens(frame.nodes),
    width: frameTokens(frame.nodes) / max * 100,
    inputWidth: (frame.inputTokens || 0) / max * 100,
    cacheWidth: Math.min(frame.cacheReadTokens || 0, frame.inputTokens ?? Infinity) / max * 100,
  }));
}
