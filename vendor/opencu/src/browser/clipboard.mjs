const limit = 16 * 1024 * 1024;
const invalid = message => Object.assign(new TypeError(message), {code:'INVALID_ARGUMENT',details:{inputDispatched:false}});
const failure = (code,message,dispatched = false) => Object.assign(new Error(message),{code,details:{inputDispatched:dispatched,effectVerified:false}});
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value,allowed) => Reflect.ownKeys(value).every(key => allowed.includes(key));

/** Validate before calling any browser or granting a document clipboard access. */
export function normalizeClipboardItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 32) throw invalid('clipboard.write requires an array of 1–32 clipboard items');
  let size = 0;
  return Array.from(items).map(item => {
    if (!object(item) || !keys(item,['entries','presentationStyle']) || !Array.isArray(item.entries) || !item.entries.length || item.entries.length > 32)
      throw invalid('A clipboard item requires 1–32 entries and optional presentationStyle');
    if (item.presentationStyle !== undefined && !['unspecified','inline','attachment'].includes(item.presentationStyle)) throw invalid('presentationStyle must be unspecified, inline or attachment');
    const seen = new Set();
    const entries = Array.from(item.entries).map(entry => {
      if (!object(entry) || !keys(entry,['mimeType','text','base64']) || typeof entry.mimeType !== 'string' || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(entry.mimeType) || seen.has(entry.mimeType))
        throw invalid('Each clipboard entry requires a unique lowercase MIME type');
      seen.add(entry.mimeType);
      if ((entry.text === undefined) === (entry.base64 === undefined) || entry.text !== undefined && typeof entry.text !== 'string' || entry.base64 !== undefined && typeof entry.base64 !== 'string')
        throw invalid('A clipboard entry requires exactly one string: text or base64');
      let bytes;
      if (entry.text !== undefined) bytes = Buffer.byteLength(entry.text);
      else {
        if (entry.base64.length > Math.ceil(limit / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(entry.base64)) throw invalid('Clipboard base64 must be canonical padded base64');
        const data = Buffer.from(entry.base64,'base64');
        if (data.toString('base64') !== entry.base64) throw invalid('Clipboard base64 must be canonical padded base64');
        bytes = data.length;
      }
      size += bytes;
      if (size > limit) throw invalid('Clipboard content exceeds 16 MiB');
      return {mimeType:entry.mimeType,...(entry.text === undefined ? {base64:entry.base64} : {text:entry.text})};
    });
    return {entries,...(item.presentationStyle === undefined ? {} : {presentationStyle:item.presentationStyle})};
  });
}

export function createClipboardAPI({act,active,supported = () => false}) {
  const noArguments = (values,name) => { active(); if (values.length) throw invalid(`${name} takes no arguments`); };
  const call = async (action,args) => {
    if (!supported()) throw failure('UNSUPPORTED_CLIPBOARD','Isolated session clipboard requires an OpenCU-owned headless Chromium browser; this backend cannot access it without using the system clipboard');
    return act(action,args);
  };
  return Object.freeze({
    read: async (...args) => { noArguments(args,'clipboard.read'); return (await call('clipboardRead')).result?.value; },
    readText: async (...args) => { noArguments(args,'clipboard.readText'); return (await call('clipboardReadText')).result?.value; },
    write: async (...args) => {
      active(); if (args.length !== 1) throw invalid('clipboard.write takes one clipboard items array');
      await call('clipboardWrite',{items:normalizeClipboardItems(args[0])});
    },
    writeText: async (...args) => {
      active(); if (args.length !== 1 || typeof args[0] !== 'string') throw invalid('clipboard.writeText takes one text string');
      normalizeClipboardItems([{entries:[{mimeType:'text/plain',text:args[0]}]}]);
      await call('clipboardWriteText',{text:args[0]});
    },
  });
}

/** Retain cleanup ownership until the original context/origin is restored.
 * A page closing or crashing is not proof that browser-context permissions ended.
 * Only the backend, after its owned browser process actually closes, may pass
 * ownedProcessClosed:true. A browser-level sender can recover a closed page's debt.
 */
