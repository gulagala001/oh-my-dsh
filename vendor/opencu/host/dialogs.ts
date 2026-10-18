import { createHash, randomUUID } from 'node:crypto'
import type { EventEmitter } from 'node:events'
import type { WebContents, WebFrameMain } from 'electron'

type DialogType = 'alert' | 'confirm' | 'prompt' | 'beforeunload'
type Descriptor = { id: string; type: DialogType; message: string; defaultPrompt: string; url: string }
type Info = { frame: WebFrameMain; dialogType: DialogType; messageText: string; defaultPromptText?: string }
type Entry = { descriptor: Descriptor; frame: WebFrameMain; generation: number; reply: (accept: boolean, text: string) => void; answered: boolean }
export type DialogFence = { guard<T>(work: () => Promise<T>): Promise<T>; close(): void; readonly interrupted: boolean }
const states = new WeakMap<WebContents, ReturnType<typeof createDialogs>>()
const failure = (code: string, message: string, details: object = {}): Error => Object.assign(new Error(message), { code, details })

/** Electron's default handler cancels prompt and cannot be dismissed through CDP without
 * leaving a native modal. This version-bound adapter replaces it only on owned CU guests.
 * Ordinary DSH guests and their disableDialogs policy are never changed. */
function createDialogs(guest: WebContents) {
  const events = guest as unknown as EventEmitter
  const original = events.rawListeners('-run-dialog')
  const supported = process.versions.electron === '44.7.0' && original.length === 1 && original[0]!.length === 2 &&
    createHash('sha256').update(Function.prototype.toString.call(original[0])).digest('hex') === 'e3dd98975011b2ca69cb58e290baf708dc06c5f1e404b15e7314bbc2fa978164'
  let current: Entry | undefined, generation = 0, disposed = false
  const waiters = new Set<(error: Error) => void>()
  const descriptor = (): Descriptor | undefined => current && !current.answered ? { ...current.descriptor } : undefined
  const blocked = (inputDispatched = false): Error => failure('JS_DIALOG_OPEN',
    'A JavaScript dialog is open. Read this target.getJsDialog() and explicitly accept or dismiss it; do not replay the triggering action.',
    { dialog: descriptor(), inputDispatched })
  const assertSupported = (): void => {
    if (!supported) throw failure('HOST_DIALOG_UNSUPPORTED', 'This Electron build has no verified OpenCU dialog adapter')
    if (disposed || guest.isDestroyed()) throw failure('STALE_DIALOG', 'The dialog guest is closed')
  }
  function respond(entry: Entry, accept: boolean, text = ''): void {
    if (entry !== current || entry.answered || entry.generation !== generation || guest.isDestroyed() || entry.frame.detached)
      throw failure('STALE_DIALOG', 'The JavaScript dialog is no longer open in this target')
    entry.answered = true
    current = undefined
    entry.reply(accept, text)
  }
  const receive = (info: Info, callback: Entry['reply']): void => {
    if (disposed || typeof callback !== 'function') return
    if (!info?.frame || info.frame.detached || info.frame.top !== guest.mainFrame ||
      !['alert', 'confirm', 'prompt', 'beforeunload'].includes(info.dialogType) || typeof info.messageText !== 'string') {
      callback(false, '')
      return
    }
    // Chromium normally serializes dialogs. Never replace a still-pending user's choice.
    if (current) { callback(false, ''); return }
    current = { descriptor: { id: randomUUID(), type: info.dialogType, message: info.messageText,
      defaultPrompt: info.defaultPromptText ?? '', url: info.frame.url }, frame: info.frame, generation, reply: callback, answered: false }
    for (const reject of [...waiters]) reject(blocked())
  }
  // Electron cancels the native request itself on this signal; its callback is no longer ours to invoke.
  const invalidate = (): void => { generation++; if (current) current.answered = true; current = undefined }
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    invalidate()
    for (const reject of [...waiters]) reject(failure('STALE_DIALOG', 'The dialog guest closed'))
    waiters.clear()
    if (supported) {
      events.removeListener('-run-dialog', receive)
      events.removeListener('-cancel-dialogs', invalidate)
      if (!guest.isDestroyed()) for (const listener of original) events.on('-run-dialog', listener as (...args: unknown[]) => void)
    }
  }
  if (supported) {
    for (const listener of original) events.removeListener('-run-dialog', listener as (...args: unknown[]) => void)
    events.on('-run-dialog', receive)
    events.on('-cancel-dialogs', invalidate)
    guest.on('did-navigate', invalidate)
    guest.on('render-process-gone', invalidate)
    guest.once('destroyed', dispose)
  }
  return {
    get: () => { assertSupported(); return { dialog: descriptor() ?? null } },
    pending: descriptor,
    assertClear: () => { if (current) throw blocked() },
    handle(args: Record<string, unknown>) {
      assertSupported()
      if (typeof args.dialogId !== 'string' || typeof args.accept !== 'boolean' ||
        args.promptText !== undefined && typeof args.promptText !== 'string') throw failure('INVALID_ARGUMENT', 'Expected dialogId, accept and optional promptText')
      if (!current || args.dialogId !== current.descriptor.id) throw failure('STALE_DIALOG', 'The JavaScript dialog handle has expired')
      if (args.promptText !== undefined && current.descriptor.type !== 'prompt') throw failure('INVALID_ARGUMENT', 'Only prompt dialogs accept promptText')
      respond(current, args.accept, args.promptText as string | undefined)
      return { handled: true }
    },
    dismiss() { if (current) respond(current, false) },
    fence(): DialogFence {
      let interruption: Error | undefined, reject: (error: Error) => void = () => {}
      const interrupted = new Promise<never>((_resolve, failure) => { reject = failure })
      void interrupted.catch(() => {})
      const opened = (error: Error): void => { interruption ??= error; reject(interruption) }
      waiters.add(opened)
      return {
        get interrupted() { return interruption !== undefined },
        async guard<T>(work: () => Promise<T>): Promise<T> {
          if (interruption) throw interruption
          if (current) opened(blocked())
          return Promise.race([Promise.resolve().then(() => { if (interruption) throw interruption; return work() }), interrupted])
        },
        close() { waiters.delete(opened) },
      }
    },
    async guard<T>(work: () => Promise<T>): Promise<T> {
      if (current) throw blocked()
      let interrupt: (error: Error) => void = () => {}
      const opened = new Promise<never>((_resolve, reject) => { interrupt = reject; waiters.add(reject) })
      try { return await Promise.race([Promise.resolve().then(() => { if (current) throw blocked(); return work() }), opened]) }
      finally { waiters.delete(interrupt) }
    },
  }
}

export function openCUDialogs(guest: WebContents): ReturnType<typeof createDialogs> {
  let state = states.get(guest)
  if (!state) { state = createDialogs(guest); states.set(guest, state) }
  return state
}
