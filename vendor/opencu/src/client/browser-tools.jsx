import React,{forwardRef,useCallback,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {CodexCuButton,CodexCuTooltip} from './codex-cu-primitives.jsx';
import {CodexDeviceToolbar,CODEX_DEVICE_PRESETS} from './codex-device-toolbar.jsx';
import {CodexBrowserOptionsMenu} from './codex-browser-options.jsx';
import {renderCodexCuLayer} from './codex-cu-overlay.jsx';
import {BrowserFindBar} from './browser-find.jsx';
import {CODEX_CU_COPY} from './codex-cu-copy.mjs';
import {CodexSiteTools} from './codex-site-tools.jsx';
import {createCodexBrowserBackend,codexCanRequestProfileAccess} from './codex-browser-backend.mjs';
import {CodexBrowserBrowsingDataRow,CodexBrowserSettings,CodexBrowserClearDataDialog,createCodexBrowserClearDataSelection,CodexBrowserPreferenceMenu,CodexBrowserSiteSettingsRow} from './codex-browser-settings.jsx';
import {CodexCuSettingsPage,CodexCuSettingsSection,CodexCuSettingsGroup,CodexCuSettingsRow} from './codex-cu-settings-primitives.jsx';
import {BrowserProfileImportDialog} from './browser-profile-import.jsx';

const copy=id=>CODEX_CU_COPY[id]?.simplifiedChinese??CODEX_CU_COPY[id]?.english??'';
export const browserLabel=value=>value?.browserName||(value?.browserId==='browser'?'内置浏览器':value?.browserId==='chrome'||value?.browserId?.startsWith('chrome:')?'Chrome':value?.browserId?'外部浏览器':'浏览器');
export const BrowserTools=forwardRef(function BrowserTools({sessionId,target,frame,state,api,onState,onError,previewScale='1',onPreviewScale,onDeviceModeChange,onDevicePresetChange,popupOpen,onMenuOpen,onOpenHistory,onOpenDownloads,onOpenBrowserSettings,onCaptureScreenshot,floating=false,deviceRowHeight,renderAccessory,browserOptions},ref){
  const [menu,setMenu]=useState(false),[menuIntent,setMenuIntent]=useState('pointer'),[devices,setDevices]=useState(false),[width,setWidth]=useState(''),[height,setHeight]=useState(''),[busy,setBusy]=useState(false),[openSubmenu,setOpenSubmenu]=useState(null),[devicePreset,setDevicePreset]=useState('responsive'),[toolbarWidth,setToolbarWidth]=useState(0),[rotating,setRotating]=useState(false),[rotationKey,setRotationKey]=useState(0),[pageZoom,setPageZoom]=useState(null),[importOpen,setImportOpen]=useState(false);
  const deviceRow=useRef(null),accessoryRoot=useRef(null),zoomRead=useRef(null),zoomEndpointMissing=useRef(false),menuFindFocus=useRef(false);
  useEffect(()=>{if(!devices||!deviceRow.current)return;const element=deviceRow.current,measure=()=>setToolbarWidth(element.getBoundingClientRect().width),observer=new ResizeObserver(measure);observer.observe(element);measure();return()=>observer.disconnect();},[devices]);
  const anchor=useRef(null),trigger=useRef(null),request=useRef(null),resetting=useRef(false),generation=useRef(0),latest=useRef(null);
  const [finding,setFinding]=useState(false),[query,setQuery]=useState(''),[findResult,setFindResult]=useState(null),[composing,setComposing]=useState(false);
  const findInput=useRef(null),attempted=useRef(null),pendingFind=useRef(null);
  const findDocument=useRef(null);
  useEffect(()=>{if(popupOpen)setMenu(false);},[popupOpen]);
  useEffect(()=>{
    if(!frame?.loaderId)return;
    if(findDocument.current&&findDocument.current!==frame.loaderId){setFindResult(null);attempted.current=query;pendingFind.current=null;}
    findDocument.current=frame.loaderId;
  },[frame?.loaderId]);
  useEffect(()=>{onDeviceModeChange?.(devices);},[devices,onDeviceModeChange]);
  useEffect(()=>{onDevicePresetChange?.(devicePreset);},[devicePreset,onDevicePresetChange]);
  latest.current={frame,state,target,onState,onError};
  useEffect(()=>{setMenu(false);setImportOpen(false);setDevices(false);setOpenSubmenu(null);setDevicePreset('responsive');setPageZoom(null);setBusy(false);resetting.current=false;return()=>{generation.current++;request.current?.abort();zoomRead.current?.abort();};},[sessionId,target?.id]);
  useEffect(()=>{zoomEndpointMissing.current=false;},[sessionId,api]);
  useEffect(()=>{setFinding(false);setQuery('');setFindResult(null);attempted.current=null;pendingFind.current=null;},[sessionId,target?.id]);
  useEffect(()=>{if(finding){findInput.current?.focus();findInput.current?.select();}},[finding]);
  const openFind=()=>{setFinding(true);findInput.current?.focus();findInput.current?.select();};
  const closeFind=()=>{if(request.current?.operation==='view-find')request.current.abort();setFinding(false);attempted.current=query;pendingFind.current=null;trigger.current?.focus();};
  useImperativeHandle(ref,()=>({openFind,focus:()=>trigger.current?.focus(),resizeViewport:size=>action('view-viewport',{size}),captureScreenshot:()=>action('view-screenshot')}));
  useEffect(()=>{if(frame?.width&&frame?.height){setWidth(String(Math.round(frame.width)));setHeight(String(Math.round(frame.height)));}},[frame?.width,frame?.height]);
  useEffect(()=>{if(state?.viewViewport?.overridden||state?.viewEmulation)setDevices(true);},[target?.id,state?.viewViewport?.overridden,!!state?.viewEmulation]);
  const closeMenu=()=>{setMenu(false);setOpenSubmenu(null);};
  const action=async(op,value={},options={})=>{
    if(request.current||(resetting.current&&!options.batch))return false;
    const current=latest.current;if(!current.state||current.state.enabled===false||current.state.resuming||current.state.transitioning)return false;
    const observed=options.scope?.frame??current.frame,version=options.scope?.version??generation.current;
    if(version!==generation.current||observed?.tabId!==current.target?.id)return false;
    if(!observed?.actor||observed.tabId!==current.target?.id){current.onError('等待当前网页画面就绪后重试');return false;}
    const controller=new AbortController();controller.operation=op;request.current=controller;setBusy(true);
    try{
      const result=await api(op,sessionId,{...value,actor:observed.actor,tabId:observed.tabId,controlEpoch:options.controlEpoch??current.state.controlEpoch},controller.signal);
      if(version!==generation.current||latest.current.target?.id!==observed.tabId)return false;
      if(op==='view-zoom'){
        if(result.available===true&&Number.isFinite(result.zoomPercent)&&result.zoomPercent>0)setPageZoom({...result,sessionId,tabId:observed.tabId,actor:observed.actor});
        else setPageZoom({available:false,sessionId,tabId:observed.tabId,actor:observed.actor});
        if(result.state)latest.current.onState(result.state);
      }else if(!['view-screenshot','view-copy-screenshot'].includes(op))latest.current.onState(result);
      if(op==='view-find')setFindResult(result.find);
      latest.current.onError('');return result;
    }catch(error){if(!controller.signal.aborted&&version===generation.current)latest.current.onError(error.message);return false;}
    finally{if(request.current===controller)request.current=null;if(version===generation.current&&!options.batch)setBusy(false);}
  };
  const ready=!!state&&!!frame?.actor&&frame.tabId===target?.id&&target?.url!=='about:blank'&&state.enabled!==false&&!state.transitioning&&!state.resuming&&!busy;
  useEffect(()=>{
    if(zoomEndpointMissing.current||!sessionId||!frame?.actor||frame.tabId!==target?.id||!state||state.enabled===false||state.transitioning||state.resuming||busy)return;
    const controller=new AbortController(),version=generation.current,observed={actor:frame.actor,tabId:frame.tabId,controlEpoch:state.controlEpoch};zoomRead.current=controller;
    const valid=()=>!controller.signal.aborted&&version===generation.current&&latest.current.target?.id===observed.tabId&&latest.current.frame?.actor===observed.actor&&latest.current.state?.controlEpoch===observed.controlEpoch&&latest.current.state?.enabled!==false&&!latest.current.state?.transitioning&&!latest.current.state?.resuming;
    void api('view-zoom',sessionId,{action:'get',...observed},controller.signal).then(result=>{
      if(!valid())return;
      if(result.available===false)setPageZoom({...result,sessionId,...observed});
      else if(result.available===true&&Number.isFinite(result.zoomPercent)&&result.zoomPercent>0)setPageZoom({...result,sessionId,tabId:observed.tabId,actor:observed.actor});
      else setPageZoom({available:null,sessionId,...observed,reason:'INVALID_ZOOM_STATE'});
    }).catch(error=>{
      if(!valid())return;
      const missing=error.message==='Unknown route'||['ZOOM_UNAVAILABLE','NOT_FOUND'].includes(error.code);
      if(error.message==='Unknown route'||error.code==='NOT_FOUND')zoomEndpointMissing.current=true;
      setPageZoom({available:missing?false:null,sessionId,...observed,reason:error.code??error.message});
    });
    return()=>{controller.abort();if(zoomRead.current===controller)zoomRead.current=null;};
  },[sessionId,target?.id,frame?.actor,frame?.loaderId,state?.controlEpoch,state?.enabled,state?.transitioning,state?.resuming,busy,api,menu]);
  const hasPageZoom=Boolean(pageZoom&&pageZoom.sessionId===sessionId&&pageZoom.tabId===target?.id&&pageZoom.actor===frame?.actor&&pageZoom.available===true&&Number.isFinite(pageZoom.zoomPercent));
  const find=(backward=false)=>{if(query&&!composing){if(request.current){pendingFind.current={query,backward};return;}attempted.current=query;void action('view-find',{query,backward});}};
  useEffect(()=>{
    if(!finding||!query||composing||!ready)return;
    const queued=pendingFind.current?.query===query?pendingFind.current:null;
    if(attempted.current===query&&!queued)return;
    const timer=setTimeout(()=>{pendingFind.current=null;attempted.current=query;void action('view-find',queued??{query});},queued?0:200);return()=>clearTimeout(timer);
  },[finding,query,composing,ready]);
  const resize=size=>action('view-viewport',{size});
  const resetDevices=async(close=false)=>{
    if(request.current||resetting.current)return false;
    const scope={frame:latest.current.frame,version:generation.current};resetting.current=true;setBusy(true);
    try{
      const emulation=await action('view-emulation',{settings:null},{batch:true,scope});
      if(!emulation)return false;
      const viewport=await action('view-viewport',{size:null},{batch:true,scope,controlEpoch:emulation.controlEpoch});
      if(!viewport)return false;
      if(close){setDevices(false);setOpenSubmenu(null);setDevicePreset('responsive');trigger.current?.focus();}return true;
    }finally{if(scope.version===generation.current){resetting.current=false;setBusy(false);}}
  };
  const hideDevices=()=>{if(!state?.viewViewport?.overridden&&!state?.viewEmulation){setDevices(false);setOpenSubmenu(null);setDevicePreset('responsive');trigger.current?.focus();}else void resetDevices(true);};
  const menuKey=event=>{
    if(event.defaultPrevented)return;
    if(event.target===trigger.current&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setMenuIntent(event.key==='ArrowUp'?'keyboard-last':'keyboard');onMenuOpen?.();setMenu(true);return;}
  };
  const commitDimension=(field,raw)=>{
    if(!ready)return;
    const min=field==='width'?240:160,number=Number(raw),value=Math.min(4096,Math.max(min,Math.round(Number.isFinite(number)&&number>0?number:field==='width'?frame.width:frame.height)));
    field==='width'?setWidth(String(value)):setHeight(String(value));setDevicePreset('responsive');
    const size={width:field==='width'?value:Number(width),height:field==='height'?value:Number(height)};
    if(size.width!==frame.width||size.height!==frame.height)void resize(size);
  };
  const accessories=<>
    {finding&&<BrowserFindBar inputRef={findInput} query={query} onQueryChange={setQuery} onNext={()=>find()} onPrevious={()=>find(true)} onClose={closeFind} ready={ready} composing={composing} onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)} isLoading={request.current?.operation==='view-find'} matches={findResult?.query===query?findResult.matches:undefined} activeMatchOrdinal={findResult?.query===query?findResult.activeMatchOrdinal:undefined}/>}
    {devices&&<div ref={deviceRow} className="tx-cu-browser-device-row" style={deviceRowHeight==null?undefined:{height:deviceRowHeight}}><CodexDeviceToolbar state={{isEnabled:true,presetId:devicePreset,width:Number(width),height:Number(height)}} copy={Object.fromEntries(['dimensions','width','height','zoom','rotate','close'].map(key=>[key,copy('thread.browser.deviceToolbar.'+key)]))} presetLabels={Object.fromEntries(CODEX_DEVICE_PRESETS.map(preset=>[preset.id,copy('thread.browser.deviceToolbar.'+({'responsive':'responsive','4k':'4k','laptop-l':'laptopLarge','laptop':'laptop','surface-pro-7':'surfacePro7','ipad-air':'ipadAir','ipad-mini':'ipadMini','surface-duo':'surfaceDuo','iphone-15-pro-max':'iphone15ProMax','pixel-8':'pixel8','iphone-15-pro':'iphone15Pro','samsung-galaxy-s24-ultra':'samsungGalaxyS24Ultra','iphone-se':'iphoneSe'}[preset.id]))||preset.label]))} widthDraft={width} heightDraft={height} toolbarWidth={toolbarWidth||undefined} disabled={!ready} zoomControlAvailable={hasPageZoom} currentZoomPercent={hasPageZoom?pageZoom.zoomPercent:undefined} onZoomPercentChange={zoomPercent=>void action('view-zoom',{action:'set',zoomPercent})} rotating={rotating} rotationKey={rotationKey} onRotationAnimationEnd={()=>setRotating(false)} onPresetChange={id=>{const preset=CODEX_DEVICE_PRESETS.find(value=>value.id===id);if(!preset||!ready)return;setDevicePreset(id);if(id!=='responsive')void resize({width:preset.width,height:preset.height});}} onDimensionDraftChange={(field,raw)=>field==='width'?setWidth(raw):setHeight(raw)} onDimensionBlur={commitDimension} onDimensionKeyDown={(field,event)=>{if(event.key==='Escape'){event.preventDefault();field==='width'?setWidth(String(frame.width)):setHeight(String(frame.height));event.currentTarget.value=String(field==='width'?frame.width:frame.height);event.currentTarget.blur();}}} onRotate={()=>{if(!ready)return;setRotationKey(value=>value+1);setRotating(true);void resize({width:Number(height),height:Number(width)});}} onClose={hideDevices}/></div>}
  </>;
  const sourceDirection=browserOptions?.direction??(trigger.current?getComputedStyle(trigger.current).direction:undefined);
  const capture=onCaptureScreenshot??browserOptions?.onCaptureScreenshot??(()=>action('view-copy-screenshot'));
  const importScope={browserId:target?.browserId,tabId:target?.id,actor:frame&&target?.id&&frame.tabId===target.id?frame.actor:undefined,controlEpoch:state?.controlEpoch};
  const canImport=target?.browserId==='desktop-browser'&&!!sessionId&&!!state&&state.enabled!==false&&!state.resuming&&!state.transitioning;
  const optionsTrigger=<CodexCuButton ref={trigger} type="button" className={'tx-cu-browser-options'+(floating?' tx-cu-browser-capsule-button':'')} unstyled={floating} color="ghostActive" size="toolbar" uniform aria-label={copy('thread.browser.options')} data-browser-sidebar-skip-address-commit="true" data-state={menu?'open':'closed'} aria-haspopup="menu" aria-expanded={menu} onClick={event=>{event.stopPropagation();if(!menu)onMenuOpen?.();setMenuIntent('pointer');setMenu(value=>!value);setOpenSubmenu(null);}}><CodexCuIcon name="shared:Iet"/></CodexCuButton>;
  return <><div ref={anchor} className="tx-cu-browser-tools" onKeyDown={menuKey}>
    <CodexBrowserOptionsMenu {...browserOptions} copy={{...browserOptions?.copy,'thread.browser.importCookiesAndPasswords':'导入浏览器数据…'}} onImportBrowserProfile={canImport?()=>{closeMenu();setImportOpen(true);}:undefined} triggerRef={trigger} triggerButton={optionsTrigger} manageTrigger={false} open={menu} openIntent={menuIntent} direction={sourceDirection} onOpenChange={next=>{if(next)onMenuOpen?.();setMenu(next);if(!next)setOpenSubmenu(null);}} openSubmenu={openSubmenu} onSubmenuOpenChange={setOpenSubmenu} pageActionsDisabled={!ready} isDeviceToolbarEnabled isDeviceToolbarVisible={devices} showNewTabsPreference={browserOptions?.showNewTabsPreference===true&&typeof browserOptions.showDeviceToolbarInNewTabs==='boolean'&&typeof browserOptions.onShowDeviceToolbarInNewTabsChange==='function'} onToggleDeviceToolbar={()=>{closeMenu();if(devices)hideDevices();else setDevices(true);}} zoomControlsAvailable={hasPageZoom} currentZoomPercent={hasPageZoom?pageZoom.zoomPercent:undefined} onZoomOut={()=>void action('view-zoom',{action:'step',delta:-1})} onZoomIn={()=>void action('view-zoom',{action:'step',delta:1})} onResetZoom={()=>void action('view-zoom',{action:'reset'})} onOpenFindInPage={()=>{menuFindFocus.current=true;closeMenu();openFind();}} isScreenshotCaptureEnabled={!!capture} onCaptureScreenshot={capture?()=>{closeMenu();capture({browserTabId:target.id,conversationId:sessionId,capture:()=>action('view-screenshot')});}:undefined} onOpenDownloads={onOpenDownloads??browserOptions?.onOpenDownloads} onOpenHistory={onOpenHistory??browserOptions?.onOpenHistory} onOpenBrowserSettings={onOpenBrowserSettings??browserOptions?.onOpenBrowserSettings} onCloseAutoFocus={event=>{if(menuFindFocus.current){menuFindFocus.current=false;event.preventDefault();requestAnimationFrame(()=>{findInput.current?.focus();findInput.current?.select();});}browserOptions?.onCloseAutoFocus?.(event);}}/>
    <CodexCuTooltip anchorRef={trigger} tooltipContent={copy('thread.browser.options')} disabled={menu} renderLayer={options=>renderCodexCuLayer({...options,manageTrigger:true})}/>
  </div>
  {renderAccessory?renderAccessory(accessories):<div ref={accessoryRoot} className="tx-cu-browser-accessory">{accessories}</div>}
  {busy&&<span className="tx-cu-visually-hidden" role="status">正在处理…</span>}
  <BrowserProfileImportDialog open={importOpen} sessionId={sessionId} scope={importScope} api={api} onClose={()=>setImportOpen(false)}/>
  </>;
});

