import { createAttributeMarkers } from '../shared/attribute-markers.mjs';

// Each decoration belongs to the native element's DOM layer. The browser can
// scroll, clip, hide and stack it even while the background renderer is busy.
export function createCharacterChrome() {
  const layers=new Map(), anchors=createAttributeMarkers('data-glyph-anchor'), stacking=createAttributeMarkers('data-glyph-chrome-host');
  let hosts=new Map();
  function prepare(items) {
    const wanted=new Map(), contexts=new Map(); hosts=new Map();
    for(const {el,r,padding=0} of items) {
      const previous=wanted.get(el);
      if(!previous||padding>previous.padding)wanted.set(el,{r,padding});
    }
    for(const [el,layer] of layers)if(!wanted.has(el)){layer.canvas.remove();layer.caption?.remove();layers.delete(el);}
    for(const [el,item] of wanted) {
      let host=el;
      const style=getComputedStyle(el);
      if(/^(INPUT|TEXTAREA|SELECT|HR)$/.test(el.tagName)||/(auto|scroll|hidden|clip)/.test(style.overflow))host=el.parentElement;
      while(host&&getComputedStyle(host).display==='contents')host=host.parentElement;
      if(!host||host.namespaceURI!=='http://www.w3.org/1999/xhtml'){wanted.delete(el);continue;}
      if(getComputedStyle(host).position==='static'||host.hasAttribute('data-glyph-anchor'))hosts.set(host,'');
      contexts.set(host,'');
      item.host=host;
    }
    // Establish containing blocks together, without reparenting native nodes.
    anchors.update(hosts);
    stacking.update(contexts);
    for(const [el,{host}] of wanted) {
      let layer=layers.get(el);
      if(!layer||layer.canvas.parentElement!==host) {
        layer?.canvas.remove();layer?.caption?.remove();
        const canvas=document.createElement('canvas');
        canvas.className='omd-glyph-chrome';canvas.setAttribute('aria-hidden','true');
        host.appendChild(canvas);
        layer={canvas,g:canvas.getContext('2d')};layers.set(el,layer);
      }
      if(el.hasAttribute('data-composer-card')&&!layer.caption?.isConnected) {
        const caption=document.createElement('span');caption.className='omd-glyph-caption';caption.setAttribute('aria-hidden','true');
        el.appendChild(caption);layer.caption=caption;
      }
    }
    // Read every host before updating any canvas size/style. Interleaving these
    // reads and writes forced a full layout for each visible control.
    const geometry=new Map(),dpr=Math.min(devicePixelRatio||1,2);
    for(const {host} of wanted.values())if(!geometry.has(host)) {
      const hr=host.getBoundingClientRect(),hs=getComputedStyle(host);
      // clientLeft/clientTop round half-pixel borders on Retina displays.
      const borderLeft=parseFloat(hs.borderLeftWidth)||0,borderTop=parseFloat(hs.borderTopWidth)||0;
      geometry.set(host,{left:hr.left+borderLeft-host.scrollLeft,top:hr.top+borderTop-host.scrollTop});
    }
    for(const [el,{r,padding,host}] of wanted) {
      const layer=layers.get(el),origin=geometry.get(host);
      const w=r.width+padding*2,h=r.height+padding*2;
      const {canvas,g}=layer;
      if(canvas.width!==Math.ceil(w*dpr)||canvas.height!==Math.ceil(h*dpr)){canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);}
      const css=`left:${r.left-origin.left-padding}px;top:${r.top-origin.top-padding}px;width:${w}px;height:${h}px`;
      if(layer.css!==css){canvas.style.cssText=css;layer.css=css;}
      layer.r=r;layer.padding=padding;layer.dpr=dpr;
      g.setTransform(dpr,0,0,dpr,(padding-r.left)*dpr,(padding-r.top)*dpr);
      g.textAlign='center';g.textBaseline='middle';
    }
  }
  return {
    prepare,
    beginFrame(){for(const {g,canvas} of layers.values()){g.save();g.resetTransform();g.clearRect(0,0,canvas.width,canvas.height);g.restore();}},
    context(el){return layers.get(el)?.g;},
    dispose(){for(const {canvas,caption} of layers.values()){canvas.remove();caption?.remove();}layers.clear();anchors.dispose();stacking.dispose();},
  };
}
