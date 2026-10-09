import { Context } from '@deepseek-ai/cordis';
import { Session } from '@deepseek-ai/dsh-session';
import { createScope } from '@deepseek-ai/dsh-scope';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTodoStore } from '../../src/todolist.mjs';
import { registerTasks } from '../../src/tasks.mjs';
import { createModule as bashModule } from '../../lib/host/tool-bash.factory.mjs';
import { createModule as pwshModule } from '../../lib/host/tool-pwsh.factory.mjs';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { installToolCancellationPresentation } from '../../src/tool-cancellation.mjs';

const hostRequire = createRequire(realpathSync(new URL('../../node_modules/@deepseek-ai/dsh/package.json', import.meta.url)));
const load = name => import(pathToFileURL(hostRequire.resolve(name)).href);
const shellName = process.platform === 'win32' ? 'pwsh' : 'bash';
const [{ default: Subprocess }, { default: SandboxShell }, { SandboxPolicyService }] = await Promise.all([
  load('@deepseek-ai/dsh-subprocess-local'), load('@deepseek-ai/dsh-' + shellName + '-sandbox'), load('@deepseek-ai/dsh-sandbox-policy'),
]);
const imports = new Map(await Promise.all([
  '@deepseek-ai/cordis', '@deepseek-ai/schemastery', 'node:path', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-sandbox', '@deepseek-ai/dsh-shell',
  '@deepseek-ai/dsh-scope', '@deepseek-ai/dsh-util-values', '@deepseek-ai/dsh-brand',
].map(async name => [name, await import(name)])));
const dependency = name => name === '@deepseek-ai/schemastery' ? imports.get(name).default : { ...imports.get(name), __esModule: true };
const shellTool = (shellName === 'pwsh' ? pwshModule : bashModule)(dependency);
const fixed = value => ({ get: () => value });

// Real ToolRuntime, sandbox-policy resolution, shipped shell tool/executor and
// local subprocess lifecycle. Only prompt rendering/projection plumbing is
// minimal. Restricted tests supply a rejecting provider and explicitly test
// policy routing; they do not claim OS sandbox coverage.
export function verificationFixture(t, { runTimeoutMs, maxTimeoutMs = 600000, mode = 'danger-full-access', confine, toolMode = 'native' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'omd-verification-native-'));
  const ctx = new Context(), units = new Map(), dispatches = [], confinements = [];
  let toolProvider;
  ctx.provide('systemPrompt', { tools(provider) { toolProvider = provider; }, section() {}, context() {}, getSectionOrder() { return 0; }, getContextOrder() { return 0; } });
  ctx.provide('sessionProjections', {
    register(unit) { units.set(unit.key, unit); return () => units.delete(unit.key); },
    stateOf(session, key) { const unit = units.get(key); return session.snapshotEvents().reduce((value, event) => unit.apply(value, event), unit.init()); },
  });
  new ToolRuntime(ctx, { mode: toolMode });
  installToolCancellationPresentation(ctx);
  const policy = new SandboxPolicyService(ctx, { mode, workspaceRoot: dir });
  ctx.provide('sandbox', { async confine(argv, resolved, signal) {
    confinements.push({ argv, policy: resolved });
    if (!confine) throw Error('This fixture has no OS sandbox provider; confined execution is not permitted.');
    return confine(argv, resolved, signal);
  } });
  new Subprocess(ctx);
  new SandboxShell(ctx, Object.fromEntries(Object.entries({ cwd: dir, timeoutMs: 300000, maxTimeoutMs,
    maxOutputBytes: 64000, maxSpillBytes: 1024 * 1024, graceMs: 100, pwshPath: undefined }).map(([key, value]) => [key, fixed(value)])));
  ctx.provide('shellEnv', { collect: () => ({}) });
  shellTool.apply(ctx, { enableRunInBackground: false, promoteOnTimeout: false });
  ctx.on('tools/pre-execute', (exec, next) => { dispatches.push(exec); return next(); }, { global: true });
  const store = registerTasks(ctx, createTodoStore({ ...(runTimeoutMs === undefined ? {} : { runTimeoutMs }) }));
  const session = Session.create('ledger', undefined, { id: 'ledger', version: 4, createdAt: 1, cwd: dir, isSeeded: false });
  session.append('turn/start', { turn: 1 });
  const agent = { id: session.id, session, ctx };
  const scope = createScope(ctx, agent); agent.ctx = scope.ctx;
  let serial = 0;
  const invoke = (name, args, signal = new AbortController().signal, overrides = {}) => ctx.tools.execute({
    name, arguments: args, agent, signal, callId: 'verification-' + (++serial), ...overrides,
  });
  const value = async (name, args, signal) => {
    const result = await invoke(name, args, signal);
    if (result.isError) throw Object.assign(new Error(result.error?.message || result.content.map(block => block.text || '').join('\n')), { info: result.error?.info });
    return result.value;
  };
  const user = text => session.append('user/message', createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  t.after(async () => { await ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }); });
  return { ctx, dir, session, agent, store, policy, units, dispatches, confinements, invoke, user, shellName,
    refreshTools: () => toolProvider({ scope: agent }),
    tool: ctx.tools.get('todo_write'), verification: ctx.tools.get('verify_link'), projection: units.get('todos'),
    call: (args, signal) => value('todo_write', args, signal), verify: (args, signal) => value('verify_link', args, signal) };
}
