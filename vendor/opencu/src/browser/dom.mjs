import {fail, finite} from '../protocol.mjs';
import {elementFor} from './observation.mjs';
import {hitTestViewport} from '../../extension/frame-router.js';

export async function callElement(record, request, operation, payload = {}) {
  const entry = elementFor(record, request);
  const send = entry.route?.send ?? ((method, args) => record.session.send(method, args));
  if (entry.route) await record.frameRouter.validate(entry.route);
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

export async function screenshotPoint(record, request) {
  const x = finite(request.x, 'x'), y = finite(request.y, 'y');
  if (!['screenshot', 'screenshot-pixels', 'physical-screenshot-pixels'].includes(request.coordinateSpace)) return {x, y};
  const screenshot = record.screenshot;
  if (!screenshot || (request.screenshotId ?? request.observationId ?? screenshot.observationId) !== screenshot.observationId || screenshot.url !== record.page.url()) fail('STALE_SCREENSHOT', 'Use coordinates from the latest screenshot of this document');
  if (screenshot.fullPage) fail('UNSUPPORTED_COORDINATE_SPACE', 'Full-page screenshot input is unsupported; observe the viewport');
  const viewport = await record.page.evaluate(() => ({width: innerWidth, height: innerHeight, scrollX, scrollY}));
  if (['width', 'height', 'scrollX', 'scrollY'].some(key => viewport[key] !== screenshot.viewport[key])) fail('STALE_SCREENSHOT', 'Viewport or scroll changed; observe again');
  const width = request.previewWidth ?? screenshot.width, height = request.previewHeight ?? screenshot.height;
  if (!(width > 0 && height > 0) || x < 0 || y < 0 || x >= width || y >= height) fail('INVALID_COORDINATES', 'Point is outside the displayed screenshot');
  return {x: x * viewport.width / width, y: y * viewport.height / height};
}

export async function hitTest(record, request) {
  const {x, y} = await screenshotPoint(record, request);
  const viewport = await record.page.evaluate(() => ({width: innerWidth, height: innerHeight}));
  if (x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) fail('INVALID_COORDINATES', 'Hit-test point is outside the viewport');
  const hit = await hitTestViewport((method, args) => record.session.send(method, args), {x, y});
  let elementId = [...record.elements].find(([, entry]) => entry.backendNodeId === hit.backendNodeId)?.[0];
  if (!elementId) {
    elementId = ++record.nextElementId;
    record.elements.set(elementId, {backendNodeId: hit.backendNodeId, observationId: record.observationId});
  }
  return callElement(record, {elementId}, 'describe');
}

export async function patchDOM(record, request) {
  if (request.annotationControlChanges?.length) fail('UNSUPPORTED_ACTION', 'Website-provided annotation callbacks are not implemented; no DOM changes were made');
  const declarations = request.declarations ?? (request.styles && typeof request.styles === 'object' && !Array.isArray(request.styles)
    ? Object.entries(request.styles).map(([property, value]) => ({property, value})) : []);
  if (!Array.isArray(declarations) || declarations.length > 100) fail('INVALID_ARGUMENT', 'Provide at most 100 CSS declarations');
  if (request.text === undefined && !declarations.length) fail('INVALID_ARGUMENT', 'A text change or CSS declarations are required');
  if (request.text !== undefined && (typeof request.text !== 'string' || request.text.length > 100000)) fail('INVALID_ARGUMENT', 'text must be a string of at most 100000 characters');
  return callElement(record, request, 'patch', {declarations, ...(request.text === undefined ? {} : {text: request.text})});
}
