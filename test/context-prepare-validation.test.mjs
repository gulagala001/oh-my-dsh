import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePrepared} from '../src/context/core.mjs';

test('preparation rejection identifies the field while preserving exact original-quote checks',()=>{
 const source=[{seq:7,text:'保留全部原始会话。'}];
 const base={summary:'有效摘要',documents:[],decisions:[{text:'保留原始会话',seq:7,quote:'保留全部原始会话。'}]};
 assert.deepEqual(validatePrepared(base,source),base);
 const cases=[
  [{...base.decisions[0],seq:8},'decisions[0].seq','missing-source'],
  [{...base.decisions[0],quote:'保留会话'},'decisions[0].quote','quote-mismatch'],
  [{...base.decisions[0],quote:'长'.repeat(601)},'decisions[0].quote','too-long'],
  [{...base.decisions[0],text:'长'.repeat(1201)},'decisions[0].text','too-long'],
 ];
 for(const [decision,field,reason] of cases) assert.throws(()=>validatePrepared({...base,decisions:[decision]},source),error=>{
  assert.equal(error.code,'PREPARE_VALIDATION');assert.equal(error.details.field,field);assert.equal(error.details.reason,reason);
  assert.ok(error.message.includes(field));return true;
 });
 assert.deepEqual(base.decisions[0].quote,source[0].text);
});
