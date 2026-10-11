import React, { useEffect, useRef } from 'react';
import './codex-assistant-cursor.css';

// Exact Browser Use display from Codex 26.1007.21159 build 20052.
// Sources and byte/UTF-16 ranges: work/rea-reconstruction/cursor/source-manifest.json.
// This module accepts display state only. It sends no host messages or input actions.
export const CODEX_BROWSER_CURSOR_ASSET = "data:image/png;base64,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";

/**
 * Browser Use cursor in viewport CSS pixels. The host controls activity/WebMCP
 * visibility; Hc in tab-content uses active && (cursor != null || !hasWebMcpTools).
 * scale matches app-shared uBi's cursor-overlay host scale. Default is 1.
 * onArrived is optional presentation feedback; callers own any host integration.
 */
export function CodexBrowserAssistantCursor({
  conversationId, cursor, viewportSize, isVisible = true, scale = 1,
  glowColor = 'var(--app-color-accent-blue)', turnKey, onArrived,
}) {
  const element = useRef(null);
  const display = useRef(null);
  const latestArrival = useRef(onArrived);
  const sessionConversationId = useRef(null);
  latestArrival.current = onArrived;
  const hasViewport = viewportSize != null;

  useEffect(() => {
    if (!element.current) return;
    const controller = createCodexBrowserCursorDisplay(element.current, {
      assetUrl: CODEX_BROWSER_CURSOR_ASSET,
      glowColor,
      onArrived: sequence => latestArrival.current?.(sequence, sessionConversationId.current),
    });
    display.current = controller;
    return () => {
      display.current = null;
      controller.destroy();
    };
  }, [conversationId, glowColor, hasViewport]);

  useEffect(() => {
    if (!viewportSize) return;
    sessionConversationId.current = cursor?.sessionConversationId;
    display.current?.setState({
      cursor, isVisible, viewportSize,
      turnKey: turnKey ?? (String(conversationId ?? '') + ':' + (cursor?.sessionConversationId ?? '') + ':' + (isVisible ? 'active' : 'inactive')),
    });
  }, [conversationId, cursor, isVisible, viewportSize, turnKey, glowColor]);

  if (!viewportSize) return null;
  return <div aria-hidden="true" data-codex-cu-cursor-branch="browser"
    data-testid="browser-agent-cursor-overlay" className="codex-cu-browser-cursor-overlay"
    style={{ width: viewportSize.width, height: viewportSize.height,
      transform: scale === 1 ? '' : 'scale(' + scale + ')',
      willChange: scale === 1 ? '' : 'transform' }} ref={element}/>;
}

/** Branches must be selected explicitly; native and cloud have independent renderers. */
export function CodexAssistantCursor({ branch, ...props }) {
  if (branch === 'browser') return <CodexBrowserAssistantCursor {...props}/>;
  return null;
}

export function createCodexBrowserCursorDisplay(element, options) {
  return c(element, options);
}

