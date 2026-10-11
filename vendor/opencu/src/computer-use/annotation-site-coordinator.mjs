import {randomUUID} from 'node:crypto';
import {installAnnotationSiteRequestReceiver} from './annotation-site-requests.mjs';
import {captureAnnotationSiteRequest} from './annotation-site-request-capture.mjs';
import {captureAnnotation} from './browser-annotation.mjs';
import {handleAnnotationQueue} from './annotation-queue.mjs';
import {siteAnnotationHostname} from './site-annotation-settings.mjs';
import {applySiteAnnotationFeaturesEnabled,clearSiteAnnotationFeaturePreview} from './site-annotation-features.mjs';
import {restoreQueuedAnnotationSiteControls} from './annotation-site-controls.mjs';

const changed=()=>Object.assign(new Error('网页批注请求或当前预览已改变'),{code:'ANNOTATION_CHANGED'});
const empty=(tabId,loaderId,revision=0)=>({tabId,loaderId,revision,permission:null,request:null});

// Oje permissions belong to the site hostname. Pending requests also retain
// the actual document and writable viewer; a different pane cannot answer.
export class AnnotationSiteCoordinator {
  constructor(manager){this.manager=manager;this.records=new Map();this.revision=0;}

  current(record){
    const {manager}=this,{state,viewer,actor,view,views,document}=record;
    return !record.closed&&!manager.closed&&manager.enabled&&manager.sessions.get(state.id)===state
      &&state.viewers.get(actor)===viewer&&!viewer.readOnly&&!view.closed&&!view.lifetime.signal.aborted
      &&view.document===document&&!document.signal.aborted&&views.views.get(view.tabId)===view
      &&manager.viewerTarget(state,{actor,tabId:view.tabId})?.id===view.tabId;
  }

  eligible(record){
    return this.current(record)&&record.ui.available&&!record.state.resuming&&!record.view.dialog
      &&(!record.state.uiAction||!!record.request)&&!this.manager.browserAgentActive(record.state)
      &&this.manager.siteAnnotationSettings.isEnabled(record.view.record.page.url());
  }

  policy(record){
    let canUseSiteAnnotationApi=false;
    try{canUseSiteAnnotationApi=this.eligible(record);}catch(error){this.warning(record,error);}
    return{canUseSiteAnnotationApi,hasActiveEditor:record.ui.hasActiveEditor,
      isAgentControllingBrowser:this.manager.browserAgentActive(record.state),
      interactionMode:record.ui.editorOpen&&record.ui.interactionMode==='comment'&&record.queueMode==='comment'?'comment':'browse'};
  }

  snapshot(record){
    return{tabId:record.view.tabId,loaderId:record.loaderId,revision:record.revision,
      permission:record.permission?{id:record.permission.id,hostname:record.permission.hostname,requestedInteractionMode:record.permission.mode}:null,
      request:record.request?.public??null};
  }

  publish(record){
    record.revision=++this.revision;
    const value=this.snapshot(record);
    try{record.viewer.send('site-annotation-state',value);}catch{}
    return value;
  }

  warning(record,error){
    if(!this.current(record)||error?.code==='ANNOTATION_CHANGED'||error?.name==='AbortError')return;
    try{record.viewer.send('warning',{message:error.message});}catch{}
  }

  async dispose(record){
    if(record.disposing)return record.disposing;
    record.closed=true;record.controller.abort(changed());
    record.permission?.resolve(false);record.request?.cancel();
    record.permission=null;record.request=null;this.publish(record);
    record.disposing=(async()=>{
      for(const signal of record.signals)signal.removeEventListener('abort',record.aborted);
      const receiver=record.receiver??await record.initializing?.catch(()=>null);
      await receiver?.dispose();
    })().finally(()=>{if(this.records.get(record.view)===record)this.records.delete(record.view);});
    return record.disposing;
  }

  async sync(record){
    const operation=(record.syncTail??Promise.resolve()).catch(()=>{}).then(async()=>{
      if(!this.current(record))return this.dispose(record);
      if(!this.policy(record).canUseSiteAnnotationApi){record.permission?.resolve(false);record.request?.cancel();}
      record.queueMode=(await handleAnnotationQueue(record.views,record.view,{action:'snapshot'},record.controller.signal,record.state)).interactionMode;
      await record.receiver?.sync();
    });
    record.syncTail=operation;return operation;
  }

  async syncSession(state){
    const results=await Promise.allSettled([...this.records.values()].filter(record=>record.state===state).map(record=>this.sync(record)));
    for(const result of results)if(result.status==='rejected'&&result.reason?.code!=='ANNOTATION_CHANGED')throw result.reason;
  }

  async closeViewer(viewer){
    for(const record of [...this.records.values()])if(record.viewer===viewer)await this.dispose(record);
  }

  async close(){
    const results=await Promise.allSettled([...this.records.values()].map(record=>this.dispose(record)));
    const errors=results.filter(value=>value.status==='rejected').map(value=>value.reason);
    if(errors.length)throw new AggregateError(errors,'网页批注请求清理失败');
  }

