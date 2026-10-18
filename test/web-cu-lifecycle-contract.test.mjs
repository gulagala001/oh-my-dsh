import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { once } from 'node:events';
import { validateOwnedGroup, processState, browserStopped, failureOnlyStop, operationScope, singleFlight, registerAttachment, naturalCloseEvidence, retainOwner, settleOperations, ownedBrowser } from './fixtures/web-cu/owned-browser.mjs';
import { selectWorker, bridgeRoute, createBridgeLedger, createWorkerProbe, assertStorageEmpty, storageExpression, createTerminalPollGuard } from './fixtures/web-cu/worker-reader.mjs';
import { safeFailure,publicFailure } from './fixtures/web-cu/failure.mjs';
import { assertConnectionIdentity,assertConnectionView,readConnectionView } from './fixtures/web-cu/connection.mjs';
import { parseDocument } from 'htmlparser2';
import { afterFixturePreflight, retainFirstFailure } from './fixtures/web-cu/harness.mjs';

const bridgeEndpoint='http://127.0.0.1:19390/opencu-extension/v1';
const probeOptions=()=>({signal:new AbortController().signal,deadline:Date.now()+1000,bridgeEndpoint});
const executable='/private/owned/Chrome.app/Contents/MacOS/Chrome', profile='/private/owned/profile-a';
const owner=()=>({pid:100,pgid:100,start:'one',members:new Map()});
const rows=()=>[{pid:1,ppid:0,pgid:1,uid:501,start:'parent',command:'parent'}, {pid:100,ppid:1,pgid:100,uid:501,start:'one',executable,command:executable+' --user-data-dir='+profile+' --headless=new'}];
test('wrong PID/start/UID/profile/group refuses ownership before any signal; A/B scopes do not overlap',()=>{
  assert.equal(validateOwnedGroup(owner(),rows(),executable,profile,501,1).length,1);
  for(const change of [r=>r[1].start='other',r=>r[1].uid=502,r=>r[1].pgid=1,r=>r[1].command=r[1].command.replace(profile,'/other/profile')]){
    const r=rows();change(r);assert.throws(()=>validateOwnedGroup(owner(),r,executable,profile,501,1));
  }
  assert.throws(()=>validateOwnedGroup(owner(),rows(),executable,'/private/owned/profile-b',501,1));
});
test('PW transport disconnect is not raw process closure and forced cleanup is irrevocably failed',async()=>{
  const state={child:{exitCode:null,signalCode:null},spawned:true,closeObserved:false,exitObserved:false,stderr:Buffer.alloc(0)};
  assert.equal(processState(state).natural,false);assert.equal(browserStopped(state,true),false);
  let forced=false,signalled=false;
  await failureOnlyStop({naturalClose:async()=>{throw Error('natural close failed');},settled:async()=>signalled,verify:async()=>[{pid:100}],signal:async()=>{signalled=true;},forced:()=>{forced=true;},failed:()=>forced,waitStopped:async()=>true});
  assert(forced); assert.throws(()=>assert.equal(forced,false));
});
test('unknown group prevents failure-only signals and cleanup never masks the first failure',async()=>{
  let signals=0;
  await assert.rejects(failureOnlyStop({naturalClose:async()=>{throw Error('closed');},settled:async()=>false,verify:async()=>{throw Error('unowned member');},signal:()=>signals++,forced:()=>{},failed:()=>true,waitStopped:async()=>false}),/unowned member/);
  assert.equal(signals,0);
  const first=Error('first'),cleanup=Error('cleanup'),combined=retainFirstFailure(first,cleanup);
  assert.deepEqual(combined.errors,[first,cleanup]);
});
test('fixture failure prevents real Host/runtime startup',async()=>{
  let starts=0;
  await assert.rejects(afterFixturePreflight(async()=>{throw Error('fixture failed');},()=>starts++),/fixture failed/);
  assert.equal(starts,0);
});
test('worker selection rejects page/foreign/ambiguous targets and strict bridge origins/redirect URLs',()=>{
  const id='a'.repeat(32),worker={type:'service_worker',url:`chrome-extension://${id}/background.js`,targetId:'worker'};
  assert.equal(selectWorker([worker],id),'worker');
  for(const list of [[{...worker,type:'page'}],[{...worker,url:'chrome-extension://'+'b'.repeat(32)+'/background.js'}],[worker,worker]])assert.throws(()=>selectWorker(list,id));
  assert.equal(bridgeRoute('http://127.0.0.1:19390/opencu-extension/v1/poll',bridgeEndpoint),'poll');
  for(const url of ['http://example.test:19390/opencu-extension/v1/poll','http://127.0.0.1:19389/opencu-extension/v1/poll','http://127.0.0.1:19390/opencu-extension/v1/poll?token=secret'])assert.equal(bridgeRoute(url,bridgeEndpoint),undefined);
});
test('passive bridge command/result ledger pairs id/extension-session/epoch without persisting tokens',()=>{
  const ledger=createBridgeLedger(),identity={epoch:'epoch',tabId:1},input={sessionId:'opaque-extension-session',token:'must-not-log'};
  ledger.accept('poll',input,{commands:[{id:'one',method:'act',params:{identity,action:{type:'locator',method:'waitFor',locator:[{kind:'text',value:'NEVER_VISIBLE_nonce'}]}}}]});
  ledger.accept('result',{...input,id:'one',ok:true,result:{value:false}},{accepted:true});assert.equal(ledger.results[0].value,false);assert.equal(ledger.pending,0);
  assert(!JSON.stringify(ledger).includes('must-not-log'));assert(!JSON.stringify(ledger).includes('opaque-extension-session'));
  ledger.accept('poll',input,{commands:[{id:'release',method:'release',params:{identity}}]});
  assert.throws(()=>ledger.accept('result',{sessionId:'wrong',id:'release',ok:true,result:{released:true}},{accepted:true}),/session/);
});
test('all original discovery and observation commands settle without altering input/release classification',()=>{
  const ledger=createBridgeLedger(),input={sessionId:'owned'},identity={tabId:7};
  const methods=['listTargets','select','focus','verify','observe','preview','openSettings','newTab','disconnect'];
  ledger.accept('poll',input,{commands:methods.map((method,index)=>({id:'command-'+index,method,params:{identity}}))});
  assert.equal(ledger.pending,methods.length);
  for(let index=0;index<methods.length;index++)ledger.accept('result',{...input,id:'command-'+index,ok:true,result:{value:index}},{accepted:true});
  assert.equal(ledger.pending,0);assert.deepEqual(ledger.commands.map(row=>row.method),methods);
  assert.equal(ledger.commands.filter(row=>['act','release'].includes(row.method)).length,0);
  assert.equal(ledger.results.length,methods.length);
  assert.throws(()=>ledger.accept('result',{...input,id:'unknown-result',ok:true},{accepted:true}),/Unknown bridge result command/);
  assert.throws(()=>ledger.accept('result',{...input,id:'command-0',ok:true},{accepted:true}),/Unknown bridge result command/);
  assert.throws(()=>ledger.accept('poll',input,{commands:[{id:'unknown-method',method:'notProduction'}]}),/Unknown bridge command method/);
  assert.equal(ledger.pending,0);assert.equal(ledger.results.length,methods.length);
});
async function cdpFixture(t,{wrongWorker=false,hang=false,bodyError=false}={}){
  const server=new WebSocketServer({port:0,host:'127.0.0.1'});await once(server,'listening');
  const methods=[],id='a'.repeat(32);let socket;
  server.on('connection',ws=>{socket=ws;ws.on('message',bytes=>{
    const q=JSON.parse(bytes);methods.push(q);
    if(hang)return;
    let result={};
    if(q.method==='Target.getTargets')result={targetInfos:[{type:wrongWorker?'page':'service_worker',url:`chrome-extension://${id}/background.js`,targetId:'original-worker'}]};
    if(q.method==='Target.attachToTarget')result={sessionId:'worker-session'};
    if(q.method==='Runtime.evaluate')result={result:{value:{attachedTabsArray:true,heldInputsArray:true,attachedTabsCount:0,heldInputsCount:0}}};
    if(q.method==='Network.getResponseBody'){
      if(bodyError){ws.send(JSON.stringify({id:q.id,error:{message:'body unavailable'}}));return;}
      result={body:JSON.stringify({commands:[]}),base64Encoded:false};
    }
    ws.send(JSON.stringify({id:q.id,result}));
  });});
  t.after(async()=>{for(const client of server.clients)client.terminate();await new Promise(resolve=>server.close(resolve));});
  const endpoint=`ws://127.0.0.1:${server.address().port}/devtools/browser/owned`;
  return {endpoint,id,methods,get socket(){return socket;}};
}
test('narrow worker CDP attaches only original worker, keeps CSP and reads only empty/count state',async t=>{
  const f=await cdpFixture(t),aborter=new AbortController();
  const probe=await createWorkerProbe(f.endpoint,f.id,{...probeOptions(),signal:aborter.signal});
  assert.deepEqual(await probe.heldInputs(),[]);await probe.close();
  assert.equal(f.methods.find(q=>q.method==='Target.attachToTarget').params.targetId,'original-worker');
  const evaluate=f.methods.find(q=>q.method==='Runtime.evaluate');assert.equal(evaluate.params.allowUnsafeEvalBlockedByCSP,false);
  assert(!evaluate.params.expression.includes('authorization'));assert(!f.methods.some(q=>q.method==='Target.setAutoAttach'));
});
test('wrong worker, disconnect and deadline fail closed and settle their own transport',async t=>{
  const wrong=await cdpFixture(t,{wrongWorker:true});
  await assert.rejects(createWorkerProbe(wrong.endpoint,wrong.id,probeOptions()),/original extension worker/);
  assert(!wrong.methods.some(q=>q.method==='Runtime.evaluate'));
  const hanging=await cdpFixture(t,{hang:true});
  await assert.rejects(createWorkerProbe(hanging.endpoint,hanging.id,{...probeOptions(),deadline:Date.now()+30}),/deadline/);
  const live=await cdpFixture(t),probe=await createWorkerProbe(live.endpoint,live.id,probeOptions());
  live.socket.terminate();await new Promise(resolve=>setTimeout(resolve,10));assert.throws(()=>probe.check(),/disconnected/);await assert.rejects(probe.close(),/disconnected/);
});
test('original bridge body observation errors cannot be converted to release evidence',async t=>{
  const f=await cdpFixture(t,{bodyError:true}),probe=await createWorkerProbe(f.endpoint,f.id,probeOptions());
  f.socket.send(JSON.stringify({sessionId:'worker-session',method:'Network.requestWillBeSent',params:{requestId:'request',request:{url:'http://127.0.0.1:19390/opencu-extension/v1/poll',method:'POST',postData:'{"sessionId":"ephemeral","token":"must-not-log"}'}}}));
  f.socket.send(JSON.stringify({sessionId:'worker-session',method:'Network.responseReceived',params:{requestId:'request',response:{status:200}}}));
  f.socket.send(JSON.stringify({sessionId:'worker-session',method:'Network.loadingFinished',params:{requestId:'request'}}));
  await new Promise(resolve=>setTimeout(resolve,20));assert.throws(()=>probe.check(),/rejected/);assert.equal(probe.ledger.results.length,0);await assert.rejects(probe.close());
});

