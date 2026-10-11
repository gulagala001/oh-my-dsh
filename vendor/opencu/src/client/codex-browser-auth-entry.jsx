import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CodexCloudAuthStandalonePage,CodexCloudAuthCredentialsForm,CodexCloudAuthSavedAccountConfirmation,CodexCloudAuthHeader,CODEX_CLOUD_AUTH_MESSAGES} from './codex-cloud-auth.jsx';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {CodexCuButton} from './codex-cu-primitives.jsx';
import {CodexCuDialog,CodexCuDialogTitle,CodexCuDialogDescription,CodexCuDialogHeader,CodexCuDialogBody,CodexCuDialogFooter} from './codex-cu-dialog.jsx';
import {formatCodexCuMessage} from './codex-cu-i18n.mjs';
import tokenCss from './codex-cu-tokens.css';
import primitiveCss from './codex-cu-primitives.css';
import overlayCss from './codex-cu-overlay.css';
import typographyCss from './codex-cu-typography.css';
import authCss from './codex-cloud-auth.css';
import dialogCss from './codex-cu-dialog.css';

const terminal=new Set(['submitted','uncertain','closed','skipped','failed']);
const wipe=values=>{for(const key of Object.keys(values??{})){if(values[key]&&typeof values[key]==='object')values[key].value='';delete values[key];}};
const clearInputs=root=>root.querySelectorAll('input').forEach(input=>{input.value='';});
const providerNames={'opencu-password-store':'OpenCU Passwords',chromium:'Chromium Passwords',local:'OpenCU Local Passwords'};
const credentialProviders=prompt=>Array.isArray(prompt?.credentials?.providers)?prompt.credentials.providers.filter(provider=>provider&&Object.hasOwn(providerNames,provider.id)):
  prompt?.localCredentials?[{...prompt.localCredentials,id:'local',name:prompt.localCredentials.providerName??providerNames.local,canSave:prompt.localCredentials.available===true&&Array.isArray(prompt.localCredentials.saveFieldIds)&&prompt.localCredentials.saveFieldIds.length>0}]:[];
const saveReceipt=value=>value&&Object.hasOwn(providerNames,value.providerId)&&['saved','failed','not-saved'].includes(value.status)?{providerId:value.providerId,status:value.status,...(typeof value.accountLabel==='string'?{accountLabel:value.accountLabel}:{})}:null;
const accountDisplayLabel=(account,locale)=>{
  if(typeof account.accountLabel==='string'&&account.accountLabel.trim())return account.accountLabel;
  const reference=account.reference??account.id;
  return reference?`${locale.startsWith('zh')?'条目':'Entry'} ${reference}`:locale.startsWith('zh')?'已保存的凭据':'Saved credential';
};

