import {blueCss} from './waves.mjs';

// Reads the same indexed value used by the real model selector.
export function readEffort(element) {
  const value=Number(element.dataset.effortValue),max=Number(element.dataset.effortMax);
  return {value,max,ratio:max>0?Math.min(1,Math.max(0,value/max)):0,peak:max>0&&value===max};
}
export function paintEffort({r,ratio,peak,disabled,max},time,glyph,ink,muted,still) {
  const left=r.left+14,right=r.right-14,cy=r.top+r.height/2,thumb=left+(right-left)*ratio;
  const alpha=disabled?.35:1,t=still||disabled?0:time;
  const phase=t*(1.15+ratio*.65),ramp='·:+=×#';
  for(let x=left;x<=right;x+=7){
    const filled=x<=thumb,position=(x-left)/Math.max(1,right-left),distance=Math.abs(x-thumb);
    const swell=Math.sin(distance*.052-phase),pulse=(swell+1)/2;
    const tone=peak?blueCss(.5+.5*Math.sin(position*2.8-t*.42)):ink;
    if(Math.abs(x-thumb)>17)for(const row of[-1,0,1]){
      // The characters themselves travel through density states. Both sides
      // stay alive at every effort level; the selected side remains stronger.
      const current=(1+Math.sin(distance*.075-phase-row*.9))/2;
      const density=filled?.35+current*.65:.08+current*.5;
      const char=ramp[Math.min(ramp.length-1,Math.floor(density*ramp.length))];
      const lift=row*swell*(1.1+ratio*1.3);
      glyph(char,x,cy+row*7+lift,filled?tone:peak?tone:muted,
        alpha*(filled?.48+current*.5:.18+current*.34),12);
    }
    for(const sign of[-1,1]){
      glyph(pulse>.8?'+':'·',x,cy+sign*(19+swell*1.6),peak?tone:muted,
        alpha*(.12+pulse*(peak?.3:.15)),9);
    }
  }
  if(max>0&&max<=12)for(let i=0;i<=max;i++){
    const x=left+(right-left)*i/max;
    const pulse=(1+Math.sin(phase-i*.85))/2;
    if(Math.abs(x-thumb)>17)glyph(pulse>.65?'+':'┴',x,cy+16,
      i/max<=ratio?(peak?blueCss(i/max):ink):muted,alpha*(.45+pulse*.5),10);
  }
  // A moving character highlight circulates around a fixed, easy-to-grab thumb.
  const perimeter=[];
  for(let x=-12;x<=12;x+=6)perimeter.push([x,-12]);
  for(let y=-6;y<=12;y+=6)perimeter.push([12,y]);
  for(let x=6;x>=-12;x-=6)perimeter.push([x,12]);
  for(let y=6;y>=-6;y-=6)perimeter.push([-12,y]);
  for(let i=0;i<perimeter.length;i++){
    const [x,y]=perimeter[i],pulse=(1+Math.cos(i/perimeter.length*Math.PI*2-phase*1.7))/2;
    const tone=peak?blueCss(.25+pulse*.65):ink;
    glyph(pulse>.82?'#':pulse>.4?'+':':',thumb+x,cy+y,tone,alpha*(.5+pulse*.5),10);
  }
  const breath=(1+Math.sin(phase*1.25))/2;
  const thumbInk=peak?blueCss(.35+breath*.5):ink;
  glyph(peak?(breath>.48?'✦':'✧'):(breath>.48?'◆':'◇'),thumb,cy,thumbInk,alpha*(.75+breath*.25),13+breath*3);
}
