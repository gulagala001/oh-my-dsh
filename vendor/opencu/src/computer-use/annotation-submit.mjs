import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {annotationSnapshotOptions} from './browser-annotation.mjs';
import {annotationDocuments} from './annotation-documents.mjs';
import {pointInPolygon} from './annotation-geometry.mjs';
import {readAnnotationDocumentContext} from './annotation-document-context.mjs';
import {readAnnotationAnchorGeometry} from './annotation-anchor-geometry.mjs';
import {readAnnotationTextSelection} from './annotation-text-anchor.mjs';
import {readFrozenAnnotationSurface} from './annotation-surface-controller.mjs';
import {readAnnotationTextChange} from './annotation-text-changes.mjs';
import {readAnnotationSiteMetadata} from './annotation-site-metadata.mjs';
import {resolveAnnotationSiteTarget} from './annotation-site-targets.mjs';
import {bindAnnotationSiteRequestAnchor,isFrozenAnnotationSiteRequestPoint} from './annotation-site-request-capture.mjs';
import {assertPreparedAnnotationLiveEditorSavePacket,validatePreparedAnnotationLiveEditorSavePacket} from './annotation-live-editor.mjs';

const invalid=message=>Object.assign(new Error(message),{code:'INVALID_ANNOTATION_SUBMIT'});
const stale=()=>Object.assign(new Error('页面或批注预览已改变，请重新打开批注。'),{code:'ANNOTATION_CHANGED'});
const normalized=value=>value&&['x','y','width','height'].every(key=>Number.isFinite(value[key]))&&value.x>=0&&value.y>=0&&value.width>0&&value.height>0&&value.x+value.width<=1.000001&&value.y+value.height<=1.000001;

function gatedElementAnchor(anchor,enabled){
  if(enabled===true||anchor.kind!=='element')return anchor;
  const {elementName,elementMetadata,annotationFeatures,...value}=anchor;return value;
}
function elementEvidence(anchor){
  if(anchor.kind!=='element'&&anchor.kind!=='virtual')return{};
  return{...(anchor.elementName===undefined?{}:{elementName:anchor.elementName}),...(anchor.elementMetadata===undefined?{}:{elementMetadata:anchor.elementMetadata})};
}
function mappedSiteEvidence(baseline,element,input,anchor,enabled){
  if(input.siteAnnotationSourceKey===undefined||enabled!==true)return anchor;
  const raw=baseline.result.elements.find(value=>value.key===input.siteAnnotationSourceKey),point=input.selectionPoint,geometry=baseline.result.frame.geometry;
  if(!raw||!point||!['x','y'].every(key=>Number.isFinite(point[key])&&point[key]>=0&&point[key]<=1)
    ||!raw.siteAnnotationTarget||!pointInPolygon(point,raw.polygon)
    ||resolveAnnotationSiteTarget(raw.siteAnnotationTarget,{x:geometry.offsetX+point.x*geometry.width,y:geometry.offsetY+point.y*geometry.height})!==element.key)throw invalid('网站批注的原始命中目标已经改变');
  return raw.siteAnnotationTarget.usesSelectableContainer?{...anchor,annotationFeatures:[...new Set([...(anchor.annotationFeatures??[]),'selectable-containers'])]}:anchor;
}
// app-shared tSt/nSt: names alone are evidence, not a metadata feature.
function hasAnnotationFeatures(anchors,group){
  return(group?.annotationControls?.controls.length??0)>0||anchors.some(anchor=>(anchor.annotationFeatures?.length??0)>0||anchor.kind==='virtual'||(anchor.kind==='element'||anchor.kind==='virtual')&&anchor.elementMetadata!=null&&Object.keys(anchor.elementMetadata).length>0);
}

// browser-page-preload pc/ld/mc/fc/hc/xc/Sc. These reads run against a node
// resolved by the browser protocol, never a renderer-provided selector.
function sourceElementMetadata(){
  const node=this,doc=node.ownerDocument,win=doc.defaultView;
  if(!node.isConnected||!win)throw Error('所选元素已离开页面');
  const isRoot=element=>element===doc.documentElement||element===doc.body;
  const text=element=>{
    if(isRoot(element))return element.tagName.toLowerCase();
    const value=(element.innerText||element.textContent||'').replace(/\s+/g,' ').trim();
    return value.length===0?null:value.slice(0,80);
  };
  const parent=element=>element.assignedSlot??element.parentElement??element.getRootNode()?.host??null;
  const escape=value=>win.CSS.escape(value);
  const unique=(element,selector)=>{const matches=element.getRootNode().querySelectorAll(selector);return matches.length===1&&matches[0]===element;};
  const selectorPart=(element,requireUnique)=>{
    const parts=[];let current=element,depth=0;
    for(;current&&(requireUnique||depth<4);current=current.parentElement,depth++){
      let part=current.tagName.toLowerCase();
      if(current.id){const candidate=[part+'#'+escape(current.id),...parts].join(' > ');if(!requireUnique||unique(element,candidate))return candidate;}
      const classes=Array.from(current.classList).filter(value=>/^[a-zA-Z0-9_-]+$/.test(value)).slice(0,2);
      if(classes.length)part+='.'+classes.map(escape).join('.');
      if(current.parentElement){const siblings=Array.from(current.parentElement.children).filter(child=>child.tagName===current.tagName);if(siblings.length>1)part+=':nth-of-type('+(siblings.indexOf(current)+1)+')';}
      parts.unshift(part);const candidate=parts.join(' > ');if(requireUnique&&unique(element,candidate))return candidate;
    }
    return requireUnique||parts.length===0?null:parts.join(' > ');
  };
  const selector=(element,requireUnique=false)=>{
    const parts=[];let current=element;
    for(;;){const part=selectorPart(current,requireUnique);if(part===null)return null;parts.unshift(part);const root=current.getRootNode();if(root.nodeType===9)break;if(root.nodeType!==11||!root.host||root.host.shadowRoot!==root)return null;current=root.host;}
    return parts.length===1?parts[0]:'shadow:'+parts.join('>>>');
  };
  const path=[];let current=node;
  for(let depth=0;current&&depth<4;current=parent(current),depth++){
    const tag=current.tagName.toLowerCase();if(tag==='html'||tag==='body'){if(!path.length)path.unshift(tag);break;}path.unshift(tag);
  }
  const immediate=isRoot(node)?null:Array.from(node.childNodes).filter(child=>child.nodeType===3).map(child=>child.textContent?.replace(/\s+/g,' ').trim()??'').join(' ').replace(/\s+/g,' ').trim().slice(0,80)||null;
  const ownText=text(node),nearby=node.closest('section,article,main,form,nav,aside,header,footer');
  return {title:node.getAttribute('aria-label')||ownText||node.tagName.toLowerCase(),elementPath:path.join(' > '),
    role:node.getAttribute('role'),name:node.getAttribute('aria-label')??ownText,selector:selector(node),
    frameSelector:selector(node,true),nearbyText:ownText||(nearby?text(nearby):null),immediateText:immediate,
    themeVariant:win.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'};
}

async function metadata(read,entry,backendNodeId){
  const {executionContextId}=await read(entry.cdp.send('Page.createIsolatedWorld',{frameId:entry.frameId,worldName:'trisoul-annotation-submission'}));
  const operation=entry.cdp.send('DOM.resolveNode',{backendNodeId,executionContextId});let objectId;
  try{
    const response=await read(operation);objectId=response.object?.objectId;if(!objectId)throw stale();
    const result=await read(entry.cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:sourceElementMetadata.toString(),returnByValue:true}));
    if(result.exceptionDetails||!result.result?.value)throw stale();return result.result.value;
  }finally{
    if(objectId)await entry.cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{});
    else void operation.then(response=>response.object?.objectId&&entry.cdp.send('Runtime.releaseObject',{objectId:response.object.objectId})).catch(()=>{});
  }
}

