export type CDPSend = (method: string, params?: object) => Promise<any>;
export function hitTestViewport(send:CDPSend,point:{x:number;y:number}):Promise<{backendNodeId:number;frameId?:string}>;
export interface FrameRoute { send: CDPSend; frameId: string; sessionId: string; sessionFrameId: string; contextId: number; documentId: string; owners: {parent: FrameRoute;backendNodeId:number;frameId:string;childSessionId?:string}[] }
export interface FrameElement { backendNodeId: number; route?: FrameRoute; observationId?: string }
export interface CDPFrameRouter {main():Promise<FrameRoute>;child(parent:FrameRoute,node:number,frameId:string):Promise<FrameRoute>;validate(route:FrameRoute):Promise<void>;remoteElement(route:FrameRoute,node:number):Promise<string>;point(entry:FrameElement & {route:FrameRoute}):Promise<{x:number;y:number}>;checkPoint(entry:FrameElement & {route:FrameRoute},point:{x:number;y:number}):Promise<void>;focus(entry:FrameElement & {route:FrameRoute}):Promise<void>;close():Promise<void>}
export function createCDPFrameRouter(send:CDPSend,subscribe:(listener:(method:string,params:any)=>void)=>(()=>void)):CDPFrameRouter;
export function withCDPFrameGuard(router:CDPFrameRouter,wrapSend?:(send:CDPSend)=>CDPSend,guard?:<T>(work:()=>Promise<T>)=>Promise<T>):CDPFrameRouter & {route(route:FrameRoute):FrameRoute;original(route:FrameRoute):FrameRoute};
