import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { WebSocketServer } from 'ws';

// One explicitly leased Chrome tab, exposed as a scoped CDP browser. Chrome's
// extension API has one native debugger session per tab; logical CDP sessions
// share observations, while their input ownership and cleanup stay separate.
export class ExtensionCdp extends EventEmitter {
  constructor(hub, browserId, tab) {
    super(); this.hub=hub; this.browserId=browserId; this.tab=tab; this.leaseId=randomUUID();
    this.clients=new Set(); this.closedClients=new Map();this.native=new Map(); this.cleanups=new Set(); this.failures=[];this.notices=[];
    this.onEvent=event=>this.receive(event);
    this.onDisconnect=info=>{if(info.id===browserId&&info.epoch===this.epoch)this.lost(new Error('Browser extension disconnected'));};
  }
  async start() {
    const info=this.hub.list().find(browser=>browser.id===this.browserId); if(!info)throw new Error('Browser extension is not connected');
    this.epoch=info.epoch;this.userAgent=info.userAgent;
    this.hub.on('event',this.onEvent);this.hub.on('disconnected',this.onDisconnect);
    try {
      const attached=await this.hub.call(this.browserId,'attach',{tabId:Number(this.tab.id),leaseId:this.leaseId,...(this.tab.creationId?{creationId:this.tab.creationId}:{expected:this.tab})});
      this.targetInfo={...attached.targetInfo,attached:true};
      this.native.set('',this.nativeState('',this.targetInfo));
      const path='/cdp/'+randomUUID();
      this.server=createServer((_req,res)=>{res.writeHead(404);res.end();});
      this.wss=new WebSocketServer({noServer:true,maxPayload:1024*1024});
      this.server.on('upgrade',(req,socket,head)=>{
        let url;try{url=new URL(req.url,'http://'+this.authority);}catch{socket.destroy();return;}
        const clientId=url.searchParams.get('client')??randomUUID();
        if(this.closed||url.pathname!==path||req.headers.origin!==undefined||req.headers.host!==this.authority||!/^[a-z0-9-]{1,100}$/i.test(clientId)||this.closedClients.has(clientId)||[...this.clients].some(client=>client.id===clientId)){socket.destroy();return;}
        this.wss.handleUpgrade(req,socket,head,ws=>this.accept(ws,clientId));
      });
      await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve);});
      this.authority='127.0.0.1:'+this.server.address().port;this.endpoint='ws://'+this.authority+path;
      return this;
    } catch(error){await this.close().catch(()=>{});throw error;}
  }
  nativeState(id,info,parent,waiting=false){return{id,info,parent,waiting,contexts:new Map(),enabled:new Set(),enabling:new Map(),autoAttach:false};}
  endpointFor(id){return this.endpoint+'?client='+encodeURIComponent(id);}
  cursor(actorId, pointer) {
    if (this.closed) return Promise.resolve();
    return this.hub.call(this.browserId, 'cursor', { tabId: Number(this.tab.id), leaseId: this.leaseId, actorId, pointer }, { timeoutMs: 2000 });
  }
  send(client,message){if(!client.closed&&client.ws.readyState===1)client.ws.send(JSON.stringify(message));}
  accept(ws,id){
    const client={ws,id,controller:new AbortController(),sessions:new Map(),detachedSessions:new Set(),closed:false,scripts:[]};this.clients.add(client);
    ws.on('message',data=>{
      let message;try{message=JSON.parse(data);if(!Number.isSafeInteger(message.id)||typeof message.method!=='string')throw new Error('Invalid CDP request');}
      catch{ws.terminate();return;}
      const logical=client.sessions.get(message.sessionId);
      const reply=this.command(client,message.method,message.params??{},message.sessionId).then(result=>this.send(client,{id:message.id,sessionId:message.sessionId,result:result??{}}),error=>{
        if(client.closed)return;
        // Playwright deliberately uses _sendMayFail while creating utility
        // worlds for frames that can swap processes or disappear in parallel.
        // Keep these real protocol replies, but distinguish them from a failed
        // user operation. Unknown caller IDs and manual requests still fail.
        const background=logical?.automatic&&message.method==='Page.createIsolatedWorld'&&/No frame for given id found/.test(error.message);
        const entries=background||error.code==='SESSION_CLOSED'?this.notices:this.failures;
        entries.push({method:message.method,message:error.message});if(entries.length>50)entries.shift();
        this.send(client,{id:message.id,sessionId:message.sessionId,error:{code:error.cdpCode??-32000,message:error.message}});
      });
      if(logical&&message.method==='Page.getFrameTree')logical.frameTreeResponse=reply;
    });
    ws.on('error',()=>{});ws.on('close',()=>{void this.closeClient(client).catch(()=>{});});
  }
  session(client,nativeId,parent,automatic=false){
    const session={id:'trisoul-'+randomUUID(),nativeId,parent,automatic,enabled:new Set(),autoAttach:false};
    client.sessions.set(session.id,session);return session;
  }
  attach(client,nativeId,parent,automatic=false){
    const previous=[...client.sessions.values()].find(session=>session.nativeId===nativeId&&session.parent===parent&&session.automatic===automatic);
    if(previous&&automatic)return previous;
    const native=this.native.get(nativeId);if(!native)throw new Error('The frame target has detached');
    const session=this.session(client,nativeId,parent,automatic);
    this.send(client,{method:'Target.attachedToTarget',...(parent?{sessionId:parent}:{}),params:{sessionId:session.id,targetInfo:{...native.info,attached:true},waitingForDebugger:native.waiting}});
    return session;
  }
  forward(client,nativeId,method,params={}){
    if(client.closed||this.closed)throw new Error('The CDP connection has closed');
    return this.hub.call(this.browserId,'command',{tabId:Number(this.tab.id),leaseId:this.leaseId,actorId:client.id,...(nativeId?{sessionId:nativeId}:{}),method,params},{signal:client.controller.signal,timeoutMs:30000});
  }
  async command(client,method,params,sessionId){
    if(client.closed||this.closed)throw new Error('The CDP connection has closed');
    const session=sessionId?client.sessions.get(sessionId):null;
    if(sessionId&&!session){if(client.detachedSessions.has(sessionId))throw Object.assign(new Error('Session with given id not found; its target detached'),{code:'SESSION_CLOSED',cdpCode:-32001});throw new Error('Unknown CDP session');}
    const browserLevel=!session||session.browser;
    if(method==='Browser.getVersion'){
      const version=this.userAgent?.match(/(?:Chrome|Chromium)\/([\d.]+)/)?.[1];
      if(!version)throw new Error('The extension did not identify its browser version');
      return{protocolVersion:'1.3',product:'Chrome/'+version,userAgent:this.userAgent,revision:'',jsVersion:''};
    }
    if(method==='Target.attachToBrowserTarget'){
      const bound={id:'trisoul-browser-'+randomUUID(),browser:true};client.sessions.set(bound.id,bound);return{sessionId:bound.id};
    }
    if(method==='Target.getBrowserContexts')return{browserContextIds:[]};
    if(method==='Target.closeTarget'){
      if(params.targetId!==this.targetInfo.targetId)throw new Error('Target is outside this browser connection');
      this.tabClosing=true;
      return this.hub.call(this.browserId,'close',{tabId:Number(this.tab.id),leaseId:this.leaseId},{signal:client.controller.signal});
    }
    if(method==='Target.getTargets')return{targetInfos:[...this.native.values()].map(native=>native.info)};
    if(method==='Target.getTargetInfo'){
      const native=params.targetId?[...this.native.values()].find(native=>native.info.targetId===params.targetId):session&&!session.browser?this.native.get(session.nativeId):this.native.get('');
      if(!native)throw new Error('Target is outside this browser connection');
      const result=await this.forward(client,native.id,'Target.getTargetInfo');native.info={...result.targetInfo,attached:true};if(!native.id)this.targetInfo=native.info;return{targetInfo:native.info};
    }
    if(method==='Target.setDiscoverTargets'){
      if(!browserLevel)throw new Error('Discovery is browser-scoped');
      if(session)session.discover=params.discover;else client.discover=params.discover;
      if(params.discover)for(const native of this.native.values())this.send(client,{method:'Target.targetCreated',...(sessionId?{sessionId}:{}),params:{targetInfo:native.info}});
      return{};
    }
    if(method==='Target.setAutoAttach'){
      if(params.flatten!==true)throw new Error('Only flat CDP sessions are supported');
      if(browserLevel){if(params.autoAttach)this.attach(client,'',sessionId,true);else for(const child of [...client.sessions.values()])if(child.automatic&&child.parent===sessionId)this.detach(client,child);return{};}
      session.autoAttach=params.autoAttach;
      const native=this.native.get(session.nativeId);if(!native)throw new Error('Frame detached');
      if(params.autoAttach){
        if(!native.autoAttach){native.autoAttach=true;await this.forward(client,native.id,method,params);}
        for(const child of this.native.values())if(child.parent===native.id)this.attach(client,child.id,session.id,true);
      }else for(const child of [...client.sessions.values()])if(child.automatic&&child.parent===session.id)this.detach(client,child);
      return{};
    }
    if(method==='Target.attachToTarget'){
      const native=[...this.native.values()].find(native=>native.info.targetId===params.targetId);
      if(!native)throw new Error('Target is outside this browser connection');
      return{sessionId:this.attach(client,native.id,sessionId).id};
    }
    if(method==='Target.detachFromTarget'){
      const target=client.sessions.get(params.sessionId);if(!target)throw new Error('Unknown CDP session');
      this.detach(client,target);return{};
    }
    if(browserLevel)throw new Error('Unsupported browser-wide command: '+method);
    const native=this.native.get(session.nativeId);if(!native)throw new Error('Frame detached');
    // Playwright 1.63 still applies this headless initialization despite
    // noDefaults. Existing browser typography belongs to the user; do not
    // override it. Explicit manual CDP sessions keep the real command/error.
    if(method==='Page.setFontFamilies'&&session.automatic)return{};
    const [domain,operation]=method.split('.');
    if(operation==='enable'){
      // Chrome processes discovery before Runtime.enable. Replaying cached
      // contexts locally must keep that ordering: Playwright installs its
      // renderer listeners only after receiving the initial frame tree.
      if(domain==='Runtime')await session.frameTreeResponse;
      if(!native.enabled.has(domain)){
        native.enabled.add(domain);session.enabled.add(domain);
        const pending=this.forward(client,native.id,method,params);native.enabling.set(domain,pending);
        try{return await pending;}catch(error){native.enabled.delete(domain);session.enabled.delete(domain);throw error;}finally{native.enabling.delete(domain);}
      }
      await native.enabling.get(domain);session.enabled.add(domain);
      if(domain==='Runtime')for(const context of native.contexts.values())this.send(client,{sessionId:session.id,method:'Runtime.executionContextCreated',params:context});
      return{};
    }
    if(operation==='disable'){session.enabled.delete(domain);return{};}
    if(method==='Runtime.runIfWaitingForDebugger')native.waiting=false;
    const result=await this.forward(client,native.id,method,params);
    if(method==='Page.addScriptToEvaluateOnNewDocument'&&result.identifier)client.scripts.push({nativeId:native.id,identifier:result.identifier});
    return result;
  }
  detach(client,session){
    for(const child of [...client.sessions.values()])if(child.parent===session.id)this.detach(client,child);
    client.sessions.delete(session.id);
    client.detachedSessions.add(session.id);
    this.send(client,{method:'Target.detachedFromTarget',...(session.parent?{sessionId:session.parent}:{}),params:{sessionId:session.id,targetId:this.native.get(session.nativeId)?.info.targetId}});
  }
  receive(event){
    if(this.closed||event.browser!==this.browserId||event.epoch!==this.epoch||event.params?.leaseId!==this.leaseId)return;
    if(event.event==='stopped'){this.lost(Object.assign(new Error(event.params.released?'Control ended in the browser extension':'Browser input release was not confirmed'),{code:event.params.released?'CONTROL_STOPPED':'INPUT_RELEASE_FAILED',released:event.params.released===true,tabClosed:this.tabClosing||['tab-closed','target_closed'].includes(event.params.reason)}));return;}
    if(event.event==='tab-updated'){
      const root=this.native.get('');if(root){root.info={...root.info,url:event.params.url,title:event.params.title};this.targetInfo=root.info;this.metadata(root.info);}return;
    }
    if(event.event!=='cdp')return;
    const {sessionId='',method,params}=event.params,native=this.native.get(sessionId);if(!native)return;
    if(method==='Runtime.executionContextCreated')native.contexts.set(params.context.id,params);
    if(method==='Runtime.executionContextDestroyed')native.contexts.delete(params.executionContextId);
    if(method==='Runtime.executionContextsCleared')native.contexts.clear();
    if(method==='Target.attachedToTarget'){
      const child=this.nativeState(params.sessionId,params.targetInfo,sessionId,params.waitingForDebugger);this.native.set(child.id,child);
      let listeners=0;
      for(const client of this.clients)for(const logical of [...client.sessions.values()])if(!logical.browser&&logical.nativeId===sessionId&&logical.autoAttach){this.attach(client,child.id,logical.id,true);listeners++;}
      if(!listeners&&child.waiting)void this.hub.call(this.browserId,'command',{tabId:Number(this.tab.id),leaseId:this.leaseId,sessionId:child.id,method:'Runtime.runIfWaitingForDebugger'}).then(()=>{child.waiting=false;},()=>{});
      return;
    }
    if(method==='Target.detachedFromTarget'){
      for(const client of this.clients)for(const logical of [...client.sessions.values()])if(logical.nativeId===params.sessionId)this.detach(client,logical);
      this.dropNative(params.sessionId);return;
    }
    if(method==='Target.targetInfoChanged'){const changed=[...this.native.values()].find(value=>value.info.targetId===params.targetInfo.targetId);if(changed){changed.info={...params.targetInfo,attached:true};this.metadata(changed.info);}return;}
    const domain=method.split('.')[0];
    for(const client of this.clients)for(const logical of client.sessions.values())if(!logical.browser&&logical.nativeId===sessionId&&(logical.enabled.has(domain)||domain==='Inspector'))this.send(client,{sessionId:logical.id,method,params});
  }
  dropNative(id){for(const child of [...this.native.values()])if(child.parent===id)this.dropNative(child.id);this.native.delete(id);}
  metadata(info){
    for(const client of this.clients){
      if(client.discover)this.send(client,{method:'Target.targetInfoChanged',params:{targetInfo:info}});
      for(const session of client.sessions.values())if(session.browser&&session.discover)this.send(client,{sessionId:session.id,method:'Target.targetInfoChanged',params:{targetInfo:info}});
    }
    this.emit('metadata',info);
  }
  lost(error){if(this.loss)return;this.loss=error;for(const client of this.clients)client.ws.terminate();this.emit('lost',error);}
  async closeClient(client,retry=false){
    if(client.cleanup&&(!retry||!client.cleanupFailed))return client.cleanup;
    if(client.cleanup)this.cleanups.delete(client.cleanup);
    client.closed=true;this.clients.delete(client);
    client.controller.abort(new Error('CDP client closed'));
    const pending=(async()=>{
      if(this.loss){if(this.loss.released!==true)throw this.loss;return;}
      await this.hub.call(this.browserId,'stop-actor',{tabId:Number(this.tab.id),leaseId:this.leaseId,actorId:client.id});
      // Empty utility-world scripts belong to this logical connection, too.
      for(const script of client.scripts)await this.hub.call(this.browserId,'command',{tabId:Number(this.tab.id),leaseId:this.leaseId,...(script.nativeId?{sessionId:script.nativeId}:{}),method:'Page.removeScriptToEvaluateOnNewDocument',params:{identifier:script.identifier}}).catch(()=>{});
    })();
    client.cleanup=pending;client.cleanupFailed=false;
    const record={pending,client};this.closedClients.set(client.id,record);this.cleanups.add(pending);
    void pending.then(()=>{this.cleanups.delete(pending);record.client=null;},()=>{client.cleanupFailed=true;});return pending;
  }
  async settle(){await Promise.all(this.cleanups);}
  async closeClientById(id){
    const client=[...this.clients].find(client=>client.id===id);
    if(client){client.ws.terminate();return this.closeClient(client);}
    const closed=this.closedClients.get(id);
    if(closed)return closed.client?.cleanupFailed?this.closeClient(closed.client,true):closed.pending;
    throw new Error('Unknown CDP client');
  }
  async close(){
    if(this.closing)return this.closing;
    const pending=(async()=>{
      this.closed=true;
      const closing=[...this.clients].map(client=>{client.ws.terminate();return this.closeClient(client);});
      await Promise.allSettled([...closing,...this.cleanups]);
      let detachError;
      // A failed actor release can still be recovered by a confirmed whole-tab
      // release. Retry that acknowledgement without opening a new CDP client.
      if(this.loss?.released!==true)try{
        if(this.hub.list().find(browser=>browser.id===this.browserId)?.epoch!==this.epoch)throw this.loss??new Error('Browser extension disconnected before release');
        const result=await this.hub.call(this.browserId,'detach',{tabId:Number(this.tab.id),leaseId:this.leaseId});
        if(result?.released!==true)throw new Error('Browser input release was not confirmed');
        this.loss={released:true};
      }catch(error){detachError=error;}
      this.hub.off('event',this.onEvent);this.hub.off('disconnected',this.onDisconnect);
      if(this.wss){await new Promise(resolve=>this.wss.close(resolve));this.wss=null;}
      if(this.server){await new Promise(resolve=>this.server.close(resolve));this.server=null;}
      if(detachError)throw detachError;
      this.cleanups.clear();
    })();this.closing=pending;
    try{return await pending;}finally{if(this.closing===pending)this.closing=null;}
  }
}
