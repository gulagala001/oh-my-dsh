import { paintField } from './field.mjs';
import { createCharacterScene } from './scene.mjs';
import { createWhalePainter } from './whale.mjs';
import { createCharacterIcons } from './icons.mjs';
import { createCharacterChrome } from './chrome.mjs';
import { createOcclusionIndex } from './occlusion.mjs';
import { createAttributeMarkers } from '../shared/attribute-markers.mjs';
import { NATIVE_CONTENT, isChromeIcon, isBareToggle, inClosedDetails } from './semantics.mjs';
import { readEffort, paintEffort } from './effort.mjs';
import {prepareWaves,ULTRA_DURATION,ULTRA_INTERVAL,ULTRA_RELEASE,CLICK_DURATION} from './waves.mjs';

// The host owns every hit target, editor, setting and session. Only visible
// chrome is rendered with characters; icons live in their native DOM bounds.
const EXTERNAL = NATIVE_CONTENT+', .omd-glyph-canvas, .omd-glyph-chrome';
const PANEL = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"], [role="listbox"], [role="tooltip"], [popover], [data-menu-material], .VOzbGW_panel, .omd-model-panel, [data-sonner-toast], .iui-actions-popover, .iui-new-session-notice';
const BOX = '[data-composer-card], [data-omd-nav-part="create"], [class$="_newSession"], [role="treeitem"][aria-selected="true"], .Sixlwa_bubble, .tx-cu-user-bubble, pre, fieldset, '+PANEL;
const CONTROL = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], input, textarea, select, [role="switch"], [role="checkbox"], [role="radio"]';
const COMPOSER = '[data-content-phase="active"] [data-composer-seat]';
const READABLE = '[data-composer-card], '+COMPOSER+', .Sixlwa_bubble, .tx-cu-user-bubble, [data-chat-flow-kind="assistant-step"], [data-chat-flow-kind] pre, [data-chat-flow-kind] table, [data-message-attachments]';
const FLOATING = '[class*="_headline"], [class*="_heroWorkspaceRow"]';
const WORKBENCH = '[data-omd-surface="workbench-column"], .P3OORG_tabBody';

