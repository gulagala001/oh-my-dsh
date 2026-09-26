import test from 'node:test';
import assert from 'node:assert/strict';
import { transformAssembly, mainPrompt, installPromptAdapter } from '../src/cc-adaptation/adapter.mjs';
import { buildMainPrompt, promptText, MAIN_FILES } from '../src/cc-adaptation/texts.mjs';
import { renderToolsSdk, renderToolsSdkPy } from '@deepseek-ai/dsh-tools';
import { TASK_PARAMETERS } from '../src/tasks.mjs';
import { loadWorkflowFactory } from './fixtures/workflow.mjs';

const context={agent:{session:{header:{origin:'user'}}}};
const schema=(name,fields=[])=>({name,description:'native '+name,parameters:{type:'object',properties:Object.fromEntries(fields.map(x=>[x,{type:'string',description:'native field '+x}]))}});
const assembly=(tools=[])=>({sections:[{name:'harness:identity',order:-1000,text:'Native identity'}, {name:'trisoul-x:persona',order:0,text:'old'},{name:'harness:source',order:10000,text:'native source'}],tools,contexts:[{name:'sandbox:policy',text:'native permissions'}],variables:{cwd:'/fictional-fixture'}});
const taskSchema = () => ({ ...schema('todo_write'), parameters: structuredClone(TASK_PARAMETERS) });

test('workflow guidance matches native children, requires the enhanced schema, and respects available controls', async () => {
  const native = await loadWorkflowFactory('tool-workflow');
  assert.equal(native.DESCRIPTION, promptText('tools/workflow.md'));
  const old = schema('workflow', ['script','meta']);
  assert.equal(transformAssembly(assembly([old]), context).assembly.tools[0], old);
  const current = schema('workflow', ['script','meta','scriptPath','name','resumeFromRunId','run_in_background']);
  const all = [current, schema('job_output', ['job_id']), schema('job_kill', ['job_id'])];
  const result = transformAssembly(assembly(all), context).assembly.tools[0];
  assert.equal(result.parameters, current.parameters); assert.match(result.description, /cached results/); assert.match(result.description, /run_in_background/);
  assert.doesNotMatch(transformAssembly(assembly([current]), context).assembly.tools[0].description, /run_in_background/);
});

test('todo constraint guidance is opt-in, idempotent and also reaches the generated SDK', () => {
  const todo = taskSchema();
  const base = promptText('tools/todo-write.md'), extra = promptText('tools/todo-constraints.md');
  const initial = assembly([todo]);
  const disabled = transformAssembly(initial, context).assembly;
  assert.equal(disabled.tools[0].description, base);
  assert.ok(!disabled.sections[0].text.includes(extra));
  const enabled = transformAssembly(initial, context, { todoConstraintFirst: true }).assembly;
  assert.equal(enabled.tools[0].description, base + '\n\n' + extra);
  assert.equal(enabled.sections[0].text, disabled.sections[0].text + '\n\n## Constraint-first reasoning\n' + extra);
  assert.equal(transformAssembly(enabled, context, { todoConstraintFirst: true }).assembly.sections[0].text, enabled.sections[0].text);
  assert.equal(transformAssembly(enabled, context, { todoConstraintFirst: false }).assembly.sections[0].text, disabled.sections[0].text);
  assert.equal(enabled.tools[0].parameters, todo.parameters);
  assert.equal(transformAssembly(enabled, context, { todoConstraintFirst: true }).assembly.tools[0].description, enabled.tools[0].description);
  assert.equal(transformAssembly(enabled, context, { todoConstraintFirst: false }).assembly.tools[0].description, base);
  const sdk = assembly([schema('run_code', ['code'])]);
  sdk.sections.push({ name: 'tools:sdk', text: 'old sdk' });
  const result = transformAssembly(sdk, context, { todoConstraintFirst: true, schemas: [todo, ...sdk.tools],
    definition: () => ({ output: { schema: { type: 'string' } } }), renderSdk: tools => JSON.stringify(tools) }).assembly;
  assert.ok(result.sections.find(s => s.name === 'tools:sdk').text.includes(extra));
  for (const ctx of [{}, { agent: { session: { header: { origin: 'subagent' } } } }]) {
    assert.equal(transformAssembly(initial, ctx, { todoConstraintFirst: true }).assembly, initial);
  }
  const stock = { ...initial, sections: [] };
  assert.equal(transformAssembly(stock, context, { todoConstraintFirst: true }).assembly, stock);
});

