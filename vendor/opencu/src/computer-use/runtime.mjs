import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export class ComputerRuntime {
  constructor(dispatch, { onStop = async()=>{}, timeoutMs=30000 }={}) {
    this.dispatch=dispatch;this.onStop=onStop;this.timeoutMs=timeoutMs;this.current=null;this.generation=0;
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
          const operation=Promise.resolve().then(()=>this.dispatch(message.method,message.args,current.controller.signal,current.coordinateFrames));
          current.pending.add(operation);
          operation.then(value=>{
            if (this.current === current && !current.controller.signal.aborted && message.method === 'target') {
              const method = message.args[1];
              const files = method === 'content.export' && typeof value === 'string' ? [value]
                : method === 'pageAssets.bundle' && value?.manifestPath ? [value.manifestPath, ...value.assets.map(asset => asset.path)] : [];
              for (const path of files) if (!current.blocks.some(block => block.type === 'file' && block.path === path)) current.blocks.push({ type: 'file', path });
            }
            if(worker.connected)worker.send({type:'rpc-result',id:message.id,value});
          },error=>{if(worker.connected)worker.send({type:'rpc-result',id:message.id,error:{message:error.message,code:error.code}});}).finally(()=>current.pending.delete(operation));
        }
        if(message.type==='output'&&message.execution===this.current?.execution){
          const c=this.current;
          const size=message.block.type==='text'?Buffer.byteLength(message.block.text):Buffer.byteLength(message.block.data,'base64');
          const cap=message.block.type==='text'?48000:16000000;
          const key=message.block.type==='text'?'textBytes':'imageBytes';
          if(c[key]+size<=cap){c[key]+=size;c.blocks.push(message.block);}else if(!c.truncated){
            c.truncated=true;
            if(message.block.type==='text'){
              const remaining=Math.max(0,cap-c[key]-320);
              const prefix=new TextDecoder().decode(Buffer.from(message.block.text).subarray(0,remaining),{stream:true});
              if(prefix){c.textBytes+=Buffer.byteLength(prefix);c.blocks.push({type:'text',text:prefix});}
            }
            c.blocks.push({type:'text',text:'[Computer Use output truncated. For more AX text, use const state = await target.getAXState({emit:false,disableDiffing:true}), then nodeRepl.write(state.slice(start,end)) for the needed range.]'});
          }
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
  async execute(code,{signal,timeoutMs=this.timeoutMs,coordinateFrames}={}) {
    if(this.stopping)await this.stopping;
    signal?.throwIfAborted();if(this.current)throw new Error('Computer Use is already running in this conversation.');
    const generation=this.generation;
    await this.start();signal?.throwIfAborted();
    if(generation!==this.generation)throw new Error('Computer Use was stopped during startup. Bind targets again.');
    if(this.current)throw new Error('Computer Use is already running in this conversation.');
    const execution=randomUUID(),controller=new AbortController();
    return new Promise((resolve,reject)=>{
      const abort=()=>{void this.stop(signal?.reason??new Error('Computer Use stopped')).catch(()=>{});};
      const timer=setTimeout(()=>{void this.stop(new Error(`Computer Use exceeded ${timeoutMs} ms; the runtime was reset.`)).catch(()=>{});},timeoutMs);
      this.current={execution,controller,coordinateFrames,resolve,reject,blocks:[],textBytes:0,imageBytes:0,pending:new Set(),cleanup:()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);}};
      signal?.addEventListener('abort',abort,{once:true});
      this.worker.send({type:'execute',execution,code});
    });
  }
  finish(execution,error,afterStop=false) {
    const current=this.current;if(!current||current.execution!==execution)return;
    if(current.stopping&&!afterStop)return;
    this.current=null;current.cleanup();
    current.resolve({blocks:current.blocks,error:error?{message:error.message,code:error.code}:undefined});
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
      if(current){await Promise.allSettled([...current.pending]);this.finish(current.execution,cleanupError??reason,true);}
      if(cleanupError)throw cleanupError;
    })().finally(()=>{this.stopping=null;});
    return this.stopping;
  }
  async reset() { await this.stop(new Error('JavaScript runtime reset')); }
}
