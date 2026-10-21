import { basename } from 'node:path';
import { projectOf } from '../hub-store.mjs';
import { sourceName } from '../message-source.mjs';
import { eventTime, actualUser } from '../context/core.mjs';
import { originalEvent } from '../context/original-search.mjs';
import { messageOf } from '../context/materials.mjs';
import { digest, splitSource, summaryIdentity, summaryFingerprint } from './core.mjs';
import { isBtwSession, btwDescriptor } from '../btw-policy.mjs';
import { BC_REFERENCE_TOOLS } from '../context/bc-policy.mjs';

const ignoredTools = new Set(['recall', 'memory_search', 'todo_write', 'verify_link', 'todos', ...BC_REFERENCE_TOOLS]);
const unreadableSessionErrors = new Set(['SessionPersistenceCorruptionError', 'SessionFormatUnsupportedError']);
// Successful reads persist their source revision so restarts skip unchanged
// archives. Bump when inspection output changes, to rebuild every index entry.
const INSPECTION_RULES = 'v2:';
// Activity is a coarse ordering signal; coalesce per-event writes.
const ACTIVITY_FLUSH_MS = 2000;
// Source text is encoded in input JSON, then again inside the request message.
// Count that escaping while retaining offsets into the original source text.
const requestTextBytes = text => {
  const code = text.charCodeAt(0);
  if (text.length === 2 && code >= 0xd800 && code <= 0xdbff && text.charCodeAt(1) >= 0xdc00 && text.charCodeAt(1) <= 0xdfff) return 4;
  if (text.length !== 1) return Buffer.byteLength(JSON.stringify(JSON.stringify(text))) - 6;
  if (code === 34 || code === 92) return 4;
  if (code < 32) return code === 8 || code === 9 || code === 10 || code === 12 || code === 13 ? 3 : 7;
  if (code >= 0xd800 && code <= 0xdfff) return 7;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
};
const userText = e => (e.data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
const material = blocks => (blocks || []).flatMap(b => b.type === 'text' ? [b.text || ''] : b.type === 'tool-result' ? [b.isError ? '[observed tool error]' : '[observed tool result]', material(b.content)] : ['reasoning','tool-call'].includes(b.type) ? [] : [`[${b.type} attachment reference retained; contents not read]`]).join('\n');

export class DreamSources {
  constructor(hub, store) { this.hub=hub; this.ctx=hub.ctx; this.store=store; this.revisions=new Map();this.activity=new Map();this.activityTimer=null;this.catalogHeaders=new Map();this.lifecycle=new AbortController();this.pending=new Set();this.closing=null; }
  track(run) {
    this.lifecycle.signal.throwIfAborted();
    const task=run();this.pending.add(task);
    return task.finally(()=>this.pending.delete(task));
  }
  signal(signal) { return signal?AbortSignal.any([signal,this.lifecycle.signal]):this.lifecycle.signal; }
  close() {
    if(this.closing)return this.closing;
    this.flushActivity();
    this.lifecycle.abort(Error('Dream 来源读取正在退出'));
    return this.closing=Promise.allSettled([...this.pending]);
  }
  persistence() { return this.ctx.get?.('sessionPersistence') || this.ctx.sessionPersistence; }
  inWorkspace(id) {
    const registry=this.ctx.get?.('workspaceRegistry')||this.ctx.workspaceRegistry;
    return Boolean(registry?.list?.().some(workspace=>workspace.sessionIds.includes(id)));
  }
  projectlessKnown(header) {
    if(typeof header?.id!=='string'||!header.id||this.store.session(header.id)?.projectless!==true)return false;
    try { return !this.inWorkspace(header.id); }
    catch { return true; } // Optional registry failure cannot widen a known private scope or block native chat.
  }
  scopeFor(header,sideQuestion=false,signal) { return this.track(()=>this.classifyScope(header,sideQuestion,this.signal(signal))); }
  async classifyScope(header,sideQuestion=false,signal) {
    let projectless=false,current=header;
    const seen=new Set();
    if(this.hub.projectless&&!this.inWorkspace(header.id))while(current) {
      signal?.throwIfAborted();
      if(seen.has(current.id))throw Error('会话继承关系形成循环');seen.add(current.id);
      if(this.inWorkspace(current.id))break;
      const saved=this.hub.store.peek?.(current.id)||this.store.session(current.id);
      if(await this.hub.projectless.owns(current.cwd||saved?.cwd,{requireDirectory:false})) { projectless=true;break; }
      signal?.throwIfAborted();
      const parent=current.parentSession||saved?.parentSession;
      if(!parent)break;
      current=this.catalogHeaders.get(parent)||this.ctx.sessions?.get?.(parent)?.header||this.hub.store.peek?.(parent);
      if(!current) { await this.headers(signal);current=this.catalogHeaders.get(parent); }
    }
    this.lifecycle.signal.throwIfAborted();signal?.throwIfAborted();
    return this.scope(header,sideQuestion,projectless);
  }
  async safeScope(header,sideQuestion=false,signal) {
    try { return await this.scopeFor(header,sideQuestion,signal); }
    catch(error) {
      this.lifecycle.signal.throwIfAborted();signal?.throwIfAborted();
      // Apply the same temporary fence to cold scans and live creation. Otherwise
      // a failed scan could leave an old shared contribution eligible for injection.
      this.hub.dream?.notice?.(error);
      return {mode:'session',project:'@unclassified',shared:false,projectless:true,scopeError:String(error.message).slice(0,1000),...(sideQuestion?{sideQuestion:true}:{})};
    }
  }
  refreshScope(header,signal) {
    return this.track(async()=>{
      signal=this.signal(signal);
      const scope=await this.safeScope(header,false,signal);
      const old=this.store.session(header.id);
      signal.throwIfAborted();
      this.store.saveSession({...old,id:header.id,title:old?.title||header.title||header.id,...scope,
        projectless:Boolean(scope.projectless),scopeError:scope.scopeError,...(old?.readError?{shared:false}:{}),
        activity:old?.activity||0,createdAt:Number(header.createdAt)||old?.createdAt||0,cwd:header.cwd||'',parentSession:header.parentSession});
      return scope;
    });
  }
  scope(header, sideQuestion = false, projectless = this.projectlessKnown(header)) {
    sideQuestion ||= isBtwSession(this.ctx.sessions?.get?.(header.id)) || this.store.session(header.id)?.sideQuestion === true;
    if(projectless)return {mode:'session',project:'@unclassified',shared:false,projectless:true,...(sideQuestion?{sideQuestion:true}:{})};
    const saved=this.hub.store.peek?.(header.id), archive=this.hub.context.store.peek(header.id);
    let parent=header.parentSession, inherited=saved, seen=new Set([header.id]);
    while(parent) {
      if(seen.has(parent))throw Error('会话继承关系形成循环');seen.add(parent);
      const p=this.hub.store.peek?.(parent);if(!p)break;
      inherited={...p,...inherited};parent=p.parentSession;
    }
    const mode=sideQuestion || archive?.binding?.scope==='session'?'session':saved?.memoryScope||inherited?.memoryScope||archive?.binding?.scope||this.hub.config().memoryScope||'project';
    const cwd=header.cwd||saved?.cwd;
    const project=mode==='session'?(cwd?projectOf(cwd):'@unclassified'):archive?.binding?.project||inherited?.workflowProject||(cwd?projectOf(cwd):'@unclassified');
    return {mode,project,shared:mode!=='session',...(sideQuestion?{sideQuestion:true}:{})};
  }
  async headers(signal) {
    const p=this.persistence();
    if(!p?.list)throw Error('宿主没有可用的会话目录接口');
    const entries=await p.list({signal});
    this.lifecycle.signal.throwIfAborted();signal?.throwIfAborted();
    this.catalogHeaders=new Map(entries.map(entry=>[entry.header.id,entry.header]));
    return entries;
  }
  async sync(signal,options) { return this.track(()=>this.syncIndex(this.signal(signal),options)); }
  excludeUnreadable(id,error,signal,{header,scope,publishWarnings=true}={}) {
    this.lifecycle.signal.throwIfAborted();signal?.throwIfAborted();
    if(!unreadableSessionErrors.has(error?.name))return false;
    const old=this.store.session(id);
    // Keep verified scope and completed memory. An unreadable archive cannot
    // admit new facts or participate in shared aggregation until read succeeds.
    if(!old&&!header)return false;
    this.store.saveSession({...old,id,...scope,title:old?.title||header?.title||id,sourceRevision:undefined,
      available:false,shared:false,readError:String(error.message).slice(0,4000),
      createdAt:old?.createdAt||Number(header?.createdAt)||0,cwd:header?.cwd||old?.cwd||''});
    if(publishWarnings) {
      const current=this.store.session(id),warnings=(this.store.meta('indexWarnings')||[]).filter(warning=>warning.sessionId!==id);
      warnings.push({sessionId:id,title:current.title,project:current.project,scope:current.mode,error:current.readError});
      this.store.setMeta('indexWarnings',warnings);
    }
    return true;
  }
  async syncIndex(signal,{retryUnreadable=false}={}) {
    const entries=await this.headers(signal);
    signal.throwIfAborted();
    const found=new Set(entries.map(entry=>entry.header.id)),warnings=[];
    for(const entry of entries) {
      signal?.throwIfAborted();
      const id=entry.header.id, old=this.store.session(id);
      const previous=this.revisions.has(id)?this.revisions.get(id):old?.sourceRevision?.startsWith(INSPECTION_RULES)?old.sourceRevision.slice(INSPECTION_RULES.length):undefined;
      const scope=await this.safeScope(entry.header,false,signal);
      if(scope.scopeError) {
        signal.throwIfAborted();
        this.store.saveSession({...old,id,title:old?.title||entry.header.title||id,...scope,
          activity:old?.activity||0,createdAt:old?.createdAt||Number(entry.header.createdAt)||0,cwd:entry.header.cwd||old?.cwd||'',parentSession:entry.header.parentSession});
        if(old?.readError)warnings.push({sessionId:id,title:old.title,project:scope.project,scope:scope.mode,error:old.readError});
        continue;
      }
      const unchangedFailure=!retryUnreadable&&old?.readError&&previous===entry.revision&&old.project===scope.project&&old.mode===scope.mode;
      if(!unchangedFailure&&(!old || previous!==entry.revision || old.available===false || old.scopeError || old.project!==scope.project || old.mode!==scope.mode || old.shared!==scope.shared || Boolean(old.projectless)!==Boolean(scope.projectless))) {
        try { await this.inspect(id,signal); }
        catch(error) {
          if(!this.excludeUnreadable(id,error,signal,{header:entry.header,scope,publishWarnings:false}))throw error;
        }
      }
      this.revisions.set(id,entry.revision);
      let current=this.store.session(id);
      // Unreadable archives keep retrying after restart; only verified reads persist.
      if(current&&!current.readError&&typeof entry.revision==='string'&&current.sourceRevision!==INSPECTION_RULES+entry.revision) {
        current={...current,sourceRevision:INSPECTION_RULES+entry.revision};this.store.saveSession(current);
      }
      if(current?.readError)warnings.push({sessionId:id,title:current.title,project:current.project,scope:current.mode,error:current.readError});
    }
    for(const old of this.store.sessions())if(!found.has(old.id)&&old.available!==false&&!this.ctx.sessions?.get?.(old.id)){this.store.saveSession({...old,available:false,shared:false});this.revisions.delete(old.id);}
    if(JSON.stringify(this.store.meta('indexWarnings'))!==JSON.stringify(warnings))this.store.setMeta('indexWarnings',warnings);
    if(this.store.meta('indexError')!==null)this.store.setMeta('indexError',null);
    return entries.length;
  }
  observe(session,event) {
    const header=session.header;
    if(isBtwSession(session)) {
      const old=this.store.session(session.id);
      this.store.saveSession({...old,id:session.id,title:old?.title||header.title||session.id,...this.scope({...header,id:session.id},true),activity:0,createdAt:header.createdAt||0,cwd:header.cwd||''});
      this.revisions.set(session.id,undefined);return;
    }
    if(event.type==='session/title'&&typeof event.data?.title==='string'){
      const old=this.store.session(session.id);
      this.store.saveSession(old?{...old,title:event.data.title}:{id:session.id,title:event.data.title,...this.scope({...header,id:session.id}),activity:0,createdAt:header.createdAt||0,cwd:header.cwd||''});
      this.revisions.set(session.id,undefined);return;
    }
    const genuine=actualUser(event)||(['assistant/message','tool/result','tool/call'].includes(event.type)&&!sourceName(messageOf(event)?.source));
    if(!genuine) { if(event.type==='turn/end')this.flushActivity(session.id); return; }
    // An unknown in-memory revision forces the next sync to re-read this source.
    this.revisions.set(session.id,undefined);
    this.activity.set(session.id,{session,at:Math.max(this.activity.get(session.id)?.at||0,eventTime(event)||0)});
    if(!this.activityTimer) { this.activityTimer=setTimeout(()=>this.flushActivity(),ACTIVITY_FLUSH_MS);this.activityTimer.unref?.(); }
  }
  flushActivity(only) {
    for(const id of only===undefined?[...this.activity.keys()]:this.activity.has(only)?[only]:[]) {
      const {session,at}=this.activity.get(id);this.activity.delete(id);
      try {
        const header=session.header, old=this.store.session(id), scope=this.scope({...header,id});
        this.store.saveSession({ ...old,id,title:old?.title||header.title||id,...scope,...(old?.readError?{shared:false}:{}),
          activity:Math.max(old?.activity||0,at),createdAt:header.createdAt||old?.createdAt||0,cwd:header.cwd||'' });
      } catch(error) { this.ctx.logger?.warn?.('Dream 会话活动记录未保存：%s',error.message); }
    }
    if(!this.activity.size&&this.activityTimer) { clearTimeout(this.activityTimer);this.activityTimer=null; }
  }
  async read(id,signal) { return this.track(()=>this.readSnapshot(id,this.signal(signal))); }
  async readSnapshot(id,signal) {
    const live=this.ctx.sessions?.get?.(id);
    // Drain already-written source events, without starting an agent or changing its surface.
    if(live&&this.ctx.sessions?.flush)await this.ctx.sessions.flush(live);
    signal.throwIfAborted();
    const p=this.persistence();
    if(!p?.open)throw Error('宿主没有可用的会话历史读取接口');
    const handle=await p.open(id,'read',{signal});
    try {
      signal.throwIfAborted();
      const {events}=await handle.read(0,undefined,{signal});
      signal.throwIfAborted();
      return {header:structuredClone(handle.header),inherited:handle.inheritedEventCount||0,events:structuredClone(events)};
    } finally { await handle.close(); }
  }
  inspect(id,signal) { return this.track(()=>this.inspectSnapshot(id,this.signal(signal))); }
  async inspectSnapshot(id,signal) {
    const snapshot=await this.read(id,signal), {header,events,inherited}=snapshot;
    this.lifecycle.signal.throwIfAborted();signal?.throwIfAborted();
    const old=this.store.session(id), sideQuestion=header.origin==='subagent'&&Boolean(btwDescriptor(events,inherited)), scope=await this.safeScope({...header,id},sideQuestion,signal);
    this.lifecycle.signal.throwIfAborted();signal?.throwIfAborted();
    let activity=0,title=header.title||old?.title||id;
    for(const event of events) {
      if(actualUser(event)||(['assistant/message','tool/result','tool/call'].includes(event.type)&&!sourceName(messageOf(event)?.source)))activity=Math.max(activity,eventTime(event)||0);
      if(event.type==='session/title'&&typeof event.data?.title==='string')title=event.data.title;
    }
    // Generation identity is immutable metadata, not file mtime or a representation carrier.
    const generation=digest([header.id,header.version,header.createdAt,header.parentSession,inherited]);
    const value={id,title,...scope,available:true,activity:activity||Number(header.createdAt)||0,createdAt:Number(header.createdAt)||0,cwd:header.cwd||'',parentSession:header.parentSession,generation,inherited,eventCount:events.length,eventDigest:digest(events)};
    this.store.saveSession(value);return {...snapshot,metadata:value};
  }
  async manifest(id,{signal,deepAgeMs,cut,before=Infinity}) {
    const capture=await this.inspect(id,signal), {metadata,events,inherited}=capture;
    if(metadata.sideQuestion)throw Error('/btw 侧问不参与后台记忆整理。');
    const agent=this.ctx.agents?.get?.(id),running=agent&&agent.status!=='idle';
    if(cut&&cut.generation!==metadata.generation)throw Error('会话日志已迁移；请新建 Dream 作业以重新固定来源');
    const through=Math.min(cut?.through??Infinity,running?(events.findLast(e=>e.type==='turn/end')?.seq??-1):events.length-1);
    const archive=structuredClone(this.hub.context.store.peek(id)),items=[];
    for(const r of archive?.records||[]) {
      if((r.createdAt||0)>before||!(r.originalSeqs||r.sourceSeqs||[]).some(seq=>seq>=inherited)||Math.max(...(r.originalSeqs||r.sourceSeqs||[Infinity]))>through)continue;
      // Historical records remain the owners of their decision summaries even
      // if their factual representation was folded into a newer record.
      for(const d of r.decisions||[]) {
        if(d.seq<inherited||d.seq>through)continue;
        const text=`用户决定（event ${d.seq}）：${d.text}`,fingerprint=digest([d.text,d.quote]),key=`decision:${metadata.generation}:${d.seq}:${digest(d.quote)}`;
        const source={kind:'summary',sessionId:id,recordId:r.id,generation:metadata.generation,identity:key,fingerprint,from:0,to:text.length,text,originalSeqs:[d.seq]};source.id=`source:${digest(source)}`;
        items.push({key,fingerprint,source,text});
      }
      if(r.mergedInto||!r.summary)continue;
      const text=r.summary,identity=summaryIdentity(r), fingerprint=summaryFingerprint({...r,decisions:[]});
      for(const part of splitSource(text,5000,requestTextBytes)) {
        const key=`summary:${metadata.generation}:${identity}:${part.from}`;
        const source={kind:'summary',sessionId:id,recordId:r.id,generation:metadata.generation,identity,fingerprint,
          from:part.from,to:part.to,text:part.text,originalSeqs:r.originalSeqs||r.sourceSeqs||[]};
        source.id=`source:${digest(source)}`;
        items.push({key,fingerprint:digest([fingerprint,part.from,part.text]),source,text:`[summary · original events ${Math.min(...source.originalSeqs)}..${Math.max(...source.originalSeqs)}]\n${part.text}`});
      }
    }
    const cold=!running&&metadata.activity>0&&this.store.now()-metadata.activity>=deepAgeMs;
    if(cold) {
      const calls=new Map();
      for(const e of events.slice(0,through+1)) {
        const m=messageOf(e);
        for(const b of m?.content||[])if(b.type==='tool-call')calls.set(b.id,b.name);
        if(e.type==='tool/call')calls.set(e.data?.callId||e.data?.toolCallId||e.data?.id,e.data?.toolName||e.data?.name);
        if(e.seq<inherited)continue;
        let text='',speaker='';
        if(actualUser(e)){text=userText(e);speaker='user';}
        else if(e.type==='assistant/message'&&!sourceName(m?.source)){text=material(m?.content);speaker='assistant';}
        else if(e.type==='tool/result') {
          const name=calls.get(e.data?.toolCallId||m?.toolCallId)||e.data?.toolName;
          if(ignoredTools.has(name))continue;
          text=material(m?.content||e.data?.content||e.data?.result?.content);speaker='tool';
          if(e.data?.isError||e.data?.error||m?.isError)text='[observed error; not a successful action]\n'+text;
        }
        if(!text.trim())continue;
        const eventHash=digest([e.type,e.data]);
        for(const part of splitSource(text,5000,requestTextBytes)) {
          const source={kind:'raw',sessionId:id,generation:metadata.generation,seq:e.seq,eventHash,speaker,from:part.from,to:part.to};
          source.id=`source:${digest(source)}`;
          items.push({key:`raw:${metadata.generation}:${e.seq}:${part.from}`,fingerprint:digest([eventHash,part.from,part.to]),source,text:`[${speaker} · event ${e.seq}]\n${part.text}`});
        }
      }
    }
    return {metadata,through,cold,completeCut:through===events.length-1&&!(archive?.records||[]).some(r=>(r.createdAt||0)>before),items:[...new Map(items.map(x=>[x.key,x])).values()]};
  }
  stamp(id,deepAgeMs){
    const s=this.store.session(id);if(!s?.eventDigest)return null;
    const archive=this.hub.context.store,identity=archive.identity&&archive.path?archive.identity(archive.path(id)):digest(archive.peek(id)||null);
    const agent=this.ctx.agents?.get?.(id),running=Boolean(agent&&agent.status!=='idle');
    return digest([s.eventDigest,s.project,s.shared,identity,running,!running&&s.activity>0&&this.store.now()-s.activity>=deepAgeMs]);
  }
  async sourceText(ref,{signal}={}) {
    if(ref.kind==='summary')return ref.text;
    if(ref.kind!=='raw')throw Error('未知原始来源类型');
    const {metadata,events}=await this.inspect(ref.sessionId,signal),e=events[ref.seq];
    if(metadata.generation!==ref.generation||!e||digest([e.type,e.data])!==ref.eventHash)throw Error('来源已迁移或改变；旧引用不能指向其他原文');
    const m=messageOf(e);
    let text=actualUser(e)?userText(e):material(m?.content||e.data?.content||e.data?.result?.content);
    if(ref.speaker==='tool'&&(e.data?.isError||e.data?.error||m?.isError))text='[observed error; not a successful action]\n'+text;
    return text.slice(ref.from,ref.to);
  }
  async validateBatch(metadata,batch,signal) {
    const handle=await this.persistence().open(metadata.id,'read',{signal});
    try {
      const header=handle.header,scope=await this.scopeFor({...header,id:metadata.id},false,signal);
      const generation=digest([header.id,header.version,header.createdAt,header.parentSession,handle.inheritedEventCount||0]);
      if(generation!==metadata.generation||scope.project!==metadata.project||scope.shared!==metadata.shared)throw Error('会话来源或共享范围已改变；停止发布');
      const records=this.hub.context.store.peek(metadata.id)?.records||[];
      for(const {source} of batch){
        signal?.throwIfAborted();
        if(source.kind==='raw'){
          const {events}=await handle.read(source.seq,1,{signal}),event=events.find(e=>e.seq===source.seq);
          if(!event||digest([event.type,event.data])!==source.eventHash)throw Error('原文在生成期间改变；请重新运行 Dream');
        }else{
          const r=records.find(r=>r.id===source.recordId);
          const valid=source.identity.startsWith('decision:')?r?.decisions?.some(d=>digest([d.text,d.quote])===source.fingerprint&&source.originalSeqs.includes(d.seq)):
            r&&!r.mergedInto&&summaryIdentity(r)===source.identity&&summaryFingerprint({...r,decisions:[]})===source.fingerprint;
          if(!valid)throw Error('摘要在生成期间改变；请重新运行 Dream');
        }
      }
    }finally{await handle.close();}
  }
  async original(id,from,to,signal) {
    signal?.throwIfAborted();
    if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from||to-from>200)throw Error('原文范围应为不超过 201 个事件的非负整数区间');
    const {header,events,inherited=0}=await this.read(id,signal);
    signal?.throwIfAborted();
    if(header?.id!==undefined&&header.id!==id)throw Error('目标会话头部与 sessionId 不一致');
    if(!Array.isArray(events)||!Number.isSafeInteger(inherited)||inherited<0||inherited>events.length)throw Error('目标会话原始事件范围无效');
    const calls=new Map(),result=[];
    for(let index=0;index<events.length&&index<=to;index++) {
      signal?.throwIfAborted();
      const event=events[index];
      if(!event||event.seq!==index)throw Error('目标会话原始事件序列不完整');
      const original=originalEvent(event,calls,index>=from);
      if(index>=from)result.push({seq:event.seq,type:event.type,...(original||{text:''})});
    }
    return result;
  }
  projectTitle(project) { return project==='@unclassified'?'未归类':basename(project)||project||'未归类'; }
}
