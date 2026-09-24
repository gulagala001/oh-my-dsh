const $ = id => document.getElementById(id);
let pending = Promise.resolve(), queued = 0;
function update(action = 'status', tabId) {
  // Polls may coalesce; user actions must wait their turn instead of vanishing.
  if (action === 'status' && queued) return pending;
  queued++;
  pending = pending.then(async () => {
  try {
    const state = await chrome.runtime.sendMessage({action,tabId});
    $('status').textContent = state.connected ? '已连接 Oh My DSH' : state.connecting ? '正在连接 Oh My DSH…' : '未连接';
    $('error').hidden = !state.error; $('error').textContent = state.error ?? '';
    $('details').hidden = !state.detail; $('detail').textContent = state.detail ?? '';
    $('connect').hidden = state.connected || state.connecting; $('disconnect').hidden = !state.connected && !state.connecting;
    $('empty').hidden = !!state.controls?.length; $('tabs').replaceChildren();
    for (const tab of state.controls ?? []) {
      const row = document.createElement('div'); row.className = 'tab';
      const title = document.createElement('span'); title.textContent = tab.title || tab.url; title.title = tab.url;
      const stop = document.createElement('button'); stop.textContent = tab.stopping ? '正在停止' : tab.stopError ? '重试停止' : '停止'; stop.disabled = tab.stopping;
      stop.onclick = () => update('stop', Number(tab.id)); row.append(title, stop); $('tabs').append(row);
    }
  } catch (error) { $('error').hidden = false; $('error').textContent = error.message; }
  finally { queued--; }
  });
  return pending;
}
$('connect').onclick = () => update('connect'); $('disconnect').onclick = () => update('disconnect');
void update(); setInterval(() => update(), 800);
