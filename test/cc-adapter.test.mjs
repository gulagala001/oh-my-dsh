import test from 'node:test';
import assert from 'node:assert/strict';
import { transformAssembly, mainPrompt, inspectCommittedRequest } from '../src/cc-adaptation/adapter.mjs';
import { promptText } from '../src/cc-adaptation/texts.mjs';

const context={agent:{session:{header:{origin:'user'}}}};
const schema=(name,fields=[])=>({name,description:'native '+name,parameters:{type:'object',properties:Object.fromEntries(fields.map(x=>[x,{type:'string',description:'native field '+x}]))}});
const assembly=(tools=[])=>({sections:[{name:'harness:identity',order:-1000,text:'Native identity'}, {name:'trisoul-x:persona',order:0,text:'old'},{name:'harness:source',order:10000,text:'native source'}],tools,contexts:[{name:'sandbox:policy',text:'native permissions'}],variables:{cwd:'/fictional-fixture'}});
function frozen(v) {if(v&&typeof v==='object'){Object.values(v).forEach(frozen);Object.freeze(v);}return v;}

test('non-agent requests remain byte-equivalent',()=>{const a=assembly(); assert.equal(transformAssembly(a,{}).assembly,a);});
test('child requests stay outside transformation',()=>{const a=assembly();assert.equal(transformAssembly(a,{agent:{session:{header:{origin:'subagent'}}}}).assembly,a);});
test('other presets stay outside transformation',()=>{const a={...assembly(),sections:[]};assert.equal(transformAssembly(a,context).assembly,a);});
test('main persona replaced once, duplicated identity removed',()=>{const {assembly:r}=transformAssembly(assembly(),context);assert.equal(r.sections.filter(x=>x.name==='trisoul-x:persona').length,1);assert(!r.sections.some(x=>x.name==='harness:identity'));assert(r.sections[0].text.startsWith('You are TriSoulX.'));});
test('missing CU removes unconditional CU instruction',()=>{const {assembly:r}=transformAssembly(assembly(),context);assert(!r.sections[0].text.includes('Use the available computer-use tools'));});
test('native CU interface retained and instruction enabled',()=>{const a=assembly([schema('computer_use',['code','title'])]);const {assembly:r}=transformAssembly(a,context);assert(r.sections[0].text.includes('Use the available computer-use tools'));assert.deepEqual(r.tools[0].parameters,a.tools[0].parameters);assert.equal(r.tools[0].description,promptText('tools/computer-use.md'));});
test('unmapped upstream tool is kept and reported, never invented',()=>{const a=assembly([schema('new_upstream_tool')]);const r=transformAssembly(a,context);assert.equal(r.assembly.tools[0],a.tools[0]);assert.equal(r.audit.retained[0].reason,'unmapped-native-tool');});
test('dynamic child-model defaults keep native owner description',()=>{const a=assembly([schema('subagent',['prompt'])]);const r=transformAssembly(a,context);assert.equal(r.assembly.tools[0],a.tools[0]);assert.equal(r.audit.retained[0].reason,'owner-specific-runtime-conditions');});
test('run_code transport including new limits is never overwritten',()=>{const a=assembly([schema('run_code',['code','description','timeoutMs','sandbox_permissions'])]);const r=transformAssembly(a,context);assert.equal(r.assembly.tools[0],a.tools[0]);assert.equal(r.audit.retained[0].reason,'runtime-owned-transport');});
test('schema mismatch retains original and records missing fields',()=>{const a=assembly([schema('read',['path'])]);a.sections.push({name:'tool:read',order:100,text:'native read guidance'});const r=transformAssembly(a,context);assert.equal(r.assembly.tools[0],a.tools[0]);assert(r.assembly.sections.some(x=>x.name==='tool:read'));assert.deepEqual(r.audit.incompatible[0].fields,['file_path','offset','limit']);});
test('known native schema parameters including descriptions untouched',()=>{const a=frozen(assembly([schema('read',['file_path','offset','limit'])]));const r=transformAssembly(a,context);assert.equal(r.assembly.tools[0].parameters,a.tools[0].parameters);assert.equal(r.assembly.tools[0].description,promptText('tools/read.md'));});
test('suppression only for an actually substituted owned section',()=>{const a=assembly([schema('read',['file_path','offset','limit'])]);a.sections.push({name:'tool:read',order:100,text:'duplicate'},{name:'other:read',order:101,text:'leave alone'});const r=transformAssembly(a,context).assembly;assert(!r.sections.some(x=>x.name==='tool:read'));assert(r.sections.some(x=>x.name==='other:read'));});
test('runtime contexts, permission data and variables remain exact',()=>{const a=assembly([schema('read',['file_path','offset','limit'])]);const r=transformAssembly(a,context).assembly;assert.equal(r.contexts,a.contexts);assert.equal(r.variables,a.variables);});
test('memory instructions are conditional and registered once',()=>{const a=assembly([schema('note',['text']),schema('recall',['query','scope','from','to'])]);const one=transformAssembly(a,context).assembly;const two=transformAssembly(one,context).assembly;assert.equal(two.sections.filter(x=>x.name==='trisoul-x:cc-memory').length,1);assert(one.sections.findIndex(x=>x.name==='trisoul-x:cc-memory') < one.sections.findIndex(x=>x.name==='harness:source'));});
test('SDK uses changed descriptions and actual live output contracts',()=>{const visible=[schema('read',['file_path','offset','limit']),schema('run_code',['code'])];const a=assembly([visible[1]]);a.sections.push({name:'tools:sdk',order:5000,text:'old sdk'});let captured;const result=transformAssembly(a,context,{schemas:visible,definition:()=>({output:{schema:{type:'object',properties:{value:{type:'integer'}}}}}),renderSdk:s=>{captured=s;return 'CURRENT SDK '+JSON.stringify(s);}});assert.equal(captured.length,1);assert.equal(captured[0].description,promptText('tools/read.md'));assert.equal(captured[0].output.properties.value.type,'integer');assert.equal(result.assembly.tools[0],visible[1]);assert(result.audit.sdkRegenerated);assert.equal(result.assembly.sections.find(x=>x.name==='tools:sdk').interpolate,false);});
test('active SDK without current public renderer fails visibly',()=>{const a=assembly();a.sections.push({name:'tools:sdk',order:5000,text:'old sdk'});assert.throws(()=>transformAssembly(a,context),/current runtime SDK renderer/);});
test('missing output contract fails SDK regeneration visibly',()=>{const a=assembly([schema('read',['file_path','offset','limit'])]);a.sections.push({name:'tools:sdk',order:5000,text:'old sdk'});assert.throws(()=>transformAssembly(a,context,{renderSdk:()=>'',definition:()=>null}),/Missing live output contract/);});
test('optional background and escalation commands not advertised when absent',()=>{const r=transformAssembly(assembly([schema('bash',['command','workdir','timeoutMs'])]),context).assembly;assert(!r.tools[0].description.includes('`run_in_background`'));assert(!r.tools[0].description.includes('`sandbox_permissions`'));assert(!r.tools[0].description.includes('`job_output`'));});
test('missing job collector never leaves job_output reference',()=>{const r=transformAssembly(assembly([schema('bash',['command','workdir','timeoutMs','run_in_background'])]),context).assembly;assert(!r.tools[0].description.includes('`job_output`'));});
test('memory loader rejects traversal and unexpected paths',()=>{for(const p of ['../escape.md','/absolute.md','https://remote.md','main\\one.md'])assert.throws(()=>promptText(p),/Invalid prompt/);});
test('inspection does not disclose user content or tool arguments',()=>{const agent={session:{deriveMessages:()=>[{role:'system',content:[{type:'text',text:mainPrompt}]},{role:'user',source:{kind:'user'},content:[{type:'text',text:'SECRET_USER_CONTENT [Working state'}]}],requestHeader:()=>({tools:[schema('read',['file_path'])]})}};const r=inspectCommittedRequest(agent);assert(r.latestHasTriSoulX);assert(!JSON.stringify(r).includes('SECRET_USER_CONTENT'));assert.deepEqual(r.observations[0].headers,['[Working state']);});


test('real DSH sections without order metadata retain the host sequence', () => {
  const a = assembly([schema('note', ['text']), schema('recall', ['query','scope','from','to'])]);
  a.sections = [
    {name:'trisoul-x:persona',text:'old'},
    {name:'z:first-host-rule',text:'first'},
    {name:'a:later-host-rule',text:'later'},
  ];
  const result = transformAssembly(a, context).assembly.sections;
  assert.deepEqual(result.map(s => s.name), ['trisoul-x:persona', 'trisoul-x:cc-memory', 'z:first-host-rule', 'a:later-host-rule']);
});
