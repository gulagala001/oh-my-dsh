import React, { useEffect, useRef, useState } from 'react';

/** Reuse the existing DSH account view. No token enters the plugin renderer. */
export function NativePlatformPage() {
  const viewport = useRef(null), generation = useRef(0);
  const [page, setPage] = useState('usage'), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const bridge = window.dshPlatform;
  useEffect(() => {
    const ticket = ++generation.current;
    let stopped = false, frame;
    const bounds = () => { const rect = viewport.current.getBoundingClientRect(); return { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height }; };
    setLoading(true); setError('');
    Promise.resolve(bridge.open(page, bounds())).then(() => { if (!stopped && generation.current === ticket) setLoading(false); }, failure => { if (!stopped && generation.current === ticket) { setLoading(false); setError(failure.message || 'DSH 账号授权不可用，请先在账号页登录。'); } });
    const measure = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (!stopped) Promise.resolve(bridge.setBounds(bounds())).catch(() => {}); }); };
    const observer = new ResizeObserver(measure); observer.observe(viewport.current);
    window.addEventListener('resize', measure); document.addEventListener('scroll', measure, true);
    return () => { stopped = true; ++generation.current; observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', measure); document.removeEventListener('scroll', measure, true); void Promise.resolve(bridge.close()).catch(() => {}); };
  }, [bridge, page, revision]);
  return <div className="dswb-platform-native" data-deepseek-workbench="platform"><div className="dswb-platform-tabs" role="tablist" aria-label="开放平台页面">
    <button role="tab" aria-selected={page === 'usage'} onClick={() => setPage('usage')}>用量与余额</button><button role="tab" aria-selected={page === 'top-up'} onClick={() => setPage('top-up')}>充值</button>
    {bridge.pages?.includes('api-keys') && <button role="tab" aria-selected={page === 'api-keys'} onClick={() => setPage('api-keys')}>API 密钥</button>}
    <span>使用 DSH 当前账号</span></div>
    {error && <div className="dswb-error" role="alert">{error}<button onClick={() => setRevision(value => value + 1)}>重试</button></div>}
    <div className="dswb-platform-viewport" ref={viewport}>{loading && <p role="status">正在打开账号平台…</p>}</div></div>;
}
