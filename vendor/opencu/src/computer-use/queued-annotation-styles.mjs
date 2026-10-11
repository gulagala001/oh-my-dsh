import {randomUUID} from 'node:crypto';
import {annotationDocuments,annotationFrameLoader} from './annotation-documents.mjs';
import {annotationSnapshotOptions} from './browser-annotation.mjs';
import {styleChanges} from './browser-style-preview.mjs';
import {createAnnotationTextLedger} from './annotation-text-changes.mjs';

const invalid=message=>Object.assign(new Error(message),{code:'INVALID_QUEUED_ANNOTATION_STYLE'});
const identity=view=>({tabId:view.tabId,loaderId:view.loaderId});
const release=(cdp,objectId)=>objectId?cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{}):Promise.resolve();
const samePage=(left,right)=>{
  let a,b;try{a=new URL(left);b=new URL(right);}catch{return left===right;}
  if(['http:','https:'].includes(a.protocol)&&['http:','https:'].includes(b.protocol))return a.origin===b.origin&&a.pathname===b.pathname&&a.search===b.search;
  if(a.protocol==='file:'&&b.protocol==='file:')return a.pathname===b.pathname&&a.search===b.search;
  return left===right;
};

async function remote(cdp,objectId,fn,args=[],returnByValue=true){
  const result=await cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:fn.toString(),arguments:args,returnByValue});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
  return returnByValue?result.result?.value:result.result;
}
async function readObject(read,cdp,operation,objectId){
  try{return await read(operation);}
  catch(error){void operation.then(result=>release(cdp,objectId(result))).catch(()=>{});throw error;}
}

