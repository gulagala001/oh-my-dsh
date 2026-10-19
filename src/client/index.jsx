import { applyAppearanceBrand } from './appearance-brand.jsx';
import { createPoller } from './polling.mjs';
import { createConversation } from '../../lib/host/ui-conversation.factory.mjs';
import { installDesktopLifecycle } from './desktop-lifecycle.mjs';
import { applySessionTimeZone } from './session-time-zone.mjs';
import { applyRewindCompatibility } from './rewind-compat.jsx';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { applyConsole } from './console/shell.jsx';
import { openConsole } from './console/nav.mjs';
import css from './style.css';
import workbenchCss from './workbench.css';
import shellCss from './shell.css';
import { createOpenCU } from '../../vendor/opencu/lib/client.factory.mjs';
import { createChat } from '../../lib/host/ui-chat.factory.mjs';
import { createChatSettings } from './chat-settings.mjs';
import { installConversationLifecycle } from './conversation-lifecycle.mjs';

import versionCss from './version-info.css';
import { whaleCss } from './brand.mjs';
import { createContextUI } from './context-client.mjs';
import { applyHistorySize } from './history-settings.jsx';
import { applySkins } from './skins/settings.jsx';
import { applyConversationRecords } from './conversation-records.jsx';
import { applyRecommendedPlugins } from './recommended-plugins.jsx';
import { applyPromptOptimizer } from './prompt-optimizer.jsx';
import { applyModelPanel } from './model-panel.jsx';
import { applySubscriptionFast } from './subscription-fast.jsx';
import { useMainConversation } from './main-conversation.mjs';
import { applyWorkflowStatus } from './workflow-status.jsx';
import { applyWorkflowHeader } from './workflow-header.jsx';
import { applySessionOverview } from './session-overview.jsx';
import { applyProjectlessWorkspaces } from './projectless-workspaces.jsx';
import { apply as applyDeepSeekWorkbench } from '../../plugins/deepseek-workbench/src/client/index.jsx';

export { CONTEXT_UI_VERSION as contextUIVersion } from './context-client.mjs';
const { ContextSettings, ScopeChip, applyStyle } = createContextUI(React);

