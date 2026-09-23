import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('Jevify release installs or reports its incompatibility, and remains removable', {timeout:180000}, async t => {
  const f=await frontendFixture(t), {page}=f;
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
