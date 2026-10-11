// Source-derived Floating UI core and DOM platform from Codex app-shared.
// Packed source SHA-256: 47b7173d0bbecc5f6f32157134add7be65c0a22c2555c5bbeb9665b1bcded7b0.
// Positioning bodies below are kept verbatim; packed lazy initializers become
// local const declarations. Evidence: work/rea-reconstruction/primitives/flip/.
// No React/DSH/private-host imports. Read the companion contract before wiring.

const YOe=[`top`,`right`,`bottom`,`left`];

const bv=Math.min;

const xv=Math.max;

const Sv=Math.round;

const Cv=Math.floor;

const wv=e=>({x:e,y:e});

const XOe={left:`right`,right:`left`,bottom:`top`,top:`bottom`};

const ZOe=[`left`,`right`];

const QOe=[`right`,`left`];

const $Oe=[`top`,`bottom`];

const eke=[`bottom`,`top`];

function IOe(e,t,n){return xv(e,bv(t,n))}

function gv(e,t){return typeof e==`function`?e(t):e}

function _v(e){return e.split(`-`)[0]}

function vv(e){return e.split(`-`)[1]}

function LOe(e){return e===`x`?`y`:`x`}

function ROe(e){return e===`y`?`height`:`width`}

function yv(e){let t=e[0];return t===`t`||t===`b`?`y`:`x`}

function zOe(e){return LOe(yv(e))}

function BOe(e,t,n){n===void 0&&(n=!1);let r=vv(e),i=zOe(e),a=ROe(i),o=i===`x`?r===(n?`end`:`start`)?`right`:`left`:r===`start`?`bottom`:`top`;return t.reference[a]>t.floating[a]&&(o=GOe(o)),[o,GOe(o)]}

function VOe(e){let t=GOe(e);return[HOe(e),t,HOe(t)]}

function HOe(e){return e.includes(`start`)?e.replace(`start`,`end`):e.replace(`end`,`start`)}

function UOe(e,t,n){switch(e){case`top`:case`bottom`:return n?t?QOe:ZOe:t?ZOe:QOe;case`left`:case`right`:return t?$Oe:eke;default:return[]}}

function WOe(e,t,n,r){let i=vv(e),a=UOe(_v(e),n===`start`,r);return i&&(a=a.map(e=>e+`-`+i),t&&(a=a.concat(a.map(HOe)))),a}

function GOe(e){let t=_v(e);return XOe[t]+e.slice(t.length)}

function KOe(e){return{top:e.top??0,right:e.right??0,bottom:e.bottom??0,left:e.left??0}}

function qOe(e){return typeof e==`number`?{top:e,right:e,bottom:e,left:e}:KOe(e)}

function JOe(e){let{x:t,y:n,width:r,height:i}=e;return{width:r,height:i,top:n,left:t,right:t+r,bottom:n+i,x:t,y:n}}

function nke(e,t,n){let{reference:r,floating:i}=e,a=yv(t),o=zOe(t),s=ROe(o),c=_v(t),l=a===`y`,u=r.x+r.width/2-i.width/2,d=r.y+r.height/2-i.height/2,f=r[s]/2-i[s]/2,p;switch(c){case`top`:p={x:u,y:r.y-i.height};break;case`bottom`:p={x:u,y:r.y+r.height};break;case`right`:p={x:r.x+r.width,y:d};break;case`left`:p={x:r.x-i.width,y:d};break;default:p={x:r.x,y:r.y}}let m=vv(t);return m&&(p[o]+=f*(m===`end`?1:-1)*(n&&l?-1:1)),p}

async function rke(e,t){t===void 0&&(t={});let{x:n,y:r,platform:i,rects:a,elements:o,strategy:s}=e,{boundary:c=`clippingAncestors`,rootBoundary:l=`viewport`,elementContext:u=`floating`,altBoundary:d=!1,padding:f=0}=gv(t,e),p=qOe(f),m=o[d?u===`floating`?`reference`:`floating`:u],h=JOe(await i.getClippingRect({element:await(i.isElement==null?void 0:i.isElement(m))??!0?m:m.contextElement||await(i.getDocumentElement==null?void 0:i.getDocumentElement(o.floating)),boundary:c,rootBoundary:l,strategy:s})),g=u===`floating`?{x:n,y:r,width:a.floating.width,height:a.floating.height}:a.reference,_=await(i.getOffsetParent==null?void 0:i.getOffsetParent(o.floating)),v=await(i.isElement==null?void 0:i.isElement(_))&&await(i.getScale==null?void 0:i.getScale(_))||{x:1,y:1},y=JOe(i.convertOffsetParentRelativeRectToViewportRelativeRect?await i.convertOffsetParentRelativeRectToViewportRelativeRect({elements:o,rect:g,offsetParent:_,strategy:s}):g);return{top:(h.top-y.top+p.top)/v.y,bottom:(y.bottom-h.bottom+p.bottom)/v.y,left:(h.left-y.left+p.left)/v.x,right:(y.right-h.right+p.right)/v.x}}