// Original cursor-chat functions retain their identifiers for exact source review.
// t/n/i/a/o/s are the original imports from app-shared, resolved below.
function c(e,{assetUrl:n,dataTestId:r=`browser-agent-cursor`,glowColor:i,onArrived:a}){let o=l(e,n,r,i),s=null,c=F(),f=null,p=null,m=null,h=null,g=null,_=null,v=!1,y=!1,x=()=>{m!=null&&p!=null&&g!==p&&(g=p,a?.(m))},S=()=>{s!=null||f==null||y||(s=pe(e=>{s=null;let t=f;if(t==null)return;let n=v?G:Math.max(G,(e-c)/1e3);v=!1,c=e;let r=ee(t,n,e);b(o,t),r&&x(),te(t)&&S()}))};return{destroy:()=>{y=!0,s!=null&&(me(s),s=null),o.layer.remove()},setState:e=>{let n=e.turnKey??``,r=e.cursor!=null,i=ne({cursorX:e.cursor?.x,cursorY:e.cursor?.y,viewportHeight:e.viewportSize.height,viewportWidth:e.viewportSize.width}),a=e.isVisible!==!1&&e.cursor?.visible!==!1,s=e.cursor?.animateMovement!==!1,c=a&&!r;if(m=e.cursor?.moveSequence??null,p=m==null?null:`${n}:${m}`,f??=u(i,a),f.visibilitySpring.target=+!!a,c&&h!==n&&(h=n,A(f.visibilitySpring,1),f.thinkStartedAt=F()),!r){T(f,i),b(o,f),S();return}let l=e.cursor?.moveSequence!=null&&a&&f.visibilitySpring.value<=.001&&_!==n;f.thinkStartedAt=null;let ee=t(f.point,i);if(!s||l||ee<.5){l&&(_=n,A(f.visibilitySpring,1)),T(f,i),s||(f.stretchSpring.force=0,f.stretchSpring.value=1,f.stretchSpring.velocity=0),b(o,f),x(),S();return}d(f,i,e.viewportSize),v=!0,b(o,f),S()}}}

function l(e,t,n,r){let i=document.createElement(`div`);i.setAttribute(`aria-hidden`,`true`),i.style.inset=`0`,i.style.overflow=`hidden`,i.style.pointerEvents=`none`,i.style.position=`absolute`,i.style.zIndex=`20`;let a=document.createElement(`div`);a.dataset.testid=n,a.style.height=`${I}px`,a.style.left=`0`,a.style.position=`absolute`,a.style.top=`0`,a.style.transformOrigin=`${L}px ${L}px`,a.style.willChange=`transform`,a.style.width=`${I}px`;let o=document.createElement(`div`);o.style.transform=`translate3d(${B}px, ${V}px, 0)`;let s=document.createElement(`img`);return s.alt=``,s.dataset.browserAgentCursorAsset=``,s.dataset.testid=`${n}-asset`,s.draggable=!1,s.height=z,s.src=t,s.style.display=`block`,s.style.setProperty(U,r),s.style.filter=W,s.style.transform=`rotate(${H}deg) scale(1)`,s.style.transformOrigin=`0 0`,s.width=R,o.appendChild(s),a.appendChild(o),i.appendChild(a),e.appendChild(i),{cursor:a,layer:i}}

function u(e,t){let n=+!!t,r=N(-44);return{motion:null,point:e,positionXSpring:k(e.x,e.x,X),positionYSpring:k(e.y,e.y,X),rotation:r,rotationSpring:k(r,r,Z),scootAxisRotation:0,scootAxisSpring:k(0,0,Z),scootRotationSpring:k(0,0,je),scootStretchSpring:k(1,1,Me),stretchSpring:k(1,1,Oe),thinkStartedAt:null,visibilitySpring:k(n,n,ke)}}

function d(e,r,a){e.thinkStartedAt=null;let o={x:e.point.x,y:e.point.y};if(t(o,r)<=we){f(e,o,r);return}let s=n({bounds:a,end:r,start:o}),c=i(s);C(e,oe(c.response),c.dampingFraction),e.motion={mode:`bezier`,path:s,progressSpring:k(0,1,c)}}

function f(e,t,n){let r=p(t,n);C(e,X.response,X.dampingFraction),e.positionXSpring.target=n.x,e.positionYSpring.target=n.y,D(e.rotationSpring,N(-44)),D(e.scootAxisSpring,r.axisRotation),e.motion={axisRotation:r.axisRotation,end:n,mode:`scoot`,progressSpring:k(0,1,Ae),rotationTarget:r.rotationTarget,start:t}}

function p(e,t){let n=ue({x:t.x-e.x,y:t.y-e.y});return{axisRotation:m(n),rotationTarget:h(n)}}

function m(e){return t({x:0,y:0},e)<.001?0:Math.atan2(e.y,e.x)*(180/Math.PI)}

