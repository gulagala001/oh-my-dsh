// OpenCU's extension-owned gesture adapter, not Codex's original approval UI.
const requestId = new URL(location.href).searchParams.get('request');
const title = document.getElementById('title'), description = document.getElementById('description');
const status = document.getElementById('status'), confirm = document.getElementById('confirm');
const permissionLabels = {
  history: '读取和管理当前浏览器 profile 的全部访问历史',
  downloads: '读取和管理当前浏览器 profile 的下载历史及活动下载',
  'downloads.open': '通过浏览器打开下载的文件',
  contentSettings: '读取和修改当前浏览器的网站内容设置',
  browsingData: '按明确选择的数据类型清理当前浏览器的数据',
};
let request;
const send = async message => {
  const result = await chrome.runtime.sendMessage({ ...message, requestId });
  if (!result || result.error) throw new Error(result?.error || '浏览器连接已结束');
  return result;
};
document.getElementById('close').addEventListener('click', () => window.close());
confirm.addEventListener('click', () => {
  if (!request || confirm.disabled || !navigator.userActivation.isActive) return;
  confirm.disabled = true; status.textContent = '';
  // These APIs must run directly in the real click, before any asynchronous work.
  let operation;
  try {
    operation = request.kind === 'permissions'
      ? chrome.permissions.request({ permissions: request.permissions })
      : chrome.downloads.open(request.nativeId);
  } catch (cause) { operation = Promise.reject(cause); }
  void Promise.resolve(operation).then(async granted => {
    const result = await send({ action: 'profile-request-complete', ok: request.kind === 'open-download' || granted === true });
    status.textContent = result.status === 'granted' ? '权限已授予。' : result.status === 'completed' ? '浏览器已打开文件。' : '权限未授予。';
  }, async cause => {
    await send({ action: 'profile-request-complete', ok: false, error: cause.message });
    status.textContent = cause.message;
  }).catch(cause => { status.textContent = cause.message; });
});
void (async () => {
  if (!requestId || !/^[a-z0-9-]{36}$/i.test(requestId)) throw new Error('无效的浏览器请求');
  request = await send({ action: 'profile-request-info' });
  if (!['permissions', 'open-download'].includes(request.kind) || request.expiresAt < Date.now()) throw new Error('此请求已结束或过期');
  document.getElementById('identity').textContent = '浏览器 profile: ' + request.profile.extensionInstanceId;
  if (request.kind === 'permissions') {
    title.textContent = '允许访问此浏览器 profile';
    description.textContent = '这些权限作用于当前浏览器的完整 profile，包含已有的数据。Chrome 将显示此扩展的权限请求。';
    const list = document.getElementById('permissions');
    for (const permission of request.permissions) {
      if (!Object.hasOwn(permissionLabels, permission)) throw new Error('未知浏览器权限');
      const item = document.createElement('li'); item.textContent = permissionLabels[permission]; list.append(item);
    }
    confirm.textContent = '请求所列权限';
  } else {
    title.textContent = '打开下载文件'; description.textContent = request.filename;
    confirm.textContent = '通过浏览器打开';
  }
  confirm.disabled = false;
  setTimeout(() => { confirm.disabled = true; status.textContent = '此请求已过期。'; }, Math.max(0, request.expiresAt - Date.now()));
})().catch(cause => { description.textContent = cause.message; confirm.disabled = true; });
