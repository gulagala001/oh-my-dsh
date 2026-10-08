import { RECALL_DESCRIPTION } from './prompts.mjs';
import { usesDreamRecall, dreamRecallContent } from '../dream/recall.mjs';
import { searchOriginal, originalSearchContent, validateOriginalSearchArgs } from './original-search.mjs';

export async function originalRecallContent(hub, args, requester, signal) {
  signal?.throwIfAborted();
  validateOriginalSearchArgs(args, args.sessionId ?? requester.id);
  let target = requester;
  if (args.sessionId !== undefined && args.sessionId !== requester.id) {
    const snapshot = await hub.dream.sources.read(args.sessionId, signal);
    target = { id: args.sessionId, header: snapshot.header, inheritedEventCount: snapshot.inherited,
      snapshotEvents: () => snapshot.events };
  }
  return originalSearchContent(await searchOriginal(target, args, { signal }));
}
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
      search: { type: 'string', enum: ['original'], description: 'Explicitly search original logged messages and tool output. Requires query. Defaults to this session; use sessionId for another session. Cannot combine with memory, reference, id, asset or from/to.' },
      limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Original-search result limit (default 5). Preserve query and target when continuing with nextCursor.' },
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
      if (args.search !== undefined) return originalRecallContent(hub, args, agent.session, signal).then(content => JSON.stringify({ content }));
      if (args.limit !== undefined) throw Error('limit 仅用于 search=original');
      return usesDreamRecall(args)?dreamRecallContent(hub,args,agent.session,signal).then(content=>JSON.stringify({content})):JSON.stringify({content:hub.context.recallContent(agent.session,args)});
    },
  });
}
