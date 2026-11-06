import { readdir, lstat, readFile, readlink, mkdir, writeFile, rename, unlink, rmdir, chmod, symlink, realpath, open } from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import { join, relative, resolve, dirname, isAbsolute, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { brotliCompress, brotliDecompress, constants as zc } from 'node:zlib';
const compress=promisify(brotliCompress),decompress=promisify(brotliDecompress);
import { Store, hash, atomic, read, lease, syncDirectory, ensureFreeSpace } from './store.mjs';
const exec = promisify(execFile);
const EXCLUDED = new Set(['.git','node_modules']);
const inside=(parent,child)=>{const path=relative(parent,child);return !path||(!isAbsolute(path)&&path!=='..'&&!path.startsWith('..'+sep));};
const signature=info=>info?[info.size,info.mtimeMs,info.ctimeMs,info.ino].join(':'):'';
// Share only overlapping directory checks. Settled observations are discarded
// before any caller resumes, so later files still check the live filesystem.
function pendingRead(pending,key,read){
  if(!pending)return read();
  if(!pending.has(key))pending.set(key,read().finally(()=>pending.delete(key)));
  return pending.get(key);
}
export const equal = (a,b) => a?.kind==='file'&&b?.kind==='file'?a.hash===b.hash&&a.mode===b.mode:JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const entryAt = (manifest,path) => Object.hasOwn(manifest,path) ? manifest[path] : null;
export function difference(before, after) {
  const changes=[];
  for(const path of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()){
    const a=entryAt(before,path),b=entryAt(after,path);
    if(!equal(a,b))changes.push({path,before:a,after:b});
  }
  return changes;
}
export class Files {
  constructor(root, config = {}) { this.root = root; this.cache=new Map();this.workspaces=new Map();this.blobs=new Set();this.stats={filesRead:0,bytesRead:0,cacheHits:0,storedBytes:0};this.storageBytes=null;this.index={};this.io=new Store(root); this.limits = { chunkBytes:4*1024*1024, maxBlobBytes:64*1024*1024, storageTargetBytes:2*1024*1024*1024, maxStorageBytes:4*1024**3, ...config };if(!Number.isSafeInteger(this.limits.maxStorageBytes)||this.limits.maxStorageBytes<=0)throw Error('备份容量上限必须为正整数字节数'); }
  invalidateStorage(){this.storageReady=false;this.storageBytes=null;this.index={};this.blobs.clear();this.cache.clear();}
  async workspace(cwd,signal) {
    signal?.throwIfAborted();
    const base = await realpath(cwd);const cached=this.workspaces.get(base);if(cached&&cached.expires>Date.now())return cached.root;
    try { const {stdout} = await exec('git',['-C',base,'rev-parse','--show-toplevel'],{timeout:5000,signal}); const root=await realpath(stdout.trim());this.workspaces.set(base,{root,expires:Date.now()+10000});return root; }
    catch { signal?.throwIfAborted();return base; }
  }
  blob(key) { if (!/^[a-f0-9]{64}$/.test(key)) throw Error('无效备份标识'); return join(this.root,'blobs',key); }
  async capture(cwd,{signal}={}) {
    signal?.throwIfAborted();
    const root = await realpath(cwd);
    await mkdir(this.root,{recursive:true,mode:0o700});
    const storageRoot=await realpath(this.root);
    if(inside(root,storageRoot)||inside(storageRoot,root))throw Error('备份目录不能与被管理工作区重叠');
    await this.ensureStorage(signal);this.checkCapacity(0);await ensureFreeSpace(this.root,0);
    let names, coverage;
    try {
      const {stdout} = await exec('git',['-C',root,'ls-files','-z','--cached','--others','--exclude-standard'],{encoding:'utf8',maxBuffer:32*1024*1024,timeout:15000,signal});
      names = [...new Set(stdout.split('\0').filter(Boolean))]; coverage = 'Git 已跟踪文件和未忽略的新文件；不包含 .git、node_modules、嵌套仓库及 ignored 文件。';
    } catch(error) {
      signal?.throwIfAborted();
      if(!String(error.stderr||'').includes('not a git repository')&&error.code!=='ENOENT')throw Error('Git 文件枚举失败，未创建不完整快照');
      if(error.code==='ENOENT'){try{await lstat(join(root,'.git'));throw Error('此工作区需要 Git 才能按忽略规则捕获');}catch(e){if(e.code!=='ENOENT')throw e;}}
      names = []; coverage = '当前目录内文件；不包含 .git、node_modules 和符号链接指向的外部内容。';
      const walk = async (dir, prefix='') => {
        signal?.throwIfAborted();
        for (const entry of await readdir(dir,{withFileTypes:true})) {
          if(EXCLUDED.has(entry.name)) continue;
          const p = prefix+entry.name;
          if(entry.isDirectory()) await walk(join(dir,entry.name),p+'/'); else names.push(p);
        }
      }; await walk(root);
    }
    const manifest=Object.create(null),pathReads=new Map(),cacheUpdates=new Map();
    const batch={pending:new Map(),bytes:0};
    const workers=new AbortController();
    const captureSignal=signal?AbortSignal.any([signal,workers.signal]):workers.signal;
    let index=0;
    const candidates=names.sort().filter(path=>!path.split('/').some(p=>EXCLUDED.has(p))&&!path.endsWith('/'));
    const captureOne=async path=>{
      captureSignal.throwIfAborted();
      const abs=await this.path(root,path,pathReads);let info;
      captureSignal.throwIfAborted();
      try{info=await lstat(abs);}catch(e){if(e.code==='ENOENT')return;throw e;}
      if(info.isSymbolicLink()){manifest[path]={kind:'link',target:await readlink(abs)};return;}
      if(info.isDirectory())return;
      if(!info.isFile())throw Error(`无法备份特殊文件：${path}`);
      const signature=[info.dev,info.ino,info.size,info.mtimeMs,info.ctimeMs,info.mode].join(':');const cached=this.cache.get(abs);
      if(cached?.signature===signature){manifest[path]=cached.entry;this.stats.cacheHits++;return;}
      let key,chunks;
      if(info.size>this.limits.chunkBytes){
        const digest=createHash('sha256');chunks=[];
        await this.io.lock('large-file',async()=>{
          for await(const data of createReadStream(abs,{highWaterMark:this.limits.chunkBytes,signal:captureSignal})){
            captureSignal.throwIfAborted();
            digest.update(data);this.stats.bytesRead+=data.length;
            const chunk=hash(data);await this.saveBlob(batch,chunk,data,captureSignal);chunks.push(chunk);
          }
        },{signal:captureSignal});
        key=digest.digest('hex');
      }else{const data=await readFile(abs,{signal:captureSignal});this.stats.bytesRead+=data.length;key=hash(data);await this.saveBlob(batch,key,data,captureSignal);}
      const after=await lstat(abs);this.stats.filesRead++;
      if(info.ino!==after.ino||info.ctimeMs!==after.ctimeMs||info.mtimeMs!==after.mtimeMs||info.size!==after.size)throw Error(`备份期间文件仍在变化：${path}`);
      const entry={kind:'file',hash:key,mode:info.mode&0o777,...(chunks?{chunks}: {})};manifest[path]=entry;cacheUpdates.set(abs,{signature,entry});
    };
    // Bound IO concurrency; wait for all workers even after a capture failure.
    await Promise.all(Array.from({length:Math.min(12,candidates.length)},async()=>{
      try{while(!captureSignal.aborted&&index<candidates.length)await captureOne(candidates[index++]);}
      catch(error){workers.abort(error);}
    }));
    captureSignal.throwIfAborted();
    await this.flushBlobs(batch,captureSignal);
    captureSignal.throwIfAborted();
    // Cache only a complete capture whose blobs are already durably indexed.
    for(const [path,entry] of cacheUpdates)this.cache.set(path,entry);
    if(this.cache.size>100000)this.cache.clear();
    return {root,manifest:Object.fromEntries(Object.entries(manifest).sort(([a],[b])=>a.localeCompare(b))),coverage};
  }
  async ensureStorage(signal){
    if(this.storageReady)return;
    return this.io.lock('storage',async()=>{
      if(this.storageReady)return;
      await mkdir(join(this.root,'packs'),{recursive:true,mode:0o700});
      await mkdir(join(this.root,'blobs'),{recursive:true,mode:0o700});
      this.index=await read(join(this.root,'blob-index.json'),{},signal);
      await this.refreshUsage(signal);
      this.storageReady=true;
    },{signal});
  }
  async refreshUsage(signal){
    let info;try{info=await lstat(join(this.root,'blob-index.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
    const current=signature(info);
    if(this.storageBytes===null||this.storageSignature!==current){
      let total=0;
      for(const sub of ['blobs','packs'])for(const entry of await readdir(join(this.root,sub),{withFileTypes:true})){
        signal?.throwIfAborted();
        if(entry.isFile())total+=(await lstat(join(this.root,sub,entry.name))).size;
      }
      this.storageBytes=total;this.storageSignature=current;
    }
    this.indexBytes=info?.size||0;
  }
  checkCapacity(additional){
    if(this.storageBytes+this.indexBytes+additional>this.limits.maxStorageBytes)
      throw Object.assign(Error('回退备份达到容量上限，已停止新增文件备份；该段文件变化无法安全回退，请等待空闲清理或减少工作区范围。'),{code:'REWIND_STORAGE_LIMIT'});
  }
  async saveBlob(batch,key,data,signal){
    signal.throwIfAborted();
    if(this.index[key]||batch.pending.has(key)||this.blobs.has(key))return;
    const dest=this.blob(key);try{await lstat(dest);this.blobs.add(key);return;}catch(e){if(e.code!=='ENOENT')throw e;}
    let payload=data,flag=0;
    if(data.length>1024){
      const sample=data.subarray(0,65536),probe=await compress(sample,{params:{[zc.BROTLI_PARAM_QUALITY]:3}});
      signal.throwIfAborted();
      if(probe.length<sample.length*.9){const zipped=data.length<=65536?probe:await compress(data,{params:{[zc.BROTLI_PARAM_QUALITY]:3}});if(zipped.length<data.length*.9){payload=zipped;flag=1;}}
    }
    const stored=Buffer.concat([Buffer.from([flag]),payload]);
    signal.throwIfAborted();
    if(this.index[key]||batch.pending.has(key))return;
    batch.pending.set(key,stored);batch.bytes+=stored.length;
    if(batch.bytes>=8*1024*1024)await this.flushBlobs(batch,signal);
  }
  async flushBlobs(batch,signal){
    if(!batch.pending.size)return;
    return this.io.lock('pack-index',async()=>{
      while(batch.pending.size){
      const release=await lease(join(this.root,'pack-index.lock'),{waitMs:5000,signal});try{this.index=await read(join(this.root,'blob-index.json'),{},signal);await this.refreshUsage(signal);
      for(const key of batch.pending.keys())if(this.index[key]){batch.bytes-=batch.pending.get(key).length;batch.pending.delete(key);}
      if(!batch.pending.size)return;
      const entries=[];let batchBytes=0;for(const entry of batch.pending){if(entries.length&&batchBytes+entry[1].length>8*1024*1024)break;entries.push(entry);batchBytes+=entry[1].length;}
      const pack=randomUUID()+'.pack',file=join(this.root,'packs',pack);let offset=0;
      const added={};
      for(const [key,bytes]of entries){added[key]={pack,offset,length:bytes.length};offset+=bytes.length;}
      const index={...this.index,...added};
      const additional=offset+Buffer.byteLength(JSON.stringify(index));
      this.checkCapacity(additional);await ensureFreeSpace(this.root,additional);
      signal.throwIfAborted();
      const h=await open(file,'wx',0o600);let publishing=false;
      try{
        try{for(const [,bytes]of entries){signal.throwIfAborted();await h.writeFile(bytes);}signal.throwIfAborted();await h.sync();}finally{await h.close();}
        await syncDirectory(join(this.root,'packs'));
        signal.throwIfAborted();
        publishing=true;await atomic(join(this.root,'blob-index.json'),index);this.index=index;
        this.storageBytes+=offset;const info=await lstat(join(this.root,'blob-index.json'));this.storageSignature=signature(info);this.indexBytes=info.size;
      }catch(error){
        this.storageBytes=null;
        // A directory sync can fail after the index rename committed. Never
        // remove a pack that the durable index may already reference.
        try{const current=publishing?await read(join(this.root,'blob-index.json'),null):{};
          if(current&&!Object.values(current).some(entry=>entry.pack===pack))await unlink(file);
        }catch{}
        throw error;
      }
      for(const [key,bytes]of entries)if(batch.pending.get(key)===bytes){batch.pending.delete(key);batch.bytes-=bytes.length;}
      this.stats.storedBytes+=offset;}finally{await release();}}
    },{signal});
  }
  async readBlob(key){
    await this.ensureStorage();if(!this.index[key])this.index=await read(join(this.root,'blob-index.json'),{});
    const entry=this.index[key];let bytes;
    if(entry){if(!/^[a-f0-9-]+\.pack$/.test(entry.pack)||!Number.isSafeInteger(entry.offset)||!Number.isSafeInteger(entry.length)||entry.offset<0||entry.length<1||entry.length>this.limits.maxBlobBytes+1)throw Error('备份索引损坏');const h=await open(join(this.root,'packs',entry.pack),'r');try{bytes=Buffer.alloc(entry.length);let offset=0;while(offset<bytes.length){const r=await h.read(bytes,offset,bytes.length-offset,entry.offset+offset);if(!r.bytesRead)throw Error('备份内容不完整');offset+=r.bytesRead;}}finally{await h.close();}}
    else bytes=await readFile(this.blob(key));
    if(bytes[0]!==0&&bytes[0]!==1)throw Error('备份编码无效');return bytes[0]===1?decompress(bytes.subarray(1),{maxOutputLength:this.limits.maxBlobBytes}):bytes.subarray(1);
  }
  async path(root, path, pending) {
    if(!path || isAbsolute(path) || path.includes('\\') || path.split('/').some(p=>!p||p==='.'||p==='..') || path.includes('\0')) throw Error('无效文件路径');
    const abs=resolve(root,path);
    if(abs===root||!inside(root,abs)) throw Error('恢复路径越界');
    let parent=dirname(abs);
    while(parent!==root) {
      const directory=parent;
      try { const stat=await pendingRead(pending,'stat:'+directory,()=>lstat(directory)); if(!stat.isDirectory() || stat.isSymbolicLink()) throw Error(`恢复路径的父目录已改变：${path}`); }
      catch(e) { if(e.code!=='ENOENT')throw e; }
      parent=dirname(parent);
    }
    if(await pendingRead(pending,'root:'+root,()=>realpath(root))!==root)throw Error('工作区路径已改变');
    return abs;
  }
  async inspect(root,path) {
    const abs=await this.path(root,path); let st;
    try {st=await lstat(abs);} catch(e){if(e.code==='ENOENT')return null;throw e;}
    if(st.isSymbolicLink())return {kind:'link',target:await readlink(abs)};
    if(!st.isFile())throw Error(`恢复位置被目录或特殊文件占用：${path}`);
    const digest=createHash('sha256');for await(const bytes of createReadStream(abs,{highWaterMark:this.limits.chunkBytes}))digest.update(bytes);
    return {kind:'file',hash:digest.digest('hex'),mode:st.mode & 0o777};
  }
  async check(root,path,expected) {
    if(!equal(await this.inspect(root,path),expected))throw Error(`文件有新的改动，已停止恢复：${path}`);
  }
  async validate(root, changes, field='after') {
    for(const item of changes)await this.check(root,item.path,item[field]);
  }
  async put(root,path,value,expected) {
    const abs=await this.path(root,path);
    if(value===null) { await this.check(root,path,expected);await unlink(abs).catch(e=>{if(e.code!=='ENOENT')throw e;}); await syncDirectory(dirname(abs)); return; }
    await mkdir(dirname(abs),{recursive:true});
    const temp=join(dirname(abs),`.dsh-rewind-${randomUUID()}`);
    try {
      if(value.kind==='link') await symlink(value.target,temp);
      else {
        const digest=createHash('sha256'),h=await open(temp,'wx',value.mode);
        try{for(const key of value.chunks||[value.hash]){const data=await this.readBlob(key);if(hash(data)!==key)throw Error(`备份校验失败：${path}`);await ensureFreeSpace(dirname(abs),data.length);digest.update(data);await h.writeFile(data);}if(digest.digest('hex')!==value.hash)throw Error(`备份校验失败：${path}`);await h.sync();}finally{await h.close();}
        await chmod(temp,value.mode);
      }
      // Backup reads/decompression may take time. Fence the destination after
      // preparing bytes, immediately before replacing it, on every write path.
      await this.check(root,path,expected);await rename(temp,abs);
      await syncDirectory(dirname(abs));
    } finally {await unlink(temp).catch(()=>{});}
  }
  async apply(root,changes,direction='before') {
    const expected=direction==='before'?'after':'before'; await this.validate(root,changes,expected);
    for(const item of changes)await this.put(root,item.path,item[direction],item[expected]);
    await this.validate(root,changes,direction);
  }
  async recover(root,changes,direction) {
    const observed=[];
    for(const c of changes) {
      const now=await this.inspect(root,c.path);
      if(!equal(now,c.before) && !equal(now,c.after)) throw Error(`恢复中断后文件已被修改，请保留现场：${c.path}`);
      observed.push(now);
    }
    for(const [i,c] of changes.entries())if(!equal(observed[i],c[direction]))await this.put(root,c.path,c[direction],observed[i]);
    await this.validate(root,changes,direction);
  }
}
