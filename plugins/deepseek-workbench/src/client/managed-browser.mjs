import { extractionScript } from './extraction.mjs';
import { commandScript, previewScript, statusScript } from './native-chat-bridge.mjs';
import { temporaryScript } from './temporary-web.mjs';

const literalScripts = new Map([[extractionScript, 'extract'], [previewScript, 'preview'], [statusScript, 'status']]);
const marker = { method: 'workbench-argument-marker' }, encoded = JSON.stringify(marker);
const structuredScripts = [[commandScript(marker), 'chat'], [temporaryScript(marker), 'temporary']]
  .map(([script, method]) => ({ method, edges: script.split(encoded) }));

function inspect(script) {
  if (literalScripts.has(script)) return { method: literalScripts.get(script) };
  for (const { method, edges: [start, end] } of structuredScripts) {
    if (script.startsWith(start) && script.endsWith(end)) return { method, args: JSON.parse(script.slice(start.length, -end.length)) };
  }
  throw new Error('此网页操作不可用。');
}

export async function createManagedBrowserAdapter({ container, url, api, signal, onState }) {
  const { id } = await api('/browser', { operation: 'open', url });
  const send = (operation, value, requestSignal) => api('/browser', { id, operation, value }, requestSignal);
  if (signal.aborted) { await send('close'); return null; }
  const element = document.createElement('div');
  element.className = 'dswb-managed-browser';
  const image = document.createElement('img');
  image.alt = 'DeepSeek 网页';
  image.draggable = false;
  const input = document.createElement('textarea');
  input.setAttribute('aria-label', '网页键盘输入');
  input.autocapitalize = 'off';
  input.autocomplete = 'off';
  const downloads = document.createElement('div');
  downloads.className = 'dswb-managed-downloads';
  const buttons = new Map();
  element.append(image, input, downloads);
  container.append(element);
  let disposed = false, busy = false, timer, pendingClose;
  let frame = { ready: true, loading: false, url, title: '', error: '', warnings: [], canGoBack: false, canGoForward: false };
  const publish = patch => { if (!disposed) { frame = { ...frame, ...patch }; onState(frame); } };
  const error = value => publish({ error: value.message, loading: false });
  const invoke = (operation, value) => {
    if (disposed) return Promise.reject(new Error('网页已关闭。'));
    return send(operation, value, signal);
  };
  async function openDownload(item) {
    const link = new URL('/deepseek-workbench/api/browser/download', location.href);
    link.searchParams.set('page', id);
    link.searchParams.set('item', item.id);
    const save = globalThis.dshDesktop?.fileActions?.save;
    if (typeof save !== 'function') throw new Error('当前窗口不提供文件保存对话框。');
    const result = await save({ url: link.href, name: item.name, mode: 'saveAs' });
    if (result.status === 'saved') await invoke('downloadDone', item.id);
  }
  function updateDownloads(items) {
    for (const [id, button] of buttons) if (!items.some(item => item.id === id)) { button.remove(); buttons.delete(id); }
    for (const item of items) {
      if (buttons.has(item.id)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '保存 ' + item.name;
      button.onclick = async () => {
        button.disabled = true;
        try { await openDownload(item); } catch (failure) { error(failure); }
        finally { button.disabled = false; }
      };
      buttons.set(item.id, button);
      downloads.append(button);
    }
  }
  async function poll() {
    if (disposed) return;
    try {
      if (!busy && element.getBoundingClientRect().width > 0 && !document.hidden) {
        const result = await invoke('frame');
        if (disposed) return;
        image.src = 'data:image/jpeg;base64,' + result.image;
        updateDownloads(result.downloads);
        publish({ ready: true, loading: false, url: result.url, title: result.title,
          canGoBack: result.canGoBack, canGoForward: result.canGoForward });
      } else if (!busy) publish(await invoke('touch'));
    } catch (failure) { if (!disposed) error(failure); }
    if (!disposed) timer = setTimeout(poll, element.getBoundingClientRect().width > 0 && !document.hidden ? 200 : 3000);
  }
  image.addEventListener('pointerdown', event => {
    if (!frame.ready || busy || event.button !== 0) return;
    const bounds = image.getBoundingClientRect();
    const factor = Math.min(bounds.width / 980, bounds.height / 760);
    const x = (event.clientX - bounds.left - (bounds.width - 980 * factor) / 2) / factor;
    const y = (event.clientY - bounds.top - (bounds.height - 760 * factor) / 2) / factor;
    if (x < 0 || x >= 980 || y < 0 || y >= 760) return;
    input.focus({ preventScroll: true });
    void invoke('click', { x, y, url: frame.url }).catch(error);
  });
  element.addEventListener('wheel', event => {
    if (event.target !== image) return;
    event.preventDefault();
    void invoke('scroll', { x: event.deltaX, y: event.deltaY }).catch(error);
  }, { passive: false });
  input.addEventListener('input', event => {
    if (event.isComposing || !input.value) return;
    const text = input.value; input.value = '';
    void invoke('text', text).catch(error);
  });
  input.addEventListener('keydown', event => {
    if (event.isComposing || ['Control', 'Meta', 'Alt', 'Shift', 'Dead', 'Process'].includes(event.key)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') return;
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) return;
    event.preventDefault();
    const key = [...(event.ctrlKey ? ['Control'] : []), ...(event.metaKey ? ['Meta'] : []),
      ...(event.altKey ? ['Alt'] : []), ...(event.shiftKey ? ['Shift'] : []), event.key].join('+');
    void invoke('key', key).catch(error);
  });
  const navigate = async (operation, value) => {
    if (busy) throw new Error('网页正在打开，请稍候。');
    busy = true; publish({ loading: true, error: '' });
    try { await invoke(operation, value); }
    finally { busy = false; publish({ loading: false }); }
  };
  const dispose = () => {
    if (!disposed) {
      disposed = true;
      signal.removeEventListener('abort', abort);
      clearTimeout(timer);
      element.remove();
    }
    return pendingClose ??= send('close').catch(failure => { pendingClose = undefined; throw failure; });
  };
  const abort = () => { void dispose().catch(failure => console.error('工作台网页关闭失败', failure)); };
  signal.addEventListener('abort', abort, { once: true });
  publish({});
  void poll();
  return {
    element, capabilities: { persistentProfiles: true, downloads: true },
    navigate: value => navigate('navigate', value),
    back: () => void navigate('back').catch(error),
    forward: () => void navigate('forward').catch(error),
    reload: () => void navigate('reload').catch(error),
    async extract(script) { return (await invoke('inspect', inspect(script))).result; },
    dispose,
  };
}