function h(e){return a(e.x*.75+-e.y*.62,-1,1)*Te}

function ee(e,t,n){let r=g(e,t,n);return j(e.visibilitySpring,t),j(e.stretchSpring,t),j(e.scootStretchSpring,t),j(e.scootRotationSpring,t),r}

function g(e,t,n){if(e.motion==null)return e.stretchSpring.target=1,e.scootStretchSpring.target=1,e.scootRotationSpring.target=0,!1;let r=Math.max(0,t);return e.thinkStartedAt=null,e.motion.mode===`scoot`?v(e,r,n):_(e,r,n)}

function _(e,t,n){let r=e.motion;if(r?.mode!==`bezier`)return!1;e.scootStretchSpring.target=1,e.scootRotationSpring.target=0,j(r.progressSpring,t);let i=a(r.progressSpring.value,0,1),c=s(r.path,i),l=o(c.tangent);e.positionXSpring.target=c.point.x,e.positionYSpring.target=c.point.y,D(e.rotationSpring,l),D(e.scootAxisSpring,0);let u=se(e,t);if(e.stretchSpring.target=ie(u.speed),i>=.999&&Math.abs(r.progressSpring.velocity)<.01&&ce(e,c.point)){let t=s(r.path,1),i=o(t.tangent);return w(e,t.point),A(e.rotationSpring,i),e.rotation=i,A(e.scootAxisSpring,0),e.scootAxisRotation=0,A(e.stretchSpring,1),e.motion=null,e.thinkStartedAt=n,!0}return!1}

function v(e,t,n){let r=e.motion;if(r?.mode!==`scoot`)return!1;j(r.progressSpring,t),e.positionXSpring.target=r.end.x,e.positionYSpring.target=r.end.y,D(e.scootAxisSpring,r.axisRotation),D(e.rotationSpring,N(-44));let i=le(se(e,t).point,r.start,r.end),a=Math.sin(Math.min(1,i)*Math.PI);return e.stretchSpring.target=1,e.scootStretchSpring.target=ae(i),e.scootRotationSpring.target=r.rotationTarget*a,i>=.999&&Math.abs(r.progressSpring.velocity)<.01&&ce(e,r.end)?(w(e,r.end),A(e.rotationSpring,N(-44)),e.rotation=e.rotationSpring.value,E(e),A(e.stretchSpring,1),e.motion=null,e.thinkStartedAt=n,!0):!1}

function te(e){return e.motion!=null||e.thinkStartedAt!=null||!y(e.positionXSpring)||!y(e.positionYSpring)||!y(e.rotationSpring)||!y(e.scootAxisSpring)||!y(e.scootRotationSpring)||!y(e.scootStretchSpring)||!y(e.stretchSpring)||!y(e.visibilitySpring)}

function y(e){return e.value===e.target&&fe(e)}

function b(e,t){let n=re(t,F());x(e.cursor,{point:t.point,rotation:n,scootAxisRotation:t.scootAxisRotation,scootRotation:t.scootRotationSpring.value,scootStretch:t.scootStretchSpring.value,stretch:t.stretchSpring.value,visibility:t.visibilitySpring.value})}

function x(e,t){let n=S(t);e.style.transform=n.transform,e.style.opacity=`${n.opacity}`,e.style.filter=n.filter}

function S({point:e,rotation:t,scootAxisRotation:n,scootRotation:r,scootStretch:i,stretch:o,visibility:s}){let c=a(s,0,1),l=M(ge,1,c),u=M(he,0,c),d=a(i,q,1),f=[`translate3d(${P(e.x-L)}px, ${P(e.y-L)}px, 0)`];return(Math.abs(O(0,n))>.001||Math.abs(d-1)>.001)&&f.push(`rotate(${P(n)}deg)`,`scale(1, ${P(d)})`,`rotate(${P(-n)}deg)`),f.push(`rotate(${P(N(t+r))}deg)`,`scale(${P(o*l)}, ${P(l)})`),{filter:`blur(${P(u)}px)`,opacity:P(c),transform:f.join(` `)}}

