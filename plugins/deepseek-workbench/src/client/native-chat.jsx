import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Lexer } from 'marked';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { commandScript, previewScript, statusScript } from './native-chat-bridge.mjs';

const safeLink = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
function Inline({ tokens = [] }) {
  return tokens.map((t, i) => {
    const children = t.tokens ? <Inline tokens={t.tokens}/> : t.text ?? t.raw;
    if (t.type === 'strong') return <strong key={i}>{children}</strong>;
    if (t.type === 'em') return <em key={i}>{children}</em>;
    if (t.type === 'del') return <del key={i}>{children}</del>;
    if (t.type === 'codespan') return <code key={i}>{t.text}</code>;
    if (t.type === 'br') return <br key={i}/>;
    if (t.type === 'link' && safeLink(t.href)) return <a key={i} href={safeLink(t.href)} target="_blank" rel="noopener noreferrer">{children}</a>;
    return <React.Fragment key={i}>{t.type === 'image' ? t.text : children}</React.Fragment>;
  });
}
function Blocks({ tokens }) {
  return tokens.map((t, i) => {
    if (t.type === 'space') return null;
    if (t.type === 'code') return <pre key={i}><code>{t.text}</code></pre>;
    if (t.type === 'heading') { const Tag = `h${Math.min(6, Math.max(1, t.depth))}`; return <Tag key={i}><Inline tokens={t.tokens}/></Tag>; }
    if (t.type === 'blockquote') return <blockquote key={i}><Blocks tokens={t.tokens}/></blockquote>;
    if (t.type === 'list') { const Tag = t.ordered ? 'ol' : 'ul'; return <Tag key={i} start={t.ordered ? t.start : undefined}>{t.items.map((item, n) => <li key={n}><Blocks tokens={item.tokens}/></li>)}</Tag>; }
    if (t.type === 'table') return <div className="dswb-table" key={i}><table><thead><tr>{t.header.map((c, n) => <th key={n}><Inline tokens={c.tokens}/></th>)}</tr></thead><tbody>{t.rows.map((row, n) => <tr key={n}>{row.map((c, j) => <td key={j}><Inline tokens={c.tokens}/></td>)}</tr>)}</tbody></table></div>;
    if (t.type === 'hr') return <hr key={i}/>;
    return <p key={i}>{t.tokens ? <Inline tokens={t.tokens}/> : t.text ?? t.raw}</p>;
  });
}
function Message({ message }) {
  return <article className={`dswb-message dswb-message-${message.role}`} aria-label={message.role === 'user' ? '我的消息' : 'DeepSeek 回复'}>
    {message.role === 'assistant' && <div className="dswb-message-author">DeepSeek</div>}
    <div className="dswb-message-body">{message.role === 'assistant' ? <Blocks tokens={Lexer.lex(message.text || '')}/> : message.text}</div>
    {message.attachments?.length > 0 && <div className="dswb-files">{message.attachments.map((file, i) => safeLink(file.url) ? <a key={i} href={safeLink(file.url)} target="_blank" rel="noopener noreferrer">↗ {file.name}</a> : <span key={i}>▧ {file.name}</span>)}</div>}
  </article>;
}

