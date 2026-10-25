import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Checkbox, Choice, Input, SegmentedControl, Switch } from './native-controls.jsx';
import { PROMPT_STYLES } from '../prompt-styles/options.mjs';
import { TASK_VERIFICATION_OPTIONS, TASK_VERIFICATION_HINTS } from '../task-verification.mjs';
import { Icon } from './native-icons.jsx';
import { contextFrequencyOf, contextFrequencyPatch, contextRouteMode } from './context-client.mjs';
import { PersonaSettings } from '../../plugins/persona/src/client/settings.jsx';
import { recommendedPlugins } from './recommended-plugins.mjs';
import projectCredits from '../project-credits.json';
import { pluginApi } from './recommended-plugins.jsx';
import { usePollingAction } from './use-polling-action.mjs';
import { createSettingsState } from './settings-state.mjs';
import { scaledSettingValue, savedBackground } from './settings-values.mjs';
import { HISTORY_SIZE_KEY, HISTORY_SIZES, historySize } from './history-settings.jsx';
import { VersionInfo } from './version-info.jsx';
import { SettingsOutline, useSettingsOutline } from './settings-outline.jsx';
import { ImageFixSettings } from './image-fix-settings.jsx';
import css from './omd-settings.css';

async function request(path, body, signal) {
  const response = await fetch(path, body === undefined ? { signal } : { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(data.error || 'HTTP ' + response.status), { statusCode: response.status });
  return data;
}
const api = (path, body, signal) => request('oh-my-dsh/api' + path, body, signal);
const fmt = value => Number(value || 0).toLocaleString();
const ROUTE = { provider: '', model: '', temperature: 0.7, effort: 'off' };
const operationLabel = { enable: '正在开启…', disable: '正在关闭…', install: '正在开启…', update: '正在更新…', uninstall: '正在卸载…' };

// ---- Layout -----------------------------------------------------------------

function Group({ title, anchor, children }) {
  return <section className="omd-set-group" data-anchor={anchor}><h3 tabIndex={anchor ? -1 : undefined}>{title}</h3><div className="omd-set-card">{children}</div></section>;
}
function Row({ title, hint, children, extra, disabled }) {
  return <div className="omd-set-row" data-disabled={disabled || undefined}>
    <div className="omd-set-line"><div className="omd-set-copy">{title && <strong>{title}</strong>}{hint && <small>{hint}</small>}</div>{children && <div className="omd-set-control">{children}</div>}</div>
    {extra}
  </div>;
}
function Status({ children, error, action }) {
  if (!children) return null;
  return <div className={'omd-set-status' + (error ? ' omd-set-error' : '')} role={error ? 'alert' : 'status'}><span>{children}</span>{action}</div>;
}
function Toggle({ title, hint, checked, onChange, disabled, extra }) {
  return <Row title={title} hint={hint} extra={extra}><Switch label={title} checked={Boolean(checked)} disabled={disabled} onChange={onChange}/></Row>;
}

// Commits on blur or Enter; an invalid draft stays visible and is not written.
function NumberField({ label, hint, value, min = 0, max = Infinity, scale = 1, integer = true, optional = false, disabled, onCommit }) {
  const shown = value === undefined || value === null || value === '' ? '' : String(Number(value) / scale);
  const [draft, setDraft] = useState(shown), [invalid, setInvalid] = useState(false), focused = useRef(false);
  useEffect(() => { if (!focused.current) { setDraft(shown); setInvalid(false); } }, [shown, disabled]);
  const commit = () => {
    const raw = draft.trim();
    if (raw === '' && optional) { setInvalid(false); if (shown !== '') onCommit(undefined); return; }
    const display = Number(raw);
    const stored = scaledSettingValue(raw, scale, integer);
    if (!Number.isFinite(stored) || !(display >= min && display <= max)) { setInvalid(true); return; }
    setInvalid(false);
    if (stored !== Number(value)) onCommit(stored);
  };
  const range = max === Infinity ? `不小于 ${min} 的${integer && scale === 1 ? '整数' : '数字'}` : `${min}–${max} 之间的数字`;
  return <label className="omd-set-field" data-invalid={invalid || undefined}>
    <span>{label}</span>
    <Input inputMode="decimal" value={draft} disabled={disabled} aria-label={label} aria-invalid={invalid || undefined} placeholder={optional ? '提供方默认' : undefined}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; commit(); }}
      onChange={event => { setDraft(event.target.value); setInvalid(false); }}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); commit(); }
        else if (event.key === 'Escape' && draft !== shown) { event.stopPropagation(); setDraft(shown); setInvalid(false); }
      }}/>
    {invalid ? <small className="omd-set-invalid">请输入{range}</small> : hint && <small>{hint}</small>}
  </label>;
}
function Fields({ children }) { return <div className="omd-set-fields">{children}</div>; }

// ---- Data -------------------------------------------------------------------

// Every change is written at once; a rejected write restores the stored value.
function useConfig(report) {
  const [view, setView] = useState({ config: null, directory: [], error: '' });
  const current = useRef(null);
  useEffect(() => {
    const owner = createSettingsState({ read: () => api('/state'), write: patch => api('/settings', patch),
      onChange: setView, onError: report,
      onSaved: config => window.dispatchEvent(new CustomEvent('omd:settings-saved', { detail: config })) });
    current.current = owner; void owner.load();
    return () => { owner.dispose(); if (current.current === owner) current.current = null; };
  }, [report]);
  const commit = useCallback(patch => current.current?.commit(patch) ?? Promise.resolve(false), []);
  const reload = useCallback(() => current.current?.load(), []);
  return { ...view, commit, reload };
}

