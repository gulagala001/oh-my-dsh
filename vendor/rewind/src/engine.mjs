import { inputBoundaries, expandedRanges } from './boundary.mjs';
import { readNativeSession } from './session-read.mjs';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { appendPluginRecord } from '@deepseek-ai/dsh-session';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Store, hash, lease, TOOL_LOCK_WAIT_MS, isLockFailure } from './store.mjs';
import { Files, difference, equal, projectChanges } from './files.mjs';
import { eventsOf, snapshot, beforeMessage, userTarget, prepareReplay, appendPrepared, hidden, mergeRanges } from './conversation.mjs';

const CAPTURE_MS = 4000;
const RETRY_MS = 30000;
const workspaceIndependent = Symbol.for('dsh-rewind-plus.workspace-independent');

export class RewindEngine {
  constructor(ctx,root,config={}) {this.ctx=ctx;this.store=new Store(root);this.files=new Files(root,config);this.plans=new Map();this.waves=new Map();this.busy=new Set();this.operations=new Map();this.captureRetry=new Map();}
  async flush(session){
    if(await this.ctx.sessions.flush(session)!==true)throw Error('会话持久化未确认；请启用会话存储后恢复撤回。');
  }
  projections(){return this.ctx.sessions.messageProjections || [];}
  backupGap(agent,error){
    this.ctx.logger?.warn?.('Rewind capture skipped: '+error.message);
    try{appendPluginRecord(this.owner(agent).session,'plugin:dsh-rewind-plus/backup-gap',{reason:error.message});}catch{}
  }
  session(id){const s=this.ctx.sessions.get(id);if(!s)throw Error('请先打开这个会话');return s;}
  async agent(id){
    const live=this.ctx.agents.get(id);if(live)return live;
    const found=await this.ctx.sessionController.resolveAgent(id);
    if(found.error)throw found.error;
    return found.agent;
  }
  owner(agent){let a=agent;const seen=new Set();while(a?.session.header.origin==='subagent' && a.session.header.parentSession && !seen.has(a.id)){seen.add(a.id);const parent=this.ctx.agents.get(a.session.header.parentSession);if(!parent)break;a=parent;}return a;}
  cwd(session){return this.ctx.get?.('workingDirectory')?.get(session) || session.header.cwd;}
  async root(session,signal){const cwd=this.cwd(session);if(!cwd)throw Error('会话没有本地工作目录');return this.files.workspace(cwd,signal);}
  async checkpoint(agent,messages=[],signal){
    const owner=this.owner(agent),s=owner.session;
    if(owner.id!==agent.id)return;
    await this.store.lock(s.id,async()=>{
      let st=await this.store.load(s.id);if(st.journal)throw Error('存在未完成的撤回，请先恢复');
      const pending=messages.filter(m=>m.source?.kind==='user'&&!st.checkpoints[m.id]);
      if(!pending.length)return;
      // A message checkpoint only anchors the change log. File bytes are saved
      // immediately before tools can modify them, so plain chat costs no scan.
      try {const root=await this.root(s,signal);for(const e of pending)st.checkpoints[e.id]={root,coverage:'跟踪工具执行期间的文件变化；Git 忽略规则生效，不包含 .git、node_modules 或符号链接指向的外部内容。',changeIndex:st.changes.length,createdAt:Date.now()};}
      catch(e){signal?.throwIfAborted();for(const m of pending)st.checkpoints[m.id]={error:e.message};}
      const keys=Object.keys(st.checkpoints);for(const key of keys.slice(0,-100))delete st.checkpoints[key];
      const indices=Object.values(st.checkpoints).map(c=>c.changeIndex).filter(Number.isInteger);
      const drop=indices.length?Math.min(...indices):0;
      if(drop>0){st.changes.splice(0,drop);for(const c of Object.values(st.checkpoints))if(Number.isInteger(c.changeIndex))c.changeIndex-=drop;}
      await this.store.save(st);
    },{signal});
  }
  tracksTool(exec) {
    return !!exec.agent && exec.parent === undefined
      && this.ctx.get?.('tools')?.get(exec.name,exec.agent,exec.toolSet)?.[workspaceIndependent] !== true;
  }
  async capture(root,signal){
    signal?.throwIfAborted();
    if(this.captureRetry.get(root)>performance.now())throw Error('工作区文件备份超出时间预算，暂缓本次备份');
    const budget=new AbortController();
    const error=Error('工作区文件备份超出时间预算');
    const timer=setTimeout(()=>budget.abort(error),CAPTURE_MS);
    try {
      const captureSignal=signal?AbortSignal.any([signal,budget.signal]):budget.signal;
      const result=await this.files.capture(root,{signal:captureSignal});
      captureSignal.throwIfAborted();
      return result;
    }catch(cause){
      if(budget.signal.aborted&&!signal?.aborted){
        if(this.captureRetry.size>=256)this.captureRetry.delete(this.captureRetry.keys().next().value);
        this.captureRetry.set(root,performance.now()+RETRY_MS);
        throw error;
      }
      throw cause;
    }finally{clearTimeout(timer);}
  }
  async tool(exec,next){
    if(!this.tracksTool(exec))return next();
    const owner=this.owner(exec.agent);let root,wave;
    try{root=await this.root(exec.agent.session,exec.signal);}
    catch(error){exec.signal?.throwIfAborted();this.backupGap(exec.agent,error);return next();}
    const deadline=performance.now()+TOOL_LOCK_WAIT_MS;
    try{await this.store.lock('workspace:'+root,async()=>{
      if(this.busy.has(root))throw Object.assign(Error('工作区正在回退或恢复，本次工具尚未执行，请稍后重试。'),{code:'REWIND_WORKSPACE_BUSY'});
      wave=this.waves.get(root);
      if(!wave){
        const release=await lease(join(this.store.root,'workspace-locks',hash(root)+'.json'),{waitMs:Math.max(0,deadline-performance.now()),signal:exec.signal});
        wave={release,count:0,owners:new Set(),before:null,error:null};
        try {
          try{wave.before=await this.capture(root,exec.signal);}catch(error){wave.error=error.message;}
          exec.signal?.throwIfAborted();
          this.waves.set(root,wave);
        }catch(error){await release();throw error;}
      }
      wave.count++;wave.owners.add(owner.id);
    },{signal:exec.signal,waitMs:TOOL_LOCK_WAIT_MS});}catch(error){if(exec.signal?.aborted||isLockFailure(error))throw error;this.backupGap(exec.agent,error);return next();}
    let result;
    try {result=await next();return result;} finally {
      try{await this.store.lock('workspace:'+root,async()=>{
        if(exec.signal?.aborted||result?.error?.info?.cleanupPending){
          wave.error??='工具执行已取消，文件改动未完成备份';
        }
        if(--wave.count!==0)return;
        try{
          let after,error=wave.error;
          if(!error)try{after=await this.capture(root,exec.signal);}catch(e){
            error=exec.signal?.aborted?'工具执行已取消，文件改动未完成备份':e.message;
          }
          const changes=!error?difference(wave.before.manifest,after.manifest):[];
          for(const id of wave.owners)await this.store.lock(id,async()=>{
            const st=await this.store.load(id);
            if(!error&&!changes.length)return;
            const last=st.changes.at(-1),boundary=Math.max(0,...Object.values(st.checkpoints).map(c=>c.changeIndex||0));
            const canMerge=!error&&last&&!last.error&&last.root===root&&st.changes.length>boundary&&JSON.stringify(last.owners)===JSON.stringify([...wave.owners]);
            const merged=canMerge?new Map(last.changes.map(c=>[c.path,c])):null;
            let continuous=!!merged;
            if(merged)for(const c of changes){const old=merged.get(c.path);if(old&&!equal(old.after,c.before)){continuous=false;break;}merged.set(c.path,{path:c.path,before:old?old.before:c.before,after:c.after});}
            if(continuous)last.changes=[...merged.values()].filter(c=>!equal(c.before,c.after));
            else st.changes.push({root,owners:[...wave.owners],changes,...(error?{error}:{})});
            await this.store.save(st);
          });
        }finally{this.waves.delete(root);await wave.release();}
      });}catch(error){this.backupGap(exec.agent,error);}
    }
  }
  state(st,events=this.ctx.sessions.get(st.id)?.snapshotEvents()||[]){
    const internal=st.internalRanges||[],ranges=expandedRanges(events,st.hiddenRanges);
    const maintenanceTurns=[],hiddenTurns=[],hiddenStepSeqs=new Set();
    let maintenanceSteps=0;
    for(const e of events){
      if(e.type==='turn/start'){if(hidden(internal,e.seq))maintenanceTurns.push(e.data.turn);if(hidden(ranges,e.seq))hiddenTurns.push(e.data.turn);}
      if(e.type==='step/start'&&hidden(internal,e.seq))maintenanceSteps++;
      if(e.type==='step/start'&&hidden(ranges,e.seq))hiddenStepSeqs.add(e.seq);
    }
    return {revision:st.revision,hiddenRanges:ranges,hiddenTurns:[...new Set(hiddenTurns)],hiddenSteps:hiddenStepSeqs.size,maintenanceTurns:maintenanceTurns.length,maintenanceSteps,undoAvailable:st.undo.length>0,busy:!!st.journal,warning:st.warning||null,pendingDraft:st.pendingDraft||null};
  }

