import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserHost } from '../src/computer-use/browser.mjs';

import { windowsProcessSnapshot as processes, windowsProcessTree, stopWindowsProcesses } from './fixtures/computer-use/windows-processes.mjs';
test('Windows managed browser shutdown confirms its own processes have exited and the profile is unlocked', { skip: process.platform !== 'win32', timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'oh-my-dsh-managed-exit-'));
  const artifacts = resolve('cu-artifacts', 'windows-managed-' + Date.now()); await mkdir(artifacts, { recursive: true });
  const browser = new BrowserHost(join(root, 'profile')); let owned = [];
  t.after(async () => {
    await browser.close().catch(error => t.diagnostic('Browser cleanup error: ' + error.message));
    // Recovery is separate from the assertions. Only previously observed
    // descendants with the same creation time can be stopped by this fixture.
    await stopWindowsProcesses(owned);
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    t.diagnostic('Windows managed process evidence: ' + artifacts);
  });
  await browser.create('fixture', 'data:text/html,<title>Managed Windows fixture</title><input>');
  const connection = await browser.connection('fixture'), cdp = await connection.browser.newBrowserCDPSession();
  const version = await cdp.send('Browser.getVersion'); await cdp.detach();
  await writeFile(join(artifacts, 'browser.json'), JSON.stringify({ guardianPid: browser.child.pid, browserPid: browser.browserPid, executable: browser.runtimePath, version }, null, 2));
  owned = windowsProcessTree(await processes(), browser.child.pid);
  assert.ok(owned.some(process => process.pid === browser.browserPid));
  await writeFile(join(artifacts, 'before.json'), JSON.stringify(owned, null, 2));
  await browser.close();
  // Check before slow process enumeration can hide an early close() return.
  const removal = await rm(root, { recursive: true, force: true }).then(() => null, error => ({ code: error.code, message: error.message }));
  await writeFile(join(artifacts, 'profile-removal.json'), JSON.stringify({ error: removal }, null, 2));
  let remaining;
  for (let i = 0; i < 5; i++) {
    const after = await processes(); remaining = owned.filter(expected => after.some(actual => actual.pid === expected.pid && actual.created === expected.created));
    if (!remaining.length) break; await delay(100);
  }
  await writeFile(join(artifacts, 'remaining.json'), JSON.stringify(remaining, null, 2));
  assert.deepEqual(remaining, [], 'normal shutdown must not leave the managed browser or its children running');
  assert.equal(removal, null, 'close() must wait until its browser releases the profile');
});
