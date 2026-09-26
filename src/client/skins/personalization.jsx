import React from 'react';
import { AdvancedAppearance } from './advanced.jsx';

export function Personalization({ runtime, state, act }) {
  const bg = state.background;
  const source = state.palettes.find(p => p.id === (state.palette === 'theme' ? state.selected : state.palette));
  const groups = [...new Set(state.palettes.map(p => p.group))];
  const mode = document.documentElement.dataset.appearance || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const palette = source?.tokens[mode];
  const upload = event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (file) void act(() => runtime.background.upload(file));
  };
  const range = (key, label, min, max, unit, help) => <label className="omd-appearance-row">
    <span>{label}{help && <small>{help}</small>}</span>
    <span className="omd-background-control"><input type="range" aria-label={label} min={min} max={max} step="1" value={bg[key]} onChange={e => act(() => runtime.background.update({ [key]: Number(e.target.value) }))}/><output>{bg[key]}{unit}</output></span>
  </label>;
  return <div className="omd-personalization">
    <label className="omd-appearance-row"><span>配色<small>{state.palettes.length} 套配色，保留主题布局与材质</small></span>
      <select aria-label="配色" value={state.palette} onChange={e => act(() => runtime.selectPalette(e.target.value))}>
        <option value="theme">主题默认配色</option>
        {groups.map(group => <optgroup key={group} label={group}>{state.palettes.filter(p => p.group === group).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}
      </select>
    </label>
    {palette && <div className="omd-palette-swatches" aria-label="配色预览">{['bg', 'surface-solid', 'text', 'accent', 'selected'].map(key => <span key={key} style={{ backgroundColor: palette[key] }}/>)}</div>}
    <h3>自定义背景</h3>
    <label className="omd-appearance-row"><span>背景图片<small>PNG、JPEG、WebP，最多 15 MB</small></span><input aria-label="背景图片" type="file" accept="image/png,image/jpeg,image/webp" disabled={bg.loading} onChange={upload}/></label>
    {bg.loading && <p role="status">正在处理背景图片…</p>}
    {bg.url && <>
      <img className="omd-background-preview" src={bg.url} alt="自定义背景预览"/>
      <p className="omd-appearance-help omd-background-name">{bg.name}</p>
      <label className="omd-appearance-row"><span>背景显示区域</span><select aria-label="背景显示区域" value={bg.scope} onChange={e => act(() => runtime.background.update({ scope: e.target.value }))}><option value="all">整个界面</option><option value="conversation">仅会话区</option><option value="sidebar">仅左侧栏</option></select></label>
      <label className="omd-appearance-row"><span>图片显示</span><select aria-label="图片显示" value={bg.fit} onChange={e => act(() => runtime.background.update({ fit: e.target.value }))}><option value="cover">填满背景</option><option value="contain">完整显示</option></select></label>
      {range('blur', '背景模糊', 0, 30, 'px')}
      {range('shade', '背景明暗', -80, 80, '%', '负值压暗，正值提亮')}
      {range('opacity', '面板不透明度', 20, 100, '%', '越低壁纸越明显；100% 时面板遮住壁纸，文字不受影响')}
      <button type="button" className="tx-button" onClick={() => act(() => runtime.background.clear())}>恢复默认背景</button>
      {state.reduceEffects && <p className="omd-appearance-help">已开启“降低透明与动态效果”，背景暂不显示，图片与设置仍保留。</p>}
    </>}
    <p className="omd-appearance-help">图片仅保存在当前浏览器，不上传、不发送给模型；切换主题不会清除配色或背景。</p>
    {bg.error && <p role="alert">{bg.error}</p>}
    <AdvancedAppearance {...{ runtime, state, act }}/>
  </div>;
}