  async acknowledge(id,token){return this.store.lock(id,async()=>{const st=await this.store.load(id);if(st.pendingDraft?.id===token){st.pendingDraft=null;await this.store.save(st);}return this.state(st);});}
  async getState(id){return this.store.lock(id,async()=>{
    // Viewing persisted history does not activate an Agent.
    const events=this.ctx.sessions.get(id)?.snapshotEvents()??(await readNativeSession(this.ctx, id)).events;
    const st=await this.store.load(id);
    return {...this.state(st,events),...(st.journal&&!this.operations.has(id)?{error:'检测到中断的撤回，请先恢复中断操作'}:{})};
  });}
  async candidates(id,before){
    if(before!==undefined&&(!Number.isSafeInteger(before)||before<0))throw Error('无效的历史位置');
    return this.store.lock(id,async()=>{
      // Read the persisted log, including compacted history, without resuming an
      // Agent or scanning the workspace. Bound both response size and UI rows.
      const events=this.ctx.sessions.get(id)?.snapshotEvents()??(await readNativeSession(this.ctx, id)).events;
      const st=await this.store.load(id),items=[];
      for(let i=events.length-1;i>=0;i--){
        const e=events[i];
        if(e.seq>=(before??Infinity)||e.type!=='user/message'||e.data.source?.kind!=='user'||hidden(st.hiddenRanges,e.seq))continue;
        if(items.length===100)return {items,before:items.at(-1).seq};
        let text='';
        for(const block of e.data.content){
          text+=(block.type==='text'?block.text:block.attachment?.name||'').slice(0,240-text.length)+' ';
          if(text.length>=240)break;
        }
        const checkpoint=st.checkpoints[e.data.id];
        items.push({seq:e.seq,text:text.trim().replace(/\s+/g,' ')||'（附件消息）',conversationOnly:!checkpoint||!!checkpoint.error});
      }
      return {items,before:null};
    });
  }
  metadata(s,end=Infinity){const events=eventsOf(s).filter(e=>e.seq<end);return {cwd:events.findLast(e=>e.type==='working-directory/change')?.data.cwd||s.header.cwd||this.cwd(s),plan:events.findLast(e=>e.type==='plan/mode')?.data.active||false};}
  async preview(id,seq,undo=false){
    await this.agent(id);
    return this.store.lock(id,async()=>{
      const s=this.session(id);let st=await this.store.load(id);
      const base=undo?st.undo.at(-1):null;if(undo&&!base)throw Error('没有可撤销的撤回');
      const target=undo?null:userTarget(s,seq,st.hiddenRanges),checkpoint=undo?null:st.checkpoints[s.eventAt(seq)?.data.id];
      const boundary=undo?undefined:inputBoundaries(eventsOf(s)).get(seq)??seq;
      const warnings=['已发送消息、网站操作、数据库和其他外部副作用不会被撤销。'];
      warnings.push('临时浏览器配置、缓存和锁文件不参与撤回或撤销；项目文件仍按备份检查。');
      let reason='',fileReason='',changes=[],root,skipped=[];
      if(undo){
        root=base.root;
        // Do not erase a newer conversation when undo is invoked after continuing work.
        const newer=eventsOf(s).some(e=>e.seq>base.endSeq&&e.type==='user/message'&&e.data.source?.kind==='user'&&!hidden(st.hiddenRanges,e.seq));
        if(newer)reason='撤回后已有新消息；请先撤回这些新消息，再撤销上一次撤回。';
        changes=projectChanges(base.changes).map(c=>({path:c.path,before:c.after,after:c.before}));
      }else{
        root=checkpoint?.root;
        if(!root)try{root=await this.root(s);}catch(error){fileReason=error.message;}
        if(!checkpoint || checkpoint.error)warnings.push(checkpoint?.error || '这条消息没有文件检查点；只能撤回对话。');
        else{
          warnings.push(checkpoint.coverage);
          const map=new Map();
          for(const record of st.changes.slice(checkpoint.changeIndex)){
            if(record.error){fileReason='存在未完整备份的文件操作：'+record.error;break;}
            const tracked=projectChanges(record.changes);
            if(!tracked.length)continue;
            if(record.root!==root){fileReason='此后跨工作目录执行过操作，文件保持现状';break;}
            if(record.owners.some(owner=>owner!==id)){fileReason='该时段有其他会话同时修改工作区，文件保持现状';break;}
            for(const c of tracked){const old=map.get(c.path);if(old&&!equal(old.after,c.before)){fileReason=`两次工具执行之间存在外部改动：${c.path}`;break;}map.set(c.path,{path:c.path,before:old?old.before:c.before,after:c.after});}
            if(fileReason)break;
          }
          changes=[...map.values()].filter(c=>!equal(c.before,c.after));
        }
      }
      if(!undo&&eventsOf(s).some(e=>e.seq>=boundary&&e.type==='plugin:dsh-rewind-plus/backup-gap'&&!hidden(st.hiddenRanges,e.seq)))fileReason='这一段有文件变化未能完整备份';
      // Stopping an idle conversation cannot repair a file conflict or a gap.
      // Keep that action tied to the actual owner, not to any failed preview.
      const canStop=this.ctx.agents.list().some(a=>a.status==='running'&&this.owner(a).id===id);
      const busy=this.waves.has(root)||this.busy.has(root);
      let foreignBusy=false;
      const foreign=this.ctx.agents.list().filter(a=>a.status==='running'&&this.owner(a).id!==id);
      for(const a of foreign){try{if(await this.root(a.session)===root)foreignBusy=true;}catch{}}
      if(canStop)warnings.push('确认后会自动停止当前会话，再撤回。');
      if(foreignBusy||busy&&!canStop)fileReason='工作区还有其他操作，文件保持现状';
      if(st.journal)fileReason='上次撤回曾中断，确认后会自动完成恢复';
      if(fileReason){warnings.push(fileReason+'；本次仍可撤回对话。');changes=[];}
      else if(!canStop){const available=await this.files.available(root,changes);changes=available.changes;skipped=available.skipped;}
      if(skipped.length)warnings.push(`${skipped.length} 个文件有新改动或暂时不可用，将保留现状；对话正常撤回。`);
      const context=undo?base.context:{atSeq:boundary};
      if(Array.isArray(context))warnings.push('这份旧撤销备份没有任务历史截点；对话和文件恢复后，任务清单保持现状。');
      // Preflight every native append before offering the confirmation.
      prepareReplay(s,context,this.projections());
      const plan={id:randomUUID(),sessionId:id,revision:st.revision,seq:s.seq,expires:Date.now()+5*60000,undo,target,root,changes,skipped,fileReason,context,
        metadata:undo?base.metadata:this.metadata(s,boundary),ranges:undo?base.ranges:[...st.hiddenRanges,{start:boundary,end:s.seq-1}],reason};
      await this.maintenance?.pin(plan);
      this.plans.set(plan.id,plan);
      this.schedulePlanExpiry();
      for(const [key,p]of this.plans)if(p.expires<Date.now()){this.plans.delete(key);await this.maintenance?.unpin(key);}
      while(this.plans.size>16){const key=this.plans.keys().next().value;this.plans.delete(key);await this.maintenance?.unpin(key);}
      return {workspace:root,planId:plan.id,revision:st.revision,target,files:changes.map(c=>({path:c.path,kind:!c.before?'delete':!c.after?'restore':'modify'})),skipped,warnings,canApply:!reason,canStop,reason,conversationOnly:!changes.length};
    });
  }
  schedulePlanExpiry(){
    clearTimeout(this.planTimer);
    if(!this.plans.size)return;
    const expires=Math.min(...[...this.plans.values()].map(plan=>plan.expires));
    this.planTimer=setTimeout(()=>{
      for(const [id,plan] of this.plans)if(plan.expires<=Date.now()){this.plans.delete(id);void this.maintenance?.unpin(id);}
      this.schedulePlanExpiry();
    },Math.max(0,expires-Date.now()));
    this.planTimer.unref?.();
  }
  abandon(agent,reason){
    const op=this.operations.get(agent.id);
    if(!op||op.agent!==agent||op.consumed)return;
    this.operations.delete(agent.id);clearTimeout(op.claimTimer);
    try{agent.inbox.remove?.(op.marker);}finally{op.reject(Error(reason));void this.maintenance?.idle();}
  }
  async execute(id,planId,draft,selection){
    let plan=this.plans.get(planId);
    if(plan&&plan.sessionId!==id)throw Error('无效会话');
    if(!plan){
      if(!selection||!selection.undo&&!Number.isSafeInteger(selection.seq))throw Error('确认已过期，请选择要撤回的消息');
      const fresh=await this.preview(id,selection.seq,selection.undo);
      planId=fresh.planId;plan=this.plans.get(planId);
    }
    if(this.operations.has(id))throw Error('撤回正在执行');
    if(this.ctx.agents.list().some(a=>a.status==='running'&&this.owner(a).id===id))await this.stop(id);
    if((await this.store.load(id)).journal)await this.launch(id,{recovery:true});
    // Refresh automatically after cancellation, file changes or recovery. The
    // selected message remains the boundary; files can only be restored safely.
    const fresh=await this.preview(id,plan.target?.seq,plan.undo);
    this.plans.delete(planId);await this.maintenance?.unpin(planId);
    return this.launch(id,{planId:fresh.planId,draft});
  }
  async stop(id){
    const related=this.ctx.agents.list().filter(a=>this.owner(a).id===id);
    for(const a of related)if(a.status==='running')a.cancel({kind:'user'},{keepInbox:true});
    let timer;
    try{
      await Promise.race([Promise.all(related.map(a=>a.whenIdle())),new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(Error('停止尚未完成，请稍后重新检查')),30000);timer.unref?.();
      })]);
      return await this.getState(id);
    }finally{clearTimeout(timer);}
  }
  async launch(id,request){
    const a=await this.agent(id);if(!a?.runMaintenance)throw Error('当前会话不支持撤回维护');
    if(this.operations.has(id))throw Error('撤回正在执行');
    let resolve,reject;const done=new Promise((a,b)=>{resolve=a;reject=b;});
    // Attach a rejection consumer before scheduling the native, model-free control turn.
    done.catch(()=>{});
    await a.runMaintenance(async()=>{
      const s=this.session(id),plan=this.plans.get(request.planId);
      if(!request.recovery&&(!plan||plan.sessionId!==id||plan.expires<Date.now()||plan.seq!==s.seq))throw Error('确认已过期或会话已变化，请重新检查');
      const marker=createUserMessage({source:{kind:'dsh-rewind-plus'},content:[{type:'text',text:'Rewind maintenance'}]});
      if(this.operations.has(id))throw Error('撤回正在执行');
      const operation={...request,agent:a,undo:plan?.undo,marker:marker.id,start:s.seq,queue:new Map([...a.inbox.nextTurn.map(m=>[m.id,'next-turn']),...a.inbox.nextStep.map(m=>[m.id,'next-step'])]),resolve,reject};
      this.operations.set(id,operation);
      operation.claimTimer=setTimeout(()=>this.abandon(a,'撤回维护请求未被认领，请重新检查'),30000);
      operation.claimTimer.unref?.();
      try{a.steer(marker);}catch(error){this.abandon(a,error.message);throw error;}
    });
    return done;
  }
  async preStep(payload,next){
    const {agent,turn}=payload;let op=this.operations.get(agent.id);
    const stale=m=>m.source?.kind==='dsh-rewind-plus'&&m.id!==op?.marker;
    const messages=payload.messages.filter(m=>!stale(m));
    if(messages.length!==payload.messages.length){
      if(!messages.length)return {kind:'reject'};
      const downstream=next;
      next=async()=>{
        const result=await downstream();
        return result.kind==='enter'?{...result,messages:result.messages.filter(m=>!stale(m))}:result;
      };
    }
    const restoreInput=()=>{for(const m of [...messages].reverse())if(m.id!==op.marker)agent.inbox.prepend(op.queue.get(m.id)||'next-turn',m);};
    if(op?.marker&&!op.consumed){
      if(op.agent!==agent||!messages.some(m=>m.id===op.marker)){
        if(op.agent!==agent||![...agent.inbox.nextTurn,...agent.inbox.nextStep].some(m=>m.id===op.marker))
          this.abandon(op.agent,'撤回维护请求已丢弃');
        return next();
      }
      op.consumed=true;op.turn=turn;clearTimeout(op.claimTimer);restoreInput();
    }
    let st;try{st=await this.store.load(agent.id);}catch(error){
      if(op){op.error=error;op.consumed=true;op.turn=turn;return {kind:'reject'};}
      this.backupGap(agent,error);return next();
    }
    if(!op&&st.journal){op={recovery:true,start:agent.session.seq,queue:new Map(),resolve:()=>{},reject:()=>{}};this.operations.set(agent.id,op);}
    if(!op||op.consumed&&op.turn!==turn||op.executing){try{await this.checkpoint(agent,messages,payload.signal);}catch(error){if(payload.signal?.aborted||st.journal)throw error;this.backupGap(agent,error);}return next();}
    op.consumed=true;op.executing=true;op.turn=turn;
    // Claiming maintenance must never consume an already queued user prompt.
    if(!op.marker)restoreInput();
    try{
      if(op.recovery){await this.store.lock(agent.id,async()=>{const state=await this.store.load(agent.id);await this.recover(agent.session,state,true);});op.value={draft:null};}
      else op.value=await this.commit(agent.id,op.planId,op.draft,op);
    }catch(error){op.error=error;}
    return {kind:'reject'};
  }
  finish(session,event){
    const op=this.operations.get(session.id);if(!op||event.type!=='turn/end'||event.data.turn!==op.turn)return;
    void (async()=>{
      try{
        await this.flush(session);
        const state=await this.store.lock(session.id,async()=>{const st=await this.store.load(session.id),range={start:op.start,end:event.seq};st.internalRanges=mergeRanges([...(st.internalRanges||[]),range]);st.hiddenRanges=mergeRanges([...st.hiddenRanges,range]);if(!op.recovery&&!op.undo&&op.value&&st.undo.length)st.undo.at(-1).endSeq=event.seq;await this.store.save(st);return this.state(st);});
        if(op.error)op.reject(op.error);else op.resolve({...op.value,state});
      }catch(error){op.reject(error);}finally{this.operations.delete(session.id);void this.maintenance?.idle();}
    })();
  }
  async commit(id,planId,draft,operation){
    const plan=this.plans.get(planId);if(!plan||plan.sessionId!==id||plan.expires<Date.now())throw Error('确认已过期，请重新检查');
    if(plan.reason)throw Error(plan.reason);
    return this.store.lock(id,async()=>{
      const s=this.session(id),st=await this.store.load(id);
      if(st.revision!==plan.revision||eventsOf(s).slice(plan.seq).some(e=>!['agent/inbox/spliced','turn/start'].includes(e.type)))throw Error('确认后会话已发生变化，请重新检查');
      let release,changes=plan.changes,skipped=[...plan.skipped],fileReason=plan.fileReason;
      if(changes.length)try{
        if(this.waves.has(plan.root)||this.busy.has(plan.root))throw Error('工作区仍在执行操作');
        release=await lease(join(this.store.root,'workspace-locks',hash(plan.root)+'.json'));
        this.busy.add(plan.root);
      }catch(error){fileReason=error.message;changes=[];}
      try{
        await this.flush(s);
        // Original native history is immutable. Persist its cutoff instead of
        // duplicating the whole conversation in every undo entry and journal.
        const previous={context:{atSeq:s.seq},metadata:this.metadata(s),ranges:st.hiddenRanges,changes,root:plan.root,draft,changeIndex:st.changes.length,createdAt:Date.now()};
        const prepared=prepareReplay(s,plan.context,this.projections(),true);
        const endSeq=s.seq+prepared.length+(plan.metadata.cwd?1:0)+1;
        const internal={start:operation.start,end:endSeq+1};
        const after=structuredClone(st);after.revision++;after.internalRanges=mergeRanges([...(st.internalRanges||[]),internal]);after.hiddenRanges=mergeRanges([...plan.ranges,...after.internalRanges]);
        if(plan.undo)after.undo.pop();else {after.undo.push({...previous,endSeq});if(after.undo.length>20)after.undo.shift();}
        // Drop reverted mutations from subsequent plans; undo reinstates them from a durable saved stack.
        if(plan.undo){after.changes=st.undo.at(-1).previousChanges;after.checkpoints=st.undo.at(-1).previousCheckpoints;}
        else {after.undo.at(-1).previousChanges=structuredClone(st.changes);after.undo.at(-1).previousCheckpoints=structuredClone(st.checkpoints);after.changes=st.changes.slice(0,st.checkpoints[s.eventAt(plan.target.seq)?.data.id]?.changeIndex??st.changes.length);}
        after.pendingDraft={id:plan.id,draft:plan.undo?previousDraft(st.undo.at(-1)):plan.target};
        st.journal={id:plan.id,nativeStart:operation.start,root:plan.root,changes,context:previous.context,metadata:previous.metadata,after};await this.store.save(st);
        const restoredFiles=await this.files.restoreAvailable(plan.root,changes);
        skipped.push(...restoredFiles.skipped);
        st.journal.changes=restoredFiles.changes;
        if(!plan.undo)after.undo.at(-1).changes=restoredFiles.changes;
        const outcome=plan.undo?'对话已恢复':'对话已撤回';
        after.warning=fileReason?`${outcome}，文件保持现状：${fileReason}`:skipped.length?`${outcome}，${skipped.length} 个文件保留现状。`:null;
        await this.store.save(st);
        appendPrepared(s,prepared);
        if(plan.metadata.cwd)s.append('working-directory/change',{cwd:plan.metadata.cwd});
        s.append('plan/mode',{active:plan.metadata.plan});
        // Durable native marker identifies a completed transaction even if the sidecar rename is interrupted.
        appendPluginRecord(s,'plugin:dsh-rewind-plus/commit',{id:plan.id});
        await this.flush(s);
        after.journal=null;await this.store.save(after);this.plans.delete(planId);await this.maintenance?.unpin(planId);
        const restored=after.pendingDraft.draft;
        return {state:this.state(after),draft:restored,skipped};
      }catch(e){const current=await this.store.load(id);if(current.journal)try{await this.recover(s,current,true,true);}catch(recovery){throw new AggregateError([e,recovery],'恢复尚未完成，已保留备份并阻止新操作：'+recovery.message);}throw e;
      }finally{if(release){this.busy.delete(plan.root);await release();}}
    });
  }
  async recover(s,st,activeTurn=false,locked=false){
    const j=st.journal;if(!j)return;
    const committed=eventsOf(s).some(e=>e.type==='plugin:dsh-rewind-plus/commit'&&e.data.id===j.id);
    if(committed){await this.flush(s);j.after.journal=null;await this.store.save(j.after);return;}
    if(!locked){
      let release;
      if(j.changes.length)try{
        if(this.waves.has(j.root)||this.busy.has(j.root))throw Error('工作区正在执行操作');
        release=await lease(join(this.store.root,'workspace-locks',hash(j.root)+'.json'));this.busy.add(j.root);
      }catch(error){st.warning='文件保持现状：'+error.message;st.journal={...j,changes:[]};}
      try{return await this.recover(s,st,activeTurn,true);}finally{if(release){this.busy.delete(j.root);await release();}}
    }
    const recovered=eventsOf(s).findLast(e=>e.type==='plugin:dsh-rewind-plus/recovered'&&e.data.id===j.id);
    if(!recovered){
      const recoveredFiles=await this.files.recover(j.root,j.changes,'after',{bestEffort:true});
      if(recoveredFiles.skipped.length)st.warning=`中断操作已恢复，${recoveredFiles.skipped.length} 个文件保留现状。`;
      const replay=prepareReplay(s,j.context,this.projections(),activeTurn);appendPrepared(s,replay);
    if(j.metadata.cwd)s.append('working-directory/change',{cwd:j.metadata.cwd});s.append('plan/mode',{active:j.metadata.plan});
      appendPluginRecord(s,'plugin:dsh-rewind-plus/recovered',{id:j.id});
    }
    const internal={start:j.nativeStart,end:recovered?.seq??s.seq-1};st.hiddenRanges=mergeRanges([...st.hiddenRanges,internal]);st.internalRanges=mergeRanges([...(st.internalRanges||[]),internal]);await this.flush(s);st.journal=null;await this.store.save(st);
  }
}
function previousDraft(op){return op?.draft || {text:'',attachments:[]};}
