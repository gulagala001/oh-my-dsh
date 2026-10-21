// OMD console kit: one visual language for every console section and the
// composer dock items. Colours come from DSH theme aliases only.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tag as NativeTag, StateDot, useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives';
import { createPoller } from '../polling.mjs';
import { Icon } from '../native-icons.jsx';
export { Icon } from '../native-icons.jsx';
import { Button as NativeButton, Input, Select as NativeSelect } from '../native-controls.jsx';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

export const api = async (path, value, signal) => {
  const response = await fetch(`oh-my-dsh/api${path}`, value === undefined ? { signal }
    : { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { statusCode: response.status });
  return data;
};
export const qs = values => new URLSearchParams(Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();


export function Card({ title, extra, children, className, flush, icon }) {
  return <section className={cx('omc-card', flush && 'omc-flush', className)}>
    {(title || extra) && <header className="omc-card-head">{title && <h3>{icon && <Icon name={icon} size={14}/>}{title}</h3>}{extra && <div className="omc-card-extra">{extra}</div>}</header>}
    {children}
  </section>;
}

export function Stat({ label, value, unit, sub, tone, icon, onClick, title }) {
  const Tag = onClick ? 'button' : 'div';
  return <Tag type={onClick ? 'button' : undefined} className={cx('omc-stat', tone && `omc-tone-${tone}`, onClick && 'omc-clickable')} onClick={onClick} title={title}>
    <span className="omc-stat-label">{icon && <i className="omc-stat-icon"><Icon name={icon} size={13}/></i>}{label}</span>
    <strong className="omc-stat-value">{value}{unit && <small>{unit}</small>}</strong>
    {sub && <span className="omc-stat-sub">{sub}</span>}
  </Tag>;
}

export function Tag({ tone = 'gray', children, title, dot }) {
  const nativeTone = { gray: 'neutral', green: 'success', blue: 'info', amber: 'warning', red: 'danger', violet: 'info' }[tone] ?? 'neutral';
  return <span title={title} className="omc-native-tag"><NativeTag tone={nativeTone}>{dot && <Dot tone={tone}/>} {children}</NativeTag></span>;
}
export function Dot({ tone = 'gray', pulse }) { return <StateDot state={pulse ? 'ongoing' : ({ green: 'done', amber: 'warning', red: 'error' }[tone] ?? 'idle')} size={8}/>; }

export function Seg({ value, options, onChange, label, size, disabled }) {
  return <div className="omd-native-segments" role="group" aria-label={label}>
    {options.map(([id, text, count]) => <NativeButton key={id} type="button" size="sm" disabled={disabled}
      variant={id === value ? 'primary' : 'outline'} aria-pressed={id === value} onClick={() => onChange(id)}>
      {text}{count != null && <b>{count}</b>}
    </NativeButton>)}
  </div>;
}

export function Select({ value, options, onChange, label, width, disabled }) {
  return <NativeSelect aria-label={label} value={value} disabled={disabled} style={width ? { width } : undefined}
    onChange={event => onChange(event.target.value)}>
    {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
  </NativeSelect>;
}

export function Search({ value, onChange, placeholder }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => setDraft(value || ''), [value]);
  useEffect(() => { if (draft === (value || '')) return; const t = setTimeout(() => onChange(draft), 320); return () => clearTimeout(t); }, [draft]);
  return <div className="omc-search"><Input icon={<Icon name="search" size={14}/>} value={draft} placeholder={placeholder} aria-label={placeholder} onChange={e => setDraft(e.target.value)}/>{draft && <NativeButton type="button" variant="ghost" size="sm" aria-label="清空" onClick={() => { setDraft(''); onChange(''); }}><Icon name="close" size={12}/></NativeButton>}</div>;
}

export function Button({ children, icon, onClick, kind, disabled, title, busy, type = 'button' }) {
  return <NativeButton type={type} size="sm" variant={kind === 'primary' ? 'primary' : 'outline'}
    className={cx('omc-btn', kind && `omc-btn-${kind}`, busy && 'omc-busy')} onClick={onClick} disabled={disabled || busy} title={title}>
    {icon && <Icon name={busy ? 'refresh' : icon} size={14} className={busy ? 'omc-spin' : undefined}/>}{children}
  </NativeButton>;
}
export function IconButton({ icon, label, onClick, disabled, spin }) {
  return <NativeButton type="button" size="sm" variant="ghost" className="omc-icon-btn" aria-label={label} title={label} onClick={onClick} disabled={disabled}><Icon name={icon} size={15} className={spin ? 'omc-spin' : undefined}/></NativeButton>;
}
export function LinkButton({ children, onClick }) {
  return <NativeButton type="button" size="sm" variant="ghost" onClick={onClick}>{children}<Icon name="chevron" size={12}/></NativeButton>;
}

export function Empty({ icon = 'layers', title, children, action }) {
  return <div className="omc-empty"><span><Icon name={icon} size={20}/></span><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>;
}
export function Skeleton({ rows = 3, cards = 0 }) {
  return <div className="omc-skeleton" aria-busy="true" aria-label="正在读取">
    {cards > 0 && <div className="omc-stats">{Array.from({ length: cards }, (_, i) => <div key={i} className="omc-stat omc-sk"/>)}</div>}
    {Array.from({ length: rows }, (_, i) => <div key={i} className="omc-sk omc-sk-row" style={{ width: `${92 - i * 11}%` }}/>)}
  </div>;
}
export function Alert({ tone = 'error', children, action }) {
  return children ? <div className={cx('omc-alert', `omc-alert-${tone}`)} role={tone === 'error' ? 'alert' : 'status'}><Icon name="info" size={14}/><span>{children}</span>{action}</div> : null;
}

/** Columns: { key, title, render(row), align, width, className, nowrap }. */
export function Table({ columns, rows, rowKey, onRow, expanded, renderExpand, empty, loading, dense }) {
  if (loading && !rows?.length) return <Skeleton rows={5}/>;
  if (!rows?.length) return empty || <Empty title="暂无数据"/>;
  return <div className={cx('omc-table-wrap', dense && 'omc-dense')}>
    <table className="omc-table">
      <thead><tr>{columns.map(c => <th key={c.key} style={c.width ? { width: c.width } : undefined} className={cx(c.align === 'right' && 'omc-r', c.className)}>{c.title}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => {
        const key = rowKey(row, index), open = expanded === key;
        return <React.Fragment key={key}>
          <tr className={cx(onRow && 'omc-row-click', open && 'omc-row-open')} onClick={onRow ? () => onRow(row, key) : undefined}
            tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRow(row, key); } } : undefined} aria-expanded={renderExpand ? open : undefined}>
            {columns.map(c => <td key={c.key} className={cx(c.align === 'right' && 'omc-r', c.nowrap !== false && 'omc-nowrap', c.className)}>{c.render ? c.render(row) : row[c.key]}</td>)}
          </tr>
          {open && renderExpand && <tr className="omc-expand"><td colSpan={columns.length}>{renderExpand(row)}</td></tr>}
        </React.Fragment>;
      })}</tbody>
    </table>
  </div>;
}

