import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

async function openMemory(page) {
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await page.locator('.cx-navigation').getByRole('button', { name: '记忆', exact: true }).click();
  return page.locator('.cx-dream');
}

test('Dream settings save only edits and retain changes made while saving', { timeout: 60000 }, async t => {
  let release;
  t.after(() => release?.());
  const { page, errors } = await frontendFixture(t, {});
  const panel = await openMemory(page);
  await panel.getByRole('button', { name: '自动整理设置', exact: true }).click();
  const interval = panel.getByRole('spinbutton', { name: '检查间隔 · 分钟', exact: true });
  await interval.waitFor();
  const endpoint = new URL('/trisoul-x/api/dream/settings', page.url()).href;
  assert.equal((await page.request.post(endpoint, { data: { dreamDailyTokens: 450000 } })).ok(), true);
  const submitted = [];
  await page.route('**/trisoul-x/api/dream/settings?*', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    submitted.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (submitted.length === 1) await new Promise(resolve => { release = resolve; });
    await route.fulfill({ response });
  });
  await interval.fill('120');
  const save = panel.getByRole('button', { name: '保存自动 Dream 设置', exact: true });
  await save.click(); await until(() => release);
  await interval.fill('180'); release();
  await panel.getByText('自动 Dream 设置已保存。', { exact: true }).waitFor();
  assert.equal(await interval.inputValue(), '180');
  assert.deepEqual(submitted, [{ dreamIntervalMs: 7200000 }]);
  assert.equal((await (await page.request.get(endpoint)).json()).dailyTokens, 450000);
  assert.equal(await save.isEnabled(), true);
  await save.click();
  await until(async () => (await (await page.request.get(endpoint)).json()).intervalMs === 10800000);
  await until(() => save.isDisabled());
  assert.equal((await (await page.request.get(endpoint)).json()).intervalMs, 10800000);
  assert.deepEqual(submitted[1], { dreamIntervalMs: 10800000 });
  assert.deepEqual(errors, []);
});

test('Dream settings can save valid fractional-minute intervals and any integer token budget', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t, { omdConfig: { dreamIntervalMs: 90000, dreamDeepAgeMs: 60000, dreamDailyTokens: 1250 } });
  const panel = await openMemory(page);
  await panel.getByRole('button', { name: '自动整理设置', exact: true }).click();
  const interval = panel.getByRole('spinbutton', { name: '检查间隔 · 分钟', exact: true });
  await interval.waitFor();
  assert.equal(await panel.locator('form').evaluate(form => form.reportValidity()), true, 'the minimum wait remains a valid field value');
  await interval.fill('');
  assert.equal(await interval.inputValue(), '', 'editing a number must allow an empty intermediate draft');
  await interval.pressSequentially('1.5');
  assert.equal(await interval.inputValue(), '1.5', 'decimal typing must not lose the decimal point');
  const budget = panel.getByRole('spinbutton', { name: '每日 Dream token 上限', exact: true });
  await budget.fill(''); await budget.pressSequentially('1501');
  const wait = panel.getByRole('spinbutton', { name: '原文整理等待 · 天', exact: true });
  await wait.fill(''); await wait.pressSequentially('0.333333');
  assert.equal(await panel.locator('form').evaluate(form => form.reportValidity()), true, 'valid saved values must not block unrelated edits');
  await panel.getByRole('button', { name: '保存自动 Dream 设置', exact: true }).click();
  await panel.getByText('自动 Dream 设置已保存。', { exact: true }).waitFor();
  const settings = await (await page.request.get(new URL('/trisoul-x/api/dream/settings', page.url()).href)).json();
  assert.equal(settings.dailyTokens, 1501); assert.equal(settings.intervalMs, 90000);
  assert.equal(settings.deepAgeMs, 28799971);
  assert.equal(await panel.getByRole('spinbutton', { name: '原文整理等待 · 天', exact: true }).inputValue(), '0.333333', 'saving should not display floating-point noise');
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1060, height: 900 });
    assert.equal(await panel.evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
    if (process.env.TRISOUL_UI_ARTIFACTS) {
      await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
      await panel.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, `dream-settings-${colorScheme}.png`) });
    }
  }
  assert.deepEqual(errors, []);
});

test('Dream exposes the running job ahead of newer queued jobs and recovers each original target', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t, {});
  const jobs = [
    { id: 'queued-project', scope: 'project', target: '/projects/排队项目', state: 'queued', done: 0, total: 2 },
    { id: 'failed-other-project', scope: 'project', target: '/other/project', state: 'failed', error: '模型暂时不可用', done: 2, total: 3 },
    { id: 'running-project', scope: 'project', target: '/projects/正在整理的项目', state: 'running', done: 1, total: 4 },
  ];
  await page.route(/\/trisoul-x\/api\/dream\?/, async route => {
    const response = await route.fetch(), data = await response.json();
    await route.fulfill({ json: { ...data, jobs } });
  });
  const requests = [];
  await page.route('**/trisoul-x/api/dream/job?*', route => {
    const request = route.request().postDataJSON(); requests.push(request);
    const job = jobs.find(job => job.id === request.id);
    job.state = request.action === 'stop' ? 'paused' : 'queued';
    return route.fulfill({ json: { id: job.id, state: job.state } });
  });
  const panel = await openMemory(page);
  const primary = panel.locator('.cx-dream-job').first();
  await primary.waitFor();
  assert.match(await primary.innerText(), /整理中/);
  assert.match(await primary.innerText(), /\/projects\/正在整理的项目/);
  await panel.getByText('其他作业（2）', { exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1060, height: 900 });
  assert.equal(await panel.evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
    await panel.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, 'dream-job-targets-dark.png') });
  }
  await primary.getByRole('button', { name: '停止', exact: true }).click();
  await until(() => requests.length === 1);
  assert.deepEqual(requests[0], { id: 'running-project', action: 'stop' });
  const failed = panel.locator('.cx-dream-job').filter({ hasText: '/other/project' });
  await failed.getByRole('button', { name: '重试', exact: true }).click();
  await until(() => requests.length === 2);
  assert.deepEqual(requests[1], { id: 'failed-other-project', action: 'resume' });
  await panel.locator('.cx-dream-job').filter({ hasText: '/projects/排队项目' }).getByRole('button', { name: '停止', exact: true }).click();
  await until(() => requests.length === 3);
  assert.deepEqual(requests[2], { id: 'queued-project', action: 'stop' });
  assert.deepEqual(errors, []);
});
