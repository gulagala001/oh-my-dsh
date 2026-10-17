/** Durable REA workbook checkpoints and updates, scoped to one canonical local file. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'

type Update = { bytes: number[]; stateVersion: number; originId: string; updateId: string }
type RecordValue = { kind: 'spreadsheet'; documentId: string; publicFileHash: string; checkpoint: number[]; checkpointStateVersion: number; stateVersion: number; materializedStateVersion: number; updates: Update[] }
type Journal = { path: string; record: RecordValue; pending?: { hash: string; version: number } }
type Write = (bytes: Uint8Array, expected: string) => Promise<{ outcome: string; etag?: string }>
const queues = new Map<string, Promise<unknown>>()
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512
const version = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const validBytes = (value: unknown): value is number[] => Array.isArray(value) && value.length > 0 && value.length <= 256 * 1024 * 1024 && value.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
function bytes(value: unknown): number[] {
  const data = value instanceof Uint8Array ? Array.from(value) : value
  if (!validBytes(data)) throw new Error('Artifact updates require nonempty bytes up to 256 MiB')
  return data
}
function validate(value: Journal, path: string): void {
  const r = value?.record
  if (value?.path !== path || r?.kind !== 'spreadsheet' || !identifier(r.documentId) || !hash(r.publicFileHash)
    || !validBytes(r.checkpoint) || !version(r.checkpointStateVersion) || !version(r.stateVersion) || !version(r.materializedStateVersion)
    || r.checkpointStateVersion > r.materializedStateVersion || r.materializedStateVersion > r.stateVersion || !Array.isArray(r.updates)
    || r.updates.length !== r.stateVersion - r.checkpointStateVersion
    || r.updates.some((u, i) => u.stateVersion !== r.checkpointStateVersion + i + 1 || !validBytes(u.bytes) || !identifier(u.originId) || !identifier(u.updateId))
    || value.pending && (!hash(value.pending.hash) || !version(value.pending.version) || value.pending.version > r.stateVersion)) throw new Error('Invalid persisted artifact document')
}

/** Serialize edits and materialization; external file changes never overwrite pending edits. */
export function operateArtifactDocument(directory: string, path: string, operation: unknown, input: unknown, write: Write): Promise<object> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid artifact document request')
  const args = input as Record<string, unknown>, key = join(directory, digest(Buffer.from(path)) + '.json')
  const work = (queues.get(key) ?? Promise.resolve()).then(async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    let journal: Journal | undefined
    try { journal = JSON.parse(await readFile(key, 'utf8')) as Journal; validate(journal, path) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const save = async (next: Journal): Promise<void> => {
      validate(next, path)
      const temporary = key + '.' + randomUUID() + '.pending'
      const encoded = JSON.stringify(next)
      if (Buffer.byteLength(encoded) > 256 * 1024 * 1024) throw new Error('The workbook editing journal exceeds 256 MiB; save a new local copy')
      try {
        const file = await open(temporary, 'wx', 0o600)
        try { await file.writeFile(encoded); await file.sync() } finally { await file.close() }
        await rename(temporary, key)
      }
      finally { await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error }) }
      journal = next
    }
    if (journal?.pending) {
      const actual = digest(await readFile(path)), pending = journal.pending
      if (actual === pending.hash) await save({ path, record: { ...journal.record, publicFileHash: actual, materializedStateVersion: pending.version } })
      else if (actual === journal.record.publicFileHash) await save({ path, record: journal.record })
      else if (operation !== 'find' && operation !== 'read') return { status: 'conflict' }
    }
    const ok = (value: unknown): object => ({ status: 'ok', value })
    if (operation === 'find') return ok(journal?.record ?? null)
    if (operation === 'adopt') {
      if (journal) return ok(journal.record)
      if (args.kind !== 'spreadsheet' || !identifier(args.documentId) || !hash(args.publicFileHash)) throw new Error('Invalid workbook adoption request')
      if (digest(await readFile(path)) !== args.publicFileHash) return { status: 'conflict' }
      await save({ path, record: { kind: 'spreadsheet', documentId: args.documentId, publicFileHash: args.publicFileHash,
        checkpoint: bytes(args.checkpoint), checkpointStateVersion: 0, stateVersion: 0, materializedStateVersion: 0, updates: [] } })
      return ok(journal!.record)
    }
    if (!journal || args.documentId !== journal.record.documentId) return { status: 'conflict' }
    const record = journal.record
    if (operation === 'read') return ok(record)
    if (operation === 'append') {
      if (!version(args.baseStateVersion) || args.baseStateVersion > record.stateVersion || !identifier(args.originId) || !identifier(args.updateId)) throw new Error('Invalid workbook update identity')
      const data = bytes(args.bytes), previous = record.updates.find(update => update.updateId === args.updateId)
      if (previous) {
        if (previous.originId !== args.originId || digest(Buffer.from(previous.bytes)) !== digest(Buffer.from(data))) throw new Error('Workbook update identity was reused with different contents')
        return ok(record)
      }
      const update = { bytes: data, stateVersion: record.stateVersion + 1, originId: args.originId, updateId: args.updateId }
      await save({ path, record: { ...record, stateVersion: update.stateVersion, updates: [...record.updates, update] } })
      return ok(journal!.record)
    }
    if (operation === 'materialize') {
      if (!version(args.expectedStateVersion)) throw new Error('Invalid workbook materialization version')
      if (args.expectedStateVersion !== record.stateVersion) return ok({ outcome: 'stale', stateVersion: record.stateVersion })
      const data = new Uint8Array(bytes(args.publicFileBytes)), nextHash = digest(data)
      if (digest(await readFile(path)) !== record.publicFileHash) return { status: 'conflict' }
      await save({ path, record, pending: { hash: nextHash, version: record.stateVersion } })
      const result = await write(data, record.publicFileHash)
      if (result.outcome !== 'saved') { await save({ path, record }); return { status: 'conflict' } }
      await save({ path, record: { ...record, publicFileHash: nextHash, materializedStateVersion: record.stateVersion } })
      return ok({ outcome: 'materialized', publicFileHash: nextHash, stateVersion: record.stateVersion, materializedStateVersion: record.stateVersion })
    }
    if (operation === 'refreshCleanSession') {
      if (args.expectedStateVersion !== record.stateVersion || record.stateVersion !== record.materializedStateVersion || args.expectedPublicFileHash !== record.publicFileHash) return { status: 'conflict' }
      if (!identifier(args.replacementDocumentId) || !hash(args.observedPublicFileHash)) throw new Error('Invalid workbook refresh identity')
      if (digest(await readFile(path)) !== args.observedPublicFileHash) return { status: 'conflict' }
      await save({ path, record: { kind: 'spreadsheet', documentId: args.replacementDocumentId, publicFileHash: args.observedPublicFileHash,
        checkpoint: bytes(args.checkpoint), checkpointStateVersion: 0, stateVersion: 0, materializedStateVersion: 0, updates: [] } })
      return ok({ outcome: 'refreshed', record: journal!.record })
    }
    throw new Error('Unsupported artifact document operation')
  })
  const settled = work.catch(() => undefined)
  queues.set(key, settled)
  return work.finally(() => { if (queues.get(key) === settled) queues.delete(key) })
}
