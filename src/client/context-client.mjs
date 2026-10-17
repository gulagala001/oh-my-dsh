import { CONTEXT_FREQUENCY_PRESETS } from '../frequency.mjs';
export { CONTEXT_FREQUENCY_PRESETS } from '../frequency.mjs';
import { createPoller } from './polling.mjs';
import { PERSONALITY_PRESETS, personalityPreset, personalityText, personalityPatch } from '../cc-adaptation/personality.mjs';

export const CONTEXT_UI_VERSION = '1.3.0';
export function contextFrequencyOf(config = {}) {
  return Object.entries(CONTEXT_FREQUENCY_PRESETS).find(([, values]) => Object.entries(values).every(([key, value]) => config[key] === value))?.[0] || 'custom';
}
export function contextFrequencyPatch(name) {
  if (!Object.hasOwn(CONTEXT_FREQUENCY_PRESETS, name)) throw Error('未知频率档位');
  return { ...CONTEXT_FREQUENCY_PRESETS[name] };
}
export function contextSettingsPatch(saved = {}, edited = {}) {
  return Object.fromEntries(Object.entries(edited).filter(([key, value]) => key !== 'dataDir' && JSON.stringify(value) !== JSON.stringify(saved[key])));
}
export function contextRouteMode(config = {}) {
  const route = config.unifiedBackground || {};
  if (config.backgroundMode === 'separate') return 'separate';
  return !route.provider && !route.model && (!route.effort || route.effort === 'off') && (route.temperature == null || route.temperature === 0.7) ? 'follow' : 'unified';
}