export function BrowserSiteTools({sessionId,scope,api,visible,isBrowserUseActive,onError}){
  const[data,setData]=useState(null),[annotations,setAnnotations]=useState(null),[enabledDraft,setEnabledDraft]=useState(null),[open,setOpen]=useState(false),[expanded,setExpanded]=useState(false),[featuresExpanded,setFeaturesExpanded]=useState(false),[interaction,setInteraction]=useState({hovered:undefined,focused:null});
  const context=useRef(null),previewTail=useRef(Promise.resolve()),previewRequest=useRef(null),callbacks=useRef(null),view=useRef(null),siteRoot=useRef(null);
  callbacks.current={onError};view.current={visible,isBrowserUseActive,open,featuresExpanded,annotations,enabledDraft};
  const backend=useMemo(()=>createCodexBrowserBackend(api,sessionId,scope),[api,sessionId,scope?.browserId,scope?.tabId,scope?.actor,scope?.controlEpoch,scope?.siteUrl,scope?.loaderId]);
  const current=entry=>entry?.active&&context.current===entry;
  const preview=(entry,value)=>{
    if(!entry?.site)return Promise.resolve();
    const site=entry.site;
    const revision=++entry.previewRevision;entry.preview=value;entry.previewTouched=true;
    if(previewRequest.current?.entry===entry){
      const interrupted=previewRequest.current;interrupted.controller.abort();
      const clear=previewTail.current.catch(()=>{}).then(()=>entry.backend.previewSiteAnnotationFeatures(null,interrupted.site));
      previewTail.current=clear.catch(error=>{if(current(entry))callbacks.current.onError?.(error.message);});
    }
    const work=previewTail.current.catch(()=>{}).then(async()=>{
      if(revision!==entry.previewRevision)return;
      const actual=view.current;
      if(value!=null&&(!current(entry)||entry.site?.siteUrl!==site.siteUrl||entry.site?.documentIdentity.documentId!==site.documentIdentity.documentId||!actual.visible||actual.isBrowserUseActive||!actual.open||!actual.featuresExpanded||actual.annotations?.siteToolsAvailability?.annotations!=='available'||actual.annotations?.siteAnnotationFeaturesEnabled!==true||actual.enabledDraft===false))return;
      const controller=new AbortController();previewRequest.current={entry,controller,site};
      try{await entry.backend.previewSiteAnnotationFeatures(value,site,controller.signal);}
      catch(error){if(current(entry)&&!controller.signal.aborted)callbacks.current.onError?.(error.message);}
      finally{if(previewRequest.current?.controller===controller)previewRequest.current=null;}
    });previewTail.current=work.catch(()=>{});return work;
  };
  const acceptAnnotations=(entry,result)=>{
    if(!current(entry))return;
    if(result?.available===true&&typeof result.siteUrl==='string'&&result.documentIdentity&&Array.isArray(result.siteAnnotationFeatures)&&typeof result.siteAnnotationFeaturesEnabled==='boolean'){
      entry.site={siteUrl:result.siteUrl,documentIdentity:result.documentIdentity};setAnnotations(result);
      if(result.siteToolsAvailability?.annotations!=='available'||!result.siteAnnotationFeaturesEnabled||entry.preview&&!result.siteAnnotationFeatures.includes(entry.preview.feature==='metadata'?'metadata-with-targets':entry.preview.feature))void preview(entry,null);
    }else if(result?.available===false){setAnnotations(result);void preview(entry,null);}
    else throw new Error('网页批注功能没有返回有效状态');
  };
  const refreshTools=async(entry,action='siteTools')=>{
    if(!current(entry))return;entry.toolsRead?.abort();const controller=new AbortController();entry.toolsRead=controller;
    try{const result=await entry.backend.call(action,{},AbortSignal.any([controller.signal,entry.lifetime.signal]));if(current(entry)&&!controller.signal.aborted)setData(result);}
    catch(error){if(current(entry)&&!controller.signal.aborted){setData({available:false});if(action==='siteToolsRefresh')callbacks.current.onError?.(error.message);}}
  };
  const refreshFeatures=async entry=>{
    if(!current(entry))return;entry.featuresRead?.abort();const controller=new AbortController(),revision=++entry.featuresRevision;entry.featuresRead=controller;
    try{const result=await entry.backend.readSiteAnnotationFeatures(AbortSignal.any([controller.signal,entry.lifetime.signal]));if(current(entry)&&!controller.signal.aborted&&revision===entry.featuresRevision)acceptAnnotations(entry,result);}
    catch(error){if(current(entry)&&!controller.signal.aborted&&revision===entry.featuresRevision){setAnnotations(null);void preview(entry,null);if(view.current.open)callbacks.current.onError?.(error.message);}}
  };
  useEffect(()=>{
    const entry={backend,active:true,lifetime:new AbortController(),site:null,preview:null,previewRevision:0,previewTouched:false,featuresRevision:0,enabledRevision:0,enabledTail:Promise.resolve(),observedFeatureRevision:scope?.siteAnnotationRevision,observedLoaderId:scope?.loaderId};context.current=entry;
    setData(null);setAnnotations(null);setEnabledDraft(null);setOpen(false);setExpanded(false);setFeaturesExpanded(false);setInteraction({hovered:undefined,focused:null});
    if(visible&&scope?.actor){void refreshTools(entry);void refreshFeatures(entry);}
    return()=>{entry.active=false;entry.lifetime.abort();entry.toolsRead?.abort();entry.featuresRead?.abort();if(previewRequest.current?.entry===entry)previewRequest.current.controller.abort();if(entry.previewTouched)void preview(entry,null);if(context.current===entry)context.current=null;};
  },[backend,visible]);
  useEffect(()=>{
    const entry=context.current;if(!current(entry)||!visible||!scope?.actor||entry.observedFeatureRevision===scope?.siteAnnotationRevision&&entry.observedLoaderId===scope?.loaderId)return;
    entry.observedFeatureRevision=scope?.siteAnnotationRevision;entry.observedLoaderId=scope?.loaderId;void refreshFeatures(entry);
  },[scope?.siteAnnotationRevision,scope?.loaderId,visible,backend]);
  useEffect(()=>{
    if(!open||!featuresExpanded||!visible||isBrowserUseActive||annotations?.siteAnnotationFeaturesEnabled!==true||enabledDraft===false){setInteraction({hovered:undefined,focused:null});if(context.current?.preview!=null)void preview(context.current,null);}
  },[open,featuresExpanded,visible,isBrowserUseActive,enabledDraft,annotations?.siteAnnotationFeaturesEnabled]);
  const changeEnabled=enabled=>{
    const entry=context.current;if(!current(entry)||!entry.site||annotations?.available!==true||typeof enabled!=='boolean')return;
    setEnabledDraft(enabled);entry.featuresRevision++;entry.featuresRead?.abort();const revision=++entry.enabledRevision;const cleared=preview(entry,null);
    entry.enabledTail=entry.enabledTail.catch(()=>{}).then(async()=>{
      if(!current(entry)||revision!==entry.enabledRevision)return;
      try{await cleared;if(!current(entry)||revision!==entry.enabledRevision)return;const result=await entry.backend.setSiteAnnotationFeaturesEnabled(enabled,entry.site,entry.lifetime.signal);if(current(entry)&&revision===entry.enabledRevision){acceptAnnotations(entry,result);setEnabledDraft(null);}}
      catch(error){if(current(entry)&&revision===entry.enabledRevision){setEnabledDraft(null);callbacks.current.onError?.(error.message);await refreshFeatures(entry);}}
    });
  };
  const refresh=()=>{const entry=context.current;void refreshTools(entry,'siteToolsRefresh');void refreshFeatures(entry);};
  const close=()=>{setOpen(false);setInteraction({hovered:undefined,focused:null});if(context.current)void preview(context.current,null);};
  useEffect(()=>{
    if(!open)return;
    const dismiss=event=>{if(!siteRoot.current?.contains(event.target))close();},escape=event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();close();siteRoot.current?.querySelector('.codex-cu-site-tools-trigger')?.focus({preventScroll:true});}};
    window.addEventListener('pointerdown',dismiss,true);window.addEventListener('keydown',escape,true);
    return()=>{window.removeEventListener('pointerdown',dismiss,true);window.removeEventListener('keydown',escape,true);};
  },[open]);
  return <div ref={siteRoot} style={{display:'contents'}}><CodexSiteTools siteToolsAvailability={{annotations:annotations?.siteToolsAvailability?.annotations??'unavailable',webMcp:data?.available===true?'available':'unavailable'}} canUseWebMcp={data?.available===true} open={open} onOpenChange={value=>{if(value){setOpen(true);refresh();}else close();}} isBrowserPanelVisible={visible} isBrowserUseActive={isBrowserUseActive} inspectorData={{tools:data?.tools}} toolsExpanded={expanded} onToolsExpandedChange={setExpanded} onToolsRefreshRequested={()=>void refreshTools(context.current,'siteToolsRefresh')}
    siteAnnotationFeatures={annotations?.siteAnnotationFeatures} siteAnnotationFeaturesEnabled={enabledDraft??annotations?.siteAnnotationFeaturesEnabled} onSiteAnnotationFeaturesEnabledChange={changeEnabled} annotationFeaturesExpanded={featuresExpanded} onAnnotationFeaturesExpandedChange={value=>{setFeaturesExpanded(value);if(!value){setInteraction({hovered:undefined,focused:null});void preview(context.current,null);}}} hoveredFeature={interaction.hovered} focusedFeature={interaction.focused} onFeatureInteraction={setInteraction} onAnnotationPreviewChange={value=>void preview(context.current,value)}/></div>;
}

