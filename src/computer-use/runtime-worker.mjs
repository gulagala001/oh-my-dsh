import inspector from 'node:inspector';
import { AsyncLocalStorage } from 'node:async_hooks';
import { inspect } from 'node:util';
import { createHash } from 'node:crypto';
import { CORE_DOCUMENTATION, BROWSER_DOCUMENTATION, APP_DOCUMENTATION } from './api-docs.mjs';

const scope = new AsyncLocalStorage(), pending = new Map(); let sequence = 0;
const send = message => { if (process.connected) process.send(message); };
const rpc = (method, args = []) => {
  const execution = scope.getStore();
  if (!execution) return Promise.reject(new Error('Computer Use operations must run inside the current tool call.'));
  const id = ++sequence;
  return new Promise((resolve,reject) => {
    pending.set(id,{resolve,reject});
    try { send({type:'rpc',id,execution,method,args}); }
    catch(error) { pending.delete(id); reject(error); }
  });
};
const emit = (type, value) => send({ type:'output', execution:scope.getStore(), block:{type,...value} });
const display = value => emit('text',{text:typeof value==='string'?value:inspect(value,{depth:8,maxArrayLength:100,maxStringLength:24000,breakLength:100})});
const shownDocumentation=new Set();
function documentation(kind){
  for(const name of ['core',kind].filter(Boolean))if(!shownDocumentation.has(name)){
    display(name==='core'?CORE_DOCUMENTATION:name==='browser'?BROWSER_DOCUMENTATION:APP_DOCUMENTATION);
    shownDocumentation.add(name);
  }
}
const captures = new WeakMap(), digest = data => createHash('sha256').update(data).digest('hex');
const emitImage = async data => {
  if (typeof data==='string' && data.startsWith('data:image/')) { emit('image',{data:data.split(',')[1],mediaType:data.slice(5,data.indexOf(';'))});return; }
  if (!(data instanceof Uint8Array)) throw new Error('emitImage requires image bytes or an image data URL.');
  const capture = captures.get(data);
  emit('image',{data:Buffer.from(data).toString('base64'),mediaType:'image/png',...(capture?.digest===digest(data)?{capture:capture.info}:{})});
};
const locatorMethods=['locator','getByRole','getByText','getByLabel','getByPlaceholder','getByTestId','getByAltText','getByTitle','frameLocator','filter','nth','first','last'];
const locatorActions=['click','dblclick','fill','press','type','pressSequentially','check','uncheck','setChecked','selectOption','setInputFiles','hover','scrollIntoViewIfNeeded','focus','blur','count','innerText','textContent','allInnerTexts','allTextContents','inputValue','getAttribute','isVisible','isEnabled','isChecked','boundingBox','ariaSnapshot','waitFor','evaluate','evaluateAll'];
const locatorInfo=new WeakMap();
function locator(target,chain=[]) {
  const result={};
  for(const method of locatorMethods) result[method]=(...args)=>{
    const index=method==='filter'?0:method==='locator'?1:-1;
    if(index>=0&&args[index]){
      const options={...args[index]};
      for(const key of ['has','hasNot'])if(options[key]!==undefined){
        const nested=locatorInfo.get(options[key]);
        if(!nested)throw new TypeError(key+' requires a Playwright locator');
        if(nested.target.id!==target.id||nested.target.browserId!==target.browserId)throw new Error('Nested locators must belong to the same browser tab.');
        options[key]={$locator:{id:target.id,chain:nested.chain}};
      }
      args[index]=options;
    }
    return locator(target,[...chain,{method,args}]);
  };
  for(const method of locatorActions) result[method]=(...args)=>rpc('target',[target,'locator',[chain,method,args.map(value=>typeof value==='function'?{$function:value.toString()}:value)]]);
  locatorInfo.set(result,{target,chain});
  return result;
}
function target(info) {
  const result={id:info.id,kind:info.kind,browserId:info.browserId};
  for(const method of ['click','drag','pressKey','scroll','selectText','setValue','typeText','paste','performSecondaryAction','goto','back','forward','reload','close','markDeliverable','markHandoff']) result[method]=(...args)=>rpc('target',[info,method,args]);
  for(const method of ['getAXState','getScreenshot','getAXStateAndScreenshot']) result[method]=async(options={})=>{
    const response=await rpc('target',[info,method,[options]]);
    const bytes=response.screenshot?new Uint8Array(Buffer.from(response.screenshot,'base64')):undefined;
    if(bytes) {
      const png=Buffer.from(bytes);
      if(png.length>=24&&png.readUInt32BE(0)===0x89504e47)captures.set(bytes,{digest:digest(bytes),info:{target:info,width:png.readUInt32BE(16),height:png.readUInt32BE(20),...(response.screenshotFrame?{geometry:response.screenshotFrame}:{})}});
    }
    if(options.emit!==false){if(response.state)display(response.state);if(bytes)await emitImage(bytes);if(response.retention==='temporary')display('This is a temporary tab: it will close when this turn ends. If the user needs the open page or asked to keep it, call await tab.markDeliverable() on this tab before replying. Use markHandoff() for an unfinished task.');}
    return method==='getAXState'?response.state:method==='getScreenshot'?bytes:{state:response.state,screenshot:bytes};
  };
  if(info.kind==='tab') {
    result.playwright=locator(info);
    result.playwright.domSnapshot=()=>result.getAXState({disableDiffing:true});
    result.playwright.evaluate=(expression,arg)=>rpc('target',[info,'evaluate',[typeof expression==='function'?{$function:expression.toString()}:expression,arg]]);
    for(const method of ['waitForLoadState','waitForURL'])result.playwright[method]=(...args)=>rpc('target',[info,method,args]);
    for(const method of ['url','title'])result[method]=()=>rpc('target',[info,method]);
    result.dialog={get:()=>rpc('target',[info,'dialog.get']),accept:text=>rpc('target',[info,'dialog.accept',[text]]),dismiss:()=>rpc('target',[info,'dialog.dismiss'])};
    result.downloads={list:()=>rpc('target',[info,'downloads.list']),save:(id,path)=>rpc('target',[info,'downloads.save',[id,path]])};
    result.filechooser={setFiles:files=>rpc('target',[info,'filechooser.setFiles',[files]])};
    result.dev={logs:()=>rpc('target',[info,'logs'])};
    result.viewport={set:size=>rpc('target',[info,'viewport.set',[size]]),reset:()=>rpc('target',[info,'viewport.reset'])};
    result.screenshot=(options={})=>result.getScreenshot({...options,emit:false});
    result.content=Object.freeze({export:()=>rpc('target',[info,'content.export'])});
    const pageAssets=Object.freeze({list:()=>rpc('target',[info,'pageAssets.list']),bundle:options=>rpc('target',[info,'pageAssets.bundle',[options]])});
    const webmcp=Object.freeze({fetchTools:async()=>{const fetched=await rpc('target',[info,'webmcp.fetchTools']);return Object.freeze({description:()=>fetched.description,call:(name,input={})=>rpc('target',[info,'webmcp.call',[fetched.handle,name,input]])});}});
    result.capabilities=Object.freeze({list:()=>rpc('target',[info,'capabilities.list']),get:async id=>{if(id==='pageAssets')return pageAssets;if(id==='webmcp')return webmcp;throw new Error('Tab capability is not available: '+id);}});
  }
  return Object.freeze(result);
}
const bind=async(method,args)=>{const info=await rpc(method,args);documentation(info.kind==='tab'?'browser':'app');const bound=target(info);await bound.getAXState({disableDiffing:true});return bound;};
function browserTarget(info){
  const viewport=Object.freeze({set:size=>rpc('browserViewport',[info.id,size]),reset:()=>rpc('browserViewport',[info.id,null])});
  return Object.freeze({...info,browserId:info.id,documentation:async()=>BROWSER_DOCUMENTATION,
    capabilities:Object.freeze({list:async()=>[{id:'viewport',description:'Temporary viewport sizes for this task’s controlled tabs.'}],get:async id=>{if(id!=='viewport')throw new Error('Browser capability is not available: '+id);return viewport;}}),
    tabs:{list:()=>rpc('listTabs',[{browser:info.id}]),get:id=>bind('getTab',[id,{browser:info.id}]),new:()=>bind('createBrowserTab',[info.id,'about:blank'])}});
}
globalThis.cua=Object.freeze({
  getState:async(options={})=>{const state=await rpc('getState');documentation();if(options.emit!==false)display(state);return state;},
  listApps:async(options={})=>{const apps=await rpc('listApps');documentation();if(options.emit!==false)display(apps);return apps;},
  listTabs:async(options={})=>{const tabs=await rpc('listTabs',[options]);documentation();if(options.emit!==false)display(tabs);return tabs;},
  listBrowsers:async(options={})=>{const browsers=await rpc('listBrowsers');documentation();if(options.emit!==false)display(browsers);return browsers;},
  getApp:name=>bind('getApp',[name]),
  getTab:(id,options)=>bind('getTab',[id,options]),
  createBrowserTab:(browser,url,options)=>bind('createBrowserTab',[browser,url,options]),
  getBrowser:async(options)=>{const info=await rpc('getBrowser',[options]);documentation('browser');display(info);return browserTarget(info);},
});
globalThis.nodeRepl=Object.freeze({write:display,emitImage});
globalThis.console=Object.freeze({log:(...args)=>display(args.map(v=>typeof v==='string'?v:inspect(v)).join(' ')),error:(...args)=>display(args.join(' ')),warn:(...args)=>display(args.join(' '))});
const session=new inspector.Session();session.connect();
const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,value)=>error?reject(error):resolve(value)));
await post('Runtime.enable');
let busy=false;
process.on('message',message=>{
  if(message.type==='rpc-result') {
    const request=pending.get(message.id);if(!request)return;pending.delete(message.id);
    if(message.error)request.reject(Object.assign(new Error(message.error.message),{code:message.error.code}));else request.resolve(message.value);
  }
  if(message.type==='execute') {
    if(busy){send({type:'done',execution:message.execution,error:{message:'The previous call is still running.'}});return;}
    busy=true;
    scope.run(message.execution,async()=>{
      try{
        const result=await post('Runtime.evaluate',{expression:message.code,replMode:true,awaitPromise:true,returnByValue:false,objectGroup:message.execution});
        if(result.exceptionDetails){
          const detail=result.exceptionDetails;
          if(detail.exception?.className==='SyntaxError')throw new Error(`${detail.exception.description.split('\n')[0]} (line ${detail.lineNumber+1}, column ${detail.columnNumber+1}).`);
          throw new Error(detail.exception?.description??detail.text);
        }
        send({type:'done',execution:message.execution});
      }catch(error){send({type:'done',execution:message.execution,error:{message:error.message}});}
      finally{await post('Runtime.releaseObjectGroup',{objectGroup:message.execution}).catch(()=>{});busy=false;}
    });
  }
});
process.on('disconnect',()=>process.exit());
send({type:'ready'});
