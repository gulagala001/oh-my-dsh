import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Context } from '@deepseek-ai/cordis';

const require = createRequire(import.meta.url);
const host = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
const { composeEntries, loadOptionalPatches } = await import(host.resolve('@deepseek-ai/dsh-app-boot'));
const { default: Permission } = await import(host.resolve('@deepseek-ai/dsh-permission-presets'));
const base = loadOptionalPatches('test', host.resolve('@deepseek-ai/dsh-base/cordis.patch.yml'));
const bundle = loadOptionalPatches('test', fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)));

const { interpolate } = await import(host.resolve('@deepseek-ai/cordis-plugin-loader'));

for (const [title, envMode, profile, expected] of [
  ['workspace override', undefined, [{ id: 'sandbox-policy', config: { mode: 'workspace-write' } }], 'workspace-write'],
  ['read-only environment', 'read-only', [], 'read-only'],
  ['explicit full access', 'danger-full-access', [], 'danger-full-access'],
  ['custom profile', undefined, [
    { id: 'approval', config: { policy: 'never' } },
    { id: 'permission', config: { presets: { restricted: { sandbox: 'workspace-write', approval: 'never' } }, defaultPreset: 'restricted' } },
  ], 'restricted'],
]) test(`OMD preserves permission selection for ${title}`, async t => {
  const entries = composeEntries([base, bundle, profile]);
  const scope = { process: { env: { DSH_PERMISSION_MODE: envMode }, cwd: () => '/workspace' } };
  const config = id => interpolate(scope, entries.find(row => row.id === id).config);
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  ctx.provide('shell', { sandboxMode: config('sandbox-policy').mode });
  ctx.provide('approval', { config: config('approval') });
  ctx.provide('sessions', { list: () => [] });
  ctx.provide('sessionProjections', { register() {} });
  let command;
  ctx.provide('commands', { register(definition) { command = definition; } });
  await ctx.plugin(Permission, config('permission'));
  const catalog = ctx.permissionPresets.catalog();
  assert.equal(command.name, 'permission');
  assert.equal(catalog.defaultPreset, expected);
  assert.ok(catalog.options.some(option => option.value === expected));
  const spec = ctx.permissionPresets.resolve(expected);
  assert.equal(spec.sandbox, ctx.shell.sandboxMode);
  assert.equal(spec.approval, ctx.approval.config.policy);
});
