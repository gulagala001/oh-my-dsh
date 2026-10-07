import { readDream, archiveRecord, dreamAssets } from './recall.mjs';
import { sendAttachment } from '../http.mjs';
import { contextConfig } from '../config.mjs';
import { folderTree, workspaceRoots } from './scope.mjs';
import { existsSync } from 'node:fs';

// Presentation metadata belongs to the web reader, not the model recall payload.
export function presentDreamRead(hub, value, args = {}) {
  const store = hub.dream.store;
  const clip = (text, limit) => { const chars = Array.from(String(text || '').replace(/\s+/g, ' ').trim()); return chars.slice(0, limit).join('') + (chars.length > limit ? '…' : ''); };
  const projectName = key => key === '@unclassified' ? '未归类' : key.split(/[\\/]/).filter(Boolean).at(-1) || '项目';
  const describe = item => {
    const source = item.reference ? store.source(item.reference) : null;
    if (item.kind === 'withdrawn' || source?.kind === 'withdrawn') return { title: '已退出共享', detail: '保留原始引用，按需回查', preview: '' };
    const key = source?.key || item.key, revision = source?.revision ?? item.revision;
    if (key) {
      const memory = store.memory(key, revision);
      const title = key === 'global' ? '全局记忆' : key.startsWith('project:') ? projectName(key.slice(8)) : store.session(key.slice(8))?.title || '会话记忆';
      const kind = key === 'global' ? '全局记忆' : key.startsWith('project:') ? '项目记忆' : '会话记忆';
      return { title: clip(title, 100), detail: kind + (revision != null ? ' · v' + revision : ''), preview: clip(memory?.summary, 120) };
    }
    const sessionId = source?.sessionId || item.sessionId || args.sessionId;
    let first = Infinity, last = -Infinity;
    for (const seq of source?.originalSeqs || []) if (Number.isSafeInteger(seq) && seq >= 0) { first = Math.min(first, seq); last = Math.max(last, seq); }
    const kind = source?.kind || item.kind;
    const detail = kind === 'summary' ? (source?.identity?.startsWith('decision:') ? '用户决定' : '会话摘要') : kind === 'raw' ? ({ user: '用户原文', assistant: '助手原文', tool: '工具记录' }[source?.speaker] || '原文') : '来源资料';
    const range = Number.isFinite(first) ? ' · 事件 #' + first + (first !== last ? '–' + last : '') : (source?.seq ?? item.seq) != null ? ' · 事件 #' + (source?.seq ?? item.seq) : '';
    return { title: clip((sessionId ? store.session(sessionId)?.title : '') || detail, 100), detail: detail + range, preview: kind === 'summary' ? clip(source?.text, 120) : '' };
  };
  const annotate = item => ({ ...item, presentation: describe(item) });
  return { ...annotate(value), ...(value.sources ? { sources: value.sources.map(annotate) } : {}), ...(value.kind === 'sources' ? { entries: value.entries.map(annotate) } : {}) };
}

