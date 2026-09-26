import React from 'react';
import { Personalization } from '../personalization.jsx';
import { HistorySizeSetting } from '../../history-settings.jsx';

export function MaterialIcon({ name, size = 24, ...props }) {
  return <span {...props} className={'gm-symbol ' + (props.className || '')} style={{ fontSize: size }} aria-hidden="true">{name}</span>;
}

export function MaterialAppearance({ runtime, state, act, importFile, error }) {
  return <section className="gm-appearance omd-appearance">
    <header className="gm-page-heading"><h1>外观</h1><p>熟悉的 Google 设计，为你的工作留出空间。</p></header>
    <div className="gm-style-preview" aria-label="当前主题预览">
      <div className="gm-preview-sidebar"><MaterialIcon name="menu" size={20}/><span className="gm-preview-new"><MaterialIcon name="add" size={20}/></span><i/><i/><i/><MaterialIcon name="settings" size={20}/></div>
      <div className="gm-preview-page"><span className="gm-preview-brand">Oh My DSH</span><strong>从一个想法开始</strong><span className="gm-preview-composer"><MaterialIcon name="add" size={18}/><span>今天想完成什么？</span><MaterialIcon name="arrow_upward" size={18}/></span></div>
      <span className="gm-preview-caption">Material 3 Expressive</span>
    </div>
    <h2 className="gm-group-label">主题与显示</h2>
    <div className="gm-setting-group">
      <label className="omd-appearance-row gm-setting-row"><MaterialIcon name="palette"/><span><strong>主题</strong><small>选择整个工作台的外观</small></span><select aria-label="主题" value={state.selected} onChange={e => act(() => runtime.select(e.target.value))}><option value="default">OMD 默认</option>{state.skins.map(s => <option key={s.id} value={s.id}>{s.name} · {s.version}</option>)}</select></label>
      <label className="omd-appearance-row gm-setting-row"><MaterialIcon name="contrast"/><span><strong>明暗模式</strong><small>也可以跟随设备的设置</small></span><select aria-label="明暗模式" value={runtime.getAppearance()} onChange={e => act(() => runtime.setAppearance(e.target.value))}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
      <label className="omd-appearance-row gm-setting-row"><MaterialIcon name="motion_photos_off"/><span><strong>降低透明与动态效果</strong><small>使用更平静的界面过渡</small></span><input type="checkbox" role="switch" aria-label="降低透明与动态效果" checked={state.reduceEffects} onChange={e => act(() => runtime.reduceEffects(e.target.checked))}/></label>
    </div>
    <Personalization {...{ runtime, state, act }}/>
    <h2 className="gm-group-label">字体</h2>
    <div className="gm-type-specimen"><span className="gm-type-sample">Aa 字</span><div><strong>Google Sans Flex · Noto Sans SC</strong><p>清晰的中英文阅读体验</p><code>const idea = 'Hello, 世界';</code><small>Google Sans Code</small></div></div>
    <h2 className="gm-group-label">对话记录</h2>
    <div className="gm-setting-group gm-history"><HistorySizeSetting/></div>
    <h2 className="gm-group-label">管理主题</h2>
    <div className="gm-setting-group">
      <label className="omd-appearance-row gm-setting-row gm-import"><MaterialIcon name="file_upload"/><span><strong>导入主题</strong><small>选择 .omd-skin.json 文件</small></span><input aria-label="导入主题" type="file" accept=".json,application/json" onChange={importFile}/></label>
      <div className="omd-appearance-actions"><button type="button" className="gm-tonal-button" onClick={() => act(() => runtime.reset())}>恢复默认主题</button>{!state.skins.find(s => s.id === state.selected)?.builtin && <button type="button" className="gm-text-button" onClick={() => act(() => runtime.remove(state.selected))}>移除当前主题</button>}</div>
    </div>
    {(error || state.error) && <p className="gm-error" role="alert">{error || state.error}</p>}
  </section>;
}
