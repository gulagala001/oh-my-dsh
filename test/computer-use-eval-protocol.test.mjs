import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { unexpectedResponseTools, relayEvalResponse, visualTaskOrder } from '../scripts/computer-use-eval-protocol.mjs';

const sse = values => values.map(value => 'data: ' + JSON.stringify(value) + '\n\n').join('') + 'data: [DONE]\n\n';
const delta = calls => ({ choices: [{ index: 0, delta: { tool_calls: calls } }] });
const tool = (index, name, args) => ({ index, function: { name, arguments: args } });

test('visual evaluation rejects reversed actions and missing order evidence', () => {
  const events = names => names.map(type => ({ type }));
  assert.equal(visualTaskOrder(events(['red-hit', 'drag-start', 'drag-complete'])), true);
  assert.equal(visualTaskOrder(events(['drag-start', 'drag-complete', 'red-hit'])), false);
  assert.equal(visualTaskOrder(events(['drag-start', 'red-hit', 'drag-complete'])), false);
  assert.equal(visualTaskOrder(events(['red-hit', 'drag-complete'])), false);
  assert.equal(visualTaskOrder(undefined), false);
});

test('evaluation checks complete streamed calls, including split names and verification commands', () => {
  const body = sse([delta([tool(0, 'computer_', '{"code":"await cua.getState()"}'), tool(1, 'ba', '{"command":"SIDE_EFFECT_MARKER"}')]), delta([tool(0, 'use', ''), tool(1, 'sh', '')])]);
  assert.deepEqual(unexpectedResponseTools(body, 'text/event-stream'), [{ name: 'bash' }]);
  assert.deepEqual(unexpectedResponseTools(body, 'text/event-stream', { includeArguments: true }), [{ name: 'bash', arguments: '{"command":"SIDE_EFFECT_MARKER"}' }]);
  assert.deepEqual(unexpectedResponseTools(sse([delta([tool(0, 'verify_link', '{"op":"run"}')])]), 'text/event-stream'), [{ name: 'verify_link', operation: 'run' }]);
  assert.throws(() => unexpectedResponseTools(body.replace('data: [DONE]\n\n', ''), 'text/event-stream'), /completion marker/);
});

test('an invalid response is rejected before any tool-call payload reaches the executor', async t => {
  let rejected = [];
  const invalid = sse([delta([tool(0, 'computer_use', '{}')]), delta([tool(1, 'bash', '{"command":"SIDE_EFFECT_MARKER"}')])]);
  const valid = sse([delta([tool(0, 'computer_use', '{"code":"await cua.getState()"}')])]);
  const server = createServer((request, response) => {
    void relayEvalResponse(new Response(request.url === '/invalid' ? invalid : valid, { headers: { 'Content-Type': 'text/event-stream' } }), response, value => { rejected = value; });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const denied = await fetch(origin + '/invalid'), payload = await denied.text();
  assert.equal(denied.status, 422);
  assert.deepEqual(rejected, [{ name: 'bash' }]);
  assert.equal(payload.includes('SIDE_EFFECT_MARKER'), false);
  assert.equal(payload.includes('tool_calls'), false, 'even the allowed call from this rejected response must not start');
  const accepted = await fetch(origin + '/valid');
  assert.equal(accepted.status, 200); assert.equal(await accepted.text(), valid, 'accepted model output is forwarded verbatim');
});
