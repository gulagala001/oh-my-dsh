import { basename } from 'node:path';
import { projectOf } from '../hub-store.mjs';
import { sourceName } from '../message-source.mjs';
import { eventTime, actualUser, textBlocks } from '../context/core.mjs';
import { messageOf } from '../context/materials.mjs';
import { digest, splitSource, summaryIdentity, summaryFingerprint } from './core.mjs';
import { isBtwSession, btwDescriptor } from '../btw-policy.mjs';

const ignoredTools = new Set(['recall', 'memory_search', 'todo_write', 'verify_link', 'todos']);
// Source text is encoded in input JSON, then again inside the request message.
// Count that escaping while retaining offsets into the original source text.
const requestTextBytes = text => Buffer.byteLength(JSON.stringify(JSON.stringify(text))) - 6;
const userText = e => (e.data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
const material = blocks => (blocks || []).flatMap(b => b.type === 'text' ? [b.text || ''] : b.type === 'tool-result' ? [b.isError ? '[observed tool error]' : '[observed tool result]', material(b.content)] : ['reasoning','tool-call'].includes(b.type) ? [] : [`[${b.type} attachment reference retained; contents not read]`]).join('\n');

export class DreamSources {
  constructor(hub, store) { this.hub=hub; this.ctx=hub.ctx; this.store=store; this.revisions=new Map();this.lifecycle=new AbortController();this.pending=new Set();this.closing=null; }
  track(run) {
    this.lifecycle.signal.throwIfAborted();
    const task=run();this.pending.add(task);
    return task.finally(()=>this.pending.delete(task));
  }
  signal(signal) { return signal?AbortSignal.any([signal,this.lifecycle.signal]):this.lifecycle.signal; }
  close() {
    if(this.closing)return this.closing;
    this.lifecycle.abort(Error('Dream 来源读取正在退出'));
    return this.closing=Promise.allSettled([...this.pending]);
  }
  persistence() { return this.ctx.get?.('sessionPersistence') || this.ctx.sessionPersistence; }
  scope(header, sideQuestion = false) {
    const saved=this.hub.store.peek?.(header.id), archive=this.hub.context.store.peek(header.id);
    let parent=header.parentSession, inherited=saved, seen=new Set([header.id]);
    while(parent) {
      if(seen.has(parent))throw Error('会话继承关系形成循环');seen.add(parent);
      const p=this.hub.store.peek?.(parent);if(!p)break;
      inherited={...p,...inherited};parent=p.parentSession;
    }
    sideQuestion ||= isBtwSession(this.ctx.sessions?.get?.(header.id)) || this.store.session(header.id)?.sideQuestion === true;
    const mode=sideQuestion || archive?.binding?.scope==='session'?'session':saved?.memoryScope||inherited?.memoryScope||archive?.binding?.scope||this.hub.config().memoryScope||'project';
    const cwd=header.cwd||saved?.cwd;
    const project=mode==='session'?(cwd?projectOf(cwd):'@unclassified'):archive?.binding?.project||inherited?.workflowProject||(cwd?projectOf(cwd):'@unclassified');
    return {mode,project,shared:mode!=='session',...(sideQuestion?{sideQuestion:true}:{})};
  }
  async headers(signal) {
    const p=this.persistence();
    if(!p?.list)throw Error('宿主没有可用的会话目录接口');
    return p.list({signal});
  }
  async sync(signal) { return this.track(()=>this.syncIndex(this.signal(signal))); }
  async syncIndex(signal) {
    const entries=await this.headers(signal);
    signal.throwIfAborted();
    const found=new Set(entries.map(entry=>entry.header.id)),warnings=[];
    for(const entry of entries) {
      signal?.throwIfAborted();
      const id=entry.header.id, old=this.store.session(id), previous=this.revisions.get(id);
      const scope=this.scope(entry.header);
      const unchangedFailure=old?.readError&&previous===entry.revision&&old.project===scope.project&&old.mode===scope.mode;
      if(!unchangedFailure&&(!old || previous!==entry.revision || old.available===false || old.project!==scope.project || old.mode!==scope.mode || old.shared!==scope.shared)) {
        try { await this.inspect(id,signal); }
        catch(error) {
          signal?.throwIfAborted();
          if(error.name!=='SessionPersistenceCorruptionError')throw error;
          // A broken archive must not prevent indexing unrelated sessions. Keep
          // its last readable memory, but withdraw it from shared aggregation.
          this.store.saveSession({...old,id,title:old?.title||entry.header.title||id,...scope,
            available:false,shared:false,readError:String(error.message).slice(0,4000),
            createdAt:old?.createdAt||Number(entry.header.createdAt)||0,cwd:entry.header.cwd||old?.cwd||''});
        }
      }
      this.revisions.set(id,entry.revision);
      const current=this.store.session(id);
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
      this.revisions.delete(session.id);return;
    }
    if(event.type==='session/title'&&typeof event.data?.title==='string'){
      const old=this.store.session(session.id);
      this.store.saveSession(old?{...old,title:event.data.title}:{id:session.id,title:event.data.title,...this.scope({...header,id:session.id}),activity:0,createdAt:header.createdAt||0,cwd:header.cwd||''});
      this.revisions.delete(session.id);return;
    }
    const genuine=actualUser(event)||(['assistant/message','tool/result','tool/call'].includes(event.type)&&!sourceName(messageOf(event)?.source));
    if(!genuine)return;
    const old=this.store.session(session.id), scope=this.scope({...header,id:session.id});
    this.store.saveSession({ ...old,id:session.id,title:old?.title||header.title||session.id,...scope,...(old?.readError?{shared:false}:{}),
      activity:Math.max(old?.activity||0,eventTime(event)||0),createdAt:header.createdAt||old?.createdAt||0,cwd:header.cwd||'' });
    this.revisions.delete(session.id);
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
  async inspect(id,signal) {
    const snapshot=await this.read(id,signal), {header,events,inherited}=snapshot;
    this.lifecycle.signal.throwIfAborted();signal?.throwIfAborted();
    const old=this.store.session(id), sideQuestion=header.origin==='subagent'&&Boolean(btwDescriptor(events,inherited)), scope=this.scope({...header,id},sideQuestion);
    let activity=0,title=header.title||old?.title||id;
    for(const event of events) {
      if(actualUser(event)||(['assistant/message','tool/result','tool/call'].includes(event.type)&&!sourceName(messageOf(event)?.source)))activity=Math.max(activity,eventTime(event)||0);
      if(event.type==='session/title'&&typeof event.data?.title==='string')title=event.data.title;
    }
    // Generation identity is immutable metadata, not file mtime or a representation carrier.
    const generation=digest([header.id,header.version,header.createdAt,header.parentSession,inherited]);
    const value={id,title,...scope,available:true,activity:activity||Number(header.createdAt)||0,createdAt:Number(header.createdAt)||0,cwd:header.cwd||'',generation,inherited,eventCount:events.length,eventDigest:digest(events)};
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
      const header=handle.header,scope=this.scope({...header,id:metadata.id});
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
    const {events}=await this.read(id,signal);
    if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from||to-from>200)throw Error('原文范围应为不超过 201 个事件的非负整数区间');
    return events.filter(e=>e.seq>=from&&e.seq<=to).map(e=>({seq:e.seq,type:e.type,text:actualUser(e)?userText(e):textBlocks(messageOf(e)?.content||e.data?.content||[])}));
  }
  projectTitle(project) { return project==='@unclassified'?'未归类':basename(project)||project||'未归类'; }
}