export function createContextUI(React) {
  const h = React.createElement;
  const api = async (path, body, signal) => {
    const response = await fetch('trisoul-x/api' + path, body === undefined ? { signal } : { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw Object.assign(Error(data.error || 'HTTP ' + response.status), { statusCode: response.status }); return data;
  };
  const suffix = id => '?session=' + encodeURIComponent(id || '');
  const fmt = value => Number(value || 0).toLocaleString();
  const frequencyNames = { always: '频繁', medium: '适中', slow: '较少', custom: '自定义' };
  const paths = {
    settings: 'M4 7h16M4 17h16M8 4v6M16 14v6', clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    context: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5', layers: 'm12 3 10 6-10 6L2 9l10-6ZM2 13l10 6 10-6M2 17l10 6 10-6',
    check: 'm5 12 4 4L19 6', chevron: 'm9 5 7 7-7 7', arrow: 'm14 5-7 7 7 7', close: 'm6 6 12 12M6 18 18 6',
    refresh: 'M20 7v5h-5M4 17v-5h5M5 8a7 7 0 0 1 12-3l3 3M19 16A7 7 0 0 1 7 19l-3-3',
    search: 'm20 20-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', more: 'M4 12h2m5 0h2m5 0h2',
    lock: 'M6 10h12v11H6ZM8 10V7a4 4 0 0 1 8 0v3', globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
    task: 'm4 6 2 2 3-4M12 6h8M4 14l2 2 3-4M12 14h8M12 20h8', monitor: 'M3 17h4l3-10 4 14 3-10h4',
    computer: 'M3 4h18v13H3ZM8 21h8M12 17v4', memory: 'M8 3h8l4 4v10l-4 4H8l-4-4V7l4-4ZM9 8h6v8H9Z',
    spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z', info: 'M12 11v6M12 7v1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  };
  const icon = (name, size = 16) => h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.65, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[name] || paths.context }));
  const button = (text, onClick, options = {}) => h('button', { type: 'button', onClick, disabled: options.disabled, className: 'cx-btn ' + (options.primary ? 'cx-primary ' : '') + (options.quiet ? 'cx-quiet ' : '') + (options.className || ''), title: options.title, 'aria-label': options.label || (typeof text === 'string' ? text : undefined) }, options.icon && icon(options.icon), text);
  const badge = (text, tone = '') => h('span', { className: 'cx-pill ' + (tone && 'cx-tone-' + tone) }, text);
  const alert = (text, error) => text && h('div', { className: 'cx-alert ' + (error ? 'cx-error' : ''), role: error ? 'alert' : 'status' }, icon(error ? 'info' : 'check'), h('span', null, text));
  const heading = (text, sub, name, action) => h('header', { className: 'cx-head' }, h('div', { className: 'cx-head-title' }, name && h('span', { className: 'cx-head-icon' }, icon(name, 19)), h('div', null, h('h2', null, text), h('p', null, sub))), action);
  const field = (label, input, hint) => h('label', { className: 'cx-field' }, h('span', null, label), React.cloneElement(input, { 'aria-label': input.props['aria-label'] || label }), hint && h('small', null, hint));
  const section = (text, sub, children, right) => h('section', { className: 'cx-section' }, h('div', { className: 'cx-section-head' }, h('div', null, h('h3', null, text), sub && h('p', null, sub)), right), children);
  const fold = (text, sub, children, open = false) => h('details', { className: 'cx-fold', open: open || undefined }, h('summary', null, h('span', null, h('strong', null, text), sub && h('small', null, sub)), icon('chevron', 14)), h('div', { className: 'cx-fold-body' }, children));
  const empty = (text, sub, name = 'layers') => h('div', { className: 'cx-empty' }, h('span', { className: 'cx-empty-icon' }, icon(name, 23)), h('h3', null, text), h('p', null, sub));
  const segments = (label, value, options, change, disabled = false) => h('div', { className: 'cx-segments', role: 'group', 'aria-label': label }, ...options.map(([id, text]) => h('button', { key: id, type: 'button', disabled, 'aria-pressed': id === value, onClick: () => change(id) }, text)));
  const pageTabs = (value, options, change) => h('nav', { className: 'cx-tabs', 'aria-label': '设置分类' }, ...options.map(([id, text]) => h('button', { key: id, type: 'button', 'aria-current': id === value ? 'page' : undefined, onClick: () => change(id) }, text)));
  const duration = ms => Number(ms) >= 60000 ? Number(ms) / 60000 + ' 分钟' : Number(ms || 0) / 1000 + ' 秒';
  class ComponentsPanel extends React.Component {
    state = { data: null, error: '', loadError: '', busy: false, paths: null, saved: '' };
    componentDidMount() {
      this.alive = true;
      this.poller = createPoller({
        read: async signal => { const epoch = this.epoch || 0; return { data: await this.call(undefined, signal), epoch }; },
        onData: ({ data, epoch }) => { if (!this.state.busy && epoch === (this.epoch || 0)) this.setState({ data, loadError: '' }); },
        onError: error => this.setState({ loadError: error.message }),
      });
      this.poller.start();
    }
    componentWillUnmount() { this.alive = false; this.poller?.stop(); }
    call = async (body, signal) => {
      const response = await fetch('trisoul-x/components', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { signal });
      const value = await response.json(); if (!response.ok) throw Error(value.error || '读取组件状态失败'); return value;
    };
    act = async body => {
      if (this.state.busy) return;
      this.epoch = (this.epoch || 0) + 1;
      const patch = body.patch || {}, previous = this.state.data;
      const data = { ...previous, ...(typeof patch.componentAutoSetup === 'boolean' ? { automatic: patch.componentAutoSetup } : {}),
        codegraph: { ...previous.codegraph, ...(typeof patch.codegraphEnabled === 'boolean' ? { enabled: patch.codegraphEnabled } : {}) } };
      this.setState({ data, busy: true, error: '', saved: '' });
      try {
        const data = await this.call(body);
        if (this.alive) this.setState({ data, saved: body.action === 'settings' ? '已保存' : '' });
      }
      catch (error) { let actual = previous; try { actual = await this.call(); } catch {} if (this.alive) this.setState({ data: actual, error: error.message }); }
      finally { if (this.alive) this.setState({ busy: false }); }
    };
    toggle = (key, label, value, hint) => h('label', { className: 'cx-toggle' }, h('span', null, h('strong', null, label), h('small', null, hint)), h('input', { type: 'checkbox', role: 'switch', 'aria-label': label, checked: value, disabled: this.state.busy, onChange: e => this.act({ action: 'settings', patch: { [key]: e.target.checked } }) }));
    prepare = component => this.act({ action: 'prepare', component });
    copy = async text => { try { await navigator.clipboard.writeText(text); this.setState({ saved: '已复制' }); } catch (error) { this.setState({ error: error.message }); } };
    row(title, ready, operation, hint, action) {
      const preparing = operation?.status === 'preparing', error = operation?.error;
      return h('div', { className: 'cx-component-row' }, h('div', { className: 'cx-row' }, h('strong', null, title), badge(preparing ? '正在准备' : error ? '需要处理' : ready ? '已就绪' : '待准备', ready && !error ? 'blue' : undefined)), h('p', { className: 'cx-hint' }, error || hint), !preparing && action);
    }
    render() {
      const { data: d, error, loadError, busy, saved } = this.state;
      if (!d) return h('div', { className: 'cx-body' }, alert(error || loadError, true), empty(loadError ? '组件状态读取失败' : '正在检查基础组件', '安装、启动与权限集中在这里。', 'settings'), loadError && button('重试', () => this.poller?.refresh()));
      const cg = d.codegraph;
      const retry = (component, label = '重新准备') => button(label, () => this.prepare(component), { disabled: busy, quiet: true, icon: 'refresh' });
      return h('div', { className: 'cx-body cx-components' }, alert(error || loadError || cg.error, true),
        h('p', { className: 'cx-hint' }, d.automatic ? '组件默认启用，运行依赖自动准备。开关立即保存；需要系统授权时会在下面提示。' : '启动时自动准备依赖已关闭，可在下方手动准备。开关立即保存。'),
        section('代码理解', '自动为当前项目建立索引，后续修改自动同步。', h(React.Fragment, null,
          this.toggle('codegraphEnabled', 'CodeGraph', cg.enabled, '无需全局安装或配置 MCP。索引保存在项目的 .codegraph 目录。'),
          cg.enabled && this.row('运行环境', cg.installed, cg.operation, cg.installed ? '已自动准备' : '正在准备适合本机的运行环境', !cg.installed || cg.operation?.error || cg.error ? retry('codegraph') : null),
          cg.enabled && !cg.projects.length && h('p', { className: 'cx-hint' }, '打开项目会话后自动开始准备。'),
          cg.enabled && cg.projects.map(p => h('div', { className: 'cx-component-project', key: p.path }, h('div', { className: 'cx-row' }, h('code', { className: 'cx-component-path' }, p.path), badge(p.status === 'ready' ? '索引就绪' : p.status === 'error' ? '准备失败' : '正在建索引')), p.error && h('p', { className: 'cx-hint' }, p.error), p.status === 'error' && button('重试索引', () => this.act({ action: 'index', path: p.path }), { disabled: busy, quiet: true }))))),
        section('电脑与浏览器', 'OpenCU 已内置；和独立安装共用一套工具、目标和预览。', h('p', { className: 'cx-hint' }, '在设置的“电脑与浏览器”和“浏览器偏好”中管理能力、权限、扩展与下载。直接在对话中交代任务，无需开启 CU 控制台。')),
        fold('高级配置', 'CodeGraph 运行依赖。', h(React.Fragment, null,
          this.toggle('componentAutoSetup', '启动时自动准备依赖', d.automatic, '关闭后仍可使用上面的准备按钮。'),
          button('检查并准备组件', () => this.prepare(), { disabled: busy, quiet: true, icon: 'refresh' }))),
        saved && h('p', { className: 'cx-save-status', role: 'status' }, saved));
    }
  }

  class ContextSettings extends React.Component {
    state = { config: null, directory: [], page: 'basic', custom: false, routing: 'follow', error: '', status: '', busy: false, globalText: '', globalSaved: '', globalRevision: 0, globalLoaded: false, globalError: '', globalStatus: '', globalLoading: false, globalConflict: false, globalLatest: null };
    componentDidMount() { this.alive = true; this.loadSettings(); this.loadGlobal(); }
    componentWillUnmount() { this.alive = false; }
    loadSettings = async () => {
      try { const s = await api('/state'); if (this.alive) { this.saved = s.config; this.setState({ config: { ...s.config }, directory: s.directory || [], routing: contextRouteMode(s.config), error: '' }); } }
      catch (e) { if (this.alive) this.setState({ error: e.message }); }
    };
    loadGlobal = async () => {
      if (this.loadingGlobal) return;
      this.loadingGlobal = true;
      const preserveDraft = this.state.globalLoaded;
      this.setState({ globalLoading: true });
      try {
        const g = await api('/context/global');
        if (this.alive) this.setState(preserveDraft ? { globalLatest: g, globalError: '' }
          : { globalText: g.text, globalSaved: g.text, globalRevision: g.revision, globalLoaded: true, globalError: '' });
      }
      catch (e) { if (this.alive) this.setState({ globalError: e.message }); }
      finally { this.loadingGlobal = false; if (this.alive) this.setState({ globalLoading: false }); }
    };
    adoptGlobal = preserveDraft => {
      const latest = this.state.globalLatest;
      if (!latest || this.state.globalLoading || this.state.busy) return;
      this.setState({ globalSaved: latest.text, globalRevision: latest.revision, globalConflict: false, globalError: '', globalStatus: '',
        ...(preserveDraft ? {} : { globalText: latest.text, globalLatest: null }) });
    };
    set = (key, value) => this.setState(s => ({ config: { ...s.config, [key]: value }, status: '', ...(Object.hasOwn(CONTEXT_FREQUENCY_PRESETS.medium, key) ? { custom: true } : {}) }));
    choosePersonality = preset => this.setState(s => ({ config: { ...s.config, ...personalityPatch(s.config, preset) }, status: '' }));
    editPersonality = text => this.setState(s => ({ config: { ...s.config, identityPreset: 'custom', identityPrompt: text, identityCustomPrompt: text }, status: '' }));
    pickPreset = name => {
      if (name === 'custom') { this.setState({ custom: true }); return; }
      this.setState(s => ({ config: { ...s.config, ...contextFrequencyPatch(name) }, custom: false, status: '' }));
    };
    save = async e => {
      e?.preventDefault(); if (this.state.busy || !this.state.config) return;
      const patch = contextSettingsPatch(this.saved, this.state.config); if (!Object.keys(patch).length) return;
      this.setState({ busy: true, error: '', status: '' });
      try { const next = await api('/settings', patch); window.dispatchEvent(new CustomEvent('omd:settings-saved', { detail: next })); if (this.alive) { this.saved = next; this.setState({ config: { ...next }, routing: contextRouteMode(next), custom: false, status: '设置已保存' }); } }
      catch (e) { if (this.alive) this.setState({ error: e.message }); }
      finally { if (this.alive) this.setState({ busy: false }); }
    };
    saveGlobal = async () => {
      if (this.state.busy || !this.state.globalLoaded || this.state.globalConflict || this.state.globalLoading) return;
      this.setState({ busy: true, globalError: '', globalStatus: '' });
      try { const g = await api('/context/global', { text: this.state.globalText, revision: this.state.globalRevision }); if (this.alive) this.setState({ globalText: g.text, globalSaved: g.text, globalRevision: g.revision, globalStatus: '全局背景已保存', globalConflict: false, globalLatest: null }); }
      catch (e) { if (this.alive) this.setState({ globalError: e.message, ...(e.statusCode === 409 ? { globalConflict: true, globalLatest: null } : {}) }); }
      finally { if (this.alive) this.setState({ busy: false }); }
    };
    undo = () => this.setState({ config: { ...this.saved }, routing: contextRouteMode(this.saved), custom: false, error: '', status: '' });
    number(key, label, min = 0, hint, scale = 1, disabled = false) {
      const value = this.state.config[key];
      return field(label, h('input', { type: 'number', required: true, disabled, min, step: 1 / scale, value: value === '' ? '' : (value ?? 0) / scale, onChange: e => {
        const raw = e.target.value, [coefficient, exponent = '0'] = raw.split(/e/i);
        // Scales are powers of ten. Shift the decimal before converting to a
        // number, so 1.001 seconds is 1001 ms without rounding invalid fractions.
        this.set(key, raw === '' ? '' : Number(coefficient + 'e' + (Number(exponent) + Math.log10(scale))));
      } }), hint);
    }
    toggle(key, label, hint) {
      return h('label', { className: 'cx-toggle' }, h('span', null, h('strong', null, label), hint && h('small', null, hint)), h('input', { type: 'checkbox', role: 'switch', checked: Boolean(this.state.config[key]), onChange: e => this.set(key, e.target.checked), 'aria-label': label }));
    }
    chooseRoute = mode => {
      if (mode === 'follow') this.setState(s => ({ routing: mode, config: { ...s.config, backgroundMode: 'unified', unifiedBackground: { provider: '', model: '', temperature: 0.7, effort: 'off' } }, status: '' }));
      else this.setState(s => ({ routing: mode, config: { ...s.config, backgroundMode: mode }, status: '' }));
    };
    route(key, label) {
      const r = this.state.config[key] || { provider: '', model: '', temperature: 0.7, effort: 'off' };
      const models = this.state.directory.find(p => p.id === r.provider)?.models || [];
      const update = (k, v) => this.set(key, { ...r, [k]: v, ...(k === 'provider' ? { model: '' } : {}) });
      const listId = 'cx-model-' + key;
      const efforts = [...new Set(['off', 'low', 'medium', 'high', 'max', r.effort || 'off'])];
      return h('div', { className: 'cx-route' }, h('div', { className: 'cx-route-label' }, icon('layers', 14), label), h('div', { className: 'cx-grid' },
        field('提供方', h('select', { value: r.provider || '', onChange: e => update('provider', e.target.value), 'aria-label': label + '提供方' }, h('option', { value: '' }, '跟随主模型'), !this.state.directory.some(p => p.id === r.provider) && r.provider && h('option', { value: r.provider }, r.provider), ...this.state.directory.map(p => h('option', { value: p.id, key: p.id }, p.name || p.id)))),
        field('模型', h('input', { list: listId, value: r.model || '', placeholder: '跟随主模型', onChange: e => update('model', e.target.value), 'aria-label': label + '模型' })),
        field('推理强度', h('select', { value: r.effort || 'off', onChange: e => update('effort', e.target.value), 'aria-label': label + '推理强度' }, ...efforts.map(v => h('option', { key: v, value: v }, v)))),
        field('Temperature', h('input', { type: 'number', min: 0, max: 2, step: 0.1, value: r.temperature ?? '', placeholder: '提供方默认', onChange: e => update('temperature', e.target.value === '' ? undefined : Number(e.target.value)), 'aria-label': label + 'Temperature' }))), h('datalist', { id: listId }, ...models.map(m => h('option', { key: m.id, value: m.id }))));
    }
    frequency() {
      const c = this.state.config, value = this.state.custom ? 'custom' : contextFrequencyOf(c);
      const desc = { always: '更及时地整理，后台调用相对更多。', medium: '默认档位，积累一段工作后再整理。', slow: '合并更多事件再处理，更新也会更晚。', custom: '保留你的参数，按实际工作节奏调整。' }[value];
      return section('处理频率', '默认使用适中档，可按工作节奏调整。', h(React.Fragment, null,
        segments('更新频率', value, Object.entries(frequencyNames), this.pickPreset),
        h('div', { className: 'cx-frequency-preview' }, h('div', null, h('span', null, '预处理'), h('strong', null, c.digestEvery), h('small', null, '条新事件')), h('div', null, h('span', null, '中枢'), h('strong', null, c.coordinatorEvery), h('small', null, '段新摘要')), h('div', null, h('span', null, '替换间隔'), h('strong', null, c.surgeryCooldownSteps), h('small', null, '步以上'))),
        h('p', { className: 'cx-hint cx-frequency-caption' }, desc, ' 分段窗口 ', String(c.digestWindow), ' 条；中枢最短间隔 ', duration(c.coordinatorMinGapMs), '。'),
        value === 'custom' && h('div', { className: 'cx-custom-fields' }, h('div', { className: 'cx-grid' }, this.number('digestEvery', '预处理频率 · 新事件数', 1), this.number('digestWindow', '目标分段窗口 · 事件数', 1), this.number('coordinatorEvery', '中枢频率 · 新摘要数', 1), this.number('coordinatorMinGapMs', '中枢最短间隔 · 秒', 0, undefined, 1000), this.number('surgeryCooldownSteps', '自动替换最短步数', 0))),
        h('p', { className: 'cx-footnote' }, '档位不会修改模型、会话范围、Trace 或空闲冲刷。已有设置不会在打开页面时被重置。')), badge(frequencyNames[value], 'blue'));
    }
    renderBasic() {
      const c = this.state.config;
      return h(React.Fragment, null,
        section('界面', null, this.toggle('recommendedPluginsPageEnabled', '显示推荐插件页面', '默认开启。关闭仅隐藏设置中的推荐插件页面，不卸载插件，也不改变自动更新设置。保存后立即生效。')),
        this.frequency(),
        section('预处理范围', '默认整窗处理，受保护内容保留，但不阻断范围。', this.toggle('preprocessBoundaries', '按消息边界分段', '默认关闭；开启恢复兼容分段。系统提示词、前置 CoT、近期保留区和完整工具往返始终受保护。')),
        section('自动运行', null, h('div', { className: 'cx-switches' }, this.toggle('contextEnabled', '后台预处理与中枢', '提前生成基础摘要和详细资料，再判断如何替换。'), this.toggle('automaticReplace', '自动应用已完成决定', '在请求边界应用；关闭后仍可手动替换。'))),
        section('Auto Compact', '独立于宿主自动压缩，在 OMD 压缩模式下同样生效。达到阈值立即处理并应用，不等待下一次请求。', h(React.Fragment, null,
          this.toggle('autoCompactEnabled', '启用 Auto Compact', '默认关闭。按当前上下文总 token 数触发，不受普通预处理频率、自动替换开关或冷却步数限制；工具往返与受保护提示词保持完整。'),
          this.number('autoCompactThreshold', '触发阈值 · tokens', 1, '可设任意正整数。当前上下文达到或超过此值时启动；原始记录始终可回查。', 1, !c.autoCompactEnabled),
          field('压缩内容', h('select', { value: c.autoCompactMode || 'detail', disabled: !c.autoCompactEnabled, onChange: e => this.set('autoCompactMode', e.target.value) },
            h('option', { value: 'detail' }, '摘要＋资料'), h('option', { value: 'brief' }, '仅摘要')), '摘要＋资料保留详细文档与附件；仅摘要让资料退出当前上下文，但保留存档。'))),
        section('空闲预处理', '默认关闭；不影响按新事件数量触发的正常预处理，也不影响手动操作。', h(React.Fragment, null,
          this.toggle('idlePreprocessEnabled', '空闲时自动预处理', '仅在会话真正空闲且有待处理内容时触发；模型或工具运行中不计时。'),
          this.number('flushIdleMs', '空闲等待时间 · 秒', 0, '默认 90 秒；关闭开关会取消等待中的任务。已开始的任务正常结束，0 秒也表示禁用。', 1000, !c.idlePreprocessEnabled))),
        section('默认会话范围', '只影响新会话，已开始的会话保持原有绑定。各模式均可明确回查其他会话。', h('div', { className: 'cx-choice-grid' }, ...[['session', 'lock', '会话隔离', '不自动读取共享记忆；会话 Dream 仅在本会话保存。'], ['project', 'layers', '项目共享', '自动读取本项目短记忆，需要细节时向下回查。'],['global','globe','全局记忆','自动读取精简全局记忆和分页项目目录。']].map(([id, name, text, sub]) => h('button', { type: 'button', key: id, className: 'cx-choice', 'aria-pressed': (c.memoryScope === 'full' ? 'project' : c.memoryScope) === id, onClick: () => this.set('memoryScope', id) }, h('div', { className: 'cx-row' }, icon(name, 18), h('span', { className: 'cx-radio' }, icon('check', 11))), h('strong', null, text), h('small', null, sub))))));
    }
    renderExperimental() {
      const c = this.state.config, intervals = [1, 3, 5, 10];
      const customBudgetFrequency = this.state.customBudgetFrequency || !intervals.includes(c.budgetInjectionEvery ?? 1);
      return h(React.Fragment, null,
        section('CoT 前置', null, h(React.Fragment, null,
          this.toggle('traceEnabled', '启用 CoT 前置', '上下文替换时保留提供方已公开的推理文本，不另行生成；可能扩大缓存失效范围。'),
          this.number('traceMaxChars', '推理文本字符上限', 0, '0 保留所选推理全文；正数保留尾部并标注截取。'))),
        section('运行状态', null, h(React.Fragment, null,
          this.toggle('stateHintsEnabled', '向模型提供运行状态', '与待办一起投递时间、上下文与后台任务状态。默认关闭，保存后从下一次请求生效。'),
          this.toggle('budgetHintsEnabled', '向模型提供预算', '默认关闭。用 /预算 token=100k 轮次=30 时间=20m 设置；未设置显示无限制。默认随原状态节点更新，达到预算不强制停止。'),
          c.budgetHintsEnabled && h('div', { style: { paddingInlineStart: 20 } },
            this.toggle('budgetEveryStep', '每轮注入预算', '默认关闭，沿用原状态规则。开启后按所选间隔额外注入预算，不重复投递 Todo 或完整运行状态。'),
            c.budgetEveryStep && h('div', { className: 'cx-grid' },
              field('预算注入频率', h('select', { 'aria-label': '预算注入频率', value: customBudgetFrequency ? 'custom' : String(c.budgetInjectionEvery ?? 1), onChange: e => {
                const custom = e.target.value === 'custom'; this.setState({ customBudgetFrequency: custom });
                if (!custom) this.set('budgetInjectionEvery', Number(e.target.value));
              } }, ...intervals.map(n => h('option', { key: n, value: String(n) }, n === 1 ? '每轮' : `每 ${n} 轮`)), h('option', { value: 'custom' }, '自定义间隔')), '轮次指主执行模型调用；原有节点更新始终保留。'),
              customBudgetFrequency && this.number('budgetInjectionEvery', '调用间隔 · 轮', 1, '每次投递最新预算后重新计数。'))))),
        section('后台任务', null, this.toggle('backgroundTasksEnabled', '优化后台任务与等待', '长命令自动让出、完成结果预览和可中断等待；需要本版配套 DSH 运行时。默认开启。')),
        section('任务约束', null, this.toggle('todoConstraintFirst', '任务约束前置（CFR）', '在系统和待办工具提示词中加入约束提取、推导与核对规则。默认关闭，保存后从下一次模型请求生效。')));
    }
    renderAdvanced() {
      const c = this.state.config;
      return h(React.Fragment, null, h('div', { className: 'cx-info' }, icon('info'), h('p', null, '频率档位可以直接使用。需要精调时再展开；这些选项均对应仍在运行的功能。')),
        fold('预处理窗口', '分段与参考前文；空闲开关见基础设置', h('div', { className: 'cx-grid' }, this.number('digestEvery', '预处理频率 · 新事件数', 1), this.number('digestWindow', '目标分段窗口 · 事件数', 1, '保留完整工具往返，实际段长可能超过窗口。'), this.number('digestLookback', '参考前文 · 事件数', 0))),
        fold('整窗预算与后台额度', '正常触发须同时满足事件间隔和最低文本量，每次只处理一窗；失败重试可补齐多窗。', h('div', { className: 'cx-grid' }, this.number('prepareBatchWindows', '失败重试最多处理窗口数', 1), this.number('prepareContinueTokens', '预处理最低文本量 · 估算 tokens', 1, '每窗都须达到最低文本量；超过它也不能跳过新增事件间隔。不含参考前文与旧摘要。'), this.number('prepareInputTokens', '单窗输入预算 · 估算 tokens', 1), this.number('summaryTargetChars', '基础摘要目标 · 字符', 1, '超过目标两倍时重试，不直接截断原文。'), this.number('backgroundConcurrency', '后台最大并发调用', 1), this.number('backgroundMaxRetries', '自动重试次数', 0))),
        fold('中枢与请求替换', '判断频率、近期原文和自动应用间隔', h(React.Fragment, null, h('div', { className: 'cx-grid' }, this.number('coordinatorEvery', '中枢频率 · 新摘要数', 1), this.number('coordinatorMinGapMs', '中枢最短间隔 · 秒', 0, undefined, 1000), this.number('coordinatorRecentEvents', '中枢近期原文窗口', 0), this.number('surgeryCooldownSteps', '自动替换最短步数', 0), this.number('keepTailEvents', '暂留近期事件数', 0)), this.toggle('requireShorter', '替换后的总量应更小', '将摘要、详细资料和前置 Trace 一起计算。'))),
        fold('资源上限', '0 使用原有默认语义', h('div', { className: 'cx-grid' }, this.number('digestMaxTokens', '预处理输出 Token 上限', 0, '0 使用提供方默认。'), this.number('surgeonMaxTokens', '中枢输出 Token 上限', 0), this.number('jobTimeoutMs', '后台超时 · 秒', 0, '默认 600 秒（10 分钟）；0 不设置插件超时。', 1000))),
        h('p', { className: 'cx-footnote' }, '参数保存后用于后续处理，已归档的原文与资料保持可回查。'));
    }
    renderModels() {
      const c = this.state.config, mode = this.state.routing;
      return h(React.Fragment, null,
        section('后台模型', '主执行模型仍在 DSH 的模型设置中选择。', h(React.Fragment, null, segments('后台模型配置方式', mode, [['follow', '跟随主模型'], ['unified', '统一配置'], ['separate', '分别配置']], this.chooseRoute),
          mode === 'follow' ? h('div', { className: 'cx-info' }, icon('layers'), h('p', null, '预处理 AI 和中枢使用当前会话的提供方与模型。')) : mode === 'unified' ? this.route('unifiedBackground', '预处理与中枢') : h(React.Fragment, null, this.route('background', '预处理 AI'), this.route('surgeon', '中枢 AI')))),
        section('人格', '选择一个搭子，或保留你自己的完整人设。保存后作用于后续请求。', h(React.Fragment, null,
          field('人格预设', h('select', { value: personalityPreset(c), onChange: e => this.choosePersonality(e.target.value) },
            h('option', { value: 'custom' }, '自定义'), ...Object.entries(PERSONALITY_PRESETS).map(([id, preset]) => h('option', { key: id, value: id }, preset.name)), h('option', { value: 'off' }, '关闭人格')),
            '切换内置预设或关闭人格都会保留自定义内容；升级后沿用已有身份设置。'),
          personalityPreset(c) === 'off' ? h('p', { className: 'cx-hint' }, '已关闭人格描述；仍保留原有工作能力和执行规则。') : field('身份提示词', h('textarea', { rows: 9, readOnly: personalityPreset(c) !== 'custom', value: personalityText(c), onChange: e => this.editPersonality(e.target.value), placeholder: '描述助手是谁，以及主要帮助你做什么' }), personalityPreset(c) === 'custom' ? '留空可移除身份描述。自定义内容随设置保存，切换预设不会丢失。' : '这是内置预设原文。可复制到自定义后修改。'),
          Object.hasOwn(PERSONALITY_PRESETS, personalityPreset(c)) && button('复制到自定义', () => this.editPersonality(personalityText(c)), { quiet: true }))));
    }
    renderGlobal() {
      return h(React.Fragment, null, alert(this.state.globalError, true),
        h('div', { className: 'cx-catalog-banner' }, icon('globe', 20), h('div', null, h('strong', null, '只由你维护的全局背景'), h('small', null, '项目会话可读取；私有会话不读取。'))),
        section('固定背景', '后台 AI 不自动新增、补充或改写这段内容。', field('全局固定背景', h('textarea', { className: 'cx-global-editor', rows: 14, value: this.state.globalText, disabled: !this.state.globalLoaded, onChange: e => this.setState({ globalText: e.target.value, globalStatus: '' }), placeholder: '写下适用于项目会话的固定背景，例如工作习惯、环境约定。' })), badge(fmt(this.state.globalText.length) + ' 字符')),
        !this.state.globalLoaded && button('重新读取全局背景', this.loadGlobal, { icon: 'refresh', disabled: this.state.globalLoading }),
        this.state.globalConflict && h('div', { className: 'cx-info' }, icon('info'), h('div', null,
          h('p', null, '草稿已保留。读取最新版本后，可合并两份内容再保存，或直接使用最新内容。'),
          button('读取最新版本', this.loadGlobal, { icon: 'refresh', disabled: this.state.globalLoading }))),
        this.state.globalLatest && section('比较最新版本', '下方为其他窗口已保存的内容；上方仍是你的草稿。', h(React.Fragment, null,
          field('其他窗口保存的内容', h('textarea', { rows: 5, readOnly: true, value: this.state.globalLatest.text })),
          h('div', { className: 'cx-actions' }, button('保留草稿，继续编辑', () => this.adoptGlobal(true), { disabled: !this.state.globalConflict || this.state.globalLoading }),
            button('使用最新内容', () => this.adoptGlobal(false), { disabled: this.state.globalLoading })))),
        h('div', { className: 'cx-info' }, icon('lock'), h('p', null, '其他窗口已修改这段文字时，保存会提示冲突，不会覆盖对方内容。')));
    }
    render() {
      const { config: c, page, busy, error, status } = this.state;
      const dirty = c && Object.keys(contextSettingsPatch(this.saved, c)).length > 0;
      const isGlobal = page === 'global', globalDirty = this.state.globalText !== this.state.globalSaved;
      const footStatus = isGlobal ? this.state.globalStatus || (globalDirty ? '有未保存的更改' : '仅用户手动维护') : status || (dirty ? '有未保存的更改' : '已与当前设置同步');
      return h('div', { className: 'cx-panel cx-settings', 'data-context-ui': CONTEXT_UI_VERSION }, heading('偏好设置', '模型、上下文与项目摘要', 'settings'),
        pageTabs(page, [['basic', '常用'], ['components', '基础组件'], ['models', '模型与身份'], ['experimental', '实验性功能'], ['advanced', '高级'], ['global', '全局背景']], value => this.setState({ page: value })),
        page === 'components' ? h(ComponentsPanel) : !c ? h('div', { className: 'cx-body' }, alert(error, true), empty('正在读取设置', '保留已保存的参数，不自动套用任何档位。'), error && button('重试', this.loadSettings, { icon: 'refresh' })) : h('form', { className: 'cx-settings-form', onSubmit: isGlobal ? e => { e.preventDefault(); this.saveGlobal(); } : this.save },
          h('div', { className: 'cx-body' }, alert(error, true), h('fieldset', { className: 'cx-fields', disabled: busy }, page === 'basic' ? this.renderBasic() : page === 'models' ? this.renderModels() : page === 'experimental' ? this.renderExperimental() : page === 'advanced' ? this.renderAdvanced() : this.renderGlobal())),
          h('footer', { className: 'cx-savebar' }, h('span', { className: 'cx-save-status', role: 'status' }, icon(status || this.state.globalStatus ? 'check' : 'info', 13), footStatus), h('div', { className: 'cx-actions' },
            button('撤销', isGlobal ? () => this.setState({ globalText: this.state.globalSaved, globalStatus: '' }) : this.undo, { quiet: true, disabled: busy || !(isGlobal ? globalDirty : dirty) }),
            h('button', { type: 'submit', className: 'cx-btn cx-primary', disabled: busy || !(isGlobal ? globalDirty && this.state.globalLoaded && !this.state.globalConflict && !this.state.globalLoading : dirty) }, icon(busy ? 'clock' : 'check'), busy ? '保存中…' : isGlobal ? '保存全局背景' : '保存设置')))));
    }
  }
  class ScopeControl extends React.Component {
    state = { data: null, error: '', busy: false, loading: false };
    revision = 0;
    componentDidMount() { this.alive = true; this.load(); }
    componentDidUpdate(prev) {
      if (prev.sessionId !== this.props.sessionId) {
        ++this.revision; this.writing = null;
        this.setState({ data: null, error: '', busy: false, loading: false }, this.load);
      } else if (prev.locked !== this.props.locked) this.load();
    }
    componentWillUnmount() { this.alive = false; ++this.revision; this.writing = null; }
    load = async () => {
      if (this.writing) return;
      const id = this.props.sessionId, ticket = ++this.revision;
      const active = () => this.alive && id === this.props.sessionId && ticket === this.revision;
      this.setState({ loading: true });
      try { const data = await api('/scope' + suffix(id)); if (active()) this.setState({ data, error: '' }); }
      catch (e) { if (active()) this.setState({ data: null, error: e.message }); }
      finally { if (active()) this.setState({ loading: false }); }
    };
    change = async scope => {
      if (this.writing) return;
      const id = this.props.sessionId, write = {};
      this.writing = write; ++this.revision;
      const active = () => this.alive && id === this.props.sessionId && this.writing === write;
      this.setState({ busy: true, loading: false, error: '' });
      try { const data = await api('/scope' + suffix(id), { scope }); if (active()) this.setState({ data }); }
      catch (e) {
        if (active()) {
          this.setState({ error: e.message });
          // Recover the actual selection without erasing the failed write.
          try { const data = await api('/scope' + suffix(id)); if (active()) this.setState({ data }); }
          catch (recoveryError) { if (active()) this.setState({ data: null, error: e.message + '；重新读取范围失败：' + recoveryError.message }); }
        }
      } finally { if (active()) { this.writing = null; this.setState({ busy: false, loading: false }); } }
    };
    render() {
      const d = this.state.data;
      return h('div', { className: 'cx-scope-chip', title: this.state.error || (d?.locked || this.props.locked ? '本会话已绑定范围' : '新会话的记忆范围') }, icon(d?.scope === 'global'?'globe':d?.scope === 'project' ? 'layers' : 'lock', 13),
        d ? h('select', { 'aria-label': '会话范围', disabled: d.locked || this.props.locked || this.state.busy, value: d.scope, onChange: e => this.change(e.target.value) }, h('option', { value: 'session' }, '会话隔离'), h('option', { value: 'project' }, '项目共享'),h('option',{value:'global'},'全局记忆'))
          : h('span', { role: 'status' }, this.state.error ? '范围暂不可读' : '读取范围…'),
        this.state.error && button('', this.load, { label: '重试会话范围', title: this.state.error, icon: 'refresh', className: 'cx-scope-retry', disabled: this.state.busy || this.state.loading }));
    }
  }
  const ScopeChip = props => { const locked = props.useSessions(s => s.byId[props.sessionId]?.blank === false); return h(ScopeControl, { ...props, locked }); };
  return { ContextSettings, ScopeChip, applyStyle(ctx) {
    ctx.effect(() => {
      const style = document.createElement('style');
      style.dataset.plugin = 'trisoul-context-v1'; style.dataset.version = CONTEXT_UI_VERSION;
      style.textContent = CONTEXT_CSS; document.head.appendChild(style);
      return () => style.remove();
    });
  } };
}