const componentApi = (body, signal) => request('oh-my-dsh/components', body, signal);
const dreamApi = (body, signal) => api('/dream/settings', body, signal);

// ---- Features ---------------------------------------------------------------

function FeatureRow({ plugin, features, thirdParty }) {
  const { state, error, pending, pendingInput, act } = features;
  const installed = state?.plugins.find(item => item.id === plugin.id);
  const operation = state?.busy?.id === plugin.id ? state.busy : pendingInput?.id === plugin.id ? pendingInput : null;
  const unavailable = installed && Object.hasOwn(installed, 'unavailable') ? installed.unavailable : plugin.unavailable;
  const cannotEnable = !installed?.installed && (unavailable || plugin.manualInstall);
  const locked = pending || !!state?.busy || !!error;
  const checked = operation ? ['enable', 'install'].includes(operation.action) || (operation.action === 'update' && installed?.enabled) : installed?.enabled === true;
  const status = operation ? <Status>{operationLabel[operation.action]}</Status>
    : installed?.error ? <Status error action={installed.enabled && !installed.readOnly && <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => void act({ id: plugin.id, action: 'enable' })}>重试</Button>}>{installed.error}</Status>
    : installed?.needsBuildSwitch && !unavailable ? <Status action={<Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => void act({ id: plugin.id, action: 'update' })}>更新</Button>}>{installed.message || '当前安装包面向其他 DSH 版本，需要更新为匹配版本。'}</Status>
    : installed?.restartRequired ? <Status>重启 DSH 后生效</Status>
    : installed?.readOnly ? <Status>此功能由宿主配置管理。</Status>
    : cannotEnable ? <Status>{unavailable || plugin.manualInstall}</Status>
    : installed?.message ? <Status>{installed.message}</Status> : null;
  const credit = thirdParty && <small className="omd-set-credit">
    <a href={plugin.url} target="_blank" rel="noopener noreferrer">{plugin.author}</a>
    {plugin.upstream && <> · <a href={plugin.upstream.url} target="_blank" rel="noopener noreferrer">原作者项目</a></>}
  </small>;
  return <Row title={plugin.name} hint={<>{plugin.description}{credit && <><br/>{credit}</>}</>} extra={status}>
    <Switch label={plugin.name} checked={checked} disabled={!installed || locked || installed.readOnly || !!cannotEnable}
      onChange={enabled => void act({ id: plugin.id, action: enabled ? 'enable' : 'disable' })}/>
  </Row>;
}

function CodeGraphRow({ components }) {
  const { state: d, error, pending: busy, requestError: actionError, act } = components;
  const cg = d?.codegraph;
  const retry = (label, body) => <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void act(body)}>{label}</Button>;
  const name = path => path.split(/[\\/]/).filter(Boolean).pop() || path;
  const lines = [];
  if (actionError || error) lines.push(<Status key="error" error>{actionError || error}</Status>);
  if (cg?.enabled) {
    if (cg.operation?.status === 'preparing') lines.push(<Status key="env">正在准备运行环境…</Status>);
    else if (cg.operation?.error || cg.error) lines.push(<Status key="env" error action={retry('重新准备', { action: 'prepare', component: 'codegraph' })}>{cg.operation?.error || cg.error}</Status>);
    else if (!cg.installed) lines.push(<Status key="env" action={!d.automatic && retry('准备', { action: 'prepare', component: 'codegraph' })}>{d.automatic ? '正在准备运行环境…' : '运行环境尚未准备'}</Status>);
    for (const project of cg.projects || []) {
      if (project.status === 'error') lines.push(<Status key={project.path} error action={retry('重试', { action: 'index', path: project.path })}>{name(project.path)} 索引失败：{project.error}</Status>);
      else if (project.status !== 'ready') lines.push(<Status key={project.path}>正在为 {name(project.path)} 建立索引…</Status>);
    }
  }
  return <Row title="代码理解" hint="为项目建立 CodeGraph 索引，修改后自动同步；索引保存在项目的 .codegraph 目录。" extra={lines}>
    <Switch label="代码理解" checked={cg?.enabled === true} disabled={!cg || busy} onChange={next => void act({ action: 'settings', patch: { codegraphEnabled: next } })}/>
  </Row>;
}

// ---- Context & memory ---------------------------------------------------------

const frequencyNames = [['always', '频繁'], ['medium', '适中'], ['slow', '较少'], ['custom', '自定义']];
const frequencyHints = { always: '更及时地整理，后台调用相对更多。', medium: '默认档位，积累一段工作后再整理。', slow: '合并更多事件再处理，更新也会更晚。', custom: '保留你的参数，按实际工作节奏调整。' };
const scopes = [['session', '会话隔离', '不自动读取共享记忆；会话 Dream 仅在本会话保存。'], ['project', '项目共享', '自动读取本项目短记忆，需要细节时向下回查。'], ['global', '全局记忆', '自动读取精简全局记忆和分页项目目录。']];

