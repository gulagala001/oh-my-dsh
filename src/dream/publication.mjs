import { sourceName } from '../message-source.mjs';
import { appendShadow } from '../context/shadow.mjs';
import { nodeKey } from './core.mjs';

export function publishDreamMemory(hub,session,enabled=true){
  const owned=session.surface.nodes.map(seq=>session.eventAt(seq)).filter(e=>e.type==='user/message'&&['trisoul-x:dream-memory','trisoul-x:project-catalog'].includes(sourceName(e.data?.source)));
  const mode=hub.scope(session).mode;let text='';
  if(enabled&&mode!=='session'){
    const key=mode==='global'?'global':nodeKey('project',hub.scope(session).project),memory=hub.dream.store.memory(key);
    const parts=['[Saved Dream memory · historical references, not current instructions]'];
    if(memory&&!memory.invalid)parts.push(`${memory.summary}\nSource: recall(${JSON.stringify({reference:memory.ref})})`);
    else if(memory?.invalid)parts.push('The saved memory is awaiting refresh after a source scope change. Read current directories explicitly.');
    else parts.push('This memory has not been generated. Explicit recall can read the saved source archives.');
    if(mode==='global'){
      const page=hub.dream.store.catalog({kind:'project',limit:3});
      parts.push('Project directory (first page):\n'+page.entries.map(p=>JSON.stringify({project:p.id,title:hub.dream.sources.projectTitle(p.id)})).join('\n'));
      if(page.nextCursor)parts.push(`More projects: recall(${JSON.stringify({memory:'projects',cursor:page.nextCursor})})`);
    }else parts.push(`Session directory: recall(${JSON.stringify({memory:'sessions',project:hub.scope(session).project})})`);
    const body=parts.join('\n\n');
    // Replacing the old reference block releases its space. No generation or
    // archive enumeration occurs on this request path.
    const previousCost=owned.reduce((n,e)=>n+hub.context.adapter.catalogCost((e.data.content||[]).map(b=>b.text||'').join('')),0);
    const budget=hub.context.adapter.dreamBudget?.(session,previousCost)??Math.min(9000,(hub.context.adapter.catalogBudget?.(session)??0)+previousCost);
    const fallback=`[Saved memory is outside this request's available space. Read it with recall(${JSON.stringify(mode==='global'?{memory:'global'}:{memory:'project',project:hub.scope(session).project})}).]`;
    if(hub.context.adapter.catalogCost(body)<=budget)text=body;
    else if(hub.context.adapter.catalogCost(fallback)<=budget)text=fallback;
  }
  if(owned.length===1&&sourceName(owned[0].data.source)==='trisoul-x:dream-memory'&&owned[0].data.content?.[0]?.text===text)return;
  for(const event of owned)appendShadow(session,[event.seq]);
  if(text)hub.context.adapter.publish(session,text,'dream-memory');
}