// Pb/Ib/Lb/Ub and gs/ys: ordered group rules, document-owned targets and
// stylesheet, and an empty projection while original view is held.
function documentLedger(attribute,bindingName,textLedger){
  const doc=this,win=doc.defaultView,targets=new Map(),originals=new Map(),sheets=new Map(),observers=new Map();
  const binding=bindingName?globalThis[bindingName]:null;
  let entries=[],enabled=false,showOriginal=false,closed=false,scheduled=false,watching=false,trustedProjection=null;
  const conflicts=new Map();let textEntries=new Map(),styleEntries=new Set();
  const tokens=node=>(node.getAttribute(attribute)??'').split(/\s+/).filter(Boolean);
  const original=node=>{if(!originals.has(node))originals.set(node,{value:node.getAttribute(attribute),applied:null,owned:new Set()});return originals.get(node);};
  const write=(node,wanted)=>{
    const record=original(node),current=node.getAttribute(attribute);
    if(!wanted.length&&current===record.applied){if(record.value===null)node.removeAttribute(attribute);else if(current!==record.value)node.setAttribute(attribute,record.value);record.applied=record.value;return;}
    const remaining=current===record.applied?(record.value??'').split(/\s+/).filter(Boolean):tokens(node).filter(token=>!record.owned.has(token));
    const value=[...new Set([...remaining,...wanted])].join(' ');
    if(current!==(value||null)){if(value)node.setAttribute(attribute,value);else node.removeAttribute(attribute);}
    record.applied=value||null;for(const token of wanted)record.owned.add(token);
  };
  const element=value=>value?.nodeType===1&&value.ownerDocument===doc&&typeof value.getBoundingClientRect==='function';
  const query=selector=>{
    if(!selector)return[];
    if(!selector.startsWith('shadow:'))return Array.from(doc.querySelectorAll(selector)).filter(element);
    const parts=selector.slice(7).split('>>>');let root=doc;
    for(let index=0;index<parts.length;index++){
      const node=root.querySelector(parts[index]);if(!element(node))return[];
      if(index===parts.length-1)return[node];if(!node.shadowRoot)return[];root=node.shadowRoot;
    }
    return[];
  };
  const text=node=>{
    if(node===doc.documentElement||node===doc.body)return node.tagName.toLowerCase();
    return(node.innerText||node.textContent||'').replace(/\s+/g,' ').trim().slice(0,80)||null;
  };
  const nearby=node=>text(node)||(node.closest('section,article,main,form,nav,aside,header,footer')?text(node.closest('section,article,main,form,nav,aside,header,footer')):null);
  const name=node=>node.getAttribute('aria-label')??text(node);
  const path=node=>{const parts=[];for(let depth=0;node&&depth<4;node=node.assignedSlot??node.parentElement??node.getRootNode()?.host,depth++){const tag=node.tagName.toLowerCase();if(tag==='html'||tag==='body'){if(!parts.length)parts.unshift(tag);break;}parts.unshift(tag);}return parts.join(' > ');};
  const visible=node=>{
    if(!node.isConnected)return false;
    for(let parent=node;parent;parent=parent.parentElement){const css=win.getComputedStyle(parent);if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||Number.parseFloat(css.opacity)===0)return false;}
    if(typeof node.checkVisibility==='function'&&!node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return false;
    const rect=node.getBoundingClientRect();return rect.width>0&&rect.height>0;
  };
  const projection=()=>{
    if(trustedProjection)return trustedProjection;
    try{
      const top=win.top;let current=win,x=0,y=0;
      while(current!==top){const owner=current.frameElement;if(!owner?.ownerDocument?.defaultView)throw Error('element-geometry-unavailable');const rect=owner.getBoundingClientRect();x+=rect.left;y+=rect.top;current=owner.ownerDocument.defaultView;}
      const topScrollY=top.scrollY;if(![x,y,topScrollY].every(Number.isFinite))throw Error('element-geometry-unavailable');
      return{frameOffset:{x,y},topScrollY};
    }catch{
      if(bindingName&&typeof globalThis[bindingName]==='function')globalThis[bindingName]('queued-style-geometry');
      throw Error('element-geometry-unavailable');
    }
  };
  const anchorViewport=anchor=>{
    if(!anchor.rect||!['x','y','width','height'].every(key=>Number.isFinite(anchor.rect[key]))||typeof anchor.isFixed!=='boolean'||anchor.scrollContainers!==undefined&&(!Array.isArray(anchor.scrollContainers)||anchor.scrollContainers.some(value=>typeof value?.selector!=='string'||!Number.isFinite(value.scrollLeft)||!Number.isFinite(value.scrollTop))))throw Error('element-ambiguous');
    const current=projection();let x=0,y=0;
    for(const container of anchor.scrollContainers??[]){const node=query(container.selector)[0];if(node){x+=node.scrollLeft-container.scrollLeft;y+=node.scrollTop-container.scrollTop;}}
    return{current,x:anchor.rect.x-x,y:anchor.rect.y-(anchor.isFixed?0:current.topScrollY)-y};
  };
  const resolve=anchor=>{
    let nodes=query(anchor.selector).filter(visible);if(!nodes.length)return null;
    if(anchor.name!=null){const exact=nodes.filter(node=>name(node)===anchor.name);if(exact.length)nodes=exact;}
    if(anchor.nearbyText!=null){const exact=nodes.filter(node=>nearby(node)===anchor.nearbyText);if(exact.length)nodes=exact;}
    if(nodes.length===1)return nodes[0];
    const expected=anchorViewport(anchor);let best=null,bestScore=-Infinity;
    // Source sd uses these exact metadata weights and Manhattan distance.
    for(const node of nodes){
      let score=0;if(anchor.name!=null&&name(node)===anchor.name)score+=1000;if(anchor.nearbyText!=null&&nearby(node)===anchor.nearbyText)score+=500;
      if(anchor.title===(node.getAttribute('aria-label')||text(node)||node.tagName.toLowerCase()))score+=250;if(anchor.elementPath===path(node))score+=25;
      const rect=node.getBoundingClientRect();score-=Math.abs(rect.left+expected.current.frameOffset.x-expected.x)+Math.abs(rect.top+expected.current.frameOffset.y-expected.y);
      if(score>bestScore){best=node;bestScore=score;}
    }
    return best;
  };
  const observe=root=>{
    if(observers.has(root))return;
    const observer=new win.MutationObserver(()=>{if(!closed&&!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;if(!closed)sync();});}});
    observer.observe(root,{attributeFilter:['aria-hidden','aria-expanded','class','data-state','hidden','inert','open','popover','style'],attributes:true,childList:true,subtree:true});observers.set(root,observer);
  };
  const sync=()=>{
    conflicts.clear();styleEntries=new Set();const desired=new Map(),rules=new Map();
    if(enabled&&!showOriginal)for(const entry of entries){
      let node=targets.get(entry.commentId);if(!element(node)||!node.isConnected){try{node=resolve(entry.anchor);}catch(error){conflicts.set(entry.commentId,error.message);node=null;}if(node)targets.set(entry.commentId,node);}
      if(!node?.isConnected){conflicts.set(entry.commentId,conflicts.get(entry.commentId)??'element-unresolved');continue;}
      const root=node.getRootNode();if(root!==doc&&root.host?.shadowRoot!==root){conflicts.set(entry.commentId,'shadow-root-unavailable');continue;}
      const own=desired.get(node)??[];own.push(entry.token);desired.set(node,own);
      const list=rules.get(root)??[];list.push(entry);rules.set(root,list);observe(root);
    }
    for(const node of originals.keys())if(!desired.has(node))write(node,[]);
    for(const [node,wanted]of desired)write(node,wanted);
    const byToken=new Map(entries.map(entry=>[entry.token,entry])),textResult=textLedger.reconcile([...desired].map(([node,wanted])=>({node,changes:wanted.map(token=>byToken.get(token))})));
    textEntries=new Map(textResult.entries.map(entry=>[entry.commentId,entry]));
    for(const conflict of textResult.conflicts){if(!entries.some(entry=>entry.commentId===conflict.commentId))throw Error('批注文字恢复尚未确认：'+conflict.message);conflicts.set(conflict.commentId,conflict.message);}
    for(const [root,style]of sheets)if(!rules.has(root)){style.remove();sheets.delete(root);}
    for(const [root,list]of rules){
      let style=sheets.get(root);if(!style){style=doc.createElement('style');style.setAttribute('data-trisoul-queued-style-sheet','');sheets.set(root,style);}
      const css=list.filter(entry=>Object.keys(entry.changes).length).map(entry=>'['+attribute+'~="'+entry.token+'"] {\n'+Object.entries(entry.changes).map(([property,value])=>'  '+property+': '+value+' !important;').join('\n')+'\n}').join('\n\n');
      if(style.textContent!==css)style.textContent=css;
      const parent=root===doc?doc.head??doc.documentElement:root;if(style.parentNode!==parent)parent.appendChild(style);
      if(!style.sheet)for(const entry of list)conflicts.set(entry.commentId,'stylesheet-unavailable');
      else for(const entry of list)if(Object.keys(entry.changes).length)styleEntries.add(entry.commentId);
    }
    for(const [root,observer]of observers)if(root!==doc&&!rules.has(root)){observer.disconnect();observers.delete(root);}
    return status();
  };
  const status=()=>({restored:(!enabled||showOriginal||closed)&&![...textEntries.values()].some(entry=>entry.conflicts.length),entries:entries.map(entry=>{
    const text=textEntries.get(entry.commentId),styleApplied=enabled&&!showOriginal&&!closed&&styleEntries.has(entry.commentId)&&targets.get(entry.commentId)?.isConnected===true,textChanged=entry.text!=null&&entry.text.value!==entry.text.previousValue;
    return{commentId:entry.commentId,applied:styleApplied||text?.textApplied===true,styleApplied,textApplied:text?.textApplied===true,...(text?.textOverriddenBy?{textOverriddenBy:text.textOverriddenBy}:{}),restored:(!enabled||showOriginal||closed||Object.keys(entry.changes).length===0&&!textChanged)&&!conflicts.has(entry.commentId),conflicts:conflicts.has(entry.commentId)?[conflicts.get(entry.commentId)]:[]};
  })});
  const restore=()=>{
    if(closed){const text=textLedger.restore();return{restored:text.restored,conflicts:text.conflicts};}closed=true;win.removeEventListener('pagehide',restore,true);
    if(bindingName&&globalThis[bindingName]===binding)delete globalThis[bindingName];
    for(const observer of observers.values())observer.disconnect();observers.clear();
    for(const style of sheets.values())style.remove();sheets.clear();for(const node of originals.keys())write(node,[]);
    const text=textLedger.restore();targets.clear();entries=[];originals.clear();return{restored:text.restored,conflicts:text.conflicts};
  };
  return{
    bind(commentId,node){if(closed)throw Error('样式文档已销毁');if(!element(node)||!node.isConnected)throw Error('样式元素已离开页面');targets.set(commentId,node);return true;},
    frameOwner(selector){return query(selector)[0]??null;},
    node(commentId){return targets.get(commentId)??null;},
    topScrollY(){return win.scrollY;},
    update(next,options,projection){
      if(closed)throw Error('样式文档已销毁');
      for(const entry of next)for(const [property,value]of Object.entries(entry.changes))if(!win.CSS.supports(property,value))throw Error('无效的 CSS 值：'+property);
      if(!watching){observe(doc);win.addEventListener('pagehide',restore,true);watching=true;}
      const previous={entries,enabled,showOriginal};entries=next;enabled=options.enabled;showOriginal=options.showOriginal;
      trustedProjection=projection;
      try{const result=sync();const keep=new Set(entries.map(entry=>entry.commentId));for(const key of targets.keys())if(!keep.has(key))targets.delete(key);return result;}
      catch(error){entries=previous.entries;enabled=previous.enabled;showOriginal=previous.showOriginal;try{sync();}catch{restore();}throw error;}
      finally{trustedProjection=null;}
    },status,restore,
  };
}