function ne({cursorX:e,cursorY:t,viewportHeight:n,viewportWidth:r}){return{x:a(e??Math.round(r*xe),0,r),y:a(t??Math.round(n*Se),0,n)}}

function re(e,t){if(e.thinkStartedAt==null)return e.rotation;let n=(t-e.thinkStartedAt)/1e3-_e;if(n<0)return e.rotation;let r=Math.min(1,n/ve),i=Math.sin(r*Math.PI),a=Math.sin(n/ye*Math.PI*2)*i;return r>=1?(e.thinkStartedAt=null,e.rotation):e.rotation+a*be}

function ie(e){return a(1-e/5500,.65,1)}

function ae(e){let t=Math.sin(a(e,0,1)*Math.PI);return M(1,M(1,q,t),Ee)}

function oe(e){return a(e*.18,.035,.12)}

function C(e,t,n){e.positionXSpring.response=t,e.positionYSpring.response=t,e.positionXSpring.dampingFraction=n,e.positionYSpring.dampingFraction=n}

function se(e,n){let r=e.point;j(e.positionXSpring,n),j(e.positionYSpring,n),j(e.rotationSpring,n),j(e.scootAxisSpring,n);let i={x:e.positionXSpring.value,y:e.positionYSpring.value},a=t(r,i)/Math.max(n,1/240);return e.point=i,e.rotation=e.rotationSpring.value,e.scootAxisRotation=e.scootAxisSpring.value,{point:i,speed:a}}

function ce(e,n){return t(e.point,n)<=Ce&&Math.abs(e.positionXSpring.velocity)<=K&&Math.abs(e.positionYSpring.velocity)<=K}

function w(e,t){e.point=t,A(e.positionXSpring,t.x),A(e.positionYSpring,t.y)}

function T(e,t){e.motion=null,w(e,t),A(e.rotationSpring,N(-44)),e.rotation=e.rotationSpring.value,E(e),A(e.stretchSpring,1)}

function E(e){A(e.scootAxisSpring,0),A(e.scootRotationSpring,0),A(e.scootStretchSpring,1),e.scootAxisRotation=0}

function le(e,t,n){let r={x:n.x-t.x,y:n.y-t.y},i=r.x*r.x+r.y*r.y;if(i<.001)return 1;let o=((e.x-t.x)*r.x+(e.y-t.y)*r.y)/i;return a(o,0,1)}

function D(e,t){e.target=e.value+O(e.value,t)}

function O(e,t){let n=t-e;for(;n>180;)n-=360;for(;n<-180;)n+=360;return n}

function ue(e){let t=Math.sqrt(e.x*e.x+e.y*e.y);return t<.001?{x:1,y:0}:{x:e.x/t,y:e.y/t}}

function k(e,t,n){return{dampingFraction:n.dampingFraction,force:0,response:n.response,simulationTime:0,scriptTime:0,target:t,value:e,velocity:0}}

function A(e,t){e.force=0,e.simulationTime=0,e.scriptTime=0,e.target=t,e.value=t,e.velocity=0}

function j(e,t){let n=Math.max(.001,e.response),r=1/(2*J**2),i=Math.min((Math.PI*2)**2/n**2,r),a=Math.sqrt(i)*2*e.dampingFraction;for(e.scriptTime+=Math.max(0,t),e.scriptTime-e.simulationTime>De&&(e.simulationTime=e.scriptTime-G);e.simulationTime<e.scriptTime;)de(e,i,a),e.simulationTime+=J;fe(e)&&(e.value=e.target)}

function de(e,t,n){let r=J/2,i=e.velocity+e.force*r;e.value+=i*J,e.force=i*-n+(e.target-e.value)*t,e.velocity=i+e.force*r}

