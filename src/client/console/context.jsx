import React, { useEffect, useState } from 'react';
import { api, qs, usePoll, useReader, useAction, Card, Stat, Tag, Seg, Table, Steps, StackBar, Ring, Empty, Skeleton, Alert, Button, KV, Icon, Drawer } from './ui.jsx';
import { k, ago, clock, composition } from './model.mjs';
import { Checkbox } from '../native-controls.jsx';
import { OptimizationCard } from '../context-evidence.jsx';

const MODE = { raw: ['原文', 'gray'], detail: ['摘要＋资料', 'blue'], brief: ['仅摘要', 'green'] };
const CHOICE = { keep: '保留原文', detail: '摘要＋资料', brief: '仅摘要' };
const retryText = r => ({ 'waiting-main': '等待主会话成功后恢复', 'waiting-events': '等待新增事件后重试', manual: '重试已暂停', retrying: '等待自动重试' })[r];
const preparationWait = (deferred, minimumTokens) => !deferred ? null : deferred.reason === 'input-budget'
  ? deferred.message || '完整请求超过输入预算，等待调整预算'
  : deferred.reason === 'first-window-budget'
  ? `首批有效内容 ${deferred.events}/${deferred.minimumEvents} 条 · 输入预算不足，请提高预算或手动准备`
  : deferred.reason === 'first-window' ? `首批有效内容 ${deferred.events}/${deferred.minimumEvents} 条 · 等待积累`
    : `有效内容 ≈${k(deferred.estimatedTokens)}${minimumTokens ? `/${k(minimumTokens)}` : ''} tokens · 等待达到最低文本量`;

function preparationStep(c) {
  const progress = c.prepareProgress, failure = c.failures?.prepare;
  const cadenceWait = progress && !progress.initial && progress.current < progress.target
    ? `本轮新增 ${progress.current}/${progress.target} 条 · 还差 ${progress.target - progress.current} 条` : null;
  const waiting = c.manualOperation || c.transactionPending ? '等待当前整理完成'
    : progress?.enabled === false ? '自动预处理已关闭'
      : c.memoryCache?.enabled && c.memoryCache.waitingReason || preparationWait(c.prepareDeferred, c.limits?.continueTokens) || cadenceWait;
  return { key: 'prepare', title: '预处理', running: c.preparing, tone: c.preparing ? 'blue' : failure ? 'red' : 'gray',
    text: c.preparing ? '正在生成摘要' : failure ? `${retryText(c.retry?.prepare) || '失败'}：${failure.message}`
      : waiting || (c.backlog?.events ? '等待可整理的完整片段' : '等待新内容'),
    detail: `待处理总量 ${c.backlog?.events ?? 0} 条 · ≈${k(c.backlog?.estimatedTokens)}` };
}

/** Pipeline lights shared by the overview, this section and the dock popover. */
export function pipelineSteps(c) {
  const preparation = preparationStep(c);
  if (c.bc?.backend === 'bc') return [
    { ...preparation, title: '资料准备', ...(c.preparing ? { text: '正在归档' } : {}) },
    { key: 'archive', title: '档案', tone: 'green', text: `${c.records?.length ?? c.recordCount ?? 0} 段 · Dream 与回查可用` },
    { key: 'bc', title: 'BC 压缩', tone: c.bc.error ? 'red' : 'green', text: c.bc.error || (c.bc.pendingBackend ? '等待切换' : '由 Billion Context 管理') },
  ];
  const adaptive = c.compressionMode === 'adaptive', a = c.adaptive || {};
  const coordError = c.failures?.coordinate;
  const first = adaptive
    ? { key: 'check', title: '主动检查', running: a.running, tone: a.running ? 'blue' : a.error ? 'red' : 'green',
      text: a.running ? '正在判断' : a.error ? `失败：${a.error}` : a.waitingReason || (a.lastDecision === 'skip' ? `保留 · ${a.reason || ''}` : a.lastDecision === 'compress' ? '已准备替换' : '等待新内容') }
    : preparation;
  const second = adaptive
    ? { key: 'plan', title: '替换方案', tone: c.pending ? 'green' : 'gray', text: c.pending ? '结果已准备' : a.lastDecision === 'stale' ? '结果已过期' : '等待整理结果' }
    : { key: 'hub', title: '中枢', running: c.coordinating, tone: c.coordinating ? 'blue' : coordError ? 'red' : c.pending ? 'green' : 'gray',
      text: c.coordinating ? '正在判断范围' : coordError ? `${retryText(c.retry?.coordinate) || '失败'}：${coordError.message}` : c.pending ? `已决定 ${c.pending.choices?.filter(x => x.action !== 'keep').length || 0} 项`
        : c.review?.dueAt ? '等待判断间隔' : c.review?.newRecords > 0 ? `已准备 ${c.review.newRecords} 段 · 累计至 ${c.review.every} 段后判断` : '等待新摘要' };
  const last = c.lastReplacement;
  const third = { key: 'apply', title: '替换', running: c.transactionPending || Boolean(c.manualOperation), tone: c.transactionPending ? 'blue' : c.pending ? 'amber' : last ? 'green' : 'gray',
    text: c.manualOperation ? (c.manualOperation === 'full' ? '正在全量压缩' : '正在压缩') : c.transactionPending ? '正在恢复事务'
      : c.pending ? '等待下一次请求边界' : last ? `${ago(last.at)} · 省 ≈${k(last.stats?.estimatedSavedTokens ?? (last.inputTokens - last.outputTokens))}` : '尚未替换' };
  return [first, second, third];
}

