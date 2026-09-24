const $ = id => document.getElementById(id);
const tabRows = new Map();
function renderTabs(controls) {
  const retained = new Set();
  controls.forEach((tab, index) => {
    const id = Number(tab.id); retained.add(id);
    let row = tabRows.get(id);
    if (!row) {
      row = document.createElement('div'); row.className = 'tab';
      const title = document.createElement('span'), stop = document.createElement('button');
      stop.onclick = () => update('stop', id); row.append(title, stop); tabRows.set(id, row);
    }
    const [title, stop] = row.children;
    title.textContent = tab.title || tab.url; title.title = tab.url;
    stop.textContent = tab.stopping ? '正在停止' : tab.stopError ? '重试停止' : '停止'; stop.disabled = tab.stopping;
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
    $('status').textContent = state.connected ? '已连接 Oh My DSH' : state.connecting ? '正在连接 Oh My DSH…' : '未连接';
    $('error').hidden = !state.error; $('error').textContent = state.error ?? '';
    $('details').hidden = !state.detail; $('detail').textContent = state.detail ?? '';
    $('connect').hidden = state.connected || state.connecting; $('disconnect').hidden = !state.connected && !state.connecting;
    $('empty').hidden = !!state.controls?.length; renderTabs(state.controls ?? []);
  } catch (error) { $('error').hidden = false; $('error').textContent = error.message; }
  finally { queued--; }
  });
  return pending;
}
$('connect').onclick = () => update('connect'); $('disconnect').onclick = () => update('disconnect');
void update(); setInterval(() => update(), 800);
