import { hash, userRevision } from './core.mjs';
import { requestImagesState } from '../image-request-state.mjs';

export const cachedRouteKey = request => hash(['provider', 'model', 'reasoningEffort', 'temperature', 'maxTokens', 'stop'].map(key => request[key]));
export const cachedBudgetReason = '主执行前缀和预处理提示超过输入预算；请提高预处理输入预算或手动压缩，原文保留';

// Retain the newest and smallest successful prefixes for one route. A growing
// request must not evict the only prefix with room for a bounded summary task.
// Oversized requests retain metadata only; no snapshot is persisted to disk.
export class RequestSnapshots {
  constructor(invalidate, imageCheck = () => null) {
    this.invalidate = invalidate; this.imageCheck = imageCheck; this.pending = new Map(); this.requests = new Map();
    this.smallest = new Map(); this.latest = new Map(); this.owners = new Map(); this.serial = 0;
  }
  capture(session, options, maxBytes) {
    const id = session.id, key = cachedRouteKey(options);
    let owner = this.owners.get(id);
    if (owner && (owner.session !== session || owner.key !== key)) {
      this.drop(id); this.invalidate?.(id); owner = null;
    }
    if (!owner) { owner = { session, key }; this.owners.set(id, owner); }
    const { signal, ...request } = options;
    const bytes = Buffer.byteLength(JSON.stringify(request));
    this.pending.set(id, { session, owner, provider: request.provider, model: request.model,
      request: bytes <= maxBytes ? request : null, bytes,
      images: requestImagesState(options), throughSeq: session.snapshotEvents().at(-1)?.seq ?? -1, userRevision: userRevision(session) });
  }
  confirm(session, route) {
    const id = session.id, snapshot = this.pending.get(id);
    if (!snapshot || snapshot.session !== session || route && (snapshot.provider !== route.provider || snapshot.model !== route.model)) return false;
    snapshot.version = ++this.serial;
    this.latest.set(id, snapshot); this.pending.delete(id);
    if (snapshot.request) {
      this.requests.set(id, snapshot);
      if (!this.smallest.has(id) || snapshot.bytes < this.smallest.get(id).bytes) this.smallest.set(id, snapshot);
    }
    return true;
  }
  candidates(session) {
    return [...new Set([this.requests.get(session.id), this.smallest.get(session.id)])]
      .filter(snapshot => snapshot?.session === session && this.current(snapshot));
  }
  current(snapshot) { return this.owners.get(snapshot.session.id) === snapshot.owner && !this.imageCheck(snapshot); }
  version(session) { return this.latest.get(session.id)?.version ?? 0; }
  waitingReason(session) {
    const blocked = this.requests.get(session.id);
    if (blocked && this.imageCheck(blocked)) return this.imageCheck(blocked);
    return this.latest.get(session.id)?.request === null ? cachedBudgetReason : '等待主执行成功请求的缓存快照';
  }
  drop(id) {
    for (const map of [this.pending, this.requests, this.smallest, this.latest, this.owners]) {
      if (id) map.delete(id); else map.clear();
    }
  }
}
