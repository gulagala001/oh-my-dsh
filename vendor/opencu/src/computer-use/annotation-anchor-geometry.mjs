const changed=()=>Object.assign(new Error('批注元素或框架几何已改变，请重新打开批注。'),{code:'ANNOTATION_CHANGED'});

// browser-page-preload H/Ic/Zs/Bc/Lc/xc/Sc/Cc/Tc/$u/cd. All selectors and
// geometry here are derived from the protocol-resolved live element.
function sourceNodeGeometry(mode,isTopDocument){
  const node=this,doc=node.ownerDocument,win=doc?.defaultView;
  if(!node.isConnected||!win||doc!==document)throw Error('批注元素已离开框架');
  const element=value=>{
    if(typeof value!=='object'||!value)return false;
    const owner=value.ownerDocument?.defaultView,html=owner?.HTMLElement??(typeof HTMLElement==='undefined'?null:HTMLElement);
    if(html!=null&&value instanceof html)return true;
    const NodeClass=owner?.Node??(typeof Node==='undefined'?null:Node);
    return NodeClass!=null&&value.nodeType===NodeClass.ELEMENT_NODE&&value.ownerDocument!=null&&typeof value.getBoundingClientRect==='function'&&typeof value.tagName==='string';
  };
  if(!element(node))throw Error('批注节点不是元素');
  const box=node.getBoundingClientRect(),viewportRect={x:box.left,y:box.top,width:box.width,height:box.height};
  if(mode==='frame-owner'){
    const FrameClass=win.HTMLIFrameElement;
    if(!(FrameClass!=null&&node instanceof FrameClass||node.tagName?.toLowerCase()==='iframe'&&'contentWindow'in node))throw Error('框架宿主已改变');
    return{viewportRect};
  }
  const openShadow=root=>root.nodeType===11&&'host'in root&&element(root.host)&&root.host.shadowRoot===root;
  const parent=current=>current.assignedSlot??current.parentElement??(openShadow(current.getRootNode())?current.getRootNode().host:null);
  for(let current=node;current!=null;current=current.parentElement){
    const style=win.getComputedStyle(current);
    if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number.parseFloat(style.opacity)===0)throw Error('批注元素不可见');
  }
  if(box.width<=0||box.height<=0||typeof node.checkVisibility==='function'&&!node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))throw Error('批注元素不可见');
  const escape=value=>typeof win.CSS!=='undefined'&&typeof win.CSS.escape==='function'?win.CSS.escape(value):value.replace(/[^a-zA-Z0-9_-]/g,'\\$&');
  const unique=(current,selector)=>{const root=current.getRootNode();if(root.nodeType!==9&&!(root.nodeType===11&&'querySelectorAll'in root))return false;const nodes=root.querySelectorAll(selector);return nodes.length===1&&nodes[0]===current;};
  const selectorPart=current=>{
    const parts=[];let ancestor=current;
    for(;ancestor!=null;ancestor=ancestor.parentElement){
      let value=ancestor.tagName.toLowerCase();const tag=ancestor.tagName;
      if(ancestor.id){value+='#'+escape(ancestor.id);const selector=[value,...parts].join(' > ');if(unique(current,selector))return selector;}
      const classes=Array.from(ancestor.classList).filter(value=>/^[a-zA-Z0-9_-]+$/.test(value)).slice(0,2);
      if(classes.length)value+='.'+classes.map(escape).join('.');
      if(ancestor.parentElement){const siblings=Array.from(ancestor.parentElement.children).filter(value=>element(value)&&value.tagName===tag);if(siblings.length>1)value+=':nth-of-type('+(siblings.indexOf(ancestor)+1)+')';}
      parts.unshift(value);const selector=parts.join(' > ');if(unique(current,selector))return selector;
    }
    return null;
  };
  const selector=current=>{
    const parts=[];
    for(;;){const part=selectorPart(current);if(part==null)return null;parts.unshift(part);const root=current.getRootNode();if(root.nodeType===9)break;if(!openShadow(root))return null;current=root.host;}
    return parts.length===1?parts[0]:'shadow:'+parts.join('>>>');
  };
  let isFixed=false;
  if(isTopDocument)for(let current=node;current&&current!==doc.body;current=parent(current)){
    const position=win.getComputedStyle(current).position;if(position==='fixed'||position==='sticky'){isFixed=true;break;}
  }
  const scrollContainers=[];
  for(let current=parent(node);current!=null&&current!==doc.body&&current!==doc.documentElement;current=parent(current)){
    const style=win.getComputedStyle(current);
    if([style.overflow,style.overflowX,style.overflowY].some(value=>['auto','scroll','overlay','clip','hidden'].includes(value))){
      const value=selector(current);if(value!=null)scrollContainers.push({selector:value,scrollLeft:current.scrollLeft,scrollTop:current.scrollTop});
    }
  }
  return{viewportRect,isFixed,scrollContainers};
}

