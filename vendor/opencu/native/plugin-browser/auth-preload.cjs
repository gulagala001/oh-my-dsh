const {contextBridge,ipcRenderer}=require('electron');

const REQUEST='opencu-browser-auth:request',STATE='opencu-browser-auth:state';
const states=new Set(['pending','submitting','submitted','uncertain','closed','skipped','failed']);
const attempts=new Set();
const text=(value,max=1024)=>typeof value==='string'&&value.length>0&&value.length<=max;
const credentialSave=value=>value&&['chromium','local'].includes(value.providerId)&&['saved','failed','not-saved'].includes(value.status)
  &&(value.accountLabel===undefined||typeof value.accountLabel==='string'&&value.accountLabel.length<=16384)
  ?{providerId:value.providerId,status:value.status,...(value.accountLabel!==undefined?{accountLabel:value.accountLabel}:{})}:null;
const credentials=(value,fieldIds)=>{
  if(!value||!Array.isArray(value.providers)||value.providers.length>2)return null;
  const seen=new Set(),providers=[];
  for(const provider of value.providers){
    if(!provider||!['chromium','local'].includes(provider.id)||seen.has(provider.id)||!text(provider.name,120)
      ||typeof provider.available!=='boolean'||typeof provider.canSave!=='boolean'||typeof provider.passwordOnly!=='boolean'
      ||!Array.isArray(provider.accounts)||provider.accounts.length>32||!provider.available&&(provider.canSave||provider.accounts.length))return null;
    seen.add(provider.id);
    const saveFieldIds=provider.canSave?provider.saveFieldIds:undefined;
    if(provider.canSave&&(!Array.isArray(saveFieldIds)||saveFieldIds.length!==2||new Set(saveFieldIds).size!==2
      ||saveFieldIds.some(id=>!text(id,48)||fieldIds&&!fieldIds.has(id))||provider.passwordOnly))return null;
    const ids=new Set(),accounts=[];
    for(const account of provider.accounts){
      if(!text(account?.id,128)||! /^[A-Za-z0-9_-]{16,128}$/.test(account.id)||ids.has(account.id)
        ||typeof account.accountLabel!=='string'||account.accountLabel.length>16384||!text(account.reference,128))return null;
      ids.add(account.id);accounts.push({id:account.id,accountLabel:account.accountLabel,reference:account.reference,providerName:provider.name});
    }
    if(provider.optionId!==undefined&&!text(provider.optionId,48))return null;
    providers.push({id:provider.id,name:provider.name,available:provider.available,canSave:provider.canSave,passwordOnly:provider.passwordOnly,
      accounts,...(saveFieldIds?{saveFieldIds:[...saveFieldIds]}:{}),...(provider.optionId?{optionId:provider.optionId}:{})});
  }
  if(value.defaultProviderId!==undefined&&!providers.some(provider=>provider.available&&provider.id===value.defaultProviderId))return null;
  return{providers,...(value.defaultProviderId?{defaultProviderId:value.defaultProviderId}:{})};
};
const qr=value=>{
  if(!value||!['waiting','ready','rotated','disappeared','expired','unavailable'].includes(value.state))return null;
  const imageDataUrl=text(value.imageDataUrl,4194304)&&/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value.imageDataUrl)?value.imageDataUrl:null;
  const source=value.matrix,validMatrix=Number.isInteger(source?.size)&&source.size>=21&&source.size<=177&&(source.size-21)%4===0&&Array.isArray(source.data)&&source.data.length===source.size*source.size&&source.data.every(cell=>typeof cell==='boolean'||cell===0||cell===1);
  const available=['ready','rotated'].includes(value.state);
  return{state:available&&!imageDataUrl&&!validMatrix?'unavailable':value.state,only:value.only===true,requiresApp:value.requiresApp===true,
    ...(available&&imageDataUrl?{imageDataUrl}:{}),...(available&&validMatrix?{matrix:{size:source.size,data:source.data.map(Boolean)}}:{})};
};
const outcome=value=>{
  if(!value||!text(value.id)||!states.has(value.state))return null;
  const save=credentialSave(value.credentialSave),choices=credentials(value.credentials);
  return{id:value.id,state:value.state,...(['submitted','unknown','not_submitted'].includes(value.fillStatus)?{fillStatus:value.fillStatus}:{}),...(['saved','failed'].includes(value.saveStatus)?{saveStatus:value.saveStatus}:{}),...(save?{credentialSave:save}:{}),...(choices?{credentials:choices}:{}),...(value.qr!==undefined?{qr:qr(value.qr)??{state:'unavailable',only:false,requiresApp:false}}:{})};
};
const origin=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.origin:null;}catch{return null;}};
const prompt=value=>{
  if(!value||!text(value.id)||!origin(value.origin)||!Array.isArray(value.fields)||value.fields.length>64)return null;
  const fields=[],ids=new Set();
  for(const field of value.fields){
    if(!field||!text(field.id)||ids.has(field.id)||!text(field.label,2048)||!['text','password','email','tel','number','url'].includes(field.type)||typeof field.required!=='boolean')return null;
    ids.add(field.id);fields.push({id:field.id,label:field.label,type:field.type,required:field.required,...(text(field.autocomplete,256)?{autocomplete:field.autocomplete}:{})});
  }
  let options;
  if(value.options!=null){
    if(!Array.isArray(value.options)||value.options.length>32)return null;
    const optionIds=new Set();options=[];
    for(const option of value.options){
      if(!option||!text(option.id)||optionIds.has(option.id)||!text(option.label,2048)||!Array.isArray(option.fieldIds)||option.fieldIds.length>64||option.fieldIds.some(id=>!ids.has(id)))return null;
      optionIds.add(option.id);options.push({id:option.id,label:option.label,fieldIds:[...new Set(option.fieldIds)]});
    }
  }
  if(value.frameOrigin!==undefined&&!origin(value.frameOrigin))return null;
  let localCredentials;
  if(value.localCredentials?.available===true){
    const local=value.localCredentials;
    if(!text(local.providerName,120)||!Array.isArray(local.saveFieldIds)||local.saveFieldIds.length!==2||local.saveFieldIds.some(id=>!ids.has(id))||!Array.isArray(local.accounts)||local.accounts.length>32)return null;
    const accounts=[];
    for(const account of local.accounts){if(!text(account?.id,128)||typeof account.accountLabel!=='string'||account.accountLabel.length>16384||!text(account.reference,128))return null;accounts.push({id:account.id,accountLabel:account.accountLabel,reference:account.reference,providerName:local.providerName});}
    localCredentials={available:true,providerName:local.providerName,saveFieldIds:[...local.saveFieldIds],accounts,...(text(local.optionId,48)?{optionId:local.optionId}:{})};
  }else if(value.localCredentials!==undefined)localCredentials={available:false};
  const choices=value.credentials===undefined?undefined:credentials(value.credentials,ids);
  if(value.credentials!==undefined&&!choices)return null;
  return{id:value.id,origin:origin(value.origin),fields,...(value.frameOrigin!==undefined?{frameOrigin:origin(value.frameOrigin)}:{}),...(options?{options}:{}),
    ...(localCredentials?{localCredentials}:{}),
    ...(choices?{credentials:choices}:{}),
    ...(text(value.locale,64)?{locale:value.locale}:{}),...(text(value.displaySiteName,1024)?{displaySiteName:value.displaySiteName}:{}),...(['light','dark'].includes(value.theme)?{theme:value.theme}:{}),...(value.qr!==undefined?{qr:qr(value.qr)??{state:'unavailable',only:false,requiresApp:false}}:{})};
};
const wipe=values=>{if(values&&typeof values==='object')for(const key of Object.keys(values)){if(values[key]&&typeof values[key]==='object')values[key].value='';delete values[key];}};

