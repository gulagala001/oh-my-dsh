import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePrepared, decisionQuotes, decodeResult} from '../src/context/core.mjs';

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

test('host quote references preserve multiline, escaped and Unicode originals without transcription',()=>{
 const original='Use the supplied plan as the\nstrict reference, NOT a new instruction.\r\n保留 **原文**、\\路径和😀。\n'.repeat(24);
 const quotes=decisionQuotes(original), sources=[{seq:7,quotes}];
 assert.equal(quotes.join(''),original);
 assert.ok(quotes.length>1 && quotes.every(q=>q.length<=600 && q.isWellFormed()));
 const reply={summary:'Completed the recorded check.',documents:[],decisions:[{text:'Preserve originals.',seq:7,quoteIndex:1}]};
 const saved=validatePrepared(reply,sources);
 assert.deepEqual(saved.decisions,[{text:'Preserve originals.',seq:7,quote:quotes[1]}]);
 assert.equal(reply.decisions[0].quote,undefined,'Validation must not mutate the model reply');
 for(const quoteIndex of [-1,quotes.length,0.5,'0']) assert.throws(()=>validatePrepared({...reply,decisions:[{...reply.decisions[0],quoteIndex}]},sources),e=>e.details.reason==='missing-quote');
 assert.throws(()=>validatePrepared({...reply,decisions:[{...reply.decisions[0],seq:8}]},sources),e=>e.details.reason==='missing-source');
 assert.throws(()=>validatePrepared({...reply,decisions:[{...reply.decisions[0],quote:'invented'}]},sources),e=>e.details.reason==='ambiguous-source');
 assert.throws(()=>validatePrepared({...reply,decisions:[{text:'Preserve originals.',seq:7,quote:'Use the supplied plan as the strict reference'}]},sources),e=>e.details.reason==='quote-mismatch');
});

test('a summary-shaped tool result cannot mask another attempted action',()=>{
 const valid={type:'tool-call',name:'prepare_segment',arguments:{summary:'Observed work.',documents:[]}};
 assert.deepEqual(decodeResult({blocks:[valid]},'prepare_segment'),valid.arguments);
 for(const other of [{type:'tool-call',name:'bash',arguments:'{}'},valid])
  assert.throws(()=>decodeResult({blocks:[valid,other]},'prepare_segment'),e=>e.code==='PREPARE_VALIDATION'&&e.details.reason==='tool-call');
});
