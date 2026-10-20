// Four composed shots. Close contour details match across the hidden edit;
// the next camera is already moving during the last three seconds of a shot.
const STEP=14,OVERLAP=3,DURATION=STEP+OVERLAP;
const smooth = v => {const x=Math.max(0,Math.min(1,v));return x*x*x*(x*(x*6-15)+10);};
const shots=[
  [[0,-.32,.10,1,0,0],[.38,.12,-.04,1.08,0,0],[1,.28,-.14,4.8,-4.6,-1.1]],
  [[0,.35,-.12,4.6,6.3,-2.7],[.35,.48,-.08,3.7,5.7,-2.3],[1,.58,.10,1.15,0,0]],
  [[0,-.50,.14,1.15,0,0],[.36,-.15,.20,1.2,0,0],[1,.32,.28,4.4,1.5,4.0]],
  [[0,.26,-.22,4.6,-4.8,-.8],[.36,.02,-.12,3.7,-4.2,-1.1],[1,-.32,.10,1,0,0]],
];
export const SHOT_CYCLE=STEP*shots.length;
function pose(index,progress){
  const frames=shots[index%shots.length],end=frames.findIndex((p,i)=>i>0&&p[0]>=progress);
  const a=frames[Math.max(0,end-1)],b=frames[Math.max(1,end)],f=smooth((progress-a[0])/(b[0]-a[0]));
  return a.slice(1).map((value,i)=>value+(b[i+1]-value)*f);
}
export function whaleShots(time){
  const phase=((time%SHOT_CYCLE)+SHOT_CYCLE)%SHOT_CYCLE,index=Math.floor(phase/STEP),local=phase%STEP;
  const primary=pose(index,(local+OVERLAP)/DURATION);
  if(local<STEP-OVERLAP)return {primary};
  return {primary,secondary:pose(index+1,(local-(STEP-OVERLAP))/DURATION),progress:(local-(STEP-OVERLAP))/OVERLAP,kind:index%2?'sweep':'iris'};
}
export function shotBlend(shot,x,y,rect){
  if(!shot.secondary)return 0;
  const p=smooth(shot.progress),u=(x-rect.left)/rect.width,v=(y-rect.top)/rect.height;
  // A curved silhouette wipe and a detail-centred iris hide the camera edit.
  // Each cell gets a single blend, preserving the common character plane.
  const path=shot.kind==='iris'?Math.hypot((u-.5)*1.1,(v-.38)*.82):u*.76+v*.24+Math.sin(v*Math.PI)*.08;
  return smooth((p*1.5-.22-path)/.26);
}
