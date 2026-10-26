import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Hub } from '../src/hub.mjs';
import { HubStore } from '../src/hub-store.mjs';
import { MonitorLedger } from '../src/monitor-ledger.mjs';
import { isLocalImagePreflight } from '../src/monitor-attempt.mjs';

test('local image preflight and recovery remain evidence without becoming provider calls or charges', t => {
  const dir=mkdtempSync(join(tmpdir(),'omd-preflight-')),monitor=new MonitorLedger(dir),store=new HubStore(dir);
  t.after(()=>{monitor.close();rmSync(dir,{recursive:true,force:true});});
  const hub=Object.assign(Object.create(Hub.prototype),{monitor,store}),session={id:'session',header:{cwd:'/synthetic'},requestHeader:()=>({config:{}}),snapshotEvents:()=>[]};
  const entry={id:'native:session:1',source:'native',at:1000,turn:1,step:1,status:'error',hasOutput:false,usage:null,failure:{code:'IMAGE_OFFLOAD_REQUIRED',message:'local image preparation required'}};
  monitor.append({ ...entry,sessionId:session.id,kind:'main' });
  assert.equal(monitor.db.prepare('select count(*) n from calls').get().n,1);
  assert.equal(isLocalImagePreflight(entry),true);hub.record(session,'main',entry);
  assert.equal(monitor.db.prepare('select count(*) n from calls').get().n,0);
  let event=monitor.db.prepare('select * from events').get();assert.equal(event.status,'local');assert.equal(JSON.parse(event.data).providerRequestSent,false);
  hub.record(session,'main',{id:'native:session:2',source:'native',at:1100,turn:1,step:1,status:'success',hasOutput:true,usage:{inputTokens:10,outputTokens:2,totalTokens:12}});
  assert.equal(monitor.db.prepare('select count(*) n from calls').get().n,1);
  event=monitor.db.prepare('select * from events').get();assert.equal(event.status,'recovered');assert.equal(JSON.parse(event.data).code,'IMAGE_OFFLOAD_REQUIRED');
  monitor.append({...entry,sessionId:session.id,kind:'main'});assert.equal(monitor.db.prepare('select count(*) n from calls').get().n,1);
  for(const value of [{...entry,failure:{code:'OVERLOADED'}},{...entry,hasOutput:true},{...entry,usage:{inputTokens:1}}])assert.equal(isLocalImagePreflight(value),false);
  hub.record(session,'main',{...entry,id:'native:session:3',failure:{code:'OVERLOADED',message:'provider overloaded'},error:'provider overloaded'});
  assert.equal(monitor.db.prepare('select count(*) n from calls where status=?').get('error').n,1);
});
