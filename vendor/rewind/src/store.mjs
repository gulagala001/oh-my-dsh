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
export class Store {
  constructor(root) { this.root = root; this.tails = new Map();this.cache=new Map(); }
  file(id) { return join(this.root, 'sessions', `${hash(id)}.json`); }
  async load(id) {const file=this.file(id);let info;try{info=await lstat(file);}catch(e){if(e.code!=='ENOENT')throw e;}const signature=info?[info.size,info.mtimeMs,info.ctimeMs,info.ino].join(':'):'';const cached=this.cache.get(id);if(cached?.signature===signature)return structuredClone(cached.value);const value=await read(file,{schema:1,id,revision:0,hiddenRanges:[],checkpoints:{},changes:[],undo:[],journal:null});this.cache.set(id,{signature,value});if(this.cache.size>128)this.cache.delete(this.cache.keys().next().value);return structuredClone(value);}
  async save(state) {state.updatedAt=Date.now();await atomic(this.file(state.id),state);this.cache.delete(state.id);}
  async lock(id, fn) {
    const previous = this.tails.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(fn); this.tails.set(id, next);
    try { return await next; } finally { if(this.tails.get(id) === next) this.tails.delete(id); }
  }
}

/** Cooperative process fence. Stale locks are removed only after their process is gone. */
export async function lease(file,{waitMs=0,signal}={}){
  await mkdir(dirname(file),{recursive:true,mode:0o700});const nonce=randomUUID();
  const deadline=Date.now()+waitMs;
  for(;;){
    signal?.throwIfAborted();
    try{const h=await open(file,'wx',0o600);try{await h.writeFile(JSON.stringify({pid:process.pid,nonce}));}finally{await h.close();}return async()=>{const value=await read(file,null);if(value?.nonce===nonce){const {unlink}=await import('node:fs/promises');await unlink(file);}};}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      let owner;try{owner=await read(file,null);}catch(e){if(!(e instanceof SyntaxError))throw e;}
      // A contender can observe an exclusive file before its owner has finished
      // writing the tiny record. Treat it as held, never as a stale lock.
      let alive=true;
      if(Number.isInteger(owner?.pid))try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
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
      if(Date.now()>=deadline)throw Error('其他进程正在操作此工作区或备份，请稍后重试');
      await new Promise(resolve=>setTimeout(resolve,25));
    }
  }
}
