import { openWorkbench } from './fixtures/workbench.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('iOS Liquid Glass real shell, sidebar, settings, workbench and recovery', { timeout: 120000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  const screenshots = new URL('../work/rea-upgrade/ios-liquid-glass-qa/', import.meta.url);
  const capture = async name => {
    if (!process.env.TRISOUL_UI_ARTIFACTS) return;
    await mkdir(screenshots, { recursive: true });
    const path = join(f.root, name + '.png');
    // Sidebar content unmounts on a JS timer after the native resize transition.
    await page.waitForTimeout(250);
    await page.screenshot({ path, animations: 'disabled' }); await copyFile(path, new URL(name + '.png', screenshots));
  };
  const openSettings = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('.VOzbGW_nav').getByRole('button', { name: '外观', exact: true }).click();
  };
  const dialog = page.getByRole('dialog');
  const style = (locator, property) => locator.evaluate((el, p) => getComputedStyle(el)[p], property);
  const visibleHit = async locator => locator.evaluate(el => {
    const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.width > 0 && r.height > 0 && el.contains(hit);
  });
  await openSettings();
  await page.getByLabel('主题', { exact: true }).selectOption('ios-liquid-glass');
  await until(async () => await page.locator('html').getAttribute('data-omd-layout') === 'ios-liquid');
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    await until(async () => await page.locator('html').getAttribute('data-appearance') === mode);
    await capture('settings-' + mode);
    assert.equal(await visibleHit(page.getByLabel('主题', { exact: true })), true, 'settings escape sidebar backdrop containing block');
    await page.keyboard.press('Escape');
    await capture('chat-' + mode);
    assert.equal(await style(page.locator('.hHd-Xa_root'), 'borderRadius'), '30px');
    const reduceTransparency = await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches);
    await until(async () => (await style(page.locator('[data-composer-card]'), 'backdropFilter') === 'none') === reduceTransparency);
    assert.equal(await visibleHit(page.locator('.hHd-Xa_newSession')), true);
    await page.getByRole('button', { name: 'BT · Better Todo', exact: true }).click();
    await page.getByRole('menu').waitFor(); await capture('menu-' + mode);
    await page.keyboard.press('Escape');
    await openWorkbench(page, '任务');
    await until(async () => {
      const r = await page.locator('.tx-workbench:visible').boundingBox();
      return r && r.width > 300 && r.x + r.width <= 1441;
    });
    await capture('workbench-' + mode);
    await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
    await openSettings();
  }
  const pages = ['通用设置', '模型', '内置插件', '外观', 'Oh My DSH', '推荐插件', 'Agent 预设'];
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const name of pages) {
      const nav = page.locator('.VOzbGW_nav').getByRole('button', { name, exact: true });
      await nav.click();
      await until(async () => await nav.getAttribute('aria-current') === 'true');
      const dimensions = await dialog.evaluate(el => {
        const r = el.getBoundingClientRect(), c = el.querySelector('.VOzbGW_options');
        return { x: r.x, right: r.right, width: c.clientWidth, scroll: c.scrollWidth, viewport: innerWidth };
      });
      assert.ok(dimensions.x >= 0 && dimensions.right <= width + 1, name + ' dialog fits');
      assert.ok(dimensions.width >= 270, name + ' content readable: ' + JSON.stringify(dimensions));
      await capture(`settings-${width}-${name}`);
    }
    await page.locator('.VOzbGW_nav').getByRole('button', { name: '外观', exact: true }).click();
    await page.getByLabel('降低透明与动态效果').check();
    assert.equal(await style(dialog, 'backdropFilter'), 'none');
    await page.getByLabel('降低透明与动态效果').uncheck();
    await page.keyboard.press('Escape');
    await capture('chat-' + width);
    await until(async () => await visibleHit(page.locator('.hHd-Xa_toggle')));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const input = page.locator('[data-composer-input]');
    await input.fill('检查液态玻璃皮肤的输入区');
    assert.equal(await visibleHit(input), true);
    assert.equal(await visibleHit(page.locator('.uV2eYG_primary')), true);
    await input.fill('');
    if (width === 390) {
      await page.locator('.hHd-Xa_toggle').click();
      await until(async () => await page.locator('.hHd-Xa_root').evaluate(el => !el.classList.contains('hHd-Xa_fading')));
      await capture('mobile-sidebar');
      assert.equal(await visibleHit(page.locator('.hHd-Xa_newSession')), true);
      assert.equal(await page.locator('.wSkVaW_root').isVisible(), false, 'navigation sheet does not crush the conversation');
      await page.locator('.YDXeBa_sessionRow').first().click();
      await page.locator('[data-sidebar-collapsed="true"]').waitFor();
      await until(async () => await page.locator('.hHd-Xa_root').evaluate(el => !el.classList.contains('hHd-Xa_fading')));
      const release = f.holdNextReply();
      try {
        await input.fill('检查发送与停止'); await page.locator('.uV2eYG_primary').click();
        await page.locator('.tx-composer-dock[data-omd-running]').waitFor();
        const stop = page.locator('.uV2eYG_primary');
        assert.equal(await visibleHit(stop), true);
        await capture('mobile-running');
        await stop.click();
        await page.locator('.tx-composer-dock[data-omd-running]').waitFor({ state: 'hidden' });
      } finally { release(); }
      await page.locator('.hHd-Xa_newSession').click();
      await page.locator('.pXSMma_headline').waitFor();
      await capture('mobile-new-conversation');
    }
    await openSettings();
  }
  await page.getByLabel('明暗模式', { exact: true }).selectOption('system');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await until(async () => await page.locator('html').getAttribute('data-appearance') === 'light');
  assert.equal(await style(page.getByLabel('降低透明与动态效果'), 'transitionDuration'), '0s');
  // Reopen a retained conversation before reload; a new blank session can still
  // be replacing the main panel and closing transient dialogs.
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByText('整理工作台和对话界面', { exact: true }).first().click();
  await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-omd-layout'), 'ios-liquid');
  await openSettings(); await page.getByRole('button', { name: '恢复默认主题', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-omd-layout'), null);
  assert.equal(await page.locator('style[data-omd-skin-style]').count(), 0);
  assert.deepEqual(f.errors, []);
});

