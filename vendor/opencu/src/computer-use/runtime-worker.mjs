import { AsyncLocalStorage } from 'node:async_hooks';
import { inspect } from 'node:util';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isArrayBuffer } from 'node:util/types';
import { BROWSER_MANAGEMENT_METHODS } from './browser-management.mjs';
import kernel from './repl-kernel.cjs';
import { drainExecBackgroundTasks, makeRejectedThenable, trackExecBackgroundOperation } from './repl/worker-runtime.cjs';
import { CORE_DOCUMENTATION, BROWSER_DOCUMENTATION, appDocumentation, documentationTopic } from './api-docs.mjs';
import { documentationKey, documentationKeyForText } from './documentation-state.mjs';

const scope = new AsyncLocalStorage(), pending = new Map(); let sequence = 0;
let activeExecution;
function freezeMetadata(value) {
  if(value===null||typeof value!=='object'||Object.isFrozen(value))return value;
  Object.freeze(value);
  for(const child of Object.values(value))freezeMetadata(child);
  return value;
}
const send = message => {
  if (!process.connected) throw new Error('Computer Use JavaScript runtime is disconnected.');
  process.send(message);
};
function currentExecution() {
  const execution = scope.getStore();
  if (!execution || execution !== activeExecution) throw new Error('Computer Use operations must run inside the current tool call.');
  return execution;
}
const rejectedThenable=makeRejectedThenable,trackOperation=trackExecBackgroundOperation,drainOperations=drainExecBackgroundTasks;
function trackedAsyncOperation(operation) {
  return function(...args) {
    let execution;
    try { execution=currentExecution(); } catch(error) { return rejectedThenable(error); }
    let pendingOperation;
    try { pendingOperation=Promise.resolve(Reflect.apply(operation,this,args)); }
    catch(error) { pendingOperation=Promise.reject(error); }
    return trackOperation(execution,pendingOperation);
  };
}
const asyncFunctionPrototype=Object.getPrototypeOf(async()=>{});
function freezeApi(value) {
  // The public operation owns completion, including work after an internal RPC.
  // An internal await must not count as the submitted code handling its result.
  for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    const operation=descriptor.value;
    if(typeof operation==='function'&&Object.getPrototypeOf(operation)===asyncFunctionPrototype) {
      Object.defineProperty(value,key,{...descriptor,value:trackedAsyncOperation(operation)});
    }
  }
  return Object.freeze(value);
}
const rpc = (method, args = []) => {
  let execution;
  try { execution = currentExecution(); } catch (error) { return rejectedThenable(error); }
  const id = ++sequence;
  const operation = new Promise((resolve,reject) => {
    pending.set(id,{resolve,reject});
    try { send({type:'rpc',id,execution:execution.id,method,args}); }
    catch(error) { pending.delete(id); reject(error); }
  });
  return trackOperation(execution, operation);
};
const emit = (type, value, key, execution=currentExecution()) => {
  send({ type:'output', execution:execution.id, block:{type,...value}, ...(key?{documentationKey:key}:{}) });
  // Provisional deduplication for this call only. The host confirms complete
  // output acceptance and provides its accepted set before every next call.
  if(key&&execution===activeExecution)shownDocumentation.add(key);
};
const formatLog = values => values.map(value => typeof value==='string'?value:inspect(value,{depth:4,colors:false})).join(' ');
const display = (value, itemId) => {
  if (itemId !== undefined && (typeof itemId !== 'string' || !itemId)) throw new TypeError('nodeRepl.write expected a nonempty string content item ID');
  const text=formatLog([value]);
  emit('text',{text,...(itemId!==undefined?{itemId}:{})},documentationKeyForText(text,nativePlatform));
};
const shownDocumentation=new Set();
let nativePlatform=process.argv[2]??process.platform;
function documentation(kind,force=false){
  for(const name of ['core',kind].filter(Boolean)){
    const text=name==='core'?CORE_DOCUMENTATION:name==='browser'?BROWSER_DOCUMENTATION:appDocumentation(nativePlatform),key=documentationKey(name,text);
    if(!force&&shownDocumentation.has(key))continue;
    emit('text',{text},key);
  }
}
const captures = new WeakMap(), digest = data => createHash('sha256').update(data).digest('hex');
function imageBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (isArrayBuffer(value)) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  return null;
}
function imageMimeType(bytes) {
  const data=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(data.length>=8&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'image/png';
  if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)return'image/jpeg';
  if(data.length>=12&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')return'image/webp';
  throw new Error('nodeRepl.emitImage could not infer image MIME type from bytes; expected PNG, JPEG, or WebP data');
}
function byteImage(bytes,mediaType) {
  if(!bytes.byteLength)throw new Error('nodeRepl.emitImage expected non-empty bytes');
  if(typeof mediaType!=='string'||!mediaType)throw new Error('nodeRepl.emitImage expected a non-empty mimeType');
  if(!/^image\//i.test(mediaType))throw new Error('nodeRepl.emitImage only accepts image/* data URLs');
  return{data:Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).toString('base64'),mediaType};
}
function imageValue(value) {
  if(typeof value==='string'){
    if(!value)throw new Error('nodeRepl.emitImage expected a non-empty image_url');
    if(/^file:/i.test(value)){const bytes=readFileSync(fileURLToPath(value));return byteImage(bytes,imageMimeType(bytes));}
    if(!/^data:/i.test(value))throw new Error('nodeRepl.emitImage only accepts data or file URLs');
    const match=/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/]*={0,2})$/i.exec(value);
    if(!match||!match[2]||match[2].length%4===1)throw new Error('nodeRepl.emitImage received a malformed or invalid base64 image data URL');
    return byteImage(Buffer.from(match[2],'base64'),match[1]);
  }
  const bytes=imageBytes(value);
  if(bytes)return byteImage(bytes,imageMimeType(bytes));
  if(value&&typeof value==='object'&&!Array.isArray(value)&&'bytes'in value){
    if(Object.keys(value).some(key=>key!=='bytes'&&key!=='mimeType'))throw new Error('nodeRepl.emitImage received an unsupported value');
    const bytes=imageBytes(value.bytes);
    if(!bytes)throw new Error('nodeRepl.emitImage expected bytes to be Buffer, Uint8Array, ArrayBuffer, or ArrayBufferView');
    return byteImage(bytes,value.mimeType);
  }
  throw new Error('nodeRepl.emitImage received an unsupported value');
}
function sendImage(execution,block) {
  const id=++sequence;
  return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    try { send({type:'output',id,execution:execution.id,block:{type:'image',...block}}); }
    catch(error){pending.delete(id);reject(error);}
  });
}
const emitImage = image => {
  let execution;
  try { execution=currentExecution(); } catch(error) { return rejectedThenable(error); }
  const operation=(async()=>{
    const value=await image, bytes=imageBytes(value)??imageBytes(value?.bytes), capture=bytes?captures.get(bytes):undefined;
    const original=bytes&&capture?.digest===digest(bytes);
    if(original&&capture.emittedExecution===execution.id)return;
    const knownFormat=bytes&&capture?.formatDigest===digest(bytes.subarray(0,12));
    const block=knownFormat?byteImage(bytes,capture.mediaType):imageValue(value);
    await sendImage(execution,{...block,...(original?{capture:capture.info}:{})});
    if(original)capture.emittedExecution=execution.id;
  })();
  return trackOperation(execution,operation);
};
const locatorMethods=['locator','getByRole','getByText','getByLabel','getByPlaceholder','getByTestId','getByAltText','getByTitle','frameLocator','filter','and','or','nth','first','last'];
const locatorActions=['click','dblclick','fill','press','type','pressSequentially','check','uncheck','setChecked','selectOption','setInputFiles','hover','scrollIntoViewIfNeeded','focus','blur','count','innerText','textContent','allInnerTexts','allTextContents','inputValue','getAttribute','isVisible','isEnabled','isChecked','boundingBox','ariaSnapshot','waitFor','evaluate','evaluateAll','downloadMedia'];
const locatorInfo=new WeakMap();
function locator(target,chain=[]) {
  const result={};
  const reference=value=>{
    const nested=locatorInfo.get(value);
    if(!nested)throw new TypeError('A Playwright locator is required.');
    if(nested.target.id!==target.id||nested.target.browserId!==target.browserId)throw new Error('Nested locators must belong to the same browser tab.');
    return{$locator:{id:target.id,browserId:target.browserId,chain:nested.chain}};
  };
  for(const method of locatorMethods) result[method]=(...args)=>{
    if(method==='and'||method==='or')args[0]=reference(args[0]);
    const index=method==='filter'?0:method==='locator'?1:-1;
    if(index>=0&&args[index]){
      const options={...args[index]};
      for(const key of ['has','hasNot'])if(options[key]!==undefined){
        options[key]=reference(options[key]);
      }
      args[index]=options;
    }
    return locator(target,[...chain,{method,args}]);
  };
  for(const method of locatorActions) result[method]=(...args)=>rpc('target',[target,'locator',[chain,method,args.map(value=>typeof value==='function'?{$function:value.toString()}:value)]]);
  result.all=trackedAsyncOperation(async()=>Array.from({length:await result.count()},(_,index)=>result.nth(index)));
  locatorInfo.set(result,{target,chain});
  return result;
}
function target(info) {
  const result={id:info.id,kind:info.kind,browserId:info.browserId};
  for(const method of ['click','drag','pressKey','scroll','selectText','setValue','typeText','paste','performSecondaryAction','goto','back','forward','reload','close','markDeliverable','markHandoff']) result[method]=async(...args)=>{await rpc('target',[info,method,args]);};
  for(const method of ['getAXState','getScreenshot','getAXStateAndScreenshot']) result[method]=async(options={})=>{
    const response=await rpc('target',[info,method,[options]]);
    const bytes=response.screenshot?new Uint8Array(Buffer.from(response.screenshot,'base64')):undefined;
    if(bytes) {
      const png=Buffer.from(bytes);let width=response.screenshotWidth,height=response.screenshotHeight;
      if(png.length>=24&&png.readUInt32BE(0)===0x89504e47){width=png.readUInt32BE(16);height=png.readUInt32BE(20);}
      captures.set(bytes,{digest:digest(bytes),formatDigest:digest(bytes.subarray(0,12)),mediaType:response.screenshotMimeType??'image/png',
        ...(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0?{info:{target:info,width,height,...(response.screenshotFrame?{geometry:response.screenshotFrame}:{})}}:{})});
    }
    if(options.emit!==false){if(response.state)display(response.state);if(bytes)await emitImage({bytes,mimeType:response.screenshotMimeType??'image/png'});}
    return method==='getAXState'?response.state:method==='getScreenshot'?bytes:{state:response.state,screenshot:bytes};
  };
  if(info.kind==='tab') {
    result.playwright=locator(info);
    result.playwright.domSnapshot=()=>rpc('target',[info,'playwright.domSnapshot']);
    result.playwright.evaluate=(expression,arg,options)=>rpc('target',[info,'evaluate',[typeof expression==='function'?{$function:expression.toString()}:expression,arg,options]]);
    for(const method of ['waitForLoadState','waitForURL','waitForTimeout'])result.playwright[method]=(...args)=>rpc('target',[info,method,args]);
    result.playwright.waitForEvent=trackedAsyncOperation(async(event,options)=>{
      const response=await rpc('target',[info,'waitForEvent',[event,options]]);
      if(response.event==='download')return Object.freeze({path:options=>rpc('target',[info,'download.path',[response.downloadId,options]])});
      if(response.event==='filechooser')return freezeApi({isMultiple:()=>response.isMultiple,setFiles:async(files,options)=>{await rpc('target',[info,'fileChooser.setFiles',[response.fileChooserId,files,options]]);}});
      throw new Error('Browser event is not available: '+event);
    });
    result.cua=freezeApi({downloadMedia:async options=>{await rpc('target',[info,'cua.downloadMedia',[options]]);}});
    result.dom_cua=freezeApi({downloadMedia:async options=>{await rpc('target',[info,'dom_cua.downloadMedia',[options]]);}});
    for(const method of ['url','title'])result[method]=()=>rpc('target',[info,method]);
    result.dialog={get:()=>rpc('target',[info,'dialog.get']),accept:text=>rpc('target',[info,'dialog.accept',[text]]),dismiss:()=>rpc('target',[info,'dialog.dismiss'])};
    result.downloads={list:()=>rpc('target',[info,'downloads.list']),save:(id,path)=>rpc('target',[info,'downloads.save',[id,path]])};
    result.filechooser={setFiles:files=>rpc('target',[info,'filechooser.setFiles',[files]])};
    result.dev={logs:options=>rpc('target',[info,'logs',[options]]),network:{list:options=>rpc('target',[info,'network.list',[options]]),request:id=>rpc('target',[info,'network.request',[id]]),responseBody:id=>rpc('target',[info,'network.responseBody',[id]])}};
    result.clipboard=freezeApi({readText:()=>rpc('target',[info,'clipboard.readText']),writeText:async text=>{await rpc('target',[info,'clipboard.writeText',[text]]);},read:()=>rpc('target',[info,'clipboard.read']),write:async items=>{await rpc('target',[info,'clipboard.write',[items]]);}});
    result.viewport={set:size=>rpc('target',[info,'viewport.set',[size]]),reset:()=>rpc('target',[info,'viewport.reset'])};
    result.emulation=Object.freeze({set:settings=>rpc('target',[info,'emulation.set',[settings]]),reset:()=>rpc('target',[info,'emulation.reset'])});
    result.screenshot=(options={})=>result.getScreenshot({...options,emit:false});
    result.content=Object.freeze({export:()=>rpc('target',[info,'content.export']),exportGsuite:format=>rpc('target',[info,'content.exportGsuite',[format]]),exportYouTubeTranscript:()=>rpc('target',[info,'content.exportYouTubeTranscript'])});
    const pageAssets=Object.freeze({list:()=>rpc('target',[info,'pageAssets.list']),bundle:options=>rpc('target',[info,'pageAssets.bundle',[options]])});
    const webmcp=freezeApi({fetchTools:async()=>{const fetched=await rpc('target',[info,'webmcp.fetchTools']);return Object.freeze({description:()=>fetched.description,call:(name,input={},options)=>rpc('target',[info,'webmcp.call',[fetched.handle,name,input,options]])});}});
    const cdp=Object.freeze({send:(method,params,options)=>rpc('target',[info,'cdp.send',[method,params,options]]),readEvents:options=>rpc('target',[info,'cdp.readEvents',[options]])});
    const authSelector=value=>{
      if(typeof value==='string'||value===undefined)return value;
      const nested=locatorInfo.get(value);
      if(!nested)throw new TypeError('Browser authentication selectors require a selector string or a Playwright locator.');
      if(nested.target.id!==info.id||nested.target.browserId!==info.browserId)throw new Error('Browser authentication locators must belong to the same browser tab.');
      return{$locator:{id:info.id,browserId:info.browserId,chain:nested.chain}};
    };
    const browserAuth=Object.freeze({request:request=>{
      const input={...request};
      if(Array.isArray(input.fields))input.fields=input.fields.map(field=>({...field,selector:authSelector(field.selector)}));
      if(Array.isArray(input.options))input.options=input.options.map(option=>({...option,...(option.selector!==undefined?{selector:authSelector(option.selector)}:{})}));
      if(input.submit)input.submit={...input.submit,selector:authSelector(input.submit.selector)};
      return rpc('target',[info,'browserAuth.request',[input]]);
    }});
    const botDetection=Object.freeze({report:request=>rpc('target',[info,'botDetection.report',[request]])});
    result.capabilities=freezeApi({list:()=>rpc('target',[info,'capabilities.list']),get:async id=>{
      if(id==='pageAssets')return pageAssets;
      if(id==='webmcp')return webmcp;
      const capability={cdp,browserAuth,botDetection}[id];
      if(!capability||!(await rpc('target',[info,'capabilities.list'])).some(entry=>entry.id===id))throw new Error('Tab capability is not available: '+id);
      return capability;
    }});
  }
  return freezeApi(result);
}
const bind=trackedAsyncOperation(async(method,args)=>{const info=await rpc(method,args);documentation(info.kind==='tab'?'browser':'app');const bound=target(info);await bound.getAXState({disableDiffing:true});return bound;});
function browserTarget(info){
  const viewport=Object.freeze({set:size=>rpc('browserViewport',[info.id,size]),reset:()=>rpc('browserViewport',[info.id,null])});
  const emulation=Object.freeze({set:settings=>rpc('browserEmulation',[info.id,settings]),reset:()=>rpc('browserEmulation',[info.id,null])});
  const visibility=Object.freeze({set:visible=>rpc('browserVisibility',[info.id,visible]),get:()=>rpc('browserVisibilityGet',[info.id])});
  const management=entry=>{
    const result={getAuditTrail:()=>rpc('browserManagementAudit',[info.id])};
    for(const [namespace,allowed]of Object.entries(BROWSER_MANAGEMENT_METHODS)){
      const status=entry.managementStatus?.namespaces?.[namespace];
      const methods=status?.available?allowed.filter(method=>status.methods?.includes(method)):[];
      result[namespace]=Object.freeze(Object.fromEntries(methods.map(method=>[method,(...args)=>rpc('browserManagement',[info.id,namespace,method,args])])));
    }
    return Object.freeze(result);
  };
  return freezeApi({...info,browserId:info.id,documentation:async()=>BROWSER_DOCUMENTATION,
    capabilities:freezeApi({list:()=>rpc('browserCapabilities',[info.id]),get:async id=>{
      const entry=(await rpc('browserCapabilities',[info.id])).find(entry=>entry.id===id);
      if(!entry)throw new Error('Browser capability is not available: '+id);
      if(id==='visibility')return visibility;
      if(id==='emulation')return emulation;
      if(id==='viewport')return viewport;
      if(id==='management')return management(entry);
      throw new Error('Browser capability is not available: '+id);
    }}),
    nameSession:name=>rpc('browserNameSession',[info.id,name]),
    user:Object.freeze({openTabs:()=>rpc('openTabs',[{browser:info.id}]),claimTab:reference=>bind('claimTab',[info.id,reference])}),
    tabs:{list:()=>rpc('ownedTabs',[{browser:info.id}]),get:id=>bind('getTab',[id,{browser:info.id}]),new:()=>bind('createBrowserTab',[info.id,'about:blank'])}});
}
const state=trackedAsyncOperation(async(options={})=>{const state=await rpc('getState');documentation();if(options.emit!==false)display(state);return state;});
const listBrowsers=trackedAsyncOperation(async(options={})=>{const browsers=await rpc('listBrowsers');documentation();if(options.emit!==false)display(browsers);return browsers;});
const getBrowser=trackedAsyncOperation(async(options)=>{const info=await rpc('getBrowser',[options]);documentation('browser');display(info);return browserTarget(info);});
globalThis.cua=freezeApi({
  documentation:async topic=>documentationTopic(topic,nativePlatform),
  rewriteDocumentation:async topic=>{
    if(topic!==undefined){const text=documentationTopic(topic,nativePlatform);emit('text',{text},documentationKey(topic,text));return;}
    const previous=[...shownDocumentation];
    documentation(undefined,true);
    for(const name of ['browser','app'])if(previous.some(key=>key.startsWith(name+':'))){
      const text=documentationTopic(name,nativePlatform);emit('text',{text},documentationKey(name,text));
    }
  },
  initialize:state,
  getState:state,
  listApps:async(options={})=>{const apps=await rpc('listApps');documentation();if(options.emit!==false)display(apps);return apps;},
  listTabs:async(options={})=>{const tabs=await rpc('listTabs',[options]);documentation();if(options.emit!==false)display(tabs);return tabs;},
  listBrowsers,
  browsers:Object.freeze({list:listBrowsers,get:id=>getBrowser({id}),getForUrl:url=>getBrowser({url})}),
  ...(nativePlatform==='win32'?{listWindows:async(options={})=>{const windows=await rpc('listWindows');documentation();if(options.emit!==false)display(windows);return windows;}}:{}),
  getApp:name=>bind('getApp',[name]),
  getTab:(id,options)=>bind('getTab',[id,options]),
  createBrowserTab:(browser,url,options)=>bind('createBrowserTab',[browser,url,options]),
  getBrowser,
});
globalThis.nodeRepl=Object.freeze({write:display,emitImage,cwd:process.cwd(),homeDir:homedir(),tmpDir:tmpdir(),env:Object.freeze({}),get requestMeta(){return scope.getStore()?.requestMeta??null;}});
globalThis.console=Object.freeze(Object.fromEntries(['log','info','warn','error','debug'].map(name=>[name,(...args)=>{
  const execution=scope.getStore();
  if(execution)emit('text',{text:formatLog(args)},undefined,execution);
}])));
const moduleSearchDirectories=[];
for(let directory=dirname(fileURLToPath(import.meta.url));;directory=dirname(directory)){
  const modules=join(directory,'node_modules');
  if(existsSync(modules))moduleSearchDirectories.push(realpathSync(modules));
  if(dirname(directory)===directory)break;
}
kernel.initialize({cua:globalThis.cua,nodeRepl:globalThis.nodeRepl,console:globalThis.console},event=>{
  const execution=scope.getStore();
  if(execution)emit('text',{text:event.text},undefined,execution);
},{moduleSearchDirectories,nativePackageAdapters:[{specifier:'sharp',name:'sharp',version:'0.35.4',entry:fileURLToPath(import.meta.resolve('sharp'))}]});
let busy=false;
process.on('message',message=>{
  if(message.type==='rpc-result'||message.type==='output-result') {
    const request=pending.get(message.id);if(!request)return;pending.delete(message.id);
    if(message.error)request.reject(Object.assign(new Error(message.error.message),{code:message.error.code}));else request.resolve(message.value);
  }
  if(message.type==='execute') {
    if(busy){send({type:'done',execution:message.execution,error:{message:'The previous call is still running.'}});return;}
    busy=true;
    const metadata=message.requestMeta&&typeof message.requestMeta==='object'&&!Array.isArray(message.requestMeta)?freezeMetadata(structuredClone(message.requestMeta)):null;
    const execution={id:message.execution,pendingBackgroundTasks:new Set(),requestMeta:metadata};
    activeExecution=execution;
    nativePlatform=message.nativePlatform??process.platform;
    if(Array.isArray(message.shownDocumentation)){
      shownDocumentation.clear();
      for(const key of message.shownDocumentation)shownDocumentation.add(key);
    }
    scope.run(execution,async()=>{
      let failure;
      try{
        const result=await kernel.execute({id:message.execution,code:message.code,request_meta:metadata,pendingBackgroundTasks:execution.pendingBackgroundTasks});
        if(!result.ok)throw new Error(result.error);
        await drainOperations(execution);
      }catch(error){failure=error;try{await drainOperations(execution);}catch{}}
      finally{busy=false;activeExecution=undefined;}
      send({type:'done',execution:message.execution,...(failure?{error:{message:failure.message??String(failure),code:failure.code}}:{})});
    });
  }
});
let fatalExitScheduled=false;
function fatalRuntimeError(kind,error){
  if(fatalExitScheduled)return;
  fatalExitScheduled=true;
  try{send({type:'fatal',execution:activeExecution?.id,error:{message:`Computer Use JavaScript runtime ${kind}: ${error?.message??String(error)}; the runtime was reset. Catch or handle async errors to avoid terminating the runtime.`,code:'COMPUTER_USE_RUNTIME_FAILURE'}});}catch{}
  setImmediate(()=>process.exit(1));
}
process.on('uncaughtException',error=>fatalRuntimeError('uncaught exception',error));
process.on('unhandledRejection',error=>fatalRuntimeError('unhandled rejection',error));
process.on('disconnect',()=>process.exit());
send({type:'ready'});
