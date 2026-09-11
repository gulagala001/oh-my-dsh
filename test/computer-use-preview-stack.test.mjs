import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ComputerUseManager} from '../src/computer-use/manager.mjs';
import {startFixture} from './fixtures/computer-use/server.mjs';
const until=async fn=>{for(let i=0;i<250;i++){if(await fn())return;await delay(20);}throw Error('stack preview timed out');};
test('stacked observers keep both tabs live, reject input and foreign sessions, and reveal the selected tab',{timeout:30000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'trisoul-stack-')),manager=new ComputerUseManager(root),fixture=await startFixture();
  t.after(async()=>{await manager.close();await fixture.close();});
  const a=await manager.dispatch('stack','createBrowserTab',['browser',fixture.url]);
  let frameA,actor,closedA=false;const stopA=await manager.watchBrowser('stack',a.id,(event,value)=>{if(event==='frame')frameA=value;if(event==='ready')actor=value.actor;if(event==='closed')closedA=true;},undefined,true);
  await until(()=>frameA);const b=await manager.dispatch('stack','createBrowserTab',['browser',fixture.url+'/second']);
  let frameB;const stopB=await manager.watchBrowser('stack',b.id,(event,value)=>{if(event==='frame')frameB=value;},undefined,true);await until(()=>frameB);
  assert.equal(closedA,false);assert.equal(manager.status('stack').previewTargets.length,2);
  const old=frameA.data;await manager.browserViews.views.get(a.id).record.page.getByLabel('姓名',{exact:true}).fill('旧目标继续实时更新');await until(()=>frameA.data!==old);
  await assert.rejects(manager.watchBrowser('foreign',a.id,()=>{},undefined,true));
  await assert.rejects(manager.revealPreview('foreign',{targetId:a.id,controlEpoch:0}));
  await manager.revealPreview('stack',{targetId:a.id,controlEpoch:manager.status('stack').controlEpoch});
  assert.equal(manager.status('stack').target.id,a.id);
  await assert.rejects(manager.manualInput('stack',{actor,tabId:a.id,controlEpoch:manager.status('stack').controlEpoch,type:'pointerdown',x:.5,y:.5}));
  await manager.browserViews.views.get(b.id).record.page.close();
  await until(()=>manager.status('stack').previewTargets.length===1);assert.equal(manager.status('stack').target.id,a.id);
  await stopA();await stopB();assert.equal(manager.session('stack').viewers.size,0);
  assert.equal(manager.browser.records.has(a.id),true);
});

test('closing an older app preview does not clear or mark the current target as failed',async t=>{
  const manager=new ComputerUseManager(await mkdtemp(join(tmpdir(),'trisoul-stack-closed-')));t.after(()=>manager.close());
  const state=manager.session('apps');state.target={id:'current',viewId:'current',kind:'app'};
  state.previewTargets.set('old',{target:{id:'old',viewId:'old',kind:'app'},native:{pid:101}});
  let publish;manager.nativeViews.subscribe=async(_id,_target,listener)=>{publish=listener;return async()=>{};};
  const close=await manager.watchNative('apps','old',()=>{},undefined,true);
  publish('closed',{reason:'APP_EXITED'});
  assert.equal(state.target.id,'current');assert.equal(state.lastError,undefined);assert.equal(state.previewTargets.has('old'),false);await close();
});
