import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { frontendFixture, until } from './fixtures/frontend.mjs';

const sourceArchive = fileURLToPath(new URL('./fixtures/turn-rewind/source.tar.gz', import.meta.url));
async function checkedArchive() {
  assert.equal(createHash('sha256').update(await readFile(sourceArchive)).digest('hex'), 'f4ca526ccf81d499546276cebeceb8e2cf0b9f3393bae68751c7440848ab16f2');
  return sourceArchive;
}

// Executes only pinned source in an isolated fixture; lifecycle scripts are disabled.
test('pinned rewind installs enabled and uninstalls through the isolated native manager', {timeout:180000}, async t=>{
  const f=await frontendFixture(t,{headless:false,omdConfig:{computerUseEnabled:false,codegraphEnabled:false,dreamAutoEnabled:false}});
  f.call=(method,args)=>f.page.evaluate(async({method,args})=>(await fetch('api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args}})})).json(),{method,args});
  const installSource=join(f.root,'rewind-install-source');
  await mkdir(installSource);
  await promisify(execFile)('tar',['-xzf',await checkedArchive(),'-C',installSource,'--strip-components=1'],{timeout:30000});
  // Only this fixture copy's config is changed. The upstream runtime stays intact
  // and checkpoint/rescue state is forced into the temporary fixture directory.
  await writeFile(join(installSource,'cordis.patch.yml'),JSON.stringify([{insert:[{id:'turn-rewind',name:'@anionex/dsh-turn-rewind',config:{storageDir:join(f.root,'rewind-state')}}]}]));
  const {stdout}=await promisify(execFile)(process.platform==='win32'?'npm.cmd':'npm',['--cache',join(f.root,'npm-cache'),'pack','--json','--ignore-scripts','--pack-destination',f.root],{cwd:installSource,timeout:30000,shell:process.platform==='win32'});
  const packed=JSON.parse(stdout)[0];assert.equal(packed.name,'@anionex/dsh-turn-rewind');assert.equal(packed.version,'0.3.9');
  const call=async(method,args)=>{const r=await f.call('pluginManager/'+method,args);assert.equal(r.result?.ok,true,JSON.stringify(r));return r.result.value;};
  const name='@anionex/dsh-turn-rewind';assert.equal((await call('listBundles',{})).some(b=>b.name===name),false);
  const result=await call('installBundle',{spec:name+'@file:'+join(f.root,packed.filename),options:{enabled:true,requestId:crypto.randomUUID()}});
  assert.equal(result.application,'applied',JSON.stringify(result));
  const bundle=(await call('listBundles',{})).find(b=>b.name===name);assert.equal(bundle?.enabled,true);assert.equal(bundle?.version,'0.3.9');
  assert.equal((await stat(join(f.root,'rewind-state'))).isDirectory(),true,'rewind state must stay inside the fixture');
  const disabled=await call('setBundleEnabled',{name,enabled:false});assert.equal(disabled.application,'applied');assert.equal((await call('listBundles',{})).find(b=>b.name===name).enabled,false);
  const enabled=await call('setBundleEnabled',{name,enabled:true});assert.equal(enabled.application,'applied');
  const dialog=f.page.getByRole('dialog',{name:'设置'});
  const open=async()=>{await f.page.getByRole('button',{name:'设置',exact:true}).click();await dialog.getByRole('button',{name:'内置插件',exact:true}).click();await dialog.getByText('Turn Rewind 回退设置',{exact:true}).first().click();await dialog.getByRole('button',{name:/Turn Rewind 回退设置/}).last().click();};
  await f.page.reload();await open();
  await until(async()=>!(await dialog.innerText()).includes('正在加载设置'));
  assert(! (await dialog.innerText()).includes('此部署没有设置服务'));
  const mode=dialog.locator('.dcl-trs-field').filter({hasText:'自动文件检查点'}).locator('select');assert.equal(await mode.isEnabled(),true);
  const saved=f.page.waitForResponse(r=>r.request().method()==='POST'&&r.request().postData()?.includes('turnCheckpointMode'));
  await mode.selectOption('off');assert.equal((await saved).ok(),true);await f.page.reload();await open();
  await until(async()=>(await mode.inputValue())==='off');
  await f.page.screenshot({path:join(f.root,'rewind-native-settings.png')});
  const removed=await call('removeBundle',{name});assert.equal(removed.application,'applied');
  assert.equal((await call('listBundles',{})).some(b=>b.name===name),false);
});

test('the exact reviewed codeload archive installs through the native one-click contract', {timeout:90000}, async t=>{
  const f=await frontendFixture(t,{headless:true,omdConfig:{computerUseEnabled:false,codegraphEnabled:false,dreamAutoEnabled:false}});
  // The user layer supplies a fixture-only state directory; archive bytes stay
  // exactly the reviewed SHA-256 rather than being repacked for this assertion.
  await writeFile(join(f.home,'profiles','trisoul-x','cordis.patch.yml'),JSON.stringify([{id:'turn-rewind',config:{storageDir:join(f.root,'rewind-exact-state')}}]));
  const name='@anionex/dsh-turn-rewind',file=await checkedArchive();
  const installed=await f.call('pluginManager/installBundle',{spec:name+'@file:'+file,options:{enabled:true,requestId:crypto.randomUUID()}});
  assert.equal(installed.result?.ok,true,JSON.stringify(installed));assert.equal(installed.result.value.application,'applied',JSON.stringify(installed));
  assert.equal((await stat(join(f.root,'rewind-exact-state'))).isDirectory(),true);
  const removed=await f.call('pluginManager/removeBundle',{name});assert.equal(removed.result?.ok,true);assert.equal(removed.result.value.application,'applied');
});
