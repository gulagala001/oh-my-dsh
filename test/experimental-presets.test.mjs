import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ExperimentalPresets, UNHARNESSED_PRESET as PRESET, UNHARNESSED_SETTING as SETTING } from '../src/experimental-presets.mjs';
import { contextConfig } from '../src/config.mjs';

test('experimental preset is opt-in, transactional and fences disabled retained sessions', async () => {
  let config = contextConfig({}), definition, guard, failSave = false, broken = false, active = false;
  const agents = [], hooks = new Map();
  const ctx = {
    tools: { guard: fn => { guard = fn; } }, on: (name, fn) => hooks.set(name, fn), get: () => undefined,
    sessionProjections: { stateOf: session => session.header.agentPreset }, agents: { list: () => agents }, logger: { warn() {} },
    agentPresets: { defaultId: 'oh-my-dsh', register: async value => { assert.equal(definition, undefined); definition = value; return async () => { definition = undefined; }; },
      resolve: async () => ({ broken: broken ? 'fixture load failure' : undefined }), serviceFor: () => ({ busy: () => active }) },
    settings: { async update(_name, patch) { if (failSave) throw Error('disk failed'); config = { ...config, ...patch }; hooks.get('app-boot/config-reload')(); } },
  };
  const manager = new ExperimentalPresets(ctx, { config: () => config, store: { dir: '/fixture/omd' } });
  await manager.start(); assert.equal(config[SETTING], false); assert.equal(definition, undefined);
  const agent = { session: { header: { agentPreset: PRESET } }, status: 'idle', inbox: { nextTurn: [], nextStep: [] } };
  agents.push(agent);
  assert.match(guard({ agent }), /开启 Unharnessed/);
  assert.equal(guard({ agent: { ...agent, session: { header: { agentPreset: 'unharnessed' } } } }), undefined);
  broken = true; await assert.rejects(manager.update({ [SETTING]: true }), /fixture load failure/);
  assert.equal(definition, undefined); assert.equal(config[SETTING], false);
  broken = false; failSave = true; await assert.rejects(manager.update({ [SETTING]: true }), /disk failed/);
  assert.equal(definition, undefined); assert.equal(config[SETTING], false);
  failSave = false; await manager.update({ [SETTING]: true }); assert.equal(manager.enabled(), true); assert.equal(guard({ agent }), undefined);
  active = true; await assert.rejects(manager.update({ [SETTING]: false }), /后台命令/); assert.equal(config[SETTING], true);
  active = false; ctx.agentPresets.defaultId = PRESET; await assert.rejects(manager.update({ [SETTING]: false }), /默认预设/);
  ctx.agentPresets.defaultId = 'oh-my-dsh'; await manager.update({ [SETTING]: false });
  assert.equal(definition, undefined); assert.match(guard({ agent }), /检查点已保留/);
  await manager.close();
  const restarted = new ExperimentalPresets(ctx, { config: () => ({ ...config, [SETTING]: true }), store: { dir: '/fixture/omd' } });
  broken = true; await restarted.start(); assert.match(restarted.inspect().error, /fixture load failure/); assert.equal(restarted.enabled(), false);
  broken = false; await restarted.update({ [SETTING]: true }); assert.equal(restarted.enabled(), true); await restarted.close();
});

