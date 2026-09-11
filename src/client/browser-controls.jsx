import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const Icon = ({ kind }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{kind === 'back' ? <path d="m14 6-6 6 6 6"/> : kind === 'forward' ? <path d="m10 6 6 6-6 6"/> : kind === 'new' ? <path d="M12 5v14M5 12h14"/> : kind === 'close' ? <path d="m6 6 12 12M6 18 18 6"/> : <><path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/></>}</svg>;
const tabLabel = tab => tab.url === 'about:blank' ? '新标签页' : tab.title || tab.url;

export const BrowserControls = forwardRef(function BrowserControls({ sessionId, state, visible, navigation, api, onState, onError }, ref) {
  const [tabSnapshot, setTabSnapshot] = useState({ id: null, tabs: [] }), [address, setAddress] = useState(''), [busy, setBusy] = useState(false);
  const editing = useRef(false), addressInput = useRef(null), pending = useRef(null);
  const navigationClient = useRef(crypto.randomUUID()), sequence = useRef(0);
  const addressObservation = useRef(0);
  const target = state?.target?.kind === 'tab' ? state.target : null;
  const tabs = tabSnapshot.id === (target?.id ?? null) ? tabSnapshot.tabs : [];
  const latest = useRef({ state, target, onState, onError }); latest.current = { state, target, onState, onError };
  useEffect(() => {
    addressObservation.current = 0;
    editing.current = false; setAddress(target?.url === 'about:blank' ? '' : target?.url ?? '');
    if (target?.url === 'about:blank') addressInput.current?.focus();
  }, [target?.id]);
  useEffect(() => {
    if (!editing.current && !pending.current && navigation && target && navigation.tabId === target.id && (navigation.observedAt ?? 0) >= addressObservation.current) {
      addressObservation.current = navigation.observedAt ?? 0;
      setAddress(navigation.url === 'about:blank' ? '' : navigation.url);
    }
  }, [navigation, target?.id, busy]);
  useEffect(() => {
    if (!visible || !sessionId || state?.enabled === false) return;
    let active = true, timer;
    const refresh = async () => {
      try { const result = await api('tabs', sessionId); if (active) setTabSnapshot({ id: target?.id ?? null, tabs: result.tabs }); }
      catch (error) { if (active) latest.current.onError(error.message); }
      if (active) timer = setTimeout(refresh, 1500);
    };
    void refresh(); return () => { active = false; clearTimeout(timer); };
  }, [sessionId, visible, target?.id, state?.enabled]);
  const act = async (op, value) => {
    const replacing = op === 'navigate' && pending.current?.op === 'navigate' && pending.current.tabId === value.tabId;
    if ((pending.current || latest.current.state?.transitioning) && !replacing) { latest.current.onError('浏览器正在切换，请稍后重试'); return; }
    const request = { op, tabId: value.tabId, sequence: ++sequence.current };
    pending.current = request; setBusy(true);
    try {
      const next = await api(op, sessionId, { ...value, controlEpoch: latest.current.state?.controlEpoch ?? 0, ...(op === 'navigate' ? { navigationClient: navigationClient.current, navigationSequence: request.sequence, navigationRevision: latest.current.state?.navigationRevision ?? 0 } : {}) });
      if (pending.current !== request) return;
      // SSE and HTTP can arrive in either order. Once a navigation completes,
      // a previously observed URL must not replace the accepted destination.
      if (op === 'navigate' && next.target?.id === request.tabId) {
        addressObservation.current = Math.max(addressObservation.current, next.observedAt ?? 0);
        if (!editing.current) setAddress(next.target.url === 'about:blank' ? '' : next.target.url);
      }
      latest.current.state = next; latest.current.target = next.target?.kind === 'tab' ? next.target : null;
      latest.current.onState(next); latest.current.onError('');
    } catch (error) { if (pending.current === request && !['NAVIGATION_SUPERSEDED', 'COMPUTER_USE_STOPPED'].includes(error.code)) latest.current.onError(error.message); }
    finally { if (pending.current === request) { pending.current = null; setBusy(false); } }
  };
  const shortcut = action => {
    if (action === 'focus') { addressInput.current?.focus(); addressInput.current?.select(); }
    else if (action === 'new') void act('tabs', { action: 'new' });
    else if (latest.current.target) void act(action === 'close' ? 'tabs' : 'navigate', { action, tabId: latest.current.target.id });
  };
  useImperativeHandle(ref, () => ({ shortcut }));
  const disabled = !sessionId || !state || busy || state?.transitioning || state?.enabled === false;
  const canNavigate = !!sessionId && !!state && state.enabled !== false && !state.resuming && (!(busy || state.transitioning) || pending.current?.op === 'navigate');
  if (!target) return <div className="tx-cu-browser-open"><button disabled={disabled} onClick={() => shortcut('new')}><Icon kind="new"/>打开浏览器</button>{!!tabs.length && <select aria-label="选择已有标签页" value="" disabled={disabled} onChange={event => { const tab = tabs.find(tab => tab.id === event.target.value); if (tab) void act('tabs', { action: 'select', tabId: tab.id, browserId: tab.browserId }); }}><option value="" disabled>选择已有标签页…</option>{tabs.map(tab => <option key={tab.id} value={tab.id} disabled={!tab.available}>{tabLabel(tab)}{tab.available ? '' : ' · 其他对话正在使用'}</option>)}</select>}</div>;
  const selected = tabs.find(t => t.id === target.id);
  const current = navigation?.tabId === target.id ? { ...target, ...navigation } : target;
  return <div className="tx-cu-browser-controls" aria-label="浏览器导航">
    <div className="tx-cu-tabs"><select aria-label="浏览器标签页" value={target.id} disabled={disabled} onChange={e => {
      const tab = tabs.find(t => t.id === e.target.value);
      if (tab) void act('tabs', { action: 'select', tabId: tab.id });
    }}>{!selected && <option value={target.id}>{tabLabel(current)}</option>}{tabs.map(tab => <option key={tab.id} value={tab.id} disabled={!tab.available}>{tabLabel(tab.id === target.id ? current : tab)}{tab.available ? '' : ' · 其他对话正在使用'}</option>)}</select><button aria-label="新建标签页" title="新建标签页" disabled={disabled} onClick={() => shortcut('new')}><Icon kind="new"/></button><button aria-label="关闭当前标签页" title="关闭当前标签页" disabled={disabled} onClick={() => shortcut('close')}><Icon kind="close"/></button></div>
    <form className="tx-cu-address" onSubmit={e => { e.preventDefault(); editing.current = false; void act('navigate', { action: 'goto', tabId: target.id, url: address }); }}>
      <button type="button" aria-label="后退" title="后退" disabled={disabled || !navigation?.canGoBack} onClick={() => shortcut('back')}><Icon kind="back"/></button>
      <button type="button" aria-label="前进" title="前进" disabled={disabled || !navigation?.canGoForward} onClick={() => shortcut('forward')}><Icon kind="forward"/></button>
      <button type="button" aria-label="重新加载页面" title="重新加载页面" disabled={disabled} onClick={() => shortcut('reload')}><Icon kind="reload"/></button>
      <input ref={addressInput} disabled={!canNavigate} value={address} onChange={e => { editing.current = true; setAddress(e.target.value); }} onFocus={() => { editing.current = true; }} onBlur={() => { editing.current = false; }} placeholder="搜索或输入网址" aria-label="浏览器地址"/>
      <button disabled={!canNavigate || !address} type="submit">前往</button>
    </form>
    {(navigation?.loading || state?.transitioning) && <div className="tx-cu-loading" role="status">{state?.resuming?'正在恢复助手控制…':'正在载入页面…'}</div>}
  </div>;
});
