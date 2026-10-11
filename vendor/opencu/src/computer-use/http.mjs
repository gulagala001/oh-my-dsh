import { computerVision } from './model-vision.mjs';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import { readJsonBody, sendJson as send } from '../http.mjs';
import { readComputerPresentation } from './presentation.mjs';
const body = async req => {
  const value = await readJsonBody(req, { maxBytes: 65536 });
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('请求正文必须是 JSON 对象'), { statusCode: 400 });
  }
  return value;
};
const errorDetails = error => ({
  message: typeof error?.message === 'string' ? error.message : String(error ?? 'Computer Use 请求失败'),
  ...(typeof error?.code === 'string' || typeof error?.code === 'number' ? { code: error.code } : {}),
});
const passwordFileImportActions = new Set(['profilePasswordFileImportSignals', 'profilePasswordFileImportChooseSource',
  'profilePasswordFileImport', 'profilePasswordFileImportCancel']);
const passwordFileImportTerminalActions = new Set(['profilePasswordFileImport', 'profilePasswordFileImportCancel']);

async function requestOperation(req, res, task, run, timeoutMs = 15000, preserveTerminal = false) {
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(new Error(task + '超时')), timeoutMs) : undefined;
  const closed = () => { if (!res.writableEnded) controller.abort(new Error(task + '已取消')); };
  res.once('close', closed); req.once('aborted', closed);
  try {
    const result = await run(controller.signal);
    if (!preserveTerminal) controller.signal.throwIfAborted();
    return result;
  } finally {
    clearTimeout(timer); res.off('close', closed); req.off('aborted', closed);
  }
}

