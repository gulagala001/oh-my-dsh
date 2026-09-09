const $ = (s, root = document) => root.querySelector(s);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const basename = path => path?.split('/').filter(Boolean).at(-1) || '/';
const state = { settings: null, session: null, events: [], sessions: [], running: false, source: null, panel: 'context', live: { text: '', thinking: '' }, error: '', maintenance: null };
let toastTimer;
function toast(text) { $('#toast').textContent = text; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 3500); }
async function api(path, data) {
  const response = await fetch(`/api${path}`, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
function inline(parent, text) {
  const pattern = /(`[^`\n]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    parent.append(document.createTextNode(text.slice(end, match.index)));
    const s = match[0];
    if (s.startsWith('`')) parent.append(el('code', '', s.slice(1, -1)));
    else if (s.startsWith('**')) parent.append(el('strong', '', s.slice(2, -2)));
    else {
      const parts = s.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (/^https?:\/\//i.test(parts[2])) { const a = el('a', '', parts[1]); a.href = parts[2]; a.target = '_blank'; a.rel = 'noreferrer'; parent.append(a); }
      else parent.append(document.createTextNode(parts[1]));
    }
    end = match.index + s.length;
  }
  parent.append(document.createTextNode(text.slice(end)));
}
function markdown(text) {
  const root = el('div', 'prose'), lines = text.split('\n');
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const block = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) block.push(lines[i++]);
      i++;
      const pre = el('pre'), code = el('code', '', block.join('\n'));
      const copy = el('button', 'copy-code', '复制'); copy.type = 'button'; copy.onclick = () => navigator.clipboard.writeText(code.textContent).then(() => toast('已复制')).catch(() => toast('复制失败'));
      pre.append(code, copy); root.append(pre); continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { const h = el(`h${Math.min(4, heading[1].length + 1)}`); inline(h, heading[2]); root.append(h); i++; continue; }
    if (/^\s*[-*_]{3,}\s*$/.test(line)) { root.append(el('hr')); i++; continue; }
    if (line.includes('|') && /^\s*\|?\s*:?-+/.test(lines[i + 1] || '')) {
      const table = el('table');
      const cells = value => value.replace(/^\s*\||\|\s*$/g, '').split('|').map(x => x.trim());
      const header = el('tr'); cells(line).forEach(x => { const th = el('th'); inline(th, x); header.append(th); }); table.append(header); i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { const tr = el('tr'); cells(lines[i++]).forEach(x => { const td = el('td'); inline(td, x); tr.append(td); }); table.append(tr); }
      const wrap = el('div', 'table-scroll'); wrap.append(table); root.append(wrap); continue;
    }
    if (/^\s*([-*+]\s+|\d+\.\s+)/.test(line)) {
      const ordered = /^\s*\d+\./.test(line), list = el(ordered ? 'ol' : 'ul');
      while (i < lines.length && /^\s*([-*+]\s+|\d+\.\s+)/.test(lines[i])) { const li = el('li'); inline(li, lines[i++].replace(/^\s*([-*+]\s+|\d+\.\s+)/, '')); list.append(li); }
      root.append(list); continue;
    }
    if (/^>\s?/.test(line)) { const quote = el('blockquote'); inline(quote, line.replace(/^>\s?/, '')); root.append(quote); i++; continue; }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(\s*```|#{1,6}\s|>\s|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])) {
      if (lines[i].includes('|') && /^\s*\|?\s*:?-+/.test(lines[i + 1] || '')) break;
      paragraph.push(lines[i++]);
    }
    const p = el('p'); inline(p, paragraph.join('\n')); root.append(p);
  }
  return root;
}
const labels = { read: '读取文件', write: '写入文件', edit: '编辑文件', bash: '终端', web_fetch: '读取网页', tasks: '任务清单', note: '工作笔记', recall: '回忆' };
function toolCard(call, result) {
  const running = state.live.tool?.id === call.id;
  const card = el('details', `tool-card${result?.isError ? ' failed' : ''}`); card.dataset.tool = call.id; card.dataset.view = `tool:${call.id}`;
  const summary = el('summary');
  summary.append(el('span', 'tool-name', labels[call.name] || call.name), el('span', 'tool-preview', call.arguments.command || call.arguments.file_path || call.arguments.url || call.arguments.query || ''), el('span', 'tool-state', result ? (result.isError ? '失败' : '完成') : running ? '执行中' : '待执行'));
  const args = el('pre', '', JSON.stringify(call.arguments, null, 2));
  const output = el('pre', '', result ? result.content.map(x => x.text || '').join('\n') : running ? (state.live.toolOutput || '执行中…') : '');
  card.append(summary, args, output); return card;
}
function assistant(message, partial = false) {
  const block = el('article', 'message assistant');
  const label = el('div', 'assistant-label'); label.append(el('span', 'tiny-x', 'x'), el('span', '', 'trisoul_x')); block.append(label);
  const content = message.content;
  const thinking = content.filter(b => b.type === 'thinking').map(b => b.thinking).join('\n');
  if (thinking) { const details = el('details', 'thinking'); details.dataset.view = `thinking:${message.timestamp ?? 'live'}`; details.append(el('summary', '', partial ? '思考中…' : '思考过程'), el('div', 'thinking-text', thinking)); block.append(details); }
  for (const part of content) {
    if (part.type === 'text' && part.text) { const prose = markdown(part.text); if (partial) prose.classList.add('stream-cursor'); block.append(prose); }
    if (part.type === 'toolCall') {
      const result = state.events.find(e => e.type === 'message' && e.message.role === 'toolResult' && e.message.toolCallId === part.id)?.message;
      block.append(toolCard(part, result));
    }
  }
  return block;
}
function renderConversation() {
  const scroll = $('#scroll-area');
  const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120;
  const expanded = new Set([...$('#messages').querySelectorAll('details[open][data-view]')].map(e => e.dataset.view));
  const root = $('#messages'); root.replaceChildren();
  const messages = state.events.filter(e => e.type === 'message' && e.message.role !== 'toolResult');
  $('#welcome').hidden = messages.length > 0;
  for (const event of messages) {
    const m = event.message;
    if (m.role === 'user') { const row = el('article', 'message user'); row.append(el('div', 'user-text', typeof m.content === 'string' ? m.content : m.content.filter(x => x.type === 'text').map(x => x.text).join('\n'))); root.append(row); }
    if (m.role === 'assistant') root.append(assistant(m));
  }
  if (state.live.text || state.live.thinking) { const live = assistant({ content: [{ type: 'text', text: state.live.text }, { type: 'thinking', thinking: state.live.thinking }] }, state.running); live.id = 'live-message'; root.append(live); }
  if (state.error) root.append(el('div', 'error-message', state.error));
  root.querySelectorAll('details[data-view]').forEach(e => e.open = expanded.has(e.dataset.view));
  if (nearBottom) scroll.scrollTop = scroll.scrollHeight;
  renderHeader();
}
let renderQueued = false, historyDirty = false;
function renderLive() {
  const scroll = $('#scroll-area'), nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120;
  const old = $('#live-message'), thinkingOpen = Boolean(old?.querySelector('details[open]'));
  old?.remove();
  if (state.live.text || state.live.thinking) {
    const live = assistant({ content: [{ type: 'text', text: state.live.text }, { type: 'thinking', thinking: state.live.thinking }] }, state.running);
    live.id = 'live-message'; if (thinkingOpen && live.querySelector('details')) live.querySelector('details').open = true;
    $('#messages').append(live);
  }
  if (state.live.tool) {
    const card = [...$('#messages').querySelectorAll('[data-tool]')].find(e => e.dataset.tool === state.live.tool.id);
    if (card) card.lastElementChild.textContent = state.live.toolOutput || '执行中…';
  }
  if (nearBottom) scroll.scrollTop = scroll.scrollHeight;
}
function queueRender(full = true) {
  historyDirty ||= full;
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; if (historyDirty) renderConversation(); else renderLive(); historyDirty = false; });
}
function renderHeader() {
  $('#session-title').textContent = state.session?.title || '新对话';
  const cwd = state.session?.cwd || state.settings?.cwd || '';
  $('#header-cwd').textContent = basename(cwd); $('#cwd-label').textContent = basename(cwd); $('#cwd-open').title = cwd;
  $('#model-label').textContent = state.settings?.main.model || '未配置模型';
  $('#send').textContent = state.running ? '■' : '↑'; $('#send').classList.toggle('stopping', state.running); $('#send').setAttribute('aria-label', state.running ? '停止执行' : '发送消息');
  $('#message-input').disabled = state.running;
  $('#run-status').textContent = state.running ? (state.live.tool ? `${labels[state.live.tool.name] || state.live.tool.name}…` : '正在处理…') : state.error ? state.error : '';
  $('#run-status').classList.toggle('error', Boolean(state.error));
  const usage = state.events.filter(e => e.type === 'message' && e.message.usage).reduce((n, e) => n + e.message.usage.totalTokens, 0);
  $('#usage-label').textContent = usage ? `对话 ${usage.toLocaleString()} tokens` : '';
}
async function refreshList() {
  state.sessions = await api('/sessions');
  const list = $('#session-list'); list.replaceChildren();
  if (!state.sessions.length) list.append(el('div', 'empty-list', '还没有对话'));
  for (const s of state.sessions) {
    const b = el('button', `session-link${s.id === state.session?.id ? ' active' : ''}${s.running ? ' running' : ''}`, s.title); b.title = s.title; b.onclick = () => openSession(s.id); list.append(b);
  }
}
function openSession(id) {
  state.source?.close(); state.error = ''; state.events = []; state.live = { text: '', thinking: '' }; state.running = false;
  history.replaceState({}, '', id ? `/?session=${id}` : '/');
  document.body.classList.remove('menu-open');
  if (!id) { state.session = null; renderConversation(); refreshList().catch(e => toast(e.message)); renderPanel(); return; }
  const source = new EventSource(`/api/sessions/${id}/events`); state.source = source;
  source.onmessage = ({ data }) => {
    const e = JSON.parse(data);
    if (e.type === 'snapshot') { state.session = e.session; state.events = e.events; state.running = e.running; state.live = e.live || { text: '', thinking: '' }; state.error = state.live.error || ''; state.maintenance = state.live.maintenance; refreshList().catch(x => toast(x.message)); renderPanel(); }
    if (e.type === 'step') { state.live.text = ''; state.live.thinking = ''; }
    if (e.type === 'text_delta') state.live.text += e.delta;
    if (e.type === 'thinking_delta') state.live.thinking += e.delta;
    if (e.type === 'message' || e.type === 'tool_end') {
      if (!state.events.some(x => x.seq === e.event.seq)) state.events.push(e.event);
      if (e.type === 'message') { state.live.text = ''; state.live.thinking = ''; }
      if (e.type === 'tool_end') { state.live.tool = null; state.live.toolOutput = ''; }
    }
    if (e.type === 'tool_start') { state.live.tool = e.call; state.live.toolOutput = ''; }
    if (e.type === 'tool_output') state.live.toolOutput = (state.live.toolOutput || '') + e.delta;
    if (e.type === 'status') {
      state.running = e.state === 'running'; state.error = e.state === 'error' ? e.message : '';
      if (!state.running) { refreshSession().catch(x => toast(x.message)); refreshList().catch(x => toast(x.message)); }
    }
    if (e.type === 'maintenance') { state.maintenance = e; if (e.state === 'done') refreshSession().catch(x => toast(x.message)); renderPanel(); }
    queueRender(!['text_delta', 'thinking_delta', 'tool_output'].includes(e.type));
  };
  source.onerror = () => { $('#run-status').textContent = '连接中断，正在重连…'; };
}
async function refreshSession() {
  if (!state.session) return;
  const id = state.session.id, data = await api(`/sessions/${id}`);
  if (state.session?.id !== id) return;
  state.events = data.events; state.session = data.session; state.running = data.running;
  renderConversation(); renderPanel();
}
$('#composer').onsubmit = async e => {
  e.preventDefault();
  try {
    if (state.running) { await api(`/sessions/${state.session.id}/stop`, {}); return; }
    const input = $('#message-input'), text = input.value.trim(); if (!text) return;
    if (!state.settings.main.model || !state.settings.main.baseUrl) { openSettings(); return; }
    if (!state.session) {
      const session = await api('/sessions', { cwd: state.settings.cwd }); state.session = session; openSession(session.id);
    }
    const id = state.session.id;
    await api(`/sessions/${id}/chat`, { text });
    input.value = ''; input.style.height = ''; state.running = true; state.error = '';
    await refreshSession(); await refreshList();
    $('#scroll-area').scrollTop = $('#scroll-area').scrollHeight;
  } catch (error) { state.error = error.message; renderHeader(); }
};
$('#message-input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); } };
$('#message-input').oninput = e => { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(220, e.target.scrollHeight)}px`; };
$('#new-chat').onclick = () => openSession(null);
$('#menu').onclick = () => document.body.classList.toggle('menu-open');
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSession(null); $('#message-input').focus(); } });

