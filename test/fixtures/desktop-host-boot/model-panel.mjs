import assert from 'node:assert/strict';

export function modelPriority(slot) {
  assert.equal(slot?.kind, 'single', 'Real model seat is a single slot');
  const active = slot.occupants.filter(row => row.active);
  assert.equal(active.length, 1, 'Exactly one elected model seat');
  assert(Number.isFinite(active[0].priority), 'Model seat exposes a finite numeric priority');
  return active[0].priority;
}

export function assertNativeModelSeat(slot, stockPriority) {
  assert(Number.isFinite(stockPriority), 'Capture the actual stock model priority before installation');
  assert.equal(modelPriority(slot), stockPriority, 'OMD decoration preserves the native model priority');
  assert.equal(slot.occupants.length, 1, 'Native model entry remains the sole registered occupant');
}