function fe(e){if(Math.max(e.velocity*e.velocity,e.force*e.force)>Y*Y)return!1;let t=e.target*.01,n=e.target-e.value;return t===0||n*n<=t*t}

function M(e,t,n){return e+(t-e)*n}

function N(e){let t=e%360;return t<0?t+360:t}

function P(e){return Math.round(e*1e3)/1e3}

function F(){return typeof performance>`u`?Date.now():performance.now()}

function pe(e){return typeof window<`u`&&window.requestAnimationFrame!=null?window.requestAnimationFrame(e):typeof window<`u`?window.setTimeout(()=>e(F()),G*1e3):(e(F()),0)}

function me(e){if(typeof window<`u`&&window.cancelAnimationFrame!=null){window.cancelAnimationFrame(e);return}typeof window<`u`&&window.clearTimeout(e)}

// Original app-shared path geometry and timing.
function JAn({bounds:e,end:t,start:n}){return rjn(QAn({bounds:e,config:Sjn,end:t,start:n}),e,Sjn)}

function YAn(e,t){let n=XY(t,0,1),r=n===1?e.segments.length-1:n*e.segments.length,i=Math.floor(r),a=e.segments[i];if(a==null)throw Error(`Cursor motion path has no segment for progress`);let o=e.segments[i-1],s=i===0?e.start:o?.end;if(s==null)throw Error(`Cursor motion path segment is missing its start point`);let c=n===1?1:r-i;return{point:ujn(s,a,c),tangent:fjn(s,a,c)}}

function XAn(e){if(YY({x:0,y:0},e)<.001)return _jn(-44);let t=mjn(e);return _jn(Math.atan2(t.y,t.x)*(180/Math.PI)+90)}

function YY(e,t){let n=t.x-e.x,r=t.y-e.y;return Math.sqrt(n*n+r*r)}

function ZAn(e){return{dampingFraction:vjn,response:sjn(e)}}

function XY(e,t,n){return Math.max(t,Math.min(n,e))}

function QAn({bounds:e,config:t,end:n,start:r}){let i=ljn(t.clickAngleDegrees),a=YY(r,n),o={x:n.x-r.x,y:n.y-r.y},s=mjn(o),c=Math.max(48,Math.min(640,a*t.startHandle,a*.9)),l=Math.max(48,Math.min(640,a*t.endpointHandle,a*.9)),u={x:-i.x,y:-i.y},d=cjn(e,r,i,c),f=cjn(e,n,u,l),p={x:-s.y,y:s.x},m=p.x*i.x+p.y*i.y>=0?1:-1,h={x:p.x*m,y:p.y*m},g=pjn(r,n),_=cjn(e,r,i,c*.65),v=cjn(e,n,u,l*.65),y=mjn(o),b=Math.max(50,Math.min(520,a*t.arcSize)),x=Math.max(38,Math.min(440,a*t.arcFlow)),S=[.55,.8,1.05],C=[.65,1,1.35],w=[tjn(r,n,d,f),tjn(r,n,_,v)];for(let e of S)for(let t of C)$An({arcDistanceBase:b,arcDistanceScale:e,arcHandleDistanceBase:x,arcHandleScale:t,arcTangent:y,candidates:w,end:n,endControl:f,midpoint:g,naturalArcNormal:h,start:r,startControl:d,startControlDistance:c,clickTangent:i});return w.slice(0,t.candidateCount)}

function $An({arcDistanceBase:e,arcDistanceScale:t,arcHandleDistanceBase:n,arcHandleScale:r,arcTangent:i,candidates:a,clickTangent:o,end:s,endControl:c,midpoint:l,naturalArcNormal:u,start:d,startControl:f,startControlDistance:p}){ejn({arcDistanceBase:e,arcDistanceScale:t,arcHandleDistanceBase:n,arcHandleScale:r,arcNormal:u,arcTangent:i,candidates:a,clickTangent:o,end:s,endControl:c,midpoint:l,start:d,startControl:f,startControlDistance:p}),ejn({arcDistanceBase:e,arcDistanceScale:t,arcHandleDistanceBase:n,arcHandleScale:r,arcNormal:{x:-u.x,y:-u.y},arcTangent:i,candidates:a,clickTangent:o,end:s,endControl:c,midpoint:l,start:d,startControl:f,startControlDistance:p})}

