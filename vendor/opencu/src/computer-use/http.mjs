import { computerVision } from './model-vision.mjs';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
const send = (res,status,value) => { if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value)); };
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>65536)throw new Error('Request is too large');}return text?JSON.parse(text):{};}

export function mountComputerUseHttp(ctx,hub){
  ctx.inject(['webServer','connection'],web=>{
    web.effect(()=>web.webServer.register({kind:'prefix',path:'/trisoul-x/computer-use',async handler(req,res){
      const rejected=web.connection.requestRejection(req);
      if(rejected!==undefined){res.writeHead(rejected);res.end();return;}
      try{
        const url=new URL(req.url,'http://localhost'),op=url.pathname.slice('/trisoul-x/computer-use/'.length),id=url.searchParams.get('session');
        // A composer may have a draft identity before its first model turn.
        // Discovery and an idle control panel must work before that turn.
        if(!id||id.length>200||/[\x00-\x1f\/\\]/.test(id)){send(res,400,{error:'请选择有效会话'});return;}
        const manager=hub.computerUse;
        if(req.method==='GET'&&op==='setup'){send(res,200,await manager.setupStatus());return;}
        if(req.method==='GET'&&op==='state'){const state=manager.status(id);const session=ctx.agents?.get(id)?.session??ctx.sessions?.get(id);const vision=await computerVision(ctx,session);send(res,200,{...state,vision,enabled:state.enabled&&hub.config().computerUseEnabled!==false});return;}
        if(req.method==='GET'&&op==='tabs'){send(res,200,{tabs:await manager.listUserTabs(id)});return;}
        if(req.method==='GET'&&op==='browser-history'){
          if(hub.config().computerUseEnabled===false||!manager.enabled){send(res,409,{error:'Computer Use 已关闭'});return;}
          send(res,200,manager.browsingHistory.list(id));return;
        }
        if(req.method==='GET'&&['downloads','download-file'].includes(op)){
          if(hub.config().computerUseEnabled===false){send(res,409,{error:'Computer Use 已关闭'});return;}
          if(op==='downloads'){send(res,200,{downloads:manager.listDownloads(id)});return;}
          const file=manager.downloadFile(id,url.searchParams.get('id')),info=await stat(file.path);
          if(!info.isFile())throw new Error('下载文件已不可用');
          const filename=encodeURIComponent(file.filename.replace(/[\x00-\x1f\x7f]/g,'_')).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
          res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':info.size,'Content-Disposition':"attachment; filename*=UTF-8''"+filename,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
          try{await pipeline(createReadStream(file.path),res);}catch(error){if(!res.destroyed)res.destroy(error);}return;
        }
        if(req.method==='GET'&&op==='preview'){
          const image=manager.preview.get(id);if(!image){res.writeHead(404);res.end();return;}
          res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});res.end(Buffer.from(image.data,'base64'));return;
        }
        if(req.method==='GET'&&op==='stream'){
          if(url.searchParams.has('app')&&hub.config().computerUseEnabled===false){send(res,409,{error:'Computer Use 已关闭'});return;}
          const controller=new AbortController();let unsubscribe,timer,pendingFrame;
          const close=()=>{controller.abort();clearInterval(timer);void unsubscribe?.().catch(()=>{});};
          res.once('close',close);req.once('aborted',close);
          const emit=(event,value)=>{
            if(res.destroyed||res.writableEnded)return;
            if(event==='frame'&&res.writableLength>524288){pendingFrame=value;return;}
            if(event==='frame'||event==='closed'||event==='failure'||event==='capture'&&value.status!=='live')pendingFrame=null;
            res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
            if(event==='closed')res.end();
          };
          res.on('drain',()=>{if(pendingFrame)emit('frame',pendingFrame);});
          res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
          timer=setInterval(()=>{if(!res.destroyed)res.write(': keepalive\n\n');},15000);timer.unref();
          try{unsubscribe=url.searchParams.has('app')?await manager.watchNative(id,url.searchParams.get('app'),emit,controller.signal,url.searchParams.get('stack')==='1'):await manager.watchBrowser(id,url.searchParams.get('tab'),emit,controller.signal,url.searchParams.get('stack')==='1',url.searchParams.get('view')==='1');if(controller.signal.aborted)await unsubscribe();}
          catch(error){emit('failure',{message:error.message});res.end();close();}
          return;
        }
        if(req.method!=='POST'){send(res,405,{error:'Method not allowed'});return;}
        if(op==='setup'){
          const request=await body(req);
          if(request.action==='install-native')await manager.installNative();
          else if(request.action==='remove-native')await manager.removeNative();
          else if(request.action==='install-extension')await manager.installExtension();
          else if(request.action==='remove-extension')await manager.removeExtension();
          else if(request.action==='permissions')await manager.native.showSetup();
          else {send(res,400,{error:'未知的设置操作'});return;}
          send(res,200,await manager.setupStatus());return;
        }
        if(op==='stop'){await manager.stop(id);send(res,200,manager.status(id));return;}
        if(op==='input'){
          const input=await body(req);
          if(hub.config().computerUseEnabled===false&&!['dialog','release','pointerup','keyup'].includes(input.type)){send(res,409,{error:'Computer Use 已关闭'});return;}
          send(res,200,await manager.manualInput(id,input));return;
        }
        if(hub.config().computerUseEnabled===false){send(res,409,{error:'Computer Use 已关闭'});return;}
        if(op==='browser-history-clear'){send(res,200,manager.browsingHistory.clear(id));return;}
        if(op==='downloads-clear'){send(res,200,manager.clearDownloads(id));return;}
        if(['annotation','annotation-style','view-screenshot','view-viewport','view-layout','view-find'].includes(op)){
          const task=op==='view-screenshot'?'截图':['view-viewport','view-layout'].includes(op)?'视口调整':op==='view-find'?'页面查找':'页面批注';
          const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(new Error(task+'超时')),15000);
          const closed=()=>{if(!res.writableEnded)controller.abort(new Error(task+'已取消'));};res.once('close',closed);req.once('aborted',closed);
          try{const input=await body(req),method={'annotation':'annotationSnapshot','annotation-style':'annotationStylePreview','view-screenshot':'viewScreenshot','view-viewport':'resizeViewedTab','view-layout':'layoutViewedTab','view-find':'findViewedText'}[op],result=await manager[method](id,input,controller.signal);controller.signal.throwIfAborted();send(res,200,result);}
          finally{clearTimeout(timeout);res.off('close',closed);req.off('aborted',closed);}
          return;
        }
        if(op==='share-windows'||op==='share-window'){
          const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(new Error('窗口分享超时')),15000);
          const closed=()=>{if(!res.writableEnded)controller.abort(new Error('窗口分享已取消'));};res.once('close',closed);req.once('aborted',closed);
          try { const value=op==='share-windows'?{windows:await manager.readWindowShare(null,controller.signal)}:await manager.readWindowShare(await body(req),controller.signal);controller.signal.throwIfAborted();send(res,200,value); }
          finally { clearTimeout(timeout);res.off('close',closed);req.off('aborted',closed); }
          return;
        }
        if(op==='reveal-preview'){send(res,200,await manager.revealPreview(id,await body(req)));return;}
        if(op==='resume'){await manager.resume(id);send(res,200,manager.status(id));return;}
        if(op==='reset'){await manager.reset(id);send(res,200,manager.status(id));return;}
        if(op==='inventory'){send(res,200,await manager.dispatch('ui-inventory','getState'));return;}
        if(op==='tabs'){await manager.changeUserTab(id,await body(req));send(res,200,manager.status(id));return;}
        if(op==='view-tab'){send(res,200,await manager.viewTab(id,await body(req)));return;}
        if(op==='open-external'){
          const controller=new AbortController();const closed=()=>{if(!res.writableEnded)controller.abort(new Error('打开外部浏览器已取消'));};res.once('close',closed);req.once('aborted',closed);
          try{send(res,200,await manager.openViewedExternally(id,await body(req),controller.signal));}finally{res.off('close',closed);req.off('aborted',closed);}return;
        }
        if(op==='snapshot'){
          const target=manager.status(id).target;if(!target){send(res,409,{error:'尚未选择应用或标签页'});return;}
          await manager.dispatch(id,'target',[target,'getScreenshot',[{emit:false}]],AbortSignal.timeout(10000));send(res,200,manager.status(id));return;
        }
        if(op==='navigate'){
          await manager.navigate(id,await body(req));
          send(res,200,manager.status(id));return;
        }
        send(res,404,{error:'Unknown route'});
      }catch(error){send(res,400,{error:error.message,code:error.code});}
    }}));
  });
}