function Frequency({ config: c, commit }) {
  const [custom, setCustom] = useState(false);
  const value = custom ? 'custom' : contextFrequencyOf(c);
  const number = (key, label, min = 1, scale = 1) => <NumberField label={label} value={c[key]} min={min} scale={scale} onCommit={v => commit({ [key]: v })}/>;
  return <Row title="处理频率" hint={`${frequencyHints[value]} 当前：首批至少 ${c.digestWindow} 条可摘要的有效事件，后续每 ${c.digestEvery} 条新事件触发；中枢每 ${c.coordinatorEvery} 段新摘要，替换间隔 ${c.surgeryCooldownSteps} 步以上。`}
    extra={value === 'custom' && <Fields>
      {number('digestEvery', '预处理频率 · 新事件数')}{number('digestWindow', '目标分段窗口 · 事件数')}
      {number('coordinatorEvery', '中枢频率 · 新摘要数')}{number('coordinatorMinGapMs', '中枢最短间隔 · 秒', 0, 1000)}
      {number('surgeryCooldownSteps', '自动替换最短步数', 0)}
    </Fields>}>
    <SegmentedControl label="处理频率" value={value} options={frequencyNames.map(([id, label]) => ({ value: id, label }))}
      onChange={next => { if (next === 'custom') setCustom(true); else { setCustom(false); void commit(contextFrequencyPatch(next)); } }}/>
  </Row>;
}

function Dream({ dream, commit }) {
  const { state: s, error, pending, requestError } = dream;
  if (!s) return <Row title="自动 Dream" hint={error || '正在读取…'}/>;
  const folders = (s.folders || []).filter(f => f?.folder), chosen = s.dreamProjects || [];
  const toggleFolder = (folder, on) => commit({ dreamProjects: on ? [...new Set([...chosen, folder])] : chosen.filter(x => x !== folder) });
  const name = path => path.split(/[\\/]/).filter(Boolean).pop() || path;
  return <>
    <Status error>{requestError || error}</Status>
    <Toggle disabled={pending} title="自动 Dream" hint="定时检查新增摘要并整理长期记忆；没有新材料不调用模型。模型在“后台模型”中设置。" checked={s.enabled} onChange={v => commit({ dreamAutoEnabled: v })}
      extra={s.enabled && <>
        <Fields>
          <NumberField disabled={pending} label="检查间隔 · 分钟" value={s.intervalMs} min={0.001} scale={60000} onCommit={v => commit({ dreamIntervalMs: v })}/>
          <NumberField disabled={pending} label="原文整理等待 · 天" value={s.deepAgeMs} min={0.001} scale={86400000} onCommit={v => commit({ dreamDeepAgeMs: v })}/>
          <NumberField disabled={pending} label="每日 token 上限" value={s.dailyTokens} min={0} onCommit={v => commit({ dreamDailyTokens: v })}/>
        </Fields>
        <div className="omd-set-folders" role="group" aria-label="整理的文件夹">
          <small>整理的文件夹 · 不勾选表示全部</small>
          {folders.map(f => <div className="omd-set-folder" key={f.folder} title={f.folder}>
            <Checkbox disabled={pending} label={name(f.folder)} checked={chosen.includes(f.folder)} onChange={on => toggleFolder(f.folder, on)}/>
            <small>{f.exists === false ? '已删除 · ' : ''}{(f.projects || []).length} 个项目</small>
          </div>)}
          {!folders.length && <small>尚未读取到工作区文件夹。</small>}
        </div>
      </>}/>
  </>;
}

// ---- Background models ----------------------------------------------------------

function RouteEditor({ title, value, directory, onChange }) {
  const r = { ...ROUTE, ...value };
  const models = directory.find(p => p.id === r.provider)?.models || [];
  const update = (key, next) => onChange({ ...r, [key]: next, ...(key === 'provider' ? { model: '' } : {}) });
  const providers = [{ value: '', label: '跟随主模型' }, ...(r.provider && !directory.some(p => p.id === r.provider) ? [{ value: r.provider, label: r.provider }] : []), ...directory.map(p => ({ value: p.id, label: p.name || p.id }))];
  const modelOptions = [{ value: '', label: '跟随主模型' }, ...(r.model && !models.some(m => m.id === r.model) ? [{ value: r.model, label: r.model }] : []), ...models.map(m => ({ value: m.id, label: m.name || m.id }))];
  const efforts = [...new Set(['off', 'low', 'medium', 'high', 'max', r.effort || 'off'])].map(v => ({ value: v, label: v }));
  return <div className="omd-set-route"><small>{title}</small><Fields>
    <label className="omd-set-field"><span>提供方</span><Choice aria-label={title + '提供方'} value={r.provider} options={providers} onChange={v => update('provider', v)}/></label>
    <label className="omd-set-field"><span>模型</span><Choice aria-label={title + '模型'} value={r.model} options={modelOptions} disabled={!r.provider} onChange={v => update('model', v)}/></label>
    <label className="omd-set-field"><span>推理强度</span><Choice aria-label={title + '推理强度'} value={r.effort || 'off'} options={efforts} onChange={v => update('effort', v)}/></label>
    <NumberField label="Temperature" value={r.temperature} min={0} max={2} integer={false} optional onCommit={v => update('temperature', v)}/>
  </Fields></div>;
}

