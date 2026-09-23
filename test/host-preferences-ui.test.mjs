import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {frontendFixture,until} from './fixtures/frontend.mjs';

test('native work-details and busy-Enter preferences persist once through the replacement providers',{timeout:90000},async t=>{
 const f=await frontendFixture(t),{page}=f;
 const mutations=[];page.on('response',r=>{if(r.url().includes('/api/settings/mutate'))void r.json().then(value=>mutations.push({request:r.request().postDataJSON(),response:value}));});
 t.after(()=>{if(!t.passed)console.error(JSON.stringify(mutations),f.diagnostics());});
 const open=async()=>{await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'通用设置',exact:true}).click();};
 const row=title=>page.getByRole('dialog').getByText(title,{exact:true}).locator('..').locator('..');
 await open();
 for(const label of ['详细','完全展开','简洁']){
  await row('工作过程展示').getByRole('button').click();
  await page.getByRole('menuitem',{name:label,exact:true}).click();
  await until(async()=>await row('工作过程展示').getByRole('button').innerText()===label);
 }
 await row('工作过程展示').getByRole('button').click();await page.getByRole('menuitem',{name:'详细',exact:true}).click();
 await row('繁忙时的发送行为').getByRole('button').click();await page.getByRole('menuitem',{name:'插话发送',exact:true}).click();
 await until(()=>mutations.length>=5);
 const config=()=>readFile(join(f.home,'profiles/trisoul-x/cordis.patch.yml'),'utf8');
 await until(async()=>{const text=await config();return /transcriptView: detailed/.test(text)&&/busyEnter: steer/.test(text);});
 await page.keyboard.press('Escape');await page.reload();await page.getByRole('button',{name:'打开工作台',exact:true}).waitFor();
 await open();
 assert.match(await row('工作过程展示').getByRole('button').innerText(),/详细/);
 assert.match(await row('繁忙时的发送行为').getByRole('button').innerText(),/插话发送/);
 assert.equal(mutations.length,5,'each choice writes once through the native form');
 assert.deepEqual(f.errors,[]);
});
