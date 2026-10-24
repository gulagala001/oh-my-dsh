import { randomUUID } from 'node:crypto'
import { openCUDownloadIds } from './opencu-downloads.ts'
import { AsyncLocalStorage } from 'node:async_hooks'
import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { type NavigationEntry, type WebContents } from 'electron'
import { inspectSiteTools, beginSiteTool, invokeSiteTool, cancelSiteTool } from './opencu-site-tools.ts'
import { readPageImage } from './opencu-page-image.ts'
import { runCDPLocator } from './opencu-cdp-locator.js'
import { selectOptionsFunction, selectOptionsResult } from './opencu-select-options.js'
import { filePaths, validateFileInput, writeFileInput } from './opencu-file-input.js'
import { guestKeySpec as inputKey, keyEventParameters, keyboardInputTypes } from './opencu-keyboard.js'
import { createPageInputMonitor } from './opencu-input-monitor.js'
import { runTextEdit, validateTextEditRequest } from './opencu-text-edit.js'
import { createCDPFrameRouter, hitTestViewport, readCDPFrameOwners, type CDPFrameRouter, type FrameElement, type FrameRoute } from './opencu-frame-router.js'
import { captureAXTree, axElementKey } from './opencu-ax-tree.js'
import { openCUDialogs, type DialogFence } from './opencu-dialogs.ts'

type RemoteResult = { result: { value?: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } }
interface ObservationState {
  elements: Map<string, FrameElement>
  elementIds: Map<string, string>
  nodeIds: Map<string, string>
  frameRouter?: CDPFrameRouter
  pending: Promise<unknown>
  cancellation: AbortController
  capture?: Promise<unknown>
  release?: Promise<unknown>
  navigation?: Promise<void>
  debuggerUsers: number
  ownsDebugger: boolean
  inputActive?: boolean
  inputKeys: Map<string, ReturnType<typeof inputKey>>
  inputButtons: Set<string>
  releasingInputs: Map<string, Promise<unknown>>
  inputPosition: { x: number; y: number }
  uploadGeneration: number
  documentGeneration: number
  identityScope: string
  observationId?: string
  deferredAX?: boolean
  rendererExited?: boolean
  monitoringActive?: boolean
  monitorPending?: Promise<unknown>
  monitorError?: string
  monitorRoutes: Map<string, FrameRoute>
  monitorScripts: Map<string, { send: FrameRoute['send']; identifier: string }>
  monitorOwner?: string
  monitorEpoch?: number
  monitorEvents: {kind: string; frameId: string; documentId: string}[]
  monitorInitial?: Set<string>
  monitorBootstraps: Set<Promise<unknown>>
  retiring?: Promise<{ released: true; retired: true }>
}
const states = new WeakMap<WebContents, ObservationState>()
// Short public handles never expose frame/document routing keys or collide with
// another guest in this host process. Navigation drops aliases without reusing IDs.
let nextElementId = 0
const newElementId = (): string => String(++nextElementId)
const inputMonitorSource = `(() => { if (globalThis.__opencuNativeInput) return; const events=[];
  const monitor=(${createPageInputMonitor.toString()})(event=>{if(events.length>=256)events.shift();events.push(event)});
  globalThis.__opencuNativeInput={monitor,events}; })()`
const operations = new AsyncLocalStorage<{ fence: DialogFence; inputDispatched: boolean; operation: string; signal: AbortSignal; guard<T>(work: () => Promise<T>): Promise<T> }>()
function dispatchesInput(method: string, params: Record<string, unknown>, operation?: string): boolean {
  if (method === 'Target.sendMessageToTarget' && typeof params.message === 'string') {
    try { const command = JSON.parse(params.message); method = command.method; params = command.params ?? {} } catch { return false }
  }
  return typeof method === 'string' && (method.startsWith('Input.') ||
    ['DOM.focus', 'DOM.scrollIntoViewIfNeeded', 'DOM.setFileInputFiles'].includes(method) ||
    method === 'Runtime.callFunctionOn' && (['focus', 'selectAll', 'patch'].includes(operation ?? '') || String(params.functionDeclaration ?? '').includes('__opencuClearFileInput')))
}
const guestExited = (): Error => Object.assign(new Error('The browser page process exited; reload the page before observing or sending input'), { code: 'BROWSER_GUEST_CRASHED', details: { inputDispatched: false } })
// Error documents and ordinary HTTP pages need not expose crypto.randomUUID.
// Mint a fresh candidate in the host; the document retains its existing identity.
const metadata = (): string => `(() => { const state = globalThis.__opencuDocument ??= { id: ${JSON.stringify(randomUUID())}, next: 0, elements: new Map() }; return { documentId: state.id, url: location.href, title: document.title, viewport: { width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio, scrollX, scrollY } }; })()`


function value(result: RemoteResult): unknown {
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}

/** Invalidate queued uploads synchronously before the guest lease is released. */
export function cancelOpenCUUpload(guest: WebContents): void {
  const state = states.get(guest)
  if (state) state.uploadGeneration++
}

/** Drain target-directed input before its owning renderer or lease is destroyed. */
export async function releaseOpenCUInput(guest: WebContents): Promise<void> {
  if (guest.isDestroyed() || !states.has(guest)) return
  await openCUAutomation(guest, 'releaseInput', {}, () => false)
}

/** A destroyed native occurrence cannot retain input; wait for its old work before retiring it. */
export async function settleDestroyedOpenCUInput(guest: WebContents): Promise<{ released: true; retired: true }> {
  if (!guest.isDestroyed()) throw Object.assign(new Error('The original browser guest is not confirmed destroyed'), { code: 'RELEASE_FAILED' })
  const current = states.get(guest)
  if (!current) return { released: true, retired: true }
  if (current.retiring) return current.retiring
  const retirement = (async (): Promise<{ released: true; retired: true }> => {
  current.cancellation.abort(Object.assign(new Error('The original browser guest was destroyed'), { code: 'CONTROL_STOPPED' }))
  current.uploadGeneration++; current.monitoringActive = false
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.allSettled([current.pending, current.navigation, current.release, current.monitorPending, ...current.monitorBootstraps, ...current.releasingInputs.values()]),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Destroyed browser input is still settling'), { code: 'RELEASE_FAILED' })), 5000) }),
    ])
  } finally { clearTimeout(timer) }
  // Native destruction has already ended the child sessions; close only their local journals.
  await current.frameRouter?.close().catch(() => undefined)
  current.inputKeys.clear(); current.inputButtons.clear(); current.releasingInputs.clear()
  current.elements.clear(); current.elementIds.clear(); current.nodeIds.clear(); current.monitorRoutes.clear(); current.monitorScripts.clear(); current.monitorEvents.length = 0
  states.delete(guest)
  return { released: true, retired: true }
  })()
  current.retiring = retirement
  void retirement.catch(() => { if (current.retiring === retirement) delete current.retiring })
  return retirement
}

