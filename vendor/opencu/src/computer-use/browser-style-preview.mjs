import {annotationSnapshotOptions,captureAnnotation}from'./browser-annotation.mjs';
import{viewportGeometry,sameScreenshotGeometry}from'./browser-screenshot.mjs';
import{annotationDocuments,annotationFrameLoader}from'./annotation-documents.mjs';

const supported=new Set(['color','background-color','font-size','font-family','font-weight','line-height','width','height','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius']);
export function styleChanges(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length||Object.keys(value).length>20)throw new Error('请选择要预览的样式');
  for(const [property,text]of Object.entries(value))if(!supported.has(property)||typeof text!=='string'||!text.trim()||text.length>256)throw new Error('不支持的样式属性或值：'+property);
  return value;
}
const stale=()=>new Error('页面或元素已改变，请重新打开批注后预览样式');
async function call(cdp,objectId,fn,args=[]){
  const response=await cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:fn.toString(),arguments:args.map(value=>({value})),returnByValue:true});
  if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);
  return response.result.value;
}
function transaction(){
  const node=this,original=node.getAttribute('style'),win=node.ownerDocument.defaultView;let applied,owned=[],active=false,timer;
  const restore=()=>{
    clearTimeout(timer);win.removeEventListener('pagehide',restore,true);if(!active)return{restored:true};
    const conflicts=[];
    if(node.getAttribute('style')===applied){if(original===null)node.removeAttribute('style');else node.setAttribute('style',original);}
    else for(const item of owned){
      if(node.style.getPropertyValue(item.name)===item.applied&&node.style.getPropertyPriority(item.name)==='important'){
        if(item.value)node.style.setProperty(item.name,item.value,item.priority);else node.style.removeProperty(item.name);
      }else conflicts.push(item.name);
    }
    active=false;return{restored:true,conflicts};
  };
  return{
    apply(changes){
      if(!node.isConnected)throw Error('元素已离开页面');
      for(const [name,value]of Object.entries(changes))if(!CSS.supports(name,value))throw Error('无效的 CSS 值：'+name);
      owned=Object.keys(changes).map(name=>({name,value:node.style.getPropertyValue(name),priority:node.style.getPropertyPriority(name)}));
      active=true;win.addEventListener('pagehide',restore,true);timer=setTimeout(restore,5000);
      try{for(const item of owned){node.style.setProperty(item.name,changes[item.name],'important');item.applied=node.style.getPropertyValue(item.name);}applied=node.getAttribute('style');}
      catch(error){restore();throw error;}
      return{applied:true};
    },restore,isActive(){return active;},
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
  const changes=styleChanges(input.changes),baseline=view.annotations?.get(input.sourceFrameId);
  const element=baseline?.result.elements.find(e=>e.key===input.elementKey);
  if(!element||view.loaderId!==baseline.result.frame.loaderId)throw stale();
  if(view.stylePreview)throw new Error('上一次临时样式尚未恢复，请重试停止');
  const read=operation=>views.read(view,operation,signal);
  const documents=await annotationDocuments(views,view,annotationSnapshotOptions,signal);let retained=false;
  try{
  if(JSON.stringify(documents.signature)!==JSON.stringify(baseline.dom))throw stale();
  if(!sameScreenshotGeometry(baseline.result.frame.geometry,viewportGeometry(await read(view.cdp.send('Page.getLayoutMetrics')))))throw stale();
  const entry=documents.entries.get(element.frameId);if(!entry)throw stale();const cdp=entry.cdp;
  const {executionContextId}=await read(cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName:'trisoul-style-preview'}));
  const {object}=await read(cdp.send('DOM.resolveNode',{backendNodeId:element.backendNodeId,executionContextId}));
  let transactionObject;
  try{
    const result=await read(cdp.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:transaction.toString()}));
    if(result.exceptionDetails||!result.result.objectId)throw new Error('无法准备样式预览');
    transactionObject=result.result.objectId;
  }finally{void cdp.send('Runtime.releaseObject',{objectId:object.objectId}).catch(()=>{});}
  view.stylePreview={objectId:transactionObject,loaderId:entry.loaderId,frame:entry.frame,cdp,dispose:documents.dispose,verifyNavigation:async()=>{const current=await annotationFrameLoader(views,view,entry.frame,entry.frameId);return !!current&&current!==entry.loaderId;}};retained=true;
  let captured,restored;
  try{
    signal?.throwIfAborted();await read(call(cdp,transactionObject,function(changes){return this.apply(changes);},[changes]));
    captured=await captureAnnotation(views,view,signal,{remember:false});
    if(!await read(call(cdp,transactionObject,function(){return this.isActive();})))throw new Error('样式预览超时，请重试');
  }finally{restored=await restoreStylePreview(view);}
  signal?.throwIfAborted();
  const selected=captured.elements.find(e=>e.key===element.key);if(!selected)throw new Error('所选元素在新样式下不可见，请调整样式');
  return{frame:captured.frame,element:selected,changes,restored};
  }finally{if(!retained)await documents.dispose();}
}
