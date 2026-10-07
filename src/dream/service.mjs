import { BlockAssembler } from '@deepseek-ai/dsh-llm';
import { DreamStore } from './store.mjs';
import { DreamSources } from './sources.mjs';
import { digest, nodeKey, LIMITS, estimateTokens, validateMemory, validateScope } from './core.mjs';
import { DREAM_SYSTEM, DREAM_TOOL, DREAM_PROMPT_VERSION } from './prompts.mjs';
import {setTimeout as delay} from 'node:timers/promises';

class BudgetWait extends Error { constructor(){super('Dream 每日额度不足，已保存进度');this.budget=true;} }
export class DreamService {
  constructor(hub, { store, sources, generate } = {}) {
    this.hub=hub;this.store=store||new DreamStore(hub.store.dir);this.sources=sources||new DreamSources(hub,this.store);
    this.generateOverride=generate;this.closed=false;this.draining=null;this.controller=null;this.timer=null;this.epoch=null;
    this.lifecycle=new AbortController();this.ready=null;this.ticking=null;this.closing=null;
  }
  config(){return this.hub.config();}
  route(agent) {
    const c=this.config(),configured=c.backgroundMode==='separate'?c.background:c.unifiedBackground;
    const provider=c.dreamProvider||configured?.provider,model=c.dreamModel||configured?.model;
    if(provider&&model)return {provider,model,effort:configured?.effort||'off',temperature:configured?.temperature};
    if(agent)return this.hub.route(agent,'prepare');
    return null;
  }
  start(){return this.ready??=this.initialize();}
  async initialize(){
    if(this.closed)return;
    try{await this.sources.sync(this.lifecycle.signal);if(!this.closed)this.store.setMeta('indexError',null);}catch(e){if(!this.closed)this.store.setMeta('indexError',e.message);}
    if(this.closed)return;
    this.timer=setInterval(()=>{void this.tick().catch(e=>this.notice(e));},30000);this.timer.unref?.();
    await this.tick();
  }
  notice(error){if(!this.closed)this.store.setMeta('lastError',String(error?.message||error));}
  async enqueue(scope,target,agent){
    this.lifecycle.signal.throwIfAborted();
    validateScope(scope);
    if(scope!=='global'&&(typeof target!=='string'||!target))throw Error('请选择要整理的会话或项目');
    const route=this.route(agent);
    if(!route?.provider||!route.model)throw Error('请在自动 Dream 设置中选择固定后台模型，或在当前会话中手动运行');
    await this.sources.sync(this.lifecycle.signal);
    this.lifecycle.signal.throwIfAborted();
    if(scope==='session'&&!this.store.session(target))await this.sources.inspect(target,this.lifecycle.signal);
    this.lifecycle.signal.throwIfAborted();
    if(scope==='project'&&!this.store.projects().includes(target))throw Error('当前项目没有可共享的会话');
    const job=this.store.enqueue(scope,scope==='global'?'global':target,false,{route});
    void this.drain().catch(e=>this.notice(e));return job;
  }
  pause(id){
    const next=this.store.updateJobIf(id,['queued','running','budget'],{state:'paused',notice:'用户已停止；保留已完成部分'});
    if(next.state==='paused'&&this.activeJob===id)this.controller?.abort(Error('用户已停止 Dream'));
    return next;
  }
  resume(id,agent){
    const job=this.store.job(id);if(!job)throw Error('Dream 作业不存在');
    if(['complete','running','queued'].includes(job.state))return job;
    const route=this.route(agent)||job.route;if(!route?.provider||!route.model)throw Error('请先配置 Dream 模型');
    const next=this.store.updateJobIf(id,['paused','failed','budget'],{state:'queued',error:null,route});void this.drain().catch(e=>this.notice(e));return next;
  }
  tick(){if(this.ticking)return this.ticking;return this.ticking=this.checkQueue().finally(()=>{this.ticking=null;});}
  async checkQueue(){
    if(this.closed||this.draining)return;
    const c=this.config(),now=Date.now();
    this.store.prune();
    this.store.resumeDueJobs(now);
    if(c.dreamAutoEnabled&&now>=(this.store.meta('nextAutoAt')||0)){
      const route=this.route();
      if(route?.provider&&route.model){
        await this.sources.sync(this.lifecycle.signal);if(this.closed)return;
        this.store.enqueue('global','global',true,{route});
        this.store.setMeta('autoNotice',null);
      }else this.store.setMeta('autoNotice','自动 Dream 等待固定后台模型');
      this.store.setMeta('nextAutoAt',now+(c.dreamIntervalMs||3600000));
    }
    await this.drain();
  }
  async drain(){
    if(this.closed||this.draining)return this.draining;
    const epoch=this.store.acquire();if(epoch==null)return;
    this.epoch=epoch;
    this.draining=(async()=>{
      this.store.recover(epoch);
      const heartbeat=setInterval(()=>{if(!this.store.renew(epoch))this.controller?.abort(Error('Dream 执行租约失效'));},15000);heartbeat.unref?.();
      try{
        for(let job;!this.closed&&(job=this.store.claimJob(epoch));){
          this.activeJob=job.id;this.controller=new AbortController();
          try{
            await this.runJob(job,this.controller.signal);
            const skipped=(this.store.meta('indexWarnings')||[]).filter(item=>item.scope!=='session'&&(job.scope==='global'||job.scope==='project'&&item.project===job.target)).length;
            this.store.settleJob(job.id,{state:'complete',notice:skipped?`已整理可读取范围；${skipped} 个会话日志异常，未参与本次汇总`:'本次范围已整理；未到时长的下层资料继续保留'},epoch);
          }catch(error){
            this.store.settleJob(job.id,{state:this.closed?'queued':error.budget?'budget':'failed',error:error.message,...(error.budget?{resumeAt:this.store.usage().resetsAt}:{})},epoch);
          }finally{this.activeJob=null;this.controller=null;}
        }
      }finally{clearInterval(heartbeat);this.store.release(epoch);this.epoch=null;}
    })().finally(()=>{this.draining=null;});return this.draining;
  }
  async runJob(job,signal){
    await this.sources.sync(signal);
    if(!job.targetsReady){
      const projects=job.scope==='global'?this.store.projects():job.scope==='project'?[job.target]:[];
      const sessions=job.scope==='session'?[job.target]:projects.flatMap(project=>this.store.sessions({project,shared:true}).map(s=>s.id));
      this.store.setTargets(job.id,[...sessions.map(target=>({kind:'session',target})),...projects.map(target=>({kind:'project',target})),...(job.scope==='global'?[{kind:'global',target:'global'}]:[])],this.epoch);
    }
    // Source manifests are fixed at each session's first admission; successful
    // progress is durable across job retries, pause and process replacement.
    for(let target;(target=this.store.nextTarget(job.id));){
      signal.throwIfAborted();
      // Persisted job targets may predate a format refusal discovered by this
      // scan. Shared jobs must withdraw that source and continue their scope.
      if(target.kind==='session') {
        if(job.scope==='session'||this.store.session(target.target)?.available!==false) {
          try { await this.updateSession(target.target,job,signal,target); }
          catch(error) {
            if(job.scope==='session'||!this.sources.excludeUnreadable(target.target,error,signal))throw error;
          }
        }
      } else await this.updateParent(target.kind,target.target,job,signal);
      this.store.finishTarget(job.id,target.ordinal,this.epoch);
    }
  }
  async updateSession(id,job,signal,target){
    const stamp=this.sources.stamp(id,this.config().dreamDeepAgeMs??604800000);
    if(stamp&&this.store.meta('scan:'+id)===stamp)return;
    const manifest=await this.sources.manifest(id,{signal,deepAgeMs:this.config().dreamDeepAgeMs??604800000,cut:target?.cut,before:job.createdAt});
    if(target&&!target.cut)this.store.pinTarget(job.id,target.ordinal,{through:manifest.through,generation:manifest.metadata.generation},this.epoch);
    if(job.scope!=='session'&&!manifest.metadata.shared)return;
    const key=nodeKey('session',id);
    const items=manifest.items.filter(x=>this.store.consumed(key,x.key)!==x.fingerprint);
    await this.batches('session',id,items,job,signal,async batch=>{
      await this.sources.validateBatch(manifest.metadata,batch,signal);
    });
    if(manifest.completeCut&&stamp&&stamp===this.sources.stamp(id,this.config().dreamDeepAgeMs??604800000))this.store.tx(()=>{this.store.requireJob(job.id,this.epoch);this.store.setMeta('scan:'+id,stamp);});
  }
  async updateParent(kind,target,job,signal){
    const key=nodeKey(kind,target),children=kind==='project'?this.store.sessions({project:target,shared:true}).map(s=>({key:nodeKey('session',s.id),title:s.title})):this.store.projects().map(p=>({key:nodeKey('project',p),title:this.sources.projectTitle(p)}));
    const current=new Map(children.map(c=>[c.key,{...c,memory:this.store.memory(c.key)}]).filter(([,c])=>c.memory&&!c.memory.invalid));
    const progress=this.store.progress(key),previousInputs=new Map(progress.map(p=>[p.source,p]));
    const items=[];
    for(const [child,c]of current){
      const fingerprint=String(c.memory.revision);if(this.store.consumed(key,child)===fingerprint)continue;
      const source={id:c.memory.ref,kind:'memory',key:child,revision:c.memory.revision};
      const before=previousInputs.get(child);
      items.push({key:child,fingerprint,source,text:`${c.title} · ${child} · revision ${fingerprint}${before?` (replaces revision ${before.fingerprint})`:''}\n${c.memory.summary}`});
    }
    for(const old of progress)if(!current.has(old.source)&&old.fingerprint!=='withdrawn'){
      const source={id:`withdrawn:${digest([key,old.source,old.fingerprint])}`,kind:'withdrawn',key:old.source};
      items.push({key:old.source,fingerprint:'withdrawn',source,text:`Source ${old.source} is no longer shared/available. Remove its contribution; do not infer replacement facts.`});
    }
    await this.batches(kind,target,items,job,signal,async batch=>{
      await this.sources.sync(signal);
      const allowed=new Set(kind==='project'?this.store.sessions({project:target,shared:true}).map(s=>nodeKey('session',s.id)):this.store.projects().map(p=>nodeKey('project',p)));
      for(const x of batch)if(x.source.kind==='memory'&&this.store.memory(x.source.key)?.revision!==x.source.revision)throw Error('下层记忆已改变；停止发布过期结果');
      if(batch.some(x=>x.source.kind==='memory'&&(!allowed.has(x.source.key)||this.store.memory(x.source.key)?.invalid)))throw Error('来源共享范围已改变；停止发布');
    });
  }
  async batches(kind,target,items,job,signal,validate){
    while(items.length){
      signal.throwIfAborted();const old=this.store.memory(nodeKey(kind,target));
      const base={kind,target,target_characters:LIMITS[kind],previous:old?{id:old.ref,text:old.summary}:null,sources:[]};
      const batch=[];
      while(items.length&&batch.length<24){
        const x=items[0],candidate={id:x.source.id,text:x.text};
        if(estimateTokens(this.request({...base,sources:[...base.sources,candidate]}))>LIMITS.input-512){if(!batch.length)throw Error('单份来源超过 Dream 输入预算，需要更小的来源分段');break;}
        batch.push(items.shift());base.sources.push(candidate);
      }
      let result,last;
      for(let attempt=0;attempt<=Math.min(2,this.config().backgroundMaxRetries??2);attempt++){
        signal.throwIfAborted();
        if(job.automatic&&!this.config().dreamAutoEnabled)throw new Error('自动 Dream 已关闭；已完成部分保留');
        try{
          if(attempt)await delay(Math.min(2000,500*2**attempt),undefined,{signal});
          const raw=await this.generate(last?{...base,retry_hint:last.message.slice(0,180)}:base,job,signal);
          result=validateMemory(raw,kind,new Set([...base.sources.map(s=>s.id),...(old?[old.ref]:[])]));break;
        }catch(error){if(error.budget||signal.aborted||/401|403|unauthorized|api.?key|authentication/i.test(error.message))throw error;last=error;}
      }
      if(!result)throw last;
      signal.throwIfAborted();await validate(batch);signal.throwIfAborted();
      this.store.publish({kind,target,baseRevision:old?.revision||0,...result,sources:batch.map(x=>x.source),consumed:batch.map(({key,fingerprint})=>({key,fingerprint})),epoch:this.epoch,jobId:job.id});
    }
  }
  request(input){return {system:DREAM_SYSTEM,messages:[this.hub.context.adapter.message(JSON.stringify(input),'dream-input')],tools:[DREAM_TOOL],maxTokens:LIMITS[input.kind]*2+1024};}
  async generate(input,job,signal){
    const run=async()=>{
      signal.throwIfAborted();const c=this.config(),request=this.request(input),maxTokens=request.maxTokens;
      const estimated=estimateTokens(request),route=job.route;
      if(estimated>LIMITS.input)throw Error('Dream 请求超过单次输入上限');
      const timeoutMs=c.jobTimeoutMs??600000,controller=new AbortController();
      const timer=timeoutMs>0?setTimeout(()=>controller.abort(Error('Dream 模型调用超时')),timeoutMs):undefined;timer?.unref?.();
      const joined=AbortSignal.any([signal,controller.signal]);
      let usage,failure,callId,iterator,onAbort;const assembler=new BlockAssembler();
      const aborted=new Promise((_,reject)=>{onAbort=()=>reject(joined.reason||Error('Dream 已取消'));joined.addEventListener('abort',onAbort,{once:true});if(joined.aborted)onAbort();});aborted.catch(()=>{});
      try{
        const info=await Promise.race([this.hub.ctx.llm?.resolveModelInfo?.(route.provider,route.model,joined),aborted]);
        const capacity=info?.context?.contextWindow;
        if(capacity&&estimated+maxTokens+1024>capacity)throw Error('Dream 请求超过当前模型容量，请使用更大上下文的后台模型');
        callId=this.store.reserve(estimated+maxTokens,c.dreamDailyTokens??200000,{jobId:job.id,kind:input.kind,route,promptVersion:DREAM_PROMPT_VERSION},this.epoch);
        if(!callId)throw new BudgetWait();
        if(this.generateOverride){const r=await Promise.race([this.generateOverride(input,{signal:joined,route,request}),aborted]);usage=r.usage;return r.value??r;}
        const {effort='off',...baseRoute}=route;
          const reasoningEffort=await Promise.race([this.hub.efforts.resolve(route.provider,route.model,effort),aborted]);
          iterator=this.hub.ctx.llm.stream({...baseRoute,...request,reasoningEffort,signal:joined})[Symbol.asyncIterator]();
          for(;;){const part=await Promise.race([iterator.next(),aborted]);if(part.done)break;assembler.push(part.value);}
          usage=assembler.usage;
          if(['error','aborted','max-tokens'].includes(assembler.finish.kind))throw Error(assembler.finish.failure?.message||`Dream 模型输出未完成：${assembler.finish.kind}`);
          const call=assembler.blocks().findLast(b=>b.type==='tool-call'&&b.name==='save_memory');
          if(!call)throw Error('Dream 未提交短记忆');return typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      }catch(error){failure=error.message;throw error;}
      finally{
        // BlockAssembler keeps usage undefined until the provider reports it.
        usage??=assembler.usage;
        clearTimeout(timer);joined.removeEventListener('abort',onAbort);try{void iterator?.return?.()?.catch?.(()=>{});}catch{}
        if(callId)this.store.settle(callId,usage,failure);
      }
    };
    return this.hub.context.withCallSlot?this.hub.context.withCallSlot(run,signal,true):run();
  }
  status(id){
    const s=id?this.store.session(id):null;
    return {session:s,sessionMemory:s?this.store.memory(nodeKey('session',id)):null,projectMemory:s?this.store.memory(nodeKey('project',s.project)):null,
      globalMemory:this.store.memory('global'),jobs:this.store.jobs(20,{includeUnfinished:true}).map(job=>({...job,targetTitle:job.scope==='session'?this.store.session(job.target)?.title||job.target:job.scope==='global'?'全部共享项目':job.target==='@unclassified'?'未归类':job.target})),usage:this.store.usage(),catalogRevision:this.store.meta('catalogRevision')||0,indexWarnings:this.store.meta('indexWarnings')||[],indexError:this.store.meta('indexError'),notice:this.store.meta('autoNotice')||this.store.meta('lastError'),
      settings:{enabled:Boolean(this.config().dreamAutoEnabled),intervalMs:this.config().dreamIntervalMs||3600000,deepAgeMs:this.config().dreamDeepAgeMs??604800000,dailyTokens:this.config().dreamDailyTokens??200000,provider:this.config().dreamProvider||'',model:this.config().dreamModel||''}};
  }
  close(){return this.closing??=this.shutdown();}
  async shutdown(){
    this.closed=true;clearInterval(this.timer);this.lifecycle.abort(Error('Dream 服务正在退出'));this.controller?.abort(Error('Dream 服务正在退出'));
    await Promise.allSettled([this.sources.close?.(),this.draining,this.ready,this.ticking].filter(Boolean));this.store.close();
  }
}
