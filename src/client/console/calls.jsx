import React, { useEffect, useState } from 'react';
import { api, qs, usePoll, Card, Tag, Select, Search, Table, Pager, Empty, Alert, KV, Button } from './ui.jsx';
import { kindLabel, toneOf, k, clock, tokens, cacheRatio, cacheTitle, duration, money, apiPrice, statusOf } from './model.mjs';
import { PricesDrawer } from './prices.jsx';
import { Usage } from './usage.jsx';

const SIZE = 20;
const blank = { kind: '', model: '', provider: '', status: 'all', query: '' };
const pick = params => Object.fromEntries(Object.keys(blank).map(key => [key, params?.[key] ?? blank[key]]));

export function CallsSection({ sessionId, visible, range, period, params }) {
  const [filter, setFilter] = useState(() => pick(params));
  const [pricesOpen, setPricesOpen] = useState(false);
  const [cursors, setCursors] = useState(['']), [page, setPage] = useState(1), [expanded, setExpanded] = useState(null);
  useEffect(() => { if (params?.nonce) { setFilter(pick(params)); reset(); } }, [params?.nonce]);
  const reset = () => { setCursors(['']); setPage(1); setExpanded(null); };
  useEffect(reset, [sessionId, range, period]);
  const set = patch => { setFilter(f => ({ ...f, ...patch })); reset(); };
  const cursor = cursors[page - 1] || '';
  const key = JSON.stringify([sessionId, range, period, filter, cursor]);
  const live = page === 1;
  const { data: d, error, refresh } = usePoll(signal => api(`/monitor?${qs({ session: sessionId, range, period, view: 'calls', limit: SIZE, cursor, ...filter })}`, undefined, signal),
    key, { enabled: visible, interval: live ? 4000 : 600000 });
  const go = next => {
    if (next > page && d?.nextCursor) setCursors(list => { const copy = list.slice(0, page); copy[page] = d.nextCursor; return copy; });
    setPage(next); setExpanded(null);
  };
  const t = d?.totals || {}, f = d?.filters || {};
  const pages = d ? Math.max(1, Math.ceil((d.activityTotal || 0) / SIZE)) : 1;
  const models = (f.models || []).filter(m => !filter.provider || m.provider === filter.provider);
  const active = Object.entries(filter).filter(([key, v]) => v && v !== 'all' && key !== 'query').length;

  return <div className="omc-section">
    <p className="omc-footnote">这里记录模型调用结果；摘要等产物是否通过校验，请看后台日志。本地图片预检单列为恢复事件，不计作上游调用失败。</p>
    <div className="omc-filters">
      <Search value={filter.query} onChange={query => set({ query })} placeholder="搜索模型、类型或错误"/>
      <Select label="类型" value={filter.kind} onChange={kind => set({ kind })} options={[['', '全部类型'], ...(f.kinds || []).map(x => [x, kindLabel(x)])]}/>
      <Select label="提供方" value={filter.provider} onChange={provider => set({ provider, model: '' })} options={[['', '全部提供方'], ...(f.providers || []).map(x => [x, x])]}/>
      <Select label="模型" value={filter.model} onChange={model => set({ model })} options={[['', '全部模型'], ...models.map(m => [m.model, m.model])]}/>
      <Select label="状态" value={filter.status} onChange={status => set({ status })} options={[['all', '全部状态'], ['error', '失败'], ['cancelled', '已取消']]}/>
      {active > 0 && <Button onClick={() => set(blank)}>清除筛选</Button>}
      <Button onClick={() => setPricesOpen(true)}>API 价格</Button>
    </div>
    <div className="omc-summary-line">
      <span>调用 <b>{(t.calls || 0).toLocaleString()}</b></span><span>Token <b>{k(tokens(t))}</b></span><Usage metric={t}/>
      <span title={cacheTitle(t)}>缓存命中 <b>{cacheRatio(t)}</b></span>
      {t.errors > 0 && <span className="omc-red">失败 <b>{t.errors}</b></span>}<span>总耗时 <b>{duration(t.durationMs)}</b></span>
    </div>
    <Alert action={<Button icon="refresh" onClick={refresh}>重试</Button>}>{error}</Alert>
    <Card flush>
      <Table loading={!d} rows={d?.activity || []} rowKey={row => row.id} expanded={expanded} onRow={(row, key) => setExpanded(expanded === key ? null : key)}
        empty={<Empty icon="calls" title={active || filter.query ? '没有匹配的调用' : '还没有调用记录'}/>}
        columns={[
          { key: 'at', title: '时间', render: r => <span className="omc-mono">{clock(r.at)}</span> },
          { key: 'kind', title: '类型', render: r => <Tag tone={toneOf(r.kind)}>{kindLabel(r.kind)}</Tag> },
          { key: 'model', title: '模型', render: r => <span className="omc-mono omc-ellipsis" title={`${r.provider || ''} / ${r.model || ''}`}>{r.model || '—'}</span> },
          { key: 'usage', title: '用量', render: r => <Usage metric={r.usage || {}}/> },
          { key: 'first', title: '首字', align: 'right', render: r => <span title="请求发出至首次文本、推理或工具调用增量（TTFT）">{duration(r.firstTokenMs)}</span> },
          { key: 'dur', title: '耗时', align: 'right', render: r => duration(r.durationMs) },
          { key: 'cost', title: '费用', align: 'right', render: r => <span title={r.price ? `API 单价（输入 / 输出，每百万 Token）：${apiPrice(r.price)} · ${r.price.providerName}` : '未找到公开 API 价格'}>{r.cost ? money(r.cost) : r.price ? <small>API {apiPrice(r.price)} / M</small> : '未收录'}</span> },
          { key: 'status', title: '状态', render: r => { const [label, tone] = statusOf(r.status); return <Tag tone={tone} dot>{label}</Tag>; } },
        ]}
        renderExpand={r => <div className="omc-detail"><KV rows={[
          ['提供方 / 模型', `${r.provider || '—'} / ${r.model || '—'}`], ['推理强度', r.effort || '—'],
          ['会话', <span className="omc-mono">{r.sessionId || '—'}</span>], ['回合 / 步', `${r.turn ?? '—'} / ${r.step ?? '—'}`],
          ['未缓存输入', k(r.usage?.inputTokens)], ['缓存读 / 写', `${k(r.usage?.cacheReadTokens)} / ${k(r.usage?.cacheWriteTokens)}`],
          ['推理 Token', k(r.usage?.reasoningTokens)], ['总计', k(tokens(r.usage || {}))], ['来源', r.source],
          ['首字耗时（TTFT）', duration(r.firstTokenMs)], ['费用', r.cost ? money(r.cost) : r.price ? '未返回完整用量，参见 API 单价' : '未收录'],
          ['API 单价 · 输入 / 输出（百万 Token）', apiPrice(r.price)],
          r.price && ['缓存读 / 写单价（百万 Token）', `${r.price.currency} ${r.price.cacheReadTokens ?? '未公开'} / ${r.price.cacheWriteTokens ?? '未公开'}`],
          r.price && ['价格来源', <span>{r.price.providerName} · {r.price.model}{r.price.threshold != null ? ` · 输入 >${k(r.price.threshold)}` : ''}{r.price.url && <> · <a href={r.price.url} target="_blank" rel="noreferrer">价格库</a></>}</span>],
          r.price?.cacheFallback?.length > 0 && ['缓存计费口径', `${r.price.cacheFallback.map(key => key === 'cacheReadTokens' ? '缓存读' : '缓存写').join('、')}未单列价格，按输入价计算`],
          r.error && ['错误', <span className="omc-red">{r.error}</span>]]}/></div>}/>
      <Pager page={page} pages={d?.nextCursor ? Math.max(pages, page + 1) : page} total={d?.activityTotal} onPage={go}/>
    </Card>
    <p className="omc-footnote">API 价格自动匹配并更新；费用使用对应单价与调用用量计算。未返回用量仍显示 API 单价。</p>
    {d?.coverage?.message && <p className="omc-footnote">{d.coverage.message}</p>}
    {pricesOpen && <PricesDrawer onClose={() => setPricesOpen(false)} onSaved={refresh}/>}
  </div>;
}
