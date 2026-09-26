import React, { useState, useEffect } from 'react';
import { colorGroups, fontChoices, numberFields } from './advanced.mjs';
import { VersionInfo } from '../version-info.jsx';

function TextSetting({ label, value, placeholder, save }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label className="omd-appearance-row"><span>{label}</span><input aria-label={label} maxLength={60} value={draft} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={() => save(draft)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/></label>;
}
function NumberSetting({ label, value, min, max, step, save }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const commit = () => {
    if (draft === '') { save(undefined); return; }
    const number = Number(draft);
    if (!Number.isFinite(number)) { setDraft(value ?? ''); return; }
    const clamped = Math.round(Math.min(max, Math.max(min, number)) / step) * step;
    setDraft(clamped); save(clamped);
  };
  return <input type="number" aria-label={label} min={min} max={max} step={step} placeholder="主题" value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>;
}
export function AdvancedAppearance({ runtime, state, act }) {
  const config = state.advanced;
  const [mode, setMode] = useState(document.documentElement.dataset.appearance === 'dark' ? 'dark' : 'light');
  const [uploading, setUploading] = useState(false);
  const update = (section, key, value) => act(() => {
    const latest = runtime.getSnapshot().advanced;
    runtime.setAdvanced({ ...latest, [section]: { ...latest[section], [key]: value } });
  });
  const brand = (key, value) => update('brand', key, value);
  const reset = (section, key, label) => <button type="button" className="omd-custom-reset" aria-label={`恢复${label}`} disabled={config[section][key] === undefined} onClick={() => update(section, key, undefined)}>跟随主题</button>;
  const number = key => {
    const [label, min, max, step, unit] = numberFields[key];
    return <div className="omd-custom-row" key={key}><label>{label}<span className="omd-custom-number"><NumberSetting {...{ label, min, max, step }} value={config.common[key]} save={value => update('common', key, value)}/><small>{unit}</small></span></label>{reset('common', key, label)}</div>;
  };
  return <details className="omd-advanced">
    <summary>高级设置 <span>标识、标题与精细外观</span></summary>
    <div className="omd-advanced-body">
      <h3>Logo 与浏览器标题</h3>
      <p className="omd-appearance-help">独立于主题和下面的定制开关。选择 DSH 原样时，让原生标识或其他插件接管显示。</p>
      <label className="omd-appearance-row"><span>Logo 与名称</span><select aria-label="Logo 与名称" value={config.brand.logo} onChange={e => brand('logo', e.target.value)}><option value="theme">跟随 OMD 主题</option><option value="native">保留 DSH 原样</option><option value="omd">Oh My DSH</option><option value="custom">自定义标识</option></select></label>
      {config.brand.logo === 'custom' && <>
        <TextSetting label="显示名称" value={config.brand.name} placeholder="Oh My DSH" save={value => brand('name', value)}/>
        <label className="omd-appearance-row"><span>Logo 图片<small>本地 PNG、JPEG、WebP，最多 2 MB</small></span><input type="file" aria-label="Logo 图片" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setUploading(true); await act(() => runtime.uploadLogo(file)); setUploading(false); }}/></label>
        {config.brand.image && <div className="omd-custom-logo-preview"><img src={config.brand.image} alt="自定义 Logo 预览"/><button type="button" className="tx-button" onClick={() => brand('image', '')}>移除 Logo 图片</button></div>}
        <p className="omd-appearance-help">用于左上角、欢迎页及浏览器图标；未上传图片时使用 OMD 标识。图片只保存在本地。</p>
      </>}
      <label className="omd-appearance-row"><span>浏览器标题</span><select aria-label="浏览器标题" value={config.brand.title} onChange={e => brand('title', e.target.value)}><option value="omd">Oh My DSH</option><option value="native">保留 DSH 原样</option><option value="custom">自定义名称</option></select></label>
      {config.brand.title === 'custom' && <TextSetting label="标题名称" value={config.brand.titleText} placeholder="Oh My DSH" save={value => brand('titleText', value)}/>}
      <p className="omd-appearance-help">只修改产品名称，会话名称仍随当前会话更新。{config.brand.logo === 'native' && <>关于插件与更新 <VersionInfo/></>}</p>
      <h3>精细外观</h3>
      <label className="omd-appearance-row"><span>启用高级外观定制<small>未修改的项目跟随主题；关闭后保留设置</small></span><input type="checkbox" aria-label="启用高级外观定制" checked={config.enabled} onChange={e => act(() => runtime.setAdvanced({ ...runtime.getSnapshot().advanced, enabled: e.target.checked }))}/></label>
      {config.enabled && <>
        <label className="omd-appearance-row"><span>编辑配色模式<small>切换后可分别定制浅色与深色</small></span><select aria-label="编辑配色模式" value={mode} onChange={e => setMode(e.target.value)}><option value="light">浅色</option><option value="dark">深色</option></select></label>
        <p className="omd-appearance-help">修改即时保存。预览另一模式时，请切换上方“明暗模式”。壁纸仍由“自定义背景”控制，分区底色与面板不透明度共同决定壁纸效果。</p>
        {colorGroups.map(([title, fields]) => <details className="omd-custom-group" key={title} open><summary>{title}</summary><div className="omd-custom-grid">{Object.entries(fields).map(([key, label]) => <div className="omd-custom-row" key={key}><label>{label}<input type="color" title={config[mode][key] || '跟随主题，点选颜色以自定义'} aria-label={`${mode === 'light' ? '浅色' : '深色'}${label}`} value={config[mode][key] || '#808080'} data-inherited={config[mode][key] === undefined ? '' : undefined} onChange={e => update(mode, key, e.target.value)}/></label>{reset(mode, key, label)}</div>)}</div></details>)}
        <details className="omd-custom-group" open><summary>字体与排版</summary>
          {Object.entries({ 'font-ui': '界面字体', 'font-body': '正文字体', 'font-mono': '代码字体' }).map(([key, label]) => <label className="omd-appearance-row" key={key}><span>{label}</span><select aria-label={label} value={config.common[key] || ''} onChange={e => update('common', key, e.target.value || undefined)}><option value="">跟随主题</option>{Object.entries(fontChoices).map(([id, [name]]) => <option key={id} value={id}>{name}</option>)}</select></label>)}
          <div className="omd-custom-grid">{['font-size', 'body-size', 'code-size', 'line-height'].map(number)}</div>
        </details>
        <details className="omd-custom-group"><summary>圆角、边框与材质</summary><div className="omd-custom-grid">{['radius-control', 'radius-panel', 'radius-composer', 'radius-message', 'border-width', 'panel-blur'].map(number)}</div>
          <label className="omd-appearance-row"><span>面板阴影</span><select aria-label="面板阴影" value={config.common.shadow || ''} onChange={e => update('common', 'shadow', e.target.value || undefined)}><option value="">跟随主题</option><option value="none">无阴影</option><option value="soft">轻柔</option><option value="raised">明显</option></select></label>
        </details>
      </>}
      <div className="omd-appearance-actions"><button type="button" className="tx-button" onClick={() => act(() => runtime.resetAdvanced())}>恢复全部高级设置</button></div>
      <p className="omd-appearance-help">恢复会清除高级定制与自定义标识，保留主题、配色和壁纸。</p>
    </div>
  </details>;
}
