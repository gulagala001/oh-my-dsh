const changed=()=>Object.assign(new Error('文字选择或页面已经改变，请重新选择。'),{code:'ANNOTATION_CHANGED'});

// browser-page-preload Zl/Ql/eu, Jl/Yl, uu/vu and xu. This executes in the
// top document's isolated world and follows only source-accessible frames.
function sourceTextSelection(savedAnchor){
  const topWindow=window;
  const html=value=>{if(typeof value!=='object'||!value)return false;const owner=value.ownerDocument?.defaultView;return owner?.HTMLElement!=null&&value instanceof owner.HTMLElement||owner?.Node!=null&&value.nodeType===owner.Node.ELEMENT_NODE&&value.ownerDocument!=null&&typeof value.getBoundingClientRect==='function'&&typeof value.tagName==='string';};
  const iframe=value=>{const owner=value?.ownerDocument?.defaultView;return value!=null&&(owner?.HTMLIFrameElement!=null&&value instanceof owner.HTMLIFrameElement||value.tagName?.toLowerCase()==='iframe'&&'contentWindow'in value);};
  const shadow=root=>root?.nodeType===11&&'host'in root&&html(root.host);
  const openShadow=root=>shadow(root)&&root.host.shadowRoot===root;
  const parent=node=>node.assignedSlot??node.parentElement??(openShadow(node.getRootNode())?node.getRootNode().host:null);
  const accessibleFrame=node=>{if(!iframe(node))return null;try{return node.contentWindow?.document!=null?node.contentWindow:null;}catch{return null;}};
  const selectorPart=(node,requireUnique=false)=>{
    const unique=value=>{const found=node.getRootNode().querySelectorAll(value);return found.length===1&&found[0]===node;};
    const escape=value=>node.ownerDocument.defaultView.CSS.escape(value),parts=[];
    for(let current=node,depth=0;current!=null&&(requireUnique||depth<4);current=current.parentElement,depth++){
      let value=current.tagName.toLowerCase();
      if(current.id){const candidate=[value+'#'+escape(current.id),...parts].join(' > ');if(!requireUnique||unique(candidate))return candidate;}
      const classes=Array.from(current.classList).filter(value=>/^[a-zA-Z0-9_-]+$/.test(value)).slice(0,2);if(classes.length)value+='.'+classes.map(escape).join('.');
      if(current.parentElement){const siblings=Array.from(current.parentElement.children).filter(value=>html(value)&&value.tagName===current.tagName);if(siblings.length>1)value+=':nth-of-type('+(siblings.indexOf(current)+1)+')';}
      parts.unshift(value);const candidate=parts.join(' > ');if(requireUnique&&unique(candidate))return candidate;
    }
    return requireUnique||parts.length===0?null:parts.join(' > ');
  };
  const selector=node=>{const parts=[];for(;;){const part=selectorPart(node,true);if(part==null)return null;parts.unshift(part);const root=node.getRootNode();if(root.nodeType===9)break;if(!openShadow(root))return null;node=root.host;}return parts.length===1?parts[0]:'shadow:'+parts.join('>>>');};
  const query=(doc,value)=>{const parts=value.startsWith('shadow:')?value.slice(7).split('>>>'):[value];let root=doc;for(const [index,part]of parts.entries()){const node=root.querySelector(part);if(index===parts.length-1)return html(node)?node:null;if(!html(node)||node.shadowRoot==null)return null;root=node.shadowRoot;}return null;};
  const deepActive=doc=>{let node=doc.activeElement;while(node?.shadowRoot?.activeElement!=null)node=node.shadowRoot.activeElement;return node;};
  const privateText=(node,win)=>{const value=win.getComputedStyle(node).getPropertyValue('-webkit-text-security');return value.length>0&&value!=='none';};
  const privateRange=(range,win)=>{const root=range.commonAncestorContainer;if(root.nodeType===3)return root.parentElement!=null&&privateText(root.parentElement,win);const walker=win.document.createTreeWalker(root,4);for(let node=walker.nextNode();node!=null;node=walker.nextNode())if(range.intersectsNode(node)&&node.parentElement!=null&&privateText(node.parentElement,win))return true;return false;};
  const fixed=(root,win)=>{for(let node=html(root)?root:(shadow(root)?root.host:null);node!=null&&node!==win.document.body;node=node.parentElement??(shadow(node.getRootNode())?node.getRootNode().host:null)){const value=win.getComputedStyle(node).position;if(value==='fixed'||value==='sticky')return true;}return false;};
  const rects=range=>{if(typeof range.getClientRects!=='function')return[];const values=range.getClientRects();return values.length>1000?[]:Array.from(values).filter(value=>value.width>0&&value.height>0).map(value=>({x:value.left,y:value.top,width:value.width,height:value.height}));};
  const union=values=>{const x=Math.min(...values.map(value=>value.x)),y=Math.min(...values.map(value=>value.y));return{x,y,width:Math.max(...values.map(value=>value.x+value.width))-x,height:Math.max(...values.map(value=>value.y+value.height))-y};};
  const rangePoint=(values,direction)=>{const rect=direction==='forward'?values.at(-1):values[0];return{x:direction==='forward'?rect.x+rect.width:rect.x,y:rect.y+rect.height/2};};
  const locatorFor=root=>{
    const value=html(root)?selectorPart(root,true):null;if(html(root)&&value==null)return null;
    const shadowHosts=[];for(let scope=root.getRootNode();scope!==root.ownerDocument;){if(!openShadow(scope))return null;const host=scope.host,part=selectorPart(host,true);if(part==null)return null;shadowHosts.unshift(part);scope=host.getRootNode();}
    return{selector:value,shadowHosts};
  };
  const offsetIn=(root,node,offset)=>{const range=root.ownerDocument.createRange();try{range.selectNodeContents(root);range.setEnd(node,offset);return range.toString().length;}catch{return null;}};
  const textAt=(root,offset)=>{if(offset<0)return null;const walker=root.ownerDocument.createTreeWalker(root,4);let total=0;for(let node=walker.nextNode();node!=null;node=walker.nextNode()){const text=node.textContent??'';if(total+text.length>=offset)return{node,offset:offset-total};total+=text.length;}return null;};
  const resolveRange=(root,locator)=>{const start=textAt(root,locator.startOffset),end=textAt(root,locator.endOffset);if(start==null||end==null)return null;const range=root.ownerDocument.createRange();range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);return range;};
  const resolveRoot=(win,locator)=>{let root=win.document;for(const value of locator.shadowHosts){const node=root.querySelector(value);if(!html(node)||node.shadowRoot==null)return null;root=node.shadowRoot;}if(locator.kind==='dom'&&locator.selector==null)return shadow(root)?root:null;if(locator.selector==null)return null;const node=root.querySelector(locator.selector);return html(node)?node:null;};
  const validControl=node=>{const win=node?.ownerDocument?.defaultView;return node!=null&&(win?.HTMLTextAreaElement!=null&&node instanceof win.HTMLTextAreaElement||win?.HTMLInputElement!=null&&node instanceof win.HTMLInputElement&&['email','search','tel','text','url'].includes(node.type));};
  const transformed=(node,win)=>{for(let current=node;current!=null;current=current.parentElement??(shadow(current.getRootNode())?current.getRootNode().host:null)){const style=win.getComputedStyle(current),value=style.transform;if(value!==''&&value!=='none'){const match=/^matrix\(([^)]+)\)$/.exec(value);if(match==null)return true;const parts=match[1]?.split(',').map(Number);if(parts?.length!==6||Math.abs(parts[1]??0)>1e-6||Math.abs(parts[2]??0)>1e-6)return true;}const rotate=style.getPropertyValue('rotate');if(rotate!==''&&rotate!=='none'&&rotate!=='0deg')return true;}return false;};
  const controlRects=(node,start,end)=>{
    const box=node.getBoundingClientRect(),win=node.ownerDocument.defaultView;if(box.width<=0||box.height<=0||win==null||transformed(node,win))return[];
    const style=win.getComputedStyle(node),sx=node.offsetWidth>0?box.width/node.offsetWidth:1,sy=node.offsetHeight>0?box.height/node.offsetHeight:1,mirror=node.ownerDocument.createElement('div');
    mirror.setAttribute('data-browser-comment-text-selection-mirror','');
    Object.assign(mirror.style,{position:'fixed',left:box.left+'px',top:box.top+'px',width:box.width/sx+'px',height:box.height/sy+'px',overflow:'auto',visibility:'hidden',pointerEvents:'none',whiteSpace:node.tagName==='TEXTAREA'?'pre-wrap':'pre',overflowWrap:node.tagName==='TEXTAREA'?'break-word':'normal'});
    if(sx!==1||sy!==1){mirror.style.transform='scale('+sx+', '+sy+')';mirror.style.transformOrigin='top left';}
    for(const key of 'borderBottomStyle.borderBottomWidth.borderLeftStyle.borderLeftWidth.borderRightStyle.borderRightWidth.borderTopStyle.borderTopWidth.boxSizing.direction.fontFamily.fontFeatureSettings.fontKerning.fontSize.fontStretch.fontStyle.fontVariant.fontWeight.letterSpacing.lineHeight.paddingBottom.paddingLeft.paddingRight.paddingTop.tabSize.textAlign.textIndent.textTransform.wordBreak.wordSpacing'.split('.'))mirror.style[key]=style[key];
    mirror.style.boxSizing='border-box';mirror.append(node.value.slice(0,start));const span=node.ownerDocument.createElement('span');span.textContent=node.value.slice(start,end)||'\u200b';mirror.append(span,node.value.slice(end));
    try{
      node.ownerDocument.body.append(mirror);mirror.scrollLeft=node.scrollLeft;mirror.scrollTop=node.scrollTop;
      const values=span.getClientRects();if(values.length>1000)return[];
      return Array.from(values).map(value=>{const x=Math.max(value.left,box.left),y=Math.max(value.top,box.top),right=Math.min(value.right,box.right),bottom=Math.min(value.bottom,box.bottom);return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;}).filter(Boolean);
    }finally{mirror.remove();}
  };
  const controlSelection=(win,node,start,end,direction)=>{const locator=locatorFor(node),selectedText=node.value.slice(start,end);if(locator?.selector==null||privateText(node,win)||selectedText.trim().length===0||selectedText.length>20000)return null;const values=controlRects(node,start,end);return values.length?{isFixed:fixed(node,win),locator:{...locator,kind:'form-control',direction,startOffset:start,endOffset:end},rects:values,selectedText,viewportPoint:rangePoint(values,direction)}:null;};
  const domSelection=(win,range,selectedText,direction)=>{
    if(range.collapsed||!range.startContainer.isConnected||!range.endContainer.isConnected||range.startContainer.ownerDocument!==win.document||range.endContainer.ownerDocument!==win.document||selectedText.trim().length===0||selectedText.length>20000||range.toString().length>20000)return null;
    let root=range.commonAncestorContainer;if(!shadow(root)){root=root.nodeType===1?root:root.parentElement;while(html(root)&&selectorPart(root)==null)root=root.parentElement;}if(root==null||privateRange(range,win))return null;
    const locator=locatorFor(root),start=offsetIn(root,range.startContainer,range.startOffset),end=offsetIn(root,range.endContainer,range.endOffset);if(locator==null||start==null||end==null||end<=start)return null;
    const values=rects(range);return values.length?{isFixed:fixed(root,win),locator:{...locator,kind:'dom',direction,rangeText:range.toString(),startOffset:start,endOffset:end},rects:values,selectedText,viewportPoint:rangePoint(values,direction)}:null;
  };
  const openRoots=root=>{const result=[];for(const node of root.querySelectorAll('*'))if(html(node)&&node.shadowRoot!=null)result.push(node.shadowRoot,...openRoots(node.shadowRoot));return result;};
  let win=topWindow,native;
  if(savedAnchor!=null){
    for(const part of savedAnchor.framePath){const frame=query(win.document,part);win=accessibleFrame(frame);if(win==null)return null;}
    if(savedAnchor.frameUrl!=null&&win.location.href!==savedAnchor.frameUrl)return null;
    const locator=savedAnchor.textLocator,root=resolveRoot(win,locator);if(root==null)return null;
    if(locator.kind==='form-control'){if(!validControl(root))return null;native=controlSelection(win,root,locator.startOffset,locator.endOffset,locator.direction);}
    else{
      const range=resolveRange(root,locator);if(range==null||range.toString()!==locator.rangeText||privateRange(range,win)||savedAnchor.selectedText.length>20000)return null;
      const values=rects(range);native=values.length?{isFixed:fixed(root,win),locator,rects:values,selectedText:savedAnchor.selectedText,viewportPoint:rangePoint(values,locator.direction)}:null;
    }
    if(native?.selectedText!==savedAnchor.selectedText)return null;
  }else{
    for(;;){const active=deepActive(win.document),child=accessibleFrame(active);if(child==null){if(iframe(active))return null;break;}win=child;}
    const active=deepActive(win.document);
    if(validControl(active)&&!privateText(active,win)){
      let start=active.selectionStart,end=active.selectionEnd;
      if(start==null||end==null){const selected=win.getSelection()?.toString()??'';start=active.value.indexOf(selected);end=start+selected.length;if(selected.length===0||start===-1||active.value.indexOf(selected,start+1)!==-1)start=end=null;}
      if(start!=null&&end!=null&&end>start&&active.value.slice(start,end).trim().length>0)native=controlSelection(win,active,start,end,active.selectionDirection==='backward'?'backward':'forward');
    }
    if(native==null){
      const selected=win.getSelection();if(selected==null||selected.rangeCount===0)return null;
      let range=selected.getRangeAt(0);const aligned=selected.anchorNode===range.startContainer&&selected.anchorOffset===range.startOffset&&selected.focusNode===range.endContainer&&selected.focusOffset===range.endOffset||selected.focusNode===range.startContainer&&selected.focusOffset===range.startOffset&&selected.anchorNode===range.endContainer&&selected.anchorOffset===range.endOffset;
      if(range.collapsed||!aligned){if(typeof selected.getComposedRanges!=='function')return null;const composed=selected.getComposedRanges({shadowRoots:openRoots(win.document)})[0];if(composed==null)return null;range=win.document.createRange();range.setStart(composed.startContainer,composed.startOffset);range.setEnd(composed.endContainer,composed.endOffset);if(range.collapsed)return null;}
      const direction=selected.anchorNode===range.startContainer&&selected.anchorOffset===range.startOffset?'forward':selected.focusNode===range.startContainer&&selected.focusOffset===range.startOffset||selected.direction==='backward'?'backward':'forward';
      native=domSelection(win,range,selected.toString(),direction);
    }
  }
  if(native==null)return null;
  const framePath=[];let offsetX=0,offsetY=0,current=win;
  while(current!==topWindow){const owner=current.frameElement;if(!iframe(owner))return null;const path=selector(owner);if(path==null)return null;framePath.unshift(path);const box=owner.getBoundingClientRect();offsetX+=box.left;offsetY+=box.top;current=owner.ownerDocument.defaultView;if(current==null)return null;}
  const localRect=union(native.rects),scrollX=native.isFixed?0:win.scrollX,scrollY=native.isFixed?0:win.scrollY,selectionRects=native.rects.map(value=>({...value,x:value.x+scrollX,y:value.y+scrollY}));
  const scrollContainers=[];let hit=win.document.elementFromPoint(native.viewportPoint.x,native.viewportPoint.y);
  if(html(hit))for(;hit!=null&&hit!==win.document.body&&hit!==win.document.documentElement;hit=parent(hit)){const style=win.getComputedStyle(hit);if([style.overflow,style.overflowX,style.overflowY].some(value=>['auto','scroll','overlay','clip','hidden'].includes(value))){const path=selector(hit);if(path!=null)scrollContainers.push({selector:path,scrollLeft:hit.scrollLeft,scrollTop:hit.scrollTop});}}
  return{anchor:{kind:'text',pageUrl:topWindow.location.href,frameUrl:win===topWindow?null:win.location.href,title:'Selected text',elementPath:'browser text selection',point:{xPercent:(native.viewportPoint.x+scrollX)/win.innerWidth*100,y:native.viewportPoint.y+scrollY},rect:union(selectionRects),isFixed:native.isFixed,role:null,name:null,selector:null,framePath,nearbyText:null,selectedText:native.selectedText,selectionRects,textLocator:native.locator,...(scrollContainers.length?{scrollContainers}:{})},
    themeVariant:topWindow.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light',viewportRect:{...localRect,x:localRect.x+offsetX,y:localRect.y+offsetY},viewportPoint:{x:native.viewportPoint.x+offsetX,y:native.viewportPoint.y+offsetY},viewportSelectionRects:native.rects.map(value=>({...value,x:value.x+offsetX,y:value.y+offsetY})),viewportSize:{width:topWindow.innerWidth,height:topWindow.innerHeight}};
}