export function ContextSection({ sessionId, visible, go, params }) {
  const view = usePoll(signal => api(`/context?${qs({ session: sessionId })}`, undefined, signal), sessionId, { enabled: visible && Boolean(sessionId) });
  const meter = usePoll(signal => api(`/monitor?${qs({ session: sessionId, range: 'session', period: 'all', view: 'context', limit: 1 })}`, undefined, signal), sessionId, { enabled: visible && Boolean(sessionId), interval: 5000 });
  const action = useAction(view.refresh, sessionId);
  const [filter, setFilter] = useState(params?.filter || 'all');
  const [selected, setSelected] = useState([]), [expanded, setExpanded] = useState(null);
  const documents = useReader(sessionId), doc = documents.value;
  const [confirm, setConfirm] = useState(false), [advanced, setAdvanced] = useState(Boolean(params?.focus === 'advanced'));
  useEffect(() => { if (params?.filter) setFilter(params.filter); }, [params?.filter, params?.nonce]);
  useEffect(() => { setSelected([]); setExpanded(null); setConfirm(false); }, [sessionId]);
  if (!sessionId) return <Empty icon="context" title="先选择一个会话">上下文按会话整理。</Empty>;
  const c = view.data;
  if (!c) return view.error ? <Alert>{view.error}</Alert> : <Skeleton cards={3} rows={5}/>;

  const s = (path, body, ok) => action.run(path, () => api(`${path}?${qs({ session: sessionId })}`, body), ok);
  const locked = Boolean(action.busy || c.manualOperation);
  const adaptive = c.compressionMode === 'adaptive';
  const bc = c.bc?.backend === 'bc';
  const records = (c.records || []).filter(r => !r.mergedInto);
  const shown = records.filter(r => filter === 'all' || (filter === 'raw' ? r.mode === 'raw' : r.mode !== 'raw'));
  const m = meter.data, hostCurrent = m?.meter?.totalTokens, current = bc ? c.bc.status?.sentTokens : hostCurrent, cap = bc ? c.bc.status?.contextLimit : m?.contextCapacity;
  const { parts, estimatedTokens, adjustmentTokens } = composition(m?.frame, hostCurrent, m?.toolsTokens);
  const pending = c.estimate?.pending, compactEst = c.estimate?.compact;
  const after = !bc && current != null && pending && !pending.error ? pending.afterTokens : null;
  const rawLive = records.filter(r => r.live && r.mode === 'raw').length;
  const last = c.lastReplacement;
  const openDoc = id => documents.read(`/context/document?${qs({ session: sessionId, id })}`);

  return <div className="omc-section">
    <OptimizationCard key={sessionId} sessionId={sessionId} enabled={visible}/>
    <div className="omc-toolbar">
      <Seg label="上下文管理" value={bc ? 'bc' : 'omd'} options={[['omd', 'OMD'], ['bc', 'Billion Context']]}
        onChange={backend => !locked && backend !== c.bc?.backend && s('/context/backend', { backend }, result => result.queued ? '已排队，当前请求结束后切换' : '上下文管理方式已切换')}/>
      {!bc && <>
      <Seg label="异步压缩模式" value={adaptive ? 'adaptive' : 'pipeline'} options={[['pipeline', '原版异步'], ['adaptive', '主动异步']]}
        onChange={mode => !locked && mode !== c.compressionMode && s('/context/mode', { mode }, `已切换为${mode === 'adaptive' ? '主动异步' : '原版异步'}`)}/>
      </>}
      <span className="omc-spacer"/>
      <Button icon="spark" busy={action.busy === '/context/prepare'} disabled={locked || (adaptive ? c.adaptive?.running : c.preparing)}
        onClick={() => s('/context/prepare', {}, '已开始')}>{adaptive ? '检查整理' : '准备摘要'}</Button>
      {!adaptive && !bc && <Button icon="hub" busy={action.busy === '/context/coordinate'} disabled={locked || c.coordinating} onClick={() => s('/context/coordinate', {}, '中枢已开始判断')}>运行中枢</Button>}
    </div>
    {bc && <Card title="Billion Context"><p>BC 管理自动压缩；资料归档、Dream、任务与原文回查继续运行。</p>
      <KV rows={[
        ['BC 发送上下文估算', c.bc.status?.sentTokens == null ? '等待请求读数' : `≈${k(c.bc.status.sentTokens)} tokens`],
        ['本地历史', hostCurrent == null ? '未知' : `≈${k(hostCurrent)} tokens`],
        ['状态', c.bc.error || (c.bc.pendingBackend ? '等待切换' : '已启用')],
      ]}/></Card>}
    <Alert tone="info">{action.notice || (c.bc?.pendingBackend ? `已排队：切换为 ${c.bc.pendingBackend === 'bc' ? 'Billion Context' : 'OMD'}` : '')}</Alert><Alert>{action.error || documents.error || c.bc?.switchError}</Alert>

    <div className="omc-grid-2">
      <Card title="上下文占用" icon="context" extra={cap ? <span className="omc-muted">窗口 {k(cap)}</span> : null}>
        <div className="omc-occupancy">
          <div className="omc-ring-wrap"><Ring value={current || 0} max={cap || current || 1} size={64} stroke={7}/><b>{cap && current != null ? `${Math.round(current / cap * 100)}%` : '—'}</b></div>
          <KV rows={[['当前', current == null ? '发送后可读' : `≈${k(current)} tokens`],
            after != null && ['替换后预计', <span className="omc-green">≈{k(after)}（−{k(pending.estimatedSavedTokens)}）</span>],
            compactEst && !compactEst.error && ['/compact-p 预计', `−${k(compactEst.estimatedSavedTokens)}`],
            ['未处理原文', `${c.backlog?.events ?? 0} 条 · ≈${k(c.backlog?.estimatedTokens)}`],
            estimatedTokens != null && ['内容估算', `≈${k(estimatedTokens)} tokens`],
            adjustmentTokens != null && ['计量差额', <span title="总占用与内容估算的差额，来自渠道用量锚点与本地估算的不同，不是额外消息或工具定义。">{adjustmentTokens > 0 ? '+' : ''}{k(adjustmentTokens)}</span>]]}/>
        </div>
        {parts.some(p => p.value) && <>
          <StackBar parts={parts} format={value => `≈${k(value)}`}/>
          <p className="omc-hint">{bc ? '色条展示本地历史构成；圆环展示 BC 发送估算。' : '色条为内容构成占比，不是窗口占用比例；计量差额不计入色条。'}{m?.toolsTokens == null ? '工具定义读数暂不可用，未混入其他项。' : ''}</p>
        </>}
      </Card>
      <Card title={bc ? '资料归档与 BC 压缩' : adaptive ? '主动异步整理' : '预处理 → 中枢 → 替换'} icon="hub">
        <Steps steps={pipelineSteps(c)}/>
        {!adaptive && c.memoryCache?.enabled && <p className="omc-hint">记忆缓存模式 · 最近预处理缓存读取：{c.memoryCache.cacheReadTokens == null ? '渠道未返回' : `${k(c.memoryCache.cacheReadTokens)} tokens`}。</p>}
        {pending && !pending.error ? <div className="omc-callout omc-callout-green">
          <div><strong>{pending.selectedRecords} 段可替换 · {pending.currentMessages} 条消息</strong><span>预计节省 ≈{k(pending.estimatedSavedTokens)} tokens</span></div>
          <Button kind="primary" icon="check" busy={action.busy === '/compact'} disabled={locked}
            onClick={() => s('/compact', {}, r => r.queued ? '已排队，下一次请求边界应用' : r.changed ? '替换已应用，原文仍在日志中' : '没有可应用的结果')}>应用</Button>
        </div> : pending?.error ? <Alert tone="warn">已准备的方案暂不可用：{pending.error}</Alert> : null}
        {c.prepareDeferred && <p className="omc-hint">{preparationWait(c.prepareDeferred, c.limits?.continueTokens)}。</p>}
        {c.manualQueued > 0 && <p className="omc-hint">{c.manualQueued} 项压缩等待请求边界。</p>}
      </Card>
    </div>

    <div className="omc-stats omc-stats-4">
      <Stat label="分段摘要" value={records.length} sub={`${rawLive} 段原文可替换`} onClick={() => setFilter('raw')}/>
      <Stat label="已替换" value={records.filter(r => r.mode !== 'raw').length} sub={`${records.filter(r => r.mode === 'brief').length} 段仅摘要`} onClick={() => setFilter('applied')}/>
      <Stat label="上次替换" value={last ? ago(last.at) : '—'} sub={last?.stats ? `${last.stats.currentMessages} 条 → ${last.stats.resultRecords} 段` : '尚未替换'} onClick={() => go('events', { kind: 'replace' })}/>
      <Stat label="上次节省" tone={last ? 'green' : undefined} value={last ? `≈${k(last.stats?.estimatedSavedTokens ?? (last.inputTokens - last.outputTokens))}` : '—'} sub="同口径估算"/>
    </div>

    <Card title="手动压缩" icon="compress" className="omc-compact">
      <div className="omc-compact-row">
        <div><code>/compact-p</code><strong>已处理片段仅保留摘要</strong><span>{compactEst && !compactEst.error ? `预计 −${k(compactEst.estimatedSavedTokens)} tokens` : '没有可压缩的片段'}</span></div>
        <Button icon="compress" busy={action.busy === '/compact-p'} disabled={locked || !records.some(r => r.live && r.mode !== 'brief')} onClick={() => s('/compact-p', {}, r => r.message || '已压缩')}>压缩</Button>
      </div>
      <div className="omc-compact-row">
        <div><code>/compact-f</code><strong>全量压缩</strong><span>生成全量摘要后替换当前上下文；原始日志保留。</span></div>
        {confirm ? <span className="omc-confirm"><Button kind="danger" busy={action.busy === '/compact-f' || c.manualOperation === 'full'} onClick={() => { setConfirm(false); s('/compact-f', {}, r => r.message || '全量压缩完成'); }}>确认全量压缩</Button><Button onClick={() => setConfirm(false)}>取消</Button></span>
          : <Button icon="compress" busy={c.manualOperation === 'full'} disabled={locked} onClick={() => setConfirm(true)}>全量压缩</Button>}
      </div>
    </Card>

    <Card title="分段摘要" icon="layers" flush extra={<Seg size="sm" label="筛选" value={filter} onChange={v => { setFilter(v); setSelected([]); }}
      options={[['all', '全部', records.length], ['raw', '原文', records.filter(r => r.mode === 'raw').length], ['applied', '已替换', records.filter(r => r.mode !== 'raw').length]]}/>}>
      <Table rows={shown.slice().reverse()} rowKey={r => r.id} expanded={expanded} onRow={(r, key) => setExpanded(expanded === key ? null : key)}
        empty={<Empty icon="layers" title={records.length ? '当前筛选没有内容' : '还没有分段摘要'}>{records.length ? null : adaptive ? '后台决定整理后出现在这里。' : '达到预处理频率后自动生成。'}</Empty>}
        columns={[
          { key: 'sel', title: '', width: 28, render: r => <span className="omc-checkbox-cell" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <Checkbox className="omc-record-checkbox" label="选择" checked={selected.includes(r.id)} disabled={!r.live || locked}
              onChange={checked => setSelected(checked ? [...selected, r.id] : selected.filter(x => x !== r.id))}/></span> },
          { key: 'time', title: '时间段', render: r => <span className="omc-mono">{r.timeStart ? clock(r.timeStart).slice(0, 11) : '—'}{r.timeEnd ? '–' + clock(r.timeEnd).slice(6, 11) : ''}</span> },
          { key: 'mode', title: '状态', render: r => <>{<Tag tone={MODE[r.mode]?.[1]}>{MODE[r.mode]?.[0] || r.mode}</Tag>}{!r.live && <Tag tone="gray">已退出</Tag>}</> },
          { key: 'events', title: '原文', align: 'right', render: r => `${r.originalEventCount} 条` },
          { key: 'docs', title: '资料', align: 'right', render: r => `${r.documentCount || 0} · ${r.assetCount || 0}` },
          { key: 'summary', title: '摘要', nowrap: false, className: 'omc-col-grow', render: r => <span className="omc-clamp">{r.summary}</span> },
        ]}
        renderExpand={r => <div className="omc-detail">
          <p className="omc-prose">{r.summary}</p>
          <div className="omc-detail-foot"><span className="omc-mono omc-muted">{r.id.slice(0, 8)} · {(r.ranges || []).map(x => `#${x.from}–${x.to}`).join(' ')}</span>
            <Button icon="context" onClick={() => openDoc(r.id)}>查看资料与附件</Button></div>
        </div>}/>
      {selected.length > 0 && <div className="omc-selbar"><span>已选 <b>{selected.length}</b> 段</span><span className="omc-spacer"/>
        <Button onClick={() => setSelected([])}>取消</Button>
        <Button disabled={locked} onClick={() => s('/compact', { ids: selected, mode: 'detail' }, '已替换为摘要＋资料').then(result => result && setSelected([]))}>摘要＋资料</Button>
        <Button kind="primary" disabled={locked} onClick={() => s('/compact', { ids: selected, mode: 'brief' }, '已替换为仅摘要').then(result => result && setSelected([]))}>仅摘要</Button></div>}
    </Card>

    <details className="omc-advanced" open={advanced || undefined} onToggle={e => setAdvanced(e.currentTarget.open)}>
      <summary><Icon name="chevron" size={13}/>高级：中枢决定 · Trace · 通知</summary>
      <div className="omc-grid-2">
        <Card title="中枢最近的选择">
          {c.review?.choices?.length ? <ul className="omc-feed">{c.review.choices.map((x, i) => <li key={i}><Tag tone={x.action === 'keep' ? 'gray' : x.action === 'brief' ? 'green' : 'blue'}>{CHOICE[x.action] || x.action}</Tag>
            <span className="omc-feed-text omc-mono">{x.ids?.map(id => id.slice(0, 8)).join('、')}</span>{x.reason && <span className="omc-muted">{x.reason}</span>}</li>)}</ul> : <Empty title="还没有完成的判断"/>}
          {c.review?.lastRejection && <Alert tone="warn">最近被拒绝：{c.review.lastRejection.message}</Alert>}
        </Card>
        <Card title="通知" extra={<span className="omc-muted">{c.trace ? `Trace 来自 #${c.trace.sourceSeq}` : '无前置推理'}</span>}>
          {c.notices?.length ? <ul className="omc-feed">{c.notices.slice().reverse().map((n, i) => <li key={i}><time>{clock(n.at).slice(6)}</time><span className="omc-feed-text">{n.text}</span></li>)}</ul> : <Empty title="暂无通知"/>}
        </Card>
      </div>
    </details>
    {doc && <RecordDrawer record={doc} sessionId={sessionId} onClose={() => documents.close()}/>}
  </div>;
}

