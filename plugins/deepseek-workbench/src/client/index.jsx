import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { CHAT_URL, PLATFORM_URL, createBrowserAdapter, httpUrl } from './browser-adapter.mjs';
import { extractionScript } from './extraction.mjs';
import { NativeChat } from './native-chat.jsx';
import { NativePlatformPage } from './platform-page.jsx';
import { statusScript, previewScript, commandScript } from './native-chat-bridge.mjs';
import { initializeHostCapabilities } from './host-capabilities.mjs';
import css from './style.css';
import nativeCss from './native-chat.css';
import { installTemporarySidebar } from './temporary-sidebar.jsx';
import { recoverTemporaryChats, liveTemporaryOwners } from './temporary-web.mjs';

export const inject = ['slots'];
export const PANEL_ID = 'dsh-deepseek-workbench/chat';
export const FALLBACK_ACCOUNT_ID = 'deepseek-workbench-account';
const identity = Symbol.for('dsh.deepseek-workbench.client');
async function api(path, value, signal) {
  const response = await fetch(`deepseek-workbench/api${path}`, value === undefined ? { signal } : { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  let data;
  try { data = await response.json(); } catch { throw new Error(`服务返回了无效响应 (${response.status})。`); }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function service(ctx, name) { try { return ctx.get?.(name) ?? ctx[name]; } catch { return undefined; } }
function Icon({ size = 16 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/></svg>; }
function external(url) { if (httpUrl(url)) window.open(url, '_blank', 'noopener,noreferrer'); }
function useBackendState(enabled = true) {
  const [state, setState] = useState({ loading: true, error: '', enabled: false });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ loading: true, error: '', enabled: false });
    api('/state', undefined, controller.signal).then(data => { if (!controller.signal.aborted) setState({ ...data, loading: false, error: '' }); }, error => { if (!controller.signal.aborted) setState({ loading: false, enabled: false, error: error.message }); });
    return () => controller.abort();
  }, [revision, enabled]);
  return [state, () => setRevision(value => value + 1)];
}
function WarningList({ warnings }) { return warnings?.length ? <div className="dswb-notice" role="status">{warnings.map((text, index) => <p key={index}>{text}</p>)}</div> : null; }
export function BrowserPage({ ctx, url = CHAT_URL, workspace = 'deepseek-workbench', chat = true, native = false, temporary, ownerSignal, notify = () => {} }) {
  const container = useRef(null), adapter = useRef(null), alive = useRef(true), generation = useRef(0), draft = useRef(null);
  const [frame, setFrame] = useState({ loading: true, ready: false, url, warnings: [] });
  const [revision, setRevision] = useState(0), [operation, setOperation] = useState(''), [error, setError] = useState('');
  const imported = useRef(null), lastLoginState = useRef('');
  const [backend, retryBackend] = useBackendState(chat);
  const verificationStarted = useRef(false), cleanupRecovery = useRef(false);
  useEffect(() => {
    if (temporary || !native || !backend.demoVerify || !frame.ready || frame.loading || verificationStarted.current) return;
    verificationStarted.current = true;
    const report = value => api('/verification-result', value).catch(() => {});
    void (async () => {
      try {
        const page = adapter.current;
        if (!(await page.extract(statusScript)).ready) throw Error('验证需要已登录的网页账号');
        await page.navigate(CHAT_URL + 'a/chat');
        const deadline = Date.now() + 90000;
        const wait = () => new Promise(resolve => setTimeout(resolve, 1000));
        while (!(await page.extract(statusScript)).ready) { if (Date.now() >= deadline) throw Error('新对话加载超时'); await wait(); }
        const text = 'DSH 工作台连通测试 ' + crypto.randomUUID() + '。请仅回复：连接成功。';
        const sent = await page.extract(commandScript({ type: 'send', text }));
        if (!sent?.accepted) throw Error(sent?.error || '官网尚未确认发送。');
        await report({ phase: 'sent' });
        while (true) {
          const status = await page.extract(statusScript), conversation = await page.extract(previewScript);
          if (conversation.messages.some(message => message.role === 'assistant' && message.text.trim()) && !status.generating) break;
          if (Date.now() >= deadline) throw Error('官方回复等待超时'); await wait();
        }
        await report({ phase: 'reply' });
        const conversation = await page.extract(extractionScript);
        if (conversation.messages[0]?.role !== 'user' || conversation.messages[0]?.text !== text) throw Error('验证会话边界不匹配，停止迁移');
        const result = await api('/import', { requestId: crypto.randomUUID(), conversation });
        await report({ phase: 'imported', sessionId: result.sessionId });
        await openImported(result, generation.current);
      } catch (failure) { await report({ phase: 'failed', error: failure.message }); }
    })();
  }, [native, backend.demoVerify, frame.ready, frame.loading]);
  useLayoutEffect(() => {
    alive.current = true;
    ++generation.current;
    const controller = new AbortController();
    const abort = () => { alive.current = false; ++generation.current; controller.abort(); };
    ownerSignal?.addEventListener('abort', abort, { once: true });
    if (ownerSignal?.aborted) controller.abort();
    setFrame({ loading: true, ready: false, url, warnings: [] });
    setError(''); setOperation('');
    createBrowserAdapter({ bridge: window.dshDesktop?.browser, container: container.current, workspace, url, signal: controller.signal, onState: value => { temporary?.observe(value.url); setFrame(value); } }).then(value => { if (!controller.signal.aborted) { adapter.current = value; if (temporary) { temporary.adapter = value; if (temporary.closed) void value?.dispose(); } } }, failure => { if (!controller.signal.aborted) { setFrame(old => ({ ...old, loading: false })); setError(failure.message); } });
    return () => { alive.current = false; ++generation.current; ownerSignal?.removeEventListener('abort', abort); if (temporary && !temporary.closed && adapter.current) {
      const page = adapter.current, holding = document.createElement('div');
      holding.hidden = true; document.body.append(holding); holding.append(page.element);
      void temporary.close().catch(failure => console.error('临时网页聊天清理待重试:', failure.message)).finally(() => { liveTemporaryOwners.delete(temporary.token); controller.abort(); holding.remove(); });
    } else controller.abort(); adapter.current = null; };
  }, [url, workspace, revision, ownerSignal]);
  const openImported = async (result, ticket) => {
    const sessions = service(ctx, 'sessions'), workspaceUI = service(ctx, 'uiWorkspace');
    if (typeof sessions?.refresh !== 'function' || typeof workspaceUI?.openSession !== 'function') throw new Error('会话已迁移，但当前宿主没有提供会话导航接口。请从历史列表中打开“' + result.title + '”。');
    await sessions.refresh();
    if (alive.current && generation.current === ticket) workspaceUI.openSession(result.sessionId);
  };
  const extract = async () => {
    if (temporary || operation) return;
    const ticket = generation.current;
    const current = () => alive.current && generation.current === ticket;
    setOperation('extract'); setError('');
    try {
      const conversation = await adapter.current.extract(extractionScript);
      if (!current()) return;
      if (!conversation?.messages?.length) throw new Error('未找到可以迁移的消息。');
      const fingerprint = JSON.stringify(conversation);
      if (imported.current?.fingerprint === fingerprint) { await openImported(imported.current.result, ticket); return; }
      if (JSON.stringify(draft.current?.conversation) !== fingerprint) draft.current = { requestId: crypto.randomUUID(), conversation };
      setOperation('import');
      const result = await api('/import', draft.current);
      if (!current()) return;
      imported.current = { result, fingerprint };
      notify({ title: '已创建 DSH 会话：' + result.title, warnings: result.warnings ?? conversation.warnings });
      await openImported(result, ticket);
    } catch (failure) { if (current()) setError(failure.message); }
    finally { if (current()) setOperation(''); }
  };
  const retry = () => { setError(''); if (chat) retryBackend(); if (frame.ready) adapter.current?.reload(); else setRevision(value => value + 1); };
  if (native) return <NativeChat temporary={temporary} frame={frame} adapter={adapter} guest={<div className="dswb-viewport" ref={container} aria-busy={frame.loading}/>}
    error={error || (backend.error ? '迁移服务不可用：' + backend.error : '')} setError={setError} onImport={extract} importing={operation === 'extract' ? '读取消息…' : operation === 'import' ? '正在迁移…' : ''}
    canImport={frame.ready && !frame.loading && !operation && backend.enabled} retry={retry} onExternal={() => external(frame.url || url)} warnings={<WarningList warnings={[...frame.warnings, ...(!backend.loading && !backend.error && !backend.enabled ? ['迁移服务已停用，请启用 DeepSeek Workbench 插件后重试。'] : [])]}/>}
    onStatus={value => {
      if (!temporary && value.ready && adapter.current && !cleanupRecovery.current) { cleanupRecovery.current = true; void recoverTemporaryChats(adapter.current, localStorage, liveTemporaryOwners).catch(failure => setError('上次临时对话清理失败：' + failure.message)); }
      if (!backend.demoOpen) return; const state = { ready: value.ready === true, signIn: value.signIn === true };
      const key = JSON.stringify(state); if (key !== lastLoginState.current) { lastLoginState.current = key; void api('/login-state', state).catch(() => {}); } }}/ >;
  return <div className="dswb-page" data-deepseek-workbench={chat ? 'chat' : 'platform'}>
    <div className="dswb-toolbar" role="toolbar" aria-label={chat ? 'DeepSeek 网页聊天' : 'API 开放平台'}>
      <button type="button" title="后退" aria-label="后退" disabled={!frame.canGoBack} onClick={() => adapter.current?.back()}>←</button>
      <button type="button" title="前进" aria-label="前进" disabled={!frame.canGoForward} onClick={() => adapter.current?.forward()}>→</button>
      <button type="button" title="重新加载" aria-label="重新加载" onClick={retry}>↻</button>
      <span className="dswb-address" title={frame.url}>{frame.title || (chat ? 'DeepSeek 网页聊天' : 'DeepSeek API 开放平台')}</span>
      <button type="button" title="在外部浏览器打开" aria-label="在外部浏览器打开" onClick={() => external(frame.url || url)}>↗</button>
      {chat && <button type="button" className="dswb-primary" disabled={!frame.ready || frame.loading || operation !== '' || !backend.enabled} onClick={extract}>{operation === 'extract' ? '读取消息…' : operation === 'import' ? '正在迁移…' : '在 DSH 中继续'}</button>}
    </div>
    <WarningList warnings={frame.warnings}/>
    {chat && backend.error && <div className="dswb-error" role="alert">迁移服务不可用：{backend.error} <button type="button" onClick={retryBackend}>重试</button></div>}
    {chat && !backend.loading && !backend.error && !backend.enabled && <div className="dswb-notice" role="status">迁移服务已停用，请启用 DeepSeek Workbench 插件后重试。</div>}
    {(error || frame.error) && <div className="dswb-error" role="alert">{error || frame.error} <button type="button" onClick={retry}>重新打开</button></div>}
    <div className="dswb-viewport" ref={container} aria-busy={frame.loading}/>
    {frame.loading && <div className="dswb-loading" role="status">正在加载网页…</div>}
  </div>;
}
function ChatMain({ ctx, notify, ownerSignal }) {
  const [url] = useState(() => {
    const saved = sessionStorage.getItem('dswb-last-chat');
    return typeof saved === 'string' && /^https:\/\/chat\.deepseek\.com\/a\/[^?#]+$/.test(saved) ? saved : CHAT_URL;
  });
  return <BrowserPage ctx={ctx} url={url} native notify={notify} ownerSignal={ownerSignal}/>;
}
function AccountPanel({ ctx, platform }) {
  const [open, setOpen] = useState(() => Boolean(platform.pending)), id = useId();
  useEffect(() => {
    const reveal = () => setOpen(true);
    platform.open = reveal;
    if (platform.pending) { platform.pending = false; reveal(); }
    return () => { if (platform.open === reveal) platform.open = null; };
  }, [platform]);
  const nativePlatform = typeof window.dshPlatform?.open === 'function';
  return <section className="dswb-account" aria-label="DeepSeek API 开放平台"><div className="dswb-account-heading"><div><h3>DeepSeek API 开放平台</h3><p>{nativePlatform ? '复用 DSH 当前 DeepSeek 账号，查看用量、余额与开放平台。' : '当前宿主没有 DSH 桌面账号接口，使用独立网页登录；这与聊天网页登录相互独立。'}</p></div><button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{open ? '收起' : '打开'}</button></div>
    {open && <div id={id} className="dswb-account-browser">{nativePlatform ? <NativePlatformPage/> : <BrowserPage ctx={ctx} url={PLATFORM_URL} chat={false}/>}</div>}
  </section>;
}
/** Stable public settings/sidebar wrappers constrain fallback DOM portals. */
export function findAccountRoot(doc = document) {
  const settings = doc.querySelector('[data-shortcut-modal="settings"]');
  const section = settings?.querySelector('[data-slot="settings.section"]');
  if (!section) return null;
  // The native AccountSection (signed in or signed out) identifies itself by
  // its localized accessible name. Never treat an arbitrary _section as an
  // account page, and never depend on the bundler's generated class prefix.
  return Array.from(section.querySelectorAll('section[aria-label]')).find(root => {
    const label = root.getAttribute('aria-label');
    return ['账号', 'Account'].includes(label) && root.closest('[data-slot="settings.section"]') === section && !root.closest('[data-deepseek-workbench-portal]');
  }) ?? null;
}
export function findNewSessionAnchor(doc = document) {
  const sidebar = doc.querySelector('[data-slot="sidebar"]') ?? doc.querySelector('[data-omd-surface="sidebar"]');
  if (!sidebar) return null;
  const marked = sidebar.querySelector('button[data-omd-nav-part="create"]');
  if (marked) return marked;
  return Array.from(sidebar.querySelectorAll('button[class]')).find(button => Array.from(button.classList).some(token => token.endsWith('_newSession'))) ?? null;
}
function PortalSurfaces({ ctx, openChat, notices, platform }) {
  const [notice, setNotice] = useState(null);
  useEffect(() => { notices.publish = setNotice; return () => { notices.publish = () => {}; }; }, [notices]);
  const [targets, setTargets] = useState({ account: null, sidebar: null });
  useEffect(() => {
    let stopped = false, queued = false;
    const own = new Map();
    const reconcile = () => {
      queued = false; if (stopped) return;
      const account = findAccountRoot(), anchor = findNewSessionAnchor();
      const next = {};
      for (const [kind, root] of [['account', account], ['sidebar', anchor]]) {
        const current = own.get(kind);
        if (current?.root !== root || !current?.container.isConnected) {
          current?.container.remove(); own.delete(kind);
          if (root) {
            const container = document.createElement('div'); container.dataset.deepseekWorkbenchPortal = kind;
            if (kind === 'sidebar') root.after(container); else root.append(container);
            own.set(kind, { root, container });
          }
        }
        next[kind] = own.get(kind)?.container ?? null;
      }
      setTargets(old => old.account === next.account && old.sidebar === next.sidebar ? old : next);
    };
    const observer = new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(reconcile); } });
    observer.observe(document.body, { childList: true, subtree: true }); reconcile();
    return () => { stopped = true; observer.disconnect(); for (const entry of own.values()) entry.container.remove(); };
  }, []);
  return <>{notice && createPortal(<div className="dswb-toast" role={notice.error ? "alert" : "status"}><div><strong>{notice.title}</strong><button type="button" aria-label="关闭迁移通知" onClick={() => setNotice(null)}>×</button></div><WarningList warnings={notice.warnings}/></div>, document.body)}{targets.account && createPortal(<AccountPanel ctx={ctx} platform={platform}/>, targets.account)}{targets.sidebar && createPortal(<SidebarEntry openChat={openChat}/>, targets.sidebar)}</>;
}
export function accountSettingsAction(ctx) {
  const entries = ctx.slots?.entries?.('settings.section');
  const sectionId = entries?.some(row => row.options?.id === 'account') ? 'account' : entries?.some(row => row.options?.id === FALLBACK_ACCOUNT_ID) ? FALLBACK_ACCOUNT_ID : 'account';
  const settings = service(ctx, 'uiSettings');
  if (typeof settings?.openSection === 'function') return () => settings.openSection(sectionId);
  // DSH rc.1/rc.2 expose the native root settings store only through its public
  // Slot entry (no uiSettings service). Its create() returns the existing
  // singleton; no replacement component or store is installed.
  const entry = ctx.slots?.entriesOfSlot?.('sidebar.settings')?.find(row => row.locale === 'settings' && row.component?.name === 'SettingsRoot' && typeof row.store?.create === 'function');
  const instance = entry?.store.create();
  const snapshot = instance?.getSnapshot?.();
  if (snapshot && typeof snapshot.open === 'boolean' && typeof instance.actions?.openSection === 'function') return () => instance.actions.openSection(sectionId);
  throw new Error('当前宿主未提供原生账号页导航接口。请在设置中打开账号页的 DeepSeek API 开放平台。');
}
function waitForPlatform(signal) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => { observer.disconnect(); clearTimeout(timer); signal.removeEventListener('abort', abort); };
    const check = () => { if (document.querySelector('[data-deepseek-workbench="platform"]')) { cleanup(); resolve(); } };
    const abort = () => { cleanup(); reject(new Error('插件已停用。')); };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(() => { cleanup(); reject(new Error('原生账号页尚不可用。请先完成 DSH 桌面账号登录，再从账号页打开开放平台。')); }, 4000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else check();
  });
}
function SidebarEntry({ openChat }) {
  const [error, setError] = useState('');
  return <><button type="button" className="dswb-sidebar-entry" title="DeepSeek 网页聊天" aria-label="DeepSeek 网页聊天" onClick={() => { try { if (!openChat.current) throw new Error('当前宿主尚未提供原生内容标签页，请等待会话加载后重试。'); openChat.current(); setError(''); } catch (failure) { setError(failure.message); } }}><Icon/><span>DeepSeek 网页聊天</span></button>{error && <div className="dswb-sidebar-error" role="alert">{error}</div>}</>;
}
function mountClient(ctx) {
  let stopped = false;
  const bindings = new Set();
  const keep = dispose => { let active = true; const stop = () => { if (!active) return; active = false; bindings.delete(stop); dispose?.(); }; bindings.add(stop); return stop; };
  const openChat = { current: null }, notices = { publish: () => {} }, platform = { pending: false, open: null };
  const notify = value => notices.publish(value);
  const style = document.createElement('style'); style.dataset.plugin = 'dsh-deepseek-workbench'; style.textContent = css + nativeCss; document.head.append(style);
    const host = document.createElement('div'); host.dataset.deepseekWorkbenchRoot = ''; document.body.append(host);
    const root = createRoot(host); root.render(<PortalSurfaces ctx={ctx} openChat={openChat} notices={notices} platform={platform}/>);
    const lifetime = new AbortController();
    const openRequested = async event => {
      const page = event.detail?.page;
      if (!['chat', 'platform'].includes(page)) return;
      try {
        if (page === 'chat') {
          if (!openChat.current) throw new Error('当前宿主尚未提供原生内容标签页，请等待会话加载后重试。');
          openChat.current();
        } else {
          const openAccount = accountSettingsAction(ctx);
          platform.pending = true; platform.open?.();
          await openAccount();
          await waitForPlatform(lifetime.signal);
          platform.pending = false;
        }
      } catch (error) { platform.pending = false; if (!lifetime.signal.aborted) notify({ title: error.message, error: true }); }
    };
    window.addEventListener('deepseek-workbench:open', openRequested);
  const stopUI = () => { lifetime.abort(); window.removeEventListener('deepseek-workbench:open', openRequested); root.unmount(); host.remove(); style.remove(); };
  const installMain = scope => {
    if (stopped) return () => {};
    const diagnostics = new AbortController();
    const abortDiagnostics = () => diagnostics.abort();
    lifetime.signal.addEventListener('abort', abortDiagnostics, { once: true });
    const disposeSlot = ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, () => <ChatMain ctx={scope} notify={notify} ownerSignal={lifetime.signal}/>));
    const open = () => {
      scope.layout.selectPanel(PANEL_ID);
      queueMicrotask(() => {
        if (stopped || lifetime.signal.aborted || openChat.current !== open) return;
        const selected = scope.layout.panelInfo?.getSnapshot?.();
        if (selected && selected.activePanelId !== PANEL_ID) return;
        const frame = document.querySelector('[data-omd-surface="frame"]'), root = document.documentElement;
        const layout = root.dataset.omdLayout;
        const maxWidth = layout === 'google-material-expressive' ? 839 : ['ios-liquid', 'codex-desktop', 'claude-cli-terminal'].includes(layout) ? 600 : !layout && root.classList.contains('trisoul-shell') ? 719 : null;
        // Native layout actions release their own overlays and inert leases.
        if (maxWidth !== null && matchMedia(`(max-width: ${maxWidth}px)`).matches && frame && frame.dataset.sidebarCollapsed !== 'true'
          && !frame.hasAttribute('data-rightbar-fullscreen') && typeof scope.layout.toggleSidebar === 'function') scope.layout.toggleSidebar();
      });
    }; openChat.current = open;
    void initializeHostCapabilities({ api, signal: diagnostics.signal,
      onState: state => { if (state.demoOpen) open(); },
      readCapabilities: () => window.dshDesktop?.browser?.capabilities?.(),
      readNativeAccountView: () => typeof window.dshPlatform?.open === 'function',
    }).catch(error => { if (!diagnostics.signal.aborted) console.error('Workbench capability initialization failed', error); });
    return keep(() => { abortDiagnostics(); lifetime.signal.removeEventListener('abort', abortDiagnostics); if (openChat.current === open) openChat.current = null; disposeSlot?.(); });
  };
  if (typeof ctx.inject === 'function') { ctx.inject(['layout'], installMain); ctx.inject(['sidebarRight', 'sidebarRightTabs', 'commandUi'], scope => { installTemporarySidebar(scope, BrowserPage); }); }
  else if (ctx.layout) installMain(ctx);
  if (typeof ctx.slots.inject === 'function') ctx.slots.inject('settings.section', () => {
    if (stopped) return () => {};
    let own;
    const sync = () => {
      const entries = ctx.slots.entries?.('settings.section');
      if (!entries) return;
      if (entries.some(row => row.options?.id === 'account')) { const remove = own; own = null; remove?.(); }
      else if (!own && !entries.some(row => row.options?.id === FALLBACK_ACCOUNT_ID)) own = ctx.slots.register({ name: 'settings.section', id: FALLBACK_ACCOUNT_ID, order: -9, label: () => '账号' }, () => <div data-deepseek-workbench-account={FALLBACK_ACCOUNT_ID}><AccountPanel ctx={ctx} platform={platform}/><p className="dswb-help">此页提供 DeepSeek API 开放平台网页入口；网页账户由 DeepSeek 管理。</p></div>);
    };
    const off = ctx.slots.subscribe?.('settings.section', sync);
    sync();
    return keep(() => { off?.(); own?.(); own = null; });
  });
  return () => { if (stopped) return; stopped = true; for (const dispose of [...bindings]) dispose(); stopUI(); };
}
export function apply(ctx) {
  if (typeof document === 'undefined') return;
  const shared = window[identity] ??= { owners: new Map(), leader: null };
  if (shared.owners.has(ctx)) return;
  ctx.effect(() => {
    const owner = { ctx, dispose: null };
    shared.owners.set(ctx, owner);
    const activate = () => {
      if (shared.leader) return;
      const next = shared.owners.values().next().value;
      if (next) { shared.leader = next; next.dispose = mountClient(next.ctx); }
    };
    activate();
    return () => {
      if (shared.owners.get(ctx) !== owner) return;
      shared.owners.delete(ctx);
      if (shared.leader === owner) { owner.dispose?.(); shared.leader = null; activate(); }
      if (!shared.owners.size && window[identity] === shared) delete window[identity];
    };
  });
}