export function mountGlyphRenderer(canvas, { reduced = false } = {}) {
  const background = canvas.getContext('2d');
  let g=background, local=false;
  let paintContext,paintFont,paintColor;
  if (!g) return () => {};
  const root = document.documentElement, motion = matchMedia('(prefers-reduced-motion: reduce)');
  const whale = createWhalePainter(), marked = new Set(), cache = new Map(), rings = [], bursts = [];
  const scene = createCharacterScene();
  const characterIcons = createCharacterIcons();
  const chrome = createCharacterChrome(), opaque = createAttributeMarkers('data-glyph-opaque');
  const labelMask = document.createElement('canvas');
  let labelMaskKey, labelMaskRect;
  const trails = [];
  const clickWaves = [];
  const pointer = { x: -1000, y: -1000 }, font = '"SFMono-Regular", Menlo, monospace';
  let stopped = false, frame, last = 0, dirty = true, width = 0, height = 0;
  const candidateCache=new Map(), resized=new Set();
  const candidates=selector=>{if(!candidateCache.has(selector))candidateCache.set(selector,[...document.querySelectorAll(selector)]);return candidateCache.get(selector);};
  const resizeObserver=new ResizeObserver(invalidate);
  let ink, muted, accent, line, boxes = [], brands = [], controls = [], ranges = [], covers = [];
  let divider, rightDivider, header, owner, clip, conversation, fieldRect, obstacles=[], effortElement, effortPeak = false, artwork = false;
  let ownerLayer=0;
  let occluded=()=>false;
  let ultraMode=false,nextUltraWave=Infinity,ultraAnchor;
  function emitUltra(input,now) {
    const r=input.getBoundingClientRect();
    const min=Number(input.min||0),max=Number(input.max||100);
    const ratio=max>min?Math.max(0,Math.min(1,(Number(input.value)-min)/(max-min))):0;
    bursts.push({el:input,x:r.left+14+Math.max(0,r.width-28)*ratio,y:r.top+r.height/2,time:now});
    if(bursts.length>4)bursts.shift();
    nextUltraWave=now+ULTRA_INTERVAL;
  }
  const still = () => reduced || motion.matches;
  function visible(el, acceptHidden = false) {
    if (!el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > height || r.right < 0 || r.left > width) return null;
    if (el.closest(EXTERNAL) || inClosedDetails(el)) return null;
    const style = getComputedStyle(el);
    if (style.opacity === '0' || !acceptHidden && style.visibility === 'hidden') return null;
    return r;
  }
  const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  function glyph(char, x, y, color = ink, alpha = 1, size = 10) {
    if (!local && clip && !inside(clip, x, y)) return;
    if (artwork && occluded(x,y)) return;
    if (!local && !artwork && covers.some(c => c.layer>=ownerLayer && inside(c.r, x, y) && c.el !== owner && !c.el.contains(owner) && !owner?.contains(c.el)
      && !(c.composer && owner?.closest(PANEL)))) return;
    if(paintContext!==g){paintContext=g;paintFont=paintColor=undefined;}
    g.globalAlpha = Math.max(0, Math.min(1, alpha));
    if(paintColor!==color){g.fillStyle=color;paintColor=color;}
    if(paintFont!==size){g.font=`${size}px ${font}`;paintFont=size;}
    g.fillText(char, x, y);
  }
  function pixels(svg, r) {
    const cols=Math.max(8,Math.min(160,Math.ceil(r.width/4))), rows=Math.max(8,Math.min(120,Math.ceil(r.height/4)));
    // Do not clone hundreds of our generated SVG text nodes just to discard
    // them on every measurement. Only native icon geometry is sampled.
    const clone = svg.cloneNode(false);
    for(const child of svg.childNodes)if(!child.matches?.('[data-glyph-content]'))clone.appendChild(child.cloneNode(true));
    for (const name of ['class', 'style', 'data-glyph-icon']) clone.removeAttribute(name);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width',String(cols*3)); clone.setAttribute('height',String(rows*3)); clone.setAttribute('color','#fff');
    const source = new XMLSerializer().serializeToString(clone).replaceAll('currentColor','#fff');
    if (cache.has(source)) return cache.get(source);
    const item = { pixels:null,cols,rows }; cache.set(source,item);
    if (cache.size > 160) cache.delete(cache.keys().next().value);
    const img = new Image();
    img.onload = () => {
      if (stopped) return;
      const sample = document.createElement('canvas'); sample.width=cols*3;sample.height=rows*3;
      const c = sample.getContext('2d',{willReadFrequently:true});
      try {
        c.drawImage(img,0,0,sample.width,sample.height); const data=c.getImageData(0,0,sample.width,sample.height).data;
        item.pixels = [];
        for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
          let sum=0;
          for(let j=0;j<3;j++) for(let i=0;i<3;i++) sum+=data[((y*3+j)*sample.width+x*3+i)*4+3];
          if(sum>80) item.pixels.push({x,y,a:Math.min(1,sum/700)});
        }
        invalidate();
      } catch { /* Keep the native icon if its SVG cannot be sampled. */ }
    };
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(source);
    return item;
  }
  function measureFloatingLabels() {
    const text = [], icons = [];
    for (const el of candidates(FLOATING)) {
      if (!visible(el)) continue;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node=walker.nextNode(); node; node=walker.nextNode()) {
        if (!node.textContent.trim() || node.parentElement.closest('svg')) continue;
        const style = getComputedStyle(node.parentElement);
        const range = document.createRange(); range.selectNodeContents(node);
        const add = (value, r) => text.push({value, x:r.left, y:r.top, width:r.width, height:r.height, font:style.font, spacing:style.letterSpacing});
        const rects = [...range.getClientRects()];
        if (rects.length===1) add(node.textContent,rects[0]);
        else {
          // Preserve wrapped labels without guessing their line breaks.
          let offset=0;
          for (const char of node.textContent) {
            range.setStart(node,offset); range.setEnd(node,offset+char.length); offset+=char.length;
            if (char.trim()) add(char,range.getBoundingClientRect());
          }
        }
      }
      for (const svg of el.querySelectorAll('svg')) {
        const r=visible(svg);
        if (r) icons.push({x:r.left,y:r.top,width:r.width,height:r.height});
      }
    }
    const key=JSON.stringify([text,icons]);
    if (key===labelMaskKey) return;
    labelMaskKey=key;
    const parts=[...text,...icons];
    if (!parts.length) {labelMaskRect=null;return;}
    const left=Math.floor(Math.min(...parts.map(r=>r.x))-8),top=Math.floor(Math.min(...parts.map(r=>r.y))-8);
    const right=Math.ceil(Math.max(...parts.map(r=>r.x+r.width))+8),bottom=Math.ceil(Math.max(...parts.map(r=>r.y+r.height))+8);
    const dpr=Math.min(devicePixelRatio||1,2);
    labelMask.width=Math.ceil((right-left)*dpr); labelMask.height=Math.ceil((bottom-top)*dpr);
    labelMaskRect={left,top,width:right-left,height:bottom-top};
    const mask=labelMask.getContext('2d');
    mask.setTransform(dpr,0,0,dpr,-left*dpr,-top*dpr);
    mask.fillStyle=mask.strokeStyle=mask.shadowColor='#fff';
    mask.shadowBlur=4*dpr; mask.lineWidth=2; mask.lineJoin='round';
    for (const part of text) {
      mask.font=part.font; mask.letterSpacing=part.spacing==='normal'?'0px':part.spacing;
      const metrics=mask.measureText(part.value);
      const ascent=metrics.fontBoundingBoxAscent??metrics.actualBoundingBoxAscent;
      const descent=metrics.fontBoundingBoxDescent??metrics.actualBoundingBoxDescent;
      const baseline=part.y+(part.height-ascent-descent)/2+ascent;
      mask.strokeText(part.value,part.x,baseline); mask.fillText(part.value,part.x,baseline);
    }
    // Icons need only a small feathered clearing, never the button's hit area.
    for (const r of icons) {
      mask.beginPath(); mask.roundRect(r.x+2,r.y+2,Math.max(1,r.width-4),Math.max(1,r.height-4),3); mask.fill();
    }
  }
  function measure() {
    const dpr=Math.min(devicePixelRatio||1,2); width=innerWidth; height=innerHeight;
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)) {
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      canvas.style.width=width+'px';canvas.style.height=height+'px';
    }
    g.setTransform(dpr,0,0,dpr,0,0);g.textAlign='center';g.textBaseline='middle';
    const style=getComputedStyle(root);
    ink=style.getPropertyValue('--omd-text').trim()||'#181818';muted=style.getPropertyValue('--omd-muted').trim()||'#737373';
    accent=style.getPropertyValue('--omd-accent').trim()||ink;line=style.getPropertyValue('--omd-border').trim()||'#bcbcbc';
    const shell=document.querySelector('[data-omd-surface="frame"]');
    divider=shell?.querySelector('[data-omd-surface="sidebar-column"]');
    rightDivider=shell?.querySelector('[data-omd-surface="workbench-column"]');
    header=shell?.querySelector('.wSkVaW_header');
    const solid=new Map();
    for(const panel of candidates(PANEL)) {
      if(!visible(panel))continue;
      solid.set(panel,'');
      for(const el of panel.querySelectorAll('header, footer, thead, th, [class*="header"], [class*="Header"], [class*="footer"], [class*="Footer"], [class*="toolbar"], [class*="savebar"], [role="alert"]'))
        if(['sticky','fixed'].includes(getComputedStyle(el).position))solid.set(el,'');
    }
    opaque.update(solid);
    covers=candidates(PANEL+', '+COMPOSER+', '+WORKBENCH+', '+NATIVE_CONTENT).filter(el=>!el.hidden&&!inClosedDetails(el)&&el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})).map(el=>({el,layer:Number(getComputedStyle(el).zIndex)||0,composer:el.hasAttribute('data-composer-seat'),r:el.getBoundingClientRect()})).filter(c=>c.r.width>2&&c.r.height>2);
    conversation=shell?.querySelector('[data-omd-surface="conversation"]');fieldRect=conversation&&visible(conversation);
    brands=candidates('.omd-glyph-brand').map(el=>{
      const r=visible(el),small=el.dataset.glyphSize==='small';
      return {el,r,small,clip:small?r:fieldRect,scene:small?r:fieldRect||r};
    }).filter(v=>v.r);
    obstacles=candidates(READABLE+', .wSkVaW_header, '+PANEL).map(el=>visible(el)).filter(Boolean);
    // Other streamed/tool rows still protect their text while letting the
    // water pass through the surrounding gaps.
    for(const row of candidates('[data-chat-flow-kind]')){
      if(!visible(row)||row.matches(READABLE))continue;
      const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);
      for(let node=walker.nextNode();node;node=walker.nextNode()){
        if(!node.textContent.trim()||node.parentElement?.closest('[data-glyph-content]'))continue;
        const range=document.createRange();range.selectNodeContents(node);
        for(const r of range.getClientRects())if(r.width>0&&r.height>0&&r.bottom>=0&&r.top<height)
          obstacles.push({left:r.left,top:r.top,right:r.right,bottom:r.bottom,pad:4});
      }
    }
    measureFloatingLabels();
    if(fieldRect&&!brands.some(v=>!v.small)&&conversation.querySelector('[data-chat-flow-kind]')) {
      const w=Math.min(400,fieldRect.width*.6),h=Math.min(240,fieldRect.height*.4);
      brands.push({el:conversation,small:false,ambient:true,scene:fieldRect,clip:fieldRect,
        r:{left:fieldRect.left+(fieldRect.width-w)/2,top:fieldRect.top+fieldRect.height*.3-h/2,width:w,height:h}});
    }
    // Compact tooltips have only enough room for their label/shortcut. They
    // still mask the background, but a character frame would cross the text.
    boxes=candidates(BOX).filter(el=>el.getAttribute('role')!=='tooltip').map(el=>({el,r:visible(el),composer:el.hasAttribute('data-composer-card'),selected:el.getAttribute('aria-selected')==='true'})).filter(v=>v.r);
    controls=[];ranges=[];const currentControls=new Set();
    for(const el of candidates(CONTROL)) {
      if(el.namespaceURI!=='http://www.w3.org/1999/xhtml')continue;
      let r=visible(el); const hiddenToggle=!r&&['checkbox','radio'].includes(el.type)&&getComputedStyle(el).opacity==='0';
      if(hiddenToggle)r=visible(el.parentElement);
      if(!r||el.closest('[data-composer-input]')||el.type==='file') continue;
      if(conversation?.contains(el)&&!el.closest(FLOATING))obstacles.push(r);
      const role=el.getAttribute('role'), type=el.type;
      const toggle=(['switch','checkbox','radio'].includes(role)||['checkbox','radio'].includes(type))&&isBareToggle(el);
      const range=type==='range';
      // Native search/text primitives often put an 18px input inside a padded
      // field. Decorate the field, not the text's line box.
      if(['INPUT','TEXTAREA'].includes(el.tagName)&&!toggle&&!range) {
        const field=el.parentElement;
        if(field?.matches('span[class*="_wrap"], [class*="_search"], .omd-model-search')&&field.querySelectorAll('input,textarea').length===1)
          r=visible(field)||r;
      }
      // Native controls keep their hit areas; only their visual primitives disappear.
      if(toggle||range) { if(!el.hasAttribute('data-glyph-control')) el.setAttribute('data-glyph-control','');marked.add(el);currentControls.add(el); }
      const value={el,r,inline:hiddenToggle,toggle,role:role||type,checked:el.checked||el.getAttribute('aria-checked')==='true',mixed:el.indeterminate||el.getAttribute('aria-checked')==='mixed',disabled:el.disabled||el.getAttribute('aria-disabled')==='true'};
      if(range) {
        const effort=el.closest('.omd-effort-control');
        const min=Number(el.min||0),max=Number(el.max||100);
        const nativeEffort=el.getAttribute('aria-label')==='思考强度';
        ranges.push({...value,...(effort?readEffort(effort):{ratio:max>min?(Number(el.value)-min)/(max-min):0,
          peak:nativeEffort&&max>min&&Number(el.value)===max}),effort:effort||nativeEffort});
      } else controls.push(value);
    }
    const peakRange=ranges.find(v=>v.effort&&v.peak);
    const selected=!!peakRange,now=performance.now();
    if(!selected&&ultraMode){
      for(const burst of bursts)burst.releasedAt??=now;
      nextUltraWave=Infinity;
    }else if(selected&&(!ultraMode||ultraAnchor!==peakRange.el))nextUltraWave=now;
    ultraMode=selected;ultraAnchor=peakRange?.el;
    const current=new Set();
    for(const el of candidates('svg')) {
      // Brand lettering is an SVG in the native shell. Rasterizing a 13 px
      // wordmark into 4 px glyphs makes both the name and logo unreadable.
      if(el.closest('[data-omd-nav-part="brand"], [class*="_logoRow"]'))continue;
      const r=visible(el,true);if(!r||el.closest('[data-glyph-control],.omd-effort-control'))continue;
      if(!isChromeIcon(el,r))continue;
      const item=pixels(el,r);if(!item.pixels?.length)continue;
      characterIcons.mount(el,item,r);
      current.add(el);marked.add(el);
    }
    for(const el of marked) if(!el.isConnected||el.hasAttribute('data-glyph-icon')&&!current.has(el)||el.hasAttribute('data-glyph-control')&&!currentControls.has(el)) {
      characterIcons.remove(el);el.removeAttribute('data-glyph-control');marked.delete(el);
    }
    chrome.prepare([
      ...boxes,...controls,...ranges,
      ...brands.filter(v=>v.small),
      ...rings.filter(v=>v.el.isConnected).map(v=>({el:v.el,r:v.el.getBoundingClientRect()})),
    ]);
    own(conversation);
    occluded=createOcclusionIndex([
      ...obstacles.map(r=>{const pad=r.pad??10;return {left:r.left-pad,top:r.top-pad,right:r.right+pad,bottom:r.bottom+pad};}),
      ...covers.filter(c=>c.layer>=ownerLayer&&c.el!==owner&&!c.el.contains(owner)&&!owner?.contains(c.el)
        &&!(c.composer&&owner?.closest(PANEL))).map(c=>c.r),
    ],width,height);
    const observed=new Set([document.body,shell,conversation,divider,rightDivider,header,
      ...boxes.map(v=>v.el),...controls.map(v=>v.el),...ranges.map(v=>v.el),...brands.map(v=>v.el)].filter(Boolean));
    for(const el of resized)if(!observed.has(el)){resizeObserver.unobserve(el);resized.delete(el);}
    for(const el of observed)if(!resized.has(el)){resizeObserver.observe(el);resized.add(el);}
    dirty=false;
  }
  function edge(x1,y1,x2,y2,time,bright=false) {
    const count=Math.max(1,Math.floor(Math.hypot(x2-x1,y2-y1)/8));
    for(let i=0;i<=count;i++) {
      const f=i/count,x=x1+(x2-x1)*f,y=y1+(y2-y1)*f;
      const near=still()?0:Math.max(0,1-Math.hypot(x-pointer.x,y-pointer.y)/190);
      const pulse=bright&&!still()?Math.pow(Math.max(0,Math.sin(f*8-time*1.7)),6):0;
      const highlight=Math.max(near,pulse);
      glyph(highlight>.55?'+':'·',x,y,highlight>.15?accent:line,.55+highlight*.45,highlight>.7?11:10);
    }
  }
  function box({el,r,composer,selected},time) {
    const focus=composer&&el.contains(document.activeElement);
    edge(r.left+7,r.top+5,r.right-7,r.top+5,time,focus);edge(r.left+7,r.bottom-5,r.right-7,r.bottom-5,time+2,focus);
    for(const x of[r.left+5,r.right-5]) {
      glyph('+',x,r.top+5,focus||selected?accent:muted);glyph('+',x,r.bottom-5,focus||selected?accent:muted);
      for(let y=r.top+10;y<r.bottom-6;y+=10)glyph('·',x,y,line,.8);
    }
  }
  function control(v,time) {
    const {el,r,toggle,role,checked,mixed,disabled,inline}=v,alpha=disabled?.35:1;
    const focused=el===document.activeElement,hover=inside(r,pointer.x,pointer.y);
    if(toggle) {
      const char=mixed?'[−]':role==='switch'?(checked?'[··●]':'[○··]'):role==='radio'?(checked?'(●)':'( )'):(checked?'[×]':'[ ]');
      glyph(char,inline?r.left+12:r.left+r.width/2,r.top+r.height/2,checked?ink:muted,alpha,11);return;
    }
    const selected=el.getAttribute('aria-selected')==='true'||el.getAttribute('aria-pressed')==='true'||el.getAttribute('aria-current');
    const field=['INPUT','TEXTAREA','SELECT'].includes(el.tagName);
    if(field) {if(r.height>=24)edge(r.left+4,r.bottom-3,r.right-4,r.bottom-3,time,focused);return;}
    if(focused||hover||selected) {
      glyph('[',r.left+5,r.top+r.height/2,ink,alpha,12);glyph(']',r.right-5,r.top+r.height/2,ink,alpha,12);
    }
  }
  function own(el) {
    owner=el;ownerLayer=0;
    for(const cover of covers)if(cover.el===el||cover.el.contains(el))ownerLayer=Math.max(ownerLayer,cover.layer);
  }
  function bind(v) {
    g=chrome.context(v.el);local=true;clip=null;
    return !!g;
  }
  function draw(now) {
    frame=undefined;if(stopped||document.hidden)return;
    g=background;local=false;
    // Scroll/layout updates must not wait for the background's 30 fps budget.
    const quiet=still();if(!quiet&&!dirty&&now-last<32){wake();return;}last=now;
    if(dirty)measure();
    paintContext=undefined;
    const time=quiet?0:now/1000;g.clearRect(0,0,width,height);
    if(!quiet&&ultraMode&&ultraAnchor?.isConnected&&now>=nextUltraWave){
      emitUltra(ultraAnchor,now);
    }
    const raster=scene.begin(fieldRect,width,height);
    while(trails.length&&now-trails[0].time>900)trails.shift();
    paintField(fieldRect,now,scene.write,accent,quiet,raster);
    for(const v of brands)if(!v.small)whale({...v,raster},time,scene.write,accent,muted,pointer);
    for(let i=bursts.length-1;i>=0;i--){
      const burst=bursts[i];
      // Pin the source to the real thumb through the popover's opening motion.
      // Existing packets fade gently when the selector closes.
      if(burst.el.isConnected&&now-burst.time<350){
        const live=burst.el.getBoundingClientRect();burst.x=live.right-14;burst.y=live.top+live.height/2;
      }
      if(now-burst.time>=ULTRA_DURATION||burst.releasedAt!==undefined&&now-burst.releasedAt>=ULTRA_RELEASE)bursts.splice(i,1);
    }
    while(clickWaves.length&&now-clickWaves[0].time>=CLICK_DURATION)clickWaves.shift();
    const water=prepareWaves(quiet?[]:clickWaves,quiet?[]:bursts,now,Math.hypot(width,height));
    clip=fieldRect;own(conversation);artwork=true;
    scene.paint(now,trails,quiet,glyph,accent,water);
    artwork=false;
    // Let the scene run behind hero labels, clearing only their letterforms
    // with a soft edge instead of punching rectangular holes in the water.
    if(labelMaskRect) {
      const r=labelMaskRect;
      g.save();g.globalAlpha=1;g.globalCompositeOperation='destination-out';
      g.drawImage(labelMask,r.left,r.top,r.width,r.height);g.restore();
    }
    clip=null;
    for(const [el,side] of[[divider,'right'],[rightDivider,'left']]){
      const r=el&&visible(el);own(el);if(r?.width>20)edge(r[side],24,r[side],height-24,time);
    }
    if(header){const r=visible(header);own(header);if(r)edge(r.left+26,r.bottom,r.right-26,r.bottom,time);}
    chrome.beginFrame();
    for(const v of boxes)if(bind(v))box(v,time);
    for(const v of brands)if(v.small&&bind(v))whale(v,time,glyph,accent,muted,pointer);
    for(const v of controls)if(bind(v))control(v,time);
    for(const v of ranges)if(bind(v))paintEffort(v,time,glyph,ink,muted,quiet);
    clip=null;
    if(!quiet){
      for(let i=rings.length-1;i>=0;i--){const ring=rings[i],age=(now-ring.time)/650;if(age>=1||!ring.el.isConnected){rings.splice(i,1);continue;}if(!bind(ring))continue;const r=ring.el.getBoundingClientRect(),radius=6+age*46;for(let k=0;k<16;k++){const a=k/16*Math.PI*2;glyph(age<.4?'+':'·',r.left+ring.dx+Math.cos(a)*radius,r.top+ring.dy+Math.sin(a)*radius,accent,(1-age)*.7,9);}}
      wake();
    }
  }
  function wake(){if(!stopped&&!document.hidden&&frame===undefined)frame=requestAnimationFrame(draw);}
  function invalidate(){dirty=true;wake();}
  function effortChanged(event){
    const input=event.target;
    if(!input.matches?.('.omd-effort-control input[type="range"],input[type="range"][aria-label="思考强度"]')||input.disabled)return;
    const peak=Number(input.max)>Number(input.min)&&Number(input.value)===Number(input.max);
    if(effortElement!==input){effortElement=input;effortPeak=false;}
    if(peak&&!effortPeak&&!still()){
      emitUltra(input,performance.now());
      ultraMode=true;ultraAnchor=input;
    }
    effortPeak=peak;invalidate();
  }
  const move=e=>{pointer.x=e.clientX;pointer.y=e.clientY;const now=performance.now(),last=trails.at(-1);if(!still()&&(!last||now-last.time>48)){trails.push({x:pointer.x,y:pointer.y,time:now});if(trails.length>8)trails.shift();}wake();};
  const leave=()=>{pointer.x=pointer.y=-1000;wake();};
  const click=e=>{
    if(e.button!==0||e.target.closest?.(EXTERNAL))return;
    if(!still()){
      const wave={x:e.clientX,y:e.clientY,time:performance.now()};
      if(fieldRect&&inside(fieldRect,wave.x,wave.y)&&!e.target.closest?.(CONTROL+', [data-composer-card], [data-chat-flow-kind], '+PANEL)){
        clickWaves.push(wave);if(clickWaves.length>6)clickWaves.shift();
      }else{const el=e.target.closest?.(CONTROL)||e.target;if(el.namespaceURI==='http://www.w3.org/1999/xhtml'){const r=el.getBoundingClientRect();rings.push({el,dx:wave.x-r.left,dy:wave.y-r.top,...wave});if(rings.length>8)rings.shift();}}
    }
    invalidate();
  };
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=undefined;rings.length=bursts.length=trails.length=clickWaves.length=0;}else invalidate();};
  const decoration=node=>node.nodeType===1&&node.matches('.omd-glyph-canvas,.omd-glyph-chrome,.omd-glyph-caption,[data-glyph-content]');
  const observer=new MutationObserver(records=>{
    // Our canvases and SVG glyph groups do not change native layout. Do not
    // feed their insertion/removal back into another whole-document measure.
    const relevant=records.filter(record=>!decoration(record.target)&&!record.target.parentElement?.closest('[data-glyph-content]')
      &&(record.type!=='childList'||![...record.addedNodes,...record.removedNodes].every(decoration)));
    if(relevant.length){if(relevant.some(r=>r.type!=='characterData'))candidateCache.clear();invalidate();}
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','aria-selected','aria-expanded','aria-checked','aria-valuenow','data-content-phase','data-effort-value','data-effort-max','data-omd-surface','data-omd-nav-part','data-sidebar-collapsed','data-rightbar-fullscreen','disabled','checked','open','hidden']});
  observer.observe(root,{attributes:true,attributeFilter:['data-appearance','data-omd-palette','data-omd-custom']});
  const listeners=[['scroll',invalidate,true],['transitionend',invalidate,true],['animationend',invalidate,true],['pointermove',move,{passive:true}],['pointerdown',click,true],['pointerleave',leave],['focusin',invalidate],['focusout',invalidate],['visibilitychange',visibility],['input',effortChanged,true],['change',invalidate,true]];
  for(const args of listeners)document.addEventListener(...args);
  window.addEventListener('resize',invalidate);motion.addEventListener('change',invalidate);wake();
  return()=>{stopped=true;cancelAnimationFrame(frame);observer.disconnect();resizeObserver.disconnect();candidateCache.clear();characterIcons.clear();chrome.dispose();opaque.dispose();window.removeEventListener('resize',invalidate);motion.removeEventListener('change',invalidate);for(const args of listeners)document.removeEventListener(...args);for(const el of marked){el.removeAttribute('data-glyph-icon');el.removeAttribute('data-glyph-control');}cache.clear();};
}
