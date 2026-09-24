import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('terminal skin covers the real shell, fonts, all settings, navigation and recovery', { timeout: 180000 }, async t => {
  // Use the packed plugin so another design session rebuilding lib/client.js
  // cannot reload this browser halfway through a settings interaction.
  const f = await frontendFixture(t, { installedPackage: true }), { page } = f;
  const artifacts = new URL('../data/claude-cli-terminal-qa/', import.meta.url);
  const shot = async name => {
    if (!process.env.TRISOUL_UI_ARTIFACTS) return;
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: fileURLToPath(new URL(name + '.png', artifacts)), animations: 'disabled' });
  };
  const nav = page.locator('.VOzbGW_nav'), dialog = page.getByRole('dialog');
  const open = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await nav.getByRole('button', { name: '外观', exact: true }).click();
  };
  const hit = el => el.evaluate(node => {
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  const style = (el, name) => el.evaluate((node, key) => getComputedStyle(node)[key], name);
  await open();
  await page.getByLabel('皮肤', { exact: true }).selectOption('claude-cli-terminal');
  await until(async () => await page.locator('html').getAttribute('data-omd-layout') === 'claude-cli-terminal');
  const font = await page.evaluate(async () => {
    await document.fonts.load('13px "OMD Terminal Mono"');
    await document.fonts.load('600 13px "OMD Terminal Mono"');
    const c = document.createElement('canvas').getContext('2d'); c.font = '13px "OMD Terminal Mono"';
    return { faces: [...document.fonts].filter(f => f.family.includes('OMD Terminal Mono')).map(f => f.status), widths: ['iiii', 'WWWW', '1234'].map(s => c.measureText(s).width) };
  });
  assert.deepEqual(font.faces, ['loaded', 'loaded']);
  assert.ok(font.widths.every(w => Math.abs(w - font.widths[0]) < .1), 'embedded Latin font is monospaced');
  for (const el of [page.locator('body'), page.locator('[data-composer-input]'), page.getByLabel('皮肤', { exact: true }), nav.getByRole('button', { name: '通用设置', exact: true })]) {
    assert.match(await style(el, 'fontFamily'), /OMD Terminal Mono/);
  }
  const pages = ['通用设置', '模型', '内置插件', '外观', 'Oh My DSH', '推荐插件', 'Agent 预设'];
  for (const mode of ['dark', 'light']) {
    await nav.getByRole('button', { name: '外观', exact: true }).click();
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const name of pages) {
        await nav.getByRole('button', { name, exact: true }).click();
        const r = await dialog.evaluate(node => {
          const box = node.getBoundingClientRect(), content = node.querySelector('.VOzbGW_options');
          return { x: box.x, right: box.right, width: content.clientWidth, scroll: content.scrollWidth };
        });
        assert.ok(r.x >= 0 && r.right <= width + 1, mode + '/' + name + ' fits viewport');
        assert.ok(r.width >= 270, name + ' readable content: ' + JSON.stringify(r));
        assert.ok(r.scroll <= r.width + 2, name + ' does not overflow: ' + JSON.stringify(r));
        if (name === 'Oh My DSH') for (const sub of ['常用', '基础组件', '模型与身份', '实验性功能', '高级', '全局背景']) {
          await page.locator('.cx-tabs').getByRole('button', { name: sub, exact: true }).click();
          assert.equal(await page.locator('.cx-panel.cx-settings').isVisible(), true);
          await shot(`${mode}-${width}-omd-${sub}`);
        }
        await shot(`${mode}-${width}-settings-${name}`);
      }
      await page.keyboard.press('Escape');
      await until(async () => await hit(page.locator('[data-composer-input]')));
      assert.equal(await style(page.locator('[data-composer-card]'), 'borderRadius'), '0px');
      const user = await page.locator('.Sixlwa_bubble').first().boundingBox();
      const column = await page.locator('.EvIC1a_column').first().boundingBox();
      assert.ok(user && column && user.x - column.x < 30, 'user messages start at the transcript left edge');
      assert.ok(user.width > column.width * .9, 'user messages use terminal rows');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await shot(`${mode}-${width}-chat`);
      await page.getByRole('button', { name: 'BT · Better Todo', exact: true }).click();
      await page.getByRole('menu').waitFor();
      await shot(`${mode}-${width}-menu`); await page.keyboard.press('Escape');
      if (width === 1440) {
        await page.getByRole('button', { name: '打开工作台', exact: true }).click();
        await until(async () => { const box = await page.locator('.tx-workbench').boundingBox(); return box?.width > 300 && box.x + box.width <= 1441; });
        await shot(`${mode}-workbench`);
        await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
      } else {
        await page.locator('.hHd-Xa_toggle').click();
        await until(async () => await hit(page.locator('.YDXeBa_sessionRow').first()));
        await shot(`${mode}-mobile-sidebar`);
        await page.locator('.YDXeBa_sessionRow').first().click();
        await page.locator('[data-sidebar-collapsed=true]').waitFor();
        await until(async () => await hit(page.locator('[data-composer-input]')));
      }
      await open();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.getByLabel('明暗模式', { exact: true }).selectOption('dark');
  await nav.getByRole('button', { name: 'Oh My DSH', exact: true }).click();
  await page.locator('.cx-tabs').getByRole('button', { name: '全局背景', exact: true }).click();
  await page.getByLabel('全局固定背景', { exact: true }).fill('终端皮肤测试配置，仅保存在隔离实例。');
  const save = page.getByRole('button', { name: '保存全局背景', exact: true });
  await until(async () => await save.isEnabled() && await style(save, 'backgroundColor') === 'rgb(224, 155, 121)');
  await save.click();
  await page.getByText('全局背景已保存', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  // Real tools through the host loop, using the fixture provider and workspace.
  let step = 0;
  f.replyWith(() => ++step === 1
    ? { delta: { role: 'assistant', content: '检查终端排版和工具输出。', tool_calls: [{ index: 0, id: 'terminal-font-check', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command: 'printf "terminal-ready\\n"', description: '检查终端输出' }) } }] }, finish_reason: 'tool_calls' }
    : { delta: { role: 'assistant', content: '终端样式检查完成。\n\n```js\nconst ready = true;\nconsole.log("中文 · 0123456789 · => !=");\n```\n\n| 检查 | 状态 |\n| --- | --- |\n| 字体与代码 | 已显示 |' }, finish_reason: 'stop' });
  await page.locator('[data-composer-input]').fill('测试中文输入、工具记录和代码块');
  await page.locator('.uV2eYG_primary').click();
  await page.getByText('终端样式检查完成。', { exact: true }).waitFor();
  const processToggle = page.locator('[data-turn-process-tool-calls="1"]');
  await processToggle.click();
  assert.equal(await processToggle.getAttribute('aria-expanded'), 'true');
  assert.match(await style(page.locator('pre').last(), 'fontFamily'), /OMD Terminal Mono/);
  assert.equal(await style(page.locator('pre code').last(), 'fontVariantLigatures'), 'none');
  await shot('dark-tools-and-code');
  const release = f.holdNextReply();
  try {
    await page.locator('[data-composer-input]').fill('检查运行时停止'); await page.locator('.uV2eYG_primary').click();
    await page.locator('.tx-composer-dock[data-omd-running]').waitFor();
    assert.equal(await hit(page.locator('.uV2eYG_primary')), true);
    await page.locator('.uV2eYG_primary').click();
    await page.locator('.tx-composer-dock[data-omd-running]').waitFor({ state: 'hidden' });
  } finally { release(); }
  await page.locator('.hHd-Xa_newSession').click();
  await page.locator('.omd-cli-welcome').waitFor(); await shot('dark-welcome');
  await open();
  const skin = JSON.parse(await readFile(new URL('../src/client/skins/bundled/claude-cli-terminal.json', import.meta.url), 'utf8'));
  await page.getByLabel('导入皮肤', { exact: true }).setInputFiles({ name: 'terminal.omd-skin.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(skin)) });
  await page.getByRole('button', { name: '移除当前皮肤', exact: true }).waitFor();
  await page.reload(); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-omd-layout'), 'claude-cli-terminal');
  // rc.2 resolves empty-Hero onboarding after mounting the shell. Wait for
  // restored conversation data before testing the settings controls.
  await page.getByText('整理工作台和对话界面', { exact: true }).first().click();
  await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  await open();
  await page.getByLabel('明暗模式', { exact: true }).selectOption('system');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await until(async () => await page.locator('html').getAttribute('data-appearance') === 'light');
  await page.getByRole('button', { name: '移除当前皮肤', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-omd-layout'), null);
  await page.getByLabel('皮肤', { exact: true }).selectOption('claude-cli-terminal');
  await page.getByLabel('皮肤', { exact: true }).selectOption('codex-desktop');
  assert.equal(await page.locator('html').getAttribute('data-omd-layout'), 'codex-desktop');
  assert.equal(await page.locator('.omd-cli-mark').count(), 0);
  await page.getByRole('button', { name: '恢复默认皮肤', exact: true }).click();
  assert.equal(await page.locator('style[data-omd-skin-style]').count(), 0);
  assert.deepEqual(f.errors, []);
});
