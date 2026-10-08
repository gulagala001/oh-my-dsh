import assert from 'node:assert/strict';

export class Checks {
  constructor(trace = () => {}) { this.results = []; this.trace = trace; }
  async check(name, fn) {
    const start = performance.now();
    try {
      await fn(); const row = { name, status: 'pass', elapsedMs: performance.now() - start };
      this.results.push(row); this.trace({ type: 'assertion', ...row });
    } catch (cause) {
      const row = { name, status: 'fail', message: cause?.message ?? String(cause), elapsedMs: performance.now() - start };
      this.results.push(row); this.trace({ type: 'assertion', ...row });
      throw Object.assign(Error(name + ': ' + row.message, { cause }), { code: 'SIM_ASSERTION', assertion: name });
    }
  }
}

export function assertToolPairs(events) {
  const pending = new Map();
  for (const event of events) {
    const message = event.data?.message;
    if (event.type === 'assistant/message') for (const block of message?.content ?? []) {
      if (block.type === 'tool-call') {
        assert.ok(!pending.has(block.id), 'duplicate unresolved tool call ' + block.id);
        pending.set(block.id, block.name);
      }
    }
    if (event.type === 'tool/result') {
      assert.ok(pending.has(message?.toolCallId), 'orphan tool result ' + message?.toolCallId);
      pending.delete(message.toolCallId);
    }
  }
  assert.deepEqual([...pending], [], 'completed scenario has unresolved native tool calls');
}

export function assertSystemHead(requests) {
  for (const request of requests) if (request.payload?.tools?.length) {
    assert.equal(request.payload.messages[0]?.role, 'system', 'model request must retain the system message at the head');
  }
}

export function assertNoLeak(value, sentinel) { assert.ok(!JSON.stringify(value).includes(sentinel), 'private source escaped its session'); }

export function assertFaultLedger(events) {
  let faults = new Map();
  const complete = () => { for (const [id, left] of faults) assert.equal(left, 0, 'unconsumed injected fault ' + id); };
  for (const event of events) {
    if (event.type === 'ready') { complete(); faults = new Map(); }
    else if (event.type === 'arm') { assert.ok(!faults.has(event.fault.id), 'duplicate fault id'); faults.set(event.fault.id, event.fault.count); }
    else if (event.type === 'failure') {
      assert.ok(faults.has(event.faultId), 'fault failure without an arm');
      const left = faults.get(event.faultId) - 1; assert.ok(left >= 0); assert.equal(event.remaining, left); faults.set(event.faultId, left);
    } else if (event.type === 'clear') { assert.equal(event.remaining, 0, 'clear discarded an unconsumed injected fault'); }
    else if (event.type === 'unsupported') throw Error('Injected fault API was unsupported: ' + event.api);
  }
  complete();
}

export async function negativeControls() {
  const controls = [
    ['orphan tool result', () => assertToolPairs([{ type: 'tool/result', data: { message: { role: 'tool', toolCallId: 'missing', content: [] } } }])],
    ['unresolved tool call', () => assertToolPairs([{ type: 'assistant/message', data: { message: { content: [{ type: 'tool-call', id: 'lost', name: 'read' }] } } }])],
    ['wrong system position', () => assertSystemHead([{ payload: { tools: [{}], messages: [{ role: 'user', content: 'bad' }] } }])],
    ['private source contamination', () => assertNoLeak({ summary: 'PRIVATE_NEGATIVE_CONTROL' }, 'PRIVATE_NEGATIVE_CONTROL')],
  ];
  return controls.map(([name, broken]) => {
    let detected = false; try { broken(); } catch { detected = true; }
    assert.ok(detected, 'negative control was not detected: ' + name);
    return { name, status: 'detected' };
  });
}
