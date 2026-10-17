import React, { useEffect, useState } from 'react';
import { api, qs, usePoll, Card, Stat, Tag, Select, Search, Table, Pager, Empty, Alert, KV, Button } from './ui.jsx';
import { toneOf, k, clock, ago, statusOf, eventKindLabel, EVENT_KINDS, savedOf } from './model.mjs';

const SIZE = 20;
const STATUSES = [['all', '全部状态'], ['success', '成功'], ['error', '失败'], ['skip', '保留'], ['stale', '已过期']];
const CHOICE = { keep: '保留', detail: '详细', brief: '简略' };

export function EventsSection({ sessionId, visible, range, period, params }) {
  const [kind, setKind] = useState(params?.kind || ''), [status, setStatus] = useState(params?.status || 'all'), [query, setQuery] = useState('');
  const [page, setPage] = useState(1), [expanded, setExpanded] = useState(null);
  useEffect(() => { if (params?.nonce) { setKind(params.kind || ''); setStatus(params.status || 'all'); setPage(1); } }, [params?.nonce]);
  useEffect(() => { setPage(1); setExpanded(null); }, [sessionId, range, period, kind, status, query]);
  const key = JSON.stringify([sessionId, range, period, kind, status, query, page]);
  const { data: d, error, refresh } = usePoll(signal => api(`/monitor/events?${qs({ session: sessionId, range, period, kind, status, query, limit: SIZE, offset: (page - 1) * SIZE })}`, undefined, signal),
    key, { enabled: visible, interval: page === 1 ? 4000 : 600000 });
  const kinds = Object.fromEntries((d?.kinds || []).map(x => [x.key, x]));
  const stat = (id, label, extra) => {
    const x = kinds[id] || { events: 0, errors: 0, savedTokens: 0 };
    return <Stat key={id} label={label} value={x.events} tone={kind === id ? 'blue' : undefined}
      sub={extra ? extra(x) : x.errors ? <span className="omc-red">{x.errors} 次失败</span> : x.lastAt ? ago(x.lastAt) : '暂无'} onClick={() => setKind(kind === id ? '' : id)}/>;
  };
  const savedAll = savedOf(d?.kinds);

  return <div className="omc-section">
    <div className="omc-stats omc-stats-6">
      {stat('prepare', '预处理')}
      {stat('coordinate', '中枢决定')}
      {stat('replace', '自动/手动替换', x => <span className="omc-green">省 ≈{k(x.savedTokens)}</span>)}
      {stat('adaptive', '主动异步')}
      {stat('compactFull', '全量压缩', x => x.savedTokens ? <span className="omc-green">省 ≈{k(x.savedTokens)}</span> : x.lastAt ? ago(x.lastAt) : '暂无')}
      {stat('dream', 'Dream 作业')}
    </div>
    <div className="omc-filters">
      <Search value={query} onChange={setQuery} placeholder="搜索标题或详情"/>
      <Select label="机制" value={kind} onChange={setKind} options={[['', '全部机制'], ...Object.entries(EVENT_KINDS)]}/>
      <Select label="状态" value={status} onChange={setStatus} options={STATUSES}/>
      {(kind || status !== 'all') && <Button onClick={() => { setKind(''); setStatus('all'); }}>清除筛选</Button>}
      <span className="omc-spacer"/>{savedAll > 0 && <span className="omc-muted">筛选期内累计节省 <b className="omc-green">≈{k(savedAll)}</b> tokens</span>}
    </div>
    <Alert action={<Button icon="refresh" onClick={refresh}>重试</Button>}>{error}</Alert>
    <Card flush>
      <Table loading={!d} rows={d?.items || []} rowKey={r => r.id} expanded={expanded} onRow={(r, key) => setExpanded(expanded === key ? null : key)}
        empty={<Empty icon="events" title="暂无后台事件">本版本起记录预处理、中枢决定、替换、压缩、主动异步和 Dream。</Empty>}
        columns={[
          { key: 'at', title: '时间', render: r => <span className="omc-mono">{clock(r.at)}</span> },
          { key: 'kind', title: '机制', render: r => <Tag tone={toneOf(r.kind)}>{eventKindLabel(r.kind)}</Tag> },
          { key: 'title', title: '事件', nowrap: false, className: 'omc-col-grow', render: r => <span className="omc-clamp"><b>{r.title || '—'}</b>{r.detail && <span className="omc-muted"> · {r.detail}</span>}</span> },
          { key: 'count', title: '条数', align: 'right', render: r => r.count ?? '—' },
          { key: 'saved', title: '节省', align: 'right', render: r => r.savedTokens > 0 ? <span className="omc-green">−{k(r.savedTokens)}</span> : '—' },
          { key: 'status', title: '状态', render: r => { const [label, tone] = statusOf(r.status); return <Tag tone={tone} dot>{label}</Tag>; } },
        ]}
        renderExpand={r => <div className="omc-detail">
          {r.detail && <p className="omc-prose">{r.detail}</p>}
          <KV rows={[['会话', <span className="omc-mono">{r.sessionId || '—'}</span>],
            r.inputTokens != null && ['替换前 → 后', `${k(r.inputTokens)} → ${k(r.outputTokens)} tokens`],
            r.data?.tally && ['中枢选择', Object.entries(r.data.tally).map(([a, n]) => `${CHOICE[a] || a} ${n}`).join(' · ')],
            r.data?.originalEvents != null && ['覆盖原始事件', r.data.originalEvents],
            r.data?.documents != null && ['资料 / 附件', `${r.data.documents} / ${r.data.assets}`],
            r.data?.scope && ['Dream 范围', `${r.data.scope}${r.data.auto ? ' · 自动' : ''}`],
            r.data?.count != null && r.status === 'error' && ['连续失败', r.data.count],
            r.data?.costBasis && ['估算口径', r.data.costBasis === 'route-estimate' ? '按路由估算' : '宿主估算']]}/>
        </div>}/>
      <Pager page={page} pages={Math.ceil((d?.total || 0) / SIZE)} total={d?.total} onPage={setPage}/>
    </Card>
  </div>;
}