// Read the installed product styles, not the token source or a synthetic swatch.
const rgbChannels = value => {
  const srgb = value.match(/^color\(srgb ([^)]+)\)$/);
  if (srgb) {
    const [channels, alpha = '1'] = srgb[1].split('/');
    return [...channels.trim().split(/\s+/).map(channel => Number(channel) * 255), Number(alpha)];
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  assert.ok(match, 'expected a computed RGB color: ' + value);
  const channels = match[1].split(',').map(Number);
  return [...channels.slice(0, 3), channels[3] ?? 1];
};
const contrastRatio = (foreground, background) => {
  const luminance = value => rgbChannels(value).slice(0, 3).map(channel => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const paintedBackground = (base, backgrounds) => {
  assert.equal(rgbChannels(base)[3], 1, 'the user bubble provides an opaque contrast base');
  let color = rgbChannels(base).slice(0, 3);
  for (const background of backgrounds.toReversed()) {
    const [r, g, b, alpha] = rgbChannels(background);
    color = [r, g, b].map((channel, index) => channel * alpha + color[index] * (1 - alpha));
  }
  return 'rgb(' + color.join(', ') + ')';
};

test('iOS Liquid Glass rendered text contrast and custom primary foreground', { timeout: 120000 }, async t => {
  // frontendFixture already launches an isolated headless Chromium. Its headless
  // option means API-only (no page), so retain the real browser fixture here.
  const f = await frontendFixture(t), { page, rpc, sessionId } = f;
  const screenshots = new URL('../work/rea-upgrade/ios-liquid-glass-qa/', import.meta.url);
  const measurements = [];
  const reference = '<computer-use-target>' + JSON.stringify({ kind: 'app', id: 'fixture-editor', label: '测试编辑器' }) + '</computer-use-target>';
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '检查可读性 ' + reference }] });
  await page.locator('.tx-cu-user-bubble').waitFor();
  const openSettings = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  };
  const snapshot = async name => {
    const bubbles = await page.locator('.Sixlwa_bubble, .tx-cu-user-bubble').evaluateAll(nodes => nodes.map(el => {
      const s = getComputedStyle(el);
      return { cls: el.className, foreground: s.color, background: s.backgroundColor, fontSize: s.fontSize,
        descendants: [...el.querySelectorAll('*')].filter(child => child.textContent).map(child => {
          const style = getComputedStyle(child);
          const backgrounds = [];
          for (let ancestor = child; ancestor !== el; ancestor = ancestor.parentElement) backgrounds.push(getComputedStyle(ancestor).backgroundColor);
          return { cls: child.className, color: style.color, fill: style.webkitTextFillColor, backgrounds };
        }) };
    }));
    const send = await page.locator('.uV2eYG_primary').evaluate(el => {
      const s = getComputedStyle(el);
      return { foreground: s.color, gradient: s.backgroundImage, opacity: s.opacity, disabled: el.disabled };
    });
    const failures = [];
    const ratio = (foreground, background) => {
      const value = contrastRatio(foreground, background);
      if (value < 4.5) failures.push(`${foreground} on ${background} = ${value.toFixed(3)}, needs 4.5`);
      return value;
    };
    assert.equal(bubbles.length, 2, 'real native and computer-reference messages are rendered');
    for (const bubble of bubbles) {
      bubble.contrast = ratio(bubble.foreground, bubble.background);
      for (const child of bubble.descendants) {
        child.paintedBackground = paintedBackground(bubble.background, child.backgrounds);
        child.contrast = ratio(child.color, child.paintedBackground);
        assert.equal(child.fill, child.color, 'text fill follows the rendered foreground: ' + child.cls);
      }
    }
    assert.equal(send.disabled, false, 'measure an enabled primary action');
    assert.equal(send.opacity, '1');
    const stops = send.gradient.match(/rgba?\([^)]+\)/g);
    assert.equal(stops?.length, 2, 'inspect both ends of the real primary gradient');
    send.contrast = stops.map(stop => ratio(send.foreground, stop));
    assert.deepEqual(failures, [], `${name} rendered contrast failures: ${failures.join('; ')}`);
    measurements.push({ name, bubbles, send });
    if (process.env.TRISOUL_UI_ARTIFACTS) {
      await mkdir(screenshots, { recursive: true });
      await page.locator('.tx-cu-user-bubble').scrollIntoViewIfNeeded();
      await page.screenshot({ path: new URL('contrast-' + name + '.png', screenshots).pathname, animations: 'disabled' });
    }
  };
  await openSettings();
  await page.getByLabel('主题', { exact: true }).selectOption('ios-liquid-glass');
  await page.getByLabel('配色', { exact: true }).selectOption('theme');
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    await until(async () => await page.locator('html').getAttribute('data-appearance') === mode);
    await page.keyboard.press('Escape');
    await page.locator('[data-composer-input]').fill('可读的发送按钮');
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await snapshot(`${mode}-${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ contrast: 'more', reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => matchMedia('(prefers-contrast: more)').matches), true);
    await snapshot(`${mode}-high-contrast`);
    await openSettings();
    await page.getByLabel('降低透明与动态效果').check();
    await page.keyboard.press('Escape');
    await until(async () => await page.locator('[data-composer-card]').evaluate(el => getComputedStyle(el).backdropFilter) === 'none');
    assert.equal(await page.locator('.uV2eYG_primary').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await snapshot(`${mode}-reduced-effects`);
    await page.emulateMedia({ contrast: 'no-preference', reducedMotion: 'no-preference' });
    await openSettings();
    await page.getByLabel('降低透明与动态效果').uncheck();
  }
  // A dark custom palette has a light button and a dark foreground. Read the
  // real action's color to catch a theme-level hardcoded white override.
  await page.getByLabel('配色', { exact: true }).selectOption('palette:mint');
  await page.keyboard.press('Escape');
  const custom = await page.locator('.uV2eYG_primary').evaluate(el => {
    const s = getComputedStyle(el), probe = document.createElement('span');
    probe.style.color = s.getPropertyValue('--omd-button-fg'); el.append(probe);
    const expected = getComputedStyle(probe).color; probe.remove();
    return { foreground: s.color, expected, gradient: s.backgroundImage };
  });
  assert.equal(custom.foreground, custom.expected, 'custom button foreground reaches the native primary action');
  assert.equal(custom.foreground, 'rgb(16, 35, 30)');
  const customText = await page.locator('.Sixlwa_bubble, .tx-cu-user-bubble').evaluateAll(nodes => nodes.flatMap(el => [el, ...el.querySelectorAll('*')].filter(child => child.textContent).map(child => ({ color: getComputedStyle(child).color, fill: getComputedStyle(child).webkitTextFillColor }))));
  for (const text of customText) {
    assert.equal(text.color, custom.foreground, 'message/reference text preserves the custom palette foreground');
    assert.equal(text.fill, text.color);
  }
  assert.equal(await page.locator('html').getAttribute('data-omd-palette'), 'palette:mint');
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await mkdir(screenshots, { recursive: true });
    await page.screenshot({ path: new URL('contrast-custom-mint-dark.png', screenshots).pathname, animations: 'disabled' });
  }
  await openSettings();
  await page.locator('.omd-advanced > summary').click();
  await page.getByLabel('启用高级外观定制', { exact: true }).check();
  await page.getByLabel('编辑配色模式', { exact: true }).selectOption('dark');
  await page.getByLabel('深色用户消息文字', { exact: true }).fill('#3a2548');
  await page.keyboard.press('Escape');
  const advancedText = await page.locator('.Sixlwa_bubble, .tx-cu-user-bubble').evaluateAll(nodes => nodes.flatMap(el => [el, ...el.querySelectorAll('*')].filter(child => child.textContent).map(child => ({ color: getComputedStyle(child).color, fill: getComputedStyle(child).webkitTextFillColor }))));
  for (const text of advancedText) {
    assert.equal(text.color, 'rgb(58, 37, 72)', 'reference chips preserve the user’s advanced message foreground');
    assert.equal(text.fill, text.color);
  }
  assert.equal(await page.locator('.uV2eYG_primary').evaluate(el => getComputedStyle(el).color), custom.foreground, 'message customization leaves the primary action palette intact');
  assert.deepEqual(f.errors, []);
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await page.screenshot({ path: new URL('contrast-custom-user-text-dark.png', screenshots).pathname, animations: 'disabled' });
    await writeFile(new URL('computed-contrast.json', screenshots), JSON.stringify({ measurements, custom, customText, advancedText }, null, 2) + '\n');
  }
});
