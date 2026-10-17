import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { nativeImage, type NavigationEntry, type WebContents } from 'electron'
import { inspectSiteTools, beginSiteTool, invokeSiteTool, cancelSiteTool } from './opencu-site-tools.ts'
import { readPageImage } from './opencu-page-image.ts'
import { runCDPLocator } from './opencu-cdp-locator.js'
import { keyEventParameters } from './opencu-keyboard.js'
import { createCDPFrameRouter, hitTestViewport, type CDPFrameRouter, type FrameElement } from './opencu-frame-router.js'

type AXValue = { value?: string | number | boolean; relatedNodes?: { text?: string; idref?: string }[] }
type AXNode = { nodeId: string; backendDOMNodeId?: number; ignored?: boolean; role?: AXValue; name?: AXValue; value?: AXValue; properties?: { name: string; value: AXValue }[]; childIds?: string[] }
type RemoteResult = { result: { value?: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } }
interface ObservationState {
  elements: Map<string, FrameElement>
  frameRouter?: CDPFrameRouter
  pending: Promise<unknown>
  capture?: Promise<unknown>
  debuggerUsers: number
  ownsDebugger: boolean
  inputActive?: boolean
  inputKeys: Map<string, ReturnType<typeof inputKey>>
  inputButtons: Set<string>
  inputPosition: { x: number; y: number }
  uploadGeneration: number
  documentGeneration: number
  identityScope: string
  observationId?: string
  rendererExited?: boolean
}
const states = new WeakMap<WebContents, ObservationState>()
const guestExited = (): Error => Object.assign(new Error('The browser page process exited; reload the page before observing or sending input'), { code: 'BROWSER_GUEST_CRASHED', details: { inputDispatched: false } })
const metadata = `(() => { const state = globalThis.__opencuDocument ??= { id: crypto.randomUUID(), next: 0, elements: new Map() }; return { documentId: state.id, url: location.href, title: document.title, viewport: { width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio, scrollX, scrollY } }; })()`

