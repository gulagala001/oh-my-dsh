import { paintField } from './field.mjs';
import { createCharacterScene } from './scene.mjs';
import { createWhalePainter } from './whale.mjs';
import { readEffort, paintEffort } from './effort.mjs';
import {prepareWaves,ULTRA_DURATION,ULTRA_INTERVAL,ULTRA_RELEASE,CLICK_DURATION} from './waves.mjs';

// The host owns every hit target, editor, setting and session. Only visible
// chrome is replaced, with fillText as the sole on-screen drawing primitive.
const EXTERNAL = '[data-glyph-external], [data-message-attachments], iframe, [data-document-preview], [data-file-preview], .monaco-editor, .cm-editor, .omd-glyph-canvas';
const PANEL = '[role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"], .VOzbGW_panel, .omd-model-panel';
const BOX = '[data-composer-card], [data-omd-nav-part="create"], [class$="_newSession"], [role="treeitem"][aria-selected="true"], .Sixlwa_bubble, .tx-cu-user-bubble, pre, fieldset, '+PANEL;
const CONTROL = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], input, textarea, select, [role="switch"], [role="checkbox"], [role="radio"]';

export function mountGlyphRenderer(canvas, { reduced = false } = {}) {
  const g = canvas.getContext('2d');
  if (!g) return () => {};
  const root = document.documentElement, motion = matchMedia('(prefers-reduced-motion: reduce)');
  const whale = createWhalePainter(), marked = new Set(), cache = new Map(), rings = [], bursts = [];
  const scene = createCharacterScene();
  const trails = [];
  const clickWaves = [];
  const pointer = { x: -1000, y: -1000 }, font = '"SFMono-Regular", Menlo, monospace';
  let stopped = false, frame, last = 0, dirty = true, measured = 0, width = 0, height = 0;
  let ink, muted, accent, line, icons = [], boxes = [], brands = [], controls = [], ranges = [], covers = [], scrollbars = [];
  let divider, rightDivider, header, owner, clip, conversation, fieldRect, obstacles=[], effortElement, effortPeak = false, artwork = false;
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
    if (!el.isConnected || el.closest(EXTERNAL) || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect(), style = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > height || r.right < 0 || r.left > width) return null;
    if (style.opacity === '0' || !acceptHidden && style.visibility === 'hidden') return null;
    return r;
  }
  const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  function glyph(char, x, y, color = ink, alpha = 1, size = 10) {
    if (clip && !inside(clip, x, y)) return;
    if (artwork && obstacles.some(r => x > r.left - (r.pad??10) && x < r.right + (r.pad??10) && y > r.top - (r.pad??10) && y < r.bottom + (r.pad??10))) return;
    if (covers.some(c => inside(c.r, x, y) && c.el !== owner && !c.el.contains(owner) && !owner?.contains(c.el))) return;
    g.globalAlpha = Math.max(0, Math.min(1, alpha)); g.fillStyle = color;
    g.font = `${size}px ${font}`; g.fillText(char, x, y);
  }
  function clipping(el) {
    let bounds = { left:0, top:0, right:width, bottom:height };
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const style = getComputedStyle(p);
      if (!/(auto|scroll|hidden|clip)/.test(style.overflowX + style.overflowY)) continue;
      const r = p.getBoundingClientRect();
      bounds = { left:Math.max(bounds.left,r.left), right:Math.min(bounds.right,r.right), top:Math.max(bounds.top,r.top), bottom:Math.min(bounds.bottom,r.bottom) };
    }
    return bounds;
  }
  function pixels(svg, r) {
    const cols=Math.max(8,Math.min(160,Math.ceil(r.width/4))), rows=Math.max(8,Math.min(120,Math.ceil(r.height/4)));
    const clone = svg.cloneNode(true);
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
    covers=[...document.querySelectorAll(PANEL+', iframe, [data-glyph-external]')].map(el=>({el,r:visible(el)||(!el.hidden&&el.getBoundingClientRect())})).filter(c=>c.r?.width>2&&c.r?.height>2&&getComputedStyle(c.el).visibility!=='hidden');
    conversation=shell?.querySelector('[data-omd-surface="conversation"]');fieldRect=conversation&&visible(conversation);
    brands=[...document.querySelectorAll('.omd-glyph-brand')].map(el=>{
      const r=visible(el),small=el.dataset.glyphSize==='small';
      return {el,r,small,clip:small?r:fieldRect,scene:small?r:fieldRect||r};
    }).filter(v=>v.r);
    obstacles=[...document.querySelectorAll('[data-composer-card], [data-chat-flow-kind] pre, [data-chat-flow-kind] table, [data-message-attachments], .wSkVaW_header, '+PANEL)].map(el=>visible(el)).filter(Boolean);
    // Keep actual message lines readable, while allowing the water to move
    // through paragraph gaps in an already-open conversation.
    for(const row of document.querySelectorAll('[data-chat-flow-kind]')){
      if(!visible(row))continue;
      const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);
      for(let node=walker.nextNode();node;node=walker.nextNode()){
        if(!node.textContent.trim())continue;
        const range=document.createRange();range.selectNodeContents(node);
        for(const r of range.getClientRects())if(r.width>0&&r.height>0&&r.bottom>=0&&r.top<height)
          obstacles.push({left:r.left,top:r.top,right:r.right,bottom:r.bottom,pad:4});
      }
    }
    // The hero's container includes its whale. Protect the actual title text,
    // not that entire container, so the artwork can leave its original slot.
    for(const el of document.querySelectorAll('[class*="_headline"]')) {
      const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
      for(let node=walker.nextNode();node;node=walker.nextNode()) {
        if(!node.textContent.trim())continue;
        const range=document.createRange();range.selectNodeContents(node);
        obstacles.push(...[...range.getClientRects()].filter(r=>r.width>0&&r.height>0));
      }
    }
    if(fieldRect&&!brands.some(v=>!v.small)&&conversation.querySelector('[data-chat-flow-kind]')) {
      const w=Math.min(400,fieldRect.width*.6),h=Math.min(240,fieldRect.height*.4);
      brands.push({el:conversation,small:false,ambient:true,scene:fieldRect,clip:fieldRect,
        r:{left:fieldRect.left+(fieldRect.width-w)/2,top:fieldRect.top+fieldRect.height*.3-h/2,width:w,height:h}});
    }
    boxes=[...document.querySelectorAll(BOX)].map(el=>({el,r:visible(el),clip:clipping(el),composer:el.hasAttribute('data-composer-card'),selected:el.getAttribute('aria-selected')==='true'})).filter(v=>v.r);
    controls=[];ranges=[];const currentControls=new Set();
    for(const el of document.querySelectorAll(CONTROL)) {
      let r=visible(el); const hiddenToggle=!r&&['checkbox','radio'].includes(el.type)&&getComputedStyle(el).opacity==='0';
      if(hiddenToggle)r=visible(el.parentElement);
      if(!r||el.closest('[data-composer-input]')||el.type==='file') continue;
      if(conversation?.contains(el))obstacles.push(r);
      const role=el.getAttribute('role'), type=el.type;
      const toggle=['switch','checkbox','radio'].includes(role)||['checkbox','radio'].includes(type);
      const range=type==='range';
      // Native controls keep their hit areas; only their visual primitives disappear.
      if(toggle||range) { if(!el.hasAttribute('data-glyph-control')) el.setAttribute('data-glyph-control','');marked.add(el);currentControls.add(el); }
      const value={el,r,clip:clipping(el),inline:hiddenToggle,toggle,role:role||type,checked:el.checked||el.getAttribute('aria-checked')==='true',disabled:el.disabled||el.getAttribute('aria-disabled')==='true'};
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
    icons=[];const current=new Set();
    for(const el of document.querySelectorAll('svg')) {
      // Brand lettering is an SVG in the native shell. Rasterizing a 13 px
      // wordmark into 4 px glyphs makes both the name and logo unreadable.
      if(el.closest('[data-omd-nav-part="brand"], [class*="_logoRow"]'))continue;
      const r=visible(el,true);if(!r||el.closest('[data-glyph-control],.omd-effort-control'))continue;
      const item=pixels(el,r);if(!item.pixels)continue;
      if(!el.hasAttribute('data-glyph-icon'))el.setAttribute('data-glyph-icon','');
      current.add(el);marked.add(el);icons.push({el,r,item,clip:clipping(el)});
    }
    for(const el of marked) if(!el.isConnected||el.hasAttribute('data-glyph-icon')&&!current.has(el)||el.hasAttribute('data-glyph-control')&&!currentControls.has(el)) {
      el.removeAttribute('data-glyph-icon');el.removeAttribute('data-glyph-control');marked.delete(el);
    }
    scrollbars=[...document.querySelectorAll('[data-conversation-scroll], [role="menu"], [role="listbox"], [class*="_content"], [class*="_scroll"], [class*="_list"], .omd-model-options')].filter(el=>el.scrollHeight>el.clientHeight+4&&/(auto|scroll)/.test(getComputedStyle(el).overflowY)).map(el=>({el,r:visible(el),clip:clipping(el)})).filter(v=>v.r);
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
    edge(r.left+7,r.top+1,r.right-7,r.top+1,time,focus);edge(r.left+7,r.bottom-1,r.right-7,r.bottom-1,time+2,focus);
    for(const x of[r.left+1,r.right-1]) {
      glyph('+',x,r.top+1,focus||selected?accent:muted);glyph('+',x,r.bottom-1,focus||selected?accent:muted);
      for(let y=r.top+10;y<r.bottom-6;y+=10)glyph('·',x,y,line,.8);
    }
    if(composer) {g.textAlign='left';glyph(focus?'●  COMPOSING':'○  YOUR NEXT MOVE',r.left+2,r.top-14,focus?accent:muted,.85,9);g.textAlign='center';}
  }
  function control(v,time) {
    const {el,r,toggle,role,checked,disabled,inline}=v,alpha=disabled?.35:1;
    const focused=el===document.activeElement,hover=inside(r,pointer.x,pointer.y);
    if(toggle) {
      const char=role==='switch'?(checked?'[●··]':'[··○]'):role==='radio'?(checked?'(●)':'( )'):(checked?'[×]':'[ ]');
      glyph(char,inline?r.left+12:r.left+r.width/2,r.top+r.height/2,checked?ink:muted,alpha,11);return;
    }
    const selected=el.getAttribute('aria-selected')==='true'||el.getAttribute('aria-pressed')==='true'||el.getAttribute('aria-current');
    const field=['INPUT','TEXTAREA','SELECT'].includes(el.tagName);
    if(field) {edge(r.left+4,r.bottom-1,r.right-4,r.bottom-1,time,focused);return;}
    if(focused||hover||selected) {
      glyph('[',r.left+2,r.top+r.height/2,ink,alpha,12);glyph(']',r.right-2,r.top+r.height/2,ink,alpha,12);
    }
  }
  function bind(v) {owner=v.el;clip=v.clip||null;}
  function draw(now) {
    frame=undefined;if(stopped||document.hidden)return;
    const quiet=still();if(!quiet&&now-last<32){wake();return;}last=now;
    if(dirty||now-measured>250){measure();measured=now;}
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
    clip=fieldRect;owner=conversation;artwork=true;
    scene.paint(now,trails,quiet,glyph,accent,water);
    artwork=false;
    clip=null;
    for(const [el,side] of[[divider,'right'],[rightDivider,'left']]){
      const r=el&&visible(el);owner=el;if(r?.width>20)edge(r[side],24,r[side],height-24,time);
    }
    if(header){const r=visible(header);owner=header;if(r)edge(r.left+26,r.bottom,r.right-26,r.bottom,time);}
    for(const v of boxes){bind(v);box(v,time);}
    for(const v of brands)if(v.small){bind(v);whale(v,time,glyph,accent,muted,pointer);}
    for(const v of controls){bind(v);control(v,time);}
    for(const v of scrollbars){bind(v);const {el,r}=v;const travel=r.height-16, thumb=Math.max(20,travel*el.clientHeight/el.scrollHeight),start=r.top+8+(travel-thumb)*el.scrollTop/(el.scrollHeight-el.clientHeight);for(let y=r.top+8;y<r.bottom-8;y+=8)glyph(y>=start&&y<=start+thumb?'┃':'·',r.right-4,y,muted,.65,9);}
    for(const v of ranges){bind(v);paintEffort(v,time,glyph,ink,muted,quiet);}
    for(const v of icons){bind(v);for(const p of v.item.pixels)glyph(p.a>.65?'+':'·',v.r.left+(p.x+.5)*v.r.width/v.item.cols,v.r.top+(p.y+.5)*v.r.height/v.item.rows,ink,p.a,Math.max(4,Math.min(v.r.width/v.item.cols,v.r.height/v.item.rows)+1));}
    clip=null;
    if(!quiet){
      for(let i=rings.length-1;i>=0;i--){const ring=rings[i],age=(now-ring.time)/650;if(age>=1){rings.splice(i,1);continue;}owner=ring.el;const radius=6+age*46;for(let k=0;k<16;k++){const a=k/16*Math.PI*2;glyph(age<.4?'+':'·',ring.x+Math.cos(a)*radius,ring.y+Math.sin(a)*radius,accent,(1-age)*.7,9);}}
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
      }else{rings.push({el:e.target,...wave});if(rings.length>8)rings.shift();}
    }
    invalidate();
  };
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=undefined;rings.length=bursts.length=trails.length=clickWaves.length=0;}else invalidate();};
  const observer=new MutationObserver(invalidate);
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-selected','aria-expanded','aria-checked','aria-valuenow','data-content-phase','data-effort-value','data-effort-max','disabled','checked']});
  observer.observe(root,{attributes:true,attributeFilter:['data-appearance','data-omd-palette','data-omd-custom']});
  const listeners=[['scroll',invalidate,true],['pointermove',move,{passive:true}],['pointerdown',click,true],['pointerleave',leave],['focusin',invalidate],['focusout',invalidate],['visibilitychange',visibility],['input',effortChanged,true],['change',invalidate,true]];
  for(const args of listeners)document.addEventListener(...args);
  window.addEventListener('resize',invalidate);motion.addEventListener('change',invalidate);wake();
  return()=>{stopped=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',invalidate);motion.removeEventListener('change',invalidate);for(const args of listeners)document.removeEventListener(...args);for(const el of marked){el.removeAttribute('data-glyph-icon');el.removeAttribute('data-glyph-control');}cache.clear();};
}