const siteDataTypes=['cacheStorage','fileSystems','indexedDB','localStorage','serviceWorkers'];
const siteLabels={automaticDownloads:'自动下载',camera:'摄像头',clipboard:'剪贴板',cookies:'Cookie',images:'图片',javascript:'JavaScript',location:'位置',microphone:'麦克风',notifications:'通知',popups:'弹出式窗口和重定向',sound:'声音'};
const settingLabels={allow:'允许',block:'阻止',ask:'询问',session_only:'仅当前会话'};
function siteSettingRows(settings){
  if(!Array.isArray(settings?.settings))return [];
  return settings.settings.map(item=>{
    const descriptor=settings.contentSettings?.find(value=>value.type===item.type);
    const values=item.values??descriptor?.settingValues;
    const name=descriptor?.name??item.name??item.type;
    return {...item,label:siteLabels[name]??descriptor?.label??String(name),values:Array.isArray(values)?values:[],
      editable:item.available!==false&&item.persistentReady!==false&&settings.persistentReady!==false
        &&(descriptor?.settingKind==='content-setting'||Array.isArray(item.values))&&typeof item.setting==='string'};
  });
}
export function BrowserProfileSettings({sessionId,scope,api,onClose,onOpenHistory,onOpenDownloads,onPreferencesChange}){
  const[status,setStatus]=useState(null),[settings,setSettings]=useState(null),[preferences,setPreferences]=useState(null),[dataSettings,setDataSettings]=useState(null),[summary,setSummary]=useState(null),[error,setError]=useState(''),[pending,setPending]=useState(null),[expanded,setExpanded]=useState(false),[openMenu,setOpenMenu]=useState(null),[clearOpen,setClearOpen]=useState(false),[timeRange,setTimeRange]=useState('lastHour'),[selectedTypes,setSelectedTypes]=useState(new Set()),[importOpen,setImportOpen]=useState(false);
  const lifetime=useRef(null),summaryRequest=useRef(null),alive=useRef(false),operation=useRef(null),callbacks=useRef(null);callbacks.current={onPreferencesChange};
  const backend=useMemo(()=>createCodexBrowserBackend(api,sessionId,scope),[api,sessionId,scope?.browserId,scope?.tabId,scope?.actor,scope?.controlEpoch]);
  const load=useCallback(async()=>{
    const signal=lifetime.current?.signal;
    try{
      const result=await backend.call('profileStatus',{},signal);if(signal?.aborted||!alive.current)return;setStatus(result);
      if(result.preferences?.available){const prefs=await backend.call('profilePreferences',{},signal);if(!signal?.aborted&&alive.current){setPreferences(prefs);callbacks.current.onPreferencesChange?.(prefs);}}else setPreferences(null);
      if(result.siteSettings?.available&&result.siteSettings.persistentReady!==false&&scope?.actor){const site=await backend.call('profileSiteSettings',{},signal);if(!signal?.aborted&&alive.current)setSettings(site);}else setSettings(null);
      if(result.browsingData?.available){const data=await backend.call('profileBrowsingDataSettings',{},signal);if(!signal?.aborted&&alive.current)setDataSettings(data);}else setDataSettings(null);
    }catch(error){if(alive.current&&!signal?.aborted)setError(error.message);}
  },[backend]);
  useEffect(()=>{alive.current=true;const controller=new AbortController();lifetime.current=controller;setStatus(null);setSettings(null);setPreferences(null);setDataSettings(null);setPending(null);setClearOpen(false);setImportOpen(false);setError('');void load();return()=>{alive.current=false;controller.abort();summaryRequest.current?.abort();};},[load]);
  useEffect(()=>{
    setSummary(null);if(!clearOpen||status?.browsingData?.summaryAvailable!==true)return;
    const controller=new AbortController();summaryRequest.current=controller;
    void backend.call('profileBrowsingDataSummary',{timeRange},controller.signal).then(result=>{if(alive.current&&!controller.signal.aborted)setSummary(result);}).catch(error=>{if(alive.current&&!controller.signal.aborted)setError(error.message);});
    return()=>controller.abort();
  },[backend,clearOpen,timeRange,status?.browsingData?.summaryAvailable]);
  const run=async(key,task)=>{if(operation.current)return;const signal=lifetime.current.signal;operation.current=signal;setPending(key);setError('');try{const result=await task(signal);if(alive.current&&!signal.aborted)await load();return result;}catch(error){if(alive.current&&!signal.aborted)setError(error.message);return false;}finally{if(operation.current===signal)operation.current=null;if(alive.current&&!signal.aborted)setPending(null);}};
  const grant=permission=>run(permission,signal=>{setError('请在浏览器打开的授权页完成授权');return backend.requestAccess([permission],signal);});
  const clearTypes=['cookies',...siteDataTypes,'cache','downloads','history'];
  const clearAvailable=status?.browsingData?.available===true&&clearTypes.every(type=>status.browsingData.dataTypes?.includes(type)&&dataSettings?.dataRemovalPermitted?.[type]===true);
  const dialogSettings=dataSettings?.supportedDataTypes?dataSettings:null;
  const openClear=()=>{if(!dialogSettings)return;const range=dialogSettings.supportedTimeRanges?.includes(timeRange)?timeRange:dialogSettings.supportedTimeRanges?.[0]??'allTime';setTimeRange(range);setSelectedTypes(createCodexBrowserClearDataSelection(dialogSettings));setClearOpen(true);};
  const deleteData=async input=>{const result=await run('clear:dialog',signal=>backend.call('profileClearBrowsingData',{options:input,explicitUserCommand:true},signal));if(result!==false&&alive.current)setClearOpen(false);};
  const navigate=(_path,kind)=>{if(kind==='history')onOpenHistory();else if(kind==='downloads')onOpenDownloads();};
  const canImport=scope?.browserId==='desktop-browser'&&status?.available===true;
  const setSiteSetting=(type,setting)=>run(type,async signal=>{
    const result=await backend.call('profileSetSiteSetting',{type,setting,explicitUserCommand:true},signal);
    if(settings?.source==='opencu-permission-store'&&(result?.accepted!==true||result.prefWriteCompleted!==true)
      ||result?.accepted===false||result?.prefWriteCompleted===false)throw new Error('站点权限尚未保存，请重试');
    return result;
  });
  const openSiteSettings=()=>run('siteSettings',async signal=>{
    const result=await backend.call('profileOpenSiteSettings',{explicitUserCommand:true},signal);
    if(result?.accepted!==true||result.opened!==true)throw new Error('站点设置未能打开，请重试');
    return result;
  });
  return <CodexCuSettingsPage title="浏览器设置" backSlot={<CodexCuButton size="toolbar" color="ghost" onClick={onClose}><CodexCuIcon name="shared:uht"/>浏览器</CodexCuButton>}>
    {preferences?.available&&<CodexBrowserSettings importVisible={canImport} onImport={()=>setImportOpen(true)} values={preferences.values} supportedPreferences={preferences.supportedPreferences} supportedNavigationKinds={['history','downloads']} visibility={{general:true,history:status?.history?.available===true,downloads:status?.downloads?.available===true,downloadsService:true}} disabled={!!pending} openMenu={openMenu} onOpenMenuChange={setOpenMenu} onPreferenceChange={(key,value)=>void run('preference:'+key,signal=>backend.call('profileSetPreference',{key,value,explicitUserCommand:true},signal))} onChooseDownloadDirectory={preferences.capabilities?.chooseDownloadDirectory?()=>void run('chooseDirectory',signal=>backend.call('profileChooseDownloadDirectory',{explicitUserCommand:true},signal)):undefined} onResetDownloadDirectory={preferences.capabilities?.resetDownloadDirectory?()=>void run('resetDirectory',signal=>backend.call('profileResetDownloadDirectory',{explicitUserCommand:true},signal)):undefined} downloadDirectoryChanging={pending==='chooseDirectory'} onNavigate={navigate} browsingData={dialogSettings?{mode:'dialog',opening:pending==='clear:dialog',onOpenDialog:openClear}:undefined} locale="zh-CN"/>}
    <CodexCuSettingsSection><CodexCuSettingsGroup>
      {!preferences?.available&&<><CodexCuSettingsRow label="浏览历史" control={<CodexCuButton size="toolbar" color="secondary" onClick={onOpenHistory}>管理</CodexCuButton>}/><CodexCuSettingsRow label="下载记录" control={<CodexCuButton size="toolbar" color="secondary" onClick={onOpenDownloads}>管理</CodexCuButton>}/></>}
      {!preferences?.available&&canImport&&<CodexCuSettingsRow label="导入浏览器数据" control={<CodexCuButton size="toolbar" color="secondary" disabled={!!pending} onClick={()=>setImportOpen(true)}>导入…</CodexCuButton>}/>}
      {status?.siteSettings?.settingsPage===true&&<CodexBrowserSiteSettingsRow onNavigate={()=>void openSiteSettings()} locale="zh-CN"/>}
      {!status?.siteSettings?.available&&codexCanRequestProfileAccess(status,'contentSettings')&&<CodexCuSettingsRow label="站点权限" control={<CodexCuButton size="toolbar" color="secondary" loading={pending==='contentSettings'} disabled={!!pending} onClick={()=>void grant('contentSettings')}>授权访问</CodexCuButton>}/>}
      {siteSettingRows(settings).map(item=><CodexCuSettingsRow key={item.type} label={item.label} control={<CodexBrowserPreferenceMenu value={item.setting} label={item.label} options={item.values.map(id=>({id,label:settingLabels[id]??id}))} open={openMenu===item.type} disabled={!item.editable||!item.values.length||!!pending} onOpenChange={value=>setOpenMenu(value?item.type:null)} onChange={setting=>void setSiteSetting(item.type,setting)}/>}/>)}
      {!status?.browsingData?.available&&codexCanRequestProfileAccess(status,'browsingData')&&<CodexCuSettingsRow label="浏览数据" control={<CodexCuButton size="toolbar" color="secondary" loading={pending==='browsingData'} disabled={!!pending} onClick={()=>void grant('browsingData')}>授权访问</CodexCuButton>}/>}
      {!status?.permissions?.['downloads.open']&&codexCanRequestProfileAccess(status,'downloads.open')&&<CodexCuSettingsRow label="打开下载文件" control={<CodexCuButton size="toolbar" color="secondary" loading={pending==='downloads.open'} disabled={!!pending} onClick={()=>void grant('downloads.open')}>授权访问</CodexCuButton>}/>}
      {!preferences?.available&&dialogSettings&&<CodexBrowserBrowsingDataRow mode="dialog" onOpenDialog={openClear} locale="zh-CN"/>}
      {status?.browsingData?.available&&!dialogSettings&&<CodexBrowserBrowsingDataRow mode="individual" includeHistory expanded={expanded} onExpandedChange={setExpanded} pendingType={pending?.startsWith('clear:')?pending.slice(6):null} onClear={clearAvailable?(type,types)=>void run('clear:'+type,signal=>backend.call('profileClearBrowsingData',{dataTypes:[...new Set(types.flatMap(value=>value==='siteData'?siteDataTypes:[value]))],since:0,explicitUserCommand:true},signal)):undefined} locale="zh-CN"/>}
    </CodexCuSettingsGroup></CodexCuSettingsSection>
    {!status&&<span role="status">正在读取浏览器设置…</span>}
    {status?.available===false&&<span role="status">当前浏览器未提供档案设置</span>}
    {error&&<span className="tx-cu-error" role="alert">{error}</span>}
    <CodexBrowserClearDataDialog open={clearOpen} browsingDataSettings={dialogSettings} summary={summary} timeRange={timeRange} selectedTypes={selectedTypes} clearing={pending==='clear:dialog'} onTimeRangeChange={setTimeRange} onTypeChange={(type,checked)=>setSelectedTypes(previous=>{const next=new Set(previous);if(checked)next.add(type);else next.delete(type);return next;})} onClose={()=>setClearOpen(false)} onDelete={input=>void deleteData(input)} locale="zh-CN"/>
    <BrowserProfileImportDialog open={importOpen} sessionId={sessionId} scope={scope} api={api} onClose={()=>setImportOpen(false)} onImported={()=>load()}/>
  </CodexCuSettingsPage>;
}