export function restoreClipboardPermissions(record,{send = record.clipboardPermissionSend ?? ((method,params) => record.session.send(method,params)),ownedProcessClosed = false} = {}) {
  if (ownedProcessClosed) {
    if (record.sessionClipboard !== true) throw invalid('Only a confirmed OpenCU-owned browser process may revoke clipboard cleanup ownership');
    record.clipboardPermissionProcessClosed = true;
    record.clipboardPermissionRestores?.clear();
    return Promise.resolve({restored:true});
  }
  if (record.clipboardPermissionProcessClosed || !record.clipboardPermissionRestores?.size) return Promise.resolve({restored:true});
  if (record.clipboardPermissionRestoreWork) return record.clipboardPermissionRestoreWork;
  let work;
  work = (async () => {
    const errors = [];
    for (const [key,debt] of [...record.clipboardPermissionRestores]) {
      if (record.clipboardPermissionProcessClosed) break;
      const restoring = Promise.resolve().then(() => send('Browser.setPermission',structuredClone(debt.params)));
      record.pending?.add(restoring);
      try {
        await restoring;
        if (record.clipboardPermissionRestores.get(key) === debt) record.clipboardPermissionRestores.delete(key);
      } catch (error) { errors.push(error); }
      finally { record.pending?.delete(restoring); }
    }
    if (record.clipboardPermissionRestores.size && !record.clipboardPermissionProcessClosed) throw Object.assign(
      failure('CLIPBOARD_PERMISSION_RESTORE_FAILED','The private browser clipboard permission still requires restoration'),
      {cause:new AggregateError(errors),details:{inputDispatched:false,effectVerified:false,permissionRestorePending:true,pendingPermissions:record.clipboardPermissionRestores.size}});
    return {restored:true};
  })().finally(() => { if (record.clipboardPermissionRestoreWork === work) delete record.clipboardPermissionRestoreWork; });
  record.clipboardPermissionRestoreWork = work;
  return work;
}

/** Chromium's native headless clipboard belongs to its owned browser process.
 * Never enable this route for headed, adopted, CDP-connected or Electron browsers.
 */