function normalizedEntries(entries,activeEntry=null){
  if(!Array.isArray(entries))throw invalid('缺少后端样式账本');
  const result=[],ids=new Set();
  for(const entry of entries){
    const comment=entry?.comment,group=comment?.localBrowserDesignChange?.group;if(!group||group.status!=='queued'&&!(entry===activeEntry&&group.status==='editing'))continue;
    if(group.anchor?.kind!=='element')continue;
    const commentId=comment.localBrowserCommentMetadata?.commentId,selection=entry.selection,anchor=group.anchor;
    if(typeof commentId!=='string'||!commentId||ids.has(commentId)||typeof selection?.sourceFrameId!=='string'||typeof selection.elementKey!=='string'||anchor?.kind!=='element'||typeof anchor.pageUrl!=='string'||!Array.isArray(anchor.framePath)||anchor.framePath.some(value=>typeof value!=='string')||typeof anchor.selector!=='string'||!Array.isArray(group.declarations))throw invalid('后端样式批注绑定无效');
    ids.add(commentId);const changes={};
    for(const declaration of group.declarations){if(typeof declaration?.property!=='string'||typeof declaration.value!=='string'||typeof declaration.previousValue!=='string')throw invalid('后端样式声明无效');if(declaration.value.trim()!==declaration.previousValue.trim())changes[declaration.property]=declaration.value;}
    if(group.text!=null&&(typeof group.text.value!=='string'||typeof group.text.previousValue!=='string'))throw invalid('后端文字声明无效');
    if(Object.keys(changes).length)styleChanges(changes);
    result.push({commentId,sourceFrameId:selection.sourceFrameId,elementKey:selection.elementKey,mainLoaderId:selection.loaderId,anchor:structuredClone(anchor),changes,...(group.text?{text:{value:group.text.value,previousValue:group.text.previousValue}}:{}),...(entry===activeEntry?{isActive:true,activeFrameId:selection.frameId,activeFrameLoaderId:selection.frameLoaderId}:{})});
  }
  return result;
}

