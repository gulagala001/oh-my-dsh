import { randomUUID } from 'node:crypto';
import { viewportGeometry, sameScreenshotGeometry } from './browser-screenshot.mjs';
import{annotationDocuments}from'./annotation-documents.mjs';
import{rectPolygon,clipPolygon,mapQuad}from'./annotation-geometry.mjs';

const properties=['display','visibility','opacity','overflow-x','overflow-y','color','background-color','font-size','font-family','font-weight','line-height','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','border-radius'];
const changed=()=>Object.assign(new Error('页面在采集时发生变化，请重新打开批注。'),{code:'ANNOTATION_CHANGED'});
export const annotationSnapshotOptions={computedStyles:properties,includePaintOrder:true,includeDOMRects:true};

// Capture through the existing read-only observation connection. No page input,
// model lease, DOM writes, or selector evaluation is involved in annotation.
export async function captureAnnotation(views,view,signal,{remember=true}={}){
  const lifetime=AbortSignal.any([signal,view.lifetime.signal,view.document.signal].filter(Boolean));
  const read=operation=>views.read(view,operation,lifetime);
  const snapshot=()=>annotationDocuments(views,view,annotationSnapshotOptions,lifetime);
  if(view.dialog)throw new Error('请先处理网页提示，再打开批注。');
  for(let attempt=0;attempt<2;attempt++){
    lifetime.throwIfAborted();
    const loaderId=view.loaderId,before=await snapshot();let after;
    try{
    const captured=await read(views.browser.observeScreenshot(view.record,{},lifetime));
    after=await snapshot();const geometry=viewportGeometry(await read(view.cdp.send('Page.getLayoutMetrics')));
    lifetime.throwIfAborted();
    if(view.closed||loaderId!==view.loaderId)throw changed();
    // Compare DOM, rendered bounds and selected computed styles on both sides
    // of the capture. Never attach new element metadata to older preview pixels.
    if(JSON.stringify(before.signature)!==JSON.stringify(after.signature)||!sameScreenshotGeometry(captured.screenshotFrame,geometry)){if(!attempt)continue;throw changed();}
    const elements=[],entries=after.entries,mainClip=rectPolygon(geometry.offsetX,geometry.offsetY,geometry.width,geometry.height);
    for(const entry of entries.values()){
      const {nodes,layout}=entry.document;entry.layoutByNode=new Map(layout.nodeIndex.map((n,i)=>[n,i]));
      entry.string=index=>entry.strings[index]??'';
      entry.identity=index=>{const attrs={},list=nodes.attributes[index]??[];for(let i=0;i<list.length;i+=2)attrs[entry.string(list[i])]=entry.string(list[i+1]);return{tag:entry.string(nodes.nodeName[index]).toLowerCase(),...(attrs.id?{id:attrs.id}:{}),...(attrs.class?{className:attrs.class}:{}),...(attrs.role?{role:attrs.role}:{}),...(attrs['aria-label']?{label:attrs['aria-label']}:{}),...(attrs.title?{title:attrs.title}:{})};};
    }
    const localRect=(entry,index,i)=>{
      const {nodes,layout}=entry.document,[x,y,w,h]=layout.bounds[i];let left=x,top=y,right=x+w,bottom=y+h;
      for(let parent=nodes.parentIndex[index];parent>=0;parent=nodes.parentIndex[parent]){const a=entry.layoutByNode.get(parent);if(a===undefined)continue;const [ax,ay,aw,ah]=layout.bounds[a],values=layout.styles[a];
        if(entry.string(values?.[properties.indexOf('opacity')])==='0')return[];
        if(['hidden','clip','scroll','auto'].includes(entry.string(values?.[properties.indexOf('overflow-x')]))){left=Math.max(left,ax);right=Math.min(right,ax+aw);}
        if(['hidden','clip','scroll','auto'].includes(entry.string(values?.[properties.indexOf('overflow-y')]))){top=Math.max(top,ay);bottom=Math.min(bottom,ay+ah);}
      }
      return right>left&&bottom>top?rectPolygon(left,top,right-left,bottom-top):[];
    };
    const mapping=entry=>{
      if(entry.mapping)return entry.mapping;
      if(!entry.owner)return entry.mapping={point:p=>p,clip:mainClip,paintPrefix:[],framePath:[]};
      const parent=entries.get(entry.owner.frameId),root=entries.get(entry.owner.rootId),parentMap=mapping(parent),rootMap=mapping(root);
      if(!entry.owner.quad||!parentMap.clip.length||!entry.viewport.width||!entry.viewport.height)return entry.mapping={point:p=>p,clip:[],paintPrefix:[],framePath:[]};
      const quad=[];for(let i=0;i<8;i+=2)quad.push(rootMap.point({x:entry.owner.quad[i],y:entry.owner.quad[i+1]}));
      const ownerIndex=parent.document.nodes.backendNodeId.indexOf(entry.owner.backendNodeId),layoutIndex=parent.layoutByNode.get(ownerIndex);
      const ownerPolygon=layoutIndex===undefined?[]:localRect(parent,ownerIndex,layoutIndex).map(p=>parentMap.point({x:p.x-parent.viewport.scrollX,y:p.y-parent.viewport.scrollY}));
      const clip=clipPolygon(clipPolygon(quad,parentMap.clip),ownerPolygon);
      return entry.mapping={point:mapQuad(quad,entry.viewport.width,entry.viewport.height),clip,paintPrefix:[...parentMap.paintPrefix,parent.document.layout.paintOrders?.[layoutIndex]??layoutIndex],framePath:[...parentMap.framePath,{...parent.identity(ownerIndex),url:entry.string(entry.document.documentURL)}]};
    };
    let truncated=false;
    for(const entry of entries.values()){
    const {nodes,layout}=entry.document,string=entry.string,identity=entry.identity,map=mapping(entry);if(!map.clip.length)continue;
    for(let i=0;i<layout.nodeIndex.length;i++){
      const index=layout.nodeIndex[i];if(nodes.nodeType[index]!==1)continue;
      const styles=Object.fromEntries(properties.map((p,j)=>[p,string(layout.styles[i]?.[j])]));
      if(styles.display==='none'||styles.visibility==='hidden'||Number(styles.opacity)===0)continue;
      const raw=localRect(entry,index,i);if(!raw.length)continue;
      const polygon=clipPolygon(raw.map(p=>map.point({x:p.x-entry.viewport.scrollX,y:p.y-entry.viewport.scrollY})),map.clip).map(p=>({x:(p.x-geometry.offsetX)/geometry.width,y:(p.y-geometry.offsetY)/geometry.height}));
      if(polygon.length<3)continue;
      const left=Math.min(...polygon.map(p=>p.x)),top=Math.min(...polygon.map(p=>p.y)),right=Math.max(...polygon.map(p=>p.x)),bottom=Math.max(...polygon.map(p=>p.y));if(right-left<1e-7||bottom-top<1e-7)continue;
      if(elements.length>=5000){truncated=true;break;}
      const ancestry=[];let parent=nodes.parentIndex[index];
      while(parent>=0&&ancestry.length<30){if(nodes.nodeType[parent]===1)ancestry.unshift(identity(parent));parent=nodes.parentIndex[parent];}
      // Direct text children suffice to identify labels without copying an
      // entire document (or unrelated form values) into every element record.
      const text=[];for(let child=index+1;child<nodes.nodeType.length&&child<index+100;child++){if(nodes.parentIndex[child]===index&&nodes.nodeType[child]===3)text.push(string(nodes.nodeValue[child]));}
      elements.push({key:entry.frameId+':'+nodes.backendNodeId[index],backendNodeId:nodes.backendNodeId[index],frameId:entry.frameId,framePath:map.framePath,...identity(index),text:text.join(' ').trim().slice(0,500),ancestry,styles,paintOrder:layout.paintOrders?.[i]??i,paintPath:[...map.paintPrefix,layout.paintOrders?.[i]??i],polygon,region:{x:left,y:top,width:right-left,height:bottom-top}});
    }
    }
    const result={frame:{id:randomUUID(),tabId:view.tabId,loaderId,data:captured.screenshot,mediaType:'image/png',at:Date.now(),url:view.record.page.url(),geometry},elements,truncated,childFrames:Math.max(0,entries.size-1)};
    if(remember){view.annotations??=new Map();view.annotations.set(result.frame.id,{result,dom:after.signature});while(view.annotations.size>4)view.annotations.delete(view.annotations.keys().next().value);}
    return result;
    }finally{await Promise.all([before.dispose(),after?.dispose()]);}
  }
}
