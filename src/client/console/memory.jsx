import React, { useEffect, useState } from 'react';
import { api, qs, usePoll, useReader, useAction, Card, Tag, Seg, Search, Table, Empty, Skeleton, Alert, Button, KV, Drawer, StackBar, Dot, Icon } from './ui.jsx';
import { k, clock, ago } from './model.mjs';
import { RecordDrawer } from './context.jsx';
import { Button as NativeButton } from '../native-controls.jsx';
import { openOmdSettings } from '../settings-nav.mjs';

const JOB = { queued: ['排队', 'gray'], running: ['整理中', 'blue'], paused: ['已停止', 'amber'], budget: ['等待额度', 'amber'], failed: ['失败', 'red'], complete: ['完成', 'green'] };
const jobNotice = job => job.state === 'paused' ? job.notice || '已停止，已完成部分保留' : `Dream 作业：${JOB[job.state]?.[0] || job.state}`;
const openDreamSettings = () => { try { openOmdSettings('dream'); } catch (error) { console.error(error); } };
const SCOPE = { session: '会话', project: '项目', global: '全局' };
const folderName = path => path === '@unclassified' ? '未归类' : path?.split(/[\\/]/).filter(Boolean).at(-1) || '项目';

export function MemorySection({ sessionId, visible, params }) {
  const { data: d, error, refresh } = usePoll(signal => api(`/dream?${qs({ session: sessionId })}`, undefined, signal), sessionId, { enabled: visible, interval: 4000 });
  const action = useAction(refresh, sessionId);
  const [layer, setLayer] = useState(params?.layer || 'session');
  const [project, setProject] = useState(''), [target, setTarget] = useState(null);
  const [search, setSearch] = useState(''), [cursors, setCursors] = useState(['']), [page, setPage] = useState(0);
  const sources = useReader(sessionId), documents = useReader(sessionId), reader = sources.value, doc = documents.value;
  useEffect(() => { setTarget(null); setProject(''); setCursors(['']); setPage(0); }, [sessionId]);
  useEffect(() => { if (params?.layer) setLayer(params.layer); if (params?.focus === 'settings') openDreamSettings(); }, [params?.nonce]);
  useEffect(() => { setCursors(['']); setPage(0); }, [layer, project, target, search]);
  const pid = project || d?.session?.project || '';
  const sid = target?.id || sessionId;
  const catalogPath = layer === 'global' ? `/dream/catalog?${qs({ kind: 'project', query: search, cursor: cursors[page] })}`
    : layer === 'project' ? `/dream/catalog?${qs({ kind: 'session', project: pid, query: search, cursor: cursors[page] })}`
    : `/dream/read?${qs({ sessionId: sid, query: search, cursor: cursors[page] })}`;
  const catalog = usePoll(signal => api(catalogPath, undefined, signal), `${catalogPath}:${d?.catalogRevision}`, { enabled: visible && Boolean(d) && (layer !== 'session' || Boolean(sid)), interval: 30000 });

  if (!d) return error ? <Alert>{error}</Alert> : <Skeleton cards={3} rows={5}/>;
  const run = scope => action.run('run:' + scope, () => api(`/dream/run?${qs({ session: sessionId })}`, { scope, sessionId: sid, project: pid }), jobNotice);
  const job = (id, act) => action.run('job:' + id, () => api(`/dream/job?${qs({ session: sessionId })}`, { id, action: act }), jobNotice);
  const read = args => sources.read(`/dream/read?${qs(args)}`, { loading: true, args, back: reader?.value ? reader : null },
    value => ({ args, value: { ...value, args }, back: reader?.value ? reader : null }));
  const openDoc = (session, id) => documents.read(`/dream/document?${qs({ sessionId: session, id })}`);

  const memory = layer === 'global' ? d.globalMemory : layer === 'project' ? (pid === d.session?.project ? d.projectMemory : null) : (sid === d.session?.id ? d.sessionMemory : null);
  const used = d.usage?.used || 0, daily = d.settings?.dailyTokens || 0;
  const jobs = d.jobs || [], active = jobs.find(j => j.state === 'running') || jobs.find(j => ['queued', 'budget'].includes(j.state));
  const entries = catalog.data?.entries || [];

  return <div className="omc-section">
    <div className="omc-grid-3">
      <Card title="今日 Dream 额度" icon="coin">
        <div className="omc-big">{k(used)}<small> / {k(daily)}</small></div>
        <StackBar legend={false} total={daily || 1} parts={[{ key: 'u', name: '已用', value: used, color: used / daily > .9 ? 'var(--omc-red)' : 'var(--omc-pink)' }]}/>
        <p className="omc-hint">{d.usage?.resetsAt ? `${clock(d.usage.resetsAt).slice(0, 11)} 重置 · 手动与自动共用` : ''}</p>
      </Card>
      <Card title="自动整理" icon="refresh" extra={<Button icon="settings" onClick={openDreamSettings}>设置</Button>}>
        <div className="omc-big"><Dot tone={d.settings?.enabled ? 'green' : 'gray'}/> {d.settings?.enabled ? '已开启' : '已关闭'}</div>
        <p className="omc-hint">{d.settings?.enabled ? `每 ${Math.round((d.settings.intervalMs || 0) / 60000)} 分钟检查 · ${d.settings.model ? d.settings.model : '未固定后台模型'}` : '开启后按项目整理共享会话，再更新全局短记忆。'}</p>
        {d.notice && <Alert tone="warn">{d.notice}</Alert>}
      </Card>
      <Card title="作业" icon="memory">
        {active ? <JobLine job={active} busy={action.busy} onJob={job}/> : <div className="omc-big omc-muted">空闲</div>}
        <p className="omc-hint">{jobs.length ? `最近 ${jobs.length} 个作业 · ${jobs.filter(j => j.state === 'complete').length} 完成` : '还没有作业'}</p>
      </Card>
    </div>
    <Alert tone="info">{action.notice}</Alert><Alert>{action.error || sources.error || documents.error || d.indexError}</Alert>
    {d.indexWarnings?.length > 0 && <details className="omc-advanced omc-warnings">
      <summary><Icon name="chevron" size={13}/>{d.indexWarnings.length} 个会话暂不可读取 · 不参与汇总，原始日志保留，修复后点目录刷新重试</summary>
      <ul className="omc-feed">{d.indexWarnings.map(item => <li key={item.sessionId}><Tag tone="amber">不可读</Tag><span className="omc-feed-text" title={item.error}><b>{item.title || item.sessionId}</b><span className="omc-muted"> · {item.error}</span></span></li>)}</ul>
    </details>}

    <div className="omc-toolbar">
      <Seg label="记忆层级" value={layer} onChange={v => { setLayer(v); if (v !== 'session') setTarget(null); }}
        options={[['session', target ? '会话 · ' + (target.title || '已选') : '当前会话'], ['project', '项目 · ' + folderName(pid)], ['global', '全局']]}/>
      <span className="omc-spacer"/>
      <Button icon="play" busy={action.busy === 'run:' + layer} disabled={(layer === 'session' && !sid) || (layer === 'project' && !pid)} onClick={() => run(layer)}>整理{SCOPE[layer]}</Button>
    </div>

    <Card title={`${SCOPE[layer]}短记忆`} icon="memory" extra={memory && <>{memory.invalid ? <Tag tone="amber">待更新</Tag> : <Tag tone="pink">v{memory.revision}</Tag>}<span className="omc-muted">{ago(memory.updatedAt)}</span></>}>
      {memory ? <MemoryText text={memory.invalid ? memory.notice : memory.summary}/>
        : <Empty icon="memory" title="尚未生成" action={<Button onClick={() => read({ memory: layer, project: pid, sessionId: layer === 'session' ? sid : undefined })}>读取短记忆与来源</Button>}>运行对应范围的 Dream 后显示在这里。</Empty>}
      {memory && <div className="omc-detail-foot"><span className="omc-muted">{clock(memory.updatedAt)}</span><Button icon="external" onClick={() => read({ reference: memory.ref })}>查看来源</Button></div>}
      {layer === 'session' && d.session?.id === sid && d.session && !d.session.shared && <p className="omc-hint">独立会话：本会话 Dream 不进入项目或全局记忆。</p>}
    </Card>

    <Card flush title={layer === 'global' ? '项目目录' : layer === 'project' ? '会话目录' : '摘要目录'} icon="folder"
      extra={<><Search value={search} onChange={setSearch} placeholder={layer === 'global' ? '搜索项目' : layer === 'project' ? '搜索会话' : '搜索摘要'}/>
        <Button icon="refresh" busy={action.busy === 'refresh'} onClick={() => action.run('refresh', () => api(`/dream/refresh?${qs({ session: sessionId })}`, {}), '目录已刷新')}/></>}>
      <Table loading={!catalog.data && !catalog.error} rows={entries} rowKey={e => e.id}
        onRow={e => layer === 'global' ? (setProject(e.id), setLayer('project')) : layer === 'project' ? (setTarget({ id: e.id, title: e.title }), setLayer('session')) : openDoc(sid, e.id)}
        empty={<Empty icon="folder" title="暂无匹配记录">{catalog.error || (layer === 'session' ? '尚未产生摘要的会话会在等待期后参与 Dream。' : null)}</Empty>}
        columns={layer === 'session' ? [
          { key: 'summary', title: '摘要', nowrap: false, className: 'omc-col-grow', render: e => <span className="omc-clamp">{e.summary || '未提供摘要'}</span> },
          { key: 'docs', title: '资料', align: 'right', render: e => `${e.documents || 0} · ${e.assets || 0}` },
          { key: 'go', title: '', render: () => <Icon name="chevron" size={13}/> },
        ] : [
          { key: 'name', title: layer === 'global' ? '项目' : '会话', render: e => <span className="omc-ellipsis" title={e.id}>{layer === 'project' && <Icon name={e.shared ? 'context' : 'lock'} size={12}/>} {layer === 'global' ? folderName(e.id) : e.title || e.id}</span> },
          { key: 'mem', title: '短记忆', nowrap: false, className: 'omc-col-grow', render: e => <span className="omc-clamp omc-muted">{e.memory?.invalid ? '待重新整理' : e.memory?.summary || '尚未生成'}</span> },
          { key: 'go', title: '', render: () => <Icon name="chevron" size={13}/> },
        ]}/>
      {(page > 0 || catalog.data?.nextCursor) && <div className="omc-pager"><span>第 {page + 1} 页</span><div>
        <Button disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</Button>
        <Button disabled={!catalog.data?.nextCursor} onClick={() => { setCursors(c => { const n = c.slice(0, page + 1); n[page + 1] = catalog.data.nextCursor; return n; }); setPage(page + 1); }}>下一页</Button></div></div>}
    </Card>

    {jobs.length > 0 && <Card flush title="作业记录" icon="events">
      <Table rows={jobs} rowKey={j => j.id} columns={[
        { key: 'scope', title: '范围', render: j => <Tag tone="pink">{SCOPE[j.scope]}</Tag> },
        { key: 'target', title: '目标', render: j => <span className="omc-ellipsis" title={j.target}>{j.targetTitle || j.target}</span> },
        { key: 'state', title: '状态', render: j => <Tag tone={JOB[j.state]?.[1]} dot>{JOB[j.state]?.[0] || j.state}</Tag> },
        { key: 'progress', title: '进度', align: 'right', render: j => `${j.done || 0}/${j.total ?? '—'}` },
        { key: 'calls', title: '调用', align: 'right', render: j => j.calls || 0 },
        { key: 'at', title: '更新', render: j => <span className="omc-muted">{ago(j.updatedAt)}</span> },
        { key: 'act', title: '', render: j => ['running', 'queued', 'budget'].includes(j.state) ? <Button busy={action.busy === 'job:' + j.id} onClick={() => job(j.id, 'stop')}>停止</Button>
          : ['paused', 'failed'].includes(j.state) ? <Button busy={action.busy === 'job:' + j.id} onClick={() => job(j.id, 'resume')}>{j.state === 'failed' ? '重试' : '继续'}</Button> : null },
      ]}/>
    </Card>}

    {reader && <Drawer title="记忆与来源" onClose={() => sources.close(reader.back || null)}>
      {reader.loading ? <Skeleton rows={6}/> : <SourceView value={reader.value} onRead={read} onDoc={openDoc}/>}
    </Drawer>}
    {doc && <RecordDrawer record={doc} sessionId={sid} onClose={() => documents.close()}
      assetBase={(r, i) => `oh-my-dsh/api/dream/asset?${qs({ sessionId: r.requestSessionId || r.sessionId, id: r.id, asset: i + 1 })}`}/>}
  </div>;
}

