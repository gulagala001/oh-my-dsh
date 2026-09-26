import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('published intent assistant installs only on request, stays off and uninstalls cleanly', {
  timeout: 180000, skip: process.env.OMD_INTENT_RELEASE_TEST !== '1' ? 'Opt-in release network verification' : false,
}, async t => {
  const f = await frontendFixture(t), { page } = f;
  const status = async () => (await page.request.get(new URL('trisoul-x/recommended-plugins', page.url()).href)).json();
  assert.equal((await status()).plugins.find(p => p.id === 'omd-intent-assistant').installed, false);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '推荐插件', exact: true }).click();
  const card = page.locator('.tx-recommended-card').filter({ has: page.getByRole('heading', { name: '需求理解 · OMD UI 增强版', exact: true }) });
  assert.match(await card.innerText(), /原作者：啃轮胎的西狐（WestFox-AwA）/);
  assert.match(await card.innerText(), /OMD 适配：gulagala001/);
  assert.equal(await card.getByRole('link', { name: '查看原作 dsh-prompt-optimizer（新窗口）' }).getAttribute('href'), 'https://github.com/WestFox-AwA/dsh-prompt-optimizer');
  await until(() => card.getByRole('button', { name: '安装', exact: true }).isEnabled());
  await card.getByRole('button', { name: '安装', exact: true }).click();
  const installed = await until(async () => {
    const state = await status(), plugin = state.plugins.find(p => p.id === 'omd-intent-assistant');
    if (plugin.error) throw Error(plugin.error);
    return !state.busy && plugin.installed && plugin.version && plugin;
  }, 120000);
  assert.equal(installed.version, '0.1.0');
  const profile = join(f.home, 'profiles', 'trisoul-x');
  const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'));
  const spec = manifest.dependencies['omd-prompt-optimizer'];
  assert.ok(spec.startsWith('file:'), 'native manager installs the verified local archive');
  const archive = resolve(profile, spec.slice(5));
  assert.ok((await readFile(archive)).length > 0, 'archive survives installation for later reinstalls');
  const lock = parse(await readFile(join(profile, 'pnpm-lock.yaml'), 'utf8'));
  const entry = Object.entries(lock.packages).find(([key]) => key.startsWith('omd-prompt-optimizer@'))?.[1];
  assert.match(entry?.resolution.integrity || '', /^sha512-/, 'pnpm records the archive integrity');
  // pnpm 11.4 loses remote tarball integrity on the second add. Exercise that
  // same transition with our retained file: archive, then verify the lockfile.
  for (const args of [['add', spec, '--ignore-scripts'], ['install', '--frozen-lockfile', '--ignore-scripts']]) {
    await promisify(execFile)(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args,
      { cwd: profile, env: { ...process.env, CI: 'true' }, shell: process.platform === 'win32', timeout: 60000 });
  }
  const config = await (await page.request.get(new URL('omd-intent/api/config', page.url()).href)).json();
  assert.equal(config.config.enabled, false); assert.equal(config.runtime.hooks, 0);
  assert.equal(await page.getByRole('button', { name: '需求理解选项', exact: true }).count(), 0);
  if (!await card.isVisible()) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '推荐插件', exact: true }).click();
  }
  await until(() => card.getByRole('button', { name: '卸载', exact: true }).isEnabled());
  await card.getByRole('button', { name: '卸载', exact: true }).click();
  await until(async () => {
    const state = await status(), plugin = state.plugins.find(p => p.id === 'omd-intent-assistant');
    if (plugin.error) throw Error(plugin.error);
    return !state.busy && !plugin.installed;
  }, 60000);
  assert.equal((await page.request.get(new URL('omd-intent/api/config', page.url()).href)).status(), 404);
  assert.deepEqual(f.errors, []);
});
