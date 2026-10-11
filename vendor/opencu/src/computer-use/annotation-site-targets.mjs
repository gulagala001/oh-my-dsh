const attributes=['oai-annotation-container','oai-annotation-container-text','oai-annotatable'];
const changed=()=>Object.assign(new Error('站点批注目标或框架文档已改变，请重新采集。'),{code:'ANNOTATION_CHANGED'});
const key=(entry,backendNodeId)=>entry.frameId+':'+backendNodeId;
const ordinary=mappedKey=>({kind:'ordinary',mappedKey,disabled:false,usesSelectableContainer:false,candidates:[]});

// Source Xc: point filtering preserves nearest-to-farthest candidate order.
// This export is intentionally browser-safe and shared by the renderer.
export function resolveAnnotationSiteTarget(plan,point){
  if(!plan)return undefined;
  if(plan.disabled||plan.kind==='text-container')return null;
  if(plan.kind==='ordinary')return plan.mappedKey;
  if(plan.kind!=='container')return null;
  if(point!==undefined&&(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)))return null;
  const candidate=(plan.candidates??[]).find(value=>{
    if(point===undefined)return true;
    const rect=value.viewportRect;
    return rect&&point.x>=rect.x&&point.x<=rect.x+rect.width&&point.y>=rect.y&&point.y<=rect.y+rect.height;
  });
  return candidate?.key??plan.fallbackKey??null;
}

function sourceSiteNode(){
  const node=this,doc=node.ownerDocument,win=doc?.defaultView;
  if(node.nodeType!==1||!node.isConnected||doc!==document||!win)throw Error('站点批注节点已离开文档');
  const rect=node.getBoundingClientRect(),container=node.hasAttribute('oai-annotation-container'),textContainer=node.hasAttribute('oai-annotation-container-text'),annotatable=node.hasAttribute('oai-annotatable');
  // Source Xc reads the actual BCR and checkVisibility, not computed snapshot
  // dimensions or attribute values interpreted as booleans.
  const eligible=annotatable&&!container&&node!==doc.body&&node!==doc.documentElement&&
    [rect.left,rect.top,rect.right,rect.bottom].every(Number.isFinite)&&rect.width>0&&rect.height>0&&rect.left<win.innerWidth&&rect.right>0&&rect.top<win.innerHeight&&rect.bottom>0&&
    (typeof node.checkVisibility!=='function'||node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
  return{container,textContainer,annotatable,eligible,viewportRect:{x:rect.left,y:rect.top,width:rect.width,height:rect.height}};
}

async function readSiteNode(read,entry,backendNodeId,worlds,signal){
  signal?.throwIfAborted();let world=worlds.get(entry.frameId);
  if(!world){world=await read(entry.cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName:'trisoul-annotation-site-targets'}));worlds.set(entry.frameId,world);}
  const resolving=entry.cdp.send('DOM.resolveNode',{backendNodeId,executionContextId:world.executionContextId});let objectId;
  try{
    const response=await read(resolving);objectId=response.object?.objectId;if(!objectId)throw changed();
    const result=await read(entry.cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:sourceSiteNode.toString(),returnByValue:true}));
    signal?.throwIfAborted();const value=result.result?.value;
    if(result.exceptionDetails||!value||!['container','textContainer','annotatable','eligible'].every(name=>typeof value[name]==='boolean')||!['x','y','width','height'].every(name=>Number.isFinite(value.viewportRect?.[name])))throw changed();
    return value;
  }finally{
    if(objectId)await entry.cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{});
    else void resolving.then(response=>response.object?.objectId&&entry.cdp.send('Runtime.releaseObject',{objectId:response.object.objectId})).catch(()=>{});
  }
}

function snapshotHasFeatures(entry){
  return(entry.document.nodes.attributes??[]).some(values=>(values??[]).some((index,position)=>position%2===0&&attributes.includes(entry.strings[index])));
}

async function documentGraph(read,entry,signal){
  const documentIndex=entry.document.nodes.nodeType.findIndex(value=>value===9),backendNodeId=entry.document.nodes.backendNodeId[documentIndex];
  if(!Number.isSafeInteger(backendNodeId)||backendNodeId<=0)throw changed();
  const result=await read(entry.cdp.send('DOM.describeNode',{backendNodeId,depth:-1,pierce:true}));signal?.throwIfAborted();
  if(result.node?.backendNodeId!==backendNodeId||result.node.nodeType!==9)throw changed();
  const nodes=new Map(),distributed=new Map();let documentElement;
  const walk=(node,parent,accessible=true)=>{
    if(node.nodeType===1){
      const flags=new Set();for(let index=0;index<(node.attributes?.length??0);index+=2)if(attributes.includes(node.attributes[index]))flags.add(node.attributes[index]);
      nodes.set(node.backendNodeId,{backendNodeId:node.backendNodeId,parent,assignedSlot:node.assignedSlot?.backendNodeId,flags,accessible});
      for(const value of node.distributedNodes??[])distributed.set(value.backendNodeId,node.backendNodeId);
      if(parent===null&&documentElement===undefined&&accessible)documentElement=node.backendNodeId;
    }
    const next=node.nodeType===1?node.backendNodeId:parent;
    for(const child of node.children??[])walk(child,next,accessible);
    for(const root of node.shadowRoots??[])walk(root,root.shadowRootType==='open'?node.backendNodeId:null,accessible&&root.shadowRootType==='open');
    for(const pseudo of node.pseudoElements??[])walk(pseudo,next,accessible);
  };
  // Content documents have their own protocol identity and are handled through
  // annotationDocuments; they never inherit an ordinary DOM parent here.
  walk(result.node,null);
  for(const node of nodes.values()){
    const slot=node.assignedSlot??distributed.get(node.backendNodeId);
    if(slot!==undefined&&nodes.get(slot)?.accessible)node.parent=slot;
  }
  if(!Number.isSafeInteger(documentElement))throw changed();return{entry,nodes,documentElement,metadata:new Map()};
}

