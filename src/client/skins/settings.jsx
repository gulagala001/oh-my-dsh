import React, { useState, useSyncExternalStore } from 'react';
import { createSkinRuntime } from './runtime.mjs';
import { MAX_SKIN_BYTES } from './format.mjs';
import adapterCss from './adapter.css';
import appearanceCss from './appearance.css';
import { Personalization } from './personalization.jsx';
import iosLiquidLayout from './ios-liquid-glass/layout.css';
import codexDesktopLayout from './codex-desktop/layout.css';
import { CodexAppearance } from './codex-desktop/appearance.jsx';
import { applyCodexIntegration } from './codex-desktop/integration.jsx';
import materialLayout from './google-material-expressive/layout.css';
import { MaterialAppearance } from './google-material-expressive/appearance.jsx';
import { applyMaterialIntegration, MATERIAL_LAYOUT } from './google-material-expressive/integration.jsx';
import claudeTerminalLayout from './claude-cli-terminal/layout.css';
import { applyTerminalPresentation } from './claude-cli-terminal/presentation.jsx';
import { HistorySizeSetting } from '../history-settings.jsx';
import { applySidebarPresentation } from '../sidebar.jsx';
import { AppearanceDrafts, useAppearanceDrafts } from './advanced.jsx';

function AppearanceSettings({ runtime }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [error, setError] = useState('');
  const drafts = useAppearanceDrafts();
  const act = (action, leaving = false) => {
    if (leaving && !drafts.flush()) return false;
    const saved = () => { setError(''); return true; };
    const failed = e => { setError(e.message); return false; };
    try {
      const result = action();
      return result && typeof result.then === 'function' ? Promise.resolve(result).then(saved, failed) : saved();
    } catch (e) { return failed(e); }
  };
  const importFile = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_SKIN_BYTES) throw new Error('主题包不能超过 1 MB');
      const value = JSON.parse(await file.text());
      act(() => runtime.import(value), true);
    } catch (e) { setError(e instanceof SyntaxError ? '主题文件不是有效的 JSON' : e.message); }
  };
  const layout = state.skins.find(s => s.id === state.selected)?.layout;
  return <AppearanceDrafts.Provider value={drafts}>{layout === MATERIAL_LAYOUT ? <MaterialAppearance {...{ runtime, state, act, importFile, error }}/>
    : layout === 'codex-desktop' ? <CodexAppearance {...{ runtime, state, act, importFile, error }}/>
    : <section className="tx-app tx-recommended omd-appearance">
    <div className="tx-recommended-heading"><div><h2>外观</h2><p>主题即时生效，保存在当前浏览器。明暗模式与通用设置保持同步。</p></div></div>
    {(error || state.error) && <p className="omd-appearance-error" role="alert">{error || state.error}</p>}
    <label className="omd-appearance-row">主题<select aria-label="主题" value={state.selected} onChange={e => { const value = e.target.value; act(() => runtime.select(value), true); }}>
      <option value="default">OMD 默认</option>{state.skins.map(s => <option key={s.id} value={s.id}>{s.name} · {s.version}</option>)}
    </select></label>
    <label className="omd-appearance-row">明暗模式<select aria-label="明暗模式" value={runtime.getAppearance()} onChange={e => act(() => runtime.setAppearance(e.target.value))}>
      <option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option>
    </select></label>
    <label className="omd-appearance-row"><span>降低透明与动态效果</span><input type="checkbox" checked={state.reduceEffects} onChange={e => act(() => runtime.reduceEffects(e.target.checked))}/></label>
    <label className="omd-appearance-row">导入主题<input aria-label="导入主题" type="file" accept=".json,application/json" onChange={importFile}/></label>
    <p className="omd-appearance-help">选择 .omd-skin.json 文件；导入同一主题会更新已有版本。</p>
    <div className="omd-appearance-actions"><button type="button" className="tx-button" onClick={() => act(() => runtime.reset(), true)}>恢复默认主题</button>
      {state.selected !== 'default' && !state.skins.find(s => s.id === state.selected)?.builtin && <button type="button" className="tx-button" onClick={() => act(() => runtime.remove(state.selected), true)}>移除当前主题</button>}</div>
    <Personalization {...{ runtime, state, act }}/>
    <HistorySizeSetting/>
  </section>}</AppearanceDrafts.Provider>;
}
export function applySkins(ctx) {
  applySidebarPresentation(ctx);
  let runtime;
  ctx.effect(() => { runtime = createSkinRuntime(ctx, adapterCss, { 'ios-liquid': iosLiquidLayout, 'codex-desktop': codexDesktopLayout, 'claude-cli-terminal': claudeTerminalLayout, [MATERIAL_LAYOUT]: materialLayout }, appearanceCss); return () => runtime.dispose(); });
  applyMaterialIntegration(ctx, () => runtime);
  applyCodexIntegration(ctx, () => runtime);
  applyTerminalPresentation(ctx, () => runtime);
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'omd-appearance', order: 15, label: () => '外观' }, () => <AppearanceSettings runtime={runtime}/>));
  return () => runtime;
}
