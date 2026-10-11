const changed=()=>Object.assign(new Error('文档或所选元素已改变，请重新打开批注。'),{code:'ANNOTATION_CHANGED'});

// browser-page-preload cs/fs/ps/ds: Docs document URLs, including published
// documents, and query-first tab identity. Sheets do not get this context.
function documentIdentity(pageUrl){
  let url;try{url=new URL(pageUrl);}catch{return null;}
  if(url.hostname!=='docs.google.com')return null;
  const parts=url.pathname.split('/').filter(value=>value.length>0),documentIndex=parts.indexOf('document');
  const idIndex=documentIndex===-1?-1:parts.indexOf('d',documentIndex+1),id=idIndex===-1?undefined:parts[idIndex+1];
  const documentId=id==='e'&&parts[idIndex+3]==='pub'?parts[idIndex+2]:id;
  if(documentId==null||documentId.length===0)return null;
  const tabId=normalize(url.searchParams.get('tab'))??normalize(new URLSearchParams(url.hash.startsWith('#')?url.hash.slice(1):url.hash).get('tab'));
  return{documentId,tabId};
}

function normalize(value){
  const text=value?.replace(/\s+/g,' ').trim();
  return text==null||text.length===0?undefined:text;
}

// browser-page-preload Ml/Nl/Pl/Fl/Ll/W/Rl/Vl. This function is serialized
// into the actual frame's isolated world; it only reads live DOM state.
function sourceWindowContext(kind,viewportRect){
  const doc=this?.ownerDocument??document,win=doc.defaultView;
  if(!win||this?.ownerDocument&&!this.isConnected)throw Error('文档或所选元素已改变');
  const text=value=>{const result=(value??'').replace(/\s+/g,' ').trim();return result.length===0?null:result.slice(0,2000);};
  const htmlElement=element=>element!=null&&element instanceof(element.ownerDocument.defaultView?.HTMLElement??HTMLElement);
  const selection=()=>{
    try{
      const selected=text(win.getSelection()?.toString());if(selected!=null)return selected;
      const element=doc.activeElement,input=win.HTMLInputElement,textarea=win.HTMLTextAreaElement;
      if(!htmlElement(element)||!(input!=null&&element instanceof input||textarea!=null&&element instanceof textarea))return null;
      const start=element.selectionStart,end=element.selectionEnd;
      return start==null||end==null||end<=start?null:text(element.value.slice(start,end));
    }catch{return null;}
  };
  const selectedText=selection();
  let visibleText=null;
  if(kind==='region'&&doc.body){
    const visible=element=>{
      if(element.closest("script,style,noscript,template,[hidden],[aria-hidden='true']")!=null)return false;
      const style=(element.ownerDocument.defaultView??win).getComputedStyle(element);
      return style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0';
    };
    const intersects=rect=>rect.right>=viewportRect.x&&rect.left<=viewportRect.x+viewportRect.width&&rect.bottom>=viewportRect.y&&rect.top<=viewportRect.y+viewportRect.height;
    const walker=doc.createTreeWalker(doc.body,4,{acceptNode:node=>text(node.textContent)==null||!htmlElement(node.parentElement)||!visible(node.parentElement)?2:1});
    let result='',node=walker.nextNode();
    for(;node!=null;node=walker.nextNode()){
      const value=text(node.textContent);if(value==null)continue;
      const range=doc.createRange();range.selectNodeContents(node);
      if(Array.from(range.getClientRects()).some(intersects)){
        result=result.length===0?value:result+' '+value;
        if(result.length>=2000)break;
      }
    }
    visibleText=text(result);
  }
  return{documentTitle:doc.title,selectedText,visibleText};
}

async function windowContext(read,entry,kind,viewportRect,backendNodeId,signal){
  const observe=async operation=>{signal?.throwIfAborted();const result=await read(operation);signal?.throwIfAborted();return result;};
  const {executionContextId}=await observe(entry.cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName:'trisoul-annotation-document-context'}));
  const argumentsByValue=[{value:kind},{value:viewportRect??null}];
  if(backendNodeId===undefined){
    const expression='('+sourceWindowContext.toString()+').call(null,'+JSON.stringify(kind)+','+JSON.stringify(viewportRect??null)+')';
    const response=await observe(entry.cdp.send('Runtime.evaluate',{contextId:executionContextId,expression,returnByValue:true}));
    if(response.exceptionDetails||!response.result?.value)throw changed();
    return response.result.value;
  }
  const resolving=entry.cdp.send('DOM.resolveNode',{backendNodeId,executionContextId});let objectId;
  try{
    const response=await observe(resolving);objectId=response.object?.objectId;if(!objectId)throw changed();
    const result=await observe(entry.cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:sourceWindowContext.toString(),arguments:argumentsByValue,returnByValue:true}));
    if(result.exceptionDetails||!result.result?.value)throw changed();
    return result.result.value;
  }finally{
    if(objectId)await entry.cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{});
    else void resolving.then(response=>response.object?.objectId&&entry.cdp.send('Runtime.releaseObject',{objectId:response.object.objectId})).catch(()=>{});
  }
}

// entry is the actual selected frame, fallbackEntry the actual top document.
// Region rectangles are CSS viewport coordinates local to entry's frame.
export async function readAnnotationDocumentContext(read,entry,{pageUrl,kind,backendNodeId,viewportRect,fallbackEntry=entry},signal){
  signal?.throwIfAborted();
  const identity=documentIdentity(pageUrl);if(identity===null)return undefined;
  if(!['element','region'].includes(kind)||!entry?.cdp||!entry.frameId||!fallbackEntry?.cdp||!fallbackEntry.frameId)throw changed();
  if(kind==='element'&&(!Number.isSafeInteger(backendNodeId)||backendNodeId<=0))throw changed();
  if(kind==='region'&&(!viewportRect||!['x','y','width','height'].every(key=>Number.isFinite(viewportRect[key]))||viewportRect.width<0||viewportRect.height<0))throw changed();
  const selected=await windowContext(read,entry,kind,viewportRect,kind==='element'?backendNodeId:undefined,signal);
  const sameDocument=entry.cdp===fallbackEntry.cdp&&entry.frameId===fallbackEntry.frameId;
  const fallback=sameDocument?selected:await windowContext(read,fallbackEntry,'element',undefined,undefined,signal);
  signal?.throwIfAborted();
  return{provider:'google-docs',kind:'google-docs',documentId:identity.documentId,tabId:identity.tabId,
    documentTitle:normalize(fallback.documentTitle),selectedText:normalize(selected.selectedText??fallback.selectedText),visibleText:normalize(selected.visibleText)};
}
