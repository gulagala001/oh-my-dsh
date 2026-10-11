import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createCodexBrowserBackend} from './codex-browser-backend.mjs';
import {CodexCuButton,CodexCuSpinner} from './codex-cu-primitives.jsx';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {CodexCuDialog,CodexCuDialogBody,CodexCuDialogTitle,CodexCuDialogDescription,CodexCuDialogSection,CodexCuDialogHeader,CodexCuDialogFooter} from './codex-cu-dialog.jsx';
import {CodexCuSettingsGroup,CodexCuSettingsRow,CodexCuSettingsCheckbox} from './codex-cu-settings-primitives.jsx';
import {CodexBrowserImportCategoryIcon,CodexBrowserImportProfilePicker} from './codex-browser-import.jsx';
import {BrowserPasswordFileImportDialog} from './browser-password-file-import.jsx';
import './codex-browser-import.css';

const historySupported=value=>value?.supportedDataTypes?.history===true&&value?.available!==false&&value?.persistentReady!==false;
const sourceLabels={'chromium-history-sqlite':'Chromium 浏览历史','opencu-history-query-json':'OpenCU 浏览历史'};

function ImportModeTabs({mode,onChange,disabled}){
  return <div role="tablist" aria-label="导入来源" style={{display:'flex',gap:4,flexWrap:'wrap',paddingRight:28,marginBottom:12}}>
    <CodexCuButton role="tab" aria-selected={mode==='plugin-managed'} color={mode==='plugin-managed'?'secondary':'ghost'} size="toolbar" disabled={disabled} onClick={()=>onChange('plugin-managed')}>浏览器档案</CodexCuButton>
    <CodexCuButton role="tab" aria-selected={mode==='history'} color={mode==='history'?'secondary':'ghost'} size="toolbar" disabled={disabled} onClick={()=>onChange('history')}>历史文件</CodexCuButton>
    <CodexCuButton role="tab" aria-selected={mode==='password-file'} color={mode==='password-file'?'secondary':'ghost'} size="toolbar" disabled={disabled} onClick={()=>onChange('password-file')}>密码文件</CodexCuButton>
  </div>;
}

export function BrowserProfileImportDialog(props){
  const[mode,setMode]=useState('plugin-managed');
  useEffect(()=>{if(props.open)setMode('plugin-managed');},[props.open]);
  if(mode==='password-file')return <BrowserPasswordFileImportDialog {...props} onModeChange={setMode} renderModeTabs={({onChange,disabled})=><ImportModeTabs mode="password-file" onChange={onChange} disabled={disabled}/>}/>;
  return mode==='history'?<HistoryFileImportDialog {...props} onModeChange={setMode}/>:<NativeProfileImportDialog {...props} onModeChange={setMode}/>;
}

