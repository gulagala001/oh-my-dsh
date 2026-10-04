import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';

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
const rpcNames = new Set(['getState', 'listApps', 'listTabs', 'listBrowsers', 'getApp', 'getTab', 'createBrowserTab', 'getBrowser', 'browserViewport', 'browserEmulation', 'browserVisibility', 'browserEmulation']);
const targetNames = new Set(['click','drag','pressKey','scroll','selectText','setValue','typeText','paste','performSecondaryAction','goto','back','forward','reload','close','markDeliverable','markHandoff','getAXState','getScreenshot','getAXStateAndScreenshot','evaluate','waitForLoadState','waitForURL','url','title','dialog.get','dialog.accept','dialog.dismiss','downloads.list','downloads.save','filechooser.setFiles','logs','network.list','network.request','network.responseBody','viewport.set','viewport.reset','emulation.set','emulation.reset','emulation.set','emulation.reset','content.export','pageAssets.list','pageAssets.bundle','webmcp.fetchTools','webmcp.call','capabilities.list']);
const locatorNames = new Set(['click','dblclick','fill','press','type','pressSequentially','check','uncheck','setChecked','selectOption','setInputFiles','hover','scrollIntoViewIfNeeded','focus','blur','count','innerText','textContent','allInnerTexts','allTextContents','inputValue','getAttribute','isVisible','isEnabled','isChecked','boundingBox','ariaSnapshot','waitFor','evaluate','evaluateAll']);
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
  if (c[key] + size <= cap) { c[key] += size; c.blocks.push(block); return true; }
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
  constructor(dispatch, { onStop = async()=>{}, timeoutMs=DEFAULT_COMPUTER_USE_TIMEOUT_MS, nativePlatform=process.platform }={}) {
    this.nativePlatform=nativePlatform;
    this.dispatch=dispatch;this.onStop=onStop;this.timeoutMs=computerUseTimeout(timeoutMs);this.current=null;this.generation=0;
    this.documentationState=new Set();
  }
  async start() {
    if(this.worker && this.worker.connected)return;
    if(this.starting)return this.starting;
    this.starting=new Promise((resolve,reject)=>{
      const worker=fork(new URL('./runtime-worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','pipe','ipc'],execArgv:[],serialization:'advanced'});this.worker=worker;
      worker.stderr.on('data',()=>{});
      const fail=error=>{reject(error);if(this.worker===worker){if(this.current)void this.stop(error).catch(()=>{});else this.worker=null;}};
      worker.on('error',fail);worker.on('exit',()=>fail(new Error('Computer Use JavaScript runtime exited. Bind targets again.')));
      worker.on('message',message=>{
        if(message.type==='ready')resolve();
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
              const files = method === 'content.export' && typeof value === 'string' ? [value]
                : method === 'pageAssets.bundle' && value?.manifestPath ? [value.manifestPath, ...value.assets.map(asset => asset.path)] : [];
              for (const path of files) if (!current.blocks.some(block => block.type === 'file' && block.path === path)) current.blocks.push({ type: 'file', path });
            }
            if(worker.connected && !current.controller.signal.aborted) {
              worker.send({type:'rpc-result',id:message.id,value});
              current.lastReturned=action;
            }
          },error=>{
            current.lastFailed=action;
            if(worker.connected)worker.send({type:'rpc-result',id:message.id,error:{message:error.message,code:error.code}});
          }).finally(()=>{current.pending.delete(operation);current.operations.delete(message.id);});
        }
        if(message.type==='output'&&message.execution===this.current?.execution){
          const current=this.current;
          if(appendOutput(current, message.block) && typeof message.documentationKey==='string') current.documentationState.add(message.documentationKey);
        }
        if(message.type==='done'&&message.execution===this.current?.execution){
          const c=this.current;
          // Unawaited actions must settle in this call, never run invisibly in
          // a future model turn. Rejections are retained even if JS omitted await.
          Promise.allSettled([...c.pending]).then(results=>{const failure=results.find(r=>r.status==='rejected');this.finish(message.execution,message.error?new Error(message.error.message):failure?.reason);});
        }
      });
    }).finally(()=>{this.starting=null;});
    return this.starting;
  }
  async execute(code,{signal,timeoutMs=this.timeoutMs,coordinateFrames,documentationState=this.documentationState}={}) {
    timeoutMs=computerUseTimeout(timeoutMs);
    if(this.stopping)await this.stopping;
    signal?.throwIfAborted();if(this.current)throw new Error('Computer Use is already running in this conversation.');
    const generation=this.generation;
    await this.start();signal?.throwIfAborted();
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
      },timeoutMs);
      this.current={execution,controller,coordinateFrames,documentationState,resolve,reject,blocks:[],textBytes:0,imageBytes:0,pending:new Set(),operations:new Map(),operationSequence:0,cleanup:()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);}};
      signal?.addEventListener('abort',abort,{once:true});
      this.worker.send({type:'execute',execution,code,nativePlatform:this.nativePlatform,shownDocumentation:[...documentationState]});
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
    const current=this.current,worker=this.worker;
    this.worker=null;this.generation++;
    if(current)current.stopping=true;
    if(current)current.controller.abort(reason);
    this.stopping=(async()=>{
      let cleanupError;
      try { await this.onStop(); } catch(error) { cleanupError=error; }
      finally { if(worker){await new Promise(resolve=>{worker.once('exit',resolve);worker.kill('SIGKILL');if(worker.exitCode!==null||worker.signalCode!==null)resolve();});} }
      if(current){
        await Promise.allSettled([...current.pending]);
        const error=cleanupError&&current.timeoutProgress
          ? Object.assign(new Error(`${reason.message}\nCleanup failed: ${cleanupError.message}`),{code:cleanupError.code})
          : cleanupError??reason;
        this.finish(current.execution,error,true);
      }
      if(cleanupError)throw cleanupError;
    })().finally(()=>{this.stopping=null;});
    return this.stopping;
  }
  async reset() { await this.stop(new Error('JavaScript runtime reset')); }
}
