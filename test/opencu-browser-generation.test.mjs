// Synced from OpenCU 4f301a7 test/browser-host-generation.test.mjs; exercise the bundled consumer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createBrowserHost } from '../vendor/opencu/src/dsh/browser-host.mjs';

async function fixture(t) {
  const host = createBrowserHost(), rendererId = randomUUID();
  t.after(() => host.close());
  const target = { id: 'dsh:fixture-tab', identity: { rendererId, guestId: 'fixture-guest' },
    backend: 'browser', provider: 'dsh', kind: 'tab', url: 'https://example.test/' };
  await host.handle('browser/connect', { rendererId });
  await host.handle('browser/publish', { rendererId, targets: [target] });
  return { host, rendererId, target };
}
const settle = promise => promise.then(value => ({ value }), error => ({ error }));

test('a replaced long poll cannot deliver retired commands as a live connection', async t => {
  const { host, rendererId, target } = await fixture(t);
  const oldPoll = host.handle('browser/poll', { rendererId });
  const oldAction = settle(host.backend.act(target, { action: 'keyDown', key: 'Shift' }));
  // The poll is awake but has not resumed when the same renderer reconnects.
  await host.handle('browser/connect', { rendererId });
  const response = await oldPoll;
  assert.equal(response.connected, false);
  assert.deepEqual(response.commands, [], 'retired input commands must not reach the renderer');
  assert.equal((await oldAction).error?.code, 'BROWSER_HOST_DISCONNECTED');
  assert.equal(host.listBrowsers().length, 1, 'the replacement remains connected');
});

test('cancelling an old action after reconnect cannot time out and disconnect the replacement', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { host, rendererId, target } = await fixture(t), aborter = new AbortController();
  const oldAction = settle(host.backend.act(target, { action: 'keyDown', key: 'Shift', signal: aborter.signal }));
  const [oldCommand] = (await host.handle('browser/poll', { rendererId })).commands;
  assert.equal(oldCommand.method, 'act');
  const reconnect = host.handle('browser/connect', { rendererId });
  aborter.abort(Error('cancel during reconnect'));
  await reconnect;
  t.mock.timers.tick(30000);
  assert.equal((await oldAction).error?.code, 'RELEASE_FAILED', 'missing release acknowledgement remains an error');
  assert.equal(host.listBrowsers().length, 1, 'no request is queued on the retired client');

  await host.handle('browser/publish', { rendererId, targets: [target] });
  const currentAction = settle(host.backend.act(target, { action: 'type', text: 'new operation' }));
  const commands = (await host.handle('browser/poll', { rendererId })).commands;
  assert.equal(commands.length, 1);
  assert.equal(commands[0].params.action.text, 'new operation');
  assert.deepEqual(await host.handle('browser/result', { rendererId, id: oldCommand.id, result: { released: true } }), { ok: true, ignored: true });
  await host.handle('browser/result', { rendererId, id: commands[0].id, result: { accepted: true } });
  assert.deepEqual((await currentAction).value, { accepted: true });
});

test('cancelling after a disconnect rejects the action rather than escaping the abort listener', () => {
  // An uncaught AbortSignal listener error is process-level, so verify it in a
  // child process without intercepting or suppressing uncaught exceptions.
  const module = new URL('../vendor/opencu/src/dsh/browser-host.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { randomUUID } from 'node:crypto';
    import { createBrowserHost } from ${JSON.stringify(module)};
    const host = createBrowserHost(), rendererId = randomUUID(), signal = new AbortController();
    await host.handle('browser/connect', { rendererId });
    const target = { id: 'dsh:tab', identity: { rendererId, guestId: 'guest' } };
    const action = host.backend.act(target, { action: 'keyDown', key: 'Shift', signal: signal.signal }).catch(error => error);
    const disconnect = host.handle('browser/disconnect', { rendererId });
    signal.abort(Error('cancel'));
    await disconnect;
    const error = await action;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(error.code, 'RELEASE_FAILED');
    host.close();
  `], { encoding: 'utf8', timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('a connected cancellation still waits for the actual targeted release acknowledgement', async t => {
  const { host, rendererId, target } = await fixture(t), aborter = new AbortController();
  const reason = Error('explicit cancel');
  let finished = false;
  const action = settle(host.backend.act(target, { action: 'keyDown', key: 'Shift', signal: aborter.signal })).then(result => { finished = true; return result; });
  const [command] = (await host.handle('browser/poll', { rendererId })).commands;
  aborter.abort(reason);
  const [release] = (await host.handle('browser/poll', { rendererId })).commands;
  assert.equal(release.method, 'release');
  assert.deepEqual(release.params.target, target);
  await host.handle('browser/result', { rendererId, id: command.id, result: { accepted: true } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  await host.handle('browser/result', { rendererId, id: release.id, result: { released: true } });
  assert.equal((await action).error, reason);
  assert.equal(host.listBrowsers().length, 1);
});
