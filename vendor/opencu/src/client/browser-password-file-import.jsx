import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createCodexBrowserBackend,codexPasswordFileError,codexPasswordFileImportMetadata} from './codex-browser-backend.mjs';
import {CodexCuButton,CodexCuSpinner} from './codex-cu-primitives.jsx';
import {CodexCuDialog,CodexCuDialogBody,CodexCuDialogTitle,CodexCuDialogDescription,CodexCuDialogSection,CodexCuDialogHeader,CodexCuDialogFooter} from './codex-cu-dialog.jsx';
import {CodexCuSettingsGroup,CodexCuSettingsRow,CodexCuSettingsCheckbox} from './codex-cu-settings-primitives.jsx';
import {CodexBrowserImportCategoryIcon} from './codex-browser-import.jsx';

const resultTitles={completed:'密码文件导入完成','partial-success':'密码文件部分导入',failed:'密码文件导入失败',canceled:'密码文件导入已停止'};
const resultCounts={discovered:'发现的记录',skippedInvalid:'跳过的无效记录',added:'新增密码',updated:'更新密码',unchanged:'已有相同密码',failed:'失败记录',remaining:'剩余未处理'};
const ready=value=>value?.available===true&&value?.persistentReady===true&&value?.format==='csv';
const writable=scope=>scope?.readOnly!==true&&typeof scope?.actor==='string'&&!!scope.actor&&Number.isSafeInteger(scope?.controlEpoch)&&scope.controlEpoch>=0;

