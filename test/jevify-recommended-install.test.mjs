import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('pinned Jevify release installs or reports its incompatibility, and remains removable', {timeout:180000}, async t => {
  // Pin the existing install/compatibility case. Public latest metadata is tested
  // separately; shared CI IPs can exhaust its anonymous API quota before install.
  const version='0.1.5', asset='https://github.com/gulagala001/jevify/releases/download/v'+version+'/dsh-plugin-jevify-'+version+'.tgz';
  let queryTrace;
  const f=await frontendFixture(t,{setupWorkspace:async({root,home})=>{
    queryTrace=join(root,'metadata-queries.txt');
    const hook=join(root,'jevify-metadata.mjs');
    await writeFile(hook,`import {appendFileSync} from 'node:fs';
export function apply(ctx) {ctx.effect(()=>{
 const previous=globalThis.fetch;
 const wrapped=(input,init)=>{
  if ((typeof input==='string'?input:input.url||String(input))==='https://api.github.com/repos/gulagala001/jevify/releases/latest') {
   appendFileSync(${JSON.stringify(queryTrace)},'query\\n');
   return Promise.resolve(new Response(JSON.stringify({tag_name:'v${version}',draft:false,prerelease:false,assets:[{browser_download_url:'${asset}'}]}),{headers:{'content-type':'application/json'}}));
  }
  return previous(input,init);
 };
 globalThis.fetch=wrapped;return()=>{if(globalThis.fetch===wrapped)globalThis.fetch=previous;};
});}
`);
    await writeFile(join(home,'cordis.patch.yml'),JSON.stringify([{insert:[{id:'jevify-release-metadata-fixture',name:pathToFileURL(hook).href}]}]));
  }}), {page}=f;
  const status=async()=>(await page.request.get(new URL('/trisoul-x/recommended-plugins',page.url()).href)).json();
  let initial=await status();assert.equal(initial.plugins.find(p=>p.id==='jevify').installed,false);
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('dialog',{name:'设置'}).getByRole('button',{name:'推荐插件',exact:true}).click();
  const card=page.locator('.tx-recommended-card').filter({has:page.getByRole('heading',{name:'Jevify',exact:true})});
  await until(()=>card.getByRole('button',{name:'安装',exact:true}).isEnabled());
  await card.getByRole('button',{name:'安装',exact:true}).click();
  const installed = await until(async()=>{const s=await status(), p=s.plugins.find(p=>p.id==='jevify');return !s.busy&&(p.error||p.installed&&p.version)&&p;},120000);
  if (!await card.isVisible()) {
    await page.getByRole('button',{name:'设置',exact:true}).click();
    await page.getByRole('dialog',{name:'设置'}).getByRole('button',{name:'推荐插件',exact:true}).click();
  }
  assert.equal((await readFile(queryTrace,'utf8')).trim(),'query','the controlled metadata route is exercised; the actual release asset still downloads and installs');
  if (installed.error) {
    assert.match(installed.error, /incompatible|不兼容|installSection is not a function/);
    await until(async () => (await card.innerText()).includes(installed.error));
  } else assert.equal(installed.enabled, true);
  if (!installed.installed) {
    assert.ok(installed.error, 'a rejected installation must explain why');
    assert.equal(await card.getByRole('button',{name:'安装',exact:true}).isEnabled(), true);
    assert.deepEqual(f.errors,[]);
    return;
  }
  await until(()=>card.getByRole('button',{name:'卸载',exact:true}).isEnabled());
  await card.getByRole('button',{name:'卸载',exact:true}).click();
  await until(async()=>{const s=await status(),p=s.plugins.find(p=>p.id==='jevify');if(p.error)throw Error(p.error);return !s.busy&&!p.installed;},60000);
  assert.deepEqual(f.errors,[]);
});
