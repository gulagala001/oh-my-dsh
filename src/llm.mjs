const loaders = {
  'openai-completions': () => import('@earendil-works/pi-ai/api/openai-completions'),
  'openai-responses': () => import('@earendil-works/pi-ai/api/openai-responses'),
  'anthropic-messages': () => import('@earendil-works/pi-ai/api/anthropic-messages'),
  'google-generative-ai': () => import('@earendil-works/pi-ai/api/google-generative-ai'),
};
export const APIS = Object.keys(loaders);

export async function callModel(route, context, { signal, onEvent = () => {}, sessionId } = {}) {
  if (!route?.model || !route.baseUrl) throw new Error('先在设置中填写模型和 API 地址。');
  if (!loaders[route.api]) throw new Error(`未知模型协议：${route.api}`);
  const api = await loaders[route.api]();
  const model = {
    id: route.model, name: route.model, api: route.api,
    provider: `trisoul_x:${route.api}:${route.baseUrl}`, baseUrl: route.baseUrl,
    reasoning: Boolean(route.reasoning), input: ['text'],
    contextWindow: Number(route.contextWindow) || 128000,
    maxTokens: Number(route.maxTokens) || 16384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsDeveloperRole: false, supportsStore: false, supportsStrictMode: false, ...route.compat },
  };
  const options = {
    apiKey: route.apiKey || 'local', signal, sessionId,
    maxTokens: model.maxTokens,
    ...(route.reasoning ? { reasoning: route.reasoning } : {}),
  };
  const stream = (route.reasoning ? api.streamSimple : api.stream)(model, context, options);
  for await (const event of stream) {
    if (event.type === 'text_delta' || event.type === 'thinking_delta') onEvent({ type: event.type, delta: event.delta });
    if (event.type === 'toolcall_end') onEvent({ type: 'tool_call', call: event.toolCall });
  }
  const message = await stream.result();
  if (message.stopReason === 'error' || message.stopReason === 'aborted') {
    const error = new Error(message.errorMessage || message.stopReason);
    error.partial = message;
    throw error;
  }
  return message;
}
