import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {installFileUploadCompatibility} from '../src/file-upload-compat.mjs';
import {nativeFileUploadResolver} from './fixtures/native-file-upload-resolver.mjs';
const require=createRequire(import.meta.url),sdk=createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
const {Context,symbols}=sdk('@deepseek-ai/cordis');
const {FileUploads}=await import(pathToFileURL(sdk.resolve('@deepseek-ai/dsh-client-file-upload')));
const makeResolver=id=>nativeFileUploadResolver({agents:{resolveAgent:async()=>({agent:{id}})}});

test('actual native SDK: an inactive prior controller cannot block re-enable resolver binding and cleanup',{timeout:5000},async t=>{
  const root=new Context();let release,disposal;
  const barrier=new Promise(resolve=>{release=resolve;});
  t.after(async()=>{release();await disposal;await root.fiber.dispose();});
  root.provide('commands',{registerFileReceiptResolver:()=>()=>{}});
  root.provide('connection',{fetch:{register:()=>()=>{}}});
  const service=new FileUploads(root),uploads=service[symbols.original]??service;
  const prior=makeResolver('prior-controller');
  assert.deepEqual(await prior('test-session'),{id:'prior-controller'},'the extracted official callback executes against its actual owner contract');
  const controller=await root.plugin({name:'prior-session-controller',inject:['fileUploads'],apply(local){
    local.effect(()=>local.fileUploads.registerAgentResolver(prior),'native resolver');
    local.effect(()=>()=>barrier,'in-flight native teardown');
  }});
  assert.equal(uploads.agentResolver,prior);
  disposal=controller.dispose();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(controller.state,5,'the old loader generation is already unloading');
  assert.equal(uploads.agentResolver,prior,'the in-flight prior generation still owns its callback');
  root.provide('loader',{*entries(){yield{options:{name:'@deepseek-ai/dsh-api-session-controller'},fiber:controller};}});
  const inject=root.inject.bind(root),injections=[];
  Object.defineProperty(root,'inject',{configurable:true,value:(services,callback)=>{const fiber=inject(services,callback);injections.push(fiber);return fiber;}});
  installFileUploadCompatibility(root);
  assert.equal(injections.length,1);
  await new Promise(resolve=>setImmediate(resolve));release();
  await injections[0];
  const next=async()=>({id:'new-controller'}),dispose=root.fileUploads.registerAgentResolver(next);
  assert.equal(uploads.agentResolver,next);
  dispose();assert.equal(uploads.agentResolver,undefined,'the next native registration releases through its raw receiver');
});

test('actual native SDK: a fully disposed prior controller leaves no stale resolver on re-enable',{timeout:5000},async t=>{
  const root=new Context();t.after(()=>root.fiber.dispose());
  root.provide('commands',{registerFileReceiptResolver:()=>()=>{}});root.provide('connection',{fetch:{register:()=>()=>{}}});
  const service=new FileUploads(root),uploads=service[symbols.original]??service,prior=makeResolver('disposed-controller');
  const controller=await root.plugin({name:'disposed-session-controller',inject:['fileUploads'],apply(local){local.effect(()=>local.fileUploads.registerAgentResolver(prior));}});
  await controller.dispose();assert.equal(controller.state,4);assert.equal(uploads.agentResolver,prior);
  root.provide('loader',{*entries(){yield{options:{name:'@deepseek-ai/dsh-api-session-controller'},fiber:controller};}});
  const inject=root.inject.bind(root),injections=[];Object.defineProperty(root,'inject',{configurable:true,value:(deps,callback)=>{const fiber=inject(deps,callback);injections.push(fiber);return fiber;}});
  installFileUploadCompatibility(root);await injections[0];
  const next=async()=>({id:'replacement-controller'}),dispose=root.fileUploads.registerAgentResolver(next);assert.equal(uploads.agentResolver,next);dispose();assert.equal(uploads.agentResolver,undefined);
});

