import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fail, checkSignal} from '../protocol.mjs';
import {captureAXTree, axElementKey} from '../../extension/ax-tree.js';

export async function observePage(record, request, options) {
  checkSignal(request.signal);
  const format = request.format ?? 'both';
  if (!['ax', 'screenshot', 'both'].includes(format)) fail('INVALID_ARGUMENT', 'format must be ax, screenshot, or both');
  const generation = record.documentGeneration;
  const observationId = randomUUID();
  const result = {observationId, url: record.page.url(), title: await record.page.title(), coordinateSpace: 'viewport-css-pixels'};
  let captured, nextElements, nextElementId = record.nextElementId ?? 0;
  const check = () => {
    checkSignal(request.signal);
    if (generation !== record.documentGeneration) fail('STALE_OBSERVATION', 'Document changed during observation');
  };
  checkSignal(request.signal);
  if (format !== 'screenshot') {
    captured = await captureAXTree((method, params) => record.session.send(method, params),record.frameRouter,check);
    const previous = new Map([...record.elements].map(([id, entry]) => [axElementKey(entry.backendNodeId,entry.route),id]));
    nextElements = new Map();
    const elements = captured.nodes.map(({node,route,key}) => {
      const elementId = node.backendDOMNodeId ? previous.get(key) ?? ++nextElementId : undefined;
      if (elementId) nextElements.set(elementId, {backendNodeId: node.backendDOMNodeId, route, observationId});
      return {
        ...(elementId ? {elementId} : {}), nodeId: node.nodeId,
        role: node.role?.value ?? '', name: node.name?.value ?? '',
        ...(node.value ? {value: node.value.value} : {}),
        properties: Object.fromEntries((node.properties ?? []).map(property => [property.name, property.value.value ?? property.value.relatedNodes?.map(node => node.text ?? node.idref) ?? null])),
        children: node.childIds ?? [],
      };
    });
    result.ax = {nodes: elements, source: 'chromium-accessibility-tree', stableIds: true, identityScope: `${record.id}:${generation}`};
    result.text = elements.map(node => `${node.elementId ? `[${node.elementId}] ` : ''}${node.role}${node.name ? ` ${JSON.stringify(node.name)}` : ''}${node.value !== undefined ? ` value=${JSON.stringify(node.value)}` : ''}`).join('\n');
  }
  if (format !== 'ax') {
    const fullPage = request.fullPage === true;
    const viewportBefore = await record.page.evaluate(() => ({width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio, scrollX, scrollY}));
    checkSignal(request.signal);
    const bytes = await record.page.screenshot({type: 'png', fullPage, animations: 'disabled', timeout: options.timeoutMs});
    checkSignal(request.signal);
    const sharp = options.sharp ?? (await import('sharp')).default;
    const original = await sharp(bytes).metadata();
    let output = bytes;
    if (request.maxWidth || request.maxHeight) {
      for (const key of ['maxWidth', 'maxHeight']) {
        if (request[key] !== undefined && (!Number.isInteger(request[key]) || request[key] <= 0)) fail('INVALID_ARGUMENT', `${key} must be a positive integer`);
      }
      output = await sharp(bytes).resize({width: request.maxWidth, height: request.maxHeight, fit: 'inside', withoutEnlargement: true}).png().toBuffer();
    }
    const metadata = await sharp(output).metadata();
    const viewport = await record.page.evaluate(() => ({width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio, scrollX, scrollY}));
    checkSignal(request.signal);
    if (['width', 'height', 'deviceScaleFactor', 'scrollX', 'scrollY'].some(key => viewport[key] !== viewportBefore[key])) fail('STALE_OBSERVATION', 'Viewport or scroll changed during screenshot capture; observe again');
    const directory = join(options.dataDir, 'observations');
    await mkdir(directory, {recursive: true});
    const path = join(directory, `${observationId}.png`);
    await writeFile(path, output, {mode: 0o600});
    result.screenshot = {
      path, mediaType: 'image/png', width: metadata.width, height: metadata.height,
      originalWidth: original.width, originalHeight: original.height, viewport, fullPage,
      pixelsPerCssPixel: {x: metadata.width / (original.width / viewport.deviceScaleFactor), y: metadata.height / (original.height / viewport.deviceScaleFactor)},
      ...(request.includeBase64 ? {base64: output.toString('base64')} : {}),
    };
  }
  await captured?.validate();
  check();
  if (nextElements) {record.elements = nextElements; record.nextElementId = nextElementId;}
  record.observationId = observationId;
  if (result.screenshot) {
    const {base64, ...mapping} = result.screenshot;
    record.screenshot = {...mapping, observationId, url: result.url};
  }
  return result;
}

export function elementFor(record, request) {
  const entry = record.elements.get(request.elementId);
  if (!entry || (request.observationId && entry.observationId !== request.observationId)) {
    fail('STALE_ELEMENT', 'Element is not from the latest AX observation; observe again');
  }
  return entry;
}

export async function elementPoint(record, request, router = record.frameRouter, send = (method,params)=>record.session.send(method,params)) {
  const entry = elementFor(record, request);
  if (entry.route) return router.point(entry);
  try {
    const {object} = await send('DOM.resolveNode', {backendNodeId: entry.backendNodeId});
    try {
      const result = await send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: 'async function() { let previous; let stable = 0; for (let frame = 0; frame < 120; frame++) { this.scrollIntoView({behavior:"instant",block:"center",inline:"center"}); await new Promise(requestAnimationFrame); const box = this.getBoundingClientRect(); const current = [box.x,box.y,box.width,box.height]; if (previous && current.every((value,index) => Math.abs(value-previous[index]) < 0.5) && box.bottom > 0 && box.top < innerHeight) stable++; else stable = 0; if (stable >= 3) return; previous = current; } throw new Error("Element layout is moving"); }',
        awaitPromise: true,
      });
      if (result.exceptionDetails) throw new Error('Element cannot be scrolled into view');
    } finally { await send('Runtime.releaseObject', {objectId: object.objectId}); }
    const {model} = await send('DOM.getBoxModel', {backendNodeId: entry.backendNodeId});
    const quad = model.content;
    return {x: (quad[0] + quad[2] + quad[4] + quad[6]) / 4, y: (quad[1] + quad[3] + quad[5] + quad[7]) / 4};
  } catch { fail('STALE_ELEMENT', 'Element no longer has an actionable box; observe again'); }
}

export async function focusElement(record, request, router = record.frameRouter) {
  const entry = elementFor(record, request);
  if (entry.route) return router.focus(entry);
  try {
    await record.session.send('DOM.focus', {backendNodeId: entry.backendNodeId});
  } catch { fail('STALE_ELEMENT', 'Element can no longer receive focus; observe again'); }
}