function ejn({arcDistanceBase:e,arcDistanceScale:t,arcHandleDistanceBase:n,arcHandleScale:r,arcNormal:i,arcTangent:a,candidates:o,clickTangent:s,end:c,endControl:l,midpoint:u,start:d,startControl:f,startControlDistance:p}){let m=e*t,h=n*r,g={x:u.x+i.x*m+s.x*p*.16,y:u.y+i.y*m+s.y*p*.16},_={x:g.x-a.x*h,y:g.y-a.y*h},v={x:g.x+a.x*h,y:g.y+a.y*h};o.push(njn({arc:g,arcIn:_,arcOut:v,end:c,endControl:l,start:d,startControl:f}))}

function tjn(e,t,n,r){return{arc:null,arcIn:null,arcOut:null,end:t,endControl:r,segments:[{control1:n,control2:r,end:t}],start:e,startControl:n}}

function njn({arc:e,arcIn:t,arcOut:n,end:r,endControl:i,start:a,startControl:o}){return{arc:e,arcIn:t,arcOut:n,end:r,endControl:i,segments:[{control1:o,control2:t,end:e},{control1:n,control2:i,end:r}],start:a,startControl:o}}

function rjn(e,t,n){let r=e[0];if(r==null)throw Error(`Cursor motion requires at least one candidate`);let i=r,a=1/0,o=r,s=1/0;for(let r of e){let e=ijn(r,t,n),c=ajn(r,e);c<s&&(o=r,s=c),e.staysInBounds&&c<a&&(i=r,a=c)}return a===1/0?o:i}

function ijn(e,t,n){let r=0,i=0,a=0,o=0,s=null,c=t==null||n==null||hjn(e.start,t,n.boundsMargin),l=e.start,u=e.start;for(let d of e.segments){for(let e=1;e<=24;e+=1){let f=e/24,p=djn(l,d.control1,d.control2,d.end,f);r+=YY(u,p),t!=null&&n!=null&&(c&&=hjn(p,t,n.boundsMargin));let m={x:p.x-u.x,y:p.y-u.y};if(YY({x:0,y:0},m)>.01){let e=Math.atan2(m.y,m.x);if(s!=null){let t=gjn(s,e);i+=t*t,a=Math.max(a,Math.abs(t)),o+=Math.abs(t)}s=e}u=p}l=d.end}return{angleChangeEnergy:i,length:r,maxAngleChange:a,staysInBounds:c,totalTurn:o}}

function ajn(e,t){let n=Math.max(1,YY(e.start,e.end)),r=Math.max(0,t.length/n-1),i=e.arc==null?0:45,a=ojn(e);return t.length+r*320+t.angleChangeEnergy*140+t.maxAngleChange*180+t.totalTurn*18+a*90+i}

function ojn(e){let t=ljn(-44),n=mjn({x:e.end.x-e.start.x,y:e.end.y-e.start.y});return XY((-(n.x*t.x+n.y*t.y)-.08)/.92,0,1)}

function sjn(e){let t=ijn(e),n=Math.max(1,YY(e.start,e.end)),r=Math.max(0,t.length/n-1),i=XY((t.length-180)/760,0,1),a=XY(r/.55,0,1),o=XY(t.totalTurn/(Math.PI*1.4),0,1),s=XY(t.angleChangeEnergy/1.25,0,1),c=XY(a*.42+o*.38+s*.2,0,1),l=ojn(e),u=e.arc==null?0:.04,d=l*.28,f=e.arc==null?1:.9;return XY((.42+i*.22+c*.12+d+u)*xjn*f,bjn,yjn)}

