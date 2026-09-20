import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('Jevify GitHub release installs and uninstalls as an optional recommendation', {timeout:180000}, async t => {
  const f=await frontendFixture(t), {page}=f;
  const status=()=>page.evaluate(async()=>{const r=await fetch('/trisoul-x/recommended-plugins');return r.json();});
  let initial=await status();assert.equal(initial.plugins.find(p=>p.id==='jevify').installed,false);
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('dialog',{name:'设置'}).getByRole('button',{name:'推荐插件',exact:true}).click();
  const card=page.locator('.tx-recommended-card').filter({has:page.getByRole('heading',{name:'Jevify',exact:true})});
  await until(()=>card.getByRole('button',{name:'安装',exact:true}).isEnabled());
  await card.getByRole('button',{name:'安装',exact:true}).click();
  await until(async()=>{const s=await status(), p=s.plugins.find(p=>p.id==='jevify');if(p.error)throw Error(p.error);return !s.busy&&p.installed&&p.version==='0.1.5';},120000);
  await until(()=>card.getByRole('button',{name:'卸载',exact:true}).isEnabled());
  await card.getByRole('button',{name:'卸载',exact:true}).click();
  await until(async()=>{const s=await status(),p=s.plugins.find(p=>p.id==='jevify');if(p.error)throw Error(p.error);return !s.busy&&!p.installed;},60000);
  assert.deepEqual(f.errors,[]);
});
