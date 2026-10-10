import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir,realpath,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {frontendFixture,until} from './fixtures/frontend.mjs';
import {restoreFixtureLog} from './fixtures/restore-log.mjs';

test('native standard sessions obey the independent default in Dream while explicit original reads remain available', {timeout:60000}, async t=>{
  let dreamCalls=0;
  const f=await frontendFixture(t,{headless:true,agentPreset:'standard',initialPrompt:'ISOLATED_NATIVE_SENTINEL',
    omdConfig:{memoryScope:'session',dreamProvider:'fixture',dreamModel:'fixture',computerUseEnabled:false,codegraphEnabled:false},
    modelReply(payload){if(payload.tools?.some(tool=>tool.function.name==='save_memory'))dreamCalls++;},
  });
  await f.api('/dream/refresh',{});
  const status=await f.api('/dream?session='+f.sessionId);
  assert.equal(status.session.mode,'session');
  assert.equal(status.session.shared,false,'an unbound standard session must not silently enter shared memory');
  const job=await f.api('/dream/run?session='+f.sessionId,{scope:'global'});
  await until(async()=>{
    const current=(await f.api('/dream')).jobs.find(item=>item.id===job.id);
    if(current?.state==='failed')throw Error(current.error);
    return current?.state==='complete';
  });
  assert.equal(dreamCalls,0);
  const log=await restoreFixtureLog(f.home,f.sessionId);
  const event=log.events.find(item=>item.type==='user/message'&&JSON.stringify(item.data).includes('ISOLATED_NATIVE_SENTINEL'));
  assert.ok(event,'the real host persisted the original user message');
  const original=await f.api('/dream/read?sessionId='+f.sessionId+'&from='+event.seq+'&to='+event.seq);
  assert.match(original.text,/ISOLATED_NATIVE_SENTINEL/);
});

