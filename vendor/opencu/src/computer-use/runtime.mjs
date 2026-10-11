import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';

export const DEFAULT_COMPUTER_USE_TIMEOUT_MS = 30000;
export const MAX_COMPUTER_USE_TIMEOUT_MS = 300000;
export function computerUseTimeout(timeoutMs = DEFAULT_COMPUTER_USE_TIMEOUT_MS) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_COMPUTER_USE_TIMEOUT_MS) {
    throw new TypeError(`Computer Use timeoutMs must be an integer between 1 and ${MAX_COMPUTER_USE_TIMEOUT_MS}.`);
  }
  return timeoutMs;
}

// Progress names come only from API method names, never target identities,
// locator selectors or action arguments (which can contain credentials).
const rpcNames = new Set(['getState', 'listApps', 'listWindows', 'listTabs', 'listBrowsers', 'getApp', 'getTab', 'createBrowserTab', 'getBrowser', 'ownedTabs', 'openTabs', 'claimTab', 'browserNameSession', 'browserViewport', 'browserEmulation', 'browserVisibility', 'browserVisibilityGet', 'browserCapabilities', 'browserManagement', 'browserManagementAudit']);
const targetNames = new Set(['click','drag','pressKey','scroll','selectText','setValue','typeText','paste','performSecondaryAction','goto','back','forward','reload','close','markDeliverable','markHandoff','getAXState','getScreenshot','getAXStateAndScreenshot','evaluate','waitForLoadState','waitForURL','waitForTimeout','url','title','dialog.get','dialog.accept','dialog.dismiss','downloads.list','downloads.save','filechooser.setFiles','logs','network.list','network.request','network.responseBody','clipboard.readText','clipboard.writeText','clipboard.read','clipboard.write','viewport.set','viewport.reset','emulation.set','emulation.reset','content.export','content.exportGsuite','content.exportYouTubeTranscript','pageAssets.list','pageAssets.bundle','webmcp.fetchTools','webmcp.call','capabilities.list']);
const locatorNames = new Set(['click','dblclick','fill','press','type','pressSequentially','check','uncheck','setChecked','selectOption','setInputFiles','hover','scrollIntoViewIfNeeded','focus','blur','count','innerText','textContent','allInnerTexts','allTextContents','inputValue','getAttribute','isVisible','isEnabled','isChecked','boundingBox','ariaSnapshot','waitFor','evaluate','evaluateAll']);
for(const name of ['cdp.send','cdp.readEvents','browserAuth.request','botDetection.report','waitForEvent','download.path','fileChooser.setFiles','cua.downloadMedia','dom_cua.downloadMedia','playwright.domSnapshot'])targetNames.add(name);
locatorNames.add('downloadMedia');
function operationName(method, args) {
  if (method !== 'target') return rpcNames.has(method) ? `cua.${method}` : 'Computer Use operation';
  if (args?.[1] === 'locator') return locatorNames.has(args?.[2]?.[1]) ? `target.playwright.${args[2][1]}` : 'target.playwright operation';
  return targetNames.has(args?.[1]) ? `target.${args[1]}` : 'target operation';
}
function executionProgress(current) {
  return { lastReturned: current.lastReturned ?? null, lastFailed: current.lastFailed ?? null,
    inFlight: [...current.operations.values()].map(operation => ({ ...operation })) };
}
function timeoutMessage(timeoutMs, progress) {
  const describe = operation => operation ? `#${operation.sequence} ${operation.method}` : 'none';
  const active = progress.inFlight.slice(0, 16).map(describe).join(', ');
  return `Computer Use exceeded ${timeoutMs} ms; the runtime was reset.`
    + `\nLast successfully returned operation: ${describe(progress.lastReturned)}.`
    + `\nLast failed operation: ${describe(progress.lastFailed)}.`
    + `\nIn-flight operations at timeout: ${active || 'none (JavaScript was still running)'}${progress.inFlight.length > 16 ? `, and ${progress.inFlight.length - 16} more` : ''}.`
    + '\nA returned operation does not verify the intended UI result. Failed or interrupted operations may have partially changed the UI; observe the current state before continuing.';
}

function appendOutput(c, block) {
  const size = block.type === 'text' ? Buffer.byteLength(block.text) : Buffer.byteLength(block.data, 'base64');
  const cap = block.type === 'text' ? 48000 : 16000000;
  const key = block.type === 'text' ? 'textBytes' : 'imageBytes';
  if (c[key] + size <= cap) {
    c[key] += size;
    if(block.type==='text'&&block.itemId!==undefined){
      const existing=c.outputItems.get(block.itemId);
      if(existing)existing.text+=block.text;
      else{const item={type:'text',text:block.text};c.outputItems.set(block.itemId,item);c.blocks.push(item);}
    }else c.blocks.push(block);
    return true;
  }
  else if (!c.truncated) {
    c.truncated = true;
    if (block.type === 'text') {
      const remaining = Math.max(0, cap - c[key] - 320);
      const prefix = new TextDecoder().decode(Buffer.from(block.text).subarray(0, remaining), { stream: true });
      if (prefix) { c.textBytes += Buffer.byteLength(prefix); c.blocks.push({ type: 'text', text: prefix }); }
    }
    c.blocks.push({ type: 'text', text: '[Computer Use output truncated. For more AX text, use const state = await target.getAXState({emit:false,disableDiffing:true}), then nodeRepl.write(state.slice(start,end)) for the needed range.]' });
  }
  return false;
}

