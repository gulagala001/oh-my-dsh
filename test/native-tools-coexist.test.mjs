import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('the installed bundle keeps the native global tool service and third-party tools in native and PTC sessions', { timeout: 180000 }, async t => {
  const requests = [];
  const f = await frontendFixture(t, {
    headless: true, installedPackage: true, omdConfig: { contextEnabled: false, codegraphEnabled: false },
    async setupWorkspace({ root, home }) {
      const cli = process.env.OMD_DSH_CLI || fileURLToPath(new URL('../node_modules/@deepseek-ai/dsh/lib/bin.js', import.meta.url));
      execFileSync(process.execPath, [cli, '--profile', 'trisoul-x', '--from-default-profile', 'web', '--dump-config'], {
        env: { ...process.env, DSH_HOME: home }, encoding: 'utf8', stdio: 'pipe', timeout: 60000,
      });
      const directory = join(home, 'profiles', 'trisoul-x');
      const module = join(root, 'third-party-tools.mjs');
      await writeFile(module, `export const inject = ['loader', 'tools'];
export async function apply(ctx) {
  const entry = [...ctx.loader.entries()].find(row => row.options.name === '@deepseek-ai/dsh-tools');
  const native = await entry.parent.tree.import('@deepseek-ai/dsh-tools');
  const { symbols } = await entry.parent.tree.import('@deepseek-ai/cordis');
  await (await import('node:fs/promises')).writeFile(${JSON.stringify(join(root, 'toolkit-identity.txt'))}, String((ctx.tools[symbols.original] || ctx.tools) instanceof native.ToolRuntime));
  ctx.tools.register({ name: 'coexist_probe', description: 'Independent plugin side effect probe.',
    parameters: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute({ file }) { const fs = await import('node:fs/promises'); await fs.appendFile(file, 'once\\n'); return 'THIRD_PARTY_PROBE_DONE'; },
  });
}`);
      await writeFile(join(directory, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'third-party-tools', name: pathToFileURL(module).href }] }]));
    },
    modelReply(payload) { if (payload.tools?.length) requests.push(payload); },
  });
  assert.equal(await readFile(join(f.root, 'toolkit-identity.txt'), 'utf8'), 'true', 'OMD leaves the original host ToolRuntime available to installed plugins');
  for (const agentPreset of ['standard', 'trisoul-x', 'omd-ptc']) {
    const { sessionId } = await f.rpc('session/create', { cwd: f.workspace, agentPreset });
    if (agentPreset !== 'standard') await f.api('/better-todo?session=' + sessionId, { todo: false });
    const file = join(f.workspace, agentPreset + '.txt'); let phase = 0;
    f.replyWith(payload => {
      if (!JSON.stringify(payload.messages).includes('COEXIST_' + agentPreset)) return;
      requests.push(payload);
      if (phase++) return { delta: { role: 'assistant', content: 'Independent plugin executed.' }, finish_reason: 'stop' };
      const name = agentPreset === 'omd-ptc' ? 'run_code' : 'coexist_probe';
      const args = name === 'run_code' ? { code: `return await tools.coexist_probe(${JSON.stringify({ file })})`, description: 'Call the installed third-party tool' } : { file };
      return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: crypto.randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' };
    });
    await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'COEXIST_' + agentPreset }] });
    await until(async () => phase > 1 && (await f.api('/state?session=' + sessionId)).running === 'idle');
    assert.equal(await readFile(file, 'utf8'), 'once\n', 'the original plugin executes exactly once through the native pipeline');
    const request = requests.find(payload => JSON.stringify(payload.messages).includes('COEXIST_' + agentPreset));
    assert.ok(request, agentPreset);
    if (agentPreset === 'omd-ptc') {
      assert.deepEqual(request.tools.map(tool => tool.function.name).sort(), ['job_kill', 'job_list', 'job_output', 'run_code', 'runtime_status']);
      assert.match(JSON.stringify(request.messages), /coexist_probe/, 'the complete PTC SDK includes third-party tools');
    } else assert.ok(request.tools.some(tool => tool.function.name === 'coexist_probe'));
  }
});