const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
test('result HTTP accepted is distinct from command execution; stale/ignored/missing/failed release fail closed',()=>{
  const input={sessionId:'original'},identity={epoch:'one'};
  const make=()=>{const ledger=createBridgeLedger();ledger.accept('poll',input,{commands:[{id:'release',method:'release',params:{identity}}]});return ledger;};
  const good={...input,id:'release',ok:true,result:{released:true,failures:[],errors:[]}};
  const ledger=make();ledger.accept('result',good,{accepted:true});assert.equal(ledger.results[0].ok,true);
  for(const [request,response] of [[good,{ignored:true}],[good,{}],[good,{ok:true}],[{...good,sessionId:'other'},{accepted:true}],[{...good,ok:false},{accepted:true}],[{...good,result:{released:false}},{accepted:true}],[{...good,result:{released:true,failures:['failure']}},{accepted:true}],[{...good,result:{released:true,errors:['error']}},{accepted:true}]]){
    const bad=make();assert.throws(()=>bad.accept('result',request,response));assert.equal(bad.results.length,0);assert.equal(bad.pending,1);
  }
  const act=createBridgeLedger();act.accept('poll',input,{commands:[{id:'act',method:'act'}]});act.accept('result',{...input,id:'act',ok:false},{accepted:true});assert.equal(act.results[0].ok,false);
});
test('exact options endpoint excludes other live Hosts, alternate paths and credentials',()=>{
  assert.equal(bridgeRoute(bridgeEndpoint+'/result',bridgeEndpoint),'result');
  for(const url of [bridgeEndpoint.replace('19390','19391')+'/poll',bridgeEndpoint+'/poll?token=private',bridgeEndpoint+'/poll#fragment',bridgeEndpoint+'/other',bridgeEndpoint.replace('/v1','/v2')+'/poll'])assert.equal(bridgeRoute(url,bridgeEndpoint),undefined);
  assert.throws(()=>bridgeRoute(bridgeEndpoint+'/poll',bridgeEndpoint+'/'),/endpoint/);
});
test('storage projection requires BOTH explicit array fields and BOTH empty counts',async()=>{
  const execute=value=>Function('chrome','return '+storageExpression)({storage:{session:{get:async()=>value}}});
  assert.deepEqual(assertStorageEmpty(await execute({attachedTabs:[],heldInputs:[]})),[]);
  for(const value of [{},{attachedTabs:[]},{heldInputs:[]},{attachedTabs:null,heldInputs:[]},{attachedTabs:[],heldInputs:{}},{attachedTabs:[1],heldInputs:[]},{attachedTabs:[],heldInputs:[1]}])assert.throws(()=>assertStorageEmpty(value));
  for(const value of [{},{attachedTabs:[]},{heldInputs:[]},{attachedTabs:null,heldInputs:[]},{attachedTabs:[],heldInputs:{}},{attachedTabs:[1],heldInputs:[]},{attachedTabs:[],heldInputs:[1]}])await assert.rejects(async()=>assertStorageEmpty(await execute(value)));
});
function terminalFixture(){
  const ledger=createBridgeLedger(),input={sessionId:'session',events:[]};
  ledger.accept('poll',input,{commands:[{id:'final-release',method:'release'}]});ledger.accept('result',{...input,id:'final-release',ok:true,result:{released:true}},{accepted:true});
  const guard=createTerminalPollGuard(ledger),host={method:'original-app-exit',exitCode:0,signal:null,forced:false,closeObserved:true,ownedMembersRemaining:0,pendingTools:0,pendingCommands:0,processExitCalled:false,naturalBeforeExit:true,disposal:{source:'original-root-dispose-fulfilled',appExitRequested:true,leaseCountBefore:1,leaseCountAfter:0,signalCount:0}};
  return {ledger,input,guard,host,timing:{appExit:110,rootFulfilled:130,hostClose:150}};
}
test('terminal idle poll stays provisional until final release ACK and original Host order are proved',()=>{
  const {guard,input,host,timing}=terminalFixture();guard.begin(100);guard.failed({route:'poll',input},120);assert.throws(()=>guard.check(),/proof/);
  assert.deepEqual(guard.confirm(host,timing),{terminalIdlePolls:1});guard.check();
});
test('active disconnect, result/body loss, wrong session, pending commands and bad final Host proof fail',()=>{
  let f=terminalFixture();assert.throws(()=>f.guard.failed({route:'poll',input:f.input},90),/active/);
  for(const change of [r=>r.route='result',r=>r.accepted=true,r=>r.input={...r.input,sessionId:'wrong'},r=>r.input={...r.input,events:[{}]}]){
    f=terminalFixture();f.guard.begin(100);const request={route:'poll',input:f.input};change(request);assert.throws(()=>f.guard.failed(request,120));
  }
  f=terminalFixture();f.guard.begin(100);f.ledger.accept('poll',f.input,{commands:[{id:'pending',method:'act'}]});assert.throws(()=>f.guard.failed({route:'poll',input:f.input},120),/pending/);
  for(const change of [f=>f.host.processExitCalled=true,f=>f.host.closeObserved=false,f=>f.host.disposal.leaseCountAfter=1,f=>f.timing.rootFulfilled=160,f=>f.ledger.results.length=0]){
    f=terminalFixture();f.guard.begin(100);f.guard.failed({route:'poll',input:f.input},120);change(f);assert.throws(()=>f.guard.confirm(f.host,f.timing));assert.throws(()=>f.guard.check());
  }
});
test('startup failure plus failed inner cleanup still leaves owner registered for outer cleanup/profile retention',async()=>{
  const registry=new Set();let outer;
  await assert.rejects(ownedBrowser({root:'/unused',profile:'/unused/b',home:'/unused/home',executable:'/unused/executable',signal:new AbortController().signal,register:handle=>{retainOwner(registry,handle);outer=handle;handle.failureClose=async()=>{throw Error('synthetic cleanup failure');};}}),error=>error instanceof AggregateError&&error.errors.length===2);
  assert.equal(registry.size,1);assert.equal([...registry][0],outer);await assert.rejects(outer.failureClose());
  // The outer cleanup error blocks removal even if no child was created.
});
test('late underlying attach registers the driver before immediate disconnect and remains pending until settled',async()=>{
  const controller=new AbortController(),scope=operationScope(controller),owner={drivers:new Set()},attached=defer(),disconnected=defer();let closes=0;
  const driver={};const work=scope.run('attach',()=>registerAttachment(owner,()=>attached.promise,scope,false,async value=>{assert.equal(value,driver);closes++;await disconnected.promise;}),{timeout:1000});
  await Promise.resolve();controller.abort();await assert.rejects(work);assert(scope.pending()>0);
  attached.resolve(driver);await new Promise(resolve=>setTimeout(resolve,5));assert(owner.drivers.has(driver));assert.equal(closes,1);assert.equal(await scope.drain(5),false);
  disconnected.resolve();assert.equal(await scope.drain(100),true);
});
test('single-flight close shares natural/failure callers; normal Browser.close disconnect still awaits raw exit AND close',async()=>{
  const raw=defer();let closes=0,disconnects=0;const state={natural:false};
  const close=singleFlight(()=>naturalCloseEvidence({sendClose:async()=>{closes++;throw Error('socket closed');},disconnect:async()=>{disconnects++;},waitClosed:()=>raw.promise,inspect:()=>state,inventory:async()=>[]}));
  const first=close(),second=close();assert.equal(first,second);await Promise.resolve();await Promise.resolve();assert.equal(closes,1);
  state.natural=true;raw.resolve();assert.deepEqual(await first,{sendDisconnected:true});assert.equal(disconnects,1);
});
test('nonnatural exit, retained group and rejected transport close cannot become natural-close proof',async()=>{
  for(const variant of ['exit','group','transport'])await assert.rejects(naturalCloseEvidence({sendClose:async()=>{throw Error('socket closed');},disconnect:async()=>{if(variant==='transport')throw Error('private close rejection');},waitClosed:async()=>{},inspect:()=>({natural:variant!=='exit'}),inventory:async()=>variant==='group'?[{}]:[]}));
});
test('cleanup deadline cannot label hung close settled; late completion stays owned and concurrent close is single-flight',async()=>{
  const scope=operationScope(),hung=defer();let calls=0;
  const close=singleFlight(async()=>{calls++;await hung.promise;});
  await assert.rejects(settleOperations(scope,[['natural',close],['failure',close]],Date.now()+20),error=>error instanceof AggregateError);
  assert.equal(calls,1);assert(scope.pending()>0);hung.resolve();assert.equal(await scope.drain(100),true);
});
test('cleanup rejection propagates alongside original failure, including abortAndSettle rejection',async()=>{
  const first=Error('original'),cleanup=Error('private cleanup');let combined;
  try{await settleOperations(operationScope(),[['close',async()=>{throw cleanup;}]],Date.now()+100);}catch(error){combined=retainFirstFailure(first,error);}
  assert.equal(combined.errors[0],first);assert.equal(combined.errors[1].errors[0],cleanup);
  const {withJourneyControl}=await import('./fixtures/web-cu/control.mjs');const controller=new AbortController();
  await assert.rejects(withJourneyControl({signal:controller.signal,deadline:Date.now()+100,abortAndSettle:async()=>{throw cleanup;}},async control=>{controller.abort(first);control.check();}),error=>error.errors[0]===first&&error.errors[1]===cleanup);
});
test('safe failure preserves first/cleanup categories but never emits raw messages, stacks, causes or private identities',()=>{
  const first=Object.assign(Error('token=secret /private/browser-cache cookie=secret'),{code:'ENOENT'}),second=Object.assign(Error('Bearer secret /profile/b raw-body'),{code:'ECONNRESET'});
  const diagnostic=safeFailure(new AggregateError([first,second]),'cleanup');assert.equal(diagnostic.first.code,'ENOENT');assert.equal(diagnostic.failures[1].code,'ECONNRESET');assert.deepEqual(diagnostic.categories,['external-operation']);
  const emitted=JSON.stringify(diagnostic)+publicFailure(new AggregateError([first,second]),'entry').stack;
  for(const sensitive of ['secret','/private','/profile','Bearer','raw-body','cookie='])assert(!emitted.includes(sensitive));
});
// DOM-shaped contract copied from the fixed bundled SettingsRow/ConnectionStatus
// tags. This adapter exercises the actual reader without launching a browser.
function structurePage(html){
  const document=parseDocument(html),text=node=>node.type==='text'?node.data:(node.children??[]).map(text).join('');
  const descendants=node=>(node.children??[]).flatMap(child=>[child,...descendants(child)]);
  class Locator{
    constructor(nodes){this.nodes=nodes;}
    async count(){return this.nodes.length;}
    nth(index){return new Locator([this.nodes[index]]);}
    async innerText(){assert.equal(this.nodes.length,1);return text(this.nodes[0]);}
    getByText(value,{exact}={}){return new Locator(this.nodes.flatMap(descendants).filter(node=>node.type==='tag'&&(value instanceof RegExp?value.test(text(node)):exact?text(node)===value:text(node).includes(value))&&!node.children?.some(child=>child.type==='tag'&&(value instanceof RegExp?value.test(text(child)):text(child)===value))));}
    getByRole(role,{name}){return new Locator(this.nodes.flatMap(descendants).filter(node=>node.name===role&&(name instanceof RegExp?name.test(text(node)):text(node)===name)));}
    filter({has,hasText}){return new Locator(this.nodes.filter(node=>has?has.nodes.some(candidate=>descendants(node).includes(candidate)):hasText.test(text(node))));}
    locator(selector){const matches=selector==='[class~="@container/settings-row"]'?node=>(node.attribs?.class??'').split(' ').includes('@container/settings-row'):node=>node.name==='span'&&['min-w-0','truncate'].every(word=>(node.attribs?.class??'').split(' ').includes(word));return new Locator(this.nodes.flatMap(descendants).filter(matches));}
  }
  return new Locator([document]);
}
test('stable original connection row survives refresh without pairing role=status; same profile/API/count required',async()=>{
  const id='a'.repeat(32),connection={instanceId:'profile-owned',browserInstanceId:'browser-owned',epoch:'epoch-owned',extensionId:id,label:'Google Chrome'},status={...connection,connected:true,paired:true};
  const state={ok:true,connections:[connection],pairings:[{instanceId:connection.instanceId,extensionId:id,label:connection.label}]};
  assert.equal(assertConnectionIdentity(state,status,id),connection);
  const markup='<main><span class="min-w-0 truncate">已连接 1 个浏览器</span><div class="@container/settings-row gap-3"><div><div>Google Chrome</div><div>可以使用了。回到对话，让 AI 操作这个浏览器中的网页。</div></div><div><button>连接设置</button><button>断开连接</button><button>撤销配对</button></div></div></main>';
  assert(!markup.includes('role="status"'));const view=await readConnectionView(structurePage(markup),'Google Chrome');assertConnectionView(view,'Google Chrome');
  for(const change of [s=>s.connections[0].epoch='other',s=>s.pairings[0].instanceId='other',s=>s.connections.push({...connection}),s=>s.pairings[0].extensionId='b'.repeat(32)]){const changed=structuredClone(state);change(changed);assert.throws(()=>assertConnectionIdentity(changed,status,id));}
  for(const bad of [markup.replace('可以使用了。回到对话，让 AI 操作这个浏览器中的网页。','offline'),markup.replace('已连接 1 个浏览器','已连接 2 个浏览器'),markup.replace('<button>撤销配对</button>',''),markup.replace('Google Chrome','Other Chrome')])await assert.rejects(async()=>assertConnectionView(await readConnectionView(structurePage(bad),'Google Chrome'),'Google Chrome'));
});
test('worker Network ignores other endpoints but rejects active failure, redirect and wrong worker session',async t=>{
  for(const variant of ['foreign','active','redirect','wrong-worker']){
    const f=await cdpFixture(t),probe=await createWorkerProbe(f.endpoint,f.id,probeOptions());
    const request={requestId:'owned-request',request:{url:(variant==='foreign'?bridgeEndpoint.replace('19390','19391'):bridgeEndpoint)+'/poll',method:'POST',postData:JSON.stringify({sessionId:'original',events:[]})}};
    f.socket.send(JSON.stringify({sessionId:variant==='wrong-worker'?'foreign-worker':'worker-session',method:'Network.requestWillBeSent',params:request}));
    if(variant==='redirect')f.socket.send(JSON.stringify({sessionId:'worker-session',method:'Network.requestWillBeSent',params:{...request,redirectResponse:{status:302}}}));
    else if(variant!=='wrong-worker')f.socket.send(JSON.stringify({sessionId:'worker-session',method:'Network.loadingFailed',params:{requestId:'owned-request'}}));
    await new Promise(resolve=>setTimeout(resolve,15));
    if(variant==='foreign'){probe.check();await probe.close();assert.equal(probe.ledger.commands.length,0);}
    else{assert.throws(()=>probe.check());await assert.rejects(probe.close());}
  }
});
test('terminal poll before actual appExit or without prior final ACK cannot be excused',()=>{
  let f=terminalFixture();f.guard.begin(100);f.guard.failed({route:'poll',input:f.input},105);assert.throws(()=>f.guard.confirm(f.host,f.timing),/outside/);
  f=terminalFixture();f.ledger.commands.length=0;f.guard.begin(100);assert.throws(()=>f.guard.failed({route:'poll',input:f.input},120),/final release/);
});
test('cleanup attach that succeeds after its own budget also registers and disconnects immediately',async()=>{
  const scope=operationScope(),owner={drivers:new Set()},late=defer();let closes=0;
  const work=scope.run('cleanup-attach',operationSignal=>registerAttachment(owner,()=>late.promise,scope,true,async()=>{closes++;},operationSignal),{cleanup:true,timeout:10});
  await assert.rejects(work);assert(scope.pending()>0);const driver={};late.resolve(driver);assert.equal(await scope.drain(100),true);assert(owner.drivers.has(driver));assert.equal(closes,1);
});
test('underlying cleanup rejection after deadline remains available to the next owner drain',async()=>{
  const scope=operationScope(),late=defer(),failure=Object.assign(Error('private late transport failure'),{code:'ECONNRESET'});
  await assert.rejects(settleOperations(scope,[['close',()=>late.promise]],Date.now()+10));assert(scope.pending()>0);
  late.reject(failure);assert.equal(await scope.drain(100),true);
  await assert.rejects(settleOperations(scope,[],Date.now()+100),error=>error.errors.includes(failure));assert.equal(safeFailure(scope.lateFailures()[0],'cleanup').first.code,'ECONNRESET');
});