test('real host loads the optional preset and retains Python state across availability changes', { timeout: 30000 }, async t => {
  const host = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
  const { Context } = await import(host.resolve('@deepseek-ai/cordis'));
  const { default: Loader, Group } = await import(host.resolve('@deepseek-ai/cordis-plugin-loader'));
  const { SessionId } = await import(host.resolve('@deepseek-ai/dsh-session'));
  const dir = await mkdtemp(join(process.env.OMD_TEST_TEMP ?? tmpdir(), 'omd-unharnessed-'));
  const ctx = new Context(); let config = contextConfig({});
  t.after(async () => { await ctx.fiber.dispose(); await rm(dir, { recursive: true, force: true }); });
  await mkdir(join(dir, 'node_modules/@deepseek-ai'), { recursive: true });
  for (const plugin of ['tool-executor-native', 'agent-instructions', 'skill-filesystem', 'command-goal', 'compaction-basic', 'command-compact']) {
    const name = '@deepseek-ai/dsh-' + plugin;
    await symlink(dirname(host.resolve(name + '/package.json')), join(dir, 'node_modules', name));
  }
  await symlink(fileURLToPath(new URL('../', import.meta.url)), join(dir, 'node_modules/oh-my-dsh'));
  ctx.baseUrl = pathToFileURL(join(dir, 'host.mjs')).href;
  await ctx.plugin(Loader, { baseUrl: ctx.baseUrl });
  ctx.loader.builtins.group = Group;
  for (const name of ['system-prompt', 'tools', 'tool-executor-native', 'session', 'session-projection', 'agent', 'llm', 'agent-loop', 'goal', 'commands', 'skill', 'fs-local', 'working-directory', 'subprocess-local', 'sandbox-local', 'token-meter']) {
    const module = await import(host.resolve('@deepseek-ai/dsh-' + name)); await ctx.plugin(module.default ?? module);
  }
  const policy = await import(host.resolve('@deepseek-ai/dsh-sandbox-policy'));
  await ctx.plugin(policy.default ?? policy, { mode: 'danger-full-access' });
  const registry = await import(host.resolve('@deepseek-ai/dsh-agent-preset-registry'));
  await ctx.plugin(registry.default ?? registry, { default: 'standard' });
  await ctx.agentPresets.register({ id: 'standard', plugins: [] });
  ctx.provide('settings', { configure() {}, async update(_name, patch) { config = { ...config, ...patch }; } });
  const manager = new ExperimentalPresets(ctx, { config: () => config, store: { dir: join(dir, 'omd') } });
  ctx.effect(() => () => manager.close());
  await ctx.agentPresets.register({ ...manager.definition, id: 'unharnessed', plugins: manager.definition.plugins.map(row =>
    row.id === 'unharnessed' ? { ...row, name: new URL('../vendor/unharnessed/index.js', import.meta.url).href, config: { stateDirectory: join(dir, 'standalone') } } : row) });
  assert.equal((await ctx.agentPresets.resolve('unharnessed')).broken, undefined,
    ctx.logger.buffer.filter(row => row.type === 'error' || row.type === 'warn').map(row => row.args.map(value => value?.stack ?? String(value)).join(' ')).join('\n'));
  await manager.start(); assert.ok(!(await ctx.agentPresets.list()).some(p => p.id === PRESET));
  await manager.update({ [SETTING]: true });
  assert.equal((await ctx.agentPresets.resolve(PRESET)).broken, undefined);
  const handle = await ctx.agents.create({ sessionId: SessionId('unharnessed-' + randomUUID()), meta: { cwd: dir, agentPreset: PRESET },
    setup: async scope => { await ctx.agentPresets.mount(scope, PRESET); } });
  const agent = handle.agent ?? handle;
  agent.followup = message => agent.inbox.append('next-turn', message);
  assert.deepEqual(ctx.tools.schemas(agent).map(tool => tool.name), ['ipython']);
  const cell = async code => (await ctx.tools.execute({ agent, signal: new AbortController().signal,
    calls: [{ type: 'tool-call', id: randomUUID(), name: 'ipython', arguments: JSON.stringify({ code }) }] })).results[0].result;
  assert.match((await cell('x = 41\nx + 1')).value, /42/);
  assert.match((await cell('await asyncio.sleep(0)\nx + 1')).value, /42/);
  assert.equal((await cell("job = bash('sleep 1; printf ready')")).isError, false);
  await assert.rejects(manager.update({ [SETTING]: false }), /后台命令/);
  assert.match((await cell('(await job).output')).value, /ready/);
  await manager.update({ [SETTING]: false });
  assert.ok((await ctx.agentPresets.list()).some(p => p.id === 'unharnessed'), 'standalone preset remains registered');
  await assert.rejects(agent.dispatch.waterfall('agent/request', { turn: 1, step: 1, signal: new AbortController().signal }, async () => ({})), /开启 Unharnessed/);
  assert.equal((await cell('x')).isError, true);
  await manager.update({ [SETTING]: true });
  assert.match((await cell('x + 1')).value, /42/);
  assert.ok(ctx.agentPresets.serviceFor(agent, 'omdUnharnessedRuntime'));
  assert.equal(ctx.get('omdUnharnessedRuntime'), undefined, 'activity service remains in its preset realm');
});