function stateFor(views,view){
  if(view.queuedAnnotationStyles)return view.queuedAnnotationStyles;
  const state={views,view,documents:new Map(),bindings:new Map(),entries:[],enabled:false,showOriginal:false,tail:Promise.resolve(),document:null};
  const refresh=()=>{
    if(view.closed||view.lifetime.signal.aborted||!state.entries.length||state.refreshQueued)return;
    state.refreshQueued=true;
    void reconcileNormalized(views,view,state,null,null,{refresh:true}).catch(error=>view.publish?.('warning',{message:error.message})).finally(()=>{state.refreshQueued=false;});
  };
  state.refresh=refresh;const page=view.record.page;
  page.on('domcontentloaded',refresh);page.on('load',refresh);page.on('framenavigated',refresh);page.on('framedetached',refresh);
  state.detach=()=>{page.off('domcontentloaded',refresh);page.off('load',refresh);page.off('framenavigated',refresh);page.off('framedetached',refresh);};
  state.closed=()=>{state.detach();void restoreQueuedAnnotationStyles(view).catch(error=>view.publish?.('warning',{message:error.message}));};
  view.lifetime.signal.addEventListener('abort',state.closed,{once:true});view.queuedAnnotationStyles=state;return state;
}
function serialize(state,work){const next=state.tail.catch(()=>{}).then(work);state.tail=next.catch(()=>{});return next;}