function JobLine({ job, busy, onJob }) {
  const [label, tone] = JOB[job.state] || [job.state, 'gray'];
  return <div className="omc-job">
    <div><Tag tone={tone} dot>{label}</Tag> <b>{SCOPE[job.scope]}</b> <span className="omc-muted omc-ellipsis">{job.targetTitle || job.target}</span></div>
    <StackBar legend={false} total={job.total || 1} parts={[{ key: 'd', name: '完成', value: job.done || 0, color: 'var(--omc-pink)' }]}/>
    <div className="omc-job-foot"><span className="omc-muted">{job.done || 0}/{job.total ?? '—'} 个范围 · {job.calls || 0} 次调用</span>
      {['running', 'queued', 'budget'].includes(job.state) && <Button icon="stop" busy={busy === 'job:' + job.id} onClick={() => onJob(job.id, 'stop')}>停止</Button>}</div>
    {job.error && <p className="omc-red omc-hint">{job.error}</p>}
  </div>;
}

function MemoryText({ text }) {
  const [open, setOpen] = useState(false), value = String(text || ''), long = value.length > 320;
  return <><p className="omc-prose">{long && !open ? value.slice(0, 320) + '…' : value}</p>{long && <NativeButton type="button" size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? '收起' : '展开全部'}</NativeButton>}</>;
}

