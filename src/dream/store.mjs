import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, nodeKey, quotaDay, quotaReset, readCursor, cursorFor, LIMITS } from './core.mjs';

const encode = value => JSON.stringify(value);
const decode = row => row ? JSON.parse(row.data) : null;

/** Separate derived store: no writes to the source archives or manual global file. */
export class DreamStore {
  constructor(directory, { now = Date.now } = {}) {
    mkdirSync(join(directory, 'dream-v1'), { recursive: true, mode: 0o700 });
    this.now = now; this.owner = randomUUID(); this.closed = false;
    this.db = new DatabaseSync(join(directory, 'dream-v1', 'memory.sqlite'));
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,project TEXT NOT NULL,shared INTEGER NOT NULL,title TEXT NOT NULL,activity REAL NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_project ON sessions(project,shared,id);
      CREATE TABLE IF NOT EXISTS memories(key TEXT PRIMARY KEY,kind TEXT NOT NULL,target TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS versions(key TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(key,revision));
      CREATE TABLE IF NOT EXISTS progress(node TEXT NOT NULL,source TEXT NOT NULL,fingerprint TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(node,source));
      CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,session TEXT,kind TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sources_session ON sources(session,kind,id);
      CREATE TABLE IF NOT EXISTS edges(node TEXT NOT NULL,revision INTEGER NOT NULL,source TEXT NOT NULL,PRIMARY KEY(node,revision,source));
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,scope TEXT NOT NULL,target TEXT NOT NULL,state TEXT NOT NULL,automatic INTEGER NOT NULL,created REAL NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(state,created);
      CREATE TABLE IF NOT EXISTS job_targets(job TEXT NOT NULL,ordinal INTEGER NOT NULL,kind TEXT NOT NULL,target TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,cut TEXT,PRIMARY KEY(job,ordinal));
      CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY,day TEXT NOT NULL,reserved INTEGER NOT NULL,charged INTEGER NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS calls_day ON calls(day);
      CREATE TABLE IF NOT EXISTS lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,epoch INTEGER NOT NULL,expires REAL NOT NULL);`);
    // Distinguishing "done" from "failed" is required so a retry can revisit a
    // failed target while a single run still advances past it. Existing archives
    // predate the column, so add it in place and keep the schema version.
    if(!this.db.prepare('PRAGMA table_info(job_targets)').all().some(column=>column.name==='failed'))
      this.db.prepare('ALTER TABLE job_targets ADD COLUMN failed INTEGER NOT NULL DEFAULT 0').run();
    const schema = this.meta('schema');
    if (schema !== null && schema !== 1) { this.db.close(); throw Error('Dream 数据版本不兼容；原文件保留'); }
    this.setMeta('schema', 1);
  }
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  meta(key) { return decode(this.db.prepare('SELECT data FROM meta WHERE key=?').get(key)); }
  setMeta(key, value) { this.db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(key, encode(value)); }
  bumpCatalog() { const n = (this.meta('catalogRevision') || 0) + 1; this.setMeta('catalogRevision', n); return n; }
  session(id) { return decode(this.db.prepare('SELECT data FROM sessions WHERE id=?').get(id)); }
  saveSession(value) {
    const old = this.session(value.id);
    if (encode(old) === encode(value)) return false;
    this.tx(() => {
      this.db.prepare(`INSERT INTO sessions VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project=excluded.project,shared=excluded.shared,title=excluded.title,activity=excluded.activity,data=excluded.data`)
        .run(value.id, value.project || '', Number(value.shared), value.title || value.id, value.activity || 0, encode(value));
      if (!old || old.project !== value.project || old.shared !== value.shared || old.title !== value.title || old.available !== value.available || old.readError !== value.readError) this.bumpCatalog();
      if(old?.shared&&(old.project!==value.project||!value.shared)){
        for(const key of [nodeKey('project',old.project),'global']){
          const memory=this.memory(key);if(memory)this.db.prepare('UPDATE memories SET data=? WHERE key=?').run(encode({...memory,invalid:true,notice:'来源范围已改变，等待重新整理'}),key);
        }
      }
    });
    return true;
  }
  sessions({ project, shared = false } = {}) {
    const where = [], args = [];
    if (project !== undefined) { where.push('project=?'); args.push(project); }
    if (shared) where.push('shared=1');
    return this.db.prepare(`SELECT data FROM sessions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`).all(...args).map(decode);
  }
  projects() { return this.db.prepare("SELECT DISTINCT project FROM sessions WHERE shared=1 AND project!='' ORDER BY project").all().map(r => r.project); }
  memory(key, revision) {
    return decode(revision == null ? this.db.prepare('SELECT data FROM memories WHERE key=?').get(key) : this.db.prepare('SELECT data FROM versions WHERE key=? AND revision=?').get(key, revision));
  }
  consumed(key, source) { return this.db.prepare('SELECT fingerprint FROM progress WHERE node=? AND source=?').get(key, source)?.fingerprint; }
  progress(key) { return this.db.prepare('SELECT source,fingerprint,data FROM progress WHERE node=? ORDER BY source').all(key).map(r => ({ ...JSON.parse(r.data), source: r.source, fingerprint: r.fingerprint })); }
  source(id) { return decode(this.db.prepare('SELECT data FROM sources WHERE id=?').get(id)); }
  putSource(source) {
    const existing = this.source(source.id);
    if (existing && encode(existing) !== encode(source)) throw Error('Dream 来源编号发生冲突');
    this.db.prepare('INSERT OR IGNORE INTO sources VALUES(?,?,?,?)').run(source.id, source.sessionId ?? null, source.kind, encode(source));
  }
  acquire(ttl = 60000) {
    return this.tx(() => {
      const before = this.db.prepare('SELECT * FROM lease WHERE id=1').get(), now = this.now();
      if (before && before.expires > now && before.owner !== this.owner) return null;
      const epoch = (before?.epoch || 0) + 1;
      this.db.prepare('INSERT INTO lease VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,epoch=excluded.epoch,expires=excluded.expires').run(this.owner, epoch, now + ttl);
      return epoch;
    });
  }
  holds(epoch) { const r = this.db.prepare('SELECT * FROM lease WHERE id=1').get(); return r?.owner === this.owner && r.epoch === epoch && r.expires > this.now(); }
  renew(epoch, ttl = 60000) { return this.db.prepare('UPDATE lease SET expires=? WHERE id=1 AND owner=? AND epoch=? AND expires>?').run(this.now()+ttl, this.owner, epoch, this.now()).changes === 1; }
  release(epoch) { this.db.prepare('UPDATE lease SET expires=0 WHERE id=1 AND owner=? AND epoch=?').run(this.owner, epoch); }
  publish({ kind, target, baseRevision = 0, summary, sources = [], references = [], consumed = [], epoch, jobId }) {
    const key = nodeKey(kind, target);
    return this.tx(() => {
      if (!this.holds(epoch)) throw Error('Dream 执行租约已失效');
      if (jobId && this.job(jobId)?.state !== 'running') throw Error('Dream 已停止；未发布迟到结果');
      const old = this.memory(key);
      if ((old?.revision || 0) !== baseRevision) throw Error('Dream 记忆已更新；未覆盖较新版本');
      // Membership is checked inside the same transaction as publication: a
      // second process may update scope after the asynchronous source read.
      if(kind==='project'||kind==='global')for(const source of sources){
        if(!['memory','withdrawn'].includes(source.kind))continue;
        const child=this.memory(source.key),session=child?.kind==='session'?this.session(child.target):null;
        const eligible=child&&!child.invalid&&(kind==='project'?session?.shared&&session.project===target:
          child.kind==='project'&&Boolean(this.db.prepare('SELECT 1 FROM sessions WHERE project=? AND shared=1 LIMIT 1').get(child.target)));
        if(source.kind==='memory'&&(!eligible||child.revision!==source.revision))throw Error('发布时下层版本或共享范围已改变');
        if(source.kind==='withdrawn'&&eligible)throw Error('发布时来源已恢复，不能撤回其贡献');
      }
      for (const source of sources) this.putSource(source);
      for (const item of consumed) this.db.prepare('INSERT INTO progress VALUES(?,?,?,?) ON CONFLICT(node,source) DO UPDATE SET fingerprint=excluded.fingerprint,data=excluded.data').run(key, item.key, item.fingerprint, encode(item));
      // Source coverage is committed even if the concise text did not change.
      // Its new provenance still needs a revision for parent invalidation.
      if (old && old.summary === summary && consumed.length === 0) return old;
      const revision = baseRevision + 1, ref = `memory:${digest(key)}:${revision}`;
      const value = { key, kind, target, revision, ref, summary, updatedAt: this.now() };
      const previous = old?.ref;
      if (previous) this.putSource({ id: previous, kind: 'memory', key, revision: old.revision });
      for (const source of [...new Set([...references, ...(previous ? [previous] : [])])]) {
        if (!this.source(source)) throw Error('Dream 引用不存在');
        this.db.prepare('INSERT INTO edges VALUES(?,?,?)').run(key, revision, source);
      }
      this.db.prepare('INSERT INTO versions VALUES(?,?,?)').run(key, revision, encode(value));
      this.db.prepare('INSERT INTO memories VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET revision=excluded.revision,data=excluded.data').run(key,kind,target,revision,encode(value));
      this.putSource({ id: ref, kind: 'memory', key, revision });
      this.bumpCatalog(); return value;
    });
  }
  references(key, revision, offset = 0, limit = LIMITS.page) {
    const prior=revision>1?`memory:${digest(key)}:${revision-1}`:'';
    const rows = this.db.prepare('SELECT source FROM edges WHERE node=? AND revision=? ORDER BY (source=?) ASC,source LIMIT ? OFFSET ?').all(key,revision,prior,limit+1,offset);
    return { entries: rows.slice(0,limit).map(r => this.source(r.source)), more: rows.length > limit };
  }
  enqueue(scope, target, automatic = false, extra = {}) {
    return this.tx(() => {
      const existing = this.db.prepare("SELECT data FROM jobs WHERE scope=? AND target=? AND state IN ('queued','running','budget') ORDER BY created LIMIT 1").get(scope,target);
      if (existing) return decode(existing);
      const latest = decode(this.db.prepare('SELECT data FROM jobs WHERE scope=? AND target=? ORDER BY created DESC,rowid DESC LIMIT 1').get(scope,target));
      if (automatic && latest?.state==='paused') return latest;
      const value = { id: randomUUID(), scope, target, automatic, state:'queued', createdAt:this.now(), done:0, calls:0, ...extra };
      this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?)').run(value.id,scope,target,value.state,Number(automatic),value.createdAt,encode(value));
      return value;
    });
  }
  job(id) { return decode(this.db.prepare('SELECT data FROM jobs WHERE id=?').get(id)); }
  updateJob(id, patch) {
    const before = this.job(id); if (!before) throw Error('Dream 作业不存在');
    const next = { ...before, ...patch, updatedAt: this.now() };
    this.db.prepare('UPDATE jobs SET state=?,data=? WHERE id=?').run(next.state,encode(next),id);
    if(next.state==='complete')this.db.prepare('DELETE FROM job_targets WHERE job=?').run(id);
    return next;
  }
  updateJobIf(id, states, patch) {
    return this.tx(()=>{
      const job=this.job(id);if(!job)throw Error('Dream 作业不存在');
      return states.includes(job.state)?this.updateJob(id,patch):job;
    });
  }
  resumeDueJobs(now) {
    this.tx(()=>{
      for(const row of this.db.prepare("SELECT data FROM jobs WHERE state='budget'").all()){
        const job=decode(row);
        if(job.resumeAt<=now)this.updateJob(job.id,{state:'queued',error:null});
      }
    });
  }
  requireJob(id, epoch) {
    if (!this.holds(epoch)) throw Error('Dream 执行租约已失效');
    const job=this.job(id);
    if(job?.state!=='running')throw Error('Dream 已停止；未推进作业');
    return job;
  }
  // Fence the whole read/change transaction. A suspended process can resume
  // after another executor has already recovered this same running job.
  settleJob(id, patch, epoch) {
    return this.tx(()=>{
      if(!this.holds(epoch)||this.job(id)?.state!=='running')return null;
      return this.updateJob(id,patch);
    });
  }
  jobs(limit = 20, { includeUnfinished = false } = {}) {
    const sql=includeUnfinished?`SELECT data FROM jobs WHERE state IN ('queued','running','budget','paused','failed') OR id IN (SELECT id FROM jobs ORDER BY created DESC LIMIT ?) ORDER BY created DESC`:'SELECT data FROM jobs ORDER BY created DESC LIMIT ?';
    return this.db.prepare(sql).all(limit).map(decode);
  }
  recover(epoch) {
    return this.tx(() => {
      if (!this.holds(epoch)) throw Error('Dream 执行租约已失效');
      for (const row of this.db.prepare("SELECT data FROM jobs WHERE state='running'").all()) this.updateJob(decode(row).id,{state:'queued',notice:'继续未完成范围'});
    });
  }
  claimJob(epoch) {
    return this.tx(()=>{
      if(!this.holds(epoch))return null;
      const job=decode(this.db.prepare("SELECT data FROM jobs WHERE state='queued' ORDER BY created LIMIT 1").get());
      return job?this.updateJob(job.id,{state:'running',error:null}):null;
    });
  }
  setTargets(id, targets, epoch) {
    this.tx(() => {
      if (this.requireJob(id,epoch).targetsReady) return;
      const insert=this.db.prepare('INSERT INTO job_targets(job,ordinal,kind,target) VALUES(?,?,?,?)');
      targets.forEach((t,i)=>insert.run(id,i,t.kind,t.target));
      this.updateJob(id,{targetsReady:true,total:targets.length,done:0});
    });
  }
  nextTarget(id) { const r=this.db.prepare('SELECT * FROM job_targets WHERE job=? AND done=0 AND failed=0 ORDER BY ordinal LIMIT 1').get(id);return r?{...r,cut:r.cut?JSON.parse(r.cut):null}:null; }
  pinTarget(id, ordinal, cut, epoch) { this.tx(()=>{this.requireJob(id,epoch);this.db.prepare('UPDATE job_targets SET cut=? WHERE job=? AND ordinal=? AND cut IS NULL').run(encode(cut),id,ordinal);}); }
  finishTarget(id, ordinal, epoch) { this.tx(()=>{this.requireJob(id,epoch);this.db.prepare('UPDATE job_targets SET done=1 WHERE job=? AND ordinal=?').run(id,ordinal);const done=this.db.prepare('SELECT count(*) n FROM job_targets WHERE job=? AND done=1').get(id).n;this.updateJob(id,{done});}); }
  // A failed target stays unfinished so a later run can retry it; the failed flag
  // only keeps the current run moving past it.
  markTargetFailed(id, ordinal, epoch) { this.tx(()=>{this.requireJob(id,epoch);this.db.prepare('UPDATE job_targets SET failed=1 WHERE job=? AND ordinal=?').run(id,ordinal);}); }
  // Targets this job has advanced, split by kind: a parent target with no child
  // memories returns without doing any work, so a caller judging progress must
  // not count it as real advancement.
  finishedTargets(id) { return this.db.prepare("SELECT count(*) n FROM job_targets WHERE job=? AND done=1 AND kind='session'").get(id).n; }
  clearTargetFailures(id, epoch) { this.tx(()=>{this.requireJob(id,epoch);this.db.prepare('UPDATE job_targets SET failed=0 WHERE job=?').run(id);}); }
  usage() {
    const day = quotaDay(this.now()), row = this.db.prepare('SELECT coalesce(sum(charged),0) used FROM calls WHERE day=?').get(day);
    return { day, used: row.used, resetsAt: quotaReset(this.now()) };
  }
  prune() {
    // Only execution telemetry expires. Referenced memory/source versions stay
    // immutable so all historical citations continue to resolve.
    const before=this.now()-30*86400000;
    this.tx(()=>{
      this.db.prepare("DELETE FROM job_targets WHERE job IN (SELECT id FROM jobs WHERE state IN ('complete','failed') AND created<?)").run(before);
      this.db.prepare("DELETE FROM jobs WHERE state IN ('complete','failed') AND created<?").run(before);
      this.db.prepare('DELETE FROM calls WHERE day<?').run(quotaDay(before));
    });
  }
  reserve(amount, cap, meta, epoch) {
    return this.tx(() => {
      if (!this.holds(epoch)) throw Error('Dream 执行租约已失效');
      const job=meta.jobId?this.requireJob(meta.jobId,epoch):null;
      if (this.usage().used + amount > cap) return null;
      const id=randomUUID(),day=quotaDay(this.now()),value={id,day,at:this.now(),estimated:true,...meta};
      this.db.prepare('INSERT INTO calls VALUES(?,?,?,?,?)').run(id,day,amount,amount,encode(value));
      if(job)this.updateJob(job.id,{calls:(job.calls||0)+1});
      return id;
    });
  }
  settle(id, usage, error) {
    const row=this.db.prepare('SELECT * FROM calls WHERE id=?').get(id);if(!row)return;
    const value=decode(row), fields=['inputTokens','cacheReadTokens','cacheWriteTokens','outputTokens'];
    const total=fields.reduce((n,k)=>n+(Number.isFinite(usage?.[k])?Math.max(0,usage[k]):0),0);
    const known=usage&&Number.isFinite(usage.inputTokens)&&usage.inputTokens>=0&&Number.isFinite(usage.outputTokens)&&usage.outputTokens>=0&&total>0;
    const charged=known?Math.ceil(total):row.reserved;
    this.db.prepare('UPDATE calls SET charged=?,data=? WHERE id=?').run(charged,encode({...value,usage:usage||null,estimated:!known,error:error||null}),id);
  }
  catalog({ kind='project', project='', query='', cursor, limit=LIMITS.page } = {}) {
    if(!['project','session'].includes(kind))throw Error('未知记忆目录');
    limit=Math.max(1,Math.min(LIMITS.page,limit));
    const scope=encode([kind,project,query,limit]),page=readCursor(cursor,scope),revision=this.meta('catalogRevision')||0;
    if(page.revision!=null&&page.revision!==revision)throw Error('记忆目录已更新，请从第一页重新读取');
    const escaped='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
    let rows;
    if(kind==='session') rows=this.db.prepare(`SELECT data FROM sessions WHERE (?='' OR project=?) AND (title LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\') ORDER BY id LIMIT ? OFFSET ?`).all(project,project,escaped,escaped,limit+1,page.offset).map(decode).map(s=>({...s,memory:this.memory(nodeKey('session',s.id))}));
    else rows=this.db.prepare(`SELECT DISTINCT project FROM sessions WHERE shared=1 AND project!='' AND project LIKE ? ESCAPE '\\' ORDER BY project LIMIT ? OFFSET ?`).all(escaped,limit+1,page.offset).map(r=>({id:r.project,title:r.project,memory:this.memory(nodeKey('project',r.project))}));
    return { entries:rows.slice(0,limit),revision,nextCursor:rows.length>limit?cursorFor({scope,revision,offset:page.offset+limit}):null };
  }
  close() { if(!this.closed){this.closed=true;this.db.close();} }
}
