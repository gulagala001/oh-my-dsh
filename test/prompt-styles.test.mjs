import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Config, contextConfig } from '../src/config.mjs';
import { HubStore } from '../src/hub-store.mjs';
import { PROMPT_STYLES } from '../src/prompt-styles/options.mjs';
import { renderPromptStyle } from '../src/prompt-styles/render.mjs';
import { capturePromptStyle, agentPromptStyle, sessionPromptStyle, handlePromptStyleApi } from '../src/prompt-styles/session.mjs';
import { transformAssembly } from '../src/cc-adaptation/adapter.mjs';

const schema = name => ({ name, description: 'Native contract for ' + name, parameters: { type: 'object', properties: {} } });
const schemas = ['bash', 'pwsh', 'read', 'grep', 'write', 'edit', 'todo_write', 'note', 'recall', 'job_output', 'computer_use', 'subagent', 'ask_user_question'].map(schema);
schemas.find(t => t.name === 'recall').parameters.properties = { memory: {}, sessionId: {}, reference: {} };
const session = { id: 'chat', header: { origin: 'user', agentPreset: 'oh-my-dsh' } };

test('seven choices default to OMD with no session entry; invalid settings cannot silently select a style', () => {
  assert.deepEqual(PROMPT_STYLES.map(x => x.value), ['omd', 'dsh', 'codex', 'cursor', 'pi', 'grok', 'zcode']);
  const config = contextConfig({});
  assert.equal(config.promptStyle, 'omd');
  assert.equal(config.sessionPromptStyleEnabled, false);
  for (const promptStyle of [null, '', 'claude-code', [], true]) assert.throws(() => contextConfig({ promptStyle }));
  for (const { value } of PROMPT_STYLES) assert.equal(contextConfig({ promptStyle: value }).promptStyle, value);
  assert.ok(Config.dict.promptStyle);
});

