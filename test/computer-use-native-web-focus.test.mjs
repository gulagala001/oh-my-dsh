import test from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';import {keyboardFixture} from './fixtures/computer-use/keyboard.mjs';import {ComputerUseManager} from '../src/computer-use/manager.mjs';
const socket=process.env.TRISOUL_CU_NATIVE_SOCKET;
test('web accessibility activation and held background focus preserve real input and release on stop',{skip:!socket||process.platform!=='darwin',timeout:15000},async t=>{
 const f=await keyboardFixture({web:true}),m=new ComputerUseManager(join(f.root,'host'),{native:{socket}});t.after(async()=>{await m.close();await f.close();console.log('Web focus fixture:',f.root);});
 const run=async c=>{const r=await m.execute('web',c);assert.equal(r.error,undefined,JSON.stringify(r.error));return r;};
 await run(`const app=await cua.getApp(${JSON.stringify(f.bundle)});var s=await app.getAXState({emit:false,disableDiffing:true});const editor=Number(s.match(/\\[(\\d+)\\] AXTextArea 编辑区/)[1]);`);
 const before=await f.command('sample');assert.equal(before.webAXEnabled,true,'the fixture must actually use the web input route');
 for(let i=0;i<3;i++){await run("await app.click(editor);");await run("await app.pressKey('super+a');await app.typeText('web 中文🌿 "+i+"');");await f.until(async()=>(await f.truth()).text==='web 中文🌿 '+i);}
 const active=await f.command('sample');
 await t.test('foreground stays unchanged',()=>assert.equal(active.frontmostPid,before.frontmostPid));
 await t.test('physical mouse stays unchanged',()=>assert.deepEqual(active.mouse,before.mouse));
 await m.stop('web');await f.until(async()=>!(await f.command('sample')).active);
 await assert.rejects(m.execute('web',"await app.typeText('late');"),{code:'COMPUTER_USE_STOPPED'});
 await m.resume('web');await run(`const rebound=await cua.getApp(${JSON.stringify(f.bundle)});const next=await rebound.getAXState({emit:false,disableDiffing:true});await rebound.click(Number(next.match(/\\[(\\d+)\\] AXTextArea 编辑区/)[1]));`);
 const connection=await m.native.connections.get('web');connection.client.child.kill('SIGKILL');
 await f.until(async()=>!(await f.command('sample')).active);
});
