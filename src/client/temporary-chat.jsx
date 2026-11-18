import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './temporary-chat.css';

const KIND = 'omd-temporary-chat', ID = 'oh-my-dsh/temporary-chat', SLOT = 'omd.temporary-chat.conversation';
async function request(action, data) {
  const response = await fetch(`oh-my-dsh/api/temporary-chat/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), cache: 'no-store',
  });
  const value = await response.json();
  if (!response.ok) throw Object.assign(Error(value.error || '侧栏聊天操作失败'), { status: response.status });
  return value;
}
export function installTemporaryChat(ctx) {
  const entries = new Map();
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  const refresh = entry => { for (const listener of entry.listeners) listener(); };
  const heartbeat = entry => {
    clearInterval(entry.heartbeat);
    if (entry.reference && entry.value && !entry.closed && !entry.closing && !entry.detached)
      entry.heartbeat = setInterval(() => { void request('touch', { id: entry.value.id }).catch(error => {
        if (error.status === 410) { entry.error = error.message; entry.reference?.release(); entry.reference = null; clearInterval(entry.heartbeat); refresh(entry); }
      }); }, 30000);
  };
  const close = entry => {
    if (entry.closed) return Promise.resolve();
    if (entry.closing) return entry.closing;
    entry.closing = (async () => {
      try {
        const value = await entry.created.catch(() => null);
        entry.reference?.release(); entry.reference = null; refresh(entry);
        if (value?.id) await request('close', { id: value.id });
        void ctx.sessions.refresh().catch(() => {});
        entry.closed = true;
      } finally { entry.closing = null; heartbeat(entry); refresh(entry); }
    })();
    heartbeat(entry); refresh(entry); return entry.closing;
  };
  const create = (tab, parentId) => {
    if (entries.has(tab.id)) return entries.get(tab.id);
    const entry = { listeners: new Set(), closed: false, error: '' };
    entries.set(tab.id, entry);
    entry.created = request('open', { parentId });
    entry.created.then(value => {
      entry.value = value;
      if (!entry.closing && !entry.closed && !entry.detached)
        entry.reference = ctx.sessions.retain(value.id, { source: 'sidebarChat' });
      heartbeat(entry); refresh(entry);
    }).catch(error => { entry.error = error.message; refresh(entry); });
    return entry;
  };
  const subscribeNative = listener => ctx.slots.subscribe('sidebar.chat.conversation', listener);
  const nativeComponent = () => ctx.slots.entriesOfSlot('sidebar.chat.conversation')[0]?.component;
  function NativeConversation(props) {
    const Component = useSyncExternalStore(subscribeNative, nativeComponent);
    const renderFactorySlot = useCallback((name, owner, options) => props.renderFactorySlot(name,
      // A temporary sidebar is already an admitted session. The native hero
      // demands main-workspace membership, which sidebar sessions do not own.
      name === 'conversation.content' ? { ...owner, phase: 'active', hero: false } : owner, options), [props.renderFactorySlot]);
    return Component ? <Component {...props} renderFactorySlot={renderFactorySlot}/> : <div role="status">正在加载会话…</div>;
  }
  function Panel({ useTabInfo, sessionId, SessionProvider, renderSlot }) {
    const { tab } = useTabInfo(), [entry, setEntry] = useState(null), [, setRevision] = useState(0);
    useEffect(() => {
      const value = create(tab, sessionId), changed = () => setRevision(revision => revision + 1);
      value.listeners.add(changed); setEntry(value);
      return () => value.listeners.delete(changed);
    }, [tab.id, sessionId]);
    const end = () => {
      entry.error = '';
      void close(entry).then(() => tab.actions.close()).catch(error => { entry.error = error.message; refresh(entry); });
    };
    return <section className="omd-temporary-chat" aria-label="侧栏聊天" data-sidebar-chat="">
      {entry?.error && <div role="alert">{entry.error}<Button size="sm" disabled={!!entry.closing} onClick={end}>{entry.closing ? '正在关闭…' : '关闭'}</Button></div>}
      <div className="omd-temporary-conversation">
        {entry?.reference ? <SessionProvider session={entry.reference}>{renderSlot(SLOT, {})}</SessionProvider>
          : !entry?.error && <div className="omd-temporary-status" role="status">{entry?.closing ? '正在清理会话…' : '正在打开会话…'}</div>}
      </div>
    </section>;
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: ID, kind: KIND, title: () => '侧栏聊天', keepMounted: true, multiple: false,
    guide: [{ id: 'sidebar-chat', order: 32, title: () => '侧栏聊天', description: () => '打开独立会话，关闭后清空' }] }));
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID,
    children: { [SLOT]: { kind: 'single', scope: 'session' } },
  }, Panel));
  ctx.slots.inject(SLOT, () => ctx.slots.register({ name: SLOT }, NativeConversation));
  ctx.effect(() => ctx.sidebarRight.registerCloseHandler(KIND, (parentId, tab) => {
    const entry = entries.get(tab.id);
    if (!entry || entry.closed) { entries.delete(tab.id); return; }
    void close(entry).then(() => ctx.sidebarRight.closeIn(parentId, tab.id)).catch(error => { entry.error = error.message; refresh(entry); });
    throw Error('正在清理侧栏聊天；清理成功后自动关闭。');
  }));
  ctx.effect(() => ctx.commandUi.register({ name: '侧栏', available: () => true, label: () => '侧栏', description: () => '打开独立侧栏会话，关闭后清空',
    ui: { kind: 'action', run: ({ sessionId }) => ctx.sidebarRight.openTabIn(sessionId, KIND, { revealIfOpened: true }) },
  }));
  window.dispatchEvent(new Event('dsh:temporary-native-command-registered'));
  const off = ctx.sidebarRight.openTabs.subscribe(() => {
    const present = new Set(ctx.sidebarRight.openTabs.getSnapshot().filter(tab => tab.kind === KIND).map(tab => tab.tabId));
    for (const [id, entry] of entries) if (!present.has(id)) {
      entry.detached = true;
      void close(entry).then(() => entries.delete(id)).catch(error => { entry.error = error.message; });
    }
  });
  const leave = event => { if (event.persisted) return; for (const entry of entries.values()) if (entry.value?.id) navigator.sendBeacon('oh-my-dsh/api/temporary-chat/close', new Blob([JSON.stringify({ id: entry.value.id })], { type: 'application/json' })); };
  window.addEventListener('pagehide', leave);
  ctx.effect(() => async () => {
    off(); window.removeEventListener('pagehide', leave); style.remove();
    const results = await Promise.allSettled([...entries.values()].map(entry => { entry.detached = true; return close(entry); }));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, '侧栏聊天关闭失败');
  });
}
