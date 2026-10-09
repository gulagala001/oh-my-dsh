import test from 'node:test';
import assert from 'node:assert/strict';
import { apply as installCodeGraph } from '../src/codegraph-agent.mjs';
import { createVerificationRunner } from '../src/tasks.mjs';

test('directory-based tools use the native current directory while retaining the original project', async () => {
  const session = { header: { cwd: '/original-project' } };
  const agent = { session };
  const registered = new Map(), indexed = [], executed = [];
  const ctx = {
    get: name => name === 'workingDirectory' ? { get: target => { assert.equal(target, session); return '/current-checkout'; } } : undefined,
    trisoulX: { codegraph: {
      status: () => ({ installed: false }),
      index: async (_args, options) => { indexed.push(options.cwd); return 'indexed'; },
    } },
    tools: {
      register: tool => registered.set(tool.name, tool),
      execute: async request => {
        executed.push(request.arguments.workdir);
        return { isError: false, value: { kind: 'foreground', exitCode: 0, stdout: { text: 'checked' }, stderr: { text: '' } } };
      },
    },
    systemPrompt: { section() {} }, on() {}, effect() {},
  };
  await installCodeGraph(ctx);
  await registered.get('codegraph_index').execute({}, { agent, signal: new AbortController().signal });
  const result = await createVerificationRunner(ctx, { agent, signal: new AbortController().signal, callId: 'verification' })('pwd', 1000);
  assert.deepEqual(indexed, ['/current-checkout']);
  assert.deepEqual(executed, ['/current-checkout']);
  assert.equal(result.execution.workdir, '/current-checkout');
  assert.equal(session.header.cwd, '/original-project');
});
