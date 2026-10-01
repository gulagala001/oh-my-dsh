import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { frontendFixture, until } from './fixtures/frontend.mjs';

const asset = process.env.OMD_OPEN_DESIGN_TGZ;
const enabled = process.env.OMD_OPEN_DESIGN_EXECUTION_TEST === '1' && asset;
test('local OpenDesign installs, routes through native skill, preserves project precedence and removes cleanly', {
  skip: !enabled && 'Third-party execution requires explicit approval and OMD_OPEN_DESIGN_EXECUTION_TEST=1 with OMD_OPEN_DESIGN_TGZ', timeout: 180000,
}, async t => {
  let activeProbe = false, called = false, toolResult;
  const original = '---\nname: saas-landing\ndescription: Existing project skill with higher precedence.\n---\nPROJECT_SKILL_PRESERVED\n';
  const f = await frontendFixture(t, { headless: true,
    setupWorkspace: async ({ workspace }) => {
      const directory = join(workspace, '.dsh/skills/saas-landing');
      await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'SKILL.md'), original);
    },
    modelReply: async payload => {
      if (!activeProbe || !payload.tools?.length) return;
      if (!called) {
        const skill = payload.tools.find(tool => /^skill$/i.test(tool.function.name));
        assert.ok(skill, JSON.stringify(payload.tools.map(tool => tool.function.name)));
        called = true;
        return { delta: { tool_calls: [{ index: 0, id: 'od-router-probe', type: 'function', function: { name: skill.function.name, arguments: JSON.stringify({ name: 'open-design' }) } }] }, finish_reason: 'tool_calls' };
      }
      toolResult = payload.messages.findLast(message => message.role === 'tool' && message.tool_call_id === 'od-router-probe');
      return { delta: { content: 'OpenDesign router loaded by local fake model.' }, finish_reason: 'stop' };
    },
  });
  const trace = { profile: join(f.home, 'profiles/trisoul-x'), model: 'local fake model', steps: [] };
  const call = async (method, args) => {
    const response = await f.call('pluginManager/' + method, args);
    assert.equal(response.result?.ok, true, JSON.stringify(response)); return response.result.value;
  };
  const skills = async () => (await f.rpc('skills/list', { sessionId: f.sessionId })).skills;
  const before = await skills();
  assert.ok(before.some(s => s.name === 'saas-landing' && s.path.includes('.dsh/skills')));
  assert.equal(before.some(s => s.name === 'open-design'), false);
  const installed = await call('installBundle', { spec: 'file:' + resolve(asset), options: { enabled: true, requestId: 'omd-od-local-approval' } });
  trace.steps.push({ operation: 'install', result: installed });
  assert.equal(installed.application, 'applied', JSON.stringify(installed));
  const manifest = join(trace.profile, 'package.json');
  const packageRoot = resolve(createRequire(manifest).resolve('dsh-open-design/package.json'), '..');
  trace.installedPackage = packageRoot;
  const inventory = JSON.parse(await readFile(join(packageRoot, 'OMD_ADAPTER.json'), 'utf8'));
  const visible = await until(async () => {
    const rows = await skills(); return rows.some(s => s.name === 'open-design') && rows;
  });
  assert.equal(inventory.skillCount, 52);
  const additions = visible.filter(s => !before.some(b => b.name === s.name));
  assert.equal(additions.length, 51, 'the existing saas-landing keeps precedence over the bundled copy');
  assert.deepEqual(additions.map(s => s.name).sort(), inventory.skills.filter(name => name !== 'saas-landing').sort());
  for (const previous of before) assert.deepEqual(visible.find(s => s.name === previous.name), previous);
  assert.equal(visible.find(s => s.name === 'open-design').path, join(packageRoot, 'skills/open-design/SKILL.md'));
  trace.steps.push({ operation: 'discover', bundled: 52, additions: additions.length, duplicateWinner: visible.find(s => s.name === 'saas-landing') });
  activeProbe = true;
  await f.rpc('session/prompt', { requestId: 'omd-od-router', sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: 'OMD_OPEN_DESIGN_ROUTER_PROBE' }] });
  await until(() => toolResult);
  await until(async () => (await f.api('/state?session=' + f.sessionId)).running === 'idle');
  assert.match(JSON.stringify(toolResult), /open-design/);
  assert.match(JSON.stringify(toolResult), /\.\.\/\.\.\/tools\/od-check\.mjs/);
  assert.match(JSON.stringify(toolResult), /OpenDesign bridge/);
  trace.steps.push({ operation: 'native-skill-router', toolResult });
  activeProbe = false;
  const checker = resolve(packageRoot, 'skills/open-design', '../../tools/od-check.mjs');
  const outputDir = join(f.workspace, 'directory with spaces'); await mkdir(outputDir);
  const htmlPath = join(outputDir, 'index.html');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { --font-display: serif; --font-body: sans-serif; --accent: #2864d7; }
    h1,h2 { font-family:var(--font-display); }
    .grid { display:grid; grid-template-columns:1fr 1fr; }
    @media (max-width:800px) { .grid { grid-template-columns:1fr; } }
    @media (prefers-reduced-motion: reduce) { body { animation:none; } }
    </style></head><body><section data-od-id="hero"><h1>Local checker test</h1></section></body></html>`;
  await writeFile(htmlPath, html);
  const checked = await promisify(execFile)(process.execPath, [checker, htmlPath], { cwd: outputDir });
  assert.match(checked.stdout, /14\/14 checks pass/);
  trace.steps.push({ operation: 'installed-checker-unrelated-cwd-with-spaces', checker, stdout: checked.stdout });
  await writeFile(htmlPath, html.replace('data-od-id="hero"', ''));
  await assert.rejects(promisify(execFile)(process.execPath, [checker, htmlPath], { cwd: outputDir }), error => error.code === 1 && /FAIL.*P0-4/.test(error.stdout));
  trace.steps.push({ operation: 'checker-negative', result: 'untagged section exits 1' });
  const disabled = await call('setBundleEnabled', { name: 'dsh-open-design', enabled: false });
  assert.equal(disabled.application, 'applied', JSON.stringify(disabled));
  await until(async () => !(await skills()).some(s => s.name === 'open-design'));
  assert.deepEqual(await skills(), before);
  trace.steps.push({ operation: 'disable', result: disabled, baselineRestored: true });
  const reenabled = await call('setBundleEnabled', { name: 'dsh-open-design', enabled: true });
  assert.equal(reenabled.application, 'applied', JSON.stringify(reenabled));
  await until(async () => (await skills()).some(s => s.name === 'open-design'));
  assert.deepEqual(await skills(), visible);
  trace.steps.push({ operation: 'enable', result: reenabled, previousCatalogRestored: true });
  const removed = await call('removeBundle', { name: 'dsh-open-design' });
  assert.equal(removed.application, 'applied', JSON.stringify(removed));
  await until(async () => !(await skills()).some(s => s.name === 'open-design'));
  assert.deepEqual(await skills(), before);
  assert.equal((await call('listBundles', {})).some(b => b.name === 'dsh-open-design'), false);
  assert.equal(await readFile(join(f.workspace, '.dsh/skills/saas-landing/SKILL.md'), 'utf8'), original);
  trace.steps.push({ operation: 'uninstall', result: removed, baselineRestored: true, existingFileUnchanged: true });
  if (process.env.OMD_OPEN_DESIGN_EVIDENCE) {
    await mkdir(process.env.OMD_OPEN_DESIGN_EVIDENCE, { recursive: true });
    await writeFile(join(process.env.OMD_OPEN_DESIGN_EVIDENCE, 'native-trace.json'), JSON.stringify(trace, null, 2) + '\n');
  }
});