export function Pager({ page, pages, total, onPage, label }) {
  if (!total) return null;
  return <div className="omc-pager">
    <span>{label ?? `共 ${total.toLocaleString()} 条`}</span>
    <div>
      <NativeButton size="sm" variant="ghost" type="button" className="omc-icon-btn" aria-label="上一页" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="chevron" size={13} className="omc-flip"/></NativeButton>
      <b>{page}</b><span>/ {Math.max(1, pages)}</span>
      <NativeButton size="sm" variant="ghost" type="button" className="omc-icon-btn" aria-label="下一页" disabled={page >= pages} onClick={() => onPage(page + 1)}><Icon name="chevron" size={13}/></NativeButton>
    </div>
  </div>;
}

/** Stacked bars with an optional cost line on an independent right axis. */
export function BarChart({ series, keys, height = 120, format = String, secondary }) {
  const [hover, setHover] = useState(null);
  const peak = Math.max(0, ...series.map(s => keys.reduce((n, k) => n + (s.parts[k.key] || 0), 0))), max = peak || 1;
  const costPeak = Math.max(0, ...series.map(s => Number.isFinite(s.cost) ? s.cost : 0)), costMax = costPeak || 1;
  if (!series.length) return <Empty icon="overview" title="暂无趋势数据"/>;
  const active = hover == null ? null : series[hover];
  const detail = s => `${s.label} · ${keys.map(k => `${k.name} ${format(s.parts[k.key] || 0)}`).join(' · ')}${secondary ? ` · 费用 ${secondary.format(s.cost)}` : ''}`;
  let connected = false;
  const path = series.map((s, i) => {
    if (!Number.isFinite(s.cost)) { connected = false; return ''; }
    const command = connected ? 'L' : 'M'; connected = true;
    return `${command}${(i + .5) / series.length * 1000},${100 - s.cost / costMax * 100}`;
  }).join(' ');
  return <div className={cx('omc-chart', secondary && 'omc-chart-dual')}>
    <div className="omc-chart-legend">{keys.map(k => <span key={k.key}><i style={{ background: k.color }}/>{k.name}</span>)}
      {secondary && <span><i className="omc-line-key" style={{ background: secondary.color }}/>{secondary.name}</span>}
      <em>{active ? detail(active) : `峰值 ${format(peak)}${secondary ? ` · 费用 ${secondary.format(costPeak)}` : ''}`}</em></div>
    {secondary && <div className="omc-chart-units"><span>Tokens</span><span>{secondary.name}</span></div>}
    <div className={cx(secondary && 'omc-chart-plot')}>
      {secondary && <div className="omc-chart-y"><span>{format(peak)}</span><span>{format(peak / 2)}</span><span>0</span></div>}
      <div className="omc-chart-data">
        <div className="omc-bars" style={{ height }} onMouseLeave={() => setHover(null)}>
          {series.map((s, i) => <div key={s.label} className={cx('omc-bar', hover === i && 'omc-bar-on', !keys.some(k => s.parts[k.key] > 0) && 'omc-bar-empty')}
            onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} title={detail(s)} aria-label={detail(s)}>
            <div className="omc-bar-stack">{keys.map(k => s.parts[k.key] > 0 && <i key={k.key} style={{ height: `${s.parts[k.key] / max * 100}%`, background: k.color }}/>)}</div>
          </div>)}
        </div>
        {secondary && <div className="omc-cost-overlay" aria-hidden="true">
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none"><path d={path} fill="none" stroke={secondary.color} strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>
          {series.map((s, i) => Number.isFinite(s.cost) && <i key={s.label} style={{ left: `${(i + .5) / series.length * 100}%`, bottom: `${s.cost / costMax * 100}%`, background: secondary.color }}/>) }
        </div>}
      </div>
      {secondary && <div className="omc-chart-y omc-chart-y-right"><span>{secondary.format(costPeak)}</span><span>{secondary.format(costPeak / 2)}</span><span>{secondary.format(0)}</span></div>}
    </div>
    <div className="omc-chart-axis"><span>{series[0].label}</span>{series.length > 2 && <span>{series[Math.floor(series.length / 2)].label}</span>}{series.length > 1 && <span>{series.at(-1).label}</span>}</div>
  </div>;
}