async function elementAnchor(read,documents,entry,backendNodeId,pageUrl,topEntry,signal,siteAnnotationFeaturesEnabled=false){
  const values=await metadata(read,entry,backendNodeId),framePath=[];let child=entry;
  while(child.owner){const parent=documents.entries.get(child.owner.frameId);if(!parent)throw stale();const owner=await metadata(read,parent,child.owner.backendNodeId);if(!owner.frameSelector)throw invalid('无法确定所选框架的批注路径');framePath.unshift(owner.frameSelector);child=parent;}
  const documentContext=await readAnnotationDocumentContext(read,entry,{pageUrl,kind:'element',backendNodeId,fallbackEntry:topEntry},signal);
  const geometry=await readAnnotationAnchorGeometry(read,entry,backendNodeId,{entries:documents.entries},signal);
  const siteMetadata=await readAnnotationSiteMetadata(read,entry,backendNodeId,{enabled:siteAnnotationFeaturesEnabled},signal);
  return{themeVariant:values.themeVariant,anchor:{kind:'element',pageUrl,framePath,...(framePath.length?{frameUrl:entry.strings[entry.document.documentURL]}:{}),title:values.title,elementPath:values.elementPath,role:values.role,name:values.name,selector:values.selector,nearbyText:values.nearbyText,immediateText:values.immediateText,...geometry,...siteMetadata,...(documentContext?{documentContext}:{})}};
}

// Shared by submit and the source-backed active editor. Protocol identity,
// metadata and geometry are read together against the same frozen document.
export async function readFrozenAnnotationElementAnchor(views,view,input,signal){
  const {sourceFrameId,elementKey}=input;
  const lifetime=AbortSignal.any([signal,view.lifetime.signal,view.document.signal].filter(Boolean));lifetime.throwIfAborted();
  const baseline=view.annotations?.get(sourceFrameId),element=baseline?.result.elements.find(value=>value.key===elementKey);
  if(!element||view.annotationDocument!==view.document||baseline.result.frame.loaderId!==view.loaderId)throw stale();
  const read=operation=>views.read(view,operation,lifetime),documents=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime);let value;
  try{
    if(JSON.stringify(documents.signature)!==JSON.stringify(baseline.dom))throw stale();
    const entry=documents.entries.get(element.frameId),top=[...documents.entries.values()].find(value=>!value.owner);if(!entry||!top)throw stale();
    value=await elementAnchor(read,documents,entry,element.backendNodeId,baseline.result.frame.url,top,lifetime,view.siteAnnotationFeaturesEnabled===true);
    value.anchor=mappedSiteEvidence(baseline,element,input,value.anchor,view.siteAnnotationFeaturesEnabled);
    value.anchor=bindAnnotationSiteRequestAnchor(view,baseline,{elementKey:element.key,frameId:element.frameId,backendNodeId:element.backendNodeId},value.anchor);
    const current=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime);try{if(JSON.stringify(current.signature)!==JSON.stringify(baseline.dom))throw stale();}finally{await current.dispose();}
  }finally{await documents.dispose();}
  lifetime.throwIfAborted();if(view.annotations?.get(sourceFrameId)!==baseline||view.annotationDocument!==view.document)throw stale();
  return{...value,anchor:gatedElementAnchor(value.anchor,view.siteAnnotationFeaturesEnabled),element:structuredClone(element),selection:{sourceFrameId,elementKey,loaderId:baseline.result.frame.loaderId,pageUrl:baseline.result.frame.url,region:structuredClone(element.region),geometry:structuredClone(baseline.result.frame.geometry)}};
}

