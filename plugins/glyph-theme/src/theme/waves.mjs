export const ULTRA_DURATION = 12000;
export const ULTRA_INTERVAL = 4000;
export const ULTRA_RELEASE = 2200;
export const CLICK_DURATION = 5200;
export const DEEPSEEK_BLUES = [[36,88,223],[77,107,254],[102,145,255],[67,191,255]];
const clamp = v => Math.max(0,Math.min(1,v));
const ease = v => { const x=clamp(v);return x*x*(3-2*x); };
export function blueAt(t) {
  const p=clamp(t)*(DEEPSEEK_BLUES.length-1),a=Math.floor(p),b=Math.min(a+1,DEEPSEEK_BLUES.length-1),f=p-a;
  return DEEPSEEK_BLUES[a].map((v,i)=>Math.round(v+(DEEPSEEK_BLUES[b][i]-v)*f));
}
export const blueCss = t => `rgb(${blueAt(t).join(',')})`;
export function prepareWaves(clicks,ultra,now,extent) {
  return {
    clicks:clicks.map(w=>({...w,age:(now-w.time)/1000})).filter(w=>w.age>=0&&w.age<CLICK_DURATION/1000)
      .map(w=>({...w,radius:w.age*125,width:28+w.age*9,strength:ease(w.age/.18)*Math.exp(-w.age*.42)*ease((5.2-w.age)/.8)})),
    ultra:ultra.map(w=>({...w,age:(now-w.time)/1000})).filter(w=>w.age>=0&&w.age<ULTRA_DURATION/1000&&
      (w.releasedAt===undefined||now-w.releasedAt<ULTRA_RELEASE))
      .map(w=>({...w,radius:w.age*Math.max(110,extent/9),width:Math.max(180,Math.min(280,extent*.2)),
        strength:ease(w.age/.7)*ease((12-w.age)/2)*
          (w.releasedAt===undefined?1:1-ease((now-w.releasedAt)/ULTRA_RELEASE))})),
  };
}
export function sampleClickWaves(waves,x,y) {
  let height=0,dx=0,dy=0;
  for(const w of waves){
    const vx=x-w.x,vy=y-w.y,distance=Math.hypot(vx,vy)||1,delta=distance-w.radius;
    if(Math.abs(delta)>w.width*2.4)continue;
    const envelope=Math.exp(-((delta/w.width)**2))*w.strength,phase=delta*Math.PI/36;
    height+=Math.sin(phase)*envelope;
    const slope=(Math.cos(phase)*Math.PI/36-2*delta/(w.width*w.width)*Math.sin(phase))*envelope;
    dx+=vx/distance*slope*140;dy+=vy/distance*slope*140;
  }
  // Keep the signed sum: crests reinforce and opposing phases cancel where
  // separate clicks meet, instead of drawing unrelated overlapping circles.
  return {height,dx,dy};
}
export function sampleUltraWaves(waves,x,y) {
  let strength=0,height=0,dx=0,dy=0,light=0,color=[0,0,0];
  for(const w of waves){
    const vx=x-w.x,vy=(y-w.y)*1.08,distance=Math.hypot(vx,vy)||1;
    // A causal travelling packet: nothing lights up ahead of the wavefront.
    // Its broad crest and following trough lift and refract the same character surface.
    const travel=(w.radius-distance)/w.width;
    if(travel<=0||travel>=3)continue;
    const head=ease(travel/.32),tail=ease((3-travel)/.8);
    const envelope=head*tail*Math.exp(-travel*.42)*w.strength;
    const phase=travel*Math.PI*1.55,signed=Math.sin(phase)*envelope;
    const slope=-Math.cos(phase)*Math.PI*1.55/w.width*envelope;
    height+=signed;
    dx+=vx/distance*(signed*18+slope*1350);
    dy+=vy/distance*(signed*18+slope*1350)-signed*30;
    // Directional lighting gives the crest a bright lip and its back a shadow.
    light+=signed*.28+slope*(-.45*vx/distance-.8*vy/distance)*20;
    const amount=envelope*(.42+.58*Math.abs(Math.sin(phase)));
    if(amount>strength){strength=amount;color=blueAt(.48+signed*.4-slope*9);}
  }
  return {strength:Math.min(1,strength),color,height,dx,dy,light};
}
