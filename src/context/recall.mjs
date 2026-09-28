import { RECALL_DESCRIPTION } from './prompts.mjs';
import { usesDreamRecall, dreamRecallContent } from '../dream/recall.mjs';
export function registerContextRecall(ctx, hub) {
  ctx.tools.register({ name: 'recall', description: RECALL_DESCRIPTION,
    parameters: { type: 'object', additionalProperties: false, properties: {
      memory: { type: 'string', enum: ['global','project','session','projects','sessions'], description: 'Read a saved Dream memory, or page through the project/session directory. Does not generate memory.' },
      project: { type: 'string', description: 'Exact project ID returned by the directory.' },
      sessionId: { type: 'string', description: 'Explicitly read any other session, including independent sessions, without resuming it. Combine with id, from/to, or memory=session.' },
      reference: { type: 'string', description: 'Exact immutable source reference returned by a memory read. Use query=sources with its nextSources cursor to page through provenance.' },
      id: { type: 'string', description: 'Saved summary ID. Returns its detailed documents verbatim.' },
      asset: { type: 'integer', minimum: 1, description: 'Reopen one saved image or file, indexed from 1 in the record attachment list. Requires id or from/to.' },
      query: { type: 'string', description: 'Optional text filter over the visible summary catalog.' },
      cursor: { type: 'string', description: 'Continue the same read with its returned nextCursor; for provenance use nextSources with reference and query=sources. Preserve all other target parameters.' },
      from: { type: 'integer', description: 'First event sequence in this session for original-text retrieval.' },
      to: { type: 'integer', description: 'Last event sequence in this session for original-text retrieval.' },
    }, oneOf: [
      { required: ['id'], not: { anyOf: [{ required: ['from'] }, { required: ['to'] }] } },
      { required: ['from', 'to'], not: { required: ['id'] } },
      { not: { anyOf: [{ required: ['id'] }, { required: ['from'] }, { required: ['to'] }] } },
    ] },
    output: { schema: { type: 'string' }, render: (_args, value) => JSON.parse(value).content },
    execute(args, { agent, signal }) {
      signal?.throwIfAborted();
      return usesDreamRecall(args)?dreamRecallContent(hub,args,agent.session,signal).then(content=>JSON.stringify({content})):JSON.stringify({content:hub.context.recallContent(agent.session,args)});
    },
  });
}
