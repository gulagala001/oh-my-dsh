function renderer() {
  const api = window.opencuSiteInformation;
  const root = document.getElementById('content'), status = document.getElementById('status');
  const navigation = document.getElementById('navigation'), reload = document.getElementById('reload');
  const labels = { overview: '连接', certificate: '证书', cookies: 'Cookie 和数据', settings: '权限' };
  const permissions = { geolocation: '位置', notifications: '通知', camera: '摄像头', microphone: '麦克风',
    'media-stream-camera': '摄像头', 'media-stream-mic': '麦克风', midi: 'MIDI', 'midi-sysex': 'MIDI 系统消息',
    'clipboard-read': '读取剪贴板', 'clipboard-sanitized-write': '写入剪贴板', fullscreen: '全屏',
    'pointer-lock': '指针锁定', 'pointerLock': '指针锁定', 'idle-detection': '空闲状态',
    'persistent-storage': '持久存储', 'local-fonts': '本地字体', 'speaker-selection': '音频输出',
    usb: 'USB 设备', hid: 'HID 设备', serial: '串口设备', 'media-key-system': '受保护内容',
    'display-capture': '屏幕捕获', 'screen-wake-lock': '屏幕唤醒', sensors: '传感器' };
  const storageLabels = { file_systems: '文件系统', indexeddb: 'IndexedDB', local_storage: '本地存储',
    service_workers: 'Service Worker', cache_storage: '缓存存储', storage_buckets: '存储桶', websql: 'WebSQL', other: '其他' };
  const settings = { allow: '允许', block: '阻止', ask: '询问', default: '使用默认值' };
  let state, busy = false, confirming = null, note = '';

  const element = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  const bytes = value => {
    if (typeof value !== 'number') return '不可用';
    if (value < 1024) return Math.round(value) + ' B';
    if (value < 1048576) return (value / 1024).toFixed(1) + ' KB';
    if (value < 1073741824) return (value / 1048576).toFixed(1) + ' MB';
    return (value / 1073741824).toFixed(1) + ' GB';
  };
  const date = value => typeof value === 'number' ? new Date(value).toLocaleString() : '不可用';
  const row = (parent, label, value, mono = false) => {
    if (value === '' || value === undefined) return;
    const line = element('div', 'detail-row');
    line.append(element('span', 'detail-label', label), element('span', mono ? 'detail-value mono' : 'detail-value', value));
    parent.append(line);
  };
  const button = (label, callback, className = '', disabled = false) => {
    const control = element('button', className, label);
    control.type = 'button'; control.disabled = busy || disabled;
    control.addEventListener('click', callback); return control;
  };
  const section = (heading, trailing) => {
    const block = element('section'), title = element('div', 'section-heading');
    title.append(element('h2', '', heading)); if (trailing) title.append(trailing);
    block.append(title); root.append(block); return block;
  };
  const empty = (parent, message) => parent.append(element('p', 'muted', message));
  const error = value => { note = value?.message || '操作失败。'; render(); };

  async function perform(op, input = {}) {
    if (busy) return;
    try {
      const pending = op === 'refresh' ? api.refresh() : api.action(op, input);
      busy = true; confirming = null; note = ''; render();
      const result = await pending;
      if (result?.dialogId) state = result;
      note = op === 'clearData' ? '站点数据已清理。打开的页面可能会重新写入数据。'
        : ['setPermission', 'resetPermission', 'resetPermissions'].includes(op) ? '权限已保存。'
          : ['removeCookie', 'clearCookies'].includes(op) ? 'Cookie 已删除。' : '';
      if (result?.refreshError) note = '权限已保存，但站点信息刷新失败。请重新刷新。';
      else if (result?.permissionChange?.reloadFailedTabIds?.length) note = '权限已保存，但部分页面重载失败。';
    } catch (value) { note = value?.message || '操作失败。'; }
    finally { busy = false; render(); }
  }

  function confirm(title, description, op, input) {
    confirming = { title, description, op, input }; render();
    document.getElementById('cancel-confirm')?.focus();
  }

  function connection() {
    const security = state.security;
    const title = { secure: '连接安全', insecure: '连接不安全', 'insecure-broken': '连接存在安全问题',
      neutral: '连接安全状态未确认', info: '连接安全状态需要注意', unknown: '页面安全状态未知' }[security.state] || '页面安全状态未知';
    const headline = element('div', 'connection-status ' + (security.state === 'secure' ? 'good'
      : ['insecure', 'insecure-broken'].includes(security.state) ? 'warning' : ''));
    headline.append(element('h2', '', title)); root.append(headline);
    if (security.state === 'unknown') empty(headline, '当前页面的整页安全状态不可用。');
    if (security.transport === 'unencrypted') empty(headline, '此页面使用未加密的 HTTP 连接。');
    const block = section('证书和连接');
    const validation = security.certificateValidation === 'verified' ? '证书已通过浏览器默认验证'
      : security.certificateValidation === 'failed' ? '证书验证失败' : '证书验证结果不可用';
    row(block, '证书验证', validation);
    if (security.verification) {
      row(block, '验证结果', security.verification.result);
      row(block, '验证时间', date(security.verification.observedAt));
    }
    if (security.certificateError) row(block, '证书错误', security.certificateError);
    if (security.certificateWarning) empty(block, '证书或加密参数存在警告。');
    if (security.connection) {
      row(block, '协议', security.connection.protocol); row(block, '加密算法', security.connection.cipher);
      row(block, '密钥交换', [security.connection.keyExchange, security.connection.keyExchangeGroup].filter(Boolean).join(' / '));
    }
    if (security.certificate.length) {
      row(block, '签发者', security.certificate[0].issuer);
      row(block, '有效期至', date(security.certificate[0].validTo));
      block.append(button('查看证书', () => chooseView('certificate'), 'link-button'));
    } else empty(block, '当前页面未提供连接证书。');
    if (security.issues?.length) {
      const issues = section('安全问题'); for (const issue of security.issues) issues.append(element('p', 'mono', issue));
    }
    if (security.safetyTip && security.safetyTip !== 'none') row(block, '安全提示', security.safetyTip);
  }

  function certificates() {
    if (!state.security.certificate.length) { empty(root, '当前页面未提供连接证书。'); return; }
    for (const certificate of state.security.certificate) {
      const block = section(certificate.index === 0 ? '网站证书' : '证书链 ' + (certificate.index + 1));
      row(block, '主题', certificate.subject); row(block, '签发者', certificate.issuer);
      row(block, '有效期起', date(certificate.validFrom)); row(block, '有效期至', date(certificate.validTo));
      if (certificate.hostnameMatches !== undefined) row(block, '主机名匹配', certificate.hostnameMatches ? '是' : '否');
      row(block, '备选名称', certificate.subjectAlternativeName); row(block, '公钥类型', certificate.publicKeyType);
      row(block, '序列号', certificate.serialNumber, true); row(block, 'SHA-256', certificate.fingerprint256, true);
      row(block, 'SHA-1', certificate.fingerprint, true);
    }
  }

  function cookies() {
    const data = state.cookies;
    const block = section('Cookie', button('全部删除', () => confirm('删除当前站点 Cookie？',
      '这可能会退出登录。共享域 Cookie 的删除也会影响使用它的其他子域。', 'clearCookies'), 'danger', !data.available || !data.count || !data.clearAllAvailable));
    if (!data.available) empty(block, '无法读取当前站点的 Cookie。');
    else {
      empty(block, data.count + ' 个 Cookie');
      if (!data.partitionScopeComplete) empty(block, '分区 Cookie 仅显示已确认属于当前页面的部分。');
      if (data.truncated) empty(block, '清单较长，当前显示 ' + data.items.length + ' 项。');
      if (!data.count) empty(block, '当前站点没有 Cookie。');
      for (const cookie of data.items) {
        const item = element('div', 'cookie-row'), details = element('div', 'cookie-details');
        details.append(element('strong', '', cookie.name || '(无名称)'), element('div', 'muted mono', cookie.domain + cookie.path));
        const flags = [cookie.httpOnly ? 'HttpOnly' : '', cookie.secure ? 'Secure' : '', cookie.sameSite,
          cookie.partitioned ? '分区' : '', cookie.session ? '会话' : '到期 ' + date(cookie.expires === null ? null : cookie.expires * 1000)].filter(Boolean);
        details.append(element('div', 'muted cookie-flags', flags.join(' · ')));
        item.append(details, button('删除', () => confirm('删除此 Cookie？', cookie.name || '(无名称)', 'removeCookie', { cookieId: cookie.id }), 'danger small'));
        block.append(item);
      }
    }
    const storage = state.storage;
    const storageBlock = section('站点数据', button('清理数据', () => confirm('清理当前来源的站点数据？',
      '将清理本地存储、IndexedDB、文件系统、Service Worker 和缓存存储。', 'clearData'), 'danger', !storage.canClear));
    row(storageBlock, '来源', state.origin, true);
    if (!storage.available) empty(storageBlock, '无法读取站点数据用量。');
    else {
      row(storageBlock, '配额管理的存储', bytes(storage.usage));
      for (const item of storage.items.filter(value => value.usage > 0)) row(storageBlock, storageLabels[item.type] || item.type, bytes(item.usage));
    }
  }

  function sitePermissions() {
    const data = state.permissions;
    const block = section('当前站点权限', button('重置', () => confirm('重置当前站点权限？',
      '此站点将恢复使用默认权限。', 'resetPermissions'), 'danger', !data.available || !data.canReset || !data.items.some(item => item.canModify)));
    row(block, '来源', state.origin, true);
    if (!data.available) { empty(block, data.reason || '站点权限当前不可用。'); return; }
    if (!data.items.length) empty(block, '当前没有可管理的站点权限。');
    for (const permission of data.items) {
      const line = element('div', 'permission-row'), name = permission.label || permissions[permission.name] || permission.name || '权限 ' + permission.type;
      const description = element('div', 'permission-name'); description.append(element('label', '', name));
      if (permission.inherited) description.append(element('small', 'muted', '默认：' + (settings[permission.effectiveSetting] || settings[permission.defaultSetting] || '不可用')));
      line.append(description);
      const select = element('select'); select.setAttribute('aria-label', name);
      select.disabled = busy || !permission.canModify;
      const choices = [...new Set(['default', ...permission.settingValues])];
      if (permission.unavailable) choices.splice(0, choices.length, 'unavailable');
      for (const choice of choices) {
        const option = element('option', '', settings[choice] || '不可用'); option.value = choice; select.append(option);
      }
      select.value = permission.inherited ? 'default' : permission.setting;
      if (!select.value) select.value = 'default';
      select.addEventListener('change', () => {
        void perform(select.value === 'default' ? 'resetPermission' : 'setPermission', { type: permission.type, setting: select.value });
      });
      line.append(select); block.append(line);
    }
  }

  function render() {
    if (!state) return;
    document.getElementById('host').textContent = state.host;
    document.getElementById('origin').textContent = state.origin;
    navigation.replaceChildren();
    for (const [view, label] of Object.entries(labels)) {
      const tab = button(label, () => chooseView(view), 'tab');
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', state.view === view ? 'true' : 'false'); navigation.append(tab);
    }
    root.replaceChildren();
    if (state.loading && !busy) empty(root, '正在读取站点信息…');
    else ({ overview: connection, certificate: certificates, cookies, settings: sitePermissions })[state.view]();
    status.textContent = note || (busy ? '正在处理…' : state.reloadPrompt ? '部分更改需要重新加载页面。' : '');
    reload.hidden = !state.reloadPrompt; reload.disabled = busy;
    document.getElementById('refresh').disabled = busy;
    const overlay = document.getElementById('confirmation'); overlay.replaceChildren(); overlay.hidden = !confirming;
    document.querySelector('.shell').inert = !!confirming;
    if (confirming) {
      const panel = element('div', 'confirmation-panel'); panel.setAttribute('role', 'alertdialog'); panel.setAttribute('aria-modal', 'true');
      panel.append(element('h2', '', confirming.title), element('p', '', confirming.description));
      const actions = element('div', 'confirmation-actions'), cancel = button('取消', () => { confirming = null; render(); });
      cancel.id = 'cancel-confirm';
      actions.append(cancel, button('确认', () => { const value = confirming; void perform(value.op, value.input); }, 'danger'));
      panel.append(actions); overlay.append(panel);
      panel.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const controls = [...panel.querySelectorAll('button')];
        const index = controls.indexOf(document.activeElement);
        if (event.shiftKey && index === 0 || !event.shiftKey && index === controls.length - 1) {
          event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0].focus();
        }
      });
    }
  }

  async function chooseView(view) {
    if (busy) return;
    confirming = null; note = '';
    try { state = await api.view(view); render(); } catch (value) { error(value); }
  }

  document.getElementById('close').addEventListener('click', () => { void perform('close'); });
  document.getElementById('refresh').addEventListener('click', () => { void perform('refresh'); });
  reload.addEventListener('click', () => { void perform('reload'); });
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (confirming) { confirming = null; render(); } else if (!busy) void perform('close');
  });
  api.onState(value => { state = value; render(); });
  api.read().then(value => { state = value; render(); }).catch(error);
}

