import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import { readCDPFrameOwners, type CDPFrameRouter, type FrameRoute } from './opencu-frame-router.js'

type Frame = { id: string; url: string; urlFragment?: string; loaderId?: string; securityOrigin?: string }
type FrameTree = { frame: Frame; childFrames?: FrameTree[] }
type Tool = { name: string; title?: string; description?: string; inputSchema: unknown; annotations?: object; origin: string; frameId: string; registrationId: string }
type Send = (method: string, params?: object) => Promise<any> // CDP replies are checked by their operation.
type Registration = { tool: Tool; document: string; signature: string; send: Send; sessionId?: string }
type Invocation = { controller: AbortController; done: Promise<void>; finish: (error?: Error) => void }
const registrations = new WeakMap<WebContents, Map<string, Registration>>()
const invocations = new WeakMap<WebContents, Map<string, Invocation>>()
const cancelledBeforeDispatch = (message: string): Error => Object.assign(new Error(message), { code: 'SITE_TOOL_CANCELLED', details: { inputDispatched: false } })
const documentKey = (frame: Frame): string => JSON.stringify([frame.id, frame.loaderId, frame.url, frame.urlFragment])

/** Read native WebMCP descriptors and bind each registration to its current document. */
export async function inspectSiteTools(guest: WebContents, send: Send, router?: CDPFrameRouter): Promise<{ available: boolean; tools: Tool[]; reason?: string }> {
  const url = guest.getURL()
  if (!/^https?:/.test(url)) return { available: false, tools: [], reason: 'This document has no HTTP origin' }
  const previous = registrations.get(guest), next = new Map<string, Registration>(), tools: Tool[] = []
  let available = false
  const visit = async ({ frame, childFrames = [] }: FrameTree, route?: FrameRoute): Promise<void> => {
    const frameSend = route?.send ?? send
    const frameURL = frame.url + (frame.urlFragment ?? '')
    if (/^https?:/.test(frameURL)) {
      const { executionContextId } = await frameSend('Page.createIsolatedWorld', { frameId: frame.id, worldName: 'opencu-site-tools', grantUniveralAccess: false })
      const result = await frameSend('Runtime.evaluate', { contextId: executionContextId, returnByValue: true, awaitPromise: true, timeout: 1500,
        expression: `(async () => {
          if (location.href !== ${JSON.stringify(frameURL)}) throw new Error('The site tools document changed');
          const context = Reflect.get(document, 'modelContext');
          if (!context || typeof context.getTools !== 'function') return { available: false, tools: [] };
          // The browser's native event also detects identical unregister/re-register cycles.
          const state = globalThis.__opencuSiteToolsState ??= (() => {
            const state = { id: ${JSON.stringify(randomUUID())}, revision: 0 };
            context.addEventListener('toolchange', () => { state.revision++; });
            return state;
          })();
          const revision = state.revision;
          const origin = location.origin;
          if (origin === 'null') return { available: false, tools: [] };
          const tools = (await context.getTools()).filter(tool => tool.window === window && tool.origin === origin).map(tool => ({
            name: tool.name, title: tool.title, description: tool.description,
            inputSchema: typeof tool.inputSchema === 'string' ? JSON.parse(tool.inputSchema) : tool.inputSchema ?? null,
            annotations: tool.annotations, origin: tool.origin
          }));
          if (location.href !== ${JSON.stringify(frameURL)}) throw new Error('The site tools document changed');
          if (revision !== state.revision) throw new Error('The site tool registrations changed during discovery');
          return { available: true, tools, registrationVersion: state.id + ':' + revision };
        })()` })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Cannot read native site tools')
      const data = result.result?.value
      if (!data || !Array.isArray(data.tools)) throw new Error('The browser returned invalid site tools')
      available ||= data.available === true
      for (const descriptor of data.tools) {
        if (typeof descriptor.name !== 'string' || !descriptor.name || descriptor.origin !== new URL(frameURL).origin) throw new Error('The browser returned an invalid site tool identity')
        const key = `${frame.id}\0${descriptor.name}`, signature = JSON.stringify(descriptor), document = JSON.stringify([documentKey(frame), data.registrationVersion]), old = previous?.get(key)
        const tool: Tool = { ...descriptor, frameId: frame.id, registrationId: old?.document === document && old.signature === signature ? old.tool.registrationId : randomUUID() }
        next.set(key, { tool, document, signature, send: frameSend, ...(route?.sessionId === undefined ? {} : {sessionId:route.sessionId}) }); tools.push(tool)
      }
    }
    if (route && router) {
      for (const owner of await readCDPFrameOwners(route)) {
        if (!owner.frameId) continue
        const child = await router.child(route, owner.backendNodeId, owner.frameId)
        await visit(await routeTree(child), child)
      }
      await router.validate(route)
    } else for (const child of childFrames) await visit(child)
  }
  const routeTree = async (route: FrameRoute): Promise<FrameTree> => {
    const result = await route.send('Runtime.evaluate', { contextId: route.contextId, returnByValue: true, expression: 'location.href' })
    if (result.exceptionDetails || typeof result.result?.value !== 'string') throw new Error('Cannot read the site tool frame document')
    return { frame: { id: route.frameId, loaderId: route.documentId, url: result.result.value } }
  }
  if (router) {
    const main = await router.main()
    await visit(await routeTree(main), main)
  } else {
    const { frameTree }: { frameTree: FrameTree } = await send('Page.getFrameTree')
    await visit(frameTree)
  }
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
  const timer = setTimeout(() => { controller.abort(cancelledBeforeDispatch('Site tool invocation timed out')) }, 25000)
  const invocation = { controller, done, finish(error?: Error) { clearTimeout(timer); if (!error) active.delete(requestId); settle(error) } }
  active.set(requestId, invocation)
  return invocation
}

