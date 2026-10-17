// REA native browser menu: vendor/rea/78ffc19681d7605d0b48c8cbfdc185211a58d218c4512647de567519dd5ca3bc-main-39FdJ_vp.js; SHA-256 78ffc19681d7605d0b48c8cbfdc185211a58d218c4512647de567519dd5ca3bc.
import * as _ from 'electron';
const r={uo:{WEB:`web`},vo:{QUICK:`quick`,BATCH:`batch`}};
const Ge=lL;
const lz=`browserSidebar.contextMenu.inspect`;
const uz=`browserSidebar.contextMenu.back`;
const dz=`browserSidebar.contextMenu.forward`;
const fz=`browserSidebar.contextMenu.reload`;
const pz=`browserSidebar.contextMenu.openLinkInNewTab`;
const mz=`browserSidebar.contextMenu.openLinkInNewWindow`;
const hz=`browserSidebar.contextMenu.openExternalBrowser`;
const gz=`browserSidebar.contextMenu.copyLink`;
const _z=`browserSidebar.contextMenu.commentWithCodex`;
const vz=`browserSidebar.contextMenu.quickAnnotate`;
const yz=`browserSidebar.contextMenu.attachImage`;
function Wq(e){return!e.formControlType.endsWith(`password`)&&e.selectionText.trim().length>0}
function Hq(e){return e.tabType===r.uo.WEB&&e.commentModeDisabledReason==null}
function Bke(e){return e.isEditable}
function Vke(e){return!e.isEditable&&e.formControlType===`none`&&e.mediaType===`none`&&e.linkURL.length===0&&e.srcURL.length===0&&e.selectionText.length===0}
function XR(e){return e.mediaType===`image`&&e.hasImageContents&&e.linkURL.length===0&&e.srcURL.length>0}
function lL(e){try{let t=new URL(e);return t.protocol===`http:`||t.protocol===`https:`}catch{return!1}}
export function browserContextMenu({canAttachImage:e,canReload:t,isAnnotationModeEnabled:n=!0,isDefaultBrowser:i,snapshot:a,params:o,webContents:s,window:c,onBack:u,onAttachImage:d,onComment:f,onForward:p,onInspect:m,onOpenInBrowser:h,onOpenExternal:g,onReload:v,intl:y,canOpenWindow=false}){let b=[];n&&a!=null&&Hq(a)&&b.push({label:y.formatMessage({messageId:vz,defaultMessage:`Quick annotate`}),click:()=>{s.isDestroyed()||f({x:o.x,y:o.y},r.vo.QUICK,Wq(o))}},{label:y.formatMessage({messageId:_z,defaultMessage:`Annotate`}),click:()=>{s.isDestroyed()||f({x:o.x,y:o.y},r.vo.BATCH,Wq(o))}},{type:`separator`}),e&&XR(o)&&b.push({label:y.formatMessage({messageId:yz,defaultMessage:`Attach image to chat`}),click:()=>{s.isDestroyed()||d(o.srcURL)}},{type:`separator`});let x=[];x.length>0&&b.push(...x,{type:`separator`});let S=o.linkURL.length>0;if(S){let e=b.length,t=lL(o.linkURL);t&&b.push({label:y.formatMessage({messageId:pz,defaultMessage:`Open in new tab`}),click:()=>{h(o.linkURL)}},...canOpenWindow?[{label:y.formatMessage({messageId:mz,defaultMessage:`Open in new window`}),click:()=>{h(o.linkURL,`new-window`)}}]:[]),(!i||!t)&&Ge(o.linkURL)&&b.push({label:y.formatMessage({messageId:hz,defaultMessage:`Open in external browser`}),click:()=>{g(o.linkURL)}}),b.length>e&&b.push({type:`separator`})}let C=Bke(o),w=Wq(o);(S||C||w)&&(S&&b.push({label:y.formatMessage({messageId:gz,defaultMessage:`Copy link address`}),click:()=>{_.clipboard.writeText(o.linkURL)}}),C&&b.push({role:`cut`,enabled:o.editFlags.canCut}),(C||w)&&b.push({role:`copy`,enabled:o.editFlags.canCopy}),C&&b.push({role:`paste`,enabled:o.editFlags.canPaste}),b.push({type:`separator`})),Vke(o)&&b.push({label:y.formatMessage({messageId:uz,defaultMessage:`Back`}),enabled:s.canGoBack(),click:()=>{s.isDestroyed()||u()}},{label:y.formatMessage({messageId:dz,defaultMessage:`Forward`}),enabled:s.canGoForward(),click:()=>{s.isDestroyed()||p()}},{label:y.formatMessage({messageId:fz,defaultMessage:`Reload`}),enabled:t,click:()=>{s.isDestroyed()||v()}},{type:`separator`}),b.push({label:y.formatMessage({messageId:lz,defaultMessage:`Inspect`}),click:()=>{s.isDestroyed()||m({x:o.x,y:o.y})}});return b}