export function siteInformationDocument(nonce) {
  if (typeof nonce !== 'string' || !/^[a-z0-9-]{36}$/u.test(nonce)) throw new Error('Invalid site-information nonce');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>站点信息</title><style nonce="${nonce}">
:root{color-scheme:light dark;--bg:#fff;--text:#24272b;--muted:#6c7076;--line:#e3e5e8;--hover:#f1f3f5;--accent:#246eea;--danger:#b6303f;--good:#1d7b51}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}
button,select{font:inherit;letter-spacing:0;color:inherit}button{border:1px solid var(--line);border-radius:5px;background:var(--bg);padding:5px 10px;cursor:pointer;white-space:nowrap}
button:hover{background:var(--hover)}button:disabled,select:disabled{cursor:default;opacity:.5}button:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.shell{height:100vh;display:flex;flex-direction:column;min-width:0}header{padding:14px 16px 10px;display:flex;align-items:flex-start;gap:10px;border-bottom:1px solid var(--line)}.site{min-width:0;flex:1}
h1,h2,p{margin:0}h1{font-size:16px;line-height:22px;font-weight:600;overflow-wrap:anywhere}h2{font-size:13px;font-weight:600}.origin{font-size:12px;color:var(--muted);overflow-wrap:anywhere;margin-top:3px}
.icon-button{width:28px;height:28px;padding:0;flex-shrink:0;font-size:18px;line-height:1;border-color:transparent;background:transparent}
nav{display:flex;border-bottom:1px solid var(--line);padding:0 12px;gap:2px;flex-shrink:0}.tab{padding:9px 8px;border:0;border-bottom:2px solid transparent;border-radius:0;font-size:12px;background:transparent}.tab[aria-selected=true]{border-bottom-color:var(--accent);color:var(--accent)}
main{padding:2px 16px 12px;overflow:auto;flex:1;min-height:0}section{padding:14px 0;border-bottom:1px solid var(--line)}section:last-child{border-bottom:0}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.muted{color:var(--muted);font-size:12px;overflow-wrap:anywhere}.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;overflow-wrap:anywhere;white-space:pre-wrap}
.detail-row{display:grid;grid-template-columns:minmax(80px,105px) minmax(0,1fr);gap:12px;padding:5px 0;align-items:start}.detail-label{color:var(--muted);font-size:12px}.detail-value{overflow-wrap:anywhere;min-width:0;white-space:pre-wrap}
.connection-status{padding:18px 0 5px}.connection-status h2{font-size:15px}.connection-status p{margin-top:4px}.good h2{color:var(--good)}.warning h2,.danger{color:var(--danger)}.link-button{border:0;color:var(--accent);padding:5px 0;background:transparent;margin-top:6px}
.cookie-row{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}.cookie-row:last-child{border:0}.cookie-details{min-width:0;flex:1}.cookie-details strong{font-weight:500;overflow-wrap:anywhere}.cookie-flags{font-size:11px;margin-top:3px}.small{font-size:12px;padding:3px 8px}
.permission-row{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)}.permission-row:last-child{border:0}.permission-name{display:flex;flex-direction:column;min-width:0;overflow-wrap:anywhere}.permission-name label{font-size:13px}
select{border:1px solid var(--line);border-radius:5px;background:var(--bg);padding:5px 8px;min-width:106px;max-width:48%}
footer{min-height:50px;padding:10px 16px;display:flex;align-items:center;gap:10px;border-top:1px solid var(--line)}#status{flex:1;color:var(--muted);font-size:12px;overflow-wrap:anywhere}#reload{color:var(--accent);flex-shrink:0}
.confirmation{position:fixed;inset:0;background:#0005;display:grid;place-items:center;padding:24px}.confirmation[hidden]{display:none}.confirmation-panel{width:100%;max-width:390px;padding:18px;border:1px solid var(--line);border-radius:8px;background:var(--bg);box-shadow:0 5px 25px #0002}.confirmation-panel h2{font-size:14px}.confirmation-panel p{font-size:13px;margin-top:10px;overflow-wrap:anywhere}.confirmation-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
@media(prefers-color-scheme:dark){:root{--bg:#202124;--text:#e6e7eb;--muted:#a3a7ae;--line:#3a3d42;--hover:#303237;--accent:#83b2ff;--danger:#ff8e9a;--good:#79d6ac}}
@media(max-width:390px){header{padding:12px}.tab{padding:9px 6px;font-size:11px}nav{padding:0 6px}main{padding-left:12px;padding-right:12px}.detail-row{grid-template-columns:85px minmax(0,1fr);gap:8px}footer{padding:10px 12px}}
</style></head><body><div class="shell"><header><div class="site"><h1 id="host">站点信息</h1><p id="origin" class="origin"></p></div>
<button id="refresh" class="icon-button" type="button" title="刷新" aria-label="刷新">&#x21bb;</button><button id="close" class="icon-button" type="button" title="关闭" aria-label="关闭">&#xd7;</button></header>
<nav id="navigation" role="tablist" aria-label="站点信息视图"></nav><main id="content" aria-live="polite"></main>
<footer><span id="status" role="status"></span><button id="reload" type="button" hidden>重新加载</button></footer></div><div id="confirmation" class="confirmation" hidden></div>
<script nonce="${nonce}">(${renderer.toString()})();</script></body></html>`;
}
