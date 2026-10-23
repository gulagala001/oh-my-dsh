// Facts about the exact inspected request, never the mutable current session.
// Keep them off the provider envelope and out of persisted conversation data.
const inspected = new WeakMap();
export const rememberRequestImages = (request, value) => inspected.set(request, Object.freeze(value));
export const requestImagesState = request => inspected.get(request);

// Native offload changes only delivery, not the source facts selected by a
// summarizer. All attachment identity, detail, text and call metadata still count.
export function imageSourceValue(value) {
  if (Array.isArray(value)) return value.map(imageSourceValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !(value.type === 'image' && value.attachment && key === 'offloaded'))
    .map(([key, item]) => [key, key === 'arguments' ? item : imageSourceValue(item)]));
}

export function retainImageOffloads(original, current) {
  const states = new Map();
  const visit = (blocks, fn) => (blocks || []).forEach(block => block.type === 'image' ? fn(block)
    : block.type === 'tool-result' ? visit(block.content, fn) : undefined);
  const key = block => JSON.stringify(imageSourceValue(block));
  visit(current.content, block => {
    const id = key(block), queue = states.get(id) || []; queue.push(block.offloaded === true); states.set(id, queue);
  });
  const result = structuredClone(original);
  visit(result.content, block => { if (states.get(key(block))?.shift()) block.offloaded = true; });
  return result;
}
