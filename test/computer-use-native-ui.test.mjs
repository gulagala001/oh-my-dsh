import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {keyboardFixture} from './fixtures/computer-use/keyboard.mjs';

const nativeBinary=process.env.TRISOUL_CU_NATIVE_BINARY??join(homedir(),'Applications/Trisoul Computer Use.app/Contents/MacOS/trisoul-computer-use');
test('DSH native UI: live window, stable stream between turns, cursor and stopped observation',{skip:process.platform!=='darwin'||!process.env.TRISOUL_CU_NATIVE_SOCKET,timeout:60000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'trisoul-cu-native-ui-')),home=join(root,'home'),workspace=join(root,'workspace'),app=join(root,'Fixture.app'),report=join(root,'truth.json'),command=join(root,'command.json'),bundle='ai.trisoul.nativeui.'+process.pid;
  const until=async(fn)=>{const deadline=Date.now()+12000;while(Date.now()<deadline){const value=await fn();if(value)return value;await delay(30);}throw Error('Native UI did not reach the expected state');};
  await mkdir(home);await mkdir(workspace);await mkdir(join(app,'Contents/MacOS'),{recursive:true});
  execFileSync('clang',['-fobjc-arc','-framework','Cocoa',new URL('./fixtures/computer-use/NativeFixture.m',import.meta.url).pathname,'-o',join(app,'Contents/MacOS/Fixture')]);
  await writeFile(join(app,'Contents/Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundle}</string><key>CFBundleName</key><string>Trisoul UI Fixture</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  execFileSync('open',['-n','-g',app,'--args','--report',report,'--command',command]);
  const pid=await until(async()=>{try{return JSON.parse(await readFile(report,'utf8')).pid;}catch{}});
  const second=await keyboardFixture();t.after(()=>second.close());
  let sent=false,cursorSent=false,secondSent=false;const requestKinds=[];
  const provider=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);let delta={role:'assistant',content:'原生画面验收'},finish='stop';
    const text=(input.messages??[]).filter(message=>message.role==='user').map(message=>typeof message.content==='string'?message.content:(message.content??[]).map(part=>part.text??'').join('\n')).join('\n');
    let code;
    const hasComputerTool=input.tools?.some(tool=>tool.function?.name==='computer_use');requestKinds.push({hasComputerTool:!!hasComputerTool,text:text.slice(-100)});
    if(hasComputerTool&&!sent){sent=true;code=`const app=await cua.getApp(${JSON.stringify(bundle)});await app.getScreenshot();`;}
    else if(hasComputerTool&&!secondSent&&text.includes('第二个预览')){secondSent=true;code=`const secondApp=await cua.getApp(${JSON.stringify(second.bundle)});await secondApp.getScreenshot();`;}
    else if(hasComputerTool&&!cursorSent&&text.includes('助手光标验收')){cursorSent=true;code=`const current=await cua.getApp(${JSON.stringify(bundle)});const ax=await current.getAXState({emit:false,disableDiffing:true});const name=Number(ax.match(/\\[(\\d+)\\] AXTextField 姓名/)[1]);for(let i=0;i<15;i++){await current.click(name);await new Promise(r=>setTimeout(r,80));}await new Promise(r=>setTimeout(r,800));`;}
    if(code){finish='tool_calls';delta={role:'assistant',tool_calls:[{index:0,id:crypto.randomUUID(),type:'function',function:{name:'computer_use',arguments:JSON.stringify({code,title:cursorSent?'助手光标验收':'选择原生测试窗口'})}}]};}
    res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: '+JSON.stringify({id:crypto.randomUUID(),object:'chat.completion.chunk',model:'fixture',choices:[{index:0,delta,finish_reason:finish}]})+'\n\ndata: [DONE]\n\n');
  });
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
  await writeFile(join(home,'settings.yaml'),JSON.stringify({'llm-pi-ai':{providers:{fixture:{api:'openai-completions',baseURL:`http://127.0.0.1:${provider.address().port}/v1`,apiKeyEnv:'CU_NATIVE_UI',models:[{id:'fixture',name:'fixture',contextWindow:1000000,maxTokens:8192,input:['text','image']}]}}},'agent-default-model':{provider:'fixture',model:'fixture'},'trisoul-x':{stateEnabled:false,probeEnabled:false,digestEvery:1000,flushIdleMs:3600000,computerUseNativeBinary:nativeBinary,computerUseNativeSocket:process.env.TRISOUL_CU_NATIVE_SOCKET}}));
  await writeFile(join(home,'.credentials.yaml'),JSON.stringify({version:1,refs:{CU_NATIVE_UI:'local-test-only'}}),{mode:0o600});
  const child=spawn(process.execPath,['scripts/start.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,DSH_HOME:home,PORT:'0'},stdio:['ignore','pipe','pipe']});let log='',browser,page,complete=false;const errors=[];
  child.stdout.on('data',data=>{log=(log+data).slice(-20000);});child.stderr.on('data',data=>{log=(log+data).slice(-20000);});
  t.after(async()=>{
    if(!complete&&page&&!page.isClosed()){await page.screenshot({path:join(root,'failure.png')});console.log('Native UI text:',(await page.locator('body').innerText()).slice(-2500));}
    await browser?.close();if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(5000)]);if(child.exitCode===null)child.kill('SIGKILL');}
    provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve));try{process.kill(pid,'SIGTERM');}catch{}console.log('Native UI artifacts:',root);
  });
  const bootstrap=await until(()=>log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0]);
  const origin=new URL(bootstrap).origin,login=await fetch(bootstrap,{redirect:'manual'}),cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const rpc=async(method,request)=>{const r=await fetch(origin+'/api/'+method,{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args:{request}}})});const value=await r.json();assert.ok(value.result?.ok,JSON.stringify(value));return value.result.value;};
  const registered=await rpc('workspace/create',{path:workspace}),{sessionId}=await rpc('session/create',{workspaceId:registered.workspace.workspaceId,agentPreset:'trisoul-x'});
  await fetch(origin+'/trisoul-x/api/better-todo?session='+sessionId,{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({todo:false,verification:false})});
  const prompt=text=>rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text}]});
  const state=async()=>await(await fetch(origin+'/trisoul-x/computer-use/state?session='+sessionId,{headers:{cookie}})).json();
  await prompt('原生画面验收');await until(async()=>{const value=await state();return value.previewAt&&value.status==='idle';}).catch(async error=>{console.log('Native initial state:',JSON.stringify(await state()));console.log('Native fixture requests:',JSON.stringify(requestKinds));throw error;});
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light',locale:'zh-CN'});
  await context.addCookies(cookie.split('; ').map(value=>{const at=value.indexOf('=');return{name:value.slice(0,at),value:value.slice(at+1),url:origin};}));
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);
  await page.getByRole('button',{name:'继续',exact:true}).click();await page.getByText('原生画面验收',{exact:true}).first().click();
  await page.getByLabel('悬浮操控预览').locator('img').waitFor();
  await page.screenshot({path:join(root,'conversation-preview-auto.png')});
  await page.getByRole('button',{name:'打开 Computer Use',exact:true}).click();
  const pane=page.locator('.tx-cu-pane').getByLabel('应用实时画面'),image=pane.getByAltText('当前应用窗口的实时画面');
  await image.waitFor();await until(async()=>image.evaluate(image=>image.complete&&image.naturalWidth>0));
  assert.match(await pane.innerText(),/实时画面/);const before=await image.getAttribute('src'),target=(await state()).target;
  await writeFile(command,JSON.stringify({id:'live-ui',action:'text',value:'原生界面实时更新'}));await until(async()=>await image.getAttribute('src')!==before);
  await page.screenshot({path:join(root,'native-live-light.png')});
  await page.getByRole('button',{name:'悬浮预览',exact:true}).click();
  await page.getByLabel('悬浮操控预览').waitFor();
  assert.equal(await page.evaluate(()=>!!documentPictureInPicture.window),false,'the default preview lives in the conversation page');
  await page.getByRole('button',{name:'弹出预览',exact:true}).click();
  const pip=await until(()=>context.pages().find(p=>p!==page&&p.url()==='about:blank'));
  await pip.setViewportSize({width:480,height:360});
  const floating=pip.getByLabel('悬浮操控预览');await floating.locator('img').waitFor();
  await until(()=>floating.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0));
  await prompt('第二个预览');await until(async()=>await floating.locator('.tx-cu-preview-card').count()===2);
  const originalCard=floating.locator('.tx-cu-preview-card').filter({has:pip.getByRole('button',{name:'进入窗口：Trisoul UI Fixture',exact:true})});
  const secondCard=floating.locator('.tx-cu-preview-card').filter({has:pip.getByRole('button',{name:'进入窗口：Trisoul Keyboard Fixture',exact:true})});
  await until(()=>secondCard.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0));
  await pip.screenshot({path:join(root,'native-floating-stack.png')});
  await floating.getByRole('button',{name:'展开 2',exact:true}).click();
  await originalCard.getByRole('button').click();
  await until(async()=>JSON.parse(await readFile(report,'utf8')).frontmostPid===pid);
  await secondCard.getByRole('button').click();await until(async()=>(await second.command('sample')).frontmostPid===second.pid);
  await floating.getByRole('button',{name:'堆叠 2',exact:true}).click();
  await prompt('助手光标验收');await pane.locator('.tx-cu-assistant-cursor').waitFor({timeout:12000});assert.equal((await state()).target.viewId,target.viewId);
  await floating.locator('.tx-cu-assistant-cursor').waitFor();
  const pixels=await originalCard.locator('img').boundingBox(),surface=await originalCard.locator('.tx-cu-observed-image').boundingBox();
  assert.ok(Math.abs(pixels.width-surface.width)<1&&Math.abs(pixels.height-surface.height)<1);
  await pip.screenshot({path:join(root,'native-floating-cursor.png')});
  await page.screenshot({path:join(root,'native-live-cursor.png')});
  await floating.getByRole('button',{name:'停止操作',exact:true}).click();await until(async()=>(await state()).status==='stopped');await until(async()=>await pane.locator('.tx-cu-assistant-cursor').count()===0);
  await floating.getByText('已停止 · 可手动操作',{exact:true}).waitFor();assert.equal(await floating.locator('.tx-cu-assistant-cursor').count(),0);
  const floatingStopped=await originalCard.locator('img').getAttribute('src');
  const stopped=await image.getAttribute('src');await writeFile(command,JSON.stringify({id:'after-stop-ui',action:'text',value:'助手停止后仍能查看'}));await until(async()=>await image.getAttribute('src')!==stopped);
  await until(async()=>await originalCard.locator('img').getAttribute('src')!==floatingStopped);
  await pip.getByRole('button',{name:'返回对话',exact:true}).click();await until(()=>pip.isClosed());assert.equal((await state()).target.viewId,target.viewId);
  const inline=page.getByLabel('悬浮操控预览');await until(async()=>await inline.locator('.tx-cu-preview-card').count()===2);
  await inline.locator('img').first().evaluate(img=>img.decode());
  const previewBox=await inline.boundingBox(),inputBox=await page.locator('[contenteditable=\"true\"]').first().boundingBox();
  assert.ok(previewBox.y+previewBox.height<inputBox.y,'conversation preview must leave the message input unobstructed');
  await page.screenshot({path:join(root,'conversation-preview-stack.png')});
  await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:join(root,'native-live-dark.png')});
  await inline.getByRole('button',{name:'关闭操控预览',exact:true}).click();await inline.waitFor({state:'hidden'});
  assert.equal((await state()).target.viewId,target.viewId);
  assert.deepEqual(errors,[]);complete=true;
});
