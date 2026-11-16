import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'acorn';
import { installPromptAdapter, projectToolDeclarations, transformAssembly } from '../src/cc-adaptation/adapter.mjs';
import { computerDescription } from '#opencu/src/dsh/computer-docs.mjs';
import { buildMainPrompt } from '../src/cc-adaptation/texts.mjs';
import { renderBudget } from '../src/task-budget.mjs';
import { renderRuntimeState } from '../src/runtime-state.mjs';

const composition = readFileSync(new URL('../presets/oh-my-dsh/agent.cordis.yml', import.meta.url), 'utf8');
const policy = composition.match(/section: \|\n([\s\S]*?)\n- id: compaction/)[1].replace(/^ {14}/gm, '').trim();
const tool = (name, description, properties = {}, output = { type: 'object' }) => ({
  name, description, parameters: { type: 'object', properties }, output: { schema: output },
});

function fixture(runtime, team = false) {
  const controls = [
    tool('list_agents', 'Live host: running / inactive; inactive is not completion.', {},
      { type: 'array', items: { type: 'string', enum: ['running', 'inactive'] } }),
    tool('interrupt_agent', 'Live host: external executions stop permanently; local direct children accept follow-ups.', { agent_id: { type: 'string' } }),
  ];
  if (team) controls.push(tool('spawn_teammate', 'Live Team tool'), tool('send_message', 'Live Team targets', { target: { type: 'string' } }));
  const definitions = [...controls,
    tool('bash', 'Live bash', { command: { type: 'string' }, workdir: { type: 'string' }, timeoutMs: { type: 'number' } }),
    tool('pwsh', 'Live pwsh', { command: { type: 'string' }, workdir: { type: 'string' } }),
    tool('exit_plan_mode', 'Live plan review', { plan: { type: 'string' } }, { type: 'object', properties: { approved: { type: 'boolean' } } }),
    tool('run_code', 'Live runtime instructions'),
    tool('working_directory', 'Refresh current directory'),
  ];
  const schemas = definitions.map(({ output, ...schema }) => schema);
  const sections = [{ name: 'oh-my-dsh:persona', text: 'Placeholder' }, { name: 'plan:policy', text: policy },
    ...controls.map(({ name, description }) => ({ name: `tool:${name}`, text: description }))];
  if (runtime) sections.push({ name: 'tools:sdk', text: 'Host SDK' }, { name: 'tools:ptc-only', text: 'SDK tools only' });
  const assembly = { sections, tools: runtime ? schemas.filter(t => t.name === 'run_code') : schemas };
  let hook;
  const ctx = {
    systemPrompt: {},
    on: (_event, callback) => { hook = callback; },
    get: name => name === 'ptcRuntime' ? runtime : undefined,
    tools: { schemas: () => schemas, get: name => definitions.find(t => t.name === name) },
    omd: { config: () => ({ identityPrompt: 'OMD fixture identity' }) },
  };
  installPromptAdapter(ctx);
  return { assembly, schemas, controls, async assemble(origin = 'user') {
    const context = { agent: { session: { header: { origin } } } };
    // Modern DSH assembles prompt sections and provider-owned tool declarations separately.
    const presentation = await hook(null, context, async () => ({ sections: assembly.sections }));
    const model = projectToolDeclarations(ctx, { schemas: assembly.tools }, definitions, context);
    return { ...presentation, tools: model.schemas };
  } };
}
const section = (assembly, name) => assembly.sections.find(s => s.name === name)?.text;

test('unseeded Native children share the prompt discovery catalog with provider declarations', async () => {
  const definitions = ['tool_find', 'mcp__fixture__large'].map(name => tool(name, 'Detailed optional contract. '.repeat(150)));
  let hook;
  const ctx = { systemPrompt: {}, on: (_name, listener) => { hook = listener; },
    tools: { schemas: () => definitions, get: name => definitions.find(item => item.name === name) },
    omd: { config: () => ({}), optimization: { enabled: () => true } } };
  const context = { agent: { session: { id: 'child', header: { origin: 'subagent', isSeeded: false, agentPreset: 'oh-my-dsh' } } } };
  installPromptAdapter(ctx);
  const prompt = await hook(null, context, async () => ({ sections: definitions.map(item => ({ name: 'tool:' + item.name, text: item.description })) }));
  const model = projectToolDeclarations(ctx, { schemas: definitions }, definitions, context);
  assert.match(section(prompt, 'omd:tool-discovery'), /mcp__fixture__large/);
  assert.deepEqual(model.schemas.map(item => item.name), ['tool_find']);
});

