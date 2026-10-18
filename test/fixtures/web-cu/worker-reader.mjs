import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createHash } from 'node:crypto';

export function selectWorker(targets, extensionId) {
  const matches = targets.filter(target => target.type === 'service_worker' && target.url === `chrome-extension://${extensionId}/background.js`);
  assert.equal(matches.length, 1, 'Exactly the original extension worker is required'); return matches[0].targetId;
}
export function bridgeRoute(url,endpoint) {
  const base=new URL(endpoint),parsed=new URL(url);
  assert(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&Number(base.port)>=19390&&Number(base.port)<=19399&&base.pathname==='/opencu-extension/v1'&&!base.search&&!base.hash&&!base.username&&!base.password,'Exact original options endpoint required');
  return parsed.origin===base.origin&&!parsed.search&&!parsed.hash&&!parsed.username&&!parsed.password&&[base.pathname+'/poll',base.pathname+'/result'].includes(parsed.pathname)?parsed.pathname.split('/').at(-1):undefined;
}
export const bridgeMethods = Object.freeze(['listTargets', 'select', 'focus', 'verify', 'observe', 'preview', 'act', 'openSettings', 'newTab', 'release', 'disconnect']);
const hashSession=value=>createHash('sha256').update(value).digest('hex');
export function createBridgeLedger(expected) {
  let sequence=0,session;const commands=[],results=[],pending=new Map();
  const verify=input=>{
    assert.equal(typeof input.sessionId,'string');assert(input.sessionId);
    if(expected){assert.equal(input.instanceId,expected.instanceId,'Wrong bridge instance');assert.equal(input.epoch,expected.epoch,'Wrong bridge epoch');}
    const digest=hashSession(input.sessionId);if(session)assert.equal(digest,session,'Wrong extension session');else session=digest;return digest;
  };
  return {commands,results,verify,get sessionHash(){return session;},get pending(){return pending.size;},
    accept(route,input,output){
      const sessionHash=verify(input);
      if(route==='poll'){
        assert(Array.isArray(output.commands),'Original poll commands missing');
        for(const command of output.commands){
          if(expected)assert.equal(command.epoch,expected.epoch,'Wrong command epoch');
          assert(bridgeMethods.includes(command.method),'Unknown bridge command method');
          assert.equal(typeof command.id,'string');assert(!commands.some(row=>row.id===command.id),'Duplicate command');
          const identity=command.params?.identity;
          if(expected&&identity)for(const key of ['instanceId','browserInstanceId','epoch'])assert.equal(identity[key],expected[key],'Wrong command identity');
          const action=command.params?.action;
          const row={source:'original-extension-command',sequence:++sequence,id:command.id,sessionHash,scope:identity?'target':'session-all',method:command.method,identity,action:action?.type??action?.action,locatorMethod:action?.method,locatorText:action?.locator?.find(step=>step.kind==='text')?.value,key:action?.key};
          commands.push(row);pending.set(row.id,row);
        }
      }else{
        assert.equal(route,'result');const command=pending.get(input.id);assert(command,'Unknown bridge result command');
        assert.equal(output.accepted,true,'Original result acceptance missing');assert(!output.ignored&&command.sessionHash===sessionHash,'Unknown or stale bridge response');
        if(command.method==='release'){
          assert.equal(input.ok,true,'Release execution failed');assert.equal(input.result?.released,true,'Release not acknowledged');
          assert.deepEqual(input.result.failures??[],[],'Release failures');assert.deepEqual(input.result.errors??[],[],'Release errors');
        }
        pending.delete(input.id);results.push({source:'original-extension-result',sequence:++sequence,id:input.id,sessionHash,scope:command.scope,identity:command.identity,method:command.method,commandSequence:command.sequence,ok:input.ok===true,released:input.result?.released===true,value:input.result?.value,failures:input.result?.failures??[],errors:input.result?.errors??[]});
      }
      assert(commands.length+results.length<=2048,'Bounded passive bridge ledger exceeded');
    }};
}
export const storageExpression='chrome.storage.session.get(["attachedTabs","heldInputs"]).then(value=>({attachedTabsArray:Array.isArray(value.attachedTabs),heldInputsArray:Array.isArray(value.heldInputs),attachedTabsCount:Array.isArray(value.attachedTabs)?value.attachedTabs.length:null,heldInputsCount:Array.isArray(value.heldInputs)?value.heldInputs.length:null}))';
export function assertStorageEmpty(value){
  assert.equal(value?.attachedTabsArray,true,'attachedTabs missing or not array');assert.equal(value?.heldInputsArray,true,'heldInputs missing or not array');
  assert.equal(value.attachedTabsCount,0,'Original extension still has attached tabs');assert.equal(value.heldInputsCount,0,'Original extension still has held-input state');return [];
}
export function createTerminalPollGuard(ledger){
  let requestedAt,proven=false;const terminal=[];
  return {begin(at=Date.now()){assert(!requestedAt);assert.equal(ledger.pending,0);requestedAt=at;},
    failed(request,at=Date.now()){
      assert(requestedAt&&at>=requestedAt,'Bridge failed during active phase');assert.equal(request.route,'poll','Lost result evidence');
      assert(!request.accepted,'Lost poll response body');assert(Array.isArray(request.input.events)&&request.input.events.length===0,'Poll carries unacknowledged events');
      ledger.verify(request.input);assert.equal(ledger.pending,0,'Commands pending at bridge failure');
      // A later final Host proof must still confirm this provisional event.
      const last=ledger.commands.at(-1),ack=ledger.results.find(row=>row.id===last?.id);assert(last?.method==='release'&&ack?.ok&&ack.released,'No final release before idle disconnect');
      terminal.push({at,sessionHash:ledger.sessionHash,ackSequence:ack.sequence});proven=false;assert(terminal.length<=4,'Excess terminal polls');
    },
    confirm(host,timing){
      assert.equal(host.method,'original-app-exit');assert.equal(host.exitCode,0);assert.equal(host.signal,null);assert.equal(host.closeObserved,true);assert.equal(host.forced,false);assert.equal(host.processExitCalled,false);assert.equal(host.naturalBeforeExit,true);
      assert.equal(host.disposal?.source,'original-root-dispose-fulfilled');assert.equal(host.disposal?.appExitRequested,true);assert.equal(host.disposal?.leaseCountAfter,0);assert.equal(host.disposal?.signalCount,0);assert(host.disposal.leaseCountBefore>0);
      assert.equal(host.pendingTools,0);assert.equal(host.pendingCommands,0);assert.equal(host.ownedMembersRemaining,0);assert.equal(ledger.pending,0);
      assert(requestedAt<=timing.appExit&&timing.appExit<=timing.rootFulfilled&&timing.rootFulfilled<=timing.hostClose,'Original shutdown order missing');
      const last=ledger.commands.at(-1),ack=ledger.results.find(row=>row.id===last?.id);
      for(const row of terminal){assert(last?.method==='release'&&ack?.ok&&ack.released&&ack.sequence>last.sequence,'Final release ACK missing');assert.equal(ack.sessionHash,row.sessionHash);assert.equal(ack.sequence,row.ackSequence,'Late ACK cannot repair lost evidence');assert.deepEqual(ack.failures,[]);assert.deepEqual(ack.errors,[]);assert(row.at>=timing.appExit&&row.at<=timing.hostClose,'Poll failure outside original shutdown');}
      proven=true;return {terminalIdlePolls:terminal.length};
    },
    check(){assert(!terminal.length||proven,'Terminal idle poll lacks final Host proof');},get pending(){return terminal.length>0&&!proven;}};
}
export async function createWorkerProbe(endpoint, extensionId, { signal, deadline, bridgeEndpoint, connection }) {
  assert(/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[A-Za-z0-9-]+$/.test(endpoint));
  bridgeRoute(bridgeEndpoint+'/poll',bridgeEndpoint);
  signal.throwIfAborted(); const socket = new WebSocket(endpoint), pending = new Map(), network = new Map(), tasks = new Set(), ledger = createBridgeLedger(connection), terminal=createTerminalPollGuard(ledger);
  let sequence = 0, failure, workerSession, closing = false;
  const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
  const fail = error => { failure ??= error; for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); socket.close(); };
  const abort = () => fail(signal.reason); signal.addEventListener('abort', abort, { once: true });
  const opened = new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(Error('Worker CDP disconnected')), { once: true }); socket.addEventListener('close', () => reject(Error('Worker CDP closed before open')), { once: true }); });
  const openTimer = setTimeout(() => fail(Error('Worker connection deadline')), Math.max(1, Math.min(5000, deadline - Date.now())));
  const send = (method, params, sessionId = workerSession) => { signal.throwIfAborted(); if (failure) throw failure;
    return new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => fail(Error('Worker request deadline')), Math.max(1, Math.min(5000, deadline - Date.now())));
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    }); };
  async function networkEvent(value) {
    if(value.sessionId!==workerSession){if(value.method?.startsWith('Network.')&&(network.has(value.params?.requestId)||(value.params?.request?.url&&bridgeRoute(value.params.request.url,bridgeEndpoint))))throw Error('Wrong worker session for original bridge');return;}
    const params = value.params;
    if (value.method === 'Network.requestWillBeSent') {
      if(params.redirectResponse && network.has(params.requestId)) throw Error('Bridge redirect rejected');
      const route = bridgeRoute(params.request.url,bridgeEndpoint); if (!route) return;
      assert(!params.redirectResponse, 'Bridge redirect rejected');
      assert.equal(params.request.method, 'POST');
      const raw = params.request.postData ?? (await send('Network.getRequestPostData', { requestId: params.requestId })).postData;
      assert(Buffer.byteLength(raw) <= 16 * 1024 * 1024);
      const input=JSON.parse(raw);ledger.verify(input);network.set(params.requestId, { route, input });
    } else if(value.method==='Network.responseReceived' && network.has(params.requestId)) {
      assert.equal(params.response.status,200,'Original bridge response must succeed'); network.get(params.requestId).accepted=true;
    } else if (value.method === 'Network.loadingFinished' && network.has(params.requestId)) {
      const request = network.get(params.requestId); network.delete(params.requestId); assert(request.accepted,'Missing original bridge response status');
      const response = await send('Network.getResponseBody', { requestId: params.requestId });
      const raw = response.base64Encoded ? Buffer.from(response.body, 'base64').toString() : response.body;
      assert(Buffer.byteLength(raw) <= 1024 * 1024); ledger.accept(request.route, request.input, JSON.parse(raw));
    } else if (value.method === 'Network.loadingFailed' && network.has(params.requestId)) {const request=network.get(params.requestId);network.delete(params.requestId);terminal.failed(request);}
  }
  socket.addEventListener('close', () => { for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Worker CDP closed'));}pending.clear();if (!closing) fail(Error('Worker CDP disconnected')); });
  let eventTail=Promise.resolve();
  socket.addEventListener('message', event => {
    let value; try { value = JSON.parse(event.data); } catch { fail(Error('Malformed worker CDP frame')); return; }
    if (value.id) { const item = pending.get(value.id); if (!item) return; pending.delete(value.id); clearTimeout(item.timer); if (value.error) item.reject(Error('Worker CDP request rejected')); else item.resolve(value.result); return; }
    if(closing)return;
    const task = eventTail.then(()=>networkEvent(value)); eventTail=task.catch(()=>{}); tasks.add(task); task.then(() => tasks.delete(task), error => { tasks.delete(task); fail(error); });
  });
  try {
    await opened; clearTimeout(openTimer); const targets = await send('Target.getTargets', {}, undefined);
    const targetId = selectWorker(targets.targetInfos, extensionId);
    workerSession = (await send('Target.attachToTarget', { targetId, flatten: true }, undefined)).sessionId;
    await send('Network.enable', {});
    let closeWork;
    return {ledger,beginHostShutdown(){if(failure)throw failure;terminal.begin();},
      async confirmHostShutdown(host,timing){await eventTail;if(failure)throw failure;assert.equal(tasks.size,0);for(const request of network.values()){assert.equal(request.route,'poll','Unfinished result evidence');assert(!request.accepted,'Unfinished poll body');assert(Array.isArray(request.input.events)&&request.input.events.length===0);ledger.verify(request.input);}return terminal.confirm(host,timing);},
      check(){signal.throwIfAborted();if(failure)throw failure;},
      async heldInputs(){const result=await send('Runtime.evaluate',{expression:storageExpression,awaitPromise:true,returnByValue:true,allowUnsafeEvalBlockedByCSP:false});assert(!result.exceptionDetails);return assertStorageEmpty(result.result.value);},
      get settled(){return socket.readyState===WebSocket.CLOSED&&tasks.size===0&&pending.size===0;},
      close({deadline:cleanupDeadline=Date.now()+3000}={}){
        return closeWork??=(async()=>{
          closing=true;
          // Bounded detach may fail; transport termination remains in finally.
          let cleanupError;const timer=setTimeout(()=>socket.terminate(),Math.max(1,Math.min(1000,cleanupDeadline-Date.now())));
          try{if(!failure&&!signal.aborted)await send('Target.detachFromTarget',{sessionId:workerSession},null);}catch(error){cleanupError=error;}
          finally{socket.close();await closed;clearTimeout(timer);const settled=await Promise.allSettled(tasks);const rejected=settled.filter(row=>row.status==='rejected').map(row=>row.reason);if(rejected.length)cleanupError=cleanupError?new AggregateError([cleanupError,...rejected],'Worker cleanup failures'):new AggregateError(rejected,'Worker drain failed');signal.removeEventListener('abort',abort);}
          if(failure)throw failure;if(cleanupError)throw cleanupError;terminal.check();
        })();
      }};
  } catch (error) { closing = true; socket.close(); const timer=setTimeout(()=>socket.terminate(),1000);await closed;clearTimeout(timer);clearTimeout(openTimer); signal.removeEventListener('abort', abort); throw error; }
}