  async refreshSettings(hostname){
    const manager=this.manager,settings=manager.siteAnnotationSettings;
    for(const views of [manager.browserViews,...manager.extensionViews.values()])for(const view of views.views.values()){
      if(view.closed||view.document.signal.aborted||siteAnnotationHostname(view.record.page.url())!==hostname)continue;
      await views.snapshotRead(view,async()=>{
        await applySiteAnnotationFeaturesEnabled(views,view,{settings,canPreview:()=>true});
        if(view.siteAnnotationFeaturesEnabled===false)await restoreQueuedAnnotationSiteControls(view);
      });
    }
    for(const record of this.records.values())if(siteAnnotationHostname(record.view.record.page.url())===hostname)await this.sync(record);
  }

  async permission(record,packet,{signal}){
    signal.throwIfAborted();if(!this.eligible(record))return false;
    const siteUrl=record.view.record.page.url(),hostname=siteAnnotationHostname(siteUrl);
    if(hostname===null||packet.loaderId!==record.loaderId)return false;
    if(this.manager.siteAnnotationSettings.hasPermission(siteUrl))return true;
    if(record.permission)return false;
    const mode=packet.kind==='toggle'?packet.interactionMode:'comment';
    let resolve;const result=new Promise(done=>{resolve=done;});
    const pending={id:randomUUID(),hostname,siteUrl,mode,resolve};record.permission=pending;
    const cancel=()=>resolve(false);signal.addEventListener('abort',cancel,{once:true});this.publish(record);
    try{return await result===true&&!signal.aborted&&this.eligible(record);}
    finally{signal.removeEventListener('abort',cancel);if(record.permission===pending){record.permission=null;this.publish(record);}}
  }

  async deliver(record,packet,{signal,confirm}){
    signal.throwIfAborted();if(!this.eligible(record)||record.request)return false;
    const kind=packet.kind==='toggle'?'mode':'annotation';
    const request=kind==='mode'?{id:packet.requestId,kind,interactionMode:packet.interactionMode}
      :{id:packet.requestId,kind,...packet.request};
    let resolve;const result=new Promise(done=>{resolve=done;});
    const controller=new AbortController(),pending={packet,public:request,confirm,signal:AbortSignal.any([signal,controller.signal]),resolve};record.request=pending;
    const cancel=()=>{controller.abort(changed());resolve(false);};pending.cancel=cancel;
    signal.addEventListener('abort',cancel,{once:true});this.publish(record);
    let accepted=false;
    try{accepted=await result===true&&!signal.aborted&&this.eligible(record);return accepted;}
    finally{
      signal.removeEventListener('abort',cancel);
      try{
        if(!accepted)await pending.opening?.catch(()=>{});
        if(!accepted&&pending.entered&&pending.previousMode==='browse'&&record.view.document===record.document&&!record.document.signal.aborted&&!record.view.closed){
          await record.views.snapshotRead(record.view,()=>handleAnnotationQueue(record.views,record.view,{action:'exit'},undefined,record.state));
        }
      }finally{if(record.request===pending){record.request=null;this.publish(record);}}
    }
  }

  async initialize(record){
    const {views,view,document}=record,signal=record.controller.signal;
    view.siteAnnotationFeaturesEnabled=this.manager.siteAnnotationSettings.isEnabled(view.record.page.url());
    const {frameTree}=await views.read(view,view.cdp.send('Page.getFrameTree'),signal);
    if(!this.current(record)||view.document!==document||frameTree.frame.loaderId!==record.loaderId)throw changed();
    const receiver=await installAnnotationSiteRequestReceiver(views,view,{cdp:view.cdp,frameId:frameTree.frame.id,loaderId:record.loaderId},
      {getState:()=>this.policy(record),requestPermission:(packet,context)=>this.permission(record,packet,context),
        onRequest:(packet,context)=>this.deliver(record,packet,context),onToggle:(packet,context)=>this.deliver(record,packet,context),
        onError:error=>this.warning(record,error)},signal);
    if(!this.current(record)){await receiver?.dispose();throw changed();}
    record.receiver=receiver;return receiver;
  }

  async open(record,pending){
    if(pending.opening)return pending.opening;
    pending.opening=(async()=>{
      if(!this.eligible(record)||record.request!==pending)throw changed();
      const {views,view,state}=record,signal=pending.signal,request=pending.public;
      await pending.confirm(pending.packet);signal.throwIfAborted();
      let captured={snapshot:null,selection:null,request};
      if(request.kind==='annotation'||request.interactionMode==='comment'){
        await clearSiteAnnotationFeaturePreview(view,{owner:record.viewer});
        const flow=request.kind==='annotation'&&request.enterAnnotationMode!==true?'quick':'batch';
        pending.previousMode=(await handleAnnotationQueue(views,view,{action:'snapshot'},signal,state)).interactionMode;
        const queue=await views.snapshotRead(view,()=>handleAnnotationQueue(views,view,{action:'enter',annotationFlow:flow},signal,state));
        pending.entered=true;
        captured=request.kind==='annotation'
          ?await views.snapshotRead(view,()=>captureAnnotationSiteRequest(views,view,pending.packet,signal,{confirm:pending.confirm}))
          :{snapshot:await views.snapshotRead(view,()=>captureAnnotation(views,view,signal)),selection:null};
        captured.queue=queue;
        if(request.kind==='annotation'){
          const selected=captured.selection;
          const plan=await views.snapshotRead(view,()=>handleAnnotationQueue(views,view,{action:'editor-open-plan',sourceFrameId:captured.snapshot.frame.id,
            selectionPoint:selected.point,...(selected.kind==='element'?{elementKey:selected.elementKey}:{textSelectionKey:selected.textSelectionKey})},signal,state,{siteRequest:pending.packet}));
          captured.queue=plan;captured.editorOpenPlan=plan.editorOpenPlan;
        }
      }else captured.queue=await handleAnnotationQueue(views,view,{action:'snapshot'},signal,state);
      await pending.confirm(pending.packet);signal.throwIfAborted();
      if(!this.eligible(record)||record.request!==pending)throw changed();
      pending.openResult={...captured,request};return pending.openResult;
    })();
    return pending.opening;
  }

