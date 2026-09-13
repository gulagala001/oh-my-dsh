// Opt-in real-provider test. Credentials and all session data stay outside Git.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { readComputerUseTrace, readOperationStats } from './computer-use-trace.mjs';
import { relayEvalResponse, visualTaskOrder } from './computer-use-eval-protocol.mjs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { startFixture } from '../test/fixtures/computer-use/server.mjs';
import { contentFixture } from '../test/fixtures/computer-use/content.mjs';
import { webMcpFixture } from '../test/fixtures/computer-use/webmcp.mjs';
import { browserExecutablePath } from '../src/computer-use/browser.mjs';
import { extensionFixture } from '../test/fixtures/computer-use/extension.mjs';
import { extensionSocketPath } from '../src/computer-use/extension-hub.mjs';

const keyFile=process.env.TRISOUL_CU_TEST_KEY_FILE;
if(!keyFile)throw new Error('Set TRISOUL_CU_TEST_KEY_FILE to a private credential file outside the repository.');
const key=(await readFile(keyFile,'utf8')).trim();
const model=process.env.TRISOUL_CU_TEST_MODEL??'deepseek-v4.1-flash-expires-on-0910';
const imagePixelBudget=Number(process.env.TRISOUL_CU_TEST_IMAGE_PIXELS??640000);
if(!Number.isSafeInteger(imagePixelBudget)||imagePixelBudget<=0)throw new Error('TRISOUL_CU_TEST_IMAGE_PIXELS must be a positive integer.');
const geometryTest=process.env.TRISOUL_CU_TEST_GEOMETRY==='1';
const visualTest=process.env.TRISOUL_CU_TEST_VISUAL==='1'||geometryTest;
const contentTest=process.env.TRISOUL_CU_TEST_CONTENT==='1';
const webmcpTest=process.env.TRISOUL_CU_TEST_WEBMCP==='1';
const frameTest=process.env.TRISOUL_CU_TEST_FRAME_ANNOTATION==='1';
const visualState=geometryTest?'geometryFixture':'visualFixture';
const externalTest=process.env.TRISOUL_CU_TEST_EXTENSION==='1';
let external,externalReference,externalGeometryDriver,connection;const externalCleanups=[];
const nativeTarget=process.env.TRISOUL_CU_TEST_NATIVE_APP;
const nativeReport=process.env.TRISOUL_CU_TEST_NATIVE_REPORT;
const nativeScrollTest=process.env.TRISOUL_CU_TEST_NATIVE_SCROLL==='1';
const nativeKeyboardTest=process.env.TRISOUL_CU_TEST_NATIVE_KEYBOARD==='1';
if(nativeKeyboardTest&&(!nativeTarget||visualTest||nativeScrollTest))throw new Error('Native keyboard tests require the isolated keyboard fixture.');
if(nativeScrollTest&&(!nativeTarget||visualTest))throw new Error('Native scrolling tests require the native surface fixture without browser visual mode.');
if(nativeTarget&&externalTest)throw new Error('Select either a native or external-browser evaluation.');
if(geometryTest&&!externalTest)throw new Error('The pinch fixture currently requires the isolated extension browser.');
if(nativeTarget&&!nativeReport)throw new Error('Native tests need the isolated fixture ground-truth path.');
if(contentTest&&(nativeTarget||visualTest))throw new Error('Content export tests use the browser content fixture only.');
if(webmcpTest&&(nativeTarget||visualTest||contentTest))throw new Error('WebMCP tests use their own browser fixture.');
if(frameTest&&(!externalTest||nativeTarget||visualTest||contentTest||webmcpTest))throw new Error('Frame annotation evaluation uses the isolated extension browser only.');
const nativeName='v41原生验证-'+Date.now().toString(36);
const nativeBefore=nativeTarget?JSON.parse(await readFile(nativeReport,'utf8')):null;
const root=await mkdtemp(join(tmpdir(),'trisoul-cu-live-')),home=join(root,'home'),workspace=join(root,'workspace');
await mkdir(home,{mode:0o700});await mkdir(workspace);
let testBrowser=process.env.TRISOUL_CU_TEST_BROWSER_EXECUTABLE??browserExecutablePath();
if(process.platform==='darwin'){
  const executable=testBrowser;testBrowser=join(root,'test-browser');
  await writeFile(testBrowser,'#!/bin/sh\nexec '+"'"+executable.replaceAll("'","'\\''")+"'"+' --use-mock-keychain "$@"\n',{mode:0o700});
}
const requests=[],forbiddenAttempts=[],fixture=await (webmcpTest?webMcpFixture():contentTest?contentFixture():startFixture());
const fixtureUrl=fixture.url+(frameTest?'/cross-frames':geometryTest?'/geometry':visualTest?'/visual':'/');
const proxy=createServer(async(req,res)=>{
  const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort(new Error('Evaluation client disconnected'));});
  try{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
    let value;try{value=JSON.parse(body.toString());}catch{}
    const record={path:req.url,method:req.method,bytes:body.length,model:value?.model,imageBlocks:0,at:Date.now()};
    record.imagePreviews=[...JSON.stringify(value?.messages??[]).matchAll(/request preview (\d+)x(\d+)px/g)].map(match=>({width:Number(match[1]),height:Number(match[2])}));
    const visit=v=>{if(!v||typeof v!=='object')return;if(['image','image_url','file'].includes(v.type))record.imageBlocks++;for(const child of Object.values(v))if(typeof child==='object'){if(Array.isArray(child))child.forEach(visit);else visit(child);}};visit(value?.messages);
    record.id=requests.length+1;requests.push(record);
    const upstream=await fetch('https://api.deepseek.com'+req.url,{method:req.method,headers:{authorization:'Bearer '+key,...(req.headers['content-type']?{'content-type':req.headers['content-type']}:{})},...(body.length?{body}:{}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)])});
    record.upstreamStatus=upstream.status;
    Object.assign(record,await relayEvalResponse(upstream,res,(attempts,details)=>{
      forbiddenAttempts.push(...attempts.map(attempt=>({...attempt,request:record.id,at:Date.now()})));
      record.rejectedTools=details.map(detail=>({...detail,arguments:detail.arguments.replaceAll(key,'[redacted]')}));
    }));
    record.elapsedMs=Date.now()-record.at;
  }catch(error){if(!res.destroyed){res.statusCode=502;res.end(JSON.stringify({error:{message:error.message.replaceAll(key,'[redacted]')}}));}}
});
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
await writeFile(join(home,'settings.yaml'),JSON.stringify({
  'llm-deepseek':{baseURL:'http://127.0.0.1:'+proxy.address().port,apiKeyEnv:'TRISOUL_CU_TEST_KEY',models:[{id:model,contextWindow:1000000,inputModalities:['text','image'],imagePixelBudget,imageMaxBytes:1048576}]},
  'agent-default-model':{provider:'deepseek-official',model,reasoningEffort:'max'},
  'trisoul-x':{stateEnabled:false,probeEnabled:false,digestEvery:1000,flushIdleMs:3600000,computerUseBrowserExecutable:testBrowser,computerUseNativeBinary:nativeTarget?(process.env.TRISOUL_CU_NATIVE_BINARY??''):join(root,'missing-native'),computerUseNativeSocket:process.env.TRISOUL_CU_NATIVE_SOCKET??'',computerUseChromeUserDataDir:externalTest?join(root,'external-profile'):''},
},null,2),{mode:0o600});
await writeFile(join(home,'.credentials.yaml'),JSON.stringify({version:1,refs:{TRISOUL_CU_TEST_KEY:key}}),{mode:0o600});
const child=spawn(process.execPath,['scripts/start.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,DSH_HOME:home,PORT:'0'},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',d=>{log=(log+d).slice(-30000);});child.stderr.on('data',d=>{log=(log+d).slice(-30000);});
const report={model,imagePixelBudget,evaluationProtocol:'cu-only-v2',scenario:frameTest?'frame-annotation':webmcpTest?'webmcp':contentTest?'content-export':nativeKeyboardTest?'native-keyboard':nativeScrollTest?'native-scroll':geometryTest?'pinch-visual':visualTest?'visual':'form',backend:nativeTarget?'native':externalTest?'extension':'managed',provider:'deepseek-official',root,requests,forbiddenAttempts,startedAt:new Date().toISOString()};
async function until(fn,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const result=await fn();if(result)return result;await delay(150);}throw new Error('Live test timed out');}
try{
  const bootstrap=await until(()=>{if(child.exitCode!==null)throw new Error('DSH exited before startup');return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];});
  const origin=new URL(bootstrap).origin,login=await fetch(bootstrap,{redirect:'manual'}),cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const rpc=async(method,request)=>{const r=await fetch(origin+'/api/'+method,{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args:{request}}})});const body=await r.json();if(!body.result?.ok)throw new Error(JSON.stringify(body));return body.result.value;};
  const registered=await rpc('workspace/create',{path:workspace});
  const created=await rpc('session/create',{workspaceId:registered.workspace.workspaceId,agentPreset:'standard'}),sessionId=created.sessionId;report.sessionId=sessionId;report.origin=origin;
  connection={origin,cookie,sessionId};
  if(externalTest){
    const setup=await(await fetch(origin+'/trisoul-x/computer-use/setup?session='+sessionId,{headers:{cookie}})).json();
    if(setup.extension?.installation?.browserProfile!==join(root,'external-profile'))throw new Error('Chrome installer did not resolve the isolated fixture profile; no installation performed');
    const prepared=await(await fetch(origin+'/trisoul-x/computer-use/setup?session='+sessionId,{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({action:'install-extension'})})).json();
    if(!prepared.extension?.installation?.prepared)throw new Error('Chrome installer did not prepare the test connection: '+(prepared.error??'unknown error'));
    external=await extensionFixture({after:cleanup=>externalCleanups.push(cleanup)},{socketPath:extensionSocketPath(join(home,'trisoul-x/computer-use')),fixture,profile:join(root,'external-profile'),extensionPath:prepared.extension.installation.extensionPath,prepared:true,args:webmcpTest?['--enable-blink-features=WebMCP']:[]});
    report.installedExtensionBuild=prepared.extension.installation.build;
    const page=await external.context.newPage();await page.goto(fixtureUrl);
    if(geometryTest){
      const driver=externalGeometryDriver=await page.context().newCDPSession(page);
      await driver.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
      await driver.send('Emulation.setTouchEmulationEnabled',{enabled:true});
      await driver.send('Input.synthesizeScrollGesture',{x:300,y:180,xDistance:-80,yDistance:0,gestureSourceType:'touch',speed:800});
      report.initialViewport=(await driver.send('Page.getLayoutMetrics')).cssVisualViewport;
      if(report.initialViewport.scale!==2||report.initialViewport.pageX<20)throw new Error('The visual fixture did not actually zoom and pan');
    }
    await page.evaluate(()=>localStorage.setItem('cu-external-session','preserve'));
    const inventory=await(await fetch(origin+'/trisoul-x/computer-use/inventory?session='+sessionId,{method:'POST',headers:{cookie}})).json();
    const browser=inventory.browsers?.find(browser=>browser.id===external.browser.id),tab=browser?.tabs.find(tab=>tab.url===fixtureUrl);
    if(!tab)throw new Error('Existing Chrome fixture did not appear in the actual Oh My DSH inventory');
    externalReference={kind:'tab',id:tab.id,browser:browser.id,url:tab.url,title:tab.title};
    report.browserId=browser.id;
  }
  if(frameTest){
    const cu=async(op,value)=>{const r=await fetch(origin+'/trisoul-x/computer-use/'+op+'?session='+sessionId,{method:value===undefined?'GET':'POST',headers:{cookie,'Content-Type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});const result=await r.json();if(!r.ok)throw new Error(result.error??'Annotation setup failed');return result;};
    const initial=await cu('state');await cu('tabs',{action:'select',tabId:externalReference.id,browserId:externalReference.browser,controlEpoch:initial.controlEpoch});
    const stream=await fetch(origin+'/trisoul-x/computer-use/stream?session='+sessionId+'&tab='+externalReference.id,{headers:{cookie},signal:AbortSignal.timeout(10000)}),reader=stream.body.getReader();
    try{
      let buffer='',frame;const decoder=new TextDecoder();while(!frame){const chunk=await reader.read();if(chunk.done)throw new Error('Annotation stream ended before a frame');buffer+=decoder.decode(chunk.value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,end);buffer=buffer.slice(end+2);if(event.startsWith('event: frame\n'))frame=JSON.parse(event.split('\ndata: ')[1]);}}
      const snapshot=await cu('annotation',{actor:frame.actor,tabId:frame.tabId,controlEpoch:frame.controlEpoch}),element=snapshot.elements.find(e=>e.label==='框架输入'&&e.framePath.length===2);
      if(!element)throw new Error('The actual annotation did not include the nested input');
      report.annotation={tag:element.tag,label:element.label,framePath:element.framePath,ancestry:element.ancestry,region:element.region};
      await writeFile(join(root,'user-annotation.png'),Buffer.from(snapshot.frame.data,'base64'),{mode:0o600});
    }finally{await reader.cancel();}
    await cu('resume',{});
  }
  let task=nativeTarget?'请用 computer_use 操作原生测试应用 '+nativeTarget+'：把「姓名」设为「'+nativeName+'」，准确点击「Save」（不是 Save As），读取结果确认保存内容；再用 computer_use 获取窗口截图，根据截图简短描述实际结果。这是 Computer Use 插件交互测试，必须通过其观察与动作完成；如果插件失败，请报告失败，不要改用其他工具或读取实现源码。':'请使用 computer_use 完成真实浏览器测试。打开 '+fixture.url+'，把姓名填为「青禾」，备注填为两行「第一行」「第二行」，勾选启用通知，语言选择 English，点击「保存」。确认保存区内容正确。然后点击「延迟出现」，等「延迟按钮」出现后点击它。最后获取截图，保留这个标签页供我查看。下一步基于刚收到的截图描述页面中保存区最后显示的结果。请通过实际 UI 操作完成，不用脚本直接修改页面状态。';
  if(visualTest)task='请使用 computer_use 完成视觉定位测试。打开 '+fixture.url+'，先获取截图，点击红色圆形靶心，再将蓝色圆点拖入蓝色圆环。每一步操作后用截图确认结果，最后保留标签页。除目标选择时自动返回的状态外，本次只通过截图判断位置与结果；不能用 DOM、evaluate、页面源码或元素边界读取来取得坐标，也不要用其他工具。';
  if(nativeScrollTest)task='请使用 computer_use 操作原生测试应用 '+nativeTarget+'。先把「Inner viewport」内部滚动区向下滚动一页，截图确认。然后把「Outer viewport」外部滚动区向右滚动一页，再截图确认。按这个顺序完成，不要让另一个滚动区跟着误滚，也不要移动系统鼠标或激活目标应用。最后简短描述实际结果。';
  if(nativeKeyboardTest)task='请使用 computer_use 操作原生测试应用 '+nativeTarget+'。点击「编辑区」，用键盘全选并键入两行文字：第一行「中文🌿」，第二行「second」。再用键盘把第二行的首字母改为大写，成为「Second」，保持第一行和换行不变。最后按 Command+S 触发测试应用的保存菜单，截图确认并简短描述实际结果。这次专门测试按键与键入，不能用 setValue 或 paste 代替键盘输入；保持用户当前前台应用不变。';
  if(contentTest)task='请使用 computer_use 打开 '+fixture.url+'，点击「加载素材」与「更新页面」，观察更新后的内容。把当前页面导出为可保存的页面文件，并保存这个页面已加载的图片和样式素材；如果有坏图或获取失败，准确报告，不能说全部成功。最后截图确认，保留标签页，并给出导出文件、素材目录和清单的绝对路径。使用 Computer Use 提供的页面导出和素材接口，不用脚本自行下载或重建文件。';
  if(webmcpTest)task='请使用 computer_use 打开 '+fixture.url+'，发现页面公开的 WebMCP 工具，用对应工具把备注设成「Oh My DSH WebMCP」。然后点击页面上的「替换工具」，重新发现当前工具，再通过 WebMCP 把备注设成「新工具已生效」。两次都要核对页面实际显示，最后截图并保留标签页，简短报告。备注必须由 WebMCP 工具修改，不用 DOM 脚本直接改值。';
  if(frameTest)task='请用 computer_use 打开 '+fixture.url+'，根据用户批注的文字信息定位内层输入框，先观察当前页面，再将它填为「框架批注验收」，点击同框架的「框架按钮」。外层输入框保留空白。截图并保留标签供我查看。批注只提供旧快照的位置和身份信息，操作前重新观察，不把快照坐标直接用于当前页面。用户批注：'+JSON.stringify(report.annotation);
  if(visualTest&&!externalReference)task=task.replace('打开 '+fixture.url,'打开 '+fixtureUrl);
  if(externalReference)task=task.replace('打开 '+fixture.url, '操作这个已有 Chrome 标签页：<computer-use-target>'+JSON.stringify(externalReference)+'</computer-use-target>')+' 请使用所引用的 Chrome 扩展连接。';
  const testingRules='本次单独验证 Computer Use 通道，只允许调用 computer_use、computer_use_reset、todo_write、verify_link，不调用其他工具（包括 bash）。对测试网页或应用的访问、观察、操作和结果核验必须使用 computer_use。允许正常记录待办和链接文字证据；verify_link 不能执行 run、挂接 test 类型证据或提供 cmd 命令。不要读取实现源码或绕过界面。若 Computer Use 失败，请如实报告。';
  const started=Date.now();report.taskStartedAt=started;await rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text:task+'\n\n'+testingRules}],clientTimeZone:'Asia/Shanghai'});
  let lastCalls=-1;
  const state=await until(async()=>{
    if(forbiddenAttempts.length)throw new Error('Evaluation stopped before executing unexpected tools: '+forbiddenAttempts.map(attempt=>attempt.name).join(', '));
    if(child.exitCode!==null)throw new Error('DSH exited during the task');
    if((s.metrics?.main?.calls??0)!==lastCalls){lastCalls=s.metrics?.main?.calls??0;console.log(JSON.stringify({progress:'model',calls:lastCalls,running:s.running,elapsedMs:Date.now()-started}));}
    if(lastCalls>30)throw new Error('Task exceeded 30 model calls');
    return s.running==='idle'&&lastCalls>0?s:null;
  },240000);
  report.elapsedMs=Date.now()-started;report.metrics=state.metrics;
  const status=await(await fetch(origin+'/trisoul-x/computer-use/state?session='+sessionId,{headers:{cookie}})).json();report.computerUse=status;
  const operationStats=readOperationStats(status);
  report.imageRequests=requests.filter(r=>r.imageBlocks>0).length;
  report.apiFailures=requests.filter(r=>r.upstreamStatus>=400).map(r=>({path:r.path,status:r.upstreamStatus}));
  if(nativeTarget){
    const truth=JSON.parse(await readFile(nativeReport,'utf8'));
    report.groundTruth={name:truth.name,result:truth.result,events:truth.events.slice(nativeBefore.events.length)};
    report.formCorrect=truth.name===nativeName&&truth.result==='Save | '+nativeName&&report.groundTruth.events.some(e=>e.event==='Save');
    if(nativeScrollTest){
      report.groundTruth={...report.groundTruth,inner:truth.inner,outer:truth.outer};
      const events=report.groundTruth.events,inner=events.findIndex(e=>e.inner?.[1]>0),outer=events.findIndex(e=>e.outer?.[0]>0);
      report.orderCorrect=inner>=0&&outer>inner;
      report.formCorrect=truth.inner?.[0]===0&&truth.inner[1]>=80&&truth.inner[1]<=200&&truth.outer?.[1]===0&&truth.outer[0]>=400&&truth.outer[0]<=650&&report.orderCorrect;
    }
    if(nativeKeyboardTest){
      Object.assign(report.groundTruth,{text:truth.text,selection:truth.selection,action:truth.action});
      report.keyboardInput=operationStats.complete&&report.groundTruth.events.some(event=>event.kind==='key-down'&&event.keyCode===36)&&operationStats.methods.typeText>0&&!operationStats.methods.setValue&&!operationStats.methods.paste;
      report.formCorrect=truth.text==='中文🌿\nSecond'&&truth.action==='saved'&&report.keyboardInput;
    }
    report.delayedCorrect=true;
  }else{
  let browser,context;
  if(external)context=external.context;
  else{
    const {chromium}=await import('playwright');
    const [port,endpoint]=(await readFile(join(home,'trisoul-x','computer-use','browser-profile','DevToolsActivePort'),'utf8')).trim().split('\n');
    browser=await chromium.connectOverCDP('ws://127.0.0.1:'+port+endpoint);context=browser.contexts()[0];
  }
  try{
    const page=context.pages().find(page=>page.url().startsWith(fixture.url));
    report.groundTruth=page?await page.evaluate(({visual,content,webmcp,frame})=>frame?{}:webmcp?{note:document.querySelector('#note').textContent,status:document.querySelector('#status').textContent}:content?{result:document.querySelector('output').textContent,lazy:document.querySelector('#lazy').naturalWidth}:visual?window[visual]:{events:window.fixtureEvents,result:document.querySelector('#result').textContent},{visual:visualTest?visualState:false,content:contentTest,webmcp:webmcpTest,frame:frameTest}):null;
    const saved=report.groundTruth?.events?.find(e=>e.type==='save')?.value;
    report.formCorrect=saved?.name==='青禾'&&saved.note==='第一行\n第二行'&&saved.checked===true&&saved.language==='en';
    report.delayedCorrect=report.groundTruth?.events?.some(e=>e.type==='delayed')===true;
    if(visualTest){report.formCorrect=report.groundTruth?.redHit===true;report.delayedCorrect=report.groundTruth?.dragComplete===true;}
    if(webmcpTest){report.formCorrect=report.groundTruth?.note==='2:新工具已生效'&&report.groundTruth?.status==='工具已替换';report.delayedCorrect=operationStats.methods['webmcp.call']>=2&&operationStats.methods['webmcp.fetchTools']>=2;}
    if(frameTest&&page){const outer=page.frameLocator('iframe[title="跨源外层"]'),inner=outer.frameLocator('iframe[title="跨源内层"]');report.groundTruth={outer:await outer.getByLabel('外层输入',{exact:true}).inputValue(),inner:await inner.getByLabel('框架输入',{exact:true}).inputValue(),button:await inner.getByRole('button').innerText()};report.formCorrect=report.groundTruth.outer===''&&report.groundTruth.inner==='框架批注验收';report.delayedCorrect=report.groundTruth.button==='框架完成';}
    if(contentTest){
      const exported=status.history.findLast(operation=>operation.operation==='content.export'&&operation.ok)?.artifactPath;
      const manifestPath=status.history.findLast(operation=>operation.operation==='pageAssets.bundle'&&operation.ok)?.artifactPath;
      const manifest=manifestPath?JSON.parse(await readFile(manifestPath,'utf8')):null;
      const pageBytes=exported?await readFile(exported,'utf8'):'';
      const images=manifest?.assets.filter(asset=>asset.kind==='image')??[];
      const styles=manifest?.assets.filter(asset=>asset.kind==='stylesheet')??[];
      report.exports={page:exported,manifest:manifestPath,summary:manifest?.summary};
      const imageBytes=await Promise.all(images.map(asset=>readFile(asset.path)));
      const styleBytes=await Promise.all(styles.map(asset=>readFile(asset.path,'utf8')));
      report.formCorrect=report.groundTruth?.result==='已更新的页面内容'&&report.groundTruth?.lazy>0&&/MIME-Version:/.test(pageBytes)&&pageBytes.includes('lazy.png');
      report.delayedCorrect=images.length===3&&imageBytes.every(data=>data.equals(fixture.image))&&styles.length===1&&styleBytes[0]===fixture.stylesheet&&manifest?.failures.length===1&&manifest.failures[0].url.endsWith('/missing.png');
    }
  }finally{await browser?.close();}
  }
  report.ok=report.formCorrect&&report.delayedCorrect&&(operationStats.methods.getScreenshot>0||operationStats.methods.getAXStateAndScreenshot>0)&&report.imageRequests>0&&report.apiFailures.length===0;
  if(visualTest){report.orderCorrect=visualTaskOrder(report.groundTruth?.events);report.ok&&=report.orderCorrect;if(!report.orderCorrect)report.error='The visual task did not click the red target before dragging.';}
  if(externalGeometryDriver){
    report.finalViewport=(await externalGeometryDriver.send('Page.getLayoutMetrics')).cssVisualViewport;
    report.geometryPreserved=Object.keys(report.initialViewport).every(key=>report.finalViewport[key]===report.initialViewport[key]);
    report.ok&&=report.geometryPreserved;
  }
  if(status.previewAt){const r=await fetch(origin+'/trisoul-x/computer-use/preview?session='+sessionId,{headers:{cookie}});if(r.ok)await writeFile(join(root,'final-browser.png'),Buffer.from(await r.arrayBuffer()));}
  await writeFile(join(root,'connection.json'),JSON.stringify({origin,cookie,sessionId}),{mode:0o600});
  // Optionally retain the isolated UI for a short, explicit inspection window.
  if(process.env.TRISOUL_CU_KEEP_UI==='1'){console.log(JSON.stringify({inspect:root,origin,sessionId}));await delay(Math.min(3600000,Math.max(1000,Number(process.env.TRISOUL_CU_KEEP_UI_MS)||60000)));}
}catch(error){
  report.ok=false;report.error=error.message.replaceAll(key,'[redacted]');
  // An exhausted model budget is still an observed run. Stop active control
  // before collecting its history, instead of losing the failure evidence.
  if(connection&&child.exitCode===null)try{
    const {origin,cookie,sessionId}=connection;
    const stopped=await fetch(origin+'/trisoul-x/computer-use/stop?session='+sessionId,{method:'POST',headers:{cookie},signal:AbortSignal.timeout(15000)});
    if(!stopped.ok)throw new Error('Computer Use stop returned '+stopped.status);
    report.computerUse=await stopped.json();
  }catch(cleanup){report.stopError=cleanup.message.replaceAll(key,'[redacted]');}
  await writeFile(join(root,'diagnostic.log'),log.replace(/token=\S+/g,'token=[redacted]').replaceAll(key,'[redacted]'),{mode:0o600});
}
finally{
  if(report.elapsedMs===undefined&&report.taskStartedAt)report.elapsedMs=Date.now()-report.taskStartedAt;
  report.imageRequests=requests.filter(r=>r.imageBlocks>0).length;
  report.apiFailures=requests.filter(r=>r.upstreamStatus>=400).map(r=>({path:r.path,status:r.upstreamStatus}));
  if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(5000)]);if(child.exitCode===null)child.kill('SIGKILL');}
  if(nativeTarget&&!report.groundTruth)try{
    const truth=JSON.parse(await readFile(nativeReport,'utf8'));
    report.groundTruth={name:truth.name,result:truth.result,events:truth.events.slice(nativeBefore.events.length)};
    if(nativeScrollTest)Object.assign(report.groundTruth,{inner:truth.inner,outer:truth.outer});
    if(nativeKeyboardTest)Object.assign(report.groundTruth,{text:truth.text,selection:truth.selection,action:truth.action});
  }catch(error){report.groundTruthError=error.message.replaceAll(key,'[redacted]');}
  if(external){
    const page=external.context.pages().find(page=>page.url().startsWith(fixture.url));
    report.externalTabPreserved=!!page&&!page.isClosed();
    if(!report.externalTabPreserved)report.ok=false;
    if(page&&!report.groundTruth)try{
      report.groundTruth=await page.evaluate(visual=>visual?window[visual]:{events:window.fixtureEvents,result:document.querySelector('#result')?.textContent},visualTest?visualState:false);
      await page.screenshot({path:join(root,'failure-browser.png')});
    }catch(error){report.groundTruthError=error.message.replaceAll(key,'[redacted]');}
  }
  if(externalCleanups.length){
    const cleanup=await Promise.allSettled(externalCleanups.map(close=>close()));
    const failed=cleanup.find(result=>result.status==='rejected');if(failed){report.ok=false;report.cleanupError=failed.reason.message;}
  }
  await fixture.close();proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));
  if(report.sessionId){
    try{
      const directory=join(home,'sessions'),files=await readdir(directory,{recursive:true});
      const relative=files.find(file=>file.endsWith(join(report.sessionId,'session.v3.jsonl.zstd')));
      if(!relative)throw new Error('The real-provider session trace is missing');
      const trace=readComputerUseTrace(await readFile(join(directory,relative)));
      if(!trace.computerUseCalls)throw new Error('The session trace contains no Computer Use results');
      report.computerUseCalls=trace.computerUseCalls;
      report.toolFailures=trace.toolFailures.map(failure=>({...failure,message:failure.message.replaceAll(key,'[redacted]')}));
      report.unexpectedTools=trace.unexpectedTools;report.uiOnly=trace.unexpectedTools.length===0&&forbiddenAttempts.length===0;
      report.resultCorrect=report.ok;report.ok=report.ok&&report.uiOnly;
      report.operationFailures=(report.computerUse?.history??[]).filter(operation=>!operation.ok&&!operation.cancelled);
      const operationStats=readOperationStats(report.computerUse);
      report.operationFailureCount=operationStats.complete?operationStats.failed:null;
      report.recovered=report.ok&&(report.toolFailures.length>0||operationStats.failed>0);
      report.operationHistoryComplete=operationStats.historyComplete;
      report.operationStatsComplete=operationStats.complete;
      report.zeroError=operationStats.complete?report.ok&&report.toolFailures.length===0&&operationStats.failed===0:null;
    }catch(error){report.ok=false;report.traceError=error.message.replaceAll(key,'[redacted]');}
  }
  await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:report.ok,report:join(root,'report.json'),elapsedMs:report.elapsedMs,imageRequests:report.imageRequests,toolFailures:report.toolFailures?.length,unexpectedTools:report.unexpectedTools,forbiddenAttempts,zeroError:report.zeroError,error:report.error??report.traceError}));
  if(!report.ok)process.exitCode=1;
}
