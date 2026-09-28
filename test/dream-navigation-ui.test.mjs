import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

async function setup(t) {
  const f = await frontendFixture(t), { page } = f;
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.route('**/trisoul-x/api/dream/catalog?*', route => {
    const q = new URL(route.request().url()).searchParams;
    if (q.get('kind') === 'project') return route.fulfill({ json: {
      entries: q.get('cursor') === 'projects-2' ? [{ id: '/projects/夏季发布', memory: { summary: '准备新版的界面、安装包和帮助文档。' } }] : Array.from({ length: 14 }, (_, i) => ({ id: '/projects/检查项目' + i, memory: { summary: '整理设计资料、安装说明和交付清单。' } })),
      nextCursor: q.get('cursor') ? null : 'projects-2', revision: 1 } });
    return route.fulfill({ json: { entries: [{ id: 'release-session', title: '确认新版交付清单', project: '/projects/夏季发布', shared: true, memory: { summary: '核对交付内容和验收范围。' } }], revision: 1 } });
  });
  await page.route('**/trisoul-x/api/dream/read?*', route => route.fulfill({ json: { kind: 'archive_catalog', entries: [{ id: 'release-record', summary: '交付清单保留来源与实际验证结果。', documents: 1, assets: 0 }], nextCursor: null } }));
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await page.locator('.cx-navigation').getByRole('button', { name: '记忆', exact: true }).click();
  const panel = page.locator('.cx-dream');
  await panel.getByRole('textbox', { name: '搜索记忆目录', exact: true }).waitFor();
  return { ...f, panel };
}

async function capture(page, name) {
  if (!process.env.TRISOUL_UI_ARTIFACTS) return;
  await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
  await page.locator('.tx-workbench').screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, name + '.png') });
}

test('memory directory preserves search, pagination and focus when returning from a project', { timeout: 60000 }, async t => {
  const { page, panel, errors } = await setup(t);
  const search = panel.getByRole('textbox', { name: '搜索记忆目录', exact: true });
  await search.fill('发布');
  const next = panel.getByRole('button', { name: '下一页', exact: true });
  await next.click();
  const project = panel.locator('.cx-dream-entry').filter({ hasText: '夏季发布' });
  await project.waitFor(); await project.scrollIntoViewIfNeeded();
  const body = panel.locator(':scope > .cx-body'), top = await body.evaluate(el => el.scrollTop);
  await project.click();
  await panel.locator('.cx-dream-entry').filter({ hasText: '确认新版交付清单' }).waitFor();
  await panel.getByRole('navigation', { name: '记忆层级', exact: true }).getByRole('button', { name: '全局', exact: true }).click();
  await capture(page, 'return-to-projects');
  assert.equal(await search.inputValue(), '发布', 'return preserves the parent search');
  await project.waitFor();
  assert.equal(await panel.getByRole('button', { name: '第一页', exact: true }).count(), 1, 'return preserves the parent page');
  assert.equal(await project.evaluate(el => el === document.activeElement), true, 'return restores the originating directory entry');
  assert.ok(Math.abs(await body.evaluate(el => el.scrollTop) - top) < 2);
  assert.deepEqual(errors, []);
});

