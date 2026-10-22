import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'acorn';
import { installPromptAdapter } from '../src/cc-adaptation/adapter.mjs';
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
  ];
  const schemas = definitions.map(({ output, ...schema }) => schema);
  const sections = [{ name: 'oh-my-dsh:persona', text: 'Placeholder' }, { name: 'plan:policy', text: policy },
    ...controls.map(({ name, description }) => ({ name: `tool:${name}`, text: description }))];
  if (runtime) sections.push({ name: 'tools:sdk', text: 'Host SDK' }, { name: 'tools:ptc-only', text: 'SDK tools only' });
  const assembly = { sections, tools: runtime ? schemas.filter(t => t.name === 'run_code') : schemas };
  let hook;
  installPromptAdapter({
    on: (_event, callback) => { hook = callback; },
    get: name => name === 'ptcRuntime' ? runtime : undefined,
    tools: { schemas: () => schemas, get: name => definitions.find(t => t.name === name) },
    omd: { config: () => ({ identityPrompt: 'OMD fixture identity' }) },
  });
  return { assembly, schemas, controls, assemble: (origin = 'user') => hook(null, { agent: { session: { header: { origin } } } }, async () => assembly) };
}
const section = (assembly, name) => assembly.sections.find(s => s.name === name)?.text;

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
    assert.equal(await f.assemble('subagent'), f.assembly);
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
  }
});

test('Python SDK keeps its native language and runtime-neutral OMD guidance', async () => {
  const result = await fixture({ language: 'python', programFormat: 'repl' }).assemble();
  assert.ok(section(result, 'tools:sdk').includes('async def bash('));
  assert.ok(!/\breturn (?:its result|or print)\b/.test(section(result, 'oh-my-dsh:persona') + section(result, 'plan:policy')));
});

test('both generated presets use the authored policy and require explicit plan approval', async () => {
  const generated = readFileSync(new URL('../presets/cordis.patch.yml', import.meta.url), 'utf8');
  const indented = composition.trimEnd().split('\n').map(line => '          ' + line).join('\n');
  assert.equal(generated.split(indented).length - 1, 2, 'Native/PTC preset copies match the authored composition');
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
      assert.ok(text.includes('withIsolatedBrowser') && text.includes('--use-mock-keychain') && text.includes('--password-store=basic'));
      assert.ok(text.includes('file:') && text.includes('/src/browser/automation.mjs'), 'the installed helper is directly importable from project scripts');
      assert.ok(text.includes(name === 'bash' ? '${VAR:?}' : '$HOME'));
      if (name === 'pwsh') assert.ok(text.includes('case-insensitive') && text.includes('$home'));
    }
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
