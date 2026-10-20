import React, { useEffect, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { TemporaryWebChat } from './temporary-web.mjs';

export const TEMPORARY_WEB_KIND = 'deepseek-temporary-chat';
export const TEMPORARY_WEB_ID = 'dsh-deepseek-workbench/temporary';

export function installTemporarySidebar(ctx, BrowserPage) {
  const entries = new Map();
  const get = tab => {
    let value = entries.get(tab.id);
    if (!value) { value = new TemporaryWebChat(); entries.set(tab.id, value); }
    return value;
  };
  function Panel(props) {
    const { tab } = props.useTabInfo();
    const temporary = get(tab);
    const [, refresh] = useState(0);
    useEffect(() => temporary.subscribe(() => refresh(n => n + 1)), [temporary]);
    const close = () => { void temporary.close().then(() => tab.actions.close()).catch(() => {}); };
    return <div className="dswb-temporary" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="dswb-toolbar"><span role="status">{temporary.closing ? '正在清理临时聊天…' : '临时聊天 · 关闭后删除历史'}</span><Button size="sm" disabled={temporary.closing} onClick={close}>关闭</Button></div>
      {temporary.error && <div className="dswb-error" role="alert">{temporary.error}<Button size="sm" onClick={close}>重试关闭</Button></div>}
      <BrowserPage ctx={ctx} native temporary={temporary} workspace={`deepseek-temporary-${temporary.token}`}/>
    </div>;
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: TEMPORARY_WEB_ID, kind: TEMPORARY_WEB_KIND, title: () => '临时网页聊天', keepMounted: true }));
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: TEMPORARY_WEB_ID,
  }, Panel));
  ctx.effect(() => ctx.sidebarRight.registerCloseHandler(TEMPORARY_WEB_KIND, (sessionId, tab) => {
    const temporary = entries.get(tab.id);
    if (!temporary || temporary.closed) { entries.delete(tab.id); return; }
    void temporary.close().then(() => ctx.sidebarRight.closeIn(sessionId, tab.id)).catch(() => {});
    throw Error('正在清理临时网页聊天；清理成功后自动关闭。');
  }));
  const command = {
    name: '侧栏（网页版）', available: () => true, label: () => '侧栏（网页版）', description: () => '打开临时网页聊天，关闭后删除历史',
    ui: { kind: 'action', run: ({ sessionId }) => ctx.sidebarRight.openTabIn(sessionId, TEMPORARY_WEB_KIND, { revealIfOpened: true }) },
  };
  ctx.effect(() => {
    let unregister = ctx.commandUi.register(command);
    // The host ranks equal prefix matches in registration order. Keep the bare
    // command first when its provider becomes available after this plugin.
    const reorder = () => { unregister(); unregister = ctx.commandUi.register(command); };
    window.addEventListener('dsh:temporary-native-command-registered', reorder);
    return () => { window.removeEventListener('dsh:temporary-native-command-registered', reorder); unregister(); };
  });
  ctx.effect(() => () => {
    for (const temporary of entries.values()) void temporary.close().catch(error => console.error('Temporary web chat cleanup pending:', error.message));
  });
}
