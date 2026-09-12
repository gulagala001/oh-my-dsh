import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {BrowserTools} from './browser-tools.jsx';
import {ComputerIcon} from './computer-icons.jsx';
import {BrowserDownloads} from './browser-downloads.jsx';
import {BrowserHistoryPanel} from './browser-history.jsx';

const Icon = ({ kind }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{kind === 'back' ? <path d="m14 6-6 6 6 6"/> : kind === 'forward' ? <path d="m10 6 6 6-6 6"/> : kind === 'new' ? <path d="M12 5v14M5 12h14"/> : kind === 'close' ? <path d="m6 6 12 12M6 18 18 6"/> : <><path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/></>}</svg>;
const tabLabel = tab => tab.url === 'about:blank' ? '新标签页' : tab.title || tab.url;

export const BrowserControls = forwardRef(function BrowserControls({ sessionId, state, visible, navigation, frame, api, onState, onError, previewScale, onPreviewScale, onDeviceModeChange, actions }, ref) {
  const [tabSnapshot, setTabSnapshot] = useState({ sessionId: null, tabs: [] }), [address, setAddress] = useState(''), [busy, setBusy] = useState(false);
  const editing = useRef(false), addressInput = useRef(null), pending = useRef(null), keyboardTarget=useRef(null);
  const navigationClient = useRef(crypto.randomUUID()), sequence = useRef(0);
  const addressObservation = useRef(0);
  const[panel,setPanel]=useState(null);
  useEffect(()=>{setPanel(null);},[sessionId]);
  useEffect(()=>{if(!visible||state?.enabled===false)setPanel(null);},[visible,state?.enabled]);
  const viewed=state?.viewTarget??state?.target,target=viewed?.kind==='tab'?viewed:null;
  const tabs = tabSnapshot.sessionId === sessionId ? tabSnapshot.tabs : [];
  const tabList=useRef(null),tools=useRef(null);
  useEffect(()=>{tabList.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[target?.id,tabs.length]);
  const latest = useRef({ state, target, onState, onError }); latest.current = { state, target, onState, onError };
  useEffect(() => {
    addressObservation.current = 0;
    editing.current = false; setAddress(target?.url === 'about:blank' ? '' : target?.url ?? '');
    if(keyboardTarget.current===target?.id){tabList.current?.querySelector('[aria-selected="true"]')?.focus();keyboardTarget.current=null;}
    else if (target?.url === 'about:blank') addressInput.current?.focus();
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
      try { const result = await api('tabs', sessionId); if (active) setTabSnapshot({ sessionId, tabs: result.tabs }); }
      catch (error) { if (active) latest.current.onError(error.message); }
      if (active) timer = setTimeout(refresh, 1500);
    };
    void refresh(); return () => { active = false; clearTimeout(timer); };
  }, [sessionId, visible, target?.id, state?.enabled]);
  const act = async (op, value) => {
    const replacing = op === 'navigate' && pending.current?.op === 'navigate' && pending.current.tabId === value.tabId;
    if ((pending.current || latest.current.state?.transitioning) && !replacing) { latest.current.onError('浏览器正在切换，请稍后重试'); return false; }
    const request = { op, tabId: value.tabId, sequence: ++sequence.current };
    pending.current = request; setBusy(true);
    try {
      const next = await api(op, sessionId, { ...value, controlEpoch: latest.current.state?.controlEpoch ?? 0, ...(op === 'navigate' ? { navigationClient: navigationClient.current, navigationSequence: request.sequence, navigationRevision: latest.current.state?.navigationRevision ?? 0 } : {}) });
      if (pending.current !== request) return false;
      // SSE and HTTP can arrive in either order. Once a navigation completes,
      // a previously observed URL must not replace the accepted destination.
      if (op === 'navigate' && next.target?.id === request.tabId && (next.viewTarget??next.target)?.id===request.tabId) {
        addressObservation.current = Math.max(addressObservation.current, next.observedAt ?? 0);
        if (!editing.current) setAddress(next.target.url === 'about:blank' ? '' : next.target.url);
      }
      const nextView=next.viewTarget??next.target;
      latest.current.state = next; latest.current.target = nextView?.kind === 'tab' ? nextView : null;
      latest.current.onState(next); latest.current.onError('');
      return true;
    } catch (error) { if (pending.current === request && !['NAVIGATION_SUPERSEDED', 'COMPUTER_USE_STOPPED'].includes(error.code)) latest.current.onError(error.message);return false; }
    finally { if (pending.current === request) { pending.current = null; setBusy(false); } }
  };
  const shortcut = action => {
    if (action === 'focus') { addressInput.current?.focus(); addressInput.current?.select(); }
    else if(action==='find')tools.current?.openFind();
    else if(action==='history'||action==='downloads')setPanel(action);
    else if (action === 'new') void act('tabs', { action: 'new',browserId:latest.current.target?.browserId });
    else if (latest.current.target) void act(action === 'close' ? 'tabs' : 'navigate', { action, tabId: latest.current.target.id });
  };
  const stopNavigation=async()=>{pending.current=null;setBusy(false);try{latest.current.onState(await api('stop',sessionId,{}));latest.current.onError('');}catch(error){latest.current.onError(error.message);}};
  const paneKey=event=>{
    if(event.defaultPrevented||event.nativeEvent.isComposing)return;
    const key=event.key.toLowerCase(),modified=event.metaKey||event.ctrlKey;
    const action=modified?({l:'focus',f:'find',j:'downloads',h:'history',y:event.metaKey?'history':undefined,r:'reload',t:'new',w:'close'})[key]:event.altKey?({arrowleft:'back',arrowright:'forward'})[key]:null;
    if(action){event.preventDefault();event.stopPropagation();shortcut(action);}
  };
  useImperativeHandle(ref, () => ({ shortcut,resizeViewport:size=>tools.current?.resizeViewport(size) }));
  const disabled = !sessionId || !state || busy || state?.transitioning || state?.enabled === false;
  const canNavigate = !!sessionId && !!state && state.enabled !== false && !state.resuming && (!(busy || state.transitioning) || pending.current?.op === 'navigate');
  if (!target) return <div className="tx-cu-browser-open"><button disabled={disabled} onClick={() => shortcut('new')}><Icon kind="new"/>打开浏览器</button>{!!tabs.length && <select aria-label="选择已有标签页" value="" disabled={disabled} onChange={event => { const tab = tabs.find(tab => tab.id === event.target.value); if (tab) void act('view-tab', { tabId: tab.id, browserId: tab.browserId }); }}><option value="" disabled>选择已有标签页…</option>{tabs.map(tab => <option key={tab.id} value={tab.id} disabled={!tab.available}>{tabLabel(tab)}{tab.available ? '' : ' · 其他对话正在使用'}</option>)}</select>}</div>;
  const selected = tabs.find(t => t.id === target.id);
  const current = navigation?.tabId === target.id ? { ...target, ...navigation } : target;
  const displayedTabs=selected?tabs:[...tabs,{...current,available:true}];
  let location='';try{location=current.url==='about:blank'?'':new URL(current.url).host||current.url;}catch{location=current.url??'';}
  const canOpenExternal=/^https?:\/\//i.test(current.url??'');
  const selectTab=tab=>void act('view-tab',{tabId:tab.id,browserId:tab.browserId});
  const moveTab=(event,tab)=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const available=displayedTabs.filter(item=>item.available),index=available.findIndex(item=>item.id===tab.id);
    const next=available[event.key==='Home'?0:event.key==='End'?available.length-1:(index+(event.key==='ArrowRight'?1:-1)+available.length)%available.length];
    if(next){keyboardTarget.current=next.id;tabList.current?.querySelectorAll('[role="tab"]')[displayedTabs.indexOf(next)]?.focus();selectTab(next);}
  };
  return <div className="tx-cu-browser-controls" aria-label="浏览器导航" onKeyDown={paneKey}>
    <div className="tx-cu-tabs"><div ref={tabList} role="tablist" aria-label="浏览器标签页" className="tx-cu-tablist">{displayedTabs.map(tab=>{const active=tab.id===target.id,label=tabLabel(active?current:tab);return <div key={tab.id} className={'tx-cu-browser-tab'+(active?' is-active':'')} role="presentation">
      <button type="button" role="tab" aria-selected={active} data-tab-id={tab.id} tabIndex={active?0:-1} title={label+(tab.available?'':' · 其他对话正在使用')} disabled={disabled||!tab.available} onKeyDown={event=>moveTab(event,tab)} onClick={()=>selectTab(tab)}><ComputerIcon name="globe" size={14} className={active&&navigation?.loading?'tx-cu-tab-loading':undefined}/><span>{label}</span></button>
      <button type="button" className="tx-cu-tab-close" aria-label={active?'关闭当前标签页':'关闭标签页：'+label} title="关闭标签页" tabIndex={active?0:-1} disabled={disabled||!tab.available} onClick={()=>void act('tabs',{action:'close',tabId:tab.id,browserId:tab.browserId})}><Icon kind="close"/></button>
    </div>;})}</div><button aria-label="新建标签页" title="新建标签页" disabled={disabled} onClick={() => shortcut('new')}><Icon kind="new"/></button></div>
    <div className="tx-cu-browser-navigation"><form className="tx-cu-address" onSubmit={e => { e.preventDefault(); editing.current = false; void act('navigate', { action: 'goto', tabId: target.id, url: address }); }}>
      <button type="button" aria-label="后退" title="后退" disabled={disabled || !navigation?.canGoBack} onClick={() => shortcut('back')}><Icon kind="back"/></button>
      <button type="button" aria-label="前进" title="前进" disabled={disabled || !navigation?.canGoForward} onClick={() => shortcut('forward')}><Icon kind="forward"/></button>
      {navigation?.loading||pending.current?.op==='navigate'?<button type="button" aria-label="停止加载页面" title="停止加载页面" disabled={state?.enabled===false} onClick={()=>void stopNavigation()}><ComputerIcon name="close"/></button>:<button type="button" aria-label="重新加载页面" title="重新加载页面" disabled={disabled} onClick={() => shortcut('reload')}><Icon kind="reload"/></button>}
      <div className="tx-cu-location"><input ref={addressInput} disabled={!canNavigate} value={address} onChange={e => { editing.current = true; setAddress(e.target.value); }} onFocus={event => { editing.current = true; event.currentTarget.select(); }} onBlur={() => { editing.current = false; }} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setAddress(current.url==='about:blank'?'':current.url??'');editing.current=false;event.currentTarget.blur();}}} placeholder="搜索或输入网址" aria-label="浏览器地址"/><span aria-hidden="true">{location}</span><button type="button" className="tx-cu-open-external" aria-label="在外部浏览器中打开" title={canOpenExternal?'在外部浏览器中打开（DSH 所在电脑）':'当前地址不能在外部浏览器中打开'} disabled={disabled||!canOpenExternal} onClick={()=>void act('open-external',{tabId:target.id,expectedUrl:current.url})}><ComputerIcon name="popout" size={14}/></button></div>
      <button disabled={!canNavigate || !address} type="submit">前往</button>
    </form><div className="tx-cu-browser-actions">{actions}</div><BrowserDownloads key={sessionId} sessionId={sessionId} visible={visible&&state?.enabled!==false} api={api} active={panel==='downloads'} onActiveChange={value=>setPanel(value?'downloads':null)}/><BrowserTools ref={tools} sessionId={sessionId} target={target} frame={frame} state={state} api={api} onState={onState} onError={onError} previewScale={previewScale} onPreviewScale={onPreviewScale} onDeviceModeChange={onDeviceModeChange} popupOpen={!!panel} onMenuOpen={()=>setPanel(null)} onOpenHistory={()=>setPanel('history')} onOpenDownloads={()=>setPanel('downloads')}/></div>
    {panel==='history'&&visible&&<BrowserHistoryPanel key={sessionId} sessionId={sessionId} api={api} onClose={focus=>{setPanel(null);if(focus)tools.current?.focus();}} onOpen={entry=>act('tabs',{action:'new',browserId:entry.browserId,url:entry.url})}/>}
    {(navigation?.loading || state?.transitioning) && <div className="tx-cu-loading" role="status" aria-label={state?.resuming?'正在恢复助手控制…':'正在载入页面…'}><span className="tx-cu-visually-hidden">{state?.resuming?'正在恢复助手控制…':'正在载入页面…'}</span></div>}
  </div>;
});
