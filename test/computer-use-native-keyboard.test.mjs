import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {writeFile} from 'node:fs/promises';
import {keyboardFixture} from './fixtures/computer-use/keyboard.mjs';
import {ComputerUseManager} from '../src/computer-use/manager.mjs';

const socket=process.env.TRISOUL_CU_NATIVE_SOCKET;
test('native keyboard and clicks reach the actual target without moving user focus',{skip:process.platform!=='darwin'||!socket,timeout:45000},async t=>{
  const fixture=await keyboardFixture(),manager=new ComputerUseManager(join(fixture.root,'host'),{native:{socket,binary:process.env.TRISOUL_CU_NATIVE_BINARY}});
  t.after(async()=>{await writeFile(join(fixture.root,'final.json'),JSON.stringify(await fixture.truth(),null,2));await manager.close();await fixture.close();console.log('Native keyboard artifacts:',fixture.root);});
  const run=async code=>{const result=await manager.execute('keys',code);assert.equal(result.error,undefined,JSON.stringify(result.error));return result;};
  await run(`const app=await cua.getApp(${JSON.stringify(fixture.bundle)});const state=await app.getAXState({emit:false,disableDiffing:true});const editor=Number(state.match(/\\[(\\d+)\\] AXTextArea 编辑区/)[1]);const pad=Number(state.match(/\\[(\\d+)\\] AXGroup 事件区/)[1]);await app.getScreenshot();`);
  await t.test('element triple clicks and middle/right buttons are not replaced by a single semantic action',async()=>{
    await fixture.command('reset');await run("await app.click(pad,{clickCount:3});await app.click(pad,{mouseButton:'middle',clickCount:2});await app.click(pad,{mouseButton:'right'});");
    await fixture.until(async()=>(await fixture.truth()).events.some(event=>event.kind==='right-up'));
    const events=(await fixture.truth()).events.filter(event=>event.clickCount!==undefined);
    assert.deepEqual(events.map(e=>[e.kind,e.button,e.clickCount]),[['mouse-down',0,1],['mouse-up',0,1],['mouse-down',0,2],['mouse-up',0,2],['mouse-down',0,3],['mouse-up',0,3],['other-down',2,1],['other-up',2,1],['other-down',2,2],['other-up',2,2],['right-down',1,1],['right-up',1,1]]);
  });
  await t.test('keysym aliases, uppercase, shifted punctuation and keypad retain real key codes',async()=>{
    await fixture.command('reset');await run("await app.click([350,458]);for(const key of ['KP_0','A','plus','Control_L+Shift_L+period','F13','Page_Down',' ctrl + a '])await app.pressKey(key);");
    await fixture.until(async()=>(await fixture.truth()).events.filter(event=>event.kind==='key-up').length===7);
    const events=(await fixture.truth()).events,down=events.filter(e=>e.kind==='key-down');assert.deepEqual(down.map(e=>e.keyCode),[82,0,24,47,105,121,0]);
    assert.equal(down[0].characters,'0');assert.equal(down[1].characters,'A');assert.equal(down[2].characters,'+');assert.equal(down[1].flags&131072,131072);assert.equal(down[3].flags&(131072|262144),131072|262144);
    assert.equal(events.filter(e=>e.kind==='flags').at(-1).flags&0x1e0000,0,'modifiers are released after the chord');
  });
  await t.test('navigation, selection, menu shortcuts and Unicode typing operate on the actual editor',async()=>{
    const baseline=await fixture.command('reset');await run("await app.click(editor);await app.pressKey('super+a');await app.typeText('中文🌿\\nsecond');");
    try{await fixture.until(async()=>(await fixture.truth()).text==='中文🌿\nsecond');}catch(error){const value=await fixture.truth();await writeFile(join(fixture.root,'editor-failure.json'),JSON.stringify(value,null,2));console.log('Editor failure:',{text:value.text,focus:value.focus,selection:value.selection});throw error;}
    let value=await fixture.truth();assert.ok(value.events.some(event=>event.kind==='key-down'&&event.keyCode===36),'newline is delivered as Return');
    await run("await app.pressKey('super+Left');await app.pressKey('shift+Right');await app.typeText('S');await app.pressKey('super+s');");
    await fixture.until(async()=>{const v=await fixture.truth();return v.action==='saved'&&v.text==='中文🌿\nSecond';});
    value=await fixture.command('sample');assert.equal(value.frontmostPid,baseline.frontmostPid,'the user foreground remains unchanged');assert.deepEqual(value.mouse,baseline.mouse,'the physical pointer remains unchanged');
  });
  await t.test('invalid click counts and modifier-only chords cannot silently perform input',async()=>{
    await fixture.command('reset');const start=(await fixture.truth()).events.length;
    for(const code of ["await app.click(pad,{clickCount:0});","await app.click(pad,{clickCount:1.5});","await app.click(pad,{mouseButton:'unknown'});","await app.pressKey('Shift_L');"]){const result=await manager.execute('keys',code);assert.ok(result.error,code);}
    await delay(40);assert.equal((await fixture.truth()).events.length,start);
  });
  await t.test('repeated background focus remains valid across separate calls and screenshot allocations',async()=>{
    await fixture.command('reset');await run('await app.click(editor);');
    for(let i=0;i<40;i++){
      await run("await app.pressKey('super+a');await app.typeText('round '+"+i+");");
      if(i%5===0)await run('await app.getAXStateAndScreenshot({emit:false});');
    }
    await fixture.until(async()=>(await fixture.truth()).text==='round 39');
  });
  await t.test('cancelling long typing releases the last key and blocks queued shortcuts',async()=>{
    await fixture.command('reset');await run('await app.click([350,458]);');
    const pending=manager.execute('keys',"await app.typeText('x'.repeat(2000));await app.pressKey('super+s');");
    await fixture.until(async()=>(await fixture.truth()).events.filter(e=>e.kind==='key-down').length>40);await manager.stop('keys');assert.ok((await pending).error);
    await delay(60);const stopped=await fixture.truth(),events=stopped.events.filter(event=>['key-down','key-up'].includes(event.kind));assert.equal(events.at(-1).kind,'key-up');assert.equal(events.filter(e=>e.kind==='key-down').length,events.filter(e=>e.kind==='key-up').length);assert.equal(stopped.action,'');
    await delay(80);assert.equal((await fixture.truth()).events.length,stopped.events.length);
  });
  await t.test('a lost input transport can reset only after its lease has actually ended',async()=>{
    await manager.resume('keys');await fixture.command('reset');
    await run(`const rebound=await cua.getApp(${JSON.stringify(fixture.bundle)});await rebound.getScreenshot();await rebound.click([350,458]);`);
    const connection=await manager.native.connections.get('keys');
    const pending=manager.execute('keys',"await rebound.typeText('x'.repeat(2000));await rebound.pressKey('super+s');");
    await fixture.until(async()=>(await fixture.truth()).events.filter(e=>e.kind==='key-down').length>20);connection.client.child.kill('SIGKILL');assert.ok((await pending).error);
    await manager.reset('keys');assert.equal(manager.native.connections.has('keys'),false);assert.equal([...manager.native.targets.values()].some(target=>target.sessionId==='keys'),false);
    await delay(60);const stopped=await fixture.truth();assert.equal(stopped.action,'');const keys=stopped.events.filter(e=>['key-down','key-up'].includes(e.kind));assert.equal(keys.at(-1).kind,'key-up');
    await delay(60);assert.equal((await fixture.truth()).events.length,stopped.events.length);
    await run(`const recovered=await cua.getApp(${JSON.stringify(fixture.bundle)});await recovered.getAXState();`);
  });
});
