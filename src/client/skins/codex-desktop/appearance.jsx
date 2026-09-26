import React from 'react';
import { Personalization } from '../personalization.jsx';
import { HistorySizeSetting } from '../../history-settings.jsx';

export function CodexAppearance({ runtime, state, act, importFile, error }) {
  return <section className="tx-app omd-appearance codex-appearance">
    <h2>外观</h2>
    <div className="codex-setting-group">
      <label className="omd-appearance-row"><span>明暗模式<small>选择浅色、深色或跟随系统</small></span>
        <select aria-label="明暗模式" value={runtime.getAppearance()} onChange={e => act(() => runtime.setAppearance(e.target.value))}>
          <option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option>
        </select>
      </label>
      <div className="codex-theme-preview" aria-hidden="true">
        <span className="codex-preview-sidebar"><i/><i/><i/></span>
        <span className="codex-preview-chat"><i/><i/><i/><b/></span>
        <span className="codex-preview-pane"><i/><i/><i/></span>
      </div>
    </div>
    <div className="codex-setting-group">
      <label className="omd-appearance-row"><span>主题</span><select aria-label="主题" value={state.selected} onChange={e => act(() => runtime.select(e.target.value))}>
        <option value="default">OMD 默认</option>{state.skins.map(s => <option key={s.id} value={s.id}>{s.name} · {s.version}</option>)}
      </select></label>
      <label className="omd-appearance-row"><span>降低透明与动态效果<small>使用实色表面并减少动画</small></span>
        <input className="codex-switch" type="checkbox" checked={state.reduceEffects} onChange={e => act(() => runtime.reduceEffects(e.target.checked))}/>
      </label>
      <div className="omd-appearance-row"><span>导入主题<small>选择 .omd-skin.json 文件</small></span>
        <label className="codex-import">选择文件<input aria-label="导入主题" type="file" accept=".json,application/json" onChange={importFile}/></label>
      </div>
    </div>
    <Personalization {...{ runtime, state, act }}/>
    <h3>对话</h3>
    <div className="codex-setting-group"><HistorySizeSetting/></div>
    <div className="omd-appearance-actions">
      <button type="button" className="tx-button" onClick={() => act(() => runtime.reset())}>恢复默认主题</button>
      {!state.skins.find(s => s.id === state.selected)?.builtin && <button type="button" className="tx-button" onClick={() => act(() => runtime.remove(state.selected))}>移除当前主题</button>}
    </div>
    <p className="omd-appearance-help">外观设置自动保存到当前浏览器。</p>
    {(error || state.error) && <p role="alert">{error || state.error}</p>}
  </section>;
}
