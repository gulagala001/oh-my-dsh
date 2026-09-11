import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { ComputerRuntime } from '../src/computer-use/runtime.mjs';

test('persistent JavaScript keeps bindings and emits only requested output',async t=>{
  const calls=[];const runtime=new ComputerRuntime(async(method,args)=>{calls.push({method,args});if(method==='createBrowserTab')return{id:'tab-one',kind:'tab',browserId:'browser'};if(method==='target'&&args[1]==='getAXState')return{state:'1 button Save'};return null;});
  t.after(()=>runtime.reset());
  let r=await runtime.execute("const tab = await cua.createBrowserTab('browser','https://example.test'); const answer=await Promise.resolve(42); nodeRepl.write(answer)");
  assert.equal(r.error,undefined,JSON.stringify(r));assert.deepEqual(r.blocks.filter(b=>!b.text?.startsWith('# ')).map(b=>b.text),['1 button Save','42']);
  assert.equal(r.blocks.filter(b=>b.text?.startsWith('# ')).length,2);
  r=await runtime.execute("await tab.click(1); nodeRepl.write(answer+1)");assert.equal(r.error,undefined);assert.equal(r.blocks[0].text,'43');
  assert.equal(calls.at(-1).args[1],'click');
  await runtime.reset();r=await runtime.execute('nodeRepl.write(answer)');assert.match(r.error.message,/answer is not defined/);
});

