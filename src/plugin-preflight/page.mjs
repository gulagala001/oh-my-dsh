import { setTimeout as delay } from 'node:timers/promises';
import { problem, redact } from './shared.mjs';

const names = {
  welcome: /^(预览版说明|Preview Notice)$/,
  proceed: /^(继续|Continue)$/,
  key: /^(添加 API Key|Add API Key)$/,
  later: /^(稍后配置|Configure later)$/,
  account: /^(账号菜单|Account menu)$/,
  settings: /^(设置|Settings)$/,
};

// Onboarding is conditional: a provider can suppress it, the account plugin
// can contribute a choice, or Models can render its credential editor directly.
// Only follow actions actually rendered by the host. Never log in or add a key.
export async function finishOnboarding(page, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  const dialogs = page.getByRole('dialog').filter({ visible: true });
  const actions = [dialogs.filter({ has: page.getByRole('button', { name: names.later }) }).getByRole('button', { name: names.later }),
    dialogs.getByRole('button', { name: names.key }),
    page.getByRole('dialog', { name: names.welcome }).getByRole('button', { name: names.proceed })];
  let readySince;
  while (Date.now() < deadline) {
    let acted = false;
    for (const action of actions) {
      const visible = action.filter({ visible: true }).first();
      if (!await visible.isVisible()) continue;
      await visible.click({ timeout: Math.max(1, Math.min(1500, deadline - Date.now())) });
      acted = true; break;
    }
    // Visibility alone also matches the composer behind an inert modal. Test
    // hit targets without changing DOM state or forcing clicks through overlays.
    const ready = !acted && await page.locator('[data-composer-input]').evaluateAll(inputs => inputs.some(input => {
      if (input.closest('[inert]')) return false;
      const rect = input.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit === input || input.contains(hit);
    })) && await dialogs.count() === 0;
    if (!ready) readySince = undefined;
    else if (readySince === undefined) readySince = Date.now();
    else if (Date.now() - readySince >= 300) return;
    await delay(100);
  }
  throw problem('ui-timeout', '首次启动界面未就绪，预检未完成；未要求配置账号或 API Key');
}

export function activationState(inventory, candidate, entryId) {
  const bundle = inventory.bundles.find(row => row.name === candidate);
  if (!bundle?.enabled || bundle.error) throw problem('environment-unavailable', '无法确认候选插件组合已完整加载：' + candidate);
  const ownIds = new Set(bundle.rows.map(row => row.entryId).filter(Boolean));
  for (const row of inventory.plugins) if (bundle.overrides?.includes(row.patchId)) ownIds.add(row.entryId);
  const failed = inventory.plugins.filter(row => row.enabled && row.fiberPhase === 'failed');
  if (failed.length) throw problem(failed.some(row => ownIds.has(row.entryId)) ? 'host-failed' : 'environment-unavailable',
    '隔离插件组合存在加载失败：' + failed.map(row => row.moduleName).join('、'));
  if (entryId && !inventory.plugins.some(row => row.patchId === entryId && row.enabled))
    throw problem('environment-unavailable', '待启用的插件入口没有在隔离环境中启用：' + entryId);
  if (bundle.rows.some(row => !row.entryId || !inventory.plugins.some(plugin => plugin.entryId === row.entryId)))
    throw problem('environment-unavailable', '候选插件的入口未出现在原生加载清单中：' + candidate);
  // Other bundles can intentionally wait for optional services. The candidate
  // must settle, and enabled entries with no fiber must never count as success.
  return inventory.plugins.filter(row => row.enabled && (row.fiberPhase === null
    || ownIds.has(row.entryId) && row.fiberPhase !== 'active'));
}

