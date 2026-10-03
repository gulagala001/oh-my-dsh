import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { frontendFixture, until } from './fixtures/frontend.mjs';

const sourceArchive = fileURLToPath(new URL('./fixtures/turn-rewind/source.tar.gz', import.meta.url));
async function checkedArchive() {
  assert.equal(createHash('sha256').update(await readFile(sourceArchive)).digest('hex'), 'f4ca526ccf81d499546276cebeceb8e2cf0b9f3393bae68751c7440848ab16f2');
  return sourceArchive;
}

// Executes only pinned source in an isolated fixture; lifecycle scripts are disabled.
test('incompatible pinned rewind is rejected and the native manager restores the profile', {timeout:180000}, async t=>{
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
  assert.equal(result.application,'failed',JSON.stringify(result));
  assert.equal(result.error?.code,'incompatible-version');
  assert.ok(result.error.incompatible.some(item=>item.name===name&&item.runtimeVersion==='0.2.1-alpha.1'));
  assert.equal((await call('listBundles',{})).some(b=>b.name===name&&b.installed),false);
  const profile=JSON.parse(await readFile(join(f.home,'profiles','trisoul-x','package.json'),'utf8'));
  assert.equal(profile.dependencies?.[name],undefined,'rejected installation must restore the profile manifest');
  await assert.rejects(access(join(f.root,'rewind-state')), {code:'ENOENT'});
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:f.sessionId,mode:'queue',content:[{type:'text',text:'拒绝不兼容插件后继续工作'}]});
  await until(async()=> (await (await f.page.request.get(new URL('/trisoul-x/api/state?session='+f.sessionId,f.page.url()).href)).json()).running==='idle');
  assert.deepEqual(f.errors,[]);

});

test('the exact reviewed codeload archive cannot bypass the host compatibility guard', {timeout:90000}, async t=>{
  const f=await frontendFixture(t,{headless:true,omdConfig:{computerUseEnabled:false,codegraphEnabled:false,dreamAutoEnabled:false}});
  // The user layer supplies a fixture-only state directory; archive bytes stay
  // exactly the reviewed SHA-256 rather than being repacked for this assertion.
  await writeFile(join(f.home,'profiles','trisoul-x','cordis.patch.yml'),JSON.stringify([{id:'turn-rewind',config:{storageDir:join(f.root,'rewind-exact-state')}}]));
  const name='@anionex/dsh-turn-rewind',file=await checkedArchive();
  const installed=await f.call('pluginManager/installBundle',{spec:name+'@file:'+file,options:{enabled:true,requestId:crypto.randomUUID()}});
  assert.equal(installed.result?.ok,true,JSON.stringify(installed));
  const result=installed.result.value;
  assert.equal(result.application,'failed',JSON.stringify(result));
  assert.equal(result.error?.code,'incompatible-version');
  assert.ok(result.error.incompatible.some(item=>item.name===name&&item.runtimeVersion==='0.2.1-alpha.1'));
  await assert.rejects(access(join(f.root,'rewind-exact-state')), {code:'ENOENT'});
  assert.equal(JSON.parse(await readFile(join(f.home,'profiles','trisoul-x','package.json'),'utf8')).dependencies?.[name],undefined);

});
