import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,get} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {mountComputerUseHttp} from '../src/computer-use/http.mjs';

test('live HTTP stream sends the latest frame after a real slow reader drains', {timeout:15000},async t=>{
  let handler,emit,response,closed=false,aborted=false;
  const hub={config:()=>({}),computerUse:{watchNative:async(session,target,send,signal)=>{
    assert.equal(session,'fixture');assert.equal(target,'window');emit=send;signal.addEventListener('abort',()=>{aborted=true;});return async()=>{closed=true;};
  }}};
  mountComputerUseHttp({inject:(_,fn)=>fn({effect:fn=>fn(),webServer:{register:route=>{handler=route.handler;}},connection:{requestRejection:req=>req.headers['x-cu-test']==='fixture'?undefined:401}})},hub);
  const server=createServer((req,res)=>{response=res;void handler(req,res);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let request,reader;const received=[],until=async fn=>{const end=Date.now()+5000;while(Date.now()<end){if(fn())return;await delay(10);}throw Error('Stream state did not arrive');};
  t.after(async()=>{reader?.destroy();request?.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  reader=await new Promise((resolve,reject)=>{request=get(`http://127.0.0.1:${server.address().port}/trisoul-x/computer-use/stream?session=fixture&app=window`,{headers:{'x-cu-test':'fixture'}},resolve);request.on('error',reject);});
  assert.equal(reader.statusCode,200);reader.pause();await until(()=>emit);
  const data='x'.repeat(600000);
  for(let i=0;i<30;i++)emit('frame',{sequence:i,data});
  assert.ok(response.writableLength>524288,'the real socket has backpressure');
  emit('frame',{sequence:999,data:'latest-frame'});
  let buffer='';reader.setEncoding('utf8');reader.on('data',chunk=>{buffer+=chunk;let at;while((at=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,at);buffer=buffer.slice(at+2);if(event.startsWith('event: frame\n'))received.push(JSON.parse(event.slice('event: frame\ndata: '.length)));}});reader.resume();
  // No subsequent frame is emitted. The pending latest frame must arrive on drain.
  await until(()=>received.some(frame=>frame.sequence===999));assert.equal(received.at(-1).data,'latest-frame');assert.ok(received.length<10,'old queued frames are coalesced');
  reader.destroy();await until(()=>closed&&aborted);
});
