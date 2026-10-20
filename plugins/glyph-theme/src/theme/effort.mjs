import {blueCss} from './waves.mjs';

// Reads the same indexed value used by the real model selector.
export function readEffort(element) {
  const value=Number(element.dataset.effortValue),max=Number(element.dataset.effortMax);
  return {value,max,ratio:max>0?Math.min(1,Math.max(0,value/max)):0,peak:max>0&&value===max};
}
export function paintEffort({r,ratio,peak,disabled},time,glyph,ink,muted,still) {
  const left=r.left+14,right=r.right-14,cy=r.top+r.height/2,thumb=left+(right-left)*ratio;
  const alpha=disabled?.35:1,phase=still?0:time*.42;
  for(let x=left;x<=right;x+=7){
    const filled=x<=thumb,position=(x-left)/Math.max(1,right-left),tone=blueCss(.5+.5*Math.sin(position*2.8-phase));
    glyph(filled?'─':'·',x,cy,filled?(peak?tone:ink):muted,alpha*(filled?.9:.55),10);
    if(peak)for(const sign of[-1,1])for(let band=0;band<3;band++){
      const wave=Math.sin(position*3.1-phase)*4;
      glyph('·',x,cy+sign*(9+wave+band*5),tone,alpha*(.22-band*.065),9);
    }
  }
  const thumbInk=peak?blueCss(.5+.5*Math.sin(phase)):ink;
  glyph('[',thumb-7,cy,thumbInk,alpha,17);glyph(peak?'✦':'●',thumb,cy,thumbInk,alpha,peak?13:9);glyph(']',thumb+7,cy,thumbInk,alpha,17);
}
