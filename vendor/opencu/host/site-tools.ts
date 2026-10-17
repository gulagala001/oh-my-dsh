import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'

type Frame = { id: string; url: string; urlFragment?: string; loaderId?: string; securityOrigin?: string }
type FrameTree = { frame: Frame; childFrames?: FrameTree[] }
type Tool = { name: string; title?: string; description?: string; inputSchema: unknown; annotations?: object; origin: string; frameId: string; registrationId: string }
type Send = (method: string, params?: object) => Promise<any> // CDP replies are checked by their operation.
type Registration = { tool: Tool; document: string; signature: string }
type Invocation = { controller: AbortController; done: Promise<void>; finish: (error?: Error) => void }
const registrations = new WeakMap<WebContents, Map<string, Registration>>()
const invocations = new WeakMap<WebContents, Map<string, Invocation>>()
const documentKey = (frame: Frame): string => JSON.stringify([frame.id, frame.loaderId, frame.url, frame.urlFragment])

/** Read native WebMCP descriptors and bind each registration to its current document. */
export async function inspectSiteTools(guest: WebContents, send: Send): Promise<{ available: boolean; tools: Tool[]; reason?: string }> {
  const url = guest.getURL()
  if (!/^https?:/.test(url)) return { available: false, tools: [], reason: 'This document has no HTTP origin' }
  const { frameTree }: { frameTree: FrameTree } = await send('Page.getFrameTree')
  const previous = registrations.get(guest), next = new Map<string, Registration>(), tools: Tool[] = []
  let available = false
  const visit = async ({ frame, childFrames = [] }: FrameTree): Promise<void> => {
    const frameURL = frame.url + (frame.urlFragment ?? '')
    if (/^https?:/.test(frameURL)) {
      const { executionContextId } = await send('Page.createIsolatedWorld', { frameId: frame.id, worldName: 'opencu-site-tools', grantUniveralAccess: false })
      const result = await send('Runtime.evaluate', { contextId: executionContextId, returnByValue: true, awaitPromise: true, timeout: 1500,
        expression: `(async () => {
          if (location.href !== ${JSON.stringify(frameURL)}) throw new Error('The site tools document changed');
          const context = Reflect.get(document, 'modelContext');
          if (!context || typeof context.getTools !== 'function') return { available: false, tools: [] };
          const origin = location.origin;
          if (origin === 'null') return { available: false, tools: [] };
          const tools = (await context.getTools()).filter(tool => tool.window === window && tool.origin === origin).map(tool => ({
            name: tool.name, title: tool.title, description: tool.description,
            inputSchema: typeof tool.inputSchema === 'string' ? JSON.parse(tool.inputSchema) : tool.inputSchema ?? null,
            annotations: tool.annotations, origin: tool.origin
          }));
          if (location.href !== ${JSON.stringify(frameURL)}) throw new Error('The site tools document changed');
          return { available: true, tools };
        })()` })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Cannot read native site tools')
      const data = result.result?.value
      if (!data || !Array.isArray(data.tools)) throw new Error('The browser returned invalid site tools')
      available ||= data.available === true
      for (const descriptor of data.tools) {
        if (typeof descriptor.name !== 'string' || !descriptor.name || descriptor.origin !== new URL(frameURL).origin) throw new Error('The browser returned an invalid site tool identity')
        const key = `${frame.id}\0${descriptor.name}`, signature = JSON.stringify(descriptor), document = documentKey(frame), old = previous?.get(key)
        const tool: Tool = { ...descriptor, frameId: frame.id, registrationId: old?.document === document && old.signature === signature ? old.tool.registrationId : randomUUID() }
        next.set(key, { tool, document, signature }); tools.push(tool)
      }
    }
    for (const child of childFrames) await visit(child)
  }
  await visit(frameTree)
  if (guest.isDestroyed() || guest.getURL() !== url) throw new Error('The site tools page changed during discovery')
  registrations.set(guest, next)
  return { available, tools, ...(!available ? { reason: 'This Chromium version does not expose the native WebMCP inspection API' } : {}) }
}