async function restoredDocument(state,pending){
  let timer;
  try{
    const result=await Promise.race([remote(pending.cdp,pending.objectId,function(){return this.restore();}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('排队样式恢复尚未确认')),5000);})]);
    if(!result?.restored)throw new Error('排队样式恢复尚未确认');return result;
  }catch(error){
    const {view,views}=state;
    if(view.record.page.isClosed()||pending.frame.isDetached())return{restored:true,closed:true,conflicts:[]};
    let checkTimer;const loaderId=await Promise.race([annotationFrameLoader(views,view,pending.frame,pending.frameId).catch(()=>null),new Promise(resolve=>{checkTimer=setTimeout(()=>resolve(null),1000);})]).finally(()=>clearTimeout(checkTimer));
    if(loaderId&&loaderId!==pending.loaderId)return{restored:true,navigated:true,conflicts:[]};throw error;
  }finally{clearTimeout(timer);}
}
async function restoreState(state){
  const restored=[],conflicts=[];
  for(const [frameId,pending]of state.documents){
    try{const result=await restoredDocument(state,pending);restored.push({frameId,loaderId:pending.loaderId,...result});state.documents.delete(frameId);await release(pending.cdp,pending.objectId);await pending.dispose?.();}
    catch(error){conflicts.push({frameId,loaderId:pending.loaderId,message:error.message});}
  }
  return{restored:conflicts.length===0,documents:restored,conflicts};
}
export async function restoreQueuedAnnotationStyles(view){
  const state=view.queuedAnnotationStyles;if(!state)return{restored:true,documents:[],conflicts:[]};
  const result=await serialize(state,()=>{state.enabled=false;state.showOriginal=false;return restoreState(state);});
  if(result.restored&&view.lifetime.signal.aborted){state.detach();state.document?.signal.removeEventListener('abort',state.abortDocument);view.lifetime.signal.removeEventListener('abort',state.closed);if(view.queuedAnnotationStyles===state)view.queuedAnnotationStyles=null;}
  if(!result.restored)throw Object.assign(new Error('排队样式恢复尚未确认：'+result.conflicts.map(value=>value.message).join('; ')),{code:'QUEUED_STYLE_RESTORE_FAILED',details:result});
  return result;
}