test('actual native SDK: a duplicate registration already unloading is recovered after its teardown settles',{timeout:5000},async t=>{
  const root=new Context();let release,restarting,attempts=0;const barrier=new Promise(resolve=>{release=resolve;});
  t.after(async()=>{release();await restarting;await root.fiber.dispose();});
  root.provide('commands',{registerFileReceiptResolver:()=>()=>{}});root.provide('connection',{fetch:{register:()=>()=>{}}});
  const service=new FileUploads(root),uploads=service[symbols.original]??service,callbacks=[null,makeResolver('initial'),makeResolver('failed'),makeResolver('recovered')];
  const controller=await root.plugin({name:'failing-controller-generation',inject:['fileUploads'],apply(local){
    attempts++;if(attempts===2)local.effect(()=>()=>barrier,'failed constructor teardown');
    local.effect(()=>local.fileUploads.registerAgentResolver(callbacks[attempts]),'ordinary native resolver');
  }});
  restarting=controller.restart().then(()=>({ok:true}),error=>({ok:false,error}));
  for(let count=0;(controller.state!==5||attempts!==2)&&count<100;count++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(controller.state,5);assert.equal(attempts,2);assert.equal(uploads.agentResolver,callbacks[1]);
  root.provide('loader',{*entries(){yield{options:{name:'@deepseek-ai/dsh-api-session-controller'},fiber:controller};}});
  const inject=root.inject.bind(root),injections=[];Object.defineProperty(root,'inject',{configurable:true,value:(deps,callback)=>{const fiber=inject(deps,callback);injections.push(fiber);return fiber;}});
  installFileUploadCompatibility(root);await new Promise(resolve=>setImmediate(resolve));release();await injections[0];
  assert.equal(attempts,3,'the known failure must get exactly one replacement generation');assert.equal(controller.state,2);assert.equal(uploads.agentResolver,callbacks[3]);
  await controller.dispose();assert.equal(uploads.agentResolver,undefined,'the recovered native callback is released normally');
});

for(const oldState of [4,5])for(const currentState of [1,2]){
  test(`actual native SDK: old state ${oldState} before current state ${currentState} never clears the current resolver`,{timeout:5000},async t=>{
    const root=new Context(),releases=[],disposals=[];t.after(async()=>{for(const release of releases)release();await Promise.allSettled(disposals);await root.fiber.dispose();});
    root.provide('commands',{registerFileReceiptResolver:()=>()=>{}});root.provide('connection',{fetch:{register:()=>()=>{}}});
    const service=new FileUploads(root),uploads=service[symbols.original]??service;
    let releaseOld;const oldBarrier=new Promise(resolve=>{releaseOld=resolve;});releases.push(releaseOld);
    const old=await root.plugin({name:'old-controller-generation',apply(local){if(oldState===5)local.effect(()=>()=>oldBarrier);}});
    const oldDisposal=old.dispose();disposals.push(oldDisposal);if(oldState===4)await oldDisposal;else await new Promise(resolve=>setImmediate(resolve));assert.equal(old.state,oldState);
    let releaseCurrent;const currentBarrier=new Promise(resolve=>{releaseCurrent=resolve;});releases.push(releaseCurrent);
    const resolver=makeResolver('current-controller'),current=root.plugin({name:'current-controller-generation',inject:['fileUploads'],async apply(local){local.effect(()=>local.fileUploads.registerAgentResolver(resolver));if(currentState===1)await currentBarrier;}});
    if(currentState===2)await current;else{for(let count=0;uploads.agentResolver!==resolver&&count<50;count++)await new Promise(resolve=>setImmediate(resolve));}
    assert.equal(current.state,currentState);assert.equal(uploads.agentResolver,resolver);
    root.provide('loader',{*entries(){for(const fiber of [old,current])yield{options:{name:'@deepseek-ai/dsh-api-session-controller'},fiber};}});
    const inject=root.inject.bind(root),injections=[];Object.defineProperty(root,'inject',{configurable:true,value:(deps,callback)=>{const fiber=inject(deps,callback);injections.push(fiber);return fiber;}});
    installFileUploadCompatibility(root);await injections[0];assert.equal(uploads.agentResolver,resolver,'the actual current callback identity is retained');
    releaseOld();await oldDisposal;assert.equal(uploads.agentResolver,resolver,'old teardown cannot clear the current callback');
    releaseCurrent();await current;await current.dispose();assert.equal(uploads.agentResolver,undefined,'current owner teardown releases its own callback');
  });
}

test('actual native SDK: a different resolver provider without a native controller is preserved',{timeout:5000},async t=>{
  const root=new Context();t.after(()=>root.fiber.dispose());root.provide('commands',{registerFileReceiptResolver:()=>()=>{}});root.provide('connection',{fetch:{register:()=>()=>{}}});
  const service=new FileUploads(root),uploads=service[symbols.original]??service,resolver=async()=>({id:'another-provider'});
  const provider=await root.plugin({name:'another-upload-resolver-provider',apply(local){local.effect(()=>uploads.registerAgentResolver(resolver));}});
  root.provide('loader',{*entries(){yield{options:{name:'another-upload-resolver-provider'},fiber:provider};}});
  const inject=root.inject.bind(root),injections=[];Object.defineProperty(root,'inject',{configurable:true,value:(deps,callback)=>{const fiber=inject(deps,callback);injections.push(fiber);return fiber;}});
  installFileUploadCompatibility(root);await injections[0];assert.equal(uploads.agentResolver,resolver);await provider.dispose();assert.equal(uploads.agentResolver,undefined);
});

for(const inactiveState of [4,5]){
  test(`actual native SDK: inactive native state ${inactiveState} cannot clear another active provider's resolver`,{timeout:5000},async t=>{
    const root=new Context();let release,disposal;const barrier=new Promise(resolve=>{release=resolve;});
    t.after(async()=>{release();await disposal;await root.fiber.dispose();});
    root.provide('commands',{registerFileReceiptResolver:()=>()=>{}});root.provide('connection',{fetch:{register:()=>()=>{}}});
    const service=new FileUploads(root),uploads=service[symbols.original]??service;
    const native=await root.plugin({name:'inactive-native-controller',apply(local){if(inactiveState===5)local.effect(()=>()=>barrier);}});
    disposal=native.dispose();if(inactiveState===4)await disposal;else await new Promise(resolve=>setImmediate(resolve));assert.equal(native.state,inactiveState);
    const resolver=async sessionId=>({id:'third-party-provider',sessionId});
    const provider=await root.plugin({name:'active-third-party-resolver',apply(local){local.effect(()=>uploads.registerAgentResolver(resolver));}});assert.equal(provider.state,2);
    root.provide('loader',{*entries(){yield{options:{name:'@deepseek-ai/dsh-api-session-controller'},fiber:native};yield{options:{name:'active-third-party-resolver'},fiber:provider};}});
    const inject=root.inject.bind(root),injections=[];Object.defineProperty(root,'inject',{configurable:true,value:(deps,callback)=>{const fiber=inject(deps,callback);injections.push(fiber);return fiber;}});
    installFileUploadCompatibility(root);await new Promise(resolve=>setImmediate(resolve));assert.equal(uploads.agentResolver,resolver,'a native controller entry cannot establish ownership of an unknown callback');
    assert.equal(Object.hasOwn(uploads,'registerAgentResolver'),true,'raw binding remains available for later registrations');
    release();await disposal;await injections[0];assert.equal(uploads.agentResolver,resolver,'inactive native teardown must leave the other active provider usable');
    await provider.dispose();assert.equal(uploads.agentResolver,undefined);
    const next=async()=>({id:'new-provider'}),dispose=root.fileUploads.registerAgentResolver(next);assert.equal(uploads.agentResolver,next);dispose();assert.equal(uploads.agentResolver,undefined);
  });
}

test('actual native SDK: disposing compatibility during failed teardown never constructs a replacement generation',{timeout:5000},async t=>{
  const root=new Context();let release,restarting,disposing,attempts=0;const barrier=new Promise(resolve=>{release=resolve;});
  t.after(async()=>{release();await Promise.allSettled([restarting,disposing]);await root.fiber.dispose();});
  root.provide('commands',{registerFileReceiptResolver:()=>()=>{}});root.provide('connection',{fetch:{register:()=>()=>{}}});
  const service=new FileUploads(root),uploads=service[symbols.original]??service,callbacks=[null,makeResolver('initial'),makeResolver('failed'),makeResolver('must-not-construct')];
  const controller=await root.plugin({name:'failed-native-controller',inject:['fileUploads'],apply(local){
    attempts++;if(attempts===2)local.effect(()=>()=>barrier,'pending failed teardown');
    local.effect(()=>local.fileUploads.registerAgentResolver(callbacks[attempts]));
  }});
  restarting=controller.restart().then(()=>({ok:true}),error=>({ok:false,error}));
  for(let count=0;(controller.state!==5||attempts!==2)&&count<100;count++)await new Promise(resolve=>setImmediate(resolve));assert.equal(controller.state,5);assert.equal(attempts,2);
  root.provide('loader',{*entries(){yield{options:{name:'@deepseek-ai/dsh-api-session-controller'},fiber:controller};}});
  const inject=root.inject.bind(root),injections=[];Object.defineProperty(root,'inject',{configurable:true,value:(deps,callback)=>{const fiber=inject(deps,callback);injections.push(fiber);return fiber;}});
  installFileUploadCompatibility(root);await new Promise(resolve=>setImmediate(resolve));const compatibility=injections[0];assert.equal(compatibility.state,1);
  const bound=uploads.registerAgentResolver;disposing=compatibility.dispose();await new Promise(resolve=>setImmediate(resolve));assert.equal(compatibility.uid,null);
  assert.equal(uploads.registerAgentResolver,bound,'its asynchronous setup still delays restoring the bound method');
  release();await disposing;await restarting;
  assert.equal(attempts,2,'a disposed compatibility scope must not construct the third generation');assert.equal(controller.state,3);
  assert.equal(uploads.agentResolver,undefined);assert.equal(Object.hasOwn(uploads,'registerAgentResolver'),false,'scope teardown restores the native method');
});
