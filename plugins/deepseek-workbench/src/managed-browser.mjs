import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { extractionScript } from './client/extraction.mjs';
import { commandScript, previewScript, statusScript } from './client/native-chat-bridge.mjs';
import { temporaryScript } from './client/temporary-web.mjs';

const sites = new Set(['https://chat.deepseek.com', 'https://platform.deepseek.com']);
const loginAssets = new Set(['challenges.cloudflare.com', 'castatic.fengkongcloud.cn', 'castatic-xjp.fengkongcloud.cn',
  'tracker.fengkongcloud.cn', 'captcha.fengkongcloud.cn', 'captcha1.fengkongcloud.cn',
  'a0fea896111e.edge.captcha-sdk.awswaf.com', 'a0fea896111e.edge.sdk.awswaf.com', 'appleid.cdn-apple.com']);
function official(value) {
  const url = new URL(value);
  if (!sites.has(url.origin) || url.username || url.password) throw new Error('工作台只打开 DeepSeek 官方页面。');
  return url.href;
}

const readScript = {
  status: () => statusScript, preview: () => previewScript, extract: () => extractionScript,
  chat: value => {
    if (!['new', 'think', 'search', 'stop', 'send', 'upload'].includes(value?.type)) throw new Error('无效的网页聊天操作。');
    return commandScript(value);
  },
  temporary: value => {
    if (!['probe', 'arm', 'owned', 'delete'].includes(value?.type)) throw new Error('无效的临时网页操作。');
    return temporaryScript(value);
  },
};

const require = createRequire(import.meta.url);
const execute = promisify(execFile);

