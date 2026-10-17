import React, { useEffect, useRef, useState } from 'react';
import { api, qs, usePoll, Drawer, Card, Button, Alert, Empty, Search, Select, Table, Pager } from './ui.jsx';

const rates = [['inputTokens', '未缓存输入'], ['cacheReadTokens', '缓存读'], ['cacheWriteTokens', '缓存写'], ['outputTokens', '输出']];
const blank = () => ({ provider: '', model: '', currency: 'USD', id: crypto.randomUUID() });
const rateText = (row, key) => row[key] == null ? '未单列' : `${row.currency} ${row[key]}`;

export function PricesDrawer({ onClose, onSaved }) {
  const [prices, setPrices] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(''), [provider, setProvider] = useState(''), [page, setPage] = useState(1);
  const lifecycle = useRef(null);
  const { data, error: catalogError, refresh } = usePoll(signal => api(`/monitor/prices?${qs({ query, provider, offset: (page - 1) * 20, limit: 20 })}`, undefined, signal),
    JSON.stringify([query, provider, page]), { interval: 60000 });
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller;
    api('/settings', undefined, controller.signal).then(c => { if (!controller.signal.aborted) setPrices((c.monitorPrices || []).map(p => ({ ...p, id: crypto.randomUUID() }))); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);
  const change = (id, key, value) => setPrices(list => list.map(p => p.id === id ? { ...p, [key]: value } : p));
  const save = async e => {
    e.preventDefault(); if (busy || !prices) return;
    const { signal } = lifecycle.current;
    setBusy(true); setError('');
    try {
      const monitorPrices = prices.map(p => ({ provider: p.provider.trim(), model: p.model.trim(), currency: p.currency.trim().toUpperCase(),
        ...Object.fromEntries(rates.filter(([key]) => p[key] !== '' && p[key] != null).map(([key]) => [key, Number(p[key])])) }));
      await api('/settings', { monitorPrices });
      if (!signal.aborted) { onSaved(); onClose(); }
    } catch (e) { if (!signal.aborted) setError(e.message); }
    finally { if (!signal.aborted) setBusy(false); }
  };
  return <Drawer title="API 价格" onClose={onClose}>
    <p className="omc-footnote">默认自动匹配公开 API 价格，每天自动更新；离线继续使用内置价格和上次成功缓存。无需手动配置，中转模型自动匹配同名模型。</p>
    <Alert action={<Button onClick={refresh}>重试</Button>}>{catalogError}</Alert>
    {data && <div className="omc-summary-line"><span>已收录 <b>{data.catalogTotal.toLocaleString()}</b> 条价格 · {data.providerCount} 个提供方</span><span>更新于 {new Date(data.updatedAt).toLocaleString('zh-CN')}</span><a href={data.source} target="_blank" rel="noreferrer">价格来源</a></div>}
    {data?.error && <Alert tone="info">{data.error}，继续使用已有价格。</Alert>}
    <div className="omc-filters">
      <Search value={query} onChange={value => { setQuery(value); setPage(1); }} placeholder="搜索模型或提供方价格"/>
      <Select label="价格提供方" value={provider} onChange={value => { setProvider(value); setPage(1); }} options={[
        ['', '全部提供方'], ...Object.entries(data?.providers || {}).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => [id, name]),
      ]}/>
    </div>
    <Card flush className="omc-price-list">
      <Table loading={!data && !catalogError} rows={data?.items || []} rowKey={r => `${r.provider}/${r.model}`} empty={<Empty title="没有匹配的公开价格"/>}
        columns={[
          { key: 'model', title: '模型', render: r => <span className="omc-mono">{r.model}{r.tiers.length > 0 && <small> · 阶梯价</small>}</span> },
          { key: 'provider', title: '提供方', render: r => r.providerName },
          ...rates.map(([key, title]) => ({ key, title, align: 'right', render: r => rateText(r, key) })),
        ]}/>
      <Pager page={page} pages={Math.ceil((data?.total || 0) / 20)} total={data?.total} onPage={setPage}/>
    </Card>
    <p className="omc-footnote">单价单位：每百万 Token。长上下文按用量自动选择阶梯；未单列缓存费率时按输入价计算，展开调用可查看所用口径。</p>
    <Card title="自定义覆盖（可选）">
      <p className="omc-footnote">仅特殊中转价需要设置，按提供方与模型精确匹配并优先于自动价格。币种可用 USD、CNY 等三位代码；空白表示未知，0 表示免费。</p>
      <Alert>{error}</Alert>
      {prices && <form className="omc-form" onSubmit={save}>
        {prices.map(p => <Card key={p.id} title={`${p.provider || '提供方'} / ${p.model || '模型'}`} extra={<Button disabled={busy} onClick={() => setPrices(list => list.filter(row => row.id !== p.id))}>移除</Button>}>
          <div className="omc-form-grid">
            <label>提供方<input required maxLength={256} disabled={busy} value={p.provider} onChange={e => change(p.id, 'provider', e.target.value)}/></label>
            <label>模型<input required maxLength={256} disabled={busy} value={p.model} onChange={e => change(p.id, 'model', e.target.value)}/></label>
            <label>币种<input required pattern="[A-Za-z]{3}" maxLength={3} disabled={busy} value={p.currency} onChange={e => change(p.id, 'currency', e.target.value)}/></label>
            {rates.map(([key, label]) => <label key={key}>{label} / 百万 Token<input type="number" min="0" step="any" placeholder="未知" disabled={busy} value={p[key] ?? ''} onChange={e => change(p.id, key, e.target.value)}/></label>)}
          </div>
        </Card>)}
        <div className="omc-summary-line"><Button disabled={busy} onClick={() => setPrices(list => [...list, blank()])}>添加覆盖</Button><Button type="submit" kind="primary" busy={busy}>保存覆盖</Button></div>
      </form>}
    </Card>
  </Drawer>;
}
