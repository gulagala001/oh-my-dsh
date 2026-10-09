import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,readdir,stat,chmod,rename,rm,copyFile,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const enabled=process.env.OMD_COLD_NATIVE_RUN==='1';
const owned=process.env.OMD_COLD_NATIVE_FIXTURE_DIR??join(root,'work/a2-compat/session-api-cold-native');
const mode=process.env.OMD_COLD_NATIVE_CASE??'fixed';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const textOf=value=>JSON.stringify(value);

async function inventory(directory,prefix=''){
 const result={};for(const row of await readdir(directory,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return[];throw error;})){
  const path=join(directory,row.name),key=prefix+row.name;
  if(row.isDirectory())Object.assign(result,await inventory(path,key+'/'));
  else if(row.isFile()){const bytes=await readFile(path),meta=await stat(path);result[key]={sha256:digest(bytes),bytes:bytes.length,mode:meta.mode&0o7777};}
 }return result;
}
async function sdkBytes(cli){
 const req=createRequire(await realpath(cli)),ref=createRequire(await realpath(join(root,'node_modules/@deepseek-ai/dsh/lib/bin.js'))),result={};
 for(const name of ['@deepseek-ai/dsh-api-session-controller','@deepseek-ai/dsh-session','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-agent','@deepseek-ai/dsh-workflow','@deepseek-ai/dsh-app-boot','@deepseek-ai/cordis']){
  const path=req.resolve(name),baseline=ref.resolve(name);result[name]={path,sha256:digest(await readFile(path)),testedPath:baseline,testedSha256:digest(await readFile(baseline))};
 }return result;
}
test('cold native ordinary-session APIs use validated readonly metadata without activating an Agent',{
 timeout:600000,skip:!enabled&&'Explicit official CLI, immutable package and owned Native fixture required.',
},async t=>{
 assert(['fixed','reproduce'].includes(mode));
 const {ecosystemFixture,until}=await import(pathToFileURL(join(owned,'fixture.mjs')).href);
 const inputs=JSON.parse(await readFile(join(owned,'inputs.json'))),cli=process.env.OMD_COLD_NATIVE_HOST_CLI??inputs.cli.a2;
 const packagePath=process.env.OMD_COLD_NATIVE_PACKAGE??inputs.next.omd.path,sha=process.env.OMD_COLD_NATIVE_SHA256??inputs.next.omd.sha256;
 const expectedVersion=process.env.OMD_COLD_NATIVE_VERSION??inputs.next.omd.version,hostVersion=process.env.OMD_COLD_NATIVE_HOST_VERSION??'0.2.1-alpha.2';
 const out=process.env.OMD_COLD_NATIVE_OUTPUT??join(owned,mode+'-'+Date.now());await mkdir(out);await mkdir(join(out,'fixture'));
 const report={passed:false,mode,hostVersion,packagePath,sha256:sha,expectedVersion,phase:'prepare',cases:[],ui:{responses:[],errors:[],console:[]}};
 let f,browser;const save=()=>writeFile(join(out,'verification.json'),JSON.stringify(report,null,2));
 const checkpoint=async phase=>{report.phase=phase;await save();t.diagnostic(phase);};
 t.after(async()=>{
  try{await browser?.close();await f?.close();for(const name of await readdir(join(out,'fixture'))){if(/^(boot-|processes-|network\.)/.test(name))await copyFile(join(out,'fixture',name),join(out,name));}await rm(join(out,'fixture'),{recursive:true,force:true});report.cleanup={closed:true,rootRemoved:await stat(join(out,'fixture')).then(()=>false,error=>error.code==='ENOENT')};}
  catch(error){report.cleanup={closed:false,error:error.message};throw error;}finally{await save();}
 });
 try{
  assert.equal(digest(await readFile(packagePath)),sha,'Immutable package at execution');
  f=await ecosystemFixture({root:join(out,'fixture'),cli,storeDir:join(owned,'public-store'),installTimeoutMs:400000,modelReply:()=>({content:'COLD_NATIVE_ORIGINAL_COMPLETE'})});
  assert.equal(f.hostVersion,hostVersion);report.sdkBefore=await sdkBytes(f.cli);if(hostVersion==='0.2.1-alpha.2')for(const row of Object.values(report.sdkBefore))assert.equal(row.sha256,row.testedSha256,'Fixed deployment SDK source equals tested SDK');
  const observe=id=>f.inspect(id);
  async function create(title){const workspace=(await f.rpc('workspace/create',{request:{path:f.workspace}})).workspace;const created=await f.rpc('session/create',{request:{workspaceId:workspace.workspaceId,agentPreset:'standard'}});const route=(await f.rpc('session/modelCatalog',{})).default;assert.equal(route.provider,'ecosystem');assert.equal(route.model,'ecosystem');await f.rpc('session/selectModel',{request:{sessionId:created.sessionId,...route}});await f.rpc('session/rename',{request:{sessionId:created.sessionId,title}});return{id:created.sessionId,title};}
  async function prompt(session,image=false){
   const content=[{type:'text',text:'COLD_NATIVE_ORIGINAL_SENTINEL '+session.title}];
   if(image){const sharp=createRequire(join(root,'package.json'))('sharp'),png=await sharp({create:{width:16,height:16,channels:4,background:{r:25,g:95,b:255,alpha:1}}}).png().toBuffer();content.push({type:'image',mediaType:'image/png',name:'cold-original.png',data:png.toString('base64')});}
   await f.rpc('session/prompt',{request:{sessionId:session.id,requestId:randomUUID(),mode:'queue',content}});await until(async()=>{const value=await observe(session.id);return value.agentStatus==='idle'&&value.eventTypes?.includes('turn/end');},'Warm Native prompt complete');
  }
  async function api(id,name,value){const response=await fetch(f.origin+'/trisoul-x/api/'+name+'?'+new URLSearchParams({session:id}),{headers:{cookie:f.cookie,'content-type':'application/json'},...(value===undefined?{}:{method:'POST',body:JSON.stringify(value)})});const raw=await response.text();let body;try{body=JSON.parse(raw);}catch{body={nonJson:raw};}return{status:response.status,body};}
  async function nativePage(id){const projections=await f.rpc('session/projections',{request:{sessionId:id}});return f.rpc('session/page',{request:{address:{kind:'session',sessionId:id},throughSeq:projections.asOfSeq,maxMessages:100}});}
  await f.start();const plain=await create('Cold original stock standard'),corrupt=await create('Cold corrupted standard'),unreadable=await create('Cold unreadable standard');report.sessions={plain,corrupt,unreadable};await prompt(plain,true);await prompt(corrupt);await prompt(unreadable);
  report.originalPage=await nativePage(plain.id);assert(textOf(report.originalPage).includes('COLD_NATIVE_ORIGINAL_SENTINEL'));await f.stop();
  const artifacts=[{path:packagePath,sha256:sha},...['omaa','iui','subs'].map(key=>inputs.next[key]),inputs.old.market];
  for(const artifact of artifacts)assert.equal(digest(await readFile(artifact.path)),artifact.sha256,'Every installed full-stack artifact is frozen');report.artifacts=artifacts;
  const install=await f.cliRun(['plugin','--profile',f.profile,'add',...artifacts.map(row=>'file:'+row.path)]);report.install=install;assert.equal(install.ok,true,install.stderr);
  const installed=JSON.parse(await readFile(join(f.home,'profiles',f.profile,'node_modules/trisoul_x/package.json')));assert.equal(installed.version,expectedVersion);
  const yaml=createRequire(join(root,'package.json'))('yaml'),patchPath=join(f.home,'profiles/ecosystem/cordis.patch.yml'),patch=yaml.parse(await readFile(patchPath,'utf8'));patch.push({id:'llm-subscriptions',config:{providers:['codex'],codexClientVersion:'0.134.0'}},{id:'trisoul-x',config:{memoryScope:'project',unifiedBackground:{provider:'ecosystem',model:'ecosystem',effort:'off'},dreamProvider:'ecosystem',dreamModel:'ecosystem',computerUseChromeUserDataDir:join(f.root,'chrome')}});await writeFile(patchPath,yaml.stringify(patch));
  await f.start();const saved=await create('Cold saved global scope');const selected=await api(saved.id,'scope',{scope:'global'});assert.equal(selected.status,200);assert.equal(selected.body.scope,'global');await prompt(saved);report.sessions.saved=saved;await f.stop();
  const nativeFiles=await inventory(join(f.home,'sessions'));const findLog=id=>Object.keys(nativeFiles).find(path=>path.includes('/'+id+'/')&&/\.jsonl(?:\.zstd)?$/.test(path));
  const corruptLog=join(f.home,'sessions',findLog(corrupt.id)),unreadableLog=join(f.home,'sessions',findLog(unreadable.id));assert(corruptLog&&unreadableLog);
  const corruptBytes=await readFile(corruptLog);const damaged=Buffer.from(corruptBytes);damaged[Math.max(8,damaged.length-20)]^=0xff;const unreadableMode=(await stat(unreadableLog)).mode&0o7777;
  // Both hostile cases retain their original Native identity. They are never silently replaced with empty sessions.
  report.protectedBefore={sessions:await inventory(join(f.home,'sessions')).catch(error=>({unreadable:error.code})),attachments:await inventory(join(f.home,'attachments')),omd:await inventory(join(f.home,'trisoul-x'))};
  report.plainLogBefore=nativeFiles[findLog(plain.id)];report.plainLogRelative=findLog(plain.id);report.originalAttachments=await inventory(join(f.home,'attachments'));
  await f.start();report.startupBarrier=await f.request('/cold-observer?settled=1&session='+encodeURIComponent(plain.id));assert.equal(report.startupBarrier.startupSettled,true);await checkpoint('cold-full-stack-native');const before=await observe(plain.id);assert.equal(before.agentAttached,false);assert.equal(before.sessionAttached,false);assert.equal(before.omdStored,false);assert.equal(before.omdCacheHas,false);assert.equal(before.contextCacheHas,false);report.plainBefore=before;assert.equal(before.sessionControllerAvailable,true,'Healthy Native service before fault injection');
  for(const row of Object.values(before.peers))for(const same of Object.values(row))assert.equal(same,true,'Actual Native SDK namespace unchanged');assert.equal(before.nativeToolRuntime,true);
  const ledgerBeforeApis=await inventory(join(f.home,'trisoul-x'));
  const requestsBefore=f.requests.length,scope=await api(plain.id,'scope'),state=await api(plain.id,'state');report.cases.push({name:'cold-default',scope,state});
  if(mode==='reproduce'){assert.equal(scope.status,404);assert.equal(state.status,404);}else{assert.equal(scope.status,200);assert.equal(scope.body.scope,'project');assert.equal(scope.body.default,'project');assert.equal(scope.body.locked,true);assert.equal(state.status,200);assert.equal(state.body.scope.mode,'project');assert.equal(state.body.meter,null);assert.deepEqual(state.body.frame,[]);}
  const after=await observe(plain.id);for(const key of ['agentAttached','sessionAttached','omdStored','omdCacheHas','contextCacheHas'])assert.equal(after[key],false,'Readonly API must not populate '+key);assert(!after.created.includes(plain.id));assert.equal(f.requests.length,requestsBefore);
  const page=await nativePage(plain.id);assert.deepEqual(page,report.originalPage,'Native original page unchanged');assert.equal((await observe(plain.id)).agentAttached,false);assert.equal((await observe(plain.id)).sessionAttached,false);
  const savedBefore=await observe(saved.id);assert.equal(savedBefore.agentAttached,false);const savedScope=await api(saved.id,'scope');report.cases.push({name:'cold-saved',scope:savedScope});assert.equal(savedScope.status,200);assert.equal(savedScope.body.scope,'global');if(mode==='fixed')assert.equal(savedScope.body.locked,true);else report.originalSavedScopeLocked=savedScope.body.locked;assert.equal((await observe(saved.id)).agentAttached,false);
  const nonexistent='session-'+randomUUID(),missingScope=await api(nonexistent,'scope'),missingState=await api(nonexistent,'state');report.cases.push({name:'nonexistent',scope:missingScope,state:missingState});assert.equal(missingScope.status,404);assert.equal(missingState.status,404);assert.equal((await observe(nonexistent)).omdStored,false);
  await writeFile(corruptLog,damaged);await chmod(unreadableLog,0);for(const session of [corrupt,unreadable]){const faultScope=await api(session.id,'scope'),faultState=await api(session.id,'state');report.cases.push({name:session===corrupt?'corrupt':'unreadable',scope:faultScope,state:faultState});if(mode==='fixed'){assert(faultScope.status>=400);assert(faultState.status>=400);}assert.equal((await observe(session.id)).agentAttached,false);}
  await chmod(unreadableLog,unreadableMode);await writeFile(corruptLog,corruptBytes);
  if(mode==='fixed'){
   const savedLog=join(f.home,'sessions',findLog(saved.id)),savedBytes=await readFile(savedLog),savedMode=(await stat(savedLog)).mode&0o7777,savedDamaged=Buffer.from(savedBytes);savedDamaged[Math.max(8,savedDamaged.length-20)]^=0xff;
   try{
    await writeFile(savedLog,savedDamaged);const damagedScope=await api(saved.id,'scope'),damagedState=await api(saved.id,'state');report.cases.push({name:'saved-corrupt',scope:damagedScope,state:damagedState});assert(damagedScope.status>=400);assert(damagedState.status>=400);
    await writeFile(savedLog,savedBytes);await chmod(savedLog,0);const deniedScope=await api(saved.id,'scope'),deniedState=await api(saved.id,'state');report.cases.push({name:'saved-unreadable',scope:deniedScope,state:deniedState});assert(deniedScope.status>=400);assert(deniedState.status>=400);
   }finally{await chmod(savedLog,savedMode);await writeFile(savedLog,savedBytes);}
   const archived=join(out,'owned-saved-native-archive.zstd');await rename(savedLog,archived);
   try{const archivedScope=await api(saved.id,'scope'),archivedState=await api(saved.id,'state'),archivedWrite=await api(saved.id,'scope',{scope:'project'});report.cases.push({name:'saved-archive-without-native',scope:archivedScope,state:archivedState,write:archivedWrite});assert.equal(archivedScope.status,200);assert.equal(archivedScope.body.scope,'global');assert.equal(archivedScope.body.locked,true);assert.equal(archivedState.status,200);assert.equal(archivedWrite.status,409);}finally{await rename(archived,savedLog);}
   assert.equal((await observe(saved.id)).agentAttached,false);
  }
  const plainLogBeforeUi=await readFile(join(f.home,'sessions',report.plainLogRelative));assert.equal(digest(plainLogBeforeUi),report.plainLogBefore.sha256,'New APIs and native readonly page retain original log bytes exactly');assert.deepEqual(await inventory(join(f.home,'sessions')),report.protectedBefore.sessions,'All original Native logs remain exact after owned fault restoration');assert.deepEqual(await inventory(join(f.home,'attachments')),report.originalAttachments);assert.deepEqual(await inventory(join(f.home,'trisoul-x')),ledgerBeforeApis,'Readonly APIs never create or rewrite any OMD ledger');report.apiLedgerExact=true;report.apiPlainAfter=await observe(plain.id);for(const key of ['agentAttached','sessionAttached','omdStored','omdCacheHas','contextCacheHas'])assert.equal(report.apiPlainAfter[key],false);await writeFile(join(out,'native-log-before-ui.zstd'),plainLogBeforeUi);report.apiOriginalBytesExact=true;const ledgerBefore=await inventory(join(f.home,'trisoul-x'));const {chromium}=createRequire(join(root,'package.json'))('playwright');browser=await chromium.launchPersistentContext(join(f.root,'cft'),{executablePath:inputs.browser,headless:true,args:['--use-mock-keychain','--password-store=basic'],viewport:{width:1440,height:1000},env:{...f.installEnv,HOME:f.userHome,USERPROFILE:f.userHome}});
  await browser.addCookies(f.cookie.split('; ').map(value=>{const at=value.indexOf('=');return{name:value.slice(0,at),value:value.slice(at+1),url:f.origin};}));await browser.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===f.origin||['data:','blob:'].includes(url.protocol))await route.continue();else await route.abort();});
  const nativeDraftReplies=[],web=browser.pages()[0]??await browser.newPage();web.setDefaultTimeout(20000);web.on('pageerror',error=>report.ui.errors.push(error.message));web.on('console',row=>{if(['warning','error'].includes(row.type()))report.ui.console.push({type:row.type(),text:row.text(),location:row.location()});});web.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/')){let dto;try{dto=request.postDataJSON();}catch{}report.ui.nativeRpc??=[];report.ui.nativeRpc.push({path:url.pathname,method:dto?.method,args:dto?.payload?.args});}});web.on('response',response=>{const url=new URL(response.url());if(url.pathname.startsWith('/trisoul-x/api/'))report.ui.responses.push({url:url.pathname+url.search,status:response.status()});if(url.pathname==='/api/session/create')nativeDraftReplies.push(response.json().then(value=>{assert.equal(value.result.ok,true);return value.result.value.sessionId;}));});
  await web.goto(f.origin);const welcome=web.getByRole('button',{name:/^(Continue|继续)$/,exact:true});await welcome.waitFor({state:'visible',timeout:30000});await welcome.click();await welcome.waitFor({state:'hidden'});
  const title=web.getByText(plain.title,{exact:true}).first();if(!await title.isVisible())await web.getByText('workspace',{exact:true}).first().click();const more=web.getByText(/展开其余 \d+ 个会话/).first();if(!await title.isVisible()&&await more.isVisible())await more.click();await title.click();await web.getByText('COLD_NATIVE_ORIGINAL_COMPLETE',{exact:true}).first().waitFor();
  if(mode==='fixed'){
   const choice=web.getByRole('combobox',{name:'会话范围'});await until(async()=>await choice.inputValue()==='project','Correct cold scope DOM');
   let failed=false;await web.route('**/trisoul-x/api/scope?*',async route=>{if(!failed&&route.request().method()==='GET'&&new URL(route.request().url()).searchParams.get('session')===plain.id){failed=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'OWNED_SCOPE_READ_RETRY'})});}else await route.continue();});
   await web.getByText(saved.title,{exact:true}).first().click();await until(async()=>await choice.inputValue()==='global','Persisted scope DOM');await title.click();await web.getByText('范围暂不可读',{exact:true}).waitFor();const retry=web.getByRole('button',{name:'重试会话范围',exact:true});await retry.waitFor();await retry.click();await until(async()=>await choice.inputValue()==='project','Scope retried real service');await web.getByText('范围暂不可读',{exact:true}).waitFor({state:'hidden'});assert.equal(await retry.isVisible(),false);report.ui.explicitRetryClearedError=true;
  }
  await web.screenshot({path:join(out,'cold-scope-'+mode+'.png'),animations:'disabled'});report.ui.body=await web.locator('body').innerText();report.ui.nativeDraftIds=await Promise.all(nativeDraftReplies);await browser.close();browser=undefined;
  assert.deepEqual(report.ui.errors,[]);report.ui.plainAfter=await observe(plain.id);report.ui.savedAfter=await observe(saved.id);report.ui.activationBoundary='Strictly none during scope/state and readonly Native page; browser may intentionally call model-mode inspect or Native commands/catalog, which use public lazy Agent activation. Actual RPC/events captured rather than falsely requiring global UI to stay inactive.';assert.equal(f.requests.length,requestsBefore);
  const currentLog=await readFile(join(f.home,'sessions',report.plainLogRelative));await writeFile(join(out,'native-log-after-ui.zstd'),currentLog);const uiPage=await nativePage(plain.id);report.ui.nativeLogDelta={beforeBytes:plainLogBeforeUi.length,afterBytes:currentLog.length,originalBytePrefixExact:currentLog.subarray(0,plainLogBeforeUi.length).equals(plainLogBeforeUi),beforeSha256:digest(plainLogBeforeUi),afterSha256:digest(currentLog),oldRecordCount:report.originalPage.records.length,newRecordCount:uiPage.records.length,appendedEvents:uiPage.records.slice(report.originalPage.records.length).map(row=>row.event)};assert.equal(report.ui.nativeLogDelta.originalBytePrefixExact,true,'Existing UI activation may append metadata but never rewrites original byte prefix');assert.deepEqual(uiPage.records.slice(0,report.originalPage.records.length),report.originalPage.records,'Original Native record prefix survives intentional existing UI activation');assert.deepEqual(await inventory(join(f.home,'attachments')),report.originalAttachments);
  const ledgerAfter=await inventory(join(f.home,'trisoul-x'));for(const [path,value]of Object.entries(ledgerBefore))assert.deepEqual(ledgerAfter[path],value,'Native UI preserves every preexisting OMD file: '+path);
  const nativeDrafts=report.ui.nativeDraftIds;for(const id of nativeDrafts){assert(!Object.values(report.sessions).some(session=>session.id===id));assert(report.ui.plainAfter.created.includes(id));}assert(report.ui.nativeRpc.some(row=>row.method==='session/create'),'Native UI draft creation captured');const allowedDraftFiles=new Map(nativeDrafts.flatMap(id=>[['sessions/'+id+'.json',id],['context-v1/sessions/'+digest(id)+'.json',id]]));report.ui.newLedgerFiles=Object.entries(ledgerAfter).filter(([path])=>!(path in ledgerBefore)).map(([path,meta])=>({path,meta,nativeDraftId:allowedDraftFiles.get(path)}));for(const row of report.ui.newLedgerFiles)assert(row.nativeDraftId,'Only ledger files belonging to actually UI-created Native drafts may be added');report.ui.existingLedgerBytesExact=true;
  assert.deepEqual(JSON.parse((await f.cliRun(['plugin','--profile',f.profile,'version-exemptions'])).stdout),{});const gate=await exec(process.execPath,[join(owned,'sdk-evidence.mjs'),f.cli,f.home,'trisoul_x'],{env:f.installEnv,cwd:f.workspace,timeout:30000,maxBuffer:20*1024*1024});report.nativeSdkGate=JSON.parse(gate.stdout);assert.equal(report.nativeSdkGate.nativeGateIssue,null);assert.deepEqual(report.nativeSdkGate.exemptions,{});report.sdkAfter=await sdkBytes(f.cli);assert.deepEqual(report.sdkAfter,report.sdkBefore);assert.equal(digest(await readFile(packagePath)),sha);report.passed=true;await checkpoint(mode==='reproduce'?'original-frozen-404-reproduced':'cold-readonly-fixed-regression-pass');
 }catch(error){report.failure={phase:report.phase,message:error.message,stack:error.stack};await save();throw error;}
});
