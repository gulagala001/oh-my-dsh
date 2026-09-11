import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { nativePastePayload } from '../src/computer-use/paste.mjs';

test('paste converts structured Markdown and HTML without loading resources', () => {
  const payload=nativePastePayload('CU **bold** &amp; *italic*\n\n## Heading\n\n- first\n- second\n\n[link](https://example.com)',{format:'md'});
  assert.match(payload.html,/<strong>bold<\/strong>/);assert.match(payload.html,/<h2>Heading<\/h2>/);
  assert.match(payload.text,/CU bold & italic/);assert.match(payload.text,/Heading/);assert.doesNotMatch(payload.text,/https|<strong>|\*\*/);
  assert.equal(nativePastePayload('<p>CU &lt;name&gt; 🌿</p><script>hidden</script>',{format:'html'}).text,'CU <name> 🌿');
  assert.deepEqual(nativePastePayload('CU **literal**'),{text:'CU **literal**'});
  assert.throws(()=>nativePastePayload('x',{format:'pdf'}),/format/);
});

const socket=process.env.TRISOUL_CU_NATIVE_SOCKET;
test('native paste: rich formats and clipboard lifecycle in an actual editor', {skip:process.platform!=='darwin'||!socket,timeout:45000},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'trisoul-cu-paste-'));
  const bundle='ai.trisoul.paste.test.'+process.pid,app=join(directory,'Paste.app'),report=join(directory,'truth.json'),command=join(directory,'command.json');
  const manager=new ComputerUseManager(join(directory,'host'),{native:{socket,binary:process.env.TRISOUL_CU_NATIVE_BINARY??join(homedir(),'Applications/Trisoul Computer Use.app/Contents/MacOS/trisoul-computer-use')}});
  const read=async()=>{try{return JSON.parse(await readFile(report,'utf8'));}catch{return null;}};
  const wait=async predicate=>{for(let i=0;i<300;i++){const value=await read();if(value&&predicate(value))return value;await delay(10);}assert.fail('Fixture did not reach the expected state');};
  const cmd=async(action,args={})=>{const id=randomUUID();await writeFile(command+'.tmp',JSON.stringify({id,action,...args}));await rename(command+'.tmp',command);return wait(value=>value.commandId===id);};
  let pid;
  t.after(async()=>{await manager.close();if(pid){await cmd('quit').catch(()=>{});for(let i=0;i<100;i++){try{process.kill(pid,0);}catch{break;}await delay(10);}}console.log('Paste artifacts:',directory);});
  await mkdir(join(app,'Contents/MacOS'),{recursive:true});
  execFileSync('clang',['-fobjc-arc','-framework','Cocoa',new URL('./fixtures/computer-use/NativePasteFixture.m',import.meta.url).pathname,'-o',join(app,'Contents/MacOS/Paste')]);
  await writeFile(join(app,'Contents/Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundle}</string><key>CFBundleName</key><string>Trisoul Paste Fixture</string><key>CFBundleExecutable</key><string>Paste</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  execFileSync('open',['-n','-g',app,'--args','--report',report,'--command',command]);pid=(await wait(value=>value.pid)).pid;
  const execute=async code=>{const result=await manager.execute('paste',code);assert.equal(result.error,undefined,JSON.stringify(result.error));return result;};
  await execute(`const app=await cua.getApp(${JSON.stringify(bundle)});`);
  await cmd('seed');
  const verify=async()=>{const value=await cmd('sample');assert.equal(value.clipboardRestored,true,'all original clipboard items/types/bytes restored');assert.equal(value.frontmost,false,'background editor did not take the user’s foreground');return value;};
  await t.test('Unicode plain text and exact selection replacement',async()=>{
    await cmd('reset');await execute(`await app.paste('CU paste 中文🌿\\nsecond line');`);
    assert.equal((await verify()).text,'CU paste 中文🌿\nsecond line');
    await execute(String.raw`const state=await app.getAXState({emit:false,disableDiffing:true});const editor=Number(state.match(/\[(\d+)\] AXTextArea Paste editor/)[1]);await app.selectText(editor,'中文🌿');await app.paste('替换');`);
    assert.equal((await verify()).text,'CU paste 替换\nsecond line');
    await execute("await app.selectText(editor,'替换');await app.paste('替换');");assert.equal((await verify()).text,'CU paste 替换\nsecond line');
  });
  for(const format of ['md','html'])await t.test(format+' preserves visible formatting and links',async()=>{
    await cmd('reset');const text=format==='md'?'CU **bold** and *italic*\n\n## Heading\n\n- first\n- second\n\n[link](https://example.com)':'<p>CU <strong>bold</strong> and <em>italic</em></p><h2>Heading</h2><ul><li>first</li><li>second</li></ul><p><a href="https://example.com">link</a></p>';
    await execute(`await app.paste(${JSON.stringify(text)},{format:${JSON.stringify(format)}});`);const value=await verify();
    assert.ok(value.runs.some(run=>run.text==='bold'&&run.bold));assert.ok(value.runs.some(run=>run.text==='italic'&&run.italic));
    assert.ok(value.runs.some(run=>run.text.startsWith('Heading')&&run.bold&&run.size>12));assert.ok(value.runs.some(run=>run.text==='link'&&run.link==='https://example.com/'));
    assert.match(value.text,/first[\s\S]*second/);const image=(await execute('await app.getScreenshot();')).blocks.find(block=>block.type==='image');await writeFile(join(directory,format+'.png'),Buffer.from(image.data,'base64'));
  });
  await t.test('delayed consumption waits and restores every original clipboard representation',async()=>{
    await cmd('reset',{delay:400});const start=performance.now();await execute("await app.paste('CU delayed **bold**',{format:'md'});");assert.ok(performance.now()-start>=350);assert.match((await verify()).text,/CU delayed bold/);
  });
  await t.test('rich paste falls back to rendered text in a plain editor',async()=>{
    await cmd('reset',{plain:true});await execute("await app.paste('CU **bold** &amp; *italic*',{format:'md'});");assert.equal((await verify()).text,'CU bold & italic');
  });
  await t.test('read-only editor reports unconfirmed paste and still restores the clipboard',async()=>{
    await cmd('reset',{readonly:true});const result=await manager.execute('paste',"await app.paste('CU must not be inserted');");assert.match(result.error.message,/not confirmed/);assert.equal((await verify()).text,'');
  });
  await t.test('stop during delayed paste waits for submitted action and prevents the next input',async()=>{
    await cmd('reset',{delay:400});const count=(await read()).events.length;
    const pending=manager.execute('paste',"await app.paste('CU stop **bold**',{format:'md'});await app.paste('CU late');");await wait(value=>value.events.slice(count).some(e=>e.event==='paste-invoked'));
    await manager.stop('paste');assert.match((await pending).error.message,/Stopped/);const value=await verify();assert.match(value.text,/CU stop bold/);await delay(500);assert.equal((await read()).text,value.text);
    await manager.resume('paste');await execute(`const app=await cua.getApp(${JSON.stringify(bundle)});`);
  });
  await t.test('two app sessions serialize clipboard use, and a waiting paste can be stopped',async()=>{
    const secondApp=join(directory,'Second.app'),secondReport=join(directory,'second.json'),secondCommand=join(directory,'second-command.json');
    await cp(app,secondApp,{recursive:true});const plist=join(secondApp,'Contents/Info.plist');await writeFile(plist,(await readFile(plist,'utf8')).replace(bundle,bundle+'.second'));
    execFileSync('open',['-n','-g',secondApp,'--args','--report',secondReport,'--command',secondCommand]);
    let ready;for(let i=0;i<200;i++){try{ready=JSON.parse(await readFile(secondReport,'utf8'));if(ready.pid)break;}catch{}await delay(10);}assert.ok(ready?.pid);
    try{
      const bound=await manager.execute('second',`const app=await cua.getApp(${JSON.stringify(bundle+'.second')});`);assert.equal(bound.error,undefined);
      await cmd('reset',{delay:400});let count=(await read()).events.length;
      let pending=manager.execute('paste',"await app.paste('CU first **bold**',{format:'md'});");await wait(value=>value.events.slice(count).some(e=>e.event==='paste-invoked'));
      let queued=manager.execute('second',"await app.paste('CU second **italic**',{format:'md'});");
      assert.equal((await pending).error,undefined);assert.equal((await queued).error,undefined);
      assert.match((await verify()).text,/CU first bold/);assert.match(JSON.parse(await readFile(secondReport,'utf8')).text,/CU second italic/);
      await cmd('reset',{delay:400});count=(await read()).events.length;
      pending=manager.execute('paste',"await app.paste('CU first again');");await wait(value=>value.events.slice(count).some(e=>e.event==='paste-invoked'));
      queued=manager.execute('second',"await app.paste('CU must not run');");await delay(40);await manager.stop('second');assert.match((await queued).error.message,/Stopped/);assert.equal((await pending).error,undefined);
      assert.equal((await verify()).text,'CU first again');await delay(100);assert.match(JSON.parse(await readFile(secondReport,'utf8')).text,/^CU second italic\s*$/);
    }finally{await manager.stop('second').catch(()=>{});await writeFile(secondCommand,JSON.stringify({id:randomUUID(),action:'quit'}));}
  });
  await t.test('a copy while paste is pending is preserved',async()=>{
    await cmd('reset',{delay:400});const count=(await read()).events.length;
    const pending=manager.execute('paste',"await app.paste('CU interrupted **bold**',{format:'md'});");await wait(value=>value.events.slice(count).some(e=>e.event==='paste-invoked'));await cmd('copy');
    assert.match((await pending).error.message,/clipboard changed/i);await delay(500);assert.equal((await cmd('sample')).copyPreserved,true);
  });
});
