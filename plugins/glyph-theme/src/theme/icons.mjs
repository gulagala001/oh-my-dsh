const NS = 'http://www.w3.org/2000/svg';

// Keep character icons in the host SVG's own layout and clipping context.
// Native scrolling, sticky positioning, hover opacity and zoom then apply
// without waiting for the animated background's next frame.
export function createCharacterIcons() {
  const mounted = new Map();
  function remove(svg) {
    mounted.get(svg)?.group.remove();
    mounted.delete(svg);
    svg.removeAttribute('data-glyph-icon');
  }
  function mount(svg, item, rect) {
    const view = svg.viewBox?.baseVal;
    const bounds = view?.width > 0 && view?.height > 0
      ? {x:view.x,y:view.y,width:view.width,height:view.height}
      : {x:0,y:0,width:rect.width,height:rect.height};
    const key = [bounds.x,bounds.y,bounds.width,bounds.height,rect.width,rect.height].join(',');
    const previous = mounted.get(svg);
    if (previous?.item === item && previous.key === key && previous.group.parentNode === svg) return;
    remove(svg);
    const group = document.createElementNS(NS,'g');
    group.setAttribute('data-glyph-content','');
    group.setAttribute('aria-hidden','true');
    group.setAttribute('fill','var(--omd-text, currentColor)');
    group.setAttribute('stroke','none');
    group.setAttribute('font-family','SFMono-Regular, Menlo, monospace');
    group.setAttribute('font-weight','400');
    group.setAttribute('text-anchor','middle');
    group.setAttribute('dominant-baseline','central');
    const size=Math.max(4,Math.min(rect.width/item.cols,rect.height/item.rows)+1);
    group.setAttribute('font-size',String(size*bounds.height/rect.height));
    // Explicit positions keep each character's anchor and baseline. Only join
    // fully opaque runs: sharing opacity on translucent text would change
    // how overlapping characters blend.
    let opaqueX = [], opaqueY = [];
    const flush = () => {
      if (!opaqueX.length) return;
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', opaqueX.join(' '));
      text.setAttribute('y', opaqueY.join(' '));
      text.textContent = '+'.repeat(opaqueX.length);
      group.appendChild(text);
      opaqueX = []; opaqueY = [];
    };
    for (const p of item.pixels) {
      if (p.a === 1) {
        opaqueX.push(bounds.x+(p.x+.5)*bounds.width/item.cols);
        opaqueY.push(bounds.y+(p.y+.5)*bounds.height/item.rows);
        continue;
      }
      flush();
      const text = document.createElementNS(NS,'text');
      text.setAttribute('x',String(bounds.x+(p.x+.5)*bounds.width/item.cols));
      text.setAttribute('y',String(bounds.y+(p.y+.5)*bounds.height/item.rows));
      text.setAttribute('opacity',String(p.a));
      text.textContent=p.a>.65?'+':'·';
      group.appendChild(text);
    }
    flush();
    svg.appendChild(group);
    svg.setAttribute('data-glyph-icon','');
    mounted.set(svg,{group,item,key});
  }
  return {mount,remove,clear(){for(const svg of mounted.keys())remove(svg);}};
}
