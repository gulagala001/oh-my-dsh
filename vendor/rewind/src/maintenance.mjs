import {join} from 'node:path';
import {unlink} from 'node:fs/promises';
import {atomic,read,lease,TOOL_LOCK_WAIT_MS} from './store.mjs';
import {collectGarbage} from './garbage.mjs';

/** Cooperative idle collection. Busy markers also protect in-memory pre-images
 * between capture and the durable transaction/change record. */
export class Maintenance {
  constructor(engine,ownerFile,config={}){
    this.engine=engine;this.ownerFile=ownerFile;this.config=config;
    this.active=0;this.lastSweep=Date.now();this.sweptBytes=0;this.timer=null;this.disposed=false;
  }
  async run(fn,onUnavailable,{signal}={}){
    const deadline=performance.now()+TOOL_LOCK_WAIT_MS;
    try{
      await this.engine.store.lock('maintenance-owner',async()=>{
        if(!this.active){
          const root=this.engine.store.root,release=await lease(join(root,'collection.lock'),{waitMs:Math.max(0,deadline-performance.now()),signal});
          try{
            await atomic(this.ownerFile,{pid:process.pid,protocol:2,busy:true});
            const generation=await read(join(root,'collection-generation.json'),null);
            if(generation!==this.generation){this.engine.files.invalidateStorage();this.generation=generation;}
          }finally{await release();}
        }
        this.active++;
      },{signal,waitMs:TOOL_LOCK_WAIT_MS});
    }catch(error){if(onUnavailable)return onUnavailable(error);throw error;}
    try{return await fn();}
    finally{
      await this.engine.store.lock('maintenance-owner',async()=>{
        this.active--;
        if(!this.active)await this.writeIdle();
      }).catch(error=>this.warn(error));
    }
  }
  async writeIdle(){
    if(this.disposed&&!this.active&&!this.engine.operations.size){await unlink(this.ownerFile).catch(()=>{});return;}
    try{await atomic(this.ownerFile,{pid:process.pid,protocol:2,busy:this.active>0||this.engine.operations.size>0});}
    catch(error){
      // Once all work has finished, an ENOSPC idle-marker failure must not
      // strand a live busy owner and prevent the very cleanup that frees space.
      if(!this.active&&!this.engine.operations.size&&['ENOSPC','EDQUOT'].includes(error.code)){
        await unlink(this.ownerFile).catch(e=>{if(e.code!=='ENOENT')throw e;});this.lastSweep=0;this.schedule();
      }
      throw error;
    }
    if(!this.active&&!this.engine.operations.size)this.schedule();
  }
  async idle(){await this.engine.store.lock('maintenance-owner',()=>this.writeIdle()).catch(error=>this.warn(error));}
  warn(error){this.engine.ctx.logger?.warn?.('Rewind background maintenance: '+error.message);}
  schedule(){
    if(this.disposed)return;
    const growth=this.engine.files.stats.storedBytes-this.sweptBytes;
    const delay=growth>=8*1024*1024?1000:Math.max(1000,30000-(Date.now()-this.lastSweep));
    const due=Date.now()+delay;
    if(this.timer&&this.timerDue<=due)return;
    clearTimeout(this.timer);this.timerDue=due;
    this.timer=setTimeout(()=>{this.timer=null;void this.collect();},delay);this.timer.unref?.();
  }
  async collect(){
    return this.engine.store.lock('maintenance-owner',async()=>{
      if(this.disposed||this.active||this.engine.operations.size)return;
      const result=await collectGarbage(this.engine.store.root,{apply:true,
        targetBytes:this.config.storageTargetBytes??2*1024**3,
        retentionMs:(this.config.retentionDays??30)*86400000,
        maxRewriteBytes:16*1024*1024});
      if(!result.busy){
        this.lastSweep=Date.now();this.sweptBytes=this.engine.files.stats.storedBytes;
        if(result.reclaimableBytes-result.reclaimedBytes>1024*1024){if(!result.rewriteDeferred)this.lastSweep=0;this.schedule();}
      }else this.schedule();
      return result;
    }).catch(error=>{this.warn(error);this.lastSweep=Date.now();this.sweptBytes=this.engine.files.stats.storedBytes;this.schedule();});
  }
  async pin(plan){await atomic(join(this.engine.store.root,'pins',plan.id+'.json'),{pid:process.pid,sessionId:plan.sessionId,expires:plan.expires});}
  async unpin(id){await unlink(join(this.engine.store.root,'pins',id+'.json')).catch(()=>{});}
  async dispose(){this.disposed=true;clearTimeout(this.timer);await this.engine.store.lock('maintenance-owner',()=>this.writeIdle());}
}