export function RecordDrawer({ record: r, sessionId, onClose, assetBase }) {
  const url = i => assetBase ? assetBase(r, i) : `oh-my-dsh/api/context/asset?${qs({ session: r.requestSessionId || r.sessionId || sessionId, id: r.id, asset: i + 1 })}`;
  return <Drawer title="摘要与详细资料" onClose={onClose}>
    {r.loading ? <Skeleton rows={6}/> : <>
      <div className="omc-drawer-meta"><code>{r.id}</code><span>{clock(r.timeStart)} — {clock(r.timeEnd)}</span></div>
      <Card title="基础摘要"><p className="omc-prose">{r.summary}</p></Card>
      {r.decisions?.length > 0 && <Card title="用户决定">{r.decisions.map((d, i) => <p className="omc-prose" key={i}>{d.text}<small className="omc-muted"> · #{d.seq}「{d.quote}」</small></p>)}</Card>}
      {(r.documents || []).map((d, i) => <Card key={i} title={d.title} extra={<Tag>{String(i + 1).padStart(2, '0')}</Tag>}><pre className="omc-pre">{d.text}</pre></Card>)}
      {(r.assets || []).map((a, i) => <Card key={'a' + i} title={`${a.block.attachment?.name || a.block.type} · 附件 ${i + 1}`}>
        {a.block.type === 'image' && <img src={url(i)} alt={`附件 ${i + 1}`} loading="lazy" className="omc-img"/>}
        <a href={url(i)} target="_blank" rel="noopener noreferrer" className="omc-link">打开原件</a></Card>)}
      {!(r.documents || []).length && !(r.assets || []).length && <Empty title="没有附加资料"/>}
    </>}
  </Drawer>;
}
