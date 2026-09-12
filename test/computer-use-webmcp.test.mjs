import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { webMcpFixture } from './fixtures/computer-use/webmcp.mjs';
import { chromium } from 'playwright';

for (const backend of ['managed', 'extension']) test(`${backend}: native WebMCP discovery, execution, invalidation and stop`, { timeout: 30000, skip: backend === 'extension' && process.platform === 'win32' }, async t => {
  const fixture = await webMcpFixture(); t.after(() => fixture.close());
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-webmcp-test-'));
  const env = backend === 'extension' ? await extensionFixture(t, { fixture, args: ['--enable-blink-features=WebMCP'] }) : null;
  // The isolated Chromium fixture has no user credentials. Like Playwright's
  // own launch, it uses a mock keychain; production browser launches do not.
  const executablePath = process.platform !== 'win32' ? join(root, 'test-chromium') : chromium.executablePath();
  // Match Playwright's isolated test launch on Linux runners whose AppArmor
  // policy prevents the downloaded Chromium from creating its user namespace.
  // This wrapper is only for the fixture, never a production browser profile.
  if (process.platform !== 'win32') await writeFile(executablePath, '#!/bin/sh\nexec ' + "'" + (process.env.TRISOUL_CU_TEST_BROWSER_EXECUTABLE ?? chromium.executablePath()).replaceAll("'", "'\\''") + "'" + (process.platform === 'darwin' ? ' --use-mock-keychain' : ' --no-sandbox') + ' "$@"\n', { mode: 0o700 });
  const manager = new ComputerUseManager(root, { ...(env ? { extensionHub: env.hub } : { browser: { executablePath } }), native: { binary: join(root, 'missing') } });
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  const run = async code => { const r = await manager.execute('test', code); assert.equal(r.error, undefined, r.error?.message); return r; };
  await run(`var tab=await cua.createBrowserTab(${JSON.stringify(env?.browser.id ?? 'browser')},${JSON.stringify(fixture.url)});await tab.playwright.getByText('工具已注册',{exact:true}).waitFor();var webmcp=await tab.capabilities.get('webmcp');var tools=await webmcp.fetchTools();nodeRepl.write(tools.description());`);
  const description = (await run('nodeRepl.write(tools.description());')).blocks.at(-1).text;
  assert.match(description, /set_note/); assert.match(description, /slow_note/);
  const changed = await run("nodeRepl.write(await tools.call('set_note',{text:'中文 🌿'}));");
  assert.match(changed.blocks.at(-1).text, /中文 🌿/);
  const info = manager.status('test').target, host = manager.browserForTab(info.id, info.browserId), record = await host.target('test', info.id);
  assert.equal(await record.page.locator('#note').innerText(), '1:中文 🌿');
  assert.match((await manager.execute('test', "await tools.call('invented',{});")).error?.message, /Unknown WebMCP tool/);
  assert.match((await manager.execute('test', "await tools.call('throw_error',{});")).error?.message, /Fixture WebMCP failure/);
  await run("await tab.playwright.getByRole('button',{name:'替换工具'}).click();await tab.playwright.getByText('工具已替换',{exact:true}).waitFor();");
  assert.match((await manager.execute('test', "await tools.call('set_note',{text:'STALE'});")).error?.message, /tools changed/);
  assert.equal(await record.page.locator('#note').innerText(), '1:中文 🌿', 'a stale tool handle must not execute its replacement');
  await run("tools=await webmcp.fetchTools();await tools.call('set_note',{text:'new'});");
  assert.equal(await record.page.locator('#note').innerText(), '2:new');
  await run("await tab.reload();await tab.playwright.getByText('工具已注册',{exact:true}).waitFor();");
  assert.match((await manager.execute('test', "await tools.call('set_note',{text:'WRONG_DOCUMENT'});")).error?.message, /tools changed/);
  await run('tools=await webmcp.fetchTools();');
  const pending = manager.execute('test', "await tools.call('slow_note',{text:'must not appear'});");
  try { await record.page.getByText('延迟工具执行中', { exact: true }).waitFor(); }
  catch (error) { throw new Error(error.message + '\nPending call: ' + JSON.stringify(await Promise.race([pending, delay(100, { stillRunning: true })])) + '\nPage: ' + await record.page.locator('body').innerText()); }
  const send = record.cdp.send.bind(record.cdp); let refuseCancellation = true;
  record.cdp.send = (method, args) => method === 'WebMCP.cancelInvocation' && refuseCancellation ? Promise.reject(new Error('Fixture cancellation acknowledgement lost')) : send(method, args);
  await assert.rejects(manager.stop('test'), /cancellation|cleanup/i);
  await assert.rejects(manager.resume('test'), /Stopping has not been confirmed/);
  assert.ok(record.webmcp.active.size, 'failed cancellation retains the native invocation for retry');
  refuseCancellation = false;
  await manager.stop('test');
  assert.ok((await pending).error);
  // Observe from a fresh control connection only after stop has acknowledged.
  await manager.resume('test');
  await run(`tab=await cua.getTab(${JSON.stringify(info.id)},{browser:${JSON.stringify(info.browserId)}});`);
  const resumed = await host.target('test', info.id);
  assert.equal(await resumed.page.locator('#status').innerText(), '延迟工具已取消');
  await delay(1600);
  assert.equal(await resumed.page.locator('#note').innerText(), '未修改', 'cancelled native WebMCP code must not perform its delayed write');
});

test('older browser versions do not advertise or invoke the unverified WebMCP cancellation contract', async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-webmcp-version-'));
  const manager = new ComputerUseManager(root, { native: { binary: join(root, 'missing') } });
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  const tab = await manager.dispatch('test', 'createBrowserTab', ['browser', 'about:blank']);
  const record = await manager.browser.target('test', tab.id), send = record.cdp.send.bind(record.cdp);
  record.cdp.send = (method, args) => method === 'Browser.getVersion' ? Promise.resolve({ product: 'Chrome/152.0.7977.83' }) : send(method, args);
  const available = await manager.dispatch('test', 'target', [tab, 'capabilities.list']);
  assert.equal(available.some(capability => capability.id === 'webmcp'), false);
  await assert.rejects(manager.dispatch('test', 'target', [tab, 'webmcp.fetchTools']), /requires Chromium 153/);
});
