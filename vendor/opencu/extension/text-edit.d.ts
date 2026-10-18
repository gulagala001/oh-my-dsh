import type {CDPSend} from './frame-router.js';
export function validateTextEditRequest(operation:string,args:Record<string,any>):void;
export function textEditDOM(this:any,request:any,phase:string,plan:any):any;
export function runTextEdit(send:CDPSend,operation:string,args:Record<string,any>,options?:{backendNodeId?:number;contextId?:number;validate?:()=>void|Promise<void>;beforeFocus?:()=>void|Promise<void>;onFocus?:()=>void;insertText?:(text:string,verify:()=>Promise<any>)=>Promise<any>}):Promise<Record<string,any>>;
