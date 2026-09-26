/** Durable, start-ordered child results. A resume reuses only an unchanged prefix. */
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, realpath } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { SessionWriteLease } from '../../../session/session-persistence-jsonl/src/lease.ts'
import type { ChildResult } from './types.ts'

interface Call {
  key: string
  result?: ChildResult
}

function runId(value: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new Error('Invalid workflow run id')
  return value
}

/** Sort object keys without changing arrays, so equivalent option bags have one identity. */
export function requestKey(value: unknown): string {
  const canonical = (item: any): any => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

export function workflowPaths(root: string, sessionId: string, id: string): { directory: string; scriptPath: string; transcriptDir: string } {
  const directory = resolve(root, createHash('sha256').update(sessionId).digest('hex'), runId(id))
  return { directory, scriptPath: join(directory, 'script.js'), transcriptDir: directory }
}

/** Ignore only a torn final append; corruption of a committed line fails closed. */
export function readJournal(text: string): Map<number, Call> {
  const lines = text.split('\n')
  if (lines.at(-1) !== '') lines.pop()
  const calls = new Map<number, Call>()
  for (const line of lines) {
    if (!line) continue
    const event = JSON.parse(line)
    if (event.type === 'start') {
      if (!Number.isSafeInteger(event.seq) || event.seq < 1 || calls.has(event.seq) || typeof event.key !== 'string') throw new Error('Invalid workflow journal start')
      calls.set(event.seq, { key: event.key })
    } else if (event.type === 'result') {
      const call = calls.get(event.seq)
      if (!call || call.result || !event.result || typeof event.result.stopReason !== 'string' || !Array.isArray(event.result.output)) throw new Error('Invalid workflow journal result')
      call.result = event.result
    } else if (event.type !== 'run' && event.type !== 'end') throw new Error('Unknown workflow journal event')
  }
  return calls
}

export class WorkflowJournal {
  private chain: Promise<void> = Promise.resolve()
  private next = 1
  private prefix = true
  private closed = false
  private closing?: Promise<void>
  private readonly calls = new Set<number>()
  private readonly results = new Set<number>()
  private constructor(
    readonly directory: string,
    private readonly file: FileHandle,
    private readonly lease: SessionWriteLease,
    private readonly sourceLease: SessionWriteLease | undefined,
    private readonly cached: Map<number, Call>,
  ) {}

  static async create(root: string, sessionId: string, id: string, input: { script: string; meta: unknown; args?: unknown; resumeFromRunId?: string }): Promise<WorkflowJournal> {
    const scope = join(root, createHash('sha256').update(sessionId).digest('hex'))
    await mkdir(scope, { recursive: true, mode: 0o700 })
    // Canonicalize before using the same path as a kernel-lock identity on Windows.
    const canonical = await realpath(scope)
    let sourceLease: SessionWriteLease | undefined
    let lease: SessionWriteLease | undefined
    let file: FileHandle | undefined
    try {
      let cached = new Map<number, Call>()
      if (input.resumeFromRunId !== undefined) {
        if (input.resumeFromRunId === id) throw new Error('A workflow cannot resume itself')
        const source = join(canonical, runId(input.resumeFromRunId))
        // Do not create a phantom source directory when a run belongs to another session.
        await readFile(join(source, 'run.json'), 'utf8')
        sourceLease = await SessionWriteLease.acquire(source, sessionId as SessionId)
        cached = readJournal(await readFile(join(source, 'journal.jsonl'), 'utf8'))
      }
      const directory = join(canonical, runId(id))
      await mkdir(directory, { mode: 0o700 })
      lease = await SessionWriteLease.acquire(directory, sessionId as SessionId)
      for (const [name, contents] of [['script.js', input.script], ['run.json', JSON.stringify({ version: 1, id, sessionId, ...input }) + '\n']]) {
        const handle = await open(join(directory, name), 'wx', 0o600)
        try { await handle.writeFile(contents); await handle.sync() } finally { await handle.close() }
      }
      file = await open(join(directory, 'journal.jsonl'), 'ax', 0o600)
      const journal = new WorkflowJournal(directory, file, lease, sourceLease, cached)
      await journal.append({ type: 'run', version: 1, id, sessionId })
      return journal
    } catch (error) {
      await file?.close()
      await lease?.release()
      await sourceLease?.release()
      throw error
    }
  }

  private append(event: unknown): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Workflow journal is closed'))
    const text = JSON.stringify(event) + '\n'
    this.chain = this.chain.then(async () => { await this.file.writeFile(text); await this.file.sync() })
    return this.chain
  }

  async start(seq: number, identity: unknown, valid: (result: ChildResult) => boolean = () => true): Promise<ChildResult | undefined> {
    if (seq !== this.next) throw new Error('Workflow calls must be journaled in start order')
    this.next++
    this.calls.add(seq)
    const key = requestKey(identity)
    const old = this.cached.get(seq)
    const hit = this.prefix && old?.key === key && old.result?.stopReason === 'completed' && valid(old.result)
    if (!hit) this.prefix = false
    await this.append({ type: 'start', seq, key, cached: hit })
    if (!hit) return undefined
    // A resumed run is itself a complete source for a later resume.
    const result = structuredClone(old!.result!)
    await this.complete(seq, result)
    return result
  }

  async complete(seq: number, result: ChildResult): Promise<void> {
    if (!this.calls.has(seq) || this.results.has(seq)) throw new Error('Workflow result has no unique start')
    this.results.add(seq)
    await this.append({ type: 'result', seq, result })
  }

  /** Call only after every child and pending startup has reached quiescence. */
  async close(outcome: unknown): Promise<void> {
    this.closing ??= (async () => {
      try { await this.append({ type: 'end', outcome }) }
      finally {
        this.closed = true
        try { await this.file.close() }
        finally { try { await this.lease.release() } finally { await this.sourceLease?.release() } }
      }
    })()
    return this.closing
  }
}