/** Horizontal distribution bars with values. rows: [{ key, label, value, text, color, onClick }]. */
export function HBars({ rows, format = String }) {
  const max = Math.max(1, ...rows.map(r => r.value || 0));
  if (!rows.length) return <Empty title="暂无分布"/>;
  return <div className="omc-hbars">{rows.map(r => {
    const Tag = r.onClick ? 'button' : 'div';
    return <Tag key={r.key} type={r.onClick ? 'button' : undefined} className={cx('omc-hbar', r.onClick && 'omc-clickable')} onClick={r.onClick}>
      <span className="omc-hbar-label">{r.label}</span>
      <span className="omc-hbar-track"><i style={{ width: `${Math.max(2, (r.value || 0) / max * 100)}%`, background: r.color }}/></span>
      <span className="omc-hbar-value">{r.text ?? format(r.value)}</span>
    </Tag>;
  })}</div>;
}

/** Proportional stacked bar. parts: [{ key, name, value, color }]. */
export function StackBar({ parts, total, height = 10, legend = true, format = String, marker }) {
  const sum = total || parts.reduce((n, p) => n + (p.value || 0), 0) || 1;
  return <div className="omc-stackbar">
    <div className="omc-stackbar-track" style={{ height }}>
      {parts.filter(p => p.value > 0).map(p => <i key={p.key} style={{ width: `${p.value / sum * 100}%`, background: p.color }} title={`${p.name} ${format(p.value)}`}/>)}
      {marker != null && <b className="omc-stackbar-marker" style={{ left: `${Math.min(100, marker / sum * 100)}%` }}/>}
    </div>
    {legend && <div className="omc-legend">{parts.filter(p => p.value > 0).map(p => <span key={p.key}><i style={{ background: p.color }}/>{p.name}<b>{format(p.value)}</b></span>)}</div>}
  </div>;
}

