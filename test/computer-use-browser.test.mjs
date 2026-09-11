import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';

test('browser shutdown terminates its process even when input cleanup fails', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'trisoul-cu-shutdown-'));
  const host = new BrowserHost(join(directory, 'profile'));
  t.after(async () => { await host.close().catch(() => {}); await rm(directory, { recursive: true, force: true }); });
  const tab = await host.create('test'), record = await host.target('test', tab.id);
  await record.page.mouse.down(); record.heldButtons.add('left');
  host.releaseInput = async () => { throw new Error('simulated transport failure'); };
  await assert.rejects(host.close(), /simulated transport failure/);
  assert.ok(host.child.exitCode !== null || host.child.signalCode !== null, 'the managed browser cannot remain running after unload');
});

test('browser shutdown kills forked launch helpers that ignore SIGTERM', { skip: process.platform === 'win32', timeout: 15000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'trisoul-cu-process-tree-')), executablePath = join(directory, 'launcher.mjs');
  await writeFile(executablePath, `#!/usr/bin/env node\nimport {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const dir=process.argv.find(a=>a.startsWith('--user-data-dir=')).slice(16);const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)"],{stdio:['ignore','ignore','inherit','ipc']});child.on('message',()=>writeFileSync(dir+'/descendant',String(child.pid)));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);\n`);
  await chmod(executablePath, 0o700);
  const host = new BrowserHost(join(directory, 'profile'), { executablePath });
  t.after(async () => { await host.close(); await rm(directory, { recursive: true, force: true }); });
  const starting = host.start(), stopped = assert.rejects(starting, /shutting down/);
  let descendant;
  const readyBy = Date.now() + 8000;
  while (Date.now() < readyBy && !descendant) { try { descendant = Number(await readFile(join(directory, 'profile/descendant'), 'utf8')); } catch { await delay(20); } }
  assert.ok(descendant, 'the real forked helper started');
  await host.close(); await stopped;
  assert.throws(() => process.kill(descendant, 0), error => error.code === 'ESRCH');
});

