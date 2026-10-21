// The water uses exactly the same cells as the 3D whale. Darkness is empty
// space in that grid; moving current crests gradually reveal its characters.
const crestRadius=.026*Math.sqrt(-Math.log(.06));
let grid;
export function paintField(rect, now, glyph, ink, still, {stepX,stepY}) {
  if (!rect || rect.width < 100) return;
  const key=[rect.left,rect.top,rect.right,rect.bottom,rect.width,rect.height,stepX,stepY].join(':');
  if(grid?.key!==key) {
    const first=Math.floor(rect.top/stepY),count=Math.ceil(rect.bottom/stepY)-first;
    const ys=Float64Array.from({length:count},(_,i)=>(first+i+.5)*stepY);
    const vs=Float64Array.from(ys,y=>(y-rect.top)/rect.height),columns=[];
    for(let col=Math.floor(rect.left/stepX);col<Math.ceil(rect.right/stepX);col++) {
      const x=(col+.5)*stepX;
      const noise=Uint8Array.from({length:count},(_,i)=>.5+.5*Math.sin(col*12.9898+(first+i)*78.233)>=.98?1:0);
      columns.push({x,u:(x-rect.left)/rect.width,noise});
    }
    // One viewport only: resizing or changing the character grid replaces it.
    grid={key,first,ys,vs,columns,selected:new Uint8Array(count)};
  }
  const t = still ? 0 : now / 1000;
  const {first,ys,vs,columns,selected}=grid;
  for (const {x,u,noise} of columns) {
    const current=Math.sin(u*6.4-t*.35)*.13+Math.sin(u*13+t*.25)*.035;
    selected.set(noise);
    // Only the three crest bands and the fixed sparse cells can be visible.
    // A whole-cell margin retains the exact original threshold at band edges.
    for(const center of [.22,.57,.89]) {
      const lo=Math.max(0,Math.floor(((center+current-crestRadius)*rect.height+rect.top)/stepY-.5)-first-1);
      const hi=Math.min(ys.length,Math.ceil(((center+current+crestRadius)*rect.height+rect.top)/stepY-.5)-first+2);
      if(lo<hi)selected.fill(1,lo,hi);
    }
    for (let row=0;row<ys.length;row++) {
      if(!selected[row])continue;
      const y=ys[row],v=vs[row];
      const distance=Math.min(Math.abs(v-.22-current),Math.abs(v-.57-current),Math.abs(v-.89-current));
      const crest = Math.exp(-((distance / .026) ** 2));
      if (crest < .06 && !noise[row]) continue;
      glyph('·', x, y, ink, .025 + crest * .16);
    }
  }
}
