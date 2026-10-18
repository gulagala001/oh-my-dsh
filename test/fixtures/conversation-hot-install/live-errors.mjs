import assert from 'node:assert/strict';

export function assertLiveErrors(errors, boundary) {
  assert.deepEqual(errors, [], 'Live renderer errors at ' + boundary);
}

export async function readSnapshotWithLiveErrors(read, errors) {
  const value = await read();
  assertLiveErrors(errors, 'snapshot-complete');
  return value;
}
