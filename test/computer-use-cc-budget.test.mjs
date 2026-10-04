import test from 'node:test';
import assert from 'node:assert/strict';
import { transformAssembly } from '../src/cc-adaptation/adapter.mjs';
import { registerComputerTools } from '../vendor/opencu/src/computer-use/tools.mjs';
import { renderToolsSdk, renderToolsSdkPy } from '@deepseek-ai/dsh-tools';
import { verificationFixture } from './fixtures/verification.mjs';

const context = { agent: { session: { header: { origin: 'user' } } } };
function registeredTools() {
  const definitions = new Map();
  registerComputerTools({ tools: { register: tool => definitions.set(tool.name, tool) } }, {});
  return definitions;
}
function assembly(tools) {
  return { sections: [{ name: 'trisoul-x:persona', text: 'fixture persona' }], tools };
}
function budgetContract(parameters) {
  assert.equal(parameters.properties.timeoutMs.type, 'integer');
  assert.match(parameters.properties.timeoutMs.description, /between 1 and 300000/);
  assert.equal(parameters.properties.timeoutMs.default, 30000);
  assert.equal(parameters.required.includes('timeoutMs'), false);
}

test('the actual host registry accepts the budget schema and the execute entry rejects invalid budgets', async t => {
  const fixture = verificationFixture(t), calls = [];
  registerComputerTools(fixture.agent.ctx, {
    config: () => ({}), computerUse: { execute: async (_id, _code, options) => { calls.push(options); return { blocks: [] }; } },
  });
  const schema = fixture.ctx.tools.schemas(fixture.agent).find(tool => tool.name === 'computer_use');
  budgetContract(schema.parameters);
  for (const timeoutMs of [0, -1, 300001, 1.5, '30000', null]) {
    const result = await fixture.invoke('computer_use', { code: '', title: 'Invalid budget fixture', timeoutMs });
    assert.equal(result.isError, true, `invalid budget ${String(timeoutMs)} must fail through the real host tool loop`);
  }
  assert.equal(calls.length, 0);
  for (const timeoutMs of [undefined, 1, 300000]) {
    const args = { code: '', title: 'Valid budget fixture', ...(timeoutMs === undefined ? {} : { timeoutMs }) };
    const result = await fixture.invoke('computer_use', args);
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.equal(calls.at(-1).timeoutMs, timeoutMs ?? 30000);
  }
});
function budgetGuidance(text) {
  assert.match(text, /timeoutMs/);
  assert.match(text, /300000/);
  assert.match(text, /30000/);
  assert.match(text, /preserves emitted output/);
  assert.match(text, /last returned operation/);
  assert.match(text, /does not verify the intended UI result/);
  assert.match(text, /partially changed the UI/);
  assert.match(text, /current content version/);
  assert.match(text, /cua\.rewriteDocumentation\(topic\)/);
}

test('native CC adaptation retains the actual Computer Use timeout contract and current guidance', () => {
  const tool = registeredTools().get('computer_use');
  const adapted = transformAssembly(assembly([tool]), context).assembly.tools[0];
  assert.equal(adapted.parameters, tool.parameters);
  budgetContract(adapted.parameters);
  budgetGuidance(adapted.description);
  assert.equal(adapted.execute, tool.execute);
});

for (const mode of ['ptc', 'both']) for (const language of ['typescript', 'python']) {
  test(`${mode}/${language} CC SDK carries the actual Computer Use timeout contract and current guidance`, () => {
    const definitions = registeredTools();
    const computer = definitions.get('computer_use');
    const runCode = { name: 'run_code', description: 'Run a program', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } };
    const source = assembly(mode === 'ptc' ? [runCode] : [runCode, computer]);
    source.sections.push({ name: 'tools:sdk', text: 'fixture sdk' });
    if (mode === 'ptc') source.sections.push({ name: 'tools:ptc-only', text: 'run_code only' });
    let captured;
    const renderer = language === 'python' ? renderToolsSdkPy : renderToolsSdk;
    const result = transformAssembly(source, context, {
      schemas: [runCode, computer], definition: name => definitions.get(name),
      renderSdk: tools => { captured = tools; return renderer(tools); },
    }).assembly;
    const sdkTool = captured.find(tool => tool.name === 'computer_use');
    assert.equal(sdkTool.parameters, computer.parameters);
    budgetContract(sdkTool.parameters);
    budgetGuidance(sdkTool.description);
    const sdk = result.sections.find(section => section.name === 'tools:sdk').text;
    budgetGuidance(sdk);
    assert.match(sdk, language === 'python' ? /timeoutMs: NotRequired\[int\]/ : /timeoutMs\?: number/);
    assert.deepEqual(result.tools.map(tool => tool.name), source.tools.map(tool => tool.name));
  });
}