function BackgroundModels({ config: c, directory, commit, dream, commitDream }) {
  const [editUnified, setEditUnified] = useState(false);
  const savedRouting = contextRouteMode(c), routing = savedRouting === 'follow' && editUnified ? 'unified' : savedRouting;
  const choose = async mode => {
    setEditUnified(mode === 'unified');
    const saved = await commit(mode === 'follow' ? { backgroundMode: 'unified', unifiedBackground: { ...ROUTE } }
      : { backgroundMode: mode === 'separate' ? 'separate' : 'unified' });
    if (!saved) setEditUnified(false);
  };
  const s = dream.state, [pendingProvider, setPendingProvider] = useState(null);
  const dreamProvider = pendingProvider ?? s?.provider ?? '';
  const dreamModels = directory.find(p => p.id === dreamProvider)?.models || [];
  const routeEmpty = routing === 'follow';
  return <>
    <Row title="预处理与中枢" hint="主执行模型仍在 DSH 的模型设置中选择。"
      extra={routing === 'unified' ? <RouteEditor title="预处理与中枢" value={c.unifiedBackground} directory={directory} onChange={v => commit({ unifiedBackground: v })}/>
        : routing === 'separate' ? <><RouteEditor title="预处理 AI" value={c.background} directory={directory} onChange={v => commit({ background: v })}/><RouteEditor title="中枢 AI" value={c.surgeon} directory={directory} onChange={v => commit({ surgeon: v })}/></> : null}>
      <SegmentedControl label="后台模型配置方式" value={routing} options={[{ value: 'follow', label: '跟随主模型' }, { value: 'unified', label: '统一配置' }, { value: 'separate', label: '分别配置' }]} onChange={choose}/>
    </Row>
    {c.memoryCacheEnabled && <Row hint="记忆缓存模式已开启：预处理跟随最近成功的主执行请求，中枢继续使用这里的配置。"/>}
    {s && <Row title="Dream" hint={pendingProvider ? '再选择模型后生效。' : routeEmpty && s.enabled && !s.provider ? '跟随主模型时，自动 Dream 需要指定提供方与模型。' : '默认沿用上面的后台模型。'}
      extra={dreamProvider && <Fields>
        <label className="omd-set-field"><span>模型</span><Choice disabled={dream.pending} aria-label="Dream 模型" value={pendingProvider ? '' : s.model}
          options={[...(pendingProvider ? [{ value: '', label: '请选择' }] : []), ...(s.model && !pendingProvider && !dreamModels.some(m => m.id === s.model) ? [{ value: s.model, label: s.model }] : []), ...dreamModels.map(m => ({ value: m.id, label: m.name || m.id }))]}
          onChange={model => { if (!model) return; setPendingProvider(null); void commitDream({ dreamProvider, dreamModel: model }); }}/></label>
      </Fields>}>
      <Choice disabled={dream.pending} aria-label="Dream 提供方" value={dreamProvider}
        options={[{ value: '', label: '沿用后台模型' }, ...directory.map(p => ({ value: p.id, label: p.name || p.id }))]}
        onChange={provider => { if (!provider) { setPendingProvider(null); void commitDream({ dreamProvider: '', dreamModel: '' }); } else setPendingProvider(provider); }}/>
    </Row>}
  </>;
}

// ---- Global background ------------------------------------------------------------

