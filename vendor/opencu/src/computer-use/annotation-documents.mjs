// Blink DOMSnapshot bounds/text boxes use layout physical document coordinates.
// Page's paired visual metrics expose LayoutZoomFactor (density + browser zoom,
// excluding pinch zoom). DOM offset/client/scrollRects already use CSS pixels.
function snapshotCssScale(metrics){
  const physical=metrics.visualViewport,css=metrics.cssVisualViewport;
  if(!physical||!css||![physical.clientWidth,physical.clientHeight,css.clientWidth,css.clientHeight].every(value=>Number.isFinite(value)&&value>0))throw new Error('框架布局坐标比例不可读取');
  const x=css.clientWidth/physical.clientWidth,y=css.clientHeight/physical.clientHeight;
  if(Math.abs(x-y)>1e-6*Math.max(x,y))throw new Error('框架布局坐标比例不一致，请重新采集');
  return x;
}

function cssSnapshot(dom,scale){
  const rectangles=values=>values?.map(rect=>rect.map(value=>value*scale));
  return{...dom,documents:dom.documents.map(document=>({
    ...document,
    ...Object.fromEntries(['scrollOffsetX','scrollOffsetY','contentWidth','contentHeight'].filter(key=>document[key]!==undefined).map(key=>[key,document[key]*scale])),
    layout:{...document.layout,bounds:rectangles(document.layout.bounds)},
    ...(document.textBoxes?{textBoxes:{...document.textBoxes,bounds:rectangles(document.textBoxes.bounds)}}:{}),
  }))};
}

// Each acquisition owns its child CDP sessions. A process swap cannot reuse an
// obsolete child session, and model AX/element bindings remain untouched.
export async function annotationDocuments(views,view,options,signal){
  const record={...view.record,frames:new Map()},read=p=>views.read(view,p,signal);
  let disposed=false;const detached=new Set();
  const dispose=async()=>{disposed=true;await Promise.allSettled([...new Set(record.frames.values())].filter(cdp=>cdp!==view.cdp&&!detached.has(cdp)).map(cdp=>{detached.add(cdp);return cdp.detach();}));};
  try{
    const acquiring=views.browser.frameBindings(record);
    // read may abort before frameBindings finishes attaching child sessions.
    const cleanup=()=>{if(disposed)void dispose();};acquiring.then(cleanup,cleanup);
    const bindings=await read(acquiring),byFrame=new Map(bindings.map(b=>[b.frame,b]));
    const sessions=[...new Set(bindings.map(b=>b.cdp))],snapshots=await Promise.all(sessions.map(async cdp=>{
      const [raw,{frameTree},metrics]=await Promise.all([read(cdp.send('DOMSnapshot.captureSnapshot',options)),read(cdp.send('Page.getFrameTree')),read(cdp.send('Page.getLayoutMetrics'))]);
      const coordinateScale=snapshotCssScale(metrics),dom=cssSnapshot(raw,coordinateScale);
      const loaders={};const walk=tree=>{loaders[tree.frame.id]=tree.frame.loaderId;for(const child of tree.childFrames??[])walk(child);};walk(frameTree);
      return{cdp,dom,rootId:frameTree.frame.id,loaders,coordinateScale};
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
      // getBoxModel adjusts absolute zoom and already returns CSS quads in the
      // parent CDP session's local-root viewport. Do not scale them as snapshots.
      entry.owner={frameId:parent.frameId,rootId:snapshots.find(s=>s.cdp===parent.cdp).rootId,backendNodeId,quad:box?.model.content??null};
    }));
    const signature={snapshots:snapshots.map(s=>({rootId:s.rootId,loaders:s.loaders,coordinateScale:s.coordinateScale,dom:s.dom})).sort((a,b)=>a.rootId.localeCompare(b.rootId)),frames:[...entries.values()].map(e=>({id:e.frameId,viewport:e.viewport,owner:e.owner})).sort((a,b)=>a.id.localeCompare(b.id))};
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
