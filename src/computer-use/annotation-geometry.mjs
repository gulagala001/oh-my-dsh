export const rectPolygon=(x,y,width,height)=>[{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}];
const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
export function clipPolygon(subject,clip){
  if(!subject.length||clip.length<3)return[];
  const area=clip.reduce((sum,p,i)=>{const q=clip[(i+1)%clip.length];return sum+p.x*q.y-q.x*p.y;},0),sign=area>=0?1:-1;
  let output=subject;
  for(let i=0;i<clip.length&&output.length;i++){
    const a=clip[i],b=clip[(i+1)%clip.length],input=output;output=[];let previous=input.at(-1),previousSide=sign*cross(a,b,previous);
    for(const current of input){const side=sign*cross(a,b,current);if((side>=-1e-7)!==(previousSide>=-1e-7)){const ratio=previousSide/(previousSide-side);output.push({x:previous.x+(current.x-previous.x)*ratio,y:previous.y+(current.y-previous.y)*ratio});}if(side>=-1e-7)output.push(current);previous=current;previousSide=side;}
  }
  return output;
}
// Projective mapping handles transformed iframe content, including perspective.
export function mapQuad(quad,width,height){
  const [p0,p1,p2,p3]=quad,dx1=p1.x-p2.x,dx2=p3.x-p2.x,dy1=p1.y-p2.y,dy2=p3.y-p2.y,dx3=p0.x-p1.x+p2.x-p3.x,dy3=p0.y-p1.y+p2.y-p3.y,det=dx1*dy2-dx2*dy1;
  const g=Math.abs(dx3)+Math.abs(dy3)<1e-7?0:(dx3*dy2-dx2*dy3)/det,h=Math.abs(dx3)+Math.abs(dy3)<1e-7?0:(dx1*dy3-dx3*dy1)/det;
  if(!Number.isFinite(g+h)||width<=0||height<=0)throw new Error('框架内容区域不可映射');
  return point=>{const u=point.x/width,v=point.y/height,w=g*u+h*v+1;return{x:((p1.x-p0.x+g*p1.x)*u+(p3.x-p0.x+h*p3.x)*v+p0.x)/w,y:((p1.y-p0.y+g*p1.y)*u+(p3.y-p0.y+h*p3.y)*v+p0.y)/w};};
}
export function pointInPolygon(point,polygon){
  if(!polygon?.length)return false;let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}
  return inside;
}
export function compareAnnotationPaint(a,b){
  const x=a.paintPath??[a.paintOrder],y=b.paintPath??[b.paintOrder];for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return y[i]-x[i];
  return y.length-x.length||b.ancestry.length-a.ancestry.length||a.region.width*a.region.height-b.region.width*b.region.height;
}
