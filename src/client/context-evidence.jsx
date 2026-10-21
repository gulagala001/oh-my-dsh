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
  async function restore(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { await api(`/context/evidence/import?${qs({ session: sessionId })}`, JSON.parse(await file.text())); setError(''); evidence.refresh(); }
    catch (e) { setError(e.message); }
  }
  return <Card title={`上下文优化${data ? data.enabled ? ' · 已开启' : ' · 已关闭' : ''}`}>
    <p>请求节省量为估算；实际用量和费用以监控页为准。原文档案需与对应会话一起保留。</p>
    {data && <div className="omc-stats"><Stat label="估算净减少 ≈" value={(data.estimatedSavedTokens - data.recallTokens - data.discoveryTokens).toLocaleString()}/><Stat label="回查开销 ≈" value={data.recallTokens.toLocaleString()}/><Stat label="工具发现开销 ≈" value={data.discoveryTokens.toLocaleString()}/><Stat label="失败回退" value={data.fallbacks}/></div>}
    {data?.rules && <details><summary>各规则效果</summary>{Object.entries(data.rules).map(([rule, value]) => <p key={rule}>{rule} · {value.requests} 次 · 省 ≈{value.savedTokens} tokens · {value.elapsedMs} ms{value.images ? ` · ${value.images} 张截图折叠` : ''}</p>)}</details>}
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