export function mountComputerUseHttp(ctx,hub){
  ctx.inject(['webServer','connection'],web=>{
    web.effect(()=>web.webServer.register({kind:'prefix',path:'/trisoul-x/computer-use',async handler(req,res){
      const rejected=web.connection.requestRejection(req);
      if(rejected!==undefined){res.writeHead(rejected);res.end();return;}
      try{
        const url=new URL(req.url,'http://localhost'),op=url.pathname.slice('/trisoul-x/computer-use/'.length),id=url.searchParams.get('session');
        const manager=hub.computerUse;
        if(op==='setup'){
          if(req.method==='GET'){send(res,200,await manager.setupStatus());return;}
          if(req.method!=='POST'){send(res,405,{error:'Method not allowed'});return;}
          const request=await body(req);
          if(request.action==='install-browser')await manager.installBrowser();
          else if(request.action==='install-native')await manager.installNative();
          else if(request.action==='remove-native')await manager.removeNative();
          else if(request.action==='install-extension')await manager.installExtension();
          else if(request.action==='remove-extension')await manager.removeExtension();
          else if(request.action==='permissions')await manager.native.showSetup();
          else if(request.action==='install-screen-lock')await manager.configureScreenLock('install');
          else if(request.action==='remove-screen-lock')await manager.configureScreenLock('uninstall');
          else if(request.action==='recover-screen-lock')await manager.configureScreenLock('recover');
          else {send(res,400,{error:'未知的设置操作'});return;}
          send(res,200,await manager.setupStatus());return;
        }
        // A composer may have a draft identity before its first model turn.
        // Discovery and an idle control panel must work before that turn.
        if(!id||id.length>200||/[\x00-\x1f\/\\]/.test(id)){send(res,400,{error:'请选择有效会话'});return;}
        if(req.method==='GET'&&op==='presentation'){
          const meta=await requestOperation(req,res,'文件交付记录',signal=>readComputerPresentation(ctx.get('sessionQuery'),hub.computerPresentation,id,url.searchParams.get('call'),signal));
          send(res,200,{meta});return;
        }
        if(req.method==='GET'&&op==='state'){const state=manager.status(id);const session=ctx.agents?.get(id)?.session??ctx.sessions?.get(id);const vision=await computerVision(ctx,session);send(res,200,{...state,vision,enabled:state.enabled&&hub.config().computerUseEnabled!==false});return;}
        if(req.method==='GET'&&op==='tabs'){send(res,200,await manager.userTabInventory(id));return;}
        if(req.method==='GET'&&op==='browser-native'){
          if(hub.config().computerUseEnabled===false){send(res,409,{error:'Computer Use 已关闭'});return;}
          send(res,200,await requestOperation(req,res,'原生浏览器能力',signal=>manager.nativeBrowserAction(id,{action:'capabilities'},signal)));return;
        }
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
          const data=Buffer.from(image.data,'base64'),mediaType=['image/png','image/jpeg','image/webp'].includes(image.mediaType)?image.mediaType:'image/png';
          res.writeHead(200,{'Content-Type':mediaType,'Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);return;
        }
        if(req.method==='GET'&&(op==='stream'||op==='native-video')){
          if((op==='native-video'||url.searchParams.has('app'))&&hub.config().computerUseEnabled===false){send(res,409,{error:'Computer Use 已关闭'});return;}
          const controller=new AbortController();let unsubscribe,timer,pendingFrame,closed=false;
          const release=()=>{
            const dispose=unsubscribe;unsubscribe=undefined;
            if(dispose)void Promise.resolve().then(dispose).catch(()=>{});
          };
          const close=()=>{
            if(closed)return;closed=true;
            clearInterval(timer);pendingFrame=null;
            res.off('drain',drain);req.off('aborted',close);
            controller.abort();release();
          };
          const fail=()=>{close();if(!res.destroyed)res.destroy();};
          const writable=()=>{
            if(closed)return false;
            if(res.destroyed||res.writableEnded){close();return false;}
            return true;
          };
          const write=chunk=>{
            if(!writable())return false;
            try{res.write(chunk);return true;}catch{fail();return false;}
          };
          const end=()=>{
            // end() may precede finish/close while output is still flushing.
            close();
            if(!res.destroyed&&!res.writableEnded){try{res.end();}catch{fail();}}
          };
          const emit=(event,value)=>{
            if(!writable())return;
            // Encoded delta frames cannot be dropped like independent JPEGs.
            if(event==='native-video'&&res.writableLength>2097152){fail();return;}
            if(event==='frame'&&res.writableLength>524288){pendingFrame=value;return;}
            if(event==='frame'||event==='closed'||event==='failure'||event==='capture'&&value.status!=='live')pendingFrame=null;
            if(write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`)&&event==='closed')end();
          };
          const drain=()=>{if(pendingFrame)emit('frame',pendingFrame);};
          res.on('drain',drain);res.once('finish',close);res.once('close',close);
          // write errors can arrive asynchronously, including after end().
          res.on('error',fail);req.once('aborted',close);
          try{
            if(!writable())return;
            res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
            timer=setInterval(()=>{if(writable()&&res.writableLength<=524288)write(': keepalive\n\n');},15000);timer.unref();
            unsubscribe=op==='native-video'?await manager.watchNativeVideo(id,emit,controller.signal):url.searchParams.has('app')?await manager.watchNative(id,url.searchParams.get('app'),emit,controller.signal,url.searchParams.get('stack')==='1'):await manager.watchBrowser(id,url.searchParams.get('tab'),emit,controller.signal,url.searchParams.get('stack')==='1',url.searchParams.get('view')==='1');
            if(closed)release();
          }catch(error){emit('failure',errorDetails(error));end();}
          return;
        }
        if(req.method!=='POST'){send(res,405,{error:'Method not allowed'});return;}
        if(op==='stop'){await manager.stop(id);send(res,200,manager.status(id));return;}
        if(op==='input'){
          const input=await body(req);
          if(hub.config().computerUseEnabled===false&&!['dialog','release','pointerup','keyup'].includes(input.type)){send(res,409,{error:'Computer Use 已关闭'});return;}
          send(res,200,await manager.manualInput(id,input));return;
        }
        if(hub.config().computerUseEnabled===false){send(res,409,{error:'Computer Use 已关闭'});return;}
        if(op==='native-presentation'){send(res,200,await manager.nativePresentationAction(id,await body(req)));return;}
        if(op==='tab-drag-preview'){
          send(res,200,await requestOperation(req,res,'标签页拖动预览',async signal=>manager.tabDragPreviews.handle(id,await body(req),signal)));return;
        }
        if(op==='browser-native'){
          const input=await body(req),timeout=['profileChooseDownloadDirectory','profileImportChooseSource','profileImport',
            'profileNativeImportChooseSource','profileNativeImport','profileNativeImportCancel'].includes(input.action)
            || passwordFileImportActions.has(input.action) && input.action !== 'profilePasswordFileImportSignals' ?300000:15000;
          send(res,200,await requestOperation(req,res,'原生浏览器操作',signal=>manager.nativeBrowserAction(id,input,signal),timeout,
            passwordFileImportTerminalActions.has(input.action)));return;
        }
        if(op==='browser-history-clear'){send(res,200,manager.browsingHistory.clear(id));return;}
        if(op==='downloads-clear'){send(res,200,manager.clearDownloads(id));return;}
        if(['annotation','annotation-site','annotation-submit','annotation-queue','annotation-style','view-screenshot','view-copy-screenshot','view-native-presentation','view-viewport','view-emulation','view-layout','view-find','view-zoom'].includes(op)){
          const task=['view-screenshot','view-copy-screenshot'].includes(op)?'截图':op==='view-native-presentation'?'原生网页呈现':op==='view-zoom'?'页面缩放':['view-viewport','view-emulation','view-layout'].includes(op)?'视口调整':op==='view-find'?'页面查找':'页面批注';
          const method={'annotation':'annotationSnapshot','annotation-site':'annotationSite','annotation-submit':'submitAnnotation','annotation-queue':'annotationQueue','annotation-style':'annotationStylePreview','view-screenshot':'viewScreenshot','view-copy-screenshot':'copyViewedScreenshot','view-native-presentation':'presentViewedTab','view-viewport':'resizeViewedTab','view-emulation':'emulateViewedTab','view-layout':'layoutViewedTab','view-find':'findViewedText','view-zoom':'zoomViewedTab'}[op];
          send(res,200,await requestOperation(req,res,task,async signal=>manager[method](id,await body(req),signal)));
          return;
        }
        if(op==='share-windows'||op==='share-window'){
          send(res,200,await requestOperation(req,res,'窗口分享',async signal=>op==='share-windows'
            ? {windows:await manager.readWindowShare(null,signal)} : manager.readWindowShare(await body(req),signal)));
          return;
        }
        if(op==='reveal-preview'){send(res,200,await manager.revealPreview(id,await body(req)));return;}
        if(op==='resume'){await manager.resume(id);send(res,200,manager.status(id));return;}
        if(op==='reset'){await manager.reset(id);send(res,200,manager.status(id));return;}
        if(op==='inventory'){send(res,200,await manager.dispatch('ui-inventory','getState'));return;}
        if(op==='tabs'){
          send(res,200,await requestOperation(req,res,'浏览器标签页操作',async signal=>{
            await manager.changeUserTab(id,await body(req),signal);return manager.status(id);
          },0));return;
        }
        if(op==='view-tab'){send(res,200,await manager.viewTab(id,await body(req)));return;}
        if(op==='transfer-tab'){
          send(res,200,await requestOperation(req,res,'浏览器窗口转移',async signal=>manager.transferUserTab(id,await body(req),signal)));return;
        }
        if(op==='presentation-ack'){send(res,200,manager.acknowledgePresentation(id,await body(req)));return;}
        if(op==='open-external'){
          send(res,200,await requestOperation(req,res,'打开外部浏览器',async signal=>manager.openViewedExternally(id,await body(req),signal),0));return;
        }
        if(op==='browser-link'){
          send(res,200,await requestOperation(req,res,'打开聊天链接',async signal=>manager.openBrowserLink(id,await body(req),signal),0));return;
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
      }catch(error){const details=errorDetails(error),status=Number.isInteger(error?.statusCode)&&error.statusCode>=400&&error.statusCode<=599?error.statusCode:400;send(res,status,{error:details.message,...(details.code===undefined?{}:{code:details.code})});}
    }}));
  });
}