test('native managed projectless Chat stays outside shared Dream and survives a broken ownership claim', {timeout:90000}, async t=>{
  const sentinel='PROJECTLESS_NATIVE_CHAT_SENTINEL',dreamInputs=[];
  const chatPreset=process.env.OMD_IUI_ARCHIVE?'intelligent-chat':'standard';
  const omdConfig={memoryScope:'project',dreamProvider:'fixture',dreamModel:'fixture',dreamDeepAgeMs:60000,
    computerUseEnabled:false,codegraphEnabled:false,keepTailEvents:0,automaticReplace:false};
  const f=await frontendFixture(t,{headless:true,agentPreset:'standard',omdConfig,
    plugins:process.env.OMD_IUI_ARCHIVE?['file:'+process.env.OMD_IUI_ARCHIVE]:[],
    async setupWorkspace({root}){omdConfig.projectlessWorkspaceRoot=join(await realpath(root),'managed-chats');},
    modelReply(payload){
      const names=(payload.tools||[]).map(item=>item.function.name);
      if(names.includes('prepare_segment'))return tool('prepare_segment',{summary:sentinel,documents:[],decisions:[]});
      if(names.includes('save_memory')){
        const input=inputOf(payload);dreamInputs.push(input);
        return tool('save_memory',{summary:input.kind+'：'+input.sources.map(source=>source.text).join(' '),references:input.sources.map(source=>source.id)});
      }
    },
  });
  const prepared=await f.api('/projectless-workspace',{requestId:crypto.randomUUID(),prompt:'隔离的无工作区聊天'});
  const created=await f.rpc('session/create',{cwd:prepared.cwd,agentPreset:chatPreset});
  const {sessionId}=created;assert.equal(created.agentPreset,chatPreset);
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text:sentinel}]});
  await until(async()=>(await f.api('/state?session='+sessionId)).running==='idle');
  await f.api('/context/prepare?session='+sessionId,{});
  await until(async()=>(await f.api('/context?session='+sessionId)).records.some(record=>record.summary===sentinel));
  await f.api('/dream/refresh',{});
  const status=await f.api('/dream?session='+sessionId);
  assert.equal(status.session.mode,'session');assert.equal(status.session.shared,false);
  assert.equal(status.session.project,'@unclassified');
  const waitJob=async job=>until(async()=>{
    const current=(await f.api('/dream')).jobs.find(item=>item.id===job.id);
    if(current?.state==='failed')throw Error(current.error);
    return current?.state==='complete';
  });
  await waitJob(await f.api('/dream/run?session='+sessionId,{scope:'global'}));
  assert(!JSON.stringify(dreamInputs).includes(sentinel),'shared Dream payload must not contain managed Chat material');
  assert.equal((await f.api('/dream?session='+sessionId)).sessionMemory,null);
  await waitJob(await f.api('/dream/run?session='+sessionId,{scope:'session'}));
  assert(dreamInputs.some(input=>input.kind==='session'&&JSON.stringify(input).includes(sentinel)),
    'the actual prepared Chat source remains eligible for explicit session Dream');
  const sharedStart=dreamInputs.length;
  await waitJob(await f.api('/dream/run?session='+sessionId,{scope:'global'}));
  assert(!JSON.stringify(dreamInputs.slice(sharedStart)).includes(sentinel),'explicit Chat memory must not enter a later shared Dream payload');
  const list=await f.call('session/list',{_request:{}});
  assert.equal(list.result?.ok,true,JSON.stringify(list));
  const nativeSummary=list.result.value.items.find(item=>item.sessionId===sessionId);
  assert.equal(nativeSummary?.cwd,prepared.cwd);
  const log=await restoreFixtureLog(f.home,sessionId);
  const event=log.events.find(item=>item.type==='user/message'&&JSON.stringify(item.data).includes(sentinel));
  assert.ok(event,'the real host persisted the projectless original message');
  const original=await f.api('/dream/read?sessionId='+sessionId+'&from='+event.seq+'&to='+event.seq);
  assert.match(original.text,new RegExp(sentinel));
  const effective=await f.api('/scope?session='+sessionId);
  assert.equal(effective.scope,'session');assert.equal(effective.locked,true);

  const broken=await f.api('/projectless-workspace',{requestId:crypto.randomUUID(),prompt:'损坏归属的聊天'});
  const claimFile=join(await realpath(f.home),'trisoul-x','projectless-workspaces','names',createHash('sha256').update(broken.cwd).digest('hex')+'.json');
  const originalClaim=await readFile(claimFile);
  await writeFile(claimFile,JSON.stringify({requestHash:'invalid-claim'}));
  const second=await f.rpc('session/create',{cwd:broken.cwd,agentPreset:'trisoul-x'});
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:second.sessionId,mode:'queue',content:[{type:'text',text:'BROKEN_CLAIM_NATIVE_PROMPT'}]});
  await until(async()=>(await f.api('/state?session='+second.sessionId)).running==='idle');
  const isolated=await until(async()=>{
    const value=await f.api('/dream?session='+second.sessionId);return value.session?.scopeError?value:null;
  });
  assert.equal(isolated.session.shared,false);assert.equal(isolated.session.mode,'session');
  assert.match(isolated.session.scopeError,/invalid workspace name metadata/);
  const brokenLog=await restoreFixtureLog(f.home,second.sessionId);
  assert(brokenLog.events.some(event=>event.type==='assistant/message'),'ownership lookup failure must not block the native model reply');
  await writeFile(claimFile,originalClaim);
  const fork=await f.rpc('session/fork',{sessionId:second.sessionId});
  const forkScope=await f.api('/scope?session='+fork.sessionId);
  const forkContext=await f.api('/context?session='+fork.sessionId);
  assert.equal(forkScope.scope,'session');
  assert.equal(forkContext.scope.scope,'session','a seeded private Chat must bind privately before inherited user events lock the archive');
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:fork.sessionId,mode:'queue',content:[{type:'text',text:'PRIVATE_CHAT_FORK_CONTROL'}]});
  await until(async()=>(await f.api('/state?session='+fork.sessionId)).running==='idle');
  await f.api('/dream/refresh',{});
  const forkDream=await f.api('/dream?session='+fork.sessionId);
  assert.equal(forkDream.session.mode,'session');assert.equal(forkDream.session.shared,false);
  const registered=await f.rpc('workspace/create',{path:prepared.cwd});
  const workspaceSession=await f.rpc('session/create',{workspaceId:registered.workspace.workspaceId,agentPreset:'trisoul-x'});
  const workspaceScope=await f.api('/scope?session='+workspaceSession.sessionId);
  const workspaceContext=await f.api('/context?session='+workspaceSession.sessionId);
  assert.equal(workspaceScope.scope,'project','native attach occurs after agent creation and must preserve the configured project default');
  assert.equal(workspaceContext.scope.scope,'project','provisional Chat classification must not bind a real Workspace privately');
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:workspaceSession.sessionId,mode:'queue',content:[{type:'text',text:'WORKSPACE_REGISTRATION_CONTROL'}]});
  await until(async()=>(await f.api('/state?session='+workspaceSession.sessionId)).running==='idle');
  await f.api('/dream/refresh',{});
  const workspaceDream=await f.api('/dream?session='+workspaceSession.sessionId);
  assert.equal(workspaceDream.session.shared,true);assert.equal(workspaceDream.session.mode,'project');
  assert.equal(workspaceDream.session.project,workspaceContext.scope.project,'Dream and Context must use the same existing project key');
  assert.equal((await f.api('/dream?session='+sessionId)).session.shared,false,'registering the directory never attaches the original private Chat implicitly');
  const reportDir=join(process.cwd(),'work/dream-projectless-fix/native-agent');await mkdir(reportDir,{recursive:true});
  const hostRequire=createRequire(process.env.OMD_DSH_CLI?pathToFileURL(process.env.OMD_DSH_CLI):new URL('../node_modules/@deepseek-ai/dsh/lib/bin.js',import.meta.url));
  const hostPackagePath=hostRequire.resolve('@deepseek-ai/dsh/package.json');
  await writeFile(join(reportDir,'projectless-native.json'),JSON.stringify({host:JSON.parse(await readFile(hostPackagePath,'utf8')).version,
    sourceHost:hostPackagePath,agentPreset:chatPreset,omdArchive:process.env.OMD_UI_ARCHIVE||null,iuiArchive:process.env.OMD_IUI_ARCHIVE||null,
    sessionId,session:status.session,dreamKinds:dreamInputs.map(input=>input.kind),originalRead:true,
    effectiveScope:effective,workspaceControl:{sessionId:workspaceSession.sessionId,scope:workspaceScope,contextScope:workspaceContext.scope,dream:workspaceDream.session},
    privateFork:{sessionId:fork.sessionId,scope:forkScope,contextScope:forkContext.scope,dream:forkDream.session},
    brokenClaim:{sessionId:second.sessionId,scope:isolated.session,nativeReply:true}},null,2));
});

