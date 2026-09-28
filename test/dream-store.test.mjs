import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DreamStore } from '../src/dream/store.mjs';
import { splitSource, summaryFingerprint, validateMemory, nodeKey } from '../src/dream/core.mjs';

function setup(t){
  const dir=mkdtempSync(join(tmpdir(),'omd-dream-')),stores=[];let now=Date.UTC(2026,8,28);
  const open=()=>{const store=new DreamStore(dir,{now:()=>now});stores.push(store);return store;},a=open();
  // Node runs after hooks in registration order. Close every connection before
  // removing their shared directory (Windows cannot unlink an open SQLite DB).
  t.after(()=>{for(const store of stores)store.close();rmSync(dir,{recursive:true,force:true});});
  return {a,dir,advance:n=>{now+=n;},open};
}
test('one persistent executor lease and fenced publication across processes',t=>{
  const f=setup(t),b=f.open();const epoch=f.a.acquire();assert.equal(b.acquire(),null);
  f.advance(60001);const newer=b.acquire();assert(newer>epoch);
  assert.throws(()=>f.a.publish({kind:'session',target:'s',summary:'old',epoch}),/租约/);
  b.publish({kind:'session',target:'s',summary:'new',epoch:newer});assert.equal(f.a.memory('session:s').summary,'new');
});
test('expired ownership cannot alter job targets, progress, reservations or terminal state',t=>{
  const f=setup(t),b=f.open();const epoch=f.a.acquire();
  const job=f.a.enqueue('session','s'),next=f.a.enqueue('session','next');
  assert.equal(f.a.claimJob(epoch).id,job.id);
  f.a.setTargets(job.id,[{kind:'session',target:'s'}],epoch);
  f.advance(60001);const newer=b.acquire();b.recover(newer);assert.equal(b.claimJob(newer).id,job.id);
  const before=b.job(job.id);
  assert.equal(f.a.claimJob(epoch),null);
  for(const state of ['complete','failed'])assert.equal(f.a.settleJob(job.id,{state},epoch),null);
  assert.throws(()=>f.a.setTargets(job.id,[{kind:'session',target:'stale'}],epoch),/租约/);
  assert.throws(()=>f.a.pinTarget(job.id,0,{through:999},epoch),/租约/);
  assert.throws(()=>f.a.finishTarget(job.id,0,epoch),/租约/);
  assert.throws(()=>f.a.reserve(100,1000,{jobId:job.id},epoch),/租约/);
  assert.deepEqual(b.job(job.id),before);assert.equal(b.nextTarget(job.id).cut,null);
  assert.equal(b.job(next.id).state,'queued');assert.equal(b.usage().used,0);
  b.pinTarget(job.id,0,{through:2},newer);b.finishTarget(job.id,0,newer);
  b.settleJob(job.id,{state:'complete'},newer);assert.equal(b.job(job.id).state,'complete');
  assert.equal(b.job(job.id).done,1);
});
test('publication atomically checks base revision and source references',t=>{
  const {a}=setup(t),epoch=a.acquire(),source={id:'src',kind:'summary',sessionId:'s',text:'original'};
  a.publish({kind:'session',target:'s',summary:'one',sources:[source],references:['src'],consumed:[{key:'summary:s',fingerprint:'1'}],epoch});
  assert.throws(()=>a.publish({kind:'session',target:'s',summary:'stale',baseRevision:0,consumed:[{key:'summary:s',fingerprint:'2'}],epoch}),/较新/);
  assert.equal(a.consumed('session:s','summary:s'),'1');
  assert.throws(()=>a.publish({kind:'session',target:'s',summary:'missing',baseRevision:1,references:['missing'],consumed:[{key:'raw:s',fingerprint:'1'}],epoch}),/引用/);
  assert.equal(a.consumed('session:s','raw:s'),undefined);assert.equal(a.memory('session:s').revision,1);
});
test('summary and raw coverage remain independent; old versions stay readable',t=>{
  const {a}=setup(t),epoch=a.acquire();const before=a.publish({kind:'session',target:'s',summary:'brief',consumed:[{key:'summary:s',fingerprint:'a'}],epoch});
  assert.equal(a.consumed('session:s','raw:s'),undefined);
  a.publish({kind:'session',target:'s',summary:'fuller',baseRevision:1,consumed:[{key:'raw:s',fingerprint:'b'}],epoch});
  assert.equal(a.memory('session:s',1).summary,'brief');assert.equal(a.references('session:s',2).entries[0].id,before.ref);
});
test('quota reservations are shared, durable, and unknown failures are charged',t=>{
  const f=setup(t),b=f.open();const epoch=f.a.acquire();
  const id=f.a.reserve(1800,2000,{kind:'session'},epoch);assert(id);assert.equal(b.usage().used,1800);
  assert.equal(f.a.reserve(201,2000,{},epoch),null);f.a.settle(id,undefined,'cancel');assert.equal(b.usage().used,1800);
  f.a.settle(id,{inputTokens:400,cacheReadTokens:100,outputTokens:50});assert.equal(b.usage().used,550);
});
test('missing or all-zero provider counters do not make a model call free',t=>{
  const {a}=setup(t),epoch=a.acquire(),id=a.reserve(1800,2000,{},epoch);
  a.settle(id,{inputTokens:0,outputTokens:0});assert.equal(a.usage().used,1800);
  a.settle(id,{outputTokens:20});assert.equal(a.usage().used,1800);
  a.settle(id,{inputTokens:0,cacheReadTokens:100,outputTokens:20});assert.equal(a.usage().used,120);
});
test('cancelled jobs reject late publication without consuming progress',t=>{
  const {a}=setup(t),epoch=a.acquire(),job=a.enqueue('session','s');a.updateJob(job.id,{state:'running'});a.updateJob(job.id,{state:'paused'});
  assert.throws(()=>a.publish({kind:'session',target:'s',summary:'late',epoch,jobId:job.id,consumed:[{key:'s',fingerprint:'x'}]}),/已停止/);
  assert.equal(a.memory('session:s'),null);assert.equal(a.consumed('session:s','s'),undefined);
});
test('parent publication rechecks source membership inside its transaction',t=>{
  const f=setup(t),b=f.open();const epoch=f.a.acquire();
  f.a.saveSession({id:'s',project:'p',shared:true,title:'s',activity:0});
  const child=f.a.publish({kind:'session',target:'s',summary:'private later',epoch});
  b.saveSession({...b.session('s'),shared:false});
  assert.throws(()=>f.a.publish({kind:'project',target:'p',summary:'late',sources:[{id:child.ref,kind:'memory',key:child.key,revision:child.revision}],references:[child.ref],epoch}),/共享范围/);
  assert.equal(f.a.memory('project:p'),null);
});
test('restart retains jobs, consumed ranges and used quota',t=>{
  const f=setup(t),epoch=f.a.acquire(),job=f.a.enqueue('global','global');f.a.updateJob(job.id,{state:'running'});f.a.reserve(1000,2000,{},epoch);f.a.release(epoch);
  const b=f.open();const next=b.acquire();b.recover(next);assert.equal(b.job(job.id).state,'queued');assert.equal(b.usage().used,1000);
});
test('catalog paging covers complete matching scope, including short Chinese',t=>{
  const {a}=setup(t);for(let i=0;i<45;i++)a.saveSession({id:String(i).padStart(2,'0'),project:'项目记忆',title:'记忆 '+i,shared:i!==44,activity:0});
  let page=a.catalog({kind:'session',project:'项目记忆',query:'记忆'}),ids=[];
  for(;;){ids.push(...page.entries.map(s=>s.id));if(!page.nextCursor)break;page=a.catalog({kind:'session',project:'项目记忆',query:'记忆',cursor:page.nextCursor});}
  assert.equal(new Set(ids).size,45);assert.equal(a.catalog({query:'记忆'}).entries.length,1);
  const cursor=a.catalog({kind:'session'}).nextCursor;a.saveSession({id:'extra',title:'new',project:'new',shared:true,activity:0});assert.throws(()=>a.catalog({kind:'session',cursor}),/已更新/);
});
test('representation-only changes do not change summary identity; content corrections do',()=>{
  const r={sessionId:'s',originalSeqs:[1,2],summary:'observed',ranges:[]};const first=summaryFingerprint(r);
  assert.equal(summaryFingerprint({...r,version:2,mode:'brief',carrierSeq:99}),first);
  assert.notEqual(summaryFingerprint({...r,decisions:[{text:'new',seq:1}]}),first);
});
test('large Unicode sources split without omissions; oversized/fake model output rejected',()=>{
  const raw='😀约定'.repeat(5000),parts=splitSource(raw,5000);assert.equal(parts.map(p=>p.text).join(''),raw);
  for(const p of parts){assert.equal(raw.slice(p.from,p.to),p.text);assert(Buffer.byteLength(p.text)<=5000);}
  assert.throws(()=>validateMemory({summary:'x'.repeat(601),references:['r']},'global',new Set(['r'])),/上限/);
  assert.throws(()=>validateMemory({summary:'valid',references:['fake']},'global',new Set(['r'])),/引用/);
  assert.equal(nodeKey('global','ignored'),'global');
});
