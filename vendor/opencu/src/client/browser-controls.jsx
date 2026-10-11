import React, { forwardRef, useEffect, useLayoutEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {CodexCuScope} from './codex-cu-scope.jsx';
import {BrowserTools, BrowserSiteTools, BrowserProfileSettings, browserLabel} from './browser-tools.jsx';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {CodexCuButton} from './codex-cu-primitives.jsx';
import {CodexSiteInformationButton} from './codex-site-tools.jsx';
import {useBrowserSiteInformation} from './browser-site-information.jsx';
import {CODEX_CU_COPY} from './codex-cu-copy.mjs';
import {BrowserDownloads,BrowserDownloadHistoryPanel} from './browser-downloads.jsx';
import {BrowserHistoryPanel} from './browser-history.jsx';
import {CodexCuDialog} from './codex-cu-dialog.jsx';
import {codexBrowserScope,createCodexBrowserBackend} from './codex-browser-backend.mjs';
import {CodexBrowserAddressInput,EMPTY_ADDRESS_SUGGESTION_STATE} from './codex-browser-address.jsx';
import {BrowserPermissions} from './browser-permissions.jsx';
import {CodexBrowserTransferStrip, CodexBrowserTransferTab} from './codex-browser-tab-transfer.jsx';
const text=id=>CODEX_CU_COPY[id]?.simplifiedChinese??CODEX_CU_COPY[id]?.english??'';
const Icon=({kind})=><CodexCuIcon name={{back:'shared:uht',forward:'shared:uht',reload:'shared:Emt',new:'shared:$ct',close:'shared:Vot'}[kind]} style={kind==='forward'?{transform:'scaleX(-1)'}:undefined}/>;
const tabLabel = tab => tab.url === 'about:blank' ? '新标签页' : tab.title || tab.url;

// Codex puts browser tabs in the workspace header, outside page chrome.
export const BrowserTabStrip = forwardRef(function BrowserTabStrip({tabs=[],target,current,disabled,onSelect,onClose,onNew,onKeyDown},ref){
  const displayed=target&&!tabs.some(tab=>tab.id===target.id)?[...tabs,{...current,available:true}]:tabs;
  return <CodexBrowserTransferStrip>{stripRef=><CodexCuScope as="div" ref={stripRef} className="tx-cu-browser-workspace-tabs">
    <div ref={ref} role="tablist" aria-label="浏览器标签页" className="tx-cu-tablist">{displayed.map(tab=>{
      const active=tab.id===target?.id,label=tabLabel(active?current:tab),actual=active?{...tab,...current}:tab;
      return <CodexBrowserTransferTab key={tab.browserId+':'+tab.id} tab={actual} listedTab={tab} disabled={disabled||!tab.available}>
        {({rowRef,buttonRef,attributes,listeners})=><div ref={rowRef} className={'tx-cu-browser-tab'+(active?' is-active':'')} role="presentation">
          <button ref={buttonRef} {...attributes} {...listeners} type="button" role="tab" aria-selected={active} data-tab-id={tab.id}
            tabIndex={active?0:-1} title={label+' · '+browserLabel(tab)+'\n'+(tab.url??'')+(tab.browserId?'\n'+tab.browserId:'')+(tab.available?'':' · 其他对话正在使用')}
            disabled={disabled||!tab.available} onKeyDown={event=>onKeyDown?.(event,tab,displayed)} onClick={()=>onSelect?.(tab)}>
            <CodexCuIcon name="shared:Dtt" size={16}/><span>{label}</span>
          </button>
          <CodexCuButton size="iconMd" color="ghost" type="button" className="tx-cu-tab-close"
            aria-label={active?'关闭当前标签页':'关闭标签页：'+label} title="关闭标签页" tabIndex={active?0:-1}
            disabled={disabled||!tab.available} onClick={()=>onClose?.(tab)}><Icon kind="close"/></CodexCuButton>
        </div>}
      </CodexBrowserTransferTab>;
    })}{!target&&<span className="tx-cu-empty-tab">新标签页</span>}</div>
    <CodexCuButton size="toolbar" uniform color="ghost" type="button" aria-label="新建标签页" title="新建标签页" disabled={disabled} onClick={onNew}><Icon kind="new"/></CodexCuButton>
  </CodexCuScope>}</CodexBrowserTransferStrip>;
});

export const BrowserControls = forwardRef(function BrowserControls({ sessionId, state, visible, navigation, frame, api, onState, onError, onTargetCreated, onTabInventory, previewScale, onPreviewScale, onDeviceModeChange, onDevicePresetChange, renderTabs, chromeVariant, rowHeight, deviceRowHeight, annotationButton, trailingSlots, renderAccessory, onOpenHistory, onOpenDownloads, onOpenBrowserSettings, onCaptureScreenshot, onOpenSiteInformation, siteTools, renderPermissionPrompt, pluginAddressInput:PluginAddressInput, addressSuggestions, browserOptions }, ref) {
  const [tabSnapshot, setTabSnapshot] = useState({ sessionId: null, tabs: [] }), [address, setAddress] = useState(''), [busy, setBusy] = useState(false);
  const editing = useRef(false), addressInput = useRef(null), addressBar=useRef(null), selectAddressOnEdit=useRef(true), pending = useRef(null), keyboardTarget=useRef(null);
  const hasEditedAddress=useRef(false),keepAddressSelected=useRef(false),stoppingAddressEditing=useRef(false),showAddressSuggestions=useRef(null);
  const navigationClient = useRef(crypto.randomUUID()), sequence = useRef(0);
  const addressObservation = useRef(0), pendingFocus = useRef(null);
  const[panel,setPanel]=useState(null),[page,setPage]=useState(null),[preferences,setPreferences]=useState(null),[isAddressEditing,setIsAddressEditing]=useState(false);
  const chrome=useRef(null),leading=useRef(null),trailing=useRef(null);
  const floating=chromeVariant!=='standard';
  useEffect(()=>{setPanel(null);setPage(null);},[sessionId]);
  useEffect(()=>{if(!visible||state?.enabled===false){setPanel(null);setPage(null);}},[visible,state?.enabled]);
  const viewed=state?.viewTarget??state?.target,target=viewed?.kind==='tab'?viewed:null;
  const profileScope=useMemo(()=>codexBrowserScope(target,frame,state),[target?.browserId,target?.id,target?.url,frame?.tabId,frame?.actor,frame?.loaderId,frame?.siteAnnotationRevision,state?.controlEpoch]);
  const profileBackend=useMemo(()=>createCodexBrowserBackend(api,sessionId,profileScope),[api,sessionId,profileScope]);
  useEffect(()=>{
    setPreferences(null);if(!visible||target?.detached||!profileScope.browserId||!profileScope.tabId||state?.enabled===false)return;
    const controller=new AbortController();
    void profileBackend.call('profileStatus',{},controller.signal).then(async result=>{
      if(!controller.signal.aborted&&result.preferences?.available){const prefs=await profileBackend.call('profilePreferences',{},controller.signal);if(!controller.signal.aborted)setPreferences(prefs);}
    }).catch(()=>{});
    return()=>controller.abort();
  },[profileBackend,visible,state?.enabled,target?.detached]);
  const openPage=value=>{setPanel(null);setPage(value);};
  const openHistory=onOpenHistory??browserOptions?.onOpenHistory??(()=>openPage('history'));
  const openDownloads=onOpenDownloads??browserOptions?.onOpenDownloads??(()=>openPage('download-history'));
  const openSettings=onOpenBrowserSettings??browserOptions?.onOpenBrowserSettings??(()=>openPage('settings'));
  useEffect(()=>{setPage(null);},[target?.browserId,target?.id,target?.detached]);
  useEffect(()=>{setPanel(value=>value==='site'?null:value);},[sessionId,target?.id,target?.url,navigation?.url]);
  useLayoutEffect(()=>{
    const root=chrome.current;if(!root)return;
    const observe=(element,key)=>{if(!element)return()=>{};const measure=()=>root.style.setProperty(key,Math.round(element.getBoundingClientRect().width)+'px');const observer=new ResizeObserver(measure);observer.observe(element,{box:'border-box'});measure();return()=>observer.disconnect();};
    const releaseLeading=observe(leading.current,'--browser-leading-width'),releaseTrailing=observe(trailing.current,'--browser-trailing-width');
    return()=>{releaseLeading();releaseTrailing();};
  },[floating]);
  const tabs = tabSnapshot.sessionId === sessionId ? tabSnapshot.tabs : [];
  const tabList=useRef(null),tools=useRef(null);
  useEffect(()=>{tabList.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[target?.id,tabs.length]);
  const latest = useRef({ state, target, onState, onError }); latest.current = { state, target, onState, onError, onTargetCreated, onTabInventory };
  useLayoutEffect(()=>{if(isAddressEditing&&selectAddressOnEdit.current)addressInput.current?.select();},[isAddressEditing]);
  useLayoutEffect(() => {
    addressObservation.current = 0;
    editing.current = false;hasEditedAddress.current=false;keepAddressSelected.current=false;stoppingAddressEditing.current=false;setIsAddressEditing(false);setAddress(target?.url === 'about:blank' ? '' : target?.url ?? '');
    const keyboard = target && keyboardTarget.current === target.id;
    pendingFocus.current = target && (keyboard || target.url === 'about:blank') ? { id: target.id, keyboard } : null;
    if (keyboard) keyboardTarget.current = null;
  }, [sessionId, target?.id]);
  useLayoutEffect(() => {
    // Shared state can commit before the initiating action clears its busy
    // flag. A disabled input cannot be focused; retain intent until enabled.
    const focus = pendingFocus.current;
    if (!focus || focus.id !== target?.id || !visible || busy || state?.transitioning || state?.resuming || state?.enabled === false) return;
    const element = focus.keyboard ? tabList.current?.querySelector('[aria-selected="true"]') : addressInput.current;
    if (element && !element.disabled) { element.focus(); pendingFocus.current = null; }
  }, [target?.id, visible, busy, state?.transitioning, state?.resuming, state?.enabled, tabs.length]);
  useEffect(() => {
    if (!editing.current && !pending.current && navigation && target && navigation.tabId === target.id && (navigation.observedAt ?? 0) >= addressObservation.current) {
      addressObservation.current = navigation.observedAt ?? 0;
      setAddress(navigation.url === 'about:blank' ? '' : navigation.url);
    }
  }, [navigation, target?.id, busy]);
  useEffect(() => {
    // Listing tabs can launch the managed browser. An empty Browser pane
    // must stay passive until a route or a manual action creates a target.
    if (!visible || !sessionId || !target || state?.enabled === false) return;
    let active = true, timer;
    const refresh = async () => {
      try { const result = await api('tabs', sessionId); if (active) { setTabSnapshot({ sessionId, tabs: result.tabs }); latest.current.onTabInventory?.(result); } }
      catch (error) { if (active) latest.current.onError(error.message); }
      if (active) timer = setTimeout(refresh, 1500);
    };
    void refresh(); return () => { active = false; clearTimeout(timer); };
  }, [sessionId, visible, target?.id, state?.enabled]);
  const act = async (op, value) => {
    if (!sessionId || !latest.current.state || latest.current.state.enabled === false || latest.current.state.resuming) return false;
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
      if (op === 'tabs' && value.action === 'new' && nextView?.kind === 'tab') latest.current.onTargetCreated?.(nextView);
      return true;
    } catch (error) { if (pending.current === request && !['NAVIGATION_SUPERSEDED', 'COMPUTER_USE_STOPPED'].includes(error.code)) latest.current.onError(error.message);return false; }
    finally { if (pending.current === request) { pending.current = null; setBusy(false); } }
  };
  const shortcut = action => {
    if (action === 'focus') { addressInput.current?.focus(); addressInput.current?.select(); showAddressSuggestions.current?.(); }
    else if(action==='find')tools.current?.openFind();
    else if(action==='history')openHistory();
    else if(action==='downloads')openDownloads();
    else if (action === 'new') void act('tabs', { action: 'new',browserId:latest.current.target?.browserId??'browser' });
    else if (latest.current.target) void act(action === 'close' ? 'tabs' : 'navigate', { action, tabId: latest.current.target.id });
  };
  const paneKey=event=>{
    if(event.defaultPrevented||event.nativeEvent.isComposing)return;
    const key=event.key.toLowerCase(),modified=event.metaKey||event.ctrlKey;
    const action=modified?({l:'focus',f:'find',j:'downloads',h:'history',y:event.metaKey?'history':undefined,r:'reload',t:'new',w:'close'})[key]:event.altKey?({arrowleft:'back',arrowright:'forward'})[key]:null;
    if(action){event.preventDefault();event.stopPropagation();shortcut(action);}
  };
  useImperativeHandle(ref, () => ({ shortcut,resizeViewport:size=>tools.current?.resizeViewport(size),openHistoryEntry:entry=>act('tabs',{action:'new',browserId:entry.browserId,url:entry.url}),captureScreenshot:()=>tools.current?.captureScreenshot() }));
  const disabled = !sessionId || !state || busy || state?.transitioning || state?.resuming || state?.enabled === false;
  const canNavigate = !!sessionId && !!state && state.enabled !== false && !state.resuming && (!(busy || state.transitioning) || pending.current?.op === 'navigate');
  const current = target?(navigation?.tabId === target.id ? { ...target, ...navigation } : target):null;
  const selectTab=tab=>{if(tab.available)void act('view-tab',{tabId:tab.id,browserId:tab.browserId});};
  const moveTab=(event,tab,displayedTabs)=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const available=displayedTabs.filter(item=>item.available),index=available.findIndex(item=>item.id===tab.id);
    const next=available[event.key==='Home'?0:event.key==='End'?available.length-1:(index+(event.key==='ArrowRight'?1:-1)+available.length)%available.length];
    if(next){keyboardTarget.current=next.id;tabList.current?.querySelectorAll('[role="tab"]')[displayedTabs.indexOf(next)]?.focus();selectTab(next);}
  };
  const tabChrome=renderTabs?.(<BrowserTabStrip ref={tabList} tabs={tabs} target={target} current={current} disabled={disabled} onSelect={selectTab} onClose={tab=>void act('tabs',{action:'close',tabId:tab.id,browserId:tab.browserId})} onNew={()=>shortcut('new')} onKeyDown={moveTab}/>);
  const currentUrl=current?.url==='about:blank'?'':current?.url??'';
  const siteInformation=useBrowserSiteInformation({sessionId,scope:profileScope,browserEpoch:target?.browserEpoch,api,
    pageUrl:currentUrl,documentKey:frame?.loaderId,visible,disabled:disabled||!!target?.detached,onOpenSiteInformation,onError});
  useEffect(()=>{setPanel(previous=>siteInformation.isOpen?'site':previous==='site'?null:previous);},[siteInformation.isOpen]);
  const certificateAddress=!isAddressEditing&&current?.securityState==='certificate-error'&&currentUrl.trim().toLowerCase().startsWith('https://')?{scheme:currentUrl.trim().slice(0,5),rest:currentUrl.trim().slice(5)}:null;
  const displayAddress=(()=>{
    if(isAddressEditing||!currentUrl)return address;
    if(preferences?.values?.showFullUrl===true)return currentUrl;
    if(certificateAddress)return currentUrl;
    try{
      const parsed=new URL(currentUrl),host=parsed.hostname.toLowerCase();
      if(['localhost','127.0.0.1','0.0.0.0','[::1]','::1'].includes(host)||host.endsWith('.localhost')){
        const full=currentUrl.replace(/^https?:\/\//i,'');return parsed.pathname==='/'&&!parsed.search&&!parsed.hash?full.replace(/\/$/,''):full;
      }
      if(parsed.protocol==='https:')return parsed.host.replace(/^www\./i,'');
      if(parsed.protocol==='http:')return 'http://'+parsed.host;
    }catch{}
    return currentUrl;
  })();
  const canOpenExternal=/^https?:\/\//i.test(currentUrl);
  const loading=!!(navigation?.tabId===target?.id&&navigation?.loading||busy||state?.transitioning||state?.resuming);
  const siteToolsNode=siteTools??(target&&!target.detached&&<BrowserSiteTools key={target.id+'\0'+(frame?.loaderId??'')} sessionId={sessionId} scope={profileScope} api={api} visible={visible&&!disabled} isBrowserUseActive={frame?.browserUseActive??state?.browserUseActive??true} onError={onError}/>);
  const permissionRenderer=renderPermissionPrompt??(trigger=><BrowserPermissions key={[sessionId,profileScope.browserId,profileScope.tabId,profileScope.actor,profileScope.controlEpoch,frame?.loaderId,currentUrl].join('\0')} sessionId={sessionId} scope={profileScope} api={api} pageUrl={currentUrl} documentKey={frame?.loaderId} visible={visible&&!target?.detached&&!!target&&!state?.resuming&&!state?.transitioning&&state?.enabled!==false} onError={onError}>{trigger}</BrowserPermissions>);
  const finishAddressEditing=()=>{editing.current=false;setIsAddressEditing(false);};
  const acceptAddressEditing=()=>{if(hasEditedAddress.current)setAddress(currentUrl);hasEditedAddress.current=false;keepAddressSelected.current=false;finishAddressEditing();stoppingAddressEditing.current=false;addressInput.current?.blur();};
  const startAddressEditing=(shouldSelect=true)=>{
    selectAddressOnEdit.current=shouldSelect;
    stoppingAddressEditing.current=false;
    if(!editing.current){setAddress(currentUrl);hasEditedAddress.current=false;}
    keepAddressSelected.current=shouldSelect;
    editing.current=true;setIsAddressEditing(true);setPanel(null);addressInput.current?.focus();
  };
  const cancelAddressEditing=()=>{setAddress(currentUrl);hasEditedAddress.current=false;keepAddressSelected.current=false;finishAddressEditing();};
  const navigateAddress=value=>{
    if(!canNavigate||!value.trim())return;
    setAddress(value);
    editing.current=false;setIsAddressEditing(false);
    void(target?act('navigate',{action:'goto',tabId:target.id,url:value}):act('tabs',{action:'new',browserId:'browser',url:value}));
  };
  const inputClass='tx-cu-browser-source-address'+(floating?' is-floating':'')+(!isAddressEditing&&currentUrl?' has-address':'');
  const sourceAddressProps={id:target?.id??'empty-browser',addressBarRef:addressBar,addressInputRef:addressInput,addressValue:displayAddress,currentAddress:currentUrl,isAddressEditing,isVisible:visible&&canNavigate,disabled:!canNavigate,className:inputClass,ariaLabel:'浏览器地址',conversationId:sessionId,providers:addressSuggestions?.providers??[],sources:addressSuggestions?.sources,allowEmptySuggestions:addressSuggestions?.allowEmpty===true,bottomPanelAnimation:addressSuggestions?.bottomPanelAnimation,rightPanelLayoutTick:addressSuggestions?.rightPanelLayoutTick,panelTarget:addressSuggestions?.panelTarget,showAddressSuggestionsRef:showAddressSuggestions,onAddressValueChange:value=>{editing.current=true;hasEditedAddress.current=true;setIsAddressEditing(true);setAddress(value);},onAcceptAddressEditing:acceptAddressEditing,onCancelAddressEditing:cancelAddressEditing,onNavigate:navigateAddress,onEnsureAddressEditing:()=>{if(!editing.current)startAddressEditing(!!currentUrl);},onFinishAddressEditing:finishAddressEditing,onFind:()=>tools.current?.openFind(),onStartAddressEditing:()=>startAddressEditing(),onStopAddressEditing:()=>{stoppingAddressEditing.current=true;cancelAddressEditing();addressInput.current?.blur();},submittedAddressStillPending:pending.current?.op==='navigate',hasEditedAddressRef:hasEditedAddress,shouldKeepAddressSelectedRef:keepAddressSelected,isStoppingAddressEditingRef:stoppingAddressEditing,placeholder:text('thread.browser.addressPlaceholder')};
  const addressNode=PluginAddressInput?<PluginAddressInput {...sourceAddressProps}/>:<CodexBrowserAddressInput {...addressSuggestions?.callbacks} id={sourceAddressProps.id} addressBarRef={addressBar} inputRef={addressInput} query={displayAddress} currentAddress={currentUrl} isAddressEditing={isAddressEditing} isVisible={sourceAddressProps.isVisible} disabled={!canNavigate} className={inputClass} placeholder={sourceAddressProps.placeholder} ariaLabel={sourceAddressProps.ariaLabel} suggestionState={addressSuggestions?.state??EMPTY_ADDRESS_SUGGESTION_STATE} hasSuggestionSources={addressSuggestions?.hasSources===true} allowEmptySuggestions={sourceAddressProps.allowEmptySuggestions} bottomPanelAnimation={sourceAddressProps.bottomPanelAnimation} rightPanelLayoutTick={sourceAddressProps.rightPanelLayoutTick} panelTarget={sourceAddressProps.panelTarget} showAddressSuggestionsRef={showAddressSuggestions} onValueChange={sourceAddressProps.onAddressValueChange} onStartEditing={sourceAddressProps.onStartAddressEditing} onEnsureEditing={sourceAddressProps.onEnsureAddressEditing} onAccept={acceptAddressEditing} onCancel={cancelAddressEditing} onStopEditing={sourceAddressProps.onStopAddressEditing} onFinishEditing={finishAddressEditing} onNavigate={navigateAddress} onFind={sourceAddressProps.onFind} submittedAddressStillPending={sourceAddressProps.submittedAddressStillPending} hasEditedAddressRef={hasEditedAddress} shouldKeepAddressSelectedRef={keepAddressSelected} isStoppingAddressEditingRef={stoppingAddressEditing}/>;
  const navigationButtons=<>
    <CodexCuButton size="toolbar" uniform radius={floating?'full':'default'} color={disabled||!current?.canGoBack?'ghost':'ghostActive'} aria-label={text('thread.browser.back')} title={text('thread.browser.back')} disabled={disabled||!current?.canGoBack} onClick={()=>shortcut('back')}><Icon kind="back"/></CodexCuButton>
    <CodexCuButton size="toolbar" uniform radius={floating?'full':'default'} color={disabled||!current?.canGoForward?'ghost':'ghostActive'} aria-label={text('thread.browser.next')} title={text('thread.browser.next')} disabled={disabled||!current?.canGoForward} onClick={()=>shortcut('forward')}><Icon kind="forward"/></CodexCuButton>
    {floating&&<span className="tx-cu-browser-divider" aria-hidden="true"/>}
    <CodexCuButton size="toolbar" uniform radius={floating?'full':'default'} color={disabled?'ghost':'ghostActive'} aria-label={text('thread.browser.reload')} title={text('thread.browser.reload')} aria-busy={loading} disabled={disabled||!target} onClick={()=>shortcut('reload')}>{loading?<CodexCuIcon name="shared:Dk" className="tx-cu-browser-spinner"/>:<Icon kind="reload"/>}</CodexCuButton>
  </>;
  if(target?.detached)return <>{tabChrome}</>;
  return <>{tabChrome}<CodexCuScope as="div" ref={chrome} className="tx-cu-browser-controls" style={rowHeight==null?undefined:{'--codex-browser-row-height':typeof rowHeight==='number'?rowHeight+'px':rowHeight}} data-chrome-variant={floating?'floating':'standard'} data-source-gate-state={chromeVariant?'provided':'user-confirmed'} aria-label="浏览器导航" onKeyDown={paneKey}>

    <div className="tx-cu-browser-navigation" data-browser-sidebar-toolbar="true" data-viewer-density={floating?'compact':undefined}>
      <div ref={leading} className="tx-cu-browser-leading"><div className={floating?'tx-cu-browser-capsule tx-cu-browser-joined':'tx-cu-browser-navigation-buttons'} role="group" aria-label="Navigation">{navigationButtons}</div>{floating&&annotationButton&&<div className="tx-cu-browser-annotation">{annotationButton}</div>}</div>
      <div className="tx-cu-address">
        <div ref={addressBar} className="tx-cu-browser-address-width"><div className={'tx-cu-location'+(isAddressEditing?' is-editing':'')+(panel==='site'?' is-open':'')+(floating?' tx-cu-browser-capsule tx-cu-browser-input-surface':'')} data-codex-cu-address-bar data-state={isAddressEditing||panel==='site'?'active':undefined} onClick={()=>{if(canNavigate)startAddressEditing(!isAddressEditing);}} onContextMenu={()=>{if(canNavigate)startAddressEditing(false);}}>
          <CodexSiteInformationButton currentUrl={currentUrl} browserTabId={target?.id} conversationId={sessionId} floating={floating} isAddressEditing={isAddressEditing} isOpen={siteInformation.isOpen} serviceAvailable={siteInformation.available} disabled={disabled} pending={siteInformation.pending} securityState={current?.securityState} onOpenChange={value=>setPanel(value?'site':null)} onOpenSiteInformation={siteInformation.open} onError={error=>{if(!error.nativeSiteInfoReported)onError?.(error.message);}} renderPermissionPrompt={permissionRenderer} messages={{viewSiteInformation:text('thread.browser.viewSiteInformation'),notSecureSiteInformation:text('thread.browser.notSecureSiteInformation'),notSecure:text('thread.browser.notSecure')}}/>
          <div className="tx-cu-browser-address-text"><div className={'tx-cu-browser-address-input'+(certificateAddress?' has-certificate-error':'')} inert={!canNavigate?true:undefined} data-address-input-source={PluginAddressInput?'plugin':'standard'}>
            {certificateAddress&&<div aria-hidden="true" className="tx-cu-browser-certificate-address"><span><span>{certificateAddress.scheme}</span><span>{certificateAddress.rest}</span></span></div>}
            {!isAddressEditing&&siteToolsNode&&<div className="tx-cu-browser-site-tools-overlay"><div className="tx-cu-browser-site-tools-trigger" role="presentation" onClick={event=>event.stopPropagation()}>{siteToolsNode}</div><span aria-hidden="true" className="tx-cu-browser-site-tools-address">{displayAddress}</span><span aria-hidden="true" className="tx-cu-browser-site-tools-spacer"/></div>}
            {addressNode}
          </div></div>
          {currentUrl&&<button type="button" data-browser-sidebar-open-external="true" className="tx-cu-open-external" aria-label={text('thread.browser.openExternalBrowser')} title={text('thread.browser.openExternalBrowser')} disabled={disabled||!canOpenExternal||isAddressEditing&&address!==currentUrl} onPointerDown={event=>event.preventDefault()} onMouseDown={event=>event.preventDefault()} onClick={event=>{event.stopPropagation();void act('open-external',{tabId:target.id,expectedUrl:current.url});}}><CodexCuIcon name="shared:$lt" size={16}/></button>}
        </div></div>
      </div>
      <div ref={trailing} className="tx-cu-browser-trailing">
        <div className={floating?'tx-cu-browser-capsule tx-cu-browser-joined tx-cu-browser-action-group':'tx-cu-browser-action-group'}>{trailingSlots}{!floating&&annotationButton}<BrowserDownloads key={sessionId} sessionId={sessionId} scope={profileScope} visible={visible&&!!state&&state.enabled!==false} observeSnapshot={!!target} api={api} active={panel==='downloads'} onActiveChange={value=>setPanel(value?'downloads':null)} floating={floating} onError={onError}/></div>
        <BrowserTools ref={tools} sessionId={sessionId} target={target} frame={frame} state={state} api={api} onState={onState} onError={onError} previewScale={previewScale} onPreviewScale={onPreviewScale} onDeviceModeChange={onDeviceModeChange} onDevicePresetChange={onDevicePresetChange} popupOpen={!!panel||!!page} onMenuOpen={()=>setPanel(null)} onOpenHistory={openHistory} onOpenDownloads={openDownloads} onOpenBrowserSettings={openSettings} onCaptureScreenshot={onCaptureScreenshot} floating={floating} deviceRowHeight={deviceRowHeight} renderAccessory={renderAccessory} browserOptions={browserOptions}/>
      </div>
      <div className={'tx-cu-browser-loading'+(loading?' is-loading':'')} aria-hidden="true"><div/></div>
    </div>
  </CodexCuScope>
  <CodexCuDialog open={!!page} onOpenChange={open=>{if(!open)setPage(null);}} size="xwideTall" contentProps={{style:{height:'min(80vh, 760px)'},'aria-label':page==='history'?'浏览历史':page==='download-history'?'下载记录':'浏览器设置'}}>
    {page==='history'&&<BrowserHistoryPanel sessionId={sessionId} scope={profileScope} api={api} onOpen={entry=>act('tabs',{action:'new',browserId:entry.browserId,url:entry.url})} onClose={()=>setPage(null)} onClearBrowsingData={()=>openPage('settings')}/>}
    {page==='download-history'&&<BrowserDownloadHistoryPanel sessionId={sessionId} scope={profileScope} api={api} onClose={()=>setPage(null)}/>}
    {page==='settings'&&<BrowserProfileSettings sessionId={sessionId} scope={profileScope} api={api} onPreferencesChange={setPreferences} onClose={()=>setPage(null)} onOpenHistory={()=>openPage('history')} onOpenDownloads={()=>openPage('download-history')}/>}
  </CodexCuDialog></>;
});
