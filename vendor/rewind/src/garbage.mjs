import {mkdir,readdir,lstat,unlink,open} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {atomic,read,lease,syncDirectory,ensureFreeSpace} from './store.mjs';
const list=async path=>{try{return await readdir(path,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}};
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}};
const references=value=>{
  const result=new Set(),visit=v=>{if(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))result.add(v);else if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')Object.values(v).forEach(visit);};
  visit(value);return result;
};
function trimChanges(checkpoints,changes){
  const indices=Object.values(checkpoints).map(c=>c.changeIndex).filter(Number.isInteger);
  const drop=indices.length?Math.min(changes.length,...indices):changes.length;
  for(const c of Object.values(checkpoints))if(Number.isInteger(c.changeIndex))c.changeIndex=Math.max(0,c.changeIndex-drop);
  return changes.slice(drop);
}
function trimHistory(state){
  state.changes=trimChanges(state.checkpoints,state.changes);
  // Undo must not resurrect file checkpoints that have already aged out.
  for(const undo of state.undo){
    if(!undo.previousCheckpoints)continue;
    for(const key of Object.keys(undo.previousCheckpoints))if(!state.checkpoints[key])delete undo.previousCheckpoints[key];
    undo.previousChanges=trimChanges(undo.previousCheckpoints,undo.previousChanges||[]);
  }
}
/** A target is a retention preference, never a reason to reject a capture. */
export async function collectGarbage(root,{apply=false,locked=false,targetBytes=2*1024**3,retentionMs=30*86400000,maxRewriteBytes=Infinity}={}){
  await mkdir(root,{recursive:true,mode:0o700});
  const release=locked?async()=>{}:await lease(join(root,'collection.lock'));
  let mutated=false;
  try{
    for(const entry of await list(join(root,'owners'))){
      const file=join(root,'owners',entry.name),owner=await read(file,null);
      if(Number.isInteger(owner?.pid)&&alive(owner.pid)){if(owner.protocol!==2||owner.busy)return {busy:true,reclaimedBytes:0};}
      else if(apply)await unlink(file).catch(()=>{});
    }
    const pinned=new Set();
    for(const entry of await list(join(root,'pins'))){
      const file=join(root,'pins',entry.name),pin=await read(file,null);
      if(pin?.expires>Date.now()&&alive(pin.pid))pinned.add(pin.sessionId);
      else if(apply)await unlink(file).catch(()=>{});
    }
    const states=[];
    for(const entry of await list(join(root,'sessions'))){
      if(!entry.isFile()||!entry.name.endsWith('.json'))continue;
      const file=join(root,'sessions',entry.name),state=await read(file,null);
      if(!state||state.schema!==1)throw Error('备份目录包含未知状态，停止清理');
      state.checkpoints??={};state.changes??=[];state.undo??=[];
      if(state.journal)pinned.add(state.id);
      states.push({file,state,changed:false});
    }
    const index=await read(join(root,'blob-index.json'),{}),counts=new Map(),loose=new Map();
    for(const entry of await list(join(root,'blobs')))if(entry.isFile())loose.set(entry.name,(await lstat(join(root,'blobs',entry.name))).size);
    const newest=states.reduce((best,row)=>(row.state.updatedAt||0)>(best?.state.updatedAt||0)?row:best,null);
    let expiredSessions=0,retiredCheckpoints=0,retiredUndo=0;
    for(const row of states){
      const s=row.state;
      if(!pinned.has(s.id)&&s.updatedAt&&Date.now()-s.updatedAt>retentionMs&&(Object.keys(s.checkpoints).length||s.undo.length||s.changes.length)){
        retiredCheckpoints+=Object.keys(s.checkpoints).length;retiredUndo+=s.undo.length;
        s.checkpoints={};s.changes=[];s.undo=[];row.changed=true;expiredSessions++;
      }
      row.bytes=Buffer.byteLength(JSON.stringify(s));
      row.refs=references(s);for(const key of row.refs)counts.set(key,(counts.get(key)||0)+1);
    }
    const cost=key=>index[key]?index[key].length+Buffer.byteLength(JSON.stringify(index[key]))+key.length+4:(loose.get(key)||0);
    let liveBytes=states.reduce((sum,row)=>sum+row.bytes,0)+[...counts.keys()].reduce((sum,key)=>sum+cost(key),0);
    const candidates=[];
    for(const row of states){
      const s=row.state;if(pinned.has(s.id))continue;
      const keys=Object.keys(s.checkpoints),protectedKey=row===newest?keys.at(-1):undefined;
      for(const key of keys)if(key!==protectedKey)candidates.push({row,key,time:s.checkpoints[key].createdAt||s.updatedAt||0});
      for(const undo of s.undo)if(row!==newest||undo!==s.undo.at(-1))candidates.push({row,undo,time:undo.createdAt||s.updatedAt||0});
    }
    candidates.sort((a,b)=>a.time-b.time);
    for(const candidate of candidates){
      if(liveBytes<=targetBytes)break;
      const row=candidate.row,s=row.state;
      if(candidate.key){delete s.checkpoints[candidate.key];retiredCheckpoints++;}
      else{s.undo.splice(s.undo.indexOf(candidate.undo),1);retiredUndo++;}
      trimHistory(s);row.changed=true;
      const next=references(s);
      for(const key of row.refs)if(!next.has(key)){const n=counts.get(key)-1;if(n)counts.set(key,n);else{counts.delete(key);liveBytes-=cost(key);}}
      const nextBytes=Buffer.byteLength(JSON.stringify(s));liveBytes+=nextBytes-row.bytes;row.bytes=nextBytes;
      row.refs=next;
    }
    if(apply)for(const row of states)if(row.changed){row.state.revision++;await atomic(row.file,row.state,{reserveBytes:0});mutated=true;}
    const packFiles=await list(join(root,'packs')),groups=new Map();let bytes=0;
    for(const entry of packFiles)if(entry.isFile())bytes+=(await lstat(join(root,'packs',entry.name))).size;
    const next={};
    for(const [key,entry]of Object.entries(index))if(counts.has(key)){next[key]=entry;const entries=groups.get(entry.pack)||[];entries.push([key,entry]);groups.set(entry.pack,entries);}
    const liveContentBytes=Object.values(next).reduce((sum,e)=>sum+e.length,0);
    let reclaimedBytes=0,rewrittenBytes=0,rewriteDeferred=false;
    for(const [name,size]of loose){
      if(counts.has(name))continue;
      if(apply){await unlink(join(root,'blobs',name));mutated=true;}reclaimedBytes+=size;
    }
    if(apply){
      // A shrinking index only needs enough space for its atomic replacement;
      // reserving the normal write headroom here would block low-space cleanup.
      if(Object.keys(next).length!==Object.keys(index).length){await atomic(join(root,'blob-index.json'),next,{reserveBytes:0});mutated=true;}
      // Reclaim whole orphan packs before needing temporary space to compact
      // live packs. Low disk space must not prevent these no-copy deletions.
      for(const entry of packFiles)if(entry.isFile()&&!groups.has(entry.name)){
        const file=join(root,'packs',entry.name),size=(await lstat(file)).size;
        await unlink(file);reclaimedBytes+=size;mutated=true;
      }
      for(const entry of packFiles){
        if(!entry.isFile()||!groups.has(entry.name))continue;
        const old=join(root,'packs',entry.name),size=(await lstat(old)).size,entries=groups.get(entry.name);
        const kept=entries.reduce((sum,[,e])=>sum+e.length,0);
        if(size===kept||bytes-liveContentBytes<1024*1024||rewrittenBytes>=maxRewriteBytes)continue;
        try{await ensureFreeSpace(root,kept+Buffer.byteLength(JSON.stringify(next)));}
        catch(error){if(error.code!=='REWIND_DISK_SPACE')throw error;rewriteDeferred=true;continue;}
        // Compact one pack at a time, never a second full copy of the store.
        const pack=randomUUID()+'.pack',file=join(root,'packs',pack);let out,input,publishing=false;
        let offset=0;const replacements={};
        try{
          input=await open(old,'r');out=await open(file,'wx',0o600);
          try{
          for(const [key,e]of entries){
            if(!/^[a-f0-9-]+\.pack$/.test(e.pack)||!Number.isSafeInteger(e.offset)||!Number.isSafeInteger(e.length)||e.offset<0||e.length<1||e.length>64*1024*1024+1)throw Error('备份索引损坏，停止清理');
            const buffer=Buffer.alloc(Math.min(1024*1024,e.length));let copied=0;
            while(copied<e.length){const {bytesRead}=await input.read(buffer,0,Math.min(buffer.length,e.length-copied),e.offset+copied);if(!bytesRead)throw Error('备份包不完整');await out.writeFile(buffer.subarray(0,bytesRead));copied+=bytesRead;}
            replacements[key]={pack,offset,length:e.length};offset+=e.length;
          }
          await out.sync();
          }finally{await input.close();input=null;await out.close();out=null;}
          await syncDirectory(join(root,'packs'));Object.assign(next,replacements);
          publishing=true;await atomic(join(root,'blob-index.json'),next,{reserveBytes:0});mutated=true;await unlink(old);
        }catch(error){
          try{const current=publishing?await read(join(root,'blob-index.json'),null):{};
            if(current&&!Object.values(current).some(entry=>entry.pack===pack))await unlink(file);
          }catch{}
          throw error;
        }finally{await input?.close();await out?.close();}
        reclaimedBytes+=size-kept;rewrittenBytes+=kept;
      }
    }
    return {busy:false,referencedBlobs:counts.size,liveBytes,liveContentBytes,reclaimableBytes:bytes-liveContentBytes,reclaimedBytes,rewriteDeferred,expiredSessions,retiredCheckpoints,retiredUndo,aboveTarget:liveBytes>targetBytes};
  }finally{
    try{if(mutated)await atomic(join(root,'collection-generation.json'),randomUUID());}finally{await release();}
  }
}