test('browser: exact observed objects, frames, forms, files and cancellation', { timeout: 90000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'trisoul-cu-browser-'));
  const fixture = await startFixture(), host = new BrowserHost(join(directory, 'profile'));
  t.after(async () => { await host.close(); await fixture.close(); await rm(directory, { recursive: true, force: true }); });
  const session = 'fixture', tab = await host.create(session, fixture.url), id = tab.id;
  const call = (method,...args) => host.invoke(session,id,method,args);
  const locator = (chain,action,...args) => call('locator',chain,action,args);
  const role = (name) => [{method:'getByRole',args:['button',{name,exact:true}]}];
  let state = (await call('getAXState')).state;
  const element = (role,name) => { const line = state.split('\n').find(l=>l.includes(`${role} ${JSON.stringify(name)}`)); assert.ok(line,`${role}: ${name}\n${state}`);return Number(line.trim().split(' ')[0]); };

  await t.test('AX includes non-interactive result text and exact frame identities', async () => {
    assert.match(state,/尚未保存/);
    assert.ok(state.indexOf('textbox "姓名"') < state.indexOf('Iframe "测试框架"'), 'main form must not appear nested beneath the iframe in the rendered tree');
    assert.ok(state.indexOf('checkbox "启用通知"') > state.indexOf('textbox "备注"'), 'tree siblings must follow depth-first DOM/AX order');
    const input=element('textbox','框架输入'); await call('setValue',input,'iframe 中文');
    assert.equal(await locator([{method:'frameLocator',args:['iframe']},{method:'getByLabel',args:['框架输入']}],'inputValue'),'iframe 中文');
    await call('click',element('button','Shadow 按钮'));
    assert.equal(await call('evaluate','window.fixtureEvents.at(-1).type'),'shadow');
  });
  await t.test('Chinese multiline form and exact Save targeting', async () => {
    await call('setValue',element('textbox','姓名'),'中文输入测试 42');
    await call('setValue',element('textbox','备注'),'第一行\n第二行');
    await call('click',element('checkbox','启用通知'));
    await call('setValue',element('combobox','语言'),'en');
    await call('click',element('button','保存'));
    assert.deepEqual(await call('evaluate','window.fixtureEvents.at(-1)'),{type:'save',value:{name:'中文输入测试 42',note:'第一行\n第二行',checked:true,language:'en'},at:await call('evaluate','window.fixtureEvents.at(-1).at')});
    const change=(await call('getAXState')).state; assert.match(change,/save/);assert.match(change,/^[~+] /m);
  });
  await t.test('ambiguous selectors refuse, removed nodes and old documents never retarget', async () => {
    await assert.rejects(locator(role('重复按钮'),'click'),/strict mode violation/);
    state=(await call('getAXState',{disableDiffing:true})).state;
    const old=element('button','原控件'); await call('click',element('button','替换控件'));
    await assert.rejects(call('click',old),/old or detached page/);
    assert.notEqual(await call('evaluate','window.fixtureEvents.at(-1).type'),'replacement');
    const save=element('button','保存'); await call('reload');
    await assert.rejects(call('click',save),/old or detached page/);
  });
  await t.test('Playwright waits for a delayed control and scrolls nested containers', async () => {
    await locator(role('延迟出现'),'click'); await locator(role('延迟按钮'),'click');
    assert.equal(await call('evaluate','window.fixtureEvents.at(-1).type'),'delayed');
    await locator(role('底部按钮'),'click');assert.equal(await call('evaluate','window.fixtureEvents.at(-1).type'),'bottom');
  });
  await t.test('JavaScript dialog returns control to the model and resumes after answer', async () => {
    const r=await locator(role('打开对话框'),'click');assert.equal(r.dialog.type,'prompt');
    assert.equal((await call('dialog.get')).message,'测试输入');
    await call('dialog.accept','对话框中文');assert.equal(await call('evaluate','window.fixtureEvents.at(-1).value'),'对话框中文');
  });
  await t.test('uploads and downloads carry real bytes', async () => {
    const upload=join(directory,'upload.txt');await writeFile(upload,'中文文件内容');
    await locator([{method:'getByLabel',args:['上传测试文件']}],'setInputFiles',upload);
    assert.deepEqual(await call('evaluate','window.fixtureEvents.at(-1).value'),[{name:'upload.txt',size:18}]);
    await locator([{method:'getByRole',args:['link',{name:'下载测试文件'}]}],'click');
    let downloads=[];for(let i=0;i<30&&!downloads.length;i++){downloads=await call('downloads.list');if(!downloads.length)await delay(50);}
    assert.equal(downloads.length,1);const out=join(directory,'download.txt');await call('downloads.save',downloads[0].id,out);
    assert.equal(await readFile(out,'utf8'),'TRISOUL_COMPUTER_USE_FIXTURE\n');
  });
  await t.test('screenshots are actual PNG bytes and consistent with the observed document', async () => {
    const result=await call('getAXStateAndScreenshot');const bytes=Buffer.from(result.screenshot,'base64');
    assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.ok(bytes.length>10000);assert.match(result.state,/测试工作台/);
  });
  await t.test('a waiting action cannot execute after stop; page survives disconnect', async () => {
    const c=new AbortController();
    const pending=host.invoke(session,id,'locator',[[{method:'getByRole',args:['button',{name:'取消后不应点击'}]}],'click',[]],c.signal);
    await delay(150);const start=performance.now();c.abort(new Error('User stopped'));
    await assert.rejects(pending);assert.ok(performance.now()-start<1500);
    // The exact delayed control appears after cancellation. Its event handler
    // must never fire, including after reconnecting to the preserved page.
    await call('evaluate',`(()=>{const b=document.createElement('button');b.textContent='取消后不应点击';b.onclick=()=>window.fixtureEvents.push({type:'CANCEL_FAILED'});document.body.append(b)})()`);
    await delay(400);
    assert.equal(await call('evaluate',`window.fixtureEvents.some(e=>e.type==='CANCEL_FAILED')`),false);
    assert.equal((await host.list(session)).some(t=>t.id===id),true);
  });
  await t.test('ownership is exclusive and deliverable tabs survive turn cleanup', async () => {
    await assert.rejects(host.invoke('other',id,'getAXState'),/another conversation/);
    await call('markDeliverable');await host.endTurn(session);
    assert.equal((await host.list('other')).some(t=>t.id===id),true);
    await host.invoke('other',id,'getAXState');await host.endTurn('other');
    const temp=await host.create(session,fixture.url);await host.endTurn(session);
    assert.equal((await host.list(session)).some(t=>t.id===temp.id),false);
  });
});
