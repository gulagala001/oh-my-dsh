export interface ScrollGeometry {width:number;height:number}
export interface ScrollRequest {elementId?:unknown;scrollPages?:unknown;scrollDirection?:unknown;deltaX?:unknown;deltaY?:unknown}
export function scrollDirection(value:unknown):number[];
export function scrollDistance(value?:unknown):{pages?:number;pixels?:number};
export function scrollDeltas(request:ScrollRequest,geometry?:ScrollGeometry):{deltaX:number;deltaY:number}|undefined;
export function readElementScrollGeometry(send:(method:string,params?:object)=>Promise<any>,entry:{backendNodeId:number;contextId?:number}):Promise<ScrollGeometry>;
export function checkScrollGeometry(expected:ScrollGeometry,current:ScrollGeometry):void;