export async function readFrozenAnnotationAdditionalSelections(views,view,input,signal){
  if(input.additionalSelections===undefined)return[];
  if(!Array.isArray(input.additionalSelections))throw invalid('附加批注选择无效');
  const lifetime=AbortSignal.any([signal,view.lifetime.signal,view.document.signal].filter(Boolean));lifetime.throwIfAborted();
  const baseline=view.annotations?.get(input.sourceFrameId);
  if(!baseline||view.annotationDocument!==view.document||baseline.result.frame.loaderId!==view.loaderId)throw stale();
  const geometry=baseline.result.frame.geometry,selectedNodes=new Set([input.elementKey]),values=[];
  for(const value of input.additionalSelections){
    if(!value||!['element','region'].includes(value.kind)||!value.selectionPoint||!['x','y'].every(key=>Number.isFinite(value.selectionPoint[key])&&value.selectionPoint[key]>=0&&value.selectionPoint[key]<=1))throw invalid('附加批注选择位置无效');
    const element=value.kind==='element'?baseline.result.elements.find(element=>element.key===value.elementKey):null;
    if(value.kind==='element'){
      if(!element||selectedNodes.has(element.key))throw invalid('附加批注元素已经失效或重复');
      const point=value.selectionPoint,region=element.region;
      if(element.polygon?!pointInPolygon(point,element.polygon):point.x<region.x||point.x>region.x+region.width||point.y<region.y||point.y>region.y+region.height)throw invalid('附加选择位置与元素不一致');
      selectedNodes.add(element.key);
    }else if(!normalized(value.region)||values.some(item=>!item.element&&['x','y','width','height'].every(key=>item.region[key]===value.region[key])))throw invalid('附加批注区域无效或重复');
    values.push({element,region:structuredClone(element?.region??value.region),point:structuredClone(value.selectionPoint),siteAnnotationSourceKey:value.siteAnnotationSourceKey});
  }
  const read=operation=>views.read(view,operation,lifetime),documents=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime),result=[];
  try{
    if(JSON.stringify(documents.signature)!==JSON.stringify(baseline.dom))throw stale();
    const top=[...documents.entries.values()].find(entry=>!entry.owner);if(!top)throw stale();
    for(const value of values){
      let anchor,identity;
      if(value.element){
        const entry=documents.entries.get(value.element.frameId);if(!entry)throw stale();
        ({anchor}=await elementAnchor(read,documents,entry,value.element.backendNodeId,baseline.result.frame.url,top,lifetime,view.siteAnnotationFeaturesEnabled===true));
        anchor=mappedSiteEvidence(baseline,value.element,{siteAnnotationSourceKey:value.siteAnnotationSourceKey,selectionPoint:value.point},anchor,view.siteAnnotationFeaturesEnabled);
        identity={frameId:entry.frameId,frameLoaderId:entry.loaderId,backendNodeId:value.element.backendNodeId};
      }else{
        const rect=viewportRect(value.region,geometry),documentContext=await readAnnotationDocumentContext(read,top,{pageUrl:baseline.result.frame.url,kind:'region',viewportRect:rect,fallbackEntry:top},lifetime);
        anchor={kind:'region',pageUrl:baseline.result.frame.url,framePath:[],title:'Selected browser region',elementPath:'browser region',rect:{...rect,y:rect.y+geometry.pageY-geometry.offsetY},...(documentContext?{documentContext}:{})};
      }
      result.push({anchor,selection:{sourceFrameId:input.sourceFrameId,...(value.element?{elementKey:value.element.key}:{}),region:value.region,point:value.point,geometry:structuredClone(geometry),loaderId:baseline.result.frame.loaderId,pageUrl:baseline.result.frame.url},...(value.element?{element:structuredClone(value.element),identity}:{})});
    }
    const current=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime);try{if(JSON.stringify(current.signature)!==JSON.stringify(baseline.dom))throw stale();}finally{await current.dispose();}
  }finally{await documents.dispose();}
  lifetime.throwIfAborted();if(view.annotations?.get(input.sourceFrameId)!==baseline||view.annotationDocument!==view.document)throw stale();return result.map(value=>({...value,anchor:gatedElementAnchor(value.anchor,view.siteAnnotationFeaturesEnabled)}));
}

function viewportRect(region,geometry){return{x:geometry.offsetX+region.x*geometry.width,y:geometry.offsetY+region.y*geometry.height,width:region.width*geometry.width,height:region.height*geometry.height};}

// main cW/eW/lW/dW: marker union, 32px crop padding, and source image limits.
async function annotatedScreenshot(frame,selections,{crop=false,compact=false,number=1,marker:primaryMarker}={}){
  const image=sharp(Buffer.from(frame.data,'base64')),size=await image.metadata(),geometry=frame.geometry;
  if(!size.width||!size.height||!geometry?.layoutWidth||!geometry?.layoutHeight)throw stale();
  const sx=size.width/geometry.width,sy=size.height/geometry.height;
  const rect={x:Math.min(...selections.map(value=>value.rect.x)),y:Math.min(...selections.map(value=>value.rect.y))};
  rect.width=Math.max(...selections.map(value=>value.rect.x+value.rect.width))-rect.x;rect.height=Math.max(...selections.map(value=>value.rect.y+value.rect.height))-rect.y;
  const marker=primaryMarker??selections[0].marker;
  const path='M13 .5a12.5 12.5 0 0 1 0 25H3a2.5 2.5 0 0 1-2.5-2.5V13A12.5 12.5 0 0 1 13 .5Z';
  const outlines=selections.map(({rect,marker,kind,rects})=>{
    const box={x:(rect.x-geometry.offsetX)*sx,y:(rect.y-geometry.offsetY)*sy,width:rect.width*sx,height:rect.height*sy};
    const mx=(marker.x-geometry.offsetX)*sx,my=(marker.y-geometry.offsetY)*sy;
    const outline=kind==='text'?rects.map(value=>`<rect x="${(value.x-geometry.offsetX)*sx}" y="${(value.y-geometry.offsetY)*sy}" width="${value.width*sx}" height="${value.height*sy}" fill="#128dff" fill-opacity=".4"/>`).join(''):`<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#0069FB" fill-opacity=".03" stroke="#0069FB" stroke-width="${2*sx}"${kind==='region'?` stroke-dasharray="${4*sx} ${4*sx}"`:''}/>`;
    return outline+`<g transform="translate(${mx} ${my-26*sy}) scale(${sx} ${sy})"><path d="${path}" fill="#339cff" stroke="white" stroke-width="1"/><text x="13" y="13" text-anchor="middle" dominant-baseline="central" fill="white" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="11" font-weight="700">${number}</text></g>`;
  }).join('');
  const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}">${outlines}</svg>`);
  let rendered=await image.composite([{input:overlay}]).png().toBuffer(),cropRect;
  const padding=compact?16:32;
  if(crop||compact){
    const x=Math.min(rect.x,marker.x-13),y=Math.min(rect.y,marker.y-13);
    cropRect={x,y,width:Math.max(rect.x+rect.width,marker.x+13)-x,height:Math.max(rect.y+rect.height,marker.y+13)-y};
    const left=Math.max(0,Math.floor((cropRect.x-padding-geometry.offsetX)*sx)),top=Math.max(0,Math.floor((cropRect.y-padding-geometry.offsetY)*sy));
    const right=Math.min(size.width,Math.ceil((cropRect.x+cropRect.width+padding-geometry.offsetX)*sx)),bottom=Math.min(size.height,Math.ceil((cropRect.y+cropRect.height+padding-geometry.offsetY)*sy));
    if(right>left&&bottom>top)rendered=await sharp(rendered).extract({left,top,width:right-left,height:bottom-top}).png().toBuffer();
  }
  const info=await sharp(rendered).metadata(),limit=compact?768:cropRect?1024:1280,longest=Math.max(info.width,info.height);
  const width=longest>limit?Math.max(1,Math.round(info.width*limit/longest)):info.width,height=longest>limit?Math.max(1,Math.round(info.height*limit/longest)):info.height;
  if(longest>limit)rendered=await sharp(rendered).resize(width,height).png().toBuffer();
  return{dataUrl:'data:image/png;base64,'+rendered.toString('base64'),width,height,annotationViewportRect:rect,markerViewportPoint:marker,
    ...(cropRect?{cropViewportRect:cropRect,cropPaddingPx:padding}:{}),...(compact?{isCompact:true}:{})};
}

