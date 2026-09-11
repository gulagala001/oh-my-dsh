import { AsyncLocalStorage } from 'node:async_hooks';
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { point } from './coordinates.mjs';

const targetKey = target => JSON.stringify([target.kind, target.browserId, target.id]);
export const imageFrameFor = (frames, target) => frames?.get(targetKey(target));

// Observe the host's exact request image, rather than copying a provider's
// private pixel-budget policy. Only genuine, emitted CU screenshots are tracked.
export class ImageCoordinates {
  constructor() { this.images = new Map(); this.requests = new Map(); this.scope = new AsyncLocalStorage(); }
  remember(sessionId, capture, attachment) {
    if (!capture) return;
    let images = this.images.get(sessionId);
    if (!images) this.images.set(sessionId, images = new Map());
    images.set(targetKey(capture.target), { ...capture, attachmentId: attachment.attachmentId });
  }
  observe(ref, version) {
    const request = this.scope.getStore();
    if (!request || this.requests.get(request.sessionId) !== request) return;
    for (const [key, image] of this.images.get(request.sessionId) ?? []) if (image.attachmentId === ref.attachmentId) {
      request.frames.set(key, { ...image, previewWidth: version.width, previewHeight: version.height });
    }
  }
  frames(sessionId) { return new Map(this.requests.get(sessionId)?.frames); }
  clear(sessionId) { this.images.delete(sessionId); this.requests.delete(sessionId); }
  async *stream(sessionId, next) {
    const request = { sessionId, frames: new Map() }; this.requests.set(sessionId, request);
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
      const version = await original.apply(this, args);
      if (active) coordinates.observe(args[0], version); return version;
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
  const convert = value => {
    const p = point(value);
    return { x: p.x * frame.width / frame.previewWidth, y: p.y * frame.height / frame.previewHeight };
  };
  if (operation === 'drag') return [convert(parameters[0]), convert(parameters[1]), ...parameters.slice(2)];
  if (typeof parameters[0] === 'number') return parameters;
  return [convert(parameters[0]), ...parameters.slice(1)];
}

export function mountImageCoordinates(ctx, coordinates) {
  ctx.inject(['attachments'], image => { image.effect(() => coordinates.watch(image.attachments)); });
  ctx.on('llm/stream', (options, next) => {
    if (!isAgentLoopRequest(options) || !coordinates.images.has(options.sessionId)) return next();
    return coordinates.stream(options.sessionId, next);
  }, { global: true });
}
