import { extractConversationFromPage, pageFunctionScript } from './extraction.mjs';

/** Operate only the visible official composer. No account store or credential reads. */
export async function pageCommand(command, readStatus, readPreview) {
  if (location.origin !== 'https://chat.deepseek.com') throw Error('请先打开 DeepSeek 聊天。');
  const input = document.querySelector('textarea[name="search"]');
  const label = node => (node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').trim();
  if (command.type === 'new') {
    // The official new-chat action opens ROOT (/). Navigate through the owned
    // adapter so collapsed/icon-only sidebars need no label or private handler.
    return { navigateTo: location.origin + '/' };
  }
  if (['think', 'search'].includes(command.type)) {
    const pattern = command.type === 'think' ? /^(?:深度思考|DeepThink)(?:\s*\(R1\))?$/i : /^(联网搜索|搜索|Search)$/i;
    const toggles = Array.from(document.querySelectorAll('button,[role="button"],div.ds-toggle-button[aria-pressed]'));
    const button = toggles.find(node => pattern.test(label(node)));
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true' || button.classList.contains('ds-toggle-button--disabled')) throw Error('当前网页模型不支持此操作。');
    const before = readStatus()[command.type];
    const enabled = typeof command.enabled === 'boolean' ? command.enabled : !before?.enabled;
    if (before?.enabled === enabled) return { dispatched: false, status: readStatus() };
    button.click();
    const deadline = Date.now() + 1500;
    do {
      await new Promise(resolve => setTimeout(resolve, 50));
      const status = readStatus();
      if (status[command.type]?.enabled === enabled) return { dispatched: true, status };
    } while (Date.now() < deadline);
    throw Error('尚未确认官网开关状态，请检查官网页面后重试。');
  }
  if (!input || input.disabled || input.readOnly) throw Error('网页输入框尚不可用，请先完成登录或等待回复结束。');
  if (command.type === 'send') {
    if (typeof command.text !== 'string' || !command.text.trim() || command.text.length > 100000) throw Error('请输入有效的聊天内容。');
    const before = readStatus(), conversation = await readPreview({ preview: true });
    if (before.generating) return { accepted: false, error: 'DeepSeek 正在回复，请等待回复结束后再发送。' };
    const text = command.text.replace(/\r\n/g, '\n').trim();
    const matches = message => message.role === 'user' && message.text.replace(/\r\n/g, '\n').trim() === text;
    const previous = conversation.messages.filter(matches), ids = new Set(previous.map(message => message.sourceMessageId).filter(Boolean));
    const wait = () => new Promise(resolve => setTimeout(resolve, 150));
    const available = node => !node.disabled && node.getAttribute('aria-disabled') !== 'true' && !node.classList.contains('ds-icon-button--disabled');
    const sendButton = () => {
      let scope = input.parentElement;
      for (let i = 0; scope && i < 5; i++, scope = scope.parentElement) {
        for (const node of scope.querySelectorAll('button,[role="button"]')) {
          if (!node.getClientRects().length) continue;
          if (/^(发送|发送消息|Send|Send message)$/i.test(label(node))) return node;
          const key = Object.keys(node).find(key => key.startsWith('__reactFiber$'));
          for (let fiber = node[key], depth = 0; fiber && depth < 7; fiber = fiber.return, depth++) if (fiber.memoizedProps?.mode === 'send') return node;
        }
      }
    };
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, command.text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait();
    let button = sendButton();
    const readyBy = Date.now() + 1500;
    while (button && !available(button) && Date.now() < readyBy) { await wait(); button = sendButton(); }
    if (button && !available(button)) return { accepted: false, error: '官网发送按钮尚不可用，输入内容已保留。请检查附件上传状态或官网提示。' };
    // Dispatch once. A slow acknowledgement must never trigger a second send.
    if (button) button.click();
    else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    const deadline = Date.now() + 10000;
    do {
      await wait();
      const status = readStatus(), next = await readPreview({ preview: true });
      const sent = next.messages.filter(matches);
      if (sent.some(message => message.sourceMessageId && !ids.has(message.sourceMessageId)) || sent.length > previous.length || status.generating && !input.value.trim()) return { dispatched: true, accepted: true };
      if (status.signIn) return { dispatched: true, accepted: false, error: '网页登录已失效，输入内容已保留。请登录 DeepSeek 后重试。' };
      const alert = status.alerts.find(text => !before.alerts.includes(text));
      if (alert && !status.generating) return { dispatched: true, accepted: false, error: alert + '（输入内容已保留）' };
    } while (Date.now() < deadline);
    return { dispatched: true, accepted: false, error: '尚未确认官网发送结果，输入内容已保留。请先检查官网页面，避免重复发送。' };
  }
  if (command.type === 'upload') {
    if (!Array.isArray(command.files) || command.files.length > 20) throw Error('附件数量超过限制。');
    const data = new DataTransfer(); let total = 0;
    for (const file of command.files) {
      const raw = atob(file.data); total += raw.length;
      if (total > 32 * 1024 * 1024) throw Error('附件超过 32 MiB 演示限制。');
      data.items.add(new File([Uint8Array.from(raw, c => c.charCodeAt(0))], file.name, { type: file.type || 'application/octet-stream' }));
    }
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    return { dispatched: true };
  }
  throw Error('不支持此操作。');
}

export function pageStatus() {
  const input = document.querySelector('textarea[name="search"]');
  const toggles = Array.from(document.querySelectorAll('button,[role="button"],div.ds-toggle-button[aria-pressed]'));
  const text = node => (node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').trim();
  const option = pattern => {
    const node = toggles.find(node => pattern.test(text(node)));
    if (!node) return null;
    // React's DOM fiber can point at the previous commit. The rendered pressed
    // attribute is current and must not be overwritten with stale owner props.
    const pressed = node.getAttribute('aria-pressed');
    const enabled = pressed === 'true' || pressed === null && node.classList.contains('ds-toggle-button--selected');
    return { enabled, disabled: Boolean(node.disabled) || node.getAttribute('aria-disabled') === 'true' || node.classList.contains('ds-toggle-button--disabled') };
  };
  let generating = Boolean(input?.readOnly);
  if (input) {
    let scope = input.parentElement;
    for (let i = 0; scope && i < 5; i++, scope = scope.parentElement) {
      for (const node of scope.querySelectorAll('button,[role="button"]')) {
        const key = Object.keys(node).find(key => key.startsWith('__reactFiber$'));
        for (let fiber = node[key], depth = 0; fiber && depth < 7; fiber = fiber.return, depth++) if (fiber.memoizedProps?.mode === 'stop') generating = true;
      }
    }
  }
  const seen = new Set();
  const history = Array.from(document.querySelectorAll('a[href]')).flatMap(node => {
    try {
      const url = new URL(node.getAttribute('href'), location.href);
      if (url.origin !== location.origin || !/^\/a\/[^/]+\/s\/[^/]+$/.test(url.pathname) || seen.has(url.pathname)) return [];
      seen.add(url.pathname); return [{ url: url.origin + url.pathname, title: node.textContent.trim() || 'DeepSeek 对话' }];
    } catch { return []; }
  }).slice(0, 100);
  const alerts = Array.from(document.querySelectorAll('[role="alert"],.ds-toast')).map(node => node.textContent.trim()).filter(Boolean).slice(-3);
  return { url: location.href, ready: Boolean(input), signIn: /^\/(sign_in|sign_up|authorized)/.test(location.pathname), generating,
    think: option(/^(?:深度思考|DeepThink)(?:\s*\(R1\))?$/i), search: option(/^(联网搜索|搜索|Search)$/i), history, alerts };
}

export const statusScript = pageFunctionScript(pageStatus);
export const previewScript = pageFunctionScript(extractConversationFromPage, { preview: true });
export const commandScript = command => `(()=>{const __name=(fn)=>fn;return (${pageCommand.toString()})(${JSON.stringify(command)},${pageStatus.toString()},${extractConversationFromPage.toString()})})()`;
