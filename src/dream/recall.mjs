import { nodeKey, LIMITS, cursorFor, readCursor, splitSource, digest } from './core.mjs';
import { recordText } from '../context/core.mjs';
import { describeAsset, attachmentsOf, combineAssets, messageOf } from '../context/materials.mjs';

export const usesDreamRecall = args => args.memory !== undefined || args.reference !== undefined || args.sessionId !== undefined;
const shortRef = r => ({reference:r.id,kind:r.kind,...(r.sessionId?{sessionId:r.sessionId}:{}),...(r.key?{key:r.key,revision:r.revision}:{}),...(r.seq!=null?{seq:r.seq}:{}),...(r.recordId?{recordId:r.recordId}: {})});
export function archiveRecord(hub, sessionId, id) {
  const archive=hub.context.store.peek(sessionId);
  const record=archive?.records.find(r=>r.id===id)||archive?.inheritedRecords?.find(r=>r.id===id);
  if(!record)throw Error('该会话没有此摘要记录；原始引用未被替换');
  return record;
}
export async function readDream(hub,args,requester,signal){
  signal?.throwIfAborted();
  const dream=hub.dream,store=dream.store;
  if(args.reference&&(args.memory||args.id||args.from!==undefined||args.to!==undefined||args.asset!==undefined))throw Error('来源引用不能与其他读取目标组合');
  if(args.memory&&(args.id||args.from!==undefined||args.to!==undefined||args.asset!==undefined))throw Error('记忆目录不能与原文或附件参数组合');
  if(args.memory==='projects'||args.memory==='sessions'){
    const page=store.catalog({kind:args.memory==='projects'?'project':'session',project:args.project||'',query:args.query||'',cursor:args.cursor,limit:3});
    return {kind:'catalog',...page,entries:page.entries.map(s=>({id:s.id,title:(s.title||s.id).slice(0,100),...(s.project?{project:s.project,shared:s.shared,available:s.available!==false}:{}),memory:s.memory?{reference:s.memory.ref,revision:s.memory.revision,invalid:Boolean(s.memory.invalid)}:null}))};
  }
  let reference=args.reference,text='',record,refs=[],nextReferences=null;
  if(args.memory){
    if(!['global','project','session'].includes(args.memory))throw Error('未知记忆读取层级');
    const target=args.memory==='global'?'global':args.memory==='project'?(args.project||hub.scope(requester).project):(args.sessionId||requester.id);
    const memory=store.memory(nodeKey(args.memory,target));
    if(!memory)return {kind:'not_generated',message:'该范围尚未生成短记忆；可读取会话目录及原始资料。',target};
    if(memory.invalid)return {kind:'awaiting_refresh',message:memory.notice,target,previousReference:memory.ref};
    reference=memory.ref;
  }
  if(reference){
    const source=store.source(reference);if(!source)throw Error('记忆来源不存在或已失效');
    if(source.kind==='memory'){
      record=store.memory(source.key,source.revision);if(!record)throw Error('记忆版本不可用');
      text=record.summary;
      const page=store.references(source.key,source.revision,0,3);refs=page.entries;nextReferences=page.more?cursorFor({scope:`refs:${reference}`,offset:3}):null;
      if(args.query==='sources'){
        const cursor=readCursor(args.cursor,`refs:${reference}`),p=store.references(source.key,source.revision,cursor.offset,3);
        return {kind:'sources',reference,entries:p.entries.map(shortRef),nextCursor:p.more?cursorFor({scope:`refs:${reference}`,offset:cursor.offset+3}):null};
      }
    }else if(source.kind==='withdrawn')return {kind:'withdrawn',reference,message:'此来源已退出共享范围；旧记录只供明确回查。'};
    else {text=await dream.sources.sourceText(source,{signal});record=source;}
  }else if(args.sessionId){
    if(args.id){record=archiveRecord(hub,args.sessionId,args.id);text=recordText(record);}
    else if(args.from!==undefined||args.to!==undefined){
      const events=await dream.sources.original(args.sessionId,args.from,args.to,signal);text=events.map(e=>`[event ${e.seq} · ${e.type}]\n${e.text}`).join('\n\n');
    }else {
      const archive=hub.context.store.peek(args.sessionId),records=[...(archive?.records||[]),...(archive?.inheritedRecords||[])];
      const unique=[...new Map(records.map(r=>[r.id,r])).values()].filter(r=>!r.mergedInto&&(!args.query||[r.id,r.summary,...(r.decisions||[]).map(d=>d.text)].join(' ').toLowerCase().includes(args.query.toLowerCase())));
      const scope=`archive:${args.sessionId}:${args.query||''}:${digest(unique.map(r=>[r.id,r.version]))}`,page=readCursor(args.cursor,scope),entries=unique.slice(page.offset,page.offset+5);
      return {kind:'archive_catalog',sessionId:args.sessionId,eventCount:store.session(args.sessionId)?.eventCount,entries:entries.map(r=>({id:r.id,summary:(r.summary||r.decisions?.[0]?.text||'').slice(0,140),documents:r.documents?.length||0,assets:r.assets?.length||0})),nextCursor:page.offset+5<unique.length?cursorFor({scope,offset:page.offset+5}):null};
    }
    reference=`original:${digest([args.sessionId,args.id,args.from,args.to])}:${digest(text)}`;
  }else throw Error('缺少明确的记忆读取目标');
  const scope=`text:${reference}`,page=readCursor(args.cursor,scope),parts=splitSource(text,1700);
  if(page.offset>=parts.length&&parts.length)throw Error('续读位置超出资料范围');
  return {kind:record?.kind||'original',reference,text:parts[page.offset]?.text||'',
    ...(record?.key?{key:record.key,revision:record.revision,updatedAt:record.updatedAt}:{}),
    ...(record?.sessionId?{sessionId:record.sessionId,...(record.recordId?{recordId:record.recordId}:{}),...(record.seq!=null?{seq:record.seq}: {})}:{}),
    sources:page.offset===0?refs.map(shortRef):[],
    nextSources:nextReferences,
    nextCursor:page.offset+1<parts.length?cursorFor({scope,offset:page.offset+1}):null};
}
export async function dreamAssets(hub,args,signal){
  if(!Number.isSafeInteger(args.asset)||args.asset<1)throw Error('附件编号从 1 开始');
  let assets;
  if(args.id)assets=archiveRecord(hub,args.sessionId,args.id).assets||[];
  else{
    if(!Number.isSafeInteger(args.from)||!Number.isSafeInteger(args.to)||args.from<0||args.to<args.from||args.to-args.from>200)throw Error('读取附件需要有效的原文区间');
    const {events}=await hub.dream.sources.read(args.sessionId,signal);
    assets=combineAssets(...events.filter(e=>e.seq>=args.from&&e.seq<=args.to).map(e=>attachmentsOf(messageOf(e)?.content,args.sessionId,e.seq)));
  }
  const asset=assets[args.asset-1];if(!asset)throw Error('没有这个附件编号');return asset;
}
export async function dreamRecallContent(hub,args,requester,signal){
  if(args.asset!==undefined){
    if(!args.sessionId)throw Error('跨会话附件读取需要 sessionId');
    const asset=await dreamAssets(hub,args,signal),block=structuredClone(asset.block);if(block.type==='image')delete block.offloaded;
    return [{type:'text',text:describeAsset(asset,args.asset-1)},block];
  }
  return [{type:'text',text:JSON.stringify(await readDream(hub,args,requester,signal))}];
}
