import { randomUUID } from 'node:crypto';
import { nativeValue } from './native.mjs';
import {setTimeout as delay} from 'node:timers/promises';

// A window video connection has no input lease. It remains independent of the
// model's observation baseline and survives stopping or ending the model turn.
export class NativeViews {
  constructor(native) { this.native=native;this.views=new Map(); }
  async subscribe(sessionId,targetId,listener,signal,descriptor) {
    signal?.throwIfAborted();let view=this.views.get(targetId);
    if(view?.closed){await this.stop(view);view=this.views.get(targetId);}
    if(!view){
      const target=descriptor??this.native.targets.get(targetId);
      if(!target||(target.viewId??target.id)!==targetId||target.sessionId!==sessionId)throw new Error('应用绑定已释放，请重新选择应用后查看画面');
      const {id,viewId,pid,windowId,processIdentity,bundleId,name}=target;
      view={id:targetId,target:{id,viewId,pid,windowId,processIdentity,bundleId,name,sessionId},sessionId:'native-preview-'+randomUUID(),listeners:new Set(),controller:new AbortController(),closed:false,sequence:0};
      this.views.set(targetId,view);view.ready=this.start(view);
    }
    if(view.target.sessionId!==sessionId)throw new Error('该应用画面属于其他会话');
    view.listeners.add(listener);
    let closing;
    const close=()=>closing??=(async()=>{signal?.removeEventListener('abort',aborted);view.listeners.delete(listener);if(!view.listeners.size)await this.stop(view);})().catch(error=>{closing=null;throw error;});
    const aborted=()=>{void close().catch(()=>{});};signal?.addEventListener('abort',aborted,{once:true});
    try{await view.ready;signal?.throwIfAborted();if(view.failure)throw view.failure;if(view.latest)listener('frame',view.latest);if(view.status)listener('capture',this.captureState(view,view.status));if(view.cursor)listener('cursor',view.cursor);return close;}
    catch(error){await close().catch(()=>{});throw error;}
  }
  retainCursor(sessionId) {
    for (const view of this.views.values()) if (view.target.sessionId === sessionId && view.cursor) {
      view.retainedCursor = { ...view.cursor, isActive: false, buttons: 0, press: undefined };
    }
  }
  clearRetainedCursor(sessionId) {
    for (const view of this.views.values()) if (view.target.sessionId === sessionId) view.retainedCursor = null;
  }
  publish(view,event,value){if(!view.closed)for(const listener of view.listeners){try{listener(event,value);}catch{}}}
  captureState(view,status){return{status,sessionId:view.target.sessionId,targetId:view.id,captureId:view.captureId};}
  async start(view){
    await this.openCapture(view);if(!view.closed)view.loop=this.poll(view);
  }
  async openCapture(view){
    while(!view.closed){try{
    const connection=await this.native.connection(view.sessionId);
    if(connection.info._meta?.trisoul?.build!==(await this.native.expectedBuild()).build)throw new Error('桌面控制运行时需要更新后才能打开实时画面');
    const started=nativeValue(await this.native.call(view.sessionId,'start_preview',{pid:view.target.pid,window_id:view.target.windowId,process_identity:view.target.processIdentity,owner_session_id:view.target.sessionId},view.controller.signal));
    if(view.closed)return;
    view.captureId=started.captureId??view.sessionId;
    view.startedAt=Date.now();
    return;
    }catch(error){if(!await this.recover(view,error))return;}}
  }
  async recover(view,error){
    if(view.closed)return false;
    if(error.code!=='CAPTURE_INTERRUPTED'||(view.restarts??0)>=2)throw error;
    view.restarts=(view.restarts??0)+1;view.status='waiting';view.latest=null;view.cursor=null;view.retainedCursor=null;view.cursorKey=undefined;
    this.publish(view,'cursor',null);this.publish(view,'capture',this.captureState(view,'waiting'));
    await this.native.releasePreview(view.sessionId);if(view.closed)return false;
    await delay(100,undefined,{signal:view.controller.signal});if(view.closed)return false;
    view.sessionId='native-preview-'+randomUUID();view.sequence=0;return true;
  }
  async poll(view){
    try{
      while(!view.closed){
        // Observe an existing owner lease only; opening a preview must never
        // create an input connection. Resolve again after stop/resume rotates it.
        const ownerPending=this.native.connections?.get(view.target.sessionId);
        if(view.ownerPending!==ownerPending){
          view.ownerPending=ownerPending;view.owner=null;
          void ownerPending?.then(owner=>{if(!view.closed&&view.ownerPending===ownerPending)view.owner=owner;},()=>{});
        }
        const owner=view.owner;
        const ownerSessionLabel=owner&&!owner.client.closed&&this.native.connections.get(view.target.sessionId)===ownerPending?owner.label:undefined;
        const next=nativeValue(await this.native.call(view.sessionId,'preview_frame',{after:view.sequence,capture_id:view.captureId,owner_session_label:ownerSessionLabel},view.controller.signal));
        if(view.closed)return;
        if(next.captureId!==undefined&&next.captureId!==view.captureId)throw new Error('原生画面的捕获连接已改变，请重连画面');
        if(!view.latest&&!next.data&&next.status==='waiting'&&Date.now()-view.startedAt>5000)throw new Error('应用未返回有效画面，请重连画面或检查窗口状态');
        if(next.data){
          view.sequence=next.sequence;
          const bounds=next.bounds;
          if(!bounds||![bounds.width,bounds.height,next.pixelWidth,next.pixelHeight].every(value=>Number.isFinite(value)&&value>0))throw new Error('原生画面的尺寸无效');
          view.latest={id:randomUUID(),sessionId:view.target.sessionId,targetId:view.id,captureId:view.captureId,loaderId:view.target.processIdentity+':'+view.target.windowId,sequence:next.sequence,data:next.data,mediaType:next.mediaType,width:bounds.width,height:bounds.height,pixelWidth:next.pixelWidth,pixelHeight:next.pixelHeight,bounds,geometry:bounds,geometryVerified:next.geometryVerified,at:next.capturedAt};
          this.publish(view,'frame',view.latest);
        }
        if (next.cursor && (next.cursor.source !== view.retainedCursor?.source || next.cursor.sequence !== view.retainedCursor?.sequence)) view.retainedCursor = null;
        const cursor=next.cursor?{...next.cursor,sessionId:view.target.sessionId,targetId:view.id,captureId:view.captureId,loaderId:view.target.processIdentity+':'+view.target.windowId}:view.retainedCursor??null,key=JSON.stringify(cursor);
        if(view.cursorKey!==key){view.cursorKey=key;view.cursor=cursor;this.publish(view,'cursor',cursor);}
        if(view.status!==next.status){view.status=next.status;this.publish(view,'capture',this.captureState(view,next.status));}
      }
    }catch(error){
      try{if(await this.recover(view,error)){await this.openCapture(view);if(!view.closed)return this.poll(view);}}catch(failure){error=failure;}
      if(!view.closed){view.failure=error;this.publish(view,['STALE_WINDOW','STALE_PROCESS','APP_EXITED'].includes(error.code)?'closed':'failure',{reason:error.code,message:error.message,userStopped:['CAPTURE_STOPPED_BY_USER','CANCELLED'].includes(error.code)});void this.stop(view).catch(()=>{});}
    }
  }
  async stop(view){
    if(view.stopping)return view.stopping;
    view.closed=true;view.controller.abort(new Error('Application preview closed'));
    view.stopping=(async()=>{
      await view.ready?.catch(()=>{});await view.loop?.catch(()=>{});await this.native.releasePreview(view.sessionId);
      view.latest=null;view.cursor=null;view.retainedCursor=null;view.status='stopped';
      // Closed views cannot publish late frames. The final state follows the
      // native cleanup acknowledgement and remains visible to live listeners.
      for(const listener of view.listeners){try{listener('cursor',null);listener('capture',{...this.captureState(view,'stopped'),stopped:true});}catch{}}
      if(this.views.get(view.id)===view)this.views.delete(view.id);
    })().finally(()=>{view.stopping=null;});return view.stopping;
  }
  async close(){const results=await Promise.allSettled([...this.views.values()].map(view=>this.stop(view)));const error=results.find(r=>r.status==='rejected');if(error)throw error.reason;}
}
