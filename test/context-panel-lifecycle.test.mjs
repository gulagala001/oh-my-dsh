import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createContextUI } from '../src/client/context-client.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function panelFor(props) {
  const { PipelinePanel } = createContextUI(React);
  const Component = PipelinePanel({ useTabInfo: () => ({ tab: { visible: props.visible } }) }).type;
  const panel = new Component(props);
  panel.setState = (update, callback) => {
    panel.state = { ...panel.state, ...(typeof update === 'function' ? update(panel.state) : update) };
    callback?.();
  };
  return panel;
}

test('context polling filters stale selections and isolates hidden and switched sessions', async t => {
  const previousFetch = globalThis.fetch, previousDocument = globalThis.document;
  const visibility = new EventTarget(); visibility.visibilityState = 'visible';
  globalThis.document = visibility;
  const calls = [];
  globalThis.fetch = (url, { signal }) => new Promise(resolve => calls.push({ url, signal, resolve }));
  const panel = panelFor({ sessionId: 'a', visible: true });
  t.after(() => {
    panel.componentWillUnmount(); globalThis.fetch = previousFetch;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  });
  panel.state.selected = ['live', 'archived', 'merged', 'missing'];
  panel.componentDidMount();
  assert.equal(calls[0].url, 'trisoul-x/api/context?session=a');
  calls[0].resolve(Response.json({ records: [{ id: 'live', live: true }, { id: 'archived', live: false }, { id: 'merged', live: true, mergedInto: 'live' }] }));
  await flush();
  assert.deepEqual(panel.state.selected, ['live']);
  let previous = panel.props; panel.props = { ...previous, visible: false }; panel.componentDidUpdate(previous);
  assert.equal(calls.length, 1);
  previous = panel.props; panel.props = { ...previous, visible: true }; panel.componentDidUpdate(previous);
  assert.equal(calls.length, 2);
  previous = panel.props; panel.props = { ...previous, sessionId: 'b' }; panel.componentDidUpdate(previous);
  assert.equal(calls[1].signal.aborted, true);
  assert.equal(calls[2].url, 'trisoul-x/api/context?session=b');
  calls[1].resolve(Response.json({ session: 'a', records: [] })); await flush();
  assert.equal(panel.state.data, null);
  calls[2].resolve(Response.json({ session: 'b', records: [] })); await flush();
  assert.equal(panel.state.data.session, 'b');
  assert.deepEqual(panel.state.selected, []);
});

test('failed compression keeps selection and focus, and retry reuses its scope and payload', async t => {
  const previousFetch = globalThis.fetch, calls = [], focus = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return calls.length === 1 ? Response.json({ error: '隔离故障' }, { status: 503 }) : Response.json({ queued: true });
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const panel = panelFor({ sessionId: 'scope-a', visible: true }); panel.alive = true;
  panel.state.selected = ['first'];
  panel.errorAlert = { getClientRects: () => [{}], focus: options => focus.push(options) };
  let refreshed = 0; panel.load = () => { refreshed++; };
  const body = { ids: ['first'], mode: 'brief' };
  await panel.run('/compact', body);
  assert.equal(panel.state.error, '隔离故障');
  assert.deepEqual(panel.state.selected, ['first']);
  assert.equal(panel.state.busy, false);
  assert.deepEqual(focus, [{ preventScroll: true }]);
  await panel.state.retryAction();
  assert.deepEqual(calls, [{ url: 'trisoul-x/api/compact?session=scope-a', body }, { url: 'trisoul-x/api/compact?session=scope-a', body }]);
  assert.equal(panel.state.error, '');
  assert.deepEqual(panel.state.selected, []);
  assert.equal(panel.state.notice, '已加入后台队列。');
  assert.equal(panel.state.busy, false);
  assert.equal(refreshed, 1);
});

