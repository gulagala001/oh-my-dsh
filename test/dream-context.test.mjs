import test from 'node:test';
import assert from 'node:assert/strict';
import {FixtureSession,system,user,exchange} from './context-fixture.mjs';
import {candidateInput,validatePrepared,newRecord,protectedEvent} from '../src/context/core.mjs';
import {summaryMessageReader} from '../src/task-context.mjs';
import {publishDreamMemory} from '../src/dream/publication.mjs';
import {transformAssembly} from '../src/cc-adaptation/adapter.mjs';

test('decision summaries require actual user quotes in the admitted batch and retain their originals',()=>{
  const s=new FixtureSession();system(s);user(s,'Old unrelated preference.');exchange(s);const decision=user(s,'只保留四个入口。');const work=exchange(s,'Read the configuration.');
  const input=candidateInput(s,work,10);assert.deepEqual(input.decision_sources.map(d=>d.seq),[decision.seq]);
  const value={summary:'Read the configuration.',documents:[],decisions:[{text:'只保留四个入口',seq:decision.seq,quote:'四个入口'}]};
  const prepared=validatePrepared(value,input.decision_sources);const record=newRecord(s,work,prepared,{project:'p',scope:'project'});
  assert(record.userOriginals.some(u=>u.seq===decision.seq));assert(record.originalSeqs.includes(decision.seq));
  assert.throws(()=>validatePrepared({...value,decisions:[{...value.decisions[0],seq:decision.seq-1}]},input.decision_sources),/依据/);
  assert.throws(()=>validatePrepared({...value,decisions:[{...value.decisions[0],quote:'五个入口'}]},input.decision_sources),/依据/);
  assert.throws(()=>validatePrepared({...value,decisions:[{...value.decisions[0],quote:'x'.repeat(601)}]},input.decision_sources),/限制/);
  assert.equal(validatePrepared({...value,summary:''},input.decision_sources).summary,'');
  assert.throws(()=>validatePrepared({summary:'',documents:[]},input.decision_sources),/完整/);
});
test('Dream injection and recall results cannot become preprocessing facts or decisions',()=>{
  const s=new FixtureSession();system(s);user(s,'Work on the current issue.');
  const memory=s.append('user/message',{role:'user',source:{kind:'plugin:trisoul-x:dream-memory'},content:[{type:'text',text:'OLD_MEMORY_SENTINEL'}]},{surfaceOp:'append'});
  const call=s.append('assistant/message',{message:{role:'assistant',source:{kind:'model'},content:[{type:'tool-call',id:'r',name:'recall',arguments:{memory:'global'}}]}},{surfaceOp:'append'});
  const result=s.append('tool/result',{message:{role:'tool',toolCallId:'r',source:{kind:'tool'},content:[{type:'text',text:'OLD_RECALLED_MEMORY'}]}},{surfaceOp:'append'});
  const read=summaryMessageReader(s);assert.equal(read(memory),null);assert.equal(read(call),null);assert.equal(read(result),null);assert.equal(protectedEvent(s,memory),true);
  assert(!JSON.stringify(candidateInput(s,[memory,call,result],10)).includes('OLD_MEMORY_SENTINEL'));
});
test('memory publication is one bounded replaceable block; independent mode never injects it',()=>{
  const s=new FixtureSession();system(s);user(s,'Continue.');let mode='global',revision=1,enumerations=0;
  const hub={scope:()=>({mode,project:'p'}),dream:{store:{memory:()=>({summary:'短记忆',ref:'r'+revision}),catalog:({limit})=>{enumerations++;assert.equal(limit,3);return {entries:[{id:'p'}]};}},sources:{projectTitle:p=>p}},context:{adapter:{catalogCost:t=>Buffer.byteLength(t),dreamBudget:()=>9000,publish:(session,text,kind)=>session.append('user/message',{role:'user',source:{kind:'plugin:trisoul-x:'+kind},content:[{type:'text',text}]},{surfaceOp:'append'})}}};
  publishDreamMemory(hub,s);const count=s.snapshotEvents().length;publishDreamMemory(hub,s);assert.equal(s.snapshotEvents().length,count);
  revision++;publishDreamMemory(hub,s);assert(s.snapshotEvents().length>count);mode='session';publishDreamMemory(hub,s);const before=enumerations;publishDreamMemory(hub,s);assert.equal(enumerations,before);
  assert(!s.deriveMessages().some(m=>m.source?.kind==='plugin:trisoul-x:dream-memory'));
});
test('Dream tool guidance appears only for callable fields, including the PTC SDK',()=>{
  const recall={name:'recall',description:'native',parameters:{type:'object',properties:Object.fromEntries(['memory','project','sessionId','reference','id','query','from','to'].map(k=>[k,{type:'string'}]))}};
  const ctx={agent:{session:{header:{origin:'user'}}}},assembly={sections:[{name:'trisoul-x:persona',text:'old'},{name:'tools:sdk',text:'old SDK'}],tools:[{name:'run_code',parameters:{type:'object',properties:{code:{type:'string'}}}}]};
  const options={schemas:[recall,...assembly.tools],definition:()=>({output:{schema:{type:'string'}}}),renderSdk:tools=>JSON.stringify(tools)};
  const value=transformAssembly(assembly,ctx,options).assembly;
  assert.equal(value.sections.filter(s=>s.name==='trisoul-x:cc-dream-memory').length,1);assert.match(value.sections.find(s=>s.name==='tools:sdk').text,/including independent sessions/);
  const old={...recall,parameters:{type:'object',properties:{id:{},query:{},from:{},to:{}}}};
  const result=transformAssembly({...assembly,sections:[assembly.sections[0]],tools:[old]},ctx).assembly;assert(!result.sections.some(s=>s.name==='trisoul-x:cc-dream-memory'));assert.equal(result.tools[0].description,'native');
});
