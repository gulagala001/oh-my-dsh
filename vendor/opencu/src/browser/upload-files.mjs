import {stat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {filePaths} from '../../extension/file-input.js';

/** Inspect only explicitly supplied files; errors never expose their local paths. */
export async function uploadFiles(value,{allowString = false,check = () => {},step = work => work()} = {}) {
  const files = filePaths(value,{allowString});
  if (files.some(file => !isAbsolute(file))) throw Object.assign(new TypeError('Upload requires absolute paths on the browser host'),{code:'INVALID_ARGUMENT',details:{inputDispatched:false}});
  // Preserve path spelling: lexical normalization can change symlink/.. semantics.
  const paths = files;
  for (let index = 0; index < paths.length; index++) {
    check();
    let info;
    try {info = await step(() => stat(paths[index]));}
    catch (error) {
      if (['CONTROL_STOPPED','ABORT_ERR'].includes(error.code) || error.name === 'AbortError') throw error;
      throw Object.assign(new Error(`Upload source ${index + 1} is unavailable or unreadable`),{code:typeof error.code === 'string' ? error.code : 'UPLOAD_SOURCE_UNAVAILABLE',details:{inputDispatched:false,sourceIndex:index}});
    }
    check();
    if (!info.isFile()) throw Object.assign(new TypeError(`Upload source ${index + 1} must be a regular file`),{code:'INVALID_ARGUMENT',details:{inputDispatched:false,sourceIndex:index}});
  }
  return paths;
}
