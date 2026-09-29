import React from 'react';
import { ThemeSelect, AppearanceSelect, EffectsToggle, ThemeImport, ThemeActions } from '../controls.jsx';
import { Personalization } from '../personalization.jsx';
import { HistorySizeSetting } from '../../history-settings.jsx';

export function CodexAppearance({ runtime, state, act, importFile, error }) {
  return <section className="tx-app omd-appearance codex-appearance">
    <h2>外观</h2>
    {(error || state.error) && <p className="omd-appearance-error" role="alert">{error || state.error}</p>}
    <div className="codex-setting-group">
      <label className="omd-appearance-row"><span>明暗模式<small>选择浅色、深色或跟随系统</small></span>
        <AppearanceSelect {...{ runtime, act }} systemLast/>
      </label>
      <div className="codex-theme-preview" aria-hidden="true">
        <span className="codex-preview-sidebar"><i/><i/><i/></span>
        <span className="codex-preview-chat"><i/><i/><i/><b/></span>
        <span className="codex-preview-pane"><i/><i/><i/></span>
      </div>
    </div>
    <div className="codex-setting-group">
      <label className="omd-appearance-row"><span>主题</span><ThemeSelect {...{ runtime, state, act }}/></label>
      <label className="omd-appearance-row"><span>降低透明与动态效果<small>使用实色表面并减少动画</small></span>
        <EffectsToggle {...{ runtime, state, act }} className="codex-switch"/>
      </label>
      <div className="omd-appearance-row"><span>导入主题<small>选择 .omd-skin.json 文件</small></span>
        <label className="codex-import">选择文件<ThemeImport importFile={importFile}/></label>
      </div>
    </div>
    <Personalization {...{ runtime, state, act }}/>
    <h3>对话</h3>
    <div className="codex-setting-group"><HistorySizeSetting/></div>
    <div className="omd-appearance-actions"><ThemeActions {...{ runtime, state, act }}/></div>
    <p className="omd-appearance-help">外观设置自动保存到当前浏览器；名称和数值在离开输入框、按 Enter 或关闭设置时保存。</p>
  </section>;
}
