import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeLegacyDraft, preserveLegacyDraft, restoreLegacyDraft, applyLegacyDraftRecovery, DRAFT_RECOVERY_PREFIX } from '../src/client/draft-recovery.mjs';

const reference={source:'files',ref:'example.md',label:'example.md',offset:4,length:11,clipboardText:'@example.md',appearance:'file'};
const valid={text:'参考： @example.md',references:[reference]};
function fixture(value, options={}) {
  const raw=JSON.stringify({draft:value,view:'chat',unknown:{preserve:true}}), rows=new Map([['dsh.conversation.session-fixture',raw]]), notices=[], restored=[], texts=[];
  const storage={getItem:key=>rows.get(key)??null,setItem:(key,value)=>{if(options.quota)throw Error('quota');rows.set(key,value);}};
  const shell={captureDraft:()=>({attachmentIds:['unsent-image']}),restoreDraft:value=>restored.push(value),notify:(...args)=>notices.push(args)};
  const run=()=>restoreLegacyDraft({value,sessionId:'session-fixture',storage,shell,setDraft:value=>texts.push(value)});
  return {raw,rows,storage,shell,notices,restored,texts,run};
}
test('empty, text and reference snapshots restore without rewriting original caches or losing attachments',()=>{
  for(const value of [{text:'',references:[]},{text:'用户原文\n第二行',references:[]},valid]){
    const f=fixture(value);f.run();f.run();
    assert.equal(f.rows.get('dsh.conversation.session-fixture'),f.raw);
    assert.deepEqual(JSON.parse(f.rows.get(DRAFT_RECOVERY_PREFIX+'session-fixture')),[f.raw]);
    assert.equal(f.restored[0].draft,value.text);assert.deepEqual(f.restored[0].occurrences,value.references);
    assert.deepEqual(f.restored[0].attachmentIds,['unsent-image']);assert.deepEqual(f.notices,[]);
  }
});
test('malformed drafts and references do not throw or erase original data',()=>{
  for(const value of [null,12,{text:12,references:[]}]){const f=fixture(value);f.run();assert.equal(f.restored.length,0);assert.equal(f.notices[0][0],'error');assert.equal(f.rows.get('dsh.conversation.session-fixture'),f.raw);}
  for(const references of [null,[{...reference,offset:-1}],[{...reference,length:99}],[{...reference,appearance:'unknown'}],[reference,reference]]){
    const f=fixture({...valid,references});f.run();assert.deepEqual(f.restored[0].occurrences,[]);assert.equal(f.restored[0].draft,valid.text);assert.equal(f.notices[0][0],'info');
  }
});
test('legacy text passes through; storage failures retain primary data and allow valid draft restoration',()=>{
  const plain=fixture('旧纯文本');plain.run();assert.deepEqual(plain.texts,['旧纯文本']);assert.equal(plain.rows.size,1);
  const quota=fixture(valid,{quota:true});quota.run();assert.equal(quota.restored[0].draft,valid.text);assert.equal(quota.notices[0][0],'error');assert.equal(quota.rows.get('dsh.conversation.session-fixture'),quota.raw);
  const corrupt=fixture(valid);corrupt.rows.set(DRAFT_RECOVERY_PREFIX+'session-fixture','broken');corrupt.run();assert.equal(corrupt.rows.get(DRAFT_RECOVERY_PREFIX+'session-fixture'),'broken');assert.equal(corrupt.restored.length,1);
});
test('recovery appends distinct full records and validates reference spans without mutating callers',()=>{
  const f=fixture(valid);preserveLegacyDraft(f.storage,'session-fixture',valid);const copy=structuredClone(valid);assert.deepEqual(decodeLegacyDraft(valid).occurrences,[reference]);assert.deepEqual(valid,copy);
  f.rows.set('dsh.conversation.session-fixture',JSON.stringify({draft:{text:'新原文',references:[]}}));preserveLegacyDraft(f.storage,'session-fixture',{text:'新原文',references:[]});
  assert.equal(JSON.parse(f.rows.get(DRAFT_RECOVERY_PREFIX+'session-fixture')).length,2);
});

test('unavailable browser storage does not crash the conversation or discard a recoverable draft',()=>{const f=fixture(valid);restoreLegacyDraft({value:valid,sessionId:'session-fixture',getStorage:()=>{throw Error('SecurityError')},shell:f.shell,setDraft:()=>{}});assert.equal(f.restored[0].draft,valid.text);assert.equal(f.notices[0][0],'error');});


test('input adaptation keeps shell identity, uses its session id and restores methods on scope disposal',()=>{
  const f=fixture(valid), rootDisposers=[], scopeDisposers=[];
  f.shell.actions={setDraft:value=>f.texts.push(value)};
  const native=f.shell.actions.setDraft, input={shellFor:()=>f.shell}, original=input.shellFor;
  const binding={session:{sessionId:'session-fixture'},ctx:{effect:setup=>scopeDisposers.push(setup())}};
  const ctx={get:()=>({input}),effect:setup=>rootDisposers.push(setup())};
  const prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:f.storage});
  try{
    applyLegacyDraftRecovery(ctx);
    assert.equal(input.shellFor(binding),f.shell);const adapted=f.shell.actions.setDraft;
    assert.equal(input.shellFor(binding).actions.setDraft,adapted);
    adapted(valid);assert.ok(f.rows.has(DRAFT_RECOVERY_PREFIX+'session-fixture'));
    adapted('普通文本');assert.deepEqual(f.texts,['普通文本']);
    scopeDisposers[0]();assert.equal(f.shell.actions.setDraft,native);
    input.shellFor(binding);assert.notEqual(f.shell.actions.setDraft,native);
    rootDisposers[0]();assert.equal(input.shellFor,original);assert.equal(f.shell.actions.setDraft,native);
  }finally{if(prior)Object.defineProperty(globalThis,'localStorage',prior);else delete globalThis.localStorage;}
});

test('a concurrent cache write does not replace the incoming draft in its recovery copy',()=>{const f=fixture(valid);f.rows.set('dsh.conversation.session-fixture',JSON.stringify({draft:'较新草稿'}));f.run();const rows=JSON.parse(f.rows.get(DRAFT_RECOVERY_PREFIX+'session-fixture')).map(raw=>JSON.parse(raw).draft);assert.deepEqual(rows,['较新草稿',valid]);assert.equal(JSON.parse(f.rows.get('dsh.conversation.session-fixture')).draft,'较新草稿');});
