import { Button, Select, Switch } from '../native-controls.jsx';
import React from 'react';

export function ThemeSelect({ runtime, state, act }) {
  return <Select aria-label="主题" value={state.selected} onChange={e => { const value = e.target.value; act(() => runtime.select(value), true); }}>
    <option value="default">DSH 原生</option>{state.skins.map(s => <option key={s.id} value={s.id}>{s.name} · {s.version}</option>)}
  </Select>;
}

const appearanceLabels = { system: '跟随系统', light: '浅色', dark: '深色' };
export function AppearanceSelect({ runtime, act, systemLast = false }) {
  const modes = systemLast ? ['light', 'dark', 'system'] : ['system', 'light', 'dark'];
  return <Select aria-label="明暗模式" value={runtime.getAppearance()} onChange={e => act(() => runtime.setAppearance(e.target.value))}>
    {modes.map(mode => <option key={mode} value={mode}>{appearanceLabels[mode]}</option>)}
  </Select>;
}

export function EffectsToggle({ runtime, state, act, ...props }) {
  return <Switch {...props} label="降低透明与动态效果" checked={state.reduceEffects} onChange={value => act(() => runtime.reduceEffects(value))}/>;
}

export function ThemeImport({ importFile }) {
  return <input aria-label="导入主题" type="file" accept=".json,application/json" onChange={importFile}/>;
}

export function ThemeActions({ runtime, state, act, resetClass = 'tx-button', removeClass = 'tx-button' }) {
  const removable = state.selected !== 'default' && !state.skins.find(s => s.id === state.selected)?.builtin;
  return <><Button size="sm" variant="outline" type="button" className={resetClass} onClick={() => act(() => runtime.reset(), true)}>恢复 DSH 原生主题</Button>
    {removable && <Button size="sm" variant="outline" type="button" className={removeClass} onClick={() => act(() => runtime.remove(state.selected), true)}>移除当前主题</Button>}</>;
}