async function reconcileNormalized(views,view,state,entries,signal,options){
  return serialize(state,async()=>{
    if(options.refresh){entries=state.entries;if(state.activeDocument!==view.document)entries=entries.filter(entry=>!entry.isActive);options={enabled:state.enabled,showOriginal:state.showOriginal};}
    const lifetime=AbortSignal.any([signal,view.lifetime.signal,view.document.signal].filter(Boolean));lifetime.throwIfAborted();
    if(view.dialog)throw new Error('请先处理网页提示，再同步排队样式');
    if(entries.some(entry=>entry.isActive))state.activeDocument=view.document;else state.activeDocument=null;
    state.entries=entries;state.enabled=options.enabled;state.showOriginal=options.showOriginal;
    if(state.document!==view.document){
      const cleanup=await restoreState(state);if(!cleanup.restored)throw new Error('旧页面排队样式尚未恢复');
      state.document?.signal.removeEventListener('abort',state.abortDocument);state.document=view.document;
      state.abortDocument=()=>{void serialize(state,()=>restoreState(state)).then(result=>{if(!result.restored)view.publish?.('warning',{message:'旧页面排队样式恢复尚未确认'});}).catch(()=>{});};
      state.document.signal.addEventListener('abort',state.abortDocument,{once:true});
    }
    const read=operation=>views.read(view,operation,lifetime),acquired=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime);
    let retained=0;const shared={count:0,dispose:async()=>{if(--shared.count===0)await acquired.dispose();}};
    const worlds=new Map(),ownerCache=new Map(),output=[],conflicts=[];
    const document=async entry=>{
      const old=state.documents.get(entry.frameId);if(old&&old.loaderId===entry.loaderId)return old;
      if(old){await restoredDocument(state,old);state.documents.delete(entry.frameId);await release(old.cdp,old.objectId);await old.dispose?.();}
      let world=worlds.get(entry.frameId);if(!world){world=await read(entry.cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName:'trisoul-queued-annotation-style'}));worlds.set(entry.frameId,world);}
      const doc=await readObject(read,entry.cdp,entry.cdp.send('Runtime.evaluate',{contextId:world.executionContextId,expression:'document'}),result=>result.result?.objectId);
      const bindingName='__trisoulQueuedStyle_'+randomUUID().replace(/-/g,''),bound=event=>{
        const current=state.documents.get(entry.frameId);
        if(current?.bindingName===bindingName&&current.loaderId===entry.loaderId&&event.name===bindingName&&event.executionContextId===world.executionContextId&&event.payload==='queued-style-geometry')state.refresh();
      };
      let object,textObject,bindingAvailable=false;
      const disposeBinding=async()=>{
        entry.cdp.off('Runtime.bindingCalled',bound);
        await entry.cdp.send('Runtime.evaluate',{contextId:world.executionContextId,expression:'delete globalThis['+JSON.stringify(bindingName)+']',returnByValue:true}).catch(()=>{});
        await entry.cdp.send('Runtime.removeBinding',{name:bindingName}).catch(()=>{});
      };
      try{
        await read(entry.cdp.send('Runtime.enable'));entry.cdp.on('Runtime.bindingCalled',bound);
        const adding=entry.cdp.send('Runtime.addBinding',{name:bindingName,executionContextId:world.executionContextId});
        try{await read(adding);bindingAvailable=true;}catch(error){void adding.finally(disposeBinding).catch(()=>{});lifetime.throwIfAborted();}
        textObject=await readObject(read,entry.cdp,remote(entry.cdp,doc.result.objectId,createAnnotationTextLedger,[],false),result=>result?.objectId);if(!textObject?.objectId)throw new Error('无法准备批注文字账本');
        object=await readObject(read,entry.cdp,remote(entry.cdp,doc.result.objectId,documentLedger,[{value:'data-trisoul-queued-style'},{value:bindingAvailable?bindingName:null},{objectId:textObject.objectId}],false),result=>result?.objectId);if(!object?.objectId)throw new Error('无法准备排队样式文档');
      }catch(error){await disposeBinding();throw error;}
      finally{await release(entry.cdp,textObject?.objectId);await release(entry.cdp,doc.result?.objectId);}
      const pending={...entry,objectId:object.objectId,bindingName,executionContextId:world.executionContextId,dispose:async()=>{await disposeBinding();await shared.dispose();}};shared.count++;retained++;state.documents.set(entry.frameId,pending);return pending;
    };
    const currentProjection=async entry=>{
      let x=0,y=0,child=entry;
      while(child.owner){
        const parent=acquired.entries.get(child.owner.frameId);if(!parent)throw new Error('排队样式的父框架已改变');const pending=await document(parent);
        const node=await readObject(read,pending.cdp,pending.cdp.send('DOM.resolveNode',{backendNodeId:child.owner.backendNodeId,executionContextId:pending.executionContextId}),value=>value.object?.objectId);
        try{const offset=await read(remote(pending.cdp,node.object.objectId,function(){if(!this.isConnected)throw Error('样式框架已离开页面');const rect=this.getBoundingClientRect();return{x:rect.left,y:rect.top};}));if(!Number.isFinite(offset?.x)||!Number.isFinite(offset?.y))throw new Error('排队样式的框架偏移不可读取');x+=offset.x;y+=offset.y;}
        finally{await release(pending.cdp,node.object?.objectId);}child=parent;
      }
      const pending=await document(child),topScrollY=await read(remote(pending.cdp,pending.objectId,function(){return this.topScrollY();}));
      if(!Number.isFinite(topScrollY))throw new Error('排队样式的顶层滚动不可读取');return{frameOffset:{x,y},topScrollY};
    };
    const matchesFrame=async(entry,anchor)=>{
      const chain=[];for(let child=entry;child?.owner;){chain.unshift(child.owner);child=acquired.entries.get(child.owner.frameId);if(!child)return false;}
      if(chain.length!==anchor.framePath.length)return false;
      for(let index=0;index<chain.length;index++){
        const owner=chain[index],parent=acquired.entries.get(owner.frameId),key=JSON.stringify([owner.frameId,anchor.framePath[index]]);let backendNodeId=ownerCache.get(key);
        if(backendNodeId===undefined){
          const pending=await document(parent),node=await readObject(read,pending.cdp,remote(pending.cdp,pending.objectId,function(selector){return this.frameOwner(selector);},[{value:anchor.framePath[index]}],false),value=>value?.objectId);
          try{backendNodeId=node?.objectId?(await read(pending.cdp.send('DOM.describeNode',{objectId:node.objectId}))).node.backendNodeId:null;}finally{await release(pending.cdp,node?.objectId);}ownerCache.set(key,backendNodeId);
        }
        if(backendNodeId!==owner.backendNodeId)return false;
      }
      return anchor.frameUrl==null||samePage(anchor.frameUrl,entry.strings[entry.document.documentURL]);
    };
    const groups=new Map();
    try{
      for(const entry of entries){
        const status={commentId:entry.commentId,sourceFrameId:entry.sourceFrameId,elementKey:entry.elementKey,applied:false,restored:!options.enabled||options.showOriginal,conflicts:[]};output.push(status);
        const previous=state.bindings.get(entry.commentId),known=previous?.sourceFrameId===entry.sourceFrameId&&previous?.elementKey===entry.elementKey?previous:null,baseline=view.annotations?.get(entry.sourceFrameId),element=baseline?.result.elements.find(value=>value.key===entry.elementKey);
        const binding=known??{token:previous?.token??randomUUID(),sourceFrameId:entry.sourceFrameId,elementKey:entry.elementKey,...(element&&baseline.result.frame.loaderId===view.loaderId?{frameId:element.frameId,backendNodeId:element.backendNodeId,loaderId:baseline.dom.snapshots.map(snapshot=>snapshot.loaders[element.frameId]).find(Boolean),mainLoaderId:view.loaderId}:{} )};state.bindings.set(entry.commentId,binding);
        if(!samePage(entry.anchor.pageUrl,view.record.page.url())){status.conflicts.push('page-url-mismatch');continue;}
        let target=binding.mainLoaderId===view.loaderId?acquired.entries.get(binding.frameId):null;
        if(target?.loaderId!==binding.loaderId)target=null;
        if(!target)for(const candidate of acquired.entries.values())if(await matchesFrame(candidate,entry.anchor)){target=candidate;break;}
        if(entry.isActive&&(target?.frameId!==entry.activeFrameId||target?.loaderId!==entry.activeFrameLoaderId)){status.conflicts.push('active-document-changed');continue;}
        if(!target){status.conflicts.push('frame-unresolved');continue;}
        const pending=await document(target);Object.assign(status,{frameId:target.frameId,loaderId:target.loaderId});
        if(binding.mainLoaderId===view.loaderId&&binding.loaderId===target.loaderId&&binding.backendNodeId){
          const node=await readObject(read,pending.cdp,pending.cdp.send('DOM.resolveNode',{backendNodeId:binding.backendNodeId,executionContextId:pending.executionContextId}),value=>value.object?.objectId).catch(()=>null);lifetime.throwIfAborted();
          if(node?.object?.objectId)try{await read(remote(pending.cdp,pending.objectId,function(commentId,node){return this.bind(commentId,node);},[{value:entry.commentId},{objectId:node.object.objectId}]));}catch(error){lifetime.throwIfAborted();}finally{await release(pending.cdp,node.object.objectId);}
        }
        const list=groups.get(target.frameId)??[];list.push({...entry,token:binding.token});groups.set(target.frameId,list);
      }
      for(const [frameId,pending]of state.documents){
        if(!acquired.entries.has(frameId)||acquired.entries.get(frameId).loaderId!==pending.loaderId){await restoredDocument(state,pending);state.documents.delete(frameId);await release(pending.cdp,pending.objectId);await pending.dispose?.();continue;}
        const list=groups.get(frameId)??[],projection=list.length&&options.enabled&&!options.showOriginal?await currentProjection(acquired.entries.get(frameId)):null,outcome=await read(remote(pending.cdp,pending.objectId,function(entries,options,projection){return this.update(entries,options,projection);},[{value:list},{value:options},{value:projection}]));
        for(const result of outcome.entries??[]){const status=output.find(value=>value.commentId===result.commentId);Object.assign(status,result);
          const node=await readObject(read,pending.cdp,remote(pending.cdp,pending.objectId,function(commentId){return this.node(commentId);},[{value:result.commentId}],false),value=>value?.objectId);
          try{if(node?.objectId){const {node:details}=await read(pending.cdp.send('DOM.describeNode',{objectId:node.objectId}));status.backendNodeId=details.backendNodeId;Object.assign(state.bindings.get(result.commentId),{frameId,loaderId:pending.loaderId,mainLoaderId:view.loaderId,backendNodeId:details.backendNodeId});}}
          finally{await release(pending.cdp,node?.objectId);}
        }
        if(!list.length){await restoredDocument(state,pending);state.documents.delete(frameId);await release(pending.cdp,pending.objectId);await pending.dispose?.();}
      }
      lifetime.throwIfAborted();
      for(const pending of state.documents.values()){
        const {frameTree}=await read(pending.cdp.send('Page.getFrameTree'));
        const loader=tree=>tree.frame.id===pending.frameId?tree.frame.loaderId:(tree.childFrames??[]).map(loader).find(Boolean);
        if(loader(frameTree)!==pending.loaderId)throw Object.assign(new Error('排队样式的框架文档已改变'),{code:'VIEW_NAVIGATED'});
      }
      lifetime.throwIfAborted();
      const wanted=new Set(entries.map(entry=>entry.commentId));for(const key of state.bindings.keys())if(!wanted.has(key))state.bindings.delete(key);
      for(const status of output)for(const message of status.conflicts)conflicts.push({commentId:status.commentId,message});
      const result={enabled:options.enabled,showOriginal:options.showOriginal,restored:output.every(entry=>entry.restored)&&conflicts.length===0,documentIdentity:{...identity(view),frames:[...state.documents.values()].map(pending=>({frameId:pending.frameId,loaderId:pending.loaderId}))},entries:output,conflicts};state.last=result;return result;
    }catch(error){
      const cleanup=await restoreState(state);if(!cleanup.restored)error.queuedStyleRestore=cleanup;throw error;
    }finally{if(!retained)await acquired.dispose();}
  });
}

