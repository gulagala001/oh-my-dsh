import { Button as NativeButton } from '../native-controls.jsx';
// The single OMD entry in the native right sidebar: one console tab with its
// own navigation. Former OMD tab kinds stay registered (without guide
// entries) and hand over to the console, so saved layouts keep working.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, Seg, Select, IconButton, cx } from './ui.jsx';
import { SECTIONS, HIDDEN_SECTIONS, PERIODS, RANGES } from './model.mjs';
import { CONSOLE_KIND, NAV_EVENT, bindSidebar } from './nav.mjs';
import { Overview } from './overview.jsx';
import { ContextSection } from './context.jsx';
import { MemorySection } from './memory.jsx';
import { CallsSection } from './calls.jsx';
import { EventsSection } from './events.jsx';
import { EvidenceSection } from './evidence.jsx';
import { applyDock } from './dock.jsx';
import css from './console.css';

const ALL = [...SECTIONS, ...HIDDEN_SECTIONS];
const BODIES = { overview: Overview, context: ContextSection, memory: MemorySection, calls: CallsSection, events: EventsSection, evidence: EvidenceSection };
// Session-scoped sections ignore the range switch.
const SESSION_ONLY = new Set(['context', 'memory', 'evidence']);
const stored = (key, fallback, valid) => { try { const v = localStorage.getItem('omd-console:' + key); return valid.includes(v) ? v : fallback; } catch { return fallback; } };
const store = (key, value) => { try { localStorage.setItem('omd-console:' + key, value); } catch {} };

function ConsolePage(props) {
  const { tab, sidebar } = props.useTabInfo();
  const visible = tab.visible, nav = tab.navigation?.params || {};
  const [route, setRoute] = useState(() => ({ section: BODIES[nav.section] ? nav.section : 'overview', params: nav }));
  const [range, setRange] = useState(() => stored('range', 'session', ['session', 'all']));
  const [period, setPeriod] = useState(() => stored('period', 'today', PERIODS.map(p => p[0])));
  const [tick, setTick] = useState(0), [wide, setWide] = useState(false), root = useRef(null);

  const go = useCallback((section, params = {}) => {
    if (!BODIES[section]) return;
    setRoute({ section, params: { ...params, nonce: Date.now() } });
    root.current?.querySelector('.omc-main')?.scrollTo?.({ top: 0 });
  }, []);
  useEffect(() => { if (nav.section && BODIES[nav.section]) setRoute({ section: nav.section, params: nav }); }, [nav.nonce, nav.section]);
  useEffect(() => {
    if (!visible) return;
    const on = e => { const p = e.detail || {}; if (BODIES[p.section]) setRoute({ section: p.section, params: p }); };
    window.addEventListener(NAV_EVENT, on);
    return () => window.removeEventListener(NAV_EVENT, on);
  }, [visible]);
  useEffect(() => {
    const el = root.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 760)); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const setR = v => { setRange(v); store('range', v); };
  const setP = v => { setPeriod(v); store('period', v); };
  const { section } = route, Body = BODIES[section];
  const nav2 = section === 'evidence' ? ALL : SECTIONS;
  const sessionOnly = SESSION_ONLY.has(section);
  const layout = wide || sidebar?.fullscreen;

  return <div ref={root} className={cx('omc-root omc-console', layout && 'omc-wide')} data-section={section}>
    <header className="omc-head">
      <div className="omc-head-tools">
        {!sessionOnly && <Seg size="sm" label="范围" value={range} onChange={setR} options={RANGES}/>}
        {!sessionOnly && <Select label="时间" value={period} onChange={setP} options={PERIODS}/>}
        <IconButton icon="refresh" label="刷新" onClick={() => setTick(t => t + 1)}/>
      </div>
    </header>
    <div className="omc-frame">
      <nav className="omc-nav" aria-label="控制台分区">{nav2.map(([id, title, icon]) => <NativeButton size="sm" variant="ghost" key={id} type="button" aria-current={section === id ? 'page' : undefined}
        onClick={() => go(id)}><Icon name={icon} size={15}/><span>{title}</span></NativeButton>)}</nav>
      <main className="omc-main" key={tick}>
        <Body sessionId={props.sessionId} visible={visible} range={range} period={period} params={route.params} go={go}/>
      </main>
    </div>
  </div>;
}

const LEGACY = {
  'trisoul-x-context': 'evidence', 'trisoul-x-pipeline': 'context', 'trisoul-x-memory': 'memory', 'trisoul-x-monitor': 'overview',
};
const WORKBENCH_SECTIONS = { tasks: 'evidence', context: 'context', memory: 'memory', monitor: 'overview' };
function Redirect({ section, useTabInfo }) {
  const { tab } = useTabInfo();
  const target = section ?? WORKBENCH_SECTIONS[tab.navigation?.params?.section] ?? 'overview';
  useEffect(() => {
    if (tab.visible) tab.actions.openTab(CONSOLE_KIND, { replaceTab: true, params: { section: target, nonce: Date.now() } });
  }, [tab.visible, tab.id, target, tab.actions]);
  return <div className="omc-root omc-redirect">正在打开 OMD 控制台…</div>;
}

export function applyConsole(ctx, { composerStats = [], performanceMode } = {}) {
  ctx.effect(() => bindSidebar(ctx.sidebarRight));
  ctx.effect(() => { const tag = document.createElement('style'); tag.dataset.plugin = 'omd-console'; tag.textContent = css; document.head.appendChild(tag); return () => tag.remove(); });
  const id = `trisoul_x/${CONSOLE_KIND}`;
  ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind: CONSOLE_KIND, title: () => 'OMD', keepMounted: true,
    guide: [{ id: 'omd-console', order: 40, title: () => 'OMD 控制台', description: () => '上下文、记忆、调用与后台日志', icon: p => <Icon name="omd" {...p}/> }] }));
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id }, ConsolePage));
  for (const [kind, section] of [...Object.entries(LEGACY), ['trisoul-x-workbench', undefined]]) {
    const legacyId = `trisoul_x/${kind}`;
    ctx.effect(() => ctx.sidebarRightTabs.register({ id: legacyId, kind, title: () => 'OMD', guide: [] }));
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: legacyId }, props => <Redirect {...props} section={section}/>));
  }
  applyDock(ctx, composerStats, performanceMode);
}
