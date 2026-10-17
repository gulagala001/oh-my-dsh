export const usage = { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 };
export const textReply = text => ({ chunks: [{ delta: { role: 'assistant', content: text }, finish_reason: 'stop', usage }] });
export function toolReply(name, args, id, { split = 0 } = {}) {
  const json = JSON.stringify(args);
  if (!split) return { chunks: [{ delta: { role: 'assistant', tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: json } }] }, finish_reason: 'tool_calls', usage }] };
  const at = Math.max(1, Math.min(json.length - 1, split));
  return { chunks: [
    { delta: { role: 'assistant', tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: json.slice(0, at) } }] }, finish_reason: null },
    { delta: { tool_calls: [{ index: 0, function: { arguments: json.slice(at) } }] }, finish_reason: 'tool_calls', usage },
  ] };
}
export const toolNames = payload => (payload.tools ?? []).map(tool => tool.function.name);
export const userText = payload => payload.messages.filter(message => message.role === 'user').map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).join('\n');
