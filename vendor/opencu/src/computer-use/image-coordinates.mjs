import { AsyncLocalStorage } from 'node:async_hooks';
import { isDeepStrictEqual } from 'node:util';
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { point, positivePixels } from './coordinates.mjs';

const targetKey = target => JSON.stringify([target.kind, target.browserId, target.id]);
export const imageFrameFor = (frames, target) => frames?.get(targetKey(target));
const staleFrame = message => Object.assign(new Error(message), { code: 'STALE_SCREENSHOT' });
const sameCapture = (a, b) => a.width === b.width && a.height === b.height && isDeepStrictEqual(a.geometry, b.geometry);

// Observe the host's exact request image, rather than copying a provider's
// private pixel-budget policy. Only genuine, emitted CU screenshots are tracked.
export class ImageCoordinates {
  constructor() { this.images = new Map(); this.requests = new Map(); this.scope = new AsyncLocalStorage(); }
  remember(sessionId, capture, attachment) {
    if (!capture?.target || typeof attachment?.attachmentId !== 'string') return;
    let images = this.images.get(sessionId);
    if (!images) this.images.set(sessionId, images = new Map());
    const key = targetKey(capture.target);
    let captures = images.get(key);
    if (!captures) images.set(key, captures = new Map());
    const previous = captures.get(attachment.attachmentId);
    const image = structuredClone(capture);
    // Attachments are content-addressed. Equal pixels from different document
    // geometries cannot reveal which observation an older message refers to.
    captures.set(attachment.attachmentId, { ...image, attachmentId: attachment.attachmentId, ambiguous: previous?.ambiguous === true || !!previous && !sameCapture(previous, image) });
  }
  observe(ref, version, request = this.scope.getStore(), order) {
    if (!request || this.requests.get(request.sessionId) !== request) return;
    order ??= ++request.sequence;
    for (const [key, captures] of this.images.get(request.sessionId) ?? []) {
      const image = captures.get(ref?.attachmentId);
      if (!image || (request.orders.get(key) ?? -1) > order) continue;
      request.orders.set(key, order);
      request.frames.set(key, { ...image, previewWidth: version?.width, previewHeight: version?.height, ...(version?.variantId ? { variantId: version.variantId } : {}) });
    }
  }
  frames(sessionId) { return new Map(this.requests.get(sessionId)?.frames); }
  clear(sessionId) { this.images.delete(sessionId); this.requests.delete(sessionId); }
  async *stream(sessionId, next) {
    const request = { sessionId, frames: new Map(), orders: new Map(), sequence: 0 }; this.requests.set(sessionId, request);
    const iterator = this.scope.run(request, () => next()[Symbol.asyncIterator]());
    let done = false;
    try {
      while (true) {
        const item = await this.scope.run(request, () => iterator.next());
        if (item.done) { done = true; return; }
        yield item.value;
      }
    } finally { if (!done) await this.scope.run(request, () => iterator.return?.()); }
  }
  // DSH currently exposes request projection as a service method, without a
  // projection event. This transparent observer preserves its receiver, policy,
  // bytes and errors, and is removed together with the attachment service scope.
  watch(attachments) {
    const original = attachments.readImageRequest, descriptor = Object.getOwnPropertyDescriptor(attachments, 'readImageRequest');
    const coordinates = this; let active = true;
    const read = async function (...args) {
      const request = coordinates.scope.getStore(), order = request ? ++request.sequence : undefined;
      const version = await original.apply(this, args);
      if (active) coordinates.observe(args[0], version, request, order); return version;
    };
    Object.defineProperty(attachments, 'readImageRequest', { value: read, configurable: true, writable: true });
    return () => {
      active = false;
      if (Object.getOwnPropertyDescriptor(attachments, 'readImageRequest')?.value !== read) return;
      if (descriptor) Object.defineProperty(attachments, 'readImageRequest', descriptor);
      else delete attachments.readImageRequest;
    };
  }
}

export function mapImagePoints(frames, target, operation, parameters) {
  const frame = imageFrameFor(frames, target);
  if (!frame || !['click', 'drag', 'scroll'].includes(operation)) return parameters;
  if (operation !== 'drag' && typeof parameters[0] === 'number') return parameters;
  if (frame.ambiguous) throw staleFrame('Identical screenshot pixels belong to different observations. Use the current accessibility state or a new screenshot before using point coordinates.');
  let width, height, previewWidth, previewHeight;
  try { [width, height, previewWidth, previewHeight] = [frame.width, frame.height, frame.previewWidth, frame.previewHeight].map(positivePixels); }
  catch { throw staleFrame('The model screenshot dimensions are unavailable or invalid. Capture a fresh screenshot before using point coordinates.'); }
  const convert = value => {
    const p = point(value);
    return { x: p.x * width / previewWidth, y: p.y * height / previewHeight };
  };
  if (operation === 'drag') return [convert(parameters[0]), convert(parameters[1]), ...parameters.slice(2)];
  return [convert(parameters[0]), ...parameters.slice(1)];
}

export function mountImageCoordinates(ctx, coordinates) {
  ctx.inject(['attachments'], image => { image.effect(() => coordinates.watch(image.attachments)); });
  ctx.on('llm/stream', (options, next) => {
    if (!isAgentLoopRequest(options) || !coordinates.images.has(options.sessionId)) return next();
    return coordinates.stream(options.sessionId, next);
  }, { global: true });
}
