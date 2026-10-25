import{a as c,o as Ka}from"./opencu-chunk-WWXGUQVT.js";function Jt(){let e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,i=Math.random()*4294967295|0,r=Math.random()*4294967295|0;return(gt[e&255]+gt[e>>8&255]+gt[e>>16&255]+gt[e>>24&255]+"-"+gt[t&255]+gt[t>>8&255]+"-"+gt[t>>16&15|64]+gt[t>>24&255]+"-"+gt[i&63|128]+gt[i>>8&255]+"-"+gt[i>>16&255]+gt[i>>24&255]+gt[r&255]+gt[r>>8&255]+gt[r>>16&255]+gt[r>>24&255]).toLowerCase()}c(Jt,"n");function Fe(e,t,i){return Math.max(t,Math.min(i,e))}c(Fe,"r");function Rn(e,t){return(e%t+t)%t}c(Rn,"i");function mh(e,t,i,r,a){return r+(e-t)*(a-r)/(i-t)}c(mh,"a");function gh(e,t,i){return e===t?0:(i-e)/(t-e)}c(gh,"o");function Nr(e,t,i){return(1-i)*e+i*t}c(Nr,"s");function _h(e,t,i,r){return Nr(e,t,1-Math.exp(-i*r))}c(_h,"c");function vh(e,t=1){return t-Math.abs(Rn(e,t*2)-t)}c(vh,"l");function xh(e,t,i){return e<=t?0:e>=i?1:(e=(e-t)/(i-t),e*e*(3-2*e))}c(xh,"u");function Mh(e,t,i){return e<=t?0:e>=i?1:(e=(e-t)/(i-t),e*e*e*(e*(e*6-15)+10))}c(Mh,"d");function yh(e,t){return e+Math.floor(Math.random()*(t-e+1))}c(yh,"f");function Sh(e,t){return e+Math.random()*(t-e)}c(Sh,"p");function Eh(e){return e*(.5-Math.random())}c(Eh,"m");function Th(e){e!==void 0&&(Ln=e);let t=Ln+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}c(Th,"h");function bh(e){return e*rr}c(bh,"g");function Ah(e){return e*or}c(Ah,"_");function wh(e){return!(e&e-1)&&e!==0}c(wh,"v");function Rh(e){return 2**Math.ceil(Math.log(e)/Math.LN2)}c(Rh,"y");function Ch(e){return 2**Math.floor(Math.log(e)/Math.LN2)}c(Ch,"b");function Ph(e,t,i,r,a){let n=Math.cos,s=Math.sin,o=n(i/2),l=s(i/2),h=n((t+r)/2),u=s((t+r)/2),d=n((t-r)/2),p=s((t-r)/2),g=n((r-t)/2),y=s((r-t)/2);switch(a){case"XYX":e.set(o*u,l*d,l*p,o*h);break;case"YZY":e.set(l*p,o*u,l*d,o*h);break;case"ZXZ":e.set(l*d,l*p,o*u,o*h);break;case"XZX":e.set(o*u,l*y,l*g,o*h);break;case"YXY":e.set(l*g,o*u,l*y,o*h);break;case"ZYZ":e.set(l*y,l*g,o*u,o*h);break;default:console.warn("THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+a)}}c(Ph,"x");function Ft(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return e/4294967295;case Uint16Array:return e/65535;case Uint8Array:return e/255;case Int32Array:return Math.max(e/2147483647,-1);case Int16Array:return Math.max(e/32767,-1);case Int8Array:return Math.max(e/127,-1);default:throw Error("Invalid component type.")}}c(Ft,"S");function Xe(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return Math.round(e*4294967295);case Uint16Array:return Math.round(e*65535);case Uint8Array:return Math.round(e*255);case Int32Array:return Math.round(e*2147483647);case Int16Array:return Math.round(e*32767);case Int8Array:return Math.round(e*127);default:throw Error("Invalid component type.")}}c(Xe,"C");function Co(e){for(let t=e.length-1;t>=0;--t)if(e[t]>=65535)return!0;return!1}c(Co,"w");function Wr(e){return document.createElementNS("http://www.w3.org/1999/xhtml",e)}c(Wr,"E");function Lh(){let e=Wr("canvas");return e.style.display="block",e}c(Lh,"D");function lr(e){e in Un||(Un[e]=!0,console.warn(e))}c(lr,"O");function Uh(e,t,i){return new Promise(function(r,a){function n(){switch(e.clientWaitSync(t,e.SYNC_FLUSH_COMMANDS_BIT,0)){case e.WAIT_FAILED:a();break;case e.TIMEOUT_EXPIRED:setTimeout(n,i);break;default:r()}}c(n,"a"),setTimeout(n,i)})}c(Uh,"k");function Dh(){let e={enabled:!0,workingColorSpace:pr,spaces:{},convert:c(function(a,n,s){return this.enabled===!1||n===s||!n||!s||(this.spaces[n].transfer==="srgb"&&(a.r=ni(a.r),a.g=ni(a.g),a.b=ni(a.b)),this.spaces[n].primaries!==this.spaces[s].primaries&&(a.applyMatrix3(this.spaces[n].toXYZ),a.applyMatrix3(this.spaces[s].fromXYZ)),this.spaces[s].transfer==="srgb"&&(a.r=hr(a.r),a.g=hr(a.g),a.b=hr(a.b))),a},"convert"),workingToColorSpace:c(function(a,n){return this.convert(a,this.workingColorSpace,n)},"workingToColorSpace"),colorSpaceToWorking:c(function(a,n){return this.convert(a,n,this.workingColorSpace)},"colorSpaceToWorking"),getPrimaries:c(function(a){return this.spaces[a].primaries},"getPrimaries"),getTransfer:c(function(a){return a===""?qr:this.spaces[a].transfer},"getTransfer"),getLuminanceCoefficients:c(function(a,n=this.workingColorSpace){return a.fromArray(this.spaces[n].luminanceCoefficients)},"getLuminanceCoefficients"),define:c(function(a){Object.assign(this.spaces,a)},"define"),_getMatrix:c(function(a,n,s){return a.copy(this.spaces[n].toXYZ).multiply(this.spaces[s].fromXYZ)},"_getMatrix"),_getDrawingBufferColorSpace:c(function(a){return this.spaces[a].outputColorSpaceConfig.drawingBufferColorSpace},"_getDrawingBufferColorSpace"),_getUnpackColorSpace:c(function(a=this.workingColorSpace){return this.spaces[a].workingColorSpaceConfig.unpackColorSpace},"_getUnpackColorSpace"),fromWorkingColorSpace:c(function(a,n){return lr("THREE.ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),e.workingToColorSpace(a,n)},"fromWorkingColorSpace"),toWorkingColorSpace:c(function(a,n){return lr("THREE.ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),e.colorSpaceToWorking(a,n)},"toWorkingColorSpace")},t=[.64,.33,.3,.6,.15,.06],i=[.2126,.7152,.0722],r=[.3127,.329];return e.define({[pr]:{primaries:t,whitePoint:r,transfer:qr,toXYZ:Dn,fromXYZ:In,luminanceCoefficients:i,workingColorSpaceConfig:{unpackColorSpace:It},outputColorSpaceConfig:{drawingBufferColorSpace:It}},[It]:{primaries:t,whitePoint:r,transfer:Yr,toXYZ:Dn,fromXYZ:In,luminanceCoefficients:i,outputColorSpaceConfig:{drawingBufferColorSpace:It}}}),e}c(Dh,"ee");function ni(e){return e<.04045?e*.0773993808:(e*.9478672986+.0521327014)**2.4}c(ni,"A");function hr(e){return e<.0031308?e*12.92:1.055*e**.41666-.055}c(hr,"te");function Za(e){return typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap?Rl.getDataURL(e):e.data?{data:Array.from(e.data),width:e.width,height:e.height,type:e.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}c(Za,"j");function Ja(e,t,i,r,a){for(let n=0,s=e.length-3;n<=s;n+=3){pi.fromArray(e,n);let o=a.x*Math.abs(pi.x)+a.y*Math.abs(pi.y)+a.z*Math.abs(pi.z),l=t.dot(pi),h=i.dot(pi),u=r.dot(pi);if(Math.max(-Math.max(l,h,u),Math.min(l,h,u))>o)return!1}return!0}c(Ja,"ne");function $a(e,t,i){return i<0&&(i+=1),i>1&&--i,i<1/6?e+(t-e)*6*i:i<1/2?t:i<2/3?e+(t-e)*6*(2/3-i):e}c($a,"M");function Ih(e,t,i,r,a,n,s,o){let l;if(l=t.side===1?r.intersectTriangle(s,n,a,!0,o):r.intersectTriangle(a,n,s,t.side===0,o),l===null)return null;zr.copy(o),zr.applyMatrix4(e.matrixWorld);let h=i.ray.origin.distanceTo(zr);return h<i.near||h>i.far?null:{distance:h,point:zr.clone(),object:e}}c(Ih,"ae");function Jr(e,t,i,r,a,n,s,o,l,h){e.getVertexPosition(o,Or),e.getVertexPosition(l,Fr),e.getVertexPosition(h,Br);let u=Ih(e,t,i,r,Or,Fr,Br,Bn);if(u){let d=new O;Hi.getBarycoord(Bn,Or,Fr,Br,d),a&&(u.uv=Hi.getInterpolatedAttribute(a,o,l,h,d,new Be)),n&&(u.uv1=Hi.getInterpolatedAttribute(n,o,l,h,d,new Be)),s&&(u.normal=Hi.getInterpolatedAttribute(s,o,l,h,d,new O),u.normal.dot(r.direction)>0&&u.normal.multiplyScalar(-1));let p={a:o,b:l,c:h,normal:new O,materialIndex:0};Hi.getNormal(Or,Fr,Br,p.normal),u.face=p,u.barycoord=d}return u}c(Jr,"oe");function cr(e){let t={};for(let i in e){t[i]={};for(let r in e[i]){let a=e[i][r];a&&(a.isColor||a.isMatrix3||a.isMatrix4||a.isVector2||a.isVector3||a.isVector4||a.isTexture||a.isQuaternion)?a.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[i][r]=null):t[i][r]=a.clone():Array.isArray(a)?t[i][r]=a.slice():t[i][r]=a}}return t}c(cr,"P");function Mt(e){let t={};for(let i=0;i<e.length;i++){let r=cr(e[i]);for(let a in r)t[a]=r[a]}return t}c(Mt,"F");function Nh(e){let t=[];for(let i=0;i<e.length;i++)t.push(e[i].clone());return t}c(Nh,"se");function Po(e){let t=e.getRenderTarget();return t===null?e.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:ke.workingColorSpace}c(Po,"ce");function $r(e,t,i,r,a,n){Bi.subVectors(e,i).addScalar(.5).multiply(r),a===void 0?ar.copy(Bi):(ar.x=n*Bi.x-a*Bi.y,ar.y=a*Bi.x+n*Bi.y),e.copy(t),e.x+=ar.x,e.y+=ar.y,e.applyMatrix4(Hn)}c($r,"le");function Qr(e,t,i,r,a,n,s){let o=e.geometry.attributes.position;if(Xr.fromBufferAttribute(o,a),jr.fromBufferAttribute(o,n),i.distanceSqToSegment(Xr,jr,Fa,Vn)>r)return;Fa.applyMatrix4(e.matrixWorld);let l=t.ray.origin.distanceTo(Fa);if(!(l<t.near||l>t.far))return{distance:l,point:Vn.clone().applyMatrix4(e.matrixWorld),index:s,face:null,faceIndex:null,barycoord:null,object:e}}c(Qr,"I");function ea(e,t){return!e||e.constructor===t?e:typeof t.BYTES_PER_ELEMENT=="number"?new t(e):Array.prototype.slice.call(e)}c(ea,"ct");function Oh(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}c(Oh,"lt");function fs(e,t){return e.distance-t.distance}c(fs,"_t");function Cn(e,t,i,r){let a=!0;if(e.layers.test(t.layers)&&e.raycast(t,i)===!1&&(a=!1),a===!0&&r===!0){let n=e.children;for(let s=0,o=n.length;s<o;s++)Cn(n[s],t,i,!0)}}c(Cn,"vt");function ms(e,t,i,r){let a=Fh(r);switch(i){case ko:return e*t;case Wo:return e*t/a.components*a.byteLength;case Xo:return e*t/a.components*a.byteLength;case jo:return e*t*2/a.components*a.byteLength;case qo:return e*t*2/a.components*a.byteLength;case Go:return e*t*3/a.components*a.byteLength;case dr:return e*t*4/a.components*a.byteLength;case Yo:return e*t*4/a.components*a.byteLength;case Ko:case Zo:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case Jo:case $o:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case el:case il:return Math.max(e,16)*Math.max(t,8)/4;case Qo:case tl:return Math.max(e,8)*Math.max(t,8)/2;case rl:case al:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case nl:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case sl:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case ol:return Math.floor((e+4)/5)*Math.floor((t+3)/4)*16;case ll:return Math.floor((e+4)/5)*Math.floor((t+4)/5)*16;case hl:return Math.floor((e+5)/6)*Math.floor((t+4)/5)*16;case cl:return Math.floor((e+5)/6)*Math.floor((t+5)/6)*16;case ul:return Math.floor((e+7)/8)*Math.floor((t+4)/5)*16;case dl:return Math.floor((e+7)/8)*Math.floor((t+5)/6)*16;case pl:return Math.floor((e+7)/8)*Math.floor((t+7)/8)*16;case fl:return Math.floor((e+9)/10)*Math.floor((t+4)/5)*16;case ml:return Math.floor((e+9)/10)*Math.floor((t+5)/6)*16;case gl:return Math.floor((e+9)/10)*Math.floor((t+7)/8)*16;case _l:return Math.floor((e+9)/10)*Math.floor((t+9)/10)*16;case vl:return Math.floor((e+11)/12)*Math.floor((t+9)/10)*16;case xl:return Math.floor((e+11)/12)*Math.floor((t+11)/12)*16;case Ml:case yl:case Sl:return Math.ceil(e/4)*Math.ceil(t/4)*16;case El:case Tl:return Math.ceil(e/4)*Math.ceil(t/4)*8;case bl:case Al:return Math.ceil(e/4)*Math.ceil(t/4)*16}throw Error(`Unable to determine texture byte length for ${i} format.`)}c(ms,"Tt");function Fh(e){switch(e){case ur:case Io:return{byteLength:1,components:1};case Oo:case No:case Wa:return{byteLength:2,components:1};case Bo:case zo:return{byteLength:2,components:4};case ka:case Fo:case Ga:return{byteLength:4,components:1};case Vo:return{byteLength:4,components:3}}throw Error(`Unknown texture type ${e}.`)}c(Fh,"Et");var Da,di,Ia,Kt,Lo,Uo,_i,Do,Va,ur,Io,No,Oo,Fo,ka,Ga,Wa,Bo,zo,Ho,Vo,ko,Go,dr,Pn,es,Wo,Xo,jo,qo,Yo,Ko,Zo,Jo,$o,Qo,el,tl,il,rl,al,nl,sl,ol,ll,hl,cl,ul,dl,pl,fl,ml,gl,_l,vl,xl,Ml,yl,Sl,El,Tl,bl,Al,gr,ta,ia,Qa,en,tn,gs,wl,It,pr,qr,Yr,ra,rn,zi,Fi,gt,Ln,rr,or,Bh,Be,yi,O,aa,an,Ne,na,Un,Dn,In,ke,Wi,Rl,_s,sa,vs,oa,Lt,nt,xs,vi,ts,Cl,Xi,kt,wt,_r,Si,Ei,Ti,$t,Qt,oi,ji,vr,xr,pi,Ms,qi,la,Mr,Gt,ha,yr,ei,ca,Sr,ua,da,at,bi,Rt,ys,Ss,ti,Er,yt,nn,sn,ai,Na,Es,on,Ai,Wt,Tr,Yi,Ts,bs,ln,hn,cn,un,As,wi,pa,Ct,Pt,Xt,fa,jt,Ri,Ci,dn,ma,ga,_a,va,xa,Ma,Hi,pn,ii,br,ze,mt,ws,li,Nn,it,Ar,Rs,Ut,On,Fn,xt,Cs,Tt,ya,Pi,St,Ki,ot,Yt,fn,hi,wr,mn,Or,Fr,Br,Sa,Rr,Bn,zr,Zt,Xa,Pl,Ps,Ls,si,gn,ri,_n,vn,Dt,Li,Ui,Us,zn,Ll,Cr,Ds,Oa,zh,Is,_t,xn,Ns,Zi,Ji,Di,Ii,Bi,ar,Hn,Pr,$i,Lr,Mn,Ea,yn,Hh,Ta,Os,Fs,fi,ci,Bs,Ur,is,zs,Xr,jr,Sn,Qi,Dr,Fa,Vn,Vh,kh,kn,Gh,rs,Wh,Hs,Xh,Ul,Dl,Ir,Vs,ks,Gs,Bt,er,Ws,Xs,js,En,tr,qs,ir,Ys,Ks,ba,qt,Zs,jh,Ni,qh,Il,Nl,Js,$s,Aa,Qs,eo,to,io,ro,ao,no,so,tt,Tn,Yh;function ql(){return(ql=Ka(()=>{Da=1e3,di=1001,Ia=1002,Kt=1003,Lo=1004,Uo=1005,_i=1006,Do=1007,Va=1008,ur=1009,Io=1010,No=1011,Oo=1012,Fo=1013,ka=1014,Ga=1015,Wa=1016,Bo=1017,zo=1018,Ho=1020,Vo=35902,ko=1021,Go=1022,dr=1023,Pn=1026,es=1027,Wo=1028,Xo=1029,jo=1030,qo=1031,Yo=1033,Ko=33776,Zo=33777,Jo=33778,$o=33779,Qo=35840,el=35841,tl=35842,il=35843,rl=36196,al=37492,nl=37496,sl=37808,ol=37809,ll=37810,hl=37811,cl=37812,ul=37813,dl=37814,pl=37815,fl=37816,ml=37817,gl=37818,_l=37819,vl=37820,xl=37821,Ml=36492,yl=36494,Sl=36495,El=36283,Tl=36284,bl=36285,Al=36286,gr=2300,ta=2301,ia=2302,Qa=2400,en=2401,tn=2402,gs=3200,wl=3201,It="srgb",pr="srgb-linear",qr="linear",Yr="srgb",ra=7680,rn=35044,zi=2e3,Fi=class{static{c(this,"fa")}addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let i=this._listeners;i[e]===void 0&&(i[e]=[]),i[e].indexOf(t)===-1&&i[e].push(t)}hasEventListener(e,t){let i=this._listeners;return i!==void 0&&i[e]!==void 0&&i[e].indexOf(t)!==-1}removeEventListener(e,t){let i=this._listeners;if(i===void 0)return;let r=i[e];if(r!==void 0){let a=r.indexOf(t);a!==-1&&r.splice(a,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let i=t[e.type];if(i!==void 0){e.target=this;let r=i.slice(0);for(let a=0,n=r.length;a<n;a++)r[a].call(this,e);e.target=null}}},gt="00.01.02.03.04.05.06.07.08.09.0a.0b.0c.0d.0e.0f.10.11.12.13.14.15.16.17.18.19.1a.1b.1c.1d.1e.1f.20.21.22.23.24.25.26.27.28.29.2a.2b.2c.2d.2e.2f.30.31.32.33.34.35.36.37.38.39.3a.3b.3c.3d.3e.3f.40.41.42.43.44.45.46.47.48.49.4a.4b.4c.4d.4e.4f.50.51.52.53.54.55.56.57.58.59.5a.5b.5c.5d.5e.5f.60.61.62.63.64.65.66.67.68.69.6a.6b.6c.6d.6e.6f.70.71.72.73.74.75.76.77.78.79.7a.7b.7c.7d.7e.7f.80.81.82.83.84.85.86.87.88.89.8a.8b.8c.8d.8e.8f.90.91.92.93.94.95.96.97.98.99.9a.9b.9c.9d.9e.9f.a0.a1.a2.a3.a4.a5.a6.a7.a8.a9.aa.ab.ac.ad.ae.af.b0.b1.b2.b3.b4.b5.b6.b7.b8.b9.ba.bb.bc.bd.be.bf.c0.c1.c2.c3.c4.c5.c6.c7.c8.c9.ca.cb.cc.cd.ce.cf.d0.d1.d2.d3.d4.d5.d6.d7.d8.d9.da.db.dc.dd.de.df.e0.e1.e2.e3.e4.e5.e6.e7.e8.e9.ea.eb.ec.ed.ee.ef.f0.f1.f2.f3.f4.f5.f6.f7.f8.f9.fa.fb.fc.fd.fe.ff".split("."),Ln=1234567,rr=Math.PI/180,or=180/Math.PI,Bh={DEG2RAD:rr,RAD2DEG:or,generateUUID:Jt,clamp:Fe,euclideanModulo:Rn,mapLinear:mh,inverseLerp:gh,lerp:Nr,damp:_h,pingpong:vh,smoothstep:xh,smootherstep:Mh,randInt:yh,randFloat:Sh,randFloatSpread:Eh,seededRandom:Th,degToRad:bh,radToDeg:Ah,isPowerOfTwo:wh,ceilPowerOfTwo:Rh,floorPowerOfTwo:Ch,setQuaternionFromProperEuler:Ph,normalize:Xe,denormalize:Ft},Be=class Ol{static{c(this,"e")}constructor(t=0,i=0){Ol.prototype.isVector2=!0,this.x=t,this.y=i}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,i){return this.x=t,this.y=i,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,i){switch(t){case 0:this.x=i;break;case 1:this.y=i;break;default:throw Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,i){return this.x=t.x+i.x,this.y=t.y+i.y,this}addScaledVector(t,i){return this.x+=t.x*i,this.y+=t.y*i,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,i){return this.x=t.x-i.x,this.y=t.y-i.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let i=this.x,r=this.y,a=t.elements;return this.x=a[0]*i+a[3]*r+a[6],this.y=a[1]*i+a[4]*r+a[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,i){return this.x=Fe(this.x,t.x,i.x),this.y=Fe(this.y,t.y,i.y),this}clampScalar(t,i){return this.x=Fe(this.x,t,i),this.y=Fe(this.y,t,i),this}clampLength(t,i){let r=this.length();return this.divideScalar(r||1).multiplyScalar(Fe(r,t,i))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let i=Math.sqrt(this.lengthSq()*t.lengthSq());if(i===0)return Math.PI/2;let r=this.dot(t)/i;return Math.acos(Fe(r,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let i=this.x-t.x,r=this.y-t.y;return i*i+r*r}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,i){return this.x+=(t.x-this.x)*i,this.y+=(t.y-this.y)*i,this}lerpVectors(t,i,r){return this.x=t.x+(i.x-t.x)*r,this.y=t.y+(i.y-t.y)*r,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,i=0){return this.x=t[i],this.y=t[i+1],this}toArray(t=[],i=0){return t[i]=this.x,t[i+1]=this.y,t}fromBufferAttribute(t,i){return this.x=t.getX(i),this.y=t.getY(i),this}rotateAround(t,i){let r=Math.cos(i),a=Math.sin(i),n=this.x-t.x,s=this.y-t.y;return this.x=n*r-s*a+t.x,this.y=n*a+s*r+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},yi=class{static{c(this,"va")}constructor(e=0,t=0,i=0,r=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=i,this._w=r}static slerpFlat(e,t,i,r,a,n,s){let o=i[r+0],l=i[r+1],h=i[r+2],u=i[r+3],d=a[n+0],p=a[n+1],g=a[n+2],y=a[n+3];if(s===0){e[t+0]=o,e[t+1]=l,e[t+2]=h,e[t+3]=u;return}if(s===1){e[t+0]=d,e[t+1]=p,e[t+2]=g,e[t+3]=y;return}if(u!==y||o!==d||l!==p||h!==g){let v=1-s,m=o*d+l*p+h*g+u*y,f=m>=0?1:-1,w=1-m*m;if(w>2**-52){let b=Math.sqrt(w),I=Math.atan2(b,m*f);v=Math.sin(v*I)/b,s=Math.sin(s*I)/b}let S=s*f;if(o=o*v+d*S,l=l*v+p*S,h=h*v+g*S,u=u*v+y*S,v===1-s){let b=1/Math.sqrt(o*o+l*l+h*h+u*u);o*=b,l*=b,h*=b,u*=b}}e[t]=o,e[t+1]=l,e[t+2]=h,e[t+3]=u}static multiplyQuaternionsFlat(e,t,i,r,a,n){let s=i[r],o=i[r+1],l=i[r+2],h=i[r+3],u=a[n],d=a[n+1],p=a[n+2],g=a[n+3];return e[t]=s*g+h*u+o*p-l*d,e[t+1]=o*g+h*d+l*u-s*p,e[t+2]=l*g+h*p+s*d-o*u,e[t+3]=h*g-s*u-o*d-l*p,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,i,r){return this._x=e,this._y=t,this._z=i,this._w=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let i=e._x,r=e._y,a=e._z,n=e._order,s=Math.cos,o=Math.sin,l=s(i/2),h=s(r/2),u=s(a/2),d=o(i/2),p=o(r/2),g=o(a/2);switch(n){case"XYZ":this._x=d*h*u+l*p*g,this._y=l*p*u-d*h*g,this._z=l*h*g+d*p*u,this._w=l*h*u-d*p*g;break;case"YXZ":this._x=d*h*u+l*p*g,this._y=l*p*u-d*h*g,this._z=l*h*g-d*p*u,this._w=l*h*u+d*p*g;break;case"ZXY":this._x=d*h*u-l*p*g,this._y=l*p*u+d*h*g,this._z=l*h*g+d*p*u,this._w=l*h*u-d*p*g;break;case"ZYX":this._x=d*h*u-l*p*g,this._y=l*p*u+d*h*g,this._z=l*h*g-d*p*u,this._w=l*h*u+d*p*g;break;case"YZX":this._x=d*h*u+l*p*g,this._y=l*p*u+d*h*g,this._z=l*h*g-d*p*u,this._w=l*h*u-d*p*g;break;case"XZY":this._x=d*h*u-l*p*g,this._y=l*p*u-d*h*g,this._z=l*h*g+d*p*u,this._w=l*h*u+d*p*g;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+n)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let i=t/2,r=Math.sin(i);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(i),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,i=t[0],r=t[4],a=t[8],n=t[1],s=t[5],o=t[9],l=t[2],h=t[6],u=t[10],d=i+s+u;if(d>0){let p=.5/Math.sqrt(d+1);this._w=.25/p,this._x=(h-o)*p,this._y=(a-l)*p,this._z=(n-r)*p}else if(i>s&&i>u){let p=2*Math.sqrt(1+i-s-u);this._w=(h-o)/p,this._x=.25*p,this._y=(r+n)/p,this._z=(a+l)/p}else if(s>u){let p=2*Math.sqrt(1+s-i-u);this._w=(a-l)/p,this._x=(r+n)/p,this._y=.25*p,this._z=(o+h)/p}else{let p=2*Math.sqrt(1+u-i-s);this._w=(n-r)/p,this._x=(a+l)/p,this._y=(o+h)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let i=e.dot(t)+1;return i<1e-8?(i=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=i):(this._x=0,this._y=-e.z,this._z=e.y,this._w=i)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=i),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(Fe(this.dot(e),-1,1)))}rotateTowards(e,t){let i=this.angleTo(e);if(i===0)return this;let r=Math.min(1,t/i);return this.slerp(e,r),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x*=e,this._y*=e,this._z*=e,this._w*=e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let i=e._x,r=e._y,a=e._z,n=e._w,s=t._x,o=t._y,l=t._z,h=t._w;return this._x=i*h+n*s+r*l-a*o,this._y=r*h+n*o+a*s-i*l,this._z=a*h+n*l+i*o-r*s,this._w=n*h-i*s-r*o-a*l,this._onChangeCallback(),this}slerp(e,t){if(t===0)return this;if(t===1)return this.copy(e);let i=this._x,r=this._y,a=this._z,n=this._w,s=n*e._w+i*e._x+r*e._y+a*e._z;if(s<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,s=-s):this.copy(e),s>=1)return this._w=n,this._x=i,this._y=r,this._z=a,this;let o=1-s*s;if(o<=2**-52){let p=1-t;return this._w=p*n+t*this._w,this._x=p*i+t*this._x,this._y=p*r+t*this._y,this._z=p*a+t*this._z,this.normalize(),this}let l=Math.sqrt(o),h=Math.atan2(l,s),u=Math.sin((1-t)*h)/l,d=Math.sin(t*h)/l;return this._w=n*u+this._w*d,this._x=i*u+this._x*d,this._y=r*u+this._y*d,this._z=a*u+this._z*d,this._onChangeCallback(),this}slerpQuaternions(e,t,i){return this.copy(e).slerp(t,i)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),i=Math.random(),r=Math.sqrt(1-i),a=Math.sqrt(i);return this.set(r*Math.sin(e),r*Math.cos(e),a*Math.sin(t),a*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},O=class Fl{static{c(this,"e")}constructor(t=0,i=0,r=0){Fl.prototype.isVector3=!0,this.x=t,this.y=i,this.z=r}set(t,i,r){return r===void 0&&(r=this.z),this.x=t,this.y=i,this.z=r,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,i){switch(t){case 0:this.x=i;break;case 1:this.y=i;break;case 2:this.z=i;break;default:throw Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,i){return this.x=t.x+i.x,this.y=t.y+i.y,this.z=t.z+i.z,this}addScaledVector(t,i){return this.x+=t.x*i,this.y+=t.y*i,this.z+=t.z*i,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,i){return this.x=t.x-i.x,this.y=t.y-i.y,this.z=t.z-i.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,i){return this.x=t.x*i.x,this.y=t.y*i.y,this.z=t.z*i.z,this}applyEuler(t){return this.applyQuaternion(an.setFromEuler(t))}applyAxisAngle(t,i){return this.applyQuaternion(an.setFromAxisAngle(t,i))}applyMatrix3(t){let i=this.x,r=this.y,a=this.z,n=t.elements;return this.x=n[0]*i+n[3]*r+n[6]*a,this.y=n[1]*i+n[4]*r+n[7]*a,this.z=n[2]*i+n[5]*r+n[8]*a,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let i=this.x,r=this.y,a=this.z,n=t.elements,s=1/(n[3]*i+n[7]*r+n[11]*a+n[15]);return this.x=(n[0]*i+n[4]*r+n[8]*a+n[12])*s,this.y=(n[1]*i+n[5]*r+n[9]*a+n[13])*s,this.z=(n[2]*i+n[6]*r+n[10]*a+n[14])*s,this}applyQuaternion(t){let i=this.x,r=this.y,a=this.z,n=t.x,s=t.y,o=t.z,l=t.w,h=2*(s*a-o*r),u=2*(o*i-n*a),d=2*(n*r-s*i);return this.x=i+l*h+s*d-o*u,this.y=r+l*u+o*h-n*d,this.z=a+l*d+n*u-s*h,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let i=this.x,r=this.y,a=this.z,n=t.elements;return this.x=n[0]*i+n[4]*r+n[8]*a,this.y=n[1]*i+n[5]*r+n[9]*a,this.z=n[2]*i+n[6]*r+n[10]*a,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,i){return this.x=Fe(this.x,t.x,i.x),this.y=Fe(this.y,t.y,i.y),this.z=Fe(this.z,t.z,i.z),this}clampScalar(t,i){return this.x=Fe(this.x,t,i),this.y=Fe(this.y,t,i),this.z=Fe(this.z,t,i),this}clampLength(t,i){let r=this.length();return this.divideScalar(r||1).multiplyScalar(Fe(r,t,i))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,i){return this.x+=(t.x-this.x)*i,this.y+=(t.y-this.y)*i,this.z+=(t.z-this.z)*i,this}lerpVectors(t,i,r){return this.x=t.x+(i.x-t.x)*r,this.y=t.y+(i.y-t.y)*r,this.z=t.z+(i.z-t.z)*r,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,i){let r=t.x,a=t.y,n=t.z,s=i.x,o=i.y,l=i.z;return this.x=a*l-n*o,this.y=n*s-r*l,this.z=r*o-a*s,this}projectOnVector(t){let i=t.lengthSq();if(i===0)return this.set(0,0,0);let r=t.dot(this)/i;return this.copy(t).multiplyScalar(r)}projectOnPlane(t){return aa.copy(this).projectOnVector(t),this.sub(aa)}reflect(t){return this.sub(aa.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let i=Math.sqrt(this.lengthSq()*t.lengthSq());if(i===0)return Math.PI/2;let r=this.dot(t)/i;return Math.acos(Fe(r,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let i=this.x-t.x,r=this.y-t.y,a=this.z-t.z;return i*i+r*r+a*a}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,i,r){let a=Math.sin(i)*t;return this.x=a*Math.sin(r),this.y=Math.cos(i)*t,this.z=a*Math.cos(r),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,i,r){return this.x=t*Math.sin(i),this.y=r,this.z=t*Math.cos(i),this}setFromMatrixPosition(t){let i=t.elements;return this.x=i[12],this.y=i[13],this.z=i[14],this}setFromMatrixScale(t){let i=this.setFromMatrixColumn(t,0).length(),r=this.setFromMatrixColumn(t,1).length(),a=this.setFromMatrixColumn(t,2).length();return this.x=i,this.y=r,this.z=a,this}setFromMatrixColumn(t,i){return this.fromArray(t.elements,i*4)}setFromMatrix3Column(t,i){return this.fromArray(t.elements,i*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,i=0){return this.x=t[i],this.y=t[i+1],this.z=t[i+2],this}toArray(t=[],i=0){return t[i]=this.x,t[i+1]=this.y,t[i+2]=this.z,t}fromBufferAttribute(t,i){return this.x=t.getX(i),this.y=t.getY(i),this.z=t.getZ(i),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=Math.random()*Math.PI*2,i=Math.random()*2-1,r=Math.sqrt(1-i*i);return this.x=r*Math.cos(t),this.y=i,this.z=r*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},aa=new O,an=new yi,Ne=class Bl{static{c(this,"e")}constructor(t,i,r,a,n,s,o,l,h){Bl.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,i,r,a,n,s,o,l,h)}set(t,i,r,a,n,s,o,l,h){let u=this.elements;return u[0]=t,u[1]=a,u[2]=o,u[3]=i,u[4]=n,u[5]=l,u[6]=r,u[7]=s,u[8]=h,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let i=this.elements,r=t.elements;return i[0]=r[0],i[1]=r[1],i[2]=r[2],i[3]=r[3],i[4]=r[4],i[5]=r[5],i[6]=r[6],i[7]=r[7],i[8]=r[8],this}extractBasis(t,i,r){return t.setFromMatrix3Column(this,0),i.setFromMatrix3Column(this,1),r.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let i=t.elements;return this.set(i[0],i[4],i[8],i[1],i[5],i[9],i[2],i[6],i[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,i){let r=t.elements,a=i.elements,n=this.elements,s=r[0],o=r[3],l=r[6],h=r[1],u=r[4],d=r[7],p=r[2],g=r[5],y=r[8],v=a[0],m=a[3],f=a[6],w=a[1],S=a[4],b=a[7],I=a[2],L=a[5],P=a[8];return n[0]=s*v+o*w+l*I,n[3]=s*m+o*S+l*L,n[6]=s*f+o*b+l*P,n[1]=h*v+u*w+d*I,n[4]=h*m+u*S+d*L,n[7]=h*f+u*b+d*P,n[2]=p*v+g*w+y*I,n[5]=p*m+g*S+y*L,n[8]=p*f+g*b+y*P,this}multiplyScalar(t){let i=this.elements;return i[0]*=t,i[3]*=t,i[6]*=t,i[1]*=t,i[4]*=t,i[7]*=t,i[2]*=t,i[5]*=t,i[8]*=t,this}determinant(){let t=this.elements,i=t[0],r=t[1],a=t[2],n=t[3],s=t[4],o=t[5],l=t[6],h=t[7],u=t[8];return i*s*u-i*o*h-r*n*u+r*o*l+a*n*h-a*s*l}invert(){let t=this.elements,i=t[0],r=t[1],a=t[2],n=t[3],s=t[4],o=t[5],l=t[6],h=t[7],u=t[8],d=u*s-o*h,p=o*l-u*n,g=h*n-s*l,y=i*d+r*p+a*g;if(y===0)return this.set(0,0,0,0,0,0,0,0,0);let v=1/y;return t[0]=d*v,t[1]=(a*h-u*r)*v,t[2]=(o*r-a*s)*v,t[3]=p*v,t[4]=(u*i-a*l)*v,t[5]=(a*n-o*i)*v,t[6]=g*v,t[7]=(r*l-h*i)*v,t[8]=(s*i-r*n)*v,this}transpose(){let t,i=this.elements;return t=i[1],i[1]=i[3],i[3]=t,t=i[2],i[2]=i[6],i[6]=t,t=i[5],i[5]=i[7],i[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let i=this.elements;return t[0]=i[0],t[1]=i[3],t[2]=i[6],t[3]=i[1],t[4]=i[4],t[5]=i[7],t[6]=i[2],t[7]=i[5],t[8]=i[8],this}setUvTransform(t,i,r,a,n,s,o){let l=Math.cos(n),h=Math.sin(n);return this.set(r*l,r*h,-r*(l*s+h*o)+s+t,-a*h,a*l,-a*(-h*s+l*o)+o+i,0,0,1),this}scale(t,i){return this.premultiply(na.makeScale(t,i)),this}rotate(t){return this.premultiply(na.makeRotation(-t)),this}translate(t,i){return this.premultiply(na.makeTranslation(t,i)),this}makeTranslation(t,i){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,i,0,0,1),this}makeRotation(t){let i=Math.cos(t),r=Math.sin(t);return this.set(i,-r,0,r,i,0,0,0,1),this}makeScale(t,i){return this.set(t,0,0,0,i,0,0,0,1),this}equals(t){let i=this.elements,r=t.elements;for(let a=0;a<9;a++)if(i[a]!==r[a])return!1;return!0}fromArray(t,i=0){for(let r=0;r<9;r++)this.elements[r]=t[r+i];return this}toArray(t=[],i=0){let r=this.elements;return t[i]=r[0],t[i+1]=r[1],t[i+2]=r[2],t[i+3]=r[3],t[i+4]=r[4],t[i+5]=r[5],t[i+6]=r[6],t[i+7]=r[7],t[i+8]=r[8],t}clone(){return new this.constructor().fromArray(this.elements)}},na=new Ne,Un={},Dn=new Ne().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),In=new Ne().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715),ke=Dh(),Rl=class{static{c(this,"Da")}static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let i;if(e instanceof HTMLCanvasElement)i=e;else{Wi===void 0&&(Wi=Wr("canvas")),Wi.width=e.width,Wi.height=e.height;let r=Wi.getContext("2d");e instanceof ImageData?r.putImageData(e,0,0):r.drawImage(e,0,0,e.width,e.height),i=Wi}return i.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=Wr("canvas");t.width=e.width,t.height=e.height;let i=t.getContext("2d");i.drawImage(e,0,0,e.width,e.height);let r=i.getImageData(0,0,e.width,e.height),a=r.data;for(let n=0;n<a.length;n++)a[n]=ni(a[n]/255)*255;return i.putImageData(r,0,0),t}if(e.data){let t=e.data.slice(0);for(let i=0;i<t.length;i++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[i]=Math.floor(ni(t[i]/255)*255):t[i]=ni(t[i]);return{data:t,width:e.width,height:e.height}}return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}},_s=0,sa=class{static{c(this,"ka")}constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:_s++}),this.uuid=Jt(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;return t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):t instanceof VideoFrame?e.set(t.displayHeight,t.displayWidth,0):t===null?e.set(0,0,0):e.set(t.width,t.height,t.depth||0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let i={uuid:this.uuid,url:""},r=this.data;if(r!==null){let a;if(Array.isArray(r)){a=[];for(let n=0,s=r.length;n<s;n++)r[n].isDataTexture?a.push(Za(r[n].image)):a.push(Za(r[n]))}else a=Za(r);i.url=a}return t||(e.images[this.uuid]=i),i}},vs=0,oa=new O,Lt=class Ba extends Fi{static{c(this,"e")}constructor(t=Ba.DEFAULT_IMAGE,i=Ba.DEFAULT_MAPPING,r=di,a=di,n=_i,s=Va,o=dr,l=ur,h=Ba.DEFAULT_ANISOTROPY,u=""){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:vs++}),this.uuid=Jt(),this.name="",this.source=new sa(t),this.mipmaps=[],this.mapping=i,this.channel=0,this.wrapS=r,this.wrapT=a,this.magFilter=n,this.minFilter=s,this.anisotropy=h,this.format=o,this.internalFormat=null,this.type=l,this.offset=new Be(0,0),this.repeat=new Be(1,1),this.center=new Be(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Ne,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0}get width(){return this.source.getSize(oa).x}get height(){return this.source.getSize(oa).y}get depth(){return this.source.getSize(oa).z}get image(){return this.source.data}set image(t=null){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,i){this.updateRanges.push({start:t,count:i})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(let i in t){let r=t[i];if(r===void 0){console.warn(`THREE.Texture.setValues(): parameter '${i}' has value of undefined.`);continue}let a=this[i];if(a===void 0){console.warn(`THREE.Texture.setValues(): property '${i}' does not exist.`);continue}a&&r&&a.isVector2&&r.isVector2||a&&r&&a.isVector3&&r.isVector3||a&&r&&a.isMatrix3&&r.isMatrix3?a.copy(r):this[i]=r}}toJSON(t){let i=t===void 0||typeof t=="string";if(!i&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let r={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(r.userData=this.userData),i||(t.textures[this.uuid]=r),r}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==300)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case Da:t.x-=Math.floor(t.x);break;case di:t.x=t.x<0?0:1;break;case Ia:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x-=Math.floor(t.x)}if(t.y<0||t.y>1)switch(this.wrapT){case Da:t.y-=Math.floor(t.y);break;case di:t.y=t.y<0?0:1;break;case Ia:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y-=Math.floor(t.y)}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}},Lt.DEFAULT_IMAGE=null,Lt.DEFAULT_MAPPING=300,Lt.DEFAULT_ANISOTROPY=1,nt=class zl{static{c(this,"e")}constructor(t=0,i=0,r=0,a=1){zl.prototype.isVector4=!0,this.x=t,this.y=i,this.z=r,this.w=a}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,i,r,a){return this.x=t,this.y=i,this.z=r,this.w=a,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,i){switch(t){case 0:this.x=i;break;case 1:this.y=i;break;case 2:this.z=i;break;case 3:this.w=i;break;default:throw Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w===void 0?1:t.w,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,i){return this.x=t.x+i.x,this.y=t.y+i.y,this.z=t.z+i.z,this.w=t.w+i.w,this}addScaledVector(t,i){return this.x+=t.x*i,this.y+=t.y*i,this.z+=t.z*i,this.w+=t.w*i,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,i){return this.x=t.x-i.x,this.y=t.y-i.y,this.z=t.z-i.z,this.w=t.w-i.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let i=this.x,r=this.y,a=this.z,n=this.w,s=t.elements;return this.x=s[0]*i+s[4]*r+s[8]*a+s[12]*n,this.y=s[1]*i+s[5]*r+s[9]*a+s[13]*n,this.z=s[2]*i+s[6]*r+s[10]*a+s[14]*n,this.w=s[3]*i+s[7]*r+s[11]*a+s[15]*n,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let i=Math.sqrt(1-t.w*t.w);return i<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/i,this.y=t.y/i,this.z=t.z/i),this}setAxisAngleFromRotationMatrix(t){let i,r,a,n,s=.01,o=.1,l=t.elements,h=l[0],u=l[4],d=l[8],p=l[1],g=l[5],y=l[9],v=l[2],m=l[6],f=l[10];if(Math.abs(u-p)<s&&Math.abs(d-v)<s&&Math.abs(y-m)<s){if(Math.abs(u+p)<o&&Math.abs(d+v)<o&&Math.abs(y+m)<o&&Math.abs(h+g+f-3)<o)return this.set(1,0,0,0),this;i=Math.PI;let S=(h+1)/2,b=(g+1)/2,I=(f+1)/2,L=(u+p)/4,P=(d+v)/4,B=(y+m)/4;return S>b&&S>I?S<s?(r=0,a=.707106781,n=.707106781):(r=Math.sqrt(S),a=L/r,n=P/r):b>I?b<s?(r=.707106781,a=0,n=.707106781):(a=Math.sqrt(b),r=L/a,n=B/a):I<s?(r=.707106781,a=.707106781,n=0):(n=Math.sqrt(I),r=P/n,a=B/n),this.set(r,a,n,i),this}let w=Math.sqrt((m-y)*(m-y)+(d-v)*(d-v)+(p-u)*(p-u));return Math.abs(w)<.001&&(w=1),this.x=(m-y)/w,this.y=(d-v)/w,this.z=(p-u)/w,this.w=Math.acos((h+g+f-1)/2),this}setFromMatrixPosition(t){let i=t.elements;return this.x=i[12],this.y=i[13],this.z=i[14],this.w=i[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,i){return this.x=Fe(this.x,t.x,i.x),this.y=Fe(this.y,t.y,i.y),this.z=Fe(this.z,t.z,i.z),this.w=Fe(this.w,t.w,i.w),this}clampScalar(t,i){return this.x=Fe(this.x,t,i),this.y=Fe(this.y,t,i),this.z=Fe(this.z,t,i),this.w=Fe(this.w,t,i),this}clampLength(t,i){let r=this.length();return this.divideScalar(r||1).multiplyScalar(Fe(r,t,i))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,i){return this.x+=(t.x-this.x)*i,this.y+=(t.y-this.y)*i,this.z+=(t.z-this.z)*i,this.w+=(t.w-this.w)*i,this}lerpVectors(t,i,r){return this.x=t.x+(i.x-t.x)*r,this.y=t.y+(i.y-t.y)*r,this.z=t.z+(i.z-t.z)*r,this.w=t.w+(i.w-t.w)*r,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,i=0){return this.x=t[i],this.y=t[i+1],this.z=t[i+2],this.w=t[i+3],this}toArray(t=[],i=0){return t[i]=this.x,t[i+1]=this.y,t[i+2]=this.z,t[i+3]=this.w,t}fromBufferAttribute(t,i){return this.x=t.getX(i),this.y=t.getY(i),this.z=t.getZ(i),this.w=t.getW(i),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},xs=class extends Fi{static{c(this,"Na")}constructor(e=1,t=1,i={}){super(),i=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:_i,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1},i),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=i.depth,this.scissor=new nt(0,0,e,t),this.scissorTest=!1,this.viewport=new nt(0,0,e,t);let r={width:e,height:t,depth:i.depth},a=new Lt(r);this.textures=[];let n=i.count;for(let s=0;s<n;s++)this.textures[s]=a.clone(),this.textures[s].isRenderTargetTexture=!0,this.textures[s].renderTarget=this;this._setTextureOptions(i),this.depthBuffer=i.depthBuffer,this.stencilBuffer=i.stencilBuffer,this.resolveDepthBuffer=i.resolveDepthBuffer,this.resolveStencilBuffer=i.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=i.depthTexture,this.samples=i.samples,this.multiview=i.multiview}_setTextureOptions(e={}){let t={minFilter:_i,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let i=0;i<this.textures.length;i++)this.textures[i].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,i=1){if(this.width!==e||this.height!==t||this.depth!==i){this.width=e,this.height=t,this.depth=i;for(let r=0,a=this.textures.length;r<a;r++)this.textures[r].image.width=e,this.textures[r].image.height=t,this.textures[r].image.depth=i,this.textures[r].isArrayTexture=this.textures[r].image.depth>1;this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,i=e.textures.length;t<i;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let r=Object.assign({},e.textures[t].image);this.textures[t].source=new sa(r)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}},vi=class extends xs{static{c(this,"Pa")}constructor(e=1,t=1,i={}){super(e,t,i),this.isWebGLRenderTarget=!0}},ts=class extends Lt{static{c(this,"Fa")}constructor(e=null,t=1,i=1,r=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:i,depth:r},this.magFilter=Kt,this.minFilter=Kt,this.wrapR=di,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}},Cl=class extends Lt{static{c(this,"La")}constructor(e=null,t=1,i=1,r=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:i,depth:r},this.magFilter=Kt,this.minFilter=Kt,this.wrapR=di,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},Xi=class{static{c(this,"za")}constructor(e=new O(1/0,1/0,1/0),t=new O(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t+=3)this.expandByPoint(wt.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,i=e.count;t<i;t++)this.expandByPoint(wt.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let i=wt.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(i),this.max.copy(e).add(i),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let i=e.geometry;if(i!==void 0){let a=i.getAttribute("position");if(t===!0&&a!==void 0&&e.isInstancedMesh!==!0)for(let n=0,s=a.count;n<s;n++)e.isMesh===!0?e.getVertexPosition(n,wt):wt.fromBufferAttribute(a,n),wt.applyMatrix4(e.matrixWorld),this.expandByPoint(wt);else e.boundingBox===void 0?(i.boundingBox===null&&i.computeBoundingBox(),_r.copy(i.boundingBox)):(e.boundingBox===null&&e.computeBoundingBox(),_r.copy(e.boundingBox)),_r.applyMatrix4(e.matrixWorld),this.union(_r)}let r=e.children;for(let a=0,n=r.length;a<n;a++)this.expandByObject(r[a],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,wt),wt.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,i;return e.normal.x>0?(t=e.normal.x*this.min.x,i=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,i=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,i+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,i+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,i+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,i+=e.normal.z*this.min.z),t<=-e.constant&&i>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(ji),vr.subVectors(this.max,ji),Si.subVectors(e.a,ji),Ei.subVectors(e.b,ji),Ti.subVectors(e.c,ji),$t.subVectors(Ei,Si),Qt.subVectors(Ti,Ei),oi.subVectors(Si,Ti);let t=[0,-$t.z,$t.y,0,-Qt.z,Qt.y,0,-oi.z,oi.y,$t.z,0,-$t.x,Qt.z,0,-Qt.x,oi.z,0,-oi.x,-$t.y,$t.x,0,-Qt.y,Qt.x,0,-oi.y,oi.x,0];return!Ja(t,Si,Ei,Ti,vr)||(t=[1,0,0,0,1,0,0,0,1],!Ja(t,Si,Ei,Ti,vr))?!1:(xr.crossVectors($t,Qt),t=[xr.x,xr.y,xr.z],Ja(t,Si,Ei,Ti,vr))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,wt).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(wt).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(kt[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),kt[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),kt[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),kt[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),kt[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),kt[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),kt[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),kt[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(kt),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}},kt=[new O,new O,new O,new O,new O,new O,new O,new O],wt=new O,_r=new Xi,Si=new O,Ei=new O,Ti=new O,$t=new O,Qt=new O,oi=new O,ji=new O,vr=new O,xr=new O,pi=new O,Ms=new Xi,qi=new O,la=new O,Mr=class{static{c(this,"no")}constructor(e=new O,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let i=this.center;t===void 0?Ms.setFromPoints(e).getCenter(i):i.copy(t);let r=0;for(let a=0,n=e.length;a<n;a++)r=Math.max(r,i.distanceToSquared(e[a]));return this.radius=Math.sqrt(r),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let i=this.center.distanceToSquared(e);return t.copy(e),i>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius*=e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;qi.subVectors(e,this.center);let t=qi.lengthSq();if(t>this.radius*this.radius){let i=Math.sqrt(t),r=(i-this.radius)*.5;this.center.addScaledVector(qi,r/i),this.radius+=r}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(la.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(qi.copy(e.center).add(la)),this.expandByPoint(qi.copy(e.center).sub(la))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}},Gt=new O,ha=new O,yr=new O,ei=new O,ca=new O,Sr=new O,ua=new O,da=class{static{c(this,"uo")}constructor(e=new O,t=new O(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Gt)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let i=t.dot(this.direction);return i<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,i)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=Gt.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Gt.copy(this.origin).addScaledVector(this.direction,t),Gt.distanceToSquared(e))}distanceSqToSegment(e,t,i,r){ha.copy(e).add(t).multiplyScalar(.5),yr.copy(t).sub(e).normalize(),ei.copy(this.origin).sub(ha);let a=e.distanceTo(t)*.5,n=-this.direction.dot(yr),s=ei.dot(this.direction),o=-ei.dot(yr),l=ei.lengthSq(),h=Math.abs(1-n*n),u,d,p,g;if(h>0)if(u=n*o-s,d=n*s-o,g=a*h,u>=0)if(d>=-g)if(d<=g){let y=1/h;u*=y,d*=y,p=u*(u+n*d+2*s)+d*(n*u+d+2*o)+l}else d=a,u=Math.max(0,-(n*d+s)),p=-u*u+d*(d+2*o)+l;else d=-a,u=Math.max(0,-(n*d+s)),p=-u*u+d*(d+2*o)+l;else d<=-g?(u=Math.max(0,-(-n*a+s)),d=u>0?-a:Math.min(Math.max(-a,-o),a),p=-u*u+d*(d+2*o)+l):d<=g?(u=0,d=Math.min(Math.max(-a,-o),a),p=d*(d+2*o)+l):(u=Math.max(0,-(n*a+s)),d=u>0?a:Math.min(Math.max(-a,-o),a),p=-u*u+d*(d+2*o)+l);else d=n>0?-a:a,u=Math.max(0,-(n*d+s)),p=-u*u+d*(d+2*o)+l;return i&&i.copy(this.origin).addScaledVector(this.direction,u),r&&r.copy(ha).addScaledVector(yr,d),p}intersectSphere(e,t){Gt.subVectors(e.center,this.origin);let i=Gt.dot(this.direction),r=Gt.dot(Gt)-i*i,a=e.radius*e.radius;if(r>a)return null;let n=Math.sqrt(a-r),s=i-n,o=i+n;return o<0?null:s<0?this.at(o,t):this.at(s,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let i=-(this.origin.dot(e.normal)+e.constant)/t;return i>=0?i:null}intersectPlane(e,t){let i=this.distanceToPlane(e);return i===null?null:this.at(i,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let i,r,a,n,s,o,l=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,d=this.origin;return l>=0?(i=(e.min.x-d.x)*l,r=(e.max.x-d.x)*l):(i=(e.max.x-d.x)*l,r=(e.min.x-d.x)*l),h>=0?(a=(e.min.y-d.y)*h,n=(e.max.y-d.y)*h):(a=(e.max.y-d.y)*h,n=(e.min.y-d.y)*h),i>n||a>r||((a>i||isNaN(i))&&(i=a),(n<r||isNaN(r))&&(r=n),u>=0?(s=(e.min.z-d.z)*u,o=(e.max.z-d.z)*u):(s=(e.max.z-d.z)*u,o=(e.min.z-d.z)*u),i>o||s>r)||((s>i||i!==i)&&(i=s),(o<r||r!==r)&&(r=o),r<0)?null:this.at(i>=0?i:r,t)}intersectsBox(e){return this.intersectBox(e,Gt)!==null}intersectTriangle(e,t,i,r,a){ca.subVectors(t,e),Sr.subVectors(i,e),ua.crossVectors(ca,Sr);let n=this.direction.dot(ua),s;if(n>0){if(r)return null;s=1}else if(n<0)s=-1,n=-n;else return null;ei.subVectors(this.origin,e);let o=s*this.direction.dot(Sr.crossVectors(ei,Sr));if(o<0)return null;let l=s*this.direction.dot(ca.cross(ei));if(l<0||o+l>n)return null;let h=-s*ei.dot(ua);return h<0?null:this.at(h/n,a)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},at=class Gn{static{c(this,"e")}constructor(t,i,r,a,n,s,o,l,h,u,d,p,g,y,v,m){Gn.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,i,r,a,n,s,o,l,h,u,d,p,g,y,v,m)}set(t,i,r,a,n,s,o,l,h,u,d,p,g,y,v,m){let f=this.elements;return f[0]=t,f[4]=i,f[8]=r,f[12]=a,f[1]=n,f[5]=s,f[9]=o,f[13]=l,f[2]=h,f[6]=u,f[10]=d,f[14]=p,f[3]=g,f[7]=y,f[11]=v,f[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Gn().fromArray(this.elements)}copy(t){let i=this.elements,r=t.elements;return i[0]=r[0],i[1]=r[1],i[2]=r[2],i[3]=r[3],i[4]=r[4],i[5]=r[5],i[6]=r[6],i[7]=r[7],i[8]=r[8],i[9]=r[9],i[10]=r[10],i[11]=r[11],i[12]=r[12],i[13]=r[13],i[14]=r[14],i[15]=r[15],this}copyPosition(t){let i=this.elements,r=t.elements;return i[12]=r[12],i[13]=r[13],i[14]=r[14],this}setFromMatrix3(t){let i=t.elements;return this.set(i[0],i[3],i[6],0,i[1],i[4],i[7],0,i[2],i[5],i[8],0,0,0,0,1),this}extractBasis(t,i,r){return t.setFromMatrixColumn(this,0),i.setFromMatrixColumn(this,1),r.setFromMatrixColumn(this,2),this}makeBasis(t,i,r){return this.set(t.x,i.x,r.x,0,t.y,i.y,r.y,0,t.z,i.z,r.z,0,0,0,0,1),this}extractRotation(t){let i=this.elements,r=t.elements,a=1/bi.setFromMatrixColumn(t,0).length(),n=1/bi.setFromMatrixColumn(t,1).length(),s=1/bi.setFromMatrixColumn(t,2).length();return i[0]=r[0]*a,i[1]=r[1]*a,i[2]=r[2]*a,i[3]=0,i[4]=r[4]*n,i[5]=r[5]*n,i[6]=r[6]*n,i[7]=0,i[8]=r[8]*s,i[9]=r[9]*s,i[10]=r[10]*s,i[11]=0,i[12]=0,i[13]=0,i[14]=0,i[15]=1,this}makeRotationFromEuler(t){let i=this.elements,r=t.x,a=t.y,n=t.z,s=Math.cos(r),o=Math.sin(r),l=Math.cos(a),h=Math.sin(a),u=Math.cos(n),d=Math.sin(n);if(t.order==="XYZ"){let p=s*u,g=s*d,y=o*u,v=o*d;i[0]=l*u,i[4]=-l*d,i[8]=h,i[1]=g+y*h,i[5]=p-v*h,i[9]=-o*l,i[2]=v-p*h,i[6]=y+g*h,i[10]=s*l}else if(t.order==="YXZ"){let p=l*u,g=l*d,y=h*u,v=h*d;i[0]=p+v*o,i[4]=y*o-g,i[8]=s*h,i[1]=s*d,i[5]=s*u,i[9]=-o,i[2]=g*o-y,i[6]=v+p*o,i[10]=s*l}else if(t.order==="ZXY"){let p=l*u,g=l*d,y=h*u,v=h*d;i[0]=p-v*o,i[4]=-s*d,i[8]=y+g*o,i[1]=g+y*o,i[5]=s*u,i[9]=v-p*o,i[2]=-s*h,i[6]=o,i[10]=s*l}else if(t.order==="ZYX"){let p=s*u,g=s*d,y=o*u,v=o*d;i[0]=l*u,i[4]=y*h-g,i[8]=p*h+v,i[1]=l*d,i[5]=v*h+p,i[9]=g*h-y,i[2]=-h,i[6]=o*l,i[10]=s*l}else if(t.order==="YZX"){let p=s*l,g=s*h,y=o*l,v=o*h;i[0]=l*u,i[4]=v-p*d,i[8]=y*d+g,i[1]=d,i[5]=s*u,i[9]=-o*u,i[2]=-h*u,i[6]=g*d+y,i[10]=p-v*d}else if(t.order==="XZY"){let p=s*l,g=s*h,y=o*l,v=o*h;i[0]=l*u,i[4]=-d,i[8]=h*u,i[1]=p*d+v,i[5]=s*u,i[9]=g*d-y,i[2]=y*d-g,i[6]=o*u,i[10]=v*d+p}return i[3]=0,i[7]=0,i[11]=0,i[12]=0,i[13]=0,i[14]=0,i[15]=1,this}makeRotationFromQuaternion(t){return this.compose(ys,t,Ss)}lookAt(t,i,r){let a=this.elements;return yt.subVectors(t,i),yt.lengthSq()===0&&(yt.z=1),yt.normalize(),ti.crossVectors(r,yt),ti.lengthSq()===0&&(Math.abs(r.z)===1?yt.x+=1e-4:yt.z+=1e-4,yt.normalize(),ti.crossVectors(r,yt)),ti.normalize(),Er.crossVectors(yt,ti),a[0]=ti.x,a[4]=Er.x,a[8]=yt.x,a[1]=ti.y,a[5]=Er.y,a[9]=yt.y,a[2]=ti.z,a[6]=Er.z,a[10]=yt.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,i){let r=t.elements,a=i.elements,n=this.elements,s=r[0],o=r[4],l=r[8],h=r[12],u=r[1],d=r[5],p=r[9],g=r[13],y=r[2],v=r[6],m=r[10],f=r[14],w=r[3],S=r[7],b=r[11],I=r[15],L=a[0],P=a[4],B=a[8],E=a[12],M=a[1],C=a[5],V=a[9],H=a[13],k=a[2],Z=a[6],G=a[10],$=a[14],j=a[3],te=a[7],fe=a[11],Ue=a[15];return n[0]=s*L+o*M+l*k+h*j,n[4]=s*P+o*C+l*Z+h*te,n[8]=s*B+o*V+l*G+h*fe,n[12]=s*E+o*H+l*$+h*Ue,n[1]=u*L+d*M+p*k+g*j,n[5]=u*P+d*C+p*Z+g*te,n[9]=u*B+d*V+p*G+g*fe,n[13]=u*E+d*H+p*$+g*Ue,n[2]=y*L+v*M+m*k+f*j,n[6]=y*P+v*C+m*Z+f*te,n[10]=y*B+v*V+m*G+f*fe,n[14]=y*E+v*H+m*$+f*Ue,n[3]=w*L+S*M+b*k+I*j,n[7]=w*P+S*C+b*Z+I*te,n[11]=w*B+S*V+b*G+I*fe,n[15]=w*E+S*H+b*$+I*Ue,this}multiplyScalar(t){let i=this.elements;return i[0]*=t,i[4]*=t,i[8]*=t,i[12]*=t,i[1]*=t,i[5]*=t,i[9]*=t,i[13]*=t,i[2]*=t,i[6]*=t,i[10]*=t,i[14]*=t,i[3]*=t,i[7]*=t,i[11]*=t,i[15]*=t,this}determinant(){let t=this.elements,i=t[0],r=t[4],a=t[8],n=t[12],s=t[1],o=t[5],l=t[9],h=t[13],u=t[2],d=t[6],p=t[10],g=t[14],y=t[3],v=t[7],m=t[11],f=t[15];return y*(+n*l*d-a*h*d-n*o*p+r*h*p+a*o*g-r*l*g)+v*(+i*l*g-i*h*p+n*s*p-a*s*g+a*h*u-n*l*u)+m*(+i*h*d-i*o*g-n*s*d+r*s*g+n*o*u-r*h*u)+f*(-a*o*u-i*l*d+i*o*p+a*s*d-r*s*p+r*l*u)}transpose(){let t=this.elements,i;return i=t[1],t[1]=t[4],t[4]=i,i=t[2],t[2]=t[8],t[8]=i,i=t[6],t[6]=t[9],t[9]=i,i=t[3],t[3]=t[12],t[12]=i,i=t[7],t[7]=t[13],t[13]=i,i=t[11],t[11]=t[14],t[14]=i,this}setPosition(t,i,r){let a=this.elements;return t.isVector3?(a[12]=t.x,a[13]=t.y,a[14]=t.z):(a[12]=t,a[13]=i,a[14]=r),this}invert(){let t=this.elements,i=t[0],r=t[1],a=t[2],n=t[3],s=t[4],o=t[5],l=t[6],h=t[7],u=t[8],d=t[9],p=t[10],g=t[11],y=t[12],v=t[13],m=t[14],f=t[15],w=d*m*h-v*p*h+v*l*g-o*m*g-d*l*f+o*p*f,S=y*p*h-u*m*h-y*l*g+s*m*g+u*l*f-s*p*f,b=u*v*h-y*d*h+y*o*g-s*v*g-u*o*f+s*d*f,I=y*d*l-u*v*l-y*o*p+s*v*p+u*o*m-s*d*m,L=i*w+r*S+a*b+n*I;if(L===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let P=1/L;return t[0]=w*P,t[1]=(v*p*n-d*m*n-v*a*g+r*m*g+d*a*f-r*p*f)*P,t[2]=(o*m*n-v*l*n+v*a*h-r*m*h-o*a*f+r*l*f)*P,t[3]=(d*l*n-o*p*n-d*a*h+r*p*h+o*a*g-r*l*g)*P,t[4]=S*P,t[5]=(u*m*n-y*p*n+y*a*g-i*m*g-u*a*f+i*p*f)*P,t[6]=(y*l*n-s*m*n-y*a*h+i*m*h+s*a*f-i*l*f)*P,t[7]=(s*p*n-u*l*n+u*a*h-i*p*h-s*a*g+i*l*g)*P,t[8]=b*P,t[9]=(y*d*n-u*v*n-y*r*g+i*v*g+u*r*f-i*d*f)*P,t[10]=(s*v*n-y*o*n+y*r*h-i*v*h-s*r*f+i*o*f)*P,t[11]=(u*o*n-s*d*n-u*r*h+i*d*h+s*r*g-i*o*g)*P,t[12]=I*P,t[13]=(u*v*a-y*d*a+y*r*p-i*v*p-u*r*m+i*d*m)*P,t[14]=(y*o*a-s*v*a-y*r*l+i*v*l+s*r*m-i*o*m)*P,t[15]=(s*d*a-u*o*a+u*r*l-i*d*l-s*r*p+i*o*p)*P,this}scale(t){let i=this.elements,r=t.x,a=t.y,n=t.z;return i[0]*=r,i[4]*=a,i[8]*=n,i[1]*=r,i[5]*=a,i[9]*=n,i[2]*=r,i[6]*=a,i[10]*=n,i[3]*=r,i[7]*=a,i[11]*=n,this}getMaxScaleOnAxis(){let t=this.elements,i=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],r=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],a=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(i,r,a))}makeTranslation(t,i,r){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,i,0,0,1,r,0,0,0,1),this}makeRotationX(t){let i=Math.cos(t),r=Math.sin(t);return this.set(1,0,0,0,0,i,-r,0,0,r,i,0,0,0,0,1),this}makeRotationY(t){let i=Math.cos(t),r=Math.sin(t);return this.set(i,0,r,0,0,1,0,0,-r,0,i,0,0,0,0,1),this}makeRotationZ(t){let i=Math.cos(t),r=Math.sin(t);return this.set(i,-r,0,0,r,i,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,i){let r=Math.cos(i),a=Math.sin(i),n=1-r,s=t.x,o=t.y,l=t.z,h=n*s,u=n*o;return this.set(h*s+r,h*o-a*l,h*l+a*o,0,h*o+a*l,u*o+r,u*l-a*s,0,h*l-a*o,u*l+a*s,n*l*l+r,0,0,0,0,1),this}makeScale(t,i,r){return this.set(t,0,0,0,0,i,0,0,0,0,r,0,0,0,0,1),this}makeShear(t,i,r,a,n,s){return this.set(1,r,n,0,t,1,s,0,i,a,1,0,0,0,0,1),this}compose(t,i,r){let a=this.elements,n=i._x,s=i._y,o=i._z,l=i._w,h=n+n,u=s+s,d=o+o,p=n*h,g=n*u,y=n*d,v=s*u,m=s*d,f=o*d,w=l*h,S=l*u,b=l*d,I=r.x,L=r.y,P=r.z;return a[0]=(1-(v+f))*I,a[1]=(g+b)*I,a[2]=(y-S)*I,a[3]=0,a[4]=(g-b)*L,a[5]=(1-(p+f))*L,a[6]=(m+w)*L,a[7]=0,a[8]=(y+S)*P,a[9]=(m-w)*P,a[10]=(1-(p+v))*P,a[11]=0,a[12]=t.x,a[13]=t.y,a[14]=t.z,a[15]=1,this}decompose(t,i,r){let a=this.elements,n=bi.set(a[0],a[1],a[2]).length(),s=bi.set(a[4],a[5],a[6]).length(),o=bi.set(a[8],a[9],a[10]).length();this.determinant()<0&&(n=-n),t.x=a[12],t.y=a[13],t.z=a[14],Rt.copy(this);let l=1/n,h=1/s,u=1/o;return Rt.elements[0]*=l,Rt.elements[1]*=l,Rt.elements[2]*=l,Rt.elements[4]*=h,Rt.elements[5]*=h,Rt.elements[6]*=h,Rt.elements[8]*=u,Rt.elements[9]*=u,Rt.elements[10]*=u,i.setFromRotationMatrix(Rt),r.x=n,r.y=s,r.z=o,this}makePerspective(t,i,r,a,n,s,o=zi,l=!1){let h=this.elements,u=2*n/(i-t),d=2*n/(r-a),p=(i+t)/(i-t),g=(r+a)/(r-a),y,v;if(l)y=n/(s-n),v=s*n/(s-n);else if(o===2e3)y=-(s+n)/(s-n),v=-2*s*n/(s-n);else if(o===2001)y=-s/(s-n),v=-s*n/(s-n);else throw Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return h[0]=u,h[4]=0,h[8]=p,h[12]=0,h[1]=0,h[5]=d,h[9]=g,h[13]=0,h[2]=0,h[6]=0,h[10]=y,h[14]=v,h[3]=0,h[7]=0,h[11]=-1,h[15]=0,this}makeOrthographic(t,i,r,a,n,s,o=zi,l=!1){let h=this.elements,u=2/(i-t),d=2/(r-a),p=-(i+t)/(i-t),g=-(r+a)/(r-a),y,v;if(l)y=1/(s-n),v=s/(s-n);else if(o===2e3)y=-2/(s-n),v=-(s+n)/(s-n);else if(o===2001)y=-1/(s-n),v=-n/(s-n);else throw Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return h[0]=u,h[4]=0,h[8]=0,h[12]=p,h[1]=0,h[5]=d,h[9]=0,h[13]=g,h[2]=0,h[6]=0,h[10]=y,h[14]=v,h[3]=0,h[7]=0,h[11]=0,h[15]=1,this}equals(t){let i=this.elements,r=t.elements;for(let a=0;a<16;a++)if(i[a]!==r[a])return!1;return!0}fromArray(t,i=0){for(let r=0;r<16;r++)this.elements[r]=t[r+i];return this}toArray(t=[],i=0){let r=this.elements;return t[i]=r[0],t[i+1]=r[1],t[i+2]=r[2],t[i+3]=r[3],t[i+4]=r[4],t[i+5]=r[5],t[i+6]=r[6],t[i+7]=r[7],t[i+8]=r[8],t[i+9]=r[9],t[i+10]=r[10],t[i+11]=r[11],t[i+12]=r[12],t[i+13]=r[13],t[i+14]=r[14],t[i+15]=r[15],t}},bi=new O,Rt=new at,ys=new O(0,0,0),Ss=new O(1,1,1),ti=new O,Er=new O,yt=new O,nn=new at,sn=new yi,ai=class Hl{static{c(this,"e")}constructor(t=0,i=0,r=0,a=Hl.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=i,this._z=r,this._order=a}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,i,r,a=this._order){return this._x=t,this._y=i,this._z=r,this._order=a,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,i=this._order,r=!0){let a=t.elements,n=a[0],s=a[4],o=a[8],l=a[1],h=a[5],u=a[9],d=a[2],p=a[6],g=a[10];switch(i){case"XYZ":this._y=Math.asin(Fe(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-u,g),this._z=Math.atan2(-s,n)):(this._x=Math.atan2(p,h),this._z=0);break;case"YXZ":this._x=Math.asin(-Fe(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(o,g),this._z=Math.atan2(l,h)):(this._y=Math.atan2(-d,n),this._z=0);break;case"ZXY":this._x=Math.asin(Fe(p,-1,1)),Math.abs(p)<.9999999?(this._y=Math.atan2(-d,g),this._z=Math.atan2(-s,h)):(this._y=0,this._z=Math.atan2(l,n));break;case"ZYX":this._y=Math.asin(-Fe(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(p,g),this._z=Math.atan2(l,n)):(this._x=0,this._z=Math.atan2(-s,h));break;case"YZX":this._z=Math.asin(Fe(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-u,h),this._y=Math.atan2(-d,n)):(this._x=0,this._y=Math.atan2(o,g));break;case"XZY":this._z=Math.asin(-Fe(s,-1,1)),Math.abs(s)<.9999999?(this._x=Math.atan2(p,h),this._y=Math.atan2(o,n)):(this._x=Math.atan2(-u,g),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+i)}return this._order=i,r===!0&&this._onChangeCallback(),this}setFromQuaternion(t,i,r){return nn.makeRotationFromQuaternion(t),this.setFromRotationMatrix(nn,i,r)}setFromVector3(t,i=this._order){return this.set(t.x,t.y,t.z,i)}reorder(t){return sn.setFromEuler(this),this.setFromQuaternion(sn,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],i=0){return t[i]=this._x,t[i+1]=this._y,t[i+2]=this._z,t[i+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}},ai.DEFAULT_ORDER="XYZ",Na=class{static{c(this,"So")}constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return!!(this.mask&(1<<e|0))}},Es=0,on=new O,Ai=new yi,Wt=new at,Tr=new O,Yi=new O,Ts=new O,bs=new yi,ln=new O(1,0,0),hn=new O(0,1,0),cn=new O(0,0,1),un={type:"added"},As={type:"removed"},wi={type:"childadded",child:null},pa={type:"childremoved",child:null},Ct=class za extends Fi{static{c(this,"e")}constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Es++}),this.uuid=Jt(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=za.DEFAULT_UP.clone();let t=new O,i=new ai,r=new yi,a=new O(1,1,1);function n(){r.setFromEuler(i,!1)}c(n,"o");function s(){i.setFromQuaternion(r,void 0,!1)}c(s,"s"),i._onChange(n),r._onChange(s),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:i},quaternion:{configurable:!0,enumerable:!0,value:r},scale:{configurable:!0,enumerable:!0,value:a},modelViewMatrix:{value:new at},normalMatrix:{value:new Ne}}),this.matrix=new at,this.matrixWorld=new at,this.matrixAutoUpdate=za.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=za.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Na,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,i){this.quaternion.setFromAxisAngle(t,i)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,i){return Ai.setFromAxisAngle(t,i),this.quaternion.multiply(Ai),this}rotateOnWorldAxis(t,i){return Ai.setFromAxisAngle(t,i),this.quaternion.premultiply(Ai),this}rotateX(t){return this.rotateOnAxis(ln,t)}rotateY(t){return this.rotateOnAxis(hn,t)}rotateZ(t){return this.rotateOnAxis(cn,t)}translateOnAxis(t,i){return on.copy(t).applyQuaternion(this.quaternion),this.position.add(on.multiplyScalar(i)),this}translateX(t){return this.translateOnAxis(ln,t)}translateY(t){return this.translateOnAxis(hn,t)}translateZ(t){return this.translateOnAxis(cn,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(Wt.copy(this.matrixWorld).invert())}lookAt(t,i,r){t.isVector3?Tr.copy(t):Tr.set(t,i,r);let a=this.parent;this.updateWorldMatrix(!0,!1),Yi.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Wt.lookAt(Yi,Tr,this.up):Wt.lookAt(Tr,Yi,this.up),this.quaternion.setFromRotationMatrix(Wt),a&&(Wt.extractRotation(a.matrixWorld),Ai.setFromRotationMatrix(Wt),this.quaternion.premultiply(Ai.invert()))}add(t){if(arguments.length>1){for(let i=0;i<arguments.length;i++)this.add(arguments[i]);return this}return t===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(un),wi.child=t,this.dispatchEvent(wi),wi.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let r=0;r<arguments.length;r++)this.remove(arguments[r]);return this}let i=this.children.indexOf(t);return i!==-1&&(t.parent=null,this.children.splice(i,1),t.dispatchEvent(As),pa.child=t,this.dispatchEvent(pa),pa.child=null),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),Wt.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),Wt.multiply(t.parent.matrixWorld)),t.applyMatrix4(Wt),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(un),wi.child=t,this.dispatchEvent(wi),wi.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,i){if(this[t]===i)return this;for(let r=0,a=this.children.length;r<a;r++){let n=this.children[r].getObjectByProperty(t,i);if(n!==void 0)return n}}getObjectsByProperty(t,i,r=[]){this[t]===i&&r.push(this);let a=this.children;for(let n=0,s=a.length;n<s;n++)a[n].getObjectsByProperty(t,i,r);return r}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Yi,t,Ts),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Yi,bs,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let i=this.matrixWorld.elements;return t.set(i[8],i[9],i[10]).normalize()}raycast(){}traverse(t){t(this);let i=this.children;for(let r=0,a=i.length;r<a;r++)i[r].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let i=this.children;for(let r=0,a=i.length;r<a;r++)i[r].traverseVisible(t)}traverseAncestors(t){let i=this.parent;i!==null&&(t(i),i.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);let i=this.children;for(let r=0,a=i.length;r<a;r++)i[r].updateMatrixWorld(t)}updateWorldMatrix(t,i){let r=this.parent;if(t===!0&&r!==null&&r.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),i===!0){let a=this.children;for(let n=0,s=a.length;n<s;n++)a[n].updateWorldMatrix(!1,!0)}}toJSON(t){let i=t===void 0||typeof t=="string",r={};i&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},r.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let a={};a.uuid=this.uuid,a.type=this.type,this.name!==""&&(a.name=this.name),this.castShadow===!0&&(a.castShadow=!0),this.receiveShadow===!0&&(a.receiveShadow=!0),this.visible===!1&&(a.visible=!1),this.frustumCulled===!1&&(a.frustumCulled=!1),this.renderOrder!==0&&(a.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(a.userData=this.userData),a.layers=this.layers.mask,a.matrix=this.matrix.toArray(),a.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(a.matrixAutoUpdate=!1),this.isInstancedMesh&&(a.type="InstancedMesh",a.count=this.count,a.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(a.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(a.type="BatchedMesh",a.perObjectFrustumCulled=this.perObjectFrustumCulled,a.sortObjects=this.sortObjects,a.drawRanges=this._drawRanges,a.reservedRanges=this._reservedRanges,a.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),a.instanceInfo=this._instanceInfo.map(o=>({...o})),a.availableInstanceIds=this._availableInstanceIds.slice(),a.availableGeometryIds=this._availableGeometryIds.slice(),a.nextIndexStart=this._nextIndexStart,a.nextVertexStart=this._nextVertexStart,a.geometryCount=this._geometryCount,a.maxInstanceCount=this._maxInstanceCount,a.maxVertexCount=this._maxVertexCount,a.maxIndexCount=this._maxIndexCount,a.geometryInitialized=this._geometryInitialized,a.matricesTexture=this._matricesTexture.toJSON(t),a.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(a.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(a.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(a.boundingBox=this.boundingBox.toJSON()));function n(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(t)),l.uuid}if(c(n,"i"),this.isScene)this.background&&(this.background.isColor?a.background=this.background.toJSON():this.background.isTexture&&(a.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(a.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){a.geometry=n(t.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let l=o.shapes;if(Array.isArray(l))for(let h=0,u=l.length;h<u;h++){let d=l[h];n(t.shapes,d)}else n(t.shapes,l)}}if(this.isSkinnedMesh&&(a.bindMode=this.bindMode,a.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(n(t.skeletons,this.skeleton),a.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let l=0,h=this.material.length;l<h;l++)o.push(n(t.materials,this.material[l]));a.material=o}else a.material=n(t.materials,this.material);if(this.children.length>0){a.children=[];for(let o=0;o<this.children.length;o++)a.children.push(this.children[o].toJSON(t).object)}if(this.animations.length>0){a.animations=[];for(let o=0;o<this.animations.length;o++){let l=this.animations[o];a.animations.push(n(t.animations,l))}}if(i){let o=s(t.geometries),l=s(t.materials),h=s(t.textures),u=s(t.images),d=s(t.shapes),p=s(t.skeletons),g=s(t.animations),y=s(t.nodes);o.length>0&&(r.geometries=o),l.length>0&&(r.materials=l),h.length>0&&(r.textures=h),u.length>0&&(r.images=u),d.length>0&&(r.shapes=d),p.length>0&&(r.skeletons=p),g.length>0&&(r.animations=g),y.length>0&&(r.nodes=y)}return r.object=a,r;function s(o){let l=[];for(let h in o){let u=o[h];delete u.metadata,l.push(u)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,i=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),i===!0)for(let r=0;r<t.children.length;r++){let a=t.children[r];this.add(a.clone())}return this}},Ct.DEFAULT_UP=new O(0,1,0),Ct.DEFAULT_MATRIX_AUTO_UPDATE=!0,Ct.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0,Pt=new O,Xt=new O,fa=new O,jt=new O,Ri=new O,Ci=new O,dn=new O,ma=new O,ga=new O,_a=new O,va=new nt,xa=new nt,Ma=new nt,Hi=class nr{static{c(this,"e")}constructor(t=new O,i=new O,r=new O){this.a=t,this.b=i,this.c=r}static getNormal(t,i,r,a){a.subVectors(r,i),Pt.subVectors(t,i),a.cross(Pt);let n=a.lengthSq();return n>0?a.multiplyScalar(1/Math.sqrt(n)):a.set(0,0,0)}static getBarycoord(t,i,r,a,n){Pt.subVectors(a,i),Xt.subVectors(r,i),fa.subVectors(t,i);let s=Pt.dot(Pt),o=Pt.dot(Xt),l=Pt.dot(fa),h=Xt.dot(Xt),u=Xt.dot(fa),d=s*h-o*o;if(d===0)return n.set(0,0,0),null;let p=1/d,g=(h*l-o*u)*p,y=(s*u-o*l)*p;return n.set(1-g-y,y,g)}static containsPoint(t,i,r,a){return this.getBarycoord(t,i,r,a,jt)!==null&&jt.x>=0&&jt.y>=0&&jt.x+jt.y<=1}static getInterpolation(t,i,r,a,n,s,o,l){return this.getBarycoord(t,i,r,a,jt)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(n,jt.x),l.addScaledVector(s,jt.y),l.addScaledVector(o,jt.z),l)}static getInterpolatedAttribute(t,i,r,a,n,s){return va.setScalar(0),xa.setScalar(0),Ma.setScalar(0),va.fromBufferAttribute(t,i),xa.fromBufferAttribute(t,r),Ma.fromBufferAttribute(t,a),s.setScalar(0),s.addScaledVector(va,n.x),s.addScaledVector(xa,n.y),s.addScaledVector(Ma,n.z),s}static isFrontFacing(t,i,r,a){return Pt.subVectors(r,i),Xt.subVectors(t,i),Pt.cross(Xt).dot(a)<0}set(t,i,r){return this.a.copy(t),this.b.copy(i),this.c.copy(r),this}setFromPointsAndIndices(t,i,r,a){return this.a.copy(t[i]),this.b.copy(t[r]),this.c.copy(t[a]),this}setFromAttributeAndIndices(t,i,r,a){return this.a.fromBufferAttribute(t,i),this.b.fromBufferAttribute(t,r),this.c.fromBufferAttribute(t,a),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return Pt.subVectors(this.c,this.b),Xt.subVectors(this.a,this.b),Pt.cross(Xt).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return nr.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,i){return nr.getBarycoord(t,this.a,this.b,this.c,i)}getInterpolation(t,i,r,a,n){return nr.getInterpolation(t,this.a,this.b,this.c,i,r,a,n)}containsPoint(t){return nr.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return nr.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,i){let r=this.a,a=this.b,n=this.c,s,o;Ri.subVectors(a,r),Ci.subVectors(n,r),ma.subVectors(t,r);let l=Ri.dot(ma),h=Ci.dot(ma);if(l<=0&&h<=0)return i.copy(r);ga.subVectors(t,a);let u=Ri.dot(ga),d=Ci.dot(ga);if(u>=0&&d<=u)return i.copy(a);let p=l*d-u*h;if(p<=0&&l>=0&&u<=0)return s=l/(l-u),i.copy(r).addScaledVector(Ri,s);_a.subVectors(t,n);let g=Ri.dot(_a),y=Ci.dot(_a);if(y>=0&&g<=y)return i.copy(n);let v=g*h-l*y;if(v<=0&&h>=0&&y<=0)return o=h/(h-y),i.copy(r).addScaledVector(Ci,o);let m=u*y-g*d;if(m<=0&&d-u>=0&&g-y>=0)return dn.subVectors(n,a),o=(d-u)/(d-u+(g-y)),i.copy(a).addScaledVector(dn,o);let f=1/(m+v+p);return s=v*f,o=p*f,i.copy(r).addScaledVector(Ri,s).addScaledVector(Ci,o)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},pn={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},ii={h:0,s:0,l:0},br={h:0,s:0,l:0},ze=class{static{c(this,"q")}constructor(e,t,i){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,i)}set(e,t,i){if(t===void 0&&i===void 0){let r=e;r&&r.isColor?this.copy(r):typeof r=="number"?this.setHex(r):typeof r=="string"&&this.setStyle(r)}else this.setRGB(e,t,i);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=It){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,ke.colorSpaceToWorking(this,t),this}setRGB(e,t,i,r=ke.workingColorSpace){return this.r=e,this.g=t,this.b=i,ke.colorSpaceToWorking(this,r),this}setHSL(e,t,i,r=ke.workingColorSpace){if(e=Rn(e,1),t=Fe(t,0,1),i=Fe(i,0,1),t===0)this.r=this.g=this.b=i;else{let a=i<=.5?i*(1+t):i+t-i*t,n=2*i-a;this.r=$a(n,a,e+1/3),this.g=$a(n,a,e),this.b=$a(n,a,e-1/3)}return ke.colorSpaceToWorking(this,r),this}setStyle(e,t=It){function i(a){a!==void 0&&parseFloat(a)<1&&console.warn("THREE.Color: Alpha component of "+e+" will be ignored.")}c(i,"n");let r;if(r=/^(\w+)\(([^\)]*)\)/.exec(e)){let a,n=r[1],s=r[2];switch(n){case"rgb":case"rgba":if(a=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(s))return i(a[4]),this.setRGB(Math.min(255,parseInt(a[1],10))/255,Math.min(255,parseInt(a[2],10))/255,Math.min(255,parseInt(a[3],10))/255,t);if(a=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(s))return i(a[4]),this.setRGB(Math.min(100,parseInt(a[1],10))/100,Math.min(100,parseInt(a[2],10))/100,Math.min(100,parseInt(a[3],10))/100,t);break;case"hsl":case"hsla":if(a=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(s))return i(a[4]),this.setHSL(parseFloat(a[1])/360,parseFloat(a[2])/100,parseFloat(a[3])/100,t);break;default:console.warn("THREE.Color: Unknown color model "+e)}}else if(r=/^\#([A-Fa-f\d]+)$/.exec(e)){let a=r[1],n=a.length;if(n===3)return this.setRGB(parseInt(a.charAt(0),16)/15,parseInt(a.charAt(1),16)/15,parseInt(a.charAt(2),16)/15,t);if(n===6)return this.setHex(parseInt(a,16),t);console.warn("THREE.Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=It){let i=pn[e.toLowerCase()];return i===void 0?console.warn("THREE.Color: Unknown color "+e):this.setHex(i,t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=ni(e.r),this.g=ni(e.g),this.b=ni(e.b),this}copyLinearToSRGB(e){return this.r=hr(e.r),this.g=hr(e.g),this.b=hr(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=It){return ke.workingToColorSpace(mt.copy(this),e),Math.round(Fe(mt.r*255,0,255))*65536+Math.round(Fe(mt.g*255,0,255))*256+Math.round(Fe(mt.b*255,0,255))}getHexString(e=It){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=ke.workingColorSpace){ke.workingToColorSpace(mt.copy(this),t);let i=mt.r,r=mt.g,a=mt.b,n=Math.max(i,r,a),s=Math.min(i,r,a),o,l,h=(s+n)/2;if(s===n)o=0,l=0;else{let u=n-s;switch(l=h<=.5?u/(n+s):u/(2-n-s),n){case i:o=(r-a)/u+(r<a?6:0);break;case r:o=(a-i)/u+2;break;case a:o=(i-r)/u+4}o/=6}return e.h=o,e.s=l,e.l=h,e}getRGB(e,t=ke.workingColorSpace){return ke.workingToColorSpace(mt.copy(this),t),e.r=mt.r,e.g=mt.g,e.b=mt.b,e}getStyle(e=It){ke.workingToColorSpace(mt.copy(this),e);let t=mt.r,i=mt.g,r=mt.b;return e==="srgb"?`rgb(${Math.round(t*255)},${Math.round(i*255)},${Math.round(r*255)})`:`color(${e} ${t.toFixed(3)} ${i.toFixed(3)} ${r.toFixed(3)})`}offsetHSL(e,t,i){return this.getHSL(ii),this.setHSL(ii.h+e,ii.s+t,ii.l+i)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,i){return this.r=e.r+(t.r-e.r)*i,this.g=e.g+(t.g-e.g)*i,this.b=e.b+(t.b-e.b)*i,this}lerpHSL(e,t){this.getHSL(ii),e.getHSL(br);let i=Nr(ii.h,br.h,t),r=Nr(ii.s,br.s,t),a=Nr(ii.l,br.l,t);return this.setHSL(i,r,a),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,i=this.g,r=this.b,a=e.elements;return this.r=a[0]*t+a[3]*i+a[6]*r,this.g=a[1]*t+a[4]*i+a[7]*r,this.b=a[2]*t+a[5]*i+a[8]*r,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},mt=new ze,ze.NAMES=pn,ws=0,li=class extends Fi{static{c(this,"rs")}constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:ws++}),this.uuid=Jt(),this.name="",this.type="Material",this.blending=1,this.side=0,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=204,this.blendDst=205,this.blendEquation=100,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new ze(0,0,0),this.blendAlpha=0,this.depthFunc=3,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=519,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=ra,this.stencilZFail=ra,this.stencilZPass=ra,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let i=e[t];if(i===void 0){console.warn(`THREE.Material: parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){console.warn(`THREE.Material: '${t}' is not a property of THREE.${this.type}.`);continue}r&&r.isColor?r.set(i):r&&r.isVector3&&i&&i.isVector3?r.copy(i):this[t]=i}}toJSON(e){let t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});let i={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.color&&this.color.isColor&&(i.color=this.color.getHex()),this.roughness!==void 0&&(i.roughness=this.roughness),this.metalness!==void 0&&(i.metalness=this.metalness),this.sheen!==void 0&&(i.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(i.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(i.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(i.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(i.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(i.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(i.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(i.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(i.shininess=this.shininess),this.clearcoat!==void 0&&(i.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(i.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(i.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(i.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(i.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,i.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.dispersion!==void 0&&(i.dispersion=this.dispersion),this.iridescence!==void 0&&(i.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(i.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(i.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(i.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(i.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(i.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(i.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(i.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(i.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(i.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(i.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(i.lightMap=this.lightMap.toJSON(e).uuid,i.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(i.aoMap=this.aoMap.toJSON(e).uuid,i.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(i.bumpMap=this.bumpMap.toJSON(e).uuid,i.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(i.normalMap=this.normalMap.toJSON(e).uuid,i.normalMapType=this.normalMapType,i.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(i.displacementMap=this.displacementMap.toJSON(e).uuid,i.displacementScale=this.displacementScale,i.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(i.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(i.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(i.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(i.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(i.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(i.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(i.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(i.combine=this.combine)),this.envMapRotation!==void 0&&(i.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(i.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(i.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(i.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(i.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(i.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(i.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(i.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(i.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(i.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(i.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(i.size=this.size),this.shadowSide!==null&&(i.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(i.sizeAttenuation=this.sizeAttenuation),this.blending!==1&&(i.blending=this.blending),this.side!==0&&(i.side=this.side),this.vertexColors===!0&&(i.vertexColors=!0),this.opacity<1&&(i.opacity=this.opacity),this.transparent===!0&&(i.transparent=!0),this.blendSrc!==204&&(i.blendSrc=this.blendSrc),this.blendDst!==205&&(i.blendDst=this.blendDst),this.blendEquation!==100&&(i.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(i.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(i.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(i.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(i.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(i.blendAlpha=this.blendAlpha),this.depthFunc!==3&&(i.depthFunc=this.depthFunc),this.depthTest===!1&&(i.depthTest=this.depthTest),this.depthWrite===!1&&(i.depthWrite=this.depthWrite),this.colorWrite===!1&&(i.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(i.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==519&&(i.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(i.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(i.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==7680&&(i.stencilFail=this.stencilFail),this.stencilZFail!==7680&&(i.stencilZFail=this.stencilZFail),this.stencilZPass!==7680&&(i.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(i.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(i.rotation=this.rotation),this.polygonOffset===!0&&(i.polygonOffset=!0),this.polygonOffsetFactor!==0&&(i.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(i.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(i.linewidth=this.linewidth),this.dashSize!==void 0&&(i.dashSize=this.dashSize),this.gapSize!==void 0&&(i.gapSize=this.gapSize),this.scale!==void 0&&(i.scale=this.scale),this.dithering===!0&&(i.dithering=!0),this.alphaTest>0&&(i.alphaTest=this.alphaTest),this.alphaHash===!0&&(i.alphaHash=!0),this.alphaToCoverage===!0&&(i.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(i.premultipliedAlpha=!0),this.forceSinglePass===!0&&(i.forceSinglePass=!0),this.wireframe===!0&&(i.wireframe=!0),this.wireframeLinewidth>1&&(i.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(i.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(i.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(i.flatShading=!0),this.visible===!1&&(i.visible=!1),this.toneMapped===!1&&(i.toneMapped=!1),this.fog===!1&&(i.fog=!1),Object.keys(this.userData).length>0&&(i.userData=this.userData);function r(a){let n=[];for(let s in a){let o=a[s];delete o.metadata,n.push(o)}return n}if(c(r,"r"),t){let a=r(e.textures),n=r(e.images);a.length>0&&(i.textures=a),n.length>0&&(i.images=n)}return i}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,i=null;if(t!==null){let r=t.length;i=Array(r);for(let a=0;a!==r;++a)i[a]=t[a].clone()}return this.clippingPlanes=i,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}},Nn=class extends li{static{c(this,"is")}constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new ze(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new ai,this.combine=0,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}},it=new O,Ar=new Be,Rs=0,Ut=class{static{c(this,"J")}constructor(e,t,i=!1){if(Array.isArray(e))throw TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Rs++}),this.name="",this.array=e,this.itemSize=t,this.count=e===void 0?0:e.length/t,this.normalized=i,this.usage=rn,this.updateRanges=[],this.gpuType=Ga,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,i){e*=this.itemSize,i*=t.itemSize;for(let r=0,a=this.itemSize;r<a;r++)this.array[e+r]=t.array[i+r];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,i=this.count;t<i;t++)Ar.fromBufferAttribute(this,t),Ar.applyMatrix3(e),this.setXY(t,Ar.x,Ar.y);else if(this.itemSize===3)for(let t=0,i=this.count;t<i;t++)it.fromBufferAttribute(this,t),it.applyMatrix3(e),this.setXYZ(t,it.x,it.y,it.z);return this}applyMatrix4(e){for(let t=0,i=this.count;t<i;t++)it.fromBufferAttribute(this,t),it.applyMatrix4(e),this.setXYZ(t,it.x,it.y,it.z);return this}applyNormalMatrix(e){for(let t=0,i=this.count;t<i;t++)it.fromBufferAttribute(this,t),it.applyNormalMatrix(e),this.setXYZ(t,it.x,it.y,it.z);return this}transformDirection(e){for(let t=0,i=this.count;t<i;t++)it.fromBufferAttribute(this,t),it.transformDirection(e),this.setXYZ(t,it.x,it.y,it.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let i=this.array[e*this.itemSize+t];return this.normalized&&(i=Ft(i,this.array)),i}setComponent(e,t,i){return this.normalized&&(i=Xe(i,this.array)),this.array[e*this.itemSize+t]=i,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Ft(t,this.array)),t}setX(e,t){return this.normalized&&(t=Xe(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Ft(t,this.array)),t}setY(e,t){return this.normalized&&(t=Xe(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Ft(t,this.array)),t}setZ(e,t){return this.normalized&&(t=Xe(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Ft(t,this.array)),t}setW(e,t){return this.normalized&&(t=Xe(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,i){return e*=this.itemSize,this.normalized&&(t=Xe(t,this.array),i=Xe(i,this.array)),this.array[e+0]=t,this.array[e+1]=i,this}setXYZ(e,t,i,r){return e*=this.itemSize,this.normalized&&(t=Xe(t,this.array),i=Xe(i,this.array),r=Xe(r,this.array)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=r,this}setXYZW(e,t,i,r,a){return e*=this.itemSize,this.normalized&&(t=Xe(t,this.array),i=Xe(i,this.array),r=Xe(r,this.array),a=Xe(a,this.array)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=r,this.array[e+3]=a,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==35044&&(e.usage=this.usage),e}},On=class extends Ut{static{c(this,"ms")}constructor(e,t,i){super(new Uint16Array(e),t,i)}},Fn=class extends Ut{static{c(this,"gs")}constructor(e,t,i){super(new Uint32Array(e),t,i)}},xt=class extends Ut{static{c(this,"Y")}constructor(e,t,i){super(new Float32Array(e),t,i)}},Cs=0,Tt=new at,ya=new Ct,Pi=new O,St=new Xi,Ki=new Xi,ot=new O,Yt=class Vl extends Fi{static{c(this,"e")}constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Cs++}),this.uuid=Jt(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(t){return this.index=Array.isArray(t)?new(Co(t)?Fn:On)(t,1):t,this}setIndirect(t){return this.indirect=t,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,i){return this.attributes[t]=i,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,i,r=0){this.groups.push({start:t,count:i,materialIndex:r})}clearGroups(){this.groups=[]}setDrawRange(t,i){this.drawRange.start=t,this.drawRange.count=i}applyMatrix4(t){let i=this.attributes.position;i!==void 0&&(i.applyMatrix4(t),i.needsUpdate=!0);let r=this.attributes.normal;if(r!==void 0){let n=new Ne().getNormalMatrix(t);r.applyNormalMatrix(n),r.needsUpdate=!0}let a=this.attributes.tangent;return a!==void 0&&(a.transformDirection(t),a.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(t){return Tt.makeRotationFromQuaternion(t),this.applyMatrix4(Tt),this}rotateX(t){return Tt.makeRotationX(t),this.applyMatrix4(Tt),this}rotateY(t){return Tt.makeRotationY(t),this.applyMatrix4(Tt),this}rotateZ(t){return Tt.makeRotationZ(t),this.applyMatrix4(Tt),this}translate(t,i,r){return Tt.makeTranslation(t,i,r),this.applyMatrix4(Tt),this}scale(t,i,r){return Tt.makeScale(t,i,r),this.applyMatrix4(Tt),this}lookAt(t){return ya.lookAt(t),ya.updateMatrix(),this.applyMatrix4(ya.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Pi).negate(),this.translate(Pi.x,Pi.y,Pi.z),this}setFromPoints(t){let i=this.getAttribute("position");if(i===void 0){let r=[];for(let a=0,n=t.length;a<n;a++){let s=t[a];r.push(s.x,s.y,s.z||0)}this.setAttribute("position",new xt(r,3))}else{let r=Math.min(t.length,i.count);for(let a=0;a<r;a++){let n=t[a];i.setXYZ(a,n.x,n.y,n.z||0)}t.length>i.count&&console.warn("THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),i.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Xi);let t=this.attributes.position,i=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new O(-1/0,-1/0,-1/0),new O(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),i)for(let r=0,a=i.length;r<a;r++){let n=i[r];St.setFromBufferAttribute(n),this.morphTargetsRelative?(ot.addVectors(this.boundingBox.min,St.min),this.boundingBox.expandByPoint(ot),ot.addVectors(this.boundingBox.max,St.max),this.boundingBox.expandByPoint(ot)):(this.boundingBox.expandByPoint(St.min),this.boundingBox.expandByPoint(St.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Mr);let t=this.attributes.position,i=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new O,1/0);return}if(t){let r=this.boundingSphere.center;if(St.setFromBufferAttribute(t),i)for(let n=0,s=i.length;n<s;n++){let o=i[n];Ki.setFromBufferAttribute(o),this.morphTargetsRelative?(ot.addVectors(St.min,Ki.min),St.expandByPoint(ot),ot.addVectors(St.max,Ki.max),St.expandByPoint(ot)):(St.expandByPoint(Ki.min),St.expandByPoint(Ki.max))}St.getCenter(r);let a=0;for(let n=0,s=t.count;n<s;n++)ot.fromBufferAttribute(t,n),a=Math.max(a,r.distanceToSquared(ot));if(i)for(let n=0,s=i.length;n<s;n++){let o=i[n],l=this.morphTargetsRelative;for(let h=0,u=o.count;h<u;h++)ot.fromBufferAttribute(o,h),l&&(Pi.fromBufferAttribute(t,h),ot.add(Pi)),a=Math.max(a,r.distanceToSquared(ot))}this.boundingSphere.radius=Math.sqrt(a),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,i=this.attributes;if(t===null||i.position===void 0||i.normal===void 0||i.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let r=i.position,a=i.normal,n=i.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Ut(new Float32Array(4*r.count),4));let s=this.getAttribute("tangent"),o=[],l=[];for(let B=0;B<r.count;B++)o[B]=new O,l[B]=new O;let h=new O,u=new O,d=new O,p=new Be,g=new Be,y=new Be,v=new O,m=new O;function f(B,E,M){h.fromBufferAttribute(r,B),u.fromBufferAttribute(r,E),d.fromBufferAttribute(r,M),p.fromBufferAttribute(n,B),g.fromBufferAttribute(n,E),y.fromBufferAttribute(n,M),u.sub(h),d.sub(h),g.sub(p),y.sub(p);let C=1/(g.x*y.y-y.x*g.y);isFinite(C)&&(v.copy(u).multiplyScalar(y.y).addScaledVector(d,-g.y).multiplyScalar(C),m.copy(d).multiplyScalar(g.x).addScaledVector(u,-y.x).multiplyScalar(C),o[B].add(v),o[E].add(v),o[M].add(v),l[B].add(m),l[E].add(m),l[M].add(m))}c(f,"g");let w=this.groups;w.length===0&&(w=[{start:0,count:t.count}]);for(let B=0,E=w.length;B<E;++B){let M=w[B],C=M.start,V=M.count;for(let H=C,k=C+V;H<k;H+=3)f(t.getX(H+0),t.getX(H+1),t.getX(H+2))}let S=new O,b=new O,I=new O,L=new O;function P(B){I.fromBufferAttribute(a,B),L.copy(I);let E=o[B];S.copy(E),S.sub(I.multiplyScalar(I.dot(E))).normalize(),b.crossVectors(L,E);let M=b.dot(l[B])<0?-1:1;s.setXYZW(B,S.x,S.y,S.z,M)}c(P,"S");for(let B=0,E=w.length;B<E;++B){let M=w[B],C=M.start,V=M.count;for(let H=C,k=C+V;H<k;H+=3)P(t.getX(H+0)),P(t.getX(H+1)),P(t.getX(H+2))}}computeVertexNormals(){let t=this.index,i=this.getAttribute("position");if(i!==void 0){let r=this.getAttribute("normal");if(r===void 0)r=new Ut(new Float32Array(i.count*3),3),this.setAttribute("normal",r);else for(let p=0,g=r.count;p<g;p++)r.setXYZ(p,0,0,0);let a=new O,n=new O,s=new O,o=new O,l=new O,h=new O,u=new O,d=new O;if(t)for(let p=0,g=t.count;p<g;p+=3){let y=t.getX(p+0),v=t.getX(p+1),m=t.getX(p+2);a.fromBufferAttribute(i,y),n.fromBufferAttribute(i,v),s.fromBufferAttribute(i,m),u.subVectors(s,n),d.subVectors(a,n),u.cross(d),o.fromBufferAttribute(r,y),l.fromBufferAttribute(r,v),h.fromBufferAttribute(r,m),o.add(u),l.add(u),h.add(u),r.setXYZ(y,o.x,o.y,o.z),r.setXYZ(v,l.x,l.y,l.z),r.setXYZ(m,h.x,h.y,h.z)}else for(let p=0,g=i.count;p<g;p+=3)a.fromBufferAttribute(i,p+0),n.fromBufferAttribute(i,p+1),s.fromBufferAttribute(i,p+2),u.subVectors(s,n),d.subVectors(a,n),u.cross(d),r.setXYZ(p+0,u.x,u.y,u.z),r.setXYZ(p+1,u.x,u.y,u.z),r.setXYZ(p+2,u.x,u.y,u.z);this.normalizeNormals(),r.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let i=0,r=t.count;i<r;i++)ot.fromBufferAttribute(t,i),ot.normalize(),t.setXYZ(i,ot.x,ot.y,ot.z)}toNonIndexed(){function t(o,l){let h=o.array,u=o.itemSize,d=o.normalized,p=new h.constructor(l.length*u),g=0,y=0;for(let v=0,m=l.length;v<m;v++){g=o.isInterleavedBufferAttribute?l[v]*o.data.stride+o.offset:l[v]*u;for(let f=0;f<u;f++)p[y++]=h[g++]}return new Ut(p,u,d)}if(c(t,"t"),this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let i=new Vl,r=this.index.array,a=this.attributes;for(let o in a){let l=a[o],h=t(l,r);i.setAttribute(o,h)}let n=this.morphAttributes;for(let o in n){let l=[],h=n[o];for(let u=0,d=h.length;u<d;u++){let p=h[u],g=t(p,r);l.push(g)}i.morphAttributes[o]=l}i.morphTargetsRelative=this.morphTargetsRelative;let s=this.groups;for(let o=0,l=s.length;o<l;o++){let h=s[o];i.addGroup(h.start,h.count,h.materialIndex)}return i}toJSON(){let t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0){let l=this.parameters;for(let h in l)l[h]!==void 0&&(t[h]=l[h]);return t}t.data={attributes:{}};let i=this.index;i!==null&&(t.data.index={type:i.array.constructor.name,array:Array.prototype.slice.call(i.array)});let r=this.attributes;for(let l in r){let h=r[l];t.data.attributes[l]=h.toJSON(t.data)}let a={},n=!1;for(let l in this.morphAttributes){let h=this.morphAttributes[l],u=[];for(let d=0,p=h.length;d<p;d++){let g=h[d];u.push(g.toJSON(t.data))}u.length>0&&(a[l]=u,n=!0)}n&&(t.data.morphAttributes=a,t.data.morphTargetsRelative=this.morphTargetsRelative);let s=this.groups;s.length>0&&(t.data.groups=JSON.parse(JSON.stringify(s)));let o=this.boundingSphere;return o!==null&&(t.data.boundingSphere=o.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let i={};this.name=t.name;let r=t.index;r!==null&&this.setIndex(r.clone());let a=t.attributes;for(let h in a){let u=a[h];this.setAttribute(h,u.clone(i))}let n=t.morphAttributes;for(let h in n){let u=[],d=n[h];for(let p=0,g=d.length;p<g;p++)u.push(d[p].clone(i));this.morphAttributes[h]=u}this.morphTargetsRelative=t.morphTargetsRelative;let s=t.groups;for(let h=0,u=s.length;h<u;h++){let d=s[h];this.addGroup(d.start,d.count,d.materialIndex)}let o=t.boundingBox;o!==null&&(this.boundingBox=o.clone());let l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}},fn=new at,hi=new da,wr=new Mr,mn=new O,Or=new O,Fr=new O,Br=new O,Sa=new O,Rr=new O,Bn=new O,zr=new O,Zt=class extends Ct{static{c(this,"Is")}constructor(e=new Yt,t=new Nn){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let i=e[t[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){let n=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[n]=r}}}}getVertexPosition(e,t){let i=this.geometry,r=i.attributes.position,a=i.morphAttributes.position,n=i.morphTargetsRelative;t.fromBufferAttribute(r,e);let s=this.morphTargetInfluences;if(a&&s){Rr.set(0,0,0);for(let o=0,l=a.length;o<l;o++){let h=s[o],u=a[o];h!==0&&(Sa.fromBufferAttribute(u,e),n?Rr.addScaledVector(Sa,h):Rr.addScaledVector(Sa.sub(t),h))}t.add(Rr)}return t}raycast(e,t){let i=this.geometry,r=this.material,a=this.matrixWorld;r!==void 0&&(i.boundingSphere===null&&i.computeBoundingSphere(),wr.copy(i.boundingSphere),wr.applyMatrix4(a),hi.copy(e.ray).recast(e.near),!(wr.containsPoint(hi.origin)===!1&&(hi.intersectSphere(wr,mn)===null||hi.origin.distanceToSquared(mn)>(e.far-e.near)**2))&&(fn.copy(a).invert(),hi.copy(e.ray).applyMatrix4(fn),(i.boundingBox===null||hi.intersectsBox(i.boundingBox)!==!1)&&this._computeIntersections(e,t,hi)))}_computeIntersections(e,t,i){let r,a=this.geometry,n=this.material,s=a.index,o=a.attributes.position,l=a.attributes.uv,h=a.attributes.uv1,u=a.attributes.normal,d=a.groups,p=a.drawRange;if(s!==null)if(Array.isArray(n))for(let g=0,y=d.length;g<y;g++){let v=d[g],m=n[v.materialIndex],f=Math.max(v.start,p.start),w=Math.min(s.count,Math.min(v.start+v.count,p.start+p.count));for(let S=f,b=w;S<b;S+=3){let I=s.getX(S),L=s.getX(S+1),P=s.getX(S+2);r=Jr(this,m,e,i,l,h,u,I,L,P),r&&(r.faceIndex=Math.floor(S/3),r.face.materialIndex=v.materialIndex,t.push(r))}}else{let g=Math.max(0,p.start),y=Math.min(s.count,p.start+p.count);for(let v=g,m=y;v<m;v+=3){let f=s.getX(v),w=s.getX(v+1),S=s.getX(v+2);r=Jr(this,n,e,i,l,h,u,f,w,S),r&&(r.faceIndex=Math.floor(v/3),t.push(r))}}else if(o!==void 0)if(Array.isArray(n))for(let g=0,y=d.length;g<y;g++){let v=d[g],m=n[v.materialIndex],f=Math.max(v.start,p.start),w=Math.min(o.count,Math.min(v.start+v.count,p.start+p.count));for(let S=f,b=w;S<b;S+=3){let I=S,L=S+1,P=S+2;r=Jr(this,m,e,i,l,h,u,I,L,P),r&&(r.faceIndex=Math.floor(S/3),r.face.materialIndex=v.materialIndex,t.push(r))}}else{let g=Math.max(0,p.start),y=Math.min(o.count,p.start+p.count);for(let v=g,m=y;v<m;v+=3){let f=v,w=v+1,S=v+2;r=Jr(this,n,e,i,l,h,u,f,w,S),r&&(r.faceIndex=Math.floor(v/3),t.push(r))}}}},Xa=class kl extends Yt{static{c(this,"e")}constructor(t=1,i=1,r=1,a=1,n=1,s=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:i,depth:r,widthSegments:a,heightSegments:n,depthSegments:s};let o=this;a=Math.floor(a),n=Math.floor(n),s=Math.floor(s);let l=[],h=[],u=[],d=[],p=0,g=0;y("z","y","x",-1,-1,r,i,t,s,n,0),y("z","y","x",1,-1,r,i,-t,s,n,1),y("x","z","y",1,1,t,r,i,a,s,2),y("x","z","y",1,-1,t,r,-i,a,s,3),y("x","y","z",1,-1,t,i,r,a,n,4),y("x","y","z",-1,-1,t,i,-r,a,n,5),this.setIndex(l),this.setAttribute("position",new xt(h,3)),this.setAttribute("normal",new xt(u,3)),this.setAttribute("uv",new xt(d,2));function y(v,m,f,w,S,b,I,L,P,B,E){let M=b/P,C=I/B,V=b/2,H=I/2,k=L/2,Z=P+1,G=B+1,$=0,j=0,te=new O;for(let fe=0;fe<G;fe++){let Ue=fe*C-H;for(let He=0;He<Z;He++)te[v]=(He*M-V)*w,te[m]=Ue*S,te[f]=k,h.push(te.x,te.y,te.z),te[v]=0,te[m]=0,te[f]=L>0?1:-1,u.push(te.x,te.y,te.z),d.push(He/P),d.push(1-fe/B),$+=1}for(let fe=0;fe<B;fe++)for(let Ue=0;Ue<P;Ue++){let He=p+Ue+Z*fe,Ze=p+Ue+Z*(fe+1),W=p+(Ue+1)+Z*(fe+1),re=p+(Ue+1)+Z*fe;l.push(He,Ze,re),l.push(Ze,W,re),j+=6}o.addGroup(g,j,E),g+=j,p+=$}c(y,"p")}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new kl(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}},Pl={clone:cr,merge:Mt},Ps=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Ls=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,si=class extends li{static{c(this,"Vs")}constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Ps,this.fragmentShader=Ls,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=cr(e.uniforms),this.uniformsGroups=Nh(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let r in this.uniforms){let a=this.uniforms[r].value;a&&a.isTexture?t.uniforms[r]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[r]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[r]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[r]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[r]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[r]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[r]={type:"m4",value:a.toArray()}:t.uniforms[r]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let i={};for(let r in this.extensions)this.extensions[r]===!0&&(i[r]=!0);return Object.keys(i).length>0&&(t.extensions=i),t}},gn=class extends Ct{static{c(this,"Hs")}constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new at,this.projectionMatrix=new at,this.projectionMatrixInverse=new at,this.coordinateSystem=zi,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}},ri=new O,_n=new Be,vn=new Be,Dt=class extends gn{static{c(this,"Ks")}constructor(e=50,t=1,i=.1,r=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=i,this.far=r,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=or*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(rr*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return or*2*Math.atan(Math.tan(rr*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,i){ri.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(ri.x,ri.y).multiplyScalar(-e/ri.z),ri.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),i.set(ri.x,ri.y).multiplyScalar(-e/ri.z)}getViewSize(e,t){return this.getViewBounds(e,_n,vn),t.subVectors(vn,_n)}setViewOffset(e,t,i,r,a,n){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=r,this.view.width=a,this.view.height=n,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(rr*.5*this.fov)/this.zoom,i=2*t,r=this.aspect*i,a=-.5*r,n=this.view;if(this.view!==null&&this.view.enabled){let o=n.fullWidth,l=n.fullHeight;a+=n.offsetX*r/o,t-=n.offsetY*i/l,r*=n.width/o,i*=n.height/l}let s=this.filmOffset;s!==0&&(a+=e*s/this.getFilmWidth()),this.projectionMatrix.makePerspective(a,a+r,t,t-i,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},Li=-90,Ui=1,Us=class extends Ct{static{c(this,"Ys")}constructor(e,t,i){super(),this.type="CubeCamera",this.renderTarget=i,this.coordinateSystem=null,this.activeMipmapLevel=0;let r=new Dt(Li,Ui,e,t);r.layers=this.layers,this.add(r);let a=new Dt(Li,Ui,e,t);a.layers=this.layers,this.add(a);let n=new Dt(Li,Ui,e,t);n.layers=this.layers,this.add(n);let s=new Dt(Li,Ui,e,t);s.layers=this.layers,this.add(s);let o=new Dt(Li,Ui,e,t);o.layers=this.layers,this.add(o);let l=new Dt(Li,Ui,e,t);l.layers=this.layers,this.add(l)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[i,r,a,n,s,o]=t;for(let l of t)this.remove(l);if(e===2e3)i.up.set(0,1,0),i.lookAt(1,0,0),r.up.set(0,1,0),r.lookAt(-1,0,0),a.up.set(0,0,-1),a.lookAt(0,1,0),n.up.set(0,0,1),n.lookAt(0,-1,0),s.up.set(0,1,0),s.lookAt(0,0,1),o.up.set(0,1,0),o.lookAt(0,0,-1);else if(e===2001)i.up.set(0,-1,0),i.lookAt(-1,0,0),r.up.set(0,-1,0),r.lookAt(1,0,0),a.up.set(0,0,1),a.lookAt(0,1,0),n.up.set(0,0,-1),n.lookAt(0,-1,0),s.up.set(0,-1,0),s.lookAt(0,0,1),o.up.set(0,-1,0),o.lookAt(0,0,-1);else throw Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(let l of t)this.add(l),l.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:i,activeMipmapLevel:r}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[a,n,s,o,l,h]=this.children,u=e.getRenderTarget(),d=e.getActiveCubeFace(),p=e.getActiveMipmapLevel(),g=e.xr.enabled;e.xr.enabled=!1;let y=i.texture.generateMipmaps;i.texture.generateMipmaps=!1,e.setRenderTarget(i,0,r),e.render(t,a),e.setRenderTarget(i,1,r),e.render(t,n),e.setRenderTarget(i,2,r),e.render(t,s),e.setRenderTarget(i,3,r),e.render(t,o),e.setRenderTarget(i,4,r),e.render(t,l),i.texture.generateMipmaps=y,e.setRenderTarget(i,5,r),e.render(t,h),e.setRenderTarget(u,d,p),e.xr.enabled=g,i.texture.needsPMREMUpdate=!0}},zn=class extends Lt{static{c(this,"Xs")}constructor(e=[],t=301,i,r,a,n,s,o,l,h){super(e,t,i,r,a,n,s,o,l,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},Ll=class extends vi{static{c(this,"Zs")}constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let i={width:e,height:e,depth:1},r=[i,i,i,i,i,i];this.texture=new zn(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let i={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},r=new Xa(5,5,5),a=new si({name:"CubemapFromEquirect",uniforms:cr(i.uniforms),vertexShader:i.vertexShader,fragmentShader:i.fragmentShader,side:1,blending:0});a.uniforms.tEquirect.value=t;let n=new Zt(r,a),s=t.minFilter;return t.minFilter===1008&&(t.minFilter=_i),new Us(1,10,this).update(e,n),t.minFilter=s,n.geometry.dispose(),n.material.dispose(),this}clear(e,t=!0,i=!0,r=!0){let a=e.getRenderTarget();for(let n=0;n<6;n++)e.setRenderTarget(this,n),e.clear(t,i,r);e.setRenderTarget(a)}},Cr=class extends Ct{static{c(this,"Qs")}constructor(){super(),this.isGroup=!0,this.type="Group"}},Ds={type:"move"},Oa=class{static{c(this,"ec")}constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Cr,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Cr,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new O,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new O),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Cr,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new O,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new O),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let i of e.hand.values())this._getHandJoint(t,i)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,i){let r=null,a=null,n=null,s=this._targetRay,o=this._grip,l=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(l&&e.hand){n=!0;for(let p of e.hand.values()){let g=t.getJointPose(p,i),y=this._getHandJoint(l,p);g!==null&&(y.matrix.fromArray(g.transform.matrix),y.matrix.decompose(y.position,y.rotation,y.scale),y.matrixWorldNeedsUpdate=!0,y.jointRadius=g.radius),y.visible=g!==null}let h=l.joints["index-finger-tip"],u=l.joints["thumb-tip"],d=h.position.distanceTo(u.position);l.inputState.pinching&&d>.025?(l.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!l.inputState.pinching&&d<=.015&&(l.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else o!==null&&e.gripSpace&&(a=t.getPose(e.gripSpace,i),a!==null&&(o.matrix.fromArray(a.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,a.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(a.linearVelocity)):o.hasLinearVelocity=!1,a.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(a.angularVelocity)):o.hasAngularVelocity=!1));s!==null&&(r=t.getPose(e.targetRaySpace,i),r===null&&a!==null&&(r=a),r!==null&&(s.matrix.fromArray(r.transform.matrix),s.matrix.decompose(s.position,s.rotation,s.scale),s.matrixWorldNeedsUpdate=!0,r.linearVelocity?(s.hasLinearVelocity=!0,s.linearVelocity.copy(r.linearVelocity)):s.hasLinearVelocity=!1,r.angularVelocity?(s.hasAngularVelocity=!0,s.angularVelocity.copy(r.angularVelocity)):s.hasAngularVelocity=!1,this.dispatchEvent(Ds)))}return s!==null&&(s.visible=r!==null),o!==null&&(o.visible=a!==null),l!==null&&(l.visible=n!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let i=new Cr;i.matrixAutoUpdate=!1,i.visible=!1,e.joints[t.jointName]=i,e.add(i)}return e.joints[t.jointName]}},zh=class extends Ct{static{c(this,"rc")}constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new ai,this.environmentIntensity=1,this.environmentRotation=new ai,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}},Is=class{static{c(this,"ic")}constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e===void 0?0:e.length/t,this.usage=rn,this.updateRanges=[],this.version=0,this.uuid=Jt()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,i){e*=this.stride,i*=t.stride;for(let r=0,a=this.stride;r<a;r++)this.array[e+r]=t.array[i+r];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Jt()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),i=new this.constructor(t,this.stride);return i.setUsage(this.usage),i}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Jt()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}},_t=new O,xn=class Gl{static{c(this,"e")}constructor(t,i,r,a=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=t,this.itemSize=i,this.offset=r,this.normalized=a}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(t){this.data.needsUpdate=t}applyMatrix4(t){for(let i=0,r=this.data.count;i<r;i++)_t.fromBufferAttribute(this,i),_t.applyMatrix4(t),this.setXYZ(i,_t.x,_t.y,_t.z);return this}applyNormalMatrix(t){for(let i=0,r=this.count;i<r;i++)_t.fromBufferAttribute(this,i),_t.applyNormalMatrix(t),this.setXYZ(i,_t.x,_t.y,_t.z);return this}transformDirection(t){for(let i=0,r=this.count;i<r;i++)_t.fromBufferAttribute(this,i),_t.transformDirection(t),this.setXYZ(i,_t.x,_t.y,_t.z);return this}getComponent(t,i){let r=this.array[t*this.data.stride+this.offset+i];return this.normalized&&(r=Ft(r,this.array)),r}setComponent(t,i,r){return this.normalized&&(r=Xe(r,this.array)),this.data.array[t*this.data.stride+this.offset+i]=r,this}setX(t,i){return this.normalized&&(i=Xe(i,this.array)),this.data.array[t*this.data.stride+this.offset]=i,this}setY(t,i){return this.normalized&&(i=Xe(i,this.array)),this.data.array[t*this.data.stride+this.offset+1]=i,this}setZ(t,i){return this.normalized&&(i=Xe(i,this.array)),this.data.array[t*this.data.stride+this.offset+2]=i,this}setW(t,i){return this.normalized&&(i=Xe(i,this.array)),this.data.array[t*this.data.stride+this.offset+3]=i,this}getX(t){let i=this.data.array[t*this.data.stride+this.offset];return this.normalized&&(i=Ft(i,this.array)),i}getY(t){let i=this.data.array[t*this.data.stride+this.offset+1];return this.normalized&&(i=Ft(i,this.array)),i}getZ(t){let i=this.data.array[t*this.data.stride+this.offset+2];return this.normalized&&(i=Ft(i,this.array)),i}getW(t){let i=this.data.array[t*this.data.stride+this.offset+3];return this.normalized&&(i=Ft(i,this.array)),i}setXY(t,i,r){return t=t*this.data.stride+this.offset,this.normalized&&(i=Xe(i,this.array),r=Xe(r,this.array)),this.data.array[t+0]=i,this.data.array[t+1]=r,this}setXYZ(t,i,r,a){return t=t*this.data.stride+this.offset,this.normalized&&(i=Xe(i,this.array),r=Xe(r,this.array),a=Xe(a,this.array)),this.data.array[t+0]=i,this.data.array[t+1]=r,this.data.array[t+2]=a,this}setXYZW(t,i,r,a,n){return t=t*this.data.stride+this.offset,this.normalized&&(i=Xe(i,this.array),r=Xe(r,this.array),a=Xe(a,this.array),n=Xe(n,this.array)),this.data.array[t+0]=i,this.data.array[t+1]=r,this.data.array[t+2]=a,this.data.array[t+3]=n,this}clone(t){if(t===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let i=[];for(let r=0;r<this.count;r++){let a=r*this.data.stride+this.offset;for(let n=0;n<this.itemSize;n++)i.push(this.data.array[a+n])}return new Ut(new this.array.constructor(i),this.itemSize,this.normalized)}return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.clone(t)),new Gl(t.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(t){if(t===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let i=[];for(let r=0;r<this.count;r++){let a=r*this.data.stride+this.offset;for(let n=0;n<this.itemSize;n++)i.push(this.data.array[a+n])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:i,normalized:this.normalized}}return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.toJSON(t)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}},Ns=class extends li{static{c(this,"sc")}constructor(e){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new ze(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},Ji=new O,Di=new O,Ii=new O,Bi=new Be,ar=new Be,Hn=new at,Pr=new O,$i=new O,Lr=new O,Mn=new Be,Ea=new Be,yn=new Be,Hh=class extends Ct{static{c(this,"xc")}constructor(e=new Ns){if(super(),this.isSprite=!0,this.type="Sprite",Zi===void 0){Zi=new Yt;let t=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),i=new Is(t,5);Zi.setIndex([0,1,2,0,2,3]),Zi.setAttribute("position",new xn(i,3,0,!1)),Zi.setAttribute("uv",new xn(i,2,3,!1))}this.geometry=Zi,this.material=e,this.center=new Be(.5,.5),this.count=1}raycast(e,t){e.camera===null&&console.error('THREE.Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),Di.setFromMatrixScale(this.matrixWorld),Hn.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),Ii.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&Di.multiplyScalar(-Ii.z);let i=this.material.rotation,r,a;i!==0&&(a=Math.cos(i),r=Math.sin(i));let n=this.center;$r(Pr.set(-.5,-.5,0),Ii,n,Di,r,a),$r($i.set(.5,-.5,0),Ii,n,Di,r,a),$r(Lr.set(.5,.5,0),Ii,n,Di,r,a),Mn.set(0,0),Ea.set(1,0),yn.set(1,1);let s=e.ray.intersectTriangle(Pr,$i,Lr,!1,Ji);if(s===null&&($r($i.set(-.5,.5,0),Ii,n,Di,r,a),Ea.set(0,1),s=e.ray.intersectTriangle(Pr,Lr,$i,!1,Ji),s===null))return;let o=e.ray.origin.distanceTo(Ji);o<e.near||o>e.far||t.push({distance:o,point:Ji.clone(),uv:Hi.getInterpolation(Ji,Pr,$i,Lr,Mn,Ea,yn,new Be),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}},Ta=new O,Os=new O,Fs=new Ne,fi=class{static{c(this,"Qc")}constructor(e=new O(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,i,r){return this.normal.set(e,t,i),this.constant=r,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,i){let r=Ta.subVectors(i,t).cross(Os.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(r,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){let i=e.delta(Ta),r=this.normal.dot(i);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let a=-(e.start.dot(this.normal)+this.constant)/r;return a<0||a>1?null:t.copy(e.start).addScaledVector(i,a)}intersectsLine(e){let t=this.distanceToPoint(e.start),i=this.distanceToPoint(e.end);return t<0&&i>0||i<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let i=t||Fs.getNormalMatrix(e),r=this.coplanarPoint(Ta).applyMatrix4(e),a=this.normal.applyMatrix3(i).normalize();return this.constant=-r.dot(a),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}},ci=new Mr,Bs=new Be(.5,.5),Ur=new O,is=class{static{c(this,"nl")}constructor(e=new fi,t=new fi,i=new fi,r=new fi,a=new fi,n=new fi){this.planes=[e,t,i,r,a,n]}set(e,t,i,r,a,n){let s=this.planes;return s[0].copy(e),s[1].copy(t),s[2].copy(i),s[3].copy(r),s[4].copy(a),s[5].copy(n),this}copy(e){let t=this.planes;for(let i=0;i<6;i++)t[i].copy(e.planes[i]);return this}setFromProjectionMatrix(e,t=zi,i=!1){let r=this.planes,a=e.elements,n=a[0],s=a[1],o=a[2],l=a[3],h=a[4],u=a[5],d=a[6],p=a[7],g=a[8],y=a[9],v=a[10],m=a[11],f=a[12],w=a[13],S=a[14],b=a[15];if(r[0].setComponents(l-n,p-h,m-g,b-f).normalize(),r[1].setComponents(l+n,p+h,m+g,b+f).normalize(),r[2].setComponents(l+s,p+u,m+y,b+w).normalize(),r[3].setComponents(l-s,p-u,m-y,b-w).normalize(),i)r[4].setComponents(o,d,v,S).normalize(),r[5].setComponents(l-o,p-d,m-v,b-S).normalize();else if(r[4].setComponents(l-o,p-d,m-v,b-S).normalize(),t===2e3)r[5].setComponents(l+o,p+d,m+v,b+S).normalize();else if(t===2001)r[5].setComponents(o,d,v,S).normalize();else throw Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),ci.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),ci.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(ci)}intersectsSprite(e){ci.center.set(0,0,0);let t=Bs.distanceTo(e.center);return ci.radius=.7071067811865476+t,ci.applyMatrix4(e.matrixWorld),this.intersectsSphere(ci)}intersectsSphere(e){let t=this.planes,i=e.center,r=-e.radius;for(let a=0;a<6;a++)if(t[a].distanceToPoint(i)<r)return!1;return!0}intersectsBox(e){let t=this.planes;for(let i=0;i<6;i++){let r=t[i];if(Ur.x=r.normal.x>0?e.max.x:e.min.x,Ur.y=r.normal.y>0?e.max.y:e.min.y,Ur.z=r.normal.z>0?e.max.z:e.min.z,r.distanceToPoint(Ur)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let i=0;i<6;i++)if(t[i].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}},zs=class extends li{static{c(this,"bl")}constructor(e){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new ze(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}},Xr=new O,jr=new O,Sn=new at,Qi=new da,Dr=new Mr,Fa=new O,Vn=new O,Vh=class extends Ct{static{c(this,"Ol")}constructor(e=new Yt,t=new zs){super(),this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,i=[0];for(let r=1,a=t.count;r<a;r++)Xr.fromBufferAttribute(t,r-1),jr.fromBufferAttribute(t,r),i[r]=i[r-1],i[r]+=Xr.distanceTo(jr);e.setAttribute("lineDistance",new xt(i,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(e,t){let i=this.geometry,r=this.matrixWorld,a=e.params.Line.threshold,n=i.drawRange;if(i.boundingSphere===null&&i.computeBoundingSphere(),Dr.copy(i.boundingSphere),Dr.applyMatrix4(r),Dr.radius+=a,e.ray.intersectsSphere(Dr)===!1)return;Sn.copy(r).invert(),Qi.copy(e.ray).applyMatrix4(Sn);let s=a/((this.scale.x+this.scale.y+this.scale.z)/3),o=s*s,l=this.isLineSegments?2:1,h=i.index,u=i.attributes.position;if(h!==null){let d=Math.max(0,n.start),p=Math.min(h.count,n.start+n.count);for(let g=d,y=p-1;g<y;g+=l){let v=h.getX(g),m=h.getX(g+1),f=Qr(this,e,Qi,o,v,m,g);f&&t.push(f)}if(this.isLineLoop){let g=h.getX(p-1),y=h.getX(d),v=Qr(this,e,Qi,o,g,y,p-1);v&&t.push(v)}}else{let d=Math.max(0,n.start),p=Math.min(u.count,n.start+n.count);for(let g=d,y=p-1;g<y;g+=l){let v=Qr(this,e,Qi,o,g,g+1,g);v&&t.push(v)}if(this.isLineLoop){let g=Qr(this,e,Qi,o,p-1,d,p-1);g&&t.push(g)}}}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let i=e[t[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){let n=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[n]=r}}}}},kh=class extends Lt{static{c(this,"Gl")}constructor(e,t,i,r,a,n,s,o,l){super(e,t,i,r,a,n,s,o,l),this.isCanvasTexture=!0,this.needsUpdate=!0}},kn=class extends Lt{static{c(this,"Kl")}constructor(e,t,i=ka,r,a,n,s=Kt,o=Kt,l,h=Pn,u=1){if(h!==1026&&h!==1027)throw Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");super({width:e,height:t,depth:u},r,a,n,s,o,h,i,l),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new sa(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}},Gh=class Wl extends Yt{static{c(this,"e")}constructor(t=1,i=1,r=1,a=32,n=1,s=!1,o=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:i,height:r,radialSegments:a,heightSegments:n,openEnded:s,thetaStart:o,thetaLength:l};let h=this;a=Math.floor(a),n=Math.floor(n);let u=[],d=[],p=[],g=[],y=0,v=[],m=r/2,f=0;w(),s===!1&&(t>0&&S(!0),i>0&&S(!1)),this.setIndex(u),this.setAttribute("position",new xt(d,3)),this.setAttribute("normal",new xt(p,3)),this.setAttribute("uv",new xt(g,2));function w(){let b=new O,I=new O,L=0,P=(i-t)/r;for(let B=0;B<=n;B++){let E=[],M=B/n,C=M*(i-t)+t;for(let V=0;V<=a;V++){let H=V/a,k=H*l+o,Z=Math.sin(k),G=Math.cos(k);I.x=C*Z,I.y=-M*r+m,I.z=C*G,d.push(I.x,I.y,I.z),b.set(Z,P,G).normalize(),p.push(b.x,b.y,b.z),g.push(H,1-M),E.push(y++)}v.push(E)}for(let B=0;B<a;B++)for(let E=0;E<n;E++){let M=v[E][B],C=v[E+1][B],V=v[E+1][B+1],H=v[E][B+1];(t>0||E!==0)&&(u.push(M,C,H),L+=3),(i>0||E!==n-1)&&(u.push(C,V,H),L+=3)}h.addGroup(f,L,0),f+=L}c(w,"_");function S(b){let I=y,L=new Be,P=new O,B=0,E=b===!0?t:i,M=b===!0?1:-1;for(let V=1;V<=a;V++)d.push(0,m*M,0),p.push(0,M,0),g.push(.5,.5),y++;let C=y;for(let V=0;V<=a;V++){let H=V/a*l+o,k=Math.cos(H),Z=Math.sin(H);P.x=E*Z,P.y=m*M,P.z=E*k,d.push(P.x,P.y,P.z),p.push(0,M,0),L.x=k*.5+.5,L.y=Z*.5*M+.5,g.push(L.x,L.y),y++}for(let V=0;V<a;V++){let H=I+V,k=C+V;b===!0?u.push(k,k+1,H):u.push(k+1,k,H),B+=3}h.addGroup(f,B,b===!0?1:2),f+=B}c(S,"v")}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Wl(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},rs=class Xl extends Yt{static{c(this,"e")}constructor(t=1,i=1,r=1,a=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:i,widthSegments:r,heightSegments:a};let n=t/2,s=i/2,o=Math.floor(r),l=Math.floor(a),h=o+1,u=l+1,d=t/o,p=i/l,g=[],y=[],v=[],m=[];for(let f=0;f<u;f++){let w=f*p-s;for(let S=0;S<h;S++){let b=S*d-n;y.push(b,-w,0),v.push(0,0,1),m.push(S/o),m.push(1-f/l)}}for(let f=0;f<l;f++)for(let w=0;w<o;w++){let S=w+h*f,b=w+h*(f+1),I=w+1+h*(f+1),L=w+1+h*f;g.push(S,b,L),g.push(b,I,L)}this.setIndex(g),this.setAttribute("position",new xt(y,3)),this.setAttribute("normal",new xt(v,3)),this.setAttribute("uv",new xt(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Xl(t.width,t.height,t.widthSegments,t.heightSegments)}},Wh=class jl extends Yt{static{c(this,"e")}constructor(t=1,i=32,r=16,a=0,n=Math.PI*2,s=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:i,heightSegments:r,phiStart:a,phiLength:n,thetaStart:s,thetaLength:o},i=Math.max(3,Math.floor(i)),r=Math.max(2,Math.floor(r));let l=Math.min(s+o,Math.PI),h=0,u=[],d=new O,p=new O,g=[],y=[],v=[],m=[];for(let f=0;f<=r;f++){let w=[],S=f/r,b=0;f===0&&s===0?b=.5/i:f===r&&l===Math.PI&&(b=-.5/i);for(let I=0;I<=i;I++){let L=I/i;d.x=-t*Math.cos(a+L*n)*Math.sin(s+S*o),d.y=t*Math.cos(s+S*o),d.z=t*Math.sin(a+L*n)*Math.sin(s+S*o),y.push(d.x,d.y,d.z),p.copy(d).normalize(),v.push(p.x,p.y,p.z),m.push(L+b,1-S),w.push(h++)}u.push(w)}for(let f=0;f<r;f++)for(let w=0;w<i;w++){let S=u[f][w+1],b=u[f][w],I=u[f+1][w],L=u[f+1][w+1];(f!==0||s>0)&&g.push(S,b,L),(f!==r-1||l<Math.PI)&&g.push(b,I,L)}this.setIndex(g),this.setAttribute("position",new xt(y,3)),this.setAttribute("normal",new xt(v,3)),this.setAttribute("uv",new xt(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new jl(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}},Hs=class extends li{static{c(this,"Hu")}constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new ze(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ze(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new Be(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new ai,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}},Xh=class extends Hs{static{c(this,"Uu")}constructor(e){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new Be(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:c(function(){return Fe(2.5*(this.ior-1)/(this.ior+1),0,1)},"get"),set:c(function(t){this.ior=(1+.4*t)/(1-.4*t)},"set")}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new ze(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new ze(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new ze(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._sheen=0,this._transmission=0,this.setValues(e)}get anisotropy(){return this._anisotropy}set anisotropy(e){this._anisotropy>0!=e>0&&this.version++,this._anisotropy=e}get clearcoat(){return this._clearcoat}set clearcoat(e){this._clearcoat>0!=e>0&&this.version++,this._clearcoat=e}get iridescence(){return this._iridescence}set iridescence(e){this._iridescence>0!=e>0&&this.version++,this._iridescence=e}get dispersion(){return this._dispersion}set dispersion(e){this._dispersion>0!=e>0&&this.version++,this._dispersion=e}get sheen(){return this._sheen}set sheen(e){this._sheen>0!=e>0&&this.version++,this._sheen=e}get transmission(){return this._transmission}set transmission(e){this._transmission>0!=e>0&&this.version++,this._transmission=e}copy(e){return super.copy(e),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=e.anisotropy,this.anisotropyRotation=e.anisotropyRotation,this.anisotropyMap=e.anisotropyMap,this.clearcoat=e.clearcoat,this.clearcoatMap=e.clearcoatMap,this.clearcoatRoughness=e.clearcoatRoughness,this.clearcoatRoughnessMap=e.clearcoatRoughnessMap,this.clearcoatNormalMap=e.clearcoatNormalMap,this.clearcoatNormalScale.copy(e.clearcoatNormalScale),this.dispersion=e.dispersion,this.ior=e.ior,this.iridescence=e.iridescence,this.iridescenceMap=e.iridescenceMap,this.iridescenceIOR=e.iridescenceIOR,this.iridescenceThicknessRange=[...e.iridescenceThicknessRange],this.iridescenceThicknessMap=e.iridescenceThicknessMap,this.sheen=e.sheen,this.sheenColor.copy(e.sheenColor),this.sheenColorMap=e.sheenColorMap,this.sheenRoughness=e.sheenRoughness,this.sheenRoughnessMap=e.sheenRoughnessMap,this.transmission=e.transmission,this.transmissionMap=e.transmissionMap,this.thickness=e.thickness,this.thicknessMap=e.thicknessMap,this.attenuationDistance=e.attenuationDistance,this.attenuationColor.copy(e.attenuationColor),this.specularIntensity=e.specularIntensity,this.specularIntensityMap=e.specularIntensityMap,this.specularColor.copy(e.specularColor),this.specularColorMap=e.specularColorMap,this}},Ul=class extends li{static{c(this,"Ju")}constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=gs,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},Dl=class extends li{static{c(this,"Yu")}constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}},Ir=class{static{c(this,"$u")}constructor(e,t,i,r){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=r===void 0?new t.constructor(i):r,this.sampleValues=t,this.valueSize=i,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,i=this._cachedIndex,r=t[i],a=t[i-1];i:{e:{let n;t:{r:if(!(e<r)){for(let s=i+2;;){if(r===void 0){if(e<a)break r;return i=t.length,this._cachedIndex=i,this.copySampleValue_(i-1)}if(i===s)break;if(a=r,r=t[++i],e<r)break e}n=t.length;break t}if(!(e>=a)){let s=t[1];e<s&&(i=2,a=s);for(let o=i-2;;){if(a===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===o)break;if(r=a,a=t[--i-1],e>=a)break e}n=i,i=0;break t}break i}for(;i<n;){let s=i+n>>>1;e<t[s]?n=s:i=s+1}if(r=t[i],a=t[i-1],a===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(r===void 0)return i=t.length,this._cachedIndex=i,this.copySampleValue_(i-1)}this._cachedIndex=i,this.intervalChanged_(i,a,r)}return this.interpolate_(i,a,e,r)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,i=this.sampleValues,r=this.valueSize,a=e*r;for(let n=0;n!==r;++n)t[n]=i[a+n];return t}interpolate_(){throw Error("call to abstract method")}intervalChanged_(){}},Vs=class extends Ir{static{c(this,"ed")}constructor(e,t,i,r){super(e,t,i,r),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:Qa,endingEnd:Qa}}intervalChanged_(e,t,i){let r=this.parameterPositions,a=e-2,n=e+1,s=r[a],o=r[n];if(s===void 0)switch(this.getSettings_().endingStart){case en:a=e,s=2*t-i;break;case tn:a=r.length-2,s=t+r[a]-r[a+1];break;default:a=e,s=i}if(o===void 0)switch(this.getSettings_().endingEnd){case en:n=e,o=2*i-t;break;case tn:n=1,o=i+r[1]-r[0];break;default:n=e-1,o=t}let l=(i-t)*.5,h=this.valueSize;this._weightPrev=l/(t-s),this._weightNext=l/(o-i),this._offsetPrev=a*h,this._offsetNext=n*h}interpolate_(e,t,i,r){let a=this.resultBuffer,n=this.sampleValues,s=this.valueSize,o=e*s,l=o-s,h=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,p=this._weightNext,g=(i-t)/(r-t),y=g*g,v=y*g,m=-d*v+2*d*y-d*g,f=(1+d)*v+(-1.5-2*d)*y+(-.5+d)*g+1,w=(-1-p)*v+(1.5+p)*y+.5*g,S=p*v-p*y;for(let b=0;b!==s;++b)a[b]=m*n[h+b]+f*n[l+b]+w*n[o+b]+S*n[u+b];return a}},ks=class extends Ir{static{c(this,"td")}constructor(e,t,i,r){super(e,t,i,r)}interpolate_(e,t,i,r){let a=this.resultBuffer,n=this.sampleValues,s=this.valueSize,o=e*s,l=o-s,h=(i-t)/(r-t),u=1-h;for(let d=0;d!==s;++d)a[d]=n[l+d]*u+n[o+d]*h;return a}},Gs=class extends Ir{static{c(this,"nd")}constructor(e,t,i,r){super(e,t,i,r)}interpolate_(e){return this.copySampleValue_(e-1)}},Bt=class{static{c(this,"rd")}constructor(e,t,i,r){if(e===void 0)throw Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=ea(t,this.TimeBufferType),this.values=ea(i,this.ValueBufferType),this.setInterpolation(r||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,i;if(t.toJSON!==this.toJSON)i=t.toJSON(e);else{i={name:e.name,times:ea(e.times,Array),values:ea(e.values,Array)};let r=e.getInterpolation();r!==e.DefaultInterpolation&&(i.interpolation=r)}return i.type=e.ValueTypeName,i}InterpolantFactoryMethodDiscrete(e){return new Gs(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new ks(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new Vs(this.times,this.values,this.getValueSize(),e)}setInterpolation(e){let t;switch(e){case gr:t=this.InterpolantFactoryMethodDiscrete;break;case ta:t=this.InterpolantFactoryMethodLinear;break;case ia:t=this.InterpolantFactoryMethodSmooth}if(t===void 0){let i="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw Error(i);return console.warn("THREE.KeyframeTrack:",i),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return gr;case this.InterpolantFactoryMethodLinear:return ta;case this.InterpolantFactoryMethodSmooth:return ia}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let i=0,r=t.length;i!==r;++i)t[i]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let i=0,r=t.length;i!==r;++i)t[i]*=e}return this}trim(e,t){let i=this.times,r=i.length,a=0,n=r-1;for(;a!==r&&i[a]<e;)++a;for(;n!==-1&&i[n]>t;)--n;if(++n,a!==0||n!==r){a>=n&&(n=Math.max(n,1),a=n-1);let s=this.getValueSize();this.times=i.slice(a,n),this.values=this.values.slice(a*s,n*s)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),e=!1);let i=this.times,r=this.values,a=i.length;a===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),e=!1);let n=null;for(let s=0;s!==a;s++){let o=i[s];if(typeof o=="number"&&isNaN(o)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,s,o),e=!1;break}if(n!==null&&n>o){console.error("THREE.KeyframeTrack: Out of order keys.",this,s,o,n),e=!1;break}n=o}if(r!==void 0&&Oh(r))for(let s=0,o=r.length;s!==o;++s){let l=r[s];if(isNaN(l)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,s,l),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),i=this.getValueSize(),r=this.getInterpolation()===ia,a=e.length-1,n=1;for(let s=1;s<a;++s){let o=!1,l=e[s];if(l!==e[s+1]&&(s!==1||l!==e[0]))if(r)o=!0;else{let h=s*i,u=h-i,d=h+i;for(let p=0;p!==i;++p){let g=t[h+p];if(g!==t[u+p]||g!==t[d+p]){o=!0;break}}}if(o){if(s!==n){e[n]=e[s];let h=s*i,u=n*i;for(let d=0;d!==i;++d)t[u+d]=t[h+d]}++n}}if(a>0){e[n]=e[a];for(let s=a*i,o=n*i,l=0;l!==i;++l)t[o+l]=t[s+l];++n}return n===e.length?(this.times=e,this.values=t):(this.times=e.slice(0,n),this.values=t.slice(0,n*i)),this}clone(){let e=this.times.slice(),t=this.values.slice(),i=this.constructor,r=new i(this.name,e,t);return r.createInterpolant=this.createInterpolant,r}},Bt.prototype.ValueTypeName="",Bt.prototype.TimeBufferType=Float32Array,Bt.prototype.ValueBufferType=Float32Array,Bt.prototype.DefaultInterpolation=ta,er=class extends Bt{static{c(this,"id")}constructor(e,t,i){super(e,t,i)}},er.prototype.ValueTypeName="bool",er.prototype.ValueBufferType=Array,er.prototype.DefaultInterpolation=gr,er.prototype.InterpolantFactoryMethodLinear=void 0,er.prototype.InterpolantFactoryMethodSmooth=void 0,Ws=class extends Bt{static{c(this,"ad")}constructor(e,t,i,r){super(e,t,i,r)}},Ws.prototype.ValueTypeName="color",Xs=class extends Bt{static{c(this,"od")}constructor(e,t,i,r){super(e,t,i,r)}},Xs.prototype.ValueTypeName="number",js=class extends Ir{static{c(this,"sd")}constructor(e,t,i,r){super(e,t,i,r)}interpolate_(e,t,i,r){let a=this.resultBuffer,n=this.sampleValues,s=this.valueSize,o=(i-t)/(r-t),l=e*s;for(let h=l+s;l!==h;l+=4)yi.slerpFlat(a,0,n,l-s,n,l,o);return a}},En=class extends Bt{static{c(this,"cd")}constructor(e,t,i,r){super(e,t,i,r)}InterpolantFactoryMethodLinear(e){return new js(this.times,this.values,this.getValueSize(),e)}},En.prototype.ValueTypeName="quaternion",En.prototype.InterpolantFactoryMethodSmooth=void 0,tr=class extends Bt{static{c(this,"ld")}constructor(e,t,i){super(e,t,i)}},tr.prototype.ValueTypeName="string",tr.prototype.ValueBufferType=Array,tr.prototype.DefaultInterpolation=gr,tr.prototype.InterpolantFactoryMethodLinear=void 0,tr.prototype.InterpolantFactoryMethodSmooth=void 0,qs=class extends Bt{static{c(this,"ud")}constructor(e,t,i,r){super(e,t,i,r)}},qs.prototype.ValueTypeName="vector",ir={enabled:!1,files:{},add:c(function(e,t){this.enabled!==!1&&(this.files[e]=t)},"add"),get:c(function(e){if(this.enabled!==!1)return this.files[e]},"get"),remove:c(function(e){delete this.files[e]},"remove"),clear:c(function(){this.files={}},"clear")},Ys=class{static{c(this,"pd")}constructor(e,t,i){let r=this,a=!1,n=0,s=0,o,l=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=i,this.abortController=new AbortController,this.itemStart=function(h){s++,a===!1&&r.onStart!==void 0&&r.onStart(h,n,s),a=!0},this.itemEnd=function(h){n++,r.onProgress!==void 0&&r.onProgress(h,n,s),n===s&&(a=!1,r.onLoad!==void 0&&r.onLoad())},this.itemError=function(h){r.onError!==void 0&&r.onError(h)},this.resolveURL=function(h){return o?o(h):h},this.setURLModifier=function(h){return o=h,this},this.addHandler=function(h,u){return l.push(h,u),this},this.removeHandler=function(h){let u=l.indexOf(h);return u!==-1&&l.splice(u,2),this},this.getHandler=function(h){for(let u=0,d=l.length;u<d;u+=2){let p=l[u],g=l[u+1];if(p.global&&(p.lastIndex=0),p.test(h))return g}return null},this.abort=function(){return this.abortController.abort(),this.abortController=new AbortController,this}}},Ks=new Ys,ba=class{static{c(this,"hd")}constructor(e){this.manager=e===void 0?Ks:e,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(e,t){let i=this;return new Promise(function(r,a){i.load(e,r,t,a)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}abort(){return this}},ba.DEFAULT_MATERIAL_NAME="__DEFAULT",qt={},Zs=class extends Error{static{c(this,"_d")}constructor(e,t){super(e),this.response=t}},jh=class extends ba{static{c(this,"vd")}constructor(e){super(e),this.mimeType="",this.responseType="",this._abortController=new AbortController}load(e,t,i,r){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let a=ir.get(`file:${e}`);if(a!==void 0)return this.manager.itemStart(e),setTimeout(()=>{t&&t(a),this.manager.itemEnd(e)},0),a;if(qt[e]!==void 0){qt[e].push({onLoad:t,onProgress:i,onError:r});return}qt[e]=[],qt[e].push({onLoad:t,onProgress:i,onError:r});let n=new Request(e,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin",signal:typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal}),s=this.mimeType,o=this.responseType;fetch(n).then(l=>{if(l.status===200||l.status===0){if(l.status===0&&console.warn("THREE.FileLoader: HTTP Status 0 received."),typeof ReadableStream>"u"||l.body===void 0||l.body.getReader===void 0)return l;let h=qt[e],u=l.body.getReader(),d=l.headers.get("X-File-Size")||l.headers.get("Content-Length"),p=d?parseInt(d):0,g=p!==0,y=0,v=new ReadableStream({start(m){f();function f(){u.read().then(({done:w,value:S})=>{if(w)m.close();else{y+=S.byteLength;let b=new ProgressEvent("progress",{lengthComputable:g,loaded:y,total:p});for(let I=0,L=h.length;I<L;I++){let P=h[I];P.onProgress&&P.onProgress(b)}m.enqueue(S),f()}},w=>{m.error(w)})}c(f,"t")}});return new Response(v)}throw new Zs(`fetch for "${l.url}" responded with ${l.status}: ${l.statusText}`,l)}).then(l=>{switch(o){case"arraybuffer":return l.arrayBuffer();case"blob":return l.blob();case"document":return l.text().then(h=>new DOMParser().parseFromString(h,s));case"json":return l.json();default:if(s==="")return l.text();{let h=/charset="?([^;"\s]*)"?/i.exec(s),u=h&&h[1]?h[1].toLowerCase():void 0,d=new TextDecoder(u);return l.arrayBuffer().then(p=>d.decode(p))}}}).then(l=>{ir.add(`file:${e}`,l);let h=qt[e];delete qt[e];for(let u=0,d=h.length;u<d;u++){let p=h[u];p.onLoad&&p.onLoad(l)}}).catch(l=>{let h=qt[e];if(h===void 0)throw this.manager.itemError(e),l;delete qt[e];for(let u=0,d=h.length;u<d;u++){let p=h[u];p.onError&&p.onError(l)}this.manager.itemError(e)}).finally(()=>{this.manager.itemEnd(e)}),this.manager.itemStart(e)}setResponseType(e){return this.responseType=e,this}setMimeType(e){return this.mimeType=e,this}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}},Ni=new WeakMap,qh=class extends ba{static{c(this,"Sd")}constructor(e){super(e)}load(e,t,i,r){this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let a=this,n=ir.get(`image:${e}`);if(n!==void 0){if(n.complete===!0)a.manager.itemStart(e),setTimeout(function(){t&&t(n),a.manager.itemEnd(e)},0);else{let u=Ni.get(n);u===void 0&&(u=[],Ni.set(n,u)),u.push({onLoad:t,onError:r})}return n}let s=Wr("img");function o(){h(),t&&t(this);let u=Ni.get(this)||[];for(let d=0;d<u.length;d++){let p=u[d];p.onLoad&&p.onLoad(this)}Ni.delete(this),a.manager.itemEnd(e)}c(o,"s");function l(u){h(),r&&r(u),ir.remove(`image:${e}`);let d=Ni.get(this)||[];for(let p=0;p<d.length;p++){let g=d[p];g.onError&&g.onError(u)}Ni.delete(this),a.manager.itemError(e),a.manager.itemEnd(e)}c(l,"c");function h(){s.removeEventListener("load",o,!1),s.removeEventListener("error",l,!1)}return c(h,"l"),s.addEventListener("load",o,!1),s.addEventListener("error",l,!1),e.slice(0,5)!=="data:"&&this.crossOrigin!==void 0&&(s.crossOrigin=this.crossOrigin),ir.add(`image:${e}`,s),a.manager.itemStart(e),s.src=e,s}},Il=class extends gn{static{c(this,"zd")}constructor(e=-1,t=1,i=1,r=-1,a=.1,n=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=i,this.bottom=r,this.near=a,this.far=n,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,i,r,a,n){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=r,this.view.width=a,this.view.height=n,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),i=(this.right+this.left)/2,r=(this.top+this.bottom)/2,a=i-e,n=i+e,s=r+t,o=r-t;if(this.view!==null&&this.view.enabled){let l=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;a+=l*this.view.offsetX,n=a+l*this.view.width,s-=h*this.view.offsetY,o=s-h*this.view.height}this.projectionMatrix.makeOrthographic(a,n,s,o,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}},Nl=class extends Dt{static{c(this,"uf")}constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}},Js="\\[\\]\\.:\\/",$s=RegExp("[\\[\\]\\.:\\/]","g"),Aa="[^\\[\\]\\.:\\/]",Qs="[^"+Js.replace("\\.","")+"]",eo="((?:WC+[\\/:])*)".replace("WC",Aa),to="(WCOD+)?".replace("WCOD",Qs),io="(?:\\.(WC+)(?:\\[(.+)\\])?)?".replace("WC",Aa),ro="\\.(WC+)(?:\\[(.+)\\])?".replace("WC",Aa),ao=RegExp("^"+eo+to+io+ro+"$"),no=["material","materials","bones","map"],so=class{static{c(this,"If")}constructor(e,t,i){let r=i||tt.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,r)}getValue(e,t){this.bind();let i=this._targetGroup.nCachedObjects_,r=this._bindings[i];r!==void 0&&r.getValue(e,t)}setValue(e,t){let i=this._bindings;for(let r=this._targetGroup.nCachedObjects_,a=i.length;r!==a;++r)i[r].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,i=e.length;t!==i;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,i=e.length;t!==i;++t)e[t].unbind()}},tt=class sr{static{c(this,"e")}constructor(t,i,r){this.path=i,this.parsedPath=r||sr.parseTrackName(i),this.node=sr.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,i,r){return t&&t.isAnimationObjectGroup?new sr.Composite(t,i,r):new sr(t,i,r)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace($s,"")}static parseTrackName(t){let i=ao.exec(t);if(i===null)throw Error("PropertyBinding: Cannot parse trackName: "+t);let r={nodeName:i[2],objectName:i[3],objectIndex:i[4],propertyName:i[5],propertyIndex:i[6]},a=r.nodeName&&r.nodeName.lastIndexOf(".");if(a!==void 0&&a!==-1){let n=r.nodeName.substring(a+1);no.indexOf(n)!==-1&&(r.nodeName=r.nodeName.substring(0,a),r.objectName=n)}if(r.propertyName===null||r.propertyName.length===0)throw Error("PropertyBinding: can not parse propertyName from trackName: "+t);return r}static findNode(t,i){if(i===void 0||i===""||i==="."||i===-1||i===t.name||i===t.uuid)return t;if(t.skeleton){let r=t.skeleton.getBoneByName(i);if(r!==void 0)return r}if(t.children){let r=c(function(n){for(let s=0;s<n.length;s++){let o=n[s];if(o.name===i||o.uuid===i)return o;let l=r(o.children);if(l)return l}return null},"n"),a=r(t.children);if(a)return a}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,i){t[i]=this.targetObject[this.propertyName]}_getValue_array(t,i){let r=this.resolvedProperty;for(let a=0,n=r.length;a!==n;++a)t[i++]=r[a]}_getValue_arrayElement(t,i){t[i]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,i){this.resolvedProperty.toArray(t,i)}_setValue_direct(t,i){this.targetObject[this.propertyName]=t[i]}_setValue_direct_setNeedsUpdate(t,i){this.targetObject[this.propertyName]=t[i],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,i){this.targetObject[this.propertyName]=t[i],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,i){let r=this.resolvedProperty;for(let a=0,n=r.length;a!==n;++a)r[a]=t[i++]}_setValue_array_setNeedsUpdate(t,i){let r=this.resolvedProperty;for(let a=0,n=r.length;a!==n;++a)r[a]=t[i++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,i){let r=this.resolvedProperty;for(let a=0,n=r.length;a!==n;++a)r[a]=t[i++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,i){this.resolvedProperty[this.propertyIndex]=t[i]}_setValue_arrayElement_setNeedsUpdate(t,i){this.resolvedProperty[this.propertyIndex]=t[i],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,i){this.resolvedProperty[this.propertyIndex]=t[i],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,i){this.resolvedProperty.fromArray(t,i)}_setValue_fromArray_setNeedsUpdate(t,i){this.resolvedProperty.fromArray(t,i),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,i){this.resolvedProperty.fromArray(t,i),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,i){this.bind(),this.getValue(t,i)}_setValue_unbound(t,i){this.bind(),this.setValue(t,i)}bind(){let t=this.node,i=this.parsedPath,r=i.objectName,a=i.propertyName,n=i.propertyIndex;if(t||(t=sr.findNode(this.rootNode,i.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){console.warn("THREE.PropertyBinding: No target node found for track: "+this.path+".");return}if(r){let h=i.objectIndex;switch(r){case"materials":if(!t.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let u=0;u<t.length;u++)if(t[u].name===h){h=u;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[r]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[r]}if(h!==void 0){if(t[h]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[h]}}let s=t[a];if(s===void 0){let h=i.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+h+"."+a+" but it wasn't found.",t);return}let o=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?o=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(n!==void 0){if(a==="morphTargetInfluences"){if(!t.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[n]!==void 0&&(n=t.morphTargetDictionary[n])}l=this.BindingType.ArrayElement,this.resolvedProperty=s,this.propertyIndex=n}else s.fromArray!==void 0&&s.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=s):Array.isArray(s)?(l=this.BindingType.EntireArray,this.resolvedProperty=s):this.propertyName=a;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}},tt.Composite=so,tt.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3},tt.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2},tt.prototype.GetterByBindingType=[tt.prototype._getValue_direct,tt.prototype._getValue_array,tt.prototype._getValue_arrayElement,tt.prototype._getValue_toArray],tt.prototype.SetterByBindingTypeAndVersioning=[[tt.prototype._setValue_direct,tt.prototype._setValue_direct_setNeedsUpdate,tt.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[tt.prototype._setValue_array,tt.prototype._setValue_array_setNeedsUpdate,tt.prototype._setValue_array_setMatrixWorldNeedsUpdate],[tt.prototype._setValue_arrayElement,tt.prototype._setValue_arrayElement_setNeedsUpdate,tt.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[tt.prototype._setValue_fromArray,tt.prototype._setValue_fromArray_setNeedsUpdate,tt.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]],Tn=new at,Yh=class{static{c(this,"Jf")}constructor(e,t,i=0,r=1/0){this.ray=new da(e,t),this.near=i,this.far=r,this.camera=null,this.layers=new Na,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(e,t){this.ray.set(e,t)}setFromCamera(e,t){t.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(e.x,e.y,.5).unproject(t).sub(this.ray.origin).normalize(),this.camera=t):t.isOrthographicCamera?(this.ray.origin.set(e.x,e.y,(t.near+t.far)/(t.near-t.far)).unproject(t),this.ray.direction.set(0,0,-1).transformDirection(t.matrixWorld),this.camera=t):console.error("THREE.Raycaster: Unsupported camera type: "+t.type)}setFromXRController(e){return Tn.identity().extractRotation(e.matrixWorld),this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(Tn),this}intersectObject(e,t=!0,i=[]){return Cn(e,this,i,t),i.sort(fs),i}intersectObjects(e,t=!0,i=[]){for(let r=0,a=e.length;r<a;r++)Cn(e[r],this,i,t);return i.sort(fs),i}},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"179"}})),typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="179")}))()}c(ql,"Vp");function oo(){let e=null,t=!1,i=null,r=null;function a(n,s){i(n,s),r=e.requestAnimationFrame(a)}return c(a,"i"),{start:c(function(){t!==!0&&i!==null&&(r=e.requestAnimationFrame(a),t=!0)},"start"),stop:c(function(){e.cancelAnimationFrame(r),t=!1},"stop"),setAnimationLoop:c(function(n){i=n},"setAnimationLoop"),setContext:c(function(n){e=n},"setContext")}}c(oo,"Up");function Kh(e){let t=new WeakMap;function i(o,l){let h=o.array,u=o.usage,d=h.byteLength,p=e.createBuffer();e.bindBuffer(l,p),e.bufferData(l,h,u),o.onUploadCallback();let g;if(h instanceof Float32Array)g=e.FLOAT;else if(typeof Float16Array<"u"&&h instanceof Float16Array)g=e.HALF_FLOAT;else if(h instanceof Uint16Array)g=o.isFloat16BufferAttribute?e.HALF_FLOAT:e.UNSIGNED_SHORT;else if(h instanceof Int16Array)g=e.SHORT;else if(h instanceof Uint32Array)g=e.UNSIGNED_INT;else if(h instanceof Int32Array)g=e.INT;else if(h instanceof Int8Array)g=e.BYTE;else if(h instanceof Uint8Array)g=e.UNSIGNED_BYTE;else if(h instanceof Uint8ClampedArray)g=e.UNSIGNED_BYTE;else throw Error("THREE.WebGLAttributes: Unsupported buffer data format: "+h);return{buffer:p,type:g,bytesPerElement:h.BYTES_PER_ELEMENT,version:o.version,size:d}}c(i,"n");function r(o,l,h){let u=l.array,d=l.updateRanges;if(e.bindBuffer(h,o),d.length===0)e.bufferSubData(h,0,u);else{d.sort((g,y)=>g.start-y.start);let p=0;for(let g=1;g<d.length;g++){let y=d[p],v=d[g];v.start<=y.start+y.count+1?y.count=Math.max(y.count,v.start+v.count-y.start):(++p,d[p]=v)}d.length=p+1;for(let g=0,y=d.length;g<y;g++){let v=d[g];e.bufferSubData(h,v.start*u.BYTES_PER_ELEMENT,u,v.start,v.count)}l.clearUpdateRanges()}l.onUploadCallback()}c(r,"r");function a(o){return o.isInterleavedBufferAttribute&&(o=o.data),t.get(o)}c(a,"i");function n(o){o.isInterleavedBufferAttribute&&(o=o.data);let l=t.get(o);l&&(e.deleteBuffer(l.buffer),t.delete(o))}c(n,"a");function s(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){let u=t.get(o);(!u||u.version<o.version)&&t.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}let h=t.get(o);if(h===void 0)t.set(o,i(o,l));else if(h.version<o.version){if(h.size!==o.array.byteLength)throw Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");r(h.buffer,o,l),h.version=o.version}}return c(s,"o"),{get:a,remove:n,update:s}}c(Kh,"Wp");function Zh(e,t,i,r,a,n,s){let o=new ze(0),l=n===!0?0:1,h,u,d=null,p=0,g=null;function y(S){let b=S.isScene===!0?S.background:null;return b&&b.isTexture&&(b=(S.backgroundBlurriness>0?i:t).get(b)),b}c(y,"m");function v(S){let b=!1,I=y(S);I===null?f(o,l):I&&I.isColor&&(f(I,1),b=!0);let L=e.xr.getEnvironmentBlendMode();L==="additive"?r.buffers.color.setClear(0,0,0,1,s):L==="alpha-blend"&&r.buffers.color.setClear(0,0,0,0,s),(e.autoClear||b)&&(r.buffers.depth.setTest(!0),r.buffers.depth.setMask(!0),r.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}c(v,"h");function m(S,b){let I=y(b);I&&(I.isCubeTexture||I.mapping===306)?(u===void 0&&(u=new Zt(new Xa(1,1,1),new si({name:"BackgroundCubeMaterial",uniforms:cr(zt.backgroundCube.uniforms),vertexShader:zt.backgroundCube.vertexShader,fragmentShader:zt.backgroundCube.fragmentShader,side:1,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),u.geometry.deleteAttribute("normal"),u.geometry.deleteAttribute("uv"),u.onBeforeRender=function(L,P,B){this.matrixWorld.copyPosition(B.matrixWorld)},Object.defineProperty(u.material,"envMap",{get:c(function(){return this.uniforms.envMap.value},"get")}),a.update(u)),mi.copy(b.backgroundRotation),mi.x*=-1,mi.y*=-1,mi.z*=-1,I.isCubeTexture&&I.isRenderTargetTexture===!1&&(mi.y*=-1,mi.z*=-1),u.material.uniforms.envMap.value=I,u.material.uniforms.flipEnvMap.value=I.isCubeTexture&&I.isRenderTargetTexture===!1?-1:1,u.material.uniforms.backgroundBlurriness.value=b.backgroundBlurriness,u.material.uniforms.backgroundIntensity.value=b.backgroundIntensity,u.material.uniforms.backgroundRotation.value.setFromMatrix4(Yl.makeRotationFromEuler(mi)),u.material.toneMapped=ke.getTransfer(I.colorSpace)!==Yr,(d!==I||p!==I.version||g!==e.toneMapping)&&(u.material.needsUpdate=!0,d=I,p=I.version,g=e.toneMapping),u.layers.enableAll(),S.unshift(u,u.geometry,u.material,0,0,null)):I&&I.isTexture&&(h===void 0&&(h=new Zt(new rs(2,2),new si({name:"BackgroundMaterial",uniforms:cr(zt.background.uniforms),vertexShader:zt.background.vertexShader,fragmentShader:zt.background.fragmentShader,side:0,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),h.geometry.deleteAttribute("normal"),Object.defineProperty(h.material,"map",{get:c(function(){return this.uniforms.t2D.value},"get")}),a.update(h)),h.material.uniforms.t2D.value=I,h.material.uniforms.backgroundIntensity.value=b.backgroundIntensity,h.material.toneMapped=ke.getTransfer(I.colorSpace)!==Yr,I.matrixAutoUpdate===!0&&I.updateMatrix(),h.material.uniforms.uvTransform.value.copy(I.matrix),(d!==I||p!==I.version||g!==e.toneMapping)&&(h.material.needsUpdate=!0,d=I,p=I.version,g=e.toneMapping),h.layers.enableAll(),S.unshift(h,h.geometry,h.material,0,0,null))}c(m,"g");function f(S,b){S.getRGB(Vr,Po(e)),r.buffers.color.setClear(Vr.r,Vr.g,Vr.b,b,s)}c(f,"_");function w(){u!==void 0&&(u.geometry.dispose(),u.material.dispose(),u=void 0),h!==void 0&&(h.geometry.dispose(),h.material.dispose(),h=void 0)}return c(w,"v"),{getClearColor:c(function(){return o},"getClearColor"),setClearColor:c(function(S,b=1){o.set(S),l=b,f(o,l)},"setClearColor"),getClearAlpha:c(function(){return l},"getClearAlpha"),setClearAlpha:c(function(S){l=S,f(o,l)},"setClearAlpha"),render:v,addToRenderList:m,dispose:w}}c(Zh,"Gp");function Jh(e,t){let i=e.getParameter(e.MAX_VERTEX_ATTRIBS),r={},a=p(null),n=a,s=!1;function o(M,C,V,H,k){let Z=!1,G=d(H,V,C);n!==G&&(n=G,h(n.object)),Z=g(M,H,V,k),Z&&y(M,H,V,k),k!==null&&t.update(k,e.ELEMENT_ARRAY_BUFFER),(Z||s)&&(s=!1,b(M,C,V,H),k!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,t.get(k).buffer))}c(o,"s");function l(){return e.createVertexArray()}c(l,"c");function h(M){return e.bindVertexArray(M)}c(h,"l");function u(M){return e.deleteVertexArray(M)}c(u,"u");function d(M,C,V){let H=V.wireframe===!0,k=r[M.id];k===void 0&&(k={},r[M.id]=k);let Z=k[C.id];Z===void 0&&(Z={},k[C.id]=Z);let G=Z[H];return G===void 0&&(G=p(l()),Z[H]=G),G}c(d,"d");function p(M){let C=[],V=[],H=[];for(let k=0;k<i;k++)C[k]=0,V[k]=0,H[k]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:C,enabledAttributes:V,attributeDivisors:H,object:M,attributes:{},index:null}}c(p,"f");function g(M,C,V,H){let k=n.attributes,Z=C.attributes,G=0,$=V.getAttributes();for(let j in $)if($[j].location>=0){let te=k[j],fe=Z[j];if(fe===void 0&&(j==="instanceMatrix"&&M.instanceMatrix&&(fe=M.instanceMatrix),j==="instanceColor"&&M.instanceColor&&(fe=M.instanceColor)),te===void 0||te.attribute!==fe||fe&&te.data!==fe.data)return!0;G++}return n.attributesNum!==G||n.index!==H}c(g,"p");function y(M,C,V,H){let k={},Z=C.attributes,G=0,$=V.getAttributes();for(let j in $)if($[j].location>=0){let te=Z[j];te===void 0&&(j==="instanceMatrix"&&M.instanceMatrix&&(te=M.instanceMatrix),j==="instanceColor"&&M.instanceColor&&(te=M.instanceColor));let fe={};fe.attribute=te,te&&te.data&&(fe.data=te.data),k[j]=fe,G++}n.attributes=k,n.attributesNum=G,n.index=H}c(y,"m");function v(){let M=n.newAttributes;for(let C=0,V=M.length;C<V;C++)M[C]=0}c(v,"h");function m(M){f(M,0)}c(m,"g");function f(M,C){let V=n.newAttributes,H=n.enabledAttributes,k=n.attributeDivisors;V[M]=1,H[M]===0&&(e.enableVertexAttribArray(M),H[M]=1),k[M]!==C&&(e.vertexAttribDivisor(M,C),k[M]=C)}c(f,"_");function w(){let M=n.newAttributes,C=n.enabledAttributes;for(let V=0,H=C.length;V<H;V++)C[V]!==M[V]&&(e.disableVertexAttribArray(V),C[V]=0)}c(w,"v");function S(M,C,V,H,k,Z,G){G===!0?e.vertexAttribIPointer(M,C,V,k,Z):e.vertexAttribPointer(M,C,V,H,k,Z)}c(S,"y");function b(M,C,V,H){v();let k=H.attributes,Z=V.getAttributes(),G=C.defaultAttributeValues;for(let $ in Z){let j=Z[$];if(j.location>=0){let te=k[$];if(te===void 0&&($==="instanceMatrix"&&M.instanceMatrix&&(te=M.instanceMatrix),$==="instanceColor"&&M.instanceColor&&(te=M.instanceColor)),te!==void 0){let fe=te.normalized,Ue=te.itemSize,He=t.get(te);if(He===void 0)continue;let Ze=He.buffer,W=He.type,re=He.bytesPerElement,Me=W===e.INT||W===e.UNSIGNED_INT||te.gpuType===1013;if(te.isInterleavedBufferAttribute){let ce=te.data,_e=ce.stride,Re=te.offset;if(ce.isInstancedInterleavedBuffer){for(let De=0;De<j.locationSize;De++)f(j.location+De,ce.meshPerAttribute);M.isInstancedMesh!==!0&&H._maxInstanceCount===void 0&&(H._maxInstanceCount=ce.meshPerAttribute*ce.count)}else for(let De=0;De<j.locationSize;De++)m(j.location+De);e.bindBuffer(e.ARRAY_BUFFER,Ze);for(let De=0;De<j.locationSize;De++)S(j.location+De,Ue/j.locationSize,W,fe,_e*re,(Re+Ue/j.locationSize*De)*re,Me)}else{if(te.isInstancedBufferAttribute){for(let ce=0;ce<j.locationSize;ce++)f(j.location+ce,te.meshPerAttribute);M.isInstancedMesh!==!0&&H._maxInstanceCount===void 0&&(H._maxInstanceCount=te.meshPerAttribute*te.count)}else for(let ce=0;ce<j.locationSize;ce++)m(j.location+ce);e.bindBuffer(e.ARRAY_BUFFER,Ze);for(let ce=0;ce<j.locationSize;ce++)S(j.location+ce,Ue/j.locationSize,W,fe,Ue*re,Ue/j.locationSize*ce*re,Me)}}else if(G!==void 0){let fe=G[$];if(fe!==void 0)switch(fe.length){case 2:e.vertexAttrib2fv(j.location,fe);break;case 3:e.vertexAttrib3fv(j.location,fe);break;case 4:e.vertexAttrib4fv(j.location,fe);break;default:e.vertexAttrib1fv(j.location,fe)}}}}w()}c(b,"b");function I(){B();for(let M in r){let C=r[M];for(let V in C){let H=C[V];for(let k in H)u(H[k].object),delete H[k];delete C[V]}delete r[M]}}c(I,"x");function L(M){if(r[M.id]===void 0)return;let C=r[M.id];for(let V in C){let H=C[V];for(let k in H)u(H[k].object),delete H[k];delete C[V]}delete r[M.id]}c(L,"S");function P(M){for(let C in r){let V=r[C];if(V[M.id]===void 0)continue;let H=V[M.id];for(let k in H)u(H[k].object),delete H[k];delete V[M.id]}}c(P,"C");function B(){E(),s=!0,n!==a&&(n=a,h(n.object))}c(B,"w");function E(){a.geometry=null,a.program=null,a.wireframe=!1}return c(E,"T"),{setup:o,reset:B,resetDefaultState:E,dispose:I,releaseStatesOfGeometry:L,releaseStatesOfProgram:P,initAttributes:v,enableAttribute:m,disableUnusedAttributes:w}}c(Jh,"Kp");function $h(e,t,i){let r;function a(h){r=h}c(a,"i");function n(h,u){e.drawArrays(r,h,u),i.update(u,r,1)}c(n,"a");function s(h,u,d){d!==0&&(e.drawArraysInstanced(r,h,u,d),i.update(u,r,d))}c(s,"o");function o(h,u,d){if(d===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(r,h,0,u,0,d);let p=0;for(let g=0;g<d;g++)p+=u[g];i.update(p,r,1)}c(o,"s");function l(h,u,d,p){if(d===0)return;let g=t.get("WEBGL_multi_draw");if(g===null)for(let y=0;y<h.length;y++)s(h[y],u[y],p[y]);else{g.multiDrawArraysInstancedWEBGL(r,h,0,u,0,p,0,d);let y=0;for(let v=0;v<d;v++)y+=u[v]*p[v];i.update(y,r,1)}}c(l,"c"),this.setMode=a,this.render=n,this.renderInstances=s,this.renderMultiDraw=o,this.renderMultiDrawInstances=l}c($h,"qp");function Qh(e,t,i,r){let a;function n(){if(a!==void 0)return a;if(t.has("EXT_texture_filter_anisotropic")===!0){let P=t.get("EXT_texture_filter_anisotropic");a=e.getParameter(P.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else a=0;return a}c(n,"a");function s(P){return P===1023||r.convert(P)===e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT)}c(s,"o");function o(P){let B=P===1016&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(P!==1009&&r.convert(P)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE)&&P!==1015&&!B)}c(o,"s");function l(P){if(P==="highp"){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return"highp";P="mediump"}return P==="mediump"&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}c(l,"c");let h=i.precision===void 0?"highp":i.precision,u=l(h);u!==h&&(console.warn("THREE.WebGLRenderer:",h,"not supported, using",u,"instead."),h=u);let d=i.logarithmicDepthBuffer===!0,p=i.reversedDepthBuffer===!0&&t.has("EXT_clip_control"),g=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),y=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),v=e.getParameter(e.MAX_TEXTURE_SIZE),m=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),f=e.getParameter(e.MAX_VERTEX_ATTRIBS),w=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),S=e.getParameter(e.MAX_VARYING_VECTORS),b=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),I=y>0,L=e.getParameter(e.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:n,getMaxPrecision:l,textureFormatReadable:s,textureTypeReadable:o,precision:h,logarithmicDepthBuffer:d,reversedDepthBuffer:p,maxTextures:g,maxVertexTextures:y,maxTextureSize:v,maxCubemapSize:m,maxAttributes:f,maxVertexUniforms:w,maxVaryings:S,maxFragmentUniforms:b,vertexTextures:I,maxSamples:L}}c(Qh,"Jp");function ec(e){let t=this,i=null,r=0,a=!1,n=!1,s=new fi,o=new Ne,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(d,p){let g=d.length!==0||p||r!==0||a;return a=p,r=d.length,g},this.beginShadows=function(){n=!0,u(null)},this.endShadows=function(){n=!1},this.setGlobalState=function(d,p){i=u(d,p,0)},this.setState=function(d,p,g){let y=d.clippingPlanes,v=d.clipIntersection,m=d.clipShadows,f=e.get(d);if(!a||y===null||y.length===0||n&&!m)n?u(null):h();else{let w=n?0:r,S=w*4,b=f.clippingState||null;l.value=b,b=u(y,p,S,g);for(let I=0;I!==S;++I)b[I]=i[I];f.clippingState=b,this.numIntersection=v?this.numPlanes:0,this.numPlanes+=w}};function h(){l.value!==i&&(l.value=i,l.needsUpdate=r>0),t.numPlanes=r,t.numIntersection=0}c(h,"l");function u(d,p,g,y){let v=d===null?0:d.length,m=null;if(v!==0){if(m=l.value,y!==!0||m===null){let f=g+v*4,w=p.matrixWorldInverse;o.getNormalMatrix(w),(m===null||m.length<f)&&(m=new Float32Array(f));for(let S=0,b=g;S!==v;++S,b+=4)s.copy(d[S]).applyMatrix4(w,o),s.normal.toArray(m,b),m[b+3]=s.constant}l.value=m,l.needsUpdate=!0}return t.numPlanes=v,t.numIntersection=0,m}c(u,"u")}c(ec,"Yp");function tc(e){let t=new WeakMap;function i(s,o){return o===303?s.mapping=301:o===304&&(s.mapping=302),s}c(i,"n");function r(s){if(s&&s.isTexture){let o=s.mapping;if(o===303||o===304){if(t.has(s)){let l=t.get(s).texture;return i(l,s.mapping)}{let l=s.image;if(l&&l.height>0){let h=new Ll(l.height);return h.fromEquirectangularTexture(e,s),t.set(s,h),s.addEventListener("dispose",a),i(h.texture,s.mapping)}return null}}}return s}c(r,"r");function a(s){let o=s.target;o.removeEventListener("dispose",a);let l=t.get(o);l!==void 0&&(t.delete(o),l.dispose())}c(a,"i");function n(){t=new WeakMap}return c(n,"a"),{get:r,dispose:n}}c(tc,"Xp");function ic(e){let t=[],i=[],r=[],a=e,n=e-ki+1+Xn.length;for(let s=0;s<n;s++){let o=2**a;i.push(o);let l=1/o;s>e-ki?l=Xn[s-e+ki-1]:s===0&&(l=0),r.push(l);let h=1/(o-2),u=-h,d=1+h,p=[u,u,d,u,d,d,u,u,d,d,u,d],g=new Float32Array(108),y=new Float32Array(72),v=new Float32Array(36);for(let f=0;f<6;f++){let w=f%3*2/3-1,S=f>2?0:-1,b=[w,S,0,w+2/3,S,0,w+2/3,S+1,0,w,S,0,w+2/3,S+1,0,w,S+1,0];g.set(b,18*f),y.set(p,12*f);let I=[f,f,f,f,f,f];v.set(I,6*f)}let m=new Yt;m.setAttribute("position",new Ut(g,3)),m.setAttribute("uv",new Ut(y,2)),m.setAttribute("faceIndex",new Ut(v,1)),t.push(m),a>ki&&a--}return{lodPlanes:t,sizeLods:i,sigmas:r}}c(ic,"Zp");function lo(e,t,i){let r=new vi(e,t,i);return r.texture.mapping=306,r.texture.name="PMREM.cubeUv",r.scissorTest=!0,r}c(lo,"Qp");function wa(e,t,i,r,a){e.viewport.set(t,i,r,a),e.scissor.set(t,i,r,a)}c(wa,"$p");function rc(e,t,i){let r=new Float32Array(Vi),a=new O(0,1,0);return new si({name:"SphericalGaussianBlur",defines:{n:Vi,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/i,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:r},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:a}},vertexShader:as(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}c(rc,"em");function ho(){return new si({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:as(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}c(ho,"tm");function co(){return new si({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:as(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}c(co,"nm");function as(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}c(as,"rm");function ac(e){let t=new WeakMap,i=null;function r(o){if(o&&o.isTexture){let l=o.mapping,h=l===303||l===304,u=l===301||l===302;if(h||u){let d=t.get(o),p=d===void 0?0:d.texture.pmremVersion;if(o.isRenderTargetTexture&&o.pmremVersion!==p)return i===null&&(i=new jn(e)),d=h?i.fromEquirectangular(o,d):i.fromCubemap(o,d),d.texture.pmremVersion=o.pmremVersion,t.set(o,d),d.texture;if(d!==void 0)return d.texture;{let g=o.image;return h&&g&&g.height>0||u&&g&&a(g)?(i===null&&(i=new jn(e)),d=h?i.fromEquirectangular(o):i.fromCubemap(o),d.texture.pmremVersion=o.pmremVersion,t.set(o,d),o.addEventListener("dispose",n),d.texture):null}}}return o}c(r,"r");function a(o){let l=0;for(let h=0;h<6;h++)o[h]!==void 0&&l++;return l===6}c(a,"i");function n(o){let l=o.target;l.removeEventListener("dispose",n);let h=t.get(l);h!==void 0&&(t.delete(l),h.dispose())}c(n,"a");function s(){t=new WeakMap,i!==null&&(i.dispose(),i=null)}return c(s,"o"),{get:r,dispose:s}}c(ac,"im");function nc(e){let t={};function i(r){if(t[r]!==void 0)return t[r];let a;switch(r){case"WEBGL_depth_texture":a=e.getExtension("WEBGL_depth_texture")||e.getExtension("MOZ_WEBGL_depth_texture")||e.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":a=e.getExtension("EXT_texture_filter_anisotropic")||e.getExtension("MOZ_EXT_texture_filter_anisotropic")||e.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":a=e.getExtension("WEBGL_compressed_texture_s3tc")||e.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||e.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":a=e.getExtension("WEBGL_compressed_texture_pvrtc")||e.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:a=e.getExtension(r)}return t[r]=a,a}return c(i,"n"),{has:c(function(r){return i(r)!==null},"has"),init:c(function(){i("EXT_color_buffer_float"),i("WEBGL_clip_cull_distance"),i("OES_texture_float_linear"),i("EXT_color_buffer_half_float"),i("WEBGL_multisampled_render_to_texture"),i("WEBGL_render_shared_exponent")},"init"),get:c(function(r){let a=i(r);return a===null&&lr("THREE.WebGLRenderer: "+r+" extension not supported."),a},"get")}}c(nc,"am");function sc(e,t,i,r){let a={},n=new WeakMap;function s(d){let p=d.target;p.index!==null&&t.remove(p.index);for(let y in p.attributes)t.remove(p.attributes[y]);p.removeEventListener("dispose",s),delete a[p.id];let g=n.get(p);g&&(t.remove(g),n.delete(p)),r.releaseStatesOfGeometry(p),p.isInstancedBufferGeometry===!0&&delete p._maxInstanceCount,i.memory.geometries--}c(s,"o");function o(d,p){return a[p.id]===!0||(p.addEventListener("dispose",s),a[p.id]=!0,i.memory.geometries++),p}c(o,"s");function l(d){let p=d.attributes;for(let g in p)t.update(p[g],e.ARRAY_BUFFER)}c(l,"c");function h(d){let p=[],g=d.index,y=d.attributes.position,v=0;if(g!==null){let w=g.array;v=g.version;for(let S=0,b=w.length;S<b;S+=3){let I=w[S+0],L=w[S+1],P=w[S+2];p.push(I,L,L,P,P,I)}}else if(y!==void 0){let w=y.array;v=y.version;for(let S=0,b=w.length/3-1;S<b;S+=3){let I=S+0,L=S+1,P=S+2;p.push(I,L,L,P,P,I)}}else return;let m=new(Co(p)?Fn:On)(p,1);m.version=v;let f=n.get(d);f&&t.remove(f),n.set(d,m)}c(h,"l");function u(d){let p=n.get(d);if(p){let g=d.index;g!==null&&p.version<g.version&&h(d)}else h(d);return n.get(d)}return c(u,"u"),{get:o,update:l,getWireframeAttribute:u}}c(sc,"om");function oc(e,t,i){let r;function a(p){r=p}c(a,"i");let n,s;function o(p){n=p.type,s=p.bytesPerElement}c(o,"s");function l(p,g){e.drawElements(r,g,n,p*s),i.update(g,r,1)}c(l,"c");function h(p,g,y){y!==0&&(e.drawElementsInstanced(r,g,n,p*s,y),i.update(g,r,y))}c(h,"l");function u(p,g,y){if(y===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(r,g,0,n,p,0,y);let v=0;for(let m=0;m<y;m++)v+=g[m];i.update(v,r,1)}c(u,"u");function d(p,g,y,v){if(y===0)return;let m=t.get("WEBGL_multi_draw");if(m===null)for(let f=0;f<p.length;f++)h(p[f]/s,g[f],v[f]);else{m.multiDrawElementsInstancedWEBGL(r,g,0,n,p,0,v,0,y);let f=0;for(let w=0;w<y;w++)f+=g[w]*v[w];i.update(f,r,1)}}c(d,"d"),this.setMode=a,this.setIndex=o,this.render=l,this.renderInstances=h,this.renderMultiDraw=u,this.renderMultiDrawInstances=d}c(oc,"sm");function lc(e){let t={geometries:0,textures:0},i={frame:0,calls:0,triangles:0,points:0,lines:0};function r(n,s,o){switch(i.calls++,s){case e.TRIANGLES:i.triangles+=n/3*o;break;case e.LINES:i.lines+=n/2*o;break;case e.LINE_STRIP:i.lines+=o*(n-1);break;case e.LINE_LOOP:i.lines+=o*n;break;case e.POINTS:i.points+=o*n;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",s)}}c(r,"r");function a(){i.calls=0,i.triangles=0,i.points=0,i.lines=0}return c(a,"i"),{memory:t,render:i,programs:null,autoReset:!0,reset:a,update:r}}c(lc,"cm");function hc(e,t,i){let r=new WeakMap,a=new nt;function n(s,o,l){let h=s.morphTargetInfluences,u=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,d=u===void 0?0:u.length,p=r.get(o);if(p===void 0||p.count!==d){let E=function(){P.dispose(),r.delete(o),o.removeEventListener("dispose",E)};c(E,"v"),p!==void 0&&p.texture.dispose();let g=o.morphAttributes.position!==void 0,y=o.morphAttributes.normal!==void 0,v=o.morphAttributes.color!==void 0,m=o.morphAttributes.position||[],f=o.morphAttributes.normal||[],w=o.morphAttributes.color||[],S=0;g===!0&&(S=1),y===!0&&(S=2),v===!0&&(S=3);let b=o.attributes.position.count*S,I=1;b>t.maxTextureSize&&(I=Math.ceil(b/t.maxTextureSize),b=t.maxTextureSize);let L=new Float32Array(b*I*4*d),P=new ts(L,b,I,d);P.type=Ga,P.needsUpdate=!0;let B=S*4;for(let M=0;M<d;M++){let C=m[M],V=f[M],H=w[M],k=b*I*4*M;for(let Z=0;Z<C.count;Z++){let G=Z*B;g===!0&&(a.fromBufferAttribute(C,Z),L[k+G+0]=a.x,L[k+G+1]=a.y,L[k+G+2]=a.z,L[k+G+3]=0),y===!0&&(a.fromBufferAttribute(V,Z),L[k+G+4]=a.x,L[k+G+5]=a.y,L[k+G+6]=a.z,L[k+G+7]=0),v===!0&&(a.fromBufferAttribute(H,Z),L[k+G+8]=a.x,L[k+G+9]=a.y,L[k+G+10]=a.z,L[k+G+11]=H.itemSize===4?a.w:1)}}p={count:d,texture:P,size:new Be(b,I)},r.set(o,p),o.addEventListener("dispose",E)}if(s.isInstancedMesh===!0&&s.morphTexture!==null)l.getUniforms().setValue(e,"morphTexture",s.morphTexture,i);else{let g=0;for(let v=0;v<h.length;v++)g+=h[v];let y=o.morphTargetsRelative?1:1-g;l.getUniforms().setValue(e,"morphTargetBaseInfluence",y),l.getUniforms().setValue(e,"morphTargetInfluences",h)}l.getUniforms().setValue(e,"morphTargetsTexture",p.texture,i),l.getUniforms().setValue(e,"morphTargetsTextureSize",p.size)}return c(n,"a"),{update:n}}c(hc,"lm");function cc(e,t,i,r){let a=new WeakMap;function n(l){let h=r.render.frame,u=l.geometry,d=t.get(l,u);if(a.get(d)!==h&&(t.update(d),a.set(d,h)),l.isInstancedMesh&&(l.hasEventListener("dispose",o)===!1&&l.addEventListener("dispose",o),a.get(l)!==h&&(i.update(l.instanceMatrix,e.ARRAY_BUFFER),l.instanceColor!==null&&i.update(l.instanceColor,e.ARRAY_BUFFER),a.set(l,h))),l.isSkinnedMesh){let p=l.skeleton;a.get(p)!==h&&(p.update(),a.set(p,h))}return d}c(n,"a");function s(){a=new WeakMap}c(s,"o");function o(l){let h=l.target;h.removeEventListener("dispose",o),i.remove(h.instanceMatrix),h.instanceColor!==null&&i.remove(h.instanceColor)}return c(o,"s"),{update:n,dispose:s}}c(cc,"um");function fr(e,t,i){let r=e[0];if(r<=0||r>0)return e;let a=t*i,n=Yn[a];if(n===void 0&&(n=new Float32Array(a),Yn[a]=n),t!==0){r.toArray(n,0);for(let s=1,o=0;s!==t;++s)o+=i,e[s].toArray(n,o)}return n}c(fr,"dm");function lt(e,t){if(e.length!==t.length)return!1;for(let i=0,r=e.length;i<r;i++)if(e[i]!==t[i])return!1;return!0}c(lt,"fm");function ht(e,t){for(let i=0,r=t.length;i<r;i++)e[i]=t[i]}c(ht,"pm");function ja(e,t){let i=Kn[t];i===void 0&&(i=new Int32Array(t),Kn[t]=i);for(let r=0;r!==t;++r)i[r]=e.allocateTextureUnit();return i}c(ja,"mm");function uc(e,t){let i=this.cache;i[0]!==t&&(e.uniform1f(this.addr,t),i[0]=t)}c(uc,"hm");function dc(e,t){let i=this.cache;if(t.x!==void 0)(i[0]!==t.x||i[1]!==t.y)&&(e.uniform2f(this.addr,t.x,t.y),i[0]=t.x,i[1]=t.y);else{if(lt(i,t))return;e.uniform2fv(this.addr,t),ht(i,t)}}c(dc,"gm");function pc(e,t){let i=this.cache;if(t.x!==void 0)(i[0]!==t.x||i[1]!==t.y||i[2]!==t.z)&&(e.uniform3f(this.addr,t.x,t.y,t.z),i[0]=t.x,i[1]=t.y,i[2]=t.z);else if(t.r!==void 0)(i[0]!==t.r||i[1]!==t.g||i[2]!==t.b)&&(e.uniform3f(this.addr,t.r,t.g,t.b),i[0]=t.r,i[1]=t.g,i[2]=t.b);else{if(lt(i,t))return;e.uniform3fv(this.addr,t),ht(i,t)}}c(pc,"_m");function fc(e,t){let i=this.cache;if(t.x!==void 0)(i[0]!==t.x||i[1]!==t.y||i[2]!==t.z||i[3]!==t.w)&&(e.uniform4f(this.addr,t.x,t.y,t.z,t.w),i[0]=t.x,i[1]=t.y,i[2]=t.z,i[3]=t.w);else{if(lt(i,t))return;e.uniform4fv(this.addr,t),ht(i,t)}}c(fc,"vm");function mc(e,t){let i=this.cache,r=t.elements;if(r===void 0){if(lt(i,t))return;e.uniformMatrix2fv(this.addr,!1,t),ht(i,t)}else{if(lt(i,r))return;$n.set(r),e.uniformMatrix2fv(this.addr,!1,$n),ht(i,r)}}c(mc,"ym");function gc(e,t){let i=this.cache,r=t.elements;if(r===void 0){if(lt(i,t))return;e.uniformMatrix3fv(this.addr,!1,t),ht(i,t)}else{if(lt(i,r))return;Jn.set(r),e.uniformMatrix3fv(this.addr,!1,Jn),ht(i,r)}}c(gc,"bm");function _c(e,t){let i=this.cache,r=t.elements;if(r===void 0){if(lt(i,t))return;e.uniformMatrix4fv(this.addr,!1,t),ht(i,t)}else{if(lt(i,r))return;Zn.set(r),e.uniformMatrix4fv(this.addr,!1,Zn),ht(i,r)}}c(_c,"xm");function vc(e,t){let i=this.cache;i[0]!==t&&(e.uniform1i(this.addr,t),i[0]=t)}c(vc,"Sm");function xc(e,t){let i=this.cache;if(t.x!==void 0)(i[0]!==t.x||i[1]!==t.y)&&(e.uniform2i(this.addr,t.x,t.y),i[0]=t.x,i[1]=t.y);else{if(lt(i,t))return;e.uniform2iv(this.addr,t),ht(i,t)}}c(xc,"Cm");function Mc(e,t){let i=this.cache;if(t.x!==void 0)(i[0]!==t.x||i[1]!==t.y||i[2]!==t.z)&&(e.uniform3i(this.addr,t.x,t.y,t.z),i[0]=t.x,i[1]=t.y,i[2]=t.z);else{if(lt(i,t))return;e.uniform3iv(this.addr,t),ht(i,t)}}c(Mc,"wm");function yc(e,t){let i=this.cache;if(t.x!==void 0)(i[0]!==t.x||i[1]!==t.y||i[2]!==t.z||i[3]!==t.w)&&(e.uniform4i(this.addr,t.x,t.y,t.z,t.w),i[0]=t.x,i[1]=t.y,i[2]=t.z,i[3]=t.w);else{if(lt(i,t))return;e.uniform4iv(this.addr,t),ht(i,t)}}c(yc,"Tm");function Sc(e,t){let i=this.cache;i[0]!==t&&(e.uniform1ui(this.addr,t),i[0]=t)}c(Sc,"Em");function Ec(e,t){let i=this.cache;if(t.x!==void 0)(i[0]!==t.x||i[1]!==t.y)&&(e.uniform2ui(this.addr,t.x,t.y),i[0]=t.x,i[1]=t.y);else{if(lt(i,t))return;e.uniform2uiv(this.addr,t),ht(i,t)}}c(Ec,"Dm");function Tc(e,t){let i=this.cache;if(t.x!==void 0)(i[0]!==t.x||i[1]!==t.y||i[2]!==t.z)&&(e.uniform3ui(this.addr,t.x,t.y,t.z),i[0]=t.x,i[1]=t.y,i[2]=t.z);else{if(lt(i,t))return;e.uniform3uiv(this.addr,t),ht(i,t)}}c(Tc,"Om");function bc(e,t){let i=this.cache;if(t.x!==void 0)(i[0]!==t.x||i[1]!==t.y||i[2]!==t.z||i[3]!==t.w)&&(e.uniform4ui(this.addr,t.x,t.y,t.z,t.w),i[0]=t.x,i[1]=t.y,i[2]=t.z,i[3]=t.w);else{if(lt(i,t))return;e.uniform4uiv(this.addr,t),ht(i,t)}}c(bc,"km");function Ac(e,t,i){let r=this.cache,a=i.allocateTextureUnit();r[0]!==a&&(e.uniform1i(this.addr,a),r[0]=a);let n;this.type===e.SAMPLER_2D_SHADOW?(qn.compareFunction=515,n=qn):n=ns,i.setTexture2D(t||n,a)}c(Ac,"Am");function wc(e,t,i){let r=this.cache,a=i.allocateTextureUnit();r[0]!==a&&(e.uniform1i(this.addr,a),r[0]=a),i.setTexture3D(t||os,a)}c(wc,"jm");function Rc(e,t,i){let r=this.cache,a=i.allocateTextureUnit();r[0]!==a&&(e.uniform1i(this.addr,a),r[0]=a),i.setTextureCube(t||ls,a)}c(Rc,"Mm");function Cc(e,t,i){let r=this.cache,a=i.allocateTextureUnit();r[0]!==a&&(e.uniform1i(this.addr,a),r[0]=a),i.setTexture2DArray(t||ss,a)}c(Cc,"Nm");function Pc(e){switch(e){case 5126:return uc;case 35664:return dc;case 35665:return pc;case 35666:return fc;case 35674:return mc;case 35675:return gc;case 35676:return _c;case 5124:case 35670:return vc;case 35667:case 35671:return xc;case 35668:case 35672:return Mc;case 35669:case 35673:return yc;case 5125:return Sc;case 36294:return Ec;case 36295:return Tc;case 36296:return bc;case 35678:case 36198:case 36298:case 36306:case 35682:return Ac;case 35679:case 36299:case 36307:return wc;case 35680:case 36300:case 36308:case 36293:return Rc;case 36289:case 36303:case 36311:case 36292:return Cc}}c(Pc,"Pm");function Lc(e,t){e.uniform1fv(this.addr,t)}c(Lc,"Fm");function Uc(e,t){let i=fr(t,this.size,2);e.uniform2fv(this.addr,i)}c(Uc,"Im");function Dc(e,t){let i=fr(t,this.size,3);e.uniform3fv(this.addr,i)}c(Dc,"Lm");function Ic(e,t){let i=fr(t,this.size,4);e.uniform4fv(this.addr,i)}c(Ic,"Rm");function Nc(e,t){let i=fr(t,this.size,4);e.uniformMatrix2fv(this.addr,!1,i)}c(Nc,"zm");function Oc(e,t){let i=fr(t,this.size,9);e.uniformMatrix3fv(this.addr,!1,i)}c(Oc,"Bm");function Fc(e,t){let i=fr(t,this.size,16);e.uniformMatrix4fv(this.addr,!1,i)}c(Fc,"Vm");function Bc(e,t){e.uniform1iv(this.addr,t)}c(Bc,"Hm");function zc(e,t){e.uniform2iv(this.addr,t)}c(zc,"Um");function Hc(e,t){e.uniform3iv(this.addr,t)}c(Hc,"Wm");function Vc(e,t){e.uniform4iv(this.addr,t)}c(Vc,"Gm");function kc(e,t){e.uniform1uiv(this.addr,t)}c(kc,"Km");function Gc(e,t){e.uniform2uiv(this.addr,t)}c(Gc,"qm");function Wc(e,t){e.uniform3uiv(this.addr,t)}c(Wc,"Jm");function Xc(e,t){e.uniform4uiv(this.addr,t)}c(Xc,"Ym");function jc(e,t,i){let r=this.cache,a=t.length,n=ja(i,a);lt(r,n)||(e.uniform1iv(this.addr,n),ht(r,n));for(let s=0;s!==a;++s)i.setTexture2D(t[s]||ns,n[s])}c(jc,"Xm");function qc(e,t,i){let r=this.cache,a=t.length,n=ja(i,a);lt(r,n)||(e.uniform1iv(this.addr,n),ht(r,n));for(let s=0;s!==a;++s)i.setTexture3D(t[s]||os,n[s])}c(qc,"Zm");function Yc(e,t,i){let r=this.cache,a=t.length,n=ja(i,a);lt(r,n)||(e.uniform1iv(this.addr,n),ht(r,n));for(let s=0;s!==a;++s)i.setTextureCube(t[s]||ls,n[s])}c(Yc,"Qm");function Kc(e,t,i){let r=this.cache,a=t.length,n=ja(i,a);lt(r,n)||(e.uniform1iv(this.addr,n),ht(r,n));for(let s=0;s!==a;++s)i.setTexture2DArray(t[s]||ss,n[s])}c(Kc,"$m");function Zc(e){switch(e){case 5126:return Lc;case 35664:return Uc;case 35665:return Dc;case 35666:return Ic;case 35674:return Nc;case 35675:return Oc;case 35676:return Fc;case 5124:case 35670:return Bc;case 35667:case 35671:return zc;case 35668:case 35672:return Hc;case 35669:case 35673:return Vc;case 5125:return kc;case 36294:return Gc;case 36295:return Wc;case 36296:return Xc;case 35678:case 36198:case 36298:case 36306:case 35682:return jc;case 35679:case 36299:case 36307:return qc;case 35680:case 36300:case 36308:case 36293:return Yc;case 36289:case 36303:case 36311:case 36292:return Kc}}c(Zc,"eh");function uo(e,t){e.seq.push(t),e.map[t.id]=t}c(uo,"th");function Jc(e,t,i){let r=e.name,a=r.length;for(Ha.lastIndex=0;;){let n=Ha.exec(r),s=Ha.lastIndex,o=n[1],l=n[2]==="]",h=n[3];if(l&&(o|=0),h===void 0||h==="["&&s+2===a){uo(i,h===void 0?new Kl(o,e,t):new Zl(o,e,t));break}{let u=i.map[o];u===void 0&&(u=new Jl(o),uo(i,u)),i=u}}}c(Jc,"nh");function po(e,t,i){let r=e.createShader(t);return e.shaderSource(r,i),e.compileShader(r),r}c(po,"rh");function $c(e,t){let i=e.split(`
`),r=[],a=Math.max(t-6,0),n=Math.min(t+6,i.length);for(let s=a;s<n;s++){let o=s+1;r.push(`${o===t?">":" "} ${o}: ${i[s]}`)}return r.join(`
`)}c($c,"ih");function Qc(e){ke._getMatrix(Qn,ke.workingColorSpace,e);let t=`mat3( ${Qn.elements.map(i=>i.toFixed(4))} )`;switch(ke.getTransfer(e)){case qr:return[t,"LinearTransferOETF"];case Yr:return[t,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space: ",e),[t,"LinearTransferOETF"]}}c(Qc,"ah");function fo(e,t,i){let r=e.getShaderParameter(t,e.COMPILE_STATUS),a=(e.getShaderInfoLog(t)||"").trim();if(r&&a==="")return"";let n=/ERROR: 0:(\d+)/.exec(a);if(n){let s=parseInt(n[1]);return i.toUpperCase()+`

`+a+`

`+$c(e.getShaderSource(t),s)}return a}c(fo,"oh");function eu(e,t){let i=Qc(t);return[`vec4 ${e}( vec4 value ) {`,`	return ${i[1]}( vec4( value.rgb * ${i[0]}, value.a ) );`,"}"].join(`
`)}c(eu,"sh");function tu(e,t){let i;switch(t){case 1:i="Linear";break;case 2:i="Reinhard";break;case 3:i="Cineon";break;case 4:i="ACESFilmic";break;case 6:i="AgX";break;case 7:i="Neutral";break;case 5:i="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",t),i="Linear"}return"vec3 "+e+"( vec3 color ) { return "+i+"ToneMapping( color ); }"}c(tu,"ch");function iu(){return ke.getLuminanceCoefficients(Gr),["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${Gr.x.toFixed(4)}, ${Gr.y.toFixed(4)}, ${Gr.z.toFixed(4)} );`,"	return dot( weights, rgb );","}"].join(`
`)}c(iu,"lh");function ru(e){return[e.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",e.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Hr).join(`
`)}c(ru,"uh");function au(e){let t=[];for(let i in e){let r=e[i];r!==!1&&t.push("#define "+i+" "+r)}return t.join(`
`)}c(au,"dh");function nu(e,t){let i={},r=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES);for(let a=0;a<r;a++){let n=e.getActiveAttrib(t,a),s=n.name,o=1;n.type===e.FLOAT_MAT2&&(o=2),n.type===e.FLOAT_MAT3&&(o=3),n.type===e.FLOAT_MAT4&&(o=4),i[s]={type:n.type,location:e.getAttribLocation(t,s),locationSize:o}}return i}c(nu,"fh");function Hr(e){return e!==""}c(Hr,"ph");function mo(e,t){let i=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return e.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,i).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}c(mo,"mh");function go(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}c(go,"hh");function Wn(e){return e.replace(eh,su)}c(Wn,"gh");function su(e,t){let i=Ie[t];if(i===void 0){let r=th.get(t);if(r!==void 0)i=Ie[r],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,r);else throw Error("Can not resolve #include <"+t+">")}return Wn(i)}c(su,"_h");function _o(e){return e.replace(ih,ou)}c(_o,"vh");function ou(e,t,i,r){let a="";for(let n=parseInt(t);n<parseInt(i);n++)a+=r.replace(/\[\s*i\s*\]/g,"[ "+n+" ]").replace(/UNROLLED_LOOP_INDEX/g,n);return a}c(ou,"yh");function vo(e){let t=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;return e.precision==="highp"?t+=`
#define HIGH_PRECISION`:e.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:e.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}c(vo,"bh");function lu(e){let t="SHADOWMAP_TYPE_BASIC";return e.shadowMapType===1?t="SHADOWMAP_TYPE_PCF":e.shadowMapType===2?t="SHADOWMAP_TYPE_PCF_SOFT":e.shadowMapType===3&&(t="SHADOWMAP_TYPE_VSM"),t}c(lu,"xh");function hu(e){let t="ENVMAP_TYPE_CUBE";if(e.envMap)switch(e.envMapMode){case 301:case 302:t="ENVMAP_TYPE_CUBE";break;case 306:t="ENVMAP_TYPE_CUBE_UV"}return t}c(hu,"Sh");function cu(e){let t="ENVMAP_MODE_REFLECTION";if(e.envMap)switch(e.envMapMode){case 302:t="ENVMAP_MODE_REFRACTION"}return t}c(cu,"Ch");function uu(e){let t="ENVMAP_BLENDING_NONE";if(e.envMap)switch(e.combine){case 0:t="ENVMAP_BLENDING_MULTIPLY";break;case 1:t="ENVMAP_BLENDING_MIX";break;case 2:t="ENVMAP_BLENDING_ADD"}return t}c(uu,"wh");function du(e){let t=e.envMapCubeUVHeight;if(t===null)return null;let i=Math.log2(t)-2,r=1/t;return{texelWidth:1/(3*Math.max(2**i,112)),texelHeight:r,maxMip:i}}c(du,"Th");function pu(e,t,i,r){let a=e.getContext(),n=i.defines,s=i.vertexShader,o=i.fragmentShader,l=lu(i),h=hu(i),u=cu(i),d=uu(i),p=du(i),g=ru(i),y=au(n),v=a.createProgram(),m,f,w=i.glslVersion?"#version "+i.glslVersion+`
`:"";i.isRawShaderMaterial?(m=["#define SHADER_TYPE "+i.shaderType,"#define SHADER_NAME "+i.shaderName,y].filter(Hr).join(`
`),m.length>0&&(m+=`
`),f=["#define SHADER_TYPE "+i.shaderType,"#define SHADER_NAME "+i.shaderName,y].filter(Hr).join(`
`),f.length>0&&(f+=`
`)):(m=[vo(i),"#define SHADER_TYPE "+i.shaderType,"#define SHADER_NAME "+i.shaderName,y,i.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",i.batching?"#define USE_BATCHING":"",i.batchingColor?"#define USE_BATCHING_COLOR":"",i.instancing?"#define USE_INSTANCING":"",i.instancingColor?"#define USE_INSTANCING_COLOR":"",i.instancingMorph?"#define USE_INSTANCING_MORPH":"",i.useFog&&i.fog?"#define USE_FOG":"",i.useFog&&i.fogExp2?"#define FOG_EXP2":"",i.map?"#define USE_MAP":"",i.envMap?"#define USE_ENVMAP":"",i.envMap?"#define "+u:"",i.lightMap?"#define USE_LIGHTMAP":"",i.aoMap?"#define USE_AOMAP":"",i.bumpMap?"#define USE_BUMPMAP":"",i.normalMap?"#define USE_NORMALMAP":"",i.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",i.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",i.displacementMap?"#define USE_DISPLACEMENTMAP":"",i.emissiveMap?"#define USE_EMISSIVEMAP":"",i.anisotropy?"#define USE_ANISOTROPY":"",i.anisotropyMap?"#define USE_ANISOTROPYMAP":"",i.clearcoatMap?"#define USE_CLEARCOATMAP":"",i.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",i.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",i.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",i.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",i.specularMap?"#define USE_SPECULARMAP":"",i.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",i.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",i.roughnessMap?"#define USE_ROUGHNESSMAP":"",i.metalnessMap?"#define USE_METALNESSMAP":"",i.alphaMap?"#define USE_ALPHAMAP":"",i.alphaHash?"#define USE_ALPHAHASH":"",i.transmission?"#define USE_TRANSMISSION":"",i.transmissionMap?"#define USE_TRANSMISSIONMAP":"",i.thicknessMap?"#define USE_THICKNESSMAP":"",i.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",i.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",i.mapUv?"#define MAP_UV "+i.mapUv:"",i.alphaMapUv?"#define ALPHAMAP_UV "+i.alphaMapUv:"",i.lightMapUv?"#define LIGHTMAP_UV "+i.lightMapUv:"",i.aoMapUv?"#define AOMAP_UV "+i.aoMapUv:"",i.emissiveMapUv?"#define EMISSIVEMAP_UV "+i.emissiveMapUv:"",i.bumpMapUv?"#define BUMPMAP_UV "+i.bumpMapUv:"",i.normalMapUv?"#define NORMALMAP_UV "+i.normalMapUv:"",i.displacementMapUv?"#define DISPLACEMENTMAP_UV "+i.displacementMapUv:"",i.metalnessMapUv?"#define METALNESSMAP_UV "+i.metalnessMapUv:"",i.roughnessMapUv?"#define ROUGHNESSMAP_UV "+i.roughnessMapUv:"",i.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+i.anisotropyMapUv:"",i.clearcoatMapUv?"#define CLEARCOATMAP_UV "+i.clearcoatMapUv:"",i.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+i.clearcoatNormalMapUv:"",i.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+i.clearcoatRoughnessMapUv:"",i.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+i.iridescenceMapUv:"",i.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+i.iridescenceThicknessMapUv:"",i.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+i.sheenColorMapUv:"",i.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+i.sheenRoughnessMapUv:"",i.specularMapUv?"#define SPECULARMAP_UV "+i.specularMapUv:"",i.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+i.specularColorMapUv:"",i.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+i.specularIntensityMapUv:"",i.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+i.transmissionMapUv:"",i.thicknessMapUv?"#define THICKNESSMAP_UV "+i.thicknessMapUv:"",i.vertexTangents&&i.flatShading===!1?"#define USE_TANGENT":"",i.vertexColors?"#define USE_COLOR":"",i.vertexAlphas?"#define USE_COLOR_ALPHA":"",i.vertexUv1s?"#define USE_UV1":"",i.vertexUv2s?"#define USE_UV2":"",i.vertexUv3s?"#define USE_UV3":"",i.pointsUvs?"#define USE_POINTS_UV":"",i.flatShading?"#define FLAT_SHADED":"",i.skinning?"#define USE_SKINNING":"",i.morphTargets?"#define USE_MORPHTARGETS":"",i.morphNormals&&i.flatShading===!1?"#define USE_MORPHNORMALS":"",i.morphColors?"#define USE_MORPHCOLORS":"",i.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+i.morphTextureStride:"",i.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+i.morphTargetsCount:"",i.doubleSided?"#define DOUBLE_SIDED":"",i.flipSided?"#define FLIP_SIDED":"",i.shadowMapEnabled?"#define USE_SHADOWMAP":"",i.shadowMapEnabled?"#define "+l:"",i.sizeAttenuation?"#define USE_SIZEATTENUATION":"",i.numLightProbes>0?"#define USE_LIGHT_PROBES":"",i.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",i.reversedDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Hr).join(`
`),f=[vo(i),"#define SHADER_TYPE "+i.shaderType,"#define SHADER_NAME "+i.shaderName,y,i.useFog&&i.fog?"#define USE_FOG":"",i.useFog&&i.fogExp2?"#define FOG_EXP2":"",i.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",i.map?"#define USE_MAP":"",i.matcap?"#define USE_MATCAP":"",i.envMap?"#define USE_ENVMAP":"",i.envMap?"#define "+h:"",i.envMap?"#define "+u:"",i.envMap?"#define "+d:"",p?"#define CUBEUV_TEXEL_WIDTH "+p.texelWidth:"",p?"#define CUBEUV_TEXEL_HEIGHT "+p.texelHeight:"",p?"#define CUBEUV_MAX_MIP "+p.maxMip+".0":"",i.lightMap?"#define USE_LIGHTMAP":"",i.aoMap?"#define USE_AOMAP":"",i.bumpMap?"#define USE_BUMPMAP":"",i.normalMap?"#define USE_NORMALMAP":"",i.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",i.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",i.emissiveMap?"#define USE_EMISSIVEMAP":"",i.anisotropy?"#define USE_ANISOTROPY":"",i.anisotropyMap?"#define USE_ANISOTROPYMAP":"",i.clearcoat?"#define USE_CLEARCOAT":"",i.clearcoatMap?"#define USE_CLEARCOATMAP":"",i.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",i.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",i.dispersion?"#define USE_DISPERSION":"",i.iridescence?"#define USE_IRIDESCENCE":"",i.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",i.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",i.specularMap?"#define USE_SPECULARMAP":"",i.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",i.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",i.roughnessMap?"#define USE_ROUGHNESSMAP":"",i.metalnessMap?"#define USE_METALNESSMAP":"",i.alphaMap?"#define USE_ALPHAMAP":"",i.alphaTest?"#define USE_ALPHATEST":"",i.alphaHash?"#define USE_ALPHAHASH":"",i.sheen?"#define USE_SHEEN":"",i.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",i.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",i.transmission?"#define USE_TRANSMISSION":"",i.transmissionMap?"#define USE_TRANSMISSIONMAP":"",i.thicknessMap?"#define USE_THICKNESSMAP":"",i.vertexTangents&&i.flatShading===!1?"#define USE_TANGENT":"",i.vertexColors||i.instancingColor||i.batchingColor?"#define USE_COLOR":"",i.vertexAlphas?"#define USE_COLOR_ALPHA":"",i.vertexUv1s?"#define USE_UV1":"",i.vertexUv2s?"#define USE_UV2":"",i.vertexUv3s?"#define USE_UV3":"",i.pointsUvs?"#define USE_POINTS_UV":"",i.gradientMap?"#define USE_GRADIENTMAP":"",i.flatShading?"#define FLAT_SHADED":"",i.doubleSided?"#define DOUBLE_SIDED":"",i.flipSided?"#define FLIP_SIDED":"",i.shadowMapEnabled?"#define USE_SHADOWMAP":"",i.shadowMapEnabled?"#define "+l:"",i.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",i.numLightProbes>0?"#define USE_LIGHT_PROBES":"",i.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",i.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",i.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",i.reversedDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",i.toneMapping===0?"":"#define TONE_MAPPING",i.toneMapping===0?"":Ie.tonemapping_pars_fragment,i.toneMapping===0?"":tu("toneMapping",i.toneMapping),i.dithering?"#define DITHERING":"",i.opaque?"#define OPAQUE":"",Ie.colorspace_pars_fragment,eu("linearToOutputTexel",i.outputColorSpace),iu(),i.useDepthPacking?"#define DEPTH_PACKING "+i.depthPacking:"",`
`].filter(Hr).join(`
`)),s=Wn(s),s=mo(s,i),s=go(s,i),o=Wn(o),o=mo(o,i),o=go(o,i),s=_o(s),o=_o(o),i.isRawShaderMaterial!==!0&&(w=`#version 300 es
`,m=[g,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,f=["#define varying in",i.glslVersion==="300 es"?"":"layout(location = 0) out highp vec4 pc_fragColor;",i.glslVersion==="300 es"?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+f);let S=w+m+s,b=w+f+o,I=po(a,a.VERTEX_SHADER,S),L=po(a,a.FRAGMENT_SHADER,b);a.attachShader(v,I),a.attachShader(v,L),i.index0AttributeName===void 0?i.morphTargets===!0&&a.bindAttribLocation(v,0,"position"):a.bindAttribLocation(v,0,i.index0AttributeName),a.linkProgram(v);function P(C){if(e.debug.checkShaderErrors){let V=a.getProgramInfoLog(v)||"",H=a.getShaderInfoLog(I)||"",k=a.getShaderInfoLog(L)||"",Z=V.trim(),G=H.trim(),$=k.trim(),j=!0,te=!0;if(a.getProgramParameter(v,a.LINK_STATUS)===!1)if(j=!1,typeof e.debug.onShaderError=="function")e.debug.onShaderError(a,v,I,L);else{let fe=fo(a,I,"vertex"),Ue=fo(a,L,"fragment");console.error("THREE.WebGLProgram: Shader Error "+a.getError()+" - VALIDATE_STATUS "+a.getProgramParameter(v,a.VALIDATE_STATUS)+`

Material Name: `+C.name+`
Material Type: `+C.type+`

Program Info Log: `+Z+`
`+fe+`
`+Ue)}else Z===""?(G===""||$==="")&&(te=!1):console.warn("THREE.WebGLProgram: Program Info Log:",Z);te&&(C.diagnostics={runnable:j,programLog:Z,vertexShader:{log:G,prefix:m},fragmentShader:{log:$,prefix:f}})}a.deleteShader(I),a.deleteShader(L),B=new kr(a,v),E=nu(a,v)}c(P,"C");let B;this.getUniforms=function(){return B===void 0&&P(this),B};let E;this.getAttributes=function(){return E===void 0&&P(this),E};let M=i.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return M===!1&&(M=a.getProgramParameter(v,$l)),M},this.destroy=function(){r.releaseStatesOfProgram(this),a.deleteProgram(v),this.program=void 0},this.type=i.shaderType,this.name=i.shaderName,this.id=Ql++,this.cacheKey=t,this.usedTimes=1,this.program=v,this.vertexShader=I,this.fragmentShader=L,this}c(pu,"Eh");function fu(e,t,i,r,a,n,s){let o=new Na,l=new rh,h=new Set,u=[],d=a.logarithmicDepthBuffer,p=a.vertexTextures,g=a.precision,y={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function v(E){return h.add(E),E===0?"uv":`uv${E}`}c(v,"h");function m(E,M,C,V,H){let k=V.fog,Z=H.geometry,G=E.isMeshStandardMaterial?V.environment:null,$=(E.isMeshStandardMaterial?i:t).get(E.envMap||G),j=$&&$.mapping===306?$.image.height:null,te=y[E.type];E.precision!==null&&(g=a.getMaxPrecision(E.precision),g!==E.precision&&console.warn("THREE.WebGLProgram.getParameters:",E.precision,"not supported, using",g,"instead."));let fe=Z.morphAttributes.position||Z.morphAttributes.normal||Z.morphAttributes.color,Ue=fe===void 0?0:fe.length,He=0;Z.morphAttributes.position!==void 0&&(He=1),Z.morphAttributes.normal!==void 0&&(He=2),Z.morphAttributes.color!==void 0&&(He=3);let Ze,W,re,Me;if(te){let je=zt[te];Ze=je.vertexShader,W=je.fragmentShader}else Ze=E.vertexShader,W=E.fragmentShader,l.update(E),re=l.getVertexShaderID(E),Me=l.getFragmentShaderID(E);let ce=e.getRenderTarget(),_e=e.state.buffers.depth.getReversed(),Re=H.isInstancedMesh===!0,De=H.isBatchedMesh===!0,We=!!E.map,A=!!E.matcap,ct=!!$,Ge=!!E.aoMap,qe=!!E.lightMap,Te=!!E.bumpMap,$e=!!E.normalMap,ye=!!E.displacementMap,Ae=!!E.emissiveMap,dt=!!E.metalnessMap,ut=!!E.roughnessMap,st=E.anisotropy>0,T=E.clearcoat>0,_=E.dispersion>0,N=E.iridescence>0,q=E.sheen>0,K=E.transmission>0,X=st&&!!E.anisotropyMap,de=T&&!!E.clearcoatMap,ie=T&&!!E.clearcoatNormalMap,ve=T&&!!E.clearcoatRoughnessMap,Se=N&&!!E.iridescenceMap,ee=N&&!!E.iridescenceThicknessMap,se=q&&!!E.sheenColorMap,we=q&&!!E.sheenRoughnessMap,Ee=!!E.specularMap,oe=!!E.specularColorMap,Oe=!!E.specularIntensityMap,R=K&&!!E.transmissionMap,le=K&&!!E.thicknessMap,ae=!!E.gradientMap,me=!!E.alphaMap,Q=E.alphaTest>0,Y=!!E.alphaHash,ge=!!E.extensions,be=0;E.toneMapped&&(ce===null||ce.isXRRenderTarget===!0)&&(be=e.toneMapping);let rt={shaderID:te,shaderType:E.type,shaderName:E.name,vertexShader:Ze,fragmentShader:W,defines:E.defines,customVertexShaderID:re,customFragmentShaderID:Me,isRawShaderMaterial:E.isRawShaderMaterial===!0,glslVersion:E.glslVersion,precision:g,batching:De,batchingColor:De&&H._colorsTexture!==null,instancing:Re,instancingColor:Re&&H.instanceColor!==null,instancingMorph:Re&&H.morphTexture!==null,supportsVertexTextures:p,outputColorSpace:ce===null?e.outputColorSpace:ce.isXRRenderTarget===!0?ce.texture.colorSpace:pr,alphaToCoverage:!!E.alphaToCoverage,map:We,matcap:A,envMap:ct,envMapMode:ct&&$.mapping,envMapCubeUVHeight:j,aoMap:Ge,lightMap:qe,bumpMap:Te,normalMap:$e,displacementMap:p&&ye,emissiveMap:Ae,normalMapObjectSpace:$e&&E.normalMapType===1,normalMapTangentSpace:$e&&E.normalMapType===0,metalnessMap:dt,roughnessMap:ut,anisotropy:st,anisotropyMap:X,clearcoat:T,clearcoatMap:de,clearcoatNormalMap:ie,clearcoatRoughnessMap:ve,dispersion:_,iridescence:N,iridescenceMap:Se,iridescenceThicknessMap:ee,sheen:q,sheenColorMap:se,sheenRoughnessMap:we,specularMap:Ee,specularColorMap:oe,specularIntensityMap:Oe,transmission:K,transmissionMap:R,thicknessMap:le,gradientMap:ae,opaque:E.transparent===!1&&E.blending===1&&E.alphaToCoverage===!1,alphaMap:me,alphaTest:Q,alphaHash:Y,combine:E.combine,mapUv:We&&v(E.map.channel),aoMapUv:Ge&&v(E.aoMap.channel),lightMapUv:qe&&v(E.lightMap.channel),bumpMapUv:Te&&v(E.bumpMap.channel),normalMapUv:$e&&v(E.normalMap.channel),displacementMapUv:ye&&v(E.displacementMap.channel),emissiveMapUv:Ae&&v(E.emissiveMap.channel),metalnessMapUv:dt&&v(E.metalnessMap.channel),roughnessMapUv:ut&&v(E.roughnessMap.channel),anisotropyMapUv:X&&v(E.anisotropyMap.channel),clearcoatMapUv:de&&v(E.clearcoatMap.channel),clearcoatNormalMapUv:ie&&v(E.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:ve&&v(E.clearcoatRoughnessMap.channel),iridescenceMapUv:Se&&v(E.iridescenceMap.channel),iridescenceThicknessMapUv:ee&&v(E.iridescenceThicknessMap.channel),sheenColorMapUv:se&&v(E.sheenColorMap.channel),sheenRoughnessMapUv:we&&v(E.sheenRoughnessMap.channel),specularMapUv:Ee&&v(E.specularMap.channel),specularColorMapUv:oe&&v(E.specularColorMap.channel),specularIntensityMapUv:Oe&&v(E.specularIntensityMap.channel),transmissionMapUv:R&&v(E.transmissionMap.channel),thicknessMapUv:le&&v(E.thicknessMap.channel),alphaMapUv:me&&v(E.alphaMap.channel),vertexTangents:!!Z.attributes.tangent&&($e||st),vertexColors:E.vertexColors,vertexAlphas:E.vertexColors===!0&&!!Z.attributes.color&&Z.attributes.color.itemSize===4,pointsUvs:H.isPoints===!0&&!!Z.attributes.uv&&(We||me),fog:!!k,useFog:E.fog===!0,fogExp2:!!k&&k.isFogExp2,flatShading:E.flatShading===!0&&E.wireframe===!1,sizeAttenuation:E.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:_e,skinning:H.isSkinnedMesh===!0,morphTargets:Z.morphAttributes.position!==void 0,morphNormals:Z.morphAttributes.normal!==void 0,morphColors:Z.morphAttributes.color!==void 0,morphTargetsCount:Ue,morphTextureStride:He,numDirLights:M.directional.length,numPointLights:M.point.length,numSpotLights:M.spot.length,numSpotLightMaps:M.spotLightMap.length,numRectAreaLights:M.rectArea.length,numHemiLights:M.hemi.length,numDirLightShadows:M.directionalShadowMap.length,numPointLightShadows:M.pointShadowMap.length,numSpotLightShadows:M.spotShadowMap.length,numSpotLightShadowsWithMaps:M.numSpotLightShadowsWithMaps,numLightProbes:M.numLightProbes,numClippingPlanes:s.numPlanes,numClipIntersection:s.numIntersection,dithering:E.dithering,shadowMapEnabled:e.shadowMap.enabled&&C.length>0,shadowMapType:e.shadowMap.type,toneMapping:be,decodeVideoTexture:We&&E.map.isVideoTexture===!0&&ke.getTransfer(E.map.colorSpace)==="srgb",decodeVideoTextureEmissive:Ae&&E.emissiveMap.isVideoTexture===!0&&ke.getTransfer(E.emissiveMap.colorSpace)==="srgb",premultipliedAlpha:E.premultipliedAlpha,doubleSided:E.side===2,flipSided:E.side===1,useDepthPacking:E.depthPacking>=0,depthPacking:E.depthPacking||0,index0AttributeName:E.index0AttributeName,extensionClipCullDistance:ge&&E.extensions.clipCullDistance===!0&&r.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(ge&&E.extensions.multiDraw===!0||De)&&r.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:r.has("KHR_parallel_shader_compile"),customProgramCacheKey:E.customProgramCacheKey()};return rt.vertexUv1s=h.has(1),rt.vertexUv2s=h.has(2),rt.vertexUv3s=h.has(3),h.clear(),rt}c(m,"g");function f(E){let M=[];if(E.shaderID?M.push(E.shaderID):(M.push(E.customVertexShaderID),M.push(E.customFragmentShaderID)),E.defines!==void 0)for(let C in E.defines)M.push(C),M.push(E.defines[C]);return E.isRawShaderMaterial===!1&&(w(M,E),S(M,E),M.push(e.outputColorSpace)),M.push(E.customProgramCacheKey),M.join()}c(f,"_");function w(E,M){E.push(M.precision),E.push(M.outputColorSpace),E.push(M.envMapMode),E.push(M.envMapCubeUVHeight),E.push(M.mapUv),E.push(M.alphaMapUv),E.push(M.lightMapUv),E.push(M.aoMapUv),E.push(M.bumpMapUv),E.push(M.normalMapUv),E.push(M.displacementMapUv),E.push(M.emissiveMapUv),E.push(M.metalnessMapUv),E.push(M.roughnessMapUv),E.push(M.anisotropyMapUv),E.push(M.clearcoatMapUv),E.push(M.clearcoatNormalMapUv),E.push(M.clearcoatRoughnessMapUv),E.push(M.iridescenceMapUv),E.push(M.iridescenceThicknessMapUv),E.push(M.sheenColorMapUv),E.push(M.sheenRoughnessMapUv),E.push(M.specularMapUv),E.push(M.specularColorMapUv),E.push(M.specularIntensityMapUv),E.push(M.transmissionMapUv),E.push(M.thicknessMapUv),E.push(M.combine),E.push(M.fogExp2),E.push(M.sizeAttenuation),E.push(M.morphTargetsCount),E.push(M.morphAttributeCount),E.push(M.numDirLights),E.push(M.numPointLights),E.push(M.numSpotLights),E.push(M.numSpotLightMaps),E.push(M.numHemiLights),E.push(M.numRectAreaLights),E.push(M.numDirLightShadows),E.push(M.numPointLightShadows),E.push(M.numSpotLightShadows),E.push(M.numSpotLightShadowsWithMaps),E.push(M.numLightProbes),E.push(M.shadowMapType),E.push(M.toneMapping),E.push(M.numClippingPlanes),E.push(M.numClipIntersection),E.push(M.depthPacking)}c(w,"v");function S(E,M){o.disableAll(),M.supportsVertexTextures&&o.enable(0),M.instancing&&o.enable(1),M.instancingColor&&o.enable(2),M.instancingMorph&&o.enable(3),M.matcap&&o.enable(4),M.envMap&&o.enable(5),M.normalMapObjectSpace&&o.enable(6),M.normalMapTangentSpace&&o.enable(7),M.clearcoat&&o.enable(8),M.iridescence&&o.enable(9),M.alphaTest&&o.enable(10),M.vertexColors&&o.enable(11),M.vertexAlphas&&o.enable(12),M.vertexUv1s&&o.enable(13),M.vertexUv2s&&o.enable(14),M.vertexUv3s&&o.enable(15),M.vertexTangents&&o.enable(16),M.anisotropy&&o.enable(17),M.alphaHash&&o.enable(18),M.batching&&o.enable(19),M.dispersion&&o.enable(20),M.batchingColor&&o.enable(21),M.gradientMap&&o.enable(22),E.push(o.mask),o.disableAll(),M.fog&&o.enable(0),M.useFog&&o.enable(1),M.flatShading&&o.enable(2),M.logarithmicDepthBuffer&&o.enable(3),M.reversedDepthBuffer&&o.enable(4),M.skinning&&o.enable(5),M.morphTargets&&o.enable(6),M.morphNormals&&o.enable(7),M.morphColors&&o.enable(8),M.premultipliedAlpha&&o.enable(9),M.shadowMapEnabled&&o.enable(10),M.doubleSided&&o.enable(11),M.flipSided&&o.enable(12),M.useDepthPacking&&o.enable(13),M.dithering&&o.enable(14),M.transmission&&o.enable(15),M.sheen&&o.enable(16),M.opaque&&o.enable(17),M.pointsUvs&&o.enable(18),M.decodeVideoTexture&&o.enable(19),M.decodeVideoTextureEmissive&&o.enable(20),M.alphaToCoverage&&o.enable(21),E.push(o.mask)}c(S,"y");function b(E){let M=y[E.type],C;if(M){let V=zt[M];C=Pl.clone(V.uniforms)}else C=E.uniforms;return C}c(b,"b");function I(E,M){let C;for(let V=0,H=u.length;V<H;V++){let k=u[V];if(k.cacheKey===M){C=k,++C.usedTimes;break}}return C===void 0&&(C=new pu(e,M,E,n),u.push(C)),C}c(I,"x");function L(E){if(--E.usedTimes===0){let M=u.indexOf(E);u[M]=u[u.length-1],u.pop(),E.destroy()}}c(L,"S");function P(E){l.remove(E)}c(P,"C");function B(){l.dispose()}return c(B,"w"),{getParameters:m,getProgramCacheKey:f,getUniforms:b,acquireProgram:I,releaseProgram:L,releaseShaderCache:P,programs:u,dispose:B}}c(fu,"Dh");function mu(){let e=new WeakMap;function t(s){return e.has(s)}c(t,"t");function i(s){let o=e.get(s);return o===void 0&&(o={},e.set(s,o)),o}c(i,"n");function r(s){e.delete(s)}c(r,"r");function a(s,o,l){e.get(s)[o]=l}c(a,"i");function n(){e=new WeakMap}return c(n,"a"),{has:t,get:i,remove:r,update:a,dispose:n}}c(mu,"Oh");function gu(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.material.id===t.material.id?e.z===t.z?e.id-t.id:e.z-t.z:e.material.id-t.material.id:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}c(gu,"kh");function xo(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.z===t.z?e.id-t.id:t.z-e.z:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}c(xo,"Ah");function Mo(){let e=[],t=0,i=[],r=[],a=[];function n(){t=0,i.length=0,r.length=0,a.length=0}c(n,"a");function s(d,p,g,y,v,m){let f=e[t];return f===void 0?(f={id:d.id,object:d,geometry:p,material:g,groupOrder:y,renderOrder:d.renderOrder,z:v,group:m},e[t]=f):(f.id=d.id,f.object=d,f.geometry=p,f.material=g,f.groupOrder=y,f.renderOrder=d.renderOrder,f.z=v,f.group=m),t++,f}c(s,"o");function o(d,p,g,y,v,m){let f=s(d,p,g,y,v,m);g.transmission>0?r.push(f):g.transparent===!0?a.push(f):i.push(f)}c(o,"s");function l(d,p,g,y,v,m){let f=s(d,p,g,y,v,m);g.transmission>0?r.unshift(f):g.transparent===!0?a.unshift(f):i.unshift(f)}c(l,"c");function h(d,p){i.length>1&&i.sort(d||gu),r.length>1&&r.sort(p||xo),a.length>1&&a.sort(p||xo)}c(h,"l");function u(){for(let d=t,p=e.length;d<p;d++){let g=e[d];if(g.id===null)break;g.id=null,g.object=null,g.geometry=null,g.material=null,g.group=null}}return c(u,"u"),{opaque:i,transmissive:r,transparent:a,init:n,push:o,unshift:l,finish:u,sort:h}}c(Mo,"jh");function _u(){let e=new WeakMap;function t(r,a){let n=e.get(r),s;return n===void 0?(s=new Mo,e.set(r,[s])):a>=n.length?(s=new Mo,n.push(s)):s=n[a],s}c(t,"t");function i(){e=new WeakMap}return c(i,"n"),{get:t,dispose:i}}c(_u,"Mh");function vu(){let e={};return{get:c(function(t){if(e[t.id]!==void 0)return e[t.id];let i;switch(t.type){case"DirectionalLight":i={direction:new O,color:new ze};break;case"SpotLight":i={position:new O,direction:new O,color:new ze,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":i={position:new O,color:new ze,distance:0,decay:0};break;case"HemisphereLight":i={direction:new O,skyColor:new ze,groundColor:new ze};break;case"RectAreaLight":i={color:new ze,position:new O,halfWidth:new O,halfHeight:new O}}return e[t.id]=i,i},"get")}}c(vu,"Nh");function xu(){let e={};return{get:c(function(t){if(e[t.id]!==void 0)return e[t.id];let i;switch(t.type){case"DirectionalLight":i={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Be};break;case"SpotLight":i={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Be};break;case"PointLight":i={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Be,shadowCameraNear:1,shadowCameraFar:1e3}}return e[t.id]=i,i},"get")}}c(xu,"Ph");function Mu(e,t){return(t.castShadow?2:0)-(e.castShadow?2:0)+ +!!t.map-!!e.map}c(Mu,"Fh");function yu(e){let t=new vu,i=xu(),r={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let h=0;h<9;h++)r.probe.push(new O);let a=new O,n=new at,s=new at;function o(h){let u=0,d=0,p=0;for(let E=0;E<9;E++)r.probe[E].set(0,0,0);let g=0,y=0,v=0,m=0,f=0,w=0,S=0,b=0,I=0,L=0,P=0;h.sort(Mu);for(let E=0,M=h.length;E<M;E++){let C=h[E],V=C.color,H=C.intensity,k=C.distance,Z=C.shadow&&C.shadow.map?C.shadow.map.texture:null;if(C.isAmbientLight)u+=V.r*H,d+=V.g*H,p+=V.b*H;else if(C.isLightProbe){for(let G=0;G<9;G++)r.probe[G].addScaledVector(C.sh.coefficients[G],H);P++}else if(C.isDirectionalLight){let G=t.get(C);if(G.color.copy(C.color).multiplyScalar(C.intensity),C.castShadow){let $=C.shadow,j=i.get(C);j.shadowIntensity=$.intensity,j.shadowBias=$.bias,j.shadowNormalBias=$.normalBias,j.shadowRadius=$.radius,j.shadowMapSize=$.mapSize,r.directionalShadow[g]=j,r.directionalShadowMap[g]=Z,r.directionalShadowMatrix[g]=C.shadow.matrix,w++}r.directional[g]=G,g++}else if(C.isSpotLight){let G=t.get(C);G.position.setFromMatrixPosition(C.matrixWorld),G.color.copy(V).multiplyScalar(H),G.distance=k,G.coneCos=Math.cos(C.angle),G.penumbraCos=Math.cos(C.angle*(1-C.penumbra)),G.decay=C.decay,r.spot[v]=G;let $=C.shadow;if(C.map&&(r.spotLightMap[I]=C.map,I++,$.updateMatrices(C),C.castShadow&&L++),r.spotLightMatrix[v]=$.matrix,C.castShadow){let j=i.get(C);j.shadowIntensity=$.intensity,j.shadowBias=$.bias,j.shadowNormalBias=$.normalBias,j.shadowRadius=$.radius,j.shadowMapSize=$.mapSize,r.spotShadow[v]=j,r.spotShadowMap[v]=Z,b++}v++}else if(C.isRectAreaLight){let G=t.get(C);G.color.copy(V).multiplyScalar(H),G.halfWidth.set(C.width*.5,0,0),G.halfHeight.set(0,C.height*.5,0),r.rectArea[m]=G,m++}else if(C.isPointLight){let G=t.get(C);if(G.color.copy(C.color).multiplyScalar(C.intensity),G.distance=C.distance,G.decay=C.decay,C.castShadow){let $=C.shadow,j=i.get(C);j.shadowIntensity=$.intensity,j.shadowBias=$.bias,j.shadowNormalBias=$.normalBias,j.shadowRadius=$.radius,j.shadowMapSize=$.mapSize,j.shadowCameraNear=$.camera.near,j.shadowCameraFar=$.camera.far,r.pointShadow[y]=j,r.pointShadowMap[y]=Z,r.pointShadowMatrix[y]=C.shadow.matrix,S++}r.point[y]=G,y++}else if(C.isHemisphereLight){let G=t.get(C);G.skyColor.copy(C.color).multiplyScalar(H),G.groundColor.copy(C.groundColor).multiplyScalar(H),r.hemi[f]=G,f++}}m>0&&(e.has("OES_texture_float_linear")===!0?(r.rectAreaLTC1=ne.LTC_FLOAT_1,r.rectAreaLTC2=ne.LTC_FLOAT_2):(r.rectAreaLTC1=ne.LTC_HALF_1,r.rectAreaLTC2=ne.LTC_HALF_2)),r.ambient[0]=u,r.ambient[1]=d,r.ambient[2]=p;let B=r.hash;(B.directionalLength!==g||B.pointLength!==y||B.spotLength!==v||B.rectAreaLength!==m||B.hemiLength!==f||B.numDirectionalShadows!==w||B.numPointShadows!==S||B.numSpotShadows!==b||B.numSpotMaps!==I||B.numLightProbes!==P)&&(r.directional.length=g,r.spot.length=v,r.rectArea.length=m,r.point.length=y,r.hemi.length=f,r.directionalShadow.length=w,r.directionalShadowMap.length=w,r.pointShadow.length=S,r.pointShadowMap.length=S,r.spotShadow.length=b,r.spotShadowMap.length=b,r.directionalShadowMatrix.length=w,r.pointShadowMatrix.length=S,r.spotLightMatrix.length=b+I-L,r.spotLightMap.length=I,r.numSpotLightShadowsWithMaps=L,r.numLightProbes=P,B.directionalLength=g,B.pointLength=y,B.spotLength=v,B.rectAreaLength=m,B.hemiLength=f,B.numDirectionalShadows=w,B.numPointShadows=S,B.numSpotShadows=b,B.numSpotMaps=I,B.numLightProbes=P,r.version=ah++)}c(o,"s");function l(h,u){let d=0,p=0,g=0,y=0,v=0,m=u.matrixWorldInverse;for(let f=0,w=h.length;f<w;f++){let S=h[f];if(S.isDirectionalLight){let b=r.directional[d];b.direction.setFromMatrixPosition(S.matrixWorld),a.setFromMatrixPosition(S.target.matrixWorld),b.direction.sub(a),b.direction.transformDirection(m),d++}else if(S.isSpotLight){let b=r.spot[g];b.position.setFromMatrixPosition(S.matrixWorld),b.position.applyMatrix4(m),b.direction.setFromMatrixPosition(S.matrixWorld),a.setFromMatrixPosition(S.target.matrixWorld),b.direction.sub(a),b.direction.transformDirection(m),g++}else if(S.isRectAreaLight){let b=r.rectArea[y];b.position.setFromMatrixPosition(S.matrixWorld),b.position.applyMatrix4(m),s.identity(),n.copy(S.matrixWorld),n.premultiply(m),s.extractRotation(n),b.halfWidth.set(S.width*.5,0,0),b.halfHeight.set(0,S.height*.5,0),b.halfWidth.applyMatrix4(s),b.halfHeight.applyMatrix4(s),y++}else if(S.isPointLight){let b=r.point[p];b.position.setFromMatrixPosition(S.matrixWorld),b.position.applyMatrix4(m),p++}else if(S.isHemisphereLight){let b=r.hemi[v];b.direction.setFromMatrixPosition(S.matrixWorld),b.direction.transformDirection(m),v++}}}return c(l,"c"),{setup:o,setupView:l,state:r}}c(yu,"Ih");function yo(e){let t=new yu(e),i=[],r=[];function a(u){h.camera=u,i.length=0,r.length=0}c(a,"i");function n(u){i.push(u)}c(n,"a");function s(u){r.push(u)}c(s,"o");function o(){t.setup(i)}c(o,"s");function l(u){t.setupView(i,u)}c(l,"c");let h={lightsArray:i,shadowsArray:r,camera:null,lights:t,transmissionRenderTarget:{}};return{init:a,state:h,setupLights:o,setupLightsView:l,pushLight:n,pushShadow:s}}c(yo,"Lh");function Su(e){let t=new WeakMap;function i(a,n=0){let s=t.get(a),o;return s===void 0?(o=new yo(e),t.set(a,[o])):n>=s.length?(o=new yo(e),s.push(o)):o=s[n],o}c(i,"n");function r(){t=new WeakMap}return c(r,"r"),{get:i,dispose:r}}c(Su,"Rh");function Eu(e,t,i){let r=new is,a=new Be,n=new Be,s=new nt,o=new Ul({depthPacking:wl}),l=new Dl,h={},u=i.maxTextureSize,d={0:1,1:0,2:2},p=new si({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Be},radius:{value:4}},vertexShader:nh,fragmentShader:sh}),g=p.clone();g.defines.HORIZONTAL_PASS=1;let y=new Yt;y.setAttribute("position",new Ut(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let v=new Zt(y,p),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=1;let f=this.type;this.render=function(L,P,B){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||L.length===0)return;let E=e.getRenderTarget(),M=e.getActiveCubeFace(),C=e.getActiveMipmapLevel(),V=e.state;V.setBlending(0),V.buffers.depth.getReversed()?V.buffers.color.setClear(0,0,0,0):V.buffers.color.setClear(1,1,1,1),V.buffers.depth.setTest(!0),V.setScissorTest(!1);let H=f!==3&&this.type===3,k=f===3&&this.type!==3;for(let Z=0,G=L.length;Z<G;Z++){let $=L[Z],j=$.shadow;if(j===void 0){console.warn("THREE.WebGLShadowMap:",$,"has no shadow.");continue}if(j.autoUpdate===!1&&j.needsUpdate===!1)continue;a.copy(j.mapSize);let te=j.getFrameExtents();if(a.multiply(te),n.copy(j.mapSize),(a.x>u||a.y>u)&&(a.x>u&&(n.x=Math.floor(u/te.x),a.x=n.x*te.x,j.mapSize.x=n.x),a.y>u&&(n.y=Math.floor(u/te.y),a.y=n.y*te.y,j.mapSize.y=n.y)),j.map===null||H===!0||k===!0){let Ue=this.type===3?{}:{minFilter:Kt,magFilter:Kt};j.map!==null&&j.map.dispose(),j.map=new vi(a.x,a.y,Ue),j.map.texture.name=$.name+".shadowMap",j.camera.updateProjectionMatrix()}e.setRenderTarget(j.map),e.clear();let fe=j.getViewportCount();for(let Ue=0;Ue<fe;Ue++){let He=j.getViewport(Ue);s.set(n.x*He.x,n.y*He.y,n.x*He.z,n.y*He.w),V.viewport(s),j.updateMatrices($,Ue),r=j.getFrustum(),b(P,B,j.camera,$,this.type)}j.isPointLightShadow!==!0&&this.type===3&&w(j,B),j.needsUpdate=!1}f=this.type,m.needsUpdate=!1,e.setRenderTarget(E,M,C)};function w(L,P){let B=t.update(v);p.defines.VSM_SAMPLES!==L.blurSamples&&(p.defines.VSM_SAMPLES=L.blurSamples,g.defines.VSM_SAMPLES=L.blurSamples,p.needsUpdate=!0,g.needsUpdate=!0),L.mapPass===null&&(L.mapPass=new vi(a.x,a.y)),p.uniforms.shadow_pass.value=L.map.texture,p.uniforms.resolution.value=L.mapSize,p.uniforms.radius.value=L.radius,e.setRenderTarget(L.mapPass),e.clear(),e.renderBufferDirect(P,null,B,p,v,null),g.uniforms.shadow_pass.value=L.mapPass.texture,g.uniforms.resolution.value=L.mapSize,g.uniforms.radius.value=L.radius,e.setRenderTarget(L.map),e.clear(),e.renderBufferDirect(P,null,B,g,v,null)}c(w,"v");function S(L,P,B,E){let M=null,C=B.isPointLight===!0?L.customDistanceMaterial:L.customDepthMaterial;if(C!==void 0)M=C;else if(M=B.isPointLight===!0?l:o,e.localClippingEnabled&&P.clipShadows===!0&&Array.isArray(P.clippingPlanes)&&P.clippingPlanes.length!==0||P.displacementMap&&P.displacementScale!==0||P.alphaMap&&P.alphaTest>0||P.map&&P.alphaTest>0||P.alphaToCoverage===!0){let V=M.uuid,H=P.uuid,k=h[V];k===void 0&&(k={},h[V]=k);let Z=k[H];Z===void 0&&(Z=M.clone(),k[H]=Z,P.addEventListener("dispose",I)),M=Z}if(M.visible=P.visible,M.wireframe=P.wireframe,E===3?M.side=P.shadowSide===null?P.side:P.shadowSide:M.side=P.shadowSide===null?d[P.side]:P.shadowSide,M.alphaMap=P.alphaMap,M.alphaTest=P.alphaToCoverage===!0?.5:P.alphaTest,M.map=P.map,M.clipShadows=P.clipShadows,M.clippingPlanes=P.clippingPlanes,M.clipIntersection=P.clipIntersection,M.displacementMap=P.displacementMap,M.displacementScale=P.displacementScale,M.displacementBias=P.displacementBias,M.wireframeLinewidth=P.wireframeLinewidth,M.linewidth=P.linewidth,B.isPointLight===!0&&M.isMeshDistanceMaterial===!0){let V=e.properties.get(M);V.light=B}return M}c(S,"y");function b(L,P,B,E,M){if(L.visible===!1)return;if(L.layers.test(P.layers)&&(L.isMesh||L.isLine||L.isPoints)&&(L.castShadow||L.receiveShadow&&M===3)&&(!L.frustumCulled||r.intersectsObject(L))){L.modelViewMatrix.multiplyMatrices(B.matrixWorldInverse,L.matrixWorld);let V=t.update(L),H=L.material;if(Array.isArray(H)){let k=V.groups;for(let Z=0,G=k.length;Z<G;Z++){let $=k[Z],j=H[$.materialIndex];if(j&&j.visible){let te=S(L,j,E,M);L.onBeforeShadow(e,L,P,B,V,te,$),e.renderBufferDirect(B,null,V,te,L,$),L.onAfterShadow(e,L,P,B,V,te,$)}}}else if(H.visible){let k=S(L,H,E,M);L.onBeforeShadow(e,L,P,B,V,k,null),e.renderBufferDirect(B,null,V,k,L,null),L.onAfterShadow(e,L,P,B,V,k,null)}}let C=L.children;for(let V=0,H=C.length;V<H;V++)b(C[V],P,B,E,M)}c(b,"b");function I(L){L.target.removeEventListener("dispose",I);for(let P in h){let B=h[P],E=L.target.uuid;E in B&&(B[E].dispose(),delete B[E])}}c(I,"x")}c(Eu,"zh");function Tu(e,t){function i(){let R=!1,le=new nt,ae=null,me=new nt(0,0,0,0);return{setMask:c(function(Q){ae!==Q&&!R&&(e.colorMask(Q,Q,Q,Q),ae=Q)},"setMask"),setLocked:c(function(Q){R=Q},"setLocked"),setClear:c(function(Q,Y,ge,be,rt){rt===!0&&(Q*=be,Y*=be,ge*=be),le.set(Q,Y,ge,be),me.equals(le)===!1&&(e.clearColor(Q,Y,ge,be),me.copy(le))},"setClear"),reset:c(function(){R=!1,ae=null,me.set(-1,0,0,0)},"reset")}}c(i,"n");function r(){let R=!1,le=!1,ae=null,me=null,Q=null;return{setReversed:c(function(Y){if(le!==Y){let ge=t.get("EXT_clip_control");Y?ge.clipControlEXT(ge.LOWER_LEFT_EXT,ge.ZERO_TO_ONE_EXT):ge.clipControlEXT(ge.LOWER_LEFT_EXT,ge.NEGATIVE_ONE_TO_ONE_EXT),le=Y;let be=Q;Q=null,this.setClear(be)}},"setReversed"),getReversed:c(function(){return le},"getReversed"),setTest:c(function(Y){Y?ce(e.DEPTH_TEST):_e(e.DEPTH_TEST)},"setTest"),setMask:c(function(Y){ae!==Y&&!R&&(e.depthMask(Y),ae=Y)},"setMask"),setFunc:c(function(Y){if(le&&(Y=oh[Y]),me!==Y){switch(Y){case 0:e.depthFunc(e.NEVER);break;case 1:e.depthFunc(e.ALWAYS);break;case 2:e.depthFunc(e.LESS);break;case 3:e.depthFunc(e.LEQUAL);break;case 4:e.depthFunc(e.EQUAL);break;case 5:e.depthFunc(e.GEQUAL);break;case 6:e.depthFunc(e.GREATER);break;case 7:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}me=Y}},"setFunc"),setLocked:c(function(Y){R=Y},"setLocked"),setClear:c(function(Y){Q!==Y&&(le&&(Y=1-Y),e.clearDepth(Y),Q=Y)},"setClear"),reset:c(function(){R=!1,ae=null,me=null,Q=null,le=!1},"reset")}}c(r,"r");function a(){let R=!1,le=null,ae=null,me=null,Q=null,Y=null,ge=null,be=null,rt=null;return{setTest:c(function(je){R||(je?ce(e.STENCIL_TEST):_e(e.STENCIL_TEST))},"setTest"),setMask:c(function(je){le!==je&&!R&&(e.stencilMask(je),le=je)},"setMask"),setFunc:c(function(je,Ht,Vt){(ae!==je||me!==Ht||Q!==Vt)&&(e.stencilFunc(je,Ht,Vt),ae=je,me=Ht,Q=Vt)},"setFunc"),setOp:c(function(je,Ht,Vt){(Y!==je||ge!==Ht||be!==Vt)&&(e.stencilOp(je,Ht,Vt),Y=je,ge=Ht,be=Vt)},"setOp"),setLocked:c(function(je){R=je},"setLocked"),setClear:c(function(je){rt!==je&&(e.clearStencil(je),rt=je)},"setClear"),reset:c(function(){R=!1,le=null,ae=null,me=null,Q=null,Y=null,ge=null,be=null,rt=null},"reset")}}c(a,"i");let n=new i,s=new r,o=new a,l=new WeakMap,h=new WeakMap,u={},d={},p=new WeakMap,g=[],y=null,v=!1,m=null,f=null,w=null,S=null,b=null,I=null,L=null,P=new ze(0,0,0),B=0,E=!1,M=null,C=null,V=null,H=null,k=null,Z=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),G=!1,$=0,j=e.getParameter(e.VERSION);j.indexOf("WebGL")===-1?j.indexOf("OpenGL ES")!==-1&&($=parseFloat(/^OpenGL ES (\d)/.exec(j)[1]),G=$>=2):($=parseFloat(/^WebGL (\d)/.exec(j)[1]),G=$>=1);let te=null,fe={},Ue=e.getParameter(e.SCISSOR_BOX),He=e.getParameter(e.VIEWPORT),Ze=new nt().fromArray(Ue),W=new nt().fromArray(He);function re(R,le,ae,me){let Q=new Uint8Array(4),Y=e.createTexture();e.bindTexture(R,Y),e.texParameteri(R,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(R,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let ge=0;ge<ae;ge++)R===e.TEXTURE_3D||R===e.TEXTURE_2D_ARRAY?e.texImage3D(le,0,e.RGBA,1,1,me,0,e.RGBA,e.UNSIGNED_BYTE,Q):e.texImage2D(le+ge,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,Q);return Y}c(re,"P");let Me={};Me[e.TEXTURE_2D]=re(e.TEXTURE_2D,e.TEXTURE_2D,1),Me[e.TEXTURE_CUBE_MAP]=re(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),Me[e.TEXTURE_2D_ARRAY]=re(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),Me[e.TEXTURE_3D]=re(e.TEXTURE_3D,e.TEXTURE_3D,1,1),n.setClear(0,0,0,1),s.setClear(1),o.setClear(0),ce(e.DEPTH_TEST),s.setFunc(3),Te(!1),$e(1),ce(e.CULL_FACE),Ge(0);function ce(R){u[R]!==!0&&(e.enable(R),u[R]=!0)}c(ce,"se");function _e(R){u[R]!==!1&&(e.disable(R),u[R]=!1)}c(_e,"ce");function Re(R,le){return d[R]!==le&&(e.bindFramebuffer(R,le),d[R]=le,R===e.DRAW_FRAMEBUFFER&&(d[e.FRAMEBUFFER]=le),R===e.FRAMEBUFFER&&(d[e.DRAW_FRAMEBUFFER]=le),!0)}c(Re,"le");function De(R,le){let ae=g,me=!1;if(R){ae=p.get(le),ae===void 0&&(ae=[],p.set(le,ae));let Q=R.textures;if(ae.length!==Q.length||ae[0]!==e.COLOR_ATTACHMENT0){for(let Y=0,ge=Q.length;Y<ge;Y++)ae[Y]=e.COLOR_ATTACHMENT0+Y;ae.length=Q.length,me=!0}}else ae[0]!==e.BACK&&(ae[0]=e.BACK,me=!0);me&&e.drawBuffers(ae)}c(De,"ue");function We(R){return y!==R&&(e.useProgram(R),y=R,!0)}c(We,"de");let A={100:e.FUNC_ADD,101:e.FUNC_SUBTRACT,102:e.FUNC_REVERSE_SUBTRACT};A[103]=e.MIN,A[104]=e.MAX;let ct={200:e.ZERO,201:e.ONE,202:e.SRC_COLOR,204:e.SRC_ALPHA,210:e.SRC_ALPHA_SATURATE,208:e.DST_COLOR,206:e.DST_ALPHA,203:e.ONE_MINUS_SRC_COLOR,205:e.ONE_MINUS_SRC_ALPHA,209:e.ONE_MINUS_DST_COLOR,207:e.ONE_MINUS_DST_ALPHA,211:e.CONSTANT_COLOR,212:e.ONE_MINUS_CONSTANT_COLOR,213:e.CONSTANT_ALPHA,214:e.ONE_MINUS_CONSTANT_ALPHA};function Ge(R,le,ae,me,Q,Y,ge,be,rt,je){if(R===0){v===!0&&(_e(e.BLEND),v=!1);return}if(v===!1&&(ce(e.BLEND),v=!0),R!==5){if(R!==m||je!==E){if((f!==100||b!==100)&&(e.blendEquation(e.FUNC_ADD),f=100,b=100),je)switch(R){case 1:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFunc(e.ONE,e.ONE);break;case 3:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case 4:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:console.error("THREE.WebGLState: Invalid blending: ",R)}else switch(R){case 1:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case 3:console.error("THREE.WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case 4:console.error("THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:console.error("THREE.WebGLState: Invalid blending: ",R)}w=null,S=null,I=null,L=null,P.set(0,0,0),B=0,m=R,E=je}return}Q||=le,Y||=ae,ge||=me,(le!==f||Q!==b)&&(e.blendEquationSeparate(A[le],A[Q]),f=le,b=Q),(ae!==w||me!==S||Y!==I||ge!==L)&&(e.blendFuncSeparate(ct[ae],ct[me],ct[Y],ct[ge]),w=ae,S=me,I=Y,L=ge),(be.equals(P)===!1||rt!==B)&&(e.blendColor(be.r,be.g,be.b,rt),P.copy(be),B=rt),m=R,E=!1}c(Ge,"me");function qe(R,le){R.side===2?_e(e.CULL_FACE):ce(e.CULL_FACE);let ae=R.side===1;le&&(ae=!ae),Te(ae),R.blending===1&&R.transparent===!1?Ge(0):Ge(R.blending,R.blendEquation,R.blendSrc,R.blendDst,R.blendEquationAlpha,R.blendSrcAlpha,R.blendDstAlpha,R.blendColor,R.blendAlpha,R.premultipliedAlpha),s.setFunc(R.depthFunc),s.setTest(R.depthTest),s.setMask(R.depthWrite),n.setMask(R.colorWrite);let me=R.stencilWrite;o.setTest(me),me&&(o.setMask(R.stencilWriteMask),o.setFunc(R.stencilFunc,R.stencilRef,R.stencilFuncMask),o.setOp(R.stencilFail,R.stencilZFail,R.stencilZPass)),Ae(R.polygonOffset,R.polygonOffsetFactor,R.polygonOffsetUnits),R.alphaToCoverage===!0?ce(e.SAMPLE_ALPHA_TO_COVERAGE):_e(e.SAMPLE_ALPHA_TO_COVERAGE)}c(qe,"I");function Te(R){M!==R&&(R?e.frontFace(e.CW):e.frontFace(e.CCW),M=R)}c(Te,"he");function $e(R){R===0?_e(e.CULL_FACE):(ce(e.CULL_FACE),R!==C&&(R===1?e.cullFace(e.BACK):R===2?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))),C=R}c($e,"ge");function ye(R){R!==V&&(G&&e.lineWidth(R),V=R)}c(ye,"_e");function Ae(R,le,ae){R?(ce(e.POLYGON_OFFSET_FILL),(H!==le||k!==ae)&&(e.polygonOffset(le,ae),H=le,k=ae)):_e(e.POLYGON_OFFSET_FILL)}c(Ae,"L");function dt(R){R?ce(e.SCISSOR_TEST):_e(e.SCISSOR_TEST)}c(dt,"ve");function ut(R){R===void 0&&(R=e.TEXTURE0+Z-1),te!==R&&(e.activeTexture(R),te=R)}c(ut,"R");function st(R,le,ae){ae===void 0&&(ae=te===null?e.TEXTURE0+Z-1:te);let me=fe[ae];me===void 0&&(me={type:void 0,texture:void 0},fe[ae]=me),(me.type!==R||me.texture!==le)&&(te!==ae&&(e.activeTexture(ae),te=ae),e.bindTexture(R,le||Me[R]),me.type=R,me.texture=le)}c(st,"z");function T(){let R=fe[te];R!==void 0&&R.type!==void 0&&(e.bindTexture(R.type,null),R.type=void 0,R.texture=void 0)}c(T,"ye");function _(){try{e.compressedTexImage2D(...arguments)}catch(R){console.error("THREE.WebGLState:",R)}}c(_,"be");function N(){try{e.compressedTexImage3D(...arguments)}catch(R){console.error("THREE.WebGLState:",R)}}c(N,"xe");function q(){try{e.texSubImage2D(...arguments)}catch(R){console.error("THREE.WebGLState:",R)}}c(q,"Se");function K(){try{e.texSubImage3D(...arguments)}catch(R){console.error("THREE.WebGLState:",R)}}c(K,"Ce");function X(){try{e.compressedTexSubImage2D(...arguments)}catch(R){console.error("THREE.WebGLState:",R)}}c(X,"we");function de(){try{e.compressedTexSubImage3D(...arguments)}catch(R){console.error("THREE.WebGLState:",R)}}c(de,"Te");function ie(){try{e.texStorage2D(...arguments)}catch(R){console.error("THREE.WebGLState:",R)}}c(ie,"Ee");function ve(){try{e.texStorage3D(...arguments)}catch(R){console.error("THREE.WebGLState:",R)}}c(ve,"De");function Se(){try{e.texImage2D(...arguments)}catch(R){console.error("THREE.WebGLState:",R)}}c(Se,"Oe");function ee(){try{e.texImage3D(...arguments)}catch(R){console.error("THREE.WebGLState:",R)}}c(ee,"ke");function se(R){Ze.equals(R)===!1&&(e.scissor(R.x,R.y,R.z,R.w),Ze.copy(R))}c(se,"Ae");function we(R){W.equals(R)===!1&&(e.viewport(R.x,R.y,R.z,R.w),W.copy(R))}c(we,"je");function Ee(R,le){let ae=h.get(le);ae===void 0&&(ae=new WeakMap,h.set(le,ae));let me=ae.get(R);me===void 0&&(me=e.getUniformBlockIndex(le,R.name),ae.set(R,me))}c(Ee,"Me");function oe(R,le){let ae=h.get(le).get(R);l.get(le)!==ae&&(e.uniformBlockBinding(le,ae,R.__bindingPointIndex),l.set(le,ae))}c(oe,"Ne");function Oe(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),s.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),u={},te=null,fe={},d={},p=new WeakMap,g=[],y=null,v=!1,m=null,f=null,w=null,S=null,b=null,I=null,L=null,P=new ze(0,0,0),B=0,E=!1,M=null,C=null,V=null,H=null,k=null,Ze.set(0,0,e.canvas.width,e.canvas.height),W.set(0,0,e.canvas.width,e.canvas.height),n.reset(),s.reset(),o.reset()}return c(Oe,"Pe"),{buffers:{color:n,depth:s,stencil:o},enable:ce,disable:_e,bindFramebuffer:Re,drawBuffers:De,useProgram:We,setBlending:Ge,setMaterial:qe,setFlipSided:Te,setCullFace:$e,setLineWidth:ye,setPolygonOffset:Ae,setScissorTest:dt,activeTexture:ut,bindTexture:st,unbindTexture:T,compressedTexImage2D:_,compressedTexImage3D:N,texImage2D:Se,texImage3D:ee,updateUBOMapping:Ee,uniformBlockBinding:oe,texStorage2D:ie,texStorage3D:ve,texSubImage2D:q,texSubImage3D:K,compressedTexSubImage2D:X,compressedTexSubImage3D:de,scissor:se,viewport:we,reset:Oe}}c(Tu,"Bh");function bu(e,t,i,r,a,n,s){let o=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),h=new Be,u=new WeakMap,d,p=new WeakMap,g=!1;try{g=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function y(T,_){return g?new OffscreenCanvas(T,_):Wr("canvas")}c(y,"m");function v(T,_,N){let q=1,K=st(T);if((K.width>N||K.height>N)&&(q=N/Math.max(K.width,K.height)),q<1){if(typeof HTMLImageElement<"u"&&T instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&T instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&T instanceof ImageBitmap||typeof VideoFrame<"u"&&T instanceof VideoFrame){let X=Math.floor(q*K.width),de=Math.floor(q*K.height);d===void 0&&(d=y(X,de));let ie=_?y(X,de):d;return ie.width=X,ie.height=de,ie.getContext("2d").drawImage(T,0,0,X,de),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+K.width+"x"+K.height+") to ("+X+"x"+de+")."),ie}return"data"in T&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+K.width+"x"+K.height+")."),T}return T}c(v,"h");function m(T){return T.generateMipmaps}c(m,"g");function f(T){e.generateMipmap(T)}c(f,"_");function w(T){return T.isWebGLCubeRenderTarget?e.TEXTURE_CUBE_MAP:T.isWebGL3DRenderTarget?e.TEXTURE_3D:T.isWebGLArrayRenderTarget||T.isCompressedArrayTexture?e.TEXTURE_2D_ARRAY:e.TEXTURE_2D}c(w,"v");function S(T,_,N,q,K=!1){if(T!==null){if(e[T]!==void 0)return e[T];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+T+"'")}let X=_;if(_===e.RED&&(N===e.FLOAT&&(X=e.R32F),N===e.HALF_FLOAT&&(X=e.R16F),N===e.UNSIGNED_BYTE&&(X=e.R8)),_===e.RED_INTEGER&&(N===e.UNSIGNED_BYTE&&(X=e.R8UI),N===e.UNSIGNED_SHORT&&(X=e.R16UI),N===e.UNSIGNED_INT&&(X=e.R32UI),N===e.BYTE&&(X=e.R8I),N===e.SHORT&&(X=e.R16I),N===e.INT&&(X=e.R32I)),_===e.RG&&(N===e.FLOAT&&(X=e.RG32F),N===e.HALF_FLOAT&&(X=e.RG16F),N===e.UNSIGNED_BYTE&&(X=e.RG8)),_===e.RG_INTEGER&&(N===e.UNSIGNED_BYTE&&(X=e.RG8UI),N===e.UNSIGNED_SHORT&&(X=e.RG16UI),N===e.UNSIGNED_INT&&(X=e.RG32UI),N===e.BYTE&&(X=e.RG8I),N===e.SHORT&&(X=e.RG16I),N===e.INT&&(X=e.RG32I)),_===e.RGB_INTEGER&&(N===e.UNSIGNED_BYTE&&(X=e.RGB8UI),N===e.UNSIGNED_SHORT&&(X=e.RGB16UI),N===e.UNSIGNED_INT&&(X=e.RGB32UI),N===e.BYTE&&(X=e.RGB8I),N===e.SHORT&&(X=e.RGB16I),N===e.INT&&(X=e.RGB32I)),_===e.RGBA_INTEGER&&(N===e.UNSIGNED_BYTE&&(X=e.RGBA8UI),N===e.UNSIGNED_SHORT&&(X=e.RGBA16UI),N===e.UNSIGNED_INT&&(X=e.RGBA32UI),N===e.BYTE&&(X=e.RGBA8I),N===e.SHORT&&(X=e.RGBA16I),N===e.INT&&(X=e.RGBA32I)),_===e.RGB&&N===e.UNSIGNED_INT_5_9_9_9_REV&&(X=e.RGB9_E5),_===e.RGBA){let de=K?qr:ke.getTransfer(q);N===e.FLOAT&&(X=e.RGBA32F),N===e.HALF_FLOAT&&(X=e.RGBA16F),N===e.UNSIGNED_BYTE&&(X=de==="srgb"?e.SRGB8_ALPHA8:e.RGBA8),N===e.UNSIGNED_SHORT_4_4_4_4&&(X=e.RGBA4),N===e.UNSIGNED_SHORT_5_5_5_1&&(X=e.RGB5_A1)}return(X===e.R16F||X===e.R32F||X===e.RG16F||X===e.RG32F||X===e.RGBA16F||X===e.RGBA32F)&&t.get("EXT_color_buffer_float"),X}c(S,"y");function b(T,_){let N;return T?_===null||_===1014||_===1020?N=e.DEPTH24_STENCIL8:_===1015?N=e.DEPTH32F_STENCIL8:_===1012&&(N=e.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):_===null||_===1014||_===1020?N=e.DEPTH_COMPONENT24:_===1015?N=e.DEPTH_COMPONENT32F:_===1012&&(N=e.DEPTH_COMPONENT16),N}c(b,"b");function I(T,_){return m(T)===!0||T.isFramebufferTexture&&T.minFilter!==1003&&T.minFilter!==1006?Math.log2(Math.max(_.width,_.height))+1:T.mipmaps!==void 0&&T.mipmaps.length>0?T.mipmaps.length:T.isCompressedTexture&&Array.isArray(T.image)?_.mipmaps.length:1}c(I,"x");function L(T){let _=T.target;_.removeEventListener("dispose",L),B(_),_.isVideoTexture&&u.delete(_)}c(L,"S");function P(T){let _=T.target;_.removeEventListener("dispose",P),M(_)}c(P,"C");function B(T){let _=r.get(T);if(_.__webglInit===void 0)return;let N=T.source,q=p.get(N);if(q){let K=q[_.__cacheKey];K.usedTimes--,K.usedTimes===0&&E(T),Object.keys(q).length===0&&p.delete(N)}r.remove(T)}c(B,"w");function E(T){let _=r.get(T);e.deleteTexture(_.__webglTexture);let N=T.source,q=p.get(N);delete q[_.__cacheKey],s.memory.textures--}c(E,"T");function M(T){let _=r.get(T);if(T.depthTexture&&(T.depthTexture.dispose(),r.remove(T.depthTexture)),T.isWebGLCubeRenderTarget)for(let q=0;q<6;q++){if(Array.isArray(_.__webglFramebuffer[q]))for(let K=0;K<_.__webglFramebuffer[q].length;K++)e.deleteFramebuffer(_.__webglFramebuffer[q][K]);else e.deleteFramebuffer(_.__webglFramebuffer[q]);_.__webglDepthbuffer&&e.deleteRenderbuffer(_.__webglDepthbuffer[q])}else{if(Array.isArray(_.__webglFramebuffer))for(let q=0;q<_.__webglFramebuffer.length;q++)e.deleteFramebuffer(_.__webglFramebuffer[q]);else e.deleteFramebuffer(_.__webglFramebuffer);if(_.__webglDepthbuffer&&e.deleteRenderbuffer(_.__webglDepthbuffer),_.__webglMultisampledFramebuffer&&e.deleteFramebuffer(_.__webglMultisampledFramebuffer),_.__webglColorRenderbuffer)for(let q=0;q<_.__webglColorRenderbuffer.length;q++)_.__webglColorRenderbuffer[q]&&e.deleteRenderbuffer(_.__webglColorRenderbuffer[q]);_.__webglDepthRenderbuffer&&e.deleteRenderbuffer(_.__webglDepthRenderbuffer)}let N=T.textures;for(let q=0,K=N.length;q<K;q++){let X=r.get(N[q]);X.__webglTexture&&(e.deleteTexture(X.__webglTexture),s.memory.textures--),r.remove(N[q])}r.remove(T)}c(M,"D");let C=0;function V(){C=0}c(V,"k");function H(){let T=C;return T>=a.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+T+" texture units while this GPU supports only "+a.maxTextures),C+=1,T}c(H,"ee");function k(T){let _=[];return _.push(T.wrapS),_.push(T.wrapT),_.push(T.wrapR||0),_.push(T.magFilter),_.push(T.minFilter),_.push(T.anisotropy),_.push(T.internalFormat),_.push(T.format),_.push(T.type),_.push(T.generateMipmaps),_.push(T.premultiplyAlpha),_.push(T.flipY),_.push(T.unpackAlignment),_.push(T.colorSpace),_.join()}c(k,"A");function Z(T,_){let N=r.get(T);if(T.isVideoTexture&&dt(T),T.isRenderTargetTexture===!1&&T.isExternalTexture!==!0&&T.version>0&&N.__version!==T.version){let q=T.image;if(q===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(q.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{Me(N,T,_);return}}else T.isExternalTexture&&(N.__webglTexture=T.sourceTexture?T.sourceTexture:null);i.bindTexture(e.TEXTURE_2D,N.__webglTexture,e.TEXTURE0+_)}c(Z,"te");function G(T,_){let N=r.get(T);if(T.isRenderTargetTexture===!1&&T.version>0&&N.__version!==T.version){Me(N,T,_);return}i.bindTexture(e.TEXTURE_2D_ARRAY,N.__webglTexture,e.TEXTURE0+_)}c(G,"j");function $(T,_){let N=r.get(T);if(T.isRenderTargetTexture===!1&&T.version>0&&N.__version!==T.version){Me(N,T,_);return}i.bindTexture(e.TEXTURE_3D,N.__webglTexture,e.TEXTURE0+_)}c($,"ne");function j(T,_){let N=r.get(T);if(T.version>0&&N.__version!==T.version){ce(N,T,_);return}i.bindTexture(e.TEXTURE_CUBE_MAP,N.__webglTexture,e.TEXTURE0+_)}c(j,"M");let te={[Da]:e.REPEAT,[di]:e.CLAMP_TO_EDGE,[Ia]:e.MIRRORED_REPEAT},fe={[Kt]:e.NEAREST,[Lo]:e.NEAREST_MIPMAP_NEAREST,[Uo]:e.NEAREST_MIPMAP_LINEAR,[_i]:e.LINEAR,[Do]:e.LINEAR_MIPMAP_NEAREST,[Va]:e.LINEAR_MIPMAP_LINEAR},Ue={512:e.NEVER,519:e.ALWAYS,513:e.LESS,515:e.LEQUAL,514:e.EQUAL,518:e.GEQUAL,516:e.GREATER,517:e.NOTEQUAL};function He(T,_){if(_.type===1015&&t.has("OES_texture_float_linear")===!1&&(_.magFilter===1006||_.magFilter===1007||_.magFilter===1005||_.magFilter===1008||_.minFilter===1006||_.minFilter===1007||_.minFilter===1005||_.minFilter===1008)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),e.texParameteri(T,e.TEXTURE_WRAP_S,te[_.wrapS]),e.texParameteri(T,e.TEXTURE_WRAP_T,te[_.wrapT]),(T===e.TEXTURE_3D||T===e.TEXTURE_2D_ARRAY)&&e.texParameteri(T,e.TEXTURE_WRAP_R,te[_.wrapR]),e.texParameteri(T,e.TEXTURE_MAG_FILTER,fe[_.magFilter]),e.texParameteri(T,e.TEXTURE_MIN_FILTER,fe[_.minFilter]),_.compareFunction&&(e.texParameteri(T,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(T,e.TEXTURE_COMPARE_FUNC,Ue[_.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(_.magFilter===1003||_.minFilter!==1005&&_.minFilter!==1008||_.type===1015&&t.has("OES_texture_float_linear")===!1)return;if(_.anisotropy>1||r.get(_).__currentAnisotropy){let N=t.get("EXT_texture_filter_anisotropic");e.texParameterf(T,N.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(_.anisotropy,a.getMaxAnisotropy())),r.get(_).__currentAnisotropy=_.anisotropy}}}c(He,"ae");function Ze(T,_){let N=!1;T.__webglInit===void 0&&(T.__webglInit=!0,_.addEventListener("dispose",L));let q=_.source,K=p.get(q);K===void 0&&(K={},p.set(q,K));let X=k(_);if(X!==T.__cacheKey){K[X]===void 0&&(K[X]={texture:e.createTexture(),usedTimes:0},s.memory.textures++,N=!0),K[X].usedTimes++;let de=K[T.__cacheKey];de!==void 0&&(K[T.__cacheKey].usedTimes--,de.usedTimes===0&&E(_)),T.__cacheKey=X,T.__webglTexture=K[X].texture}return N}c(Ze,"oe");function W(T,_,N){return Math.floor(Math.floor(T/N)/_)}c(W,"P");function re(T,_,N,q){let K=T.updateRanges;if(K.length===0)i.texSubImage2D(e.TEXTURE_2D,0,0,0,_.width,_.height,N,q,_.data);else{K.sort((Se,ee)=>Se.start-ee.start);let X=0;for(let Se=1;Se<K.length;Se++){let ee=K[X],se=K[Se],we=ee.start+ee.count,Ee=W(se.start,_.width,4),oe=W(ee.start,_.width,4);se.start<=we+1&&Ee===oe&&W(se.start+se.count-1,_.width,4)===Ee?ee.count=Math.max(ee.count,se.start+se.count-ee.start):(++X,K[X]=se)}K.length=X+1;let de=e.getParameter(e.UNPACK_ROW_LENGTH),ie=e.getParameter(e.UNPACK_SKIP_PIXELS),ve=e.getParameter(e.UNPACK_SKIP_ROWS);e.pixelStorei(e.UNPACK_ROW_LENGTH,_.width);for(let Se=0,ee=K.length;Se<ee;Se++){let se=K[Se],we=Math.floor(se.start/4),Ee=Math.ceil(se.count/4),oe=we%_.width,Oe=Math.floor(we/_.width),R=Ee;e.pixelStorei(e.UNPACK_SKIP_PIXELS,oe),e.pixelStorei(e.UNPACK_SKIP_ROWS,Oe),i.texSubImage2D(e.TEXTURE_2D,0,oe,Oe,R,1,N,q,_.data)}T.clearUpdateRanges(),e.pixelStorei(e.UNPACK_ROW_LENGTH,de),e.pixelStorei(e.UNPACK_SKIP_PIXELS,ie),e.pixelStorei(e.UNPACK_SKIP_ROWS,ve)}}c(re,"F");function Me(T,_,N){let q=e.TEXTURE_2D;(_.isDataArrayTexture||_.isCompressedArrayTexture)&&(q=e.TEXTURE_2D_ARRAY),_.isData3DTexture&&(q=e.TEXTURE_3D);let K=Ze(T,_),X=_.source;i.bindTexture(q,T.__webglTexture,e.TEXTURE0+N);let de=r.get(X);if(X.version!==de.__version||K===!0){i.activeTexture(e.TEXTURE0+N);let ie=ke.getPrimaries(ke.workingColorSpace),ve=_.colorSpace===""?null:ke.getPrimaries(_.colorSpace),Se=_.colorSpace===""||ie===ve?e.NONE:e.BROWSER_DEFAULT_WEBGL;e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,_.flipY),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,_.premultiplyAlpha),e.pixelStorei(e.UNPACK_ALIGNMENT,_.unpackAlignment),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,Se);let ee=v(_.image,!1,a.maxTextureSize);ee=ut(_,ee);let se=n.convert(_.format,_.colorSpace),we=n.convert(_.type),Ee=S(_.internalFormat,se,we,_.colorSpace,_.isVideoTexture);He(q,_);let oe,Oe=_.mipmaps,R=_.isVideoTexture!==!0,le=de.__version===void 0||K===!0,ae=X.dataReady,me=I(_,ee);if(_.isDepthTexture)Ee=b(_.format===es,_.type),le&&(R?i.texStorage2D(e.TEXTURE_2D,1,Ee,ee.width,ee.height):i.texImage2D(e.TEXTURE_2D,0,Ee,ee.width,ee.height,0,se,we,null));else if(_.isDataTexture)if(Oe.length>0){R&&le&&i.texStorage2D(e.TEXTURE_2D,me,Ee,Oe[0].width,Oe[0].height);for(let Q=0,Y=Oe.length;Q<Y;Q++)oe=Oe[Q],R?ae&&i.texSubImage2D(e.TEXTURE_2D,Q,0,0,oe.width,oe.height,se,we,oe.data):i.texImage2D(e.TEXTURE_2D,Q,Ee,oe.width,oe.height,0,se,we,oe.data);_.generateMipmaps=!1}else R?(le&&i.texStorage2D(e.TEXTURE_2D,me,Ee,ee.width,ee.height),ae&&re(_,ee,se,we)):i.texImage2D(e.TEXTURE_2D,0,Ee,ee.width,ee.height,0,se,we,ee.data);else if(_.isCompressedTexture)if(_.isCompressedArrayTexture){R&&le&&i.texStorage3D(e.TEXTURE_2D_ARRAY,me,Ee,Oe[0].width,Oe[0].height,ee.depth);for(let Q=0,Y=Oe.length;Q<Y;Q++)if(oe=Oe[Q],_.format!==1023)if(se!==null)if(R){if(ae)if(_.layerUpdates.size>0){let ge=ms(oe.width,oe.height,_.format,_.type);for(let be of _.layerUpdates){let rt=oe.data.subarray(be*ge/oe.data.BYTES_PER_ELEMENT,(be+1)*ge/oe.data.BYTES_PER_ELEMENT);i.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,Q,0,0,be,oe.width,oe.height,1,se,rt)}_.clearLayerUpdates()}else i.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,Q,0,0,0,oe.width,oe.height,ee.depth,se,oe.data)}else i.compressedTexImage3D(e.TEXTURE_2D_ARRAY,Q,Ee,oe.width,oe.height,ee.depth,0,oe.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else R?ae&&i.texSubImage3D(e.TEXTURE_2D_ARRAY,Q,0,0,0,oe.width,oe.height,ee.depth,se,we,oe.data):i.texImage3D(e.TEXTURE_2D_ARRAY,Q,Ee,oe.width,oe.height,ee.depth,0,se,we,oe.data)}else{R&&le&&i.texStorage2D(e.TEXTURE_2D,me,Ee,Oe[0].width,Oe[0].height);for(let Q=0,Y=Oe.length;Q<Y;Q++)oe=Oe[Q],_.format===1023?R?ae&&i.texSubImage2D(e.TEXTURE_2D,Q,0,0,oe.width,oe.height,se,we,oe.data):i.texImage2D(e.TEXTURE_2D,Q,Ee,oe.width,oe.height,0,se,we,oe.data):se===null?console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):R?ae&&i.compressedTexSubImage2D(e.TEXTURE_2D,Q,0,0,oe.width,oe.height,se,oe.data):i.compressedTexImage2D(e.TEXTURE_2D,Q,Ee,oe.width,oe.height,0,oe.data)}else if(_.isDataArrayTexture)if(R){if(le&&i.texStorage3D(e.TEXTURE_2D_ARRAY,me,Ee,ee.width,ee.height,ee.depth),ae)if(_.layerUpdates.size>0){let Q=ms(ee.width,ee.height,_.format,_.type);for(let Y of _.layerUpdates){let ge=ee.data.subarray(Y*Q/ee.data.BYTES_PER_ELEMENT,(Y+1)*Q/ee.data.BYTES_PER_ELEMENT);i.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,Y,ee.width,ee.height,1,se,we,ge)}_.clearLayerUpdates()}else i.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,ee.width,ee.height,ee.depth,se,we,ee.data)}else i.texImage3D(e.TEXTURE_2D_ARRAY,0,Ee,ee.width,ee.height,ee.depth,0,se,we,ee.data);else if(_.isData3DTexture)R?(le&&i.texStorage3D(e.TEXTURE_3D,me,Ee,ee.width,ee.height,ee.depth),ae&&i.texSubImage3D(e.TEXTURE_3D,0,0,0,0,ee.width,ee.height,ee.depth,se,we,ee.data)):i.texImage3D(e.TEXTURE_3D,0,Ee,ee.width,ee.height,ee.depth,0,se,we,ee.data);else if(_.isFramebufferTexture){if(le)if(R)i.texStorage2D(e.TEXTURE_2D,me,Ee,ee.width,ee.height);else{let Q=ee.width,Y=ee.height;for(let ge=0;ge<me;ge++)i.texImage2D(e.TEXTURE_2D,ge,Ee,Q,Y,0,se,we,null),Q>>=1,Y>>=1}}else if(Oe.length>0){if(R&&le){let Q=st(Oe[0]);i.texStorage2D(e.TEXTURE_2D,me,Ee,Q.width,Q.height)}for(let Q=0,Y=Oe.length;Q<Y;Q++)oe=Oe[Q],R?ae&&i.texSubImage2D(e.TEXTURE_2D,Q,0,0,se,we,oe):i.texImage2D(e.TEXTURE_2D,Q,Ee,se,we,oe);_.generateMipmaps=!1}else if(R){if(le){let Q=st(ee);i.texStorage2D(e.TEXTURE_2D,me,Ee,Q.width,Q.height)}ae&&i.texSubImage2D(e.TEXTURE_2D,0,0,0,se,we,ee)}else i.texImage2D(e.TEXTURE_2D,0,Ee,se,we,ee);m(_)&&f(q),de.__version=X.version,_.onUpdate&&_.onUpdate(_)}T.__version=_.version}c(Me,"se");function ce(T,_,N){if(_.image.length!==6)return;let q=Ze(T,_),K=_.source;i.bindTexture(e.TEXTURE_CUBE_MAP,T.__webglTexture,e.TEXTURE0+N);let X=r.get(K);if(K.version!==X.__version||q===!0){i.activeTexture(e.TEXTURE0+N);let de=ke.getPrimaries(ke.workingColorSpace),ie=_.colorSpace===""?null:ke.getPrimaries(_.colorSpace),ve=_.colorSpace===""||de===ie?e.NONE:e.BROWSER_DEFAULT_WEBGL;e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,_.flipY),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,_.premultiplyAlpha),e.pixelStorei(e.UNPACK_ALIGNMENT,_.unpackAlignment),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,ve);let Se=_.isCompressedTexture||_.image[0].isCompressedTexture,ee=_.image[0]&&_.image[0].isDataTexture,se=[];for(let Y=0;Y<6;Y++)!Se&&!ee?se[Y]=v(_.image[Y],!0,a.maxCubemapSize):se[Y]=ee?_.image[Y].image:_.image[Y],se[Y]=ut(_,se[Y]);let we=se[0],Ee=n.convert(_.format,_.colorSpace),oe=n.convert(_.type),Oe=S(_.internalFormat,Ee,oe,_.colorSpace),R=_.isVideoTexture!==!0,le=X.__version===void 0||q===!0,ae=K.dataReady,me=I(_,we);He(e.TEXTURE_CUBE_MAP,_);let Q;if(Se){R&&le&&i.texStorage2D(e.TEXTURE_CUBE_MAP,me,Oe,we.width,we.height);for(let Y=0;Y<6;Y++){Q=se[Y].mipmaps;for(let ge=0;ge<Q.length;ge++){let be=Q[ge];_.format===1023?R?ae&&i.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,ge,0,0,be.width,be.height,Ee,oe,be.data):i.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,ge,Oe,be.width,be.height,0,Ee,oe,be.data):Ee===null?console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):R?ae&&i.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,ge,0,0,be.width,be.height,Ee,be.data):i.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,ge,Oe,be.width,be.height,0,be.data)}}}else{if(Q=_.mipmaps,R&&le){Q.length>0&&me++;let Y=st(se[0]);i.texStorage2D(e.TEXTURE_CUBE_MAP,me,Oe,Y.width,Y.height)}for(let Y=0;Y<6;Y++)if(ee){R?ae&&i.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,0,0,se[Y].width,se[Y].height,Ee,oe,se[Y].data):i.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,Oe,se[Y].width,se[Y].height,0,Ee,oe,se[Y].data);for(let ge=0;ge<Q.length;ge++){let be=Q[ge].image[Y].image;R?ae&&i.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,ge+1,0,0,be.width,be.height,Ee,oe,be.data):i.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,ge+1,Oe,be.width,be.height,0,Ee,oe,be.data)}}else{R?ae&&i.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,0,0,Ee,oe,se[Y]):i.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,Oe,Ee,oe,se[Y]);for(let ge=0;ge<Q.length;ge++){let be=Q[ge];R?ae&&i.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,ge+1,0,0,Ee,oe,be.image[Y]):i.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,ge+1,Oe,Ee,oe,be.image[Y])}}}m(_)&&f(e.TEXTURE_CUBE_MAP),X.__version=K.version,_.onUpdate&&_.onUpdate(_)}T.__version=_.version}c(ce,"ce");function _e(T,_,N,q,K,X){let de=n.convert(N.format,N.colorSpace),ie=n.convert(N.type),ve=S(N.internalFormat,de,ie,N.colorSpace),Se=r.get(_),ee=r.get(N);if(ee.__renderTarget=_,!Se.__hasExternalTextures){let se=Math.max(1,_.width>>X),we=Math.max(1,_.height>>X);K===e.TEXTURE_3D||K===e.TEXTURE_2D_ARRAY?i.texImage3D(K,X,ve,se,we,_.depth,0,de,ie,null):i.texImage2D(K,X,ve,se,we,0,de,ie,null)}i.bindFramebuffer(e.FRAMEBUFFER,T),Ae(_)?o.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,q,K,ee.__webglTexture,0,ye(_)):(K===e.TEXTURE_2D||K>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&K<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&e.framebufferTexture2D(e.FRAMEBUFFER,q,K,ee.__webglTexture,X),i.bindFramebuffer(e.FRAMEBUFFER,null)}c(_e,"le");function Re(T,_,N){if(e.bindRenderbuffer(e.RENDERBUFFER,T),_.depthBuffer){let q=_.depthTexture,K=q&&q.isDepthTexture?q.type:null,X=b(_.stencilBuffer,K),de=_.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,ie=ye(_);Ae(_)?o.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,ie,X,_.width,_.height):N?e.renderbufferStorageMultisample(e.RENDERBUFFER,ie,X,_.width,_.height):e.renderbufferStorage(e.RENDERBUFFER,X,_.width,_.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,de,e.RENDERBUFFER,T)}else{let q=_.textures;for(let K=0;K<q.length;K++){let X=q[K],de=n.convert(X.format,X.colorSpace),ie=n.convert(X.type),ve=S(X.internalFormat,de,ie,X.colorSpace),Se=ye(_);N&&Ae(_)===!1?e.renderbufferStorageMultisample(e.RENDERBUFFER,Se,ve,_.width,_.height):Ae(_)?o.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Se,ve,_.width,_.height):e.renderbufferStorage(e.RENDERBUFFER,ve,_.width,_.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}c(Re,"ue");function De(T,_){if(_&&_.isWebGLCubeRenderTarget)throw Error("Depth Texture with cube render targets is not supported");if(i.bindFramebuffer(e.FRAMEBUFFER,T),!(_.depthTexture&&_.depthTexture.isDepthTexture))throw Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");let N=r.get(_.depthTexture);N.__renderTarget=_,(!N.__webglTexture||_.depthTexture.image.width!==_.width||_.depthTexture.image.height!==_.height)&&(_.depthTexture.image.width=_.width,_.depthTexture.image.height=_.height,_.depthTexture.needsUpdate=!0),Z(_.depthTexture,0);let q=N.__webglTexture,K=ye(_);if(_.depthTexture.format===1026)Ae(_)?o.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,q,0,K):e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,q,0);else if(_.depthTexture.format===1027)Ae(_)?o.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.TEXTURE_2D,q,0,K):e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.TEXTURE_2D,q,0);else throw Error("Unknown depthTexture format")}c(De,"de");function We(T){let _=r.get(T),N=T.isWebGLCubeRenderTarget===!0;if(_.__boundDepthTexture!==T.depthTexture){let q=T.depthTexture;if(_.__depthDisposeCallback&&_.__depthDisposeCallback(),q){let K=c(()=>{delete _.__boundDepthTexture,delete _.__depthDisposeCallback,q.removeEventListener("dispose",K)},"t");q.addEventListener("dispose",K),_.__depthDisposeCallback=K}_.__boundDepthTexture=q}if(T.depthTexture&&!_.__autoAllocateDepthBuffer){if(N)throw Error("target.depthTexture not supported in Cube render targets");let q=T.texture.mipmaps;q&&q.length>0?De(_.__webglFramebuffer[0],T):De(_.__webglFramebuffer,T)}else if(N){_.__webglDepthbuffer=[];for(let q=0;q<6;q++)if(i.bindFramebuffer(e.FRAMEBUFFER,_.__webglFramebuffer[q]),_.__webglDepthbuffer[q]===void 0)_.__webglDepthbuffer[q]=e.createRenderbuffer(),Re(_.__webglDepthbuffer[q],T,!1);else{let K=T.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,X=_.__webglDepthbuffer[q];e.bindRenderbuffer(e.RENDERBUFFER,X),e.framebufferRenderbuffer(e.FRAMEBUFFER,K,e.RENDERBUFFER,X)}}else{let q=T.texture.mipmaps;if(q&&q.length>0?i.bindFramebuffer(e.FRAMEBUFFER,_.__webglFramebuffer[0]):i.bindFramebuffer(e.FRAMEBUFFER,_.__webglFramebuffer),_.__webglDepthbuffer===void 0)_.__webglDepthbuffer=e.createRenderbuffer(),Re(_.__webglDepthbuffer,T,!1);else{let K=T.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,X=_.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,X),e.framebufferRenderbuffer(e.FRAMEBUFFER,K,e.RENDERBUFFER,X)}}i.bindFramebuffer(e.FRAMEBUFFER,null)}c(We,"fe");function A(T,_,N){let q=r.get(T);_!==void 0&&_e(q.__webglFramebuffer,T,T.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0),N!==void 0&&We(T)}c(A,"pe");function ct(T){let _=T.texture,N=r.get(T),q=r.get(_);T.addEventListener("dispose",P);let K=T.textures,X=T.isWebGLCubeRenderTarget===!0,de=K.length>1;if(de||(q.__webglTexture===void 0&&(q.__webglTexture=e.createTexture()),q.__version=_.version,s.memory.textures++),X){N.__webglFramebuffer=[];for(let ie=0;ie<6;ie++)if(_.mipmaps&&_.mipmaps.length>0){N.__webglFramebuffer[ie]=[];for(let ve=0;ve<_.mipmaps.length;ve++)N.__webglFramebuffer[ie][ve]=e.createFramebuffer()}else N.__webglFramebuffer[ie]=e.createFramebuffer()}else{if(_.mipmaps&&_.mipmaps.length>0){N.__webglFramebuffer=[];for(let ie=0;ie<_.mipmaps.length;ie++)N.__webglFramebuffer[ie]=e.createFramebuffer()}else N.__webglFramebuffer=e.createFramebuffer();if(de)for(let ie=0,ve=K.length;ie<ve;ie++){let Se=r.get(K[ie]);Se.__webglTexture===void 0&&(Se.__webglTexture=e.createTexture(),s.memory.textures++)}if(T.samples>0&&Ae(T)===!1){N.__webglMultisampledFramebuffer=e.createFramebuffer(),N.__webglColorRenderbuffer=[],i.bindFramebuffer(e.FRAMEBUFFER,N.__webglMultisampledFramebuffer);for(let ie=0;ie<K.length;ie++){let ve=K[ie];N.__webglColorRenderbuffer[ie]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,N.__webglColorRenderbuffer[ie]);let Se=n.convert(ve.format,ve.colorSpace),ee=n.convert(ve.type),se=S(ve.internalFormat,Se,ee,ve.colorSpace,T.isXRRenderTarget===!0),we=ye(T);e.renderbufferStorageMultisample(e.RENDERBUFFER,we,se,T.width,T.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+ie,e.RENDERBUFFER,N.__webglColorRenderbuffer[ie])}e.bindRenderbuffer(e.RENDERBUFFER,null),T.depthBuffer&&(N.__webglDepthRenderbuffer=e.createRenderbuffer(),Re(N.__webglDepthRenderbuffer,T,!0)),i.bindFramebuffer(e.FRAMEBUFFER,null)}}if(X){i.bindTexture(e.TEXTURE_CUBE_MAP,q.__webglTexture),He(e.TEXTURE_CUBE_MAP,_);for(let ie=0;ie<6;ie++)if(_.mipmaps&&_.mipmaps.length>0)for(let ve=0;ve<_.mipmaps.length;ve++)_e(N.__webglFramebuffer[ie][ve],T,_,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+ie,ve);else _e(N.__webglFramebuffer[ie],T,_,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+ie,0);m(_)&&f(e.TEXTURE_CUBE_MAP),i.unbindTexture()}else if(de){for(let ie=0,ve=K.length;ie<ve;ie++){let Se=K[ie],ee=r.get(Se),se=e.TEXTURE_2D;(T.isWebGL3DRenderTarget||T.isWebGLArrayRenderTarget)&&(se=T.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),i.bindTexture(se,ee.__webglTexture),He(se,Se),_e(N.__webglFramebuffer,T,Se,e.COLOR_ATTACHMENT0+ie,se,0),m(Se)&&f(se)}i.unbindTexture()}else{let ie=e.TEXTURE_2D;if((T.isWebGL3DRenderTarget||T.isWebGLArrayRenderTarget)&&(ie=T.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),i.bindTexture(ie,q.__webglTexture),He(ie,_),_.mipmaps&&_.mipmaps.length>0)for(let ve=0;ve<_.mipmaps.length;ve++)_e(N.__webglFramebuffer[ve],T,_,e.COLOR_ATTACHMENT0,ie,ve);else _e(N.__webglFramebuffer,T,_,e.COLOR_ATTACHMENT0,ie,0);m(_)&&f(ie),i.unbindTexture()}T.depthBuffer&&We(T)}c(ct,"me");function Ge(T){let _=T.textures;for(let N=0,q=_.length;N<q;N++){let K=_[N];if(m(K)){let X=w(T),de=r.get(K).__webglTexture;i.bindTexture(X,de),f(X),i.unbindTexture()}}}c(Ge,"I");let qe=[],Te=[];function $e(T){if(T.samples>0){if(Ae(T)===!1){let _=T.textures,N=T.width,q=T.height,K=e.COLOR_BUFFER_BIT,X=T.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,de=r.get(T),ie=_.length>1;if(ie)for(let Se=0;Se<_.length;Se++)i.bindFramebuffer(e.FRAMEBUFFER,de.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+Se,e.RENDERBUFFER,null),i.bindFramebuffer(e.FRAMEBUFFER,de.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+Se,e.TEXTURE_2D,null,0);i.bindFramebuffer(e.READ_FRAMEBUFFER,de.__webglMultisampledFramebuffer);let ve=T.texture.mipmaps;ve&&ve.length>0?i.bindFramebuffer(e.DRAW_FRAMEBUFFER,de.__webglFramebuffer[0]):i.bindFramebuffer(e.DRAW_FRAMEBUFFER,de.__webglFramebuffer);for(let Se=0;Se<_.length;Se++){if(T.resolveDepthBuffer&&(T.depthBuffer&&(K|=e.DEPTH_BUFFER_BIT),T.stencilBuffer&&T.resolveStencilBuffer&&(K|=e.STENCIL_BUFFER_BIT)),ie){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,de.__webglColorRenderbuffer[Se]);let ee=r.get(_[Se]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,ee,0)}e.blitFramebuffer(0,0,N,q,0,0,N,q,K,e.NEAREST),l===!0&&(qe.length=0,Te.length=0,qe.push(e.COLOR_ATTACHMENT0+Se),T.depthBuffer&&T.resolveDepthBuffer===!1&&(qe.push(X),Te.push(X),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,Te)),e.invalidateFramebuffer(e.READ_FRAMEBUFFER,qe))}if(i.bindFramebuffer(e.READ_FRAMEBUFFER,null),i.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),ie)for(let Se=0;Se<_.length;Se++){i.bindFramebuffer(e.FRAMEBUFFER,de.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+Se,e.RENDERBUFFER,de.__webglColorRenderbuffer[Se]);let ee=r.get(_[Se]).__webglTexture;i.bindFramebuffer(e.FRAMEBUFFER,de.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+Se,e.TEXTURE_2D,ee,0)}i.bindFramebuffer(e.DRAW_FRAMEBUFFER,de.__webglMultisampledFramebuffer)}else if(T.depthBuffer&&T.resolveDepthBuffer===!1&&l){let _=T.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[_])}}}c($e,"_e");function ye(T){return Math.min(a.maxSamples,T.samples)}c(ye,"L");function Ae(T){let _=r.get(T);return T.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&_.__useRenderToTexture!==!1}c(Ae,"ve");function dt(T){let _=s.render.frame;u.get(T)!==_&&(u.set(T,_),T.update())}c(dt,"R");function ut(T,_){let N=T.colorSpace,q=T.format,K=T.type;return T.isCompressedTexture===!0||T.isVideoTexture===!0||N!=="srgb-linear"&&N!==""&&(ke.getTransfer(N)==="srgb"?(q!==1023||K!==1009)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",N)),_}c(ut,"z");function st(T){return typeof HTMLImageElement<"u"&&T instanceof HTMLImageElement?(h.width=T.naturalWidth||T.width,h.height=T.naturalHeight||T.height):typeof VideoFrame<"u"&&T instanceof VideoFrame?(h.width=T.displayWidth,h.height=T.displayHeight):(h.width=T.width,h.height=T.height),h}c(st,"ye"),this.allocateTextureUnit=H,this.resetTextureUnits=V,this.setTexture2D=Z,this.setTexture2DArray=G,this.setTexture3D=$,this.setTextureCube=j,this.rebindTextures=A,this.setupRenderTarget=ct,this.updateRenderTargetMipmap=Ge,this.updateMultisampleRenderTarget=$e,this.setupDepthRenderbuffer=We,this.setupFrameBufferTexture=_e,this.useMultisampledRTT=Ae}c(bu,"Vh");function Au(e,t){function i(r,a=""){let n,s=ke.getTransfer(a);if(r===1009)return e.UNSIGNED_BYTE;if(r===1017)return e.UNSIGNED_SHORT_4_4_4_4;if(r===1018)return e.UNSIGNED_SHORT_5_5_5_1;if(r===35902)return e.UNSIGNED_INT_5_9_9_9_REV;if(r===1010)return e.BYTE;if(r===1011)return e.SHORT;if(r===1012)return e.UNSIGNED_SHORT;if(r===1013)return e.INT;if(r===1014)return e.UNSIGNED_INT;if(r===1015)return e.FLOAT;if(r===1016)return e.HALF_FLOAT;if(r===1021)return e.ALPHA;if(r===1022)return e.RGB;if(r===1023)return e.RGBA;if(r===1026)return e.DEPTH_COMPONENT;if(r===1027)return e.DEPTH_STENCIL;if(r===1028)return e.RED;if(r===1029)return e.RED_INTEGER;if(r===1030)return e.RG;if(r===1031)return e.RG_INTEGER;if(r===1033)return e.RGBA_INTEGER;if(r===33776||r===33777||r===33778||r===33779)if(s==="srgb")if(n=t.get("WEBGL_compressed_texture_s3tc_srgb"),n!==null){if(r===33776)return n.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(r===33777)return n.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(r===33778)return n.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(r===33779)return n.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(n=t.get("WEBGL_compressed_texture_s3tc"),n!==null){if(r===33776)return n.COMPRESSED_RGB_S3TC_DXT1_EXT;if(r===33777)return n.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(r===33778)return n.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(r===33779)return n.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(r===35840||r===35841||r===35842||r===35843)if(n=t.get("WEBGL_compressed_texture_pvrtc"),n!==null){if(r===35840)return n.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(r===35841)return n.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(r===35842)return n.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(r===35843)return n.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(r===36196||r===37492||r===37496)if(n=t.get("WEBGL_compressed_texture_etc"),n!==null){if(r===36196||r===37492)return s==="srgb"?n.COMPRESSED_SRGB8_ETC2:n.COMPRESSED_RGB8_ETC2;if(r===37496)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:n.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(r===37808||r===37809||r===37810||r===37811||r===37812||r===37813||r===37814||r===37815||r===37816||r===37817||r===37818||r===37819||r===37820||r===37821)if(n=t.get("WEBGL_compressed_texture_astc"),n!==null){if(r===37808)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:n.COMPRESSED_RGBA_ASTC_4x4_KHR;if(r===37809)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:n.COMPRESSED_RGBA_ASTC_5x4_KHR;if(r===37810)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:n.COMPRESSED_RGBA_ASTC_5x5_KHR;if(r===37811)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:n.COMPRESSED_RGBA_ASTC_6x5_KHR;if(r===37812)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:n.COMPRESSED_RGBA_ASTC_6x6_KHR;if(r===37813)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:n.COMPRESSED_RGBA_ASTC_8x5_KHR;if(r===37814)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:n.COMPRESSED_RGBA_ASTC_8x6_KHR;if(r===37815)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:n.COMPRESSED_RGBA_ASTC_8x8_KHR;if(r===37816)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:n.COMPRESSED_RGBA_ASTC_10x5_KHR;if(r===37817)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:n.COMPRESSED_RGBA_ASTC_10x6_KHR;if(r===37818)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:n.COMPRESSED_RGBA_ASTC_10x8_KHR;if(r===37819)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:n.COMPRESSED_RGBA_ASTC_10x10_KHR;if(r===37820)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:n.COMPRESSED_RGBA_ASTC_12x10_KHR;if(r===37821)return s==="srgb"?n.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:n.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(r===36492||r===36494||r===36495)if(n=t.get("EXT_texture_compression_bptc"),n!==null){if(r===36492)return s==="srgb"?n.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:n.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(r===36494)return n.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(r===36495)return n.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(r===36283||r===36284||r===36285||r===36286)if(n=t.get("EXT_texture_compression_rgtc"),n!==null){if(r===36492)return n.COMPRESSED_RED_RGTC1_EXT;if(r===36284)return n.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(r===36285)return n.COMPRESSED_RED_GREEN_RGTC2_EXT;if(r===36286)return n.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return r===1020?e.UNSIGNED_INT_24_8:e[r]===void 0?null:e[r]}return c(i,"n"),{convert:i}}c(Au,"Hh");function wu(e,t){function i(m,f){m.matrixAutoUpdate===!0&&m.updateMatrix(),f.value.copy(m.matrix)}c(i,"n");function r(m,f){f.color.getRGB(m.fogColor.value,Po(e)),f.isFog?(m.fogNear.value=f.near,m.fogFar.value=f.far):f.isFogExp2&&(m.fogDensity.value=f.density)}c(r,"r");function a(m,f,w,S,b){f.isMeshBasicMaterial||f.isMeshLambertMaterial?n(m,f):f.isMeshToonMaterial?(n(m,f),d(m,f)):f.isMeshPhongMaterial?(n(m,f),u(m,f)):f.isMeshStandardMaterial?(n(m,f),p(m,f),f.isMeshPhysicalMaterial&&g(m,f,b)):f.isMeshMatcapMaterial?(n(m,f),y(m,f)):f.isMeshDepthMaterial?n(m,f):f.isMeshDistanceMaterial?(n(m,f),v(m,f)):f.isMeshNormalMaterial?n(m,f):f.isLineBasicMaterial?(s(m,f),f.isLineDashedMaterial&&o(m,f)):f.isPointsMaterial?l(m,f,w,S):f.isSpriteMaterial?h(m,f):f.isShadowMaterial?(m.color.value.copy(f.color),m.opacity.value=f.opacity):f.isShaderMaterial&&(f.uniformsNeedUpdate=!1)}c(a,"i");function n(m,f){m.opacity.value=f.opacity,f.color&&m.diffuse.value.copy(f.color),f.emissive&&m.emissive.value.copy(f.emissive).multiplyScalar(f.emissiveIntensity),f.map&&(m.map.value=f.map,i(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,i(f.alphaMap,m.alphaMapTransform)),f.bumpMap&&(m.bumpMap.value=f.bumpMap,i(f.bumpMap,m.bumpMapTransform),m.bumpScale.value=f.bumpScale,f.side===1&&(m.bumpScale.value*=-1)),f.normalMap&&(m.normalMap.value=f.normalMap,i(f.normalMap,m.normalMapTransform),m.normalScale.value.copy(f.normalScale),f.side===1&&m.normalScale.value.negate()),f.displacementMap&&(m.displacementMap.value=f.displacementMap,i(f.displacementMap,m.displacementMapTransform),m.displacementScale.value=f.displacementScale,m.displacementBias.value=f.displacementBias),f.emissiveMap&&(m.emissiveMap.value=f.emissiveMap,i(f.emissiveMap,m.emissiveMapTransform)),f.specularMap&&(m.specularMap.value=f.specularMap,i(f.specularMap,m.specularMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest);let w=t.get(f),S=w.envMap,b=w.envMapRotation;S&&(m.envMap.value=S,gi.copy(b),gi.x*=-1,gi.y*=-1,gi.z*=-1,S.isCubeTexture&&S.isRenderTargetTexture===!1&&(gi.y*=-1,gi.z*=-1),m.envMapRotation.value.setFromMatrix4(lh.makeRotationFromEuler(gi)),m.flipEnvMap.value=S.isCubeTexture&&S.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=f.reflectivity,m.ior.value=f.ior,m.refractionRatio.value=f.refractionRatio),f.lightMap&&(m.lightMap.value=f.lightMap,m.lightMapIntensity.value=f.lightMapIntensity,i(f.lightMap,m.lightMapTransform)),f.aoMap&&(m.aoMap.value=f.aoMap,m.aoMapIntensity.value=f.aoMapIntensity,i(f.aoMap,m.aoMapTransform))}c(n,"a");function s(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,f.map&&(m.map.value=f.map,i(f.map,m.mapTransform))}c(s,"o");function o(m,f){m.dashSize.value=f.dashSize,m.totalSize.value=f.dashSize+f.gapSize,m.scale.value=f.scale}c(o,"s");function l(m,f,w,S){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.size.value=f.size*w,m.scale.value=S*.5,f.map&&(m.map.value=f.map,i(f.map,m.uvTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,i(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}c(l,"c");function h(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.rotation.value=f.rotation,f.map&&(m.map.value=f.map,i(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,i(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}c(h,"l");function u(m,f){m.specular.value.copy(f.specular),m.shininess.value=Math.max(f.shininess,1e-4)}c(u,"u");function d(m,f){f.gradientMap&&(m.gradientMap.value=f.gradientMap)}c(d,"d");function p(m,f){m.metalness.value=f.metalness,f.metalnessMap&&(m.metalnessMap.value=f.metalnessMap,i(f.metalnessMap,m.metalnessMapTransform)),m.roughness.value=f.roughness,f.roughnessMap&&(m.roughnessMap.value=f.roughnessMap,i(f.roughnessMap,m.roughnessMapTransform)),f.envMap&&(m.envMapIntensity.value=f.envMapIntensity)}c(p,"f");function g(m,f,w){m.ior.value=f.ior,f.sheen>0&&(m.sheenColor.value.copy(f.sheenColor).multiplyScalar(f.sheen),m.sheenRoughness.value=f.sheenRoughness,f.sheenColorMap&&(m.sheenColorMap.value=f.sheenColorMap,i(f.sheenColorMap,m.sheenColorMapTransform)),f.sheenRoughnessMap&&(m.sheenRoughnessMap.value=f.sheenRoughnessMap,i(f.sheenRoughnessMap,m.sheenRoughnessMapTransform))),f.clearcoat>0&&(m.clearcoat.value=f.clearcoat,m.clearcoatRoughness.value=f.clearcoatRoughness,f.clearcoatMap&&(m.clearcoatMap.value=f.clearcoatMap,i(f.clearcoatMap,m.clearcoatMapTransform)),f.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=f.clearcoatRoughnessMap,i(f.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),f.clearcoatNormalMap&&(m.clearcoatNormalMap.value=f.clearcoatNormalMap,i(f.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(f.clearcoatNormalScale),f.side===1&&m.clearcoatNormalScale.value.negate())),f.dispersion>0&&(m.dispersion.value=f.dispersion),f.iridescence>0&&(m.iridescence.value=f.iridescence,m.iridescenceIOR.value=f.iridescenceIOR,m.iridescenceThicknessMinimum.value=f.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=f.iridescenceThicknessRange[1],f.iridescenceMap&&(m.iridescenceMap.value=f.iridescenceMap,i(f.iridescenceMap,m.iridescenceMapTransform)),f.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=f.iridescenceThicknessMap,i(f.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),f.transmission>0&&(m.transmission.value=f.transmission,m.transmissionSamplerMap.value=w.texture,m.transmissionSamplerSize.value.set(w.width,w.height),f.transmissionMap&&(m.transmissionMap.value=f.transmissionMap,i(f.transmissionMap,m.transmissionMapTransform)),m.thickness.value=f.thickness,f.thicknessMap&&(m.thicknessMap.value=f.thicknessMap,i(f.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=f.attenuationDistance,m.attenuationColor.value.copy(f.attenuationColor)),f.anisotropy>0&&(m.anisotropyVector.value.set(f.anisotropy*Math.cos(f.anisotropyRotation),f.anisotropy*Math.sin(f.anisotropyRotation)),f.anisotropyMap&&(m.anisotropyMap.value=f.anisotropyMap,i(f.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=f.specularIntensity,m.specularColor.value.copy(f.specularColor),f.specularColorMap&&(m.specularColorMap.value=f.specularColorMap,i(f.specularColorMap,m.specularColorMapTransform)),f.specularIntensityMap&&(m.specularIntensityMap.value=f.specularIntensityMap,i(f.specularIntensityMap,m.specularIntensityMapTransform))}c(g,"p");function y(m,f){f.matcap&&(m.matcap.value=f.matcap)}c(y,"m");function v(m,f){let w=t.get(f).light;m.referencePosition.value.setFromMatrixPosition(w.matrixWorld),m.nearDistance.value=w.shadow.camera.near,m.farDistance.value=w.shadow.camera.far}return c(v,"h"),{refreshFogUniforms:r,refreshMaterialUniforms:a}}c(wu,"Uh");function Ru(e,t,i,r){let a={},n={},s=[],o=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function l(w,S){let b=S.program;r.uniformBlockBinding(w,b)}c(l,"c");function h(w,S){let b=a[w.id];b===void 0&&(y(w),b=u(w),a[w.id]=b,w.addEventListener("dispose",m));let I=S.program;r.updateUBOMapping(w,I);let L=t.render.frame;n[w.id]!==L&&(p(w),n[w.id]=L)}c(h,"l");function u(w){let S=d();w.__bindingPointIndex=S;let b=e.createBuffer(),I=w.__size,L=w.usage;return e.bindBuffer(e.UNIFORM_BUFFER,b),e.bufferData(e.UNIFORM_BUFFER,I,L),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,S,b),b}c(u,"u");function d(){for(let w=0;w<o;w++)if(s.indexOf(w)===-1)return s.push(w),w;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}c(d,"d");function p(w){let S=a[w.id],b=w.uniforms,I=w.__cache;e.bindBuffer(e.UNIFORM_BUFFER,S);for(let L=0,P=b.length;L<P;L++){let B=Array.isArray(b[L])?b[L]:[b[L]];for(let E=0,M=B.length;E<M;E++){let C=B[E];if(g(C,L,E,I)===!0){let V=C.__offset,H=Array.isArray(C.value)?C.value:[C.value],k=0;for(let Z=0;Z<H.length;Z++){let G=H[Z],$=v(G);typeof G=="number"||typeof G=="boolean"?(C.__data[0]=G,e.bufferSubData(e.UNIFORM_BUFFER,V+k,C.__data)):G.isMatrix3?(C.__data[0]=G.elements[0],C.__data[1]=G.elements[1],C.__data[2]=G.elements[2],C.__data[3]=0,C.__data[4]=G.elements[3],C.__data[5]=G.elements[4],C.__data[6]=G.elements[5],C.__data[7]=0,C.__data[8]=G.elements[6],C.__data[9]=G.elements[7],C.__data[10]=G.elements[8],C.__data[11]=0):(G.toArray(C.__data,k),k+=$.storage/Float32Array.BYTES_PER_ELEMENT)}e.bufferSubData(e.UNIFORM_BUFFER,V,C.__data)}}}e.bindBuffer(e.UNIFORM_BUFFER,null)}c(p,"f");function g(w,S,b,I){let L=w.value,P=S+"_"+b;if(I[P]===void 0)return I[P]=typeof L=="number"||typeof L=="boolean"?L:L.clone(),!0;{let B=I[P];if(typeof L=="number"||typeof L=="boolean"){if(B!==L)return I[P]=L,!0}else if(B.equals(L)===!1)return B.copy(L),!0}return!1}c(g,"p");function y(w){let S=w.uniforms,b=0;for(let L=0,P=S.length;L<P;L++){let B=Array.isArray(S[L])?S[L]:[S[L]];for(let E=0,M=B.length;E<M;E++){let C=B[E],V=Array.isArray(C.value)?C.value:[C.value];for(let H=0,k=V.length;H<k;H++){let Z=V[H],G=v(Z),$=b%16,j=$%G.boundary,te=$+j;b+=j,te!==0&&16-te<G.storage&&(b+=16-te),C.__data=new Float32Array(G.storage/Float32Array.BYTES_PER_ELEMENT),C.__offset=b,b+=G.storage}}}let I=b%16;return I>0&&(b+=16-I),w.__size=b,w.__cache={},this}c(y,"m");function v(w){let S={boundary:0,storage:0};return typeof w=="number"||typeof w=="boolean"?(S.boundary=4,S.storage=4):w.isVector2?(S.boundary=8,S.storage=8):w.isVector3||w.isColor?(S.boundary=16,S.storage=12):w.isVector4?(S.boundary=16,S.storage=16):w.isMatrix3?(S.boundary=48,S.storage=48):w.isMatrix4?(S.boundary=64,S.storage=64):w.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",w),S}c(v,"h");function m(w){let S=w.target;S.removeEventListener("dispose",m);let b=s.indexOf(S.__bindingPointIndex);s.splice(b,1),e.deleteBuffer(a[S.id]),delete a[S.id],delete n[S.id]}c(m,"g");function f(){for(let w in a)e.deleteBuffer(a[w]);s=[],a={},n={}}return c(f,"_"),{bind:l,update:h,dispose:f}}c(Ru,"Wh");var Ie,ne,zt,Vr,mi,Yl,ki,Xn,Vi,Ra,bn,Ca,Pa,La,Ua,ui,Oi,An,So,jn,ns,qn,ss,os,ls,Yn,Kn,Zn,Jn,$n,Kl,Zl,Jl,Ha,kr,$l,Ql,Qn,Gr,eh,th,ih,Eo,rh,To,ah,nh,sh,oh,wn,bo,Ao,wo,Ro,gi,lh,Cu;function Pu(){return(Pu=Ka(()=>{ql(),Ie={alphahash_fragment:`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,alphahash_pars_fragment:`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,alphamap_fragment:`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,alphamap_pars_fragment:`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,alphatest_fragment:`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,alphatest_pars_fragment:`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,aomap_fragment:`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,aomap_pars_fragment:`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,batching_pars_vertex:`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,batching_vertex:`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,begin_vertex:`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,beginnormal_vertex:`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,bsdfs:`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,iridescence_fragment:`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,bumpmap_pars_fragment:`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,clipping_planes_fragment:`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,clipping_planes_pars_fragment:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,clipping_planes_pars_vertex:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,clipping_planes_vertex:`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,color_fragment:`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,color_pars_fragment:`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,color_pars_vertex:`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,color_vertex:`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,common:`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,cube_uv_reflection_fragment:`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,defaultnormal_vertex:`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,displacementmap_pars_vertex:`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,displacementmap_vertex:`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,emissivemap_fragment:`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,emissivemap_pars_fragment:`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,colorspace_fragment:"gl_FragColor = linearToOutputTexel( gl_FragColor );",colorspace_pars_fragment:`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,envmap_fragment:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,envmap_common_pars_fragment:`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,envmap_pars_fragment:`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,envmap_pars_vertex:`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,envmap_physical_pars_fragment:`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,envmap_vertex:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,fog_vertex:`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,fog_pars_vertex:`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,fog_fragment:`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,fog_pars_fragment:`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,gradientmap_pars_fragment:`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,lightmap_pars_fragment:`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,lights_lambert_fragment:`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,lights_lambert_pars_fragment:`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,lights_pars_begin:`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,lights_toon_fragment:`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,lights_toon_pars_fragment:`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,lights_phong_fragment:`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,lights_phong_pars_fragment:`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,lights_physical_fragment:`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,lights_physical_pars_fragment:`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,lights_fragment_begin:`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,lights_fragment_maps:`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,lights_fragment_end:`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,logdepthbuf_fragment:`#if defined( USE_LOGDEPTHBUF )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,logdepthbuf_pars_fragment:`#if defined( USE_LOGDEPTHBUF )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_pars_vertex:`#ifdef USE_LOGDEPTHBUF
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_vertex:`#ifdef USE_LOGDEPTHBUF
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,map_fragment:`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,map_pars_fragment:`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,map_particle_fragment:`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,map_particle_pars_fragment:`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,metalnessmap_fragment:`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,metalnessmap_pars_fragment:`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,morphinstance_vertex:`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,morphcolor_vertex:`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,morphnormal_vertex:`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,morphtarget_pars_vertex:`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,morphtarget_vertex:`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,normal_fragment_begin:`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,normal_fragment_maps:`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,normal_pars_fragment:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_pars_vertex:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_vertex:`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,normalmap_pars_fragment:`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,clearcoat_normal_fragment_begin:`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,clearcoat_normal_fragment_maps:`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,clearcoat_pars_fragment:`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,iridescence_pars_fragment:`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,opaque_fragment:`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,packing:`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,premultiplied_alpha_fragment:`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,project_vertex:`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,dithering_fragment:`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,dithering_pars_fragment:`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,roughnessmap_fragment:`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,roughnessmap_pars_fragment:`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,shadowmap_pars_fragment:`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		float depth = unpackRGBAToDepth( texture2D( depths, uv ) );
		#ifdef USE_REVERSEDEPTHBUF
			return step( depth, compare );
		#else
			return step( compare, depth );
		#endif
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		#ifdef USE_REVERSEDEPTHBUF
			float hard_shadow = step( distribution.x, compare );
		#else
			float hard_shadow = step( compare , distribution.x );
		#endif
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,shadowmap_pars_vertex:`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,shadowmap_vertex:`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,shadowmask_pars_fragment:`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,skinbase_vertex:`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,skinning_pars_vertex:`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,skinning_vertex:`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,skinnormal_vertex:`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,specularmap_fragment:`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,specularmap_pars_fragment:`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,tonemapping_fragment:`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,tonemapping_pars_fragment:`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,transmission_fragment:`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,transmission_pars_fragment:`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,uv_pars_fragment:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_pars_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,worldpos_vertex:`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,background_vert:`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,background_frag:`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,backgroundCube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,backgroundCube_frag:`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,cube_frag:`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,depth_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,depth_frag:`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSEDEPTHBUF
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,distanceRGBA_vert:`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,distanceRGBA_frag:`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,equirect_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,equirect_frag:`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,linedashed_vert:`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,linedashed_frag:`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,meshbasic_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,meshbasic_frag:`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshlambert_vert:`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshlambert_frag:`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshmatcap_vert:`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,meshmatcap_frag:`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshnormal_vert:`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,meshnormal_frag:`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,meshphong_vert:`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshphong_frag:`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshphysical_vert:`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,meshphysical_frag:`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshtoon_vert:`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshtoon_frag:`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,points_vert:`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,points_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,shadow_vert:`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,shadow_frag:`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,sprite_vert:`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,sprite_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`},ne={common:{diffuse:{value:new ze(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ne},alphaMap:{value:null},alphaMapTransform:{value:new Ne},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ne}},envmap:{envMap:{value:null},envMapRotation:{value:new Ne},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ne}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ne}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ne},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ne},normalScale:{value:new Be(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ne},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ne}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ne}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ne}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new ze(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new ze(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ne},alphaTest:{value:0},uvTransform:{value:new Ne}},sprite:{diffuse:{value:new ze(16777215)},opacity:{value:1},center:{value:new Be(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ne},alphaMap:{value:null},alphaMapTransform:{value:new Ne},alphaTest:{value:0}}},zt={basic:{uniforms:Mt([ne.common,ne.specularmap,ne.envmap,ne.aomap,ne.lightmap,ne.fog]),vertexShader:Ie.meshbasic_vert,fragmentShader:Ie.meshbasic_frag},lambert:{uniforms:Mt([ne.common,ne.specularmap,ne.envmap,ne.aomap,ne.lightmap,ne.emissivemap,ne.bumpmap,ne.normalmap,ne.displacementmap,ne.fog,ne.lights,{emissive:{value:new ze(0)}}]),vertexShader:Ie.meshlambert_vert,fragmentShader:Ie.meshlambert_frag},phong:{uniforms:Mt([ne.common,ne.specularmap,ne.envmap,ne.aomap,ne.lightmap,ne.emissivemap,ne.bumpmap,ne.normalmap,ne.displacementmap,ne.fog,ne.lights,{emissive:{value:new ze(0)},specular:{value:new ze(1118481)},shininess:{value:30}}]),vertexShader:Ie.meshphong_vert,fragmentShader:Ie.meshphong_frag},standard:{uniforms:Mt([ne.common,ne.envmap,ne.aomap,ne.lightmap,ne.emissivemap,ne.bumpmap,ne.normalmap,ne.displacementmap,ne.roughnessmap,ne.metalnessmap,ne.fog,ne.lights,{emissive:{value:new ze(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ie.meshphysical_vert,fragmentShader:Ie.meshphysical_frag},toon:{uniforms:Mt([ne.common,ne.aomap,ne.lightmap,ne.emissivemap,ne.bumpmap,ne.normalmap,ne.displacementmap,ne.gradientmap,ne.fog,ne.lights,{emissive:{value:new ze(0)}}]),vertexShader:Ie.meshtoon_vert,fragmentShader:Ie.meshtoon_frag},matcap:{uniforms:Mt([ne.common,ne.bumpmap,ne.normalmap,ne.displacementmap,ne.fog,{matcap:{value:null}}]),vertexShader:Ie.meshmatcap_vert,fragmentShader:Ie.meshmatcap_frag},points:{uniforms:Mt([ne.points,ne.fog]),vertexShader:Ie.points_vert,fragmentShader:Ie.points_frag},dashed:{uniforms:Mt([ne.common,ne.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ie.linedashed_vert,fragmentShader:Ie.linedashed_frag},depth:{uniforms:Mt([ne.common,ne.displacementmap]),vertexShader:Ie.depth_vert,fragmentShader:Ie.depth_frag},normal:{uniforms:Mt([ne.common,ne.bumpmap,ne.normalmap,ne.displacementmap,{opacity:{value:1}}]),vertexShader:Ie.meshnormal_vert,fragmentShader:Ie.meshnormal_frag},sprite:{uniforms:Mt([ne.sprite,ne.fog]),vertexShader:Ie.sprite_vert,fragmentShader:Ie.sprite_frag},background:{uniforms:{uvTransform:{value:new Ne},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ie.background_vert,fragmentShader:Ie.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ne}},vertexShader:Ie.backgroundCube_vert,fragmentShader:Ie.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ie.cube_vert,fragmentShader:Ie.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ie.equirect_vert,fragmentShader:Ie.equirect_frag},distanceRGBA:{uniforms:Mt([ne.common,ne.displacementmap,{referencePosition:{value:new O},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ie.distanceRGBA_vert,fragmentShader:Ie.distanceRGBA_frag},shadow:{uniforms:Mt([ne.lights,ne.fog,{color:{value:new ze(0)},opacity:{value:1}}]),vertexShader:Ie.shadow_vert,fragmentShader:Ie.shadow_frag}},zt.physical={uniforms:Mt([zt.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ne},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ne},clearcoatNormalScale:{value:new Be(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ne},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ne},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ne},sheen:{value:0},sheenColor:{value:new ze(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ne},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ne},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ne},transmissionSamplerSize:{value:new Be},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ne},attenuationDistance:{value:0},attenuationColor:{value:new ze(0)},specularColor:{value:new ze(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ne},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ne},anisotropyVector:{value:new Be},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ne}}]),vertexShader:Ie.meshphysical_vert,fragmentShader:Ie.meshphysical_frag},Vr={r:0,b:0,g:0},mi=new ai,Yl=new at,ki=4,Xn=[.125,.215,.35,.446,.526,.582],Vi=20,Ra=new Il,bn=new ze,Ca=null,Pa=0,La=0,Ua=!1,ui=(1+Math.sqrt(5))/2,Oi=1/ui,An=[new O(-ui,Oi,0),new O(ui,Oi,0),new O(-Oi,0,ui),new O(Oi,0,ui),new O(0,ui,-Oi),new O(0,ui,Oi),new O(-1,1,-1),new O(1,1,-1),new O(-1,1,1),new O(1,1,1)],So=new O,jn=class{static{c(this,"cg")}constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(e,t=0,i=.1,r=100,a={}){let{size:n=256,position:s=So}=a;Ca=this._renderer.getRenderTarget(),Pa=this._renderer.getActiveCubeFace(),La=this._renderer.getActiveMipmapLevel(),Ua=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(n);let o=this._allocateTargets();return o.depthBuffer=!0,this._sceneToCubeUV(e,i,r,o,s),t>0&&this._blur(o,0,0,t),this._applyPMREM(o),this._cleanup(o),o}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=co(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=ho(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=2**this._lodMax}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodPlanes.length;e++)this._lodPlanes[e].dispose()}_cleanup(e){this._renderer.setRenderTarget(Ca,Pa,La),this._renderer.xr.enabled=Ua,e.scissorTest=!1,wa(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===301||e.mapping===302?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Ca=this._renderer.getRenderTarget(),Pa=this._renderer.getActiveCubeFace(),La=this._renderer.getActiveMipmapLevel(),Ua=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let i=t||this._allocateTargets();return this._textureToCubeUV(e,i),this._applyPMREM(i),this._cleanup(i),i}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,i={magFilter:_i,minFilter:_i,generateMipmaps:!1,type:Wa,format:dr,colorSpace:pr,depthBuffer:!1},r=lo(e,t,i);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=lo(e,t,i);let{_lodMax:a}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=ic(a)),this._blurMaterial=rc(a,e,t)}return r}_compileMaterial(e){let t=new Zt(this._lodPlanes[0],e);this._renderer.compile(t,Ra)}_sceneToCubeUV(e,t,i,r,a){let n=new Dt(90,1,t,i),s=[1,-1,1,1,1,1],o=[1,1,1,-1,-1,-1],l=this._renderer,h=l.autoClear,u=l.toneMapping;l.getClearColor(bn),l.toneMapping=0,l.autoClear=!1,l.state.buffers.depth.getReversed()&&(l.setRenderTarget(r),l.clearDepth(),l.setRenderTarget(null));let d=new Nn({name:"PMREM.Background",side:1,depthWrite:!1,depthTest:!1}),p=new Zt(new Xa,d),g=!1,y=e.background;y?y.isColor&&(d.color.copy(y),e.background=null,g=!0):(d.color.copy(bn),g=!0);for(let v=0;v<6;v++){let m=v%3;m===0?(n.up.set(0,s[v],0),n.position.set(a.x,a.y,a.z),n.lookAt(a.x+o[v],a.y,a.z)):m===1?(n.up.set(0,0,s[v]),n.position.set(a.x,a.y,a.z),n.lookAt(a.x,a.y+o[v],a.z)):(n.up.set(0,s[v],0),n.position.set(a.x,a.y,a.z),n.lookAt(a.x,a.y,a.z+o[v]));let f=this._cubeSize;wa(r,m*f,v>2?f:0,f,f),l.setRenderTarget(r),g&&l.render(p,n),l.render(e,n)}p.geometry.dispose(),p.material.dispose(),l.toneMapping=u,l.autoClear=h,e.background=y}_textureToCubeUV(e,t){let i=this._renderer,r=e.mapping===301||e.mapping===302;r?(this._cubemapMaterial===null&&(this._cubemapMaterial=co()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=ho());let a=r?this._cubemapMaterial:this._equirectMaterial,n=new Zt(this._lodPlanes[0],a),s=a.uniforms;s.envMap.value=e;let o=this._cubeSize;wa(t,0,0,3*o,2*o),i.setRenderTarget(t),i.render(n,Ra)}_applyPMREM(e){let t=this._renderer,i=t.autoClear;t.autoClear=!1;let r=this._lodPlanes.length;for(let a=1;a<r;a++){let n=Math.sqrt(this._sigmas[a]*this._sigmas[a]-this._sigmas[a-1]*this._sigmas[a-1]),s=An[(r-a-1)%An.length];this._blur(e,a-1,a,n,s)}t.autoClear=i}_blur(e,t,i,r,a){let n=this._pingPongRenderTarget;this._halfBlur(e,n,t,i,r,"latitudinal",a),this._halfBlur(n,e,i,i,r,"longitudinal",a)}_halfBlur(e,t,i,r,a,n,s){let o=this._renderer,l=this._blurMaterial;n!=="latitudinal"&&n!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");let h=new Zt(this._lodPlanes[r],l),u=l.uniforms,d=this._sizeLods[i]-1,p=isFinite(a)?Math.PI/(2*d):2*Math.PI/39,g=a/p,y=isFinite(a)?1+Math.floor(3*g):Vi;y>Vi&&console.warn(`sigmaRadians, ${a}, is too large and will clip, as it requested ${y} samples when the maximum is set to ${Vi}`);let v=[],m=0;for(let S=0;S<Vi;++S){let b=S/g,I=Math.exp(-b*b/2);v.push(I),S===0?m+=I:S<y&&(m+=2*I)}for(let S=0;S<v.length;S++)v[S]=v[S]/m;u.envMap.value=e.texture,u.samples.value=y,u.weights.value=v,u.latitudinal.value=n==="latitudinal",s&&(u.poleAxis.value=s);let{_lodMax:f}=this;u.dTheta.value=p,u.mipInt.value=f-i;let w=this._sizeLods[r];wa(t,3*w*(r>f-ki?r-f+ki:0),4*(this._cubeSize-w),3*w,2*w),o.setRenderTarget(t),o.render(h,Ra)}},ns=new Lt,qn=new kn(1,1),ss=new ts,os=new Cl,ls=new zn,Yn=[],Kn=[],Zn=new Float32Array(16),Jn=new Float32Array(9),$n=new Float32Array(4),Kl=class{static{c(this,"yg")}constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.setValue=Pc(t.type)}},Zl=class{static{c(this,"bg")}constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Zc(t.type)}},Jl=class{static{c(this,"xg")}constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,i){let r=this.seq;for(let a=0,n=r.length;a!==n;++a){let s=r[a];s.setValue(e,t[s.id],i)}}},Ha=/(\w+)(\])?(\[|\.)?/g,kr=class{static{c(this,"Cg")}constructor(e,t){this.seq=[],this.map={};let i=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let r=0;r<i;++r){let a=e.getActiveUniform(t,r);Jc(a,e.getUniformLocation(t,a.name),this)}}setValue(e,t,i,r){let a=this.map[t];a!==void 0&&a.setValue(e,i,r)}setOptional(e,t,i){let r=t[i];r!==void 0&&this.setValue(e,i,r)}static upload(e,t,i,r){for(let a=0,n=t.length;a!==n;++a){let s=t[a],o=i[s.id];o.needsUpdate!==!1&&s.setValue(e,o.value,r)}}static seqWithValue(e,t){let i=[];for(let r=0,a=e.length;r!==a;++r){let n=e[r];n.id in t&&i.push(n)}return i}},$l=37297,Ql=0,Qn=new Ne,Gr=new O,eh=/^[ \t]*#include +<([\w\d./]+)>/gm,th=new Map,ih=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g,Eo=0,rh=class{static{c(this,"Mg")}constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){let t=e.vertexShader,i=e.fragmentShader,r=this._getShaderStage(t),a=this._getShaderStage(i),n=this._getShaderCacheForMaterial(e);return n.has(r)===!1&&(n.add(r),r.usedTimes++),n.has(a)===!1&&(n.add(a),a.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let i of t)i.usedTimes--,i.usedTimes===0&&this.shaderCache.delete(i.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,i=t.get(e);return i===void 0&&(i=new Set,t.set(e,i)),i}_getShaderStage(e){let t=this.shaderCache,i=t.get(e);return i===void 0&&(i=new To(e),t.set(e,i)),i}},To=class{static{c(this,"Ng")}constructor(e){this.id=Eo++,this.code=e,this.usedTimes=0}},ah=0,nh=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,sh=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`,oh={0:1,2:6,4:7,3:5,1:0,6:2,7:4,5:3},wn=class extends Lt{static{c(this,"Rg")}constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}},bo=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Ao=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,wo=class{static{c(this,"Vg")}constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let i=new wn(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=i}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,i=new si({vertexShader:bo,fragmentShader:Ao,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new Zt(new rs(20,20),i)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},Ro=class extends Fi{static{c(this,"Hg")}constructor(e,t){super();let i=this,r=null,a=1,n=null,s="local-floor",o=1,l=null,h=null,u=null,d=null,p=null,g=null,y=new wo,v={},m=t.getContextAttributes(),f=null,w=null,S=[],b=[],I=new Be,L=null,P=new Dt;P.viewport=new nt;let B=new Dt;B.viewport=new nt;let E=[P,B],M=new Nl,C=null,V=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(W){let re=S[W];return re===void 0&&(re=new Oa,S[W]=re),re.getTargetRaySpace()},this.getControllerGrip=function(W){let re=S[W];return re===void 0&&(re=new Oa,S[W]=re),re.getGripSpace()},this.getHand=function(W){let re=S[W];return re===void 0&&(re=new Oa,S[W]=re),re.getHandSpace()};function H(W){let re=b.indexOf(W.inputSource);if(re===-1)return;let Me=S[re];Me!==void 0&&(Me.update(W.inputSource,W.frame,l||n),Me.dispatchEvent({type:W.type,data:W.inputSource}))}c(H,"k");function k(){r.removeEventListener("select",H),r.removeEventListener("selectstart",H),r.removeEventListener("selectend",H),r.removeEventListener("squeeze",H),r.removeEventListener("squeezestart",H),r.removeEventListener("squeezeend",H),r.removeEventListener("end",k),r.removeEventListener("inputsourceschange",Z);for(let W=0;W<S.length;W++){let re=b[W];re!==null&&(b[W]=null,S[W].disconnect(re))}C=null,V=null,y.reset();for(let W in v)delete v[W];e.setRenderTarget(f),p=null,d=null,u=null,r=null,w=null,Ze.stop(),i.isPresenting=!1,e.setPixelRatio(L),e.setSize(I.width,I.height,!1),i.dispatchEvent({type:"sessionend"})}c(k,"ee"),this.setFramebufferScaleFactor=function(W){a=W,i.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(W){s=W,i.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return l||n},this.setReferenceSpace=function(W){l=W},this.getBaseLayer=function(){return d===null?p:d},this.getBinding=function(){return u},this.getFrame=function(){return g},this.getSession=function(){return r},this.setSession=async function(W){if(r=W,r!==null){if(f=e.getRenderTarget(),r.addEventListener("select",H),r.addEventListener("selectstart",H),r.addEventListener("selectend",H),r.addEventListener("squeeze",H),r.addEventListener("squeezestart",H),r.addEventListener("squeezeend",H),r.addEventListener("end",k),r.addEventListener("inputsourceschange",Z),m.xrCompatible!==!0&&await t.makeXRCompatible(),L=e.getPixelRatio(),e.getSize(I),typeof XRWebGLBinding<"u"&&(u=new XRWebGLBinding(r,t)),u!==null&&"createProjectionLayer"in XRWebGLBinding.prototype){let re=null,Me=null,ce=null;m.depth&&(ce=m.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,re=m.stencil?es:Pn,Me=m.stencil?Ho:ka);let _e={colorFormat:t.RGBA8,depthFormat:ce,scaleFactor:a};d=u.createProjectionLayer(_e),r.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),w=new vi(d.textureWidth,d.textureHeight,{format:dr,type:ur,depthTexture:new kn(d.textureWidth,d.textureHeight,Me,void 0,void 0,void 0,void 0,void 0,void 0,re),stencilBuffer:m.stencil,colorSpace:e.outputColorSpace,samples:m.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1})}else{let re={antialias:m.antialias,alpha:!0,depth:m.depth,stencil:m.stencil,framebufferScaleFactor:a};p=new XRWebGLLayer(r,t,re),r.updateRenderState({baseLayer:p}),e.setPixelRatio(1),e.setSize(p.framebufferWidth,p.framebufferHeight,!1),w=new vi(p.framebufferWidth,p.framebufferHeight,{format:dr,type:ur,colorSpace:e.outputColorSpace,stencilBuffer:m.stencil,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1})}w.isXRRenderTarget=!0,this.setFoveation(o),l=null,n=await r.requestReferenceSpace(s),Ze.setContext(r),Ze.start(),i.isPresenting=!0,i.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(r!==null)return r.environmentBlendMode},this.getDepthTexture=function(){return y.getDepthTexture()};function Z(W){for(let re=0;re<W.removed.length;re++){let Me=W.removed[re],ce=b.indexOf(Me);ce>=0&&(b[ce]=null,S[ce].disconnect(Me))}for(let re=0;re<W.added.length;re++){let Me=W.added[re],ce=b.indexOf(Me);if(ce===-1){for(let Re=0;Re<S.length;Re++)if(Re>=b.length){b.push(Me),ce=Re;break}else if(b[Re]===null){b[Re]=Me,ce=Re;break}if(ce===-1)break}let _e=S[ce];_e&&_e.connect(Me)}}c(Z,"A");let G=new O,$=new O;function j(W,re,Me){G.setFromMatrixPosition(re.matrixWorld),$.setFromMatrixPosition(Me.matrixWorld);let ce=G.distanceTo($),_e=re.projectionMatrix.elements,Re=Me.projectionMatrix.elements,De=_e[14]/(_e[10]-1),We=_e[14]/(_e[10]+1),A=(_e[9]+1)/_e[5],ct=(_e[9]-1)/_e[5],Ge=(_e[8]-1)/_e[0],qe=(Re[8]+1)/Re[0],Te=De*Ge,$e=De*qe,ye=ce/(-Ge+qe),Ae=ye*-Ge;if(re.matrixWorld.decompose(W.position,W.quaternion,W.scale),W.translateX(Ae),W.translateZ(ye),W.matrixWorld.compose(W.position,W.quaternion,W.scale),W.matrixWorldInverse.copy(W.matrixWorld).invert(),_e[10]===-1)W.projectionMatrix.copy(re.projectionMatrix),W.projectionMatrixInverse.copy(re.projectionMatrixInverse);else{let dt=De+ye,ut=We+ye,st=Te-Ae,T=$e+(ce-Ae),_=A*We/ut*dt,N=ct*We/ut*dt;W.projectionMatrix.makePerspective(st,T,_,N,dt,ut),W.projectionMatrixInverse.copy(W.projectionMatrix).invert()}}c(j,"ne");function te(W,re){re===null?W.matrixWorld.copy(W.matrix):W.matrixWorld.multiplyMatrices(re.matrixWorld,W.matrix),W.matrixWorldInverse.copy(W.matrixWorld).invert()}c(te,"M"),this.updateCamera=function(W){if(r===null)return;let re=W.near,Me=W.far;y.texture!==null&&(y.depthNear>0&&(re=y.depthNear),y.depthFar>0&&(Me=y.depthFar)),M.near=B.near=P.near=re,M.far=B.far=P.far=Me,(C!==M.near||V!==M.far)&&(r.updateRenderState({depthNear:M.near,depthFar:M.far}),C=M.near,V=M.far),M.layers.mask=W.layers.mask|6,P.layers.mask=M.layers.mask&3,B.layers.mask=M.layers.mask&5;let ce=W.parent,_e=M.cameras;te(M,ce);for(let Re=0;Re<_e.length;Re++)te(_e[Re],ce);_e.length===2?j(M,P,B):M.projectionMatrix.copy(P.projectionMatrix),fe(W,M,ce)};function fe(W,re,Me){Me===null?W.matrix.copy(re.matrixWorld):(W.matrix.copy(Me.matrixWorld),W.matrix.invert(),W.matrix.multiply(re.matrixWorld)),W.matrix.decompose(W.position,W.quaternion,W.scale),W.updateMatrixWorld(!0),W.projectionMatrix.copy(re.projectionMatrix),W.projectionMatrixInverse.copy(re.projectionMatrixInverse),W.isPerspectiveCamera&&(W.fov=or*2*Math.atan(1/W.projectionMatrix.elements[5]),W.zoom=1)}c(fe,"N"),this.getCamera=function(){return M},this.getFoveation=function(){if(d!==null||p!==null)return o},this.setFoveation=function(W){o=W,d!==null&&(d.fixedFoveation=W),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=W)},this.hasDepthSensing=function(){return y.texture!==null},this.getDepthSensingMesh=function(){return y.getMesh(M)},this.getCameraTexture=function(W){return v[W]};let Ue=null;function He(W,re){if(h=re.getViewerPose(l||n),g=re,h!==null){let Me=h.views;p!==null&&(e.setRenderTargetFramebuffer(w,p.framebuffer),e.setRenderTarget(w));let ce=!1;Me.length!==M.cameras.length&&(M.cameras.length=0,ce=!0);for(let Re=0;Re<Me.length;Re++){let De=Me[Re],We=null;if(p!==null)We=p.getViewport(De);else{let ct=u.getViewSubImage(d,De);We=ct.viewport,Re===0&&(e.setRenderTargetTextures(w,ct.colorTexture,ct.depthStencilTexture),e.setRenderTarget(w))}let A=E[Re];A===void 0&&(A=new Dt,A.layers.enable(Re),A.viewport=new nt,E[Re]=A),A.matrix.fromArray(De.transform.matrix),A.matrix.decompose(A.position,A.quaternion,A.scale),A.projectionMatrix.fromArray(De.projectionMatrix),A.projectionMatrixInverse.copy(A.projectionMatrix).invert(),A.viewport.set(We.x,We.y,We.width,We.height),Re===0&&(M.matrix.copy(A.matrix),M.matrix.decompose(M.position,M.quaternion,M.scale)),ce===!0&&M.cameras.push(A)}let _e=r.enabledFeatures;if(_e&&_e.includes("depth-sensing")&&r.depthUsage=="gpu-optimized"&&u){let Re=u.getDepthInformation(Me[0]);Re&&Re.isValid&&Re.texture&&y.init(Re,r.renderState)}if(_e&&_e.includes("camera-access")&&(e.state.unbindTexture(),u))for(let Re=0;Re<Me.length;Re++){let De=Me[Re].camera;if(De){let We=v[De];We||(We=new wn,v[De]=We);let A=u.getCameraImage(De);We.sourceTexture=A}}}for(let Me=0;Me<S.length;Me++){let ce=b[Me],_e=S[Me];ce!==null&&_e!==void 0&&_e.update(ce,re,l||n)}Ue&&Ue(W,re),re.detectedPlanes&&i.dispatchEvent({type:"planesdetected",data:re}),g=null}c(He,"ie");let Ze=new oo;Ze.setAnimationLoop(He),this.setAnimationLoop=function(W){Ue=W},this.dispose=function(){}}},gi=new ai,lh=new at,Cu=class{static{c(this,"Gg")}constructor(e={}){let{canvas:t=Lh(),context:i=null,depth:r=!0,stencil:a=!1,alpha:n=!1,antialias:s=!1,premultipliedAlpha:o=!0,preserveDrawingBuffer:l=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:u=!1,reversedDepthBuffer:d=!1}=e;this.isWebGLRenderer=!0;let p;if(i!==null){if(typeof WebGLRenderingContext<"u"&&i instanceof WebGLRenderingContext)throw Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");p=i.getContextAttributes().alpha}else p=n;let g=new Uint32Array(4),y=new Int32Array(4),v=null,m=null,f=[],w=[];this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=0,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let S=this,b=!1;this._outputColorSpace=It;let I=0,L=0,P=null,B=-1,E=null,M=new nt,C=new nt,V=null,H=new ze(0),k=0,Z=t.width,G=t.height,$=1,j=null,te=null,fe=new nt(0,0,Z,G),Ue=new nt(0,0,Z,G),He=!1,Ze=new is,W=!1,re=!1,Me=new at,ce=new O,_e=new nt,Re={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},De=!1;function We(){return P===null?$:1}c(We,"me");let A=i;function ct(x,D){return t.getContext(x,D)}c(ct,"he");try{let x={alpha:!0,depth:r,stencil:a,antialias:s,premultipliedAlpha:o,preserveDrawingBuffer:l,powerPreference:h,failIfMajorPerformanceCaveat:u};if("setAttribute"in t&&t.setAttribute("data-engine","three.js r179"),t.addEventListener("webglcontextlost",le,!1),t.addEventListener("webglcontextrestored",ae,!1),t.addEventListener("webglcontextcreationerror",me,!1),A===null){let D="webgl2";if(A=ct(D,x),A===null)throw ct(D)?Error("Error creating WebGL context with your selected attributes."):Error("Error creating WebGL context.")}}catch(x){throw console.error("THREE.WebGLRenderer: "+x.message),x}let Ge,qe,Te,$e,ye,Ae,dt,ut,st,T,_,N,q,K,X,de,ie,ve,Se,ee,se,we,Ee,oe;function Oe(){Ge=new nc(A),Ge.init(),we=new Au(A,Ge),qe=new Qh(A,Ge,e,we),Te=new Tu(A,Ge),qe.reversedDepthBuffer&&d&&Te.buffers.depth.setReversed(!0),$e=new lc(A),ye=new mu,Ae=new bu(A,Ge,Te,ye,qe,we,$e),dt=new tc(S),ut=new ac(S),st=new Kh(A),Ee=new Jh(A,st),T=new sc(A,st,$e,Ee),_=new cc(A,T,st,$e),Se=new hc(A,qe,Ae),de=new ec(ye),N=new fu(S,dt,ut,Ge,qe,Ee,de),q=new wu(S,ye),K=new _u,X=new Su(Ge),ve=new Zh(S,dt,ut,Te,_,p,o),ie=new Eu(S,_,qe),oe=new Ru(A,$e,qe,Te),ee=new $h(A,Ge,$e),se=new oc(A,Ge,$e),$e.programs=N.programs,S.capabilities=qe,S.extensions=Ge,S.properties=ye,S.renderLists=K,S.shadowMap=ie,S.state=Te,S.info=$e}c(Oe,"Le"),Oe();let R=new Ro(S,A);this.xr=R,this.getContext=function(){return A},this.getContextAttributes=function(){return A.getContextAttributes()},this.forceContextLoss=function(){let x=Ge.get("WEBGL_lose_context");x&&x.loseContext()},this.forceContextRestore=function(){let x=Ge.get("WEBGL_lose_context");x&&x.restoreContext()},this.getPixelRatio=function(){return $},this.setPixelRatio=function(x){x!==void 0&&($=x,this.setSize(Z,G,!1))},this.getSize=function(x){return x.set(Z,G)},this.setSize=function(x,D,F=!0){if(R.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}Z=x,G=D,t.width=Math.floor(x*$),t.height=Math.floor(D*$),F===!0&&(t.style.width=x+"px",t.style.height=D+"px"),this.setViewport(0,0,x,D)},this.getDrawingBufferSize=function(x){return x.set(Z*$,G*$).floor()},this.setDrawingBufferSize=function(x,D,F){Z=x,G=D,$=F,t.width=Math.floor(x*F),t.height=Math.floor(D*F),this.setViewport(0,0,x,D)},this.getCurrentViewport=function(x){return x.copy(M)},this.getViewport=function(x){return x.copy(fe)},this.setViewport=function(x,D,F,z){x.isVector4?fe.set(x.x,x.y,x.z,x.w):fe.set(x,D,F,z),Te.viewport(M.copy(fe).multiplyScalar($).round())},this.getScissor=function(x){return x.copy(Ue)},this.setScissor=function(x,D,F,z){x.isVector4?Ue.set(x.x,x.y,x.z,x.w):Ue.set(x,D,F,z),Te.scissor(C.copy(Ue).multiplyScalar($).round())},this.getScissorTest=function(){return He},this.setScissorTest=function(x){Te.setScissorTest(He=x)},this.setOpaqueSort=function(x){j=x},this.setTransparentSort=function(x){te=x},this.getClearColor=function(x){return x.copy(ve.getClearColor())},this.setClearColor=function(){ve.setClearColor(...arguments)},this.getClearAlpha=function(){return ve.getClearAlpha()},this.setClearAlpha=function(){ve.setClearAlpha(...arguments)},this.clear=function(x=!0,D=!0,F=!0){let z=0;if(x){let U=!1;if(P!==null){let J=P.texture.format;U=J===1033||J===1031||J===1029}if(U){let J=P.texture.type,he=J===1009||J===1014||J===1012||J===1020||J===1017||J===1018,ue=ve.getClearColor(),pe=ve.getClearAlpha(),Ce=ue.r,Le=ue.g,Pe=ue.b;he?(g[0]=Ce,g[1]=Le,g[2]=Pe,g[3]=pe,A.clearBufferuiv(A.COLOR,0,g)):(y[0]=Ce,y[1]=Le,y[2]=Pe,y[3]=pe,A.clearBufferiv(A.COLOR,0,y))}else z|=A.COLOR_BUFFER_BIT}D&&(z|=A.DEPTH_BUFFER_BIT),F&&(z|=A.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),A.clear(z)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",le,!1),t.removeEventListener("webglcontextrestored",ae,!1),t.removeEventListener("webglcontextcreationerror",me,!1),ve.dispose(),K.dispose(),X.dispose(),ye.dispose(),dt.dispose(),ut.dispose(),_.dispose(),Ee.dispose(),oe.dispose(),N.dispose(),R.dispose(),R.removeEventListener("sessionstart",Ht),R.removeEventListener("sessionend",Vt),xi.stop()};function le(x){x.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),b=!0}c(le,"ze");function ae(){console.log("THREE.WebGLRenderer: Context Restored."),b=!1;let x=$e.autoReset,D=ie.enabled,F=ie.autoUpdate,z=ie.needsUpdate,U=ie.type;Oe(),$e.autoReset=x,ie.enabled=D,ie.autoUpdate=F,ie.needsUpdate=z,ie.type=U}c(ae,"Be");function me(x){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",x.statusMessage)}c(me,"Ve");function Q(x){let D=x.target;D.removeEventListener("dispose",Q),Y(D)}c(Q,"He");function Y(x){ge(x),ye.remove(x)}c(Y,"Ue");function ge(x){let D=ye.get(x).programs;D!==void 0&&(D.forEach(function(F){N.releaseProgram(F)}),x.isShaderMaterial&&N.releaseShaderCache(x))}c(ge,"We"),this.renderBufferDirect=function(x,D,F,z,U,J){D===null&&(D=Re);let he=U.isMesh&&U.matrixWorld.determinant()<0,ue=hh(x,D,F,z,U);Te.setMaterial(z,he);let pe=F.index,Ce=1;if(z.wireframe===!0){if(pe=T.getWireframeAttribute(F),pe===void 0)return;Ce=2}let Le=F.drawRange,Pe=F.attributes.position,Ve=Le.start*Ce,Ye=(Le.start+Le.count)*Ce;J!==null&&(Ve=Math.max(Ve,J.start*Ce),Ye=Math.min(Ye,(J.start+J.count)*Ce)),pe===null?Pe!=null&&(Ve=Math.max(Ve,0),Ye=Math.min(Ye,Pe.count)):(Ve=Math.max(Ve,0),Ye=Math.min(Ye,pe.count));let Je=Ye-Ve;if(Je<0||Je===1/0)return;Ee.setup(U,z,ue,F,pe);let Qe,Ke=ee;if(pe!==null&&(Qe=st.get(pe),Ke=se,Ke.setIndex(Qe)),U.isMesh)z.wireframe===!0?(Te.setLineWidth(z.wireframeLinewidth*We()),Ke.setMode(A.LINES)):Ke.setMode(A.TRIANGLES);else if(U.isLine){let xe=z.linewidth;xe===void 0&&(xe=1),Te.setLineWidth(xe*We()),U.isLineSegments?Ke.setMode(A.LINES):U.isLineLoop?Ke.setMode(A.LINE_LOOP):Ke.setMode(A.LINE_STRIP)}else U.isPoints?Ke.setMode(A.POINTS):U.isSprite&&Ke.setMode(A.TRIANGLES);if(U.isBatchedMesh)if(U._multiDrawInstances!==null)lr("THREE.WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection."),Ke.renderMultiDrawInstances(U._multiDrawStarts,U._multiDrawCounts,U._multiDrawCount,U._multiDrawInstances);else if(Ge.get("WEBGL_multi_draw"))Ke.renderMultiDraw(U._multiDrawStarts,U._multiDrawCounts,U._multiDrawCount);else{let xe=U._multiDrawStarts,pt=U._multiDrawCounts,vt=U._multiDrawCount,Nt=pe?st.get(pe).bytesPerElement:1,Gi=ye.get(z).currentProgram.getUniforms();for(let Et=0;Et<vt;Et++)Gi.setValue(A,"_gl_DrawID",Et),Ke.render(xe[Et]/Nt,pt[Et])}else if(U.isInstancedMesh)Ke.renderInstances(Ve,Je,U.count);else if(F.isInstancedBufferGeometry){let xe=F._maxInstanceCount===void 0?1/0:F._maxInstanceCount,pt=Math.min(F.instanceCount,xe);Ke.renderInstances(Ve,Je,pt)}else Ke.render(Ve,Je)};function be(x,D,F){x.transparent===!0&&x.side===2&&x.forceSinglePass===!1?(x.side=1,x.needsUpdate=!0,Zr(x,D,F),x.side=0,x.needsUpdate=!0,Zr(x,D,F),x.side=2):Zr(x,D,F)}c(be,"Ge"),this.compile=function(x,D,F=null){F===null&&(F=x),m=X.get(F),m.init(D),w.push(m),F.traverseVisible(function(U){U.isLight&&U.layers.test(D.layers)&&(m.pushLight(U),U.castShadow&&m.pushShadow(U))}),x!==F&&x.traverseVisible(function(U){U.isLight&&U.layers.test(D.layers)&&(m.pushLight(U),U.castShadow&&m.pushShadow(U))}),m.setupLights();let z=new Set;return x.traverse(function(U){if(!(U.isMesh||U.isPoints||U.isLine||U.isSprite))return;let J=U.material;if(J)if(Array.isArray(J))for(let he=0;he<J.length;he++){let ue=J[he];be(ue,F,U),z.add(ue)}else be(J,F,U),z.add(J)}),m=w.pop(),z},this.compileAsync=function(x,D,F=null){let z=this.compile(x,D,F);return new Promise(U=>{function J(){if(z.forEach(function(he){ye.get(he).currentProgram.isReady()&&z.delete(he)}),z.size===0){U(x);return}setTimeout(J,10)}c(J,"n"),Ge.get("KHR_parallel_shader_compile")===null?setTimeout(J,10):J()})};let rt=null;function je(x){rt&&rt(x)}c(je,"qe");function Ht(){xi.stop()}c(Ht,"Je");function Vt(){xi.start()}c(Vt,"Ye");let xi=new oo;xi.setAnimationLoop(je),typeof self<"u"&&xi.setContext(self),this.setAnimationLoop=function(x){rt=x,R.setAnimationLoop(x),x===null?xi.stop():xi.start()},R.addEventListener("sessionstart",Ht),R.addEventListener("sessionend",Vt),this.render=function(x,D){if(D!==void 0&&D.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(b===!0)return;if(x.matrixWorldAutoUpdate===!0&&x.updateMatrixWorld(),D.parent===null&&D.matrixWorldAutoUpdate===!0&&D.updateMatrixWorld(),R.enabled===!0&&R.isPresenting===!0&&(R.cameraAutoUpdate===!0&&R.updateCamera(D),D=R.getCamera()),x.isScene===!0&&x.onBeforeRender(S,x,D,P),m=X.get(x,w.length),m.init(D),w.push(m),Me.multiplyMatrices(D.projectionMatrix,D.matrixWorldInverse),Ze.setFromProjectionMatrix(Me,zi,D.reversedDepth),re=this.localClippingEnabled,W=de.init(this.clippingPlanes,re),v=K.get(x,f.length),v.init(),f.push(v),R.enabled===!0&&R.isPresenting===!0){let J=S.xr.getDepthSensingMesh();J!==null&&qa(J,D,-1/0,S.sortObjects)}qa(x,D,0,S.sortObjects),v.finish(),S.sortObjects===!0&&v.sort(j,te),De=R.enabled===!1||R.isPresenting===!1||R.hasDepthSensing()===!1,De&&ve.addToRenderList(v,x),this.info.render.frame++,W===!0&&de.beginShadows();let F=m.state.shadowsArray;ie.render(F,x,D),W===!0&&de.endShadows(),this.info.autoReset===!0&&this.info.reset();let z=v.opaque,U=v.transmissive;if(m.setupLights(),D.isArrayCamera){let J=D.cameras;if(U.length>0)for(let he=0,ue=J.length;he<ue;he++){let pe=J[he];cs(z,U,x,pe)}De&&ve.render(x);for(let he=0,ue=J.length;he<ue;he++){let pe=J[he];hs(v,x,pe,pe.viewport)}}else U.length>0&&cs(z,U,x,D),De&&ve.render(x),hs(v,x,D);P!==null&&L===0&&(Ae.updateMultisampleRenderTarget(P),Ae.updateRenderTargetMipmap(P)),x.isScene===!0&&x.onAfterRender(S,x,D),Ee.resetDefaultState(),B=-1,E=null,w.pop(),w.length>0?(m=w[w.length-1],W===!0&&de.setGlobalState(S.clippingPlanes,m.state.camera)):m=null,f.pop(),v=f.length>0?f[f.length-1]:null};function qa(x,D,F,z){if(x.visible===!1)return;if(x.layers.test(D.layers)){if(x.isGroup)F=x.renderOrder;else if(x.isLOD)x.autoUpdate===!0&&x.update(D);else if(x.isLight)m.pushLight(x),x.castShadow&&m.pushShadow(x);else if(x.isSprite){if(!x.frustumCulled||Ze.intersectsSprite(x)){z&&_e.setFromMatrixPosition(x.matrixWorld).applyMatrix4(Me);let J=_.update(x),he=x.material;he.visible&&v.push(x,J,he,F,_e.z,null)}}else if((x.isMesh||x.isLine||x.isPoints)&&(!x.frustumCulled||Ze.intersectsObject(x))){let J=_.update(x),he=x.material;if(z&&(x.boundingSphere===void 0?(J.boundingSphere===null&&J.computeBoundingSphere(),_e.copy(J.boundingSphere.center)):(x.boundingSphere===null&&x.computeBoundingSphere(),_e.copy(x.boundingSphere.center)),_e.applyMatrix4(x.matrixWorld).applyMatrix4(Me)),Array.isArray(he)){let ue=J.groups;for(let pe=0,Ce=ue.length;pe<Ce;pe++){let Le=ue[pe],Pe=he[Le.materialIndex];Pe&&Pe.visible&&v.push(x,J,Pe,F,_e.z,Le)}}else he.visible&&v.push(x,J,he,F,_e.z,null)}}let U=x.children;for(let J=0,he=U.length;J<he;J++)qa(U[J],D,F,z)}c(qa,"Ze");function hs(x,D,F,z){let U=x.opaque,J=x.transmissive,he=x.transparent;m.setupLightsView(F),W===!0&&de.setGlobalState(S.clippingPlanes,F),z&&Te.viewport(M.copy(z)),U.length>0&&Kr(U,D,F),J.length>0&&Kr(J,D,F),he.length>0&&Kr(he,D,F),Te.buffers.depth.setTest(!0),Te.buffers.depth.setMask(!0),Te.buffers.color.setMask(!0),Te.setPolygonOffset(!1)}c(hs,"Qe");function cs(x,D,F,z){if((F.isScene===!0?F.overrideMaterial:null)!==null)return;m.state.transmissionRenderTarget[z.id]===void 0&&(m.state.transmissionRenderTarget[z.id]=new vi(1,1,{generateMipmaps:!0,type:Ge.has("EXT_color_buffer_half_float")||Ge.has("EXT_color_buffer_float")?Wa:ur,minFilter:Va,samples:4,stencilBuffer:a,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:ke.workingColorSpace}));let U=m.state.transmissionRenderTarget[z.id],J=z.viewport||M;U.setSize(J.z*S.transmissionResolutionScale,J.w*S.transmissionResolutionScale);let he=S.getRenderTarget(),ue=S.getActiveCubeFace(),pe=S.getActiveMipmapLevel();S.setRenderTarget(U),S.getClearColor(H),k=S.getClearAlpha(),k<1&&S.setClearColor(16777215,.5),S.clear(),De&&ve.render(F);let Ce=S.toneMapping;S.toneMapping=0;let Le=z.viewport;if(z.viewport!==void 0&&(z.viewport=void 0),m.setupLightsView(z),W===!0&&de.setGlobalState(S.clippingPlanes,z),Kr(x,F,z),Ae.updateMultisampleRenderTarget(U),Ae.updateRenderTargetMipmap(U),Ge.has("WEBGL_multisampled_render_to_texture")===!1){let Pe=!1;for(let Ve=0,Ye=D.length;Ve<Ye;Ve++){let Je=D[Ve],Qe=Je.object,Ke=Je.geometry,xe=Je.material,pt=Je.group;if(xe.side===2&&Qe.layers.test(z.layers)){let vt=xe.side;xe.side=1,xe.needsUpdate=!0,us(Qe,F,z,Ke,xe,pt),xe.side=vt,xe.needsUpdate=!0,Pe=!0}}Pe===!0&&(Ae.updateMultisampleRenderTarget(U),Ae.updateRenderTargetMipmap(U))}S.setRenderTarget(he,ue,pe),S.setClearColor(H,k),Le!==void 0&&(z.viewport=Le),S.toneMapping=Ce}c(cs,"$e");function Kr(x,D,F){let z=D.isScene===!0?D.overrideMaterial:null;for(let U=0,J=x.length;U<J;U++){let he=x[U],ue=he.object,pe=he.geometry,Ce=he.group,Le=he.material;Le.allowOverride===!0&&z!==null&&(Le=z),ue.layers.test(F.layers)&&us(ue,D,F,pe,Le,Ce)}}c(Kr,"et");function us(x,D,F,z,U,J){x.onBeforeRender(S,D,F,z,U,J),x.modelViewMatrix.multiplyMatrices(F.matrixWorldInverse,x.matrixWorld),x.normalMatrix.getNormalMatrix(x.modelViewMatrix),U.onBeforeRender(S,D,F,z,x,J),U.transparent===!0&&U.side===2&&U.forceSinglePass===!1?(U.side=1,U.needsUpdate=!0,S.renderBufferDirect(F,D,z,U,x,J),U.side=0,U.needsUpdate=!0,S.renderBufferDirect(F,D,z,U,x,J),U.side=2):S.renderBufferDirect(F,D,z,U,x,J),x.onAfterRender(S,D,F,z,U,J)}c(us,"tt");function Zr(x,D,F){D.isScene!==!0&&(D=Re);let z=ye.get(x),U=m.state.lights,J=m.state.shadowsArray,he=U.state.version,ue=N.getParameters(x,U.state,J,D,F),pe=N.getProgramCacheKey(ue),Ce=z.programs;z.environment=x.isMeshStandardMaterial?D.environment:null,z.fog=D.fog,z.envMap=(x.isMeshStandardMaterial?ut:dt).get(x.envMap||z.environment),z.envMapRotation=z.environment!==null&&x.envMap===null?D.environmentRotation:x.envMapRotation,Ce===void 0&&(x.addEventListener("dispose",Q),Ce=new Map,z.programs=Ce);let Le=Ce.get(pe);if(Le!==void 0){if(z.currentProgram===Le&&z.lightsStateVersion===he)return ps(x,ue),Le}else ue.uniforms=N.getUniforms(x),x.onBeforeCompile(ue,S),Le=N.acquireProgram(ue,pe),Ce.set(pe,Le),z.uniforms=ue.uniforms;let Pe=z.uniforms;return(!x.isShaderMaterial&&!x.isRawShaderMaterial||x.clipping===!0)&&(Pe.clippingPlanes=de.uniform),ps(x,ue),z.needsLights=uh(x),z.lightsStateVersion=he,z.needsLights&&(Pe.ambientLightColor.value=U.state.ambient,Pe.lightProbe.value=U.state.probe,Pe.directionalLights.value=U.state.directional,Pe.directionalLightShadows.value=U.state.directionalShadow,Pe.spotLights.value=U.state.spot,Pe.spotLightShadows.value=U.state.spotShadow,Pe.rectAreaLights.value=U.state.rectArea,Pe.ltc_1.value=U.state.rectAreaLTC1,Pe.ltc_2.value=U.state.rectAreaLTC2,Pe.pointLights.value=U.state.point,Pe.pointLightShadows.value=U.state.pointShadow,Pe.hemisphereLights.value=U.state.hemi,Pe.directionalShadowMap.value=U.state.directionalShadowMap,Pe.directionalShadowMatrix.value=U.state.directionalShadowMatrix,Pe.spotShadowMap.value=U.state.spotShadowMap,Pe.spotLightMatrix.value=U.state.spotLightMatrix,Pe.spotLightMap.value=U.state.spotLightMap,Pe.pointShadowMap.value=U.state.pointShadowMap,Pe.pointShadowMatrix.value=U.state.pointShadowMatrix),z.currentProgram=Le,z.uniformsList=null,Le}c(Zr,"nt");function ds(x){if(x.uniformsList===null){let D=x.currentProgram.getUniforms();x.uniformsList=kr.seqWithValue(D.seq,x.uniforms)}return x.uniformsList}c(ds,"rt");function ps(x,D){let F=ye.get(x);F.outputColorSpace=D.outputColorSpace,F.batching=D.batching,F.batchingColor=D.batchingColor,F.instancing=D.instancing,F.instancingColor=D.instancingColor,F.instancingMorph=D.instancingMorph,F.skinning=D.skinning,F.morphTargets=D.morphTargets,F.morphNormals=D.morphNormals,F.morphColors=D.morphColors,F.morphTargetsCount=D.morphTargetsCount,F.numClippingPlanes=D.numClippingPlanes,F.numIntersection=D.numClipIntersection,F.vertexAlphas=D.vertexAlphas,F.vertexTangents=D.vertexTangents,F.toneMapping=D.toneMapping}c(ps,"it");function hh(x,D,F,z,U){D.isScene!==!0&&(D=Re),Ae.resetTextureUnits();let J=D.fog,he=z.isMeshStandardMaterial?D.environment:null,ue=P===null?S.outputColorSpace:P.isXRRenderTarget===!0?P.texture.colorSpace:pr,pe=(z.isMeshStandardMaterial?ut:dt).get(z.envMap||he),Ce=z.vertexColors===!0&&!!F.attributes.color&&F.attributes.color.itemSize===4,Le=!!F.attributes.tangent&&(!!z.normalMap||z.anisotropy>0),Pe=!!F.morphAttributes.position,Ve=!!F.morphAttributes.normal,Ye=!!F.morphAttributes.color,Je=0;z.toneMapped&&(P===null||P.isXRRenderTarget===!0)&&(Je=S.toneMapping);let Qe=F.morphAttributes.position||F.morphAttributes.normal||F.morphAttributes.color,Ke=Qe===void 0?0:Qe.length,xe=ye.get(z),pt=m.state.lights;if(W===!0&&(re===!0||x!==E)){let ft=x===E&&z.id===B;de.setState(z,x,ft)}let vt=!1;z.version===xe.__version?xe.needsLights&&xe.lightsStateVersion!==pt.state.version?vt=!0:xe.outputColorSpace===ue?U.isBatchedMesh&&xe.batching===!1||!U.isBatchedMesh&&xe.batching===!0||U.isBatchedMesh&&xe.batchingColor===!0&&U.colorTexture===null||U.isBatchedMesh&&xe.batchingColor===!1&&U.colorTexture!==null||U.isInstancedMesh&&xe.instancing===!1||!U.isInstancedMesh&&xe.instancing===!0||U.isSkinnedMesh&&xe.skinning===!1||!U.isSkinnedMesh&&xe.skinning===!0||U.isInstancedMesh&&xe.instancingColor===!0&&U.instanceColor===null||U.isInstancedMesh&&xe.instancingColor===!1&&U.instanceColor!==null||U.isInstancedMesh&&xe.instancingMorph===!0&&U.morphTexture===null||U.isInstancedMesh&&xe.instancingMorph===!1&&U.morphTexture!==null?vt=!0:xe.envMap===pe?z.fog===!0&&xe.fog!==J||xe.numClippingPlanes!==void 0&&(xe.numClippingPlanes!==de.numPlanes||xe.numIntersection!==de.numIntersection)?vt=!0:xe.vertexAlphas===Ce&&xe.vertexTangents===Le&&xe.morphTargets===Pe&&xe.morphNormals===Ve&&xe.morphColors===Ye&&xe.toneMapping===Je?xe.morphTargetsCount!==Ke&&(vt=!0):vt=!0:vt=!0:vt=!0:(vt=!0,xe.__version=z.version);let Nt=xe.currentProgram;vt===!0&&(Nt=Zr(z,D,U));let Gi=!1,Et=!1,mr=!1,et=Nt.getUniforms(),bt=xe.uniforms;if(Te.useProgram(Nt.program)&&(Gi=!0,Et=!0,mr=!0),z.id!==B&&(B=z.id,Et=!0),Gi||E!==x){Te.buffers.depth.getReversed()&&x.reversedDepth!==!0&&(x._reversedDepth=!0,x.updateProjectionMatrix()),et.setValue(A,"projectionMatrix",x.projectionMatrix),et.setValue(A,"viewMatrix",x.matrixWorldInverse);let ft=et.map.cameraPosition;ft!==void 0&&ft.setValue(A,ce.setFromMatrixPosition(x.matrixWorld)),qe.logarithmicDepthBuffer&&et.setValue(A,"logDepthBufFC",2/(Math.log(x.far+1)/Math.LN2)),(z.isMeshPhongMaterial||z.isMeshToonMaterial||z.isMeshLambertMaterial||z.isMeshBasicMaterial||z.isMeshStandardMaterial||z.isShaderMaterial)&&et.setValue(A,"isOrthographic",x.isOrthographicCamera===!0),E!==x&&(E=x,Et=!0,mr=!0)}if(U.isSkinnedMesh){et.setOptional(A,U,"bindMatrix"),et.setOptional(A,U,"bindMatrixInverse");let ft=U.skeleton;ft&&(ft.boneTexture===null&&ft.computeBoneTexture(),et.setValue(A,"boneTexture",ft.boneTexture,Ae))}U.isBatchedMesh&&(et.setOptional(A,U,"batchingTexture"),et.setValue(A,"batchingTexture",U._matricesTexture,Ae),et.setOptional(A,U,"batchingIdTexture"),et.setValue(A,"batchingIdTexture",U._indirectTexture,Ae),et.setOptional(A,U,"batchingColorTexture"),U._colorsTexture!==null&&et.setValue(A,"batchingColorTexture",U._colorsTexture,Ae));let At=F.morphAttributes;if((At.position!==void 0||At.normal!==void 0||At.color!==void 0)&&Se.update(U,F,Nt),(Et||xe.receiveShadow!==U.receiveShadow)&&(xe.receiveShadow=U.receiveShadow,et.setValue(A,"receiveShadow",U.receiveShadow)),z.isMeshGouraudMaterial&&z.envMap!==null&&(bt.envMap.value=pe,bt.flipEnvMap.value=pe.isCubeTexture&&pe.isRenderTargetTexture===!1?-1:1),z.isMeshStandardMaterial&&z.envMap===null&&D.environment!==null&&(bt.envMapIntensity.value=D.environmentIntensity),Et&&(et.setValue(A,"toneMappingExposure",S.toneMappingExposure),xe.needsLights&&ch(bt,mr),J&&z.fog===!0&&q.refreshFogUniforms(bt,J),q.refreshMaterialUniforms(bt,z,$,G,m.state.transmissionRenderTarget[x.id]),kr.upload(A,ds(xe),bt,Ae)),z.isShaderMaterial&&z.uniformsNeedUpdate===!0&&(kr.upload(A,ds(xe),bt,Ae),z.uniformsNeedUpdate=!1),z.isSpriteMaterial&&et.setValue(A,"center",U.center),et.setValue(A,"modelViewMatrix",U.modelViewMatrix),et.setValue(A,"normalMatrix",U.normalMatrix),et.setValue(A,"modelMatrix",U.matrixWorld),z.isShaderMaterial||z.isRawShaderMaterial){let ft=z.uniformsGroups;for(let Ot=0,Ya=ft.length;Ot<Ya;Ot++){let Mi=ft[Ot];oe.update(Mi,Nt),oe.bind(Mi,Nt)}}return Nt}c(hh,"at");function ch(x,D){x.ambientLightColor.needsUpdate=D,x.lightProbe.needsUpdate=D,x.directionalLights.needsUpdate=D,x.directionalLightShadows.needsUpdate=D,x.pointLights.needsUpdate=D,x.pointLightShadows.needsUpdate=D,x.spotLights.needsUpdate=D,x.spotLightShadows.needsUpdate=D,x.rectAreaLights.needsUpdate=D,x.hemisphereLights.needsUpdate=D}c(ch,"ot");function uh(x){return x.isMeshLambertMaterial||x.isMeshToonMaterial||x.isMeshPhongMaterial||x.isMeshStandardMaterial||x.isShadowMaterial||x.isShaderMaterial&&x.lights===!0}c(uh,"st"),this.getActiveCubeFace=function(){return I},this.getActiveMipmapLevel=function(){return L},this.getRenderTarget=function(){return P},this.setRenderTargetTextures=function(x,D,F){let z=ye.get(x);z.__autoAllocateDepthBuffer=x.resolveDepthBuffer===!1,z.__autoAllocateDepthBuffer===!1&&(z.__useRenderToTexture=!1),ye.get(x.texture).__webglTexture=D,ye.get(x.depthTexture).__webglTexture=z.__autoAllocateDepthBuffer?void 0:F,z.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(x,D){let F=ye.get(x);F.__webglFramebuffer=D,F.__useDefaultFramebuffer=D===void 0};let dh=A.createFramebuffer();this.setRenderTarget=function(x,D=0,F=0){P=x,I=D,L=F;let z=!0,U=null,J=!1,he=!1;if(x){let ue=ye.get(x);if(ue.__useDefaultFramebuffer!==void 0)Te.bindFramebuffer(A.FRAMEBUFFER,null),z=!1;else if(ue.__webglFramebuffer===void 0)Ae.setupRenderTarget(x);else if(ue.__hasExternalTextures)Ae.rebindTextures(x,ye.get(x.texture).__webglTexture,ye.get(x.depthTexture).__webglTexture);else if(x.depthBuffer){let Le=x.depthTexture;if(ue.__boundDepthTexture!==Le){if(Le!==null&&ye.has(Le)&&(x.width!==Le.image.width||x.height!==Le.image.height))throw Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");Ae.setupDepthRenderbuffer(x)}}let pe=x.texture;(pe.isData3DTexture||pe.isDataArrayTexture||pe.isCompressedArrayTexture)&&(he=!0);let Ce=ye.get(x).__webglFramebuffer;x.isWebGLCubeRenderTarget?(U=Array.isArray(Ce[D])?Ce[D][F]:Ce[D],J=!0):U=x.samples>0&&Ae.useMultisampledRTT(x)===!1?ye.get(x).__webglMultisampledFramebuffer:Array.isArray(Ce)?Ce[F]:Ce,M.copy(x.viewport),C.copy(x.scissor),V=x.scissorTest}else M.copy(fe).multiplyScalar($).floor(),C.copy(Ue).multiplyScalar($).floor(),V=He;if(F!==0&&(U=dh),Te.bindFramebuffer(A.FRAMEBUFFER,U)&&z&&Te.drawBuffers(x,U),Te.viewport(M),Te.scissor(C),Te.setScissorTest(V),J){let ue=ye.get(x.texture);A.framebufferTexture2D(A.FRAMEBUFFER,A.COLOR_ATTACHMENT0,A.TEXTURE_CUBE_MAP_POSITIVE_X+D,ue.__webglTexture,F)}else if(he){let ue=D;for(let pe=0;pe<x.textures.length;pe++){let Ce=ye.get(x.textures[pe]);A.framebufferTextureLayer(A.FRAMEBUFFER,A.COLOR_ATTACHMENT0+pe,Ce.__webglTexture,F,ue)}}else if(x!==null&&F!==0){let ue=ye.get(x.texture);A.framebufferTexture2D(A.FRAMEBUFFER,A.COLOR_ATTACHMENT0,A.TEXTURE_2D,ue.__webglTexture,F)}B=-1},this.readRenderTargetPixels=function(x,D,F,z,U,J,he,ue=0){if(!(x&&x.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let pe=ye.get(x).__webglFramebuffer;if(x.isWebGLCubeRenderTarget&&he!==void 0&&(pe=pe[he]),pe){Te.bindFramebuffer(A.FRAMEBUFFER,pe);try{let Ce=x.textures[ue],Le=Ce.format,Pe=Ce.type;if(!qe.textureFormatReadable(Le)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!qe.textureTypeReadable(Pe)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}D>=0&&D<=x.width-z&&F>=0&&F<=x.height-U&&(x.textures.length>1&&A.readBuffer(A.COLOR_ATTACHMENT0+ue),A.readPixels(D,F,z,U,we.convert(Le),we.convert(Pe),J))}finally{let Ce=P===null?null:ye.get(P).__webglFramebuffer;Te.bindFramebuffer(A.FRAMEBUFFER,Ce)}}},this.readRenderTargetPixelsAsync=async function(x,D,F,z,U,J,he,ue=0){if(!(x&&x.isWebGLRenderTarget))throw Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let pe=ye.get(x).__webglFramebuffer;if(x.isWebGLCubeRenderTarget&&he!==void 0&&(pe=pe[he]),pe){if(D>=0&&D<=x.width-z&&F>=0&&F<=x.height-U){Te.bindFramebuffer(A.FRAMEBUFFER,pe);let Ce=x.textures[ue],Le=Ce.format,Pe=Ce.type;if(!qe.textureFormatReadable(Le))throw Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!qe.textureTypeReadable(Pe))throw Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let Ve=A.createBuffer();A.bindBuffer(A.PIXEL_PACK_BUFFER,Ve),A.bufferData(A.PIXEL_PACK_BUFFER,J.byteLength,A.STREAM_READ),x.textures.length>1&&A.readBuffer(A.COLOR_ATTACHMENT0+ue),A.readPixels(D,F,z,U,we.convert(Le),we.convert(Pe),0);let Ye=P===null?null:ye.get(P).__webglFramebuffer;Te.bindFramebuffer(A.FRAMEBUFFER,Ye);let Je=A.fenceSync(A.SYNC_GPU_COMMANDS_COMPLETE,0);return A.flush(),await Uh(A,Je,4),A.bindBuffer(A.PIXEL_PACK_BUFFER,Ve),A.getBufferSubData(A.PIXEL_PACK_BUFFER,0,J),A.deleteBuffer(Ve),A.deleteSync(Je),J}throw Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")}},this.copyFramebufferToTexture=function(x,D=null,F=0){let z=2**-F,U=Math.floor(x.image.width*z),J=Math.floor(x.image.height*z),he=D===null?0:D.x,ue=D===null?0:D.y;Ae.setTexture2D(x,0),A.copyTexSubImage2D(A.TEXTURE_2D,F,0,0,he,ue,U,J),Te.unbindTexture()};let ph=A.createFramebuffer(),fh=A.createFramebuffer();this.copyTextureToTexture=function(x,D,F=null,z=null,U=0,J=null){J===null&&(U===0?J=0:(lr("WebGLRenderer: copyTextureToTexture function signature has changed to support src and dst mipmap levels."),J=U,U=0));let he,ue,pe,Ce,Le,Pe,Ve,Ye,Je,Qe=x.isCompressedTexture?x.mipmaps[J]:x.image;if(F!==null)he=F.max.x-F.min.x,ue=F.max.y-F.min.y,pe=F.isBox3?F.max.z-F.min.z:1,Ce=F.min.x,Le=F.min.y,Pe=F.isBox3?F.min.z:0;else{let At=2**-U;he=Math.floor(Qe.width*At),ue=Math.floor(Qe.height*At),pe=x.isDataArrayTexture?Qe.depth:x.isData3DTexture?Math.floor(Qe.depth*At):1,Ce=0,Le=0,Pe=0}z===null?(Ve=0,Ye=0,Je=0):(Ve=z.x,Ye=z.y,Je=z.z);let Ke=we.convert(D.format),xe=we.convert(D.type),pt;D.isData3DTexture?(Ae.setTexture3D(D,0),pt=A.TEXTURE_3D):D.isDataArrayTexture||D.isCompressedArrayTexture?(Ae.setTexture2DArray(D,0),pt=A.TEXTURE_2D_ARRAY):(Ae.setTexture2D(D,0),pt=A.TEXTURE_2D),A.pixelStorei(A.UNPACK_FLIP_Y_WEBGL,D.flipY),A.pixelStorei(A.UNPACK_PREMULTIPLY_ALPHA_WEBGL,D.premultiplyAlpha),A.pixelStorei(A.UNPACK_ALIGNMENT,D.unpackAlignment);let vt=A.getParameter(A.UNPACK_ROW_LENGTH),Nt=A.getParameter(A.UNPACK_IMAGE_HEIGHT),Gi=A.getParameter(A.UNPACK_SKIP_PIXELS),Et=A.getParameter(A.UNPACK_SKIP_ROWS),mr=A.getParameter(A.UNPACK_SKIP_IMAGES);A.pixelStorei(A.UNPACK_ROW_LENGTH,Qe.width),A.pixelStorei(A.UNPACK_IMAGE_HEIGHT,Qe.height),A.pixelStorei(A.UNPACK_SKIP_PIXELS,Ce),A.pixelStorei(A.UNPACK_SKIP_ROWS,Le),A.pixelStorei(A.UNPACK_SKIP_IMAGES,Pe);let et=x.isDataArrayTexture||x.isData3DTexture,bt=D.isDataArrayTexture||D.isData3DTexture;if(x.isDepthTexture){let At=ye.get(x),ft=ye.get(D),Ot=ye.get(At.__renderTarget),Ya=ye.get(ft.__renderTarget);Te.bindFramebuffer(A.READ_FRAMEBUFFER,Ot.__webglFramebuffer),Te.bindFramebuffer(A.DRAW_FRAMEBUFFER,Ya.__webglFramebuffer);for(let Mi=0;Mi<pe;Mi++)et&&(A.framebufferTextureLayer(A.READ_FRAMEBUFFER,A.COLOR_ATTACHMENT0,ye.get(x).__webglTexture,U,Pe+Mi),A.framebufferTextureLayer(A.DRAW_FRAMEBUFFER,A.COLOR_ATTACHMENT0,ye.get(D).__webglTexture,J,Je+Mi)),A.blitFramebuffer(Ce,Le,he,ue,Ve,Ye,he,ue,A.DEPTH_BUFFER_BIT,A.NEAREST);Te.bindFramebuffer(A.READ_FRAMEBUFFER,null),Te.bindFramebuffer(A.DRAW_FRAMEBUFFER,null)}else if(U!==0||x.isRenderTargetTexture||ye.has(x)){let At=ye.get(x),ft=ye.get(D);Te.bindFramebuffer(A.READ_FRAMEBUFFER,ph),Te.bindFramebuffer(A.DRAW_FRAMEBUFFER,fh);for(let Ot=0;Ot<pe;Ot++)et?A.framebufferTextureLayer(A.READ_FRAMEBUFFER,A.COLOR_ATTACHMENT0,At.__webglTexture,U,Pe+Ot):A.framebufferTexture2D(A.READ_FRAMEBUFFER,A.COLOR_ATTACHMENT0,A.TEXTURE_2D,At.__webglTexture,U),bt?A.framebufferTextureLayer(A.DRAW_FRAMEBUFFER,A.COLOR_ATTACHMENT0,ft.__webglTexture,J,Je+Ot):A.framebufferTexture2D(A.DRAW_FRAMEBUFFER,A.COLOR_ATTACHMENT0,A.TEXTURE_2D,ft.__webglTexture,J),U===0?bt?A.copyTexSubImage3D(pt,J,Ve,Ye,Je+Ot,Ce,Le,he,ue):A.copyTexSubImage2D(pt,J,Ve,Ye,Ce,Le,he,ue):A.blitFramebuffer(Ce,Le,he,ue,Ve,Ye,he,ue,A.COLOR_BUFFER_BIT,A.NEAREST);Te.bindFramebuffer(A.READ_FRAMEBUFFER,null),Te.bindFramebuffer(A.DRAW_FRAMEBUFFER,null)}else bt?x.isDataTexture||x.isData3DTexture?A.texSubImage3D(pt,J,Ve,Ye,Je,he,ue,pe,Ke,xe,Qe.data):D.isCompressedArrayTexture?A.compressedTexSubImage3D(pt,J,Ve,Ye,Je,he,ue,pe,Ke,Qe.data):A.texSubImage3D(pt,J,Ve,Ye,Je,he,ue,pe,Ke,xe,Qe):x.isDataTexture?A.texSubImage2D(A.TEXTURE_2D,J,Ve,Ye,he,ue,Ke,xe,Qe.data):x.isCompressedTexture?A.compressedTexSubImage2D(A.TEXTURE_2D,J,Ve,Ye,Qe.width,Qe.height,Ke,Qe.data):A.texSubImage2D(A.TEXTURE_2D,J,Ve,Ye,he,ue,Ke,xe,Qe);A.pixelStorei(A.UNPACK_ROW_LENGTH,vt),A.pixelStorei(A.UNPACK_IMAGE_HEIGHT,Nt),A.pixelStorei(A.UNPACK_SKIP_PIXELS,Gi),A.pixelStorei(A.UNPACK_SKIP_ROWS,Et),A.pixelStorei(A.UNPACK_SKIP_IMAGES,mr),J===0&&D.generateMipmaps&&A.generateMipmap(pt),Te.unbindTexture()},this.copyTextureToTexture3D=function(x,D,F=null,z=null,U=0){return lr('WebGLRenderer: copyTextureToTexture3D function has been deprecated. Use "copyTextureToTexture" instead.'),this.copyTextureToTexture(x,D,F,z,U)},this.initRenderTarget=function(x){ye.get(x).__webglFramebuffer===void 0&&Ae.setupRenderTarget(x)},this.initTexture=function(x){x.isCubeTexture?Ae.setTextureCube(x,0):x.isData3DTexture?Ae.setTexture3D(x,0):x.isDataArrayTexture||x.isCompressedArrayTexture?Ae.setTexture2DArray(x,0):Ae.setTexture2D(x,0),Te.unbindTexture()},this.resetState=function(){I=0,L=0,P=null,Te.reset(),Ee.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return zi}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=ke._getDrawingBufferColorSpace(e),t.unpackColorSpace=ke._getUnpackColorSpace()}}}))()}c(Pu,"Kg");export{_i as a,Va as b,pr as c,Bh as d,Be as e,yi as f,O as g,ke as h,Lt as i,nt as j,vi as k,Xi as l,at as m,ai as n,ze as o,Nn as p,Yt as q,Zt as r,Xa as s,Dt as t,Cr as u,zh as v,Ns as w,Hh as x,is as y,zs as z,Vh as A,kh as B,Gh as C,Wh as D,Xh as E,ir as F,jh as G,qh as H,Yh as I,Cu as J,Pu as K};
