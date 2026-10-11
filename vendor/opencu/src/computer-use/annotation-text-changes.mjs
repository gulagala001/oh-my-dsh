const invalid=message=>Object.assign(new Error(message),{code:'INVALID_ANNOTATION_TEXT_CHANGE'});
const changed=()=>Object.assign(new Error('批注文字或元素已改变，请重新打开批注。'),{code:'ANNOTATION_CHANGED'});

// Source is/as: normalized direct TEXT children, with no nonempty child
// element text. This is independent of text-selection annotation anchors.
function sourceEditableText(){
  const node=this;if(!node.isConnected||node.nodeType!==1||!node.ownerDocument?.defaultView)throw Error('批注元素已离开页面');
  const value=Array.from(node.childNodes).filter(child=>child.nodeType===3).map(child=>child.textContent?.replace(/\s+/g,' ').trim()??'').join(' ').replace(/\s+/g,' ').trim();
  if(!value.length||Array.from(node.children).some(child=>(child.textContent?.replace(/\s+/g,' ').trim().length??0)>0))return null;
  return{value,previousValue:value};
}

export async function readAnnotationEditableText(read,entry,backendNodeId,signal){
  signal?.throwIfAborted();if(!entry?.cdp||!entry.frameId||!Number.isSafeInteger(backendNodeId)||backendNodeId<=0)throw changed();
  const {executionContextId}=await read(entry.cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName:'trisoul-annotation-text-change'}));
  signal?.throwIfAborted();const resolving=entry.cdp.send('DOM.resolveNode',{backendNodeId,executionContextId});let objectId;
  try{
    const response=await read(resolving);objectId=response.object?.objectId;signal?.throwIfAborted();if(!objectId)throw changed();
    const result=await read(entry.cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:sourceEditableText.toString(),returnByValue:true}));signal?.throwIfAborted();
    if(result.exceptionDetails)throw changed();const text=result.result?.value;
    if(text===null)return null;if(typeof text?.value!=='string'||text.value!==text.previousValue)throw changed();return text;
  }finally{
    if(objectId)await entry.cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{});
    else void resolving.then(response=>response.object?.objectId&&entry.cdp.send('Runtime.releaseObject',{objectId:response.object.objectId})).catch(()=>{});
  }
}
export async function readAnnotationTextChange(read,entry,backendNodeId,value,signal){
  if(typeof value!=='string')throw invalid('批注新文字必须是字符串');
  const original=await readAnnotationEditableText(read,entry,backendNodeId,signal);if(!original)throw invalid('所选元素没有可编辑的直接文字');
  return{value,previousValue:original.previousValue};
}

// Rb/zb/Hb/Vb: the last changed text group on a target wins. The CDP
// adaptation additionally owns real child objects, so restoring does not
// replace original text-node identities or overwrite another writer's DOM.
export function createAnnotationTextLedger(){
  const doc=this,records=new Map(),attribute='data-trisoul-design-original-text';
  const normalized=node=>{
    if(node.nodeType!==1||node.ownerDocument!==doc||!node.isConnected)return null;
    const value=Array.from(node.childNodes).filter(child=>child.nodeType===3).map(child=>child.textContent?.replace(/\s+/g,' ').trim()??'').join(' ').replace(/\s+/g,' ').trim();
    return!value.length||Array.from(node.children).some(child=>(child.textContent?.replace(/\s+/g,' ').trim().length??0)>0)?null:value;
  };
  const owned=(node,record)=>node.textContent===record.applied&&node.childNodes.length===record.appliedNodes.length&&record.appliedNodes.every((child,index)=>node.childNodes[index]===child);
  const attributeRestore=(node,record)=>{if(node.getAttribute(attribute)===record.marker){if(record.originalAttribute===null)node.removeAttribute(attribute);else node.setAttribute(attribute,record.originalAttribute);}};
  const restoreNode=(node,record)=>{
    if(node.ownerDocument!==doc)return{restored:false,conflicts:['text-document-changed']};
    if(!owned(node,record))return{restored:false,conflicts:['text-content-changed']};
    if(!record.mutated){attributeRestore(node,record);records.delete(node);return{restored:true,conflicts:[]};}
    if(record.originalNodes.some(child=>child.parentNode!==null))return{restored:false,conflicts:['text-original-nodes-moved']};
    if(record.originalNodes.some((child,index)=>child.textContent!==record.originalContents[index]))return{restored:false,conflicts:['text-original-nodes-changed']};
    const fragment=doc.createDocumentFragment();for(const child of record.originalNodes)fragment.appendChild(child);node.replaceChildren(fragment);
    if(node.childNodes.length!==record.originalNodes.length||record.originalNodes.some((child,index)=>node.childNodes[index]!==child)||node.textContent!==record.originalTextContent)return{restored:false,conflicts:['text-restoration-changed']};
    attributeRestore(node,record);records.delete(node);return{restored:true,conflicts:[]};
  };
  const status=(commentId,details)=>({commentId,textApplied:false,textRestored:false,conflicts:[],...details});
  const reconcile=groups=>{
    const desired=new Map(),results=[];
    for(const group of groups){
      const changes=group.changes.filter(change=>change.text!=null&&change.text.value!==change.text.previousValue);
      if(changes.length)desired.set(group.node,changes);
    }
    for(const [node,record]of records)if(!desired.has(node)){
      const result=restoreNode(node,record);for(const commentId of record.commentIds)results.push(status(commentId,{textRestored:result.restored,conflicts:result.conflicts}));
    }
    for(const [node,changes]of desired){
      const last=changes[changes.length-1];let record=records.get(node),failure;
      if(node.nodeType!==1||node.ownerDocument!==doc||!node.isConnected)failure='text-element-unresolved';
      else if(record&&!owned(node,record))failure='text-content-changed';
      else if(!record){
        const previousValue=normalized(node);
        if(previousValue===null)failure='text-element-ineligible';
        else if(previousValue!==changes[0].text.previousValue)failure='text-baseline-changed';
        else{const originalNodes=Array.from(node.childNodes);record={previousValue,originalNodes,originalContents:originalNodes.map(child=>child.textContent),originalTextContent:node.textContent,originalAttribute:node.getAttribute(attribute),marker:previousValue,applied:null,appliedNodes:[],commentIds:[],mutated:false};}
      }
      if(failure){for(const change of changes)results.push(status(change.commentId,{conflicts:[failure]}));continue;}
      if(!records.has(node)){node.setAttribute(attribute,record.marker);records.set(node,record);}
      if(node.textContent!==last.text.value){node.textContent=last.text.value;record.appliedNodes=Array.from(node.childNodes);record.mutated=true;}
      else if(record.applied===null)record.appliedNodes=Array.from(node.childNodes);
      record.applied=last.text.value;record.commentIds=changes.map(change=>change.commentId);
      for(const change of changes)results.push(status(change.commentId,{textApplied:change===last,...(change===last?{}:{textOverriddenBy:last.commentId})}));
    }
    return{entries:results,restored:records.size===0,conflicts:results.flatMap(entry=>entry.conflicts.map(message=>({commentId:entry.commentId,message})))};
  };
  return{reconcile,restore(){return reconcile([]);}};
}
