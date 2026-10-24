/** Pure upload validation shared by the CDP, extension and Electron adapters. */
const failure = (code, message) => Object.assign(new Error(message), {code, details:{inputDispatched:false}});
export function filePaths(value, {allowString = false} = {}) {
  const files = allowString && typeof value === 'string' ? [value] : value;
  if (!Array.isArray(files) || files.some(file => typeof file !== 'string' || !file.length || file.includes('\0') || !/^(?:\/|[A-Za-z]:[\\/]|\\\\)/u.test(file)))
    throw failure('INVALID_ARGUMENT', 'Upload requires absolute file paths; use [] to clear the input');
  return [...files];
}
/** Run in the selected element's realm; never changes the input or dispatches events. */
export function fileInputState(count) {
  const error = (code,message) => ({__opencuFileError:{code,message}});
  if (!this.isConnected) return error('STALE_ELEMENT','The file input is no longer connected; observe again');
  if (this.tagName !== 'INPUT' || this.type !== 'file') return error('INVALID_ARGUMENT','The selected element must be a file input');
  if (this.matches(':disabled')) return error('ELEMENT_DISABLED','The file input is disabled');
  if (this.webkitdirectory) return error('UNSUPPORTED_UPLOAD_DIRECTORY','Directory inputs require a directory upload adapter');
  if (count > 1 && !this.multiple) return error('INVALID_ARGUMENT','This file input accepts only one file');
  return {multiple:!!this.multiple};
}
export function fileInputResult(value) {
  if (value?.__opencuFileError) throw failure(value.__opencuFileError.code,value.__opencuFileError.message);
  if (typeof value?.multiple !== 'boolean') throw failure('STALE_ELEMENT','The file input could not be verified');
  return value;
}
export async function validateFileInput(send, {backendNodeId, contextId, files}) {
  const {object} = await send('DOM.resolveNode',{backendNodeId,...(contextId === undefined ? {} : {executionContextId:contextId})});
  if (!object?.objectId) throw failure('STALE_ELEMENT','The file input is no longer available; observe again');
  try {
    const reply = await send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:fileInputState.toString(),arguments:[{value:files.length}],returnByValue:true});
    if (reply.exceptionDetails) throw failure('STALE_ELEMENT','The file input could not be verified; observe again');
    return fileInputResult(reply.result?.value);
  } finally {await send('Runtime.releaseObject',{objectId:object.objectId});}
}

// Chromium treats DOM.setFileInputFiles([]) as chooser cancellation and keeps
// existing files. Clear through the native empty-value setter, without forging
// input/change events; the receipt states that difference explicitly.
export const clearFileInputFunction = `function __opencuClearFileInput() {
  const state = (${fileInputState.toString()}).call(this,0);
  if (state.__opencuFileError) return state;
  const setter = Object.getOwnPropertyDescriptor(this.ownerDocument.defaultView.HTMLInputElement.prototype,'value').set;
  setter.call(this,'');
  return {...state,cleared:this.value === '' && this.files.length === 0,eventDelivery:'none'};
}`;
export async function writeFileInput(send,{backendNodeId,contextId,files}) {
  if (files.length) {
    try {await send('DOM.setFileInputFiles',{backendNodeId,files});}
    catch (error) {if (['CONTROL_STOPPED','ABORT_ERR'].includes(error.code) || error.name === 'AbortError') throw error;throw Object.assign(new Error('The browser could not set the selected upload files'),{code:'UPLOAD_FAILED',details:{inputDispatched:true}});}
    return {fileCount:files.length};
  }
  const {object} = await send('DOM.resolveNode',{backendNodeId,...(contextId === undefined ? {} : {executionContextId:contextId})});
  if (!object?.objectId) throw failure('STALE_ELEMENT','The file input is no longer available; observe again');
  try {
    const reply = await send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:clearFileInputFunction,returnByValue:true});
    if (reply.exceptionDetails) throw failure('UPLOAD_CLEAR_FAILED','The file input could not be cleared');
    const result = fileInputResult(reply.result?.value);
    if (!result.cleared) throw failure('UPLOAD_CLEAR_FAILED','The file input did not clear');
    return {fileCount:0,cleared:true,eventDelivery:'none'};
  } finally {await send('Runtime.releaseObject',{objectId:object.objectId});}
}