export async function handleDreamApi({hub,ctx,req,res,url,send,readBody}){
  const path=url.pathname.replace('/trisoul-x/api','');if(!path.startsWith('/dream'))return false;
  const id=url.searchParams.get('session')||'',agent=id?ctx.agents.get(id):null;
  const requester=agent?.session||{id:id||'dream-reader',header:{cwd:(id?hub.store.peek?.(id)?.cwd:null)||process.cwd()}};
  // Folder list is derived state: a failure here must never fail the request.
  // Project keys outlive their directories, so tell the caller which folders are
  // still on disk; the UI marks the rest and sorts them last.
  const folderExists=folder=>{try{return existsSync(folder);}catch{return true;}};
  const folderPayload=()=>{try{return folderTree(hub.dream.store.projects(),workspaceRoots(),folderExists);}catch{return [];}};
  if(path==='/dream'){
    if(req.method!=='GET'){send(res,405,{error:'请使用 GET'});return true;}
    if(id&&!hub.dream.store.session(id))await hub.dream.sources.inspect(id);
    send(res,200,{...hub.dream.status(id),folders:folderPayload()});return true;
  }
  if(path==='/dream/refresh'){
    if(req.method!=='POST'){send(res,405,{error:'请使用 POST'});return true;}
    await hub.dream.sources.sync(hub.dream.lifecycle.signal,{retryUnreadable:true});
    send(res,200,hub.dream.status(id));return true;
  }
  if(path==='/dream/run'){
    if(req.method!=='POST'){send(res,405,{error:'请使用 POST'});return true;}
    const input=await readBody(req);if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Dream 请求必须是对象');const scope=input.scope;
    const target=scope==='session'?input.sessionId||id:scope==='project'?input.project||hub.dream.store.session(id)?.project:'global';
    send(res,202,await hub.dream.enqueue(scope,target,agent));return true;
  }
  if(path==='/dream/job'){
    if(req.method!=='POST'){send(res,405,{error:'请使用 POST'});return true;}
    const input=await readBody(req);if(typeof input?.id!=='string')throw Error('缺少作业编号');
    if(!['stop','resume'].includes(input.action))throw Error('未知作业操作');
    send(res,200,input.action==='stop'?hub.dream.pause(input.id):hub.dream.resume(input.id,agent));return true;
  }
  if(path==='/dream/settings'){
    if(req.method==='GET'){send(res,200,{...hub.dream.status(id).settings,folders:folderPayload()});return true;}
    if(req.method!=='POST'){send(res,405,{error:'不支持此方法'});return true;}
    const input=await readBody(req),allowed=new Set(['dreamAutoEnabled','dreamIntervalMs','dreamDeepAgeMs','dreamDailyTokens','dreamProvider','dreamModel','dreamProjects']);
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.has(k)))throw Error('未知 Dream 设置');
    if('dreamProjects' in input&&(!Array.isArray(input.dreamProjects)||input.dreamProjects.some(x=>typeof x!=='string')))throw Error('Dream 文件夹设置必须是字符串数组');
    const next=contextConfig({...hub.config(),...input});
    if(Boolean(next.dreamProvider)!==Boolean(next.dreamModel))throw Error('固定后台提供方与模型需要一起填写，或一起留空');
    await ctx.settings.update('trisoul-x',input);
    hub.dream.store.setMeta('nextAutoAt',0);void hub.dream.tick().catch(e=>hub.dream.notice(e));
    send(res,200,{...hub.dream.status(id).settings,folders:folderPayload()});return true;
  }
  if(path==='/dream/catalog'){
    if(req.method!=='GET'){send(res,405,{error:'请使用 GET'});return true;}
    send(res,200,hub.dream.store.catalog({kind:url.searchParams.get('kind')||'project',project:url.searchParams.get('project')||'',query:url.searchParams.get('query')||'',cursor:url.searchParams.get('cursor')}));return true;
  }
  if(path==='/dream/document'){
    if(req.method!=='GET'){send(res,405,{error:'请使用 GET'});return true;}
    const sessionId=url.searchParams.get('sessionId'),record=archiveRecord(hub,sessionId,url.searchParams.get('id'));
    send(res,200,{...record,requestSessionId:sessionId,dreamTarget:true});return true;
  }
  if(path==='/dream/read'){
    if(req.method!=='GET'){send(res,405,{error:'请使用 GET'});return true;}
    const args=Object.fromEntries(['reference','memory','project','sessionId','id','cursor','query'].flatMap(k=>url.searchParams.has(k)?[[k,url.searchParams.get(k)]]:[]));
    for(const k of ['from','to'])if(url.searchParams.has(k))args[k]=Number(url.searchParams.get(k));
    send(res,200,presentDreamRead(hub,await readDream(hub,args,requester),args));return true;
  }
  if(path==='/dream/asset'){
    if(req.method!=='GET'){send(res,405,{error:'请使用 GET'});return true;}
    const item=await dreamAssets(hub,{sessionId:url.searchParams.get('sessionId'),id:url.searchParams.get('id'),asset:Number(url.searchParams.get('asset'))});
    await sendAttachment(ctx,res,item.block);
    return true;
  }
  send(res,404,{error:'Dream 接口不存在'});return true;
}
