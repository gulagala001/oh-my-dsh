import test from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel } from '../lib/kernel.js'
import { Snapshots } from '../lib/snapshots.js'

test('a media callback that outlives Python done remains cancellable without resetting Python', async t => {
  const media = Promise.withResolvers(), exit = Promise.withResolvers(), controller = new AbortController()
  const handle = { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    done: exit.promise, terminate: () => exit.resolve({ exitCode: 0 }) }
  let displaySignal
  const kernel = new Kernel(handle, { cellTimeoutMs: 10000, interruptGraceMs: 100, maxOutputChars: 4096 },
    () => {}, undefined, undefined, (_data, signal) => { displaySignal = signal; return media.promise })
  t.after(async () => { media.resolve(); exit.resolve({ exitCode: 0 }); await kernel.dispose() })
  const request = kernel.request('execute', {}, controller.signal)
  const [id] = kernel.pending.keys()
  kernel.event({ id, event: 'display', data: {} })
  kernel.event({ id, event: 'done', status: 'ok' })
  await Promise.resolve()
  controller.abort(new Error('cancel media'))
  await assert.rejects(request, /cancel media/)
  assert.equal(displaySignal.aborted, true); assert.equal(kernel.pending.size, 0); assert.equal(kernel.closed, false)
  const next = kernel.request('execute', {}, new AbortController().signal)
  kernel.event({ id: [...kernel.pending.keys()][0], event: 'done', status: 'ok' })
  assert.equal((await next).status, 'ok')
})

test('a torn legacy lock preserves its checkpoint and permits a read-only kernel', async t => {
  const stateDirectory = await mkdtemp(join(tmpdir(), 'unharnessed-owner-'))
  t.after(() => rm(stateDirectory, { recursive: true, force: true }))
  const owner = new Snapshots('fixture', { stateDirectory })
  await mkdir(owner.dir); await writeFile(owner.lock, '')
  try {
    await Promise.all([owner.acquire(), owner.acquire()])
    assert.match(await owner.restore(null, 'binding', new AbortController().signal), /read-only checkpoints/)
    await assert.rejects(owner.clear(), /previous snapshot owner is unknown/)
  } finally { await owner.release() }
  assert.equal(await readFile(owner.lock, 'utf8'), '')
  await writeFile(owner.lock, JSON.stringify({ pid: process.pid }))
  await assert.rejects(owner.acquire(), /live process/)
  await rm(owner.lock)
  await owner.acquire()
  try { assert.equal(JSON.parse(await readFile(owner.lock, 'utf8')).protocol, 2) } finally { await owner.release() }
})
