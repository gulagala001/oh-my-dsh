import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { NativeHost } from '../src/computer-use/native.mjs';

for(const action of ['disable','close'])test(`window sharing is cancelled by ${action} without creating a model session`,async t=>{
  const root=await mkdtemp(join(tmpdir(),'trisoul-cu-share-lifecycle-')),manager=new ComputerUseManager(root,{native:{binary:join(root,'missing')}});
  t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});
  let entered,cleaned=false;const ready=new Promise(resolve=>{entered=resolve;});
  manager.native.shareWindow=async(_window,signal)=>{entered();try{await delay(10000,undefined,{signal});}finally{cleaned=true;}};
  const pending=manager.readWindowShare({window_id:4});const rejected=assert.rejects(pending);
  await ready;
  if(action==='disable')await manager.setEnabled(false);else await manager.close();
  await rejected;assert.equal(cleaned,true);assert.equal(manager.sharing.size,0);assert.equal(manager.sessions.size,0);
  await assert.rejects(manager.readWindowShare(null),/已关闭/);
});

test('failed read-session cleanup stays reachable until its acknowledgement succeeds',async()=>{
  const native=new NativeHost('/tmp/trisoul-share-cleanup-unit');let refused=true,releases=0;
  native.connection=async()=>({info:{_meta:{trisoul:{build:'fixture'}}}});native.expectedBuild=async()=>({build:'fixture'});
  native.call=async()=>({structuredContent:{windows:[]}});
  native.release=async()=>{releases++;if(refused)throw new Error('acknowledgement lost');};
  await assert.rejects(native.shareWindows(),{code:'SHARE_CLEANUP_FAILED'});assert.equal(native.shares.size,1);
  await assert.rejects(native.releaseShares(),{code:'SHARE_CLEANUP_FAILED'});assert.equal(native.shares.size,1);
  refused=false;await native.releaseShares();assert.equal(native.shares.size,0);assert.equal(releases,3);
});
