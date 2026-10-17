import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserAdapter, CHAT_URL, browserLimitations } from '../src/client/browser-adapter.mjs';
class Guest extends EventTarget {
  attrs = {}; loads = []; removed = false;
  setAttribute(key, value) { this.attrs[key] = value; }
  remove() { this.removed = true; }
  async loadURL(url) { this.loads.push(url); }
  getURL() { return this.loads.at(-1) ?? 'about:blank'; }
  getTitle() { return 'Fixture'; }
  canGoBack() { return false; } canGoForward() { return false; }
  executeJavaScript(script, gesture) { return Promise.resolve({ script, gesture }); }
}
test('owned native guest bootstraps its lease before loading and releases exactly once', async () => {
  const guest = new Guest(), calls = [], states = [];
  const bridge = { async capabilities() { return { persistentProfiles: true, downloads: true }; }, async acquire(...args) { calls.push(['acquire', ...args]); return { lease: 'lease1', partition: 'persist:owned' }; }, async release(lease) { calls.push(['release', lease]); }, onOpenRequested(lease, fn) { calls.push(['subscribe', lease]); this.open = fn; return () => calls.push(['unsubscribe', lease]); } };
  const adapter = await createBrowserAdapter({ bridge, workspace: 'cwd:fixture', container: { append() { calls.push(['append']); } }, createElement: () => guest, onState: state => states.push(state) });
  assert.deepEqual(calls[0], ['acquire', 'cwd:fixture', { profile: 'deepseek-workbench' }]);
  assert.deepEqual(guest.attrs, { name: 'lease1', partition: 'persist:owned', allowpopups: '', src: 'about:blank#lease1', 'aria-label': 'DeepSeek 网页聊天' });
  assert.deepEqual(guest.loads, []);
  guest.dispatchEvent(new Event('dom-ready')); await Promise.resolve();
  assert.deepEqual(guest.loads, [CHAT_URL]);
  guest.dispatchEvent(new Event('did-stop-loading'));
  assert.equal(states.at(-1).loading, false);
  assert.deepEqual(states.at(-1).warnings, []);
  assert.equal((await adapter.extract('fixture')).gesture, false);
  const execute = guest.executeJavaScript;
  guest.executeJavaScript = async () => { throw Error("Error invoking remote method 'GUEST_VIEW_MANAGER_CALL': Error: 网页输入框尚不可用。"); };
  await assert.rejects(adapter.extract('fixture'), { message: '网页输入框尚不可用。' });
  guest.executeJavaScript = execute;
  bridge.open('javascript:alert(1)'); assert.equal(guest.loads.length, 1);
  bridge.open('https://chat.deepseek.com/a/next'); await Promise.resolve(); assert.equal(guest.loads.length, 2);
  await adapter.dispose(); await adapter.dispose();
  assert.equal(guest.removed, true);
  assert.equal(calls.filter(item => item[0] === 'release').length, 1);
  assert.equal(calls.filter(item => item[0] === 'unsubscribe').length, 1);
});
test('late guest reservation is released after an unmount without creating DOM', async () => {
  const controller = new AbortController(); let resolve, releases = [];
  const pending = createBrowserAdapter({ bridge: { acquire: () => new Promise(done => { resolve = done; }), release: async lease => releases.push(lease) }, container: { append() { assert.fail('Disposed guest must not mount'); } }, signal: controller.signal, createElement() { assert.fail('Disposed guest must not create DOM'); } });
  await Promise.resolve(); controller.abort(); resolve({ lease: 'late', partition: 'temporary' });
  assert.equal(await pending, null); assert.deepEqual(releases, ['late']);
});

test('failed guest release retries without repeating local cleanup or accepting stale extraction', async () => {
  const guest = new Guest(), pending = Promise.withResolvers();
  let attempts = 0, removals = 0, unsubscribed = 0;
  guest.remove = () => removals++;
  guest.executeJavaScript = () => pending.promise;
  const adapter = await createBrowserAdapter({ bridge: {
    async acquire() { return { lease: 'retry', partition: 'isolated' }; },
    async release() { if (++attempts === 1) throw Error('RELEASE_FAILURE'); },
    onOpenRequested() { return () => unsubscribed++; },
  }, container: { append() {} }, createElement: () => guest });
  guest.dispatchEvent(new Event('dom-ready'));
  const extracted = adapter.extract('fixture');
  const rejected = assert.rejects(extracted, /网页已关闭/);
  await assert.rejects(adapter.dispose(), /RELEASE_FAILURE/);
  const retry = adapter.dispose();
  assert.equal(adapter.dispose(), retry);
  await retry; await adapter.dispose();
  assert.equal(attempts, 2); assert.equal(removals, 1); assert.equal(unsubscribed, 1);
  pending.resolve({ text: 'old guest' });
  await rejected;
});
