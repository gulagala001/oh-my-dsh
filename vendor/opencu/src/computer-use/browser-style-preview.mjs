import {annotationSnapshotOptions,annotationStyleProperties,captureAnnotation}from'./browser-annotation.mjs';
import{viewportGeometry,sameScreenshotGeometry}from'./browser-screenshot.mjs';
import{annotationDocuments,annotationFrameLoader}from'./annotation-documents.mjs';
import{readAnnotationTextChange,createAnnotationTextLedger}from'./annotation-text-changes.mjs';

const supported=new Set([...annotationStyleProperties,'line-height','border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius']);
export function styleChanges(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length||Object.keys(value).length>20)throw new Error('请选择要预览的样式');
  for(const [property,text]of Object.entries(value))if(!supported.has(property)||typeof text!=='string'||!text.trim()||text.length>256)throw new Error('不支持的样式属性或值：'+property);
  return value;
}
const stale=()=>new Error('页面或元素已改变，请重新打开批注后预览样式');
function sourceDocsPage(value){
  let url;try{url=new URL(value);}catch{return false;}if(url.hostname!=='docs.google.com')return false;
  const parts=url.pathname.split('/').filter(Boolean),document=parts.indexOf('document'),docD=document===-1?-1:parts.indexOf('d',document+1),id=docD===-1?undefined:parts[docD+1],documentId=id==='e'&&parts[docD+3]==='pub'?parts[docD+2]:id;
  if(documentId!=null&&documentId.length)return true;const sheet=parts.indexOf('spreadsheets'),sheetD=sheet===-1?-1:parts.indexOf('d',sheet+1);return sheetD!==-1&&parts[sheetD+1]!=null;
}
async function call(cdp,objectId,fn,args=[]){
  const response=await cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:fn.toString(),arguments:args.map(value=>({value})),returnByValue:true});
  if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);
  return response.result.value;
}
async function readRemoteObject(read,cdp,operation,objectId){
  try{return await read(operation);}
  catch(error){
    // A timed-out protocol reply can still create a remote object afterwards.
    void operation.then(result=>{const id=objectId(result);if(id)return cdp.send('Runtime.releaseObject',{objectId:id});}).catch(()=>{});
    throw error;
  }
}
function transaction(token,textLedger){
  const node=this,doc=node.ownerDocument,win=doc.defaultView,attribute='data-trisoul-style-preview',original=node.getAttribute(attribute);let applied,style,active=false,timer;
  const restore=()=>{
    clearTimeout(timer);win.removeEventListener('pagehide',restore,true);style?.remove();if(!active)return{restored:true};
    if(node.getAttribute(attribute)===applied){if(original===null)node.removeAttribute(attribute);else node.setAttribute(attribute,original);}
    else{
      const values=(node.getAttribute(attribute)??'').split(/\s+/).filter(value=>value&&value!==token);
      if(values.length)node.setAttribute(attribute,values.join(' '));else node.removeAttribute(attribute);
    }
    const text=textLedger?.restore()??{restored:true,conflicts:[]};active=!text.restored;return{restored:text.restored,conflicts:text.conflicts};
  };
  return{
    apply(changes,text){
      if(!node.isConnected)throw Error('元素已离开页面');
      if(active)throw Error('样式预览已应用');
      for(const [name,value]of Object.entries(changes))if(!win.CSS.supports(name,value))throw Error('无效的 CSS 值：'+name);
      active=true;win.addEventListener('pagehide',restore,true);timer=setTimeout(restore,5000);
      // Match Codex ys/Lb/Ub: owned stylesheet + token, preserving inline CSS.
      try{
        const values=new Set((original??'').split(/\s+/).filter(Boolean));values.add(token);applied=[...values].join(' ');node.setAttribute(attribute,applied);
        if(text){const changed=textLedger.reconcile([{node,changes:[{commentId:token,text}]}]);if(changed.conflicts.length)throw Error('批注文字已改变：'+changed.conflicts.map(value=>value.message).join('; '));}
        if(Object.keys(changes).length){
          style=doc.createElement('style');const root=node.getRootNode();
          (root===doc?doc.head??doc.documentElement:root).appendChild(style);
          if(!style.sheet)throw Error('页面不允许应用临时样式');
          const index=style.sheet.insertRule('['+attribute+'~="'+token+'"] {}',0),rule=style.sheet.cssRules[index];
          for(const [name,value]of Object.entries(changes))rule.style.setProperty(name,value,'important');
        }
      }
      catch(error){restore();throw error;}
      return{applied:true};
    },restore,isActive(){return active;},targetStatus(){
      if(!node.isConnected)return{connected:false,resolvable:false};
      for(let parent=node;parent;parent=parent.parentElement){const css=win.getComputedStyle(parent);if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||Number.parseFloat(css.opacity)===0)return{connected:true,resolvable:false};}
      if(typeof node.checkVisibility==='function'&&!node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return{connected:true,resolvable:false};
      const rect=node.getBoundingClientRect();return{connected:true,resolvable:rect.width>0&&rect.height>0};
    },
  };
}
export async function restoreStylePreview(view){
  const pending=view.stylePreview;if(!pending)return;
  const cdp=pending.cdp??view.cdp;
  const finish=async result=>{if(view.stylePreview===pending)view.stylePreview=null;void cdp.send('Runtime.releaseObject',{objectId:pending.objectId}).catch(()=>{});await pending.dispose?.();return result;};
  if(pending.restoring)return pending.restoring;
  const work=(async()=>{
    let timer;
    try{
      const outcome=await Promise.race([call(cdp,pending.objectId,function(){return this.restore();}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('临时样式恢复尚未确认，请重试停止')),5000);})]);
      if(!outcome?.restored)throw new Error('临时样式恢复尚未确认');
      return await finish(outcome);
    }catch(error){
      // Destruction of the document proves that its temporary styles are gone.
      if(view.record.page.isClosed()||pending.frame?.isDetached())return finish({restored:true,closed:true});
      let checkTimer;
      const changed=await Promise.race([pending.verifyNavigation?pending.verifyNavigation().catch(()=>false):cdp.send('Page.getFrameTree').then(tree=>tree.frameTree.frame.loaderId!==pending.loaderId).catch(()=>false),new Promise(resolve=>{checkTimer=setTimeout(()=>resolve(false),1000);})]).finally(()=>clearTimeout(checkTimer));
      if(changed)return finish({restored:true,navigated:true});
      throw error;
    }finally{clearTimeout(timer);}
  })();
  pending.restoring=work;try{return await work;}finally{pending.restoring=null;}
}
export async function previewElementStyle(views,view,input,signal){
  const lifetime=AbortSignal.any([signal,view.lifetime.signal,view.document.signal].filter(Boolean));
  lifetime.throwIfAborted();
  const textRequested=input.textValue!==undefined;
  if(textRequested&&typeof input.textValue!=='string')throw new Error('批注新文字必须是字符串');
  const proposed=input.changes===undefined&&textRequested?{}:input.changes;
  const changes=textRequested&&proposed&&typeof proposed==='object'&&!Array.isArray(proposed)&&!Object.keys(proposed).length?{}:styleChanges(proposed),baseline=view.annotations?.get(input.sourceFrameId);
  const element=baseline?.result.elements.find(e=>e.key===input.elementKey);
  if(!element||view.loaderId!==baseline.result.frame.loaderId)throw stale();
  delete baseline.preview;
  if(view.stylePreview)throw new Error('上一次临时样式尚未恢复，请重试停止');
  const read=operation=>views.read(view,operation,lifetime);
  const documents=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime);let retained=false;
  try{
  if(JSON.stringify(documents.signature)!==JSON.stringify(baseline.dom))throw stale();
  if(!sameScreenshotGeometry(baseline.result.frame.geometry,viewportGeometry(await read(view.cdp.send('Page.getLayoutMetrics')))))throw stale();
  const entry=documents.entries.get(element.frameId);if(!entry)throw stale();const cdp=entry.cdp;
  const text=textRequested?await readAnnotationTextChange(read,entry,element.backendNodeId,input.textValue,lifetime):null;
  const {executionContextId}=await read(cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName:'trisoul-style-preview'}));
  const {object}=await readRemoteObject(read,cdp,cdp.send('DOM.resolveNode',{backendNodeId:element.backendNodeId,executionContextId}),result=>result.object?.objectId);
  let transactionObject,textObject;
  try{
    if(text){const prepared=await readRemoteObject(read,cdp,cdp.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:'function(){return ('+createAnnotationTextLedger.toString()+').call(this.ownerDocument);}'}),result=>result.result?.objectId);if(prepared.exceptionDetails||!prepared.result?.objectId)throw new Error('无法准备批注文字预览');textObject=prepared.result.objectId;}
    const result=await readRemoteObject(read,cdp,cdp.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:transaction.toString(),arguments:[{value:baseline.result.frame.id},textObject?{objectId:textObject}:{value:null}]}),result=>result.result?.objectId);
    if(result.exceptionDetails||!result.result.objectId)throw new Error('无法准备样式预览');
    transactionObject=result.result.objectId;
  }finally{if(textObject)void cdp.send('Runtime.releaseObject',{objectId:textObject}).catch(()=>{});void cdp.send('Runtime.releaseObject',{objectId:object.objectId}).catch(()=>{});}
  view.stylePreview={objectId:transactionObject,loaderId:entry.loaderId,frame:entry.frame,cdp,dispose:documents.dispose,verifyNavigation:async()=>{const current=await annotationFrameLoader(views,view,entry.frame,entry.frameId);return !!current&&current!==entry.loaderId;}};retained=true;
  let captured,restored,targetStatus;
  try{
    lifetime.throwIfAborted();await read(call(cdp,transactionObject,function(changes,text){return this.apply(changes,text);},[changes,text]));
    captured=await captureAnnotation(views,view,lifetime,{remember:false});
    targetStatus=await read(call(cdp,transactionObject,function(){return this.targetStatus();}));
    if(!await read(call(cdp,transactionObject,function(){return this.isActive();})))throw new Error('样式预览超时，请重试');
  }finally{restored=await restoreStylePreview(view);}
  lifetime.throwIfAborted();
  let selected=captured.elements.find(e=>e.key===element.key),skipScreenshot=false;
  if(!selected){
    if(targetStatus?.connected===true&&targetStatus.resolvable===false&&!captured.truncated&&!sourceDocsPage(baseline.result.frame.url)){
      selected={key:element.key,backendNodeId:element.backendNodeId,frameId:element.frameId,hidden:true,region:null,polygon:null};skipScreenshot=true;
    }else throw new Error('所选元素在新样式下不可见，请调整样式');
  }
  if(view.annotations?.get(input.sourceFrameId)!==baseline||!restored?.restored)throw stale();
  baseline.preview={sourceFrameId:input.sourceFrameId,frame:captured.frame,element:selected,elements:captured.elements,changes:{...changes},...(text?{text:{...text}}:{}),...(skipScreenshot?{skipScreenshot:true}:{}),restored:{...restored}};
  return{frame:captured.frame,element:selected,elements:captured.elements,changes,...(text?{text:{...text}}:{}),...(skipScreenshot?{skipScreenshot:true}:{}),restored};
  }finally{if(!retained)await documents.dispose();}
}