function cjn(e,t,n,r){let i=r;return n.x<0&&(i=Math.min(i,t.x/-n.x)),n.x>0&&(i=Math.min(i,(e.width-t.x)/n.x)),n.y<0&&(i=Math.min(i,t.y/-n.y)),n.y>0&&(i=Math.min(i,(e.height-t.y)/n.y)),{x:t.x+n.x*Math.max(0,i),y:t.y+n.y*Math.max(0,i)}}

function ljn(e){let t=Math.PI/180*e;return{x:Math.sin(t),y:-Math.cos(t)}}

function ujn(e,t,n){return djn(e,t.control1,t.control2,t.end,n)}

function djn(e,t,n,r,i){let a=1-i,o=a*a*a,s=3*a*a*i,c=3*a*i*i,l=i*i*i;return{x:e.x*o+t.x*s+n.x*c+r.x*l,y:e.y*o+t.y*s+n.y*c+r.y*l}}

function fjn(e,t,n){let r=1-n;return{x:3*r*r*(t.control1.x-e.x)+6*r*n*(t.control2.x-t.control1.x)+3*n*n*(t.end.x-t.control2.x),y:3*r*r*(t.control1.y-e.y)+6*r*n*(t.control2.y-t.control1.y)+3*n*n*(t.end.y-t.control2.y)}}

function pjn(e,t){return{x:(e.x+t.x)/2,y:(e.y+t.y)/2}}

function mjn(e){let t=Math.sqrt(e.x*e.x+e.y*e.y);return t<.001?{x:1,y:0}:{x:e.x/t,y:e.y/t}}

function hjn(e,t,n){return e.x>=n&&e.x<=t.width-n&&e.y>=n&&e.y<=t.height-n}

function gjn(e,t){let n=t-e;for(;n>Math.PI;)n-=Math.PI*2;for(;n<-Math.PI;)n+=Math.PI*2;return n}

function _jn(e){let t=e%360;return t<0?t+360:t}

// cursor-chat Q initializer (only the original lazy module initializer is removed).
const I=24,L=I/2,R=23,z=24,B=12,V=-2.5,H=44;
const U='--browser-agent-cursor-glow-color';
const W='drop-shadow(0 0 6px color-mix(in srgb, var('+U+') 90%, transparent)) drop-shadow(0 0 15px color-mix(in srgb, var('+U+') 48%, transparent))';
const he=5,ge=.4,_e=0,ve=1.41,ye=.66,be=12.5,xe=.58,Se=.55,G=1/60,Ce=.85,K=12,we=196,Te=70,Ee=.15,q=0,J=1/240,De=1,Y=.06;
const Oe={dampingFraction:.85,response:.2},ke={dampingFraction:.86,response:.42},Ae={dampingFraction:.94,response:.19},X={dampingFraction:.9,response:.19},Z={dampingFraction:.9,response:.12},je={dampingFraction:.82,response:.055},Me={dampingFraction:.86,response:.12};
// app-shared Cjn initializer, motion path imports used by cursor-chat.
const vjn=.9,yjn=2.2,bjn=.12,xjn=.7;
const Sjn={arcFlow:.5783555327868779,arcSize:.2765523188064277,boundsMargin:20,candidateCount:20,clickAngleDegrees:-44,endpointHandle:.15,startHandle:.41960295031576633};
const t=YY,n=JAn,i=ZAn,a=XY,o=XAn,s=YAn;