function openSettings() {
  for (const field of ['main', 'background']) {
    const form = $(`[data-route=${field}]`), route = state.settings[field] || state.settings.main;
    for (const input of form.querySelectorAll('[name]')) {
      input.value = input.name === 'apiKey' ? '' : route[input.name] ?? '';
      if (input.name === 'apiKey') input.placeholder = route.hasKey ? '已保存，留空保持不变' : '输入密钥';
    }
  }
  $('#same-model').checked = !state.settings.background; $('[data-route=background]').hidden = $('#same-model').checked;
  $('#settings-error').textContent = ''; $('#settings-dialog').showModal();
}
$('#settings-open').onclick = openSettings;
$('#same-model').onchange = e => $('[data-route=background]').hidden = e.target.checked;
$('#settings-form').onsubmit = async e => {
  e.preventDefault();
  const patch = {};
  for (const field of ['main', 'background']) {
    if (field === 'background' && $('#same-model').checked) { patch.background = null; continue; }
    patch[field] = {};
    for (const input of $(`[data-route=${field}]`).querySelectorAll('[name]')) {
      if (input.name === 'apiKey' && !input.value) continue;
      patch[field][input.name] = input.type === 'number' ? Number(input.value) : input.value.trim();
    }
  }
  try { state.settings = await api('/settings', patch); $('#settings-dialog').close(); renderHeader(); toast('设置已保存'); }
  catch (error) { $('#settings-error').textContent = error.message; }
};
document.querySelectorAll('.dialog-close').forEach(b => b.onclick = () => b.closest('dialog').close());
$('#cwd-open').onclick = () => { $('#cwd-input').value = state.session?.cwd || state.settings.cwd; $('#cwd-error').textContent = ''; $('#cwd-dialog').showModal(); };
$('#cwd-form').onsubmit = async e => {
  e.preventDefault();
  try {
    const cwd = $('#cwd-input').value.trim(); const session = await api('/sessions', { cwd });
    state.settings = await api('/settings', { cwd }); $('#cwd-dialog').close(); openSession(session.id);
  } catch (error) { $('#cwd-error').textContent = error.message; }
};
function toggleWorkspace(open) { $('#workspace').hidden = !open; $('#context-toggle').setAttribute('aria-expanded', String(open)); if (open) renderPanel(); }
$('#context-toggle').onclick = () => toggleWorkspace($('#workspace').hidden);
$('#context-close').onclick = () => toggleWorkspace(false);
document.querySelectorAll('[data-panel]').forEach(b => b.onclick = () => { state.panel = b.dataset.panel; document.querySelectorAll('[data-panel]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', String(x === b)); }); renderPanel(); });

