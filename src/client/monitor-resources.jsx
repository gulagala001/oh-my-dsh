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
    <div className="mon-resource-budget-heading"><span>{label}</span><span><strong title={used === null ? undefined : `${number(used)}${unit ? ` ${unit}` : ''}`}>{format(used)}</strong>{unit && used !== null && <small> {unit}</small>}<span className="mon-resource-budget-separator"> / </span>{bounded ? <span title={`${number(cap)}${unit ? ` ${unit}` : ''}`}>{format(cap)}{unit && <small> {unit}</small>}</span> : <span>{limit === null && nullIsUnlimited ? '无上限' : '上限未记录'}</span>}</span></div>
    {ratio !== null && <div className="mon-resource-progress" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={Math.min(used, cap)} aria-valuetext={`${number(used)} / ${number(cap)}，${ratio.toFixed(1)}%${exceeded ? '，超出预算' : ''}`}><i style={{ width: `${Math.min(ratio, 100)}%` }}/></div>}
    {bounded && <small className="mon-resource-budget-ratio">{cap === 0 ? `上限为 0${exceeded ? ' · 已超出' : ''}` : used === null ? '等待使用量读数' : `${ratio.toFixed(1)}%${exceeded ? ' · 已超出' : ''}`}</small>}
  </div>;
}
function SessionBudget({ budget }) {
  const configured = budget?.configured === true;
  return <section className="mon-resource-group"><header><h4>当前会话预算</h4><span>{!budget || budget.configured === false ? '未设置' : configured ? budget.visible === false ? '已关闭' : '已配置' : '状态未记录'}</span></header>
    {!configured ? <p className="mon-resource-note">{!budget || budget.configured === false ? '当前会话尚未配置预算。' : '暂无有效预算快照。'}</p> : <>
      <BudgetLine label="Token 预算" value={budget.tokens} limit={budget.limits?.tokens} unit="Token" format={tokens}/>
      <BudgetLine label="模型轮次" value={budget.rounds} limit={budget.limits?.rounds} unit="轮"/>
      <BudgetLine label="执行时间" value={budget.elapsedMs} limit={budget.limits?.timeMs} format={duration}/>
      {known(budget.unmetered) > 0 && <p className="mon-resource-note">另有 {number(budget.unmetered)} 次调用未返回用量，未计入 Token 读数。</p>}
      {budget.visible === false && <p className="mon-resource-note">预算已关闭，以上保留关闭时的读数。</p>}
    </>}
    <p className="mon-resource-source">来源：会话预算快照。配置后的累计记录，与用量页筛选独立。</p>
  </section>;
}
function DreamBudget({ dream }) {
  return <section className="mon-resource-group"><header><h4>Dream 独立日预算</h4>{dream?.usage?.day != null && <span>{String(dream.usage.day)}</span>}</header>
    {!dream ? <p className="mon-resource-note">尚未读取 Dream 日预算。</p> : <>
      <BudgetLine label="预算扣减" value={dream.usage?.used} limit={dream.dailyTokens} unit="预算 Token" format={tokens} nullIsUnlimited={false}/>
      <dl className="mon-resource-facts"><div><dt>运行中任务</dt><dd>{number(dream.activeJobs)}</dd></div><div><dt>排队任务</dt><dd>{number(dream.queuedJobs)}</dd></div><div className="mon-resource-wide"><dt>下次日预算重置</dt><dd>{date(dream.usage?.resetsAt)}</dd></div></dl>
    </>}
    <p className="mon-resource-source">来源：Dream 日预算账本。扣减包含预留与未知用量估计，不能视为模型实际 Token，也不与主会话用量相加。</p>
  </section>;
}
function ProcessResources({ resources }) {
  return <section className="mon-resource-group"><header><h4>运行资源</h4><span>{resources?.scope || '宿主进程'}</span></header>
    {!resources ? <p className="mon-resource-note">尚未采集宿主进程读数。</p> : <>
      <dl className="mon-resource-facts"><div><dt>进程常驻内存</dt><dd title={known(resources.rssBytes) === null ? undefined : `${number(resources.rssBytes)} 字节`}>{bytes(resources.rssBytes)}</dd></div><div><dt>已用 JS 堆</dt><dd title={known(resources.heapUsedBytes) === null ? undefined : `${number(resources.heapUsedBytes)} 字节`}>{bytes(resources.heapUsedBytes)}</dd></div><div><dt>已分配 JS 堆</dt><dd title={known(resources.heapTotalBytes) === null ? undefined : `${number(resources.heapTotalBytes)} 字节`}>{bytes(resources.heapTotalBytes)}</dd></div><div><dt>进程运行时长</dt><dd>{duration(known(resources.uptimeSeconds) === null ? null : resources.uptimeSeconds * 1000)}</dd></div></dl>
      <p className="mon-resource-note">采样于 {date(resources.sampledAt)}</p>
    </>}
    <p className="mon-resource-source">来源：宿主进程内存与运行时间采样；已分配 JS 堆不代表内存上限。此范围不随用量筛选变化。</p>
  </section>;
}

export function MonitorResources({ data }) {
  return <details className="mon-resources"><summary><span className="mon-resource-disclosure" aria-hidden="true">›</span><div><strong>预算与运行资源</strong><small>会话预算 · Dream 日预算 · 宿主进程</small></div></summary><div className="mon-resources-body"><SessionBudget budget={data?.budget}/><DreamBudget dream={data?.dream}/><ProcessResources resources={data?.resources}/></div></details>;
}
