import { Button as NativeButton } from '../native-controls.jsx';
import React, { useState } from 'react';
import { api, qs, usePoll, Card, Stat, Tag, Empty, Skeleton, Alert, Icon, StackBar } from './ui.jsx';
import { clock } from './model.mjs';

function verdict(link) {
  if (link.kind !== 'test') return ['文字证据', 'gray'];
  if (!link.lastRun) return ['未运行', 'gray'];
  return link.lastRun.timedOut ? ['超时', 'amber'] : link.lastRun.pass ? ['通过', 'green'] : ['未通过', 'red'];
}

export function EvidenceSection({ sessionId, visible }) {
  const { data, error } = usePoll(signal => api(`/state?${qs({ session: sessionId, range: 'session', view: 'full' })}`, undefined, signal), sessionId, { enabled: visible && Boolean(sessionId), interval: 4000 });
  const [open, setOpen] = useState(null);
  if (!sessionId) return <Empty icon="evidence" title="先选择一个会话"/>;
  if (!data) return error ? <Alert>{error}</Alert> : <Skeleton cards={3} rows={4}/>;
  const tasks = data.tasks || [], done = tasks.filter(t => t.status === 'completed').length;
  const links = tasks.flatMap(t => t.links || []), passed = links.filter(l => l.lastRun?.pass).length;
  const history = data.legacyContext;
  return <div className="omc-section">
    <div className="omc-stats omc-stats-4">
      <Stat label="任务" value={`${done}/${tasks.length}`} sub="已完成 / 全部" tone={tasks.length && done === tasks.length ? 'green' : undefined}/>
      <Stat label="证据" value={links.length} sub={`${passed} 项测试通过`}/>
      <Stat label="待验证" value={tasks.filter(t => !t.links?.length).length} tone={tasks.some(t => !t.links?.length) ? 'amber' : undefined} sub="未关联证据"/>
      <Stat label="最近收尾" value={data.taskRelease?.total ? `${data.taskRelease.done}/${data.taskRelease.total}` : '—'} sub={data.taskRelease?.total ? `测试 ${data.taskRelease.tested} · 文字 ${data.taskRelease.textOnly}` : '暂无'}/>
    </div>
    {tasks.length > 0 && <StackBar legend={false} total={tasks.length} parts={[{ key: 'd', name: '完成', value: done, color: 'var(--omc-green)' }]}/>}
    <Card flush title="任务与证据" icon="evidence">
      {tasks.length ? <ul className="omc-tasks">{tasks.map((task, i) => {
        const id = task.id || i, isOpen = open === id;
        return <li key={id} className={isOpen ? 'omc-open' : undefined}>
          <NativeButton size="sm" variant="ghost" type="button" className="omc-task-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
            <span className={`omc-check ${task.status === 'completed' ? 'omc-on' : ''}`}>{task.status === 'completed' && <Icon name="check" size={11}/>}</span>
            <span className="omc-task-title">{task.content}</span>
            {task.links?.some(l => l.lastRun?.pass) ? <Tag tone="green">测试通过</Tag> : task.links?.length ? <Tag tone="blue">有证据</Tag> : <Tag tone="amber">待验证</Tag>}
            <Icon name="chevron" size={12}/>
          </NativeButton>
          {isOpen && <div className="omc-detail">
            <div className="omc-quote">{task.source || '尚未绑定需求原文'}{task.anchor && <small>消息 {task.sourceMessage} · 摘录 {task.sourceExcerpt}</small>}</div>
            {(task.links || []).map(link => { const [label, tone] = verdict(link); return <div className="omc-evidence" key={link.id}>
              <div className="omc-row"><b>{link.path || (link.kind === 'test' ? '测试验证' : '文字记录')}</b><Tag tone={tone} dot>{label}</Tag></div>
              {link.cmd && <pre className="omc-pre">{link.cmd}</pre>}{link.note && <p className="omc-prose">{link.note}</p>}
              {link.reason && <p className="omc-hint">原因：{link.reason}</p>}
              {link.lastRun?.tail && <details><summary>运行输出</summary><pre className="omc-pre">{link.lastRun.tail}</pre></details>}
            </div>; })}
            {!task.links?.length && <p className="omc-hint">完成任务后关联实际验证证据。</p>}
            {task.verification && <p className="omc-prose">{task.verification.method}<br/>{task.verification.result}</p>}
          </div>}
        </li>;
      })}</ul> : <Empty icon="evidence" title="没有任务">多步骤工作开始后，可在这里追查需求与验证证据。</Empty>}
    </Card>
    {data.notes?.length > 0 && <Card title="工作笔记" icon="context"><ul className="omc-feed">{data.notes.map((n, i) => <li key={i}><time>{clock(n.at).slice(0, 11)}</time><span className="omc-feed-text">{n.text}</span></li>)}</ul></Card>}
    {history && <details className="omc-advanced"><summary><Icon name="chevron" size={13}/>历史上下文（旧版本只读资料）</summary><Card>
      {[history.status, ...(history.pins || []), history.workdoc, history.checkpoint?.text, ...(history.digests || []).map(x => x.summary), ...(history.probeNotes || [])].filter(Boolean).map((text, i) => <p className="omc-prose" key={i}>{text}</p>)}
    </Card></details>}
  </div>;
}