// main kwe/Awe/Mwe: once a saved ledger reaches ten entries, compact every
// single-selection screenshot, including images already cropped with 32px.
export async function compactAnnotationComment(comment,geometry,signal){
  signal?.throwIfAborted();
  const screenshot=comment.localBrowserScreenshot;
  if(!screenshot||screenshot.isCompact||(comment.localBrowserContext?.additionalSelections?.length??0)>0)return comment;
  const rect=screenshot.annotationViewportRect,marker=screenshot.markerViewportPoint;
  if(!rect||!marker||!geometry)throw stale();
  const image=sharp(Buffer.from(screenshot.dataUrl.slice('data:image/png;base64,'.length),'base64')),info=await image.metadata();
  const target={x:Math.min(rect.x,marker.x-13),y:Math.min(rect.y,marker.y-13)};
  target.width=Math.max(rect.x+rect.width,marker.x+13)-target.x;target.height=Math.max(rect.y+rect.height,marker.y+13)-target.y;
  const previous=screenshot.cropViewportRect,padding=screenshot.cropPaddingPx??32;
  const origin=previous?{x:Math.max(geometry.offsetX,previous.x-padding),y:Math.max(geometry.offsetY,previous.y-padding),
    right:Math.min(geometry.offsetX+geometry.width,previous.x+previous.width+padding),bottom:Math.min(geometry.offsetY+geometry.height,previous.y+previous.height+padding)}:
    {x:geometry.offsetX,y:geometry.offsetY,right:geometry.offsetX+geometry.width,bottom:geometry.offsetY+geometry.height};
  const sx=info.width/(origin.right-origin.x),sy=info.height/(origin.bottom-origin.y);
  const left=Math.max(0,Math.floor((Math.max(geometry.offsetX,target.x-16)-origin.x)*sx)),top=Math.max(0,Math.floor((Math.max(geometry.offsetY,target.y-16)-origin.y)*sy));
  const right=Math.min(info.width,Math.ceil((Math.min(geometry.offsetX+geometry.width,target.x+target.width+16)-origin.x)*sx)),bottom=Math.min(info.height,Math.ceil((Math.min(geometry.offsetY+geometry.height,target.y+target.height+16)-origin.y)*sy));
  let rendered=right>left&&bottom>top?await image.extract({left,top,width:right-left,height:bottom-top}).png().toBuffer():await image.png().toBuffer();
  const size=await sharp(rendered).metadata(),scale=Math.min(1,768/Math.max(size.width,size.height)),width=Math.max(1,Math.round(size.width*scale)),height=Math.max(1,Math.round(size.height*scale));
  if(scale<1)rendered=await sharp(rendered).resize(width,height).png().toBuffer();
  signal?.throwIfAborted();
  const compact={...screenshot,dataUrl:'data:image/png;base64,'+rendered.toString('base64'),width,height,isCompact:true,cropViewportRect:target,cropPaddingPx:16};
  return{...comment,localBrowserScreenshot:compact,...(comment.localBrowserDesignChange?{localBrowserDesignChange:{group:{...comment.localBrowserDesignChange.group,screenshot:compact}}}:{})};
}

export async function rerenderAnnotationComment(comment,packet,number,compact,signal){
  signal?.throwIfAborted();
  if(packet.skipScreenshot)return{...comment,position:{...comment.position,line:number}};
  const screenshot=await annotatedScreenshot(packet.frame,packet.selections,{number,crop:packet.crop,compact:compact&&(comment.localBrowserContext?.additionalSelections?.length??0)===0,marker:packet.marker});
  signal?.throwIfAborted();
  return{...comment,position:{...comment.position,line:number},localBrowserScreenshot:{...screenshot,commentId:comment.localBrowserCommentMetadata.commentId},
    ...(comment.localBrowserDesignChange?{localBrowserDesignChange:{group:{...comment.localBrowserDesignChange.group,screenshot}}}:{})};
}