export const CONTEXT_CSS = `
.cx-panel,.cx-integrated,.cx-scope-chip{
  --cx-bg:var(--dsw-alias-bg-base,Canvas);--cx-text:var(--dsw-alias-label-primary,CanvasText);
  --cx-muted:var(--dsw-alias-label-tertiary,GrayText);--cx-line:color-mix(in srgb,var(--cx-text) 11%,var(--cx-bg));
  --cx-soft:color-mix(in srgb,var(--cx-text) 3%,var(--cx-bg));--cx-hover:color-mix(in srgb,var(--cx-text) 5%,var(--cx-bg));
  --cx-blue:color-mix(in srgb,#3978e7 80%,var(--cx-text));--cx-tint:color-mix(in srgb,var(--cx-blue) 7%,var(--cx-bg));
  --cx-red:var(--dsw-alias-state-error-primary,#be555e);color:var(--cx-text);font-family:inherit;font-variant-numeric:tabular-nums;
}
.cx-panel,.cx-integrated,.cx-panel *,.cx-integrated *{box-sizing:border-box}
.cx-integrated{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--cx-bg);overflow:hidden}
.cx-integrated>div:not([hidden]){flex:1;min-height:0;overflow:hidden}.cx-integrated [hidden]{display:none!important}
.cx-panel{position:relative;isolation:isolate;container-type:inline-size;container-name:cx;height:100%;min-height:0;width:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--cx-bg);font-size:13px;line-height:1.65}
.cx-panel h2,.cx-panel h3,.cx-panel h4,.cx-panel p{margin:0}.cx-panel svg{flex-shrink:0;vertical-align:middle}
.cx-panel h2{font-size:17px;font-weight:650;letter-spacing:-.4px;line-height:1.4}.cx-panel h3{font-size:13px;font-weight:630;line-height:1.5}
.cx-panel h4{font-size:12px;font-weight:600}.cx-panel small{font-size:11px;color:var(--cx-muted);line-height:1.6}
.cx-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:21px 22px 18px;flex-shrink:0}
.cx-head-title{display:flex;gap:12px;align-items:center;min-width:0}.cx-head-title>div{min-width:0}.cx-head p{font-size:11px;color:var(--cx-muted);margin-top:4px}
.cx-head-icon{width:33px;height:33px;border:1px solid var(--cx-line);border-radius:10px;background:var(--cx-soft);display:grid;place-items:center;color:var(--cx-muted);flex-shrink:0}
.cx-body{flex:1;min-height:0;overflow:auto;padding:0 22px 23px;scrollbar-width:thin;scrollbar-color:var(--cx-line) transparent;overscroll-behavior:contain}
.cx-body:has(>.cx-section:first-child){padding-top:0}.cx-section{padding:21px 0;border-bottom:1px solid var(--cx-line)}.cx-section:last-child{border-bottom:0}
.cx-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.cx-section-head>div{min-width:0}.cx-section-head p{font-size:11px;color:var(--cx-muted);margin-top:4px}
.cx-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-size:12px;line-height:1.5;min-height:32px;padding:6px 11px;border:1px solid var(--cx-line);border-radius:8px;background:var(--cx-bg);color:var(--cx-text);white-space:nowrap;cursor:pointer;transition:background .14s,border-color .14s}
.cx-btn:hover:not(:disabled){background:var(--cx-hover);border-color:color-mix(in srgb,var(--cx-text) 22%,var(--cx-bg))}.cx-btn.cx-primary{background:#2864d7;border-color:#2864d7;color:#fff;box-shadow:0 1px 2px #15347110}.cx-btn.cx-primary:hover:not(:disabled){background:#2158c3;border-color:#2158c3}
.cx-btn.cx-quiet{background:transparent;border-color:transparent;color:var(--cx-muted)}.cx-btn.cx-quiet:hover:not(:disabled){color:var(--cx-text);background:var(--cx-hover);border-color:transparent}
.cx-btn:disabled{opacity:.45;cursor:default;box-shadow:none}.cx-btn.cx-primary:disabled{color:var(--cx-muted);background:var(--cx-soft);border-color:var(--cx-line);opacity:.8}
.cx-panel button:focus-visible,.cx-panel summary:focus-visible,.cx-navigation button:focus-visible,.cx-scope-chip:focus-within{outline:2px solid var(--cx-blue);outline-offset:3px}
.cx-panel input:not([type=checkbox]),.cx-panel select,.cx-panel textarea{width:100%;min-width:0;border:1px solid var(--cx-line);border-radius:8px;padding:9px 11px;background:var(--cx-bg);color:var(--cx-text);font:inherit;font-size:12px;line-height:1.6;outline:none;transition:border-color .15s,box-shadow .15s}
.cx-panel input:not([type=checkbox]):focus,.cx-panel select:focus,.cx-panel textarea:focus{border-color:var(--cx-blue);box-shadow:0 0 0 3px var(--cx-tint)}.cx-panel input::placeholder,.cx-panel textarea::placeholder{color:var(--cx-muted);opacity:.75}
.cx-panel textarea{resize:vertical;line-height:1.9;min-height:150px}.cx-panel input[type=checkbox]{accent-color:#2864d7;width:14px;height:14px;margin:0;flex-shrink:0}.cx-panel input:disabled,.cx-panel textarea:disabled{opacity:.65}
.cx-field{display:flex;flex-direction:column;gap:7px;min-width:0;margin:9px 0}.cx-field>span{font-size:11px;color:var(--cx-muted)}.cx-field small{font-size:10px}
.cx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 16px}.cx-fields{border:0;margin:0;padding:0;min-width:0}.cx-fields:disabled{opacity:.72}
.cx-settings-form{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
.cx-navigation{display:flex;gap:3px;padding:7px 10px;border-bottom:1px solid var(--cx-line);flex-shrink:0;overflow:auto;scrollbar-width:none}
.cx-navigation button{display:flex;align-items:center;justify-content:center;gap:6px;flex:1;min-width:0;white-space:nowrap;font:inherit;font-size:12px;color:var(--cx-muted);border:1px solid transparent;border-radius:8px;background:transparent;padding:8px 5px;cursor:pointer}
.cx-navigation button[aria-current=page]{color:var(--cx-blue);background:var(--cx-tint);border-color:color-mix(in srgb,var(--cx-blue) 16%,var(--cx-bg));font-weight:600}.cx-navigation button:hover{background:var(--cx-hover)}
.cx-tabs{display:flex;gap:24px;padding:0 22px;border-bottom:1px solid var(--cx-line);flex-shrink:0;overflow:auto;scrollbar-width:none}.cx-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;color:var(--cx-muted);font:inherit;font-size:12px;cursor:pointer;padding:10px 0 12px;white-space:nowrap}
.cx-tabs button[aria-current=page]{border-bottom-color:var(--cx-blue);color:var(--cx-blue);font-weight:600}
.cx-segments{display:flex;min-width:0;padding:3px;gap:3px;background:var(--cx-hover);border-radius:9px}.cx-segments button{flex:1;border:1px solid transparent;border-radius:6px;color:var(--cx-muted);background:transparent;padding:7px 9px;font:inherit;font-size:12px;line-height:1.45;white-space:nowrap;cursor:pointer}
.cx-segments button[aria-pressed=true]{background:var(--cx-bg);border-color:var(--cx-line);color:var(--cx-blue);box-shadow:0 1px 3px #00000008;font-weight:600}
.cx-segments button:disabled{opacity:.6;cursor:default}.cx-compression-mode{flex-wrap:wrap;margin-bottom:8px}.cx-compression-hint{margin-bottom:10px!important}
.cx-frequency-preview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:15px 0 10px}.cx-frequency-preview>div{display:flex;align-items:baseline;gap:5px;flex-wrap:wrap;border:1px solid var(--cx-line);border-radius:10px;background:var(--cx-soft);padding:11px 13px}
.cx-frequency-preview span{width:100%;font-size:11px;color:var(--cx-muted)}.cx-frequency-preview strong{font-size:24px;line-height:1.2;font-weight:580;letter-spacing:-.7px;color:var(--cx-text)}.cx-frequency-preview small{font-size:10px}
.cx-hint{font-size:11px;color:var(--cx-muted);line-height:1.75}.cx-panel .cx-frequency-caption{margin-top:10px}.cx-custom-fields{margin-top:12px;padding-top:8px;border-top:1px dashed var(--cx-line)}
.cx-footnote{display:flex;gap:6px;font-size:10px;line-height:1.8;color:var(--cx-muted);margin-top:16px!important}.cx-footnote svg{margin-top:3px;flex-shrink:0}
.cx-toggle{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 0;cursor:pointer}.cx-toggle+.cx-toggle{border-top:1px solid var(--cx-line)}.cx-toggle>span{min-width:0}.cx-toggle strong{display:block;font-size:12px;font-weight:500}.cx-toggle small{display:block;font-size:11px;color:var(--cx-muted);margin-top:4px;line-height:1.65}
.cx-panel .cx-toggle input{appearance:none;position:relative;width:34px;height:20px;border-radius:20px;background:color-mix(in srgb,var(--cx-text) 17%,var(--cx-bg));border:1px solid transparent;cursor:pointer;transition:background .14s}
.cx-panel .cx-toggle input::after{content:'';position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px #0002;transition:transform .14s}.cx-panel .cx-toggle input:checked{background:var(--omd-switch-on,var(--cx-blue))}.cx-panel .cx-toggle input:checked::after{transform:translateX(14px)}.cx-panel .cx-toggle input:focus-visible{outline:2px solid var(--cx-blue);outline-offset:3px}
.cx-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cx-choice{border:1px solid var(--cx-line);border-radius:11px;padding:14px;background:var(--cx-bg);color:var(--cx-text);font:inherit;text-align:left;cursor:pointer;min-width:0}
.cx-choice[aria-pressed=true]{border-color:color-mix(in srgb,var(--cx-blue) 58%,var(--cx-line));background:var(--cx-tint)}.cx-choice>.cx-row{color:var(--cx-muted);margin-bottom:12px}.cx-choice[aria-pressed=true]>.cx-row{color:var(--cx-blue)}.cx-choice strong{display:block;font-size:12px;font-weight:600;margin-bottom:5px}.cx-choice small{font-size:10px;display:block;line-height:1.7}
.cx-radio{display:grid;place-items:center;width:14px;height:14px;border:1px solid var(--cx-line);border-radius:50%}.cx-radio svg{visibility:hidden}.cx-choice[aria-pressed=true] .cx-radio{color:#fff;background:#2864d7;border-color:#2864d7}.cx-choice[aria-pressed=true] .cx-radio svg{visibility:visible}
.cx-route{margin-top:15px;border:1px solid var(--cx-line);border-radius:11px;padding:14px}.cx-route-label{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;margin-bottom:7px;color:var(--cx-muted)}
.cx-fold{margin:12px 0;border:1px solid var(--cx-line);border-radius:11px;overflow:hidden}.cx-fold>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px;cursor:pointer;list-style:none}.cx-fold>summary::-webkit-details-marker{display:none}.cx-fold>summary strong{display:block;font-size:12px;font-weight:550}.cx-fold>summary small{display:block;font-size:10px;color:var(--cx-muted);margin-top:4px}.cx-fold>summary>svg{color:var(--cx-muted);transition:transform .14s}.cx-fold[open]>summary>svg{transform:rotate(90deg)}.cx-fold[open]>summary{border-bottom:1px solid var(--cx-line);background:var(--cx-soft)}.cx-fold-body{padding:11px 15px 16px}
.cx-component-row{padding:14px 0;border-top:1px solid var(--cx-line)}.cx-component-row>.cx-row{justify-content:space-between}.cx-component-project{padding:10px 12px;margin:8px 0;background:var(--cx-soft);border-radius:8px}.cx-component-path{display:block;min-width:0;overflow-wrap:anywhere;font-size:11px}.cx-component-project>.cx-row{align-items:flex-start;justify-content:space-between;gap:12px}.cx-components>.cx-hint{margin-bottom:20px}
.cx-info{display:flex;align-items:flex-start;gap:10px;margin:16px 0;padding:12px 14px;border-radius:9px;background:var(--cx-soft);color:var(--cx-muted);font-size:11px;line-height:1.8}.cx-info svg{margin-top:2px;color:var(--cx-blue)}
.cx-pill{display:inline-flex;align-items:center;white-space:nowrap;font-size:10px;line-height:1.6;font-weight:500;padding:3px 8px;border:1px solid var(--cx-line);border-radius:6px;background:var(--cx-soft);color:var(--cx-muted)}.cx-tone-blue{color:var(--cx-blue);border-color:color-mix(in srgb,var(--cx-blue) 18%,var(--cx-bg));background:var(--cx-tint)}
.cx-savebar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0;padding:12px 20px;border-top:1px solid var(--cx-line);background:var(--cx-bg);box-shadow:0 -6px 18px color-mix(in srgb,var(--cx-bg) 85%,transparent)}.cx-save-status{display:flex;align-items:center;gap:6px;min-width:0;color:var(--cx-muted);font-size:10px}.cx-actions{display:flex;align-items:center;gap:7px;flex-shrink:0;flex-wrap:wrap}.cx-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.cx-alert{display:flex;align-items:flex-start;gap:9px;font-size:12px;margin:10px 0 14px;padding:12px;border:1px solid color-mix(in srgb,var(--cx-blue) 24%,var(--cx-bg));border-radius:9px;background:var(--cx-tint);color:var(--cx-text);overflow-wrap:anywhere}.cx-alert svg{margin-top:2px;color:var(--cx-blue)}.cx-error{border-color:color-mix(in srgb,var(--cx-red) 32%,var(--cx-bg));background:color-mix(in srgb,var(--cx-red) 6%,var(--cx-bg));color:var(--cx-red)}.cx-error svg{color:var(--cx-red)}
.cx-action-error{position:sticky;top:0;z-index:2;align-items:center;background:color-mix(in srgb,var(--cx-red) 6%,var(--cx-bg))}.cx-action-error>span{flex:1;min-width:0}.cx-action-error:focus{outline:2px solid var(--cx-blue);outline-offset:-2px}
.cx-empty{text-align:center;padding:42px 18px;color:var(--cx-muted)}.cx-empty-icon{display:inline-grid;place-items:center;width:46px;height:46px;background:var(--cx-soft);border:1px solid var(--cx-line);border-radius:14px;margin-bottom:14px}.cx-empty h3{font-size:13px;color:var(--cx-text);margin-bottom:8px}.cx-empty p{font-size:11px;line-height:1.8;max-width:32em;margin:auto}
.cx-pipeline-card{padding:16px;border:1px solid var(--cx-line);border-radius:13px;background:linear-gradient(155deg,var(--cx-tint),var(--cx-bg) 60%)}.cx-eyebrow{font-size:11px;font-weight:600;color:var(--cx-muted)}
.cx-stages{display:flex;justify-content:space-between;gap:6px;align-items:center;margin:22px 0}.cx-stages>svg{color:var(--cx-muted);opacity:.6}.cx-stage{display:flex;align-items:center;gap:7px;min-width:0}.cx-stage strong{display:block;font-size:11px;font-weight:600}.cx-stage small{font-size:9px;display:block;margin-top:2px;white-space:nowrap}
.cx-dot{display:block;width:7px;height:7px;border-radius:50%;background:color-mix(in srgb,var(--cx-blue) 35%,var(--cx-bg));flex-shrink:0}.cx-pulse{background:var(--cx-blue);box-shadow:0 0 0 4px var(--cx-tint);animation:cx-pulse 1.5s ease-in-out infinite}@keyframes cx-pulse{50%{opacity:.45}}
.cx-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px;padding:15px 0;border-top:1px solid var(--cx-line);border-bottom:1px solid var(--cx-line)}.cx-metrics>div{text-align:center;border-right:1px solid var(--cx-line)}.cx-metrics>div:last-child{border:0}.cx-metrics strong{display:block;font-size:23px;font-weight:550;line-height:1.35;letter-spacing:-.7px}.cx-metrics span{display:block;font-size:10px;margin-top:4px;color:var(--cx-muted)}.cx-pipeline-action{margin-top:14px;flex-wrap:wrap;justify-content:flex-end}.cx-pipeline-action small{margin-right:auto;font-size:10px}
.cx-compact-choice{padding:12px 0}.cx-compact-choice+.cx-compact-choice{border-top:1px solid var(--cx-line)}.cx-compact-choice>.cx-row{flex-wrap:wrap;margin-bottom:8px}.cx-compact-choice code{font-size:11px}
.cx-list-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:23px 0 12px}.cx-list-head .cx-segments button{padding:4px 9px;font-size:10px}.cx-card{border:1px solid var(--cx-line);border-radius:11px;padding:14px;margin-bottom:10px;background:var(--cx-bg)}.cx-card.cx-selected{border-color:color-mix(in srgb,var(--cx-blue) 60%,var(--cx-line));background:var(--cx-tint)}
.cx-record-check{display:flex;gap:7px;align-items:center;min-width:0;cursor:pointer}.cx-record-check time{font-size:10px;color:var(--cx-muted)}.cx-prose{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85;font-size:12px}.cx-record>.cx-prose{margin:12px 0 9px}.cx-record-footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.cx-record-footer>small{font-size:10px;min-width:0;overflow-wrap:anywhere}.cx-panel code{font:10px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere;color:var(--cx-muted)}.cx-record-footer .cx-btn{font-size:10px;padding:4px 6px;min-height:27px}
.cx-decision{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0}.cx-decision p{width:100%;font-size:11px;color:var(--cx-muted)}.cx-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font:11px/1.8 ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--cx-soft);border:1px solid var(--cx-line);border-radius:9px;padding:14px;max-height:480px;overflow:auto;margin:10px 0;color:var(--cx-text)}.cx-log-line{font-size:11px;line-height:1.8;padding:8px 0;border-top:1px solid var(--cx-line)}.cx-log-line time{color:var(--cx-muted)}
.cx-selection{font-size:11px}.cx-selection .cx-actions{flex-wrap:nowrap}.cx-selection .cx-btn{font-size:11px;padding:6px 8px}
.cx-catalog-banner{display:flex;align-items:center;gap:12px;padding:15px;border:1px solid var(--cx-line);border-radius:12px;background:var(--cx-soft);margin:3px 0 17px}.cx-catalog-banner>svg{color:var(--cx-blue)}.cx-catalog-banner strong{display:block;font-size:12px;font-weight:550}.cx-catalog-banner small{display:block;margin-top:4px;font-size:10px}
.cx-search{display:flex;align-items:center;gap:8px;border:1px solid var(--cx-line);border-radius:9px;padding:0 11px;color:var(--cx-muted);margin:16px 0 22px}.cx-search:focus-within{border-color:var(--cx-blue);box-shadow:0 0 0 3px var(--cx-tint)}.cx-panel .cx-search input{border:0;box-shadow:none!important;background:transparent;padding:9px 0;outline:none}
.cx-session{margin:22px 0}.cx-session-head{display:flex;align-items:center;gap:10px;margin-bottom:15px}.cx-session-head>div{min-width:0;flex:1}.cx-session-head h3{overflow-wrap:anywhere;font-size:12px}.cx-session-head small{font-size:9px}.cx-session-icon{display:grid;place-items:center;width:30px;height:32px;border:1px solid var(--cx-line);border-radius:8px;color:var(--cx-muted);flex-shrink:0}
.cx-timeline{margin-left:15px;padding-left:22px;border-left:1px solid var(--cx-line)}.cx-timeline-record{position:relative;padding:0 0 19px;margin-bottom:5px}.cx-timeline-record:last-child{padding-bottom:0}.cx-timeline-dot{position:absolute;top:6px;left:-27px;width:9px;height:9px;border:2px solid var(--cx-bg);border-radius:50%;background:color-mix(in srgb,var(--cx-blue) 65%,var(--cx-bg));box-shadow:0 0 0 1px var(--cx-line)}.cx-timeline-record time{font-size:10px;color:var(--cx-muted)}.cx-timeline-record>.cx-prose{margin:7px 0 8px}.cx-timeline-record .cx-record-footer{padding-bottom:9px;border-bottom:1px solid var(--cx-line)}
.cx-reader{position:absolute;inset:0;z-index:5;background:var(--cx-bg);display:flex;flex-direction:column;outline:none}.cx-reader-head{display:flex;align-items:center;gap:10px;padding:12px 17px;border-bottom:1px solid var(--cx-line);flex-shrink:0}.cx-reader-head>strong{flex:1;font-size:13px}.cx-record-meta{display:flex;flex-direction:column;gap:6px;padding:20px 0 0}.cx-record-meta code{font-size:11px}.cx-document{padding:21px 0;border-bottom:1px solid var(--cx-line)}.cx-document pre{max-height:none;margin:0}.cx-global-editor{min-height:295px!important}
.cx-scope-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid var(--cx-line);border-radius:7px;max-width:140px;line-height:1.4;font-size:11px;color:var(--cx-muted);background:var(--cx-bg)}.cx-scope-chip select{border:0;background:transparent;color:inherit;font:inherit;padding:0;min-width:0;outline:none;cursor:pointer}.cx-scope-chip select:disabled{opacity:1;appearance:none;cursor:default}
.cx-scope-chip .cx-scope-retry{width:22px;min-width:22px;height:22px;padding:3px;border:0;background:transparent;color:inherit}
@container cx (max-width:400px){.cx-head{padding:18px 16px 15px}.cx-body{padding:0 16px 20px}.cx-tabs{padding:0 16px;gap:19px}.cx-savebar{padding:11px 15px}.cx-frequency-preview>div{padding:10px}.cx-frequency-preview strong{font-size:22px}.cx-frequency-preview small{font-size:9px}.cx-grid{gap:2px 11px}.cx-choice{padding:12px}.cx-stage{gap:5px}.cx-stage small{font-size:8.5px}.cx-stage strong{font-size:10px}.cx-pipeline-card{padding:13px}.cx-pipeline-action{justify-content:flex-start}.cx-pipeline-action small{width:100%}.cx-record{padding:12px}.cx-selection{gap:6px;flex-wrap:wrap}.cx-selection .cx-actions{margin-left:auto}.cx-save-status{max-width:45%}.cx-head-title{gap:9px}}
@container cx (max-width:320px){.cx-grid{grid-template-columns:1fr}.cx-choice-grid{grid-template-columns:1fr}.cx-settings .cx-segments{flex-direction:column}.cx-tabs{gap:14px}.cx-tabs button{font-size:11px}.cx-frequency-preview{gap:5px}.cx-frequency-preview>div{padding:8px}.cx-frequency-preview small{width:100%}.cx-stage .cx-dot{display:none}.cx-save-status svg{display:none}.cx-record-check time{font-size:9px}}
@media(prefers-reduced-motion:reduce){.cx-panel *{animation:none!important;transition:none!important}}
`;
