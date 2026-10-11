const printable=/^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u;
const metadataKey=/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z0-9_-]+)*$/;
const serialized=value=>value.length<=2048&&new TextEncoder().encode(value).byteLength<=2048;

// browser-page-preload Uo/Wo/Go/Ko; app-shared Jmt/Ymt/Xmt use the same
// schemas again when formatting untrusted page evidence for the model.
export function sanitizeAnnotationSiteName(value){
  return typeof value==='string'&&value.length<=128&&value.trim().length>0&&printable.test(value)?value:undefined;
}
export function sanitizeAnnotationSiteMetadata(value){
  if(typeof value!=='object'||!value)return undefined;
  try{
    const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)return undefined;
    const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
    if(keys.length>6||keys.some(key=>typeof key!=='string'||key.length>64||!metadataKey.test(key)||['__proto__','constructor','prototype'].includes(key)))return undefined;
    if(Object.values(descriptors).some(descriptor=>!descriptor.enumerable||!Object.hasOwn(descriptor,'value')))return undefined;
    const entries=Object.entries(descriptors).map(([key,descriptor])=>[key,descriptor.value]);
    if(entries.some(([,item])=>!(item===null||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item)||typeof item==='string'&&item.length<=256&&printable.test(item))))return undefined;
    const result=Object.fromEntries(entries);return serialized(JSON.stringify(result))?result:undefined;
  }catch{return undefined;}
}
export function parseAnnotationSiteMetadata(value){
  if(typeof value!=='string'||!serialized(value))return undefined;
  try{return sanitizeAnnotationSiteMetadata(JSON.parse(value));}catch{return undefined;}
}

// Zu/$u/cd/Xc: site evidence is read only on connected top-document HTML
// elements that explicitly opt in; source selectable-container flags retain
// their actual ancestor/viewport test rather than treating metadata as a flag.
function sourceSiteMetadata(){
  const node=this,doc=node.ownerDocument,win=doc?.defaultView;
  if(!node.isConnected||!win||doc!==document)throw Error('站点批注元素已改变');
  if(win.top!==win||node.namespaceURI!=='http://www.w3.org/1999/xhtml'||node===doc.body||node===doc.documentElement||!node.hasAttribute('oai-annotatable'))return{};
  for(let current=node;current!=null;current=current.parentElement){
    const style=win.getComputedStyle(current);
    if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number.parseFloat(style.opacity)===0)return{};
  }
  const box=node.getBoundingClientRect();
  if(box.width<=0||box.height<=0||typeof node.checkVisibility==='function'&&!node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return{};
  const parent=current=>{
    if(current.assignedSlot!=null)return current.assignedSlot;if(current.parentElement!=null)return current.parentElement;
    const root=current.getRootNode();return root.nodeType===11&&root.host?.shadowRoot===root?root.host:null;
  };
  let selected=null;
  for(let current=node;current?.ownerDocument===doc;current=parent(current)){
    if(current.hasAttribute('oai-annotation-container-text')){selected=null;break;}
    const root=current===doc.body||current===doc.documentElement,container=current.hasAttribute('oai-annotation-container');
    if(!root&&!container&&selected==null&&current.hasAttribute('oai-annotatable')){
      const rect=current.getBoundingClientRect();
      if([rect.left,rect.top,rect.right,rect.bottom].every(Number.isFinite)&&rect.width>0&&rect.height>0&&rect.left<win.innerWidth&&rect.right>0&&rect.top<win.innerHeight&&rect.bottom>0&&(typeof current.checkVisibility!=='function'||current.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})))selected=current;
    }
    if(container)break;
    if(parent(current)==null)selected=null;
  }
  const name=node.getAttribute('oai-annotatable'),metadata=node.getAttribute('oai-annotation-metadata');
  return{name:name!=null&&name.length<=128?name:null,
    metadata:metadata!=null&&metadata.length<=2048&&new TextEncoder().encode(metadata).byteLength<=2048?metadata:null,
    annotationFeatures:selected===node?['selectable-containers']:[]};
}

export async function readAnnotationSiteMetadata(read,entry,backendNodeId,{enabled=false}={},signal){
  signal?.throwIfAborted();
  if(enabled!==true||entry?.owner)return{};
  if(!entry?.cdp||!entry.frameId||!Number.isSafeInteger(backendNodeId)||backendNodeId<=0)throw Object.assign(new Error('站点批注元素已改变'),{code:'ANNOTATION_CHANGED'});
  const {executionContextId}=await read(entry.cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName:'trisoul-annotation-site-metadata'}));signal?.throwIfAborted();
  const resolving=entry.cdp.send('DOM.resolveNode',{backendNodeId,executionContextId});let objectId;
  try{
    const resolved=await read(resolving);objectId=resolved.object?.objectId;signal?.throwIfAborted();if(!objectId)throw Error('站点批注元素已改变');
    const response=await read(entry.cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:sourceSiteMetadata.toString(),returnByValue:true}));signal?.throwIfAborted();
    if(response.exceptionDetails||!response.result?.value)throw Error('站点批注元素已改变');
    const value=response.result.value,elementName=sanitizeAnnotationSiteName(value.name),elementMetadata=parseAnnotationSiteMetadata(value.metadata);
    return{...(Array.isArray(value.annotationFeatures)?{annotationFeatures:value.annotationFeatures}:{}),...(elementName===undefined?{}:{elementName}),...(elementMetadata===undefined?{}:{elementMetadata})};
  }finally{
    if(objectId)await entry.cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{});
    else void resolving.then(response=>response.object?.objectId&&entry.cdp.send('Runtime.releaseObject',{objectId:response.object.objectId})).catch(()=>{});
  }
}
