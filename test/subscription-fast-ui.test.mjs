import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

let browser, script;
before(async () => {
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { SubscriptionFast } from './src/client/subscription-fast.jsx';
    const listeners = new Set();
    const store = { subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, getSnapshot: () => window.selection };
    const ctx = { get: () => ({ binding: () => ({ session: { projections: { faceOf: () => store } } }) }) };
    window.selectFastModel = next => { window.selection = { next }; for (const fn of listeners) fn(); };
    function App() {
      const [sessionId, setSessionId] = React.useState('a');
      window.selectFastSession = setSessionId;
      return <SubscriptionFast ctx={ctx} sessionId={sessionId}
        loadSpeed={() => window.requestSpeed('read', { sessionId })}
        setSpeed={tier => window.requestSpeed('write', { sessionId, tier })}/>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  `, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'jsx' }, bundle: true, write: false, platform: 'browser', format: 'iife' });
  script = bundle.outputFiles[0].text;
  browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
});
after(async () => { await browser?.close(); });

async function fixture(t) {
  const page = await browser.newPage(), errors = [];
  t.after(async () => { assert.deepEqual(errors, []); await page.close(); });
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<main id="root"></main>');
  await page.evaluate(() => {
    window.selection = { next: { provider: 'codex', model: 'fixture' } };
    window.speedRequests = [];
    const intervals = new Map(); let timerId = 0;
    window.setInterval = fn => { intervals.set(++timerId, fn); return timerId; };
    window.clearInterval = id => intervals.delete(id);
    window.tickFastPoll = () => { for (const fn of intervals.values()) fn(); };
    window.requestSpeed = (kind, payload) => new Promise((resolve, reject) => {
      window.speedRequests.push({ kind, ...payload, resolve, reject });
    });
    window.finishSpeedRequest = (index, value, reject = false) => {
      const request = window.speedRequests[index];
      if (reject) request.reject(new Error('fixture failure')); else request.resolve(value);
    };
  });
  await page.addScriptTag({ content: script });
  await page.waitForFunction(() => window.speedRequests.length === 1);
  const button = page.getByRole('button', { name: 'Fast 模式', exact: true });
  const flush = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const finish = async (index, value, reject = false) => {
    await page.evaluate(({ index, value, reject }) => window.finishSpeedRequest(index, value, reject), { index, value, reject });
    await flush();
  };
  await finish(0, { visible: true, tier: 'standard' });
  await button.waitFor();
  return { page, button, flush, finish, poll: async () => { await page.evaluate(() => window.tickFastPoll()); await flush(); } };
}

test('a stale Fast read cannot undo a successful toggle or change the next click', async t => {
  const { page, button, finish, poll } = await fixture(t);
  await poll(); // The old standard read remains pending while the user enables Fast.
  await button.click(); await finish(2, true);
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  await finish(1, { visible: true, tier: 'standard' });
  assert.equal(await button.getAttribute('aria-pressed'), 'true', 'a read started before the write cannot undo the saved tier');
  await button.click(); await finish(3, true);
  assert.equal(await button.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(await page.evaluate(() => window.speedRequests.filter(r => r.kind === 'write').map(r => r.tier)), ['fast', 'standard']);
});

test('Fast pauses polling during a write and resumes fresh reads afterwards', async t => {
  const { page, button, finish, poll } = await fixture(t);
  await button.click();
  assert.equal(await button.isDisabled(), true);
  await poll(); await poll();
  assert.equal(await page.evaluate(() => window.speedRequests.length), 2, 'no read may start against a pending write');
  await finish(1, true);
  assert.equal(await button.isEnabled(), true);
  await poll(); await finish(2, { visible: true, tier: 'fast' });
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  await button.click(); await finish(3, true);
  await poll(); await finish(4, { visible: true, tier: 'standard' });
  assert.equal(await button.getAttribute('aria-pressed'), 'false');
});

for (const reject of [false, true]) test(`a ${reject ? 'rejected' : 'failed'} Fast write leaves the tier intact and permits retry`, async t => {
  const { page, button, finish, poll } = await fixture(t);
  await button.click(); await finish(1, false, reject);
  assert.equal(await button.getAttribute('aria-pressed'), 'false');
  assert.equal(await button.isEnabled(), true);
  assert.match(await button.getAttribute('title'), /未保存/);
  await poll(); await finish(2, { visible: true, tier: 'standard' });
  assert.match(await button.getAttribute('title'), /未保存/, 'a fresh read must not erase the failure explanation');
  await button.click(); await finish(3, true);
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  assert.doesNotMatch(await button.getAttribute('title'), /未保存/);
  assert.deepEqual(await page.evaluate(() => window.speedRequests.filter(r => r.kind === 'write').map(r => r.tier)), ['fast', 'fast']);
});

test('a stale model read cannot hide or overwrite the newly selected model', async t => {
  const { page, button, finish, poll, flush } = await fixture(t);
  await poll();
  await page.evaluate(() => window.selectFastModel({ provider: 'codex', model: 'next' })); await flush();
  assert.equal(await button.count(), 0, 'the old model state is hidden until the new read completes');
  await finish(2, { visible: true, tier: 'fast' });
  await finish(1, { visible: false, tier: 'standard' });
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => window.selectFastModel({ provider: 'other', model: 'next' })); await flush();
  await finish(3, { visible: true, tier: 'fast' });
  assert.equal(await button.count(), 0, 'Fast is never offered for another provider');
});

for (const change of ['model', 'session']) test(`a pending Fast write cannot affect the next ${change} or block its own toggle`, async t => {
  const { page, button, finish, flush } = await fixture(t);
  await button.click();
  await page.evaluate(change => {
    if (change === 'model') window.selectFastModel({ provider: 'codex', model: 'next' });
    else window.selectFastSession('b');
  }, change); await flush();
  await finish(2, { visible: true, tier: 'standard' });
  assert.equal(await button.isEnabled(), true);
  await button.click(); await finish(3, true);
  await finish(1, false);
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  assert.equal(await button.isEnabled(), true);
  assert.doesNotMatch(await button.getAttribute('title'), /未保存/);
});
