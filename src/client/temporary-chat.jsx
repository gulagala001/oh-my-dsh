import React, { useEffect, useRef, useState } from 'react';
import { Button, InlineEditor, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { recoverTemporaryChat, sendTemporaryChat } from './temporary-chat-state.mjs';
import css from './temporary-chat.css';

const KIND = 'omd-temporary-chat', ID = 'oh-my-dsh/temporary-chat';
const labels = { code: { copyLabel: '复制代码', copiedLabel: '已复制' }, footnotes: '引用' };
async function request(action, data, signal) {
  const response = await fetch(`oh-my-dsh/api/temporary-chat/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal, cache: 'no-store',
  });
  if (action === 'send' && response.ok) return response;
  const value = await response.json();
  if (!response.ok) throw Error(value.error || '临时聊天操作失败');
  return value;
}
export function installTemporaryChat(ctx) {
  const entries = new Map();
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  const heartbeat = entry => {
    clearInterval(entry.heartbeat);
    if (entry.value && !entry.closed && !entry.closing && !entry.detached)
      entry.heartbeat = setInterval(() => { void request('touch', { id: entry.value.id }).catch(() => {}); }, 30000);
  };
  const close = async entry => {
    if (entry.closed) return;
    if (entry.closing) return entry.closing;
    entry.closing = (async () => {
      try {
        const value = await entry.created.catch(() => null);
        if (value?.id) await request('close', { id: value.id });
        entry.closed = true; entry.messages = []; entry.draft = ''; entry.turn = null;
      } finally { entry.closing = null; heartbeat(entry); entry.refresh?.(); }
    })();
    heartbeat(entry);
    entry.turn?.abort.abort(); entry.refresh?.();
    return entry.closing;
  };
  const create = (tab, parentId) => {
    const entry = { messages: [], draft: '', closed: false, busy: false, turn: null, created: request('open', { parentId }), error: '' };
    entry.created.then(value => {
      entry.value = value;
      if (entry.closed) return request('close', { id: value.id });
      heartbeat(entry);
      entry.refresh?.();
    }).catch(error => { entry.error = error.message; entry.refresh?.(); });
    entries.set(tab.id, entry); return entry;
  };
  function Panel({ useTabInfo, sessionId }) {
    const { tab } = useTabInfo();
    const entry = entries.get(tab.id) || create(tab, sessionId);
    const [view, setView] = useState(() => ({ ...entry }));
    const { draft, messages, busy, error, turn } = view, closing = !!view.closing, model = view.value?.model;
    const scroll = useRef(null);
    useEffect(() => {
      const refresh = () => setView({ ...entry });
      entry.refresh = refresh; refresh();
      return () => { if (entry.refresh === refresh) entry.refresh = null; };
    }, [entry]);
    useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [messages]);
    const end = () => {
      entry.error = '';
      void close(entry).then(() => tab.actions.close()).catch(failure => { entry.error = failure.message; entry.refresh?.(); });
    };
    return <section className="omd-temporary-chat" aria-label="临时侧栏聊天">
      <header><span>临时聊天{model && <small>{model} · 关闭后不保留历史</small>}</span><Button size="sm" disabled={closing} onClick={end}>{closing ? '正在关闭…' : '关闭'}</Button></header>
      <div ref={scroll} className="omd-temporary-messages">{messages.length ? messages.map((message, i) => <article key={i} data-role={message.role}>
        <small>{message.role === 'user' ? '你' : model}</small>
        {message.reasoning && <details><summary>思考</summary><MarkdownText text={message.reasoning} labels={labels}/></details>}
        <MarkdownText text={message.text} streaming={busy && i === messages.length - 1} labels={labels}/>
      </article>) : <p className="omd-temporary-empty">开始独立的临时聊天</p>}</div>
      {error && <div role="alert">{error}</div>}
      <div className="omd-temporary-composer" inert={closing ? '' : undefined}>
        {busy ? <Button disabled={turn?.abort.signal.aborted} onClick={() => { turn?.abort.abort(); entry.refresh?.(); }}>{turn?.abort.signal.aborted ? '正在确认结果…' : '停止回复'}</Button>
          : turn ? <Button onClick={() => recoverTemporaryChat(entry, request)}>恢复聊天</Button> : <>
          <InlineEditor value={draft} label="临时聊天消息" onChange={value => { entry.draft = value; entry.refresh?.(); }} onSave={() => sendTemporaryChat(entry, request)} onCancel={() => {}}/>
          <Button variant="primary" disabled={!draft.trim() || !model || entry.closed} onClick={() => sendTemporaryChat(entry, request)}>发送</Button>
        </>}
      </div>
    </section>;
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: ID, kind: KIND, title: () => '临时聊天', keepMounted: true }));
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID }, Panel));
  ctx.effect(() => ctx.sidebarRight.registerCloseHandler(KIND, (parentId, tab) => {
    const entry = entries.get(tab.id);
    if (!entry || entry.closed) { entries.delete(tab.id); return; }
    void close(entry).then(() => ctx.sidebarRight.closeIn(parentId, tab.id)).catch(error => { entry.error = error.message; entry.refresh?.(); });
    throw Error('正在清理临时聊天；清理成功后自动关闭。');
  }));
  ctx.effect(() => ctx.commandUi.register({ name: '侧栏', available: () => true, label: () => '侧栏', description: () => '打开独立临时聊天，关闭后不保留历史',
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
  const leave = () => { for (const entry of entries.values()) if (entry.value?.id) navigator.sendBeacon('oh-my-dsh/api/temporary-chat/close', new Blob([JSON.stringify({ id: entry.value.id })], { type: 'application/json' })); };
  window.addEventListener('pagehide', leave);
  ctx.effect(() => async () => {
    off(); window.removeEventListener('pagehide', leave); style.remove();
    const results = await Promise.allSettled([...entries.values()].map(entry => { entry.detached = true; return close(entry); }));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, '临时聊天关闭失败');
  });
}
