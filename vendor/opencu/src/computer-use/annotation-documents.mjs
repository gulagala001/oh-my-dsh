// Each acquisition owns its child CDP sessions. A process swap cannot reuse an
// obsolete child session, and model AX/element bindings remain untouched.
export async function annotationDocuments(views,view,options,signal){
  const record={...view.record,frames:new Map()},read=p=>views.read(view,p,signal);
  const dispose=async()=>{await Promise.allSettled([...new Set(record.frames.values())].filter(cdp=>cdp!==view.cdp).map(cdp=>cdp.detach()));};
  try{
    const bindings=await read(views.browser.frameBindings(record)),byFrame=new Map(bindings.map(b=>[b.frame,b]));
    const sessions=[...new Set(bindings.map(b=>b.cdp))],snapshots=await Promise.all(sessions.map(async cdp=>{
      const [dom,{frameTree}]=await Promise.all([read(cdp.send('DOMSnapshot.captureSnapshot',options)),read(cdp.send('Page.getFrameTree'))]);
      const loaders={};const walk=tree=>{loaders[tree.frame.id]=tree.frame.loaderId;for(const child of tree.childFrames??[])walk(child);};walk(frameTree);
      return{cdp,dom,rootId:frameTree.frame.id,loaders};
    }));
    const entries=new Map();
    for(const binding of bindings){
      const snapshot=snapshots.find(s=>s.cdp===binding.cdp),document=snapshot.dom.documents.find(d=>snapshot.dom.strings[d.frameId]===binding.frameId);
      if(!document)throw new Error('框架文档已改变，请重新采集');
      entries.set(binding.frameId,{...binding,document,strings:snapshot.dom.strings,rootId:snapshot.rootId,loaderId:snapshot.loaders[binding.frameId]});
    }
    await Promise.all([...entries.values()].map(async entry=>{
      const {executionContextId}=await read(entry.cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName:'trisoul-annotation-observation'}));
      const observed=await read(entry.cdp.send('Runtime.evaluate',{contextId:executionContextId,expression:'({width:innerWidth,height:innerHeight,scrollX,scrollY})',returnByValue:true}));
      if(observed.exceptionDetails||!observed.result.value||!['width','height','scrollX','scrollY'].every(key=>Number.isFinite(observed.result.value[key])))throw new Error('框架视口不可读取');
      entry.viewport=observed.result.value;
      const parent=byFrame.get(entry.frame.parentFrame());if(!parent)return;
      const {backendNodeId}=await read(parent.cdp.send('DOM.getFrameOwner',{frameId:entry.frameId}));
      const box=await read(parent.cdp.send('DOM.getBoxModel',{backendNodeId})).catch(error=>{if(/Could not compute box model/.test(error.message))return null;throw error;});
      entry.owner={frameId:parent.frameId,rootId:snapshots.find(s=>s.cdp===parent.cdp).rootId,backendNodeId,quad:box?.model.content??null};
    }));
    const signature={snapshots:snapshots.map(s=>({rootId:s.rootId,loaders:s.loaders,dom:s.dom})).sort((a,b)=>a.rootId.localeCompare(b.rootId)),frames:[...entries.values()].map(e=>({id:e.frameId,viewport:e.viewport,owner:e.owner})).sort((a,b)=>a.id.localeCompare(b.id))};
    return{entries,signature,dispose};
  }catch(error){await dispose();throw error;}
}

// Cleanup uses fresh, trusted protocol identities even if a frame swapped
// processes. Page JavaScript cannot forge proof that its document navigated.
export async function annotationFrameLoader(views,view,frame,frameId){
  let cdp;
  try{
    for(let target=frame;target&&!cdp;target=target.parentFrame()){
      try{cdp=await view.record.page.context().newCDPSession(target);}
      catch(error){if(!error.message.includes('part of the parent frame'))throw error;}
    }
    if(!cdp)return null;
    const {frameTree}=await cdp.send('Page.getFrameTree');
    const find=tree=>tree.frame.id===frameId?tree.frame.loaderId:(tree.childFrames??[]).map(find).find(Boolean);
    return find(frameTree)??null;
  }finally{await cdp?.detach().catch(()=>{});}
}
