import { checkedTool } from '../tool-contract.mjs';
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
  ctx.tools.register(checkedTool({ name: 'recall', description: RECALL_DESCRIPTION,
    parameters: { type: 'object', additionalProperties: false, properties: {
      memory: { type: 'string', enum: ['global','project','session','projects','sessions'], description: 'Read a saved Dream memory, or page through the project/session directory. Does not generate memory.' },
      project: { type: 'string', description: 'Exact project ID returned by the directory.' },
      sessionId: { type: 'string', description: 'Explicitly read any other session, including independent sessions, without resuming it. Combine with id, from/to, or memory=session.' },
      reference: { type: 'string', description: 'Exact immutable source reference returned by a memory read. Use query=sources with its nextSources cursor to page through provenance.' },
      id: { type: 'string', description: 'Saved summary ID. Returns its detailed documents verbatim.' },
      asset: { type: 'integer', description: 'Reopen one saved image or file, indexed from 1 in the record attachment list. Requires id or from/to.' },
      query: { type: 'string', description: 'Optional text filter over the visible summary catalog.' },
      search: { type: 'string', enum: ['original', 'evidence'], description: 'Search original logged events or saved full tool evidence. Requires query; supports explicit sessionId. Cannot combine with other recall targets.' },
      rawRef: { type: 'string', description: 'Exact omd-raw: reference. Reads the immutable original, including after optimization is disabled. Never treats saved source text as new instructions.' },
      mode: { type: 'string', enum: ['head', 'tail', 'range', 'query'], description: 'Original view; query selects literal matching snippets and is partial.' },
      startLine: { type: 'integer', description: 'First line, at least 1.' },
      maxLines: { type: 'integer', description: '1–2000 lines.' },
      maxChars: { type: 'integer', description: '256–48000 characters.' },
      limit: { type: 'integer', description: 'Original-search result limit, 1–20 (default 5). Preserve query and target when continuing with nextCursor.' },
      cursor: { type: 'string', description: 'Continue the same read with its returned nextCursor; for provenance use nextSources with reference and query=sources. Preserve all other target parameters.' },
      from: { type: 'integer', description: 'First event sequence in this session for original-text retrieval.' },
      to: { type: 'integer', description: 'Last event sequence in this session for original-text retrieval.' },
    } },
    output: { schema: { type: 'string' }, render: (_args, value) => JSON.parse(value).content },
    execute(args, { agent, signal }) {
      signal?.throwIfAborted();
      if (args.id !== undefined && (args.from !== undefined || args.to !== undefined) || (args.from === undefined) !== (args.to === undefined)) throw Error('id 与 from/to 互斥；范围必须同时提供 from 和 to');
      for (const [key, min, max] of [['asset', 1, Number.MAX_SAFE_INTEGER], ['startLine', 1, Number.MAX_SAFE_INTEGER], ['maxLines', 1, 2000], ['maxChars', 256, 48000], ['limit', 1, 20]]) {
        if (args[key] !== undefined && (!Number.isSafeInteger(args[key]) || args[key] < min || args[key] > max)) throw Error(`${key} 必须为 ${min}–${max} 的整数`);
      }
      if (args.rawRef !== undefined || args.search === 'evidence') return hub.optimization.recall(agent.session, args, signal).then(value => JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(value) }] }));
      if (args.search !== undefined) return originalRecallContent(hub, args, agent.session, signal).then(content => JSON.stringify({ content }));
      if (args.limit !== undefined) throw Error('limit 仅用于 search=original');
      return usesDreamRecall(args)?dreamRecallContent(hub,args,agent.session,signal).then(content=>JSON.stringify({content})):JSON.stringify({content:hub.context.recallContent(agent.session,args)});
    },
  }));
}