contextBridge.exposeInMainWorld('opencuBrowserAuth',{
  async readPrompt(){
    try{const result=await ipcRenderer.invoke(REQUEST,{op:'read-prompt'});return{prompt:prompt(result?.prompt),state:outcome(result?.state)};}catch{return{prompt:null,state:null};}
  },
  async submit(input){
    const id=text(input?.id)?input.id:null,values=Object.create(null);
    try{
      if(!id||attempts.has(id)||!input.values||typeof input.values!=='object'||Array.isArray(input.values))return{id:id??'',state:'failed',fillStatus:'not_submitted'};
      const entries=Object.entries(input.values);if(entries.length>64)return{id,state:'failed',fillStatus:'not_submitted'};
      let size=0;
      for(const [fieldId,field] of entries){
        if(!text(fieldId)||typeof field?.value!=='string'||field.value.length>65536)return{id,state:'failed',fillStatus:'not_submitted'};
        size+=field.value.length;if(size>262144)return{id,state:'failed',fillStatus:'not_submitted'};
        values[fieldId]={value:field.value};
      }
      if(input.optionId!==undefined&&!text(input.optionId)||input.saveLocal!==undefined&&typeof input.saveLocal!=='boolean'
        ||input.saveProviderId!==undefined&&!['chromium','local'].includes(input.saveProviderId)
        ||input.saveLocal===true&&input.saveProviderId!==undefined&&input.saveProviderId!=='local')return{id,state:'failed',fillStatus:'not_submitted'};
      attempts.add(id);
      // invoke serializes the only private payload before the local copies are erased.
      const pending=ipcRenderer.invoke(REQUEST,{op:'submit',id,...(input.optionId!==undefined?{optionId:input.optionId}:{}),...(input.saveLocal===true?{saveLocal:true}:{}),...(input.saveProviderId?{saveProviderId:input.saveProviderId}:{}),values});
      wipe(values);wipe(input.values);
      const result=outcome(await pending);return result?.id===id?result:{id,state:'uncertain',fillStatus:'unknown'};
    }catch{return{id:id??'',state:'uncertain',fillStatus:'unknown'};}
    finally{wipe(values);wipe(input?.values);}
  },
  async useCredential(input){
    const id=text(input?.id)?input.id:null;
    if(!id||attempts.has(id)||!['chromium','local'].includes(input.providerId)||!text(input.credentialId,128))return{id:id??'',state:'failed',fillStatus:'not_submitted'};
    attempts.add(id);
    try{const result=outcome(await ipcRenderer.invoke(REQUEST,{op:'use-credential',id,providerId:input.providerId,credentialId:input.credentialId}));return result?.id===id?result:{id,state:'uncertain',fillStatus:'unknown'};}
    catch{return{id,state:'uncertain',fillStatus:'unknown'};}
  },
  async removeCredential(input){
    const id=text(input?.id)?input.id:null,providerId=input?.providerId,credentialId=text(input?.credentialId,128)?input.credentialId:null;
    if(!id||!credentialId||attempts.has(id)||!['chromium','local'].includes(providerId))return{id:id??'',providerId,credentialId:credentialId??'',removed:false,failed:true};
    try{
      const result=await ipcRenderer.invoke(REQUEST,{op:'remove-credential',id,providerId,credentialId});
      if(result?.id!==id||result.providerId!==providerId||result.credentialId!==credentialId||typeof result.removed!=='boolean')return{id,providerId,credentialId,removed:false,failed:true};
      return{id,providerId,credentialId,removed:result.removed,failed:false};
    }catch{return{id,providerId,credentialId,removed:false,failed:true};}
  },
  async useLocal(input){
    const id=text(input?.id)?input.id:null;
    if(!id||attempts.has(id)||!text(input.credentialId,128))return{id:id??'',state:'failed',fillStatus:'not_submitted'};
    attempts.add(id);
    try{const result=outcome(await ipcRenderer.invoke(REQUEST,{op:'use-local',id,credentialId:input.credentialId}));return result?.id===id?result:{id,state:'uncertain',fillStatus:'unknown'};}
    catch{return{id,state:'uncertain',fillStatus:'unknown'};}
  },
  async removeLocal(input){
    const id=text(input?.id)?input.id:null,credentialId=text(input?.credentialId,128)?input.credentialId:null;
    if(!id||!credentialId||attempts.has(id))return{id:id??'',credentialId:credentialId??'',removed:false,failed:true};
    try{
      const result=await ipcRenderer.invoke(REQUEST,{op:'remove-local',id,credentialId});
      if(result?.id!==id||result.credentialId!==credentialId||typeof result.removed!=='boolean')return{id,credentialId,removed:false,failed:true};
      return{id,credentialId,removed:result.removed,failed:false};
    }catch{return{id,credentialId,removed:false,failed:true};}
  },
  async skip(input){
    if(!text(input?.id))return{id:'',state:'failed',fillStatus:'not_submitted'};
    try{const result=outcome(await ipcRenderer.invoke(REQUEST,{op:'skip',id:input.id}));return result?.id===input.id?result:{id:input.id,state:'uncertain',fillStatus:'unknown'};}
    catch{return{id:input.id,state:'uncertain',fillStatus:'unknown'};}
  },
  subscribe(listener){
    if(typeof listener!=='function')throw new TypeError('Private sign-in subscription requires a function');
    const receive=(_event,value)=>{const state=outcome(value);if(state)listener(state);};
    ipcRenderer.on(STATE,receive);return()=>ipcRenderer.removeListener(STATE,receive);
  },
});
