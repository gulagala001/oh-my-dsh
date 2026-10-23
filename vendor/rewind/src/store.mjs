import { mkdir, readFile, rename, open, lstat, rmdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export async function atomic(file, value) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`, handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  await rename(temp, file);
  await syncDirectory(dirname(file));
}
export async function syncDirectory(directory) {
  let parent;try {parent=await open(directory,'r');await parent.sync();}catch(error){if(!['EINVAL','ENOTSUP','EPERM','EISDIR'].includes(error.code))throw error;}finally{await parent?.close();}
}
export async function read(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } }
export const TOOL_LOCK_WAIT_MS = 30000;
export const lockTimeout = () => Object.assign(Error('等待工作区或备份锁超时，请等待其他操作结束后重试。'), {code:'REWIND_LOCK_TIMEOUT'});
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
      if(waitMs!==undefined)timer=setTimeout(()=>stop(lockTimeout()),waitMs);
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

/** Cooperative process fence. Stale locks are removed only after their process is gone. */
export async function lease(file,{waitMs=0,signal}={}){
  checkWait(waitMs);checkAbort(signal);
  await mkdir(dirname(file),{recursive:true,mode:0o700});const nonce=randomUUID();
  const deadline=performance.now()+waitMs;
  for(;;){
    checkAbort(signal);
    try{
      const h=await open(file,'wx',0o600);let identity;
      try{identity=await h.stat();await h.writeFile(JSON.stringify({pid:process.pid,nonce}));await h.close();checkAbort(signal);}
      catch(error){
        await h.close().catch(()=>{});
        // Failed metadata writes must not strand a live-PID lock forever. Do
        // not remove a replacement file created by another owner meanwhile.
        const current=await lstat(file).catch(()=>null);
        if(identity&&current?.dev===identity.dev&&current.ino===identity.ino)await unlink(file).catch(()=>{});
        throw error;
      }
      return async()=>{const value=await read(file,null);if(value?.nonce===nonce)await unlink(file);};
    }
    catch(error){
      if(error.code!=='EEXIST')throw error;
      let owner;try{owner=await read(file,null);}catch(e){if(!(e instanceof SyntaxError))throw e;}
      // A contender can observe an exclusive file before its owner has finished
      // writing the tiny record. Treat it as held, never as a stale lock.
      let alive=true;
      if(Number.isInteger(owner?.pid)&&owner.pid>0)try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
      if(!alive){
        // Only one contender may reap a dead owner. Re-read inside this fence
        // so a second contender cannot unlink the replacement owner's lock.
        const reaper=file+'.reap';let acquired=false;
        try{
          await mkdir(reaper);acquired=true;
          const latest=await read(file,null);
          if(latest?.nonce===owner.nonce)await unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});
        }catch(e){if(e.code!=='EEXIST')throw e;}
        finally{if(acquired)await rmdir(reaper);}
        if(acquired)continue;
      }
      checkAbort(signal);
      if(performance.now()>=deadline)throw lockTimeout();
      await new Promise(resolve=>setTimeout(resolve,25));
    }
  }
}