test('a running adapter uses current CFR settings on each request without binding them to a session', async () => {
  let handler;
  const config = {}, tools = [taskSchema()];
  installPromptAdapter({ on(name, fn) { assert.equal(name, 'system-prompt/assemble'); handler = fn; },
    trisoulX: { config: () => config }, tools: { schemas: () => tools } });
  const request = () => handler(null, context, async () => assembly(tools));
  const base = promptText('tools/todo-write.md'), extra = promptText('tools/todo-constraints.md');
  const disabled = await request();
  assert.equal(disabled.tools[0].description, base);
  assert.ok(!disabled.sections[0].text.includes(extra));
  config.todoConstraintFirst = true;
  const enabled = await request();
  assert.equal(enabled.tools[0].description, base + '\n\n' + extra);
  assert.equal(enabled.sections[0].text, disabled.sections[0].text + '\n\n## Constraint-first reasoning\n' + extra);
  config.todoConstraintFirst = false;
  const cleared = await request();
  assert.equal(cleared.tools[0].description, base);
  assert.equal(cleared.sections[0].text, disabled.sections[0].text);
});
function frozen(v) {if(v&&typeof v==='object'){Object.values(v).forEach(frozen);Object.freeze(v);}return v;}

test('pause guidance follows the live operation and reason schema', () => {
  const current = taskSchema();
  assert.match(transformAssembly(assembly([current]), context).assembly.tools[0].description, /`pause_turn`/);
  for (const missing of ['operation', 'reason']) {
    const older = taskSchema();
    if (missing === 'operation') older.parameters.properties.op.enum = older.parameters.properties.op.enum.filter(op => op !== 'pause_turn');
    else delete older.parameters.properties.reason;
    const result = transformAssembly(assembly([older]), context).assembly.tools[0];
    assert.doesNotMatch(result.description, /`pause_turn`/);
    assert.equal(result.parameters, older.parameters);
  }
});