function GlobalBackground() {
  const [g, setG] = useState({ text: '', saved: '', revision: 0, loaded: false, error: '', status: '', conflict: false, latest: null, busy: false });
  const loading = useRef(false);
  const load = useCallback(async () => {
    if (loading.current) return; loading.current = true;
    try {
      const value = await api('/context/global');
      setG(old => old.loaded ? { ...old, latest: value, error: '' } : { ...old, text: value.text, saved: value.text, revision: value.revision, loaded: true, error: '' });
    } catch (e) { setG(old => ({ ...old, error: e.message })); }
    finally { loading.current = false; }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    if (g.busy || !g.loaded || g.conflict) return;
    setG(old => ({ ...old, busy: true, error: '', status: '' }));
    try { const value = await api('/context/global', { text: g.text, revision: g.revision }); setG(old => savedBackground(old, value, g.text)); }
    catch (e) { setG(old => ({ ...old, busy: false, error: e.message, ...(e.statusCode === 409 ? { conflict: true, latest: null } : {}) })); }
  };
  const adopt = keepDraft => setG(old => old.latest ? { ...old, saved: old.latest.text, revision: old.latest.revision, conflict: false, error: '', status: '', ...(keepDraft ? {} : { text: old.latest.text, latest: null }) } : old);
  const dirty = g.text !== g.saved;
  return <div className="omd-set-row">
    <label className="omd-set-field omd-set-wide"><span>全局固定背景 · {fmt(g.text.length)} 字符</span>
      <textarea aria-label="全局固定背景" rows={10} value={g.text} disabled={!g.loaded} placeholder="写下适用于项目会话的固定背景，例如工作习惯、环境约定。" onChange={event => setG(old => ({ ...old, text: event.target.value, status: '' }))}/>
      <small>只由你维护，后台 AI 不自动改写。项目会话可读取；私有会话不读取。其他窗口改过时，保存会提示冲突而不会覆盖。</small>
    </label>
    <Status error action={!g.loaded ? <Button type="button" size="sm" variant="ghost" onClick={load}>重新读取</Button> : g.conflict && <Button type="button" size="sm" variant="ghost" onClick={load}>读取最新版本</Button>}>{g.error}</Status>
    {g.latest && <div className="omd-set-compare">
      <label className="omd-set-field omd-set-wide"><span>其他窗口保存的内容</span><textarea aria-label="其他窗口保存的内容" rows={5} readOnly value={g.latest.text}/></label>
      <div className="omd-set-actions"><Button type="button" size="sm" variant="outline" disabled={!g.conflict} onClick={() => adopt(true)}>保留草稿，继续编辑</Button><Button type="button" size="sm" variant="outline" onClick={() => adopt(false)}>使用最新内容</Button></div>
    </div>}
    <div className="omd-set-actions">
      <Status>{g.status}</Status>
      <Button type="button" size="sm" variant="ghost" disabled={!dirty || g.busy} onClick={() => setG(old => ({ ...old, text: old.saved, status: '' }))}>撤销</Button>
      <Button type="button" size="sm" variant="primary" disabled={!dirty || g.busy || !g.loaded || g.conflict} onClick={save}>{g.busy ? '保存中…' : '保存'}</Button>
    </div>
  </div>;
}

// ---- Agent ----------------------------------------------------------------------------

function AgentHints({ config: c, commit }) {
  const verificationId = useId(), verificationMode = c.taskVerificationMode ?? 'default';
  const intervals = [1, 3, 5, 10];
  const [customBudget, setCustomBudget] = useState(false);
  const budgetCustom = customBudget || !intervals.includes(c.budgetInjectionEvery ?? 1);
  return <>
    <Row title="系统提示词风格"><Choice aria-label="系统提示词风格" value={c.promptStyle ?? 'omd'} options={PROMPT_STYLES} onChange={value => commit({ promptStyle: value })}/></Row>
    <Toggle title="启用会话提示词风格" checked={c.sessionPromptStyleEnabled === true} onChange={value => commit({ sessionPromptStyleEnabled: value })}/>
    <Toggle title="向模型提供运行状态" hint="与待办一起投递时间、上下文与后台任务状态，从下一次请求生效。" checked={c.stateHintsEnabled} onChange={v => commit({ stateHintsEnabled: v })}/>
    <Toggle title="向模型提供预算" hint="用 /预算 token=100k 轮次=30 时间=20m 设置；未设置显示无限制，达到预算不强制停止。" checked={c.budgetHintsEnabled} onChange={v => commit({ budgetHintsEnabled: v })}
      extra={c.budgetHintsEnabled && <div className="omd-set-sub">
        <Toggle title="每轮注入预算" hint="按所选间隔额外注入预算，不重复投递 Todo 或完整运行状态。" checked={c.budgetEveryStep} onChange={v => commit({ budgetEveryStep: v })}
          extra={c.budgetEveryStep && <Fields>
            <label className="omd-set-field"><span>预算注入频率</span><Choice aria-label="预算注入频率" value={budgetCustom ? 'custom' : String(c.budgetInjectionEvery ?? 1)}
              options={[...intervals.map(n => ({ value: String(n), label: n === 1 ? '每轮' : `每 ${n} 轮` })), { value: 'custom', label: '自定义间隔' }]}
              onChange={v => { const custom = v === 'custom'; setCustomBudget(custom); if (!custom) void commit({ budgetInjectionEvery: Number(v) }); }}/></label>
            {budgetCustom && <NumberField label="调用间隔 · 轮" value={c.budgetInjectionEvery ?? 1} min={1} onCommit={v => commit({ budgetInjectionEvery: v })}/>}
          </Fields>}/>
      </div>}/>
    <Toggle title="优化后台任务与等待" hint="长命令自动让出、完成结果预览和可中断等待；需要本版配套 DSH 运行时。" checked={c.backgroundTasksEnabled} onChange={v => commit({ backgroundTasksEnabled: v })}/>
    <Row title="任务验证默认档位" hint={<span id={`${verificationId}-${verificationMode}-panel`} role="tabpanel" aria-labelledby={`${verificationId}-${verificationMode}`}>{TASK_VERIFICATION_HINTS[verificationMode]} 未在 BT 单独选择的会话使用此档位。</span>}>
      <SegmentedControl id={verificationId} label="任务验证默认档位" value={verificationMode} options={TASK_VERIFICATION_OPTIONS} onChange={value => commit({ taskVerificationMode: value })}/>
    </Row>
    <Toggle title="任务约束前置（CFR）" hint="在系统和待办工具提示词中加入约束提取、推导与核对规则，从下一次请求生效。" checked={c.todoConstraintFirst} onChange={v => commit({ todoConstraintFirst: v })}/>
  </>;
}

// ---- Page ---------------------------------------------------------------------------------

function HistorySize() {
  const [size, setSize] = useState(historySize), [error, setError] = useState('');
  useEffect(() => {
    const sync = event => { if (event.key === HISTORY_SIZE_KEY || event.key === null) setSize(historySize()); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  return <Row title="每次加载历史" hint="初次打开对话和“加载更早”时读取的条数，保存在当前浏览器。" extra={<Status error>{error}</Status>}>
    <Choice aria-label="每次加载历史" value={String(size)} options={HISTORY_SIZES.map(v => ({ value: String(v), label: `${v} 条${v === 200 ? '（默认）' : ''}` }))}
      onChange={v => { try { localStorage.setItem(HISTORY_SIZE_KEY, v); setSize(Number(v)); setError(''); } catch { setError('浏览器无法保存加载数量，原设置保持不变。'); } }}/>
  </Row>;
}

function ThirdParty({ features, onBack }) {
  const [query, setQuery] = useState('');
  const search = query.trim().toLocaleLowerCase();
  const entries = recommendedPlugins.filter(plugin => plugin.section !== 'features')
    .filter(plugin => [plugin.name, plugin.author, plugin.description, plugin.category].join(' ').toLocaleLowerCase().includes(search));
  const head = useRef(null);
  useEffect(() => { head.current?.querySelector('button')?.focus(); }, []);
  return <>
    <header className="omd-set-subhead" ref={head}>
      <Button type="button" size="sm" variant="ghost" aria-label="返回 Oh My DSH 设置" onClick={onBack}><Icon name="chevron" size={14} className="omd-set-back"/>Oh My DSH</Button>
      <h2>第三方功能</h2>
    </header>
    {features.error && <Status error action={<Button type="button" size="sm" variant="ghost" onClick={() => features.refresh()}>重新读取</Button>}>{features.error}</Status>}
    {features.requestError && <Status error>{features.requestError}</Status>}
    <Input className="omd-native-search" icon={<Icon name="search" size={16}/>} type="search" aria-label="搜索第三方功能" placeholder="搜索功能或作者" value={query} onChange={event => setQuery(event.target.value)}/>
    <div className="omd-set-card">
      {entries.map(plugin => <FeatureRow key={plugin.id} plugin={plugin} features={features} thirdParty/>)}
      {!entries.length && <Row hint={search ? '没有找到匹配的功能。' : '暂无可用功能。'}/>}
    </div>
    <a className="omd-set-link" href="https://github.com/gulagala001/oh-my-dsh/issues/new?template=plugin-submission.yml" target="_blank" rel="noopener noreferrer">推荐其他功能<Icon name="external" size={12}/></a>
  </>;
}

function ProjectCredits({ onBack }) {
  const head = useRef(null);
  useEffect(() => { head.current?.querySelector('button')?.focus(); }, []);
  return <>
    <header className="omd-set-subhead" ref={head}>
    <Button type="button" size="sm" variant="ghost" aria-label="返回 Oh My DSH 设置" onClick={onBack}><Icon name="chevron" size={14} className="omd-set-back"/>Oh My DSH</Button>
      <h2>项目、组件与致谢</h2>
    </header>
    <Group title="来源清单">
      <Row title="完整来源与依赖" hint="自有独立产品、社区集成、宿主、数据和素材；各项目保留原作者、维护者和许可。">
        <a className="omd-set-link" href="https://github.com/gulagala001/oh-my-dsh/blob/main/docs/components.md" target="_blank" rel="noreferrer">完整清单与许可</a>
      </Row>
      {projectCredits.projects.map(project => <Row key={project.id} title={project.name} hint={<>{project.purpose.zh}<br/>{project.authors}<br/>{project.relationship.zh}</>}>
        <a className="omd-set-link" href={project.url} target="_blank" rel="noreferrer">项目</a>
        {' · '}<a className="omd-set-link" href={`https://github.com/gulagala001/oh-my-dsh/blob/main/${project.notice}`} target="_blank" rel="noreferrer">来源与许可</a>
      </Row>)}
    </Group>
  </>;
}

export function applyOmdSettings(ctx, { optimizer, persona }) {
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.plugin = 'omd-settings'; tag.textContent = css; document.head.append(tag);
    return () => tag.remove();
  });
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'oh-my-dsh', order: 16, label: () => 'Oh My DSH' }, OmdSettings));
  function OmdSettings() {
    const [notice, setNotice] = useState('');
    useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);
    const report = useCallback(message => setNotice(message), []);
    const { config: c, directory, error, commit, reload } = useConfig(report);
    const features = usePollingAction(pluginApi, 2000);
    const components = usePollingAction(componentApi, 2500);
    const dream = usePollingAction(dreamApi, 30000);
    const prefs = useSyncExternalStore(optimizer.subscribe, optimizer.getSnapshot);
    const [page, setPage] = useState('main');
    const body = useRef(null), mainScroll = useRef(0);

    const commitDream = dream.act;
    const setPref = patch => { try { optimizer.set(patch); } catch { report('浏览器无法保存设置，原设置保持不变。'); } };

    const go = next => {
      if (next !== 'main') mainScroll.current = body.current?.scrollTop ?? 0;
      setPage(next);
    };
    useLayoutEffect(() => { if (page === 'main' && body.current) body.current.scrollTop = mainScroll.current; else if (body.current) body.current.scrollTop = 0; }, [page]);
    const outline = useSettingsOutline(body, page, Boolean(c), setPage);

    const features_ = recommendedPlugins.filter(plugin => plugin.section === 'features');
    const featureUpdating = features.state?.updating || features.state?.busy?.action === 'update';
    const content = page === 'credits' ? <ProjectCredits onBack={() => go('main')}/> : page === 'third-party' ? <ThirdParty features={features} onBack={() => go('main')}/> : !c ? <div className="omd-set-empty">
      {error ? <Status error action={<Button type="button" size="sm" variant="ghost" onClick={reload}>重试</Button>}>{error}</Status> : <p>正在读取设置…</p>}
    </div> : <>
      <Status error action={<Button type="button" size="sm" variant="ghost" onClick={reload}>重新读取</Button>}>{error}</Status>
      <Group title="功能" anchor="features">
        {features.error && <Status error action={<Button type="button" size="sm" variant="ghost" onClick={() => features.refresh()}>重新读取</Button>}>{features.error}</Status>}
        {features.requestError && <Status error>{features.requestError}</Status>}
        {features_.map(plugin => <FeatureRow key={plugin.id} plugin={plugin} features={features}/>)}
        <CodeGraphRow components={components}/>
        <Toggle title="提示词优化" hint="在输入框显示优化入口，发送前润色或整理草稿。" checked={prefs.enabled} onChange={enabled => setPref({ enabled })}/>
        <button type="button" className="omd-set-row omd-set-nav" onClick={() => go('third-party')}>
          <span className="omd-set-copy"><strong>第三方功能</strong><small>社区作者制作的功能，开启即自动安装。</small></span><Icon name="chevron" size={16}/>
        </button>
      </Group>
      <Group title="人格" anchor="personality"><PersonaSettings client={persona}/></Group>
      <Group title="上下文与记忆" anchor="context">
        <ImageFixSettings config={c} directory={directory} commit={commit}/>
        <Toggle title="上下文优化" hint="默认开启：精简重复内容、按需加载工具，保留原文供回查。关闭不影响 CodeGraph、历史压缩和记忆。" checked={c.contextOptimizationEnabled !== false} onChange={v => commit({ contextOptimizationEnabled: v })}/>
        <Toggle title="后台预处理与中枢" hint="提前生成基础摘要和详细资料，再判断如何替换。" checked={c.contextEnabled} onChange={v => commit({ contextEnabled: v })}/>
        <Toggle title="自动应用已完成决定" hint="在请求边界应用；关闭后仍可手动替换。" checked={c.automaticReplace} onChange={v => commit({ automaticReplace: v })}/>
        <Frequency config={c} commit={commit}/>
        <Toggle title="按消息边界分段" hint="默认整窗处理；开启恢复兼容分段。系统提示词、前置 CoT、近期保留区和完整工具往返始终受保护。" checked={c.preprocessBoundaries} onChange={v => commit({ preprocessBoundaries: v })}/>
        <Toggle title="记忆缓存模式" hint="预处理与 Auto Compact 的预处理跟随最近成功的主执行请求，尽量复用相同前缀；缓存命中和费用取决于提供方。" checked={c.memoryCacheEnabled} onChange={v => commit({ memoryCacheEnabled: v })}/>
        <Toggle title="Auto Compact" hint="独立于宿主自动压缩，按当前上下文总 token 数触发；工具往返与受保护提示词保持完整。" checked={c.autoCompactEnabled} onChange={v => commit({ autoCompactEnabled: v })}
          extra={c.autoCompactEnabled && <Fields>
            <NumberField label="触发阈值 · tokens" value={c.autoCompactThreshold} min={1} onCommit={v => commit({ autoCompactThreshold: v })}/>
            <label className="omd-set-field"><span>压缩内容</span><Choice aria-label="压缩内容" value={c.autoCompactMode || 'detail'} options={[{ value: 'detail', label: '摘要＋资料' }, { value: 'brief', label: '仅摘要' }]} onChange={v => commit({ autoCompactMode: v })}/>
              <small>仅摘要让资料退出当前上下文，但保留存档。</small></label>
          </Fields>}/>
        <Toggle title="空闲时自动预处理" hint="仅在会话真正空闲且有待处理内容时触发；不影响按新事件数量触发的正常预处理。" checked={c.idlePreprocessEnabled} onChange={v => commit({ idlePreprocessEnabled: v })}
          extra={c.idlePreprocessEnabled && <Fields><NumberField label="空闲等待时间 · 秒" value={c.flushIdleMs} min={0} scale={1000} hint="默认 90 秒。" onCommit={v => commit({ flushIdleMs: v })}/></Fields>}/>
        <Row title="新会话默认范围" hint={scopes.find(([id]) => id === (c.memoryScope === 'full' ? 'project' : c.memoryScope))?.[2] + ' 已开始的会话保持原有绑定。'}>
          <SegmentedControl label="新会话默认范围" value={c.memoryScope === 'full' ? 'project' : c.memoryScope} options={scopes.map(([value, label]) => ({ value, label }))} onChange={v => commit({ memoryScope: v })}/>
        </Row>
        <Toggle title="CoT 前置" hint="上下文替换时保留提供方已公开的推理文本，不另行生成；可能扩大缓存失效范围。" checked={c.traceEnabled} onChange={v => commit({ traceEnabled: v })}
          extra={c.traceEnabled && <Fields><NumberField label="推理文本字符上限" value={c.traceMaxChars} min={0} hint="0 保留全文；正数保留尾部并标注截取。" onCommit={v => commit({ traceMaxChars: v })}/></Fields>}/>
        <div data-anchor="dream"><Dream dream={dream} commit={commitDream}/></div>
      </Group>
      <Group title="后台模型" anchor="models"><BackgroundModels config={c} directory={directory} commit={commit} dream={dream} commitDream={commitDream}/></Group>
      <Group title="全局背景" anchor="background"><GlobalBackground/></Group>
      <Group title="智能体" anchor="agents"><AgentHints config={c} commit={commit}/></Group>
      <Group title="关于" anchor="about">
        <Toggle title="插件安装预检" hint="安装前在临时环境检查启动和基础界面；通过后自动继续，失败时可选择仍然安装或复制 AI 修复信息。" checked={c.pluginPreflightEnabled !== false}
          onChange={value => commit({ pluginPreflightEnabled: value })}/>
        <button type="button" className="omd-set-row omd-set-nav" onClick={() => go('credits')}>
          <span className="omd-set-copy"><strong>项目、组件与致谢</strong><small>查看独立产品、社区作者、组件来源与许可。</small></span><Icon name="chevron" size={16}/>
        </button>
        <Row title="版本" extra={featureUpdating && <Status>正在更新已开启的功能…</Status>}>
          <VersionInfo row onCheck={() => void features.act({ action: 'update-all' })}/>
        </Row>
        <Toggle title="自动更新扩展功能" hint="空闲时检查已开启的功能，只使用已核验版本；需要重启时会提示。" checked={features.state?.autoUpdate === true}
          disabled={!features.state || features.pending || !!features.state?.busy} onChange={value => void features.act({ action: 'settings', autoUpdate: value })}/>
      </Group>
      <details className="omd-set-advanced" data-anchor="advanced">
        <summary>高级</summary>
        <Group title="预处理与额度">
          <Row extra={<Fields>
            <NumberField label="参考前文 · 事件数" value={c.digestLookback} min={0} onCommit={v => commit({ digestLookback: v })}/>
            <NumberField label="失败重试最多处理窗口数" value={c.prepareBatchWindows} min={1} onCommit={v => commit({ prepareBatchWindows: v })}/>
            <NumberField label="预处理最低文本量 · tokens" value={c.prepareContinueTokens} min={1} onCommit={v => commit({ prepareContinueTokens: v })}/>
            <NumberField label="单窗输入预算 · tokens" value={c.prepareInputTokens} min={1} onCommit={v => commit({ prepareInputTokens: v })}/>
            <NumberField label="基础摘要目标 · 字符" value={c.summaryTargetChars} min={1} onCommit={v => commit({ summaryTargetChars: v })}/>
            <NumberField label="后台最大并发调用" value={c.backgroundConcurrency} min={1} onCommit={v => commit({ backgroundConcurrency: v })}/>
            <NumberField label="自动重试次数" value={c.backgroundMaxRetries} min={0} onCommit={v => commit({ backgroundMaxRetries: v })}/>
          </Fields>}/>
        </Group>
        <Group title="中枢与替换">
          <Row extra={<Fields>
            <NumberField label="中枢近期原文窗口" value={c.coordinatorRecentEvents} min={0} onCommit={v => commit({ coordinatorRecentEvents: v })}/>
            <NumberField label="暂留近期事件数" value={c.keepTailEvents} min={0} onCommit={v => commit({ keepTailEvents: v })}/>
          </Fields>}/>
          <Toggle title="替换后的总量应更小" hint="将摘要、详细资料和前置 Trace 一起计算。" checked={c.requireShorter} onChange={v => commit({ requireShorter: v })}/>
        </Group>
        <Group title="资源上限">
          <Row extra={<Fields>
            <NumberField label="预处理输出 Token 上限" value={c.digestMaxTokens} min={0} hint="0 使用提供方默认。" onCommit={v => commit({ digestMaxTokens: v })}/>
            <NumberField label="中枢输出 Token 上限" value={c.surgeonMaxTokens} min={0} onCommit={v => commit({ surgeonMaxTokens: v })}/>
            <NumberField label="后台超时 · 秒" value={c.jobTimeoutMs} min={0} scale={1000} hint="默认 600 秒；0 不设置插件超时。" onCommit={v => commit({ jobTimeoutMs: v })}/>
          </Fields>}/>
        </Group>
        <Group title="其他">
          <Toggle title="启动时自动准备依赖" hint="关闭后，代码理解需要手动准备运行环境。" checked={components.state?.automatic} disabled={!components.state || components.pending}
            onChange={v => components.act({ action: 'settings', patch: { componentAutoSetup: v } })}/>
          <HistorySize/>
        </Group>
      </details>
    </>;
    return <div className="cx-panel cx-settings omd-settings">
      {notice && <div className="omd-set-notice" role="alert"><span>{notice}</span><Button type="button" size="sm" variant="ghost" aria-label="关闭提示" onClick={() => setNotice('')}><Icon name="close" size={14}/></Button></div>}
      <div className="omd-set-layout" data-outline={outline.enabled || undefined}>
        {outline.enabled && <SettingsOutline {...outline}/>}
        <div className="omd-set-body" ref={body}>{content}</div>
      </div>
    </div>;
  }
}