test('source styles preserve live native/PTC tools, context and OMD memory without replacing the default or child prompt', () => {
  for (const style of PROMPT_STYLES.slice(1).map(x => x.value)) for (const sdk of ['', 'TypeScript native SDK', 'Python native SDK']) {
    const assembly = { contexts: [{ name: 'workspace', text: 'Actual cwd' }], tools: sdk ? [schema('run_code')] : schemas,
      sections: [{ name: 'harness:identity', text: 'You are an AI agent powered by DeepSeek Harness.' }, { name: 'oh-my-dsh:persona', text: 'old' },
        { name: 'tool:read', text: 'Native read guide' }, { name: 'sandbox:policy', text: 'Actual permission boundary' },
        ...(sdk ? [{ name: 'tools:sdk', text: sdk }, { name: 'tools:ptc-only', text: 'Actual transport' }] : [])] };
    const original = structuredClone(assembly);
    const { assembly: result } = transformAssembly(assembly, { agent: { session } }, { promptStyle: style, schemas, personalityModules: { identity: 'Independent personality' } });
    assert.deepEqual(assembly, original);
    assert.deepEqual(result.tools, assembly.tools);
    assert.equal(result.contexts, assembly.contexts);
    for (const section of assembly.sections.filter(x => !['harness:identity', 'oh-my-dsh:persona'].includes(x.name))) assert.ok(result.sections.includes(section));
    assert.equal(result.sections.some(x => x.name === 'harness:identity'), style === 'dsh');
    const main = result.sections.find(x => x.name === 'oh-my-dsh:persona').text;
    assert.ok(main.includes('Independent personality'));
    assert.ok(result.sections.some(x => x.name === 'oh-my-dsh:cc-memory'));
    assert.ok(result.sections.some(x => x.name === 'oh-my-dsh:cc-dream-memory'));
    assert.doesNotMatch(main, /\$\{[%{]|\{model_name\}|\{mcps_folder\}|functions\.exec|SwitchMode|CallMcpTool/);
    assert.equal(transformAssembly(assembly, { agent: { session: { ...session, header: { origin: 'subagent' } } } }, { promptStyle: style }).assembly, assembly);
    assert.equal(transformAssembly({ ...assembly, sections: [] }, { agent: { session } }, { promptStyle: style }).audit.applied, false);
  }
});

test('upstream behavioral sections survive adaptation, including conditional browser guidance and tool availability', () => {
  const native = transformAssembly({ sections: [{ name: 'oh-my-dsh:persona', text: 'placeholder' }], tools: [] }, { agent: { session } }, { promptStyle: 'dsh' }).assembly;
  assert.equal(native.sections[0].text, 'You are an AI agent powered by DeepSeek Harness.');
  const expectations = { codex: ['# Autonomy and persistence', '# Personality', '### Writing PR descriptions', '# Using skills'],
    cursor: ['<tone_and_style>', '<making_code_changes>', '<no_thinking_in_code_or_commands>', 'NEVER skip hooks', '## Agent Skills'],
    pi: ['<rules>', 'Be concise in your responses', '<docs>'],
    grok: ['<dangerous_actions>', '<work_policy>', '<communication>', '<formatting>'],
    zcode: ['# Harness', '# Communicating with the user', '# Context management', 'IMPORTANT: Assist with authorized security testing'] };
  for (const [style, sections] of Object.entries(expectations)) {
    const result = renderPromptStyle(style, { schemas });
    for (const text of sections) assert.ok(result.text.includes(text), style + ': ' + text);
    assert.ok(result.changes.every(x => x.before && x.reason));
  }
  assert.match(renderPromptStyle('grok', { schemas }).text, /<browser_verification>/);
  assert.doesNotMatch(renderPromptStyle('grok').text, /<browser_verification>|<background_tasks>|<memory>/);
  assert.match(renderPromptStyle('pi', { schemas: [schema('pwsh')] }).text, /- pwsh:/);
});

test('session selection is durable, ignored while disabled, and fixed within a native turn', async () => {
  const dir = mkdtempSync(join(process.env.OMD_TEST_TEMP ?? tmpdir(), 'omd-prompt-styles-'));
  try {
    let config = { promptStyle: 'codex', sessionPromptStyleEnabled: false };
    const hub = { config: () => config, store: new HubStore(dir) }, agent = { session };
    assert.equal(sessionPromptStyle(hub, { id: 'child', header: { origin: 'subagent' } }), 'omd');
    const call = async (method, input, extra = {}) => {
      let result;
      await handlePromptStyleApi({ hub, ctx: {}, req: { method }, res: {}, session, id: session.id,
        readBody: async () => input, send: (_res, status, data) => { result = { status, ...data }; }, ...extra });
      return result;
    };
    assert.equal((await call('GET')).enabled, false);
    assert.equal(hub.store.peek(session.id), undefined);
    assert.equal((await call('POST', { style: 'pi' })).status, 409);
    config.sessionPromptStyleEnabled = true;
    capturePromptStyle(hub, agent, 1);
    assert.equal((await call('POST', { style: 'pi' })).style, 'pi');
    assert.equal(agentPromptStyle(hub, agent), 'codex');
    capturePromptStyle(hub, agent, 2);
    assert.equal(agentPromptStyle(hub, agent), 'pi');
    hub.store = new HubStore(dir);
    assert.equal(sessionPromptStyle(hub, session), 'pi');
    config = { promptStyle: 'grok', sessionPromptStyleEnabled: false };
    assert.equal(sessionPromptStyle(hub, session), 'grok');
    capturePromptStyle(hub, agent, 2);
    assert.equal(agentPromptStyle(hub, agent), 'grok', 'reused native turn numbers after clear must refresh');
    assert.equal(hub.store.peek(session.id).promptStyle, 'pi');
    config.sessionPromptStyleEnabled = true;
    assert.equal(sessionPromptStyle(hub, session), 'pi');
    assert.equal((await call('POST', { style: 'bad' })).status, 400);
    const state = hub.store.state(session.id), save = hub.store.save;
    hub.store.save = () => { throw Error('disk failed'); };
    await assert.rejects(call('POST', { style: 'zcode' }), /disk failed/);
    assert.equal(state.promptStyle, 'pi');
    hub.store.save = save;
    const inspection = { meta: { id: 'chat', origin: 'user', agentPreset: 'omd-ptc' }, events: [] };
    assert.equal((await call('GET', null, { session: undefined, inspection })).enabled, true);
    inspection.events.push({ type: 'agent-preset/selected', data: { agentPreset: 'omaa-codex' } });
    assert.equal((await call('GET', null, { session: undefined, inspection })).enabled, false);
    for (const extra of [{ archivedOnly: true }, { session: { ...session, header: { origin: 'subagent', agentPreset: 'oh-my-dsh' } } },
      { ctx: { sessionProjections: { stateOf: () => 'omaa-codex' } } }]) assert.equal((await call('POST', { style: 'dsh' }, extra)).status, 409);
    assert.equal((await call('POST', { style: 'dsh' }, { refreshSession: async () => ({ found: false }) })).status, 404);
    assert.equal((await call('POST', { style: 'dsh' }, { refreshSession: async () => { config.sessionPromptStyleEnabled = false; return { session }; } })).status, 409);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
