import assert from 'node:assert/strict';

export function modelPriority(slot) {
  assert.equal(slot?.kind, 'single', 'Real model seat is a single slot');
  const active = slot.occupants.filter(row => row.active);
  assert.equal(active.length, 1, 'Exactly one elected model seat');
  assert(Number.isFinite(active[0].priority), 'Model seat exposes a finite numeric priority');
  return active[0].priority;
}

export function assertModelTakeover(slot, stockPriority) {
  assert(Number.isFinite(stockPriority), 'Capture the actual stock model priority before installation');
  assert.equal(modelPriority(slot), stockPriority - 0.5, 'OMD takes over the stock model seat at priority minus 0.5');
  const retained = slot.occupants.filter(row => row.priority === stockPriority);
  assert.equal(retained.length, 1, 'Original stock-priority occupant remains registered');
  assert.equal(retained[0].active, false, 'OMD shadows the retained stock occupant');
}
