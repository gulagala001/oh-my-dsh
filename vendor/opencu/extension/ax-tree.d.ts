import type {CDPSend, CDPFrameRouter, FrameRoute} from './frame-router.js';
export type AXValue = {value?: string | number | boolean; relatedNodes?: {text?: string; idref?: string}[]};
export type AXNode = {nodeId:string; frameId?:string; backendDOMNodeId?:number; ignored?:boolean; role?:AXValue; name?:AXValue; value?:AXValue; properties?:{name:string;value:AXValue}[]; childIds?:string[]};
export function axElementKey(backendNodeId:number,route?:FrameRoute):string;
export function captureAXTree(send:CDPSend,router?:CDPFrameRouter,check?:()=>void):Promise<{nodes:{node:AXNode;route?:FrameRoute;key:string}[];validate():Promise<void>}>;
