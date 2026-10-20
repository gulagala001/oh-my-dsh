import {mkdir,unlink} from 'node:fs/promises';
import {atomic,lease} from './store.mjs';
import {randomUUID} from 'node:crypto';
import {collectGarbage} from './garbage.mjs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { RewindEngine } from './engine.mjs';
import { acquireShared } from './shared.mjs';
import {Maintenance} from './maintenance.mjs';
export const name='dsh-undo-plugin';
export const inject=['agents','sessions','sessionController','webServer','connection'];
const send=(res,status,value)=>{if(res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function body(req){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>256*1024)throw Error('请求过大');parts.push(part);}return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');}
export async function install(ctx,config={}) {
  const engine=new RewindEngine(ctx,config.storageDir||join(process.env.DSH_HOME||join(homedir(),'.dsh'),'rewind-plus','v1'),config);
  const commands=new Set();
  ctx.inject(['commands'],scope=>{
    for(const [name,description]of [['rewind','打开回退列表'],['undo','撤销上一次撤回']]){
      // A conflicting plugin only costs this alias, never the backup pipeline.
      try{scope.effect(()=>{
        const off=scope.commands.register({name,description,handler:()=>({kind:'error',text:'请在 DSH 对话输入框使用此命令，并在界面中确认操作。'})});
        commands.add(name);return()=>{commands.delete(name);off();};
      });}catch(error){scope.logger.warn(`/${name} unavailable: ${error.message}`);}
    }
  });
  const ownerFile=join(engine.store.root,'owners',`${process.pid}-${randomUUID()}.json`);
  const releaseCollection=await lease(join(engine.store.root,'collection.lock'),{waitMs:5000});
  try{
    try{await collectGarbage(engine.store.root,{apply:true,locked:true});}catch(error){ctx.logger.warn('Rewind backup cleanup skipped: '+error.message);}
    // Publish ownership before releasing the collection fence: another starting
    // host must not collect pre-images that this host is about to capture.
    await atomic(ownerFile,{pid:process.pid,protocol:2,busy:false});
  }finally{await releaseCollection();}
  const maintenance=engine.maintenance=new Maintenance(engine,ownerFile,config);
  ctx.effect(()=>()=>maintenance.dispose());
  ctx.effect(()=>{const key=Symbol.for('dsh-rewind-plus.engine');ctx.root[key]=engine;return()=>{if(ctx.root[key]===engine)delete ctx.root[key];};});
  ctx.on('agent/pre-step',(payload,next)=>maintenance.run(()=>engine.preStep(payload,next),error=>{engine.backupGap(payload.agent,error);return next();}),{prepend:true});
  ctx.on('session/event',(session,event)=>engine.finish(session,event));
  ctx.on('tools/execute',(exec,next)=>maintenance.run(()=>engine.tool(exec,next),error=>{if(exec.agent)engine.backupGap(exec.agent,error);return next();}),{prepend:true});
  ctx.effect(()=>()=>{for(const [id,op]of engine.operations){const agent=ctx.agents.get(id);agent?.inbox.remove(op.marker);agent?.cancel({kind:'user'},{keepInbox:true});op.reject(Error('撤回插件已卸载；未完成操作的备份已保留'));}engine.operations.clear();});
  const operations=['state','candidates','preview','apply','undo-preview','undo','stop','recover','ack','attachment'];
  for(const operation of operations)ctx.effect(()=>ctx.webServer.register({kind:'exact',path:`/api/dsh-rewind/${operation}`,handler:async(req,res)=>{
    const rejection=ctx.connection.requestRejection(req);if(rejection!==undefined){res.writeHead(rejection);res.end();return;}
    if(req.method!=='POST'){send(res,405,{error:'POST required'});return;}
    try{await maintenance.run(async()=>{
      const data=await body(req),id=data.sessionId;
      if(typeof id!=='string'||id.length>256)throw Error('无效会话');
      let value;
      if(operation==='ack')value=await engine.acknowledge(id,data.draftToken);
      if(operation==='recover')value=await engine.launch(id,{recovery:true});
      if(operation==='state')value={...await engine.getState(id),commands:[...commands]};
      if(operation==='candidates')value=await engine.candidates(id,data.before);
      if(operation==='preview')value=await engine.preview(id,data.messageSeq);
      if(operation==='undo-preview')value=await engine.preview(id,undefined,true);
      if(operation==='apply'||operation==='undo')value=await engine.execute(id,data.planId,data.draft);
      if(operation==='stop'){
        const related=ctx.agents.list().filter(a=>engine.owner(a).id===id);
        for(const a of related)a.cancel({kind:'user'},{keepInbox:true});
        await Promise.race([Promise.all(related.map(a=>a.whenIdle())),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('停止尚未完成，请稍后重新检查')),30000);t.unref?.();})]);
        value=await engine.getState(id);
      }
      if(operation==='attachment'){
        const session=engine.session(id),event=session.eventAt(data.messageSeq),block=event?.type==='user/message'?event.data.content[data.index]:null;
        if(!block?.attachment||!['file','image'].includes(block.type))throw Error('会话中不存在这个附件');
        res.setHeader('Content-Type',block.attachment.mediaType||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
        const store=ctx.get('attachments');if(!store)throw Error('附件存储不可用');
        if(block.type==='image')res.end((await store.readImage(block.attachment)).data);
        else await pipeline(Readable.from(store.readFileStream(block.attachment)),res);
        return;
      }
      send(res,200,value);
    });
    }catch(e){if(res.headersSent)res.destroy();else send(res,409,{error:e.message||String(e)});}
  }}));

}
const runtime={name:'dsh-undo-plugin-runtime',inject,apply:install};
export const apply=(ctx,config)=>acquireShared(ctx,'runtime',runtime,config);