function inputKey(value: unknown): { key: string; code: string; windowsVirtualKeyCode: number } {
  if (typeof value !== 'string' || !value) throw new Error('Input requires a key name')
  const aliases: Record<string, string> = { ctrl: 'Control', control: 'Control', alt: 'Alt', option: 'Alt', shift: 'Shift', meta: 'Meta', cmd: 'Meta', command: 'Meta', enter: 'Enter', return: 'Enter', esc: 'Escape', escape: 'Escape', tab: 'Tab', space: ' ', backspace: 'Backspace', delete: 'Delete', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
  const key = aliases[value.toLowerCase()] ?? value
  const named: Record<string, [string, number]> = { Control: ['ControlLeft', 17], Alt: ['AltLeft', 18], Shift: ['ShiftLeft', 16], Meta: ['MetaLeft', 91], Enter: ['Enter', 13], Escape: ['Escape', 27], Tab: ['Tab', 9], ' ': ['Space', 32], Backspace: ['Backspace', 8], Delete: ['Delete', 46], Insert: ['Insert', 45], ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40], Home: ['Home', 36], End: ['End', 35], PageUp: ['PageUp', 33], PageDown: ['PageDown', 34], '+': ['Equal', 187], '=': ['Equal', 187], '-': ['Minus', 189] }
  const spec = named[key] ?? (/^[a-z]$/i.test(key) ? [`Key${key.toUpperCase()}`, key.toUpperCase().charCodeAt(0)] as [string, number] : /^\d$/.test(key) ? [`Digit${key}`, key.charCodeAt(0)] as [string, number] : /^F([1-9]|1\d|2[0-4])$/.test(key) ? [key, 111 + Number(key.slice(1))] as [string, number] : undefined)
  if (!spec) throw Object.assign(new Error('Use a supported named key; insertText handles Unicode'), { code: 'UNSUPPORTED_KEY' })
  return { key, code: spec[0], windowsVirtualKeyCode: spec[1] }
}

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
  if (typeof operation !== 'string' || !['observe', 'locator', 'domSnapshot', 'checked', 'point', 'verifyElement', 'focus', 'selectAll', 'selectOption', 'describe', 'patch', 'hitTest', 'upload', 'navigationSnapshot', 'restoreNavigation', 'siteTools', 'invokeSiteTool', 'cancelSiteTool', 'cancelUpload', 'capture', 'readPageImage', 'input', 'insertText', 'releaseInput'].includes(operation)) throw new Error('Unsupported guest automation operation')
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid guest automation arguments')
  const args = input as Record<string, unknown>
  if (operation === 'cancelSiteTool') return cancelSiteTool(guest, typeof args.requestId === 'string' ? args.requestId : undefined)
  if (operation === 'cancelUpload') {
    cancelOpenCUUpload(guest)
    return Promise.resolve({ cancelled: true })
  }
  let state = states.get(guest)
  if (!state) {
    state = { elements: new Map(), pending: Promise.resolve(), debuggerUsers: 0, ownsDebugger: false, uploadGeneration: 0, documentGeneration: 0, identityScope: randomUUID(),
      inputKeys: new Map(), inputButtons: new Set(), inputPosition: { x: 0, y: 0 } }
    states.set(guest, state)
    const tracked = state
    const invalidate = (): void => { tracked.documentGeneration++; tracked.identityScope = randomUUID(); tracked.elements.clear(); delete tracked.observationId }
    guest.on('render-process-gone', () => {
      invalidate(); tracked.rendererExited = true; tracked.uploadGeneration++
      tracked.inputKeys.clear(); tracked.inputButtons.clear(); tracked.inputActive = false
      const router = tracked.frameRouter; delete tracked.frameRouter
      void router?.close().catch(() => {}) // The exited process already owns no frame sessions.
    })
    guest.on('dom-ready', () => { tracked.rendererExited = false })
    guest.on('did-navigate', () => { tracked.rendererExited = false; invalidate() })
    guest.on('did-navigate-in-page', invalidate)
  }
  const current = state, uploadGeneration = state.uploadGeneration, documentGeneration = state.documentGeneration
  if (current.rendererExited || guest.isCrashed()) {
    if (operation === 'releaseInput') {
      current.inputKeys.clear(); current.inputButtons.clear(); current.inputActive = false
      return Promise.resolve({ released: true })
    }
    return Promise.reject(guestExited())
  }
  const siteInvocation = operation === 'invokeSiteTool' ? beginSiteTool(guest, args.requestId) : undefined
  if (operation === 'capture' && current.capture) return current.capture
  const work = (operation === 'capture' ? Promise.resolve() : current.pending).then(async () => {
    siteInvocation?.controller.signal.throwIfAborted()
    if (guest.isDestroyed()) throw new Error('The browser guest is closed')
    if (current.rendererExited || guest.isCrashed()) throw guestExited()
    if (current.documentGeneration !== documentGeneration && operation !== 'releaseInput') throw Object.assign(new Error('STALE_ELEMENT: the queued document changed'), { code: 'STALE_ELEMENT', details: { inputDispatched: false } })
    if (operation === 'verifyElement') {
      if (typeof args.elementId !== 'string' || !current.elements.has(args.elementId)) throw Object.assign(new Error('STALE_ELEMENT: observe the current document again'), {code:'STALE_ELEMENT',details:{inputDispatched:false}})
      if (args.observationId !== undefined && args.observationId !== current.observationId) throw Object.assign(new Error('STALE_ELEMENT: element observation has expired'), {code:'STALE_ELEMENT',details:{inputDispatched:false}})
      const entry = current.elements.get(String(args.elementId))
      if (entry?.route) await current.frameRouter!.validate(entry.route)
      return { valid: true }
    }
    if (operation === 'navigationSnapshot') {
      return { entries: guest.navigationHistory.getAllEntries(), index: guest.navigationHistory.getActiveIndex() }
    }
    if (operation === 'restoreNavigation') {
      await guest.navigationHistory.restore(resolveOpenCUNavigation(args, allowedNavigation))
      current.elements.clear()
      return { restored: true, url: guest.getURL(), index: guest.navigationHistory.getActiveIndex() }
    }
    if (!guest.debugger.isAttached()) {
      guest.debugger.attach('1.3')
      current.ownsDebugger = true
    }
    current.debuggerUsers++
    let inputDispatched = false
    const send = (method: string, params: object = {}): Promise<any> => {
      if (current.rendererExited || guest.isCrashed()) return Promise.reject(guestExited())
      return new Promise((resolve, reject) => {
        const gone = (): void => { finish(); reject(guestExited()) }
        const finish = (): void => { guest.off('render-process-gone', gone) }
        guest.once('render-process-gone', gone)
        if (method.startsWith('Input.') || method === 'DOM.setFileInputFiles') inputDispatched = true
        try { void guest.debugger.sendCommand(method, params).then(value => { finish(); resolve(value) }, error => { finish(); reject(error) }) }
        catch (error) { finish(); reject(error) }
      })
    } // CDP replies vary by method; validate at their consumers below.
    let releaseSend = send
    let objectId: string | undefined
    try {
      if (operation === 'input' || operation === 'insertText') {
        current.inputActive = true
        const generation = current.documentGeneration
        // Focus the embedding element, not its BrowserWindow. Chromium otherwise drops
        // keyboard/text CDP events in a nested guest even with focus emulation enabled.
        if (operation === 'insertText' || args.type === 'keyDown') {
          await guest.hostWebContents?.executeJavaScript(`(() => { const view = [...document.querySelectorAll('webview')].find(item => item.getWebContentsId() === ${guest.id}); if (!view) throw new Error('Browser input guest is detached'); if (${operation === 'insertText'} && document.activeElement === view) view.blur(); view.focus(); })()`)
        }
        await send('Emulation.setFocusEmulationEnabled', { enabled: true })
        const releasing = operation === 'input' && (args.type === 'keyUp' || args.type === 'mouseUp')
        if (guest.isDestroyed() || !releasing && (current.documentGeneration !== generation || args.elementId != null && !current.elements.has(String(args.elementId)))) throw new Error('STALE_ELEMENT: document changed before input dispatch')
        const inputElement = args.elementId != null ? current.elements.get(String(args.elementId)) : undefined
        if (!releasing && inputElement?.route) {
          await current.frameRouter!.validate(inputElement.route)
          if (inputElement.route.owners.length && (operation === 'insertText' || args.type === 'keyDown')) await current.frameRouter!.focus(inputElement as FrameElement & {route:NonNullable<FrameElement['route']>})
        }
        if (!releasing && current.documentGeneration !== generation) throw new Error('STALE_ELEMENT: document changed before input dispatch')
        if (operation === 'insertText') {
          if (typeof args.text !== 'string') throw new Error('insertText requires text')
          await send('Input.insertText', { text: args.text })
        } else {
          const modifierNames = Array.isArray(args.modifiers) ? args.modifiers : []
          const modifiers = modifierNames.reduce<number>((bits, name) => bits | ({ alt: 1, control: 2, meta: 4, shift: 8 }[String(name)] ?? 0), 0)
          if (args.type === 'keyDown' || args.type === 'keyUp') {
            const spec = inputKey(args.keyCode), down = args.type === 'keyDown'
            if (down) current.inputKeys.set(spec.key, spec)
            await send('Input.dispatchKeyEvent', keyEventParameters(spec, down, modifiers, process.platform === 'darwin'))
            if (!down) current.inputKeys.delete(spec.key)
          } else {
            const types: Record<string, string> = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased', mouseWheel: 'mouseWheel' }
            const type = types[String(args.type)]
            if (!type || !Number.isFinite(args.x) || !Number.isFinite(args.y)) throw new Error('Input requires a mouse event and finite coordinates')
            if (!['none', 'left', 'middle', 'right'].includes(String(args.button ?? 'none'))) throw new Error('Invalid mouse button')
            current.inputPosition = { x: Number(args.x), y: Number(args.y) }
            if (type === 'mousePressed' && inputElement?.route) await current.frameRouter!.checkPoint(inputElement as FrameElement & {route:NonNullable<FrameElement['route']>}, current.inputPosition)
            if (type === 'mousePressed') current.inputButtons.add(String(args.button))
            await send('Input.dispatchMouseEvent', { type, x: args.x, y: args.y, button: args.button ?? 'none', buttons: args.buttons ?? 0, clickCount: args.clickCount ?? 0, modifiers,
              ...(type === 'mouseWheel' ? { deltaX: args.deltaX ?? 0, deltaY: args.deltaY ?? 0 } : {}) })
            if (type === 'mouseReleased') current.inputButtons.delete(String(args.button))
          }
        }
        return { dispatched: true, delivery: 'target-cdp', effectVerified: false }
      }
      if (operation === 'releaseInput') {
        const errors: unknown[] = []
        for (const [key, spec] of [...current.inputKeys].reverse()) {
          const modifiers = [...current.inputKeys.keys()].filter(name => name !== key).reduce((bits, name) => bits | ({ Alt: 1, Control: 2, Meta: 4, Shift: 8 }[name] ?? 0), 0)
          try { await send('Input.dispatchKeyEvent', keyEventParameters(spec, false, modifiers, process.platform === 'darwin')); current.inputKeys.delete(key) }
          catch (error) { errors.push(error) }
        }
        for (const button of current.inputButtons) {
          const buttons = [...current.inputButtons].filter(name => name !== button).reduce((bits, name) => bits | ({ left: 1, right: 2, middle: 4 }[name] ?? 0), 0)
          try { await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...current.inputPosition, button, buttons, clickCount: 1 }); current.inputButtons.delete(button) }
          catch (error) { errors.push(error) }
        }
        if (errors.length) throw new AggregateError(errors, 'Target CDP input release failed')
        await send('Emulation.setFocusEmulationEnabled', { enabled: false })
        current.inputActive = false
        if (current.frameRouter) {await current.frameRouter.close(); delete current.frameRouter}
        return { released: true }
      }
      if (operation === 'readPageImage') return await readPageImage(guest, send, args)
      if (operation === 'siteTools') return await inspectSiteTools(guest, send)
      if (siteInvocation) return await invokeSiteTool(guest, send, args, siteInvocation.controller.signal)
      if (operation === 'capture') {
        let timer: ReturnType<typeof setTimeout> | undefined
        const screenshot: { data: string } = await Promise.race([
          send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => { reject(new Error('Browser frame capture timed out')) }, 8000)
          }),
        ]).finally(() => { clearTimeout(timer) })
        const image = nativeImage.createFromBuffer(Buffer.from(screenshot.data, 'base64'))
        if (image.isEmpty()) throw new Error('The browser returned an empty screenshot')
        return { dataUrl: image.toDataURL(), ...image.getSize() }
      }
      if (operation === 'locator' || operation === 'domSnapshot') {
        const generation = current.documentGeneration
        const router = current.frameRouter ??= createCDPFrameRouter(send, listener => {
          const receive = (_event: Electron.Event, method: string, params: unknown, sessionId?: string): void => {if (!sessionId) listener(method, params)}
          guest.debugger.on('message', receive)
          return () => {guest.debugger.removeListener('message', receive)}
        })
        const result = await runCDPLocator(send, { ...args, operation }, (backendNodeId, route) => {
          if (generation !== current.documentGeneration) throw new Error('STALE_ELEMENT: document changed while resolving locator')
          const elementId = `${current.identityScope}:${route.frameId}:${route.documentId}:${backendNodeId}`
          current.elements.set(elementId, {backendNodeId,route})
          return elementId
        }, router)
        if (generation !== current.documentGeneration) throw new Error('STALE_ELEMENT: document changed while resolving locator')
        return result
      }
      if (operation === 'observe') {
        const generation = current.documentGeneration
        const live = (): void => {
          if (guest.isDestroyed()) throw new Error('The browser guest is closed')
          if (generation !== current.documentGeneration) throw Object.assign(new Error('STALE_OBSERVATION: the document changed during observation'), { code: 'STALE_OBSERVATION' })
        }
        const details = value(await send('Runtime.evaluate', { expression: metadata, returnByValue: true }))
        if (!details || typeof details !== 'object') throw new Error('Guest metadata is unavailable')
        live()
        const observationId = randomUUID()
        const tree: { nodes: AXNode[] } = await send('Accessibility.getFullAXTree')
        if (!Array.isArray(tree.nodes)) throw new Error('Chromium returned no accessibility tree')
        live()
        current.elements.clear()
        const nodes = tree.nodes.filter(node => !node.ignored).map(node => {
          const elementId = node.backendDOMNodeId ? `${current.identityScope}:${node.backendDOMNodeId}` : undefined
          if (elementId && node.backendDOMNodeId) current.elements.set(elementId, {backendNodeId:node.backendDOMNodeId})
          return { ...(elementId ? { elementId } : {}), nodeId: node.nodeId, role: node.role?.value ?? '', name: node.name?.value ?? '',
            ...(node.value ? { value: node.value.value } : {}), children: node.childIds ?? [],
            properties: Object.fromEntries((node.properties ?? []).map(item => [item.name, item.value.value ?? item.value.relatedNodes?.map(related => related.text ?? related.idref) ?? null])) }
        })
        current.observationId = observationId
        return { ...details, observationId, coordinateSpace: 'viewport-css-pixels', ax: { source: 'chromium-accessibility-tree', nodes, stableIds: true, identityScope: current.identityScope },
          text: nodes.map(node => `${node.elementId ? `[${node.elementId}] ` : ''}${node.role} ${JSON.stringify(node.name)}${node.value !== undefined ? ` value=${JSON.stringify(node.value)}` : ''}`).join('\n') }
      }
      const generation = current.documentGeneration
      const live = (): void => {
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
        elementId = `${randomUUID()}:hit`
        entry = {backendNodeId}
        current.elements.set(elementId, entry)
      } else {entry = elementId ? current.elements.get(elementId) : undefined; backendNodeId = entry?.backendNodeId}
      if (!backendNodeId || args.observationId !== undefined && args.observationId !== current.observationId) throw new Error('STALE_ELEMENT: observe the current document again')
      const elementSend = entry?.route?.send ?? send
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
        if (!Array.isArray(args.files) || !args.files.length || args.files.some(file => typeof file !== 'string' || !isAbsolute(file))) throw new Error('Upload requires absolute file paths')
        const live = (): void => {
          if (guest.isDestroyed()) throw new Error('The browser guest is closed')
          if (current.uploadGeneration !== uploadGeneration) throw Object.assign(new Error('Upload was cancelled'), { code: 'CONTROL_STOPPED' })
          if (!elementId || current.elements.get(elementId)?.backendNodeId !== backendNodeId) throw new Error('STALE_ELEMENT: observe the current document again')
        }
        for (const file of args.files as string[]) {
          live()
          if (!(await stat(file)).isFile()) throw new Error('Upload source must be a regular file')
        }
        live()
        await elementSend('Runtime.evaluate', { expression: "globalThis.__opencuAnnotations?.expectInput([{type:'input'}])" })
        live()
        await elementSend('DOM.setFileInputFiles', { backendNodeId, files: args.files })
        return { action: 'upload', files: args.files }
      }
      const remote: { object: { objectId?: string } } = await elementSend('DOM.resolveNode', { backendNodeId, ...(entry?.route ? {executionContextId:entry.route.contextId} : {}) })
      objectId = remote.object.objectId
      live()
      if (!objectId) throw new Error('STALE_ELEMENT: the DOM node is unavailable')
      if (operation === 'selectOption') inputDispatched = true
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
          if (operation === 'selectOption') {
            if (this.tagName !== 'SELECT') throw new Error('Selected element is not a select');
            const values = args.values ?? (Array.isArray(args.value) ? args.value : [args.value]);
            for (const option of this.options) option.selected = values.includes(option.value);
            this.dispatchEvent(new Event('input', {bubbles:true})); this.dispatchEvent(new Event('change', {bubbles:true}));
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
      failure.details = {...failure.details,inputDispatched:inputDispatched || failure.details?.inputDispatched === true}
      throw error
    } finally {
      try {
        if (objectId && !guest.isDestroyed() && !current.rendererExited && !guest.isCrashed() && guest.debugger.isAttached()) await releaseSend('Runtime.releaseObject', { objectId })
      } finally {
        current.debuggerUsers--
        if (!current.debuggerUsers && current.ownsDebugger && !current.inputActive && !current.frameRouter) {
          current.ownsDebugger = false
          if (!guest.isDestroyed() && guest.debugger.isAttached()) guest.debugger.detach()
        }
      }
    }
  })
  if (operation === 'capture') {
    const capture = work.finally(() => { if (current.capture === capture) delete current.capture })
    current.capture = capture
    return capture
  }
  if (siteInvocation) void work.then(() => { siteInvocation.finish() }, error => {
    siteInvocation.finish(error?.code === 'SITE_TOOL_CANCEL_FAILED' ? error : undefined)
  })
  current.pending = work.catch(() => undefined)
  return work
}