test('first-use documentation is scoped, suppressible results stay quiet, and reset restores the docs',async t=>{
  let failed=false;
  const runtime=new ComputerRuntime(async(method,args)=>{
    if(method==='listApps'&&!failed){failed=true;throw new Error('inventory unavailable');}
    if(method==='getBrowser')return{id:'browser',type:'managed'};
    if(method==='getApp')return{id:'app-one',kind:'app'};
    if(method==='target'&&args[1]==='getAXState')return{state:'1 textbox Name'};
    return [];
  });
  t.after(()=>runtime.reset());
  const rejected=await runtime.execute('await cua.listApps({emit:false});');
  assert.match(rejected.error.message,/inventory unavailable/);
  assert.equal(rejected.blocks.length,0);
  const core=await runtime.execute('await cua.listBrowsers({emit:false});');
  assert.equal(core.blocks.length,1);assert.match(core.blocks[0].text,/# Computer Use JavaScript API/);
  assert.equal((await runtime.execute('await cua.listTabs({emit:false});')).blocks.length,0);
  const selected=await runtime.execute("const browser=await cua.getBrowser({id:'browser'}); nodeRepl.write(browser.browserId);");
  assert.equal(selected.blocks.filter(b=>b.text?.startsWith('# ')).length,1);
  assert.match(selected.blocks[0].text,/# Browser and tab API/);assert.equal(selected.blocks.at(-1).text,'browser');
  const explicit=await runtime.execute('nodeRepl.write(await browser.documentation());');
  assert.equal(explicit.blocks.length,1);assert.equal(explicit.blocks[0].text,selected.blocks[0].text);
  const native=await runtime.execute("const app=await cua.getApp('fixture');");
  assert.match(native.blocks[0].text,/# Native app API/);assert.equal(native.blocks.at(-1).text,'1 textbox Name');
  const again=await runtime.execute("await cua.getApp('fixture');");
  assert.deepEqual(again.blocks.map(b=>b.text),['1 textbox Name']);
  await runtime.reset();
  const reset=await runtime.execute('await cua.listBrowsers({emit:false});');
  assert.equal(reset.blocks.length,1);assert.match(reset.blocks[0].text,/# Computer Use JavaScript API/);
});

test('late timers retain their originating call and cannot act in a new call',async t=>{
  const calls=[];const runtime=new ComputerRuntime(async(method)=>{calls.push(method);return{apps:[]};});t.after(()=>runtime.reset());
  const first=await runtime.execute("setTimeout(()=>cua.getState({emit:false}).catch(()=>{}),100); nodeRepl.write('scheduled')");assert.equal(first.error,undefined);
  const second=await runtime.execute("await new Promise(r=>setTimeout(r,200)); nodeRepl.write('finished')");assert.equal(second.error,undefined);
  assert.deepEqual(calls,[],'timer from the previous execution must be refused even during a later execution');
});

test('abort waits for backend cleanup and CPU loops cannot block the host',async t=>{
  let stopped=false;const runtime=new ComputerRuntime(async()=>null,{onStop:async()=>{await delay(35);stopped=true;}});t.after(()=>runtime.reset());
  const c=new AbortController(),pending=runtime.execute("nodeRepl.write('loop-started'); while(true){}",{signal:c.signal,timeoutMs:5000}).catch(error=>({error}));
  const deadline=Date.now()+3000;
  while(Date.now()<deadline&&!runtime.current?.blocks.some(block=>block.text==='loop-started'))await delay(5);
  assert.ok(runtime.current?.blocks.some(block=>block.text==='loop-started'),'the CPU loop must have actually started before it is interrupted');
  const start=performance.now();c.abort(new Error('User stop'));
  const result=await pending;assert.equal(stopped,true);assert.match(result.error.message,/User stop/);assert.ok(performance.now()-start<1500);
  const restored=await runtime.execute('nodeRepl.write(42)');assert.equal(restored.blocks[0].text,'42');
});

test('unawaited actions settle before completion and report failures',async t=>{
  let settled=false;
  const runtime=new ComputerRuntime(async()=>{await delay(80);settled=true;throw new Error('action failed');});t.after(()=>runtime.reset());
  const r=await runtime.execute("cua.listApps().catch(()=>{}); nodeRepl.write('queued')");assert.equal(settled,true);assert.match(r.error.message,/action failed/);
});

test('a syntax error reports its source position without running any preceding UI actions',async t=>{
  const calls=[];const runtime=new ComputerRuntime(async method=>{calls.push(method);return [];});t.after(()=>runtime.reset());
  const result=await runtime.execute('await cua.listApps();\nreturn 42;');
  assert.match(result.error.message,/SyntaxError: Illegal return statement.*line 2, column 1/);assert.doesNotMatch(result.error.message,/node:inspector|runtime-worker\.mjs/);assert.deepEqual(calls,[]);
  assert.equal((await runtime.execute('nodeRepl.write(42);')).blocks[0].text,'42');
});

test('an aborted backend cannot finish the tool before stop cleanup completes',async t=>{
  let entered,cleaned=false;
  const ready=new Promise(resolve=>{entered=resolve;});
  const runtime=new ComputerRuntime(async(_method,_args,signal)=>{
    entered();await delay(2000,undefined,{signal});
  },{onStop:async()=>{await delay(70);cleaned=true;}});
  t.after(()=>runtime.reset());
  const controller=new AbortController();
  const pending=runtime.execute('await cua.listApps()',{signal:controller.signal});
  await ready;controller.abort(new Error('cancel fixture'));
  const result=await pending;
  assert.equal(cleaned,true,'the tool result is a boundary after cleanup, not just an abort acknowledgement');
  assert.match(result.error.message,/cancel fixture/);
});

test('backend cleanup errors settle the active tool and leave a resettable worker',async t=>{
  let fail=true,entered;const ready=new Promise(resolve=>{entered=resolve;});
  const runtime=new ComputerRuntime(async()=>{entered();return null;},{onStop:async()=>{if(fail)throw new Error('cleanup fixture failure');}});
  t.after(()=>{fail=false;return runtime.reset();});
  const pending=runtime.execute('await cua.listApps(); await new Promise(r=>setTimeout(r,2000))');
  await ready;
  await assert.rejects(runtime.stop(),/cleanup fixture failure/);
  assert.match((await pending).error.message,/cleanup fixture failure/);
  fail=false;
  assert.equal((await runtime.execute('nodeRepl.write(42)')).blocks[0].text,'42');
});

test('temporary-tab delivery notice accompanies visible screenshots but not silent observations',async t=>{
 const runtime=new ComputerRuntime(async(method,args)=>method==='createBrowserTab'?{id:'one',kind:'tab',browserId:'browser'}:method==='target'&&args[1]==='getScreenshot'?{screenshot:Buffer.from('image').toString('base64'),retention:'temporary'}:{state:'page'});
 t.after(()=>runtime.reset());await runtime.execute("const tab=await cua.createBrowserTab('browser','about:blank');");
 const shown=await runtime.execute('await tab.getScreenshot();');assert.equal(shown.blocks.filter(b=>b.type==='image').length,1);assert.match(shown.blocks.at(-1).text,/will close.*markDeliverable/s);
 const silent=await runtime.execute('await tab.getScreenshot({emit:false});');assert.equal(silent.blocks.length,0);
});

test('large AX output retains its beginning and allows reading the omitted remainder',async t=>{
 const tree='Search field [1]\n'+'中文 🌿\n'.repeat(12000)+'TAIL [2]';
 const runtime=new ComputerRuntime(async(method)=>method==='getApp'?{id:'app',kind:'app'}:{state:tree});t.after(()=>runtime.reset());
 const first=await runtime.execute("const app=await cua.getApp('fixture');");const text=first.blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n');assert.match(text,/Search field \[1\]/);assert.match(text,/output truncated/);assert.doesNotMatch(text,/�/);
 const tail=await runtime.execute('const full=await app.getAXState({emit:false,disableDiffing:true});nodeRepl.write(full.slice(-8));');assert.equal(tail.blocks[0].text,'TAIL [2]');
});
