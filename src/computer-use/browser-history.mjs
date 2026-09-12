import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

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