/** Native main-column chat; the owned official page handles login and transport. */
export function NativeChat({ frame, adapter, guest, error, setError, onImport, importing, canImport, retry, onExternal, warnings, onStatus, temporary }) {
  const [snapshot, setSnapshot] = useState({ ready: false, history: [], alerts: [] });
  const [messages, setMessages] = useState([]), [text, setText] = useState(''), [busy, setBusy] = useState('');
  const [inspect, setInspect] = useState(false), [history, setHistory] = useState(false);
  const [readError, setReadError] = useState('');
  const [files, setFiles] = useState([]);
  const input = useRef(null), scroll = useRef(null), picker = useRef(null), current = useRef(''), previewBusy = useRef(false), follow = useRef(true), signingIn = useRef(false), commandBusy = useRef(false);
  const showWebsite = inspect && (!temporary || snapshot.signIn && /^https:\/\/chat\.deepseek\.com\/(sign_in|sign_up|authorized)(?:[/?#]|$)/.test(frame.url));
  const surface = useRef(null), lifetime = useRef(null);
  useLayoutEffect(() => {
    // Sending the first message changes the guest URL; new chat also loads a
    // document in the same guest. Neither ends the owned command's lifetime.
    const ticket = { active: frame.ready, readers: new Set(), readerEpoch: 0 };
    lifetime.current = ticket; commandBusy.current = false; setBusy('');
    return () => { ticket.active = false; for (const reader of ticket.readers) reader.abort(); };
  }, [frame.ready, adapter]);
  useLayoutEffect(() => {
    // File selection still belongs to the document where it started.
    const ticket = lifetime.current;
    ++ticket.readerEpoch;
    for (const reader of ticket.readers) reader.abort();
  }, [frame.loading, frame.url]);
  useEffect(() => {
    const node = surface.current;
    const measure = () => node.style.setProperty('--dsh-conversation-column-width', `${node.clientWidth}px`);
    const observer = new ResizeObserver(measure); observer.observe(node); measure();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    const resize = () => { node.style.height = 'auto'; node.style.height = `${Math.min(180, node.scrollHeight)}px`; };
    const observer = new ResizeObserver(resize); observer.observe(node.parentElement); resize();
    return () => observer.disconnect();
  }, [text, showWebsite]);
  const statusReporter = useRef(onStatus); statusReporter.current = onStatus;
  useEffect(() => {
    if (!frame.ready || frame.loading) return;
    let stopped = false, timer;
    const poll = async () => {
      if (previewBusy.current || commandBusy.current) { timer = setTimeout(poll, 600); return; }
      previewBusy.current = true;
      try {
        const page = adapter.current, value = await page?.extract(statusScript);
        if (!value || stopped || page !== adapter.current || commandBusy.current) return;
        if (value.ready && signingIn.current) setInspect(false);
        signingIn.current = value.signIn;
        setSnapshot(value);
        statusReporter.current?.(value);
        if (!temporary && /^https:\/\/chat\.deepseek\.com\/a\/[^?#]+$/.test(value.url)) sessionStorage.setItem('dswb-last-chat', value.url);
        if (value.ready) {
          const conversation = await page.extract(previewScript);
          if (stopped || page !== adapter.current) return;
          if (current.current !== conversation.url) { current.current = conversation.url; setMessages(conversation.messages); follow.current = true; setFiles([]); }
          else setMessages(old => {
            const updates = new Map(conversation.messages.map((message, i) => [message.sourceMessageId ?? `${message.role}:${i}`, message]));
            const result = old.map((message, i) => { const key = message.sourceMessageId ?? `${message.role}:${i}`; const update = updates.get(key); updates.delete(key); return update ?? message; });
            return [...result, ...updates.values()];
          });
        }
        if (!stopped && page === adapter.current) setReadError('');
      } catch (failure) { if (!stopped && !/未找到可识别/.test(failure.message)) setReadError(failure.message); }
      finally { previewBusy.current = false; if (!stopped) timer = setTimeout(poll, 1000); }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [frame.ready, frame.loading, frame.url, adapter, setError]);
  useEffect(() => { if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [messages, snapshot.generating]);
  const command = async (type, extra = {}) => {
    const ticket = lifetime.current, page = adapter.current;
    const current = () => ticket?.active && lifetime.current === ticket && adapter.current === page;
    if (!current() || !page || frame.loading || commandBusy.current || importing || temporary?.closing || temporary?.closed) return false;
    commandBusy.current = ticket; setBusy(type); setError('');
    try {
      const result = temporary ? await temporary.run(type, extra) : await page.extract(commandScript({ type, ...extra }));
      if (!current()) return false;
      if (type === 'new' && result?.navigateTo) await page.navigate(result.navigateTo);
      if (!current()) return false;
      if (type === 'send' && result?.accepted !== true) { setError(result?.error || '尚未确认官网发送结果，输入内容已保留。请先检查官网页面，避免重复发送。'); return false; }
      if (result?.status) setSnapshot(result.status);
      return true;
    } catch (failure) { if (current()) setError(failure.message); return false; }
    finally { if (commandBusy.current === ticket) { commandBusy.current = false; if (current()) setBusy(''); } }
  };
  const submit = async () => { const ticket = lifetime.current; if (!text.trim() || !snapshot.ready || snapshot.generating) return; if (await command('send', { text }) && ticket?.active) { setText(''); setFiles([]); follow.current = true; input.current?.focus(); } };
  const upload = async selected => {
    const ticket = lifetime.current, page = adapter.current;
    const readerEpoch = ticket?.readerEpoch;
    const current = () => ticket?.active && lifetime.current === ticket && adapter.current === page && ticket.readerEpoch === readerEpoch;
    const list = Array.from(selected ?? []); if (!list.length || !current()) return;
    if (list.length > 20 || list.reduce((size, file) => size + file.size, 0) > 32 * 1024 * 1024) { setError('附件最多 20 个，总大小不超过 32 MiB。'); return; }
    try {
      const payload = await Promise.all(list.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader(); ticket.readers.add(reader);
        const finish = work => { ticket.readers.delete(reader); work(); };
        reader.onerror = () => finish(() => reject(Error('附件无法读取。')));
        reader.onabort = () => finish(() => reject(Error('附件读取已取消。')));
        reader.onload = () => finish(() => resolve({ name: file.name, type: file.type, data: String(reader.result).split(',')[1] }));
        reader.readAsDataURL(file);
      })));
      if (current() && await command('upload', { files: payload }) && current()) setFiles(old => [...old, ...list.map(file => file.name)]);
    } catch (failure) { if (current()) setError(failure.message); }
  };
  return <div ref={surface} className="dswb-native" data-deepseek-workbench="chat" data-empty={messages.length === 0} inert={temporary?.closing || temporary?.closed ? '' : undefined} onDragOver={event => { if (snapshot.ready) event.preventDefault(); }} onDrop={event => { if (snapshot.ready) { event.preventDefault(); void upload(event.dataTransfer.files).catch(failure => setError(failure.message)); } }}>
    <header className="dswb-chat-header" data-window-drag><div className="dswb-chat-identity"><div><strong>{temporary ? '临时网页聊天' : 'DeepSeek 网页聊天'}</strong></div></div><div className="dswb-chat-actions">
      {!temporary && <><Button size="sm" type="button" onClick={() => setHistory(value => !value)} aria-expanded={history}>历史对话</Button>
      <Button size="sm" type="button" disabled={!snapshot.ready || busy !== '' || snapshot.generating} onClick={async () => { if (await command('new')) { setText(''); setFiles([]); setMessages([]); } }}>新对话</Button>
      <Button size="sm" type="button" className="dswb-primary" variant="primary" disabled={!canImport || !snapshot.ready || !messages.length || snapshot.generating || busy !== ''} onClick={onImport}>{importing || '在 DSH 中继续'}</Button>
      <Button size="sm" type="button" aria-label="在外部浏览器打开" title="在外部浏览器打开" onClick={onExternal}>↗</Button></>}
      {(!temporary || snapshot.signIn) && <Button size="sm" type="button" className="dswb-more" aria-label={showWebsite ? '返回原生聊天' : '登录或检查官网页面'} title={showWebsite ? '返回聊天' : '登录或检查官网页面'} disabled={!!temporary && (temporary.closing || busy !== '')} onClick={() => setInspect(value => !value)}>⋯</Button>}
    </div></header>
    {history && <div className="dswb-history" role="dialog" aria-label="DeepSeek 历史对话"><div><strong>历史对话</strong><Button size="sm" onClick={() => setHistory(false)} aria-label="关闭历史对话">×</Button></div>{snapshot.history.length ? snapshot.history.map(item => <Button size="sm" key={item.url} disabled={busy !== '' || Boolean(importing) || frame.loading} onClick={() => { setHistory(false); setText(''); void adapter.current?.navigate(item.url).catch(failure => setError(failure.message)); }}>{item.title}</Button>) : <p>暂无已加载的历史对话</p>}</div>}
    {(error || frame.error || readError) && <div className="dswb-error" role="alert">{error || frame.error || readError} {!temporary && <Button size="sm" onClick={() => setInspect(true)}>检查官网页面</Button>}{!temporary?.armed && <Button size="sm" onClick={retry}>重新加载</Button>}</div>}
    {warnings}
    {snapshot.alerts.length > 0 && <div className="dswb-notice" role="status">{snapshot.alerts.join(' · ')}</div>}
    <div className={`dswb-official-page${showWebsite ? ' is-visible' : ''}`} aria-hidden={!showWebsite}>{guest}</div>
    {!showWebsite && <><div className="dswb-message-scroll" ref={scroll} onScroll={() => { const node = scroll.current; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100; }}><div className="dswb-conversation">
      {messages.length ? messages.map((message, i) => <Message key={message.sourceMessageId ?? i} message={message}/>) : <div className="dswb-welcome"><h1>探索未至之境<span className="dswb-source-badge">DeepSeek 网页</span></h1><p>{frame.loading ? '正在连接 DeepSeek…' : snapshot.ready ? temporary ? '使用 DeepSeek 网页账号；关闭后删除本次对话。' : '使用 DeepSeek 网页账号，随时转入 DSH 继续。' : snapshot.signIn ? '网页版需要单独登录一次，之后自动复用。' : '正在检查网页登录状态…'}</p>{snapshot.signIn && <Button size="sm" className="dswb-login" onClick={() => setInspect(true)}>登录 DeepSeek</Button>}</div>}
      {snapshot.generating && <div className="dswb-generating" role="status">DeepSeek 正在回复<span>···</span></div>}
    </div></div><div className="dswb-composer-wrap"><div className="dswb-composer" data-composer-card="">
      {files.length > 0 && <div className="dswb-files">{files.map((name, i) => <span key={i}>▧ {name}</span>)}{!temporary && <Button size="sm" onClick={() => setInspect(true)}>查看上传状态</Button>}</div>}
      <textarea ref={input} data-composer-input="" value={text} rows={2} placeholder="发送消息给 DeepSeek" aria-label="发送消息给 DeepSeek" disabled={!snapshot.ready || busy === 'send'} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }}/>
      <div className="dswb-composer-actions"><div>{snapshot.think && <Button size="sm" aria-pressed={snapshot.think.enabled} disabled={snapshot.think.disabled || busy !== ''} onClick={() => command('think', { enabled: !snapshot.think.enabled })}>深度思考</Button>}{snapshot.search && <Button size="sm" aria-pressed={snapshot.search.enabled} disabled={snapshot.search.disabled || busy !== ''} onClick={() => command('search', { enabled: !snapshot.search.enabled })}>联网搜索</Button>}</div><div><input ref={picker} type="file" multiple hidden onChange={event => { void upload(event.target.files).catch(failure => setError(failure.message)); event.target.value = ''; }}/><Button size="sm" aria-label="上传附件" disabled={!snapshot.ready || busy !== '' || snapshot.generating} onClick={() => picker.current?.click()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></Button><Button size="sm" className="dswb-send" aria-label="发送" disabled={!snapshot.ready || !text.trim() || busy !== '' || snapshot.generating} onClick={submit}>{busy === 'send' ? '…' : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>}</Button></div></div>
    </div></div></>}
  </div>;
}
