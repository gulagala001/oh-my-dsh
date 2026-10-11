import {contextBridge} from 'electron';
import {installAnnotationSurfaceRegistry} from '../../src/computer-use/annotation-surface-registry.mjs';
import {installAnnotationSiteAPI,installAnnotationSiteControlsReceiver} from '../../src/computer-use/annotation-site-api.mjs';

const nonce=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,'0')).join('');
const token=nonce(),registrationToken=nonce();
const projection=installAnnotationSiteControlsReceiver({token,registrationToken,role:'projection'});
contextBridge.executeInMainWorld({func:installAnnotationSiteControlsReceiver,args:[{token:registrationToken,role:'registration'}]});
contextBridge.executeInMainWorld({func:installAnnotationSurfaceRegistry});
contextBridge.executeInMainWorld({func:installAnnotationSiteAPI,args:[{toggle:force=>projection.requestModeToggle(force),isActive:()=>projection.isHostAnnotationActive(),recordFeature:(feature,accepted)=>projection.recordSiteUse(feature,accepted)}]});