// Read only from the actual documents used by captureAnnotation. The caller
// fences this read, geometry and screenshot with its final DOM signature.
export async function readAnnotationSiteTargets(read,documents,elements,signal){
  signal?.throwIfAborted();const entries=documents.entries,top=[...entries.values()].find(entry=>!entry.owner);
  if(!top)throw changed();
  if(![...entries.values()].some(snapshotHasFeatures))return new Map(elements.map(element=>[element.key,ordinary(element.key)]));
  const graphs=new Map(),worlds=new Map(),offsets=new Map();
  for(const entry of entries.values())graphs.set(entry.frameId,await documentGraph(read,entry,signal));
  const rootKey=key(top,graphs.get(top.frameId).documentElement);
  const nodeMetadata=async(entry,backendNodeId)=>{
    const graph=graphs.get(entry.frameId);if(!graph)throw changed();
    if(graph.metadata.has(backendNodeId))return graph.metadata.get(backendNodeId);
    const value=await readSiteNode(read,entry,backendNodeId,worlds,signal),node=graph.nodes.get(backendNodeId);if(!node)throw changed();
    if(value.container!==node.flags.has(attributes[0])||value.textContainer!==node.flags.has(attributes[1])||value.annotatable!==node.flags.has(attributes[2]))throw changed();
    graph.metadata.set(backendNodeId,value);return value;
  };
  const offset=async entry=>{
    if(offsets.has(entry.frameId))return offsets.get(entry.frameId);
    let value={x:0,y:0};
    if(entry.owner){
      const parent=entries.get(entry.owner.frameId);if(!parent)throw changed();
      const base=await offset(parent),owner=await nodeMetadata(parent,entry.owner.backendNodeId);
      value={x:base.x+owner.viewportRect.x,y:base.y+owner.viewportRect.y};
    }
    offsets.set(entry.frameId,value);return value;
  };
  for(const entry of entries.values())await offset(entry);
  for(const graph of graphs.values())for(const node of graph.nodes.values())if(node.flags.has(attributes[2]))await nodeMetadata(graph.entry,node.backendNodeId);
  const planFor=(entry,backendNodeId)=>{
    const graph=graphs.get(entry.frameId),frameOffset=offsets.get(entry.frameId),candidates=[],seen=new Set();let current=backendNodeId;
    while(current!==null&&current!==undefined){
      if(seen.has(current))throw changed();seen.add(current);
      const node=graph?.nodes.get(current);if(!node)throw changed();
      // Source Yc/Xc: a text container wins before a regular container and
      // terminates this document's composed parent chain.
      if(node.flags.has(attributes[1]))return{kind:'text-container',mappedKey:null,disabled:true,usesSelectableContainer:false,textContainerKey:key(entry,current),candidates:[]};
      if(!node.flags.has(attributes[0])&&node.flags.has(attributes[2])){
        const value=graph.metadata.get(current);if(!value)throw changed();
        if(value.eligible)candidates.push({key:key(entry,current),viewportRect:{...value.viewportRect,x:value.viewportRect.x+frameOffset.x,y:value.viewportRect.y+frameOffset.y}});
      }
      if(node.flags.has(attributes[0]))return{kind:'container',mappedKey:candidates[0]?.key??rootKey,disabled:false,usesSelectableContainer:true,containerKey:key(entry,current),candidates,fallbackKey:rootKey};
      current=node.parent;
    }
    return ordinary(key(entry,backendNodeId));
  };
  const outerPlans=new Map();
  for(const entry of entries.values()){
    const chain=[];let child=entry;
    while(child.owner){const parent=entries.get(child.owner.frameId);if(!parent)throw changed();chain.unshift({entry:parent,backendNodeId:child.owner.backendNodeId});child=parent;}
    // Source nc/ol examines frame owners outside-in before entering a child.
    for(const owner of chain){const plan=planFor(owner.entry,owner.backendNodeId);if(plan.kind!=='ordinary'){outerPlans.set(entry.frameId,{...plan,viaFrameOwner:true,ruleFrameId:owner.entry.frameId});break;}}
  }
  signal?.throwIfAborted();return new Map(elements.map(element=>{
    const entry=entries.get(element.frameId);if(!entry)throw changed();
    return[element.key,outerPlans.get(element.frameId)??{...planFor(entry,element.backendNodeId),ruleFrameId:entry.frameId}];
  }));
}
