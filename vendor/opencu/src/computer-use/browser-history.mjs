import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

export function normalizeBrowserHistoryOptions(options = {}) {
  if (options === null || Array.isArray(options) || typeof options !== 'object') throw new Error('browser.history expects an options object');
  const normalized = {};
  if (options.queries != null) {
    if (!Array.isArray(options.queries) || !options.queries.length || options.queries.some(query => typeof query !== 'string')) throw new Error('browser.history received invalid queries');
    normalized.queries = [...options.queries];
  }
  if (options.limit != null) {
    if (!Number.isInteger(options.limit) || options.limit <= 0) throw new Error('browser.history received an invalid limit');
    normalized.limit = options.limit;
  }
  for (const key of ['from', 'to']) {
    if (options[key] == null) continue;
    const date = options[key] instanceof Date ? options[key] : new Date(options[key]);
    if (Number.isNaN(date.getTime())) throw new Error(`browser.history received an invalid ${key} date`);
    normalized[key] = date.toISOString();
  }
  return normalized;
}

// Native history is a separate source from the session-only visit ledger below.
// Do not wire this adapter until a backend explicitly offers native history.
export async function searchBrowserHistory(searchHistory, options = {}) {
  const input = normalizeBrowserHistoryOptions(options);
  if (typeof searchHistory !== 'function') throw new Error('browser.history is unavailable.');
  const limit = input.limit ?? 100;
  const batches = await Promise.all((input.queries ?? ['']).map(text => searchHistory({
    endTime: input.to == null ? undefined : Date.parse(input.to),
    maxResults: limit,
    startTime: input.from == null ? 0 : Date.parse(input.from),
    text,
  }))).catch(() => null);
  if (batches == null) return [];
  const entries = batches.flat().flatMap(entry => entry.url == null || entry.lastVisitTime == null ? [] : [{
    url: entry.url,
    title: entry.title,
    dateVisited: new Date(entry.lastVisitTime).toISOString(),
  }]).sort((left, right) => right.dateVisited.localeCompare(left.dateVisited));
  const seen = new Set();
  return entries.filter(entry => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  }).slice(0, limit);
}

// Only pages explicitly used by this session are recorded. Never import the
// user's pre-existing Chrome history or share another session's visits.
export class BrowserHistory {
  constructor(path){
    this.path=path;this.entries=[];this.last=new Map();
    try{
      const data=JSON.parse(readFileSync(path,'utf8'));
      if(data.version!==1||!Array.isArray(data.entries))throw Error('无效历史记录');
      this.entries=data.entries.filter(item=>typeof item.id==='string'&&typeof item.sessionId==='string'&&typeof item.browserId==='string'&&typeof item.tabId==='string'&&typeof item.url==='string'&&typeof item.title==='string'&&Number.isFinite(item.visitedAt));
      for(const item of this.entries)this.last.set(this.key(item),item);
    }catch(error){if(error.code!=='ENOENT')this.loadError='历史记录无法读取，已保留原文件';}
  }
  key(item){return JSON.stringify([item.sessionId,item.browserId,item.tabId]);}
  remember(input){
    let url;try{url=new URL(input.url);if(!['http:','https:','file:'].includes(url.protocol))return;url.username='';url.password='';}catch{return;}
    const key=this.key(input),previous=this.last.get(key),title=String(input.title||'').slice(0,1000);
    if(previous?.url===url.href){
      if(!title||title===previous.title||!this.entries.includes(previous))return;
      previous.title=title;
    }else{
      const entry={id:randomUUID(),...input,url:url.href,title,visitedAt:Date.now()};this.entries.push(entry);this.last.set(key,entry);
    }
    try{this.save();this.error=null;}catch{this.error='历史记录尚未保存到磁盘';}
  }
  list(sessionId){return{entries:this.entries.filter(item=>item.sessionId===sessionId).slice().reverse().map(({sessionId,tabId,...item})=>({...item})),warning:this.loadError??this.error??null};}
  clear(sessionId){
    if(this.loadError)throw Error(this.loadError);
    const previous=this.entries;this.entries=previous.filter(item=>item.sessionId!==sessionId);
    try{this.save();this.error=null;}catch(error){this.entries=previous;throw Error('清除记录未保存，请重试');}
    return this.list(sessionId);
  }
  save(){
    if(this.loadError)throw Error(this.loadError);
    const temporary=this.path+'.tmp';writeFileSync(temporary,JSON.stringify({version:1,entries:this.entries}),{mode:0o600});renameSync(temporary,this.path);
  }
}
