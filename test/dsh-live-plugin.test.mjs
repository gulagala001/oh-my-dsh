import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('DSH alpha.2 live unload/reload releases UI and restores one instance without losing settings or history', { timeout: 90000 }, async t => {
  const f=await frontendFixture(t, { lifecycleTrace: true }), {page}=f, base=new URL(page.url()).origin;
  const credentials=await readFile(join(f.home,'.credentials.yaml'),'utf8');
  const settings=await readFile(join(f.home,'settings.yaml'),'utf8');
  const readState=async()=>{const response=await page.request.get(base+'/trisoul-x/api/state?session='+f.sessionId);assert.ok(response.ok());return response.json();};
  const before=await readState();
  const change=async(name,enabled)=>{
    const method='pluginManager/setBundleEnabled';
    const response=await page.request.post(base+'/api/'+method,{data:{type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args:{name,enabled}}}});
    const value=await response.json(); if (value.result?.value?.application !== 'applied') console.error('Live reload diagnostics', f.log(), await f.lifecycle()); assert.equal(value.result?.ok,true,JSON.stringify(value));assert.equal(value.result.value.application,'applied',JSON.stringify(value));
  };
  for(let cycle=0;cycle<2;cycle++) {
    await change('trisoul_x',false);
    await page.getByRole('button',{name:'打开工作台',exact:true}).waitFor({state:'hidden'});
    await until(()=>page.locator('.tx-cu-chip').count().then(count=>count===0));
    const removed=await page.request.get(base+'/trisoul-x/api/state?session='+f.sessionId);
    assert.ok(!removed.ok() || !removed.headers()['content-type']?.includes('application/json'),'removed plugin no longer owns its HTTP route');
    await change('trisoul_x',true);
    await page.getByRole('button',{name:'打开工作台',exact:true}).waitFor();
    assert.equal(await page.locator('.tx-cu-chip').count(),1);
    assert.equal(await page.locator('style[data-plugin="trisoul-x-computer-use"]').count(),1);
    await page.getByRole('button',{name:'打开工作台',exact:true}).click();
    await page.getByRole('button',{name:'用量详情',exact:true}).waitFor();
  }
  const after=await readState();
  assert.deepEqual(after.tasks,before.tasks);assert.deepEqual(after.metrics,before.metrics);
  assert.equal(await readFile(join(f.home,'.credentials.yaml'),'utf8'),credentials);
  assert.equal(await readFile(join(f.home,'settings.yaml'),'utf8'),settings);
  assert.deepEqual(f.errors,[]);
});