/** Validate a complete native history before reserving its first navigation. */
export function resolveOpenCUNavigation(input: unknown, allowedNavigation: (url: string) => boolean): { entries: NavigationEntry[]; index: number } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid navigation history')
  const args = input as Record<string, unknown>
  if (!Array.isArray(args.entries) || !args.entries.length || !Number.isInteger(args.index) || Number(args.index) < 0 || Number(args.index) >= args.entries.length) throw new Error('Invalid navigation history')
  const entries = args.entries.map((value: unknown): NavigationEntry => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid navigation entry')
    const entry = value as Record<string, unknown>
    if (typeof entry.url !== 'string' || typeof entry.title !== 'string' || !(entry.url === 'about:blank' || /^about:blank#/.test(entry.url) || allowedNavigation(entry.url)) || entry.pageState !== undefined && typeof entry.pageState !== 'string') throw new Error('Invalid navigation entry')
    return { url: entry.url, title: entry.title, ...(typeof entry.pageState === 'string' ? { pageState: entry.pageState } : {}) }
  })
  return { entries, index: Number(args.index) }
}

/** Run fixed accessibility and DOM operations on the caller's already verified guest. */
export function openCUAutomation(guest: WebContents, operation: unknown, input: unknown, allowedNavigation: (url: string) => boolean): Promise<unknown> {
  if (typeof operation !== 'string' || !['getDialog', 'handleDialog', 'pageState', 'navigationState', 'inputMarker', 'inputMonitor', 'observe', 'locator', 'domSnapshot', 'checked', 'point', 'verifyElement', 'focus', 'selectAll', 'selectOption', 'selectText', 'paste', 'describe', 'patch', 'hitTest', 'upload', 'navigationSnapshot', 'restoreNavigation', 'siteTools', 'invokeSiteTool', 'cancelSiteTool', 'cancelUpload', 'capture', 'readPageImage', 'input', 'insertText', 'releaseInput'].includes(operation)) throw new Error('Unsupported guest automation operation')
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid guest automation arguments')
  const args = { ...input as Record<string, unknown> }
  if (typeof args.elementId === 'number' && Number.isSafeInteger(args.elementId) && args.elementId >= 0) args.elementId = String(args.elementId)
  const dialogs = openCUDialogs(guest)
  // These operations must bypass the page's serialized/focus/DOM command queue.
  if (operation === 'getDialog') return Promise.resolve(dialogs.get())
  if (operation === 'handleDialog') {
    const handled = dialogs.handle(args)
    return openCUAutomation(guest, 'releaseInput', { dismissDialogs: false }, allowedNavigation).then(() => ({ ...handled,
      ...(dialogs.pending() ? { pendingDialog: dialogs.pending() } : {}) }), error => {
      return { ...handled, ...(dialogs.pending() ? { pendingDialog: dialogs.pending() } : {}),
        releasePending: true, releaseFailures: [{ code: error?.code, message: error?.message ?? String(error) }] }
    })
  }
  if (operation === 'releaseInput' && args.dismissDialogs !== false) dialogs.dismiss()
  if (operation === 'releaseInput' && dialogs.pending()) {
    const input = states.get(guest)
    if (!input?.inputKeys.size && !input?.inputButtons.size) return Promise.resolve({ released: true, deferredFocus: true })
  }
  if (!['cancelSiteTool', 'cancelUpload'].includes(operation)) dialogs.assertClear()
  if (operation === 'cancelSiteTool') return cancelSiteTool(guest, typeof args.requestId === 'string' ? args.requestId : undefined)
  if (operation === 'cancelUpload') {
    cancelOpenCUUpload(guest)
    return Promise.resolve({ cancelled: true })
  }
  let state = states.get(guest)
  if (!state) {
    state = { elements: new Map(), elementIds: new Map(), nodeIds: new Map(), monitorRoutes: new Map(), monitorScripts: new Map(), monitorEvents: [], monitorBootstraps: new Set(), pending: Promise.resolve(), cancellation: new AbortController(), debuggerUsers: 0, ownsDebugger: false, uploadGeneration: 0, documentGeneration: 0, identityScope: randomUUID(),
      inputKeys: new Map(), inputButtons: new Set(), releasingInputs: new Map(), inputPosition: { x: 0, y: 0 } }
    states.set(guest, state)
    const tracked = state
    const invalidate = (): void => { tracked.monitorEvents.length = 0; if(tracked.monitoringActive) tracked.monitorError = 'The new document has not completed frame input monitoring'; tracked.documentGeneration++; tracked.identityScope = randomUUID(); tracked.elements.clear(); tracked.elementIds.clear(); tracked.nodeIds.clear(); delete tracked.observationId; delete tracked.deferredAX }
    guest.on('render-process-gone', () => {
      invalidate(); tracked.rendererExited = true; tracked.uploadGeneration++
      tracked.monitorRoutes.clear(); tracked.monitorScripts.clear(); tracked.monitorEvents.length = 0
      tracked.inputKeys.clear(); tracked.inputButtons.clear(); tracked.releasingInputs.clear(); tracked.inputActive = false
      const router = tracked.frameRouter; delete tracked.frameRouter
      void router?.close().catch(() => {}) // The exited process already owns no frame sessions.
    })
    guest.on('dom-ready', () => { tracked.rendererExited = false })
    guest.on('did-navigate', () => { tracked.rendererExited = false; invalidate() })
    guest.on('did-navigate-in-page', invalidate)
  }
  const current = state, uploadGeneration = state.uploadGeneration, documentGeneration = state.documentGeneration
  if (operation === 'releaseInput' && current.release) return current.release
  if (operation === 'releaseInput') {
    current.cancellation.abort(Object.assign(new Error('Browser operation interrupted by input release'), { code: 'CONTROL_STOPPED' }))
    current.cancellation = new AbortController()
    current.elements.clear(); current.elementIds.clear(); current.nodeIds.clear(); delete current.observationId; delete current.deferredAX
    delete current.capture
  }
  const signal = current.cancellation.signal
  const verifyElement = async (): Promise<{ valid: true }> => {
    if (typeof args.elementId !== 'string' || !current.elements.has(args.elementId)) throw Object.assign(new Error('STALE_ELEMENT: observe the current document again'), {code:'STALE_ELEMENT',details:{inputDispatched:false}})
    if (args.observationId !== undefined && args.observationId !== current.observationId) throw Object.assign(new Error('STALE_ELEMENT: element observation has expired'), {code:'STALE_ELEMENT',details:{inputDispatched:false}})
    const entry = current.elements.get(String(args.elementId))
    if (entry?.route) await current.frameRouter!.validate(entry.route)
    return { valid: true }
  }
  if (current.rendererExited || guest.isCrashed()) {
    if (operation === 'releaseInput') {
      current.inputKeys.clear(); current.inputButtons.clear(); current.inputActive = false
      return Promise.resolve({ released: true })
    }
    return Promise.reject(guestExited())
  }
  const siteInvocation = operation === 'invokeSiteTool' ? beginSiteTool(guest, args.requestId) : undefined
  if (operation === 'capture' && current.capture) return current.capture
  const work = (operation === 'inputMonitor' ? current.monitorPending?.catch(() => undefined) ?? Promise.resolve()
    : ['capture', 'releaseInput'].includes(operation) ? Promise.resolve() : Promise.all([current.pending, current.navigation])).then(async () => {
    signal.throwIfAborted()
    let removeAbort = (): void => {}
    const interrupted = new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', abort, { once: true })
      function abort(): void { reject(signal.reason) }
      removeAbort = () => signal.removeEventListener('abort', abort)
      if (signal.aborted) abort()
    })
    const context = { fence: dialogs.fence(), inputDispatched: false, operation, signal,
      async guard<T>(work: () => Promise<T>): Promise<T> {
        signal.throwIfAborted()
        return Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return work() }), interrupted])
      } }
    const execute = async (): Promise<unknown> => {
    signal.throwIfAborted()
    siteInvocation?.controller.signal.throwIfAborted()
    if (guest.isDestroyed()) throw new Error('The browser guest is closed')
    dialogs.assertClear()
    if (current.rendererExited || guest.isCrashed()) throw guestExited()
    if (current.documentGeneration !== documentGeneration && !['releaseInput','navigationState','inputMonitor'].includes(operation)) throw Object.assign(new Error('STALE_ELEMENT: the queued document changed'), { code: 'STALE_ELEMENT', details: { inputDispatched: false } })
    if (operation === 'verifyElement' && (!current.deferredAX || current.elements.has(String(args.elementId)))) return verifyElement()
    if (operation === 'navigationSnapshot') {
      return { entries: guest.navigationHistory.getAllEntries(), index: guest.navigationHistory.getActiveIndex() }
    }
    if (operation === 'restoreNavigation') {
      const restored = guest.navigationHistory.restore(resolveOpenCUNavigation(args, allowedNavigation))
      // Native restore cannot be cancelled. Release may pass it, but subsequent
      // ordinary commands still wait for its actual completion.
      const navigation = restored.then(() => {}, () => {})
      current.navigation = navigation
      void navigation.then(() => { if (current.navigation === navigation) delete current.navigation })
      await restored
      signal.throwIfAborted()
      current.elements.clear()
      return { restored: true, url: guest.getURL(), index: guest.navigationHistory.getActiveIndex() }
    }
    if (!guest.debugger.isAttached()) {
      guest.debugger.attach('1.3')
      current.ownsDebugger = true
    }
    current.debuggerUsers++
    const send = (method: string, params: object = {}, sessionId?: string): Promise<any> => {
      if (current.rendererExited || guest.isCrashed()) return Promise.reject(guestExited())
      // Resuming a freshly attached target is cleanup, even if its originating
      // action was cancelled or opened a modal while frame setup was pending.
      if (method === 'Runtime.runIfWaitingForDebugger') return guest.debugger.sendCommand(method, params, sessionId)
      const active = operations.getStore()
      const dispatch = () => (active?.fence ?? dialogs).guard(() => {
        const data = params as Record<string, unknown>
        const releasedKey = method === 'Input.dispatchKeyEvent' && data.type === 'keyUp' ? String(data.key) : undefined
        const releasedButton = method === 'Input.dispatchMouseEvent' && data.type === 'mouseReleased' ? String(data.button) : undefined
        const releaseId = releasedKey ? `key:${releasedKey}` : releasedButton ? `button:${releasedButton}` : undefined
        if (releaseId && current.releasingInputs.has(releaseId)) return current.releasingInputs.get(releaseId)!
        const ack = new Promise((resolve, reject) => {
        const gone = (): void => { finish(); reject(guestExited()) }
        const cancelled = (): void => { finish(); reject(active!.signal.reason) }
        const finish = (): void => { guest.off('render-process-gone', gone); active?.signal.removeEventListener('abort', cancelled) }
        guest.once('render-process-gone', gone)
        active?.signal.addEventListener('abort', cancelled, { once: true })
        if (dispatchesInput(method, data, active?.operation)) {
          if (active) active.inputDispatched = true
        }
        try { void guest.debugger.sendCommand(method, params, sessionId).then(value => { finish(); resolve(value) }, error => { finish(); reject(error) }) }
        catch (error) { finish(); reject(error) }
        })
        if (releaseId) {
          current.releasingInputs.set(releaseId, ack)
          const forget = (): void => { if (current.releasingInputs.get(releaseId) === ack) current.releasingInputs.delete(releaseId) }
          void ack.then(() => {
            if (releasedKey) current.inputKeys.delete(releasedKey)
            if (releasedButton) current.inputButtons.delete(releasedButton)
            forget()
          }, forget)
        }
        return ack
      })
      return active ? active.guard(dispatch) : dispatch()
    } // CDP replies vary by method; validate at their consumers below.
    const frameRouter = (): CDPFrameRouter => current.frameRouter ??= createCDPFrameRouter(send, listener => {
      const receive = (_event: Electron.Event, method: string, params: unknown, sessionId?: string): void => { operations.exit(() => listener(method, params, sessionId)) }
      guest.debugger.on('message', receive)
      return () => {guest.debugger.removeListener('message', receive)}
    }, {
      sendSession: (id, method, params) => send(method, params, id),
      prepareSession: ({sessionId,send:sessionSend}) => {
        const task = operations.exit(async () => {
          if (!current.monitoringActive) return
          try {
            const script = await sessionSend('Page.addScriptToEvaluateOnNewDocument', { source: inputMonitorSource, worldName: 'opencu-frame-locators' })
            if (!current.monitoringActive) { await sessionSend('Page.removeScriptToEvaluateOnNewDocument', {identifier:script.identifier}); return }
            current.monitorScripts.set(sessionId, {send:sessionSend,identifier:script.identifier})
          } catch (error) { current.monitorError = (error as Error).message; throw error }
        })
        current.monitorBootstraps.add(task)
        void task.finally(() => { current.monitorBootstraps.delete(task) }).catch(() => undefined)
        return task
      },
    })
    const retiredFrame = (error: unknown): boolean => ['FRAME_DETACHED', 'STALE_OBSERVATION', 'STALE_ELEMENT', 'BROWSER_GUEST_CRASHED'].includes((error as {code?:string}).code ?? '') || /Cannot find context|Execution context was destroyed|No session with given id|Session with given id not found|Session closed|Target closed|No frame with given id/iu.test((error as Error).message);
    const monitorRoute = async (route: FrameRoute, expression: string): Promise<any> => {
      await frameRouter().validate(route)
      if (!current.monitorScripts.has(route.sessionId)) {
        const script = await route.send('Page.addScriptToEvaluateOnNewDocument', { source: inputMonitorSource, worldName: 'opencu-frame-locators' })
        current.monitorScripts.set(route.sessionId, { send: route.send, identifier: script.identifier })
      }
      const result = value(await route.send('Runtime.evaluate', { contextId: route.contextId, expression: `${inputMonitorSource};${expression}`, returnByValue: true }))
      await frameRouter().validate(route)
      current.monitorRoutes.set(`${route.frameId}:${route.documentId}`, route)
      return result
    }
    const finishMarker = async (marker: { route: FrameRoute; id: string } | undefined, dispatched: boolean): Promise<void> => {
      if (marker) await monitorRoute(marker.route, `globalThis.__opencuNativeInput.monitor.finishInput(${JSON.stringify(marker.id)},${dispatched})`)
    }
    const dispatchMarked = async (marker: { route: FrameRoute; id: string } | undefined, dispatch: () => Promise<unknown>): Promise<void> => {
      let dispatched = false, failure: (Error & {details?:Record<string,unknown>}) | undefined
      try { await dispatch(); dispatched = true }
      catch (error) { failure = error as typeof failure; throw error }
      finally {
        if (!context.fence.interrupted && !dialogs.pending() && !guest.isDestroyed() && !current.rendererExited) {
          try { await finishMarker(marker, dispatched) }
          catch (error) { if (!failure) throw error; failure.details = {...failure.details, inputMarkerError:(error as Error).message} }
        }
      }
    }
    const markInput = async (route: FrameRoute, events: Record<string, unknown>[], node?: number, pending = false): Promise<{ route: FrameRoute; id: string } | undefined> => {
      if (!current.monitoringActive) return
      await monitorRoute(route, 'null')
      if (node) {
        const objectId = await frameRouter().remoteElement(route, node)
        try {
          const id = value(await route.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function(events,pending){const target=this.nodeType===1?this:this.parentElement;return globalThis.__opencuNativeInput.monitor.expectInput(events.map(event=>({...event,target})),pending)}',
            arguments: [{ value: events }, { value: pending }], returnByValue: true }))
          return typeof id === 'string' ? { route, id } : undefined
        } finally { await route.send('Runtime.releaseObject', { objectId }).catch(() => undefined) }
      }
      const id = await monitorRoute(route, `globalThis.__opencuNativeInput.monitor.expectInput(${JSON.stringify(events)},${pending})`)
      return typeof id === 'string' ? { route, id } : undefined
    }
    let releaseSend = send
    let objectId: string | undefined
    const insertMarkedText = async (text: string, verify?: () => Promise<unknown>): Promise<void> => {
      const route = current.monitoringActive ? await frameRouter().focused() : undefined
      const marker = route ? await monitorRoute(route, `globalThis.__opencuNativeInput.monitor.expectTextInput(${JSON.stringify(text)})`)
        : value(await send('Runtime.evaluate', { expression: `globalThis.__opencuAnnotations?.expectTextInput?.(${JSON.stringify(text)})`, returnByValue: true }))
      let failure: (Error & {details?: Record<string, unknown>}) | undefined
      try {
        await verify?.()
        if (current.documentGeneration !== documentGeneration) throw Object.assign(new Error('STALE_ELEMENT: document changed before text dispatch'), {code:'STALE_ELEMENT',details:{inputDispatched:false}})
        await send('Input.insertText', { text })
      } catch (error) { failure = error as typeof failure; throw error }
      finally {
        // A modal interrupts this operation permanently. Never wait for its JS
        // context or resume the old dispatch just to clean up a page marker.
        if (marker && !context.fence.interrupted && !dialogs.pending() && !guest.isDestroyed() && !current.rendererExited && !guest.isCrashed()) {
          try {
            if (route) await finishMarker({ route, id: marker }, false)
            else await send('Runtime.evaluate', {expression:`globalThis.__opencuAnnotations?.finishInput(${JSON.stringify(marker)},false)`})
          }
          catch (error) { if (!failure) throw error; failure.details = {...failure.details,inputMarkerError:(error as Error).message} }
        }
      }
    }
    try {
      // Screenshot observations need only document identity and geometry. Rebuild
      // their element index only if a later command actually uses an AX handle.
      // Locator-created entries already have their own live frame validation.
      if (current.deferredAX && typeof args.elementId === 'string' && !current.elements.has(args.elementId)) {
        if (args.observationId !== undefined && args.observationId !== current.observationId) throw Object.assign(new Error('STALE_ELEMENT: element observation has expired'), {code:'STALE_ELEMENT',details:{inputDispatched:false}})
        if (![...current.elementIds.values()].includes(args.elementId)) throw Object.assign(new Error('STALE_ELEMENT: use an ID from the preceding AX observation'), {code:'STALE_ELEMENT',details:{inputDispatched:false}})
        const live = (): void => {
          signal.throwIfAborted()
          if (guest.isDestroyed() || documentGeneration !== current.documentGeneration) throw Object.assign(new Error('STALE_ELEMENT: document changed while resolving screenshot elements'), {code:'STALE_ELEMENT',details:{inputDispatched:false}})
        }
        const captured = await captureAXTree(send, frameRouter(), live)
        await captured.validate()
        live()
        const elements = new Map<string, FrameElement>(), elementIds = new Map<string, string>()
        for (const {node, route, key} of captured.nodes) if (node.backendDOMNodeId) {
          const id = current.elementIds.get(key) ?? newElementId()
          elementIds.set(key, id); elements.set(id, {backendNodeId:node.backendDOMNodeId, ...(route ? {route} : {})})
        }
        current.elements = elements
        current.elementIds = elementIds
        delete current.deferredAX
      }
      if (operation === 'verifyElement') return await verifyElement()
      if (operation === 'navigationState') {
        const cursor = (): {downloadIds?: string[]} => args.downloadCursor === true ? {downloadIds:openCUDownloadIds(guest.id)} : {}
        let result
        try { result = value(await send('Runtime.evaluate', {expression:'({url:location.href,readyState:document.readyState})',returnByValue:true})) }
        catch (error) {
          signal.throwIfAborted()
          if (current.documentGeneration !== documentGeneration || /Cannot find context|Execution context was destroyed|Inspected target navigated/u.test((error as Error).message))
            return {url:guest.getURL(),documentId:String(current.documentGeneration),readyState:'loading',webContentsId:guest.id,...cursor()}
          throw error
        }
        if (current.documentGeneration !== documentGeneration) return {url:guest.getURL(),documentId:String(current.documentGeneration),readyState:'loading',webContentsId:guest.id,...cursor()}
        if (!result || typeof result !== 'object' || !('url' in result) || typeof result.url !== 'string'
          || !('readyState' in result) || typeof result.readyState !== 'string') throw new Error('Invalid browser navigation state')
        return {url:result.url,readyState:result.readyState,documentId:String(current.documentGeneration),webContentsId:guest.id,...cursor()}
      }
      if (operation === 'pageState') return value(await send('Runtime.evaluate', { expression:
        '({ documentId: globalThis.__opencuDocument?.id, url: location.href, width: innerWidth, height: innerHeight, scrollX, scrollY, focused: document.hasFocus() })', returnByValue: true }))
      if (operation === 'inputMonitor') {
        if (!['install', 'read', 'dispose'].includes(String(args.method)) || typeof args.owner !== 'string' || !args.owner || args.owner.length > 200
          || !Number.isSafeInteger(args.epoch) || Number(args.epoch) < 0) throw new Error('Invalid frame input monitor request')
        if (args.method !== 'install' && (args.owner !== current.monitorOwner || args.epoch !== current.monitorEpoch)) return { available: false, stale: true, events: [] }
        if (args.method === 'read' && !current.monitoringActive) return { available: false, disabled: true, events: [] }
        if (args.method === 'dispose') {
          current.monitoringActive = false
          current.monitorEvents.length = 0
          // Remove future-document scripts first, then visit the current real
          // topology too: a newly inserted frame may not have been polled yet.
          await Promise.all([...current.monitorBootstraps])
          for (const [id, script] of current.monitorScripts) {
            try { await script.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier }); current.monitorScripts.delete(id) }
            catch (error) { if (!retiredFrame(error)) throw error; current.monitorScripts.delete(id) }
          }
          const visited = new Set<string>()
          const disposeFrame = async (route: FrameRoute, depth: number): Promise<void> => {
            if (depth > 32 || visited.size >= 500 || visited.has(route.frameId)) throw new Error('Input monitor frame topology exceeds the supported nesting')
            visited.add(route.frameId)
            value(await route.send('Runtime.evaluate', { contextId: route.contextId,
              expression: 'globalThis.__opencuNativeInput?.monitor.dispose(); delete globalThis.__opencuNativeInput' }))
            for (const owner of await readCDPFrameOwners(route)) if (owner.frameId && owner.backendNodeId) {
              try { await disposeFrame(await frameRouter().child(route, owner.backendNodeId, owner.frameId), depth + 1) }
              catch (error) { if (!retiredFrame(error)) throw error }
            }
          }
          await disposeFrame(await frameRouter().main(), 0)
          current.monitorRoutes.clear(); delete current.monitorInitial
          if (!current.inputActive && current.frameRouter) { await current.frameRouter.close(); delete current.frameRouter }
          return { available: false, disposed: true, events: [] }
        }
        if (args.method === 'install') {
          if (args.owner === current.monitorOwner && Number(args.epoch) < (current.monitorEpoch ?? 0)) return { available: false, stale: true, events: [] }
          if (args.owner !== current.monitorOwner || args.epoch !== current.monitorEpoch) {
            current.monitorInitial = new Set(); current.monitorEvents.length = 0
          }
          current.monitorOwner = args.owner; current.monitorEpoch = Number(args.epoch)
          current.monitoringActive = true
        }
        const routes = new Map<string, FrameRoute>(), visited = new Set<string>()
        const visit = async (route: FrameRoute, depth: number): Promise<void> => {
          if (depth > 32 || visited.size >= 500 || visited.has(route.frameId)) throw new Error('Input monitor frame topology changed or exceeds the supported nesting')
          visited.add(route.frameId)
          const key = `${route.frameId}:${route.documentId}`
          const messages = await monitorRoute(route, 'globalThis.__opencuNativeInput.events.splice(0)')
          routes.set(key, route)
          if (current.monitorInitial && !current.monitorInitial.has(key)) current.monitorInitial.add(key)
          else if (Array.isArray(messages)) for (const message of messages) if (message && typeof message === 'object'
            && ['pointerdown', 'keydown', 'wheel', 'input'].includes(message.kind)) {
              if (current.monitorEvents.length >= 1024) current.monitorEvents.shift()
              current.monitorEvents.push({ kind: message.kind, frameId: route.frameId, documentId: route.documentId })
            }
          for (const owner of await readCDPFrameOwners(route)) {
            if (owner.frameId && owner.backendNodeId) await visit(await frameRouter().child(route, owner.backendNodeId, owner.frameId), depth + 1)
          }
          await frameRouter().validate(route)
        }
        try {
          await visit(await frameRouter().main(), 0)
          const sessions = new Set([...routes.values()].map(route => route.sessionId))
          for (const [id, script] of current.monitorScripts) if (!sessions.has(id)) {
            try { await script.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier }) }
            catch (error) { if (!retiredFrame(error)) throw error }
            current.monitorScripts.delete(id)
          }
          const events = current.monitorEvents.filter(event => routes.has(`${event.frameId}:${event.documentId}`))
          current.monitorEvents.length = 0
          current.monitorRoutes = routes; delete current.monitorError; delete current.monitorInitial
          return { available: true, scope: 'all-frames', frameCount: routes.size, events }
        } catch (error) {
          current.monitorError = (error as Error).message
          throw error
        }
      }
      if (operation === 'inputMarker') {
        if (!['expect', 'finish', 'clear'].includes(String(args.method)) || args.method === 'expect' && (!Array.isArray(args.events) || args.events.length > 64)) throw new Error('Invalid input marker operation')
        // The native dispatcher arms only the exact live recipient immediately
        // before input. A client's earlier focus/coordinate guess arms nothing.
        if (current.monitoringActive) return undefined
        return value(await send('Runtime.evaluate', { expression: `(() => { const args = ${JSON.stringify(args)}; const markers = globalThis.__opencuAnnotations;
          if (args.method === 'expect') return markers?.expectInput(args.events, args.pending === true);
          if (args.method === 'finish') return markers?.finishInput(args.marker, args.dispatched === true);
          return markers?.clearInput(); })()`, returnByValue: true }))
      }
      if (operation === 'selectText' || operation === 'paste') {
        validateTextEditRequest(operation,args)
        const entry = args.elementId != null ? current.elements.get(String(args.elementId)) : undefined
        const generation = current.documentGeneration
        if (args.elementId != null && !entry || args.observationId !== undefined && args.observationId !== current.observationId) throw Object.assign(new Error('STALE_ELEMENT: observe the current editable element again'), {code:'STALE_ELEMENT',details:{inputDispatched:false}})
        const validate = async (): Promise<void> => {
          signal.throwIfAborted()
          if (guest.isDestroyed() || current.rendererExited || guest.isCrashed()) throw guestExited()
          if (current.documentGeneration !== generation || entry && current.elements.get(String(args.elementId)) !== entry) throw Object.assign(new Error('STALE_ELEMENT: the selected editable document changed'),{code:'STALE_ELEMENT',details:{inputDispatched:false}})
          if (entry?.route) await current.frameRouter!.validate(entry.route)
        }
        const elementSend = (method:string,params:object={}):Promise<any> => context.guard(() => context.fence.guard(() => (entry?.route?.send ?? send)(method,params)))
        return await runTextEdit(elementSend,operation,args,{
          ...(entry ? {backendNodeId:entry.backendNodeId} : {}),...(entry?.route ? {contextId:entry.route.contextId} : {}),validate,
          onFocus:()=>{signal.throwIfAborted();context.inputDispatched=true;current.inputActive=true},
          beforeFocus:async()=>{
            await guest.hostWebContents?.executeJavaScript(`(() => { const view=[...document.querySelectorAll('webview')].find(item=>item.getWebContentsId()===${guest.id});if(!view)throw new Error('Browser input guest is detached');if(document.activeElement===view)view.blur();view.focus(); })()`)
            await send('Emulation.setFocusEmulationEnabled',{enabled:true})
          },
          insertText:insertMarkedText,
        })
      }
      if (operation === 'input' || operation === 'insertText') {
        current.inputActive = true
        const generation = current.documentGeneration
        // Focus the embedding element, not its BrowserWindow. Chromium otherwise drops
        // keyboard/text CDP events in a nested guest even with focus emulation enabled.
        if (operation === 'insertText' || args.type === 'keyDown') {
          await guest.hostWebContents?.executeJavaScript(`(() => { const view = [...document.querySelectorAll('webview')].find(item => item.getWebContentsId() === ${guest.id}); if (!view) throw new Error('Browser input guest is detached'); if (${operation === 'insertText'} && document.activeElement === view) view.blur(); view.focus(); })()`)
        }
        await send('Emulation.setFocusEmulationEnabled', { enabled: true })
        signal.throwIfAborted()
        const releasing = operation === 'input' && (args.type === 'keyUp' || args.type === 'mouseUp')
        if (guest.isDestroyed() || !releasing && (current.documentGeneration !== generation || args.elementId != null && !current.elements.has(String(args.elementId)))) throw new Error('STALE_ELEMENT: document changed before input dispatch')
        const inputElement = args.elementId != null ? current.elements.get(String(args.elementId)) : undefined
        if (!releasing && inputElement?.route) {
          await current.frameRouter!.validate(inputElement.route)
          if (inputElement.route.owners.length && (operation === 'insertText' || args.type === 'keyDown')) await current.frameRouter!.focus(inputElement as FrameElement & {route:NonNullable<FrameElement['route']>})
        }
        if (!releasing && current.documentGeneration !== generation) throw new Error('STALE_ELEMENT: document changed before input dispatch')
        signal.throwIfAborted()
        if (operation === 'insertText') {
          if (typeof args.text !== 'string') throw new Error('insertText requires text')
          await insertMarkedText(args.text, async () => {
            if (inputElement?.route) await current.frameRouter!.validate(inputElement.route)
            if (args.elementId != null && current.elements.get(String(args.elementId)) !== inputElement) throw Object.assign(new Error('STALE_ELEMENT: editable target changed before text dispatch'), {code:'STALE_ELEMENT',details:{inputDispatched:false}})
          })
        } else {
          const modifierNames = Array.isArray(args.modifiers) ? args.modifiers : []
          const modifiers = modifierNames.reduce<number>((bits, name) => bits | ({ alt: 1, control: 2, meta: 4, shift: 8 }[String(name)] ?? 0), 0)
          if (args.type === 'keyDown' || args.type === 'keyUp') {
            const spec = inputKey(args.keyCode), down = args.type === 'keyDown'
            const parameters = keyEventParameters(spec, down, modifiers, process.platform === 'darwin', args.keyboardEditable === true)
            const marker = down && current.monitoringActive ? await markInput(await frameRouter().focused(), [{type:'keydown',key:parameters.key,
              inputTypes:keyboardInputTypes(spec.code, modifiers, process.platform === 'darwin')}]) : undefined
            await dispatchMarked(marker, async () => {
              if (down) current.inputKeys.set(spec.key, spec)
              return send('Input.dispatchKeyEvent', parameters)
            })
            if (!down) current.inputKeys.delete(spec.key)
          } else {
            const types: Record<string, string> = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased', mouseWheel: 'mouseWheel' }
            const type = types[String(args.type)]
            if (!type || !Number.isFinite(args.x) || !Number.isFinite(args.y)) throw new Error('Input requires a mouse event and finite coordinates')
            if (!['none', 'left', 'middle', 'right'].includes(String(args.button ?? 'none'))) throw new Error('Invalid mouse button')
            current.inputPosition = { x: Number(args.x), y: Number(args.y) }
            if (type === 'mousePressed' && inputElement?.route) await current.frameRouter!.checkPoint(inputElement as FrameElement & {route:NonNullable<FrameElement['route']>}, current.inputPosition)
            signal.throwIfAborted()
            let marker: { route: FrameRoute; id: string } | undefined
            if (current.monitoringActive && ['mousePressed', 'mouseWheel'].includes(type)) {
              const hit = await frameRouter().atPoint(current.inputPosition)
              marker = await markInput(hit.route, [{type:type === 'mousePressed' ? 'pointerdown' : 'wheel',
                ...(type === 'mouseWheel' ? {deltaX:args.deltaX ?? 0,deltaY:args.deltaY ?? 0} : {})}], hit.backendNodeId, true)
            }
            await dispatchMarked(marker, async () => {
              if (type === 'mousePressed') current.inputButtons.add(String(args.button))
              return send('Input.dispatchMouseEvent', { type, x: args.x, y: args.y, button: args.button ?? 'none', buttons: args.buttons ?? 0, clickCount: args.clickCount ?? 0, modifiers,
                ...(type === 'mouseWheel' ? { deltaX: args.deltaX ?? 0, deltaY: args.deltaY ?? 0 } : {}) })
            })
            if (type === 'mouseReleased') current.inputButtons.delete(String(args.button))
          }
        }
        return { dispatched: true, delivery: 'target-cdp', effectVerified: false }
      }
      if (operation === 'releaseInput') {
        const errors: unknown[] = []
        const modifiers = [...current.inputKeys.keys()].reduce((bits, name) => bits | ({ Alt: 1, Control: 2, Meta: 4, Shift: 8 }[name] ?? 0), 0)
        for (const button of [...current.inputButtons]) {
          const buttons = [...current.inputButtons].filter(name => name !== button).reduce((bits, name) => bits | ({ left: 1, right: 2, middle: 4 }[name] ?? 0), 0)
          try { await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...current.inputPosition, button, buttons, clickCount: 1, modifiers }); current.inputButtons.delete(button) }
          catch (error) { errors.push(error) }
        }
        // Failed mouse-up keeps its modifier journal intact for the next release.
        if (!current.inputButtons.size) for (const [key, spec] of [...current.inputKeys].reverse()) {
          if (!current.inputKeys.has(key)) continue
          const modifiers = [...current.inputKeys.keys()].filter(name => name !== key).reduce((bits, name) => bits | ({ Alt: 1, Control: 2, Meta: 4, Shift: 8 }[name] ?? 0), 0)
          try { await send('Input.dispatchKeyEvent', keyEventParameters(spec, false, modifiers, process.platform === 'darwin')); current.inputKeys.delete(key) }
          catch (error) { errors.push(error) }
        }
        if (errors.length) throw new AggregateError(errors, 'Target CDP input release failed')
        await send('Emulation.setFocusEmulationEnabled', { enabled: false })
        current.inputActive = false
        for (const route of current.monitorRoutes.values()) await monitorRoute(route, 'globalThis.__opencuNativeInput.monitor.clearInput()').catch(() => undefined)
        if (!current.monitoringActive && current.frameRouter) {await current.frameRouter.close(); delete current.frameRouter}
        return { released: true }
      }
      if (operation === 'readPageImage') return await readPageImage(guest, send, args)
      if (operation === 'siteTools') return await inspectSiteTools(guest, send, frameRouter())
      if (siteInvocation) return await invokeSiteTool(guest, send, args, siteInvocation.controller.signal, frameRouter())
      if (operation === 'capture') {
        let timer: ReturnType<typeof setTimeout> | undefined
        const screenshot: { data: string } = await Promise.race([
          send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => { reject(Object.assign(new Error('Browser frame capture timed out'), { code: 'BROWSER_CAPTURE_TIMEOUT' })) }, 8000)
          }),
        ]).finally(() => { clearTimeout(timer) })
        // CDP already produced PNG. Read its fixed IHDR instead of decoding and
        // re-encoding every preview on Electron's window/input event loop.
        const header = Buffer.from(screenshot.data.slice(0, 44), 'base64')
        if (header.length < 24 || !header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          || header.readUInt32BE(8) !== 13 || header.toString('ascii', 12, 16) !== 'IHDR') throw new Error('The browser returned an invalid PNG screenshot')
        const width = header.readUInt32BE(16), height = header.readUInt32BE(20)
        if (!width || !height || width > 32768 || height > 32768) throw new Error('The browser returned invalid screenshot dimensions')
        return { dataUrl: `data:image/png;base64,${screenshot.data}`, width, height }
      }
      if (operation === 'locator' || operation === 'domSnapshot') {
        const generation = current.documentGeneration
        const router = frameRouter()
        const result = await runCDPLocator(send, { ...args, operation }, (backendNodeId, route) => {
          signal.throwIfAborted()
          if (generation !== current.documentGeneration) throw new Error('STALE_ELEMENT: document changed while resolving locator')
          const key = axElementKey(backendNodeId,route)
          const elementId = current.elementIds.get(key) ?? newElementId()
          current.elementIds.set(key, elementId)
          current.elements.set(elementId, {backendNodeId,route})
          return elementId
        }, router)
        if (generation !== current.documentGeneration) throw new Error('STALE_ELEMENT: document changed while resolving locator')
        return result
      }
      if (operation === 'observe') {
        const generation = current.documentGeneration
        const live = (): void => {
          signal.throwIfAborted()
          if (guest.isDestroyed()) throw new Error('The browser guest is closed')
          if (generation !== current.documentGeneration) throw Object.assign(new Error('STALE_OBSERVATION: the document changed during observation'), { code: 'STALE_OBSERVATION' })
        }
        const rawDetails = value(await send('Runtime.evaluate', { expression: metadata(), returnByValue: true }))
        const details = rawDetails && typeof rawDetails === 'object' ? { ...rawDetails, userActivityMonitoring: { available: current.monitoringActive === true && !current.monitorError && current.monitorRoutes.size > 0, ...(current.monitoringActive && !current.monitorError ? {scope:'all-frames',frameCount:current.monitorRoutes.size} : {error:current.monitorError ?? 'Frame input monitoring is not active'}) } } : rawDetails
        if (!details || typeof details !== 'object') throw new Error('Guest metadata is unavailable')
        live()
        const observationId = randomUUID()
        if (args.format === 'screenshot') {
          current.elements.clear()
          current.observationId = observationId
          current.deferredAX = true
          return { ...details, observationId, coordinateSpace: 'viewport-css-pixels' }
        }
        const captured = await captureAXTree(send, frameRouter(), live)
        await captured.validate()
        live()
        const elements = new Map<string, FrameElement>()
        const elementIds = new Map<string, string>(), nodeIds = new Map<string, string>()
        for (const {node, key} of captured.nodes) {
          const id = (node.backendDOMNodeId ? current.elementIds.get(key) : current.nodeIds.get(node.nodeId)) ?? newElementId()
          nodeIds.set(node.nodeId, id)
          if (node.backendDOMNodeId) elementIds.set(key, id)
        }
        const nodes = captured.nodes.map(({node,route,key}) => {
          const elementId = node.backendDOMNodeId ? elementIds.get(key) : undefined
          if (elementId && node.backendDOMNodeId) elements.set(elementId, {backendNodeId:node.backendDOMNodeId,...(route ? {route} : {})})
          return { ...(elementId ? { elementId } : {}), nodeId: nodeIds.get(node.nodeId)!, role: node.role?.value ?? '', name: node.name?.value ?? '',
            ...(node.value ? { value: node.value.value } : {}), children: (node.childIds ?? []).flatMap(id => nodeIds.has(id) ? [nodeIds.get(id)!] : []),
            properties: Object.fromEntries((node.properties ?? []).map(item => [item.name, item.value.value ?? item.value.relatedNodes?.map(related => related.text ?? related.idref) ?? null])) }
        })
        current.elements = elements
        current.elementIds = elementIds
        current.nodeIds = nodeIds
        current.observationId = observationId
        delete current.deferredAX
        return { ...details, observationId, coordinateSpace: 'viewport-css-pixels', ax: { source: 'chromium-accessibility-tree', nodes, stableIds: true, identityScope: current.identityScope },
          text: nodes.map(node => `${node.elementId ? `[${node.elementId}] ` : ''}${node.role} ${JSON.stringify(node.name)}${node.value !== undefined ? ` value=${JSON.stringify(node.value)}` : ''}`).join('\n') }
      }
      const generation = current.documentGeneration
      const live = (): void => {
        signal.throwIfAborted()
        if (guest.isDestroyed()) throw new Error('The browser guest is closed')
        if (generation !== current.documentGeneration) throw new Error('STALE_ELEMENT: the document changed during the element operation')
      }
      let entry: FrameElement | undefined
      let backendNodeId: number | undefined
      let elementId = typeof args.elementId === 'string' ? args.elementId : undefined
      if (operation === 'hitTest') {
        if (typeof args.x !== 'number' || !Number.isFinite(args.x) || typeof args.y !== 'number' || !Number.isFinite(args.y)) throw new Error('Hit test requires finite viewport coordinates')
        const hit = await hitTestViewport(send, { x: args.x, y: args.y })
        live()
        backendNodeId = hit.backendNodeId
        elementId = newElementId()
        entry = {backendNodeId}
        current.elements.set(elementId, entry)
      } else {entry = elementId ? current.elements.get(elementId) : undefined; backendNodeId = entry?.backendNodeId}
      if (!backendNodeId || args.observationId !== undefined && args.observationId !== current.observationId) throw new Error('STALE_ELEMENT: observe the current document again')
      const routedSend = entry?.route?.send ?? send
      const elementSend = (method: string, params: object = {}): Promise<any> => context.guard(() => context.fence.guard(() => {
        return routedSend(method, params)
      }))
      releaseSend = elementSend
      if (entry?.route) await current.frameRouter!.validate(entry.route)
      if (operation === 'point' && entry?.route) return current.frameRouter!.point(entry as FrameElement & {route:NonNullable<FrameElement['route']>})
      if (operation === 'focus' && entry?.route) {await current.frameRouter!.focus(entry as FrameElement & {route:NonNullable<FrameElement['route']>}); live(); return {focused:true}}
      if (operation === 'point') {
        await elementSend('DOM.scrollIntoViewIfNeeded', { backendNodeId })
        live()
        const box: { model: { content: number[] } } = await elementSend('DOM.getBoxModel', { backendNodeId })
        live()
        const quad = box.model.content
        return { x: (quad[0]! + quad[2]! + quad[4]! + quad[6]!) / 4, y: (quad[1]! + quad[3]! + quad[5]! + quad[7]!) / 4 }
      }
      if (operation === 'focus') { await elementSend('DOM.focus', { backendNodeId }); live(); return { focused: true } }
      if (operation === 'upload') {
        const files = filePaths(args.files)
        if (files.some(file => !isAbsolute(file))) throw Object.assign(new Error('Upload requires absolute paths on the browser host'), {code:'INVALID_ARGUMENT',details:{inputDispatched:false}})
        const live = (): void => {
          if (guest.isDestroyed()) throw new Error('The browser guest is closed')
          if (current.uploadGeneration !== uploadGeneration) throw Object.assign(new Error('Upload was cancelled'), { code: 'CONTROL_STOPPED' })
          if (!elementId || current.elements.get(elementId)?.backendNodeId !== backendNodeId) throw new Error('STALE_ELEMENT: observe the current document again')
        }
        for (let index = 0; index < files.length; index++) {
          live()
          let info
          try { info = await stat(files[index]!) }
          catch (error) {throw Object.assign(new Error(`Upload source ${index + 1} is unavailable or unreadable`), {code:(error as NodeJS.ErrnoException).code ?? 'UPLOAD_SOURCE_UNAVAILABLE',details:{inputDispatched:false,sourceIndex:index}})}
          if (!info.isFile()) throw Object.assign(new Error(`Upload source ${index + 1} must be a regular file`), {code:'INVALID_ARGUMENT',details:{inputDispatched:false,sourceIndex:index}})
        }
        await validateFileInput(elementSend,{backendNodeId,contextId:entry?.route?.contextId,files})
        live()
        const uploadMarker = files.length && current.monitoringActive ? await markInput(entry?.route ?? await frameRouter().main(), [{type:'input',inputTypes:[null]}], backendNodeId) : undefined
        if (files.length && !current.monitoringActive) await elementSend('Runtime.evaluate', { expression: "globalThis.__opencuAnnotations?.expectInput([{type:'input'}])" })
        try {
          live()
          await validateFileInput(elementSend,{backendNodeId,contextId:entry?.route?.contextId,files})
          live()
          const receipt = await writeFileInput(elementSend,{backendNodeId,contextId:entry?.route?.contextId,files})
          return {action:'upload',...receipt}
        } finally { await finishMarker(uploadMarker, false) }
      }
      const remote: { object: { objectId?: string } } = await elementSend('DOM.resolveNode', { backendNodeId, ...(entry?.route ? {executionContextId:entry.route.contextId} : {}) })
      objectId = remote.object.objectId
      live()
      if (!objectId) throw new Error('STALE_ELEMENT: the DOM node is unavailable')
      if (operation === 'selectOption') {
        const inputDispatched = context.inputDispatched
        context.inputDispatched = true
        const result: RemoteResult = await elementSend('Runtime.callFunctionOn', {objectId,returnByValue:true,
          functionDeclaration:selectOptionsFunction,arguments:[{value:args.values ?? args.value}]})
        const selected = value(result) as {__opencuSelectError?:unknown;selected?:string[]}
        if (selected?.__opencuSelectError) context.inputDispatched = inputDispatched
        const detail = selectOptionsResult(selected)
        live()
        return {...detail,elementId}
      }
      const result: RemoteResult = await elementSend('Runtime.callFunctionOn', { objectId, returnByValue: true,
        functionDeclaration: `function(operation, args) {
          if (!this.isConnected || this.nodeType !== 1) throw new Error('Selected element is no longer connected');
          if (operation === 'checked') return {checked:this.checked};
          if (operation === 'selectAll') {
            this.focus();
            if (typeof this.select === 'function' && !['file','hidden'].includes(this.type)) this.select();
            else if (this.isContentEditable) { const range = document.createRange(); range.selectNodeContents(this); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); }
            else throw new Error('Selected element is not an editable text control');
            return {selected:true};
          }
          if (operation === 'patch') {
            if (args.text !== undefined) { if (typeof args.text !== 'string' || this.children.length) throw new Error('Text adjustment requires a leaf text element'); this.textContent = args.text; }
            for (const item of args.declarations ?? []) {
              if (typeof item.property !== 'string' || !/^(--[\\w-]+|[a-zA-Z][a-zA-Z-]*)$/.test(item.property) || typeof item.value !== 'string' || !['','important'].includes(item.priority || '') || item.value && !CSS.supports(item.property, item.value)) throw new Error('Invalid CSS declaration');
              this.style.setProperty(item.property, item.value, item.priority || '');
            }
          }
          const box = this.getBoundingClientRect();
          return { tagName: this.tagName.toLowerCase(), text: (this.textContent || '').slice(0,8000), attributes: Object.fromEntries([...this.attributes].map(item => [item.name,item.value])), inlineStyle: this.getAttribute('style') || '', rect: {x:box.x,y:box.y,width:box.width,height:box.height}, url: location.href };
        }`, arguments: [{ value: operation }, { value: args }] })
      const detail = value(result)
      if (!detail || typeof detail !== 'object') throw new Error('DOM operation returned no result')
      live()
      return { ...detail, elementId }
    } catch (error) {
      const failure = error as Error & {code?:string;details?:Record<string,unknown>}
      const code = /^(STALE_ELEMENT|STALE_OBSERVATION|FRAME_NOT_FOUND|FRAME_DETACHED):/u.exec(failure.message)?.[1]
      if (code) failure.code ??= code
      failure.details = {...failure.details,inputDispatched:context.inputDispatched || failure.details?.inputDispatched === true}
      throw error
    } finally {
      try {
        if (objectId && !signal.aborted && !context.fence.interrupted && !dialogs.pending() && !guest.isDestroyed() && !current.rendererExited && !guest.isCrashed() && guest.debugger.isAttached()) await releaseSend('Runtime.releaseObject', { objectId })
      } finally {
        current.debuggerUsers--
        if (!current.debuggerUsers && current.ownsDebugger && !current.inputActive && !current.frameRouter) {
          current.ownsDebugger = false
          if (!guest.isDestroyed() && guest.debugger.isAttached()) guest.debugger.detach()
        }
      }
    }
    }
    try { return await operations.run(context, () => context.guard(() => context.fence.guard(execute))) }
    catch (error) {
      const failure = error as Error & {details?:Record<string,unknown>}
      failure.details = { ...failure.details, inputDispatched: context.inputDispatched || failure.details?.inputDispatched === true }
      throw error
    } finally { removeAbort(); context.fence.close() }
  })
  if (operation === 'capture') {
    const capture = work.finally(() => { if (current.capture === capture) delete current.capture })
    current.capture = capture
    return capture
  }
  if (siteInvocation) void work.then(() => { siteInvocation.finish() }, error => {
    siteInvocation.finish(error?.code === 'SITE_TOOL_CANCEL_FAILED' ? error : undefined)
  })
  if (operation === 'inputMonitor') current.monitorPending = work.catch(() => undefined)
  else current.pending = work.catch(() => undefined)
  if (operation === 'releaseInput') {
    const release = work.finally(() => { if (current.release === release) delete current.release })
    current.release = release
    return release
  }
  return work
}
