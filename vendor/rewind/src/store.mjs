import { mkdir, readFile, rename, open, lstat, link, unlink, statfs } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export async function ensureFreeSpace(directory,bytes,reserveBytes=512*1024**2) {
  const {bavail,bsize}=await statfs(directory,{bigint:true});
  if(BigInt(bavail)*BigInt(bsize)-BigInt(bytes)<BigInt(reserveBytes))
    throw Object.assign(Error(reserveBytes?'磁盘可用空间不足，已停止写入回退文件；至少需要保留 512 MiB 可用空间。':'磁盘空间不足以安全保存清理索引，已保留现有备份。'),{code:'REWIND_DISK_SPACE'});
}
export async function atomic(file, value, {reserveBytes}={}) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const content=JSON.stringify(value);
  // Large session/undo records need the same headroom as content packs.
  // Small ownership records must remain writable so low-space cleanup can run.
  if(Buffer.byteLength(content)>1024*1024||reserveBytes!==undefined)await ensureFreeSpace(dirname(file),Buffer.byteLength(content),reserveBytes??512*1024**2);
  const temp = `${file}.${randomUUID()}.tmp`, handle = await open(temp, 'wx', 0o600);
  try {
    try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, file);
    await syncDirectory(dirname(file));
  } finally { await unlink(temp).catch(()=>{}); }
}
export async function syncDirectory(directory) {
  let parent;try {parent=await open(directory,'r');await parent.sync();}catch(error){if(!['EINVAL','ENOTSUP','EPERM','EISDIR'].includes(error.code))throw error;}finally{await parent?.close();}
}
export async function read(file, fallback, signal) { try { return JSON.parse(await readFile(file, {encoding:'utf8',signal})); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } }
export const TOOL_LOCK_WAIT_MS = 30000;
export const lockTimeout = resource => Object.assign(Error('等待工作区或备份锁超时，请等待其他操作结束后重试。' + (resource ? '（' + resource + '）' : '')), {code:'REWIND_LOCK_TIMEOUT'});
export const isLockFailure = error => ['REWIND_LOCK_TIMEOUT','REWIND_WORKSPACE_BUSY'].includes(error?.code);
function checkWait(waitMs){if(waitMs!==undefined&&(!Number.isFinite(waitMs)||waitMs<0||waitMs>2147483647))throw new TypeError('Lock wait must be a finite duration between 0 and 2147483647 ms');}
function abortReason(signal){return signal.reason instanceof Error?signal.reason:Object.assign(Error('操作已取消，备份等待已结束'),{name:'AbortError',cause:signal.reason});}
function checkAbort(signal){if(signal?.aborted)throw abortReason(signal);}
export class Store {
  constructor(root) { this.root = root; this.tails = new Map();this.cache=new Map(); }
  file(id) { return join(this.root, 'sessions', `${hash(id)}.json`); }
  async load(id) {const file=this.file(id);let info;try{info=await lstat(file);}catch(e){if(e.code!=='ENOENT')throw e;}const signature=info?[info.size,info.mtimeMs,info.ctimeMs,info.ino].join(':'):'';const cached=this.cache.get(id);if(cached?.signature===signature)return structuredClone(cached.value);const value=await read(file,{schema:1,id,revision:0,hiddenRanges:[],checkpoints:{},changes:[],undo:[],journal:null});this.cache.set(id,{signature,value});if(this.cache.size>128)this.cache.delete(this.cache.keys().next().value);return structuredClone(value);}
  async save(state) {state.updatedAt=Date.now();await atomic(this.file(state.id),state);this.cache.delete(state.id);}
  async lock(id, fn, {signal,waitMs}={}) {
    checkWait(waitMs);checkAbort(signal);
    const previous = this.tails.get(id) || Promise.resolve();
    let abandoned,timer,onAbort;
    const clear=()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);};
    const stopped=new Promise((_,reject)=>{
      const stop=error=>{abandoned=error;clear();reject(error);};
      onAbort=()=>stop(abortReason(signal));
      signal?.addEventListener('abort',onAbort,{once:true});
      if(waitMs!==undefined)timer=setTimeout(()=>stop(lockTimeout(id)),waitMs);
    });
    // Cancellation may release a waiter, never the active owner's fence. A
    // cancelled queue entry stays ordered and cannot run its callback later.
    const next = previous.catch(() => {}).then(()=>{clear();if(abandoned)throw abandoned;checkAbort(signal);return fn();});
    this.tails.set(id, next);
    const settled=()=>{clear();if(this.tails.get(id)===next)this.tails.delete(id);};
    next.then(settled,settled);
    return Promise.race([next,stopped]);
  }
}

// link() publishes a complete owner record exclusively. A process that dies
// while writing its private file has never acquired the fence.
export async function lease(file,{waitMs=0,signal}={}){
  checkWait(waitMs);checkAbort(signal);
  const deadline=performance.now()+waitMs;
  await mkdir(dirname(file),{recursive:true,mode:0o700});
  const nonce=randomUUID(), candidate=file+'.'+nonce+'.tmp';
  const handle=await open(candidate,'wx',0o600);
  try{
    try{await handle.writeFile(JSON.stringify({pid:process.pid,nonce}));}finally{await handle.close();}
    for(;;){
      checkAbort(signal);
      try{await link(candidate,file);}
      catch(error){
        if(error.code!=='EEXIST')throw error;
        let owner;
        try{owner=await read(file,null);}
        catch(error){if(!(error instanceof SyntaxError)&&error.code!=='EISDIR')throw error;}
        const valid=Number.isInteger(owner?.pid)&&owner.pid>0&&typeof owner.nonce==='string';
        let dead=false;
        if(valid)try{process.kill(owner.pid,0);}catch(error){dead=error.code==='ESRCH';}
        if(dead){
          // A reaper has the same recoverable ownership protocol as the lock
          // it protects. Legacy mkdir-based reapers also exclude this file.
          const release=await lease(file+'.reap',{waitMs:Math.max(0,deadline-performance.now()),signal});
          try{
            let latest;
            try{latest=await read(file,null);}catch(error){if(!(error instanceof SyntaxError))throw error;}
            if(latest?.nonce===owner.nonce&&latest.pid===owner.pid)await unlink(file);
          }finally{await release();}
          continue;
        }
        checkAbort(signal);
        if(performance.now()>=deadline)throw lockTimeout(basename(file)+(valid?'，PID '+owner.pid:'，持有者未确认'));
        try{await delay(25,undefined,{signal});}catch(error){checkAbort(signal);throw error;}
        continue;
      }
      const release=async()=>{
        if((await read(file,null))?.nonce===nonce)await unlink(file);
      };
      if(signal?.aborted){await release();checkAbort(signal);}
      return release;
    }
  }finally{await unlink(candidate).catch(()=>{});}
}
