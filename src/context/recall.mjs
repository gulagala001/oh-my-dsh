import { RECALL_DESCRIPTION } from './prompts.mjs';
export function registerContextRecall(ctx, hub) {
  ctx.tools.register({ name: 'recall', description: RECALL_DESCRIPTION,
    parameters: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string', description: 'Saved summary ID. Returns its detailed documents verbatim.' },
      query: { type: 'string', description: 'Optional text filter over the visible summary catalog.' },
      from: { type: 'integer', description: 'First event sequence in this session for original-text retrieval.' },
      to: { type: 'integer', description: 'Last event sequence in this session for original-text retrieval.' },
    }, oneOf: [
      { required: ['id'], not: { anyOf: [{ required: ['from'] }, { required: ['to'] }] } },
      { required: ['from', 'to'], not: { required: ['id'] } },
      { not: { anyOf: [{ required: ['id'] }, { required: ['from'] }, { required: ['to'] }] } },
    ] },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute(args, { agent, signal }) { signal?.throwIfAborted(); return hub.context.recall(agent.session, args); },
  });
}
