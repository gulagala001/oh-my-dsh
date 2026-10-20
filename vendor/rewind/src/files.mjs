import { readdir, lstat, readFile, readlink, mkdir, writeFile, rename, unlink, rmdir, chmod, symlink, realpath, open } from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import { join, relative, resolve, dirname, isAbsolute, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { brotliCompress, brotliDecompress, constants as zc } from 'node:zlib';
const compress=promisify(brotliCompress),decompress=promisify(brotliDecompress);
import { hash, atomic, read, lease, syncDirectory } from './store.mjs';
const exec = promisify(execFile);
const EXCLUDED = new Set(['.git','node_modules']);
export const equal = (a,b) => a?.kind==='file'&&b?.kind==='file'?a.hash===b.hash&&a.mode===b.mode:JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export function difference(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter(p => !equal(before[p],after[p]))
    .map(path => ({path,before:before[path] ?? null,after:after[path] ?? null}));
}
export class Files {
  constructor(root, config = {}) { this.root = root; this.cache=new Map();this.workspaces=new Map();this.blobs=new Set();this.stats={filesRead:0,bytesRead:0,cacheHits:0,storedBytes:0};this.storageBytes=null;this.index={};this.pending=new Map();this.pendingBytes=0;this.flushTail=Promise.resolve();this.bigFileTail=Promise.resolve(); this.limits = { chunkBytes:4*1024*1024, maxBlobBytes:64*1024*1024, storageTargetBytes:2*1024*1024*1024, ...config }; }
  invalidateStorage(){this.storageReady=null;this.storageBytes=null;this.index={};this.blobs.clear();this.cache.clear();}
  async workspace(cwd) {
    const base = await realpath(cwd);const cached=this.workspaces.get(base);if(cached&&cached.expires>Date.now())return cached.root;
    try { const {stdout} = await exec('git',['-C',base,'rev-parse','--show-toplevel'],{timeout:5000}); const root=await realpath(stdout.trim());this.workspaces.set(base,{root,expires:Date.now()+10000});return root; }
    catch { return base; }
  }
  blob(key) { if (!/^[a-f0-9]{64}$/.test(key)) throw Error('无效备份标识'); return join(this.root,'blobs',key); }
  async capture(cwd) {
    const root = await realpath(cwd);
    if (this.root === root || this.root.startsWith(root+sep)) throw Error('备份目录不能位于被管理工作区中');
    let names, coverage;
    try {
      const {stdout} = await exec('git',['-C',root,'ls-files','-z','--cached','--others','--exclude-standard'],{encoding:'utf8',maxBuffer:32*1024*1024,timeout:15000});
      names = [...new Set(stdout.split('\0').filter(Boolean))]; coverage = 'Git 已跟踪文件和未忽略的新文件；不包含 .git、node_modules、嵌套仓库及 ignored 文件。';
    } catch(error) {
      if(!String(error.stderr||'').includes('not a git repository')&&error.code!=='ENOENT')throw Error('Git 文件枚举失败，未创建不完整快照');
      if(error.code==='ENOENT'){try{await lstat(join(root,'.git'));throw Error('此工作区需要 Git 才能按忽略规则捕获');}catch(e){if(e.code!=='ENOENT')throw e;}}
      names = []; coverage = '当前目录内文件；不包含 .git、node_modules 和符号链接指向的外部内容。';
      const walk = async (dir, prefix='') => {
        for (const entry of await readdir(dir,{withFileTypes:true})) {
          if(EXCLUDED.has(entry.name)) continue;
          const p = prefix+entry.name;
          if(entry.isDirectory()) await walk(join(dir,entry.name),p+'/'); else names.push(p);
        }
      }; await walk(root);
    }
    const manifest={};let index=0;
    const candidates=names.sort().filter(path=>!path.split('/').some(p=>EXCLUDED.has(p))&&!path.endsWith('/'));
    await this.ensureStorage();
    const captureOne=async path=>{
      const abs=await this.path(root,path);let info;
      try{info=await lstat(abs);}catch(e){if(e.code==='ENOENT')return;throw e;}
      if(info.isSymbolicLink()){manifest[path]={kind:'link',target:await readlink(abs)};return;}
      if(info.isDirectory())return;
      if(!info.isFile())throw Error(`无法备份特殊文件：${path}`);
      const signature=[info.dev,info.ino,info.size,info.mtimeMs,info.ctimeMs,info.mode].join(':');const cached=this.cache.get(abs);
      if(cached?.signature===signature){manifest[path]=cached.entry;this.stats.cacheHits++;return;}
      const release=info.size>this.limits.chunkBytes?await this.bigFile():()=>{};
      try{
      let key,chunks;
      if(info.size>this.limits.chunkBytes){
        const digest=createHash('sha256');chunks=[];
        for await(const data of createReadStream(abs,{highWaterMark:this.limits.chunkBytes})){digest.update(data);this.stats.bytesRead+=data.length;const chunk=hash(data);await this.saveBlob(chunk,data);chunks.push(chunk);}
        key=digest.digest('hex');
      }else{const data=await readFile(abs);this.stats.bytesRead+=data.length;key=hash(data);await this.saveBlob(key,data);}
      const after=await lstat(abs);this.stats.filesRead++;
      if(info.ino!==after.ino||info.ctimeMs!==after.ctimeMs||info.mtimeMs!==after.mtimeMs||info.size!==after.size)throw Error(`备份期间文件仍在变化：${path}`);
      const entry={kind:'file',hash:key,mode:info.mode&0o777,...(chunks?{chunks}: {})};manifest[path]=entry;this.cache.set(abs,{signature,entry});}finally{release();}
    };
    // Bound IO concurrency; wait for all workers even after a capture failure.
    const outcomes=await Promise.allSettled(Array.from({length:Math.min(12,candidates.length)},async()=>{while(index<candidates.length){const path=candidates[index++];await captureOne(path);}}));
    const failure=outcomes.find(r=>r.status==='rejected');await this.flushBlobs();if(failure)throw failure.reason;
    if(this.cache.size>100000)this.cache.clear();
    return {root,manifest:Object.fromEntries(Object.entries(manifest).sort(([a],[b])=>a.localeCompare(b))),coverage};
  }
  async bigFile(){const wait=this.bigFileTail;let release;this.bigFileTail=new Promise(r=>release=r);await wait;return release;}
  async ensureStorage(){
    if(this.storageReady)return this.storageReady;
    this.storageReady=(async()=>{await mkdir(join(this.root,'packs'),{recursive:true,mode:0o700});await mkdir(join(this.root,'blobs'),{recursive:true,mode:0o700});this.index=await read(join(this.root,'blob-index.json'),{});let total=0;for(const sub of ['blobs','packs'])for(const e of await readdir(join(this.root,sub),{withFileTypes:true}))if(e.isFile())total+=(await lstat(join(this.root,sub,e.name))).size;this.storageBytes=total;})();
    return this.storageReady;
  }
  async saveBlob(key,data){
    await this.ensureStorage();if(this.index[key]||this.pending.has(key)||this.blobs.has(key))return;
    const dest=this.blob(key);try{await lstat(dest);this.blobs.add(key);return;}catch(e){if(e.code!=='ENOENT')throw e;}
    let payload=data,flag=0;
    if(data.length>1024){
      const sample=data.subarray(0,65536),probe=await compress(sample,{params:{[zc.BROTLI_PARAM_QUALITY]:3}});
      if(probe.length<sample.length*.9){const zipped=data.length<=65536?probe:await compress(data,{params:{[zc.BROTLI_PARAM_QUALITY]:3}});if(zipped.length<data.length*.9){payload=zipped;flag=1;}}
    }
    const stored=Buffer.concat([Buffer.from([flag]),payload]);
    if(this.index[key]||this.pending.has(key))return;
    this.storageBytes+=stored.length;this.pending.set(key,stored);this.pendingBytes+=stored.length;
    if(this.pendingBytes>=8*1024*1024)await this.flushBlobs();
  }
  async flushBlobs(){
    const flush=async()=>{
      while(this.pending.size){
      const release=await lease(join(this.root,'pack-index.lock'),{waitMs:5000});try{this.index=await read(join(this.root,'blob-index.json'),{});
      for(const key of this.pending.keys())if(this.index[key]){this.pendingBytes-=this.pending.get(key).length;this.pending.delete(key);}
      if(!this.pending.size)return;
      const entries=[];let batchBytes=0;for(const entry of this.pending){if(entries.length&&batchBytes+entry[1].length>8*1024*1024)break;entries.push(entry);batchBytes+=entry[1].length;}
      const pack=randomUUID()+'.pack',file=join(this.root,'packs',pack),h=await open(file,'wx',0o600);let offset=0;
      const added={};
      try{for(const [key,bytes]of entries){await h.writeFile(bytes);added[key]={pack,offset,length:bytes.length};offset+=bytes.length;}await h.sync();}finally{await h.close();}
      await syncDirectory(join(this.root,'packs'));
      const index={...this.index,...added};await atomic(join(this.root,'blob-index.json'),index);this.index=index;
      for(const [key,bytes]of entries)if(this.pending.get(key)===bytes){this.pending.delete(key);this.pendingBytes-=bytes.length;}
      this.stats.storedBytes+=offset;}finally{await release();}}
    };
    this.flushTail=this.flushTail.catch(()=>{}).then(flush);return this.flushTail;
  }
  async readBlob(key){
    await this.ensureStorage();if(!this.index[key])this.index=await read(join(this.root,'blob-index.json'),{});
    const entry=this.index[key];let bytes;
    if(entry){if(!/^[a-f0-9-]+\.pack$/.test(entry.pack)||!Number.isSafeInteger(entry.offset)||!Number.isSafeInteger(entry.length)||entry.offset<0||entry.length<1||entry.length>this.limits.maxBlobBytes+1)throw Error('备份索引损坏');const h=await open(join(this.root,'packs',entry.pack),'r');try{bytes=Buffer.alloc(entry.length);let offset=0;while(offset<bytes.length){const r=await h.read(bytes,offset,bytes.length-offset,entry.offset+offset);if(!r.bytesRead)throw Error('备份内容不完整');offset+=r.bytesRead;}}finally{await h.close();}}
    else bytes=await readFile(this.blob(key));
    if(bytes[0]!==0&&bytes[0]!==1)throw Error('备份编码无效');return bytes[0]===1?decompress(bytes.subarray(1),{maxOutputLength:this.limits.maxBlobBytes}):bytes.subarray(1);
  }
  async path(root, path) {
    if(!path || isAbsolute(path) || path.includes('\\') || path.split('/').some(p=>!p||p==='.'||p==='..') || path.includes('\0')) throw Error('无效文件路径');
    const abs=resolve(root,path);
    if(!abs.startsWith(root+sep)) throw Error('恢复路径越界');
    let parent=dirname(abs);
    while(parent!==root) {
      try { const stat=await lstat(parent); if(!stat.isDirectory() || stat.isSymbolicLink()) throw Error(`恢复路径的父目录已改变：${path}`); }
      catch(e) { if(e.code!=='ENOENT')throw e; }
      parent=dirname(parent);
    }
    if(await realpath(root)!==root)throw Error('工作区路径已改变');
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
  async validate(root, changes, field='after') {
    for(const item of changes) if(!equal(await this.inspect(root,item.path),item[field])) throw Error(`文件有新的改动，已停止恢复：${item.path}`);
  }
  async put(root,path,value) {
    const abs=await this.path(root,path);
    if(value===null) { await unlink(abs).catch(e=>{if(e.code!=='ENOENT')throw e;}); await syncDirectory(dirname(abs)); return; }
    await mkdir(dirname(abs),{recursive:true});
    const temp=join(dirname(abs),`.dsh-rewind-${randomUUID()}`);
    try {
      if(value.kind==='link') await symlink(value.target,temp);
      else {
        const digest=createHash('sha256'),h=await open(temp,'wx',value.mode);
        try{for(const key of value.chunks||[value.hash]){const data=await this.readBlob(key);if(hash(data)!==key)throw Error(`备份校验失败：${path}`);digest.update(data);await h.writeFile(data);}if(digest.digest('hex')!==value.hash)throw Error(`备份校验失败：${path}`);await h.sync();}finally{await h.close();}
        await chmod(temp,value.mode);
      }
      await this.path(root,path); await rename(temp,abs);
      await syncDirectory(dirname(abs));
    } finally {await unlink(temp).catch(()=>{});}
  }
  async apply(root,changes,direction='before') {
    const expected=direction==='before'?'after':'before'; await this.validate(root,changes,expected);
    for(const item of changes) {
      if(!equal(await this.inspect(root,item.path),item[expected])) throw Error(`恢复期间文件发生变化：${item.path}`);
      await this.put(root,item.path,item[direction]);
    }
    await this.validate(root,changes,direction);
  }
  async recover(root,changes,direction) {
    const other=direction==='before'?'after':'before';
    for(const c of changes) {
      const now=await this.inspect(root,c.path);
      if(!equal(now,c.before) && !equal(now,c.after)) throw Error(`恢复中断后文件已被修改，请保留现场：${c.path}`);
    }
    for(const c of changes) if(!equal(await this.inspect(root,c.path),c[direction]))await this.put(root,c.path,c[direction]);
    await this.validate(root,changes,direction);
  }
}
