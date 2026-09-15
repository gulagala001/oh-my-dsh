import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptAssembly } from '../cc-prompt-adapter.mjs';
import { buildEdits } from '../migrate.mjs';

const context = { agent: { session: { header: { origin: 'user' } } }, scope: {} };
const schema = {type:'object',properties:{file_path:{type:'string'}},required:['file_path']};
const tool={name:'read',description:'original native description',parameters:schema};
const opts={mainText:'You are TriSoulX. TEST CORE',bindings:[{name:'read',baseline_descriptions:[tool.description]}],moduleText:()=> 'Adapted read description'};
function assembly(extra=[]) { return {sections:[{name:'harness:identity',text:'native identity'},{name:'trisoul-x:persona',text:'legacy persona'},...extra],tools:[tool],contexts:[{name:'sandbox:policy',text:'actual restriction'}],variables:{cwd:'/x'}}; }
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};

test('replace main core exactly once without a duplicate identity',()=>{
 const a=adaptAssembly(assembly(),context,opts);assert.equal(a.sections.length,1);assert.equal(a.sections[0].text,opts.mainText);assert.equal(a.sections[0].interpolate,false);
});
test('background/subagent contexts are untouched',()=>{
 const a=assembly();assert.equal(adaptAssembly(a,{agent:{session:{header:{origin:'subagent'}}}},opts),a);
});
test('non-agent background assembly is untouched',()=>{const a=assembly();assert.equal(adaptAssembly(a,{},opts),a);});
test('other presets are untouched',()=>{const a=assembly();a.sections=a.sections.slice(0,1);assert.equal(adaptAssembly(a,context,opts),a);});
test('schemas, contexts and source assembly remain unchanged',()=>{
 const a=freeze(assembly()),before=JSON.stringify(a),b=adaptAssembly(a,context,opts);
 assert.equal(JSON.stringify(a),before);assert.equal(b.tools[0].parameters,schema);assert.equal(b.contexts,a.contexts);assert.equal(b.tools[0].description,'Adapted read description');
});
test('description drift keeps the new native contract and reports it',()=>{
 const a=assembly();a.tools=[{...tool,description:'new upstream contract'}];let report=[];
 const b=adaptAssembly(a,context,{...opts,report:x=>report.push(x)});assert.equal(b.tools[0],a.tools[0]);assert.equal(report[0].status,'native-description-drift');
});
test('new or unknown tools are preserved',()=>{const a=assembly();a.tools=[{name:'new_resource_tool',description:'new tool',parameters:{}}];assert.equal(adaptAssembly(a,context,opts).tools[0],a.tools[0]);});
test('run_code remains runtime-owned even if a binding tries to replace it',()=>{
 const a=assembly();a.tools=[{name:'run_code',description:'dynamic deadline',parameters:{timeoutMs:123}}];
 const b=adaptAssembly(a,context,{...opts,bindings:[{name:'run_code',baseline_descriptions:['dynamic deadline']}]});assert.equal(b.tools[0],a.tools[0]);
});
test('new-version provider semantics are kept native',()=>{
 const a=assembly();const b=adaptAssembly(a,context,{...opts,bindings:[{...opts.bindings[0],preserve_native:true}]});assert.equal(b.tools[0],tool);
});
test('remove only a proven duplicate native guidance section',()=>{
 const b=adaptAssembly(assembly([{name:'tool:read',text:tool.description}]),context,opts);assert.equal(b.sections.length,1);
});
test('new native safety guidance is not removed',()=>{
 const b=adaptAssembly(assembly([{name:'tool:read',text:'new mandatory policy'}]),context,opts);assert.equal(b.sections.length,2);
});
test('PTC regenerates SDK from live schemas and outputs',()=>{
 const a=assembly([{name:'tools:sdk',text:'old SDK'}]);a.tools=[{name:'run_code',description:'dynamic',parameters:{}}];
 let seen;const out={type:'string'};
 const b=adaptAssembly(a,context,{...opts,language:'typescript',definitions:[{...tool,output:{schema:out}}],renderSdk:x=>{seen=x;return 'GENERATED';}});
 assert.equal(b.sections.find(s=>s.name==='tools:sdk').text,'GENERATED');assert.equal(seen[0].output,out);assert.equal(seen[0].description,'Adapted read description');assert.equal(b.tools[0].description,'dynamic');
});
test('refuse empty replacement SDK',()=>{assert.throws(()=>adaptAssembly(assembly([{name:'tools:sdk',text:'old'}]),context,{...opts,definitions:[],renderSdk:()=>''}),/empty/);});
test('refuse missing output schema',()=>{assert.throws(()=>adaptAssembly(assembly([{name:'tools:sdk',text:'old'}]),context,{...opts,definitions:[tool],renderSdk:()=>''}),/output contract/);});
test('Python renderer is supplied explicitly, never reuse TS syntax',()=>{
 let lang='';const b=adaptAssembly(assembly([{name:'tools:sdk',text:'old'}]),context,{...opts,language:'python',definitions:[{...tool,output:{schema:{type:'string'}}}],renderSdk:()=>{lang='python';return 'python sdk';}});assert.equal(lang,'python');assert.equal(b.sections.at(-1).text,'python sdk');
});
const wrapper=JSON.parse(readFileSync(new URL('../state-wrapper-replacement.json',import.meta.url),'utf8'));
const realState=readFileSync(new URL('./fixtures/state-zone.original.mjs',import.meta.url),'utf8');
const sample={
 'package.json':JSON.stringify({devDependencies:{'@deepseek-ai/dsh':'0.1.5-rc.1','diff':'9.0.0'}}),
 'presets/trisoul-x/agent.cordis.yml':"- id: plan\n        section: |\n              old plan\n\n- id: compaction\n- id: workflow-worker-thread\n  name: '@deepseek-ai/dsh-workflow-worker-thread'\n- id: tool-ralph\n  enabled: true\n",
 'src/index.mjs':"ctx.on('agent/session-start', () => KEEP_ALGORITHM());",
 'src/dsh-agent.mjs':"export function apply(ctx) {\n  const hub = ctx.trisoulX;\n  ORIGINAL_BACKGROUND();\n}\n",
 'src/state-zone.mjs':realState
};
test('migration updates DSH packages, not unrelated dependencies',()=>{
 const e=buildEdits(sample,wrapper),pkg=JSON.parse(e.get('package.json'));assert.equal(pkg.devDependencies['@deepseek-ai/dsh'],'0.1.6-alpha.1');assert.equal(pkg.devDependencies.diff,'9.0.0');
});
test('migration replaces removed lifecycle event without algorithm changes',()=>{
 const e=buildEdits(sample,wrapper);assert.equal(e.get('src/index.mjs'),"ctx.on('agent/created', () => KEEP_ALGORITHM());");assert.match(e.get('src/dsh-agent.mjs'),/ORIGINAL_BACKGROUND/);
});
test('migration switches engine and preserves existing Ralph setting',()=>{
 const e=buildEdits(sample,wrapper),s=e.get('presets/trisoul-x/agent.cordis.yml');assert.match(s,/dsh-workflow-ptc/);assert.doesNotMatch(s,/workflow-worker-thread/);assert.match(s,/enabled: true/);
});
test('state scribe source differs only by the already-approved header change',()=>{
 const e=buildEdits(sample,wrapper);assert.equal(e.get('src/state-zone.mjs'),realState.replace(wrapper.old_line,wrapper.new_line));
});
test('source drift refuses patch rather than guessing',()=>{assert.throws(()=>buildEdits({...sample,'src/index.mjs':'something else'},wrapper),/source anchor/);});
test('non-baseline state source refuses patch',()=>{assert.throws(()=>buildEdits({...sample,'src/state-zone.mjs':realState+'\n'},wrapper),/audited version/);});
test('second adapter install refuses stacking',()=>{assert.throws(()=>buildEdits({...sample,'src/dsh-agent.mjs':'installPromptAdapter'},wrapper),/already installed/);});

test('another complete system prompt refuses ambiguous ownership',()=>{
 assert.throws(()=>adaptAssembly(assembly([{name:'other-complete',text:'complete',complete:true}]),context,opts),/complete system prompt/);
});