async function nodeGeometry(read,entry,backendNodeId,mode,isTopDocument,signal){
  const observe=async operation=>{signal?.throwIfAborted();const result=await read(operation);signal?.throwIfAborted();return result;};
  const {executionContextId}=await observe(entry.cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName:'trisoul-annotation-anchor-geometry'}));
  const resolving=entry.cdp.send('DOM.resolveNode',{backendNodeId,executionContextId});let objectId;
  try{
    const resolved=await observe(resolving);objectId=resolved.object?.objectId;if(!objectId)throw changed();
    const response=await observe(entry.cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:sourceNodeGeometry.toString(),arguments:[{value:mode},{value:isTopDocument}],returnByValue:true}));
    const value=response.result?.value,rect=value?.viewportRect;
    if(response.exceptionDetails||!rect||!['x','y','width','height'].every(key=>Number.isFinite(rect[key])))throw changed();
    return value;
  }finally{
    if(objectId)await entry.cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{});
    else void resolving.then(response=>response.object?.objectId&&entry.cdp.send('Runtime.releaseObject',{objectId:response.object.objectId})).catch(()=>{});
  }
}

// Yu/$u/kc store element rects in top viewport coordinates, adding top scrollY
// only for non-fixed anchors. kc uses owner BCR translation, without scaling.
export async function readAnnotationAnchorGeometry(read,entry,backendNodeId,{entries}={},signal){
  signal?.throwIfAborted();
  if(!entry?.cdp||!entry.frameId||!Number.isSafeInteger(backendNodeId)||backendNodeId<=0)throw changed();
  const local=await nodeGeometry(read,entry,backendNodeId,'element',!entry.owner,signal);
  let offsetX=0,offsetY=0,top=entry;const visited=new Set([entry.frameId]);
  while(top.owner){
    const owner=top.owner,parent=entries?.get(owner.frameId);
    if(!parent?.cdp||visited.has(parent.frameId))throw changed();visited.add(parent.frameId);
    const geometry=await nodeGeometry(read,parent,owner.backendNodeId,'frame-owner',false,signal);
    offsetX+=geometry.viewportRect.x;offsetY+=geometry.viewportRect.y;top=parent;
  }
  let scrollY=0;
  if(!local.isFixed){
    const world=await read(top.cdp.send('Page.createIsolatedWorld',{frameId:top.frameId,worldName:'trisoul-annotation-anchor-geometry'}));signal?.throwIfAborted();
    const response=await read(top.cdp.send('Runtime.evaluate',{contextId:world.executionContextId,expression:'window.scrollY',returnByValue:true}));signal?.throwIfAborted();
    if(response.exceptionDetails||!Number.isFinite(response.result?.value))throw changed();scrollY=response.result.value;
  }
  const rect=local.viewportRect;
  return{rect:{x:rect.x+offsetX,y:rect.y+offsetY+scrollY,width:rect.width,height:rect.height},isFixed:local.isFixed,
    ...(local.scrollContainers.length?{scrollContainers:local.scrollContainers}:{})};
}
