const $ = id => document.getElementById(id);
const tabRows = new Map();
function renderTabs(controls) {
  const retained = new Set();
  controls.forEach((tab, index) => {
    const id = Number(tab.id); retained.add(id);
    let row = tabRows.get(id);
    if (!row) {
      row = document.createElement('div'); row.className = 'tab';
      const title = document.createElement('span'), stop = document.createElement('button'), error = document.createElement('small');
      stop.type = 'button'; error.className = 'tab-error'; error.setAttribute('role', 'alert');
      stop.onclick = () => update('stop', id); row.append(title, stop, error); tabRows.set(id, row);
    }
    const [title, stop, error] = row.children;
    title.textContent = tab.title || tab.url; title.title = tab.url;
    stop.textContent = tab.stopping ? '正在停止' : tab.stopError ? '重试停止' : '停止'; stop.disabled = tab.stopping;
    stop.title = (tab.stopping ? '正在停止：' : '停止操作：') + (tab.title || tab.url);
    error.hidden = !tab.stopError; error.textContent = tab.stopError || '';
    // Polling must preserve a button held between pointerdown and pointerup.
    if ($('tabs').children[index] !== row) $('tabs').insertBefore(row, $('tabs').children[index] ?? null);
  });
  for (const [id, row] of tabRows) if (!retained.has(id)) { row.remove(); tabRows.delete(id); }
}
let pending = Promise.resolve(), queued = 0;
function update(action = 'status', tabId) {
  // Polls may coalesce; user actions must wait their turn instead of vanishing.
  if (action === 'status' && queued) return pending;
  queued++;
  pending = pending.then(async () => {
  try {
    const state = await chrome.runtime.sendMessage({action,tabId});
    document.body.dataset.connection = state.connected ? 'connected' : state.connecting ? 'connecting' : 'disconnected';
    $('status').textContent = state.connected ? '已连接 Oh My DSH' : state.connecting ? '正在连接 Oh My DSH…' : '未连接';
    $('error').hidden = !state.error; $('error').textContent = state.error ?? '';
    $('details').hidden = !state.detail; $('detail').textContent = state.detail ?? '';
    $('connect').hidden = state.connected || state.connecting; $('disconnect').hidden = !state.connected && !state.connecting;
    $('empty').hidden = !!state.controls?.length; renderTabs(state.controls ?? []);
  } catch (error) {
    document.body.dataset.connection = 'unknown'; $('status').textContent = '连接状态暂不可用';
    $('error').hidden = false; $('error').textContent = error.message;
    $('connect').hidden = false;
    for (const row of tabRows.values()) row.children[1].disabled = true;
  }
  finally { queued--; }
  });
  return pending;
}
$('connect').onclick = () => update('connect'); $('disconnect').onclick = () => update('disconnect');
void update(); setInterval(() => update(), 800);
