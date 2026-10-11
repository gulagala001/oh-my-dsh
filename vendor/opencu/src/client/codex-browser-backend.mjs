const failure = (message, code) => Object.assign(new Error(message), { code });
const sitePreviewSequences = new Map();

const passwordFileCounts = ['discovered','skippedInvalid','added','updated','unchanged','failed','remaining'];
const passwordFileTerminals = new Set(['completed','partial-success','failed','canceled']);
const passwordFileErrorMessages = {
  READ_ONLY_VIEW:'当前预览只读，无法导入密码。',
  CONTROL_CHANGED:'浏览器控制状态已改变，请重新打开导入。',
  STALE_BROWSER_PROFILE:'浏览器连接已改变，请重新打开导入。',
  STALE_TARGET:'当前浏览器已改变，请重新打开导入。',
  INVALID_PASSWORD_FILE_IMPORT_RESPONSE:'浏览器未确认密码文件操作结果，请重新打开导入。',
  BROWSER_PROFILE_UNAVAILABLE:'当前浏览器无法进行密码文件导入。',
  PASSWORD_STORE_UNAVAILABLE:'密码存储尚未就绪，请重新打开导入。',
  PASSWORD_STORAGE_UNAVAILABLE:'密码存储尚未就绪，请重新打开导入。',
  PASSWORD_STORE_ENCRYPTION_UNAVAILABLE:'系统加密服务不可用，无法保存导入的密码。',
};

export function codexPasswordFileError(value) {
  return Object.hasOwn(passwordFileErrorMessages,value?.code) ? passwordFileErrorMessages[value.code] : '密码文件操作未完成，请重试。';
}

// Password contents and arbitrary server messages never become UI state.
export function codexPasswordFileImportMetadata(value, kind, selectionId) {
  const invalid = () => { throw failure('浏览器未确认密码文件操作结果。','INVALID_PASSWORD_FILE_IMPORT_RESPONSE'); };
  const counts = keys => {
    if (!keys.every(key => Number.isSafeInteger(value?.[key]) && value[key] >= 0)) invalid();
    return Object.fromEntries(keys.map(key => [key,value[key]]));
  };
  if (kind === 'signals') {
    if (typeof value?.available !== 'boolean' || typeof value?.persistentReady !== 'boolean') invalid();
    if (value.available && value.persistentReady && (value.format !== 'csv'
      || !Number.isSafeInteger(value.maxFileBytes) || value.maxFileBytes <= 0
      || !Number.isSafeInteger(value.maxRecords) || value.maxRecords <= 0)) invalid();
    return { available:value.available,persistentReady:value.persistentReady,format:value.format === 'csv' ? 'csv' : undefined,
      maxFileBytes:Number.isSafeInteger(value.maxFileBytes)&&value.maxFileBytes>0?value.maxFileBytes:undefined,
      maxRecords:Number.isSafeInteger(value.maxRecords)&&value.maxRecords>0?value.maxRecords:undefined,
      error:value.error ? { message:codexPasswordFileError(value.error) } : undefined };
  }
  if (kind === 'selection') {
    if (value?.status === 'canceled' && value.canceled === true) return { status:'canceled',canceled:true };
    if (value?.status !== 'selected' || typeof value.selectionId !== 'string' || !value.selectionId
      || typeof value.fileName !== 'string') invalid();
    const fileName = value.fileName.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').slice(0,160);
    if (!fileName) invalid();
    return { status:'selected',selectionId:value.selectionId,fileName,...counts(['discovered','valid','skippedInvalid']) };
  }
  if (!passwordFileTerminals.has(value?.status) || value.selectionId !== selectionId
    || typeof value.canceled !== 'boolean' || typeof value.transactionStarted !== 'boolean'
    || value.canceled !== (value.status === 'canceled')) invalid();
  return { status:value.status,selectionId,...counts(passwordFileCounts),canceled:value.canceled,transactionStarted:value.transactionStarted,
    error:value.error ? { message:codexPasswordFileError(value.error) } : undefined };
}

function wait(delay, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, delay);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal.reason); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

