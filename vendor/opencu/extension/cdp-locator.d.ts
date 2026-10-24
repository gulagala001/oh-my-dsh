import type {CDPSend,CDPFrameRouter,FrameRoute} from './frame-router.js';
export const domLocatorSource:string;
export function locatorError(value:any):any;
export function runCDPLocator(send:CDPSend,request:Record<string,unknown>,register:(node:number,route:FrameRoute)=>string|number,router?:CDPFrameRouter):Promise<{value?:any;elementId?:string|number;checked?:boolean;keyboardEditable?:boolean}>;
