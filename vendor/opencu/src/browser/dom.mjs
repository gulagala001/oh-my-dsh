import {fail, finite} from '../protocol.mjs';
import {elementFor} from './observation.mjs';
import {hitTestViewport, withCDPFrameGuard} from '../../extension/frame-router.js';

export async function callElement(record, request, operation, payload = {}, options = {}) {
  const entry = elementFor(record, request);
  const router = withCDPFrameGuard(record.frameRouter,options.wrapSend,options.guard);
  const route = router?.route(entry.route) ?? entry.route;
  const send = route?.send ?? (options.wrapSend ?? (send=>send))((method, args) => record.session.send(method, args));
  if (route) await router.validate(route);
  let objectId;
  try {
    ({object: {objectId}} = await send('DOM.resolveNode', {backendNodeId: entry.backendNodeId, ...(entry.route ? {executionContextId:entry.route.contextId} : {})}));
    const result = await send('Runtime.callFunctionOn', {
      objectId, returnByValue: true,
      functionDeclaration: `function(operation, payload) {
        if (!this.isConnected || this.nodeType !== 1) throw new Error('Selected element is no longer connected');
        if (operation === 'checked') return this.checked;
        if (operation === 'patch') {
          const declarations = payload.declarations || [];
          for (const item of declarations) {
            if (!item || typeof item.property !== 'string' || !/^(--[\\w-]+|[a-zA-Z][a-zA-Z-]*)$/.test(item.property) || typeof item.value !== 'string' || !['', 'important'].includes(item.priority || '')) throw new Error('Invalid CSS declaration');
            if (item.value && !CSS.supports(item.property, item.value)) throw new Error('Unsupported CSS declaration: ' + item.property);
          }
          if (payload.text !== undefined) {
            if (typeof payload.text !== 'string') throw new Error('Text must be a string');
            if (this.children.length || ['INPUT', 'TEXTAREA', 'SELECT', 'SCRIPT', 'STYLE'].includes(this.tagName)) throw new Error('Text adjustment requires a leaf text element; use fill for form controls');
          }
          const previous = {text: this.textContent, declarations: declarations.map(item => ({property: item.property, value: this.style.getPropertyValue(item.property), priority: this.style.getPropertyPriority(item.property)}))};
          for (const item of declarations) {
            if (item.value === '') this.style.removeProperty(item.property);
            else this.style.setProperty(item.property, item.value, item.priority || '');
          }
          if (payload.text !== undefined) this.textContent = payload.text;
          return {changed: true, previous, text: this.textContent, inlineStyle: this.getAttribute('style') || '', limitation: 'Live DOM preview only; not a source-file edit and may be reset by the website'};
        }
        const box = this.getBoundingClientRect(), computed = getComputedStyle(this);
        const properties = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'display', 'position', 'width', 'height', 'padding', 'margin', 'border-radius', 'opacity'];
        const attributes = Object.fromEntries([...this.attributes].map(item => [item.name, item.value]));
        const rect = {x: box.x, y: box.y, width: box.width, height: box.height};
        return {kind: 'element', tag: this.tagName.toLowerCase(), tagName: this.tagName.toLowerCase(), name: this.getAttribute('aria-label') || this.getAttribute('title') || (this.textContent || '').trim().slice(0, 500), text: (this.textContent || '').slice(0, 8000), rect, bounds: rect, attributes, inlineStyle: this.getAttribute('style') || '', computedStyle: Object.fromEntries(properties.map(key => [key, computed.getPropertyValue(key)])), editableText: this.children.length === 0 && !['INPUT', 'TEXTAREA', 'SELECT', 'SCRIPT', 'STYLE'].includes(this.tagName), url: location.href};
      }`,
      arguments: [{value: operation}, {value: payload}],
    });
    if (result.exceptionDetails) fail(operation === 'patch' ? 'DOM_CHANGE_FAILED' : 'STALE_ELEMENT', result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    if (operation === 'checked') return result.result.value;
    return {...result.result.value, elementId: request.elementId, runtimeElementId: request.elementId, observationId: entry.observationId};
  } catch (error) {
    if (error.code) throw error;
    fail('STALE_ELEMENT', 'Selected DOM element is unavailable; observe or hitTest again', {cause: error.message});
  } finally { if (objectId) await send('Runtime.releaseObject', {objectId}).catch(() => {}); }
}

export async function verifyScreenshot(record, request, screenshot = record.screenshot) {
  if (!screenshot || record.screenshot !== screenshot || (request.screenshotId ?? request.observationId ?? screenshot.observationId) !== screenshot.observationId || screenshot.url !== record.page.url()) fail('STALE_SCREENSHOT', 'Use coordinates from the latest screenshot of this document');
  if (screenshot.fullPage) fail('UNSUPPORTED_COORDINATE_SPACE', 'Full-page screenshot input is unsupported; observe the viewport');
  const viewport = await record.page.evaluate(() => ({width: innerWidth, height: innerHeight, scrollX, scrollY}));
  if (record.screenshot !== screenshot || screenshot.url !== record.page.url()) fail('STALE_SCREENSHOT', 'The screenshot document changed; observe again');
  if (['width', 'height', 'scrollX', 'scrollY'].some(key => viewport[key] !== screenshot.viewport[key])) fail('STALE_SCREENSHOT', 'Viewport or scroll changed; observe again');
  return viewport;
}

export async function screenshotPoint(record, request) {
  const x = finite(request.x, 'x'), y = finite(request.y, 'y');
  if (!['screenshot', 'screenshot-pixels', 'physical-screenshot-pixels'].includes(request.coordinateSpace)) return {x, y};
  const screenshot = record.screenshot;
  const viewport = await verifyScreenshot(record, request, screenshot);
  const width = request.previewWidth ?? screenshot.width, height = request.previewHeight ?? screenshot.height;
  if (!(width > 0 && height > 0) || x < 0 || y < 0 || x >= width || y >= height) fail('INVALID_COORDINATES', 'Point is outside the displayed screenshot');
  return {x: x * viewport.width / width, y: y * viewport.height / height};
}

export async function hitTest(record, request, options = {}) {
  const {x, y} = await screenshotPoint(record, request);
  const viewport = await record.page.evaluate(() => ({width: innerWidth, height: innerHeight}));
  if (x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) fail('INVALID_COORDINATES', 'Hit-test point is outside the viewport');
  const router = withCDPFrameGuard(record.frameRouter,options.wrapSend,options.guard);
  const main = record.frameRouter?.main ? await router.main() : undefined;
  const send = (options.wrapSend ?? (send=>send))((method, args) => record.session.send(method, args));
  const hit = await hitTestViewport(send, {x, y});
  // The hit was produced by the root CDP session. A child target can reuse the
  // same backend number for an unrelated control, so its handle is ineligible.
  const rootHit = main && (!hit.frameId || hit.frameId === main.frameId);
  let elementId = [...record.elements].find(([, entry]) => entry.backendNodeId === hit.backendNodeId &&
    (!entry.route || rootHit && !entry.route.sessionId && entry.route.frameId === main.frameId && entry.route.documentId === main.documentId))?.[0];
  options.check?.();
  if (!elementId) {
    elementId = ++record.nextElementId;
    record.elements.set(elementId, {backendNodeId: hit.backendNodeId,...(rootHit ? {route:router.original(main)} : {}), observationId: record.observationId});
  }
  return callElement(record, {elementId}, 'describe',{},options);
}

export async function patchDOM(record, request, options = {}) {
  if (request.annotationControlChanges?.length) fail('UNSUPPORTED_ACTION', 'Website-provided annotation callbacks are not implemented; no DOM changes were made');
  const declarations = request.declarations ?? (request.styles && typeof request.styles === 'object' && !Array.isArray(request.styles)
    ? Object.entries(request.styles).map(([property, value]) => ({property, value})) : []);
  if (!Array.isArray(declarations) || declarations.length > 100) fail('INVALID_ARGUMENT', 'Provide at most 100 CSS declarations');
  if (request.text === undefined && !declarations.length) fail('INVALID_ARGUMENT', 'A text change or CSS declarations are required');
  if (request.text !== undefined && (typeof request.text !== 'string' || request.text.length > 100000)) fail('INVALID_ARGUMENT', 'text must be a string of at most 100000 characters');
  return callElement(record, request, 'patch', {declarations, ...(request.text === undefined ? {} : {text: request.text})},options);
}
