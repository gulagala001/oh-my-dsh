import { Session } from '@deepseek-ai/dsh-session';
import { sessionFormatCatalog } from '../lib/format.mjs';
import { randomUUID } from 'node:crypto';
export const eventsOf = session => session.snapshotEvents();
export const hidden = (ranges,seq) => ranges.some(r=>seq>=r.start && seq<=r.end);
export function snapshot(session) {
  return session.surface.nodes.map(seq=>{
    const event=session.eventAt(seq), message=session.surface.deriveEventMessage(event);
    if(!message) return null;
    const data=structuredClone(event.data);
    if(event.type==='user/message')return {type:event.type,data:structuredClone(message),source:seq};
    data.message=structuredClone(message);
    if(event.type==='assistant/message'){delete data.usage;data.stream=[];}
    return {type:event.type,data,source:seq};
  }).filter(Boolean);
}
export function beforeMessage(session,seq,projections=[]) {
  const events=eventsOf(session).filter(e=>e.seq<seq);
  return snapshot(Session.fromRestore(session.id,events,session.header,Math.min(session.inheritedEventCount,events.length),'shared-frozen',projections));
}
export function userTarget(session,seq,ranges=[]) {
  const e=session.eventAt(seq);
  if(e?.type!=='user/message' || e.data.source?.kind!=='user' || hidden(ranges,seq))throw Error('这条用户消息不在当前对话中');
  return {seq,text:e.data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n'),attachments:e.data.content.map((b,contentIndex)=>({...b,contentIndex})).filter(b=>b.type==='image'||b.type==='file')};
}
/** Native append-only surface rewrite. No host log, session id, or agent turn counter is replaced. */
export function prepareReplay(session,context,projections=[],activeTurn=false) {
  if(!Array.isArray(context)){
    if(!Number.isSafeInteger(context?.atSeq)||context.atSeq<0||context.atSeq>session.seq)throw Error('恢复历史引用无效');
    context=beforeMessage(session,context.atSeq,projections);
  }
  const clone=Session.fromRestore(session.id,eventsOf(session),session.header,session.inheritedEventCount,'shared-frozen',projections);
  const start=session.seq;
  const history=eventsOf(clone),latest=history.findLast(e=>e.type==='turn/start')?.data.turn||0,turn=activeTurn?latest:latest+1;
  if(!activeTurn)clone.append('turn/start',{turn});
  const step=1+(activeTurn?(history.findLast(e=>e.type==='step/start'&&e.data.turn===turn)?.data.step||0):0);
  clone.append('step/start',{turn,step});
  const desired=structuredClone(context),current=snapshot(session);
  const message=item=>item.type==='user/message'?item.data:item.data.message;
  const normalized=item=>{const {id,...rest}=message(item);return JSON.stringify(rest);};
  let common=0;while(common<desired.length&&common<current.length&&normalized(desired[common])===normalized(current[common]))common++;
  const nodes=[...clone.surface.nodes];
  const keptSeq=common?current[common-1].source:-1;
  let tail=nodes.filter(seq=>seq>keptSeq);
  const callIds=new Map();
  for(const item of desired.slice(0,common))for(const b of message(item).content)if(b.type==='tool-call')callIds.set(b.id,b.id);
  desired.splice(0,common);
  const head=tail[0]!==undefined&&clone.eventAt(tail[0]).type==='system/message'&&tail[0]===nodes[0]?tail.shift():undefined;
  if(head!==undefined){
    const system=desired[0]?.type==='system/message'?desired.shift():null;
    clone.append('system/message',{turn,step,message:system?.data.message||{id:randomUUID(),role:'system',source:{kind:'system-prompt'},content:[]}},
      {surfaceOp:{op:'replace',startSeq:head,endSeq:head},sourceEventSeqs:[head]});
  }
  if(tail.length)clone.append('developer/message',{turn,step,message:{id:randomUUID(),role:'developer',source:{kind:'dsh-rewind-plus'},content:[]}},
    {surfaceOp:{op:'replace',startSeq:tail[0],endSeq:tail.at(-1)},sourceEventSeqs:tail});
  for(const item of desired){const m=message(item);m.id=randomUUID();for(const b of m.content)if(b.type==='tool-call'){const old=b.id;const fresh='rewind_'+randomUUID().replaceAll('-','');callIds.set(old,fresh);b.id=fresh;}if(m.role==='tool'){if(!callIds.has(m.toolCallId))throw Error('历史中有未配对的工具结果，无法安全恢复');m.toolCallId=callIds.get(m.toolCallId);if(m.source?.callId)m.source.callId=m.toolCallId;}}
  for(const item of desired){
    const data=structuredClone(item.data);if(item.type!=='user/message'){data.turn=turn;data.step=step;}
    clone.append(item.type,data,{surfaceOp:'append',...(item.type==='assistant/message'?{}:{sourceEventSeqs:[item.source]})});
    if(item.type==='assistant/message')for(const block of data.message.content)if(block.type==='tool-call')clone.append('tool/call',{turn,step,callId:block.id,name:block.name,arguments:block.arguments});
  }
  clone.append('step/end',{turn,step});
  const prepared=eventsOf(clone).slice(start);
  clone.append('turn/end',{turn,reason:{kind:'completed'}});
  validateHistory(clone);
  Session.create(session.id,eventsOf(clone),session.header,session.inheritedEventCount,projections);
  return activeTurn?prepared:eventsOf(clone).slice(start);
}
export function appendPrepared(session,events) {
  for(const e of events) {
    if(eventsOf(session).length!==e.seq)throw Error('会话在确认后发生变化，请重新检查');
    const {surfaceOp,sourceEventSeqs}=e;
    session.append(e.type,e.data,{...(surfaceOp===undefined?{}:{surfaceOp}),...(sourceEventSeqs?{sourceEventSeqs}:{})});
  }
}

export function validateHistory(session){
  const header=sessionFormatCatalog.encodeCurrentHeader({...session.header,isSeeded:session.header.isSeeded??false,delegationDepth:session.header.delegationDepth??0},session.inheritedEventCount);
  const restore=sessionFormatCatalog.createRestore(header,{recovery:'strict',validation:'current'});
  for(const event of eventsOf(session))restore.decodeRow(sessionFormatCatalog.encodeCurrentEvent(event));
  return restore.finish();
}

export function mergeRanges(ranges){const result=[];for(const r of [...ranges].sort((a,b)=>a.start-b.start)){const last=result.at(-1);if(last&&r.start<=last.end+1)last.end=Math.max(last.end,r.end);else result.push({...r});}return result;}
