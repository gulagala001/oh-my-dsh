import test from 'node:test';
import assert from 'node:assert/strict';
import { UltracodeControl, savedUltraMode, hasNativeTeamTools } from '../src/ultracode.mjs';

const teamTools = ['spawn_teammate', 'send_message', 'list_agents', 'wait_agent', 'interrupt_agent',
  'team_task_create', 'team_task_list', 'team_task_get', 'team_task_update'].map(name =>
    ({ name, parameters: { properties: name === 'send_message' ? { target: { type: 'string' } } : {} } }));

function fixture(saved, teamEnabled = false) {
  const events = [{ seq: 0, type: 'model/selection', data: { provider: 'local', model: 'main', reasoningEffort: 'xhigh' } }];
  const session = { id: 'session-mode', header: {}, get seq() { return events.length; }, eventAt: seq => events[seq] };
  const tools = { schemas: () => [{ name: 'workflow', parameters: { properties: { resumeFromRunId: {} } } }, ...teamEnabled ? teamTools : []] };
  const agent = { session, status: 'idle', ctx: { get: () => tools } };
  const state = { ultracode: saved };
  const store = { peek: () => state, state: () => state, save: next => Object.assign(state, next) };
  const ctx = { agents: { get: () => agent }, sessions: { flush: async () => {} },
    llm: { resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'xhigh' }, { id: 'max' }] } }) },
    get: name => name === 'sessionController' ? { selectModel: async input => {
      const { sessionId, ...selected } = input;
      events.push({ seq: events.length, type: 'model/selection', data: selected }); return { selected };
    } } : undefined };
  const control = new UltracodeControl(ctx, () => true, store);
  const select = (mode, submode) => control.select(session.id, { provider: 'local', model: 'main', mode, submode, expectedRevision: control.view(session, agent).revision });
  const turn = n => { const event = { seq: events.length, type: 'turn/start', data: { turn: n } }; events.push(event); control.committed(session, event); };
  return { agent, session, state, control, select, turn, setTeamEnabled: enabled => { teamEnabled = enabled; } };
}

test('legacy Pro becomes Ultra Workflow while the retired mode cannot reactivate', async () => {
  const f = fixture({ mode: 'pro', selectionSeq: 0 });
  assert.equal(f.control.view(f.session).mode, 'ultra');
  assert.equal(f.control.view(f.session).submode, 'workflow');
  for (const old of [{ mode: 'ultracode', enabled: true }, { enabled: true }, undefined]) {
    assert.deepEqual(savedUltraMode(old), { mode: 'off', submode: 'free' });
  }
  await assert.rejects(f.select('pro'), /无效/);
  await assert.rejects(f.select('ultracode'), /无效/);
});

test('all Ultra strategies keep the Pro effort rule and remember selection while off', async () => {
  const f = fixture(undefined, true);
  for (const submode of ['workflow', 'team', 'free']) {
    const value = await f.select('ultra', submode);
    assert.equal(value.selected.reasoningEffort, 'xhigh');
    assert.equal(value.submode, submode);
  }
  await f.select('ultra', 'team');
  const off = await f.select('off');
  assert.equal(off.mode, 'off'); assert.equal(off.submode, 'team');
  assert.equal((await f.select('ultra')).submode, 'team');
  await assert.rejects(f.select('ultra', 'invented'), /无效/);
});

test('Team availability follows existing DSH tools and does not activate or replace them', async () => {
  const f = fixture({ mode: 'ultra', submode: 'team', selectionSeq: 0 });
  const disabled = f.control.view(f.session);
  assert.equal(disabled.teamAvailable, false);
  assert.equal(disabled.submode, 'free'); assert.equal(disabled.savedSubmode, 'team');
  await assert.rejects(f.select('ultra', 'team'), /DSH/);
  assert.equal(f.state.ultracode.submode, 'team');
  assert.equal(hasNativeTeamTools(teamTools.slice(1)), false);
  assert.equal(hasNativeTeamTools(teamTools.filter(tool => tool.name !== 'interrupt_agent')), true);
  assert.equal(hasNativeTeamTools(teamTools.map(tool => tool.name === 'send_message'
    ? { ...tool, parameters: { properties: { agent_id: {} } } } : tool)), false);

  f.setTeamEnabled(true);
  assert.equal(f.control.view(f.session).teamAvailable, true);
  assert.equal(f.control.view(f.session).submode, 'team');
  f.agent.status = 'running'; f.turn(1);
  const native = { name: 'team:policy', text: 'Native policy' }, identity = { name: 'team:identity', text: 'Native identity' };
  const assembly = await f.control.assemble(f.agent, async () => ({ sections: [native], contexts: [identity], tools: teamTools }));
  assert.equal(assembly.tools, teamTools); assert.equal(assembly.contexts[0], identity);
  assert.equal(assembly.sections.length, 1); assert.match(assembly.sections[0].text, /Ultra 的 Agent Team/);
  assert.equal(native.text, 'Native policy');
  f.setTeamEnabled(false);
  const fallback = await f.control.assemble(f.agent, async () => ({ sections: [] }));
  assert.match(fallback.sections.at(-1).text, /Ultra 的自由模式/);
  assert.equal(f.state.ultracode.submode, 'team');
  assert.equal(f.control.view(f.session).pending, false);
  const remembered = await f.select('off');
  assert.equal(remembered.savedSubmode, 'team'); assert.equal(remembered.submode, 'free');
});

test('a running turn keeps its strategy until the next turn, including disable', async () => {
  const f = fixture(); await f.select('ultra', 'workflow');
  f.agent.status = 'running'; f.turn(1);
  assert.equal((await f.select('ultra', 'free')).pending, true);
  const assemble = () => f.control.assemble(f.agent, async () => ({ sections: [] }));
  assert.match((await assemble()).sections.at(-1).text, /Workflow authoring reference/);
  f.turn(2);
  assert.equal(f.control.view(f.session).pending, false);
  assert.match((await assemble()).sections.at(-1).text, /Ultra 的自由模式已开启/);
  assert.equal((await f.select('off')).pending, true);
  assert.equal(f.control.currentMode(f.agent), 'ultra');
  f.turn(3); assert.equal(f.control.currentMode(f.agent), 'off');
  assert.ok(!(await assemble()).sections.some(section => section.text.includes('Ultra 的自由模式已开启')));
});