function SourceView({ value: v, onRead, onDoc }) {
  return <>
    <Card title={v.presentation?.title || '来源'} extra={v.presentation?.detail && <span className="omc-muted">{v.presentation.detail}</span>}>
      <pre className="omc-pre">{v.text || v.message || ''}</pre>
      <div className="omc-detail-foot">{v.recordId && <Button icon="context" onClick={() => onDoc(v.sessionId, v.recordId)}>详细资料与附件</Button>}
        {v.seq != null && <Button onClick={() => onRead({ sessionId: v.sessionId, from: v.seq, to: v.seq })}>原始事件</Button>}</div>
    </Card>
    {(v.sources || v.entries || []).length > 0 && <Card flush title="引用来源">
      <ul className="omc-sources">{(v.sources || v.entries).map((s, i) => <li key={s.reference || i}><NativeButton type="button" size="sm" variant="ghost" onClick={() => onRead({ reference: s.reference })}>
        <Icon name={s.kind === 'memory' ? 'memory' : 'context'} size={14}/><span><b>{s.presentation?.title || s.kind}</b>{s.presentation?.preview && <small>{s.presentation.preview}</small>}</span><Icon name="chevron" size={12}/></NativeButton></li>)}</ul>
    </Card>}
    <div className="omc-detail-foot">{v.nextCursor && <Button onClick={() => onRead({ ...v.args, cursor: v.nextCursor })}>继续读取</Button>}
      {v.nextSources && <Button onClick={() => onRead({ reference: v.reference, query: 'sources', cursor: v.nextSources })}>更多来源</Button>}</div>
  </>;
}