// Annotation selection pointer: exact browser-page-preload _b/Mx display.
// This is the user's annotation pointer; cursor-chat above is the agent pointer.
// Caller applies Mx's selection/drag visibility gate, without adding input handlers.
export function CodexBrowserSelectionPointer({
  point, mode = 'comment', zoomFactor = 1, scale = 1, isVisible = true,
}) {
  if (!isVisible || !point || !['add', 'comment', 'text'].includes(mode)) return null;
  const add = mode === 'add';
  const style = {
    height: 26 * scale, width: 26 * scale,
    left: point.x * zoomFactor - (add ? 13 : 0) * scale,
    top: point.y * zoomFactor - (add ? 13 : 26) * scale,
  };
  return <svg aria-hidden="true" pointerEvents="none"
    data-browser-comment-annotation-selection-cursor="true"
    data-browser-comment-annotation-selection-cursor-mode={mode}
    data-browser-comment-native-text-selection={mode === 'text' || undefined}
    className={'codex-cu-browser-selection-pointer annotation-selection-cursor ' +
      (add ? 'annotation-selection-modifier-cursor' : 'annotation-selection-comment-cursor')}
    height="26" width="26" viewBox={add ? '0 0 20 20' : '0 0 26 26'} style={style}>
    {add ? <path d="M9.33496 16.5V10.665H3.5C3.13273 10.665 2.83496 10.3673 2.83496 10C2.83496 9.63273 3.13273 9.33496 3.5 9.33496H9.33496V3.5C9.33496 3.13273 9.63273 2.83496 10 2.83496C10.3673 2.83496 10.665 3.13273 10.665 3.5V9.33496H16.5L16.6338 9.34863C16.9369 9.41057 17.165 9.67857 17.165 10C17.165 10.3214 16.9369 10.5894 16.6338 10.6514L16.5 10.665H10.665V16.5C10.665 16.8673 10.3673 17.165 10 17.165C9.63273 17.165 9.33496 16.8673 9.33496 16.5Z" fill="currentColor"/> : <>
      <g className="annotation-selection-cursor-beam annotation-selection-modifier-cursor" transform="translate(-7 12.5)">
        <path d="M3 5H5C5.81 5 6.54 5.35 7 5.91C7.46 5.35 8.19 5 9 5H11V6.5H9C8.31 6.5 7.75 7.06 7.75 7.75V19.25C7.75 19.94 8.31 20.5 9 20.5H11V22H9C8.19 22 7.46 21.65 7 21.09C6.54 21.65 5.81 22 5 22H3V20.5H5C5.69 20.5 6.25 19.94 6.25 19.25V7.75C6.25 7.06 5.69 6.5 5 6.5H3Z" fill="currentColor"/>
      </g>
      <path className="annotation-selection-cursor-bubble" d="M13 0.825a12.175 12.175 0 0 1 0 24.35H3a2.175 2.175 0 0 1-2.175-2.175V13A12.175 12.175 0 0 1 13 0.825Z" fill="#339cff" stroke="white" strokeWidth="1.65"/>
    </>}
  </svg>;
}

// Exact vb/v_/x_ display only. rect is already the source-resolved viewport rect;
// frame/scroll/selection resolution belongs to the existing annotation controller.
export function CodexBrowserSelectionOutline({
  rect, kind = 'element', zoomFactor = 1, borderRadius,
  linkedHover = false, removeHover = false, googleDocs = false,
  controlEditing = false, isVisible = true,
}) {
  if (!isVisible || !rect) return null;
  const kinds = {
    element: 'hover-box', region: 'hover-box region-box',
    text: 'text-selection-highlight', flexItem: 'flex-item-overlay',
    postedRegion: 'posted-region-highlight',
  };
  if (!kinds[kind]) return null;
  const className = ['codex-cu-browser-selection-outline', kinds[kind],
    linkedHover && 'annotation-selection-target-hover',
    removeHover && 'annotation-selection-remove-hover',
    googleDocs && 'google-docs-annotation-box',
    googleDocs && kind === 'element' && 'google-docs-element-box'].filter(Boolean).join(' ');
  return <div aria-hidden="true" className={className}
    data-codex-control-editing={controlEditing || undefined}
    style={{ borderRadius, left: rect.x * zoomFactor, top: rect.y * zoomFactor,
      width: rect.width * zoomFactor, height: rect.height * zoomFactor }}/>
}
