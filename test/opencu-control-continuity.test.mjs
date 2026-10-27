import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {installToolDefinitions} from '../vendor/opencu/src/dsh/tools.mjs';
import {createComputerSession} from '../vendor/opencu/src/dsh/computer.mjs';

const require = createRequire(realpathSync(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')));
const {Context} = await import(require.resolve('@deepseek-ai/cordis'));
const {ToolRuntime} = await import(require.resolve('@deepseek-ai/dsh-tools'));
const {NodePtcRuntime} = await import(require.resolve('@deepseek-ai/dsh-ptc-runtime-node'));
const {LocalSubprocessRuntime} = await import(require.resolve('@deepseek-ai/dsh-subprocess-local'));

for (const mode of ['native','ptc']) test(`bundled CU diagnostics survive the real ${mode} tool error channel`, async t => {
  const parent = new URL('../../.local/',import.meta.url).pathname; await mkdir(parent,{recursive:true});
  const directory = await mkdtemp(join(parent,'cu-tool-channel-')), ctx = new Context();
  const session = {id:'synthetic-continuity',append(){}}, agent = {ctx,session};
  ctx.reflect.provide('systemPrompt',{tools(){},section(){},getSectionOrder(){return 0;}});
  ctx.reflect.provide('attachments',{});
  ctx.reflect.provide('sessions',{get:id=>id===session.id?session:undefined});
  ctx.reflect.provide('fs',{processPathFromHostPath:path=>path});
  ctx.reflect.provide('workingDirectory',{ensure:async()=>directory});
  ctx.reflect.provide('sandbox',{confine(){throw Error('Unexpected sandbox route');}});
  ctx.reflect.provide('sandboxPolicy',{defaultMode:'danger-full-access',resolve:()=>({mode:'danger-full-access',workspaceRoot:directory,sessionId:session.id})});
  if (mode==='ptc') {
    await ctx.plugin(LocalSubprocessRuntime);
    await ctx.plugin(NodePtcRuntime,{executionMode:'per-call',timeoutMs:5000,maxTimeoutMs:5000});
  }
  await ctx.plugin(ToolRuntime,{mode});
  const computer = createComputerSession(async endpoint => {
    assert.equal(endpoint,'openTarget');
    return {ok:false,error:{code:'CONTROL_STOPPED',message:'Control is blocked (release_failed)'},
      state:{mode:'release_failed',explicitlyStopped:true,releasePending:true,activeTargetId:null,targets:[],releaseErrors:[{backend:'browser'}]}};
  });
  installToolDefinitions(ctx,{request:(_endpoint,args)=>computer.run(args)},session.id);
  t.after(async()=>{await computer.close();await ctx.fiber.dispose();await rm(directory,{recursive:true,force:true});});
  const args={code:'await cua.createBrowserTab("browser:synthetic","about:blank");',title:'Synthetic continuity'};
  const result = await ctx.tools.execute({name:mode==='ptc'?'run_code':'computer_use',callId:'continuity-'+mode,agent,signal:new AbortController().signal,
    arguments:mode==='ptc'?{code:`await tools.computer_use(${JSON.stringify(args)});`,description:'Synthetic CU diagnostics'}:args});
  assert.equal(result.isError,true);
  const text = result.content.filter(item=>item.type==='text').map(item=>item.text).join('\n');
  assert.match(text,/CONTROL_STOPPED/);
  assert.match(text,/explicitlyStopped/);
  assert.match(text,/cua\.resume\(\{browserId\}\)/);
  assert.match(text,/user requests continuation/);
});
