import React, { useEffect, useRef, useState } from 'react';
import { Button, InlineEditor, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
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
  const close = async entry => {
    if (entry.closed) return;
    if (entry.closing) return entry.closing;
    entry.send?.abort(); entry.refresh?.();
    entry.closing = (async () => {
      try {
        const value = await entry.created.catch(() => null);
        if (value?.id) await request('close', { id: value.id });
        entry.closed = true; entry.messages = []; entry.draft = ''; clearInterval(entry.heartbeat);
      } finally { entry.closing = null; entry.refresh?.(); }
    })();
    return entry.closing;
  };
  const create = (tab, parentId) => {
    const entry = { messages: [], draft: '', closed: false, created: request('open', { parentId }), error: '' };
    entry.created.then(value => {
      entry.value = value;
      if (entry.closed) return request('close', { id: value.id });
      entry.heartbeat = setInterval(() => { void request('touch', { id: value.id }).catch(() => {}); }, 30000);
    }).catch(error => { entry.error = error.message; });
    entries.set(tab.id, entry); return entry;
  };
  function Panel({ useTabInfo, sessionId }) {
    const { tab } = useTabInfo();
    const entry = entries.get(tab.id) || create(tab, sessionId);
    const [draft, setDraft] = useState(entry.draft), [messages, setMessages] = useState(entry.messages);
    const [busy, setBusy] = useState(false), [closing, setClosing] = useState(false);
    const [error, setError] = useState(entry.error), [model, setModel] = useState(entry.value?.model);
    const scroll = useRef(null), live = useRef(true);
    useEffect(() => { entry.refresh = () => { setClosing(!!entry.closing); setError(entry.error); if(entry.closed){setMessages([]);setDraft('');} }; return () => { entry.refresh = null; }; }, [entry]);
    useEffect(() => {
      live.current = true;
      entry.created.then(value => { if (live.current) setModel(value.model); }, failure => { if (live.current) setError(failure.message); });
      return () => { live.current = false; };
    }, [entry]);
    useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [messages]);
    const publish = next => { entry.messages = next; if (live.current) setMessages(next); };
    const end = () => {
      setClosing(true); setError('');
      void close(entry).then(() => tab.actions.close()).catch(failure => { if (live.current) { setClosing(false); setError(failure.message); } });
    };
    const send = async () => {
      if (!draft.trim() || busy || closing || entry.closed) return;
      setBusy(true); setError('');
      const text = draft, old = entry.messages, responseMessage = { role: 'assistant', text: '', reasoning: '' };
      const abort = new AbortController(); entry.send = abort;
      try {
        const { id } = await entry.created;
        const response = await request('send', { id, text }, abort.signal);
        const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '', done = false;
        for (;;) {
          const part = await reader.read(); pending += decoder.decode(part.value, { stream: !part.done });
          let at;
          while ((at = pending.indexOf('\n')) >= 0) {
            const raw = pending.slice(0, at); pending = pending.slice(at + 1); if (!raw) continue;
            const event = JSON.parse(raw);
            if (event.type === 'error') throw Error(event.error);
            if (event.type === 'start') { entry.draft = ''; if (live.current) setDraft(''); }
            if (event.type === 'text-delta') responseMessage.text += event.text;
            if (event.type === 'reasoning-delta') responseMessage.reasoning += event.text;
            if (event.type === 'done') done = true;
            if (!entry.closed) publish([...old, { role: 'user', text }, { ...responseMessage }]);
          }
          if (part.done) break;
        }
        if (!done) throw Error('回复连接中断，请重试。');
      } catch (failure) {
        if (!entry.closed && !entry.closing) {
          publish(old); entry.draft = text;
          if (live.current) { setDraft(text); setError(failure.name === 'AbortError' ? '回复已停止，草稿已保留。' : failure.message); }
        }
      } finally { if (entry.send === abort) entry.send = null; if (live.current) setBusy(false); }
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
        {busy ? <Button onClick={() => { entry.send?.abort(); void entry.created.then(value => request('stop', { id: value.id })).catch(() => {}); }}>停止回复</Button> : <>
          <InlineEditor value={draft} label="临时聊天消息" onChange={value => { entry.draft = value; setDraft(value); }} onSave={send} onCancel={() => {}}/>
          <Button variant="primary" disabled={!draft.trim() || !model} onClick={send}>发送</Button>
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
    for (const [id, entry] of entries) if (!present.has(id)) { void close(entry).catch(() => {}); entries.delete(id); }
  });
  const leave = () => { for (const entry of entries.values()) if (entry.value?.id) navigator.sendBeacon('oh-my-dsh/api/temporary-chat/close', new Blob([JSON.stringify({ id: entry.value.id })], { type: 'application/json' })); };
  window.addEventListener('pagehide', leave);
  ctx.effect(() => () => { off(); window.removeEventListener('pagehide', leave); style.remove(); return Promise.all([...entries.values()].map(entry => close(entry).catch(() => {}))); });
}