function HistoryFileImportDialog({open,sessionId,scope,api,onClose,onImported,onModeChange}){
  const [signals,setSignals]=useState(null),[selection,setSelection]=useState(null),[result,setResult]=useState(null),[history,setHistory]=useState(true),[pending,setPending]=useState(null),[error,setError]=useState('');
  const backend=useMemo(()=>createCodexBrowserBackend(api,sessionId,scope),[api,sessionId,scope?.browserId,scope?.tabId,scope?.actor,scope?.controlEpoch]);
  const request=useRef(null),generation=useRef(0),selected=useRef(null),callbacks=useRef(null),closeRequested=useRef(false);
  callbacks.current={onClose,onImported};selected.current=selection;
  const acceptRevocation=value=>{
    if(value?.status==='selection-canceled'&&value.transactionStarted===false)return true;
    const actual=value?.status==='import-terminal'?value.importResult:null;
    if(!actual||!['imported','completed','partial-success','failed','canceled'].includes(actual.status)||
      !['importedVisits','duplicateVisits','skippedVisits'].every(key=>Number.isSafeInteger(actual[key])&&actual[key]>=0))
      throw new Error('浏览器没有确认历史事务的最终结果');
    setResult(actual);
    if(actual.importedVisits>0&&(actual.committed===true||actual.committed===undefined&&actual.status==='imported'))
      void Promise.resolve(callbacks.current.onImported?.(actual)).catch(()=>{});
    return true;
  };
  const call=async(action,input={})=>{
    if(request.current)return null;
    const controller=new AbortController(),version=generation.current;
    request.current=controller;setPending(action);setError('');
    try{
      const value=await backend.call(action,input,controller.signal);
      return version===generation.current&&!controller.signal.aborted?value:null;
    }catch(cause){if(version===generation.current&&!controller.signal.aborted)setError(cause.message);return null;}
    finally{
      if(request.current===controller)request.current=null;
      if(version===generation.current){
        setPending(null);
        if(closeRequested.current){
          closeRequested.current=false;const source=selected.current;
          try{
            setPending('profileImportCancelSelection');
            if(source){const value=await backend.call('profileImportCancelSelection',{selectionId:source.id,explicitUserCommand:true});if(version===generation.current)acceptRevocation(value);}
            if(version===generation.current){selected.current=null;setSelection(null);callbacks.current.onClose?.();}
          }catch(cause){if(version===generation.current)setError(cause.message);}
          finally{if(version===generation.current)setPending(null);}
        }
      }
    }
  };
  useEffect(()=>{
    if(!open)return;
    const version=++generation.current;closeRequested.current=false;setSignals(null);setSelection(null);selected.current=null;setResult(null);setHistory(true);setPending(null);setError('');
    void call('profileImportSignals').then(value=>{
      if(version!==generation.current||!value)return;
      setSignals(value);if(!historySupported(value))setHistory(false);
    });
    return()=>{
      generation.current++;request.current?.abort();request.current=null;
      const source=selected.current;selected.current=null;
      if(source)void backend.call('profileImportCancelSelection',{selectionId:source.id,explicitUserCommand:true}).then(value=>{
        const actual=value?.status==='import-terminal'?value.importResult:null;
        if(actual?.importedVisits>0&&(actual.committed===true||actual.committed===undefined&&actual.status==='imported'))return callbacks.current.onImported?.(actual);
      }).catch(()=>{});
    };
  },[open,backend]);
  const releaseSelection=async()=>{
    const source=selected.current;if(!source)return true;
    const value=await call('profileImportCancelSelection',{selectionId:source.id,explicitUserCommand:true});
    if(value==null)return false;
    try{acceptRevocation(value);}catch(cause){setError(cause.message);return false;}
    selected.current=null;setSelection(null);return true;
  };
  const choose=async kind=>{
    if(pending||scope?.readOnly===true)return;
    if(!await releaseSelection())return;
    setResult(null);
    const value=await call('profileImportChooseSource',{kind,explicitUserCommand:true});
    if(!value||value.canceled)return;
    const source=value.selection;
    if(!source||typeof source.id!=='string'||!historySupported(source)){setError('所选来源没有提供可导入的浏览历史');return;}
    selected.current=source;setSelection(source);
    const inventory=await call('profileImportList',{selectionId:source.id});
    if(!inventory)return;
    const actual=inventory.profiles?.find(profile=>profile.id===source.id);
    if(!actual||!historySupported(actual)){setError('已选择的历史来源已经失效');await releaseSelection();return;}
    selected.current=actual;setSelection(actual);
  };
  const importHistory=async()=>{
    if(pending||scope?.readOnly===true||!selection||!history||!historySupported(signals)||!historySupported(selection))return;
    const version=generation.current;
    const value=await call('profileImport',{selectionId:selection.id,importHistory:true,explicitUserCommand:true});
    if(!value||version!==generation.current)return;
    if(!['imported','completed','partial-success','failed','canceled'].includes(value.status)||!['importedVisits','duplicateVisits','skippedVisits'].every(key=>Number.isSafeInteger(value[key])&&value[key]>=0)){setError(value.message??'浏览器没有确认历史数据导入结果');return;}
    selected.current=null;setSelection(null);setResult(value);
    if(value.importedVisits>0&&(value.committed===true||value.committed===undefined&&value.status==='imported'))
      void Promise.resolve(callbacks.current.onImported?.(value)).catch(()=>{});
  };
  const close=async()=>{
    if(pending==='profileImportCancelSelection')return;
    if(request.current){closeRequested.current=true;request.current.abort();return;}
    if(await releaseSelection())callbacks.current.onClose?.();
  };
  const importing=pending==='profileImport',choosing=pending==='profileImportChooseSource',supported=historySupported(signals);
  const success=['imported','completed'].includes(result?.status)&&result?.committed!==false&&!result?.error&&!(result?.failed>0),visitCount=selection?.dryMetadata?.visitCount;
  const title=result?(success?'导入完成':result.status==='canceled'?'导入已停止':result.status==='partial-success'?'部分导入':'导入失败'):importing?'正在导入浏览历史':'导入浏览历史';
  return <CodexCuDialog open={open} onOpenChange={next=>{if(!next)void close();}} showDialogClose={!pending} dialogCloseLabel="关闭导入" shouldIgnoreClickOutside={!!pending}>
    <CodexCuDialogBody as="form" onSubmit={event=>{event.preventDefault();void importHistory();}}>
      <CodexCuDialogSection>
        <ImportModeTabs mode="history" onChange={mode=>{void releaseSelection().then(released=>{if(released)onModeChange(mode);});}} disabled={!!pending}/>
        <CodexCuDialogTitle className="codex-browser-import-sr-only">{title}</CodexCuDialogTitle>
        <CodexCuDialogHeader title={title} subtitle={<CodexCuDialogDescription>{result?(result.committed===false?'本次历史事务未提交。':result.importedVisits>0?'已提交的历史记录保留在当前内置浏览器。':success?'本次没有新增历史记录。':'浏览器未确认新的历史写入。'):'选择历史文件或浏览器档案目录。'}</CodexCuDialogDescription>}/>
      </CodexCuDialogSection>
      <CodexCuDialogSection className="codex-browser-import-selection">
        {pending==='profileImportSignals'&&<span role="status"><CodexCuSpinner/>正在读取导入能力…</span>}
        {signals&&!supported&&<p role="status">当前浏览器未提供历史导入能力</p>}
        {supported&&!result&&<CodexCuSettingsGroup>
          <CodexCuSettingsRow label="导入来源" control={<div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
            <CodexCuButton color="secondary" size="toolbar" disabled={!!pending||scope?.readOnly===true} loading={choosing} onClick={()=>void choose('file')}>选择文件</CodexCuButton>
            <CodexCuButton color="secondary" size="toolbar" disabled={!!pending||scope?.readOnly===true} onClick={()=>void choose('directory')}>选择目录</CodexCuButton>
          </div>}/>
          {selection&&<CodexCuSettingsRow label={selection.displayName??sourceLabels[selection.source]??'已选择的历史来源'} description={<span style={{overflowWrap:'anywhere'}}>{selection.selectedPath}</span>} control={typeof visitCount==='number'?<span>{visitCount.toLocaleString()} 条记录</span>:undefined}/>}
          {selection&&<CodexCuSettingsRow label="浏览历史" icon={<CodexBrowserImportCategoryIcon kind="history"/>} control={props=><CodexCuSettingsCheckbox {...props} checked={history} disabled={!!pending||scope?.readOnly===true||!historySupported(selection)} onCheckedChange={setHistory}/>}/>}
        </CodexCuSettingsGroup>}
        {importing&&<div role="status" className="codex-browser-import-result-status"><CodexCuSpinner/>正在导入浏览历史…</div>}
        {result&&<CodexCuSettingsGroup>
          <CodexCuSettingsRow label="已导入的浏览记录" icon={<CodexBrowserImportCategoryIcon kind="history"/>} control={<span>{result.importedVisits.toLocaleString()}</span>}/>
          <CodexCuSettingsRow label="已有的重复记录" control={<span>{result.duplicateVisits.toLocaleString()}</span>}/>
          <CodexCuSettingsRow label="跳过的记录" control={<span>{result.skippedVisits.toLocaleString()}</span>}/>
          {Number.isSafeInteger(result.remaining)&&result.remaining>=0&&<CodexCuSettingsRow label="剩余未处理" control={<span>{result.remaining.toLocaleString()}</span>}/>}
        </CodexCuSettingsGroup>}
        {errorText(result?.error)&&<p className="codex-browser-import-profile-error" role="alert">{errorText(result.error)}</p>}
        {error&&<p className="codex-browser-import-profile-error" role="alert">{error}</p>}
      </CodexCuDialogSection>
      <CodexCuDialogSection><CodexCuDialogFooter className="codex-browser-import-footer">
        <CodexCuButton color="secondary" onClick={()=>void close()} disabled={pending==='profileImportCancelSelection'}>{pending==='profileImportCancelSelection'?'正在取消…':success?'关闭':'取消'}</CodexCuButton>
        {result&&!success&&<CodexCuButton color="secondary" disabled={!!pending} onClick={()=>setResult(null)}>重新选择</CodexCuButton>}
        {!result&&<CodexCuButton color="primary" type="submit" loading={importing} disabled={!!pending||scope?.readOnly===true||!supported||!selection||!history||!historySupported(selection)}>导入</CodexCuButton>}
      </CodexCuDialogFooter></CodexCuDialogSection>
    </CodexCuDialogBody>
  </CodexCuDialog>;
}