export class ComputerRuntime {
  constructor(dispatch, { onStop = async()=>{}, timeoutMs=DEFAULT_COMPUTER_USE_TIMEOUT_MS, nativePlatform=process.platform, cwd=process.cwd() }={}) {
    this.nativePlatform=nativePlatform;
    this.cwd=cwd;
    this.dispatch=dispatch;this.onStop=onStop;this.timeoutMs=computerUseTimeout(timeoutMs);this.current=null;this.generation=0;
    this.documentationState=new Set();
  }
  async start() {
    if(this.starting)return this.starting;
    if(this.worker?.connected&&this.workerReady)return;
    this.starting=new Promise((resolve,reject)=>{
      const worker=fork(new URL('./runtime-worker.mjs',import.meta.url),[this.nativePlatform],{cwd:this.cwd,stdio:['ignore','ignore','pipe','ipc'],execArgv:['--experimental-vm-modules'],serialization:'advanced'});this.worker=worker;
      this.workerReady=false;
      worker.stderr.on('data',()=>{});
      const fail=error=>{reject(error);if(this.worker===worker)void this.stop(error).catch(()=>{});};
      worker.on('error',fail);worker.on('exit',()=>fail(new Error('Computer Use JavaScript runtime exited. Bind targets again.')));
      worker.on('message',message=>{
        if(message.type==='ready'&&this.worker===worker){this.workerReady=true;resolve();}
        if(message.type==='fatal'&&this.worker===worker){void this.stop(Object.assign(new Error(message.error.message),{code:message.error.code})).catch(()=>{});return;}
        if(message.type==='rpc'){
          const current=this.current;
          if(!current||message.execution!==current.execution||current.controller.signal.aborted){worker.send({type:'rpc-result',id:message.id,error:{message:'This tool call has ended. Late actions are cancelled.'}});return;}
          const action={sequence:++current.operationSequence,method:operationName(message.method,message.args)};
          current.operations.set(message.id,action);
          const operation=Promise.resolve().then(()=>{
            current.controller.signal.throwIfAborted();
            return this.dispatch(message.method,message.args,current.controller.signal,current.coordinateFrames);
          });
          current.pending.add(operation);
          operation.then(value=>{
            if (this.current === current && !current.controller.signal.aborted && message.method === 'target') {
              const method = message.args[1];
              if (['dialog.accept', 'dialog.dismiss'].includes(method) && value?.dialogHandled && value?.triggeringActionError) {
                const text = 'Dialog handled successfully. The earlier triggering action failed: ' + String(value.triggeringActionError.message).slice(0, 8000) + '\nDo not answer the same dialog again or assume the triggering action completed. Observe the current page before deciding the next action.';
                appendOutput(current, { type: 'text', text });
              }
              const fileResult=['content.export','content.exportGsuite','content.exportYouTubeTranscript','download.path'].includes(method)||method==='locator'&&message.args[2]?.[1]==='downloadMedia';
              const files = fileResult && typeof value === 'string' ? [value]
                : method === 'downloads.save' && typeof value?.path === 'string' ? [value.path]
                : method === 'pageAssets.bundle' && value?.manifestPath ? [value.manifestPath, ...value.assets.map(asset => asset.path)] : [];
              for (const path of files) if (!current.blocks.some(block => block.type === 'file' && block.path === path)) current.blocks.push({ type: 'file', path });
            }
            if(worker.connected && !current.controller.signal.aborted) {
              worker.send({type:'rpc-result',id:message.id,value});
              current.lastReturned=action;
            }
          },error=>{
            current.lastFailed=action;
            if(worker.connected&&!current.controller.signal.aborted)worker.send({type:'rpc-result',id:message.id,error:{message:error.message??String(error),code:error.code}});
          }).finally(()=>{current.pending.delete(operation);current.operations.delete(message.id);});
        }
        if(message.type==='output'){
          const current=this.current;
          const active=current&&message.execution===current.execution&&!current.controller.signal.aborted;
          const accepted=active&&appendOutput(current,message.block);
          if(accepted&&typeof message.documentationKey==='string')current.documentationState.add(message.documentationKey);
          if(message.id!==undefined&&worker.connected)worker.send({type:'output-result',id:message.id,...(accepted?{}:{error:{message:active?'Computer Use image output exceeded the output budget and was not attached.':'This tool call has ended. Late output is cancelled.'}})});
        }
        if(message.type==='done'&&message.execution===this.current?.execution){
          const c=this.current;
          // The worker drains its tracked operations and distinguishes handled
          // errors. Wait for host bookkeeping before releasing this call.
          (async()=>{
            while(c.pending.size)await Promise.allSettled([...c.pending]);
            this.finish(message.execution,message.error?Object.assign(new Error(message.error.message),{code:message.error.code}):undefined);
          })();
        }
      });
    }).finally(()=>{this.starting=null;});
    return this.starting;
  }
  async execute(code,{signal,timeoutMs=this.timeoutMs,coordinateFrames,documentationState=this.documentationState,requestMeta,cwd=this.cwd}={}) {
    timeoutMs=computerUseTimeout(timeoutMs);
    if(typeof code!=='string'||!code.trim())throw new TypeError('Computer Use requires non-empty JavaScript source.');
    if(typeof cwd!=='string'||!isAbsolute(cwd))throw new TypeError('Computer Use cwd must be an absolute directory path.');
    if(this.stopping)await this.stopping;
    signal?.throwIfAborted();if(this.current)throw new Error('Computer Use is already running in this conversation.');
    if(cwd!==this.cwd){if(this.worker||this.starting)await this.reset();this.cwd=cwd;signal?.throwIfAborted();}
    const generation=this.generation;
    const startupStartedAt=Date.now();
    let startupFailure;
    const startupAbort=()=>{startupFailure=signal?.reason??new Error(`Computer Use exceeded ${timeoutMs} ms during runtime startup; the runtime was reset.`);void this.stop(startupFailure).catch(()=>{});};
    const startupTimer=setTimeout(startupAbort,timeoutMs);
    signal?.addEventListener('abort',startupAbort,{once:true});
    try { await this.start();signal?.throwIfAborted(); }
    catch(error){if(this.stopping)await this.stopping.catch(()=>{});throw startupFailure??(signal?.aborted?signal.reason:error);}
    finally{clearTimeout(startupTimer);signal?.removeEventListener('abort',startupAbort);}
    if(generation!==this.generation)throw new Error('Computer Use was stopped during startup. Bind targets again.');
    if(this.current)throw new Error('Computer Use is already running in this conversation.');
    const execution=randomUUID(),controller=new AbortController();
    return new Promise((resolve,reject)=>{
      const abort=()=>{void this.stop(signal?.reason??new Error('Computer Use stopped')).catch(()=>{});};
      const timer=setTimeout(()=>{
        const current=this.current;
        if(!current || current.execution!==execution || current.stopping)return;
        current.timeoutProgress=executionProgress(current);
        void this.stop(new Error(timeoutMessage(timeoutMs,current.timeoutProgress))).catch(()=>{});
      },Math.max(1,timeoutMs-(Date.now()-startupStartedAt)));
      this.current={execution,controller,coordinateFrames,documentationState,resolve,reject,blocks:[],outputItems:new Map(),textBytes:0,imageBytes:0,pending:new Set(),operations:new Map(),operationSequence:0,cleanup:()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);}};
      signal?.addEventListener('abort',abort,{once:true});
      this.worker.send({type:'execute',execution,code,nativePlatform:this.nativePlatform,shownDocumentation:[...documentationState],requestMeta},error=>{if(error)void this.stop(error).catch(()=>{});});
    });
  }
  finish(execution,error,afterStop=false) {
    const current=this.current;if(!current||current.execution!==execution)return;
    if(current.stopping&&!afterStop)return;
    this.current=null;current.cleanup();
    current.resolve({blocks:current.blocks,error:error?{message:error.message,code:error.code}:undefined,...(current.timeoutProgress?{progress:current.timeoutProgress}:{})});
  }
  async stop(reason=new Error('Stopped by user')) {
    if(this.stopping)return this.stopping;
    if(!(reason instanceof Error))reason=new Error(String(reason));
    let resolveStop,rejectStop;
    const stopping=new Promise((resolve,reject)=>{resolveStop=resolve;rejectStop=reject;});
    this.stopping=stopping;
    const current=this.current,worker=this.worker;
    this.worker=null;this.workerReady=false;this.generation++;
    if(current)current.stopping=true;
    if(current)current.controller.abort(reason);
    void(async()=>{
      let cleanupError;
      const terminated=worker?new Promise(resolve=>{
        if(worker.exitCode!==null||worker.signalCode!==null){resolve();return;}
        worker.once('exit',resolve);
        worker.kill('SIGKILL');
      }):Promise.resolve();
      try { await this.onStop(); } catch(error) { cleanupError=error; }
      finally { await terminated; }
      if(current){
        await Promise.allSettled([...current.pending]);
        const error=cleanupError&&current.timeoutProgress
          ? Object.assign(new Error(`${reason.message}\nCleanup failed: ${cleanupError.message}`),{code:cleanupError.code})
          : cleanupError??reason;
        this.finish(current.execution,error,true);
      }
      if(cleanupError)throw cleanupError;
    })().then(resolveStop,rejectStop);
    try{return await stopping;}finally{if(this.stopping===stopping)this.stopping=null;}
  }
  async reset() { await this.stop(new Error('JavaScript runtime reset')); }
}
