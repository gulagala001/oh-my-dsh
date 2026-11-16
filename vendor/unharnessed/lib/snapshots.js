import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, lstat } from 'node:fs/promises'
import { openSync, writeSync, fsyncSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const held = new Map()
const hash = value => createHash('sha256').update(value).digest('hex')
const format = 1

export class Snapshots {
  constructor(sessionId, config) {
    this.config = config
    const root = config.stateDirectory || process.env.DSH_UNHARNESSED_STATE_DIR
      || join(process.env.DSH_PROFILE_DIR || process.env.DSH_HOME || join(homedir(), '.dsh'), 'unharnessed-state')
    this.dir = join(root, hash(String(sessionId)))
    this.manifest = join(this.dir, 'latest.json')
    this.lock = join(this.dir, 'owner.json')
  }

  async acquire() {
    if (this.acquired) return
    while (held.has(this.dir)) await held.get(this.dir)
    this.released = new Promise(resolve => { this.resolveRelease = resolve })
    held.set(this.dir, this.released)
    try {
      await mkdir(this.dir, { recursive: true, mode: 0o700 })
      if ((await lstat(this.dir)).isSymbolicLink()) throw new Error('Snapshot directory must not be a symlink')
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const fd = await open(this.lock, 'wx', 0o600)
          await fd.writeFile(JSON.stringify({ pid: process.pid })); await fd.close()
          this.acquired = true
          return
        } catch (error) {
          if (error.code !== 'EEXIST') throw error
          const prior = JSON.parse(await readFile(this.lock, 'utf8'))
          if (!Number.isSafeInteger(prior.pid) || prior.pid < 1) throw new Error('Invalid snapshot owner; refusing concurrent access')
          try { process.kill(prior.pid, 0); throw new Error('This session’s Python state is owned by another live process') }
          catch (cause) { if (cause.code !== 'ESRCH') throw cause }
          await rm(this.lock)
        }
      }
      throw new Error('Could not acquire Python snapshot ownership')
    } catch (error) { held.delete(this.dir); this.resolveRelease(); throw error }
  }

  async restore(kernel, binding, signal) {
    await this.acquire()
    let meta
    try { meta = JSON.parse(await readFile(this.manifest, 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return ''; return '[python-state] Checkpoint metadata is damaged; started fresh.' }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return '[python-state] Checkpoint metadata is damaged; started fresh.'
    if (meta.format !== format || meta.binding !== binding) return '[python-state] Checkpoint belongs to different permissions, workspace or Python version; started fresh.'
    if (!/^[a-f0-9-]+\.bin$/.test(meta.file) || !Number.isSafeInteger(meta.bytes) || meta.bytes < 0 || meta.bytes > this.config.snapshotMaxBytes) return '[python-state] Invalid checkpoint; started fresh.'
    const path = join(this.dir, meta.file)
    try {
      const stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== meta.bytes) throw new Error('invalid checkpoint file')
      const bytes = await readFile(path)
      if (hash(bytes) !== meta.sha256) throw new Error('checkpoint checksum mismatch')
      const result = await kernel.request('restore', { path, max_bytes: this.config.snapshotMaxBytes, max_variable_bytes: this.config.snapshotVariableBytes }, signal)
      if (result.status !== 'ok') throw new Error(result.reason || result.text)
      return `[python-state-restored] Restored: ${result.restored?.join(', ') || '(none)'}. Not restored: ${JSON.stringify([...(meta.skipped || []), ...(result.failed || [])])}. Background commands and tasks must be restarted explicitly.`
    } catch (error) {
      signal.throwIfAborted()
      return `[python-state] Could not restore the checkpoint: ${error.message}. Started fresh.`
    }
  }

  async save(kernel, binding, signal, prune = false) {
    await this.acquire()
    const file = `${randomUUID()}.bin`, target = join(this.dir, file), temporary = `${target}.tmp`
    let fd = openSync(temporary, 'wx', 0o600), total = 0, summary
    const digest = createHash('sha256')
    try {
      const result = await kernel.request('execute', {
        code: `_dsh_state.checkpoint(globals(), ${this.config.snapshotMaxBytes}, ${this.config.snapshotVariableBytes})`,
      }, signal, this.config.snapshotTimeoutMs, {
        snapshot: data => {
          if (summary) throw new Error('Data after checkpoint completion')
          if (typeof data.chunk === 'string') {
            const chunk = Buffer.from(data.chunk, 'base64')
            if (chunk.toString('base64') !== data.chunk || chunk.length > 256 * 1024) throw new Error('Invalid checkpoint chunk')
            total += chunk.length
            if (total > this.config.snapshotMaxBytes) throw new Error('Checkpoint exceeded its configured size')
            let offset = 0
            while (offset < chunk.length) offset += writeSync(fd, chunk, offset, chunk.length - offset)
            digest.update(chunk)
          } else if (data.complete) summary = data.complete
          else throw new Error('Invalid checkpoint stream')
        },
      })
      if (result.status !== 'ok' || !summary || summary.bytes !== total) throw new Error(result.text || 'Incomplete checkpoint')
      fsyncSync(fd); closeSync(fd); fd = undefined
      await rename(temporary, target)
      let previous
      try { previous = JSON.parse(await readFile(this.manifest, 'utf8')).file } catch {}
      const metadata = { format, binding, file, bytes: total, sha256: digest.digest('hex'), saved: summary.saved, skipped: summary.skipped, timestamp: new Date().toISOString() }
      const manifestTemp = `${this.manifest}.${randomUUID()}.tmp`
      const out = await open(manifestTemp, 'wx', 0o600)
      try { await out.writeFile(JSON.stringify(metadata)); await out.sync() } finally { await out.close() }
      await rename(manifestTemp, this.manifest)
      if (previous && /^[a-f0-9-]+\.bin$/.test(previous) && previous !== file) await rm(join(this.dir, previous), { force: true })
      if (prune && summary.oversized?.length) await kernel.request('execute', { code: `for _dsh_name in ${JSON.stringify(summary.oversized)}: globals().pop(_dsh_name, None)` }, signal)
      return summary
    } finally { if (fd !== undefined) closeSync(fd); await rm(temporary, { force: true }) }
  }

  async clear() {
    await this.acquire()
    let meta
    try { meta = JSON.parse(await readFile(this.manifest, 'utf8')) } catch {}
    await rm(this.manifest, { force: true })
    if (meta && /^[a-f0-9-]+\.bin$/.test(meta.file)) await rm(join(this.dir, meta.file), { force: true })
  }

  async release() {
    if (!this.acquired) return
    this.acquired = false
    try { await rm(this.lock, { force: true }) }
    finally { held.delete(this.dir); this.resolveRelease?.() }
  }
}