const categoryLabels={cookies:'Cookie',passwords:'已保存的密码',history:'浏览历史'};
const resultLabels={success:'完成','partial-success':'部分完成',failed:'失败',missing:'来源缺少此项',canceled:'已取消','not-requested':'未请求',completed:'已完成'};
const countLabels={discovered:'发现',canonicalized:'可处理',imported:'已导入',skippedExisting:'跳过（已存在）',skippedInvalid:'跳过（无效）',failed:'失败',remaining:'剩余未处理'};
const errorText=value=>typeof value==='string'?value:typeof value?.message==='string'?value.message:undefined;
const sourceErrorCode=value=>typeof value?.code==='string'?value.code:typeof value==='string'?value:typeof value?.message==='string'?value.message:'';
const sourceCanceledCodes=new Set(['SOURCE_KEYCHAIN_USER_CANCELED','SOURCE_ELEVATED_USER_CANCELED','SOURCE_IMPORT_CANCELED']);
const sourceDeniedCodes=new Set(['SOURCE_KEYCHAIN_ACCESS_DENIED','SOURCE_ELEVATED_AUTHORIZATION_DENIED_OR_REVOKED','SOURCE_AUTHORIZATION_REVOKED','SOURCE_APP_BOUND_EXPLICIT_GRANT_REQUIRED_OR_REVOKED','SOURCE_ELEVATED_EXPLICIT_GRANT_REQUIRED']);
const sourceProtectedCodes=new Set(['SOURCE_ATLAS_PROTECTED_KEYCHAIN_ENTITLEMENT_REQUIRED','SOURCE_APP_BOUND_SERVICE_IDENTITY_UNSUPPORTED','SOURCE_APP_BOUND_ORIGINAL_BROWSER_IDENTITY_REQUIRED','SOURCE_DPAPI_USER_OR_MACHINE_IDENTITY_REQUIRED']);
const protectedSourceError=value=>sourceProtectedCodes.has(sourceErrorCode(value));
function nativeImportError(value){
  const code=sourceErrorCode(value);
  if(sourceCanceledCodes.has(code))return '系统授权已取消，此项未完成导入。';
  if(sourceDeniedCodes.has(code))return '系统授权被拒绝或已撤销，此项未完成导入。';
  if(sourceProtectedCodes.has(code))return '来源浏览器的身份保护阻止访问此项，系统授权无法代替来源应用身份。';
  if(code.startsWith('SOURCE_APP_BOUND_SERVICE_DECRYPT_FAILED_HRESULT_'))return '来源浏览器的受保护解密服务拒绝了请求，此项未完成导入。';
  if(['SOURCE_PROFILE_NOT_CLOSED','SOURCE_DATABASE_LOCKED'].includes(code))return '请完全退出来源浏览器后重试。';
  if(code==='SOURCE_READ_DENIED')return '无法读取来源档案，请检查系统访问授权。';
  return errorText(value);
}
const protectedPasswordFailure=result=>[result?.passwords?.profile,result?.passwords?.account].some(value=>protectedSourceError(value?.error)||sourceErrorCode(value?.error).startsWith('SOURCE_APP_BOUND_SERVICE_DECRYPT_FAILED_HRESULT_'));
const nativeCookieIncomplete=value=>value&&value.status!=='not-requested'&&(value.error!=null||value.failed>0||value.remaining>0||['failed','missing','partial-success','canceled'].includes(value.status));
const nativeReady=value=>value?.available===true&&value?.persistentReady===true;
const confirmedCancellation=value=>value?.status==='canceled'&&value.canceled===true||value?.canceled===false&&['completed','partial-success','failed'].includes(value.status);
const nativeHasWrites=value=>[value?.cookies,value?.passwords?.profile,value?.passwords?.account,value?.history].some(category=>
  Number.isSafeInteger(category?.imported)&&category.imported>0&&(category!==value?.history||category.committed===true));

