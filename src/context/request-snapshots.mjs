import { lastAssistantStreamChunk } from '@deepseek-ai/dsh-llm';
import { usageReceipt } from '../metering/usage.mjs';
import { measureRequest } from '../metering/estimate.mjs';
import { hash, userRevision } from './core.mjs';
import { requestImagesState } from '../image-request-state.mjs';

export const cachedRouteKey = request => hash(['provider', 'model', 'reasoningEffort', 'temperature', 'maxTokens', 'stop'].map(key => request[key]));
export const cachedBudgetReason = '当前缓存前缀不适合本次输入预算，使用完整分段请求';

// Keep successful candidate prefixes, ordered by recency. Admission is in
// input tokens; memory retention is independent of the model input limit.
// Snapshots are an optimization, never a prerequisite for compression.
export class RequestSnapshots {
  constructor(invalidate, imageCheck = () => null, measure = measureRequest, identity = () => null) {
    this.identity=identity; this.measure = measure; this.history = new Map(); this.invalidate = invalidate; this.imageCheck = imageCheck; this.pending = new Map(); this.requests = new Map();
    this.smallest = new Map(); this.latest = new Map(); this.owners = new Map(); this.serial = 0;
  }
  capture(session, options, maxTokens) {
    const id = session.id, key = cachedRouteKey(options), stamp=this.identity(options);
    let owner = this.owners.get(id);
    if (owner && (owner.session !== session || owner.key !== key || owner.stamp !== stamp || owner.generation !== session.surface.replaceGeneration)) {
      this.drop(id); this.invalidate?.(id); owner = null;
    }
    if (!owner) { owner = { session, key, stamp, generation:session.surface.replaceGeneration, route:Object.fromEntries(['provider','model','reasoningEffort','temperature','maxTokens','stop'].filter(k=>options[k]!==undefined).map(k=>[k,options[k]])) }; this.owners.set(id, owner); }
    const { signal, ...request } = options;
    const bytes = Buffer.byteLength(JSON.stringify(request));
    const tokens = this.measure(request).tokens;
    this.pending.set(id, { session, owner, provider: request.provider, model: request.model,
      request: bytes <= 64 * 1024 * 1024 ? request : null, bytes, tokens, inputLimit:maxTokens??Infinity,
      replaceGeneration:session.surface.replaceGeneration, images: requestImagesState(options), throughSeq: session.snapshotEvents().at(-1)?.seq ?? -1, userRevision: userRevision(session) });
  }
  confirm(session, route) {
    const id = session.id, snapshot = this.pending.get(id);
    if (!snapshot || snapshot.session !== session || route && (snapshot.provider !== route.provider || snapshot.model !== route.model)) return false;
    const response = session.snapshotEvents().findLast(e=>e.type==='assistant/message');
    const usage = response?.data?.usage ?? lastAssistantStreamChunk(response?.data?.stream ?? [],'usage')?.usage;
    snapshot.reportedInput = usageReceipt(usage).inputTotalTokens;
    if((snapshot.reportedInput??snapshot.tokens)>snapshot.inputLimit)snapshot.request=null;
    snapshot.version = ++this.serial;
    this.latest.set(id, snapshot); this.pending.delete(id);
    if (snapshot.request) {
      this.requests.set(id, snapshot);
      const history = this.history.get(id) ?? [];
      history.push(snapshot);
      // Represent the usable cost range instead of keeping only a recent
      // cluster near the limit. Evict the most redundant interior cost point;
      // byte and entry bounds are cache resources, never token conversions.
      let retainedBytes=history.reduce((n,item)=>n+item.bytes,0);
      while(history.length>1&&(history.length>64||retainedBytes>64*1024*1024)) {
        const sorted=history.slice().sort((a,b)=>(a.reportedInput??a.tokens)-(b.reportedInput??b.tokens));
        let victim=history.find(item=>item!==snapshot),gap=Infinity;
        for(let i=1;i<sorted.length-1;i++)if(sorted[i]!==snapshot){
          const cost=(sorted[i+1].reportedInput??sorted[i+1].tokens)-(sorted[i-1].reportedInput??sorted[i-1].tokens);
          if(cost<gap){gap=cost;victim=sorted[i];}
        }
        retainedBytes-=victim.bytes;history.splice(history.indexOf(victim),1);
      }
      this.history.set(id,history);
      this.smallest.set(id,history.reduce((a,b)=>(a.reportedInput??a.tokens)<=(b.reportedInput??b.tokens)?a:b));
    }
    return true;
  }
  measurement(request, snapshot) {
    const measured = this.measure(request);
    if (snapshot?.reportedInput == null) return measured;
    // Callers verify the entire immutable prefix before using this sample.
    const delta = measured.tokens - this.measure(snapshot.request).tokens;
    return { ...measured, tokens:Math.max(0,snapshot.reportedInput + delta), precision:'reported-prefix+estimated-tail' };
  }
  candidates(session) {
    return [...new Set([...(this.history.get(session.id) ?? []).slice().reverse(), this.smallest.get(session.id)])]
      .filter(snapshot => snapshot?.session === session && this.current(snapshot));
  }
  current(snapshot) { return this.owners.get(snapshot.session.id) === snapshot.owner && snapshot.replaceGeneration === snapshot.session.surface.replaceGeneration && snapshot.owner.stamp===this.identity(snapshot.request) && !this.imageCheck(snapshot); }
  version(session) { return this.latest.get(session.id)?.version ?? 0; }
  waitingReason(session) {
    const blocked = this.requests.get(session.id);
    if (blocked && this.imageCheck(blocked)) return this.imageCheck(blocked);
    return this.latest.get(session.id)?.request === null ? cachedBudgetReason : '等待主执行成功请求的缓存快照';
  }
  drop(id) {
    for (const map of [this.pending, this.requests, this.smallest, this.latest, this.owners, this.history]) {
      if (id) map.delete(id); else map.clear();
    }
  }
}