// Call only with the server queue's internal entries. Renderer selectors,
// computed previous values and raw design-change objects are not an input API.
export async function reconcileQueuedAnnotationStyles(views,view,entries,signal,{enabled=true,showOriginal=false}={}){
  if(typeof enabled!=='boolean'||typeof showOriginal!=='boolean')throw invalid('排队样式显示状态无效');
  const normalized=normalizedEntries(entries),state=stateFor(views,view);
  return reconcileNormalized(views,view,state,normalized,signal,{enabled,showOriginal});
}

// The active server draft replaces the same saved design group and is ordered
// last, matching source Be. This projection does not save or deliver comments.
export async function reconcileAnnotationStyleProjection(views,view,entries,signal,{enabled=true,showOriginal=false,activeEntry=null}={}){
  if(typeof enabled!=='boolean'||typeof showOriginal!=='boolean'||!Array.isArray(entries))throw invalid('批注投影状态无效');
  const group=activeEntry?.comment?.localBrowserDesignChange?.group;
  if(activeEntry&&(!group||group.status!=='editing'||typeof group.id!=='string'||!group.id))throw invalid('缺少后端活动批注归属');
  const projected=activeEntry?[...entries.filter(entry=>entry.comment?.localBrowserDesignChange?.group?.id!==group.id),activeEntry]:entries;
  return reconcileNormalized(views,view,stateFor(views,view),normalizedEntries(projected,activeEntry),signal,{enabled,showOriginal});
}

export async function dropAnnotationActiveStyleProjection(view){
  const state=view.queuedAnnotationStyles;if(!state)return{dropped:false};
  return serialize(state,()=>{const active=state.entries.filter(entry=>entry.isActive);state.entries=state.entries.filter(entry=>!entry.isActive);state.activeDocument=null;for(const entry of active)state.bindings.delete(entry.commentId);return{dropped:active.length>0};});
}