const api = async (path, value, signal) => {
  const response = await fetch(`trisoul-x/api${path}`, value === undefined ? { signal } : { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};
const suffix = id => `?${id ? `session=${encodeURIComponent(id)}` : ''}`;
const fmt = n => Number(n || 0).toLocaleString();
const shortDate = at => at == null ? '时间未记录' : new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function BetterTodoChip(props) {
  const preset = props.useSessions(s => s.byId[props.sessionId]?.projectionValues?.agentPreset);
  const main = useMainConversation(props);
  return main && ['trisoul-x', 'omd-ptc'].includes(preset) ? <BetterTodoSessionChip {...props}/> : null;
}
function BetterTodoSessionChip({ sessionId, useSessionStatus }) {
  const [state, setState] = useState(null), [open, setOpen] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [notice, setNotice] = useState(false), dialog = useRef(null), noticeId = useId();
  const running = useSessionStatus(s => s.get(sessionId)?.running), active = useRef(sessionId), revision = useRef(0), writing = useRef(null); active.current = sessionId;
  const load = useCallback(async () => {
    if (writing.current?.sessionId === sessionId) return;
    const ticket = ++revision.current;
    try { const next = await api('/better-todo' + suffix(sessionId)); if (active.current === sessionId && revision.current === ticket) { setState({ sessionId, ...next }); setError(''); } }
    catch (e) { if (active.current === sessionId && revision.current === ticket) setError(e.message); }
  }, [sessionId]);
  useEffect(() => { setOpen(false); setSaving(false); setError(''); setNotice(false); }, [sessionId]);
  useEffect(() => { if (notice && !dialog.current?.open) dialog.current?.showModal(); else if (!notice) dialog.current?.close(); }, [notice]);
  useEffect(() => { void load(); }, [load, running]);
  const ready = state?.sessionId === sessionId;
  const toggle = async key => {
    if (!ready || saving) return;
    const write = { sessionId }; writing.current = write; ++revision.current;
    setSaving(true); setError('');
    try {
      const next = await api('/better-todo' + suffix(sessionId), { [key]: !state[key] });
      if (active.current === sessionId) {
        setState({ sessionId, ...next });
        if (key === 'verification' && !state.verification && next.verification) { setOpen(false); setNotice(true); }
      }
    } catch (e) { if (active.current === sessionId) setError(e.message); }
    finally { if (writing.current === write) writing.current = null; if (active.current === sessionId) setSaving(false); }
  };
  const chip = <button type="button" className={cx('tx-scope-chip', 'tx-bt-chip', ready && !state.todo && !state.verification && 'tx-bt-off')} aria-label="BT · Better Todo" aria-haspopup="menu" aria-expanded={open} title="Better Todo · 收尾提醒" onClick={() => { void load(); setOpen(!open); }}><strong>BT</strong><span>▾</span></button>;
  const items = [{ type: 'label', id: 'title', text: 'Better Todo' }, ...[
    ['todo', '待办完成提醒', '仍有未完成待办时提醒继续'],
    ['verification', '验证完成提醒', '缺少验证证据时提醒，含文字证据复核'],
  ].map(([id, label, hint]) => ({ id, disabled: !ready || saving, label: <span className="tx-bt-option"><span><strong>{label}</strong><small>{hint}</small></span><span className="tx-bt-state"><small>{ready ? state[id] ? '开' : '关' : '…'}</small><i className={cx('tx-bt-toggle', ready && state[id] && 'tx-on')} aria-hidden="true"/></span></span> })),
    { type: 'separator', id: 'sep' }, { id: 'evidence', label: <span className="tx-bt-option"><span><strong>查看任务证据</strong><small>需求原文、验证命令与结果</small></span><span className="tx-bt-state">›</span></span> }];
  return <><Menu open={open} anchor={chip} items={items} footer={[{ type: 'label', id: 'status', text: error || '仅本会话 · 可随时更改' }]} onSelect={id => { if (id === 'evidence') { setOpen(false); openConsole('evidence'); } else toggle(id); }} onClose={() => setOpen(false)} portal side="top" align="end" compact autoFocus/>
    <dialog ref={dialog} className="tx-bt-notice" aria-labelledby={noticeId} aria-describedby={noticeId+'-body'} onCancel={()=>setNotice(false)} onClose={()=>setNotice(false)}>
      <h2 id={noticeId}>验证完成提醒</h2><p id={noticeId+'-body'}>此选项将会带来更高的任务完成率，同时也会消耗更多时间和 token。</p>
      <div><button type="button" autoFocus onClick={()=>setNotice(false)}>知道了</button></div>
    </dialog></>;
}

const cx = (...parts) => parts.filter(Boolean).join(' ');

const hostConversation = createConversation(require), hostChat = createChat(require), openCU = createOpenCU(require);
export const inject = [...new Set(['slots', 'sidebarRightTabs', 'sidebarRight', 'theme', 'configForms', 'layout', 'modules', 'remote.session', 'remote.subagents', 'remote.agentPresets', ...hostConversation.inject, ...hostChat.inject])].filter(name => name !== 'uiConversation');
export async function apply(ctx) {
  ctx.provide('omdConversationLifecycle', installConversationLifecycle(ctx));
  applySessionTimeZone(ctx);
  applyRewindCompatibility(ctx);
  applyDeepSeekWorkbench(ctx);
  applyHistorySize(ctx);
  installDesktopLifecycle(ctx);
  const projectlessDrafts = applyProjectlessWorkspaces(ctx);
  await ctx.plugin(hostConversation, { settingsNamespace: 'omd-ui-conversation' });
  const chatSettings = createChatSettings(() => ctx.configForms.get('omd-ui-chat'), () => () => {});
  ctx.effect(() => () => chatSettings.dispose());
  await ctx.plugin(hostChat, { settings: chatSettings });
  await ctx.plugin(openCU);
  projectlessDrafts.transferOptimizer = applyPromptOptimizer(ctx, { draftLock: projectlessDrafts }).transferDraft;
  applyModelPanel(ctx);
  applySubscriptionFast(ctx);
  applyWorkflowStatus(ctx);
  applyWorkflowHeader(ctx);
  applySessionOverview(ctx, openCU);
  function RunningMarker(props) {
    const running = props.useSessionStatus(s => Boolean(s.get(props.sessionId)?.running));
    return <span hidden data-omd-running={running ? '' : undefined}/>;
  }
  const getAppearanceRuntime = applySkins(ctx);
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.plugin = 'trisoul_x'; tag.textContent = css + '\n' + shellCss + '\n' + whaleCss + '\n' + versionCss + '\n' + workbenchCss; document.head.appendChild(tag);
    const runtime = getAppearanceRuntime();
    const sync = () => document.documentElement.classList.toggle('trisoul-shell', runtime.getSnapshot().active !== false);
    const off = runtime.subscribe(sync); sync();
    return () => { off(); tag.remove(); document.documentElement.classList.remove('trisoul-shell'); };
  });
  applyAppearanceBrand(ctx, getAppearanceRuntime);
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'trisoul-x', order: 16, label: () => 'Oh My DSH' }, ContextSettings));
  applyRecommendedPlugins(ctx);
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'trisoul-running', order: 25 }, RunningMarker));
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'trisoul-memory-scope', order: 50 }, ScopeChip));
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'trisoul-better-todo', order: 100 }, BetterTodoChip));
  applyConsole(ctx, { composerStats: JSON.parse(__OMD_COMPOSER_STATS__),
    performanceMode: { get: () => chatSettings.getSnapshot()?.value?.performanceUsage, subscribe: listener => chatSettings.subscribe(listener) } });
  applyStyle(ctx);
  applyConversationRecords(ctx);
}
