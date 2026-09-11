import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, execFile } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { promisify } from 'node:util';

const runFile = promisify(execFile);

async function until(check, timeout = 4000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await delay(30); }
  assert.fail('The expected browser lifecycle transition did not occur');
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } }

test('an abruptly killed owner cannot leave its actual browser running', { skip: process.platform === 'win32', timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-owner-death-')), fixture = await startFixture();
  const entry = join(root, 'owner.mjs');
  await writeFile(entry, `import {BrowserHost} from ${JSON.stringify(new URL('../src/computer-use/browser.mjs', import.meta.url).href)};const host=new BrowserHost(process.argv[2]);await host.create('owner',process.argv[3]);process.send({guardian:host.child.pid,browser:host.browserPid??host.child.pid});`);
  const owner = fork(entry, [join(root, 'profile'), fixture.url], { execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let info;
  owner.stderr.on('data', () => {});
  t.after(async () => {
    if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
    if (info) { try { process.kill(-info.guardian, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    await fixture.close(); await rm(root, { recursive: true, force: true });
  });
  [info] = await once(owner, 'message', { signal: AbortSignal.timeout(10000) });
  assert.ok(alive(info.browser));
  const exited = once(owner, 'exit'); owner.kill('SIGKILL'); await exited;
  await until(() => !alive(info.browser), 5000);
  await until(() => !alive(info.guardian), 5000);
  const { stdout } = await runFile('/bin/ps', ['-ax', '-o', 'pid=,command=']);
  assert.equal(stdout.split('\n').some(line => line.includes(join(root, 'profile'))), false, 'owned browser renderers and helpers must also exit');
});

test('the owner takes over cleanup if its browser guardian crashes', { skip: process.platform === 'win32', timeout: 12000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-guardian-crash-')), fixture = await startFixture();
  const host = new BrowserHost(root);
  t.after(async () => { await host.close(); await fixture.close(); await rm(root, { recursive: true, force: true }); });
  const tab = await host.create('test', fixture.url), browserPid = host.browserPid;
  const pending = host.invoke('test', tab.id, 'locator', [[{ method: 'getByRole', args: ['button', { name: 'never appears' }] }], 'click', []]);
  const rejected = assert.rejects(pending, /closed|exited|crash|disconnected/i);
  process.kill(host.child.pid, 'SIGKILL');
  await Promise.all([until(() => !alive(browserPid)), rejected]);
  const next = await host.create('test', fixture.url);
  assert.notEqual(next.id, tab.id);
});

test('owner death during startup also kills helpers that ignore termination', { skip: process.platform === 'win32', timeout: 12000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-startup-death-')), executablePath = join(root, 'fake-browser.mjs');
  const entry = join(root, 'owner.mjs'), profile = join(root, 'profile');
  await writeFile(executablePath, `#!/usr/bin/env node\nimport{spawn}from'node:child_process';import{writeFileSync}from'node:fs';const dir=process.argv.find(a=>a.startsWith('--user-data-dir=')).slice(16);process.on('SIGTERM',()=>{});const helper=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});helper.on('message',()=>writeFileSync(dir+'/ready',JSON.stringify({browser:process.pid,helper:helper.pid})));setInterval(()=>{},1000);\n`);
  await chmod(executablePath, 0o700);
  await writeFile(entry, `import{BrowserHost}from ${JSON.stringify(new URL('../src/computer-use/browser.mjs', import.meta.url).href)};import{readFile}from'node:fs/promises';import{setTimeout as delay}from'node:timers/promises';const host=new BrowserHost(process.argv[2],{executablePath:process.argv[3]});void host.start().catch(()=>{});while(true){let info;try{info=JSON.parse(await readFile(process.argv[2]+'/ready','utf8'));}catch{}if(info){process.send({...info,guardian:host.child.pid});break;}await delay(20);}`);
  const owner = fork(entry, [profile, executablePath], { execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  owner.stderr.on('data', () => {}); let info;
  t.after(async () => {
    if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
    if (info) { try { process.kill(-info.guardian, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    await rm(root, { recursive: true, force: true });
  });
  [info] = await once(owner, 'message', { signal: AbortSignal.timeout(5000) });
  const exited = once(owner, 'exit'); owner.kill('SIGKILL'); await exited;
  await until(() => !alive(info.browser) && !alive(info.helper) && !alive(info.guardian), 5000);
});

test('browser crash cancels old work and allows a fresh browser without rebinding old tabs', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-browser-crash-')), fixture = await startFixture();
  const host = new BrowserHost(root);
  t.after(async () => { await host.close(); await fixture.close(); await rm(root, { recursive: true, force: true }); });
  const first = await host.create('test', fixture.url);
  const pending = host.invoke('test', first.id, 'locator', [[{ method: 'getByRole', args: ['button', { name: 'never appears' }] }], 'click', []]);
  const stopped = assert.rejects(pending, /closed|exited|crash|disconnected/i);
  process.kill(host.browserPid ?? host.child.pid, 'SIGKILL');
  await stopped;
  await until(() => host.records.size === 0 && host.owners.size === 0);
  await assert.rejects(host.target('test', first.id), /closed|exited/i);
  const second = await host.create('test', fixture.url);
  assert.notEqual(second.id, first.id);
  assert.match((await host.invoke('test', second.id, 'getAXState', [])).state, /测试工作台/);
  await assert.rejects(host.target('test', first.id), /closed|exited/i);
});

test('a second owner cannot disturb a live profile or use its debugging endpoint', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-profile-owner-')), fixture = await startFixture();
  const first = new BrowserHost(root), second = new BrowserHost(root);
  t.after(async () => { await Promise.allSettled([second.close(), first.close()]); await fixture.close(); await rm(root, { recursive: true, force: true }); });
  const tab = await first.create('first', fixture.url);
  await first.invoke('first', tab.id, 'locator', [[{ method: 'getByRole', args: ['button', { name: '打开对话框', exact: true }] }], 'click', []]);
  const before = await readFile(join(root, 'DevToolsActivePort'), 'utf8');
  await assert.rejects(second.create('second', fixture.url), /already|in use|another|exited/i);
  assert.equal(await readFile(join(root, 'DevToolsActivePort'), 'utf8'), before, 'another owner must not remove live profile metadata');
  assert.equal((await first.invoke('first', tab.id, 'dialog.get', [])).message, '测试输入', 'the process ownership probe must not attach pages and dismiss their dialog');
  await first.invoke('first', tab.id, 'dialog.dismiss', []);
  assert.match((await first.invoke('first', tab.id, 'getAXState', [])).state, /测试工作台/);
});

test('simultaneous launches never adopt the other process debugging endpoint', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-launch-race-')), fixture = await startFixture();
  const hosts = [new BrowserHost(root), new BrowserHost(root)];
  t.after(async () => { await Promise.allSettled(hosts.map(host => host.close())); await fixture.close(); await rm(root, { recursive: true, force: true }); });
  const results = await Promise.allSettled(hosts.map((host, index) => host.create('owner-' + index, fixture.url)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, 'exactly one owner acquires the real browser profile');
  const index = results.findIndex(result => result.status === 'fulfilled');
  assert.match((await hosts[index].invoke('owner-' + index, results[index].value.id, 'getAXState', [])).state, /测试工作台/);
  assert.equal(hosts[1 - index].records.size, 0);
});

test('normal browser restart preserves the real profile website storage', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-profile-restart-')), fixture = await startFixture();
  const host = new BrowserHost(root), value = 'profile-' + crypto.randomUUID();
  t.after(async () => { await host.close(); await fixture.close(); await rm(root, { recursive: true, force: true }); });
  const tab = await host.create('test', fixture.url), record = await host.target('test', tab.id);
  await record.page.evaluate(value => localStorage.setItem('cu-profile', value), value);
  await record.page.context().addCookies([{ name: 'cu-profile', value, url: fixture.url, expires: Date.now() / 1000 + 3600 }]);
  const browser = await record.page.context().browser().newBrowserCDPSession();
  await browser.send('Browser.close').catch(() => {});
  await until(() => host.run.lost);
  const next = await host.create('test', fixture.url), restored = await host.target('test', next.id);
  assert.equal(await restored.page.evaluate(() => localStorage.getItem('cu-profile')), value);
  assert.equal((await restored.page.context().cookies(fixture.url)).find(cookie => cookie.name === 'cu-profile')?.value, value);
  assert.notEqual(next.id, tab.id);
});

test('browser crash clears the pane target and a user can open a fresh tab', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-pane-crash-')), fixture = await startFixture();
  const manager = new ComputerUseManager(root, { native: { binary: join(root, 'uninstalled') } });
  t.after(async () => { await manager.close(); await fixture.close(); await rm(root, { recursive: true, force: true }); });
  const tab = await manager.dispatch('test', 'createBrowserTab', ['browser', fixture.url]);
  const events = [], controller = new AbortController();
  const stopWatching = await manager.watchBrowser('test', tab.id, (type, value) => events.push({ type, value }), controller.signal);
  await until(() => events.some(event => event.type === 'frame'));
  const epoch = manager.status('test').controlEpoch;
  process.kill(manager.browser.browserPid ?? manager.browser.child.pid, 'SIGKILL');
  await until(() => manager.status('test').target === null);
  assert.equal(manager.status('test').lastError.code, 'BROWSER_DISCONNECTED');
  assert.ok(manager.status('test').controlEpoch > epoch);
  await assert.rejects(manager.dispatch('test', 'target', [tab, 'getAXState', []]), /closed|exited/i);
  assert.equal(manager.status('test').target, null, 'an old model object must not repopulate the pane with a dead target');
  controller.abort(); await stopWatching();
  await manager.changeUserTab('test', { action: 'new', url: fixture.url, controlEpoch: manager.status('test').controlEpoch });
  assert.ok(manager.status('test').target);
  assert.equal(manager.status('test').lastError, null);
  const recovered = manager.status('test').target.id;
  await assert.rejects(manager.dispatch('test', 'target', [tab, 'getAXState', []]), /closed|exited/i);
  assert.equal(manager.status('test').target.id, recovered, 'an old object must not replace the newly selected target');
});