async function checkActivation(page, candidate, entryId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let waiting = [];
  while (Date.now() < deadline) {
    const inventory = await page.evaluate(async timeout => {
      const call = async method => {
        const response = await fetch('/api/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(timeout),
          body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: {} } }) });
        const data = await response.json();
        if (!response.ok || !data.result?.ok) throw Error('无法读取原生插件加载状态：' + method);
        return data.result.value;
      };
      const [plugins, bundles] = await Promise.all([call('pluginManager/listPlugins'), call('pluginManager/listBundles')]);
      return { plugins, bundles };
    }, Math.max(1, Math.min(4000, deadline - Date.now()))).catch(error => {
      throw Object.assign(problem(Date.now() >= deadline ? 'environment-timeout' : 'environment-unavailable', '原生插件加载状态读取未完成'), { details: error.message });
    });
    waiting = activationState(inventory, candidate, entryId);
    if (!waiting.length) return;
    await delay(150);
  }
  throw problem('environment-timeout', '插件尚未完成加载或仍在等待依赖服务：'
    + waiting.map(row => `${row.moduleName} (${row.fiberPhase ?? '未加载'})`).join('、'));
}

export async function checkRuntimePage(page, bootstrap, { candidate, entryId, timeoutMs = 12000 } = {}) {
  const errors = [];
  let stage = '页面加载', rejectFatal;
  const fatal = new Promise((_, reject) => { rejectFatal = reject; });
  const fail = message => {
    if (errors.length < 10) errors.push(String(message).slice(0, 4096));
    rejectFatal(Object.assign(problem('client-failed', '隔离页面运行失败：' + String(message).slice(0, 512)), { details: errors.join('\n') }));
  };
  const onError = error => fail(error.stack || error.message);
  const onResponse = response => {
    if (response.status() >= 400 && ['script', 'document'].includes(response.request().resourceType())
      && new URL(response.url()).origin === new URL(bootstrap).origin) fail(`HTTP ${response.status()} ${response.url()}`);
  };
  const onRequestFailed = request => {
    if (['script', 'document'].includes(request.resourceType()) && new URL(request.url()).origin === new URL(bootstrap).origin)
      fail(`${request.failure()?.errorText || '资源加载失败'} ${request.url()}`);
  };
  page.on('pageerror', onError); page.on('response', onResponse); page.on('requestfailed', onRequestFailed);
  try {
    await Promise.race([(async () => {
      await page.goto(bootstrap, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      stage = '插件加载';
      await checkActivation(page, candidate, entryId, timeoutMs);
      stage = '首次启动界面';
      await finishOnboarding(page, timeoutMs);
      const diagnostic = page.getByRole('alert', { name: 'Oh My DSH 启动诊断', exact: true });
      if (await diagnostic.isVisible()) throw Object.assign(problem('client-failed', '隔离页面报告增强功能启动失败'),
        { details: await diagnostic.innerText() });
      stage = '输入框';
      const input = page.locator('[data-composer-input]').filter({ visible: true }).first();
      if (await input.getAttribute('contenteditable') === 'false' && await input.getAttribute('data-phase') === 'inert') {
        await input.click({ timeout: 5000 });
        await page.getByRole('menu').first().waitFor({ state: 'visible', timeout: 5000 });
        await page.keyboard.press('Escape');
      } else { await input.fill('插件启动检查', { timeout: 5000 }); await input.fill('', { timeout: 5000 }); }
      stage = '设置';
      await page.getByRole('button', { name: names.account }).click({ timeout: 5000 });
      await page.getByRole('menuitem', { name: names.settings }).click({ timeout: 5000 });
      await page.getByRole('dialog', { name: names.settings }).waitFor({ state: 'visible', timeout: 5000 });
    })(), fatal]);
  } catch (error) {
    const body = await page.locator('body').innerText({ timeout: 1000 }).catch(() => '');
    if (!error.code && error.name === 'TimeoutError') error = Object.assign(problem('ui-timeout', `${stage}未就绪，预检未完成`), { cause: error });
    if (error.code === 'ui-timeout' && !body.trim()) error = problem('client-failed', '隔离页面为空白，基础界面未能加载');
    error.details = redact([`检查阶段：${stage}`, error.details, error.cause?.message, ...errors, body.slice(0, 4096)].filter(Boolean).join('\n'));
    throw error;
  } finally {
    page.off('pageerror', onError); page.off('response', onResponse); page.off('requestfailed', onRequestFailed);
  }
}