/** Status strip like an uptime monitor: one tick per item, newest on the right. */
export function Strip({ items, onPick }) {
  return <div className="omc-strip" role="list">{items.map((item, i) => <button type="button" role="listitem" key={item.key ?? i}
    className={cx('omc-tick', `omc-tick-${item.tone || 'green'}`)} title={item.title} onClick={onPick ? () => onPick(item) : undefined} tabIndex={onPick ? 0 : -1}/>)}</div>;
}

export function Ring({ value, max, size = 46, stroke = 5, tone }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, ratio = max > 0 ? Math.min(1, value / max) : 0;
  const color = tone || (ratio > .85 ? 'var(--omc-red)' : ratio > .65 ? 'var(--omc-amber)' : 'var(--omc-blue)');
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="omc-ring" aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--omc-line)" strokeWidth={stroke}/>
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
      strokeDasharray={`${c * ratio} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}/>
  </svg>;
}

export function KV({ rows }) {
  return <dl className="omc-kv">{rows.filter(Boolean).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>;
}

export function Steps({ steps }) {
  return <ol className="omc-steps">{steps.map(s => <li key={s.key} className={cx(`omc-step-${s.tone || 'gray'}`)}>
    <Dot tone={s.tone} pulse={s.running}/><div><strong>{s.title}</strong><span>{s.text}</span></div>
  </li>)}</ol>;
}

/** Visible-gated polling with stale-delivery protection. */
// The console's refresh button bumps this; every poll re-reads in place.
export const ConsoleRefresh = createContext(0);
export function usePoll(read, key, { enabled = true, interval = 3000 } = {}) {
  const [state, setState] = useState({ key: null, data: null, error: '' });
  const ref = useRef(null), readRef = useRef(read), intervalRef = useRef(interval); readRef.current = read;
  // Polling faster (for example, an opened popover) reads at once.
  if (interval < intervalRef.current) queueMicrotask(() => ref.current?.refresh());
  intervalRef.current = interval;
  const refreshTick = useContext(ConsoleRefresh);
  useEffect(() => { if (refreshTick) ref.current?.refresh(); }, [refreshTick]);
  useEffect(() => {
    if (!enabled) return;
    // A changed interval applies to the next read; it does not restart the poller.
    const poller = createPoller({ interval: () => intervalRef.current, read: signal => readRef.current(signal),
      onData: data => setState({ key, data, error: '' }),
      onError: error => setState(old => ({ key, data: old.key === key ? old.data : null, error: error.message })) });
    ref.current = poller; poller.start();
    return () => { poller.stop(); ref.current = null; };
  }, [key, enabled]);
  const refresh = useCallback(() => ref.current?.refresh(), []);
  return { data: state.key === key ? state.data : null, error: state.key === key ? state.error : '', refresh };
}

/** One drawer read; closing, replacing or changing session cancels stale delivery. */
export function useReader(key) {
  const [state, setState] = useState({ key, value: null, error: '' });
  const pending = useRef(null);
  const cancel = () => { pending.current?.abort(); pending.current = null; };
  useEffect(() => { setState({ key, value: null, error: '' }); return cancel; }, [key]);
  const close = (value = null) => { cancel(); setState({ key, value, error: '' }); };
  const read = async (path, loading = { loading: true }, project = value => value) => {
    cancel();
    const controller = new AbortController(); pending.current = controller;
    setState({ key, value: loading, error: '' });
    try {
      const value = await api(path, undefined, controller.signal);
      if (!controller.signal.aborted) setState({ key, value: project(value), error: '' });
    } catch (error) {
      if (!controller.signal.aborted) setState({ key, value: null, error: error.message });
    } finally { if (pending.current === controller) pending.current = null; }
  };
  return { value: state.key === key ? state.value : null, error: state.key === key ? state.error : '', read, close };
}

export function useAction(onDone, key) {
  const [state, setState] = useState({ key, busy: null, error: '', notice: '' });
  const current = useRef(null);
  useEffect(() => {
    const owner = {}; current.current = owner;
    setState({ key, busy: null, error: '', notice: '' });
    return () => { if (current.current === owner) current.current = null; };
  }, [key]);
  const run = useCallback(async (id, task, success) => {
    const owner = current.current;
    setState({ key, busy: id, error: '', notice: '' });
    try {
      const result = await task();
      if (!owner || current.current !== owner) return;
      setState({ key, busy: null, error: '', notice: typeof success === 'function' ? success(result) : success || '' }); onDone?.(); return result;
    } catch (error) { if (owner && current.current === owner) setState({ key, busy: null, error: error.message, notice: '' }); }
  }, [onDone, key]);
  return { ...(state.key === key ? state : { busy: null, error: '', notice: '' }), run, clear: () => setState({ key, busy: null, error: '', notice: '' }) };
}

/** Anchored popover used by the composer dock items (portal; Escape/outside close). */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null), panelRef = useRef(null);
  const pos = useAnchoredPosition({ open, anchorRef: rootRef, panelRef, side: 'top', gap: 8, margin: 12 });
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);
  useEffect(() => {
    if (!open) return;
    // Escape closes only this layer: focus must be inside it (or nowhere),
    // and the key is marked handled so outer layers stay open.
    const key = e => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const active = document.activeElement;
      const inside = !active || active === document.body || rootRef.current?.contains(active) || panelRef.current?.contains(active);
      if (!inside) return;
      e.preventDefault(); setOpen(false);
      rootRef.current?.querySelector('button')?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);
  return { open, setOpen, rootRef, panelRef, pos };
}
export function Popover({ seat, title, value, icon, children, footer }) {
  if (!seat.open) return null;
  return createPortal(<div ref={seat.panelRef} className="omc-pop omc-root" role="dialog" aria-label={title}
    style={seat.pos ?? { visibility: 'hidden', left: 0, top: 0 }}>
    <div className="omc-pop-title"><span>{icon}{title}</span>{value != null && <b>{value}</b>}</div>
    <div className="omc-pop-body">{children}</div>
    {footer && <div className="omc-pop-foot" onClick={() => seat.setOpen(false)}>{footer}</div>}
  </div>, document.body);
}

/** In-console overlay reader; Escape or the back button closes it. */
export function Drawer({ title, onClose, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement; ref.current?.focus({ preventScroll: true });
    return () => { if (prev?.isConnected) prev.focus?.({ preventScroll: true }); };
  }, []);
  return <div className="omc-drawer" ref={ref} tabIndex={-1} role="dialog" aria-label={title}
    onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
    <header className="omc-drawer-head"><NativeButton size="sm" variant="ghost" type="button" className="omc-btn" onClick={onClose}><Icon name="chevron" size={13} className="omc-flip"/>返回</NativeButton><strong>{title}</strong>{actions}</header>
    <div className="omc-drawer-body">{children}</div>
  </div>;
}