// Scope is frozen per request so a late profile response cannot target another tab.
export function createCodexBrowserBackend(api, sessionId, scope) {
  let browserEpoch;
  const call = async (action, input = {}, signal) => {
    if (!sessionId || !scope?.browserId || !scope?.tabId) throw failure('请先连接浏览器标签页', 'BROWSER_PROFILE_UNAVAILABLE');
    const envelope = await api('browser-native', sessionId, { ...scope, ...(browserEpoch === undefined ? {} : { browserEpoch }), ...input, action }, signal);
    if (envelope?.browserId !== scope.browserId || !Object.hasOwn(envelope ?? {}, 'result')) throw failure('浏览器连接已改变，请重新打开面板', 'STALE_BROWSER_PROFILE');
    if (browserEpoch !== undefined && envelope.browserEpoch !== browserEpoch) throw failure('浏览器连接已改变，请重新打开面板', 'STALE_BROWSER_PROFILE');
    browserEpoch = envelope.browserEpoch;
    return envelope.result;
  };
  const awaitAuthorization = async (authorization, signal) => {
    if (!authorization?.requestId) throw failure('浏览器没有返回有效授权请求', 'INVALID_BROWSER_PROFILE_RESPONSE');
    const deadline = Math.min(authorization.expiresAt ?? Date.now() + 600000, Date.now() + 600000);
    let completed = false;
    try { while (Date.now() < deadline) {
      await wait(1000, signal);
      const result = await call('profileGetRequest', { requestId: authorization.requestId }, signal);
      if (result.status === 'granted' || result.status === 'completed') {
        if (result.result?.granted === false || result.result?.ok === false) throw failure(result.result?.message ?? '浏览器操作未获授权', 'BROWSER_PROFILE_PERMISSION_DENIED');
        completed = true; return result;
      }
      if (['denied', 'failed', 'canceled'].includes(result.status)) { completed = true; throw failure(result.result?.message ?? '浏览器操作未获授权', 'BROWSER_PROFILE_PERMISSION_DENIED'); }
      if (result.status !== 'pending') throw failure('浏览器授权请求已失效', 'STALE_BROWSER_PROFILE_REQUEST');
    }
    throw failure('浏览器授权请求已过期', 'STALE_BROWSER_PROFILE_REQUEST');
    } finally { if (!completed) void call('profileCancelRequest', { requestId: authorization.requestId, explicitUserCommand: true }).catch(() => {}); }
  };
  const requestAccess = async (permissions, signal) => {
    const result = await call('profileRequestAccess', { permissions, explicitUserCommand: true }, signal);
    if (result.status === 'pending_user_gesture') await awaitAuthorization(result, signal);
    else if (result.status !== 'granted') throw failure('浏览器未授予访问权限', 'BROWSER_PROFILE_PERMISSION_DENIED');
    return call('profileStatus', {}, signal);
  };
  const downloadAction = async (downloadAction, input = {}, signal) => {
    const result = await call('profileDownloadAction', { downloadAction, ...input, ...(downloadAction === 'acknowledge' ? {} : { explicitUserCommand: true }) }, signal);
    if (result?.authorization?.status === 'pending_user_gesture') {
      const completion = await awaitAuthorization(result.authorization, signal);
      return completion.result;
    }
    return result;
  };
  const readSiteAnnotationFeatures = async signal => {
    const result = await call('siteAnnotationFeatures', {}, signal);
    if (result?.available === true && (typeof result.siteUrl !== 'string' || !Array.isArray(result.siteAnnotationFeatures)
      || result.siteAnnotationFeatures.some(feature => typeof feature !== 'string') || typeof result.siteAnnotationFeaturesEnabled !== 'boolean'
      || result.documentIdentity?.tabId !== scope.tabId || typeof result.documentIdentity.loaderId !== 'string' || typeof result.documentIdentity.documentId !== 'string')) {
      throw failure('网页批注功能没有返回有效状态', 'INVALID_SITE_ANNOTATION_FEATURES');
    }
    if (typeof result?.available !== 'boolean') throw failure('网页批注功能没有返回有效状态', 'INVALID_SITE_ANNOTATION_FEATURES');
    return result;
  };
  const setSiteAnnotationFeaturesEnabled = (enabled, site, signal) => call('siteAnnotationFeaturesSetEnabled', { enabled, siteUrl: site.siteUrl, documentIdentity: site.documentIdentity }, signal);
  const previewSiteAnnotationFeatures = (preview, site, signal) => {
    const key = JSON.stringify([sessionId, scope?.browserId, scope?.tabId, scope?.actor]), requestSequence = (sitePreviewSequences.get(key) ?? 0) + 1;sitePreviewSequences.set(key, requestSequence);
    return call('siteAnnotationFeaturePreview', { preview, siteUrl: site.siteUrl, documentIdentity: site.documentIdentity, requestSequence }, signal);
  };
  return Object.freeze({ call, requestAccess, downloadAction, readSiteAnnotationFeatures, setSiteAnnotationFeaturesEnabled, previewSiteAnnotationFeatures });
}

export function codexBrowserScope(target, frame, state) {
  const currentFrame = frame && target?.id && frame.tabId === target.id ? frame : undefined;
  return { browserId: target?.browserId, tabId: target?.id, actor: currentFrame?.actor, controlEpoch: state?.controlEpoch,
    siteUrl: target?.url, loaderId: currentFrame?.loaderId, siteAnnotationRevision: currentFrame?.siteAnnotationRevision };
}

export function codexCanRequestProfileAccess(status, permission) {
  return status?.accessRequests?.available === true && status.accessRequests.optionalPermissions?.includes(permission) === true;
}

export function codexProfileDownloadActions(backend, status, refresh, signal, onError) {
  if (!status?.downloads?.available) return {};
  const supported = new Set(status.downloads.actions ?? []);
  const run = async (name, input) => {
    const result = await backend.downloadAction(name, input, signal);
    if (result?.ok === false) throw failure(result.message ?? '浏览器下载操作失败', result.reason);
    await refresh?.();
    return result;
  };
  const copy = async value => {
    try {
      if (typeof value !== 'string' || typeof navigator.clipboard?.writeText !== 'function') throw failure('当前环境无法写入剪贴板', 'CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(value); return { ok: true };
    } catch (error) { onError?.(error.message); return { ok: false }; }
  };
  const actions = {
    acknowledge: ids => run('acknowledge', { ids }),
    pause: item => run('pause', { id: item.id }), resume: item => run('resume', { id: item.id }),
    cancel: item => run('cancel', { id: item.id }), remove: item => run('removeFromHistory', { id: item.id }),
    showInFolder: item => run('showInFolder', { id: item.id }), showDownloadsFolder: () => run('showDownloadsFolder'),
    open: async item => {
      if (status.permissions?.['downloads.open'] !== true) {
        if (!codexCanRequestProfileAccess(status, 'downloads.open')) throw failure('当前浏览器未提供打开下载文件的权限', 'BROWSER_PROFILE_UNAVAILABLE');
        await backend.requestAccess(['downloads', 'downloads.open'], signal);
      }
      return run('open', { id: item.id });
    },
    copyAddress: item => copy(item.url), copyPath: item => copy(item.path),
  };
  return Object.fromEntries(Object.entries(actions).filter(([name]) => ['copyAddress', 'copyPath'].includes(name) || supported.has(name === 'remove' ? 'removeFromHistory' : name)));
}
