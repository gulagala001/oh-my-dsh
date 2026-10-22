import { acquireShared } from '../shared.mjs';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Button, Input, Menu, MenuSurface, MarkdownText, TextShimmer, Tooltip,
  useDismissOnOutsidePointer, IconClockOutlineRegular,
  IconCloseOutlineRegular, IconSendOutlineRegular, IconStopFillRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { SideChatStore, busy } from './store.mjs';
import { installEntry } from './entry.mjs';
import css from './style.css';

export const name = 'dsh-btw-client';
export const inject = ['slots', 'sessions', 'conversation', 'inputTriggers'];
const labels = {
  code: { copyLabel: '复制', copiedLabel: '已复制', toolbarLabels: { codeLabel: '代码', wrapLabel: '自动换行', unwrapLabel: '取消换行' } },
  footnotes: '注释',
};
function Action({ label, icon: Icon, ...props }) {
  return <Tooltip label={label} side="top"><Button size="sm" variant="ghost" className="dsh-btw-action" aria-label={label} {...props}><Icon size={16} /></Button></Tooltip>;
}

function install(ctx) {
  const store = new SideChatStore();
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.dshBtw = ''; style.textContent = css;
    document.head.append(style);
    return () => { style.remove(); store.dispose(); };
  });
  installEntry(ctx, store);

  function Panel({ sessionId: id }) {
    const owner = useRef(Symbol('btw-owner'));
    const state = useSyncExternalStore(store.subscribe, () => store.get(id));
    const active = useSyncExternalStore(store.subscribe, () => store.active);
    const [historyOpen, setHistoryOpen] = useState(false);
    const panel = useRef(null), history = useRef(null), input = useRef(null), viewport = useRef(null);
    const composing = useRef(false), followBottom = useRef(true);
    const entry = state.entries[state.selected], running = store.isBusy(id);
    const open = active?.id === id && active.owner === owner.current;
    const dismiss = useCallback(() => { setHistoryOpen(false); store.close(); }, []);
    const closeAndFocus = () => {
      dismiss();
      ctx.conversation.input.for(ctx.sessions.scope(id)).focus();
    };
    useEffect(() => store.mount(id, owner.current), [id]);
    useDismissOnOutsidePointer(panel, open, dismiss, history);
    useLayoutEffect(() => { if (open) input.current?.focus({ preventScroll: true }); }, [open]);
    useEffect(() => { followBottom.current = true; }, [entry?.id]);
    useEffect(() => {
      if (followBottom.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
    }, [entry?.answer, open]);
    const submit = async event => {
      event.preventDefault();
      if (composing.current || running || !state.draft.trim()) return;
      const draft = store.get(id).draft;
      try {
        await store.ask(id, draft);
        if (store.get(id).draft === draft) store.update(id, { draft: '' });
      } catch (error) { store.update(id, { error: error.message }); }
    };
    if (!open) return null;
    return <MenuSurface ref={panel} className="dsh-btw-panel" role="dialog" aria-label="旁聊" aria-modal="false"
      onKeyDownCapture={event => {
        if (!historyOpen && event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
          && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) {
          event.preventDefault(); event.stopPropagation(); closeAndFocus();
        }
      }}>
      <div className="dsh-btw-heading">
        <span className="dsh-btw-question" title={entry?.question}>{entry?.question || 'BTW'}</span>
        {entry && <Menu open={historyOpen} portal autoFocus align="end" side="top" listClassName="dsh-btw-history"
          anchor={<Action label="历史旁聊" icon={IconClockOutlineRegular} onClick={() => setHistoryOpen(value => !value)} />}
          items={[...state.entries].reverse().map((record, index) => ({
            id: record.id,
            label: <span ref={index === 0 ? element => { history.current = element?.closest('[role="menu"]') ?? null; } : undefined}>{record.question}</span>,
          }))}
          selectedId={entry.id} onClose={() => setHistoryOpen(false)}
          onSelect={entryId => { store.select(id, state.entries.findIndex(record => record.id === entryId)); setHistoryOpen(false); }} />}
        <Action label="关闭旁聊" icon={IconCloseOutlineRegular} onClick={closeAndFocus} />
      </div>
      {entry && <div ref={viewport} className="dsh-btw-answer" onScroll={event => {
        const el = event.currentTarget;
        followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}>
        {entry.answer && <MarkdownText text={entry.answer} labels={labels} />}
        {busy(entry) && !entry.answer && <div className="dsh-btw-status" role="status">
          <TextShimmer active>{entry.status === 'connecting' ? '连接中…' : entry.thinking ? '思考中…' : '回答中…'}</TextShimmer>
        </div>}
        {entry.error && <div role="alert">
          {entry.error} {!running && <Button size="sm" onClick={() => {
            void store.ask(id, entry.question).catch(error => store.update(id, { error: error.message }));
          }}>重试</Button>}
        </div>}
        {entry.truncated && <p className="dsh-btw-status">回答达到模型长度上限，内容可能未完成。</p>}
      </div>}
      <form className="dsh-btw-form" onSubmit={submit}>
        <Input ref={input} aria-label="旁聊问题" placeholder={entry ? '继续问…' : '顺便问一下…'}
          className="dsh-btw-input" value={state.draft} maxLength={16000}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={event => { if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }}
          onChange={event => store.update(id, { draft: event.target.value, error: '' })} />
        {running
          ? <Action label="停止旁聊" icon={IconStopFillRegular} onClick={() => store.stop(id)} />
          : <Tooltip label="发送" side="top"><Button type="submit" size="sm" variant="primary" className="dsh-btw-action" aria-label="发送" disabled={!state.draft.trim()}><IconSendOutlineRegular size={16} /></Button></Tooltip>}
      </form>
      {state.error && <div role="alert">{state.error}</div>}
    </MenuSurface>;
  }
  ctx.slots.register({ name: 'conversation.input.overlay', id: 'dsh-btw-panel', order: 90 },
    props => <Panel key={props.sessionId} sessionId={props.sessionId} />);
}

export const apply = ctx => acquireShared(ctx, 'client', { name, inject, apply: install });
