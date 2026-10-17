/** Self-contained: serialized into the owned guest. Never calls private APIs. */
export async function extractConversationFromPage({ preview = false } = {}) {
  const warnings = [];
  const url = location.href;
  if (location.protocol !== 'https:' || location.hostname !== 'chat.deepseek.com') throw new Error('请先打开 DeepSeek 网页聊天中的会话，再迁移。');
  const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim();
  const safeUrl = value => { if (typeof value !== 'string' || !value.trim()) return null; try { const u = new URL(value, url); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
  const attachment = item => {
    const source = item?.url ?? item?.href;
    const href = safeUrl(source);
    const reference = href && new URL(href);
    const permitted = reference?.protocol === 'https:' && !reference.username && !reference.password;
    const local = typeof source === 'string' && /^(blob:|data:)/.test(source) ? source : null;
    const name = clean(item?.name ?? item?.filename ?? item?.title);
    if (!name && !permitted && !local) return null;
    if (source && !permitted && !local) warnings.push('部分附件地址不适合迁移，已保留名称而未导入该地址。');
    return { ...(permitted ? { url: href } : {}), ...(local ? { localSource: local } : {}), name: name || '附件引用' };
  };
  const timestamp = value => {
    if (value === undefined || value === null) return undefined;
    let parsed = typeof value === 'number' ? value : typeof value === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : typeof value === 'string' ? Date.parse(value) : NaN;
    // Numeric Unix timestamps below 10^11 represent seconds; native imports
    // record milliseconds. ISO dates are already parsed to milliseconds.
    const numeric = typeof value === 'number' || typeof value === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(value.trim());
    if (numeric && parsed >= 0 && parsed < 100_000_000_000) parsed *= 1000;
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
    warnings.push('部分消息时间无法解析，已保留消息内容并省略无效时间。');
    return undefined;
  };
  const nativeFile = file => {
    const signed = file?.signedPath ?? file?.signed_path;
    let reference = file?.url;
    if (typeof signed === 'string' && signed) {
      try { const link = new URL(/^https?:\/\//.test(signed) ? signed : 'https://files.deepseeksvc.com/api' + signed); link.searchParams.set('ty', 'r'); reference = link.href; } catch { /* An invalid signed reference is reported below. */ }
    }
    const value = attachment({ url: reference, name: file?.fileName ?? file?.file_name ?? file?.name });
    if (!value || !value.url && !value.localSource) warnings.push('部分网页附件没有可访问的签名引用，已保留可识别的名称。');
    return value;
  };
  const normalize = items => {
    const result = [];
    for (const item of items) {
      const role = typeof item?.role === 'string' ? item.role.toLowerCase() : '';
      if (!['user', 'assistant'].includes(role)) { warnings.push('网页消息中含有未知角色或工具内容，未作为聊天历史迁移。'); continue; }
      let text = typeof item.text === 'string' ? item.text : typeof item.content === 'string' ? item.content : '';
      const fragments = [...(Array.isArray(item.content) ? item.content : []), ...(Array.isArray(item.fragments) ? item.fragments : [])];
      if (!text && fragments.length) {
        const textTypes = ['text', 'markdown', 'code', 'request', 'response', 'template_response'];
        text = fragments.filter(part => textTypes.includes(String(part?.type).toLowerCase())).map(part => String(part.type).toLowerCase() === 'code' ? '```' + (part.language ?? '') + '\n' + (part.text ?? part.content ?? '') + '\n```' : part.text ?? part.content ?? '').join('\n\n');
      }
      if (fragments.some(part => String(part?.type).toLowerCase() === 'think')) warnings.push('思考过程未作为回复历史迁移。');
      if (fragments.some(part => !['text', 'markdown', 'code', 'request', 'response', 'template_response', 'think', 'file'].includes(String(part?.type).toLowerCase()))) warnings.push('网页消息中含有未迁移的工具或非文本内容，请检查原会话。');
      const attachments = [...(Array.isArray(item.attachments) ? item.attachments : []).map(attachment).filter(Boolean), ...fragments.filter(part => String(part?.type).toLowerCase() === 'file').flatMap(part => Array.isArray(part.files) ? part.files.map(nativeFile).filter(Boolean) : [])];
      if (item.attachments?.length > attachments.length) warnings.push('部分附件没有可访问的网页引用，未迁移附件文件。');
      text = String(text).replace(/\r\n/g, '\n');
      if (!text.trim() && !attachments.length) { warnings.push('有空白或无法识别的消息未迁移。'); continue; }
      const at = timestamp(item.timestamp ?? item.insertedAt ?? item.inserted_at);
      result.push({ role, text, ...(item.id != null || item.message_id != null ? { sourceMessageId: String(item.id ?? item.message_id) } : {}), ...(at === undefined ? {} : { timestamp: at }), ...(attachments.length ? { attachments } : {}) });
    }
    return result;
  };
  const finish = async result => {
    if (preview) return result;
    const MAX_BYTES = 32 * 1024 * 1024, MAX_ATTACHMENTS = 20;
    let total = new TextEncoder().encode(result.messages.map(message => message.text).join('')).byteLength, count = 0;
    if (total > MAX_BYTES) throw new Error('聊天文本超过 32 MiB 迁移限制，请缩小会话内容后重试。');
    const deadline = Date.now() + 30000;
    const fetched = new Map();
    for (const message of result.messages) {
      for (const item of message.attachments ?? []) {
        const source = item.localSource ?? item.url;
        delete item.localSource;
        if (!source) { result.warnings.push('部分附件没有可访问的文件来源，已保留名称。'); continue; }
        if (fetched.has(source)) { const cached = fetched.get(source); if (total + cached.size <= MAX_BYTES) { Object.assign(item, cached.saved); total += cached.size; } else result.warnings.push('重复引用的附件加上聊天文本已超过 32 MiB 总限制，部分附件仅保留原引用。'); continue; }
        const sourceUrl = new URL(source, url);
        const permitted = sourceUrl.protocol === 'data:' || sourceUrl.protocol === 'blob:' && sourceUrl.origin === location.origin || sourceUrl.protocol === 'https:' && !sourceUrl.username && !sourceUrl.password && !sourceUrl.port && (sourceUrl.hostname === 'deepseek.com' || sourceUrl.hostname.endsWith('.deepseek.com') || sourceUrl.hostname === 'files.deepseeksvc.com');
        if (++count > MAX_ATTACHMENTS || !permitted || Date.now() >= deadline) { result.warnings.push('部分附件仅保留引用：超出获取数量或不属于 DeepSeek 的可访问附件来源。'); continue; }
        let timer;
        try {
          const controller = new AbortController();
          timer = setTimeout(() => controller.abort(), Math.min(8000, deadline - Date.now()));
          const response = await fetch(source, { credentials: 'include', signal: controller.signal });
          if (!response.ok) throw new Error('附件请求失败');
          if (Number(response.headers.get('content-length')) > MAX_BYTES - total) throw new Error('附件超过大小限制');
          const reader = response.body?.getReader();
          if (!reader) throw new Error('附件无法读取');
          const chunks = []; let size = 0;
          try {
            while (true) {
              const { done, value } = await reader.read(); if (done) break;
              size += value.byteLength;
              if (size > MAX_BYTES - total) { await reader.cancel(); throw new Error('附件超过大小限制'); }
              chunks.push(value);
            }
          } finally { reader.releaseLock(); }
          const bytes = new Uint8Array(size); let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
          let binary = '';
          for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
          const saved = { data: btoa(binary), mediaType: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream' };
          Object.assign(item, saved); fetched.set(source, { saved, size }); total += size;
        } catch { result.warnings.push('部分附件无法获取或超过 32 MiB 总限制，已保留可用的原网页引用；访问可能需要登录。'); }
        finally { clearTimeout(timer); }
      }
      if (message.attachments?.some(item => item.data === undefined && !item.url)) result.warnings.push('部分本地图片或附件无法获取且没有可迁移的网页引用，已保留名称。');
    }
    result.warnings = [...new Set(result.warnings)];
    return result;
  };
  // Only explicit, embedded JSON is inspected. The current URL's conversation
  // identity must match when a page contains multiple conversations.
  const candidates = [];
  let visited = 0;
  const visit = (value, depth) => {
    if (!value || typeof value !== 'object' || depth > 12 || ++visited > 10000) return;
    if (!Array.isArray(value) && Array.isArray(value.messages) && value.messages.some(item => ['user', 'assistant'].includes(String(item?.role).toLowerCase()))) candidates.push(value);
    for (const [key, item] of Object.entries(value)) if (!['messages', 'tokens', 'credentials', 'access_token'].includes(key) && item && typeof item === 'object') visit(item, depth + 1);
  };
  for (const script of document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__')) {
    if ((script.textContent?.length ?? 0) > 8_000_000) continue;
    try { visit(JSON.parse(script.textContent), 0); } catch { /* Ignore unrelated or incomplete embedded data. */ }
  }
  const conversationId = location.pathname.match(/^\/a\/[^/]+\/s\/([^/?#]+)/)?.[1] ?? location.pathname.match(/^\/(?:chat|c)\/([^/?#]+)/)?.[1] ?? location.pathname.match(/^\/a\/([^/?#]+)\/?$/)?.[1];
  const matching = candidates.filter(item => conversationId && String(item.conversation_id ?? item.chat_session_id ?? item.id ?? '') === conversationId);
  const candidate = matching.length === 1 ? matching[0] : candidates.length === 1 && (!conversationId || !candidates[0].conversation_id && !candidates[0].chat_session_id && !candidates[0].id) ? candidates[0] : null;
  if (candidate) {
    const messages = normalize(candidate.messages);
    if (messages.length) {
      if (!(candidate.complete === true || candidate.has_more === false || candidate.hasMore === false)) warnings.push('网页提供了结构化消息，但未声明历史完整；请核对消息数量。');
      if (candidate.has_more === true || candidate.hasMore === true) warnings.push('网页数据明确还有未加载的消息，当前仅迁移已提供的部分。');
      return finish({ url, title: clean(candidate.title ?? document.title) || 'DeepSeek 会话', messages, warnings: [...new Set(warnings)] });
    }
  }
  // Verified against the public DeepSeek main.8d6a4f4bfa.js: uS owns the
  // .ds-message host and receives sessionId/messageId. gA (user) receives the
  // full content and bubbleElRef; iL (assistant) receives its exact Markdown
  // content and stable ds-assistant-message-main-content class. Read only the
  // currently rendered message's owner/descendant memoizedProps, never stores,
  // hooks, credentials or unrelated conversation trees.
  const fiberFor = element => {
    const key = Object.keys(element).find(name => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'));
    return key ? element[key] : null;
  };
  const officialMessage = root => {
    const fiber = fiberFor(root);
    let owner, index, loading = false;
    for (let current = fiber, depth = 0; current && depth < 7; current = current.return, depth++) {
      const props = current.memoizedProps;
      if (props?.sessionId && props.messageId != null) {
        if (!owner) owner = { sessionId: String(props.sessionId), messageId: String(props.messageId) };
        if (String(props.sessionId) !== owner.sessionId || String(props.messageId) !== owner.messageId) break;
        if (Number.isSafeInteger(props.index)) index = props.index;
      }
    }
    if (!owner || conversationId && owner.sessionId !== conversationId) return null;
    let message, userContent, assistantContent;
    const files = [], seen = new Set(), stack = fiber?.child ? [fiber.child] : [];
    let count = 0;
    while (stack.length && ++count <= 3000) {
      const current = stack.pop();
      if (seen.has(current)) continue; seen.add(current);
      if (current.sibling) stack.push(current.sibling);
      if (current.child) stack.push(current.child);
      const props = current.memoizedProps;
      if (!props || typeof props !== 'object') continue;
      const sameOwner = String(props.sessionId ?? owner.sessionId) === owner.sessionId && String(props.messageId ?? owner.messageId) === owner.messageId;
      if (!sameOwner) continue;
      if (typeof props.content === 'string' && props.className === 'ds-assistant-message-main-content') assistantContent = props.content;
      if (typeof props.content === 'string' && props.bubbleElRef && props.sessionId && props.messageId != null) userContent = props.content;
      const supplied = props.message ?? props.conversation;
      if (supplied && String(supplied.id ?? supplied.message_id) === owner.messageId && ['USER', 'ASSISTANT', 'user', 'assistant'].includes(supplied.role) && Array.isArray(supplied.fragments)) message = supplied;
      if (Array.isArray(props.fileList) && props.sessionId && props.messageId != null) files.push(...props.fileList);
      if (props.loading === true || props.wip === true || props.hasPendingFragment === true || props.has_more === true || props.hasMore === true) loading = true;
    }
    if (message) {
      const normalized = normalize([message])[0];
      if (normalized) return { message: normalized, index, loading };
    }
    const role = assistantContent !== undefined || root.querySelector('.ds-assistant-message-main-content') ? 'assistant' : userContent !== undefined ? 'user' : null;
    if (!role) return null;
    const text = role === 'assistant' ? assistantContent : userContent;
    const attachments = files.map(nativeFile).filter(Boolean);
    return { message: { role, text: typeof text === 'string' ? text : null, sourceMessageId: owner.messageId, ...(attachments.length ? { attachments } : {}) }, index, loading };
  };
  const nativeRoots = () => Array.from(document.querySelectorAll('.ds-message')).filter(root => !root.parentElement?.closest('.ds-message'));
  const nativeHistory = new Map();
  const collectNative = () => {
    for (const root of nativeRoots()) {
      const item = officialMessage(root);
      if (item) {
        // The exact stable assistant body also permits semantic DOM fallback
        // when React content is unavailable; no user role is guessed by absence.
        if (item.message.text === null && item.message.role === 'assistant') item.dom = root.querySelector('.ds-assistant-message-main-content');
        nativeHistory.set(item.message.sourceMessageId, item);
      }
    }
  };
  const firstNative = nativeRoots()[0];
  if (firstNative) {
    let scroll = firstNative.parentElement;
    while (scroll && scroll !== document.body) {
      const style = getComputedStyle(scroll);
      if (/(auto|scroll)/.test(style.overflowY) && scroll.clientHeight > 0 && scroll.scrollHeight > scroll.clientHeight) break;
      scroll = scroll.parentElement;
    }
    const viewport = !preview && scroll && scroll !== document.body ? scroll : null;
    const originalScroll = viewport?.scrollTop;
    const deadline = Date.now() + 15000;
    const settle = () => new Promise(resolve => setTimeout(resolve, 100));
    const checkPage = () => { if (location.href !== url) throw new Error('读取期间切换了网页会话，请在目标会话中重试。'); };
    try {
      if (viewport) {
        viewport.scrollTop = 0; viewport.dispatchEvent(new Event('scroll', { bubbles: true })); await settle();
        for (let earlier = 0; earlier < 3; earlier++) {
          const button = Array.from(viewport.querySelectorAll('button')).find(node => !node.disabled && /^(?:加载(?:更早|更多)(?:的)?消息|Load (?:earlier|more) messages)$/i.test((node.getAttribute('aria-label') || node.textContent).trim()) && getComputedStyle(node).display !== 'none');
          if (!button) break;
          checkPage(); button.click(); await new Promise(resolve => setTimeout(resolve, 400));
          warnings.push('已通过网页的加载更早消息操作尝试补全历史；仍需核对网页未加载的部分。');
        }
      }
      for (let step = 0; step < 120; step++) {
        checkPage(); collectNative();
        if (!viewport || viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2) break;
        if (Date.now() >= deadline) { warnings.push('历史较长，滚动收集已达到时间限制；迁移可能缺少部分消息。'); break; }
        const before = viewport.scrollTop;
        viewport.scrollTop = Math.min(viewport.scrollHeight - viewport.clientHeight, before + Math.max(1, viewport.clientHeight * .75));
        viewport.dispatchEvent(new Event('scroll', { bubbles: true })); await settle();
        if (viewport.scrollTop === before) break;
        if (step === 119) warnings.push('历史较长，滚动收集已达到步数限制；迁移可能缺少部分消息。');
      }
      collectNative();
    } finally {
      if (viewport && location.href === url) { viewport.scrollTop = originalScroll; viewport.dispatchEvent(new Event('scroll', { bubbles: true })); }
    }
    if (Array.from(nativeHistory.values()).some(item => item.loading)) warnings.push('网页仍在生成回复或加载历史，当前仅迁移已经获取的部分消息。');
    warnings.push('已读取当前网页分支并尝试滚动收集历史；网页未提供可核验的完整历史声明，迁移可能仍缺少未加载的消息。');
  }
  const roleSelector = '[data-message-role="user"],[data-message-role="assistant"],[data-role="user"],[data-role="assistant"],[data-author="user"],[data-author="assistant"],.ds-message--user,.ds-message--assistant';
  const hidden = node => {
    if (node.nodeType !== 1) return false;
    if (node.hidden || node.getAttribute('aria-hidden') === 'true') return true;
    const style = getComputedStyle(node);
    return style.display === 'none' || style.visibility === 'hidden';
  };
  const markdown = node => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1 || hidden(node) || node.matches('button,svg,script,style,[data-thinking],[data-role="reasoning"],[data-message-role="reasoning"]')) return '';
    const tag = node.tagName.toLowerCase();
    const children = () => Array.from(node.childNodes).map(markdown).join('');
    if (tag === 'pre') {
      const code = node.querySelector('code') ?? node;
      const language = code.className?.match(/(?:language-|lang-)([\w+-]+)/)?.[1] ?? '';
      const text = code.textContent.replace(/\n$/, '');
      const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map(run => run.length + 1)));
      return '\n\n' + fence + language + '\n' + text + '\n' + fence + '\n\n';
    }
    if (tag === 'code') { const text = children(); const fence = '`'.repeat(Math.max(1, ...(text.match(/`+/g) ?? []).map(run => run.length + 1))); return fence + (text.includes('`') ? ' ' : '') + text + (text.includes('`') ? ' ' : '') + fence; }
    if (tag === 'br') return '\n';
    if (tag === 'a') { const href = safeUrl(node.getAttribute('href')); const text = clean(children()); return href ? `[${text || href}](${href})` : text; }
    if (tag === 'img') { const href = safeUrl(node.getAttribute('src')); return href ? `![${node.getAttribute('alt') ?? ''}](${href})` : ''; }
    if (/^h[1-6]$/.test(tag)) return '\n\n' + '#'.repeat(Number(tag[1])) + ' ' + clean(children()) + '\n\n';
    if (['strong', 'b'].includes(tag)) return '**' + children() + '**';
    if (['em', 'i'].includes(tag)) return '*' + children() + '*';
    if (tag === 'li') { const ordered = node.parentElement?.tagName === 'OL'; return '\n' + (ordered ? `${Array.from(node.parentElement.children).indexOf(node) + 1}. ` : '- ') + clean(children()); }
    if (tag === 'blockquote') return '\n\n' + clean(children()).split('\n').map(line => '> ' + line).join('\n') + '\n\n';
    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll('tr')).map(row => Array.from(row.children).filter(cell => ['TH', 'TD'].includes(cell.tagName)).map(cell => clean(markdown(cell)).replace(/\|/g, '\\|').replace(/\n/g, '<br>')));
      if (!rows.length) return '';
      return '\n\n' + [rows[0], rows[0].map(() => '---'), ...rows.slice(1)].map(row => '| ' + row.join(' | ') + ' |').join('\n') + '\n\n';
    }
    const text = children();
    return ['p', 'div', 'section', 'ul', 'ol'].includes(tag) ? '\n\n' + text + '\n\n' : text;
  };
  const hiddenTree = node => { for (let current = node; current; current = current.parentElement) if (hidden(current)) return true; return false; };
  const messages = Array.from(nativeHistory.values()).sort((a, b) => Number.isSafeInteger(a.index) && Number.isSafeInteger(b.index) ? a.index - b.index : 0).map(item => ({ ...item.message, text: typeof item.message.text === 'string' ? item.message.text.replace(/\r\n/g, '\n') : clean(item.dom ? markdown(item.dom) : '').replace(/\n{3,}/g, '\n\n') })).filter(item => item.text.trim() || item.attachments?.length);
  const roots = Array.from(document.querySelectorAll(roleSelector)).filter(node => !node.closest('.ds-message') && !node.parentElement?.closest(roleSelector) && !hiddenTree(node));
  for (const root of roots) {
    const role = root.getAttribute('data-message-role') ?? root.getAttribute('data-role') ?? root.getAttribute('data-author') ?? (root.classList.contains('ds-message--user') ? 'user' : 'assistant');
    const content = root.querySelector('[data-message-content],.ds-markdown,.markdown-body') ?? root;
    const text = clean(markdown(content)).replace(/\n{3,}/g, '\n\n');
    const attachments = Array.from(root.querySelectorAll('a[download],a[data-attachment],img[src]')).map(node => attachment({ url: node.getAttribute('href') ?? node.getAttribute('src'), name: node.getAttribute('download') ?? node.getAttribute('alt') ?? node.textContent })).filter(Boolean);
    if (text || attachments.length) messages.push({ role, text, ...(root.dataset.messageId || root.id ? { sourceMessageId: root.dataset.messageId || root.id } : {}), ...(attachments.length ? { attachments } : {}) });
  }
  if (!messages.length && !preview) throw new Error('未找到可识别的聊天消息。请打开已有会话，等待消息加载后重试；网页结构变化时可能需要更新插件。');
  warnings.push('当前使用网页中已加载的消息；虚拟列表、折叠内容或尚未加载的历史可能缺失，请先检查预览。');
  if (document.querySelector('[data-thinking],[data-role="reasoning"],[data-message-role="reasoning"]')) warnings.push('思考过程未作为回复历史迁移。');
  return finish({ url, title: clean(document.title) || 'DeepSeek 会话', messages, warnings: [...new Set(warnings)] });
}
/** keepNames builds add __name inside serialized functions; seat the harmless
 * naming helper in the guest rather than leaking the bundler's outer scope. */
export function pageFunctionScript(fn, args = {}) {
  return `(()=>{const __name=(fn)=>fn;return (${fn.toString()})(${JSON.stringify(args)})})()`;
}
export const extractionScript = pageFunctionScript(extractConversationFromPage);
