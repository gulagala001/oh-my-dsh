const directions = {up:[0,-1],u:[0,-1],down:[0,1],d:[0,1],left:[-1,0],l:[-1,0],right:[1,0],r:[1,0]};
const invalid = message => Object.assign(new TypeError(message), {code:'INVALID_ARGUMENT',details:{inputDispatched:false,retryable:false}});

export function scrollDirection(value) {
  if (typeof value !== 'string' || !Object.hasOwn(directions,value)) throw invalid('Unknown scroll direction');
  return directions[value];
}

export function scrollDistance(value = 1) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw invalid('Scroll distance must be a finite non-negative number');
    return {pages:value};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Reflect.ownKeys(value).length !== 1 || !Object.hasOwn(value,'pixels') || typeof value.pixels !== 'number' || !Number.isFinite(value.pixels) || value.pixels < 0)
    throw invalid('Scroll distance must be a non-negative page count or {pixels: non-negative number}');
  return {pixels:value.pixels};
}

/** Validate before moving the pointer; resolve page counts only at the live element. */
export function scrollDeltas(request, geometry) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw invalid('scroll takes wheel delta options, or an element/point, direction and optional distance');
  if (request.scrollPages !== undefined || request.scrollDirection !== undefined) {
    const vector = scrollDirection(request.scrollDirection), {pages} = scrollDistance(request.scrollPages);
    if (request.elementId == null || pages === undefined || request.deltaX !== undefined || request.deltaY !== undefined) throw invalid('Element page scrolling needs an element ID, direction and numeric page count, without pixel deltas');
    if (geometry === undefined) return;
    const dimension = vector[0] ? geometry.width : geometry.height;
    if (!(Number.isFinite(dimension) && dimension > 0)) throw Object.assign(new Error('The selected element has no visible scroll geometry; observe again'),{code:'ELEMENT_NOT_VISIBLE',details:{inputDispatched:false}});
    const pixels = dimension * pages;
    if (!Number.isFinite(pixels)) throw invalid('Scroll distance exceeds the finite pixel range');
    return {deltaX:vector[0]*pixels,deltaY:vector[1]*pixels};
  }
  const deltaX = request.deltaX ?? 0, deltaY = request.deltaY ?? 0;
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) throw invalid('Finite wheel deltas are required');
  return {deltaX,deltaY};
}

/** Read the selected node's current border bounds in its own document's CSS pixels. */
export async function readElementScrollGeometry(send, {backendNodeId, contextId}) {
  let objectId;
  try {
    ({object:{objectId}} = await send('DOM.resolveNode',{backendNodeId,...(contextId === undefined ? {} : {executionContextId:contextId})}));
    if (!objectId) throw Error('The selected element is no longer connected');
    const reply = await send('Runtime.callFunctionOn',{objectId,returnByValue:true,functionDeclaration:'function __opencuScrollGeometry() { if (!this.isConnected || typeof this.getBoundingClientRect !== "function") return null; const box = this.getBoundingClientRect(); return {width:box.width,height:box.height}; }'});
    if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
    const geometry = reply.result?.value;
    if (!geometry || !Number.isFinite(geometry.width) || !Number.isFinite(geometry.height)) throw Error('The selected element has no current box');
    return geometry;
  } catch (error) {
    if (error.code) throw error;
    throw Object.assign(new Error('The selected element has no current scroll geometry; observe again',{cause:error}),{code:'STALE_ELEMENT',details:{inputDispatched:false}});
  } finally {if(objectId)await send('Runtime.releaseObject',{objectId}).catch(()=>{});}
}

export function checkScrollGeometry(expected, current) {
  if (![expected?.width,expected?.height,current?.width,current?.height].every(value => Number.isFinite(value) && value > 0)) throw invalid('Valid element scroll geometry is required');
  if (Math.abs(expected.width-current.width) > 0.5 || Math.abs(expected.height-current.height) > 0.5)
    throw Object.assign(new Error('The selected element resized before wheel input; observe again'),{code:'LOCATOR_NOT_STABLE',details:{inputDispatched:false}});
}
