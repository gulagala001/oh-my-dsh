import React from 'react';
import css from './monitor-resources.css';

export const resourcesMonitorCss = css;

const known = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const number = value => known(value) === null ? '未记录' : value.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
const tokens = value => known(value) === null ? '未记录' : value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : number(value);
function duration(value) {
  if (known(value) === null) return '未记录';
  if (value < 1000) return `${number(value)} 毫秒`;
  if (value < 60000) return `${number(value / 1000)} 秒`;
  if (value < 3600000) return `${number(value / 60000)} 分钟`;
  return `${number(value / 3600000)} 小时`;
}
function bytes(value) {
  if (known(value) === null) return '未记录';
  const units = [['GiB', 1024 ** 3], ['MiB', 1024 ** 2], ['KiB', 1024]];
  const unit = units.find(([, scale]) => value >= scale);
  return unit ? `${number(value / unit[1])} ${unit[0]}` : `${number(value)} B`;
}
function date(value) {
  if (value == null || !Number.isFinite(new Date(value).getTime())) return '未记录';
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
function BudgetLine({ label, value, limit, unit, format = number, nullIsUnlimited = true }) {
  const used = known(value), cap = known(limit), bounded = cap !== null;
  const ratio = used !== null && cap > 0 ? used / cap * 100 : null;
  const exceeded = used !== null && bounded && used > cap;
  return <div className={`mon-resource-budget-line${exceeded ? ' is-exceeded' : ''}`}>
    <div className="mon-resource-budget-heading"><span>{label}</span><span><strong title={used === null ? undefined : `${number(used)}${unit ? ` ${unit}` : ''}`}>{format(used)}</strong>{unit && used !== null && <span className="mon-resource-unit"> {unit}</span>}<span className="mon-resource-budget-separator"> / </span>{bounded ? <span title={`${number(cap)}${unit ? ` ${unit}` : ''}`}>{format(cap)}{unit && <span className="mon-resource-unit"> {unit}</span>}</span> : <span>{limit === null && nullIsUnlimited ? '无上限' : '上限未记录'}</span>}</span></div>
    {ratio !== null && <div className="mon-resource-progress" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={Math.min(used, cap)} aria-valuetext={`${number(used)} / ${number(cap)}，${ratio.toFixed(1)}%${exceeded ? '，超出预算' : ''}`}><i style={{ width: `${Math.min(ratio, 100)}%` }}/></div>}
    {bounded && <span className="mon-resource-budget-ratio">{cap === 0 ? `上限为 0${exceeded ? ' · 已超出' : ''}` : used === null ? '未记录' : `${ratio.toFixed(1)}%${exceeded ? ' · 已超出' : ''}`}</span>}
  </div>;
}
function SessionBudget({ budget }) {
  const configured = budget?.configured === true;
  return <section className="mon-resource-group"><header><h4>会话预算</h4><span>{!budget || budget.configured === false ? '未设置' : configured ? budget.visible === false ? '已关闭' : '已配置' : '状态未记录'}</span></header>
    {!configured ? null : <>
      <BudgetLine label="Token 预算" value={budget.tokens} limit={budget.limits?.tokens} unit="Token" format={tokens}/>
      <BudgetLine label="模型轮次" value={budget.rounds} limit={budget.limits?.rounds} unit="轮"/>
      <BudgetLine label="执行时间" value={budget.elapsedMs} limit={budget.limits?.timeMs} format={duration}/>
      {known(budget.unmetered) > 0 && <p className="mon-resource-note">未计量 · {number(budget.unmetered)} 次</p>}
    </>}
    <ResourceSource>会话预算快照：配置后的累计记录，与用量页筛选独立。关闭后保留最后读数；未返回用量的调用不计入 Token。</ResourceSource>
  </section>;
}
function DreamBudget({ dream }) {
  return <section className="mon-resource-group"><header><h4>Dream 日预算</h4>{dream?.usage?.day != null && <span>{String(dream.usage.day)}</span>}</header>
    {!dream ? <p className="mon-resource-note">未记录</p> : <>
      <BudgetLine label="预算扣减 · 含预留" value={dream.usage?.used} limit={dream.dailyTokens} unit="预算 Token" format={tokens} nullIsUnlimited={false}/>
      <dl className="mon-resource-facts"><div><dt>运行中任务</dt><dd>{number(dream.activeJobs)}</dd></div><div><dt>排队任务</dt><dd>{number(dream.queuedJobs)}</dd></div><div className="mon-resource-wide"><dt>下次日预算重置</dt><dd>{date(dream.usage?.resetsAt)}</dd></div></dl>
    </>}
    <ResourceSource>Dream 日预算账本：扣减含预留与未知用量估计，不代表模型实际 Token。日预算独立于会话预算，两者不相加。</ResourceSource>
  </section>;
}
function ProcessResources({ resources }) {
  return <section className="mon-resource-group"><header><h4>宿主资源</h4><span>{resources?.scope || '宿主进程'}</span></header>
    {!resources ? <p className="mon-resource-note">未记录</p> : <>
      <dl className="mon-resource-facts"><div><dt>进程常驻内存</dt><dd title={known(resources.rssBytes) === null ? undefined : `${number(resources.rssBytes)} 字节`}>{bytes(resources.rssBytes)}</dd></div><div><dt>已用 JS 堆</dt><dd title={known(resources.heapUsedBytes) === null ? undefined : `${number(resources.heapUsedBytes)} 字节`}>{bytes(resources.heapUsedBytes)}</dd></div><div><dt>已分配 JS 堆</dt><dd title={known(resources.heapTotalBytes) === null ? undefined : `${number(resources.heapTotalBytes)} 字节`}>{bytes(resources.heapTotalBytes)}</dd></div><div><dt>进程运行时长</dt><dd>{duration(known(resources.uptimeSeconds) === null ? null : resources.uptimeSeconds * 1000)}</dd></div></dl>
      <p className="mon-resource-note">采样 {date(resources.sampledAt)}</p>
    </>}
    <ResourceSource>宿主进程内存与运行时间采样，不随用量筛选变化。已分配 JS 堆不代表内存上限。</ResourceSource>
  </section>;
}

function ResourceSource({ children }) {
  return <details className="mon-resource-source"><summary>读数说明</summary><p>{children}</p></details>;
}

export function MonitorResources({ data }) {
  const budget = data?.budget;
  const rss = known(data?.resources?.rssBytes);
  const budgetUsage = budget?.configured === true ? known(budget.tokens) : null;
  const cap = known(budget?.limits?.tokens);
  const summary = [];
  if (rss !== null) summary.push(`内存 ${bytes(rss)}`);
  if (budgetUsage !== null) summary.push(`会话 ${tokens(budgetUsage)}${cap !== null ? ` / ${tokens(cap)}` : ''} Token${budget.visible === false ? ' · 已关闭' : ''}`);
  if (!summary.length) summary.push('会话预算 · Dream · 宿主资源');
  return <details className="mon-resources"><summary><span className="mon-resource-disclosure" aria-hidden="true">›</span><strong>运行详情</strong><span className="mon-resource-summary">{summary.join(' · ')}</span></summary><div className="mon-resources-body"><SessionBudget budget={budget}/><DreamBudget dream={data?.dream}/><ProcessResources resources={data?.resources}/></div></details>;
}
