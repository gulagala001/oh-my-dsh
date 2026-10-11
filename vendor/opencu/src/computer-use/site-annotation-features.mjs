import {randomUUID} from 'node:crypto';
import {annotationSurfaceController,applyAnnotationSurfaceFeaturesEnabled} from './annotation-surface-controller.mjs';
import {annotationSiteControlsController} from './annotation-site-controls.mjs';
import {siteAnnotationHostname} from './site-annotation-settings.mjs';

const states=new WeakMap();
const fail=(message,code='INVALID_SITE_ANNOTATION_FEATURES')=>Object.assign(new Error(message),{code});
const changed=()=>fail('页面或站点批注预览已经改变','SITE_ANNOTATION_FEATURES_CHANGED');
const serialize=(state,work)=>{const pending=state.tail.catch(()=>{}).then(work);state.tail=pending.catch(()=>{});return pending;};
const scope=(view,signal)=>AbortSignal.any([signal,view.document.signal,view.lifetime.signal].filter(Boolean));
const canPreview=options=>typeof options.canPreview==='function'?options.canPreview()===true:options.canPreview===true;

// Source Of, fx/px, ax/ex/nx, o_/S_/C_ and cx. This shares the existing
// surface and controls objects, and never creates another page registry.
function sourceSiteAnnotationFeatures(binding){
  const rootId='codex-browser-sidebar-comments-root',attrs=['oai-annotation-container','oai-annotation-container-text','oai-annotatable','oai-annotation-metadata'];
  let disposed=false,revision=0,features=[],preview=null,host=null,layer=null,mask=null,backdrop=null,raf=null,scan=null,targets=[],motion=new Map();
  const roots=new Set(),observers=new Map(),windows=new Set(),clips=new Map(),used=new Set();let surfaceTargets=[],controlTargets=[],controlUses=[];
  const surfaces={getTargets:()=>surfaceTargets.filter(node=>node.isConnected&&node.ownerDocument===document)};
  const controls={getTargets:()=>controlTargets.filter(node=>node.isConnected&&node.ownerDocument===document),getFeatureUses:()=>controlUses};
  const candidates=new Set(),resizeObserver=new ResizeObserver(()=>restart()),intersectionObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(candidates.has(entry.target)){if(entry.isIntersecting)resizeObserver.observe(entry.target);else resizeObserver.unobserve(entry.target);}restart();});
  const events=['scroll','load','animationstart','animationend','animationcancel','transitionrun','transitionend','transitioncancel','toggle','fullscreenchange'];
  const parent=node=>node.assignedSlot??node.parentElement??node.getRootNode()?.host??null;
  const element=node=>node?.nodeType===1&&node.ownerDocument?.defaultView!=null&&typeof node.getBoundingClientRect==='function';
  const own=node=>node?.id===rootId||node?.closest?.('#'+rootId)!=null||node?.getRootNode?.()?.host?.id===rootId;
  const metadata=value=>{
    if(typeof value!=='string'||value.length>2048||new TextEncoder().encode(value).byteLength>2048)return null;
    try{const data=JSON.parse(value),proto=data&&Object.getPrototypeOf(data);if(!data||typeof data!=='object'||proto!==Object.prototype&&proto!==null)return null;
      const descriptors=Object.getOwnPropertyDescriptors(data),keys=Reflect.ownKeys(descriptors);
      if(keys.length>6||keys.some(key=>typeof key!=='string'||key.length>64||['__proto__','constructor','prototype'].includes(key)||!/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z0-9_-]+)*$/.test(key)))return null;
      for(const property of Object.values(descriptors)){const item=property.value;if(!property.enumerable||!Object.hasOwn(property,'value')||!(item===null||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item)||typeof item==='string'&&item.length<=256&&/^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(item)))return null;}
      const serialized=JSON.stringify(data);return serialized.length<=2048&&new TextEncoder().encode(serialized).byteLength<=2048?data:null;
    }catch{return null;}
  };
  const walk=(root,visit)=>{for(const node of root.querySelectorAll('*')){if(!element(node)||own(node))continue;visit(node);if(node.shadowRoot){observeRoot(node.shadowRoot);walk(node.shadowRoot,visit);}}};
  const all=(includeFrames=false)=>{
    const result=[],seen=new Set(),queue=[document];
    while(queue.length){const doc=queue.shift();if(seen.has(doc))continue;seen.add(doc);observeRoot(doc);walk(doc,node=>{
      result.push(node);if(includeFrames&&node.tagName?.toLowerCase()==='iframe')try{if(node.contentWindow?.document)queue.push(node.contentWindow.document);}catch{}
    });}return result;
  };
  const validMetadata=node=>node instanceof node.ownerDocument.defaultView.HTMLElement&&node!==node.ownerDocument.body&&node!==node.ownerDocument.documentElement&&node.hasAttribute('oai-annotatable')&&Object.keys(metadata(node.getAttribute('oai-annotation-metadata'))??{}).length>0;
  function inspect(){
    for(const root of [...roots]){const doc=root.host?.ownerDocument??root;let stale=root.host?!root.host.isConnected:false;
      if(doc!==document)try{stale=stale||doc.defaultView?.frameElement?.contentDocument!==doc;}catch{stale=true;}
      if(stale){observers.get(root)?.disconnect();observers.delete(root);roots.delete(root);for(const event of events)root.removeEventListener(event,onMotion,true);
        if(![...roots].some(value=>(value.host?.ownerDocument??value)===doc)){if(doc.documentElement)resizeObserver.unobserve(doc.documentElement);const win=doc.defaultView;if(win&&windows.delete(win)){win.removeEventListener('resize',restart);win.visualViewport?.removeEventListener('resize',restart);win.visualViewport?.removeEventListener('scroll',restart);}}
      }
    }
    const nodes=all(),next=[];
    for(const feature of controls.getFeatureUses())if(['controls','mode-toggle','requests','requests-with-prompts','metadata'].includes(feature))used.add(feature);
    if(nodes.some(node=>attrs.slice(0,2).some(attr=>node.hasAttribute(attr))))next.push('containers');
    if(controls.getTargets().length)used.add('controls');if(used.has('controls'))next.push('controls');
    if(surfaces.getTargets().length)used.add('surfaces');if(used.has('surfaces'))next.push('surfaces');
    if(nodes.some(validMetadata))next.push('metadata-with-targets');else if(used.has('metadata'))next.push('metadata');
    if(used.has('mode-toggle'))next.push('mode-toggle');
    if(used.has('requests-with-prompts'))next.push('requests-with-prompts');else if(used.has('requests'))next.push('requests');
    if(JSON.stringify(next)!==JSON.stringify(features)){features=next;revision++;try{globalThis[binding](JSON.stringify({revision}));}catch{}}
    return{features:[...features],revision,siteUrl:location.href,preview:preview?{...preview}:null};
  }
  function observeRoot(root){
    if(observers.has(root))return;roots.add(root);
    const observer=new MutationObserver(records=>{if(disposed||records.every(record=>own(record.target.nodeType===1?record.target:record.target.host??record.target.parentElement??{})))return;inspect();restart();});
    observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:[...attrs,'class','style','hidden','open','popover']});observers.set(root,observer);
    for(const event of events)root.addEventListener(event,onMotion,true);
    const doc=root.host?.ownerDocument??root,win=doc.defaultView;
    if(doc.documentElement)resizeObserver.observe(doc.documentElement);
    if(win&&!windows.has(win)){windows.add(win);win.addEventListener('resize',restart);win.visualViewport?.addEventListener('resize',restart);win.visualViewport?.addEventListener('scroll',restart);}
  }
  function onMotion(event){if(element(event.target)&&own(event.target))return;
    if(['animationstart','transitionrun'].includes(event.type)&&element(event.target))for(const animation of event.target.getAnimations?.()??[]){const frames=animation.effect?.getKeyframes?.()??[];if(frames.some(frame=>Object.keys(frame).some(key=>/^(width|height|minWidth|maxWidth|minHeight|maxHeight|margin.*|padding.*|border.*Width|fontSize|fontWeight|lineHeight|letterSpacing|wordSpacing|flex.*|grid.*|gap|rowGap|columnGap|display|position|float|clear|order|align.*|justify.*)$/.test(key))))motion.set(animation,event.target);}
    inspect();restart();
  }
  const intersection=(a,b,x=true,y=true)=>{const left=x?Math.max(a.x,b.x):a.x,top=y?Math.max(a.y,b.y):a.y,right=x?Math.min(a.x+a.width,b.x+b.width):a.x+a.width,bottom=y?Math.min(a.y+a.height,b.y+b.height):a.y+a.height;return right>left&&bottom>top?{x:left,y:top,width:right-left,height:bottom-top}:null;};
  const containing=(css,position)=>position==='absolute'&&css.position&&css.position!=='static'||[css.transform,css.translate,css.rotate,css.scale,css.perspective,css.filter,css.backdropFilter].some(value=>value&&value!=='none')||css.contentVisibility==='auto'||css.containerType&&css.containerType!=='normal'||css.contain.split(/\s+/).some(value=>['content','layout','paint','strict'].includes(value))||css.willChange.split(/\s*,\s*/).some(value=>['backdrop-filter','contain','filter','perspective','rotate','scale','transform','translate'].includes(value));
  const clipping=(rect,node,win)=>{
    const chain=new Set();let current=node;
    while(current){const position=win.getComputedStyle(current).position;let p=parent(current);if(position==='absolute'||position==='fixed')while(p&&p!==win.document.body&&p!==win.document.documentElement&&!containing(win.getComputedStyle(p),position))p=parent(p);if(!p||p===win.document.body||p===win.document.documentElement)break;chain.add(p);current=p;}
    for(let p=parent(node);p&&p!==win.document.body&&p!==win.document.documentElement;p=parent(p))if(chain.has(p)){
      const css=win.getComputedStyle(p),x=['hidden','clip','scroll','auto'].includes(css.overflowX||css.overflow),y=['hidden','clip','scroll','auto'].includes(css.overflowY||css.overflow);
      if(x||y){const box=p.getBoundingClientRect(),sx=p.offsetWidth>0?box.width/p.offsetWidth:1,sy=p.offsetHeight>0?box.height/p.offsetHeight:1;rect=intersection(rect,{x:box.x+p.clientLeft*sx,y:box.y+p.clientTop*sy,width:p.clientWidth*sx,height:p.clientHeight*sy},x,y);if(!rect)break;}
    }return rect;
  };
  const geometry=node=>{
    let win=node.ownerDocument.defaultView;if(!win)return null;
    const b=node.getBoundingClientRect();let rect={x:b.x,y:b.y,width:b.width,height:b.height},clip={x:0,y:0,width:win.innerWidth,height:win.innerHeight},current=node;
    const radiusScale={x:node.offsetWidth>0?b.width/node.offsetWidth:1,y:node.offsetHeight>0?b.height/node.offsetHeight:1};
    while(win&&clip){clip=clipping(clip,current,win);if(!clip)return null;if(win===window)return{element:node,rect,clipRect:clip,radiusScale,style:node.ownerDocument.defaultView.getComputedStyle(node)};
      let frame;try{frame=win.frameElement;}catch{return null;}if(!element(frame)||!frame.isConnected)return null;
      const box=frame.getBoundingClientRect(),sx=frame.offsetWidth>0?box.width/frame.offsetWidth:1,sy=frame.offsetHeight>0?box.height/frame.offsetHeight:1,map=value=>({x:box.x+(frame.clientLeft+value.x)*sx,y:box.y+(frame.clientTop+value.y)*sy,width:value.width*sx,height:value.height*sy});
      rect=map(rect);clip=intersection(map(clip),{x:box.x+frame.clientLeft*sx,y:box.y+frame.clientTop*sy,width:frame.clientWidth*sx,height:frame.clientHeight*sy});radiusScale.x*=sx;radiusScale.y*=sy;current=frame;win=frame.ownerDocument.defaultView;
    }return null;
  };
  const selectable=node=>{
    const doc=node.ownerDocument,win=doc.defaultView;let candidate=null;
    for(let current=node;current?.ownerDocument===doc;current=parent(current)){
      if(current.hasAttribute('oai-annotation-container-text'))return null;
      const container=current.hasAttribute('oai-annotation-container'),root=current===doc.body||current===doc.documentElement;
      if(!root&&!container&&!candidate&&current.hasAttribute('oai-annotatable')){const r=current.getBoundingClientRect();if(r.width>0&&r.height>0&&r.left<win.innerWidth&&r.right>0&&r.top<win.innerHeight&&r.bottom>0&&(typeof current.checkVisibility!=='function'||current.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})))candidate=current;}
      if(container)return candidate??document.documentElement;
    }
  };
  const contains=(boundary,node)=>{for(let n=node;n;n=parent(n))if(n===boundary)return true;return false;};
  const depends=(source,target)=>{const win=source.ownerDocument.defaultView;if(!win)return false;for(let node=source;node;){const css=win.getComputedStyle(node);if(css.position==='absolute'||css.position==='fixed')return false;const p=parent(node);if(!p)return false;
    for(let current=target;current;){if(current===p)return true;const ancestor=parent(current);if(ancestor)current=ancestor;else try{current=current.ownerDocument.defaultView?.frameElement;}catch{return false;}}
    if(win.getComputedStyle(p).contain.split(/\s+/).some(value=>value==='size'||value==='strict'))return false;node=p;
  }return false;};
  const visible=node=>{
    let current=node;
    while(current){const doc=current.ownerDocument,modals=[],popovers=[];
      if(doc.fullscreenElement&&!contains(doc.fullscreenElement,current))return false;
      for(const root of roots)if((root.host?.ownerDocument??root)===doc)for(const item of root.querySelectorAll('dialog[open], [popover]')){
        if(own(item))continue;if(item.matches(':modal'))modals.push(item);else if(item.matches(':popover-open'))popovers.push(item);
      }
      let modal=modals[0];if(modals.length>1)for(let n of [doc.activeElement,doc.elementFromPoint?.(0,0)]){while(n?.shadowRoot?.activeElement)n=n.shadowRoot.activeElement;for(;element(n);n=parent(n))if(modals.includes(n)){modal=n;break;}if(modal&&modal!==modals[0])break;}
      if(modals.length&&(modal?!contains(modal,current):modals.some(value=>!contains(value,current))))return false;
      const r=current.getBoundingClientRect();for(const popover of popovers)if(!contains(popover,current)){const box=popover.getBoundingClientRect();if(r.left<box.right&&r.right>box.left&&r.top<box.bottom&&r.bottom>box.top)return false;}
      try{current=current.ownerDocument.defaultView?.frameElement;}catch{return false;}
    }return true;
  };
  const svg=(name,attrs={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
  const corners=target=>{const {width,height}=target.rect,scale=target.radiusScale;
    const values=[target.style.borderTopLeftRadius,target.style.borderTopRightRadius,target.style.borderBottomRightRadius,target.style.borderBottomLeftRadius].map(value=>{const [x,y=x]=value.trim().split(/\s+/),parse=(v,size,s)=>{const n=Number.parseFloat(v);return Number.isFinite(n)?Math.max(0,v.endsWith('%')?n*size/100:n*s):0;};return{x:parse(x,width,scale.x),y:parse(y,height,scale.y)};});
    const [a,b,c,d]=values,k=Math.min(1,width/(a.x+b.x),width/(d.x+c.x),height/(a.y+d.y),height/(b.y+c.y));for(const value of values){value.x*=k;value.y*=k;}return values;
  };
  function showPopover(){if(layer?.isConnected&&typeof layer.showPopover==='function')try{if(!layer.matches(':popover-open'))layer.showPopover();}catch{}}
  function paint(){
    if(!layer)return;const wanted=new Set(targets.map(value=>value.element));mask.ownerSVGElement.setAttribute('width',String(innerWidth));mask.ownerSVGElement.setAttribute('height',String(innerHeight));mask.replaceChildren(svg('rect',{x:0,y:0,width:innerWidth,height:innerHeight,fill:'white'}));
    targets.forEach((target,index)=>{const {rect:r,clipRect:c}=target,[a,b,d,e]=corners(target);let item=clips.get(target.element);
      if(!item){const clip=document.createElement('div'),glow=document.createElement('div');clip.className='annotation-feature-clip';glow.className='annotation-feature-glow';clip.append(glow);layer.append(clip);clips.set(target.element,item={clip,glow});}
      Object.assign(item.clip.style,{left:c.x+'px',top:c.y+'px',width:c.width+'px',height:c.height+'px'});
      Object.assign(item.glow.style,{left:r.x-c.x+'px',top:r.y-c.y+'px',width:r.width+'px',height:r.height+'px',borderRadius:`${a.x}px ${b.x}px ${d.x}px ${e.x}px / ${a.y}px ${b.y}px ${d.y}px ${e.y}px`});
      const id=mask.id+'-'+index,clip=svg('clipPath',{id,clipPathUnits:'userSpaceOnUse'});clip.append(svg('rect',c));mask.parentElement.append(clip);
      const right=r.x+r.width,bottom=r.y+r.height,path=`M${r.x+a.x} ${r.y} H${right-b.x} A${b.x} ${b.y} 0 0 1 ${right} ${r.y+b.y} V${bottom-d.y} A${d.x} ${d.y} 0 0 1 ${right-d.x} ${bottom} H${r.x+e.x} A${e.x} ${e.y} 0 0 1 ${r.x} ${bottom-e.y} V${r.y+a.y} A${a.x} ${a.y} 0 0 1 ${r.x+a.x} ${r.y} Z`;
      mask.append(svg('path',{d:path,fill:'black','clip-path':'url(#'+id+')'}));
    });
    for(const [node,item]of clips)if(!wanted.has(node)){item.clip.remove();clips.delete(node);}backdrop.hidden=targets.length===0;showPopover();
  }
  function tick(){
    raf=null;if(disposed||!preview||!layer)return;
    if(!scan){const nodes=preview.feature==='controls'?controls.getTargets():all(preview.feature==='containers').filter(node=>node!==node.ownerDocument.body&&node!==node.ownerDocument.documentElement&&node.hasAttribute('oai-annotatable')&&(preview.feature!=='metadata'||validMetadata(node)));
      const next=new Set(nodes);for(const node of candidates)if(!next.has(node)){intersectionObserver.unobserve(node);resizeObserver.unobserve(node);candidates.delete(node);}for(const node of nodes)if(!candidates.has(node)){candidates.add(node);intersectionObserver.observe(node);}
      scan={candidates:nodes[Symbol.iterator](),targets:[],moving:false};for(const [animation,node]of motion)if(!node.isConnected||animation.playState!=='running')motion.delete(animation);
    }
    let complete=false;for(let index=0;index<128;index++){const next=scan.candidates.next();if(next.done){complete=true;break;}const node=next.value;
      if(!element(node)||!node.isConnected||own(node)||!visible(node)||node.ownerDocument.defaultView.getComputedStyle(node).visibility!=='visible'||typeof node.checkVisibility==='function'&&!node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
      if(preview.feature==='controls'&&surfaces.getTargets().includes(node))continue;
      if(preview.feature==='metadata'&&!validMetadata(node))continue;
      if(preview.feature==='containers'){if(selectable(node)!==node)continue;let win=node.ownerDocument.defaultView,valid=true;while(win&&win!==window){let frame;try{frame=win.frameElement;}catch{valid=false;break;}if(!element(frame)||selectable(frame)!==undefined){valid=false;break;}win=frame.ownerDocument.defaultView;}if(!valid||win!==window)continue;}
      const target=geometry(node);if(!target||target.rect.width<=0||target.rect.height<=0||!intersection(target.rect,target.clipRect))continue;
      scan.targets.push(target);for(let p=node;p;p=parent(p))if(p.getAnimations?.().some(value=>value.playState==='running'))scan.moving=true;
      if(scan.targets.length===128){complete=true;break;}
    }
    targets=scan.targets;for(const clip of mask.parentElement.querySelectorAll('clipPath'))clip.remove();paint();
    if(complete){const moving=scan.moving||targets.some(value=>[...motion.values()].some(node=>depends(node,value.element)));scan=null;if(moving)raf=requestAnimationFrame(tick);}else raf=requestAnimationFrame(tick);
  }
  function restart(){scan=null;if(preview&&!disposed&&raf===null)raf=requestAnimationFrame(tick);}
  function clear(){preview=null;scan=null;targets=[];if(raf!==null)cancelAnimationFrame(raf);raf=null;clips.clear();
    for(const node of candidates){intersectionObserver.unobserve(node);resizeObserver.unobserve(node);}candidates.clear();
    if(layer)try{if(layer.matches(':popover-open'))layer.hidePopover();}catch{}host?.remove();host=null;layer=null;mask=null;backdrop=null;return{preview:null,revision};
  }
  function setPreview(value){clear();if(value===null)return{preview:null,revision};
    if(!['containers','controls','metadata'].includes(value.feature)||typeof value.color!=='string'||!CSS.supports('color',value.color))throw TypeError('Invalid annotation feature preview');
    if(document.getElementById(rootId))throw Error('The annotation overlay root is already owned');
    host=document.createElement('div');host.id=rootId;host.setAttribute('aria-hidden','true');const shadow=host.attachShadow({mode:'closed'});
    layer=document.createElement('div');layer.dataset.siteAnnotationPreview=value.feature;layer.popover='manual';layer.style.color=value.color;
    const style=document.createElement('style');style.textContent='[data-site-annotation-preview]{position:fixed;inset:0;width:auto;height:auto;max-width:none;max-height:none;margin:0;border:0;padding:0;background:transparent;overflow:visible;pointer-events:none;contain:layout style}[data-site-annotation-preview]::backdrop{background:transparent;pointer-events:none}.annotation-feature-backdrop{position:absolute;inset:0;pointer-events:none;backdrop-filter:grayscale(1);background:color-mix(in srgb,Canvas 50%,transparent);mask-repeat:no-repeat}.annotation-feature-clip{position:fixed;overflow:clip;pointer-events:none}.annotation-feature-glow{position:absolute;pointer-events:none;animation:annotation-preview-appear 150ms ease-out both}.annotation-feature-glow::before{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:0 0 12px color-mix(in srgb,currentColor 32%,transparent),inset 0 0 16px color-mix(in srgb,currentColor 20%,transparent);filter:blur(3px)}@keyframes annotation-preview-appear{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.annotation-feature-glow{animation:none}}';
    const image=svg('svg',{width:0,height:0}),defs=svg('defs');mask=svg('mask',{id:'annotation-feature-mask-'+crypto.randomUUID(),maskUnits:'userSpaceOnUse'});defs.append(mask);image.append(defs);
    backdrop=document.createElement('div');backdrop.className='annotation-feature-backdrop';backdrop.style.maskImage='url("#'+mask.id+'")';layer.append(style,image,backdrop);shadow.append(layer);(document.body??document.documentElement).append(host);preview={...value};showPopover();restart();return{preview:{...preview},revision};
  }
  function featureEvent(event){
    const type=event?.type;if(type==='codex:annotation-surface-response')try{globalThis[binding](JSON.stringify({surfaceChanged:true}));}catch{}
    if(['codex:register-annotation-controls','codex:update-annotation-controls','codex:dispose-annotation-controls'].includes(type))try{globalThis[binding](JSON.stringify({controlsChanged:true}));}catch{}
    inspect();restart();
  }
  const visibility=()=>{if(document.visibilityState==='hidden')clear();};
  document.addEventListener('codex:annotation-surface-response',featureEvent);document.addEventListener('codex:annotation-shadow-root-attached',featureEvent);window.addEventListener('pageshow',featureEvent);document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',clear);
  for(const event of ['codex:register-annotation-controls','codex:update-annotation-controls','codex:dispose-annotation-controls'])window.addEventListener(event,featureEvent);
  inspect();
  return{inspect,setPreview,clear,setSurfaceTargets(...nodes){surfaceTargets=nodes;inspect();restart();},setControlTargets(uses,...nodes){controlUses=uses;controlTargets=nodes;inspect();restart();},recordUse(feature){if(['mode-toggle','requests','requests-with-prompts','metadata'].includes(feature)){used.add(feature);inspect();}},dispose(){
    if(disposed)return;disposed=true;clear();resizeObserver.disconnect();intersectionObserver.disconnect();for(const [root,observer]of observers){observer.disconnect();for(const event of events)root.removeEventListener(event,onMotion,true);}observers.clear();roots.clear();
    for(const win of windows){win.removeEventListener('resize',restart);win.visualViewport?.removeEventListener('resize',restart);win.visualViewport?.removeEventListener('scroll',restart);}windows.clear();
    document.removeEventListener('codex:annotation-surface-response',featureEvent);document.removeEventListener('codex:annotation-shadow-root-attached',featureEvent);window.removeEventListener('pageshow',featureEvent);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',clear);
    for(const event of ['codex:register-annotation-controls','codex:update-annotation-controls','codex:dispose-annotation-controls'])window.removeEventListener(event,featureEvent);
  }};
}

function requireOptions(options){if(!options?.owner||!['object','function'].includes(typeof options.owner)||typeof options.settings?.isEnabled!=='function')throw fail('站点批注缺少真实归属或偏好服务');}
function identity(view,state){return{tabId:view.tabId,loaderId:view.loaderId,documentId:state.documentId};}
function validate(view,state,input){const actual=identity(view,state),sent=input?.documentIdentity;if(state.disposed||state.document!==view.document||state.document.signal.aborted||view.lifetime.signal.aborted||!sent||Object.keys(actual).some(key=>sent[key]!==actual[key])||input.siteUrl!==view.record.page.url())throw changed();}
async function call(views,view,state,method,args=[],signal){if(state.disposed||state.document!==view.document||!state.objectId)throw changed();
  const operation=state.cdp.send('Runtime.callFunctionOn',{objectId:state.objectId,functionDeclaration:'function(method,...args){return this[method](...args);}',arguments:[{value:method},...args.map(value=>({value}))],returnByValue:true,awaitPromise:true});let result;
  try{result=await views.read(view,operation,signal);}catch(error){const late=await operation.catch(()=>null);if(method==='setPreview'&&state.attempt&&late&&!late.exceptionDetails&&late.result?.value){state.attempt.landed=true;state.attempt.preview=late.result.value.preview;}throw error;}
  if(result.exceptionDetails||state.disposed||state.document!==view.document)throw changed();return result.result?.value;
}
async function borrowTargets(views,view,state,source,method,values,signal){
  if(state.disposed||state.document!==view.document||source.document!==state.document||source.disposed||!source.objectId)throw changed();
  const read=operation=>views.read(view,operation,signal),release=[];let arrayId;
  try{
    const collecting=source.cdp.send('Runtime.callFunctionOn',{objectId:source.objectId,functionDeclaration:'function(){return this.getTargets();}',returnByValue:false});
    let collected;try{collected=await read(collecting);}catch(error){void collecting.then(value=>value.result?.objectId&&source.cdp.send('Runtime.releaseObject',{objectId:value.result.objectId})).catch(()=>{});throw error;}
    arrayId=collected.result?.objectId;if(collected.exceptionDetails||!arrayId)throw changed();
    const listing=source.cdp.send('Runtime.getProperties',{objectId:arrayId,ownProperties:true});let properties;
    try{properties=await read(listing);}catch(error){void listing.then(value=>Promise.all((value.result??[]).filter(item=>item.value?.objectId).map(item=>source.cdp.send('Runtime.releaseObject',{objectId:item.value.objectId}).catch(()=>{})))).catch(()=>{});throw error;}
    const nodes=(properties.result??[]).filter(item=>/^\d+$/.test(item.name)&&item.value?.objectId).map(item=>item.value.objectId);release.push(...nodes.map(objectId=>({cdp:source.cdp,objectId})));
    const mapped=[];
    for(const objectId of nodes){
      const {node}=await read(source.cdp.send('DOM.describeNode',{objectId}));if(!Number.isSafeInteger(node?.backendNodeId)||node.backendNodeId<=0)throw changed();
      const resolving=state.cdp.send('DOM.resolveNode',{backendNodeId:node.backendNodeId,executionContextId:state.contextId});let resolved;
      try{resolved=await read(resolving);}catch(error){void resolving.then(value=>value.object?.objectId&&state.cdp.send('Runtime.releaseObject',{objectId:value.object.objectId})).catch(()=>{});throw error;}
      const target=resolved.object?.objectId;if(!target)throw changed();release.push({cdp:state.cdp,objectId:target});mapped.push({objectId:target});
    }
    const applying=state.cdp.send('Runtime.callFunctionOn',{objectId:state.objectId,functionDeclaration:'function(method,...args){this[method](...args);}',arguments:[{value:method},...values.map(value=>({value})),...mapped],returnByValue:true});let applied;
    try{applied=await read(applying);}catch(error){await applying.catch(()=>{});throw error;}
    if(applied.exceptionDetails||state.disposed||state.document!==view.document)throw changed();
  }finally{await Promise.all([...release.map(({cdp,objectId})=>cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{})),...(arrayId?[source.cdp.send('Runtime.releaseObject',{objectId:arrayId}).catch(()=>{})]:[])]);}
}
async function refreshSurfaceTargets(views,view,state,signal){return borrowTargets(views,view,state,state.surfaces,'setSurfaceTargets',[],signal);}
async function refreshControlTargets(views,view,state,signal){
  const controls=state.controls;if(!controls)return;
  if(controls.disposed||controls.document!==state.document||state.document!==view.document||!Number.isSafeInteger(controls.registrationContextId)||!controls.registrationObjectId)throw changed();
  const operation=controls.cdp.send('Runtime.callFunctionOn',{objectId:controls.registrationObjectId,functionDeclaration:'function(){return this.getFeatureUses();}',returnByValue:true});let result;
  try{result=await views.read(view,operation,signal);}catch(error){await operation.catch(()=>{});throw error;}
  const uses=result.result?.value;if(result.exceptionDetails||!Array.isArray(uses)||uses.some(value=>!['controls','mode-toggle','requests','requests-with-prompts','metadata'].includes(value)))throw changed();
  return borrowTargets(views,view,state,{...controls,objectId:controls.registrationObjectId,contextId:controls.registrationContextId},'setControlTargets',[uses],signal);
}
async function stateFor(views,view,signal){
  let state=states.get(view);if(state?.document===view.document&&!state.disposed){await views.read(view,state.ready,signal);return state;}
  state={views,view,document:view.document,documentId:randomUUID(),tail:Promise.resolve(),disposed:false,objectId:null,active:null,sequences:new WeakMap(),previewRevision:0,revision:0,binding:'opencuSiteAnnotationFeatures_'+randomUUID().replaceAll('-','')};states.set(view,state);
  const bound=event=>{if(state.disposed||state.document!==view.document||event.name!==state.binding||event.executionContextId!==state.contextId)return;let payload;try{payload=JSON.parse(event.payload);}catch{return;}
    if(payload.surfaceChanged===true||payload.controlsChanged===true){void serialize(state,async()=>{await state.ready;if(payload.surfaceChanged===true)await refreshSurfaceTargets(views,view,state,scope(view));if(payload.controlsChanged===true)await refreshControlTargets(views,view,state,scope(view));}).catch(error=>{if(!state.disposed)view.publish?.('warning',{message:error.message});});return;}
    if(!Number.isSafeInteger(payload.revision)||payload.revision<=state.revision)return;state.revision=payload.revision;view.publish?.('site-annotation-features',{tabId:view.tabId,loaderId:view.loaderId,revision:state.revision});};
  const dispose=async()=>{if(state.disposed)return;state.disposed=true;for(const item of [state.document.signal,view.lifetime.signal])item.removeEventListener('abort',dispose);state.cdp?.off('Runtime.bindingCalled',bound);await state.ready?.catch(()=>{});if(state.objectId){await state.cdp.send('Runtime.callFunctionOn',{objectId:state.objectId,functionDeclaration:'function(){this.dispose();}'}).catch(()=>{});await state.cdp.send('Runtime.releaseObject',{objectId:state.objectId}).catch(()=>{});state.objectId=null;}if(state.cdp){await state.cdp.send('Runtime.evaluate',{contextId:state.contextId,expression:'delete globalThis['+JSON.stringify(state.binding)+']',returnByValue:true}).catch(()=>{});await state.cdp.send('Runtime.removeBinding',{name:state.binding}).catch(()=>{});}if(states.get(view)===state)states.delete(view);};
  for(const item of [state.document.signal,view.lifetime.signal])item.addEventListener('abort',dispose,{once:true});state.dispose=dispose;
  state.ready=(async()=>{const lifetime=scope(view),surfaces=await annotationSurfaceController(views,view,lifetime),controls=await annotationSiteControlsController(views,view,lifetime);
    if(surfaces.document!==state.document||controls&&(controls.document!==state.document||surfaces.frameId!==controls.frameId))throw changed();
    const target=controls??surfaces;state.controlsAvailable=controls!=null;state.controls=controls;state.surfaces=surfaces;state.cdp=target.cdp;state.contextId=target.contextId;await views.read(view,state.cdp.send('Runtime.enable'),lifetime);state.cdp.on('Runtime.bindingCalled',bound);
    await views.read(view,state.cdp.send('Runtime.addBinding',{name:state.binding,executionContextId:state.contextId}),lifetime);
    const operation=state.cdp.send('Runtime.callFunctionOn',{objectId:target.objectId,functionDeclaration:'function(binding){return ('+sourceSiteAnnotationFeatures.toString()+')(binding);}',arguments:[{value:state.binding}],returnByValue:false});
    let result;try{result=await views.read(view,operation,lifetime);}catch(error){void operation.then(value=>value.result?.objectId&&state.cdp.send('Runtime.releaseObject',{objectId:value.result.objectId})).catch(()=>{});throw error;}
    if(result.exceptionDetails||!result.result?.objectId)throw changed();state.objectId=result.result.objectId;await refreshSurfaceTargets(views,view,state,lifetime);await refreshControlTargets(views,view,state,lifetime);
  })();
  try{await views.read(view,state.ready,signal);if(state.disposed||state.document!==view.document)throw changed();return state;}catch(error){await dispose();throw error;}
}
async function response(views,view,state,options,extra={}){await refreshControlTargets(views,view,state,options.signal);const value=await call(views,view,state,'inspect',[],options.signal),enabled=options.settings.isEnabled(value.siteUrl),features=value.features;
  if(value.preview===null){state.active=null;state.pendingClear=null;}
  return{available:features.length>0,apiAvailable:true,controlsAvailable:state.controlsAvailable,siteUrl:value.siteUrl,features,siteAnnotationFeatures:features,siteAnnotationFeaturesEnabled:enabled,documentIdentity:identity(view,state),revision:value.revision,siteToolsAvailability:{annotations:features.length?'available':'unavailable'},preview:!state.pendingClear&&state.active?.owner===options.owner?state.active.preview:null,previewRevision:state.previewRevision,...extra};
}

export async function applySiteAnnotationFeaturesEnabled(views,view,options){
  const enabled=options.settings.isEnabled(view.record.page.url());view.siteAnnotationFeaturesEnabled=enabled;
  await applyAnnotationSurfaceFeaturesEnabled(views,view,enabled,options.signal);
  if(!enabled){const state=states.get(view);if(state&&options.insideState===state){await call(views,view,state,'clear',[],options.signal);state.active=null;state.pendingClear=null;state.previewRevision++;}else await clearSiteAnnotationFeaturePreview(view);}return{siteAnnotationFeaturesEnabled:enabled};
}
export async function readSiteAnnotationFeatures(views,view,options){requireOptions(options);await applySiteAnnotationFeaturesEnabled(views,view,options);const state=await stateFor(views,view,options.signal);return serialize(state,()=>response(views,view,state,options));}
export async function setSiteAnnotationFeaturesEnabled(views,view,input,options){requireOptions(options);if(typeof input?.enabled!=='boolean')throw fail('站点批注开关无效');const state=await stateFor(views,view,options.signal);
  return serialize(state,async()=>{validate(view,state,input);const hostname=siteAnnotationHostname(input.siteUrl);if(hostname===null||hostname!==siteAnnotationHostname(view.record.page.url()))throw changed();
    await options.settings.setEnabled(input.siteUrl,input.enabled,{signal:options.signal});validate(view,state,input);await applySiteAnnotationFeaturesEnabled(views,view,{...options,insideState:state});return response(views,view,state,options);
  });
}
export async function setSiteAnnotationFeaturePreview(views,view,input,options){requireOptions(options);if(!Number.isSafeInteger(input?.requestSequence)||input.requestSequence<1||input.preview!==null&&(!input.preview||!['containers','controls','metadata'].includes(input.preview.feature)||typeof input.preview.color!=='string'))throw fail('站点批注预览无效');const state=await stateFor(views,view,options.signal);
  return serialize(state,async()=>{validate(view,state,input);const previous=state.sequences.get(options.owner)??0;if(input.requestSequence<=previous)return response(views,view,state,options,{stale:true,requestSequence:input.requestSequence});state.sequences.set(options.owner,input.requestSequence);
    const previewOwner=state.pendingClear?.owner??state.active?.owner;
    if(input.preview===null&&previewOwner!==options.owner)return response(views,view,state,options,{requestSequence:input.requestSequence});
    const enabled=options.settings.isEnabled(input.siteUrl),preview=enabled&&canPreview(options)?input.preview:null;
    if(preview===null&&previewOwner!==options.owner)return response(views,view,state,options,{requestSequence:input.requestSequence});
    if(preview!==null){await refreshControlTargets(views,view,state,options.signal);const current=await call(views,view,state,'inspect',[],options.signal),feature=preview.feature==='metadata'?'metadata-with-targets':preview.feature;if(!current.features.includes(feature))throw fail('所选站点批注功能目前没有真实目标');validate(view,state,input);}
    const allowed=options.settings.isEnabled(input.siteUrl)&&canPreview(options);
    if(!allowed&&previewOwner!==options.owner)return response(views,view,state,options,{requestSequence:input.requestSequence});
    const attempt={owner:options.owner,document:state.document,requestSequence:input.requestSequence};state.attempt=attempt;
    try{
      const value=await call(views,view,state,'setPreview',[allowed?preview:null],options.signal);attempt.landed=true;attempt.preview=value.preview;validate(view,state,input);
      if(value.preview!==null&&(!options.settings.isEnabled(input.siteUrl)||!canPreview(options))){await call(views,view,state,'clear');state.active=null;}else state.active=value.preview?{owner:options.owner,siteUrl:input.siteUrl,preview:value.preview}:null;
      state.pendingClear=null;state.previewRevision++;return await response(views,view,state,options,{requestSequence:input.requestSequence});
    }catch(error){
      if(state.attempt===attempt&&!state.disposed&&state.document===view.document&&attempt.document===view.document){
        try{await call(views,view,state,'clear');state.active=null;state.pendingClear=null;}catch(cleanup){state.pendingClear={owner:attempt.owner,document:attempt.document};if(attempt.landed)state.active=attempt.preview?{owner:attempt.owner,siteUrl:input.siteUrl,preview:attempt.preview}:null;view.publish?.('warning',{message:cleanup.message});}state.previewRevision++;
      }
      throw error;
    }finally{if(state.attempt===attempt)state.attempt=null;}
  });
}
export async function clearSiteAnnotationFeaturePreview(view,{owner}={}){
  const state=states.get(view);if(!state||state.disposed||state.document!==view.document)return false;
  const clear=async()=>{if(owner!==undefined&&(state.pendingClear?state.pendingClear.owner!==owner:state.active?.owner!==owner))return false;if(state.disposed||state.document!==view.document)return false;await call(state.views,view,state,'clear');state.active=null;state.pendingClear=null;state.previewRevision++;return true;};
  return serialize(state,clear);
}