test('memory breadcrumbs follow the selected project and current-session shortcut uses its actual project', { timeout: 60000 }, async t => {
  const { page, panel, sessionId, errors } = await setup(t);
  const status = await (await page.request.get(new URL('/trisoul-x/api/dream?session=' + sessionId, page.url()).href)).json();
  await panel.getByRole('button', { name: '下一页', exact: true }).click();
  await panel.locator('.cx-dream-entry').filter({ hasText: '夏季发布' }).click();
  const trail = panel.getByRole('navigation', { name: '记忆层级', exact: true });
  await panel.locator('.cx-dream-entry').filter({ hasText: '确认新版交付清单' }).waitFor();
  assert.equal(await trail.getByRole('button', { name: '会话资料', exact: true }).count(), 0, 'unrelated current conversation is not presented as a child of the selected project');
  await panel.locator('.cx-dream-entry').filter({ hasText: '确认新版交付清单' }).click();
  await panel.locator('.cx-dream-entry').filter({ hasText: '交付清单保留来源' }).waitFor();
  assert.match(await trail.innerText(), /夏季发布/);
  assert.match(await trail.innerText(), /确认新版交付清单/);
  await panel.getByRole('button', { name: '当前会话', exact: true }).click();
  await until(async () => (await panel.getByRole('button', { name: '整理会话', exact: true }).getAttribute('title')) === sessionId);
  assert.equal(await panel.getByRole('button', { name: '整理项目', exact: true }).getAttribute('title'), status.session.project);
  assert.doesNotMatch(await trail.innerText(), /夏季发布|确认新版交付清单/);
  await capture(page, 'current-session');
  const longTitle = '很长的会话标题用于检查窄栏阅读体验'.repeat(8);
  const rename = page.waitForResponse(r => r.url().includes('/trisoul-x/api/dream?') && r.ok());
  await page.route(/\/trisoul-x\/api\/dream\?/, async route => { const response = await route.fetch(), data = await response.json(); await route.fulfill({ json: { ...data, session: { ...data.session, title: longTitle } } }); });
  await rename;
  const handle = await page.locator('[data-side="rightbar"]').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, 240); await page.mouse.down();
  await page.mouse.move(780, 240, { steps: 8 }); await page.mouse.up();
  await until(async () => Math.abs((await panel.boundingBox()).width - 320) < 2);
  await until(async () => (await trail.locator('[aria-current=page]').getAttribute('title')) === longTitle);
  assert.ok((await trail.boundingBox()).height < 110, 'long titles do not push the directory out of the viewport');
  assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await capture(page, 'current-session-narrow');
  assert.deepEqual(errors, []);
});

test('a delayed directory page does not crash or steal focus from automatic settings', { timeout: 60000 }, async t => {
  const { page, panel, errors } = await setup(t);
  let pending;
  await page.route('**/trisoul-x/api/dream/catalog?*', route => {
    if (new URL(route.request().url()).searchParams.get('cursor') === 'projects-2') { pending = route; return; }
    return route.fallback();
  });
  await panel.getByRole('button', { name: '下一页', exact: true }).click();
  await until(() => pending);
  await panel.getByRole('button', { name: '自动整理设置', exact: true }).click();
  const input = panel.getByRole('spinbutton', { name: '检查间隔 · 分钟', exact: true });
  await input.fill('120');
  await pending.fulfill({ json: { entries: [{ id: '/projects/迟到的目录', memory: { summary: '设置输入需要保留。' } }], nextCursor: null, revision: 1 } });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await input.inputValue(), '120');
  assert.equal(await input.evaluate(el => el === document.activeElement), true);
  assert.deepEqual(errors, []);
  await panel.getByRole('button', { name: '自动整理设置', exact: true }).click();
  await panel.locator('.cx-dream-entry').filter({ hasText: '迟到的目录' }).waitFor();
  assert.deepEqual(errors, []);
});

test('returning to a changed directory keeps the search and replaces its expired page', { timeout: 60000 }, async t => {
  const { page, panel, errors } = await setup(t);
  let revision = 1, observed = 0;
  await page.route(/\/trisoul-x\/api\/dream\?/, async route => {
    const response = await route.fetch(), data = await response.json(); observed = revision;
    await route.fulfill({ json: { ...data, catalogRevision: revision } });
  });
  await until(() => observed === 1);
  const search = panel.getByRole('textbox', { name: '搜索记忆目录', exact: true });
  await search.fill('发布');
  await panel.getByRole('button', { name: '下一页', exact: true }).click();
  await panel.locator('.cx-dream-entry').filter({ hasText: '夏季发布' }).click();
  await panel.locator('.cx-dream-entry').filter({ hasText: '确认新版交付清单' }).waitFor();
  revision = 2; await until(() => observed === 2);
  await panel.getByRole('navigation', { name: '记忆层级', exact: true }).getByRole('button', { name: '全局', exact: true }).click();
  await panel.getByText('目录已更新，已返回第一页。', { exact: true }).waitFor();
  assert.equal(await search.inputValue(), '发布');
  await panel.locator('.cx-dream-entry').filter({ hasText: '检查项目0' }).waitFor();
  assert.equal(await panel.getByRole('button', { name: '第一页', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
});