function NativeCategoryResult({label,kind,value}){
  if(value==null)return null;
  const counts=Object.entries(countLabels).filter(([key])=>Number.isSafeInteger(value[key])&&value[key]>=0);
  const message=nativeImportError(value.error);
  return <CodexCuSettingsRow label={label} icon={<CodexBrowserImportCategoryIcon kind={kind}/>} layout="split" controlSizing="grow"
    description={<>{value.status&&<span>{resultLabels[value.status]??value.status}</span>}{typeof value.committed==='boolean'&&<span> · {value.committed?'历史写入已提交':'历史写入未提交'}</span>}{message&&<span role="alert" className="codex-browser-import-danger"> · {message}</span>}</>}
    control={<span style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end',fontVariantNumeric:'tabular-nums'}}>{counts.map(([key,label])=><span key={key}>{label} {value[key].toLocaleString()}</span>)}</span>}/>;
}

function NativeProfileImportDialog({open,sessionId,scope,api,onClose,onImported,onModeChange}){
  const [signals,setSignals]=useState(null),[inventory,setInventory]=useState(null),[profile,setProfile]=useState(null),[pickerOpen,setPickerOpen]=useState(false),[categories,setCategories]=useState({cookies:false,passwords:false,history:false}),[elevated,setElevated]=useState(false),[result,setResult]=useState(null),[pending,setPending]=useState(null),[error,setError]=useState('');
  const backend=useMemo(()=>createCodexBrowserBackend(api,sessionId,scope),[api,sessionId,scope?.browserId,scope?.tabId,scope?.actor,scope?.controlEpoch]);
  const request=useRef(null),generation=useRef(0),grant=useRef(null),closeRequested=useRef(false),callbacks=useRef(null),cancelTask=useRef(null);
  callbacks.current={onClose,onImported};
  const acceptCancellation=(value,duringRequest)=>{
    if(!confirmedCancellation(value))throw new Error('浏览器没有确认取消结果');
    grant.current=null;
    if(duringRequest){
      const actual=value.result??value;setResult(actual);
      if(nativeHasWrites(actual))void Promise.resolve(callbacks.current.onImported?.(actual)).catch(()=>{});
    }
    callbacks.current.onClose?.();
  };
  const cancelIssuedGrant=()=>{
    if(!grant.current)return Promise.resolve(null);
    cancelTask.current??=backend.call('profileNativeImportCancel',{selectionId:grant.current,explicitUserCommand:true});
    return cancelTask.current;
  };
  const call=async(action,input={})=>{
    if(request.current)return null;
    const controller=new AbortController(),version=generation.current;request.current=controller;setPending(action);setError('');
    try{
      const value=await backend.call(action,input,['profileNativeImportSignals','profileNativeImportList'].includes(action)?controller.signal:undefined);
      if(action==='profileNativeImportChooseSource'&&typeof value?.selectionId==='string'&&value.selectionId){
        if(version!==generation.current||controller.signal.aborted){
          const canceled=await backend.call('profileNativeImportCancel',{selectionId:value.selectionId,explicitUserCommand:true});
          if(confirmedCancellation(canceled)&&nativeHasWrites(canceled.result??canceled))void Promise.resolve(callbacks.current.onImported?.(canceled.result??canceled)).catch(()=>{});
          return null;
        }
        grant.current=value.selectionId;
      }
      if(closeRequested.current)return null;
      return version===generation.current&&!controller.signal.aborted?value:null;
    }catch(cause){if(version===generation.current&&!controller.signal.aborted)setError(nativeImportError(cause)??'浏览器档案导入未完成');return null;}
    finally{
      if(request.current===controller)request.current=null;
      if(version===generation.current){
        setPending(null);
        if(closeRequested.current){
          closeRequested.current=false;
          try{
            setPending('profileNativeImportCancel');
            if(grant.current){const value=await cancelIssuedGrant();if(version===generation.current)acceptCancellation(value,true);}
            else callbacks.current.onClose?.();
          }catch(cause){if(version===generation.current)setError(cause.message);}
          finally{cancelTask.current=null;if(version===generation.current)setPending(null);}
        }
      }
    }
  };
  useEffect(()=>{
    if(!open)return;
    const version=++generation.current;closeRequested.current=false;grant.current=null;cancelTask.current=null;setSignals(null);setInventory(null);setProfile(null);setCategories({cookies:false,passwords:false,history:false});setElevated(false);setResult(null);setPending(null);setError('');
    void call('profileNativeImportSignals').then(async value=>{
      if(version!==generation.current||!value)return;
      setSignals(value);if(!nativeReady(value))return;
      const listed=await call('profileNativeImportList');
      if(version!==generation.current||!listed)return;
      if(!Array.isArray(listed.profiles)){setError('浏览器没有返回真实档案清单');return;}
      setInventory(listed);setProfile(listed.profiles[0]??null);
    });
    return()=>{
      generation.current++;request.current?.abort();request.current=null;
      const selectionId=grant.current;grant.current=null;
      if(selectionId)void (cancelTask.current??backend.call('profileNativeImportCancel',{selectionId,explicitUserCommand:true})).then(value=>{
        if(confirmedCancellation(value)&&nativeHasWrites(value.result??value))return callbacks.current.onImported?.(value.result??value);
      }).catch(()=>{});
    };
  },[open,backend]);
  const supported=kind=>signals?.supportedDataTypes?.[kind]===true&&inventory?.supportedDataTypes?.[kind]===true;
  const present=kind=>profile?.['has'+kind[0].toUpperCase()+kind.slice(1)]===true;
  const requested=Object.keys(categoryLabels).filter(kind=>categories[kind]&&supported(kind)&&present(kind));
  const chromeDecryption=signals?.elevatedChromeDecryption;
  const chromeSource=profile?.source==='chrome';
  const macSourceCopy=chromeSource&&chromeDecryption?.platform==='darwin'&&requested.length>0;
  const windowsChrome=chromeSource&&chromeDecryption?.platform==='win32'&&(requested.includes('cookies')||requested.includes('passwords'));
  const authorizationApplicable=chromeDecryption?.explicitConsentRequired===true&&(macSourceCopy||windowsChrome);
  const allowSystemAuthorization=authorizationApplicable&&chromeDecryption.available===true&&elevated===true;
  const permitted=scope?.readOnly!==true&&nativeReady(signals)&&profile&&requested.length>0;
  const importing=pending==='profileNativeImportChooseSource'||pending==='profileNativeImport';
  const release=async()=>{
    if(!grant.current)return true;
    const value=await call('profileNativeImportCancel',{selectionId:grant.current,explicitUserCommand:true});
    if(!value)return false;
    if(!confirmedCancellation(value)){setError('浏览器没有确认取消结果');return false;}
    grant.current=null;
    if(nativeHasWrites(value.result??value))void Promise.resolve(callbacks.current.onImported?.(value.result??value)).catch(()=>{});
    return true;
  };
  const start=async()=>{
    if(pending||!permitted)return;
    if(!await release())return;
    setResult(null);const version=generation.current;
    const selected=await call('profileNativeImportChooseSource',{sourceId:profile.id,importCookies:requested.includes('cookies'),importPasswords:requested.includes('passwords'),importHistory:requested.includes('history'),allowElevatedChromeDecryption:allowSystemAuthorization,explicitUserCommand:true});
    if(!selected||version!==generation.current)return;
    if(typeof selected.selectionId!=='string'||!selected.selectionId||requested.some(kind=>selected.supportedDataTypes?.[kind]!==true)){setError('浏览器没有授权所选的导入内容');await release();return;}
    grant.current=selected.selectionId;
    const value=await call('profileNativeImport',{selectionId:selected.selectionId,explicitUserCommand:true});
    if(!value||version!==generation.current)return;
    if(!['completed','partial-success','failed','canceled'].includes(value.status)){setError('浏览器没有返回实际导入结果');return;}
    grant.current=null;setResult(value);
    if(nativeHasWrites(value))void Promise.resolve(callbacks.current.onImported?.(value)).catch(()=>{});
  };
  const close=async()=>{
    if(pending==='profileNativeImportCancel')return;
    if(request.current){closeRequested.current=true;setPending('profileNativeImportCancel');void cancelIssuedGrant().catch(()=>{});return;}
    if(grant.current){const value=await call('profileNativeImportCancel',{selectionId:grant.current,explicitUserCommand:true});if(value)try{acceptCancellation(value,false);}catch(cause){setError(cause.message);}}
    else callbacks.current.onClose?.();
  };
  const changeMode=async mode=>{if(pending)return;if(await release())onModeChange(mode);};
  const changeProfile=async value=>{
    if(pending||!await release())return;
    setProfile(value);setCategories({cookies:false,passwords:false,history:false});setElevated(false);setPickerOpen(false);setError('');
  };
  const resultErrors=[result?.error,result?.cookies?.error,result?.passwords?.profile?.error,result?.passwords?.account?.error,result?.history?.error];
  const canceledAuthorization=resultErrors.some(value=>sourceCanceledCodes.has(sourceErrorCode(value)));
  const deniedAuthorization=resultErrors.some(value=>sourceDeniedCodes.has(sourceErrorCode(value)));
  const resultTitle=result?.status==='partial-success'?'部分导入':result?.status==='canceled'?'导入已停止':result?.status==='completed'?'导入完成':canceledAuthorization?'系统授权已取消':deniedAuthorization?'系统授权被拒绝':resultErrors.some(protectedSourceError)?'受保护数据无法导入':'导入失败';
  const title=result?resultTitle:importing?'正在导入浏览器档案':'导入浏览器档案';
  return <CodexCuDialog open={open} onOpenChange={next=>{if(!next)void close();}} showDialogClose={!pending} dialogCloseLabel="关闭导入" shouldIgnoreClickOutside={!!pending}>
    <CodexCuDialogBody as="form" onSubmit={event=>{event.preventDefault();void start();}}>
      <CodexCuDialogSection><ImportModeTabs mode="plugin-managed" onChange={mode=>{void changeMode(mode);}} disabled={!!pending}/><CodexCuDialogTitle className="codex-browser-import-sr-only">{title}</CodexCuDialogTitle>
        <CodexCuDialogHeader title={title} subtitle={<CodexCuDialogDescription>{result?(nativeHasWrites(result)?'已经写入的数据保留，未完成项目见下方。':canceledAuthorization?'系统授权已取消，尚未确认写入数据。':deniedAuthorization?'系统授权被拒绝或已撤销，尚未确认写入数据。':resultLabels[result.status]??result.status):'选择来源档案和本次要导入的数据。Cookie 和已登录状态可能无法完整迁移。'}</CodexCuDialogDescription>}/></CodexCuDialogSection>
      <CodexCuDialogSection className="codex-browser-import-selection">
        {['profileNativeImportSignals','profileNativeImportList'].includes(pending)&&<span role="status"><CodexCuSpinner/>正在读取档案导入能力…</span>}
        {signals&&!nativeReady(signals)&&<p role="status">{nativeImportError(signals.error)??'浏览器档案导入尚未就绪'}</p>}
        {nativeReady(signals)&&inventory&&!result&&<>
          <CodexBrowserImportProfilePicker profiles={inventory.profiles} selectedProfile={profile} open={pickerOpen} disabled={!!pending||scope?.readOnly===true} onOpenChange={setPickerOpen}
            onSelectProfile={value=>{void changeProfile(value);}}/>
          {inventory.profiles.length===0&&<p role="status">没有可导入的浏览器档案</p>}
          {profile&&<CodexCuSettingsGroup>{Object.keys(categoryLabels).filter(supported).map(kind=><CodexCuSettingsRow key={kind} label={categoryLabels[kind]} icon={<CodexBrowserImportCategoryIcon kind={kind}/>} description={present(kind)?undefined:'此档案没有可导入的数据'}
            control={props=><CodexCuSettingsCheckbox {...props} checked={categories[kind]===true} disabled={!!pending||scope?.readOnly===true||!present(kind)} onCheckedChange={checked=>{setCategories(previous=>({...previous,[kind]:checked}));setElevated(false);}}/>}/>)}</CodexCuSettingsGroup>}
          {authorizationApplicable&&<CodexCuSettingsRow label={macSourceCopy?'允许管理员只读复制 Chrome 源数据':'允许请求原 Chrome 的受保护解密服务'} description={chromeDecryption.available!==true?'当前浏览器未提供此系统授权能力':macSourceCopy?'仅在文件读取被拒绝时请求管理员授权，只读复制所选档案数据库。':chromeDecryption.requiresOriginalBrowserIdentity===true?'仅请求所选 Cookie 或密码的解密。服务仍会校验原浏览器身份，授权不代表身份校验通过。':'仅对本次选中的 Cookie 或密码请求系统解密授权。'}
            control={props=><CodexCuSettingsCheckbox {...props} checked={elevated} disabled={!!pending||scope?.readOnly===true||chromeDecryption.available!==true} onCheckedChange={setElevated}/>}/>}
        </>}
        {importing&&<span role="status"><CodexCuSpinner/>正在处理已选择的导入内容…</span>}
        {result&&<CodexCuSettingsGroup>
          <NativeCategoryResult label="Cookie" kind="cookies" value={result.cookies}/>
          <NativeCategoryResult label="档案中保存的密码" kind="passwords" value={result.passwords?.profile}/>
          <NativeCategoryResult label="账户中保存的密码" kind="passwords" value={result.passwords?.account}/>
          <NativeCategoryResult label="浏览历史" kind="history" value={result.history}/>
        </CodexCuSettingsGroup>}
        {nativeCookieIncomplete(result?.cookies)&&<p className="codex-browser-import-guidance" role="status">Cookie 未完整迁移，相关网站需要重新登录。</p>}
        {protectedPasswordFailure(result)&&<CodexCuSettingsRow label="受保护密码未完成导入" description="可选择浏览器导出的 CSV 密码文件。" control={<CodexCuButton color="secondary" size="toolbar" disabled={!!pending||scope?.readOnly===true} onClick={()=>void changeMode('password-file')}>选择密码文件</CodexCuButton>}/>}
        {nativeImportError(result?.error)&&<p className="codex-browser-import-profile-error" role="alert">{nativeImportError(result.error)}</p>}
        {error&&<p className="codex-browser-import-profile-error" role="alert">{error}</p>}
      </CodexCuDialogSection>
      <CodexCuDialogSection><CodexCuDialogFooter className="codex-browser-import-footer">
        <CodexCuButton color="secondary" onClick={()=>void close()} disabled={pending==='profileNativeImportCancel'}>{pending==='profileNativeImportCancel'?'正在取消…':result?'关闭':'取消'}</CodexCuButton>
        {result&&['partial-success','failed','canceled'].includes(result.status)&&<CodexCuButton color="secondary" disabled={!!pending} onClick={()=>{setResult(null);setCategories({cookies:false,passwords:false,history:false});setElevated(false);}}>重新选择</CodexCuButton>}
        {!result&&<CodexCuButton color="primary" type="submit" loading={importing} disabled={!!pending||!permitted}>导入</CodexCuButton>}
      </CodexCuDialogFooter></CodexCuDialogSection>
    </CodexCuDialogBody>
  </CodexCuDialog>;
}