  async action(id,input,signal){
    signal?.throwIfAborted();const manager=this.manager,state=manager.sessions.get(id),viewer=state?.viewers.get(input.actor),target=manager.viewerTarget(state,input);
    if(!state||!viewer||viewer.readOnly||target?.kind!=='tab'||target.id!==input.tabId||state.controlEpoch!==input.controlEpoch||!manager.enabled||manager.closed)throw changed();
    const views=manager.viewsFor(target),view=views.views.get(target.id);
    if(!view||view.closed||view.document.signal.aborted||input.loaderId!==view.loaderId||input.browserId!==views.browser.id)throw changed();
    let record=this.records.get(view);
    if(record&&!this.current(record)){await this.dispose(record);record=null;}
    if(record&&record.viewer!==viewer)return{available:false,siteAnnotationState:empty(view.tabId,view.loaderId,++this.revision),actor:input.actor,controlEpoch:state.controlEpoch};
    if(input.action==='state'){
      if(!['available','editorOpen','hasActiveEditor'].every(key=>typeof input[key]==='boolean')||!['browse','comment'].includes(input.interactionMode)
        ||input.editorOpen!==(input.interactionMode==='comment'))throw new TypeError('网页批注界面状态无效');
      if(!record&&input.available){
        const controller=new AbortController();record={state,viewer,actor:input.actor,views,view,document:view.document,loaderId:view.loaderId,controller,ui:null,revision:++this.revision,closed:false};
        const created=record;
        record.signals=[view.document.signal,view.lifetime.signal];record.aborted=()=>{void this.dispose(created).catch(error=>this.warning(created,error));};
        for(const lifetime of record.signals)lifetime.addEventListener('abort',record.aborted,{once:true});
        this.records.set(view,record);
      }
      if(record){
        record.ui={available:input.available,editorOpen:input.editorOpen,hasActiveEditor:input.hasActiveEditor,interactionMode:input.interactionMode};
        if(!input.available){await this.dispose(record);record=null;}
        else{
          record.initializing??=this.initialize(record);
          try{await record.initializing;await this.sync(record);}
          catch(error){await this.dispose(record).catch(()=>{});throw error;}
        }
      }
    }else{
      if(!record?.receiver||!this.current(record))throw changed();
      switch(input.action){
        case'respond':{
          const pending=record.permission;
          if(!pending||pending.id!==input.id||typeof input.allow!=='boolean'||!this.eligible(record))throw changed();
          await manager.siteAnnotationSettings.answerPermission(pending.siteUrl,input.allow,{signal});
          for(const other of this.records.values())if(other.permission?.hostname===pending.hostname)other.permission.resolve(input.allow&&this.eligible(other));
          await this.refreshSettings(pending.hostname);break;
        }
        case'open':{
          const pending=record.request;if(!pending||pending.public.id!==input.id)throw changed();
          const result=await this.open(record,pending);signal?.throwIfAborted();
          return{...result,available:true,siteAnnotationState:this.snapshot(record),actor:input.actor,controlEpoch:state.controlEpoch};
        }
        case'ack':{
          const pending=record.request;if(!pending||pending.public.id!==input.id||typeof input.accepted!=='boolean')throw changed();
          if(input.accepted){
            if(!pending.openResult||!this.eligible(record))throw changed();
            const queue=await handleAnnotationQueue(views,view,{action:'snapshot'},signal,state);
            const mode=pending.public.kind==='mode'?pending.public.interactionMode:'comment';
            if(record.ui.interactionMode!==mode||record.ui.editorOpen!==(mode==='comment')||queue.interactionMode!==mode)throw changed();
            await pending.confirm(pending.packet);signal?.throwIfAborted();
          }
          if(input.accepted)pending.resolve(true);else pending.cancel();break;
        }
        default:throw new TypeError('网页批注操作无效');
      }
    }
    signal?.throwIfAborted();
    return{available:!!record?.receiver,siteAnnotationState:record?this.snapshot(record):empty(view.tabId,view.loaderId,++this.revision),actor:input.actor,controlEpoch:state.controlEpoch};
  }
}
