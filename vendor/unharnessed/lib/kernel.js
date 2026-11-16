import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'

export function bounded(text, limit) {
  if (text.length <= limit) return text
  const end = /[\uD800-\uDBFF]$/.test(text.slice(0, limit)) ? limit - 1 : limit
  return text.slice(0, end) + '\n[output clipped; keep large data in Python variables and print a smaller selection]'
}

/** Protocol v3 client. No model/provider loop runs in the Python process. */
export class Kernel {
  constructor(handle, config, hostRequest, onActivity = () => {}, onFailure = () => {}, onDisplay = async () => {}) {
    this.handle = handle
    this.config = config
    this.hostRequest = hostRequest
    this.onActivity = onActivity
    this.onFailure = onFailure
    this.onDisplay = onDisplay
    this.pending = new Map()
    this.closed = false
    this.background = ''
    this.ready = new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject })
    this.ready.catch(() => {})
    const decoder = new StringDecoder('utf8')
    let line = ''
    handle.stdout.on('data', chunk => {
      line += decoder.write(chunk)
      // The upstream protocol allows 16 MiB display payloads. Bound malformed peers too.
      if (Buffer.byteLength(line) > 20 * 1024 * 1024) return this.fail(new Error('Python protocol frame exceeded 20 MiB'))
      let end
      while ((end = line.indexOf('\n')) >= 0) {
        const frame = line.slice(0, end); line = line.slice(end + 1)
        try { this.event(JSON.parse(frame)) } catch (error) { this.fail(error); return }
      }
    })
    let stderr = ''
    handle.stderr.on('data', chunk => { stderr = bounded(stderr + chunk.toString(), 4000) })
    handle.stdin.on('error', error => this.fail(error))
    handle.stdout.on('error', error => this.fail(error))
    handle.stderr.on('error', error => this.fail(error))
    handle.done.then(result => this.fail(new Error(`Python kernel exited (${result.exitCode ?? result.signal}). ${stderr}`)), error => this.fail(error))
  }

  send(frame) {
    if (this.closed) throw new Error('Python kernel is closed; its variables and tasks are gone')
    this.handle.stdin.write(JSON.stringify(frame) + '\n')
  }

  event(frame) {
    const activity = frame.data?.['application/vnd.unharnessed.bash-activity+json']
    if (frame.event === 'display' && activity) { this.onActivity(activity); return }
    if (frame.event === 'ready') {
      if (frame.protocol !== 3) throw new Error(`Unsupported Python protocol ${frame.protocol}`)
      this.readyResolve(frame); return
    }
    if (frame.event === 'host_request') {
      Promise.resolve().then(() => this.hostRequest(frame.data)).then(
        result => this.reply(frame.id, { status: 'ok', result }),
        error => this.reply(frame.id, { status: 'error', error: String(error.message ?? error) }),
      ); return
    }
    const request = this.pending.get(frame.id)
    if (!request) {
      if (frame.event === 'stdout' || frame.event === 'stderr') {
        this.background = bounded(this.background + `[background ${frame.event}] ${frame.text}`, this.config.maxOutputChars)
      }
      if (frame.event === 'display') void this.onDisplay(frame.data).catch(error => { this.background = bounded(this.background + `[display error] ${error.message}`, this.config.maxOutputChars) })
      return
    }
    if (frame.event === 'stdout' || frame.event === 'stderr' || frame.event === 'result') {
      request.text = bounded(request.text + (frame.event === 'stderr' ? '[stderr] ' : '') + frame.text, this.config.maxOutputChars)
    } else if (frame.event === 'error') {
      request.text = bounded(request.text + (frame.traceback?.join('') || `${frame.ename}: ${frame.evalue}`), this.config.maxOutputChars)
    } else if (frame.event === 'display') {
      const checkpoint = frame.data?.['application/vnd.dsh-unharnessed.snapshot+json']
      if (checkpoint && request.snapshot) { request.snapshot(checkpoint); return }
      // Rich output stays explicit; unbounded data and private activity signals never flood history.
      const text = frame.data?.['text/plain']
      if (typeof text === 'string') request.text = bounded(request.text + text, this.config.maxOutputChars)
      request.displays.push(Promise.resolve().then(() => this.onDisplay(frame.data)).catch(error => {
        request.displayError = true
        request.text = bounded(request.text + `[display error] ${error.message}`, this.config.maxOutputChars)
      }))
    } else if (frame.event === 'done') {
      this.pending.delete(frame.id)
      void Promise.all(request.displays).then(() => request.resolve({ ...frame, ...(request.displayError ? { status: 'error' } : {}), text: request.text }))
    }
  }

  reply(id, data) {
    if (!this.closed) {
      try { this.send({ type: 'host_reply', id, data }) } catch { /* settled by close */ }
    }
  }

  fail(error) {
    if (this.closed) return
    const hadPending = this.pending.size > 0
    this.closed = true
    this.readyReject(error)
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    this.handle.terminate()
    this.onFailure(error, hadPending)
  }

  async start(signal) {
    const timer = setTimeout(() => this.fail(new Error('Python kernel startup timed out')), this.config.startupTimeoutMs)
    const abort = () => this.fail(signal.reason ?? new Error('Kernel startup aborted'))
    signal.addEventListener('abort', abort, { once: true })
    try { signal.throwIfAborted(); return await this.ready }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
  }

  async request(type, fields, signal, timeoutMs = this.config.cellTimeoutMs, handlers = {}) {
    signal.throwIfAborted()
    const id = randomUUID()
    let killTimer
    let interrupted = false
    const interrupt = () => {
      if (interrupted) return
      interrupted = true
      try { this.send({ type: 'interrupt', id }) } catch { return }
      killTimer = setTimeout(() => this.fail(new Error('Python did not stop after interrupt; kernel was reset')), this.config.interruptGraceMs)
    }
    const timer = setTimeout(interrupt, timeoutMs)
    signal.addEventListener('abort', interrupt, { once: true })
    try {
      const done = new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject, text: this.background, displays: [], ...handlers })
        this.background = ''
      })
      try { this.send({ type, id, ...fields }) } catch (error) { this.fail(error) }
      const result = await done
      signal.throwIfAborted()
      if (interrupted) throw new Error(`Python cell exceeded ${timeoutMs} ms and was interrupted`)
      return result
    } finally {
      clearTimeout(timer); clearTimeout(killTimer)
      signal.removeEventListener('abort', interrupt)
    }
  }

  async dispose() {
    if (!this.closed) {
      try { this.send({ type: 'shutdown' }); this.handle.stdin.end() } catch { /* force below */ }
    }
    const timer = setTimeout(() => this.handle.terminate(), this.config.interruptGraceMs)
    try { await this.handle.done }
    finally { clearTimeout(timer); this.fail(new Error('Kernel disposed')) }
  }
}