export function BrowserPasswordFileImportDialog({open,sessionId,scope,api,onClose,onImported,onModeChange,renderModeTabs}){
  const [signals,setSignals]=useState(null),[selection,setSelection]=useState(null),[fileName,setFileName]=useState(''),[confirmed,setConfirmed]=useState(false),[result,setResult]=useState(null),[pending,setPending]=useState(null),[error,setError]=useState('');
  const backend=useMemo(()=>createCodexBrowserBackend(api,sessionId,scope),[api,sessionId,scope?.browserId,scope?.tabId,scope?.actor,scope?.controlEpoch,scope?.readOnly]);
  const lifetime=useRef(null),callbacks=useRef(null),notified=useRef(new Set());
  callbacks.current={onClose,onImported,onModeChange};
  const current=context=>context.active&&lifetime.current===context;
  const report=(context,value)=>{
    if(value.added+value.updated>0&&!notified.current.has(value.selectionId)){
      notified.current.add(value.selectionId);
      void Promise.resolve().then(()=>callbacks.current.onImported?.(value)).catch(()=>{});
    }
    if(current(context)){setResult(value);setSelection(null);setConfirmed(false);}
  };
  const revoke=async context=>{
    if(!context.selectionId&&!context.cancelTask)return;
    const selectionId=context.selectionId;
    context.cancelTask??=context.backend.call('profilePasswordFileImportCancel',{selectionId,explicitUserCommand:true});
    try{
      const value=codexPasswordFileImportMetadata(await context.cancelTask,'terminal',selectionId);
      context.selectionId=null;
      report(context,value);
    }finally{context.cancelTask=null;}
  };
  const finishExit=async context=>{
    if(!current(context)||!context.exit||context.finishing)return;
    context.finishing=true;setPending('cancel');
    try{
      await revoke(context);
      if(!current(context))return;
      const destination=context.exit;context.exit=null;
      if(destination==='close')callbacks.current.onClose?.();
      else callbacks.current.onModeChange?.(destination);
    }catch(cause){if(current(context)){context.exit=null;setError(codexPasswordFileError(cause));}}
    finally{context.finishing=false;if(current(context))setPending(context.request?.action??null);}
  };
  const run=async(action,operation)=>{
    const context=lifetime.current;
    if(!context||!current(context)||context.request||context.finishing||context.exit)return;
    const controller=new AbortController(),request={controller,action};context.request=request;
    setPending(action);setError('');
    try{await operation(context,controller.signal);}
    catch(cause){if(current(context))setError(codexPasswordFileError(cause));}
    finally{
      if(context.request===request)context.request=null;
      if(current(context)){
        if(context.exit)await finishExit(context);
        else setPending(null);
      }
    }
  };
  useEffect(()=>{
    if(!open)return;
    const context={backend,active:true,selectionId:null,cancelTask:null,request:null,exit:null,finishing:false};lifetime.current=context;
    setSignals(null);setSelection(null);setFileName('');setConfirmed(false);setResult(null);setPending(null);setError('');
    void run('signals',async(context,signal)=>{
      const value=codexPasswordFileImportMetadata(await context.backend.call('profilePasswordFileImportSignals',{},signal),'signals');
      if(current(context))setSignals(value);
    });
    return()=>{
      context.active=false;context.request?.controller.abort();
      // Mutation replies must arrive so a late file-picker grant can be revoked.
      if(context.selectionId||context.cancelTask)void revoke(context).catch(()=>{});
    };
  },[open,backend]);
  const choose=()=>{
    if(!writable(scope)||!ready(signals))return;
    void run('choose',async context=>{
      await revoke(context);
      if(!current(context)||context.exit)return;
      setResult(null);setSelection(null);setFileName('');setConfirmed(false);
      const raw=await context.backend.call('profilePasswordFileImportChooseSource',{explicitUserCommand:true});
      if(typeof raw?.selectionId==='string'&&raw.selectionId)context.selectionId=raw.selectionId;
      if(!current(context)||context.exit){await revoke(context);return;}
      try{
        const value=codexPasswordFileImportMetadata(raw,'selection');
        if(value.canceled){await revoke(context);return;}
        setSelection(value);setFileName(value.fileName);
      }catch(cause){await revoke(context);throw cause;}
    });
  };
  const start=()=>{
    if(!writable(scope)||!ready(signals)||!selection||!confirmed||selection.valid===0)return;
    void run('import',async context=>{
      const selectionId=context.selectionId;
      if(!selectionId||selectionId!==selection.selectionId)return;
      const raw=await context.backend.call('profilePasswordFileImport',{selectionId,explicitUserCommand:true});
      const value=codexPasswordFileImportMetadata(raw,'terminal',selectionId);
      // A concurrently issued cancel owns closure and its terminal acknowledgement.
      if(!context.cancelTask)context.selectionId=null;
      report(context,value);
    });
  };
  const exit=destination=>{
    const context=lifetime.current;
    if(!context||!current(context)){if(destination==='close')callbacks.current.onClose?.();return;}
    if(context.finishing||context.exit)return;
    context.exit=destination;setError('');
    if(context.request){
      setPending('cancel');
      if(context.selectionId)context.cancelTask??=context.backend.call('profilePasswordFileImportCancel',{selectionId:context.selectionId,explicitUserCommand:true});
      // Keep a rejection handled while the in-flight import returns.
      context.cancelTask?.catch(()=>{});
      if(context.cancelTask)void finishExit(context);
      return;
    }
    void finishExit(context);
  };
  const supported=ready(signals),canWrite=writable(scope),importing=pending==='import',stopping=pending==='cancel';
  const title=result?resultTitles[result.status]:importing?'正在导入密码文件':stopping?'正在停止密码文件导入':'导入密码文件';
  const subtitle=result?(result.added+result.updated>0?'已经新增或更新的密码保留在当前内置浏览器。':result.status==='completed'?'没有新增或更新密码。':result.transactionStarted?'本次没有确认新增或更新密码。':'本次未开始写入密码。'):'选择浏览器导出的 CSV 密码文件。';
  return <CodexCuDialog open={open} onOpenChange={next=>{if(!next)exit('close');}} showDialogClose={!pending} dialogCloseLabel="关闭密码文件导入" shouldIgnoreClickOutside={!!pending}>
    <CodexCuDialogBody as="form" onSubmit={event=>{event.preventDefault();start();}}>
      <CodexCuDialogSection>
        {renderModeTabs?.({onChange:exit,disabled:!!pending})}
        <CodexCuDialogTitle className="codex-browser-import-sr-only">{title}</CodexCuDialogTitle>
        <CodexCuDialogHeader title={title} subtitle={<CodexCuDialogDescription>{subtitle}</CodexCuDialogDescription>}/>
      </CodexCuDialogSection>
      <CodexCuDialogSection className="codex-browser-import-selection">
        {pending==='signals'&&<span role="status"><CodexCuSpinner/>正在读取密码文件导入能力…</span>}
        {!canWrite&&<p className="codex-browser-import-guidance" role="status">当前预览只读，无法导入密码。</p>}
        {signals&&!supported&&<p className="codex-browser-import-guidance" role="status">{signals.error?.message??'当前浏览器尚未提供密码文件导入能力。'}</p>}
        {supported&&!result&&<CodexCuSettingsGroup>
          <CodexCuSettingsRow label="密码文件" icon={<CodexBrowserImportCategoryIcon kind="passwords"/>}
            description={`CSV，最多 ${signals.maxRecords.toLocaleString()} 条记录，${(signals.maxFileBytes/1048576).toLocaleString(undefined,{maximumFractionDigits:1})} MB。`}
            control={<CodexCuButton color="secondary" size="toolbar" disabled={!!pending||!canWrite} loading={pending==='choose'} onClick={choose}>选择文件</CodexCuButton>}/>
          {selection&&<>
            <CodexCuSettingsRow label={<span className="codex-browser-import-file-name">{selection.fileName}</span>}
              description={`发现 ${selection.discovered.toLocaleString()} 条，可导入 ${selection.valid.toLocaleString()} 条，跳过无效 ${selection.skippedInvalid.toLocaleString()} 条。`}/>
            <CodexCuSettingsRow label="确认导入所选密码" description="同一网站、同一账号的已有密码可能被更新。停止后已经写入的密码会保留。"
              control={props=><CodexCuSettingsCheckbox {...props} checked={confirmed} disabled={!!pending||!canWrite||selection.valid===0} onCheckedChange={setConfirmed}/>}/>
            {selection.valid===0&&<p className="codex-browser-import-guidance" role="status">所选文件没有可导入的有效密码，请重新选择。</p>}
          </>}
        </CodexCuSettingsGroup>}
        {(importing||stopping)&&<span role="status" aria-live="polite"><CodexCuSpinner/>{stopping?'正在等待停止结果…':'正在导入已确认的密码…'}</span>}
        {result&&<CodexCuSettingsGroup>{fileName&&<CodexCuSettingsRow label={<span className="codex-browser-import-file-name">{fileName}</span>}/>} {Object.entries(resultCounts).map(([key,label])=><CodexCuSettingsRow key={key} label={label}
          icon={key==='added'?<CodexBrowserImportCategoryIcon kind="passwords"/>:undefined} control={<span className="codex-browser-import-count">{result[key].toLocaleString()}</span>}/>)}</CodexCuSettingsGroup>}
        {result?.error&&<p className="codex-browser-import-profile-error" role="alert">{result.error.message}</p>}
        {error&&<p className="codex-browser-import-profile-error" role="alert">{error}</p>}
      </CodexCuDialogSection>
      <CodexCuDialogSection><CodexCuDialogFooter className="codex-browser-import-footer">
        <CodexCuButton color="secondary" disabled={stopping} onClick={()=>exit('close')}>{stopping?'正在停止…':result?'关闭':importing?'停止':'取消'}</CodexCuButton>
        {result&&<CodexCuButton color="secondary" disabled={!!pending||!canWrite||!supported} onClick={choose}>选择其他文件</CodexCuButton>}
        {!result&&<CodexCuButton color="primary" type="submit" loading={importing} disabled={!!pending||!canWrite||!supported||!selection||!confirmed||selection.valid===0}>确认导入</CodexCuButton>}
      </CodexCuDialogFooter></CodexCuDialogSection>
    </CodexCuDialogBody>
  </CodexCuDialog>;
}
