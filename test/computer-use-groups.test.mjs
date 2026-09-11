import test from 'node:test';
import assert from 'node:assert/strict';
import { computerGroups } from '../src/client/computer-groups.mjs';
const node=(kind,key,step,data={},turn=1)=>({kind,key,location:{kind:'step',turn:{turn},step:{step}},data});
const call=(key,step,name='computer_use',extra={})=>node('tool-call',key,step,{root:{callId:key,kind:'tool-result',call:{name,argsRaw:JSON.stringify({title:key})},...extra}});
test('consecutive CU prose and calls form one group before a final answer, including running/failure',()=>{
 const a=node('assistant-step','a',1),b=call('b',1),c=node('assistant-step','c',2),d=call('d',2,'computer_use',{isError:true}),e=call('e',3,'computer_use',{kind:undefined,name:'computer_use'}),final=node('assistant-step','final',4);
 const groups=computerGroups([a,b,c,d,e,final]),g=groups.get('a');
 assert.equal(groups.get('call:e'),g);assert.deepEqual(g.calls,['b','d','e']);assert.equal(g.running,true);assert.equal(g.failures,1);assert.equal(groups.has('final'),false);
});
test('other tools, user steering, context and turns remain boundaries; mixed-step prose stays visible',()=>{
 const data=[call('a',1),node('user','user',1),call('b',2),node('context','context',2),node('assistant-step','mixed',3),call('c',3),call('shell',3,'bash'),call('d',4),node('assistant-step','next',1,{},2)];
 const groups=computerGroups(data);assert.notEqual(groups.get('a'),groups.get('b'));assert.notEqual(groups.get('b'),groups.get('c'));assert.notEqual(groups.get('c'),groups.get('d'));assert.equal(groups.has('mixed'),false);assert.equal(groups.has('shell'),false);assert.equal(groups.has('next'),false);assert.equal(groups.get('a').headerCallId,'a');
});
test('aborted calls stay in their group with explicit stopped status',()=>{
 const group=computerGroups([call('a',1),call('b',2,'computer_use',{isError:true,error:{code:'ABORTED'}})]).get('a');assert.equal(group.stopped,1);assert.equal(group.failures,0);
});