// Only the live editor's private prepared packet may supply changed pixels,
// original values and node identity. It is not a restored preview snapshot.
export async function submitPreparedAnnotation(views,view,input,packet,signal,options={}){
  const lifetime=AbortSignal.any([signal,view.lifetime.signal,view.document.signal].filter(Boolean));lifetime.throwIfAborted();
  if(!input||typeof input.body!=='string'||input.body.length>100000||input.editorId!==packet?.editorId)throw invalid('实时批注提交内容无效');
  if(input.cropScreenshotToRegion!==undefined&&typeof input.cropScreenshotToRegion!=='boolean')throw invalid('批注截图选项无效');
  assertPreparedAnnotationLiveEditorSavePacket(view,packet);
  let anchor=packet.group.anchor;const selection=packet.selection,frame=packet.frame,geometry=frame.geometry,body=input.body.trim();
  if(anchor.kind==='virtual'){
    const identity=packet.proof?.documentIdentity,old=selection?.geometry,rect=packet.viewportRect;
    if(view.siteAnnotationFeaturesEnabled!==true||packet.skipScreenshot!==true||(packet.additionalSelections?.length??0)>0||
      typeof selection?.sourceFrameId!=='string'||typeof selection.virtualSelectionKey!=='string'||selection.loaderId!==view.loaderId||
      JSON.stringify(selection.virtualAnchor)!==JSON.stringify(anchor)||!selection.point||!['x','y'].every(key=>Number.isFinite(selection.point[key]))||
      !old||!['offsetX','offsetY','width','height'].every(key=>Number.isFinite(old[key]))||old.width<=0||old.height<=0||
      !geometry||!['layoutWidth','layoutHeight'].every(key=>Number.isFinite(geometry[key])&&geometry[key]>0)||
      (rect?!['x','y','width','height'].every(key=>Number.isFinite(rect[key]))||rect.width<=0||rect.height<=0:
        packet.proof?.geometrySource!=='saved-virtual-anchor'||packet.proof?.targetStatus?.resolvable!==false)||
      !identity||identity.tabId!==view.tabId||identity.loaderId!==view.loaderId||typeof identity.frameId!=='string'||typeof identity.frameLoaderId!=='string'||!Number.isSafeInteger(identity.backendNodeId)||identity.backendNodeId<=0||
      typeof packet.group.id!=='string'||packet.group.id.length===0||packet.group.selector!==null||anchor.selector!==null||
      !Array.isArray(packet.group.declarations)||packet.group.declarations.length!==0||packet.group.text!=null||!(packet.group.annotationControls?.controls.length>0))throw stale();
    const number=options.commentNumber??1;if(!Number.isSafeInteger(number)||number<1)throw invalid('批注序号无效');
    const changed=(packet.group.annotationControlChanges?.length??0)>0;if(!body&&!changed)throw invalid('请填写批注说明或实际变更');
    // Yb keeps the surface snapshot's point; cSt omits virtual screenshots.
    const marker=packet.group.markerViewportPoint??{x:old.offsetX+selection.point.x*old.width,y:old.offsetY+selection.point.y*old.height};
    if(!['x','y'].every(key=>Number.isFinite(marker[key])))throw stale();
    lifetime.throwIfAborted();await validatePreparedAnnotationLiveEditorSavePacket(views,view,packet,lifetime);lifetime.throwIfAborted();if(view.siteAnnotationFeaturesEnabled!==true)throw stale();
    const commentId=packet.group.id,viewportSize={width:geometry.layoutWidth,height:geometry.layoutHeight},themeVariant=packet.group.themeVariant;
    const {screenshot:discardedScreenshot,...ledger}=structuredClone(packet.group);
    const group=changed?{...ledger,anchor:structuredClone(anchor),comment:body,markerViewportPoint:structuredClone(marker),viewportSize}:null;
    options.onScreenshotPacket?.({frame:structuredClone(frame),selections:rect?[{kind:'virtual',rect:structuredClone(rect),marker:structuredClone(marker)}]:[],marker:structuredClone(marker),crop:false,skipScreenshot:true});
    let label=anchor.title.trim();if(!label){try{const url=new URL(anchor.pageUrl);label=url.hostname+(url.pathname==='/'?'':url.pathname);}catch{label=anchor.pageUrl;}}
    return{type:'comment',origin:'browser',content:[{content_type:'text',text:body}],position:{side:'right',path:'browser:'+label,line:number},
      localBrowserContext:{pageUrl:anchor.pageUrl,framePath:anchor.framePath,...(anchor.frameUrl?{frameUrl:anchor.frameUrl}:{}),targetDescription:anchor.title,
        ...(anchor.documentContext?{documentContext:anchor.documentContext}:{}),...elementEvidence(anchor),targetImmediateText:anchor.immediateText,targetRole:anchor.role,targetName:anchor.name,targetSelector:anchor.selector,targetPath:anchor.elementPath,targetRect:anchor.rect,nearbyText:anchor.nearbyText,
        virtualTarget:{surfaceId:anchor.surfaceId,targetId:anchor.targetId}},
      localBrowserCommentMetadata:{browserTabId:view.tabId,commentId,hasAnnotationFeatures:hasAnnotationFeatures([anchor],group),kind:'virtual',viewportSize,markerViewportPoint:structuredClone(marker),...(themeVariant?{themeVariant}:{})},
      ...(group?{localBrowserDesignChange:{group}}:{})};
  }
  if(anchor.kind!=='element'||!selection.point||packet.group.id.length===0)throw stale();
  const number=options.commentNumber??1;if(!Number.isSafeInteger(number)||number<1)throw invalid('批注序号无效');
  const changed=packet.group.declarations.some(value=>value.value!==value.previousValue)||packet.group.text!=null&&packet.group.text.value!==packet.group.text.previousValue||(packet.group.annotationControlChanges?.length??0)>0;
  if(!body&&!changed)throw invalid('请填写批注说明或实际变更');
  const all=[{anchor,selection,viewportRect:packet.viewportRect,targetStatus:packet.proof.targetStatus},...(packet.additionalSelections??[])];
  const resolved=all.map(value=>{
    const old=value.selection.geometry,originalRect={...value.anchor.rect,y:value.anchor.rect.y-(value.anchor.isFixed?0:old.pageY-old.offsetY)},originalPoint={x:old.offsetX+value.selection.point.x*old.width,y:old.offsetY+value.selection.point.y*old.height},rect=value.viewportRect;
    if(rect&&(!['x','y','width','height'].every(key=>Number.isFinite(rect[key]))||rect.width<=0||rect.height<=0))throw stale();
    if(!rect&&!(typeof value.targetStatus?.connected==='boolean'&&value.targetStatus.resolvable===false))throw stale();
    const relative={x:Math.max(0,Math.min(1,(originalPoint.x-originalRect.x)/originalRect.width)),y:Math.max(0,Math.min(1,(originalPoint.y-originalRect.y)/originalRect.height))};
    const point=rect?{x:rect.x+relative.x*rect.width,y:rect.y+relative.y*rect.height}:originalPoint;
    const marker={x:Math.max(29,Math.min(geometry.layoutWidth-29,point.x)),y:Math.max(29,Math.min(geometry.layoutHeight-29,point.y))};
    return{kind:value.anchor.kind,...(rect?{rect:structuredClone(rect)}:{}),marker};
  });
  const marker=resolved[0].marker,painted=resolved.filter(value=>value.rect);
  if(!packet.skipScreenshot&&!painted.length)throw stale();
  const screenshot=packet.skipScreenshot?null:await annotatedScreenshot(frame,painted,{compact:options.compact===true&&all.length===1,number,marker});
  lifetime.throwIfAborted();await validatePreparedAnnotationLiveEditorSavePacket(views,view,packet,lifetime);
  for(let index=0;index<all.length;index++)all[index]={...all[index],anchor:gatedElementAnchor(all[index].anchor,view.siteAnnotationFeaturesEnabled)};
  anchor=all[0].anchor;
  options.onScreenshotPacket?.({frame:structuredClone(frame),selections:structuredClone(painted),marker:structuredClone(marker),crop:false,...(packet.skipScreenshot?{skipScreenshot:true}:{})});
  const commentId=packet.group.id,viewportSize={width:geometry.layoutWidth,height:geometry.layoutHeight},themeVariant=packet.group.themeVariant;
  const group=changed?{...structuredClone(packet.group),anchor:structuredClone(anchor),comment:body,markerViewportPoint:marker,viewportSize,...(screenshot?{screenshot}:{})}:null;
  const differences=group?[...(group.text!=null&&group.text.value!==group.text.previousValue?[`text: ${group.text.previousValue} -> ${group.text.value}`]:[]),...group.declarations.filter(value=>value.value!==value.previousValue).map(value=>`${value.property}: ${value.previousValue} -> ${value.value}`)].join('\n'):null;
  let label=anchor.title.trim();if(!label){try{const url=new URL(anchor.pageUrl);label=url.hostname+(url.pathname==='/'?'':url.pathname);}catch{label=anchor.pageUrl;}}
  return{type:'comment',origin:'browser',content:[{content_type:'text',text:group?(body?body+'\n'+differences:differences):body}],position:{side:'right',path:'browser:'+label,line:number},
    localBrowserContext:{pageUrl:anchor.pageUrl,framePath:anchor.framePath,...(anchor.frameUrl?{frameUrl:anchor.frameUrl}:{}),targetDescription:anchor.title,
      ...(anchor.documentContext?{documentContext:anchor.documentContext}:{}),...elementEvidence(anchor),targetImmediateText:anchor.immediateText,targetRole:anchor.role,targetName:anchor.name,targetSelector:anchor.selector,targetPath:anchor.elementPath,nearbyText:anchor.nearbyText,
      ...(all.length>1?{additionalSelections:all.slice(1).map(({anchor:value})=>({kind:value.kind,pageUrl:value.pageUrl,framePath:value.framePath,...(value.frameUrl?{frameUrl:value.frameUrl}:{}),targetDescription:value.title,targetPath:value.elementPath,
        ...(value.documentContext?{documentContext:value.documentContext}:{}),...elementEvidence(value),...(value.kind==='region'?{rect:value.rect}:{targetImmediateText:value.immediateText,targetRole:value.role,targetName:value.name,targetSelector:value.selector,nearbyText:value.nearbyText})}))}:{})},
    localBrowserCommentMetadata:{browserTabId:view.tabId,commentId,hasAnnotationFeatures:hasAnnotationFeatures(all.map(value=>value.anchor),group),kind:'element',viewportSize,markerViewportPoint:marker,...(themeVariant?{themeVariant}:{})},
    ...(group?{localBrowserDesignChange:{group}}:{}),...(screenshot?{localBrowserScreenshot:{...screenshot,commentId}}:{})};
}