function BrowserAuthPage({service,root}){
  const [prompt,setPrompt]=useState(null),[state,setState]=useState('connecting'),[optionId,setOptionId]=useState(),[localAccountId,setLocalAccountId]=useState(),[credentialProviderId,setCredentialProviderId]=useState(),[saveProviderId,setSaveProviderId]=useState();
  const [removeConfirmation,setRemoveConfirmation]=useState(),[removing,setRemoving]=useState(false),[localNotice,setLocalNotice]=useState(),[credentialSave,setCredentialSave]=useState(null);
  const requestId=useRef(null),attempted=useRef(false),busy=useRef(false),alive=useRef(true);
  const applyResult=result=>{
    if(!alive.current||result?.id!==requestId.current)return;
    const receipt=saveReceipt(result.credentialSave);if(receipt)setCredentialSave(receipt);
    setState(terminal.has(result.state)?result.state:'uncertain');
  };
  useEffect(()=>{
    alive.current=true;let disposed=false;
    const receive=value=>{
      if(disposed||value?.id!==requestId.current)return;
      const receipt=saveReceipt(value.credentialSave);if(receipt)setCredentialSave(receipt);
      if(value.qr!==undefined)setPrompt(previous=>previous?{...previous,qr:value.qr}:previous);
      if(value.credentials!==undefined&&!terminal.has(value.state))setPrompt(previous=>previous?{...previous,credentials:value.credentials}:previous);
      if(attempted.current&&value.state==='pending')return;
      if(terminal.has(value.state)){clearInputs(root);setLocalAccountId(undefined);setCredentialProviderId(undefined);setRemoveConfirmation(undefined);setPrompt(previous=>previous?{...previous,qr:undefined,localCredentials:undefined,credentials:undefined}:previous);}
      setState(value.state);
    };
    const unsubscribe=service.subscribe(receive);
    void service.readPrompt().then(result=>{
      if(disposed)return;
      if(!result?.prompt){setState('closed');return;}
      requestId.current=result.prompt.id;setPrompt(result.state?.id===result.prompt.id&&result.state.qr!==undefined?{...result.prompt,qr:result.state.qr}:result.prompt);setState(result.state?.id===result.prompt.id?result.state.state:'pending');
      const providers=credentialProviders(result.prompt),preferred=result.prompt.credentials?.defaultProviderId;
      setSaveProviderId(providers.find(provider=>provider.id===preferred&&provider.available&&provider.canSave)?.id??providers.find(provider=>provider.available&&provider.canSave)?.id);
      const receipt=saveReceipt(result.state?.credentialSave);if(receipt)setCredentialSave(receipt);
    }).catch(()=>{if(!disposed)setState('closed');});
    return()=>{disposed=true;alive.current=false;clearInputs(root);unsubscribe();};
  },[service,root]);
  const submit=async(values,selectedOptionId,clear=()=>clearInputs(root),saveLocal=false)=>{
    try{
      if(busy.current||attempted.current||!requestId.current)return;
      busy.current=true;attempted.current=true;setState('submitting');
      const provider=credentialProviders(prompt).find(value=>value.id===saveProviderId),save=saveLocal&&provider?.available===true&&provider.canSave===true&&provider.passwordOnly!==true;
      const pending=service.submit({id:requestId.current,...(selectedOptionId!==undefined?{optionId:selectedOptionId}:{}),...(save?prompt?.credentials?{saveProviderId:provider.id}:{saveLocal:true}:{}),values});
      clear();wipe(values);
      const result=await pending;
      if(alive.current){if(result?.id===requestId.current)applyResult(result);else setState('uncertain');}
    }catch{if(alive.current)setState('uncertain');}
    finally{clear();wipe(values);clearInputs(root);busy.current=false;}
  };
  const useLocal=async()=>{
    const provider=credentialProviders(prompt).find(value=>value.id===credentialProviderId),account=provider?.accounts?.find(value=>value.id===localAccountId);
    if(busy.current||attempted.current||!requestId.current||!account||provider.available!==true||typeof service.useCredential!=='function'&&(provider.id!=='local'||typeof service.useLocal!=='function'))return;
    busy.current=true;attempted.current=true;clearInputs(root);setState('submitting');
    try{const result=await(typeof service.useCredential==='function'?service.useCredential({id:requestId.current,providerId:provider.id,credentialId:localAccountId}):service.useLocal({id:requestId.current,credentialId:localAccountId}));if(alive.current){if(result?.id===requestId.current)applyResult(result);else setState('uncertain');}}
    catch{if(alive.current)setState('uncertain');}
    finally{clearInputs(root);busy.current=false;setLocalAccountId(undefined);setCredentialProviderId(undefined);}
  };
  const removeLocal=async()=>{
    const credentialId=removeConfirmation?.credentialId,providerId=removeConfirmation?.providerId;
    if(busy.current||attempted.current||!requestId.current||credentialId!==localAccountId||providerId!==credentialProviderId||typeof service.removeCredential!=='function'&&(providerId!=='local'||typeof service.removeLocal!=='function'))return;
    busy.current=true;setRemoving(true);setLocalNotice(undefined);clearInputs(root);
    try{
      const result=await(typeof service.removeCredential==='function'?service.removeCredential({id:requestId.current,providerId,credentialId}):service.removeLocal({id:requestId.current,credentialId}));
      if(!alive.current)return;
      if(result?.id!==requestId.current||result.credentialId!==credentialId||result.providerId!==undefined&&result.providerId!==providerId||result.failed)throw new Error('Private credential removal is unavailable');
      setPrompt(previous=>previous?{...previous,...(previous.credentials?{credentials:{...previous.credentials,providers:previous.credentials.providers.map(provider=>provider.id===providerId?{...provider,accounts:provider.accounts.filter(account=>account.id!==credentialId)}:provider)}}:{}),
        ...(providerId==='local'&&previous.localCredentials?{localCredentials:{...previous.localCredentials,accounts:previous.localCredentials.accounts.filter(account=>account.id!==credentialId)}}:{})}:previous);
      setLocalAccountId(undefined);setCredentialProviderId(undefined);
      setLocalNotice(result.removed?'removed':'missing');
    }catch{if(alive.current)setLocalNotice('failed');}
    finally{busy.current=false;if(alive.current){setRemoving(false);setRemoveConfirmation(undefined);}clearInputs(root);}
  };
  const skip=async()=>{
    if(busy.current||attempted.current||!requestId.current)return;
    busy.current=true;attempted.current=true;clearInputs(root);setState('submitting');
    try{const result=await service.skip({id:requestId.current});if(alive.current){if(result?.id===requestId.current)applyResult(result);else setState('uncertain');}}
    catch{if(alive.current)setState('uncertain');}
    finally{clearInputs(root);busy.current=false;}
  };
  const locale=prompt?.locale??'zh-CN';
  const providers=credentialProviders(prompt),provider=providers.find(value=>value.id===credentialProviderId),saveProvider=providers.find(value=>value.id===saveProviderId);
  const saveProviders=providers.filter(value=>value.available===true&&value.canSave===true&&value.passwordOnly!==true&&Array.isArray(value.saveFieldIds)&&value.saveFieldIds.length>0);
  const saveEnabled=saveProviders.some(value=>value.id===saveProviderId);
  const saveOutcome=credentialSave?<p role={credentialSave.status==='failed'?'alert':'status'} className="cuc-text-sm cuc-break-words" data-dd-privacy="mask">
    {locale.startsWith('zh')?(credentialSave.status==='saved'?`已保存到 ${providerNames[credentialSave.providerId]}。`:credentialSave.status==='failed'?`未能保存到 ${providerNames[credentialSave.providerId]}。`:'此次没有保存密码。'):
      (credentialSave.status==='saved'?`Saved in ${providerNames[credentialSave.providerId]}.`:credentialSave.status==='failed'?`Could not save in ${providerNames[credentialSave.providerId]}.`:'No password was saved for this request.')}
    {credentialSave.accountLabel&&<span> {credentialSave.accountLabel}</span>}
  </p>:null;
  const formatMessage=(descriptor,values)=>{
    const chinese=locale.startsWith('zh');
    if(descriptor.id==='browserAuth.remember')return chinese?`保存到 ${saveProvider?.name??providerNames[saveProviderId]??providerNames.local}`:`Save in ${saveProvider?.name??providerNames[saveProviderId]??providerNames.local}`;
    if(descriptor.id==='chatgptConversations.cloudBrowser.auth.credentialSecurityDisclosure')return chinese?'输入内容只交给当前网站。仅在明确勾选保存时写入所选密码存储。':'Entries are sent only to this website. Passwords are written to the selected store only when you choose to save.';
    const result=formatCodexCuMessage(descriptor,values,locale);
    return descriptor.id==='chatgptConversations.cloudBrowser.auth.credentialSecurityDisclosure'&&typeof result==='string'?result.replace(/<link>.*?<\/link>/g,'').trim():result;
  };
  const common={browserAuth:prompt,displaySiteName:prompt?.displaySiteName??(prompt?new URL(prompt.origin).hostname.replace(/^www\./,''):''),locale,formatMessage,theme:prompt?.theme,windowType:'electron',loadRemote:false,
    siteIcon:<CodexCuIcon name="shared:Dtt"/>,onOpenHelp:()=>{}};
  if(state==='uncertain'||state==='failed'){
    const descriptor=CODEX_CLOUD_AUTH_MESSAGES[state==='uncertain'?'aeon.messaging.browserAuth.unconfirmed':'aeon.messaging.browserAuth.failed'];
    return <CodexCloudAuthStandalonePage {...common}><p role="status">{formatMessage(descriptor)}</p>{saveOutcome}</CodexCloudAuthStandalonePage>;
  }
  if(state==='submitted'&&credentialSave)return <CodexCloudAuthStandalonePage {...common}><CodexCloudAuthHeader {...common} status="accepted"/>{saveOutcome}</CodexCloudAuthStandalonePage>;
  const local=provider,localAccount=local?.accounts?.find(account=>account.id===localAccountId);
  const notice=localNotice?<p role={localNotice==='failed'?'alert':'status'} className="cuc-text-sm cuc-break-words">
    {locale.startsWith('zh')?(localNotice==='removed'?'已从所选密码存储删除此账号。':localNotice==='missing'?'此账号已不在所选密码存储中。':'无法确认删除结果。'):
      (localNotice==='removed'?'The account was deleted from the selected password store.':localNotice==='missing'?'This account is no longer in the selected password store.':'The deletion result could not be confirmed.')}
  </p>:null;
  if(local?.available&&localAccount&&(state==='pending'||state==='submitting')){
    const removeLabel=locale.startsWith('zh')?'删除已保存账号':'Delete saved account';
    return <><CodexCloudAuthStandalonePage {...common}><CodexCloudAuthSavedAccountConfirmation {...common}
      intent="use" origin={prompt.origin} siteName={new URL(prompt.origin).hostname} providerName={local.name??local.providerName??providerNames[local.id]}
      accountLabel={accountDisplayLabel(localAccount,locale)} busy={state==='submitting'||removing} onConfirm={useLocal} onDecline={skip}
      alternateAction={typeof service.removeCredential==='function'||local.id==='local'&&typeof service.removeLocal==='function'?<CodexCuButton color="ghostDanger" size="icon" title={removeLabel} aria-label={removeLabel}
        disabled={state==='submitting'||removing} onClick={()=>{clearInputs(root);setLocalNotice(undefined);setRemoveConfirmation({providerId:local.id,credentialId:localAccount.id});}}>
        <CodexCuIcon name="shared:$ot"/></CodexCuButton>:undefined}
      onEnterManually={()=>{clearInputs(root);setLocalAccountId(undefined);setCredentialProviderId(undefined);setRemoveConfirmation(undefined);}}>{notice}</CodexCloudAuthSavedAccountConfirmation></CodexCloudAuthStandalonePage>
      <CodexCuDialog open={removeConfirmation?.credentialId===localAccount.id&&removeConfirmation?.providerId===local.id} onOpenChange={open=>{if(!open&&!removing)setRemoveConfirmation(undefined);}}
        shouldIgnoreClickOutside={removing} showDialogClose={!removing} dialogCloseLabel={locale.startsWith('zh')?'取消删除':'Cancel deletion'}>
        <CodexCuDialogHeader><CodexCuDialogTitle>{removeLabel}</CodexCuDialogTitle></CodexCuDialogHeader>
        <CodexCuDialogBody><CodexCuDialogDescription>{locale.startsWith('zh')?`从 ${local.name??providerNames[local.id]} 删除此网站的已保存账号？`:`Delete this website's saved account from ${local.name??providerNames[local.id]}?`}</CodexCuDialogDescription>
          <p className="cuc-break-words cuc-text-sm" data-dd-privacy="mask">{accountDisplayLabel(localAccount,locale)}</p></CodexCuDialogBody>
        <CodexCuDialogFooter><CodexCuButton color="secondary" size="dialog" disabled={removing} onClick={()=>setRemoveConfirmation(undefined)}>{locale.startsWith('zh')?'取消':'Cancel'}</CodexCuButton>
          <CodexCuButton color="dangerSolid" size="dialog" loading={removing} disabled={removing} onClick={removeLocal}>{locale.startsWith('zh')?'确认删除':'Delete account'}</CodexCuButton></CodexCuDialogFooter>
      </CodexCuDialog></>;
  }
  const savedAccounts=providers.filter(value=>value.available===true&&(typeof service.useCredential==='function'||value.id==='local'&&typeof service.useLocal==='function')).flatMap(provider=>(provider.accounts??[]).map(account=>({provider,account,key:JSON.stringify([provider.id,account.id])})));
  const savedAccountPicker=<>{notice}{savedAccounts.length>0?<label className="cuc-flex cuc-min-w-0 cuc-flex-col cuc-gap-2 cuc-text-sm">
    <span>{locale.startsWith('zh')?'已保存的账号':'Saved accounts'}</span>
    <select aria-label={locale.startsWith('zh')?'选择已保存账号':'Choose a saved account'} value="" disabled={state==='submitting'}
      onChange={event=>{const choice=savedAccounts.find(value=>value.key===event.target.value);clearInputs(root);setLocalAccountId(choice?.account.id);setCredentialProviderId(choice?.provider.id);setRemoveConfirmation(undefined);}}>
      <option value="">{locale.startsWith('zh')?'选择账号':'Select an account'}</option>
      {providers.filter(provider=>savedAccounts.some(value=>value.provider.id===provider.id)).map(provider=><optgroup key={provider.id} label={provider.name??providerNames[provider.id]}>
        {savedAccounts.filter(value=>value.provider.id===provider.id).map(value=><option key={value.key} value={value.key}>{accountDisplayLabel(value.account,locale)}</option>)}
      </optgroup>)}
    </select>
  </label>:null}{saveProviders.length>1&&<label className="cuc-flex cuc-min-w-0 cuc-flex-col cuc-gap-2 cuc-text-sm">
    <span>{locale.startsWith('zh')?'保存位置':'Save location'}</span>
    <select aria-label={locale.startsWith('zh')?'选择密码保存位置':'Choose password save location'} value={saveProviderId??''} disabled={state==='submitting'}
      onChange={event=>{clearInputs(root);setSaveProviderId(saveProviders.find(provider=>provider.id===event.target.value)?.id);}}>
      {saveProviders.map(provider=><option key={provider.id} value={provider.id}>{provider.name??providerNames[provider.id]}</option>)}
    </select>
  </label>}</>;
  if(prompt?.qr&&(state==='pending'||state==='submitting')){
    const qr=prompt.qr,available=['ready','rotated'].includes(qr.state)&&!!(qr.imageDataUrl||qr.matrix),qrOnly=qr.only===true&&prompt.fields.length===0&&!(prompt.options?.length);
    return <CodexCloudAuthStandalonePage {...common}><CodexCloudAuthCredentialsForm key={saveProviderId??'no-save'} {...common}
      browserAuth={{...prompt,qrCode:true}} busy={state==='submitting'} submissionDisabled={qrOnly&&!available}
      saveEnabled={saveEnabled} saveFieldIds={saveProvider?.saveFieldIds} savedAccountPicker={savedAccountPicker}
      qr={{...qr,status:qr.state==='rotated'?'ready':qr.state,payloadAvailableScopeMatch:available}}
      onSubmit={(values,selectedOptionId,remember)=>submit(values,selectedOptionId,()=>clearInputs(root),remember)} onDecline={skip}/></CodexCloudAuthStandalonePage>;
  }
  if(providers.some(provider=>provider.available)&&(state==='pending'||state==='submitting')){
    return <CodexCloudAuthStandalonePage {...common}><CodexCloudAuthCredentialsForm key={saveProviderId??'no-save'} {...common}
      busy={state==='submitting'} saveEnabled={saveEnabled} saveFieldIds={saveProvider?.saveFieldIds} savedAccountPicker={savedAccountPicker}
      onSubmit={(values,selectedOptionId,remember)=>submit(values,selectedOptionId,()=>clearInputs(root),remember)} onDecline={skip}/></CodexCloudAuthStandalonePage>;
  }
  return <CodexCloudAuthStandalonePage {...common} connecting={state==='connecting'} unavailable={state==='closed'||!prompt}
    responseStatus={state==='submitted'?'accepted':state==='skipped'?'declined':undefined} pending={!!prompt&&(state==='pending'||state==='submitting')}
    state={state==='submitting'?'submitting':'ready'} selectedOptionId={optionId} onSelectOption={setOptionId}
    onChangeMethod={()=>setOptionId(undefined)} onSubmit={submit} onSkip={skip}/>;
}

export function initializeCodexBrowserAuthWindow({service=window.opencuBrowserAuth,root=document.getElementById('root')}={}){
  if(!root||!service||['readPrompt','submit','skip','subscribe'].some(method=>typeof service[method]!=='function'))throw new Error('Private sign-in service is unavailable');
  const style=document.createElement('style');style.dataset.opencuBrowserAuth='';style.textContent=[tokenCss,primitiveCss,overlayCss,typographyCss,authCss,dialogCss].join('\n');document.head.append(style);
  document.documentElement.dataset.codexWindowType='electron';
  const renderer=createRoot(root);let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;clearInputs(root);renderer.unmount();style.remove();window.removeEventListener('pagehide',dispose);};
  renderer.render(<BrowserAuthPage service={service} root={root}/>);window.addEventListener('pagehide',dispose,{once:true});return dispose;
}

try{initializeCodexBrowserAuthWindow();}catch{window.close();}
