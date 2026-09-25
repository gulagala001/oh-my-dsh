import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, existsSync, openSync, fsyncSync, closeSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { hash } from './core.mjs';

export class ContextStore {
  constructor(directory, { maxDiskCacheBytes = 16 * 1024 * 1024 } = {}) {
    this.dir = resolve(directory, 'context-v1');
    this.cache = new Map(); this.diskCache = new Map(); this.diskCacheBytes = 0; this.readErrors = new Map(); this.writes = new Map();
    this.maxDiskCacheBytes = Math.max(0, maxDiskCacheBytes);
    mkdirSync(join(this.dir, 'sessions'), { recursive: true, mode: 0o700 });
  }
  read(path, fallback) {
    if (!existsSync(path)) return structuredClone(fallback);
    try { return JSON.parse(readFileSync(path, 'utf8')); }
    catch (error) { throw new Error(`上下文存档无法读取，原文件未更改：${path}: ${error.message}`); }
  }
  identity(path) {
    try { const s = statSync(path, { bigint: true }); return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  write(path, value) {
    const content = JSON.stringify(value) + '\n', digest = hash(content), previous = this.writes.get(path);
    if (previous?.digest === digest && previous.identity === this.identity(path)) return false;
    const tmp = `${path}.tmp`;
    // Flush the same writable handle on every platform (Windows rejects
    // FlushFileBuffers/fsync on a read-only handle).
    const fd = openSync(tmp, 'w', 0o600);
    try {
      writeFileSync(fd, content);
      fsyncSync(fd);
    } finally { closeSync(fd); }
    renameSync(tmp, path);
    this.writes.set(path, { digest, identity: this.identity(path) }); return true;
  }
  path(id) { return join(this.dir, 'sessions', hash(id) + '.json'); }
  state(id, binding) {
    if (!this.cache.has(id)) {
      const s = this.read(this.path(id), { schema: 1, id, binding: null, records: [], pending: null, transaction: null,
        review: { lastAt: 0, lastKey: '', newRecords: 0 }, publications: { catalog: {}, globalRevision: null },
        manualQueue: [], steps: 0, lastReplacementStep: -1000000, failures: {}, notices: [], traceSlot: null });
      if (s.schema !== 1 || s.id !== id || !Array.isArray(s.records)) throw new Error('上下文存档版本或会话身份不匹配');
      this.cache.set(id, s);
    }
    const s = this.cache.get(id);
    if (!s.binding && binding) { s.binding = { scope: binding.scope === 'project' ? 'project' : 'session', project: binding.project, title: binding.title || id }; this.save(s); }
    return s;
  }
  save(s) { this.write(this.path(s.id), s); this.cache.set(s.id, s); }
  release(id) {
    this.cache.delete(id); this.writes.delete(this.path(id));
    this.dropDiskCache(basename(this.path(id)));
  }
  all({ tolerateInvalid = false, requiredId } = {}) {
    const files = readdirSync(join(this.dir, 'sessions')).filter(f => f.endsWith('.json'));
    const present = new Set(files); this.readErrors.clear();
    for (const key of this.diskCache.keys()) if (!present.has(key)) this.dropDiskCache(key);
    return files.flatMap(file => {
      try {
      const path = join(this.dir, 'sessions', file), stat = statSync(path, { bigint: true });
      const signature = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
      let cached = this.diskCache.get(file);
      if (cached?.signature !== signature) {
        const value = this.read(path);
        if (value?.schema !== 1 || typeof value.id !== 'string' || !Array.isArray(value.records) || this.path(value.id) !== path) throw Error('上下文存档版本或会话身份不匹配');
        cached = { signature, value: this.cache.get(value.id) || value, bytes: this.cache.has(value.id) ? 0 : Number(stat.size) };
        this.dropDiskCache(file);
        if (cached.bytes <= this.maxDiskCacheBytes) {
          while (this.diskCacheBytes + cached.bytes > this.maxDiskCacheBytes && this.diskCache.size) this.dropDiskCache(this.diskCache.keys().next().value);
          this.diskCache.set(file, cached); this.diskCacheBytes += cached.bytes;
        }
      }
      // The running transaction owns its mutable state. Disk validation above
      // still detects changed/corrupt archives and externally added records.
      return [this.cache.get(cached.value.id) || cached.value];
      } catch (error) {
        this.dropDiskCache(file);
        if (!tolerateInvalid || (requiredId !== undefined && file === basename(this.path(requiredId)))) throw error;
        this.readErrors.set(file, error.message);
        return [];
      }
    });
  }
  dropDiskCache(file) {
    const cached = this.diskCache.get(file);
    if (cached) this.diskCacheBytes -= cached.bytes;
    this.diskCache.delete(file);
  }
  visible(requester, { includeHistory = false } = {}) {
    const own = this.state(requester); this.readErrors.clear();
    const states = own.binding?.scope === 'project'
      ? this.all({ tolerateInvalid: true, requiredId: requester }).filter(s => s.id === requester || (s.binding?.scope === 'project' && s.binding.project === own.binding.project))
      : [own];
    return states.flatMap(s => s.records.filter(r => includeHistory || !r.mergedInto).map(r => ({ ...r, sessionTitle: s.binding?.title || s.id })))
      .sort((a, b) => (a.timeStart ?? a.createdAt) - (b.timeStart ?? b.createdAt) || a.id.localeCompare(b.id));
  }
  get(requester, id) {
    const r = this.visible(requester, { includeHistory: true }).find(r => r.id === id);
    if (!r) throw new Error('记录不存在或不属于本会话可读取的范围');
    return r;
  }
  global() { return this.read(join(this.dir, 'manual-global.json'), { revision: 0, text: '', updatedAt: null }); }
  setGlobal(text, expectedRevision) {
    if (typeof text !== 'string') throw new Error('全局背景必须是文本');
    const before = this.global();
    if (expectedRevision !== before.revision) throw new Error('全局背景已被其他窗口更新，请刷新后再保存');
    const next = { revision: before.revision + 1, text, updatedAt: Date.now() };
    this.write(join(this.dir, 'manual-global.json'), next);
    return next;
  }
  notice(s, text) { s.notices.push({ at: Date.now(), text }); s.notices = s.notices.slice(-40); this.save(s); }
}