test('native and PTC preserve live child/Team controls, identities, schemas and subagent scope', async () => {
  for (const runtime of [undefined, { language: 'typescript', programFormat: 'repl' }]) for (const team of [false, true]) {
    const f = fixture(runtime, team), result = await f.assemble();
    for (const control of f.controls) {
      assert.equal(section(result, `tool:${control.name}`), control.description);
      if (runtime) assert.ok(section(result, 'tools:sdk').includes(control.description));
      else assert.equal(result.tools.find(t => t.name === control.name), f.schemas.find(t => t.name === control.name));
    }
    assert.deepEqual(result.tools.map(t => t.parameters), f.assembly.tools.map(t => t.parameters));
    assert.ok(section(result, 'oh-my-dsh:persona').startsWith('OMD fixture identity'));
    const child = await f.assemble('subagent');
    assert.equal(section(child, 'oh-my-dsh:persona'), 'Placeholder');
    assert.deepEqual(child.tools, f.assembly.tools);
    for (const control of f.controls) assert.equal(section(child, `tool:${control.name}`), control.description);
  }
});

test('TypeScript SDK follows the live execution format and REPL guidance never requires return', async () => {
  const runtime = { language: 'typescript', programFormat: 'function-body' }, f = fixture(runtime);
  for (const format of ['function-body', 'repl']) {
    runtime.programFormat = format;
    const result = await f.assemble(), sdk = section(result, 'tools:sdk');
    const example = sdk.match(/code: "([^"]+)"/)[1];
    assert.ok(example.startsWith(format === 'repl' ? 'console.log(' : 'return await '), `Wrong SDK syntax for ${format}`);
    if (format === 'repl') {
      assert.doesNotThrow(() => parse(example, { ecmaVersion: 'latest', sourceType: 'module' }));
      assert.ok(!/\breturn (?:its result|or print)\b/.test(section(result, 'oh-my-dsh:persona') + section(result, 'plan:policy')));
    }
    assert.ok(sdk.includes('approved?: boolean'), 'Live output schema is retained');
    assert.match(example, /tools.working_directory/);
    assert.doesNotMatch(sdk, /command: 'pwd'/);
  }
});

test('Python SDK keeps its native language and runtime-neutral OMD guidance', async () => {
  const result = await fixture({ language: 'python', programFormat: 'repl' }).assemble();
  assert.ok(section(result, 'tools:sdk').includes('async def bash('));
  assert.ok(!/\breturn (?:its result|or print)\b/.test(section(result, 'oh-my-dsh:persona') + section(result, 'plan:policy')));
});

test('both generated presets use the authored policy and require explicit plan approval', async () => {
  const generated = readFileSync(new URL('../presets/cordis.patch.yml', import.meta.url), 'utf8');
  for (const executor of ['native-executor', 'ptc']) {
    const expected = composition.replace("name: 'oh-my-dsh/native-executor'", "name: 'oh-my-dsh/" + executor + "'").trimEnd().split('\n').map(line => line ? '          ' + line : '').join('\n');
    assert.ok(generated.includes(expected), `${executor} preset matches the authored composition`);
  }
  assert.ok(policy.includes('approved: true') && !policy.includes('`exit_plan_mode` succeeds'));
  const review = (await fixture().assemble()).tools.find(t => t.name === 'exit_plan_mode').description;
  assert.ok(review.includes('approved: true') && review.includes('approved: false'));
});

