// Read-only evaluation telemetry. Does not replace tools or mutate requests.
import { appendFileSync } from 'node:fs';
export const inject = ['llm', 'agents', 'sessions', 'omd'];
export function apply(ctx) {
  if (process.env.OMD_DEEPSWE !== '1') throw Error('Evaluation observer requires an isolated evaluation host');
  const record = entry => appendFileSync('/logs/agent/events.jsonl', JSON.stringify({ at: Date.now(), ...entry }) + '\n');
  ctx.on('llm/stream', (request, next) => {
    record({ type: 'model/route', sessionId: request.sessionId, provider: request.provider, model: request.model,
      reasoningEffort: request.reasoningEffort, tools: Array.isArray(request.tools) ? request.tools.map(t => t.name) : undefined });
    return next();
  }, { global: true });
  ctx.on('session/event', (session, event) => record({ type: 'session/event', sessionId: session.id, event }), { global: true });
  ctx.on('agent/status', ({ agent, status }) => record({ type: 'agent/status', sessionId: agent.id, status }), { global: true });
  ctx.on('agent/error', ({ agent, error }) => record({ type: 'agent/error', sessionId: agent.id, error: String(error) }), { global: true });
}
