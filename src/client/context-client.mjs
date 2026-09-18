import { CONTEXT_FREQUENCY_PRESETS } from '../frequency.mjs';
export { CONTEXT_FREQUENCY_PRESETS } from '../frequency.mjs';
import { createPoller } from './polling.mjs';
import { DEFAULT_IDENTITY } from '../cc-adaptation/identity.mjs';

/* Keep the original workbench and host theme. These panels replace only the
 * context/summary settings and slots whose semantics changed in Context v1. */
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
    const response = await fetch('/trisoul-x/api' + path, body === undefined ? { signal } : { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw Error(data.error || 'HTTP ' + response.status); return data;
  };
  const suffix = id => '?session=' + encodeURIComponent(id || '');
  const fmt = value => Number(value || 0).toLocaleString();
  const date = value => value == null ? '时间未记录' : new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const time = value => value == null ? '—' : new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const names = { raw: '原文', keep: '保留原文', detail: '摘要＋详细资料', brief: '仅基础摘要', merge: '合并替换', session: '会话隔离', project: '项目共享' };
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
  const heading = (text, sub, name, action) => h('header', { className: 'cx-head' }, h('div', { className: 'cx-head-title' }, h('span', { className: 'cx-head-icon' }, icon(name, 19)), h('div', null, h('h2', null, text), h('p', null, sub))), action);
  const field = (label, input, hint) => h('label', { className: 'cx-field' }, h('span', null, label), React.cloneElement(input, { 'aria-label': input.props['aria-label'] || label }), hint && h('small', null, hint));
  const section = (text, sub, children, right) => h('section', { className: 'cx-section' }, h('div', { className: 'cx-section-head' }, h('div', null, h('h3', null, text), sub && h('p', null, sub)), right), children);
  const fold = (text, sub, children, open = false) => h('details', { className: 'cx-fold', open: open || undefined }, h('summary', null, h('span', null, h('strong', null, text), sub && h('small', null, sub)), icon('chevron', 14)), h('div', { className: 'cx-fold-body' }, children));
  const empty = (text, sub, name = 'layers') => h('div', { className: 'cx-empty' }, h('span', { className: 'cx-empty-icon' }, icon(name, 23)), h('h3', null, text), h('p', null, sub));
  const segments = (label, value, options, change) => h('div', { className: 'cx-segments', role: 'group', 'aria-label': label }, ...options.map(([id, text]) => h('button', { key: id, type: 'button', 'aria-pressed': id === value, onClick: () => change(id) }, text)));
  const pageTabs = (value, options, change) => h('nav', { className: 'cx-tabs', 'aria-label': '设置分类' }, ...options.map(([id, text]) => h('button', { key: id, type: 'button', 'aria-current': id === value ? 'page' : undefined, onClick: () => change(id) }, text)));
  const duration = ms => Number(ms) >= 60000 ? Number(ms) / 60000 + ' 分钟' : Number(ms || 0) / 1000 + ' 秒';
  const rangeLabel = ranges => (ranges || []).map(x => `#${x.from}–${x.to}`).join(' · ');
  const summaryPreview = text => h(React.Fragment, null, h('p', { className: 'cx-prose' }, text.length > 240 ? text.slice(0, 240) + '…' : text), text.length > 240 && fold('展开完整摘要', text.length + ' 字符', h('p', { className: 'cx-prose' }, text)));
  const assetUrl = (r, i) => '/trisoul-x/api/context/asset' + suffix(r.requestSessionId || r.sessionId) + '&id=' + encodeURIComponent(r.id) + '&asset=' + (i + 1);

  // Document detail is a reader, not an ever-growing section under the list.
  class DocumentReader extends React.Component {
    componentDidMount() { this.previousFocus = document.activeElement; this.root?.focus(); }
    componentWillUnmount() { this.previousFocus?.isConnected && this.previousFocus.focus?.(); }
    render() {
      const r = this.props.record;
      return h('section', { className: 'cx-reader', ref: el => { this.root = el; }, tabIndex: -1, role: 'dialog', 'aria-modal': true, 'aria-label': '详细资料', onKeyDown: e => {
          if (e.key === 'Escape') this.props.onClose();
          if (e.key === 'Tab') {
            const items = [...this.root.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),summary,[tabindex="0"]')].filter(el => el.getClientRects().length);
            const first = items[0], last = items.at(-1);
            if (e.shiftKey && (document.activeElement === first || document.activeElement === this.root)) { e.preventDefault(); last?.focus(); }
            else if (!e.shiftKey && (document.activeElement === last || document.activeElement === this.root)) { e.preventDefault(); first?.focus(); }
          }
        } },
        h('header', { className: 'cx-reader-head' }, button('返回', this.props.onClose, { icon: 'arrow', quiet: true }), h('strong', null, '摘要与详细资料'), badge((r.documents || []).length + ' 份')),
        h('div', { className: 'cx-body', 'data-testid': 'record-documents' }, h('div', { className: 'cx-record-meta' }, h('code', null, r.id), h('small', null, date(r.timeStart) + ' — ' + time(r.timeEnd))),
          section('基础摘要', null, h('p', { className: 'cx-prose' }, r.summary)),
          ...(r.documents || []).map((d, i) => h('article', { className: 'cx-document', key: i }, h('div', { className: 'cx-section-head' }, h('h3', null, d.title), badge(String(i + 1).padStart(2, '0'))), h('pre', null, d.text))),
          ...(r.assets || []).map((asset, i) => fold((asset.block.attachment?.name || asset.block.type) + ' · 附件 ' + (i + 1), (asset.sources || []).map(x => x.sessionId + '#' + x.seq).join('、'), h('div', null, asset.block.type === 'image' && h('img', { src: assetUrl(r, i), alt: '原始图片 ' + (i + 1), loading: 'lazy', style: { maxWidth: '100%', height: 'auto' } }), h('a', { href: assetUrl(r, i), target: '_blank', rel: 'noopener noreferrer' }, '打开原件')))),
          !(r.documents || []).length && empty('这份摘要没有附加文档', '基础摘要和来源仍可查看。', 'context'),
          fold('来源与版本', rangeLabel(r.ranges), h('div', { className: 'cx-prose' }, h('p', null, '原始区间：' + rangeLabel(r.ranges)), h('p', null, '摘要编号：' + r.id), (r.parents || []).length > 0 && h('p', null, '合并来源：' + r.parents.join('、'))))));
    }
  }
  class PollPanel extends React.Component {
    constructor(props) { super(props); this.state = { data: null, error: '', notice: '', busy: false, detail: null }; this.epoch = 0; this.cycle = 0; this.documentTicket = 0; this.reviewTicket = 0; }
    componentDidMount() { this.alive = true; this.observe(); }
    componentWillUnmount() { this.alive = false; this.documentTicket++; this.reviewTicket++; this.poller?.stop(); }
    componentDidUpdate(prev) {
      if (prev.sessionId !== this.props.sessionId) {
        this.documentTicket++; this.reviewTicket++;
        this.setState({ data: null, detail: null, selected: [], review: null, legacy: null, error: '', notice: '', busy: false, activeAction: null });
        this.observe();
      } else if (prev.visible !== this.props.visible) this.observe();
    }
    observe() {
      this.poller?.stop();
      const id = this.props.sessionId;
      if (this.props.visible === false || !id) { this.poller = null; return; }
      this.poller = createPoller({
        read: signal => api(this.path() + suffix(id), undefined, signal),
        onData: data => this.setState(s => ({ data, error: '', ...(s.selected ? { selected: s.selected.filter(key => data.records?.some(r => r.id === key && r.live && !r.mergedInto)) } : {}) })),
        onError: error => this.setState({ error: error.message }),
      });
      this.poller.start();
    }
    load = () => this.poller?.refresh();
    run = async (path, body, success) => {
      if (this.state.busy) return;
      this.setState({ busy: true, activeAction: path, error: '', notice: '' }); const id = this.props.sessionId;
      try { const result = await api(path + suffix(id), body); if (this.alive && this.props.sessionId === id) { this.setState({ notice: success ? success(result) : result.queued ? '已加入后台队列。' : '已保存', ...(['/compact', '/compact-p', '/compact-f'].includes(path) ? { selected: [] } : {}) }); await this.load(); } }
      catch (e) { if (this.alive && this.props.sessionId === id) this.setState({ error: e.message }); }
      finally { if (this.alive && this.props.sessionId === id) this.setState({ busy: false, activeAction: null }); }
    };
    document = async id => {
      const sid = this.props.sessionId, ticket = ++this.documentTicket;
      try { const detail = await api('/context/document' + suffix(sid) + '&id=' + encodeURIComponent(id)); if (this.alive && this.props.sessionId === sid && ticket === this.documentTicket) this.setState({ detail }); }
      catch (e) { if (this.alive && this.props.sessionId === sid && ticket === this.documentTicket) this.setState({ error: e.message }); }
    };
    readReview = async () => {
      const sid = this.props.sessionId, ticket = ++this.reviewTicket;
      try { const review = await api('/context/review' + suffix(sid)); if (this.alive && sid === this.props.sessionId && ticket === this.reviewTicket) this.setState({ review }); }
      catch (e) { if (this.alive && sid === this.props.sessionId) this.setState({ error: e.message }); }
    };
    reader() { return this.state.detail && h(DocumentReader, { record: this.state.detail, onClose: () => { this.documentTicket++; this.setState({ detail: null }); } }); }
  }
  class PipelinePanel extends PollPanel {
    constructor(props) { super(props); this.state.selected = []; this.state.filter = 'all'; }
    path() { return '/context'; }
    select(id, checked) { this.setState(s => ({ selected: checked ? [...new Set([...s.selected, id])] : s.selected.filter(x => x !== id) })); }
    render() {
      const { data: d, error, notice, busy, selected, filter } = this.state;
      const records = (d?.records || []).filter(r => !r.mergedInto);
      const shown = records.filter(r => filter === 'all' || (filter === 'raw' ? r.mode === 'raw' : r.mode !== 'raw'));
      const locked = busy || Boolean(d?.manualOperation);
      const fullRunning = d?.manualOperation === 'full' || this.state.activeAction === '/compact-f';
      const ready = records.filter(r => r.live && r.mode === 'raw').length;
      const step = (text, state, running) => h('div', { className: 'cx-stage' }, h('span', { className: 'cx-dot ' + (running ? 'cx-pulse' : '') }), h('div', null, h('strong', null, text), h('small', null, state)));
      return h('div', { className: 'cx-panel cx-context' }, heading('工作上下文', '预处理在后台，替换在请求边界。', 'context', button(null, this.load, { icon: 'refresh', quiet: true, label: '刷新上下文' })),
        h('div', { className: 'cx-body' }, alert(error, true), alert(notice),
          !this.props.sessionId ? empty('先选择一个会话', '这里会显示本会话的分段摘要与替换状态。') : !d ? empty('正在读取上下文', '正在连接当前会话的预处理记录。') : h(React.Fragment, null,
            h('section', { className: 'cx-pipeline-card' }, h('div', { className: 'cx-row' }, h('span', { className: 'cx-eyebrow' }, '处理状态'), badge(names[d.scope?.scope] || '会话', d.scope?.scope === 'session' ? '' : 'blue')),
              h('div', { className: 'cx-stages' }, step('预处理', d.preparing ? '正在生成摘要' : '等待新事件', d.preparing), icon('chevron', 12), step('中枢', d.coordinating ? '正在判断范围' : d.pending ? '结果已准备' : '等待新摘要', d.coordinating), icon('chevron', 12), step('应用', d.transactionPending ? '事务恢复中' : '请求边界替换', d.transactionPending)),
              h('div', { className: 'cx-metrics' }, h('div', null, h('strong', null, fmt(records.length)), h('span', null, '分段摘要')), h('div', null, h('strong', null, fmt(ready)), h('span', null, '原文待替换')), h('div', null, h('strong', null, fmt(records.reduce((n, r) => n + (r.documentCount || 0) + (r.assetCount || 0), 0))), h('span', null, '详细资料存档'))),
              h('div', { className: 'cx-row cx-pipeline-action' }, h('small', null, '只应用已有结果，不现场等待 AI。'), button('应用已准备结果', () => this.run('/compact', {}, r => r.queued ? '已排队，将在下一次请求边界应用。' : r.changed ? '替换已应用，原文仍在日志中。' : '没有可应用的结果，原文保持不变。'), { disabled: locked, primary: true, icon: 'layers' }))),
            d.prepareDeferred && h('p', { className: 'cx-hint' }, '本批已结束：剩余 ' + fmt(d.prepareDeferred.events) + ' 条、约 ' + fmt(d.prepareDeferred.estimatedTokens) + ' tokens，留待下次触发。'),
            section('未处理原文', '与已准备、待替换的摘要分开统计。', h('p', { className: 'cx-prose' }, '待预处理 ' + fmt(d.backlog?.events) + ' 条 · 估算 ' + fmt(d.backlog?.estimatedTokens) + ' tokens；近期暂留 ' + fmt(d.backlog?.recentEvents) + ' 条。')),
            d.lastReplacement?.stats && section('最近一次替换', '以下为同口径估算，不是提供方实际输入账单。', h('p', { className: 'cx-prose' }, '处理 ' + fmt(d.lastReplacement.stats.selectedRecords) + ' 段 → ' + fmt(d.lastReplacement.stats.resultRecords) + ' 段；替换 ' + fmt(d.lastReplacement.stats.currentMessages) + ' 条当前消息，覆盖 ' + fmt(d.lastReplacement.stats.originalEvents) + ' 条原始事件；估算节省 ' + fmt(d.lastReplacement.stats.estimatedSavedTokens) + ' tokens。')),
            section('手动压缩', '压缩只改变当前上下文，原始日志和详细资料存档保留。', h(React.Fragment, null,
              fullRunning && h('div', { className: 'cx-info', role: 'status' }, icon('clock'), h('p', null, '正在生成全量摘要…摘要生成成功后才替换原文。')),
              d.manualQueued > 0 && h('p', { className: 'cx-hint', role: 'status' }, '有 ' + d.manualQueued + ' 项压缩操作等待下一次请求边界。'),
              h('div', { className: 'cx-compact-choice' }, h('div', { className: 'cx-row' }, h('code', null, '/compact-p'), button('已处理片段仅摘要', () => this.run('/compact-p', {}, r => r.message), { disabled: locked || !records.some(r => r.live && r.mode !== 'brief'), icon: 'layers' })), h('p', { className: 'cx-hint' }, '全部已准备片段只保留摘要，不携带文档、图片、附件；未处理内容不变，不调用 AI。')),
              h('div', { className: 'cx-compact-choice' }, h('div', { className: 'cx-row' }, h('code', null, '/compact-f'), button(fullRunning ? '全量压缩中…' : '全量压缩', () => this.run('/compact-f', {}, r => r.message), { disabled: locked, icon: fullRunning ? 'clock' : 'spark' })), h('p', { className: 'cx-hint' }, '调用 AI 将全部对话重新汇总为一份摘要，包含用户消息、工具结果、旧摘要及历史思考；保留前置 CoT、系统提示词、工具定义与用户手写全局背景。可能损失细节。')))),
            fold('后台操作', '手动触发预处理或中枢判断', h('div', { className: 'cx-actions' }, button('准备摘要', () => this.run('/context/prepare', {}), { disabled: locked || d.preparing, icon: 'context' }), button('运行中枢', () => this.run('/context/coordinate', {}), { disabled: locked || d.coordinating, icon: 'spark' }))),
            h('div', { className: 'cx-list-head' }, h('h3', null, '分段摘要'), segments('筛选分段', filter, [['all', '全部'], ['raw', '原文'], ['applied', '已替换']], value => this.setState({ filter: value }))),
            !shown.length ? empty(records.length ? '当前筛选没有内容' : '还没有分段摘要', records.length ? '切换“全部”查看其他记录。' : '达到预处理频率后，这里会自动出现基础摘要和文档。') : h('div', { className: 'cx-list' }, ...shown.map((r, i) => h('article', { className: 'cx-card cx-record ' + (selected.includes(r.id) ? 'cx-selected' : ''), key: r.id },
              h('div', { className: 'cx-row' }, h('label', { className: 'cx-record-check' }, h('input', { type: 'checkbox', checked: selected.includes(r.id), disabled: !r.live || locked, onChange: e => this.select(r.id, e.target.checked), 'aria-label': '选择 ' + r.id }), h('span', { className: 'cx-record-number' }, String(i + 1).padStart(2, '0')), h('time', null, date(r.timeStart) + ' — ' + time(r.timeEnd))), badge(r.live ? (r.kind === 'full' ? '全量摘要' : names[r.mode] || r.mode) : '历史存档', r.mode === 'raw' ? '' : 'blue')),
              summaryPreview(r.summary), h('div', { className: 'cx-record-footer' }, h('small', { title: r.id }, h('code', null, r.id.slice(0, 8)), ' · ', rangeLabel(r.ranges)), button(`${r.documentCount || 0} 文档 · ${r.assetCount || 0} 附件`, () => this.document(r.id), { icon: 'context', quiet: true }))))),
            fold('中枢最近的选择', d.review?.choices?.length ? `${d.review.choices.length} 项决定` : '还没有完成的判断', h('div', null,
              ...(d.review?.choices || []).map((c, i) => h('div', { className: 'cx-decision', key: i }, badge(names[c.action] || c.action, 'blue'), h('code', null, c.ids?.map(id => id.slice(0, 8)).join('、')), c.reason && h('p', null, c.reason))),
              d.review?.lastDiscard && h('p', { className: 'cx-hint' }, '资料更新后，过期决定已作废；不计为模型失败，也不触发强制重试。'),
              button('查看中枢完整输入', this.readReview, { quiet: true, icon: 'context' }), this.state.review && h('pre', null, JSON.stringify(this.state.review.input, null, 2)))),
            d.todoRefresh && h('p', { className: 'cx-hint' }, '上次压缩后已注入最新版 todo，并清理旧快照；预处理不读取 todo。用户原话与图片、文档同属详细资料。'),
            fold('Trace 与替换记录', d.trace ? '已前置提供方暴露的推理文本' : '尚无前置推理', h('div', null,
              h('p', { className: 'cx-hint' }, d.trace ? '来源事件 #' + d.trace.sourceSeq + (d.trace.truncated ? ' · 按设置截取' : ' · 原文本') : '没有已前置的推理文本；不会生成替代推理。'), d.lastReplacement && h('pre', null, JSON.stringify(d.lastReplacement, null, 2)),
              ...(d.notices || []).slice().reverse().map((n, i) => h('p', { className: 'cx-log-line', key: i }, h('time', null, date(n.at)), ' ', n.text))))),
          h('div', { className: 'cx-footnote' }, icon('info', 13), '退出当前上下文，不等于删除原始记录。')),
        selected.length > 0 && h('footer', { className: 'cx-savebar cx-selection' }, h('span', null, '已选 ', h('strong', null, selected.length), ' 段'), h('div', { className: 'cx-actions' }, button('取消', () => this.setState({ selected: [] }), { quiet: true }), button('摘要＋详细资料', () => this.run('/compact', { ids: selected, mode: 'detail' }), { disabled: locked }), button('仅摘要', () => this.run('/compact', { ids: selected, mode: 'brief' }), { disabled: locked, primary: true }))), this.reader());
    }
  }
  class SummaryPanel extends PollPanel {
    constructor(props) { super(props); this.state.search = ''; this.state.legacy = null; }
    path() { return '/context/catalog'; }
    render() {
      const { data: d, search, error, notice } = this.state;
      const entries = (d?.entries || []).filter(r => [r.summary, r.sessionTitle, r.id].join(' ').toLowerCase().includes(search.toLowerCase()));
      const groups = new Map(); for (const r of entries) { const list = groups.get(r.sessionId) || []; list.push(r); groups.set(r.sessionId, list); }
      const privateSession = d?.scope?.scope === 'session';
      return h('div', { className: 'cx-panel' }, heading(privateSession ? '会话摘要' : '项目摘要', privateSession ? '本会话私有历史，不参与共享记忆。' : '按会话整理，按原始事件时间回看。', 'memory', button(null, this.load, { quiet: true, icon: 'refresh', label: '刷新摘要' })),
        h('div', { className: 'cx-body' }, alert(error, true), alert(notice),
          h('div', { className: 'cx-catalog-banner' }, icon(privateSession ? 'lock' : 'layers', 19), h('div', null, h('strong', null, privateSession ? '仅当前会话可见' : '项目共享档案'), h('small', null, !d ? '正在读取…' : `${groups.size} 个会话 · ${entries.length} 段摘要 · 文档按需读取`))),
          h('label', { className: 'cx-search' }, icon('search'), h('input', { value: search, onChange: e => this.setState({ search: e.target.value }), placeholder: '搜索摘要、会话或编号', 'aria-label': '搜索摘要' })),
          ...[...groups].map(([sid, list]) => h('section', { className: 'cx-session', key: sid }, h('header', { className: 'cx-session-head' }, h('span', { className: 'cx-session-icon' }, icon('context', 15)), h('div', null, h('h3', null, list[0].sessionTitle || sid), h('small', { title: sid }, sid.length > 28 ? sid.slice(0, 28) + '…' : sid)), badge(list.length + ' 段')),
            h('div', { className: 'cx-timeline' }, ...list.map(r => h('article', { className: 'cx-timeline-record', key: r.id }, h('span', { className: 'cx-timeline-dot' }), h('time', null, date(r.timeStart), ' — ', time(r.timeEnd)), summaryPreview(r.summary), h('div', { className: 'cx-record-footer' }, h('code', { title: r.id }, r.id.slice(0, 8)), button(`读取 ${r.documentCount || 0} 文档 · ${r.assetCount || 0} 附件`, () => this.document(r.id), { quiet: true, icon: 'context' }))))))),
          d && !entries.length && empty('没有匹配的摘要', search ? '试试其他关键词，或清空筛选。' : privateSession ? '本会话完成预处理后，摘要会显示在这里。' : '项目级会话完成预处理后，摘要会按会话归档。'),
          !privateSession && d && fold('旧自动记忆', '只读保留，不自动重新注入', h('div', null, button('读取本项目旧条目', async () => { const sid = this.props.sessionId; try { const r = await api('/memories' + suffix(sid)); if (this.alive && sid === this.props.sessionId) this.setState({ legacy: r.items }); } catch (e) { if (this.alive && sid === this.props.sessionId) this.setState({ error: e.message }); } }, { icon: 'memory', quiet: true }), this.state.legacy && h('pre', null, JSON.stringify(this.state.legacy, null, 2))))), this.reader());
    }
  }

  class ContextSettings extends React.Component {
    state = { config: null, directory: [], page: 'basic', custom: false, routing: 'follow', error: '', status: '', busy: false, globalText: '', globalSaved: '', globalRevision: 0, globalLoaded: false, globalError: '', globalStatus: '' };
    componentDidMount() { this.alive = true; this.loadSettings(); this.loadGlobal(); }
    componentWillUnmount() { this.alive = false; }
    loadSettings = async () => {
      try { const s = await api('/state'); if (this.alive) { this.saved = s.config; this.setState({ config: { ...s.config }, directory: s.directory || [], routing: contextRouteMode(s.config), error: '' }); } }
      catch (e) { if (this.alive) this.setState({ error: e.message }); }
    };
    loadGlobal = async () => {
      try { const g = await api('/context/global'); if (this.alive) this.setState({ globalText: g.text, globalSaved: g.text, globalRevision: g.revision, globalLoaded: true, globalError: '' }); }
      catch (e) { if (this.alive) this.setState({ globalError: e.message }); }
    };
    set = (key, value) => this.setState(s => ({ config: { ...s.config, [key]: value }, status: '', ...(Object.hasOwn(CONTEXT_FREQUENCY_PRESETS.medium, key) ? { custom: true } : {}) }));
    pickPreset = name => {
      if (name === 'custom') { this.setState({ custom: true }); return; }
      this.setState(s => ({ config: { ...s.config, ...contextFrequencyPatch(name) }, custom: false, status: '' }));
    };
    save = async e => {
      e?.preventDefault(); if (this.state.busy || !this.state.config) return;
      const patch = contextSettingsPatch(this.saved, this.state.config); if (!Object.keys(patch).length) return;
      this.setState({ busy: true, error: '', status: '' });
      try { const next = await api('/settings', patch); if (this.alive) { this.saved = next; this.setState({ config: { ...next }, routing: contextRouteMode(next), custom: false, status: '设置已保存' }); } }
      catch (e) { if (this.alive) this.setState({ error: e.message }); }
      finally { if (this.alive) this.setState({ busy: false }); }
    };
    saveGlobal = async () => {
      if (this.state.busy || !this.state.globalLoaded) return;
      this.setState({ busy: true, globalError: '', globalStatus: '' });
      try { const g = await api('/context/global', { text: this.state.globalText, revision: this.state.globalRevision }); if (this.alive) this.setState({ globalText: g.text, globalSaved: g.text, globalRevision: g.revision, globalStatus: '全局背景已保存' }); }
      catch (e) { if (this.alive) this.setState({ globalError: e.message }); }
      finally { if (this.alive) this.setState({ busy: false }); }
    };
    undo = () => this.setState({ config: { ...this.saved }, routing: contextRouteMode(this.saved), custom: false, error: '', status: '' });
    number(key, label, min = 0, hint, scale = 1, disabled = false) {
      const value = this.state.config[key];
      return field(label, h('input', { type: 'number', required: true, disabled, min, step: 1 / scale, value: value === '' ? '' : (value ?? 0) / scale, onChange: e => this.set(key, e.target.value === '' ? '' : Number(e.target.value) * scale) }), hint);
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
      return h(React.Fragment, null, this.frequency(),
        section('预处理范围', '默认整窗处理，受保护内容保留，但不阻断范围。', this.toggle('preprocessBoundaries', '按消息边界分段', '默认关闭；开启恢复兼容分段。系统提示词、前置 CoT、近期保留区和完整工具往返始终受保护。')),
        section('自动运行', null, h('div', { className: 'cx-switches' }, this.toggle('contextEnabled', '后台预处理与中枢', '提前生成基础摘要和详细资料，再判断如何替换。'), this.toggle('automaticReplace', '自动应用已完成决定', '在请求边界应用；关闭后仍可手动替换。'))),
        section('空闲预处理', '默认关闭；不影响按新事件数量触发的正常预处理，也不影响手动操作。', h(React.Fragment, null,
          this.toggle('idlePreprocessEnabled', '空闲时自动预处理', '仅在会话真正空闲且有待处理内容时触发；模型或工具运行中不计时。'),
          this.number('flushIdleMs', '空闲等待时间 · 秒', 0, '默认 90 秒；关闭开关会取消等待中的任务。已开始的任务正常结束，0 秒也表示禁用。', 1000, !c.idlePreprocessEnabled))),
        section('默认会话范围', '只影响新会话，已开始的会话保持原有绑定。', h('div', { className: 'cx-choice-grid' }, ...[['session', 'lock', '会话隔离', '仅本会话历史，不读取或写入共享记忆。'], ['project', 'layers', '项目共享', '读取同项目摘要，按会话与时间归档。']].map(([id, name, text, sub]) => h('button', { type: 'button', key: id, className: 'cx-choice', 'aria-pressed': (c.memoryScope === 'session' ? 'session' : 'project') === id, onClick: () => this.set('memoryScope', id) }, h('div', { className: 'cx-row' }, icon(name, 18), h('span', { className: 'cx-radio' }, icon('check', 11))), h('strong', null, text), h('small', null, sub))))));
    }
    renderExperimental() {
      return h(React.Fragment, null,
        section('CoT 前置', null, h(React.Fragment, null,
          this.toggle('traceEnabled', '启用 CoT 前置', '上下文替换时保留提供方已公开的推理文本，不另行生成；可能扩大缓存失效范围。'),
          this.number('traceMaxChars', '推理文本字符上限', 0, '0 保留所选推理全文；正数保留尾部并标注截取。'))),
        section('任务约束', null, this.toggle('todoConstraintFirst', '任务约束前置（CFR）', '在系统和待办工具提示词中加入约束提取、推导与核对规则。默认关闭，保存后从下一次模型请求生效。')));
    }
    renderAdvanced() {
      const c = this.state.config;
      return h(React.Fragment, null, h('div', { className: 'cx-info' }, icon('info'), h('p', null, '频率档位可以直接使用。需要精调时再展开；这些选项均对应仍在运行的功能。')),
        fold('预处理窗口', '分段与参考前文；空闲开关见基础设置', h('div', { className: 'cx-grid' }, this.number('digestEvery', '预处理频率 · 新事件数', 1), this.number('digestWindow', '目标分段窗口 · 事件数', 1, '保留完整工具往返，实际段长可能超过窗口。'), this.number('digestLookback', '参考前文 · 事件数', 0))),
        fold('整窗预算与后台额度', '一次触发可以处理多窗；剩余积压单独记录，不无限补历史。', h('div', { className: 'cx-grid' }, this.number('prepareBatchWindows', '每次触发最多处理窗口数', 1), this.number('prepareContinueTokens', '续跑最低文本量 · 估算 tokens', 1, '后续窗口需装满新的实际消息，或达到该文本量；零碎尾巴留到下次，不含参考前文与旧摘要。'), this.number('prepareInputTokens', '单窗输入预算 · 估算 tokens', 1), this.number('summaryTargetChars', '基础摘要目标 · 字符', 1, '超过目标两倍时重试，不直接截断原文。'), this.number('backgroundConcurrency', '后台最大并发调用', 1), this.number('backgroundMaxRetries', '自动重试次数', 0))),
        fold('中枢与请求替换', '判断频率、近期原文和自动应用间隔', h(React.Fragment, null, h('div', { className: 'cx-grid' }, this.number('coordinatorEvery', '中枢频率 · 新摘要数', 1), this.number('coordinatorMinGapMs', '中枢最短间隔 · 秒', 0, undefined, 1000), this.number('coordinatorRecentEvents', '中枢近期原文窗口', 0), this.number('surgeryCooldownSteps', '自动替换最短步数', 0), this.number('keepTailEvents', '暂留近期事件数', 0)), this.toggle('requireShorter', '替换后的总量应更小', '将摘要、详细资料和前置 Trace 一起计算。'))),
        fold('资源上限', '0 使用原有默认语义', h('div', { className: 'cx-grid' }, this.number('digestMaxTokens', '预处理输出 Token 上限', 0, '0 使用提供方默认。'), this.number('surgeonMaxTokens', '中枢输出 Token 上限', 0), this.number('jobTimeoutMs', '后台超时 · 秒', 0, '默认 600 秒（10 分钟）；0 不设置插件超时。', 1000))),
        fold('电脑操控', '沿用原有浏览器与桌面连接设置', h(React.Fragment, null, this.toggle('computerUseEnabled', '启用电脑操控', '任务和电脑面板仍使用原有功能。'), ...[['computerUseBrowserExecutable', '浏览器程序路径'], ['computerUseChromeUserDataDir', '浏览器用户数据目录'], ['computerUseNativeBinary', '桌面控制程序路径'], ['computerUseNativeSocket', '桌面连接 Socket']].map(([key, label]) => field(label, h('input', { value: c[key] || '', placeholder: '自动检测 / 原有默认', onChange: e => this.set(key, e.target.value) }))))),
        h('p', { className: 'cx-footnote' }, '旧探针、自动全局记忆和旧状态提炼参数仅保留兼容读取，不再显示为可运行功能。'));
    }
    renderModels() {
      const c = this.state.config, mode = this.state.routing;
      return h(React.Fragment, null,
        section('后台模型', '主执行模型仍在 DSH 的模型设置中选择。', h(React.Fragment, null, segments('后台模型配置方式', mode, [['follow', '跟随主模型'], ['unified', '统一配置'], ['separate', '分别配置']], this.chooseRoute),
          mode === 'follow' ? h('div', { className: 'cx-info' }, icon('layers'), h('p', null, '预处理 AI 和中枢使用当前会话的提供方与模型。')) : mode === 'unified' ? this.route('unifiedBackground', '预处理与中枢') : h(React.Fragment, null, this.route('background', '预处理 AI'), this.route('surgeon', '中枢 AI')))),
        section('身份认知', '保留原来的身份编辑能力。', field('身份提示词', h('textarea', { rows: 7, value: c.identityPrompt ?? DEFAULT_IDENTITY, onChange: e => this.set('identityPrompt', e.target.value), placeholder: '描述助手是谁，以及主要帮助你做什么' }), '保存后作用于后续请求；留空可移除身份描述。'), button('恢复默认', () => this.set('identityPrompt', DEFAULT_IDENTITY), { quiet: true, disabled: c.identityPrompt === DEFAULT_IDENTITY })));
    }
    renderGlobal() {
      return h(React.Fragment, null, alert(this.state.globalError, true),
        h('div', { className: 'cx-catalog-banner' }, icon('globe', 20), h('div', null, h('strong', null, '只由你维护的全局背景'), h('small', null, '项目会话可读取；私有会话不读取。'))),
        section('固定背景', '后台 AI 不自动新增、补充或改写这段内容。', field('全局固定背景', h('textarea', { className: 'cx-global-editor', rows: 14, value: this.state.globalText, disabled: !this.state.globalLoaded, onChange: e => this.setState({ globalText: e.target.value, globalStatus: '' }), placeholder: '写下适用于项目会话的固定背景，例如工作习惯、环境约定。' })), badge(fmt(this.state.globalText.length) + ' 字符')),
        !this.state.globalLoaded && button('重新读取全局背景', this.loadGlobal, { icon: 'refresh' }),
        h('div', { className: 'cx-info' }, icon('lock'), h('p', null, '其他窗口已修改这段文字时，保存会提示冲突，不会覆盖对方内容。')));
    }
    render() {
      const { config: c, page, busy, error, status } = this.state;
      const dirty = c && Object.keys(contextSettingsPatch(this.saved, c)).length > 0;
      const isGlobal = page === 'global', globalDirty = this.state.globalText !== this.state.globalSaved;
      const footStatus = isGlobal ? this.state.globalStatus || (globalDirty ? '有未保存的更改' : '仅用户手动维护') : status || (dirty ? '有未保存的更改' : '已与当前设置同步');
      return h('div', { className: 'cx-panel cx-settings', 'data-context-ui': CONTEXT_UI_VERSION }, heading('偏好设置', '模型、上下文与项目摘要', 'settings'),
        pageTabs(page, [['basic', '常用'], ['models', '模型与身份'], ['experimental', '实验性功能'], ['advanced', '高级'], ['global', '全局背景']], value => this.setState({ page: value })),
        !c ? h('div', { className: 'cx-body' }, alert(error, true), empty('正在读取设置', '保留已保存的参数，不自动套用任何档位。'), error && button('重试', this.loadSettings, { icon: 'refresh' })) : h('form', { className: 'cx-settings-form', onSubmit: isGlobal ? e => { e.preventDefault(); this.saveGlobal(); } : this.save },
          h('div', { className: 'cx-body' }, alert(error, true), h('fieldset', { className: 'cx-fields', disabled: busy }, page === 'basic' ? this.renderBasic() : page === 'models' ? this.renderModels() : page === 'experimental' ? this.renderExperimental() : page === 'advanced' ? this.renderAdvanced() : this.renderGlobal())),
          h('footer', { className: 'cx-savebar' }, h('span', { className: 'cx-save-status', role: 'status' }, icon(status || this.state.globalStatus ? 'check' : 'info', 13), footStatus), h('div', { className: 'cx-actions' },
            button('撤销', isGlobal ? () => this.setState({ globalText: this.state.globalSaved, globalStatus: '' }) : this.undo, { quiet: true, disabled: busy || !(isGlobal ? globalDirty : dirty) }),
            h('button', { type: 'submit', className: 'cx-btn cx-primary', disabled: busy || !(isGlobal ? globalDirty && this.state.globalLoaded : dirty) }, icon(busy ? 'clock' : 'check'), busy ? '保存中…' : isGlobal ? '保存全局背景' : '保存设置')))));
    }
  }
  class ScopeControl extends React.Component {
    state = { data: null, error: '', busy: false };
    componentDidMount() { this.alive = true; this.load(); }
    componentDidUpdate(prev) { if (prev.sessionId !== this.props.sessionId || prev.locked !== this.props.locked) { if (prev.sessionId !== this.props.sessionId) this.setState({ data: null, error: '' }); this.load(); } }
    componentWillUnmount() { this.alive = false; }
    load = async () => { const id = this.props.sessionId; try { const data = await api('/scope' + suffix(id)); if (this.alive && id === this.props.sessionId) this.setState({ data, error: '' }); } catch (e) { if (this.alive && id === this.props.sessionId) this.setState({ error: e.message }); } };
    render() {
      const d = this.state.data;
      return h('label', { className: 'cx-scope-chip', title: this.state.error || (d?.locked || this.props.locked ? '本会话已绑定范围' : '新会话的摘要共享范围') }, icon(d?.scope === 'project' ? 'layers' : 'lock', 13),
        h('select', { 'aria-label': '会话范围', disabled: !d || d.locked || this.props.locked || this.state.busy, value: d?.scope || 'session', onChange: async e => { const id = this.props.sessionId, scope = e.target.value; this.setState({ busy: true }); try { const data = await api('/scope' + suffix(id), { scope }); if (this.alive && id === this.props.sessionId) this.setState({ data, error: '' }); } catch (e) { if (this.alive && id === this.props.sessionId) this.setState({ error: e.message }); await this.load(); } finally { if (this.alive) this.setState({ busy: false }); } } }, h('option', { value: 'session' }, '会话隔离'), h('option', { value: 'project' }, '项目共享')));
    }
  }
  const ScopeChip = props => { const locked = props.useSessions(s => s.byId[props.sessionId]?.blank === false); return h(ScopeControl, { ...props, locked }); };
  const PipelineSlot = props => { const { tab } = props.useTabInfo(); return h(PipelinePanel, { ...props, visible: tab.visible }); };
  const SummarySlot = props => { const { tab } = props.useTabInfo(); return h(SummaryPanel, { ...props, visible: tab.visible }); };
  const tabs = [['tasks', '任务', 'task'], ['context', '上下文', 'context'], ['memory', '摘要', 'memory'], ['computer', '电脑', 'computer'], ['monitor', '监控', 'monitor']];
  const wrapWorkbench = (Original, initial = 'tasks') => function ContextWorkbench(props) {
    const info = props.useTabInfo(), section = info.tab.navigation?.params?.section || initial;
    const active = tabs.some(([key]) => key === section) ? section : 'tasks';
    return h('div', { className: 'cx-integrated' }, h('nav', { className: 'cx-navigation', 'aria-label': '工作台导航' }, ...tabs.map(([key, text, name]) => h('button', { key, type: 'button', 'aria-current': active === key ? 'page' : undefined, onClick: () => info.tab.actions.openTab('trisoul-x-workbench', { params: { section: key }, replaceTab: info.tab.kind !== 'trisoul-x-workbench' }) }, icon(name, 15), h('span', null, text)))),
      h('div', { hidden: active !== 'context' }, h(PipelineSlot, { ...props, useTabInfo: () => { const v = props.useTabInfo(); return { ...v, tab: { ...v.tab, visible: v.tab.visible && active === 'context' } }; } })),
      h('div', { hidden: active !== 'memory' }, h(SummarySlot, { ...props, useTabInfo: () => { const v = props.useTabInfo(); return { ...v, tab: { ...v.tab, visible: v.tab.visible && active === 'memory' } }; } })),
      h('div', { className: 'cx-legacy', hidden: ['context', 'memory'].includes(active) }, h(Original, { ...props, useTabInfo: () => { const v = props.useTabInfo(); return { ...v, tab: { ...v.tab, visible: v.tab.visible && !['context', 'memory'].includes(active), navigation: { ...v.tab.navigation, params: { ...v.tab.navigation?.params, section: ['context', 'memory'].includes(active) ? 'tasks' : active } } } }; } })));
  };
  return { ContextSettings, ScopeChip, wrapWorkbench, applyStyle(ctx) {
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
.cx-legacy>.tx-workbench>.tx-workbench-nav{display:none}.cx-legacy{height:100%;min-height:0}
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
.cx-frequency-preview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:15px 0 10px}.cx-frequency-preview>div{display:flex;align-items:baseline;gap:5px;flex-wrap:wrap;border:1px solid var(--cx-line);border-radius:10px;background:var(--cx-soft);padding:11px 13px}
.cx-frequency-preview span{width:100%;font-size:11px;color:var(--cx-muted)}.cx-frequency-preview strong{font-size:24px;line-height:1.2;font-weight:580;letter-spacing:-.7px;color:var(--cx-text)}.cx-frequency-preview small{font-size:10px}
.cx-hint{font-size:11px;color:var(--cx-muted);line-height:1.75}.cx-panel .cx-frequency-caption{margin-top:10px}.cx-custom-fields{margin-top:12px;padding-top:8px;border-top:1px dashed var(--cx-line)}
.cx-footnote{display:flex;gap:6px;font-size:10px;line-height:1.8;color:var(--cx-muted);margin-top:16px!important}.cx-footnote svg{margin-top:3px;flex-shrink:0}
.cx-toggle{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 0;cursor:pointer}.cx-toggle+.cx-toggle{border-top:1px solid var(--cx-line)}.cx-toggle>span{min-width:0}.cx-toggle strong{display:block;font-size:12px;font-weight:500}.cx-toggle small{display:block;font-size:11px;color:var(--cx-muted);margin-top:4px;line-height:1.65}
.cx-panel .cx-toggle input{appearance:none;position:relative;width:34px;height:20px;border-radius:20px;background:color-mix(in srgb,var(--cx-text) 17%,var(--cx-bg));border:1px solid transparent;cursor:pointer;transition:background .14s}
.cx-panel .cx-toggle input::after{content:'';position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px #0002;transition:transform .14s}.cx-panel .cx-toggle input:checked{background:#2864d7}.cx-panel .cx-toggle input:checked::after{transform:translateX(14px)}.cx-panel .cx-toggle input:focus-visible{outline:2px solid var(--cx-blue);outline-offset:3px}
.cx-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cx-choice{border:1px solid var(--cx-line);border-radius:11px;padding:14px;background:var(--cx-bg);color:var(--cx-text);font:inherit;text-align:left;cursor:pointer;min-width:0}
.cx-choice[aria-pressed=true]{border-color:color-mix(in srgb,var(--cx-blue) 58%,var(--cx-line));background:var(--cx-tint)}.cx-choice>.cx-row{color:var(--cx-muted);margin-bottom:12px}.cx-choice[aria-pressed=true]>.cx-row{color:var(--cx-blue)}.cx-choice strong{display:block;font-size:12px;font-weight:600;margin-bottom:5px}.cx-choice small{font-size:10px;display:block;line-height:1.7}
.cx-radio{display:grid;place-items:center;width:14px;height:14px;border:1px solid var(--cx-line);border-radius:50%}.cx-radio svg{visibility:hidden}.cx-choice[aria-pressed=true] .cx-radio{color:#fff;background:#2864d7;border-color:#2864d7}.cx-choice[aria-pressed=true] .cx-radio svg{visibility:visible}
.cx-route{margin-top:15px;border:1px solid var(--cx-line);border-radius:11px;padding:14px}.cx-route-label{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;margin-bottom:7px;color:var(--cx-muted)}
.cx-fold{margin:12px 0;border:1px solid var(--cx-line);border-radius:11px;overflow:hidden}.cx-fold>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px;cursor:pointer;list-style:none}.cx-fold>summary::-webkit-details-marker{display:none}.cx-fold>summary strong{display:block;font-size:12px;font-weight:550}.cx-fold>summary small{display:block;font-size:10px;color:var(--cx-muted);margin-top:4px}.cx-fold>summary>svg{color:var(--cx-muted);transition:transform .14s}.cx-fold[open]>summary>svg{transform:rotate(90deg)}.cx-fold[open]>summary{border-bottom:1px solid var(--cx-line);background:var(--cx-soft)}.cx-fold-body{padding:11px 15px 16px}
.cx-info{display:flex;align-items:flex-start;gap:10px;margin:16px 0;padding:12px 14px;border-radius:9px;background:var(--cx-soft);color:var(--cx-muted);font-size:11px;line-height:1.8}.cx-info svg{margin-top:2px;color:var(--cx-blue)}
.cx-pill{display:inline-flex;align-items:center;white-space:nowrap;font-size:10px;line-height:1.6;font-weight:500;padding:3px 8px;border:1px solid var(--cx-line);border-radius:6px;background:var(--cx-soft);color:var(--cx-muted)}.cx-tone-blue{color:var(--cx-blue);border-color:color-mix(in srgb,var(--cx-blue) 18%,var(--cx-bg));background:var(--cx-tint)}
.cx-savebar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0;padding:12px 20px;border-top:1px solid var(--cx-line);background:var(--cx-bg);box-shadow:0 -6px 18px color-mix(in srgb,var(--cx-bg) 85%,transparent)}.cx-save-status{display:flex;align-items:center;gap:6px;min-width:0;color:var(--cx-muted);font-size:10px}.cx-actions{display:flex;align-items:center;gap:7px;flex-shrink:0;flex-wrap:wrap}.cx-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.cx-alert{display:flex;align-items:flex-start;gap:9px;font-size:12px;margin:10px 0 14px;padding:12px;border:1px solid color-mix(in srgb,var(--cx-blue) 24%,var(--cx-bg));border-radius:9px;background:var(--cx-tint);color:var(--cx-text);overflow-wrap:anywhere}.cx-alert svg{margin-top:2px;color:var(--cx-blue)}.cx-error{border-color:color-mix(in srgb,var(--cx-red) 32%,var(--cx-bg));background:color-mix(in srgb,var(--cx-red) 6%,var(--cx-bg));color:var(--cx-red)}.cx-error svg{color:var(--cx-red)}
.cx-empty{text-align:center;padding:42px 18px;color:var(--cx-muted)}.cx-empty-icon{display:inline-grid;place-items:center;width:46px;height:46px;background:var(--cx-soft);border:1px solid var(--cx-line);border-radius:14px;margin-bottom:14px}.cx-empty h3{font-size:13px;color:var(--cx-text);margin-bottom:8px}.cx-empty p{font-size:11px;line-height:1.8;max-width:32em;margin:auto}
.cx-pipeline-card{padding:16px;border:1px solid var(--cx-line);border-radius:13px;background:linear-gradient(155deg,var(--cx-tint),var(--cx-bg) 60%)}.cx-eyebrow{font-size:11px;font-weight:600;color:var(--cx-muted)}
.cx-stages{display:flex;justify-content:space-between;gap:6px;align-items:center;margin:22px 0}.cx-stages>svg{color:var(--cx-muted);opacity:.6}.cx-stage{display:flex;align-items:center;gap:7px;min-width:0}.cx-stage strong{display:block;font-size:11px;font-weight:600}.cx-stage small{font-size:9px;display:block;margin-top:2px;white-space:nowrap}
.cx-dot{display:block;width:7px;height:7px;border-radius:50%;background:color-mix(in srgb,var(--cx-blue) 35%,var(--cx-bg));flex-shrink:0}.cx-pulse{background:var(--cx-blue);box-shadow:0 0 0 4px var(--cx-tint);animation:cx-pulse 1.5s ease-in-out infinite}@keyframes cx-pulse{50%{opacity:.45}}
.cx-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px;padding:15px 0;border-top:1px solid var(--cx-line);border-bottom:1px solid var(--cx-line)}.cx-metrics>div{text-align:center;border-right:1px solid var(--cx-line)}.cx-metrics>div:last-child{border:0}.cx-metrics strong{display:block;font-size:23px;font-weight:550;line-height:1.35;letter-spacing:-.7px}.cx-metrics span{display:block;font-size:10px;margin-top:4px;color:var(--cx-muted)}.cx-pipeline-action{margin-top:14px;flex-wrap:wrap;justify-content:flex-end}.cx-pipeline-action small{margin-right:auto;font-size:10px}
.cx-compact-choice{padding:12px 0}.cx-compact-choice+.cx-compact-choice{border-top:1px solid var(--cx-line)}.cx-compact-choice>.cx-row{flex-wrap:wrap;margin-bottom:8px}.cx-compact-choice code{font-size:11px}
.cx-list-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:23px 0 12px}.cx-list-head .cx-segments button{padding:4px 9px;font-size:10px}.cx-card{border:1px solid var(--cx-line);border-radius:11px;padding:14px;margin-bottom:10px;background:var(--cx-bg)}.cx-card.cx-selected{border-color:color-mix(in srgb,var(--cx-blue) 60%,var(--cx-line));background:var(--cx-tint)}
.cx-record-check{display:flex;gap:7px;align-items:center;min-width:0;cursor:pointer}.cx-record-number{display:none}.cx-record-check time{font-size:10px;color:var(--cx-muted)}.cx-prose{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85;font-size:12px}.cx-record>.cx-prose{margin:12px 0 9px}.cx-record-footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.cx-record-footer>small{font-size:10px;min-width:0;overflow-wrap:anywhere}.cx-panel code{font:10px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere;color:var(--cx-muted)}.cx-record-footer .cx-btn{font-size:10px;padding:4px 6px;min-height:27px}
.cx-decision{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0}.cx-decision p{width:100%;font-size:11px;color:var(--cx-muted)}.cx-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font:11px/1.8 ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--cx-soft);border:1px solid var(--cx-line);border-radius:9px;padding:14px;max-height:480px;overflow:auto;margin:10px 0;color:var(--cx-text)}.cx-log-line{font-size:11px;line-height:1.8;padding:8px 0;border-top:1px solid var(--cx-line)}.cx-log-line time{color:var(--cx-muted)}
.cx-selection{font-size:11px}.cx-selection .cx-actions{flex-wrap:nowrap}.cx-selection .cx-btn{font-size:11px;padding:6px 8px}
.cx-catalog-banner{display:flex;align-items:center;gap:12px;padding:15px;border:1px solid var(--cx-line);border-radius:12px;background:var(--cx-soft);margin:3px 0 17px}.cx-catalog-banner>svg{color:var(--cx-blue)}.cx-catalog-banner strong{display:block;font-size:12px;font-weight:550}.cx-catalog-banner small{display:block;margin-top:4px;font-size:10px}
.cx-search{display:flex;align-items:center;gap:8px;border:1px solid var(--cx-line);border-radius:9px;padding:0 11px;color:var(--cx-muted);margin:16px 0 22px}.cx-search:focus-within{border-color:var(--cx-blue);box-shadow:0 0 0 3px var(--cx-tint)}.cx-panel .cx-search input{border:0;box-shadow:none!important;background:transparent;padding:9px 0;outline:none}
.cx-session{margin:22px 0}.cx-session-head{display:flex;align-items:center;gap:10px;margin-bottom:15px}.cx-session-head>div{min-width:0;flex:1}.cx-session-head h3{overflow-wrap:anywhere;font-size:12px}.cx-session-head small{font-size:9px}.cx-session-icon{display:grid;place-items:center;width:30px;height:32px;border:1px solid var(--cx-line);border-radius:8px;color:var(--cx-muted);flex-shrink:0}
.cx-timeline{margin-left:15px;padding-left:22px;border-left:1px solid var(--cx-line)}.cx-timeline-record{position:relative;padding:0 0 19px;margin-bottom:5px}.cx-timeline-record:last-child{padding-bottom:0}.cx-timeline-dot{position:absolute;top:6px;left:-27px;width:9px;height:9px;border:2px solid var(--cx-bg);border-radius:50%;background:color-mix(in srgb,var(--cx-blue) 65%,var(--cx-bg));box-shadow:0 0 0 1px var(--cx-line)}.cx-timeline-record time{font-size:10px;color:var(--cx-muted)}.cx-timeline-record>.cx-prose{margin:7px 0 8px}.cx-timeline-record .cx-record-footer{padding-bottom:9px;border-bottom:1px solid var(--cx-line)}
.cx-reader{position:absolute;inset:0;z-index:5;background:var(--cx-bg);display:flex;flex-direction:column;outline:none}.cx-reader-head{display:flex;align-items:center;gap:10px;padding:12px 17px;border-bottom:1px solid var(--cx-line);flex-shrink:0}.cx-reader-head>strong{flex:1;font-size:13px}.cx-record-meta{display:flex;flex-direction:column;gap:6px;padding:20px 0 0}.cx-record-meta code{font-size:11px}.cx-document{padding:21px 0;border-bottom:1px solid var(--cx-line)}.cx-document pre{max-height:none;margin:0}.cx-global-editor{min-height:295px!important}
.cx-scope-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid var(--cx-line);border-radius:7px;max-width:140px;line-height:1.4;font-size:11px;color:var(--cx-muted);background:var(--cx-bg)}.cx-scope-chip select{border:0;background:transparent;color:inherit;font:inherit;padding:0;min-width:0;outline:none;cursor:pointer}.cx-scope-chip select:disabled{opacity:1;appearance:none;cursor:default}
@container cx (max-width:400px){.cx-head{padding:18px 16px 15px}.cx-body{padding:0 16px 20px}.cx-tabs{padding:0 16px;gap:19px}.cx-savebar{padding:11px 15px}.cx-frequency-preview>div{padding:10px}.cx-frequency-preview strong{font-size:22px}.cx-frequency-preview small{font-size:9px}.cx-grid{gap:2px 11px}.cx-choice{padding:12px}.cx-stage{gap:5px}.cx-stage small{font-size:8.5px}.cx-stage strong{font-size:10px}.cx-pipeline-card{padding:13px}.cx-pipeline-action{justify-content:flex-start}.cx-pipeline-action small{width:100%}.cx-record{padding:12px}.cx-selection{gap:6px;flex-wrap:wrap}.cx-selection .cx-actions{margin-left:auto}.cx-save-status{max-width:45%}.cx-head-title{gap:9px}}
@container cx (max-width:320px){.cx-grid{grid-template-columns:1fr}.cx-choice-grid{grid-template-columns:1fr}.cx-tabs{gap:14px}.cx-tabs button{font-size:11px}.cx-frequency-preview{gap:5px}.cx-frequency-preview>div{padding:8px}.cx-frequency-preview small{width:100%}.cx-stage .cx-dot{display:none}.cx-save-status svg{display:none}.cx-record-check time{font-size:9px}}
@media(prefers-reduced-motion:reduce){.cx-panel *{animation:none!important;transition:none!important}}
`;
