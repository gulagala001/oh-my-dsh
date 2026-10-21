import { createHash } from 'node:crypto';

// Native messages are deeply frozen JSON snapshots. Weak keys retain neither
// an unloaded session nor its history; mutable inputs are measured afresh.
const immutable = new WeakSet(), metrics = new WeakMap();
function frozenJson(value) {
  if (value === null || typeof value !== 'object') return !['function', 'symbol', 'bigint'].includes(typeof value);
  if (immutable.has(value)) return true;
  if (!Object.isFrozen(value) || ![null, Object.prototype, Array.prototype].includes(Object.getPrototypeOf(value))) return false;
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(descriptor, 'value') || !frozenJson(descriptor.value)) return false;
  }
  immutable.add(value); return true;
}
function reading(value) {
  const cacheable = value !== null && typeof value === 'object' && frozenJson(value);
  let entry = cacheable && metrics.get(value);
  if (!entry) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    entry = { bytes: Buffer.byteLength(text), hash: createHash('sha256').update(text).digest('hex') };
    if (cacheable) metrics.set(value, entry);
  }
  return entry;
}
export const hash = value => reading(value).hash;
export const jsonBytes = value => typeof value === 'string' ? Buffer.byteLength(JSON.stringify(value)) : reading(value).bytes;
export const frozenJsonValue = frozenJson;
export function requestBytes(options) {
  const messages = options.messages;
  const ordinary = () => jsonBytes({ messages, tools: options.tools, system: options.system });
  if (!Array.isArray(messages) || Object.getPrototypeOf(messages) !== Array.prototype || messages.toJSON !== undefined) return ordinary();
  for (const message of messages) if (!message || typeof message !== 'object' || !frozenJson(message)) return ordinary();
  return jsonBytes({ messages: [], tools: options.tools, system: options.system })
    + messages.reduce((bytes, message) => bytes + jsonBytes(message), 0) + Math.max(0, messages.length - 1);
}
