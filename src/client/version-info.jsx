import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { version as CLIENT_VERSION } from '../../package.json';
import { VersionUpdate } from './version-update.jsx';

const statusText = data => data.status === 'update' ? data.severity === 'required' ? '有必要更新 · 包含重要修复' : '有新版本可更新'
  : data.status === 'current' ? '已是最新版' : data.status === 'ahead' ? '当前版本高于发布记录' : '尚未确认最新版本';
const timeText = time => time == null ? '尚未成功检查' : new Date(time).toLocaleString('zh-CN', { hour12: false });

export function VersionInfo() {
  const [data, setData] = useState({ currentVersion: CLIENT_VERSION, status: 'unknown', severity: 'none', releases: [] });
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const button = useRef(null), dialog = useRef(null), active = useRef(false), pending = useRef(null), abort = useRef(null), titleId = useId();
  const load = useCallback((refresh = false) => {
    if (pending.current) return pending.current;
    const controller = new AbortController(); abort.current = controller;
    setBusy(true);
    pending.current = (async () => {
      try {
        const response = await fetch('trisoul-x/api/version' + (refresh ? '?refresh=1' : ''), { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw Error('Version check failed');
        const result = await response.json();
        if (typeof result.currentVersion !== 'string' || !['unknown', 'current', 'ahead', 'update'].includes(result.status)) throw Error('Invalid version response');
        if (active.current) setData(result);
      } catch {
        if (active.current && !controller.signal.aborted) setData(old => ({ ...old, stale: old.checkedAt != null, error: '暂时无法读取版本信息，请稍后重试。' }));
      } finally { if (active.current) setBusy(false); pending.current = null; abort.current = null; }
    })();
    return pending.current;
  }, []);
  useEffect(() => {
    active.current = true; let timer;
    const tick = async () => { if (document.visibilityState !== 'hidden') await load(); if (active.current) timer = setTimeout(tick, 60 * 60 * 1000); };
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    void tick(); document.addEventListener('visibilitychange', visible);
    return () => { active.current = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); abort.current?.abort(); };
  }, [load]);
  useEffect(() => {
    const element = dialog.current;
    if (!open) { if (element?.open) element.close(); return; }
    const place = () => {
      const rect = button.current?.getBoundingClientRect(); if (!rect || !element) return;
      const width = Math.min(380, window.innerWidth - 24);
      element.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + 'px';
      const top = Math.min(rect.bottom + 10, Math.max(12, window.innerHeight - 180));
      element.style.top = top + 'px'; element.style.maxHeight = Math.max(120, window.innerHeight - top - 12) + 'px';
    };
    place(); if (!element.open) element.showModal();
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('resize', place); if (element.open) element.close(); button.current?.focus(); };
  }, [open]);
  const severity = data.status === 'update' ? data.severity : 'none';
  const updates = Array.isArray(data.releases) ? data.releases : [];
  return <span className="omd-version" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <button ref={button} type="button" className="omd-version-trigger" data-update-level={severity}
      aria-label="关于 Oh My DSH" aria-haspopup="dialog" aria-expanded={open} aria-describedby={titleId + '-hint'}
      title={'Oh My DSH ' + data.currentVersion + ' · ' + statusText(data)} onClick={() => { setOpen(true); void load(); }}>
      <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.45" aria-hidden="true"><circle cx="10" cy="10" r="7.4"/><path d="M10 8.7v5"/><circle cx="10" cy="6.1" r=".85" fill="currentColor" stroke="none"/></svg>
      {severity !== 'none' && <span className={'omd-update-dot omd-update-' + severity} aria-hidden="true"/>}
    </button>
    <span id={titleId + '-hint'} className="omd-version-sr">{statusText(data)}{data.stale ? '，上次检查结果' : ''}</span>
    <dialog ref={dialog} className="omd-version-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); setOpen(false); }} onClose={event => { if (!event.currentTarget.open) setOpen(false); }}
      onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) setOpen(false); } }}>
      {open && <><header><h2 id={titleId}>关于 Oh My DSH</h2><button type="button" className="omd-version-close" aria-label="关闭版本信息" onClick={() => setOpen(false)}>×</button></header>
      <dl><div><dt>当前版本</dt><dd data-testid="omd-current-version">{data.currentVersion}</dd></div><div><dt>最新版本</dt><dd>{data.latestVersion || '尚未确认'}</dd></div></dl>
      <p className={'omd-version-status omd-level-' + severity} role="status">{statusText(data)}{data.stale ? '（上次检查结果）' : ''}</p>
      {data.error && <p className="omd-version-error" role="alert">{data.error}</p>}
      <VersionUpdate version={data.status === 'update' ? data.latestVersion : null} stale={!!data.stale || !!data.error}/>
      <div className="omd-version-releases">{(updates.length ? updates : data.currentRelease ? [data.currentRelease] : []).map(release => <section key={release.version}>
        <h3><span>{release.version}</span>{updates.length > 0 && <em data-severity={release.severity}>{release.severity === 'required' ? '必要更新' : '普通更新'}</em>}</h3>
        <strong>{release.title}</strong><ul>{release.notes?.map((note, i) => <li key={i}>{note}</li>)}</ul>
      </section>)}</div>
      <p className="omd-version-meta">上次成功检查：{timeText(data.checkedAt)}</p>
      <p className="omd-version-meta">检查公开发布信息，不上传会话内容。点击“更新”才会安装。</p>
      {data.currentVersion !== CLIENT_VERSION && <p className="omd-version-error">服务已更新，当前界面仍为 {CLIENT_VERSION}。<button type="button" onClick={() => window.location.reload()}>刷新界面</button></p>}
      <footer><button type="button" className="omd-version-check" disabled={busy} onClick={() => void load(true)}>{busy ? '正在检查…' : '检查更新'}</button>
        <span className="omd-version-links">
          {data.status === 'update' && data.latestVersion && <a href={'https://github.com/gulagala001/oh-my-dsh/releases/tag/v' + encodeURIComponent(data.latestVersion.replace(/^v/, ''))} target="_blank" rel="noopener noreferrer">查看新版说明 ↗</a>}
          <a href="https://github.com/gulagala001/oh-my-dsh/releases" target="_blank" rel="noopener noreferrer">查看发布记录 ↗</a>
        </span></footer></>}
    </dialog>
  </span>;
}

export function BrandNameWithVersion() {
  const name = useRef(null), [mount, setMount] = useState(null);
  useLayoutEffect(() => {
    // macOS Desktop uses a span; Web and Windows use a home-navigation button.
    // Keep the portal beside either wrapper, outside the aria-hidden identity.
    const brand = name.current?.closest('button') ?? name.current?.closest('[aria-hidden="true"]')?.parentElement;
    if (!brand?.parentElement) return;
    const anchor = document.createElement('span'); anchor.className = 'omd-version-anchor';
    brand.classList.add('omd-brand-with-version'); brand.after(anchor); setMount(anchor);
    return () => { brand.classList.remove('omd-brand-with-version'); anchor.remove(); };
  }, []);
  return <><strong ref={name} className="tx-wordmark">Oh My <span>DSH</span></strong>{mount && createPortal(<VersionInfo/>, mount)}</>;
}