test('Shell path and variable guards survive native and SDK adaptation', async () => {
  for (const runtime of [undefined, { language: 'typescript', programFormat: 'repl' }]) {
    const result = await fixture(runtime).assemble();
    for (const name of ['bash', 'pwsh']) {
      const text = runtime ? section(result, 'tools:sdk') : result.tools.find(t => t.name === name).description;
      assert.ok(text.includes('resolved absolute target path'));
      assert.doesNotMatch(text, /withIsolatedBrowser/);
      assert.doesNotMatch(text, /--use-mock-keychain/);
      assert.ok(text.includes(name === 'bash' ? '${VAR:?}' : '$HOME'));
      if (name === 'pwsh') assert.ok(text.includes('case-insensitive') && text.includes('$home'));
    }
    const guide = section(result, 'oh-my-dsh:persona');
    assert.doesNotMatch(guide, /computer_use|withIsolatedBrowser/);
    assert.equal(guide.match(/--use-mock-keychain/g)?.length, 1);
    assert.match(guide, /--password-store=basic/);
  }
});

test('Native, PTC and Both expose one complete browser guide and distinguish job receipts', () => {
  const toolset = [tool('computer_use', computerDescription), tool('bash', 'Live bash',
    Object.fromEntries(['command', 'workdir', 'timeoutMs', 'run_in_background', 'yieldMs'].map(name => [name, { type: 'string' }]))),
    tool('job_output', 'Live job output', { job_id: { type: 'string' }, wait: { type: 'boolean' } }),
    tool('send_message', 'Live child messaging', { agent: { type: 'string' }, message: { type: 'string' } }), tool('run_code', 'Live SDK entry')];
  for (const toolMode of ['native', 'ptc', 'both']) for (const directJob of [false, true]) {
    const direct = toolMode !== 'ptc' ? toolset : toolset.filter(t => t.name === 'run_code' || directJob && t.name === 'job_output');
    const sections = [{ name: 'oh-my-dsh:persona', text: '' }];
    if (toolMode !== 'native') sections.push({ name: 'tools:sdk', text: 'SDK' });
    const { assembly } = transformAssembly({ sections, tools: direct }, { agent: { session: { header: { origin: 'subagent', isSeeded: true } } } }, {
      schemas: toolset, toolMode, backgroundTasksEnabled: true, todoConstraintFirst: true,
      renderSdk: tools => tools.map(t => t.description).join('\n'), definition: name => toolset.find(t => t.name === name),
    });
    const sdk = section(assembly, 'tools:sdk') ?? '', persona = section(assembly, 'oh-my-dsh:persona');
    const directText = assembly.tools.map(t => t.description).join('\n'), total = `${persona}\n${directText}\n${sdk}`;
    assert.equal(total.match(/--use-mock-keychain/g)?.length, 1);
    assert.equal(total.match(/First extract the task's applicable constraints/g)?.length, 1);
    assert.equal(persona.includes('`yieldMs`'), toolMode !== 'ptc');
    assert.equal(directText.includes('rendered `[status: ...]` line'), toolMode !== 'ptc' || directJob);
    assert.equal(sdk.includes('inspect `job.status`'), toolMode !== 'native');
    const sender = toolMode === 'ptc' ? sdk : assembly.tools.find(t => t.name === 'send_message').description;
    assert.ok(sender.includes('Live child messaging'));
  }
});

test('execution guidance is English while budget UI and user identities retain their language', () => {
  const root = new URL('../src/cc-adaptation/prompts/', import.meta.url);
  for (const path of readdirSync(root, { recursive: true }).filter(path => path.endsWith('.md'))) {
    assert.doesNotMatch(readFileSync(new URL(path, root), 'utf8'), /\p{Script=Han}/u, path);
  }
  for (const toolMode of ['native', 'ptc']) assert.doesNotMatch(buildMainPrompt(undefined, { toolMode }), /\p{Script=Han}/u);
  assert.ok(buildMainPrompt('用户自定义身份').startsWith('用户自定义身份'));
  const budget = { visible: true, limits: { tokens: 10000, rounds: 5, timeMs: 120000 }, tokens: 5000, rounds: 2, elapsedMs: 60000, unmetered: 1 };
  assert.match(renderBudget(budget), /预算/);
  const state = renderRuntimeState({ sampledAt: '2026-10-18', turn: 1, step: 2, budget, jobs: [], jobsAvailable: true,
    context: { records: { raw: 0, detail: 0, brief: 0 }, automaticReplace: true } });
  assert.doesNotMatch(state, /\p{Script=Han}/u);
  assert.match(state, /Tokens: 5,000 \/ 10,000 \(50%\)/);
  assert.match(state, /Execution time: 1 minutes \/ 2 minutes \(50%\)/);
  assert.equal(renderBudget({ ...budget, limits: { tokens: null, rounds: null, timeMs: null } }, { language: 'en' }), 'Budget: unlimited');
});

test('desktop links replace only the desktop citation rule; no dangling constraint pointer', () => {
  const sections = [{ name: 'oh-my-dsh:persona', text: '' }], ui = { name: 'ui:deliverable-file-references', text: 'host policy' };
  const bindings = { todo_write: { file:'tools/todo-write.md',fields:[] } }, todo = tool('todo_write', 'native'), ctx = { agent: { session: { header:{} } } };
  for (const desktop of [false, true]) for (const enabled of [false, true]) {
    const { assembly } = transformAssembly({sections:desktop?[...sections,ui]:sections,tools:[todo]},ctx,{bindings,todoConstraintFirst:enabled});
    assert.equal(section(assembly,'oh-my-dsh:persona').includes('Reference code as'),!desktop);
    if(desktop) assert.match(section(assembly,ui.name), /path#L24-L30/);
    assert.equal(assembly.tools[0].description.includes('## Constraint-first reasoning'),enabled);
    assert.equal(section(assembly,'oh-my-dsh:persona').includes('## Constraint-first reasoning'),enabled);
  }
});

test('actual Native describe-before-assemble ordering preserves discovery and loads server instructions on demand', async () => {
  const { setPresentedExecutor } = await import('../src/host/prompt-provider.mjs');
  const { installCatalog } = await import('../src/result-reduction/catalog.mjs');
  const definitions = [tool('mcp__fixture__lookup', 'Optional details. '.repeat(200))];
  let hook, executor;
  const server = { name: 'mcp:fixture', text: '### MCP server: fixture\nStart with lookup.' };
  const agent = { session: { header: { origin: 'user' } } };
  const ctx = { effect() {}, get() {},
    on: (_name, callback) => { hook = callback; },
    tools: { schemas: () => definitions, get: name => definitions.find(t => t.name === name),
      register: value => definitions.push(value), setExecutor: value => { executor = value; } },
    omd: { config: () => ({}), optimization: { enabled: () => true } },
    systemPrompt: { async assemble(context) {
      const model = executor.describe(definitions);
      const prompt = await hook(null, context, async () => ({ sections: [{ name: 'oh-my-dsh:persona', text: '' }, server] }));
      return { ...prompt, tools: model.schemas };
    } },
  };
  installCatalog(ctx, ctx.omd); installPromptAdapter(ctx);
  setPresentedExecutor(ctx, { describe: defs => ({ schemas: defs }), execute() {} },
    (model, defs, context) => projectToolDeclarations(ctx, model, defs, context));
  const before = await ctx.systemPrompt.assemble({ agent });
  assert.deepEqual(before.tools.map(t => t.name), ['tool_find']);
  assert.match(section(before, 'omd:tool-discovery'), /mcp__fixture__lookup/);
  assert.equal(section(before, 'mcp:fixture'), undefined);
  await definitions.find(t => t.name === 'tool_find').execute({ query: 'fixture' }, { agent });
  const after = await ctx.systemPrompt.assemble({ agent });
  assert.ok(after.tools.some(t => t.name === 'mcp__fixture__lookup'));
  assert.equal(section(after, 'mcp:fixture'), server.text);
  assert.equal(section(after, 'omd:tool-discovery'), undefined);
});

test('runtime permission projection omits impossible escalation and restores it after a policy switch', async () => {
  const { executionPresentation, projectExecutionSchemas } = await import('../src/cc-adaptation/capabilities.mjs');
  let approval = 'never', mode = 'workspace-write';
  const ctx = { get: name => name === 'approval' ? { overrideOf: () => approval } : name === 'sandboxPolicy' ? { resolve: () => ({ mode }) } : undefined };
  const agent = { session: { header: {} } };
  const schemas = ['write', 'run_code'].map(name => tool(name, 'host', { file_path: { type: 'string' }, content: { type: 'string' }, sandbox_permissions: { type: 'string' }, justification: { type: 'string' } }));
  for (const toolMode of ['native', 'ptc', 'both']) {
    const projected = projectExecutionSchemas(schemas, executionPresentation(ctx, agent));
    const sections = [{ name: 'oh-my-dsh:persona', text: '' }, ...(toolMode === 'native' ? [] : [{ name: 'tools:sdk', text: 'SDK' }])];
    const result = transformAssembly({ sections, tools: projected }, { agent }, { schemas: projected, toolMode,
      renderSdk: tools => JSON.stringify(tools), definition: () => ({ output: { schema: { type: 'string' } } }) }).assembly;
    assert.doesNotMatch(JSON.stringify(result), /sandbox_permissions|justification/);
    assert.ok(schemas[0].parameters.properties.sandbox_permissions, 'host execution contract was not mutated');
  }
  approval = 'ask';
  assert.equal(projectExecutionSchemas(schemas, executionPresentation(ctx, agent)), schemas);
  mode = 'danger-full-access';
  assert.equal(projectExecutionSchemas(schemas, executionPresentation(ctx, agent))[0].parameters.properties.sandbox_permissions, undefined);
});

test('packaged host guidance preserves runtime paths, does not prescribe builds, and keeps global headings separate', async () => {
  const { neutralizeHostEnvironment } = await import('../src/cc-adaptation/environment.mjs');
  const contexts = [{ name: 'harness:source', text: 'Current checkout: "/Applications/Host.app/Contents/Resources/app.asar/dsh/".' }];
  const assembly = { contexts, sections: [{ name: 'harness:source', text: 'Use pwd' }, { name: 'app:web-surface', text: 'Run pnpm run dev:web' }] };
  const result = neutralizeHostEnvironment(assembly);
  assert.deepEqual(result.contexts, contexts);
  assert.match(result.sections[0].text, /packaged archive/);
  assert.match(result.sections[0].text, /working_directory/);
  assert.doesNotMatch(result.sections.map(s => s.text).join('\n'), /Use pwd|pnpm run dev:web/);
  assert.ok(result.sections.every(s => s.text.startsWith('## ')));
  const source = neutralizeHostEnvironment({ ...assembly, contexts: [{ name: 'harness:source', text: '/source/dsh' }] });
  assert.match(source.sections[0].text, /verify.*writable source checkout/);
  assert.match(source.sections[1].text, /dev:web/);
});

test('Native contracts do not require absent plan or PTC entry points; scheduling yield is separate from delivery', () => {
  const schemas = [tool('ask_user_question', '', { questions: {} }), tool('todo_write', '', { op: {} }), tool('recall', '', { id: {}, from: {}, to: {} }), tool('wait_agent', 'Wait for inbox input')];
  const sections = [{ name: 'oh-my-dsh:persona', text: '' }, { name: 'tool:subagent', text: 'When only waiting for their results remains, end your turn instead of sleeping or polling; the next result starts a new turn. Collect the subagent results required to complete the task before giving the user a final answer.' }];
  for (const wait of [true, false]) {
    const available = schemas.filter(t => wait || t.name !== 'wait_agent');
    const { assembly } = transformAssembly({ tools: available, sections }, { agent: { session: { header: {} } } });
    const text = JSON.stringify(assembly);
    assert.doesNotMatch(text, /exit_plan_mode|run_code|end your turn instead/);
    assert.match(section(assembly, 'tool:subagent'), wait ? /wait_agent/ : /scheduling yield is not final delivery/);
  }
});
