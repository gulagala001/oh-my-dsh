import test from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';import {homedir} from 'node:os';
import {keyboardFixture} from './fixtures/computer-use/keyboard.mjs';import {ComputerUseManager} from '../src/computer-use/manager.mjs';
const socket=process.env.TRISOUL_CU_NATIVE_SOCKET;
test('window-bound input supports apps without AX control focus but rejects unknown window focus',{skip:!socket||process.platform!=='darwin',timeout:20000},async t=>{
 const fixture=await keyboardFixture(),manager=new ComputerUseManager(join(fixture.root,'host'),{native:{socket,binary:process.env.TRISOUL_CU_NATIVE_BINARY??join(homedir(),'Applications/Trisoul Computer Use.app/Contents/MacOS/trisoul-computer-use')}});
 t.after(async()=>{await manager.close();await fixture.close();console.log('Opaque-focus fixture:',fixture.root);});
 const run=async code=>{const r=await manager.execute('opaque',code);assert.equal(r.error,undefined,JSON.stringify(r.error));return r;};
 await run(`const app=await cua.getApp(${JSON.stringify(fixture.bundle)});await app.getScreenshot();await app.click([350,190]);`);
 await fixture.command('focus-editor');await fixture.command('ax-focus',{hidden:true});
 const observation=await run('await app.getAXState({disableDiffing:true});');assert.match(observation.blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n'),/No focused element/);
 const before=await fixture.command('sample');
 await run("await app.pressKey('super+a');await app.typeText('中文🌿\\nSecond');await app.pressKey('super+s');");
 await fixture.until(async()=>{const v=await fixture.truth();return v.text==='中文🌿\nSecond'&&v.action==='saved';});
 await run("await app.pressKey('super+a');await app.paste('不暴露焦点的粘贴 🌿');");
 await fixture.until(async()=>(await fixture.truth()).text==='不暴露焦点的粘贴 🌿');
 const after=await fixture.command('sample');assert.equal(after.frontmostPid,before.frontmostPid);assert.deepEqual(after.mouse,before.mouse);
 await fixture.command('ax-focus',{hidden:true,missingWindow:true});const count=(await fixture.truth()).events.filter(e=>e.kind==='key-down').length;
 const denied=await manager.execute('opaque',"await app.typeText('must not type');");assert.ok(denied.error);assert.equal((await fixture.truth()).events.filter(e=>e.kind==='key-down').length,count);
});
