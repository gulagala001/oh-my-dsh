import { Button as NativeButton } from '../native-controls.jsx';
// Composer dock items. Native statistics entries are shadowed by the same id
// at a lower priority (the documented ui-chat replacement rule); the native
// readings are kept and each popover gains a jump into the OMD console.
import React, { memo, useEffect, useState, useSyncExternalStore } from 'react';
import { IconDatabaseOutlineRegular, IconGaugeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { api, qs, usePoll, usePopover, Popover, Steps, Button, Icon, Dot, cx } from './ui.jsx';
import { k, ago } from './model.mjs';
import { pipelineSteps } from './context.jsx';
import { openConsole } from './nav.mjs';
import { useMainConversation } from '../main-conversation.mjs';

const OMD_PRESETS = ['trisoul-x', 'omd-ptc'];
// Native ui-chat readings, so a replaced pill reads exactly like the original.
const exact = n => Number(n || 0).toLocaleString('en-US');
const tok = n => { const v = Math.max(0, n || 0), s = x => x >= 100 ? String(Math.round(x)) : String(Math.round(x * 10) / 10); return v < 1e3 ? String(v) : v < 1e6 ? `${s(v / 1e3)}K` : `${s(v / 1e6)}M`; };
const tps = v => { const c = Math.max(0, v); return c >= 10 ? String(Math.round(c)) : String(Math.round(c * 10) / 10); };
const secs = ms => { const s = ms / 1000; if (s < 60) return `${Math.round(s * 10) / 10}秒`; const w = Math.round(s); return `${Math.floor(w / 60)}分${w % 60}秒`; };
function hitPercent(read, prompt) {
  if (!prompt) return null;
  if (read >= prompt) return '100';
  const ratio = read / prompt * 100, whole = Math.round(ratio);
  if (whole < 100) return String(whole);
  for (let d = 1; d < 8; d++) { const v = (Math.floor(ratio * 10 ** d) / 10 ** d).toFixed(d); if (Number(v) < 100) return v; }
  return '99.9';
}
function useIsOmd(props) {
  const main = useMainConversation(props);
  const preset = props.useSessions(s => s.byId?.[props.sessionId]?.projectionValues?.agentPreset);
  return main && OMD_PRESETS.includes(preset);
}
const Jump = ({ section, extra, children = '在控制台查看' }) => <NativeButton size="sm" variant="ghost" type="button" className="omc-pop-jump" onClick={() => openConsole(section, extra)}>{children}<Icon name="chevron" size={12}/></NativeButton>;

function Pill({ seat, stat, icon, label, aria, title, value, children, footer, tone, className }) {
  return <span ref={seat.rootRef} className={cx('omc-pill-anchor', className)} data-composer-stat={stat}>
    <NativeButton size="sm" variant="ghost" type="button" className={cx('omc-pill', tone && `omc-pill-${tone}`)} aria-haspopup="dialog" aria-expanded={seat.open} aria-label={aria}
      onClick={() => seat.setOpen(!seat.open)}>{icon}{label != null && <span className="omc-pill-label">{label}</span>}</NativeButton>
    <Popover seat={seat} title={title} value={value} icon={icon} footer={footer}>{children}</Popover>
  </span>;
}
// Compact mode keeps native plain readings: no dialogs.
const Plain = ({ stat, icon, label }) => <span className="omc-pill-anchor" data-composer-stat={stat}><span className="omc-pill omc-pill-plain">{icon}<span className="omc-pill-label">{label}</span></span></span>;
const Sep = () => <span className="omc-pill-sep" aria-hidden="true">·</span>;

const speedOf = stats => stats.decodeMs > 0 ? `${tps(stats.decodeTokens / (stats.decodeMs / 1000))} tok/s` : null;
const billed = usage => usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
const cacheOf = usage => hitPercent(usage.cacheReadTokens, billed(usage));

function ActivityRows({ stats }) {
  const speed = speedOf(stats);
  return <dl className="omc-kv">
    {stats.llmMs > 0 && <><dt>模型用时</dt><dd>{secs(stats.llmMs)}</dd></>}
    {stats.toolMs > 0 && <><dt>工具调用用时</dt><dd>{secs(stats.toolMs)}</dd></>}
    {stats.ttftSteps > 0 && <><dt>首 token 平均（TTFT）</dt><dd>{secs(stats.ttftMs / stats.ttftSteps)}</dd></>}
    {speed && <><dt>输出速度（TPS）</dt><dd>{speed}</dd></>}
  </dl>;
}
function UsageRows({ usage, sessionId, open }) {
  // OMD background usage is not part of the native session total: show it beside it.
  const { data } = usePoll(signal => api(`/monitor?${qs({ session: sessionId, range: 'session', period: 'all', view: 'usage', limit: 1 })}`, undefined, signal), `${sessionId}`, { enabled: open, interval: 10000 });
  const background = data ? Object.entries(data.metrics || {}).filter(([kind]) => !['main', 'subagent'].includes(kind)) : [];
  const bgTokens = background.reduce((n, [, m]) => n + (m.knownTotalTokens || 0), 0), bgCalls = background.reduce((n, [, m]) => n + (m.calls || 0), 0);
  const cache = cacheOf(usage);
  return <>
    <dl className="omc-kv">
      {cache && <><dt>缓存命中</dt><dd>{cache}%</dd></>}
      <dt>未缓存输入</dt><dd>{exact(usage.uncachedInputTokens)} tok</dd>
      <dt>缓存读取</dt><dd>{exact(usage.cacheReadTokens)} tok</dd>
      {usage.cacheWriteTokens !== 0 && <><dt>缓存写入</dt><dd>{exact(usage.cacheWriteTokens)} tok</dd></>}
      <dt>输出</dt><dd>{exact(usage.outputTokens)} tok</dd>
    </dl>
    {data && bgCalls > 0 && <div className="omc-pop-section"><span>OMD 后台（另计）</span><b>{tok(bgTokens)} tok · {bgCalls} 次</b></div>}
  </>;
}

function useStats(useProjection) {
  const stats = useProjection?.('sessionStats'), usage = useProjection?.('tokenUsage');
  const hasUsage = usage && (billed(usage) > 0 || usage.outputTokens > 0);
  return { stats: stats && stats.steps > 0 ? stats : null, usage: hasUsage ? usage : null };
}

function ActivityPill({ stats, mode, main }) {
  const seat = usePopover(), speed = speedOf(stats), icon = <IconGaugeOutlineRegular/>;
  if (mode === 'compact') return speed ? <Plain stat="activity" icon={icon} label={speed}/> : null;
  const counts = `${stats.turns} 轮 ${stats.steps} 步`;
  return <Pill seat={seat} stat="activity" icon={icon} aria={speed ? `${counts} · ${speed}` : counts} title="会话统计"
    label={<>{counts}{speed && <><Sep/>{speed}</>}</>} footer={main && <Jump section="calls" extra={{ kind: 'main' }}>主执行调用日志</Jump>}>
    <ActivityRows stats={stats}/>
  </Pill>;
}
function UsagePill({ usage, mode, sessionId, main }) {
  const seat = usePopover(), icon = <IconDatabaseOutlineRegular/>, cache = cacheOf(usage);
  const cacheText = cache != null ? `缓存命中 ${cache}%` : null;
  if (mode === 'compact') return cacheText ? <Plain stat="usage" icon={icon} label={cacheText}/> : null;
  const total = billed(usage) + usage.outputTokens, totalText = `${tok(total)} tok`;
  return <Pill seat={seat} stat="usage" icon={icon} aria={cacheText ? `${totalText} · ${cacheText}` : totalText} title="Token 用量" value={`${exact(total)} tok`}
    label={<>{totalText}{cacheText && <><Sep/>{cacheText}</>}</>} footer={main && <Jump section="overview">用量概览</Jump>}>
    <UsageRows usage={usage} sessionId={sessionId} open={main && seat.open}/>
  </Pill>;
}

function createStats(readMode) {
  const subscribe = readMode ? readMode.subscribe : () => () => {};
  const snapshot = () => readMode?.get() === 'compact' ? 'compact' : 'detailed';
  const useMode = () => useSyncExternalStore(subscribe, snapshot, snapshot);
  const ActivityStat = memo(function ActivityStat(props) {
    const main = useMainConversation(props);
    const mode = useMode(), { stats } = useStats(props.useProjection);
    return stats ? <ActivityPill stats={stats} mode={mode} main={main}/> : null;
  });
  const UsageStat = memo(function UsageStat(props) {
    const main = useMainConversation(props);
    const mode = useMode(), { usage } = useStats(props.useProjection);
    return usage ? <UsagePill usage={usage} mode={mode} sessionId={props.sessionId} main={main}/> : null;
  });
  // rc.2 ships both pills inside one `stats` entry.
  const CombinedStat = memo(function CombinedStat(props) {
    const main = useMainConversation(props);
    const mode = useMode(), { stats, usage } = useStats(props.useProjection);
    if (!stats && !usage) return null;
    return <span className="omc-pill-group" data-composer-stats="">
      {stats && <ActivityPill stats={stats} mode={mode} main={main}/>}{usage && <UsagePill usage={usage} mode={mode} sessionId={props.sessionId} main={main}/>}
    </span>;
  });
  return { activity: ActivityStat, usage: UsageStat, stats: CombinedStat };
}

/** OMD context pipeline: preparing pulse, replaceable segments and savings. */
export function ContextDockItem(props) {
  const isOmd = useIsOmd(props), seat = usePopover(), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  const { data: c, refresh } = usePoll(signal => api(`/context?${qs({ session: props.sessionId, compact: true })}`, undefined, signal), props.sessionId, { enabled: isOmd, interval: seat.open ? 2500 : 5000 });
  useEffect(() => { if (!seat.open) setMsg(''); }, [seat.open]);
  if (!isOmd || !c) return null;
  const pending = c.estimate?.pending && !c.estimate.pending.error ? c.estimate.pending : null;
  const working = c.preparing || c.coordinating || c.adaptive?.running || c.manualOperation || c.transactionPending;
  const failed = Object.keys(c.failures || {}).length > 0;
  const last = c.lastReplacement, saved = last ? last.stats?.estimatedSavedTokens ?? (last.inputTokens - last.outputTokens) : 0;
  // Idle stays a quiet glyph; words appear only when there is something to act on.
  const label = c.manualOperation ? '压缩中' : working ? '整理中' : pending ? `可替换 −${k(pending.estimatedSavedTokens)}` : failed ? '整理异常' : null;
  const tone = pending ? 'green' : failed && !working ? 'red' : undefined;
  const apply = async () => {
    setBusy(true); setMsg('');
    try { const r = await api(`/compact?${qs({ session: props.sessionId })}`, {}); setMsg(r.queued ? '已排队，下一次请求边界应用' : r.changed ? '已应用' : '没有可应用的结果'); refresh(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  return <Pill seat={seat} stat="omd-context" tone={tone} icon={working ? <Dot tone="blue" pulse/> : <Icon name="compress" size={14}/>}
    aria={label ? `OMD 上下文：${label}` : 'OMD 上下文整理'} title={c.compressionMode === 'adaptive' ? 'OMD 主动异步整理' : 'OMD 上下文整理'} label={label}
    footer={<Jump section="context"/>}>
    <Steps steps={pipelineSteps(c)}/>
    {pending && <div className="omc-pop-callout"><div><b>{pending.selectedRecords} 段可替换</b><span>{pending.currentMessages} 条消息 · 预计 −{k(pending.estimatedSavedTokens)}</span></div>
      <Button kind="primary" busy={busy} onClick={apply}>应用</Button></div>}
    <dl className="omc-kv">
      <dt>未处理原文</dt><dd>{c.backlog?.events ?? 0} 条 · ≈{k(c.backlog?.estimatedTokens)}</dd>
      <dt>分段摘要</dt><dd>{c.recordCount ?? (c.records || []).filter(r => !r.mergedInto).length} 段</dd>
      {c.estimate?.compact && !c.estimate.compact.error && <><dt>/compact-p 预计</dt><dd>−{k(c.estimate.compact.estimatedSavedTokens)}</dd></>}
      {last && <><dt>上次替换</dt><dd>{ago(last.at)} · 省 ≈{k(saved)}</dd></>}
    </dl>
    {msg && <p className="omc-hint">{msg}</p>}
  </Pill>;
}

/** Dream job in progress (appears only while a job runs or waits). */
export function DreamDockItem(props) {
  const isOmd = useIsOmd(props), seat = usePopover();
  const { data: live, refresh } = usePoll(signal => api(`/monitor/live?${qs({ session: props.sessionId })}`, undefined, signal), props.sessionId, { enabled: isOmd, interval: seat.open ? 3000 : 8000 });
  const data = live?.dream, job = data?.job;
  if (!isOmd || !(data?.activeJobs || data?.queuedJobs)) return null;
  const stop = async () => { if (job) { await api(`/dream/job?${qs({ session: props.sessionId })}`, { id: job.id, action: 'stop' }).catch(() => {}); refresh(); } };
  const scope = { session: '会话', project: '项目', global: '全局' }[job?.scope] || '';
  return <Pill seat={seat} stat="omd-dream" icon={<Dot tone="pink" pulse={Boolean(data.activeJobs)}/>} aria="Dream 整理中"
    label={job ? `Dream ${job.done || 0}/${job.total ?? '—'}` : 'Dream 排队'} title={`Dream ${scope}整理`} footer={<Jump section="memory"/>}>
    {job ? <dl className="omc-kv"><dt>目标</dt><dd>{job.targetTitle || job.target}</dd><dt>进度</dt><dd>{job.done || 0}/{job.total ?? '—'} 个范围</dd>
      <dt>调用</dt><dd>{job.calls || 0} 次</dd><dt>今日额度</dt><dd>{k(data.usage?.used)} / {k(data.dailyTokens)}</dd></dl> : <p className="omc-hint">等待执行</p>}
    {job && ['running', 'queued', 'budget'].includes(job.state) && <Button icon="stop" onClick={stop}>停止</Button>}
  </Pill>;
}

/** Register dock entries; native stat ids come from the bundled host (build-time detection). */
export function applyDock(ctx, composerStats, readMode) {
  const native = createStats(readMode);
  ctx.slots.inject('conversation.composer.dock', function* () {
    for (const { id, order } of composerStats) if (native[id]) {
      yield ctx.slots.register({ name: 'conversation.composer.dock', id, order, priority: -10 }, native[id]);
    }
    yield ctx.slots.register({ name: 'conversation.composer.dock', id: 'omd-context', order: 20 }, ContextDockItem);
    yield ctx.slots.register({ name: 'conversation.composer.dock', id: 'omd-dream', order: 21 }, DreamDockItem);
  });
}