function ike(e,t){return{top:e.top-t.height,right:e.right-t.width,bottom:e.bottom-t.height,left:e.left-t.width}}

function ake(e){return YOe.some(t=>e[t]>=0)}

async function oke(e,t){let{placement:n,platform:r,elements:i}=e,a=await(r.isRTL==null?void 0:r.isRTL(i.floating)),o=_v(n),s=vv(n),c=yv(n)===`y`,l=fke.has(o)?-1:1,u=a&&c?-1:1,d=gv(t,e),{mainAxis:f,crossAxis:p,alignmentAxis:m}=typeof d==`number`?{mainAxis:d,crossAxis:0,alignmentAxis:null}:{mainAxis:d.mainAxis||0,crossAxis:d.crossAxis||0,alignmentAxis:d.alignmentAxis};return s&&typeof m==`number`&&(p=s===`end`?m*-1:m),c?{x:p*u,y:f*l}:{x:f*l,y:p*u}}

const ske=50;

const cke=async(e,t,n)=>{let{placement:r=`bottom`,strategy:i=`absolute`,middleware:a=[],platform:o}=n,s=o.detectOverflow?o:{...o,detectOverflow:rke},c=await(o.isRTL==null?void 0:o.isRTL(t)),l=await o.getElementRects({reference:e,floating:t,strategy:i}),{x:u,y:d}=nke(l,r,c),f=r,p=0,m={};for(let n=0;n<a.length;n++){let h=a[n];if(!h)continue;let{name:g,fn:_}=h,{x:v,y,data:b,reset:x}=await _({x:u,y:d,initialPlacement:r,placement:f,strategy:i,middlewareData:m,rects:l,platform:s,elements:{reference:e,floating:t}});u=v??u,d=y??d,m[g]={...m[g],...b},x&&p<ske&&(p++,typeof x==`object`&&(x.placement&&(f=x.placement),x.rects&&(l=x.rects===!0?await o.getElementRects({reference:e,floating:t,strategy:i}):x.rects),{x:u,y:d}=nke(l,f,c)),n=-1)}return{x:u,y:d,placement:f,strategy:i,middlewareData:m}};

const lke=e=>({name:`arrow`,options:e,async fn(t){let{x:n,y:r,placement:i,rects:a,platform:o,elements:s,middlewareData:c}=t,{element:l,padding:u=0}=gv(e,t)||{};if(l==null)return{};let d=qOe(u),f={x:n,y:r},p=zOe(i),m=ROe(p),h=await o.getDimensions(l),g=p===`y`,_=g?`top`:`left`,v=g?`bottom`:`right`,y=g?`clientHeight`:`clientWidth`,b=a.reference[m]+a.reference[p]-f[p]-a.floating[m],x=f[p]-a.reference[p],S=await(o.getOffsetParent==null?void 0:o.getOffsetParent(l)),C=S?S[y]:0;(!C||!await(o.isElement==null?void 0:o.isElement(S)))&&(C=s.floating[y]||a.floating[m]);let w=b/2-x/2,T=C/2-h[m]/2-1,E=bv(d[_],T),D=bv(d[v],T),O=C-h[m]-D,k=C/2-h[m]/2+w,A=IOe(E,k,O),j=!c.arrow&&vv(i)!=null&&k!==A&&a.reference[m]/2-(k<E?E:D)-h[m]/2<0,M=j?k<E?k-E:k-O:0;return{[p]:f[p]+M,data:{[p]:A,centerOffset:k-A-M,...j&&{alignmentOffset:M}},reset:j}}});