export async function actOnClipboard(record,request,{step,check,onWrite = () => {}}) {
  const writing = ['clipboardWrite','clipboardWriteText'].includes(request.action);
  let items;
  if (request.action === 'clipboardWrite') items = normalizeClipboardItems(request.items);
  else if (request.action === 'clipboardWriteText') {
    if (typeof request.text !== 'string') throw invalid('clipboard.writeText requires a string');
    normalizeClipboardItems([{entries:[{mimeType:'text/plain',text:request.text}]}]);
  } else if (!['clipboardRead','clipboardReadText'].includes(request.action)) throw invalid('Unknown clipboard operation');
  check();
  if (record.sessionClipboard !== true) throw failure('UNSUPPORTED_CLIPBOARD','Isolated session clipboard requires an OpenCU-owned headless Chromium browser; this backend cannot access it without using the system clipboard');
  if (record.clipboardPermissionProcessClosed) throw failure('UNSUPPORTED_CLIPBOARD','The owned browser process is closed');
  // A prior failed cleanup must not become a new, incorrectly granted baseline.
  await restoreClipboardPermissions(record);
  check();
  const generation = record.documentGeneration;
  const send = (method,params) => step(() => record.session.send(method,params));
  const {frameTree} = await send('Page.getFrameTree');
  const frame = frameTree?.frame;
  if (!frame || typeof frame.id !== 'string') throw failure('INVALID_CLIPBOARD_STATE','The browser returned no clipboard document');
  const url = frame.url + (frame.urlFragment ?? '');
  let origin;
  try { origin = new URL(url).origin; } catch {}
  if (!origin || origin === 'null') throw failure('UNSUPPORTED_CLIPBOARD','This document has no secure clipboard origin');
  const {executionContextId} = await send('Page.createIsolatedWorld',{frameId:frame.id,worldName:'opencu-session-clipboard',grantUniveralAccess:false});
  const state = await send('Runtime.evaluate',{contextId:executionContextId,returnByValue:true,awaitPromise:true,
    expression:`(async () => {
      const available = globalThis.isSecureContext && !!navigator.clipboard && typeof ClipboardItem === 'function';
      return {available,url:location.href,supported:available && ${JSON.stringify(items ?? [])}.every(item => item.entries.every(entry => ClipboardItem.supports(entry.mimeType))),
        permissions:available ? await Promise.all(['clipboard-read','clipboard-write'].map(async name => ({name,state:(await navigator.permissions.query({name})).state}))) : []};
    })()`});
  if (state.exceptionDetails) throw failure('CLIPBOARD_ACCESS_FAILED',state.exceptionDetails.exception?.description ?? state.exceptionDetails.text ?? 'Native clipboard inspection failed');
  if (state.result?.value?.url !== url || generation !== record.documentGeneration) throw failure('STALE_CLIPBOARD_DOCUMENT','The clipboard document changed before access');
  if (state.result?.value?.available !== true) throw failure('UNSUPPORTED_CLIPBOARD','This document does not expose the native secure Clipboard API');
  if (items?.length > 1) throw failure('UNSUPPORTED_CLIPBOARD_FORMAT','Chromium supports one clipboard item per write');
  if (state.result.value.supported !== true) throw failure('UNSUPPORTED_CLIPBOARD_FORMAT','This Chromium does not support one of the supplied clipboard MIME types');
  const permissions = state.result.value.permissions;
  if (!Array.isArray(permissions) || permissions.length !== 2 || new Set(permissions.map(item => item.name)).size !== 2 || permissions.some(item => !['clipboard-read','clipboard-write'].includes(item.name) || !['granted','denied','prompt'].includes(item.state)))
    throw failure('INVALID_CLIPBOARD_STATE','The browser returned invalid clipboard permissions');
  const permission = {name:writing ? 'clipboard-write' : 'clipboard-read',...(writing ? {allowWithoutGesture:true} : {allowWithoutSanitization:true})};
  const permissionArgs = {permission,origin,...(record.identity.contextId === 'default' ? {} : {browserContextId:record.identity.contextId})};
  let permissionDebt, operationError;
  try {
    // These permissions affect only the private owned browser process and origin.
    // Mark before sending: a lost acknowledgement still requires restoration.
    const key = JSON.stringify([permissionArgs.browserContextId ?? 'default',origin,permission]);
    const debts = record.clipboardPermissionRestores ??= new Map();
    permissionDebt = debts.get(key) ?? Object.freeze({params:Object.freeze({...permissionArgs,permission:Object.freeze({...permission}),
      setting:permissions.find(item => item.name === permission.name).state})});
    debts.set(key,permissionDebt);
    await send('Browser.setPermission',{...permissionArgs,setting:'granted'});
    record.focusEmulated = true;
    await send('Emulation.setFocusEmulationEnabled',{enabled:true});
    check();
    if (generation !== record.documentGeneration) throw failure('STALE_CLIPBOARD_DOCUMENT','The clipboard document changed before access');
    const operation = request.action;
    const expression = `(async () => {
      if (location.href !== ${JSON.stringify(url)}) throw new Error('STALE_CLIPBOARD_DOCUMENT: the clipboard document changed');
      const operation = ${JSON.stringify(operation)}, items = ${JSON.stringify(items ?? null)}, text = ${JSON.stringify(request.text ?? null)}, limit = ${limit};
      if (operation === 'clipboardReadText') {
        const text = await navigator.clipboard.readText();
        if (new TextEncoder().encode(text).length > limit) throw new Error('CLIPBOARD_TOO_LARGE: clipboard content exceeds 16 MiB');
        return text;
      }
      if (operation === 'clipboardWriteText') { await navigator.clipboard.writeText(text); return null; }
      if (operation === 'clipboardWrite') {
        const values = items.map(item => {
          const entries = Object.fromEntries(item.entries.map(entry => {
            if (!ClipboardItem.supports(entry.mimeType)) throw new Error('UNSUPPORTED_CLIPBOARD_FORMAT: ' + entry.mimeType);
            const data = entry.text === undefined ? Uint8Array.from(atob(entry.base64), char => char.charCodeAt(0)) : entry.text;
            return [entry.mimeType,new Blob([data],{type:entry.mimeType})];
          }));
          return new ClipboardItem(entries,{presentationStyle:item.presentationStyle ?? 'unspecified'});
        });
        await navigator.clipboard.write(values); return null;
      }
      const values = await navigator.clipboard.read(), result = []; let bytes = 0;
      for (const item of values) {
        const entries = [];
        for (const mimeType of item.types) {
          const blob = await item.getType(mimeType); bytes += blob.size;
          if (bytes > limit) throw new Error('CLIPBOARD_TOO_LARGE: clipboard content exceeds 16 MiB');
          if (mimeType.startsWith('text/')) entries.push({mimeType,text:await blob.text()});
          else {
            const data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onerror = () => reject(reader.error); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
            entries.push({mimeType,base64:data.slice(data.indexOf(',')+1)});
          }
        }
        if (entries.length) result.push({entries,presentationStyle:item.presentationStyle});
      }
      return result;
    })()`;
    // A native clipboard write may have completed even when navigation/cancellation
    // interrupts its acknowledgement. It is never automatically replayed.
    if (writing) onWrite();
    const result = await send('Runtime.evaluate',{contextId:executionContextId,expression,returnByValue:true,awaitPromise:true,userGesture:true,timeout:10000});
    if (result.exceptionDetails) {
      const message = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Native clipboard access failed';
      const code = /\b(UNSUPPORTED_CLIPBOARD_FORMAT|CLIPBOARD_TOO_LARGE|STALE_CLIPBOARD_DOCUMENT):/u.exec(message)?.[1] ?? 'CLIPBOARD_ACCESS_FAILED';
      throw failure(code,message,writing);
    }
    check();
    return {action:operation,value:result.result?.value,scope:'browser-session',...(writing ? {inputDispatched:true,effectVerified:true} : {})};
  } catch (error) { operationError = error; throw error; }
  finally {
    if (permissionDebt) {
      // Cleanup must pass cancellation; do not race it behind the aborted step.
      try { await restoreClipboardPermissions(record); }
      catch (cause) {
        throw Object.assign(failure('CLIPBOARD_PERMISSION_RESTORE_FAILED','The private browser clipboard permission could not be restored; do not replay a possibly completed write',writing),
          {cause,details:{inputDispatched:writing,effectVerified:false,permissionRestorePending:true,
            ...(operationError ? {operationError:{code:operationError.code,message:operationError.message}} : {})}});
      }
    }
  }
}