/** Register before queueing so cancellation also covers discovery and queued calls. */
export function beginSiteTool(guest: WebContents, requestId: unknown): Invocation {
  if (typeof requestId !== 'string' || !requestId) throw new Error('Site tool invocation requires a requestId')
  const active = invocations.get(guest) ?? new Map<string, Invocation>()
  invocations.set(guest, active)
  if (active.has(requestId)) throw new Error('Site tool request is already running')
  const controller = new AbortController()
  let settle!: (error?: Error) => void
  const done = new Promise<void>((resolve, reject) => { settle = error => error ? reject(error) : resolve() })
  void done.catch(() => {})
  const timer = setTimeout(() => { controller.abort(new Error('Site tool invocation timed out')) }, 25000)
  const invocation = { controller, done, finish(error?: Error) { clearTimeout(timer); if (!error) active.delete(requestId); settle(error) } }
  active.set(requestId, invocation)
  return invocation
}

/** Cancel through CDP without waiting behind the invocation's input queue. */
export async function cancelSiteTool(guest: WebContents, requestId?: string): Promise<{ cancelled: boolean }> {
  const active = invocations.get(guest)
  const pending = requestId ? [active?.get(requestId)].filter((item): item is Invocation => !!item) : [...active?.values() ?? []]
  for (const item of pending) item.controller.abort(new Error('Site tool invocation cancelled'))
  await Promise.all(pending.map(item => item.done))
  return { cancelled: pending.length > 0 }
}

/** Invoke only a freshly discovered native registration; results remain untrusted page data. */
export async function invokeSiteTool(guest: WebContents, send: Send, args: Record<string, unknown>, signal: AbortSignal): Promise<object> {
  signal.throwIfAborted()
  if (typeof args.registrationId !== 'string' || !args.input || typeof args.input !== 'object' || Array.isArray(args.input)) throw new Error('Site tool invocation requires registrationId and an input object')
  const descriptor = [...registrations.get(guest)?.values() ?? []].find(item => item.tool.registrationId === args.registrationId)
  if (!descriptor) throw new Error('STALE_SITE_TOOL: discover the current site tools again')
  const fresh = await inspectSiteTools(guest, send)
  signal.throwIfAborted()
  if (!fresh.tools.some(tool => tool.registrationId === descriptor.tool.registrationId)) throw new Error('STALE_SITE_TOOL: the document or tool changed')
  await send('WebMCP.enable')
  signal.throwIfAborted()
  const { tool } = descriptor
  return new Promise((resolve, reject) => {
    let invocationId: string | undefined, cancellation: Promise<void> | undefined, settled = false, cancelTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: Error, output?: unknown): void => {
      if (settled) return
      settled = true; clearTimeout(cancelTimer); signal.removeEventListener('abort', cancel)
      guest.debugger.removeListener('message', message); guest.removeListener('destroyed', destroyed)
      if (error) reject(error)
      else resolve({ output, tool, untrusted: true })
    }
    const cancellationFailed = (error: Error): void => { finish(Object.assign(error, { code: 'SITE_TOOL_CANCEL_FAILED' })) }
    const cancel = (): void => {
      cancelTimer ??= setTimeout(() => { cancellationFailed(new Error('Site tool cancellation was not acknowledged')) }, 5000)
      if (!invocationId) return
      cancellation ??= send('WebMCP.cancelInvocation', { invocationId }).then(() => { finish(signal.reason) }, cancellationFailed)
    }
    const message = (_event: Electron.Event, method: string, params: Record<string, unknown>): void => {
      if (method !== 'WebMCP.toolResponded' || params.invocationId !== invocationId) return
      if (signal.aborted) finish(signal.reason)
      else if (params.status === 'Completed') finish(undefined, params.output)
      else finish(new Error(String(params.errorText ?? `Site tool ${String(params.status)}`)))
    }
    const destroyed = (): void => finish(new Error('Site tool target closed'))
    guest.debugger.on('message', message); guest.once('destroyed', destroyed); signal.addEventListener('abort', cancel, { once: true })
    void send('WebMCP.invokeTool', { frameId: tool.frameId, toolName: tool.name, input: args.input }).then(result => {
      if (typeof result.invocationId !== 'string') throw new Error('The browser returned no site tool invocation ID')
      invocationId = result.invocationId
      if (signal.aborted) cancel()
    }).catch(error => finish(error))
  })
}
