import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const rootId = /^omd-sidebar-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const uncertain = () => Object.assign(Error('无法确认侧栏会话的归属或清理结果，已保留原数据。'), { statusCode: 409 });

/** Record ownership before admitting a native session. Multiple hosts can share the profile. */
export class TemporarySessionRegistry {
  constructor(directory, cleanup) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = directory; this.cleanup = cleanup; this.instance = randomUUID();
    this.db = new DatabaseSync(directory + '.sqlite');
    this.db.exec(`PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS owners (id TEXT PRIMARY KEY, pid INTEGER NOT NULL, instance TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, root TEXT NOT NULL);`);
    this.member = this.db.prepare('SELECT 1 FROM members WHERE id=? UNION ALL SELECT 1 FROM owners WHERE id=? LIMIT 1');
    this.recoveries = new Map();
  }
  path(id) {
    if (!rootId.test(id)) throw uncertain();
    return join(this.directory, id);
  }
  create(id) {
    const path = this.path(id);
    this.db.prepare('INSERT INTO owners(id,pid,instance) VALUES (?,?,?)').run(id, process.pid, this.instance);
    return path;
  }
  register(root, id) {
    if (id !== root) this.db.prepare('INSERT INTO members(id,root) VALUES (?,?)').run(id, root);
  }
  owns(id) {
    return typeof id === 'string' && !!this.member.get(id, id);
  }
  finish(id) {
    const updated = this.db.prepare('UPDATE owners SET closed=1 WHERE id=? AND instance=?').run(id, this.instance);
    if (!updated.changes) throw uncertain();
    // Keep ID-only tombstones so late descendants cannot escape into ordinary storage after restart.
  }
  async recoverAll(warn) {
    const entries = await readdir(this.directory, { withFileTypes: true });
    if (entries.some(entry => entry.isDirectory() && /^chat-[a-zA-Z0-9]{6}$/.test(entry.name))) {
      warn(Error('保留了缺少持有者记录的旧侧栏目录，请在所有使用此目录的宿主退出后核对：' + this.directory));
    }
    const rows = this.db.prepare('SELECT id FROM owners WHERE closed=0 AND instance<>?').all(this.instance);
    return Promise.all(rows.map(({ id }) => this.recover(id, false).catch(error => warn(error))));
  }
  async recover(id, explicit = true) {
    const row = this.db.prepare('SELECT * FROM owners WHERE id=?').get(id);
    if (!row) throw uncertain(); // Includes pre-registry directories with no trustworthy owner.
    if (row.closed) return;
    if (this.recoveries.has(id)) return this.recoveries.get(id);
    if (row.instance !== this.instance) {
      try {
        process.kill(row.pid, 0);
        if (explicit) throw uncertain();
        return;
      } catch (error) { if (error.code !== 'ESRCH') throw error; }
      const claimed = this.db.prepare('UPDATE owners SET pid=?, instance=? WHERE id=? AND instance=? AND closed=0')
        .run(process.pid, this.instance, id, row.instance);
      if (!claimed.changes) return this.recover(id, explicit);
    }
    const work = (async () => {
      const path = this.path(id);
      const ids = this.db.prepare('SELECT id FROM members WHERE root=?').all(id).map(row => row.id);
      await this.cleanup([...new Set([id, ...ids])]);
      await rm(path, { recursive: true, force: true });
      this.finish(id);
    })();
    this.recoveries.set(id, work);
    try { await work; } finally { this.recoveries.delete(id); }
  }
}
