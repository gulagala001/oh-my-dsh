import { assertRequestFits, inputBudget, requestPricing } from '../metering/estimate.mjs';
import { BlockAssembler, isHarnessError } from '@deepseek-ai/dsh-llm';
import { DreamStore } from './store.mjs';
import { DreamSources } from './sources.mjs';
import { digest, nodeKey, LIMITS, estimateTokens, validateMemory, validateScope } from './core.mjs';
import { DREAM_SYSTEM, DREAM_TOOL, DREAM_PROMPT_VERSION } from './prompts.mjs';
import { selectedProjects, workspaceRoots } from './scope.mjs';
import {setTimeout as delay} from 'node:timers/promises';

const authenticationFailure = error => error?.code==='AUTH'||error?.failure?.code==='AUTH'
  ||[401,403].includes(error?.status)||[401,403].includes(error?.failure?.status)
  ||/401|403|unauthorized|api.?key|authentication/i.test(error?.message||'');
class BudgetWait extends Error { constructor(){super('Dream 每日额度不足，已保存进度');this.budget=true;} }
class DreamCleanupError extends AggregateError {
  constructor(errors,primary=errors.find(error=>typeof error?.code==='string'||Number.isInteger(error?.status)||error?.failure)){
    super(errors,`Dream 模型流收尾失败：${errors.map(error=>String(error?.message||error)).join('；')}`);this.cleanup=true;
    if(primary)Object.assign(this,{...(typeof primary.code==='string'?{code:primary.code}:{}),
      ...(Number.isInteger(primary.status??primary.failure?.status)?{status:primary.status??primary.failure.status}:{}),
      ...(primary.failure?{failure:primary.failure}:{})});
  }
}
export class DreamService {
  #consumersRetired;
  constructor(hub, { store, sources, generate, consumersRetired } = {}) {
    this.#consumersRetired=consumersRetired;
    this.hub=hub;this.store=store||new DreamStore(hub.store.dir);this.sources=sources||new DreamSources(hub,this.store);
    this.generateOverride=generate;this.closed=false;this.draining=null;this.controller=null;this.timer=null;this.epoch=null;
    this.lifecycle=new AbortController();this.ready=null;this.ticking=null;this.closing=null;this.generating=new Set();this.cleanupFailures=new Set();
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
  jobEvent(job,status,title,detail){
    this.hub?.event?.(job.scope==='session'?job.target:null,{kind:'dream',status,title,detail,
      data:{jobId:job.id,scope:job.scope,target:job.target,auto:Boolean(job.automatic)}});
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
    // An existing parent still needs to withdraw its last shared source.
    if(scope==='project'&&!this.store.projects().includes(target)&&!this.store.memory(nodeKey('project',target)))throw Error('当前项目没有可共享的会话');
    const job=this.store.enqueue(scope,scope==='global'?'global':target,false,{route});
    void this.drain().catch(e=>this.notice(e));return job;
  }
  pause(id){
    this.lifecycle.signal.throwIfAborted();
    const next=this.store.updateJobIf(id,['queued','running','budget'],{state:'paused',notice:'用户已停止；保留已完成部分'});
    if(next.state==='paused'&&this.activeJob===id)this.controller?.abort(Error('用户已停止 Dream'));
    return next;
  }
  resume(id,agent){
    this.lifecycle.signal.throwIfAborted();
    const job=this.store.job(id);if(!job)throw Error('Dream 作业不存在');
    if(['complete','running','queued'].includes(job.state))return job;
    const route=this.route(agent)||job.route;if(!route?.provider||!route.model)throw Error('请先配置 Dream 模型');
    const next=this.store.updateJobIf(id,['paused','failed','budget'],{state:'queued',automatic:false,error:null,code:null,httpStatus:null,failure:null,notice:null,resumeAt:null,route});void this.drain().catch(e=>this.notice(e));return next;
  }
  checkJob(job,signal){
    this.lifecycle.signal.throwIfAborted();signal.throwIfAborted();
    // The durable job, not the snapshot captured at claim time, owns admission.
    // A manual request may adopt automatic work while it waits for a model slot.
    let current=this.store.requireJob(job.id,this.epoch);
    if(current.automatic&&!this.config().dreamAutoEnabled){
      const notice='自动 Dream 已关闭；已完成部分保留，可手动继续';
      // A different process may adopt this range after the first read. Fence
      // the policy change with the same transaction used by manual controls.
      current=this.store.tx(()=>{
        const latest=this.store.requireJob(job.id,this.epoch);
        return latest.automatic?this.store.updateJob(job.id,{state:'paused',notice}):latest;
      });
      if(current.state==='paused'){
        const error=Error(notice);
        if(this.activeJob===job.id)this.controller?.abort(error);
        throw error;
      }
    }
    return current;
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
    if(!this.store.hasRunnableJobs())return;
    const epoch=this.store.acquire();if(epoch==null)return;
    this.epoch=epoch;
    this.draining=Promise.resolve().then(async()=>{
      const heartbeat=setInterval(()=>{if(!this.store.renew(epoch))this.controller?.abort(Error('Dream 执行租约失效'));},15000);heartbeat.unref?.();
      try{
        this.store.recover(epoch);
        for(let job;!this.closed&&(job=this.store.claimJob(epoch));){
          this.activeJob=job.id;this.controller=new AbortController();
          try{
            this.checkJob(job,this.controller.signal);
            await this.runJob(job,this.controller.signal);
            this.checkJob(job,this.controller.signal);
            const skipped=(this.store.meta('indexWarnings')||[]).filter(item=>item.scope!=='session'&&(job.scope==='global'||job.scope==='project'&&item.project===job.target)).length;
            // Pause/resume and lease handoff can reject settlement. Only the
            // accepted row can announce a terminal outcome, never this old run.
            const settled=this.store.settleJob(job.id,{state:'complete',notice:skipped?`已整理可读取范围；${skipped} 个会话日志异常，未参与本次汇总`:'本次范围已整理；未到时长的下层资料继续保留'},epoch);
            if(settled)this.jobEvent(settled,'success','Dream 整理完成',skipped?`${skipped} 个会话日志异常未参与`:null);
          }catch(error){
            let settled;
            try{settled=this.store.settleJob(job.id,{state:this.closed?'queued':error.budget?'budget':'failed',error:error.message,
              ...(typeof error.code==='string'?{code:error.code}:{}),
              ...(Number.isInteger(error.status??error.failure?.status)?{httpStatus:error.status??error.failure.status}:{}),
              ...(error.failure?{failure:error.failure}:{}),...(error.budget?{resumeAt:this.store.usage().resetsAt}:{})},epoch);}
            catch(settleError){throw new DreamCleanupError([error,settleError]);}
            if(settled&&!this.closed)this.jobEvent(settled,'error',error.budget?'Dream 超出今日额度':'Dream 整理失败',error.message);
            if(error.cleanup)throw error;
          }finally{this.activeJob=null;this.controller=null;}
        }
      }finally{clearInterval(heartbeat);try{this.store.release(epoch);}catch(error){throw new DreamCleanupError([error]);}finally{this.epoch=null;}}
    }).catch(error=>{if(error.cleanup)this.cleanupFailures.add(error);throw error;}).finally(()=>{this.draining=null;});return this.draining;
  }
  async runJob(job,signal){
    await this.sources.sync(signal);
    if(!job.targetsReady){
      const all=this.store.projects();
      const picked=(Array.isArray(this.config().dreamProjects)?this.config().dreamProjects:[]).filter(x=>typeof x==='string');
      const projects=job.scope==='global'?selectedProjects(all,picked,workspaceRoots(this.hub.ctx)):job.scope==='project'?[job.target]:[];
      const sessions=job.scope==='session'?[job.target]:projects.flatMap(project=>this.store.sessions({project,shared:true}).map(s=>s.id));
      this.store.setTargets(job.id,[...sessions.map(target=>({kind:'session',target})),...projects.map(target=>({kind:'project',target})),...(job.scope==='global'?[{kind:'global',target:'global'}]:[])],this.epoch);
    }
    // Source manifests are fixed at each session's first admission; successful
    // progress is durable across job retries, pause and process replacement.
    // One unrecoverable target must not discard the whole range: record it, keep
    // its progress so a retry can attempt it again, and continue with the rest.
    // Budget, cancellation and credential failures still abort the entire job.
    // A previous run may have left targets flagged as failed: clear the flags so
    // this run attempts them again. The flag only ever means "already failed in
    // the current run", which is what keeps the loop moving past a bad target.
    this.store.clearTargetFailures(job.id,this.epoch);
    let skipped=0,lastError=null;
    for(let target;(target=this.store.nextTarget(job.id));){
      this.checkJob(job,signal);
      // An aggregate built while a source failed would publish an incomplete
      // range, and finishing it would suppress its own refresh through the
      // next run. Leave the remaining parents unfinished, the way a failing
      // target used to stop the loop before reaching them.
      if(skipped&&target.kind!=='session')break;
      // Persisted job targets may predate a format refusal discovered by this
      // scan. Shared jobs must withdraw that source and continue their scope.
      if(target.kind==='session'&&job.scope!=='session'&&(!this.store.session(target.target)?.shared||this.store.session(target.target)?.available===false)) {
        this.store.finishTarget(job.id,target.ordinal,this.epoch);
        continue;
      }
      let failed=false;
      try{
        if(target.kind==='session')await this.updateSession(target.target,job,signal,target);
        else await this.updateParent(target.kind,target.target,job,signal,target);
      }catch(error){
        if(error.cleanup||error.budget||signal.aborted||authenticationFailure(error))throw error;
        // A shared job withdraws an unreadable source and carries on; a session
        // job still fails outright because it cannot narrow its own range.
        if(target.kind==='session'&&job.scope!=='session'&&this.sources.excludeUnreadable(target.target,error,signal)){
          this.store.finishTarget(job.id,target.ordinal,this.epoch);
          continue;
        }
        failed=true;skipped++;lastError=error;
        // Leave the target unfinished so a later run retries it; the flag only
        // steps this run past it.
        this.store.markTargetFailed(job.id,target.ordinal,this.epoch);
      }
      if(!failed)this.store.finishTarget(job.id,target.ordinal,this.epoch);
    }
    // Completion deletes the target snapshot. Keep partial progress retryable
    // even when later targets succeeded, including after a process restart.
    if(skipped){
      const notice=`Dream 有 ${skipped} 个范围未整理：${lastError.message}`.slice(0,400);
      this.store.setMeta('lastError',notice);
      throw Object.assign(new Error(notice,{cause:lastError}),{
        ...(typeof lastError.code==='string'?{code:lastError.code}:{}),
        ...(Number.isInteger(lastError.status??lastError.failure?.status)?{status:lastError.status??lastError.failure.status}:{}),
        ...(lastError.failure?{failure:lastError.failure}:{})});
    }
  }
  async updateSession(id,job,signal,target){
    const stamp=this.sources.stamp(id,this.config().dreamDeepAgeMs??604800000);
    if(stamp&&this.store.meta('scan:'+id)===stamp&&!this.store.memory(nodeKey('session',id))?.invalid)return;
    const manifest=await this.sources.manifest(id,{signal,deepAgeMs:this.config().dreamDeepAgeMs??604800000,cut:target?.cut,before:job.createdAt});
    if(target&&!target.cut)this.store.pinTarget(job.id,target.ordinal,{through:manifest.through,generation:manifest.metadata.generation},this.epoch);
    if(job.scope!=='session'&&!manifest.metadata.shared)return;
    const key=nodeKey('session',id);
    const rebuilding=Boolean(this.store.memory(key)?.invalid);
    const items=manifest.items.filter(x=>rebuilding||this.store.consumed(key,x.key)!==x.fingerprint);
    await this.batches('session',id,items,job,signal,async batch=>{
      await this.sources.validateBatch(manifest.metadata,batch,signal);
    });
    if(manifest.completeCut&&stamp&&stamp===this.sources.stamp(id,this.config().dreamDeepAgeMs??604800000))this.store.tx(()=>{this.store.requireJob(job.id,this.epoch);this.store.setMeta('scan:'+id,stamp);});
  }
  async updateParent(kind,target,job,signal){
    // Parent aggregation keeps every shared project: filtering here would look
    // like a withdrawn source and wrongly retract its contribution.
    const key=nodeKey(kind,target),children=kind==='project'?this.store.sessions({project:target,shared:true}).map(s=>({key:nodeKey('session',s.id),title:s.title})):this.store.projects().map(p=>({key:nodeKey('project',p),title:this.sources.projectTitle(p)}));
    const current=new Map(children.map(c=>[c.key,{...c,memory:this.store.memory(c.key)}]).filter(([,c])=>c.memory&&!c.memory.invalid));
    const rebuilding=Boolean(this.store.memory(key)?.invalid);
    const progress=this.store.progress(key),previousInputs=new Map(progress.map(p=>[p.source,p]));
    const items=[];
    for(const [child,c]of current){
      const fingerprint=String(c.memory.revision);if(!rebuilding&&this.store.consumed(key,child)===fingerprint)continue;
      const source={id:c.memory.ref,kind:'memory',key:child,revision:c.memory.revision};
      const before=previousInputs.get(child);
      items.push({key:child,fingerprint,source,text:`${c.title} · ${child} · revision ${fingerprint}${before?` (replaces revision ${before.fingerprint})`:''}\n${c.memory.summary}`});
    }
    for(const old of progress)if(!current.has(old.source)&&(rebuilding||old.fingerprint!=='withdrawn')){
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
      const previous=old&&!old.invalid?{id:old.ref,text:old.summary}:null;
      const base={kind,target,target_characters:LIMITS[kind],previous,sources:[]};
      const batch=[];
      while(items.length&&batch.length<24){
        const x=items[0],candidate={id:x.source.id,text:x.text};
        if(estimateTokens(this.request({...base,sources:[...base.sources,candidate]}))>LIMITS.input-512){if(!batch.length)throw Error('单份来源超过 Dream 输入预算，需要更小的来源分段');break;}
        batch.push(items.shift());base.sources.push(candidate);
      }
      let result,last;
      for(let attempt=0;attempt<=Math.min(2,this.config().backgroundMaxRetries??2);attempt++){
        signal.throwIfAborted();
        try{
          if(attempt)await delay(Math.min(2000,500*2**attempt),undefined,{signal});
          const raw=await this.generate(last?{...base,retry_hint:last.message.slice(0,180)}:base,job,signal);
          result=validateMemory(raw,kind,new Set([...base.sources.map(s=>s.id),...(previous?[previous.id]:[])]));break;
        }catch(error){if(error.cleanup||error.budget||signal.aborted||authenticationFailure(error))throw error;last=error;}
      }
      if(!result)throw last;
      this.checkJob(job,signal);await validate(batch);this.checkJob(job,signal);
      this.store.publish({kind,target,baseRevision:old?.revision||0,baseInvalid:Boolean(old?.invalid),...result,sources:batch.map(x=>x.source),consumed:batch.map(({key,fingerprint})=>({key,fingerprint})),epoch:this.epoch,jobId:job.id});
    }
  }
  request(input){return {system:DREAM_SYSTEM,messages:[this.hub.context.adapter.message(JSON.stringify(input),'dream-input')],tools:[DREAM_TOOL],maxTokens:LIMITS[input.kind]*2+1024};}
  async generate(input,job,signal){
    signal=AbortSignal.any([signal,this.lifecycle.signal]);
    const run=async()=>{
      this.checkJob(job,signal);
      const c=this.config(),request=this.request(input),estimated=estimateTokens(request),route=job.route;
      if(estimated>LIMITS.input)throw Error('Dream 请求超过单次输入上限');
      const timeoutMs=c.jobTimeoutMs??600000,controller=new AbortController();
      const timer=timeoutMs>0?setTimeout(()=>controller.abort(Error('Dream 模型调用超时')),timeoutMs):undefined;timer?.unref?.();
      const joined=AbortSignal.any([signal,controller.signal]);
      let usage,failure,callId,iterator,pendingNext,onAbort,startedAt,cleanupFailure,actual=route,hasOutput=false,status='error',finished=false;
      const assembler=new BlockAssembler();
      const aborted=new Promise((_,reject)=>{onAbort=()=>reject(joined.reason||Error('Dream 已取消'));joined.addEventListener('abort',onAbort,{once:true});if(joined.aborted)onAbort();});aborted.catch(()=>{});
      try{
        let prepared,maxTokens=request.maxTokens;
        if(!this.generateOverride){
          const {effort='off',...baseRoute}=route;
          // Capture capacity, supported selection, defaults and dispatch together.
          // Await the real preparation producer even if its signal was cancelled.
          prepared=await this.hub.ctx.llm.prepareCall({...baseRoute,maxTokens},joined,(controls,info)=>({...controls,
            reasoningEffort:effort!=='inherit'&&info.reasoning?.efforts.some(item=>item.id===effort)?effort:undefined}));
          actual={...prepared.config,effort:prepared.config.reasoningEffort??null};maxTokens=prepared.config.maxTokens;
          const capacity=prepared.context?.contextWindow;
          assertRequestFits({...request,...prepared.config},inputBudget({inputLimit:LIMITS.input,contextWindow:capacity,maxTokens:maxTokens??0,headroom:1024}),requestPricing(this.hub.ctx.llm,prepared.config));
        }
        this.checkJob(job,joined);
        callId=this.store.reserve(estimated+maxTokens,c.dreamDailyTokens??200000,{jobId:job.id,kind:input.kind,route:actual,promptVersion:DREAM_PROMPT_VERSION},this.epoch);
        if(!callId)throw new BudgetWait();
        startedAt=Date.now();
        this.hub.live?.set(`dream:${callId}`,{id:`dream:${callId}`,kind:`dream${input.kind[0].toUpperCase()}${input.kind.slice(1)}`,sessionId:input.kind==='session'?input.target:null,provider:actual.provider,model:actual.model,effort:actual.effort??null,startedAt});
        if(this.generateOverride){const r=await Promise.race([this.generateOverride(input,{signal:joined,route,request}),aborted]);joined.throwIfAborted();usage=r.usage;hasOutput=true;status='success';return r.value??r;}
        const options={...request,...prepared.config,signal:joined};
        for(const key of ['reasoningEffort','temperature','maxTokens','stop'])if(!(key in prepared.config))delete options[key];
        iterator=prepared.stream(options)[Symbol.asyncIterator]();
        for(;;){
          pendingNext=iterator.next();const part=await Promise.race([pendingNext,aborted]);
          joined.throwIfAborted();pendingNext=null;if(part.done)break;
          const chunk=part.value;
          hasOutput||=(chunk.type==='text-delta'||chunk.type==='reasoning-delta')?Boolean(chunk.text):chunk.type==='tool-call-delta'?Boolean(chunk.id||chunk.name||chunk.argumentsDelta):chunk.type==='block-end';
          assembler.push(chunk);finished||=chunk.type==='finish';
        }
        usage=assembler.usage;
        if(!finished)throw Error('Dream 模型流结束但未报告完成状态');
        if(['error','aborted','max-tokens'].includes(assembler.finish.kind))throw Object.assign(
          Error(assembler.finish.failure?.message||`Dream 模型输出未完成：${assembler.finish.kind}`),
          assembler.finish.failure?{...assembler.finish.failure,failure:assembler.finish.failure}:{});
        const call=assembler.blocks().findLast(b=>b.type==='tool-call'&&b.name==='save_memory');
        if(!call)throw Error('Dream 未提交短记忆');
        const result=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;status='success';return result;
      }catch(error){
        // Provider failures arrive as finish chunks. A thrown next() is a real
        // middleware/producer failure, including its native finally cleanup.
        if(pendingNext&&error!==joined.reason){error=new DreamCleanupError([error]);this.cleanupFailures.add(error);}
        failure=error;status=error.cleanup?'error':signal.aborted||assembler.finish.kind==='aborted'?'cancelled':'error';throw error;
      }
      finally{
        clearTimeout(timer);joined.removeEventListener('abort',onAbort);
        // A raced next() still owns its producer. Drain both it and return(),
        // keeping late chunks out of the admitted usage and publication result.
        if(iterator){
          const errors=[],collectPart=part=>{
            const chunk=!part?.done?part?.value:null,reason=chunk?.type==='finish'?chunk.reason:null;
            // The SDK may turn a pending adapter throw into a terminal chunk.
            // Only the caller's own abort is expected; other failures still matter.
            if(reason?.failure&&['error','aborted'].includes(reason.kind)&&reason.failure.code!=='ABORTED'
              &&!(reason.failure.message===joined.reason?.message&&reason.failure.code===(isHarnessError(joined.reason)?joined.reason.code:'UNKNOWN')))
              errors.push(Object.assign(Error(reason.failure.message),{...reason.failure,failure:reason.failure}));
          };
          // Async generators may yield from finally; return() is not done then.
          const returning=(async()=>{for(let part=await iterator.return?.();part&&!part.done;part=await iterator.next())collectPart(part);})();
          const results=await Promise.allSettled([returning,...(pendingNext?[pendingNext]:[])]);
          for(const [index,result]of results.entries()){
            if(result.status==='rejected'){
              if(index===0||result.reason!==failure&&result.reason!==joined.reason&&!failure?.errors?.includes(result.reason))errors.push(result.reason);
            }else if(index>0)collectPart(result.value);
          }
          if(errors.length){
            // Late producer facts outrank the caller's retained cancellation.
            const primary=errors.find(error=>typeof error?.code==='string'||Number.isInteger(error?.status)||error?.failure)||failure;
            cleanupFailure=new DreamCleanupError([...(failure?[failure]:[]),...errors],primary);this.cleanupFailures.add(cleanupFailure);failure=cleanupFailure;status='error';
          }
        }
        // Reserve is a quota hold, never a fabricated provider usage receipt.
        usage??=assembler.usage;
        if(callId){
          try{this.store.settle(callId,usage,failure?String(failure.message||failure):undefined);}
          catch(error){cleanupFailure=new DreamCleanupError([...(failure?[failure]:[]),error]);this.cleanupFailures.add(cleanupFailure);failure=cleanupFailure;status='error';}
          this.hub.live?.delete(`dream:${callId}`);
          if(input.kind==='session')try{this.hub.context.releaseState?.(input.target);}
          catch(error){cleanupFailure=new DreamCleanupError([...(failure?[failure]:[]),error]);this.cleanupFailures.add(cleanupFailure);failure=cleanupFailure;status='error';}
          try{this.hub.monitor?.append({id:`dream:${callId}`,source:'dream',kind:`dream${input.kind[0].toUpperCase()}${input.kind.slice(1)}`,
            sessionId:input.kind==='session'?input.target:null,at:Date.now(),startedAt,
            provider:actual.provider,model:actual.model,effort:actual.effort??null,
            durationMs:Date.now()-startedAt,usage,hasOutput,status,error:failure?String(failure.message||failure):undefined,
            ...(typeof failure?.code==='string'?{code:failure.code}:{}),
            ...(Number.isInteger(failure?.status??failure?.failure?.status)?{httpStatus:failure.status??failure.failure.status}:{}),
            ...(failure?.failure?{failure:failure.failure}:{})});}catch{}
        }
        if(cleanupFailure)throw cleanupFailure;
      }
    };
    const task=this.hub.context.withCallSlot?this.hub.context.withCallSlot(run,signal,true):run();this.generating.add(task);
    try{return await task;}finally{this.generating.delete(task);}
  }
  status(id){
    const s=id?this.store.session(id):null;
    return {session:s,sessionMemory:s?this.store.memory(nodeKey('session',id)):null,projectMemory:s?this.store.memory(nodeKey('project',s.project)):null,
      globalMemory:this.store.memory('global'),jobs:this.store.jobs(20,{includeUnfinished:true}).map(job=>({...job,targetTitle:job.scope==='session'?this.store.session(job.target)?.title||job.target:job.scope==='global'?'全部共享项目':job.target==='@unclassified'?'未归类':job.target})),usage:this.store.usage(),catalogRevision:this.store.meta('catalogRevision')||0,indexWarnings:this.store.meta('indexWarnings')||[],indexError:this.store.meta('indexError'),notice:this.store.meta('autoNotice')||this.store.meta('lastError'),
      settings:{enabled:Boolean(this.config().dreamAutoEnabled),intervalMs:this.config().dreamIntervalMs||3600000,deepAgeMs:this.config().dreamDeepAgeMs??604800000,dailyTokens:this.config().dreamDailyTokens??200000,provider:this.config().dreamProvider||'',model:this.config().dreamModel||'',dreamProjects:(Array.isArray(this.config().dreamProjects)?this.config().dreamProjects:[]).filter(x=>typeof x==='string')}};
  }
  close(){return this.closing??=this.shutdown();}
  async shutdown(){
    this.closed=true;clearInterval(this.timer);this.lifecycle.abort(Error('Dream 服务正在退出'));this.controller?.abort(Error('Dream 服务正在退出'));
    const cancelled=new Set([this.lifecycle.signal.reason,this.sources.lifecycle?.signal.reason,this.controller?.signal.reason]),errors=new Set(this.cleanupFailures);
    const collect=results=>{for(const result of results)if(result.status==='rejected'&&!cancelled.has(result.reason)&&result.reason!==this.sources.lifecycle?.signal.reason)errors.add(result.reason);};
    // ready/tick can create a drain while close is already waiting for sources.
    // Keep the database open until every real generation and producer retires.
    const results=await Promise.allSettled([(async()=>this.sources.close?.())(),...new Set([this.draining,this.ready,this.ticking,...this.generating].filter(Boolean))]);
    collect(results);
    if(results[0].status==='fulfilled'&&Array.isArray(results[0].value))collect(results[0].value);
    collect(await Promise.allSettled([...new Set([this.draining,this.ready,this.ticking,...this.generating].filter(Boolean))]));
    for(const error of this.cleanupFailures)errors.add(error);
    // Hub runtime removal still classifies sessions through this database.
    await this.#consumersRetired?.();
    try{this.store.close();}catch(error){errors.add(error);}
    if(errors.size)throw new AggregateError([...errors],'Dream 服务收尾失败');
  }
}
