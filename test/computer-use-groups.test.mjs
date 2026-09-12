import test from 'node:test';
import assert from 'node:assert/strict';
import { computerGroups,operationKind,operationIcon,operationSummary,operationRowLocale,operationState,finalAnswerPresentation } from '../src/client/computer-groups.mjs';
const node=(kind,key,step,data={},turn=1)=>({kind,key,location:{kind:'step',turn:{turn},step:{step}},data});
const call=(key,step,name='computer_use',extra={})=>node('tool-call',key,step,{root:{callId:key,kind:'tool-result',call:{name,argsRaw:JSON.stringify({title:key})},...extra}});
test('completed answer reasoning is projected ahead of prose without rewriting source blocks',()=>{
 const text={kind:'text',text:'Final answer'},reasoning={kind:'reasoning',text:'Illustrative reasoning'},image={kind:'image',attachment:'image'},secondReasoning={kind:'reasoning',text:'Another summary'};
 const original=Object.freeze({...node('assistant-step','final',3),data:Object.freeze({step:3,blocks:Object.freeze([text,reasoning,image,secondReasoning])})});
 const process={foldable:true,spec:{inlineReasoning:true,answerStep:3}},display=finalAnswerPresentation(original,process);
 assert.deepEqual(display.data.blocks,[reasoning,secondReasoning,text,image]);assert.deepEqual(original.data.blocks,[text,reasoning,image,secondReasoning]);assert.equal(display.data.blocks[0],reasoning);
 assert.equal(finalAnswerPresentation(original,{...process,foldable:false}),original,'streaming and unfolded transcript order remains unchanged');
 assert.equal(finalAnswerPresentation(original,{...process,spec:{inlineReasoning:true,answerStep:2}}),original,'earlier assistant steps retain their ordering');
 assert.equal(finalAnswerPresentation(display,process),display,'an already ordered answer remains the same instance');
});
test('consecutive CU prose and calls form one group before a final answer, including running/failure',()=>{
 const a=node('assistant-step','a',1),b=call('b',1),c=node('assistant-step','c',2),d=call('d',2,'computer_use',{isError:true}),e=call('e',3,'computer_use',{kind:undefined,name:'computer_use'}),final=node('assistant-step','final',4);
 const groups=computerGroups([a,b,c,d,e,final]),g=groups.get('a');
 assert.equal(groups.get('call:e'),g);assert.deepEqual(g.calls,['b','d','e']);assert.equal(g.running,true);assert.equal(g.failures,1);assert.equal(groups.has('final'),false);
});
test('all tool families share a list, while user messages, prose and turns remain boundaries',()=>{
 const data=[call('a',1),node('user','user',1),call('b',2),node('context','context',2),node('assistant-step','mixed',3,{blocks:[{kind:'text',text:'I will check the files.'}]}),call('c',3),call('shell',3,'bash'),call('d',4),node('assistant-step','next',1,{},2)];
 const groups=computerGroups(data);assert.notEqual(groups.get('a'),groups.get('b'));assert.notEqual(groups.get('b'),groups.get('c'));assert.equal(groups.get('c'),groups.get('d'));assert.equal(groups.has('mixed'),false);assert.equal(groups.get('shell'),groups.get('c'));assert.equal(groups.has('next'),false);assert.equal(groups.get('a').headerCallId,'a');
});
test('context, system updates, compaction and standalone reasoning join the same live process without rewriting nodes',()=>{
 const context=node('context','context',1),system=node('system-prompt','system',2),compaction=node('compaction','compact',2),thought=node('assistant-step','thought',3,{blocks:[{kind:'reasoning',text:'Illustrative thought'},{kind:'tool-call',callId:'last',name:'bash'}]});
 const original=[context,node('turn-process','controller',1),call('first',1,'read'),system,compaction,thought,call('last',3,'bash')],before=JSON.stringify(original),groups=computerGroups(original),group=groups.get('context');
 assert.equal(group.contexts,3);assert.deepEqual(group.calls,['first','last']);for(const item of [system,compaction,thought])assert.equal(groups.get(item.key),group);
 assert.equal(groups.get('call:last'),group);assert.equal(JSON.stringify(original),before);
 assert.equal(computerGroups([{kind:'system-prompt',key:'initial',data:{},location:{kind:'unresolved'}}]).size,0,'session-level system prompt remains accessible outside any turn');
 const image=node('assistant-step','image',4,{blocks:[{kind:'image',attachment:'file'}]});assert.equal(computerGroups([call('a',4),image,call('b',4)]).has('image'),false,'visible image content is never hidden as thinking');
});
test('aborted calls stay in their group with explicit stopped status',()=>{
 const group=computerGroups([call('a',1),call('b',2,'computer_use',{isError:true,error:{code:'ABORTED'}})]).get('a');assert.equal(group.stopped,1);assert.equal(group.failures,0);
});
test('operation categories and icons do not confuse PowerShell, webpages or unrelated names',()=>{
 assert.equal(operationKind('pwsh'),'command');assert.equal(operationKind('catalog'),'tool');assert.equal(operationKind('allocate_resource'),'tool');assert.equal(operationKind('web_fetch'),'web');
 assert.equal(operationIcon(['read','bash']),'book');assert.equal(operationIcon(['bash','read_image']),'terminal');assert.equal(operationIcon(['web_search']),'search');
 assert.equal(operationSummary(['pwsh','web_fetch']),'已运行命令、读取网页');
});
test('lifecycle titles preserve original locale actions and explicit stopped/error status',()=>{
 const zh=key=>key==='row.failed'?'执行失败':key,en=key=>key==='row.failed'?'Failed':key;
 const done={kind:'tool-result',call:{name:'read'}};
 assert.equal(operationRowLocale(zh,'read',done)('tool.title.read'),'已读取');
 assert.equal(operationRowLocale(zh,'bash',{})('tool.title.bash'),'正在运行');
 assert.equal(operationRowLocale(zh,'read',{...done,isError:true})('tool.title.read'),'读取失败');
 assert.equal(operationRowLocale(zh,'read',{...done,error:{code:'interrupted'}})('tool.title.read'),'已停止');
 assert.equal(operationRowLocale(zh,'read',done)('row.inspect'),'row.inspect');
 assert.equal(operationRowLocale(en,'read',done),en);
 assert.equal(operationState({...done,meta:{computerUseError:'failed'}}),'error');
 assert.equal(operationState({...done,isError:true,content:[{type:'text',text:'Computer Use is stopped'}]}),'error','file error text is not a Computer Use cancellation');
});