const uke=function(e){return e===void 0&&(e={}),{name:`flip`,options:e,async fn(t){var n;let{placement:r,middlewareData:i,rects:a,initialPlacement:o,platform:s,elements:c}=t,{mainAxis:l=!0,crossAxis:u=!0,fallbackPlacements:d,fallbackStrategy:f=`bestFit`,fallbackAxisSideDirection:p=`none`,flipAlignment:m=!0,...h}=gv(e,t);if((n=i.arrow)!=null&&n.alignmentOffset)return{};let g=_v(r),_=yv(o),v=_v(o)===o,y=await(s.isRTL==null?void 0:s.isRTL(c.floating)),b=d||(v||!m?[GOe(o)]:VOe(o)),x=p!==`none`;!d&&x&&b.push(...WOe(o,m,p,y));let S=[o,...b],C=await s.detectOverflow(t,h),w=[],T=i.flip?.overflows||[];if(l&&w.push(C[g]),u){let e=BOe(r,a,y);w.push(C[e[0]],C[e[1]])}if(T=[...T,{placement:r,overflows:w}],!w.every(e=>e<=0)){let e=(i.flip?.index||0)+1,t=S[e];if(t&&(u!==`alignment`||_===yv(t)||T.every(e=>yv(e.placement)!==_||e.overflows[0]>0)))return{data:{index:e,overflows:T},reset:{placement:t}};let n=T.filter(e=>e.overflows[0]<=0).sort((e,t)=>e.overflows[1]-t.overflows[1])[0]?.placement;if(!n)switch(f){case`bestFit`:{let e=T.filter(e=>{if(x){let t=yv(e.placement);return t===_||t===`y`}return!0}).map(e=>[e.placement,e.overflows.filter(e=>e>0).reduce((e,t)=>e+t,0)]).sort((e,t)=>e[1]-t[1])[0]?.[0];e&&(n=e);break}case`initialPlacement`:n=o}if(r!==n)return{reset:{placement:n}}}return{}}}};

const dke=function(e){return e===void 0&&(e={}),{name:`hide`,options:e,async fn(t){let{rects:n,platform:r}=t,{strategy:i=`referenceHidden`,...a}=gv(e,t);switch(i){case`referenceHidden`:{let e=ike(await r.detectOverflow(t,{...a,elementContext:`reference`}),n.reference);return{data:{referenceHiddenOffsets:e,referenceHidden:ake(e)}}}case`escaped`:{let e=ike(await r.detectOverflow(t,{...a,altBoundary:!0}),n.floating);return{data:{escapedOffsets:e,escaped:ake(e)}}}default:return{}}}}};

const fke=new Set([`left`,`top`]);

const pke=function(e){return e===void 0&&(e=0),{name:`offset`,options:e,async fn(t){var n;let{x:r,y:i,placement:a,middlewareData:o}=t,s=await oke(t,e);return a===o.offset?.placement&&(n=o.arrow)!=null&&n.alignmentOffset?{}:{x:r+s.x,y:i+s.y,data:{...s,placement:a}}}}};

const mke=function(e){return e===void 0&&(e={}),{name:`shift`,options:e,async fn(t){let{x:n,y:r,placement:i,platform:a}=t,{mainAxis:o=!0,crossAxis:s=!1,limiter:c={fn:e=>{let{x:t,y:n}=e;return{x:t,y:n}}},...l}=gv(e,t),u={x:n,y:r},d=await a.detectOverflow(t,l),f=yv(i),p=LOe(f),m=u[p],h=u[f],g=(e,t)=>IOe(t+d[e===`y`?`top`:`left`],t,t-d[e===`y`?`bottom`:`right`]);o&&(m=g(p,m)),s&&(h=g(f,h));let _=c.fn({...t,[p]:m,[f]:h});return{..._,data:{x:_.x-n,y:_.y-r,enabled:{[p]:o,[f]:s}}}}}};

const hke=function(e){return e===void 0&&(e={}),{options:e,fn(t){let{x:n,y:r,placement:i,rects:a,middlewareData:o}=t,{offset:s=0,mainAxis:c=!0,crossAxis:l=!0}=gv(e,t),u={x:n,y:r},d=yv(i),f=LOe(d),p=u[f],m=u[d],h=gv(s,t),g=typeof h==`number`?{mainAxis:h,crossAxis:0}:{mainAxis:h.mainAxis??0,crossAxis:h.crossAxis??0};if(c){let e=f===`y`?`height`:`width`,t=a.reference[f]-a.floating[e]+g.mainAxis,n=a.reference[f]+a.reference[e]-g.mainAxis;p<t?p=t:p>n&&(p=n)}if(l){let e=f===`y`?`width`:`height`,t=fke.has(_v(i)),n=a.reference[d]-a.floating[e]+(t&&o.offset?.[d]||0)+(t?0:g.crossAxis),r=a.reference[d]+a.reference[e]+(t?0:o.offset?.[d]||0)-(t?g.crossAxis:0);m<n?m=n:m>r&&(m=r)}return{[f]:p,[d]:m}}}};