export async function submitAnnotation(views,view,input,signal,options={}){
  const lifetime=AbortSignal.any([signal,view.lifetime.signal,view.document.signal].filter(Boolean));lifetime.throwIfAborted();
  if(!input||typeof input.sourceFrameId!=='string'||typeof input.body!=='string'||input.body.length>100000)throw invalid('批注提交内容无效');
  const baseline=view.annotations?.get(input.sourceFrameId);
  const requestPoint=isFrozenAnnotationSiteRequestPoint(view,baseline,{elementKey:input.elementKey,textSelectionKey:input.textSelectionKey},input.selectionPoint);
  if(input.textSelectionKey===undefined&&input.virtualSelectionKey===undefined&&!requestPoint&&(!input.selectionPoint||!['x','y'].every(key=>Number.isFinite(input.selectionPoint[key])&&input.selectionPoint[key]>=0&&input.selectionPoint[key]<=1)))throw invalid('批注选择位置无效');
  if(input.cropScreenshotToRegion!==undefined&&typeof input.cropScreenshotToRegion!=='boolean')throw invalid('批注截图选项无效');
  if(!baseline||view.annotationDocument!==view.document||baseline.result.frame.loaderId!==view.loaderId)throw stale();
  const textSelection=input.textSelectionKey===undefined?null:baseline.result.textSelection;
  const virtualSelection=input.virtualSelectionKey===undefined?null:baseline.virtualSelection;
  if(input.textSelectionKey!==undefined&&(!textSelection||textSelection.key!==input.textSelectionKey))throw stale();
  if(input.virtualSelectionKey!==undefined&&(!virtualSelection||virtualSelection.key!==input.virtualSelectionKey))throw stale();
  if(textSelection&&virtualSelection||(textSelection||virtualSelection)&&(input.elementKey!==undefined||input.region!==undefined||input.previewFrameId!==undefined||(input.additionalSelections?.length??0)>0))throw invalid('文字与虚拟批注不能混合其他选择或样式变更');
  const original=typeof input.elementKey==='string'?baseline.result.elements.find(element=>element.key===input.elementKey):null;
  if(input.elementKey!==undefined&&!original)throw stale();
  if(original&&!requestPoint){const point=input.selectionPoint,region=original.region;if(original.polygon?!pointInPolygon(point,original.polygon):point.x<region.x||point.x>region.x+region.width||point.y<region.y||point.y>region.y+region.height)throw invalid('所选位置与批注元素不一致');}
  if(!original&&!textSelection&&!virtualSelection&&!normalized(input.region))throw invalid('请选择有效批注区域');
  if(input.additionalSelections!==undefined&&!Array.isArray(input.additionalSelections))throw invalid('附加批注选择无效');
  const selections=[{original,textSelection,virtualSelection,region:original?.region??input.region,point:input.selectionPoint,siteAnnotationSourceKey:input.siteAnnotationSourceKey}];
  const selectedNodes=new Set(original?[original.key]:[]);
  for(const value of input.additionalSelections??[]){
    if(!value||!['element','region'].includes(value.kind)||!value.selectionPoint||!['x','y'].every(key=>Number.isFinite(value.selectionPoint[key])&&value.selectionPoint[key]>=0&&value.selectionPoint[key]<=1))throw invalid('附加批注选择位置无效');
    const element=value.kind==='element'?baseline.result.elements.find(element=>element.key===value.elementKey):null;
    if(value.kind==='element'){
      if(!element||selectedNodes.has(element.key))throw invalid('附加批注元素已经失效或重复');
      const point=value.selectionPoint,region=element.region;
      if(element.polygon?!pointInPolygon(point,element.polygon):point.x<region.x||point.x>region.x+region.width||point.y<region.y||point.y>region.y+region.height)throw invalid('附加选择位置与元素不一致');
      selectedNodes.add(element.key);
    }else if(!normalized(value.region))throw invalid('附加批注区域无效');
    const region=element?.region??value.region;
    if(!element&&selections.some(selection=>!selection.original&&['x','y','width','height'].every(key=>selection.region[key]===region[key])))throw invalid('附加批注区域重复');
    selections.push({original:element,region,point:value.selectionPoint,siteAnnotationSourceKey:value.siteAnnotationSourceKey});
  }
  const preview=input.previewFrameId===undefined?null:baseline.preview;
  if(input.previewFrameId!==undefined&&(!preview||preview.frame.id!==input.previewFrameId||preview.element.key!==original?.key||!preview.restored?.restored))throw stale();
  if(preview?.skipScreenshot&&selections.length>1)throw invalid('多选目标的截图解析尚未确认，请调整样式或分别批注');
  const body=input.body.trim();if(!body&&!preview)throw invalid('请填写批注说明或预览样式变更');
  const read=operation=>views.read(view,operation,lifetime),documents=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime);
  let themeVariant;const anchors=[];
  try{
    if(JSON.stringify(documents.signature)!==JSON.stringify(baseline.dom))throw stale();
    const frame=baseline.result.frame,geometry=frame.geometry;
    const topEntry=[...documents.entries.values()].find(entry=>!entry.owner);if(!topEntry)throw stale();
    for(const [index,selection] of selections.entries()){
    if(selection.virtualSelection){
      const actual=await readFrozenAnnotationSurface(views,view,baseline,input.virtualSelectionKey,lifetime);themeVariant=actual.themeVariant;anchors.push(actual.anchor);
    }else if(selection.textSelection){
      const actual=await readAnnotationTextSelection(read,topEntry,{anchor:selection.textSelection.anchor},lifetime);
      const {key,...frozen}=selection.textSelection;
      if(!actual||JSON.stringify(actual)!==JSON.stringify(frozen))throw stale();
      themeVariant=actual.themeVariant;anchors.push(bindAnnotationSiteRequestAnchor(view,baseline,{textSelectionKey:selection.textSelection.key},actual.anchor));
    }else if(selection.original){
      const entry=documents.entries.get(selection.original.frameId);if(!entry)throw stale();
      if(index===0&&preview?.text){const actualText=await readAnnotationTextChange(read,entry,selection.original.backendNodeId,preview.text.value,lifetime);if(JSON.stringify(actualText)!==JSON.stringify(preview.text))throw stale();}
      const value=await elementAnchor(read,documents,entry,selection.original.backendNodeId,frame.url,topEntry,lifetime,view.siteAnnotationFeaturesEnabled===true);if(index===0)themeVariant=value.themeVariant;
      let anchor=mappedSiteEvidence(baseline,selection.original,{siteAnnotationSourceKey:selection.siteAnnotationSourceKey,selectionPoint:selection.point},value.anchor,view.siteAnnotationFeaturesEnabled);
      if(index===0)anchor=bindAnnotationSiteRequestAnchor(view,baseline,{elementKey:selection.original.key,frameId:selection.original.frameId,backendNodeId:selection.original.backendNodeId},anchor);
      anchors.push(anchor);
    }else{
      const rect=viewportRect(selection.region,geometry);
      const documentContext=await readAnnotationDocumentContext(read,topEntry,{pageUrl:frame.url,kind:'region',viewportRect:rect,fallbackEntry:topEntry},lifetime);
      anchors.push({kind:'region',pageUrl:frame.url,framePath:[],title:'Selected browser region',elementPath:'browser region',
        rect:{...rect,y:rect.y+geometry.pageY-geometry.offsetY},...(documentContext?{documentContext}:{})});
    }
    }
    const current=await annotationDocuments(views,view,annotationSnapshotOptions,lifetime);
    try{if(JSON.stringify(current.signature)!==JSON.stringify(baseline.dom))throw stale();}finally{await current.dispose();}
  }finally{await documents.dispose();}
  lifetime.throwIfAborted();if(view.annotations?.get(input.sourceFrameId)!==baseline||view.annotationDocument!==view.document)throw stale();
  const anchor=anchors[0],frame=preview?.frame??baseline.result.frame,inset=29;
  const painted=selections.map((selection,index)=>{
    if(selection.virtualSelection){const value=selection.virtualSelection;return{kind:'virtual',rect:value.viewportRect,marker:value.viewportPoint};}
    if(selection.textSelection){const value=selection.textSelection;return{kind:'text',rect:value.viewportRect,rects:value.viewportSelectionRects,marker:{x:Math.max(inset,Math.min(frame.geometry.layoutWidth-inset,value.viewportPoint.x)),y:Math.max(inset,Math.min(frame.geometry.layoutHeight-inset,value.viewportPoint.y))}};}
    let region=selection.region,point=selection.point;
    if(preview&&selection.original){
      const selected=index===0?preview.element:preview.elements?.find(element=>element.key===selection.original.key);
      if(!selected)throw stale();
      if(!selected.region){if(index===0&&preview.skipScreenshot)return null;throw stale();}
      const relativeX=Math.max(0,Math.min(1,(point.x-region.x)/region.width)),relativeY=Math.max(0,Math.min(1,(point.y-region.y)/region.height));
      region=selected.region;point={x:region.x+relativeX*region.width,y:region.y+relativeY*region.height};
    }else if(preview){
      const rect=anchors[index].rect,geometry=frame.geometry;
      region={x:(rect.x-geometry.offsetX)/geometry.width,y:(rect.y-geometry.pageY)/geometry.height,width:rect.width/geometry.width,height:rect.height/geometry.height};
      const originalGeometry=baseline.result.frame.geometry;
      point={x:(point.x*originalGeometry.width+originalGeometry.offsetX-geometry.offsetX)/geometry.width,y:(point.y*originalGeometry.height+originalGeometry.pageY-geometry.pageY)/geometry.height};
    }
    return{kind:anchors[index].kind,rect:viewportRect(region,frame.geometry),marker:{x:Math.max(inset,Math.min(frame.geometry.layoutWidth-inset,frame.geometry.offsetX+point.x*frame.geometry.width)),y:Math.max(inset,Math.min(frame.geometry.layoutHeight-inset,frame.geometry.offsetY+point.y*frame.geometry.height))}};
  }).filter(Boolean);
  const marker=painted[0]?.marker??{x:baseline.result.frame.geometry.offsetX+input.selectionPoint.x*baseline.result.frame.geometry.width,y:baseline.result.frame.geometry.offsetY+input.selectionPoint.y*baseline.result.frame.geometry.height};
  const viewportSize={width:frame.geometry.layoutWidth,height:frame.geometry.layoutHeight};
  const commentId=randomUUID();
  const now=new Date().toISOString();
  let group=preview?{id:commentId,anchor,targetLabel:anchor.title,selector:anchor.selector??null,createdAt:now,updatedAt:now,status:'queued',
    declarations:Object.entries(preview.changes).map(([property,value])=>({property,value,previousValue:original.styles[property]??''})),
    ...(preview.text&&preview.text.value!==preview.text.previousValue?{text:{...preview.text}}:{}),
    provenance:[],viewportSize,...(themeVariant?{themeVariant}:{}),comment:body}:null;
  if(group&&!group.text&&!group.declarations.some(value=>value.value!==value.previousValue)){if(!body)throw invalid('请填写批注说明或实际变更');group=null;}
  const differences=group?[...(group.text?[`text: ${group.text.previousValue} -> ${group.text.value}`]:[]),...group.declarations.filter(value=>value.value!==value.previousValue).map(value=>`${value.property}: ${value.previousValue} -> ${value.value}`)].join('\n'):null;
  const text=group?(body?body+'\n'+differences:differences):body;
  const number=options.commentNumber??1;
  if(!Number.isSafeInteger(number)||number<1)throw invalid('批注序号无效');
  const crop=input.cropScreenshotToRegion===true&&!original&&selections.length===1;
  const skipScreenshot=!!virtualSelection||preview?.skipScreenshot===true;
  const screenshot=skipScreenshot?null:await annotatedScreenshot(frame,painted,{crop,compact:options.compact===true&&selections.length===1,number});
  lifetime.throwIfAborted();if(view.annotations?.get(input.sourceFrameId)!==baseline||input.previewFrameId!==undefined&&baseline.preview!==preview)throw stale();
  const deliveredAnchors=anchors.map(value=>gatedElementAnchor(value,view.siteAnnotationFeaturesEnabled));
  if(group)group={...group,anchor:deliveredAnchors[0]};
  options.onScreenshotPacket?.({frame:structuredClone(frame),selections:structuredClone(painted),crop,...(skipScreenshot?{skipScreenshot:true}:{})});
  let label=anchor.title.trim();if(!label){try{const url=new URL(anchor.pageUrl);label=url.hostname+(url.pathname==='/'?'':url.pathname);}catch{label=anchor.pageUrl;}}
  return{type:'comment',origin:'browser',content:[{content_type:'text',text}],position:{side:'right',path:'browser:'+label,line:number},
    localBrowserContext:{pageUrl:anchor.pageUrl,framePath:anchor.framePath,...(anchor.frameUrl?{frameUrl:anchor.frameUrl}:{}),...(textSelection?{selectedText:anchor.selectedText}:{targetDescription:anchor.title}),
      ...(anchor.documentContext?{documentContext:anchor.documentContext}:{}),...elementEvidence(deliveredAnchors[0]),
      ...(deliveredAnchors.length>1?{additionalSelections:deliveredAnchors.slice(1).map(value=>({kind:value.kind,pageUrl:value.pageUrl,framePath:value.framePath,...(value.frameUrl?{frameUrl:value.frameUrl}:{}),targetDescription:value.title,targetPath:value.elementPath,
        ...(value.documentContext?{documentContext:value.documentContext}:{}),...elementEvidence(value),
        ...(value.kind==='region'?{rect:value.rect}:{targetImmediateText:value.immediateText,targetRole:value.role,targetName:value.name,targetSelector:value.selector,nearbyText:value.nearbyText})}))}:{}),
      ...(textSelection?{}:original?{targetImmediateText:anchor.immediateText,targetRole:anchor.role,targetName:anchor.name,targetSelector:anchor.selector,targetPath:anchor.elementPath,nearbyText:anchor.nearbyText}:{targetPath:anchor.elementPath,targetRect:anchor.rect}),
      ...(virtualSelection?{targetRole:anchor.role,targetName:anchor.name,targetSelector:anchor.selector,nearbyText:anchor.nearbyText,virtualTarget:{surfaceId:anchor.surfaceId,targetId:anchor.targetId}}:{})},
    localBrowserCommentMetadata:{browserTabId:view.tabId,commentId,hasAnnotationFeatures:hasAnnotationFeatures(deliveredAnchors,group),kind:anchor.kind,viewportSize,...(original?{markerViewportPoint:marker}:{}),...(themeVariant?{themeVariant}:{})},
    ...(group?{localBrowserDesignChange:{group:{...group,...(screenshot?{screenshot}:{})}}}:{}),...(screenshot?{localBrowserScreenshot:{...screenshot,commentId}}:{})};
}
