import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('alpha Jevify compatibility preflight blocks UI and direct installation before metadata or downloads', {timeout:180000}, async t => {
  // Observe the known release without downloading it. The current host must
  // reject the recommendation before version lookup or package installation.
  const version='0.1.5', asset='https://github.com/gulagala001/jevify/releases/download/v'+version+'/dsh-plugin-jevify-'+version+'.tgz';
  let queryTrace, observerReady;
  const f=await frontendFixture(t,{setupWorkspace:async({root,home})=>{
    queryTrace=join(root,'metadata-queries.txt');
    observerReady=join(root,'jevify-observer-ready.json');
    await writeFile(queryTrace, '');
    const hook=join(root,'jevify-metadata.mjs');
    await writeFile(hook,`import {appendFileSync,writeFileSync} from 'node:fs';
export function apply(ctx) {ctx.effect(()=>{
 const previous=globalThis.fetch;
 const wrapped=(input,init)=>{
  const url=typeof input==='string'?input:input.url||String(input);
  if (url==='https://api.github.com/repos/gulagala001/jevify/releases/latest') {
   appendFileSync(${JSON.stringify(queryTrace)},'query\\n');
   return Promise.resolve(new Response(JSON.stringify({tag_name:'v${version}',draft:false,prerelease:false,assets:[{browser_download_url:'${asset}'}]}),{headers:{'content-type':'application/json'}}));
  }
  if (url.startsWith('https://github.com/gulagala001/jevify/releases/download/')) {
   appendFileSync(${JSON.stringify(queryTrace)},'download\\n');
   return Promise.reject(new Error('unexpected Jevify download before compatibility preflight'));
  }
  return previous(input,init);
 };
 globalThis.fetch=wrapped;
 writeFileSync(${JSON.stringify(observerReady)},JSON.stringify({active:globalThis.fetch===wrapped}));
 return()=>{if(globalThis.fetch===wrapped)globalThis.fetch=previous;};
});}
`);
    await writeFile(join(home,'cordis.patch.yml'),JSON.stringify([{insert:[{id:'jevify-release-metadata-fixture',name:pathToFileURL(hook).href}]}]));
  }}), {page}=f;
  assert.deepEqual(JSON.parse(await readFile(observerReady,'utf8')),{active:true},'the metadata and download observer is mounted before preflight checks');
  const status=async()=>(await page.request.get(new URL('/trisoul-x/recommended-plugins',page.url()).href)).json();
  const initial=await status(), before=initial.plugins.find(p=>p.id==='jevify');
  assert.equal(initial.busy,null);assert.equal(before.installed,false);
  assert.match(before.unavailable,/0\.1\.5.*不兼容 DSH 0\.2\.1-alpha\.1/);
  const installedBundles=()=>f.rpc('pluginManager/listBundles');
  assert.equal((await installedBundles()).some(bundle=>bundle.name==='dsh-plugin-jevify'),false);
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('dialog',{name:'设置'}).getByRole('button',{name:'推荐插件',exact:true}).click();
  const card=page.locator('.tx-recommended-card').filter({has:page.getByRole('heading',{name:'Jevify',exact:true})});
  await until(async()=>(await card.locator('.tx-recommended-version').innerText()).includes('未安装'));
  assert.equal(await card.locator('.tx-recommended-result.tx-warn').innerText(),before.unavailable);
  assert.equal(await card.getByRole('button',{name:'安装',exact:true}).isEnabled(),false);
  assert.match(await card.locator('.tx-recommended-review').innerText(),/社区推荐 · 兼容性待核验/);
  for (const action of ['install','update']) {
    const rejected=await page.request.post(new URL('/trisoul-x/recommended-plugins',page.url()).href,{data:{id:'jevify',action}});
    assert.equal(rejected.status(),400,action+': authenticated direct requests obey the same compatibility gate');
    assert.deepEqual(await rejected.json(),{error:before.unavailable});
    const current=await status();
    assert.equal(current.busy,null,action+': preflight creates no operation job');
    assert.deepEqual(current.plugins.find(plugin=>plugin.id==='jevify'),before,action+': no operation or install record is created');
    assert.equal((await readFile(queryTrace,'utf8')),'',action+': neither version lookup nor archive download starts');
    assert.equal((await installedBundles()).some(bundle=>bundle.name==='dsh-plugin-jevify'),false);
  }
  assert.equal(await card.getByRole('button',{name:'安装',exact:true}).isEnabled(),false);
  assert.deepEqual(f.errors,[]);
});