const gke=function(e){return e===void 0&&(e={}),{name:`size`,options:e,async fn(t){let{placement:n,rects:r,platform:i,elements:a}=t,{apply:o=()=>{},...s}=gv(e,t),c=await i.detectOverflow(t,s),l=_v(n),u=vv(n),d=yv(n)===`y`,{width:f,height:p}=r.floating,m,h;l===`top`||l===`bottom`?(m=l,h=u===(await(i.isRTL==null?void 0:i.isRTL(a.floating))?`start`:`end`)?`left`:`right`):(h=l,m=u===`end`?`top`:`bottom`);let g=p-c.top-c.bottom,_=f-c.left-c.right,v=bv(p-c[m],g),y=bv(f-c[h],_),b=t.middlewareData.shift,x=!b,S=v,C=y;b!=null&&b.enabled.x&&(C=_),b!=null&&b.enabled.y&&(S=g),x&&!u&&(d?C=f-2*xv(c.left,c.right):S=p-2*xv(c.top,c.bottom)),await o({...t,availableWidth:C,availableHeight:S});let w=await i.getDimensions(a.floating);return f!==w.width||p!==w.height?{reset:{rects:!0}}:{}}}};

const kke=/transform|translate|scale|rotate|perspective|filter/;

const Ake=/paint|layout|strict|content/;

const Fv=e=>!!e&&e!==`none`;

let jke;

function vke(){return typeof window<`u`}

function Tv(e){return yke(e)?(e.nodeName||``).toLowerCase():`#document`}

function Ev(e){var t;return(e==null||(t=e.ownerDocument)==null?void 0:t.defaultView)||window}

function Dv(e){return((yke(e)?e.ownerDocument:e.document)||window.document)?.documentElement}

function yke(e){return vke()?e instanceof Node||e instanceof Ev(e).Node:!1}

function Ov(e){return vke()?e instanceof Element||e instanceof Ev(e).Element:!1}

function kv(e){return vke()?e instanceof HTMLElement||e instanceof Ev(e).HTMLElement:!1}

function bke(e){return!vke()||typeof ShadowRoot>`u`?!1:e instanceof ShadowRoot||e instanceof Ev(e).ShadowRoot}

function xke(e){let{overflow:t,overflowX:n,overflowY:r,display:i}=jv(e);return/auto|scroll|overlay|hidden|clip/.test(t+r+n)&&i!==`inline`&&i!==`contents`}

function Ske(e){return/^(table|td|th)$/.test(Tv(e))}

function Cke(e){try{if(e.matches(`:popover-open`))return!0}catch{}try{return e.matches(`:modal`)}catch{return!1}}

function wke(e){let t=Ov(e)?jv(e):e;return Fv(t.transform)||Fv(t.translate)||Fv(t.scale)||Fv(t.rotate)||Fv(t.perspective)||!Eke()&&(Fv(t.backdropFilter)||Fv(t.filter))||kke.test(t.willChange||``)||Ake.test(t.contain||``)}

function Tke(e){let t=Nv(e);for(;kv(t)&&!Av(t);){if(wke(t))return t;if(Cke(t))return null;t=Nv(t)}return null}

function Eke(){return jke??=typeof CSS<`u`&&CSS.supports&&CSS.supports(`-webkit-backdrop-filter`,`none`),jke}