// anchor is optional server-owned saved state. No renderer text or locator is
// accepted here; callers bind this read to the actual document lifetime.
export async function readAnnotationTextSelection(read,topEntry,{anchor}={},signal){
  signal?.throwIfAborted();if(!topEntry?.cdp||!topEntry.frameId||topEntry.owner)throw changed();
  if(anchor!==undefined&&(anchor.kind!=='text'||!anchor.textLocator||typeof anchor.selectedText!=='string'))throw changed();
  const world=await read(topEntry.cdp.send('Page.createIsolatedWorld',{frameId:topEntry.frameId,worldName:'trisoul-annotation-text-selection'}));signal?.throwIfAborted();
  const expression='('+sourceTextSelection.toString()+')('+JSON.stringify(anchor??null)+')';
  const result=await read(topEntry.cdp.send('Runtime.evaluate',{contextId:world.executionContextId,expression,returnByValue:true}));signal?.throwIfAborted();
  if(result.exceptionDetails)throw changed();const value=result.result?.value;if(value==null)return null;
  if(value.anchor?.kind!=='text'||!Array.isArray(value.viewportSelectionRects)||!value.viewportSelectionRects.length||!value.viewportSelectionRects.every(rect=>['x','y','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.width>0&&rect.height>0))throw changed();
  return value;
}
