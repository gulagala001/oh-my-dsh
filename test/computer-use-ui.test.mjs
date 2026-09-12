import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { extensionSocketPath } from '../src/computer-use/extension-hub.mjs';
import { legacyBundle } from './fixtures/computer-use/native-runtime.mjs';
import { stopFixtureProcess } from './fixtures/process.mjs';

async function until(fn, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(50); }
  throw new Error('Timed out waiting for the Computer Use UI');
}

for (const backend of ['managed', 'extension']) test('DSH ' + backend + ' browser UI: takeover, navigation, tabs, references and themes', { timeout: 90000, skip: backend === 'extension' && process.platform === 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-ui-')), home = join(root, 'home'), workspace = join(root, 'workspace');
  await mkdir(home); await mkdir(workspace);
  const nativeBinary=process.platform==='darwin'?await legacyBundle(join(root,'native')):join(root,'missing-native');
  const fixture = await startFixture(); let toolSent = false, cursorSent = false, external, browserId = 'browser',fixtureTabId; const userMessages = [], userPayloads=[];
  const provider = createServer(async (req, res) => {
    let data = ''; for await (const chunk of req) data += chunk;
    const payload = JSON.parse(data);
    userPayloads.push(...(payload.messages??[]).filter(m=>m.role==='user'));
    userMessages.push(...(payload.messages ?? []).filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : (m.content ?? []).map(c => c.text ?? '').join('\n')));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    let delta = { role: 'assistant', content: 'Computer Use 界面验收' }, finish = 'stop';
    if (!toolSent && userMessages.includes('Computer Use 界面验收') && payload.tools?.some(t => t.function.name === 'computer_use')) {
      toolSent = true; finish = 'tool_calls';
      delta = { role: 'assistant', tool_calls: [{ index: 0, id: 'cu-ui-fixture', type: 'function', function: { name: 'computer_use', arguments: JSON.stringify({ title: '打开验收页面', code: `const tab=await cua.createBrowserTab(${JSON.stringify(browserId)},${JSON.stringify(fixture.url)}); await tab.markDeliverable(); await tab.content.export(); await tab.getAXStateAndScreenshot();` }) } }] };
    } else if (!cursorSent && userMessages.some(text => text === '助手光标验收')) {
      cursorSent = true; finish = 'tool_calls';
      delta = { role: 'assistant', tool_calls: [{ index: 0, id: 'cu-cursor-fixture', type: 'function', function: { name: 'computer_use', arguments: JSON.stringify({ title: '检查助手光标', code: `const cursorTab=await cua.getTab(${JSON.stringify(fixtureTabId)},{browser:${JSON.stringify(browserId)}});for(var cursorStep=0;cursorStep<6;cursorStep++){await cursorTab.playwright.getByLabel("姓名",{exact:true}).click(); await new Promise(r=>setTimeout(r,80));} await new Promise(r=>setTimeout(r,700));` }) } }] };
    }
    res.write('data: ' + JSON.stringify({ id: 'ui-fixture', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta, finish_reason: finish }] }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({
    'llm-pi-ai': { providers: { fixture: { api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'CU_UI_FIXTURE', models: [{ id: 'fixture', name: 'fixture', contextWindow: 1000000, maxTokens: 8192, input: ['text', 'image'] }, { id: 'text-fixture', name: '仅文本验收模型', contextWindow: 1000000, maxTokens: 8192, input: ['text'] }] } } },
    'agent-default-model': { provider: 'fixture', model: 'fixture' },
    'trisoul-x': { stateEnabled: false, probeEnabled: false, digestEvery: 1000, flushIdleMs: 3600000, computerUseChromeUserDataDir: join(root, 'external-profile'),computerUseNativeBinary:nativeBinary },
  }));
  await writeFile(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { CU_UI_FIXTURE: 'local-test-only' } }), { mode: 0o600 });
  const child = spawn(process.execPath, ['scripts/start.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, DSH_HOME: home, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '', browser, controlled, page, complete = false; const errors = [];
  child.stdout.on('data', data => { log = (log + data).slice(-15000); }); child.stderr.on('data', data => { log = (log + data).slice(-15000); });
  t.after(async () => {
    if (!complete && page && !page.isClosed()) {
      if (process.env.TRISOUL_CU_UI_ARTIFACTS) { await page.screenshot({ path: join(root, 'failure.png') }); console.log('Computer Use failed UI:', root); }
      console.log((await page.locator('body').innerText()).slice(-3000));
      console.log('UI errors:', errors);
      console.log('User wire shapes:',JSON.stringify(userPayloads.slice(-8).map(m=>typeof m.content==='string'?{text:m.content.slice(0,180)}:{types:m.content?.map(c=>c.type),text:m.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n').slice(0,400)})));
    }
    await browser?.close(); await controlled?.close();
    if (child.exitCode === null) {
      await stopFixtureProcess(child);
    }
    provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); await fixture.close();
    if (!process.env.TRISOUL_CU_UI_ARTIFACTS) await rm(root, { recursive: true, force: true });
  });
  const bootstrap = await until(() => {
    if (child.exitCode !== null) throw new Error(log.replace(/token=\S+/g, 'token=[redacted]'));
    return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];
  });
  const origin = new URL(bootstrap).origin, login = await fetch(bootstrap, { redirect: 'manual' });
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const rpc = async (method, request) => {
    const response = await fetch(origin + '/api/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } } }) });
    const value = await response.json(); assert.ok(value.result?.ok, JSON.stringify(value)); return value.result.value;
  };
  const registered = await rpc('workspace/create', { path: workspace });
  const { sessionId } = await rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: 'trisoul-x' });
  await fetch(origin + '/trisoul-x/api/better-todo?session=' + sessionId, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ todo: false, verification: false }) });
  const initialSetup = await (await fetch(origin + '/trisoul-x/computer-use/setup?session=' + sessionId, { headers: { cookie } })).json();
  assert.equal(initialSetup.extension?.installation?.browserProfile, join(root, 'external-profile'), 'resolve saved settings before any installer write');
  if (backend === 'extension') {
    const prepared = await (await fetch(origin + '/trisoul-x/computer-use/setup?session=' + sessionId, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ action: 'install-extension' }) })).json();
    assert.equal(prepared.extension?.installation?.prepared, true, JSON.stringify(prepared));
    external = await extensionFixture(t, { socketPath: extensionSocketPath(join(home, 'trisoul-x/computer-use')), fixture, profile: join(root, 'external-profile'), extensionPath: prepared.extension.installation.extensionPath, prepared: true }); browserId = external.browser.id;
  }
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '入口验收' }] });
  browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
  const context = await browser.newContext({ viewport: { width: 1480, height: 1000 }, colorScheme: 'light', locale: 'zh-CN' });
  await context.addInitScript(() => {
    const original = EventSource.prototype.addEventListener;
    EventSource.prototype.addEventListener = function(type, listener, options) {
      if (type !== 'navigation') return original.call(this, type, listener, options);
      return original.call(this, type, event => {
        const deliver = () => listener.call(this, event);
        if (JSON.parse(event.data).url === window.__cuDelayedNavigationUrl) (window.__cuDelayedNavigations ??= []).push(deliver);
        else deliver();
      }, options);
    };
  });
  await context.addCookies(cookie.split('; ').map(c => { const at = c.indexOf('='); return { name: c.slice(0, at), value: c.slice(at + 1), url: origin }; }));
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text().slice(0,2000)); });
  await page.goto(origin);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByText('Computer Use 界面验收', { exact: true }).first().click();
  // First-use entry must work before any Computer Use call or target exists.
  assert.equal(toolSent, false);
  const entry = page.getByRole('button', { name: '打开 Computer Use', exact: true });
  await entry.waitFor({ timeout: 3000 });
  await entry.click();
  await page.getByRole('heading', { name: '让助手操作应用和网页' }).waitFor();
  await entry.click();
  assert.equal(await page.locator('.tx-cu-pane').count(), 1, 'reopening the entry reuses the existing pane');
  // Window sharing uses the actual DSH draft/file admission path. Only the
  // native capture is stubbed here; its ownership and pixels are tested on macOS.
  const shareImage=await sharp({create:{width:20,height:16,channels:4,background:'#3877e8'}}).png().toBuffer();
  await page.route('**/trisoul-x/computer-use/share-windows?*',route=>route.fulfill({json:{windows:[{pid:123,window_id:456,process_identity:'fixture',app_id:'fixture',app_name:'窗口分享夹具',title:'测试窗口'}]}}));
  await page.route('**/trisoul-x/computer-use/share-window?*',route=>route.fulfill({json:{name:'窗口分享夹具',title:'测试窗口',screenshot:shareImage.toString('base64'),mediaType:'image/png',text:'窗口分享夹具可访问性文字\n只读快照'}}));
  const draft=page.locator('[contenteditable="true"]').first();await draft.fill('保留已有草稿');
  await page.getByRole('button',{name:'分享窗口',exact:true}).click();
  await page.locator('.tx-cu-share-list').getByRole('button',{name:/窗口分享夹具/}).click();
  await page.locator('.tx-cu-share-dialog:not(.tx-cu-annotation-dialog)').waitFor({state:'hidden'});
  assert.equal(await draft.innerText(),'保留已有草稿');
  await page.getByText('窗口分享夹具-窗口文字.txt',{exact:true}).waitFor();
  if(process.env.TRISOUL_CU_UI_ARTIFACTS)await page.screenshot({path:join(root,'window-share-draft.png')});
  await page.getByRole('button',{name:'发送消息',exact:true}).click();
  await until(()=>userMessages.some(text=>text.includes('保留已有草稿')&&text.includes('窗口分享夹具-窗口文字.txt')));
  await page.unroute('**/trisoul-x/computer-use/share-windows?*');await page.unroute('**/trisoul-x/computer-use/share-window?*');
  await rpc('session/selectModel',{sessionId,provider:'fixture',model:'text-fixture'});
  await page.locator('.tx-cu-chip').getByText('仅文本模型',{exact:true}).waitFor();
  await page.locator('.tx-cu-pane').getByText(/截图不会送入模型/).waitFor();
  await rpc('session/selectModel',{sessionId,provider:'fixture',model:'fixture'});
  await page.locator('.tx-cu-chip .tx-cu-vision-warning').waitFor({state:'hidden'});
  await page.getByRole('button', { name: '打开浏览器', exact: true }).click();
  await page.getByLabel('浏览器地址').waitFor();
  await page.getByRole('button', { name: '关闭当前标签页', exact: true }).click();
  await page.getByRole('heading', { name: '让助手操作应用和网页' }).waitFor();
  if (process.env.TRISOUL_CU_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'first-use-entry.png') });
  await page.getByRole('button', { name: '恢复助手控制', exact: true }).click();
  await page.locator('.tx-cu-pane').getByText('就绪', { exact: true }).waitFor();
  await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'Computer Use 界面验收' }] });
  await until(async () => { const state = await (await fetch(origin + '/trisoul-x/computer-use/state?session=' + sessionId, { headers: { cookie } })).json(); return state.previewAt && state.status === 'idle'; });
  if (external) controlled = { contexts: () => [external.context], close: async () => {} };
  else {
  const [port, endpoint] = (await readFile(join(home, 'trisoul-x/computer-use/browser-profile/DevToolsActivePort'), 'utf8')).trim().split('\n');
  controlled = await chromium.connectOverCDP(`ws://127.0.0.1:${port}${endpoint}`);
  controlled.contexts()[0].on('dialog', () => {});
  }
  const target = controlled.contexts()[0].pages().find(p => p.url().startsWith(fixture.url)); assert.ok(target);
  fixtureTabId=(await(await fetch(origin+'/trisoul-x/computer-use/state?session='+sessionId,{headers:{cookie}})).json()).target.id;
  // Playwright otherwise auto-dismisses dialogs on this independent observer.
  // Only the real pane is allowed to answer the fixture's prompt.
  target.on('dialog', () => {});
  let cdp = await target.context().newCDPSession(target);
  const checkSavedCard = async () => {
    await page.getByText(/^1\s*次工具调用$/).click();
    const group = page.locator('.tx-cu-group-toggle').first();
    await group.waitFor();
    assert.equal(await group.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('.tx-cu-card').count(), 0, 'closed groups do not mount individual tool cards');
    await group.click();
    const card = page.locator('.tx-cu-card'); await card.waitFor();
    await card.getByText('打开验收页面', { exact: true }).waitFor();
    await card.getByText('已执行', { exact: true }).waitFor();
    assert.equal(await card.locator('img').count(), 0, 'collapsed Computer Use calls must not mount screenshot images');
    assert.equal(await card.locator('.tx-cu-export-files').count(), 0, 'export files stay inside the collapsed result');
    await card.getByText('1 个文件', { exact: true }).waitFor();
    assert.ok((await card.boundingBox()).height <= 40, 'a collapsed call occupies a single compact row');
    const disclosure = card.getByRole('button', { name: /打开验收页面/ });
    assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
    await disclosure.click();
    assert.equal(await disclosure.getAttribute('aria-expanded'), 'true');
    const file = card.locator('.tx-cu-export-files button');
    assert.equal(await file.count(), 1); assert.equal(await file.isEnabled(), true);
    assert.match(await file.innerText(), /page\.mhtml/);
    const filePath = await file.getAttribute('title');
    assert.ok(filePath.startsWith(home), 'exports reopen their durable host attachment after reload');
    assert.match(await readFile(filePath, 'utf8'), /MIME-Version:/);
    await until(() => card.locator('img').evaluateAll(images => images.length === 1 && images[0].complete && images[0].naturalWidth > 0));
    await card.getByText('查看操作与结果', { exact: true }).click();
    assert.match(await card.innerText(), /createBrowserTab/);
    assert.match(await card.innerText(), /RootWebArea/);
    if (process.env.TRISOUL_CU_UI_ARTIFACTS) await card.screenshot({ path: join(root, 'saved-tool-card.png') });
    await card.getByText('查看操作与结果', { exact: true }).click();
    await disclosure.click();
    assert.equal(await card.locator('img').count(), 0, 'closing the call removes screenshots from the transcript');
  };
  await checkSavedCard();
  await page.reload();
  await checkSavedCard();
  await entry.click();
  const image = page.getByLabel('浏览器实时画面').locator('img'); await image.waitFor();
  // Open a real Document PiP window through a user gesture, not a mocked popup.
  await page.getByRole('button',{name:'悬浮预览',exact:true}).click();
  await page.getByLabel('悬浮操控预览').waitFor();
  assert.equal(await page.evaluate(()=>!!documentPictureInPicture.window),false,'the default preview lives in the conversation page');
  const inlinePreview=page.getByLabel('悬浮操控预览'),previewHeader=inlinePreview.locator('header');
  await until(()=>inlinePreview.evaluate(element=>!!element.style.width&&!!element.style.height));
  await previewHeader.evaluate(header=>header.addEventListener('pointerdown',event=>{const box=header.parentElement.getBoundingClientRect();window.__previewDragStart={x:event.clientX,y:event.clientY,box:{x:box.x,y:box.y,width:box.width,height:box.height}};},{once:true,capture:true}));
  const controlBefore=(await (await fetch(origin+'/trisoul-x/computer-use/state?session='+sessionId,{headers:{cookie}})).json());
  const viewWrites=[];const recordViewWrite=request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/trisoul-x/computer-use/'))viewWrites.push(new URL(request.url()).pathname);};
  page.on('request',recordViewWrite);
  await previewHeader.hover({position:{x:55,y:12}});await page.mouse.down();
  const dragStart=await page.evaluate(()=>window.__previewDragStart);assert.ok(dragStart,'pointerdown must reach the visible preview header');
  const beforeDrag=dragStart.box;
  await page.mouse.move(dragStart.x-100,dragStart.y-80,{steps:8});await page.mouse.up();
  await until(async()=>{const box=await inlinePreview.boundingBox();return Math.abs(box.x-beforeDrag.x+100)<2&&Math.abs(box.y-beforeDrag.y+80)<2;});
  const afterDrag=await inlinePreview.boundingBox();
  assert.ok(Math.abs(afterDrag.x-beforeDrag.x+100)<2&&Math.abs(afterDrag.y-beforeDrag.y+80)<2,'dragging the header moves the preview by the pointer delta: '+JSON.stringify({beforeDrag,dragStart,afterDrag}));
  await inlinePreview.locator('.tx-cu-preview-open').first().click();
  await until(async()=>await inlinePreview.evaluate(element=>element.classList.contains('is-zoomed')));
  const zoomBox=await inlinePreview.boundingBox();assert.ok(zoomBox.width>afterDrag.width&&zoomBox.height>afterDrag.height,'clicking the card enlarges the actual preview');
  const controlAfter=(await (await fetch(origin+'/trisoul-x/computer-use/state?session='+sessionId,{headers:{cookie}})).json());
  assert.equal(controlAfter.target.id,controlBefore.target.id);assert.equal(controlAfter.status,controlBefore.status);assert.equal(controlAfter.controlEpoch,controlBefore.controlEpoch);
  assert.deepEqual(viewWrites,[],'moving and enlarging are local read-only UI; they do not pause, reveal or change control');
  page.off('request',recordViewWrite);
  await page.setViewportSize({width:800,height:640});
  await until(async()=>{const box=await inlinePreview.boundingBox();return box.x>=11&&box.y>=11&&box.x+box.width<=789&&box.y+box.height<=629;});
  await page.setViewportSize({width:1480,height:1000});
  await inlinePreview.getByRole('button',{name:'缩小预览',exact:true}).click();
  await previewHeader.dblclick({position:{x:55,y:12}});
  await until(async()=>{const box=await inlinePreview.boundingBox(),input=await page.locator('[contenteditable="true"]').first().boundingBox();return Math.abs(box.x+box.width-input.x-input.width)<2&&box.y+box.height<input.y;});
  await page.getByRole('button',{name:'弹出预览',exact:true}).click();
  await until(()=>page.evaluate(()=>!!documentPictureInPicture.window?.document.querySelector('.tx-cu-floating img')?.naturalWidth));
  const pip=await until(()=>context.pages().find(p=>p!==page&&p.url()==='about:blank'));
  await pip.setViewportSize({width:480,height:360});
  await pip.getByLabel('悬浮操控预览').waitFor();
  await pip.locator('.tx-cu-live-overlay').waitFor({state:'hidden'});
  const pipImage=pip.locator('img');
  const pipGeometry=await pipImage.evaluate(img=>{const a=img.getBoundingClientRect(),b=img.parentElement.getBoundingClientRect();return {image:[a.width,a.height],surface:[b.width,b.height]};});
  assert.ok(pipGeometry.image.every((v,i)=>Math.abs(v-pipGeometry.surface[i])<1),'floating cursor coordinates cover only image pixels');
  if(process.env.TRISOUL_CU_UI_ARTIFACTS)await pip.screenshot({path:join(root,'floating-preview.png')});
  const floatingLight=await pip.locator('.tx-cu-floating').evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.emulateMedia({colorScheme:'dark'});
  await until(async()=>await pip.locator('.tx-cu-floating').evaluate(el=>getComputedStyle(el).backgroundColor)!==floatingLight);
  assert.equal(await pip.locator('.tx-cu-floating').evaluate(el=>getComputedStyle(el).backgroundColor),await page.locator('.tx-cu-pane').evaluate(el=>getComputedStyle(el).backgroundColor),'detached preview follows the host theme');
  if(process.env.TRISOUL_CU_UI_ARTIFACTS)await pip.screenshot({path:join(root,'floating-preview-dark.png')});
  await page.emulateMedia({colorScheme:'light'});
  await until(async()=>await pip.locator('.tx-cu-floating').evaluate(el=>getComputedStyle(el).backgroundColor)===floatingLight);
  const popupBefore=(await (await fetch(origin+'/trisoul-x/computer-use/state?session='+sessionId,{headers:{cookie}})).json());
  const popupWrites=[];const recordPopupWrite=request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/trisoul-x/computer-use/'))popupWrites.push(new URL(request.url()).pathname);};
  context.on('request',recordPopupWrite);
  await pip.locator('.tx-cu-preview-open').click();
  await pip.getByRole('button',{name:'缩小预览',exact:true}).waitFor();
  const popupAfter=(await (await fetch(origin+'/trisoul-x/computer-use/state?session='+sessionId,{headers:{cookie}})).json());
  assert.equal(popupAfter.target.id,popupBefore.target.id);assert.equal(popupAfter.status,popupBefore.status);assert.equal(popupAfter.controlEpoch,popupBefore.controlEpoch);assert.deepEqual(popupWrites,[]);
  context.off('request',recordPopupWrite);
  await pip.getByRole('button',{name:'缩小预览',exact:true}).click();
  await pip.getByRole('button',{name:'返回对话',exact:true}).click();
  await until(()=>pip.isClosed());
  assert.equal(target.isClosed(),false,'closing a preview preserves the actual browser tab');
  await page.getByRole('button',{name:'悬浮预览',exact:true}).waitFor();
  // Annotating a frozen preview must never send input to the controlled page.
  let annotationInputs=0;
  const countAnnotationInput=request=>{if(new URL(request.url()).pathname==='/trisoul-x/computer-use/input')annotationInputs++;};
  page.on('request',countAnnotationInput);
  await draft.fill('请调整这里');
  await page.evaluate(()=>{window.__cuAnnotationFiles=[];const OriginalFile=window.File;window.File=class extends OriginalFile{constructor(parts,name,options){super(parts,name,options);if(name.startsWith('网页批注.'))window.__cuAnnotationFiles.push(this);}};});
  const annotation=page.locator('.tx-cu-annotation-dialog'),frozen=annotation.getByAltText('待批注的冻结页面');
  const selectRegion=async()=>{
    await annotation.getByText('正在读取页面元素…',{exact:true}).waitFor({state:'hidden'});
    await until(()=>frozen.evaluate(img=>img.complete&&img.naturalWidth>0));
    const surface=await annotation.locator('.tx-cu-annotation-surface').boundingBox(),pixels=await frozen.boundingBox();
    assert.ok(Math.abs(surface.width-pixels.width)<1&&Math.abs(surface.height-pixels.height)<1,'selection overlay must exactly cover the displayed image');
    await page.mouse.move(surface.x+surface.width*.2,surface.y+surface.height*.2);await page.mouse.down();
    await page.mouse.move(surface.x+surface.width*.6,surface.y+surface.height*.55,{steps:4});await page.mouse.up();
  };
  await page.getByRole('button',{name:'批注页面',exact:true}).click();await selectRegion();
  // Cancel while PNG encoding is pending; its callback must not add stale files.
  await page.evaluate(()=>{window.__cuToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...args){window.__cuFinishAnnotation=()=>window.__cuToBlob.apply(this,args);};});
  await annotation.getByRole('button',{name:'加入输入框',exact:true}).click();
  await until(()=>page.evaluate(()=>!!window.__cuFinishAnnotation));
  await annotation.getByRole('button',{name:'取消',exact:true}).click();
  await page.evaluate(async()=>{HTMLCanvasElement.prototype.toBlob=window.__cuToBlob;window.__cuFinishAnnotation();await new Promise(resolve=>setTimeout(resolve,100));});
  assert.equal(await page.evaluate(()=>window.__cuAnnotationFiles.length),0,'cancelled encoding cannot create attachments');
  assert.equal(await draft.innerText(),'请调整这里');
  await page.getByRole('button',{name:'批注页面',exact:true}).click();await selectRegion();
  const frozenSource=await frozen.getAttribute('src');
  await target.evaluate(()=>{window.__cuOldBackground=document.body.style.background;document.body.style.background='rgb(225,230,240)';});
  await until(async()=>(await image.getAttribute('src'))!==frozenSource);
  assert.equal(await frozen.getAttribute('src'),frozenSource,'live updates do not replace the selected screenshot');
  await annotation.getByRole('textbox',{name:'批注说明'}).fill('把蓝框中的间距缩小');
  if(process.env.TRISOUL_CU_UI_ARTIFACTS)await annotation.screenshot({path:join(root,'page-annotation.png')});
  if(backend==='extension'){
    await page.emulateMedia({colorScheme:'dark'});
    if(process.env.TRISOUL_CU_UI_ARTIFACTS)await annotation.screenshot({path:join(root,'page-annotation-dark.png')});
    await page.setViewportSize({width:740,height:800});
    const bounds=await annotation.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=740,'annotation dialog fits a narrow window');
    assert.equal(await frozen.getAttribute('src'),frozenSource);
    assert.equal(await annotation.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'annotation has no horizontal overflow');
    const attachBounds=await annotation.getByRole('button',{name:'加入输入框',exact:true}).boundingBox();assert.ok(attachBounds.y+attachBounds.height<=bounds.y+bounds.height,'the narrow dialog keeps its primary action visible without scrolling');
    if(process.env.TRISOUL_CU_UI_ARTIFACTS)await annotation.screenshot({path:join(root,'page-annotation-narrow.png')});
    await page.setViewportSize({width:1480,height:1000});await page.emulateMedia({colorScheme:'light'});
  }
  await annotation.getByRole('button',{name:'加入输入框',exact:true}).click();await annotation.waitFor({state:'hidden'});
  assert.equal(await draft.innerText(),'请调整这里');
  await page.getByText('网页批注.txt',{exact:true}).waitFor();
  const annotationFiles=await page.evaluate(async()=>Promise.all(window.__cuAnnotationFiles.map(async f=>({name:f.name,bytes:Array.from(new Uint8Array(await f.arrayBuffer()))}))));
  assert.equal(annotationFiles.length,2);
  const annotationText=Buffer.from(annotationFiles.find(f=>f.name.endsWith('.txt')).bytes).toString();
  const annotationMetadata=JSON.parse(annotationText.slice(annotationText.indexOf('{'),annotationText.lastIndexOf('}')+1));
  assert.equal(annotationMetadata.url,fixture.url+'/');assert.equal(annotationMetadata.browser,browserId);assert.ok(annotationMetadata.id);
  assert.equal(annotationMetadata.comment,'把蓝框中的间距缩小');assert.ok(Number.isFinite(Date.parse(annotationMetadata.capturedAt)));
  const annotated=Buffer.from(annotationFiles.find(f=>f.name.endsWith('.png')).bytes),original=Buffer.from(frozenSource.split(',')[1],'base64');
  const originalSize=await sharp(original).metadata(),annotatedSize=await sharp(annotated).metadata();
  assert.deepEqual(annotationMetadata.image,{width:originalSize.width,height:originalSize.height});
  assert.equal(annotatedSize.width,originalSize.width);assert.equal(annotatedSize.height,originalSize.height);
  for(const [key,fraction]of Object.entries({x:.2,y:.2,width:.4,height:.35}))assert.ok(Math.abs(annotationMetadata.region[key]-fraction*originalSize[['x','width'].includes(key)?'width':'height'])<=3,'selection preserves source image coordinates: '+key);
  const r=annotationMetadata.region,blue=await sharp(annotated).extract({left:r.x+Math.floor(r.width/2),top:r.y,width:1,height:1}).removeAlpha().raw().toBuffer();
  assert.ok(blue[2]>190&&blue[0]<100,'saved image contains the actual blue annotation border');
  assert.match(annotationText,/不是当前网页操作坐标/);
  assert.equal(annotationInputs,0,'annotation drag and comment must not issue browser input');page.off('request',countAnnotationInput);
  await page.getByRole('button',{name:'发送消息',exact:true}).click();
  await until(()=>userPayloads.some(m=>{if(!Array.isArray(m.content))return false;const text=m.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');return text.includes('请调整这里')&&text.includes('网页批注.txt')&&m.content.some(c=>c.type==='image_url');}));
  await target.evaluate(()=>{document.body.style.background=window.__cuOldBackground;});
  // Select a real element using the frozen DOM snapshot, then send its identity
  // and styles through the same attachment path as region annotations.
  await draft.fill('请修改姓名输入框');await page.evaluate(()=>{window.__cuAnnotationFiles=[];});
  const capturedElements=page.waitForResponse(r=>new URL(r.url()).pathname==='/trisoul-x/computer-use/annotation');
  await page.getByRole('button',{name:'批注页面',exact:true}).click();
  const elementSnapshot=await(await capturedElements).json();assert.ok(elementSnapshot.elements?.length,JSON.stringify(elementSnapshot));
  await annotation.getByRole('button',{name:'选择元素',exact:true}).click();
  await frozen.evaluate(img=>img.decode());const frozenBox=await frozen.boundingBox(),fieldBox=await target.locator('#name').boundingBox(),geometry=elementSnapshot.frame.geometry;
  await page.mouse.click(frozenBox.x+(fieldBox.x+fieldBox.width/2-geometry.offsetX)/geometry.width*frozenBox.width,frozenBox.y+(fieldBox.y+fieldBox.height/2-geometry.offsetY)/geometry.height*frozenBox.height);
  await annotation.locator('.tx-cu-annotation-element strong').getByText('input#name',{exact:true}).waitFor();
  await annotation.getByRole('textbox',{name:'批注说明'}).fill('输入框再宽一点');
  if(process.env.TRISOUL_CU_UI_ARTIFACTS)await annotation.screenshot({path:join(root,'page-annotation-element.png')});
  const originalElementStyle=await target.locator('#name').getAttribute('style'),originalElementImage=await frozen.getAttribute('src');
  await annotation.getByText('调整样式',{exact:true}).click();
  await annotation.getByRole('textbox',{name:'预览宽度',exact:true}).fill('300px');
  await annotation.getByRole('textbox',{name:'预览背景颜色',exact:true}).fill('rgb(20, 100, 200)');
  await annotation.getByRole('button',{name:'预览样式',exact:true}).click();
  await annotation.getByText(/临时样式已恢复，当前显示预览图/).waitFor();
  await until(async()=>(await frozen.getAttribute('src'))!==originalElementImage);
  await frozen.evaluate(img=>img.decode());assert.equal(await target.locator('#name').getAttribute('style'),originalElementStyle,'UI preview restores the actual page before returning');
  if(process.env.TRISOUL_CU_UI_ARTIFACTS)await annotation.screenshot({path:join(root,'page-annotation-style.png')});
  const styleDialogBounds=await annotation.boundingBox(),styleSubmitBounds=await annotation.getByRole('button',{name:'加入输入框',exact:true}).boundingBox();assert.ok(styleSubmitBounds.y+styleSubmitBounds.height<=styleDialogBounds.y+styleDialogBounds.height,'style controls keep the submit action visible');
  await annotation.getByRole('button',{name:'加入输入框',exact:true}).click();await annotation.waitFor({state:'hidden'});
  const elementText=await page.evaluate(()=>window.__cuAnnotationFiles.find(file=>file.name.endsWith('.txt')).text());
  const elementMetadata=JSON.parse(elementText.slice(elementText.indexOf('{'),elementText.lastIndexOf('}')+1));
  assert.equal(elementMetadata.element.id,'name');assert.equal(elementMetadata.element.tag,'input');assert.ok(elementMetadata.element.styles['font-size']);assert.ok(elementMetadata.element.ancestry.some(e=>e.tag==='body'));
  assert.deepEqual(elementMetadata.stylePreview.changes,{width:'300px','background-color':'rgb(20, 100, 200)'});assert.equal(elementMetadata.stylePreview.restored.restored,true);assert.equal(elementMetadata.stylePreview.computedStyles['background-color'],'rgb(20, 100, 200)');
  assert.equal(await draft.innerText(),'请修改姓名输入框');assert.equal(await target.locator('#name').inputValue(),'');
  await page.getByRole('button',{name:'发送消息',exact:true}).click();await until(()=>userMessages.some(text=>text.includes('请修改姓名输入框')&&text.includes('网页批注.txt')));
  assert.ok(userMessages.some(text=>text.startsWith('[Computer Use runtime status]')&&text.includes('Variables and application/browser handles')),'the real DSH request announces reset bindings before the next model step');
  await page.getByRole('button',{name:'恢复助手控制',exact:true}).click();await page.locator('.tx-cu-pane').getByText('就绪',{exact:true}).waitFor();
  // The actual composer must also carry a child-frame identity and a polygon,
  // while the preview applies and restores styles inside that frame only.
  await target.locator('iframe[title="测试框架"]').scrollIntoViewIfNeeded();
  await draft.fill('请调整框架里的输入框');await page.evaluate(()=>{window.__cuAnnotationFiles=[];});
  const childCapture=page.waitForResponse(r=>new URL(r.url()).pathname==='/trisoul-x/computer-use/annotation');
  await page.getByRole('button',{name:'批注页面',exact:true}).click();const childSnapshot=await(await childCapture).json();
  const childElement=childSnapshot.elements?.find(e=>e.label==='框架输入'&&e.framePath.some(f=>f.title==='测试框架'));assert.ok(childElement,JSON.stringify({error:childSnapshot.error,geometry:childSnapshot.frame?.geometry,elements:childSnapshot.elements?.map(e=>({tag:e.tag,label:e.label,framePath:e.framePath}))}));
  await annotation.getByRole('button',{name:'选择元素',exact:true}).click();await frozen.evaluate(img=>img.decode());
  const childBox=await frozen.boundingBox(),childPoint=childElement.polygon.reduce((p,q)=>({x:p.x+q.x/childElement.polygon.length,y:p.y+q.y/childElement.polygon.length}),{x:0,y:0});
  await page.mouse.click(childBox.x+childPoint.x*childBox.width,childBox.y+childPoint.y*childBox.height);
  await annotation.locator('.tx-cu-annotation-frame').getByText(/测试框架/).waitFor();
  await annotation.getByText('调整样式',{exact:true}).click();await annotation.getByRole('textbox',{name:'预览宽度',exact:true}).fill('240px');await annotation.getByRole('button',{name:'预览样式',exact:true}).click();
  await annotation.getByText(/临时样式已恢复，当前显示预览图/).waitFor();await frozen.evaluate(img=>img.decode());
  assert.equal(await target.frameLocator('iframe[title="测试框架"]').getByLabel('框架输入',{exact:true}).getAttribute('style'),null);
  if(process.env.TRISOUL_CU_UI_ARTIFACTS)await annotation.screenshot({path:join(root,'page-annotation-child-frame.png')});
  await annotation.getByRole('button',{name:'加入输入框',exact:true}).click();await annotation.waitFor({state:'hidden'});
  const childText=await page.evaluate(()=>window.__cuAnnotationFiles.find(f=>f.name.endsWith('.txt')).text()),childMetadata=JSON.parse(childText.slice(childText.indexOf('{'),childText.lastIndexOf('}')+1));
  assert.equal(childMetadata.element.framePath[0].title,'测试框架');assert.equal(childMetadata.element.framePath[0].url,fixture.url+'/frame');assert.ok(childMetadata.polygon.length>=4);assert.equal(childMetadata.stylePreview.changes.width,'240px');
  await page.getByRole('button',{name:'发送消息',exact:true}).click();await until(()=>userMessages.some(text=>text.includes('请调整框架里的输入框')&&text.includes('网页批注.txt')));
  await page.getByRole('button',{name:'恢复助手控制',exact:true}).click();await page.locator('.tx-cu-pane').getByText('就绪',{exact:true}).waitFor();
  const childLiveImage=await image.getAttribute('src');await target.evaluate(()=>scrollTo(0,0));await until(async()=>(await image.getAttribute('src'))!==childLiveImage);
  // Only this observer reads the page. Every tested input goes through the
  // actual React pane, authenticated HTTP, manager, and separate browser.
  const point = async locator => {
    let rect = await locator.boundingBox(), box = await image.boundingBox();
    let { cssVisualViewport: viewport } = await cdp.send('Page.getLayoutMetrics');
    // A revealed Chrome window can screencast only the top of an emulated
    // viewport. The PNG/JPEG retains uniform pixel scale; its height is not
    // proof that it contains the full DOM viewport.
    const visibleHeight=()=>Math.min(viewport.clientHeight,box.height*viewport.clientWidth/box.width);
    if (rect.y < 0 || rect.y + rect.height > visibleHeight()) {
      const oldImage = await image.getAttribute('src');
      await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
      await page.mouse.wheel(0, rect.y + rect.height / 2 - visibleHeight() / 2);
      await until(async () => { const r = await locator.boundingBox(); return r.y >= 0 && r.y + r.height <= visibleHeight(); });
      await until(async () => (await image.getAttribute('src')) !== oldImage);
      rect = await locator.boundingBox(); box = await image.boundingBox();
      ({ cssVisualViewport: viewport } = await cdp.send('Page.getLayoutMetrics'));
    }
    return { x: box.x + (rect.x + rect.width / 2) * box.width / viewport.clientWidth, y: box.y + (rect.y + rect.height / 2) * box.width / viewport.clientWidth };
  };
  const click = async locator => { const p = await point(locator); await page.mouse.click(p.x, p.y); };
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '助手光标验收' }] });
  const assistantCursor = page.locator('.tx-cu-pane .tx-cu-assistant-cursor');
  if (backend === 'managed') {
    await assistantCursor.waitFor();
    // The arrow has a 35ms motion transition; visibility can precede arrival.
    // Keep the same sub-2px assertion and require convergence within 250ms.
    let tip, expectedTip;
    await until(async()=>{tip=await assistantCursor.boundingBox();expectedTip=await point(target.getByLabel('姓名',{exact:true}));return tip&&Math.abs(tip.x+2-expectedTip.x)<2&&Math.abs(tip.y+2-expectedTip.y)<2;},250);
    assert.ok(Math.abs(tip.x + 2 - expectedTip.x) < 2 && Math.abs(tip.y + 2 - expectedTip.y) < 2, 'the assistant arrow tip must match the actual control in the displayed image: '+JSON.stringify({tip,expectedTip}));
    assert.equal(await assistantCursor.evaluate(element => getComputedStyle(element).pointerEvents), 'none');
    await page.locator('.tx-cu-pane .tx-cu-cursor-pulse').waitFor();
  } else {
    await target.locator('[data-trisoul-cursor]').waitFor();
    assert.equal(await target.locator('[data-trisoul-cursor]').evaluate(element => getComputedStyle(element).pointerEvents), 'none');
    // The external browser paints its cursor into the real screencast. Check
    // those pixels, rather than adding a second DOM arrow just for this pane.
    let cursorDiagnostic=0;
    await until(async () => {
      const box = await image.boundingBox(), tip = await point(target.getByLabel('姓名', { exact: true }));
      const src = await image.getAttribute('src'), buffer = Buffer.from(src.split(',')[1], 'base64');
      const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const x = Math.round((tip.x - box.x) / box.width * info.width), y = Math.round((tip.y - box.y) / box.height * info.height);
      let dark = 0; for (let row = y; row < Math.min(y + 24, info.height); row++) for (let col = x; col < Math.min(x + 20, info.width); col++) { const at = (row * info.width + col) * info.channels; if (data[at] < 75 && data[at + 1] < 75 && data[at + 2] < 75) dark++; }
      if(dark<=20&&cursorDiagnostic++<3){await writeFile(join(root,'cursor-observed-'+cursorDiagnostic+'.png'),buffer);console.log('Cursor frame diagnostic',JSON.stringify({x,y,dark,frame:[info.width,info.height],box,tip,viewport:await target.evaluate(()=>({width:innerWidth,height:innerHeight,scrollY,visual:{width:visualViewport.width,height:visualViewport.height,pageY:visualViewport.pageTop}})),input:await target.getByLabel('姓名',{exact:true}).boundingBox()}));}
      return dark > 20;
    });
    assert.equal(await assistantCursor.count(), 0, 'the live frame must not show two assistant cursors');
  }
  if (process.env.TRISOUL_CU_UI_ARTIFACTS) await page.locator('.tx-cu-pane .tx-cu-live').screenshot({ path: join(root, 'cursor-light.png') });
  await click(target.getByLabel('姓名', { exact: true }));
  await assistantCursor.waitFor({ state: 'hidden', timeout: 1000 });
  if (backend === 'extension') await target.locator('[data-trisoul-cursor]').waitFor({ state: 'hidden' });
  await target.waitForFunction(() => document.activeElement.id === 'name');
  await page.keyboard.insertText('界面接管 中文 🧭');
  await target.waitForFunction(() => document.querySelector('#name').value === '界面接管 中文 🧭');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText('已全选替换');
  await target.waitForFunction(() => document.querySelector('#name').value === '已全选替换');
  // Move the browser viewport through the pane without scrolling the sidebar.
  const pane = page.locator('.tx-cu-pane'), before = await pane.evaluate(e => e.scrollTop);
  let box = await image.boundingBox();
  await page.mouse.move(box.x + box.width - 4, box.y + 20); await page.mouse.wheel(0, 260);
  await target.waitForFunction(() => scrollY > 0); await delay(150);
  assert.equal(await pane.evaluate(e => e.scrollTop), before);
  await click(target.getByRole('button', { name: '保存', exact: true }));
  await target.waitForFunction(() => fixtureEvents.at(-1)?.value?.name === '已全选替换');
  await click(target.getByRole('button', { name: '打开对话框', exact: true }));
  await page.getByLabel('网页提示输入').fill('真实界面弹窗');
  await page.locator('.tx-cu-dialog').getByRole('button', { name: '确定', exact: true }).click();
  await target.waitForFunction(() => fixtureEvents.at(-1)?.value === '真实界面弹窗');
  await page.getByRole('button', { name: '恢复助手控制', exact: true }).click();
  await page.locator('.tx-cu-chip').getByText('就绪', { exact: true }).waitFor({ timeout: 750 });
  const address = page.getByLabel('浏览器地址');
  await address.fill('javascript:document.title="must not run"'); await address.press('Enter');
  await page.getByRole('alert').waitFor(); await delay(1000);
  assert.match(await page.getByRole('alert').innerText(), /地址类型/);
  assert.notEqual(await target.title(), 'must not run');
  await address.fill(fixture.url + '/second'); await address.press('Enter');
  await until(() => target.url().endsWith('/second'));
  await page.getByRole('button', { name: '后退', exact: true }).click();
  await until(() => target.url() === fixture.url + '/');
  await page.getByRole('button', { name: '前进', exact: true }).click();
  await until(() => target.url().endsWith('/second'));
  await page.getByRole('button', { name: '重新加载页面', exact: true }).click();
  const originalTabId = await page.getByLabel('浏览器标签页').inputValue();
  await page.getByRole('button', { name: '新建标签页', exact: true }).click();
  const picker = page.getByLabel('浏览器标签页');
  await until(async () => (await picker.inputValue()) !== originalTabId);
  const newId = await picker.inputValue();
  await until(async () => (await picker.locator('option').evaluateAll(options => options.map(o => o.value))).includes(originalTabId));
  await picker.selectOption(originalTabId);
  await until(async () => (await picker.inputValue()) === originalTabId);
  await page.getByRole('button', { name: '关闭当前标签页', exact: true }).click();
  await until(async () => (await picker.inputValue()) === newId);
  assert.equal(target.isClosed(), true);
  // Delay a completed response to reproduce rapid typing while the previous
  // request is still in flight. The second Enter must not disappear.
  await page.evaluate(delayedUrl => {
    window.__cuDelayedNavigationUrl = delayedUrl;
    const original = window.fetch;
    window.__cuRestoreFetch = () => { window.fetch = original; delete window.__cuRestoreFetch; };
    window.fetch = async (...args) => {
      let delayed = false;
      if (typeof args[0] === 'string' && args[0].includes('/trisoul-x/computer-use/navigate?')) {
        try { delayed = JSON.parse(args[1]?.body ?? '{}').url === delayedUrl; } catch {}
      }
      let complete;
      if (delayed) window.__cuDelayDone = new Promise(resolve => { complete = resolve; });
      try { const response = await original.apply(window, args); if (delayed) await new Promise(resolve => setTimeout(resolve, 400)); return response; }
      finally { complete?.(); }
    };
  }, fixture.url + '/final');
  await address.fill(fixture.url + '/final'); await address.press('Enter');
  await until(() => controlled.contexts()[0].pages().some(p => p.url() === fixture.url + '/final'));
  const second = controlled.contexts()[0].pages().find(p => p.url() === fixture.url + '/final');
  cdp = await second.context().newCDPSession(second);
  await address.fill(fixture.url + '/mousedown-dialog'); await address.press('Enter');
  await until(() => second.url().endsWith('/mousedown-dialog'));
  await page.evaluate(async () => { await window.__cuDelayDone; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); window.__cuRestoreFetch(); delete window.__cuDelayDone; });
  assert.ok(await page.evaluate(() => (window.__cuDelayedNavigations ?? []).length), 'the fixture must really retain an old navigation observation');
  await page.evaluate(async () => { for (const deliver of window.__cuDelayedNavigations) deliver(); delete window.__cuDelayedNavigationUrl; delete window.__cuDelayedNavigations; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  assert.equal(await address.inputValue(), fixture.url + '/mousedown-dialog', 'the old completed response cannot overwrite the later address');
  await click(second.getByRole('button', { name: '打开对话框', exact: true }));
  await page.getByText('On down', { exact: true }).waitFor();
  await page.getByLabel('网页提示输入').fill('鼠标已释放');
  await page.locator('.tx-cu-dialog').getByRole('button', { name: '确定', exact: true }).click();
  await second.waitForFunction(() => fixtureEvents.at(-1)?.value === '鼠标已释放');
  await page.locator('.tx-cu-dialog').waitFor({ state: 'detached' });
  const moves = await second.evaluate(() => fixtureMoveCount); box = await image.boundingBox();
  await page.mouse.move(box.x + box.width - 5, box.y + 15);
  await second.waitForFunction(previous => fixtureMoveCount > previous && fixtureLastButtons === 0, moves);
  await address.fill(fixture.url + '/slow-navigation?replace'); await address.press('Enter');
  await until(() => fixture.navigationRequests.at(-1)?.state === 'started');
  await address.fill(fixture.url + '/interrupted'); await address.press('Enter');
  await until(() => second.url().endsWith('/interrupted'));
  assert.equal(fixture.navigationRequests.at(-1).state, 'cancelled', 'the new URL cancels the old request instead of waiting for it to finish');
  // The real rich-text reference must reach a model request with its identity.
  const composer = page.locator('[contenteditable="true"]').first();
  await composer.pressSequentially(external ? '@Chrome' : '@Browser');
  await page.getByText(external ? '浏览器 · Chrome' : '内置浏览器 · 独立工作配置', { exact: true }).click();
  await composer.press('Enter');
  await until(() => userMessages.some(text => text.includes('<computer-use-target>') && text.includes('"kind":"browser"') && text.includes('"id":' + JSON.stringify(browserId))));
  await page.locator('[data-computer-use-reference="browser"]').getByText(external ? 'Chrome' : 'Browser', { exact: true }).waitFor();
  assert.equal((await page.locator('.tx-cu-user-message').innerText()).includes('<computer-use-target>'), false);
  // Exercise the actual pane recovery when its browser process ends. This
  // connection is only an observer; the new browser is opened by the real UI.
  if (external) {
    await external.popup.locator('.tab').filter({ hasText: await second.title() }).getByRole('button', { name: '停止', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Control ended' }).waitFor();
    const existing = page.getByLabel('选择已有标签页');
    await until(async () => (await existing.locator('option').allTextContents()).includes(await second.title()));
    await existing.selectOption({ label: await second.title() });
    await page.getByLabel('浏览器实时画面').locator('img').waitFor();
    assert.equal(second.isClosed(), false);
    assert.equal(await page.getByRole('alert').count(), 0);
  } else {
  const endingBrowser = await controlled.newBrowserCDPSession();
  await endingBrowser.send('Browser.close').catch(() => {});
  await page.getByRole('alert').filter({ hasText: '浏览器已退出' }).waitFor();
  await page.getByRole('button', { name: '打开浏览器', exact: true }).click();
  await page.getByLabel('浏览器地址').fill(fixture.url);
  await page.getByLabel('浏览器地址').press('Enter');
  await page.getByLabel('浏览器实时画面').locator('img').waitFor();
  const [newPort, newEndpoint] = (await readFile(join(home, 'trisoul-x/computer-use/browser-profile/DevToolsActivePort'), 'utf8')).trim().split('\n');
  controlled = await chromium.connectOverCDP(`ws://127.0.0.1:${newPort}${newEndpoint}`);
  controlled.contexts()[0].on('dialog', () => {});
  await until(() => controlled.contexts()[0].pages().some(tab => tab.url().startsWith(fixture.url)));
  assert.equal(await page.getByRole('alert').count(), 0, 'opening a new target clears the browser-exit error');
  }
  await page.getByRole('button', { name: '运行环境与权限' }).click();
  await page.locator('.tx-cu-setup-row').filter({ hasText: '内置浏览器' }).getByText('已安装', { exact: true }).waitFor();
  const setup = await (await fetch(origin + '/trisoul-x/computer-use/setup?session=' + sessionId, { headers: { cookie } })).json();
  if (external) {
    await page.locator('.tx-cu-setup-row').filter({ hasText: 'Chrome 扩展' }).getByText('已连接', { exact: true }).waitFor();
    assert.equal(setup.extension.installation.prepared, true); assert.equal(setup.extension.installation.reloadRequired, false);
    await page.getByText('Chrome 连接详情', { exact: true }).click();
    await page.getByRole('button', { name: '检查并修复连接程序', exact: true }).click();
    await page.getByRole('button', { name: '检查并修复连接程序', exact: true }).waitFor();
  } else {
    await page.getByRole('button', { name: '准备 Chrome 连接', exact: true }).click();
    await page.getByText('连接程序已就绪', { exact: true }).waitFor();
    await page.getByRole('button', { name: '复制扩展目录', exact: true }).waitFor();
    const prepared = await (await fetch(origin + '/trisoul-x/computer-use/setup?session=' + sessionId, { headers: { cookie } })).json();
    assert.equal(prepared.extension.installation.prepared, true);
    const manifest = JSON.parse(await readFile(prepared.extension.installation.registrationPath, 'utf8'));
    assert.equal(manifest.name, 'ai.trisoul.computer_use');
    if (process.env.TRISOUL_CU_UI_ARTIFACTS) await page.locator('.tx-cu-setup').screenshot({ path: join(root, 'chrome-setup.png') });
  }
  if (setup.native.installed) {
    assert.equal(setup.native.updateAvailable,true);assert.equal(setup.native.version,'0.1.0');
    const beforeUpdate=await(await fetch(origin+'/trisoul-x/computer-use/state?session='+sessionId,{headers:{cookie}})).json();
    await page.getByRole('button',{name:'更新桌面控制',exact:true}).waitFor();
    if(process.env.TRISOUL_CU_UI_ARTIFACTS)await page.locator('.tx-cu-setup').screenshot({path:join(root,'native-update-before.png')});
    const updateResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/trisoul-x/computer-use/setup'&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='install-native');
    await page.getByRole('button',{name:'更新桌面控制',exact:true}).click();
    const completedUpdate=await updateResponse;assert.equal(completedUpdate.status(),200,JSON.stringify(await completedUpdate.json()));
    await page.getByRole('button',{name:'正在更新桌面控制…',exact:true}).waitFor({state:'hidden'});
    const updated=await(await fetch(origin+'/trisoul-x/computer-use/setup?session='+sessionId,{headers:{cookie}})).json();
    assert.equal(updated.native.version,'0.1.1');assert.equal(updated.native.updateAvailable,false);assert.equal(updated.native.restartRequired,false);
    const afterUpdate=await(await fetch(origin+'/trisoul-x/computer-use/state?session='+sessionId,{headers:{cookie}})).json();
    assert.equal(afterUpdate.target.id,beforeUpdate.target.id,'native upgrade preserves the unrelated browser target');
    assert.equal(afterUpdate.status,beforeUpdate.status);
    if(process.env.TRISOUL_CU_UI_ARTIFACTS)await page.locator('.tx-cu-setup').screenshot({path:join(root,'native-update-after.png')});
    await page.getByRole('button', { name: '打开权限设置', exact: true }).waitFor();
    assert.equal(await page.locator('.tx-cu-setup-row').filter({ hasText: '辅助功能' }).count(), 1);
    assert.equal(await page.locator('.tx-cu-setup-row').filter({ hasText: '屏幕录制' }).count(), 1);
    if (setup.native.accessibility && setup.native.screenRecording) assert.equal(await page.locator('.tx-cu-setup-row').getByText('已开启', { exact: true }).count(), 2);
  }
  assert.equal(await page.locator('[role=alert]').count(), 0);
  assert.deepEqual(errors, []);
  const lightBackground = await page.locator('.tx-cu-pane').evaluate(element => getComputedStyle(element).backgroundColor);
  if (process.env.TRISOUL_CU_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'pane-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await until(async () => (await page.locator('.tx-cu-pane').evaluate(element => getComputedStyle(element).backgroundColor)) !== lightBackground);
  if (process.env.TRISOUL_CU_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'pane-dark.png') });
  await page.setViewportSize({ width: 1060, height: 900 });
  await until(async () => (await page.locator('[contenteditable="true"]').first().boundingBox())?.width >= 220, 2000);
  const overflow = await page.locator('.tx-cu-pane').evaluate(element => element.scrollWidth > element.clientWidth);
  assert.equal(overflow, false, 'the narrow pane must not hide controls in horizontal overflow');
  if (process.env.TRISOUL_CU_UI_ARTIFACTS) { await page.screenshot({ path: join(root, 'pane-narrow.png') }); console.log('Computer Use UI artifacts:', root); }
  await page.getByRole('button',{name:'悬浮预览',exact:true}).click();
  await page.getByLabel('悬浮操控预览').waitFor();
  assert.equal(await page.evaluate(()=>!!documentPictureInPicture.window),false,'the default preview lives in the conversation page');
  await page.getByRole('button',{name:'弹出预览',exact:true}).click();
  await until(()=>page.evaluate(()=>!!documentPictureInPicture.window?.document.querySelector('img')?.naturalWidth));
  const stopPip=await until(()=>context.pages().find(p=>p!==page&&p.url()==='about:blank'));
  const retainedPages=controlled.contexts()[0].pages().filter(p=>!p.isClosed());assert.ok(retainedPages.length);
  const stoppedBefore=await (await fetch(origin+'/trisoul-x/computer-use/state?session='+sessionId,{headers:{cookie}})).json();
  if(stoppedBefore.status==='stopped')await page.getByRole('button',{name:'恢复助手控制',exact:true}).click();
  await stopPip.getByRole('button',{name:'停止操作',exact:true}).click();
  await stopPip.getByText('已停止 · 可手动操作',{exact:true}).waitFor();
  assert.equal((await (await fetch(origin+'/trisoul-x/computer-use/state?session='+sessionId,{headers:{cookie}})).json()).status,'stopped');
  assert.equal(await stopPip.locator('.tx-cu-assistant-cursor').count(),0);
  assert.ok(retainedPages.every(p=>!p.isClosed()),'stopping from the preview preserves the currently open browser tabs');
  await page.reload();await until(()=>stopPip.isClosed());
  assert.deepEqual(errors,[]);
  complete = true;
});