function Av(e){return/^(html|body|#document)$/.test(Tv(e))}

function jv(e){return Ev(e).getComputedStyle(e)}

function Mv(e){return Ov(e)?{scrollLeft:e.scrollLeft,scrollTop:e.scrollTop}:{scrollLeft:e.scrollX,scrollTop:e.scrollY}}

function Nv(e){if(Tv(e)===`html`)return e;let t=e.assignedSlot||e.parentNode||bke(e)&&e.host||Dv(e);return bke(t)?t.host:t}

function Dke(e){let t=Nv(e);return Av(t)?(e.ownerDocument||e).body:kv(t)&&xke(t)?t:Dke(t)}

function Pv(e,t,n){t===void 0&&(t=[]),n===void 0&&(n=!0);let r=Dke(e),i=r===e.ownerDocument?.body,a=Ev(r);if(i){let e=Oke(a);return t.concat(a,a.visualViewport||[],xke(r)?r:[],e&&n?Pv(e):[])}return t.concat(r,Pv(r,[],n))}

function Oke(e){return e.parent&&Object.getPrototypeOf(e.parent)?e.frameElement:null}

function Nke(e){let t=jv(e),n=parseFloat(t.width)||0,r=parseFloat(t.height)||0,i=kv(e),a=i?e.offsetWidth:n,o=i?e.offsetHeight:r,s=Sv(n)!==a||Sv(r)!==o;return s&&(n=a,r=o),{width:n,height:r,$:s}}

function Pke(e){return Ov(e)?e:e.contextElement}

function Iv(e){let t=Pke(e);if(!kv(t))return wv(1);let n=t.getBoundingClientRect(),{width:r,height:i,$:a}=Nke(t),o=(a?Sv(n.width):n.width)/r,s=(a?Sv(n.height):n.height)/i;return(!o||!Number.isFinite(o))&&(o=1),(!s||!Number.isFinite(s))&&(s=1),{x:o,y:s}}

function Fke(e){let t=Ev(e);return!Eke()||!t.visualViewport?eAe:{x:t.visualViewport.offsetLeft,y:t.visualViewport.offsetTop}}

function Ike(e,t,n){return t===void 0&&(t=!1),!!n&&t&&n===Ev(e)}

function Lv(e,t,n,r){t===void 0&&(t=!1),n===void 0&&(n=!1);let i=e.getBoundingClientRect(),a=Pke(e),o=wv(1);t&&(r?Ov(r)&&(o=Iv(r)):o=Iv(e));let s=Ike(a,n,r)?Fke(a):wv(0),c=(i.left+s.x)/o.x,l=(i.top+s.y)/o.y,u=i.width/o.x,d=i.height/o.y;if(a&&r){let e=Ev(a),t=Ov(r)?Ev(r):r,n=e,i=Oke(n);for(;i&&t!==n;){let e=Iv(i),t=i.getBoundingClientRect(),r=jv(i),a=t.left+(i.clientLeft+parseFloat(r.paddingLeft))*e.x,o=t.top+(i.clientTop+parseFloat(r.paddingTop))*e.y;c*=e.x,l*=e.y,u*=e.x,d*=e.y,c+=a,l+=o,n=Ev(i),i=Oke(n)}}return JOe({width:u,height:d,x:c,y:l})}

function Rv(e,t){let n=Mv(e).scrollLeft;return t?t.left+n:Lv(Dv(e)).left+n}

function Lke(e,t){let n=e.getBoundingClientRect();return{x:n.left+t.scrollLeft-Rv(e,n),y:n.top+t.scrollTop}}

function Rke(e){let{elements:t,rect:n,offsetParent:r,strategy:i}=e,a=i===`fixed`,o=Dv(r),s=t?Cke(t.floating):!1;if(r===o||s&&a)return n;let c={scrollLeft:0,scrollTop:0},l=wv(1),u=wv(0),d=kv(r);if((d||!a)&&((Tv(r)!==`body`||xke(o))&&(c=Mv(r)),d)){let e=Lv(r);l=Iv(r),u.x=e.x+r.clientLeft,u.y=e.y+r.clientTop}let f=o&&!d&&!a?Lke(o,c):wv(0);return{width:n.width*l.x,height:n.height*l.y,x:n.x*l.x-c.scrollLeft*l.x+u.x+f.x,y:n.y*l.y-c.scrollTop*l.y+u.y+f.y}}

function zke(e){return e.getClientRects?Array.from(e.getClientRects()):[]}

function Bke(e){let t=Mv(e),n=e.ownerDocument.body,r=xv(e.scrollWidth,e.clientWidth,n.scrollWidth,n.clientWidth),i=xv(e.scrollHeight,e.clientHeight,n.scrollHeight,n.clientHeight),a=-t.scrollLeft+Rv(e),o=-t.scrollTop;return jv(n).direction===`rtl`&&(a+=xv(e.clientWidth,n.clientWidth)-r),{width:r,height:i,x:a,y:o}}

function Vke(e,t,n){n===void 0&&(n=`viewport`);let r=n===`layoutViewport`,i=Ev(e),a=Dv(e),o=i.visualViewport,s=a.clientWidth,c=a.clientHeight,l=0,u=0;if(o){let e=!Eke()||t===`fixed`;r?e||(l=-o.offsetLeft,u=-o.offsetTop):(s=o.width,c=o.height,e&&(l=o.offsetLeft,u=o.offsetTop))}if(Rv(a)<=0){let e=a.ownerDocument,t=e.body,n=getComputedStyle(t),r=e.compatMode===`CSS1Compat`&&parseFloat(n.marginLeft)+parseFloat(n.marginRight)||0,i=Math.abs(a.clientWidth-t.clientWidth-r),o=getComputedStyle(a).scrollbarGutter===`stable both-edges`?i/2:i;o<=tAe&&(s-=o)}return{width:s,height:c,x:l,y:u}}

function Hke(e,t){let n=Lv(e,!0,t===`fixed`),r=n.top+e.clientTop,i=n.left+e.clientLeft,a=Iv(e);return{width:e.clientWidth*a.x,height:e.clientHeight*a.y,x:i*a.x,y:r*a.y}}

function Uke(e,t,n){let r;if(t===`viewport`||t===`layoutViewport`)r=Vke(e,n,t);else if(t===`document`)r=Bke(Dv(e));else if(Ov(t))r=Hke(t,n);else{let n=Fke(e);r={x:t.x-n.x,y:t.y-n.y,width:t.width,height:t.height}}return JOe(r)}

function Wke(e,t){let n=t.get(e);if(n)return n;let r=Pv(e,[],!1).filter(e=>Ov(e)&&Tv(e)!==`body`),i=null,a=jv(e).position===`fixed`,o=a?Nv(e):e;for(;Ov(o)&&!Av(o);){let e=jv(o),t=wke(o),n=i?i.position:a?`fixed`:``;!t&&(n===`fixed`||n===`absolute`&&e.position===`static`)?r=r.filter(e=>e!==o):i=e,o=Nv(o)}return t.set(e,r),r}

function Gke(e){let{element:t,boundary:n,rootBoundary:r,strategy:i}=e,a=[...n===`clippingAncestors`?Cke(t)?[]:Wke(t,this._c):[].concat(n),r],o=Uke(t,a[0],i),s=o.top,c=o.right,l=o.bottom,u=o.left;for(let e=1;e<a.length;e++){let n=Uke(t,a[e],i);s=xv(n.top,s),c=bv(n.right,c),l=bv(n.bottom,l),u=xv(n.left,u)}return{width:c-u,height:l-s,x:u,y:s}}

function Kke(e){let{width:t,height:n}=Nke(e);return{width:t,height:n}}

function qke(e,t,n){let r=kv(t),i=Dv(t),a=n===`fixed`,o=Lv(e,!0,a,t),s={scrollLeft:0,scrollTop:0},c=wv(0);if((r||!a)&&((Tv(t)!==`body`||xke(i))&&(s=Mv(t)),r)){let e=Lv(t,!0,a,t);c.x=e.x+t.clientLeft,c.y=e.y+t.clientTop}!r&&i&&(c.x=Rv(i));let l=i&&!r&&!a?Lke(i,s):wv(0);return{x:o.left+s.scrollLeft-c.x-l.x,y:o.top+s.scrollTop-c.y-l.y,width:o.width,height:o.height}}

function Jke(e){return jv(e).position===`static`}

function Yke(e,t){if(!kv(e)||jv(e).position===`fixed`)return null;if(t)return t(e);let n=e.offsetParent;return Dv(e)===n&&(n=n.ownerDocument.body),n}

function Xke(e,t){let n=Ev(e);if(Cke(e))return n;if(!kv(e)){let t=Nv(e);for(;t&&!Av(t);){if(Ov(t)&&!Jke(t))return t;t=Nv(t)}return n}let r=Yke(e,t);for(;r&&Ske(r)&&Jke(r);)r=Yke(r,t);return r&&Av(r)&&Jke(r)&&!wke(r)?n:r||Tke(e)||n}

function Zke(e){return jv(e).direction===`rtl`}

function Qke(e,t){return e.x===t.x&&e.y===t.y&&e.width===t.width&&e.height===t.height}

function $ke(e,t,n){let r=null,i,a=Dv(e);function o(){var e;clearTimeout(i),(e=r)==null||e.disconnect(),r=null}function s(n,c){n===void 0&&(n=!1),c===void 0&&(c=1),o();let l=e.getBoundingClientRect(),{left:u,top:d,width:f,height:p}=l;if(n||t(),!f||!p)return;let m=Cv(d),h=Cv(a.clientWidth-(u+f)),g=Cv(a.clientHeight-(d+p)),_=Cv(u),v={rootMargin:-m+`px `+-h+`px `+-g+`px `+-_+`px`,threshold:xv(0,bv(1,c))||1},y=!0;function b(t){let n=t[0].intersectionRatio;if(!Qke(l,e.getBoundingClientRect()))return s();if(n!==c){if(!y)return s();n?s(!1,n):i=setTimeout(()=>{s(!1,1e-7)},1e3)}y=!1}try{r=new IntersectionObserver(b,{...v,root:a.ownerDocument})}catch{r=new IntersectionObserver(b,v)}r.observe(e)}let c=Ev(e),l=()=>s(n);return c.addEventListener(`resize`,l),s(!0),()=>{c.removeEventListener(`resize`,l),o()}}

function zv(e,t,n,r){r===void 0&&(r={});let{ancestorScroll:i=!0,ancestorResize:a=!0,elementResize:o=typeof ResizeObserver==`function`,layoutShift:s=typeof IntersectionObserver==`function`,animationFrame:c=!1}=r,l=Pke(e),u=i||a?[...l?Pv(l):[],...t?Pv(t):[]]:[];u.forEach(e=>{i&&e.addEventListener(`scroll`,n),a&&e.addEventListener(`resize`,n)});let d=l&&s?$ke(l,n,a):null,f=-1,p=null;o&&(p=new ResizeObserver(e=>{let[r]=e;r&&r.target===l&&p&&t&&(p.unobserve(t),cancelAnimationFrame(f),f=requestAnimationFrame(()=>{var e;(e=p)==null||e.observe(t)})),n()}),l&&!c&&p.observe(l),t&&p.observe(t));let m,h=c?Lv(e):null;c&&g();function g(){let t=Lv(e);h&&!Qke(h,t)&&n(),h=t,m=requestAnimationFrame(g)}return n(),()=>{var e;u.forEach(e=>{i&&e.removeEventListener(`scroll`,n),a&&e.removeEventListener(`resize`,n)}),d?.(),(e=p)==null||e.disconnect(),p=null,c&&cancelAnimationFrame(m)}}

const eAe=wv(0);

const tAe=25;

const nAe=async function(e){let t=this.getOffsetParent||Xke,n=this.getDimensions,r=await n(e.floating);return{reference:qke(e.reference,await t(e.floating),e.strategy),floating:{x:0,y:0,width:r.width,height:r.height}}};

const rAe={convertOffsetParentRelativeRectToViewportRelativeRect:Rke,getDocumentElement:Dv,getClippingRect:Gke,getOffsetParent:Xke,getElementRects:nAe,getClientRects:zke,getDimensions:Kke,getScale:Iv,isElement:Ov,isRTL:Zke};

const iAe=rke;

const aAe=pke;

const oAe=mke;

const sAe=uke;

const cAe=gke;

const lAe=dke;

const uAe=lke;

const dAe=hke;

const fAe=(e,t,n)=>{let r=new Map,i=n??{},a={...rAe,...i.platform,_c:r};return cke(e,t,{...i,platform:a})};

function mAe(e){return typeof window>`u`?1:(e.ownerDocument.defaultView||window).devicePixelRatio||1}

function hAe(e,t){let n=mAe(e);return Math.round(t*n)/n}

function jAe(e){return e!==null}

function Jv(e){let[t,n=`center`]=e.split(`-`);return[t,n]}

const qAe = e=>({name:`transformOrigin`,options:e,fn(t){let{placement:n,rects:r,middlewareData:i}=t,a=i.arrow?.centerOffset!==0,o=a?0:e.arrowWidth,s=a?0:e.arrowHeight,[c,l]=Jv(n),u={start:`0%`,center:`50%`,end:`100%`}[l],d=(i.arrow?.x??0)+o/2,f=(i.arrow?.y??0)+s/2,p=``,m=``;return c===`bottom`?(p=a?u:`${d}px`,m=`${-s}px`):c===`top`?(p=a?u:`${d}px`,m=`${r.floating.height+s}px`):c===`right`?(p=`${-s}px`,m=a?u:`${f}px`):c===`left`&&(p=`${r.floating.width+s}px`,m=a?u:`${f}px`),{data:{x:p,y:m}}}});

/** Exact source exports. The DOM compute entry creates a per-call clipping cache. */
export const sourceComputePosition = fAe;
export const sourceDetectOverflow = rke;
export const sourceOffset = pke;
export const sourceShift = mke;
export const sourceLimitShift = hke;
export const sourceFlip = uke;
export const sourceSize = gke;
export const sourceArrow = lke;
export const sourceHide = dke;
export const sourceTransformOrigin = qAe;
export const sourceAutoUpdate = zv;

/**
 * Source `_Ae` floatingStyles expression, with its React memoization removed.
 * Coordinates are rounded to the floating element's actual devicePixelRatio.
 */
export function getCodexCuFloatingStyles(result, floating, transform = true) {
  const base = { position: result.strategy, left: 0, top: 0 };
  if (!floating) return base;
  const x = hAe(floating, result.x), y = hAe(floating, result.y);
  return transform
    ? { ...base, transform: `translate(${x}px, ${y}px)`, ...(mAe(floating) >= 1.5 && { willChange: 'transform' }) }
    : { position: result.strategy, left: x, top: y };
}

/**
 * Assemble the exact source Radix Popper (menu/popover) or oSi (tooltip)
 * middleware order. `reference` may be the original DOM virtual reference,
 * including contextElement; `floating` is the actual positioned DOM element.
 *
 * Returns a Promise. Parent owns open-state races, scheduling and cleanup.
 * `sizeApply` receives the original middleware args before remeasurement, so
 * caller-applied source CSS constraints participate in size's rects reset.
 * Read flip/README.md for source defaults, scaling gates and coordinate spaces.
 */
export async function computeCodexCuFloatingPosition({
  reference,
  floating,
  type = 'menu',
  side = type === 'tooltip' ? 'top' : 'bottom',
  align = type === 'tooltip' ? 'center' : 'start',
  sideOffset = type === 'tooltip' ? 2 : type === 'popover' ? 4 : 1,
  alignOffset = 0,
  collisionPadding = type === 'tooltip' ? 8 : 6,
  collisionBoundary = [],
  avoidCollisions = true,
  sticky = 'partial',
  hideWhenDetached = false,
  flipAlignment = true,
  tooltipVariant = 'tooltip',
  offsetScale = 1,
  availableSizeScale = 1,
  arrowElement = null,
  arrowPadding = type === 'tooltip' ? 16 * offsetScale : 0,
  arrowWidth = arrowElement?.offsetWidth ?? 0,
  arrowHeight = arrowElement?.offsetHeight ?? 0,
  strategy = type === 'tooltip' ? 'absolute' : 'fixed',
  sizeApply,
  platform,
  transform = true,
} = {}) {
  if (!reference || !floating) throw new TypeError('Codex CU floating position requires reference and floating DOM inputs');
  if (!['menu', 'popover', 'tooltip'].includes(type)) throw new TypeError(`Unknown Codex CU floating source profile: ${type}`);
  const tooltip = type === 'tooltip';
  const placement = side + (align === 'center' || align == null ? '' : '-' + align);
  const padding = typeof collisionPadding === 'number'
    ? collisionPadding
    : { top: 0, right: 0, bottom: 0, left: 0, ...collisionPadding };
  const boundary = Array.isArray(collisionBoundary) ? collisionBoundary : [collisionBoundary];
  const hasBoundary = boundary.length > 0;
  const collision = tooltip
    ? { padding }
    : { padding, boundary: boundary.filter(jAe), altBoundary: hasBoundary };
  let availableWidth, availableHeight, referenceRect, floatingRect;
  const applySize = async state => {
    availableWidth = state.availableWidth;
    availableHeight = state.availableHeight;
    referenceRect = state.rects.reference;
    floatingRect = state.rects.floating;
    const style = state.elements.floating.style;
    if (tooltip) {
      style.setProperty('--radix-tooltip-trigger-width', `${Math.max(0, referenceRect.width)}px`);
      style.setProperty('--radix-tooltip-content-available-width', `${Math.max(0, availableWidth) / availableSizeScale}px`);
      style.setProperty('--radix-tooltip-content-available-height', `${Math.max(0, availableHeight) / availableSizeScale}px`);
    } else {
      style.setProperty('--radix-popper-available-width', `${availableWidth}px`);
      style.setProperty('--radix-popper-available-height', `${availableHeight}px`);
      style.setProperty('--radix-popper-anchor-width', `${referenceRect.width}px`);
      style.setProperty('--radix-popper-anchor-height', `${referenceRect.height}px`);
    }
    await sizeApply?.(state);
  };
  const middleware = tooltip ? [
    pke({ mainAxis: (sideOffset ?? 2) * offsetScale, crossAxis: (alignOffset ?? 0) * offsetScale }),
    uke({ padding, flipAlignment, crossAxis: flipAlignment, fallbackAxisSideDirection: tooltipVariant === 'rich' ? 'end' : 'none' }),
    mke({ padding }),
    gke({ padding, apply: applySize }),
    tooltipVariant === 'coachmark' && arrowElement && lke({ element: arrowElement, padding: arrowPadding }),
  ] : [
    pke({ mainAxis: sideOffset + arrowHeight, alignmentAxis: alignOffset }),
    avoidCollisions && mke({ mainAxis: true, crossAxis: false, limiter: sticky === 'partial' ? hke() : undefined, ...collision }),
    avoidCollisions && uke(collision),
    gke({ ...collision, apply: applySize }),
    arrowElement && lke({ element: arrowElement, padding: arrowPadding }),
    qAe({ arrowWidth, arrowHeight }),
    hideWhenDetached && dke({ strategy: 'referenceHidden', ...collision, boundary: hasBoundary ? collision.boundary : undefined }),
  ];
  const result = await fAe(reference, floating, { placement, strategy, middleware, ...(platform && { platform }) });
  const [resolvedSide, resolvedAlign] = Jv(result.placement);
  const transformOrigin = result.middlewareData.transformOrigin;
  return {
    ...result,
    side: resolvedSide,
    align: resolvedAlign,
    availableWidth,
    availableHeight,
    referenceRect,
    floatingRect,
    transformOrigin: transformOrigin ? `${transformOrigin.x} ${transformOrigin.y}` : undefined,
    floatingStyles: getCodexCuFloatingStyles(result, floating, transform),
  };
}