async function launch(profile, signal) {
  const { chromium } = await import('playwright');
  const options = { headless: true, acceptDownloads: true, viewport: { width: 980, height: 760 }, timeout: 25000 };
  for (const channel of process.platform === 'win32' ? ['msedge', 'chrome', 'chromium'] : ['chrome', 'chromium', 'msedge']) {
    signal.throwIfAborted();
    try {
      return await chromium.launchPersistentContext(profile, { ...options, channel });
    } catch (error) {
      if (!/executable (?:is missing|doesn't exist)|distribution .* is not found/i.test(error.message)) throw error;
    }
  }
  const installer = join(dirname(require.resolve('playwright/package.json')), 'cli.js');
  await execute(process.execPath, [installer, 'install', 'chromium'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, signal, timeout: 120000, windowsHide: true,
  });
  signal.throwIfAborted();
  return chromium.launchPersistentContext(profile, { ...options, channel: 'chromium' });
}

/** Dedicated local browsing profile for official Workbench pages. */
export function createManagedWorkbench(directory, { startBrowser = launch } = {}) {
  const pages = new Map();
  const aborter = new AbortController();
  let started, disposed = false;
  async function browser() {
    if (disposed) throw new Error('工作台已关闭。');
    started ??= (async () => {
      const profile = join(directory, 'browser-profile');
      await mkdir(profile, { recursive: true, mode: 0o700 });
      const context = await startBrowser(profile, aborter.signal);
      try {
        await context.route('**/*', route => {
          const request = route.request(), url = new URL(request.url());
          const host = url.hostname;
          const allowed = url.protocol === 'https:' && !url.username && !url.password && !url.port && (
            host === 'deepseek.com' || host.endsWith('.deepseek.com') || host === 'files.deepseeksvc.com'
            || host === 'hcaptcha.com' || host.endsWith('.hcaptcha.com') || host.endsWith('.captcha.awswaf.com')
            || loginAssets.has(host));
          if (!allowed) return route.abort();
          if (request.isNavigationRequest() && !sites.has(url.origin) &&
            !(host === 'files.deepseeksvc.com' && url.pathname.startsWith('/api/'))) {
            try { if (!request.frame().parentFrame()) return route.abort(); }
            catch { return route.abort(); }
          }
          return route.fallback();
        });
      } catch (error) { await context.close(); throw error; }
      context.once('close', () => { started = undefined; pages.clear(); });
      if (disposed) { await context.close(); throw new Error('工作台已关闭。'); }
      return context;
    })().catch(error => { started = undefined; throw error; });
    return started;
  }
  async function close(id, record) {
    if (pages.get(id) !== record) return;
    pages.delete(id);
    record.closed = true;
    clearTimeout(record.expiry);
    await Promise.allSettled([...record.popups].map(page => page.close()));
    await record.page.close();
  }
  function refresh(id, record) {
    clearTimeout(record.expiry);
    record.expiry = setTimeout(() => { void close(id, record).catch(() => {}); }, 90000);
    record.expiry.unref();
  }
  return {
    async request(args) {
      if (args.operation === 'open') {
        const url = official(args.url);
        const id = randomUUID(), context = await browser(), page = await context.newPage();
        let history;
        try { history = await context.newCDPSession(page); }
        catch (error) { await page.close(); throw error; }
        const record = { page, downloads: new Map(), writes: Promise.resolve(), history };
        pages.set(id, record); refresh(id, record);
        const save = download => {
          if (record.closed || record.downloads.size >= 20 || !sites.has(new URL(page.url()).origin)) { void download.cancel().catch(() => {}); return; }
          record.downloads.set(randomUUID(), download);
        };
        page.on('download', save);
        const popups = new Set();
        page.on('popup', popup => {
          popups.add(popup);
          popup.once('close', () => popups.delete(popup));
          popup.on('download', save);
          if (record.closed) void popup.close().catch(() => {});
        });
        record.popups = popups;
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
          return { id };
        } catch (error) { await close(id, record); throw error; }
      }
      const record = pages.get(args.id);
      if (!record || record.closed) throw new Error('网页已关闭，请重新打开。');
      const { page } = record;
      refresh(args.id, record);
      if (args.operation === 'close') { await close(args.id, record); return { closed: true }; }
      if (args.operation === 'touch') return { url: page.url(), title: await page.title() };
      if (args.operation === 'frame') {
        const [image, title, history] = await Promise.all([page.screenshot({ type: 'jpeg', quality: 72, timeout: 5000 }),
          page.title(), record.history.send('Page.getNavigationHistory')]);
        return { image: image.toString('base64'), title, url: page.url(), canGoBack: history.currentIndex > 0,
          canGoForward: history.currentIndex + 1 < history.entries.length,
          downloads: [...record.downloads].map(([id, item]) => ({ id, name: item.suggestedFilename() })) };
      }
      const run = async () => {
        if (record.closed) throw new Error('网页已关闭。');
        const value = args.value;
        switch (args.operation) {
          case 'navigate': await page.goto(official(value), { waitUntil: 'domcontentloaded', timeout: 25000 }); break;
          case 'back': await page.goBack({ waitUntil: 'domcontentloaded' }); break;
          case 'forward': await page.goForward({ waitUntil: 'domcontentloaded' }); break;
          case 'reload': await page.reload({ waitUntil: 'domcontentloaded' }); break;
          case 'inspect': {
            if (!sites.has(new URL(page.url()).origin) || !Object.hasOwn(readScript, value?.method)) throw new Error('不允许此网页操作。');
            return { result: await page.evaluate(readScript[value.method](value.args)) };
          }
          case 'click': case 'move': {
            if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y) || value.x < 0 || value.x >= 980 || value.y < 0 || value.y >= 760) throw new Error('无效的网页坐标。');
            if (value.url !== page.url()) throw new Error('网页已切换，请在当前画面上重试。');
            if (args.operation === 'move') await page.mouse.move(value.x, value.y);
            else await page.mouse.click(value.x, value.y);
            break;
          }
          case 'scroll':
            if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y)) throw new Error('无效的滚动距离。');
            await page.mouse.wheel(Math.max(-1200, Math.min(1200, value.x)), Math.max(-1200, Math.min(1200, value.y)));
            break;
          case 'key':
            if (typeof value !== 'string' || value.length > 80) throw new Error('无效按键。');
            await page.keyboard.press(value);
            break;
          case 'text':
            if (typeof value !== 'string' || value.length > 65536) throw new Error('无效的输入内容。');
            await page.keyboard.insertText(value);
            break;
          case 'downloadDone': {
            const download = record.downloads.get(value);
            if (download) { await download.delete(); record.downloads.delete(value); }
            break;
          }
          default: throw new Error('无效的工作台浏览器操作。');
        }
        return {};
      };
      const work = record.writes.then(run);
      record.writes = work.catch(() => {});
      return work;
    },
    async download(id, item) {
      const download = pages.get(id)?.downloads.get(item);
      if (!download) throw new Error('下载已过期。');
      return { stream: await download.createReadStream(), name: download.suggestedFilename() };
    },
    async dispose() {
      disposed = true;
      aborter.abort();
      await Promise.allSettled([...pages].map(([id, record]) => close(id, record)));
      const context = await started?.catch(() => undefined);
      if (context) await context.close();
    },
  };
}
