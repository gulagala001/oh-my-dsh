/**
 * Realm-safe checks for values passed from a Node REPL VM context.
 *
 * Avoid `instanceof` here: built-ins created in another realm have different
 * constructors and prototypes.
 */

const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
).get;

function isArrayBuffer(value) {
  if (value == null || typeof value !== "object") return false;
  try {
    // Applying the native getter performs a realm-independent brand check.
    Reflect.apply(arrayBufferByteLengthGetter, value, []);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  isArrayBuffer,
};
