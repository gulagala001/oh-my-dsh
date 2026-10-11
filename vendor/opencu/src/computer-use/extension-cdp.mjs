import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { WebSocketServer } from 'ws';
import { registerBrowserAuthDiagnosticsScope, suppressBrowserAuthDiagnostics, protectBrowserAuthCredentialDiagnostics } from './browser-network.mjs';
import { createBrowserTransportAuthProtection } from './browser-transport.mjs';

const WIRE_CLOSE_TIMEOUT_MS = 2000;
const browserAuthCommandAuthority = Symbol('browser-auth-command-authority');

// One explicitly leased Chrome tab, exposed as a scoped CDP browser. Chrome's
// extension API has one native debugger session per tab; logical CDP sessions
// share observations, while their input ownership and cleanup stay separate.
export class ExtensionCdp extends EventEmitter {
  #authCleanupLeases = new Map();
  #authPausedRequests = new Set();
  #browserAuth = { scope: {}, rawLeases: 0, diagnosticsProtected: false, workerCount: 0, workerEnabled: false, workerUncertain: false, workerLocked: false, workerPending: Promise.resolve(), authority: {}, observers: new Set() };
  constructor(hub, browserId, tab) {
    super(); this.hub=hub; this.browserId=browserId; this.tab=tab; this.leaseId=randomUUID();
    this.clients=new Set(); this.closedClients=new Map();this.native=new Map(); this.cleanups=new Set(); this.failures=[];this.notices=[];this.rawObservers=new Set();this.destroyedTargets=new Set();this.knownTargets=new Set();
    this.browserAuthControls = Object.freeze({
      suppressRawNetworkEvents: binding => this.suppressBrowserAuthRawEvents(binding),
      protectBrowserAuthCredentialDiagnostics: binding => this.protectBrowserAuthDiagnostics(binding),
      protectBrowserAuthServiceWorkerBypass: (binding, options) => this.protectBrowserAuthWorkerBypass(binding, options),
    });
    this.onEvent=event=>this.receive(event);
    this.onDisconnect=(info,error)=>{
      if(info.id!==browserId||info.epoch!==this.epoch)return;
      const proof=this.providerReleaseProof(info,error);
      if(proof){
        this.lost(Object.assign(new Error(error?.message??'Desktop browser provider closed'),{cause:error,code:error?.code??'EXTENSION_DISCONNECTED',released:true,providerClosed:true,releaseProof:proof,tabClosed:true}));return;
      }
      const pending=this.desktopProvider&&(error?.hostClosing===true||error?.providerClosed===true||this.providerClosePending===true);
      const loss=this.desktopProvider&&error?.providerClosed===true?Object.assign(new Error('Desktop browser closure proof did not match this connection'),{cause:error,code:'PROVIDER_CLOSE_UNCONFIRMED'}):error;
      this.lost(loss,{awaitPhysical:pending,awaitProvider:pending});
    };
  }
  async start() {
    if(this.closed)throw this.loss instanceof Error?this.loss:new Error('The CDP connection has closed');
    if(this.server)throw new Error('The CDP connection has already started');
    const info=this.hub.list().find(browser=>browser.id===this.browserId); if(!info)throw new Error('Browser extension is not connected');
    this.epoch=info.epoch;this.userAgent=info.userAgent;this.extensionId=info.metadata?.extensionId;
    this.desktopProvider=info.type==='iab'&&info.metadata?.backend==='desktop';
    this.hub.on('event',this.onEvent);this.hub.on('disconnected',this.onDisconnect);
    try {
      const attached=await this.call('attach',{tabId:Number(this.tab.id),leaseId:this.leaseId,...(this.tab.creationId?{creationId:this.tab.creationId}:{expected:this.tab})});
      if(this.loss)throw this.loss;
      this.targetInfo={...attached.targetInfo,attached:true};
      this.knownTargets.add(this.targetInfo.targetId);
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
      if(this.loss)throw this.loss;
      this.authority='127.0.0.1:'+this.server.address().port;this.endpoint='ws://'+this.authority+path;
      return this;
    } catch(error){await this.close().catch(()=>{});throw error;}
  }
  nativeState(id,info,parent,waiting=false){return{id,info,parent,waiting,contexts:new Map(),enabled:new Set(),enabling:new Map(),autoAttach:false};}
  providerReleaseProof(info,error){
    const proof=error?.releaseProof;
    if(!this.desktopProvider||info.type!=='iab'||info.metadata?.backend!=='desktop'||error?.providerClosed!==true
      ||proof?.epoch!==this.epoch||proof.released!==true||proof.providerClosed!==true)return;
    return{epoch:proof.epoch,released:true,providerClosed:true};
  }
  hasReleasedProvider(){
    const proof=this.loss?.releaseProof;
    return this.desktopProvider===true&&this.loss?.released===true&&this.loss.providerClosed===true
      &&proof?.epoch===this.epoch&&proof.released===true&&proof.providerClosed===true;
  }
  call(method,params={},options={}){
    const { [browserAuthCommandAuthority]: authority, ...wireOptions } = options;
    if (method === 'command' && params.method === 'Network.setBypassServiceWorker'
      && this.#browserAuth.workerLocked && authority !== this.#browserAuth.authority) {
      throw new Error('Service worker bypass is owned by active browser credential protection.');
    }
    if (method === 'command' && (this.#browserAuth.rawLeases > 0 || this.#browserAuth.workerCount > 0)
      && ['Runtime.runIfWaitingForDebugger', 'Target.setAutoAttach'].includes(params.method) && authority !== this.#browserAuth.authority) {
      throw new Error('Paused browser credential targets are owned by active browser credential protection.');
    }
    return this.hub.call(this.browserId,method,params,{...wireOptions,epoch:this.epoch});
  }
  get authProtection() { return Object.freeze({ workerCount: this.#browserAuth.workerCount, rawSuppressed: this.#browserAuth.rawLeases > 0 || this.#browserAuth.diagnosticsProtected }); }
  browserAuthBinding(binding) {
    const root = this.native.get(''), record = binding?.record, browser = binding?.browser;
    const entry = browser?.entries?.get(record?.id);
    const link = entry && [...entry.links].find(value => value.record === record && value.clientId === binding.actorId && !value.closing);
    if (!binding || Number(binding.tabId) !== Number(this.tab.id) || binding.leaseId !== this.leaseId || binding.epoch !== this.epoch
      || typeof binding.rootTargetId !== 'string' || binding.rootTargetId !== root?.info.targetId || binding.rootTargetId !== this.targetInfo?.targetId
      || browser?.id !== this.browserId || entry?.gateway !== this || !link || !link.browser?.isConnected()
      || record?.page?.isClosed() !== false || typeof record?.cdp?.send !== 'function'
      || browser.owners?.get(record.id)?.sessionId !== record.sessionId
      || this.hub.list().find(value => value.id === this.browserId)?.epoch !== this.epoch) {
      throw new Error('Browser credential protection does not match the owned tab session.');
    }
    this.actor(binding.actorId);
    for (const current of entry.links) if (current.record) registerBrowserAuthDiagnosticsScope(current.record, this.#browserAuth.scope);
    return { root, record, link };
  }
  suppressBrowserAuthRawEvents(binding) {
    this.browserAuthBinding(binding);
    const transport = createBrowserTransportAuthProtection(this.endpoint, binding.rootTargetId, () => { this.browserAuthBinding(binding); return true; });
    const releaseTransport = transport.suppressRawNetworkEvents();
    const clear = suppressBrowserAuthDiagnostics(binding.record, this.#browserAuth.scope);
    this.#browserAuth.rawLeases++;
    let active = true;
    return () => { if (!active) return; active = false; clear(); releaseTransport(); this.#browserAuth.rawLeases--; };
  }
  protectBrowserAuthDiagnostics(binding) {
    this.browserAuthBinding(binding);
    createBrowserTransportAuthProtection(this.endpoint, binding.rootTargetId, () => { this.browserAuthBinding(binding); return true; }).protectBrowserAuthCredentialDiagnostics();
    protectBrowserAuthCredentialDiagnostics(binding.record, this.#browserAuth.scope);
    this.#browserAuth.diagnosticsProtected = true;
    return true;
  }
  async sendBrowserAuthCommand(binding, method, params = {}, options = {}) {
    this.browserAuthBinding(binding);
    const native = this.rawTarget(options.target);
    const client = this.actor(binding.actorId);
    const signal = AbortSignal.any([client.controller.signal, options.signal].filter(Boolean));
    signal.throwIfAborted();
    const remaining = options.deadlineMs === undefined ? options.timeoutMs ?? 30000 : Math.min(options.timeoutMs ?? 30000, options.deadlineMs - Date.now());
    if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('Browser authentication CDP command exceeded its deadline.');
    const result = await this.call('command', { tabId: Number(this.tab.id), leaseId: this.leaseId, actorId: binding.actorId,
      ...(native.id ? { sessionId: native.id } : {}), method, params },
    { signal, timeoutMs: remaining, [browserAuthCommandAuthority]: this.#browserAuth.authority });
    if (!native.id && ['Fetch.failRequest', 'Fetch.continueRequest', 'Fetch.continueResponse', 'Fetch.fulfillRequest'].includes(method)) this.#authPausedRequests.delete(params.requestId);
    signal.throwIfAborted(); this.browserAuthBinding(binding);
    return result;
  }
  acquireBrowserAuthCleanup(binding) {
    const { root } = this.browserAuthBinding(binding);
    const epoch = this.epoch, leaseId = this.leaseId, targetId = binding.rootTargetId, actorId = binding.actorId;
    for (const [owner, leases] of this.#authCleanupLeases) if (owner !== actorId && leases.size) throw new Error('The previous browser authentication actor still owns cleanup.');
    let released = false, closeHandler, resolveReleased;
    const drained = new Promise(resolve => { resolveReleased = resolve; });
    const verify = () => {
      if (released || this.epoch !== epoch || this.leaseId !== leaseId || this.native.get('') !== root || root.info.targetId !== targetId
        || this.hub.list().find(value => value.id === this.browserId)?.epoch !== epoch || this.loss || this.closed) throw new Error('The original browser authentication cleanup lease is unavailable.');
    };
    const release = () => {
      if (released) return; released = true;
      this.#authCleanupLeases.get(actorId)?.delete(lease); resolveReleased();
    };
    const lease = Object.freeze({
      requestIds: () => { verify(); return [...this.#authPausedRequests]; },
      onClose: handler => { if (released || typeof handler !== 'function' || closeHandler) throw new Error('Invalid browser authentication cleanup handler.'); closeHandler = handler; },
      call: async (method, params = {}) => {
        verify();
        const keys = Object.keys(params);
        const fail = method === 'Fetch.failRequest' && keys.length === 2 && params.errorReason === 'BlockedByClient' && this.#authPausedRequests.has(params.requestId);
        const disable = method === 'Fetch.disable' && keys.length === 0 && this.#authPausedRequests.size === 0;
        const restore = method === 'Fetch.enable' && keys.length === 1 && Array.isArray(params.patterns) && params.patterns.length === 1
          && Object.keys(params.patterns[0]).length === 2 && params.patterns[0].requestStage === 'Response' && params.patterns[0].resourceType === 'Document';
        const bypass = method === 'Network.setBypassServiceWorker' && keys.length === 1 && params.bypass === false && this.#browserAuth.workerCount === 0;
        if (!fail && !disable && !restore && !bypass) throw new Error('The browser authentication cleanup lease does not authorize this operation.');
        const result = await this.call('command', { tabId: Number(this.tab.id), leaseId, actorId, method, params },
          { timeoutMs: 5000, [browserAuthCommandAuthority]: this.#browserAuth.authority });
        verify(); if (fail) this.#authPausedRequests.delete(params.requestId);
        return result;
      },
      release,
      drain: async () => { if (closeHandler) await closeHandler(); await drained; },
    });
    const leases = this.#authCleanupLeases.get(actorId) ?? new Set(); leases.add(lease); this.#authCleanupLeases.set(actorId, leases);
    return lease;
  }
  async drainBrowserAuthCleanup(actorId) {
    const leases = [...(this.#authCleanupLeases.get(actorId) ?? [])];
    if (!leases.length) return;
    let timer;
    try {
      await Promise.race([Promise.all(leases.map(lease => lease.drain())), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Browser authentication cleanup was not acknowledged before actor release.')), 8000); })]);
    } finally { clearTimeout(timer); }
  }
  async protectBrowserAuthWorkerBypass(binding, { signal } = {}) {
    this.browserAuthBinding(binding);
    const state = this.#browserAuth;
    const transportWrite = createBrowserTransportAuthProtection(this.endpoint, binding.rootTargetId, () => { this.browserAuthBinding(binding); return true; }).acquireServiceWorkerWriteProtection();
    let cleanup;
    try { cleanup = this.acquireBrowserAuthCleanup(binding); }
    catch (error) { transportWrite.release(); throw error; }
    const update = () => {
      const pending = state.workerPending.catch(() => {}).then(async () => {
        const bypass = state.workerCount > 0;
        if (state.workerEnabled !== bypass || state.workerUncertain) {
          try {
            if (bypass) await this.sendBrowserAuthCommand(binding, 'Network.setBypassServiceWorker', { bypass }, { signal });
            else await cleanup.call('Network.setBypassServiceWorker', { bypass: false });
            state.workerEnabled = bypass; state.workerUncertain = false;
          } catch (error) { state.workerUncertain = true; state.workerLocked = true; throw error; }
        }
        state.workerLocked = state.workerCount > 0 || state.workerEnabled || state.workerUncertain;
      });
      state.workerPending = pending; return pending;
    };
    state.workerCount++; state.workerLocked = true;
    try { await update(); }
    catch (error) { state.workerCount--; try { await update(); transportWrite.release(); cleanup.release(); } catch {} throw error; }
    let active = true;
    return async () => { if (active) { active = false; state.workerCount--; } await update(); transportWrite.release(); cleanup.release(); };
  }
  subscribeBrowserAuthEvents(actorId, listener, onDetached) {
    this.actor(actorId);
    if (typeof listener !== 'function') throw new TypeError('A private browser authentication event listener is required.');
    const observer = { actorId, listener, onDetached };
    this.#browserAuth.observers.add(observer);
    return () => this.#browserAuth.observers.delete(observer);
  }
  actor(id){
    if(this.loss instanceof Error)throw this.loss;
    if(this.closed)throw new Error('The CDP connection has closed');
    const client=[...this.clients].find(value=>value.id===id&&!value.closed);
    if(!client)throw new Error('The CDP actor is no longer attached');
    return client;
  }
  rawTarget(target){
    if(target===undefined)return this.native.get('');
    if(!target||typeof target!=='object'||Array.isArray(target)||Object.keys(target).some(key=>!['sessionId','targetId'].includes(key)))throw new Error('Invalid attached CDP target selector');
    if((target.sessionId!==undefined)===(target.targetId!==undefined))throw new Error('CDP target must provide exactly one of sessionId or targetId');
    const key=target.sessionId??target.targetId;
    if(typeof key!=='string'||!key)throw new Error('CDP target identity must be a non-empty string');
    const native=target.sessionId!==undefined?this.native.get(key):[...this.native.values()].find(value=>value.info.targetId===key);
    if(!native||!native.id)throw new Error('The CDP child target is not attached to this tab lease');
    return native;
  }
  describeNative(native){return{...(this.extensionId?{extensionId:this.extensionId}:{}),tabId:Number(this.tab.id),...(native.id?{sessionId:native.id}:{}),targetId:native.info.targetId,url:native.info.url,type:native.info.type};}
  async enableNative(native,domain,send){
    if(native.enabled.has(domain)){await native.enabling.get(domain);return{};}
    native.enabled.add(domain);
    try{
      const pending=send();native.enabling.set(domain,pending);
      return await pending;
    }catch(error){native.enabled.delete(domain);throw error;}
    finally{native.enabling.delete(domain);}
  }
  createAdapter(actorId){
    this.actor(actorId);
    const domains=new Map();
    return{
      browserAuthDiagnosticsScope: this.#browserAuth.scope,
      resolveTarget:target=>{this.actor(actorId);return this.describeNative(this.rawTarget(target));},
      send:async(method,params={},options={})=>{
        const client=this.actor(actorId),native=this.rawTarget(options.target);
        const signal=AbortSignal.any([client.controller.signal,options.signal].filter(Boolean));
        signal.throwIfAborted();
        const dispatch=()=>this.call('command',{tabId:Number(this.tab.id),leaseId:this.leaseId,actorId,...(native.id?{sessionId:native.id}:{}),method,params},{signal,timeoutMs:options.timeoutMs??30000});
        const [domain,operation]=method.split('.');
        if(operation==='enable'||operation==='disable'){
          const state=domains.get(native.id)??new Map();domains.set(native.id,state);
          if(operation==='disable'){state.set(domain,false);return{};}
          const previous=state.get(domain),alreadyEnabled=native.enabled.has(domain);state.set(domain,true);
          try{
            const result=await this.enableNative(native,domain,dispatch);
            if(alreadyEnabled&&domain==='Runtime')for(const context of native.contexts.values())this.observeNativeEvent(native,'Runtime.executionContextCreated',context,actorId);
            return result;
          }catch(error){previous===undefined?state.delete(domain):state.set(domain,previous);throw error;}
        }
        return dispatch();
      },
      subscribeEvents:(listener,onDetached)=>{
        this.actor(actorId);
        if(typeof listener!=='function')throw new Error('CDP event listener must be a function');
        const observer={actorId,listener,onDetached,domains};this.rawObservers.add(observer);
        return()=>this.rawObservers.delete(observer);
      },
    };
  }
  observeNativeEvent(native,method,params,actorId){
    if(!this.rawObservers.size&&!this.#browserAuth.observers.size)return;
    const child=method==='Target.attachedToTarget'?params.targetInfo?.targetId:method==='Target.detachedFromTarget'?this.native.get(params.sessionId)?.info.targetId:method==='Target.targetDestroyed'?params.targetId:undefined;
    const {url:_url,type:_type,...source}=this.describeNative(native);
    const event={method,...(params===undefined?{}:{params}),source,...(child?{trackedTargetId:child}:{}),...(method==='Page.frameNavigated'&&!native.id&&!params?.frame?.parentId?{topLevel:true}:{})};
    const domain=method.split('.')[0];
    for (const observer of this.#browserAuth.observers) if (actorId === undefined || observer.actorId === actorId) try { observer.listener(structuredClone(event)); } catch {}
    if (this.#browserAuth.rawLeases || this.#browserAuth.diagnosticsProtected) return;
    for(const observer of this.rawObservers)if((actorId===undefined||observer.actorId===actorId)&&observer.domains.get(native.id)?.get(domain)!==false)try{observer.listener(structuredClone(event));}catch{}
  }
  detachObservers(actorId){
    for(const observer of [...this.rawObservers])if(actorId===undefined||observer.actorId===actorId){this.rawObservers.delete(observer);try{observer.onDetached?.();}catch{}}
    for (const observer of [...this.#browserAuth.observers]) if (actorId === undefined || observer.actorId === actorId) { this.#browserAuth.observers.delete(observer); try { observer.onDetached?.(); } catch {} }
  }
  endpointFor(id){return this.endpoint+'?client='+encodeURIComponent(id);}
  cursor(actorId, pointer) {
    if (this.closed) return Promise.resolve();
    return this.call('cursor', { tabId: Number(this.tab.id), leaseId: this.leaseId, actorId, pointer }, { timeoutMs: 2000 });
  }
  setSession(actorId, conversation) {
    return this.call('tabs.setSession', { tabId: Number(this.tab.id), leaseId: this.leaseId, actorId, conversation });
  }
  send(client,message){if(!client.closed&&client.ws.readyState===1)client.ws.send(JSON.stringify(message));}
  destroyedMessages(client,targetId){
    const messages=[];
    for(const session of client.sessions.values())if(session.browser&&session.discover)messages.push({sessionId:session.id,method:'Target.targetDestroyed',params:{targetId}});
    if(client.discover)messages.push({method:'Target.targetDestroyed',params:{targetId}});
    return messages;
  }
  targetDestroyed(targetId){
    if(this.destroyedTargets.has(targetId))return;
    this.destroyedTargets.add(targetId);
    for(const client of this.clients)for(const message of this.destroyedMessages(client,targetId))this.send(client,message);
  }
  wireClosedBounded(client,messages=[]){
    if(client.wireClosedBounded)return client.wireClosedBounded;
    const ws=client.ws;
    const pending=new Promise((resolve,reject)=>{
      let settled=false,flushed=messages.length===0,remaining=messages.length;
      const finish=error=>{
        if(settled)return;settled=true;clearTimeout(timer);ws.off('close',closed);ws.off('error',failed);
        if(error){ws.terminate();reject(error);}else resolve();
      };
      const closed=()=>finish(flushed?undefined:new Error('Target destruction notifications were not written before the CDP connection closed'));
      const failed=error=>finish(error);
      const timer=setTimeout(()=>finish(Object.assign(new Error('CDP connection close was not confirmed within its deadline'),{code:'CDP_WIRE_CLOSE_TIMEOUT',notificationsWritten:flushed})),WIRE_CLOSE_TIMEOUT_MS);
      ws.once('close',closed);ws.once('error',failed);
      const closeAfterFlush=()=>{
        flushed=true;
        if(ws.readyState===3){finish();return;}
        try{ws.close(1000,'Target closed');}catch(error){finish(error);}
      };
      if(ws.readyState!==1){
        if(messages.length){finish(new Error('The CDP connection closed before target destruction could be reported'));return;}
        closeAfterFlush();return;
      }
      if(!messages.length){closeAfterFlush();return;}
      // The write callbacks and close handshake precede any forced termination.
      for(const message of messages){
        if(settled)break;
        try{ws.send(JSON.stringify(message),error=>{if(error){finish(error);return;}if(!--remaining)closeAfterFlush();});}
        catch(error){finish(error);}
      }
    });
    client.wireClosedBounded=pending;void pending.catch(()=>{});return pending;
  }
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
    if(this.loss instanceof Error)throw this.loss;
    if(client.closed||this.closed)throw new Error('The CDP connection has closed');
    return this.call('command',{tabId:Number(this.tab.id),leaseId:this.leaseId,actorId:client.id,...(nativeId?{sessionId:nativeId}:{}),method,params},{signal:client.controller.signal,timeoutMs:30000});
  }
  async command(client,method,params,sessionId){
    if(this.loss instanceof Error)throw this.loss;
    if(client.closed||this.closed)throw new Error('The CDP connection has closed');
    if ((this.#browserAuth.rawLeases > 0 || this.#browserAuth.workerCount > 0)
      && ['Runtime.runIfWaitingForDebugger', 'Target.setAutoAttach'].includes(method)) throw new Error('Paused browser credential targets are owned by active browser credential protection.');
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
      this.tabClosing=(this.tabClosing??0)+1;
      try{
        const result=await this.call('close',{tabId:Number(this.tab.id),leaseId:this.leaseId},{signal:client.controller.signal});
        if(result?.tabClosed===true)this.lost(Object.assign(new Error('The browser tab closed'),{code:'CONTROL_STOPPED',tabClosed:true,released:this.loss?.released===true}));
        return result;
      }finally{this.tabClosing--;if(this.loss&&!this.loss.tabClosed&&!this.tabClosing)this.finishLoss();}
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
        session.enabled.add(domain);
        try{return await this.enableNative(native,domain,()=>this.forward(client,native.id,method,params));}catch(error){session.enabled.delete(domain);throw error;}
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
    if(event.browser!==this.browserId||event.epoch!==this.epoch)return;
    if(event.event==='tabs-invalidated'&&event.params?.reason==='removed'&&Number(event.params.tabId)===Number(this.tab.id)){
      this.lost(Object.assign(new Error('The browser tab closed'),{code:'CONTROL_STOPPED',tabClosed:true,released:this.loss?.released===true}));return;
    }
    if(event.params?.leaseId!==this.leaseId)return;
    if(event.event==='stopped'){
      const tabClosed=event.params.tabClosed===true||event.params.reason==='target_closed';
      const awaitProvider=this.desktopProvider&&event.params.reason==='provider-disposed'&&!tabClosed;
      this.lost(Object.assign(new Error(event.params.released?'Control ended in the browser extension':'Browser input release was not confirmed'),{code:event.params.released?'CONTROL_STOPPED':'INPUT_RELEASE_FAILED',released:event.params.released===true,tabClosed}),{awaitPhysical:!tabClosed&&(event.params.reason==='tab-closed'||this.desktopProvider&&event.params.released!==true)||awaitProvider,awaitProvider});return;
    }
    if(event.event==='cdp'&&event.params.method==='Target.targetDestroyed'){
      const params=event.params.params;
      if(params?.targetId===this.targetInfo?.targetId){this.lost(Object.assign(new Error('The browser target was destroyed'),{code:'CONTROL_STOPPED',tabClosed:true,released:this.loss?.released===true}));return;}
      if(this.knownTargets.has(params?.targetId)){
        const native=this.native.get(event.params.sessionId??'');if(native)this.observeNativeEvent(native,'Target.targetDestroyed',params);
        this.targetDestroyed(params.targetId);
        const destroyed=[...this.native.values()].find(value=>value.info.targetId===params.targetId);
        if(destroyed){
          for(const client of this.clients)for(const logical of [...client.sessions.values()])if(logical.nativeId===destroyed.id)this.detach(client,logical);
          this.dropNative(destroyed.id);
        }
      }
      return;
    }
    if(this.closed)return;
    if(event.event==='tab-updated'){
      const root=this.native.get('');if(root){root.info={...root.info,url:event.params.url,title:event.params.title};this.targetInfo=root.info;this.metadata(root.info);}return;
    }
    if(event.event!=='cdp')return;
    const {sessionId='',method,params}=event.params,native=this.native.get(sessionId);if(!native)return;
    if (!sessionId && method === 'Fetch.requestPaused' && typeof params?.requestId === 'string') this.#authPausedRequests.add(params.requestId);
    if(method==='Runtime.executionContextCreated')native.contexts.set(params.context.id,params);
    if(method==='Runtime.executionContextDestroyed')native.contexts.delete(params.executionContextId);
    if(method==='Runtime.executionContextsCleared')native.contexts.clear();
    if(method!=='Target.attachedToTarget')this.observeNativeEvent(native,method,params);
    if(method==='Target.attachedToTarget'){
      const child=this.nativeState(params.sessionId,params.targetInfo,sessionId,params.waitingForDebugger);this.native.set(child.id,child);
      this.knownTargets.add(child.info.targetId);
      this.observeNativeEvent(native,method,params);
      let listeners=0;
      for(const client of this.clients)for(const logical of [...client.sessions.values()])if(!logical.browser&&logical.nativeId===sessionId&&logical.autoAttach){this.attach(client,child.id,logical.id,true);listeners++;}
      if(!listeners&&child.waiting&&this.#browserAuth.workerCount===0&&this.#browserAuth.rawLeases===0)void this.call('command',{tabId:Number(this.tab.id),leaseId:this.leaseId,sessionId:child.id,method:'Runtime.runIfWaitingForDebugger'}).then(()=>{child.waiting=false;},()=>{});
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
  lost(error,{awaitPhysical=false,awaitProvider=false}={}){
    const next=error instanceof Error?error:Object.assign(new Error('Browser extension disconnected'),{code:'EXTENSION_DISCONNECTED'});
    if(awaitProvider&&this.desktopProvider&&!next.tabClosed)this.providerClosePending=true;
    if(this.loss){
      if(typeof next.released==='boolean'&&this.loss.providerClosed!==true)this.loss.released=next.released;
      if(next.providerClosed===true){this.loss.released=true;this.loss.providerClosed=true;this.loss.releaseProof=next.releaseProof;}
      if(next.tabClosed===true){
        this.loss.tabClosed=true;this.providerClosePending=false;this.providerCloseError=null;
        if(this.lossFinishing&&!this.destroyedTargets.has(this.targetInfo?.targetId)){
          this.latePhysicalProof??=Promise.resolve(this.lossFinishing).catch(()=>{}).then(()=>{
            if(this.destroyedTargets.has(this.targetInfo?.targetId))return;
            this.lossFinishing=null;return this.finishLoss();
          });
          this.lossDrain=this.latePhysicalProof;void this.latePhysicalProof.catch(()=>{});
        }else this.finishLoss();
      }
      return;
    }
    if(next.tabClosed===true)this.providerClosePending=false;
    this.loss=next;this.closed=true;
    this.lossDrain=new Promise(resolve=>{this.resolveLossDrain=resolve;});
    // A pre-remove stop acknowledgement is not proof that the tab vanished.
    if(awaitPhysical&&!this.loss.tabClosed){
      if(!this.tabClosing)this.physicalCloseTimer=setTimeout(()=>this.finishLoss(),WIRE_CLOSE_TIMEOUT_MS);
      return;
    }
    this.finishLoss();
  }
  finishLoss(){
    if(this.lossFinishing||!this.loss)return this.lossFinishing;
    this.lossFinishing=true;
    clearTimeout(this.physicalCloseTimer);
    const resolveLossDrain=this.resolveLossDrain;
    const pending=(async()=>{
      await Promise.resolve();
      if(this.desktopProvider&&this.loss.tabClosed&&this.loss.released!==true){
        try{
          const receipt=await this.call('detach',{tabId:Number(this.tab.id),leaseId:this.leaseId});
          if(receipt?.released===true)this.loss.released=true;
        }catch(error){this.loss.releaseError=error.message;}
      }
      if(this.providerClosePending&&!this.loss.tabClosed){
        this.providerCloseError=Object.assign(new Error('Desktop browser provider closure is not confirmed'),{code:'PROVIDER_CLOSE_UNCONFIRMED',epoch:this.epoch,providerClosed:false});
        this.emit('lost',this.loss);return;
      }
      const targetId=this.loss.tabClosed===true?this.targetInfo?.targetId:undefined;
      if(targetId&&!this.destroyedTargets.has(targetId)){
        this.destroyedTargets.add(targetId);
        const root=this.native.get('');if(root)this.observeNativeEvent(root,'Target.targetDestroyed',{targetId});
        const results=await Promise.allSettled([...this.clients].map(client=>this.wireClosedBounded(client,this.destroyedMessages(client,targetId))));
        const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);
        if(errors.length)this.wireLossError=new AggregateError(errors,'CDP target destruction delivery or connection close was not confirmed');
      }else for(const client of this.clients)client.ws.terminate();
      this.detachObservers();this.emit('lost',this.loss);
    })();
    this.lossFinishing=pending;
    void pending.finally(()=>resolveLossDrain?.()).catch(()=>{});
    return pending;
  }
  async closeClient(client,retry=false){
    if(client.cleanup&&(!retry||!client.cleanupFailed))return client.cleanup;
    if(client.cleanup)this.cleanups.delete(client.cleanup);
    client.closed=true;this.clients.delete(client);this.detachObservers(client.id);
    client.controller.abort(new Error('CDP client closed'));
    const pending=(async()=>{
      if(this.loss){if(this.loss.released!==true)throw this.loss;return;}
      await this.drainBrowserAuthCleanup(client.id);
      const result=await this.call('stop-actor',{tabId:Number(this.tab.id),leaseId:this.leaseId,actorId:client.id});
      if(result?.released!==true)throw Object.assign(new Error('Browser input release was not confirmed'),{code:'INPUT_RELEASE_FAILED'});
      // Empty utility-world scripts belong to this logical connection, too.
      for(const script of client.scripts)await this.call('command',{tabId:Number(this.tab.id),leaseId:this.leaseId,...(script.nativeId?{sessionId:script.nativeId}:{}),method:'Page.removeScriptToEvaluateOnNewDocument',params:{identifier:script.identifier}}).catch(()=>{});
    })();
    client.cleanup=pending;client.cleanupFailed=false;
    const record={pending,client};this.closedClients.set(client.id,record);this.cleanups.add(pending);
    void pending.then(()=>{this.cleanups.delete(pending);record.client=null;},()=>{client.cleanupFailed=true;});return pending;
  }
  async settle(){await Promise.all(this.cleanups);}
  async drainLoss({reportWireFailure=true}={}){
    for(;;){const pending=this.lossDrain;await pending;if(pending===this.lossDrain){if(reportWireFailure&&this.wireLossError)throw this.wireLossError;return;}}
  }
  async closeClientById(id){
    await this.drainLoss();
    if(this.providerClosePending&&!this.loss?.tabClosed)throw this.providerCloseError??Object.assign(new Error('Desktop browser provider closure is not confirmed'),{code:'PROVIDER_CLOSE_UNCONFIRMED',epoch:this.epoch,providerClosed:false});
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
      await this.drainLoss({reportWireFailure:false});
      if(this.providerClosePending&&!this.loss?.tabClosed)throw this.providerCloseError??Object.assign(new Error('Desktop browser provider closure is not confirmed'),{code:'PROVIDER_CLOSE_UNCONFIRMED',epoch:this.epoch,providerClosed:false});
      let detachError;
      // A failed actor release can still be recovered by a confirmed whole-tab
      // release. Retry that acknowledgement without opening a new CDP client.
      if(this.loss?.released!==true)try{
        if(this.hub.list().find(browser=>browser.id===this.browserId)?.epoch!==this.epoch)throw this.loss??new Error('Browser extension disconnected before release');
        const result=await this.call('detach',{tabId:Number(this.tab.id),leaseId:this.leaseId});
        if(result?.released!==true)throw new Error('Browser input release was not confirmed');
        if(this.loss)this.loss.released=true;else this.loss={released:true};
      }catch(error){detachError=error;}
      await this.drainLoss({reportWireFailure:false});
      if(detachError&&this.hasReleasedProvider())detachError=undefined;
      if(this.providerClosePending&&!this.loss?.tabClosed)throw this.providerCloseError??Object.assign(new Error('Desktop browser provider closure is not confirmed'),{code:'PROVIDER_CLOSE_UNCONFIRMED',epoch:this.epoch,providerClosed:false});
      if(detachError&&this.wireLossError)throw new AggregateError([detachError,this.wireLossError],'Browser release and CDP wire cleanup were not confirmed');
      if(detachError)throw detachError;
      if(this.wireLossError)throw this.wireLossError;
      // Keep discovery and the registered target alive when release is retryable.
      const closing=[...this.clients].map(client=>{client.ws.terminate();return this.closeClient(client);});
      await Promise.allSettled([...closing,...this.cleanups]);
      this.hub.off('event',this.onEvent);this.hub.off('disconnected',this.onDisconnect);
      if(this.wss){await new Promise(resolve=>this.wss.close(resolve));this.wss=null;}
      if(this.server){await new Promise(resolve=>this.server.close(resolve));this.server=null;}
      this.cleanups.clear();
    })();this.closing=pending;
    try{return await pending;}finally{if(this.closing===pending)this.closing=null;}
  }
}