async function renderPanel() {
  if ($('#workspace').hidden) return;
  const root = $('#workspace-content'); root.replaceChildren();
  const section = title => root.append(el('div', 'section-label', title));
  if (state.panel === 'context') {
    const context = state.session?.context;
    if (state.maintenance?.state === 'error') root.append(el('p', 'form-error', state.maintenance.message));
    if (['running', 'compacting'].includes(state.maintenance?.state)) root.append(el('p', 'form-hint', state.maintenance.state === 'compacting' ? '正在整理上下文…' : '正在更新工作记忆…'));
    if (context?.pins.length) { section('约束与决定'); context.pins.forEach(p => root.append(el('p', 'pin', p))); }
    if (context?.status) { section('当前状态'); root.append(el('div', 'context-text', context.status)); }
    const notes = state.events.filter(e => e.type === 'note');
    if (notes.length) { section('工作笔记'); notes.forEach(e => root.append(el('div', 'note-item', e.text))); }
    if (state.session?.checkpoint) { section('工作纪要'); root.append(el('div', 'context-text', state.session.checkpoint.text)); }
    if (!context && !notes.length && !state.session?.checkpoint) root.append(el('p', 'panel-empty', '工作状态会随对话逐步积累。'));
    if (state.session) {
      const compact = el('button', 'panel-action', '整理较早的上下文'); compact.disabled = state.running;
      compact.onclick = async () => { compact.disabled = true; try { const r = await api(`/sessions/${state.session.id}/compact`, {}); toast(r.changed ? '上下文已整理，原文仍可回捞' : '目前没有需要整理的较早内容'); await refreshSession(); } catch (e) { toast(e.message); } finally { compact.disabled = state.running; } }; root.append(compact);
    }
  } else if (state.panel === 'tasks') {
    const tasks = state.session?.tasks || [];
    if (!tasks.length) root.append(el('p', 'panel-empty', '需要分步骤的任务，会在这里留下清单。'));
    for (const t of tasks) { const row = el('div', `task-item${t.done ? ' done' : ''}`); row.append(el('span', 'task-box', t.done ? '✓' : '□'), el('span', 'task-text', t.text)); root.append(row); }
  } else {
    const id = state.session?.id;
    const add = el('button', 'panel-action', '＋ 记一条'); add.onclick = () => memoryForm(root); root.append(add);
    try {
      const memories = await api(`/memories${id ? `?session=${id}` : ''}`);
      if (state.panel !== 'memory' || state.session?.id !== id) return;
      if (!memories.length) root.append(el('p', 'panel-empty', '还没有长期记忆。稳定的偏好、决定和经验会逐步留在这里。'));
      for (const m of memories) {
        const item = el('div', 'memory-item'), meta = el('div', 'memory-meta');
        meta.append(el('span', '', ({ global: '全局', cross: '跨项目', project: '本项目' })[m.scope]), el('span', '', m.key));
        const edit = el('button', '', '编辑'); edit.onclick = () => memoryForm(item, m); meta.append(edit);
        item.append(meta, el('div', 'memory-text', m.text)); root.append(item);
      }
    } catch (error) { root.append(el('p', 'form-error', error.message)); }
  }
}
function memoryForm(parent, memory) {
  if (parent.querySelector('.memory-form')) return;
  const form = el('form', 'memory-form'), area = el('textarea'), scope = el('select');
  area.value = memory?.text || ''; area.placeholder = '值得下次记住的事'; area.required = true; area.setAttribute('aria-label', '记忆内容');
  for (const [value, label] of [['project', '本项目'], ['cross', '跨项目'], ['global', '全局']]) { const o = el('option', '', label); o.value = value; scope.append(o); }
  scope.value = memory?.scope || 'project'; scope.disabled = Boolean(memory); scope.setAttribute('aria-label', '记忆范围');
  const save = el('button', 'primary-button', '保存'), cancel = el('button', 'quiet-button', '取消'); cancel.type = 'button'; cancel.onclick = () => form.remove();
  form.append(scope, area, save, cancel);
  if (memory) { const remove = el('button', 'quiet-button', '删除这条'); remove.type = 'button'; remove.onclick = async () => { try { await api(`/memories${state.session ? `?session=${state.session.id}` : ''}`, { ...memory, op: 'retire' }); renderPanel(); } catch (e) { toast(e.message); } }; form.append(remove); }
  form.onsubmit = async e => {
    e.preventDefault();
    try { await api(`/memories${state.session ? `?session=${state.session.id}` : ''}`, { op: 'upsert', key: memory?.key || `note.${Date.now()}`, text: area.value.trim(), scope: scope.value }); renderPanel(); }
    catch (error) { toast(error.message); }
  };
  parent.prepend(form); area.focus();
}

try {
  state.settings = await api('/settings'); await refreshList();
  openSession(new URLSearchParams(location.search).get('session')); renderHeader();
} catch (error) { toast(error.message); }
