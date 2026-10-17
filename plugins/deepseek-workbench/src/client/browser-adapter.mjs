export const CHAT_URL = 'https://chat.deepseek.com/';
export const PLATFORM_URL = 'https://platform.deepseek.com/';
export function browserLimitations(capabilities = {}) {
  const warnings = [];
  if (!capabilities.persistentProfiles) warnings.push('当前宿主不支持专属持久登录配置，关闭页面或重启后可能需要重新登录。');
  if (!capabilities.downloads) warnings.push('当前宿主不支持网页下载。');
  return warnings;
}
export function httpUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
/** One adapter owns exactly one lease. Keeping the component mounted preserves
 * its guest while native tabs are hidden. Disposal also handles a late acquire. */
export async function createBrowserAdapter({ bridge, container, workspace = 'deepseek-workbench', url = CHAT_URL, signal, onState = () => {}, createElement = () => document.createElement('webview') }) {
  if (!bridge || typeof bridge.acquire !== 'function' || typeof bridge.release !== 'function') throw new Error('此页面需要 DSH 桌面宿主的内置浏览器。请使用桌面版，或在外部浏览器打开。');
  const target = httpUrl(url);
  if (!target) throw new Error('不支持此网页地址。');
  let capabilities = {};
  try { capabilities = await bridge.capabilities?.() ?? {}; } catch { /* Feature detection falls back to the known non-persistent guest. */ }
  if (signal?.aborted) return null;
  const reservation = await bridge.acquire(workspace, { profile: 'deepseek-workbench' });
  if (signal?.aborted) { await bridge.release(reservation.lease); return null; }
  let disposed = false, ready = false, initial = true, stopOpen, cleanupPromise;
  let element;
  const removers = [];
  const state = { loading: true, ready: false, url: target, title: '', error: '', canGoBack: false, canGoForward: false, warnings: browserLimitations(capabilities) };
  const publish = patch => { if (!disposed) { Object.assign(state, patch); onState({ ...state }); } };
  const listen = (name, listener) => { element.addEventListener(name, listener); removers.push(() => element.removeEventListener(name, listener)); };
  const observe = () => {
    if (disposed || !ready) return;
    try { publish({ url: httpUrl(element.getURL?.()) || state.url, title: element.getTitle?.() ?? state.title, canGoBack: Boolean(element.canGoBack?.()), canGoForward: Boolean(element.canGoForward?.()) }); } catch { /* A navigating guest may not have an available frame. */ }
  };
  const navigate = async value => {
    if (disposed || !ready) throw new Error('网页仍在初始化，请稍后重试。');
    const next = httpUrl(value);
    if (!next) throw new Error('不支持此网页地址。');
    publish({ loading: true, error: '', url: next });
    try { await element.loadURL(next); } catch (error) { publish({ loading: false, error: error.message || '网页加载失败。' }); throw error; }
  };
  const dispose = () => {
    if (cleanupPromise) return cleanupPromise;
    if (!disposed) {
      disposed = true;
      signal?.removeEventListener('abort', abort);
      try { stopOpen?.(); } catch { /* Continue releasing the owned lease. */ }
      for (const remove of removers) { try { remove(); } catch { /* Continue cleanup. */ } }
      element?.remove();
    }
    cleanupPromise = Promise.resolve().then(() => bridge.release(reservation.lease)).catch(error => { cleanupPromise = undefined; throw error; });
    return cleanupPromise;
  };
  const abort = () => { void dispose().catch(error => console.error('DeepSeek Workbench browser release failed', error)); };
  try {
    element = createElement();
    element.className = 'dswb-webview';
    element.setAttribute('name', reservation.lease);
    element.setAttribute('partition', reservation.partition);
    element.setAttribute('allowpopups', '');
    element.setAttribute('src', 'about:blank#' + reservation.lease);
    element.setAttribute('aria-label', url === PLATFORM_URL ? 'DeepSeek API 开放平台' : 'DeepSeek 网页聊天');
    listen('dom-ready', () => { ready = true; publish({ ready: true }); if (initial) { initial = false; void navigate(target).catch(() => {}); } else observe(); });
    listen('did-start-loading', () => publish({ loading: true, error: '' }));
    listen('did-stop-loading', () => { observe(); publish({ loading: false }); });
    listen('did-navigate', observe);
    listen('did-navigate-in-page', observe);
    listen('page-title-updated', observe);
    listen('did-fail-load', event => {
      if (event.isMainFrame === false || event.errorCode === -3) return;
      publish({ loading: false, error: event.errorDescription || `网页加载失败 (${event.errorCode ?? '未知'})` });
    });
    listen('render-process-gone', () => publish({ ready: false, loading: false, error: '网页进程已退出，请重新打开页面。' }));
    stopOpen = bridge.onOpenRequested?.(reservation.lease, value => { const next = httpUrl(value); if (next) void navigate(next).catch(() => {}); });
    container.append(element);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { await dispose(); return null; }
    publish({});
    return {
      element, capabilities,
      navigate,
      back() { if (ready && !disposed) element.goBack(); },
      forward() { if (ready && !disposed) element.goForward(); },
      reload() { if (ready && !disposed) { publish({ loading: true, error: '' }); element.reload(); } },
      async extract(script) {
        if (!ready || disposed) throw new Error('网页未就绪，请等待加载完成后重试。');
        try {
          const result = await element.executeJavaScript(script, false);
          if (disposed) throw new Error('网页已关闭，读取结果已取消。');
          return result;
        }
        catch (error) { throw new Error((error.message || '网页操作失败。').replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')); }
      },
      dispose,
    };
  } catch (error) { await dispose(); throw error; }
}
