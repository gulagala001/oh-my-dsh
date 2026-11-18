// The website create receipt establishes which chat belongs to us. A browser
// lock establishes when a different window may take over its cleanup.
export function chatIdentity(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/a\/[^/]+\/s\/([a-zA-Z0-9_-]+)\/?$/);
    return url.origin === 'https://chat.deepseek.com' && match ? { id: match[1], url: url.origin + url.pathname } : null;
  } catch { return null; }
}

const legacyKey = 'dsh-deepseek-workbench.pending-temporary.v1';
const prefix = 'dsh-deepseek-workbench.pending-temporary.v2.';
export const liveTemporaryOwners = globalThis[Symbol.for('deepseek-workbench.temporary.owners')] ??= new Set();
const lockName = token => prefix + token;
const keyOf = row => prefix + row.owner;
const valid = row => typeof row?.id === 'string' && chatIdentity(row.url)?.id === row.id;

export async function holdTemporaryOwner(token, locks) {
  if (!locks) return;
  const ready = Promise.withResolvers(), release = Promise.withResolvers();
  const stopped = locks.request(lockName(token), () => { ready.resolve(); return release.promise; });
  stopped.catch(ready.reject);
  await ready.promise;
  return () => { release.resolve(); return stopped; };
}
export function recordTemporary(storage, identity, owner, locked) {
  const row = identity ? {id:identity.id,url:identity.url} : {phase:'creating',id:null};
  storage.setItem(keyOf({owner}), JSON.stringify({...row, owner, locked}));
}
function records(storage) {
  try {
    const rows = JSON.parse(storage.getItem(legacyKey) ?? '[]');
    if (!Array.isArray(rows) || !rows.every(valid)) throw Error();
    const result = rows.map(row => ({...row, legacy:true}));
    for (let i=0;i<storage.length;i++) {
      const key=storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const row=JSON.parse(storage.getItem(key));
      if (!(valid(row) || row?.phase==='creating' && row.id===null) || typeof row.owner!=='string' || keyOf(row)!==key || typeof row.locked!=='boolean') throw Error();
      result.push(row);
    }
    return result;
  } catch { throw Error('临时聊天清理记录损坏，原记录已保留，请恢复记录后重试。'); }
}
function current(storage, row) {
  return records(storage).find(item => item.owner===row.owner && item.id===row.id && !!item.legacy===!!row.legacy);
}
export function forgetTemporary(storage, row) {
  if (!row.legacy) {
    const key=keyOf(row), stored=JSON.parse(storage.getItem(key) ?? 'null');
    if (stored?.id===row.id && stored.owner===row.owner) storage.removeItem(key);
    return;
  }
  const remaining=JSON.parse(storage.getItem(legacyKey) ?? '[]').filter(item=>item.id!==row.id || item.owner!==row.owner);
  if (remaining.length) storage.setItem(legacyKey,JSON.stringify(remaining)); else storage.removeItem(legacyKey);
}

export async function recoverOwners(storage, live, locks, confirmed, remove) {
  const review=[];
  for (const row of records(storage)) {
    if (live.has(row.owner)) continue;
    const approved=confirmed.some(item=>item.id===row.id && item.owner===row.owner && !!item.legacy===!!row.legacy);

    const cleanup=async () => {
      if (live.has(row.owner) || !current(storage,row)) return;
      if ((!row.id || !(locks && row.locked && !row.legacy)) && !approved) { review.push(row); return; }
      if (row.id) await remove(row);
      forgetTemporary(storage,row);
    };
    if (locks) await locks.request(row.legacy ? legacyKey : lockName(row.owner), { ifAvailable:true }, lock=>lock && cleanup());
    else await cleanup();
  }
  return review;
}
