import React, { useState } from 'react';
import { DisclosureRow } from '@deepseek-ai/dsh-client-ui-primitives';
import { Button, Input, Choice } from './native-controls.jsx';
import { api, qs, usePoll, useReader, Card, Stat, Alert } from './console/ui.jsx';
import { decorateSlotComponent } from './slot-decoration.mjs';

function references(root, found = new Set()) {
  if (!root || root.isError) return [...found];
  for (const block of root.content ?? []) if (block.type === 'text') for (const match of block.text.matchAll(/\bomd-raw:[a-f0-9-]{36}\b/g)) found.add(match[0]);
  for (const child of root.subCalls ?? []) references(child, found);
  return [...found];
}
export function EvidenceReader({ sessionId, rawRef }) {
  const reader = useReader(sessionId + ':' + rawRef);
  const [open, setOpen] = useState(false), [downloading, setDownloading] = useState(false), [downloadError, setDownloadError] = useState('');
  const busy = downloading || Boolean(reader.value?.loading), page = reader.value?.loading ? null : reader.value, error = downloadError || reader.error;
  const [mode, setMode] = useState('head'), [query, setQuery] = useState(''), [startLine, setStartLine] = useState('1');
  async function read(nextMode = mode, cursor) {
    setOpen(true); setDownloadError(''); setMode(nextMode);
    await reader.read(`/context/evidence?${qs({ session: sessionId, rawRef, mode: nextMode, cursor, query: nextMode === 'query' ? query : undefined, startLine: nextMode === 'range' ? startLine : undefined })}`);
  }
  async function download() {
    setDownloading(true); setDownloadError('');
    try {
      const bundle = await api(`/context/evidence/export?${qs({ session: sessionId, rawRef })}`);
      const href = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = href; link.download = `omd-evidence-${rawRef.slice(8)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (e) { setDownloadError(e.message); } finally { setDownloading(false); }
  }
  return <DisclosureRow title="查看原文" open={open} expandable expandOnRowClick onToggle={() => { if (open) { setOpen(false); reader.close(); } else void read(); }}>
    <div className="omd-record-body">
      <div className="omc-toolbar">
        <Button size="sm" disabled={busy} onClick={() => read('head')}>开头</Button><Button size="sm" disabled={busy} onClick={() => read('tail')}>结尾</Button>
        <Input aria-label="原文起始行" value={startLine} onChange={e => setStartLine(e.target.value)} style={{ width: 90 }}/><Button size="sm" disabled={busy} onClick={() => read('range')}>跳转行</Button>
        <Input aria-label="原文搜索" placeholder="在原文中搜索" value={query} onChange={e => setQuery(e.target.value)}/><Button size="sm" disabled={busy || !query.trim()} onClick={() => read('query')}>查找</Button>
        <Button size="sm" disabled={busy} onClick={download}>导出原文档案</Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {page && <><small>{page.rawComplete ? '已保存完整的获准原文' : '来源工具只提供了部分内容'} · 字符 {page.startCharacter ?? 0}–{page.endCharacter ?? 0} / {page.totalCharacters ?? 0}</small><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{page.text || '没有匹配内容'}</pre>
        {page.nextCursor && <Button size="sm" disabled={busy} onClick={() => read(mode, page.nextCursor)}>下一页</Button>}</>}
    </div>
  </DisclosureRow>;
}
export function OptimizationCard({ sessionId, enabled }) {
  const stats = usePoll(signal => api(`/context/optimization?${qs({ session: sessionId })}`, undefined, signal), sessionId, { enabled: enabled && Boolean(sessionId), interval: 5000 });
  const evidence = usePoll(signal => api(`/context/evidence?${qs({ session: sessionId })}`, undefined, signal), sessionId, { enabled: enabled && Boolean(sessionId), interval: 15000 });
  const [selection, setSelection] = useState({ sessionId, ref: '' }), [error, setError] = useState('');
  const selected = selection.sessionId === sessionId ? selection.ref : '';
  const data = stats.data;
  const reasons = { reduced: '结果已精简', baseline: '已保存读取基线', 'no-benefit': '精简无净收益', ineligible: '内容无需精简', protected: '保留回执或错误', 'owner-finalized': '由工具管理展示', disabled: '优化已关闭', fallback: '失败后保留原文', 'not-triggered': '本次未触发规则', 'projection-changed': '后续请求改变，本次未归因' };
  async function restore(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { await api(`/context/evidence/import?${qs({ session: sessionId })}`, JSON.parse(await file.text())); setError(''); evidence.refresh(); }
    catch (e) { setError(e.message); }
  }
  return <Card title={`上下文优化${data ? data.enabled ? ' · 已开启' : ' · 已关闭' : ''}`}>
    <p>本会话的工具与 SDK 优化；不含历史摘要压缩。净输入减少为同请求对照估算，已扣除工具发现和原文回查内容；实际用量和费用见监控页。</p>
    {data && <>
      <p>{data.since ? `自 ${new Date(data.since).toLocaleString()} 起 · 成功 ${data.requests} / ${data.attempts} 次请求` : '尚无请求记录'} · {data.persistent ? '已保存，重启后保留' : '当前进程记录'}{data.failures ? ` · 失败 ${data.failures}` : ''}{data.cancelled ? ` · 取消 ${data.cancelled}` : ''}</p>
      {data.persistenceError && <Alert>{data.persistenceError}</Alert>}
      <div className="omc-stats"><Stat label="估算净输入减少 ≈" value={data.requests ? data.estimatedNetTokens.toLocaleString() : '—'}/><Stat label="回查开销 ≈" value={data.recallTokens.toLocaleString()}/><Stat label="工具发现开销 ≈" value={data.discoveryTokens.toLocaleString()}/><Stat label="失败回退" value={data.fallbacks}/></div>
      {data.lastRequest && <p>最近请求：≈{data.lastRequest.beforeTokens.toLocaleString()} → ≈{data.lastRequest.afterTokens.toLocaleString()} tokens · 优化处理 {data.lastRequest.processingMs.toFixed(1)} ms</p>}
      {Object.keys(data.pendingDecisions ?? {}).length > 0 && <p>本轮工具结果已处理，等待下一次模型请求计入效果。</p>}
      <details><summary>处理情况与规则</summary>
        {Object.entries(data.decisions ?? {}).map(([reason, count]) => <p key={reason}>{reasons[reason] ?? reason} · {count} 次</p>)}
        {Object.entries(data.rules ?? {}).map(([rule, value]) => <p key={rule}>{rule} · 覆盖 {value.requests} 次请求 · 减少 ≈{value.savedTokens} tokens{value.images ? ` · ${value.images} 次相同图片折叠` : ''}</p>)}
      </details>
    </>}
    <div className="omc-toolbar"><Choice aria-label="已保存原文" value={selected} onChange={ref => setSelection({ sessionId, ref })} options={[{ value: '', label: '选择原文' }, ...(evidence.data?.records ?? []).map(r => ({ value: r.ref, label: `${r.tool} · ${r.characters} 字符 · ${new Date(r.createdAt).toLocaleString()}` }))]}/>
      <label>导入原文档案 <input type="file" accept="application/json,.json" onChange={restore}/></label></div>
    {error && <Alert>{error}</Alert>}{selected && <EvidenceReader key={sessionId + selected} sessionId={sessionId} rawRef={selected}/>}
  </Card>;
}
export function applyEvidenceRecords(ctx) {
  ctx.effect(() => decorateSlotComponent(ctx.slots, 'conversation.chat.node', key => key === 'tool-call', original => {
    const Original = original.component;
    return function EvidenceTool(props) {
      const refs = references(props.node?.data?.root);
      return <><Original {...props}/>{refs.map(ref => <EvidenceReader key={props.sessionId + ref} sessionId={props.sessionId} rawRef={ref}/>)}</>;
    };
  }));
}