for (const mode of ['ptc', 'both']) for (const language of ['typescript', 'python']) {
  test(`${mode}/${language}: main guidance, SDK output semantics and plan review match the calling surface`, () => {
    const tools = [schema('run_code', ['code', 'description']), schema('bash', ['command', 'workdir', 'timeoutMs', 'run_in_background', 'sandbox_permissions']),
      schema('pwsh', ['command', 'workdir', 'run_in_background', 'sandbox_permissions']),
      schema('job_output', ['job_id']), schema('job_kill', ['job_id']), schema('computer_use', ['code', 'title'])];
    const a = assembly(mode === 'ptc' ? [tools[0]] : tools);
    a.sections.push({ name: 'tool:jobs', text: 'native background guidance' });
    if (mode === 'ptc') a.sections.push({ name: 'tools:ptc-only', text: 'run_code is the only direct tool' });
    a.sections.push({ name: 'tools:sdk', text: 'old SDK' }, { name: 'plan:policy', text: 'When ready, make `exit_plan_mode` the only and final tool call in that response, passing the complete plan Markdown with a `#` title. On approval, implement in a later step.' });
    const output = { type: 'object', properties: { exitCode: { type: 'integer' }, job: { type: 'object', properties: { status: { type: 'string' } } } } };
    const options = { schemas: tools, definition: () => ({ output: { schema: output } }),
      renderSdk: language === 'python' ? renderToolsSdkPy : renderToolsSdk };
    const r = transformAssembly(frozen(a), context, options).assembly;
    const persona = r.sections.find(s => s.name === 'trisoul-x:persona').text;
    assert.match(persona, /## Programmatic tool use/);
    if (mode === 'ptc') assert.doesNotMatch(persona, /Independent tool calls can run in parallel in one response/);
    const sdk = r.sections.find(s => s.name === 'tools:sdk').text;
    assert.match(sdk, language === 'python' ? /async Python function/ : /async TypeScript function/);
    assert.doesNotMatch(sdk, /Non-zero exits are reported as `\[exit code: N\]`|Inspect the `\[status: \.\.\.\]` line/);
    assert.match(sdk, /exitCode/);
    assert.match(sdk, /job\.status/);
    assert.match(sdk, /Inspect the returned process status and output fields/);
    assert.equal(r.sections.find(s => s.name === 'tool:jobs').text, promptText('runtime/job-collection.md'));
    assert.equal(r.sections.filter(s => s.name === 'tool:jobs').length, 1);
    assert.deepEqual(r.tools.map(t => t.name), a.tools.map(t => t.name), 'PTC gets no new direct tools');
    assert.doesNotMatch(persona, /runtime_status/);
    assert.match(persona, /separate from the outer `run_code` program/);
    const plan = r.sections.find(s => s.name === 'plan:policy').text;
    if (mode === 'ptc') assert.match(plan, /tools\.exit_plan_mode.*run_code/);
    else assert.equal(plan, a.sections.at(-1).text);
    assert.match(plan, /On approval, implement in a later step/);
    if (mode === 'both') assert.equal(r.tools.find(t => t.name === 'bash').description, promptText('tools/bash.md'));
    assert.equal(r.tools[0], tools[0]);
    assert.deepEqual(transformAssembly(r, context, options).assembly, r);
  });
}

test('non-agent requests remain byte-equivalent',()=>{const a=assembly(); assert.equal(transformAssembly(a,{}).assembly,a);});
test('child requests stay outside transformation',()=>{const a=assembly();assert.equal(transformAssembly(a,{agent:{session:{header:{origin:'subagent'}}}}).assembly,a);});
test('other presets stay outside transformation',()=>{const a={...assembly(),sections:[]};assert.equal(transformAssembly(a,context).assembly,a);});
test('main persona replaced once, duplicated identity removed',()=>{const {assembly:r}=transformAssembly(assembly(),context);assert.equal(r.sections.filter(x=>x.name==='trisoul-x:persona').length,1);assert(!r.sections.some(x=>x.name==='harness:identity'));assert(r.sections[0].text.startsWith('You are an interactive zcode agent that helps users with software engineering tasks.'));});
test('missing CU removes unconditional CU instruction',()=>{const {assembly:r}=transformAssembly(assembly(),context);assert(!r.sections[0].text.includes('Use the available computer-use tools'));});
test('native CU interface retained and instruction enabled',()=>{const a=assembly([schema('computer_use',['code','title'])]);const {assembly:r}=transformAssembly(a,context);assert(r.sections[0].text.includes('Use the available computer-use tools'));assert.deepEqual(r.tools[0].parameters,a.tools[0].parameters);assert.equal(r.tools[0].description,promptText('tools/computer-use.md'));});
test('unmapped upstream tool is kept and reported, never invented',()=>{const a=assembly([schema('new_upstream_tool')]);const r=transformAssembly(a,context);assert.equal(r.assembly.tools[0],a.tools[0]);assert.equal(r.audit.retained[0].reason,'unmapped-native-tool');});
test('dynamic child-model defaults keep native owner description',()=>{const a=assembly([schema('subagent',['prompt'])]);const r=transformAssembly(a,context);assert.equal(r.assembly.tools[0],a.tools[0]);assert.equal(r.audit.retained[0].reason,'owner-specific-runtime-conditions');});
test('run_code transport including new limits is never overwritten',()=>{const a=assembly([schema('run_code',['code','description','timeoutMs','sandbox_permissions'])]);const r=transformAssembly(a,context);assert.equal(r.assembly.tools[0],a.tools[0]);assert.equal(r.audit.retained[0].reason,'runtime-owned-transport');});
test('schema mismatch retains original and records missing fields',()=>{const a=assembly([schema('read',['path'])]);a.sections.push({name:'tool:read',order:100,text:'native read guidance'});const r=transformAssembly(a,context);assert.equal(r.assembly.tools[0],a.tools[0]);assert(r.assembly.sections.some(x=>x.name==='tool:read'));assert.deepEqual(r.audit.incompatible[0].fields,['file_path','offset','limit']);});
test('known native schema parameters including descriptions untouched',()=>{const a=frozen(assembly([schema('read',['file_path','offset','limit'])]));const r=transformAssembly(a,context);assert.equal(r.assembly.tools[0].parameters,a.tools[0].parameters);assert.equal(r.assembly.tools[0].description,promptText('tools/read.md'));});
test('suppression only for an actually substituted owned section',()=>{const a=assembly([schema('read',['file_path','offset','limit'])]);a.sections.push({name:'tool:read',order:100,text:'duplicate'},{name:'other:read',order:101,text:'leave alone'});const r=transformAssembly(a,context).assembly;assert(!r.sections.some(x=>x.name==='tool:read'));assert(r.sections.some(x=>x.name==='other:read'));});
test('jobs guidance replaces the live host section in place only with compatible controls', () => {
  const tools = [schema('job_output', ['job_id']), schema('job_kill', ['job_id'])];
  const a = assembly(tools);
  a.sections.splice(2, 0, { name: 'tool:jobs', text: 'native background guidance' });
  a.sections.push({ name: 'other:jobs', text: 'another owner' });
  const result = transformAssembly(frozen(a), context).assembly;
  assert.deepEqual(result.sections.map(s => s.name), a.sections.filter(s => s.name !== 'harness:identity').map(s => s.name));
  assert.equal(result.sections.find(s => s.name === 'tool:jobs').text, promptText('runtime/job-collection.md'));
  assert.equal(result.sections.find(s => s.name === 'other:jobs'), a.sections.at(-1));
  assert.deepEqual(result.tools.map(t => t.parameters), tools.map(t => t.parameters));
  assert.deepEqual(transformAssembly(result, context).assembly, result);
  for (const unavailable of [[], [tools[0]], [tools[1]], [tools[0], schema('job_kill', ['id'])]]) {
    const retained = transformAssembly({ ...a, tools: unavailable }, context).assembly;
    assert.equal(retained.sections.find(s => s.name === 'tool:jobs'), a.sections[2]);
  }
  assert.ok(!transformAssembly(assembly(tools), context).assembly.sections.some(s => s.name === 'tool:jobs'), 'do not invent a notification controller');
  const stock = { ...a, sections: a.sections.filter(s => s.name !== 'trisoul-x:persona') };
  assert.equal(transformAssembly(stock, context).assembly, stock);
  assert.equal(transformAssembly(a, { agent: { session: { header: { origin: 'subagent' } } } }).assembly, a);
});
test('runtime contexts, permission data and variables remain exact',()=>{const a=assembly([schema('read',['file_path','offset','limit'])]);const r=transformAssembly(a,context).assembly;assert.equal(r.contexts,a.contexts);assert.equal(r.variables,a.variables);});
test('memory instructions are conditional and registered once',()=>{const a=assembly([schema('note',['text']),schema('recall',['query','scope','from','to'])]);const one=transformAssembly(a,context).assembly;const two=transformAssembly(one,context).assembly;assert.equal(two.sections.filter(x=>x.name==='trisoul-x:cc-memory').length,1);assert(one.sections.findIndex(x=>x.name==='trisoul-x:cc-memory') < one.sections.findIndex(x=>x.name==='harness:source'));});
test('SDK uses changed descriptions and actual live output contracts',()=>{const visible=[schema('read',['file_path','offset','limit']),schema('run_code',['code'])];const a=assembly([visible[1]]);a.sections.push({name:'tools:sdk',order:5000,text:'old sdk'});let captured;const result=transformAssembly(a,context,{schemas:visible,definition:()=>({output:{schema:{type:'object',properties:{value:{type:'integer'}}}}}),renderSdk:s=>{captured=s;return 'CURRENT SDK '+JSON.stringify(s);}});assert.equal(captured.length,1);assert.match(captured[0].description,/return structured line records/);assert.ok(captured[0].description.endsWith(promptText('tools/read.md').split('\n').slice(1).join('\n')));assert.equal(captured[0].output.properties.value.type,'integer');assert.equal(result.assembly.tools[0],visible[1]);assert(result.audit.sdkRegenerated);assert.equal(result.assembly.sections.find(x=>x.name==='tools:sdk').interpolate,false);});
test('active SDK without current public renderer fails visibly',()=>{const a=assembly();a.sections.push({name:'tools:sdk',order:5000,text:'old sdk'});assert.throws(()=>transformAssembly(a,context),/current runtime SDK renderer/);});
test('missing output contract fails SDK regeneration visibly',()=>{const a=assembly([schema('read',['file_path','offset','limit'])]);a.sections.push({name:'tools:sdk',order:5000,text:'old sdk'});assert.throws(()=>transformAssembly(a,context,{renderSdk:()=>'',definition:()=>null}),/Missing live output contract/);});
for (const name of ['bash', 'pwsh']) {
  test(`${name}: optional background and escalation commands not advertised when absent`,()=>{const r=transformAssembly(assembly([schema(name,['command','workdir','timeoutMs'])]),context).assembly;assert(!r.tools[0].description.includes('`run_in_background`'));assert(!r.tools[0].description.includes('`sandbox_permissions`'));assert(!r.tools[0].description.includes('`job_output`'));});
  test(`${name}: missing job collector never leaves background references`,()=>{const r=transformAssembly(assembly([schema(name,['command','workdir','timeoutMs','run_in_background'])]),context).assembly;assert(!r.tools[0].description.includes('`job_output`'));assert(!r.tools[0].description.includes('`run_in_background`'));});
}
test('memory loader rejects traversal and unexpected paths',()=>{for(const p of ['../escape.md','/absolute.md','https://remote.md','main\\one.md'])assert.throws(()=>promptText(p),/Invalid prompt/);});


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


test('editable identity preserves all other prompt text and permits an empty identity', () => {
  const body = MAIN_FILES.map(promptText).join('\n\n');
  const custom = '你是研究助手。\n\n保留字面量 {{cwd}} 和 ${name}。';
  assert.equal(buildMainPrompt(custom), custom + '\n\n' + body);
  assert.equal(buildMainPrompt(''), body);
  assert.equal(buildMainPrompt(), mainPrompt);
  const result = transformAssembly(assembly([schema('computer_use',['code','title'])]), context, { main: buildMainPrompt(custom) }).assembly;
  assert.equal(result.sections[0].text, custom + '\n\n' + body);
  assert.equal(result.sections[0].interpolate, false);
});