/** Cancel through CDP without waiting behind the invocation's input queue. */
export async function cancelSiteTool(guest: WebContents, requestId?: string): Promise<{ cancelled: boolean }> {
  const active = invocations.get(guest)
  const pending = requestId ? [active?.get(requestId)].filter((item): item is Invocation => !!item) : [...active?.values() ?? []]
  for (const item of pending) item.controller.abort(cancelledBeforeDispatch('Site tool invocation cancelled'))
  await Promise.all(pending.map(item => item.done))
  return { cancelled: pending.length > 0 }
}

/** Invoke only a freshly discovered native registration; results remain untrusted page data. */
export async function invokeSiteTool(guest: WebContents, send: Send, args: Record<string, unknown>, signal: AbortSignal, router?: CDPFrameRouter): Promise<object> {
  signal.throwIfAborted()
  if (typeof args.registrationId !== 'string' || !args.input || typeof args.input !== 'object' || Array.isArray(args.input)) throw new Error('Site tool invocation requires registrationId and an input object')
  const descriptor = [...registrations.get(guest)?.values() ?? []].find(item => item.tool.registrationId === args.registrationId)
  if (!descriptor) throw Object.assign(new Error('STALE_SITE_TOOL: discover the current site tools again'), {code:'STALE_SITE_TOOL',details:{inputDispatched:false}})
  const fresh = await inspectSiteTools(guest, send, router)
  signal.throwIfAborted()
  if (!fresh.tools.some(tool => tool.registrationId === descriptor.tool.registrationId)) throw Object.assign(new Error('STALE_SITE_TOOL: the document or tool changed'), {code:'STALE_SITE_TOOL',details:{inputDispatched:false}})
  const current = [...registrations.get(guest)!.values()].find(item => item.tool.registrationId === descriptor.tool.registrationId)!
  const invokeSend = current.send
  await invokeSend('Page.enable')
  await invokeSend('WebMCP.enable')
  signal.throwIfAborted()
  const { tool } = descriptor
  return new Promise((resolve, reject) => {
    let invocationId: string | undefined, cancellation: Promise<void> | undefined, settled = false, dispatched = false, quiescent = false, cancelTimer: ReturnType<typeof setTimeout> | undefined
    const earlyResponses = new Map<string, Record<string, unknown>>()
    const finish = (error?: Error, output?: unknown): void => {
      if (settled) return
      settled = true; clearTimeout(cancelTimer); signal.removeEventListener('abort', cancel)
      guest.debugger.removeListener('message', message); guest.debugger.removeListener('detach', detached)
      guest.removeListener('destroyed', destroyed); guest.removeListener('render-process-gone', destroyed)
      if (error) reject(Object.assign(error, {...(dispatched && !quiescent ? {code:'SITE_TOOL_CANCEL_FAILED'} : {}),
        details:{...(error as Error & {details?:object}).details,inputDispatched:dispatched,effectVerified:false}}))
      else resolve({ output, tool, untrusted: true, inputDispatched:true, effectVerified:false })
    }
    const cancellationError = (): Error => Object.assign(new Error(signal.reason instanceof Error ? signal.reason.message : 'Site tool invocation cancelled'), {
      code: 'SITE_TOOL_CANCELLED', details: { siteToolResponded: true } })
    const cancellationFailed = (error: Error): void => { finish(Object.assign(error, { code: 'SITE_TOOL_CANCEL_FAILED' })) }
    const cancel = (): void => {
      cancelTimer ??= setTimeout(() => { cancellationFailed(new Error('Site tool cancellation was not acknowledged')) }, 5000)
      if (!invocationId || settled) return
      cancellation ??= invokeSend('WebMCP.cancelInvocation', { invocationId }).then(() => { quiescent = true; finish(cancellationError()) }, cancellationFailed)
    }
    const responded = (params: Record<string, unknown>): void => {
      quiescent = true
      if (signal.aborted) finish(cancellationError())
      else if (params.status === 'Completed') finish(undefined, params.output)
      else {
        const exception = params.exception as { description?: unknown; value?: unknown; objectId?: string } | undefined
        if (exception?.objectId) void invokeSend('Runtime.releaseObject', { objectId: exception.objectId }).catch(() => {})
        const reason = params.errorText || exception?.description || exception?.value || `Site tool ${String(params.status)}`
        finish(Object.assign(new Error(String(reason)), { code: 'SITE_TOOL_ERROR', details: { siteToolResponded: true } }))
      }
    }
    const message = (_event: Electron.Event, method: string, params: Record<string, unknown>, sessionId?: string): void => {
      if (method === 'Target.receivedMessageFromTarget' && typeof params.message === 'string') {
        try { const event = JSON.parse(params.message); message(_event, event.method, event.params ?? {}, String(params.sessionId)); } catch {}
        return
      }
      if (method === 'Target.detachedFromTarget' && params.sessionId === current.sessionId && current.sessionId) { changed(); return }
      if ((sessionId ?? '') !== (current.sessionId ?? '')) return
      if ((method === 'Page.frameNavigated' && (params.frame as {id?:string})?.id === tool.frameId) || (method === 'Page.frameDetached' && params.frameId === tool.frameId)) { changed(); return }
      if (method !== 'WebMCP.toolResponded' || typeof params.invocationId !== 'string') return
      // Immediate tools may respond before invokeTool's command acknowledgement.
      // Retain only bounded candidate responses until that acknowledgement names
      // the invocation; unrelated concurrent events can never settle this call.
      if (!invocationId) { if (earlyResponses.size < 64) earlyResponses.set(params.invocationId,params); return }
      if (params.invocationId === invocationId) responded(params)
    }
    const changed = (): void => {
      quiescent = true
      finish(Object.assign(new Error('The site tool document changed during execution; observe the current page before continuing'), { code: 'SITE_TOOL_CONTEXT_CHANGED' }))
    }
    const destroyed = (): void => { quiescent = true; finish(Object.assign(new Error('Site tool target closed or its process exited'), { code: 'SITE_TOOL_CONTEXT_CHANGED' })) }
    const detached = (): void => { finish(new Error('Site tool debugger detached before completion')) }
    guest.debugger.on('message', message); guest.debugger.once('detach', detached)
    guest.once('destroyed', destroyed); guest.once('render-process-gone', destroyed); signal.addEventListener('abort', cancel, { once: true })
    void Promise.resolve().then(() => {
      signal.throwIfAborted()
      dispatched = true
      return invokeSend('WebMCP.invokeTool', { frameId: tool.frameId, toolName: tool.name, input: args.input })
    }).then(result => {
      if (typeof result.invocationId !== 'string') throw new Error('The browser returned no site tool invocation ID')
      const acknowledgedId: string = result.invocationId
      invocationId = acknowledgedId
      if (earlyResponses.has(acknowledgedId)) responded(earlyResponses.get(acknowledgedId)!)
      else if (signal.aborted) cancel()
      earlyResponses.clear()
    }).catch(error => finish(error))
  })
}
