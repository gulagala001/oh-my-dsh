const form = document.querySelector('#connection'), status = document.querySelector('#status');
const connect = document.querySelector('#connect'), disconnect = document.querySelector('#disconnect');
const forget = document.querySelector('#forget'), decline = document.querySelector('#decline'), hosts = document.querySelector('#host');
const setup = document.querySelector('#setup'), diagnostic = document.querySelector('#diagnostic');
let current, busy = false, revision = 0, localError, readError;
async function call(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw Object.assign(new Error(response?.error?.message || '扩展没有返回连接状态'), response?.error);
  return response.result;
}
function show(state = current) {
  current = state;
  const connected = state?.connected === true, releaseError = state?.releaseError;
  const error = releaseError || localError || readError;
  setup.hidden = connected;
  disconnect.hidden = !connected && !releaseError;
  disconnect.textContent = releaseError ? '重试断开' : '断开连接';
  forget.hidden = !state?.paired;
  for (const button of [disconnect, forget, decline]) button.disabled = busy || !!readError;
  connect.disabled = !state || busy || connected || !!releaseError || !!readError || !state.hosts?.length;
  const selected = hosts.value;
  hosts.replaceChildren(...(state?.hosts || []).map(host => {
    const option = document.createElement('option'); option.value = host.hostId; option.textContent = host.hostName + ' · ' + host.hostId.slice(0, 8); return option;
  }));
  if ([...hosts.options].some(option => option.value === selected)) hosts.value = selected;
  hosts.hidden = document.querySelector('#host-label').hidden = hosts.options.length < 2;
  status.classList.toggle('error', !!error);
  status.classList.toggle('connected', connected && !error);
  status.textContent = error ? (releaseError ? '控制释放尚未完成，请重试断开。' : error.message)
    : connected ? '已连接 · 配对已保存，重启后自动恢复'
    : busy ? '连接中…' : state?.hosts?.length ? '本机 DSH 请求连接 · 点击一次即可允许并记住' : '等待本机 DSH · 请保持 DSH 打开，无需复制连接信息';
  diagnostic.textContent = error ? `${error.code || 'ERROR'}: ${error.message || ''}` : state?.endpoint || '';
  if (state?.extensionId) document.querySelector('#identity').textContent = `扩展 ID：${state.extensionId}`;
}
async function run(message) {
  if (busy) return;
  busy = true; revision++; localError = null; show();
  try { readError = null; show(await call(message)); }
  catch (error) { localError = error; }
  finally { busy = false; show(); }
}
form.addEventListener('submit', event => { event.preventDefault(); if (!connect.disabled) void run({type: 'allow', hostId: hosts.value}); });
disconnect.addEventListener('click', () => {void run({type: 'disconnect'});});
forget.addEventListener('click', () => {void run({type: 'forget'});});
decline.addEventListener('click', async () => {
  await run({type: 'decline'});
  if (!localError) window.close();
});
try {
  if (!chrome.debugger || !chrome.downloads || !chrome.webNavigation) throw new Error('请在外部 Chrome / Edge 中打开此扩展；DSH 内置浏览器无需连接扩展。');
  const refresh = async () => {
    if (busy) return;
    const expected = revision;
    try { const state = await call({type: 'status'}); if (expected === revision && !busy) {readError = null; show(state);} }
    catch (error) {if (expected === revision && !busy) {readError = error; show();}}
  };
  await refresh(); setInterval(refresh, 1500);
} catch (error) {readError = error; show();}