const tool=(name,args)=>({delta:{role:'assistant',tool_calls:[{index:0,id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls',usage:{prompt_tokens:50,completion_tokens:20,total_tokens:70}});
function inputOf(payload){
  for(const m of payload.messages.filter(m=>m.role==='user').reverse()){
    const text=typeof m.content==='string'?m.content:(m.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
    try{return JSON.parse(text);}catch{}
  }
  throw Error('Missing JSON source input');
}
test('native DSH Dream jobs, context injection, exact provenance, private reads and four UI controls',{timeout:120000},async t=>{
  await mkdir(join(process.cwd(),'work/dream-implementation'),{recursive:true});
  let f,stage=0,privateSession,privateRecord;const dreamCalls=[],mainCalls=[],prepareCalls=[];
  f=await frontendFixture(t,{headless:false,omdConfig:{memoryScope:'project',computerUseEnabled:false,codegraphEnabled:false,keepTailEvents:0,coordinatorEvery:1000,dreamProvider:'fixture',dreamModel:'fixture'},modelReply(payload){
    const names=(payload.tools||[]).map(t=>t.function.name);
    if(names.includes('save_memory')){const input=inputOf(payload);dreamCalls.push(input);assert.deepEqual(names,['save_memory']);return tool('save_memory',{summary:input.kind==='global'?'全局：当前项目采用四个 Dream 入口。':input.kind==='project'?'本项目采用四个 Dream 入口，已检查 source.txt。':'已读取 source.txt；用户确定仅保留四个 Dream 入口。',references:input.sources.map(s=>s.id)});}
    if(names.includes('prepare_segment')){const input=inputOf(payload);prepareCalls.push(input);const source=input.decision_sources.find(s=>s.text.includes('四个 Dream')),privateInput=JSON.stringify(input).includes('PRIVATE_DREAM_SENTINEL');return tool('prepare_segment',{summary:privateInput?'PRIVATE_DREAM_SENTINEL':'已读取 source.txt。',documents:[{title:'精确资料',text:privateInput?'PRIVATE_DREAM_SENTINEL':'SOURCE_ORIGINAL_9007199254740993'}],...(source?{decisions:[{seq:source.seq,text:'仅保留四个 Dream 入口。',quote:'仅保留四个 Dream 入口'}]}:{})});}
    if(names.includes('submit_context_choices'))return tool('submit_context_choices',{choices:[]});
    if(names.length){mainCalls.push(payload);if(stage===1){stage++;return tool('read',{file_path:join(f.workspace,'source.txt')});}if(stage===4){stage++;return tool('recall',{sessionId:privateSession,id:privateRecord});}}
  }});
  f.api=(path,body)=>f.page.evaluate(async({path,body})=>{const response=await fetch('trisoul-x/api'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error);return value;},{path,body});
  await until(async()=>(await f.api('/state?session='+f.sessionId)).running==='idle');
  await writeFile(join(f.workspace,'source.txt'),'SOURCE_ORIGINAL_9007199254740993\n'.repeat(300));stage=1;
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:f.sessionId,mode:'queue',content:[{type:'text',text:'读取 source.txt，设计上仅保留四个 Dream 入口。'}]});
  await until(async()=>stage===2&&(await f.api('/state?session='+f.sessionId)).running==='idle');
  await f.api('/context/prepare?session='+f.sessionId,{});
  const catalog=await until(async()=>{const c=await f.api('/context/catalog?session='+f.sessionId);return c.entries.length?c:null;});
  const before=await restoreFixtureLog(f.home,f.sessionId);
  const job=await f.api('/dream/run?session='+f.sessionId,{scope:'global'});
  const finished=await until(async()=>{const s=await f.api('/dream?session='+f.sessionId),j=s.jobs.find(j=>j.id===job.id);if(j?.state==='failed')throw Error(j.error);return j?.state==='complete'?s:null;});
  assert.deepEqual(dreamCalls.map(c=>c.kind),['session','project','global']);assert.equal(finished.usage.used,210);assert.equal(finished.globalMemory.summary,'全局：当前项目采用四个 Dream 入口。');
  assert(prepareCalls.some(i=>i.decision_sources.some(s=>s.text.includes('仅保留四个 Dream 入口'))));
  const after=await restoreFixtureLog(f.home,f.sessionId);assert.deepEqual(after.events,before.events,'Dream does not inject into or rewrite a source session');
  let source=await f.api('/dream/read?memory=global');for(let i=0;i<3;i++)source=await f.api('/dream/read?reference='+source.sources[0].reference);
  assert.equal(source.sessionId,f.sessionId);const record=await f.api('/dream/document?sessionId='+f.sessionId+'&id='+source.recordId);assert(record.documents.some(d=>d.text.includes('SOURCE_ORIGINAL')));
  const repeat=await f.api('/dream/run?session='+f.sessionId,{scope:'global'});await until(async()=>(await f.api('/dream?session='+f.sessionId)).jobs.find(j=>j.id===repeat.id)?.state==='complete');assert.equal(dreamCalls.length,3);
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:f.sessionId,mode:'queue',content:[{type:'text',text:'现在继续。'}]});
  await until(async()=>mainCalls.length>=4&&(await f.api('/state?session='+f.sessionId)).running==='idle');
  assert.match(JSON.stringify(mainCalls.at(-1).messages),/本项目采用四个 Dream 入口/);
  const {page}=f;await page.getByRole('button',{name:'打开工作台',exact:true}).click();await page.locator('.cx-navigation').getByRole('button',{name:'记忆',exact:true}).click();
  const panel=page.locator('.cx-dream');await panel.getByRole('heading',{name:'记忆',exact:true}).waitFor();
  await f.rpc('session/rename',{sessionId:f.sessionId,title:'交付清单与来源核对'});
  await until(async()=>(await f.api('/dream?session='+f.sessionId)).session.title==='交付清单与来源核对');
  assert.deepEqual(await panel.locator('.cx-dream-actions button').allTextContents(),['整理会话','整理项目','整理全局','自动整理设置']);
  await panel.getByRole('button',{name:'查看来源',exact:true}).click();
  const sourceReader=panel.getByRole('region',{name:'记忆来源',exact:true});
  await sourceReader.getByRole('button',{name:'返回记忆',exact:true}).waitFor();
  for(let depth=0;depth<3;depth++){
    if(process.env.TRISOUL_UI_ARTIFACTS){await mkdir(process.env.TRISOUL_UI_ARTIFACTS,{recursive:true});await sourceReader.screenshot({path:join(process.env.TRISOUL_UI_ARTIFACTS,`native-source-${depth}.png`)});}
    const previous=await sourceReader.locator('pre').innerText();
    await sourceReader.locator('.cx-dream-source button').first().click();
    await until(async()=>await sourceReader.locator('pre').innerText()!==previous);
  }
  await sourceReader.getByRole('button',{name:'查看详细资料与附件',exact:true}).click();
  const documentReader=panel.getByRole('region',{name:'详细资料',exact:true});
  await documentReader.getByText('SOURCE_ORIGINAL_9007199254740993',{exact:true}).waitFor();
  await page.keyboard.press('Escape');
  for(let depth=0;depth<3;depth++)await page.keyboard.press('Escape');
  await sourceReader.getByRole('button',{name:'返回记忆',exact:true}).click();
  await panel.getByRole('button',{name:'自动整理设置',exact:true}).click();await panel.getByRole('switch',{name:'启用自动 Dream'}).waitFor();
  await panel.getByRole('spinbutton',{name:'检查间隔 · 分钟',exact:true}).fill('120');await panel.getByRole('button',{name:'保存自动 Dream 设置',exact:true}).click();
  await until(async()=>(await f.api('/dream/settings')).intervalMs===7200000);
  await until(async()=>await panel.getByRole('button',{name:'整理全局',exact:true}).isEnabled());
  await panel.getByRole('button',{name:'自动整理设置',exact:true}).click();
  await page.screenshot({path:join(process.cwd(),'work/dream-implementation/memory-light.png')});
  await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:1060,height:900});
  assert.equal(await panel.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.screenshot({path:join(process.cwd(),'work/dream-implementation/memory-dark.png')});
  const registered=await f.rpc('workspace/create',{path:f.workspace});
  privateSession=(await f.rpc('session/create',{workspaceId:registered.workspace.workspaceId,agentPreset:'trisoul-x'})).sessionId;
  await f.api('/scope?session='+privateSession,{scope:'session'});
  let beforeCalls=mainCalls.length;
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:privateSession,mode:'queue',content:[{type:'text',text:'PRIVATE_DREAM_SENTINEL，只保留在本会话。'}]});
  await until(async()=>mainCalls.length>beforeCalls&&(await f.api('/state?session='+privateSession)).running==='idle');
  assert.doesNotMatch(JSON.stringify(mainCalls.at(-1).messages.filter(m=>m.role!=='system')),/\[Saved Dream memory|本项目采用四个 Dream 入口|全局：当前项目/);
  await f.api('/context/prepare?session='+privateSession,{});privateRecord=await until(async()=>(await f.api('/context/catalog?session='+privateSession)).entries[0]?.id);
  const local=await f.api('/dream/run?session='+privateSession,{scope:'session'});
  await until(async()=>(await f.api('/dream')).jobs.find(j=>j.id===local.id)?.state==='complete');
  const baseline=(await f.api('/dream')).globalMemory.revision,n=dreamCalls.length;
  const shared=await f.api('/dream/run?session='+privateSession,{scope:'global'});
  await until(async()=>(await f.api('/dream')).jobs.find(j=>j.id===shared.id)?.state==='complete');
  assert.equal((await f.api('/dream')).globalMemory.revision,baseline);assert.equal(dreamCalls.length,n);
  const globalSession=(await f.rpc('session/create',{workspaceId:registered.workspace.workspaceId,agentPreset:'trisoul-x'})).sessionId;
  await f.api('/scope?session='+globalSession,{scope:'global'});beforeCalls=mainCalls.length;stage=4;
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:globalSession,mode:'queue',content:[{type:'text',text:'明确回查刚才独立会话的详细资料。'}]});
  await until(async()=>mainCalls.length>=beforeCalls+2&&(await f.api('/state?session='+globalSession)).running==='idle');
  assert.match(JSON.stringify(mainCalls.at(-1).messages),/全局：当前项目采用四个 Dream 入口/);
  assert(mainCalls.at(-1).messages.some(m=>m.role==='tool'&&JSON.stringify(m.content).includes('PRIVATE_DREAM_SENTINEL')));
  assert(mainCalls.at(-1).messages.filter(m=>m.role==='tool').every(m=>!JSON.stringify(m.content).includes('\"presentation\"')), 'web presentation metadata does not enter model recall results');
  assert.equal((await f.api('/dream?session='+privateSession)).session.shared,false);
  assert.equal(f.errors.length,0);
});
